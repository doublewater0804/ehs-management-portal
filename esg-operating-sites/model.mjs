export const fields=['公司別','FID','地區','主要公司','公司(英文)','主要產業','廠區名稱(廠登)','英文名稱','地址','英文地址','聯繫窗口'];
export const dropdown=[0,2,3,5];
export const clean=v=>String(v??'').trim();
export const norm=v=>clean(v).normalize('NFKC').replace(/\s+/g,' ').toLowerCase();
export const region=v=>{let s=clean(v);return /香港/.test(s)?'香港':/澳門/.test(s)?'澳門':s.replace(/^臺灣/,'台灣').replace(/\s+/g,' ');};
export const month=v=>{if(!v)return '';let d=v.toDate?v.toDate():new Date(v);if(!Number.isFinite(+d))return '';return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit'}).format(d);};
export const dateTime=v=>{if(!v)return '';let d=v.toDate?v.toDate():new Date(v);return Number.isFinite(+d)?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei',dateStyle:'short',timeStyle:'medium'}).format(d):'';};
export const values=a=>fields.map((_,i)=>clean(a?.[i]));
export const key=a=>JSON.stringify(values(a).map(norm));
export const identity=a=>JSON.stringify([0,3,5,6].map(i=>norm(a[i])));
export const diff=(a,b)=>fields.flatMap((name,i)=>clean(a?.[i])===clean(b?.[i])?[]:[{name,before:clean(a?.[i]),after:clean(b?.[i])}]);
export function validate(a){a=values(a);if(!a[0]||!a[3]||!a[6])throw Error('公司別、主要公司、廠區名稱為必填。');if(a.some(v=>v.length>12000))throw Error('單一欄位不可超過12000字。');return a;}
export function parseRows(matrix){
 const header=matrix[0]||[], indexes=fields.map(f=>header.findIndex(h=>norm(h).replace(/\s/g,'')===norm(f).replace(/\s/g,'')));if(indexes.includes(-1))throw Error('Excel 缺少必要欄位：'+fields.filter((_,i)=>indexes[i]<0).join('、'));
 const idIndex=header.findIndex(h=>clean(h)==='系統ID');return matrix.slice(1).flatMap((row,i)=>{const a=indexes.map(j=>clean(row[j]));if(!a.some(Boolean))return [];try{return [{row:i+2,values:validate(a),id:clean(row[idIndex])}];}catch(e){throw Error(`Excel 第 ${i+2} 列：${e.message}`);}});
}
export function planImport(incoming,records){
 const active=records.filter(r=>!r.deleted),used=new Set(),seen=new Set(),result=[];
 for(const x of incoming){let k=key(x.values);let p={...x,kind:'new',target:'',candidates:[],include:true};
  if(seen.has(k)&&!x.id){p.kind='duplicate';p.include=false;}else if(x.id){let r=records.find(r=>r.id===x.id);if(!r||r.deleted||used.has(x.id)){p.kind='review';p.include=false;p.candidates=r&&!r.deleted?[r.id]:[];}else{p.target=r.id;p.kind=diff(r.values,x.values).length?'update':'same';p.include=p.kind==='update';used.add(r.id);}}
  else{let exact=active.filter(r=>!used.has(r.id)&&key(r.values)===k);if(exact.length){p.target=exact[0].id;p.kind='same';p.include=false;used.add(p.target);}else{let matches=active.filter(r=>!used.has(r.id)&&(identity(r.values)===identity(x.values)||(norm(x.values[1])&&norm(r.values[1])===norm(x.values[1]))||(norm(r.values[3])===norm(x.values[3])&&norm(r.values[6])===norm(x.values[6]))));let trash=records.some(r=>r.deleted&&key(r.values)===k);if(matches.length||trash){p.kind='review';p.include=false;p.candidates=matches.map(r=>r.id);}}}
  seen.add(k);result.push(p);
 }
 return {rows:result,missing:active.filter(r=>!used.has(r.id))};
}
export function stats(records){const active=records.filter(r=>!r.deleted);let groups={};for(const [label,i] of [['公司別',0],['主要公司',3],['地區',2],['主要產業',5]]){let m=new Map();for(const r of active){let v=(i===2?(r.region||region(r.values[i])):r.values[i])||'未填寫';m.set(v,(m.get(v)||0)+1);}groups[label]=[...m].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'zh-Hant'));}let tw=active.filter(r=>/^台灣/.test(r.region||region(r.values[2]))).length;let unknown=active.filter(r=>!clean(r.region||region(r.values[2]))).length;return {total:active.length,companies:groups['主要公司'].filter(x=>x[0]!=='未填寫').length,tw,overseas:active.length-tw-unknown,unknown,groups};}

// R0.2: group active records by company category and normalized legal company name.
// Never infer ownership or a legal domicile from a site address.
const parentNames={'台化':'台灣化學纖維股份有限公司','福懋':'福懋興業股份有限公司','台塑生醫':'台塑生醫科技股份有限公司'};
const groupOrder=['台化','福懋','台塑生醫'];
const companyNorm=v=>norm(v).replace(/^臺灣/,'台灣');
const compare=(a,b)=>a.localeCompare(b,'zh-Hant');
export function countryOf(v){
 const s=region(v), n=norm(s);
 if(!n)return '';
 if(/^(台灣|taiwan)(?:\s|$)/i.test(s)||/^(台灣|臺灣)[\u4e00-\u9fff]/.test(s))return '台灣';
 if(/^香港$|^hong kong$/i.test(s))return '香港';
 if(/^澳門$|^maca[ou]$/i.test(s))return '澳門';
 if(/^apia$|^samoa$|^薩摩亞(?:\s|$)/i.test(s))return '薩摩亞';
 const countries=['中國','越南','日本','韓國','開曼群島','美國','加拿大','英國','法國','德國','澳洲','澳大利亞','紐西蘭','新加坡','馬來西亞','泰國','印尼','印度','菲律賓','柬埔寨','緬甸','寮國','義大利','荷蘭','比利時','西班牙','瑞士','瑞典','丹麥','挪威','芬蘭','墨西哥','巴西','阿聯酋','南非','英屬維京群島','新西蘭'];
 const c=countries.find(c=>s===c||s.startsWith(c+' '));
 if(c)return ({澳大利亞:'澳洲',新西蘭:'紐西蘭'})[c]||c;
 const en={china:'中國',vietnam:'越南',japan:'日本',korea:'韓國','south korea':'韓國','cayman islands':'開曼群島',usa:'美國','united states':'美國',singapore:'新加坡'};
 return Object.entries(en).find(([k])=>n===k||n.startsWith(k+' '))?.[1]||'';
}
export function companyOverview(records){
 const groups=new Map(), countries=new Set();let total=0;
 for(const r of records){if(r.deleted)continue;total++;const group=clean(r.values?.[0])||'未填寫公司別', name=clean(r.values?.[3])||'未填寫主要公司';
  const gk=companyNorm(group), ck=companyNorm(name);let g=groups.get(gk);if(!g){g={name:group,key:gk,companies:new Map()};groups.set(gk,g);}
  let c=g.companies.get(ck);if(!c){c={key:JSON.stringify([gk,ck]),name,group:g.name,parent:!!parentNames[g.name]&&companyNorm(parentNames[g.name])===ck,sites:[]};g.companies.set(ck,c);}
  const country=countryOf(clean(r.region)||r.values?.[2]);countries.add(country||'未分類');c.sites.push({record:r,country});
 }
 const counts={total:0,parent:0,domestic:0,overseas:0,uncertain:0,records:total};
 const result=[...groups.values()].map(g=>{const companies=[...g.companies.values()].map(c=>{const locations=[...new Set(c.sites.map(s=>s.country))].sort(compare);const hasDomestic=locations.includes('台灣'),hasOverseas=locations.some(x=>x&&x!=='台灣'),hasUnknown=locations.includes('');const category=c.parent?'parent':hasUnknown||hasDomestic&&hasOverseas?'uncertain':hasDomestic?'domestic':'overseas';return {...c,locations,category,issue:hasDomestic&&hasOverseas?'同時具有國內及海外紀錄':hasUnknown?'含未分類地區': '',country:category==='overseas'?(locations.length===1?locations[0]:'多國／地區'):''};}).sort((a,b)=>compare(a.name,b.name));
  const n={total:companies.length,parent:0,domestic:0,overseas:0,uncertain:0,records:0};for(const c of companies){n[c.category]++;n.records+=c.sites.length;counts[c.category]++;counts.total++;}return {name:g.name,key:g.key,companies,counts:n};
 }).sort((a,b)=>{const rank=n=>groupOrder.includes(n)?groupOrder.indexOf(n):99;return rank(a.name)-rank(b.name)||compare(a.name,b.name);});
 return {groups:result,counts,countries:[...countries].sort(compare)};
}
export function filterOverview(overview,filters={}){
 return overview.groups.filter(g=>!filters.group||g.key===filters.group).map(g=>({...g,companies:g.companies.flatMap(c=>{
  const sites=c.sites.filter(s=>{if(filters.scope==='domestic'&&s.country!=='台灣')return false;if(filters.scope==='overseas'&&(!s.country||s.country==='台灣'))return false;if(filters.scope==='unknown'&&s.country)return false;if(filters.country&&(s.country||'未分類')!==filters.country)return false;return !filters.q||norm([c.name,c.group,s.country,...s.record.values].join(' ')).includes(norm(filters.q));});
  return sites.length?[{...c,visibleSites:sites}]:[];
 })})).filter(g=>g.companies.length);
}
export function monthlyChanges(history){const m=new Map();for(const h of history){let k=month(h.at);if(!k||!['new','update','delete','restore'].includes(h.action))continue;if(!m.has(k))m.set(k,{new:0,update:0,delete:0,restore:0});m.get(k)[h.action]++;}return [...m].sort((a,b)=>b[0].localeCompare(a[0]));}
