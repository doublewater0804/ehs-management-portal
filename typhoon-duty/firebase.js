const DEFAULT_PATHS={staff:'ehs_typhoon_r0_staff', events:'ehs_typhoon_r0_events', reports:'ehs_typhoon_r0_reports', incidents:'ehs_typhoon_r0_incidents', rules:'ehs_typhoon_r0_rules', notes:'ehs_typhoon_r0_notes', revisions:'ehs_typhoon_r0_revisions', settings:'ehs_typhoon_r0_settings'};
const config=window.EHS_TYPHOON_CONFIG||{mode:'demo'};
let auth=null,db=null,firestore=null,authLib=null, user=null;
export const mode=config.mode||'demo';
export const paths=DEFAULT_PATHS;
export const ownerUid=config.ownerUid||'';
export const portalHome=config.portalHome||'../';
const demoPrefix='ehs_typhoon_r0_demo__';
export const isOwner=()=>mode==='demo'||Boolean(user && ownerUid && user.uid===ownerUid);
export const currentUser=()=>user;
export async function init(onAuth){
 if(mode==='demo') {user={uid:'DEMO_OWNER',email:'demo@local.test'};onAuth(user);return;}
 if(mode!=='firebase') throw new Error('config.js 的 mode 僅可為 demo 或 firebase');
 const c=config.firebaseConfig||{};
 if(!c.apiKey||!c.projectId||!c.appId||!ownerUid)throw new Error('正式模式未完整填入 Firebase config 或 ownerUid。');
 const fb=await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js');
 authLib=await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js');
 firestore=await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
 const application=fb.getApps().length?fb.getApp():fb.initializeApp(c);
 db=firestore.getFirestore(application);auth=authLib.getAuth(application);
 authLib.onAuthStateChanged(auth, u=>{user=u;onAuth(u);});
}
export async function signIn(email,password){if(!authLib)throw new Error('Firebase 尚未初始化'); await authLib.signInWithEmailAndPassword(auth,email,password);}
export async function signOut(){if(authLib) await authLib.signOut(auth);}
function ensureAccess(write=false){if(mode==='firebase'&&!user)throw new Error('尚未登入');if(write&&!isOwner())throw new Error('只有系統管理員有寫入權限');}
export async function listDocs(kind){ensureAccess();if(mode==='demo')return JSON.parse(localStorage.getItem(demoPrefix+kind)||'[]');
 const snapshot=await firestore.getDocs(firestore.collection(db,paths[kind]));
 return snapshot.docs.map(x=>({id:x.id,...x.data()}));}
export async function saveDoc(kind,item){ensureAccess(true);const value={...item};if(!value.id)throw new Error('缺少資料 id');
 if(mode==='demo'){const all=await listDocs(kind);const ix=all.findIndex(x=>x.id===value.id);if(ix<0)all.push(value);else all[ix]=value;localStorage.setItem(demoPrefix+kind,JSON.stringify(all));return;}
 await firestore.setDoc(firestore.doc(db,paths[kind],value.id),value);
}
export async function deleteDoc(kind,id){ensureAccess(true);if(mode==='demo'){const all=await listDocs(kind);localStorage.setItem(demoPrefix+kind,JSON.stringify(all.filter(x=>x.id!==id)));return;}
 await firestore.deleteDoc(firestore.doc(db,paths[kind],id));}
export const makeId=()=>crypto.randomUUID?crypto.randomUUID():`${Date.now()}_${Math.random().toString(36).slice(2)}`;
