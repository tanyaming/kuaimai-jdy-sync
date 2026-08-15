const axios = require('axios');
const JDY={key:'OBJWjmqevyat2lGP8L41DGrPHJlNbtR19305844F94a8c4690C48e6455E885364',app:'6a16d22b6e77d7c680fe0b7f',entry:'6a2a93aff2f0de59304a26da'};
const jdyAxios=axios.create({baseURL:'https://api.jiandaoyun.com',headers:{'Content-Type':'application/json',Authorization:'Bearer '+JDY.key}});

async function fetchAll(){
  const out=[];let skip=0;
  while(true){
    const r=await jdyAxios.post('/api/v5/app/entry/data/list',{app_id:JDY.app,entry_id:JDY.entry,limit:100,fields:['oid','sid','source','payment','pay_time','tid'],skip:skip});
    const d=r.data.data||[];out.push(...d);if(d.length<100)break;skip+=100;
  }
  return out;
}

(async()=>{
  const all=await fetchAll();
  console.log('简道云全库记录数:', all.length);
  // 过滤 source=抖音电商 且 pay_time 在北京时间 8/13
  const dy=all.filter(x=>x.source==='抖音电商' && x.pay_time && String(x.pay_time).startsWith('2026-08-13'));
  console.log('source=抖音电商 且 pay_time=8/13 的记录数:', dy.length);
  // 按 sid 去重
  const sids=new Set(dy.map(x=>String(x.sid)));
  console.log('  去重 sid 数:', sids.size);
  let pay=0;for(const x of dy){pay+=Number(x.payment)||0;}
  console.log('  payment 求和:', pay.toFixed(2));

  // 同时看 source=手动订单 里有几个是抖音拆单（sid 以 5973932837575/5973952911800 开头，即手撕兔拆单）
  const sysTear=all.filter(x=>x.source==='手动订单' && ['5973932837575112','5973932837575116','5973932837575120','5973932837575124','5973952911800514','5973952911800518','5973952911800522','5973952911800526'].includes(String(x.sid)));
  console.log('\n手撕兔8个拆单在简道云里的 source 分布:');
  for(const x of sysTear){console.log('  sid='+x.sid+' source='+x.source+' payment='+x.payment);}
  // 也查这8个 sid 在简道云是否存在、source是什么
  const eight=['5973932837575112','5973932837575116','5973932837575120','5973932837575124','5973952911800514','5973952911800518','5973952911800522','5973952911800526'];
  const found=all.filter(x=>eight.includes(String(x.sid)));
  console.log('\n8个手撕兔拆单 sid 在简道云命中', found.length, '条:');
  for(const x of found){console.log('  sid='+x.sid+' source='+x.source+' oid='+x.oid+' payment='+x.payment+' pay_time='+x.pay_time);}
})();
