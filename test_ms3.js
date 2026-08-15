const pad=(n)=>String(n).padStart(2,'0');
function msToDatetime(ms) {
  if (!ms || ms <= 0 || ms === 946656000000) return '';
  const d = new Date(ms + 8 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+08:00`;
}
const payTime = 1786597798000; // 手撕兔实单 payTime
console.log('payTime =', payTime);
console.log('msToDatetime(payTime) =', msToDatetime(payTime));
console.log('期望: 北京时间 2026-08-13 13:09:58');
console.log('  即 UTC 2026-08-13 05:09:58');
