/**
 * 快麦 API v6 — 打印完整订单数据
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
    appKey: APP_KEY, method, timestamp, version: '1.0',
    session: ACCESS_TOKEN, sign_method: 'md5', format: 'json',
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
  const startTime = '2026-06-01 00:00:00';
  const endTime = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} 23:59:59`;

  console.log('═══════════════════════════════════════');
  console.log('  快麦 API v6 — 完整订单数据结构');
  console.log('═══════════════════════════════════════\n');

  // 拉取最近10天的订单，取5条看结构
  const r = await callApi('erp.trade.list.query', {
    timeType: 'created',
    startTime,
    endTime,
    page_no: '1',
    page_size: '3',
  });

  console.log('响应摘要:');
  console.log('  success:', r.success);
  console.log('  traceId:', r.traceId);
  console.log('  列表长度:', r.list?.length || 0);
  console.log('  totalCount:', r.totalCount, '(可能是 total 或其他字段)\n');

  if (r.list && r.list.length > 0) {
    const order = r.list[0];
    console.log('=== 第一单完整字段 ===');
    console.log(JSON.stringify(order, null, 2));
  }

  // 也尝试拉单条详情
  console.log('\n--- 测试单笔订单详情接口 ---');
  if (r.list && r.list.length > 0) {
    const oid = r.list[0].oid || r.list[0].tradeId || r.list[0].orderId;
    console.log('订单ID:', oid);

    const r2 = await callApi('erp.trade.detail.query', {
      oid: String(oid),
    });
    console.log(JSON.stringify(r2, null, 2).substring(0, 3000));
  }

  console.log('\n═══════════════════════════════════════\n');
}

main().catch(console.error);
