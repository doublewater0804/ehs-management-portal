/* GitHub Actions 專用；不在 GitHub Pages 瀏覽器執行。 */
import {readFile} from 'node:fs/promises';
import {initializeApp,cert,getApps} from 'firebase-admin/app';
import {getFirestore} from 'firebase-admin/firestore';
import {DEFAULT_CONFIG,normalizeConfig,weekRange,localDate,localDay,localHour,buildReport,splitDiscord,flareRows} from './engine.mjs';

function loadCredential(){
  const secret=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if(!secret)throw Error('Missing FIREBASE_SERVICE_ACCOUNT_JSON Actions Secret');
  let obj;try{obj=JSON.parse(secret);}catch{throw Error('Invalid FIREBASE_SERVICE_ACCOUNT_JSON JSON');}
  if(obj.project_id!=='esh-v85'||obj.type!=='service_account')throw Error('Service account must belong to Firebase project esh-v85');
  return obj;
}
const firebaseApp=getApps()[0]||initializeApp({credential:cert(loadCredential())});
const db=getFirestore(firebaseApp);
const confRef=db.collection('ehs_weekly_report').doc('config');
const historyCollection=db.collection('ehs_weekly_report_history');
const requests=db.collection('ehs_weekly_report_requests');
function stamp(){return new Date();}
async function sendDiscord(text){
  const webhook=process.env.DISCORD_WEBHOOK_URL;
  if(!webhook||!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[^/]+$/.test(webhook))
    throw Error('Discord Webhook Secret missing or invalid');
  const chunks=splitDiscord(text);
  for(let i=0;i<chunks.length;i++){
    let ok=false;
    for(let attempt=0;attempt<5;attempt++){
      const response=await fetch(webhook,{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({username:'EHS 自動週報',content:`${chunks.length>1?`（${i+1}/${chunks.length}）\n`:''}${chunks[i]}`,allowed_mentions:{parse:[]}})});
      if(response.ok){ok=true;break;}
      if(response.status===429||response.status>=500){
        let secs=attempt+1;try{const b=await response.json();if(Number.isFinite(b.retry_after))secs=Math.min(30,Number(b.retry_after)+0.5);}catch{}
        await new Promise(done=>setTimeout(done,Math.min(30000,secs*1000)));continue;
      }
      throw Error(`Discord send failed HTTP ${response.status}`);
    }
    if(!ok)throw Error('Discord send failed after retries');
    if(i!==chunks.length-1)await new Promise(done=>setTimeout(done,800));
  }
  return chunks.length;
}
async function fetchList(name){const snap=await db.collection(name).get();return snap.docs.map(d=>({id:d.id,...d.data()}));}
async function fetchSources(cfg){
  const names=[];
  if(cfg.sections.tasks)names.push('ehs_tasks');
  if(cfg.sections.projects)names.push('ehs-dashboard-2024_projects');
  const custom=cfg.customSources.filter(x=>x.enabled);
  const outputs=await Promise.all(names.map(fetchList));
  const byName=Object.fromEntries(names.map((name,i)=>[name,outputs[i]]));
  const flare=(cfg.sections.flare)?(await db.collection('flare_control').doc('global_state').get()).data()?.state||{}:{};
  const customOutput={};
  for(const source of custom)customOutput[source.id]=await fetchList(source.collection);
  return {tasks:byName['ehs_tasks']||[],projects:byName['ehs-dashboard-2024_projects']||[],flare,custom:customOutput};
}
async function build(cfg,now){
  const data=await fetchSources(cfg);
  if(cfg.sections.flare){
    const range=weekRange(now),prior=dateSubtract(range.from,1);
    const previous=await historyCollection.doc(prior).get();
    if(previous.exists&&previous.data()?.flareCounts)data.previousFlare={
      from:dateSubtract(range.from,7),to:prior,counts:previous.data().flareCounts
    };
  }
  return {report:buildReport(data,cfg,now),data};
}
function dateSubtract(day,days){const d=new Date(`${day}T00:00:00Z`);d.setUTCDate(d.getUTCDate()-days);return d.toISOString().slice(0,10);}
async function claim(ref,criteria){
  return db.runTransaction(async tx=>{
    const snapshot=await tx.get(ref),existing=snapshot.data();
    if(!criteria(existing))return false;
    tx.set(ref,{status:'processing',lastAttemptAt:stamp(),attemptCount:(existing?.attemptCount||0)+1},{merge:true});
    return true;
  });
}
async function processScheduled(cfg,now){
  if(!cfg.enabled||localDay(now)!==cfg.day||localHour(now)<cfg.hour)return;
  const range=weekRange(now),key=range.weekEnd,ref=historyCollection.doc(key);
  const claimed=await claim(ref,s=>!s||s.status==='failed');
  if(!claimed){console.log(`Scheduled report ${key} already claimed/sent`);return;}
  try{
    const {report}=await build(cfg,now);
    const messages=await sendDiscord(report.text);
    await ref.set({status:'sent',weekStart:range.from,weekEnd:range.weekEnd,report:report.text.slice(0,500000),
      flareCounts:report.flareCounts,openCount:report.totalOpen,completedCount:report.totalFinished,
      sentAt:stamp(),messages},{merge:true});
    console.log(`Weekly report ${key} sent; ${messages} Discord messages`);
  }catch(error){await ref.set({status:'failed',lastError:String(error.message).slice(0,180),failedAt:stamp()},{merge:true});throw error;}
}
async function processRequests(cfg,now){
  const snapshot=await requests.where('status','==','pending').limit(5).get();
  for(const item of snapshot.docs){
    const ref=item.ref;
    if(!(await claim(ref,s=>s?.status==='pending')))continue;
    try{
      const {report}=await build(cfg,now);
      const messages=await sendDiscord(`【手動測試】\n${report.text}`);
      await ref.set({status:'sent',sentAt:stamp(),messages},{merge:true});
      console.log(`Test request processed; ${messages} messages`);
    }catch(error){await ref.set({status:'failed',error:String(error.message).slice(0,180),failedAt:stamp()},{merge:true});console.error('Test request failed:',error.message);}
  }
}
async function main(){
  const snapshot=await confRef.get();
  const config=normalizeConfig(snapshot.exists?snapshot.data():DEFAULT_CONFIG);
  const now=stamp();
  await processRequests(config,now);
  await processScheduled(config,now);
  console.log('EHS weekly-report check completed (no source records changed).');
}
main().catch(e=>{console.error('Weekly-report run failed:',e.message);process.exitCode=1;});
