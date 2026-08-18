/**
 * 快麦ERP → 简道云 子订单同步
 *
 * 用法:
 *   tsx src/sync.ts          # 定时模式（每5分钟，从游标续跑）
 *   tsx src/sync.ts --once   # 单次：从游标到当前
 *   tsx src/sync.ts --full   # 全量：回溯一年
 */

import { checkConfig, PAGE_SIZE, WRITE_DELAY, INTERVAL_MS, OVERLAP_MS } from './lib/config';
import { fetchAllOrders, refreshSession, KuaimaiOrder, KuaimaiOrderItem } from './lib/kuaimai';
import { batchFindByOids, createOne, updateOne } from './lib/jiyun';
import { loadCursor, saveCursor } from './lib/cursor';
import { loadBackfillCursor, saveBackfillCursor } from './lib/backfillCursor';
import { mapItemToJiyun } from './lib/mapping';

// 补偿回看窗口（小时）：快麦对「京东自营」等订单的 created 存在延迟回填（可能延迟数小时到次日），
// 增量 5 分钟窗口会错过这些单。补偿机制用 created 维度回看最近 N 小时补齐。
const BACKFILL_WINDOW_HOURS = 24;
// 补偿执行间隔（毫秒）：不必每轮都做全量回看，每 30 分钟跑一次即可。
const BACKFILL_INTERVAL_MS = 30 * 60 * 1000;

function pad(n: number) { return String(n).padStart(2, '0'); }

/**
 * 格式化为北京时间字符串（固定 UTC+8，不依赖容器时区）。
 * 快麦 API 的 startTime/endTime 按北京时间解析，容器若为 UTC 时区
 * 直接 getHours() 会偏差 8 小时，导致晚间订单漏拉。
 */
function formatDatetime(d: Date): string {
  const bj = new Date(d.getTime() + 8 * 60 * 60 * 1000); // 转 UTC+8
  return `${bj.getUTCFullYear()}-${pad(bj.getUTCMonth() + 1)}-${pad(bj.getUTCDate())} ${pad(bj.getUTCHours())}:${pad(bj.getUTCMinutes())}:${pad(bj.getUTCSeconds())}`;
}

const _log = console.log;
const _error = console.error;
console.log = (...args: any[]) => _log(`[${formatDatetime(new Date())}]`, ...args);
console.error = (...args: any[]) => _error(`[${formatDatetime(new Date())}]`, ...args);

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

interface SyncResult {
  written: number;
  updated: number;
  skipped: number;
  failed: number;
}

async function processPage(
  orders: KuaimaiOrder[],
  mode: 'create-only' | 'update-only',
): Promise<SyncResult> {
  const result: SyncResult = { written: 0, updated: 0, skipped: 0, failed: 0 };

  const allOids: string[] = [];
  const oidMap = new Map<string, { order: KuaimaiOrder; item: KuaimaiOrderItem; isPddSuit?: boolean }>();

  for (const order of orders) {
    const isPdd = order.source === 'pdd';
    if (isPdd) {
      // 拼多多：每个 sid 只生成一条记录（不展开 suits）。平台订单号 API 不返回，金额用主单公式。
      // 商品信息取第一个子单（若有 suits 则取首个 suit）作为代表。
      const firstItem = order.orders && order.orders[0];
      if (!firstItem) continue;
      const repItem = firstItem.suits && firstItem.suits.length > 0
        ? { ...firstItem, ...firstItem.suits[0] }
        : firstItem;
      // 关键：oid 去重键必须与 mapItemToJiyun 最终写入简道云的 oid 字段完全一致。
      // mapItemToJiyun 对拼多多用 `item.id`（此处 item 即 repItem，有 suits 时 id 已指向 suits[0].id），
      // 因此这里也必须用 repItem.id，而不能用 firstItem.id，否则查重键错位导致重复写入。
      const oid = `${order.sid}_${repItem.id || ''}`;
      allOids.push(oid);
      oidMap.set(oid, { order, item: repItem, isPddSuit: firstItem.suits && firstItem.suits.length > 0 });
      continue;
    }
    for (const item of order.orders || []) {
      // 去重键按平台区分：
      // - 抖音/京东/快手/视频号：子单 oid 本身是唯一子单ID，直接用
      // - 小红书/手动订单：oid 是商品ID或缺失/重复，必须用快麦子单 id（全局唯一流水号）
      // - 平台拆出的手工单(isSplitOrder)：source 已归父平台，但 item.oid 在拆单场景会重复，仍用子单 id
      const useItemId = order.source === 'xhs' || order.source === 'sys' || order.isSplitOrder;
      const itemId = item.id !== undefined && item.id !== null ? String(item.id) : '';
      const oid = useItemId
        ? (itemId || String(item.oid || ''))
        : String(item.oid || '');
      if (!oid) continue;
      allOids.push(oid);
      oidMap.set(oid, { order, item, isPddSuit: false });
    }
  }

  if (allOids.length === 0) return result;

  const existingMap = await batchFindByOids(allOids);
  console.log(`    查重: ${allOids.length} 个oid, 已存在 ${existingMap.size} 个`);

  for (const oid of allOids) {
    const entry = oidMap.get(oid)!;
    const row = mapItemToJiyun(entry.order, entry.item, entry.isPddSuit);
    const existingId = existingMap.get(oid);

    if (existingId) {
      if (mode === 'create-only') { result.skipped++; continue; }
      try {
        await updateOne(existingId, row);
        result.updated++;
      } catch (err: any) {
        result.failed++;
        console.error(`  [更新失败] oid=${oid}: ${err.message?.substring(0, 200)}`);
      }
    } else {
      if (mode === 'update-only') { result.skipped++; continue; }
      try {
        await createOne(row);
        result.written++;
      } catch (err: any) {
        result.failed++;
        console.error(`  [创建失败] oid=${oid}: ${err.message?.substring(0, 200)}`);
      }
    }
    await delay(WRITE_DELAY);
  }

  return result;
}

async function fetchAndProcess(
  startTime: string,
  endTime: string,
  timeType: 'created' | 'upd_time' | 'pay_time',
  mode: 'create-only' | 'update-only',
): Promise<SyncResult> {
  const total: SyncResult = { written: 0, updated: 0, skipped: 0, failed: 0 };

  const orders = await fetchAllOrders(startTime, endTime, timeType);
  if (orders.length === 0) return total;

  // 按 PAGE_SIZE 分批处理（查重 + 写入）
  for (let i = 0; i < orders.length; i += PAGE_SIZE) {
    const batch = orders.slice(i, i + PAGE_SIZE);
    const pageResult = await processPage(batch, mode);
    total.written += pageResult.written;
    total.updated += pageResult.updated;
    total.skipped += pageResult.skipped;
    total.failed += pageResult.failed;
    console.log(`  [${timeType}] 批次 ${Math.floor(i / PAGE_SIZE) + 1}: ${batch.length} 个订单 (新增${total.written} 更新${total.updated} 失败${total.failed})`);
  }

  return total;
}

/**
 * 补偿同步：用 created 维度回看，补齐快麦「延迟回填 created」导致的漏单。
 *
 * 窗口起点取「上次补偿游标」与「now - BACKFILL_WINDOW_HOURS」中更早的那个：
 *   - 首次启动（游标=0）或游标久远时，回看固定 BACKFILL_WINDOW_HOURS 小时，覆盖历史漏单；
 *   - 正常运行后，每次补偿窗口随游标滑动，避免反复全量重扫同一批订单。
 * 只创建不更新（create-only），已存在的订单通过查重（batchFindByOids 翻页查全）准确跳过，
 * 从根源上杜绝重复写入。
 */
async function backfillSync(since: Date): Promise<SyncResult> {
  const now = new Date();
  const floor = new Date(now.getTime() - BACKFILL_WINDOW_HOURS * 60 * 60 * 1000);
  // 窗口下界 = min(上次补偿游标, now - BACKFILL_WINDOW_HOURS)；顺便留 OVERLAP_MS 重叠防边界漏单
  const start = new Date(Math.min(since.getTime(), floor.getTime()) - OVERLAP_MS);
  console.log(`  ── 补偿回看：created（${formatDatetime(start)} → ${formatDatetime(now)}）──`);
  const total: SyncResult = { written: 0, updated: 0, skipped: 0, failed: 0 };

  const orders = await fetchAllOrders(formatDatetime(start), formatDatetime(now), 'created');
  if (orders.length === 0) {
    console.log('    补偿：无订单');
    return total;
  }

  for (let i = 0; i < orders.length; i += PAGE_SIZE) {
    const batch = orders.slice(i, i + PAGE_SIZE);
    const pageResult = await processPage(batch, 'create-only');
    total.written += pageResult.written;
    total.updated += pageResult.updated;
    total.skipped += pageResult.skipped;
    total.failed += pageResult.failed;
  }
  return total;
}

async function sync(startTime: string, endTime: string): Promise<SyncResult> {
  const startWall = Date.now();
  console.log(`\n[同步] ${startTime} → ${endTime}`);

  // 第一趟：按下单时间(created)拉新订单，只创建。
  // 为什么用 created 而不是 pay_time：
  //   - created 是所有订单必有、且下单即有的字段（已验证全部平台 created 都不缺失）；
  //   - pay_time 会缺失（视频号/抖音存在未付款或延迟回填的单子，payTime=2000-01-01），
  //     用 pay_time 做创建维度会永久漏掉这些单；
  //   - 快麦后台对账按「下单时间」统计，与 created 口径一致。
  // 使用当前实际时间作为 endTime，因为第一趟可能跑很久，期间有新订单产生
  console.log('  ── 第一趟：拉新订单（created，只创建）──');
  const pass1 = await fetchAndProcess(startTime, formatDatetime(new Date()), 'created', 'create-only');

  // 第二趟：按更新时间拉状态变更，只更新
  // 同样使用当前实际时间，确保覆盖第一趟期间新产生的更新
  console.log('  ── 第二趟：拉状态变更（只更新）──');
  const pass2 = await fetchAndProcess(startTime, formatDatetime(new Date()), 'upd_time', 'update-only');

  const result: SyncResult = {
    written: pass1.written + pass2.written,
    updated: pass1.updated + pass2.updated,
    skipped: pass1.skipped + pass2.skipped,
    failed: pass1.failed + pass2.failed,
  };

  const elapsed = ((Date.now() - startWall) / 1000).toFixed(1);
  console.log(`[完成] 新增 ${result.written}, 更新 ${result.updated}, 跳过 ${result.skipped}, 失败 ${result.failed}, 耗时 ${elapsed}s`);
  return result;
}

async function main() {
  const args = process.argv.slice(2);

  const missing = checkConfig();
  if (missing.length > 0) {
    console.error(`缺少配置: ${missing.join(', ')}，请检查 .env 文件`);
    process.exit(1);
  }

  const mode = args.includes('--full') ? '全量' : args.includes('--once') ? '单次' : '定时';

  console.log('════════════════════════════════');
  console.log('  快麦ERP → 简道云 子订单同步');
  console.log('════════════════════════════════');
  console.log(`  模式: ${mode}`);
  console.log('');

  if (args.includes('--full')) {
    const now = new Date();
    const yearAgo = new Date(now);
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    await sync(formatDatetime(yearAgo), formatDatetime(now));
    saveCursor(now);
    process.exit(0);
  }

  if (args.includes('--once')) {
    const cursor = loadCursor();
    const now = new Date();
    const startDate = new Date(cursor.getTime() - OVERLAP_MS);
    console.log(`  游标: ${formatDatetime(cursor)}`);
    const result = await sync(formatDatetime(startDate), formatDatetime(now));
    if (result.failed === 0) {
      saveCursor(now);
    } else {
      console.log(`  [警告] 有 ${result.failed} 条失败，游标不推进，下次重试`);
    }
    process.exit(0);
  }

  // ===== 快麦 Token 刷新（每天一次）=====
  const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 小时

  // 启动时刷新一次
  await refreshSession();

  // 每隔 24 小时刷新
  setInterval(() => {
    refreshSession().catch((err: any) => {
      console.error(`[快麦刷新] 定时刷新异常: ${err.message}`);
    });
  }, REFRESH_INTERVAL_MS);

  // 定时模式
  console.log(`  间隔: ${INTERVAL_MS / 60000} 分钟`);
  console.log(`  游标: ${formatDatetime(loadCursor())}`);
  console.log('  按 Ctrl+C 退出\n');

  let running = false;
  let lastBackfill = loadBackfillCursor();

  const tick = async () => {
    if (running) { console.log('[跳过] 上次同步未完成'); return; }
    running = true;
    try {
      const cursor = loadCursor();
      const now = new Date();
      const startDate = new Date(cursor.getTime() - OVERLAP_MS);
      const result = await sync(formatDatetime(startDate), formatDatetime(now));
      if (result.failed === 0) {
        saveCursor(now);
      } else {
        console.log(`  [警告] 本轮有 ${result.failed} 条失败，游标不推进，下轮重试`);
      }

      // 补偿回看：每 BACKFILL_INTERVAL_MS 执行一次，补齐 created 延迟回填导致的漏单
      if (Date.now() - lastBackfill.getTime() >= BACKFILL_INTERVAL_MS) {
        const bf = await backfillSync(lastBackfill);
        console.log(`  [补偿完成] 新增 ${bf.written}, 跳过 ${bf.skipped}, 失败 ${bf.failed}`);
        if (bf.failed === 0) {
          // 仅当补偿无失败时才推进补偿游标，避免失败导致后续漏补
          saveBackfillCursor(new Date());
          lastBackfill = new Date();
        } else {
          console.log(`  [警告] 补偿有 ${bf.failed} 条失败，补偿游标不推进，下轮重试`);
        }
      }
    } catch (err: any) {
      console.error(`[错误] ${err.message}`);
    } finally {
      running = false;
    }
  };

  await tick();
  setInterval(tick, INTERVAL_MS);
}

main().catch(err => {
  console.error('[致命错误]', err);
  process.exit(1);
});
