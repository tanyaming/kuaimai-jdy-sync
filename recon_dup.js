const axios = require('axios');
const JDY={key:'OBJWjmqevyat2lGP8L41DGrPHJlNbtR19305844F94a8c4690C48e6455E885364',app:'6a16d22b6e77d7c680fe0b7f',entry:'6a2a93aff2f0de59304a26da'};
const jdyAxios=axios.create({baseURL:'https://api.jiandaoyun.com',headers:{'Content-Type':'application/json',Authorization:'Bearer '+JDY.key}});
(async()=>{
  const out=[];let skip=0;
  while(true){
    const r=await jdyAxios.post('/api/v5/app/entry/data/list',{app_id:JDY.app,entry_id:JDY.entry,limit:100,fields:['oid','sid','payment','pay_time','source'],skip:skip});
    const d=r.data.data||[];out.push(...d);if(d.length<100)break;skip+=100;
  }
  // 只看 pay_time 北京日 8/13
  const jdy813=out.filter(x=>{const t=String(x.pay_time||'');const bj=new Date(new Date(t).getTime()+8*3600*1000);return !isNaN(bj)&&bj.toISOString().slice(0,10)==='2026-08-13';});
  // 按 source + sid 分组找重复
  const byKey=new Map();
  for(const x of jdy813){const k=x.source+'|'+x.sid;if(!byKey.has(k))byKey.set(k,[]);byKey.get(k).push(x);}
  console.log('8/13 各平台：sid 唯一数 vs 记录条数（找重复）');
  const bySrc={};
  for(const [k,rows] of byKey){const src=k.split('|')[0];if(!bySrc[src])bySrc[src]={sids:0,rows:0,dup:0};bySrc[src].sids++;bySrc[src].rows+=rows.length;if(rows.length>1)bySrc[src].dup++;}
  for(const s of Object.keys(bySrc).sort()){
    const x=bySrc[s];
    console.log(`  ${s}: ${x.sids}个sid / ${x.rows}条 / 其中多条的sid数=${x.dup}`);
  }
  // 细看拼多多重复
  console.log('\n=== 拼多多 8/13 多条记录的 sid 明细 ===');
  for(const [k,rows] of byKey){
    if(k.startsWith('拼多多')&&rows.length>1){
      console.log('  sid='+rows[0].sid+' 共'+rows.length+'条:');
      for(const r of rows)console.log('     oid='+r.oid+' payment='+r.payment);
    }
  }
})();
