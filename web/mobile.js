const $ = id => document.getElementById(id);
let data = null, items = [], activeView = 'today', messageTimer, locationDirty = false;
let demo = new URLSearchParams(location.search).get('demo') === '1';
const labels = {fresh:'已更新',stale:'旧值',expired:'已过期',unavailable:'待连接'};
function notice(message) { $('message').textContent=message;$('message').hidden=false;clearTimeout(messageTimer);messageTimer=setTimeout(()=>$('message').hidden=true,5000); }
async function api(path, options={}) {
  const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...options.headers}});
  const value=await response.json();
  if(!response.ok){if(response.status===401){$('login').hidden=false;$('app').hidden=true;$('connection').textContent='需要登录';}throw new Error(value.error||'请求失败');}
  return value;
}
const number = (value,suffix='') => typeof value==='number'&&Number.isFinite(value)?Math.round(value)+suffix:'—'+suffix;
function parts(iso) { return Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:data.location.timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso)).map(p=>[p.type,p.value])); }
function key(iso) { const p=parts(iso);return `${p.year}-${p.month}-${p.day}`; }
function clock(iso) { const p=parts(iso);return `${p.hour}:${p.minute}`; }
function stamp(iso) { if(!iso)return '等待更新';const p=parts(iso);return `${Number(p.month)}/${Number(p.day)} ${p.hour}:${p.minute}`; }
function dueLabel(task) {
  if(!task.dueAt)return '无截止时间';
  const past=!task.completed && new Date(task.dueAt)<new Date(data.generatedAt);
  return `${past?'逾期 · ':''}${key(task.dueAt)===key(data.generatedAt)?'今天 ':stamp(task.dueAt).split(' ')[0]+' '}${clock(task.dueAt)}`;
}
function localInput(iso) { if(!iso)return '';const p=parts(iso);return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; }
function element(tag,text,className) { const node=document.createElement(tag);if(text!=null)node.textContent=text;if(className)node.className=className;return node; }
function svgElement(tag,attributes,text) { const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [name,value]of Object.entries(attributes))node.setAttribute(name,value);if(text!=null)node.textContent=text;return node; }
function navigate(view) {activeView=view;document.querySelectorAll('[data-view]').forEach(e=>e.hidden=e.dataset.view!==view);document.querySelectorAll('[data-nav]').forEach(e=>e.setAttribute('aria-pressed',String(e.dataset.nav===view)));window.scrollTo({top:0,behavior:'auto'});}
document.querySelectorAll('[data-nav]').forEach(button=>button.onclick=()=>navigate(button.dataset.nav));

function renderMoon() {
  const a=data.astronomy,svg=$('moon');svg.replaceChildren();
  svg.append(svgElement('circle',{cx:50,cy:50,r:45,fill:'#000'}));
  const side=a.waxing?1:-1,k=1-2*a.illuminatedPct/100,edge=[],terminator=[];
  for(let i=0;i<=80;i++){const y=-45+90*i/80,half=Math.sqrt(Math.max(0,45*45-y*y));edge.push([50+side*half,50+y]);terminator.unshift([50+side*k*half,50+y]);}
  svg.append(svgElement('polygon',{points:[...edge,...terminator].map(p=>p.join(',')).join(' '),fill:'#fff'}),svgElement('circle',{cx:50,cy:50,r:45,fill:'none',stroke:'#000','stroke-width':2}));
  $('moon-name').textContent=a.phaseName;$('moon-light').textContent=`照亮 ${a.illuminatedPct}%`;
  $('moon-rise').textContent='月出 '+(a.moonrise?clock(a.moonrise):'今日无事件');$('moon-set').textContent='月落 '+(a.moonset?clock(a.moonset):'今日无事件');
  $('full-moon').textContent=`距满月 ${a.daysToFullMoon} 天`;
  $('solar-term').textContent=a.nextSolarTerm?`${a.nextSolarTerm.name} · ${stamp(a.nextSolarTerm.at).split(' ')[0]}`:'';
}
function renderChart() {
  const svg=$('weather-chart'),points=data.weather.value?.forecast||[];svg.replaceChildren();
  if(!points.length){svg.append(svgElement('text',{x:180,y:65,'text-anchor':'middle','font-size':16,fill:'#666'},'天气预报待更新'));return;}
  const temperatures=points.map(p=>p.temperatureC).filter(v=>typeof v==='number'),min=Math.min(...temperatures),max=Math.max(...temperatures),range=Math.max(1,max-min);
  const x=i=>16+i*328/7,y=temp=>16+(max-temp)/range*38;let last=null;
  points.forEach((p,i)=>{
    const px=x(i);
    if(typeof p.temperatureC==='number'){
      const py=y(p.temperatureC);
      if(last)svg.append(svgElement('line',{x1:last.x,y1:last.y,x2:px,y2:py,stroke:'#000','stroke-width':2}));
      svg.append(svgElement('rect',{x:px-2,y:py-2,width:4,height:4,fill:'#fff',stroke:'#000','stroke-width':1.5}),svgElement('text',{x:px,y:py-7,'font-size':12,'font-weight':700,'text-anchor':'middle'},number(p.temperatureC,'°')));last={x:px,y:py};
    }else last=null;
    if(typeof p.rainPct==='number'){const h=Math.max(0,Math.min(100,p.rainPct))*.42;svg.append(svgElement('rect',{x:px-9,y:109-h,width:18,height:h,fill:i?'#999':'#000'}),svgElement('text',{x:px,y:104-h,'font-size':10,'text-anchor':'middle'},number(p.rainPct,'%')));}
    svg.append(svgElement('text',{x:px,y:127,'font-size':11,'text-anchor':'middle'},`${Number(parts(p.at).hour)}时`));
    if(i&&key(p.at)!==key(points[i-1].at))svg.append(svgElement('text',{x:px,y:142,'font-size':10,'text-anchor':'middle'},'次日'));
  });
  svg.append(svgElement('line',{x1:0,y1:109,x2:360,y2:109,stroke:'#000'}));
}
function renderCalendar() {
  const c=data.calendar,root=$('month-calendar');root.replaceChildren();root.append(element('div',`${c.year}年${c.month}月`,'month-title'));
  ['一','二','三','四','五','六','日'].forEach(value=>root.append(element('div',value,'weekday')));
  const days=new Set(items.filter(t=>!t.completed&&t.dueAt).map(t=>key(t.dueAt)));
  c.weeks.flat().forEach(day=>{const date=`${c.year}-${String(c.month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;root.append(element('div',day||'',`day${day===c.day?' today':''}${day&&days.has(date)?' has-event':''}`));});
}
function renderWeather() {
  const w=data.weather.value,a=data.astronomy;
  $('city').textContent=data.location.name;$('weather-status').textContent=`${labels[data.weather.status]} · ${data.weather.fetchedAt?clock(data.weather.fetchedAt):'—'}`;
  $('temperature').textContent=number(w?.temperatureC,'°');$('weather-name').textContent=w?.description||'待更新';$('high-low').textContent=`${number(w?.maxTempC,'°')} / ${number(w?.minTempC,'°')}`;
  $('humidity').textContent=number(w?.humidityPct,'%');$('feels-like').textContent=number(w?.feelsLikeC,'°');$('wind').textContent=`${w?.windDirection||'—'} ${number(w?.windKph,' km/h')}`;$('sunset').textContent=w?.sunset||a.sunset?clock(w?.sunset||a.sunset):'今日无事件';
  const wet=(w?.forecast||[]).slice(0,4).filter(p=>p.rainPct>=50);
  $('weather-advice').textContent=data.weather.status!=='fresh'?(w?'预报为旧值，请留意实际天气':'天气正在等待更新'):wet.length?`${Number(parts(wet[0].at).hour)}时有雨风险，最高 ${number(Math.max(...wet.map(p=>p.rainPct)),'%')} · 带伞`:'近期降雨风险较低，按计划出行';
  $('lunar').textContent=data.calendar.lunarDate;renderMoon();renderChart();renderCalendar();
  $('year-days').textContent=data.calendar.remainingDays;$('year-progress-label').textContent=`已过 ${data.calendar.yearProgressPct.toFixed(1)}%`;$('year-progress').setAttribute('aria-valuenow',data.calendar.yearProgressPct);$('year-progress').firstElementChild.style.width=data.calendar.yearProgressPct+'%';
}
function taskRow(task,compact=false) {
  const row=element('article',null,'task'+(task.completed?' completed':'')),line=element('div',null,'task-line');
  const checkbox=element('input');checkbox.type='checkbox';checkbox.checked=task.completed;checkbox.disabled=demo;checkbox.setAttribute('aria-label',`${task.completed?'重新打开':'完成'} ${task.title}`);
  checkbox.onchange=async()=>{checkbox.disabled=true;try{await api(`/api/todos/${task.id}`,{method:'PATCH',body:JSON.stringify({completed:checkbox.checked})});await reload();}catch(e){checkbox.checked=task.completed;notice(e.message);}finally{checkbox.disabled=demo;}};
  const body=element('div',null,'task-main');body.append(element('p',task.title,'task-title'),element('p',`${task.priority==='high'?'优先 · ':''}${dueLabel(task)}${task.completed?' · 已完成':''}`,'meta'));line.append(checkbox,body);row.append(line);
  if(!compact&&!demo){const tools=element('div',null,'task-tools'),edit=element('button','编辑','secondary'),remove=element('button','删除','secondary');edit.onclick=()=>openTodo(task);remove.onclick=async()=>{if(!confirm('删除这条待办？此操作无法撤销。'))return;try{await api(`/api/todos/${task.id}`,{method:'DELETE'});await reload();notice('已删除待办');}catch(e){notice(e.message);}};tools.append(edit,remove);row.append(tools);}
  return row;
}
function renderTasks() {
  const today=key(data.generatedAt),pending=items.filter(t=>!t.completed),score=t=>t.dueAt&&new Date(t.dueAt)<new Date(data.generatedAt)?0:t.priority==='high'?1:2;
  const current=pending.filter(t=>!t.dueAt||key(t.dueAt)<=today).sort((a,b)=>score(a)-score(b)||(a.dueAt?Date.parse(a.dueAt):Infinity)-(b.dueAt?Date.parse(b.dueAt):Infinity)||a.id-b.id);
  const future=pending.filter(t=>t.dueAt&&key(t.dueAt)>today).sort((a,b)=>a.dueAt.localeCompare(b.dueAt));
  const completed=items.filter(t=>t.completed).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  $('task-count').textContent=`${current.length} 项今日待处理 · ${future.length} 项未来待办`;
  for(const [id,list]of [['todo-list',current],['future-agenda',future],['completed-todos',completed]]){const root=$(id);root.replaceChildren();list.forEach(t=>root.append(taskRow(t)));if(!list.length)root.append(element('p',id==='todo-list'?'今天暂无待办，点右上角添加。':'暂无事项','empty'));}
  $('future-events').hidden=!future.length;$('completed-events').hidden=!completed.length;$('add-todo').disabled=demo;
  const root=$('today-agenda');root.replaceChildren();current.slice(0,3).forEach(t=>root.append(taskRow(t,true)));if(!current.length)root.append(element('p','今天暂无待办','empty'));
  if(current.length){const more=element('button','查看全部事项','secondary small-button');more.onclick=()=>navigate('work');root.append(more);}
}
function renderQuota() {
  $('quota-status').textContent=`${labels[data.quota.status]} · ${data.quota.fetchedAt?clock(data.quota.fetchedAt):'—'}`;
  const windows=data.quota.value?.windows||[],root=$('quota-windows'),now=new Date(data.generatedAt);root.replaceChildren();
  for(const [keyName,fallback]of [['primary','短周期窗口'],['secondary','周额度窗口']]){
    const q=windows.find(q=>q.key===keyName),waiting=q?.resetAt&&new Date(q.resetAt)<=now,section=element('section',null,'quota-window');
    section.append(element('h3',q?.label||fallback),element('div',q&&!waiting?number(q.remainingPct,'%'):'—','quota-value'));
    const progress=element('div',null,'progress'),fill=element('span');fill.style.width=q&&!waiting?q.remainingPct+'%':'0%';progress.append(fill);section.append(progress,element('p',waiting?'已到重置时间，等待更新':q?.resetAt?'重置 '+stamp(q.resetAt):'等待读取额度'));root.append(section);
  }
  $('quota-note').textContent=data.quota.status==='fresh'?'以上百分比表示剩余额度':data.quota.value?'额度为旧值，等待连接恢复':'等待 Codex 额度连接';
}
function render() {
  $('demo-note').hidden=!demo;$('header-date').textContent=`${data.calendar.month}月${data.calendar.day}日 · ${data.calendar.weekday}`;
  $('connection').textContent=demo?'固定示例数据':'已连接 · '+stamp(data.generatedAt);
  $('toggle-demo').textContent=demo?'返回实时数据':'查看排版示例';renderWeather();renderTasks();renderQuota();tick();
  $('settings-city').textContent=`${data.location.name} · ${data.location.timeZone}`;
  if(!locationDirty){$('location-name').value=data.location.name;$('latitude').value=data.location.latitude;$('longitude').value=data.location.longitude;$('time-zone').value=data.location.timeZone;}
  document.querySelectorAll('#location-form input,#location-form button').forEach(e=>e.disabled=demo);$('use-location').disabled=demo||!geoAvailable;$('refresh').disabled=demo;
}
function tick() { if(data)$('clock').textContent=demo?data.calendar.time:clock(new Date()); }
async function reload() {const result=await api('/api/mobile'+(demo?'?demo=1':''));data=result.snapshot;items=result.items;$('login').hidden=true;$('app').hidden=false;render();}
function openTodo(task=null) {$('todo-form').reset();$('todo-id').value=task?.id||'';$('todo-heading').textContent=task?'编辑待办':'添加待办';if(task){$('todo-title').value=task.title;$('todo-due').value=localInput(task.dueAt);$('todo-priority').value=task.priority;}$('todo-dialog').showModal();$('todo-title').focus();}
$('add-todo').onclick=()=>openTodo();$('close-todo').onclick=()=>$('todo-dialog').close();
$('todo-form').onsubmit=async event=>{event.preventDefault();$('save-todo').disabled=true;try{const id=$('todo-id').value;await api(id?`/api/todos/${id}`:'/api/todos',{method:id?'PATCH':'POST',body:JSON.stringify({title:$('todo-title').value,dueLocal:$('todo-due').value,priority:$('todo-priority').value})});$('todo-dialog').close();await reload();notice(id?'已保存修改':'已添加待办');}catch(e){notice(e.message);}finally{$('save-todo').disabled=false;}};
$('login-form').onsubmit=async event=>{event.preventDefault();try{await api('/api/login',{method:'POST',body:JSON.stringify({token:$('login-token').value})});$('login-token').value='';await reload();}catch(e){notice(e.message);}};
$('toggle-demo').onclick=async()=>{demo=!demo;try{await reload();}catch(e){notice(e.message);}};
$('refresh').onclick=async()=>{try{await api('/api/refresh',{method:'POST',body:'{}'});notice('正在刷新天气和额度');setTimeout(()=>reload().catch(e=>notice(e.message)),2000);}catch(e){notice(e.message);}};
$('logout').onclick=async()=>{try{await api('/api/logout',{method:'POST',body:'{}'});data=null;items=[];$('app').hidden=true;$('login').hidden=false;$('connection').textContent='已退出登录';}catch(e){notice(e.message);}};
async function saveLocation(value){await api('/api/config',{method:'PATCH',body:JSON.stringify({...value,locationConfirmed:true})});locationDirty=false;await reload();notice('地点已保存，天气正在更新');setTimeout(()=>reload().catch(e=>notice(e.message)),2000);}
$('location-form').oninput=()=>locationDirty=true;
$('location-form').onsubmit=async event=>{event.preventDefault();try{await saveLocation({name:$('location-name').value,latitude:Number($('latitude').value),longitude:Number($('longitude').value),timeZone:$('time-zone').value,locationMode:'fixed',locationUpdatedAt:null});}catch(e){notice(e.message);}};
const geoAvailable=window.isSecureContext&&!!navigator.geolocation;
$('geo-note').textContent=geoAvailable?'点击后由浏览器请求位置权限；未授权时继续使用已保存地区。':'iPhone 定位需要 HTTPS。当前地址可手动设置地区。';
$('use-location').onclick=()=>navigator.geolocation.getCurrentPosition(async p=>{try{await saveLocation({name:'当前位置',latitude:Math.round(p.coords.latitude*1000)/1000,longitude:Math.round(p.coords.longitude*1000)/1000,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone||data.location.timeZone,locationMode:'device',locationUpdatedAt:new Date().toISOString()});}catch(e){notice(e.message);}},()=>notice('暂未取得位置，请允许定位或手动设置地区'),{enableHighAccuracy:false,maximumAge:300000,timeout:15000});
reload().catch(e=>{$('connection').textContent=!$('login').hidden?'使用管理密钥登录':navigator.onLine?'连接失败 · '+e.message:'离线 · 连接网络后重试';});
setInterval(()=>{if(!$('app').hidden&&!document.hidden)reload().catch(()=>{$('connection').textContent='连接中断 · 当前保留上次画面';});},30000);
setInterval(tick,1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!$('app').hidden)reload().catch(()=>{});});
if('serviceWorker'in navigator&&window.isSecureContext)navigator.serviceWorker.register('/sw.js').catch(()=>{});
