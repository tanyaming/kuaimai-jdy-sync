import crypto from 'crypto';
import axios, { AxiosInstance } from 'axios';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

/**
 * 快麦 API 子订单（orders[] 里的每条，就是 SKU 级别的商品明细）
 */
export interface KuaimaiOrderItem {
  /** 子订单 ID */
  oid: number;
  /** 店铺订单号 */
  tid: string;
  /** 商品标题 */
  title: string;
  /** SKU 属性名（规格） */
  skuPropertiesName: string;
  /** 平台SKU编码 */
  outerSkuId: string;
  /** SKU ID */
  skuId: string;
  /** 数量 */
  num: number;
  /** 单价 */
  price: string;
  /** 实付金额 */
  payAmount: string;
  /** 支付金额 */
  payment: string;
  /** 实收金额 */
  acPayment: string;
  /** 分摊后金额 */
  divideOrderFee: string;
  /** 优惠金额 */
  discountFee: string;
  /** 系统状态 */
  sysStatus: string;
  /** 退款状态 */
  refundStatus: string;
  /** 商品图片 */
  picPath: string;
  /** 创建时间 (ms) */
  created: number;
  /** 付款时间 (ms) */
  payTime: number;
  /** 发货时间 (ms) */
  consignTime: number;
  /** 更新时间 (ms) */
  updTime: number;
  [key: string]: unknown;
}

/**
 * 快麦主订单数据结构（顶层 list 里的每条）
 */
export interface KuaimaiOrder {
  /** 店铺订单号 */
  tid: string;
  /** 店铺ID */
  sid: number;
  /** 店铺名称 */
  shopName: string;
  /** 订单来源平台 */
  source: string;
  /** 订单类型 */
  type: string;
  /** 统一状态 */
  unifiedStatus: string;
  /** 系统状态 */
  sysStatus: string;
  /** 买家昵称 */
  buyerNick: string;
  /** 收货人 */
  receiverName: string;
  /** 收货人手机 */
  receiverMobile: string;
  /** 收货省份 */
  receiverState: string;
  /** 收货城市 */
  receiverCity: string;
  /** 收货区县 */
  receiverDistrict: string;
  /** 收货街道 */
  receiverStreet: string;
  /** 收货地址 */
  receiverAddress: string;
  /** 总金额 */
  totalFee: string;
  /** 实付金额 */
  payment: string;
  /** 实收金额 */
  acPayment: string;
  /** 实付金额(别名) */
  payAmount: string;
  /** 优惠金额 */
  discountFee: string;
  /** 邮费 */
  postFee: string;
  /** 快递公司 */
  logisticsCompanyName: string;
  /** 运单号 */
  outSid: string;
  /** 货品数量 */
  itemNum: number;
  /** 货品种类数 */
  itemKindNum: number;
  /** 毛利润 */
  grossProfit: number;
  /** 仓库名称 */
  warehouseName: string;
  /** 是否退款 */
  isRefund: number;
  /** 创建时间 (ms) */
  created: number;
  /** 付款时间 (ms) */
  payTime: number;
  /** 发货时间 (ms) */
  consignTime: number;
  /** 更新时间 (ms) */
  updTime: number;
  /** 结束时间 (ms) */
  endTime: number;
  /** 标签 */
  tradeTags: Array<{ id: number; tagName: string; remark?: string; type: number }>;
  /** 子订单列表（商品明细） */
  orders: KuaimaiOrderItem[];
  [key: string]: unknown;
}

/**
 * 快麦 API 响应
 */
export interface KuaimaiResponse {
  success: boolean;
  traceId: string;
  code?: string;
  msg?: string;
  list?: KuaimaiOrder[];
  total?: number;
  totalCount?: number;
}

const apiUrl = 'https://gw.superboss.cc/router';

const client: AxiosInstance = axios.create({
  baseURL: apiUrl,
  timeout: 30000,
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
});

/**
 * 生成快麦 API 签名
 * 算法: appSecret + 按key排序拼接的参数串 + appSecret → MD5
 */
function generateSign(
  params: Record<string, string>,
  secret: string
): string {
  const sortedKeys = Object.keys(params)
    .filter((k) => k !== 'sign')
    .sort();
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

/**
 * 格式化时间为 yyyy-MM-dd HH:mm:ss
 */
function formatTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/**
 * 通用请求方法
 */
async function request(
  method: string,
  bizParams: Record<string, string> = {}
): Promise<KuaimaiResponse> {
  const timestamp = formatTime(new Date());

  const params: Record<string, string> = {
    appKey: config.kuaimai.appKey,
    method,
    timestamp,
    version: '1.0',
    session: config.kuaimai.accessToken,
    sign_method: 'md5',
    format: 'json',
    ...bizParams,
  };
  params.sign = generateSign(params, config.kuaimai.appSecret);

  logger.debug({ method, ts: timestamp }, '快麦 API 请求');

  try {
    const response = await client.post<KuaimaiResponse>('', new URLSearchParams(params).toString());
    const result = response.data;

    if (!result.success) {
      logger.error(
        { method, code: result.code, msg: result.msg, traceId: result.traceId },
        '快麦 API 返回错误'
      );
      throw new Error(
        `快麦API错误 [${result.code}]: ${result.msg} (traceId: ${result.traceId})`
      );
    }

    const listLen = result.list?.length || 0;
    logger.debug({ method, listLen, traceId: result.traceId }, '快麦 API 响应成功');

    return result;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      logger.error(
        { method, status: error.response?.status, data: String(error.response?.data).substring(0, 500) },
        '快麦 API 网络错误'
      );
      throw new Error(
        `快麦API网络错误 [${error.response?.status}]: ${error.message}`
      );
    }
    throw error;
  }
}

/**
 * 查询订单列表（分页）
 */
export async function queryOrderList(params: {
  startTime?: string;
  endTime?: string;
  timeType?: 'created' | 'upd_time';
  orderStatus?: string;
  page?: number;
  pageSize?: number;
}): Promise<KuaimaiResponse> {
  const bizParams: Record<string, string> = {};

  bizParams.timeType = params.timeType || 'upd_time';
  if (params.startTime) bizParams.startTime = params.startTime;
  if (params.endTime) bizParams.endTime = params.endTime;
  if (params.orderStatus) bizParams.status = params.orderStatus;
  bizParams.page_no = String(params.page || 1);
  bizParams.page_size = String(params.pageSize || 100);

  return request('erp.trade.list.query', bizParams);
}

/**
 * 分页拉取全部订单（处理分页逻辑）
 * @param timeType 'created' 按创建时间 | 'upd_time' 按更新时间
 */
export async function fetchAllOrders(params: {
  startTime?: string;
  endTime?: string;
  timeType?: 'created' | 'upd_time';
  pageSize?: number;
}): Promise<KuaimaiOrder[]> {
  const allOrders: KuaimaiOrder[] = [];
  let page = 1;
  const pageSize = params.pageSize || 100;

  while (true) {
    const result = await queryOrderList({
      ...params,
      page,
      pageSize,
    });

    const orders = result.list || [];
    allOrders.push(...orders);

    const totalCount = result.total || result.totalCount || 0;
    logger.info(
      `快麦订单查询: 第${page}页, 获取${orders.length}条, 累计${allOrders.length}/${totalCount}条`
    );

    // 判断是否还有下一页
    if (allOrders.length >= totalCount || orders.length < pageSize) {
      break;
    }
    page++;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return allOrders;
}
