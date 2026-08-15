const crypto = require('crypto');
const axios = require('axios');
const appKey='384147271', secret='79be46e6e543430baba45be833462274', token='b7314fbd278344d1bd52126e1c52adb4';
function pad(n){return String(n).padStart(2,'0');}
function fmt(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;}
function sign(p,s){const keys=Object.keys(p).filter(k=>k!=='sign').sort();let c='';for(const k of keys){const v=p[k];if(v!==undefined&&v!==null&&v!=='')c+=k+v;}return crypto.createHash('md5').update(s+c+s,'utf8').digest('hex').toUpperCase();}
async function reqKm(biz){const params={appKey,method:'erp.trade.list.query',timestamp:fmt(new Date()),version:'1.0',session:token,sign_method:'md5',format:'json',...biz};params.sign=sign(params,secret);const resp=await axios.post('https://gw.superboss.cc/router', new URLSearchParams(params).toString(),{headers:{'Content-Type':'application/x-www-form-urlencoded'}});return resp.data;}
const JDY={key:'OBJWjmqevyat2lGP8L41DGrPHJlNbtR19305844F94a8c4690C48e6455E885364',app:'6a16d22b6e77d7c680fe0b7f',entry:'6a2a93aff2f0de59304a26da'};
const jdyAxios=axios.create({baseURL:'https://api.jiandaoyun.com',headers:{'Content-Type':'application/json',Authorization:'Bearer '+JDY.key}});
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  // 1. 从快麦拉手动订单全量（回溯到 8/1），建立 sid -> item.id 映射
  const sid2itemid={};
  for(const day of ['2026-08-01','2026-08-02','2026-08-03','2026-08-04','2026-08-05','2026-08-06','2026-08-07','2026-08-08','2026-08-09','2026-08-10','2026-08-11','2026-08-12','2026-08-13','2026-08-14']){
    const r=await reqKm({startTime:day+' 00:00:00',endTime:day+' 23:59:59',timeType:'created',pageNo:1,pageSize:200});
    for(const o of (r.list||[])){
      if(o.source!=='sys')continue;
      for(const it of o.orders||[]){sid2itemid[String(o.sid)]=String(it.id);}
    }
  }
  console.log('快麦手动订单 sid 数:', Object.keys(sid2itemid).length);

  // 2. 拉简道云手动订单，找 oid 折叠的（oid 对应的 sid 数 > 1）
  const out=[];let skip=0;
  while(true){
    const r=await jdyAxios.post('/api/v5/app/entry/data/list',{app_id:JDY.app,entry_id:JDY.entry,limit:100,fields:['oid','sid','_id'],filter:{rel:'and',cond:[{field:'source',method:'eq',value:'手动订单'}]},skip:skip});
    const d=r.data.data||[];out.push(...d);if(d.length<100)break;skip+=100;
  }
  console.log('简道云手动订单记录:', out.length);

  // 3. 对每条，如果 oid 该改成 item.id 且当前 oid != item.id，则更新
  let fix=0;const plan=[];
  for(const x of out){
    const correctOid = sid2itemid[String(x.sid)];
    if(correctOid && correctOid !== String(x.oid)){
      plan.push({_id:x._id, sid:x.sid, oldOid:x.oid, newOid:correctOid});
    }
  }
  console.log('需修正 oid 的记录数:', plan.length);
  for(const p of plan)console.log('  sid='+p.sid+' oid '+p.oldOid+' -> '+p.newOid);

  if(process.argv[2]!=='--go'){console.log('\n预览完成，加 --go 执行更新');return;}
  let ok=0,fail=0;
  for(const p of plan){
    try{
      await jdyAxios.post('/api/v5/app/entry/data/update',{app_id:JDY.app,entry_id:JDY.entry,data_id:p._id,data:{oid:{value:p.newOid}}});
      ok++;
    }catch(e){fail++;console.error('失败',p.sid,e.response?.data?.msg||e.message);}
    await sleep(150);
  }
  console.log(`\n修正完成: 成功${ok} 失败${fail}`);
})();
