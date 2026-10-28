import {COL,ownId,normalizeSupervisor,normalizeRecord,recordChanged,supervisorChanged,normalizeStatusList,initialStatuses} from './schema.js';
import {firebaseConfig,ADMIN_EMAIL} from '../portal/config.js';
const DEMO=new URLSearchParams(location.search).get('demo')==='1';
const KEY='ehs_supervisor_board_r01_demo__';
const STATUS_SETTINGS_COLLECTION='ehs_supervisor_board_r0_settings';
const STATUS_SETTINGS_DOC='statuses';
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
  if(DEMO){const saved=localStorage.getItem(KEY+'statusSettings');return {supervisors:localRead('supervisors'),records:localRead('records'),history:localRead('history'),statusSettings:saved?JSON.parse(saved):{items:initialStatuses(),version:0}};}
  const out=await Promise.all([COL.supervisors,COL.records,COL.history].map(async p=>{
    const s=await fb.getDocs(fb.collection(db,p));return s.docs.map(d=>({...d.data(),id:d.id}));
  }));
  const statusSnap=await fb.getDoc(fb.doc(db,STATUS_SETTINGS_COLLECTION,STATUS_SETTINGS_DOC));
  return {supervisors:out[0],records:out[1],history:out[2],statusSettings:statusSnap.exists()?statusSnap.data():{items:initialStatuses(),version:0}};
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


// R0.2：單一設定文件 + 版本檢查，初始五種狀態為虛擬預設；第一次編輯時才寫入。
export async function saveStatusSettings(items,expectedVersion=0){
  guard();const normalized=normalizeStatusList(items);const stamp=new Date().toISOString();
  if(DEMO){
    const key=KEY+'statusSettings';
    const old=localStorage.getItem(key)?JSON.parse(localStorage.getItem(key)):{items:initialStatuses(),version:0};
    if((old.version||0)!==expectedVersion)throw Error('狀態設定已變更，請重新整理。');
    const next={items:normalized,version:expectedVersion+1,updatedAt:stamp,updatedBy:current.email};
    localStorage.setItem(key,JSON.stringify(next));return next;
  }
  const ref=fb.doc(db,STATUS_SETTINGS_COLLECTION,STATUS_SETTINGS_DOC);
  return fb.runTransaction(db,async tx=>{
    const snap=await tx.get(ref),old=snap.exists()?snap.data():{items:initialStatuses(),version:0};
    if((old.version||0)!==expectedVersion)throw Error('狀態設定已在其他視窗變更，請重新整理。');
    const next={items:normalized,version:expectedVersion+1,updatedAt:stamp,updatedBy:current.email};
    tx.set(ref,next);return next;
  });
}


// R0.3：指定紀錄與其修改歷程必須全部原子刪除；失敗時不刪除任何項目。
// 使用既有管理員存取政策，不需改動 Firestore Rules。
export async function deleteRecord(id,expectedVersion){
  guard();
  if(typeof id!=='string'||!id||id.length>120||id.includes('/'))throw Error('指示識別碼無效，拒絕刪除。');
  if(!Number.isInteger(expectedVersion)||expectedVersion<0)throw Error('刪除版本無效。');
  if(DEMO){
    const records=localRead('records');
    const record=records.find(r=>r.id===id);
    if(!record)throw Error('找不到該筆指示，可能已經被刪除。請重新整理。');
    if((record.version||0)!==expectedVersion)throw Error('此指示已被其他視窗修改，請重新整理後再確認刪除。');
    const histories=localRead('history');
    const remainingHistories=histories.filter(h=>h.recordId!==id && !String(h.id||'').startsWith(id+'__v'));
    // localStorage 僅作示範，寫入異常時還原原始兩個鍵。
    const oldRecords=localStorage.getItem(KEY+'records');
    const oldHistory=localStorage.getItem(KEY+'history');
    try{
      localWrite('history',remainingHistories);
      localWrite('records',records.filter(r=>r.id!==id));
    }catch(e){
      if(oldRecords===null)localStorage.removeItem(KEY+'records');else localStorage.setItem(KEY+'records',oldRecords);
      if(oldHistory===null)localStorage.removeItem(KEY+'history');else localStorage.setItem(KEY+'history',oldHistory);
      throw e;
    }
    return {deletedHistory:histories.length-remainingHistories.length};
  }
  const ref=fb.doc(db,COL.records,id);
  // 現有修改歷程以 recordId 及 id__vXXXXXX 識別：先讀取全部歷史避免漏刪。
  const historySnapshot=await fb.getDocs(fb.collection(db,COL.history));
  const historyRefs=historySnapshot.docs.filter(d=>d.data().recordId===id||d.id.startsWith(id+'__v')).map(d=>d.ref);
  // Firestore 交易最多 500 個寫入（主紀錄 1 + 歷程 <= 499）。超限時拒絕執行，絕不部分刪除。
  if(historyRefs.length>499)throw Error('此筆指示的修改歷程超過499筆；為避免只刪除部分資料，已中止操作，請先採專案專用備份與分批刪除方案。');
  await fb.runTransaction(db,async tx=>{
    const snap=await tx.get(ref);
    if(!snap.exists())throw Error('此筆指示不存在，可能已由其他視窗刪除。請重新整理。');
    const saved=snap.data();
    if((saved.version||0)!==expectedVersion)throw Error('此指示已被其他視窗修改，請重新整理後再確認刪除。');
    // 驗證實際版本數：每次寫入均伴隨一筆修改歷程，避免刪除查詢與後續更新的競態。
    // R0.1/R0.2 某些舊紀錄可能缺歷程，缺歷程不阻擋刪除；以版本衝突保護並發更新。
    for(const historyRef of historyRefs)tx.delete(historyRef);
    tx.delete(ref);
  });
  return {deletedHistory:historyRefs.length};
}
