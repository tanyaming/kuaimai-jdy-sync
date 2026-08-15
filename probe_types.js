const crypto = require('crypto');
const axios = require('axios');
const appKey='384147271', secret='79be46e6e543430baba45be833462274', token='b7314fbd278344d1bd52126e1c52adb4';
function pad(n){return String(n).padStart(2,'0');}
function fmt(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;}
function sign(p,s){const keys=Object.keys(p).filter(k=>k!=='sign').sort();let c='';for(const k of keys){const v=p[k];if(v!==undefined&&v!==null&&v!=='')c+=k+v;}return crypto.createHash('md5').update(s+c+s,'utf8').digest('hex').toUpperCase();}
async function reqKm(biz){const params={appKey,method:'erp.trade.list.query',timestamp:fmt(new Date()),version:'1.0',session:token,sign_method:'md5',format:'json',...biz};params.sign=sign(params,secret);const resp=await axios.post('https://gw.superboss.cc/router', new URLSearchParams(params).toString(),{headers:{'Content-Type':'application/x-www-form-urlencoded'}});return resp.data;}
(async()=>{
  // 拿一个已知抖音 sid=5973155558208419，看它的 type 字段
  const one=await reqKm({sid:'5973155558208419',pageNo:1,pageSize:5});
  const o=(one.list||[])[0];
  console.log('抖音实单 sid=5973155558208419 type=', o&&o.type, ' source=', o&&o.source);

  // 拿一个已知拆分手工单 sid=5973932837575112
  const two=await reqKm({sid:'5973932837575112',pageNo:1,pageSize:5});
  const o2=(two.list||[])[0];
  console.log('拆分手工单 sid=5973932837575112 type=', o2&&o2.type, ' source=', o2&&o2.source);

  // 试 types=2 且 source 指定（看是不是必须搭配 source）
  for(const t of ['2','3','5','8']){
    const r=await reqKm({startTime:'2026-08-13 00:00:00',endTime:'2026-08-13 23:59:59',timeType:'pay_time',types:t,pageNo:1,pageSize:20});
    console.log('types='+t+' 返回', (r.list||[]).length, '条');
    if((r.list||[]).length){console.log('   首条 type=',r.list[0].type,'source=',r.list[0].source);}
  }
})();
