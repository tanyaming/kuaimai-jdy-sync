const axios = require('axios');
const JDY={key:'OBJWjmqevyat2lGP8L41DGrPHJlNbtR19305844F94a8c4690C48e6455E885364',app:'6a16d22b6e77d7c680fe0b7f',entry:'6a2a93aff2f0de59304a26da'};
const jdyAxios=axios.create({baseURL:'https://api.jiandaoyun.com',headers:{'Content-Type':'application/json',Authorization:'Bearer '+JDY.key}});
(async()=>{
  // 拉全量，找所有重复 oid
  const out=[];let skip=0;
  while(true){
    const r=await jdyAxios.post('/api/v5/app/entry/data/list',{app_id:JDY.app,entry_id:JDY.entry,limit:100,fields:['oid','sid','payment','pay_time','source','_id'],skip:skip});
    const d=r.data.data||[];out.push(...d);if(d.length<100)break;skip+=100;
  }
  console.log('简道云总记录数:', out.length);
  const byOid=new Map();
  for(const x of out){if(!byOid.has(x.oid))byOid.set(x.oid,[]);byOid.get(x.oid).push(x);}
  let dupCount=0, dupIds=[];
  for(const [oid,rows] of byOid){
    if(rows.length>1){
      dupCount++;
      // 保留最早创建的 _id，其余删
      for(let i=1;i<rows.length;i++)dupIds.push(rows[i]._id);
    }
  }
  console.log('重复 oid 数:', dupCount, ' 需删除的重复记录数:', dupIds.length);
  // 输出删除清单到一个文件
  require('fs').writeFileSync('/app/dedup_ids.json', JSON.stringify(dupIds));
  console.log('已写入 /app/dedup_ids.json');
})();
