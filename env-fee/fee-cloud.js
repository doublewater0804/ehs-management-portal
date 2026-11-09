// EHS 環保規費 R1.1 專用 Firebase bridge：沿用入口網站 portal/config.js，不複製或另建權限規則。
import {initializeApp,getApps} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,signInWithRedirect,getRedirectResult,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,collection,doc,onSnapshot,getDoc,getDocsFromServer,query,where,writeBatch,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
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
 if(!r.deleted&&r.status==='已申報'&&(!Number.isInteger(r.amount)||r.amount<0||!Number.isInteger(r.refund)||r.refund<0||r.refund>r.amount))throw Error('金額必須是非負整數，且扣抵不得高於原始金額');
 if(!r.deleted&&r.status==='尚未申報'&&r.amount!==null)throw Error('尚未申報的金額必須為空值');
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
 async importRows(rows){
  permitted();if(!rows.length)return;
  let completed=0;
  for(let i=0;i<rows.length;i+=200){
   const portion=rows.slice(i,i+200),batch=writeBatch(db);
   for(const r of portion){
    validRecord(r);const key=keyOf(r),id=encodeURIComponent(key);
    const target=doc(db,'env_fee_records',id);
    const existing=await getDoc(target);
    const data={...r,id,key,updatedAt:serverTimestamp(),updatedBy:user.email};
    batch.set(target,data);
    batch.set(doc(collection(db,'env_fee_audit_logs')),{targetCollection:'env_fee_records',targetId:id,action:'bulk-import',before:existing.exists()?existing.data():null,after:r,actor:user.email,createdAt:serverTimestamp()});
   }
   try{await batch.commit();completed+=portion.length}
   catch(e){throw Error(`已提交 ${completed} 筆，後續失敗；請勿直接重複匯入未核對資料。詳細：${e.message}`)}
  }
 }
};
onAuthStateChanged(auth,u=>{
 user=u;
 if(!u){stopWatch();lastError='';emit();return}
 if(u.email!==ADMIN_EMAIL||!u.emailVerified){stopWatch();lastError='目前帳號沒有 EHS 管理權限，請登出後使用已驗證的管理員帳號。';emit();return}
 observe();emit();
},e=>{lastError='Firebase 驗證失敗：'+e.message;emit()});
getRedirectResult(auth).catch(e=>{lastError='Google 重新導向登入失敗：'+e.message;emit()});
