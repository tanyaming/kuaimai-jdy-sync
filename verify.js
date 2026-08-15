const axios = require('axios');
const JDY={key:'OBJWjmqevyat2lGP8L41DGrPHJlNbtR19305844F94a8c4690C48e6455E885364',app:'6a16d22b6e77d7c680fe0b7f',entry:'6a2a93aff2f0de59304a26da'};
const jdyAxios=axios.create({baseURL:'https://api.jiandaoyun.com',headers:{'Content-Type':'application/json',Authorization:'Bearer '+JDY.key}});
(async()=>{
  const out=[];let skip=0;
  while(true){
    const r=await jdyAxios.post('/api/v5/app/entry/data/list',{app_id:JDY.app,entry_id:JDY.entry,limit:100,fields:['oid','sid','source','payment','_id'],skip:skip});
    const d=r.data.data||[];out.push(...d);if(d.length<100)break;skip+=100;
  }
  console.log('全库记录数:', out.length);
  // 检查是否还有 oid+source 完全重复
  const byKey=new Map();
  for(const x of out){const k=x.oid+'|'+String(x.sid);if(!byKey.has(k))byKey.set(k,[]);byKey.get(k).push(x);}
  let remainingDup=0;
  for(const [k,rows] of byKey){if(rows.length>1){remainingDup++;console.log('  仍重复:',k,'x',rows.length);}}
  console.log('剩余完全重复(oid+sid):', remainingDup, '组');
})();
