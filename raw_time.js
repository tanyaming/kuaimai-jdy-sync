const crypto = require('crypto');
const axios = require('axios');
const appKey='384147271', secret='79be46e6e543430baba45be833462274', token='b7314fbd278344d1bd52126e1c52adb4';
function pad(n){return String(n).padStart(2,'0');}
function fmt(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;}
function sign(p,s){const keys=Object.keys(p).filter(k=>k!=='sign').sort();let c='';for(const k of keys){const v=p[k];if(v!==undefined&&v!==null&&v!=='')c+=k+v;}return crypto.createHash('md5').update(s+c+s,'utf8').digest('hex').toUpperCase();}
async function reqKm(biz){const params={appKey,method:'erp.trade.list.query',timestamp:fmt(new Date()),version:'1.0',session:token,sign_method:'md5',format:'json',...biz};params.sign=sign(params,secret);const resp=await axios.post('https://gw.superboss.cc/router', new URLSearchParams(params).toString(),{headers:{'Content-Type':'application/x-www-form-urlencoded'}});return resp.data;}
(async()=>{
  const r=await reqKm({sid:'5973932837575096',pageNo:1,pageSize:5});
  const o=(r.list||[])[0];
  console.log('=== 手撕兔实单原始字段 ===');
  console.log('sid=', o.sid);
  console.log('payTime(raw)=', o.payTime);
  console.log('created(raw)=', o.created);
  console.log('updTime(raw)=', o.updTime);
  console.log('auditTime(raw)=', o.auditTime);
  for(const it of o.orders||[]){
    console.log('子单 payTime=', it.payTime, 'consignTime=', it.consignTime);
  }
  // 表格里这单付款时间 13:09:58 北京时间
  console.log('\n校验: payTime=', o.payTime, '→ new Date →', new Date(Number(o.payTime)).toISOString());
})();
