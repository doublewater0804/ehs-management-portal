import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,onAuthStateChanged,GoogleAuthProvider,signInWithPopup,signOut} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,doc,getDoc,getDocs,collection,writeBatch,runTransaction,serverTimestamp,onSnapshot,deleteDoc} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import {firebaseConfig,ADMIN_EMAIL} from '../portal/config.js';
const app=initializeApp(firebaseConfig,'ehs-portal');
const auth=getAuth(app), db=getFirestore(app);
const record=doc(db,'ehs_weekly_focus','current');
const owner=u=>!!u?.emailVerified&&u.email?.toLowerCase()===ADMIN_EMAIL.toLowerCase();
function requireOwner(){if(!owner(auth.currentUser))throw Error('此系統僅開放入口平台管理者帳號。');return auth.currentUser;}
export const observeAuth=onAuthStateChanged.bind(null,auth);
export const login=()=>signInWithPopup(auth,new GoogleAuthProvider());
export const logout=()=>signOut(auth);
export const isOwner=owner;
export const subscribe=(next,error)=>onSnapshot(record,{includeMetadataChanges:true},s=>{
 if(s.metadata.fromCache||s.metadata.hasPendingWrites)return;
 next(s.exists()?s.data():null);
},error);

// 300 KiB of binary per document; Base64 increases each chunk to at most 400 KiB.
// This remains below Firestore's 1 MiB document limit, including document overhead.
const CHUNK_SIZE=300*1024, MAX_BYTES=8*1024*1024;
const chunkRef=(releaseId,i)=>doc(db,'ehs_weekly_focus','current','releases',releaseId,'chunks',String(i).padStart(4,'0'));
function encode64(part){let result='';for(let i=0;i<part.length;i+=8192)result+=String.fromCharCode(...part.subarray(i,i+8192));return btoa(result);}
function decode64(s){const decoded=atob(s),bytes=new Uint8Array(decoded.length);for(let i=0;i<decoded.length;i++)bytes[i]=decoded.charCodeAt(i);return bytes;}
function asBytes(value){if(value instanceof Uint8Array)return value;if(value instanceof ArrayBuffer)return new Uint8Array(value);throw Error('無效的 Excel 檔案');}
async function digest(bytes){const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function loadBytes(meta){
 requireOwner();
 if(!meta?.releaseId||!Number.isInteger(meta.chunkCount)||meta.chunkCount<1||meta.chunkCount>32)throw Error('目前版本不是 Firestore 分段格式，請重新發布 Excel');
 const parts=[];let size=0;
 for(let i=0;i<meta.chunkCount;i++){
  const snap=await getDoc(chunkRef(meta.releaseId,i));
  if(!snap.exists())throw Error(`正式報表資料不完整：缺少分段 ${i+1}`);
  const part=decode64(snap.data().data);
  size+=part.byteLength;
  if(size>MAX_BYTES)throw Error('報表超過安全大小上限');
  parts.push(part);
 }
 if(size!==meta.byteLength)throw Error('報表資料長度不正確');
 const all=new Uint8Array(size);let offset=0;
 for(const part of parts){all.set(part,offset);offset+=part.length;}
 if(await digest(all)!==meta.sha256)throw Error('報表資料完整性驗證失敗');
 return all;
}
async function removeRelease(releaseId,count){
 if(!releaseId)return;
 if(!Number.isInteger(count)||count<1||count>32)throw Error('舊版分段數量不正確');
 // Delete only this module's version documents; never delete other EHS data.
 for(let i=0;i<count;i++)await deleteDoc(chunkRef(releaseId,i));
}
export async function publish(value,{expectedVersion,reportDate,originalFilename,sheetNames}){
 const user=requireOwner(),bytes=asBytes(value);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(reportDate))throw Error('請設定 Excel 報表日期');
 if(!Array.isArray(sheetNames)||!sheetNames.length)throw Error('找不到工作表');
 if(!bytes.length||bytes.length>MAX_BYTES)throw Error('檔案過大，Firestore 免費版單次發布限制 8 MiB');
 const releaseId=crypto.randomUUID(),count=Math.ceil(bytes.length/CHUNK_SIZE),sha256=await digest(bytes);
 // Immutable chunks are written before metadata is changed. Each batched write
 // writes only 1-10 chunk documents to leave adequate margin below 10 MiB RPC size.
 try{
  for(let start=0;start<count;start+=10){
   const batch=writeBatch(db);
   for(let i=start;i<Math.min(start+10,count);i++){
    const part=bytes.subarray(i*CHUNK_SIZE,Math.min((i+1)*CHUNK_SIZE,bytes.length));
    batch.set(chunkRef(releaseId,i),{data:encode64(part),createdBy:user.uid,index:i});
   }
   await batch.commit();
  }
 }catch(e){await removeRelease(releaseId,count).catch(()=>{});throw Error(`Firestore 報表資料寫入失敗：${e.message}`);}
 let previous=null;
 try{
  await runTransaction(db,async tx=>{
   const snap=await tx.get(record),old=snap.exists()?snap.data():null,version=old?.version||0;
   if(version!==expectedVersion)throw Error('雲端檔案已在另一個視窗更新，請重新整理後再編輯。');
   previous=old?.releaseId?{id:old.releaseId,count:old.chunkCount}:null;
   tx.set(record,{releaseId,chunkCount:count,byteLength:bytes.length,sha256,
    version:version+1,reportDate,originalFilename:String(originalFilename||'工作重點.xlsx').slice(0,180),
    sheetNames:sheetNames.slice(0,25),updatedAt:serverTimestamp(),updatedBy:user.uid,format:'xlsx',store:'firestore-chunks'});
  });
 }catch(e){await removeRelease(releaseId,count).catch(()=>{});throw Error(`正式版本寫入失敗：${e.message}`);}
 let cleanupError=false;
 if(previous){try{await removeRelease(previous.id,previous.count);}catch(e){cleanupError=true;}}
 return {cleanupError};
}
