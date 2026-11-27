import { collectWeather } from './weather.js';
import { collectQuota } from './quota.js';
import { astronomy } from './astronomy.js';
import { makeCalendar } from './time.js';
import { chooseTodos } from './store.js';

export function sourceView(source, now, freshMs, expireMs) {
  if (!source?.value || !source.fetchedAt) return { status: 'unavailable', value: null, fetchedAt: null, error: source?.error || null };
  const age = now - new Date(source.fetchedAt);
  const status = age > expireMs ? 'expired' : age > freshMs || source.error ? 'stale' : 'fresh';
  return { status, value: status === 'expired' ? null : source.value, fetchedAt: source.fetchedAt, error: source.error || null };
}
export class DashboardService {
  constructor(store, { now = () => new Date(), weatherReader = collectWeather, quotaReader = collectQuota } = {}) {
    this.store = store; this.now = now; this.weatherReader = weatherReader; this.quotaReader = quotaReader;
    this.weather = store.cache('weather'); this.quota = store.cache('quota'); this.pending = null; this.lastWeatherAttempt = 0; this.lastQuotaAttempt = 0;
    this.device = { connected: false, batteryPct: null, lastSeenAt: null };
  }
  async refresh(force = false) {
    if (this.pending) return this.pending;
    const now = this.now(); const config = this.store.config();
    const signature = JSON.stringify([config.latitude,config.longitude,config.timeZone]);
    if (this.weather?.signature !== signature) { this.weather = null; this.store.clearCache('weather'); this.lastWeatherAttempt = 0; }
    const jobs = [];
    if (force || now - this.lastWeatherAttempt >= 15 * 60000) {
      this.lastWeatherAttempt = now.getTime();
      jobs.push(Promise.resolve().then(() => this.weatherReader(config, now)).then(value => { if(JSON.stringify([this.store.config().latitude,this.store.config().longitude,this.store.config().timeZone])!==signature)return;this.weather = { value, fetchedAt: this.now().toISOString(), signature, error: null }; this.store.setCache('weather', this.weather); }).catch(() => { if(JSON.stringify([this.store.config().latitude,this.store.config().longitude,this.store.config().timeZone])===signature)this.weather = { ...this.weather, signature, error: '天气暂时连接失败' }; }));
    }
    if (force || now - this.lastQuotaAttempt >= 5 * 60000) {
      this.lastQuotaAttempt = now.getTime();
      jobs.push(Promise.resolve().then(() => this.quotaReader()).then(value => { this.quota = { value, fetchedAt: this.now().toISOString(), error: null }; this.store.setCache('quota', this.quota); }).catch(() => { this.quota = { ...this.quota, error: 'Codex 额度暂不可用，请检查该主机的 CLI 登录状态' }; }));
    }
    this.pending = Promise.allSettled(jobs).then(() => { this.pending = null;const current=this.store.config();if(JSON.stringify([current.latitude,current.longitude,current.timeZone])!==signature){this.lastWeatherAttempt=0;queueMicrotask(()=>void this.refresh());} });
    return this.pending;
  }
  snapshot() {
    const now = this.now(); const config = this.store.config();
    const device = { ...this.device, connected: this.device.lastSeenAt ? now - new Date(this.device.lastSeenAt) < 15 * 60000 : false };
    const weather=this.weather?.signature===JSON.stringify([config.latitude,config.longitude,config.timeZone])?this.weather:null;
    return { version: 1, mode: 'live', generatedAt: now.toISOString(), location: config, calendar: makeCalendar(now, config.timeZone), astronomy: astronomy(now, config), weather: sourceView(weather, now, 30 * 60000, 2 * 3600000), quota: sourceView(this.quota, now, 10 * 60000, 30 * 60000), todos: chooseTodos(this.store.todos(), now, config.timeZone), device, selectedPage: config.selectedPage };
  }
  deviceStatus(input) {
    if (input.batteryPct !== null && (typeof input.batteryPct !== 'number' || !Number.isFinite(input.batteryPct) || input.batteryPct < 0 || input.batteryPct > 100)) throw new Error('设备电量无效');
    this.device = { connected: true, batteryPct: input.batteryPct, lastSeenAt: this.now().toISOString() };
  }
}
export function demoSnapshot() {
  const now = new Date('2026-10-13T18:09:00+09:00');
  const location = { name: '东京（示例）', latitude: 35.68, longitude: 139.69, timeZone: 'Asia/Tokyo', locationConfirmed: true, selectedPage: 'weather' };
  const fetchedAt = '2026-10-13T18:06:00+09:00';
  const updatedAt = now.toISOString();
  const todos = [
    { id: 1, title: '确认 Dashboard 布局', priority: 'high', dueAt: '2026-10-13T19:00:00+09:00', completed: false, updatedAt },
    { id: 2, title: '阅读 30 分钟', priority: 'normal', dueAt: '2026-10-13T20:00:00+09:00', completed: false, updatedAt },
    { id: 3, title: '整理明日待办', priority: 'normal', dueAt: '2026-10-13T21:00:00+09:00', completed: false, updatedAt },
    { id: 4, title: '完成今日复盘', priority: 'normal', dueAt: null, completed: true, updatedAt }
  ];
  return { version: 1, mode: 'demo', generatedAt: now.toISOString(), location, calendar: makeCalendar(now, location.timeZone), astronomy: astronomy(now, location), weather: { status: 'fresh', fetchedAt, error: null, value: { temperatureC: 24, feelsLikeC: 25, humidityPct: 68, windKph: 9, windDirection: '东北', description: '多云', weatherCode: 3, maxTempC: 26, minTempC: 19, sunset: '2026-10-13T17:09:00+09:00', forecast: [24,23,22,21,21,20,20,22].map((temperatureC, i) => ({ at: new Date(new Date('2026-10-13T18:00:00+09:00').getTime() + i * 2 * 3600000).toISOString(), temperatureC, rainPct: [60,35,20,10,10,5,5,10][i] })) } }, quota: { status: 'fresh', fetchedAt, error: null, value: { windows: [{ key: 'primary', label: '5 小时窗口', remainingPct: 78, usedPct: 22, durationMinutes: 300, resetAt: '2026-10-13T21:27:00+09:00' },{ key: 'secondary', label: '本周窗口', remainingPct: 64, usedPct: 36, durationMinutes: 10080, resetAt: '2026-10-16T08:00:00+09:00' }] } }, todos: chooseTodos(todos, now, location.timeZone), device: { connected: true, batteryPct: 75, lastSeenAt: now.toISOString() }, selectedPage: 'weather' };
}
