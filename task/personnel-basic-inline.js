/* EHS Task Personnel Basic Inline Editor v1
 * Replaces the browser prompt flow on Basic Data > 人員 with visible controls:
 * - 預設單位: dropdown
 * - 人員類別: inline multi-select checkboxes
 * - 姓名: in-page modal instead of browser prompt
 */
(() => {
  'use strict';

  const BASIC_CACHE_KEY = 'ESH_TASK_MASTER_DATA_V1';
  const META_CACHE_KEY = 'ESH_TASK_PERSONNEL_META_V1';
  const BASIC_COLLECTION = 'ehs_task_master_data';
  const BASIC_DOC_ID = 'settings';
  const META_COLLECTION = 'ehs_task_personnel_meta';
  const META_DOC_ID = 'settings';

  let basic = readJson(BASIC_CACHE_KEY, { people: [], units: [] });
  let meta = readJson(META_CACHE_KEY, { version: 1, categories: [], assignments: {} });
  let firestoreApi = null;
  let basicRef = null;
  let metaRef = null;
  let rendering = false;

  const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');
  const keyOf = (s) => norm(s).toLocaleLowerCase('zh-Hant');
  const esc = (s) => String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  function readJson(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || 'null');
      return parsed && typeof parsed === 'object' ? parsed : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function refreshCaches() {
    basic = readJson(BASIC_CACHE_KEY, basic || { people: [], units: [] });
    meta = readJson(META_CACHE_KEY, meta || { version: 1, categories: [], assignments: {} });
    if (!Array.isArray(basic.people)) basic.people = [];
    if (!Array.isArray(basic.units)) basic.units = [];
    if (!Array.isArray(meta.categories)) meta.categories = [];
    if (!meta.assignments || typeof meta.assignments !== 'object') meta.assignments = {};
  }

  const people = () => Array.isArray(basic.people) ? basic.people : [];
  const units = () => Array.isArray(basic.units) ? basic.units : [];
  const enabledUnits = () => units().filter(x => x?.enabled !== false);
  const categories = () => Array.isArray(meta.categories) ? meta.categories : [];
  const enabledCategories = () => categories().filter(x => x?.enabled !== false);
  const personById = (id) => people().find(p => String(p.id) === String(id));
  const unitName = (id) => units().find(u => String(u.id) === String(id))?.name || '';
  const assignedIds = (id) => [...new Set((meta.assignments?.[String(id)] || []).map(String))];

  function saveLocalBasic(next) {
    basic = next;
    try { localStorage.setItem(BASIC_CACHE_KEY, JSON.stringify(next)); } catch (_) {}
  }

  function saveLocalMeta() {
    try { localStorage.setItem(META_CACHE_KEY, JSON.stringify(meta)); } catch (_) {}
  }

  function setSync(text, ok = true) {
    const el = document.getElementById('master-sync-state');
    if (!el) return;
    el.textContent = text;
    el.className = ok ? 'text-[11px] font-bold text-emerald-600' : 'text-[11px] font-bold text-amber-600';
  }

  async function updatePersonBasic(personId, changes) {
    const latest = readJson(BASIC_CACHE_KEY, basic || { people: [], units: [] });
    if (!Array.isArray(latest.people)) latest.people = [];
    const index = latest.people.findIndex(p => String(p.id) === String(personId));
    if (index < 0) return false;
    latest.people[index] = { ...latest.people[index], ...changes };
    saveLocalBasic(latest);
    renderPeopleRows(true);

    if (!firestoreApi || !basicRef) {
      setSync('已儲存本機；等待雲端', false);
      return true;
    }
    try {
      setSync('儲存中…', true);
      await firestoreApi.setDoc(basicRef, {
        people: latest.people,
        _updatedTs: firestoreApi.serverTimestamp()
      }, { merge: true });
      setSync('雲端已儲存', true);
      return true;
    } catch (err) {
      console.warn('Inline personnel basic save failed', err);
      setSync('雲端失敗，已保留本機', false);
      return false;
    }
  }

  async function updatePersonCategories(personId, ids) {
    refreshCaches();
    meta.assignments[String(personId)] = [...new Set(ids.map(String))];
    saveLocalMeta();
    renderPeopleRows(true);

    if (!firestoreApi || !metaRef) {
      setSync('人員類別已儲存本機', false);
      return;
    }
    try {
      setSync('人員類別儲存中…', true);
      await firestoreApi.setDoc(metaRef, {
        ...meta,
        _updatedTs: firestoreApi.serverTimestamp()
      }, { merge: false });
      setSync('雲端已儲存', true);
    } catch (err) {
      console.warn('Inline personnel category save failed', err);
      setSync('人員類別雲端失敗，已保留本機', false);
    }
  }

  function isPeopleTab() {
    const tabs = document.getElementById('master-tabs');
    if (!tabs) return false;
    const active = [...tabs.querySelectorAll('button')].find(b =>
      b.id !== 'master-tab-personnel-categories' &&
      b.classList.contains('text-blue-600')
    );
    return norm(active?.textContent) === '人員';
  }

  function injectStyles() {
    if (document.getElementById('personnel-basic-inline-style')) return;
    const style = document.createElement('style');
    style.id = 'personnel-basic-inline-style';
    style.textContent = `
      #master-list [data-master-row] .pbi-editor{margin-top:.7rem;padding:.75rem;border:1px solid #e2e8f0;border-radius:.75rem;background:#f8fafc}
      #master-list [data-master-row] .pbi-grid{display:grid;grid-template-columns:minmax(12rem,18rem) minmax(0,1fr);gap:.8rem 1rem;align-items:start}
      #master-list [data-master-row] .pbi-label{display:block;margin-bottom:.35rem;font-size:10px;font-weight:900;color:#94a3b8;letter-spacing:.04em}
      #master-list [data-master-row] .pbi-unit{width:100%;min-height:38px;border:1px solid #cbd5e1;border-radius:.55rem;background:#fff;padding:.45rem .65rem;font-size:.78rem;color:#334155;outline:none}
      #master-list [data-master-row] .pbi-unit:focus{border-color:#3b82f6;box-shadow:0 0 0 2px #dbeafe}
      #master-list [data-master-row] .pbi-categories{display:flex;flex-wrap:wrap;gap:.45rem .75rem;min-height:38px;padding:.45rem .6rem;border:1px solid #cbd5e1;border-radius:.55rem;background:#fff}
      #master-list [data-master-row] .pbi-category{display:inline-flex;align-items:center;gap:.35rem;font-size:.76rem;font-weight:700;color:#475569;cursor:pointer;white-space:nowrap}
      #master-list [data-master-row] .pbi-hint{font-size:.72rem;color:#94a3b8;align-self:center}
      #master-list [data-master-row] [data-person-category-summary]{display:none!important}
      #master-list [data-master-row] [data-edit-person-categories]{display:none!important}
      #inline-person-name-modal{z-index:220}
      @media(max-width:800px){#master-list [data-master-row] .pbi-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function rowSignature(person) {
    const unitSig = enabledUnits().map(u => `${u.id}:${u.name}`).join('|');
    const catSig = enabledCategories().map(c => `${c.id}:${c.name}`).join('|');
    const assignedSig = assignedIds(person.id).sort().join(',');
    return `${person.name}|${person.unitId || ''}|${unitSig}|${catSig}|${assignedSig}`;
  }

  function renderPeopleRows(force = false) {
    if (rendering || !isPeopleTab()) return;
    rendering = true;
    try {
      refreshCaches();
      document.querySelectorAll('#master-list [data-master-row]').forEach(row => {
        const personId = String(row.dataset.masterRow || '');
        const person = personById(personId);
        if (!person) return;
        const info = row.children?.[0];
        const actions = row.children?.[2];
        if (!info) return;

        const signature = rowSignature(person);
        let editor = info.querySelector('[data-pbi-editor]');
        if (!editor) {
          editor = document.createElement('div');
          editor.dataset.pbiEditor = '1';
          editor.className = 'pbi-editor';
          info.appendChild(editor);
        }

        if (force || editor.dataset.signature !== signature) {
          const selected = new Set(assignedIds(personId));
          editor.dataset.signature = signature;
          editor.innerHTML = `
            <div class="pbi-grid">
              <div>
                <span class="pbi-label">預設單位</span>
                <select class="pbi-unit" data-pbi-unit="${esc(personId)}">
                  <option value="">未指定</option>
                  ${enabledUnits().map(u => `<option value="${esc(u.id)}" ${String(u.id) === String(person.unitId || '') ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
                </select>
              </div>
              <div>
                <span class="pbi-label">人員類別（可複選）</span>
                <div class="pbi-categories">
                  ${enabledCategories().length
                    ? enabledCategories().map(c => `<label class="pbi-category"><input type="checkbox" class="accent-blue-600" data-pbi-category="${esc(c.id)}" data-person-id="${esc(personId)}" ${selected.has(String(c.id)) ? 'checked' : ''}>${esc(c.name)}</label>`).join('')
                    : '<span class="pbi-hint">尚未建立人員類別，請先至「人員類別」分頁新增。</span>'}
                  ${enabledCategories().length && selected.size === 0 ? '<span class="pbi-hint">目前：未分類</span>' : ''}
                </div>
              </div>
            </div>`;
        }

        if (actions) {
          const categoryButton = actions.querySelector('[data-edit-person-categories]');
          if (categoryButton) categoryButton.style.display = 'none';

          const buttons = [...actions.querySelectorAll('button')];
          const modify = buttons.find(b => norm(b.textContent) === '修改' || norm(b.textContent) === '改名');
          if (modify && !modify.dataset.pbiRename) {
            modify.dataset.pbiRename = personId;
            modify.textContent = '改名';
            modify.removeAttribute('onclick');
            modify.title = '修改人員姓名';
          }
        }
      });
    } finally {
      rendering = false;
    }
  }

  function openRenameModal(personId) {
    refreshCaches();
    const person = personById(personId);
    if (!person) return alert('找不到人員資料，請重新整理後再試');
    document.getElementById('inline-person-name-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'inline-person-name-modal';
    modal.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4';
    modal.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl w-[min(92vw,30rem)] overflow-hidden">
        <div class="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div>
            <div class="font-bold text-slate-800">修改人員姓名</div>
            <div class="text-xs text-slate-400 mt-1">單位與人員類別請直接在列表中修改。</div>
          </div>
          <button type="button" data-pbi-close class="text-slate-400 hover:text-slate-600 text-xl">✕</button>
        </div>
        <div class="p-6">
          <label class="block text-xs font-bold text-slate-400 mb-2">姓名</label>
          <input id="pbi-rename-input" type="text" value="${esc(person.name)}" class="w-full border border-slate-200 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div class="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button type="button" data-pbi-close class="px-5 py-2 text-sm font-bold text-slate-500">取消</button>
          <button type="button" data-pbi-save-name class="px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700">儲存</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const input = modal.querySelector('#pbi-rename-input');
    setTimeout(() => { input?.focus(); input?.select(); }, 0);

    modal.addEventListener('click', async e => {
      if (e.target === modal || e.target.closest('[data-pbi-close]')) {
        modal.remove();
        return;
      }
      if (e.target.closest('[data-pbi-save-name]')) {
        const name = norm(input?.value);
        if (!name) return alert('姓名不可空白');
        if (people().some(p => String(p.id) !== String(personId) && keyOf(p.name) === keyOf(name))) return alert('已有相同姓名');
        const save = e.target.closest('[data-pbi-save-name]');
        save.disabled = true;
        const ok = await updatePersonBasic(personId, { name });
        if (ok) modal.remove(); else save.disabled = false;
      }
    });

    input?.addEventListener('keydown', e => {
      if (e.key === 'Enter') modal.querySelector('[data-pbi-save-name]')?.click();
    });
  }

  function installEvents() {
    document.addEventListener('change', e => {
      const unit = e.target.closest('[data-pbi-unit]');
      if (unit) {
        updatePersonBasic(unit.dataset.pbiUnit, { unitId: unit.value || '' });
        return;
      }

      const category = e.target.closest('[data-pbi-category]');
      if (category) {
        const personId = String(category.dataset.personId || '');
        const row = category.closest('[data-master-row]');
        const ids = [...row.querySelectorAll('[data-pbi-category]:checked')].map(cb => cb.dataset.pbiCategory);
        updatePersonCategories(personId, ids);
      }
    });

    document.addEventListener('click', e => {
      const rename = e.target.closest('[data-pbi-rename]');
      if (!rename) return;
      e.preventDefault();
      e.stopPropagation();
      openRenameModal(rename.dataset.pbiRename);
    }, true);

    document.addEventListener('click', e => {
      if (e.target.closest('#master-tabs button')) setTimeout(() => renderPeopleRows(true), 0);
    });
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
      basicRef = firestoreApi.doc(window.__fb.db, BASIC_COLLECTION, BASIC_DOC_ID);
      metaRef = firestoreApi.doc(window.__fb.db, META_COLLECTION, META_DOC_ID);

      firestoreApi.onSnapshot(basicRef, snap => {
        if (!snap.exists()) return;
        const data = snap.data() || {};
        const latest = readJson(BASIC_CACHE_KEY, basic || {});
        const next = {
          ...latest,
          people: Array.isArray(data.people) ? data.people : latest.people,
          units: Array.isArray(data.units) ? data.units : latest.units
        };
        saveLocalBasic(next);
        renderPeopleRows(true);
      });

      firestoreApi.onSnapshot(metaRef, snap => {
        if (!snap.exists()) return;
        const data = snap.data() || {};
        meta = {
          version: data.version || 1,
          categories: Array.isArray(data.categories) ? data.categories : [],
          assignments: data.assignments && typeof data.assignments === 'object' ? data.assignments : {}
        };
        saveLocalMeta();
        renderPeopleRows(true);
      });
    } catch (err) {
      console.warn('Personnel inline Firestore unavailable', err);
    }
  }

  function startObserver() {
    const observer = new MutationObserver(() => {
      if (!rendering) requestAnimationFrame(() => renderPeopleRows(false));
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function boot() {
    injectStyles();
    refreshCaches();
    installEvents();
    startObserver();
    setupFirestore();
    renderPeopleRows(true);
    setInterval(() => renderPeopleRows(false), 1200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
