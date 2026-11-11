import {initializeApp,getApps} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {getAuth,GoogleAuthProvider,signInWithPopup,signOut,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {getFirestore,collection,doc,onSnapshot,getDoc,getDocs,runTransaction,serverTimestamp} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {getStorage,ref as storageRef,uploadBytes,getBytes,getMetadata,deleteObject} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";
import {firebaseConfig,ADMIN_EMAIL} from "../portal/config.js";

const app=getApps().find(a=>a.name==="ehs-portal")||initializeApp(firebaseConfig,"ehs-portal");
const auth=getAuth(app),db=getFirestore(app),storage=getStorage(app);
const RECORDS="equipment_voc_records",QUARTERS="equipment_voc_quarters";

export const owner=()=>Boolean(auth.currentUser&&auth.currentUser.email===ADMIN_EMAIL&&auth.currentUser.emailVerified);
export const observeAuth=callback=>onAuthStateChanged(auth,callback);
export const login=()=>signInWithPopup(auth,new GoogleAuthProvider());
export const logout=()=>signOut(auth);
function assertOwner(){if(!owner())throw new Error("請使用已驗證的 EHS 管理員帳號登入後再操作。");}
function safeFileName(name){return String(name||"voc-source.png").normalize("NFKC").replace(/[^\w.\-\u4e00-\u9fff]+/g,"_").slice(0,100)||"voc-source.png";}

export async function storeImage(file,quarterKey){
  assertOwner();
  if(!(file instanceof Blob))throw new Error("原始圖片資料格式不正確。");
  const user=auth.currentUser,id=crypto.randomUUID(),name=safeFileName(file.name||"voc-source.png");
  const path=`equipment-voc/${user.uid}/${quarterKey}/${id}_${name}`;
  await uploadBytes(storageRef(storage,path),file,{
    contentType:file.type||"image/png",
    customMetadata:{uploadedBy:user.uid,quarterKey,originalName:name,system:"equipment-voc-r01"}
  });
  return path;
}
export async function loadImage(path){
  assertOwner();
  if(!path)throw new Error("此版本沒有保存原始圖片路徑。");
  const fileRef=storageRef(storage,path);
  const [meta,bytes]=await Promise.all([getMetadata(fileRef),getBytes(fileRef,12*1024*1024)]);
  const blob=new Blob([bytes],{type:meta.contentType||"image/png"});
  const name=meta.customMetadata?.originalName||path.split("/").pop().replace(/^[^_]+_/,"")||"原始統計圖片";
  return {url:URL.createObjectURL(blob),fileName:name};
}
export function watchRecords(ok,fail){
  assertOwner();
  return onSnapshot(collection(db,RECORDS),snap=>{
    const rows=snap.docs.map(s=>({id:s.id,...s.data()}));
    rows.sort((a,b)=>(b.year||0)-(a.year||0)||(b.quarter||0)-(a.quarter||0)||(b.version||0)-(a.version||0));
    ok(rows);
  },fail);
}
export async function saveRevision(data,{imageFile=null,existingImagePath=null,fileName=""}={}){
  assertOwner();
  let imagePath=existingImagePath,newlyStored=false;
  if(!imagePath){
    if(!imageFile)throw new Error("正式儲存前必須保留本季原始統計圖片。");
    imagePath=await storeImage(imageFile,data.quarterKey);newlyStored=true;
  }
  const recordRef=doc(collection(db,RECORDS)),quarterRef=doc(db,QUARTERS,data.quarterKey),user=auth.currentUser;
  try{
    return await runTransaction(db,async tx=>{
      const qSnap=await tx.get(quarterRef),q=qSnap.exists()?qSnap.data():{};
      const version=Number(q.versionCount||0)+1,officialRecordId=q.officialRecordId||null,isOfficial=!officialRecordId;
      const next={
        id:recordRef.id,year:Number(data.year),quarter:Number(data.quarter),quarterKey:data.quarterKey,
        version,isOfficial,status:isOfficial?"official":"pending",factories:data.factories,notes:String(data.notes||""),
        sourceImagePath:imagePath,sourceFileName:fileName||data.sourceFileName||"原始統計圖片",
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
  }catch(error){
    if(newlyStored)await deleteObject(storageRef(storage,imagePath)).catch(()=>{});
    throw error;
  }
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
  if(record.sourceImagePath){
    const all=await getDocs(collection(db,RECORDS));
    const stillUsed=all.docs.some(s=>s.data().sourceImagePath===record.sourceImagePath);
    if(!stillUsed)await deleteObject(storageRef(storage,record.sourceImagePath)).catch(()=>{});
  }
}
