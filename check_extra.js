const axios = require('axios');
const JDY={key:'OBJWjmqevyat2lGP8L41DGrPHJlNbtR19305844F94a8c4690C48e6455E885364',app:'6a16d22b6e77d7c680fe0b7f',entry:'6a2a93aff2f0de59304a26da'};
const jdyAxios=axios.create({baseURL:'https://api.jiandaoyun.com',headers:{'Content-Type':'application/json',Authorization:'Bearer '+JDY.key}});
async function fetchAll(){
  const out=[];let skip=0;
  while(true){
    const r=await jdyAxios.post('/api/v5/app/entry/data/list',{app_id:JDY.app,entry_id:JDY.entry,limit:100,fields:['oid','sid','source','payment','pay_time','tid','created_at'],skip:skip});
    const d=r.data.data||[];out.push(...d);if(d.length<100)break;skip+=100;
  }
  return out;
}
(async()=>{
  const all=await fetchAll();
  const dy=all.filter(x=>x.source==='抖音电商' && x.pay_time && String(x.pay_time).startsWith('2026-08-13'));
  // 看几个"简道云多"的 sid 的 pay_time 和 created_at
  const samples=['5973653766338643','5973733255950906','5973992846440693','5974586066819444','5975040028948514','5974936929515864'];
  for(const s of samples){
    const row=dy.find(x=>String(x.sid)===s);
    if(row)console.log('sid='+s+' pay_time='+row.pay_time+' created_at='+row.created_at+' payment='+row.payment);
  }
  // 统计 pay_time 的完整值（不是只有日期），看是不是都真的落在 8/13 整天
  const hours={};
  for(const x of dy){const h=String(x.pay_time).slice(11,13);hours[h]=(hours[h]||0)+1;}
  console.log('\npay_time 小时分布(UTC):', JSON.stringify(hours));
})();
