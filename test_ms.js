function msToDatetime(ms) {
  if (!ms || ms <= 0 || ms === 946656000000) return '';
  const d = new Date(ms + 8 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+08:00`;
}
// 手撕兔实单 payTime=1786526934000 (2026-08-13 05:09:58 UTC，即北京 13:09:58)
// 等等，前面显示 payTime=2026-08-13T05:09:58.000Z
// 北京时间应该是 13:09:58
const ms=1786536598000; // 用前面 sid=5973932837575096 的 payTime=2026-08-13T05:09:58Z
// 实际时间戳：2026-08-13 05:09:58 UTC = ?
console.log('payTime 1786526934000 ->', msToDatetime(1786526934000));
console.log('payTime 1786536598000 ->', msToDatetime(1786536598000));
