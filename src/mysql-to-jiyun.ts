/**
 * 快麦ERP → 简道云 订单明细同步（无状态版）
 *
 * 架构：快麦 API → 简道云 API（纯直通，无本地数据库依赖）
 * 去重：每次写入前先在简道云按 oid 查重，已存在则跳过
 *
 * 用法:
 *   npx tsx src/mysql-to-jiyun.ts          # 定时模式（每5分钟增量）
 *   npx tsx src/mysql-to-jiyun.ts --once   # 单次执行（首次全量回溯1天）
 *   npx tsx src/mysql-to-jiyun.ts --full   # 全量同步（所有历史数据）
 */

import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import axios, { AxiosInstance } from 'axios';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// ── 快麦配置 ───────────────────────────────────────────
const KUAIMAI_APP_KEY    = process.env.KUAIMAI_APP_KEY    || '';
const KUAIMAI_APP_SECRET = process.env.KUAIMAI_APP_SECRET || '';
const KUAIMAI_ACCESS_TOKEN = process.env.KUAIMAI_ACCESS_TOKEN || '';
const KUAIMAI_BASE_URL   = process.env.KUAIMAI_BASE_URL   || 'https://gw.superboss.cc/router';
const KUAIMAI_METHOD      = 'erp.trade.list.query';

// ── 简道云配置 ─────────────────────────────────────────
const JIYUN_API_KEY  = process.env.JIYUN_API_KEY  || '';
const JIYUN_BASE_URL = process.env.JIYUN_BASE_URL || 'https://api.jiandaoyun.com';
const JIYUN_APP_ID   = process.env.JIYUN_APP_ID   || '';
const JIYUN_ENTRY_ID = process.env.JIYUN_ORDER_ENTRY_ID || '';

const BATCH_SIZE    = 50;
const PAGE_SIZE     = 20;     // 快麦API每页最大返回20条
const WRITE_DELAY   = 350;    // 写入间隔 ms
const INTERVAL_MS   = 5 * 60 * 1000;

// ── 工具 ──────────────────────────────────────────────
function pad(n: number) { return String(n).padStart(2, '0'); }
function formatDatetime(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }

// ── 快麦客户端 ────────────────────────────────────────
const kuaimaiHttp: AxiosInstance = axios.create({
  baseURL: KUAIMAI_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
});

/** 快麦签名算法: secret + 按key排序拼接参数 + secret → MD5(大写) */
function generateSign(params: Record<string, string>, secret: string): string {
  const sortedKeys = Object.keys(params).filter(k => k !== 'sign').sort();
  let concatStr = '';
  for (const key of sortedKeys) {
    const val = params[key];
    if (val !== undefined && val !== null && val !== '') {
      concatStr += key + val;
    }
  }
  const signStr = secret + concatStr + secret;
  return crypto.createHash('md5').update(signStr, 'utf8').digest('hex').toUpperCase();
}

interface KuaimaiOrderItem {
  oid: number;
  numIid?: string;
  outerSkuId?: string;
  skuId?: string;
  title?: string;
  skuPropertiesName?: string;
  num: number;
  price: number | string;
  totalFee: number | string;
  discountFee: number | string;
  discountRate?: number;
  payment: number | string;
  divideOrderFee: number | string;
  refundStatus?: string;
  picPath?: string;
  sysStatus?: string;
  unifiedStatus?: string;
  status?: string;
  authorId?: number;
  authorName?: string;
  volume?: number;
  netWeight?: number;
  isPresell?: number;
  isVirtual?: number;
  isCancel?: number;
  cost?: number;
  payTime?: number;
  consignTime?: number;
  endTime?: number;
  updTime?: number;
}

interface KuaimaiOrder {
  tid?: string;
  sid?: number;
  shopName?: string;
  shopId?: string;
  source?: string;
  unifiedStatus?: string;
  sysStatus?: string;
  status?: string;
  orders?: KuaimaiOrderItem[];
  // 主订单级别额外字段
  warehouseName?: string;
  outSid?: string;
  postFee?: string;
  grossProfit?: number;
  receiverState?: string;
  receiverCity?: string;
  receiverDistrict?: string;
  isRefund?: number;
  payTime?: number;
  consignTime?: number;
  updTime?: number;
  endTime?: number;
  created?: number;
}

async function kuaimaiRequest(bizParams: Record<string, string>): Promise<any> {
  const now = new Date();
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const params: Record<string, string> = {
    appKey: KUAIMAI_APP_KEY,
    method: KUAIMAI_METHOD,
    timestamp,
    version: '1.0',
    session: KUAIMAI_ACCESS_TOKEN,
    sign_method: 'md5',
    format: 'json',
    ...bizParams,
  };
  params.sign = generateSign(params, KUAIMAI_APP_SECRET);

  const resp = await kuaimaiHttp.post('', new URLSearchParams(params).toString());
  const data = resp.data;
  if (!data.success) {
    throw new Error(`快麦API错误 [${data.code}]: ${data.msg}`);
  }
  return data;
}

async function kuaimaiFetchOrders(
  startTime: string,
  endTime: string,
  page: number,
  pageSize: number,
): Promise<{ orders: KuaimaiOrder[]; total: number }> {
  const bizParams: Record<string, string> = {
    startTime,
    endTime,
    timeType: 'created',
    page_no: String(page),
    page_size: String(pageSize),
  };
  const result = await kuaimaiRequest(bizParams);
  return {
    orders: (result.list || []) as KuaimaiOrder[],
    total: (result.total || result.totalCount || 0) as number,
  };
}

// ── 简道云客户端 ──────────────────────────────────────
const jiyunHttp: AxiosInstance = axios.create({
  baseURL: JIYUN_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${JIYUN_API_KEY}`,
  },
});

/**
 * 批量查询简道云中已存在的 oid → _id 映射（v5 接口）
 */
async function jiyunBatchFindOids(oids: string[]): Promise<Map<string, string>> {
  const existing = new Map<string, string>();
  const chunkSize = 100; // v5 单次最多 100
  for (let i = 0; i < oids.length; i += chunkSize) {
    const chunk = oids.slice(i, i + chunkSize);
    try {
      const resp = await jiyunHttp.post('/api/v5/app/entry/data/list', {
        app_id: JIYUN_APP_ID,
        entry_id: JIYUN_ENTRY_ID,
        limit: chunk.length,
        fields: ['oid', '_id'],
        filter: {
          rel: 'and',
          cond: [{ field: 'oid', method: 'in', value: chunk }],
        },
      });
      const body = resp.data as { data?: Array<{ _id: string; oid: string }> };
      for (const row of body.data || []) {
        if (row.oid) existing.set(row.oid, row._id);
      }
    } catch {
      // 查询失败不阻塞
    }
  }
  return existing;
}

/** v5 单条更新 */
async function jiyunUpdate(dataId: string, data: Record<string, unknown>): Promise<string> {
  const fieldData: Record<string, { value: unknown }> = {};
  for (const [k, v] of Object.entries(data)) {
    fieldData[k] = { value: v === null || v === undefined ? '' : v };
  }
  let resp;
  try {
    resp = await jiyunHttp.post('/api/v5/app/entry/data/update', {
      app_id: JIYUN_APP_ID,
      entry_id: JIYUN_ENTRY_ID,
      data_id: dataId,
      data: fieldData,
    });
  } catch (err: any) {
    const status = err.response?.status;
    const detail = JSON.stringify(err.response?.data).substring(0, 400);
    throw new Error(`HTTP ${status}: ${detail}`);
  }
  const body = resp.data as { code?: number; msg?: string; data?: { _id: string } };
  if (body.code && body.code !== 200) {
    throw new Error(`简道云更新失败 [${body.code}]: ${body.msg}`);
  }
  return dataId;
}

/** v5 单条创建 */
async function jiyunCreate(data: Record<string, unknown>): Promise<string> {
  const fieldData: Record<string, { value: unknown }> = {};
  for (const [k, v] of Object.entries(data)) {
    fieldData[k] = { value: v === null || v === undefined ? '' : v };
  }
  const resp = await jiyunHttp.post('/api/v5/app/entry/data/create', {
    app_id: JIYUN_APP_ID,
    entry_id: JIYUN_ENTRY_ID,
    data: fieldData,
  });
  const body = resp.data as { data?: { _id: string } };
  const dataId = body.data?._id;
  if (!dataId) throw new Error('简道云未返回 _id');
  return dataId;
}

/** v5 批量创建，返回 oid → _id 映射 */
async function jiyunBatchCreate(
  rows: Array<{ oid: string; data: Record<string, unknown> }>,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (rows.length === 0) return result;

  const dataList = rows.map(r => {
    const fieldData: Record<string, { value: unknown }> = {};
    for (const [k, v] of Object.entries(r.data)) {
      fieldData[k] = { value: v === null || v === undefined ? '' : v };
    }
    return fieldData;
  });

  try {
    const resp = await jiyunHttp.post('/api/v5/app/entry/data/batch_create', {
      app_id: JIYUN_APP_ID,
      entry_id: JIYUN_ENTRY_ID,
      data_list: dataList,
    });
    const body = resp.data as { status?: string; success_ids?: string[] };
    if (body.success_ids && body.success_ids.length === rows.length) {
      for (let i = 0; i < rows.length; i++) {
        result.set(rows[i].oid, body.success_ids[i]);
      }
    }
  } catch {
    // 批量失败时降级逐条处理
  }
  return result;
}

// ── 平台来源中文映射 ──────────────────────────────────
const SOURCE_MAP: Record<string, string> = {
  fxg: '抖音电商', douyin: '抖音电商',
  taobao: '淘宝', tmall: '天猫',
  jd: '京东', pdd: '拼多多', kuaishou: '快手',
};

// ── 字段映射 ──────────────────────────────────────────
/** 毫秒时间戳 → ISO 时间字符串，过滤非法值（快麦用 946656000000 表示空） */
function msToIso(ms: number | undefined): string {
  if (!ms || ms <= 0 || ms === 946656000000) return '';
  return new Date(ms).toISOString();
}

function mapToJiyun(order: KuaimaiOrder, item: KuaimaiOrderItem): Record<string, unknown> {
  return {
    tid: order.tid || '',
    oid: String(item.oid || ''),
    sid: String(order.sid || ''),
    num_iid: item.numIid || '',
    source: SOURCE_MAP[order.source || ''] || order.source || '',
    shop_name: order.shopName || '',
    shop_id: '',  // 快麦 API 不返回 shopId，置空
    title: item.title || '',
    sku_properties_name: item.skuPropertiesName || '',
    outer_sku_id: item.outerSkuId || '',
    sku_id: item.skuId || '',
    num: item.num || 0,
    price: Number(item.price) || 0,
    total_fee: Number(item.totalFee) || 0,
    discount_fee: Number(item.discountFee) || 0,
    discount_rate: Number(item.discountRate) || 0,
    payment: Number(item.payment) || 0,
    divide_order_fee: Number(item.divideOrderFee) || 0,
    cost: item.cost || 0,
    refund_status: item.refundStatus || '',
    status: item.status || order.status || '',
    unified_status: item.unifiedStatus || order.unifiedStatus || '',
    sys_status: item.sysStatus || order.sysStatus || '',
    author_id: String(item.authorId || ''),
    author_name: item.authorName || '',
    pic_path: item.picPath || '',
    volume: item.volume || 0,
    net_weight: item.netWeight || 0,
    is_presell: item.isPresell || 0,
    is_virtual: item.isVirtual || 0,
    is_cancel: item.isCancel || 0,
    pay_time: msToIso(item.payTime) || msToIso(order.payTime),
    consign_time: msToIso(item.consignTime) || msToIso(order.consignTime),
    end_time: msToIso(item.endTime) || msToIso(order.endTime),
    created_at: msToIso(order.created),
    upd_time: msToIso(item.updTime) || msToIso(order.updTime),
    synced_at: formatDatetime(new Date()),
  };
}

// ── 主同步逻辑 ────────────────────────────────────────
async function sync(startTime: string, endTime: string): Promise<{ written: number; updated: number; failed: number }> {
  const startWall = Date.now();
  console.log(`\n[快麦→简道云] ${startTime} → ${endTime}`);

  let written = 0;
  let updated = 0;
  let failed = 0;
  let page = 1;
  let totalOrders = 0;

  while (true) {
    const { orders, total } = await kuaimaiFetchOrders(startTime, endTime, page, PAGE_SIZE);
    if (orders.length === 0) break;

    totalOrders = total;
    console.log(`  第${page}页: ${orders.length} 个订单（累计: 新增${written} 更新${updated} 失败${failed}）`);

    // 1. 收集所有子订单 oid
    const allOids: string[] = [];
    const oidToOrderItem: Map<string, { order: KuaimaiOrder; item: KuaimaiOrderItem }> = new Map();
    for (const order of orders) {
      for (const item of order.orders || []) {
        if (!item.oid) continue;
        const oidStr = String(item.oid);
        allOids.push(oidStr);
        oidToOrderItem.set(oidStr, { order, item });
      }
    }

    if (allOids.length === 0) { page++; continue; }

    // 2. 批量查询已存在的 oid → _id
    const existingMap = await jiyunBatchFindOids(allOids);

    // 3. 分离：需要更新的（已存在）和需要创建的（新记录）
    const toUpdate: Array<{ oid: string; dataId: string; data: Record<string, unknown> }> = [];
    const toCreate: Array<{ oid: string; data: Record<string, unknown> }> = [];

    for (const oid of allOids) {
      const { order, item } = oidToOrderItem.get(oid)!;
      const row = mapToJiyun(order, item);
      const existingId = existingMap.get(oid);
      if (existingId) {
        toUpdate.push({ oid, dataId: existingId, data: row });
      } else {
        toCreate.push({ oid, data: row });
      }
    }

    // 4. 批量创建新数据
    if (toCreate.length > 0) {
      const batchResult = await jiyunBatchCreate(toCreate);
      for (const item of toCreate) {
        if (batchResult.has(item.oid)) {
          written++;
        } else {
          // 批量失败回退逐条创建
          try {
            await jiyunCreate(item.data);
            written++;
          } catch (err: any) {
            failed++;
            console.error(`  [创建失败] oid=${item.oid}: ${err.message?.substring(0, 200)}`);
          }
          await delay(WRITE_DELAY);
        }
      }
    }

    // 5. 逐条更新已存在数据
    for (const item of toUpdate) {
      try {
        await jiyunUpdate(item.dataId, item.data);
        updated++;
      } catch (err: any) {
        failed++;
        console.error(`  [更新失败] oid=${item.oid}: ${err.message?.substring(0, 200)}`);
      }
      await delay(WRITE_DELAY);
    }

    page++;

    // 当拉取条数 >= total 或本页为空时停止
    if (orders.length === 0) break;
    if (page * PAGE_SIZE >= total) break;
  }

  const elapsed = ((Date.now() - startWall) / 1000).toFixed(1);
  console.log(`[完成] 新增 ${written}, 更新 ${updated}, 失败 ${failed}, 耗时 ${elapsed}s`);
  return { written, updated, failed };
}

// ── 入口 ──────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  const now = new Date();
  const endTime = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  let startTime: string;

  if (args.includes('--full')) {
    // 全量：回溯到一年前
    const yearAgo = new Date(now);
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    startTime = `${yearAgo.getFullYear()}-${pad(yearAgo.getMonth()+1)}-${pad(yearAgo.getDate())} 00:00:00`;
  } else if (args.includes('--once')) {
    // 单次增量：回溯1天
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    startTime = `${yesterday.getFullYear()}-${pad(yesterday.getMonth()+1)}-${pad(yesterday.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  } else {
    // 定时模式：回溯5分钟
    const fiveMinAgo = new Date(now.getTime() - INTERVAL_MS);
    startTime = `${fiveMinAgo.getFullYear()}-${pad(fiveMinAgo.getMonth()+1)}-${pad(fiveMinAgo.getDate())} ${pad(fiveMinAgo.getHours())}:${pad(fiveMinAgo.getMinutes())}:${pad(fiveMinAgo.getSeconds())}`;
  }

  console.log('════════════════════════════════');
  console.log('  快麦ERP → 简道云 订单同步');
  console.log('════════════════════════════════');
  console.log(`  模式: ${args.includes('--full') ? '全量' : args.includes('--once') ? '单次' : '定时'}`);
  console.log(`  简道云 APP: ${JIYUN_APP_ID}`);
  console.log(`  简道云 表单: ${JIYUN_ENTRY_ID}`);
  console.log('');

  if (args.includes('--once') || args.includes('--full')) {
    await sync(startTime, endTime);
    process.exit(0);
  }

  console.log(`[定时模式] 每 ${INTERVAL_MS / 60000} 分钟一次，Ctrl+C 退出`);

  let running = false;
  const tick = async () => {
    if (running) { console.log('[跳过] 上次同步未完成'); return; }
    running = true;
    try {
      const t = new Date();
      const e = `${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
      const sDate = new Date(t.getTime() - INTERVAL_MS);
      const s = `${sDate.getFullYear()}-${pad(sDate.getMonth()+1)}-${pad(sDate.getDate())} ${pad(sDate.getHours())}:${pad(sDate.getMinutes())}:${pad(sDate.getSeconds())}`;
      await sync(s, e);
    } catch (err: any) { console.error(`[错误] ${err.message}`); }
    finally { running = false; }
  };

  await tick();
  setInterval(tick, INTERVAL_MS);
}

main().catch(err => {
  console.error('[致命错误]', err);
  process.exit(1);
});
