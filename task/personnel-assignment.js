/* EHS Task Personnel Assignment v1
 * Flow: Unit -> Personnel category -> People checkboxes.
 * Supports multiple categories per person, multiple owners per task, manual other people,
 * and a seventh Basic Data tab for personnel-category maintenance.
 */
(() => {
  'use strict';

  const META_CACHE_KEY = 'ESH_TASK_PERSONNEL_META_V1';
  const META_COLLECTION = 'ehs_task_personnel_meta';
  const META_DOC_ID = 'settings';
  const BASIC_CACHE_KEY = 'ESH_TASK_MASTER_DATA_V1';

  let meta = loadMetaCache();
  let basic = loadBasicCache();
  let firestoreApi = null;
  let metaRef = null;
  let customTabActive = false;
  let activePersonnelCategoryId = '';
  let selectedPersonIds = new Set();
  let manualOwnerText = '';
  let lastUnitValue = '';
  let pendingNewPerson = null;
  let applying = false;

  const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');
  const keyOf = (s) => norm(s).toLocaleLowerCase('zh-Hant');
  const uid = (prefix = 'pc') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const esc = (s) => String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  function defaultMeta() {
    return { version: 1, categories: [], assignments: {} };
  }

  function sanitizeMeta(v) {
    const seen = new Set();
    const categories = (Array.isArray(v?.categories) ? v.categories : [])
      .map(x => ({ id: String(x?.id || uid()), name: norm(x?.name), enabled: x?.enabled !== false }))
      .filter(x => x.name && !seen.has(keyOf(x.name)) && seen.add(keyOf(x.name)));
    const assignments = {};
    if (v?.assignments && typeof v.assignments === 'object') {
      Object.entries(v.assignments).forEach(([personId, ids]) => {
        assignments[String(personId)] = [...new Set((Array.isArray(ids) ? ids : []).map(String))];
      });
    }
    return { version: 1, categories, assignments };
  }

  function loadMetaCache() {
    try { return sanitizeMeta(JSON.parse(localStorage.getItem(META_CACHE_KEY) || 'null') || defaultMeta()); }
    catch (_) { return defaultMeta(); }
  }

  function saveMetaCache() {
    try { localStorage.setItem(META_CACHE_KEY, JSON.stringify(meta)); } catch (_) {}
  }

  function loadBasicCache() {
    try {
      const v = JSON.parse(localStorage.getItem(BASIC_CACHE_KEY) || 'null');
      return v && typeof v === 'object' ? v : { people: [], units: [] };
    } catch (_) {
      return { people: [], units: [] };
    }
  }

  function refreshBasicCache() {
    basic = loadBasicCache();
  }

  const people = () => (Array.isArray(basic?.people) ? basic.people : []);
  const units = () => (Array.isArray(basic?.units) ? basic.units : []);
  const categories = () => (Array.isArray(meta?.categories) ? meta.categories : []);
  const enabledCategories = () => categories().filter(c => c.enabled);
  const personById = (id) => people().find(p => String(p.id) === String(id));
  const unitById = (id) => units().find(u => String(u.id) === String(id));
  const unitByName = (name) => units().find(u => keyOf(u.name) === keyOf(name));
  const categoryById = (id) => categories().find(c => String(c.id) === String(id));
  const assignedCategoryIds = (personId) => [...new Set((meta.assignments?.[String(personId)] || []).map(String))];
  const enabledAssignedIds = (personId) => assignedCategoryIds(personId).filter(id => categoryById(id)?.enabled);

  function setSyncText(text, ok = true) {
    const el = document.getElementById('master-sync-state');
    if (!el) return;
    el.textContent = text;
    el.className = ok ? 'text-[11px] font-bold text-emerald-600' : 'text-[11px] font-bold text-amber-600';
  }

  async function saveMeta() {
    saveMetaCache();
    renderPersonnelCategoryTabIfActive();
    enhancePeopleBasicData();
    renderAssignmentPanel();
    if (!firestoreApi || !metaRef) return;
    try {
      setSyncText('人員類別儲存中…', true);
      await firestoreApi.setDoc(metaRef, { ...meta, _updatedTs: firestoreApi.serverTimestamp() }, { merge: false });
      setSyncText('雲端已儲存', true);
    } catch (err) {
      console.warn('Personnel meta save failed', err);
      setSyncText('人員類別已保留本機', false);
    }
  }

  async function setupFirestore() {
    try {
      let tries = 0;
      while (!window.__fb?.db && tries < 30) {
        await new Promise(r => setTimeout(r, 200));
        tries++;
      }
      if (!window.__fb?.db) return;
      firestoreApi = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
      const db = window.__fb.db;
      metaRef = firestoreApi.doc(db, META_COLLECTION, META_DOC_ID);
      const basicRef = firestoreApi.doc(db, 'ehs_task_master_data', 'settings');

      firestoreApi.onSnapshot(basicRef, snap => {
        if (snap.exists()) {
          const data = snap.data() || {};
          basic = {
            ...basic,
            people: Array.isArray(data.people) ? data.people : basic.people,
            units: Array.isArray(data.units) ? data.units : basic.units
          };
          enhancePeopleBasicData();
          renderAssignmentPanel();
          tryApplyPendingPersonAssignment();
        }
      });

      firestoreApi.onSnapshot(metaRef, async snap => {
        if (!snap.exists()) {
          await firestoreApi.setDoc(metaRef, { ...meta, _updatedTs: firestoreApi.serverTimestamp() }, { merge: false });
          return;
        }
        meta = sanitizeMeta(snap.data());
        saveMetaCache();
        renderPersonnelCategoryTabIfActive();
        enhancePeopleBasicData();
        renderAssignmentPanel();
      }, err => console.warn('Personnel meta realtime failed', err));
    } catch (err) {
      console.warn('Personnel meta Firestore unavailable', err);
    }
  }

  function injectStyles() {
    if (document.getElementById('personnel-assignment-style')) return;
    const style = document.createElement('style');
    style.id = 'personnel-assignment-style';
    style.textContent = `
      #personnel-assignment-panel .pa-category-btn{border:1px solid #cbd5e1;background:#fff;color:#475569;border-radius:.65rem;padding:.5rem .8rem;font-size:.78rem;font-weight:800;transition:.15s}
      #personnel-assignment-panel .pa-category-btn:hover{background:#f8fafc;border-color:#94a3b8}
      #personnel-assignment-panel .pa-category-btn.active{background:#eff6ff;border-color:#3b82f6;color:#1d4ed8;box-shadow:0 0 0 1px #bfdbfe inset}
      #personnel-assignment-panel .pa-person{display:flex;align-items:center;gap:.55rem;border:1px solid #e2e8f0;background:#fff;border-radius:.65rem;padding:.65rem .8rem;cursor:pointer}
      #personnel-assignment-panel .pa-person:hover{background:#f8fafc}
      #personnel-assignment-panel .pa-chip{display:inline-flex;align-items:center;gap:.35rem;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:999px;padding:.25rem .55rem;font-size:.72rem;font-weight:800}
      #personnel-category-editor{z-index:180}
    `;
    document.head.appendChild(style);
  }

  function ensurePersonnelCategoryTab() {
    const tabs = document.getElementById('master-tabs');
    if (!tabs) return;
    let btn = document.getElementById('master-tab-personnel-categories');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'master-tab-personnel-categories';
      btn.type = 'button';
      btn.textContent = '人員類別';
      btn.className = 'px-4 py-2.5 rounded-t-lg text-sm font-bold border-b-2 transition text-slate-500 border-transparent hover:text-slate-700';
      btn.style.minHeight = '46px';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        customTabActive = true;
        markCustomTabActive();
        renderPersonnelCategoryTab();
      });
      tabs.appendChild(btn);
    }
    if (customTabActive) markCustomTabActive();
  }

  function markCustomTabActive() {
    const tabs = document.getElementById('master-tabs');
    if (!tabs) return;
    [...tabs.children].forEach(b => {
      const active = b.id === 'master-tab-personnel-categories';
      b.classList.toggle('text-blue-600', active);
      b.classList.toggle('border-blue-600', active);
      b.classList.toggle('bg-blue-50/60', active);
      b.classList.toggle('text-slate-500', !active);
      b.classList.toggle('border-transparent', !active);
    });
  }

  function currentStandardTabName() {
    const tabs = document.getElementById('master-tabs');
    if (!tabs) return '';
    const selected = [...tabs.children].find(b => b.id !== 'master-tab-personnel-categories' && b.classList.contains('text-blue-600'));
    return norm(selected?.textContent);
  }

  function renderPersonnelCategoryTabIfActive() {
    if (customTabActive && document.getElementById('master-data-modal') && !document.getElementById('master-data-modal').classList.contains('hidden')) {
      renderPersonnelCategoryTab();
    }
  }

  function renderPersonnelCategoryTab() {
    ensurePersonnelCategoryTab();
    const label = document.getElementById('master-new-label');
    const input = document.getElementById('master-new-name');
    const unitWrap = document.getElementById('master-person-unit-wrap');
    const picker = document.getElementById('master-person-categories-wrap');
    const list = document.getElementById('master-list');
    if (!list) return;

    if (label) label.textContent = '新增人員類別';
    if (input) input.placeholder = '例如：工安組、環保組、消防組';
    unitWrap?.classList.add('hidden');
    picker?.classList.add('hidden');

    if (!categories().length) {
      list.innerHTML = '<div class="p-6 text-center text-sm text-slate-400">目前尚未建立人員類別。未設定類別的人員會自動歸入「未分類」。</div>';
      return;
    }

    list.innerHTML = categories().map((c, i) => `
      <div class="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 items-center px-4 py-3 ${c.enabled ? 'bg-white' : 'bg-slate-50 opacity-70'}" data-pc-id="${esc(c.id)}">
        <div class="font-bold text-sm text-slate-700">${esc(c.name)}</div>
        <div class="flex items-center gap-1">
          <span class="text-[11px] font-bold px-2 py-1 rounded-full ${c.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-500'}">${c.enabled ? '啟用' : '停用'}</span>
          <button type="button" data-pc-action="up" class="px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button type="button" data-pc-action="down" class="px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded" ${i === categories().length - 1 ? 'disabled' : ''}>↓</button>
        </div>
        <div class="flex items-center justify-end gap-1">
          <button type="button" data-pc-action="edit" class="px-2.5 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded">修改</button>
          <button type="button" data-pc-action="toggle" class="px-2.5 py-1.5 text-xs font-bold ${c.enabled ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'} rounded">${c.enabled ? '停用' : '啟用'}</button>
        </div>
      </div>`).join('');
  }

  async function addPersonnelCategory() {
    const input = document.getElementById('master-new-name');
    const name = norm(input?.value);
    if (!name) return alert('請輸入人員類別名稱');
    if (name === '未分類') return alert('「未分類」為系統自動分類，不需建立');
    if (categories().some(c => keyOf(c.name) === keyOf(name))) return alert('已有相同的人員類別');
    meta.categories.push({ id: uid('pc'), name, enabled: true });
    if (input) input.value = '';
    await saveMeta();
  }

  async function handleCategoryRowAction(button) {
    const row = button.closest('[data-pc-id]');
    const id = row?.dataset.pcId;
    const action = button.dataset.pcAction;
    const list = categories();
    const idx = list.findIndex(c => c.id === id);
    if (idx < 0) return;
    if (action === 'up' && idx > 0) [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
    if (action === 'down' && idx < list.length - 1) [list[idx + 1], list[idx]] = [list[idx], list[idx + 1]];
    if (action === 'toggle') list[idx].enabled = !list[idx].enabled;
    if (action === 'edit') {
      const next = prompt(`修改「${list[idx].name}」`, list[idx].name);
      if (next === null) return;
      const name = norm(next);
      if (!name) return alert('名稱不可空白');
      if (name === '未分類') return alert('「未分類」為系統自動分類');
      if (list.some((c, j) => j !== idx && keyOf(c.name) === keyOf(name))) return alert('已有相同的人員類別');
      list[idx].name = name;
    }
    await saveMeta();
  }

  function ensurePersonCategoryPicker() {
    const row = document.getElementById('master-new-name')?.closest('.flex.flex-col.md\\:flex-row');
    if (!row) return;
    let wrap = document.getElementById('master-person-categories-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'master-person-categories-wrap';
      wrap.className = 'hidden flex-1 min-w-[16rem]';
      const addButtonWrap = document.getElementById('btn-master-add')?.parentElement;
      if (addButtonWrap) row.insertBefore(wrap, addButtonWrap);
      else row.appendChild(wrap);
    }
    wrap.innerHTML = `
      <label class="block text-xs font-bold text-slate-400 uppercase mb-2">人員類別（可複選）</label>
      <div class="min-h-[46px] border border-slate-200 rounded-lg px-3 py-2 flex flex-wrap gap-x-4 gap-y-2 bg-white">
        ${enabledCategories().length ? enabledCategories().map(c => `<label class="inline-flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer"><input type="checkbox" data-new-person-category="${esc(c.id)}" class="accent-blue-600">${esc(c.name)}</label>`).join('') : '<span class="text-xs text-slate-400 self-center">尚未建立人員類別；新增後可設定，未勾選則歸入「未分類」。</span>'}
      </div>`;
  }

  function enhancePeopleBasicData() {
    if (customTabActive || currentStandardTabName() !== '人員') {
      document.getElementById('master-person-categories-wrap')?.classList.add('hidden');
      return;
    }
    ensurePersonCategoryPicker();
    document.getElementById('master-person-categories-wrap')?.classList.remove('hidden');

    document.querySelectorAll('#master-list [data-master-row]').forEach(row => {
      const personId = row.dataset.masterRow;
      if (!personId) return;
      const info = row.children?.[0];
      if (info && !info.querySelector('[data-person-category-summary]')) {
        const div = document.createElement('div');
        div.dataset.personCategorySummary = '1';
        div.className = 'text-[11px] text-slate-400 mt-0.5';
        info.appendChild(div);
      }
      const summary = info?.querySelector('[data-person-category-summary]');
      const names = enabledAssignedIds(personId).map(id => categoryById(id)?.name).filter(Boolean);
      if (summary) summary.textContent = `人員類別：${names.length ? names.join('、') : '未分類'}`;

      const actions = row.children?.[2];
      if (actions && !actions.querySelector('[data-edit-person-categories]')) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.editPersonCategories = personId;
        btn.className = 'px-2.5 py-1.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded';
        btn.textContent = '類別';
        actions.insertBefore(btn, actions.firstChild);
      }
    });
  }

  function openPersonCategoryEditor(personId) {
    refreshBasicCache();
    const p = personById(personId);
    if (!p) return alert('找不到人員資料，請重新整理後再試');
    document.getElementById('personnel-category-editor')?.remove();
    const current = new Set(assignedCategoryIds(personId));
    const modal = document.createElement('div');
    modal.id = 'personnel-category-editor';
    modal.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl w-[min(92vw,34rem)] overflow-hidden">
        <div class="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
          <div><div class="font-bold text-slate-800">設定人員類別</div><div class="text-xs text-slate-400 mt-1">${esc(p.name)}｜${esc(unitById(p.unitId)?.name || '未指定單位')}</div></div>
          <button type="button" data-pce-close class="text-slate-400 text-xl">✕</button>
        </div>
        <div class="p-6">
          <div class="text-xs font-bold text-slate-400 mb-3">可複選；全部不勾選時會歸入「未分類」</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            ${enabledCategories().length ? enabledCategories().map(c => `<label class="border border-slate-200 rounded-lg px-3 py-3 flex items-center gap-2 cursor-pointer hover:bg-slate-50"><input type="checkbox" data-pce-category="${esc(c.id)}" class="accent-blue-600" ${current.has(c.id) ? 'checked' : ''}><span class="text-sm font-bold text-slate-700">${esc(c.name)}</span></label>`).join('') : '<div class="text-sm text-slate-400">尚未建立人員類別。</div>'}
          </div>
        </div>
        <div class="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button type="button" data-pce-close class="px-5 py-2 text-sm font-bold text-slate-500">取消</button>
          <button type="button" data-pce-save class="px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg">儲存</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', async e => {
      if (e.target.closest('[data-pce-close]') || e.target === modal) return modal.remove();
      if (e.target.closest('[data-pce-save]')) {
        const ids = [...modal.querySelectorAll('[data-pce-category]:checked')].map(x => x.dataset.pceCategory);
        meta.assignments[String(personId)] = ids;
        modal.remove();
        await saveMeta();
      }
    });
  }

  function captureNewPersonAssignment() {
    if (customTabActive || currentStandardTabName() !== '人員') return;
    const name = norm(document.getElementById('master-new-name')?.value);
    if (!name) return;
    const ids = [...document.querySelectorAll('[data-new-person-category]:checked')].map(x => x.dataset.newPersonCategory);
    pendingNewPerson = { name, ids, started: Date.now() };
    setTimeout(tryApplyPendingPersonAssignment, 120);
  }

  function tryApplyPendingPersonAssignment() {
    if (!pendingNewPerson) return;
    refreshBasicCache();
    let p = people().find(x => keyOf(x.name) === keyOf(pendingNewPerson.name));
    if (!p) {
      const row = [...document.querySelectorAll('#master-list [data-master-row]')].find(r => keyOf(r.querySelector('.font-bold')?.textContent) === keyOf(pendingNewPerson.name));
      if (row?.dataset.masterRow) p = { id: row.dataset.masterRow, name: pendingNewPerson.name };
    }
    if (p?.id) {
      meta.assignments[String(p.id)] = [...pendingNewPerson.ids];
      pendingNewPerson = null;
      saveMeta();
      return;
    }
    if (Date.now() - pendingNewPerson.started < 3000) setTimeout(tryApplyPendingPersonAssignment, 200);
    else pendingNewPerson = null;
  }

  function ensureAssignmentPanel() {
    const owner = document.getElementById('f-owner');
    const unit = document.getElementById('f-unit');
    const grid = document.getElementById('modal-fields');
    if (!owner || !unit || !grid) return;
    const ownerBlock = owner.closest('.col-span-1');
    const unitBlock = unit.closest('.col-span-1');
    if (!ownerBlock || !unitBlock) return;

    ownerBlock.classList.add('hidden');
    unitBlock.classList.remove('col-span-1');
    unitBlock.classList.add('col-span-2');
    if (ownerBlock.previousElementSibling !== unitBlock) grid.insertBefore(unitBlock, ownerBlock);

    if (document.getElementById('personnel-assignment-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'personnel-assignment-panel';
    panel.className = 'col-span-2 border border-slate-200 rounded-xl p-4 bg-slate-50/70';
    panel.innerHTML = `
      <div class="mb-4">
        <div class="flex justify-between items-center mb-2"><label class="block text-xs font-bold text-slate-400 uppercase">人員類別</label><span class="text-[11px] text-slate-400">先選單位，再選類別</span></div>
        <div id="pa-categories" class="flex flex-wrap gap-2"></div>
      </div>
      <div id="pa-people-section" class="hidden mb-4">
        <div class="flex justify-between items-center mb-2"><label class="block text-xs font-bold text-slate-400 uppercase">負責人（可複選）</label><span id="pa-category-label" class="text-[11px] font-bold text-blue-600"></span></div>
        <div id="pa-people" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2"></div>
      </div>
      <div class="border-t border-slate-200 pt-3">
        <label class="inline-flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer"><input id="pa-other-toggle" type="checkbox" class="accent-blue-600">其他／自行輸入</label>
        <input id="pa-other-input" type="text" class="hidden mt-2 w-full border border-slate-200 rounded-lg p-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500" placeholder="可輸入一人或多人，請以「、」或逗號分隔" />
      </div>
      <div class="mt-4">
        <div class="text-[11px] font-bold text-slate-400 mb-2">已選負責人</div>
        <div id="pa-selected" class="flex flex-wrap gap-2"></div>
      </div>`;
    grid.insertBefore(panel, ownerBlock.nextSibling);

    panel.querySelector('#pa-other-toggle')?.addEventListener('change', e => {
      const input = panel.querySelector('#pa-other-input');
      input?.classList.toggle('hidden', !e.target.checked);
      if (!e.target.checked) { manualOwnerText = ''; if (input) input.value = ''; syncOwnerField(); }
    });
    panel.querySelector('#pa-other-input')?.addEventListener('input', e => { manualOwnerText = e.target.value; syncOwnerField(); renderSelectedOwners(); });
    unit.addEventListener('change', () => handleUnitChanged(false));
    unit.addEventListener('input', () => setTimeout(() => handleUnitChanged(false), 0));
  }

  function peopleForUnitName(unitName) {
    const u = unitByName(unitName);
    if (!u) return [];
    return people().filter(p => p?.enabled !== false && String(p.unitId || '') === String(u.id));
  }

  function relevantCategories(unitName) {
    const ps = peopleForUnitName(unitName);
    const out = [];
    enabledCategories().forEach(c => {
      if (ps.some(p => enabledAssignedIds(p.id).includes(c.id))) out.push({ id: c.id, name: c.name });
    });
    if (ps.some(p => enabledAssignedIds(p.id).length === 0)) out.push({ id: '__uncategorized__', name: '未分類' });
    return out;
  }

  function peopleForCategory(unitName, catId) {
    const ps = peopleForUnitName(unitName);
    if (catId === '__uncategorized__') return ps.filter(p => enabledAssignedIds(p.id).length === 0);
    return ps.filter(p => enabledAssignedIds(p.id).includes(catId));
  }

  function handleUnitChanged(preserve = false) {
    refreshBasicCache();
    const current = norm(document.getElementById('f-unit')?.value);
    if (!preserve && lastUnitValue && keyOf(current) !== keyOf(lastUnitValue)) {
      selectedPersonIds.clear();
      manualOwnerText = '';
      const otherToggle = document.getElementById('pa-other-toggle');
      const otherInput = document.getElementById('pa-other-input');
      if (otherToggle) otherToggle.checked = false;
      if (otherInput) { otherInput.value = ''; otherInput.classList.add('hidden'); }
      syncOwnerField();
    }
    lastUnitValue = current;
    activePersonnelCategoryId = '';
    renderAssignmentPanel();
  }

  function renderAssignmentPanel() {
    const panel = document.getElementById('personnel-assignment-panel');
    if (!panel) return;
    refreshBasicCache();
    const unitName = norm(document.getElementById('f-unit')?.value);
    const catsHost = document.getElementById('pa-categories');
    const peopleSection = document.getElementById('pa-people-section');
    const peopleHost = document.getElementById('pa-people');
    const label = document.getElementById('pa-category-label');
    if (!catsHost || !peopleHost) return;

    if (!unitName) {
      catsHost.innerHTML = '<span class="text-xs text-slate-400">請先選擇單位。</span>';
      peopleSection?.classList.add('hidden');
      renderSelectedOwners();
      return;
    }

    const cats = relevantCategories(unitName);
    if (!cats.length) {
      catsHost.innerHTML = '<span class="text-xs text-slate-400">此單位目前沒有可選的人員；請至「基本資料管理 → 人員」設定單位與人員類別。</span>';
      peopleSection?.classList.add('hidden');
      renderSelectedOwners();
      return;
    }

    catsHost.innerHTML = cats.map(c => `<button type="button" class="pa-category-btn ${activePersonnelCategoryId === c.id ? 'active' : ''}" data-pa-category="${esc(c.id)}">${esc(c.name)}</button>`).join('');
    catsHost.querySelectorAll('[data-pa-category]').forEach(b => b.addEventListener('click', () => {
      activePersonnelCategoryId = b.dataset.paCategory;
      renderAssignmentPanel();
    }));

    if (!activePersonnelCategoryId || !cats.some(c => c.id === activePersonnelCategoryId)) {
      peopleSection?.classList.add('hidden');
      peopleHost.innerHTML = '';
      if (label) label.textContent = '';
      renderSelectedOwners();
      return;
    }

    const currentCat = cats.find(c => c.id === activePersonnelCategoryId);
    const ps = peopleForCategory(unitName, activePersonnelCategoryId);
    peopleSection?.classList.remove('hidden');
    if (label) label.textContent = currentCat?.name || '';
    peopleHost.innerHTML = ps.length ? ps.map(p => `
      <label class="pa-person"><input type="checkbox" data-pa-person="${esc(p.id)}" class="accent-blue-600" ${selectedPersonIds.has(String(p.id)) ? 'checked' : ''}><span class="text-sm font-bold text-slate-700">${esc(p.name)}</span></label>`).join('') : '<div class="text-xs text-slate-400">此類別目前沒有人員。</div>';
    peopleHost.querySelectorAll('[data-pa-person]').forEach(cb => cb.addEventListener('change', () => {
      const id = String(cb.dataset.paPerson);
      if (cb.checked) selectedPersonIds.add(id); else selectedPersonIds.delete(id);
      syncOwnerField();
      renderSelectedOwners();
    }));
    renderSelectedOwners();
  }

  function splitManualNames(text) {
    return [...new Set(String(text || '').split(/[、,，;；\n]+/).map(norm).filter(Boolean))];
  }

  function selectedMasterNames() {
    return [...selectedPersonIds].map(id => personById(id)?.name).map(norm).filter(Boolean);
  }

  function syncOwnerField() {
    const owner = document.getElementById('f-owner');
    if (!owner) return;
    const names = [...selectedMasterNames(), ...splitManualNames(manualOwnerText)];
    owner.value = [...new Set(names)].join('、');
  }

  function renderSelectedOwners() {
    const host = document.getElementById('pa-selected');
    if (!host) return;
    const entries = [...selectedPersonIds].map(id => ({ id, name: personById(id)?.name })).filter(x => x.name);
    const manual = splitManualNames(manualOwnerText).map(name => ({ id: '', name }));
    const all = [...entries, ...manual];
    host.innerHTML = all.length ? all.map(x => `<span class="pa-chip">${esc(x.name)}${x.id ? `<button type="button" data-pa-remove="${esc(x.id)}" class="text-blue-400 hover:text-blue-700">✕</button>` : ''}</span>`).join('') : '<span class="text-xs text-slate-400">尚未選擇負責人。</span>';
    host.querySelectorAll('[data-pa-remove]').forEach(b => b.addEventListener('click', () => {
      selectedPersonIds.delete(String(b.dataset.paRemove));
      syncOwnerField();
      renderAssignmentPanel();
    }));
  }

  function hydrateOwnersFromCurrentTask() {
    refreshBasicCache();
    selectedPersonIds.clear();
    manualOwnerText = '';
    const ownerText = norm(document.getElementById('f-owner')?.value);
    const unitName = norm(document.getElementById('f-unit')?.value);
    lastUnitValue = unitName;
    const names = splitManualNames(ownerText);
    const unitPeople = peopleForUnitName(unitName);
    const unmatched = [];
    names.forEach(name => {
      const p = unitPeople.find(x => keyOf(x.name) === keyOf(name)) || people().find(x => keyOf(x.name) === keyOf(name));
      if (p) selectedPersonIds.add(String(p.id)); else unmatched.push(name);
    });
    manualOwnerText = unmatched.join('、');
    const toggle = document.getElementById('pa-other-toggle');
    const input = document.getElementById('pa-other-input');
    if (toggle) toggle.checked = unmatched.length > 0;
    if (input) { input.value = manualOwnerText; input.classList.toggle('hidden', unmatched.length === 0); }
    activePersonnelCategoryId = '';
    syncOwnerField();
    renderAssignmentPanel();
  }

  function observeTaskModal() {
    const modal = document.getElementById('modal');
    if (!modal || modal.dataset.personnelObserved) return;
    modal.dataset.personnelObserved = '1';
    const obs = new MutationObserver(() => {
      if (!modal.classList.contains('hidden')) setTimeout(hydrateOwnersFromCurrentTask, 0);
      else {
        selectedPersonIds.clear(); manualOwnerText = ''; activePersonnelCategoryId = ''; lastUnitValue = '';
      }
    });
    obs.observe(modal, { attributes: true, attributeFilter: ['class'] });
  }

  function installGlobalListeners() {
    document.addEventListener('click', e => {
      const standardTab = e.target.closest('#master-tabs button:not(#master-tab-personnel-categories)');
      if (standardTab) {
        customTabActive = false;
        setTimeout(() => { ensurePersonnelCategoryTab(); enhancePeopleBasicData(); }, 0);
      }

      const editCat = e.target.closest('[data-edit-person-categories]');
      if (editCat) {
        e.preventDefault(); e.stopPropagation();
        openPersonCategoryEditor(editCat.dataset.editPersonCategories);
        return;
      }

      const pcAction = e.target.closest('[data-pc-action]');
      if (pcAction && customTabActive) {
        e.preventDefault(); e.stopPropagation();
        handleCategoryRowAction(pcAction);
      }
    });

    document.addEventListener('click', e => {
      const add = e.target.closest('#btn-master-add');
      if (!add) return;
      if (customTabActive) {
        e.preventDefault();
        e.stopImmediatePropagation();
        addPersonnelCategory();
      } else if (currentStandardTabName() === '人員') {
        captureNewPersonAssignment();
      }
    }, true);

    document.addEventListener('mousedown', e => {
      if (e.target.closest('#unit-dropdown button')) setTimeout(() => handleUnitChanged(false), 0);
    });
  }

  function startObservers() {
    const observer = new MutationObserver(() => {
      if (applying) return;
      applying = true;
      requestAnimationFrame(() => {
        applying = false;
        ensurePersonnelCategoryTab();
        enhancePeopleBasicData();
        ensureAssignmentPanel();
        observeTaskModal();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function boot() {
    injectStyles();
    refreshBasicCache();
    ensurePersonnelCategoryTab();
    enhancePeopleBasicData();
    ensureAssignmentPanel();
    observeTaskModal();
    installGlobalListeners();
    startObservers();
    setupFirestore();
    setInterval(() => {
      refreshBasicCache();
      ensurePersonnelCategoryTab();
      enhancePeopleBasicData();
    }, 1500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
