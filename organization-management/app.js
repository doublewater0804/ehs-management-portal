const {initialMeta,staff:seedStaff,nodes:seedNodes,initialVersions}=window.EHS_ORG_SEED;

const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate=s=>s?String(s).replaceAll('-','/'):'-';
const zhDate=s=>{if(!s)return '';const [y,m,d]=s.split('-').map(Number);return `${y}年${m}月${d}日`;};
const uid=()=>crypto.randomUUID();
let state={meta:null,staff:[],nodes:[],versions:[],changes:[],importPlan:null};
let isAdmin=false;
let cloudLoadState='seed';
let cloud=null;

function toast(msg){const el=$('toast');el.textContent=msg;el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,2800);}
function setCloudStatus(text,type=''){const e=$('cloud-status');e.textContent=text;e.className=`status-chip ${type}`;}
function activeStaff(){return state.staff.filter(x=>x.status==='active');}
function pendingChanges(){return state.changes.filter(c=>!c.publishedVersion).sort((a,b)=>(b.at||'').localeCompare(a.at||''));}
function nodeById(id){return state.nodes.find(n=>n.id===id);}
function nextVersion(v){const n=Number(String(v||'R0').replace(/\D/g,''))||0;return `R${n+1}`;}
function cloneSeed(v){return JSON.parse(JSON.stringify(v));}
async function ensureCloud(){
  if(cloud) return cloud;
  const c=window.EHSCloud;
  if(c && c.available){cloud=c;return c;}
  throw new Error((c && c.initError) || 'Firebase SDK 未載入；目前使用本機預覽。');
}
function cloudErrorText(err){
  const code=err?.code||'';
  if(code==='auth/unauthorized-domain') return '目前網域未加入 Firebase Authentication 授權網域。';
  if(code==='auth/popup-blocked') return '瀏覽器封鎖登入視窗，系統將改用重新導向登入。';
  if(code==='auth/popup-closed-by-user') return 'Google 登入視窗已關閉。';
  return err?.message||'Firebase 服務載入失敗。';
}
function useSeedPreview(){state={meta:cloneSeed(initialMeta),staff:cloneSeed(seedStaff),nodes:cloneSeed(seedNodes),versions:cloneSeed(initialVersions),changes:[],importPlan:null};renderAll();}
function applyAdminUi(){document.querySelectorAll('[data-admin-only]').forEach(el=>el.hidden=!isAdmin);document.body.classList.toggle('admin-mode',isAdmin);}
function requireAdmin(){if(!isAdmin){toast('請先使用右上角 Google 管理者帳號登入。');return false;}return true;}

function setTab(name){document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));document.querySelectorAll('.tab-panel').forEach(p=>p.hidden=p.id!==`tab-${name}`);if(name==='chart')renderChart();if(name==='staff')renderStaff();if(name==='versions')renderVersions();if(name==='staffing')renderStaffing();}
document.querySelector('.tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)setTab(b.dataset.tab);});

function renderAll(){
  $('current-version').textContent=state.meta.version;
  $('revision-date').textContent=fmtDate(state.meta.revisionDate);
  $('chart-revision-date').textContent=zhDate(state.meta.revisionDate);
  $('draft-badge').hidden=!pendingChanges().length;
  fillFilters(); fillNodeSelect(); renderChart(); renderStaff(); renderVersions(); renderStaffing();
}

function fillFilters(){
  const fill=(id,vals)=>{const cur=$(id).value;$(id).innerHTML='<option value="">全部</option>'+[...new Set(vals.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-Hant')).map(v=>`<option>${esc(v)}</option>`).join('');$(id).value=cur;};
  fill('filter-unit',state.staff.map(x=>x.unit));fill('filter-title',state.staff.map(x=>x.title));fill('filter-level',state.staff.map(x=>x.level));
}
function fillNodeSelect(){$('form-node').innerHTML=state.nodes.slice().sort((a,b)=>a.label.localeCompare(b.label,'zh-Hant')).map(n=>`<option value="${esc(n.id)}">${esc(n.label.replaceAll('\n',' '))}</option>`).join('');}

function renderChart(){
  if(!state.meta)return;
  const people=activeStaff();
  const lines=[];
  for(const n of state.nodes){if(!n.parent)continue;const p=nodeById(n.parent);if(!p)continue;const x1=p.x+p.w/2,y1=p.y+p.h,x2=n.x+n.w/2,y2=n.y;const mid=(y1+y2)/2;lines.push(`<path d="M${x1},${y1} V${mid} H${x2} V${y2}" fill="none" stroke="#333" stroke-width="1.2"/>`);}
  $('org-lines').innerHTML=lines.join('');
  $('org-nodes').innerHTML=state.nodes.map(n=>{
    const ps=people.filter(s=>s.nodeId===n.id); const actual=ps.length; const vacancy=actual===0;
    let body='';
    if(ps.length<=1){const s=ps[0];body=`<div class="node-title">${esc(n.label).replaceAll('\n','<br>')}</div><div class="count">計${n.headcount??0}人(${actual})</div>${s?`<div class="staff-name">${esc(s.name)}</div><div>${esc(s.title)}</div><div class="join">${esc(s.joinMonth)}</div>`:''}`;}
    else{body=`<div class="node-title">${esc(n.label).replaceAll('\n','<br>')}</div><div class="count">計${n.headcount??0}人(${actual})</div>`+ps.map(s=>`<div class="person-block"><b>${esc(s.name)}</b><br>${esc(s.title)}<br><span class="join">${esc(s.joinMonth)}</span></div>`).join('');}
    return `<div class="org-node ${vacancy?'vacancy':''} ${ps.length>1?'multiple':''}" style="left:${n.x}px;top:${n.y}px;width:${n.w}px;height:${n.h}px">${body}</div>`;
  }).join('');
  const male=39,female=13; // R41 原稿基準，未配置性別欄位，故只作原稿摘要顯示。
  $('summary-box').innerHTML=`<table><tr><th colspan="4">編制人數</th></tr><tr><th>男</th><th>女</th><th>小計</th><th>合計</th></tr><tr><td>${male}</td><td>${female}</td><td>${male+female}</td><td>${state.staff.filter(s=>s.status==='active').length}</td></tr><tr><td colspan="4">( )內係現有人數</td></tr></table>`;
  renderFooterStats();
}

function renderFooterStats(){
  const levels=['經理級','一級主管','二級主管','基層主管','基層人員','事務人員','定期契約人員','培訓人員'];
  const a=activeStaff();
  const vals=levels.map(l=>a.filter(s=>s.level===l).length);
  $('chart-footer-table').innerHTML=`<table><thead><tr>${levels.map(l=>`<th>${l}</th>`).join('')}<th>合計</th></tr></thead><tbody><tr>${vals.map(v=>`<td>${v}</td>`).join('')}<td>${a.length}</td></tr><tr><td colspan="${levels.length+1}">現有人數由系統自動計算；編制人數於「編制設定」維護。</td></tr></tbody></table>`;
}
$('compare-template').addEventListener('change',e=>$('template-image').hidden=!e.target.checked);

function filteredStaff(){
  const q=$('filter-name').value.trim().toLowerCase(),unit=$('filter-unit').value,title=$('filter-title').value,level=$('filter-level').value,type=$('filter-type').value,status=$('filter-status').value;
  return state.staff.filter(s=>(!q||s.name.toLowerCase().includes(q))&&(!unit||s.unit===unit)&&(!title||s.title===title)&&(!level||s.level===level)&&(!type||s.employeeType===type)&&(!status||s.status===status)).sort((a,b)=>a.unit.localeCompare(b.unit,'zh-Hant')||a.name.localeCompare(b.name,'zh-Hant'));
}
function renderStaff(){
  const list=filteredStaff(); $('staff-count').textContent=`${list.length} 筆`;
  $('staff-tbody').innerHTML=list.length?list.map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(s.title)}</td><td>${esc(s.unit)}</td><td>${esc(s.joinMonth)}</td><td>${esc(s.level)}</td><td>${esc(s.employeeType)}</td><td class="${s.status==='active'?'status-active':'status-inactive'}">${s.status==='active'?'在職':'離職'}</td><td>${esc(s.version||state.meta.version)}</td><td>${isAdmin?`<button class="action-btn" data-edit="${esc(s.id)}">編輯</button>${s.status==='active'?`<button class="action-btn danger" data-leave="${esc(s.id)}">離職</button>`:''}`:'<span class="muted">查看</span>'}</td></tr>`).join(''):'<tr><td colspan="9" class="muted">沒有符合條件的資料。</td></tr>';
}
for(const id of ['filter-name','filter-unit','filter-title','filter-level','filter-type','filter-status'])$(id).addEventListener('input',renderStaff);
$('clear-filter').onclick=()=>{for(const id of ['filter-name','filter-unit','filter-title','filter-level','filter-type'])$(id).value='';$('filter-status').value='active';renderStaff();};

function openStaff(item){
  const f=$('staff-form');f.reset();f.elements.id.value=item?.id||'';for(const k of ['name','title','unit','joinMonth','level','employeeType','nodeId','status'])if(item?.[k]!=null)f.elements[k].value=item[k];
  if(!item){f.elements.status.value='active';f.elements.employeeType.value='正式';}
  $('staff-dialog-title').textContent=item?'編輯人員':'新增人員';$('staff-dialog').showModal();
}
$('add-staff').onclick=()=>{if(requireAdmin())openStaff();};
$('staff-tbody').onclick=e=>{const edit=e.target.closest('[data-edit]'),leave=e.target.closest('[data-leave]');if(edit)openStaff(state.staff.find(s=>s.id===edit.dataset.edit));if(leave)markLeave(leave.dataset.leave);};
$('save-staff').onclick=async e=>{e.preventDefault();const f=$('staff-form');if(!f.reportValidity())return;const old=state.staff.find(s=>s.id===f.elements.id.value);const item={id:old?.id||uid(),name:f.elements.name.value.trim(),title:f.elements.title.value.trim(),unit:f.elements.unit.value.trim(),joinMonth:f.elements.joinMonth.value.trim(),level:f.elements.level.value,employeeType:f.elements.employeeType.value,nodeId:f.elements.nodeId.value,status:f.elements.status.value,version:state.meta.version};
  const diffs=[];if(!old)diffs.push({field:'新增',before:'',after:`${item.title} / ${item.unit}`});else for(const [k,label] of Object.entries({name:'姓名',title:'職稱',unit:'單位',joinMonth:'到職年月',level:'職務層級',employeeType:'人員類別',nodeId:'組織位置',status:'在職狀態'}))if(old[k]!==item[k])diffs.push({field:label,before:old[k]??'',after:item[k]??''});
  if(!diffs.length){$('staff-dialog').close();return;}
  const change={id:uid(),name:item.name,type:old?'修改':'新增',diffs,note:f.elements.changeNote.value.trim(),at:new Date().toISOString()};
  try{e.target.disabled=true;const c=await ensureCloud();await c.saveStaff(item,change);$('staff-dialog').close();await reload();toast('人員資料已儲存，列入待發布異動。');}catch(err){alert(err.message);}finally{e.target.disabled=false;}
};
async function markLeave(id){const s=state.staff.find(x=>x.id===id);if(!s||!confirm(`確定將「${s.name}」標記為離職？\n離職後不顯示於組織圖，但資料仍保留。`))return;const item={...s,status:'inactive',version:state.meta.version};const change={id:uid(),name:s.name,type:'離職',diffs:[{field:'在職狀態',before:'在職',after:'離職'}],note:'離職',at:new Date().toISOString()};try{const c=await ensureCloud();await c.saveStaff(item,change);await reload();toast('已標記離職。');}catch(e){alert(e.message);}}

function renderVersions(){
  const p=pendingChanges();$('pending-changes').innerHTML=p.length?`<b>待發布異動：${p.length} 筆</b>`+p.map(c=>`<div class="pending-item"><b>${esc(c.name)}</b>｜${esc(c.type)}｜${esc(c.note||c.diffs?.map(d=>`${d.field}: ${d.before} → ${d.after}`).join('；')||'')}</div>`).join(''):'目前沒有待發布異動。';
  $('publish-version').disabled=!p.length;
  $('version-tbody').innerHTML=state.versions.slice().sort((a,b)=>Number(b.version.replace(/\D/g,''))-Number(a.version.replace(/\D/g,''))).map(v=>`<tr><td><b>${esc(v.version)}</b></td><td>${esc(fmtDate(v.revisionDate))}</td><td>${v.changeCount??v.changes?.length??0}</td><td>${esc(v.summary||'')}</td><td><button class="action-btn" data-version="${esc(v.version)}">查看</button></td></tr>`).join('');
}
$('version-tbody').onclick=e=>{const b=e.target.closest('[data-version]');if(!b)return;const v=state.versions.find(x=>x.version===b.dataset.version);$('version-detail-title').textContent=`${v.version}｜${fmtDate(v.revisionDate)}`;$('version-detail').innerHTML=`<p>${esc(v.summary||'')}</p><div class="table-wrap"><table><thead><tr><th>姓名</th><th>類型</th><th>異動內容</th></tr></thead><tbody>${(v.changes||[]).map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.type)}</td><td>${esc(c.diffs?c.diffs.map(d=>`${d.field}: ${d.before} → ${d.after}`).join('；'):`${c.field||''}: ${c.before||''} → ${c.after||''}`)}</td></tr>`).join('')}</tbody></table></div>`;$('version-dialog').showModal();};
$('publish-version').onclick=()=>{const p=pendingChanges();if(!p.length)return;const nv=nextVersion(state.meta.version);$('publish-current-version').textContent=state.meta.version;$('publish-next-version').textContent=nv;$('publish-form').elements.date.value=new Date().toISOString().slice(0,10);$('publish-form').elements.summary.value='人員編制異動';$('publish-changes').innerHTML=p.map(c=>`<div class="pending-item">${esc(c.name)}｜${esc(c.type)}｜${esc(c.note||'')}</div>`).join('');$('publish-dialog').showModal();};
$('confirm-publish').onclick=async e=>{e.preventDefault();const f=$('publish-form');if(!f.reportValidity())return;const p=pendingChanges(),version={version:$('publish-next-version').textContent,revisionDate:f.elements.date.value,summary:f.elements.summary.value.trim()};try{e.target.disabled=true;const c=await ensureCloud();await c.publishVersion(version,p,state.staff.map(x=>({...x})));$('publish-dialog').close();await reload();toast(`${version.version} 已發布。`);}catch(err){alert(err.message);}finally{e.target.disabled=false;}};

function renderStaffing(){
  $('staffing-tbody').innerHTML=state.nodes.slice().sort((a,b)=>a.label.localeCompare(b.label,'zh-Hant')).map(n=>{const actual=activeStaff().filter(s=>s.nodeId===n.id).length;return `<tr><td>${esc(n.id)}</td><td>${esc(n.label.replaceAll('\n',' '))}</td><td><input class="staffing-input" type="number" min="0" max="99" value="${Number(n.headcount)||0}" data-node-headcount="${esc(n.id)}" ${isAdmin?'':'disabled'}></td><td>${actual}</td></tr>`;}).join('');
}
$('save-staffing').onclick=async e=>{const next=state.nodes.map(n=>({...n,headcount:Number(document.querySelector(`[data-node-headcount="${CSS.escape(n.id)}"]`).value)||0}));try{e.target.disabled=true;const c=await ensureCloud();await c.saveStaffing(next);await reload();toast('編制人數已儲存，列入待發布異動。');}catch(err){alert(err.message);}finally{e.target.disabled=false;}};

async function exportExcel(){
  if(!window.ExcelJS||!window.saveAs){alert('Excel 元件尚未載入，請重新整理後再試。');return;}
  const workbook=new ExcelJS.Workbook();workbook.creator='EHS 管理入口平台';workbook.created=new Date();
  const chart=workbook.addWorksheet('組織編制表',{pageSetup:{orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:1}});
  chart.getCell('A1').value=`${state.meta.title} ${state.meta.version}`;chart.getCell('A2').value=`修訂日期：${fmtDate(state.meta.revisionDate)}`;chart.getColumn(1).width=150;chart.getRow(1).height=24;
  try{const canvas=await captureChart();const base64=canvas.toDataURL('image/png').split(',')[1];const img=workbook.addImage({base64,extension:'png'});chart.addImage(img,{tl:{col:0,row:3},ext:{width:1200,height:783}});chart.getRow(4).height=590;}catch(e){chart.getCell('A4').value='組織圖影像產生失敗，請改用 PDF 輸出。';}
  const ws=workbook.addWorksheet('人員資料');ws.columns=[['姓名','name'],['職稱','title'],['單位','unit'],['到職年月','joinMonth'],['職務層級','level'],['人員類別','employeeType'],['在職狀態','status'],['組織節點','nodeId'],['異動說明','changeNote']].map(([header,key])=>({header,key,width:key==='unit'||key==='title'?20:15}));
  state.staff.forEach(s=>ws.addRow({...s,status:s.status==='active'?'在職':'離職',changeNote:''}));ws.getRow(1).font={bold:true};ws.autoFilter={from:'A1',to:'I1'};ws.views=[{state:'frozen',ySplit:1}];
  ['E','F','G','H'].forEach(col=>{for(let r=2;r<=Math.max(ws.rowCount+100,200);r++){const cell=ws.getCell(`${col}${r}`);let formula='';if(col==='E')formula='"經理級,一級主管,二級主管,基層主管,基層人員,事務人員,定期契約人員,培訓人員"';if(col==='F')formula='"正式,外包"';if(col==='G')formula='"在職,離職"';if(col==='H')formula=`"${state.nodes.map(n=>n.id).join(',')}"`;cell.dataValidation={type:'list',allowBlank:true,formulae:[formula]};}});
  const buf=await workbook.xlsx.writeBuffer();saveAs(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`安全衛生處組織編制表_${state.meta.version}_${state.meta.revisionDate}.xlsx`);
}
$('export-xlsx').onclick=exportExcel;

async function captureChart(){const img=$('template-image'),wasHidden=img.hidden;img.hidden=true;await new Promise(r=>requestAnimationFrame(r));const canvas=await html2canvas($('org-page'),{scale:2,backgroundColor:'#ffffff',useCORS:true,logging:false});img.hidden=wasHidden;return canvas;}
$('export-pdf').onclick=async e=>{try{e.target.disabled=true;const canvas=await captureChart();const {jsPDF}=window.jspdf;const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:[1049.944,684.876],compress:true});pdf.addImage(canvas.toDataURL('image/jpeg',0.96),'JPEG',0,0,1049.944,684.876,undefined,'FAST');pdf.save(`安全衛生處組織編制表_${state.meta.version}_${state.meta.revisionDate}.pdf`);}catch(err){alert(`PDF 輸出失敗：${err.message}`);}finally{e.target.disabled=false;}};

$('import-xlsx').onclick=()=>{if(requireAdmin())$('import-file').click();};
$('import-file').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{const wb=new ExcelJS.Workbook();await wb.xlsx.load(await file.arrayBuffer());const ws=wb.getWorksheet('人員資料');if(!ws)throw Error('找不到「人員資料」工作表。');const headers={};ws.getRow(1).eachCell((c,i)=>headers[String(c.value).trim()]=i);for(const h of ['姓名','職稱','單位','到職年月','職務層級','人員類別','在職狀態','組織節點'])if(!headers[h])throw Error(`缺少必要欄位：${h}`);
    const incoming=[];ws.eachRow((row,i)=>{if(i===1)return;const name=String(row.getCell(headers['姓名']).value??'').trim();if(!name)return;incoming.push({name,title:String(row.getCell(headers['職稱']).value??'').trim(),unit:String(row.getCell(headers['單位']).value??'').trim(),joinMonth:String(row.getCell(headers['到職年月']).value??'').trim(),level:String(row.getCell(headers['職務層級']).value??'').trim(),employeeType:String(row.getCell(headers['人員類別']).value??'正式').trim(),status:String(row.getCell(headers['在職狀態']).value??'在職').trim()==='離職'?'inactive':'active',nodeId:String(row.getCell(headers['組織節點']).value??'').trim(),changeNote:headers['異動說明']?String(row.getCell(headers['異動說明']).value??'').trim():''});});buildImportPlan(incoming);$('import-dialog').showModal();}catch(err){alert(`匯入檔案無法讀取：${err.message}`);}};
function buildImportPlan(incoming){const fields={title:'職稱',unit:'單位',joinMonth:'到職年月',level:'職務層級',employeeType:'人員類別',status:'在職狀態',nodeId:'組織節點'};const rows=[],upserts=[],changes=[];for(const x of incoming){const old=state.staff.find(s=>s.name===x.name);if(!old){const item={...x,id:uid(),version:state.meta.version};upserts.push(item);const c={id:uid(),name:x.name,type:'新增',diffs:[{field:'新增',before:'',after:`${x.title}/${x.unit}`}],note:x.changeNote||'Excel 匯入新增',at:new Date().toISOString()};changes.push(c);rows.push({kind:'new',name:x.name,field:'-',before:'-',after:`${x.title} / ${x.unit}`,action:'新增',item,change:c});continue;}const diffs=[];for(const [k,l] of Object.entries(fields))if((old[k]??'')!==(x[k]??''))diffs.push({field:l,before:old[k]??'',after:x[k]??''});if(diffs.length){const item={...old,...x,version:state.meta.version};upserts.push(item);const c={id:uid(),name:x.name,type:'修改',diffs,note:x.changeNote||'Excel 匯入修改',at:new Date().toISOString()};changes.push(c);diffs.forEach(d=>rows.push({kind:'change',name:x.name,field:d.field,before:d.before,after:d.after,action:'更新',item,change:c}));}}
  const names=new Set(incoming.map(x=>x.name));state.staff.filter(s=>s.status==='active'&&!names.has(s.name)).forEach(s=>rows.push({kind:'missing',name:s.name,field:'-',before:'目前在職',after:'Excel 無資料',action:'ignore',item:s}));state.importPlan={rows,upserts,changes};$('import-summary').innerHTML=`<p><b>新增 ${rows.filter(r=>r.kind==='new').length} 人｜修改 ${new Set(rows.filter(r=>r.kind==='change').map(r=>r.name)).size} 人｜Excel 未找到 ${rows.filter(r=>r.kind==='missing').length} 人</b></p>`;$('import-tbody').innerHTML=rows.map((r,i)=>`<tr><td><span class="import-tag ${r.kind}">${r.kind==='new'?'新增':r.kind==='change'?'修改':'缺少'}</span></td><td>${esc(r.name)}</td><td>${esc(r.field)}</td><td>${esc(r.before)}</td><td>${esc(r.after)}</td><td>${r.kind==='missing'?`<select data-missing-index="${i}"><option value="ignore">不處理</option><option value="leave">標記離職</option></select>`:esc(r.action)}</td></tr>`).join('');}
$('apply-import').onclick=async e=>{e.preventDefault();const p=state.importPlan;if(!p)return;const upserts=[...p.upserts],changes=[...p.changes];document.querySelectorAll('[data-missing-index]').forEach(sel=>{if(sel.value!=='leave')return;const r=p.rows[Number(sel.dataset.missingIndex)],old=r.item,item={...old,status:'inactive',version:state.meta.version};upserts.push(item);changes.push({id:uid(),name:old.name,type:'離職',diffs:[{field:'在職狀態',before:'在職',after:'離職'}],note:'Excel 匯入：系統有人、Excel 無此人，人工確認標記離職',at:new Date().toISOString()});});try{e.target.disabled=true;const c=await ensureCloud();await c.bulkImport({upserts,changes});$('import-dialog').close();await reload();toast(`Excel 匯入完成，共處理 ${upserts.length} 人。`);}catch(err){alert(err.message);}finally{e.target.disabled=false;}};

async function reload(){const c=await ensureCloud();const data=await c.loadAll();state={...data,importPlan:null};renderAll();setCloudStatus('雲端已同步','ok');}
async function initialize(){if(!isAdmin)return;if(!confirm('雲端尚無此模組資料。是否以目前 R41 原稿資料初始化？'))return;const c=await ensureCloud();await c.initializeData({meta:initialMeta,staff:seedStaff,nodes:seedNodes,versions:initialVersions});await reload();}
async function loadVisibleData(){
  try{
    setCloudStatus('讀取雲端…');
    const c=await ensureCloud();const data=await c.loadAll();
    if(data.meta){state={...data,importPlan:null};cloudLoadState='loaded';renderAll();setCloudStatus('雲端已同步','ok');return 'loaded';}
    cloudLoadState='empty';useSeedPreview();setCloudStatus('R41 預覽','warn');return 'empty';
  }catch(err){
    console.warn('公開雲端讀取失敗，改用 R41 內建預覽：',err);
    cloudLoadState='error';useSeedPreview();setCloudStatus('R41 預覽','warn');return 'error';
  }
}

$('login-btn').onclick=async()=>{
  const b=$('login-btn');
  try{
    b.disabled=true;b.textContent='登入中…';$('auth-message').textContent='正在連接 Google 登入…';
    const c=await ensureCloud();
    await c.login();
  }catch(e){
    console.error('Google login error',e);
    const msg=cloudErrorText(e);
    $('auth-message').textContent=msg;
    alert(msg);
  }finally{b.disabled=false;b.textContent='Google 登入';}
};
$('logout-btn').onclick=async()=>{try{const c=await ensureCloud();await c.logout();}catch(e){alert(cloudErrorText(e));}};

// v4：使用傳統 script 載入，UI 不再依賴 ES Module / Firebase 才能啟動。
useSeedPreview();
applyAdminUi();
setTab('chart');
setCloudStatus('R41 本機預覽','warn');
$('auth-message').textContent='未登入：可檢視、篩選及匯出';

async function bootCloud(){
  try{
    const c=await ensureCloud();
    c.observeAuth(async user=>{
      isAdmin=c.isAdminUser(user);
      $('login-btn').hidden=!!user;
      $('logout-btn').hidden=!user;
      applyAdminUi();
      if(user){
        $('auth-message').textContent=isAdmin?`管理者：${user.email}`:`已登入 ${user.email}（僅檢視）`;
      }else{
        $('auth-message').textContent='未登入：可檢視、篩選及匯出';
      }
      const result=await loadVisibleData();
      if(isAdmin && result==='empty'){
        try{await initialize();}catch(e){alert(`初始化失敗：${cloudErrorText(e)}`);}
      }
    });
  }catch(err){
    console.error('Firebase module load failed',err);
    cloudLoadState='error';
    setCloudStatus('離線預覽','warn');
    $('auth-message').textContent='Firebase 暫時無法載入；目前仍可使用 R41 本機預覽';
  }
}

// 背景連線；即使 Firebase SDK 載入失敗也不影響頁籤與組織圖。
bootCloud();
