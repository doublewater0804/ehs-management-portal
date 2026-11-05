/* R1.0.4：原週期鎖定、最長 12 小時跨日補發；不讀 Firebase 或 Discord。 */
import {normalizeConfig,localDate,localDay,localTime,weekRange,dateShift} from './engine.mjs';
const dayNames=['日','一','二','三','四','五','六'];
export const REASONS=Object.freeze({
  MANUAL_TEST_ONLY:'手動執行僅處理 Discord 測試佇列，不會寄出正式週報。',
  DISABLED:'自動發送尚未啟用。',
  WRONG_DAY:'今天不是管理中心設定的發送星期。',
  MISSED_WINDOW:'已超過原訂發送時間 12 小時補發期限；不再自動補寄。',
  NOT_YET:'今天尚未到設定的發送時間。',
  ALREADY_SENT:'這個統計週期已經正式發送過，不再重複寄送。',
  IN_PROGRESS:'同一週的週報正在發送中，等待其他執行結束。',
  NEEDS_REVIEW:'上次送出狀態不確定，為避免重複推播，已停止自動重試，需人工檢查。',
  FAILED_PERMANENT:'發送遇到不應重試的錯誤，請先修正設定。',
  DUE:'已達原定排程時間，準備送出。',
  SENT_DELAYED:'正式週報當日延遲補發成功。',
  SENT_CROSS_DAY:'正式週報跨日補發成功。',
  SENT:'Discord 已確認接收週報。',
  RETRYABLE_FAILED:'送出失敗，將於下一次自動排程繼續重試。',
  ERROR:'週報排程發生錯誤。'
});
export const CATCH_UP_HOURS=12;
// 取最近一次「指定星期」的發送日；不能使用目前週次當作跨日補發的週次。
export function scheduledWindow(rawConfig,now=new Date()){
  const c=normalizeConfig(rawConfig),day=localDate(now),dow=localDay(now);
  const scheduledDate=dateShift(day,-((dow-c.day+7)%7));
  const dueTime=`${String(c.hour).padStart(2,'0')}:${String(c.minute).padStart(2,'0')}`;
  const dueAt=new Date(`${scheduledDate}T${dueTime}:00+08:00`);
  const deadlineAt=new Date(dueAt.getTime()+CATCH_UP_HOURS*3600000);
  const period=weekRange(dueAt); // Sunday->Monday catch-up MUST stay with old Sunday.
  const nowMs=new Date(now).getTime(),lateMinutes=Math.max(0,Math.floor((nowMs-dueAt.getTime())/60000));
  const deliveryType=lateMinutes===0?'on_time':day===scheduledDate?'same_day_delayed':'cross_day_catchup';
  return {scheduledDate,dueTime,dueAt:dueAt.toISOString(),deadlineAt:deadlineAt.toISOString(),
    weekKey:period.weekEnd,weekStart:period.from,periodEnd:scheduledDate,
    lateMinutes,deliveryType,withinWindow:nowMs>=dueAt.getTime()&&nowMs<=deadlineAt.getTime(),
    beforeDue:nowMs<dueAt.getTime(),pastDeadline:nowMs>deadlineAt.getTime()};
}
export function scheduleDecision(rawConfig,now=new Date(),eventName='schedule'){
  const c=normalizeConfig(rawConfig),window=scheduledWindow(c,now);
  const day=localDate(now),localNow=localTime(now);
  const base={...window,day,scheduledDay:c.day,localNow,nextScheduled:nextScheduledDate(c,now)};
  let code='DUE';
  if(eventName!=='schedule')code='MANUAL_TEST_ONLY';
  else if(!c.enabled)code='DISABLED';
  else if(window.withinWindow)code='DUE';
  else if(day===window.scheduledDate&&window.beforeDue)code='NOT_YET';
  // 直到下一個發送日都保留原週期逾期判斷；已寄出的週期由 Firebase history 判定。
  else if(window.pastDeadline)code='MISSED_WINDOW';
  else code='WRONG_DAY';
  return {...base,code,due:code==='DUE',reason:REASONS[code]};
}
export function nextScheduledDate(rawConfig,now=new Date()){
  const c=normalizeConfig(rawConfig),today=localDate(now);
  const offset=(c.day-localDay(now)+7)%7;
  let day=dateShift(today,offset);
  const time=`${String(c.hour).padStart(2,'0')}:${String(c.minute).padStart(2,'0')}`;
  if(offset===0&&localTime(now)>time)day=dateShift(day,7);
  return `${day} ${time} Asia/Taipei`;
}
export function lockDecision(existing, nowMs=Date.now()){
  if(!existing)return {claim:true,code:'NEW'};
  if(existing.status==='sent')return {claim:false,code:'ALREADY_SENT'};
  if(existing.status==='needs_review')return {claim:false,code:'NEEDS_REVIEW'};
  if(existing.permanentError)return {claim:false,code:'FAILED_PERMANENT'};
  if(existing.status==='failed'){
    // 舊版失敗紀錄可能已送出部分 Discord 訊息，未留下可靠續傳位置。
    if(existing.inFlightChunkIndex!==null&&existing.inFlightChunkIndex!==undefined)return {claim:false,code:'NEEDS_REVIEW'};
    if(existing.report&&existing.nextChunkIndex===undefined)return {claim:false,code:'NEEDS_REVIEW'};
    return {claim:true,code:'RETRY'};
  }
  const leaseUntil=toMs(existing.leaseUntil);
  if(['claimed','processing','sending'].includes(existing.status)){
    if(leaseUntil&&leaseUntil>nowMs)return {claim:false,code:'IN_PROGRESS'};
    // 只要存在可能送到 Discord 的尚未確認區段，不可以自行重寄。
    if(existing.inFlightChunkIndex!==null&&existing.inFlightChunkIndex!==undefined)return {claim:false,code:'NEEDS_REVIEW'};
    // 舊版 processing 無 lease 記錄，是否已送出無法判定，安全優先。
    if(!leaseUntil)return {claim:false,code:'NEEDS_REVIEW'};
    return {claim:true,code:'STALE_LEASE'};
  }
  return {claim:false,code:'NEEDS_REVIEW'};
}
function toMs(value){
  if(!value)return 0;
  if(value.toDate)return value.toDate().getTime();
  if(value instanceof Date)return value.getTime();
  if(typeof value.seconds==='number')return value.seconds*1000;
  return typeof value==='number'?value:Date.parse(value)||0;
}
export function formatMonitorStatus(code,details=''){
  return `${REASONS[code]||REASONS.ERROR}${details?` ${String(details).slice(0,200)}`:''}`;
}
export function scheduleLabel(rawConfig){
  const c=normalizeConfig(rawConfig);
  return `星期${dayNames[c.day]} ${String(c.hour).padStart(2,'0')}:${String(c.minute).padStart(2,'0')}（台灣時間）`;
}

// 獨立「自動推播測試」的日期時間判斷，完全不碰正式週報的每週防重複紀錄。
export function scheduledTestDecision(request,now=new Date(),eventName='schedule'){
  if(request?.kind!=='scheduled_test')return 'NOT_SCHEDULED_TEST';
  const dueDate=String(request?.dueDate||''),dueTime=String(request?.dueTime||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(dueTime))return 'INVALID';
  if(localDate(now)>dueDate)return 'EXPIRED';
  if(eventName!=='schedule')return 'WAITING_FOR_SCHEDULE';
  if(localDate(now)<dueDate||localTime(now)<dueTime)return 'WAITING';
  return 'DUE';
}
