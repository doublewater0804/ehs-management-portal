import {initializeApp,getApp,getApps} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,doc,getDoc,setDoc,collection,getDocs,addDoc,serverTimestamp,query,orderBy,limit,where,runTransaction} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import {firebaseConfig,ADMIN_EMAIL} from '../portal/config.js';
import {DEFAULT_CONFIG,normalizeConfig,buildReport,localDate,localTime} from './engine.mjs';
import {nextScheduledDate,scheduleLabel} from './scheduler.mjs';
import {heartbeatHealth,scheduledTestHealth} from './monitoring.mjs';
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
    const diagnostic=scheduledTestHealth(r);
    const derived=diagnostic.code==='EXPIRED_PENDING'||diagnostic.code==='WAITING_GITHUB'?`｜${diagnostic.label}`:'';
    row.textContent=`${record.id}｜${r.status||'未知'}${derived}｜${created?created.toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}):'尚未發送'}${r.lastError||r.error?'｜'+(r.lastError||r.error):''}`;
    if(typeof r.report==='string'){
      const button=document.createElement('button');button.className='outline';button.textContent='查看週報內容';button.style.marginLeft='10px';
      button.onclick=()=>{$('report-preview').textContent=r.report;$('report-preview').scrollIntoView({behavior:'smooth'});};row.append(button);
    }
    el.append(row);
  });
}
$('history').onclick=async()=>{try{mustBeOwner();const list=await getDocs(collection(db,'ehs_weekly_report_history'));const docs=[...list.docs].sort((a,b)=>b.id.localeCompare(a.id)).slice(0,25);showRecords(docs,'history-list');}catch(e){notice(`查詢失敗：${e.message}`,'error');}};
$('requests').onclick=async()=>{try{mustBeOwner();const list=await getDocs(query(collection(db,'ehs_weekly_report_requests'),orderBy('createdAt','desc'),limit(15)));showRecords(list.docs,'history-list');}catch(e){notice(`查詢失敗：${e.message}`,'error');}};

// R1.0.3：GitHub Schedule 心跳與正式發送開關分開；逾期測試由管理員頁安全地補標記。
function timeText(value){
  const date=value?.toDate?.()||(value instanceof Date?value:null);
  return date?date.toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'尚無紀錄';
}
function outcomeText(code){
  return ({SENT:'正式週報已發送',ALREADY_SENT:'本週已寄送',DISABLED:'正式自動發送關閉（一次性測試仍可執行）',WRONG_DAY:'星期不符',
    NOT_YET:'尚未到發送時間',MISSED_WINDOW:'跨日漏發（不補寄）',IN_PROGRESS:'處理中',NEEDS_REVIEW:'待人工檢查',
    RETRYABLE_FAILED:'發送失敗（待重試）',FAILED_PERMANENT:'發送失敗（需修正）',ERROR:'執行錯誤'})[code]||code||'尚無紀錄';
}
async function refreshPendingTestHealth(){
  const now=new Date(),pending=await getDocs(query(collection(db,'ehs_weekly_report_requests'),where('status','==','pending'),limit(100)));
  const tests=pending.docs.filter(x=>x.data().kind==='scheduled_test');
  let expired=0;
  for(const record of tests){
    if(scheduledTestHealth(record.data(),now).code!=='EXPIRED_PENDING')continue;
    // Firestore transaction: 若另一個 GitHub run 已經更改狀態，不會覆寫其結果。
    let transitioned=false;
    await runTransaction(db,async tx=>{
      transitioned=false;
      const latest=await tx.get(record.ref);
      const req=latest.data();
      if(req?.status!=='pending'||scheduledTestHealth(req,now).code!=='EXPIRED_PENDING')return;
      tx.update(record.ref,{status:'expired',error:'跨日未收到 Scheduled 觸發，不自動補送（管理中心檢查）。',
        expiredAt:serverTimestamp(),expiredBy:'admin-monitor-r103'});
      transitioned=true;
    });
    if(transitioned)expired++;
  }
  const refreshed=tests.map(x=>({id:x.id,source:x.data()}))
    .filter(x=>scheduledTestHealth(x.source,now).code!=='EXPIRED_PENDING')
    .sort((a,b)=>(a.source.dueDate+' '+a.source.dueTime).localeCompare(b.source.dueDate+' '+b.source.dueTime));
  const due=refreshed.filter(x=>scheduledTestHealth(x.source,now).code==='WAITING_GITHUB');
  const future=refreshed.filter(x=>scheduledTestHealth(x.source,now).code==='WAITING_TIME');
  const el=$('test-pending-status');
  if(el){
    if(due.length)el.textContent=`${due.length} 筆一次性測試已到指定時間，仍等待 GitHub Scheduled。最早：${due[0].source.dueDate} ${due[0].source.dueTime}（台灣）；不代表 Discord 失敗。`;
    else if(future.length)el.textContent=`${future.length} 筆一次性測試等待指定時間；最近：${future[0].source.dueDate} ${future[0].source.dueTime}（台灣）。`;
    else el.textContent='目前沒有待執行的一次性自動測試。';
    if(expired)el.textContent+=` 已安全標記 ${expired} 筆跨日過期測試（不發送、不刪除）。`;
    if(pending.docs.length===100)el.textContent+=' 注意：待處理紀錄超過查詢上限，請查看完整測試佇列。';
    el.className=`message${due.length?' warn':''}`;
  }
  return {due:due.length,upcoming:future.length,expired};
}
async function refreshMonitor(){
  mustBeOwner();
  const snapshot=await getDoc(doc(db,'ehs_weekly_report_runtime','monitor'));
  const value=snapshot.data()||{};
  $('next-scheduled').textContent=config.enabled?nextScheduledDate(config,new Date()):'正式週報關閉；GitHub 定時檢查仍應執行';
  $('last-checked').textContent=timeText(value.lastScheduledCheckAt);
  $('last-result').textContent=outcomeText(value.lastCode);
  $('last-success').textContent=timeText(value.lastSentAt);
  const health=heartbeatHealth(value.lastScheduledCheckAt);
  let detail=health.message+'\n'+(value.lastReason||'尚無正式週報判斷紀錄。');
  if(value.lastDetail)detail+=' '+value.lastDetail;
  if(value.lastRunId)detail+=`\nGitHub Run ${value.lastRunId}`;
  if(health.stale)detail+='\n即使「啟用每週自動寄送」未勾選，也需要獨立檢查 GitHub Scheduled 是否持續運作。';
  $('monitor-details').className=`message${health.stale?' warn':''}`;
  $('monitor-details').textContent=detail;
  $('recent-count').textContent=`已記錄 ${Array.isArray(value.recentChecks)?value.recentChecks.length:0} 筆逐次檢查（至多保留 288 筆）`;
  try{await refreshPendingTestHealth();}
  catch(e){$('test-pending-status').className='message warn';$('test-pending-status').textContent=`未能取得／更新待執行測試狀態：${e.message}`;}
}
$('refresh-monitor').onclick=async()=>{
  try{await refreshMonitor();notice('已更新 GitHub 心跳與一次性測試狀態。','success');}
  catch(error){notice(`讀取排程監控失敗：${error.message}`,'error');}
};
$('audit').onclick=async()=>{
  try{
    mustBeOwner();
    const container=$('audit-list');container.replaceChildren();
    const snap=await getDoc(doc(db,'ehs_weekly_report_runtime','monitor'));
    const recent=Array.isArray(snap.data()?.recentChecks)?[...snap.data().recentChecks]:[];
    if(recent.length){
      for(const item of recent.reverse().slice(0,50)){
        const row=document.createElement('div');row.className='history-item';
        const local=new Date(item.time).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false});
        row.textContent=`${local}｜Run ${item.runId}｜${outcomeText(item.code)}${item.reason?'｜'+item.reason:''}`;
        container.append(row);
      }
      return;
    }
    // 升級前舊版只有狀態轉變事件，向後相容顯示，但不能當作每次檢查的完整紀錄。
    const old=await getDocs(query(collection(db,'ehs_weekly_report_audit'),orderBy('at','desc'),limit(25)));
    if(old.empty){container.textContent='尚無 GitHub Scheduled 逐次檢查紀錄。';return;}
    const explanation=document.createElement('div');explanation.className='hint';
    explanation.textContent='以下為舊版「狀態變更」紀錄，不代表每次 GitHub 檢查。新版本首次 Scheduled 執行後才會有逐次心跳。';
    container.append(explanation);
    for(const record of old.docs){const d=record.data(),line=document.createElement('div');line.className='history-item';
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
    await refreshMonitor();
  }catch(error){notice(`自動測試預約失敗：${error.message}`,'error');}
};
