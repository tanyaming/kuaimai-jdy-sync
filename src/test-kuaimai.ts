/**
 * 快麦 API 快速连通性测试
 * 用法: npx tsx src/test-kuaimai.ts
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

async function main() {
  console.log('═══════════════════════════════════════');
  console.log('  快麦 ERP API 连通性测试');
  console.log('═══════════════════════════════════════\n');

  console.log(`  Base URL: ${BASE_URL}`);
  console.log(`  App Key:  ${APP_KEY}`);
  console.log(`  Secret:   ${APP_SECRET.substring(0, 6)}***\n`);

  // 测试 1: 基本连通性
  console.log('--- 测试 1: 基本连通性 ---');
  try {
    const resp = await axios.get(BASE_URL, { timeout: 10000 });
    console.log('  ✅ 服务器可达');
    console.log('  状态码:', resp.status);
    console.log('  响应头:', JSON.stringify(resp.headers, null, 2).substring(0, 300));
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      console.log('  状态码:', e.response?.status);
      console.log('  响应:', String(e.response?.data).substring(0, 500));
    }
  }

  // 测试 2: 签名请求 — erp.trade.list.query
  console.log('\n--- 测试 2: 订单查询接口 (erp.trade.list.query) ---');

  const method = 'erp.trade.list.query';
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const todayStart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} 00:00:00`;

  const commonParams: Record<string, string> = {
    app_key: APP_KEY,
    method,
    timestamp: Math.floor(Date.now() / 1000).toString(),
    sign_method: 'md5',
  };

  const bizParams: Record<string, string> = {
    start_time: todayStart,
    page: '1',
    page_size: '1',
  };

  const allParams: Record<string, string> = { ...commonParams, ...bizParams };
  allParams.sign = generateSign(allParams, APP_SECRET);

  console.log('  请求参数:', JSON.stringify({ ...allParams, sign: '***' }, null, 2));

  try {
    const resp = await axios.post(BASE_URL, new URLSearchParams(allParams).toString(), {
      timeout: 15000,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    console.log('\n  ✅ 接口连通成功!');
    console.log('  返回数据:');
    console.log(JSON.stringify(resp.data, null, 2).substring(0, 2000));
  } catch (e: unknown) {
    if (axios.isAxiosError(e)) {
      console.log('\n  ❌ 请求失败');
      console.log('  状态码:', e.response?.status);
      console.log('  响应数据:', JSON.stringify(e.response?.data, null, 2).substring(0, 2000));
      console.log('  错误消息:', e.message);
    } else {
      console.log('  ❌ 未知错误:', e);
    }
  }

  // 测试 3: 尝试不同的接口方法名
  console.log('\n--- 测试 3: 尝试其他方法名 ---');

  const methodsToTry = [
    'erp.trade.list.query',
    'erp.trade.list.get',
    'erp.trade.query',
    'erp.trade.get',
    'erp.order.list.query',
    'erp.order.list.get',
    'erp.order.query',
  ];

  for (const testMethod of methodsToTry) {
    const params: Record<string, string> = {
      app_key: APP_KEY,
      method: testMethod,
      timestamp: Math.floor(Date.now() / 1000).toString(),
      sign_method: 'md5',
      start_time: todayStart,
      page: '1',
      page_size: '1',
    };
    params.sign = generateSign(params, APP_SECRET);

    try {
      const resp = await axios.post(BASE_URL, new URLSearchParams(params).toString(), {
        timeout: 10000,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      const data = resp.data;
      const code = data.code;
      const msg = data.msg || data.message || '';

      if (code === 0 || code === 200) {
        console.log(`  ✅ ${testMethod} → code=${code}, msg="${msg}" — 成功!`);
        console.log('  返回数据:', JSON.stringify(data).substring(0, 500));
        break; // 找到了就停止
      } else if (msg && msg.includes('法') && msg.includes('不') && msg.includes('存在')) {
        console.log(`  ❌ ${testMethod} → code=${code}, msg="${msg}" — 方法不存在`);
      } else {
        console.log(`  ⚠️  ${testMethod} → code=${code}, msg="${msg}"`);
      }
    } catch (e: unknown) {
      if (axios.isAxiosError(e)) {
        console.log(`  ❌ ${testMethod} → HTTP ${e.response?.status}`);
      }
    }

    // 间隔 500ms
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log('\n═══════════════════════════════════════\n');
}

main().catch(console.error);
