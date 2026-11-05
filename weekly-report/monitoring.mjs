/* R1.0.3 — pure helpers for independent schedule-health diagnosis; no Firebase access. */
import {localDate,localTime} from './engine.mjs';
export const HEARTBEAT_LIMIT_MINUTES=20;
export const MAX_RECENT_CHECKS=288;
export function instantMillis(value){
  if(!value)return null;
  const converted=typeof value?.toDate==='function'?value.toDate():value;
  const milliseconds=converted instanceof Date?converted.getTime():typeof converted==='number'?converted:
    (typeof converted?.seconds==='number'?converted.seconds*1000:Date.parse(String(converted)));
  return Number.isFinite(milliseconds)?milliseconds:null;
}
export function heartbeatHealth(lastAt,now=new Date(),limitMinutes=HEARTBEAT_LIMIT_MINUTES){
  const time=instantMillis(lastAt),nowMs=instantMillis(now);
  if(time===null||nowMs===null)return {level:'missing',stale:true,ageMinutes:null,
    message:'尚未收到 GitHub Scheduled 心跳；無法確認目前有自動檢查。'};
  const ageMinutes=Math.max(0,Math.floor((nowMs-time)/60000));
  return ageMinutes>limitMinutes?{level:'stale',stale:true,ageMinutes,
    message:`距離上次 GitHub 自動檢查已 ${ageMinutes} 分鐘（超過 ${limitMinutes} 分鐘）；請檢查 Actions 是否產生 Scheduled 執行。`}: {
    level:'recent',stale:false,ageMinutes,message:`最近 ${ageMinutes} 分鐘內有 GitHub Scheduled 心跳；不代表已發送 Discord。`};
}
export function scheduledTestHealth(request,now=new Date()){
  if(request?.kind!=='scheduled_test')return {code:'OTHER',label:'非一次性測試'};
  if(request.status!=='pending')return {code:request.status||'UNKNOWN',label:request.status||'未知'};
  const date=String(request.dueDate||''),time=String(request.dueTime||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))
    return {code:'INVALID',label:'測試預約日期或時間不正確'};
  const today=localDate(now);
  if(today>date)return {code:'EXPIRED_PENDING',label:'已跨日過期，等待安全更新測試狀態'};
  if(today<date||localTime(now)<time)return {code:'WAITING_TIME',label:`等待指定時間 ${date} ${time}`};
  return {code:'WAITING_GITHUB',label:`${date} ${time} 已到，仍等待 GitHub Scheduled 自動觸發`};
}
export function appendRecentCheck(current,entry,max=MAX_RECENT_CHECKS){
  const list=Array.isArray(current)?current.filter(x=>x&&typeof x==='object'):[];
  const id=String(entry?.runId||'');
  const cleaned=list.filter(x=>String(x.runId||'')!==id);
  cleaned.push({runId:id,time:String(entry.time||''),code:String(entry.code||'').slice(0,48),
    reason:String(entry.reason||'').slice(0,160),testSent:Number(entry.testSent||0),
    testExpired:Number(entry.testExpired||0),testFailed:Number(entry.testFailed||0)});
  return cleaned.slice(-Math.max(1,Math.min(576,Number(max)||MAX_RECENT_CHECKS)));
}
