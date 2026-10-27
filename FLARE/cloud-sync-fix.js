import { getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, updateDoc, setDoc, runTransaction, getDocFromServer, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

(() => {
  if (window.__flareCloudSyncFixLoaded) return;
  window.__flareCloudSyncFixLoaded = true;

  const normalizeText = (value) => String(value ?? '').replace(/[\s　]+/g, '').trim();

  // Firestore may return object map fields in a different order from the browser.
  // Canonicalize keys recursively before comparing snapshots, while preserving array order.
  const stableSerialize = (value) => JSON.stringify(value, (key, item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    return Object.keys(item).sort().reduce((out, field) => {
      out[field] = item[field];
      return out;
    }, {});
  });


  const findMatchingExclusionKeys = (exclusions, factory, dateISO) => {
    const normalizedFactory = normalizeText(factory);
    const normalizedDate = normalizeText(dateISO);
    const standardKey = `${normalizedDate.slice(0, 4)}|${factory}|${dateISO}`;

    return Object.keys(exclusions || {}).filter((key) => {
      if (key === standardKey) return true;

      const item = exclusions[key] || {};
      const itemFactory = normalizeText(item.factory || '');
      const itemDate = normalizeText(item.date || '');
      if (itemFactory === normalizedFactory && itemDate === normalizedDate) return true;

      const parts = String(key).split('|');
      if (parts.length >= 3) {
        const keyFactory = normalizeText(parts.slice(1, -1).join('|'));
        const keyDate = normalizeText(parts[parts.length - 1]);
        if (keyFactory === normalizedFactory && keyDate === normalizedDate) return true;
      }
      return false;
    });
  };

  const install = () => {
    try {
      const app = getApp();
      const db = getFirestore(app);
      const flareDoc = doc(db, 'flare_control', 'global_state');

      // 一般儲存：直接取代 top-level state，避免巢狀 excludedDays 被 merge 保留舊 key。
      window.__flareCloudPush = async (state) => {
        await updateDoc(flareDoc, {
          state,
          updatedAt: serverTimestamp()
        });
      };

      // 原始排放資料的原子修改：只改目標日期，並拒絕已由其他端更新的舊版本。
      window.__flareCloudEditEvents = async ({ factory, dateISO, originalEvents, amounts, deletedIndexes }) => {
        const deleted = new Set(deletedIndexes);
        const serverState = await runTransaction(db, async (transaction) => {
          const snap = await transaction.get(flareDoc);
          if (!snap.exists()) throw new Error('雲端找不到燃燒塔資料');
          const state = snap.data()?.state || {};
          if (!Array.isArray(state.events)) throw new Error('雲端排放紀錄格式異常');
          const isTarget = event => String(event?.factory || '').trim() === String(factory || '').trim()
            && String(event?.date || '').trim() === String(dateISO || '').trim();
          const selected = state.events.filter(isTarget);
          if (stableSerialize(selected) !== stableSerialize(originalEvents)) {
            throw new Error('雲端資料已變更，請重新開啟修改視窗後再操作');
          }
          let targetIndex = 0;
          const modifiedAt = new Date().toISOString();
          state.events = state.events.flatMap(event => {
            if (!isTarget(event)) return [event];
            const index = targetIndex++;
            if (deleted.has(index) || Number(amounts[index]) === 0) return [];
            const nextAmount = Number(amounts[index]);
            if (nextAmount === Number(event.amount || 0)) return [event];
            const previous = Number(event.amount || 0);
            const history = Array.isArray(event.amountEditHistory) ? [...event.amountEditHistory] : [];
            history.push({ from: previous, to: nextAmount, at: modifiedAt });
            return [{ ...event, amount: nextAmount, amountModifiedAt: modifiedAt,
              amountModifiedFrom: previous, amountEditHistory: history.slice(-20) }];
          });
          state.updatedAtLocal = modifiedAt;
          transaction.update(flareDoc, { state, updatedAt: serverTimestamp() });
          return state;
        });
        // 實際雲端交易提交後才重繪。避免失敗時本機顯示已刪除。
        if (typeof window.__applyFlareCloudState === 'function') {
          window.__applyFlareCloudState(serverState);
        }
        return serverState;
      };

      window.__flareCloudUploadLocal = async (state) => {
        await setDoc(flareDoc, {
          state,
          updatedAt: serverTimestamp(),
          migratedAt: serverTimestamp()
        });
      };

      // 恢復剔除日數：以 Firestore 伺服器端目前狀態為準，在 transaction 內刪除後再讀回驗證。
      // 不再依賴頁面當下的 in-memory excludedDays，避免 onSnapshot 時序造成「已寫入但又被舊快照蓋回」。
      window.__flareRestoreExclusionFromCloud = async (factory, dateISO) => {
        const transactionResult = await runTransaction(db, async (transaction) => {
          const snap = await transaction.get(flareDoc);
          if (!snap.exists()) throw new Error('Firestore 找不到燃燒塔雲端資料文件');

          const data = snap.data() || {};
          const state = JSON.parse(JSON.stringify(data.state || {}));
          const exclusions = state.excludedDays && typeof state.excludedDays === 'object'
            ? state.excludedDays
            : {};

          const targetKeys = findMatchingExclusionKeys(exclusions, factory, dateISO);
          if (!targetKeys.length) {
            const error = new Error(`Firestore 找不到 ${factory} / ${dateISO} 的剔除資料`);
            error.code = 'flare/exclusion-not-found';
            throw error;
          }

          targetKeys.forEach((key) => delete exclusions[key]);
          state.excludedDays = exclusions;

          transaction.update(flareDoc, {
            state,
            updatedAt: serverTimestamp()
          });

          return { removedKeys: targetKeys, state };
        });

        // transaction 完成後，強制向 server 讀回，不使用 cache。
        const verifySnap = await getDocFromServer(flareDoc);
        if (!verifySnap.exists()) throw new Error('恢復後無法讀回 Firestore 資料');

        const serverData = verifySnap.data() || {};
        const serverState = serverData.state || {};
        const remaining = findMatchingExclusionKeys(serverState.excludedDays || {}, factory, dateISO);
        if (remaining.length) {
          throw new Error(`Firestore 驗證失敗：仍殘留 ${remaining.length} 筆剔除資料`);
        }

        // 以已驗證的 server state 回灌目前頁面，讓畫面與 localStorage 同步更新。
        if (typeof window.__applyFlareCloudState === 'function') {
          window.__applyFlareCloudState(serverState);
        }

        return { removedCount: transactionResult.removedKeys.length, state: serverState };
      };

      window.__flareCloudSyncFixReady = true;
      return true;
    } catch (error) {
      console.error('FLARE 雲端同步修正初始化失敗', error);
      return false;
    }
  };

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
