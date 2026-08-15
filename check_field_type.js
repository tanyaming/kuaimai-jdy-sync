const axios = require('axios');
const JDY={key:'OBJWjmqevyat2lGP8L41DGrPHJlNbtR19305844F94a8c4690C48e6455E885364',app:'6a16d22b6e77d7c680fe0b7f',entry:'6a2a93aff2f0de59304a26da'};
const jdyAxios=axios.create({baseURL:'https://api.jiandaoyun.com',headers:{'Content-Type':'application/json',Authorization:'Bearer '+JDY.key}});
(async()=>{
  // 获取表单字段定义
  const r=await jdyAxios.post('/api/v5/app/entry/fields',{app_id:JDY.app,entry_id:JDY.entry});
  const fields=r.data.fields||r.data.data||[];
  console.log('字段数:', fields.length);
  for(const f of fields){
    if(['pay_time','created_at','consign_time','upd_time','end_time'].includes(f.key) || f.name&&String(f.name).includes('时间')||f.name&&String(f.name).includes('pay')){
      console.log('字段:', f.key||f.name, '| 名称:', f.name, '| 类型:', f.type);
    }
  }
})();
