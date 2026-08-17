/* EHS Task legacy personnel importer v1
 * Automatically imports the existing Basic Data people / units and historical task ownership
 * into the new Factory -> Group -> Person structure. It is idempotent and never rewrites
 * historical task records.
 */
(() => {
  'use strict';

  const BASIC_KEY = 'ESH_TASK_MASTER_DATA_V1';
  const META_KEY = 'ESH_TASK_PERSONNEL_META_V1';
  const TASK_KEY = 'ESH_MANAGEMENT_DATA_V86';
  const STATUS_KEY = 'ESH_TASK_PERSONNEL_IMPORT_STATUS_V1';
  const RELOAD_KEY = 'ESH_TASK_PERSONNEL_IMPORT_RELOAD_V1';
  const FOCUS_KEY = 'ESH_TASK_PERSONNEL_IMPORT_FOCUS_V1';

  const norm = s => String(s ?? '').trim().replace(/\s+/g, ' ');
  const keyOf = s => norm(s).toLocaleLowerCase('zh-Hant');
  const uid = p => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const readJson = (key, fallback) => {
    try {
      const v = JSON.parse(localStorage.getItem(key) || 'null');
      return v && typeof v === 'object' ? v : fallback;
    } catch (_) { return fallback; }
  };

  function splitOwners(value) {
    return String(value || '').split(/[、,，;；\n]+/).map(norm).filter(Boolean);
  }

  function normalizeMeta(raw) {
    const v = raw && typeof raw === 'object' ? raw : {};
    return {
      version: 3,
      categories: Array.isArray(v.categories) ? v.categories : [],
      groups: Array.isArray(v.groups) ? v.groups : [],
      assignments: v.assignments && typeof v.assignments === 'object' ? v.assignments : {},
      profiles: v.profiles && typeof v.profiles === 'object' ? v.profiles : {}
    };
  }

  function inferFactoryFromText(text, factories) {
    const source = keyOf(text);
    if (!source) return null;
    const matches = factories.filter(f => source.includes(keyOf(f.name)));
    return matches.length === 1 ? matches[0] : null;
  }

  function cleanGroupName(rawName, factoryName) {
    let name = norm(rawName);
    if (!name) return '';
    const escaped = String(factoryName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (escaped) {
      name = name
        .replace(new RegExp(`[（(]\\s*${escaped}\\s*[）)]$`, 'i'), '')
        .replace(new RegExp(`[-－—_/\\s]+${escaped}$`, 'i'), '')
        .trim();
    }
    return name || norm(rawName);
  }

  function groupByFactoryName(meta, factoryId, name) {
    return meta.groups.find(g => String(g.factoryId) === String(factoryId) && keyOf(g.name) === keyOf(name));
  }

  function ensureGroup(meta, factoryId, rawName, factoryName) {
    const name = cleanGroupName(rawName, factoryName);
    if (!factoryId || !name) return null;
    let group = groupByFactoryName(meta, factoryId, name);
    if (!group) {
      group = { id: uid('grp'), factoryId: String(factoryId), name, enabled: true };
      meta.groups.push(group);
    }
    return group;
  }

  function chooseMostFrequentPair(personName, tasks, factories) {
    const counts = new Map();
    tasks.forEach(task => {
      if (!splitOwners(task?.owner).some(n => keyOf(n) === keyOf(personName))) return;
      const factory = factories.find(f => keyOf(f.name) === keyOf(task?.factory));
      if (!factory) return;
      const groupName = norm(task?.unit);
      const key = `${factory.id}||${groupName}`;
      const current = counts.get(key) || { factory, groupName, count: 0 };
      current.count += 1;
      counts.set(key, current);
    });
    return [...counts.values()].sort((a, b) => b.count - a.count)[0] || null;
  }

  function buildMigration(basic, meta, tasks) {
    const factories = (Array.isArray(basic.factories) ? basic.factories : []).filter(f => f?.enabled !== false && norm(f?.name));
    const units = Array.isArray(basic.units) ? basic.units : [];
    const people = Array.isArray(basic.people) ? basic.people : [];
    const unitById = new Map(units.map(u => [String(u.id), u]));
    let changed = false;

    // First preserve all historical factory/group combinations.
    tasks.forEach(task => {
      const factory = factories.find(f => keyOf(f.name) === keyOf(task?.factory));
      if (!factory || !norm(task?.unit)) return;
      const before = meta.groups.length;
      ensureGroup(meta, factory.id, task.unit, factory.name);
      if (meta.groups.length !== before) changed = true;
    });

    // Old units such as 安衛處(新港) / 安衛處(麥寮) already carry a site hint.
    units.forEach(unit => {
      const factory = inferFactoryFromText(unit?.name, factories);
      if (!factory) return;
      const before = meta.groups.length;
      ensureGroup(meta, factory.id, unit.name, factory.name);
      if (meta.groups.length !== before) changed = true;
    });

    let assigned = 0;
    let unassigned = 0;
    const countsByFactory = {};

    people.forEach(person => {
      const id = String(person.id || uid('md'));
      if (!person.id) person.id = id;
      const oldProfile = meta.profiles[id] && typeof meta.profiles[id] === 'object' ? meta.profiles[id] : {};
      let factoryId = String(oldProfile.factoryId || '');
      let groupId = String(oldProfile.groupId || '');

      // If an existing group is known, recover its factory before doing any inference.
      if (!factoryId && groupId) {
        const existingGroup = meta.groups.find(g => String(g.id) === groupId);
        if (existingGroup) factoryId = String(existingGroup.factoryId);
      }

      const taskPair = chooseMostFrequentPair(person.name, tasks, factories);
      const oldUnit = unitById.get(String(person.unitId || ''));
      const unitFactory = oldUnit ? inferFactoryFromText(oldUnit.name, factories) : null;

      if (!factoryId) {
        if (taskPair?.factory) factoryId = String(taskPair.factory.id);
        else if (unitFactory) factoryId = String(unitFactory.id);
      }

      if (!groupId && factoryId) {
        const factory = factories.find(f => String(f.id) === factoryId);
        let rawGroupName = '';
        if (taskPair && String(taskPair.factory.id) === factoryId && taskPair.groupName) rawGroupName = taskPair.groupName;
        else if (oldUnit) rawGroupName = oldUnit.name;
        const group = ensureGroup(meta, factoryId, rawGroupName, factory?.name || '');
        if (group) groupId = String(group.id);
      }

      const archived = oldProfile.archived === true || person.enabled === false;
      const next = {
        factoryId,
        groupId,
        archived,
        archivedAt: archived ? String(oldProfile.archivedAt || new Date().toISOString()) : ''
      };

      if (JSON.stringify(oldProfile) !== JSON.stringify(next)) changed = true;
      meta.profiles[id] = next;
      if (!Array.isArray(meta.assignments[id])) meta.assignments[id] = [];

      if (factoryId) {
        assigned += 1;
        countsByFactory[factoryId] = (countsByFactory[factoryId] || 0) + 1;
      } else {
        unassigned += 1;
      }
    });

    const bestFactory = Object.entries(countsByFactory).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const focus = unassigned > (countsByFactory[bestFactory] || 0) ? '__unassigned__' : bestFactory;
    return { changed, assigned, unassigned, total: people.length, focus };
  }

  async function runImport() {
    try {
      let tries = 0;
      while (!window.__fb?.db && tries < 40) {
        await new Promise(r => setTimeout(r, 250));
        tries += 1;
      }
      if (!window.__fb?.db) return;

      const fs = await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js');
      const db = window.__fb.db;
      const basicRef = fs.doc(db, 'ehs_task_master_data', 'settings');
      const metaRef = fs.doc(db, 'ehs_task_personnel_meta', 'settings');

      const [basicSnap, metaSnap] = await Promise.all([fs.getDoc(basicRef), fs.getDoc(metaRef)]);
      const cloudBasic = basicSnap.exists() ? basicSnap.data() : readJson(BASIC_KEY, {});
      const localBasic = readJson(BASIC_KEY, {});
      const basic = {
        ...localBasic,
        ...cloudBasic,
        factories: Array.isArray(cloudBasic?.factories) ? cloudBasic.factories : (localBasic.factories || []),
        people: Array.isArray(cloudBasic?.people) ? cloudBasic.people : (localBasic.people || []),
        units: Array.isArray(cloudBasic?.units) ? cloudBasic.units : (localBasic.units || [])
      };

      let tasks = readJson(TASK_KEY, []);
      if (!Array.isArray(tasks)) tasks = [];
      try {
        const taskSnap = await fs.getDocs(fs.collection(db, 'ehs_tasks'));
        const cloudTasks = [];
        taskSnap.forEach(d => cloudTasks.push({ ...(d.data() || {}), id:d.id }));
        if (cloudTasks.length) tasks = cloudTasks;
      } catch (e) {
        console.warn('Legacy personnel import: cloud task history unavailable, using local cache.', e);
      }

      const meta = normalizeMeta(metaSnap.exists() ? metaSnap.data() : readJson(META_KEY, {}));
      const result = buildMigration(basic, meta, tasks);

      localStorage.setItem(BASIC_KEY, JSON.stringify(basic));
      localStorage.setItem(META_KEY, JSON.stringify(meta));
      localStorage.setItem(STATUS_KEY, JSON.stringify({
        importedAt:new Date().toISOString(),
        total:result.total,
        assigned:result.assigned,
        unassigned:result.unassigned
      }));

      if (result.changed || !metaSnap.exists()) {
        await fs.setDoc(metaRef, { ...meta, _updatedTs:fs.serverTimestamp() }, { merge:false });
      }

      if (result.focus) sessionStorage.setItem(FOCUS_KEY, result.focus);

      // The main personnel UI keeps an in-memory copy. Reload only once after a real import
      // so it immediately sees the cloud people and the migrated profiles.
      if (result.changed && !sessionStorage.getItem(RELOAD_KEY)) {
        sessionStorage.setItem(RELOAD_KEY, '1');
        location.reload();
        return;
      }

      focusImportedFactory();
      showImportStatus();
    } catch (e) {
      console.warn('Legacy personnel import failed', e);
    }
  }

  function focusImportedFactory() {
    const focus = sessionStorage.getItem(FOCUS_KEY);
    if (!focus) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      const select = document.getElementById('pm-factory');
      if (select && [...select.options].some(o => o.value === focus)) {
        if (select.value !== focus) {
          select.value = focus;
          select.dispatchEvent(new Event('change', { bubbles:true }));
        }
        sessionStorage.removeItem(FOCUS_KEY);
        clearInterval(timer);
      } else if (attempts > 30) {
        clearInterval(timer);
      }
    }, 250);
  }

  function showImportStatus() {
    const status = readJson(STATUS_KEY, null);
    if (!status) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      const host = document.getElementById('pm-v3-host');
      if (host && !document.getElementById('pm-import-status')) {
        const box = document.createElement('div');
        box.id = 'pm-import-status';
        box.className = 'mb-4 px-4 py-3 rounded-xl border border-emerald-200 bg-emerald-50 text-sm text-emerald-800';
        box.innerHTML = `<strong>既有人員已導入：</strong>${status.assigned} / ${status.total} 人已判斷廠區。${status.unassigned ? `另有 ${status.unassigned} 人無法由舊資料判斷廠區，請切換「未指定廠區」補設定。` : '全部已有廠區歸屬。'}`;
        host.insertBefore(box, host.firstChild);
        clearInterval(timer);
      } else if (attempts > 40) {
        clearInterval(timer);
      }
    }, 250);
  }

  runImport();
  window.addEventListener('load', () => {
    focusImportedFactory();
    showImportStatus();
  }, { once:true });
})();
