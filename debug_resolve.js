const { fetchAllOrders } = require('./dist/lib/kuaimai.js');
(async()=>{
  const orders = await fetchAllOrders('2026-08-13 00:00:00','2026-08-13 23:59:59','pay_time');
  const tear8=['5973932837575112','5973932837575116','5973932837575120','5973932837575124','5973952911800514','5973952911800518','5973952911800522','5973952911800526'];
  const parents=['5973932837575096','5973952911800493'];
  console.log('父单是否在拉取结果里:');
  for(const p of parents){const o=orders.find(x=>String(x.sid)===p);console.log('  sid='+p+' -> '+(o?'存在 source='+o.source:'不存在'));}
  console.log('\n8个拆单状态:');
  for(const s of tear8){const o=orders.find(x=>String(x.sid)===s);console.log('  sid='+s+' -> '+(o?'source='+o.source+' splitSid='+o.splitSid+' isSplitOrder='+o.isSplitOrder:'不存在'));}
  // 看所有 sys 的数量
  const sys=orders.filter(o=>o.source==='sys');
  console.log('\n拉取结果中 source=sys 数量:', sys.length);
  for(const o of sys){console.log('  sys sid='+o.sid+' splitSid='+o.splitSid+' type='+o.type);}
})();
