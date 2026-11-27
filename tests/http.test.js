import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApplication } from '../src/server.js';

test('HTTP management, protected frames and device permissions work together',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'kindle-http-'));
  const app=createApplication({stateDir:dir,trustLoopback:false,collectOnStart:false,weatherReader:async()=>({temperatureC:20,forecast:[]}),quotaReader:async()=>({windows:[]})});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${app.server.address().port}`;
  const request=(path,{device=false,method='GET',body,origin}={})=>fetch(base+path,{method,headers:{'Content-Type':'application/json',[device?'X-Device-Token':'X-Admin-Token']:device?app.keys.deviceToken:app.keys.adminToken,...(origin?{Origin:origin}:{})},body:body?JSON.stringify(body):undefined});
  try{
    assert.equal((await fetch(base+'/api/snapshot')).status,401);
    const create=await request('/api/todos',{method:'POST',body:{title:'接口验证事项',dueLocal:'2026-10-13T20:00'}});assert.equal(create.status,201);const todo=await create.json();
    assert.equal((await request(`/api/todos/${todo.id}`,{method:'PATCH',body:{completed:true}})).status,200);
    const rows=await(await request('/api/todos')).json();assert.equal(rows.items[0].completed,true);
    assert.equal((await request('/api/todos',{device:true,method:'POST',body:{title:'越权写入'}})).status,403);
    assert.equal((await request('/api/access',{device:true})).status,403);
    assert.equal((await request('/api/mobile',{device:true})).status,403);
    assert.equal((await fetch(base+'/mobile')).status,200);
    const manifest=await(await fetch(base+'/manifest.webmanifest')).json();assert.equal(manifest.start_url,'/mobile');
    const future=await(await request('/api/todos',{method:'POST',body:{title:'未来事项仍能在手机清单读取',dueLocal:'2099-01-01T20:00'}})).json();
    const mobile=await(await request('/api/mobile')).json();assert.equal(mobile.items.length,2);assert.equal(mobile.snapshot.todos.items.some(t=>t.id===future.id),false);
    const demo=await(await request('/api/mobile?demo=1')).json();assert.equal(demo.snapshot.mode,'demo');assert.ok(demo.items.every(t=>t.readOnly));assert.equal((await(await request('/api/todos')).json()).items.length,2);
    assert.equal((await request(`/api/todos/${future.id}`,{method:'DELETE'})).status,200);
    assert.equal((await request('/api/device/status',{device:true,method:'POST',body:{batteryPct:60}})).status,200);
    assert.equal((await request('/api/snapshot',{device:true})).status,200);
    const frame=await request('/frame/weather.png?demo=1',{device:true});assert.equal(frame.status,200);const png=Buffer.from(await frame.arrayBuffer());assert.equal(png.readUInt32BE(16),1072);
    const csrf=await request('/api/todos',{method:'POST',body:{title:'不应写入'},origin:'https://evil.example'});assert.equal(csrf.status,403);
    assert.equal((await request('/api/todos',{method:'POST',body:{title:''}})).status,400);
    assert.equal((await request('/api/config',{method:'PATCH',body:{selectedPage:'work'}})).status,200);
    assert.equal((await(await request('/api/config')).json()).selectedPage,'work');
    const current=await request('/frame/current.svg?demo=1',{device:true});assert.equal(current.status,200);assert.match(await current.text(),/今日待办/);
    assert.equal((await request('/api/config',{method:'PATCH',body:{locationMode:'device',name:'当前位置',latitude:34.69,longitude:135.5,locationUpdatedAt:'2026-10-13T04:00:00Z'}})).status,200);
    const location=await(await request('/api/config')).json();assert.equal(location.locationMode,'device');assert.equal(location.latitude,34.69);
    assert.equal((await request(`/api/todos/${todo.id}`,{method:'DELETE'})).status,200);assert.equal((await(await request('/api/todos')).json()).items.length,0);
  }finally{await app.close();rmSync(dir,{recursive:true,force:true});}
});
