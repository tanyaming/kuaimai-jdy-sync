/**
 * 历史漏单补偿脚本：用 created 维度全量补录指定日期范围的缺失订单。
 * 只创建简道云中不存在的订单（已有 oid 跳过），不重复写入。
 * 额外：对已存在的订单刷新金额(payment)等字段，修复 pay_time 缺失单的金额。
 *
 * 用法（容器内）: node /app/backfill.js 2026-08-01 2026-08-14
 */
const { fetchAllOrders } = require('./dist/lib/kuaimai.js');
const { batchFindByOids, createOne, updateOne } = require('./dist/lib/jiyun.js');
const { mapItemToJiyun } = require('./dist/lib/mapping.js');

function pad(n) { return String(n).padStart(2, '0'); }
function fmt(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const [, , startDay, endDay] = process.argv;
  if (!startDay || !endDay) {
    console.error('用法: node backfill.js <startDay> <endDay>  例: 2026-08-01 2026-08-14');
    process.exit(1);
  }

  const days = [];
  const cur = new Date(startDay + 'T00:00:00+08:00');
  const last = new Date(endDay + 'T00:00:00+08:00');
  while (cur <= last) {
    days.push(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`);
    cur.setDate(cur.getDate() + 1);
  }

  let totalWritten = 0, totalUpdated = 0, totalSkipped = 0;

  for (const day of days) {
    const s = new Date(day + 'T00:00:00+08:00');
    const e = new Date(day + 'T23:59:59+08:00');
    const orders = await fetchAllOrders(fmt(s), fmt(e), 'created');
    console.log(`\n=== ${day} created 维度拉取 ${orders.length} 单 ===`);

    // 收集所有 oid
    const allOids = [];
    const oidMap = new Map();
    for (const order of orders) {
      const isPdd = order.source === 'pdd';
      if (isPdd) {
        const firstItem = order.orders && order.orders[0];
        if (!firstItem) continue;
        const repItem = firstItem.suits && firstItem.suits.length > 0 ? { ...firstItem, ...firstItem.suits[0] } : firstItem;
        const oid = `${order.sid}_${firstItem.id || ''}`;
        allOids.push(oid);
        oidMap.set(oid, { order, item: repItem, isPddSuit: firstItem.suits && firstItem.suits.length > 0 });
        continue;
      }
      for (const item of order.orders || []) {
        const useItemId = order.source === 'xhs' || order.source === 'sys' || order.isSplitOrder;
        const itemId = item.id !== undefined && item.id !== null ? String(item.id) : '';
        const oid = useItemId ? (itemId || String(item.oid || '')) : String(item.oid || '');
        if (!oid) continue;
        allOids.push(oid);
        oidMap.set(oid, { order, item, isPddSuit: false });
      }
    }

    if (allOids.length === 0) continue;

    const existingMap = await batchFindByOids(allOids);
    console.log(`  共 ${allOids.length} 个oid, 已存在 ${existingMap.size} 个, 需补 ${allOids.length - existingMap.size} 个`);

    for (const oid of allOids) {
      const entry = oidMap.get(oid);
      const row = mapItemToJiyun(entry.order, entry.item, entry.isPddSuit);
      const existingId = existingMap.get(oid);
      try {
        if (existingId) {
          // 已存在：更新金额/状态（修复 pay_time 缺失单的金额）
          await updateOne(existingId, row);
          totalUpdated++;
        } else {
          await createOne(row);
          totalWritten++;
        }
      } catch (e) {
        console.error(`  [失败] oid=${oid}: ${e.message?.substring(0, 150)}`);
      }
      await sleep(120);
    }
  }

  console.log(`\n=== 补偿完成: 新增 ${totalWritten}, 更新 ${totalUpdated}, 已存在跳过 ${totalSkipped} ===`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
