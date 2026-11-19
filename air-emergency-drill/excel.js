import {EXCEL_HEADERS,LEGACY_EXCEL_HEADERS,exportRow,sortedSites,sortedUnits,proposedUnit} from './model.js';
const XLSX_URL='https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs';
let pending;
const xlsx=()=>pending??=(import(XLSX_URL).catch(e=>{pending=null;throw Error('無法載入 Excel 元件，請確認網路連線。');}));
const toSheet=(XLSX,rows)=>{const sh=XLSX.utils.aoa_to_sheet(rows);sh['!cols']=rows[0].map((_,i)=>({wch:i===1||i===2||i===3?22:18}));return sh;};
export async function exportXlsx({sites,units,rotations,drills,year,exportSiteIds=null}){
 const XLSX=await xlsx(),wb=XLSX.utils.book_new();
 const rows=[EXCEL_HEADERS];
 for(const site of sortedSites(sites)){
  if(exportSiteIds && !exportSiteIds.includes(site.id))continue;
  const key=`${year}_${site.id}`,r=drills.find(d=>d.id===key),rot=rotations.find(d=>d.id===key);
  if(site.active===false&&!r&&!rot)continue;
  rows.push(exportRow(site,r,rot,units,year));
 }
 XLSX.utils.book_append_sheet(wb,toSheet(XLSX,rows),'演練管制');
 const yearList=[['年度','公私場所','建議輪值廠處','已登錄演練廠處']];
 for(let y=year;y<Math.min(year+10,2101);y++)for(const site of sortedSites(sites).filter(x=>x.active!==false)){
  const p=proposedUnit(site,units,y).unit,r=drills.find(d=>d.id===`${y}_${site.id}`),rot=rotations.find(d=>d.id===`${y}_${site.id}`);
  yearList.push([y,site.name,p?.name||'待建立完整廠處名單',r?.assignedUnitName||rot?.assignedUnitName||'']);
 }
 XLSX.utils.book_append_sheet(wb,toSheet(XLSX,yearList),'輪值總覽');
 XLSX.utils.book_append_sheet(wb,toSheet(XLSX,[['公私場所','代碼','輪值基準年度','預設輪值人數','啟用'],...sortedSites(sites).map(s=>[s.name,s.code||'',s.rotationStartYear||2026,s.expectedUnits||1,s.active!==false?'是':'否'])]),'廠區基本資料');
 XLSX.utils.book_append_sheet(wb,toSheet(XLSX,[['公私場所','演練廠處','代碼','輪值順序','啟用'],...sites.flatMap(s=>sortedUnits(units,s.id,true).map(u=>[s.name,u.name,u.code||'',u.order,u.active!==false?'是':'否']))]),'廠處基本資料');
 if(XLSX.writeFileXLSX)XLSX.writeFileXLSX(wb,`空污緊急應變演練_${year}.xlsx`,{compression:true});
 else XLSX.writeFile(wb,`空污緊急應變演練_${year}.xlsx`,{bookType:'xlsx',compression:true});
}
export async function parseXlsx(file){
 const XLSX=await xlsx(),wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});
 const sheet=wb.Sheets['演練管制'];if(!sheet)throw Error('找不到「演練管制」工作表，請使用本系統匯出的 Excel。');
 const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false,dateNF:'yyyy-mm-dd'});
 const head=rows.shift()||[];
 const isNew=EXCEL_HEADERS.every((h,i)=>String(head[i]||'').trim()===h);
 const isLegacy=LEGACY_EXCEL_HEADERS.every((h,i)=>String(head[i]||'').trim()===h);
 if(!isNew&&!isLegacy)throw Error('Excel 欄位順序不正確，請使用本系統匯出的新舊範本。');
 if(rows.length>250)throw Error('單次最多匯入250筆，請分批處理。');
 return rows.filter(c=>c.some(v=>String(v).trim())).map((c,i)=>({rowNo:i+2,year:String(c[0]||'').trim(),siteName:String(c[1]||'').trim(),originalName:String(c[2]||'').trim(),assignedName:String(c[3]||'').trim(),plannedDate:toISO(c[4]),actualDate:toISO(c[5]),sentDate:toISO(c[6]),refNumber:String(c[7]||'').trim(),authorityReplyDate:isNew?toISO(c[8]):undefined,authorityReplyNo:isNew?String(c[9]||'').trim():undefined,note:String(c[isNew?10:8]||'').trim(),changeReason:String(c[isNew?11:9]||'').trim()}));
}
export function toISO(value){
 if(value===null||value===undefined||String(value).trim()==='')return '';
 if(value instanceof Date&&!isNaN(value))return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
 const s=String(value).trim().replace(/[年月]/g,'/').replace(/日/g,'').replace(/\./g,'/').replace(/-/g,'/');
 const m=s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
 if(m)return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
 return s; // validation layer rejects malformed dates, never guess.
}
