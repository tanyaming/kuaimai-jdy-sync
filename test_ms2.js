const pad=(n)=>String(n).padStart(2,'0');
function show(ms){
  const utc=new Date(ms);
  const bj=new Date(ms + 8*3600*1000);
  console.log(`ms=${ms}`);
  console.log(`  JS Date(UTC): ${utc.toISOString()}`);
  console.log(`  +8h 后按UTC: ${bj.toISOString()}`);
  console.log(`  北京时间(手动): ${bj.getUTCFullYear()}-${pad(bj.getUTCMonth()+1)}-${pad(bj.getUTCDate())} ${pad(bj.getUTCHours())}:${pad(bj.getUTCMinutes())}:${pad(bj.getUTCSeconds())}`);
}
// 手撕兔实单 payTime=1786526934000（之前 API 返回），check_paytime 显示 ISO 是 05:09:58Z
show(1786526934000);
console.log('---');
// 表格里手撕兔付款 13:09:58 北京时间
// 验证 1786526934000 是不是对应北京时间 13:09:58
