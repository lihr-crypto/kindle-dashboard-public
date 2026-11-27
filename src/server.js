import http from 'node:http';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { networkInterfaces, hostname } from 'node:os';
import { createHash } from 'node:crypto';
import { Store } from './store.js';
import { DashboardService, demoSnapshot } from './service.js';
import { renderSvg, renderPng } from './render.js';
import { credentials, equalToken, trustedLocal, role, validOrigin } from './auth.js';
import { searchLocation } from './weather.js';

const ROOT=fileURLToPath(new URL('../',import.meta.url));
const preview=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kindle 页面预览</title><link rel="stylesheet" href="/preview.css"></head><body><nav><a href="/">管理页</a><a href="/preview/weather">天气日历</a><a href="/preview/work">待办额度</a><a id="download">下载 PNG</a><span id="mode"></span></nav><main><img id="frame" alt="Kindle 页面预览"></main><script src="/preview.js"></script></body></html>`;
async function bodyJson(req) { if(!req.headers['content-type']?.startsWith('application/json'))throw new Error('请求需要 JSON 格式');let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>16384)throw new Error('请求内容过长');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString()||'{}'); }
export function createApplication({stateDir=process.env.DASHBOARD_STATE_DIR||join(ROOT,'.state'),trustLoopback=process.env.DASHBOARD_TRUST_LOOPBACK!=='0'&&process.env.NODE_ENV!=='production',now,weatherReader,quotaReader,collectOnStart=true}={}) {
  const store=new Store(resolve(stateDir),now);const keys=credentials(resolve(stateDir));const service=new DashboardService(store,{now,weatherReader,quotaReader});
  const hosts=new Set(['localhost','127.0.0.1','[::1]',hostname(),...(process.env.DASHBOARD_ALLOWED_HOSTS||'').split(',').filter(Boolean)]);
  for(const rows of Object.values(networkInterfaces()))for(const row of rows||[])hosts.add(row.address);
  const frameCache=new Map();let timer=null;let closed=false;
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; frame-ancestors 'none'; base-uri 'none'");
    const json=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
    const send=(value,type)=>{res.writeHead(200,{'Content-Type':type});res.end(value);};
    try{
      const url=new URL(req.url,`http://${req.headers.host}`);
      if(!hosts.has(url.hostname)){json({error:'不允许的访问主机'},403);return;}
      const access=role(req,keys,trustLoopback);
      if(['POST','PATCH','PUT','DELETE'].includes(req.method)&&!validOrigin(req)){json({error:'请求来源不匹配'},403);return;}
      if(req.method==='GET'&&url.pathname==='/health'){json({ok:true,version:'0.1.0'});return;}
      const staticFiles={'/':'index.html','/app.js':'app.js','/app.css':'app.css','/preview.js':'preview.js','/preview.css':'preview.css','/mobile':'mobile.html','/mobile/':'mobile.html','/mobile.js':'mobile.js','/mobile.css':'mobile.css','/manifest.webmanifest':'manifest.webmanifest','/sw.js':'sw.js','/icon.svg':'icon.svg'};
      if(req.method==='GET'&&['/icon-180.png','/icon-192.png','/icon-512.png'].includes(url.pathname)){send(readFileSync(join(ROOT,'web',url.pathname.slice(1))),'image/png');return;}
      if(req.method==='GET'&&staticFiles[url.pathname]){
        if(['/','/mobile','/mobile/'].includes(url.pathname)&&trustLoopback&&trustedLocal(req))res.setHeader('Set-Cookie',`dashboard_session=${keys.adminToken}; HttpOnly; SameSite=Strict; Path=/${process.env.DASHBOARD_SECURE_COOKIE==='1'?'; Secure':''}`);
        const ext=url.pathname.endsWith('.js')?'application/javascript':url.pathname.endsWith('.css')?'text/css':url.pathname.endsWith('.webmanifest')?'application/manifest+json':url.pathname.endsWith('.svg')?'image/svg+xml':'text/html';send(readFileSync(join(ROOT,'web',staticFiles[url.pathname])),ext+'; charset=utf-8');return;
      }
      if(req.method==='POST'&&url.pathname==='/api/login'){
        const input=await bodyJson(req);if(!equalToken(input.token,keys.adminToken)){json({error:'管理密钥不正确'},401);return;}
        res.setHeader('Set-Cookie',`dashboard_session=${keys.adminToken}; HttpOnly; SameSite=Strict; Path=/${process.env.DASHBOARD_SECURE_COOKIE==='1'?'; Secure':''}`);json({ok:true});return;
      }
      if(!access){json({error:'请先使用管理密钥登录'},401);return;}
      if(req.method==='GET'&&url.pathname==='/api/snapshot'){json(url.searchParams.get('demo')==='1'?demoSnapshot():service.snapshot());return;}
      if(req.method==='GET'&&/^\/frame\/(weather|work|current)\.(png|svg)$/.test(url.pathname)){
        const [,requestedPage,type]=url.pathname.match(/^\/frame\/(weather|work|current)\.(png|svg)$/);
        const data=url.searchParams.get('demo')==='1'?demoSnapshot():service.snapshot();
        const page=requestedPage==='current'?store.config().selectedPage:requestedPage;const svg=renderSvg(page,data);
        const hash=createHash('sha256').update(svg).digest('hex');const cacheKey=`${page}:${type}:${data.mode}`;
        let entry=frameCache.get(cacheKey);if(!entry||entry.hash!==hash){entry={hash,body:type==='png'?renderPng(svg):svg};frameCache.set(cacheKey,entry);}
        res.setHeader('ETag',`"${hash}"`);send(entry.body,type==='png'?'image/png':'image/svg+xml; charset=utf-8');return;
      }
      if(req.method==='POST'&&url.pathname==='/api/device/status'){service.deviceStatus(await bodyJson(req));json({ok:true});return;}
      if(access!=='admin'){json({error:'设备凭据只有画面与摘要读取权限'},403);return;}
      if(req.method==='GET'&&url.pathname==='/api/mobile'){
        const demo=url.searchParams.get('demo')==='1';const data=demo?demoSnapshot():service.snapshot();
        const items=demo?data.todos.items.map(t=>({...t,readOnly:true})):store.todos();
        json({snapshot:data,items});return;
      }
      if(req.method==='POST'&&url.pathname==='/api/logout'){res.setHeader('Set-Cookie','dashboard_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');json({ok:true});return;}
      if(req.method==='GET'&&/^\/preview\/(weather|work)$/.test(url.pathname)){send(preview,'text/html; charset=utf-8');return;}
      if(req.method==='GET'&&url.pathname==='/api/todos'){json({items:store.todos()});return;}
      if(req.method==='POST'&&url.pathname==='/api/todos'){json(store.createTodo(await bodyJson(req)),201);return;}
      const todoMatch=url.pathname.match(/^\/api\/todos\/(\d+)$/);
      if(todoMatch&&req.method==='PATCH'){const item=store.updateTodo(Number(todoMatch[1]),await bodyJson(req));json(item||{error:'待办不存在'},item?200:404);return;}
      if(todoMatch&&req.method==='DELETE'){const removed=store.deleteTodo(Number(todoMatch[1]));json(removed?{ok:true}:{error:'待办不存在'},removed?200:404);return;}
      if(req.method==='GET'&&url.pathname==='/api/config'){json(store.config());return;}
      if(req.method==='PATCH'&&url.pathname==='/api/config'){json(store.setConfig(await bodyJson(req)));void service.refresh();return;}
      if(req.method==='GET'&&url.pathname==='/api/locations'){json({results:await searchLocation(url.searchParams.get('q')||'')});return;}
      if(req.method==='POST'&&url.pathname==='/api/refresh'){void service.refresh(true);json({ok:true,collecting:true},202);return;}
      if(req.method==='GET'&&url.pathname==='/api/access'){
        const lanUrls=Object.values(networkInterfaces()).flat().filter(row=>row?.family==='IPv4'&&!row.internal).map(row=>`http://${row.address}:${server.address().port}/`);
        json({...keys,lanUrls:[...new Set(lanUrls)]});return;
      }
      json({error:'入口不存在'},404);
    }catch(error){json({error:error instanceof SyntaxError?'请求内容不是有效 JSON':error.message||'请求失败'},400);}
  });
  const close=async()=>{if(closed)return;closed=true;clearInterval(timer);await new Promise(resolve=>server.close(resolve));if(service.pending)await service.pending;store.close();};
  if(collectOnStart){void service.refresh(true);timer=setInterval(()=>void service.refresh(),60000);timer.unref();}
  return {server,store,service,keys,close};
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
  process.umask(0o077);
  const app=createApplication();const port=Number(process.env.DASHBOARD_PORT||8789),host=process.env.DASHBOARD_HOST||'0.0.0.0';
  app.server.listen(port,host,()=>console.log(`Kindle Dashboard: http://127.0.0.1:${port}/`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>void app.close().then(()=>process.exit(0)));
}
