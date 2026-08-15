const crypto = require('crypto');
const axios = require('axios');
const appKey='384147271', secret='79be46e6e543430baba45be833462274', token='b7314fbd278344d1bd52126e1c52adb4';
function pad(n){return String(n).padStart(2,'0');}
function fmt(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;}
function sign(p,s){const keys=Object.keys(p).filter(k=>k!=='sign').sort();let c='';for(const k of keys){const v=p[k];if(v!==undefined&&v!==null&&v!=='')c+=k+v;}return crypto.createHash('md5').update(s+c+s,'utf8').digest('hex').toUpperCase();}
async function reqKm(biz){const params={appKey,method:'erp.trade.list.query',timestamp:fmt(new Date()),version:'1.0',session:token,sign_method:'md5',format:'json',...biz};params.sign=sign(params,secret);const resp=await axios.post('https://gw.superboss.cc/router', new URLSearchParams(params).toString(),{headers:{'Content-Type':'application/x-www-form-urlencoded'}});return resp.data;}
const JDY={key:'OBJWjmqevyat2lGP8L41DGrPHJlNbtR19305844F94a8c4690C48e6455E885364',app:'6a16d22b6e77d7c680fe0b7f',entry:'6a2a93aff2f0de59304a26da'};
const jdyAxios=axios.create({baseURL:'https://api.jiandaoyun.com',headers:{'Content-Type':'application/json',Authorization:'Bearer '+JDY.key}});
const SRC_MAP={fxg:'抖音电商',douyin:'抖音电商',taobao:'淘宝',tmall:'天猫',jd:'京东',jd_qqd:'京东',pdd:'拼多多',kuaishou:'快手',wxsph:'视频号',xhs:'小红书',sys:'手动订单'};
async function fetchKmAll(start,end,timeType){const out=[];const seen=new Set();let pageNo=1;while(true){const r=await reqKm({startTime:start,endTime:end,timeType,pageNo,pageSize:100});const list=r.list||[];if(!list.length)break;let added=0;for(const o of list){const key=String(o.sid)||o.tid||'';if(!key||seen.has(key))continue;seen.add(key);out.push(o);added++;}if(added===0)break;pageNo++;if(pageNo>300)break;}return out;}
async function fetchJdyAll(){const out=[];let skip=0;while(true){const r=await jdyAxios.post('/api/v5/app/entry/data/list',{app_id:JDY.app,entry_id:JDY.entry,limit:100,fields:['oid','sid','payment','pay_time','source','_id'],skip:skip});const d=r.data.data||[];out.push(...d);if(d.length<100)break;skip+=100;}return out;}

(async()=>{
  const km=await fetchKmAll('2026-08-13 00:00:00','2026-08-13 23:59:59','created');
  const jdy=await fetchJdyAll();
  // 快麦 sid -> created 时间
  const kmCreated={};
  for(const o of km){const s=SRC_MAP[o.source]||o.source;(kmCreated[String(o.sid)]={src:s,created:o.created});}
  // 简道云按 pay_time 北京日 = 8/13 的 sid
  const jdy813=new Map();
  for(const x of jdy){
    const t=String(x.pay_time||'');const bj=new Date(new Date(t).getTime()+8*3600*1000);
    if(isNaN(bj))continue;if(bj.toISOString().slice(0,10)!=='2026-08-13')continue;
    const sid=String(x.sid);if(!jdy813.has(sid))jdy813.set(sid,[]);
    jdy813.get(sid).push(x);
  }
  // 找简道云多出的 sid（不在快麦 8/13 created 里的）
  console.log('=== 简道云 8/13 有、但快麦 8/13(created) 没有的 sid ===');
  let n=0;
  for(const [sid,rows] of jdy813){
    if(!kmCreated[sid]){
      n++;
      const r0=rows[0];
      const bjPay=new Date(new Date(String(r0.pay_time||'')).getTime()+8*3600*1000).toISOString().slice(0,19);
      console.log(`  sid=${sid} source=${r0.source} 条数=${rows.length} payment=${r0.payment} pay_time=${bjPay} (快麦8/13 created里无此sid)`);
      if(n>40)break;
    }
  }
  console.log('\n总多出 sid 数:', n);
})();
