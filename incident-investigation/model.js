export const RELEASE='20260918-v4';
export const AREAS=[['tw-north','台灣 · 北區'],['tw-central','台灣 · 中區'],['tw-south','台灣 · 南區'],['cn','大陸 · 寧波'],['vn','越南 · 仁澤']];
export const REGIONS=['北區','中區','南區'];
export const OPTIONS={ 'tw-north':['A 組','B 組','C 組'],'tw-central':['A 組','B 組','C 組'],'tw-south':['A 組','B 組','C 組'],cn:['第一組','第二組','第三組','第四組'],vn:['南亞 A 組','南亞 B 組','南亞 C 組','台化 D 組','台化 E 組','台化 F 組','河靜公司指派']};
export const STATES=['調查中','暫停調查','已完成'];
export const TW_FIELDS={department:'輪值事業部',supervisor:'督導主管',title:'職稱',supervisorMobile:'主管手機',supervisorPhone:'主管桌機',leader:'組長姓名',unit:'單位',expertise:'專長',leaderMobile:'組長手機',leaderPhone:'組長桌機'};
export const PERSON_FIELDS={name:'姓名',title:'職稱',unit:'單位',expertise:'專長',mobile:'手機',phone:'桌機',review:'核對註記'};
export const clone=v=>structuredClone(v);
const person=role=>({role,...Object.fromEntries(Object.keys(PERSON_FIELDS).map(k=>[k,'']))});
function teams(area){return OPTIONS[area].filter(g=>g!=='河靜公司指派').map((group,i)=>({id:area+'-'+i,group,company:area==='cn'?'台化':i<3?'南亞':'台化',people:(area==='cn'?['督導主管','組長','組員 1','組員 2','執行幹事']:['督導主管','組長','執行幹事','組員 1－安衛環','組員 2－製程','組員 3－電儀','組員 4－機械']).map(person)}));}
export function normalize(raw={}){
 return {...clone(raw),schemaVersion:2,version:raw.version??0,
 rows:raw.rows??REGIONS.flatMap(region=>['A','B','C'].map(group=>({region,group,...Object.fromEntries(Object.keys(TW_FIELDS).map(k=>[k,'']))}))),duty:raw.duty??{},notes:raw.notes??[],revision:raw.revision??'',
 overseas:raw.overseas??{cn:teams('cn'),vn:teams('vn')},overseasDuty:raw.overseasDuty??{cn:'',vn:''},records:raw.records??[],
 regionalRules:raw.regionalRules??{cn:'',vn:''},sourceVersions:raw.sourceVersions??{cn:'',vn:''},backupPersonnel:raw.backupPersonnel??'',supplement:raw.supplement??''};
}
const str=(s,n=200)=>typeof s==='string'&&s.length<=n;
export function validate(d){
 const fail=()=>{throw Error('資料格式不正確，請檢查欄位內容或匯入檔。');};
 if(!d||d.schemaVersion!==2||!Number.isInteger(d.version)||d.version<0||!Array.isArray(d.rows)||d.rows.length!==9)fail();
 for(const region of REGIONS)for(const group of ['A','B','C']){const rows=d.rows.filter(r=>r.region===region&&r.group===group);if(rows.length!==1||Object.keys(TW_FIELDS).some(k=>!str(rows[0][k],150)))fail();}
 for(const r of REGIONS)if(d.duty?.[r]&&!['A','B','C'].includes(d.duty[r]))fail();
 if(!Array.isArray(d.notes)||d.notes.length>30||d.notes.some(n=>!str(n,2000))||!str(d.revision)||!str(d.backupPersonnel,10000)||!str(d.supplement,10000))fail();
 for(const a of ['cn','vn']){
  if(!Array.isArray(d.overseas?.[a])||d.overseas[a].length!==(a==='cn'?4:6)||!str(d.regionalRules?.[a],20000)||!str(d.sourceVersions?.[a]))fail();
  if(d.overseasDuty?.[a]&&!OPTIONS[a].includes(d.overseasDuty[a]))fail();
  const ids=new Set(),groups=new Set();for(const t of d.overseas[a]){if(!str(t.id)||ids.has(t.id)||groups.has(t.group)||!OPTIONS[a].includes(t.group)||!str(t.company)||!Array.isArray(t.people)||t.people.length!==(a==='cn'?5:7))fail();ids.add(t.id);groups.add(t.group);for(const p of t.people)if(!str(p.role)||Object.keys(PERSON_FIELDS).some(k=>!str(p[k],250)))fail();}
 }
 if(!Array.isArray(d.records)||d.records.length>300)fail();
 const ids=new Set();for(const r of d.records){if(!str(r.id)||!r.id||ids.has(r.id)||!OPTIONS[r.area]||!OPTIONS[r.area].includes(r.group)||!str(r.supervisor)||!STATES.includes(r.status)||(r.nextGroup&&!OPTIONS[r.area].includes(r.nextGroup))||!validDate(r.date))fail();ids.add(r.id);}
 if(new TextEncoder().encode(JSON.stringify(d)).length>800000)throw Error('資料接近儲存上限，請縮短文字內容。');
 return d;
}
export function validDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const t=new Date(s+'T00:00:00Z');return !isNaN(t)&&t.toISOString().slice(0,10)===s;}
export function getDuty(d,a){const i=AREAS.findIndex(x=>x[0]===a);return i<3?(d.duty[REGIONS[i]]?d.duty[REGIONS[i]]+' 組':''):d.overseasDuty[a];}
export function setDuty(d,a,v){const i=AREAS.findIndex(x=>x[0]===a);if(i<3)d.duty[REGIONS[i]]=v?v[0]:'';else d.overseasDuty[a]=v;}
export function mergeSeed(current,incoming,applyDuty=false,replaceOverseas=false){
 const d=clone(current),s=validate(normalize(incoming));
 // Import fills missing content only; it never replaces an existing edited roster.
 for(const r of d.rows){const seed=s.rows.find(x=>x.region===r.region&&x.group===r.group);if(Object.keys(TW_FIELDS).every(k=>!r[k]))Object.assign(r,seed);}
 for(const a of ['cn','vn']){
  for(const t of d.overseas[a]){const seed=s.overseas[a].find(x=>x.group===t.group);if(seed&&t.people.every(p=>Object.keys(PERSON_FIELDS).every(k=>!p[k])))Object.assign(t,clone(seed));}
  if(!d.regionalRules[a])d.regionalRules[a]=s.regionalRules[a];if(!d.sourceVersions[a])d.sourceVersions[a]=s.sourceVersions[a];
 }
 const fingerprint=r=>[r.area,r.group,r.date,r.supervisor].join('|');
 for(const r of s.records)if(!d.records.some(x=>x.id===r.id||fingerprint(x)===fingerprint(r)))d.records.push(clone(r));
 for(const k of ['revision','backupPersonnel','supplement'])if(!d[k])d[k]=s[k];if(!d.notes.length)d.notes=clone(s.notes);
 if(replaceOverseas){d.overseas=clone(s.overseas);d.regionalRules=clone(s.regionalRules);d.sourceVersions=clone(s.sourceVersions);d.backupPersonnel=s.backupPersonnel;}
 if(applyDuty)for(const [a] of AREAS)setDuty(d,a,getDuty(s,a));
 return validate(d);
}
