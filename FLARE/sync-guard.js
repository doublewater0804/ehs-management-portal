import { getApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

(() => {
  if (window.__flareSyncGuardLoaded) return;
  window.__flareSyncGuardLoaded = true;

  const HISTORY_KEY = 'flare_exclusion_history_v1';
  const GUARD_VERSION = '20260824-1005';
  let hydrated = false;
  let db = null;
  let flareDoc = null;
  let wrappedApply = null;
  let wrappedOnload = false;

  const readHistory = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const writeHistory = (history) => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history || []));
  };

  const appendHistory = (records = []) => {
    if (!records.length) return readHistory();
    const history = readHistory();
    const seen = new Set(history.map(item => item?.historyId).filter(Boolean));
    records.forEach((record, index) => {
      const historyId = record.historyId || [record.key || '', record.factory || '', record.date || '', record.reason || '', record.action || '', record.archivedAt || '', index].join('|');
      if (seen.has(historyId)) return;
      seen.add(historyId);
      history.push({ ...record, historyId });
    });
    writeHistory(history.slice(-500));
    return history.slice(-500);
  };

  const archiveActiveExclusions = (state, action = 'snapshot') => {
    const exclusions = state?.excludedDays && typeof state.excludedDays === 'object' ? state.excludedDays : {};
    const archivedAt = new Date().toISOString();
    const rows = Object.entries(exclusions).map(([key, item]) => ({
      historyId: `${key}|${item?.reason || ''}|${item?.createdAt || ''}`,
      key,
      factory: item?.factory || '',
      date: item?.date || '',
      reason: item?.reason || '',
      createdAt: item?.createdAt || null,
      action,
      archivedAt
    }));
    return appendHistory(rows);
  };

  const withHistory = (state) => {
    const history = archiveActiveExclusions(state, 'cloud-write-snapshot');
    return { ...state, exclusionHistory: history, syncGuardVersion: GUARD_VERSION };
  };

  const initFirestore = () => {
    if (db && flareDoc) return true;
    try {
      const app = getApp();
      db = getFirestore(app);
      flareDoc = doc(db, 'flare_control', 'global_state');
      return true;
    } catch {
      return false;
    }
  };

  const setHydrated = (value = true) => {
    hydrated = Boolean(value);
    window.__flareCloudHydrated = hydrated;
  };

  const wrapApplyCloudState = () => {
    const current = window.__applyFlareCloudState;
    if (typeof current !== 'function' || current === wrappedApply || current.__flareSyncGuardWrapped) return;

    const guardedApply = function(state = {}) {
      if (Array.isArray(state?.exclusionHistory)) writeHistory(state.exclusionHistory);
      archiveActiveExclusions(state, 'cloud-read-snapshot');
      const result = current(state);
      setHydrated(true);
      return result;
    };
    guardedApply.__flareSyncGuardWrapped = true;
    wrappedApply = guardedApply;
    window.__applyFlareCloudState = guardedApply;
  };

  const installSafeCloudWriters = () => {
    if (!initFirestore()) return;

    const safePush = async (state) => {
      if (!hydrated) {
        const error = new Error('Firestore 初始資料尚未載入完成，已阻止本機資料覆蓋雲端。');
        error.code = 'flare/not-hydrated';
        throw error;
      }
      await setDoc(flareDoc, { state: withHistory(state), updatedAt: serverTimestamp() });
    };
    safePush.__flareSyncGuardWriter = true;

    const safeUploadLocal = async (state) => {
      if (!hydrated) {
        const error = new Error('Firestore 初始資料尚未載入完成，暫時禁止本機覆蓋雲端。');
        error.code = 'flare/not-hydrated';
        throw error;
      }
      await setDoc(flareDoc, {
        state: withHistory(state),
        updatedAt: serverTimestamp(),
        migratedAt: serverTimestamp()
      });
    };
    safeUploadLocal.__flareSyncGuardWriter = true;

    if (typeof window.__flareCloudPush === 'function' && !window.__flareCloudPush.__flareSyncGuardWriter) {
      window.__flareCloudPush = safePush;
    }
    if (typeof window.__flareCloudUploadLocal === 'function' && !window.__flareCloudUploadLocal.__flareSyncGuardWriter) {
      window.__flareCloudUploadLocal = safeUploadLocal;
    }
  };

  const wrapInitialOnload = () => {
    if (wrappedOnload || typeof window.onload !== 'function' || window.onload.__flareSyncGuardWrapped) return;
    const original = window.onload;
    const guardedOnload = function(event) {
      const originalPush = window.__flareCloudPush;
      const originalUpload = window.__flareCloudUploadLocal;
      // 阻止原始 window.onload 內的 saveData() 在第一份 Firestore snapshot 前排程寫入。
      window.__flareCloudPush = undefined;
      window.__flareCloudUploadLocal = undefined;
      try {
        return original.call(this, event);
      } finally {
        window.__flareCloudPush = originalPush;
        window.__flareCloudUploadLocal = originalUpload;
        setTimeout(installSafeCloudWriters, 0);
      }
    };
    guardedOnload.__flareSyncGuardWrapped = true;
    window.onload = guardedOnload;
    wrappedOnload = true;
  };

  const findMatchingKeys = (exclusions, factory, dateISO) => {
    const cleanFactory = String(factory || '').replace(/[\s　]+/g, '').trim();
    const cleanDate = String(dateISO || '').trim();
    const standard = `${cleanDate.slice(0, 4)}|${factory}|${dateISO}`;
    return Object.keys(exclusions || {}).filter((key) => {
      if (key === standard) return true;
      const item = exclusions[key] || {};
      if (String(item.factory || '').replace(/[\s　]+/g, '').trim() === cleanFactory && String(item.date || '').trim() === cleanDate) return true;
      const parts = String(key).split('|');
      return parts.length >= 3 && String(parts.slice(1, -1).join('|')).replace(/[\s　]+/g, '').trim() === cleanFactory && String(parts.at(-1)).trim() === cleanDate;
    });
  };

  window.__flareSafeRestore = async (factory, dateISO) => {
    if (!hydrated || !initFirestore()) {
      alert('雲端資料尚未完成初始同步，為避免資料遺失，請等右上方顯示「已同步雲端」後再操作。');
      return;
    }
    if (typeof window.__getFlareCloudState !== 'function') {
      alert('燃燒塔資料尚未載入完成，請重新整理後再試。');
      return;
    }

    const state = window.__getFlareCloudState();
    const exclusions = state?.excludedDays && typeof state.excludedDays === 'object' ? state.excludedDays : {};
    const keys = findMatchingKeys(exclusions, factory, dateISO);
    if (!keys.length) {
      alert(`找不到 ${factory} / ${dateISO} 的剔除紀錄。`);
      return;
    }
    if (!confirm(`確定要恢復 ${factory} / ${dateISO}，重新納入統計嗎？\n\n原剔除紀錄會保留在歷程中，不會真正刪除。`)) return;

    const backup = keys.map(key => [key, exclusions[key]]);
    const historyBefore = readHistory();
    const restoredAt = new Date().toISOString();
    appendHistory(keys.map(key => ({
      historyId: `${key}|restore|${restoredAt}`,
      key,
      factory: exclusions[key]?.factory || factory,
      date: exclusions[key]?.date || dateISO,
      reason: exclusions[key]?.reason || '',
      createdAt: exclusions[key]?.createdAt || null,
      action: 'restored',
      restoredAt,
      archivedAt: restoredAt
    })));

    try {
      keys.forEach(key => delete exclusions[key]);
      localStorage.setItem('flare_excluded_days_final', JSON.stringify(exclusions));
      if (typeof window.renderAll === 'function') window.renderAll();
      if (typeof window.setFirebaseSyncStatus === 'function') window.setFirebaseSyncStatus('☁️ 雲端恢復中…', 'info');

      await setDoc(flareDoc, { state: withHistory(state), updatedAt: serverTimestamp() });

      if (typeof window.setFirebaseSyncStatus === 'function') window.setFirebaseSyncStatus('☁️ 已儲存雲端', 'ok');
      alert('恢復完成。原剔除紀錄已保留在歷程中。');
    } catch (error) {
      backup.forEach(([key, value]) => { exclusions[key] = value; });
      writeHistory(historyBefore);
      localStorage.setItem('flare_excluded_days_final', JSON.stringify(exclusions));
      if (typeof window.renderAll === 'function') window.renderAll();
      if (typeof window.setFirebaseSyncStatus === 'function') window.setFirebaseSyncStatus('☁️ 雲端恢復失敗', 'err');
      alert(`恢復失敗：${error?.message || error}`);
    }
  };

  // 保留已知的兩筆遺失剔除資訊為待對應歷程，不冒填未知日期/工廠。
  appendHistory([
    {
      historyId: 'recovery-20260824-1',
      action: 'recovery-pending',
      factory: '',
      date: '',
      reason: '製程廢氣未排放至廢氣燃燒…（依原畫面可見文字，待確認日期/工廠）',
      archivedAt: '2026-08-24T09:49:00+08:00'
    },
    {
      historyId: 'recovery-20260824-2',
      action: 'recovery-pending',
      factory: '',
      date: '',
      reason: '流量錯誤',
      archivedAt: '2026-08-24T09:49:00+08:00'
    }
  ]);

  const timer = setInterval(() => {
    wrapApplyCloudState();
    wrapInitialOnload();

    const statusText = document.getElementById('firebase-sync-status')?.textContent || '';
    if (statusText.includes('已同步雲端')) setHydrated(true);

    installSafeCloudWriters();
  }, 50);

  window.addEventListener('load', () => {
    setTimeout(() => {
      wrapApplyCloudState();
      installSafeCloudWriters();
    }, 0);
  });

  setTimeout(() => clearInterval(timer), 30000);
})();
