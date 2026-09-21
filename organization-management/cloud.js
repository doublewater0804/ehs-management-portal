import {initializeApp,getApps} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,GoogleAuthProvider,signInWithPopup,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getFirestore,doc,getDoc,setDoc,collection,getDocs,writeBatch,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';
import {firebaseConfig,ADMIN_EMAIL} from '../portal/config.js';

const app=getApps().find(a=>a.name==='ehs-org-management')||initializeApp(firebaseConfig,'ehs-org-management');
const auth=getAuth(app),db=getFirestore(app);
const root='ehs_org';
export const observeAuth=cb=>onAuthStateChanged(auth,cb);
export const login=()=>signInWithPopup(auth,new GoogleAuthProvider());
export const logout=()=>signOut(auth);
export async function verifyAdmin(){if(auth.currentUser?.email!==ADMIN_EMAIL||!auth.currentUser?.emailVerified)throw Error('請使用已驗證的管理者 Google 帳號登入。');}
export function currentUser(){return auth.currentUser;}

async function readCollection(name){const s=await getDocs(collection(db,root,name,'items'));return s.docs.map(d=>({id:d.id,...d.data()}));}
export async function loadAll(){
  await verifyAdmin();
  const metaSnap=await getDoc(doc(db,root,'meta'));
  const [staff,nodes,versions,changes]=await Promise.all([readCollection('staff'),readCollection('nodes'),readCollection('versions'),readCollection('changes')]);
  return {meta:metaSnap.exists()?metaSnap.data():null,staff,nodes,versions,changes};
}
export async function initializeData({meta,staff,nodes,versions}){
  await verifyAdmin(); const existing=await getDoc(doc(db,root,'meta')); if(existing.exists())throw Error('雲端資料已存在，不可重複初始化。');
  const b=writeBatch(db); b.set(doc(db,root,'meta'),{...meta,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
  staff.forEach(x=>b.set(doc(db,root,'staff','items',x.id),x)); nodes.forEach(x=>b.set(doc(db,root,'nodes','items',x.id),x)); versions.forEach(x=>b.set(doc(db,root,'versions','items',x.id),x)); await b.commit();
}
export async function saveStaff(item,change){await verifyAdmin();const b=writeBatch(db);b.set(doc(db,root,'staff','items',item.id),{...item,updatedAt:serverTimestamp()},{merge:true});if(change)b.set(doc(db,root,'changes','items',change.id),{...change,createdAt:serverTimestamp()});b.set(doc(db,root,'meta'),{hasDraft:true,updatedAt:serverTimestamp()},{merge:true});await b.commit();}
export async function bulkImport({upserts,changes}){await verifyAdmin();const b=writeBatch(db);upserts.forEach(x=>b.set(doc(db,root,'staff','items',x.id),{...x,updatedAt:serverTimestamp()},{merge:true}));changes.forEach(c=>b.set(doc(db,root,'changes','items',c.id),{...c,createdAt:serverTimestamp()}));b.set(doc(db,root,'meta'),{hasDraft:true,updatedAt:serverTimestamp()},{merge:true});await b.commit();}
export async function saveStaffing(nodes){await verifyAdmin();const b=writeBatch(db);nodes.forEach(n=>b.set(doc(db,root,'nodes','items',n.id),n,{merge:true}));b.set(doc(db,root,'meta'),{hasDraft:true,updatedAt:serverTimestamp()},{merge:true});await b.commit();}
export async function publishVersion(version,pendingChanges,staffSnapshot){await verifyAdmin();const b=writeBatch(db);const v={...version,changeCount:pendingChanges.length,changes:pendingChanges,snapshot:staffSnapshot,createdAt:serverTimestamp()};b.set(doc(db,root,'versions','items',version.version),v);pendingChanges.forEach(c=>b.set(doc(db,root,'changes','items',c.id),{...c,publishedVersion:version.version,publishedAt:serverTimestamp()},{merge:true}));b.set(doc(db,root,'meta'),{version:version.version,revisionDate:version.revisionDate,hasDraft:false,updatedAt:serverTimestamp()},{merge:true});await b.commit();}
