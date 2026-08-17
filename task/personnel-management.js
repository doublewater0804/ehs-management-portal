/* EHS Task Personnel Management v3
 * Integrated personnel administration for /task/.
 * Hierarchy: Factory -> Group -> Person -> Personnel categories.
 * People use soft-delete (leave/archive) so historical task records remain unchanged.
 */
(() => {
  'use strict';

  const BASIC_KEY = 'ESH_TASK_MASTER_DATA_V1';
  const META_KEY = 'ESH_TASK_PERSONNEL_META_V1';
  const TASK_KEY = 'ESH_MANAGEMENT_DATA_V86';
  const META_COLLECTION = 'ehs_task_personnel_meta';
  const META_DOC_ID = 'settings';

  const norm = s => String(s ?? '').trim().replace(/\s+/g, ' ');
  const keyOf = s => norm(s).toLocaleLowerCase('zh-Hant');
  const uid = p => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
  const esc = s => String(s ?? '')
    .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
    .replaceAll('"','&quot;').replaceAll("'",'&#039;');
  const readJson = (key, fallback) => {
    try {
      const v = JSON.parse(localStorage.getItem(key) || 'null');
      return v && typeof v === 'object' ? v : fallback;
    } catch (_) { return fallback; }
  };

  function readBasic() {
    const v = readJson(BASIC_KEY, {});
    return {
      ...v,
      factories: Array.isArray(v.factories) ? v.factories : [],
      people: Array.isArray(v.people) ? v.people : [],
      units: Array.isArray(v.units) ? v.units : []
    };
  }

  function readMeta() {
    const v = readJson(META_KEY, {});
    return {
      version: 3,
      categories: Array.isArray(v.categories) ? v.categories.map(c => ({
        id:String(c?.id || uid('pc')), name:norm(c?.name), enabled:c?.enabled !== false
      })).filter(c => c.name) : [],
      groups: Array.isArray(v.groups) ? v.groups.map(g => ({
        id:String(g?.id || uid('grp')), factoryId:String(g?.factoryId || ''), name:norm(g?.name), enabled:g?.enabled !== false
      })).filter(g => g.factoryId && g.name) : [],
      assignments: v.assignments && typeof v.assignments === 'object' ? v.assignments : {},
      profiles: v.profiles && typeof v.profiles === 'object' ? v.profiles : {}
    };
  }

  let basic = readBasic();
  let meta = readMeta();
  let selectedFactoryId = '';
  let showArchived = false;
  let customMode = '';
  let firestoreApi = null;
  let metaRef = null;
  let basicRef = null;
  let selectedOwnerIds = new Set();
  let manualOwner = '';
  let activeOwnerCategory = '';

  const factories = () => basic.factories || [];
  const people = () => basic.people || [];
  const categories = () => meta.categories || [];
  const groups = () => meta.groups || [];
  const activeFactories = () => factories().filter(x => x?.enabled !== false);
  const activeCategories = () => categories().filter(x => x?.enabled !== false);
  const factoryById = id => factories().find(x => String(x.id) === String(id));
  const factoryByName = name => factories().find(x => keyOf(x.name) === keyOf(name));
  const personById = id => people().find(x => String(x.id) === String(id));
  const groupById = id => groups().find(x => String(x.id) === String(id));
  const profileOf = id => {
    const p = meta.profiles[String(id)] || {};
    return {
      factoryId:String(p.factoryId || ''),
      groupId:String(p.groupId || ''),
      archived:p.archived === true,
      archivedAt:String(p.archivedAt || '')
    };
  };
  const categoryIdsOf = id => [...new Set((Array.isArray(meta.assignments[String(id)]) ? meta.assignments[String(id)] : []).map(String))];
  const groupsForFactory = (factoryId, includeDisabled=false) => groups().filter(g => String(g.factoryId) === String(factoryId) && (includeDisabled || g.enabled !== false));
  const groupByFactoryName = (factoryId, name) => groups().find(g => String(g.factoryId) === String(factoryId) && keyOf(g.name) === keyOf(name));

  function saveLocal() {
    localStorage.setItem(BASIC_KEY, JSON.stringify(basic));
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  }

  function setSync(text, ok=true) {
    const el = document.getElementById('master-sync-state');
    if (!el) return;
    el.textContent = text;
    el.className = ok ? 'text-[11px] font-bold text-emerald-600' : 'text-[11px] font-bold text-amber-600';
  }

  async function saveMetaRemote() {
    saveLocal();
    if (!firestoreApi || !metaRef) return;
    try {
      setSync('儲存中…');
      await firestoreApi.setDoc(metaRef, { ...meta, _updatedTs: firestoreApi.serverTimestamp() }, { merge:false });
      setSync('雲端已儲存');
    } catch (e) {
      console.warn(e); setSync('雲端失敗，已保留本機', false);
    }
  }

  async function savePeopleRemote() {
    saveLocal();
    if (!firestoreApi || !basicRef) return;
    try {
      setSync('儲存中…');
      await firestoreApi.setDoc(basicRef, { people:basic.people, _updatedTs:firestoreApi.serverTimestamp() }, { merge:true });
      setSync('雲端已儲存');
    } catch (e) {
      console.warn(e); setSync('雲端失敗，已保留本機', false);
    }
  }

  function historicalTasks() {
    const v = readJson(TASK_KEY, []);
    return Array.isArray(v) ? v : [];
  }

  function migrateLegacyOnce() {
    let changed = false;
    const tasks = historicalTasks();

    tasks.forEach(t => {
      const f = factoryByName(t?.factory);
      const groupName = norm(t?.unit);
      if (f && groupName && !groupByFactoryName(f.id, groupName)) {
        meta.groups.push({ id:uid('grp'), factoryId:String(f.id), name:groupName, enabled:true });
        changed = true;
      }
    });

    people().forEach(person => {
      const id = String(person.id);
      if (meta.profiles[id]) return;
      const related = tasks.filter(t => String(t?.owner || '').split(/[、,，;；\n]+/).map(norm).some(n => keyOf(n) === keyOf(person.name)));
      const latest = related[0];
      const f = latest ? factoryByName(latest.factory) : null;
      const g = f && latest?.unit ? groupByFactoryName(f.id, latest.unit) : null;
      meta.profiles[id] = {
        factoryId:String(f?.id || ''),
        groupId:String(g?.id || ''),
        archived:person.enabled === false,
        archivedAt:person.enabled === false ? new Date().toISOString() : ''
      };
      changed = true;
    });

    if (changed) saveLocal();
  }

  function injectStyle() {
    if (document.getElementById('pm-v3-style')) return;
    const s = document.createElement('style');
    s.id = 'pm-v3-style';
    s.textContent = `
      #pm-v3-host .pm-card{border:1px solid #e2e8f0;border-radius:12px;background:#fff;padding:14px}
      #pm-v3-host .pm-label{display:block;font-size:10px;font-weight:900;color:#94a3b8;margin-bottom:6px}
      #pm-v3-host .pm-input,#pm-v3-host .pm-select{width:100%;min-height:40px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;padding:8px 10px;font-size:13px;color:#334155;outline:none}
      #pm-v3-host .pm-input:focus,#pm-v3-host .pm-select:focus{border-color:#3b82f6;box-shadow:0 0 0 2px #dbeafe}
      #pm-v3-host .pm-cats{display:flex;flex-wrap:wrap;gap:8px 14px;min-height:40px;border:1px solid #cbd5e1;border-radius:9px;background:#fff;padding:8px 10px}
      #pm-v3-host .pm-cat{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;color:#475569;white-space:nowrap;cursor:pointer}
      #pm-v3-host .pm-grid{display:grid;grid-template-columns:minmax(160px,1fr) minmax(180px,1fr) minmax(280px,2fr) auto;gap:12px;align-items:end}
      #pm-v3-host .pm-row{display:grid;grid-template-columns:minmax(150px,190px) minmax(180px,220px) minmax(300px,1fr) auto;gap:12px;padding:14px;border-top:1px solid #f1f5f9;align-items:start}
      #pm-v3-host .pm-row:first-child{border-top:0}
      #pm-v3-host .archived{background:#f8fafc;opacity:.78}
      #personnel-assignment-v3 .pa-btn{border:1px solid #cbd5e1;background:#fff;color:#475569;border-radius:.65rem;padding:.5rem .8rem;font-size:.78rem;font-weight:800}
      #personnel-assignment-v3 .pa-btn.active{background:#eff6ff;border-color:#3b82f6;color:#1d4ed8}
      #personnel-assignment-v3 .pa-person{display:flex;align-items:center;gap:.55rem;border:1px solid #e2e8f0;background:#fff;border-radius:.65rem;padding:.65rem .8rem;cursor:pointer}
      #personnel-assignment-v3 .pa-chip{display:inline-flex;align-items:center;gap:.35rem;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;border-radius:999px;padding:.25rem .55rem;font-size:.72rem;font-weight:800}
      @media(max-width:900px){#pm-v3-host .pm-grid,#pm-v3-host .pm-row{grid-template-columns:1fr}}
    `;
    document.head.appendChild(s);
  }

  function ensureTabs() {
    const tabs = document.getElementById('master-tabs');
    if (!tabs) return;
    [...tabs.querySelectorAll('button')].forEach(btn => {
      if (norm(btn.textContent) === '人員') btn.textContent = '人員管理';
      if (norm(btn.textContent) === '單位') btn.textContent = '組別';
    });
    if (!document.getElementById('pm-person-category-tab')) {
      const btn = document.createElement('button');
      btn.id = 'pm-person-category-tab';
      btn.type = 'button';
      btn.textContent = '人員類別';
      btn.className = 'px-4 py-2.5 rounded-t-lg text-sm font-bold border-b-2 transition text-slate-500 border-transparent hover:text-slate-700';
      tabs.appendChild(btn);
    }
  }

  function setTabActive(label) {
    const tabs = document.getElementById('master-tabs');
    if (!tabs) return;
    [...tabs.querySelectorAll('button')].forEach(b => {
      const active = norm(b.textContent) === label;
      b.classList.toggle('text-blue-600',active);
      b.classList.toggle('border-blue-600',active);
      b.classList.toggle('bg-blue-50/60',active);
      b.classList.toggle('text-slate-500',!active);
      b.classList.toggle('border-transparent',!active);
    });
  }

  function masterBody() {
    const list = document.getElementById('master-list');
    const table = list?.parentElement;
    const body = table?.parentElement;
    const addRow = body?.children?.[0];
    return {body,table,addRow};
  }

  function openCustom(label) {
    const {body,table,addRow} = masterBody();
    if (!body) return null;
    addRow?.classList.add('hidden');
    table?.classList.add('hidden');
    let host = document.getElementById('pm-v3-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'pm-v3-host';
      body.insertBefore(host, addRow || body.firstChild);
    }
    setTabActive(label);
    return host;
  }

  function closeCustom() {
    const {table,addRow} = masterBody();
    document.getElementById('pm-v3-host')?.remove();
    addRow?.classList.remove('hidden');
    table?.classList.remove('hidden');
  }

  function ensureFactorySelection() {
    const active = activeFactories();
    const unassigned = people().some(p => !profileOf(p.id).factoryId);
    if (selectedFactoryId === '__unassigned__' && unassigned) return;
    if (active.some(f => String(f.id) === String(selectedFactoryId))) return;
    selectedFactoryId = String(active[0]?.id || (unassigned ? '__unassigned__' : ''));
  }

  function factoryOptions(selected, allowUnassigned=false) {
    const unassigned = people().some(p => !profileOf(p.id).factoryId);
    return `${allowUnassigned && unassigned ? `<option value="__unassigned__" ${selected==='__unassigned__'?'selected':''}>未指定廠區</option>`:''}${activeFactories().map(f => `<option value="${esc(f.id)}" ${String(f.id)===String(selected)?'selected':''}>${esc(f.name)}</option>`).join('')}`;
  }

  function categoryChecks(personId, selected=[]) {
    const set = new Set(selected.map(String));
    if (!activeCategories().length) return '<span class="text-xs text-slate-400">尚未建立人員類別</span>';
    return activeCategories().map(c => `<label class="pm-cat"><input type="checkbox" class="accent-blue-600" data-pm-cat="${esc(c.id)}" data-person="${esc(personId)}" ${set.has(String(c.id))?'checked':''}>${esc(c.name)}</label>`).join('');
  }

  function renderPeople() {
    customMode = 'people';
    ensureFactorySelection();
    const host = openCustom('人員管理');
    if (!host) return;
    const unassignedMode = selectedFactoryId === '__unassigned__';
    const personList = people().filter(p => {
      const pr = profileOf(p.id);
      const match = unassignedMode ? !pr.factoryId : String(pr.factoryId) === String(selectedFactoryId);
      return match && (showArchived || !pr.archived);
    });
    const gs = unassignedMode ? [] : groupsForFactory(selectedFactoryId,false);

    host.innerHTML = `
      <div class="space-y-4">
        <div class="pm-card">
          <div class="flex flex-col md:flex-row justify-between gap-3 md:items-end">
            <div class="min-w-[240px]"><label class="pm-label">選擇廠區</label><select id="pm-factory" class="pm-select">${factoryOptions(selectedFactoryId,true)}</select></div>
            <label class="inline-flex items-center gap-2 text-sm font-bold text-slate-600 pb-2"><input id="pm-show-archived" type="checkbox" class="accent-blue-600" ${showArchived?'checked':''}>顯示已刪除／離職人員</label>
          </div>
        </div>
        ${unassignedMode ? '<div class="pm-card text-sm text-amber-700 bg-amber-50 border-amber-200">這些是尚未指定廠區的舊人員資料，請直接在下方選擇廠區。</div>' : `
        <div class="pm-card">
          <div class="font-bold text-slate-800 mb-3">新增人員｜${esc(factoryById(selectedFactoryId)?.name || '')}</div>
          <div class="pm-grid">
            <div><label class="pm-label">姓名</label><input id="pm-new-name" class="pm-input" placeholder="輸入姓名"></div>
            <div><label class="pm-label">組別</label><select id="pm-new-group" class="pm-select"><option value="">未指定組別</option>${gs.map(g=>`<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('')}</select></div>
            <div><label class="pm-label">人員類別（可複選）</label><div class="pm-cats">${categoryChecks('__new__',[])}</div></div>
            <button id="pm-add-person" type="button" class="px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg">＋ 新增人員</button>
          </div>
        </div>`}
        <div class="pm-card p-0 overflow-hidden">
          <div class="px-4 py-3 bg-slate-50 border-b flex justify-between"><span class="font-bold text-slate-700">人員清單</span><span class="text-xs text-slate-400">${personList.length} 人</span></div>
          ${personList.length ? personList.map(p => {
            const pr = profileOf(p.id);
            const personGroups = pr.factoryId ? groupsForFactory(pr.factoryId,true) : [];
            return `<div class="pm-row ${pr.archived?'archived':''}" data-person-row="${esc(p.id)}">
              <div><label class="pm-label">姓名</label><input class="pm-input" data-pm-name="${esc(p.id)}" value="${esc(p.name)}"><div class="mt-2 text-[11px] font-bold ${pr.archived?'text-slate-500':'text-emerald-600'}">${pr.archived?'已刪除／離職':'在職'}</div></div>
              <div><label class="pm-label">廠區</label><select class="pm-select mb-2" data-pm-factory="${esc(p.id)}"><option value="">未指定</option>${factoryOptions(pr.factoryId,false)}</select><label class="pm-label">組別</label><select class="pm-select" data-pm-group="${esc(p.id)}"><option value="">未指定組別</option>${personGroups.map(g=>`<option value="${esc(g.id)}" ${String(g.id)===String(pr.groupId)?'selected':''}>${esc(g.name)}${g.enabled===false?'（已停用）':''}</option>`).join('')}</select></div>
              <div><label class="pm-label">人員類別（可複選）</label><div class="pm-cats">${categoryChecks(p.id,categoryIdsOf(p.id))}${!categoryIdsOf(p.id).length?'<span class="text-xs text-slate-400">未分類</span>':''}</div></div>
              <div>${pr.archived?`<button type="button" data-pm-restore="${esc(p.id)}" class="px-3 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg">恢復</button>`:`<button type="button" data-pm-delete="${esc(p.id)}" class="px-3 py-2 text-xs font-bold text-red-600 bg-red-50 rounded-lg">刪除／離職</button>`}</div>
            </div>`;
          }).join('') : '<div class="p-8 text-center text-sm text-slate-400">此廠區目前沒有符合條件的人員。</div>'}
        </div>
      </div>`;
  }

  function renderGroups() {
    customMode = 'groups';
    ensureFactorySelection();
    if (selectedFactoryId === '__unassigned__') selectedFactoryId = String(activeFactories()[0]?.id || '');
    const host = openCustom('組別');
    if (!host) return;
    const gs = groupsForFactory(selectedFactoryId,true);
    host.innerHTML = `<div class="space-y-4"><div class="pm-card"><div class="flex flex-col md:flex-row gap-3 md:items-end"><div class="min-w-[240px]"><label class="pm-label">廠區</label><select id="pm-group-factory" class="pm-select">${factoryOptions(selectedFactoryId,false)}</select></div><div class="flex-1"><label class="pm-label">新增組別</label><input id="pm-new-group-name" class="pm-input" placeholder="例如：工安組、環保組"></div><button id="pm-add-group" type="button" class="px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg">＋ 新增</button></div></div><div class="pm-card p-0 overflow-hidden">${gs.length?gs.map(g=>`<div class="flex gap-3 items-center px-4 py-3 border-t first:border-t-0"><input class="pm-input flex-1" data-group-name="${esc(g.id)}" value="${esc(g.name)}"><span class="text-[11px] font-bold ${g.enabled!==false?'text-emerald-600':'text-slate-400'}">${g.enabled!==false?'啟用':'停用'}</span><button data-group-toggle="${esc(g.id)}" class="text-xs font-bold ${g.enabled!==false?'text-amber-600':'text-emerald-600'}">${g.enabled!==false?'停用':'啟用'}</button></div>`).join(''):'<div class="p-8 text-center text-sm text-slate-400">尚無組別。</div>'}</div></div>`;
  }

  function renderCategories() {
    customMode = 'categories';
    const host = openCustom('人員類別');
    if (!host) return;
    host.innerHTML = `<div class="space-y-4"><div class="pm-card"><div class="flex gap-3 items-end"><div class="flex-1"><label class="pm-label">新增人員類別</label><input id="pm-new-category" class="pm-input" placeholder="例如：工安、環保、消防、職安"></div><button id="pm-add-category" type="button" class="px-5 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-lg">＋ 新增</button></div><div class="mt-2 text-xs text-slate-400">一個人可勾選多個類別；完全未勾選時自動歸入「未分類」。</div></div><div class="pm-card p-0 overflow-hidden">${categories().length?categories().map(c=>`<div class="flex gap-3 items-center px-4 py-3 border-t first:border-t-0"><input class="pm-input flex-1" data-category-name="${esc(c.id)}" value="${esc(c.name)}"><span class="text-[11px] font-bold ${c.enabled!==false?'text-emerald-600':'text-slate-400'}">${c.enabled!==false?'啟用':'停用'}</span><button data-category-toggle="${esc(c.id)}" class="text-xs font-bold ${c.enabled!==false?'text-amber-600':'text-emerald-600'}">${c.enabled!==false?'停用':'啟用'}</button></div>`).join(''):'<div class="p-8 text-center text-sm text-slate-400">尚無人員類別。</div>'}</div></div>`;
  }

  async function addPerson() {
    const name = norm(document.getElementById('pm-new-name')?.value);
    if (!name) return alert('請輸入姓名');
    if (people().some(p => keyOf(p.name) === keyOf(name))) return alert('已有相同姓名');
    const id = uid('md');
    const groupId = String(document.getElementById('pm-new-group')?.value || '');
    const catIds = [...document.querySelectorAll('[data-pm-cat][data-person="__new__"]:checked')].map(x => String(x.dataset.pmCat));
    basic.people.push({ id, name, enabled:true, protected:false, unitId:'' });
    meta.profiles[id] = { factoryId:String(selectedFactoryId), groupId, archived:false, archivedAt:'' };
    meta.assignments[id] = catIds;
    await Promise.all([savePeopleRemote(),saveMetaRemote()]);
    renderPeople();
  }

  async function archivePerson(id) {
    const p = personById(id); if (!p) return;
    if (!confirm(`確定將「${p.name}」刪除／標記離職？\n歷史工作紀錄中的姓名仍會保留。`)) return;
    meta.profiles[String(id)] = { ...profileOf(id), archived:true, archivedAt:new Date().toISOString() };
    await saveMetaRemote(); renderPeople();
  }

  async function restorePerson(id) {
    meta.profiles[String(id)] = { ...profileOf(id), archived:false, archivedAt:'' };
    await saveMetaRemote(); renderPeople();
  }

  async function setupFirestore() {
    try {
      let tries = 0;
      while (!window.__fb?.db && tries < 30) { await new Promise(r=>setTimeout(r,200)); tries++; }
      if (!window.__fb?.db) return;
      firestoreApi = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
      basicRef = firestoreApi.doc(window.__fb.db,'ehs_task_master_data','settings');
      metaRef = firestoreApi.doc(window.__fb.db,META_COLLECTION,META_DOC_ID);
      firestoreApi.onSnapshot(metaRef, snap => {
        if (!snap.exists()) { saveMetaRemote(); return; }
        const d = snap.data() || {};
        meta = {
          version:3,
          categories:Array.isArray(d.categories)?d.categories:[],
          groups:Array.isArray(d.groups)?d.groups:[],
          assignments:d.assignments&&typeof d.assignments==='object'?d.assignments:{},
          profiles:d.profiles&&typeof d.profiles==='object'?d.profiles:{}
        };
        saveLocal(); if (customMode==='people') renderPeople(); else if(customMode==='groups') renderGroups(); else if(customMode==='categories') renderCategories();
      });
    } catch (e) { console.warn('Personnel Firestore unavailable',e); }
  }

  function ensureAssignmentPanel() {
    const factory = document.getElementById('f-factory');
    let group = document.getElementById('f-unit');
    const owner = document.getElementById('f-owner');
    const grid = document.getElementById('modal-fields');
    if (!factory || !group || !owner || !grid) return;

    const ownerBlock = owner.closest('.col-span-1');
    ownerBlock?.classList.add('hidden');

    if (group.tagName !== 'SELECT') {
      const sel = document.createElement('select');
      sel.id = 'f-unit'; sel.className = group.className; sel.value = group.value || '';
      group.replaceWith(sel); group = sel;
      const label = group.closest('div')?.querySelector('label'); if (label) label.textContent = '組別';
    }

    if (!document.getElementById('personnel-assignment-v3')) {
      const panel = document.createElement('div');
      panel.id = 'personnel-assignment-v3';
      panel.className = 'col-span-2 border border-slate-200 rounded-xl p-4 bg-slate-50/70';
      panel.innerHTML = `<div class="mb-4"><div class="flex justify-between mb-2"><label class="text-xs font-bold text-slate-400 uppercase">人員類別</label><span class="text-[11px] text-slate-400">廠區 → 組別 → 類別 → 負責人</span></div><div id="pa3-categories" class="flex flex-wrap gap-2"></div></div><div id="pa3-people-wrap" class="hidden mb-4"><div id="pa3-people" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2"></div></div><div class="border-t border-slate-200 pt-3"><label class="inline-flex items-center gap-2 text-sm font-bold"><input id="pa3-other-toggle" type="checkbox" class="accent-blue-600">其他／自行輸入</label><input id="pa3-other" class="hidden mt-2 w-full border border-slate-200 rounded-lg p-2.5 text-sm" placeholder="多人可用「、」分隔"></div><div class="mt-4"><div class="text-[11px] font-bold text-slate-400 mb-2">已選負責人</div><div id="pa3-selected" class="flex flex-wrap gap-2"></div></div>`;
      const groupBlock = group.closest('.col-span-1') || group.parentElement;
      grid.insertBefore(panel, groupBlock?.nextSibling || ownerBlock);
      panel.querySelector('#pa3-other-toggle')?.addEventListener('change',e=>{const i=panel.querySelector('#pa3-other');i?.classList.toggle('hidden',!e.target.checked);if(!e.target.checked){manualOwner='';if(i)i.value='';syncOwner();renderOwnerChips();}});
      panel.querySelector('#pa3-other')?.addEventListener('input',e=>{manualOwner=e.target.value;syncOwner();renderOwnerChips();});
    }

    if (!factory.dataset.pm3) { factory.dataset.pm3='1'; factory.addEventListener('change',()=>{populateGroups(false);selectedOwnerIds.clear();manualOwner='';activeOwnerCategory='';syncOwner();renderAssignment();}); }
    if (!group.dataset.pm3) { group.dataset.pm3='1'; group.addEventListener('change',()=>{selectedOwnerIds.clear();manualOwner='';activeOwnerCategory='';syncOwner();renderAssignment();}); }
  }

  function populateGroups(preserve=true) {
    const fsel = document.getElementById('f-factory'); const gsel = document.getElementById('f-unit');
    if (!fsel || !gsel) return;
    const f = factoryByName(fsel.value); const current = norm(gsel.value);
    const gs = f ? groupsForFactory(f.id,false) : [];
    gsel.innerHTML = '<option value="">請選擇組別</option>' + gs.map(g=>`<option value="${esc(g.name)}">${esc(g.name)}</option>`).join('');
    if (preserve && current && !gs.some(g=>keyOf(g.name)===keyOf(current))) gsel.insertAdjacentHTML('beforeend',`<option value="${esc(current)}">${esc(current)}（歷史）</option>`);
    if (preserve && [...gsel.options].some(o=>o.value===current)) gsel.value=current;
  }

  function splitNames(s) { return [...new Set(String(s||'').split(/[、,，;；\n]+/).map(norm).filter(Boolean))]; }
  function syncOwner() {
    const input = document.getElementById('f-owner'); if(!input)return;
    const names = [...selectedOwnerIds].map(id=>personById(id)?.name).filter(Boolean);
    input.value = [...new Set([...names,...splitNames(manualOwner)])].join('、');
  }

  function ownerContext() {
    const f = factoryByName(document.getElementById('f-factory')?.value);
    const g = f ? groupByFactoryName(f.id,document.getElementById('f-unit')?.value) : null;
    return {factoryId:String(f?.id||''),groupId:String(g?.id||'')};
  }

  function renderOwnerChips() {
    const h = document.getElementById('pa3-selected'); if(!h)return;
    const items = [...selectedOwnerIds].map(id=>({id,name:personById(id)?.name})).filter(x=>x.name);
    const manual = splitNames(manualOwner).map(name=>({id:'',name}));
    h.innerHTML = [...items,...manual].length ? [...items,...manual].map(x=>`<span class="pa-chip">${esc(x.name)}${x.id?`<button data-pa3-remove="${esc(x.id)}" type="button">✕</button>`:''}</span>`).join('') : '<span class="text-xs text-slate-400">尚未選擇負責人。</span>';
  }

  function renderAssignment() {
    ensureAssignmentPanel();
    const catHost=document.getElementById('pa3-categories'); const peopleWrap=document.getElementById('pa3-people-wrap'); const peopleHost=document.getElementById('pa3-people');
    if(!catHost||!peopleHost)return;
    const ctx=ownerContext();
    if(!ctx.factoryId){catHost.innerHTML='<span class="text-xs text-slate-400">請先選擇廠區。</span>';peopleWrap.classList.add('hidden');renderOwnerChips();return;}
    if(!ctx.groupId){catHost.innerHTML='<span class="text-xs text-slate-400">請先選擇組別。</span>';peopleWrap.classList.add('hidden');renderOwnerChips();return;}
    const ps=people().filter(p=>{const pr=profileOf(p.id);return !pr.archived&&String(pr.factoryId)===ctx.factoryId&&String(pr.groupId)===ctx.groupId;});
    const cats=activeCategories().filter(c=>ps.some(p=>categoryIdsOf(p.id).includes(String(c.id)))).map(c=>({id:String(c.id),name:c.name}));
    if(ps.some(p=>categoryIdsOf(p.id).length===0))cats.push({id:'__uncategorized__',name:'未分類'});
    if(!cats.length){catHost.innerHTML='<span class="text-xs text-slate-400">此組別目前沒有可選人員。</span>';peopleWrap.classList.add('hidden');renderOwnerChips();return;}
    catHost.innerHTML=cats.map(c=>`<button type="button" class="pa-btn ${activeOwnerCategory===c.id?'active':''}" data-pa3-category="${esc(c.id)}">${esc(c.name)}</button>`).join('');
    if(!activeOwnerCategory||!cats.some(c=>c.id===activeOwnerCategory)){peopleWrap.classList.add('hidden');renderOwnerChips();return;}
    const filtered=ps.filter(p=>activeOwnerCategory==='__uncategorized__'?categoryIdsOf(p.id).length===0:categoryIdsOf(p.id).includes(activeOwnerCategory));
    peopleWrap.classList.remove('hidden');
    peopleHost.innerHTML=filtered.map(p=>`<label class="pa-person"><input type="checkbox" class="accent-blue-600" data-pa3-person="${esc(p.id)}" ${selectedOwnerIds.has(String(p.id))?'checked':''}><span class="text-sm font-bold">${esc(p.name)}</span></label>`).join('');
    renderOwnerChips();
  }

  function hydrateTaskModal() {
    basic=readBasic();meta=readMeta();migrateLegacyOnce();ensureAssignmentPanel();populateGroups(true);
    selectedOwnerIds.clear();manualOwner='';activeOwnerCategory='';
    const ctx=ownerContext();
    splitNames(document.getElementById('f-owner')?.value).forEach(name=>{
      const p=people().find(x=>keyOf(x.name)===keyOf(name)); const pr=p?profileOf(p.id):null;
      if(p&&pr&&!pr.archived&&(!ctx.factoryId||String(pr.factoryId)===ctx.factoryId))selectedOwnerIds.add(String(p.id)); else manualOwner=manualOwner?[manualOwner,name].join('、'):name;
    });
    const ot=document.getElementById('pa3-other-toggle'); const oi=document.getElementById('pa3-other');
    if(ot)ot.checked=!!manualOwner; if(oi){oi.value=manualOwner;oi.classList.toggle('hidden',!manualOwner);} syncOwner();renderAssignment();
  }

  function bindEvents() {
    document.addEventListener('click', e => {
      const tab=e.target.closest('#master-tabs button');
      if(tab){
        const text=norm(tab.textContent);
        if(text==='人員管理') { e.preventDefault(); e.stopImmediatePropagation(); renderPeople(); return; }
        if(text==='組別') { e.preventDefault(); e.stopImmediatePropagation(); renderGroups(); return; }
        if(text==='人員類別') { e.preventDefault(); e.stopImmediatePropagation(); renderCategories(); return; }
        customMode=''; closeCustom();
      }

      const t=e.target;
      if(t.id==='pm-add-person'){addPerson();return;}
      if(t.id==='pm-add-group'){
        const name=norm(document.getElementById('pm-new-group-name')?.value); if(!name)return alert('請輸入組別名稱');
        if(groupByFactoryName(selectedFactoryId,name))return alert('此廠區已有相同組別');
        meta.groups.push({id:uid('grp'),factoryId:String(selectedFactoryId),name,enabled:true});saveMetaRemote().then(renderGroups);return;
      }
      if(t.id==='pm-add-category'){
        const name=norm(document.getElementById('pm-new-category')?.value); if(!name)return alert('請輸入人員類別名稱'); if(name==='未分類')return alert('「未分類」為系統自動分類'); if(categories().some(c=>keyOf(c.name)===keyOf(name)))return alert('已有相同人員類別');
        meta.categories.push({id:uid('pc'),name,enabled:true});saveMetaRemote().then(renderCategories);return;
      }
      if(t.dataset.pmDelete){archivePerson(t.dataset.pmDelete);return;}
      if(t.dataset.pmRestore){restorePerson(t.dataset.pmRestore);return;}
      if(t.dataset.groupToggle){const g=groupById(t.dataset.groupToggle);if(g){g.enabled=g.enabled===false;saveMetaRemote().then(renderGroups);}return;}
      if(t.dataset.categoryToggle){const c=categories().find(x=>String(x.id)===String(t.dataset.categoryToggle));if(c){c.enabled=c.enabled===false;saveMetaRemote().then(renderCategories);}return;}
      if(t.dataset.pa3Category){activeOwnerCategory=String(t.dataset.pa3Category);renderAssignment();return;}
      if(t.dataset.pa3Remove){selectedOwnerIds.delete(String(t.dataset.pa3Remove));syncOwner();renderAssignment();return;}
    }, true);

    document.addEventListener('change',e=>{
      const t=e.target;
      if(t.id==='pm-factory'){selectedFactoryId=String(t.value);renderPeople();return;}
      if(t.id==='pm-group-factory'){selectedFactoryId=String(t.value);renderGroups();return;}
      if(t.id==='pm-show-archived'){showArchived=!!t.checked;renderPeople();return;}
      if(t.dataset.pmName){const p=personById(t.dataset.pmName);const name=norm(t.value);if(!p||!name)return;if(people().some(x=>x.id!==p.id&&keyOf(x.name)===keyOf(name))){alert('已有相同姓名');t.value=p.name;return;}p.name=name;savePeopleRemote();return;}
      if(t.dataset.pmFactory){meta.profiles[String(t.dataset.pmFactory)]={...profileOf(t.dataset.pmFactory),factoryId:String(t.value||''),groupId:''};saveMetaRemote().then(renderPeople);return;}
      if(t.dataset.pmGroup){const g=groupById(t.value);meta.profiles[String(t.dataset.pmGroup)]={...profileOf(t.dataset.pmGroup),groupId:String(t.value||''),factoryId:g?String(g.factoryId):profileOf(t.dataset.pmGroup).factoryId};saveMetaRemote();return;}
      if(t.dataset.pmCat){const id=String(t.dataset.person);const row=t.closest('[data-person-row]');const ids=[...row.querySelectorAll('[data-pm-cat]:checked')].map(x=>String(x.dataset.pmCat));meta.assignments[id]=ids;saveMetaRemote();return;}
      if(t.dataset.groupName){const g=groupById(t.dataset.groupName);const name=norm(t.value);if(!g||!name)return;if(groups().some(x=>x.id!==g.id&&String(x.factoryId)===String(g.factoryId)&&keyOf(x.name)===keyOf(name))){alert('此廠區已有相同組別');t.value=g.name;return;}g.name=name;saveMetaRemote();return;}
      if(t.dataset.categoryName){const c=categories().find(x=>String(x.id)===String(t.dataset.categoryName));const name=norm(t.value);if(!c||!name)return;if(name==='未分類'){alert('「未分類」為系統自動分類');t.value=c.name;return;}if(categories().some(x=>x.id!==c.id&&keyOf(x.name)===keyOf(name))){alert('已有相同人員類別');t.value=c.name;return;}c.name=name;saveMetaRemote();return;}
      if(t.dataset.pa3Person){const id=String(t.dataset.pa3Person);t.checked?selectedOwnerIds.add(id):selectedOwnerIds.delete(id);syncOwner();renderOwnerChips();return;}
    });
  }

  function observe() {
    const modal=document.getElementById('modal');
    if(modal&&!modal.dataset.pm3Observed){modal.dataset.pm3Observed='1';new MutationObserver(()=>{if(!modal.classList.contains('hidden'))setTimeout(hydrateTaskModal,0);}).observe(modal,{attributes:true,attributeFilter:['class']});}
    new MutationObserver(()=>{ensureTabs();ensureAssignmentPanel();if(customMode==='people'&&!document.getElementById('pm-v3-host'))renderPeople();else if(customMode==='groups'&&!document.getElementById('pm-v3-host'))renderGroups();else if(customMode==='categories'&&!document.getElementById('pm-v3-host'))renderCategories();}).observe(document.body,{childList:true,subtree:true});
  }

  function boot() {
    injectStyle();
    basic=readBasic();meta=readMeta();migrateLegacyOnce();
    ensureTabs();ensureAssignmentPanel();bindEvents();observe();setupFirestore();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
