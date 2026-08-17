/* EHS Task Personnel Management v2
 * Hierarchy: 廠區 -> 組別 -> 人員 -> 人員類別(可複選)
 * - 人員管理集中在同一畫面，以廠區篩選。
 * - 同名組別可存在於不同廠區。
 * - 人員僅有「刪除/離職」(soft archive) 與「恢復」，歷史工作資料不改寫。
 * - 新增/編輯工作：廠區 -> 組別 -> 人員類別 -> 負責人複選。
 */
(() => {
  'use strict';

  const BASIC_CACHE_KEY = 'ESH_TASK_MASTER_DATA_V1';
  const META_CACHE_KEY = 'ESH_TASK_PERSONNEL_META_V1';
  const BASIC_COLLECTION = 'ehs_task_master_data';
  const BASIC_DOC_ID = 'settings';
  const META_COLLECTION = 'ehs_task_personnel_meta';
  const META_DOC_ID = 'settings';
  const TASK_CACHE_KEY = 'ESH_MANAGEMENT_DATA_V86';

  let basic = loadBasic();
  let meta = loadMeta();
  let firestoreApi = null;
  let basicRef = null;
  let metaRef = null;
  let customMode = '';
  let selectedFactoryId = '';
  let showArchived = false;
  let activePersonnelCategoryId = '';
  let selectedPersonIds = new Set();
  let manualOwnerText = '';
  let lastWorkFactory = '';
  let lastWorkGroup = '';
  let rendering = false;
  let migrationDone = false;

  const norm = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');
  const keyOf = (s) => norm(s).toLocaleLowerCase('zh-Hant');
  const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const esc = (s) => String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  function safeJson(raw, fallback) {
    try { const v = JSON.parse(raw || 'null'); return v && typeof v === 'object' ? v : fallback; }
    catch (_) { return fallback; }
  }

  function loadBasic() {
    const v = safeJson(localStorage.getItem(BASIC_CACHE_KEY), {});
    return {
      ...v,
      factories: Array.isArray(v.factories) ? v.factories : [],
      people: Array.isArray(v.people) ? v.people : [],
      units: Array.isArray(v.units) ? v.units : []
    };
  }

  function normalizeMeta(v) {
    const categories = [];
    const categorySeen = new Set();
    (Array.isArray(v?.categories) ? v.categories : []).forEach(raw => {
      const name = norm(raw?.name);
      if (!name || categorySeen.has(keyOf(name))) return;
      categorySeen.add(keyOf(name));
      categories.push({ id: String(raw?.id || uid('pc')), name, enabled: raw?.enabled !== false });
    });

    const groups = [];
    const groupSeen = new Set();
    (Array.isArray(v?.groups) ? v.groups : []).forEach(raw => {
      const name = norm(raw?.name);
      const factoryId = String(raw?.factoryId || '');
      if (!name || !factoryId) return;
      const k = `${factoryId}|${keyOf(name)}`;
      if (groupSeen.has(k)) return;
      groupSeen.add(k);
      groups.push({ id: String(raw?.id || uid('grp')), factoryId, name, enabled: raw?.enabled !== false });
    });

    const assignments = {};
    if (v?.assignments && typeof v.assignments === 'object') {
      Object.entries(v.assignments).forEach(([personId, ids]) => {
        assignments[String(personId)] = [...new Set((Array.isArray(ids) ? ids : []).map(String))];
      });
    }

    const profiles = {};
    if (v?.profiles && typeof v.profiles === 'object') {
      Object.entries(v.profiles).forEach(([personId, p]) => {
        profiles[String(personId)] = {
          factoryId: String(p?.factoryId || ''),
          groupId: String(p?.groupId || ''),
          archived: p?.archived === true,
          archivedAt: String(p?.archivedAt || '')
        };
      });
    }

    return { version: 2, categories, groups, assignments, profiles };
  }

  function loadMeta() {
    return normalizeMeta(safeJson(localStorage.getItem(META_CACHE_KEY), {}));
  }

  function saveBasicLocal() {
    try { localStorage.setItem(BASIC_CACHE_KEY, JSON.stringify(basic)); } catch (_) {}
  }

  function saveMetaLocal() {
    try { localStorage.setItem(META_CACHE_KEY, JSON.stringify(meta)); } catch (_) {}
  }

  function refreshLocal() {
    basic = loadBasic();
    meta = loadMeta();
  }

  function taskSnapshot() {
    const arr = safeJson(localStorage.getItem(TASK_CACHE_KEY), []);
    return Array.isArray(arr) ? arr : [];
  }

  const factories = () => basic.factories || [];
  const people = () => basic.people || [];
  const categories = () => meta.categories || [];
  const groups = () => meta.groups || [];
  const enabledFactories = () => factories().filter(x => x?.enabled !== false);
  const enabledCategories = () => categories().filter(x => x?.enabled !== false);
  const personById = (id) => people().find(p => String(p.id) === String(id));
  const factoryById = (id) => factories().find(f => String(f.id) === String(id));
  const factoryByName = (name) => factories().find(f => keyOf(f.name) === keyOf(name));
  const groupById = (id) => groups().find(g => String(g.id) === String(id));
  const categoryById = (id) => categories().find(c => String(c.id) === String(id));
  const profileOf = (personId) => meta.profiles[String(personId)] || { factoryId:'', groupId:'', archived:false, archivedAt:'' };
  const assignedCategoryIds = (personId) => [...new Set((meta.assignments[String(personId)] || []).map(String))];
  const enabledAssignedCategoryIds = (personId) => assignedCategoryIds(personId).filter(id => categoryById(id)?.enabled !== false);

  function groupsForFactory(factoryId, includeDisabled = false) {
    return groups().filter(g => String(g.factoryId) === String(factoryId) && (includeDisabled || g.enabled !== false));
  }

  function groupByFactoryAndName(factoryId, name) {
    return groups().find(g => String(g.factoryId) === String(factoryId) && keyOf(g.name) === keyOf(name));
  }

  function peopleForFactory(factoryId, includeArchived = false) {
    return people().filter(p => {
      const pr = profileOf(p.id);
      return String(pr.factoryId) === String(factoryId) && (includeArchived || !pr.archived);
    });
  }

  function peopleForFactoryGroup(factoryId, groupId) {
    return people().filter(p => {
      const pr = profileOf(p.id);
      return !pr.archived && String(pr.factoryId) === String(factoryId) && String(pr.groupId) === String(groupId);
    });
  }

  function setSync(text, ok = true) {
    const el = document.getElementById('master-sync-state');
    if (!el) return;
    el.textContent = text;
    el.className = ok ? 'text-[11px] font-bold text-emerald-600' : 'text-[11px] font-bold text-amber-600';
  }

  async function saveMeta() {
    saveMetaLocal();
    renderCustomView();
    renderWorkAssignment();
    if (!firestoreApi || !metaRef) return;
    try {
      setSync('儲存中…', true);
      await firestoreApi.setDoc(metaRef, { ...meta, _updatedTs: firestoreApi.serverTimestamp() }, { merge: false });
      setSync('雲端已儲存', true);
    } catch (err) {
      console.warn('Personnel meta save failed', err);
      setSync('雲端失敗，已保留本機', false);
    }
  }

  async function savePeople() {
    saveBasicLocal();
    renderCustomView();
    if (!firestoreApi || !basicRef) return;
    try {
      setSync('儲存中…', true);
      await firestoreApi.setDoc(basicRef, { people: basic.people, _updatedTs: firestoreApi.serverTimestamp() }, { merge: true });
      setSync('雲端已儲存', true);
    } catch (err) {
      console.warn('Personnel basic save failed', err);
      setSync('雲端失敗，已保留本機', false);
    }
  }

  function migrateLegacy() {
    if (migrationDone) return;
    migrationDone = true;
    let changed = false;
    const tasks = taskSnapshot();

    const factoryUsageByPerson = {};
    const groupUsageByPerson = {};
    const groupPairs = new Map();

    tasks.forEach(t => {
      const factoryName = norm(t?.factory);
      const groupName = norm(t?.unit);
      const f = factoryByName(factoryName);
      if (f && groupName) {
        const k = `${f.id}|${keyOf(groupName)}`;
        if (!groupPairs.has(k)) groupPairs.set(k, { factoryId:String(f.id), name:groupName, count:0 });
        groupPairs.get(k).count++;
      }

      const ownerNames = String(t?.owner || '').split(/[、,，;；\n]+/).map(norm).filter(Boolean);
      ownerNames.forEach(ownerName => {
        const person = people().find(p => keyOf(p.name) === keyOf(ownerName));
        if (!person || !f) return;
        factoryUsageByPerson[person.id] ||= {};
        factoryUsageByPerson[person.id][f.id] = (factoryUsageByPerson[person.id][f.id] || 0) + 1;
        if (groupName) {
          groupUsageByPerson[person.id] ||= {};
          const gk = `${f.id}|${keyOf(groupName)}`;
          groupUsageByPerson[person.id][gk] = (groupUsageByPerson[person.id][gk] || 0) + 1;
        }
      });
    });

    groupPairs.forEach(pair => {
      if (!groupByFactoryAndName(pair.factoryId, pair.name)) {
        meta.groups.push({ id:uid('grp'), factoryId:pair.factoryId, name:pair.name, enabled:true });
        changed = true;
      }
    });

    people().forEach(p => {
      const id = String(p.id);
      if (!meta.profiles[id]) {
        let factoryId = '';
        let groupId = '';
        const fCounts = factoryUsageByPerson[id] || {};
        const bestFactory = Object.entries(fCounts).sort((a,b) => b[1]-a[1])[0];
        if (bestFactory) factoryId = String(bestFactory[0]);

        const gCounts = groupUsageByPerson[id] || {};
        const bestGroupKey = Object.entries(gCounts).sort((a,b) => b[1]-a[1])[0]?.[0];
        if (bestGroupKey) {
          const [fid, ...nameParts] = bestGroupKey.split('|');
          const lowerName = nameParts.join('|');
          const g = groups().find(x => String(x.factoryId) === String(fid) && keyOf(x.name) === lowerName);
          if (g) { factoryId = String(fid); groupId = String(g.id); }
        }

        if (!groupId && p.unitId) {
          const oldUnit = (basic.units || []).find(u => String(u.id) === String(p.unitId));
          if (oldUnit && factoryId) {
            let g = groupByFactoryAndName(factoryId, oldUnit.name);
            if (!g) {
              g = { id:uid('grp'), factoryId, name:norm(oldUnit.name), enabled:true };
              meta.groups.push(g);
            }
            groupId = String(g.id);
          }
        }

        meta.profiles[id] = {
          factoryId,
          groupId,
          archived: p.enabled === false,
          archivedAt: p.enabled === false ? new Date().toISOString() : ''
        };
        changed = true;
      }
    });

    if (changed) saveMetaLocal();
  }

  function injectStyles() {
    if (document.getElementById('personnel-management-v2-style')) return;
    const style = document.createElement('style');
    style.id = 'personnel-management-v2-style';
    style.textContent = `
      #pm-custom-view .pm-card{border:1px solid #e2e8f0;border-radius:12px;background:#fff;padding:14px}
      #pm-custom-view .pm-grid{display:grid;gap:12px;grid-template-columns:minmax(180px,1fr) minmax(180px,1fr) minmax(280px,2fr) auto;align-items:end}
      #pm-custom-view .pm-label{display:block;font-size:10px;font-weight:900;color:#94a3b8;text-transform:uppercase;margin-bottom:6px}
      #pm-custom-view .pm-input,#pm-custom-view .pm-select{width:100%;min-height:42px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;padding:8px 10px;font-size:13px;color:#334155;outline:none}
      #pm-custom-view .pm-input:focus,#pm-custom-view .pm-select:focus{border-color:#3b82f6;box-shadow:0 0 0 2px #dbeafe}
      #pm-custom-view .pm-cats{min-height:42px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;padding:8px 10px;display:flex;flex-wrap:wrap;gap:8px 14px}
      #pm-custom-view .pm-cat{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;color:#475569;cursor:pointer;white-space:nowrap}
      #pm-custom-view .pm-person-row{display:grid;grid-template-columns:minmax(120px,180px) minmax(160px,210px) minmax(300px,1fr) auto;gap:12px;align-items:start;padding:14px;border-top:1px solid #f1f5f9}
      #pm-custom-view .pm-person-row:first-child{border-top:0}
      #pm-custom-view .pm-archived{background:#f8fafc;opacity:.78}
      #pm-custom-view .pm-status{display:inline-flex;border-radius:999px;padding:3px 8px;font-size:10px;font-weight:900}
      #pm-custom-view .pm-status.active{background:#ecfdf5;color:#047857}
      #pm-custom-view .pm-status.archived{background:#f1f5f9;color:#64748b}
      #personnel-assignment-panel .pa-category-btn{border:1px solid #cbd5e1;background:#fff;color:#475569;border-radius:.65rem;padding:.5rem .8rem;font-size:.78rem;font-weight:800;transition:.15s}
      #personnel-assignment-panel .pa-category-btn:hover{background:#f8fafc;border-color:#94a3b8}
      #personnel-assignment-panel .pa-category-btn.active{background:#eff6ff;border-color:#3b82f6;color:#1d4ed8;box-shadow:0 0 0 1px #bfdbfe inset}
      #personnel-assignment-panel .pa-person{display:flex;align-items:center;gap:.55rem;border:1px solid #e2e8f0;background:#fff;border-radius:.65rem;padding:.65rem .8rem;cursor:pointer}
      #personnel-assignment-panel .pa-chip{display:inline-flex;align-items:center;gap:.35rem;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:999px;padding:.25rem .55rem;font-size:.72rem;font-weight:800}
      @media(max-width:900px){#pm-custom-view .pm-grid{grid-template-columns:1fr}#pm-custom-view .pm-person-row{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function relabelUi() {
    const tabs = document.getElementById('master-tabs');
    if (tabs) {
      [...tabs.querySelectorAll('button')].forEach(btn => {
        const text = norm(btn.textContent);
        if (text === '人員') btn.textContent = '人員管理';
        if (text === '單位') btn.textContent = '組別';
      });
    }

    const unit = document.getElementById('f-unit');
    const filterUnit = document.getElementById('filter-unit');
    [unit, filterUnit].forEach(el => {
      const label = el?.closest('div')?.querySelector('label');
      if (label && /單位/.test(label.textContent)) label.textContent = label.textContent.replace('單位','組別');
    });
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
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        customMode = 'categories';
        markCustomTab(btn);
        renderCustomView();
      });
      tabs.appendChild(btn);
    }
  }

  function markCustomTab(target) {
    const tabs = document.getElementById('master-tabs');
    if (!tabs) return;
    [...tabs.querySelectorAll('button')].forEach(b => {
      const active = b === target;
      b.classList.toggle('text-blue-600', active);
      b.classList.toggle('border-blue-600', active);
      b.classList.toggle('bg-blue-50/60', active);
      b.classList.toggle('text-slate-500', !active);
      b.classList.toggle('border-transparent', !active);
    });
  }

  function masterBodyPieces() {
    const input = document.getElementById('master-new-name');
    const addRow = input?.closest('.flex.flex-col.md\\:flex-row');
    const list = document.getElementById('master-list');
    const table = list?.parentElement;
    const body = addRow?.parentElement || table?.parentElement;
    return { addRow, table, body };
  }

  function showOriginalMaster() {
    const { addRow, table, body } = masterBodyPieces();
    addRow?.classList.remove('hidden');
    table?.classList.remove('hidden');
    if (body) [...body.children].forEach(ch => { if (ch.id === 'pm-custom-view') ch.remove(); });
  }

  function customHost() {
    const { addRow, table, body } = masterBodyPieces();
    if (!body) return null;
    addRow?.classList.add('hidden');
    table?.classList.add('hidden');
    let host = document.getElementById('pm-custom-view');
    if (!host) {
      host = document.createElement('div');
      host.id = 'pm-custom-view';
      body.insertBefore(host, addRow || body.firstChild);
    }
    return host;
  }

  function factoryOptions(selected, includeUnassigned = false) {
    const opts = enabledFactories().map(f => `<option value="${esc(f.id)}" ${String(f.id)===String(selected)?'selected':''}>${esc(f.name)}</option>`).join('');
    return `${includeUnassigned ? `<option value="__unassigned__" ${selected==='__unassigned__'?'selected':''}>未指定廠區</option>` : ''}${opts}`;
  }

  function categoryCheckboxHtml(personId, selectedIds) {
    const set = new Set(selectedIds.map(String));
    if (!enabledCategories().length) return '<span class="text-xs text-slate-400">尚未建立人員類別</span>';
    return enabledCategories().map(c => `<label class="pm-cat"><input type="checkbox" class="accent-blue-600" data-pm-person-cat="${esc(c.id)}" data-person-id="${esc(personId)}" ${set.has(String(c.id))?'checked':''}>${esc(c.name)}</label>`).join('');
  }

  function ensureSelectedFactory() {
    const active = enabledFactories();
    const hasUnassigned = people().some(p => !profileOf(p.id).factoryId);
    if (selectedFactoryId === '__unassigned__' && hasUnassigned) return;
    if (active.some(f => String(f.id) === String(selectedFactoryId))) return;
    selectedFactoryId = active[0]?.id ? String(active[0].id) : (hasUnassigned ? '__unassigned__' : '');
  }

  function renderPeopleManagement() {
    ensureSelectedFactory();
    const host = customHost();
    if (!host) return;
    const isUnassigned = selectedFactoryId === '__unassigned__';
    const hasUnassigned = people().some(p => !profileOf(p.id).factoryId);
    const factoryPeople = people().filter(p => {
      const pr = profileOf(p.id);
      const match = isUnassigned ? !pr.factoryId : String(pr.factoryId) === String(selectedFactoryId);
      return match && (showArchived || !pr.archived);
    }).sort((a,b) => {
      const ga = groupById(profileOf(a.id).groupId)?.name || '';
      const gb = groupById(profileOf(b.id).groupId)?.name || '';
      return ga.localeCompare(gb,'zh-Hant') || String(a.name).localeCompare(String(b.name),'zh-Hant');
    });

    const activeGroups = isUnassigned ? [] : groupsForFactory(selectedFactoryId, false);

    host.innerHTML = `
      <div class="space-y-4">
        <div class="pm-card bg-slate-50">
          <div class="flex flex-col md:flex-row md:items-end gap-3 justify-between">
            <div class="min-w-[240px]">
              <label class="pm-label">管理廠區</label>
              <select id="pm-factory-filter" class="pm-select">${factoryOptions(selectedFactoryId, hasUnassigned)}</select>
            </div>
            <label class="inline-flex items-center gap-2 text-sm font-bold text-slate-600 cursor-pointer pb-2"><input id="pm-show-archived" type="checkbox" class="accent-blue-600" ${showArchived?'checked':''}>顯示已刪除／離職人員</label>
          </div>
        </div>

        ${!isUnassigned ? `<div class="pm-card">
          <div class="flex flex-col md:flex-row gap-3 md:items-end">
            <div class="flex-1"><label class="pm-label">新增組別（${esc(factoryById(selectedFactoryId)?.name || '')}）</label><input id="pm-new-group" class="pm-input" placeholder="例如：工安組、環保組"></div>
            <button id="pm-add-group" type="button" class="px-5 py-2.5 bg-slate-700 text-white text-sm font-bold rounded-lg hover:bg-slate-800">＋ 新增組別</button>
          </div>
          ${activeGroups.length ? `<div class="mt-3 flex flex-wrap gap-2">${activeGroups.map(g => `<span class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">${esc(g.name)}<button type="button" data-pm-group-rename="${esc(g.id)}" class="text-blue-500">改名</button><button type="button" data-pm-group-toggle="${esc(g.id)}" class="text-amber-600">停用</button></span>`).join('')}</div>` : '<div class="mt-3 text-xs text-slate-400">此廠區尚未建立組別。</div>'}
        </div>` : `<div class="pm-card text-sm text-amber-700 bg-amber-50 border-amber-200">這裡是舊資料中尚未指定廠區的人員。請在下方人員列選擇廠區，完成歸屬。</div>`}

        ${!isUnassigned ? `<div class="pm-card">
          <div class="font-bold text-slate-800 mb-3">新增人員</div>
          <div class="pm-grid">
            <div><label class="pm-label">姓名</label><input id="pm-new-person" class="pm-input" placeholder="輸入姓名"></div>
            <div><label class="pm-label">組別</label><select id="pm-new-person-group" class="pm-select"><option value="">未指定組別</option>${activeGroups.map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('')}</select></div>
            <div><label class="pm-label">人員類別（可複選）</label><div class="pm-cats">${categoryCheckboxHtml('__new__',[])}</div></div>
            <button id="pm-add-person" type="button" class="px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700">＋ 新增人員</button>
          </div>
        </div>` : ''}

        <div class="pm-card p-0 overflow-hidden">
          <div class="px-4 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center"><div class="font-bold text-slate-700">${esc(isUnassigned ? '未指定廠區' : factoryById(selectedFactoryId)?.name || '')}｜人員</div><div class="text-xs text-slate-400">${factoryPeople.length} 人</div></div>
          <div id="pm-person-list">
            ${factoryPeople.length ? factoryPeople.map(p => {
              const pr = profileOf(p.id);
              const personGroups = pr.factoryId ? groupsForFactory(pr.factoryId, true) : [];
              const currentGroup = groupById(pr.groupId);
              return `<div class="pm-person-row ${pr.archived?'pm-archived':''}" data-pm-person="${esc(p.id)}">
                <div>
                  <div class="font-bold text-slate-800">${esc(p.name)}</div>
                  <div class="mt-1"><span class="pm-status ${pr.archived?'archived':'active'}">${pr.archived?'已刪除／離職':'在職'}</span></div>
                  <button type="button" data-pm-rename-person="${esc(p.id)}" class="mt-2 text-xs font-bold text-blue-600">改名</button>
                </div>
                <div>
                  <label class="pm-label">廠區</label>
                  <select class="pm-select mb-2" data-pm-person-factory="${esc(p.id)}"><option value="">未指定</option>${factoryOptions(pr.factoryId,false)}</select>
                  <label class="pm-label">組別</label>
                  <select class="pm-select" data-pm-person-group="${esc(p.id)}"><option value="">未指定組別</option>${personGroups.map(g => `<option value="${esc(g.id)}" ${String(g.id)===String(pr.groupId)?'selected':''}>${esc(g.name)}${g.enabled===false?'（已停用）':''}</option>`).join('')}${currentGroup && !personGroups.some(g=>g.id===currentGroup.id) ? `<option value="${esc(currentGroup.id)}" selected>${esc(currentGroup.name)}（歷史）</option>`:''}</select>
                </div>
                <div><label class="pm-label">人員類別（可複選）</label><div class="pm-cats">${categoryCheckboxHtml(p.id,assignedCategoryIds(p.id))}${!assignedCategoryIds(p.id).length?'<span class="text-xs text-slate-400">未分類</span>':''}</div></div>
                <div class="flex items-start justify-end">${pr.archived ? `<button type="button" data-pm-restore-person="${esc(p.id)}" class="px-3 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg hover:bg-emerald-100">恢復</button>` : `<button type="button" data-pm-archive-person="${esc(p.id)}" class="px-3 py-2 text-xs font-bold text-red-600 bg-red-50 rounded-lg hover:bg-red-100">刪除</button>`}</div>
              </div>`;
            }).join('') : '<div class="p-8 text-center text-sm text-slate-400">此廠區目前沒有符合條件的人員。</div>'}
          </div>
        </div>
      </div>`;
  }

  function renderGroupManagement() {
    ensureSelectedFactory();
    const host = customHost();
    if (!host) return;
    const activeFactoryId = selectedFactoryId === '__unassigned__' ? enabledFactories()[0]?.id || '' : selectedFactoryId;
    selectedFactoryId = activeFactoryId ? String(activeFactoryId) : '';
    const gs = groupsForFactory(selectedFactoryId, true);
    host.innerHTML = `
      <div class="space-y-4">
        <div class="pm-card"><div class="flex flex-col md:flex-row gap-3 md:items-end"><div class="min-w-[240px]"><label class="pm-label">廠區</label><select id="pm-group-factory" class="pm-select">${factoryOptions(selectedFactoryId,false)}</select></div><div class="flex-1"><label class="pm-label">新增組別</label><input id="pm-group-name" class="pm-input" placeholder="輸入組別名稱"></div><button id="pm-group-add" class="px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg">＋ 新增</button></div></div>
        <div class="pm-card p-0 overflow-hidden"><div class="px-4 py-3 bg-slate-50 border-b font-bold text-slate-700">${esc(factoryById(selectedFactoryId)?.name || '')}｜組別</div>${gs.length ? gs.map(g => `<div class="flex items-center gap-3 px-4 py-3 border-t first:border-t-0"><div class="flex-1 font-bold text-sm text-slate-700">${esc(g.name)}</div><span class="text-[11px] font-bold px-2 py-1 rounded-full ${g.enabled!==false?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-500'}">${g.enabled!==false?'啟用':'停用'}</span><button data-pm-group-rename="${esc(g.id)}" class="text-xs font-bold text-blue-600">改名</button><button data-pm-group-toggle="${esc(g.id)}" class="text-xs font-bold ${g.enabled!==false?'text-amber-600':'text-emerald-600'}">${g.enabled!==false?'停用':'啟用'}</button></div>`).join('') : '<div class="p-8 text-center text-sm text-slate-400">尚無組別。</div>'}</div>
      </div>`;
  }

  function renderCategoryManagement() {
    const host = customHost();
    if (!host) return;
    host.innerHTML = `
      <div class="space-y-4">
        <div class="pm-card"><div class="flex flex-col md:flex-row gap-3 md:items-end"><div class="flex-1"><label class="pm-label">新增人員類別</label><input id="pm-category-name" class="pm-input" placeholder="例如：工安、環保、消防、職安"></div><button id="pm-category-add" class="px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg">＋ 新增</button></div><div class="mt-2 text-xs text-slate-400">人員類別可複選；人員完全未勾選時自動歸入「未分類」。</div></div>
        <div class="pm-card p-0 overflow-hidden">${categories().length ? categories().map((c,i) => `<div class="flex items-center gap-3 px-4 py-3 border-t first:border-t-0"><div class="flex-1 font-bold text-sm text-slate-700">${esc(c.name)}</div><span class="text-[11px] font-bold px-2 py-1 rounded-full ${c.enabled!==false?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-500'}">${c.enabled!==false?'啟用':'停用'}</span><button data-pm-category-up="${esc(c.id)}" ${i===0?'disabled':''} class="text-xs px-2 py-1 border rounded disabled:opacity-30">↑</button><button data-pm-category-down="${esc(c.id)}" ${i===categories().length-1?'disabled':''} class="text-xs px-2 py-1 border rounded disabled:opacity-30">↓</button><button data-pm-category-rename="${esc(c.id)}" class="text-xs font-bold text-blue-600">改名</button><button data-pm-category-toggle="${esc(c.id)}" class="text-xs font-bold ${c.enabled!==false?'text-amber-600':'text-emerald-600'}">${c.enabled!==false?'停用':'啟用'}</button></div>`).join('') : '<div class="p-8 text-center text-sm text-slate-400">尚無人員類別。</div>'}</div>
      </div>`;
  }

  function renderCustomView() {
    if (!document.getElementById('master-data-modal') || document.getElementById('master-data-modal').classList.contains('hidden')) return;
    if (customMode === 'people') renderPeopleManagement();
    else if (customMode === 'groups') renderGroupManagement();
    else if (customMode === 'categories') renderCategoryManagement();
  }

  async function addGroup(factoryId, name) {
    name = norm(name);
    if (!factoryId || !name) return alert('請先選擇廠區並輸入組別名稱');
    if (groupByFactoryAndName(factoryId,name)) return alert('此廠區已有相同組別');
    meta.groups.push({ id:uid('grp'), factoryId:String(factoryId), name, enabled:true });
    await saveMeta();
  }

  async function renameGroup(id) {
    const g = groupById(id); if (!g) return;
    const next = prompt(`修改組別「${g.name}」`, g.name); if (next === null) return;
    const name = norm(next); if (!name) return alert('組別名稱不可空白');
    if (groups().some(x => x.id!==g.id && String(x.factoryId)===String(g.factoryId) && keyOf(x.name)===keyOf(name))) return alert('此廠區已有相同組別');
    g.name = name; await saveMeta();
  }

  async function toggleGroup(id) {
    const g = groupById(id); if (!g) return;
    g.enabled = g.enabled === false; await saveMeta();
  }

  async function addCategory(name) {
    name = norm(name); if (!name) return alert('請輸入人員類別名稱');
    if (name === '未分類') return alert('「未分類」為系統自動分類');
    if (categories().some(c => keyOf(c.name)===keyOf(name))) return alert('已有相同人員類別');
    meta.categories.push({ id:uid('pc'), name, enabled:true }); await saveMeta();
  }

  async function categoryAction(id, action) {
    const list = categories(); const idx = list.findIndex(c => c.id===id); if (idx<0) return;
    if (action==='rename') {
      const next = prompt(`修改人員類別「${list[idx].name}」`,list[idx].name); if(next===null)return;
      const name=norm(next); if(!name)return alert('名稱不可空白');
      if(name==='未分類')return alert('「未分類」為系統自動分類');
      if(list.some((c,i)=>i!==idx&&keyOf(c.name)===keyOf(name)))return alert('已有相同人員類別');
      list[idx].name=name;
    } else if(action==='toggle') list[idx].enabled = list[idx].enabled===false;
    else if(action==='up'&&idx>0) [list[idx-1],list[idx]]=[list[idx],list[idx-1]];
    else if(action==='down'&&idx<list.length-1) [list[idx+1],list[idx]]=[list[idx],list[idx+1]];
    await saveMeta();
  }

  async function addPerson() {
    const name = norm(document.getElementById('pm-new-person')?.value);
    if (!name) return alert('請輸入姓名');
    if (people().some(p => keyOf(p.name)===keyOf(name))) return alert('已有相同姓名');
    const groupId = String(document.getElementById('pm-new-person-group')?.value || '');
    const ids = [...document.querySelectorAll('[data-pm-person-cat][data-person-id="__new__"]:checked')].map(x=>String(x.dataset.pmPersonCat));
    const p = { id:uid('md'), name, enabled:true, protected:false, unitId:'' };
    basic.people.push(p);
    meta.profiles[p.id] = { factoryId:String(selectedFactoryId), groupId, archived:false, archivedAt:'' };
    meta.assignments[p.id] = ids;
    saveBasicLocal(); saveMetaLocal();
    await Promise.all([savePeople(),saveMeta()]);
  }

  async function renamePerson(id) {
    const p=personById(id); if(!p)return;
    const next=prompt(`修改人員「${p.name}」`,p.name); if(next===null)return;
    const name=norm(next); if(!name)return alert('姓名不可空白');
    if(people().some(x=>x.id!==p.id&&keyOf(x.name)===keyOf(name)))return alert('已有相同姓名');
    p.name=name; await savePeople();
  }

  async function archivePerson(id) {
    const p=personById(id); if(!p)return;
    if(!confirm(`確定將「${p.name}」刪除／標記離職？\n\n歷史工作與進度紀錄中的姓名會完整保留。`))return;
    const pr=profileOf(id);
    meta.profiles[id]={...pr,archived:true,archivedAt:new Date().toISOString()};
    selectedPersonIds.delete(String(id));
    await saveMeta();
  }

  async function restorePerson(id) {
    const pr=profileOf(id);
    meta.profiles[id]={...pr,archived:false,archivedAt:''};
    await saveMeta();
  }

  async function updatePersonFactory(id,factoryId) {
    const pr=profileOf(id);
    meta.profiles[id]={...pr,factoryId:String(factoryId||''),groupId:''};
    await saveMeta();
  }

  async function updatePersonGroup(id,groupId) {
    const pr=profileOf(id);
    const g=groupById(groupId);
    meta.profiles[id]={...pr,groupId:String(groupId||''),factoryId:g?String(g.factoryId):pr.factoryId};
    await saveMeta();
  }

  async function updatePersonCategories(id,ids) {
    meta.assignments[String(id)]=[...new Set(ids.map(String))]; await saveMeta();
  }

  function ensureWorkAssignmentPanel() {
    const owner=document.getElementById('f-owner');
    let unit=document.getElementById('f-unit');
    const factory=document.getElementById('f-factory');
    const grid=document.getElementById('modal-fields');
    if(!owner||!unit||!factory||!grid)return;

    const ownerBlock=owner.closest('.col-span-1');
    const unitBlock=unit.closest('.col-span-1')||unit.parentElement;
    if(ownerBlock)ownerBlock.classList.add('hidden');

    if(unit.tagName!=='SELECT'){
      const select=document.createElement('select');
      [...unit.attributes].forEach(a=>{if(a.name!=='type'&&a.name!=='list'&&a.name!=='oninput'&&a.name!=='onclick')select.setAttribute(a.name,a.value);});
      select.id='f-unit';
      select.className=unit.className;
      select.value=unit.value||'';
      unit.replaceWith(select);
      unit=select;
    }
    const label=unit.closest('div')?.querySelector('label'); if(label)label.textContent='組別';

    if(!document.getElementById('personnel-assignment-panel')){
      const panel=document.createElement('div');
      panel.id='personnel-assignment-panel';
      panel.className='col-span-2 border border-slate-200 rounded-xl p-4 bg-slate-50/70';
      panel.innerHTML=`
        <div class="mb-4"><div class="flex justify-between items-center mb-2"><label class="block text-xs font-bold text-slate-400 uppercase">人員類別</label><span class="text-[11px] text-slate-400">先選廠區與組別，再選類別</span></div><div id="pa-categories" class="flex flex-wrap gap-2"></div></div>
        <div id="pa-people-section" class="hidden mb-4"><div class="flex justify-between items-center mb-2"><label class="block text-xs font-bold text-slate-400 uppercase">負責人（可複選）</label><span id="pa-category-label" class="text-[11px] font-bold text-blue-600"></span></div><div id="pa-people" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2"></div></div>
        <div class="border-t border-slate-200 pt-3"><label class="inline-flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer"><input id="pa-other-toggle" type="checkbox" class="accent-blue-600">其他／自行輸入</label><input id="pa-other-input" type="text" class="hidden mt-2 w-full border border-slate-200 rounded-lg p-2.5 text-sm bg-white outline-none focus:ring-2 focus:ring-blue-500" placeholder="可輸入一人或多人，請以「、」或逗號分隔"></div>
        <div class="mt-4"><div class="text-[11px] font-bold text-slate-400 mb-2">已選負責人</div><div id="pa-selected" class="flex flex-wrap gap-2"></div></div>`;
      const anchor=unitBlock?.nextSibling||ownerBlock;
      grid.insertBefore(panel,anchor);
      panel.querySelector('#pa-other-toggle')?.addEventListener('change',e=>{
        const input=panel.querySelector('#pa-other-input'); input?.classList.toggle('hidden',!e.target.checked);
        if(!e.target.checked){manualOwnerText='';if(input)input.value='';syncOwnerField();renderSelectedOwners();}
      });
      panel.querySelector('#pa-other-input')?.addEventListener('input',e=>{manualOwnerText=e.target.value;syncOwnerField();renderSelectedOwners();});
    }

    if(!factory.dataset.pmBound){factory.dataset.pmBound='1';factory.addEventListener('change',()=>handleWorkFactoryChange());}
    if(!unit.dataset.pmBound){unit.dataset.pmBound='1';unit.addEventListener('change',()=>handleWorkGroupChange());}
  }

  function populateWorkGroups(preserveCurrent=true) {
    const factory=document.getElementById('f-factory'); const unit=document.getElementById('f-unit'); if(!factory||!unit)return;
    const factoryId=String(factoryByName(factory.value)?.id||'');
    const current=norm(unit.value);
    const gs=groupsForFactory(factoryId,false);
    unit.innerHTML='<option value="">請選擇組別</option>' + gs.map(g=>`<option value="${esc(g.name)}">${esc(g.name)}</option>`).join('');
    if(preserveCurrent&&current&&!gs.some(g=>keyOf(g.name)===keyOf(current))){const o=document.createElement('option');o.value=current;o.textContent=`${current}（歷史）`;unit.appendChild(o);}
    if(preserveCurrent&&current)[...unit.options].some(o=>o.value===current)&&(unit.value=current);
  }

  function workContext() {
    const factoryName=norm(document.getElementById('f-factory')?.value);
    const groupName=norm(document.getElementById('f-unit')?.value);
    const f=factoryByName(factoryName);
    const g=f?groupByFactoryAndName(f.id,groupName):null;
    return {factoryName,groupName,factoryId:String(f?.id||''),groupId:String(g?.id||'')};
  }

  function relevantWorkCategories(factoryId,groupId) {
    const ps=peopleForFactoryGroup(factoryId,groupId);
    const out=[];
    enabledCategories().forEach(c=>{if(ps.some(p=>enabledAssignedCategoryIds(p.id).includes(String(c.id))))out.push({id:String(c.id),name:c.name});});
    if(ps.some(p=>enabledAssignedCategoryIds(p.id).length===0))out.push({id:'__uncategorized__',name:'未分類'});
    return out;
  }

  function peopleForWorkCategory(factoryId,groupId,catId) {
    const ps=peopleForFactoryGroup(factoryId,groupId);
    return catId==='__uncategorized__'?ps.filter(p=>enabledAssignedCategoryIds(p.id).length===0):ps.filter(p=>enabledAssignedCategoryIds(p.id).includes(String(catId)));
  }

  function renderWorkAssignment() {
    ensureWorkAssignmentPanel();
    const panel=document.getElementById('personnel-assignment-panel'); if(!panel)return;
    const ctx=workContext();
    const catsHost=document.getElementById('pa-categories'); const peopleSection=document.getElementById('pa-people-section'); const peopleHost=document.getElementById('pa-people'); const catLabel=document.getElementById('pa-category-label');
    if(!catsHost||!peopleHost)return;
    if(!ctx.factoryId){catsHost.innerHTML='<span class="text-xs text-slate-400">請先選擇廠區。</span>';peopleSection?.classList.add('hidden');renderSelectedOwners();return;}
    if(!ctx.groupId){catsHost.innerHTML='<span class="text-xs text-slate-400">請先選擇組別。</span>';peopleSection?.classList.add('hidden');renderSelectedOwners();return;}
    const cats=relevantWorkCategories(ctx.factoryId,ctx.groupId);
    if(!cats.length){catsHost.innerHTML='<span class="text-xs text-slate-400">此組別目前沒有可選的人員。</span>';peopleSection?.classList.add('hidden');renderSelectedOwners();return;}
    catsHost.innerHTML=cats.map(c=>`<button type="button" class="pa-category-btn ${activePersonnelCategoryId===c.id?'active':''}" data-pa-category="${esc(c.id)}">${esc(c.name)}</button>`).join('');
    catsHost.querySelectorAll('[data-pa-category]').forEach(b=>b.addEventListener('click',()=>{activePersonnelCategoryId=String(b.dataset.paCategory);renderWorkAssignment();}));
    if(!activePersonnelCategoryId||!cats.some(c=>c.id===activePersonnelCategoryId)){peopleSection?.classList.add('hidden');peopleHost.innerHTML='';renderSelectedOwners();return;}
    const ps=peopleForWorkCategory(ctx.factoryId,ctx.groupId,activePersonnelCategoryId);
    peopleSection?.classList.remove('hidden'); if(catLabel)catLabel.textContent=cats.find(c=>c.id===activePersonnelCategoryId)?.name||'';
    peopleHost.innerHTML=ps.map(p=>`<label class="pa-person"><input type="checkbox" data-pa-person="${esc(p.id)}" class="accent-blue-600" ${selectedPersonIds.has(String(p.id))?'checked':''}><span class="text-sm font-bold text-slate-700">${esc(p.name)}</span></label>`).join('')||'<div class="text-xs text-slate-400">此類別目前沒有人員。</div>';
    peopleHost.querySelectorAll('[data-pa-person]').forEach(cb=>cb.addEventListener('change',()=>{const id=String(cb.dataset.paPerson);cb.checked?selectedPersonIds.add(id):selectedPersonIds.delete(id);syncOwnerField();renderSelectedOwners();}));
    renderSelectedOwners();
  }

  function splitNames(text){return [...new Set(String(text||'').split(/[、,，;；\n]+/).map(norm).filter(Boolean))];}
  function selectedNames(){return [...selectedPersonIds].map(id=>personById(id)?.name).map(norm).filter(Boolean);}
  function syncOwnerField(){const owner=document.getElementById('f-owner');if(!owner)return;owner.value=[...new Set([...selectedNames(),...splitNames(manualOwnerText)])].join('、');}
  function renderSelectedOwners(){const host=document.getElementById('pa-selected');if(!host)return;const master=[...selectedPersonIds].map(id=>({id,name:personById(id)?.name})).filter(x=>x.name);const manual=splitNames(manualOwnerText).map(name=>({id:'',name}));const all=[...master,...manual];host.innerHTML=all.length?all.map(x=>`<span class="pa-chip">${esc(x.name)}${x.id?`<button type="button" data-pa-remove="${esc(x.id)}" class="text-blue-400 hover:text-blue-700">✕</button>`:''}</span>`).join(''):'<span class="text-xs text-slate-400">尚未選擇負責人。</span>';host.querySelectorAll('[data-pa-remove]').forEach(b=>b.addEventListener('click',()=>{selectedPersonIds.delete(String(b.dataset.paRemove));syncOwnerField();renderWorkAssignment();}));}

  function handleWorkFactoryChange(){const current=norm(document.getElementById('f-factory')?.value);if(lastWorkFactory&&keyOf(current)!==keyOf(lastWorkFactory)){selectedPersonIds.clear();manualOwnerText='';const oi=document.getElementById('pa-other-input');const ot=document.getElementById('pa-other-toggle');if(oi){oi.value='';oi.classList.add('hidden');}if(ot)ot.checked=false;}lastWorkFactory=current;lastWorkGroup='';activePersonnelCategoryId='';populateWorkGroups(false);syncOwnerField();renderWorkAssignment();}
  function handleWorkGroupChange(){const current=norm(document.getElementById('f-unit')?.value);if(lastWorkGroup&&keyOf(current)!==keyOf(lastWorkGroup)){selectedPersonIds.clear();manualOwnerText='';}lastWorkGroup=current;activePersonnelCategoryId='';syncOwnerField();renderWorkAssignment();}

  function hydrateWorkModal(){refreshLocal();migrateLegacy();ensureWorkAssignmentPanel();populateWorkGroups(true);const ownerText=norm(document.getElementById('f-owner')?.value);const ctx=workContext();selectedPersonIds.clear();manualOwnerText='';splitNames(ownerText).forEach(name=>{const p=people().find(x=>keyOf(x.name)===keyOf(name));const pr=p?profileOf(p.id):null;if(p&&pr&&!pr.archived&&(!ctx.factoryId||String(pr.factoryId)===ctx.factoryId)){selectedPersonIds.add(String(p.id));}else manualOwnerText=manualOwnerText?[manualOwnerText,name].join('、'):name;});lastWorkFactory=ctx.factoryName;lastWorkGroup=ctx.groupName;activePersonnelCategoryId='';const oi=document.getElementById('pa-other-input');const ot=document.getElementById('pa-other-toggle');if(oi){oi.value=manualOwnerText;oi.classList.toggle('hidden',!manualOwnerText);}if(ot)ot.checked=!!manualOwnerText;syncOwnerField();renderWorkAssignment();}

  function updateFilterUnitOptions(){const el=document.getElementById('filter-unit');if(!el)return;const current=el.value;const historical=taskSnapshot().map(t=>norm(t?.unit)).filter(Boolean);const names=[...new Set([...groups().filter(g=>g.enabled!==false).map(g=>g.name),...historical])];el.innerHTML='<option value="all">所有組別</option>'+names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');if([...el.options].some(o=>o.value===current))el.value=current;const label=el.closest('div')?.querySelector('label');if(label&&/單位/.test(label.textContent))label.textContent=label.textContent.replace('單位','組別');}

  function installMasterEvents(){
    document.addEventListener('click',e=>{
      const tab=e.target.closest('#master-tabs button');
      if(tab&&tab.id!=='master-tab-personnel-categories'){
        const text=norm(tab.textContent);
        if(text==='人員'||text==='人員管理'){customMode='people';setTimeout(()=>{relabelUi();renderPeopleManagement();},0);return;}
        if(text==='單位'||text==='組別'){customMode='groups';setTimeout(()=>{relabelUi();renderGroupManagement();},0);return;}
        customMode='';setTimeout(()=>{showOriginalMaster();relabelUi();ensurePersonnelCategoryTab();},0);
      }

      const t=e.target;
      if(t.id==='pm-add-group'){addGroup(selectedFactoryId,document.getElementById('pm-new-group')?.value);return;}
      if(t.id==='pm-group-add'){addGroup(selectedFactoryId,document.getElementById('pm-group-name')?.value);return;}
      if(t.id==='pm-category-add'){addCategory(document.getElementById('pm-category-name')?.value);return;}
      if(t.id==='pm-add-person'){addPerson();return;}
      if(t.dataset.pmGroupRename){renameGroup(t.dataset.pmGroupRename);return;}
      if(t.dataset.pmGroupToggle){toggleGroup(t.dataset.pmGroupToggle);return;}
      if(t.dataset.pmCategoryRename){categoryAction(t.dataset.pmCategoryRename,'rename');return;}
      if(t.dataset.pmCategoryToggle){categoryAction(t.dataset.pmCategoryToggle,'toggle');return;}
      if(t.dataset.pmCategoryUp){categoryAction(t.dataset.pmCategoryUp,'up');return;}
      if(t.dataset.pmCategoryDown){categoryAction(t.dataset.pmCategoryDown,'down');return;}
      if(t.dataset.pmRenamePerson){renamePerson(t.dataset.pmRenamePerson);return;}
      if(t.dataset.pmArchivePerson){archivePerson(t.dataset.pmArchivePerson);return;}
      if(t.dataset.pmRestorePerson){restorePerson(t.dataset.pmRestorePerson);return;}
    },true);

    document.addEventListener('change',e=>{
      const t=e.target;
      if(t.id==='pm-factory-filter'){selectedFactoryId=String(t.value);renderPeopleManagement();return;}
      if(t.id==='pm-group-factory'){selectedFactoryId=String(t.value);renderGroupManagement();return;}
      if(t.id==='pm-show-archived'){showArchived=!!t.checked;renderPeopleManagement();return;}
      if(t.dataset.pmPersonFactory){updatePersonFactory(t.dataset.pmPersonFactory,t.value);return;}
      if(t.dataset.pmPersonGroup){updatePersonGroup(t.dataset.pmPersonGroup,t.value);return;}
      if(t.dataset.pmPersonCat){const id=String(t.dataset.personId);const row=t.closest('[data-pm-person]');const ids=[...row.querySelectorAll('[data-pm-person-cat]:checked')].map(x=>String(x.dataset.pmPersonCat));updatePersonCategories(id,ids);return;}
    });
  }

  function observeModals(){
    const modal=document.getElementById('modal');
    if(modal&&!modal.dataset.pmV2Observed){modal.dataset.pmV2Observed='1';new MutationObserver(()=>{if(!modal.classList.contains('hidden'))setTimeout(hydrateWorkModal,0);else{selectedPersonIds.clear();manualOwnerText='';activePersonnelCategoryId='';lastWorkFactory='';lastWorkGroup='';}}).observe(modal,{attributes:true,attributeFilter:['class']});}
  }

  async function setupFirestore(){
    try{
      let tries=0;while(!window.__fb?.db&&tries<30){await new Promise(r=>setTimeout(r,200));tries++;}
      if(!window.__fb?.db)return;
      firestoreApi=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
      basicRef=firestoreApi.doc(window.__fb.db,BASIC_COLLECTION,BASIC_DOC_ID);
      metaRef=firestoreApi.doc(window.__fb.db,META_COLLECTION,META_DOC_ID);
      firestoreApi.onSnapshot(basicRef,snap=>{if(!snap.exists())return;const d=snap.data()||{};basic={...basic,...d,factories:Array.isArray(d.factories)?d.factories:basic.factories,people:Array.isArray(d.people)?d.people:basic.people,units:Array.isArray(d.units)?d.units:basic.units};saveBasicLocal();migrateLegacy();renderCustomView();populateWorkGroups(true);renderWorkAssignment();});
      firestoreApi.onSnapshot(metaRef,async snap=>{if(!snap.exists()){migrateLegacy();await firestoreApi.setDoc(metaRef,{...meta,_updatedTs:firestoreApi.serverTimestamp()},{merge:false});return;}meta=normalizeMeta(snap.data());saveMetaLocal();migrateLegacy();renderCustomView();renderWorkAssignment();});
    }catch(err){console.warn('Personnel management Firestore unavailable',err);}
  }

  function startObserver(){
    const observer=new MutationObserver(()=>{if(rendering)return;rendering=true;requestAnimationFrame(()=>{rendering=false;relabelUi();ensurePersonnelCategoryTab();observeModals();ensureWorkAssignmentPanel();updateFilterUnitOptions();if(customMode)renderCustomView();});});
    observer.observe(document.body,{childList:true,subtree:true});
  }

  function boot(){
    injectStyles();refreshLocal();migrateLegacy();relabelUi();ensurePersonnelCategoryTab();installMasterEvents();observeModals();ensureWorkAssignmentPanel();updateFilterUnitOptions();startObserver();setupFirestore();
    setInterval(()=>{refreshLocal();migrateLegacy();relabelUi();ensurePersonnelCategoryTab();updateFilterUnitOptions();},1500);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
