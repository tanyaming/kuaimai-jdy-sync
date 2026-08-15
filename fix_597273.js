const axios = require('axios');
const JDY={key:'OBJWjmqevyat2lGP8L41DGrPHJlNbtR19305844F94a8c4690C48e6455E885364',app:'6a16d22b6e77d7c680fe0b7f',entry:'6a2a93aff2f0de59304a26da'};
const jdyAxios=axios.create({baseURL:'https://api.jiandaoyun.com',headers:{'Content-Type':'application/json',Authorization:'Bearer '+JDY.key}});

// sid -> 正确 oid 映射
const MAP={
  '5972733877893143':'5972733877893144',
  '5972733877893146':'5972733877893145',
  '5972733877893148':'5972733877893147',
  '5972733877893150':'5972733877893149',
  '5972733877893152':'5972733877893151',
  '5972733877893154':'5972733877893153',
  '5972733877893156':'5972733877893155',
  '5972733877893158':'5972733877893157',
  '5972733877893160':'5972733877893159',
  '5972733877893162':'5972733877893161',
};

async function find(sid){
  const r=await jdyAxios.post('/api/v5/app/entry/data/list',{app_id:JDY.app,entry_id:JDY.entry,limit:20,fields:['_id','sid','oid','source'],filter:{rel:'and',cond:[{field:'sid',method:'eq',value:[sid]}]}});
  return r.data.data||[];
}

(async()=>{
  let fixed=0, missing=0;
  for(const [sid,newOid] of Object.entries(MAP)){
    const rows=await find(sid);
    if(!rows.length){console.log('❌ sid='+sid+' 未在简道云找到');missing++;continue;}
    for(const row of rows){
      if(row.oid===newOid){console.log('✓ sid='+sid+' 已经是正确 oid，跳过');continue;}
      const u=await jdyAxios.post('/api/v5/app/entry/data/update',{app_id:JDY.app,entry_id:JDY.entry,data_id:row._id,data:{oid:newOid}});
      console.log('✓ sid='+sid+' _id='+row._id+' oid '+row.oid+' -> '+newOid+' | '+(u.data?'ok':JSON.stringify(u.data||u.response?.data||'').slice(0,120)));
      fixed++;
    }
  }
  console.log('\n修正完成: 更新 '+fixed+' 条，缺失 '+missing+' 条');
})();
