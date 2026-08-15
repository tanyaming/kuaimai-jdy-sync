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
  // 抖音实单
  const fxg=t3.filter(o=>o.source==='fxg');
  console.log('types=3 中 source=fxg(抖音):', fxg.length);
  // types=8 里 source=sys 的，看哪些属于抖音拆单
  const sys8=t8.filter(o=>o.source==='sys');
  console.log('types=8 中 source=sys:', sys8.length);
  for(const o of sys8){
    console.log('  sys sid='+o.sid+' tid='+o.tid+' type='+o.type+' payment='+o.payment);
  }
  // 目标10个 ti 验证
  const target=['5973932837575112','5973932837575116','5973932837575120','5973932837575124','5973952911800514','5973952911800518','5973952911800522','5973952911800526','5973965123951080','5973969976629445'];
  console.log('\ntypes=8 里包含目标10个中的:');
  const t8sids=new Set(t8.map(o=>String(o.sid)));
  for(const s of target){console.log('  '+s+' -> '+(t8sids.has(s)?'在types=8':'不在types=8'));}
})();
