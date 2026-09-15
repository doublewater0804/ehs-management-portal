import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,doc,onSnapshot,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import {firebaseConfig,ADMIN_EMAIL} from '../portal/config.js';
import {normalize,validate} from './model.js?v=20260915-v2';
const app=initializeApp(firebaseConfig,'ehs-portal');const auth=getAuth(app),db=getFirestore(app),ref=doc(db,'incident_investigation','roster');
export const owner=()=>!!(auth.currentUser?.email===ADMIN_EMAIL&&auth.currentUser?.emailVerified);
export const observe=cb=>onAuthStateChanged(auth,cb);
export const login=()=>signInWithPopup(auth,new GoogleAuthProvider());
export const logout=()=>signOut(auth);
export const watch=(ok,fail)=>onSnapshot(ref,{includeMetadataChanges:true},s=>{if(s.metadata.fromCache||s.metadata.hasPendingWrites)return;try{ok(validate(normalize(s.exists()?s.data():{})));}catch(e){fail(e);}},fail);
export async function save(draft,expected){
 if(!owner())throw Error('只有管理者可以修改。');const user=auth.currentUser;
 const next=validate({...structuredClone(draft),schemaVersion:2,version:expected+1});
 await runTransaction(db,async tx=>{
  if(auth.currentUser?.uid!==user.uid||!owner())throw Error('登入帳號已變更，請重新登入。');
  const s=await tx.get(ref);if((s.exists()?s.data().version:0)!==expected)throw Error('資料已在其他視窗更新。請先取消編輯，再重新修改。');
  tx.set(ref,{...next,updatedBy:user.uid,updatedAt:serverTimestamp()});
 });return next;
}
