import {startAuth,login,logout,loadAll,saveSupervisor,saveRecord,saveStatusSettings,isAdmin,isDemo,getUser} from './data.js';
import {normalizeSupervisor,normalizeRecord,normalizeStatus,normalizeStatusList,sortStatusOptions,initialStatuses,ownId} from './schema.js';
import {downloadExcel,previewImport} from './excel.js';
const $=id=>document.getElementById(id);
const H=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>new Date().toLocaleDateString('sv-SE');
const state={tab:'records',supervisors:[],records:[],history:[],statusSettings:{items:initialStatuses(),version:0},busy:false,pending:null,editing:null,editingKind:'record'};
function alertMsg(message,error=false){$('notice').textContent=message;$('notice').className=error?'error-message':'success-message';$('notice').hidden=!message;}
function fail(e){console.error(e);alertMsg(e?.message||String(e),true);}
function buttonBusy(busy){state.busy=busy;document.querySelectorAll('button').forEach(b=>{if(b.dataset.tab)return;if(!b.classList.contains('outline')||b.id==='refresh-btn')b.disabled=busy;});}
function isLoggedIn(){return isAdmin();}
function authScreen(u){
  const good=isLoggedIn();$('workspace').hidden=!good;$('login-panel').hidden=good;
  $('account-label').textContent=good?(isDemo()?'DEMO 本機示範':u?.email||'已登入'):(u?.email?'目前帳號未獲授權':'未登入');
  $('logout-denied').hidden=!u;
  $('login-error').textContent=u&&!good?'目前登入帳號不符合單一管理員權限，或電子郵件尚未驗證。請登出並改用原管理員帳號。':'';
  $('demo-warning').hidden=!isDemo();
}
async function refresh(){
  if(!isLoggedIn())return;
  try{
    const data=await loadAll();Object.assign(state,data);render();
  }catch(e){fail(e);}
}
function showTab(tab){state.tab=tab;['records','supervisors','statuses','import'].forEach(x=>{
  $(x+'-view').hidden=x!==tab;
  const b=document.querySelector(`[data-tab="${x}"]`);b.classList.toggle('selected',x===tab);b.setAttribute('aria-selected',String(x===tab));
});if(tab==='records')renderRecords();if(tab==='supervisors')renderSupervisors();if(tab==='statuses')renderStatuses();}
function render(){
  $('stats').innerHTML=`<div class="stat"><strong>${state.records.filter(r=>!r.archived).length}</strong><span>指示總筆數（未封存）</span></div><div class="stat"><strong>${state.supervisors.length}</strong><span>主管總數</span></div><div class="stat"><strong>${state.supervisors.filter(s=>s.active!==false).length}</strong><span>啟用主管</span></div>`;
  renderFilters();showTab(state.tab);
}
function supervisorName(id,rec){
  const s=state.supervisors.find(x=>x.id===id);
  // 歷史指示採當時的主管姓名與職稱快照，避免主管升遷後改寫舊紀錄。
  const name=rec?.supervisorSnapshot?.name||s?.name||'已停用／未找到主管';
  const title=rec?.supervisorSnapshot?.title??s?.title??'';
  return name+(title?`（${title}）`:'');
}
function supervisorDisplay(s){return s.name+(s.title?`（${s.title}）`:'');}
function statuses(){return sortStatusOptions(state.statusSettings?.items||[]);}
function usedStatusNames(){return new Set(state.records.map(r=>String(r.status||'').trim()).filter(Boolean));}
function statusChoices(){return statuses().filter(s=>s.active!==false);}
function renderStatusRadios(old){
  const active=statusChoices(),saved=String(old?.status||'');
  if(!active.length){alertMsg('尚無啟用中的狀態，請先在「狀態基本資料」啟用或新增。',true);return null;}
  const matched=active.some(s=>s.name===saved);
  const selected=old?(matched?saved:saved):active[0].name;
  const obsolete=old&&!matched;
  return `<fieldset class="status-field"><legend>狀態 <em>*</em> <small>（單選，選項由狀態基本資料管理）</small></legend>
    ${active.map(s=>`<label class="radio-option"><input type="radio" name="status" value="${H(s.name)}" ${selected===s.name?'checked':''}><span>${H(s.name)}</span></label>`).join('')}
    ${obsolete?`<label class="radio-option legacy-status"><input type="radio" name="status" value="${H(saved)}" checked><span>保留原狀態：${H(saved||'未設定')}（舊狀態）</span></label>`:''}
  </fieldset>`;
}
function statusLabel(status){
  if(!status)return '<span class="status-pill muted">未設定</span>';
  const found=statuses().find(s=>s.name===status);
  return `<span class="status-pill${found?.active===false?' inactive-status':!found?' old-status':''}">${H(status)}</span>${!found?'<small class="legacy-label">舊狀態</small>':''}`;
}
function renderFilters(){
  const supervisor=$('filter-supervisor'),year=$('filter-year'),priorS=supervisor.value,priorY=year.value;
  supervisor.innerHTML='<option value="">全部主管</option>'+sortedSupervisors().map(s=>`<option value="${H(s.id)}">${H(supervisorDisplay(s))}${s.active===false?'（停用）':''}</option>`).join('');
  supervisor.value=[...supervisor.options].some(o=>o.value===priorS)?priorS:'';
  const years=[...new Set(state.records.map(r=>r.date?.slice(0,4)).filter(Boolean))].sort().reverse();
  year.innerHTML='<option value="">全部年度</option>'+years.map(y=>`<option value="${H(y)}">${H(y)} 年</option>`).join('');year.value=years.includes(priorY)?priorY:'';
  const status=$('filter-status'),oldStatus=status.value;
  const allNames=[...new Set([...statuses().map(s=>s.name),...state.records.map(r=>r.status||'').filter(Boolean)])];
  status.innerHTML='<option value="">全部狀態</option>'+allNames.map(name=>`<option value="${H(name)}">${H(name)}${statuses().some(s=>s.name===name)?'':'（舊狀態）'}</option>`).join('');
  status.value=allNames.includes(oldStatus)?oldStatus:'';
}
function filteredRecords(){
  const sup=$('filter-supervisor').value,yr=$('filter-year').value,from=$('filter-from').value,to=$('filter-to').value,
        status=$('filter-status').value,keyword=$('filter-keyword').value.trim().toLocaleLowerCase(),archived=$('filter-archived').checked;
  return state.records.filter(r=>{
    if(!archived&&r.archived)return false;if(sup&&r.supervisorId!==sup)return false;
    if(yr&&!r.date.startsWith(yr))return false;if(from&&r.date<from)return false;if(to&&r.date>to)return false;
    if(status&&String(r.status||'')!==status)return false;
    if(keyword&&!`${r.content} ${r.source} ${r.note} ${r.status} ${supervisorName(r.supervisorId,r)}`.toLocaleLowerCase().includes(keyword))return false;
    return true;
  });
}
function sortedSupervisors(){return state.supervisors.slice().sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,'zh-TW'));}
function sortByDate(a,b){
  const sign=$('sort-date').value==='old'?1:-1;
  return sign*(a.date.localeCompare(b.date)||(a.updatedAt||'').localeCompare(b.updatedAt||'')||a.id.localeCompare(b.id));
}
function renderRecords(){
  const records=filteredRecords();$('result-count').textContent=`目前篩選 ${records.length} 筆`;
  const grouped=new Map(),ordered=sortedSupervisors().map(s=>s.id);
  for(const r of records){if(!grouped.has(r.supervisorId))grouped.set(r.supervisorId,[]);grouped.get(r.supervisorId).push(r);}
  const keys=[...grouped.keys()].sort((a,b)=>{
    const aa=ordered.indexOf(a),bb=ordered.indexOf(b);return (aa<0?999999:aa)-(bb<0?999999:bb);
  });
  $('records-list').innerHTML=keys.length?keys.map(id=>{
    const supervisor=state.supervisors.find(s=>s.id===id),items=grouped.get(id).sort(sortByDate);
    const name=supervisor?supervisorDisplay(supervisor):supervisorName(id,items[0]);
    return `<section class="supervisor-group"><h3>${H(name)} <small>${items.length} 筆${supervisor?.active===false?' · 主管已停用':''}</small></h3>
      <div class="table-wrap record-table-wrap"><table class="records-table"><thead><tr>
        <th>指示日期</th><th>主管指示內容</th><th>依據來源</th><th>備註</th><th>狀態</th><th>最後修改</th><th>操作</th>
      </tr></thead><tbody>${items.map(r=>`<tr class="${r.archived?'archived-row':''}">
        <td class="record-date">${H(r.date)}${r.archived?'<div><span class="status-pill muted">已封存</span></div>':''}</td>
        <td class="record-cell content-cell">${H(r.content)}</td>
        <td class="record-cell">${H(r.source||'—')}</td>
        <td class="record-cell">${H(r.note||'—')}</td>
        <td>${statusLabel(r.status)}</td>
        <td class="updated-cell">${H((r.updatedAt||'').slice(0,10)||'—')}<small>第 ${H(r.version||1)} 版</small></td>
        <td class="table-actions"><button type="button" class="outline tiny" data-action="edit-record" data-id="${H(r.id)}">修改</button><button type="button" class="outline tiny" data-action="history" data-id="${H(r.id)}">歷程</button><button type="button" class="outline tiny" data-action="archive" data-id="${H(r.id)}">${r.archived?'恢復':'封存'}</button></td>
      </tr>`).join('')}</tbody></table></div></section>`;
  }).join(''):'<p class="empty">目前沒有符合條件的主管指示紀錄。</p>';
}

function renderSupervisors(){
  const list=sortedSupervisors();
  $('supervisors-list').innerHTML=list.length?`<div class="table-wrap"><table><thead><tr><th>主管姓名</th><th>職稱</th><th>所屬單位</th><th>狀態</th><th>排序</th><th>管理</th></tr></thead><tbody>${list.map(s=>`<tr><td><strong>${H(s.name)}</strong></td><td>${H(s.title)}</td><td>${H(s.department)}</td><td>${s.active===false?'停用':'啟用'}</td><td>${H(s.order)}</td><td><button class="outline tiny" data-action="edit-supervisor" data-id="${H(s.id)}">編輯</button> <button class="outline tiny" data-action="toggle-supervisor" data-id="${H(s.id)}">${s.active===false?'啟用':'停用'}</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="empty">尚未建立主管基本資料，請先新增主管。</p>';
}
function renderStatuses(){
  const list=statuses(),used=usedStatusNames();
  $('statuses-list').innerHTML=list.length?`<div class="table-wrap"><table class="status-table"><thead><tr><th>排序</th><th>狀態名稱</th><th>說明</th><th>啟用狀態</th><th>使用情況</th><th>操作</th></tr></thead><tbody>${list.map(item=>`<tr>
    <td>${H(item.order)}</td><td><strong>${H(item.name)}</strong></td><td>${H(item.description||'—')}</td><td>${item.active?'啟用':'停用'}</td>
    <td>${used.has(item.name)?'已有指示使用':'尚未使用'}</td><td class="table-actions">
    <button type="button" class="outline tiny" data-action="edit-status" data-id="${H(item.id)}">編輯</button>
    <button type="button" class="outline tiny" data-action="toggle-status" data-id="${H(item.id)}">${item.active?'停用':'啟用'}</button>
    <button type="button" class="outline tiny danger" data-action="delete-status" data-id="${H(item.id)}" ${used.has(item.name)?'disabled title="已有指示使用，不可刪除"':''}>刪除</button>
    </td></tr>`).join('')}</tbody></table></div>`:'<p class="empty">尚無狀態選項，請新增狀態。</p>';
}
async function writeStatuses(next){
  const saved=await saveStatusSettings(next,state.statusSettings?.version||0);
  state.statusSettings=saved;renderFilters();renderStatuses();renderRecords();
}
async function toggleStatus(id){
  const item=statuses().find(s=>s.id===id);if(!item)return;
  if(!confirm(`確定${item.active?'停用':'啟用'}狀態「${item.name}」？已存在的指示內容不會改變。`))return;
  try{await writeStatuses(statuses().map(s=>s.id===id?{...s,active:!s.active}:s));alertMsg('狀態設定已更新。');}catch(e){fail(e);}
}
async function deleteStatus(id){
  const item=statuses().find(s=>s.id===id);if(!item)return;
  try{
    // 刪除前重新取得雲端所有指示，包含封存項目，避免舊畫面判定沒有使用。
    const latest=await loadAll();Object.assign(state,latest);
    if(usedStatusNames().has(item.name)){render();alertMsg('此狀態已有指示使用，禁止刪除。請改為停用，歷史資料會保留。',true);return;}
    if(!confirm(`確定永久刪除未使用狀態「${item.name}」？`))return;
    await writeStatuses(statuses().filter(s=>s.id!==id));alertMsg('未使用狀態已刪除。');
  }catch(e){fail(e);}
}
function field(label,name,type,value='',required=false,extra=''){
  return `<label class="field"><span>${label}${required?' <em>*</em>':''}</span>${type==='textarea'?`<textarea name="${name}" ${required?'required':''} ${extra}>${H(value)}</textarea>`:`<input name="${name}" type="${type}" value="${H(value)}" ${required?'required':''} ${extra}>`}</label>`;
}
function openEdit(kind,id=''){
  const isSup=kind==='supervisor',isStatus=kind==='status',old=isSup?state.supervisors.find(s=>s.id===id):isStatus?statuses().find(s=>s.id===id):state.records.find(r=>r.id===id);
  state.editing=old||null;state.editingKind=kind;$('edit-title').textContent=`${id?'修改':'新增'}${isSup?'主管基本資料':isStatus?'狀態基本資料':'指示事項'}`;$('edit-id').value=id;
  if(isSup){
    $('edit-fields').innerHTML=field('主管姓名','name','text',old?.name,true,'maxlength="100"')+
      field('職稱','title','text',old?.title,false,'maxlength="120"')+
      field('所屬單位','department','text',old?.department,false,'maxlength="160"')+
      field('顯示順序','order','number',old?.order??100,true,'min="0" max="99999" step="1"')+
      `<label class="field"><span>啟用狀態</span><select name="active"><option value="true" ${old?.active===false?'':'selected'}>啟用</option><option value="false" ${old?.active===false?'selected':''}>停用</option></select></label>`;
  }else if(isStatus){
    $('edit-fields').innerHTML=field('狀態名稱','name','text',old?.name,true,'maxlength="100"')+
      field('狀態說明','description','textarea',old?.description,false,'maxlength="200" rows="2"')+
      field('顯示順序','order','number',old?.order??100,true,'min="0" max="99999" step="1"')+
      `<label class="field"><span>啟用狀態</span><select name="active"><option value="true" ${old?.active===false?'':'selected'}>啟用</option><option value="false" ${old?.active===false?'selected':''}>停用</option></select></label>`;
  }else{
    const options=sortedSupervisors().filter(s=>s.active!==false||s.id===old?.supervisorId).map(s=>`<option value="${H(s.id)}" ${s.id===old?.supervisorId?'selected':''}>${H(s.name)}${s.title?'（'+H(s.title)+'）':''}</option>`).join('');
    if(!options){alertMsg('請先建立並啟用至少一位主管。',true);showTab('supervisors');return;}
    $('edit-fields').innerHTML=field('指示日期','date','date',old?.date||today(),true)+
      `<label class="field"><span>交辦主管 <em>*</em></span><select name="supervisorId" required>${options}</select></label>`+
      field('主管指示內容','content','textarea',old?.content,true,'maxlength="12000" rows="5"')+
      field('依據來源（可填多項，支援換行）','source','textarea',old?.source,false,'maxlength="6000" rows="3" placeholder="例如：主管會議、電話、LINE、公文文號"')+
      field('備註','note','textarea',old?.note,false,'maxlength="12000" rows="3"')+
      renderStatusRadios(old);
    if(!$('edit-fields').innerHTML.includes('name="status"')){showTab('statuses');return;}
  }
  $('edit-dialog').showModal();
}
async function submitEdit(event){
  event.preventDefault();if(!isLoggedIn()||state.busy)return;
  const form=event.currentTarget,values=Object.fromEntries(new FormData(form)),id=$('edit-id').value;
  const old=state.editing;
  try{
    buttonBusy(true);
    if(state.editingKind==='supervisor'){
      const s=normalizeSupervisor({...values,id,active:values.active==='true'});
      await saveSupervisor(s,old?.version||0);
    }else if(state.editingKind==='status'){
      const item=normalizeStatus({...values,id:id||ownId(),active:values.active==='true'});
      // 更名不回寫歷史：舊字串仍原樣留在指示紀錄，查詢會標為「舊狀態」。
      const next=state.statusSettings.items.filter(s=>s.id!==item.id).concat(item);
      normalizeStatusList(next);await writeStatuses(next);
    }else{
      const match=statusChoices().some(s=>s.name===values.status);
      if(!match && !(old && String(old.status||'')===String(values.status||''))){
        throw Error('請選擇狀態基本資料中的啟用狀態；舊狀態僅能原樣保留，不能新建。');
      }
      const r=normalizeRecord({...values,id,archived:old?.archived||false},state.supervisors,{existing:old});
      await saveRecord(r,state.supervisors,old?.version||0,'manual');
    }
    $('edit-dialog').close();await refresh();alertMsg(state.editingKind==='record'?'指示事項已儲存，完整修改歷程已保留。':'基本資料已儲存。');
  }catch(e){fail(e);}finally{buttonBusy(false);}
}
async function toggleSupervisor(id){
  const s=state.supervisors.find(x=>x.id===id);if(!s)return;
  if(!confirm(`確定${s.active===false?'啟用':'停用'}主管「${s.name}」？歷史指示紀錄不會刪除。`))return;
  try{await saveSupervisor({...s,active:s.active===false},s.version);await refresh();alertMsg('主管狀態已更新。');}catch(e){fail(e);}
}
async function archiveRecord(id){
  const r=state.records.find(x=>x.id===id);if(!r)return;
  if(!confirm(`確定${r.archived?'恢復':'封存'}這筆主管指示？所有版本歷程仍會保存。`))return;
  try{await saveRecord({...r,archived:!r.archived},state.supervisors,r.version,r.archived?'restore':'archive');await refresh();alertMsg('紀錄狀態已更新並保留修改歷程。');}catch(e){fail(e);}
}
const diffNames={date:'指示日期',supervisorId:'主管ID',content:'指示內容',source:'依據來源',note:'備註',status:'狀態',archived:'封存'};
function historyDetails(id){
  const r=state.records.find(x=>x.id===id);if(!r)return;
  const hs=state.history.filter(x=>x.recordId===id).sort((a,b)=>b.version-a.version);
  $('history-title').textContent=`修改歷程｜${r.supervisorSnapshot?.name||''}｜${r.date}`;
  $('history-content').innerHTML=hs.length?hs.map(item=>{
    const before=item.before,after=item.after||{},changes=Object.entries(diffNames).filter(([key])=>!before||before[key]!==after[key]);
    return `<section class="history-item"><h3>第 ${H(item.version)} 版 <small>${H(item.action||'manual')}｜${H(item.changedAt||'')}｜${H(item.actor||'')}</small></h3>${changes.map(([key,label])=>`<div class="hist-field"><b>${label}</b>${before?`<div><span>修改前</span><pre>${H(typeof before[key]==='boolean'?(before[key]?'是':'否'):before[key]??'')}</pre></div>`:''}<div><span>${before?'修改後':'建立內容'}</span><pre>${H(typeof after[key]==='boolean'?(after[key]?'是':'否'):after[key]??'')}</pre></div></div>`).join('')}${!changes.length?'<p>內容未變更</p>':''}</section>`;
  }).join(''):'<p>查無修改歷程（請檢查資料是否完整）。</p>';
  $('history-dialog').showModal();
}
function printRecords(mode){
  const ordered=sortedSupervisors().map(s=>s.id);
  const records=filteredRecords().sort((a,b)=>ordered.indexOf(a.supervisorId)-ordered.indexOf(b.supervisorId)||sortByDate(a,b));
  if(!records.length){alertMsg('目前沒有可輸出的紀錄。',true);return;}
  const w=window.open('','_blank');if(!w){alertMsg('瀏覽器阻擋列印視窗，請允許彈出式視窗。',true);return;}
  const generated=new Date().toLocaleString('zh-TW');
  const body=records.map((r,i)=>`<tr><td>${i+1}</td><td>${H(r.date)}</td><td>${H(supervisorName(r.supervisorId,r))}</td><td>${H(r.content)}</td><td>${H(r.source)}</td><td>${H(r.note)}</td><td>${H(r.status)}</td></tr>`).join('');
  w.document.open();w.document.write(`<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>主管交辦布告欄－列印</title><style>body{font-family:"Microsoft JhengHei",sans-serif;color:#172f44;margin:18mm}h1{font-size:21px}p{font-size:12px}table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:11px}th,td{border:1px solid #91a6b0;padding:6px;white-space:pre-wrap;overflow-wrap:anywhere;vertical-align:top}th{background:#e6f3f5}thead{display:table-header-group}tr{break-inside:avoid}@page{size:A4 landscape;margin:12mm}</style></head><body><h1>主管交辦布告欄</h1><p>輸出時間：${H(generated)}｜筆數：${records.length}${mode==='pdf'?'｜若需PDF，請在列印視窗選擇「另存為 PDF」。':''}</p><table><thead><tr><th style="width:28px">序</th><th style="width:76px">日期</th><th style="width:70px">主管</th><th>指示內容</th><th>依據來源</th><th>備註</th><th style="width:55px">狀態</th></tr></thead><tbody>${body}</tbody></table></body></html>`);w.document.close();w.focus();setTimeout(()=>w.print(),450);
}
async function chooseImportFile(file){
  state.pending=null;$('apply-import').hidden=true;$('apply-import').disabled=true;$('import-preview').textContent='';
  if(!file)return;
  try{
    const plan=await previewImport(file,state);state.pending=plan;
    $('import-preview').innerHTML=`<div class="import-summary">主管 ${plan.summary.supervisors} 筆，狀態 ${plan.summary.statuses||0} 筆，指示 ${plan.summary.records} 筆｜新增 ${plan.summary.new}｜修改 ${plan.summary.updated}｜無異動 ${Math.max(0,plan.summary.unchanged)}｜錯誤 ${plan.summary.failed}</div>${plan.errors.length?`<div class="import-errors"><b>以下資料不可匯入，請修正後重新選擇檔案：</b><ul>${plan.errors.slice(0,40).map(e=>`<li>${H(e)}</li>`).join('')}</ul>${plan.errors.length>40?'僅顯示前40筆':''}</div>`:''}${plan.changes.length?`<details><summary>預覽新增與修改項目（${plan.changes.length} 筆）</summary><ul>${plan.changes.slice(0,100).map(c=>`<li>${H(c.kind==='supervisor'?'主管基本資料':c.kind==='status'?'狀態基本資料':'主管指示紀錄')} 第${c.row}列：${H(c.op)} ${H(c.obj.name||(c.obj.content||'').slice(0,55))}</li>`).join('')}</ul>${plan.changes.length>100?'僅顯示前100筆':''}</details>`:''}`;
    $('apply-import').hidden=!plan.changes.length;$('apply-import').disabled=!!plan.errors.length;
  }catch(e){fail(e);}
}
async function applyImport(){
  const plan=state.pending;if(!plan||plan.errors.length||!plan.changes.length)return;
  if(!confirm(`確定套用 ${plan.changes.length} 筆異動？新增／修改會寫入 Firestore，並對指示更新建立修改歷程。`))return;
  const success=[],failed=[];
  $('apply-import').disabled=true;
  // 依序套用主管、狀態及指示；狀態不合法時停止該列，不改寫既有指示。
  for(const c of [...plan.changes.filter(x=>x.kind==='supervisor'),...plan.changes.filter(x=>x.kind==='status'),...plan.changes.filter(x=>x.kind==='record')]){
    try{
      if(c.kind==='supervisor'){
        const next=await saveSupervisor(c.obj,c.expected);
        const ix=state.supervisors.findIndex(x=>x.id===next.id);if(ix<0)state.supervisors.push(next);else state.supervisors[ix]=next;
      }else if(c.kind==='status'){
        const next=state.statusSettings.items.filter(s=>s.id!==c.obj.id).concat(c.obj);
        await writeStatuses(next);
      }else await saveRecord(c.obj,state.supervisors,c.expected,'excel-import');
      success.push(c);
    }catch(e){failed.push(`${c.kind==='supervisor'?'主管':c.kind==='status'?'狀態':'指示'}第${c.row}列：${e.message}`);}
  }
  state.pending=null;await refresh();
  $('import-preview').innerHTML=`<div class="import-summary">匯入完成：成功 ${success.length} 筆；失敗 ${failed.length} 筆。${failed.length?'成功項目已個別儲存，未自動回復。':''}</div>${failed.length?`<ul class="import-errors">${failed.map(x=>`<li>${H(x)}</li>`).join('')}</ul>`:''}`;
  $('apply-import').hidden=true;$('import-file').value='';alertMsg(`匯入成功 ${success.length} 筆，失敗 ${failed.length} 筆。`,!!failed.length);
}
$('login-btn').onclick=()=>login().catch(fail);$('logout-denied').onclick=()=>logout().catch(fail);$('logout-btn').onclick=()=>logout().catch(fail);
$('refresh-btn').onclick=refresh;$('add-record').onclick=()=>openEdit('record');$('add-supervisor').onclick=()=>openEdit('supervisor');$('add-status').onclick=()=>openEdit('status');
$('cancel-edit').onclick=()=>$('edit-dialog').close();$('edit-form').addEventListener('submit',submitEdit);
$('close-history').onclick=()=>$('history-dialog').close();
for(const button of document.querySelectorAll('[data-tab]'))button.onclick=()=>showTab(button.dataset.tab);
for(const name of ['filter-supervisor','filter-year','filter-from','filter-to','filter-status','filter-keyword','filter-archived','sort-date'])
  $(name).addEventListener(name.startsWith('filter-')&&(name==='filter-keyword'||name==='filter-status')?'input':'change',renderRecords);
$('records-list').addEventListener('click',e=>{
  const btn=e.target.closest('[data-action]');if(!btn)return;
  if(btn.dataset.action==='edit-record')openEdit('record',btn.dataset.id);
  if(btn.dataset.action==='history')historyDetails(btn.dataset.id);
  if(btn.dataset.action==='archive')archiveRecord(btn.dataset.id);
});
$('statuses-list').addEventListener('click',e=>{
  const btn=e.target.closest('[data-action]');if(!btn)return;
  if(btn.dataset.action==='edit-status')openEdit('status',btn.dataset.id);
  if(btn.dataset.action==='toggle-status')toggleStatus(btn.dataset.id);
  if(btn.dataset.action==='delete-status')deleteStatus(btn.dataset.id);
});
$('supervisors-list').addEventListener('click',e=>{
  const btn=e.target.closest('[data-action]');if(!btn)return;
  if(btn.dataset.action==='edit-supervisor')openEdit('supervisor',btn.dataset.id);
  if(btn.dataset.action==='toggle-supervisor')toggleSupervisor(btn.dataset.id);
});
$('export-pdf').onclick=()=>printRecords('pdf');$('print-records').onclick=()=>printRecords('print');
$('export-xlsx').onclick=async()=>{try{await downloadExcel(state);}catch(e){fail(e);}};
$('import-file').onchange=e=>chooseImportFile(e.target.files[0]);$('apply-import').onclick=applyImport;
$('notice').hidden=true;
startAuth(async u=>{authScreen(u);if(isLoggedIn()){await refresh();}else {Object.assign(state,{supervisors:[],records:[],history:[]});}}).catch(e=>{$('login-panel').hidden=false;$('account-label').textContent='連線失敗';$('login-error').textContent=`Firebase 初始化失敗：${e.message}`;fail(e);});
