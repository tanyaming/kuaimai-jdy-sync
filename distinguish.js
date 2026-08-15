const crypto = require('crypto');
const axios = require('axios');
const appKey='384147271', secret='79be46e6e543430baba45be833462274', token='b7314fbd278344d1bd52126e1c52adb4';
function pad(n){return String(n).padStart(2,'0');}
function fmt(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;}
function sign(p,s){const keys=Object.keys(p).filter(k=>k!=='sign').sort();let c='';for(const k of keys){const v=p[k];if(v!==undefined&&v!==null&&v!=='')c+=k+v;}return crypto.createHash('md5').update(s+c+s,'utf8').digest('hex').toUpperCase();}
async function reqKm(biz){const params={appKey,method:'erp.trade.list.query',timestamp:fmt(new Date()),version:'1.0',session:token,sign_method:'md5',format:'json',...biz};params.sign=sign(params,secret);const resp=await axios.post('https://gw.superboss.cc/router', new URLSearchParams(params).toString(),{headers:{'Content-Type':'application/x-www-form-urlencoded'}});return resp.data;}
(async()=>{
  // 对比：抖音拆出手工单 vs 纯手工订单（真实手动录入）
  console.log('=== 抖音拆出的手工单 ===');
  for(const sid of ['5973932837575112','5973965123951080']){
    const r=await reqKm({sid,pageNo:1,pageSize:5});
    const o=(r.list||[])[0];
    if(!o){console.log(sid,'查不到');continue;}
    console.log('sid='+sid+' type='+o.type+' source='+o.source+' tid='+o.tid+' splitSid='+o.splitSid+' splitType='+o.splitType);
    for(const it of o.orders||[]){console.log('   子单 source='+it.source+' sid='+it.sid+' oid='+it.oid);}
  }
  // 查一个纯手动订单（之前 8/11 的 sys，sid=5956955733547063）
  console.log('\n=== 纯手动订单 ===');
  for(const sid of ['5956955733547063','5972733877893148']){
    const r=await reqKm({sid,pageNo:1,pageSize:5});
    const o=(r.list||[])[0];
    if(!o){console.log(sid,'查不到');continue;}
    console.log('sid='+sid+' type='+o.type+' source='+o.source+' tid='+o.tid+' splitSid='+o.splitSid+' splitType='+o.splitType);
    for(const it of o.orders||[]){console.log('   子单 source='+it.source+' sid='+it.sid+' oid='+it.oid);}
  }
})();
