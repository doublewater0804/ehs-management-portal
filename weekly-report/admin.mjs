import {initializeApp,getApp,getApps} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,doc,getDoc,setDoc,collection,getDocs,addDoc,serverTimestamp,query,orderBy,limit} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import {firebaseConfig,ADMIN_EMAIL} from '../portal/config.js';
import {DEFAULT_CONFIG,normalizeConfig,buildReport,localDate,localTime} from './engine.mjs';
import {nextScheduledDate,scheduleLabel} from './scheduler.mjs';
const $=id=>document.getElementById(id);
// 與 EHS 入口相同的 Firebase App 名稱，重用已登入的帳號狀態。
const fb=getApps().find(a=>a.name==='ehs-portal')||initializeApp(firebaseConfig,'ehs-portal');
const auth=getAuth(fb),db=getFirestore(fb),ref=doc(db,'ehs_weekly_report','config');
let allowed=false,config=normalizeConfig(DEFAULT_CONFIG),dirty=false;
function notice(message='',type=''){$('notice').textContent=message;$('notice').className=`message ${type}`;}
function mustBeOwner(){if(!allowed||auth.currentUser?.email!==ADMIN_EMAIL||!auth.currentUser?.emailVerified)throw Error('僅限已驗證的 EHS 管理者帳號操作。');}
function render(){
  $('enabled').checked=config.enabled;$('day').value=config.day;$('send-time').value=`${String(config.hour).padStart(2,'0')}:${String(config.minute).padStart(2,'0')}`;
  for(const k of Object.keys(config.sections))if($(k))$(k).checked=config.sections[k];
  for(const k of Object.keys(config.features))if($(k))$(k).checked=config.features[k];
  $('maxItems').value=String(config.maxItems);
  $('config-status').textContent=config.enabled?'已設定啟用（需另啟動 GitHub 排程）':'尚未啟用';
  $('custom-list').replaceChildren();
  for(const source of config.customSources){
    const line=document.createElement('div');line.className='custom';const a=document.createElement('div'),b=document.createElement('b'),small=document.createElement('small'),btn=document.createElement('button');
    b.textContent=source.title;small.textContent=`${source.collection}｜${source.titleField}、${source.statusField}`;
    btn.className='outline';btn.textContent='移除';btn.onclick=()=>{if(!confirm(`從週報設定移除「${source.title}」？不會刪除原系統資料。`))return;config=fromUI();config.customSources=config.customSources.filter(x=>x.id!==source.id);dirty=true;render();};
    const editButton=document.createElement('button');editButton.className='outline';editButton.textContent='編輯';editButton.onclick=()=>{
      config=fromUI();$('c-id').value=source.id;$('c-title').value=source.title;$('c-collection').value=source.collection;
      for(const key of ['titleField','statusField','dateField','doneValue'])$('c-'+key).value=source[key];
      $('custom-form').closest('details').open=true;$('c-title').focus();
    };
    const actions=document.createElement('div');actions.append(editButton,btn);
    a.append(b,small);line.append(a,actions);$('custom-list').append(line);
  }
}
function fromUI(){
  const time=$('send-time').value;
  if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('發送時間請使用有效的 HH:MM 格式（00:00～23:59）。');
  const [hour,minute]=time.split(':').map(Number);
  const next={...config,enabled:$('enabled').checked,day:Number($('day').value),hour,minute,maxItems:Number($('maxItems').value),sections:{},features:{}};
  for(const k of Object.keys(DEFAULT_CONFIG.sections))next.sections[k]=$(k).checked;
  for(const k of Object.keys(DEFAULT_CONFIG.features))next.features[k]=$(k).checked;
  return normalizeConfig(next);
}
for(const el of document.querySelectorAll('#app input,#app select'))el.addEventListener('change',()=>{dirty=true;});
$('login').onclick=async()=>{try{await signInWithPopup(auth,new GoogleAuthProvider());}catch(e){$('auth-message').textContent=`登入未完成：${e.message}`;}};
$('logout').onclick=()=>signOut(auth);
onAuthStateChanged(auth,async user=>{
  allowed=Boolean(user&&user.email===ADMIN_EMAIL&&user.emailVerified);
  $('app').hidden=!allowed;$('gate').hidden=allowed;$('logout').hidden=!user;
  $('auth-message').textContent=!user?'請使用 EHS 管理員 Google 帳號登入。':allowed?'已驗證':'此帳號沒有週報管理權限。';
  if(!allowed)return;
  try{const snap=await getDoc(ref);mustBeOwner();config=normalizeConfig(snap.exists()?snap.data():DEFAULT_CONFIG);render();notice(snap.exists()?'已載入雲端設定。':'尚無雲端設定，請先儲存預設設定。');await refreshMonitor();}
  catch(e){notice(`讀取週報設定失敗：${e.message}。請檢查 Firestore Rules。`,'error');}
});
$('save').onclick=async()=>{
  try{mustBeOwner();const next=fromUI();await setDoc(ref,{...next,updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid});config=next;dirty=false;render();notice('週報設定已儲存。GitHub 定時檢查可能延遲；請在下方排程監控查看最新紀錄。','success');await refreshMonitor();}
  catch(e){notice(`設定儲存失敗：${e.message}`,'error');}
};
$('custom-form').onsubmit=e=>{
  e.preventDefault();
  const field=id=>$(id).value.trim();const currentId=field('c-id');
  const entry={id:currentId||`other_${Date.now()}`,title:field('c-title'),collection:field('c-collection'),
    titleField:field('c-titleField'),statusField:field('c-statusField'),dateField:field('c-dateField'),doneValue:field('c-doneValue'),enabled:true};
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(entry.collection)){return notice('集合名稱只能使用英文、數字、底線、減號。','error');}
  for(const f of ['titleField','statusField','dateField'])if(!/^[a-zA-Z0-9_-]{1,40}$/.test(entry[f]))return notice('欄位名稱只能使用英文、數字、底線、減號。','error');
  config=fromUI();config.customSources=config.customSources.filter(x=>x.id!==entry.id);config.customSources.push(entry);dirty=true;render();$('custom-form').reset();$('c-id').value='';notice('已新增／更新來源。請按「儲存週報設定」才會上傳。');
};
async function fetchData(conf){
  const tasks=conf.sections.tasks?(await getDocs(collection(db,'ehs_tasks'))).docs.map(x=>x.data()):[];
  const projects=conf.sections.projects?(await getDocs(collection(db,'ehs-dashboard-2024_projects'))).docs.map(x=>x.data()):[];
  const flare=conf.sections.flare?(await getDoc(doc(db,'flare_control','global_state'))).data()?.state||{}:{};
  const custom={};for(const s of conf.customSources.filter(x=>x.enabled))custom[s.id]=(await getDocs(collection(db,s.collection))).docs.map(x=>x.data());
  return {tasks,projects,flare,custom};
}
$('preview').onclick=async()=>{
  try{mustBeOwner();notice('正在讀取各系統資料，請稍候…');const conf=fromUI(),data=await fetchData(conf);
    const report=buildReport(data,conf,new Date());$('report-preview').textContent=report.text;
    notice('預覽完成：未傳送到 Discord，內容可能與下次週日即時資料不同。','success');}
  catch(e){notice(`無法預覽：${e.message}`,'error');}
};
$('test').onclick=async()=>{
  try{mustBeOwner();if(dirty)throw Error('設定已變更，請先按「儲存週報設定」。');
    if(!confirm('確定提出 Discord 測試寄送申請？測試與正式週報分開，需由 GitHub Actions 排程或手動工作流程處理。'))return;
    await addDoc(collection(db,'ehs_weekly_report_requests'),{status:'pending',createdAt:serverTimestamp(),createdBy:auth.currentUser.uid,kind:'test'});
    notice('已建立測試佇列。尚未發送，下一次 GitHub Actions 排程或手動 Run workflow 將處理。','success');}
  catch(e){notice(`測試申請失敗：${e.message}`,'error');}
};
function showRecords(docs,target){
  const el=$(target);el.replaceChildren();if(!docs.length){el.textContent='無紀錄';return;}
  docs.forEach(record=>{const r=record.data(),row=document.createElement('div');row.className='history-item';
    const created=r.sentAt?.toDate?.()||r.failedAt?.toDate?.()||r.lastAttemptAt?.toDate?.()||r.createdAt?.toDate?.();
    row.textContent=`${record.id}｜${r.status||'未知'}｜${created?created.toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):'尚未發送'}${r.lastError||r.error?'｜'+(r.lastError||r.error):''}`;
    if(typeof r.report==='string'){
      const button=document.createElement('button');button.className='outline';button.textContent='查看週報內容';button.style.marginLeft='10px';
      button.onclick=()=>{$('report-preview').textContent=r.report;$('report-preview').scrollIntoView({behavior:'smooth'});};row.append(button);
    }
    el.append(row);
  });
}
$('history').onclick=async()=>{try{mustBeOwner();const list=await getDocs(collection(db,'ehs_weekly_report_history'));const docs=[...list.docs].sort((a,b)=>b.id.localeCompare(a.id)).slice(0,25);showRecords(docs,'history-list');}catch(e){notice(`查詢失敗：${e.message}`,'error');}};
$('requests').onclick=async()=>{try{mustBeOwner();const list=await getDocs(query(collection(db,'ehs_weekly_report_requests'),orderBy('createdAt','desc'),limit(15)));showRecords(list.docs,'history-list');}catch(e){notice(`查詢失敗：${e.message}`,'error');}};

// R1.0.2 排程監控：每次 Schedule 更新後端心跳；沒有心跳時不能把 Actions 綠燈誤判成已寄送。
function timeText(value){
  const date=value?.toDate?.()||(value instanceof Date?value:null);
  return date?date.toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'尚無紀錄';
}
function outcomeText(code){
  return ({SENT:'已發送',ALREADY_SENT:'本週已寄送',DISABLED:'自動發送關閉',WRONG_DAY:'星期不符',
    NOT_YET:'尚未到發送時間',MISSED_WINDOW:'跨日漏發（不補寄）',IN_PROGRESS:'處理中',NEEDS_REVIEW:'待人工檢查',
    RETRYABLE_FAILED:'發送失敗（待重試）',FAILED_PERMANENT:'發送失敗（需修正）',ERROR:'執行錯誤'})[code]||code||'尚無紀錄';
}
async function refreshMonitor(){
  mustBeOwner();
  const ref=doc(db,'ehs_weekly_report_runtime','monitor');
  const snap=await getDoc(ref),value=snap.data()||{};
  $('next-scheduled').textContent=config.enabled?nextScheduledDate(config,new Date()):'自動寄送未啟用';
  $('last-checked').textContent=timeText(value.lastScheduledCheckAt);
  $('last-result').textContent=outcomeText(value.lastCode);
  $('last-success').textContent=timeText(value.lastSentAt);
  let detail=value.lastReason||'尚未發現 GitHub Schedule 執行紀錄，請先確認工作流程已部署及啟用。';
  if(value.lastDetail)detail+=' '+value.lastDetail;
  if(value.lastRunId)detail+=`　[GitHub Run ${value.lastRunId}]`;
  const stamp=value.lastScheduledCheckAt?.toDate?.();
  const lag=stamp?Date.now()-stamp.getTime():Infinity;
  if(lag>20*60000&&config.enabled)detail+='\n注意：超過 20 分鐘未看到自動檢查；可能是 Actions 延遲、被停用或尚未部署。';
  $('monitor-details').className=`message${lag>20*60000&&config.enabled?' warn':''}`;
  $('monitor-details').textContent=detail;
}
$('refresh-monitor').onclick=async()=>{
  try{await refreshMonitor();notice('已更新排程監控資訊。','success');}
  catch(error){notice(`讀取排程監控失敗：${error.message}`,'error');}
};
$('audit').onclick=async()=>{
  try{
    mustBeOwner();const snap=await getDocs(query(collection(db,'ehs_weekly_report_audit'),orderBy('at','desc'),limit(25)));
    const container=$('audit-list');container.replaceChildren();
    if(snap.empty){container.textContent='尚無排程事件紀錄。';return;}
    for(const record of snap.docs){const d=record.data(),line=document.createElement('div');line.className='history-item';
      line.textContent=`${timeText(d.at)}｜${outcomeText(d.code)}｜${d.reason||''}${d.detail?'｜'+d.detail:''}`;
      container.append(line);
    }
  }catch(e){notice(`無法讀取排程事件：${e.message}`,'error');}
};

$('schedule-test').onclick=async()=>{
  try{
    mustBeOwner();
    if(dirty)throw Error('設定有尚未儲存的變更，請先按「儲存週報設定」。');
    const value=$('scheduled-test-time').value;
    if(!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(value))
      throw Error('請選擇有效的測試日期與時間。');
    const [dueDate,dueTime]=value.split('T'),today=localDate(),current=localTime();
    if(dueDate<today||(dueDate===today&&dueTime<=current))throw Error('請選擇未來時間，建議至少保留 10 分鐘。');
    if(!confirm(`確定預約台灣時間 ${dueDate} ${dueTime} 的自動推播測試？此測試不影響正式週報。`))return;
    await addDoc(collection(db,'ehs_weekly_report_requests'),{
      status:'pending',kind:'scheduled_test',dueDate,dueTime,createdAt:serverTimestamp(),createdBy:auth.currentUser.uid
    });
    notice(`已預約 ${dueDate} ${dueTime} 自動測試。請等待 GitHub Scheduled 執行；不必按 Run workflow。`,'success');
  }catch(error){notice(`自動測試預約失敗：${error.message}`,'error');}
};
