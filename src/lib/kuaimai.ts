import crypto from 'crypto';
import axios, { AxiosInstance } from 'axios';
import { config, PAGE_SIZE } from './config';

export interface KuaimaiOrderItem {
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

export interface KuaimaiOrder {
  tid?: string;
  sid?: number;
  shopName?: string;
  source?: string;
  unifiedStatus?: string;
  sysStatus?: string;
  status?: string;
  orders?: KuaimaiOrderItem[];
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
});

async function request(bizParams: Record<string, string>): Promise<any> {
  const params: Record<string, string> = {
    appKey: config.kuaimai.appKey,
    method: 'erp.trade.list.query',
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

export async function fetchOrderPage(
  startTime: string,
  endTime: string,
  page: number,
  pageSize: number,
  timeType: 'created' | 'upd_time',
): Promise<{ orders: KuaimaiOrder[]; total: number }> {
  const result = await request({
    startTime,
    endTime,
    timeType,
    page_no: String(page),
    page_size: String(pageSize),
  });
  return {
    orders: (result.list || []) as KuaimaiOrder[],
    total: (result.total || result.totalCount || 0) as number,
  };
}

export async function fetchAllOrders(
  startTime: string,
  endTime: string,
  timeType: 'created' | 'upd_time',
): Promise<KuaimaiOrder[]> {
  const all: KuaimaiOrder[] = [];
  let page = 1;

  while (true) {
    const { orders, total } = await fetchOrderPage(startTime, endTime, page, PAGE_SIZE, timeType);
    if (orders.length === 0) break;
    all.push(...orders);
    if (all.length >= total) break;
    page++;
    await new Promise(r => setTimeout(r, 150));
  }

  return all;
}
