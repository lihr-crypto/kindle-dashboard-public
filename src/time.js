const partsCache = new Map();
function formatter(zone) {
  if (!partsCache.has(zone)) partsCache.set(zone, new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }));
  return partsCache.get(zone);
}
export function dateParts(date, zone) {
  const p = Object.fromEntries(formatter(zone).formatToParts(date).filter(x => x.type !== 'literal').map(x => [x.type, Number(x.value)]));
  return p;
}
export function dateKey(date, zone) { const p = dateParts(date, zone); return `${p.year}-${pad(p.month)}-${pad(p.day)}`; }
export function pad(n) { return String(n).padStart(2, '0'); }
export function clockText(date, zone) { const p = dateParts(date, zone); return `${pad(p.hour)}:${pad(p.minute)}`; }
export function localToDate(value, zone) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) throw new Error('日期时间格式无效');
  const expected = Date.parse(value + 'Z');
  if (!Number.isFinite(expected)) throw new Error('日期时间无效');
  const numbers=value.split(/[-T:]/).map(Number);
  const exact=new Date(expected);
  if(exact.getUTCFullYear()!==numbers[0]||exact.getUTCMonth()+1!==numbers[1]||exact.getUTCDate()!==numbers[2]||exact.getUTCHours()!==numbers[3]||exact.getUTCMinutes()!==numbers[4])throw new Error('日期时间无效');
  let epoch = expected;
  for (let i = 0; i < 4; i++) {
    const p = dateParts(new Date(epoch), zone);
    const represented = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const delta = expected - represented;
    if (!delta) break;
    epoch += delta;
  }
  const actual = dateParts(new Date(epoch), zone);
  if (Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second) !== expected) throw new Error('这个本地时间不存在，请检查日期和时区');
  return new Date(epoch);
}
export function calendarDayDiff(later, earlier, zone) { return Math.round((Date.parse(dateKey(later, zone)) - Date.parse(dateKey(earlier, zone))) / 86400000); }
export function monthWeeks(year, month) {
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const start = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const cells = Array(start).fill(null).concat(Array.from({ length: count }, (_, i) => i + 1));
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));
}
const lunarDays = ['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];
export function makeCalendar(now, zone) {
  const p = dateParts(now, zone);
  const lunarParts = Object.fromEntries(new Intl.DateTimeFormat('zh-CN-u-ca-chinese', { timeZone: zone, year: 'numeric', month: 'long', day: 'numeric' }).formatToParts(now).map(x => [x.type, x.value]));
  const start = localToDate(`${p.year}-01-01T00:00`, zone);
  const end = localToDate(`${p.year + 1}-01-01T00:00`, zone);
  const remaining = Math.max(0, end - now);
  const weekday = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
  return { ...p, date: dateKey(now, zone), time: clockText(now, zone), weekday: ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'][weekday], lunarDate: `${lunarParts.month || ''}${lunarDays[Number(lunarParts.day) - 1] || ''}`, lunarYear: lunarParts.yearName || '', weeks: monthWeeks(p.year, p.month), yearProgressPct: (now - start) / (end - start) * 100, remainingDays: Math.floor(remaining / 86400000), remainingHours: Math.floor(remaining / 3600000) % 24, remainingMinutes: Math.floor(remaining / 60000) % 60 };
}
export function resetLabel(iso, now, zone) {
  if (!iso) return '重置时间待更新';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '重置时间待更新';
  if (date <= now) return '已到重置时间，等待更新';
  const day = calendarDayDiff(date, now, zone);
  const p = dateParts(date, zone);
  return `${day === 0 ? '今天' : day === 1 ? '明天' : `${p.month}月${p.day}日`} ${clockText(date, zone)}`;
}
