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
      .reduce((sum, input) => sum + (Number(input.value) || 0), 0);
    const output = modal.querySelector('[data-fae-total]');
    if (output) output.textContent = fmt(total);
  }

  async function saveChanges(modal, factory, dateISO, events) {
    if (window.__flareCloudHydrated !== true || typeof window.__flareCloudPush !== 'function') {
      alert('雲端資料尚未完成同步，為避免資料遺失，請等右上角顯示「已同步雲端」後再修改。');
      return;
    }

    const inputs = [...modal.querySelectorAll('.fae-amount')];
    const nextAmounts = inputs.map((input) => Number(input.value));
    if (nextAmounts.some((value) => !Number.isFinite(value) || value < 0)) {
      alert('排放量必須是 0 以上的有效數字。');
      return;
    }

    const changedIndexes = nextAmounts
      .map((value, index) => ({ value, index }))
      .filter(({ value, index }) => Math.abs(value - Number(events[index]?.amount || 0)) > 0.000001);

    if (!changedIndexes.length) {
      closeModal();
      return;
    }

    const state = getState();
    if (!state || !Array.isArray(state.events)) {
      alert('目前無法讀取燃燒塔資料，請重新整理後再試。');
      return;
    }

    const saveBtn = modal.querySelector('[data-fae-save]');
    const cancelBtn = modal.querySelector('[data-fae-cancel]');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '儲存中…'; }
    if (cancelBtn) cancelBtn.disabled = true;

    const backups = events.map((event) => ({
      event,
      amount: event.amount,
      history: Array.isArray(event.amountEditHistory) ? [...event.amountEditHistory] : null,
      modifiedAt: event.amountModifiedAt,
      modifiedFrom: event.amountModifiedFrom
    }));
    const changedAt = new Date().toISOString();

    try {
      changedIndexes.forEach(({ value, index }) => {
        const event = events[index];
        const previous = Number(event.amount || 0);
        const history = Array.isArray(event.amountEditHistory) ? [...event.amountEditHistory] : [];
        history.push({ from: previous, to: value, at: changedAt });
        event.amount = value;
        event.amountModifiedAt = changedAt;
        event.amountModifiedFrom = previous;
        event.amountEditHistory = history.slice(-20);
      });

      if (typeof window.setFirebaseSyncStatus === 'function') {
        window.setFirebaseSyncStatus('☁️ 正在儲存排放量修改…', 'info');
      }

      await window.__flareCloudPush(state);
      localStorage.setItem('flare_events_final', JSON.stringify(state.events));

      if (typeof window.renderAll === 'function') window.renderAll();
      if (typeof window.setFirebaseSyncStatus === 'function') {
        window.setFirebaseSyncStatus('☁️ 已儲存雲端', 'ok');
      }

      closeModal();
      alert(`${factory} / ${dateISO} 排放量已修改並儲存。`);
    } catch (error) {
      backups.forEach((backup) => {
        backup.event.amount = backup.amount;
        if (backup.history === null) delete backup.event.amountEditHistory;
        else backup.event.amountEditHistory = backup.history;
        if (backup.modifiedAt === undefined) delete backup.event.amountModifiedAt;
        else backup.event.amountModifiedAt = backup.modifiedAt;
        if (backup.modifiedFrom === undefined) delete backup.event.amountModifiedFrom;
        else backup.event.amountModifiedFrom = backup.modifiedFrom;
      });
      localStorage.setItem('flare_events_final', JSON.stringify(state.events));
      if (typeof window.renderAll === 'function') window.renderAll();
      if (typeof window.setFirebaseSyncStatus === 'function') {
        window.setFirebaseSyncStatus('☁️ 排放量修改失敗', 'err');
      }
      alert(`排放量修改失敗：${error?.message || error}`);
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
      <tr${Number(event.amount || 0) === 0 ? ' class="fae-zero-row"' : ''}>
        <td>${index + 1}</td>
        <td>${sourceLabel(event.source)}</td>
        <td>${typeLabel(event.type)}</td>
        <td><input class="fae-amount" type="number" min="0" step="0.01" inputmode="decimal" value="${Number(event.amount || 0)}" data-index="${index}" aria-label="第 ${index + 1} 筆排放量"></td>
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
          <div class="fae-note">只修改排放量，不會改變工廠、日期、定檢判定或人工剔除狀態。若同一天有多筆原始資料，請分別修正各筆流量；下方會即時計算當日合計。</div>
          <div class="fae-table-wrap">
            <table>
              <thead><tr><th>#</th><th>來源</th><th>類型</th><th>排放量 (NM3)</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          ${zeroTools}
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
    modal.querySelector('[data-fae-save]')?.addEventListener('click', () => saveChanges(modal, factory, dateISO, events));
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
