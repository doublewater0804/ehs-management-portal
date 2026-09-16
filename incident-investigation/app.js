import {printMarkup,preparePrint} from './print.js?v=20260916-v3';
import {AREAS,REGIONS,OPTIONS,STATES,TW_FIELDS,PERSON_FIELDS,clone,normalize,validate,getDuty,setDuty,mergeSeed} from './model.js?v=20260916-v3';
import * as cloud from './cloud.js?v=20260916-v3';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let live=null,draft=null,baseVersion=0,region='tw',tab='overview',generation=0,unsubscribe,busy=false,printOpen=[],printKind=null;
const current=()=>draft||live;
const areaName=a=>AREAS.find(x=>x[0]===a)?.[1]||a;
const val=(obj,path)=>path.split('.').reduce((o,k)=>o[k],obj);
function set(obj,path,value){const keys=path.split('.');const key=keys.pop();keys.reduce((o,k)=>o[k],obj)[key]=value;}
const input=(path,value,label='',type='text')=>draft?`<input type="${type}" data-path="${path}" aria-label="${esc(label||path)}" value="${esc(value)}" maxlength="${path.includes('review')?250:200}">`:esc(value||'—');
const select=(path,value,options,label='',blank=true)=>draft?`<select data-path="${path}" aria-label="${esc(label||path)}">${blank?'<option value="">尚未設定</option>':''}${options.map(o=>{const [v,t]=Array.isArray(o)?o:[o,o];return `<option value="${esc(v)}" ${v===value?'selected':''}>${esc(t)}</option>`;}).join('')}</select>`:esc(value||'尚未設定');
const textarea=(path,value,label)=>draft?`<label>${esc(label)}<textarea rows="8" data-path="${path}" maxlength="20000">${esc(value)}</textarea></label>`:`<div class="rule-text">${esc(value||'尚未匯入')}</div>`;
const dutyPath=a=>AREAS.findIndex(x=>x[0]===a)<3?'duty.'+REGIONS[AREAS.findIndex(x=>x[0]===a)]:'overseasDuty.'+a;
function message(s){$('status').textContent=s;}
function clear(){live=null;draft=null;$('content').hidden=true;for(const id of ['overview','roster','rules'])$(id).replaceChildren();$('import-panel').hidden=true;$('import-file').value='';$('apply-duty').checked=false;$('replace-overseas').checked=false;$('print-root').replaceChildren();$('print-panel').hidden=true;}
function render(){
 const d=current();$('content').hidden=!d;if(!d)return;
 $('edit').hidden=!cloud.owner()||!!draft;$('import').hidden=!cloud.owner()||!!draft;$('editor-actions').hidden=!draft;$('print').disabled=!!draft;$('logout').disabled=busy;
 for(const b of document.querySelectorAll('[data-tab]'))b.setAttribute('aria-pressed',String(b.dataset.tab===tab));
 for(const name of ['overview','roster','rules'])$(name).hidden=name!==tab;
 renderOverview(d);renderRoster(d);renderRules(d);
}
function renderOverview(d){
 $('overview').innerHTML=`<div class="panel"><h2>下次出動組別</h2><div class="duty-grid">${AREAS.map(([a,label])=>{
 const duty=getDuty(d,a);let contact='';
 if(a.startsWith('tw')){const r=d.rows.find(x=>x.region===label.split(' · ')[1]&&x.group===duty[0]);if(r)contact=`<p>督導主管：${esc(r.supervisor||'未填寫')}<br>組長：${esc(r.leader||'未填寫')}</p>`;}
 return `<div class="duty-item"><span>${label}</span><strong>${esc(duty||'尚未設定')}</strong>${draft?select(dutyPath(a),a.startsWith('tw')?(duty[0]||''):duty,a.startsWith('tw')?['A','B','C']:OPTIONS[a],label+'下次出動組別'):contact}</div>`;}).join('')}</div></div>
 <div class="panel"><div class="toolbar"><h2>調查出動紀錄</h2>${draft?'<button data-action="add-record">＋ 新增紀錄</button>':''}</div><div class="scroll"><table><thead><tr><th>地區</th><th>出動組別</th><th>督導主管</th><th>調查日期</th><th>狀態</th><th>當次記錄的下次組別</th>${draft?'<th>操作</th>':''}</tr></thead><tbody>${d.records.map((r,i)=>`<tr class="${r.status==='暫停調查'?'pause':''}"><td>${draft?select('records.'+i+'.area',r.area,AREAS,'紀錄地區',false):esc(areaName(r.area))}</td><td>${select('records.'+i+'.group',r.group,OPTIONS[r.area],'出動組別',false)}</td><td>${input('records.'+i+'.supervisor',r.supervisor,'當次督導主管')}</td><td>${input('records.'+i+'.date',r.date,'調查日期','date')}</td><td>${draft?select('records.'+i+'.status',r.status,STATES,'調查狀態',false):`<span class="badge ${r.status==='暫停調查'?'pause':r.status==='已完成'?'done':''}">${r.status}</span>`}</td><td>${select('records.'+i+'.nextGroup',r.nextGroup,OPTIONS[r.area],'當次下次組別')}</td>${draft?`<td><button class="danger" data-delete="${i}">移除</button></td>`:''}</tr>`).join('')}</tbody></table></div>${!d.records.length?'<p class="muted">尚無調查紀錄。管理者可匯入資料或新增紀錄。</p>':''}</div>
 <div class="panel"><h2>補充說明</h2>${textarea('supplement',d.supplement,'補充說明')}</div>`;
}
function renderRoster(d){
 let html=`<div class="panel"><div class="toolbar controls"><h2>各地人員名冊</h2><nav aria-label="名冊地區">${[['tw','台灣'],['cn','大陸'],['vn','越南']].map(([a,n])=>`<button data-region="${a}" aria-pressed="${a===region}">${n}</button>`).join('')}</nav></div>`;
 if(region==='tw'){
 html+=`<p>名冊版本：${input('revision',d.revision,'台灣名冊版本')}</p>`;
 for(const r of REGIONS){html+=`<h3>${r}</h3>`;
 if(!draft)html+=`<div class="scroll"><table><thead><tr><th>組別</th><th>下次出動</th><th>事業部</th><th>督導主管／職稱</th><th>手機／桌機</th><th>組長</th><th>單位／專長</th><th>手機／桌機</th></tr></thead><tbody>${d.rows.filter(x=>x.region===r).map(x=>`<tr class="${d.duty[r]===x.group?'active':''}">${[x.group,d.duty[r]===x.group?'✓':'',x.department,x.supervisor+'\n'+x.title,x.supervisorMobile+'\n'+x.supervisorPhone,x.leader,x.unit+'\n'+x.expertise,x.leaderMobile+'\n'+x.leaderPhone].map(v=>`<td>${esc(v||'—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
 else html+=d.rows.map((x,i)=>x.region!==r?'':`<details class="group"><summary>${r} ${x.group} 組</summary><div class="fields">${Object.entries(TW_FIELDS).map(([k,label])=>`<label>${label}${input('rows.'+i+'.'+k,x[k],r+x.group+label)}</label>`).join('')}</div></details>`).join('');}
 }else{
 html+=`<p>名冊版本：${input('sourceVersions.'+region,d.sourceVersions[region],'名冊來源版本')}</p><p class="muted">名冊與當次調查主管分別保留；人員異動可由管理者修正。</p>`;
 if(!draft){
 const roles=d.overseas[region][0].people.map(p=>p.role);
 html+=`<div class="scroll"><table class="overseas-wide"><thead><tr><th>公司／組別</th><th>下次出動</th>${roles.map(role=>`<th>${esc(role)}</th>`).join('')}</tr></thead><tbody>${d.overseas[region].map(t=>`<tr class="${(region==='cn'?t.group:t.company+' '+t.group.split(' ').slice(-2).join(' '))===d.overseasDuty[region]?'active':''}"><td>${esc(t.company)}<br>${esc(t.group)}</td><td>${(region==='cn'?t.group:t.group)===d.overseasDuty[region]?'✓':''}</td>${t.people.map(p=>`<td><strong>${esc(p.name||'—')}</strong>${p.title?'<br>'+esc(p.title):''}${p.unit?'<br>'+esc(p.unit):''}${p.expertise?'<br>'+esc(p.expertise):''}<br>手機：${esc(p.mobile||'—')}<br>桌機：${esc(p.phone||'—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
 }else d.overseas[region].forEach((t,i)=>{
 html+=`<details class="group" open><summary>${esc(t.company)} · ${esc(t.group)}</summary>${t.people.map((p,j)=>`<div class="person"><div class="person-title">${esc(p.role)}</div><div class="fields">${Object.entries(PERSON_FIELDS).map(([k,label])=>`<label>${label}${input('overseas.'+region+'.'+i+'.people.'+j+'.'+k,p[k],t.group+p.role+label)}</label>`).join('')}</div></div>`).join('')}</details>`;
 });
 if(region==='cn')html+=`<h3>備援人員</h3>${textarea('backupPersonnel',d.backupPersonnel,'備援人員')}`;
 else html+='<p>河靜公司：調查小組由公司指派。</p>';
 }
 $('roster').innerHTML=html+'</div>';
}
function renderRules(d){$('rules').innerHTML=`<div class="panel"><h2>台灣調查作業規定</h2>${draft?`<label>每行一點<textarea data-notes rows="12" maxlength="20000">${esc(d.notes.join('\n'))}</textarea></label>`:`<ol>${d.notes.map(n=>`<li>${esc(n)}</li>`).join('')}</ol>`}</div><div class="panel"><h2>大陸廠區執行方式</h2>${textarea('regionalRules.cn',d.regionalRules.cn,'大陸輪值規定')}</div><div class="panel"><h2>越南廠區輪值規定</h2>${textarea('regionalRules.vn',d.regionalRules.vn,'越南輪值規定')}</div>`;}
function begin(){if(!cloud.owner()||!live||busy)return;draft=clone(live);baseVersion=live.version;$('import-panel').hidden=true;$('print-panel').hidden=true;render();message('編輯中，修改後請按「儲存至雲端」。');}
$('content').addEventListener('input',e=>{if(!draft||busy)return;const p=e.target.dataset.path;if(p)set(draft,p,e.target.value);if(e.target.hasAttribute('data-notes'))draft.notes=e.target.value.split('\n').map(s=>s.trim()).filter(Boolean);});
$('content').addEventListener('change',e=>{
 if(!draft||busy)return;const p=e.target.dataset.path;if(!p)return;set(draft,p,e.target.value);
 if(/^records\.\d+\.area$/.test(p)){const i=Number(p.split('.')[1]);draft.records[i].group=OPTIONS[e.target.value][0];draft.records[i].nextGroup='';renderOverview(draft);}
 else if(p.startsWith('duty.')||p.startsWith('overseasDuty.'))renderOverview(draft);
});
$('content').addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b||busy)return;
 if(b.dataset.tab){tab=b.dataset.tab;$('import-panel').hidden=true;$('print-panel').hidden=true;render();}
 if(b.dataset.region){region=b.dataset.region;renderRoster(current());}
 if(b.dataset.action==='add-record'&&draft){if(draft.records.length>=300){message('最多 300 筆紀錄。');return;}draft.records.push({id:crypto.randomUUID(),area:'tw-north',group:'A 組',supervisor:'',date:new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Taipei'}),status:'調查中',nextGroup:''});renderOverview(draft);}
 if(b.dataset.delete!==undefined&&draft){if(confirm('移除此筆調查紀錄？儲存後才會套用。')){draft.records.splice(Number(b.dataset.delete),1);renderOverview(draft);}}
});
$('edit').onclick=begin;
$('cancel').onclick=()=>{if(busy)return;draft=null;render();message('已取消編輯，顯示雲端最新資料。');};
$('save').onclick=async()=>{
 if(!draft||busy||!cloud.owner())return;const gen=generation;const pending=clone(draft);
 try{validate(pending);busy=true;document.querySelectorAll('#content button,#content input,#content textarea,#content select,#logout').forEach(e=>e.disabled=true);message('正在儲存至雲端…');const saved=await cloud.save(pending,baseVersion);if(gen!==generation)return;if(!live||live.version<=saved.version)live=saved;draft=null;message('已儲存至雲端。');}
 catch(e){if(gen===generation)message('儲存失敗：'+e.message);}
 finally{busy=false;document.querySelectorAll('#content button,#content input,#content textarea,#content select,#logout').forEach(e=>e.disabled=false);if(gen===generation)render();}
};
$('import').onclick=()=>{if(!cloud.owner()||draft)return;$('import-panel').hidden=!$('import-panel').hidden;$('import-file').value='';$('apply-duty').checked=false;$('replace-overseas').checked=false;$('print-root').replaceChildren();$('print-panel').hidden=true;};
$('import-file').onchange=async e=>{
 const file=e.target.files[0];if(!file||!cloud.owner()||!live||busy)return;const gen=generation;const base=clone(live);const apply=$('apply-duty').checked;const replaceOverseas=$('replace-overseas').checked;
 try{if(file.size>800000)throw Error('匯入檔過大。');const raw=JSON.parse(await file.text());if(gen!==generation||live.version!==base.version)throw Error('帳號或資料已變更，請重新匯入。');draft=mergeSeed(base,raw,apply,replaceOverseas);baseVersion=base.version;$('import-panel').hidden=true;render();message('已載入新增資料，尚未儲存。請核對各地名冊、調查紀錄與輪值設定後按「儲存至雲端」。');}
 catch(e){message('匯入失敗：'+e.message);}
};
$('login').disabled=false;$('login').onclick=()=>cloud.login().catch(e=>message('登入失敗：'+e.message));
$('logout').onclick=async()=>{if(busy)return;if(draft&&!confirm('尚有未儲存內容，確定登出並放棄修改？'))return;try{await cloud.logout();}catch(e){message(e.message);}};
$('print').onclick=()=>{if(draft||!live)return;$('print-panel').hidden=!$('print-panel').hidden;$('import-panel').hidden=true;$('print-kind').value=tab==='roster'?region:'overview';};
$('print-close').onclick=()=>{$('print-panel').hidden=true;};
$('print-go').onclick=async()=>{if(draft||!live)return;printKind=$('print-kind').value;await preparePrint($('print-root'),printMarkup(live,printKind));window.print();};
window.addEventListener('beforeprint',()=>{if(live&&!draft){printKind=printKind||(tab==='roster'?region:'overview');$('print-root').innerHTML=printMarkup(live,printKind);preparePrint($('print-root'));}});
window.addEventListener('afterprint',()=>{printKind=null;$('print-root').replaceChildren();});
window.addEventListener('beforeunload',e=>{if(draft){e.preventDefault();e.returnValue='';}});
cloud.observe(user=>{const gen=++generation;unsubscribe?.();clear();$('account').textContent=user?.email||'';$('login').hidden=!!user;$('logout').hidden=!user;
 if(!user){message('請登入後查看人員名冊。');return;}message('正在讀取雲端資料…');
 unsubscribe=cloud.watch(d=>{if(gen!==generation)return;live=d;if(draft){if(d.version!==baseVersion)message('其他視窗已更新資料。你的編輯仍保留；請取消後重新修改，以免覆蓋。');return;}render();message(d.version===0?'尚未建立資料。請由管理者匯入名冊，或按「編輯資料」填寫。':cloud.owner()?'已同步，可編輯名冊、輪值與調查紀錄。':'已同步，目前為唯讀模式。');},e=>{if(gen!==generation)return;clear();message('無法讀取資料：'+e.message+'。請確認網路及 Firebase 規則。');});
});
