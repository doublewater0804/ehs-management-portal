/* EHS Task Personnel Management v6
 * Simplified model: Factory -> People.
 * Legacy group/category metadata is preserved but is no longer displayed or edited.
 */
(() => {
  'use strict';

  const BASIC_KEY = 'ESH_TASK_MASTER_DATA_V1';
  const META_KEY = 'ESH_TASK_PERSONNEL_META_V1';
  const TASK_KEY = 'ESH_MANAGEMENT_DATA_V86';
  const META_COLLECTION = 'ehs_task_personnel_meta';
  const META_DOC_ID = 'settings';

  const norm = value => String(value ?? '').trim().replace(/\s+/g, ' ');
  const keyOf = value => norm(value).toLocaleLowerCase('zh-Hant');
  const uid = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const esc = value => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');
  const readJson = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || 'null');
      return value && typeof value === 'object' ? value : fallback;
    } catch (_) {
      return fallback;
    }
  };

  function readBasic() {
    const value = readJson(BASIC_KEY, {});
    return {
      ...value,
      factories: Array.isArray(value.factories) ? value.factories : [],
      people: Array.isArray(value.people) ? value.people : [],
      units: Array.isArray(value.units) ? value.units : []
    };
  }

  function readMeta() {
    const value = readJson(META_KEY, {});
    return {
      ...value,
      version: Math.max(Number(value.version) || 0, 4),
      categories: Array.isArray(value.categories) ? value.categories : [],
      groups: Array.isArray(value.groups) ? value.groups : [],
      assignments: value.assignments && typeof value.assignments === 'object' ? value.assignments : {},
      profiles: value.profiles && typeof value.profiles === 'object' ? value.profiles : {}
    };
  }

  let basic = readBasic();
  let meta = readMeta();
  let selectedFactoryId = '';
  let showArchived = false;
  let customMode = '';
  let selectedOwners = new Set();
  let firestoreApi = null;
  let basicRef = null;
  let metaRef = null;
  let firestoreStarted = false;

  const factories = () => basic.factories || [];
  const people = () => basic.people || [];
  const activeFactories = () => factories().filter(item => item?.enabled !== false);
  const factoryById = id => factories().find(item => String(item.id) === String(id));
  const factoryByName = name => factories().find(item => keyOf(item.name) === keyOf(name));
  const personById = id => people().find(item => String(item.id) === String(id));
  const profileOf = id => {
    const current = meta.profiles[String(id)] || {};
    return {
      ...current,
      factoryId: String(current.factoryId || ''),
      groupId: String(current.groupId || ''),
      archived: current.archived === true,
      archivedAt: String(current.archivedAt || '')
    };
  };
  const splitNames = value => [...new Set(String(value || '')
    .split(/[、,，;；\n]+/).map(norm).filter(Boolean))];

  function saveLocal() {
    localStorage.setItem(BASIC_KEY, JSON.stringify(basic));
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  }

  function setSync(text, ok = true) {
    const el = document.getElementById('master-sync-state');
    if (!el) return;
    el.textContent = text;
    el.className = ok
      ? 'text-[11px] font-bold text-emerald-600'
      : 'text-[11px] font-bold text-amber-600';
  }

  async function savePeopleRemote() {
    saveLocal();
    if (!firestoreApi || !basicRef) return;
    try {
      setSync('儲存中…');
      await firestoreApi.setDoc(basicRef, {
        people: basic.people,
        _updatedTs: firestoreApi.serverTimestamp()
      }, { merge: true });
      setSync('雲端已儲存');
    } catch (error) {
      console.warn('People sync failed', error);
      setSync('雲端儲存失敗', false);
    }
  }

  async function saveMetaRemote() {
    saveLocal();
    if (!firestoreApi || !metaRef) return;
    try {
      setSync('儲存中…');
      await firestoreApi.setDoc(metaRef, {
        ...meta,
        _updatedTs: firestoreApi.serverTimestamp()
      }, { merge: false });
      setSync('雲端已儲存');
    } catch (error) {
      console.warn('Personnel metadata sync failed', error);
      setSync('雲端儲存失敗', false);
    }
  }

  function assignMissingFactories() {
    const tasks = readJson(TASK_KEY, []);
    let changed = false;
    people().forEach(person => {
      const id = String(person.id || uid('md'));
      if (!person.id) person.id = id;
      if (meta.profiles[id] && typeof meta.profiles[id] === 'object') return;
      const current = profileOf(id);
      const related = (Array.isArray(tasks) ? tasks : []).find(task =>
        splitNames(task?.owner).some(name => keyOf(name) === keyOf(person.name))
      );
      const factory = related ? factoryByName(related.factory) : null;
      meta.profiles[id] = {
        ...current,
        factoryId: String(factory?.id || ''),
        archived: current.archived || person.enabled === false,
        archivedAt: current.archivedAt || (person.enabled === false ? new Date().toISOString() : '')
      };
      changed = true;
    });
    if (changed) saveLocal();
    return changed;
  }

  function injectStyle() {
    if (document.getElementById('pm-v6-style')) return;
    const style = document.createElement('style');
    style.id = 'pm-v6-style';
    style.textContent = `
      #pm-v3-host .pm-card{border:1px solid #e2e8f0;border-radius:12px;background:#fff;padding:14px}
      #pm-v3-host .pm-label{display:block;font-size:10px;font-weight:900;color:#94a3b8;margin-bottom:6px}
      #pm-v3-host .pm-input,#pm-v3-host .pm-select{width:100%;min-height:40px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;padding:8px 10px;font-size:13px;color:#334155;outline:none}
      #pm-v3-host .pm-row{display:grid;grid-template-columns:minmax(180px,1fr) minmax(220px,1fr) auto;gap:12px;padding:14px;border-top:1px solid #f1f5f9;align-items:end}
      #pm-v3-host .pm-row:first-child{border-top:0}
      #pm-v3-host .archived{background:#f8fafc;opacity:.78}
      #handler-select-dropdown label{display:flex;align-items:center;gap:.6rem;padding:.65rem .7rem;border-radius:.55rem;cursor:pointer;color:#334155;font-size:.82rem;font-weight:700}
      #handler-select-dropdown label:hover{background:#eff6ff}
      #handler-select-dropdown input{width:1rem;height:1rem;accent-color:#2563eb}
      @media(max-width:720px){#pm-v3-host .pm-row{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensureTabs() {
    const tabs = document.getElementById('master-tabs');
    if (!tabs) return;
    [...tabs.querySelectorAll('button')].forEach(button => {
      const label = norm(button.textContent);
      if (['組別', '單位', '人員類別', '機能別'].includes(label)) {
        button.remove();
      } else if (label === '人員') {
        button.textContent = '人員管理';
      }
    });
    document.getElementById('pm-person-category-tab')?.remove();
  }

  function setTabActive(label) {
    const tabs = document.getElementById('master-tabs');
    if (!tabs) return;
    [...tabs.querySelectorAll('button')].forEach(button => {
      const active = norm(button.textContent) === label;
      button.classList.toggle('text-blue-600', active);
      button.classList.toggle('border-blue-600', active);
      button.classList.toggle('bg-blue-50/60', active);
      button.classList.toggle('text-slate-500', !active);
      button.classList.toggle('border-transparent', !active);
    });
  }

  function masterBody() {
    return {
      table: document.getElementById('master-standard-list'),
      addRow: document.getElementById('master-standard-add'),
      host: document.getElementById('pm-v3-host')
    };
  }

  function openCustom() {
    const { table, addRow, host } = masterBody();
    if (!host) return null;
    addRow?.classList.add('hidden');
    table?.classList.add('hidden');
    host.classList.remove('hidden');
    setTabActive('人員管理');
    return host;
  }

  function closeCustom() {
    const { table, addRow, host } = masterBody();
    if (host) {
      host.innerHTML = '';
      host.classList.add('hidden');
    }
    addRow?.classList.remove('hidden');
    table?.classList.remove('hidden');
  }

  function ensureFactorySelection() {
    const active = activeFactories();
    const hasUnassigned = people().some(person => !profileOf(person.id).factoryId);
    if (selectedFactoryId === '__unassigned__' && hasUnassigned) return;
    if (active.some(factory => String(factory.id) === String(selectedFactoryId))) return;
    selectedFactoryId = String(active[0]?.id || (hasUnassigned ? '__unassigned__' : ''));
  }

  function factoryOptions(selected, includeUnassigned = false) {
    const hasUnassigned = people().some(person => !profileOf(person.id).factoryId);
    const unassigned = includeUnassigned && hasUnassigned
      ? `<option value="__unassigned__" ${selected === '__unassigned__' ? 'selected' : ''}>未指定廠區</option>`
      : '';
    return unassigned + activeFactories().map(factory =>
      `<option value="${esc(factory.id)}" ${String(factory.id) === String(selected) ? 'selected' : ''}>${esc(factory.name)}</option>`
    ).join('');
  }

  function renderPeople() {
    customMode = 'people';
    basic = readBasic();
    meta = readMeta();
    assignMissingFactories();
    ensureFactorySelection();
    const host = openCustom();
    if (!host) return;
    const unassignedMode = selectedFactoryId === '__unassigned__';
    const list = people().filter(person => {
      const profile = profileOf(person.id);
      const factoryMatch = unassignedMode
        ? !profile.factoryId
        : String(profile.factoryId) === String(selectedFactoryId);
      return factoryMatch && (showArchived || !profile.archived);
    });
    host.innerHTML = `
      <div class="space-y-4">
        <div class="pm-card flex flex-col md:flex-row justify-between gap-3 md:items-end">
          <div class="min-w-[240px]"><label class="pm-label">選擇廠區</label><select id="pm-factory" class="pm-select">${factoryOptions(selectedFactoryId, true)}</select></div>
          <label class="inline-flex items-center gap-2 text-sm font-bold text-slate-600 pb-2"><input id="pm-show-archived" type="checkbox" class="accent-blue-600" ${showArchived ? 'checked' : ''}>顯示已刪除／離職人員</label>
        </div>
        ${unassignedMode ? '<div class="pm-card text-sm text-amber-700 bg-amber-50 border-amber-200">請先替舊人員指定廠區。</div>' : `
        <div class="pm-card">
          <div class="font-bold text-slate-800 mb-3">新增人員｜${esc(factoryById(selectedFactoryId)?.name || '')}</div>
          <div class="flex flex-col md:flex-row gap-3 md:items-end">
            <div class="flex-1"><label class="pm-label">姓名</label><input id="pm-new-name" class="pm-input" placeholder="輸入姓名"></div>
            <button id="pm-add-person" type="button" class="px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg">＋ 新增人員</button>
          </div>
        </div>`}
        <div class="pm-card p-0 overflow-hidden">
          <div class="px-4 py-3 bg-slate-50 border-b flex justify-between"><span class="font-bold text-slate-700">人員清單</span><span class="text-xs text-slate-400">${list.length} 人</span></div>
          ${list.length ? list.map(person => {
            const profile = profileOf(person.id);
            return `<div class="pm-row ${profile.archived ? 'archived' : ''}">
              <div><label class="pm-label">姓名</label><input class="pm-input" data-pm-name="${esc(person.id)}" value="${esc(person.name)}"><div class="mt-2 text-[11px] font-bold ${profile.archived ? 'text-slate-500' : 'text-emerald-600'}">${profile.archived ? '已刪除／離職' : '在職'}</div></div>
              <div><label class="pm-label">廠區</label><select class="pm-select" data-pm-factory="${esc(person.id)}"><option value="">未指定</option>${factoryOptions(profile.factoryId, false)}</select></div>
              <div>${profile.archived
                ? `<button type="button" data-pm-restore="${esc(person.id)}" class="px-3 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg">恢復</button>`
                : `<button type="button" data-pm-delete="${esc(person.id)}" class="px-3 py-2 text-xs font-bold text-red-600 bg-red-50 rounded-lg">刪除／離職</button>`}</div>
            </div>`;
          }).join('') : '<div class="p-8 text-center text-sm text-slate-400">此廠區目前沒有符合條件的人員。</div>'}
        </div>
      </div>`;
  }

  async function addPerson() {
    const name = norm(document.getElementById('pm-new-name')?.value);
    if (!name) return alert('請輸入姓名');
    if (people().some(person => keyOf(person.name) === keyOf(name))) return alert('已有相同姓名');
    if (!selectedFactoryId || selectedFactoryId === '__unassigned__') return alert('請先選擇廠區');
    const id = uid('md');
    basic.people.push({ id, name, enabled: true, protected: false, unitId: '' });
    meta.profiles[id] = { factoryId: String(selectedFactoryId), groupId: '', archived: false, archivedAt: '' };
    meta.assignments[id] ||= [];
    await Promise.all([savePeopleRemote(), saveMetaRemote()]);
    renderPeople();
  }

  async function archivePerson(id) {
    const person = personById(id);
    if (!person) return;
    if (!confirm(`確定將「${person.name}」刪除／標記離職？\n歷史工作紀錄中的姓名仍會保留。`)) return;
    meta.profiles[String(id)] = {
      ...profileOf(id),
      archived: true,
      archivedAt: new Date().toISOString()
    };
    await saveMetaRemote();
    renderPeople();
  }

  async function restorePerson(id) {
    meta.profiles[String(id)] = { ...profileOf(id), archived: false, archivedAt: '' };
    await saveMetaRemote();
    renderPeople();
  }

  function eligiblePeople() {
    const factory = factoryByName(document.getElementById('f-factory')?.value);
    if (!factory) return [];
    return people().filter(person => {
      const profile = profileOf(person.id);
      return !profile.archived && person.enabled !== false && String(profile.factoryId) === String(factory.id);
    });
  }

  function syncOwnerInput() {
    const input = document.getElementById('f-owner');
    if (input) input.value = [...selectedOwners].join('、');
  }

  function renderHandlerSelector() {
    const dropdown = document.getElementById('handler-select-dropdown');
    const text = document.getElementById('handler-select-text');
    if (!dropdown || !text) return;
    const available = eligiblePeople();
    const availableKeys = new Set(available.map(person => keyOf(person.name)));
    const historical = [...selectedOwners].filter(name => !availableKeys.has(keyOf(name)));
    text.textContent = selectedOwners.size ? [...selectedOwners].join('、') : '請選擇經辦人員';
    text.classList.toggle('text-slate-400', !selectedOwners.size);
    text.classList.toggle('text-slate-700', selectedOwners.size > 0);
    const rows = available.map(person =>
      `<label><input type="checkbox" data-handler-person="${esc(person.name)}" ${selectedOwners.has(person.name) ? 'checked' : ''}><span>${esc(person.name)}</span></label>`
    );
    historical.forEach(name => rows.push(
      `<label><input type="checkbox" data-handler-person="${esc(name)}" checked><span>${esc(name)} <span class="text-[10px] text-amber-600">（歷史保留）</span></span></label>`
    ));
    dropdown.innerHTML = rows.length
      ? rows.join('')
      : '<div class="px-3 py-4 text-xs text-slate-400">此廠區目前沒有可選人員，請先至基本資料管理新增。</div>';
    const readOnly = document.getElementById('btn-modal-save')?.classList.contains('hidden');
    dropdown.querySelectorAll('input').forEach(input => { input.disabled = !!readOnly; });
  }

  function hydrateTaskModal() {
    basic = readBasic();
    meta = readMeta();
    selectedOwners = new Set(splitNames(document.getElementById('f-owner')?.value));
    renderHandlerSelector();
    const readOnly = document.getElementById('btn-modal-save')?.classList.contains('hidden');
    const button = document.getElementById('handler-select-button');
    if (button) button.disabled = !!readOnly;
  }

  async function setupFirestore() {
    if (firestoreStarted || !window.__fb?.db || !window.__fb?.auth?.currentUser) return;
    firestoreStarted = true;
    try {
      firestoreApi = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
      basicRef = firestoreApi.doc(window.__fb.db, 'ehs_task_master_data', 'settings');
      metaRef = firestoreApi.doc(window.__fb.db, META_COLLECTION, META_DOC_ID);
      firestoreApi.onSnapshot(basicRef, snapshot => {
        if (!snapshot.exists()) return;
        const data = snapshot.data() || {};
        basic = {
          ...basic,
          ...data,
          factories: Array.isArray(data.factories) ? data.factories : basic.factories,
          people: Array.isArray(data.people) ? data.people : basic.people,
          units: Array.isArray(data.units) ? data.units : basic.units
        };
        saveLocal();
        if (customMode === 'people') renderPeople();
        renderHandlerSelector();
      }, error => console.warn('People snapshot failed', error));
      firestoreApi.onSnapshot(metaRef, snapshot => {
        if (!snapshot.exists()) {
          saveMetaRemote();
          return;
        }
        const data = snapshot.data() || {};
        meta = {
          ...meta,
          ...data,
          categories: Array.isArray(data.categories) ? data.categories : meta.categories,
          groups: Array.isArray(data.groups) ? data.groups : meta.groups,
          assignments: data.assignments && typeof data.assignments === 'object' ? data.assignments : meta.assignments,
          profiles: data.profiles && typeof data.profiles === 'object' ? data.profiles : meta.profiles
        };
        const inferred = assignMissingFactories();
        saveLocal();
        if (inferred) saveMetaRemote();
        if (customMode === 'people') renderPeople();
        renderHandlerSelector();
      }, error => console.warn('Personnel snapshot failed', error));
    } catch (error) {
      firestoreStarted = false;
      console.warn('Personnel Firestore unavailable', error);
    }
  }

  function bindEvents() {
    document.addEventListener('click', event => {
      const target = event.target;
      const tab = target.closest?.('#master-tabs button');
      if (tab) {
        if (norm(tab.textContent) === '人員管理') {
          event.preventDefault();
          event.stopImmediatePropagation();
          renderPeople();
          return;
        }
        customMode = '';
        closeCustom();
      }
      if (target.id === 'pm-add-person') { addPerson(); return; }
      if (target.dataset?.pmDelete) { archivePerson(target.dataset.pmDelete); return; }
      if (target.dataset?.pmRestore) { restorePerson(target.dataset.pmRestore); return; }
      if (target.id === 'handler-select-button' || target.closest?.('#handler-select-button')) {
        const dropdown = document.getElementById('handler-select-dropdown');
        if (!dropdown || document.getElementById('handler-select-button')?.disabled) return;
        renderHandlerSelector();
        dropdown.classList.toggle('hidden');
        return;
      }
      if (!target.closest?.('#handler-field')) {
        document.getElementById('handler-select-dropdown')?.classList.add('hidden');
      }
      if (target.id === 'btn-basic-data') setTimeout(ensureTabs, 0);
    }, true);

    document.addEventListener('change', event => {
      const target = event.target;
      if (target.id === 'pm-factory') {
        selectedFactoryId = String(target.value);
        renderPeople();
        return;
      }
      if (target.id === 'pm-show-archived') {
        showArchived = !!target.checked;
        renderPeople();
        return;
      }
      if (target.dataset?.pmName) {
        const person = personById(target.dataset.pmName);
        const name = norm(target.value);
        if (!person || !name) return;
        if (people().some(item => item.id !== person.id && keyOf(item.name) === keyOf(name))) {
          alert('已有相同姓名');
          target.value = person.name;
          return;
        }
        person.name = name;
        savePeopleRemote();
        return;
      }
      if (target.dataset?.pmFactory) {
        const id = String(target.dataset.pmFactory);
        meta.profiles[id] = { ...profileOf(id), factoryId: String(target.value || '') };
        saveMetaRemote().then(renderPeople);
        return;
      }
      if (target.dataset?.handlerPerson) {
        const name = String(target.dataset.handlerPerson);
        if (target.checked) selectedOwners.add(name);
        else selectedOwners.delete(name);
        syncOwnerInput();
        renderHandlerSelector();
        return;
      }
      if (target.id === 'f-factory') {
        selectedOwners.clear();
        syncOwnerInput();
        renderHandlerSelector();
      }
    });
  }

  function observeModal() {
    const modal = document.getElementById('modal');
    if (!modal || modal.dataset.pm6Observed) return;
    modal.dataset.pm6Observed = '1';
    new MutationObserver(() => {
      if (!modal.classList.contains('hidden')) setTimeout(hydrateTaskModal, 0);
      else document.getElementById('handler-select-dropdown')?.classList.add('hidden');
    }).observe(modal, { attributes: true, attributeFilter: ['class'] });
  }

  function waitForAuthenticatedFirebase() {
    const timer = setInterval(() => {
      if (!window.__fb?.auth?.currentUser) return;
      clearInterval(timer);
      setupFirestore();
    }, 250);
  }

  function boot() {
    injectStyle();
    basic = readBasic();
    meta = readMeta();
    assignMissingFactories();
    ensureTabs();
    bindEvents();
    observeModal();
    hydrateTaskModal();
    if (window.__fb?.auth?.currentUser) setupFirestore();
    else waitForAuthenticatedFirebase();
  }

  window.__ehsPersonnelManagement = {
    renderPeople,
    closeCustom,
    refreshTaskForm: hydrateTaskModal
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
