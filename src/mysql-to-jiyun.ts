/**
 * 远程 MySQL → 简道云 订单明细同步
 *
 * 策略：
 *   - 读取 kuaimai_order_item 中 jiyun_data_id IS NULL 的记录（未同步）
 *   - 关联 kuaimai_order 补充主单字段
 *   - 逐条写入简道云，写入成功后回填 jiyun_data_id + jiyun_synced_at
 *   - 批量大小可配置，每条写入间隔 300ms（简道云默认限流 200次/分钟）
 *
 * 用法:
 *   npx tsx src/mysql-to-jiyun.ts          # 定时模式（每5分钟）
 *   npx tsx src/mysql-to-jiyun.ts --once   # 单次执行
 */

import dotenv from 'dotenv';
import path from 'path';
import axios, { AxiosInstance } from 'axios';
import mysql from 'mysql2/promise';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// ── 配置 ──────────────────────────────────────────────
const DB_HOST     = process.env.DB_HOST     || '8.137.123.168';
const DB_PORT     = parseInt(process.env.DB_PORT || '3306', 10);
const DB_USER     = process.env.DB_USER     || 'mysqlroot';
const DB_PASSWORD = process.env.DB_PASSWORD || 'Htjc2025a';
const DB_NAME     = process.env.DB_NAME     || 'kedouData';

const JIYUN_API_KEY    = process.env.JIYUN_API_KEY    || 'OBJWjmqevyat2lGP8L41DGrPHJlNbtR19305844F94a8c4690C48e6455E885364';
const JIYUN_BASE_URL   = process.env.JIYUN_BASE_URL   || 'https://api.jiandaoyun.com';
const JIYUN_APP_ID     = process.env.JIYUN_APP_ID     || '6a16d22b6e77d7c680fe0b7f';
const JIYUN_ENTRY_ID   = process.env.JIYUN_ORDER_ENTRY_ID || '6a2a93aff2f0de59304a26da';



const BATCH_SIZE    = 50;     // 每批读取条数
const WRITE_DELAY   = 350;    // 写入间隔 ms（约 170次/分钟，低于限流阈值）
const INTERVAL_MS   = 5 * 60 * 1000;

// ── 工具 ──────────────────────────────────────────────
function pad(n: number) { return String(n).padStart(2, '0'); }

function formatDatetime(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── MySQL 连接池 ───────────────────────────────────────
let pool: mysql.Pool | null = null;

function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: DB_HOST, port: DB_PORT,
      user: DB_USER, password: DB_PASSWORD,
      database: DB_NAME,
      charset: 'utf8mb4',
      waitForConnections: true,
      connectionLimit: 3,
      connectTimeout: 10000,
    });
  }
  return pool;
}

async function closePool() {
  if (pool) { await pool.end(); pool = null; }
}

async function runMigration(): Promise<void> {
  const p = getPool();
  // 兼容旧版 MySQL，不使用 IF NOT EXISTS
  try {
    await p.query(
      `ALTER TABLE kuaimai_order_item ADD COLUMN jiyun_data_id VARCHAR(64) DEFAULT NULL COMMENT '简道云数据ID'`
    );
  } catch (err: any) {
    // 字段已存在则忽略（MySQL 错误码 1060）
    if (err.code !== 'ER_DUP_FIELDNAME' && err.errno !== 1060) throw err;
  }
  try {
    await p.query(
      `ALTER TABLE kuaimai_order_item ADD COLUMN jiyun_synced_at DATETIME DEFAULT NULL COMMENT '同步到简道云的时间'`
    );
  } catch (err: any) {
    if (err.code !== 'ER_DUP_FIELDNAME' && err.errno !== 1060) throw err;
  }
}

// ── 简道云 HTTP 客户端 ─────────────────────────────────
const jiyunHttp: AxiosInstance = axios.create({
  baseURL: JIYUN_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${JIYUN_API_KEY}`,
  },
});

async function jiyunFindByOid(oid: string): Promise<string | null> {
  const url = `/api/v4/app/${JIYUN_APP_ID}/entry/${JIYUN_ENTRY_ID}/data_list`;
  try {
    const resp = await jiyunHttp.post(url, {
      limit: 1,
      filter: {
        rel: 'and',
        cond: [{ field: 'oid', method: 'eq', value: oid }],
      },
    });
    const body = resp.data as { data?: any[] };
    if (body.data && body.data.length > 0) {
      return body.data[0]._id;
    }
    return null;
  } catch {
    return null; // 查询失败就当不存在，走创建逻辑
  }
}

async function jiyunCreate(data: Record<string, unknown>): Promise<string> {
  const fieldData: Record<string, { value: unknown }> = {};
  for (const [k, v] of Object.entries(data)) {
    fieldData[k] = { value: v === null || v === undefined ? '' : v };
  }

  const url = `/api/v4/app/${JIYUN_APP_ID}/entry/${JIYUN_ENTRY_ID}/data_create`;
  let resp;
  try {
    resp = await jiyunHttp.post(url, { data: fieldData });
  } catch (err: any) {
    const status = err.response?.status;
    const body = JSON.stringify(err.response?.data).substring(0, 300);
    throw new Error(`HTTP ${status}: ${body}`);
  }
  const body = resp.data as { code?: number; msg?: string; data?: { _id: string } };

  // v4 API 成功时直接返回 data（无 code 字段），有 code 且有错误时才抛异常
  if (body.code !== undefined && body.code !== 0 && body.code !== 200) {
    throw new Error(`简道云写入失败 [${body.code}]: ${body.msg}`);
  }
  const dataId = body.data?._id;
  if (!dataId) throw new Error('简道云未返回 _id');
  return dataId;
}

// ── 数据读取 ──────────────────────────────────────────
interface ItemRow {
  oid: string;
  tid: string;
  sid: string;
  num_iid: string;
  source: string;
  outer_sku_id: string;
  sku_id: string;
  title: string;
  sku_properties_name: string;
  num: number;
  price: number;
  total_fee: number;
  discount_fee: number;
  discount_rate: number;
  payment: number;
  divide_order_fee: number;
  cost: number;
  refund_status: string;
  status: string;
  unified_status: string;
  sys_status: string;
  author_id: string;
  author_name: string;
  pic_path: string;
  volume: number;
  net_weight: number;
  is_presell: number;
  is_virtual: number;
  is_cancel: number;
  pay_time: string | null;
  consign_time: string | null;
  end_time: string | null;
  created_at: string | null;
  upd_time: string | null;
  synced_at: string | null;
  jiyun_data_id: string | null;
  jiyun_synced_at: string | null;
  // 来自 kuaimai_order JOIN
  shop_name: string;
  shop_id: string;
  gross_profit: number;
  post_fee: number;
  out_sid: string;
  warehouse_name: string;
  receiver_state: string;
  receiver_city: string;
  receiver_district: string;
  is_refund: number;
}

async function fetchPendingItems(limit: number): Promise<ItemRow[]> {
  const p = getPool();
  const [rows] = await p.query<any[]>(
    `SELECT
       i.oid, i.tid, i.sid, i.num_iid, i.source,
       i.outer_sku_id, i.sku_id, i.title, i.sku_properties_name,
       i.num, i.price, i.total_fee, i.discount_fee, i.discount_rate,
       i.payment, i.divide_order_fee, i.cost,
       i.refund_status, i.status, i.unified_status, i.sys_status,
       i.author_id, i.author_name, i.pic_path,
       i.volume, i.net_weight, i.is_presell, i.is_virtual, i.is_cancel,
       i.pay_time, i.consign_time, i.end_time, i.created_at, i.upd_time,
       i.synced_at,
       o.shop_name, o.shop_id, o.gross_profit, o.post_fee,
       o.out_sid, o.warehouse_name,
       o.receiver_state, o.receiver_city, o.receiver_district,
       o.is_refund
     FROM kuaimai_order_item i
     LEFT JOIN kuaimai_order o ON i.tid = o.tid
     WHERE i.jiyun_data_id IS NULL
     ORDER BY i.created_at ASC
     LIMIT ?`,
    [limit]
  );
  return rows as ItemRow[];
}

async function markSynced(oid: string, dataId: string): Promise<void> {
  const p = getPool();
  await p.query(
    `UPDATE kuaimai_order_item
     SET jiyun_data_id = ?, jiyun_synced_at = NOW()
     WHERE oid = ?`,
    [dataId, oid]
  );
}

// 平台来源中文映射
const SOURCE_MAP: Record<string, string> = {
  fxg: '抖音电商',
  douyin: '抖音电商',
  taobao: '淘宝',
  tmall: '天猫',
  jd: '京东',
  pdd: '拼多多',
  kuaishou: '快手',
};

function toJiyunRow(item: ItemRow): Record<string, unknown> {
  return {
    tid: item.tid,
    oid: item.oid,
    sid: item.sid || '',
    num_iid: item.num_iid || '',
    source: SOURCE_MAP[item.source] || item.source,
    shop_name: item.shop_name || '',
    shop_id: item.shop_id || '',
    title: item.title || '',
    sku_properties_name: item.sku_properties_name || '',
    outer_sku_id: item.outer_sku_id || '',
    sku_id: item.sku_id || '',
    num: item.num,
    price: Number(item.price) || 0,
    total_fee: Number(item.total_fee) || 0,
    discount_fee: Number(item.discount_fee) || 0,
    discount_rate: Number(item.discount_rate) || 0,
    payment: Number(item.payment) || 0,
    divide_order_fee: Number(item.divide_order_fee) || 0,
    cost: Number(item.cost) || 0,
    refund_status: item.refund_status || '',
    status: item.status || '',
    unified_status: item.unified_status || '',
    sys_status: item.sys_status || '',
    author_id: item.author_id || '',
    author_name: item.author_name || '',
    pic_path: item.pic_path || '',
    volume: Number(item.volume) || 0,
    net_weight: Number(item.net_weight) || 0,
    is_presell: item.is_presell || 0,
    is_virtual: item.is_virtual || 0,
    is_cancel: item.is_cancel || 0,
    pay_time: item.pay_time || '',
    consign_time: item.consign_time || '',
    end_time: item.end_time || '',
    created_at: item.created_at || '',
    upd_time: item.upd_time || '',
    synced_at: formatDatetime(new Date()),
  };
}

// ── 主同步逻辑 ────────────────────────────────────────
async function sync(): Promise<void> {
  const startWall = Date.now();
  console.log(`\n[MySQL→简道云] 开始 ${formatDatetime(new Date())}`);

  let totalWritten = 0;
  let totalFailed = 0;
  let offset = 0;

  while (true) {
    const items = await fetchPendingItems(BATCH_SIZE);
    if (items.length === 0) break;

    console.log(`  本批 ${items.length} 条（已处理 ${offset}）`);

    for (const item of items) {
      try {
        // 1. 先在简道云中查重（按 oid）
        const existingId = await jiyunFindByOid(item.oid);
        if (existingId) {
          // 已存在，直接标记为已同步
          await markSynced(item.oid, existingId);
          totalWritten++;
          continue; // 不 delay，跳过即可
        }

        // 2. 不存在，写入简道云
        const row = toJiyunRow(item);
        const dataId = await jiyunCreate(row);
        await markSynced(item.oid, dataId);
        totalWritten++;
        await delay(WRITE_DELAY);
      } catch (err: any) {
        totalFailed++;
        console.error(`  [失败] oid=${item.oid} tid=${item.tid}: ${err.message?.substring(0, 200)}`);
        // 写失败不阻塞，继续下一条
        await delay(WRITE_DELAY);
      }
    }

    offset += items.length;

    // 如果这批不足 BATCH_SIZE，说明已处理完所有待同步记录
    if (items.length < BATCH_SIZE) break;
  }

  const elapsed = ((Date.now() - startWall) / 1000).toFixed(1);
  console.log(`[完成] 写入 ${totalWritten} 条, 失败 ${totalFailed} 条, 耗时 ${elapsed}s`);
}

// ── 入口 ──────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  await runMigration();

  if (args.includes('--once')) {
    await sync();
    await closePool();
    process.exit(0);
  }

  console.log(`[定时模式] 每 ${INTERVAL_MS / 60000} 分钟一次，Ctrl+C 退出`);

  let running = false;
  const tick = async () => {
    if (running) { console.log('[跳过] 上次同步未完成'); return; }
    running = true;
    try { await sync(); } catch (err: any) { console.error(`[错误] ${err.message}`); }
    finally { running = false; }
  };

  await tick();
  setInterval(tick, INTERVAL_MS);
}

main().catch(err => {
  console.error('[致命错误]', err);
  process.exit(1);
});
