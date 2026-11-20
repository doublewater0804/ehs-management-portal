// R0.3：純前端顯示輔助，不讀寫 Firestore；排序只作用於當日清單。
const STATUS_TEXT = Object.freeze({
  pending: '待辦', completed: '已完成', cancelled: '已取消', postponed: '已延期'
});

export function categoryColor(raw) {
  const color = String(raw || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return '#' + [...color.slice(1)].map(x => x + x).join('');
  }
  return '#9ca3af';
}

// 淺色分類背景，不依賴 CSS color-mix()，並保留固定深色文字對比度。
export function categoryTint(raw, whiteWeight = 0.85) {
  const hex = categoryColor(raw);
  const w = Math.max(0, Math.min(1, whiteWeight));
  const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return '#' + channels.map(c => Math.round(c * (1 - w) + 255 * w).toString(16).padStart(2, '0')).join('');
}

export function eventTimeText(event) {
  // 未指定開始時間時不產生「未定時間」；原本明確的全天活動仍顯示「全天」。
  return event.startTime || (event.allDay ? '全天' : '');
}

export function eventStatusText(event) {
  const status = event.status || 'pending';
  return STATUS_TEXT[status] || String(status);
}

// 第一層：分類管理順序；第二層：同分類有時間者早到晚，無時間者最後。
// 分類管理以既有 categories 陣列顯示，未新增 order 欄位或 Firebase 排序寫入。
export function sortDayEvents(items, categories) {
  const order = new Map(categories.map((c, i) => [c.id, i]));
  return [...items].sort((a, b) => {
    const ar = order.has(a.categoryId) ? order.get(a.categoryId) : Number.MAX_SAFE_INTEGER;
    const br = order.has(b.categoryId) ? order.get(b.categoryId) : Number.MAX_SAFE_INTEGER;
    if (ar !== br) return ar - br;
    if (ar === Number.MAX_SAFE_INTEGER) {
      const unknown = String(a.categoryId || '').localeCompare(String(b.categoryId || ''), 'zh-Hant');
      if (unknown) return unknown;
    }
    const aHasTime = Boolean(a.startTime), bHasTime = Boolean(b.startTime);
    if (aHasTime !== bHasTime) return aHasTime ? -1 : 1;
    if (aHasTime && bHasTime && a.startTime !== b.startTime)
      return a.startTime.localeCompare(b.startTime);
    const title = String(a.title || '').localeCompare(String(b.title || ''), 'zh-Hant');
    return title || String(a.id || '').localeCompare(String(b.id || ''), 'zh-Hant');
  });
}
