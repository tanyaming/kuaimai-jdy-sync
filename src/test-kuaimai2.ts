/**
 * 快麦 API 连通性测试 v2 — 测试 GET 请求
 */
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import crypto from 'crypto';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const APP_KEY = process.env.KUAIMAI_APP_KEY || '';
const APP_SECRET = process.env.KUAIMAI_APP_SECRET || '';
const BASE_URL = process.env.KUAIMAI_BASE_URL || 'https://open.kuaimai.com/api';

function generateSign(params: Record<string, string>, secret: string): string {
  const sortedKeys = Object.keys(params).sort();
  let signStr = secret;
  for (const key of sortedKeys) {
    if (key !== 'sign' && params[key] !== undefined && params[key] !== '') {
      signStr += key + params[key];
    }
  }
  signStr += secret;
  return crypto.createHash('md5').update(signStr, 'utf8').digest('hex').toUpperCase();
}

async function tryRequest(httpMethod: 'GET' | 'POST', methodName: string) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const todayStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} 00:00:00`;

  const params: Record<string, string> = {
    app_key: APP_KEY,
    method: methodName,
    timestamp: Math.floor(Date.now() / 1000).toString(),
    sign_method: 'md5',
    start_time: todayStart,
    page: '1',
    page_size: '1',
  };
  params.sign = generateSign(params, APP_SECRET);

  const label = `${httpMethod} ${methodName}`;

  try {
    let resp;
    if (httpMethod === 'GET') {
      resp = await axios.get(BASE_URL, {
        params,
        timeout: 10000,
      });
    } else {
      resp = await axios.post(BASE_URL, new URLSearchParams(params).toString(), {
        timeout: 10000,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
    }

    const data = resp.data;
    const code = data.code;
    const msg = data.msg || data.message || '';

    if (code === 0 || code === 200) {
      console.log(`  ✅ ${label} → 成功! code=${code}`);
      console.log('  ' + JSON.stringify(data).substring(0, 1000));
      return true;
    } else {
      console.log(`  ⚠️  ${label} → code=${code}, msg="${msg}"`);
      console.log('  ' + JSON.stringify(data).substring(0, 500));
      return false;
    }
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      const status = e.response?.status;
      console.log(`  ❌ ${label} → HTTP ${status}`);
      if (status === 405) return false;
      console.log('  ' + (typeof e.response?.data === 'string' ? e.response.data.substring(0, 300) : JSON.stringify(e.response?.data).substring(0, 300)));
    } else {
      console.log(`  ❌ ${label} → ${e}`);
    }
    return false;
  }
}

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  快麦 ERP API v2 — 方法测试');
  console.log('═══════════════════════════════════════\n');

  const methodNames = [
    'erp.trade.list.query',
    'erp.trade.list.get',
    'erp.trade.query',
    'erp.trade.get',
    'erp.trade.search',
  ];

  // 先全测 GET
  console.log('--- GET 请求测试 ---\n');
  for (const m of methodNames) {
    const ok = await tryRequest('GET', m);
    await new Promise((r) => setTimeout(r, 300));
    if (ok) break;
  }

  console.log('\n--- POST 请求测试 ---\n');
  for (const m of methodNames) {
    const ok = await tryRequest('POST', m);
    await new Promise((r) => setTimeout(r, 300));
    if (ok) break;
  }

  console.log('\n═══════════════════════════════════════\n');
}

main().catch(console.error);
