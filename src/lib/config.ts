import dotenv from 'dotenv';
import path from 'path';

// 优先使用 DOTENV_PATH 环境变量，兼容 Docker 和本地开发
dotenv.config({
  path: process.env.DOTENV_PATH || path.resolve(__dirname, '../..', '.env'),
});

export const config = {
  kuaimai: {
    appKey: process.env.KUAIMAI_APP_KEY || '',
    appSecret: process.env.KUAIMAI_APP_SECRET || '',
    accessToken: process.env.KUAIMAI_ACCESS_TOKEN || '',
    baseUrl: process.env.KUAIMAI_BASE_URL || 'https://gw.superboss.cc/router',
  },
  jiyun: {
    apiKey: process.env.JIYUN_API_KEY || '',
    baseUrl: process.env.JIYUN_BASE_URL || 'https://api.jiandaoyun.com',
    appId: process.env.JIYUN_APP_ID || '',
    entryId: process.env.JIYUN_ORDER_ENTRY_ID || '',
  },
} as const;

export const PAGE_SIZE = 100;
export const WRITE_DELAY = 350;
export const INTERVAL_MS = 5 * 60 * 1000;
export const OVERLAP_MS = 2 * 60 * 1000;

export function checkConfig(): string[] {
  const required: Array<{ key: string; value: string }> = [
    { key: 'KUAIMAI_APP_KEY', value: config.kuaimai.appKey },
    { key: 'KUAIMAI_APP_SECRET', value: config.kuaimai.appSecret },
    { key: 'KUAIMAI_ACCESS_TOKEN', value: config.kuaimai.accessToken },
    { key: 'JIYUN_API_KEY', value: config.jiyun.apiKey },
    { key: 'JIYUN_APP_ID', value: config.jiyun.appId },
    { key: 'JIYUN_ORDER_ENTRY_ID', value: config.jiyun.entryId },
  ];
  return required.filter(r => !r.value).map(r => r.key);
}
