import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
export function equalToken(a,b) { if(typeof a!=='string'||typeof b!=='string')return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y); }
export function credentials(dir) {
  const path=join(dir,'credentials.json');
  if(!existsSync(path))writeFileSync(path,JSON.stringify({adminToken:randomBytes(32).toString('hex'),deviceToken:randomBytes(32).toString('hex')},null,2),{mode:0o600});
  chmodSync(path,0o600);return JSON.parse(readFileSync(path,'utf8'));
}
export function isLoopback(req) { return ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress); }
export function trustedLocal(req) { return isLoopback(req)&&!req.headers['x-forwarded-for']&&!req.headers.forwarded; }
export function role(req,keys,trustLoopback=true) {
  if(trustLoopback&&trustedLocal(req))return 'admin';
  const cookies=Object.fromEntries((req.headers.cookie||'').split(';').map(x=>x.trim().split('=')).filter(x=>x.length===2));
  if(equalToken(req.headers['x-admin-token']||cookies.dashboard_session,keys.adminToken))return 'admin';
  if(equalToken(req.headers['x-device-token'],keys.deviceToken))return 'device';
  return null;
}
export function validOrigin(req) { if(!req.headers.origin)return true;try{return new URL(req.headers.origin).host===req.headers.host;}catch{return false;} }
