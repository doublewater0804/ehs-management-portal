export const FIELDS=[
 ['company','公司'],['division','事業部'],['site','廠區'],['plant','廠處'],['address','地址'],
 ['unitName','定檢(工檢)單元名稱'],['inspectionType','定檢(工檢)類型'],['stopStart','停俥開始日期'],['stopEnd','停俥結束日期'],
 ['authorityBefore','函報主管機關定檢日期－定檢(工檢)前一個月'],['authorityComplete','函報主管機關定檢日期－定檢(工檢)完成'],
 ['training','定檢前教育訓練'],['confinedPlanRevision','局限作業災害防止計劃－檢討修訂日期'],['confinedDrill','局限作業災害防止計劃－演練日期'],
 ['accidentMeeting','職災防止檢討會議日期'],['jointStart','定檢聯檢開始日期'],['jointEnd','定檢聯檢結束日期'],
 ['pssrKickoff','啟動前安全檢查(PSSR)－起始會議日期'],['pssrReview','啟動前安全檢查(PSSR)－審查會議日期'],
 ['restartDate','開俥日期'],['ftirReport','FTIR監測報告'],['jointReport','定檢聯檢報告'],['contractorExchange','承攬商輔導交流會日期']
];
export const BASIC_FIELDS=['company','division','site','plant','address','unitName','inspectionType'];
export const DATE_FIELDS=FIELDS.map(x=>x[0]).filter(x=>!BASIC_FIELDS.includes(x));
const blank=v=>String(v??'').trim();
export const cleanRow=r=>Object.fromEntries([['id',blank(r.id)||crypto.randomUUID()],...FIELDS.map(([k])=>[k,blank(r[k])])]);
export function validateYear(data){
 if(!data||!Number.isInteger(data.year)||data.year<2000||data.year>2200)throw Error('年度資料格式錯誤。');
 if(!Array.isArray(data.rows)||data.rows.length>1000)throw Error('年度資料筆數異常。');
 const ids=new Set();
 data.rows=data.rows.map(r=>{const x=cleanRow(r);if(ids.has(x.id))x.id=crypto.randomUUID();ids.add(x.id);return x;});
 data.archived=!!data.archived;return data;
}
export const keyOf=(year,r)=>`${year}|${blank(r.site)}|${blank(r.unitName)}`;
export const tieKey=(year,r)=>`${keyOf(year,r)}|${blank(r.plant)}`;
function parseISO(v){const s=blank(v);if(/^\d{4}-\d{2}-\d{2}$/.test(s)){const d=new Date(s+'T00:00:00');return Number.isNaN(d)?null:d;}return null;}
function plannedDate(v,year){const s=blank(v);const m=s.match(/^[（(]\s*(\d{1,2})\/(\d{1,2})\s*[)）]$/);if(!m)return null;const d=new Date(year,Number(m[1])-1,Number(m[2]));return Number.isNaN(d)?null:d;}
const days=(d,n)=>new Date(d.getFullYear(),d.getMonth(),d.getDate()+n);
const isNA=v=>['-','—','N/A','NA','無','不適用'].includes(blank(v).toUpperCase());
export function statusOf(row,year,today=new Date()){
 const t=new Date(today.getFullYear(),today.getMonth(),today.getDate());
 for(const [,label] of FIELDS){/* keep bundlers from pruning label metadata */}
 for(const k of DATE_FIELDS){const pd=plannedDate(row[k],year);if(pd&&pd<t)return {status:'逾期',reason:`${FIELDS.find(x=>x[0]===k)?.[1]||k}預訂日期已過`};}
 const start=parseISO(row.stopStart),end=parseISO(row.stopEnd),jointEnd=parseISO(row.jointEnd);
 const due=[];
 if(start){due.push(['training',days(start,-14)],['accidentMeeting',days(start,-31)],['jointStart',days(start,4)]);if(row.site==='麥寮')due.push(['authorityBefore',days(start,-30)]);}
 if(end){due.push(['authorityComplete',days(end,7)],['jointEnd',days(end,-1)],['ftirReport',days(end,14)],['contractorExchange',days(end,31)]);}
 if(jointEnd)due.push(['jointReport',days(jointEnd,7)]);
 for(const [k,d] of due){const v=blank(row[k]);if(!v&&d<t)return {status:'逾期',reason:`${FIELDS.find(x=>x[0]===k)?.[1]||k}已超過管制期限`};if(isNA(v))continue;}
 if(end&&end<t)return {status:'已完成',reason:''};
 if(start&&start<=t)return {status:'進行中',reason:''};
 return {status:'未開始',reason:''};
}
export function filtered(rows,filters,year){
 const q=blank(filters.query).toLocaleLowerCase();
 return rows.filter(r=>{
  const st=statusOf(r,year).status;
  return (!filters.company||r.company===filters.company)&&(!filters.division||r.division===filters.division)&&(!filters.site||r.site===filters.site)&&(!filters.plant||r.plant===filters.plant)&&(!filters.type||r.inspectionType===filters.type)&&(!filters.status||st===filters.status)&&(!q||FIELDS.some(([k])=>blank(r[k]).toLocaleLowerCase().includes(q)));
 });
}
export function copyForYear(source,newYear){return validateYear({year:newYear,archived:false,rows:source.rows.map(r=>{const n={id:crypto.randomUUID()};for(const k of BASIC_FIELDS)n[k]=r[k]||'';for(const k of DATE_FIELDS)n[k]='';return n;})});}
