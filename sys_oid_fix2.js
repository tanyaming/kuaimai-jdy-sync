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
  // 只处理两个"纯手动订单折叠" oid
  const targetOids=['5956947957905695','5972733877893144'];
  // 拉快麦手动订单 sid->item.id（8/1 和 8/12）
  const sid2itemid={};
  for(const day of ['2026-08-01','2026-08-12']){
    const r=await reqKm({startTime:day+' 00:00:00',endTime:day+' 23:59:59',timeType:'created',pageNo:1,pageSize:200});
    for(const o of r.list||[]){if(o.source!=='sys')continue;for(const it of o.orders||[]){sid2itemid[String(o.sid)]=String(it.id);}}
  }
  // 拉简道云这两个 oid 的记录
  const plan=[];
  for(const oid of targetOids){
    const r=await jdyAxios.post('/api/v5/app/entry/data/list',{app_id:JDY.app,entry_id:JDY.entry,limit:20,fields:['oid','sid','_id'],filter:{rel:'and',cond:[{field:'oid',method:'eq',value:oid}]}});
    for(const x of r.data.data||[]){
      const correct=sid2itemid[String(x.sid)];
      if(correct){plan.push({_id:x._id, sid:x.sid, oldOid:x.oid, newOid:correct});}
    }
  }
  console.log('待修正 oid 记录:', plan.length);
  for(const p of plan)console.log('  sid='+p.sid+' oid '+p.oldOid+' -> '+p.newOid);
  if(process.argv[2]!=='--go'){console.log('\n加 --go 执行');return;}
  let ok=0,fail=0;
  for(const p of plan){
    try{await jdyAxios.post('/api/v5/app/entry/data/update',{app_id:JDY.app,entry_id:JDY.entry,data_id:p._id,data:{oid:{value:p.newOid}}});ok++;}
    catch(e){fail++;console.error('失败',p.sid,e.response?.data?.msg||e.message);}
    await sleep(150);
  }
  console.log(`完成: 成功${ok} 失败${fail}`);
})();
