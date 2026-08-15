const axios = require('axios');
const fs = require('fs');
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
  const dy=all.filter(x=>x.source==='抖音电商' && x.pay_time && String(x.pay_time).startsWith('2026-08-13'));
  const jdySids=dy.map(x=>String(x.sid));
  // 输出给本地 python 比对
  fs.writeFileSync('/app/jdy_dy_sids.json', JSON.stringify(jdySids));
  console.log('简道云抖音8/13 记录数:', dy.length, ' sid(含重复):', jdySids.length);
})();
