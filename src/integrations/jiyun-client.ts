import axios, { AxiosInstance } from 'axios';
import { config } from '../utils/config';
import { logger } from '../utils/logger';

/**
 * 简道云字段值类型
 */
interface JiyunFieldValue {
  value: string | number | boolean | object;
}

/**
 * 简道云单条数据
 */
type JiyunDataRow = Record<string, JiyunFieldValue>;

/**
 * 简道云 API 响应
 */
export interface JiyunResponse<T = unknown> {
  code: number;
  msg?: string;
  message?: string;
  data?: T;
}

/**
 * 查询响应
 */
export interface JiyunListResponse {
  data: JiyunDataRow[];
  total?: number;
}

/**
 * 写入响应
 */
export interface JiyunCreateResponse {
  data?: { _id: string };
  _id?: string;
}

/**
 * 更新响应
 */
export interface JiyunUpdateResponse {
  data?: { _id: string };
  _id?: string;
}

const client: AxiosInstance = axios.create({
  baseURL: config.jiyun.baseUrl,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Basic ${Buffer.from(
      `${config.jiyun.apiKey}:${config.jiyun.apiSecret}`
    ).toString('base64')}`,
  },
});

/**
 * 通用请求方法
 */
async function request<T = unknown>(
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  data?: Record<string, unknown>
): Promise<JiyunResponse<T>> {
  logger.debug({ method, path }, '简道云 API 请求');

  try {
    let response;
    if (method === 'POST') {
      response = await client.post<JiyunResponse<T>>(path, data);
    } else if (method === 'PUT') {
      response = await client.put<JiyunResponse<T>>(path, data);
    } else {
      response = await client.get<JiyunResponse<T>>(path, { params: data });
    }

    const result = response.data;
    if (result.code !== 200 && result.code !== 0) {
      logger.error(
        { path, code: result.code, message: result.msg || result.message },
        '简道云 API 返回错误'
      );
      throw new Error(
        `简道云API错误 [${result.code}]: ${result.msg || result.message}`
      );
    }

    return result;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      logger.error(
        {
          path,
          status: error.response?.status,
          data: error.response?.data,
        },
        '简道云 API 网络错误'
      );
      throw new Error(
        `简道云API网络错误 [${error.response?.status}]: ${error.message}`
      );
    }
    throw error;
  }
}

/**
 * 格式化简道云请求字段值
 */
function toJiyunValue(value: unknown): JiyunFieldValue {
  if (value === null || value === undefined) {
    return { value: '' };
  }
  if (typeof value === 'boolean') {
    return { value: value ? 1 : 0 };
  }
  return { value };
}

/**
 * 写入单条数据到简道云表单
 * POST /api/v5/app/{app_id}/entry/{entry_id}/data_create
 */
export async function createData(
  data: Record<string, unknown>
): Promise<string> {
  const fieldData: JiyunDataRow = {};
  for (const [key, val] of Object.entries(data)) {
    fieldData[key] = toJiyunValue(val);
  }

  const path = `/api/v5/app/${config.jiyun.appId}/entry/${config.jiyun.orderEntryId}/data_create`;

  const result = await request<JiyunCreateResponse>(path, {
    data: fieldData,
  });

  const dataId = result.data?._id;
  if (!dataId) {
    throw new Error('简道云创建数据未返回 _id');
  }

  logger.debug({ dataId }, '简道云数据创建成功');
  return dataId;
}

/**
 * 查询简道云表单数据
 * POST /api/v5/app/{app_id}/entry/{entry_id}/data_list
 */
export async function queryData(
  filter: Record<string, unknown>,
  limit: number = 10
): Promise<JiyunDataRow[]> {
  const path = `/api/v5/app/${config.jiyun.appId}/entry/${config.jiyun.orderEntryId}/data_list`;

  const result = await request<JiyunListResponse>(path, {
    filter,
    limit,
  });

  return result.data?.data || [];
}

/**
 * 根据订单编号 + 店铺查询简道云中是否已存在该订单
 */
export async function findOrderInJiyun(
  orderId: string,
  shopId?: string
): Promise<{ exists: boolean; dataId?: string; data?: JiyunDataRow }> {
  const conditions: Record<string, unknown> = {
    rel: 'and',
    cond: [{ field: '订单编号', method: 'eq', value: orderId }],
  };

  if (shopId) {
    (conditions.cond as Array<unknown>).push({
      field: '店铺ID',
      method: 'eq',
      value: shopId,
    });
  }

  try {
    const results = await queryData(
      {
        filter: conditions,
      },
      1
    );

    if (results.length > 0) {
      const row = results[0];
      const dataId = (row['_id'] as unknown) as string;
      return { exists: true, dataId, data: row };
    }
    return { exists: false };
  } catch (error) {
    logger.warn({ orderId, shopId, error }, '简道云查询失败，假定不存在');
    return { exists: false };
  }
}

/**
 * 更新简道云表单数据
 * POST /api/v5/app/{app_id}/entry/{entry_id}/data_update
 */
export async function updateData(
  dataId: string,
  data: Record<string, unknown>
): Promise<string> {
  const fieldData: JiyunDataRow = {};
  for (const [key, val] of Object.entries(data)) {
    fieldData[key] = toJiyunValue(val);
  }

  const path = `/api/v5/app/${config.jiyun.appId}/entry/${config.jiyun.orderEntryId}/data_update`;

  const result = await request<JiyunUpdateResponse>(path, {
    data_id: dataId,
    data: fieldData,
  });

  logger.debug({ dataId }, '简道云数据更新成功');
  return dataId;
}

/**
 * 批量写入简道云（逐条调用）
 */
export async function batchCreateData(
  dataList: Record<string, unknown>[]
): Promise<{ success: number; failed: number; ids: string[] }> {
  let success = 0;
  let failed = 0;
  const ids: string[] = [];

  for (const data of dataList) {
    try {
      const id = await createData(data);
      success++;
      ids.push(id);
    } catch (error) {
      logger.error({ data, error }, '简道云批量写入单条失败');
      failed++;
    }
    // 简道云限流间隔
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return { success, failed, ids };
}
