// R0.2 schema: 可供 UI、Excel 匯入與測試共用。
export const COL = Object.freeze({
  supervisors: 'ehs_supervisor_board_r0_supervisors',
  records: 'ehs_supervisor_board_r0_records',
  history: 'ehs_supervisor_board_r0_history'
});
export const FIELDS = ['date','supervisorId','title','content','source','sourceSelections','sourceOther','note','status','archived'];
export function str(value, max=12000){return String(value??'').trim().slice(0,max+1);}
export function validDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value)))return false;
  const d=new Date(value+'T00:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===value;
}
export function normalizeSupervisor(obj){
  const s={id:str(obj.id,120),name:str(obj.name,100),title:str(obj.title,120),department:str(obj.department,160),active:obj.active!==false,order:Number(obj.order??100)};
  if(!s.name||s.name.length>100)throw Error('主管姓名必填，且不可超過100字');
  if(s.title.length>120||s.department.length>160)throw Error('主管職稱或單位過長');
  if(!Number.isInteger(s.order)||s.order<0||s.order>99999)throw Error('主管排序需為0至99999的整數');
  if(s.id.length>120)throw Error('主管ID過長');
  return s;
}
export function supervisorSnapshot(s){return {name:s.name,title:s.title||'',department:s.department||''};}
export function normalizeRecord(obj,supervisors,{existing=null}={}){
  // 舊紀錄可不含標題及來源選項；本次不搬移或回寫它們。
  const title=str(obj.title??existing?.title??'',160);
  const selections=obj.sourceSelections===undefined?(existing?.sourceSelections||[]):obj.sourceSelections;
  if(!Array.isArray(selections)||selections.length>40)throw Error('依據來源選項格式無效');
  const sourceSelections=selections.map(v=>({id:str(v?.id,120),name:str(v?.name,100)}));
  if(sourceSelections.some(v=>!v.id||!v.name||v.id.length>120||v.name.length>100))throw Error('依據來源選項內容無效');
  if(new Set(sourceSelections.map(x=>x.id)).size!==sourceSelections.length)throw Error('不可重複選擇相同來源');
  const r={id:str(obj.id,120),date:str(obj.date,20),supervisorId:str(obj.supervisorId,120),title,content:str(obj.content,12000),source:str(obj.source,6000),sourceSelections,sourceOther:str(obj.sourceOther??existing?.sourceOther??'',1200),note:str(obj.note,12000),status:str(obj.status,100),archived:obj.archived===true};
  if(!validDate(r.date))throw Error('指示日期無效，請使用YYYY-MM-DD');
  if(!existing&&!r.title)throw Error('新增指示必須填寫標題');
  if(r.title.length>160)throw Error('指示標題不可超過160字');
  if(!r.content||r.content.length>12000)throw Error('指示內容必填，且不可超過12000字');
  if(r.source.length>6000||r.note.length>12000||r.status.length>100)throw Error('依據來源、備註或狀態文字過長');
  const supervisor=supervisors.find(s=>s.id===r.supervisorId);
  if(!supervisor)throw Error('找不到指定主管ID');
  if(!existing && supervisor.active===false)throw Error('新增指示不可選擇已停用主管');
  if(existing && existing.supervisorId===r.supervisorId && existing.supervisorSnapshot){
    r.supervisorSnapshot=structuredClone(existing.supervisorSnapshot);
  }else{
    r.supervisorSnapshot=supervisorSnapshot(supervisor);
  }
  return r;
}
export function recordChanged(a,b){
  return FIELDS.some(k=>k==='sourceSelections'?JSON.stringify(a?.[k]||[])!==JSON.stringify(b?.[k]||[]):(a?.[k]??'')!==(b?.[k]??'')) || JSON.stringify(a?.supervisorSnapshot||{})!==JSON.stringify(b?.supervisorSnapshot||{});
}
export function supervisorChanged(a,b){return ['name','title','department','active','order'].some(k=>a?.[k]!==b?.[k]);}
export function ownId(){return globalThis.crypto?.randomUUID?.()??('id_'+Date.now()+'_'+Math.random().toString(36).slice(2));}


// R0.2 狀態字典存在獨立設定文件，不更動既有 record.status 文字，避免舊歷史被覆寫。
export const DEFAULT_STATUSES = Object.freeze([
  {id:'status-active', name:'持續有效', description:'主管要求目前仍須遵守', active:true, order:10},
  {id:'status-paused', name:'暫停適用', description:'主管要求暫時停止適用', active:true, order:20},
  {id:'status-revoked', name:'已撤銷', description:'主管已取消原要求', active:true, order:30},
  {id:'status-replaced', name:'已取代', description:'已有其他指示取代原要求', active:true, order:40},
  {id:'status-pending', name:'待確認', description:'尚須釐清主管要求', active:true, order:50}
]);
export const initialStatuses=()=>DEFAULT_STATUSES.map(item=>({...item}));
export function normalizeStatus(obj){
  const item={id:str(obj.id,120), name:str(obj.name,100), description:str(obj.description,200), active:obj.active!==false, order:Number(obj.order??100)};
  if(!item.id || item.id.length>120)throw Error('狀態 ID 無效');
  if(!item.name || item.name.length>100)throw Error('狀態名稱必填且不可超過100字');
  if(item.description.length>200)throw Error('狀態說明不可超過200字');
  if(!Number.isInteger(item.order)||item.order<0||item.order>99999)throw Error('狀態排序需為0至99999的整數');
  return item;
}
export function normalizeStatusList(list){
  if(!Array.isArray(list)||list.length>100)throw Error('狀態選項最多100種');
  const ids=new Set(),names=new Set();
  return list.map(input=>{
    const item=normalizeStatus(input);
    if(ids.has(item.id))throw Error('狀態 ID 重複：'+item.id);
    if(names.has(item.name))throw Error('狀態名稱不可重複：'+item.name);
    ids.add(item.id);names.add(item.name);return item;
  });
}
export const sortStatusOptions=items=>items.slice().sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,'zh-TW'));

// R0.4 來源字典：選項 ID 穩定；每筆指示另存來源名稱快照，保護更名後的歷史。
export const DEFAULT_SOURCES=Object.freeze([
  {id:'source-meeting',name:'主管會議',description:'',active:true,order:10},
  {id:'source-phone',name:'電話',description:'',active:true,order:20},
  {id:'source-line',name:'LINE',description:'',active:true,order:30},
  {id:'source-email',name:'Email',description:'',active:true,order:40},
  {id:'source-document',name:'公文',description:'',active:true,order:50},
  {id:'source-other',name:'其他',description:'',active:true,order:60,allowCustom:true}
]);
export const initialSources=()=>DEFAULT_SOURCES.map(item=>({...item}));
export function normalizeSource(obj){
  const item={id:str(obj.id,120),name:str(obj.name,100),description:str(obj.description,200),active:obj.active!==false,order:Number(obj.order??100),allowCustom:obj.allowCustom===true||obj.id==='source-other'};
  if(!item.id||item.id.length>120||!item.name||item.name.length>100)throw Error('來源 ID 或名稱無效');
  if(item.description.length>200||!Number.isInteger(item.order)||item.order<0||item.order>99999)throw Error('來源說明或排序不合法');
  return item;
}
export function normalizeSourceList(list){
  if(!Array.isArray(list)||list.length>100)throw Error('依據來源最多100種');
  const ids=new Set(),names=new Set();return list.map(raw=>{const s=normalizeSource(raw);
    if(ids.has(s.id)||names.has(s.name))throw Error('依據來源ID或名稱重複：'+s.name);
    ids.add(s.id);names.add(s.name);return s;
  });
}
export const sortSourceOptions=items=>items.slice().sort((a,b)=>a.order-b.order||a.name.localeCompare(b.name,'zh-TW'));
export function sourceUsed(item,records){
  return records.some(r=>(r.sourceSelections||[]).some(s=>s.id===item.id||s.name===item.name)
    || (!(r.sourceSelections||[]).length && String(r.source||'').includes(item.name)));
}
