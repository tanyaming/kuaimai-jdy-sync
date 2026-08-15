const crypto = require('crypto');
const axios = require('axios');
const appKey='384147271', secret='79be46e6e543430baba45be833462274', token='b7314fbd278344d1bd52126e1c52adb4';
function pad(n){return String(n).padStart(2,'0');}
function fmt(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;}
function sign(p,s){const keys=Object.keys(p).filter(k=>k!=='sign').sort();let c='';for(const k of keys){const v=p[k];if(v!==undefined&&v!==null&&v!=='')c+=k+v;}return crypto.createHash('md5').update(s+c+s,'utf8').digest('hex').toUpperCase();}
async function reqKm(biz){const params={appKey,method:'erp.trade.list.query',timestamp:fmt(new Date()),version:'1.0',session:token,sign_method:'md5',format:'json',...biz};params.sign=sign(params,secret);const resp=await axios.post('https://gw.superboss.cc/router', new URLSearchParams(params).toString(),{headers:{'Content-Type':'application/x-www-form-urlencoded'}});return resp.data;}
(async()=>{
  for(const day of ['2026-08-13','2026-08-14']){
    const r=await reqKm({startTime:day+' 00:00:00',endTime:day+' 23:59:59',timeType:'created',pageNo:1,pageSize:200});
    const sys=(r.list||[]).filter(o=>o.source==='sys');
    console.log(day+' sys 订单',sys.length,'单');
    for(const o of sys){
      if(String(o.sid).startsWith('597273')||String(o.tid).startsWith('597273')){
        console.log('  ★ sid='+o.sid+' tid='+o.tid);
        for(const it of o.orders||[]){console.log('    子单 id='+it.id+' oid='+it.oid+' payment='+it.payment);}
      }
    }
    // 也打印所有
    for(const o of sys){
      console.log('  sid='+o.sid+' tid='+o.tid);
    }
  }
})();
