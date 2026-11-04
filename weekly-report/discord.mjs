/* Discord 傳送器；Webhook 僅由 GitHub Actions Secret 注入，絕不送回前端。 */
import {splitDiscord} from './engine.mjs';

export class DiscordRetryableError extends Error {constructor(message){super(message);this.name='DiscordRetryableError';}}
export class DiscordPermanentError extends Error {constructor(message){super(message);this.name='DiscordPermanentError';}}
export class DeliveryUncertainError extends Error {constructor(message){super(message);this.name='DeliveryUncertainError';}}

export function parseWebhook(value){
  if(!value||typeof value!=='string')throw new DiscordPermanentError('Discord Webhook Secret 尚未設定。');
  let url;try{url=new URL(value.trim());}catch{throw new DiscordPermanentError('Discord Webhook URL 格式無效。');}
  if(url.protocol!=='https:'||!['discord.com','discordapp.com'].includes(url.hostname)||
     !/^\/api\/webhooks\/\d+\/[A-Za-z0-9_\-.]+$/.test(url.pathname))
    throw new DiscordPermanentError('Discord Webhook URL 不符合允許的格式。');
  url.searchParams.set('wait','true');
  return url.toString();
}
export async function deliverDiscord({webhook,text,fetchFn=fetch,waitFn=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
  beforeChunk=async()=>{},ackChunk=async()=>{},rejectChunk=async()=>{},startIndex=0,maxAttempts=4}){
  const url=parseWebhook(webhook),parts=splitDiscord(text,1800);
  if(parts.length===0)throw new DiscordPermanentError('週報內容是空的。');
  if(parts.length>100)throw new DiscordPermanentError('週報過長（超過 100 則 Discord 訊息）；請降低每類筆數。');
  if(!Number.isInteger(startIndex)||startIndex<0||startIndex>parts.length)
    throw new DiscordPermanentError('發送續傳位置無效，已停止以避免重複推播。');
  for(let i=startIndex;i<parts.length;i++){
    await beforeChunk(i,parts.length);
    const content=`${parts.length>1?`（${i+1}/${parts.length}）\n`:''}${parts[i]}`;
    let accepted=false;
    for(let attempt=1;attempt<=maxAttempts;attempt++){
      let response;
      try{
        response=await fetchFn(url,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({username:'EHS 自動週報',content,allowed_mentions:{parse:[]}}),
          signal:AbortSignal.timeout(20000)});
      }catch{
        // 已送出請求但未收到有效回應：可能送達；絕不能盲目重試。
        throw new DeliveryUncertainError(`第 ${i+1} 則訊息的網路回應不確定，已停止重試以防重複。`);
      }
      if(response.ok){
        let data;try{data=await response.json();}catch{
          throw new DeliveryUncertainError(`第 ${i+1} 則 Discord 未回傳可驗證的訊息資料。`);
        }
        if(!data||typeof data.id!=='string'||!/^\d+$/.test(data.id))
          throw new DeliveryUncertainError(`第 ${i+1} 則 Discord 缺少訊息 ID，無法確認送達。`);
        try{await ackChunk(i,data.id,parts.length);}catch{
          throw new DeliveryUncertainError(`第 ${i+1} 則已送達 Discord，但儲存確認紀錄失敗；需人工核對。`);
        }
        accepted=true;break;
      }
      if(response.status===429||response.status>=500){
        let delay=Math.min(30000,Math.max(1000,1500*attempt));
        try{const info=await response.json();if(Number.isFinite(info.retry_after))delay=Math.min(30000,Math.max(1000,Number(info.retry_after)*1000+500));}catch{}
        if(attempt<maxAttempts){await waitFn(delay);continue;}
        await rejectChunk(i,response.status);
        throw new DiscordRetryableError(`Discord HTTP ${response.status}，已重試 ${maxAttempts} 次，下一輪排程再試。`);
      }
      await rejectChunk(i,response.status);
      throw new DiscordPermanentError(`Discord HTTP ${response.status}，設定或權限需人工修正。`);
    }
    if(!accepted)throw new DiscordRetryableError(`第 ${i+1} 則未成功傳送。`);
    if(i<parts.length-1)await waitFn(350);
  }
  return {messages:parts.length,resumedFrom:startIndex};
}
