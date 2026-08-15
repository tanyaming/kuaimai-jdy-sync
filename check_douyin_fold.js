const axios = require('axios');
const JDY={key:'OBJWjmqevyat2lGP8L41DGrPHJlNbtR19305844F94a8c4690C48e6455E885364',app:'6a16d22b6e77d7c680fe0b7f',entry:'6a2a93aff2f0de59304a26da'};
const jdyAxios=axios.create({baseURL:'https://api.jiandaoyun.com',headers:{'Content-Type':'application/json',Authorization:'Bearer '+JDY.key}});
(async()=>{
  // 查 oid=6954947909749052937 或 6954947909749053000 的记录
  for(const oid of ['6954947909749052937','6954947909749053000']){
    const r=await jdyAxios.post('/api/v5/app/entry/data/list',{app_id:JDY.app,entry_id:JDY.entry,limit:20,fields:['oid','sid','tid','source','payment','_id','pay_time'],filter:{rel:'and',cond:[{field:'oid',method:'eq',value:oid}]}});
    console.log('oid='+oid+' 查到',(r.data.data||[]).length,'条');
    for(const x of r.data.data||[])console.log('   _id='+x._id+' sid='+x.sid+' source='+x.source+' payment='+x.payment);
  }
})();
