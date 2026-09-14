import {TITLE,TYPES,CAPACITIES,REQUIREMENTS,METHODS,HEADERS,emptyState,emptyMonitoring,validateState,validateMonitoring,cleanup,filterFacilities,statistics,members,shareMonitoring,detachMonitoring,exportRows} from './model.js';
import {makeWorkbook} from './xlsx.js';
const $=id=>document.getElementById(id),escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state=emptyState(),version=0,ready=false,busy=false,owner=false,cloud,unsubscribe,authGeneration=0,selected=new Set(),editing=null;
const ids=()=>crypto.randomUUID();
const filters=()=>({type:$('filter-type').value,site:$('filter-site').value,department:$('filter-department').value,query:$('filter-query').value});
const visibleRows=()=>filterFacilities(state,filters());
function message(text){$('message').textContent=text;$('message').hidden=!text;}
function error(id,text){$(id).textContent=text;$(id).hidden=!text;}
const option=x=>`<option value="${escape(x)}">${escape(x)}</option>`;
function choices(node,values,all){const value=node.value;node.innerHTML=`<option value="">${all}</option>`+values.map(option).join('');node.value=values.includes(value)?value:'';}
const unique=values=>[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-Hant'));
function fillOptions(){
 choices($('filter-site'),unique(state.facilities.map(f=>f.site)),'全部廠區');
 choices($('filter-department'),unique(state.facilities.filter(f=>!$('filter-site').value||f.site===$('filter-site').value).map(f=>f.department)),'全部廠處');
 for(const [id,key,defaults] of [['sites','site',[]],['departments','department',[]],['materials','material',['石油油品類','其他指定物質']],['items','listedItem',[]]])$(id).innerHTML=unique([...defaults,...state.facilities.map(f=>f[key])]).map(option).join('');
}
function render(){
 $('app').hidden=!owner||!ready;$('gate').hidden=owner&&ready;
 if(!owner||!ready){$('table-body').replaceChildren();return;}
 fillOptions();const rows=visibleRows(),stats=statistics(state,rows);
 for(const id of [...selected])if(!rows.some(f=>f.id===id))selected.delete(id);
 for(const [id,value] of [['total',stats.total],['ground',stats.types[0]],['underground',stats.types[1]],['container',stats.types[2]],['monitor',stats.monitored],['wells',stats.wells]])$('stat-'+id).textContent=value;
 $('stat-well-note').textContent=stats.unknownWells?`已填井數；${stats.unknownWells} 組尚未填寫`:'共用井不重複計算';
 $('row-count').textContent=`顯示 ${rows.length} / ${state.facilities.length} 筆`;
 $('selection-count').textContent=`已選 ${selected.size} 筆`;
 $('share').disabled=selected.size<2||busy;
 $('select-all').checked=rows.length>0&&rows.every(f=>selected.has(f.id));$('select-all').indeterminate=selected.size>0&&selected.size<rows.length;
 $('empty').hidden=rows.length>0;$('empty').textContent=state.facilities.length?'沒有符合篩選條件的設施。':'目前沒有設施資料。按「新增設施」開始建檔。';
 $('table-body').innerHTML=rows.map((f,i)=>{const g=state.groups[f.groupId],shared=members(state,f.groupId).length;const values=exportRows(state,[f])[0];values[0]=i+1;return `<tr class="${selected.has(f.id)?'selected':''}"><td><input type="checkbox" data-select="${f.id}" aria-label="選取 ${escape(f.name)}" ${selected.has(f.id)?'checked':''}></td>${values.map((v,j)=>`<td>${j===4?`<strong>${escape(v)}</strong>${shared>1?`<span class="shared">共用監測 · ${shared} 筆</span>`:''}`:j===10?(g.wells===null?'<span class="subtle">未填寫</span>':escape(v)):j>=12?`<pre>${escape(v)||'—'}</pre>`:escape(v)||'—'}</td>`).join('')}<td><div class="row-actions"><button data-action="edit" data-id="${f.id}">編輯</button><button data-action="monitor" data-id="${f.id}">監測資料</button><button data-action="copy" data-id="${f.id}">複製</button>${shared>1?`<button data-action="detach" data-id="${f.id}">解除共用</button>`:''}<button data-action="delete" data-id="${f.id}" class="danger">刪除</button></div></td></tr>`;}).join('');
 for(const id of ['add','export','print','reset'])$(id).disabled=busy;
 document.querySelectorAll('#table-body button').forEach(b=>b.disabled=busy);
}
function confirmAction(title,text){return new Promise(resolve=>{const d=$('confirm-dialog');$('confirm-title').textContent=title;$('confirm-text').textContent=text;d.returnValue='cancel';d.addEventListener('close',()=>resolve(d.returnValue==='confirm'),{once:true});d.showModal();});}
async function persist(next,expected){
 if(!owner||!ready||busy)throw Error('目前無法儲存，請確認已登入且連線正常。');
 validateState(next);busy=true;const generation=authGeneration;$('sync').textContent='儲存中…';render();
 document.querySelectorAll('dialog button,dialog input,dialog select,dialog textarea').forEach(b=>b.disabled=true);
 try{
  await cloud.save(next,expected);
  if(generation!==authGeneration)throw Error('帳號狀態已變更，請重新登入查看儲存結果。');
  if(version<=expected){state=next;version=expected+1;}
  message('已儲存至雲端。');$('sync').textContent='已同步';
 }catch(e){if(generation===authGeneration)$('sync').textContent='儲存未完成';throw e;}
 finally{busy=false;document.querySelectorAll('dialog button,dialog input,dialog select,dialog textarea').forEach(b=>b.disabled=false);render();}
}
function startFacility(id,copy=false){
 if(!ready||busy)return;const original=state.facilities.find(f=>f.id===id);
 const f=original?{...original}: {type:TYPES[0],site:'',department:'',name:'',material:'',listedItem:'',capacity:CAPACITIES[1],requirement:'待確認'};
 if(copy)f.name+='（副本）';editing={kind:'facility',id:copy||!id?ids():id,base:structuredClone(state),version,isNew:copy||!id};
 const form=$('facility-form');form.reset();for(const k of ['type','site','department','name','material','listedItem','capacity','requirement'])form.elements[k].value=f[k];
 $('facility-title').textContent=copy?'複製設施（監測資料另行設定）':id?'編輯設施':'新增設施';error('facility-error','');$('facility-dialog').showModal();
}
function fillMonitoring(g){const f=$('monitor-form');f.reset();f.elements.wells.value=g.wells??'';f.elements.alternative.value=g.alternative;f.elements.result.value=g.result;for(const input of f.querySelectorAll('[name=method]'))input.checked=g.methods.includes(input.value);for(const input of f.querySelectorAll('[name=month]'))input.checked=g.months.includes(Number(input.value));}
function readMonitoring(){const f=$('monitor-form');return validateMonitoring({methods:[...f.querySelectorAll('[name=method]:checked')].map(x=>x.value),wells:f.elements.wells.value===''?null:Number(f.elements.wells.value),months:[...f.querySelectorAll('[name=month]:checked')].map(x=>Number(x.value)),alternative:f.elements.alternative.value.trim(),result:f.elements.result.value.trim()});}
function openMonitoring(id,share=false){
 if(!ready||busy)return;let groupId,targets;
 if(share){targets=state.facilities.filter(f=>selected.has(f.id));if(targets.length<2)return;if(new Set(targets.map(f=>f.site)).size!==1){message('請選擇同一廠區的設施設定共用監測。');return;}}
 else{groupId=state.facilities.find(f=>f.id===id)?.groupId;if(!groupId)return;targets=members(state,groupId);}
 editing={kind:share?'share':'monitor',groupId,ids:targets.map(f=>f.id),base:structuredClone(state),version};
 const common=share&&new Set(targets.map(f=>f.groupId)).size===1?state.groups[targets[0].groupId]:share?emptyMonitoring():state.groups[groupId];
 fillMonitoring(common);error('monitor-error','');$('monitor-title').textContent=share?'設定共用監測':'編輯監測資料';
 $('monitor-members').textContent=`本次套用 ${targets.length} 筆：\n${targets.map(f=>`${f.site}／${f.department}／${f.name}`).join('、')}${share?'\n儲存後，所選設施將使用這一份監測資料；原群組未選成員維持原資料。':''}`;
 $('monitor-dialog').showModal();
}
$('facility-form').onsubmit=async e=>{
 e.preventDefault();if(busy||!editing)return;error('facility-error','');const form=e.target,work=editing,next=structuredClone(work.base),old=next.facilities.find(f=>f.id===work.id),f={id:work.id};
 for(const k of ['type','site','department','name','material','listedItem','capacity','requirement'])f[k]=form.elements[k].value.trim();
 try{
  if(old&&members(next,old.groupId).length>1&&f.site!==old.site)throw Error('此設施正在共用監測。請先解除共用，再變更廠區。');
  f.groupId=old?.groupId||ids();if(!old)next.groups[f.groupId]=emptyMonitoring();
  if(old)next.facilities[next.facilities.findIndex(x=>x.id===f.id)]=f;else next.facilities.push(f);
  await persist(next,work.version);$('facility-dialog').close();editing=null;
 }catch(err){error('facility-error',err.message);}
};
$('monitor-form').onsubmit=async e=>{e.preventDefault();if(busy||!editing)return;error('monitor-error','');const work=editing;try{const g=readMonitoring();let next;if(work.kind==='share')next=shareMonitoring(work.base,work.ids,g,ids());else{next=structuredClone(work.base);next.groups[work.groupId]=g;}await persist(next,work.version);$('monitor-dialog').close();selected.clear();editing=null;render();}catch(err){error('monitor-error',err.message);}};
$('table-body').onclick=async e=>{
 const b=e.target.closest('[data-action]');if(!b||busy||!ready)return;const id=b.dataset.id,f=state.facilities.find(f=>f.id===id);if(!f)return;
 if(b.dataset.action==='edit')return startFacility(id);if(b.dataset.action==='copy')return startFacility(id,true);if(b.dataset.action==='monitor')return openMonitoring(id);
 const base=structuredClone(state),expected=version,generation=authGeneration;
 if(b.dataset.action==='detach'){
  if(!await confirmAction('解除共用監測',`將「${f.name}」改為獨立監測，監測欄位會清空，請另行填寫。其他共用成員保持原資料。`))return;
  if(generation!==authGeneration)return;
  try{await persist(detachMonitoring(base,id,ids()),expected);}catch(err){message(err.message);}
 }else if(b.dataset.action==='delete'){
  if(!await confirmAction('刪除設施',`確定刪除「${f.name}」？這筆基本資料將移除，其他共用成員不受影響。`))return;
  if(generation!==authGeneration)return;
  base.facilities=base.facilities.filter(x=>x.id!==id);try{await persist(cleanup(base),expected);selected.delete(id);render();}catch(err){message(err.message);}
 }
};
$('table-body').onchange=e=>{if(e.target.dataset.select){if(e.target.checked)selected.add(e.target.dataset.select);else selected.delete(e.target.dataset.select);render();}};
$('add').onclick=()=>startFacility();$('share').onclick=()=>openMonitoring(null,true);
for(const id of ['filter-type','filter-site','filter-department','filter-query'])$(id).addEventListener(id==='filter-query'?'input':'change',()=>{selected.clear();render();});
$('reset').onclick=()=>{for(const id of ['filter-type','filter-site','filter-department','filter-query'])$(id).value='';selected.clear();render();};
$('export').onclick=()=>{
 const rows=visibleRows(),stats=statistics(state,rows),scope=filters();
 const summary=[['表名',TITLE],['匯出時間',new Date().toLocaleString('zh-TW')],['類型篩選',scope.type||'全部'],['廠區篩選',scope.site||'全部'],['廠處篩選',scope.department||'全部'],['關鍵字',scope.query],['設施總數',stats.total],...TYPES.map((t,i)=>[t,stats.types[i]]),['需監測設施',stats.monitored],['土壤氣體監測井（去重）',stats.wells],['未填井數的監測組數',stats.unknownWells],['井數說明','共用資料只計一次；篩選部分成員仍計整組井數。請勿直接加總明細井數。']];
 const blob=makeWorkbook(HEADERS,exportRows(state,rows),summary),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=TITLE+'.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
};
$('print').onclick=()=>window.print();
for(const d of document.querySelectorAll('dialog')){d.addEventListener('cancel',e=>{if(busy)e.preventDefault();});d.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>{if(!busy)d.close();});}
$('login').onclick=async()=>{if(!cloud)return;$('login').disabled=true;try{await cloud.login();}catch(e){$('auth-message').textContent=`登入未完成：${e.code||e.message}。請確認允許登入彈出視窗。`;}finally{$('login').disabled=false;}};
$('logout').onclick=async()=>{if(busy)return;try{await cloud.logout();}catch(e){message('登出未完成，請稍後重試。');}};
$('reload').onclick=()=>location.reload();
$('filter-type').insertAdjacentHTML('beforeend',TYPES.map(option).join(''));
for(const [key,options] of [['type',TYPES],['capacity',CAPACITIES],['requirement',REQUIREMENTS]])$('facility-form').elements[key].innerHTML=options.map(option).join('');
$('method-options').innerHTML=METHODS.map(x=>`<label><input type="checkbox" name="method" value="${x}">${x}</label>`).join('');
$('month-options').innerHTML=Array.from({length:12},(_,i)=>`<label><input type="checkbox" name="month" value="${i+1}">${i+1} 月</label>`).join('');
const widths=[44,58,112,110,110,170,145,125,190,100,155,100,100,230,230,180];
$('columns').innerHTML=widths.map(w=>`<col style="width:${w}px">`).join('');
$('facilities-table').style.width=widths.reduce((a,b)=>a+b,0)+'px';
$('table-head').innerHTML=`<th><input id="select-all" type="checkbox" aria-label="選取目前篩選的所有設施"></th>`+HEADERS.map((h,i)=>`<th scope="col">${h}${i>0?`<span class="resize-handle" data-column="${i+1}" aria-hidden="true"></span>`:''}</th>`).join('')+'<th scope="col">操作</th>';
$('select-all').onchange=e=>{selected=new Set(e.target.checked?visibleRows().map(f=>f.id):[]);render();};
$('table-head').addEventListener('pointerdown',e=>{const handle=e.target.closest('[data-column]');if(!handle)return;const index=Number(handle.dataset.column),col=$('columns').children[index],start=e.clientX,width=parseFloat(col.style.width);handle.setPointerCapture(e.pointerId);const move=event=>{widths[index]=Math.max(85,width+event.clientX-start);col.style.width=widths[index]+'px';$('facilities-table').style.width=widths.reduce((a,b)=>a+b,0)+'px';};const end=()=>{handle.removeEventListener('pointermove',move);handle.removeEventListener('pointerup',end);handle.removeEventListener('pointercancel',end);};handle.addEventListener('pointermove',move);handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);});
window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});
async function start(){
 try{
  cloud=await import('./cloud.js');$('login').disabled=false;
  cloud.observeAuth(user=>{
   const generation=++authGeneration;if(unsubscribe)unsubscribe();unsubscribe=null;state=emptyState();version=0;ready=false;owner=false;selected.clear();editing=null;
   document.querySelectorAll('dialog[open]').forEach(d=>d.close());$('facility-form').reset();$('monitor-form').reset();
   $('logout').hidden=!user;$('login').hidden=!!user;$('user-label').textContent=user?.email||'';message('');render();
   if(!user){$('sync').textContent='尚未登入';$('auth-message').textContent='請使用 doublewater0804@gmail.com 登入。';return;}
   if(!cloud.isOwner(user)){$('sync').textContent='未授權';$('auth-message').textContent='此帳號未獲授權。請登出後，使用管理者帳號登入。';return;}
   owner=true;$('sync').textContent='讀取中…';$('auth-message').textContent='正在讀取雲端基本資料…';$('reload').hidden=false;
   unsubscribe=cloud.watch(data=>{
    if(generation!==authGeneration)return;
    try{const incoming=data?validateState({facilities:data.facilities,groups:data.groups}):emptyState();if(data&&(!Number.isInteger(data.version)||data.version<1))throw Error('資料版本無效');state=incoming;version=data?.version||0;ready=true;$('sync').textContent='已同步';render();}
    catch(e){ready=false;state=emptyState();$('auth-message').textContent=`資料載入失敗：${e.message}`;$('sync').textContent='資料異常';render();}
   },e=>{if(generation!==authGeneration)return;ready=false;state=emptyState();$('sync').textContent='連線失敗';$('auth-message').textContent=`無法讀取雲端資料：${e.code||e.message}。請確認連線後重新載入。`;render();});
  });
 }catch(e){$('auth-message').textContent='登入服務載入失敗，請確認網路後重新載入。';$('reload').hidden=false;$('login').disabled=true;}
}
start();
