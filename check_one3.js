const crypto = require('crypto');
const axios = require('axios');
const appKey='384147271', secret='79be46e6e543430baba45be833462274', token='b7314fbd278344d1bd52126e1c52adb4';
function pad(n){return String(n).padStart(2,'0');}
function fmt(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;}
function sign(p,s){const keys=Object.keys(p).filter(k=>k!=='sign').sort();let c='';for(const k of keys){const v=p[k];if(v!==undefined&&v!==null&&v!=='')c+=k+v;}return crypto.createHash('md5').update(s+c+s,'utf8').digest('hex').toUpperCase();}
async function reqKm(biz){const params={appKey,method:'erp.trade.list.query',timestamp:fmt(new Date()),version:'1.0',session:token,sign_method:'md5',format:'json',...biz};params.sign=sign(params,secret);const resp=await axios.post('https://gw.superboss.cc/router', new URLSearchParams(params).toString(),{headers:{'Content-Type':'application/x-www-form-urlencoded'}});return resp.data;}
const ts=(n)=>{const v=Number(n);return v? new Date(v).toISOString().replace('T',' ').slice(0,16):'?';};
(async()=>{
  const r=await reqKm({tid:'5972733877893143',pageNo:1,pageSize:100});
  const list=r.list||[];
  console.log('tid查询返回', list.length, '条');
  let totalPayment=0, totalNum=0;
  for(const o of list){
    console.log('sid='+o.sid+' payment='+o.payment+' create='+ts(o.createTime)+' pay='+ts(o.payTime));
    for(const it of o.orders||[]){
      console.log('   item.id='+it.id+' oid='+it.oid+' num='+it.num+' sysTitle='+it.sysTitle+' discountFee='+it.discountFee);
      totalPayment+=parseFloat(it.discountFee||0); totalNum+=Number(it.num||0);
    }
  }
  console.log('合计 discountFee=', totalPayment, ' num=', totalNum);
})();
