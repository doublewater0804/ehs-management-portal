import {startAuth,login,logout,loadAll,saveSupervisor,saveRecord,isAdmin,isDemo,getUser} from './data.js';
import {normalizeSupervisor,normalizeRecord,supervisorChanged,recordChanged} from './schema.js';
import {downloadExcel,previewImport} from './excel.js';
const $=id=>document.getElementById(id);
const H=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>new Date().toLocaleDateString('sv-SE');
const state={tab:'records',supervisors:[],records:[],history:[],busy:false,pending:null,editing:null,editingKind:'record'};
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
function showTab(tab){state.tab=tab;['records','supervisors','import'].forEach(x=>{
  $(x+'-view').hidden=x!==tab;
  const b=document.querySelector(`[data-tab="${x}"]`);b.classList.toggle('selected',x===tab);b.setAttribute('aria-selected',String(x===tab));
});if(tab==='records')renderRecords();if(tab==='supervisors')renderSupervisors();}
function render(){
  $('stats').innerHTML=`<div class="stat"><strong>${state.records.filter(r=>!r.archived).length}</strong><span>指示總筆數（未封存）</span></div><div class="stat"><strong>${state.supervisors.length}</strong><span>主管總數</span></div><div class="stat"><strong>${state.supervisors.filter(s=>s.active!==false).length}</strong><span>啟用主管</span></div>`;
  renderFilters();showTab(state.tab);
}
function supervisorName(id,rec){return rec?.supervisorSnapshot?.name||state.supervisors.find(s=>s.id===id)?.name||'已停用／未找到主管';}
function renderFilters(){
  const supervisor=$('filter-supervisor'),year=$('filter-year'),priorS=supervisor.value,priorY=year.value;
  supervisor.innerHTML='<option value="">全部主管</option>'+state.supervisors.slice().sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,'zh-TW')).map(s=>`<option value="${H(s.id)}">${H(s.name)}${s.active===false?'（停用）':''}</option>`).join('');
  supervisor.value=[...supervisor.options].some(o=>o.value===priorS)?priorS:'';
  const years=[...new Set(state.records.map(r=>r.date?.slice(0,4)).filter(Boolean))].sort().reverse();
  year.innerHTML='<option value="">全部年度</option>'+years.map(y=>`<option value="${H(y)}">${H(y)} 年</option>`).join('');year.value=years.includes(priorY)?priorY:'';
}
function filteredRecords(){
  const sup=$('filter-supervisor').value,yr=$('filter-year').value,from=$('filter-from').value,to=$('filter-to').value,
        status=$('filter-status').value.trim().toLocaleLowerCase(),keyword=$('filter-keyword').value.trim().toLocaleLowerCase(),archived=$('filter-archived').checked;
  return state.records.filter(r=>{
    if(!archived&&r.archived)return false;if(sup&&r.supervisorId!==sup)return false;
    if(yr&&!r.date.startsWith(yr))return false;if(from&&r.date<from)return false;if(to&&r.date>to)return false;
    if(status&&!String(r.status||'').toLocaleLowerCase().includes(status))return false;
    if(keyword&&!`${r.content} ${r.source} ${r.note} ${r.status} ${supervisorName(r.supervisorId,r)}`.toLocaleLowerCase().includes(keyword))return false;
    return true;
  });
}
function sortedSupervisors(){return state.supervisors.slice().sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,'zh-TW'));}
function renderRecords(){
  const records=filteredRecords();$('result-count').textContent=`目前篩選 ${records.length} 筆`;
  const grouped=new Map();const ordered=sortedSupervisors().map(s=>s.id);
  for(const r of records){if(!grouped.has(r.supervisorId))grouped.set(r.supervisorId,[]);grouped.get(r.supervisorId).push(r);}
  const keys=[...grouped.keys()].sort((a,b)=>{
    const aa=ordered.indexOf(a),bb=ordered.indexOf(b);return (aa<0?999999:aa)-(bb<0?999999:bb);
  });
  $('records-list').innerHTML=keys.length?keys.map(id=>{
    const supervisor=state.supervisors.find(s=>s.id===id),items=grouped.get(id).sort((a,b)=>b.date.localeCompare(a.date)||b.updatedAt.localeCompare(a.updatedAt));
    const name=supervisor?.name||items[0]?.supervisorSnapshot?.name||'未知主管';
    return `<section class="supervisor-group"><h3>${H(name)} <small>${items.length} 筆${supervisor?.active===false?' · 主管已停用':''}</small></h3><div class="record-grid">${items.map(r=>{
      return `<article class="record-card${r.archived?' archived':''}"><div class="record-head"><span class="date">${H(r.date)}</span>${r.status?`<span class="pill">${H(r.status)}</span>`:''}${r.archived?'<span class="pill muted">已封存</span>':''}</div><div class="record-content">${H(r.content)}</div>${r.source?`<div class="record-info"><b>依據來源</b><span>${H(r.source)}</span></div>`:''}${r.note?`<div class="record-info"><b>備註</b><span>${H(r.note)}</span></div>`:''}<div class="meta">${H(r.supervisorSnapshot?.title||'')}${r.supervisorSnapshot?.department?'／'+H(r.supervisorSnapshot.department):''} · 第 ${Number(r.version)||1} 版</div><div class="card-actions"><button type="button" class="outline tiny" data-action="edit-record" data-id="${H(r.id)}">修改</button><button type="button" class="outline tiny" data-action="history" data-id="${H(r.id)}">修改歷程</button><button type="button" class="outline tiny" data-action="archive" data-id="${H(r.id)}">${r.archived?'恢復':'封存'}</button></div></article>`;
    }).join('')}</div></section>`;
  }).join(''):'<p class="empty">目前沒有符合條件的主管指示紀錄。</p>';
}
function renderSupervisors(){
  const list=sortedSupervisors();
  $('supervisors-list').innerHTML=list.length?`<div class="table-wrap"><table><thead><tr><th>主管姓名</th><th>職稱</th><th>所屬單位</th><th>狀態</th><th>排序</th><th>管理</th></tr></thead><tbody>${list.map(s=>`<tr><td><strong>${H(s.name)}</strong></td><td>${H(s.title)}</td><td>${H(s.department)}</td><td>${s.active===false?'停用':'啟用'}</td><td>${H(s.order)}</td><td><button class="outline tiny" data-action="edit-supervisor" data-id="${H(s.id)}">編輯</button> <button class="outline tiny" data-action="toggle-supervisor" data-id="${H(s.id)}">${s.active===false?'啟用':'停用'}</button></td></tr>`).join('')}</tbody></table></div>`:'<p class="empty">尚未建立主管基本資料，請先新增主管。</p>';
}
function field(label,name,type,value='',required=false,extra=''){
  return `<label class="field"><span>${label}${required?' <em>*</em>':''}</span>${type==='textarea'?`<textarea name="${name}" ${required?'required':''} ${extra}>${H(value)}</textarea>`:`<input name="${name}" type="${type}" value="${H(value)}" ${required?'required':''} ${extra}>`}</label>`;
}
function openEdit(kind,id=''){
  const isSup=kind==='supervisor',old=isSup?state.supervisors.find(s=>s.id===id):state.records.find(r=>r.id===id);
  state.editing=old||null;state.editingKind=kind;$('edit-title').textContent=`${id?'修改':'新增'}${isSup?'主管基本資料':'指示事項'}`;$('edit-id').value=id;
  if(isSup){
    $('edit-fields').innerHTML=field('主管姓名','name','text',old?.name,true,'maxlength="100"')+
      field('職稱','title','text',old?.title,false,'maxlength="120"')+
      field('所屬單位','department','text',old?.department,false,'maxlength="160"')+
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
      field('狀態（可自行輸入）','status','text',old?.status,false,'maxlength="100"');
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
    }else{
      const r=normalizeRecord({...values,id,archived:old?.archived||false},state.supervisors,{existing:old});
      await saveRecord(r,state.supervisors,old?.version||0,'manual');
    }
    $('edit-dialog').close();await refresh();alertMsg('資料已儲存；指示內容修改已保留歷程。');
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
  const records=filteredRecords().sort((a,b)=>a.supervisorId.localeCompare(b.supervisorId)||b.date.localeCompare(a.date));
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
    $('import-preview').innerHTML=`<div class="import-summary">主管 ${plan.summary.supervisors} 筆，指示 ${plan.summary.records} 筆｜新增 ${plan.summary.new}｜修改 ${plan.summary.updated}｜無異動 ${Math.max(0,plan.summary.unchanged)}｜錯誤 ${plan.summary.failed}</div>${plan.errors.length?`<div class="import-errors"><b>以下資料不可匯入，請修正後重新選擇檔案：</b><ul>${plan.errors.slice(0,40).map(e=>`<li>${H(e)}</li>`).join('')}</ul>${plan.errors.length>40?'僅顯示前40筆':''}</div>`:''}${plan.changes.length?`<details><summary>預覽新增與修改項目（${plan.changes.length} 筆）</summary><ul>${plan.changes.slice(0,100).map(c=>`<li>${H(c.kind==='supervisor'?'主管基本資料':'主管指示紀錄')} 第${c.row}列：${H(c.op)} ${H(c.obj.name||c.obj.content.slice(0,55))}</li>`).join('')}</ul>${plan.changes.length>100?'僅顯示前100筆':''}</details>`:''}`;
    $('apply-import').hidden=!plan.changes.length;$('apply-import').disabled=!!plan.errors.length;
  }catch(e){fail(e);}
}
async function applyImport(){
  const plan=state.pending;if(!plan||plan.errors.length||!plan.changes.length)return;
  if(!confirm(`確定套用 ${plan.changes.length} 筆異動？新增／修改會寫入 Firestore，並對指示更新建立修改歷程。`))return;
  const success=[],failed=[];
  $('apply-import').disabled=true;
  // 先建立或更新主管，再處理指示，確保新主管ID可使用。
  for(const c of [...plan.changes.filter(x=>x.kind==='supervisor'),...plan.changes.filter(x=>x.kind==='record')]){
    try{
      if(c.kind==='supervisor'){
        const next=await saveSupervisor(c.obj,c.expected);
        const ix=state.supervisors.findIndex(x=>x.id===next.id);if(ix<0)state.supervisors.push(next);else state.supervisors[ix]=next;
      }else await saveRecord(c.obj,state.supervisors,c.expected,'excel-import');
      success.push(c);
    }catch(e){failed.push(`${c.kind==='supervisor'?'主管':'指示'}第${c.row}列：${e.message}`);}
  }
  state.pending=null;await refresh();
  $('import-preview').innerHTML=`<div class="import-summary">匯入完成：成功 ${success.length} 筆；失敗 ${failed.length} 筆。${failed.length?'成功項目已個別儲存，未自動回復。':''}</div>${failed.length?`<ul class="import-errors">${failed.map(x=>`<li>${H(x)}</li>`).join('')}</ul>`:''}`;
  $('apply-import').hidden=true;$('import-file').value='';alertMsg(`匯入成功 ${success.length} 筆，失敗 ${failed.length} 筆。`,!!failed.length);
}
$('login-btn').onclick=()=>login().catch(fail);$('logout-denied').onclick=()=>logout().catch(fail);$('logout-btn').onclick=()=>logout().catch(fail);
$('refresh-btn').onclick=refresh;$('add-record').onclick=()=>openEdit('record');$('add-supervisor').onclick=()=>openEdit('supervisor');
$('cancel-edit').onclick=()=>$('edit-dialog').close();$('edit-form').addEventListener('submit',submitEdit);
$('close-history').onclick=()=>$('history-dialog').close();
for(const button of document.querySelectorAll('[data-tab]'))button.onclick=()=>showTab(button.dataset.tab);
for(const name of ['filter-supervisor','filter-year','filter-from','filter-to','filter-status','filter-keyword','filter-archived'])
  $(name).addEventListener(name.startsWith('filter-')&&(name==='filter-keyword'||name==='filter-status')?'input':'change',renderRecords);
$('records-list').addEventListener('click',e=>{
  const btn=e.target.closest('[data-action]');if(!btn)return;
  if(btn.dataset.action==='edit-record')openEdit('record',btn.dataset.id);
  if(btn.dataset.action==='history')historyDetails(btn.dataset.id);
  if(btn.dataset.action==='archive')archiveRecord(btn.dataset.id);
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
