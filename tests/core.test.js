import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeCalendar, monthWeeks, localToDate, resetLabel, dateKey } from '../src/time.js';
import { Store, chooseTodos, validateTodo, parseDefaultLocation } from '../src/store.js';
import { normalizeQuota } from '../src/quota.js';
import { parseWeather } from '../src/weather.js';
import { astronomy } from '../src/astronomy.js';
import { DashboardService, demoSnapshot, sourceView } from '../src/service.js';
import { renderSvg, renderPng, moonPolygon } from '../src/render.js';
import { role, validOrigin } from '../src/auth.js';

const zone='Asia/Tokyo',now=new Date('2026-10-13T18:09:00+09:00');
const config={latitude:35.68,longitude:139.69,timeZone:zone};
function temporaryStore(){const dir=mkdtempSync(join(tmpdir(),'kindle-dashboard-test-'));const store=new Store(dir,()=>now);return {store,cleanup:()=>{store.close();rmSync(dir,{recursive:true,force:true});}};}

test('calendar is timezone-correct, lunar date agrees, and leap-year/month boundaries remain valid',()=>{
  const c=makeCalendar(now,zone);assert.equal(c.weekday,'星期二');assert.equal(c.lunarDate,'九月初四');assert.equal(c.remainingDays,79);assert.equal(c.remainingHours,5);assert.equal(c.remainingMinutes,51);
  assert.deepEqual(monthWeeks(2026,10)[0],[null,null,null,1,2,3,4]);assert.equal(monthWeeks(2024,2).flat().filter(Boolean).at(-1),29);
  const next=makeCalendar(new Date('2026-12-31T15:00:00Z'),zone);assert.equal(next.year,2027);assert.equal(next.month,1);assert.equal(next.day,1);assert.equal(next.yearProgressPct,0);
  assert.equal(dateKey(new Date('2026-10-13T15:01:00Z'),zone),'2026-10-14');
});
test('local deadlines are converted with the selected timezone and impossible dates are rejected',()=>{
  assert.equal(localToDate('2026-10-13T19:00',zone).toISOString(),'2026-10-13T10:00:00.000Z');
  assert.throws(()=>localToDate('2026-02-31T19:00',zone));assert.throws(()=>localToDate('2026-03-08T02:30','America/New_York'));
});
test('reset elapsed never manufactures a full quota',()=>{assert.match(resetLabel('2026-10-13T17:00:00+09:00',now,zone),/等待更新/);const data=demoSnapshot();data.quota.value.windows[0].resetAt='2026-10-13T17:00:00+09:00';const svg=renderSvg('work',data);assert.ok(!svg.includes('78%'));assert.match(svg,/等待更新/);});
test('quota normalizer drops absent fields and account metadata, retaining real remaining values',()=>{
  const value=normalizeQuota({accountId:'private-account',rateLimitsByLimitId:{codex:{primary:{usedPercent:22,windowDurationMins:300,resetsAt:1791870000},secondary:{usedPercent:null,windowDurationMins:10080}}}});
  assert.equal(value.windows.length,1);assert.equal(value.windows[0].remainingPct,78);assert.ok(!JSON.stringify(value).includes('private-account'));
  assert.throws(()=>normalizeQuota({rateLimits:{primary:{usedPercent:null}}}));
  assert.equal(normalizeQuota({rateLimits:{primary:{usedPercent:105}}}).windows[0].remainingPct,0);
});
test('weather keeps zero and missing points distinct, with correctly aligned midnight dates',()=>{
  const times=Array.from({length:20},(_,i)=>(new Date('2026-10-13T18:00:00+09:00').getTime()+i*3600000)/1000);
  const data=parseWeather({current:{temperature_2m:0,relative_humidity_2m:0,wind_speed_10m:0,wind_direction_10m:0,time:times[0],weather_code:0},hourly:{time:times,temperature_2m:times.map((_,i)=>i===2?null:0),precipitation_probability:times.map(()=>0)},daily:{time:[new Date('2026-10-13T00:00:00+09:00').getTime()/1000],temperature_2m_max:[0],temperature_2m_min:[-2],sunset:[times[0]]}},config,now);
  assert.equal(data.temperatureC,0);assert.equal(data.forecast[0].rainPct,0);assert.equal(data.forecast[1].temperatureC,null);assert.equal(data.forecast.length,8);assert.equal(dateKey(new Date(data.forecast[3].at),zone),'2026-10-14');assert.equal(data.maxTempC,0);
  const snapshot=demoSnapshot();snapshot.weather.value=data;assert.match(renderSvg('weather',snapshot),/0%/);assert.match(renderSvg('weather',snapshot),/次日/);
});
test('moon phases, rise/set and full-moon countdown have deterministic coordinate-based results',()=>{
  const a=astronomy(now,config);assert.equal(a.phaseName,'蛾眉月');assert.equal(a.illuminatedPct,8);assert.equal(a.waxing,true);assert.equal(a.daysToFullMoon,13);assert.equal(a.nextSolarTerm.days,10);assert.match(a.moonrise,/2026-10-12T23:12/);assert.match(a.moonset,/2026-10-13T09:13/);
  assert.notEqual(moonPolygon(25,true),moonPolygon(25,false));
});
test('todos persist edits/completion across reopening the database',()=>{
  const dir=mkdtempSync(join(tmpdir(),'kindle-dashboard-db-'));let store=new Store(dir,()=>now);
  try{const item=store.createTodo({title:'真实持久化检查',dueLocal:'2026-10-13T19:00',priority:'high'});store.updateTodo(item.id,{title:'修改后',completed:true});store.close();store=new Store(dir,()=>now);assert.equal(store.todo(item.id).title,'修改后');assert.equal(store.todo(item.id).completed,true);assert.equal(store.todo(item.id).dueAt,'2026-10-13T10:00:00.000Z');}finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
test('today selection puts overdue first, excludes future tasks and retains a completed item',()=>{
  const tasks=[{id:1,title:'明天',dueAt:'2026-10-14T19:00:00+09:00',completed:false,priority:'high'}, {id:2,title:'优先',dueAt:null,completed:false,priority:'high'}, {id:3,title:'逾期',dueAt:'2026-10-13T17:00:00+09:00',completed:false,priority:'normal'}, {id:4,title:'完成',dueAt:null,completed:true,updatedAt:now.toISOString()}];
  const selected=chooseTodos(tasks,now,zone);assert.deepEqual(selected.items.map(t=>t.id),[3,2,4]);assert.equal(selected.pendingCount,2);assert.equal(selected.completedCount,1);
});
test('invalid task controls and overlong input are rejected',()=>{assert.throws(()=>validateTodo({title:'a\u0000b'},config));assert.throws(()=>validateTodo({title:'字'.repeat(101)},config));assert.throws(()=>validateTodo({title:'ok',dueAt:'2026-10-13T19:00'},config));});
test('source expiry preserves a clearly stale value then stops exposing it as current',()=>{const source={value:{temperatureC:20},fetchedAt:now.toISOString()};assert.equal(sourceView(source,new Date(+now+11*60000),10*60000,30*60000).status,'stale');assert.equal(sourceView(source,new Date(+now+31*60000),10*60000,30*60000).value,null);});
test('one source failing does not erase another successful source',async()=>{
  const t=temporaryStore();try{const service=new DashboardService(t.store,{now:()=>now,weatherReader:async()=>{throw new Error('network');},quotaReader:async()=>({windows:[{key:'primary',remainingPct:50}]})});await service.refresh(true);assert.equal(service.snapshot().weather.status,'unavailable');assert.equal(service.snapshot().quota.status,'fresh');}finally{t.cleanup();}
});
test('an in-flight old-city response cannot appear under a new city name',async()=>{
  const t=temporaryStore();let release;let calls=0;try{const service=new DashboardService(t.store,{now:()=>now,weatherReader:async()=>{calls++;if(calls===1)return new Promise(resolve=>{release=resolve;});return {temperatureC:10};},quotaReader:async()=>({windows:[]})});const pending=service.refresh(true);await new Promise(resolve=>setImmediate(resolve));t.store.setConfig({name:'大阪',latitude:34.69,longitude:135.5});release({temperatureC:99});await pending;await new Promise(resolve=>setImmediate(resolve));if(service.pending)await service.pending;assert.notEqual(service.snapshot().weather.value?.temperatureC,99);assert.equal(service.snapshot().weather.value.temperatureC,10);}finally{t.cleanup();}
});
test('SVG escapes user content and produces exact-sized PNGs without card geometry',()=>{
  const data=demoSnapshot();data.todos.items[0].title='<script>alert(1)</script>&';const svg=renderSvg('work',data);assert.ok(!svg.includes('<script>'));assert.ok(svg.includes('&lt;script&gt;'));assert.ok(!svg.includes('rx="'));
  const png=renderPng(svg);assert.equal(png.readUInt32BE(16),1072);assert.equal(png.readUInt32BE(20),1448);
});
test('device token cannot become an admin token and forwarded localhost is not auto-trusted',()=>{
  const keys={adminToken:'admin-secret',deviceToken:'device-secret'};
  assert.equal(role({socket:{remoteAddress:'192.168.1.2'},headers:{'x-device-token':'device-secret'}},keys),'device');
  assert.equal(role({socket:{remoteAddress:'127.0.0.1'},headers:{'x-forwarded-for':'203.0.113.1'}},keys),null);
  assert.equal(validOrigin({headers:{host:'localhost:8789',origin:'https://evil.example'}}),false);
});

test('default location comes from DEFAULT_LOCATION and bad values fall back to the example',()=>{
  assert.deepEqual(parseDefaultLocation('{"name":"A","latitude":1.5,"longitude":2.5,"timeZone":"Asia/Tokyo"}'),{name:'A',latitude:1.5,longitude:2.5,timeZone:'Asia/Tokyo'});
  assert.deepEqual(parseDefaultLocation('{"latitude":999,"name":"","timeZone":"Nowhere/Land"}'),{});
  assert.deepEqual(parseDefaultLocation('not json'),{});
  assert.deepEqual(parseDefaultLocation(undefined),{});
  assert.deepEqual(parseDefaultLocation('{"name":"B","latitude":1.5}'),{name:'B'});
});
