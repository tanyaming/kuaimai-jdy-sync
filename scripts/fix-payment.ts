/**
 * 金额修复脚本：用快麦子单 payAmount（含运费）重算 payment，更新简道云
 * 用法: tsx scripts/fix-payment.ts --start 2026-08-12 --end 2026-08-12 --source 抖音电商
 */
import { fetchAllOrders } from '../src/lib/kuaimai';
import { config } from '../src/lib/config';
import axios from 'axios';

const http = axios.create({
  baseURL: config.jiyun.baseUrl,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.jiyun.apiKey}` },
});

function pad(n: number) { return String(n).padStart(2, '0'); }
function fmtBeijing(d: Date): string {
  const bj = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return `${bj.getUTCFullYear()}-${pad(bj.getUTCMonth() + 1)}-${pad(bj.getUTCDate())} ${pad(bj.getUTCHours())}:${pad(bj.getUTCMinutes())}:${pad(bj.getUTCSeconds())}`;
}

const SOURCE_MAP: Record<string, string> = {
  fxg: '抖音电商', douyin: '抖音电商', taobao: '淘宝', tmall: '天猫',
  jd: '京东', jd_qqd: '京东', pdd: '拼多多', kuaishou: '快手',
  wxsph: '视频号', xhs: '小红书', sys: '手动订单',
};

async function findByOids(oids: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  for (let i = 0; i < oids.length; i += 100) {
    const chunk = oids.slice(i, i + 100);
    const resp = await http.post('/api/v5/app/entry/data/list', {
      app_id: config.jiyun.appId, entry_id: config.jiyun.entryId,
      limit: chunk.length, fields: ['oid', '_id'],
      filter: { rel: 'and', cond: [{ field: 'oid', method: 'in', value: chunk }] },
    });
    for (const row of resp.data?.data || []) if (row.oid) m.set(row.oid, row._id);
  }
  return m;
}

async function main() {
  const args = process.argv.slice(2);
  const get = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const start = get('--start') || '2026-08-12';
  const end = get('--end') || start;
  const onlySource = get('--source'); // 可选: 中文平台名过滤

  const days: string[] = [];
  const cur = new Date(start + 'T00:00:00+08:00');
  const last = new Date(end + 'T00:00:00+08:00');
  while (cur <= last) {
    days.push(`${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`);
    cur.setDate(cur.getDate() + 1);
  }

  let totalChecked = 0, totalUpdated = 0, totalSkipped = 0;

  for (const day of days) {
    const s = new Date(day + 'T00:00:00+08:00');
    const e = new Date(day + 'T23:59:59+08:00');
    const orders = await fetchAllOrders(fmtBeijing(s), fmtBeijing(e), 'pay_time');
    console.log(`\n=== ${day} 快麦拉取 ${orders.length} 单 ===`);

    let dayUpdated = 0, daySkipped = 0;

    for (const order of orders) {
      const isPdd = order.source === 'pdd';
      const srcName = SOURCE_MAP[order.source || ''] || order.source || '';
      if (onlySource && srcName !== onlySource) continue;

      const items: Array<{ oid: string; payment: number }> = [];
      for (const item of order.orders || []) {
        if (isPdd && item.suits && item.suits.length > 0) {
          for (const suit of item.suits) {
            items.push({ oid: `${order.sid}_${suit.id || ''}`, payment: Math.abs(Number(suit.discountFee) || 0) });
          }
        } else {
          const oid = isPdd ? `${order.sid}_${item.id || ''}` : String(item.oid || '');
          if (!oid || oid === `${order.sid}_`) continue;
          const pay = Number(item.payAmount) || Number(item.payment) || 0;
          items.push({ oid, payment: pay });
        }
      }

      if (items.length === 0) continue;
      totalChecked += items.length;
      const oidMap = await findByOids(items.map(x => x.oid));

      for (const { oid, payment } of items) {
        const dataId = oidMap.get(oid);
        if (!dataId) { daySkipped++; totalSkipped++; continue; } // 简道云缺失，跳过（用同步补）
        try {
          await http.post('/api/v5/app/entry/data/update', {
            app_id: config.jiyun.appId, entry_id: config.jiyun.entryId, data_id: dataId,
            data: { payment: { value: payment } },
          });
          dayUpdated++; totalUpdated++;
        } catch (e: any) {
          console.error(`  更新失败 oid=${oid}: ${e.message?.substring(0, 150)}`);
        }
        await new Promise(r => setTimeout(r, 200));
      }
    }
    console.log(`  ${day} 更新 ${dayUpdated} 条，简道云缺失 ${daySkipped} 条`);
  }

  console.log(`\n完成: 检查 ${totalChecked} 条，更新 ${totalUpdated} 条，简道云缺失 ${totalSkipped} 条`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
