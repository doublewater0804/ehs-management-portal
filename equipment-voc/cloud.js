import {initializeApp,getApps} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {getFirestore,collection,doc,onSnapshot,runTransaction,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {firebaseConfig,ADMIN_EMAIL} from "../portal/config.js";

const app=getApps().find(a=>a.name==="ehs-portal")||initializeApp(firebaseConfig,"ehs-portal");
const auth=getAuth(app),db=getFirestore(app);
const RECORDS="equipment_voc_records",QUARTERS="equipment_voc_quarters";

export const owner=()=>Boolean(auth.currentUser&&auth.currentUser.email===ADMIN_EMAIL&&auth.currentUser.emailVerified);
export const observeAuth=callback=>onAuthStateChanged(auth,callback);
export const login=()=>signInWithPopup(auth,new GoogleAuthProvider());
export const logout=()=>signOut(auth);
function assertOwner(){if(!owner())throw new Error("請使用已驗證的 EHS 管理員帳號登入後再操作。");}
export function watchRecords(ok,fail){
  assertOwner();
  return onSnapshot(collection(db,RECORDS),snap=>{
    const rows=snap.docs.map(s=>({id:s.id,...s.data()}));
    rows.sort((a,b)=>(b.year||0)-(a.year||0)||(b.quarter||0)-(a.quarter||0)||(b.version||0)-(a.version||0));
    ok(rows);
  },fail);
}
// R0.1.2: source images stay in the browser only; Firestore stores structured
// quarterly statistics and optional filename text, never image bytes or URLs.
export async function saveRevision(data,{fileName=""}={}){
  assertOwner();
  const recordRef=doc(collection(db,RECORDS)),quarterRef=doc(db,QUARTERS,data.quarterKey),user=auth.currentUser;
  return runTransaction(db,async tx=>{
    const qSnap=await tx.get(quarterRef),q=qSnap.exists()?qSnap.data():{};
    const version=Number(q.versionCount||0)+1,officialRecordId=q.officialRecordId||null,isOfficial=!officialRecordId;
    const next={
      id:recordRef.id,year:Number(data.year),quarter:Number(data.quarter),quarterKey:data.quarterKey,
      version,isOfficial,status:isOfficial?"official":"pending",factories:data.factories,notes:String(data.notes||""),
      sourceImagePath:null,sourceImageStored:false,sourceFileName:String(fileName||data.sourceFileName||""),
      createdBy:user.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()
    };
    tx.set(recordRef,next);
    tx.set(quarterRef,{
      year:Number(data.year),quarter:Number(data.quarter),quarterKey:data.quarterKey,
      versionCount:version,latestRecordId:recordRef.id,officialRecordId:isOfficial?recordRef.id:officialRecordId,
      updatedAt:serverTimestamp()
    },{merge:true});
    return {...next,id:recordRef.id};
  });
}
export async function setOfficial(record){
  assertOwner();
  const qRef=doc(db,QUARTERS,record.quarterKey),targetRef=doc(db,RECORDS,record.id);
  await runTransaction(db,async tx=>{
    const qSnap=await tx.get(qRef),targetSnap=await tx.get(targetRef);
    if(!targetSnap.exists())throw new Error("找不到要指定的版本。");
    const oldId=qSnap.exists()?qSnap.data().officialRecordId:null;
    let oldSnap=null,oldRef=null;
    if(oldId&&oldId!==record.id){oldRef=doc(db,RECORDS,oldId);oldSnap=await tx.get(oldRef);}
    tx.update(targetRef,{isOfficial:true,status:"official",updatedAt:serverTimestamp()});
    if(oldSnap?.exists())tx.update(oldRef,{isOfficial:false,status:"superseded",updatedAt:serverTimestamp()});
    tx.set(qRef,{officialRecordId:record.id,updatedAt:serverTimestamp()},{merge:true});
  });
}
export async function deletePendingRevision(record){
  assertOwner();
  if(record.isOfficial)throw new Error("正式版本不可直接刪除；請先指定其他版本為正式版本。");
  const ref=doc(db,RECORDS,record.id);
  await runTransaction(db,async tx=>{
    const snap=await tx.get(ref);if(!snap.exists())return;
    if(snap.data().isOfficial)throw new Error("此版本已成為正式版本，不能刪除。");
    if(snap.data().status!=="pending")throw new Error("僅可刪除待確認版本；歷史版本需保留追溯。");
    tx.delete(ref);
  });
  // Do not access Storage, even for records created with older versions.
}


// R0.1.2: correct the existing official record in place (no new revision).
// The transaction verifies that the target is still the official record for its quarter.
export async function updateOfficialRecord(recordId,data,{fileName=""}={}){
  assertOwner();
  const targetRef=doc(db,RECORDS,recordId),user=auth.currentUser;
  return runTransaction(db,async tx=>{
    const targetSnap=await tx.get(targetRef);
    if(!targetSnap.exists())throw new Error("找不到要修正的正式資料。");
    const current=targetSnap.data();
    if(!current.isOfficial||current.status!=="official")throw new Error("這筆資料已不是正式版本，請重新載入最新正式資料後再修正。");
    if(Number(current.year)!==Number(data.year)||Number(current.quarter)!==Number(data.quarter)||current.quarterKey!==data.quarterKey)throw new Error("修正資料的年度或季度與原正式紀錄不一致，已阻止覆蓋。");
    const quarterRef=doc(db,QUARTERS,current.quarterKey||data.quarterKey);
    const quarterSnap=await tx.get(quarterRef);
    const quarter=quarterSnap.exists()?quarterSnap.data():{};
    if(quarter.officialRecordId&&quarter.officialRecordId!==recordId)throw new Error("此季度的正式版本已變更，為避免覆蓋他人更新，請重新載入資料。");
    const now=new Date();
    const correctionCount=Number(current.correctionCount||0)+1;
    const patch={
      factories:data.factories,
      notes:String(data.notes||""),
      sourceFileName:String(fileName||data.sourceFileName||current.sourceFileName||""),
      // Preserve any legacy image-reference metadata; this release never accesses Storage.
      correctionCount,
      lastCorrectedBy:user.uid,
      lastCorrectedAt:serverTimestamp(),
      updatedAt:serverTimestamp()
    };
    tx.update(targetRef,patch);
    if(!quarterSnap.exists()||!quarter.officialRecordId){
      tx.set(quarterRef,{
        year:Number(current.year),quarter:Number(current.quarter),quarterKey:current.quarterKey,
        officialRecordId:recordId,latestRecordId:recordId,
        versionCount:Math.max(Number(quarter.versionCount||0),Number(current.version||1)),
        updatedAt:serverTimestamp()
      },{merge:true});
    }
    return {...current,...data,...patch,id:recordId,updatedAt:now,lastCorrectedAt:now,correctionCount};
  });
}
