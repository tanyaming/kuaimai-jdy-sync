const axios = require('axios');
const fs = require('fs');
const JDY={key:'OBJWjmqevyat2lGP8L41DGrPHJlNbtR19305844F94a8c4690C48e6455E885364',app:'6a16d22b6e77d7c680fe0b7f',entry:'6a2a93aff2f0de59304a26da'};
const jdyAxios=axios.create({baseURL:'https://api.jiandaoyun.com',headers:{'Content-Type':'application/json',Authorization:'Bearer '+JDY.key}});
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const ids=JSON.parse(fs.readFileSync('/app/true_dup_ids.json','utf8'));
  console.log('将删除', ids.length, '条真重复记录');
  let ok=0,fail=0;
  for(const id of ids){
    try{await jdyAxios.post('/api/v5/app/entry/data/delete',{app_id:JDY.app,entry_id:JDY.entry,data_id:id});ok++;}
    catch(e){fail++;console.error('删除失败',id,e.response?.data?.msg||e.message);}
    await sleep(150);
  }
  console.log(`删除完成: 成功${ok} 失败${fail}`);
})();
