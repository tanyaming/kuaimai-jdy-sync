const axios = require('axios');
const JDY={key:'OBJWjmqevyat2lGP8L41DGrPHJlNbtR19305844F94a8c4690C48e6455E885364',app:'6a16d22b6e77d7c680fe0b7f',entry:'6a2a93aff2f0de59304a26da'};
const jdyAxios=axios.create({baseURL:'https://api.jiandaoyun.com',headers:{'Content-Type':'application/json',Authorization:'Bearer '+JDY.key}});
(async()=>{
  // 查手撕兔实单 sid=5973932837575096 的完整记录
  const r=await jdyAxios.post('/api/v5/app/entry/data/list',{
    app_id:JDY.app,entry_id:JDY.entry,limit:10,
    fields:['oid','sid','source','payment','pay_time','created_at','tid'],
    filter:{rel:'and',cond:[{field:'sid',method:'eq',value:['5973932837575096']}]}
  });
  const rows=r.data.data||[];
  console.log('手撕兔实单记录:');
  for(const row of rows){console.log(JSON.stringify(row,null,2));}
})();
