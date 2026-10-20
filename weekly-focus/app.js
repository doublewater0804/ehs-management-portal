import {parseWorkbook,writeCell,changeRow,recompute,exportXlsx,compareBooks,mergeSelected,safeValue,isFormula} from './workbook.mjs';
import {buildReport,detectReportDate,reportSummary} from './report-layout.mjs';
import * as cloud from './cloud.js';
const $=id=>document.getElementById(id);
let book=null,savedBook=null,cloudMeta=null,activeSheet=0,chosen=null,dirty=false,loading=false,publishing=false,editMode=false,watchEnd=null,authRun=0;
let reportDate='',inputFileName='',incomingBook=null,diff=null,selectedOld=new Set(),pendingFileName='';
const clone=obj=>structuredClone(obj);
const activeName=()=>book?.SheetNames?.[activeSheet];
const key=(name,addr)=>`${name}!${addr}`;
const num=(text)=>Number(String(text).replace(/[.、\s]+$/g,''));
function notify(message,type=''){$('notice').textContent=message;$('notice').className=`notice ${type}`;}
function displayTime(ts){const dt=ts?.toDate?ts.toDate():ts?.seconds?new Date(ts.seconds*1000):ts?new Date(ts):null;return dt&&!isNaN(dt)?dt.toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'尚未發布';}
function firstSheetIndex(){const i=book?.SheetNames?.findIndex(n=>n.includes('職災事故統計表'));return i>=0?i:0;}
function showState(){
 $('report-date').textContent=reportDate?reportDate.replaceAll('-','/'):'—';$('updated-at').textContent=displayTime(cloudMeta?.updatedAt);
 $('version').textContent=cloudMeta?.version?`V${cloudMeta.version}`:'未發布';$('sheet-count').textContent=book?`${book.SheetNames.length} 張工作表`:'';
 $('filename').textContent=inputFileName||cloudMeta?.originalFilename||'尚無報表';$('filename').title=$('filename').textContent;
 $('dirty').hidden=!dirty;
 $('save').hidden=!editMode&&!dirty;$('save').disabled=!dirty||loading||publishing||!book;
 $('discard').hidden=!editMode&&!dirty;$('discard').disabled=!dirty||loading||publishing;
 $('download').disabled=!savedBook||loading||publishing;
 $('select-upload').disabled=loading||publishing;$('nav-upload').disabled=loading||publishing;
 $('nav-sheets').disabled=!book;
 $('toggle-edit').disabled=!book||loading||publishing;$('toggle-edit').setAttribute('aria-pressed',String(editMode));
 $('toggle-edit').textContent=editMode?'✓ 結束編輯模式':'✎ 進入編輯模式';
 $('edit-toolbar').hidden=!editMode;
 $('add-row').disabled=!editMode||!chosen?.item||loading||publishing;
 $('delete-row').disabled=!editMode||!chosen?.item||loading||publishing;
 $('date').value=reportDate;
 $('sheet').classList.toggle('is-editing',editMode);
}
function mk(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e;}
function editable(node,source,{row,item=false}={}){
 if(!source?.addr)return;
 node.dataset.addr=source.addr;node.dataset.row=String(row??source.row??-1);
 if(item)node.dataset.item='1';
 node.dataset.editable=String(!source.formula);
 if(source.formula)node.title='引用公式，請編輯來源儲存格';
}
function renderStats(model){
 const frame=mk('div','report-table-wrap'),t=mk('table','report-table');
 const h1=mk('tr');const label=mk('th','label-col');label.rowSpan=2;label.textContent='';h1.append(label);
 for(const group of model.categories){const th=mk('th','',group.label);th.colSpan=group.end-group.start+1;editable(th,{addr:group.addr,row:model.start,formula:false},{row:model.start});h1.append(th)}
 const h2=mk('tr','locations');for(const cell of model.subhead){const th=mk('th','',cell.text);editable(th,cell,{row:model.start+1});h2.append(th);}
 const thead=mk('thead');thead.append(h1,h2);t.append(thead);
 const tbody=mk('tbody');for(const m of model.measures){const tr=mk('tr',/年(?:統計|累計|合計)/.test(m.label)?'total':'');
  const lab=mk('td','label-col',m.label);editable(lab,{addr:m.addr,row:m.row,formula:false},{row:m.row});tr.append(lab);
  for(const cell of m.values){const td=mk('td','stats-value',cell.text||'0');editable(td,cell,{row:m.row});
   if(m.label.includes('年')&&cell.text!==''&&num(cell.text)>0&&cell.col>=model.categories.at(-1).start)td.classList.add('emphasis');
   tr.append(td);
  }tbody.append(tr);
 }
 t.append(tbody);frame.append(t);return frame;
}
function renderHeading(b){const d=mk('div','section-heading '+(b.level==='minor'?'sub':''),b.text);
 editable(d,b.source,{row:b.row});return d;}
function renderItem(b){const li=mk('li','item-row');li.dataset.item='1';li.dataset.row=String(b.row);li.dataset.addr=b.text.addr;
 li.dataset.editable=String(!b.text.formula);
 const no=mk('span','item-number',b.number.text.replace(/\.0+$/,''));
 const text=mk('div','item-copy'+(b.text.formula?' formula':''),b.text.text);
 editable(text,b.text,{row:b.row,item:true});editable(no,b.number,{row:b.row,item:true});li.append(no,text);
 if(b.extra.length){const aside=mk('div','other-cols');aside.style.gridColumn='2';for(const cell of b.extra){const span=mk('span','',cell.text);editable(span,cell,{row:b.row,item:true});aside.append(span);}li.append(aside);}
 return li;}
function renderNote(b){const p=mk('div','sheet-note');for(const cell of b.cells){const span=mk('span','note-part',cell.text);editable(span,cell,{row:b.row});p.append(span);}return p;}
function drawTabs(){const container=$('tabs');container.replaceChildren();if(!book)return;
 book.SheetNames.forEach((name,i)=>{const b=mk('button','',name);b.type='button';b.role='tab';b.setAttribute('aria-selected',String(i===activeSheet));b.onclick=()=>{
  if(!guardDirty())return;activeSheet=i;chosen=null;drawTabs();drawReport();window.scrollTo({top:0,behavior:'smooth'});
 };container.append(b);});
}
function guardDirty(){return true;} // Switching views never discards unsaved edits; both share the same live workbook.
function drawReport(){const container=$('sheet');container.replaceChildren();if(!book){container.append(mk('div','empty','尚未發布 Excel，請按「上傳檔案」。'));showState();return;}
 const ws=book.Sheets[activeName()];if(!ws){notify('找不到指定工作表','error');return;}
 const report=buildReport(ws);const heading=mk('h2','sheet-title',report.title);editable(heading,report.titleCell,{row:report.titleCell?.row});container.append(heading);
 const head=mk('div','sheet-headline',report.headline);editable(head,report.headlineCell,{row:report.headlineCell?.row});container.append(head);
 let list=null;
 for(const b of report.blocks){
  if(b.kind==='item') {if(!list){list=mk('ol','item-list');container.append(list);}list.append(renderItem(b));continue;}
  list=null;
  if(b.kind==='statistics')container.append(renderStats(b));
  else if(b.kind==='heading')container.append(renderHeading(b));
  else if(b.kind==='note')container.append(renderNote(b));
 }
 const s=reportSummary(report);if(!s.stats)notify('注意：新 Excel 的統計表格無法完整辨識，已將其它資料保留。請核對後再發布。','error');
 const unsupported=[];for(const name of book.SheetNames)for(const [addr,c] of Object.entries(book.Sheets[name]))if(c?.__recalcError)unsupported.push(`${name}!${addr}`);
 $('warnings').hidden=!unsupported.length;
 if(unsupported.length)$('warnings').textContent=`${unsupported.length} 個公式需使用 Microsoft Excel 重新計算（例如 ${unsupported.slice(0,3).join('、')}）。匯出檔會設定開啟時自動重新計算，請核對後再使用。`;
 highlight();showState();
}
function highlight(){for(const e of $('sheet').querySelectorAll('.selected'))e.classList.remove('selected');if(!chosen)return;
 for(const e of $('sheet').querySelectorAll('[data-addr]'))if(e.dataset.addr===chosen.addr)e.classList.add('selected');}
function markDirty(message){dirty=true;showState();notify(message||'內容已修改但尚未發布。');}
function editDialog(target){if(!book||!editMode||!target)return;
 if(target.formula){notify('這個欄位含跨工作表公式，不能直接修改；請修改其來源欄位。','error');return;}
 $('cell-title').textContent=target.item?'修改工作項目':'修改報告內容';$('cell-hint').textContent=`工作表：${activeName()}　｜　儲存後尚需按「儲存並發布」才會更新雲端。`;
 $('cell-value').value=String(book.Sheets[activeName()][target.addr]?.v??'');$('cell-dialog').showModal();$('cell-value').focus();
}
$('sheet').addEventListener('click',event=>{
 if(!editMode)return;
 const node=event.target.closest('[data-addr]');if(!node||!$('sheet').contains(node))return;
 chosen={addr:node.dataset.addr,row:Number(node.dataset.row),item:node.dataset.item==='1'||!!node.closest('.item-row'),formula:isFormula(book.Sheets[activeName()][node.dataset.addr])};
 highlight();showState();editDialog(chosen);
});
$('cell-form').addEventListener('submit',event=>{
 if(event.submitter?.value!=='save')return;
 if(!chosen)return;
 try{const res=writeCell(book,activeName(),chosen.addr,$('cell-value').value);markDirty(`已修改報告內容。${res.length?'部分公式須由 Excel 重新計算。':''}`);drawReport();}
 catch(e){notify(`修改失敗：${e.message}`,'error');}
});
$('toggle-edit').onclick=()=>{editMode=!editMode;if(!editMode)chosen=null;showState();drawReport();};
function rowOperation(delta){
 if(!book||!chosen?.item||!editMode)return notify('請先在編輯模式點選一筆工作項目。','error');
 const name=activeName(),r=chosen.row;
 if(delta===-1&&!confirm('確定刪除選取的整筆工作項目？此操作無法在發布後還原。'))return;
 const original=clone(book);
 try{
  const ws=book.Sheets[name],numAddr=XLSX.utils.encode_cell({r,c:0}),textAddr=XLSX.utils.encode_cell({r,c:1}),first=ws[numAddr],second=ws[textAddr];
  if(delta===1){
   // Insert immediately below a data item. Move workbook cells / ranges / cross-sheet formulas safely.
   changeRow(book,name,r+1,1);
   const targetR=r+1,na=XLSX.utils.encode_cell({r:targetR,c:0}),ta=XLSX.utils.encode_cell({r:targetR,c:1});
   book.Sheets[name][na]={...(first?.s?{s:clone(first.s)}:{}),t:'n',v:Number(first?.v||num(safeValue(first))||0)+1};
   book.Sheets[name][ta]={...(second?.s?{s:clone(second.s)}:{}),t:'s',v:'請輸入新的工作內容'};
   // Horizontal narrative merge carried over to the newly inserted row.
   const span=(ws['!merges']||[]).find(m=>m.s.r===r&&m.s.c===1&&m.e.r===r);
   if(span)ws['!merges'].push({s:{r:targetR,c:1},e:{r:targetR,c:span.e.c}});
  }else{changeRow(book,name,r,-1);}
  // Renumber only contiguous item rows until the next heading; never renumber statistical totals.
  const target=book.Sheets[name],range=XLSX.utils.decode_range(target['!ref']);
  let start=delta===1?r+1:r;
  if(delta===1)start=r+2;
  for(let k=start;k<=Math.min(range.e.r,start+300);k++){
   const a=XLSX.utils.encode_cell({r:k,c:0}),b=XLSX.utils.encode_cell({r:k,c:1});
   const v=target[a],body=target[b];if(!v||!body||!/^\d+(?:\.0+)?$/.test(String(v.v??'')))break;
   if(v.f)break;v.v=Number(v.v)+(delta===1?1:-1);v.t='n';delete v.w;
  }
  const broken=book.SheetNames.flatMap(n=>Object.entries(book.Sheets[n]).filter(([,c])=>c?.f?.includes('#REF!')).map(([addr])=>`${n}!${addr}`));
  if(broken.length)throw Error(`會破壞公式 ${broken.slice(0,3).join('、')}`);
  recompute(book);chosen=null;markDirty(delta===1?'已新增工作項目，請編輯內容並發布。':'已刪除工作項目，尚未發布。');drawReport();
 }catch(e){book=original;notify(`無法操作：${e.message}。原始資料已保留。`,'error');drawReport();}
}
$('add-row').onclick=()=>rowOperation(1);$('delete-row').onclick=()=>rowOperation(-1);
$('date').onchange=e=>{reportDate=e.target.value;markDirty('報表日期已修改，尚未發布。')};
$('nav-upload').onclick=()=>$('upload').click();$('select-upload').onclick=()=>$('upload').click();
$('nav-sheets').onclick=()=>{$('tabs').scrollIntoView({behavior:'smooth',block:'start'});$('tabs button:not([aria-selected="true"])')?.focus();};
$('upload').onchange=async e=>{
 const f=e.target.files?.[0];e.target.value='';if(!f)return;
 if(f.size>10*1024*1024)return notify('Excel 超過 10MB 上限，請先整理檔案。','error');
 if(/\.xlsm$/i.test(f.name)&&!confirm('將巨集檔轉為 .xlsx 後不保留巨集。仍要匯入嗎？'))return;
 try{
  incomingBook=parseWorkbook(await f.arrayBuffer(),f.name);pendingFileName=f.name;
  if(!book){book=incomingBook;incomingBook=null;inputFileName=pendingFileName;reportDate=detectReportDate(book);activeSheet=firstSheetIndex();chosen=null;editMode=true;markDirty('已匯入完整報表，請確認畫面並按「儲存並發布」。');drawTabs();drawReport();return;}
  diff=compareBooks(book,incomingBook);selectedOld=new Set();drawDiff();$('diff-dialog').showModal();
 }catch(e){incomingBook=null;notify(`匯入失敗：${e.message}`,'error');}
};
function drawDiff(){const list=$('diff-list');list.replaceChildren();
 $('keep-all').disabled=diff.structural||diff.truncated;$('use-all').disabled=false;
 const note=diff.structural?'新舊工作表名稱、尺寸或合併儲存格有差異。為避免錯置，僅可完整採用新版，不允許逐格保留。':diff.truncated?'差異超過 1,500 筆，請完整採用新版。':'普通儲存格可以選擇保留線上或採用新版；公式由新版管理。';
 $('diff-description').textContent=`偵測到 ${diff.total} 處差異。${note} 確認後不會立即發布。`;
 for(const d of diff.changes){const line=mk('div','diff-row'),id=key(d.sheet,d.addr);line.append(mk('div','diff-meta',`${d.sheet} · ${d.addr}`),mk('div','val',`線上：${d.oldText||'（空白）'}`),mk('div','val',`新版：${d.newText||'（空白）'}`));
  if(d.formula||diff.structural||diff.truncated){line.append(mk('span','formula-note',d.formula?'公式，採用新版':'結構調整，採用新版'));}
  else{const sel=mk('select');for(const [v,t] of [['new','採用新版'],['old','保留線上']]){const op=mk('option','',t);op.value=v;sel.append(op);}sel.value=selectedOld.has(id)?'old':'new';sel.onchange=()=>sel.value==='old'?selectedOld.add(id):selectedOld.delete(id);line.append(sel);}list.append(line);
 }
 if(!diff.changes.length)list.append(mk('div','empty','沒有偵測到儲存格差異，可以更新原始版面。'));
}
$('keep-all').onclick=()=>{for(const d of diff.changes)if(!d.formula)selectedOld.add(key(d.sheet,d.addr));drawDiff();};
$('use-all').onclick=()=>{selectedOld.clear();drawDiff();};
$('cancel-import').onclick=()=>{$('diff-dialog').close();incomingBook=null;diff=null;selectedOld.clear();};
$('confirm-import').onclick=()=>{
 if(!incomingBook)return;
 if((diff.structural||diff.truncated)&&selectedOld.size)return notify('無法在結構改變時逐格合併資料','error');
 try{
  book=mergeSelected(book,incomingBook,diff,selectedOld);inputFileName=pendingFileName;reportDate=detectReportDate(book)||reportDate;
  const missing=recompute(book);incomingBook=null;diff=null;selectedOld.clear();activeSheet=firstSheetIndex();chosen=null;editMode=true;
  $('diff-dialog').close();markDirty(`已匯入新版，尚未發布。${missing.length?`${missing.length} 個公式待 Excel 重算。`:''}`);drawTabs();drawReport();
 }catch(e){notify(`合併失敗：${e.message}`,'error');}
};
$('download').onclick=()=>{
 if(!savedBook)return;
 try{const arr=exportXlsx(savedBook),blob=new Blob([arr],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`每周安全永續組工作重點_${cloudMeta?.reportDate||'最新'}.xlsx`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  notify('已下載目前已發布的完整 Excel。','success');
 }catch(e){notify(`下載失敗：${e.message}`,'error');}
};
$('discard').onclick=()=>{if(!dirty||!confirm('確定放棄所有未發布修改嗎？'))return;
 book=savedBook?clone(savedBook):null;reportDate=cloudMeta?.reportDate||'';inputFileName=cloudMeta?.originalFilename||'';dirty=false;chosen=null;activeSheet=book?firstSheetIndex():0;editMode=false;drawTabs();drawReport();notify('已還原為最新正式版本。');
};
$('save').onclick=async()=>{
 if(!dirty||!book)return;if(!reportDate)return notify('請先設定報表日期。','error');
 const problems=[];for(const n of book.SheetNames)for(const [addr,c] of Object.entries(book.Sheets[n]))if(c?.f?.includes('#REF!'))problems.push(`${n}!${addr}`);
 if(problems.length)return notify(`公式參照損壞：${problems.slice(0,4).join('、')}。請先修正。`,'error');
 const needExcel=recompute(book);if(needExcel.length&&!confirm(`有 ${needExcel.length} 個公式無法在線上確認計算結果，下載後必須使用 Excel 開啟重新計算。確定仍要發布嗎？`))return;
 if(!confirm(`確認發布完整 ${book.SheetNames.length} 張工作表？目前線上正式版會由新檔取代。`))return;
 publishing=true;showState();notify('正在發布最新報表…');
 try{
  const bytes=exportXlsx(book),result=await cloud.publish(bytes,{expectedVersion:cloudMeta?.version||0,reportDate,originalFilename:inputFileName||'每周工作重點.xlsx',sheetNames:book.SheetNames});
  savedBook=clone(book);cloudMeta={...cloudMeta,version:(cloudMeta?.version||0)+1,reportDate,updatedAt:new Date(),originalFilename:inputFileName};dirty=false;editMode=false;chosen=null;
  notify(`發布完成。${result.cleanupError?'舊版資料清理未完成，請檢查 Firestore 權限。':''}`,'success');drawReport();
 }catch(e){notify(`發布失敗：${e.message}`,'error');}finally{publishing=false;showState();}
};
async function loadOfficial(meta,generation){
 if(!meta){if(dirty)return;savedBook=null;book=null;cloudMeta=null;reportDate='';inputFileName='';editMode=false;drawTabs();drawReport();notify('目前沒有已發布報表，請先上傳 Excel。');return;}
 if(meta.releaseId&&meta.releaseId===cloudMeta?.releaseId)return;
 if(dirty){notify('雲端已有新版，但目前畫面仍有未發布修改，請先處理。','error');return;}
 loading=true;showState();notify('正在取得最新正式報表…');
 try{const raw=await cloud.loadBytes(meta);if(generation!==authRun)return;
  const fresh=parseWorkbook(raw,'published.xlsx');savedBook=clone(fresh);book=fresh;cloudMeta=meta;reportDate=meta.reportDate||detectReportDate(fresh);inputFileName=meta.originalFilename||'';
  dirty=false;chosen=null;editMode=false;activeSheet=firstSheetIndex();drawTabs();drawReport();notify('已載入正式報表。','success');
 }catch(e){notify(`讀取失敗：${e.message}。請核對 Firestore 權限及資料完整性。`,'error');}finally{loading=false;showState();}
}
$('login').onclick=()=>cloud.login().catch(e=>$('auth-status').textContent=`登入失敗：${e.message}`);
$('logout').onclick=()=>cloud.logout().catch(e=>notify(`登出失敗：${e.message}`,'error'));
cloud.observeAuth(user=>{
 authRun++;const gen=authRun;if(watchEnd){watchEnd();watchEnd=null;}
 savedBook=null;book=null;cloudMeta=null;dirty=false;loading=false;chosen=null;reportDate='';inputFileName='';editMode=false;
 const allowed=!!user&&cloud.isOwner(user);$('auth-panel').hidden=allowed;$('app').hidden=!allowed;$('logout').hidden=!user;
 if(!user){$('auth-status').textContent='請登入管理者 Google 帳號。';return;}
 if(!allowed){$('auth-status').textContent=`帳號 ${user.email||''} 沒有存取權限。請登出並使用 EHS 管理者帳號。`;return;}
 notify('身分驗證成功，正在連線…');drawTabs();drawReport();
 watchEnd=cloud.subscribe(meta=>{if(!publishing)loadOfficial(meta,gen)},error=>notify(`雲端存取失敗：${error.message}。請先核對 Firebase 規則。`,'error'));
});
