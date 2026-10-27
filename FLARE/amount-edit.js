(() => {
  if (window.__flareAmountEditLoaded) return;
  window.__flareAmountEditLoaded = true;

  const STYLE_ID = 'flare-amount-edit-style';
  const MODAL_ID = 'flare-amount-edit-modal';

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .flare-amount-edit-btn{
        display:inline-flex;align-items:center;justify-content:center;gap:4px;
        margin-right:10px;color:#1d5fd0;font-weight:800;text-decoration:underline;
        text-underline-offset:2px;cursor:pointer;background:transparent;border:0;padding:0;
        font:inherit;
      }
      .flare-amount-edit-btn:hover{color:#174fb2}
      #${MODAL_ID}{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:22px;background:rgba(15,23,42,.58);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
      #${MODAL_ID}[hidden]{display:none!important}
      #${MODAL_ID} .fae-card{width:min(760px,100%);max-height:calc(100vh - 44px);overflow:auto;background:#fff;border:1px solid #d7dfeb;border-radius:14px;box-shadow:0 24px 70px rgba(15,47,95,.24);font-family:"Noto Sans TC","Microsoft JhengHei",Arial,sans-serif;color:#172033}
      #${MODAL_ID} .fae-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 20px 15px;border-bottom:1px solid #d7dfeb;background:#f8fbff}
      #${MODAL_ID} .fae-title{margin:0;color:#0f2f5f;font-size:19px;line-height:1.35;font-weight:900}
      #${MODAL_ID} .fae-meta{margin-top:5px;color:#66758c;font-size:12px;line-height:1.6}
      #${MODAL_ID} .fae-close{border:0;background:#fff;color:#526175;width:34px;height:34px;border-radius:8px;font-size:20px;line-height:1;cursor:pointer;box-shadow:0 0 0 1px #d7dfeb inset}
      #${MODAL_ID} .fae-body{padding:18px 20px 8px}
      #${MODAL_ID} .fae-note{margin-bottom:14px;padding:10px 12px;border:1px solid #dbe8fb;border-radius:9px;background:#f4f8ff;color:#385274;font-size:12px;line-height:1.65}
      #${MODAL_ID} .fae-table-wrap{overflow:auto;border:1px solid #d7dfeb;border-radius:10px}
      #${MODAL_ID} table{width:100%;border-collapse:collapse;font-size:12.5px}
      #${MODAL_ID} th,#${MODAL_ID} td{padding:10px 12px;border-bottom:1px solid #e4e9f1;text-align:left;white-space:nowrap}
      #${MODAL_ID} th{background:#edf3fb;color:#34445c;font-weight:900}
      #${MODAL_ID} tr:last-child td{border-bottom:0}
      #${MODAL_ID} .fae-zero-row{display:none}
      #${MODAL_ID} .fae-deleted-row{opacity:.46;background:#fff1f2}
      #${MODAL_ID} .fae-deleted-row .fae-amount{text-decoration:line-through}
      #${MODAL_ID} .fae-delete{border:1px solid #fecaca;background:#fff;color:#b91c1c;border-radius:7px;padding:7px 10px;cursor:pointer;font-weight:800}
      #${MODAL_ID} .fae-delete:hover{background:#fef2f2}
      #${MODAL_ID} .fae-delete[data-deleted="true"]{color:#475569;border-color:#cbd5e1}
      #${MODAL_ID} .fae-warning{margin-top:10px;color:#b91c1c;font-size:12px;font-weight:700}
      #${MODAL_ID}.fae-show-zero .fae-zero-row{display:table-row}
      #${MODAL_ID} .fae-zero-tools{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:10px;padding:9px 11px;border:1px solid #dbe8fb;border-radius:8px;background:#f8fbff;color:#5b6b82;font-size:11.5px;line-height:1.5}
      #${MODAL_ID} .fae-zero-toggle{flex:none;border:1px solid #b9cbea;border-radius:7px;background:#fff;color:#1d5fd0;padding:6px 9px;font-size:11.5px;font-weight:800;cursor:pointer}
      #${MODAL_ID} .fae-zero-toggle:hover{background:#edf4ff;border-color:#8fb0e5}
      #${MODAL_ID} .fae-amount{width:160px;border:1px solid #b8c5d8;border-radius:8px;padding:8px 10px;text-align:right;font-size:14px;font-weight:800;color:#172033;background:#fff;outline:none}
      #${MODAL_ID} .fae-amount:focus{border-color:#1d5fd0;box-shadow:0 0 0 3px rgba(29,95,208,.12)}
      #${MODAL_ID} .fae-total{display:flex;justify-content:flex-end;align-items:baseline;gap:8px;padding:14px 2px 4px;color:#526175;font-size:12px;font-weight:800}
      #${MODAL_ID} .fae-total strong{color:#0f2f5f;font-size:20px;font-weight:900}
      #${MODAL_ID} .fae-foot{display:flex;justify-content:flex-end;gap:9px;padding:15px 20px 18px}
      #${MODAL_ID} .fae-btn{min-height:40px;padding:9px 15px;border-radius:8px;font-size:13px;font-weight:900;cursor:pointer;border:1px solid #d7dfeb}
      #${MODAL_ID} .fae-cancel{background:#fff;color:#475569}
      #${MODAL_ID} .fae-save{background:#1d5fd0;border-color:#1d5fd0;color:#fff}
      #${MODAL_ID} .fae-save:hover{background:#174fb2}
      #${MODAL_ID} .fae-btn:disabled{opacity:.55;cursor:wait}
      @media(max-width:640px){#${MODAL_ID}{padding:10px;align-items:flex-start}#${MODAL_ID} .fae-card{max-height:calc(100vh - 20px)}#${MODAL_ID} .fae-head,#${MODAL_ID} .fae-body,#${MODAL_ID} .fae-foot{padding-left:14px;padding-right:14px}#${MODAL_ID} .fae-amount{width:130px}}
    `;
    document.head.appendChild(style);
  }

  function fmt(value) {
    const n = Number(value || 0);
    return n.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function sourceLabel(source) {
    const value = String(source || '').toLowerCase();
    if (value === 'excel') return 'Excel 匯入';
    if (value === 'manual') return '人工新增';
    if (value === 'maintenance') return '維護 CSV';
    return source || '其他';
  }

  function typeLabel(type) {
    return String(type || '').toUpperCase() === 'TA' ? '定檢' : '非定檢';
  }

  function getState() {
    return typeof window.__getFlareCloudState === 'function' ? window.__getFlareCloudState() : null;
  }

  function matchingEvents(factory, dateISO) {
    const state = getState();
    const events = Array.isArray(state?.events) ? state.events : [];
    return events.filter((event) =>
      String(event?.factory || '').trim() === String(factory || '').trim() &&
      String(event?.date || '').trim() === String(dateISO || '').trim()
    );
  }

  function closeModal() {
    document.getElementById(MODAL_ID)?.remove();
    document.body.classList.remove('overflow-hidden');
  }

  function updateLiveTotal(modal) {
    const total = [...modal.querySelectorAll('.fae-amount')]
      .reduce((sum, input) => sum + (input.closest('tr')?.dataset.deleted === 'true' ? 0 : (Number(input.value) || 0)), 0);
    const output = modal.querySelector('[data-fae-total]');
    if (output) output.textContent = fmt(total);
  }

  async function saveChanges(modal, factory, dateISO, originalEvents) {
    if (window.__flareCloudHydrated !== true || typeof window.__flareCloudPush !== 'function') {
      alert('雲端資料尚未完成同步，為避免資料遺失，請等右上角顯示「已同步雲端」後再修改。');
      return;
    }

    const inputs = [...modal.querySelectorAll('.fae-amount')];
    const amounts = inputs.map(input => input.value.trim() === '' ? NaN : Number(input.value));
    const deletedIndexes = new Set();
    inputs.forEach((input, index) => {
      if (input.closest('tr')?.dataset.deleted === 'true' || amounts[index] === 0) deletedIndexes.add(index);
    });
    if (amounts.some((value, index) => !deletedIndexes.has(index) && (!Number.isFinite(value) || value < 0))) {
      alert('保留紀錄的排放量必須是大於 0 的有效數字。');
      return;
    }

    const changedIndexes = amounts.map((value, index) => ({ value, index }))
      .filter(({value,index}) => !deletedIndexes.has(index) && Math.abs(value - Number(originalEvents[index]?.amount || 0)) > 0.000001);
    if (!deletedIndexes.size && !changedIndexes.length) { closeModal(); return; }

    const live = getState();
    if (!live || !Array.isArray(live.events)) {
      alert('目前無法讀取燃燒塔資料，請重新整理後再試。');
      return;
    }
    // 防止編輯期間雲端快照已更新，卻覆蓋其他使用者剛修改的資料。
    const currentEvents = live.events.filter(event =>
      String(event?.factory || '').trim() === String(factory || '').trim() &&
      String(event?.date || '').trim() === String(dateISO || '').trim());
    if (JSON.stringify(currentEvents) !== JSON.stringify(originalEvents)) {
      alert('此日期的原始紀錄已被更新，請關閉視窗重新開啟後再修改。');
      return;
    }
    const description = `${factory} / ${dateISO}\n刪除 ${deletedIndexes.size} 筆（包含所有 0 流量紀錄）\n修改 ${changedIndexes.length} 筆排放量。`;
    if (!confirm(`${description}\n\n刪除為永久刪除，且當日最後一筆也可刪除。確定儲存至雲端？`)) return;

    const saveBtn = modal.querySelector('[data-fae-save]');
    const cancelBtn = modal.querySelector('[data-fae-cancel]');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '儲存中…'; }
    if (cancelBtn) cancelBtn.disabled = true;

    const changedAt = new Date().toISOString();
    let ordinal = 0;
    const changes = new Map(changedIndexes.map(({index,value}) => [index, value]));
    const nextEvents = live.events.flatMap(event => {
      if (String(event?.factory || '').trim() !== String(factory || '').trim() ||
          String(event?.date || '').trim() !== String(dateISO || '').trim()) return [event];
      const index = ordinal++;
      if (deletedIndexes.has(index)) return [];
      if (!changes.has(index)) return [event];
      const previous = Number(event.amount || 0);
      const history = Array.isArray(event.amountEditHistory) ? [...event.amountEditHistory] : [];
      history.push({ from: previous, to: changes.get(index), at: changedAt });
      return [{ ...event, amount: changes.get(index), amountModifiedAt: changedAt,
        amountModifiedFrom: previous, amountEditHistory: history.slice(-20) }];
    });
    const nextState = { ...live, events: nextEvents, updatedAtLocal: changedAt };

    try {
      if (typeof window.setFirebaseSyncStatus === 'function') {
        window.setFirebaseSyncStatus('☁️ 正在儲存原始紀錄修改…', 'info');
      }
      // 優先使用 Firestore transaction，以伺服器端原始資料版本檢查避免誤覆蓋。
      if (typeof window.__flareCloudEditEvents === 'function') {
        await window.__flareCloudEditEvents({ factory, dateISO, originalEvents, amounts, deletedIndexes: [...deletedIndexes] });
      } else {
        await window.__flareCloudPush(nextState);
        if (typeof window.__applyFlareCloudState === 'function') window.__applyFlareCloudState(nextState);
        else { localStorage.setItem('flare_events_final', JSON.stringify(nextEvents)); window.renderAll?.(); }
      }
      closeModal();
      if (typeof window.setFirebaseSyncStatus === 'function') window.setFirebaseSyncStatus('☁️ 已儲存雲端', 'ok');
      alert(`${factory} / ${dateISO} 儲存成功：刪除 ${deletedIndexes.size} 筆、修改 ${changedIndexes.length} 筆。`);
    } catch (error) {
      if (typeof window.setFirebaseSyncStatus === 'function') window.setFirebaseSyncStatus('☁️ 原始紀錄修改失敗', 'err');
      alert(`原始紀錄修改失敗，請重新開啟檢查：${error?.message || error}`);
    } finally {
      if (saveBtn?.isConnected) { saveBtn.disabled = false; saveBtn.textContent = '儲存修改'; }
      if (cancelBtn?.isConnected) cancelBtn.disabled = false;
    }
  }

  function openEditor(factory, dateISO) {
    ensureStyle();
    const events = matchingEvents(factory, dateISO);
    if (!events.length) {
      alert(`找不到 ${factory} / ${dateISO} 的原始排放紀錄。`);
      return;
    }

    closeModal();
    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    const zeroCount = events.filter((event) => Number(event.amount || 0) === 0).length;
    const rows = events.map((event, index) => `
      <tr data-deleted="false"${Number(event.amount || 0) === 0 ? ' class="fae-zero-row"' : ''}>
        <td>${index + 1}</td>
        <td>${sourceLabel(event.source)}</td>
        <td>${typeLabel(event.type)}</td>
        <td><input class="fae-amount" type="number" min="0" step="0.01" inputmode="decimal" value="${Number(event.amount || 0)}" data-index="${index}" aria-label="第 ${index + 1} 筆排放量"></td>
        <td><button type="button" class="fae-delete" data-fae-delete="${index}" aria-label="刪除第 ${index + 1} 筆紀錄">刪除</button></td>
      </tr>`).join('');
    const zeroTools = zeroCount > 0 ? `
      <div class="fae-zero-tools">
        <span data-fae-zero-summary>另有 ${zeroCount} 筆 0 流量紀錄未顯示</span>
        <button type="button" class="fae-zero-toggle" data-fae-zero-toggle>顯示全部原始紀錄</button>
      </div>` : '';

    modal.innerHTML = `
      <div class="fae-card">
        <div class="fae-head">
          <div>
            <h2 class="fae-title">修改排放量</h2>
            <div class="fae-meta">${factory}　／　${dateISO}　／　共 ${events.length} 筆原始紀錄</div>
          </div>
          <button type="button" class="fae-close" data-fae-close aria-label="關閉">×</button>
        </div>
        <div class="fae-body">
          <div class="fae-note">可以逐筆修改流量或標記刪除。儲存時將自動永久刪除本日所有 0 流量紀錄（含原有 0 流量），並依剩餘紀錄重新計算分類與統計；不改變定檢期間與匯入規則。</div>
          <div class="fae-table-wrap">
            <table>
              <thead><tr><th>#</th><th>來源</th><th>類型</th><th>排放量 (NM3)</th><th>操作</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          ${zeroTools}
          <div class="fae-warning">儲存時將清除當天全部 0 流量紀錄；刪除不可復原。</div>
          <div class="fae-total">當日合計 <strong data-fae-total>${fmt(events.reduce((sum, event) => sum + Number(event.amount || 0), 0))}</strong> NM3</div>
        </div>
        <div class="fae-foot">
          <button type="button" class="fae-btn fae-cancel" data-fae-cancel>取消</button>
          <button type="button" class="fae-btn fae-save" data-fae-save>儲存修改</button>
        </div>
      </div>`;

    modal.addEventListener('click', (event) => {
      if (event.target === modal || event.target.closest('[data-fae-close]') || event.target.closest('[data-fae-cancel]')) {
        closeModal();
      }
    });
    modal.querySelectorAll('.fae-amount').forEach((input) => input.addEventListener('input', () => updateLiveTotal(modal)));
    modal.querySelectorAll('[data-fae-delete]').forEach(button => button.addEventListener('click', () => {
      const row = button.closest('tr');
      const deleting = row.dataset.deleted !== 'true';
      row.dataset.deleted = String(deleting);
      row.classList.toggle('fae-deleted-row', deleting);
      button.textContent = deleting ? '取消刪除' : '刪除';
      button.dataset.deleted = String(deleting);
      row.querySelector('.fae-amount').disabled = deleting;
      updateLiveTotal(modal);
    }));
    modal.querySelector('[data-fae-zero-toggle]')?.addEventListener('click', () => {
      const showAll = !modal.classList.contains('fae-show-zero');
      modal.classList.toggle('fae-show-zero', showAll);
      const toggle = modal.querySelector('[data-fae-zero-toggle]');
      const summary = modal.querySelector('[data-fae-zero-summary]');
      if (toggle) toggle.textContent = showAll ? '隱藏 0 流量紀錄' : '顯示全部原始紀錄';
      if (summary) summary.textContent = showAll
        ? `已顯示全部原始紀錄，其中 ${zeroCount} 筆為 0 流量`
        : `另有 ${zeroCount} 筆 0 流量紀錄未顯示`;
    });
    modal.querySelector('[data-fae-save]')?.addEventListener('click', () => saveChanges(modal, factory, dateISO, JSON.parse(JSON.stringify(events))));
    document.addEventListener('keydown', function esc(event) {
      if (event.key !== 'Escape' || !document.getElementById(MODAL_ID)) return;
      document.removeEventListener('keydown', esc);
      closeModal();
    });

    document.body.appendChild(modal);
    document.body.classList.add('overflow-hidden');
    const firstVisibleAmount = [...modal.querySelectorAll('.fae-amount')]
      .find((input) => !input.closest('.fae-zero-row'));
    firstVisibleAmount?.focus();
  }

  function enhanceBody(body) {
    if (!body) return;
    body.querySelectorAll('tr').forEach((row) => {
      const cells = row.querySelectorAll('td');
      if (cells.length < 5) return;
      const actionCell = cells[cells.length - 1];
      const excludeButton = [...actionCell.querySelectorAll('button')].find((button) => button.textContent.trim() === '剔除');
      if (!excludeButton || actionCell.querySelector('.flare-amount-edit-btn')) return;

      const dateISO = cells[0]?.textContent?.trim();
      const factory = cells[1]?.textContent?.trim();
      if (!dateISO || !factory) return;

      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'flare-amount-edit-btn';
      edit.textContent = '修改';
      edit.title = `修改 ${factory} / ${dateISO} 排放量`;
      edit.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openEditor(factory, dateISO);
      });
      actionCell.insertBefore(edit, excludeButton);
    });
  }

  function enhanceAll() {
    enhanceBody(document.getElementById('included-days-body'));
    enhanceBody(document.getElementById('included-days-modal-body'));
  }

  ensureStyle();
  enhanceAll();

  const observer = new MutationObserver(enhanceAll);
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('load', () => setTimeout(enhanceAll, 0), { once: true });
})();
