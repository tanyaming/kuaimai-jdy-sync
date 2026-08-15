#!/usr/bin/env node
/**
 * 拼多多 tid（平台订单号）补录脚本
 * 读取 extract_tid_map.py 生成的 pdd_tid_map.json（{ sid: tid }），
 * 按 sid 匹配简道云记录，更新 tid 字段。
 *
 * 用法（在服务器容器内）:
 *   node scripts/update_tid.js /app/pdd_tid_map.json
 *
 * 匹配键: sid（系统订单号，唯一）。一个 sid 可能对应简道云多行（多商品拆分），
 *         全部行都填同一个 tid。
 */
const axios = require('axios');
const fs = require('fs');

const API_KEY = process.env.JIYUN_API_KEY || 'OBJWjmqevyat2lGP8L41DGrPHJlNbtR19305844F94a8c4690C48e6455E885364';
const APP_ID = process.env.JIYUN_APP_ID || '6a16d22b6e77d7c680fe0b7f';
const ENTRY_ID = process.env.JIYUN_ORDER_ENTRY_ID || '6a2a93aff2f0de59304a26da';

const http = axios.create({
  baseURL: 'https://api.jiandaoyun.com',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 按 sid 列表查简道云，返回 sid -> [{_id, tid}]
async function findBySids(sids) {
  const map = new Map();
  for (let i = 0; i < sids.length; i += 100) {
    const chunk = sids.slice(i, i + 100);
    const resp = await http.post('/api/v5/app/entry/data/list', {
      app_id: APP_ID,
      entry_id: ENTRY_ID,
      limit: 100,
      fields: ['oid', 'sid', 'tid', '_id'],
      filter: { rel: 'and', cond: [{ field: 'sid', method: 'in', value: chunk }] },
    });
    for (const row of resp.data?.data || []) {
      // sid 是 16 位纯数字字符串，结尾可能含 0，绝不能 strip 掉末尾 0。
      const sid = String(row.sid == null ? '' : row.sid).trim();
      if (!sid) continue;
      if (!map.has(sid)) map.set(sid, []);
      map.get(sid).push(row);
    }
  }
  return map;
}

async function main() {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) {
    console.error('用法: node scripts/update_tid.js <pdd_tid_map.json>');
    process.exit(1);
  }
  const mapping = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const sids = Object.keys(mapping).filter((s) => mapping[s]); // 只补有 tid 的
  console.log(`待补录 sid 数: ${sids.length}`);

  const existing = await findBySids(sids);
  let updated = 0, missing = 0, failed = 0;

  for (const sid of sids) {
    const tid = mapping[sid];
    const rows = existing.get(sid);
    if (!rows || rows.length === 0) {
      missing++;
      console.log(`  [缺失] sid=${sid} 简道云无此记录`);
      continue;
    }
    for (const row of rows) {
      const dataId = row._id;
      try {
        await http.post('/api/v5/app/entry/data/update', {
          app_id: APP_ID,
          entry_id: ENTRY_ID,
          data_id: dataId,
          data: { tid: { value: tid } },
        });
        updated++;
      } catch (e) {
        failed++;
        const detail = e.response?.data ? JSON.stringify(e.response.data).substring(0, 200) : e.message;
        console.error(`  [失败] sid=${sid} _id=${dataId}: ${detail}`);
      }
      await sleep(150);
    }
  }

  console.log(`\n完成: 更新 ${updated} 行, 缺失 ${missing} sid, 失败 ${failed}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
