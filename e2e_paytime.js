const { fetchAllOrders } = require('./dist/lib/kuaimai.js');

function pad(n){return String(n).padStart(2,'0');}
function fmt(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;}

(async()=>{
  const s='2026-08-13 00:00:00', e='2026-08-13 23:59:59';
  // pay_time 维度
  const orders = await fetchAllOrders(s, e, 'pay_time');
  console.log('8/13 pay_time 维度拉取订单数:', orders.length);

  const fxg = orders.filter(o => o.source === 'fxg' || o.source === 'douyin');
  console.log('抖音(fxg)订单数:', fxg.length);

  const sids=new Set();const oids=new Set();let dupOid=0;let pay=0;
  for(const o of fxg){
    if(o.source==='pdd')continue;
    for(const item of o.orders||[]){
      const useItemId=o.source==='xhs'||o.source==='sys'||o.isSplitOrder;
      const itemId=item.id!==undefined&&item.id!==null?String(item.id):'';
      const oid=useItemId?(itemId||String(item.oid||'')):String(item.oid||'');
      if(!oid)continue;
      if(oids.has(oid))dupOid++;else oids.add(oid);
      sids.add(String(o.sid));
      pay += Number(item.payAmount)||Number(item.payment)||0;
    }
  }
  console.log('抖音 sid 数:', sids.size, '(期望 395)');
  console.log('抖音 oid 数:', oids.size, ' 重复:', dupOid);
  console.log('抖音应付金额:', pay.toFixed(2), '(期望 24452.82)');

  const tear8=['5973932837575112','5973932837575116','5973932837575120','5973932837575124','5973952911800514','5973952911800518','5973952911800522','5973952911800526'];
  let inFxg=0;
  for(const sid of tear8){const o=fxg.find(x=>String(x.sid)===sid);if(o&&o.source==='fxg'&&o.isSplitOrder)inFxg++;else if(o) console.log('  未归入:', sid, 'source='+o.source, 'splitSid='+o.splitSid, 'isSplitOrder='+o.isSplitOrder);}
  console.log('手撕兔8拆单归入抖音:', inFxg, '/8');
})();
