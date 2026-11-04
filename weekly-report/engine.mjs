/* EHS 週報：可同時於瀏覽器（預覽）與 Node.js（發送）執行。無網路副作用。 */
export const FACTORIES = ['ARO1廠','SM廠麥寮','PABS廠(麥寮)','PC廠','HAC廠','ARO2廠','ARO3廠','SM廠海豐','合成酚廠','PP廠'];
export const DEFAULT_CONFIG = Object.freeze({
  version:2, enabled:false, day:0, hour:18, minute:0, timezone:'Asia/Taipei',
  sections:{tasks:true,projects:true,flare:true},
  features:{showDescription:true,showTodo:true,showWeeklyUpdates:true,showCompletedThisWeek:true},
  customSources:[], maxItems:150,
});
const ISO_RE=/^\d{4}-\d{2}-\d{2}$/;
const clip=(x,n=250)=>String(x??'').replace(/[\r\n\t]+/g,' ').replace(/<@!?\d+>|@everyone|@here/g,'[mention]').trim().slice(0,n);
export function normalizeConfig(raw={}){
  const src=raw&&typeof raw==='object'?raw:{};
  const conf={...DEFAULT_CONFIG,...src};
  conf.sections={...DEFAULT_CONFIG.sections,...(src.sections||{})};
  conf.features={...DEFAULT_CONFIG.features,...(src.features||{})};
  for(const k of Object.keys(DEFAULT_CONFIG.sections))conf.sections[k]=conf.sections[k]!==false;
  for(const k of Object.keys(DEFAULT_CONFIG.features))conf.features[k]=conf.features[k]!==false;
  conf.enabled=src.enabled===true;
  conf.day=Number.isInteger(Number(src.day))&&Number(src.day)>=0&&Number(src.day)<=6?Number(src.day):0;
  conf.hour=Number.isInteger(Number(src.hour))&&Number(src.hour)>=0&&Number(src.hour)<=23?Number(src.hour):18;
  conf.minute=Number.isInteger(Number(src.minute))&&Number(src.minute)>=0&&Number(src.minute)<=59?Number(src.minute):0;
  conf.version=2;
  conf.maxItems=Math.min(250,Math.max(10,Number(src.maxItems)||150));
  conf.customSources=Array.isArray(src.customSources)?src.customSources.slice(0,15).filter(c=>
    c&&/^[A-Za-z0-9_-]{1,80}$/.test(c.collection||'')&&/^[A-Za-z0-9_-]{1,40}$/.test(c.titleField||'')&&
    /^[A-Za-z0-9_-]{1,40}$/.test(c.statusField||'')&&/^[A-Za-z0-9_-]{1,40}$/.test(c.dateField||'')
  ).map(c=>({id:clip(c.id,64),title:clip(c.title,60),collection:c.collection,
    titleField:c.titleField,statusField:c.statusField,dateField:c.dateField,
    doneValue:clip(c.doneValue||'COMPLETED',60),enabled:c.enabled!==false})):[];
  return conf;
}
// 臺灣無夏令時間；固定 +08:00 換算避免伺服器 UTC 時區誤差。
export function localDate(date=new Date()) {return new Date(new Date(date).getTime()+8*3600000).toISOString().slice(0,10);}
export function localHour(date=new Date()) {return Number(new Date(new Date(date).getTime()+8*3600000).toISOString().slice(11,13));}
export function localMinute(date=new Date()) {return Number(new Date(new Date(date).getTime()+8*3600000).toISOString().slice(14,16));}
export function localTime(date=new Date()) {return `${String(localHour(date)).padStart(2,"0")}:${String(localMinute(date)).padStart(2,"0")}`;}
export function localDay(date=new Date()) {return new Date(`${localDate(date)}T00:00:00Z`).getUTCDay();}
export function dateShift(day,amount) {const d=new Date(`${day}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+amount);return d.toISOString().slice(0,10);}
export function weekRange(date=new Date()) {
  const now=localDate(date),offset=(new Date(`${now}T00:00:00Z`).getUTCDay()+6)%7;
  return {from:dateShift(now,-offset),to:now,weekEnd:dateShift(now,6-offset)};
}
export function dateOnly(value){
  if(!value)return '';
  if(typeof value==='string'){if(ISO_RE.test(value.slice(0,10)))return value.slice(0,10);const d=new Date(value);return Number.isNaN(d.getTime())?'':localDate(d);}
  if(value?.toDate)return localDate(value.toDate());
  if(typeof value?.seconds==='number')return localDate(new Date(value.seconds*1000));
  if(value instanceof Date)return Number.isNaN(value.getTime())?'':localDate(value);
  return '';
}
const inWeek=(d,r)=>Boolean(d&&d>=r.from&&d<=r.to);
function lastLog(logs){return (Array.isArray(logs)?logs:[]).filter(x=>x&&typeof x==='object').sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')))[0]||null;}
const isProjectDone=p=>p.executionStatus?p.executionStatus==='COMPLETED':p.status==='COMPLETED';
const pStatus=p=>({NOT_STARTED:'未開始',IN_PROGRESS:'辦理中',PENDING:'待確認',PAUSED:'暫停',COMPLETED:'已結案'}[p.executionStatus]||({ON_TRACK:'舊狀態：正常',DELAYED:'舊狀態：落後',COMPLETED:'舊狀態：結案'}[p.status]||'待確認'));
function orderEntries(items){return items.sort((a,b)=>a.rank-b.rank||String(a.due||'9999').localeCompare(String(b.due||'9999'))||a.name.localeCompare(b.name,'zh-Hant'));}
export function taskRows(records,range,conf){
  const open=[],finished=[];
  for(const t of records||[]){
    const done=Number(t.progress)>=100,updated=dateOnly(t._updatedTs),created=dateOnly(t._createdTs)||dateOnly(t.createdAt);
    const recent=inWeek(updated,range)||inWeek(created,range)|| (t.progressLogs||[]).some(x=>inWeek(dateOnly(x.date),range));
    // 工作沒有獨立結案日期，本週完成只能保守標示「目前已完成且本週有更新」。
    if(done&&!recent)continue;
    if(done&&!conf.features.showCompletedThisWeek)continue;
    const status=done?'已完成（本週有更新）':t.deadline&&t.deadline<range.to?'逾期':'進行中';
    const log=lastLog(t.progressLogs),desc=conf.features.showDescription?clip(t.desc||t.workProgress,150):'';
    const note=''; // 使用者要求取消『最新進度』，僅標記本週有更新，不輸出進度紀錄內容。
    const item={name:clip(t.task||'未命名工作',100),status,factory:clip(t.factory,40),due:clip(t.deadline,15),desc,
      todo:conf.features.showTodo?clip(t.closeNote||'',100):'', note,
      updated:recent,rank:done?3:(status==='逾期'?0:1)};
    (done?finished:open).push(item);
  }
  return {open:orderEntries(open),finished:orderEntries(finished)};
}
export function projectRows(records,range,conf){
  const open=[],finished=[];
  for(const p of records||[]){
    const done=isProjectDone(p),closed=dateOnly(p.closedAt),updated=dateOnly(p.updatedAt),created=dateOnly(p.createdAt);
    const logs=Array.isArray(p.executionLogs)?p.executionLogs:[];
    const recent=inWeek(updated,range)||inWeek(created,range)||logs.some(l=>inWeek(dateOnly(l.date),range));
    const justClosed=done&&(inWeek(closed,range)||(!closed&&recent));
    if(done&&!justClosed)continue;
    if(done&&!conf.features.showCompletedThisWeek)continue;
    const pending=(Array.isArray(p.todos)?p.todos:[]).filter(t=>t?.done!==true);
    const nearest=orderEntries(pending.map(t=>({name:clip(t.content,120),due:dateOnly(t.dueDate),rank:t.dueDate&&t.dueDate<range.to?0:1}))).slice(0,3);
    const status=done?closed?'已結案':'舊案已結案（日期待確認）':(p.endDate&&p.endDate<range.to?'逾期':pStatus(p));
    const item={name:clip(p.name||'未命名專案',100),status,factory:clip(p.factory,40),due:dateOnly(p.endDate),
      desc:conf.features.showDescription?clip(p.projectContent||p.description,160):'',
      todo:conf.features.showTodo?nearest.map(x=>`${x.name}${x.due?'（期限 '+x.due+'）':''}`).join('；'):'' ,
      updated:recent, rank:done?3:(status==='逾期'?0:1)};
    (done?finished:open).push(item);
  }
  return {open:orderEntries(open),finished:orderEntries(finished)};
}
export function flareRows(state={},range){
  const result=new Map(FACTORIES.map(name=>[name,new Set()]));
  for(const ev of Array.isArray(state.events)?state.events:[]){
    const name=ev.factory,day=dateOnly(ev.date);
    if(!name||!day||!inWeek(day,range))continue;
    if(!Number.isFinite(Number(String(ev.amount??0).replace(/,/g,'')))||Number(String(ev.amount??0).replace(/,/g,''))<=0)continue;
    const exclude=`${day.slice(0,4)}|${name}|${day}`;
    if(state.excludedDays?.[exclude])continue;
    if(!result.has(name))result.set(name,new Set());
    result.get(name).add(day);
  }
  return [...result].map(([factory,days])=>({factory,days:days.size,dates:[...days].sort()}));
}
// 與 /FLARE/index.html 的 factoryConfig、renderAll() 完全相同的廠區歸屬。
// 同一廠區不同工廠同一天發生事件，廠區合計也只算 1 天。
export const FLARE_AREAS = Object.freeze([
  {name:'麥寮廠', factories:['ARO1廠','SM廠麥寮','PABS廠(麥寮)','PC廠']},
  {name:'海豐廠', factories:['ARO2廠','ARO3廠','SM廠海豐','合成酚廠','PP廠']},
  {name:'醋酸廠', factories:['HAC廠']},
]);
export function flareAreaRows(state={},range){
  const year=String(range.to).slice(0,4),yearStart=`${year}-01-01`;
  const index=new Map(FLARE_AREAS.flatMap(area=>area.factories.map(factory=>[factory,area.name])));
  const annual=new Map(FLARE_AREAS.map(area=>[area.name,new Set()]));
  const weekly=new Map(FLARE_AREAS.map(area=>[area.name,new Set()]));
  for(const ev of Array.isArray(state.events)?state.events:[]){
    const day=dateOnly(ev?.date),name=ev?.factory,area=index.get(name);
    if(!area||!day||day>range.to)continue;
    if(state.excludedDays?.[`${day.slice(0,4)}|${name}|${day}`])continue;
    // FLARE 原表 renderAll：以「有排放事件紀錄」及人工剔除來統計，
    // 不在週報另加 amount > 0 條件，以免年度數字和原統計表不一致。
    if(day>=yearStart)annual.get(area).add(day);
    if(day>=range.from)weekly.get(area).add(day);
  }
  return FLARE_AREAS.map(area=>{
    const dates=[...weekly.get(area.name)].sort();
    return {factory:area.name,yearDays:annual.get(area.name).size,days:dates.length,dates};
  });
}
function flareDateText(day){
  const weekday=['日','一','二','三','四','五','六'][new Date(`${day}T00:00:00Z`).getUTCDay()];
  return `${day.slice(5).replace('-','/')}（${weekday}）`;
}
export function genericRows(records,s,range){
  const open=[],finished=[];
  for(const obj of records||[]){const value=String(obj[s.statusField]??'');const done=value===s.doneValue;
    const updated=dateOnly(obj[s.dateField]);if(done&&!inWeek(updated,range))continue;
    const row={name:clip(obj[s.titleField]||'未命名項目',100),status:clip(value,60),updated:inWeek(updated,range),due:'',desc:'',todo:'',rank:done?3:1};
    (done?finished:open).push(row);
  }return {open:orderEntries(open),finished:orderEntries(finished)};
}
function showItem(x,idx){
  const mark=x.updated?' [本週更新]':'';
  const main=`${idx+1}. ${x.name}｜${x.status}${mark}${x.due?'｜期限 '+x.due:''}${x.factory?'｜'+x.factory:''}`;
  return [main,x.desc?`　工作內容：${x.desc}`:'',x.todo?`　待辦：${x.todo}`:'',x.note?`　本週紀錄：${x.note}`:''].filter(Boolean);
}
export function buildReport(data,config=DEFAULT_CONFIG,now=new Date()){
  const conf=normalizeConfig(config),range=weekRange(now),lines=[];
  lines.push(`EHS 自動總週報｜${range.from}～${range.to}（截至 ${localDate(now)} ${localTime(now)} 台灣時間）`);
  lines.push('範圍：所有未結案工作／專案＋本週已完成項目；不顯示進度百分比。');
  let totalOpen=0,totalFinished=0;
  const section=(title,entries)=>{
    const open=entries.open.slice(0,conf.maxItems),finished=entries.finished.slice(0,conf.maxItems);
    totalOpen+=entries.open.length;totalFinished+=entries.finished.length;
    lines.push('',`【${title}】未結案 ${entries.open.length}；本週完成/更新且已完成 ${entries.finished.length}`);
    if(!open.length&&!finished.length)lines.push('無資料');
    if(open.length){lines.push('未結案：');open.forEach((x,i)=>lines.push(...showItem(x,i)));}
    if(finished.length){lines.push('本週完成：');finished.forEach((x,i)=>lines.push(...showItem(x,i)));}
    if(entries.open.length>open.length||entries.finished.length>finished.length)lines.push(`（超過每類 ${conf.maxItems} 筆上限，請至網站查看完整資料）`);
  };
  if(conf.sections.tasks)section('環安衛工作管理',taskRows(data.tasks||[],range,conf));
  if(conf.sections.projects)section('年度安衛環專案',projectRows(data.projects||[],range,conf));
  if(conf.sections.flare){
    if(!Array.isArray(data.flare?.events)){
      lines.push('','【廢氣燃燒塔】尚未取得有效的 FLARE 事件資料，無法判斷使用日數。請檢查 Firebase 來源。');
    }else{
      const usage=flareAreaRows(data.flare,range);
      lines.push('',`【廢氣燃燒塔】${range.to.slice(0,4)} 年各廠區累計使用事件日數（截至 ${range.to}）`);
      lines.push(`本週區間：${range.from}～${range.to}；各廠區同日不重複計算，排除人工剔除日。`);
      usage.forEach(x=>lines.push(`${x.factory}：年度累計 ${x.yearDays} 天｜本週 ${x.days} 天｜${x.days?'使用日期：'+x.dates.map(flareDateText).join('、'):'本週無使用'}`));
      if(data.previousFlare){
        const last=data.previousFlare;
        const previous=new Map((last.counts||[]).map(x=>[x.factory,x.days]));
        // 舊版曾用 10 座工廠存歷史數值，與本版 3 廠區不能直接相比，避免誤報。
        if(usage.every(x=>previous.has(x.factory))){
          const then=flareAreaRows(data.flare,{from:last.from,to:last.to});
          const changes=then.filter(x=>x.days!==previous.get(x.factory));
          if(changes.length){lines.push('','上週補登／修正（廠區日數）：');changes.forEach(x=>lines.push(`${x.factory}：${previous.get(x.factory)} → ${x.days} 天`));}
        }
      }
    }
  }
  for(const s of conf.customSources.filter(x=>x.enabled))section(s.title,genericRows(data.custom?.[s.id]||[],s,range));
  lines.push('','—— 資料來源：Firebase Cloud Firestore｜報表僅供指定 Discord 私人頻道使用');
  return {text:lines.join('\n'),range,totalOpen,totalFinished,flareCounts:conf.sections.flare&&Array.isArray(data.flare?.events)?flareAreaRows(data.flare,range).map(x=>({factory:x.factory,days:x.days})):[]};
}
export function splitDiscord(text,max=1800){
  const lines=text.split('\n'),chunks=[];let chunk='';
  for(const line of lines){const words=line.length>max?line.match(new RegExp(`.{1,${max}}`,'gu')): [line];
    for(const part of words){if(chunk&&`${chunk}\n${part}`.length>max){chunks.push(chunk);chunk='';}chunk+=(chunk?'\n':'')+part;}
  }if(chunk)chunks.push(chunk);return chunks;
}
