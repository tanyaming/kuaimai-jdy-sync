/**
 * 快麦 API 连通性测试 v3 — 使用正确的地址和鉴权方式
 * API 入口: https://gw.superboss.cc/router
 * 先尝试用 appKey 直接做 session（有些 ERP 这样设计）
 */
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import crypto from 'crypto';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const APP_KEY = '384147271';
const APP_SECRET = '79be46e6e543430baba45be833462274';

// 真实API地址
const API_URL = 'https://gw.superboss.cc/router';

function md5(str: string): string {
  return crypto.createHash('md5').update(str, 'utf8').digest('hex').toUpperCase();
}

function generateSign(params: Record<string, string>, secret: string): string {
  // 按 key 字典序排序，拼接为 key1value1key2value2...
  const sortedKeys = Object.keys(params).sort();
  let concatStr = '';
  for (const key of sortedKeys) {
    const val = params[key];
    if (val !== undefined && val !== null && val !== '') {
      concatStr += key + val;
    }
  }
  // 前后加 secret
  const signStr = secret + concatStr + secret;
  console.log('  签名串:', signStr.substring(0, 100) + '...');
  return md5(signStr);
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  快麦 ERP API v3 — 正确地址测试');
  console.log('═══════════════════════════════════════\n');
  console.log('  API 入口: https://gw.superboss.cc/router\n');

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const todayStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} 00:00:00`;
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  // 场景 A: session = "" (空) — 有些接口可能不需要
  // 场景 B: session = APP_KEY — 有的ERP用appKey当session
  // 场景 C: 先拿时间接口试试

  const scenarios = [
    { label: 'A: session为空 → erp.trade.list.query', session: '' },
    { label: 'B: session=appKey → erp.trade.list.query', session: APP_KEY },
    { label: 'C: session为空 → open.system.time.get', session: '' },
  ];

  for (const { label, session } of scenarios) {
    console.log(`\n--- ${label} ---`);
    await testRequest(session, timestamp);
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log('\n═══════════════════════════════════════\n');
}

async function testRequest(session: string, timestamp: string) {
  const method = session === '' && Math.random() > 0.5 ? 'open.system.time.get' : 'erp.trade.list.query';
  const actualMethod = 'open.system.time.get'; // 先测时间接口，肯定存在

  const params: Record<string, string> = {
    appKey: APP_KEY,
    method: actualMethod,
    timestamp,
    version: '1.0',
    session,
    sign_method: 'md5',
    format: 'json',
  };

  params.sign = generateSign(params, APP_SECRET);

  console.log('  请求参数:', JSON.stringify({ ...params, sign: '***[HIDDEN]***' }, null, 2));

  try {
    const resp = await axios.post(API_URL, new URLSearchParams(params).toString(), {
      timeout: 15000,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      validateStatus: () => true, // 不抛异常
    });

    console.log(`  HTTP ${resp.status}`);
    const data = resp.data;
    if (typeof data === 'string') {
      console.log('  响应(前500字):', data.substring(0, 500));
    } else {
      console.log('  响应:', JSON.stringify(data, null, 2).substring(0, 1000));
    }

    // 尝试解析 JSON
    try {
      const json = typeof data === 'string' ? JSON.parse(data) : data;
      console.log('  ✅ 返回了 JSON');
    } catch {
      console.log('  ⚠️ 非 JSON 响应');
    }
  } catch (e: any) {
    console.log('  ❌ 异常:', e.message);
    if (e.response) {
      console.log('  HTTP', e.response.status);
      console.log('  Data:', typeof e.response.data === 'string' ? e.response.data.substring(0, 500) : e.response.data);
    }
  }
}

main().catch(console.error);
