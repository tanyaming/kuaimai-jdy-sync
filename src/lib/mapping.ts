import { KuaimaiOrder, KuaimaiOrderItem } from './kuaimai';

const SOURCE_MAP: Record<string, string> = {
  fxg: '抖音电商',
  douyin: '抖音电商',
  taobao: '淘宝',
  tmall: '天猫',
  jd: '京东',
  pdd: '拼多多',
  kuaishou: '快手',
};

function msToDatetime(ms: number | undefined): string {
  if (!ms || ms <= 0 || ms === 946656000000) return '';
  // 快麦返回的时间戳就是标准毫秒时间戳，直接输出 ISO 8601 格式带时区
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  // 输出格式: yyyy-MM-ddTHH:mm:ss+08:00（明确标注北京时间）
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}+08:00`;
}

function nowDatetime(): string {
  return msToDatetime(Date.now());
}

export function mapItemToJiyun(order: KuaimaiOrder, item: KuaimaiOrderItem): Record<string, unknown> {
  return {
    tid: order.tid || '',
    oid: String(item.oid || ''),
    sid: String(order.sid || ''),
    num_iid: item.numIid || '',
    source: SOURCE_MAP[order.source || ''] || order.source || '',
    shop_name: order.shopName || '',
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
    gross_profit: order.grossProfit || 0,
    post_fee: Number(order.postFee) || 0,
    out_sid: order.outSid || '',
    warehouse_name: order.warehouseName || '',
    receiver_state: order.receiverState || '',
    receiver_city: order.receiverCity || '',
    receiver_district: order.receiverDistrict || '',
    is_refund: order.isRefund || 0,
    pay_time: msToDatetime(item.payTime) || msToDatetime(order.payTime),
    consign_time: msToDatetime(item.consignTime) || msToDatetime(order.consignTime),
    end_time: msToDatetime(item.endTime) || msToDatetime(order.endTime),
    created_at: msToDatetime(order.created),
    upd_time: msToDatetime(item.updTime) || msToDatetime(order.updTime),
    synced_at: nowDatetime(),
  };
}
