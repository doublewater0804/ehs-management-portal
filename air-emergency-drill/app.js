import * as cloud from './cloud.js';
import {START_YEAR,INITIAL_SITES,recordKey,validYear,validDate,addDays,assess,todayTaipei,sortedSites,sortedUnits,proposedUnit,displayAssigned,summary,validateDrill,yearInventory,isYearClosed,hasFormalYearData,canRemoveYear,unitWasUsed,validateBatchUnits} from './model.js';
import {exportXlsx,parseXlsx} from './excel.js';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const attrs=x=>esc(x);
const textOrDash=x=>x?esc(x):'—';
const currentYear=Math.max(START_YEAR,Number(todayTaipei().slice(0,4)));
let year=currentYear, tab='overview', authorized=false,unsub=null, authSeq=0,busy=false;
let data={sites:[],units:[],rotations:[],drills:[],years:[],settings:{noticeDays:7,version:0},ready:false,fromCache:true};
let imported=[];
let bulkRows=[];
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
function setupYears(){$('selected-year').innerHTML=`<option value="${year}">${year} 年</option>`;}
function refreshYearSelect(){
 const entries=allYears().filter(row=>row.status!=='deleted');
 if(!entries.some(row=>row.year===year))year=entries.find(row=>row.year===currentYear)?.year||entries[0]?.year||START_YEAR;
 $('selected-year').innerHTML=entries.map(r=>`<option value="${r.year}">${r.year} 年${r.status==='archived'?'（封存）':''}</option>`).join('');
 $('selected-year').value=String(year);
 $('selected-year').disabled=!entries.length;
}
function setTab(next){tab=next;document.querySelectorAll('#tabs [data-tab]').forEach(b=>{const yes=b.dataset.tab===next;b.classList.toggle('active',yes);b.setAttribute('aria-current',yes?'page':'false')});document.querySelectorAll('.tab-panel').forEach(p=>p.hidden=p.id!==`tab-${next}`);}
function render(){if(!authorized||!data.ready)return;
 refreshYearSelect();
 $('print-heading').textContent=`${year}年度｜空氣污染突發事故緊急應變演練管制總表`;
 const sites=sortedSites(data.sites),siteOptions=sites.map(s=>`<option value="${attrs(s.id)}">${esc(s.name)}${s.active===false?'（停用）':''}</option>`).join('');
 for(const id of ['filter-site','unit-site-filter']){const node=$(id),old=node.value;node.innerHTML=`<option value="">全部公私場所</option>${siteOptions}`;node.value=sites.some(s=>s.id===old)?old:'';}
 renderOverview();renderRotation();renderYears();renderBasic();renderStatistics();
 $('init-sites').hidden=INITIAL_SITES.every(s=>sites.some(v=>v.id===s.id));
 $('notice-days').value=days();
}
function filteredYearRows(){
 const selected=$('filter-site').value,status=$('filter-status').value,q=$('filter-text').value.trim().toLowerCase();
 const field=$('filter-date-field').value,start=$('filter-from').value,end=$('filter-to').value;
 return siteRows().map(site=>{const record=recordOf(year,site.id),rotation=rotationOf(year,site.id),s=assess(record,todayTaipei(),days());const base=proposedUnit(site,data.units,year),assigned=displayAssigned(site,data.units,year,record,rotation);return {site,record,rotation,s,base,assigned};}).filter(x=>{
  const d=x.record?.[field]||'';
  return (!selected||selected===x.site.id)&&(!status||status===x.s.code)&&(!q||`${x.site.name} ${x.assigned.name} ${x.record?.refNumber||''}`.toLowerCase().includes(q))&&(!start||!!d&&d>=start)&&(!end||!!d&&d<=end);
 });
}
function renderOverview(){
 const closed=yearClosed();
 $('year-alert').hidden=!closed;
 $('year-alert').textContent=closed?`${year} 年度已${currentYearInfo()?.status==='archived'?'封存':'刪除'}，目前僅供查詢；請至「年度管理」復原後再修改。`:'';
 const stat=summary(data.sites,data.drills,year,todayTaipei(),days());
 $('kpis').innerHTML=[['應辦公私場所',stat.sites,'年度適用廠區'],['已完成演練',stat.drilled,'已記錄實際日期'],['已發文備查',stat.sent,'已記錄發文日期'],['尚待發文',stat.awaiting,'含尚未演練'],['備查逾期',stat.overdue,'演練後超過30日']].map((v,i)=>`<div class="kpi ${i===4?'alert':''}"><div class="value">${v[1]}</div><div class="label">${v[0]}</div><div class="foot">${v[2]}</div></div>`).join('');
 const rows=filteredYearRows();
 $('overview-rows').innerHTML=rows.length?rows.map(x=>`<tr><td class="emph">${esc(x.site.name)}${x.site.active===false?' <small>（已停用）</small>':''}</td><td>${textOrDash(x.record?.originalUnitName||x.rotation?.originalUnitName||x.base.unit?.name)}</td><td>${x.assigned.name?esc(x.assigned.name):`<small>${esc(x.base.message||'待建檔')}</small>`}${x.assigned.changed?' <small>（調整）</small>':''}</td><td>${textOrDash(x.record?.plannedDate)}</td><td>${textOrDash(x.record?.actualDate)}</td><td>${textOrDash(x.s.deadline)}</td><td>${textOrDash(x.record?.sentDate)}</td><td>${textOrDash(x.record?.refNumber)}</td><td><span class="status ${x.s.tone}">${esc(x.s.label)}</span></td><td class="no-print"><button type="button" class="table-action" data-edit-drill="${attrs(x.site.id)}" ${closed?'disabled title="已封存年度僅供查詢"':''}>${closed?'已封存':x.record?'編輯':'登錄'}</button></td></tr>`).join(''):`<tr><td colspan="10" class="empty">${data.sites.length?'目前篩選條件沒有紀錄。':'尚未建立公私場所，請至基本資料管理初始化。'}</td></tr>`;
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
function renderBasic(){
 const sites=sortedSites(data.sites);
 $('sites-list').innerHTML=sites.length?sites.map(s=>`<div class="basic-item"><div><strong>${esc(s.name)}</strong><p>代碼 ${esc(s.code||'未設定')} · 預設 ${Number(s.expectedUnits||1)} 個輪值廠處 · 順序 ${Number(s.order||0)}</p></div><div class="right"><span class="chip ${s.active===false?'off':''}">${s.active===false?'停用':'啟用'}</span><button type="button" class="table-action" data-edit-site="${attrs(s.id)}">編輯</button></div></div>`).join(''):'<div class="empty">尚無公私場所</div>';
 const siteFilter=$('unit-site-filter').value,units=data.units.filter(u=>!siteFilter||u.siteId===siteFilter).sort((a,b)=>(getSite(a.siteId)?.order||0)-(getSite(b.siteId)?.order||0)||(a.order||0)-(b.order||0));
 $('units-list').innerHTML=units.length?units.map(u=>`<div class="basic-item"><div><strong>${esc(u.name)}</strong><p>${esc(getSite(u.siteId)?.name||'未知場所')} · 輪值順序 ${Number(u.order||0)} · ${esc(u.code||'無代碼')}</p></div><div class="right"><span class="chip ${u.active===false?'off':''}">${u.active===false?'停用':'啟用'}</span><button type="button" class="table-action" data-edit-unit="${attrs(u.id)}">編輯</button><button type="button" class="table-action muted" data-unit-toggle="${attrs(u.id)}">${u.active===false?'啟用':'停用'}</button><button type="button" class="table-action danger" data-unit-delete="${attrs(u.id)}" ${unitWasUsed(u,data.drills,data.rotations)?'disabled title="歷史輪值或演練已引用，僅能停用"':''}>刪除</button></div></div>`).join(''):'<div class="empty">尚未新增演練廠處</div>';
}
function renderStatistics(){const s=summary(data.sites,data.drills,year,todayTaipei(),days()),pct=s.sites?Math.round(s.drilled/s.sites*100):0;
 $('statistics-content').innerHTML=`<div class="stat-grid"><div><strong>${pct}%</strong><span>演練完成率</span></div><div><strong>${s.sent}/${s.sites}</strong><span>備查發文件數</span></div><div><strong>${s.overdue}</strong><span>逾期未發文</span></div></div><div class="stat-progress"><div style="width:${pct}%"></div></div><p class="hint">完成率＝已記錄實際演練日期之公私場所數 ÷ 啟用公私場所數。尚未實際演練不計完成；不推定法規符合性。</p>`;
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
function checkUniqueSite(name,id){if(data.sites.some(s=>s.name.trim()===name&&s.id!==id))throw Error('公私場所名稱不可重複。');}
function editSite(id=''){
 if(readOnly()){notice('請等待 Firebase 雲端連線確認後再編輯。','error');return;}
 const existing=data.sites.find(s=>s.id===id);const o=existing||{id:crypto.randomUUID(),name:'',code:'',order:Math.max(0,...data.sites.map(s=>Number(s.order)||0))+1,expectedUnits:1,rotationStartYear:2026,active:true,note:'',rotationHint:''};
 openForm(existing?'編輯公私場所':'新增公私場所','此處以公私場所作為年度應演練與發文之管制單位。',
 field('公私場所名稱 *','name',o.name,'text','maxlength="80" required')+field('代碼','code',o.code,'text','maxlength="30"')+field('顯示順序 *','order',o.order,'number','min="1" max="999" required')+field('預期輪值廠處數 *','expectedUnits',o.expectedUnits,'number','min="1" max="50" required')+field('輪值基準年度','rotationStartYear',o.rotationStartYear,'number','min="2026" max="2100" required')+check('啟用此公私場所','active',o.active!==false)+textarea('備註','note',o.note),
 async form=>{
  const name=String(form.get('name')||'').trim();if(!name)throw Error('請輸入公私場所名稱。');checkUniqueSite(name,o.id);
  const next={...o,name,code:String(form.get('code')||'').trim(),order:Number(form.get('order')),expectedUnits:Number(form.get('expectedUnits')),rotationStartYear:Number(form.get('rotationStartYear')),active:form.has('active'),note:String(form.get('note')||'').trim()};
  if(!Number.isInteger(next.order)||next.order<1||next.order>999||!Number.isInteger(next.expectedUnits)||next.expectedUnits<1||next.expectedUnits>50||!validYear(next.rotationStartYear))throw Error('順序、輪值數與基準年度必須在允許範圍內。');
  if(existing&&!next.active&&data.drills.some(r=>r.siteId===o.id&&!r.actualDate)){
   if(!confirm('此公私場所仍有未完成的歷史紀錄。停用後將不納入新年度義務統計，是否繼續？'))return false;
  }
  await cloud.saveSite(next,existing?.version||0);
 });
}
function editUnit(id=''){
 if(readOnly()){notice('請等待 Firebase 雲端連線確認後再編輯。','error');return;}
 const existing=data.units.find(u=>u.id===id),initialSite=$('unit-site-filter').value||sortedSites(data.sites).find(s=>s.active!==false)?.id||'';
 if(!existing&&!initialSite){notice('請先建立公私場所。','error');setTab('basic');return;}
 const o=existing||{id:crypto.randomUUID(),name:'',code:'',siteId:initialSite,order:Math.max(0,...data.units.filter(u=>u.siteId===initialSite).map(u=>Number(u.order)||0))+1,active:true,note:''};
 const options=sortedSites(data.sites).map(s=>`<option value="${attrs(s.id)}" ${s.id===o.siteId?'selected':''}>${esc(s.name)}</option>`).join('');
 openForm(existing?'編輯演練廠處':'新增演練廠處','設定輪值順序：順序1對應輪值基準年，順序2為次年，依此循環。',
 `<label>所屬公私場所 *<select name="siteId" required>${options}</select></label>`+field('演練廠處名稱 *','name',o.name,'text','maxlength="80" required')+field('代碼','code',o.code,'text','maxlength="30"')+field('輪值順序 *','order',o.order,'number','min="1" max="999" required')+check('啟用此演練廠處','active',o.active!==false)+textarea('備註','note',o.note),
 async form=>{
  const siteId=String(form.get('siteId')||''),name=String(form.get('name')||'').trim();if(!name)throw Error('請輸入演練廠處名稱。');
  if(!getSite(siteId))throw Error('公私場所不存在。');
  if(existing&&existing.siteId!==siteId&&data.drills.some(r=>r.assignedUnitId===existing.id))throw Error('此廠處已被歷史演練引用，不可變更所屬公私場所。');
  if(data.units.some(u=>u.siteId===siteId&&u.id!==o.id&&u.name===name))throw Error('同公私場所下廠處名稱不可重複。');
  const order=Number(form.get('order'));if(!Number.isInteger(order)||order<1||order>999)throw Error('輪值順序必須為1～999。');
  if(data.units.some(u=>u.siteId===siteId&&u.id!==o.id&&u.active!==false&&u.order===order&&form.has('active')))throw Error('同一公私場所的啟用廠處輪值順序不可重複。');
  const next={...o,siteId,name,code:String(form.get('code')||'').trim(),order,active:form.has('active'),note:String(form.get('note')||'').trim()};
  await cloud.saveUnit(next,existing?.version||0);
 });
}
function editDrill(siteId){
 if(yearClosed()){notice('此年度已封存或刪除。請至「年度管理」恢復後再編輯。','error');return;}
 if(readOnly()){notice('請等待 Firebase 雲端連線確認後再編輯。','error');return;}
 const site=getSite(siteId);if(!site){notice('找不到公私場所。','error');return;}
 if(site.active===false){notice('已停用的公私場所僅供查詢，不能新增或修改演練。','error');return;}
 const old=recordOf(year,siteId),rot=rotationOf(year,siteId),proposal=proposedUnit(site,data.units,year);
 const first=old?.originalUnitId||rot?.originalUnitId||proposal.unit?.id||'';
 const current=old?.assignedUnitId||rot?.assignedUnitId||first;
 if(!proposal.unit&&!old&&!rot){notice(`${site.name}：${proposal.message}。請先至基本資料管理完成輪值建檔。`,'error');setTab('basic');return;}
 const all=sortedUnits(data.units,siteId,true),options=all.map(u=>`<option value="${attrs(u.id)}" ${u.id===current?'selected':''} ${u.active===false&&u.id!==current?'disabled':''}>${esc(u.name)}${u.active===false?'（已停用）':''}</option>`).join('');
 const fields=`<label>管制年度<input value="${year}" disabled></label><label>公私場所<input value="${attrs(site.name)}" disabled></label>`+
 `<label>原輪值廠處<input value="${attrs(old?.originalUnitName||rot?.originalUnitName||proposal.unit?.name||'待建檔')}" disabled></label>`+
 `<label>實際演練廠處 *<select name="assignedUnitId" required>${options}</select></label>`+
 field('預定演練日期','plannedDate',old?.plannedDate||'','date')+
 field('實際演練日期','actualDate',old?.actualDate||'','date')+
 field('備查發文日期','sentDate',old?.sentDate||'','date')+
 field('發文字號（選填）','refNumber',old?.refNumber||'','text','maxlength="100"')+
 textarea('輪值調整原因（更換廠處時必填）','changeReason',old?.changeReason||rot?.changeReason||'')+
 textarea('演練備註','note',old?.note||'');
 openForm(`${year} 年｜${site.name} 演練管制`,'發文日期指演練後正式發函地方環保局備查之日期。系統將自動計算演練後30日備查期限。',fields,
 async form=>{
  const unitId=String(form.get('assignedUnitId')||''),unit=all.find(u=>u.id===unitId);if(!unit)throw Error('找不到指定的演練廠處。');
  const originalUnitId=first||unitId,originalUnit=all.find(u=>u.id===originalUnitId);
  const reason=String(form.get('changeReason')||'').trim();
  if(unitId!==originalUnitId&&!reason)throw Error('調整原輪值廠處時必須填寫變更原因。');
  const dataRow={id:recordKey(year,site.id),siteId:site.id,siteName:site.name,year,originalUnitId,originalUnitName:old?.originalUnitName||rot?.originalUnitName||originalUnit?.name||'',assignedUnitId:unitId,assignedUnitName:(old?.assignedUnitId===unitId&&old?.assignedUnitName)?old.assignedUnitName:unit.name,changeReason:unitId!==originalUnitId?reason:'',plannedDate:String(form.get('plannedDate')||''),actualDate:String(form.get('actualDate')||''),sentDate:String(form.get('sentDate')||''),refNumber:String(form.get('refNumber')||'').trim(),note:String(form.get('note')||'').trim()};
  validateDrill(dataRow,site,data.units,old);
  // Explicitly retain original snapshots; no bulk rewrite of older records on basic-data changes.
  await cloud.saveDrill(dataRow,old?.version||0);
 });
}
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
   obj={id:key,year:y,siteId:site.id,siteName:site.name,originalUnitId:origin,originalUnitName,assignedUnitId:unit.id,assignedUnitName:unit.name,changeReason:row.changeReason||'',plannedDate:row.plannedDate,actualDate:row.actualDate,sentDate:row.sentDate,refNumber:row.refNumber,note:row.note};
   try{validateDrill(obj,site,data.units,existing);if(obj.assignedUnitId!==obj.originalUnitId&&!obj.changeReason)throw Error('調整輪值必須填原因');}
   catch(e){error=e.message;}
  }
  const equal=existing&&obj&&['assignedUnitId','plannedDate','actualDate','sentDate','refNumber','note','changeReason'].every(k=>String(existing[k]||'')===String(obj[k]||''));
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

// R0.2 year register, legacy data remain readable without any migration or bulk write.
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
  year=y;return true;
 });
}
async function setYearStatus(n,status){
 if(readOnly()){notice('請等待 Firebase 雲端連線確認後操作。','error');return;}
 const row=currentYearInfo(n);if(!row){notice('找不到指定年度。','error');return;}
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
function addBulkRow(){
 if(bulkRows.length>=50){notice('每批最多50筆。','error');return;}
 const siteId=$('bulk-site').value;
 const used=[...data.units.filter(u=>u.siteId===siteId).map(u=>Number(u.order)||0),...bulkRows.map(x=>Number(x.order)||0)];
 bulkRows.push({id:crypto.randomUUID(),name:'',code:'',siteId,order:Math.max(0,...used)+1,active:true,note:''});renderBulkRows();
}
function renderBulkRows(){
 $('bulk-rows').innerHTML=bulkRows.map((r,i)=>`<tr data-bulk-id="${attrs(r.id)}"><td><input aria-label="第${i+1}列輪值順序" data-bulk-key="order" type="number" min="1" max="999" value="${Number(r.order)}" required></td><td><input aria-label="第${i+1}列演練廠處名稱" data-bulk-key="name" maxlength="80" value="${attrs(r.name)}" placeholder="輸入廠處名稱" required></td><td><input aria-label="第${i+1}列代碼" data-bulk-key="code" maxlength="30" value="${attrs(r.code)}" placeholder="選填"></td><td><input aria-label="第${i+1}列是否啟用" data-bulk-key="active" type="checkbox" ${r.active?'checked':''}></td><td><button class="table-action danger" type="button" data-bulk-remove="${attrs(r.id)}">移除</button></td></tr>`).join('');
}
function openBulk(){
 if(readOnly()){notice('請先確認雲端已連線。','error');return;}
 const sites=sortedSites(data.sites).filter(s=>s.active!==false);
 if(!sites.length){notice('請先新增或啟用公私場所。','error');return;}
 const filter=$('unit-site-filter').value,selected=sites.some(s=>s.id===filter)?filter:sites[0].id;
 $('bulk-site').innerHTML=sites.map(s=>`<option value="${attrs(s.id)}">${esc(s.name)}</option>`).join('');
 $('bulk-site').value=selected;bulkRows=[];for(let i=0;i<3;i++)addBulkRow();$('bulk-dialog').showModal();
}
async function saveBulk(){
 if(readOnly()||busy)return;
 const siteId=$('bulk-site').value,site=getSite(siteId);
 if(!site||site.active===false){notice('公私場所不存在或已停用。','error');return;}
 try{validateBatchUnits(siteId,bulkRows,data.units);}catch(e){notice('批次資料有誤：'+e.message,'error');return;}
 if(!confirm(`確定一次新增 ${bulkRows.length} 個演練廠處至「${site.name}」？請確認輪值順序。`))return;
 busy=true;$('bulk-save').disabled=true;
 try{await cloud.saveUnitsBatch(siteId,bulkRows,data.units);$('bulk-dialog').close();notice(`已一次儲存 ${bulkRows.length} 筆演練廠處至 Firebase。`,'success');}
 catch(e){notice('批次儲存失敗：'+e.message,'error');}
 finally{busy=false;$('bulk-save').disabled=false;}
}

$('tabs').addEventListener('click',e=>{const btn=e.target.closest('[data-tab]');if(btn)setTab(btn.dataset.tab);});
$('selected-year').addEventListener('change',e=>{year=Number(e.target.value);render();});
$('go-years').onclick=()=>setTab('years');
$('new-year').onclick=()=>editYear();
function handleYearClicks(e){
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.yearShow){year=Number(b.dataset.yearShow);render();setTab('overview');}
 else if(b.dataset.yearEdit)editYear(Number(b.dataset.yearEdit));
 else if(b.dataset.yearArchive)setYearStatus(Number(b.dataset.yearArchive),'archived');
 else if(b.dataset.yearRemove)setYearStatus(Number(b.dataset.yearRemove),'deleted');
 else if(b.dataset.yearRestore)setYearStatus(Number(b.dataset.yearRestore),'active');
}
$('years-rows').addEventListener('click',handleYearClicks);
$('years-deleted').addEventListener('click',handleYearClicks);
['filter-site','filter-status','filter-date-field','filter-from','filter-to'].forEach(id=>$(id).addEventListener('change',renderOverview));
$('filter-text').addEventListener('input',renderOverview);
$('unit-site-filter').addEventListener('change',renderBasic);
$('overview-rows').addEventListener('click',e=>{const b=e.target.closest('[data-edit-drill]');if(b)editDrill(b.dataset.editDrill);});
$('sites-list').addEventListener('click',e=>{const b=e.target.closest('[data-edit-site]');if(b)editSite(b.dataset.editSite);});
$('units-list').addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.editUnit)editUnit(b.dataset.editUnit);
 else if(b.dataset.unitToggle)toggleUnit(b.dataset.unitToggle);
 else if(b.dataset.unitDelete)deleteUnit(b.dataset.unitDelete);
});
$('new-site').onclick=()=>editSite();$('new-unit').onclick=()=>editUnit();
$('bulk-new-units').onclick=openBulk;
$('bulk-close').onclick=()=>$('bulk-dialog').close();
$('bulk-cancel').onclick=()=>$('bulk-dialog').close();
$('bulk-add-row').onclick=addBulkRow;
$('bulk-site').onchange=()=>{bulkRows=[];for(let i=0;i<3;i++)addBulkRow();};
$('bulk-rows').addEventListener('input',e=>{
 const input=e.target.closest('[data-bulk-key]');if(!input)return;
 const row=bulkRows.find(r=>r.id===input.closest('[data-bulk-id]')?.dataset.bulkId);if(!row)return;
 const key=input.dataset.bulkKey;row[key]=key==='active'?input.checked:key==='order'?Number(input.value):input.value;
});
$('bulk-rows').addEventListener('change',e=>{
 if(e.target.dataset.bulkKey==='active'){
  const row=bulkRows.find(r=>r.id===e.target.closest('[data-bulk-id]')?.dataset.bulkId);
  if(row)row.active=e.target.checked;
 }
});
$('bulk-rows').addEventListener('click',e=>{
 const b=e.target.closest('[data-bulk-remove]');if(!b)return;
 bulkRows=bulkRows.filter(r=>r.id!==b.dataset.bulkRemove);
 if(!bulkRows.length)addBulkRow();else renderBulkRows();
});
$('bulk-save').onclick=saveBulk;
$('init-sites').onclick=async()=>{if(busy||readOnly()){notice('Firebase 尚未連線，不能初始化。','error');return;}
 if(!confirm('確定將麥寮廠、海豐廠新增為公私場所基本資料？此操作不會新增演練廠處或歷史演練紀錄。'))return;
 busy=true;$('init-sites').disabled=true;try{await cloud.initializeSites();notice('公私場所初始化完成。請自行建立演練廠處及輪值順序。','success');}catch(e){notice('初始化失敗：'+e.message,'error');}finally{busy=false;$('init-sites').disabled=false;}
};
$('settings-form').onsubmit=async e=>{e.preventDefault();if(busy||readOnly()){notice('Firebase 尚未連線，不能變更設定。','error');return;}const v=Number($('notice-days').value);if(!Number.isInteger(v)||v<0||v>30){notice('提前警示天數請輸入0～30。','error');return;}busy=true;
 try{await cloud.saveSettings(v,data.settings.version||0);notice('警示設定已儲存。','success');}catch(e){notice('警示設定儲存失敗：'+e.message,'error');}finally{busy=false;}
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
  authorized=cloud.owner();data={sites:[],units:[],rotations:[],drills:[],years:[],settings:{noticeDays:7,version:0},ready:false,fromCache:true};
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
  },error=>{if(seq!==authSeq)return;connected('Firebase 連線失敗','danger');notice(`無法讀取雲端資料：${error.message}`,'error');$('workspace').hidden=true;$('gate').hidden=false;});
 });
}
begin();
