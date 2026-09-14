import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,doc,onSnapshot,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import {firebaseConfig,ADMIN_EMAIL} from './config.js';
const app=initializeApp(firebaseConfig,'ehs-portal');
const auth=getAuth(app),db=getFirestore(app),ref=doc(db,'ehs_portal','catalog');
export const watch=(ok,fail)=>onSnapshot(ref,{includeMetadataChanges:true},s=>{if(s.metadata.fromCache||s.metadata.hasPendingWrites)return;ok(s.exists()?s.data():null);},fail);
export const observeAuth=callback=>onAuthStateChanged(auth,callback);
export const login=()=>signInWithPopup(auth,new GoogleAuthProvider());
export const logout=()=>signOut(auth);
export async function verifyAdmin(){
 if(!ADMIN_EMAIL || auth.currentUser?.email !== ADMIN_EMAIL || !auth.currentUser?.emailVerified)
  throw Error('請使用已驗證的管理者 Google 帳號登入。');
}
export async function save(modules,expectedVersion){
 await verifyAdmin();
 await runTransaction(db,async tx=>{
  const snapshot=await tx.get(ref);const version=snapshot.exists()?snapshot.data().version:0;
  if(version!==expectedVersion)throw Error('清單已在另一個視窗更新，請重新開啟編輯再儲存。');
  tx.set(ref,{modules,version:version+1,updatedAt:serverTimestamp(),updatedBy:auth.currentUser.uid});
 });
}
