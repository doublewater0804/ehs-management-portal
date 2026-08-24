(() => {
  if (window.__flareRestoreActionsLoaded) return;
  window.__flareRestoreActionsLoaded = true;

  // 首次載入時先阻止舊版 window.onload 內 saveData() 把 localStorage 反向覆蓋 Firestore。
  window.__flareCloudHydrated = false;
  const existingOnload = window.onload;
  if (typeof existingOnload === 'function' && !existingOnload.__flareInitialWriteGuard) {
    const guardedOnload = function(event) {
      const originalPush = window.__flareCloudPush;
      const originalUpload = window.__flareCloudUploadLocal;
      window.__flareCloudPush = undefined;
      window.__flareCloudUploadLocal = undefined;
      try {
        return existingOnload.call(this, event);
      } finally {
        window.__flareCloudPush = originalPush;
        window.__flareCloudUploadLocal = originalUpload;
      }
    };
    guardedOnload.__flareInitialWriteGuard = true;
    window.onload = guardedOnload;
  }

  if (!document.querySelector('script[data-flare-sync-guard]')) {
    const guard = document.createElement('script');
    guard.type = 'module';
    guard.src = './sync-guard.js?v=20260824-1020';
    guard.dataset.flareSyncGuard = '1';
    document.head.appendChild(guard);
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
    if (typeof window.__flareSafeRestore !== 'function') {
      alert('資料保護模組仍在初始化，請稍候數秒後再試。');
      return;
    }

    button.disabled = true;
    button.textContent = '恢復中…';
    try {
      await window.__flareSafeRestore(factory, dateISO);
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = '恢復';
      }
    }
  }, true);
})();
