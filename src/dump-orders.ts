/**
 * 拉取快麦全部订单数据并输出
 */
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs';

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

  console.log('拉取快麦订单数据...\n');

  // 先查第一页看看 total
  const r1 = await callApi('erp.trade.list.query', {
    timeType: 'created',
    startTime,
    endTime,
    page_no: '1',
    page_size: '100',
  });

  const total = r1.total || r1.totalCount || 0;
  console.log(`总订单数: ${total}`);
  console.log(`第一页获取: ${r1.list?.length || 0} 条\n`);

  // 拉取全部页
  const allOrders = [...(r1.list || [])];
  const pageSize = 100;
  const totalPages = Math.ceil(total / pageSize);

  for (let p = 2; p <= totalPages; p++) {
    const r = await callApi('erp.trade.list.query', {
      timeType: 'created',
      startTime,
      endTime,
      page_no: String(p),
      page_size: String(pageSize),
    });
    if (r.list && r.list.length > 0) {
      allOrders.push(...r.list);
    }
    console.log(`第${p}页: ${r.list?.length || 0} 条, 累计 ${allOrders.length}`);
    await new Promise(r => setTimeout(r, 200));
  }

  // 保存到文件
  const outputPath = '/tmp/kuaimai_orders_full.json';
  fs.writeFileSync(outputPath, JSON.stringify(allOrders, null, 2), 'utf8');
  console.log(`\n完整数据已保存到: ${outputPath}`);
  console.log(`文件大小: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);
  console.log(`订单总数: ${allOrders.length}`);

  // 打印前2条完整数据 + 字段列表
  if (allOrders.length > 0) {
    console.log('\n========== 第1条订单完整数据 ==========');
    console.log(JSON.stringify(allOrders[0], null, 2));

    console.log('\n========== 顶层级字段列表 ==========');
    const topKeys = Object.keys(allOrders[0]).filter(k => k !== 'orders');
    console.log(topKeys.join(', '));

    if (allOrders[0].orders && allOrders[0].orders.length > 0) {
      console.log('\n========== orders[0] (子订单) 完整数据 ==========');
      console.log(JSON.stringify(allOrders[0].orders[0], null, 2));
    }
  }
}

main().catch(console.error);
