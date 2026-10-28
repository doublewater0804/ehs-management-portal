import {ownId,normalizeSupervisor,normalizeRecord,supervisorChanged,recordChanged,validDate,normalizeStatus,normalizeStatusList,sortStatusOptions} from './schema.js';
const HEAD_S=['主管ID','姓名','職稱','所屬單位','啟用狀態','顯示順序','版本'];
const HEAD_T=['狀態ID','狀態名稱','狀態說明','啟用狀態','顯示順序','設定版本'];
const HEAD_R=['紀錄ID','指示日期','主管ID','主管姓名','指示內容','依據來源','備註','狀態','封存','版本'];
const HEAD_H=['紀錄ID','版本','操作類型','修改人','修改時間','修改前內容(JSON)','修改後內容(JSON)'];
export const XLSX_HEADERS={supervisors:HEAD_S,statuses:HEAD_T,records:HEAD_R,history:HEAD_H};
function requireExcel(){if(!window.ExcelJS)throw Error('Excel 元件未載入，請檢查網路或允許 CDN 連線後重新整理。');return window.ExcelJS;}
function sheet(wb,name,headers,rows){
  const s=wb.addWorksheet(name,{views:[{state:'frozen',ySplit:1}]});s.addRow(headers);
  s.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
  s.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF087D90'}};
  s.getRow(1).height=28;
  headers.forEach((h,i)=>{s.getColumn(i+1).width=Math.min(65,Math.max(15,h.length*2+6));});
  rows.forEach(r=>s.addRow(r));s.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,s.rowCount),column:headers.length}};
  return s;
}
export async function downloadExcel(data){
  const X=requireExcel(),wb=new X.Workbook();wb.creator='EHS 主管交辦布告欄';wb.created=new Date();
  sheet(wb,'主管基本資料',HEAD_S,data.supervisors.map(x=>[x.id,x.name,x.title,x.department,x.active?'啟用':'停用',x.order,x.version||1]));
  sheet(wb,'狀態基本資料',HEAD_T,sortStatusOptions(data.statusSettings?.items||[]).map(x=>[x.id,x.name,x.description,x.active?'啟用':'停用',x.order,data.statusSettings?.version||0]));
  sheet(wb,'主管指示紀錄',HEAD_R,data.records.map(x=>[x.id,x.date,x.supervisorId,x.supervisorSnapshot?.name||'',x.content,x.source,x.note,x.status,x.archived?'是':'否',x.version||1]));
  sheet(wb,'修改歷程_僅供備查',HEAD_H,data.history.map(x=>[x.recordId,x.version,x.action,x.actor,x.changedAt,JSON.stringify(x.before),JSON.stringify(x.after)]));
  const buffer=await wb.xlsx.writeBuffer();
  const url=URL.createObjectURL(new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  const link=document.createElement('a');link.href=url;link.download=`主管交辦布告欄_${new Date().toLocaleDateString('sv-SE')}.xlsx`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),12000);
}
const getText=(cell)=>{
  if(cell?.value instanceof Date){const d=cell.value;return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  if(cell?.value?.richText)return cell.value.richText.map(r=>r.text).join('').trim();
  if(cell?.value?.text)return String(cell.value.text).trim();
  if(cell?.value?.result!==undefined)return String(cell.value.result??'').trim();
  return String(cell?.text??'').trim();
};
function extract(sheet,required,kind){
  if(!sheet)return {items:[],errors:[]};
  const headers=sheet.getRow(1).values.map(x=>String(x??'').trim());const ix={};headers.forEach((h,i)=>{if(h)ix[h]=i;});
  const missing=required.filter(h=>!ix[h]);if(missing.length)throw Error(`${kind} 缺少欄位：${missing.join('、')}`);
  if(sheet.rowCount>5001)throw Error(`${kind} 單次匯入最多5000筆，請分批。`);
  const items=[];for(let row=2;row<=sheet.rowCount;row++){
    const item={};required.forEach(h=>item[h]=getText(sheet.getRow(row).getCell(ix[h])));
    if(Object.values(item).every(v=>v===''))continue;
    item._row=row;items.push(item);
  }
  return {items,errors:[]};
}
function boolCell(v,field){
  const value=String(v??'').trim();if(['是','啟用','true','TRUE','1'].includes(value))return true;
  if(['否','停用','false','FALSE','0'].includes(value))return false;
  if(value==='')return field==='active';
  throw Error(`「${field==='active'?'啟用狀態':'封存'}」僅可填是/否或啟用/停用`);
}
function versionCheck(raw,old){
  if(!old)return;
  const version=String(raw??'').trim();
  if(version!==''&&Number(version)!==Number(old.version||1))throw Error('Excel版本與雲端版本不一致，請重新匯出後修改。');
}
export async function previewImport(file,current){
  const X=requireExcel(),wb=new X.Workbook();await wb.xlsx.load(await file.arrayBuffer());
  const ss=wb.getWorksheet('主管基本資料'),ts=wb.getWorksheet('狀態基本資料'),rs=wb.getWorksheet('主管指示紀錄');
  if(!ss&&!ts&&!rs)throw Error('找不到主管、狀態或指示資料工作表。');
  const srows=extract(ss,HEAD_S,'主管基本資料').items;
  const trows=extract(ts,HEAD_T,'狀態基本資料').items;
  const rrows=extract(rs,HEAD_R,'主管指示紀錄').items;
  const changes=[],errors=[],supervisors=current.supervisors.map(x=>({...x})),statuses=(current.statusSettings?.items||[]).map(x=>({...x}));
  const idsS=new Set(),idsT=new Set(),idsR=new Set();
  for(const raw of srows){
    try{
      const id=raw['主管ID']||ownId();if(idsS.has(id))throw Error('主管ID重複');idsS.add(id);
      const old=current.supervisors.find(x=>x.id===id)||null;versionCheck(raw['版本'],old);
      const obj=normalizeSupervisor({id,name:raw['姓名'],title:raw['職稱'],department:raw['所屬單位'],active:boolCell(raw['啟用狀態'],'active'),order:raw['顯示順序']===''?100:raw['顯示順序']});
      if(!old&&supervisors.some(s=>s.name===obj.name&&s.department===obj.department))throw Error('姓名及所屬單位已存在；請填入原主管ID');
      const op=!old?'新增':supervisorChanged(old,obj)?'修改':'無異動';
      if(op!=='無異動')changes.push({kind:'supervisor',op,obj,expected:old?.version||0,row:raw._row});
      const ix=supervisors.findIndex(s=>s.id===id);if(ix>=0)supervisors[ix]={...supervisors[ix],...obj};else supervisors.push({...obj,version:0});
    }catch(e){errors.push(`主管基本資料 第${raw._row}列：${e.message}`);}
  }
  // R0.2 新增選用的狀態工作表，舊 R0.1 的 Excel 沒有此工作表仍可照原邏輯匯入。
  for(const raw of trows){
    try{
      const id=raw['狀態ID']||ownId();if(idsT.has(id))throw Error('狀態ID重複');idsT.add(id);
      const old=(current.statusSettings?.items||[]).find(x=>x.id===id)||null;
      const excelVersion=raw['設定版本'];
      if(old && String(excelVersion??'').trim()!=='' && Number(excelVersion)!==Number(current.statusSettings?.version||0))throw Error('狀態設定版本已變更，請重新匯出。');
      const obj=normalizeStatus({id,name:raw['狀態名稱'],description:raw['狀態說明'],active:boolCell(raw['啟用狀態'],'active'),order:raw['顯示順序']===''?100:raw['顯示順序']});
      const ix=statuses.findIndex(x=>x.id===id);
      const next=statuses.map(s=>({...s}));
      if(ix<0)next.push(obj);else next[ix]=obj;
      normalizeStatusList(next);
      const op=!old?'新增':['name','description','active','order'].some(k=>old[k]!==obj[k])?'修改':'無異動';
      if(op!=='無異動')changes.push({kind:'status',op,obj,expected:current.statusSettings?.version||0,row:raw._row});
      statuses.splice(0,statuses.length,...next);
    }catch(e){errors.push(`狀態基本資料 第${raw._row}列：${e.message}`);}
  }
  for(const raw of rrows){
    try{
      const id=raw['紀錄ID']||ownId();if(idsR.has(id))throw Error('紀錄ID重複');idsR.add(id);
      const old=current.records.find(r=>r.id===id)||null;versionCheck(raw['版本'],old);
      let supervisorId=raw['主管ID'];
      if(!supervisorId && raw['主管姓名']){
        const found=supervisors.filter(s=>s.name===raw['主管姓名']);if(found.length!==1)throw Error('主管姓名不唯一或不存在，請填入主管ID');supervisorId=found[0].id;
      }
      if(!supervisorId)throw Error('必須填寫主管ID或唯一主管姓名');
      if(!validDate(raw['指示日期']))throw Error('指示日期格式應為YYYY-MM-DD');
      const obj=normalizeRecord({id,date:raw['指示日期'],supervisorId,content:raw['指示內容'],source:raw['依據來源'],note:raw['備註'],status:raw['狀態'],archived:boolCell(raw['封存'],'archived')},supervisors,{existing:old});
      if(ts && !statuses.some(s=>s.name===obj.status&&s.active!==false) && !(old && obj.status===String(old.status||'')))throw Error('新建／變更狀態必須使用已啟用的狀態基本資料選項；舊狀態僅能保留原文。');
      // 沒有狀態工作表的 R0.1 舊檔允許匯入歷史自由文字；會以舊狀態顯示，不納入新建單選選項。
      const op=!old?'新增':recordChanged(old,obj)?'修改':'無異動';
      if(op!=='無異動')changes.push({kind:'record',op,obj,expected:old?.version||0,row:raw._row});
    }catch(e){errors.push(`主管指示紀錄 第${raw._row}列：${e.message}`);}
  }
  return {changes,errors,summary:{supervisors:srows.length,statuses:trows.length,records:rrows.length,new:changes.filter(c=>c.op==='新增').length,updated:changes.filter(c=>c.op==='修改').length,unchanged:Math.max(0,srows.length+trows.length+rrows.length-changes.length-errors.length),failed:errors.length}};
}
