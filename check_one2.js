const crypto = require('crypto');
const axios = require('axios');
const appKey='384147271', secret='79be46e6e543430baba45be833462274', token='b7314fbd278344d1bd52126e1c52adb4';
function pad(n){return String(n).padStart(2,'0');}
function fmt(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;}
function sign(p,s){const keys=Object.keys(p).filter(k=>k!=='sign').sort();let c='';for(const k of keys){const v=p[k];if(v!==undefined&&v!==null&&v!=='')c+=k+v;}return crypto.createHash('md5').update(s+c+s,'utf8').digest('hex').toUpperCase();}
async function reqKm(biz){const params={appKey,method:'erp.trade.list.query',timestamp:fmt(new Date()),version:'1.0',session:token,sign_method:'md5',format:'json',...biz};params.sign=sign(params,secret);const resp=await axios.post('https://gw.superboss.cc/router', new URLSearchParams(params).toString(),{headers:{'Content-Type':'application/x-www-form-urlencoded'}});return resp.data;}
const ts=(n)=>new Date(Number(n)).toISOString().replace('T',' ').slice(0,19)+' (UTC)';
(async()=>{
  const sids=['5972733877893148','5972733877893143','5972733877893146','5972733877893150','5972733877893158','5972733877893152','5972733877893160','5972733877893156','5972733877893154','5972733877893162'];
  for(const s of sids){
    const r=await reqKm({sid:s,pageNo:1,pageSize:10});
    const o=(r.list||[])[0];
    if(!o){console.log(s,'查不到');continue;}
    console.log('sid='+s+' | create='+(o.createTime||o.created||'?')+' | pay='+(o.payTime||'?')+' | payment='+o.payment+' | source='+o.source);
    console.log('   子单 tid='+(o.orders&&o.orders[0]&&o.orders[0].tid)+' id='+(o.orders&&o.orders[0]&&o.orders[0].id)+' sysTitle='+(o.orders&&o.orders[0]&&o.orders[0].sysTitle));
  }
})();
