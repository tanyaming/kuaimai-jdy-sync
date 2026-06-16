/**
 * 快麦ERP → 简道云 子订单同步
 *
 * 用法:
 *   tsx src/sync.ts          # 定时模式（每5分钟，从游标续跑）
 *   tsx src/sync.ts --once   # 单次：从游标到当前
 *   tsx src/sync.ts --full   # 全量：回溯一年
 */

import { checkConfig, PAGE_SIZE, WRITE_DELAY, INTERVAL_MS, OVERLAP_MS } from './lib/config';
import { fetchAllOrders, KuaimaiOrder, KuaimaiOrderItem } from './lib/kuaimai';
import { batchFindByOids, createOne, updateOne } from './lib/jiyun';
import { loadCursor, saveCursor } from './lib/cursor';
import { mapItemToJiyun } from './lib/mapping';

function pad(n: number) { return String(n).padStart(2, '0'); }

function formatDatetime(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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
  const oidMap = new Map<string, { order: KuaimaiOrder; item: KuaimaiOrderItem }>();

  for (const order of orders) {
    for (const item of order.orders || []) {
      if (!item.oid) continue;
      const oid = String(item.oid);
      allOids.push(oid);
      oidMap.set(oid, { order, item });
    }
  }

  if (allOids.length === 0) return result;

  const existingMap = await batchFindByOids(allOids);
  console.log(`    查重: ${allOids.length} 个oid, 已存在 ${existingMap.size} 个`);

  for (const oid of allOids) {
    const { order, item } = oidMap.get(oid)!;
    const row = mapItemToJiyun(order, item);
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
  timeType: 'created' | 'upd_time',
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

async function sync(startTime: string, endTime: string): Promise<SyncResult> {
  const startWall = Date.now();
  console.log(`\n[同步] ${startTime} → ${endTime}`);

  // 第一趟：按创建时间拉新订单，只创建
  console.log('  ── 第一趟：拉新订单（只创建）──');
  const pass1 = await fetchAndProcess(startTime, endTime, 'created', 'create-only');

  // 第二趟：按更新时间拉状态变更，只更新
  console.log('  ── 第二趟：拉状态变更（只更新）──');
  const pass2 = await fetchAndProcess(startTime, endTime, 'upd_time', 'update-only');

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

  // 定时模式
  console.log(`  间隔: ${INTERVAL_MS / 60000} 分钟`);
  console.log(`  游标: ${formatDatetime(loadCursor())}`);
  console.log('  按 Ctrl+C 退出\n');

  let running = false;

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
