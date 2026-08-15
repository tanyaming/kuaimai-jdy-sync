const crypto = require('crypto');
const axios = require('axios');
const appKey='384147271', secret='79be46e6e543430baba45be833462274', token='b7314fbd278344d1bd52126e1c52adb4';
function pad(n){return String(n).padStart(2,'0');}
function fmt(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;}
function sign(p,s){const keys=Object.keys(p).filter(k=>k!=='sign').sort();let c='';for(const k of keys){const v=p[k];if(v!==undefined&&v!==null&&v!=='')c+=k+v;}return crypto.createHash('md5').update(s+c+s,'utf8').digest('hex').toUpperCase();}
async function reqKm(biz){const params={appKey,method:'erp.trade.list.query',timestamp:fmt(new Date()),version:'1.0',session:token,sign_method:'md5',format:'json',...biz};params.sign=sign(params,secret);const resp=await axios.post('https://gw.superboss.cc/router', new URLSearchParams(params).toString(),{headers:{'Content-Type':'application/x-www-form-urlencoded'}});return resp.data;}
(async()=>{
  // 1. 扩大时间范围到 8/12~8/14，三种时间维度查 sys
  for(const tt of ['created','upd_time','pay_time']){
    const r=await reqKm({startTime:'2026-08-12 00:00:00',endTime:'2026-08-14 23:59:59',timeType:tt,pageNo:1,pageSize:300});
    const hits=(r.list||[]).filter(o=>String(o.sid).startsWith('597273387789314'));
    console.log(tt+' 维度命中 597273387789314* :', hits.length);
  }
  // 2. 尝试用 sid 精确查询（如果 API 支持 sid 参数）
  const r2=await reqKm({sid:'5972733877893148',pageNo:1,pageSize:50});
  console.log('sid精确查询返回 code=', r2.code, 'msg=', r2.msg||r2.sub_msg||r2.message||'', 'list长度=', (r2.list||[]).length);
  if((r2.list||[]).length) console.log(JSON.stringify(r2.list[0]).slice(0,500));
})();
