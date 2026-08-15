const crypto = require('crypto');
const axios = require('axios');
const appKey='384147271', secret='79be46e6e543430baba45be833462274', token='b7314fbd278344d1bd52126e1c52adb4';
function pad(n){return String(n).padStart(2,'0');}
function fmt(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;}
function sign(p,s){const keys=Object.keys(p).filter(k=>k!=='sign').sort();let c='';for(const k of keys){const v=p[k];if(v!==undefined&&v!==null&&v!=='')c+=k+v;}return crypto.createHash('md5').update(s+c+s,'utf8').digest('hex').toUpperCase();}
async function reqKm(biz){const params={appKey,method:'erp.trade.list.query',timestamp:fmt(new Date()),version:'1.0',session:token,sign_method:'md5',format:'json',...biz};params.sign=sign(params,secret);const resp=await axios.post('https://gw.superboss.cc/router', new URLSearchParams(params).toString(),{headers:{'Content-Type':'application/x-www-form-urlencoded'}});return resp.data;}
(async()=>{
  // 抖音拆出手工单的 splitSid 指向的订单，source 是什么
  const cases=[
    {name:'手撕兔拆单', splitSid:'5973932837575096', expectFxg:true},
    {name:'手撕兔拆单2', splitSid:'5973952911800493', expectFxg:true},
    {name:'纯手动', splitSid:'5956947957905694', expectFxg:false},
    {name:'纯手动2', splitSid:'5972733877893143', expectFxg:false},
  ];
  for(const c of cases){
    const r=await reqKm({sid:c.splitSid,pageNo:1,pageSize:5});
    const o=(r.list||[])[0];
    console.log(c.name+' splitSid='+c.splitSid+' -> source='+(o?o.source:'查不到')+' (期望fxg:'+c.expectFxg+')');
  }
  // 查 0元拆单 5973965123951080 的 splitSid=-1 情况：它的主单是哪个？
  const r0=await reqKm({sid:'5973965123951080',pageNo:1,pageSize:5});
  const o0=(r0.list||[])[0];
  console.log('\n0元拆单5973965123951080: type='+o0.type+' tid='+o0.tid+' splitSid='+o0.splitSid);
  // 它的 tid 是 6928645001681600055-1（带-1后缀），去掉-1查主单
  const tid0='6928645001681600055';
  const rm=await reqKm({tid:tid0,pageNo:1,pageSize:5});
  console.log('主单 tid='+tid0+' 返回', (rm.list||[]).length, '条:');
  for(const o of (rm.list||[])){console.log('  sid='+o.sid+' source='+o.source+' type='+o.type);}
})();
