import {
  DEPARTMENTS,FACTORY_LIST,FIELDS,emptyQuarter,clone,fmt,
  rowMetrics,sumRows,departmentMetrics,totalsFor,validateData
} from "./model.js?v=20261111-r011";
import * as cloud from "./cloud.js?v=20261111-r011";
import {recognizeEquipmentTable} from "./ocr.js?v=20261111-r01";

const $=id=>document.getElementById(id);
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let records=[],recordsLoaded=false,selectedYear=2026,selectedQuarter=3,draft=null;
let draftImageFile=null,imageObjectUrl="",imageFileName="";
let ocrResult=null,ocrIssues=[],activeTab="dashboard",unsubscribe=null,authUser=null,busy=false;

function quarterKey(){return `${selectedYear}_Q${selectedQuarter}`;}
function recordsForQuarter(){return records.filter(r=>r.quarterKey===quarterKey()).sort((a,b)=>(b.version||0)-(a.version||0));}
function officialRecord(){return recordsForQuarter().find(r=>r.isOfficial)||null;}
function latestRecord(){return recordsForQuarter()[0]||null;}
function activeRecord(){return officialRecord()||latestRecord();}
function activeData(){return draft||activeRecord()||emptyQuarter(selectedYear,selectedQuarter);}
function isDirty(){return !!draft;}
function setMessage(message,type="info"){
  const el=$("global-message");el.textContent=message;el.hidden=!message;
  el.className=`message ${type==="warning"?"notice warning":type==="danger"?"notice danger":""}`;
}
function statusName(status){return status==="completed"?"已檢測":status==="not_executed"?"未執行":"資料未提供";}
function statusBadge(status){
  const cls=status==="completed"?"badge-good":status==="not_executed"?"badge-warn":"badge-muted";
  return `<span class="${cls}">${statusName(status)}</span>`;
}
function currentDate(value){
  if(!value)return "—";
  try{
    const d=typeof value.toDate==="function"?value.toDate():new Date(value);
    if(Number.isNaN(d.getTime()))return "—";
    return d.toLocaleString("zh-TW",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
  }catch{return "—";}
}
function getFactory(id){return FACTORY_LIST.find(f=>f.id===id);}
function setFactoryField(factoryId,field,value){
  const row=draft?.factories.find(r=>r.id===factoryId);if(!row)return;
  if(field==="status"){
    row.status=value;
    if(value!=="completed"){
      for(const f of FIELDS){row[f.count]=null;row[f.abnormal]=null;}
    }
  }else{
    row[field]=value===""?null:Number(value);
  }
}
function clearImagePreview(){
  if(imageObjectUrl){URL.revokeObjectURL(imageObjectUrl);imageObjectUrl="";}
  draftImageFile=null;imageFileName="";
  $("image-preview").innerHTML='<div class="empty-preview">尚未選擇圖片</div>';
  $("source-image-meta").textContent="原始圖片不會上傳 Firebase；請自行保留本機原檔。";
  $("clear-image-button").disabled=true;$("ocr-button").disabled=true;
  $("image-input").value="";
}
function setImagePreview(src,name){
  $("image-preview").innerHTML=`<img alt="原始 VOC 統計表圖片" src="${esc(src)}">`;
  $("source-image-meta").textContent=name||"原始統計圖片";
  $("clear-image-button").disabled=false;$("ocr-button").disabled=false;
}
function showTab(tab){
  activeTab=tab;
  document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
  document.querySelectorAll(".view-section").forEach(v=>v.hidden=v.id!==`view-${tab}`);
  if(tab==="ocr")loadCurrentImagePreview();
  if(tab==="history")renderHistory();
  if(tab==="trends")renderTrends();
}
function initializePeriodSelectors(){
  const year=$("year-select");
  year.innerHTML=Array.from({length:13},(_,i)=>2024+i).map(y=>`<option value="${y}">${y} 年</option>`).join("");
  year.value=String(selectedYear);$("quarter-select").value=String(selectedQuarter);
}
function selectPeriod(){
  if(draft&&!confirm("目前有尚未儲存的草稿，切換季度會捨棄草稿。是否繼續？")){
    $("year-select").value=String(selectedYear);$("quarter-select").value=String(selectedQuarter);return;
  }
  selectedYear=Number($("year-select").value);selectedQuarter=Number($("quarter-select").value);
  draft=null;ocrResult=null;ocrIssues=[];clearImagePreview();$("confirm-data").checked=false;
  renderAll();
}
function createDraft(){
  if(busy||draft)return;
  const base=activeRecord();
  if(base){
    draft={year:selectedYear,quarter:selectedQuarter,quarterKey:quarterKey(),factories:clone(base.factories),notes:String(base.notes||""),sourceFileName:base.sourceFileName||""};
  }else{
    draft=emptyQuarter(selectedYear,selectedQuarter);
  }
  clearImagePreview();
  imageFileName=base?.sourceFileName||"";
  ocrResult=null;ocrIssues=[];
  $("confirm-data").checked=false;
  $("image-input").value="";
  $("save-button").hidden=false;$("cancel-button").hidden=false;$("edit-button").hidden=true;
  renderAll();
  showTab("table");
}
function cancelDraft(){
  if(!draft)return;
  if(!confirm("確定取消草稿？尚未儲存的修改會遺失。"))return;
  draft=null;ocrResult=null;ocrIssues=[];clearImagePreview();$("confirm-data").checked=false;renderAll();
}
function updateEditControls(){
  $("save-button").hidden=!draft;
  $("cancel-button").hidden=!draft;
  $("edit-button").hidden=!!draft;
  $("edit-button").textContent=activeRecord()?"建立修正版":"開始建立本季資料";
  $("notes-input").disabled=!draft;
}
function renderKpis(data){
  const t=totalsFor(data);
  const cards=[
    ["設備元件檢測總數",fmt(t.totalCount),"件","檢測完成廠別加總","#236fa8"],
    ["異常總數",fmt(t.totalAbnormal),"件","四大設備類別異常點數","#b45b43"],
    ["整體異常比例",t.overallRate===null?"—":`${fmt(t.overallRate,3)}%`,"","異常總數 ÷ 檢測總數","#16816c"],
    ["已完成廠別",`${t.completedCount} / ${t.expectedCount}`,"廠","未執行及資料未提供另列","#8868a7"]
  ];
  $("kpi-grid").innerHTML=cards.map(([label,value,unit,meta,color])=>`<article class="kpi" style="--accent:${color}"><div class="kpi-label">${label}</div><div class="kpi-value">${value}${unit?` <small style="font-size:12px">${unit}</small>`:""}</div><div class="kpi-meta">${meta}</div></article>`).join("");
}
function renderDepartmentSummary(data){
  $("department-summary").innerHTML=`<thead><tr><th>事業部</th><th class="num">檢測總數</th><th class="num">異常總數</th><th class="num">異常比例</th><th class="num">未執行</th><th class="num">資料未提供</th></tr></thead><tbody>${
    DEPARTMENTS.map(d=>{
      const x=departmentMetrics(data,d.id);
      return `<tr><td><strong>${d.name}</strong></td><td class="num">${fmt(x.totalCount)}</td><td class="num">${fmt(x.totalAbnormal)}</td><td class="num">${x.overallRate===null?"—":fmt(x.overallRate,3)+"%"}</td><td class="num">${x.notExecuted}</td><td class="num">${x.missing}</td></tr>`;
    }).join("")
  }</tbody>`;
}
function renderCategoryChart(data){
  const t=totalsFor(data),max=Math.max(0,...FIELDS.map(f=>t[f.ratio]??0));
  $("category-chart").innerHTML=FIELDS.map(f=>{
    const v=t[f.ratio],pct=v===null?0:(max?Math.max(2,v/max*100):0);
    return `<div class="category-row"><span class="category-name">${f.label}</span><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><strong class="category-value">${v===null?"—":fmt(v,3)+"%"}</strong></div>`;
  }).join("");
}
function renderDataQuality(data){
  const t=totalsFor(data),record=activeRecord();
  $("record-status").textContent=draft?"草稿編輯中":record?(record.isOfficial?`正式版本 V${record.version}`:`待確認 V${record.version}`):"尚未建立";
  $("record-status").className=`status-pill ${draft?"pending":record?.isOfficial?"official":"pending"}`;
  $("data-quality").innerHTML=[
    [t.completedCount,"已檢測廠別"],[t.notExecutedCount,"未執行廠別"],[t.missingCount,"資料未提供廠別"]
  ].map(([n,label])=>`<div class="quality-item"><strong>${n}</strong><span>${label}</span></div>`).join("");
  $("draft-notice").hidden=!(draft||!record);
  $("draft-notice").className="notice warning";
  $("draft-notice").textContent=draft
    ?"目前顯示尚未儲存的草稿。請完成 OCR／人工校對，並於確認後儲存為新版本。"
    :!record?`${selectedYear} 年第 ${selectedQuarter} 季尚無雲端紀錄。請上傳原始統計表圖片開始建檔。`:"";
  const alert=$("table-alert");
  if(t.missingCount>0){
    alert.hidden=false;alert.className="notice warning";
    alert.textContent=`尚有 ${t.missingCount} 個廠別資料未提供。此類資料不會當作 0 納入小計或合計，正式儲存前請補齊資料或明確標示「未執行」。`;
  }else if(t.notExecutedCount>0){
    alert.hidden=false;alert.className="notice";
    alert.textContent=`有 ${t.notExecutedCount} 個廠別標示為未執行；未執行廠別不納入檢測總數及異常比例計算。`;
  }else{alert.hidden=true;alert.textContent="";}
}
function renderDashboard(){
  const data=activeData();renderKpis(data);renderDepartmentSummary(data);renderCategoryChart(data);renderDataQuality(data);
}
function numberCell(row,field){
  if(draft&&row.status==="completed"){
    const v=row[field]??"";
    return `<input type="number" min="0" step="1" inputmode="numeric" aria-label="${esc(row.name)} ${esc(field)}" data-factory="${row.id}" data-field="${field}" value="${esc(v)}">`;
  }
  return fmt(row.status==="completed"?row[field]:null);
}
function metricCell(value){return `<span class="num">${value===null?"—":fmt(value,3)}</span>`;}
function renderFactoryRow(row,dept,first){
  const m=rowMetrics(row);
  const statusControl=draft?`<select data-factory="${row.id}" data-field="status" aria-label="${esc(row.name)} 狀態"><option value="completed" ${row.status==="completed"?"selected":""}>已檢測</option><option value="not_executed" ${row.status==="not_executed"?"selected":""}>未執行</option><option value="missing" ${row.status==="missing"?"selected":""}>資料未提供</option></select>`:statusBadge(row.status);
  return `<tr>${first?`<td class="dept-name" rowspan="${dept.factories.length+1}">${dept.name}</td>`:""}<td class="factory-name">${esc(row.name)}<div>${statusControl}</div></td>
    <td>${numberCell(row,"rotatingCount")}</td><td>${numberCell(row,"rotatingAbnormal")}</td><td>${metricCell(m.rotatingRate)}</td>
    <td>${numberCell(row,"valveCount")}</td><td>${numberCell(row,"valveAbnormal")}</td><td>${metricCell(m.valveRate)}</td>
    <td>${numberCell(row,"safetyCount")}</td><td>${numberCell(row,"safetyAbnormal")}</td><td>${metricCell(m.safetyRate)}</td>
    <td>${numberCell(row,"flangeCount")}</td><td>${numberCell(row,"flangeAbnormal")}</td><td>${metricCell(m.flangeRate)}</td>
    <td class="num">${fmt(m.totalCount)}</td><td class="num">${fmt(m.totalAbnormal)}</td><td class="num">${m.overallRate===null?"—":fmt(m.overallRate,3)}</td></tr>`;
}
function totalCells(t){
  return `<td class="num">${fmt(t.rotatingCount)}</td><td class="num">${fmt(t.rotatingAbnormal)}</td><td class="num">${t.rotatingRate===null?"—":fmt(t.rotatingRate,3)}</td>
  <td class="num">${fmt(t.valveCount)}</td><td class="num">${fmt(t.valveAbnormal)}</td><td class="num">${t.valveRate===null?"—":fmt(t.valveRate,3)}</td>
  <td class="num">${fmt(t.safetyCount)}</td><td class="num">${fmt(t.safetyAbnormal)}</td><td class="num">${t.safetyRate===null?"—":fmt(t.safetyRate,3)}</td>
  <td class="num">${fmt(t.flangeCount)}</td><td class="num">${fmt(t.flangeAbnormal)}</td><td class="num">${t.flangeRate===null?"—":fmt(t.flangeRate,3)}</td>
  <td class="num">${fmt(t.totalCount)}</td><td class="num">${fmt(t.totalAbnormal)}</td><td class="num">${t.overallRate===null?"—":fmt(t.overallRate,3)}</td>`;
}
function renderReportTable(){
  const data=activeData();
  let body="";
  for(const dept of DEPARTMENTS){
    const rows=dept.factories.map(f=>data.factories.find(r=>r.id===f.id)).filter(Boolean);
    rows.forEach((r,i)=>body+=renderFactoryRow(r,dept,i===0));
    const subtotal=departmentMetrics(data,dept.id);
    body+=`<tr class="subtotal"><td>小計</td>${totalCells(subtotal)}</tr>`;
  }
  const total=totalsFor(data);
  body+=`<tr class="grand-total"><td colspan="2">合計</td>${totalCells(total)}</tr>`;
  $("voc-report").innerHTML=`<thead>
    <tr><th rowspan="2">事業部</th><th rowspan="2">廠別</th>
    <th colspan="3">轉動設備（如泵浦、壓縮機）</th><th colspan="3">一般閥類（如手閥、控制閥）</th>
    <th colspan="3">釋壓安全閥</th><th colspan="3">法蘭及其他（開口、連接頭）</th>
    <th rowspan="2">設備元件<br>檢測總數<br>(M)</th><th rowspan="2">異常<br>總數<br>(N)</th><th rowspan="2">%(P=N÷M)</th></tr>
    <tr><th>檢測數<br>(A)</th><th>異常點數<br>(B)</th><th>%(C=B÷A)</th><th>檢測數<br>(D)</th><th>異常點數<br>(E)</th><th>%(F=E÷D)</th>
    <th>檢測數<br>(G)</th><th>異常點數<br>(H)</th><th>%(I=H÷G)</th><th>檢測數<br>(J)</th><th>異常點數<br>(K)</th><th>%(L=K÷J)</th></tr>
  </thead><tbody>${body}</tbody>`;
  $("notes-input").value=data.notes||"";
  $("notes-input").disabled=!draft;
  $("print-notes-text")?.remove();
  const p=document.createElement("div");p.id="print-notes-text";p.textContent=data.notes||"—";$("notes-input").after(p);
  updateEditControls();
}
function renderHistory(){
  const rows=recordsForQuarter();
  $("history-table").innerHTML=`<thead><tr><th>版本</th><th>狀態</th><th>建立時間</th><th>來源檔名（僅文字，不保存圖片）</th><th>操作</th></tr></thead><tbody>${
    rows.length?rows.map(r=>`<tr><td>V${r.version}</td><td>${r.isOfficial?'<span class="badge-good">正式版本</span>':r.status==="superseded"?'<span class="badge-muted">歷史版本</span>':'<span class="badge-warn">待確認</span>'}</td><td>${currentDate(r.createdAt)}</td><td>${esc(r.sourceFileName||"—")}</td><td><button class="button light" data-load-record="${r.id}">載入檢視</button> ${!r.isOfficial?`<button class="button success" data-official-record="${r.id}">設為正式版本</button> ${r.status==="pending"?`<button class="button light" data-delete-record="${r.id}">刪除待確認版</button>`:""}`:""}</td></tr>`).join(""):`<tr><td colspan="5" class="empty-state">本季度尚無版本紀錄。</td></tr>`
  }</tbody>`;
}
function officialRecords(){
  return records.filter(r=>r.isOfficial).sort((a,b)=>(a.year-b.year)||(a.quarter-b.quarter));
}
function renderBarChart(targetId,rows,key,rate=false){
  const vals=rows.map(r=>rate?(totalsFor(r).overallRate||0):totalsFor(r).totalCount);
  const max=Math.max(1,...vals);
  $(targetId).innerHTML=rows.length?rows.map((r,i)=>{
    const v=vals[i],height=Math.max(2,v/max*145);
    return `<div class="trend-item"><strong class="trend-value">${rate?fmt(v,3)+"%":fmt(v)}</strong><div class="trend-bar ${rate?"rate":""}" style="height:${height}px" title="${r.year} Q${r.quarter}"></div><span class="trend-label">${r.year} Q${r.quarter}</span></div>`;
  }).join(""):'<div class="empty-state">尚無正式季度資料可供比較。</div>';
}
function renderTrends(){
  const rows=officialRecords(),recent=rows.slice(-12);
  renderBarChart("trend-count-chart",recent,"totalCount",false);
  renderBarChart("trend-rate-chart",recent,"overallRate",true);
  $("trend-table").innerHTML=`<thead><tr><th>年度季度</th><th class="num">檢測總數</th><th class="num">異常總數</th><th class="num">異常比例</th><th>正式版本</th></tr></thead><tbody>${
    recent.length?recent.slice().reverse().map(r=>{const t=totalsFor(r);return `<tr><td>${r.year} Q${r.quarter}</td><td class="num">${fmt(t.totalCount)}</td><td class="num">${fmt(t.totalAbnormal)}</td><td class="num">${t.overallRate===null?"—":fmt(t.overallRate,3)+"%"}</td><td>V${r.version}</td></tr>`;}).join(""):'<tr><td colspan="5" class="empty-state">尚無正式季度資料。</td></tr>'
  }</tbody>`;
}
function renderAll(){
  renderDashboard();renderReportTable();renderHistory();updateEditControls();
}
function findQuarterFromTitle(text){
  const s=String(text||"").replace(/\s/g,"");
  const y=s.match(/(20\d{2})年?/);
  const q=s.match(/第?([一二三四1234])季/);
  const qMap={"一":1,"二":2,"三":3,"四":4,"1":1,"2":2,"3":3,"4":4};
  return y&&q?{year:Number(y[1]),quarter:qMap[q[1]]}:null;
}
function updateOCRCheckTable(){
  if(!ocrResult){
    $("ocr-check-table").innerHTML='<tbody><tr><td class="empty-state">尚未執行 OCR。</td></tr></tbody>';
    $("ocr-summary").textContent="尚未辨識";$("ocr-notes").textContent="";return;
  }
  const labelMap=new Map(ocrResult.labels.map(r=>[r.factoryId,r]));
  $("ocr-check-table").innerHTML=`<thead><tr><th>廠別</th><th>OCR 廠別文字</th><th>辨識數值（8 欄）</th><th>狀態</th><th>信心分數</th></tr></thead><tbody>${
    ocrResult.rows.map(r=>{
      const f=getFactory(r.factoryId),label=labelMap.get(r.factoryId);
      return `<tr><td>${esc(f?.name||r.factoryId)}</td><td>${esc(label?.text||"—")}</td><td>${esc((r.values||[]).map(v=>v===null?"—":fmt(v)).join(" / "))}</td><td>${r.ok?'<span class="badge-good">8 欄完成</span>':r.values?.some(v=>v!==null)?'<span class="badge-warn">部分欄位需修正</span>':'<span class="badge-warn">需人工輸入</span>'}</td><td>${Math.round(r.confidence||0)}%</td></tr>`;
    }).join("")
  }</tbody>`;
  $("ocr-summary").textContent=`數字辨識 ${ocrResult.okCount}/${ocrResult.total}`;
  $("ocr-notes").textContent=`標題辨識：${ocrResult.titleText||"未辨識"}\n備註辨識：\n${ocrResult.notesText||"未辨識，請人工輸入。"}`;
}
function loadCurrentImagePreview(){
  if(draftImageFile){
    if(!imageObjectUrl)imageObjectUrl=URL.createObjectURL(draftImageFile);
    setImagePreview(imageObjectUrl,draftImageFile.name);return;
  }
  const lastName=draft?.sourceFileName||activeRecord()?.sourceFileName||"";
  $("image-preview").innerHTML='<div class="empty-preview">圖片僅用於本機 OCR 與預覽，不會上傳 Firebase。需要再次辨識時，請重新選擇圖片。</div>';
  $("source-image-meta").textContent=lastName?`歷史來源檔名（僅文字紀錄）：${lastName}`:"請自行保留原始圖片；頁面重新載入後無法從雲端取回。";
  $("clear-image-button").disabled=true;$("ocr-button").disabled=true;
}
function setOCRProgress(p){
  $("ocr-progress-wrap").hidden=false;
  $("ocr-progress-text").textContent=p.message||"辨識中…";
  $("ocr-progress-value").textContent=`${p.percent||0}%`;
  $("ocr-progress-bar").style.width=`${p.percent||0}%`;
}
async function runOCR(){
  if(!draft)createDraft();
  if(!draft)return;
  if(!draftImageFile){setMessage("請先選擇原始統計表圖片。","warning");showTab("ocr");return;}
  $("ocr-button").disabled=true;$("ocr-result").hidden=false;$("ocr-result").textContent="正在啟動 OCR…";
  $("confirm-data").checked=false;ocrResult=null;ocrIssues=[];
  try{
    const result=await recognizeEquipmentTable(draftImageFile,setOCRProgress);
    ocrResult=result;
    const fieldMap=["rotatingCount","rotatingAbnormal","valveCount","valveAbnormal","safetyCount","safetyAbnormal","flangeCount","flangeAbnormal"];
    for(const r of result.rows){
      const target=draft.factories.find(x=>x.id===r.factoryId);
      if(!target)continue;
      const hasAny=Array.isArray(r.values)&&r.values.some(v=>v!==null);
      if(hasAny){
        target.status="completed";fieldMap.forEach((field,i)=>target[field]=r.values[i]);
        if(!r.ok)ocrIssues.push(r.factoryId);
      }else{target.status="missing";fieldMap.forEach(field=>target[field]=null);ocrIssues.push(r.factoryId);}
    }
    if(result.notesText)draft.notes=result.notesText;
    draft.sourceFileName=draftImageFile.name||imageFileName||draft.sourceFileName||"原始統計圖片";
    const titlePeriod=findQuarterFromTitle(result.titleText);
    let periodMessage="";
    if(titlePeriod&&(titlePeriod.year!==selectedYear||titlePeriod.quarter!==selectedQuarter)){
      periodMessage=`\n警告：圖片標題辨識為 ${titlePeriod.year} Q${titlePeriod.quarter}，但目前選擇 ${selectedYear} Q${selectedQuarter}。請確認年度季度。`;
    }
    $("ocr-result").textContent=`${result.okCount}/13 個廠別完成數字辨識。${ocrIssues.length?`仍有 ${ocrIssues.length} 個廠別需人工輸入。`:""}\n請切換至「季度統計表」檢查全部數字與狀態。${periodMessage}`;
    updateOCRCheckTable();renderAll();
    setMessage("OCR 初步辨識完成。請逐廠核對，不可直接將 OCR 結果視為正式資料。",ocrIssues.length?"warning":"info");
  }catch(error){
    $("ocr-result").textContent=`OCR 未完成：${error.message}\n可改至「季度統計表」人工輸入資料。`;
    setMessage(error.message,"danger");
  }finally{$("ocr-button").disabled=false;}
}
async function saveDraft(){
  if(!draft||busy)return;
  if(!$("confirm-data").checked){setMessage("請先勾選「已核對本季廠別、數據及備註」。","warning");showTab("ocr");return;}
  try{
    validateData(draft);
    const t=totalsFor(draft);
    if(t.missingCount>0)throw new Error(`仍有 ${t.missingCount} 個廠別資料未提供，請補齊或標示未執行。`);
  }catch(error){setMessage(error.message,"warning");showTab("table");return;}
  busy=true;$("save-button").disabled=true;
  try{
    const saved=await cloud.saveRevision(draft,{
      fileName:draftImageFile?.name||imageFileName||draft.sourceFileName||""
    });
    draft=null;ocrResult=null;ocrIssues=[];
    clearImagePreview();updateOCRCheckTable();
    $("ocr-result").hidden=true;$("ocr-progress-wrap").hidden=true;
    $("confirm-data").checked=false;
    setMessage((saved.isOfficial?`已儲存為 ${selectedYear} Q${selectedQuarter} 正式版本 V${saved.version}。`:`已儲存為待確認版本 V${saved.version}；原正式版本保持不變，請至版本紀錄指定正式版本。`)+" 只儲存統計資料，圖片未上傳雲端，請自行保存原圖。");
    renderAll();showTab("dashboard");
  }catch(error){setMessage(`儲存失敗：${error.message}`,"danger");}
  finally{busy=false;$("save-button").disabled=false;}
}
function exportExcel(){
  const data=activeData();validateData(data);
  if(!window.XLSX){setMessage("Excel 匯出元件尚未載入，請確認網路後重試。","danger");return;}
  const rows=[
    ["設備元件 VOC ≥ 1,000 ppm 數量統計",`${data.year} 年第 ${data.quarter} 季`],
    ["事業部","廠別","狀態","轉動設備檢測數(A)","異常點數(B)","異常比例%(C)","一般閥類檢測數(D)","異常點數(E)","異常比例%(F)","釋壓安全閥檢測數(G)","異常點數(H)","異常比例%(I)","法蘭及其他檢測數(J)","異常點數(K)","異常比例%(L)","設備元件檢測總數(M)","異常總數(N)","異常比例%(P)"]
  ];
  for(const dept of DEPARTMENTS){
    const detail=dept.factories.map(f=>data.factories.find(r=>r.id===f.id));
    for(const r of detail){
      const m=rowMetrics(r);
      rows.push([dept.name,r.name,statusName(r.status),r.rotatingCount,r.rotatingAbnormal,m.rotatingRate,r.valveCount,r.valveAbnormal,m.valveRate,r.safetyCount,r.safetyAbnormal,m.safetyRate,r.flangeCount,r.flangeAbnormal,m.flangeRate,m.totalCount,m.totalAbnormal,m.overallRate]);
    }
    const s=departmentMetrics(data,dept.id);
    rows.push([dept.name,"小計","",s.rotatingCount,s.rotatingAbnormal,s.rotatingRate,s.valveCount,s.valveAbnormal,s.valveRate,s.safetyCount,s.safetyAbnormal,s.safetyRate,s.flangeCount,s.flangeAbnormal,s.flangeRate,s.totalCount,s.totalAbnormal,s.overallRate]);
  }
  const t=totalsFor(data);
  rows.push(["合計","","",t.rotatingCount,t.rotatingAbnormal,t.rotatingRate,t.valveCount,t.valveAbnormal,t.valveRate,t.safetyCount,t.safetyAbnormal,t.safetyRate,t.flangeCount,t.flangeAbnormal,t.flangeRate,t.totalCount,t.totalAbnormal,t.overallRate]);
  rows.push([]);rows.push(["備註",data.notes||""]);
  const ws=window.XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"]=[{wch:18},{wch:16},{wch:12},...Array.from({length:15},()=>({wch:15}))];
  const wb=window.XLSX.utils.book_new();window.XLSX.utils.book_append_sheet(wb,ws,"季度統計");
  window.XLSX.writeFile(wb,`設備元件VOC_${data.year}_Q${data.quarter}.xlsx`);
}
async function loadRecordToDraft(id){
  const record=records.find(r=>r.id===id);if(!record)return;
  if(draft&&!confirm("載入歷史版本會捨棄目前草稿，是否繼續？"))return;
  draft={year:record.year,quarter:record.quarter,quarterKey:record.quarterKey,factories:clone(record.factories),notes:record.notes||"",sourceFileName:record.sourceFileName||""};
  if(imageObjectUrl){URL.revokeObjectURL(imageObjectUrl);imageObjectUrl="";}
  clearImagePreview();imageFileName=record.sourceFileName||"";
  selectedYear=record.year;selectedQuarter=record.quarter;$("year-select").value=String(selectedYear);$("quarter-select").value=String(selectedQuarter);
  $("confirm-data").checked=false;renderAll();showTab("table");await loadCurrentImagePreview();
  setMessage(`已載入 V${record.version} 作為草稿。儲存時會建立新版本，不會覆蓋原版本。`);
}
async function handleHistoryClick(e){
  const load=e.target.closest("[data-load-record]"),official=e.target.closest("[data-official-record]"),del=e.target.closest("[data-delete-record]");
  if(load){await loadRecordToDraft(load.dataset.loadRecord);return;}
  if(official){
    const r=records.find(x=>x.id===official.dataset.officialRecord);if(!r)return;
    if(!confirm(`確定將 ${r.year} Q${r.quarter} 的 V${r.version} 設為正式版本？原正式版本將保留為歷史版本。`))return;
    try{await cloud.setOfficial(r);setMessage(`已將 V${r.version} 設為正式版本。`);}catch(error){setMessage(`指定正式版本失敗：${error.message}`,"danger");}
    return;
  }
  if(del){
    const r=records.find(x=>x.id===del.dataset.deleteRecord);if(!r)return;
    if(!confirm(`確定刪除待確認版本 V${r.version}？此動作無法復原。`))return;
    try{await cloud.deletePendingRevision(r);setMessage(`已刪除待確認版本 V${r.version}。`);}catch(error){setMessage(`刪除失敗：${error.message}`,"danger");}
  }
}
function onReportChange(e){
  const el=e.target.closest("[data-factory][data-field]");if(!el||!draft)return;
  setFactoryField(el.dataset.factory,el.dataset.field,el.value);
  renderAll();
}
function onImageSelected(e){
  const file=e.target.files?.[0];if(!file)return;
  if(!/^image\/(png|jpeg)$/.test(file.type)){setMessage("檔案格式不符，請選擇 PNG 或 JPG。","warning");return;}
  if(file.size>12*1024*1024){setMessage("圖片超過 12 MB，請先縮小圖片。","warning");return;}
  if(!draft)createDraft();
  if(!draft)return;
  draftImageFile=file;imageFileName=file.name;draft.sourceFileName=file.name;
  if(imageObjectUrl)URL.revokeObjectURL(imageObjectUrl);
  imageObjectUrl=URL.createObjectURL(file);setImagePreview(imageObjectUrl,file.name);
  ocrResult=null;ocrIssues=[];updateOCRCheckTable();$("confirm-data").checked=false;
  $("ocr-result").hidden=true;$("ocr-progress-wrap").hidden=true;
  setMessage("圖片已載入。請按「開始 OCR 辨識」，辨識完成後再逐欄核對。");
  showTab("ocr");
}
function initializeEvents(){
  $("login-button").onclick=()=>cloud.login().catch(e=>$("auth-status").textContent=`登入失敗：${e.message}`);
  $("auth-login-button").onclick=()=>cloud.login().catch(e=>$("auth-status").textContent=`登入失敗：${e.message}`);
  $("logout-button").onclick=()=>cloud.logout().catch(e=>setMessage(e.message,"danger"));
  $("year-select").onchange=selectPeriod;$("quarter-select").onchange=selectPeriod;
  document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
  $("edit-button").onclick=createDraft;$("cancel-button").onclick=cancelDraft;$("save-button").onclick=saveDraft;
  $("voc-report").addEventListener("change",onReportChange);
  $("notes-input").addEventListener("input",e=>{if(draft)draft.notes=e.target.value;});
  $("image-input").addEventListener("change",onImageSelected);
  $("ocr-button").onclick=runOCR;
  $("clear-image-button").onclick=()=>{if(!confirm("清除目前圖片？若尚未儲存，圖片選擇將被取消。"))return;clearImagePreview();ocrResult=null;updateOCRCheckTable();};
  $("history-table").addEventListener("click",handleHistoryClick);
  $("excel-button").onclick=exportExcel;
  $("print-button").onclick=()=>window.print();
  $("confirm-data").onchange=()=>{$("save-button").disabled=false;};
}
function handleAuth(user){
  authUser=user;
  if(unsubscribe){unsubscribe();unsubscribe=null;}
  $("logout-button").hidden=!user;$("login-button").hidden=!!user;
  if(!user){
    $("app-view").hidden=true;$("auth-view").hidden=false;$("account-label").textContent="尚未登入";
    $("auth-status").textContent="請使用 EHS 管理員 Google 帳號登入。";
    if(unsubscribe){unsubscribe();unsubscribe=null;}records=[];recordsLoaded=false;return;
  }
  if(!cloud.owner()){
    $("app-view").hidden=true;$("auth-view").hidden=false;
    $("auth-status").textContent=`目前登入帳號：${user.email||"未知"}\n此系統僅授權 EHS 管理員使用，且帳號需完成 Email 驗證。請切換至授權帳號。`;
    return;
  }
  $("auth-view").hidden=true;$("app-view").hidden=false;$("account-label").textContent=user.email;
  $("auth-status").textContent="管理員登入成功，正在讀取季度資料…";
  try{
    unsubscribe=cloud.watchRecords(rows=>{
      records=rows;recordsLoaded=true;renderAll();
      $("auth-status").textContent="雲端資料已同步。";
    },error=>setMessage(`讀取雲端資料失敗：${error.message}`,"danger"));
  }catch(error){setMessage(error.message,"danger");}
}
initializePeriodSelectors();initializeEvents();updateOCRCheckTable();
cloud.observeAuth(handleAuth);
