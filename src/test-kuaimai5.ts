/**
 * 快麦 API v5 — 修正分页参数
 */
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import crypto from 'crypto';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const APP_KEY = '384147271';
const APP_SECRET = '79be46e6e543430baba45be833462274';
const ACCESS_TOKEN = 'b7314fbd278344d1bd52126e1c52adb4';
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
  return md5(secret + concatStr + secret);
}

function pad(n: number) { return String(n).padStart(2, '0'); }

async function callApi(method: string, bizParams: Record<string, string> = {}) {
  const now = new Date();
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const params: Record<string, string> = {
    appKey: APP_KEY,
    method,
    timestamp,
    version: '1.0',
    session: ACCESS_TOKEN,
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
  return typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;
}

async function main() {
  const now = new Date();
  const startTime = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} 00:00:00`;
  const endTime = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} 23:59:59`;

  console.log('═══════════════════════════════════════');
  console.log('  快麦 API v5 — 分页参数修正测试');
  console.log('═══════════════════════════════════════\n');

  // 测试分页参数组合
  const combos = [
    { label: 'page+pageSize', page: '1', pageSize: '2' },
    { label: 'pageNo+pageSize', pageNo: '1', pageSize: '2' },
    { label: 'page_no+page_size', page_no: '1', page_size: '2' },
    { label: 'pageIndex+pageSize', pageIndex: '1', pageSize: '2' },
  ];

  for (const combo of combos) {
    console.log(`--- ${combo.label} ---`);
    const { label, ...pageParams } = combo;
    const r = await callApi('erp.trade.list.query', {
      timeType: 'created',
      startTime,
      endTime,
      ...pageParams,
    });
    console.log(JSON.stringify(r, null, 2).substring(0, 800));
    console.log();
    await new Promise(r => setTimeout(r, 300));
  }

  // 最后测试不带分页能否返回数据
  console.log('--- 不带分页参数 ---');
  const r2 = await callApi('erp.trade.list.query', {
    timeType: 'created',
    startTime,
    endTime,
  });
  console.log(JSON.stringify(r2, null, 2).substring(0, 800));

  console.log('\n═══════════════════════════════════════\n');
}

main().catch(console.error);
