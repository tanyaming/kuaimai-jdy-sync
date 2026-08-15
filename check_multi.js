const crypto = require('crypto');
const axios = require('axios');
const appKey='384147271', secret='79be46e6e543430baba45be833462274', token='b7314fbd278344d1bd52126e1c52adb4';
function pad(n){return String(n).padStart(2,'0');}
function fmt(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;}
function sign(p,s){const keys=Object.keys(p).filter(k=>k!=='sign').sort();let c='';for(const k of keys){const v=p[k];if(v!==undefined&&v!==null&&v!=='')c+=k+v;}return crypto.createHash('md5').update(s+c+s,'utf8').digest('hex').toUpperCase();}
async function reqKm(biz){const params={appKey,method:'erp.trade.list.query',timestamp:fmt(new Date()),version:'1.0',session:token,sign_method:'md5',format:'json',...biz};params.sign=sign(params,secret);const resp=await axios.post('https://gw.superboss.cc/router', new URLSearchParams(params).toString(),{headers:{'Content-Type':'application/x-www-form-urlencoded'}});return resp.data;}
(async()=>{
  // 查两个 tid 的子单明细
  for(const tid of ['6928645972706099076','6928656589325959044']){
    const r=await reqKm({tid:tid,pageNo:1,pageSize:100});
    const list=r.list||[];
    console.log('=== tid='+tid+' 返回 '+list.length+' 条 ===');
    for(const o of list){
      console.log('  sid='+o.sid+' source='+o.source+' payment='+o.payment);
      for(const it of o.orders||[]){
        console.log('     item.id='+it.id+' num='+it.num+' title='+it.title+' payAmount='+it.payAmount+' payment='+it.payment);
      }
    }
  }
  // 查两个 0 元单
  for(const sid of ['5973965123951080','5973969976629445']){
    const r=await reqKm({sid:sid,pageNo:1,pageSize:50});
    const o=(r.list||[])[0];
    if(!o){console.log('=== sid='+sid+' 接口查不到 ===');continue;}
    console.log('=== sid='+sid+' source='+o.source+' payment='+o.payment+' tid='+o.tid+' ===');
    for(const it of o.orders||[]){console.log('     item.id='+it.id+' num='+it.num+' payAmount='+it.payAmount+' title='+it.title);}
  }
})();
