const { fetchAllOrders } = require('./dist/lib/kuaimai.js');
const { mapItemToJiyun } = require('./dist/lib/mapping.js');

function pad(n){return String(n).padStart(2,'0');}
function fmt(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;}

(async()=>{
  const s=new Date('2026-08-13T00:00:00+08:00');
  const e=new Date('2026-08-13T23:59:59+08:00');
  // 用改后的 fetchAllOrders（含 resolveSplitSource），pay_time 维度或 created 维度
  // 同步脚本第一趟用 created，第二趟用 upd_time。这里用 created 覆盖
  const orders = await fetchAllOrders(fmt(s), fmt(e), 'created');
  console.log('8/13 created 维度拉取订单数:', orders.length);

  // 过滤抖音相关：source=fxg（含归入的拆单）+ 原有 fxg
  const fxg = orders.filter(o => o.source === 'fxg' || o.source === 'douyin');
  console.log('抖音(fxg)订单数:', fxg.length);

  // 按 mapItemToJiyun 生成记录，统计 sid 和金额
  const sids=new Set();const oids=new Set();let dupOid=0;
  let pay=0;
  for(const o of fxg){
    const isPdd=o.source==='pdd';
    if(isPdd)continue;
    let hasItem=false;
    for(const item of o.orders||[]){
      const useItemId=o.source==='xhs'||o.source==='sys'||o.isSplitOrder;
      const itemId=item.id!==undefined&&item.id!==null?String(item.id):'';
      const oid=useItemId?(itemId||String(item.oid||'')):String(item.oid||'');
      if(!oid)continue;
      if(oids.has(oid))dupOid++;else oids.add(oid);
      sids.add(String(o.sid));
      pay += Number(item.payAmount)||Number(item.payment)||0;
      hasItem=true;
    }
    if(!hasItem){
      // 无子单的订单也计入 sid
      sids.add(String(o.sid));
    }
  }
  console.log('抖音 sid 数:', sids.size, '(期望 395)');
  console.log('抖音 oid 数:', oids.size, ' 重复oid:', dupOid);
  console.log('抖音应付金额:', pay.toFixed(2), '(期望 24452.82)');

  // 检查手撕兔 8 个拆单是否已归入 fxg
  const tear8=['5973932837575112','5973932837575116','5973932837575120','5973932837575124','5973952911800514','5973952911800518','5973952911800522','5973952911800526'];
  let inFxg=0;
  for(const sid of tear8){const o=fxg.find(x=>String(x.sid)===sid);if(o&&o.source==='fxg'&&o.isSplitOrder)inFxg++;}
  console.log('手撕兔8拆单归入抖音(isSplitOrder):', inFxg, '/8');
})();
