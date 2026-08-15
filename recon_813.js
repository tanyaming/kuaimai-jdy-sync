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
const SRC_MAP={fxg:'抖音电商',douyin:'抖音电商',taobao:'淘宝',tmall:'天猫',jd:'京东',jd_qqd:'京东',pdd:'拼多多',kuaishou:'快手',wxsph:'视频号',xhs:'小红书',sys:'手动订单'};

// 分页拉全快麦
async function fetchKmAll(start,end,timeType){
  const all=[];const seen=new Set();let pageNo=1;
  while(true){
    const r=await reqKm({startTime:start,endTime:end,timeType,pageNo,pageSize:100});
    const list=r.list||[];
    if(!list.length)break;
    let added=0;
    for(const o of list){
      const key=String(o.sid)||o.tid||'';
      if(!key||seen.has(key))continue;
      seen.add(key);all.push(o);added++;
    }
    if(added===0)break;
    pageNo++;
    if(pageNo>200)break;
  }
  return all;
}

(async()=>{
  // 快麦：8/13 全天，created 维度
  const kmOrders = await fetchKmAll('2026-08-13 00:00:00','2026-08-13 23:59:59','created');
  console.log('快麦 API 8/13 created 拉取', kmOrders.length, '单\n');

  // 按平台聚合快麦
  const kmBySrc={};
  for(const o of kmOrders){
    const s=SRC_MAP[o.source]||o.source||'?';
    if(!kmBySrc[s])kmBySrc[s]={cnt:0,amt:0,sids:new Set()};
    kmBySrc[s].cnt++;
    kmBySrc[s].sids.add(String(o.sid));
    // 快麦金额：按平台
    let amt=0;
    if(o.source==='pdd'){amt=Number(o.cost||0)+Number(o.grossProfit||0)+Number(o.actualPostFee||0);}
    else {
      // 其他平台：子单 payAmount 求和
      for(const it of o.orders||[]){amt+=Number(it.payAmount)||Number(it.payment)||0;}
    }
    kmBySrc[s].amt+=amt;
  }

  console.log('======= 快麦 API 8/13 各平台 =======');
  for(const s of Object.keys(kmBySrc).sort()){
    const x=kmBySrc[s];
    console.log(`  ${s}: ${x.sids.size} 单(sid) / ${x.amt.toFixed(2)} 元`);
  }

  // 简道云：全量拉，按 pay_time 北京日归 8/13
  const jd=http=>{};
})().catch(e=>{console.error(e);process.exit(1);});
