/** Turn an Excel worksheet into the report structure shown in the approved reference.
 * Source coordinates are retained for editing/export; Excel letter/number headers are never rendered.
 * Unknown non-empty rows are carried through as notes, rather than silently discarded.
 */
import {safeValue,isFormula} from './workbook.mjs';
export const human = value => String(value??'').replace(/[\uE670-\uE67F\uF06C\uF06D\uF06E]/g,'').replace(/[\u00a0\t]+/g,' ').trim();
const a1 = (r,c) => XLSX.utils.encode_cell({r,c});
const valueAt=(ws,r,c)=>human(safeValue(ws[a1(r,c)]));
const isNumericLabel=t=>/^\d+(?:\.0+)?[.、]?\s*$/.test(t);
const isSection=t=>/^(?:[一二三四五六七八九十]+[、.．]|說\s*明\s*[:：]|[(（][一二三四五六七八九十][)）]|(?:火災|交通職災|主管機關稽核異常|安全衛生|設備保全))/.test(t);
const isDateLine=t=>/製表日期|製表時間|填報日期/.test(t);
export function detectReportDate(book){
 for(const name of book.SheetNames||[]) {
  const ws=book.Sheets[name];const lim=XLSX.utils.decode_range(ws['!ref']||'A1');
  for(let r=0;r<=Math.min(lim.e.r,14);r++)for(let c=0;c<=Math.min(lim.e.c,30);c++) {
   const v=valueAt(ws,r,c);if(!isDateLine(v))continue;
   const m=v.match(/(20\d{2})\s*[年/.-]\s*(\d{1,2})\s*[月/.-]\s*(\d{1,2})/);
   if(m){const result=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;if(!Number.isNaN(Date.parse(result)))return result;}
  }
 }
 return '';
}
function cellDescriptor(ws,r,c){const addr=a1(r,c),cell=ws[addr];return {addr,row:r,col:c,text:human(safeValue(cell)),formula:isFormula(cell),empty:!human(safeValue(cell))};}
function visibleRow(ws,r,maxCol){const data=[];for(let c=0;c<=maxCol;c++){
 const cell=cellDescriptor(ws,r,c);if(cell.text)data.push(cell);
 }return data;}
function findStats(ws,rows,maxCol){
 for(let r=0;r<Math.min(rows-4,30);r++){
  const row=visibleRow(ws,r,maxCol);const labels=row.filter(x=>/火災|重大職災|一般職災|交通職災|主管機關稽核異常/.test(x.text));
  if(labels.length<3)continue;
  const sorted=labels.sort((a,b)=>a.col-b.col);
  const sites=visibleRow(ws,r+1,maxCol);if(sites.filter(x=>/台灣|寧波|仁澤|其他/.test(x.text)).length<3)continue;
  const categories=sorted.map((p,i)=>({label:p.text,start:p.col,end:(sorted[i+1]?.col??sorted.at(-1).col+3)-1,addr:p.addr}));
  // A:B holds the weekly/monthly/yearly label in this actual template.
  const lastCol=Math.min(maxCol,Math.max(...categories.map(x=>x.end)));
  const measures=[];
  for(let n=r+2;n<Math.min(rows,r+12);n++){
   const items=visibleRow(ws,n,lastCol);
   const label=items.filter(x=>x.col<categories[0].start).map(x=>x.text).join(' ');
   if(!label||!/(統計|累計|合計|月|週|年|~|～|\d)/.test(label))break;
   measures.push({row:n,label,addr:items.find(x=>x.col<categories[0].start)?.addr,values:Array.from({length:lastCol-categories[0].start+1},(_,i)=>cellDescriptor(ws,n,i+categories[0].start))});
   if(measures.length>=6)break;
  }
  if(!measures.length)continue;
  const subhead=Array.from({length:lastCol-categories[0].start+1},(_,i)=>cellDescriptor(ws,r+1,i+categories[0].start));
  return {kind:'statistics',start:r,end:measures.at(-1).row,categories,subhead,measures};
 }
 return null;
}
export function buildReport(ws){
 if(!ws)throw Error('缺少工作表');
 const lim=XLSX.utils.decode_range(ws['!ref']||'A1');
 const rows=Math.min(lim.e.r+1,1400),maxCol=Math.min(lim.e.c,89);
 const stats=findStats(ws,rows,maxCol);const blocks=[];
 let firstTitle=null;let firstHeading=null;let hidden=0;
 for(let r=lim.s.r;r<rows;r++){
  if(stats&&r===stats.start){blocks.push(stats);r=stats.end;continue;}
  const cells=visibleRow(ws,r,maxCol);if(!cells.length)continue;
  // Cover, report date and first heading are in independent rows in source XLS.
  const text=cells.map(x=>x.text).join(' ').trim();
  if(!firstTitle&&cells.length<=3&&/安全永續組/.test(text)&&r<5){firstTitle=cells.find(x=>/安全永續組/.test(x.text));continue;}
  if(cells.every(x=>isDateLine(x.text))){hidden++;continue;}
  const primary=cells.find(x=>x.col===0);
  const detail=cells.find(x=>x.col>0&&x.text);
  if(primary&&isNumericLabel(primary.text)&&detail){
   blocks.push({kind:'item',row:r,number:primary,text:detail,extra:cells.filter(x=>x!==primary&&x!==detail)});
   continue;
  }
  const lead=cells.find(x=>isSection(x.text));
  if(lead){
   if(!firstHeading&&/^[一二三四五六七八九十]+[、.．]/.test(lead.text)&&r<8){firstHeading=lead;continue;}
   const level=/^[一二三四五六七八九十]+[、.．]|^說\s*明/.test(lead.text)?'major':'minor';
   blocks.push({kind:'heading',level,row:r,source:lead,text:lead.text,extra:cells.filter(x=>x!==lead&&!isDateLine(x.text))});
   continue;
  }
  // Carry through unexpectedly placed data from newer Excel versions.
  const all=cells.filter(x=>!isDateLine(x.text));
  if(all.length)blocks.push({kind:'note',row:r,cells:all});
 }
 return {title:firstTitle?.text||'安全永續組',titleCell:firstTitle,headline:firstHeading?.text||'一、職業事故及主管機關稽核異常統計：',headlineCell:firstHeading,blocks,rows,sourceCols:maxCol+1,statsFound:!!stats,blankDateLines:hidden};
}
export function reportSummary(report){return {headings:report.blocks.filter(b=>b.kind==='heading').length,items:report.blocks.filter(b=>b.kind==='item').length,stats:report.blocks.filter(b=>b.kind==='statistics').length,notes:report.blocks.filter(b=>b.kind==='note').length};}
