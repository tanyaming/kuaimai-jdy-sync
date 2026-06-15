/**
 * 分析快麦数据中 skuId 和 outerSkuId 的跨平台关联能力
 */
import fs from 'fs';

const data = JSON.parse(fs.readFileSync('/tmp/kuaimai_orders_full.json', 'utf8'));

// 统计 skuId 出现频次、关联多少个不同的 outerSkuId
const skuIdMap = new Map<string, Set<string>>();
const outerSkuIdMap = new Map<string, Set<string>>();

for (const order of data) {
  const shop = order.shopName || 'unknown';
  const source = order.source || 'unknown';
  const subOrders = order.orders || [];

  for (const item of subOrders) {
    const skuId = String(item.skuId || '');
    const outerSkuId = String(item.outerSkuId || '');

    if (skuId) {
      if (!skuIdMap.has(skuId)) skuIdMap.set(skuId, new Set());
      skuIdMap.get(skuId)!.add(outerSkuId);
    }
    if (outerSkuId) {
      if (!outerSkuIdMap.has(outerSkuId)) outerSkuIdMap.set(outerSkuId, new Set());
      outerSkuIdMap.get(outerSkuId)!.add(source);
    }
  }
}

console.log('=== skuId → outerSkuId 的映射 ===');
console.log(`总共有 ${skuIdMap.size} 个不同的 skuId\n`);

// 找出一个 skuId 对应多个 outerSkuId 的情况
let multiOuterCount = 0;
for (const [skuId, outerSet] of skuIdMap) {
  if (outerSet.size > 1) {
    multiOuterCount++;
    if (multiOuterCount <= 10) {
      console.log(`skuId: ${skuId} → outerSkuIds: ${[...outerSet].join(', ')}`);
    }
  }
}
console.log(`\n一个 skuId 对应多个 outerSkuId 的: ${multiOuterCount} 个`);

// 反过来：outerSkuId 关联到的 source 分布
console.log('\n=== outerSkuId → 来源平台 的映射 ===');
console.log(`总共有 ${outerSkuIdMap.size} 个不同的 outerSkuId\n`);

let multiSourceCount = 0;
for (const [outerSkuId, sourceSet] of outerSkuIdMap) {
  if (sourceSet.size > 1) {
    multiSourceCount++;
    if (multiSourceCount <= 10) {
      console.log(`outerSkuId: ${outerSkuId} → sources: ${[...sourceSet].join(', ')}`);
    }
  }
}
console.log(`\n一个 outerSkuId 出现在多个平台的: ${multiSourceCount} 个`);

// 打印所有来源平台
const allSources = new Set<string>();
for (const order of data) {
  allSources.add(order.source || 'unknown');
}
console.log('\n=== 所有来源平台 ===');
console.log([...allSources]);

// 打印所有 outerSkuId 的前 20 个作为示例
console.log('\n=== outerSkuId 示例（前20个） ===');
const uniqueOuterSkus = [...outerSkuIdMap.keys()];
uniqueOuterSkus.slice(0, 20).forEach(sku => {
  const titles = new Set<string>();
  for (const order of data) {
    for (const item of (order.orders || [])) {
      if (item.outerSkuId === sku) titles.add(item.skuPropertiesName || '');
    }
  }
  console.log(`  ${sku}  →  ${[...titles].join(' | ')}`);
});
