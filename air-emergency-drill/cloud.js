// All application records live under ehs_air_emergency_drill_r0/state/*.
import {initializeApp,getApps} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,onAuthStateChanged,signInWithPopup,signOut,GoogleAuthProvider} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,collection,doc,onSnapshot,runTransaction,serverTimestamp,getDocsFromServer,deleteDoc,query,where} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import {firebaseConfig,ADMIN_EMAIL} from '../portal/config.js';
import {INITIAL_SITES,recordKey} from './model.js';
const app=getApps().find(a=>a.name==='ehs-portal')||initializeApp(firebaseConfig,'ehs-portal');
const auth=getAuth(app),db=getFirestore(app);
const root=['ehs_air_emergency_drill_r0','state'];
const cref=name=>collection(db,...root,name);
const dref=(name,id)=>doc(db,...root,name,id);
const paths=['sites','units','rotations','drills','years'];
export const owner=()=>Boolean(auth.currentUser&&auth.currentUser.email===ADMIN_EMAIL&&auth.currentUser.emailVerified);
const ensureOwner=()=>{if(!owner())throw Error('須以已驗證的 EHS 管理員帳號登入。');};
export const observeAuth=callback=>onAuthStateChanged(auth,callback);
export const login=()=>signInWithPopup(auth,new GoogleAuthProvider());
export const logout=()=>signOut(auth);
export function watchAll(callback,failed){
 ensureOwner();let docs={sites:[],units:[],rotations:[],drills:[],years:[],settings:{noticeDays:7}},ready=new Set();
 const cacheFlags={sites:true,units:true,rotations:true,drills:true,years:true,settings:true};
 const subscriptions=paths.map(type=>onSnapshot(cref(type),{includeMetadataChanges:true},snap=>{
  docs[type]=snap.docs.map(d=>({...d.data(),id:d.id}));ready.add(type);cacheFlags[type]=snap.metadata.fromCache||snap.metadata.hasPendingWrites;
  callback({...docs,ready:ready.size===6,fromCache:Object.values(cacheFlags).some(Boolean)});
 },failed));
 subscriptions.push(onSnapshot(dref('settings','general'),{includeMetadataChanges:true},snap=>{
  docs.settings=snap.exists()?{...snap.data(),id:'general'}:{noticeDays:7,version:0};ready.add('settings');cacheFlags.settings=snap.metadata.fromCache||snap.metadata.hasPendingWrites;
  callback({...docs,ready:ready.size===6,fromCache:Object.values(cacheFlags).some(Boolean)});
 },failed));
 return ()=>subscriptions.forEach(stop=>stop());
}
export async function initializeSites(){
 ensureOwner();const user=auth.currentUser;
 await runTransaction(db,async tx=>{
  const refs=INITIAL_SITES.map(x=>dref('sites',x.id));const snaps=[];
  for(const ref of refs)snaps.push(await tx.get(ref));
  snaps.forEach((s,i)=>{if(!s.exists())tx.set(refs[i],{...INITIAL_SITES[i],version:1,createdBy:user.uid,updatedAt:serverTimestamp()});});
 });
}
async function writeVersioned(type,data,expectedVersion){
 ensureOwner();const user=auth.currentUser;const ref=dref(type,data.id);
 await runTransaction(db,async tx=>{
  const snap=await tx.get(ref),v=snap.exists()?Number(snap.data().version||0):0;
  if(v!==Number(expectedVersion||0))throw Error('雲端資料已有變更，請重新整理後再編輯。');
  tx.set(ref,{...data,version:v+1,updatedAt:serverTimestamp(),updatedBy:user.uid,createdBy:snap.exists()?(snap.data().createdBy||user.uid):user.uid});
 });
}
export const saveSite=(value,version)=>writeVersioned('sites',value,version);
export const saveUnit=(value,version)=>writeVersioned('units',value,version);
export async function saveSettings(noticeDays,expectedVersion){
 ensureOwner();const user=auth.currentUser,ref=dref('settings','general');
 await runTransaction(db,async tx=>{
  const s=await tx.get(ref),v=s.exists()?Number(s.data().version||0):0;
  if(v!==Number(expectedVersion||0))throw Error('警示設定已被更新，請重新整理。');
  tx.set(ref,{noticeDays:Number(noticeDays),version:v+1,updatedAt:serverTimestamp(),updatedBy:user.uid});
 });
}
// One yearly record per public/private premises; audit trail for rotation changes.
export async function saveDrill(data,expectedVersion){
 ensureOwner();const user=auth.currentUser,key=recordKey(data.year,data.siteId);
 const drillRef=dref('drills',key),rotationRef=dref('rotations',key);
 await runTransaction(db,async tx=>{
  const record=await tx.get(drillRef),rotation=await tx.get(rotationRef),v=record.exists()?Number(record.data().version||0):0;
  if(v!==Number(expectedVersion||0))throw Error('此年度紀錄已由其他裝置更新，請重新整理後再儲存。');
  const last=rotation.exists()?rotation.data():null;
  const history=Array.isArray(last?.history)?last.history:[];
  if(last&&last.assignedUnitId!==data.assignedUnitId)history.push({from:last.assignedUnitName||'',to:data.assignedUnitName||'',reason:data.changeReason||'',at:new Date().toISOString(),by:user.uid});
  if(!last&&data.originalUnitId!==data.assignedUnitId)history.push({from:data.originalUnitName||'',to:data.assignedUnitName||'',reason:data.changeReason||'',at:new Date().toISOString(),by:user.uid});
  // Avoid unbounded history growth in a single Firestore document; reject rather than silently drop old audit records.
  if(history.length>200)throw Error('異動歷程已達上限，請先進行歷史資料歸檔。');
  tx.set(rotationRef,{siteId:data.siteId,year:Number(data.year),originalUnitId:data.originalUnitId||'',originalUnitName:data.originalUnitName||'',assignedUnitId:data.assignedUnitId,assignedUnitName:data.assignedUnitName,changeReason:data.changeReason||'',history,updatedAt:serverTimestamp(),updatedBy:user.uid});
  tx.set(drillRef,{...data,id:key,year:Number(data.year),version:v+1,createdBy:record.exists()?(record.data().createdBy||user.uid):user.uid,updatedBy:user.uid,updatedAt:serverTimestamp()});
 });
}

// R0.2: year metadata only. Historical drills/rotations remain in their original documents.
export async function saveYear(value,expectedVersion=0){
 ensureOwner();const y=Number(value.year);
 if(!Number.isInteger(y)||y<2026||y>2100)throw Error('年度須介於2026～2100。');
 const note=String(value.note||'').trim();if(note.length>500)throw Error('年度備註最多500字。');
 const status=value.status||'active';if(!['active','archived','deleted'].includes(status))throw Error('年度狀態錯誤。');
 const ref=dref('years',String(y)),uid=auth.currentUser.uid;
 await runTransaction(db,async tx=>{
  const snap=await tx.get(ref),v=snap.exists()?Number(snap.data().version||0):0;
  if(v!==Number(expectedVersion||0))throw Error('年度已被其他裝置更新，請重新整理後再試。');
  tx.set(ref,{year:y,note,status,version:v+1,updatedAt:serverTimestamp(),updatedBy:uid,createdBy:snap.exists()?snap.data().createdBy:uid});
 });
}
// Stronger server-side check before any year deletion (logical deletion / reversible).
export async function removeYear(year,expectedVersion=0){
 ensureOwner();const y=Number(year);
 if(y<2026||y>2100||!Number.isInteger(y))throw Error('年度不正確。');
 const results=await getDocsFromServer(query(cref('drills'),where('year','==',y)));
 const refs=results.docs.map(d=>d.ref),yearRef=dref('years',String(y)),uid=auth.currentUser.uid;
 await runTransaction(db,async tx=>{
  const yearSnap=await tx.get(yearRef),reads=[];
  for(const ref of refs)reads.push(await tx.get(ref));
  if(reads.some(d=>d.exists()&&Boolean(d.data().actualDate||d.data().sentDate)))throw Error('年度已有實際演練或發文紀錄，不得刪除；請改用封存。');
  const v=yearSnap.exists()?Number(yearSnap.data().version||0):0;
  if(v!==Number(expectedVersion||0))throw Error('年度已變更，請重新整理後再試。');
  tx.set(yearRef,{year:y,note:yearSnap.exists()?(yearSnap.data().note||''):'',status:'deleted',version:v+1,updatedAt:serverTimestamp(),updatedBy:uid,createdBy:yearSnap.exists()?yearSnap.data().createdBy:uid});
 });
}
// Add all rows atomically; never mutate existing units or any year/drill records.
export async function saveUnitsBatch(siteId,rows,existingUnits=[]){
 ensureOwner();
 const {validateBatchUnits}=await import('./model.js');
 validateBatchUnits(siteId,rows,existingUnits);
 const siteSnap=await getDocsFromServer(cref('units'));
 const current=siteSnap.docs.map(d=>({...d.data(),id:d.id}));
 validateBatchUnits(siteId,rows,current);
 const uid=auth.currentUser.uid,refs=rows.map(row=>dref('units',row.id));
 const guardRef=dref('settings','unit-catalog-'+siteId);
 await runTransaction(db,async tx=>{
  const guard=await tx.get(guardRef),read=[];
  for(const ref of refs)read.push(await tx.get(ref));
  if(read.some(s=>s.exists()))throw Error('廠處識別碼已存在，請重新開啟批次表單。');
  for(let i=0;i<rows.length;i++)tx.set(refs[i],{...rows[i],siteId,active:rows[i].active!==false,version:1,createdBy:uid,updatedBy:uid,updatedAt:serverTimestamp()});
  tx.set(guardRef,{version:Number(guard.exists()?guard.data().version||0:0)+1,updatedAt:serverTimestamp(),updatedBy:uid});
 });
}
export async function deleteUnusedUnit(unit,expectedVersion){
 ensureOwner();
 // R0.1 records may reference a unit by original/assigned id or rotation history names.
 const [drillSnap,rotationSnap]=await Promise.all([getDocsFromServer(cref('drills')),getDocsFromServer(cref('rotations'))]);
 const {unitWasUsed}=await import('./model.js');
 if(unitWasUsed(unit,drillSnap.docs.map(d=>d.data()),rotationSnap.docs.map(d=>d.data())))throw Error('此廠處已有歷史輪值或演練引用，禁止刪除；請停用。');
 const ref=dref('units',unit.id);
 await runTransaction(db,async tx=>{
  const snap=await tx.get(ref);
  if(!snap.exists()||Number(snap.data().version||0)!==Number(expectedVersion||0))throw Error('廠處資料已變更，請重新整理後再刪除。');
  tx.delete(ref);
 });
}
