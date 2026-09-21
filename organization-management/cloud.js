import {initializeApp,getApps} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,signInWithRedirect,getRedirectResult,onAuthStateChanged,signOut,setPersistence,browserLocalPersistence} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,doc,getDoc,collection,getDocs,writeBatch,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBGgf0A5MFOqPxQvlX8tACski48bMYI_DU',
  authDomain: 'esh-v85.firebaseapp.com',
  projectId: 'esh-v85',
  storageBucket: 'esh-v85.firebasestorage.app',
  messagingSenderId: '1021350670476',
  appId: '1:1021350670476:web:afd5bc96ff28c910f48ba9',
  measurementId: 'G-MMVQN63GDG'
};

export const ADMIN_EMAIL='doublewater0804@gmail.com';
const app=getApps().find(a=>a.name==='ehs-org-management')||initializeApp(firebaseConfig,'ehs-org-management');
const auth=getAuth(app),db=getFirestore(app);
const root='ehs_org';
const provider=new GoogleAuthProvider();
provider.setCustomParameters({prompt:'select_account'});
try{await setPersistence(auth,browserLocalPersistence);}catch(e){console.warn('Auth persistence unavailable',e);}
try{await getRedirectResult(auth);}catch(e){console.warn('Redirect login result',e);}

export const observeAuth=cb=>onAuthStateChanged(auth,cb);
export async function login(){
  try{return await signInWithPopup(auth,provider);}
  catch(e){
    if(['auth/popup-blocked','auth/cancelled-popup-request','auth/operation-not-supported-in-this-environment'].includes(e?.code)){
      await signInWithRedirect(auth,provider);return null;
    }
    throw e;
  }
}
export const logout=()=>signOut(auth);
export function isAdminUser(user=auth.currentUser){return !!(user?.emailVerified && user?.email===ADMIN_EMAIL);}
export async function verifyAdmin(){if(!isAdminUser())throw Error('請使用已驗證的 EHS 管理者 Google 帳號登入。');}
export function currentUser(){return auth.currentUser;}

async function readCollection(name){const s=await getDocs(collection(db,root,name,'items'));return s.docs.map(d=>({id:d.id,...d.data()}));}
export async function loadAll(){
  const metaSnap=await getDoc(doc(db,root,'meta'));
  const [staff,nodes,versions,changes]=await Promise.all([readCollection('staff'),readCollection('nodes'),readCollection('versions'),readCollection('changes')]);
  return {meta:metaSnap.exists()?metaSnap.data():null,staff,nodes,versions,changes};
}
export async function initializeData({meta,staff,nodes,versions}){await verifyAdmin();const existing=await getDoc(doc(db,root,'meta'));if(existing.exists())throw Error('雲端資料已存在，不可重複初始化。');const b=writeBatch(db);b.set(doc(db,root,'meta'),{...meta,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});staff.forEach(x=>b.set(doc(db,root,'staff','items',x.id),x));nodes.forEach(x=>b.set(doc(db,root,'nodes','items',x.id),x));versions.forEach(x=>b.set(doc(db,root,'versions','items',x.id),x));await b.commit();}
export async function saveStaff(item,change){await verifyAdmin();const b=writeBatch(db);b.set(doc(db,root,'staff','items',item.id),{...item,updatedAt:serverTimestamp()},{merge:true});if(change)b.set(doc(db,root,'changes','items',change.id),{...change,createdAt:serverTimestamp()});b.set(doc(db,root,'meta'),{hasDraft:true,updatedAt:serverTimestamp()},{merge:true});await b.commit();}
export async function bulkImport({upserts,changes}){await verifyAdmin();const b=writeBatch(db);upserts.forEach(x=>b.set(doc(db,root,'staff','items',x.id),{...x,updatedAt:serverTimestamp()},{merge:true}));changes.forEach(c=>b.set(doc(db,root,'changes','items',c.id),{...c,createdAt:serverTimestamp()}));b.set(doc(db,root,'meta'),{hasDraft:true,updatedAt:serverTimestamp()},{merge:true});await b.commit();}
export async function saveStaffing(nodes){await verifyAdmin();const b=writeBatch(db);nodes.forEach(n=>b.set(doc(db,root,'nodes','items',n.id),n,{merge:true}));b.set(doc(db,root,'meta'),{hasDraft:true,updatedAt:serverTimestamp()},{merge:true});await b.commit();}
export async function publishVersion(version,pendingChanges,staffSnapshot){await verifyAdmin();const b=writeBatch(db);const v={...version,changeCount:pendingChanges.length,changes:pendingChanges,snapshot:staffSnapshot,createdAt:serverTimestamp()};b.set(doc(db,root,'versions','items',version.version),v);pendingChanges.forEach(c=>b.set(doc(db,root,'changes','items',c.id),{...c,publishedVersion:version.version,publishedAt:serverTimestamp()},{merge:true}));b.set(doc(db,root,'meta'),{version:version.version,revisionDate:version.revisionDate,hasDraft:false,updatedAt:serverTimestamp()},{merge:true});await b.commit();}
