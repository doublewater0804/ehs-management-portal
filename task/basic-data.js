/* EHS Task Basic Data Management v1.2
 * Centralized maintenance for factory, category, source, people, group and progress type.
 * Personnel/group relationships are enhanced by personnel-assignment.js.
 * Firestore-first with localStorage fallback. Historical task strings are preserved.
 */
(() => {
  'use strict';

  const CACHE_KEY = 'ESH_TASK_MASTER_DATA_V1';
  const MASTER_COLLECTION = 'ehs_task_master_data';
  const MASTER_DOC_ID = 'settings';

  const DEFAULTS = {
    factories: ['台北', '龍德', '彰化', '麥寮', '新港', '海外'],
    categories: ['PSM', '工安', '環保', '消防', 'AI', '庶務', '其他'],
    sources: ['NOTES', '速報表', '開會通知單', '環保通報單', '蓋用印申請單', '外來文', '主管交辦', '報告', '業洽函', '層峰指示', '法規要求', '全企業工安環保通報', '專案工作', '其他'],
    progressTypes: ['工作日報', '電話確認', 'Notes', '公文', '會議', '現場確認', '待辦事項', '主管指示', '其他']
  };

  const TABS = [
    { key: 'factories', label: '廠區', singular: '廠區' },
    { key: 'categories', label: '工作類別', singular: '工作類別' },
    { key: 'sources', label: '來源', singular: '來源' },
    { key: 'people', label: '人員管理', singular: '人員' },
    { key: 'units', label: '組別', singular: '組別' },
    { key: 'progressTypes', label: '進度類型', singular: '進度類型' }
  ];

  let master = null;
  let activeTab = 'factories';
  let remoteReady = false;
  let firestoreApi = null;
  let firestoreDocRef = null;
  let suppressRemoteApply = false;

  const esc = (s) => String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');
  const keyOf = (s) => norm(s).toLocaleLowerCase('zh-Hant');
  const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  function loadTaskSnapshot() {
    try {
      const raw = localStorage.getItem('ESH_MANAGEMENT_DATA_V86') || localStorage.getItem('ESH_MANAGEMENT_DATA_V86__BACKUP') || '[]';
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function item(name, options = {}) {
    return {
      id: options.id || uid('md'),
      name: norm(name),
      enabled: options.enabled !== false,
      protected: options.protected === true,
      unitId: options.unitId || ''
    };
  }

  function uniqueNames(values) {
    const seen = new Set();
    const out = [];
    values.forEach(v => {
      const n = norm(v);
      const k = keyOf(n);
      if (!n || seen.has(k)) return;
      seen.add(k);
      out.push(n);
    });
    return out;
  }

  function makeInitialMaster() {
    const tasks = loadTaskSnapshot();
    const taskFactories = tasks.map(t => t?.factory);
    const taskCategories = tasks.map(t => String(t?.category || '').startsWith('其他:') ? '其他' : t?.category);
    const taskSources = tasks.map(t => String(t?.source || '').replace(/^其他[:：]\s*/, ''));
    const taskUnits = tasks.map(t => t?.unit);
    const taskPeople = tasks.flatMap(t => [t?.owner, ...(Array.isArray(t?.progressLogs) ? t.progressLogs.map(l => l?.person) : [])]);
    const taskProgressTypes = tasks.flatMap(t => Array.isArray(t?.progressLogs) ? t.progressLogs.map(l => l?.type) : []);

    const factories = uniqueNames([...DEFAULTS.factories, ...taskFactories]).map(n => item(n));
    const categories = uniqueNames([...DEFAULTS.categories, ...taskCategories]).map(n => item(n, { protected: n === '其他' }));
    const sources = uniqueNames([...DEFAULTS.sources, ...taskSources]).map(n => item(n, { protected: n === '其他' }));
    const units = uniqueNames(taskUnits).map(n => item(n));

    const unitByName = new Map(units.map(u => [keyOf(u.name), u]));
    const ownerUnitCounts = {};
    tasks.forEach(t => {
      const owner = norm(t?.owner);
      const unit = norm(t?.unit);
      if (!owner || !unit) return;
      ownerUnitCounts[owner] ||= {};
      ownerUnitCounts[owner][unit] = (ownerUnitCounts[owner][unit] || 0) + 1;
    });
    const ownerPreferredUnit = {};
    Object.entries(ownerUnitCounts).forEach(([owner, counts]) => {
      ownerPreferredUnit[owner] = Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-Hant'))[0]?.[0] || '';
    });

    const people = uniqueNames(taskPeople).map(n => {
      const preferred = ownerPreferredUnit[n] || '';
      return item(n, { unitId: unitByName.get(keyOf(preferred))?.id || '' });
    });

    const progressTypes = uniqueNames([...DEFAULTS.progressTypes, ...taskProgressTypes])
      .map(n => item(n, { protected: n === '其他' }));

    return { version: 1, factories, categories, sources, people, units, progressTypes };
  }

  function sanitizeList(list, type) {
    const isProtectedType = ['categories', 'sources', 'progressTypes'].includes(type);
    const out = [];
    const seen = new Set();
    (Array.isArray(list) ? list : []).forEach((raw) => {
      const name = norm(raw?.name ?? raw);
      const k = keyOf(name);
      if (!name || seen.has(k)) return;
      seen.add(k);
      out.push({
        id: String(raw?.id || uid('md')),
        name,
        enabled: raw?.enabled !== false,
        protected: isProtectedType && name === '其他' ? true : raw?.protected === true,
        unitId: type === 'people' ? String(raw?.unitId || '') : ''
      });
    });
    if (isProtectedType && !seen.has(keyOf('其他'))) out.push(item('其他', { protected: true }));
    return out;
  }

  function sanitizeMaster(value) {
    const fallback = makeInitialMaster();
    const out = { version: 1 };
    TABS.forEach(tab => {
      const source = value?.[tab.key];
      out[tab.key] = sanitizeList(source && source.length ? source : fallback[tab.key], tab.key);
    });
    return out;
  }

  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      master = raw ? sanitizeMaster(JSON.parse(raw)) : makeInitialMaster();
    } catch (_) {
      master = makeInitialMaster();
    }
    saveCache();
  }

  function saveCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(master)); } catch (_) {}
  }

  function getList(type) { return Array.isArray(master?.[type]) ? master[type] : []; }
  function enabledNames(type) { return getList(type).filter(x => x.enabled).map(x => x.name); }
  function findByName(type, name) { return getList(type).find(x => keyOf(x.name) === keyOf(name)); }
  function findUnitName(unitId) { return getList('units').find(x => x.id === unitId)?.name || ''; }

  function collectHistorical(type) {
    const tasks = loadTaskSnapshot();
    if (type === 'factories') return uniqueNames(tasks.map(t => t?.factory));
    if (type === 'categories') return uniqueNames(tasks.map(t => t?.category).filter(Boolean));
    if (type === 'sources') return uniqueNames(tasks.map(t => t?.source).filter(Boolean).map(v => String(v).replace(/^其他[:：]\s*/, '')));
    if (type === 'people') return uniqueNames(tasks.flatMap(t => [t?.owner, ...(Array.isArray(t?.progressLogs) ? t.progressLogs.map(l => l?.person) : [])]));
    if (type === 'units') return uniqueNames(tasks.map(t => t?.unit));
    if (type === 'progressTypes') return uniqueNames(tasks.flatMap(t => Array.isArray(t?.progressLogs) ? t.progressLogs.map(l => l?.type) : []));
    return [];
  }

  function setSelectOptions(el, values, opts = {}) {
    if (!el) return;
    const current = opts.current !== undefined ? String(opts.current ?? '') : String(el.value || '');
    const historicalCurrent = norm(opts.historicalCurrent ?? current);
    el.innerHTML = '';
    if (opts.allLabel) {
      const op = document.createElement('option'); op.value = 'all'; op.textContent = opts.allLabel; el.appendChild(op);
    }
    const seen = new Set();
    values.forEach(v => {
      const n = norm(v); const k = keyOf(n); if (!n || seen.has(k)) return; seen.add(k);
      const op = document.createElement('option'); op.value = n; op.textContent = n; el.appendChild(op);
    });
    if (historicalCurrent && historicalCurrent !== 'all' && !seen.has(keyOf(historicalCurrent))) {
      const op = document.createElement('option'); op.value = historicalCurrent; op.textContent = `${historicalCurrent}（已停用/歷史）`; el.appendChild(op);
    }
    const wanted = current || (opts.defaultValue ?? '');
    const options = [...el.options].map(o => o.value);
    if (options.includes(wanted)) el.value = wanted;
    else if (opts.defaultValue && options.includes(opts.defaultValue)) el.value = opts.defaultValue;
    else if (opts.allLabel) el.value = 'all';
    else if (el.options.length) el.selectedIndex = 0;
  }

  function setDatalist(id, values) {
    const dl = document.getElementById(id);
    if (!dl) return;
    dl.innerHTML = '';
    uniqueNames(values).forEach(v => {
      const o = document.createElement('option'); o.value = v; dl.appendChild(o);
    });
  }

  function activeCategoryNames() {
    const names = enabledNames('categories').filter(x => x !== '其他');
    return [...names, '其他'];
  }
  function activeSourceNames() {
    const names = enabledNames('sources').filter(x => x !== '其他');
    return [...names, '其他'];
  }
  function activeProgressTypeNames() {
    const names = enabledNames('progressTypes').filter(x => x !== '其他');
    return [...names, '其他'];
  }

  function applyFormOptions() {
    const factory = document.getElementById('f-factory');
    setSelectOptions(factory, enabledNames('factories'), { current: factory?.value, historicalCurrent: factory?.value, defaultValue: '台北' });

    const cat = document.getElementById('f-category');
    setSelectOptions(cat, activeCategoryNames(), { current: cat?.value, historicalCurrent: cat?.value, defaultValue: '工安' });
    if (cat && typeof window.toggleOtherCategory === 'function') window.toggleOtherCategory(cat.value);

    const src = document.getElementById('f-source');
    setSelectOptions(src, activeSourceNames(), { current: src?.value, historicalCurrent: src?.value, defaultValue: 'NOTES' });
    if (src && typeof window.toggleOtherSource === 'function') window.toggleOtherSource(src.value);

    const ptype = document.getElementById('f-log-type');
    setSelectOptions(ptype, activeProgressTypeNames(), { current: ptype?.value, historicalCurrent: ptype?.value, defaultValue: '工作日報' });
    if (ptype && typeof window.toggleOtherProgressType === 'function') window.toggleOtherProgressType(ptype.value);

    const taskSnapshot = loadTaskSnapshot();
    setDatalist('owner-options', [...enabledNames('people'), ...taskSnapshot.map(t => t?.owner)]);
    setDatalist('progress-person-options', [
      ...enabledNames('people'),
      ...taskSnapshot.map(t => t?.owner),
      ...taskSnapshot.flatMap(t => Array.isArray(t?.progressLogs) ? t.progressLogs.map(l => l?.person) : [])
    ]);
  }

  function patchUnitDropdown() {
    if (typeof window.getAllUnitOptions === 'function' && !window.__basicDataOriginalGetAllUnitOptions) {
      window.__basicDataOriginalGetAllUnitOptions = window.getAllUnitOptions;
      window.getAllUnitOptions = function(suggestedUnit = '') {
        const hist = collectHistorical('units');
        const values = uniqueNames([suggestedUnit, ...enabledNames('units'), ...hist]);
        if (!values.includes('其他:')) values.unshift('其他:');
        return values;
      };
    }
  }

  function patchOwnerAutoUnit() {
    if (typeof window.handleOwnerInput === 'function' && !window.__basicDataOriginalHandleOwnerInput) {
      window.__basicDataOriginalHandleOwnerInput = window.handleOwnerInput;
      window.handleOwnerInput = function(ownerValue) {
        const owner = norm(ownerValue);
        const ownerItem = findByName('people', owner);
        const unitName = ownerItem?.enabled ? findUnitName(ownerItem.unitId) : '';
        const unitInput = document.getElementById('f-unit');
        if (unitName && unitInput) {
          unitInput.value = unitName;
          if (typeof window.hideUnitDropdown === 'function') window.hideUnitDropdown();
          return;
        }
        return window.__basicDataOriginalHandleOwnerInput(ownerValue);
      };
    }
  }

  function applyFilterOptions() {
    const tasksNow = loadTaskSnapshot();
    const fFactory = document.getElementById('filter-factory');
    setSelectOptions(fFactory, uniqueNames([...enabledNames('factories'), ...tasksNow.map(t => t?.factory)]), {
      current: fFactory?.value, allLabel: '所有廠區'
    });

    const fCat = document.getElementById('filter-category');
    const historicalCats = uniqueNames(tasksNow.map(t => t?.category).filter(Boolean).map(v => String(v).startsWith('其他:') ? '其他' : v));
    setSelectOptions(fCat, uniqueNames([...activeCategoryNames(), ...historicalCats]), {
      current: fCat?.value, allLabel: '所有類別'
    });

    const fOwner = document.getElementById('filter-owner');
    setSelectOptions(fOwner, uniqueNames([...enabledNames('people'), ...tasksNow.flatMap(t => String(t?.owner || '').split(/[、,，;；\n]+/))]), {
      current: fOwner?.value, allLabel: '所有經辦人員'
    });

    const fSource = document.getElementById('filter-source');
    const histSrc = tasksNow.map(t => String(t?.source || '').replace(/^其他[:：]\s*/, '')).filter(Boolean);
    setSelectOptions(fSource, uniqueNames([...activeSourceNames(), ...histSrc]), {
      current: fSource?.value, allLabel: '所有來源'
    });
  }

  function applyEverywhere() {
    applyFormOptions();
    applyFilterOptions();
    patchUnitDropdown();
    patchOwnerAutoUnit();
    renderMasterList();
  }

  function injectButtonAndModal() {
    if (!document.getElementById('btn-basic-data')) {
      const headerActions = document.querySelector('nav .flex.space-x-2');
      if (headerActions) {
        const btn = document.createElement('button');
        btn.id = 'btn-basic-data';
        btn.type = 'button';
        btn.className = 'flex items-center bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition text-xs font-bold';
        btn.innerHTML = '<span class="mr-1">⚙️</span> 基本資料管理';
        btn.addEventListener('click', openMasterModal);
        headerActions.insertBefore(btn, headerActions.firstChild);
      }
    }

    if (document.getElementById('master-data-modal')) return;
    const wrap = document.createElement('div');
    wrap.id = 'master-data-modal';
    wrap.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm hidden items-center justify-center z-[140] p-4 no-print';
    wrap.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl w-[min(95vw,78rem)] max-h-[90vh] overflow-hidden flex flex-col">
        <div class="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
          <div>
            <h4 class="font-bold text-slate-800 text-lg">基本資料管理</h4>
            <p class="text-xs text-slate-400 mt-1">維護工作管理模組共用選項；人員依廠區集中管理。</p>
          </div>
          <div class="flex items-center gap-3">
            <span id="master-sync-state" class="text-[11px] font-bold text-slate-400">載入中…</span>
            <button type="button" id="btn-master-close-x" class="text-slate-400 hover:text-slate-600 text-xl">✕</button>
          </div>
        </div>
        <div class="px-6 pt-4 border-b border-slate-100 bg-white overflow-x-auto">
          <div id="master-tabs" class="flex gap-2 min-w-max"></div>
        </div>
        <div id="master-data-content" class="p-6 flex-1 overflow-y-auto custom-scrollbar">
          <div id="master-standard-add" class="flex flex-col md:flex-row gap-3 mb-5">
            <div class="flex-1">
              <label class="block text-xs font-bold text-slate-400 uppercase mb-2" id="master-new-label">新增</label>
              <input id="master-new-name" type="text" class="w-full border border-slate-200 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" placeholder="輸入名稱" />
            </div>
            <div id="master-person-unit-wrap" class="hidden flex-1">
              <label class="block text-xs font-bold text-slate-400 uppercase mb-2">預設組別</label>
              <select id="master-new-unit" class="w-full border border-slate-200 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"></select>
            </div>
            <div class="flex items-end">
              <button type="button" id="btn-master-add" class="px-5 py-3 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 shadow">＋ 新增</button>
            </div>
          </div>
          <div id="master-standard-list" class="border border-slate-200 rounded-xl overflow-hidden">
            <div class="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 px-4 py-3 bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-400 uppercase">
              <div>名稱 / 設定</div><div>狀態 / 排序</div><div>操作</div>
            </div>
            <div id="master-list" class="divide-y divide-slate-100"></div>
          </div>
          <div id="pm-v3-host" class="hidden"></div>
          <div class="mt-4 text-xs text-slate-400 leading-relaxed">
            說明：歷史工作紀錄不會因基本資料重新命名、停用或人員離職而被改寫。
          </div>
        </div>
        <div class="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
          <span class="text-xs text-slate-400">人員刪除採離職封存，不影響歷史工作紀錄。</span>
          <button type="button" id="btn-master-close" class="px-6 py-2 bg-slate-700 text-white text-sm font-bold rounded-lg hover:bg-slate-800">完成</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);

    document.getElementById('btn-master-close')?.addEventListener('click', closeMasterModal);
    document.getElementById('btn-master-close-x')?.addEventListener('click', closeMasterModal);
    document.getElementById('btn-master-add')?.addEventListener('click', addMasterItem);
    document.getElementById('master-new-name')?.addEventListener('keydown', e => { if (e.key === 'Enter') addMasterItem(); });
    wrap.addEventListener('mousedown', e => { if (e.target === wrap) closeMasterModal(); });
    renderTabs();
  }

  function renderTabs() {
    const host = document.getElementById('master-tabs');
    if (!host) return;
    host.innerHTML = '';
    TABS.filter(tab => tab.key !== 'units').forEach(tab => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `px-4 py-2.5 rounded-t-lg text-sm font-bold border-b-2 transition ${activeTab === tab.key ? 'text-blue-600 border-blue-600 bg-blue-50/60' : 'text-slate-500 border-transparent hover:text-slate-700'}`;
      b.textContent = tab.label;
      b.addEventListener('click', () => {
        activeTab = tab.key;
        renderTabs();
        const personnel = window.__ehsPersonnelManagement;
        if (tab.key === 'people' && personnel?.renderPeople) {
          personnel.renderPeople();
          return;
        }
        if (tab.key === 'units' && personnel?.renderGroups) {
          personnel.renderGroups();
          return;
        }
        personnel?.closeCustom?.();
        renderMasterList();
      });
      host.appendChild(b);
    });
  }

  function renderPersonUnitSelect(selected = '') {
    const sel = document.getElementById('master-new-unit');
    if (!sel) return;
    sel.innerHTML = '<option value="">未指定</option>';
    getList('units').filter(u => u.enabled).forEach(u => {
      const o = document.createElement('option'); o.value = u.id; o.textContent = u.name; sel.appendChild(o);
    });
    sel.value = [...sel.options].some(o => o.value === selected) ? selected : '';
  }

  function renderMasterList() {
    const host = document.getElementById('master-list');
    if (!host || !master) return;
    const tab = TABS.find(t => t.key === activeTab) || TABS[0];
    const label = document.getElementById('master-new-label');
    if (label) label.textContent = `新增${tab.singular}`;
    const input = document.getElementById('master-new-name');
    if (input) input.placeholder = `輸入${tab.singular}名稱`;
    const personUnitWrap = document.getElementById('master-person-unit-wrap');
    personUnitWrap?.classList.toggle('hidden', activeTab !== 'people');
    if (activeTab === 'people') renderPersonUnitSelect('');

    const list = getList(activeTab);
    if (!list.length) {
      host.innerHTML = '<div class="p-6 text-center text-sm text-slate-400">目前沒有資料</div>';
      return;
    }

    host.innerHTML = list.map((x, index) => {
      const unitText = activeTab === 'people' ? findUnitName(x.unitId) : '';
      return `
        <div class="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 items-center px-4 py-3 ${x.enabled ? 'bg-white' : 'bg-slate-50 opacity-70'}" data-master-row="${esc(x.id)}">
          <div class="min-w-0">
            <div class="font-bold text-sm text-slate-700 truncate">${esc(x.name)} ${x.protected ? '<span class="text-[10px] text-indigo-500 ml-1">系統保留</span>' : ''}</div>
            ${activeTab === 'people' ? `<div class="text-[11px] text-slate-400 mt-0.5">預設組別：${esc(unitText || '未指定')}</div>` : ''}
          </div>
          <div class="flex items-center gap-1">
            <span class="text-[11px] font-bold px-2 py-1 rounded-full ${x.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-500'}">${x.enabled ? '啟用' : '停用'}</span>
            <button type="button" class="px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded" onclick="window.__masterMove('${esc(activeTab)}','${esc(x.id)}',-1)" ${index === 0 ? 'disabled' : ''}>↑</button>
            <button type="button" class="px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded" onclick="window.__masterMove('${esc(activeTab)}','${esc(x.id)}',1)" ${index === list.length - 1 ? 'disabled' : ''}>↓</button>
          </div>
          <div class="flex items-center justify-end gap-1">
            <button type="button" class="px-2.5 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded" onclick="window.__masterEdit('${esc(activeTab)}','${esc(x.id)}')" ${x.protected ? 'disabled title="系統保留項目不可改名"' : ''}>修改</button>
            <button type="button" class="px-2.5 py-1.5 text-xs font-bold ${x.enabled ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'} rounded" onclick="window.__masterToggle('${esc(activeTab)}','${esc(x.id)}')" ${x.protected ? 'disabled title="系統保留項目不可停用"' : ''}>${x.enabled ? '停用' : '啟用'}</button>
          </div>
        </div>`;
    }).join('');
  }

  function openMasterModal() {
    injectButtonAndModal();
    renderTabs(); renderMasterList();
    const m = document.getElementById('master-data-modal');
    m?.classList.remove('hidden'); m?.classList.add('flex');
  }

  function closeMasterModal() {
    const m = document.getElementById('master-data-modal');
    m?.classList.add('hidden'); m?.classList.remove('flex');
    applyEverywhere();
    if (typeof window.renderAll === 'function') window.renderAll();
  }

  async function addMasterItem() {
    const input = document.getElementById('master-new-name');
    const name = norm(input?.value);
    if (!name) return alert('請輸入名稱');
    if (findByName(activeTab, name)) return alert('已有相同名稱');
    if (name === '其他' && !['categories', 'sources', 'progressTypes'].includes(activeTab)) return alert('此名稱保留給系統選項使用');
    const unitId = activeTab === 'people' ? (document.getElementById('master-new-unit')?.value || '') : '';
    getList(activeTab).push(item(name, { protected: ['categories', 'sources', 'progressTypes'].includes(activeTab) && name === '其他', unitId }));
    if (input) input.value = '';
    saveCache(); renderMasterList(); applyEverywhere(); await saveRemote();
  }

  window.__masterMove = async (type, id, delta) => {
    const list = getList(type);
    const idx = list.findIndex(x => x.id === id);
    const next = idx + Number(delta);
    if (idx < 0 || next < 0 || next >= list.length) return;
    [list[idx], list[next]] = [list[next], list[idx]];
    saveCache(); renderMasterList(); applyEverywhere(); await saveRemote();
  };

  window.__masterToggle = async (type, id) => {
    const x = getList(type).find(v => v.id === id);
    if (!x || x.protected) return;
    x.enabled = !x.enabled;
    saveCache(); renderMasterList(); applyEverywhere(); await saveRemote();
  };

  window.__masterEdit = async (type, id) => {
    const x = getList(type).find(v => v.id === id);
    if (!x || x.protected) return;
    const next = prompt(`修改「${x.name}」`, x.name);
    if (next === null) return;
    const name = norm(next);
    if (!name) return alert('名稱不可空白');
    if (name === '其他') return alert('「其他」為系統保留項目');
    const duplicate = getList(type).some(v => v.id !== id && keyOf(v.name) === keyOf(name));
    if (duplicate) return alert('已有相同名稱');

    let unitId = x.unitId || '';
    if (type === 'people') {
      const units = getList('units').filter(u => u.enabled);
      const currentUnit = findUnitName(x.unitId);
      const answer = prompt(`舊版相容欄位：設定「${name}」的預設組別名稱。\n新的人員廠區/組別關聯請直接在人員管理畫面設定。`, currentUnit || '');
      if (answer !== null) {
        const matched = units.find(u => keyOf(u.name) === keyOf(answer));
        unitId = matched?.id || '';
      }
    }

    x.name = name;
    x.unitId = unitId;
    saveCache(); renderMasterList(); applyEverywhere(); await saveRemote();
  };

  function setSyncLabel(text, ok = true) {
    const el = document.getElementById('master-sync-state');
    if (!el) return;
    el.textContent = text;
    el.className = ok ? 'text-[11px] font-bold text-emerald-600' : 'text-[11px] font-bold text-amber-600';
  }

  async function setupFirestore() {
    try {
      const db = window.__fb?.db;
      if (!db) throw new Error('Firebase 尚未初始化');
      firestoreApi = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
      const { doc, onSnapshot, setDoc, serverTimestamp } = firestoreApi;
      firestoreDocRef = doc(db, MASTER_COLLECTION, MASTER_DOC_ID);
      onSnapshot(firestoreDocRef, async snap => {
        if (!snap.exists()) {
          setSyncLabel('建立雲端基本資料…', true);
          await setDoc(firestoreDocRef, { ...master, _updatedTs: serverTimestamp() }, { merge: false });
          return;
        }
        if (suppressRemoteApply) return;
        master = sanitizeMaster(snap.data());
        saveCache(); remoteReady = true;
        setSyncLabel('雲端已同步', true);
        applyEverywhere();
      }, err => {
        console.warn('Basic data Firestore sync failed', err);
        remoteReady = false;
        setSyncLabel('使用本機資料', false);
      });
    } catch (err) {
      console.warn('Basic data Firestore unavailable', err);
      remoteReady = false;
      setSyncLabel('使用本機資料', false);
    }
  }

  async function saveRemote() {
    saveCache();
    if (!firestoreDocRef || !firestoreApi) {
      setSyncLabel('已儲存本機；等待雲端', false);
      return;
    }
    try {
      suppressRemoteApply = true;
      setSyncLabel('儲存中…', true);
      await firestoreApi.setDoc(firestoreDocRef, { ...master, _updatedTs: firestoreApi.serverTimestamp() }, { merge: false });
      remoteReady = true;
      setSyncLabel('雲端已儲存', true);
    } catch (err) {
      console.warn('Basic data save failed', err);
      remoteReady = false;
      setSyncLabel('雲端失敗，已保留本機', false);
    } finally {
      setTimeout(() => { suppressRemoteApply = false; }, 300);
    }
  }

  function installWrappers() {
    if (typeof window.updateFilters === 'function' && !window.__basicDataOriginalUpdateFilters) {
      window.__basicDataOriginalUpdateFilters = window.updateFilters;
      window.updateFilters = function(...args) {
        const result = window.__basicDataOriginalUpdateFilters.apply(this, args);
        applyFilterOptions(); applyFormOptions();
        return result;
      };
    }

    if (typeof window.updateOwnerUnitOptions === 'function' && !window.__basicDataOriginalUpdateOwnerUnitOptions) {
      window.__basicDataOriginalUpdateOwnerUnitOptions = window.updateOwnerUnitOptions;
      window.updateOwnerUnitOptions = function(...args) {
        const result = window.__basicDataOriginalUpdateOwnerUnitOptions.apply(this, args);
        const tasksNow = loadTaskSnapshot();
        setDatalist('owner-options', [...enabledNames('people'), ...tasksNow.map(t => t?.owner)]);
        setDatalist('progress-person-options', [
          ...enabledNames('people'), ...tasksNow.map(t => t?.owner),
          ...tasksNow.flatMap(t => Array.isArray(t?.progressLogs) ? t.progressLogs.map(l => l?.person) : [])
        ]);
        return result;
      };
    }

    if (typeof window.updateSourceOptions === 'function' && !window.__basicDataOriginalUpdateSourceOptions) {
      window.__basicDataOriginalUpdateSourceOptions = window.updateSourceOptions;
      window.updateSourceOptions = function(preferredSource, preferredFilter) {
        const src = document.getElementById('f-source');
        const filter = document.getElementById('filter-source');
        setSelectOptions(src, activeSourceNames(), {
          current: preferredSource !== undefined ? preferredSource : src?.value,
          historicalCurrent: preferredSource !== undefined ? preferredSource : src?.value,
          defaultValue: 'NOTES'
        });
        setSelectOptions(filter, uniqueNames([...activeSourceNames(), ...collectHistorical('sources')]), {
          current: preferredFilter !== undefined ? preferredFilter : filter?.value,
          allLabel: '所有來源'
        });
        if (src && typeof window.toggleOtherSource === 'function') window.toggleOtherSource(src.value);
      };
    }

    if (typeof window.updateProgressTypeOptions === 'function' && !window.__basicDataOriginalUpdateProgressTypeOptions) {
      window.__basicDataOriginalUpdateProgressTypeOptions = window.updateProgressTypeOptions;
      window.updateProgressTypeOptions = function(preferredType) {
        const el = document.getElementById('f-log-type');
        const wanted = preferredType !== undefined ? preferredType : el?.value;
        setSelectOptions(el, activeProgressTypeNames(), {
          current: wanted, historicalCurrent: wanted, defaultValue: '工作日報'
        });
        if (el && typeof window.toggleOtherProgressType === 'function') window.toggleOtherProgressType(el.value);
      };
    }

    if (typeof window.editTask === 'function' && !window.__basicDataOriginalEditTask) {
      window.__basicDataOriginalEditTask = window.editTask;
      window.editTask = function(id) {
        const result = window.__basicDataOriginalEditTask(id);
        setTimeout(() => applyFormOptions(), 0);
        return result;
      };
    }
  }

  function boot() {
    loadCache();
    injectButtonAndModal();
    installWrappers();
    patchUnitDropdown();
    patchOwnerAutoUnit();
    applyEverywhere();

    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      if (window.__fb?.db && window.__fb?.auth?.currentUser) {
        clearInterval(timer);
        setupFirestore();
      } else if (tries >= 1200) {
        clearInterval(timer);
        setSyncLabel('等待 Firebase 登入…', false);
      }
    }, 250);

    document.getElementById('btn-add')?.addEventListener('click', () => setTimeout(() => applyFormOptions(), 0));
    document.getElementById('f-owner')?.addEventListener('change', e => {
      const p = findByName('people', e.target.value);
      if (!p?.enabled) return;
      const unitName = findUnitName(p.unitId);
      if (unitName) document.getElementById('f-unit').value = unitName;
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
