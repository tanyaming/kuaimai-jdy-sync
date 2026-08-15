const fs=require('fs');
const crypto = require('crypto');
const axios = require('axios');
const appKey='384147271', secret='79be46e6e543430baba45be833462274', token='b7314fbd278344d1bd52126e1c52adb4';
function pad(n){return String(n).padStart(2,'0');}
function fmt(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;}
function sign(p,s){const keys=Object.keys(p).filter(k=>k!=='sign').sort();let c='';for(const k of keys){const v=p[k];if(v!==undefined&&v!==null&&v!=='')c+=k+v;}return crypto.createHash('md5').update(s+c+s,'utf8').digest('hex').toUpperCase();}
async function reqKm(biz){const params={appKey,method:'erp.trade.list.query',timestamp:fmt(new Date()),version:'1.0',session:token,sign_method:'md5',format:'json',...biz};params.sign=sign(params,secret);const resp=await axios.post('https://gw.superboss.cc/router', new URLSearchParams(params).toString(),{headers:{'Content-Type':'application/x-www-form-urlencoded'}});return resp.data;}
async function fetchAll(types){
  let all=[];let pageNo=1;
  while(true){
    const r=await reqKm({startTime:'2026-08-13 00:00:00',endTime:'2026-08-13 23:59:59',timeType:'pay_time',types,pageNo,pageSize:200});
    const list=r.list||[];all=all.concat(list);
    if(list.length<200)break;pageNo++;
    await new Promise(x=>setTimeout(x,200));
  }
  return all;
}
(async()=>{
  const t3=await fetchAll('3');
  const t8=await fetchAll('8');
  // 合并：平台订单(3) + 拆分订单(8)中 source=fxg 或 sys 的，去重
  const merged=new Map();
  for(const o of [...t3, ...t8]){merged.set(String(o.sid), o);}
  // 只看抖音相关的：fxg + 平台拆分出的 sys
  // 实际上表格397 = fxg 387 + 拆分单里的 10 个 sys
  const fxg=[...merged.values()].filter(o=>o.source==='fxg');
  const sys=[...merged.values()].filter(o=>o.source==='sys');
  console.log('types=3 + types=8 合并去重后:');
  console.log('  fxg:', fxg.length, ' sys(拆分):', sys.length, ' 合计:', fxg.length+sys.length);
  // 输出完整 sid 供比对
  const allSids=[...merged.values()].map(o=>String(o.sid));
  fs.writeFileSync('/app/combined_sids.json', JSON.stringify(allSids));
  console.log('已写 combined_sids.json，总', allSids.length, '条');
  // 金额
  let pay=0;for(const o of merged.values()){for(const it of o.orders||[]){pay+=Number(it.payAmount)||Number(it.payment)||0;}}
  console.log('应付金额(payAmount求和):', pay.toFixed(2));
})();
