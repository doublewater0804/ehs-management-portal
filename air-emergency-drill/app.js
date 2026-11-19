import * as cloud from './cloud.js';
import {START_YEAR,INITIAL_SITES,recordKey,validYear,validDate,addDays,assess,todayTaipei,sortedSites,sortedUnits,proposedUnit,displayAssigned,summary,validateDrill,yearInventory,isYearClosed,hasFormalYearData,canRemoveYear,unitWasUsed} from './model.js';
import {exportXlsx,parseXlsx} from './excel.js';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const attrs=x=>esc(x);
const textOrDash=x=>x?esc(x):'—';
const currentYear=Math.max(START_YEAR,Number(todayTaipei().slice(0,4)));
let year=currentYear, tab='overview', authorized=false,unsub=null, authSeq=0,busy=false;
let data={sites:[],units:[],rotations:[],drills:[],years:[],yearNotes:[],globalNote:null,settings:{noticeDays:7,version:0},ready:false,fromCache:true};
let imported=[];
function notice(message,type=''){const e=$('toast');e.textContent=message;e.className=`notice ${type}`;e.hidden=!message;}
function connected(label,tone='muted'){$('cloud-status').textContent=label;$('cloud-status').className=`pill ${tone}`;}
const getSite=id=>data.sites.find(s=>s.id===id);
const recordOf=(y,siteId)=>data.drills.find(d=>d.id===recordKey(y,siteId));
const rotationOf=(y,siteId)=>data.rotations.find(d=>d.id===recordKey(y,siteId));
const siteRows=()=>sortedSites(data.sites).filter(site=>site.active!==false||!!recordOf(year,site.id)||!!rotationOf(year,site.id));
const days=()=>Number(data.settings?.noticeDays??7);
const allYears=()=>yearInventory(data.years,data.drills,data.rotations);
const currentYearInfo=(y=year)=>allYears().find(row=>row.year===Number(y));
const yearClosed=(y=year)=>isYearClosed(currentYearInfo(y));
const readOnly=()=>!authorized||!data.ready||data.fromCache;
function setupYears(){for(const id of ['selected-year','filter-year'])$(id).innerHTML=`<option value="${year}">${year} 年</option>`;}
function refreshYearSelect(){
 const entries=allYears().filter(row=>row.status!=='deleted');
 if(!entries.some(row=>row.year===year))year=entries.find(row=>row.year===currentYear)?.year||entries[0]?.year||START_YEAR;
 const options=entries.map(r=>`<option value="${r.year}">${r.year} 年${r.status==='archived'?'（封存）':''}</option>`).join('');
 for(const id of ['selected-year','filter-year']){$(id).innerHTML=options;$(id).value=String(year);$(id).disabled=!entries.length;}
}
function setTab(next){tab=next;document.querySelectorAll('#tabs [data-tab]').forEach(b=>{const yes=b.dataset.tab===next;b.classList.toggle('active',yes);b.setAttribute('aria-current',yes?'page':'false')});document.querySelectorAll('.tab-panel').forEach(p=>p.hidden=p.id!==`tab-${next}`);}
function render(){if(!authorized||!data.ready)return;
 refreshYearSelect();
 $('print-heading').textContent=`${year}年度｜空氣污染突發事故緊急應變演練管制總表`;
 const sites=sortedSites(data.sites),siteOptions=sites.map(s=>`<option value="${attrs(s.id)}">${esc(s.name)}${s.active===false?'（停用）':''}</option>`).join('');
 for(const id of ['filter-site']){const node=$(id),old=node.value;node.innerHTML=`<option value="">全部公私場所</option>${siteOptions}`;node.value=sites.some(s=>s.id===old)?old:'';}
 renderOverview();renderGlobalNote();renderRotation();renderYears();renderBasic();
 $('init-sites').hidden=INITIAL_SITES.every(s=>sites.some(v=>v.id===s.id));
}
// R0.2.3: one note shared across all years. The 2026 legacy note stays unchanged.
let globalNoteDraft=null,migrationStatus='pending',migrationError='';
const pendingDrillSites=(y=year)=>[...drillDrafts.keys()].filter(k=>k.startsWith(`${y}_`)).map(k=>k.slice(`${y}_`.length));
function hasUnsavedYearEdits(y=year){return pendingDrillSites(y).length>0;}
function renderGlobalNote(){
 const existing=data.globalNote,content=globalNoteDraft?globalNoteDraft.content:(existing?.content??'');
 const box=$('year-note-text');if(box.value!==content)box.value=content;
 const canEdit=!readOnly()&&migrationStatus==='done';
 box.disabled=!canEdit;
 $('year-note-save').disabled=!canEdit||!globalNoteDraft||busy;
 $('year-note-length').textContent=`${box.value.length} / 15000 字`;
 const label=$('year-note-save-status');
 label.textContent=migrationStatus==='failed'?`備註轉移失敗：${migrationError}`:
  migrationStatus!=='done'?'正在確認2026年度原始備註…':
  readOnly()?'連線待確認':globalNoteDraft?'尚未儲存':existing?'已載入共用備註':'尚無共用備註';
 label.className=`year-note-state ${migrationStatus==='failed'?'error':globalNoteDraft?'dirty':''}`;
 $('global-note-retry').hidden=migrationStatus!=='failed';
 $('year-note-print').textContent=content||'（無共用備註）';
}
async function initializeGlobalNote(){
 if(!authorized||!data.ready||data.fromCache||migrationStatus==='running'||migrationStatus==='done')return;
 if(data.globalNote){migrationStatus='done';migrationError='';renderGlobalNote();return;}
 const seq=authSeq;
 migrationStatus='running';migrationError='';renderGlobalNote();
 try{
  const result=await cloud.ensureGlobalNoteFrom2026();
  if(seq!==authSeq)return;
  migrationStatus='done';
  if(result.state==='copied'){
   const legacy=data.yearNotes.find(n=>Number(n.year)===2026);
   // Transaction has committed. Use the exact stored text while awaiting the listener.
   if(!data.globalNote&&legacy)data.globalNote={content:legacy.content??'',version:1};
   notice('2026 年度備註已複製為共用備註，原年度資料完整保留。','success');
  }
 }catch(e){if(seq!==authSeq)return;migrationStatus='failed';migrationError=e.message;notice(`共用備註轉移失敗：${e.message}`,'error');}
 finally{if(seq===authSeq)renderGlobalNote();}
}
async function saveGlobalNote(){
 if(readOnly()||migrationStatus!=='done'||busy){notice('共用備註尚未準備完成，請先確認雲端連線或重新執行轉移。','error');return false;}
 const draft=globalNoteDraft;if(!draft)return true;
 if(draft.content.length>15000){notice('共用備註不得超過15000字。','error');return false;}
 busy=true;
 try{
  await cloud.saveGlobalNote(draft.content,draft.baseVersion);
  data.globalNote={...(data.globalNote||{}),content:draft.content,version:draft.baseVersion+1};
  if(globalNoteDraft===draft)globalNoteDraft=null;
  notice('共用備註已成功儲存至 Firebase。','success');renderGlobalNote();return true;
 }catch(e){notice(`共用備註儲存失敗：${e.message}`,'error');return false;}
 finally{busy=false;renderGlobalNote();}
}
let pendingYear=null,pendingGoOverview=false,yearSwitchBusy=false;
function applyYearChange(next,goOverview=false){year=next;render();if(goOverview)setTab('overview');}
function requestYearChange(next,goOverview=false){
 next=Number(next);
 // Restore displayed selection until the year switch has been resolved.
 for(const id of ['selected-year','filter-year'])$(id).value=String(year);
 if(!validYear(next)||!allYears().some(row=>row.year===next&&row.status!=='deleted'))return;
 if(next===year){if(goOverview)setTab('overview');return;}
 if(!hasUnsavedYearEdits()){applyYearChange(next,goOverview);return;}
 pendingYear=next;pendingGoOverview=goOverview;
 const count=pendingDrillSites().length;
 $('year-switch-description').textContent=`${year} 年度有未儲存的演練資料 ${count} 筆，請先儲存、放棄變更，或取消切換。共用備註不受年度切換影響。`;
 $('year-switch-error').hidden=true;
 $('year-switch-dialog').showModal();
}
function closeYearSwitch(){if(yearSwitchBusy)return;$('year-switch-dialog').close();pendingYear=null;pendingGoOverview=false;}
function finishYearSwitch(){const n=pendingYear,go=pendingGoOverview;$('year-switch-dialog').close();pendingYear=null;pendingGoOverview=false;applyYearChange(n,go);}
async function savePendingYearEdits(){
 if(readOnly()||yearClosed()){throw Error('雲端尚未連線或年度已封存，無法儲存；請取消切換或選擇放棄。');}
 // Save each changed drill without discarding any other unsaved row on failure.
 for(const siteId of pendingDrillSites()){
  const ok=await saveInlineDrill(siteId);
  if(!ok)throw Error(`演練管制「${getSite(siteId)?.name||siteId}」儲存失敗，請確認畫面上方的錯誤訊息。`);
 }
}
function filteredYearRows(){
 const selected=$('filter-site').value,status=$('filter-status').value,q=$('filter-text').value.trim().toLowerCase();
 const field=$('filter-date-field').value,start=$('filter-from').value,end=$('filter-to').value;
 return siteRows().map(site=>{const record=recordOf(year,site.id),rotation=rotationOf(year,site.id),s=assess(record,todayTaipei(),days());const base=proposedUnit(site,data.units,year),assigned=displayAssigned(site,data.units,year,record,rotation);return {site,record,rotation,s,base,assigned};}).filter(x=>{
  const d=x.record?.[field]||'';
  return (!selected||selected===x.site.id)&&(!status||status===x.s.code)&&(!q||`${x.site.name} ${x.assigned.name} ${x.record?.refNumber||''} ${x.record?.authorityReplyNo||''}`.toLowerCase().includes(q))&&(!start||!!d&&d>=start)&&(!end||!!d&&d<=end);
 });
}
// Direct in-table editing; draft changes are never written until the row is explicitly saved.
const drillDrafts=new Map();
function rowDraftValues(item){
 const {record,rotation,base,assigned}=item;
 return {assignedUnitId:record?.assignedUnitId||rotation?.assignedUnitId||assigned.id||base.unit?.id||'',plannedDate:record?.plannedDate||'',actualDate:record?.actualDate||'',sentDate:record?.sentDate||'',refNumber:record?.refNumber||'',authorityReplyDate:record?.authorityReplyDate||'',authorityReplyNo:record?.authorityReplyNo||'',note:record?.note||'',changeReason:record?.changeReason||rotation?.changeReason||''};
}
function renderOverview(){
 const closed=yearClosed();
 $('year-alert').hidden=!closed;
 $('year-alert').textContent=closed?`${year} 年度已${currentYearInfo()?.status==='archived'?'封存':'刪除'}，目前僅供查詢；請至「基本資料管理 → 年度管理」復原後再修改。`:'';
 const stat=summary(data.sites,data.drills,year,todayTaipei(),days());
 $('kpis').innerHTML=[['應辦公私場所',stat.sites,'年度適用廠區'],['已完成演練',stat.drilled,'已記錄實際日期'],['已發文備查',stat.sent,'已記錄發文日期'],['尚待發文',stat.awaiting,'含尚未演練'],['備查逾期',stat.overdue,'演練後超過30日']].map((v,i)=>`<div class="kpi ${i===4?'alert':''}"><div class="value">${v[1]}</div><div class="label">${v[0]}</div><div class="foot">${v[2]}</div></div>`).join('');
 const rows=filteredYearRows();
 $('overview-rows').innerHTML=rows.length?rows.map(item=>{
  const {site,record,rotation,s,base,assigned}=item,key=recordKey(year,site.id),draft=drillDrafts.get(key);
  const v=draft?.values||rowDraftValues(item),editable=!closed&&!readOnly()&&site.active!==false&&Boolean(base.unit||record||rotation);
  const d=editable?'':'disabled',planned=record?.plannedDate||'',actual=record?.actualDate||'',sent=record?.sentDate||'',reply=record?.authorityReplyDate||'';
  const selection=sortedUnits(data.units,site.id,true).map(u=>`<option value="${attrs(u.id)}" ${u.id===v.assignedUnitId?'selected':''} ${u.active===false&&u.id!==v.assignedUnitId?'disabled':''}>${esc(u.name)}${u.active===false?'（停用）':''}</option>`).join('');
  const dateInput=(field,value,original,description)=>`<input class="inline-input compact-date" aria-label="${esc(site.name)}${description}" type="date" data-drill-field="${field}" value="${attrs(value)}" ${d}><span class="print-only">${textOrDash(original)}</span>`;
  return `<tr data-drill-site="${attrs(site.id)}" class="${draft?'has-unsaved-draft':''}">
    <td class="emph">${esc(site.name)}${site.active===false?' <small>（停用）</small>':''}</td>
    <td>${textOrDash(record?.originalUnitName||rotation?.originalUnitName||base.unit?.name)}</td>
    <td><div class="screen-only"><select class="inline-input unit-choice" data-drill-field="assignedUnitId" aria-label="${esc(site.name)}演練廠處" ${d}>${selection||'<option value="">待建檔</option>'}</select><details class="drill-extras"><summary>變更原因／備註</summary><label>變更原因<textarea data-drill-field="changeReason" maxlength="1500" placeholder="更換輪值廠處時必填" ${d}>${esc(v.changeReason)}</textarea></label><label>演練備註<textarea data-drill-field="note" maxlength="1500" ${d}>${esc(v.note)}</textarea></label></details></div><span class="print-only">${textOrDash(record?.assignedUnitName||rotation?.assignedUnitName||assigned.name)}</span>${!editable&&!record&&!rotation?`<small>${esc(base.message||'請先完成輪值建檔')}</small>`:''}</td>
    <td>${dateInput('plannedDate',v.plannedDate,planned,'預定演練')}</td>
    <td>${dateInput('actualDate',v.actualDate,actual,'實際演練')}</td>
    <td>${dateInput('sentDate',v.sentDate,sent,'發文日期')}</td>
    <td><input class="inline-input ref-input screen-only" type="text" data-drill-field="refNumber" aria-label="${esc(site.name)}發文字號" value="${attrs(v.refNumber)}" maxlength="100" placeholder="發文字號" ${d}><span class="print-only">${textOrDash(record?.refNumber)}</span></td>
    <td>${dateInput('authorityReplyDate',v.authorityReplyDate,reply,'備查日期')}</td>
    <td><input class="inline-input ref-input screen-only" type="text" data-drill-field="authorityReplyNo" aria-label="${esc(site.name)}備查文號" value="${attrs(v.authorityReplyNo)}" maxlength="100" placeholder="備查文號" ${d}><span class="print-only">${textOrDash(record?.authorityReplyNo)}</span></td>
    <td><span class="status ${s.tone}">${esc(s.label)}</span>${record?.sentDate?`<small class="reply-hint">${record?.authorityReplyDate&&record?.authorityReplyNo?'已登錄回函':record?.authorityReplyDate||record?.authorityReplyNo?'回函資料待補':'待環保局回函'}</small>`:''}${s.deadline?`<small class="deadline-hint">發文期限 ${esc(s.deadline)}</small>`:''}</td>
    <td class="no-print"><div class="row-actions"><button type="button" class="table-action" data-drill-save="${attrs(site.id)}" ${d}>儲存</button><button type="button" class="table-action muted" data-drill-cancel="${attrs(site.id)}" ${draft?'':'hidden'}>取消</button><small data-unsaved-indicator ${draft?'':'hidden'}>未儲存</small></div></td>
   </tr>`;
 }).join(''):`<tr><td colspan="11" class="empty">${data.sites.length?'目前篩選條件沒有紀錄。':'尚未建立公私場所，請至基本資料管理初始化。'}</td></tr>`;
}
async function saveInlineDrill(siteId){
 if(busy||readOnly()||yearClosed()){notice('年度已封存或尚未連線，不能儲存。','error');return false;}
 const site=getSite(siteId);if(!site){notice('找不到公私場所，請重新讀取資料。','error');return false;}
 const old=recordOf(year,siteId),rotation=rotationOf(year,siteId),base=proposedUnit(site,data.units,year);
 if(site.active===false||(!base.unit&&!old&&!rotation)){notice('此公私場所尚未完成演練廠處輪值建檔。','error');return false;}
 const key=recordKey(year,siteId),draft=drillDrafts.get(key);if(!draft){notice('尚未修改本列資料，請先輸入或修改欄位。');return false;}
 const v=draft?.values||rowDraftValues({record:old,rotation,base,assigned:displayAssigned(site,data.units,year,old,rotation)});
 const unit=data.units.find(u=>u.id===v.assignedUnitId&&u.siteId===siteId),originalUnitId=old?.originalUnitId||rotation?.originalUnitId||base.unit?.id||v.assignedUnitId;
 const originalUnit=data.units.find(u=>u.id===originalUnitId),reason=String(v.changeReason||'').trim();
 if(!unit){notice('請選擇有效的演練廠處。','error');return false;}
 if(v.assignedUnitId!==originalUnitId&&!reason){notice('變更原輪值廠處時，請展開「變更原因／備註」並填寫原因。','error');return false;}
 const row={id:key,siteId,siteName:old?.siteName||site.name,year,originalUnitId,originalUnitName:old?.originalUnitName||rotation?.originalUnitName||originalUnit?.name||'',assignedUnitId:unit.id,assignedUnitName:old?.assignedUnitId===unit.id&&old?.assignedUnitName?old.assignedUnitName:unit.name,changeReason:v.assignedUnitId!==originalUnitId?reason:'',plannedDate:v.plannedDate||'',actualDate:v.actualDate||'',sentDate:v.sentDate||'',refNumber:String(v.refNumber||'').trim(),authorityReplyDate:v.authorityReplyDate||'',authorityReplyNo:String(v.authorityReplyNo||'').trim(),note:String(v.note||'').trim()};
 try{validateDrill(row,site,data.units,old);if(String(row.refNumber).length>100)throw Error('發文字號最多100字。');}
 catch(e){notice(`資料驗證失敗：${e.message}`,'error');return false;}
 busy=true;
 try{await cloud.saveDrill(row,draft?.baseVersion??old?.version??0);drillDrafts.delete(key);notice(`${year} 年 ${site.name} 演練／備查資料已儲存至雲端。`,'success');renderOverview();return true;}
 catch(e){notice(`儲存失敗：${e.message}`,'error');return false;}
 finally{busy=false;}
}
function renderRotation(){
 const sites=sortedSites(data.sites).filter(s=>s.active!==false);
 $('rotation-head').innerHTML=`<tr><th>年度</th>${sites.map(s=>`<th>${esc(s.name)}</th>`).join('')}</tr>`;
 if(!sites.length){$('rotation-rows').innerHTML='<tr><td class="empty">請先建立公私場所</td></tr>';return;}
 const start=Math.max(START_YEAR,year-2),end=Math.min(2100,start+11);
 $('rotation-rows').innerHTML=Array.from({length:end-start+1},(_,i)=>start+i).map(y=>`<tr><td class="emph">${y}</td>${sites.map(site=>{
  const r=recordOf(y,site.id),rot=rotationOf(y,site.id),a=displayAssigned(site,data.units,y,r,rot);
  return `<td>${a.name?esc(a.name):`<small>${esc(a.message)}</small>`}${a.changed?' <small>（已調整）</small>':''}${r?.actualDate?'<br><small>已演練</small>':''}</td>`;}).join('')}</tr>`).join('');
}
function renderYears(){
 const years=allYears(),active=years.filter(x=>x.status!=='deleted'),deleted=years.filter(x=>x.status==='deleted');
 $('years-rows').innerHTML=active.map(entry=>{
  const rows=data.drills.filter(d=>Number(d.year)===entry.year),hasFormal=hasFormalYearData(entry.year,data.drills);
  const drilled=rows.filter(d=>d.actualDate).length,sent=rows.filter(d=>d.sentDate).length;
  return `<tr><td class="emph">${entry.year} 年</td><td><span class="year-status ${entry.status==='archived'?'archived':'active'}">${entry.status==='archived'?'已封存':'管理中'}${entry.implicit?'（沿用既有）':''}</span></td><td>${data.sites.filter(s=>s.active!==false).length}</td><td>${drilled} ／ ${sent}</td><td>${esc(entry.note||'—')}</td><td class="no-print"><button type="button" class="table-action" data-year-show="${entry.year}">管理演練</button><button type="button" class="table-action" data-year-edit="${entry.year}">編輯</button>${entry.status==='archived'?`<button type="button" class="table-action" data-year-restore="${entry.year}">解除封存</button>`:`<button type="button" class="table-action muted" data-year-archive="${entry.year}">封存</button>${hasFormal?'':`<button type="button" class="table-action danger" data-year-remove="${entry.year}">刪除</button>`}`}</td></tr>`;
 }).join('')||'<tr><td colspan="6" class="empty">尚無可用年度。</td></tr>';
 $('years-deleted').innerHTML=deleted.length?deleted.map(e=>`<div class="basic-item"><span>${e.year} 年（已刪除，資料未清除）</span><button type="button" class="table-action" data-year-restore="${e.year}">復原年度</button></div>`).join(''):'<p class="hint">目前沒有已刪除的年度。</p>';
}
// A single basic-data workspace: site, its units, an always-visible new-unit row.
let siteEditor=null,unitEditor=null;
const newUnitDrafts=new Map();
function nextUnitOrder(siteId){
 const used=new Set(data.units.filter(u=>u.siteId===siteId&&u.active!==false).map(u=>Number(u.order)));
 const highest=Math.max(0,...data.units.filter(u=>u.siteId===siteId).map(u=>Number(u.order)||0));
 if(highest<999&&!used.has(highest+1))return highest+1;
 for(let i=1;i<=999;i++)if(!used.has(i))return i;
 return 1;
}
const inlineField=(caption,key,value,kind='text',extra='',scope='site')=>`<label class="inline-label">${esc(caption)}<input data-${scope}-field="${key}" type="${kind}" value="${attrs(value??'')}" ${extra}></label>`;
function siteEditorFields(){
 const v=siteEditor.values;
 return `<div class="site-edit-fields">${inlineField('公私場所名稱 *','name',v.name,'text','maxlength="80" required')}${inlineField('代碼','code',v.code,'text','maxlength="30"')}${inlineField('顯示順序 *','order',v.order,'number','min="1" max="999" required')}${inlineField('預期輪值廠處數 *','expectedUnits',v.expectedUnits,'number','min="1" max="50" required')}${inlineField('輪值基準年度 *','rotationStartYear',v.rotationStartYear,'number','min="2026" max="2100" required')}<label class="inline-label">啟用<input data-site-field="active" type="checkbox" ${v.active!==false?'checked':''}></label><label class="inline-label wide-field">備註<textarea data-site-field="note" maxlength="1500">${esc(v.note||'')}</textarea></label></div><div class="inline-actions"><button class="btn primary" type="button" data-site-save>儲存公私場所</button><button class="btn ghost" type="button" data-site-cancel>取消</button></div>`;
}
function renderUnitRow(u,site){
 const editing=unitEditor?.id===u.id;
 if(editing){const v=unitEditor.values;
  return `<tr class="unit-edit-row"><td><input class="inline-input" type="number" min="1" max="999" data-unit-field="order" value="${attrs(v.order)}" aria-label="${esc(site.name)}編輯輪值順序"></td><td><input class="inline-input" type="text" maxlength="80" data-unit-field="name" value="${attrs(v.name)}" aria-label="編輯演練廠處名稱"><label class="inline-label note-label">備註<textarea data-unit-field="note" maxlength="1500">${esc(v.note||'')}</textarea></label></td><td><input class="inline-input" type="text" maxlength="30" data-unit-field="code" value="${attrs(v.code||'')}" aria-label="編輯廠處代碼"></td><td><input type="checkbox" data-unit-field="active" ${v.active!==false?'checked':''} aria-label="廠處啟用狀態"></td><td class="row-actions"><button type="button" class="table-action" data-unit-save="${attrs(u.id)}">儲存</button><button type="button" class="table-action muted" data-unit-cancel>取消</button></td></tr>`;
 }
 const used=unitWasUsed(u,data.drills,data.rotations);
 return `<tr><td>${Number(u.order)||'—'}</td><td><strong>${esc(u.name)}</strong>${u.note?`<small>${esc(u.note)}</small>`:''}</td><td>${esc(u.code||'—')}</td><td><span class="chip ${u.active===false?'off':''}">${u.active===false?'停用':'啟用'}</span></td><td class="row-actions"><button type="button" class="table-action" data-unit-edit="${attrs(u.id)}">編輯</button><button type="button" class="table-action muted" data-unit-toggle="${attrs(u.id)}">${u.active===false?'啟用':'停用'}</button><button type="button" class="table-action danger" data-unit-delete="${attrs(u.id)}" ${used?'disabled title="已有歷史引用，僅可停用"':''}>刪除</button></td></tr>`;
}
function renderBasic(){
 const sites=sortedSites(data.sites);
 const newSite=siteEditor?.isNew?`<div class="inline-site-editor"><h3>新增公私場所</h3>${siteEditorFields()}</div>`:'';
 const blocks=sites.map(s=>{
  const editSite=siteEditor?.id===s.id;
  const units=sortedUnits(data.units,s.id,true),draft=newUnitDrafts.get(s.id)||{order:nextUnitOrder(s.id),name:'',code:'',active:true};
  const disabled=readOnly()||s.active===false?'disabled':'';
  const unitRows=units.map(u=>renderUnitRow(u,s)).join('');
  return `<section class="site-block" data-site-group="${attrs(s.id)}"><div class="site-head"><div><h3>${esc(s.name)}</h3><p>代碼 ${esc(s.code||'未設定')} · 預設 ${Number(s.expectedUnits||1)} 個輪值廠處 · 場所順序 ${Number(s.order||0)}</p></div><div class="right"><span class="chip ${s.active===false?'off':''}">${s.active===false?'停用':'啟用'}</span>${!editSite?`<button type="button" class="table-action" data-site-edit="${attrs(s.id)}">編輯公私場所</button>`:''}</div></div>
  ${editSite?`<div class="inline-site-editor">${siteEditorFields()}</div>`:''}
  <div class="site-unit-heading"><h4>演練廠處與輪值順序</h4><span>${units.length} 筆（啟用 ${units.filter(u=>u.active!==false).length} 筆）</span></div>
  <div class="table-wrap"><table class="data-table site-units-table"><thead><tr><th>輪值順序</th><th>演練廠處名稱</th><th>代碼</th><th>狀態</th><th>管理</th></tr></thead><tbody>${unitRows}<tr class="unit-new-row" data-new-unit-site="${attrs(s.id)}"><td><input class="inline-input" data-new-unit-field="order" type="number" min="1" max="999" value="${attrs(draft.order)}" aria-label="${esc(s.name)}新增輪值順序" ${disabled}></td><td><input class="inline-input" data-new-unit-field="name" maxlength="80" value="${attrs(draft.name)}" placeholder="直接輸入新演練廠處" aria-label="${esc(s.name)}新增演練廠處名稱" ${disabled}></td><td><input class="inline-input" data-new-unit-field="code" maxlength="30" value="${attrs(draft.code)}" placeholder="選填" aria-label="新增廠處代碼" ${disabled}></td><td><input data-new-unit-field="active" type="checkbox" ${draft.active?'checked':''} aria-label="新廠處啟用" ${disabled}></td><td><button type="button" class="table-action" data-new-unit-save="${attrs(s.id)}" ${disabled}>＋新增並儲存</button></td></tr></tbody></table></div></section>`;
 }).join('');
 $('sites-list').innerHTML=newSite+blocks+(sites.length?'':'<div class="empty">尚無公私場所，請新增或初始化。</div>');
}
function startSiteEdit(id=null){
 if(readOnly()){notice('請確認 Firebase 已連線後再編輯。','error');return;}
 const old=id?getSite(id):null;
 siteEditor={id:old?.id||crypto.randomUUID(),isNew:!old,values:old?{...old}:{name:'',code:'',order:Math.max(0,...data.sites.map(s=>Number(s.order)||0))+1,expectedUnits:1,rotationStartYear:2026,active:true,note:'',rotationHint:''}};
 renderBasic();
 const form=$('sites-list').querySelector('[data-site-field="name"]');form?.focus();
}
function startUnitEdit(id){
 if(readOnly()){notice('請確認 Firebase 已連線後再編輯。','error');return;}
 const old=data.units.find(u=>u.id===id);if(!old)return;
 unitEditor={id,siteId:old.siteId,values:{...old}};renderBasic();
}
function validateUnitFields(v,siteId,id=''){
 const name=String(v.name||'').trim(),code=String(v.code||'').trim(),order=Number(v.order),active=v.active!==false;
 if(!name||name.length>80)throw Error('演練廠處名稱必填，最多80字。');
 if(code.length>30)throw Error('廠處代碼最多30字。');
 if(!Number.isInteger(order)||order<1||order>999)throw Error('輪值順序必須是1～999。');
 if(data.units.some(u=>u.id!==id&&u.siteId===siteId&&String(u.name||'').trim().toLocaleLowerCase()===name.toLocaleLowerCase()))throw Error(`「${name}」已存在於此公私場所。`);
 if(active&&data.units.some(u=>u.id!==id&&u.siteId===siteId&&u.active!==false&&Number(u.order)===order))throw Error(`輪值順序 ${order} 已被使用，請另選順序。`);
 return {name,code,order,active};
}
async function saveSiteInline(){
 if(readOnly()||busy||!siteEditor)return;
 const e=siteEditor,old=e.isNew?null:getSite(e.id),v=e.values,name=String(v.name||'').trim();
 if(!name||name.length>80){notice('公私場所名稱必填，最多80字。','error');return;}
 if(String(v.code||'').length>30||String(v.note||'').length>1500){notice('代碼或備註過長。','error');return;}
 if(data.sites.some(s=>s.id!==e.id&&s.name.trim().toLocaleLowerCase()===name.toLocaleLowerCase())){notice('公私場所名稱不可重複。','error');return;}
 const order=Number(v.order),expectedUnits=Number(v.expectedUnits),rotationStartYear=Number(v.rotationStartYear);
 if(!Number.isInteger(order)||order<1||order>999||!Number.isInteger(expectedUnits)||expectedUnits<1||expectedUnits>50||!validYear(rotationStartYear)){notice('順序、預期廠處數或基準年度超出範圍。','error');return;}
 const next={...(old||{id:e.id,rotationHint:''}),name,code:String(v.code||'').trim(),note:String(v.note||'').trim(),order,expectedUnits,rotationStartYear,active:v.active!==false};
 if(old&&!next.active&&data.drills.some(r=>r.siteId===old.id&&!r.actualDate)&&!confirm('此場所仍有未完成演練，停用後不納入新年度管制，確定繼續？'))return;
 busy=true;
 try{await cloud.saveSite(next,old?.version||0);siteEditor=null;renderBasic();notice(`公私場所「${name}」已儲存至雲端。`,'success');}
 catch(err){notice(`公私場所儲存失敗：${err.message}`,'error');}
 finally{busy=false;}
}
async function saveUnitInline(id){
 if(readOnly()||busy||unitEditor?.id!==id)return;
 const old=data.units.find(u=>u.id===id);if(!old){notice('廠處資料已不存在，請重新讀取。','error');return;}
 let fields;
 try{fields=validateUnitFields(unitEditor.values,old.siteId,id);}catch(e){notice(e.message,'error');return;}
 busy=true;
 try{await cloud.saveUnit({...old,...fields,note:String(unitEditor.values.note||'').trim()},old.version||0);unitEditor=null;renderBasic();notice('演練廠處修改已儲存。','success');}
 catch(e){notice('演練廠處儲存失敗：'+e.message,'error');}
 finally{busy=false;}
}
async function saveNewUnitInline(siteId){
 if(readOnly()||busy)return;
 const site=getSite(siteId);if(!site||site.active===false){notice('公私場所不存在或已停用。','error');return;}
 const draft=newUnitDrafts.get(siteId)||{name:'',code:'',order:nextUnitOrder(siteId),active:true};
 let fields;
 try{fields=validateUnitFields(draft,siteId);}catch(e){notice(e.message,'error');return;}
 busy=true;
 try{await cloud.saveUnit({id:crypto.randomUUID(),siteId,...fields,note:''},0);newUnitDrafts.delete(siteId);renderBasic();notice(`「${fields.name}」已新增至「${site.name}」。`,'success');}
 catch(e){notice('新增演練廠處失敗：'+e.message,'error');}
 finally{busy=false;}
}
function openForm(title,description,fields,onSubmit){
 $('edit-heading').textContent=title;$('edit-description').textContent=description;$('edit-fields').innerHTML=fields;
 $('edit-form').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;$('edit-save').disabled=true;
  try{if(await onSubmit(new FormData(e.target))===false)return;$('edit-dialog').close();notice('資料已成功儲存至 Firebase。','success');}
  catch(err){notice(`儲存失敗：${err.message}`,'error');}finally{busy=false;$('edit-save').disabled=false;}
 };
 $('edit-dialog').showModal();
}
const field=(label,name,value='',type='text',props='')=>`<label>${esc(label)}<input type="${type}" name="${name}" value="${attrs(value)}" ${props}></label>`;
const textarea=(label,name,value='')=>`<label class="wide">${esc(label)}<textarea name="${name}" maxlength="1500">${esc(value)}</textarea></label>`;
const check=(label,name,checked)=>`<label class="check"><input type="checkbox" name="${name}" ${checked?'checked':''}>${esc(label)}</label>`;
function showImport(){if(readOnly()){notice('請等待 Firebase 雲端連線確認後再匯入。','error');return;}imported=[];$('import-file').value='';$('import-result').innerHTML='<p>選擇由本系統匯出的 Excel，先預覽差異再選取需寫入的紀錄。</p>';$('import-apply').disabled=true;$('import-dialog').showModal();}
function stageImport(rows){
 const seen=new Set();imported=[];
 for(const row of rows){
  let error='',site=data.sites.find(s=>s.name===row.siteName),existing=null,base=null,unit=null;
  const y=Number(row.year),key=site&&recordKey(y,site.id);
  if(!site)error='公私場所不存在';else if(site.active===false)error='公私場所已停用';
  else if(!validYear(y))error='年度無效';
  else if(yearClosed(y))error='年度已封存或刪除，禁止匯入';
  else if(seen.has(key))error='Excel 出現重複年度及公私場所';
  if(key)seen.add(key);
  if(!error){
   existing=recordOf(y,site.id);base=proposedUnit(site,data.units,y);
   unit=sortedUnits(data.units,site.id,true).find(u=>u.name===row.assignedName);
   if(!unit)error='演練廠處未建檔';else if(unit.active===false&&existing?.assignedUnitId!==unit.id)error='廠處已停用';
   else if(!base.unit&&!existing)error='尚未建立完整輪值名單';
  }
  let obj;
  if(!error){
   const origin=existing?.originalUnitId||base.unit?.id||'',originalUnitName=existing?.originalUnitName||base.unit?.name||'';
   obj={id:key,year:y,siteId:site.id,siteName:site.name,originalUnitId:origin,originalUnitName,assignedUnitId:unit.id,assignedUnitName:unit.name,changeReason:row.changeReason||'',plannedDate:row.plannedDate,actualDate:row.actualDate,sentDate:row.sentDate,refNumber:row.refNumber,authorityReplyDate:row.authorityReplyDate===undefined?(existing?.authorityReplyDate||''):row.authorityReplyDate,authorityReplyNo:row.authorityReplyNo===undefined?(existing?.authorityReplyNo||''):row.authorityReplyNo,note:row.note};
   try{validateDrill(obj,site,data.units,existing);if(obj.assignedUnitId!==obj.originalUnitId&&!obj.changeReason)throw Error('調整輪值必須填原因');}
   catch(e){error=e.message;}
  }
  const equal=existing&&obj&&['assignedUnitId','plannedDate','actualDate','sentDate','refNumber','authorityReplyDate','authorityReplyNo','note','changeReason'].every(k=>String(existing[k]||'')===String(obj[k]||''));
  imported.push({row,error,obj,existing,status:error?'錯誤':equal?'相同':existing?'更新':'新增',selected:!error&&!equal&&!existing});
 }
 $('import-result').innerHTML=`<p>共 ${imported.length} 筆，新增 ${imported.filter(r=>r.status==='新增').length} 筆、更新 ${imported.filter(r=>r.status==='更新').length} 筆、相同 ${imported.filter(r=>r.status==='相同').length} 筆、錯誤 ${imported.filter(r=>r.status==='錯誤').length} 筆。為避免意外覆蓋，既有紀錄的「更新」預設不勾選。</p>`+
 `<div class="table-wrap"><table class="data-table"><thead><tr><th>套用</th><th>Excel 列</th><th>年度</th><th>公私場所</th><th>演練廠處</th><th>實際演練日期</th><th>發文日期</th><th>判定／錯誤</th></tr></thead><tbody>${imported.map((r,i)=>`<tr><td><input type="checkbox" aria-label="選取第${r.row.rowNo}列" data-import-index="${i}" ${r.selected?'checked':''} ${r.error||r.status==='相同'?'disabled':''}></td><td>${r.row.rowNo}</td><td>${esc(r.row.year)}</td><td>${esc(r.row.siteName)}</td><td>${esc(r.row.assignedName)}</td><td>${textOrDash(r.row.actualDate)}</td><td>${textOrDash(r.row.sentDate)}</td><td><span class="status ${r.error?'danger':r.status==='新增'?'good':'warn'}">${esc(r.error||r.status)}</span></td></tr>`).join('')}</tbody></table></div>`;
 $('import-apply').disabled=!imported.some(x=>x.selected);
}
async function applyImport(){if(busy||readOnly())return;const selected=imported.filter(r=>r.selected&&!r.error&&r.obj);if(!selected.length)return;
 if(!confirm(`確定將 ${selected.length} 筆新增／更新紀錄寫入正式 Firebase？此操作不會刪除未列於 Excel 的原有資料。`))return;
 busy=true;$('import-apply').disabled=true;let ok=0;
 try{
  for(const row of selected){try{if(yearClosed(row.obj.year))throw Error('年度已封存，禁止匯入');await cloud.saveDrill(row.obj,row.existing?.version||0);ok++;}
   catch(error){throw Error(`第 ${row.row.rowNo} 列失敗：${error.message}`);}}
  $('import-dialog').close();notice(`成功匯入 ${ok} 筆，資料已儲存至雲端。`,'success');
 }catch(e){notice(`已寫入 ${ok} 筆，後續匯入已中止：${e.message}`,'error');}
 finally{busy=false;$('import-apply').disabled=false;imported=[];}
}

// R0.2.1: retained R0.2 year register, legacy data remain readable without any migration or bulk write.
function editYear(n=null){
 if(readOnly()){notice('請先確認雲端已連線。','error');return;}
 const old=n===null?null:currentYearInfo(n), existing=old&&!old.implicit?old:null;
 const suggest=Math.min(2100,Math.max(START_YEAR,year+1));
 const initial=old?.year??suggest;
 openForm(old?'編輯年度設定':'新增年度','可編輯年度備註與查看年度演練；年度數字一經建立不可直接改名，避免錯置既有演練紀錄。',
 field('西元年度 *','year',initial,'number',`min="2026" max="2100" required ${old?'readonly':''}`)+textarea('年度備註','note',old?.note||''),async f=>{
  const y=Number(f.get('year')),note=String(f.get('note')||'').trim();
  if(!validYear(y))throw Error('年度僅限2026～2100。');
  const match=allYears().find(r=>r.year===y);
  if(!old&&match)throw Error('此年度已存在，請直接編輯，或到「已刪除」區復原。');
  if(old&&y!==old.year)throw Error('年度號碼不可直接變更。');
  await cloud.saveYear({year:y,status:old?.status||'active',note},existing?.version||0);
  if(!hasUnsavedYearEdits(year))year=y;
  return true;
 });
}
async function setYearStatus(n,status){
 if(readOnly()){notice('請等待 Firebase 雲端連線確認後操作。','error');return;}
 const row=currentYearInfo(n);if(!row){notice('找不到指定年度。','error');return;}
 if(Number(n)===year&&['deleted','archived'].includes(status)&&hasUnsavedYearEdits(year)){notice('此年度還有未儲存的演練紀錄，請先儲存或取消變更後再封存／刪除。','error');return;}
 if(status==='deleted'&&hasFormalYearData(n,data.drills)){notice('此年度已有正式演練或發文資料，只能封存。','error');return;}
 const prompt=status==='deleted'?`確定刪除 ${n} 年度？
此操作僅將年度移出清單，保留全部演練與輪值歷史資料，之後可復原。`:status==='archived'?`確定封存 ${n} 年？封存後僅能查詢，解除封存才能再修改。`:`確定恢復 ${n} 年度為管理中？`;
 if(!confirm(prompt))return;
 if(busy)return;busy=true;
 try{
  if(status==='deleted')await cloud.removeYear(n,row.implicit?0:row.version);
  else await cloud.saveYear({year:n,note:row.note||'',status},row.implicit?0:row.version);
  notice(`${n} 年度狀態已更新至雲端。`,'success');
 }catch(e){notice(`年度操作失敗：${e.message}`,'error');}
 finally{busy=false;}
}
async function toggleUnit(id){
 if(readOnly()||busy){notice('請等待雲端連線後操作。','error');return;}
 const u=data.units.find(row=>row.id===id);if(!u)return;
 const next=!u.active;
 if(next&&data.units.some(other=>other.id!==id&&other.siteId===u.siteId&&other.active!==false&&Number(other.order)===Number(u.order))){notice('無法啟用：所屬公私場所已有相同的啟用輪值順序，請先編輯順序。','error');return;}
 if(!confirm(`確定${next?'啟用':'停用'}「${u.name}」？歷史演練資料不會變動。`))return;
 busy=true;try{await cloud.saveUnit({...u,active:next},u.version||0);notice('廠處狀態已儲存至雲端。','success');}catch(e){notice(`操作失敗：${e.message}`,'error');}finally{busy=false;}
}
async function deleteUnit(id){
 if(readOnly()||busy){notice('請等待雲端連線後操作。','error');return;}
 const u=data.units.find(row=>row.id===id);if(!u)return;
 if(unitWasUsed(u,data.drills,data.rotations)){notice('此廠處已被演練或輪值引用，不可刪除，請改用停用。','error');return;}
 if(!confirm(`確定永久刪除未使用的演練廠處「${u.name}」？此操作無法復原，建議先備份。`))return;
 busy=true;try{await cloud.deleteUnusedUnit(u,u.version||0);notice('未使用的演練廠處已刪除。','success');}catch(e){notice('刪除失敗：'+e.message,'error');}finally{busy=false;}
}
$('tabs').addEventListener('click',e=>{const btn=e.target.closest('[data-tab]');if(btn)setTab(btn.dataset.tab);});
for(const id of ['selected-year','filter-year'])$(id).addEventListener('change',e=>requestYearChange(e.target.value));
$('year-note-text').addEventListener('input',e=>{
 const content=e.target.value,existing=data.globalNote;
 if(content===(existing?.content??''))globalNoteDraft=null;
 else globalNoteDraft={content,baseVersion:globalNoteDraft?.baseVersion??existing?.version??0};
 renderGlobalNote();
});
$('year-note-save').onclick=saveGlobalNote;
$('global-note-retry').onclick=()=>{migrationStatus='pending';initializeGlobalNote();};
$('year-switch-cancel').onclick=closeYearSwitch;
$('year-switch-dialog').addEventListener('cancel',e=>{if(yearSwitchBusy){e.preventDefault();return;}pendingYear=null;pendingGoOverview=false;});
$('year-switch-discard').onclick=()=>{
 if(yearSwitchBusy)return;
 for(const siteId of pendingDrillSites())drillDrafts.delete(recordKey(year,siteId));
 finishYearSwitch();
};
$('year-switch-save').onclick=async()=>{
 if(yearSwitchBusy)return;
 yearSwitchBusy=true;
 for(const id of ['year-switch-save','year-switch-discard','year-switch-cancel'])$(id).disabled=true;
 try{await savePendingYearEdits();finishYearSwitch();}
 catch(e){$('year-switch-error').textContent=e.message;$('year-switch-error').hidden=false;}
 finally{yearSwitchBusy=false;for(const id of ['year-switch-save','year-switch-discard','year-switch-cancel'])$(id).disabled=false;}
};
window.addEventListener('beforeunload',e=>{if(!hasUnsavedYearEdits()&&!globalNoteDraft)return;e.preventDefault();e.returnValue='';});
$('new-year').onclick=()=>editYear();
function handleYearClicks(e){
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.yearShow){requestYearChange(Number(b.dataset.yearShow),true);}
 else if(b.dataset.yearEdit)editYear(Number(b.dataset.yearEdit));
 else if(b.dataset.yearArchive)setYearStatus(Number(b.dataset.yearArchive),'archived');
 else if(b.dataset.yearRemove)setYearStatus(Number(b.dataset.yearRemove),'deleted');
 else if(b.dataset.yearRestore)setYearStatus(Number(b.dataset.yearRestore),'active');
}
$('years-rows').addEventListener('click',handleYearClicks);
$('years-deleted').addEventListener('click',handleYearClicks);
['filter-site','filter-status','filter-date-field','filter-from','filter-to'].forEach(id=>$(id).addEventListener('change',renderOverview));
$('filter-text').addEventListener('input',renderOverview);
$('overview-rows').addEventListener('input',e=>{
 const node=e.target.closest('[data-drill-field]'),row=e.target.closest('[data-drill-site]');if(!node||!row)return;
 const key=recordKey(year,row.dataset.drillSite),old=drillDrafts.get(key),site=getSite(row.dataset.drillSite);
 if(!site)return;
 const item={record:recordOf(year,site.id),rotation:rotationOf(year,site.id),base:proposedUnit(site,data.units,year),assigned:displayAssigned(site,data.units,year,recordOf(year,site.id),rotationOf(year,site.id))};
 const draft=old||{baseVersion:item.record?.version||0,values:rowDraftValues(item)};
 draft.values[node.dataset.drillField]=node.value;drillDrafts.set(key,draft);
 row.classList.add('has-unsaved-draft');
 const status=row.querySelector('[data-unsaved-indicator]');if(status)status.hidden=false;const cancel=row.querySelector('[data-drill-cancel]');if(cancel)cancel.hidden=false;
});
$('overview-rows').addEventListener('change',e=>{if(e.target.matches('[data-drill-field]'))e.target.dispatchEvent(new Event('input',{bubbles:true}));});
$('overview-rows').addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.drillSave)saveInlineDrill(b.dataset.drillSave);
 else if(b.dataset.drillCancel){drillDrafts.delete(recordKey(year,b.dataset.drillCancel));renderOverview();}
});
$('new-site').onclick=()=>startSiteEdit();
$('sites-list').addEventListener('input',e=>{
 const input=e.target,siteField=input.dataset.siteField,unitField=input.dataset.unitField,newUnitField=input.dataset.newUnitField;
 const value=input.type==='checkbox'?input.checked:input.value;
 if(siteField&&siteEditor){siteEditor.values[siteField]=value;return;}
 if(unitField&&unitEditor){unitEditor.values[unitField]=value;return;}
 if(newUnitField){const siteId=input.closest('[data-new-unit-site]')?.dataset.newUnitSite;if(!siteId)return;
  const draft=newUnitDrafts.get(siteId)||{order:nextUnitOrder(siteId),name:'',code:'',active:true};draft[newUnitField]=value;newUnitDrafts.set(siteId,draft);
 }
});
$('sites-list').addEventListener('change',e=>{if(e.target.matches('input[type="checkbox"][data-site-field],input[type="checkbox"][data-unit-field],input[type="checkbox"][data-new-unit-field]'))e.target.dispatchEvent(new Event('input',{bubbles:true}));});
$('sites-list').addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.hasAttribute('data-site-save'))saveSiteInline();
 else if(b.hasAttribute('data-site-cancel')){siteEditor=null;renderBasic();}
 else if(b.dataset.siteEdit)startSiteEdit(b.dataset.siteEdit);
 else if(b.dataset.unitEdit)startUnitEdit(b.dataset.unitEdit);
 else if(b.dataset.unitSave)saveUnitInline(b.dataset.unitSave);
 else if(b.hasAttribute('data-unit-cancel')){unitEditor=null;renderBasic();}
 else if(b.dataset.unitToggle)toggleUnit(b.dataset.unitToggle);
 else if(b.dataset.unitDelete)deleteUnit(b.dataset.unitDelete);
 else if(b.dataset.newUnitSave)saveNewUnitInline(b.dataset.newUnitSave);
});
$('init-sites').onclick=async()=>{if(busy||readOnly()){notice('Firebase 尚未連線，不能初始化。','error');return;}
 if(!confirm('確定將麥寮廠、海豐廠新增為公私場所基本資料？此操作不會新增演練廠處或歷史演練紀錄。'))return;
 busy=true;$('init-sites').disabled=true;try{await cloud.initializeSites();notice('公私場所初始化完成。請自行建立演練廠處及輪值順序。','success');}catch(e){notice('初始化失敗：'+e.message,'error');}finally{busy=false;$('init-sites').disabled=false;}
};
$('excel-export').onclick=async()=>{try{if(readOnly())throw Error('雲端資料尚未就緒。');await exportXlsx({...data,year,exportSiteIds:filteredYearRows().map(x=>x.site.id)});notice('Excel 已完成匯出。','success');}catch(e){notice('Excel 匯出失敗：'+e.message,'error');}};
$('excel-import').onclick=()=>showImport();
$('import-close').onclick=()=>$('import-dialog').close();
$('import-file').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{const rows=await parseXlsx(file);stageImport(rows);}catch(error){imported=[];$('import-result').textContent=`無法預覽 Excel：${error.message}`;$('import-apply').disabled=true;}};
$('import-result').addEventListener('change',e=>{const i=e.target.dataset.importIndex;if(i===undefined)return;imported[Number(i)].selected=e.target.checked;$('import-apply').disabled=!imported.some(x=>x.selected);});
$('import-apply').onclick=applyImport;
$('print').onclick=()=>{setTab('overview');window.print();};
$('edit-cancel').onclick=()=>$('edit-dialog').close();
$('login').onclick=async()=>{try{await cloud.login();}catch(e){notice('Google 登入未完成：'+e.message,'error');}};
$('logout').onclick=async()=>{try{await cloud.logout();}catch(e){notice('登出失敗：'+e.message,'error');}};
function begin(){
 setupYears();setTab('overview');connected('登入服務連接中…');
 cloud.observeAuth(user=>{
  const seq=++authSeq;if(unsub){unsub();unsub=null;}
  authorized=cloud.owner();drillDrafts.clear();globalNoteDraft=null;migrationStatus='pending';migrationError='';newUnitDrafts.clear();siteEditor=null;unitEditor=null;data={sites:[],units:[],rotations:[],drills:[],years:[],yearNotes:[],globalNote:null,settings:{noticeDays:7,version:0},ready:false,fromCache:true};
  $('user-name').textContent=user?.email||'';$('login').hidden=!!user;$('logout').hidden=!user;
  $('workspace').hidden=true;$('gate').hidden=false;
  if(!authorized){connected(user?'帳號未授權':'尚未登入',user?'danger':'muted');notice(user?'此 Google 帳號未獲授權，請改用管理員帳號。':'請按 Google 登入後使用系統。',user?'error':'');return;}
  connected('正在讀取 Firebase…','warn');notice('正在同步正式雲端資料…');
  unsub=cloud.watchAll(next=>{
   if(seq!==authSeq)return;data=next;
   if(!next.ready){connected('正在讀取資料…','warn');return;}
   $('workspace').hidden=false;$('gate').hidden=true;
   connected(next.fromCache?'快取資料／連線待確認':'雲端已連線',next.fromCache?'warn':'good');
   if(next.fromCache)notice('目前顯示快取，請確認網路恢復後再編輯。');else notice('');
   render();
   if(!next.fromCache&&migrationStatus==='pending')void initializeGlobalNote();
  },error=>{if(seq!==authSeq)return;connected('Firebase 連線失敗','danger');notice(`無法讀取雲端資料：${error.message}`,'error');$('workspace').hidden=true;$('gate').hidden=false;});
 });
}
begin();
