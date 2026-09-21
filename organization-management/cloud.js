(function(){
  const api={
    available:false,
    initError:'',
    ADMIN_EMAIL:'doublewater0804@gmail.com'
  };
  window.EHSCloud=api;

  try{
    if(!window.firebase || !firebase.initializeApp || !firebase.auth || !firebase.firestore){
      api.initError='Firebase SDK 未載入；目前使用本機預覽。';
      return;
    }

    const firebaseConfig={
      apiKey:'AIzaSyBGgf0A5MFOqPxQvlX8tACski48bMYI_DU',
      authDomain:'esh-v85.firebaseapp.com',
      projectId:'esh-v85',
      storageBucket:'esh-v85.firebasestorage.app',
      messagingSenderId:'1021350670476',
      appId:'1:1021350670476:web:afd5bc96ff28c910f48ba9',
      measurementId:'G-MMVQN63GDG'
    };

    let app;
    try{
      app=firebase.app('ehs-org-management');
    }catch(_){
      app=firebase.initializeApp(firebaseConfig,'ehs-org-management');
    }
    const auth=app.auth();
    const db=app.firestore();
    const provider=new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({prompt:'select_account'});
    const root='ehs_org';

    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(()=>{});
    auth.getRedirectResult().catch(()=>{});

    api.available=true;
    api.observeAuth=cb=>auth.onAuthStateChanged(cb);
    api.login=async()=>{
      try{
        return await auth.signInWithPopup(provider);
      }catch(e){
        if(['auth/popup-blocked','auth/cancelled-popup-request','auth/operation-not-supported-in-this-environment'].includes(e && e.code)){
          await auth.signInWithRedirect(provider);
          return null;
        }
        throw e;
      }
    };
    api.logout=()=>auth.signOut();
    api.isAdminUser=(user=auth.currentUser)=>!!(user && user.emailVerified && user.email===api.ADMIN_EMAIL);
    api.verifyAdmin=async()=>{if(!api.isAdminUser()) throw new Error('請使用已驗證的 EHS 管理者 Google 帳號登入。');};
    api.currentUser=()=>auth.currentUser;

    async function readCollection(name){
      const s=await db.collection(root).doc(name).collection('items').get();
      return s.docs.map(d=>({id:d.id,...d.data()}));
    }
    api.loadAll=async()=>{
      const metaSnap=await db.collection(root).doc('meta').get();
      const [staff,nodes,versions,changes]=await Promise.all([
        readCollection('staff'),readCollection('nodes'),readCollection('versions'),readCollection('changes')
      ]);
      return {meta:metaSnap.exists?metaSnap.data():null,staff,nodes,versions,changes};
    };
    api.initializeData=async({meta,staff,nodes,versions})=>{
      await api.verifyAdmin();
      const metaRef=db.collection(root).doc('meta');
      const existing=await metaRef.get();
      if(existing.exists) throw new Error('雲端資料已存在，不可重複初始化。');
      const b=db.batch();
      b.set(metaRef,{...meta,createdAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
      staff.forEach(x=>b.set(db.collection(root).doc('staff').collection('items').doc(x.id),x));
      nodes.forEach(x=>b.set(db.collection(root).doc('nodes').collection('items').doc(x.id),x));
      versions.forEach(x=>b.set(db.collection(root).doc('versions').collection('items').doc(x.id),x));
      await b.commit();
    };
    api.saveStaff=async(item,change)=>{
      await api.verifyAdmin(); const b=db.batch();
      b.set(db.collection(root).doc('staff').collection('items').doc(item.id),{...item,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
      if(change)b.set(db.collection(root).doc('changes').collection('items').doc(change.id),{...change,createdAt:firebase.firestore.FieldValue.serverTimestamp()});
      b.set(db.collection(root).doc('meta'),{hasDraft:true,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
      await b.commit();
    };
    api.bulkImport=async({upserts,changes})=>{
      await api.verifyAdmin(); const b=db.batch();
      upserts.forEach(x=>b.set(db.collection(root).doc('staff').collection('items').doc(x.id),{...x,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}));
      changes.forEach(c=>b.set(db.collection(root).doc('changes').collection('items').doc(c.id),{...c,createdAt:firebase.firestore.FieldValue.serverTimestamp()}));
      b.set(db.collection(root).doc('meta'),{hasDraft:true,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
      await b.commit();
    };
    api.saveStaffing=async(nodes)=>{
      await api.verifyAdmin(); const b=db.batch();
      nodes.forEach(n=>b.set(db.collection(root).doc('nodes').collection('items').doc(n.id),n,{merge:true}));
      b.set(db.collection(root).doc('meta'),{hasDraft:true,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
      await b.commit();
    };
    api.publishVersion=async(version,pendingChanges,staffSnapshot)=>{
      await api.verifyAdmin(); const b=db.batch();
      const v={...version,changeCount:pendingChanges.length,changes:pendingChanges,snapshot:staffSnapshot,createdAt:firebase.firestore.FieldValue.serverTimestamp()};
      b.set(db.collection(root).doc('versions').collection('items').doc(version.version),v);
      pendingChanges.forEach(c=>b.set(db.collection(root).doc('changes').collection('items').doc(c.id),{...c,publishedVersion:version.version,publishedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true}));
      b.set(db.collection(root).doc('meta'),{version:version.version,revisionDate:version.revisionDate,hasDraft:false,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
      await b.commit();
    };
  }catch(e){
    console.error('Firebase 初始化失敗',e);
    api.available=false;
    api.initError=e && e.message ? e.message : 'Firebase 初始化失敗。';
  }
})();
