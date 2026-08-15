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
  // 抖音相关：source=抖音电商 或 sid 是手撕兔拆单(手动订单)
  const dy=all.filter(x=>x.source==='抖音电商' && x.pay_time && String(x.pay_time).startsWith('2026-08-13'));
  console.log('简道云 source=抖音电商 + pay_time=8/13:', dy.length, '条');

  // 检查重复：相同 sid 多条
  const bySid=new Map();
  for(const x of dy){const s=String(x.sid);if(!bySid.has(s))bySid.set(s,[]);bySid.get(s).push(x);}
  let dupSid=0;
  for(const [s,rows] of bySid){if(rows.length>1){dupSid++;console.log('  重复sid:', s, 'x'+rows.length, ' oid='+rows.map(r=>r.oid).join(','));}}
  console.log('抖音8/13 中重复的 sid 数:', dupSid);

  // 相同 oid 多条
  const byOid=new Map();
  for(const x of dy){const o=String(x.oid);if(!byOid.has(o))byOid.set(o,[]);byOid.get(o).push(x);}
  let dupOid=0;
  for(const [o,rows] of byOid){if(rows.length>1){dupOid++;console.log('  重复oid:', o, 'x'+rows.length, ' sid='+rows.map(r=>r.sid).join(','));}}
  console.log('抖音8/13 中重复的 oid 数:', dupOid);

  // payment 求和
  let pay=0;for(const x of dy){pay+=Number(x.payment)||0;}
  console.log('payment 求和:', pay.toFixed(2));
})();
