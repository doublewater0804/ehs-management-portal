import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,doc,onSnapshot,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import {firebaseConfig,ADMIN_EMAIL} from '../portal/config.js';
import {validateState} from './model.js';
// Reuse the portal's named app so its login persists when opening this module.
const app=initializeApp(firebaseConfig,'ehs-portal');
const auth=getAuth(app),db=getFirestore(app),ref=doc(db,'ehs_storage_facilities','catalog');
export const isOwner=user=>!!user&&user.email===ADMIN_EMAIL&&user.emailVerified;
export const observeAuth=fn=>onAuthStateChanged(auth,fn);
export const login=()=>signInWithPopup(auth,new GoogleAuthProvider());
export const logout=()=>signOut(auth);
export const watch=(ok,fail)=>onSnapshot(ref,{includeMetadataChanges:true},snapshot=>{
 if(snapshot.metadata.fromCache||snapshot.metadata.hasPendingWrites)return;
 ok(snapshot.exists()?snapshot.data():null);
},fail);
export async function save(state,expectedVersion){
 validateState(state);if(!isOwner(auth.currentUser))throw Error('請使用管理者帳號登入。');
 const uid=auth.currentUser.uid;
 await runTransaction(db,async tx=>{
  const snapshot=await tx.get(ref),current=snapshot.exists()?snapshot.data().version:0;
  if(current!==expectedVersion)throw Error('資料已在其他視窗更新。請取消編輯，再以最新資料重新操作。');
  tx.set(ref,{...state,version:current+1,updatedBy:uid,updatedAt:serverTimestamp()});
 });
}
