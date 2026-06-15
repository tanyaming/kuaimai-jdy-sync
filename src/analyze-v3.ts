/**
 * 全量拉取订单 + 跨平台分析（含快手）
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

function md5(s: string) { return crypto.createHash('md5').update(s, 'utf8').digest('hex').toUpperCase(); }
function pad(n: number) { return String(n).padStart(2, '0'); }

function sign(params: Record<string, string>) {
  const keys = Object.keys(params).filter(k => k !== 'sign').sort();
  let s = '';
  for (const k of keys) { const v = params[k]; if (v !== undefined && v !== null && v !== '') s += k + v; }
  return md5(APP_SECRET + s + APP_SECRET);
}

async function call(method: string, biz: Record<string, string> = {}) {
  const now = new Date();
  const ts = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const params: Record<string, string> = { appKey: APP_KEY, method, timestamp: ts, version: '1.0', session: ACCESS_TOKEN, sign_method: 'md5', format: 'json', ...biz };
  params.sign = sign(params);
  const r = await axios.post(API_URL, new URLSearchParams(params).toString(), { timeout: 15000, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, validateStatus: () => true });
  return typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
}

async function main() {
  const now = new Date();
  const startTime = '2026-06-01 00:00:00';
  const endTime = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} 23:59:59`;

  console.log('拉取全量订单...\n');

  const r1 = await call('erp.trade.list.query', { timeType: 'created', startTime, endTime, page_no: '1', page_size: '100' });
  const total = r1.total || r1.totalCount || 0;
  console.log(`总订单数: ${total}`);

  const all = [...(r1.list || [])];
  const totalPages = Math.min(Math.ceil(total / 100), 100);

  for (let p = 2; p <= totalPages; p++) {
    const r = await call('erp.trade.list.query', { timeType: 'created', startTime, endTime, page_no: String(p), page_size: '100' });
    if (r.list?.length) all.push(...r.list);
    if (!r.list?.length) break;
    if (p % 10 === 0) console.log(`  第${p}页, 累计 ${all.length} 条`);
    await new Promise(r => setTimeout(r, 150));
  }

  fs.writeFileSync('/tmp/kuaimai_all.json', JSON.stringify(all, null, 2));
  console.log(`\n已拉取 ${all.length} 条，保存到 /tmp/kuaimai_all.json\n`);

  // ===== 分析 =====
  console.log('═══════════════════════════════════');
  console.log('  跨平台商品关联分析');
  console.log('═══════════════════════════════════\n');

  // 1. 平台分布
  const srcCount = new Map<string, number>();
  const srcShops = new Map<string, Set<string>>();
  for (const o of all) {
    const s = o.source || 'unknown';
    srcCount.set(s, (srcCount.get(s) || 0) + 1);
    if (!srcShops.has(s)) srcShops.set(s, new Set());
    srcShops.get(s)!.add(o.shopName || '');
  }

  console.log('【平台分布】');
  for (const [source, count] of [...srcCount.entries()].sort((a,b) => b[1]-a[1])) {
    const shops = [...(srcShops.get(source) || [])];
    console.log(`  ${source}: ${count} 条 | 店铺: ${shops.join(', ')}`);
  }

  // 2. outerSkuId 跨平台分析
  const outerMap = new Map<string, { platforms: Set<string>; title: string; skuId: string }>();
  for (const o of all) {
    for (const item of (o.orders || [])) {
      const os = String(item.outerSkuId || '');
      if (!os) continue;
      if (!outerMap.has(os)) outerMap.set(os, { platforms: new Set(), title: item.title || '', skuId: String(item.skuId || '') });
      outerMap.get(os)!.platforms.add(o.source || 'unknown');
    }
  }

  const crossOuter: string[] = [];
  for (const [os, info] of outerMap) {
    if (info.platforms.size > 1) crossOuter.push(os);
  }

  console.log(`\n【跨平台 outerSkuId: ${crossOuter.length} 个】`);
  if (crossOuter.length > 0) {
    for (const os of crossOuter.slice(0, 15)) {
      const info = outerMap.get(os)!;
      console.log(`  outerSkuId: ${os}`);
      console.log(`    平台: ${[...info.platforms].join(', ')}`);
      console.log(`    skuId: ${info.skuId}  商品: ${info.title.substring(0, 50)}`);
    }
  } else {
    console.log('  ⚠️ 没有 outerSkuId 跨平台');

    // 显示各平台的 outerSkuId 示例
    console.log('\n  各平台 outerSkuId 示例:');
    for (const [source, shops] of srcShops) {
      console.log(`  [${source}]`);
      const seen = new Set<string>();
      let c = 0;
      for (const o of all) {
        if (o.source !== source) continue;
        for (const item of (o.orders || [])) {
          const os = String(item.outerSkuId || '');
          if (!seen.has(os) && c < 3 && os) { seen.add(os); c++;
            console.log(`    outerSkuId: ${os}  skuId: ${item.skuId}  title: ${(item.title||'').substring(0,50)}`); }
        }
      }
    }
  }

  // 3. skuId 跨平台分析
  const skuMap = new Map<string, { platforms: Set<string>; outers: Set<string>; title: string }>();
  for (const o of all) {
    for (const item of (o.orders || [])) {
      const sid = String(item.skuId || '');
      if (!sid) continue;
      if (!skuMap.has(sid)) skuMap.set(sid, { platforms: new Set(), outers: new Set(), title: item.title || '' });
      skuMap.get(sid)!.platforms.add(o.source || 'unknown');
      skuMap.get(sid)!.outers.add(item.outerSkuId || '');
    }
  }

  const crossSku: string[] = [];
  for (const [sid, info] of skuMap) {
    if (info.platforms.size > 1) crossSku.push(sid);
  }

  console.log(`\n【跨平台 skuId: ${crossSku.length} 个】`);
  if (crossSku.length > 0) {
    console.log('  ✅ 发现跨平台相同 skuId！说明快麦中已经做了商品关联映射：\n');
    for (const sid of crossSku.slice(0, 15)) {
      const info = skuMap.get(sid)!;
      console.log(`  skuId: ${sid}`);
      console.log(`    平台: ${[...info.platforms].join(', ')}`);
      console.log(`    outerSkuIds: ${[...info.outers].join(' | ')}`);
      console.log(`    商品: ${info.title.substring(0, 50)}`);
    }
  } else {
    console.log('  ⚠️ 没有 skuId 跨平台 — 可能不同平台的商品还没在快麦做关联映射');

    console.log('\n  各平台 skuId 示例:');
    for (const [source] of srcShops) {
      console.log(`  [${source}]`);
      const seen = new Set<string>();
      let c = 0;
      for (const o of all) {
        if (o.source !== source) continue;
        for (const item of (o.orders || [])) {
          const sid = String(item.skuId || '');
          if (!seen.has(sid) && c < 3 && sid) { seen.add(sid); c++;
            console.log(`    skuId: ${sid}  outerSkuId: ${item.outerSkuId}  title: ${(item.title||'').substring(0,50)}`); }
        }
      }
    }
  }

  console.log('\n═══════════════════════════════════════\n');
}

main().catch(console.error);
