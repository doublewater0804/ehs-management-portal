(() => {
  if (window.__flareRestoreActionsLoaded) return;
  window.__flareRestoreActionsLoaded = true;

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('#excluded-days-body button, #excluded-days-modal-body button');
    if (!button || button.textContent.trim() !== '恢復') return;

    // 使用 capture 階段接管恢復按鈕，避免動態產生的 inline onclick 在部分環境失效。
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

    if (typeof window.__flareCloudPush !== 'function') {
      alert('Firebase 尚未完成連線，為避免本機與雲端資料不一致，暫時無法恢復。請確認右上方雲端狀態後再試。');
      return;
    }

    const state = window.__getFlareCloudState();
    const exclusions = state?.excludedDays && typeof state.excludedDays === 'object'
      ? state.excludedDays
      : {};

    // 直接從已儲存的剔除資料找出真正的 key，不再由畫面文字重新組 key。
    let targetKey = Object.keys(exclusions).find((key) => {
      const item = exclusions[key] || {};
      return String(item.factory || '').trim() === factory && String(item.date || '').trim() === dateISO;
    });

    // 相容較舊資料：若剔除物件內沒有 factory/date，才使用標準 key 做第二次查找。
    if (!targetKey) {
      const standardKey = `${dateISO.slice(0, 4)}|${factory}|${dateISO}`;
      if (Object.prototype.hasOwnProperty.call(exclusions, standardKey)) targetKey = standardKey;
    }

    if (!targetKey) {
      alert(`找不到 ${factory} / ${dateISO} 對應的原始剔除資料，因此沒有執行恢復。請保留此畫面並回報。`);
      return;
    }

    if (!confirm(`確定要恢復 ${factory} / ${dateISO}，重新納入統計嗎？`)) return;

    const originalRecord = exclusions[targetKey];
    button.disabled = true;
    button.textContent = '恢復中…';

    try {
      delete exclusions[targetKey];

      // 先同步目前頁面的 in-memory state 與 localStorage，再寫入 Firestore。
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
    } catch (error) {
      console.error('FLARE 恢復剔除資料失敗', error);

      // 雲端失敗時回復原資料，避免只改到本機。
      exclusions[targetKey] = originalRecord;
      localStorage.setItem('flare_excluded_days_final', JSON.stringify(exclusions));
      if (typeof window.renderAll === 'function') window.renderAll();
      if (typeof window.setFirebaseSyncStatus === 'function') {
        window.setFirebaseSyncStatus('☁️ 雲端儲存失敗', 'err');
      }
      alert('恢復失敗：雲端資料沒有成功儲存，已將本機狀態還原。請稍後再試。');
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = '恢復';
      }
    }
  }, true);
})();
