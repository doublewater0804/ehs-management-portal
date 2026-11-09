/** EHS R0.4: RFC 5545 iCalendar (.ics) import/export; all UI dates use Asia/Taipei. */
import {pad, validISO} from './logic.js?v=R0.4';

const TZ='Asia/Taipei';
const oneDay=86400000;
const asDate=n=>new Date(n*oneDay).toISOString().slice(0,10);
const dayNum=s=>Date.parse(s+'T00:00:00Z')/oneDay;
const shiftDate=(s,days)=>asDate(dayNum(s)+days);
const dateCompact=s=>s.replaceAll('-','');
const stamp=()=>new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
const enc=new TextEncoder();
function textEscape(s){return String(s??'').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');}
function textUnescape(s){return String(s??'').replace(/\\([nN,;\\])/g,(_,c)=>c==='n'||c==='N'?'\n':c);}
function fold(line){
  let result='',current='',bytes=0;
  for(const character of line){
    const length=enc.encode(character).length;
    if(bytes+length>75&&current){result+=current+'\r\n ';current='';bytes=1;}
    current+=character;bytes+=length;
  }
  return result+current;
}
const validTime=s=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s||'');
function taipeiUTC(date,time){
  const [y,m,d]=date.split('-').map(Number),[h,mm]=time.split(':').map(Number);
  return new Date(Date.UTC(y,m-1,d,h-8,mm,0));
}
function icsDateTime(date,time){return taipeiUTC(date,time).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');}
const prettyZoneDate=new Intl.DateTimeFormat('en-US',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
function taipeiParts(dt){
  const parts=Object.fromEntries(prettyZoneDate.formatToParts(dt).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`};
}
const categories={meeting:'會議',audit:'稽核',training:'教育訓練',other:'其他'};
function hashId(s){let h=2166136261;for(const c of s){h=Math.imul(h^c.codePointAt(0),16777619)>>>0;}return h.toString(36);}
function occurrence(e){
  // R0.4：同一跨日事件會在多個日期格出現，但 ICS 只能以原本「事件開始日」輸出一筆。
  const start=e.occurrenceStart||e.occurrenceDate||e.startDate;
  if(!validISO(start)||!String(e.title||'').trim())return null;
  if(e.allDay){
    const end=e.endDate||e.startDate;
    if(end&&!validISO(end))return null;
    const duration=validISO(end)?dayNum(end)-dayNum(e.startDate):0;
    if(duration<0)return null;
    return {...e,start,endDate:shiftDate(start,duration+1),allDay:true};
  }
  if(!validTime(e.startTime)||!validTime(e.endTime)||!validISO(e.endDate))return null;
  const offset=dayNum(e.endDate)-dayNum(e.startDate);
  const endDate=shiftDate(start,offset);
  const startUTC=taipeiUTC(start,e.startTime),endUTC=taipeiUTC(endDate,e.endTime);
  if(endUTC<=startUTC)return null;
  return {...e,start,endDate,startUTC,endUTC,allDay:false};
}
function uidFor(e){const base=String(e.id||'').replace(/[^A-Za-z0-9_-]/g,'').slice(0,60)||hashId([e.title,e.startDate,e.startTime].join('|'));return `${base}-${hashId([e.title,e.startDate,e.startTime].join('|'))}@ehs-calendar.local`;}
function rrule(e,allOccurrences){
  if(!['daily','weekly','monthly'].includes(e.repeat)||allOccurrences.length<2)return '';
  const freq={daily:'DAILY',weekly:'WEEKLY',monthly:'MONTHLY'}[e.repeat];
  const last=allOccurrences.at(-1),until=last.allDay?dateCompact(last.start):icsDateTime(last.start,last.startTime);
  return `RRULE:FREQ=${freq};UNTIL=${until}`;
}
/** Input is the filtered & expanded occurrence list from monthOccurrences().
 * Repeat events are re-aggregated inside the selected date range; repeated events without
 * full end-time information are deliberately skipped, never converted to all-day events. */
export function icsExport(events){
  const groups=new Map(),skipped=[],lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//EHS Management Portal//Smart Calendar R0.4//ZH-TW','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:'+textEscape('EHS 智慧行事曆'),'X-WR-TIMEZONE:Asia/Taipei'];
  const skippedKeys=new Set();
  for(const e of events){
    const start=e.occurrenceStart||e.occurrenceDate||e.startDate;
    const sourceKey=uidFor(e)+'|'+start;
    const converted=occurrence(e);
    if(!converted){
      if(!skippedKeys.has(sourceKey)){skippedKeys.add(sourceKey);skipped.push(e);}
      continue;
    }
    const key=e.repeat&&e.repeat!=='none'?'repeat:'+uidFor(e):'single:'+uidFor(e)+':'+converted.start;
    if(!groups.has(key))groups.set(key,new Map());
    // 去除「跨日在各日期格顯示」及「跨月份取得」所重複帶入的同一次事件。
    groups.get(key).set(converted.start,converted);
  }
  let validCount=0;
  for(const unique of groups.values()){
    const group=[...unique.values()].sort((a,b)=>a.start.localeCompare(b.start));
    const first=group[0],source=first;
    const description=[source.description,source.owner?`負責人：${source.owner}`:''].filter(Boolean).join('\n');
    lines.push('BEGIN:VEVENT','UID:'+uidFor(source),'DTSTAMP:'+stamp(),
      'SUMMARY:'+textEscape(source.title),
      'DESCRIPTION:'+textEscape(description),
      'LOCATION:'+textEscape(source.location),
      'CLASS:PRIVATE');
    if(first.allDay){
      lines.push(`DTSTART;VALUE=DATE:${dateCompact(first.start)}`,`DTEND;VALUE=DATE:${dateCompact(first.endDate)}`);
    }else{
      lines.push(`DTSTART:${icsDateTime(first.start,first.startTime)}`,`DTEND:${icsDateTime(first.endDate,first.endTime)}`);
    }
    const rec=rrule(source,group);if(rec)lines.push(rec);
    if(source.categoryId)lines.push('CATEGORIES:'+textEscape(categories[source.categoryId]||source.categoryId),'X-EHS-CATEGORY-ID:'+textEscape(source.categoryId));
    if(source.owner)lines.push('X-EHS-OWNER:'+textEscape(source.owner));
    if(['completed','postponed','cancelled'].includes(source.status))lines.push('X-EHS-STATUS:'+source.status);
    if(source.status==='cancelled')lines.push('STATUS:CANCELLED');
    lines.push('END:VEVENT');validCount+=group.length;
  }
  lines.push('END:VCALENDAR');
  return {ics:lines.map(fold).join('\r\n')+'\r\n',skipped,validCount,componentCount:groups.size};
}
function unfold(text){
  const raw=String(text||'').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n');
  const out=[];
  for(const l of raw){if(/^[\t ]/.test(l)&&out.length)out[out.length-1]+=l.slice(1);else if(l)out.push(l);}
  return out;
}
function readProp(line){
  const sep=line.indexOf(':');if(sep<0)return null;
  const head=line.slice(0,sep).split(';');let params={};
  for(const val of head.slice(1)){let idx=val.indexOf('=');if(idx>0)params[val.slice(0,idx).toUpperCase()]=val.slice(idx+1).replace(/^"|"$/g,'');}
  return {name:head[0].toUpperCase(),params,value:line.slice(sep+1)};
}
const compactISO=s=>{if(!/^\d{8}$/.test(s))throw Error('ICS 日期格式不正確');const v=`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;if(!validISO(v))throw Error('ICS 日期無效');return v;};
const zoneFormats=new Map();
function zonedUTC(s,zone){
  const y=+s.slice(0,4),m=+s.slice(4,6),d=+s.slice(6,8),h=+s.slice(9,11),mm=+s.slice(11,13),ss=+s.slice(13,15);
  if(zone===TZ)return new Date(Date.UTC(y,m-1,d,h-8,mm,ss));
  if(!zoneFormats.has(zone))zoneFormats.set(zone,new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}));
  const fmt=zoneFormats.get(zone),goal=Date.UTC(y,m-1,d,h,mm,ss);let guess=goal;
  for(let i=0;i<5;i++){
    let p=Object.fromEntries(fmt.formatToParts(new Date(guess)).filter(x=>x.type!=='literal').map(x=>[x.type,+x.value]));
    let observed=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);if(observed===goal)return new Date(guess);
    guess+=goal-observed;
  }
  throw Error('時區的日期時間無法確定（可能是夏令時間切換）');
}
function getTime(p){
  if(!p)throw Error('缺少 DTSTART');
  const value=p.value.trim(),dateOnly=p.params.VALUE?.toUpperCase()==='DATE'||/^\d{8}$/.test(value);
  if(dateOnly)return {date:compactISO(value),time:'',allDay:true,zone:''};
  if(!/^\d{8}T(?:[01]\d|2[0-3])[0-5]\d[0-5]\dZ?$/.test(value))throw Error('ICS 時間格式不支援');
  compactISO(value.slice(0,8));
  const utc=value.endsWith('Z');const zone=utc?'UTC':p.params.TZID||TZ;
  const dateObj=utc?new Date(Date.UTC(+value.slice(0,4),+value.slice(4,6)-1,+value.slice(6,8),+value.slice(9,11),+value.slice(11,13),+value.slice(13,15))):zonedUTC(value,zone);
  return {...taipeiParts(dateObj),allDay:false,zone};
}
function eventVal(props,name){return props.find(p=>p.name===name);}
const wd=['SU','MO','TU','WE','TH','FR','SA'];
function countDate(start,count,freq){
  if(count>10000||count<1)throw Error('重複次數必須介於 1～10000');
  if(freq==='DAILY')return shiftDate(start,count-1);
  if(freq==='WEEKLY')return shiftDate(start,7*(count-1));
  const [y,m,d]=start.split('-').map(Number);let last=start,seen=1;
  for(let step=1;step<120000&&seen<count;step++){
    const date=new Date(Date.UTC(y,m-1+step,1)),s=`${date.getUTCFullYear()}-${pad(date.getUTCMonth()+1)}-${pad(d)}`;
    if(validISO(s)){last=s;seen++;}
  }
  if(seen<count)throw Error('重複次數超出可處理範圍');
  return last;
}
function readRule(rule,start){
  if(!rule)return {repeat:'none',repeatUntil:''};
  const items=Object.fromEntries(rule.value.toUpperCase().split(';').map(x=>x.split('=',2)));
  const freq=items.FREQ,repeat={DAILY:'daily',WEEKLY:'weekly',MONTHLY:'monthly'}[freq];
  if(!repeat||Object.keys(items).some(x=>!['FREQ','INTERVAL','UNTIL','COUNT','BYDAY','BYMONTHDAY','WKST'].includes(x)))throw Error('不支援的重複規則，請在 Google 日曆中處理');
  if(items.INTERVAL&&items.INTERVAL!=='1')throw Error('不支援每隔多週／多月的重複規則');
  if(items.BYDAY){
    const own=wd[new Date(start.date+'T00:00:00Z').getUTCDay()];
    if(freq!=='WEEKLY'||items.BYDAY!==own)throw Error('不支援多星期或指定第幾週的重複規則');
  }
  if(items.BYMONTHDAY&&(freq!=='MONTHLY'||items.BYMONTHDAY!==String(Number(start.date.slice(8)))))throw Error('不支援複雜每月重複規則');
  if(items.COUNT&&items.UNTIL)throw Error('同時包含 COUNT 和 UNTIL 的重複規則無法確認');
  let repeatUntil='';
  if(items.COUNT){if(!/^\d+$/.test(items.COUNT))throw Error('重複次數不正確');let count=+items.COUNT;if(count===1)return {repeat:'none',repeatUntil:''};repeatUntil=countDate(start.date,count,freq);}
  if(items.UNTIL){const p={name:'UNTIL',params:{VALUE:start.allDay?'DATE':'DATE-TIME'},value:items.UNTIL};repeatUntil=getTime(p).date;}
  if(repeatUntil&&repeatUntil<start.date)throw Error('重複結束日早於開始日期');
  if(start.zone&&![TZ,'UTC'].includes(start.zone))throw Error('非台灣時區的跨日週期規則無法安全換算');
  return {repeat,repeatUntil};
}
function normalizeEvent(props){
  const p=name=>eventVal(props,name);const title=textUnescape(p('SUMMARY')?.value||'').trim();
  const start=getTime(p('DTSTART'));if(!title)throw Error('缺少活動名稱');
  let end=p('DTEND')?getTime(p('DTEND')):null;
  if(!end&&p('DURATION')){
    const duration=p('DURATION').value;const m=duration.match(/^P(?:(\d+)W|(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?)$/);
    if(!m)throw Error('不支援的 DURATION 格式');
    const ms=(+(m[1]||0)*7*24*60 + +(m[2]||0)*24*60 + +(m[3]||0)*60 + +(m[4]||0))*60000 + +(m[5]||0)*1000;
    if(ms<=0)throw Error('DURATION 必須大於零');
    if(start.allDay){if(ms%oneDay)throw Error('全天活動 DURATION 必須是完整天數');end={allDay:true,date:shiftDate(start.date,ms/oneDay),time:''};}
    else{const dt=taipeiUTC(start.date,start.time);end={...taipeiParts(new Date(dt.getTime()+ms)),allDay:false};}
  }
  if(end&&start.allDay!==end.allDay)throw Error('起迄日期類型不一致');
  if(end&&end.date<start.date)throw Error('結束時間早於開始時間');
  if(!start.allDay&&end&&`${end.date}T${end.time}`<=`${start.date}T${start.time}`)throw Error('結束時間必須晚於開始時間');
  let endDate='',endTime='';
  if(start.allDay){
    if(end){const last=shiftDate(end.date,-1);if(last<start.date)throw Error('全天活動 DTEND 必須晚於 DTSTART');endDate=last===start.date?'':last;}
  }else if(end){endDate=end.date;endTime=end.time;}
  const rule=readRule(p('RRULE'),start);
  const status=textUnescape(p('X-EHS-STATUS')?.value||'');
  const xcat=textUnescape(p('X-EHS-CATEGORY-ID')?.value||'');
  const owner=textUnescape(p('X-EHS-OWNER')?.value||'');
  let description=textUnescape(p('DESCRIPTION')?.value||'');
  if(owner&&description.endsWith('\n負責人：'+owner))description=description.slice(0,-('\n負責人：'+owner).length);
  return {title,startDate:start.date,startTime:start.time,endDate,endTime,allDay:start.allDay,
    location:textUnescape(p('LOCATION')?.value||''),description,
    owner,categoryId:xcat||'other',
    status:['completed','postponed','cancelled'].includes(status)?status:p('STATUS')?.value==='CANCELLED'?'cancelled':'pending',
    reminder:'off',...rule};
}
/** Rejects complex recurrence/exception patterns rather than silently losing exceptions. */
export function icsImport(text){
  const lines=unfold(text);if(!lines.length||lines[0].trim().toUpperCase()!=='BEGIN:VCALENDAR'||!lines.some(x=>x.trim().toUpperCase()==='END:VCALENDAR'))throw Error('不是有效的 iCalendar ICS 檔案');
  const blocks=[];let ev=null,depth=0,uid='';
  for(const line of lines){const upper=line.toUpperCase();
    if(upper==='BEGIN:VEVENT'){if(ev)throw Error('ICS VEVENT 巢狀格式不正確');ev=[];depth=0;continue;}
    if(upper==='END:VEVENT'){if(ev){blocks.push(ev);ev=null;}continue;}
    if(!ev)continue;
    if(upper.startsWith('BEGIN:')){depth++;continue;}
    if(upper.startsWith('END:')){depth=Math.max(0,depth-1);continue;}
    if(depth===0){const p=readProp(line);if(p)ev.push(p);}
  }
  if(ev)throw Error('ICS VEVENT 缺少結束標記');
  if(blocks.length>5000)throw Error('ICS 行程超過 5000 筆，請分批匯入');
  const complexUids=new Set(blocks.filter(b=>b.some(p=>p.name==='RECURRENCE-ID')).map(b=>eventVal(b,'UID')?.value||''));
  const events=[],errors=[];
  blocks.forEach((b,i)=>{
    try{
      const uid=eventVal(b,'UID')?.value||'';
      if(complexUids.has(uid)||b.some(p=>['EXDATE','RDATE','RECURRENCE-ID'].includes(p.name)))throw Error('含例外日期或個別修改的週期活動，無法無損匯入，請在 Google 日曆處理');
      const normalized=normalizeEvent(b);events.push(normalized);
    }catch(err){errors.push(`第 ${i+1} 筆：${err?.message||err}`);}
  });
  return {events,errors};
}
