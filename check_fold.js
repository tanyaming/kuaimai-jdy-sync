const crypto = require('crypto');
const axios = require('axios');
const appKey='384147271', secret='79be46e6e543430baba45be833462274', token='b7314fbd278344d1bd52126e1c52adb4';
function pad(n){return String(n).padStart(2,'0');}
function fmt(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;}
function sign(p,s){const keys=Object.keys(p).filter(k=>k!=='sign').sort();let c='';for(const k of keys){const v=p[k];if(v!==undefined&&v!==null&&v!=='')c+=k+v;}return crypto.createHash('md5').update(s+c+s,'utf8').digest('hex').toUpperCase();}
async function reqKm(biz){const params={appKey,method:'erp.trade.list.query',timestamp:fmt(new Date()),version:'1.0',session:token,sign_method:'md5',format:'json',...biz};params.sign=sign(params,secret);const resp=await axios.post('https://gw.superboss.cc/router', new URLSearchParams(params).toString(),{headers:{'Content-Type':'application/x-www-form-urlencoded'}});return resp.data;}
(async()=>{
  // 查 sid 5959651677092241 和 5959651677092230 在快麦是什么
  for(const day of ['2026-08-03','2026-08-04']){
    const r=await reqKm({startTime:day+' 00:00:00',endTime:day+' 23:59:59',timeType:'created',pageNo:1,pageSize:200});
    for(const o of r.list||[]){
      const sid=String(o.sid);
      if(sid==='5959651677092241'||sid==='5959651677092230'){
        console.log('sid='+sid+' source='+o.source+' tid='+o.tid);
        for(const it of o.orders||[]){
          console.log('  子单 id='+it.id+' oid='+it.oid+' numIid='+it.numIid+' payment='+it.payment+' title='+it.title);
        }
      }
    }
  }
})();
