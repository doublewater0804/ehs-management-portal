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
