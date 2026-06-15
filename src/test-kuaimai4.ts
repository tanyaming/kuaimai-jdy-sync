/**
 * 快麦 API 连通性测试 v4 — 使用 accessToken
 */
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import crypto from 'crypto';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const APP_KEY = '384147271';
const APP_SECRET = '79be46e6e543430baba45be833462274';
const ACCESS_TOKEN = 'b7314fbd278344d1bd52126e1c52adb4';
const REFRESH_TOKEN = 'cfd0f69dd86e47bfb48813b5dded155f';

const API_URL = 'https://gw.superboss.cc/router';

function md5(str: string): string {
  return crypto.createHash('md5').update(str, 'utf8').digest('hex').toUpperCase();
}

function generateSign(params: Record<string, string>, secret: string): string {
  const sortedKeys = Object.keys(params).sort();
  let concatStr = '';
  for (const key of sortedKeys) {
    const val = params[key];
    if (val !== undefined && val !== null && val !== '') {
      concatStr += key + val;
    }
  }
  const signStr = secret + concatStr + secret;
  return md5(signStr);
}

function pad(n: number) { return String(n).padStart(2, '0'); }

async function callApi(method: string, bizParams: Record<string, string> = {}, session = ACCESS_TOKEN) {
  const now = new Date();
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const params: Record<string, string> = {
    appKey: APP_KEY,
    method,
    timestamp,
    version: '1.0',
    session,
    sign_method: 'md5',
    format: 'json',
    ...bizParams,
  };

  params.sign = generateSign(params, APP_SECRET);

  const resp = await axios.post(API_URL, new URLSearchParams(params).toString(), {
    timeout: 15000,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    validateStatus: () => true,
  });

  const data = typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;
  return { httpStatus: resp.status, data };
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  快麦 ERP API v4 — 带 accessToken');
  console.log('═══════════════════════════════════════\n');

  // 1. 测试时间接口
  console.log('--- 测试 1: 系统时间接口 ---');
  const r1 = await callApi('open.system.time.get');
  console.log('HTTP', r1.httpStatus);
  console.log(JSON.stringify(r1.data, null, 2));
  console.log();

  // 2. 测试订单查询 - 按创建时间
  console.log('--- 测试 2: 订单列表查询(按创建时间) ---');
  const now = new Date();
  const startTime = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} 00:00:00`;
  const endTime = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} 23:59:59`;

  const r2 = await callApi('erp.trade.list.query', {
    timeType: 'created',
    startTime,
    endTime,
    pageNo: '1',
    pageSize: '2',
  });
  console.log('HTTP', r2.httpStatus);
  console.log(JSON.stringify(r2.data, null, 2).substring(0, 3000));
  console.log();

  // 3. 如果按创建时间不行，试试按更新时间
  console.log('--- 测试 3: 订单列表查询(按更新时间) ---');
  const r3 = await callApi('erp.trade.list.query', {
    timeType: 'upd_time',
    startTime,
    endTime,
    pageNo: '1',
    pageSize: '2',
  });
  console.log('HTTP', r3.httpStatus);
  console.log(JSON.stringify(r3.data, null, 2).substring(0, 3000));
  console.log();

  // 4. 测试刷新会话接口
  console.log('--- 测试 4: 刷新会话接口 ---');
  const r4 = await callApi('open.auth.token.refresh', {
    refreshToken: REFRESH_TOKEN,
  });
  console.log('HTTP', r4.httpStatus);
  console.log(JSON.stringify(r4.data, null, 2).substring(0, 1000));

  console.log('\n═══════════════════════════════════════\n');
}

main().catch(console.error);
