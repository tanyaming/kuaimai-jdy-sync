import { config } from '../utils/config';
import { logger } from '../utils/logger';
import { fetchAllOrders, KuaimaiOrder, KuaimaiOrderItem } from '../integrations/kuaimai-client';
import { createData, findOrderInJiyun, updateData } from '../integrations/jiyun-client';
import {
  getLastSyncTime,
  updateLastSyncTime,
  isOrderSynced,
  recordOrderSync,
  recordSyncError,
} from '../models/sync-repository';

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  totalOrders: number;
  startTime: string;
  endTime: string;
}

/**
 * 毫秒时间戳 → yyyy-MM-dd HH:mm:ss 字符串
 */
function msToTime(ms: number): string {
  if (!ms || ms <= 0) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * 将快麦订单的每个子订单（SKU级别）转为简道云行数据
 */
function mapOrderToJiyunRows(order: KuaimaiOrder): Record<string, unknown>[] {
  const subOrders = order.orders || [];

  // 订单来源映射
  const sourceMap: Record<string, string> = {
    fxg: '抖音电商',
    taobao: '淘宝',
    tmall: '天猫',
    jd: '京东',
    pdd: '拼多多',
    douyin: '抖音电商',
  };

  if (subOrders.length === 0) {
    // 无子订单，创建一条订单级记录
    return [
      {
        tid: order.tid,
        sid: String(order.sid),
        shopName: order.shopName,
        source: sourceMap[order.source] || order.source,
        unifiedStatus: order.unifiedStatus,
        sysStatus: order.sysStatus,
        totalFee: parseFloat(order.totalFee || '0'),
        payment: parseFloat(order.payment || '0'),
        acPayment: parseFloat(order.acPayment || '0'),
        payAmount: parseFloat(order.payAmount || '0'),
        discountFee: parseFloat(order.discountFee || '0'),
        postFee: parseFloat(order.postFee || '0'),
        grossProfit: order.grossProfit,
        itemNum: order.itemNum,
        itemKindNum: order.itemKindNum,
        logisticsCompanyName: order.logisticsCompanyName || '',
        outSid: order.outSid || '',
        warehouseName: order.warehouseName || '',
        receiverState: order.receiverState || '',
        receiverCity: order.receiverCity || '',
        receiverDistrict: order.receiverDistrict || '',
        receiverStreet: order.receiverStreet || '',
        isRefund: order.isRefund,
        created: msToTime(order.created),
        payTime: msToTime(order.payTime),
        consignTime: msToTime(order.consignTime),
        updTime: msToTime(order.updTime),
        endTime: msToTime(order.endTime),
        syncTime: formatTime(new Date()),
      },
    ];
  }

  return subOrders.map((item: KuaimaiOrderItem) => ({
    tid: order.tid,
    oid: String(item.oid),
    sid: String(order.sid),
    shopName: order.shopName,
    source: sourceMap[order.source] || order.source,
    unifiedStatus: order.unifiedStatus,
    sysStatus: item.sysStatus,
    title: item.title || '',
    skuPropertiesName: item.skuPropertiesName || '',
    outerSkuId: item.outerSkuId || '',
    skuId: item.skuId || '',
    num: item.num,
    price: parseFloat(item.price || '0'),
    payment: parseFloat(item.payment || '0'),
    payAmount: parseFloat(item.payAmount || '0'),
    acPayment: parseFloat(item.acPayment || '0'),
    divideOrderFee: parseFloat(item.divideOrderFee || '0'),
    discountFee: parseFloat(item.discountFee || '0'),
    refundStatus: item.refundStatus || '',
    picPath: item.picPath || '',
    totalFee: parseFloat(order.totalFee || '0'),
    postFee: parseFloat(order.postFee || '0'),
    grossProfit: order.grossProfit,
    logisticsCompanyName: order.logisticsCompanyName || '',
    outSid: order.outSid || '',
    warehouseName: order.warehouseName || '',
    receiverState: order.receiverState || '',
    receiverCity: order.receiverCity || '',
    receiverDistrict: order.receiverDistrict || '',
    receiverStreet: order.receiverStreet || '',
    isRefund: order.isRefund,
    created: msToTime(item.created || order.created),
    payTime: msToTime(item.payTime || order.payTime),
    consignTime: msToTime(item.consignTime || order.consignTime),
    updTime: msToTime(item.updTime || order.updTime),
    endTime: msToTime(order.endTime),
    syncTime: formatTime(new Date()),
  }));
}

/**
 * 执行一次完整同步
 */
export async function runSync(): Promise<SyncResult> {
  const result: SyncResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    totalOrders: 0,
    startTime: '',
    endTime: '',
  };

  try {
    const now = new Date();
    result.endTime = formatTime(now);
    let startTime: string;

    const lastSync = getLastSyncTime();
    if (lastSync) {
      startTime = lastSync;
    } else {
      const lookback = new Date(now);
      lookback.setDate(lookback.getDate() - config.sync.lookbackDays);
      startTime = formatTime(lookback);
      logger.info(`首次同步，回溯 ${config.sync.lookbackDays} 天，起始时间: ${startTime}`);
    }
    result.startTime = startTime;

    logger.info({ startTime, endTime: result.endTime }, '开始同步订单数据');

    // 从快麦拉取订单（按更新时间，确保能捕获状态变更）
    const orders = await fetchAllOrders({
      startTime,
      endTime: result.endTime,
      timeType: 'upd_time',
      pageSize: 100,
    });

    result.totalOrders = orders.length;
    logger.info(`从快麦拉取到 ${orders.length} 条订单`);

    if (orders.length === 0) {
      updateLastSyncTime(result.endTime);
      logger.info('无新订单，同步完成');
      return result;
    }

    // 逐条处理
    for (const order of orders) {
      try {
        const shopId = String(order.sid);
        const status = order.unifiedStatus || order.sysStatus || '';

        // 本地去重
        if (isOrderSynced(order.tid, shopId, status)) {
          result.skipped++;
          continue;
        }

        // 检查简道云是否已存在
        const { exists, dataId } = await findOrderInJiyun(order.tid, shopId);

        // 转换为简道云格式（子订单拆分）
        const jiyunRows = mapOrderToJiyunRows(order);

        if (exists && dataId) {
          // 更新（只更新第一条，多条SKU暂时简化）
          await updateData(dataId, jiyunRows[0]);
          result.updated++;
          recordOrderSync(order.tid, shopId, '', status, dataId);
          logger.info({ tid: order.tid, dataId }, '订单数据更新成功');
        } else {
          // 新增
          for (const row of jiyunRows) {
            const newDataId = await createData(row);
            recordOrderSync(order.tid, shopId, '', status, newDataId);
            logger.info({ tid: order.tid, newDataId }, '订单数据创建成功');
            result.created++;
          }
        }
      } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : String(error);
        logger.error({ tid: order.tid, error: errMsg }, '处理订单失败');
        recordSyncError(order.tid, 'ORDER_SYNC_ERROR', errMsg);
        result.errors++;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    updateLastSyncTime(result.endTime);

    logger.info(
      { total: result.totalOrders, created: result.created, updated: result.updated, skipped: result.skipped, errors: result.errors },
      '同步完成'
    );
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error({ error: errMsg }, '同步过程异常');
    recordSyncError(null, 'SYNC_RUNTIME_ERROR', errMsg);
  }

  return result;
}

function formatTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
