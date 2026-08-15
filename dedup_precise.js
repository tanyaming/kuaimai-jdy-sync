const axios = require('axios');
const JDY={key:'OBJWjmqevyat2lGP8L41DGrPHJlNbtR19305844F94a8c4690C48e6455E885364',app:'6a16d22b6e77d7c680fe0b7f',entry:'6a2a93aff2f0de59304a26da'};
const jdyAxios=axios.create({baseURL:'https://api.jiandaoyun.com',headers:{'Content-Type':'application/json',Authorization:'Bearer '+JDY.key}});
(async()=>{
  const out=[];let skip=0;
  while(true){
    const r=await jdyAxios.post('/api/v5/app/entry/data/list',{app_id:JDY.app,entry_id:JDY.entry,limit:100,fields:['oid','sid','payment','source','_id'],skip:skip});
    const d=r.data.data||[];out.push(...d);if(d.length<100)break;skip+=100;
  }
  console.log('全库记录:', out.length);
  // 按 oid 分组
  const byOid=new Map();
  for(const x of out){if(!byOid.has(x.oid))byOid.set(x.oid,[]);byOid.get(x.oid).push(x);}
  // 区分：真重复(oid+source相同) vs oid折叠(oid相同但sid不同)
  const trueDup=[];const folded=[];
  for(const [oid,rows] of byOid){
    if(rows.length<=1)continue;
    const sids=new Set(rows.map(r=>String(r.sid)));
    if(sids.size===1){
      // 同 oid 同 sid = 真重复
      trueDup.push({oid,rows});
    }else{
      folded.push({oid,rows,sids});
    }
  }
  console.log('\n=== 真重复（同oid同sid，应删多余）===', trueDup.length, '组');
  let delIds=[];
  for(const g of trueDup){
    // 保留 _id 最早（字符串最小）的一条，删其余
    const sorted=[...g.rows].sort((a,b)=>a._id<b._id?-1:1);
    console.log(`  oid=${g.oid} source=${g.rows[0].source} ${g.rows.length}条 -> 保留${sorted[0]._id}`);
    for(let i=1;i<sorted.length;i++)delIds.push(sorted[i]._id);
  }
  console.log('\n=== oid折叠（同oid不同sid，是不同订单，不该删）===', folded.length, '组');
  for(const g of folded){
    console.log(`  oid=${g.oid} source=${g.rows[0].source} ${g.rows.length}条, sids=${[...g.sids].join(',')}`);
  }
  console.log('\n真重复需删除:', delIds.length, '条');
  require('fs').writeFileSync('/app/true_dup_ids.json', JSON.stringify(delIds));
})();
