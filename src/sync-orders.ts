/**
 * 快麦订单 → 远程 MySQL 定时同步
 *
 * 策略：
 *   - 每 5 分钟拉取一次增量订单（按 upd_time 游标）
 *   - 时间窗口有 5 分钟重叠，防止漏单
 *   - 主单表用 tid UNIQUE，明细表用 oid UNIQUE，INSERT ON DUPLICATE KEY UPDATE
 *   - 首次运行拉取最近 1 天数据做初始同步
 */

import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import crypto from 'crypto';
import mysql from 'mysql2/promise';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// ── 配置 ──────────────────────────────────────────────
const DB_HOST = '8.137.123.168';
const DB_PORT = 3306;
const DB_USER = 'mysqlroot';
const DB_PASSWORD = 'Htjc2025a';
const DB_NAME = 'kedouData';

const APP_KEY = '384147271';
const APP_SECRET = '79be46e6e543430baba45be833462274';
const ACCESS_TOKEN = 'b7314fbd278344d1bd52126e1c52adb4';
const API_URL = 'https://gw.superboss.cc/router';

const PAGE_SIZE = 100;
const MAX_PAGES = 200;           // 单次最多拉 200 页，防无限循环
const OVERLAP_MINUTES = 5;       // 时间重叠窗口
const RATE_LIMIT_MS = 120;       // API 调用间隔

// ── 工具函数 ──────────────────────────────────────────
function md5(s: string) {
  return crypto.createHash('md5').update(s, 'utf8').digest('hex').toUpperCase();
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function formatDatetime(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function toTs(d: Date): number {
  return d.getTime();
}

function sign(params: Record<string, string>): string {
  const keys = Object.keys(params).filter(k => k !== 'sign' && params[k] !== '').sort();
  let s = '';
  for (const k of keys) s += k + params[k];
  return md5(APP_SECRET + s + APP_SECRET);
}

function toDatetime(value: any): string | null {
  if (value === null || value === undefined || value === 0) return null;
  // 快麦时间戳是毫秒级 Unix timestamp
  const n = Number(value);
  if (n <= 0 || n === 946656000000) return null; // 946656000000 = 2000-01-01 快麦默认值
  const d = new Date(n);
  if (isNaN(d.getTime())) return null;
  return formatDatetime(d);
}

function safeNumber(v: any, fallback: number = 0): number {
  const n = Number(v);
  return isNaN(n) ? fallback : n;
}

function safeStr(v: any): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

async function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ── 快麦 API ──────────────────────────────────────────
async function callKuaimai(method: string, biz: Record<string, string> = {}): Promise<any> {
  const params: Record<string, string> = {
    appKey: APP_KEY,
    method,
    timestamp: formatDatetime(new Date()),
    version: '1.0',
    session: ACCESS_TOKEN,
    sign_method: 'md5',
    format: 'json',
    ...biz,
  };
  params.sign = sign(params);

  const r = await axios.post(API_URL, new URLSearchParams(params).toString(), {
    timeout: 30000,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    validateStatus: () => true,
  });

  const data = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
  if (data.code && data.code !== 0 && data.code !== '0') {
    throw new Error(`快麦API错误: code=${data.code} msg=${data.msg || data.message}`);
  }
  return data;
}

// ── 数据库连接池 ──────────────────────────────────────
let pool: mysql.Pool | null = null;

function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      charset: 'utf8mb4',
      waitForConnections: true,
      connectionLimit: 3,
      queueLimit: 0,
      connectTimeout: 10000,
      // 安全性：尝试 SSL，不强制
      // ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// ── 游标管理 ──────────────────────────────────────────
const CURSOR_KEY = 'order_last_updtime';

async function getCursor(): Promise<Date> {
  const p = getPool();
  const [rows] = await p.query<any[]>(
    'SELECT sync_value FROM sync_state WHERE sync_key = ?',
    [CURSOR_KEY]
  );
  if (rows.length > 0 && rows[0].sync_value) {
    const dt = new Date(rows[0].sync_value);
    if (!isNaN(dt.getTime())) return dt;
  }
  // 首次运行：取 1 天前
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

async function updateCursor(updTime: Date): Promise<void> {
  const p = getPool();
  await p.query(
    `INSERT INTO sync_state (sync_key, sync_value) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE sync_value = VALUES(sync_value)`,
    [CURSOR_KEY, formatDatetime(updTime)]
  );
}

// ── 增量拉取 ──────────────────────────────────────────
interface OrderItem {
  oid: string;
  tid: string;
  sid?: string;
  numIid?: string;
  source?: string;
  outerSkuId?: string;
  skuId?: string;
  title?: string;
  skuPropertiesName?: string;
  num?: number;
  price?: number | string;
  totalFee?: number | string;
  discountFee?: number | string;
  discountRate?: number;
  payment?: number | string;
  divideOrderFee?: number | string;
  cost?: number;
  refundStatus?: string;
  status?: string;
  unifiedStatus?: string;
  sysStatus?: string;
  authorId?: string;
  authorName?: string;
  picPath?: string;
  volume?: number;
  netWeight?: number;
  isPresell?: number;
  isVirtual?: number;
  isCancel?: number;
  payTime?: number;
  consignTime?: number;
  endTime?: number;
  created?: number;
  updTime?: number;
}

interface KuaimaiOrder {
  tid: string;
  sid?: string;
  source?: string;
  sourceId?: string;
  shopName?: string;
  buyerNick?: string;
  openUid?: string;
  receiverName?: string;
  receiverMobile?: string;
  receiverState?: string;
  receiverCity?: string;
  receiverDistrict?: string;
  receiverStreet?: string;
  receiverAddress?: string;
  payment?: string | number;
  postFee?: string | number;
  grossProfit?: string | number;
  salePrice?: string | number;
  itemNum?: number;
  itemKindNum?: number;
  expressCode?: string;
  expressCompanyId?: number;
  outSid?: string;
  warehouseId?: number;
  warehouseName?: string;
  sellerNick?: string;
  sellerFlag?: number;
  status?: string;
  unifiedStatus?: string;
  sysStatus?: string;
  isRefund?: number;
  isHalt?: number;
  isUrgent?: number;
  isExcep?: number;
  payTime?: number;
  payAmount?: string | number;
  consignTime?: number;
  endTime?: number;
  created?: number;
  updTime?: number;
  scalping?: number;
  tradeTags?: any;
  orders?: OrderItem[];
}

async function fetchOrdersPage(startTime: string, endTime: string, pageNo: number): Promise<{
  list: KuaimaiOrder[];
  total: number;
}> {
  const r = await callKuaimai('erp.trade.list.query', {
    timeType: 'upd_time',
    startTime,
    endTime,
    pageNo: String(pageNo),
    pageSize: String(PAGE_SIZE),
  });
  return {
    list: (r.list || []) as KuaimaiOrder[],
    total: r.total || r.totalCount || 0,
  };
}

async function fetchAllIncremental(startDate: Date, endDate: Date): Promise<KuaimaiOrder[]> {
  const startTime = formatDatetime(startDate);
  const endTime = formatDatetime(endDate);
  const all: KuaimaiOrder[] = [];

  console.log(`[拉取] ${startTime} → ${endTime}`);

  const firstPage = await fetchOrdersPage(startTime, endTime, 1);
  all.push(...firstPage.list);
  const total = firstPage.total;
  const totalPages = Math.min(Math.ceil(total / PAGE_SIZE), MAX_PAGES);

  console.log(`  总计 ${total} 条, ${totalPages} 页, 第1页 ${firstPage.list.length} 条`);

  for (let p = 2; p <= totalPages; p++) {
    await delay(RATE_LIMIT_MS);
    const r = await fetchOrdersPage(startTime, endTime, p);
    all.push(...r.list);
    if (r.list.length === 0) break;
    if (p % 20 === 0) console.log(`  第${p}页, 累计 ${all.length} 条`);
  }

  console.log(`  拉取完成: ${all.length} 条`);
  return all;
}

// ── 写入数据库 ────────────────────────────────────────
async function upsertOrders(orders: KuaimaiOrder[]): Promise<number> {
  if (orders.length === 0) return 0;

  const p = getPool();
  const conn = await p.getConnection();
  let written = 0;
  let errorCount = 0;

  try {
    for (const o of orders) {
      try {
        // 写入主表
        const tradeTagsJson = o.tradeTags ? JSON.stringify(o.tradeTags) : null;
        const rawJson = JSON.stringify(o);

        await conn.query(
          `INSERT INTO kuaimai_order (
            tid, sid, source, shop_id, shop_name, buyer_nick, open_uid,
            receiver_name, receiver_mobile, receiver_state, receiver_city,
            receiver_district, receiver_street, receiver_address,
            payment, post_fee, gross_profit, sale_price,
            item_num, item_kind_num,
            express_code, express_company_id, out_sid,
            warehouse_id, warehouse_name,
            seller_nick, seller_flag,
            status, unified_status, sys_status,
            is_refund, is_halt, is_urgent, is_excep,
            pay_time, consign_time, end_time, created_at, upd_time,
            scalping, trade_tags, raw_json
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          ON DUPLICATE KEY UPDATE
            sid = VALUES(sid), source = VALUES(source),
            shop_id = VALUES(shop_id), shop_name = VALUES(shop_name),
            buyer_nick = VALUES(buyer_nick), open_uid = VALUES(open_uid),
            receiver_name = VALUES(receiver_name), receiver_mobile = VALUES(receiver_mobile),
            receiver_state = VALUES(receiver_state), receiver_city = VALUES(receiver_city),
            receiver_district = VALUES(receiver_district), receiver_street = VALUES(receiver_street),
            receiver_address = VALUES(receiver_address),
            payment = VALUES(payment), post_fee = VALUES(post_fee),
            gross_profit = VALUES(gross_profit), sale_price = VALUES(sale_price),
            item_num = VALUES(item_num), item_kind_num = VALUES(item_kind_num),
            express_code = VALUES(express_code), express_company_id = VALUES(express_company_id),
            out_sid = VALUES(out_sid),
            warehouse_id = VALUES(warehouse_id), warehouse_name = VALUES(warehouse_name),
            seller_nick = VALUES(seller_nick), seller_flag = VALUES(seller_flag),
            status = VALUES(status), unified_status = VALUES(unified_status),
            sys_status = VALUES(sys_status),
            is_refund = VALUES(is_refund), is_halt = VALUES(is_halt),
            is_urgent = VALUES(is_urgent), is_excep = VALUES(is_excep),
            pay_time = VALUES(pay_time), consign_time = VALUES(consign_time),
            end_time = VALUES(end_time), created_at = VALUES(created_at),
            upd_time = VALUES(upd_time),
            scalping = VALUES(scalping), trade_tags = VALUES(trade_tags),
            raw_json = VALUES(raw_json)`,
          [
            safeStr(o.tid),
            safeStr(o.sid),
            safeStr(o.source),
            safeStr(o.sourceId),
            safeStr(o.shopName),
            safeStr(o.buyerNick),
            safeStr(o.openUid),
            safeStr(o.receiverName),
            safeStr(o.receiverMobile),
            safeStr(o.receiverState),
            safeStr(o.receiverCity),
            safeStr(o.receiverDistrict),
            safeStr(o.receiverStreet),
            safeStr(o.receiverAddress),
            safeNumber(o.payment),
            safeNumber(o.postFee),
            safeNumber(o.grossProfit),
            safeNumber(o.salePrice),
            safeNumber(o.itemNum),
            safeNumber(o.itemKindNum),
            safeStr(o.expressCode),
            o.expressCompanyId || null,
            safeStr(o.outSid),
            o.warehouseId || null,
            safeStr(o.warehouseName),
            safeStr(o.sellerNick),
            safeNumber(o.sellerFlag),
            safeStr(o.status),
            safeStr(o.unifiedStatus),
            safeStr(o.sysStatus),
            safeNumber(o.isRefund),
            safeNumber(o.isHalt),
            safeNumber(o.isUrgent),
            safeNumber(o.isExcep),
            toDatetime(o.payTime),
            toDatetime(o.consignTime),
            toDatetime(o.endTime),
            toDatetime(o.created),
            toDatetime(o.updTime),
            safeNumber(o.scalping),
            tradeTagsJson,
            rawJson,
          ]
        );

        // 写入明细表
        if (o.orders && o.orders.length > 0) {
          for (const item of o.orders) {
            await conn.query(
              `INSERT INTO kuaimai_order_item (
                tid, oid, sid, num_iid, source,
                outer_sku_id, sku_id, title, sku_properties_name,
                num, price, total_fee, discount_fee, discount_rate,
                payment, divide_order_fee, cost,
                refund_status, status, unified_status, sys_status,
                author_id, author_name, pic_path,
                volume, net_weight,
                is_presell, is_virtual, is_cancel,
                pay_time, consign_time, end_time, created_at, upd_time
              ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
              ON DUPLICATE KEY UPDATE
                tid = VALUES(tid), sid = VALUES(sid),
                num_iid = VALUES(num_iid), source = VALUES(source),
                outer_sku_id = VALUES(outer_sku_id), sku_id = VALUES(sku_id),
                title = VALUES(title), sku_properties_name = VALUES(sku_properties_name),
                num = VALUES(num), price = VALUES(price),
                total_fee = VALUES(total_fee), discount_fee = VALUES(discount_fee),
                discount_rate = VALUES(discount_rate),
                payment = VALUES(payment), divide_order_fee = VALUES(divide_order_fee),
                cost = VALUES(cost),
                refund_status = VALUES(refund_status), status = VALUES(status),
                unified_status = VALUES(unified_status), sys_status = VALUES(sys_status),
                author_id = VALUES(author_id), author_name = VALUES(author_name),
                pic_path = VALUES(pic_path),
                volume = VALUES(volume), net_weight = VALUES(net_weight),
                is_presell = VALUES(is_presell), is_virtual = VALUES(is_virtual),
                is_cancel = VALUES(is_cancel),
                pay_time = VALUES(pay_time), consign_time = VALUES(consign_time),
                end_time = VALUES(end_time), created_at = VALUES(created_at),
                upd_time = VALUES(upd_time)`,
              [
                safeStr(item.tid || o.tid),
                safeStr(item.oid),
                safeStr(item.sid),
                safeStr(item.numIid),
                safeStr(item.source || o.source),
                safeStr(item.outerSkuId),
                safeStr(item.skuId),
                safeStr(item.title),
                safeStr(item.skuPropertiesName),
                safeNumber(item.num, 1),
                safeNumber(item.price),
                safeNumber(item.totalFee),
                safeNumber(item.discountFee),
                safeNumber(item.discountRate, 1),
                safeNumber(item.payment),
                safeNumber(item.divideOrderFee),
                safeNumber(item.cost),
                safeStr(item.refundStatus),
                safeStr(item.status),
                safeStr(item.unifiedStatus),
                safeStr(item.sysStatus),
                safeStr(item.authorId),
                safeStr(item.authorName),
                safeStr(item.picPath),
                safeNumber(item.volume),
                safeNumber(item.netWeight),
                safeNumber(item.isPresell),
                safeNumber(item.isVirtual),
                safeNumber(item.isCancel),
                toDatetime(item.payTime),
                toDatetime(item.consignTime),
                toDatetime(item.endTime),
                toDatetime(item.created),
                toDatetime(item.updTime),
              ]
            );
            written++;
          }
        }
      } catch (err: any) {
        errorCount++;
        if (err.message?.includes('Data too long') || err.message?.includes('column')) {
          console.error(`[跳过] 订单 ${safeStr(o.tid)} 字段过长: ${err.message.substring(0, 200)}`);
        } else {
          console.error(`[跳过] 订单 ${safeStr(o.tid)}: ${err.message?.substring?.(0, 300) || err}`);
        }
      }
    }
  } finally {
    conn.release();
  }

  if (errorCount > 0) {
    console.log(`[警告] ${errorCount} 条订单写入失败（已跳过）`);
  }
  return written;
}

// ── 主流程 ────────────────────────────────────────────
async function sync(): Promise<void> {
  const startWall = Date.now();
  console.log(`\n[同步开始] ${formatDatetime(new Date())}`);

  try {
    // 1. 获取游标
    const cursor = await getCursor();
    // 时间窗口：cursor - OVERLAP_MINUTES → NOW()
    const startDate = new Date(cursor.getTime() - OVERLAP_MINUTES * 60 * 1000);
    const endDate = new Date();

    console.log(`[游标] 上次同步到: ${formatDatetime(cursor)}`);
    console.log(`[窗口] ${formatDatetime(startDate)} → ${formatDatetime(endDate)} (重叠${OVERLAP_MINUTES}分钟)`);

    // 2. 拉取增量订单
    const orders = await fetchAllIncremental(startDate, endDate);

    if (orders.length === 0) {
      console.log('[结果] 无新订单，跳过写入');
      return;
    }

    // 3. 写入数据库
    const written = await upsertOrders(orders);
    console.log(`[写入] 已处理 ${orders.length} 个主单, ${written} 行明细`);

    // 4. 推进游标：取这批数据中最大的 updTime
    let maxUpd = 0;
    for (const o of orders) {
      if (o.updTime && o.updTime > maxUpd) maxUpd = o.updTime;
      if (o.orders) {
        for (const item of o.orders) {
          if (item.updTime && item.updTime > maxUpd) maxUpd = item.updTime;
        }
      }
    }

    if (maxUpd > 0) {
      const newCursor = new Date(maxUpd);
      await updateCursor(newCursor);
      console.log(`[游标] 推进到: ${formatDatetime(newCursor)}`);
    } else {
      // 如果没有有效 updTime，用 endDate 推进
      await updateCursor(endDate);
      console.log(`[游标] 推进到 endDate: ${formatDatetime(endDate)}`);
    }

    const elapsed = ((Date.now() - startWall) / 1000).toFixed(1);
    console.log(`[同步完成] 耗时 ${elapsed}s`);
  } catch (err: any) {
    console.error(`[同步失败] ${err.message}`);
    console.error(err);
    throw err;
  }
}

// ── 入口 ──────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--once')) {
    // 单次执行
    await sync();
    await closePool();
    process.exit(0);
  }

  if (args.includes('--full')) {
    // 全量初始同步：拉最近 90 天
    console.log('[全量同步模式] 拉取最近 90 天订单...');
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 90);
      const orders = await fetchAllIncremental(startDate, endDate);
      console.log(`共拉取 ${orders.length} 条`);
      const written = await upsertOrders(orders);
      console.log(`[全量] 写入明细 ${written} 条`);
      await updateCursor(endDate);
      console.log('全量同步完成');
    } catch (err: any) {
      console.error('[全量同步失败]', err.message);
      console.error(err.stack);
    }
    await closePool();
    process.exit(0);
  }

  // 定时模式：每 5 分钟一次
  console.log('[定时同步模式] 每 5 分钟一次，按 Ctrl+C 退出');
  let running = false;

  const tick = async () => {
    if (running) {
      console.log('[跳过] 上次同步尚未完成');
      return;
    }
    running = true;
    try {
      await sync();
    } catch (err: any) {
      console.error(`[错误] ${err.message}`);
    } finally {
      running = false;
    }
  };

  // 立即执行一次
  await tick();

  // 每 5 分钟
  setInterval(tick, 5 * 60 * 1000);
}

main().catch(err => {
  console.error('[致命错误]', err);
  process.exit(1);
});
