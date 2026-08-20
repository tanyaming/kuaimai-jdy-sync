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
import { fetchAftersaleByTid, fetchOrderByTid, KuaimaiAftersale } from './lib/kuaimai';
import { findRefundedOrdersWithoutAmount, updateRefundAmount, updateOne } from './lib/jiyun';

// 定时执行间隔（毫秒）：30 分钟
const REFUND_INTERVAL_MS = 30 * 60 * 1000;
// 每轮最多处理的订单数（防止一轮跑太久）。0 = 不限制，捞全所有待补订单。
// findRefundedOrdersWithoutAmount 内部已用 skip 翻页捞全 SUCCESS 空金额订单，
// 这里 BATCH_LIMIT 仅为保护上限（传 0 表示全量处理，用于 --once 首次补录）。
const BATCH_LIMIT = 0;

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
 * 按照平台拿到该商品的实际退款金额，写回 tuikuanjine；
 * 若判定为「假退款」（refund_status 被误标 SUCCESS，实际未退款），则把 refund_status 改回 NO_REFUND。
 *
 * 平台差异（关键）：
 *  - 抖音/快手/视频号/京东：售后单接口 erp.aftersale.list.query 按 tid 可精确查到 refundMoney。
 *  - 小红书：售后单接口查不到（tid/oid/id/sid 全部命中不了），退款金额只能取订单接口的
 *    orders[].suits[].discountFee（负数，如 -19.8 表示实际退 19.8 元）。
 *  - 脏数据：订单接口 refundStatus=NO_REFUND 或顶层 isRefund=0，说明实际未退款，应改 refund_status。
 */
async function processOneRefund(
  row: { _id: string; tid: string; num_iid: string; sku_id: string; source: string; status: string },
): Promise<'updated' | 'set_norefund' | 'skipped' | 'failed'> {
  const { _id, tid, num_iid, sku_id, source } = row;
  if (!tid) return 'skipped';

  try {
    // 一、小红书：退款金额只从订单接口 suits[].discountFee 取
    if (source === '小红书') {
      const order = await fetchOrderByTid(tid);
      if (!order || !order.orders || !order.orders.length) return 'skipped';
      const sub = order.orders[0];
      const suit = sub.suits && sub.suits.length ? sub.suits[0] : null;
      const df = suit ? suit.discountFee : null;
      const dfNum = df === null || df === undefined || df === '' ? 0 : Number(df);
      if (dfNum < 0) {
        // 真退款：discountFee 为负数，退款金额 = 绝对值
        await updateRefundAmount(_id, Math.abs(dfNum));
        return 'updated';
      }
      // 无负 discountFee → 未退款（或退款又取消），refund_status 是脏数据
      await updateOne(_id, { refund_status: 'NO_REFUND' });
      return 'set_norefund';
    }

    // 二、其他平台：售后单接口按 tid 查退款金额
    const aftersales = await fetchAftersaleByTid(tid);
    const refundRecords = aftersales.filter((a) => a.onlineStatusText === '退款成功' || a.onlineStatus === 7);
    if (refundRecords.length > 0) {
      const target = refundRecords[0];
      const refundMoney = extractRefundForItem(target, num_iid, sku_id);
      if (refundMoney > 0) {
        await updateRefundAmount(_id, refundMoney);
        return 'updated';
      }
      return 'skipped'; // 有售后单但金额为 0（极少见）
    }

    // 三、无售后单 → 用订单接口判定是否「假退款」脏数据
    const order = await fetchOrderByTid(tid);
    const rs = order && order.orders && order.orders[0] ? order.orders[0].refundStatus : undefined;
    const isRefund = order ? order.isRefund : undefined;
    if (rs === 'NO_REFUND' || isRefund === 0) {
      await updateOne(_id, { refund_status: 'NO_REFUND' });
      return 'set_norefund';
    }
    return 'skipped'; // 无售后单、订单也未明确 NO_REFUND，保留原样（需人工确认）
  } catch (err: any) {
    console.error(`  [写入失败] tid=${tid} dataId=${_id}: ${err.message?.substring(0, 200)}`);
    return 'failed';
  }
}

async function runOnce(): Promise<{ updated: number; set_norefund: number; skipped: number; failed: number; total: number }> {
  console.log('\n[退款补偿] 扫描简道云 refund_status=SUCCESS 且空金额的订单...');
  const rows = await findRefundedOrdersWithoutAmount(BATCH_LIMIT);
  console.log(`  待处理 ${rows.length} 条`);

  const agg = { updated: 0, set_norefund: 0, skipped: 0, failed: 0 };
  for (const row of rows) {
    const r = await processOneRefund(row);
    if (r === 'updated') agg.updated++;
    else if (r === 'set_norefund') agg.set_norefund++;
    else if (r === 'failed') agg.failed++;
    else agg.skipped++;
    await delay(WRITE_DELAY);
  }
  console.log(`[退款补偿完成] 补金额 ${agg.updated}, 改NO_REFUND ${agg.set_norefund}, 跳过 ${agg.skipped}, 失败 ${agg.failed}`);
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
