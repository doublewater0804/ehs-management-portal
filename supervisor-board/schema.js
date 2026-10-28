// R0.1 schema: 可供 UI、Excel 匯入與測試共用。
export const COL = Object.freeze({
  supervisors: 'ehs_supervisor_board_r0_supervisors',
  records: 'ehs_supervisor_board_r0_records',
  history: 'ehs_supervisor_board_r0_history'
});
export const FIELDS = ['date','supervisorId','content','source','note','status','archived'];
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
  const r={id:str(obj.id,120),date:str(obj.date,20),supervisorId:str(obj.supervisorId,120),content:str(obj.content,12000),source:str(obj.source,6000),note:str(obj.note,12000),status:str(obj.status,100),archived:obj.archived===true};
  if(!validDate(r.date))throw Error('指示日期無效，請使用YYYY-MM-DD');
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
  return FIELDS.some(k=>a?.[k]!==b?.[k]) || JSON.stringify(a?.supervisorSnapshot||{})!==JSON.stringify(b?.supervisorSnapshot||{});
}
export function supervisorChanged(a,b){return ['name','title','department','active','order'].some(k=>a?.[k]!==b?.[k]);}
export function ownId(){return globalThis.crypto?.randomUUID?.()??('id_'+Date.now()+'_'+Math.random().toString(36).slice(2));}
