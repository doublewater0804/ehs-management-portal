(() => {
  if (window.__flareRestoreActionsLoaded) return;
  window.__flareRestoreActionsLoaded = true;

  // 載入 Firestore transaction 版同步修正。
  if (!document.querySelector('script[data-flare-cloud-sync-fix]')) {
    const syncFix = document.createElement('script');
    syncFix.type = 'module';
    syncFix.src = './cloud-sync-fix.js?v=20260824-0940';
    syncFix.dataset.flareCloudSyncFix = '1';
    document.head.appendChild(syncFix);
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

    if (!window.__flareCloudSyncFixReady || typeof window.__flareRestoreExclusionFromCloud !== 'function') {
      alert('Firebase 恢復模組仍在初始化，請稍候數秒後再試；若持續出現，請重新整理頁面。');
      return;
    }

    if (!confirm(`確定要恢復 ${factory} / ${dateISO}，重新納入統計嗎？`)) return;

    button.disabled = true;
    button.textContent = '恢復中…';

    try {
      if (typeof window.setFirebaseSyncStatus === 'function') {
        window.setFirebaseSyncStatus('☁️ 雲端恢復中…', 'info');
      }

      const result = await window.__flareRestoreExclusionFromCloud(factory, dateISO);

      if (typeof window.setFirebaseSyncStatus === 'function') {
        window.setFirebaseSyncStatus('☁️ 已儲存雲端', 'ok');
      }

      alert(`恢復完成：已移除 ${result?.removedCount || 1} 筆剔除紀錄，並重新納入統計。`);
    } catch (error) {
      console.error('FLARE 恢復剔除資料失敗', error);
      if (typeof window.setFirebaseSyncStatus === 'function') {
        window.setFirebaseSyncStatus('☁️ 雲端恢復失敗', 'err');
      }

      if (error?.code === 'flare/exclusion-not-found') {
        alert(`恢復失敗：Firestore 找不到 ${factory} / ${dateISO} 的剔除資料。請保留畫面並回報。`);
      } else {
        alert(`恢復失敗：${error?.message || error}`);
      }
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = '恢復';
      }
    }
  }, true);
})();
