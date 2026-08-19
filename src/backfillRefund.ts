/**
 * 退款金额补偿任务（独立入口）
 *
 * 用途：售后单（退款）是滞后的——订单先同步进简道云，用户可能几天后才退款。
 * 本任务周期扫描简道云中 refund_status=SUCCESS 但「实际退款金额(tuikuanjine)」为空的子订单，
 * 用「主订单号 tid」逐个查快麦售后单，再按 num_iid + sku_id 精确定位商品，
 * 把实际退款金额写回简道云的 tuikuanjine 字段。
 *
 * 为什么「逆向」驱动（从简道云找，而非遍历售后单）：
 *   - 快麦售后单接口的时间过滤（startTime/endTime/timeType）实测无效，只能拉全量（9317 条）或按 tid 精确查；
 *   - 简道云只同步了部分近期订单，全量售后单里大量历史订单在简道云不存在，正向遍历会大量 MISS 且极慢；
 *   - 逆向驱动：直接锁定简道云里「已退款但没补金额」的订单，每个用 tid 精确查售后单，一次一个准。
 *
 * 用法:
 *   tsx src/backfillRefund.ts --once      # 单次：处理当前所有 SUCCESS 且空金额的订单
 *   tsx src/backfillRefund.ts             # 定时模式：每 30 分钟跑一次
 */
import { config, checkConfig, WRITE_DELAY } from './lib/config';
import { fetchAftersaleByTid, KuaimaiAftersale } from './lib/kuaimai';
import { findRefundedOrdersWithoutAmount, updateRefundAmount } from './lib/jiyun';

// 定时执行间隔（毫秒）：30 分钟
const REFUND_INTERVAL_MS = 30 * 60 * 1000;
// 每轮最多处理的订单数（防止一轮跑太久）
// 注：退款补偿常驻服务每 30 分钟跑一轮，200 条/轮足够日常增量；
// 首次补数据或需要全量补录时，可临时调大或用 --once 反复跑。
const BATCH_LIMIT = 2000;

function pad(n: number) { return String(n).padStart(2, '0'); }

function formatDatetime(d: Date): string {
  const bj = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return `${bj.getUTCFullYear()}-${pad(bj.getUTCMonth() + 1)}-${pad(bj.getUTCDate())} ${pad(bj.getUTCHours())}:${pad(bj.getUTCMinutes())}:${pad(bj.getUTCSeconds())}`;
}

const _log = console.log;
const _error = console.error;
console.log = (...args: unknown[]) => _log(`[${formatDatetime(new Date())}]`, ...args);
console.error = (...args: unknown[]) => _error(`[${formatDatetime(new Date())}]`, ...args);

function delay(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function toNumber(v: unknown): number {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

/**
 * 从售后单列表中提取某商品(numIid+skuId)的退款金额。
 * 优先取 items 里精确匹配的商品级 refundMoney；匹配不到时用顶层 refundMoney 兜底。
 */
function extractRefundForItem(a: KuaimaiAftersale, numIid: string, skuId: string): number {
  const items = a.items || [];
  if (items.length > 0) {
    // 优先精确匹配 numIid + skuId
    let matched = items.find((it) => it.numIid === numIid && it.skuId === skuId);
    if (!matched && numIid) matched = items.find((it) => it.numIid === numIid);
    if (matched) {
      const v = toNumber(matched.refundMoney);
      if (v > 0) return v;
    }
  }
  // 兜底：顶层退款总额
  const top = toNumber(a.refundMoney);
  if (items.length === 1 && top > 0) return top;
  return top;
}

/**
 * 处理简道云中一条「已退款但空金额」的子订单：
 * 用 tid 查售后单，拿到该商品(numIid+skuId)的实际退款金额，写回 tuikuanjine。
 */
async function processOneRefund(
  row: { _id: string; tid: string; num_iid: string; sku_id: string },
): Promise<'updated' | 'skipped' | 'failed'> {
  const { _id, tid, num_iid, sku_id } = row;
  if (!tid) return 'skipped';

  const aftersales = await fetchAftersaleByTid(tid);
  if (!aftersales.length) return 'skipped'; // 无售后单（可能是 refund_status 脏数据）

  // 找「退款成功」的售后记录
  const refundRecords = aftersales.filter((a) => a.onlineStatusText === '退款成功' || a.onlineStatus === 7);
  const target = refundRecords.length > 0 ? refundRecords[0] : aftersales[0];

  const refundMoney = extractRefundForItem(target, num_iid, sku_id);
  if (refundMoney <= 0) return 'skipped';

  try {
    await updateRefundAmount(_id, refundMoney);
    return 'updated';
  } catch (err: any) {
    console.error(`  [写入失败] tid=${tid} dataId=${_id}: ${err.message?.substring(0, 200)}`);
    return 'failed';
  }
}

async function runOnce(): Promise<{ updated: number; skipped: number; failed: number; total: number }> {
  console.log('\n[退款补偿] 扫描简道云 refund_status=SUCCESS 且空金额的订单...');
  const rows = await findRefundedOrdersWithoutAmount(BATCH_LIMIT);
  console.log(`  待处理 ${rows.length} 条`);

  const agg = { updated: 0, skipped: 0, failed: 0 };
  for (const row of rows) {
    const r = await processOneRefund(row);
    if (r === 'updated') agg.updated++;
    else if (r === 'failed') agg.failed++;
    else agg.skipped++;
    await delay(WRITE_DELAY);
  }
  console.log(`[退款补偿完成] 更新 ${agg.updated}, 跳过 ${agg.skipped}, 失败 ${agg.failed}`);
  return { ...agg, total: rows.length };
}

async function main() {
  const args = process.argv.slice(2);
  const missing = checkConfig();
  if (missing.length > 0) {
    console.error(`缺少配置: ${missing.join(', ')}，请检查 .env 文件`);
    process.exit(1);
  }

  const mode = args.includes('--once') ? '单次' : '定时';
  console.log('════════════════════════════════');
  console.log('  快麦售后单 → 简道云 退款金额补偿');
  console.log('════════════════════════════════');
  console.log(`  模式: ${mode}`);

  if (args.includes('--once')) {
    await runOnce();
    process.exit(0);
  }

  // 定时模式：每 30 分钟跑一次
  console.log(`  间隔: ${REFUND_INTERVAL_MS / 60000} 分钟`);
  console.log('  按 Ctrl+C 退出\n');

  let running = false;
  const tick = async () => {
    if (running) {
      console.log('[跳过] 上次补偿未完成');
      return;
    }
    running = true;
    try {
      await runOnce();
    } catch (err: any) {
      console.error(`[错误] ${err.message}`);
    } finally {
      running = false;
    }
  };

  await tick();
  setInterval(tick, REFUND_INTERVAL_MS);
}

main().catch((err) => {
  console.error('[致命错误]', err);
  process.exit(1);
});
