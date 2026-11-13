// EHS 環保規費 R1.2 專用 Firebase bridge：沿用入口網站 portal/config.js，不複製或另建權限規則。
import {initializeApp,getApps} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,signInWithRedirect,getRedirectResult,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,collection,doc,onSnapshot,getDoc,getDocsFromServer,query,where,writeBatch,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import {firebaseConfig,ADMIN_EMAIL} from '../portal/config.js';
const app=getApps().find(a=>a.name==='ehs-portal')||initializeApp(firebaseConfig,'ehs-portal');
const auth=getAuth(app),db=getFirestore(app);
const storeNames=['records','types','notes','reasons'];
const storeCollections={records:'env_fee_records',types:'env_fee_types',notes:'env_fee_notes',reasons:'env_fee_reasons'};
const cache={records:[],types:[],notes:[],reasons:[]};
let offs=[],received=new Set(),failed=new Set(),user=null,connected=false,lastError='';
function emit(){
 window.envFeeR11?.applyCloud({...cache,ready:connected,loggedIn:!!user,user:user?.email||'',loading:!connected&&!lastError&&!user,error:lastError});
}
function permitted(){
 if(!user||user.email!==ADMIN_EMAIL||!user.emailVerified||!connected)throw Error('請先登入已驗證的 EHS 管理員 Google 帳號，並確認雲端資料已載入。');
}
function stopWatch(){offs.forEach(f=>f());offs=[];received=new Set();failed=new Set();connected=false;for(const k of storeNames)cache[k]=[]}
function observe(){
 stopWatch();lastError='';
 for(const key of storeNames){
  const unsubscribe=onSnapshot(collection(db,storeCollections[key]),snap=>{
   if(snap.metadata.fromCache){if(!received.has(key))lastError='Firebase 尚未取得伺服器資料，無法保證最新狀態。';emit();return;}
   cache[key]=snap.docs.map(s=>{const d=s.data();return {...d,updatedAt:d.updatedAt?.toDate?.().toISOString?.()||d.updatedAt||'',id:s.id}});received.add(key);failed.delete(key);
   if(received.size===storeNames.length&&failed.size===0){connected=true;lastError=''}
   emit();
  },err=>{failed.add(key);connected=false;lastError=`Firestore ${key} 讀取失敗：${err.message}`;emit()});
  offs.push(unsubscribe);
 }
}
async function auditedSet(collectionName,record,action){
 permitted();const target=doc(db,collectionName,record.id);
 const previous=await getDoc(target),before=previous.exists()?previous.data():null;
 const batch=writeBatch(db),audit=doc(collection(db,'env_fee_audit_logs'));
 const data={...record,updatedAt:serverTimestamp(),updatedBy:user.email};
 batch.set(target,data);
 batch.set(audit,{targetCollection:collectionName,targetId:record.id,action,before,after:record,actor:user.email,createdAt:serverTimestamp()});
 await batch.commit();
}
const keyOf=r=>[r.year,r.type,r.period,r.site].join('|');
function validRecord(r){
 if(!Number.isInteger(r.year)||r.year<2016||r.year>2100)throw Error('年度錯誤');
 if(!r.type||!r.period||!r.site)throw Error('規費識別不完整');
 if(!r.deleted&&r.status!=='已申報'&&r.status!=='尚未申報')throw Error('申報狀態錯誤');
 if(!r.deleted&&r.status==='已申報'&&(!Number.isFinite(r.amount)||r.amount<0||!Number.isFinite(r.refund)||r.refund<0||r.refund>r.amount))throw Error('金額必須是有限非負數字，且扣抵不得高於原始金額');
 if(!r.deleted&&r.status==='尚未申報'&&r.amount!==null)throw Error('尚未申報的金額必須為空值');
}

function versionToken(d){
 if(!d)return '';
 const time=d.updatedAt?.toDate?.().toISOString?.()||d.updatedAt||'';
 return JSON.stringify([d.amount??null,d.refund??0,d.status||'',d.note||'',d.deleted===true,time,d.updatedBy||'']);
}

window.feeCloudAPI={
 async login(){
  try{await signInWithPopup(auth,new GoogleAuthProvider())}
  catch(e){if(['auth/popup-blocked','auth/cancelled-popup-request','auth/operation-not-supported-in-this-environment'].includes(e.code))await signInWithRedirect(auth,new GoogleAuthProvider());else throw e}
 },
 logout(){return signOut(auth)},
 async saveRecord(r,action='upsert'){
  permitted();validRecord(r);
  const key=keyOf(r),record={...r,key,id:encodeURIComponent(key)};
  await auditedSet('env_fee_records',record,action);
 },
 async saveType(t){
  permitted();if(!t.id||!t.name||!['quarter','half','year'].includes(t.mode)||!['company','site'].includes(t.scope))throw Error('規費類型欄位無效');
  const saved=await getDoc(doc(db,'env_fee_types',t.id));
  if(saved.exists()){
   const old=saved.data();
   if(old.mode!==t.mode||old.scope!==t.scope){
    // 以伺服器最新紀錄再核對一次，不只依賴畫面快取。
    const existing=await getDocsFromServer(query(collection(db,'env_fee_records'),where('type','==',t.id)));
    if(existing.docs.some(d=>d.data().deleted!==true)){
     throw Error('此規費已有有效申報紀錄，週期／範圍不可直接修改；請先保護並處理原資料。');
    }
   }
  }
  await auditedSet('env_fee_types',t,'type-save');
 },
 async saveNote(n){permitted();if(!n.key||typeof n.content!=='string'||n.content.length>10000)throw Error('備註內容無效');await auditedSet('env_fee_notes',n,n.deleted?'note-delete':'note-save')},
 async saveReason(r){permitted();if(!r.key||typeof r.content!=='string'||r.content.length>2000)throw Error('原因內容無效');await auditedSet('env_fee_reasons',r,'reason-save')},
 async importRows(plans,options={}){
  permitted();
  if(!Array.isArray(plans)||!plans.length)return {written:0};
  if(plans.length>1000)throw Error('單次匯入最多 1000 筆變更，請分批處理');
  const seen=new Set();
  for(const p of plans){
   if(!p||!p.record||typeof p.expectedExists!=='boolean'||typeof p.expectedVersion!=='string')throw Error('R1.2 匯入預覽資料不完整，請重新預覽');
   const r=p.record;validRecord(r);
   if(typeof r.note!=='string'||r.note.length>2000)throw Error('備註不合法');
   const k=keyOf(r);if(seen.has(k))throw Error('匯入內容有重複資料');seen.add(k);
  }
  let completed=0;
  // 各批資料與稽核紀錄在同一個 Firestore Transaction 內提交，
  // Transaction 從伺服器重新讀取並驗證預覽時的版本，避免競態覆蓋。
  for(let i=0;i<plans.length;i+=25){
   const portion=plans.slice(i,i+25);
   try{
    await runTransaction(db,async tx=>{
     const sources=[];
     for(const p of portion){
      const r=p.record,key=keyOf(r),id=encodeURIComponent(key),target=doc(db,'env_fee_records',id);
      const snapshot=await tx.get(target);
      sources.push({p,key,id,target,snapshot});
     }
     for(const x of sources){
      const current=x.snapshot.exists()?x.snapshot.data():null;
      if(!!current!==x.p.expectedExists||versionToken(current)!==x.p.expectedVersion){
       throw Error(`雲端資料已變動：${x.key}；本次寫入取消，請重新預覽`);
      }
      if(current&&Number(current.refund||0)>x.p.record.amount&&x.p.record.amount!==null){
       throw Error(`原有退費高於新金額：${x.key}`);
      }
     }
     for(const x of sources){
      const {p,key,id,target,snapshot}=x;
      const before=snapshot.exists()?snapshot.data():null;
      const r={...before,...p.record,id,key,deleted:false};
      validRecord(r);
      tx.set(target,{...r,updatedAt:serverTimestamp(),updatedBy:user.email});
      const audit=doc(collection(db,'env_fee_audit_logs'));
      tx.set(audit,{targetCollection:'env_fee_records',targetId:id,action:'bulk-import-r12',
       before,after:r,actor:user.email,sourceFile:String(p.sourceFile||'').slice(0,200),
       sourceSheet:String(p.sourceSheet||'').slice(0,80),sourceCell:String(p.sourceCell||'').slice(0,40),
       sourceAnnotation:String(p.sourceAnnotation||'').slice(0,80),createdAt:serverTimestamp()});
     }
    },{maxAttempts:3});
    completed+=portion.length;
    if(typeof options.onProgress==='function')options.onProgress(completed);
   }catch(e){throw Error(`已成功寫入 ${completed} 筆，剩餘 ${plans.length-completed} 筆未完成。${e.message}`)}
  }
  return {written:completed};
 }
};
onAuthStateChanged(auth,u=>{
 user=u;
 if(!u){stopWatch();lastError='';emit();return}
 if(u.email!==ADMIN_EMAIL||!u.emailVerified){stopWatch();lastError='目前帳號沒有 EHS 管理權限，請登出後使用已驗證的管理員帳號。';emit();return}
 observe();emit();
},e=>{lastError='Firebase 驗證失敗：'+e.message;emit()});
getRedirectResult(auth).catch(e=>{lastError='Google 重新導向登入失敗：'+e.message;emit()});
