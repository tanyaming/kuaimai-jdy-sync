const fs=require('fs');
const crypto = require('crypto');
const axios = require('axios');
const appKey='384147271', secret='79be46e6e543430baba45be833462274', token='b7314fbd278344d1bd52126e1c52adb4';
function pad(n){return String(n).padStart(2,'0');}
function fmt(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;}
function sign(p,s){const keys=Object.keys(p).filter(k=>k!=='sign').sort();let c='';for(const k of keys){const v=p[k];if(v!==undefined&&v!==null&&v!=='')c+=k+v;}return crypto.createHash('md5').update(s+c+s,'utf8').digest('hex').toUpperCase();}
async function reqKm(biz){const params={appKey,method:'erp.trade.list.query',timestamp:fmt(new Date()),version:'1.0',session:token,sign_method:'md5',format:'json',...biz};params.sign=sign(params,secret);const resp=await axios.post('https://gw.superboss.cc/router', new URLSearchParams(params).toString(),{headers:{'Content-Type':'application/x-www-form-urlencoded'}});return resp.data;}
async function fetchAll(types){let all=[];let pageNo=1;while(true){const r=await reqKm({startTime:'2026-08-13 00:00:00',endTime:'2026-08-13 23:59:59',timeType:'pay_time',types,pageNo,pageSize:200});const list=r.list||[];all=all.concat(list);if(list.length<200)break;pageNo++;await new Promise(x=>setTimeout(x,200));}return all;}
(async()=>{
  // 抖音口径：types=3 的 fxg + types=8 的 sys（抖音拆出的）
  const t3=await fetchAll('3');
  const t8=await fetchAll('8');
  const fxg=t3.filter(o=>o.source==='fxg');
  const sysT8=t8.filter(o=>o.source==='sys');
  const douyin=[...fxg, ...sysT8];
  const sids=new Set(douyin.map(o=>String(o.sid)));
  let pay=0;for(const o of douyin){for(const it of o.orders||[]){pay+=Number(it.payAmount)||Number(it.payment)||0;}}
  console.log('抖音口径(fxg 387 + sys拆分 11) :', sids.size, 'sid, 应付金额', pay.toFixed(2));
  fs.writeFileSync('/app/douyin_final_sids.json', JSON.stringify([...sids]));
})();
