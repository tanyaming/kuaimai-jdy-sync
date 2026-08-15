const axios = require('axios');
const fs = require('fs');
const JDY={key:'OBJWjmqevyat2lGP8L41DGrPHJlNbtR19305844F94a8c4690C48e6455E885364',app:'6a16d22b6e77d7c680fe0b7f',entry:'6a2a93aff2f0de59304a26da'};
const jdyAxios=axios.create({baseURL:'https://api.jiandaoyun.com',headers:{'Content-Type':'application/json',Authorization:'Bearer '+JDY.key}});
(async()=>{
  const out=[];let skip=0;
  while(true){
    const r=await jdyAxios.post('/api/v5/app/entry/data/list',{app_id:JDY.app,entry_id:JDY.entry,limit:100,fields:['oid','sid','payment','pay_time','source','_id','created_at'],skip:skip});
    const d=r.data.data||[];out.push(...d);if(d.length<100)break;skip+=100;
  }
  const byOid=new Map();
  for(const x of out){if(!byOid.has(x.oid))byOid.set(x.oid,[]);byOid.get(x.oid).push(x);}
  console.log('=== 重复 oid 详情（前15个）===');
  let i=0;
  for(const [oid,rows] of byOid){
    if(rows.length>1){
      i++;
      console.log(`\noid=${oid} (${rows.length}条) source=${rows[0].source}`);
      for(const r of rows)console.log(`   _id=${r._id} payment=${r.payment} pay_time=${r.pay_time} created_at=${r.created_at}`);
      if(i>=15)break;
    }
  }
})();
