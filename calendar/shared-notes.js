// EHS Smart Calendar R0.5 — shared note and legacy month-note migration helpers.
// Pure helpers: no Firebase writes, no DOM, and no external dependencies.
export const SHARED_NOTES_MAX_BYTES = 800000; // below Firestore's 1 MiB document cap
const encoder = new TextEncoder();
export function storedBytes(text) {
  return encoder.encode(String(text ?? '')).byteLength;
}
export function assertNoteSize(text) {
  if (storedBytes(text) > SHARED_NOTES_MAX_BYTES) {
    throw new Error('共用備註超過安全儲存上限（約 800 KB）。未寫入任何資料；舊月份備註仍完整保留，請先備份及分批整理。');
  }
  return text;
}
export function monthLabel(id) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(id));
  return match ? `${match[1]}年${Number(match[2])}月` : `舊備註 ${id}`;
}
export function collectLegacyNotes(records) {
  return records.map(x => ({id:String(x.id), text:String(x.text ?? '')}))
    .filter(x => x.text.trim().length > 0)
    .sort((a,b) => {
      const validA=/^\d{4}-(0[1-9]|1[0-2])$/.test(a.id);
      const validB=/^\d{4}-(0[1-9]|1[0-2])$/.test(b.id);
      if(validA!==validB)return validA?-1:1;
      return a.id.localeCompare(b.id, 'en');
    });
}
export function noteMigrationPlan(sharedDoc, legacy) {
  const source=collectLegacyNotes(legacy);
  const imported=new Set(Array.isArray(sharedDoc?.migratedMonthIds)?sharedDoc.migratedMonthIds.map(String):[]);
  const existingText=String(sharedDoc?.text ?? '');
  const toAdd=[];
  const already=[];
  for(const entry of source){
    const section=`【${monthLabel(entry.id)}】\n${entry.text}`;
    // A previously hand-merged identical section must not be silently duplicated.
    if(imported.has(entry.id) || existingText.includes(section))already.push(entry.id);
    else toAdd.push({...entry,section});
  }
  const idsToMark=already.filter(id=>!imported.has(id));
  const combined=toAdd.length
    ? [existingText,...toAdd.map(x=>x.section)].filter(x=>x.length).join('\n\n')
    : existingText;
  assertNoteSize(combined);
  return {combined, toAdd, already, idsToMark, nonemptyCount:source.length,
    importedMonthIds:[...new Set([...imported,...already,...toAdd.map(x=>x.id)])].sort((a,b)=>a.localeCompare(b,'en'))};
}
