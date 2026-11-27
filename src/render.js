import { Resvg } from '@resvg/resvg-js';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { clockText, dateKey, dateParts, resetLabel } from './time.js';

export const WIDTH = 1072, HEIGHT = 1448;
const FONT = 'Noto Serif CJK SC';
export const escapeXml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' })[c]);
const text = (value,x,y,size=30,weight=400,fill='#000',anchor='start') => `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${escapeXml(value)}</text>`;
const line = (x1,y1,x2,y2,width=2,color='#000') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}"/>`;
const rect = (x,y,w,h,fill='#fff',stroke='none',sw=0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
const num = (value,suffix='',digits=0) => typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : `—${suffix}`;
function section(title,y) { return text(title,64,y,34) + line(160,y-10,1008,y-10); }
function banner(value,y) { return rect(64,y,944,66,'#000') + text(value,84,y+45,30,400,'#fff'); }
function truncate(value,max) { const chars = [...value]; return chars.length > max ? chars.slice(0,max-1).join('')+'…' : value; }
function dateTime(iso,zone) { if (!iso) return '今日无事件'; const p=dateParts(new Date(iso),zone); return `${p.month}月${p.day}日 ${clockText(new Date(iso),zone)}`; }
function stamp(source,zone) { if (!source.fetchedAt) return '等待更新'; return `${source.status === 'fresh' ? '' : source.status === 'expired' ? '已过期 ' : '旧值 '}${clockText(new Date(source.fetchedAt),zone)}`; }
function header(data,page) {
  const c=data.calendar;
  const right=page==='weather'?`${c.weekday} · ${truncate(data.location.name,15)}${data.location.locationConfirmed?'':'（待确认）'}`:`${c.weekday} · 工作`;
  return text(`${c.year}年${c.month}月${c.day}日`,64,73,36,700)+text(right,1008,73,31,400,'#000','end')+line(64,98,1008,98,6)+line(64,110,1008,110,2);
}
export function moonPolygon(illuminationPct,waxing,cx=770,cy=224,r=65) {
  const fraction=Math.max(0,Math.min(1,illuminationPct/100)); const k=1-2*fraction; const side=waxing?1:-1;
  const edge=[],terminator=[];
  for(let i=0;i<=80;i++){const y=-r+2*r*i/80;const half=Math.sqrt(Math.max(0,r*r-y*y));edge.push([cx+side*half,cy+y]);terminator.unshift([cx+side*k*half,cy+y]);}
  return [...edge,...terminator].map(p=>p.map(v=>v.toFixed(2)).join(',')).join(' ');
}
function moon(a) {
  return `<circle cx="770" cy="224" r="65" fill="#000"/><polygon points="${moonPolygon(a.illuminatedPct,a.waxing)}" fill="#fff"/><circle cx="770" cy="224" r="65" fill="none" stroke="#000" stroke-width="3"/>`+text(a.phaseName,770,324,28,400,'#000','middle')+text(`照亮 ${a.illuminatedPct}%`,770,356,23,400,'#000','middle');
}
function weatherIcon(code,x=74,y=444) {
  if(code===0) {
    let rays=''; for(let i=0;i<8;i++){const a=i*Math.PI/4;rays+=line(x+40+Math.cos(a)*34,y+40+Math.sin(a)*34,x+40+Math.cos(a)*48,y+40+Math.sin(a)*48,4);}
    return `<circle cx="${x+40}" cy="${y+40}" r="23" fill="none" stroke="#000" stroke-width="4"/>`+rays;
  }
  return `<path d="M ${x+8} ${y+64} C ${x-6} ${y+46},${x+6} ${y+30},${x+22} ${y+30} C ${x+25} ${y+4},${x+63} ${y+3},${x+70} ${y+28} C ${x+97} ${y+30},${x+102} ${y+61},${x+80} ${y+67} L ${x+15} ${y+67} Z" fill="none" stroke="#000" stroke-width="5"/>`;
}
export function graph(data,y=592) {
  const forecast=data.weather.value?.forecast || [];
  if(!forecast.length) return line(64,y+186,1008,y+186)+text('天气预报待更新',536,y+85,35,400,'#555','middle');
  const values=forecast.map(p=>p.temperatureC).filter(v=>typeof v==='number');
  const min=values.length?Math.min(...values):0,max=values.length?Math.max(...values):1;
  const scale=Math.max(1,max-min), pos=i=>90+i*(892/7), tempY=v=>y+24+(max-v)/scale*72;
  let out=''; let previous=null;
  forecast.forEach((p,i)=>{
    const x=pos(i);
    if(typeof p.temperatureC==='number'){
      const py=tempY(p.temperatureC);
      if(previous) out+=line(previous.x,previous.y,x,py,4);
      out+=rect(x-5,py-5,10,10,'#fff','#000',3)+text(num(p.temperatureC,'°'),x,py-18,24,700,'#000','middle');previous={x,y:py};
    }else previous=null;
    if(typeof p.rainPct==='number') { const h=Math.max(0,Math.min(100,p.rainPct))*0.9; out+=rect(x-20,y+184-h,40,h,i===0?'#000':'#999')+text(num(p.rainPct,'%'),x,y+173-h,21,400,'#000','middle'); }
    const d=new Date(p.at);out+=text(`${dateParts(d,data.location.timeZone).hour}时`,x,y+219,25,400,'#000','middle');
    if(i>0 && dateKey(d,data.location.timeZone)!==dateKey(new Date(forecast[i-1].at),data.location.timeZone)) out+=text('次日',x,y+250,22,400,'#000','middle');
  });
  return out+line(64,y+184,1008,y+184);
}
function weatherAdvice(data) {
  if(data.weather.status!=='fresh') return data.weather.value?'预报为旧值，请留意实际天气':'天气正在等待更新';
  const points=(data.weather.value?.forecast||[]).slice(0,4).filter(p=>typeof p.rainPct==='number');
  const wet=points.filter(p=>p.rainPct>=50); if(wet.length) return `${dateParts(new Date(wet[0].at),data.location.timeZone).hour}时有雨风险，最高${Math.round(Math.max(...wet.map(p=>p.rainPct)))}% · 出门带伞`;
  return '近期降雨风险较低，按计划出行';
}
function calendar(data,x=705,y=1019,w=303,h=210) {
  const c=data.calendar,rows=c.weeks.length; const col=w/7,row=(h-44)/rows;
  let out=text(`${c.year}年${c.month}月`,x+w/2,y,27,700,'#000','middle');
  ['一','二','三','四','五','六','日'].forEach((v,i)=>{out+=text(v,x+(i+.5)*col,y+35,23,400,'#000','middle');});
  c.weeks.forEach((week,r)=>week.forEach((day,i)=>{if(!day)return;const cx=x+(i+.5)*col,cy=y+59+r*row;if(day===c.day)out+=`<circle cx="${cx}" cy="${cy-9}" r="17" fill="#000"/>`;out+=text(day,cx,cy,23,day===c.day?700:400,day===c.day?'#fff':'#000','middle');}));
  return out;
}
function weatherPage(data) {
  const c=data.calendar,a=data.astronomy,w=data.weather.value,zone=data.location.timeZone;
  let out=header(data,'weather')+text(c.time,64,322,197,700)+moon(a);
  [...c.lunarDate].slice(0,5).forEach((v,i)=>{out+=text(v,942,161+i*50,43,700,'#000','middle');});
  [...`${c.lunarYear}年`].slice(0,4).forEach((v,i)=>{out+=text(v,998,151+i*28,24,400,'#000','middle');});
  out+=section('天气',403)+weatherIcon(w?.weatherCode)+text(num(w?.temperatureC,'°'),176,530,91,700)+text(w?.description||'待更新',386,476,49)+text(`${num(w?.maxTempC,'°')} / ${num(w?.minTempC,'°')}`,386,520,29);
  const sunset=w?.sunset||a.sunset;
  out+=text(`湿度 ${num(w?.humidityPct,'%')}`,658,460,29)+text(`${w?.windDirection||'—'}风 ${num(w?.windKph,' km/h')}`,820,460,26)+text(`体感 ${num(w?.feelsLikeC,'°')}`,658,514,29)+text(`日落 ${sunset?clockText(new Date(sunset),zone):'无事件'}`,820,514,27);
  out+=graph(data)+banner(weatherAdvice(data),855)+section('今日',963);
  out+=text(c.lunarDate,64,1030,49,700)+text(`月出 ${a.moonrise?clockText(new Date(a.moonrise),zone):'今日无事件'}`,64,1083,29)+text(`月落 ${a.moonset?clockText(new Date(a.moonset),zone):'今日无事件'}`,64,1127,29);
  const term=a.nextSolarTerm;out+=text(term?`${term.name} ${dateParts(new Date(term.at),zone).month}月${dateParts(new Date(term.at),zone).day}日`:'节气待更新',64,1176,25);
  out+=line(363,994,363,1205)+text('距满月',401,1028,31)+text(a.daysToFullMoon??'—',397,1138,103,700)+text('天',558,1133,30)+text(dateTime(a.nextFullMoon,zone),394,1183,25)+line(670,994,670,1205)+calendar(data);
  out+=section('今年',1260)+text('还剩',64,1344,31)+text(c.remainingDays,146,1344,73,700)+text(`天 ${c.remainingHours}时${c.remainingMinutes}分`,286,1344,25)+text(`已过 ${c.yearProgressPct.toFixed(1)}%`,1008,1299,23,400,'#000','end');
  for(let i=0;i<12;i++){const x=481+i*43.2;out+=rect(x,1315,39,26,'#fff','#000',2);const fill=Math.max(0,Math.min(1,c.yearProgressPct/100*12-i));if(fill)out+=rect(x,1315,Number((39*fill).toFixed(2)),26,'#000');out+=text(i+1,x+19.5,1370,20,400,'#000','middle');}
  return out+footer(data,'weather');
}
function titleLines(value,width=22) { let weighted=0,line='',out=[]; for(const ch of [...value]){const weight=/[MW@]/.test(ch)?1:/[\u0000-\u007f]/.test(ch)?0.72:1;if(weighted+weight>width){out.push(line);line='';weighted=0;}line+=ch;weighted+=weight;}if(line)out.push(line);return out.slice(0,2).map((s,i)=>i===1&&out.length>2?[...s].slice(0,-1).join('')+'…':s); }
function workPage(data) {
  const now=new Date(data.generatedAt),zone=data.location.timeZone,t=data.todos;
  let out=header(data,'work')+text('今日待办',64,227,79,700)+text(data.calendar.time,1008,224,51,700,'#000','end')+text(`${t.pendingCount} 项待处理 · ${t.completedCount} 项已完成${t.hiddenCount?` · 另有 ${t.hiddenCount} 项`:''}`,64,281,28)+line(64,312,1008,312);
  if(!t.items.length)out+=text('今天还没有待办',64,426,45)+text('在管理页添加事项后，这里会自动更新',64,480,29,400,'#555');
  t.items.slice(0,4).forEach((item,i)=>{
    const y=366+i*119,fill=item.completed?'#555':'#000';out+=rect(72,y-32,40,40,item.completed?'#000':'#fff','#000',3);
    if(item.completed)out+=`<path d="M 80 ${y-10} l 9 10 l 20 -23" fill="none" stroke="#fff" stroke-width="5"/>`;
    const lines=titleLines(item.title);lines.forEach((value,j)=>{out+=text(value,172,y+j*39,35,700,fill);});
    const due=item.completed?'已完成':item.dueAt?resetLabel(item.dueAt,new Date(now.getTime()-1),zone).replace('已到重置时间，等待更新',`逾期 · ${dateTime(item.dueAt,zone)}`):'无截止时间';
    out+=text(due,172,y+(lines.length>1?72:45),25,400,'#555');
    if(item.priority==='high'&&!item.completed)out+=text('优先',1008,y,27,400,'#000','end');
    if(i<3)out+=line(64,y+82,1008,y+82,1.5,'#555');
  });
  out+=text('AI 额度 · Codex',64,875,36,700)+line(405,863,865,863)+text('剩余比例',1008,875,25,400,'#000','end');
  const windows=data.quota.value?.windows||[];
  for(const [i,key] of ['primary','secondary'].entries()){
    const q=windows.find(v=>v.key===key),x=i?560:64;
    const pending=q?.resetAt&&new Date(q.resetAt)<=now;
    out+=text(q?.label||(i?'周额度窗口':'短周期窗口'),x,936,31)+text(q&&!pending?`${Math.round(q.remainingPct)}%`:'—',x,1046,100,700);
    out+=rect(x,1071,448,24,'#fff','#000',2);if(q&&!pending)out+=rect(x,1071,448*q.remainingPct/100,24,'#000');
    out+=text(q?`重置：${resetLabel(q.resetAt,now,zone)}`:'等待读取额度',x,1141,q&&pending?24:26,400,'#555');
  }
  out+=line(536,913,536,1153);
  const active=windows.filter(q=>!q.resetAt||new Date(q.resetAt)>now);
  let notice='正在等待 Codex 额度';
  if(data.quota.value){const lowest=Math.min(...active.map(q=>q.remainingPct));notice=data.quota.status!=='fresh'?'额度为旧值，等待连接恢复':!active.length?'已到重置时间，等待更新':lowest<20?'剩余额度较低，留意重置时间':'额度正常，可继续工作';}
  out+=banner(notice,1183)+section('下一步',1295)+text(t.pendingCount?'先处理优先事项，再切换任务':'在手机管理页添加今日事项',64,1350,29);
  return out+footer(data,'work');
}
function footer(data,page) {
  const source=page==='weather'?data.weather:data.quota;
  const note=`${data.mode==='demo'?'示例界面 · ':''}${page==='weather'?'天气':'额度'}更新 ${stamp(source,data.location.timeZone)}${page==='weather'?' · Open-Meteo':''}`;
  const battery=data.device.connected&&typeof data.device.batteryPct==='number'?`电量 ${Math.round(data.device.batteryPct)}%`:'设备待接入';
  return line(64,1391,1008,1391)+text(note,64,1428,21,400,'#555')+text(`${battery} · ${page==='weather'?'1':'2'}/2`,1008,1428,21,400,'#555','end');
}
export function renderSvg(page,data) {
  if(!['weather','work'].includes(page))throw new Error('页面无效');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${page==='weather'?'天气日历与月亮':'待办与 AI 额度'}"><rect width="${WIDTH}" height="${HEIGHT}" fill="#fff"/><g font-family="${FONT}">${page==='weather'?weatherPage(data):workPage(data)}</g></svg>`;
}
export function renderPng(svg) {
  const fontFiles=['Regular','Bold'].map(w=>fileURLToPath(new URL(`../assets/fonts/NotoSerifCJKsc-${w}.otf`,import.meta.url)));
  if(!fontFiles.every(existsSync))throw new Error('中文字体尚未安装，请执行字体下载脚本');
  const result=new Resvg(svg,{fitTo:{mode:'original'},font:{fontFiles,loadSystemFonts:false,defaultFontFamily:FONT}}).render();
  return result.asPng();
}
