import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { dateKey, localToDate } from './time.js';

export const DEFAULT_CONFIG = { name: '东京（示例）', latitude: 35.68, longitude: 139.69, timeZone: 'Asia/Tokyo', locationConfirmed: true, selectedPage: 'weather', locationMode: 'fixed', locationUpdatedAt: null };
// 用环境变量 DEFAULT_LOCATION（JSON）设置默认地区，真实地区不写进仓库。
export function parseDefaultLocation(raw) {
  if (raw == null || raw === '') return {};
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object');
    const out = {};
    if (typeof v.name === 'string' && v.name.trim() && v.name.length <= 60 && !/[\u0000-\u001f]/.test(v.name)) out.name = v.name;
    for (const [key, max] of [['latitude', 90], ['longitude', 180]]) if (typeof v[key] === 'number' && Number.isFinite(v[key]) && Math.abs(v[key]) <= max) out[key] = v[key];
    if (('latitude' in out) !== ('longitude' in out)) { delete out.latitude; delete out.longitude; console.warn('DEFAULT_LOCATION 需要同时提供有效的 latitude 和 longitude，已忽略坐标'); }
    if (typeof v.timeZone === 'string') { try { new Intl.DateTimeFormat('en', { timeZone: v.timeZone }); out.timeZone = v.timeZone; } catch {} }
    return out;
  } catch { console.warn('DEFAULT_LOCATION 无效，已使用示例地区'); return {}; }
}
export function validateConfig(patch) {
  const allowed = new Set(Object.keys(DEFAULT_CONFIG));
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('设置格式无效');
  if (Object.keys(patch).some(k => !allowed.has(k))) throw new Error('未知设置字段');
  if ('name' in patch && (typeof patch.name !== 'string' || !patch.name.trim() || patch.name.length > 60)) throw new Error('城市名称应为 1–60 个字符');
  for (const [key, max] of [['latitude', 90], ['longitude', 180]]) if (key in patch && (typeof patch[key] !== 'number' || !Number.isFinite(patch[key]) || Math.abs(patch[key]) > max)) throw new Error('经纬度超出范围');
  if ('timeZone' in patch) { try { new Intl.DateTimeFormat('en', { timeZone: patch.timeZone }); } catch { throw new Error('时区无效'); } }
  if ('locationConfirmed' in patch && typeof patch.locationConfirmed !== 'boolean') throw new Error('地点确认状态无效');
  if ('selectedPage' in patch && !['weather','work'].includes(patch.selectedPage)) throw new Error('页面无效');
  if ('locationMode' in patch && !['fixed','device'].includes(patch.locationMode)) throw new Error('定位模式无效');
  if ('locationUpdatedAt' in patch && patch.locationUpdatedAt!==null && (typeof patch.locationUpdatedAt!=='string'||!Number.isFinite(Date.parse(patch.locationUpdatedAt)))) throw new Error('定位时间无效');
  return patch;
}
export function validateTodo(input, config, partial = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('待办格式无效');
  const out = {};
  if (!partial || 'title' in input) {
    if (typeof input.title !== 'string' || !input.title.trim() || [...input.title.trim()].length > 100) throw new Error('事项标题应为 1–100 个字符');
    if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input.title))throw new Error('事项包含不可显示字符');
    out.title = input.title.trim();
  }
  if ('priority' in input) { if (!['normal','high'].includes(input.priority)) throw new Error('优先级无效'); out.priority = input.priority; }
  if ('completed' in input) { if (typeof input.completed !== 'boolean') throw new Error('完成状态无效'); out.completed = input.completed; }
  if ('dueLocal' in input) out.dueAt = input.dueLocal ? localToDate(input.dueLocal, config.timeZone).toISOString() : null;
  else if ('dueAt' in input) {
    if (input.dueAt !== null && (typeof input.dueAt !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(input.dueAt) || !Number.isFinite(Date.parse(input.dueAt)))) throw new Error('截止时间应带时区');
    out.dueAt = input.dueAt ? new Date(input.dueAt).toISOString() : null;
  }
  return out;
}
export class Store {
  constructor(dir, now = () => new Date()) {
    mkdirSync(dir, { recursive: true, mode: 0o700 }); chmodSync(dir, 0o700);
    this.now = now;
    this.db = new DatabaseSync(join(dir, 'dashboard.sqlite'));
    chmodSync(join(dir, 'dashboard.sqlite'), 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS todos (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, due_at TEXT, priority TEXT NOT NULL DEFAULT 'normal', completed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);`);
    if (!this.db.prepare('SELECT 1 FROM settings WHERE key=?').get('config')) this.db.prepare('INSERT INTO settings VALUES (?,?)').run('config', JSON.stringify({ ...DEFAULT_CONFIG, ...parseDefaultLocation(process.env.DEFAULT_LOCATION) }));
  }
  config() { return JSON.parse(this.db.prepare('SELECT value FROM settings WHERE key=?').get('config').value); }
  setConfig(patch) { const next = { ...this.config(), ...validateConfig(patch) }; this.db.prepare('UPDATE settings SET value=? WHERE key=?').run(JSON.stringify(next), 'config'); return next; }
  cache(key) { const row = this.db.prepare('SELECT value FROM cache WHERE key=?').get(key); return row ? JSON.parse(row.value) : null; }
  setCache(key, value) { this.db.prepare('INSERT INTO cache VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value)); }
  clearCache(key) { this.db.prepare('DELETE FROM cache WHERE key=?').run(key); }
  todos() { return this.db.prepare('SELECT * FROM todos ORDER BY id DESC').all().map(row => this.map(row)); }
  map(row) { return { id: row.id, title: row.title, dueAt: row.due_at, priority: row.priority, completed: !!row.completed, createdAt: row.created_at, updatedAt: row.updated_at }; }
  createTodo(input) {
    const value = validateTodo(input, this.config()); const now = this.now().toISOString();
    const result = this.db.prepare('INSERT INTO todos(title,due_at,priority,completed,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(value.title, value.dueAt || null, value.priority || 'normal', value.completed ? 1 : 0, now, now);
    return this.todo(Number(result.lastInsertRowid));
  }
  todo(id) { const row = this.db.prepare('SELECT * FROM todos WHERE id=?').get(id); return row ? this.map(row) : null; }
  updateTodo(id, input) {
    const old = this.todo(id); if (!old) return null;
    const next = { ...old, ...validateTodo(input, this.config(), true) };
    this.db.prepare('UPDATE todos SET title=?,due_at=?,priority=?,completed=?,updated_at=? WHERE id=?').run(next.title, next.dueAt, next.priority, next.completed ? 1 : 0, this.now().toISOString(), id);
    return this.todo(id);
  }
  deleteTodo(id) { return this.db.prepare('DELETE FROM todos WHERE id=?').run(id).changes > 0; }
  close() { this.db.close(); }
}
export function chooseTodos(todos, now, zone, limit = 4) {
  const today = dateKey(now, zone);
  const pending = todos.filter(t => !t.completed && (!t.dueAt || dateKey(new Date(t.dueAt), zone) <= today));
  const completed = todos.filter(t => t.completed && dateKey(new Date(t.updatedAt), zone) === today);
  const score = t => t.dueAt && new Date(t.dueAt) < now ? 0 : t.priority === 'high' ? 1 : 2;
  pending.sort((a,b) => score(a) - score(b) || (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity) || a.id - b.id);
  completed.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  const items = pending.slice(0, limit);
  if (items.length < limit) items.push(...completed.slice(0, Math.min(1, limit - items.length)));
  return { items, pendingCount: pending.length, completedCount: completed.length, hiddenCount: Math.max(0, pending.length - items.filter(t => !t.completed).length) };
}
