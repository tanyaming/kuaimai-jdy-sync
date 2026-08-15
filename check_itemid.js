const crypto = require('crypto');
const axios = require('axios');
const appKey='384147271', secret='79be46e6e543430baba45be833462274', token='b7314fbd278344d1bd52126e1c52adb4';
function pad(n){return String(n).padStart(2,'0');}
function fmt(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;}
function sign(p,s){const keys=Object.keys(p).filter(k=>k!=='sign').sort();let c='';for(const k of keys){const v=p[k];if(v!==undefined&&v!==null&&v!=='')c+=k+v;}return crypto.createHash('md5').update(s+c+s,'utf8').digest('hex').toUpperCase();}
async function reqKm(biz){const params={appKey,method:'erp.trade.list.query',timestamp:fmt(new Date()),version:'1.0',session:token,sign_method:'md5',format:'json',...biz};params.sign=sign(params,secret);const resp=await axios.post('https://gw.superboss.cc/router', new URLSearchParams(params).toString(),{headers:{'Content-Type':'application/x-www-form-urlencoded'}});return resp.data;}
(async()=>{
  // 拉各平台各一条订单，看 item.id 和 item.oid 是否都存在、唯一
  for(const plat of ['jd_qqd','wxsph','kuaishou','xhs','pdd']){
    const r=await reqKm({startTime:'2026-08-13 00:00:00',endTime:'2026-08-13 23:59:59',timeType:'pay_time',types:'3',pageNo:1,pageSize:50});
    const o=(r.list||[]).find(x=>x.source===plat);
    if(!o){console.log(plat+': 无样本');continue;}
    console.log('=== '+plat+' sid='+o.sid+' ===');
    for(const it of o.orders||[]){
      console.log('  item.id='+it.id+' item.oid='+it.oid+' (id存在:'+(it.id!==undefined&&it.id!==null&&it.id!=='')+', oid存在:'+(it.oid!==undefined&&it.oid!==null&&it.oid!=='')+')');
    }
  }
})();
