import axios, { AxiosInstance } from 'axios';
import { config, WRITE_DELAY } from './config';

const http: AxiosInstance = axios.create({
  baseURL: config.jiyun.baseUrl,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.jiyun.apiKey}`,
  },
});

function toFieldData(data: Record<string, unknown>): Record<string, { value: unknown }> {
  const fieldData: Record<string, { value: unknown }> = {};
  for (const [k, v] of Object.entries(data)) {
    fieldData[k] = { value: v === null || v === undefined ? '' : v };
  }
  return fieldData;
}

export async function batchFindByOids(oids: string[]): Promise<Map<string, string>> {
  const existing = new Map<string, string>();
  // 单次 in 查询的 oid 数量上限。简道云 data/list 的 limit 上限为 100；
  // 若某个 oid 已存在多条重复记录，会占满 limit 配额挤掉其他 oid 的返回，
  // 因此这里对每页结果循环翻页（skip 递增）直到取完，避免查重漏判。
  const chunkSize = 100;
  const pageLimit = 100;

  for (let i = 0; i < oids.length; i += chunkSize) {
    const chunk = oids.slice(i, i + chunkSize);
    let skip = 0;
    let pageRows: Array<{ _id: string; oid: string }> = [];
    try {
      // 循环翻页，直到某页返回数量 < pageLimit（说明已取完该 chunk 的全部匹配记录）
      while (true) {
        const resp = await http.post('/api/v5/app/entry/data/list', {
          app_id: config.jiyun.appId,
          entry_id: config.jiyun.entryId,
          limit: pageLimit,
          skip,
          fields: ['oid', '_id'],
          filter: {
            rel: 'and',
            cond: [{ field: 'oid', method: 'in', value: chunk }],
          },
        });
        const body = resp.data as { data?: Array<{ _id: string; oid: string }> };
        pageRows = body.data || [];
        if (!pageRows.length) break;
        for (const row of pageRows) {
          if (row.oid) existing.set(row.oid, row._id);
        }
        if (pageRows.length < pageLimit) break;
        skip += pageLimit;
      }
    } catch (err: any) {
      const detail = err.response?.data ? JSON.stringify(err.response.data).substring(0, 300) : err.message;
      console.error(`  [查重失败] ${detail}`);
    }
  }

  return existing;
}

export async function createOne(data: Record<string, unknown>): Promise<string> {
  let resp;
  try {
    resp = await http.post('/api/v5/app/entry/data/create', {
      app_id: config.jiyun.appId,
      entry_id: config.jiyun.entryId,
      data: toFieldData(data),
    });
  } catch (err: any) {
    const status = err.response?.status;
    const detail = JSON.stringify(err.response?.data).substring(0, 400);
    throw new Error(`HTTP ${status}: ${detail}`);
  }
  const dataId = resp.data?.data?._id;
  if (!dataId) throw new Error('简道云未返回 _id');
  return dataId;
}

export async function updateOne(dataId: string, data: Record<string, unknown>): Promise<void> {
  let resp;
  try {
    resp = await http.post('/api/v5/app/entry/data/update', {
      app_id: config.jiyun.appId,
      entry_id: config.jiyun.entryId,
      data_id: dataId,
      data: toFieldData(data),
    });
  } catch (err: any) {
    const status = err.response?.status;
    const detail = JSON.stringify(err.response?.data).substring(0, 400);
    throw new Error(`HTTP ${status}: ${detail}`);
  }
  const body = resp.data as { code?: number; msg?: string };
  if (body.code && body.code !== 200) {
    throw new Error(`简道云更新失败 [${body.code}]: ${body.msg}`);
  }
}

/**
 * 按「主订单号 tid + 平台商品ID num_iid + SKU ID sku_id」定位子订单记录，
 * 返回匹配记录的 _id。用于退款金额补偿（售后单无有效 sid，只能靠 tid + 商品维度定位）。
 */
export async function findDataIdByTidAndItem(
  tid: string,
  numIid: string,
  skuId: string,
): Promise<string | null> {
  try {
    const cond: Array<Record<string, unknown>> = [{ field: 'tid', method: 'eq', value: tid }];
    if (numIid) cond.push({ field: 'num_iid', method: 'eq', value: numIid });
    if (skuId) cond.push({ field: 'sku_id', method: 'eq', value: skuId });

    const resp = await http.post('/api/v5/app/entry/data/list', {
      app_id: config.jiyun.appId,
      entry_id: config.jiyun.entryId,
      limit: 100,
      fields: ['_id', 'tid', 'num_iid', 'sku_id'],
      filter: { rel: 'and', cond },
    });
    const body = resp.data as { data?: Array<{ _id: string }> };
    const rows = body.data || [];
    return rows.length > 0 ? rows[0]._id : null;
  } catch (err: any) {
    const detail = err.response?.data ? JSON.stringify(err.response.data).substring(0, 300) : err.message;
    console.error(`  [退款反查失败] tid=${tid} numIid=${numIid} skuId=${skuId}: ${detail}`);
    return null;
  }
}

/**
 * 仅更新单条记录的实际退款金额字段（tuikuanjine），不碰其他字段。
 */
export async function updateRefundAmount(dataId: string, refundMoney: number): Promise<void> {
  await updateOne(dataId, { tuikuanjine: refundMoney });
}

/**
 * 查简道云里 refund_status=SUCCESS 且 tuikuanjine 为空的子订单。
 * 这是退款补偿的「逆向」驱动源：售后单接口时间过滤无效，
 * 只能从简道云里找出已退款但还没补退款金额的订单，再逐个用 tid 查售后单。
 * 返回每条记录的 { _id, tid, num_iid, sku_id, source }，用于后续精确查询售后单并回填退款金额。
 *
 * 注意：历史 bug——仅取前 limit 条且无翻页，导致 refund_status=SUCCESS 总数超过 limit 时，
 * 排在 limit 之后的最新退款单永远扫不到、金额永远补不上。这里改为 skip 游标循环翻页捞全。
 */
export interface RefundedOrderRow {
  _id: string;
  tid: string;
  num_iid: string;
  sku_id: string;
  source: string;
  status: string;
}

export async function findRefundedOrdersWithoutAmount(
  limit = 0, // 0 = 不截断，捞全所有 SUCCESS 且空金额的订单
): Promise<RefundedOrderRow[]> {
  const PAGE = 1000; // 单页拉取上限，循环翻页直到取完
  const result: RefundedOrderRow[] = [];
  try {
    let skip = 0;
    while (true) {
      const resp = await http.post('/api/v5/app/entry/data/list', {
        app_id: config.jiyun.appId,
        entry_id: config.jiyun.entryId,
        limit: PAGE,
        skip,
        fields: ['_id', 'tid', 'num_iid', 'sku_id', 'tuikuanjine', 'source', 'status'],
        filter: {
          rel: 'and',
          cond: [{ field: 'refund_status', method: 'eq', value: 'SUCCESS' }],
        },
      });
      const body = resp.data as { data?: Array<{ _id: string; tid: string; num_iid: string; sku_id: string; tuikuanjine?: unknown; source?: string; status?: string }> };
      const rows = (body.data || []).filter((r) => {
        const v = r.tuikuanjine;
        return v === undefined || v === null || v === '' || Number(v) === 0;
      });
      result.push(...rows.map((r) => ({ _id: r._id, tid: r.tid || '', num_iid: r.num_iid || '', sku_id: r.sku_id || '', source: r.source || '', status: r.status || '' })));
      if ((body.data || []).length < PAGE) break;
      skip += PAGE;
    }
  } catch (err: any) {
    const detail = err.response?.data ? JSON.stringify(err.response.data).substring(0, 300) : err.message;
    console.error(`  [查退款单失败] ${detail}`);
  }
  // limit > 0 时作为每轮处理上限（保护）；默认 0 = 不截断，捞全所有空金额订单
  return limit > 0 ? result.slice(0, limit) : result;
}
