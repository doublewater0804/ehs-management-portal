import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,doc,onSnapshot,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import {firebaseConfig,ADMIN_EMAIL} from '../portal/config.js';
import {validateYear} from './model.js';
const app=initializeApp(firebaseConfig,'ehs-portal');
const auth=getAuth(app),db=getFirestore(app);
const cfgRef=doc(db,'ehs_shutdown_inspection','config');
const yearRef=y=>doc(db,'ehs_shutdown_inspection',`year_${y}`);
export const isOwner=u=>!!u&&u.email===ADMIN_EMAIL&&u.emailVerified;
export const observeAuth=fn=>onAuthStateChanged(auth,fn);
export const login=()=>signInWithPopup(auth,new GoogleAuthProvider());
export const logout=()=>signOut(auth);
export const watchConfig=(ok,fail)=>onSnapshot(cfgRef,{includeMetadataChanges:true},s=>{if(s.metadata.fromCache||s.metadata.hasPendingWrites)return;ok(s.exists()?s.data():null);},fail);
export const watchYear=(year,ok,fail)=>onSnapshot(yearRef(year),{includeMetadataChanges:true},s=>{if(s.metadata.fromCache||s.metadata.hasPendingWrites)return;ok(s.exists()?s.data():null);},fail);
export async function saveYear(data,expectedVersion){validateYear(data);if(!isOwner(auth.currentUser))throw Error('只有管理者可以修改。');const u=auth.currentUser;await runTransaction(db,async tx=>{const ref=yearRef(data.year),s=await tx.get(ref),v=s.exists()?(s.data().version||0):0;if(v!==expectedVersion)throw Error('資料已在其他視窗更新，請重新整理後再操作。');tx.set(ref,{...data,version:v+1,updatedBy:u.uid,updatedAt:serverTimestamp()});});}
export async function saveConfig(next,expectedVersion){if(!isOwner(auth.currentUser))throw Error('只有管理者可以修改。');const u=auth.currentUser;await runTransaction(db,async tx=>{const s=await tx.get(cfgRef),v=s.exists()?(s.data().version||0):0;if(v!==expectedVersion)throw Error('年度設定已被更新，請重新整理。');tx.set(cfgRef,{...next,version:v+1,updatedBy:u.uid,updatedAt:serverTimestamp()});});}
