export const APP_VERSION = "R0.1";
export const DEPARTMENTS = [
  { id: "chem1", name: "化一部", factories: [
    { id: "aro-1", name: "ARO-1" }, { id: "aro-2", name: "ARO-2" }, { id: "aro-3", name: "ARO-3" }
  ]},
  { id: "chem2", name: "化二部", factories: [
    { id: "sm-mailiao", name: "SM(麥寮)" }, { id: "sm-haifeng", name: "SM(海豐)" }, { id: "phenol", name: "PHENOL" }
  ]},
  { id: "chem3", name: "化三部（含醋酸）", factories: [
    { id: "longde-pia", name: "龍德PIA" }, { id: "mailiao-pta", name: "麥寮PTA" }, { id: "hac", name: "HAC" }
  ]},
  { id: "plastic", name: "塑膠部", factories: [
    { id: "xingang-pabs", name: "新港PABS" }, { id: "mailiao-pabs", name: "麥寮PABS" }, { id: "pc", name: "PC" }, { id: "pp", name: "PP" }
  ]}
];
export const FIELDS = [
  { key:"rotating",label:"轉動設備",count:"rotatingCount",abnormal:"rotatingAbnormal",ratio:"rotatingRate" },
  { key:"valve",label:"一般閥類",count:"valveCount",abnormal:"valveAbnormal",ratio:"valveRate" },
  { key:"safety",label:"釋壓安全閥",count:"safetyCount",abnormal:"safetyAbnormal",ratio:"safetyRate" },
  { key:"flange",label:"法蘭及其他",count:"flangeCount",abnormal:"flangeAbnormal",ratio:"flangeRate" }
];
export const FACTORY_LIST=DEPARTMENTS.flatMap(d=>d.factories.map(f=>({...f,departmentId:d.id})));
export function emptyFactory(factory){
  return {...factory,status:"missing",rotatingCount:null,rotatingAbnormal:null,
    valveCount:null,valveAbnormal:null,safetyCount:null,safetyAbnormal:null,
    flangeCount:null,flangeAbnormal:null};
}
export function emptyQuarter(year,quarter){
  return {year,quarter,quarterKey:`${year}_Q${quarter}`,notes:"",sourceFileName:"",
    factories:FACTORY_LIST.map(emptyFactory)};
}
export function clone(value){return JSON.parse(JSON.stringify(value));}
export function fmt(value,digits=0){
  if(value===null||value===undefined||value==="")return "—";
  const n=Number(value);if(!Number.isFinite(n))return "—";
  return digits?n.toFixed(digits):Math.round(n).toLocaleString("en-US");
}
export function ratio(abnormal,count){return Number(count)>0?Number(abnormal||0)/Number(count)*100:null;}
export function rowMetrics(row){
  if(row.status!=="completed")return {...row,rotatingRate:null,valveRate:null,safetyRate:null,flangeRate:null,totalCount:null,totalAbnormal:null,overallRate:null};
  const totalCount=FIELDS.reduce((s,f)=>s+Number(row[f.count]||0),0);
  const totalAbnormal=FIELDS.reduce((s,f)=>s+Number(row[f.abnormal]||0),0);
  return {...row,rotatingRate:ratio(row.rotatingAbnormal,row.rotatingCount),valveRate:ratio(row.valveAbnormal,row.valveCount),
    safetyRate:ratio(row.safetyAbnormal,row.safetyCount),flangeRate:ratio(row.flangeAbnormal,row.flangeCount),
    totalCount,totalAbnormal,overallRate:ratio(totalAbnormal,totalCount)};
}
export function sumRows(rows){
  const out={rotatingCount:0,rotatingAbnormal:0,valveCount:0,valveAbnormal:0,safetyCount:0,safetyAbnormal:0,flangeCount:0,flangeAbnormal:0,totalCount:0,totalAbnormal:0};
  for(const row of rows){if(row.status!=="completed")continue;for(const f of FIELDS){out[f.count]+=Number(row[f.count]||0);out[f.abnormal]+=Number(row[f.abnormal]||0);}}
  out.totalCount=FIELDS.reduce((s,f)=>s+out[f.count],0);out.totalAbnormal=FIELDS.reduce((s,f)=>s+out[f.abnormal],0);
  out.rotatingRate=ratio(out.rotatingAbnormal,out.rotatingCount);out.valveRate=ratio(out.valveAbnormal,out.valveCount);
  out.safetyRate=ratio(out.safetyAbnormal,out.safetyCount);out.flangeRate=ratio(out.flangeAbnormal,out.flangeCount);
  out.overallRate=ratio(out.totalAbnormal,out.totalCount);return out;
}
export function departmentMetrics(data,departmentId){
  const all=(data.factories||[]).filter(r=>r.departmentId===departmentId);
  const rows=all.filter(r=>r.status==="completed");
  return {...sumRows(rows),rows,missing:all.filter(r=>r.status==="missing").length,notExecuted:all.filter(r=>r.status==="not_executed").length};
}
export function totalsFor(data){
  const rows=data.factories||[],completed=rows.filter(r=>r.status==="completed");
  return {...sumRows(completed),completedCount:completed.length,missingCount:rows.filter(r=>r.status==="missing").length,
    notExecutedCount:rows.filter(r=>r.status==="not_executed").length,expectedCount:FACTORY_LIST.length};
}
export function validateData(data){
  if(!data||!Array.isArray(data.factories))throw new Error("缺少廠別資料。");
  const ids=new Set();
  for(const row of data.factories){
    if(!FACTORY_LIST.some(f=>f.id===row.id))throw new Error(`未知廠別：${row.name||row.id}`);
    if(ids.has(row.id))throw new Error(`廠別重複：${row.name||row.id}`);ids.add(row.id);
    if(!["completed","not_executed","missing"].includes(row.status))throw new Error(`廠別狀態錯誤：${row.name}`);
    if(row.status==="completed")for(const f of FIELDS){
      if(row[f.count]===null||row[f.count]===undefined||row[f.count]==="")throw new Error(`${row.name}－${f.label}檢測數尚未填寫。`);
      if(row[f.abnormal]===null||row[f.abnormal]===undefined||row[f.abnormal]==="")throw new Error(`${row.name}－${f.label}異常數尚未填寫。`);
      const count=Number(row[f.count]),abnormal=Number(row[f.abnormal]);
      if(!Number.isSafeInteger(count)||count<0)throw new Error(`${row.name}－${f.label}檢測數必須為非負整數。`);
      if(!Number.isSafeInteger(abnormal)||abnormal<0)throw new Error(`${row.name}－${f.label}異常數必須為非負整數。`);
      if(abnormal>count)throw new Error(`${row.name}－${f.label}異常數不可大於檢測數。`);
    }
  }
  if(ids.size!==FACTORY_LIST.length)throw new Error("廠別清單不完整，請逐一確認 13 個廠別。");
  return data;
}
