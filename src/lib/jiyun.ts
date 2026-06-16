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
  const chunkSize = 100;

  for (let i = 0; i < oids.length; i += chunkSize) {
    const chunk = oids.slice(i, i + chunkSize);
    try {
      const resp = await http.post('/api/v5/app/entry/data/list', {
        app_id: config.jiyun.appId,
        entry_id: config.jiyun.entryId,
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
