const crypto = require('crypto');
const axios = require('axios');
const appKey='384147271', secret='79be46e6e543430baba45be833462274', token='b7314fbd278344d1bd52126e1c52adb4';
function pad(n){return String(n).padStart(2,'0');}
function fmt(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;}
function sign(p,s){const keys=Object.keys(p).filter(k=>k!=='sign').sort();let c='';for(const k of keys){const v=p[k];if(v!==undefined&&v!==null&&v!=='')c+=k+v;}return crypto.createHash('md5').update(s+c+s,'utf8').digest('hex').toUpperCase();}
async function reqKm(biz){const params={appKey,method:'erp.trade.list.query',timestamp:fmt(new Date()),version:'1.0',session:token,sign_method:'md5',format:'json',...biz};params.sign=sign(params,secret);const resp=await axios.post('https://gw.superboss.cc/router', new URLSearchParams(params).toString(),{headers:{'Content-Type':'application/x-www-form-urlencoded'}});return resp.data;}
(async()=>{
  // 实单 + 拆单的 pay_time / created 对比
  const sids=['5973932837575096','5973932837575112','5973932837575116','5973932837575120','5973932837575124'];
  const sids2=['5973952911800493','5973952911800514','5973952911800518','5973952911800522','5973952911800526'];
  for(const sid of [...sids,...sids2]){
    const r=await reqKm({sid,pageNo:1,pageSize:5});
    const o=(r.list||[])[0];
    if(!o){console.log(sid,'查不到');continue;}
    const pt=o.payTime?new Date(o.payTime).toISOString():'?';
    const ct=o.created?new Date(o.created).toISOString():'?';
    console.log('sid='+sid+' source='+o.source+' splitSid='+o.splitSid+' payTime='+pt+' created='+ct);
  }
})();
