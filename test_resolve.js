const crypto = require('crypto');
const axios = require('axios');
const appKey='384147271', secret='79be46e6e543430baba45be833462274', token='b7314fbd278344d1bd52126e1c52adb4';
function pad(n){return String(n).padStart(2,'0');}
function fmt(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;}
function sign(p,s){const keys=Object.keys(p).filter(k=>k!=='sign').sort();let c='';for(const k of keys){const v=p[k];if(v!==undefined&&v!==null&&v!=='')c+=k+v;}return crypto.createHash('md5').update(s+c+s,'utf8').digest('hex').toUpperCase();}
async function reqKm(biz){const params={appKey,method:'erp.trade.list.query',timestamp:fmt(new Date()),version:'1.0',session:token,sign_method:'md5',format:'json',...biz};params.sign=sign(params,secret);const resp=await axios.post('https://gw.superboss.cc/router', new URLSearchParams(params).toString(),{headers:{'Content-Type':'application/x-www-form-urlencoded'}});return resp.data;}
async function fetchAll(types){let all=[];let pageNo=1;while(true){const r=await reqKm({startTime:'2026-08-13 00:00:00',endTime:'2026-08-13 23:59:59',timeType:'pay_time',types,pageNo,pageSize:200});const list=r.list||[];all=all.concat(list);if(list.length<200)break;pageNo++;await new Promise(x=>setTimeout(x,200));}return all;}

// 复刻 resolveSplitSource 逻辑
function resolveSplitSource(orders){
  const sidToSource=new Map();
  for(const o of orders){if(o.sid!==undefined&&o.sid!==null)sidToSource.set(String(o.sid),o.source||'');}
  let changed=0;
  for(const o of orders){
    if(o.source!=='sys')continue;
    const splitSid=o.splitSid;
    if(splitSid===undefined||splitSid===null||splitSid===-1||splitSid==='-1')continue;
    const ss=String(splitSid);
    if(ss===(o.sid!==undefined&&o.sid!==null?String(o.sid):''))continue;
    const ps=sidToSource.get(ss);
    if(ps&&ps!=='sys'&&ps!==''){o.source=ps;o.isSplitOrder=true;changed++;}
  }
  return changed;
}

(async()=>{
  // 模拟同步拉取：types=3(平台单) + types=8(拆分单)，合并
  const t3=await fetchAll('3');
  const t8=await fetchAll('8');
  const all=[...t3,...t8];
  // 去重(sid)
  const seen=new Set();const merged=[];
  for(const o of all){if(seen.has(String(o.sid)))continue;seen.add(String(o.sid));merged.push(o);}
  console.log('合并后订单数:', merged.length);
  const changed=resolveSplitSource(merged);
  console.log('归到父平台的 sys 拆单数:', changed);

  // 统计 source 分布
  const bySrc={};for(const o of merged){const s=o.source||'?';bySrc[s]=(bySrc[s]||0)+1;}
  console.log('source 分布:', JSON.stringify(bySrc));

  // 抖音 = fxg（原始+拆单归入）
  const fxg=merged.filter(o=>o.source==='fxg');
  console.log('抖音(fxg)总数:', fxg.length, '(期望 395 有效 + 0元拆单不算)');

  // 检查 oid 唯一性（用 item.id 对 isSplitOrder）
  const oids=new Set();let oidDup=0;
  for(const o of fxg){
    for(const item of o.orders||[]){
      const useItemId=o.source==='xhs'||o.source==='sys'||o.isSplitOrder;
      const oid=useItemId?(String(item.id!==undefined&&item.id!==null?item.id:'')):(String(item.oid||''));
      if(!oid)continue;
      if(oids.has(oid)){oidDup++;console.log('  重复 oid:', oid, 'sid='+o.sid);}
      else oids.add(oid);
    }
  }
  console.log('抖音 oid 重复数:', oidDup, '(期望 0)');
  console.log('抖音唯一 oid 数:', oids.size);

  // 金额（payAmount 求和）
  let pay=0;for(const o of fxg){for(const it of o.orders||[]){pay+=Number(it.payAmount)||Number(it.payment)||0;}}
  console.log('抖音应付金额:', pay.toFixed(2), '(期望 24452.82)');
})();
