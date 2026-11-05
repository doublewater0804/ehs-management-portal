/* R1.0.4：保留 GitHub 原生排程；正式週報支援原週期 12h 跨日補發。 */
import {initializeApp,cert,getApps} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {DEFAULT_CONFIG,normalizeConfig,weekRange,localDate,localDay,dateShift,buildReport,splitDiscord} from './engine.mjs';
import {scheduleDecision,lockDecision,scheduledTestDecision,REASONS} from './scheduler.mjs';
import {deliverDiscord,DiscordRetryableError,DiscordPermanentError,DeliveryUncertainError} from './discord.mjs';
import {appendRecentCheck} from './monitoring.mjs';

function loadCredential(){
  const secret=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if(!secret)throw Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON Actions Secret');
  let obj;try{obj=JSON.parse(secret);}catch{throw Error('Invalid FIREBASE_SERVICE_ACCOUNT_JSON JSON');}
  if(obj.project_id!=='esh-v85'||obj.type!=='service_account')throw Error('Firebase service account project must be esh-v85');
  return obj;
}
const firebaseApp=getApps()[0]||initializeApp({credential:cert(loadCredential())});
const db=getFirestore(firebaseApp);
const confRef=db.collection('ehs_weekly_report').doc('config');
const history=db.collection('ehs_weekly_report_history');
const requests=db.collection('ehs_weekly_report_requests');
const monitorRef=db.collection('ehs_weekly_report_runtime').doc('monitor');
const audit=db.collection('ehs_weekly_report_audit');
const eventName=process.env.GITHUB_EVENT_NAME||'workflow_dispatch';
const runId=`${process.env.GITHUB_RUN_ID||'local'}-${process.env.GITHUB_RUN_ATTEMPT||'1'}`;
const MAX_REPORT=250000;
const LEASE_MS=20*60*1000;
let currentRunTests={sent:0,failed:0,expired:0};
let wroteScheduledMonitor=false;
const nowStamp=()=>new Date();
const displayTime=t=>new Date(t).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false});
const safeError=e=>String(e?.message||e).slice(0,240);
function dateSubtract(day,days){const d=new Date(`${day}T00:00:00Z`);d.setUTCDate(d.getUTCDate()-days);return d.toISOString().slice(0,10);}
async function fetchList(name){const snap=await db.collection(name).get();return snap.docs.map(d=>({id:d.id,...d.data()}));}
async function fetchSources(cfg){
  const names=[];
  if(cfg.sections.tasks)names.push('ehs_tasks');
  if(cfg.sections.projects)names.push('ehs-dashboard-2024_projects');
  const byName={};await Promise.all(names.map(async n=>{byName[n]=await fetchList(n);}));
  const flare=cfg.sections.flare?(await db.collection('flare_control').doc('global_state').get()).data()?.state||{}:{};
  const custom={};for(const source of cfg.customSources.filter(x=>x.enabled))custom[source.id]=await fetchList(source.collection);
  return {tasks:byName.ehs_tasks||[],projects:byName['ehs-dashboard-2024_projects']||[],flare,custom};
}
async function build(cfg,cutoff,official=true){
  const data=await fetchSources(cfg);
  const sourceReadAt=nowStamp();
  if(cfg.sections.flare){
    const range=weekRange(cutoff),prior=dateSubtract(range.from,1),old=(await history.doc(prior).get()).data();
    if(old?.flareCounts)data.previousFlare={from:dateSubtract(range.from,7),to:prior,counts:old.flareCounts};
  }
  const report=buildReport(data,cfg,cutoff,{official,readAt:sourceReadAt});
  if(report.text.length>MAX_REPORT)throw Error('週報內容超過安全長度，請降低每類顯示筆數。');
  return {...report,sourceReadAt};
}
// 每次 GitHub Scheduled 寫入心跳及最近 288 次檢查摘要；狀態轉換另寫稽核集合。
async function monitor(code,decision,detail='',extra={}){
  const timestamp=nowStamp(),isSchedule=eventName==='schedule';
  if(!isSchedule){
    await monitorRef.set({lastManualCheckAt:timestamp,lastManualRunId:runId},{merge:true});
    return;
  }
  const testNote=[currentRunTests.sent&&`一次性／手動測試已發送 ${currentRunTests.sent} 筆`,
    currentRunTests.expired&&`測試已過期 ${currentRunTests.expired} 筆`,currentRunTests.failed&&`測試失敗 ${currentRunTests.failed} 筆`].filter(Boolean).join('；');
  const fullDetail=[detail,testNote].filter(Boolean).join('；').slice(0,240);
  const payload={lastScheduledCheckAt:timestamp,lastCode:code,lastReason:REASONS[code]||'執行完成',
    lastDetail:fullDetail,lastRunId:runId,nextScheduled:decision.nextScheduled,
    lastScheduleSetting:`星期${decision.scheduledDay} ${decision.dueTime}`,updatedAt:timestamp,...extra};
  const auditRef=audit.doc();
  await db.runTransaction(async tx=>{
    const before=(await tx.get(monitorRef)).data()||{};
    const recentChecks=appendRecentCheck(before.recentChecks,{runId,time:timestamp.toISOString(),code,
      reason:fullDetail||payload.lastReason,testSent:currentRunTests.sent,
      testExpired:currentRunTests.expired,testFailed:currentRunTests.failed});
    const alreadyCounted=Array.isArray(before.recentChecks)&&before.recentChecks.some(x=>x?.runId===runId);
    tx.set(monitorRef,{...payload,recentChecks,lastCodeDay:decision.day,
      scheduledCheckCount:(Number(before.scheduledCheckCount)||0)+Number(!alreadyCounted)},{merge:true});
    const changed=before.lastCode!==code||before.lastCodeDay!==decision.day;
    if(changed){
      tx.set(auditRef,{at:timestamp,code,reason:payload.lastReason,detail:payload.lastDetail,
        scheduledDay:decision.scheduledDay,scheduledTime:decision.dueTime,runId,weekKey:decision.weekKey});
    }
  });
  wroteScheduledMonitor=true;
  console.log(`[R1.0.4] ${code}: ${payload.lastReason}${detail?' '+detail:''} (台灣 ${decision.day} ${decision.localNow})`);
}
async function claimHistory(ref){
  let result;
  await db.runTransaction(async tx=>{
    const existing=(await tx.get(ref)).data(),decision=lockDecision(existing);
    result={...decision,existing};
    if(decision.claim){
      tx.set(ref,{status:'claimed',ownerRun:runId,lastAttemptAt:nowStamp(),
        leaseUntil:new Date(Date.now()+LEASE_MS),attemptCount:(existing?.attemptCount||0)+1,
        inFlightChunkIndex:null},{merge:true});
    }else if(decision.code==='NEEDS_REVIEW'&&existing?.status!=='needs_review'){
      tx.set(ref,{status:'needs_review',lastError:'上次發送狀態未確認，禁止自動重試。',reviewAt:nowStamp()},{merge:true});
    }
  });
  return result;
}
async function sendTracked(text,ref,startIndex=0){
  return deliverDiscord({webhook:process.env.DISCORD_WEBHOOK_URL,text,startIndex,
    beforeChunk:async(i,total)=>{
      await ref.set({status:'sending',ownerRun:runId,inFlightChunkIndex:i,totalChunks:total,
        leaseUntil:new Date(Date.now()+LEASE_MS),sendStartedAt:nowStamp()},{merge:true});
    },
    ackChunk:async(i,messageId,total)=>{
      await ref.set({status:'sending',ownerRun:runId,inFlightChunkIndex:null,nextChunkIndex:i+1,
        totalChunks:total,lastDiscordMessageId:messageId,lastAckAt:nowStamp(),
        leaseUntil:new Date(Date.now()+LEASE_MS)},{merge:true});
    },
    rejectChunk:async(i,status)=>{
      await ref.set({status:'sending',inFlightChunkIndex:null,lastDiscordHttpStatus:status,
        lastRejectedAt:nowStamp()},{merge:true});
    }
  });
}
async function processScheduled(cfg,now,decision){
  if(!decision.due){
    if(decision.code==='MISSED_WINDOW'&&cfg.enabled){
      // 即使週一以後才恢復觸發，也只判斷原指定發送週期，絕不觸發新一週週報。
      const existing=(await history.doc(decision.weekKey).get()).data();
      if(existing?.status==='sent'){
        await monitor('ALREADY_SENT',decision,`原定 ${decision.scheduledDate} ${decision.dueTime} 已正式發送。`);
      }else{
        await monitor('MISSED_WINDOW',decision,`原定 ${decision.scheduledDate} ${decision.dueTime}；補發截止 ${displayTime(decision.deadlineAt)}，已逾期不自動寄送。`);
      }
      return;
    }
    await monitor(decision.code,decision);return;
  }
  const ref=history.doc(decision.weekKey),claimed=await claimHistory(ref);
  if(!claimed.claim){
    await monitor(claimed.code,decision,claimed.code==='ALREADY_SENT'?'本週正式週報已有發送紀錄。':'請查看週報發送歷史。');
    return;
  }
  let phase='prepare';
  const cutoff=new Date(decision.dueAt);
  try{
    // 續傳沿用第一次產生的報表及已確認區段，不因重試而改變內容。
    const report=claimed.existing?.report?{text:claimed.existing.report}:await build(cfg,cutoff);
    const chunkCount=splitDiscord(report.text).length;
    const startIndex=Math.min(chunkCount,claimed.existing?.nextChunkIndex||0);
    if(!claimed.existing?.report){
      await ref.set({weekStart:decision.weekStart,weekEnd:decision.weekKey,
        scheduledDate:decision.scheduledDate,scheduledTime:decision.dueTime,
        scheduledDueAt:cutoff,reportCutoffAt:cutoff,sendDeadlineAt:new Date(decision.deadlineAt),
        sourceReadAt:report.sourceReadAt||nowStamp(),report:report.text,flareCounts:report.flareCounts,
        totalOpen:report.totalOpen,totalFinished:report.totalFinished,
        nextChunkIndex:0,createdAt:nowStamp()}, {merge:true});
    }
    phase='delivery';
    const sent=await sendTracked(report.text,ref,startIndex);
    phase='finalization';
    const sentAt=nowStamp();
    const lateMinutes=Math.max(0,Math.floor((sentAt.getTime()-cutoff.getTime())/60000));
    const type=localDate(sentAt)!==decision.scheduledDate?'cross_day_catchup':
      lateMinutes===0?'on_time':'same_day_delayed';
    await ref.set({status:'sent',sentAt,messages:sent.messages,
      actualDeliveryType:type,lateByMinutes:lateMinutes,
      scheduledDate:decision.scheduledDate,scheduledTime:decision.dueTime,
      scheduledDueAt:cutoff,sendDeadlineAt:new Date(decision.deadlineAt),
      nextChunkIndex:sent.messages,inFlightChunkIndex:null,leaseUntil:null,
      lastError:null,permanentError:false},{merge:true});
    // Discord 已確認成功後，監控紀錄若寫入失敗，不得把正式週報狀態改回失敗。
    const monitorCode=type==='cross_day_catchup'?'SENT_CROSS_DAY':type==='same_day_delayed'?'SENT_DELAYED':'SENT';
    try{await monitor(monitorCode,decision,
      `原訂 ${decision.scheduledDate} ${decision.dueTime}；實際 ${displayTime(sentAt)}；延遲 ${lateMinutes} 分鐘；${sent.messages} 則 Discord 訊息`,
      {lastSentAt:sentAt,lastSentWeekKey:decision.weekKey,lastSentType:type,lastScheduledDueAt:cutoff});}
    catch(logError){console.error('週報已送達，但監控紀錄更新失敗：',safeError(logError));}
    console.log(`Weekly report ${decision.weekKey} sent; kind=${type}; scheduled=${decision.scheduledDate} ${decision.dueTime}; actual=${displayTime(sentAt)}; late=${lateMinutes}min; ${sent.messages} Discord messages (resumed from ${startIndex}).`);
  }catch(error){
    const uncertain=error instanceof DeliveryUncertainError||phase==='finalization'||
      (phase==='delivery'&&!(error instanceof DiscordRetryableError)&&!(error instanceof DiscordPermanentError));
    const permanent=error instanceof DiscordPermanentError;
    const code=uncertain?'NEEDS_REVIEW':permanent?'FAILED_PERMANENT':'RETRYABLE_FAILED';
    await ref.set({status:uncertain?'needs_review':'failed',permanentError:permanent,
      lastError:safeError(error),failedAt:nowStamp(),leaseUntil:null,
      ...(uncertain?{}:{inFlightChunkIndex:null})},{merge:true});
    await monitor(code,decision,safeError(error));
    throw error; // 讓 GitHub Actions 顯示紅色失敗，而非誤判 Success
  }
}
async function processRequests(cfg,now){
  const pending=await requests.where('status','==','pending').limit(50).get();
  let failure=0;
  const stats={sent:0,failed:0,expired:0};
  for(const item of pending.docs){
    const req=item.data(),scheduling=scheduledTestDecision(req,now,eventName);
    if(req.kind==='scheduled_test'){
      if(scheduling==='EXPIRED'||scheduling==='INVALID'){
        await item.ref.set({status:'expired',error:scheduling==='EXPIRED'?'跨日未觸發，不自動補送。':'自動測試日期時間無效。',expiredAt:nowStamp()},{merge:true});
        stats.expired++;
        continue;
      }
      if(scheduling!=='DUE')continue;
    }else if(req.kind!=='test'){continue;}
    let locked=false;
    await db.runTransaction(async tx=>{
      const snapshot=await tx.get(item.ref);
      if(snapshot.data()?.status!=='pending')return;
      tx.set(item.ref,{status:'processing',lastAttemptAt:nowStamp(),ownerRun:runId},{merge:true});locked=true;
    });
    if(!locked)continue;
    let delivered=false;
    try{
      const report=await build(cfg,now,false);
      const text=`【${req.kind==='scheduled_test'?'自動排程測試':'手動測試'}，不影響正式週報】\n${report.text}`;
      await item.ref.set({status:'sending',sendStartedAt:nowStamp()},{merge:true});
      // 測試採單獨紀錄，絕不寫入正式週報 history/weekKey。
      const sent=await deliverDiscord({webhook:process.env.DISCORD_WEBHOOK_URL,text});
      delivered=true;
      await item.ref.set({status:'sent',sentAt:nowStamp(),messages:sent.messages},{merge:true});
      stats.sent++;
      console.log(`Test request ${item.id} processed; ${sent.messages} messages`);
    }catch(error){
      failure++;stats.failed++;
      const uncertain=delivered||error instanceof DeliveryUncertainError;
      await item.ref.set({status:uncertain?'needs_review':'failed',error:safeError(error),failedAt:nowStamp()},{merge:true});
      console.error(`Test request ${item.id} failed (${uncertain?'uncertain':'failed'}): ${safeError(error)}`);
    }
  }
  return stats;
}
async function main(){
  const now=nowStamp();
  let decision;
  try{
    const snap=await confRef.get(),cfg=normalizeConfig(snap.exists?snap.data():DEFAULT_CONFIG);
    decision=scheduleDecision(cfg,now,eventName);
    currentRunTests=await processRequests(cfg,now);
    await processScheduled(cfg,now,decision);
    if(currentRunTests.failed)throw Error(`${currentRunTests.failed} 個 Discord 測試寄送失敗，請查看測試佇列。`);
    console.log(`EHS R1.0.4 check finished; trigger=${eventName}; tests=${JSON.stringify(currentRunTests)}; no source records modified.`);
  }catch(error){
    if(eventName==='schedule'&&!wroteScheduledMonitor){
      try{await monitor('ERROR',decision||scheduleDecision(DEFAULT_CONFIG,now,'schedule'),safeError(error));}
      catch(logError){console.error('排程失敗且監控回寫失敗:',safeError(logError));}
    }
    throw error;
  }
}

main().catch(async error=>{
  console.error('Weekly-report run failed:',safeError(error));
  process.exitCode=1;
});
