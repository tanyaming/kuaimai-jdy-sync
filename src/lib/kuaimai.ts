import crypto from 'crypto';
import axios, { AxiosInstance } from 'axios';
import { config, PAGE_SIZE } from './config';

export interface KuaimaiOrderItem {
  oid: string;
  id?: string | number;   // 拼多多子单唯一标识（oid 在拼多多为 undefined）
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
  payAmount?: number | string;
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
  suits?: KuaimaiOrderItem[];  // 拼多多套餐子项（真实商品明细在此）
  payTime?: number;
  consignTime?: number;
  endTime?: number;
  updTime?: number;
}

export interface KuaimaiOrder {
  tid?: string;
  sid?: number;
  shopName?: string;
  source?: string;
  type?: string;
  splitSid?: number | string;
  splitType?: number | string;
  isSplitOrder?: boolean;  // 平台单拆出的手工单（source 已归平台，但 oid 需用子单 id）
  unifiedStatus?: string;
  sysStatus?: string;
  status?: string;
  orders?: KuaimaiOrderItem[];
  warehouseName?: string;
  outSid?: string;
  postFee?: string;
  grossProfit?: number;
  cost?: number;
  actualPostFee?: number | string;  // 拼多多实际运费（应付金额 = cost + grossProfit + actualPostFee）
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

function generateSign(params: Record<string, string>, secret: string): string {
  const sortedKeys = Object.keys(params).filter(k => k !== 'sign').sort();
  let concatStr = '';
  for (const key of sortedKeys) {
    const val = params[key];
    if (val !== undefined && val !== null && val !== '') {
      concatStr += key + val;
    }
  }
  return crypto.createHash('md5').update(secret + concatStr + secret, 'utf8').digest('hex').toUpperCase();
}

function pad(n: number) { return String(n).padStart(2, '0'); }

function formatDatetime(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

const http: AxiosInstance = axios.create({
  baseURL: config.kuaimai.baseUrl,
  timeout: 30000,
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  transformResponse: [(data: string) => {
    // 快麦 oid 超过 JS 安全整数范围，解析前转为字符串防止精度丢失
    const safe = data.replace(/"oid"\s*:\s*(\d{16,})/g, '"oid":"$1"');
    return JSON.parse(safe);
  }],
});

async function request(bizParams: Record<string, string>, method = 'erp.trade.list.query'): Promise<any> {
  const params: Record<string, string> = {
    appKey: config.kuaimai.appKey,
    method,
    timestamp: formatDatetime(new Date()),
    version: '1.0',
    session: config.kuaimai.accessToken,
    sign_method: 'md5',
    format: 'json',
    ...bizParams,
  };
  params.sign = generateSign(params, config.kuaimai.appSecret);

  const resp = await http.post('', new URLSearchParams(params).toString());
  if (!resp.data.success) {
    throw new Error(`快麦API错误 [${resp.data.code}]: ${resp.data.msg}`);
  }
  return resp.data;
}

/**
 * 刷新快麦会话 Token
 * 文档：https://open-doc.kuaimai.com/doc/92340482/f5Ql0OZC/99xVuODQ
 * 成功后 accessToken/refreshToken 不变，会话延长 30 天
 */
export async function refreshSession(): Promise<{ success: boolean; expiresIn?: number }> {
  const refreshToken = config.kuaimai.refreshToken;
  if (!refreshToken) {
    console.log('[快麦刷新] 未配置 KUAIMAI_REFRESH_TOKEN，跳过刷新');
    return { success: false };
  }

  const params: Record<string, string> = {
    appKey: config.kuaimai.appKey,
    method: 'open.token.refresh',
    timestamp: formatDatetime(new Date()),
    version: '1.0',
    session: config.kuaimai.accessToken,
    sign_method: 'md5',
    format: 'json',
    refreshToken,
  };
  params.sign = generateSign(params, config.kuaimai.appSecret);

  try {
    const resp = await http.post('', new URLSearchParams(params).toString());
    if (resp.data.success) {
      const session = resp.data.session || {};
      const expiresIn = session.expiresIn as number;
      console.log(`[快麦刷新] ✅ 刷新成功，会话已延长至 ${expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : '未知'}`);
      return { success: true, expiresIn };
    } else {
      console.error(`[快麦刷新] ❌ 刷新失败 [${resp.data.code}]: ${resp.data.msg}`);
      return { success: false };
    }
  } catch (err: any) {
    console.error(`[快麦刷新] ❌ 请求异常: ${err.message}`);
    return { success: false };
  }
}

export async function fetchOrderPage(
  startTime: string,
  endTime: string,
  page: number,
  pageSize: number,
  timeType: 'created' | 'upd_time' | 'pay_time',
): Promise<{ orders: KuaimaiOrder[]; total: number }> {
  const result = await request({
    startTime,
    endTime,
    timeType,
    // 注意：快麦分页参数必须是驼峰 pageNo/pageSize（非 page_no/page_size），
    // 否则 API 会忽略分页，只返回第一页数据导致漏单。
    pageNo: String(page),
    pageSize: String(pageSize),
  });
  return {
    orders: (result.list || []) as KuaimaiOrder[],
    total: (result.total || result.totalCount || 0) as number,
  };
}

export async function fetchAllOrders(
  startTime: string,
  endTime: string,
  timeType: 'created' | 'upd_time' | 'pay_time',
): Promise<KuaimaiOrder[]> {
  const all: KuaimaiOrder[] = [];
  const seenSid = new Set<string>(); // 用 sid(系统订单号,唯一) 去重，而非 tid
  let pageNo = 1;
  const PAGE_LIMIT = 100;

  // 用 pageNo 驼峰参数翻页拉全（之前用 page_no 被 API 忽略导致漏单）
  while (true) {
    const { orders } = await fetchOrderPage(startTime, endTime, pageNo, PAGE_LIMIT, timeType);
    if (!orders.length) break;
    let added = 0;
    for (const o of orders) {
      const sid = o.sid !== undefined && o.sid !== null ? String(o.sid) : '';
      const tid = o.tid || '';
      const key = sid || tid;
      if (!key || seenSid.has(key)) continue;
      seenSid.add(key);
      all.push(o);
      added++;
    }
    if (added === 0) break; // 翻到没有新增，说明已到底
    pageNo++;
  }

  // 拆单归属修正：快麦中「平台单拆出的手工单」source 标为 sys，但其 splitSid 指向真实平台单。
  // 为与快麦后台导出口径一致（如抖音后台导出 = 抖音实单 + 抖音拆出的手工单），
  // 需要把这些 sys 手工单的 source 归到其父单(source=fxg/douyin)的平台。
  resolveSplitSource(all);

  return all;
}

/**
 * 修正确认「平台拆出手工单」的归属平台。
 *
 * 背景：快麦「一单多子单」/「订单拆分」场景，平台实单(如抖音 fxg)会被拆出若干 source=sys 的手工单，
 * 这些 sys 单的 splitSid 指向真实平台单的 sid。若仅按 source 字段归类，它们会被错误归为「手动订单」，
 * 导致简道云「抖音电商」单数 < 快麦后台「抖音订单导出」单数。
 *
 * 规则：source=sys 且 splitSid 有效（指向本次拉取到的某个非 sys 平台单）时，
 * 将该 sys 单的 source 改为父单的 source；否则保持「手动订单」。
 */
function resolveSplitSource(orders: KuaimaiOrder[]): void {
  // 建立 sid -> source 映射（只在内存里，无需额外 API 调用）
  const sidToSource = new Map<string, string>();
  for (const o of orders) {
    if (o.sid === undefined || o.sid === null) continue;
    sidToSource.set(String(o.sid), o.source || '');
  }

  for (const o of orders) {
    if (o.source !== 'sys') continue;
    const splitSid = o.splitSid;
    if (splitSid === undefined || splitSid === null || splitSid === -1 || splitSid === '-1') continue;
    const splitSidStr = String(splitSid);
    // 指向自己 → 纯手工单，跳过
    if (splitSidStr === (o.sid !== undefined && o.sid !== null ? String(o.sid) : '')) continue;
    const parentSource = sidToSource.get(splitSidStr);
    // 父单存在且不是 sys（是真实平台单）→ 归到父单平台
    if (parentSource && parentSource !== 'sys' && parentSource !== '') {
      o.source = parentSource;
      // 标记为平台拆单：source 归父平台，但 oid 仍需用子单 id（item.oid 在拆单场景会重复）
      o.isSplitOrder = true;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 售后单（退款）查询
// 文档：erp.aftersale.list.query
// ─────────────────────────────────────────────────────────────────────────────

export interface KuaimaiAftersaleItem {
  numIid?: string;      // 平台商品ID（与订单接口的 numIid 一致，用于关联子单）
  skuId?: string;       // 快麦系统 SKU ID（与订单接口的 skuId 一致）
  refundMoney?: string; // 该商品实际退款金额（字符串，需转数值）
  price?: number | string;
  goodItemCount?: number;
  title?: string;
  tid?: string;
  id?: number | string;
  sysItemId?: number;
  skuId_alt?: string;
}

export interface KuaimaiAftersale {
  id?: number | string;
  tid?: string;          // 主订单号（关联订单的主 tid）
  refundMoney?: number;  // 整笔售后退款总额
  onlineStatusText?: string; // 售后状态文本（如「退款成功」）
  onlineStatus?: number;
  afterSaleType?: number;
  source?: string;       // 平台（fxg=抖音）
  shopName?: string;
  items?: KuaimaiAftersaleItem[];
  created?: number;      // 售后单创建时间（毫秒时间戳）
  modified?: number;
  sid?: number;          // 注意：接口返回 sid=-1，无效
}

/**
 * 按主订单号 tid 精确查询售后单（返回该订单的全部售后记录）。
 * 售后单接口的时间过滤（startTime/endTime/timeType）实测无效，
 * 只能按 tid 精确查询（或拉全量列表后再过滤）。
 * 因此退款补偿采用「从简道云找 refund_status=SUCCESS 的订单 → 逐个用 tid 查售后单」的逆向策略。
 */
export async function fetchAftersaleByTid(tid: string): Promise<KuaimaiAftersale[]> {
  if (!tid) return [];
  const result = await request(
    { tid, pageNo: '1', pageSize: '20' },
    'erp.aftersale.list.query',
  );
  return (result.list || []) as KuaimaiAftersale[];
}
