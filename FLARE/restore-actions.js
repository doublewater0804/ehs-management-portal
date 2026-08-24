(() => {
  if (window.__flareRestoreActionsLoaded) return;
  window.__flareRestoreActionsLoaded = true;

  // 先載入 Firestore 全狀態覆蓋修正。舊版 merge:true 無法真正刪除巢狀 excludedDays key。
  if (!document.querySelector('script[data-flare-cloud-sync-fix]')) {
    const syncFix = document.createElement('script');
    syncFix.type = 'module';
    syncFix.src = './cloud-sync-fix.js?v=1';
    syncFix.dataset.flareCloudSyncFix = '1';
    document.head.appendChild(syncFix);
  }

  function normalizeText(value) {
    return String(value ?? '').replace(/[\s　]+/g, '').trim();
  }

  function findMatchingExclusionKeys(exclusions, factory, dateISO) {
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
  }

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('#excluded-days-body button, #excluded-days-modal-body button');
    if (!button || button.textContent.trim() !== '恢復') return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const row = button.closest('tr');
    const cells = row ? row.querySelectorAll('td') : [];
    const dateISO = cells[0]?.textContent?.trim() || '';
    const factory = cells[1]?.textContent?.trim() || '';

    if (!factory || !dateISO) {
      alert('無法讀取要恢復的資料，請重新整理頁面後再試。');
      return;
    }

    if (typeof window.__getFlareCloudState !== 'function') {
      alert('燃燒塔資料尚未載入完成，請重新整理頁面後再試。');
      return;
    }

    if (!window.__flareCloudSyncFixReady || typeof window.__flareCloudPush !== 'function') {
      alert('Firebase 雲端同步模組仍在初始化，請稍候數秒後再試；若持續出現，請重新整理頁面。');
      return;
    }

    const state = window.__getFlareCloudState();
    const exclusions = state?.excludedDays && typeof state.excludedDays === 'object'
      ? state.excludedDays
      : {};

    const targetKeys = findMatchingExclusionKeys(exclusions, factory, dateISO);
    if (!targetKeys.length) {
      alert(`找不到 ${factory} / ${dateISO} 對應的原始剔除資料，因此沒有執行恢復。請保留此畫面並回報。`);
      return;
    }

    if (!confirm(`確定要恢復 ${factory} / ${dateISO}，重新納入統計嗎？`)) return;

    const backup = targetKeys.map((key) => [key, exclusions[key]]);
    button.disabled = true;
    button.textContent = '恢復中…';

    try {
      targetKeys.forEach((key) => delete exclusions[key]);

      const remaining = findMatchingExclusionKeys(exclusions, factory, dateISO);
      if (remaining.length) {
        throw new Error(`剔除資料仍殘留 ${remaining.length} 筆`);
      }

      localStorage.setItem('flare_excluded_days_final', JSON.stringify(exclusions));
      if (typeof window.renderAll === 'function') window.renderAll();
      if (typeof window.setFirebaseSyncStatus === 'function') {
        window.setFirebaseSyncStatus('☁️ 雲端儲存中…', 'info');
      }

      await window.__flareCloudPush(state);

      if (typeof window.setFirebaseSyncStatus === 'function') {
        window.setFirebaseSyncStatus('☁️ 已儲存雲端', 'ok');
      }

      if (typeof window.renderAll === 'function') window.renderAll();

      const verifyState = window.__getFlareCloudState();
      const verifyKeys = findMatchingExclusionKeys(verifyState?.excludedDays || {}, factory, dateISO);
      if (verifyKeys.length) {
        throw new Error(`恢復後仍偵測到 ${verifyKeys.length} 筆剔除資料`);
      }
    } catch (error) {
      console.error('FLARE 恢復剔除資料失敗', error);

      backup.forEach(([key, value]) => {
        exclusions[key] = value;
      });
      localStorage.setItem('flare_excluded_days_final', JSON.stringify(exclusions));
      if (typeof window.renderAll === 'function') window.renderAll();
      if (typeof window.setFirebaseSyncStatus === 'function') {
        window.setFirebaseSyncStatus('☁️ 雲端儲存失敗', 'err');
      }
      alert(`恢復失敗：${error?.message || error}。已將本機狀態還原。`);
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = '恢復';
      }
    }
  }, true);
})();
