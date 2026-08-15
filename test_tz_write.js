const axios = require('axios');
const JDY={key:'OBJWjmqevyat2lGP8L41DGrPHJlNbtR19305844F94a8c4690C48e6455E885364',app:'6a16d22b6e77d7c680fe0b7f',entry:'6a2a93aff2f0de59304a26da'};
const jdyAxios=axios.create({baseURL:'https://api.jiandaoyun.com',headers:{'Content-Type':'application/json',Authorization:'Bearer '+JDY.key}});

function toFieldData(data){const fd={};for(const [k,v] of Object.entries(data)){fd[k]={value:v===null||v===undefined?'':v};}return fd;}

(async()=>{
  // 测试写入：pay_time 用不带时区的北京时间 "2026-08-13 13:09:58"，created_at 用 "+08:00"
  const testSid='TEST_TZ_888888';
  const data={sid:testSid, oid:'TEST_TZ_OID', source:'测试', pay_time:'2026-08-13 13:09:58', created_at:'2026-08-13 13:08:26'};
  const r=await jdyAxios.post('/api/v5/app/entry/data/create',{app_id:JDY.app,entry_id:JDY.entry,data:toFieldData(data)});
  console.log('create 返回:', JSON.stringify(r.data).slice(0,300));
  const dataId=r.data?.data?._id;
  if(!dataId){console.log('未拿到 _id，无法继续');return;}
  // 读回
  const r2=await jdyAxios.post('/api/v5/app/entry/data/list',{app_id:JDY.app,entry_id:JDY.entry,limit:5,fields:['sid','pay_time','created_at'],filter:{rel:'and',cond:[{field:'sid',method:'eq',value:[testSid]}]}});
  console.log('读回:', JSON.stringify(r2.data.data));
  // 删除测试记录
  const r3=await jdyAxios.post('/api/v5/app/entry/data/batch_delete',{app_id:JDY.app,entry_id:JDY.entry,data_ids:[dataId]});
  console.log('删除测试记录:', JSON.stringify(r3.data).slice(0,200));
})();
