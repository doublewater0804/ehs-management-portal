import { getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, updateDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

(() => {
  if (window.__flareCloudSyncFixLoaded) return;
  window.__flareCloudSyncFixLoaded = true;

  const install = () => {
    try {
      const app = getApp();
      const db = getFirestore(app);
      const flareDoc = doc(db, 'flare_control', 'global_state');

      // 重要：state 是完整狀態快照，必須直接取代 top-level state map。
      // 舊版 setDoc(..., { merge: true }) 會把巢狀 map 做欄位合併，導致已刪除的 excludedDays key 留在 Firestore，
      // onSnapshot 隨後又把舊 key 套回畫面，看起來就像「恢復成功但資料沒有消失」。
      window.__flareCloudPush = async (state) => {
        await updateDoc(flareDoc, {
          state,
          updatedAt: serverTimestamp()
        });
      };

      // 本機資料上傳雲端屬於完整覆蓋；若文件不存在，setDoc 可直接建立。
      window.__flareCloudUploadLocal = async (state) => {
        await setDoc(flareDoc, {
          state,
          updatedAt: serverTimestamp(),
          migratedAt: serverTimestamp()
        });
      };

      window.__flareCloudSyncFixReady = true;
      return true;
    } catch (error) {
      console.error('FLARE 雲端同步修正初始化失敗', error);
      return false;
    }
  };

  // Firebase/FLARE 主程式可能仍在初始化；短暫輪詢，待主程式建立原函式後再覆寫。
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    const coreReady = typeof window.__flareCloudPush === 'function' || typeof window.__getFlareCloudState === 'function';
    if (coreReady && install()) {
      clearInterval(timer);
      return;
    }
    if (attempts >= 200) {
      clearInterval(timer);
      console.error('FLARE 雲端同步修正逾時，未能完成安裝');
    }
  }, 50);
})();
