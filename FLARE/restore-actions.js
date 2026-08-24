(() => {
  if (window.__flareRestoreActionsLoaded) return;
  window.__flareRestoreActionsLoaded = true;

  document.addEventListener('click', (event) => {
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

    if (typeof window.restoreDay !== 'function') {
      alert('恢復功能尚未載入完成，請重新整理頁面後再試。');
      return;
    }

    window.restoreDay(factory, dateISO);
  }, true);
})();
