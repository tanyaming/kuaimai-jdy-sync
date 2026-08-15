const crypto = require('crypto');
const axios = require('axios');
const appKey='384147271', secret='79be46e6e543430baba45be833462274', token='b7314fbd278344d1bd52126e1c52adb4';
function pad(n){return String(n).padStart(2,'0');}
function fmt(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;}
function sign(p,s){const keys=Object.keys(p).filter(k=>k!=='sign').sort();let c='';for(const k of keys){const v=p[k];if(v!==undefined&&v!==null&&v!=='')c+=k+v;}return crypto.createHash('md5').update(s+c+s,'utf8').digest('hex').toUpperCase();}
async function reqKm(biz){
  const params={appKey,method:'erp.trade.list.query',timestamp:fmt(new Date()),version:'1.0',session:token,sign_method:'md5',format:'json',...biz};
  params.sign=sign(params,secret);
  const resp=await axios.post('https://gw.superboss.cc/router', new URLSearchParams(params).toString(),{headers:{'Content-Type':'application/x-www-form-urlencoded'}});
  return resp.data;
}
const JDY=httpApi={
  baseURL:'https://api.jiandaoyun.com',
  key:'OBJWjmqevyat2lGP8L41DGrPHJlNbtR19305844F94a8c4690C48e6455E885364',
  app:'6a16d22b6e77d7c680fe0b7f',entry:'6a2a93aff2f0de59304a26da'
};
const jdyAxios=axios.create({baseURL:JDY.baseURL,headers:{'Content-Type':'application/json',Authorization:'Bearer '+JDY.key}});
const SRC_MAP={fxg:'抖音电商',douyin:'抖音电商',taobao:'淘宝',tmall:'天猫',jd:'京东',jd_qqd:'京东',pdd:'拼多多',kuaishou:'快手',wxsph:'视频号',xhs:'小红书',sys:'手动订单'};

async function fetchKmAll(start,end,timeType){
  const all=[];const seen=new Set();let pageNo=1;
  while(true){
    const r=await reqKm({startTime:start,endTime:end,timeType,pageNo,pageSize:100});
    const list=r.list||[];
    if(!list.length)break;
    let added=0;
    for(const o of list){const key=String(o.sid)||o.tid||'';if(!key||seen.has(key))continue;seen.add(key);all.push(o);added++;}
    if(added===0)break;pageNo++;if(pageNo>300)break;
  }
  return all;
}
async function fetchJdyAll(){
  const jall=[];let skip=0;
  while(true){
    const r=await jdyAxios.post('/api/v5/app/entry/data/list',{app_id:JDY.app,entry_id:JDY.entry,limit:100,fields:['oid','sid','payment','pay_time','source'],skip:skip});
    const d=r.data.data||[];jall.push(...d);if(d.length<100)break;skip+=100;
  }
  return jall;
}

(async()=>{
  const kmOrders = await fetchKmAll('2026-08-13 00:00:00','2026-08-13 23:59:59','created');
  const jdyAll = await fetchJdyAll();

  // 快麦聚合
  const kmBySrc={};const kmSids={};
  for(const o of kmOrders){
    const s=SRC_MAP[o.source]||o.source||'?';
    (kmSids[s]=kmSids[s]||new Set()).add(String(o.sid));
  }
  // 简道云按 pay_time 北京日归 8/13
  const jdyBySrc={};
  for(const x of jdyAll){
    const t=String(x.pay_time||'');
    const bj=new Date(new Date(t).getTime()+8*3600*1000);
    if(isNaN(bj))continue;
    if(bj.toISOString().slice(0,10)!=='2026-08-13')continue;
    const s=x.source||'?';
    if(!jdyBySrc[s])jdyBySrc[s]={cnt:0,amt:0};
    jdyBySrc[s].cnt++;jdyBySrc[s].amt+=Number(x.payment||0);
  }

  console.log('======= 8/13 快麦(created) vs 简道云(pay_time北京日) 各平台 =======');
  console.log('平台        | 快麦单数 | 简道云条数 | 简道云金额');
  const allSrc=new Set([...Object.keys(kmSids),...Object.keys(jdyBySrc)]);
  for(const s of [...allSrc].sort()){
    const kmc=kmSids[s]?kmSids[s].size:0;
    const jc=jdyBySrc[s]?jdyBySrc[s].cnt:0;
    const ja=jdyBySrc[s]?jdyBySrc[s].amt.toFixed(2):'0.00';
    const flag = kmc===jc ? 'OK' : (kmc>jc?'快麦多'+(kmc-jc):'简道云多'+(jc-kmc));
    console.log(`  ${s.padEnd(10)} | ${String(kmc).padEnd(8)} | ${String(jc).padEnd(10)} | ${ja}  [${flag}]`);
  }
})().catch(e=>{console.error(e);process.exit(1);});
