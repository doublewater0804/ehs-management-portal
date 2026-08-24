(() => {
  if (window.__flareExclusionRecovery20260824Loaded) return;
  window.__flareExclusionRecovery20260824Loaded = true;

  const HISTORY_KEY = 'flare_exclusion_history_v1';
  const MARKER_ID = 'recovery-20260824-mapped-and-applied-v1';
  const targets = [
    {
      key: '2026|SM廠麥寮|2026-01-03',
      factory: 'SM廠麥寮',
      date: '2026-01-03',
      reason: '製程廢氣未排放至廢氣燃燒塔',
      sourceEvidence: '原始截圖：麥寮區總計 5 天，但 PC廠 5 天皆仍納入；CSV 唯一額外日為 SM廠麥寮 2026-01-03。'
    },
    {
      key: '2026|HAC廠|2026-08-24',
      factory: 'HAC廠',
      date: '2026-08-24',
      reason: '流量錯誤',
      sourceEvidence: '原始截圖：HAC 定檢僅 08/13 共 1 天；CSV 另有 HAC 2026-08-24 定檢資料，且原已剔除第二列為藍色定檢、原因流量錯誤。'
    }
  ];

  let applying = false;
  let finished = false;

  function readHistory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeHistory(history) {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-500)));
  }

  function hasTargetEvent(state, target) {
    return Array.isArray(state?.events) && state.events.some(event =>
      String(event?.factory || '').trim() === target.factory &&
      String(event?.date || '').trim() === target.date
    );
  }

  async function applyRecovery() {
    if (applying || finished) return;
    if (window.__flareCloudHydrated !== true) return;
    if (typeof window.__getFlareCloudState !== 'function') return;
    if (typeof window.__flareCloudPush !== 'function' || window.__flareCloudPush.__flareSyncGuardWriter !== true) return;

    const history = readHistory();
    if (history.some(item => item?.historyId === MARKER_ID)) {
      finished = true;
      return;
    }

    const state = window.__getFlareCloudState();
    if (!state || !targets.every(target => hasTargetEvent(state, target))) return;

    applying = true;
    try {
      const exclusions = state.excludedDays && typeof state.excludedDays === 'object'
        ? { ...state.excludedDays }
        : {};
      const recoveredAt = new Date().toISOString();
      let changed = false;

      targets.forEach(target => {
        if (!exclusions[target.key]) {
          exclusions[target.key] = {
            factory: target.factory,
            date: target.date,
            reason: target.reason,
            createdAt: '2026-08-24T09:49:00+08:00',
            recoveredAt,
            recoveryId: MARKER_ID
          };
          changed = true;
        }
      });

      const nextHistory = [...history];
      targets.forEach(target => {
        const historyId = `${MARKER_ID}|${target.key}`;
        if (!nextHistory.some(item => item?.historyId === historyId)) {
          nextHistory.push({
            historyId,
            action: 'recovered-active-exclusion',
            key: target.key,
            factory: target.factory,
            date: target.date,
            reason: target.reason,
            sourceEvidence: target.sourceEvidence,
            recoveredAt,
            archivedAt: recoveredAt
          });
        }
      });
      nextHistory.push({
        historyId: MARKER_ID,
        action: 'recovery-applied',
        recoveredAt,
        archivedAt: recoveredAt,
        recordCount: targets.length
      });
      writeHistory(nextHistory);

      state.excludedDays = exclusions;
      if (typeof window.setFirebaseSyncStatus === 'function') {
        window.setFirebaseSyncStatus(changed ? '☁️ 正在復原 2 筆人工剔除資料…' : '☁️ 正在確認剔除資料歷程…', 'info');
      }

      await window.__flareCloudPush(state);
      finished = true;
      if (typeof window.setFirebaseSyncStatus === 'function') {
        window.setFirebaseSyncStatus('☁️ 2 筆人工剔除資料已復原並保存', 'ok');
      }
    } catch (error) {
      console.error('FLARE 兩筆剔除資料復原失敗', error);
      if (typeof window.setFirebaseSyncStatus === 'function') {
        window.setFirebaseSyncStatus('☁️ 剔除資料復原失敗，未覆寫現有資料', 'err');
      }
    } finally {
      applying = false;
    }
  }

  const timer = setInterval(applyRecovery, 100);
  window.addEventListener('load', () => setTimeout(applyRecovery, 0));
  setTimeout(() => clearInterval(timer), 60000);
})();
