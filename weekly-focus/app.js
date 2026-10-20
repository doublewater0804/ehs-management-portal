import {parseWorkbook,sheetNames,inspectLayout,safeValue,isFormula,isMergeChild,writeCell,changeRow,recompute,exportXlsx,compareBooks,mergeSelected,MAX_ROWS} from './workbook.mjs';
import * as cloud from './cloud.js';
const $=id=>document.getElementById(id);
const app=$('app'),auth=$('auth-panel');
let book=null,savedBook=null,cloudMeta=null,activeSheet=0,chosen=null,dirty=false,loading=false,publishing=false,watchEnd=null,authRun=0,shownPage=0,reportDate='',inputFileName='';
let incomingBook=null,diff=null,selectedOld=new Set(),pendingFileName='';
const clone=obj=>structuredClone(obj);
const key=(name,addr)=>`${name}!${addr}`;
const activeName=()=>book?.SheetNames[activeSheet];
function notify(message,type=''){$('notice').textContent=message;$('notice').className='notice '+type;}
function timeFormat(ts){const dt=ts?.toDate?ts.toDate():ts?.seconds?new Date(ts.seconds*1000):ts?new Date(ts):null;return dt&&!isNaN(dt)?dt.toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'尚未發布';}
function showState(){
 $('report-date').textContent=reportDate||'未設定';$('updated-at').textContent=timeFormat(cloudMeta?.updatedAt);$('version').textContent=cloudMeta?.version?`V${cloudMeta.version}`:'未發布';
 $('sheet-count').textContent=book?`${book.SheetNames.length} 張`:'—';$('filename').textContent=inputFileName||cloudMeta?.originalFilename||'';
 $('date').value=reportDate;$('dirty').hidden=!dirty;$('save').disabled=!dirty||loading||publishing||!book;$('discard').disabled=!dirty||loading||publishing;
 $('download').disabled=!savedBook||loading||publishing;$('edit').disabled=!book||!chosen;$('add-row').disabled=!book||!chosen;$('delete-row').disabled=!book||!chosen;
 $('selection').textContent=chosen?`已選取 ${activeName()}!${chosen.addr}${chosen.formula?'（公式，唯讀）':''}`:'請點選一個儲存格';
}
function color(val){const hex=typeof val==='string'?val:val?.rgb;if(!hex||!/^(?:[a-f0-9]{6}|[a-f0-9]{8})$/i.test(hex))return null;return '#'+hex.slice(-6)}
function styleCell(td,c){const s=c?.s;if(!s||typeof s!=='object')return;
 const font=s.font||{},align=s.alignment||{},fill=s.fill||{},border=s.border||{};
 let v=color(fill.fgColor||fill.bgColor);if(v&&fill.patternType!=='none')td.style.backgroundColor=v;
 v=color(font.color);if(v)td.style.color=v;
 if(font.bold)td.style.fontWeight='bold';if(font.italic)td.style.fontStyle='italic';
 if(font.sz&&font.sz>7&&font.sz<30)td.style.fontSize=font.sz+'px';
 if(align.horizontal&&['left','right','center','justify'].includes(align.horizontal))td.style.textAlign=align.horizontal;
 if(align.vertical&&['top','bottom','center'].includes(align.vertical))td.style.verticalAlign=align.vertical==='center'?'middle':align.vertical;
 if(align.wrapText===false)td.style.whiteSpace='nowrap';
 for(const side of ['left','right','top','bottom'])if(border[side]?.style){const c=color(border[side].color)||'#9caebb';td.style['border'+side[0].toUpperCase()+side.slice(1)]=`1px solid ${c}`;}
}
function drawTabs(){const tabs=$('tabs');tabs.replaceChildren();if(!book)return;
 book.SheetNames.forEach((name,i)=>{const b=document.createElement('button');b.type='button';b.role='tab';b.textContent=name;b.setAttribute('aria-selected',String(i===activeSheet));b.onclick=()=>{activeSheet=i;chosen=null;shownPage=0;$('search').value='';drawTabs();drawTable();};tabs.append(b);});
}
function firstSheetIndex(){const idx=book?.SheetNames.findIndex(name=>name.includes('職災事故統計表'));return idx>=0?idx:0;}
function displayBook(){if(!book){$('sheet').innerHTML='<div class="empty">尚無 Excel 檔案，請按「上傳新版 Excel」。</div>';$('tabs').replaceChildren();showState();return;}
 activeSheet=Math.max(0,Math.min(activeSheet,book.SheetNames.length-1));drawTabs();drawTable();}
function drawTable(){const container=$('sheet');container.replaceChildren();if(!book)return;
 const ws=book.Sheets[activeName()],size=inspectLayout(ws);
 const query=$('search').value.trim().toLowerCase();const rows=[];
 for(let r=0;r<size.rows;r++){
  if(query){let hit=false;for(let c=0;c<size.cols;c++)if(safeValue(ws[XLSX.utils.encode_cell({r,c})]).toLowerCase().includes(query)){hit=true;break;}if(!hit)continue;}
  rows.push(r);
 }
 const PAGE=160,part=rows.slice(shownPage*PAGE,(shownPage+1)*PAGE);
 if(!part.length){const blank=document.createElement('div');blank.className='empty';blank.textContent='沒有資料或符合的搜尋結果';container.append(blank);showState();return;}
 if(rows.length>PAGE){const nav=document.createElement('div');nav.className='pagination';nav.style.padding='9px';const back=document.createElement('button');back.textContent='上一頁';back.disabled=shownPage===0;back.onclick=()=>{shownPage--;drawTable()};const next=document.createElement('button');next.textContent='下一頁';next.disabled=(shownPage+1)*PAGE>=rows.length;next.onclick=()=>{shownPage++;drawTable()};const label=document.createElement('span');label.textContent=` 顯示第 ${shownPage*PAGE+1}～${Math.min((shownPage+1)*PAGE,rows.length)}／${rows.length} 列 `;nav.append(back,label,next);container.append(nav);}
 const t=document.createElement('table');t.className='excel';t.setAttribute('aria-label',activeName());
 const colgroup=document.createElement('colgroup'),rowCol=document.createElement('col');rowCol.className='row-number';colgroup.append(rowCol);
 for(let c=0;c<size.cols;c++){const item=document.createElement('col');const cw=ws['!cols']?.[c];let width=Number(cw?.wpx)||Number(cw?.wch)*7+12||94;item.style.width=Math.min(400,Math.max(49,width))+'px';colgroup.append(item);}t.append(colgroup);
 const thead=document.createElement('thead'),trh=document.createElement('tr'),corner=document.createElement('th');corner.className='row-num';corner.textContent='#';trh.append(corner);
 for(let c=0;c<size.cols;c++){const th=document.createElement('th');th.textContent=XLSX.utils.encode_col(c);trh.append(th);}thead.append(trh);t.append(thead);
 const tbody=document.createElement('tbody'),isSearch=!!query;
 for(const r of part){const tr=document.createElement('tr'),head=document.createElement('td');head.textContent=String(r+1);head.className='row-head';tr.append(head);
  const rowHeight=Number(ws['!rows']?.[r]?.hpx)||Number(ws['!rows']?.[r]?.hpt)*96/72;if(rowHeight&&rowHeight>15&&rowHeight<360)tr.style.height=`${rowHeight}px`;
  for(let c=0;c<size.cols;c++){
   if(isMergeChild(ws,r,c))continue;
   const merged=(ws['!merges']||[]).find(m=>m.s.r===r&&m.s.c===c);
   const addr=XLSX.utils.encode_cell({r,c}),cell=ws[addr];const td=document.createElement('td');td.dataset.addr=addr;
   if(merged){td.colSpan=merged.e.c-merged.s.c+1;if(!isSearch)td.rowSpan=Math.min(merged.e.r-r+1,(part.at(-1)||r)-r+1);}
   td.textContent=safeValue(cell);
   if(isFormula(cell))td.classList.add('formula');if(cell?.__recalcError){td.classList.add('warn-formula');td.title=`公式待 Excel 重新計算：${cell.__recalcError}`;}
   styleCell(td,cell);if(chosen?.addr===addr)td.classList.add('selected');tr.append(td);
  }
  tbody.append(tr);
 }
 t.append(tbody);container.append(t);
 const unsupported=[];for(const [name,ws] of Object.entries(book.Sheets))for(const [addr,c] of Object.entries(ws))if(c?.__recalcError)unsupported.push(`${name}!${addr}`);
 $('warnings').hidden=!unsupported.length;
 if(unsupported.length)$('warnings').textContent=`${unsupported.length} 個公式無法在網頁端驗證最新計算結果（如：${unsupported.slice(0,3).join('、')}）。下載版將標示需由 Excel 重新計算；請在正式使用前以 Excel 檢查結果。`;
 showState();
}
function markDirty(note){dirty=true;showState();notify(note||'有未發布修改。請按「儲存並發布修改」。');}
function applyEdit(text){if(!chosen)return;try{const warnings=writeCell(book,activeName(),chosen.addr,text);markDirty(`已修改 ${activeName()}!${chosen.addr}。${warnings.length?'部分公式需以 Excel 重新計算。':''}`);drawTable();}catch(e){notify(e.message,'error');}}
$('sheet').addEventListener('click',e=>{const td=e.target.closest('td[data-addr]');if(!td)return;$('sheet').querySelectorAll('td.selected').forEach(x=>x.classList.remove('selected'));chosen={addr:td.dataset.addr,formula:isFormula(book.Sheets[activeName()][td.dataset.addr])};td.classList.add('selected');showState();});
$('sheet').addEventListener('dblclick',e=>{const td=e.target.closest('td[data-addr]');if(!td)return;chosen={addr:td.dataset.addr,formula:isFormula(book.Sheets[activeName()][td.dataset.addr])};openEdit();});
function openEdit(){if(!book||!chosen)return;if(chosen.formula)return notify('這個儲存格含公式，請修改其來源內容，不可直接覆寫。','error');
 $('cell-title').textContent=`編輯 ${activeName()}!${chosen.addr}`;const cell=book.Sheets[activeName()][chosen.addr];$('cell-value').value=cell?.v==null?'':String(cell.v);$('cell-dialog').showModal();$('cell-value').focus();}
$('edit').onclick=openEdit;
$('cell-form').addEventListener('submit',e=>{if(e.submitter?.value==='save')applyEdit($('cell-value').value);});
function operation(delta){if(!chosen||!book)return;const r=XLSX.utils.decode_cell(chosen.addr).r;
 const verb=delta===1?'新增':'刪除';if(!confirm(`確定要在 ${activeName()} 第 ${r+1} 列${verb}整列？此操作可能改變公式參照。`))return;
 const backup=clone(book);try{const warnings=changeRow(book,activeName(),r,delta);
  if(book.SheetNames.some(name=>Object.values(book.Sheets[name]).some(c=>c?.f?.includes('#REF!'))))throw Error('此操作會使其他公式產生 #REF!，已取消以保護資料');
  chosen=null;markDirty(`已${verb}第 ${r+1} 列。${warnings.length?'部分公式仍待 Excel 重新計算。':''}`);drawTable();
 }catch(e){book=backup;notify(`無法${verb}：${e.message}`,'error');}}
$('add-row').onclick=()=>operation(1);$('delete-row').onclick=()=>operation(-1);
$('search').oninput=()=>{shownPage=0;drawTable()};
$('date').onchange=e=>{reportDate=e.target.value;markDirty('已修改報表日期，尚未發布。')};
$('select-upload').onclick=()=>$('upload').click();
$('upload').onchange=async e=>{
 const f=e.target.files?.[0];e.target.value='';if(!f)return;
 if(f.size>10*1024*1024)return notify('檔案超過 10 MB 上限','error');
 if(/\.xlsm$/i.test(f.name)&&!confirm('含巨集的 .xlsm 將轉換成 .xlsx，巨集不會保留。仍要繼續嗎？'))return;
 try{
  incomingBook=parseWorkbook(await f.arrayBuffer(),f.name);pendingFileName=f.name;
  if(!book){book=incomingBook;inputFileName=pendingFileName;incomingBook=null;activeSheet=firstSheetIndex();chosen=null;shownPage=0;reportDate='';markDirty('已匯入 Excel，請設定報表日期後發布。');displayBook();return;}
  diff=compareBooks(book,incomingBook);selectedOld=new Set();drawDiff();$('diff-dialog').showModal();
 }catch(error){incomingBook=null;notify(`Excel 匯入失敗：${error.message}`,'error');}
};
function drawDiff(){
 const d=$('diff-description'),listing=$('diff-list');listing.replaceChildren();$('keep-all').disabled=diff.structural;$('use-all').disabled=diff.structural;
 const reasons=diff.reasons.length?`注意：${diff.reasons.join('；')}。為避免錯誤對應，僅能整份採用新版，不能逐格保留舊內容。`:'你可以為每個一般儲存格選擇「保留目前線上值」或「採用新 Excel」。公式一律以新檔為準。';
 d.textContent=`共發現 ${diff.total} 個儲存格差異。${diff.truncated?'只列出前 1,500 個，不允許逐格合併全部差異。':''} ${reasons}`;
 for(const change of diff.changes){const line=document.createElement('div');line.className='diff-row';const id=key(change.sheet,change.addr);
  const meta=document.createElement('div');meta.className='diff-meta';meta.textContent=id;line.append(meta);
  const old=document.createElement('div');old.className='val';old.textContent='線上：'+(change.oldText||'（空白）');line.append(old);
  const fresh=document.createElement('div');fresh.className='val';fresh.textContent='新版：'+(change.newText||'（空白）');line.append(fresh);
  if(change.formula||diff.structural||diff.truncated){const note=document.createElement('span');note.className='formula-note';note.textContent=change.formula?'公式：採用新版':'結構變更：採用新版';line.append(note);}else{
   const select=document.createElement('select');select.setAttribute('aria-label',`差異 ${id} 的處理方式`);
   for(const [value,label] of [['new','採用新版'],['old','保留線上值']]){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}
   select.value=selectedOld.has(id)?'old':'new';select.onchange=()=>{if(select.value==='old')selectedOld.add(id);else selectedOld.delete(id);};line.append(select);
  }listing.append(line);
 }
 if(diff.total===0){const p=document.createElement('p');p.className='empty';p.textContent='兩份檔案的儲存格值與公式沒有差異，仍可選擇以新版檔案替換排版。';listing.append(p);}
}
$('keep-all').onclick=()=>{for(const d of diff.changes)if(!d.formula)selectedOld.add(key(d.sheet,d.addr));drawDiff()};
$('use-all').onclick=()=>{selectedOld.clear();drawDiff()};
$('cancel-import').onclick=()=>{$('diff-dialog').close();incomingBook=null;diff=null;selectedOld.clear();};
$('confirm-import').onclick=()=>{
 if(!incomingBook)return;
 if(diff.structural&&selectedOld.size)return notify('工作表結構已改變，請全部採用新版或取消匯入。','error');
 if(diff.truncated&&selectedOld.size)return notify('差異過多，不允許部分合併。請選擇直接採用新版。','error');
 try{book=mergeSelected(book,incomingBook,diff,selectedOld);inputFileName=pendingFileName;reportDate='';const waiting=recompute(book);incomingBook=null;diff=null;selectedOld.clear();activeSheet=firstSheetIndex();chosen=null;shownPage=0;$('diff-dialog').close();markDirty(`已完成差異確認，尚未發布。${waiting.length?` ${waiting.length} 個公式需 Excel 再計算。`:''}`);displayBook();}
 catch(e){notify(e.message,'error');}
};
$('download').onclick=()=>{
 if(!savedBook)return;try{const arr=exportXlsx(savedBook),blob=new Blob([arr],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`每周安全永續組工作重點_${cloudMeta?.reportDate||'latest'}.xlsx`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  notify('已下載正式版本。請用 Excel 開啟並確認跨 Sheet 公式及特殊格式。','success');
 }catch(e){notify(`下載失敗：${e.message}`,'error');}
};
$('discard').onclick=()=>{if(!dirty)return;if(!confirm('放棄所有尚未發布的修改？'))return;book=savedBook?clone(savedBook):null;reportDate=cloudMeta?.reportDate||'';inputFileName=cloudMeta?.originalFilename||'';dirty=false;chosen=null;activeSheet=firstSheetIndex();shownPage=0;displayBook();notify('已還原正式版本。');};
$('save').onclick=async()=>{
 if(!dirty||!book)return;
 if(!reportDate)return notify('請先設定報表日期，再發布。','error');
 const problems=[];for(const name of book.SheetNames)for(const [addr,cell] of Object.entries(book.Sheets[name]))if(cell?.f?.includes('#REF!'))problems.push(`${name}!${addr}`);
 if(problems.length)return notify(`公式引用損壞（${problems.slice(0,3).join('、')}），請修正後再發布。`,'error');
 const unsupported=recompute(book);
 if(unsupported.length&&!confirm(`有 ${unsupported.length} 個公式無法在網頁端重新驗證，Excel 開啟時才會重算。建議先下載核對，確定仍要發布嗎？`))return;
 if(!confirm(`確定發布 ${book.SheetNames.length} 張工作表？將以最新版取代目前雲端 Excel。`))return;
 publishing=true;showState();notify('正在將 Excel 上傳至受保護的雲端儲存空間…');
 try{
  const bytes=exportXlsx(book);const result=await cloud.publish(bytes,{expectedVersion:cloudMeta?.version||0,reportDate,originalFilename:inputFileName||cloudMeta?.originalFilename||'工作重點.xlsx',sheetNames:book.SheetNames});
  savedBook=clone(book);cloudMeta={...cloudMeta,version:(cloudMeta?.version||0)+1,reportDate,originalFilename:inputFileName||cloudMeta?.originalFilename||'工作重點.xlsx',updatedAt:new Date()};dirty=false;
  notify(`正式發布成功。${result.cleanupError?'舊版檔案清理失敗，請依 README 清理 Firebase Storage。':''}`,'success');
 }catch(e){notify(`發布失敗：${e.message}`,'error');}finally{publishing=false;showState();}
};
async function loadOfficial(meta,generation){
 if(!meta){if(dirty)return;savedBook=null;book=null;cloudMeta=null;reportDate='';inputFileName='';displayBook();notify('目前尚未發布檔案，請先上傳 Excel。');return;}
 if(meta.storagePath===cloudMeta?.storagePath)return;
 if(dirty){notify('雲端已有新版，但本頁有未儲存編輯。請先放棄本機修改再重新載入。','error');return;}
 loading=true;showState();notify('正在讀取最新的受保護 Excel…');
 try{const raw=await cloud.loadBytes(meta);if(generation!==authRun)return;
  const imported=parseWorkbook(raw,'official.xlsx');savedBook=clone(imported);book=imported;cloudMeta=meta;reportDate=meta.reportDate||'';inputFileName=meta.originalFilename||'';dirty=false;activeSheet=firstSheetIndex();chosen=null;shownPage=0;displayBook();notify('已載入正式最新版 Excel。','success');
 }catch(e){notify(`讀取失敗：${e.message}。請確認 Firebase Storage 權限規則。`,'error');}finally{loading=false;showState();}
}
$('login').onclick=()=>cloud.login().catch(e=>$('auth-status').textContent=`登入失敗：${e.message}`);
$('logout').onclick=()=>cloud.logout().catch(e=>notify(`登出失敗：${e.message}`,'error'));
cloud.observeAuth(user=>{
 authRun++;const generation=authRun;if(watchEnd){watchEnd();watchEnd=null;}
 savedBook=null;book=null;cloudMeta=null;dirty=false;loading=false;chosen=null;inputFileName='';reportDate='';auth.hidden=!!user&&cloud.isOwner(user);app.hidden=!user||!cloud.isOwner(user);$('logout').hidden=!user;
 if(!user){$('auth-status').textContent='請使用入口網站管理者帳號登入。';return;}
 if(!cloud.isOwner(user)){$('auth-status').textContent=`目前登入 ${user.email||''}，沒有權限。請登出後改用管理者帳號。`;return;}
 notify('驗證登入成功，正在連線…');displayBook();
 watchEnd=cloud.subscribe(meta=>{if(publishing)return;loadOfficial(meta,generation);},e=>notify(`無法連線至受保護資料：${e.message}。請先部署 Firebase 規則。`,'error'));
});
