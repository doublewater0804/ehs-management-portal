// EHS 智慧行事曆 R0：GitHub Actions 使用 Firebase Admin 安全傳送 Discord 提醒。
import admin from 'firebase-admin';
import {dueOccurrences,isoDay} from './calendar-reminder-core.mjs';
const required=['FIREBASE_SERVICE_ACCOUNT_JSON','DISCORD_WEBHOOK_URL'];
for(const key of required)if(!process.env[key])throw Error(`GitHub Secret 尚未設定：${key}`);
const credential=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
if(credential.project_id!=='esh-v85')throw Error('Firebase service account 專案不符，已拒絕執行');
admin.initializeApp({credential:admin.credential.cert(credential)});
const db=admin.firestore(),root='ehs_smart_calendar_r0';
const settings=(await db.doc(`${root}/data/settings/reminders`).get()).data()||{};
if(settings.enabled===false){console.log('EHS 智慧行事曆 Discord 通知已由管理者停用');process.exit(0);}
const now=new Date(),docs=await db.collection(`${root}/data/events`).get();
let sent=0,skipped=0,failed=0;
for(const doc of docs.docs){
 const ev=doc.data();let due=dueOccurrences(ev,now,15);
 if(!due.length){skipped++;continue;}
 for(const occurrence of due){
  const key=`${doc.id}_${occurrence.date}_${ev.startTime}_${occurrence.delay}`;
  const ref=db.collection(`${root}/data/reminderLocks`).doc(key);
  const acquired=await db.runTransaction(async tx=>{
   const s=await tx.get(ref);
   if(s.exists){const x=s.data();if(x.status==='sent')return false;if(x.status==='pending'&&x.lockUntil?.toMillis()>Date.now())return false;}
   tx.set(ref,{status:'pending',lockUntil:admin.firestore.Timestamp.fromMillis(Date.now()+20*60000),updatedAt:admin.firestore.FieldValue.serverTimestamp()});return true;
  });
  if(!acquired){skipped++;continue;}
  const payload={content:`EHS 智慧行事曆提醒\n${ev.title}\n${occurrence.date} ${ev.startTime}（台灣時間）${ev.location?'\n地點：'+ev.location:''}\n提前 ${occurrence.delay} 分鐘`,allowed_mentions:{parse:[]}};
  try{
   const address=new URL(process.env.DISCORD_WEBHOOK_URL);address.searchParams.set('wait','true');
   if(address.protocol!=='https:'||!/(^|\.)discord(?:app)?\.com$/.test(address.hostname))throw Error('Discord Webhook 網址不正確');
   const res=await fetch(address.toString(),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
   if(!res.ok)throw Error('Discord 回傳 HTTP '+res.status);
   await ref.set({status:'sent',sentAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});sent++;
  }catch(e){failed++;console.error('Discord send failed',doc.id,String(e.message).slice(0,120));await ref.set({status:'failed',updatedAt:admin.firestore.FieldValue.serverTimestamp()},{merge:true});}
 }
}
console.log(JSON.stringify({taipeiDate:isoDay(now),sent,skipped,failed}));if(failed)process.exitCode=1;
