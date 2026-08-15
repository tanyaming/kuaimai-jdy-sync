const crypto = require('crypto');
const axios = require('axios');
const appKey='384147271', secret='79be46e6e543430baba45be833462274', token='b7314fbd278344d1bd52126e1c52adb4';
function pad(n){return String(n).padStart(2,'0');}
function fmt(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;}
function sign(p,s){const keys=Object.keys(p).filter(k=>k!=='sign').sort();let c='';for(const k of keys){const v=p[k];if(v!==undefined&&v!==null&&v!=='')c+=k+v;}return crypto.createHash('md5').update(s+c+s,'utf8').digest('hex').toUpperCase();}
async function reqKm(biz){const params={appKey,method:'erp.trade.list.query',timestamp:fmt(new Date()),version:'1.0',session:token,sign_method:'md5',format:'json',...biz};params.sign=sign(params,secret);const resp=await axios.post('https://gw.superboss.cc/router', new URLSearchParams(params).toString(),{headers:{'Content-Type':'application/x-www-form-urlencoded'}});return resp.data;}
async function fetchAll(startTs,endTs,timeType){let all=[];let pageNo=1;while(true){const r=await reqKm({startTime:startTs,endTime:endTs,timeType,pageNo,pageSize:100});const list=r.list||[];all=all.concat(list);if(list.length<100)break;pageNo++;await new Promise(x=>setTimeout(x,150));}return all;}
(async()=>{
  // 表格里那 10 个 sid，接口能否全部用 sid 精确查到
  const target=['5973932837575112','5973932837575116','5973932837575120','5973932837575124','5973952911800514','5973952911800518','5973952911800522','5973952911800526','5973965123951080','5973969976629445'];
  let found=0, miss=[];
  for(const sid of target){
    const r=await reqKm({sid:sid,pageNo:1,pageSize:10});
    const o=(r.list||[])[0];
    if(o) found++; else miss.push(sid);
  }
  console.log('目标10个sid 接口精确查到:', found, ' 查不到:', miss.length);
  if(miss.length) console.log('查不到的:', miss.join(','));
})();
