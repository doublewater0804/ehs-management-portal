import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,onAuthStateChanged,GoogleAuthProvider,signInWithPopup,signOut} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,doc,getDoc,runTransaction,serverTimestamp,onSnapshot} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import {getStorage,ref as storageRef,uploadBytes,getBytes,deleteObject} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js';
import {firebaseConfig,ADMIN_EMAIL} from '../portal/config.js';
const app=initializeApp(firebaseConfig,'ehs-portal');
const auth=getAuth(app),db=getFirestore(app),storage=getStorage(app);
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
export async function loadBytes(meta){requireOwner();if(!meta?.storagePath)throw Error('找不到正式發布檔');
 const b=await getBytes(storageRef(storage,meta.storagePath),12*1024*1024);return b;
}
export async function publish(bytes,{expectedVersion,reportDate,originalFilename,sheetNames}){
 const user=requireOwner();if(!/^\d{4}-\d{2}-\d{2}$/.test(reportDate))throw Error('請設定 Excel 報表日期');
 if(!(bytes instanceof ArrayBuffer)&&!(bytes instanceof Uint8Array))throw Error('無效的 Excel 檔案');
 if(bytes.byteLength>10*1024*1024)throw Error('檔案超過雲端儲存上限 10 MB');
 // A unique, immutable object, then a compare-and-set metadata commit.
 // Stale writers cannot accidentally replace the active workbook.
 const path=`weekly-focus/${user.uid}/${crypto.randomUUID()}.xlsx`;
 const fileRef=storageRef(storage,path);
 await uploadBytes(fileRef,new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),{contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',customMetadata:{ownerUid:user.uid}});
 let previous=null;
 try{
  await runTransaction(db,async tx=>{
   const s=await tx.get(record),data=s.exists()?s.data():null,rev=data?.version||0;
   if(rev!==expectedVersion)throw Error('雲端檔案已在另一個視窗更新，請重新整理後再編輯。');
   previous=data?.storagePath||null;
   tx.set(record,{storagePath:path,version:rev+1,reportDate,originalFilename:String(originalFilename||'工作重點.xlsx').slice(0,180),sheetNames:sheetNames.slice(0,25),updatedAt:serverTimestamp(),updatedBy:user.uid,format:'xlsx'});
  });
 }catch(e){await deleteObject(fileRef).catch(()=>{});throw e;}
 // Keep only the published release. Storage delete may be blocked by rules,
 // in which case surface a warning so cleanup can be done by the owner.
 let cleanupError=false;
 if(previous&&previous!==path){try{await deleteObject(storageRef(storage,previous));}catch(_){cleanupError=true;}}
 return {cleanupError};
}
