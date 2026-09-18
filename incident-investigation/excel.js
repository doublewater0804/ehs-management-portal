import {AREAS,REGIONS,OPTIONS,STATES,TW_FIELDS,PERSON_FIELDS,clone,validate,getDuty,setDuty} from './model.js?v=20260918-v4';

const XLSX_URL='https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';
const FORMAT_VERSION='1';
const APP_MARKER='incident-investigation-roster';
const REQUIRED_SHEETS=['輪值設定','台灣名冊','大陸名冊','越南名冊','調查紀錄','規定與說明'];
let xlsxPromise=null;

const loadXlsx=()=>xlsxPromise??=(import(XLSX_URL).catch(()=>{xlsxPromise=null;throw Error('無法載入 Excel 元件，請確認網路連線後再試。');}));
const text=v=>v==null?'':String(v);
const trimmed=v=>text(v).trim();
const rowHas=(r,keys)=>keys.some(k=>trimmed(r[k]));
const objBy=(rows,key,label)=>{const m=new Map();for(const r of rows){const k=key(r);if(!k)continue;if(m.has(k))throw Error(`${label}有重複資料：${k}`);m.set(k,r);}return m;};
const areaLabel=a=>AREAS.find(x=>x[0]===a)?.[1]||a;
const compact=v=>trimmed(v).replace(/[·•・]/g,'').replace(/\s+/g,'');
const areaCode=v=>{const s=compact(v);const direct=AREAS.find(([a,l])=>compact(a)===s||compact(l)===s)?.[0];if(direct)return direct;return ({'北區':'tw-north','中區':'tw-central','南區':'tw-south','大陸':'cn','大陸寧波':'cn','寧波':'cn','越南':'vn','越南仁澤':'vn','仁澤':'vn'})[s]||'';};
const optionValue=(a,v)=>{const s=trimmed(v);return a.startsWith('tw')&&/^[ABC]$/.test(s)?s+' 組':s;};
const getPath=(o,p)=>p.split('.').reduce((x,k)=>x?.[k],o);
const setPath=(o,p,v)=>{const ks=p.split('.'),last=ks.pop();ks.reduce((x,k)=>x[k],o)[last]=v;};
const newId=()=>globalThis.crypto?.randomUUID?.()||`excel-${Date.now()}-${Math.random().toString(16).slice(2)}`;
function excelDate(v){
 if(v instanceof Date&&!isNaN(v))return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
 if(typeof v==='number'&&Number.isFinite(v)){const d=new Date(Date.UTC(1899,11,30)+Math.round(v*86400000));return d.toISOString().slice(0,10);}
 const s=trimmed(v);const m=s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);return m?`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`:s;
}

export function tablesFromData(d,now=new Date()){
 validate(d);
 const twHeaders=['區域（固定）','組別（固定）',...Object.values(TW_FIELDS)];
 const personHeaders=['組別（固定）','公司（固定）','角色（固定）',...Object.values(PERSON_FIELDS)];
 const peopleRows=a=>d.overseas[a].flatMap(t=>t.people.map(p=>[t.group,t.company,p.role,...Object.keys(PERSON_FIELDS).map(k=>p[k]??'')]));
 return {
  '使用說明':[
   ['事故調查輪值人員管理－Excel 編輯檔'],
   ['1. 此檔為完整資料。修改後回到網站按「匯入 Excel」，網站只會先載入預覽，不會立即寫入 Firebase。'],
   ['2. 確認網頁內容後，再按「儲存至雲端」才會更新正式資料。'],
   ['3. 空白儲存格代表清空該欄位；調查紀錄刪除整列後，匯入時該紀錄也會刪除。'],
   ['4. 「固定」欄位請勿修改；調查紀錄的系統 ID 欄位已隱藏，請勿取消隱藏或修改。'],
   ['5. 新增調查紀錄請在最後一列下方新增，系統 ID 留白，網站匯入時會自動產生。'],
   ['6. 日期請使用 YYYY-MM-DD，例如 2026-09-18。'],
   ['7. 請勿刪除或改名工作表。'],
  ],
  '輪值設定':[['系統地區代碼（勿修改）','地區','下次輪值組別'],...AREAS.map(([a,l])=>[a,l,getDuty(d,a)])],
  '台灣名冊':[twHeaders,...d.rows.map(r=>[r.region,r.group,...Object.keys(TW_FIELDS).map(k=>r[k]??'')])],
  '大陸名冊':[personHeaders,...peopleRows('cn')],
  '越南名冊':[personHeaders,...peopleRows('vn')],
  '調查紀錄':[['系統ID（勿修改）','地區','出動組別','督導主管','調查日期','狀態','當次記錄的下次組別'],...d.records.map(r=>[r.id,areaLabel(r.area),r.group,r.supervisor,r.date,r.status,r.nextGroup??''])],
  '規定與說明':[['項目代碼（勿修改）','項目','內容'],
   ['revision','台灣名冊版本',d.revision],
   ['notes','台灣調查作業規定（每行一點）',d.notes.join('\n')],
   ['sourceVersions.cn','大陸名冊版本',d.sourceVersions.cn],
   ['regionalRules.cn','大陸廠區執行方式',d.regionalRules.cn],
   ['backupPersonnel','大陸備援人員',d.backupPersonnel],
   ['sourceVersions.vn','越南名冊版本',d.sourceVersions.vn],
   ['regionalRules.vn','越南廠區輪值規定',d.regionalRules.vn],
   ['supplement','補充說明',d.supplement],
  ],
  '_系統':[['key','value'],['app',APP_MARKER],['formatVersion',FORMAT_VERSION],['schemaVersion',String(d.schemaVersion)],['cloudVersion',String(d.version)],['exportedAt',now.toISOString()]],
 };
}

function objects(table,label){
 if(!Array.isArray(table)||!table.length)throw Error(`缺少「${label}」工作表內容。`);
 const headers=table[0].map(trimmed);if(new Set(headers).size!==headers.length)throw Error(`「${label}」表頭有重複欄位。`);
 return table.slice(1).map(row=>Object.fromEntries(headers.map((h,i)=>[h,row?.[i]??''])));
}
function requireHeaders(rows,headers,label){
 if(!rows.length)return;
 for(const h of headers)if(!(h in rows[0]))throw Error(`「${label}」缺少欄位：${h}`);
}
function importDuty(d,table){
 const rows=objects(table,'輪值設定');requireHeaders(rows,['系統地區代碼（勿修改）','地區','下次輪值組別'],'輪值設定');
 const map=objBy(rows,r=>trimmed(r['系統地區代碼（勿修改）']), '輪值設定');
 for(const [a] of AREAS){const r=map.get(a);if(!r)throw Error(`輪值設定缺少：${areaLabel(a)}`);const v=optionValue(a,r['下次輪值組別']);if(v&&!OPTIONS[a].includes(v))throw Error(`${areaLabel(a)}的下次輪值組別不正確：${v}`);setDuty(d,a,v);}
 if([...map.keys()].some(k=>!AREAS.some(([a])=>a===k)))throw Error('輪值設定含有不明地區代碼。');
}
function importTaiwan(d,table){
 const headers=['區域（固定）','組別（固定）',...Object.values(TW_FIELDS)],rows=objects(table,'台灣名冊');requireHeaders(rows,headers,'台灣名冊');
 const map=objBy(rows,r=>`${trimmed(r['區域（固定）'])}|${trimmed(r['組別（固定）'])}`,'台灣名冊');
 const expected=new Set();
 for(const target of d.rows){const key=`${target.region}|${target.group}`;expected.add(key);const r=map.get(key);if(!r)throw Error(`台灣名冊缺少：${target.region} ${target.group} 組`);for(const [k,label] of Object.entries(TW_FIELDS))target[k]=text(r[label]).trim();}
 for(const k of map.keys())if(!expected.has(k))throw Error(`台灣名冊含有不明固定列：${k}`);
}
function importPeople(d,a,table,label){
 const headers=['組別（固定）','公司（固定）','角色（固定）',...Object.values(PERSON_FIELDS)],rows=objects(table,label);requireHeaders(rows,headers,label);
 const map=objBy(rows,r=>`${trimmed(r['組別（固定）'])}|${trimmed(r['角色（固定）'])}`,label),expected=new Set();
 for(const t of d.overseas[a])for(const p of t.people){const key=`${t.group}|${p.role}`;expected.add(key);const r=map.get(key);if(!r)throw Error(`${label}缺少：${t.group}／${p.role}`);if(trimmed(r['公司（固定）'])!==t.company)throw Error(`${label}的固定公司欄位被修改：${t.group}`);for(const [k,h] of Object.entries(PERSON_FIELDS))p[k]=text(r[h]).trim();}
 for(const k of map.keys())if(!expected.has(k))throw Error(`${label}含有不明固定列：${k}`);
}
function importRecords(d,table,base){
 const headers=['系統ID（勿修改）','地區','出動組別','督導主管','調查日期','狀態','當次記錄的下次組別'],rows=objects(table,'調查紀錄');requireHeaders(rows,headers,'調查紀錄');
 const baseIds=new Set(base.records.map(r=>r.id)),used=new Set(),out=[];
 for(const r of rows){if(!rowHas(r,headers.slice(1)))continue;const a=areaCode(r['地區']);if(!a)throw Error(`調查紀錄地區不正確：${trimmed(r['地區'])||'空白'}`);const group=optionValue(a,r['出動組別']);if(!OPTIONS[a].includes(group))throw Error(`${areaLabel(a)}的出動組別不正確：${group||'空白'}`);const status=trimmed(r['狀態']);if(!STATES.includes(status))throw Error(`調查紀錄狀態不正確：${status||'空白'}`);const nextGroup=optionValue(a,r['當次記錄的下次組別']);if(nextGroup&&!OPTIONS[a].includes(nextGroup))throw Error(`${areaLabel(a)}的下次組別不正確：${nextGroup}`);let id=trimmed(r['系統ID（勿修改）']);if(!baseIds.has(id)||used.has(id))id=newId();used.add(id);out.push({id,area:a,group,supervisor:text(r['督導主管']).trim(),date:excelDate(r['調查日期']),status,nextGroup});}
 d.records=out;
}
function importRules(d,table){
 const rows=objects(table,'規定與說明');requireHeaders(rows,['項目代碼（勿修改）','項目','內容'],'規定與說明');
 const map=objBy(rows,r=>trimmed(r['項目代碼（勿修改）']),'規定與說明'),keys=['revision','notes','sourceVersions.cn','regionalRules.cn','backupPersonnel','sourceVersions.vn','regionalRules.vn','supplement'];
 for(const k of keys)if(!map.has(k))throw Error(`規定與說明缺少固定項目：${k}`);
 for(const k of keys){const v=text(map.get(k)['內容']);if(k==='notes')d.notes=v.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);else setPath(d,k,v.trim());}
 for(const k of map.keys())if(!keys.includes(k))throw Error(`規定與說明含有不明項目代碼：${k}`);
}
function checkMeta(table){
 const rows=objects(table,'_系統');const kv=Object.fromEntries(rows.map(r=>[trimmed(r.key),trimmed(r.value)]));
 if(kv.app!==APP_MARKER||kv.formatVersion!==FORMAT_VERSION)throw Error('這不是本系統匯出的 Excel，或檔案格式版本不相容。');
}

export function dataFromTables(tables,base){
 if(!base)throw Error('目前沒有雲端資料可供更新。');for(const s of REQUIRED_SHEETS)if(!tables[s])throw Error(`缺少工作表：「${s}」。`);if(!tables['_系統'])throw Error('缺少系統識別工作表，請使用本系統匯出的 Excel 修改。');checkMeta(tables['_系統']);
 const d=clone(base);importDuty(d,tables['輪值設定']);importTaiwan(d,tables['台灣名冊']);importPeople(d,'cn',tables['大陸名冊'],'大陸名冊');importPeople(d,'vn',tables['越南名冊'],'越南名冊');importRecords(d,tables['調查紀錄'],base);importRules(d,tables['規定與說明']);d.schemaVersion=2;d.version=base.version;return validate(d);
}

function columnName(n){let s='';for(;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
function textFormat(ws,rows,hideCols=[]){
 const maxCols=Math.max(1,...rows.map(r=>r.length));for(let r=1;r<rows.length;r++)for(let c=0;c<rows[r].length;c++){const cell=ws[`${columnName(c+1)}${r+1}`];if(cell)cell.z='@';}
 ws['!cols']=Array.from({length:maxCols},(_,i)=>({wch:i===0?20:18,hidden:hideCols.includes(i)}));
}
function makeSheet(XLSX,name,rows){
 const ws=XLSX.utils.aoa_to_sheet(rows);let hide=[];
 if(name==='輪值設定'||name==='調查紀錄'||name==='規定與說明')hide=[0];
 textFormat(ws,rows,hide);
 const widths={
  '使用說明':[78],
  '輪值設定':[18,18,22],
  '台灣名冊':[13,13,18,16,14,16,16,16,18,18,16,16],
  '大陸名冊':[18,14,20,16,14,18,18,16,16,28],
  '越南名冊':[18,14,20,16,14,18,18,16,16,28],
  '調查紀錄':[38,18,20,16,15,14,24],
  '規定與說明':[24,32,80],
  '_系統':[20,42]
 }[name];if(widths)ws['!cols']=widths.map((wch,i)=>({wch,hidden:hide.includes(i)}));
 if(!['使用說明','_系統'].includes(name)&&rows.length)ws['!autofilter']={ref:`A1:${columnName(rows[0].length)}${Math.max(1,rows.length)}`};
 if(name==='規定與說明')ws['!rows']=rows.map((_,i)=>({hpt:i===0?24:48}));
 return ws;
}
function workbookTables(XLSX,wb){
 const out={};for(const name of wb.SheetNames){const ws=wb.Sheets[name];out[name]=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true,blankrows:false});}return out;
}

export async function exportExcel(d){
 const XLSX=await loadXlsx(),tables=tablesFromData(d),wb=XLSX.utils.book_new();
 for(const [name,rows] of Object.entries(tables))XLSX.utils.book_append_sheet(wb,makeSheet(XLSX,name,rows),name);
 wb.Props={Title:'事故調查輪值人員管理',Subject:'Firebase 資料匯出編輯檔',Author:'EHS 管理入口平台'};
 wb.Workbook=wb.Workbook||{};wb.Workbook.Sheets=wb.SheetNames.map(name=>({name,Hidden:name==='_系統'?1:0}));
 const now=new Date(),file=`事故調查輪值人員管理_${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}.xlsx`;
 if(XLSX.writeFileXLSX)XLSX.writeFileXLSX(wb,file,{compression:true});else XLSX.writeFile(wb,file,{bookType:'xlsx',compression:true});
}

export async function importExcel(file,base){
 if(!file)throw Error('請選擇 Excel 檔。');if(file.size>5_000_000)throw Error('Excel 檔案過大，請確認是否選錯檔案。');
 const XLSX=await loadXlsx();let wb;try{wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});}catch{throw Error('Excel 檔無法讀取，請確認檔案沒有損壞。');}
 return dataFromTables(workbookTables(XLSX,wb),base);
}
