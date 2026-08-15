const axios = require('axios');
const JDY={key:'OBJWjmqevyat2lGP8L41DGrPHJlNbtR19305844F94a8c4690C48e6455E885364',app:'6a16d22b6e77d7c680fe0b7f',entry:'6a2a93aff2f0de59304a26da'};
const jdyAxios=axios.create({baseURL:'https://api.jiandaoyun.com',headers:{'Content-Type':'application/json',Authorization:'Bearer '+JDY.key}});
(async()=>{
  // 查表单元数据（app 定义）
  const r=await jdyAxios.post('/api/v5/app/get',{app_id:JDY.app});
  const app=r.data.app||r.data.data||{};
  const entries=app.entries||[];
  console.log('entries 数:', entries.length);
  const e=entries.find(x=>x.entry_id===JDY.entry || x._id===JDY.entry) || entries[0];
  if(e){
    // 打印字段定义
    const fields=e.fields||[];
    console.log('字段数:', fields.length);
    for(const f of fields){
      const name=f.name||f._id||'';
      if(['pay_time','created_at','付款时间','下单时间','consign_time'].includes(name) || name.includes('时间')){
        console.log(JSON.stringify({name:f.name, key:(f._id||f.key), type:f.type}));
      }
    }
  }
})();
