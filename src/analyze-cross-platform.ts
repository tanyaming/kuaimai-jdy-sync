/**
 * 重新拉取订单数据 — 包含快手平台
 */
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const APP_KEY = '384147271';
const APP_SECRET = '79be46e6e543430baba45be833462274';
const ACCESS_TOKEN = 'b7314fbd278344d1bd52126e1c52adb4';
const API_URL = 'https://gw.superboss.cc/router';

function md5(str: string): string {
  return crypto.createHash('md5').update(str, 'utf8').digest('hex').toUpperCase();
}

function generateSign(params: Record<string, string>, secret: string): string {
  const sortedKeys = Object.keys(params).sort();
  let concatStr = '';
  for (const key of sortedKeys) {
    const val = params[key];
    if (val !== undefined && val !== null && val !== '') {
      concatStr += key + val;
    }
  }
  return md5(secret + concatStr + secret);
}

function pad(n: number) { return String(n).padStart(2, '0'); }

async function callApi(method: string, bizParams: Record<string, string> = {}) {
  const now = new Date();
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const params: Record<string, string> = {
    appKey: APP_KEY, method, timestamp, version: '1.0',
    session: ACCESS_TOKEN, sign_method: 'md5', format: 'json',
    ...bizParams,
  };
  params.sign = generateSign(params, APP_SECRET);
  const resp = await axios.post(API_URL, new URLSearchParams(params).toString(), {
    timeout: 15000,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    validateStatus: () => true,
  });
  return typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;
}

async function main() {
  const now = new Date();
  const startTime = '2026-06-01 00:00:00';
  const endTime = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} 23:59:59`;

  // 先查第一页
  const r1 = await callApi('erp.trade.list.query', {
    timeType: 'created',
    startTime,
    endTime,
    page_no: '1',
    page_size: '100',
  });

  const total = r1.total || r1.totalCount || 0;
  console.log(`总订单数: ${total}`);
  console.log(`第一页获取: ${r1.list?.length || 0} 条\n`);

  // 拉取全部页
  const allOrders = [...(r1.list || [])];
  const pageSize = 100;
  const totalPages = Math.ceil(Math.max(total, 900) / pageSize);

  for (let p = 2; p <= totalPages; p++) {
    const r = await callApi('erp.trade.list.query', {
      timeType: 'created', startTime, endTime,
      page_no: String(p), page_size: String(pageSize),
    });
    if (r.list && r.list.length > 0) {
      allOrders.push(...r.list);
    }
    console.log(`第${p}页: ${r.list?.length || 0} 条, 累计 ${allOrders.length}`);
    if ((r.list?.length || 0) === 0) break;
    await new Promise(r => setTimeout(r, 200));
  }

  fs.writeFileSync('/tmp/kuaimai_orders_full_v2.json', JSON.stringify(allOrders, null, 2), 'utf8');

  // ====== 分析跨平台同一商品 ======
  console.log('\n═══════════════════════════════════════');
  console.log('  跨平台商品关联分析');
  console.log('═══════════════════════════════════════\n');

  // 统计平台分布
  const sourceStats = new Map<string, number>();
  for (const order of allOrders) {
    const s = order.source || 'unknown';
    sourceStats.set(s, (sourceStats.get(s) || 0) + 1);
  }
  console.log('=== 平台分布 ===');
  for (const [source, count] of sourceStats) {
    console.log(`  ${source}: ${count} 条订单`);
  }

  // 按 outerSkuId 分组，看出现在哪些平台
  const outerSkuPlatforms = new Map<string, Set<string>>();
  for (const order of allOrders) {
    const source = order.source || 'unknown';
    for (const item of (order.orders || [])) {
      const outerSku = String(item.outerSkuId || '');
      if (!outerSku || outerSku === 'undefined') continue;
      if (!outerSkuPlatforms.has(outerSku)) {
        outerSkuPlatforms.set(outerSku, new Set());
      }
      outerSkuPlatforms.get(outerSku)!.add(source);
    }
  }

  // 找出跨平台的 outerSkuId
  const crossPlatformSkus: string[] = [];
  for (const [sku, platforms] of outerSkuPlatforms) {
    if (platforms.size > 1) {
      crossPlatformSkus.push(sku);
    }
  }

  console.log(`\n=== 跨平台 outerSkuId: ${crossPlatformSkus.length} 个 ===`);
  for (const sku of crossPlatformSkus.slice(0, 20)) {
    const platforms = outerSkuPlatforms.get(sku)!;
    console.log(`  outerSkuId: ${sku} → 平台: ${[...platforms].join(', ')}`);
  }

  // 按 skuId 分组，看出现在哪些平台
  const skuIdPlatforms = new Map<string, Set<string>>();
  for (const order of allOrders) {
    const source = order.source || 'unknown';
    for (const item of (order.orders || [])) {
      const skuId = String(item.skuId || '');
      if (!skuId || skuId === 'undefined') continue;
      if (!skuIdPlatforms.has(skuId)) {
        skuIdPlatforms.set(skuId, new Set());
      }
      skuIdPlatforms.get(skuId)!.add(source);
    }
  }

  const crossPlatformSkuIds: string[] = [];
  for (const [skuId, platforms] of skuIdPlatforms) {
    if (platforms.size > 1) {
      crossPlatformSkuIds.push(skuId);
    }
  }

  console.log(`\n=== 跨平台 skuId: ${crossPlatformSkuIds.length} 个 ===`);
  for (const skuId of crossPlatformSkuIds.slice(0, 20)) {
    const platforms = skuIdPlatforms.get(skuId)!;
    // 找到这个 skuId 对应的 outerSkuId 和商品名
    let title = '';
    let outerSku = '';
    for (const order of allOrders) {
      for (const item of (order.orders || [])) {
        if (String(item.skuId) === skuId) {
          title = item.title || '';
          outerSku = item.outerSkuId || '';
          break;
        }
      }
      if (title) break;
    }
    console.log(`  skuId: ${skuId} | outerSkuId: ${outerSku} | 商品: ${title.substring(0, 40)}`);
    console.log(`    → 平台: ${[...platforms].join(', ')}`);
  }

  // ====== 如果没有跨平台的，展示各平台 skuId 示例做对比 ======
  console.log('\n=== 各平台 skuId 示例（前3个） ===');
  for (const [source] of sourceStats) {
    console.log(`\n  [${source}]`);
    const seen = new Set<string>();
    let count = 0;
    for (const order of allOrders) {
      if (order.source !== source) continue;
      for (const item of (order.orders || [])) {
        const skuId = String(item.skuId || '');
        if (!seen.has(skuId) && count < 3) {
          seen.add(skuId);
          console.log(`    skuId: ${skuId}  outerSkuId: ${item.outerSkuId}  title: ${(item.title || '').substring(0, 50)}`);
          count++;
        }
      }
    }
  }
}

main().catch(console.error);
