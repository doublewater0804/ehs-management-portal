/* 純函式：獨立測試時間、當天補送、防重複；不讀 Firebase 或 Discord。 */
import {normalizeConfig,localDate,localDay,localTime,weekRange,dateShift} from './engine.mjs';
const dayNames=['日','一','二','三','四','五','六'];
export const REASONS=Object.freeze({
  MANUAL_TEST_ONLY:'手動執行僅處理 Discord 測試佇列，不會寄出正式週報。',
  DISABLED:'自動發送尚未啟用。',
  WRONG_DAY:'今天不是管理中心設定的發送星期。',
  MISSED_WINDOW:'前一個指定發送日未成功發送，已跨日；依設定不自動補寄。',
  NOT_YET:'今天尚未到設定的發送時間。',
  ALREADY_SENT:'這個統計週期已經正式發送過，不再重複寄送。',
  IN_PROGRESS:'同一週的週報正在發送中，等待其他執行結束。',
  NEEDS_REVIEW:'上次送出狀態不確定，為避免重複推播，已停止自動重試，需人工檢查。',
  FAILED_PERMANENT:'發送遇到不應重試的錯誤，請先修正設定。',
  DUE:'已達排程發送時間，準備送出。',
  SENT:'Discord 已確認接收週報。',
  RETRYABLE_FAILED:'送出失敗，將於下一次自動排程繼續重試。',
  ERROR:'週報排程發生錯誤。'
});
export function scheduleDecision(rawConfig, now=new Date(), eventName='schedule'){
  const c=normalizeConfig(rawConfig),day=localDate(now),week=weekRange(now);
  const dueTime=`${String(c.hour).padStart(2,'0')}:${String(c.minute).padStart(2,'0')}`;
  const base={day,weekKey:week.weekEnd,weekStart:week.from,scheduledDay:c.day,dueTime,
    localNow:localTime(now), nextScheduled:nextScheduledDate(c,now)};
  let code='DUE';
  if(eventName!=='schedule')code='MANUAL_TEST_ONLY';
  else if(!c.enabled)code='DISABLED';
  else if(localDay(now)!==c.day)code='WRONG_DAY';
  else if(localTime(now)<dueTime)code='NOT_YET';
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
