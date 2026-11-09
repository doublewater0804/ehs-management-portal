import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,signInWithRedirect,getRedirectResult,onAuthStateChanged,signOut,setPersistence,browserLocalPersistence} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,collection,doc,addDoc,setDoc,updateDoc,deleteDoc,getDocs,onSnapshot,serverTimestamp,writeBatch} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import {firebaseConfig,allowedEmail} from './config.js';
import {pad,validISO,localDate,parseSmart,monthOccurrences} from './logic.js?v=R0.4';
import {icsExport,icsImport} from './ics.js?v=R0.4';
import {officeDay,officeYearSupported} from './holidays.js?v=R0.1';
import {categoryColor,categoryTint,eventTimeText,eventStatusText,sortDayEvents} from './display.js?v=R0.4';
const $=id=>document.getElementById(id), now=localDate(), today=now, initialCategories=[{id:'meeting',name:'會議',color:'#2563eb',active:true},{id:'audit',name:'稽核',color:'#16a34a',active:true},{id:'training',name:'教育訓練',color:'#ea580c',active:true},{id:'other',name:'其他',color:'#9333ea',active:true}];
let auth,db,user,events=[],categories=[...initialCategories],month=Number(now.slice(5,7))-1,year=Number(now.slice(0,4)),selected=now,filter=new Set(),unsubs=[],pendingImport=[],smartRows=[],notificationSettings={enabled:true,defaultReminder:'off'};
const root='ehs_smart_calendar_r0', eventsPath=`${root}/data/events`, categoriesPath=`${root}/data/categories`,settingsPath=`${root}/data/settings`,monthlyNotesPath=`${root}/data/monthly_notes`;
let noteUnsub=null,noteKey='',noteOriginal='',noteDirty=false,notePending=false,noteLoaded=false; 
const dateKey=(y,m,d)=>`${y}-${pad(m+1)}-${pad(d)}`;
function tell(message,error=false){$('notice').hidden=false;$('notice').textContent=message;$('notice').style.borderColor=error?'#e19494':'#e8bb82'}
function safe(fn){return async(...args)=>{try{await fn(...args)}catch(e){console.error(e);tell('操作失敗：'+(e?.message||e),true)}}}
function clean(s){return String(s??'')}
function txt(node,s){node.textContent=clean(s);return node}
function el(tag,cls,text){let n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n}
function validEvent(e){
 if(!e.title?.trim())throw Error('請輸入活動名稱');
 if(!validISO(e.startDate))throw Error('開始日期不正確');
 if(e.endDate&&!validISO(e.endDate))throw Error('結束日期不正確');
 if(e.endTime&&!e.endDate)throw Error('填入結束時間時，需填結束日期');
 if(e.endTime&&!e.startTime)throw Error('填入結束時間時，需填開始時間');
 if(e.endDate&&e.endDate<e.startDate)throw Error('結束日期不得早於開始日期');
 if(e.endDate&&e.endTime&&`${e.endDate}T${e.endTime}`<=`${e.startDate}T${e.startTime}`)throw Error('結束時間必須晚於開始時間');
 if(e.repeatUntil&&(!validISO(e.repeatUntil)||e.repeatUntil<e.startDate))throw Error('重複截止日期不正確');
 if(e.allDay&&(e.startTime||e.endTime))throw Error('全天行程不可設定開始或結束時間');
 if(!['none','daily','weekly','monthly'].includes(e.repeat||'none'))throw Error('重複規則不正確');
 if(e.reminder==='custom' && (!Number.isInteger(Number(e.reminderMinutes))||Number(e.reminderMinutes)<0||Number(e.reminderMinutes)>10080))throw Error('自訂提醒限 0～10080 分鐘');
 return e;
}
function assertOnline(){if(!db||!user)throw Error('請先完成 Google 登入');}
function snapshot(obj){if(!obj)return null;return Object.fromEntries(Object.entries(obj).filter(([k])=>!['createdAt','updatedAt'].includes(k)));}
// 寫入活動與操作歷史採同一 batch：避免已刪除但歷史紀錄未保存。
async function saveEvent(ev,id){
 assertOnline();const normalized=validEvent({...ev});
 for(const key of ['id','createdAt','updatedAt','occurrenceDate','isOccurrence','occurrenceStart'])delete normalized[key];
 const old=id?events.find(x=>x.id===id):null;
 if(id&&!old)throw Error('行程已不存在，請重新整理');
 const chosen=categories.find(c=>c.id===normalized.categoryId);
 if(!chosen||(!chosen.active&&(!id||old.categoryId!==chosen.id)))throw Error('請選擇目前啟用中的活動分類');
 const ref=id?doc(db,eventsPath,id):doc(collection(db,eventsPath));
 const batch=writeBatch(db);const record=doc(collection(db,`${root}/data/history`));
 const payload={...normalized,updatedAt:serverTimestamp(),updatedBy:user.email};
 if(!id)payload.createdAt=serverTimestamp();
 batch.set(ref,payload,{merge:!!id});
 batch.set(record,{eventId:ref.id,action:id?'update':'create',before:snapshot(old),after:normalized,actor:user.email,at:serverTimestamp()});
 await batch.commit();
}
async function removeEvent(id){
 assertOnline();const old=events.find(x=>x.id===id);
 if(!old)throw Error('找不到活動，請重新整理');
 const batch=writeBatch(db);
 batch.delete(doc(db,eventsPath,id));
 batch.set(doc(collection(db,`${root}/data/history`)),{eventId:id,action:'delete',before:snapshot(old),after:null,actor:user.email,at:serverTimestamp()});
 await batch.commit();
}
function activeCats(){return categories.filter(c=>c.active)}
function category(e){return categories.find(c=>c.id===e.categoryId)||{name:'未分類',color:'#9ca3af'}}
function render(){renderCategories();renderCalendar();renderDay()}
function renderCategories(){const area=$('categories');area.replaceChildren();categories.forEach(c=>{let label=el('label','catToggle');let input=document.createElement('input');input.type='checkbox';input.checked=!filter.has(c.id);input.addEventListener('change',()=>{if(input.checked)filter.delete(c.id);else filter.add(c.id);renderCalendar();renderDay()});label.append(input);const dot=el('i','dot');dot.style.background=c.color;label.append(dot,txt(el('span'),c.name+(c.active?'':'（停用）')));area.append(label)})}
function shownEvents(){let q=$('search').value.trim().toLowerCase();return monthOccurrences(events,year,month).filter(e=>!filter.has(e.categoryId)&&(!q||[e.title,e.location,e.owner,e.description].some(t=>String(t||'').toLowerCase().includes(q))))}
function renderCalendar(){
 let cal=$('calendar');cal.replaceChildren();
 $('monthLabel').textContent=`${year} 年 ${month+1} 月`;
 $('calendarHeading').textContent=`${year} 年 ${month+1} 月｜月份行事曆`;
 $('holidayStatus').textContent=officeYearSupported(year)?'依行政院人事行政總處政府行政機關辦公日曆（核定年度）標示；非民間企業個別休假規定。':`${year} 年尚未提供已核對的政府辦公日曆資料，暫不標示上班／休假底色。`;
 let day0=new Date(year,month,1).getDay(),last=new Date(year,month+1,0).getDate(),count=Math.ceil((day0+last)/7)*7;
 let view=shownEvents();for(let idx=0;idx<count;idx++){
  let d=idx-day0+1;let cell=el('div',`day ${d<1||d>last?'other':''}`);
  if(d>=1&&d<=last){
   let iso=dateKey(year,month,d);const office=officeDay(iso);
   cell.classList.add(`office-${office.kind}`);
   if(iso===today)cell.classList.add('today');if(iso===selected)cell.classList.add('selected');
   cell.tabIndex=0;cell.setAttribute('role','button');cell.setAttribute('aria-label',iso+(office.label?' '+office.label:'')+' 行程');
   cell.append(el('div','dayNum',String(d)));
   if(office.label)cell.append(el('small','holidayName',office.label));
   cell.addEventListener('click',()=>{selected=iso;renderCalendar();renderDay()});
   cell.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selected=iso;renderCalendar();renderDay()}});
   const same=view.filter(e=>e.occurrenceDate===iso).sort((a,b)=>{
   const shownStart=e=>e.occurrenceStart===e.occurrenceDate?(e.startTime||''):'';
   return shownStart(a).localeCompare(shownStart(b));
  });
   same.slice(0,4).forEach(ev=>{const time=eventTimeText(ev);let p=el('button',`eventPill ${ev.status==='completed'?'done':''} ${ev.status==='cancelled'?'cancel':''}`,`${time?time+' ':''}${ev.title}`);p.style.background=category(ev).color+'25';p.style.borderLeft=`3px solid ${categoryColor(category(ev).color)}`;p.title=ev.title;p.addEventListener('click',e=>{e.stopPropagation();openEditor(ev)});cell.append(p)});
   if(same.length>4)cell.append(el('small','muted',`另有 ${same.length-4} 件`));
  }
  cal.append(cell);
 }
}
function renderDay(){
 const area=$('detail');area.replaceChildren();$('detailTitle').textContent=`${selected}｜當日行程`;
 const same=sortDayEvents(shownEvents().filter(e=>e.occurrenceDate===selected),categories);
 if(!same.length)area.append(el('p','emptyDetail','當日尚無行程，可使用上方「當日行程新增」建立。'));
 for(const ev of same){
  const cat=category(ev), color=categoryColor(cat.color), row=el('div','detailItem');
  const b=el('button','detailEvent');b.type='button';
  b.style.backgroundColor=categoryTint(color);
  b.style.borderLeftColor=color;
  const tag=el('span','detailCategory',cat.name);tag.style.borderColor=color;
  tag.style.backgroundColor=categoryTint(color,0.70);
  b.append(tag);
  const time=eventTimeText(ev);
  if(time)b.append(el('span','detailTime',time));
  b.append(el('span','detailEventTitle',ev.title));
  b.append(el('span','detailStatus',eventStatusText(ev)));
  if(ev.location)b.append(el('span','detailLocation',ev.location));
  b.addEventListener('click',()=>openEditor(ev));
  row.append(b);area.append(row);
 }
 $('addToday').disabled=!user;
}
function setView(y,m){
 if(y===year&&m===month){selected=dateKey(y,m,1);render();return;}
 if((noteDirty||notePending)&&!confirm(`「${noteKey}」月份備註有未儲存或正在儲存的內容，確定放棄修改並切換月份嗎？`))return;
 year=y;month=m;selected=dateKey(year,month,1);render();loadMonthNote();
}
function openEditor(ev=null,date=selected){if(!user)return tell('請先登入',true);const form=$('editorForm');form.reset();form.elements.id.value=ev?.id||'';form.elements.title.value=ev?.title||'';form.elements.startDate.value=ev?.startDate||date;form.elements.startTime.value=ev?.startTime||'';form.elements.endDate.value=ev?.endDate||'';form.elements.endTime.value=ev?.endTime||'';form.elements.location.value=ev?.location||'';form.elements.owner.value=ev?.owner||'';form.elements.description.value=ev?.description||'';form.elements.status.value=ev?.status||'pending';form.elements.reminder.value=ev?.reminder||notificationSettings.defaultReminder||'off';form.elements.reminderMinutes.value=ev?.reminderMinutes??60;form.elements.repeat.value=ev?.repeat||'none';form.elements.repeatUntil.value=ev?.repeatUntil||'';form.elements.allDay.checked=!!ev?.allDay;let sel=form.elements.categoryId;sel.replaceChildren();const choices=categories.filter(c=>c.active||c.id===ev?.categoryId);for(let c of choices){let op=new Option(c.name+(c.active?'':'（停用）'),c.id);sel.add(op)}sel.value=ev?.categoryId||(choices.find(c=>c.id==='other')?.id||choices[0]?.id||'');$('editorTitle').textContent=ev?(ev.repeat&&ev.repeat!=='none'?'編輯重複行程（整個系列）':'編輯行程'):'新增行程';$('deleteEvent').hidden=!ev;$('editorDialog').showModal()}
function editorPayload(){let f=$('editorForm').elements;return Object.fromEntries(['title','startDate','startTime','endDate','endTime','location','owner','description','status','reminder','reminderMinutes','categoryId','repeat','repeatUntil'].map(k=>[k,f[k].value.trim()]).concat([['allDay',f.allDay.checked]]))}
$('editorForm').addEventListener('submit',safe(async e=>{e.preventDefault();let id=$('editorForm').elements.id.value;await saveEvent(editorPayload(),id||null);$('editorDialog').close();tell('行程已儲存')}));
$('deleteEvent').addEventListener('click',safe(async()=>{assertOnline();let id=$('editorForm').elements.id.value,old=events.find(e=>e.id===id);if(!id||!confirm(`確定刪除「${old?.title}」${old?.repeat&&old.repeat!=='none'?'的整個重複系列':''}？將保留變更歷史。`))return;await removeEvent(id);$('editorDialog').close();tell('行程已刪除，操作紀錄已保留')}));
$('quickAdd').onclick=()=>{if(!user)return tell('請先登入',true);$('smartText').value='';$('smartPreview').replaceChildren();$('quickDialog').showModal()};
$('parseSmart').onclick=()=>{const {items,errors}=parseSmart($('smartText').value);smartRows=items;$('smartPreview').replaceChildren();if(errors.length)$('smartPreview').append(el('p','muted',`需修正：${errors.join('；')}`));items.forEach((v,i)=>{const r=el('div','previewRow');const active=activeCats();if(!active.some(c=>c.id===v.categoryId))v.categoryId=active.find(c=>c.id==='other')?.id||active[0]?.id||'';for(const [type,key] of [['date','startDate'],['time','startTime'],['text','title']]){let inp=el('input');inp.type=type;inp.value=v[key]||'';inp.setAttribute('aria-label',key);inp.oninput=()=>{smartRows[i][key]=inp.value};r.append(inp)}let del=el('button','','移除');del.type='button';del.onclick=()=>{smartRows[i]=null;r.remove()};const csel=el('select');for(const c of active)csel.add(new Option(c.name,c.id));csel.value=v.categoryId;csel.onchange=()=>smartRows[i].categoryId=csel.value;r.append(csel,del);if(v.repeat&&v.repeat!=='none')r.append(el('small','muted',`重複：${v.repeat==='monthly'?'每月':v.repeat==='weekly'?'每週':'每天'}（編輯時可調整）`));$('smartPreview').append(r)});if(items.length){let btn=el('button','primary',`確認儲存 ${items.length} 筆`);btn.type='button';btn.onclick=safe(async()=>{let rows=smartRows.filter(Boolean);if(!rows.length)return;const matches=rows.filter(v=>events.some(e=>e.startDate===v.startDate&&e.startTime===v.startTime&&e.title===v.title));if(matches.length&&!confirm(`發現 ${matches.length} 筆與既有行程重複，仍要繼續新增嗎？`))return;rows.forEach(validEvent);for(const item of rows)await saveEvent(item);$('quickDialog').close();tell(`已成功儲存 ${rows.length} 筆行程`)});$('smartPreview').append(btn)}};
function renderCategoryRows(){const area=$('categoryRows');area.replaceChildren();for(const c of categories){let row=el('div','catRow'),name=el('input'),color=el('input');name.type='text';name.value=c.name;color.type='color';color.value=c.color;let used=events.some(e=>e.categoryId===c.id);let save=el('button','','儲存'),toggle=el('button','',c.active?'停用':'啟用');save.onclick=safe(async()=>{assertOnline();if(!name.value.trim())throw Error('分類名稱不可空白');if(categories.some(x=>x.id!==c.id&&x.name===name.value.trim()))throw Error('分類名稱重複');await setDoc(doc(db,categoriesPath,c.id),{name:name.value.trim(),color:color.value,active:c.active});tell('分類已修改')});toggle.onclick=safe(async()=>{assertOnline();await setDoc(doc(db,categoriesPath,c.id),{name:c.name,color:c.color,active:!c.active});tell('分類已更新')});row.append(name,color,save,toggle);if(!used&&!initialCategories.some(x=>x.id===c.id)){let del=el('button','danger','刪除');del.onclick=safe(async()=>{assertOnline();if(!confirm('刪除此未使用分類？'))return;await deleteDoc(doc(db,categoriesPath,c.id))});row.append(del)}else if(used)row.append(el('small','muted','已使用：不可刪除'));area.append(row)}}
$('manageCategories').onclick=()=>{if(!user)return tell('請先登入',true);renderCategoryRows();$('categoryDialog').showModal()};
$('categoryForm').addEventListener('submit',safe(async e=>{e.preventDefault();assertOnline();let form=e.target, name=form.elements.name.value.trim(),color=form.elements.color.value;if(!name||categories.some(c=>c.name===name))throw Error('名稱不可空白或重複');await setDoc(doc(collection(db,categoriesPath)),{name,color,active:true});form.reset()}));
function renderNotificationSettings(){
 const f=$('notificationForm');if(!f)return;
 f.elements.enabled.checked=notificationSettings.enabled!==false;
 f.elements.defaultReminder.value=notificationSettings.defaultReminder||'off';
}
$('manageNotifications').onclick=()=>{if(!user)return tell('請先登入',true);renderNotificationSettings();$('notificationDialog').showModal()};
$('notificationForm').addEventListener('submit',safe(async e=>{
 e.preventDefault();assertOnline();const f=e.target;
 await setDoc(doc(db,settingsPath,'reminders'),{enabled:f.elements.enabled.checked,defaultReminder:f.elements.defaultReminder.value,updatedAt:serverTimestamp(),updatedBy:user.email});
 $('notificationDialog').close();tell('已儲存提醒設定');
}));
$('showHistory').onclick=safe(async()=>{
 assertOnline();const id=$('editorForm').elements.id.value;if(!id)return;
 const s=await getDocs(collection(db,`${root}/data/history`));
 const list=s.docs.map(x=>x.data()).filter(x=>x.eventId===id).sort((a,b)=>(b.at?.toMillis()||0)-(a.at?.toMillis()||0)).slice(0,30);
 const area=$('historyRows');area.replaceChildren();
 for(const e of list){let d=e.at?.toDate()?.toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})||'未記錄時間';area.append(el('div','detailItem',`${d}｜${e.action==='create'?'新增':e.action==='update'?'修改':'刪除'}｜${e.actor||''}`));}
 if(!list.length)area.append(el('p','muted','尚無操作紀錄'));
 $('historyDialog').showModal();
});
document.querySelectorAll('.closeDialog').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
$('prevMonth').onclick=()=>setView(month===0?year-1:year,(month+11)%12);$('nextMonth').onclick=()=>setView(month===11?year+1:year,(month+1)%12);$('thisMonth').onclick=()=>setView(Number(now.slice(0,4)),Number(now.slice(5,7))-1);$('search').oninput=render;
$('icsImport').onclick=()=>{if(!user)return tell('請先登入',true);$('icsFile').click()};
$('icsFile').onchange=safe(async e=>{let file=e.target.files?.[0];if(!file)return;try{if(file.size>5*1024*1024)throw Error('ICS 檔案不可超過 5 MB');if(!/\.ics$/i.test(file.name))throw Error('請選擇 .ics 檔案');let content=await file.text();const {events:rows,errors}=icsImport(content);if(!rows.length)throw Error('ICS 沒有可安全匯入的活動。'+errors.slice(0,3).join('；'));const active=activeCats();const defaultCategory=active.find(c=>c.id==='other')?.id||active[0]?.id||'';rows.forEach(x=>{if(!active.some(c=>c.id===x.categoryId))x.categoryId=defaultCategory;});let existing=new Set(events.map(e=>[e.title,e.startDate,e.startTime].join('|')));let inFile=new Set();pendingImport=rows.map(x=>{const fingerprint=[x.title,x.startDate,x.startTime].join('|');const duplicateWithin=inFile.has(fingerprint);inFile.add(fingerprint);return {...x,duplicate:duplicateWithin||existing.has([x.title,x.startDate,x.startTime].join('|'))||events.some(e=>e.repeat&&e.repeat!=='none'&&e.title===x.title&&e.startTime===x.startTime&&monthOccurrences([e],Number(x.startDate.slice(0,4)),Number(x.startDate.slice(5,7))-1).some(v=>v.occurrenceDate===x.startDate))};});$('importSummary').textContent=`可匯入 ${rows.length} 筆；跳過 ${errors.length} 筆不支援或格式錯誤的行程。${errors.slice(0,5).join('；')}`;$('importRows').replaceChildren();pendingImport.forEach((ev,i)=>{let line=el('div','importRow'),check=el('input');check.type='checkbox';check.checked=!ev.duplicate;check.addEventListener('change',()=>ev.selected=check.checked);ev.selected=check.checked;line.append(check,el('label','',`${ev.startDate} ${ev.startTime||(ev.allDay?'全天':'未定時間')}｜${ev.title}${ev.duplicate?'（可能重複，預設不匯入）':''}`));$('importRows').append(line)});$('importDialog').showModal();}finally{e.target.value='';}});
$('saveImported').onclick=safe(async()=>{assertOnline();let rows=pendingImport.filter(e=>e.selected);for(const obj of rows){const {duplicate,selected,...event}=obj;await saveEvent(event)}$('importDialog').close();tell(`成功匯入 ${rows.length} 筆行程`)});
$('icsExport').onclick=()=>{
 if(!user)return tell('請先登入',true);
 $('exportFrom').value=dateKey(year,month,1);
 $('exportTo').value=dateKey(year,month,new Date(year,month+1,0).getDate());
 $('exportDialog').showModal();
};
$('confirmExport').onclick=safe(async()=>{
 assertOnline();const from=$('exportFrom').value,to=$('exportTo').value;
 if(!validISO(from)||!validISO(to)||to<from)throw Error('匯出日期區間不正確');
 const diff=(Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000;
 if(diff>366)throw Error('日期區間最多一年');
 const mStart=Number(from.slice(0,4))*12+Number(from.slice(5,7))-1;
 const mEnd=Number(to.slice(0,4))*12+Number(to.slice(5,7))-1;
 const q=$('search').value.trim().toLowerCase();let view=[];
 for(let n=mStart;n<=mEnd;n++){
  const y=Math.floor(n/12),m=n%12;
  view.push(...monthOccurrences(events,y,m).filter(e=>e.occurrenceDate>=from&&e.occurrenceDate<=to&&!filter.has(e.categoryId)&&(!q||[e.title,e.location,e.owner,e.description].some(t=>String(t||'').toLowerCase().includes(q)))));
 }
 const {ics,skipped,validCount,componentCount}=icsExport(view);
 if(skipped.length){const details=skipped.slice(0,8).map(e=>`${e.occurrenceStart||e.startDate} ${e.title||'（未命名）'}`).join('\n');if(!confirm(`${skipped.length} 筆缺少完整起迄時間或資料不正確，無法匯出：\n${details}${skipped.length>8?'\n…':''}\n確定只匯出 ${validCount} 次活動嗎？`))return;}
 if(!validCount)return tell('日期區間內沒有符合 ICS 格式的完整行程',true);
 const url=URL.createObjectURL(new Blob([ics],{type:'text/calendar;charset=utf-8'})),a=document.createElement('a');
 a.href=url;a.download=`EHS_GoogleCalendar_${from.replaceAll('-','')}_${to.replaceAll('-','')}.ics`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
 $('exportDialog').close();tell(`已匯出 ${validCount} 次活動（${componentCount} 個日曆項目），略過 ${skipped.length} 筆`);
});
function noteMonthKey(){return `${year}-${pad(month+1)}`;}
function setNoteState(message){$('noteStatus').textContent=message;}
function resetNoteSubscription(){
 if(noteUnsub){noteUnsub();noteUnsub=null;}
 noteKey=noteMonthKey();noteOriginal='';noteDirty=false;notePending=false;noteLoaded=false;
 const input=$('monthNote');input.value='';input.disabled=!user;
 $('saveMonthNote').disabled=!user;
 $('notesTitle').textContent=`${year} 年 ${month+1} 月｜月份備註`;
 setNoteState(user?'雲端讀取中…':'登入後可編輯及儲存');
}
function loadMonthNote(){
 resetNoteSubscription();if(!db||!user)return;
 const key=noteKey;
 noteUnsub=onSnapshot(doc(db,monthlyNotesPath,key),snap=>{
  if(key!==noteKey)return;
  const latest=snap.exists()?String(snap.data().text||''):'';
  if(noteDirty){
   if(latest!==noteOriginal&&latest!==$('monthNote').value)setNoteState('雲端備註已更新；目前輸入尚未儲存，請核對');
   return;
  }
  noteOriginal=latest;noteLoaded=true;$('monthNote').value=latest;
  setNoteState(latest?'雲端已同步':'本月尚無備註');
 },err=>{if(key===noteKey){noteLoaded=false;setNoteState('備註讀取失敗');tell('月份備註讀取失敗：'+err.message,true)}});
}
$('monthNote').addEventListener('input',()=>{
 if(!user)return;
 noteDirty=$('monthNote').value!==noteOriginal;
 setNoteState(noteDirty?'尚未儲存':(noteLoaded?'已同步':'雲端讀取中…'));
});
$('saveMonthNote').addEventListener('click',safe(async()=>{
 assertOnline();if(!noteLoaded)throw Error('備註尚未載入，請確認網路連線後再儲存');
 if(notePending)return;
 const key=noteKey,content=$('monthNote').value;
 notePending=true;$('saveMonthNote').disabled=true;setNoteState('儲存中…');
 try{
  await setDoc(doc(db,monthlyNotesPath,key),{text:content,year:Number(key.slice(0,4)),month:Number(key.slice(5,7)),updatedAt:serverTimestamp(),updatedBy:user.email});
  if(key===noteKey){noteOriginal=content;noteDirty=$('monthNote').value!==content;setNoteState(noteDirty?'已儲存先前內容，但有新的未儲存修改':'已儲存至 Firebase');}
 }catch(err){if(key===noteKey)setNoteState('備註儲存失敗，內容仍保留');throw err;}finally{notePending=false;$('saveMonthNote').disabled=!user;}
}));
window.addEventListener('beforeunload',e=>{if(noteDirty||notePending){e.preventDefault();e.returnValue='';}});
$('addToday').onclick=()=>openEditor(null,selected);
function stopListeners(){unsubs.forEach(x=>x());unsubs=[];if(noteUnsub){noteUnsub();noteUnsub=null;}}
async function init(){if(!firebaseConfig.apiKey||!firebaseConfig.appId||firebaseConfig.projectId!=='esh-v85'){tell('入口網站 Firebase 設定不完整，請確認 portal/config.js。',true);$('cloudStatus').textContent='設定異常';render();return}
 const app=initializeApp(firebaseConfig,'ehs-portal');auth=getAuth(app);db=getFirestore(app);await setPersistence(auth,browserLocalPersistence);getRedirectResult(auth).catch(e=>tell('Google 登入返回失敗：'+e.message,true));$('signIn').onclick=safe(async()=>{let provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});try{await signInWithPopup(auth,provider)}catch(e){if(['auth/popup-blocked','auth/operation-not-supported-in-this-environment'].includes(e.code))await signInWithRedirect(auth,provider);else throw e}});$('signOut').onclick=safe(async()=>{if((noteDirty||notePending)&&!confirm('月份備註尚未儲存或正在儲存，確定登出並放棄修改嗎？'))return;await signOut(auth)});
 onAuthStateChanged(auth,async current=>{stopListeners();user=null;events=[];categories=[...initialCategories];notificationSettings={enabled:true,defaultReminder:'off'};$('signIn').hidden=!!current;$('signOut').hidden=!current;if(!current){$('cloudStatus').textContent='尚未登入';resetNoteSubscription();render();return}if(current.email?.toLowerCase()!==allowedEmail.toLowerCase()){$('cloudStatus').textContent='未授權帳號';tell('此帳號沒有此行事曆的存取權限',true);resetNoteSubscription();render();return}user=current;$('cloudStatus').textContent='雲端連線中';loadMonthNote();unsubs.push(onSnapshot(collection(db,eventsPath),snap=>{events=snap.docs.map(d=>({id:d.id,...d.data()}));render();$('cloudStatus').textContent='● 雲端已同步'},e=>tell('行程讀取失敗：'+e.message,true)));unsubs.push(onSnapshot(doc(db,settingsPath,'reminders'),snap=>{notificationSettings={enabled:true,defaultReminder:'off',...(snap.exists()?snap.data():{})};renderNotificationSettings()},e=>tell('提醒設定讀取失敗：'+e.message,true)));unsubs.push(onSnapshot(collection(db,categoriesPath),snap=>{let custom=snap.docs.map(d=>({id:d.id,...d.data()}));let ids=new Set(custom.map(x=>x.id));categories=[...initialCategories.map(c=>custom.find(x=>x.id===c.id)||c),...custom.filter(c=>!initialCategories.some(d=>d.id===c.id))];render();if($('categoryDialog').open)renderCategoryRows()},e=>tell('分類讀取失敗：'+e.message,true)));});}
render();resetNoteSubscription();init().catch(e=>tell('Firebase 初始化失敗：'+e.message,true));
