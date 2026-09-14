export const TITLE = '防止貯存系統污染地下水體-貯存設施統計表';
export const TYPES = ['地上儲槽','地下儲槽','貯存容器'];
export const CAPACITIES = ['1,000 公秉以上（含 1,000）','未滿 1,000 公秉'];
export const REQUIREMENTS = ['需監測','免監測','待確認'];
export const METHODS = ['地下水監測','土壤氣體監測'];
export const emptyState = () => ({facilities:[],groups:{}});
export const emptyMonitoring = () => ({methods:[],wells:null,months:[],alternative:'',result:''});
const fail = message => {throw new Error(message);};
const validText = (x,max,required=false) => typeof x==='string' && x.length<=max && (!required||x.trim().length>0);
const validId = id => typeof id==='string' && /^[\w-]{1,100}$/.test(id) && !['__proto__','constructor','prototype'].includes(id);
export function validateMonitoring(g) {
 if(!g||!Array.isArray(g.methods)||g.methods.some(x=>!METHODS.includes(x))||new Set(g.methods).size!==g.methods.length)fail('監測方式無效。');
 if(g.wells!==null&&(!Number.isInteger(g.wells)||g.wells<0||g.wells>99999))fail('監測井數需為 0～99999 的整數，或留空。');
 if(!Array.isArray(g.months)||g.months.some(x=>!Number.isInteger(x)||x<1||x>12)||new Set(g.months).size!==g.months.length)fail('監測月份需為 1～12 月，且不可重複。');
 if(!validText(g.alternative,2000)||!validText(g.result,2000))fail('替代方案及申報結果各限 2,000 字。');
 return g;
}
export function validateState(state) {
 if(!state||!Array.isArray(state.facilities)||!state.groups||Array.isArray(state.groups)||typeof state.groups!=='object')fail('資料格式無效。');
 if(state.facilities.length>1000)fail('本表最多 1,000 筆設施。');
 const ids=new Set(),used=new Set(),names=new Set();
 for(const f of state.facilities){
  if(!validId(f.id)||ids.has(f.id))fail('設施識別資料重複或無效。');ids.add(f.id);
  if(!TYPES.includes(f.type)||!CAPACITIES.includes(f.capacity)||!REQUIREMENTS.includes(f.requirement))fail('請選擇設施類型、容積級距及監測需求。');
  for(const k of ['site','department','name'])if(!validText(f[k],100,true))fail('廠區、廠處及設施名稱為必填，各限 100 字。');
  for(const k of ['material','listedItem'])if(!validText(f[k],100))fail('貯存物種及列管項目各限 100 字。');
  const key=JSON.stringify([f.site,f.department,f.type,f.name]);if(names.has(key))fail('相同廠區、廠處及類型中，設施名稱不可重複。');names.add(key);
  if(!validId(f.groupId)||!Object.hasOwn(state.groups,f.groupId))fail('設施缺少監測資料。');used.add(f.groupId);
 }
 for(const [id,g] of Object.entries(state.groups)){if(!validId(id)||!used.has(id))fail('存在未使用或無效的監測資料。');validateMonitoring(g);}
 if(new TextEncoder().encode(JSON.stringify(state)).length>750000)fail('資料量已接近儲存上限，請縮短備註內容。');
 return state;
}
export function cleanup(state){const used=new Set(state.facilities.map(f=>f.groupId));for(const id of Object.keys(state.groups))if(!used.has(id))delete state.groups[id];return state;}
export function filterFacilities(state,{type='',site='',department='',query=''}={}){
 const q=query.trim().toLocaleLowerCase();
 return state.facilities.filter(f=>(!type||f.type===type)&&(!site||f.site===site)&&(!department||f.department===department)&&(!q||[f.name,f.material,f.listedItem,f.site,f.department,state.groups[f.groupId]?.alternative,state.groups[f.groupId]?.result].join(' ').toLocaleLowerCase().includes(q)));
}
export function statistics(state,rows=state.facilities){
 const groupIds=[...new Set(rows.map(f=>f.groupId))];
 return {total:rows.length,types:TYPES.map(type=>rows.filter(f=>f.type===type).length),monitored:rows.filter(f=>f.requirement==='需監測').length,wells:groupIds.reduce((n,id)=>n+(state.groups[id].wells??0),0),unknownWells:groupIds.filter(id=>state.groups[id].wells===null).length};
}
export function members(state,id){return state.facilities.filter(f=>f.groupId===id);}
export function shareMonitoring(state,ids,monitoring,newId){
 const next=structuredClone(state),selected=next.facilities.filter(f=>ids.includes(f.id));
 if(selected.length<2||selected.length!==new Set(ids).size)fail('請至少選擇兩筆現有設施。');
 if(new Set(selected.map(f=>f.site)).size!==1)fail('共用監測設施必須位於同一廠區。');
 if(!validId(newId)||Object.hasOwn(next.groups,newId))fail('共用監測識別資料無效。');
 next.groups[newId]=structuredClone(validateMonitoring(monitoring));
 selected.forEach(f=>{f.groupId=newId;});return validateState(cleanup(next));
}
export function detachMonitoring(state,id,newId){
 const next=structuredClone(state),f=next.facilities.find(f=>f.id===id);if(!f)fail('找不到設施。');
 if(!validId(newId)||Object.hasOwn(next.groups,newId))fail('監測識別資料無效。');
 f.groupId=newId;next.groups[newId]=emptyMonitoring();return validateState(cleanup(next));
}
export const HEADERS=['項次','類型','廠區','廠處','儲槽／容器名稱','貯存物種','列管項目','容積','監測需求','監測方式','土壤氣體監測井數量','監測月份','執行困難之替代方案','申報結果'];
export function exportRows(state,rows){return rows.map((f,i)=>{const g=state.groups[f.groupId];return [i+1,f.type,f.site,f.department,f.name,f.material,f.listedItem,f.capacity,f.requirement,g.methods.join('、'),g.wells??'',g.months.join('、'),g.alternative,g.result];});}
