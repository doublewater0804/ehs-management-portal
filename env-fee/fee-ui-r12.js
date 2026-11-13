/* 環保規費 Dashboard R1.2：Excel 雙格式解析、資料差異預覽、人工確認。*/
(function(){
'use strict';
const $=id=>document.getElementById(id), P=window.FeeImportR12, core=window.envFeeR11;
if(!P||!core)throw Error('R1.2 匯入元件未正確載入');
const cloud=core.cloud, model=core.getModel;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const show=v=>v===null||v===undefined?'尚未申報':P.moneyLabel(v);
let plan=null,uploadBusy=false,cloudVersion=0;
const statusMessage=(message,fail=false)=>{$('importStatus').className='io-status '+(fail?'error':'ok');$('importStatus').textContent=message;};
const fingerprint=r=>r?JSON.stringify([r.amount??null,r.refund??0,r.status||'',r.note||'',r.deleted===true,r.updatedAt||'',r.updatedBy||'']):'';
function sameRecord(a,b){return Boolean(a&&b)&&a.amount===b.amount&&Number(a.refund||0)===Number(b.refund||0)&&a.status===b.status&&(a.note||'')===(b.note||'')&&a.deleted===b.deleted;}
function validateRecord(r){
 const errors=[],t=model.typeOf(r.type);
 if(!Number.isInteger(r.year)||r.year<2016||r.year>2100)errors.push('年度不合法');
 if(!t)errors.push('未知規費類型');
 else if(!model.periods(t).includes(r.period))errors.push('申報期間不合法');
 if(t&&t.scope==='company'&&r.site!=='全公司')errors.push('全公司規費的範圍錯誤');
 if(t&&t.scope==='site'&&!P.SITES.includes(r.site))errors.push('廠區不合法');
 if(r.status!=='已申報'&&r.status!=='尚未申報')errors.push('申報狀態不合法');
 if(r.status==='已申報'&&(!Number.isFinite(r.amount)||r.amount<0))errors.push('原始金額不合法');
 if(r.status==='尚未申報'&&r.amount!==null)errors.push('尚未申報的金額應為空');
 if(!Number.isFinite(r.refund)||r.refund<0)errors.push('退費不合法');
 if(r.amount!==null&&r.refund>r.amount)errors.push('原有退費高於新金額，禁止覆寫');
 if((r.note||'').length>2000)errors.push('備註超過 2000 字');
 return errors;
}
function prepare(entries){
 const duplicate=new Set(),result=[];
 for(const item of entries){
  const key=model.keyOf(item),source=cloud.records.get(key)||null,base=model.baselineRecord(item.year,item.type,item.site,item.period);
  const current=source?(source.deleted?null:source):base;
  const exists=!!source;
  const record={year:item.year,type:item.type,site:item.site,period:item.period,
   amount:item.amount??null,
   refund:item.provided?.refund?item.refund:Number(current?.refund||0),
   status:item.provided?.status?item.status:item.amount===null?'尚未申報':'已申報',
   note:item.provided?.note?item.note:String(current?.note||'')};
  if(record.status==='尚未申報')record.refund=0;
  let errors=validateRecord(record);
  if(duplicate.has(key))errors.push('Excel 內唯一鍵重複');duplicate.add(key);
  const action=errors.length?'異常':current&&sameRecord({...current,deleted:false}, {...record,deleted:false})?'不變':current?'更新':'新增';
  result.push({item,record,key,exists,source,base,current,expectedVersion:fingerprint(source),action,errors});
 }
 return result;
}
function options(select,arr,all){select.innerHTML=`<option value="">${all}</option>`+arr.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');}
function installFilters(){
 if($('r12ImportFilter'))return;
 const area=document.createElement('div');area.id='r12ImportFilter';area.className='r12-filter hidden';
 area.innerHTML=`<div class="r12-kpis" id="r12Stats"></div><p id="r12Summary" class="muted"></p><div class="r12-filters"><label>年度<select id="r12Year"></select></label><label>規費<select id="r12Type"></select></label><label>廠區<select id="r12Site"></select></label><label>處理結果<select id="r12Result"></select></label></div><div id="r12Help" class="muted">預覽只讀取檔案與雲端資料；按下確認前不會寫入。</div>`;
 $('importStatus').insertAdjacentElement('afterend',area);
 ['r12Year','r12Type','r12Site','r12Result'].forEach(id=>$(id).onchange=renderPreview);
 const styles=document.createElement('style');styles.textContent=`.r12-filter{margin-top:12px}.r12-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:10px}.r12-kpi{border:1px solid #d9e3ee;background:#f6f9fc;border-radius:9px;text-align:center;padding:9px 4px}.r12-kpi b{display:block;font-size:21px;color:#12385a}.r12-kpi span{font-size:12px;color:#536579}.r12-filters{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:8px;margin:12px 0}.r12-filters label{font-size:12px;color:#425466}.r12-filters select{width:100%;margin-top:5px;padding:7px 4px;border:1px solid #bfcee2;background:white;border-radius:6px}.r12-amount{white-space:nowrap;font-variant-numeric:tabular-nums}.r12-delta{font-variant-numeric:tabular-nums}.r12-warn{color:#ac2626}.r12-success{color:#11713b}.r12-muted{color:#64748b}.r12-table td,.r12-table th{white-space:nowrap}.r12-table td.r12-note{white-space:normal;min-width:120px}.r12-table{min-width:1100px}@media(max-width:730px){.r12-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.r12-filters{grid-template-columns:repeat(2,minmax(120px,1fr))}}`;
 document.head.appendChild(styles);
}
function renderPreview(){
 if(!plan)return;
 const {prepared,skipped}=plan;
 const year=$('r12Year').value,type=$('r12Type').value,site=$('r12Site').value,flag=$('r12Result').value;
 const candidates=[...prepared.map(x=>({...x,skip:false})),...skipped.map(x=>({item:x,action:x.kind==='blank'?'略過－空白':'略過－錯誤',errors:[x.reason],skip:true}))];
 const filtered=candidates.filter(x=>(!year||String(x.item.year)===year)&&(!type||x.item.type===type)&&(!site||x.item.site===site)&&(!flag||x.action===flag));
 const head=['年度','期間','規費類型','廠區／範圍','Excel 格位','舊金額','來源新金額','差額','狀態／處理','說明'];
 $('importPreview').innerHTML=`<table class="preview-table r12-table"><thead><tr>${head.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${filtered.map(x=>{
  const f=x.item,t=model.typeOf(f.type),before=x.skip?'':x.current?.amount,after=x.skip?f.value:x.record.amount;
  const diff=x.skip||!Number.isFinite(before)||!Number.isFinite(after)?'—':show(after-before);
  const color=x.action==='異常'||x.action==='略過－錯誤'?'r12-warn':x.action==='更新'?'r12-success':'r12-muted';
  const note=x.skip?x.errors.join('；'):x.errors.length?x.errors.join('；'):f.sourceAnnotation?`來源註記 ${f.sourceAnnotation}（僅存稽核紀錄）`:x.action==='不變'?'與現有資料一致':x.action==='更新'?'原備註與退費保留':'';
  return `<tr><td>${esc(f.year)}</td><td>${esc(f.period)}</td><td>${esc(t?.name||f.type)}</td><td>${esc(f.site)}</td><td>${esc(f.cell)}</td><td class="r12-amount">${x.skip?'—':esc(before===null||before===undefined?'尚未申報':show(before))}</td><td class="r12-amount">${esc(x.skip?String(after||'').slice(0,25):show(after))}</td><td class="r12-delta">${esc(diff)}</td><td class="${color}">${esc(x.action)}</td><td class="r12-note">${esc(note)}</td></tr>`;
 }).join('')||'<tr><td colspan="10">沒有符合篩選條件的紀錄。</td></tr>'}</tbody></table>`;
}
function makePreview(report,file){
 const prepared=prepare(report.entries),invalid=prepared.filter(x=>x.errors.length),skipped=report.skipped||[];
 const actions={新增:0,更新:0,不變:0,異常:0};prepared.forEach(x=>actions[x.action]++);
 plan={prepared,skipped,invalid,actions,file:file.name,sheet:report.sheet||'',version:cloudVersion};
 $('r12ImportFilter').classList.remove('hidden');
 const kpi=[['有效解析',prepared.length],['將新增',actions.新增],['將更新',actions.更新],['不變',actions.不變],['錯誤略過',skipped.filter(x=>x.kind==='error').length+invalid.length],['空白略過',skipped.filter(x=>x.kind==='blank').length]];
 $('r12Stats').innerHTML=kpi.map(([a,b])=>`<div class="r12-kpi"><b>${b}</b><span>${a}</span></div>`).join('');
 $('r12Summary').textContent=`格式：${report.format}｜工作表：${report.sheet||'目前工作表'}｜有效 ${prepared.length} 筆；新增 ${actions.新增}、更新 ${actions.更新}、不變 ${actions.不變}、資料異常 ${invalid.length}；另略過 ${skipped.length} 個來源儲存格。`;
 options($('r12Year'),[...new Set([...prepared.map(x=>String(x.item.year)),...skipped.map(x=>String(x.year))])].sort((a,b)=>Number(b)-Number(a)),'全部年度');
 options($('r12Type'),[...new Set([...prepared.map(x=>x.item.type),...skipped.map(x=>x.type)])], '全部規費');
 for(const opt of $('r12Type').options)if(opt.value)opt.textContent=model.typeOf(opt.value)?.name||opt.value;
 options($('r12Site'),[...new Set([...prepared.map(x=>x.item.site),...skipped.map(x=>x.site)])], '全部廠區');
 options($('r12Result'),['新增','更新','不變','異常','略過－錯誤','略過－空白'],'全部狀態');
 $('importPreview').classList.remove('hidden');renderPreview();updateCommit();
 const skipErrors=skipped.filter(x=>x.kind==='error').length;
 statusMessage(`解析完成：${prepared.length} 筆有效；${skipErrors} 筆來源公式／格式錯誤、${skipped.filter(x=>x.kind==='blank').length} 筆空白安全略過。待確認新增 ${actions.新增} 筆、更新 ${actions.更新} 筆；原有退費及備註不清空。${invalid.length?'另有 '+invalid.length+' 筆驗證異常已禁止寫入。':''}`);
}
function updateCommit(){
 const count=plan?plan.actions.新增+plan.actions.更新:0;
 $('commitImport').disabled=uploadBusy||!cloud.ready||!cloud.loggedIn||!count;
 $('commitImport').textContent=count?`確認匯入（${count} 筆）`:'確認匯入';
}
async function preview(){
 if(uploadBusy)return;
 const file=$('importFile').files[0];plan=null;updateCommit();$('r12ImportFilter').classList.add('hidden');$('importPreview').classList.add('hidden');
 if(!file)return statusMessage('請先選擇 Excel 或 CSV 檔案。',true);
 try{
  if(!cloud.ready||!cloud.loggedIn)throw Error('請先完成 Firebase 登入與伺服器資料同步，才能正確比較既有資料。');
  let report;
  if(file.name.toLowerCase().endsWith('.csv')){
   // 保留既有 CSV 的解析入口，並使用 R1.2 的欄位對照與差異比對。
   if(typeof parseCsv!=='function')throw Error('CSV 解析元件未載入');
   report=P.parseStandard(parseCsv(await file.text()),model.allTypes());
  }else if(/\.xlsx?$/i.test(file.name)){
   if(typeof XLSX==='undefined')throw Error('Excel 元件尚未載入，請檢查網路連線');
   const wb=XLSX.read(await file.arrayBuffer(),{type:'array',raw:true});
   // SheetJS 可能把 t:'e' 公式錯誤當作空格，額外回填 Excel 錯誤碼以避免誤計為空白。
   const matrixFor=name=>{
    const ws=wb.Sheets[name],grid=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true});
    for(const [address,cell] of Object.entries(ws)){
     if(!/^[A-Z]+[1-9]\d*$/.test(address)||cell?.t!=='e')continue;
     const pos=XLSX.utils.decode_cell(address);grid[pos.r]??=[];
     grid[pos.r][pos.c]=cell.w||({0:'#NULL!',7:'#DIV/0!',15:'#VALUE!',23:'#REF!',29:'#NAME?',36:'#NUM!',42:'#N/A'}[Number(cell.v)]||'#REF!');
    }
    return grid;
   };
   const summary=wb.SheetNames.map(name=>({name,grid:matrixFor(name)})).find(x=>P.detectSummary(x.grid));
   if(summary){report=P.parseSummary(summary.grid);report.sheet=summary.name;}
   else{
    const name=wb.SheetNames[0];if(!name)throw Error('Excel 不含工作表');
    report=P.parseStandard(XLSX.utils.sheet_to_json(wb.Sheets[name],{defval:'',raw:true}),model.allTypes());report.sheet=name;
   }
  }else throw Error('僅支援 .xlsx、.xls 或 .csv 檔案');
  if(!report.entries.length)throw Error('沒有任何可辨識的有效申報金額，未產生匯入作業');
  makePreview(report,file);
 }catch(e){statusMessage('預覽失敗：'+e.message,true);plan=null;updateCommit();}
}
async function commit(){
 if(uploadBusy||!plan||!cloud.ready||!cloud.loggedIn)return;
 const changes=plan.prepared.filter(x=>x.action==='新增'||x.action==='更新');
 if(!changes.length)return;
 const q=plan.actions;
 if(!window.confirm(`將新增 ${q.新增} 筆、更新 ${q.更新} 筆；不變 ${q.不變} 筆不寫入；原檔錯誤與空白均略過。\n雲端既有退費及人工備註會保留，資料如有變更將拒絕覆寫。\n\n確定要將 ${changes.length} 筆變動寫入 Firebase 嗎？`))return;
 uploadBusy=true;updateCommit();$('previewImport').disabled=true;
 try{
  const requests=changes.map(x=>({record:x.record,expectedExists:x.exists,expectedVersion:x.expectedVersion,sourceCell:x.item.cell,sourceAnnotation:x.item.sourceAnnotation||'',sourceFile:plan.file,sourceSheet:plan.sheet}));
  const result=await window.feeCloudAPI.importRows(requests,{onProgress:count=>statusMessage(`已提交 ${count}/${changes.length} 筆 Firebase 變更…`)});
  statusMessage(`Firebase 匯入完成：已新增／更新 ${result.written} 筆，${q.不變} 筆未變動，${plan.skipped.length} 筆來源錯誤／空白略過。`);
  plan=null;$('r12ImportFilter').classList.add('hidden');$('importPreview').classList.add('hidden');
 }catch(e){statusMessage(`匯入中止：${e.message}。請重新執行「預覽與驗證」以取得最新雲端差異。`,true);plan=null;}
 finally{uploadBusy=false;$('previewImport').disabled=false;updateCommit();}
}
function install(){
 installFilters();$('previewImport').onclick=preview;$('commitImport').onclick=commit;
 $('importFile').addEventListener('change',()=>{plan=null;updateCommit();$('r12ImportFilter').classList.add('hidden');$('importPreview').classList.add('hidden');statusMessage('檔案已變更，請重新執行「預覽與驗證」。');});
 const previous=core.applyCloud;
 core.applyCloud=function(part){previous(part);cloudVersion++;updateCommit();};
 updateCommit();
}
window.FeeImportR12UI={preview,prepare,validateRecord,getPlan:()=>plan};
install();
})();
