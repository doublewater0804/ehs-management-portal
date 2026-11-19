// 空氣污染突發事故緊急應變演練管理 R0.1 — pure business rules, no Firebase side effects.
export const START_YEAR = 2026;
export const INITIAL_SITES = [
  {id:'site-mailiao', name:'麥寮廠', code:'MAILIAO', order:1, active:true, expectedUnits:3, rotationStartYear:2026, rotationHint:'SM麥寮 → PC → ARO1', note:''},
  {id:'site-haifeng', name:'海豐廠', code:'HAIFENG', order:2, active:true, expectedUnits:4, rotationStartYear:2026, rotationHint:'ARO2 → ARO3 → PHL → SM3', note:''}
];
export const EXCEL_HEADERS = ['年度','公私場所','原輪值廠處','實際演練廠處','預定演練日期','實際演練日期','發文日期','發文字號','備註','變更原因'];
export const recordKey = (year, siteId) => `${Number(year)}_${siteId}`;
export function validYear(year){return Number.isInteger(Number(year))&&Number(year)>=START_YEAR&&Number(year)<=2100;}
export function validDate(value){
 if(!value)return true;
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(value+'T00:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;
}
export function addDays(date,n){if(!date||!validDate(date))return '';const t=new Date(date+'T00:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10);}
export function todayTaipei(now=new Date()){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function dateDiff(a,b){if(!validDate(a)||!validDate(b)||!a||!b)return NaN;return Math.round((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/86400000);}
export function sortedSites(sites){return [...sites].sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0)||a.name.localeCompare(b.name,'zh-Hant'));}
export function sortedUnits(units,siteId,includeInactive=false){return units.filter(u=>u.siteId===siteId&&(includeInactive||u.active!==false)).sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0)||a.name.localeCompare(b.name,'zh-Hant'));}
export function proposedUnit(site,units,year){
 const choices=sortedUnits(units,site.id);
 const expected=Number(site.expectedUnits||1);
 if(choices.length<expected)return {unit:null,message:`尚未完成廠處建檔（${choices.length}/${expected}）`};
 if(!choices.length)return {unit:null,message:'尚無啟用的演練廠處'};
 const index=((Number(year)-(Number(site.rotationStartYear)||START_YEAR))%choices.length+choices.length)%choices.length;
 return {unit:choices[index],message:''};
}
export function displayAssigned(site,units,year,record,rotation){
 const base=proposedUnit(site,units,year);
 const name=record?.assignedUnitName||rotation?.assignedUnitName||base.unit?.name||'';
 const id=record?.assignedUnitId||rotation?.assignedUnitId||base.unit?.id||'';
 return {...base,id,name,changed:!!(record?.changeReason||rotation?.changeReason)};
}
export function dueDate(record){return record?.actualDate&&validDate(record.actualDate)?addDays(record.actualDate,30):'';}
export function assess(record,today=todayTaipei(),noticeDays=7){
 if(!record?.actualDate){
  if(record?.plannedDate&&today>record.plannedDate)return {code:'planned-past',label:'已過預定日',tone:'warn'};
  return record?.plannedDate?{code:'planned',label:'已排定',tone:'info'}:{code:'unplanned',label:'未排定',tone:'neutral'};
 }
 const deadline=dueDate(record);
 if(record.sentDate){
  return record.sentDate>deadline?{code:'late-sent',label:'逾期發文',tone:'danger',deadline}:{code:'completed',label:'期限內發文',tone:'good',deadline};
 }
 if(today>deadline)return {code:'overdue',label:'備查逾期',tone:'danger',deadline};
 if(dateDiff(deadline,today)<=noticeDays)return {code:'soon',label:'備查即將到期',tone:'warn',deadline};
 return {code:'awaiting',label:'已演練待發文',tone:'info',deadline};
}
export function validateDrill(input,site,units,expectedRecord=null){
 const year=Number(input.year);
 if(!validYear(year))throw Error('年度應為2026～2100。');
 if(!site||site.active===false)throw Error('請選擇有效且啟用的公私場所。');
 const chosen=units.find(u=>u.id===input.assignedUnitId && u.siteId===site.id);
 const oldAssigned=expectedRecord?.assignedUnitId===input.assignedUnitId;
 if(!chosen&&!oldAssigned)throw Error('請選擇此公私場所的演練廠處。');
 if(chosen?.active===false&&!oldAssigned)throw Error('不可安排新的停用廠處。');
 for(const key of ['plannedDate','actualDate','sentDate'])if(!validDate(input[key]||''))throw Error('日期格式不正確。');
 if(input.actualDate && Number(input.actualDate.slice(0,4))!==year)throw Error('實際演練日期應在該管制年度內，跨年請另建對應年度紀錄。');
 if(input.sentDate&&!input.actualDate)throw Error('請先填入實際演練日期，才能填發文日期。');
 if(input.sentDate && input.sentDate<input.actualDate)throw Error('發文日期不得早於實際演練日期。');
 if(input.plannedDate && Number(input.plannedDate.slice(0,4))!==year)throw Error('預定演練日期應在該管制年度內。');
 for(const field of ['refNumber','note','changeReason'])if(String(input[field]||'').length>1500)throw Error('欄位內容過長（限1500字）。');
 return true;
}
export function summary(sites, records, year, today=todayTaipei(), days=7){
 const active=sites.filter(s=>s.active!==false), all=active.map(site=>records.find(d=>d.id===recordKey(year,site.id))||null);
 return {sites:active.length,drilled:all.filter(r=>r?.actualDate).length,sent:all.filter(r=>r?.sentDate).length,awaiting:all.filter(r=>!r?.sentDate).length,overdue:all.filter(r=>r&&assess(r,today,days).code==='overdue').length};
}
export function exportRow(site,record,rotation,units,year){
 const base=proposedUnit(site,units,year);
 return [year,site.name,record?.originalUnitName||rotation?.originalUnitName||base.unit?.name||'',record?.assignedUnitName||rotation?.assignedUnitName||base.unit?.name||'',record?.plannedDate||'',record?.actualDate||'',record?.sentDate||'',record?.refNumber||'',record?.note||'',record?.changeReason||''];
}
