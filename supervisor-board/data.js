import {COL,ownId,normalizeSupervisor,normalizeRecord,recordChanged,supervisorChanged} from './schema.js';
import {firebaseConfig,ADMIN_EMAIL} from '../portal/config.js';
const DEMO=new URLSearchParams(location.search).get('demo')==='1';
const KEY='ehs_supervisor_board_r01_demo__';
let auth=null, db=null, fb=null, lib=null, current=null, listener=null, authObserver=null;
export const isDemo=()=>DEMO;
export const getUser=()=>current;
export const isAdmin=()=>DEMO || Boolean(current && current.email===ADMIN_EMAIL && current.emailVerified);
function guard(){if(!isAdmin())throw Error('請以 EHS 原管理員 Google 帳號登入後操作。');}
function clone(o){return structuredClone(o);}
function localRead(kind){return JSON.parse(localStorage.getItem(KEY+kind)||'[]');}
function localWrite(kind,arr){localStorage.setItem(KEY+kind,JSON.stringify(arr));}
export async function startAuth(onChange){
  if(DEMO){current={email:'DEMO（本機資料）',uid:'DEMO',emailVerified:true};onChange(current);return;}
  fb=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js');
  lib=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js');
  const database=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
  const app=fb.getApps().find(x=>x.name==='ehs-portal')||fb.initializeApp(firebaseConfig,'ehs-portal');
  auth=lib.getAuth(app);db=database.getFirestore(app);fb=database;
  authObserver=lib.onAuthStateChanged(auth,u=>{current=u;onChange(u);});
}
export async function login(){if(DEMO)return;await lib.signInWithPopup(auth,new lib.GoogleAuthProvider());}
export async function logout(){if(DEMO){location.href=location.pathname;return;}await lib.signOut(auth);}
export async function loadAll(){
  guard();
  if(DEMO)return {supervisors:localRead('supervisors'),records:localRead('records'),history:localRead('history')};
  const out=await Promise.all([COL.supervisors,COL.records,COL.history].map(async p=>{
    const s=await fb.getDocs(fb.collection(db,p));return s.docs.map(d=>({...d.data(),id:d.id}));
  }));
  return {supervisors:out[0],records:out[1],history:out[2]};
}
export async function saveSupervisor(input,expectedVersion=0){
  guard();const s=normalizeSupervisor(input);s.id=s.id||ownId();
  const stamp=new Date().toISOString();
  if(DEMO){
    const list=localRead('supervisors'),i=list.findIndex(x=>x.id===s.id),old=list[i];
    if((old?.version||0)!==expectedVersion)throw Error('主管資料已更新，請重新載入。');
    if(old && !supervisorChanged(old,s))return old;
    const next={...s,version:expectedVersion+1,createdAt:old?.createdAt||stamp,updatedAt:stamp};
    if(i<0)list.push(next);else list[i]=next;localWrite('supervisors',list);return next;
  }
  const ref=fb.doc(db,COL.supervisors,s.id);
  return fb.runTransaction(db,async tx=>{
    const snap=await tx.get(ref),old=snap.exists()?snap.data():null;
    if((old?.version||0)!==expectedVersion)throw Error('主管資料已在其他視窗變更，請重新載入。');
    if(old && !supervisorChanged(old,s))return {...old,id:s.id};
    const next={...s,version:expectedVersion+1,createdAt:old?.createdAt||stamp,updatedAt:stamp,updatedBy:current.email};
    tx.set(ref,next);return next;
  });
}
export async function saveRecord(input,supervisors,expectedVersion=0,action='manual'){
  guard();
  const id=input.id||ownId(),stamp=new Date().toISOString();
  if(DEMO){
    const list=localRead('records'),i=list.findIndex(x=>x.id===id),old=list[i];
    if((old?.version||0)!==expectedVersion)throw Error('指示紀錄已在其他視窗變更，請重新載入。');
    const r=normalizeRecord({...input,id},supervisors,{existing:old});
    if(old&&!recordChanged(old,r))return old;
    const next={...r,version:expectedVersion+1,createdAt:old?.createdAt||stamp,updatedAt:stamp,updatedBy:current.email};
    const hist={id:id+'__v'+String(next.version).padStart(6,'0'),recordId:id,version:next.version,action,actor:current.email,changedAt:stamp,before:old?clone(old):null,after:clone(next)};
    if(i<0)list.push(next);else list[i]=next;
    const histories=localRead('history');histories.push(hist);localWrite('records',list);localWrite('history',histories);return next;
  }
  const ref=fb.doc(db,COL.records,id);
  return fb.runTransaction(db,async tx=>{
    const snap=await tx.get(ref),old=snap.exists()?snap.data():null;
    if((old?.version||0)!==expectedVersion)throw Error('指示已在其他視窗變更，請重新載入後重試。');
    const r=normalizeRecord({...input,id},supervisors,{existing:old});
    if(old&&!recordChanged(old,r))return {...old,id};
    const next={...r,version:expectedVersion+1,createdAt:old?.createdAt||stamp,updatedAt:stamp,updatedBy:current.email};
    const historyRef=fb.doc(db,COL.history,id+'__v'+String(next.version).padStart(6,'0'));
    tx.set(ref,next);
    tx.set(historyRef,{recordId:id,version:next.version,action,actor:current.email,changedAt:stamp,committedAt:fb.serverTimestamp(),before:old?clone(old):null,after:clone(next)});
    return next;
  });
}
