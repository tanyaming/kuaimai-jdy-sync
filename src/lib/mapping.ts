import { KuaimaiOrder, KuaimaiOrderItem } from './kuaimai';

const SOURCE_MAP: Record<string, string> = {
  fxg: '抖音电商',
  douyin: '抖音电商',
  taobao: '淘宝',
  tmall: '天猫',
  jd: '京东',
  jd_qqd: '京东',
  pdd: '拼多多',
  kuaishou: '快手',
  wxsph: '视频号',
  xhs: '小红书',
  sys: '手动订单',
};

function msToDatetime(ms: number | undefined): string {
  if (!ms || ms <= 0 || ms === 946656000000) return '';
  // 快麦返回的毫秒时间戳是绝对时间（Unix 毫秒，UTC 语义）。
  // 简道云 datetime 字段的正确写入格式：必须带时区标注（+08:00）。
  // 实测验证（快麦时间戳 1786550447000 = 北京 8/13 00:00:47）：
  //   写 "2026-08-13T00:00:47+08:00"  → 读回 "2026-08-12T16:00:47.000Z" = 北京 8/13 00:00:47  ✅ 正确
  //   写 "2026-08-13 00:00:47"(不带时区) → 读回 "2026-08-13T00:00:47.000Z" = 北京 8/13 08:00:47  ❌ 晚 8 小时
  // 因此这里输出带 +08:00 时区标注的 ISO 字符串，简道云会自动转 UTC 存储，读回即为正确时刻。
  const d = new Date(ms + 8 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  // 输出格式: yyyy-MM-ddTHH:mm:ss+08:00（带时区标注的北京时间）
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+08:00`;
}

function nowDatetime(): string {
  return msToDatetime(Date.now());
}

// 店铺名称白名单（快麦 shopName 偶发 UTF-8 乱码，此处清洗并规范化）
const SHOP_WHITELIST: string[] = [
  '蜀德福官方旗舰店',
  '蜀德福食品专营店',
  '蜀德福食品旗舰店',
  '京东自营',
  '蜀德福',
  '蜀德福旗舰店（小红书）',
  '徐洪',
  '王淋',
  '阿萌',
];

// 含乱码字符（U+FFFD）时，尝试匹配白名单；匹配不到则退化为清洗乱码字符
function cleanShopName(raw: string | undefined | null): string {
  const s = (raw || '').trim();
  if (!s) return '';
  // 已是白名单内干净值，直接返回
  if (SHOP_WHITELIST.includes(s)) return s;
  // 含乱码或过长字符时，去掉 U+FFFD 后尝试匹配白名单
  const stripped = s.replace(/[\uFFFD]/g, '');
  if (stripped !== s) {
    for (const w of SHOP_WHITELIST) {
      if (stripped === w) return w;
    }
    // 损坏字符多集中在店名中段，用同长度 +“蜀德福”前缀匹配兜底
    for (const w of SHOP_WHITELIST) {
      if (stripped.length === w.length && w.includes('蜀德福') && stripped.startsWith('蜀德福')) {
        return w;
      }
    }
    // 最终兑底：返回去除乱码字符后的值
    return stripped;
  }
  return s;
}

export function mapItemToJiyun(order: KuaimaiOrder, item: KuaimaiOrderItem, isPddSuit?: boolean): Record<string, unknown> {
  const isPdd = order.source === 'pdd';
  // 拼多多应付金额 = cost + grossProfit + actualPostFee（主单维度，已验证 8/11 29/29、8/12 20/20 匹配快麦后台应付金额）。
  // API 不返回平台订单号(tid)和可靠金额，但 cost/grossProfit/actualPostFee 三字段能精确推导。
  const pddPayment = Number(order.cost || 0) + Number(order.grossProfit || 0) + Number(order.actualPostFee || 0);
  return {
    tid: order.tid || '',
    // oid 存储值需与 sync.ts 的去重键保持一致：
    // - 拼多多：每 sid 一条，oid = `sid_子单id`
    // - 小红书/手动订单：用快麦子单 id（全局唯一流水号）
    // - 平台拆出的手工单(isSplitOrder)：item.oid 在拆单场景会重复，必须用子单 id
    // - 其他平台（抖音/京东/快手/视频号）：保留原平台 oid（本身唯一）
    oid: isPdd
      ? `${order.sid}_${item.id || ''}`
      : String(order.source === 'xhs' || order.source === 'sys' || order.isSplitOrder
        ? (item.id !== undefined && item.id !== null ? item.id : '')
        : (item.oid || '')),
    sid: String(order.sid || ''),
    num_iid: item.numIid || '',
    source: SOURCE_MAP[order.source || ''] || order.source || '',
    shop_name: cleanShopName(order.shopName),
    title: item.title || '',
    sku_properties_name: item.skuPropertiesName || '',
    outer_sku_id: item.outerSkuId || '',
    sku_id: item.skuId || '',
    num: item.num || 0,
    price: Number(item.price) || 0,
    total_fee: Number(item.totalFee) || 0,
    discount_fee: Number(item.discountFee) || 0,
    discount_rate: Number(item.discountRate) || 0,
    // 拼多多：suits 的 discountFee 已是实付金额（取绝对值），否则取 item.payment/discountFee 兜底
    // 注意：快麦子单有两个金额字段——payment 是纯商品金额（不含运费），payAmount 是含运费的实付金额。
    // 快麦后台「订单应付金额」= 子单 payAmount 求和，故对齐后台口径应取 payAmount（含运费），
    // 仅在 payAmount 缺失时兜底用 payment。
    payment: isPdd ? pddPayment : (Number(item.payAmount) || Number(item.payment) || 0),
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
    pay_time: msToDatetime(item.payTime) || msToDatetime(order.payTime) || msToDatetime(order.created),
    consign_time: msToDatetime(item.consignTime) || msToDatetime(order.consignTime),
    end_time: msToDatetime(item.endTime) || msToDatetime(order.endTime),
    created_at: msToDatetime(order.created),
    upd_time: msToDatetime(item.updTime) || msToDatetime(order.updTime),
    synced_at: nowDatetime(),
  };
}
