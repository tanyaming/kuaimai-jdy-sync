import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../..', '.env') });

export const config = {
  kuaimai: {
    appKey: process.env.KUAIMAI_APP_KEY || '',
    appSecret: process.env.KUAIMAI_APP_SECRET || '',
    accessToken: process.env.KUAIMAI_ACCESS_TOKEN || '',
    refreshToken: process.env.KUAIMAI_REFRESH_TOKEN || '',
    baseUrl: process.env.KUAIMAI_BASE_URL || 'https://gw.superboss.cc/router',
  },
  jiyun: {
    apiKey: process.env.JIYUN_API_KEY || '',
    apiSecret: process.env.JIYUN_API_SECRET || '',
    baseUrl: process.env.JIYUN_BASE_URL || 'https://api.jiandaoyun.com',
    appId: process.env.JIYUN_APP_ID || '',
    orderEntryId: process.env.JIYUN_ORDER_ENTRY_ID || '',
    costEntryId: process.env.JIYUN_COST_ENTRY_ID || '',
  },
  sync: {
    intervalMinutes: parseInt(process.env.SYNC_INTERVAL_MINUTES || '5', 10),
    lookbackDays: parseInt(process.env.SYNC_LOOKBACK_DAYS || '1', 10),
  },
  logLevel: process.env.LOG_LEVEL || 'info',
};

export function checkConfig(): string[] {
  const required: { key: string; value: string }[] = [
    { key: 'KUAIMAI_APP_KEY', value: config.kuaimai.appKey },
    { key: 'KUAIMAI_APP_SECRET', value: config.kuaimai.appSecret },
    { key: 'KUAIMAI_ACCESS_TOKEN', value: config.kuaimai.accessToken },
    { key: 'KUAIMAI_REFRESH_TOKEN', value: config.kuaimai.refreshToken },
    { key: 'JIYUN_API_KEY', value: config.jiyun.apiKey },
    { key: 'JIYUN_APP_ID', value: config.jiyun.appId },
    { key: 'JIYUN_ORDER_ENTRY_ID', value: config.jiyun.orderEntryId },
  ];
  return required.filter((r) => !r.value).map((r) => r.key);
}
