import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,doc,onSnapshot,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import {firebaseConfig,ADMIN_EMAIL} from '../portal/config.js';
const app=initializeApp(firebaseConfig,'ehs-portal'),auth=getAuth(app),db=getFirestore(app),ref=doc(db,'incident_investigation','roster');
const $=id=>document.getElementById(id),regions=['北區','中區','南區'],groups=['A','B','C'];
const fields={department:'輪值事業部',supervisor:'督導主管',title:'職稱',supervisorMobile:'主管手機',supervisorPhone:'主管座機',leader:'組長姓名',unit:'單位',expertise:'專長',leaderMobile:'組長手機',leaderPhone:'組長座機'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const empty=()=>({version:0,rows:regions.flatMap(region=>groups.map(group=>({region,group,...Object.fromEntries(Object.keys(fields).map(k=>[k,'']))}))),duty:{},notes:[],revision:''});
let data=null,baseVersion=0,stop,generation=0,saving=false;
const owner=()=>auth.currentUser?.email===ADMIN_EMAIL&&auth.currentUser?.emailVerified;
function validate(d){if(!d||!d.duty||typeof d.duty!=='object'||typeof d.revision!=='string'||d.revision.length>100||!Array.isArray(d.rows)||d.rows.length!==9||!Number.isInteger(d.version)||!Array.isArray(d.notes)||d.notes.length>30)throw Error('名冊格式不正確');regions.forEach(region=>{if(d.duty[region]&&!groups.includes(d.duty[region]))throw Error('輪值組別不正確');groups.forEach(group=>{const matches=d.rows.filter(r=>r.region===region&&r.group===group);if(matches.length!==1)throw Error('區域組別不完整');for(const k in fields)if(typeof matches[0][k]!=='string'||matches[0][k].length>150)throw Error('欄位內容過長或格式錯誤');});});if(d.notes.some(n=>typeof n!=='string'||n.length>1000))throw Error('規定格式錯誤');return d;}
function render(){ $('content').hidden=!data;$('edit').hidden=!owner();$('import').hidden=!owner();if(!data)return;
$('current').innerHTML=regions.map(region=>{const r=data.rows.find(r=>r.region===region&&r.group===data.duty[region]);return `<article class="card"><h3>${region} · ${r?r.group+' 組':'尚未設定'}</h3>${r?`<p>督導主管：${esc(r.supervisor)}<br>${esc(r.supervisorMobile)} ／ ${esc(r.supervisorPhone)}</p><p>組長：${esc(r.leader)}（${esc(r.unit)}）<br>${esc(r.leaderMobile)} ／ ${esc(r.leaderPhone)}</p>`:''}</article>`;}).join('');
$('rows').innerHTML=data.rows.map(r=>`<tr class="${data.duty[r.region]===r.group?'active':''}">${[r.region,r.group,data.duty[r.region]===r.group?'✓ 輪值':'',r.department,r.supervisor,r.title,r.supervisorMobile+'\n'+r.supervisorPhone,r.leader,r.unit,r.expertise,r.leaderMobile+'\n'+r.leaderPhone].map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join('');$('notes').innerHTML=data.notes.map(n=>`<li>${esc(n)}</li>`).join('');$('revision').textContent=data.revision||'';}
$('login').onclick=()=>signInWithPopup(auth,new GoogleAuthProvider()).catch(e=>$('status').textContent='登入失敗：'+e.message);
$('logout').onclick=()=>signOut(auth).catch(e=>$('status').textContent=e.message);
$('print').onclick=()=>window.print();
$('import').onclick=()=>{if(owner()&&data){$('importFile').value='';$('importFile').click();}};
$('importFile').onchange=async e=>{
 const file=e.target.files[0];if(!file||!owner()||!data)return;
 const gen=generation,version=data.version;
 try{
  if(file.size>100000)throw Error('檔案超過大小限制');
  const imported=validate(JSON.parse(await file.text()));
  if(gen!==generation||!owner()||!data||data.version!==version)throw Error('帳號或資料已更新，請重試。');
  $('edit').click();
  data.rows.forEach((r,i)=>{
   const source=imported.rows.find(x=>x.region===r.region&&x.group===r.group);
   for(const k in fields)$('form').elements.namedItem(`${i}-${k}`).value=source[k];
  });
  $('rulesText').value=imported.notes.join('\n');$('sourceRevision').value=imported.revision;
  $('status').textContent='已載入圖片名冊，尚未儲存。請核對人名與電話、選擇三區輪值組別，再按「儲存至雲端」。';
 }catch(e){$('status').textContent='匯入失敗：'+e.message;}
};
$('cancel').onclick=()=>{$('form').hidden=true;$('fields').replaceChildren();render();};
$('edit').onclick=()=>{if(!owner()||!data)return;baseVersion=data.version;$('content').hidden=true;$('form').hidden=false;
$('fields').innerHTML=regions.map(region=>`<fieldset><legend>${region}輪值</legend>${groups.map(group=>`<label><input required type="radio" name="duty-${region}" value="${group}" ${data.duty[region]===group?'checked':''}> ${group} 組</label>`).join('')}${data.rows.map((r,i)=>r.region!==region?'':`<div class="person"><strong>${r.group} 組</strong>${Object.entries(fields).map(([k,label])=>`<label>${label}<input maxlength="150" name="${i}-${k}" value="${esc(r[k])}"></label>`).join('')}</div>`).join('')}</fieldset>`).join('');$('rulesText').value=data.notes.join('\n');$('sourceRevision').value=data.revision||'';};
$('form').onsubmit=async e=>{e.preventDefault();if(saving||!owner())return;const saveGeneration=generation;const form=new FormData(e.target),next={version:baseVersion+1,rows:data.rows.map((r,i)=>({region:r.region,group:r.group,...Object.fromEntries(Object.keys(fields).map(k=>[k,String(form.get(`${i}-${k}`)||'').trim()]))})),duty:Object.fromEntries(regions.map(region=>[region,form.get('duty-'+region)])),notes:$('rulesText').value.split('\n').map(s=>s.trim()).filter(Boolean),revision:$('sourceRevision').value.trim()};const button=e.target.querySelector('[type=submit]');
try{validate(next);saving=true;button.disabled=true;$('cancel').disabled=true;await runTransaction(db,async tx=>{const s=await tx.get(ref);if((s.exists()?s.data().version:0)!==baseVersion)throw Error('資料已被其他視窗更新，請取消編輯後重新操作。');tx.set(ref,{...next,updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid});});if(saveGeneration!==generation)return;data=next;$('form').hidden=true;$('fields').replaceChildren();$('status').textContent='已儲存至雲端。';render();}catch(e){$('status').textContent='儲存失敗：'+e.message;}finally{saving=false;button.disabled=false;$('cancel').disabled=false;}};
onAuthStateChanged(auth,user=>{const gen=++generation;stop?.();data=null;$('form').hidden=true;$('form').reset();$('fields').replaceChildren();$('rows').replaceChildren();$('current').replaceChildren();$('notes').replaceChildren();$('revision').textContent='';render();$('login').hidden=!!user;$('logout').hidden=!user;$('account').textContent=user?.email||'';if(!user){$('status').textContent='請登入後查看人員名冊。';return;}$('status').textContent='正在讀取雲端資料…';stop=onSnapshot(ref,{includeMetadataChanges:true},s=>{if(gen!==generation||s.metadata.fromCache||s.metadata.hasPendingWrites)return;try{data=validate(s.exists()?s.data():empty());$('status').textContent=s.exists()?(owner()?'你可以修改名冊與輪值。':'目前為唯讀模式。'):'尚未匯入初始名冊。';if($('form').hidden)render();}catch(e){data=null;render();$('status').textContent=e.message;}},e=>{if(gen!==generation)return;data=null;$('form').hidden=true;$('fields').replaceChildren();render();$('status').textContent='無法讀取名冊，請確認網路與 Firebase 權限：'+e.message;});});
