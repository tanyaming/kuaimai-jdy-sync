const axios = require('axios');
const JDY={key:'OBJWjmqevyat2lGP8L41DGrPHJlNbtR19305844F94a8c4690C48e6455E885364',app:'6a16d22b6e77d7c680fe0b7f',entry:'6a2a93aff2f0de59304a26da'};
const jdyAxios=axios.create({baseURL:'https://api.jiandaoyun.com',headers:{'Content-Type':'application/json',Authorization:'Bearer '+JDY.key}});
(async()=>{
  // 统计手动订单：按 source 分组的 oid 唯一性
  const out=[];let skip=0;
  while(true){
    const r=await jdyAxios.post('/api/v5/app/entry/data/list',{app_id:JDY.app,entry_id:JDY.entry,limit:100,fields:['oid','sid','source','pay_time'],filter:{rel:'and',cond:[{field:'source',method:'eq',value:'手动订单'}]},skip:skip});
    const d=r.data.data||[];out.push(...d);if(d.length<100)break;skip+=100;
  }
  console.log('手动订单总记录数:', out.length);
  // oid 是否 = sid（唯一）还是 = item.id（商品ID，重复）
  const oidCount=new Map();
  for(const x of out){oidCount.set(x.oid,(oidCount.get(x.oid)||0)+1);}
  const dupOids=[...oidCount.entries()].filter(([o,c])=>c>1);
  console.log('重复的 oid 数:', dupOids.length);
  let dupRows=0;
  for(const [o,c] of dupOids)dupRows+=c;
  console.log('重复 oid 涉及的行数:', dupRows);
  // 看几个重复 oid 的 sid 是否不同
  for(const [o,c] of dupOids.slice(0,5)){
    const rows=out.filter(x=>x.oid===o);
    console.log('  oid='+o+' '+c+'条, sids='+rows.map(x=>x.sid).join(','));
  }
})();
