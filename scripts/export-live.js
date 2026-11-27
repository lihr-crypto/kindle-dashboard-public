import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const state=resolve(process.env.DASHBOARD_STATE_DIR||join(root,'.state'));
const {deviceToken}=JSON.parse(readFileSync(join(state,'credentials.json'),'utf8'));
const base=`http://127.0.0.1:${process.env.DASHBOARD_PORT||8789}`;
const dir=join(root,'outputs/live');mkdirSync(dir,{recursive:true,mode:0o700});
async function read(path){const r=await fetch(base+path,{headers:{'X-Device-Token':deviceToken},signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error(`Export failed: ${path} HTTP ${r.status}`);return r;}
const snapshot=await(await read('/api/snapshot')).json();
writeFileSync(join(dir,'snapshot.json'),JSON.stringify(snapshot,null,2),{mode:0o600});
for(const page of ['weather','work'])for(const type of ['svg','png']){
  const r=await read(`/frame/${page}.${type}`);writeFileSync(join(dir,`${page}.${type}`),Buffer.from(await r.arrayBuffer()),{mode:0o600});
}
console.log(`Exported live weather/work frames to ${dir}`);
console.log(`Sources: weather=${snapshot.weather.status}, Codex=${snapshot.quota.status}; location=${snapshot.location.name}`);
