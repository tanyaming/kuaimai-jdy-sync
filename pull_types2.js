const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
const appKey='384147271', secret='79be46e6e543430baba45be833462274', token='b7314fbd278344d1bd52126e1c52adb4';
function pad(n){return String(n).padStart(2,'0');}
function fmt(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;}
function sign(p,s){const keys=Object.keys(p).filter(k=>k!=='sign').sort();let c='';for(const k of keys){const v=p[k];if(v!==undefined&&v!==null&&v!=='')c+=k+v;}return crypto.createHash('md5').update(s+c+s,'utf8').digest('hex').toUpperCase();}
async function reqKm(biz){const params={appKey,method:'erp.trade.list.query',timestamp:fmt(new Date()),version:'1.0',session:token,sign_method:'md5',format:'json',...biz};params.sign=sign(params,secret);const resp=await axios.post('https://gw.superboss.cc/router', new URLSearchParams(params).toString(),{headers:{'Content-Type':'application/x-www-form-urlencoded'}});return resp.data;}

// types=2 纯平台订单(含平台拆出去的手工单)，用 pay_time 维度
async function fetchAll(startTs,endTs,timeType){
  let all=[];let pageNo=1;
  while(true){
    const r=await reqKm({startTime:startTs,endTime:endTs,timeType,pageNo,pageSize:200,types:'2'});
    const list=r.list||[];
    all=all.concat(list);
    if(list.length<200)break;
    pageNo++;
    await new Promise(x=>setTimeout(x,200));
  }
  return all;
}

(async()=>{
  const all = await fetchAll('2026-08-13 00:00:00','2026-08-13 23:59:59','pay_time');
  console.log('types=2, pay_time=8/13 返回总条数:', all.length);
  // source 分布
  const bySrc={};
  for(const o of all){const s=o.source||'?';bySrc[s]=(bySrc[s]||0)+1;}
  console.log('source 分布:', JSON.stringify(bySrc));
  // 输出 sid 列表供比对
  const sids=all.map(o=>String(o.sid)).sort();
  fs.writeFileSync('/app/types2_sids.json', JSON.stringify(sids));
  console.log('已写 sid 列表，共', sids.length);
  // 金额：订单应付金额 = 子单 payAmount 求和
  let totalPay=0;
  for(const o of all){for(const it of o.orders||[]){totalPay += Number(it.payAmount)||Number(it.payment)||0;}}
  console.log('应付金额(payAmount求和):', totalPay.toFixed(2));
})();
