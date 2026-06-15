/**
 * 简道云重复数据清理脚本
 * 按 oid 去重，保留最新（updateTime 最大）的一条，删除其余
 *
 * 用法: npx tsx src/dedup-jiyun.ts
 */

import dotenv from 'dotenv';
import path from 'path';
import axios, { AxiosInstance } from 'axios';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const API_KEY    = process.env.JIYUN_API_KEY    || '';
const BASE_URL   = process.env.JIYUN_BASE_URL   || 'https://api.jiandaoyun.com';
const APP_ID     = process.env.JIYUN_APP_ID     || '';
const ENTRY_ID   = process.env.JIYUN_ORDER_ENTRY_ID || '';

const DELAY_MS = 350;

const client: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${API_KEY}`,
  },
});

async function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

interface JiyunRow {
  _id: string;
  oid: string;
  updateTime: string;
  [key: string]: unknown;
}

async function fetchAll(): Promise<JiyunRow[]> {
  const all: JiyunRow[] = [];
  const pageSize = 100;
  let hasMore = true;
  let offset = 0;

  while (hasMore) {
    const url = `/api/v4/app/${APP_ID}/entry/${ENTRY_ID}/data_list`;
    const resp = await client.post(url, {
      limit: pageSize,
      skip: offset,
    });
    const body = resp.data as { data?: JiyunRow[] };
    const rows = body.data || [];
    if (rows.length === 0) {
      hasMore = false;
    } else {
      all.push(...rows);
      offset += rows.length;
      console.log(`  已拉取 ${all.length} 条...`);
      if (rows.length < pageSize) hasMore = false;
    }
    await delay(200);
  }
  return all;
}

async function deleteRow(dataId: string): Promise<void> {
  const url = `/api/v4/app/${APP_ID}/entry/${ENTRY_ID}/data_delete/${dataId}`;
  await client.post(url);
}

async function main() {
  console.log('════════════════════════════════');
  console.log('  简道云重复数据清理');
  console.log('════════════════════════════════\n');

  // 1. 拉取所有数据
  console.log('拉取所有数据...');
  const allRows = await fetchAll();
  console.log(`共 ${allRows.length} 条记录`);

  // 2. 按 oid 分组，找出重复的
  const groups = new Map<string, JiyunRow[]>();
  for (const row of allRows) {
    const oid = (row.oid as string) || '';
    if (!oid) continue; // 跳过空 oid
    if (!groups.has(oid)) groups.set(oid, []);
    groups.get(oid)!.push(row);
  }

  const dupOids: string[] = [];
  for (const [oid, rows] of groups) {
    if (rows.length > 1) dupOids.push(oid);
  }

  console.log(`发现 ${dupOids.length} 个重复的 oid，共 ${dupOids.reduce((s, o) => s + (groups.get(o)?.length || 0) - 1, 0)} 条多余记录`);

  if (dupOids.length === 0) {
    console.log('✅ 没有重复数据');
    return;
  }

  // 3. 删除多余的（保留 updateTime 最新的）
  let deleted = 0;
  for (const oid of dupOids) {
    const rows = groups.get(oid)!;
    // 按 updateTime 降序排列
    rows.sort((a, b) => new Date(b.updateTime).getTime() - new Date(a.updateTime).getTime());
    const [keep, ...rest] = rows;

    for (const row of rest) {
      try {
        await deleteRow(row._id);
        deleted++;
        if (deleted % 10 === 0) console.log(`  已删除 ${deleted} 条...`);
        await delay(DELAY_MS);
      } catch (err: any) {
        console.error(`  [删除失败] oid=${oid} _id=${row._id}: ${err.message}`);
      }
    }
  }

  console.log(`\n✅ 清理完成：删除 ${deleted} 条重复记录，保留每个 oid 的最新一条`);
}

main().catch(err => {
  console.error('脚本异常:', err);
  process.exit(1);
});
