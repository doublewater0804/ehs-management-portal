/* 環保規費 Dashboard R1.2 基底。既有 DATA/STATS_DATA 保留為原始唯讀基準；雲端覆寫僅作用於執行期。 */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sites=['龍德','彰化','麥寮','台醋','新港'];
const DEFAULT_TYPES=[
 {id:'air',name:'空污費',mode:'quarter',scope:'site',active:true,locked:true,color:'#0aa39a'},
 {id:'soil',name:'土污費',mode:'quarter',scope:'company',active:true,locked:true,color:'#65b934'},
 {id:'water',name:'水污費',mode:'half',scope:'site',active:true,locked:true,color:'#3d8eea'}
];
const palette=['#9b5de5','#f15b5b','#e69f00','#2b83ba','#8a6d3b','#ad5c92','#3e9c68'];
const rawData=structuredClone(DATA),rawStats=structuredClone(STATS_DATA);
const cloud={ready:false,loggedIn:false,loading:true,user:'',records:new Map(),types:new Map(),notes:new Map(),reasons:new Map(),audit:[],error:''};
window.envFeeR11={cloud,rawData,rawStats};
let dirtyNote=false,activeNoteKey='',lastNoteValue='',typeEditId='',currentReasonKey='';
const typeOf=id=>DEFAULT_TYPES.find(t=>t.id===id)||cloud.types.get(id);
const allTypes=()=>[...DEFAULT_TYPES,...[...cloud.types.values()].sort((a,b)=>(a.createdAt||'').localeCompare(b.createdAt||''))];
const visibleTypes=()=>allTypes().filter(t=>t.active!==false);
const dashboardTypes=(year,site='all')=>allTypes().filter(t=> (site==='all'||t.scope==='site')&&(t.active!==false||sumType(year,t.id,site)!==null));
const modeLabels={quarter:['Q1','Q2','Q3','Q4'],half:['上半年','下半年'],year:['全年']};
const periods=t=>modeLabels[t?.mode]||modeLabels.quarter;
const keyOf=r=>[r.year,r.type,r.period,r.site].join('|');
const recId=r=>encodeURIComponent(keyOf(r));
const noteKey=(year,site)=>`${year}|${site}`;
const reasonKey=()=>[compareYear,compareType,periods(typeOf(compareType))[comparePeriod]||'Q1',compareSite,compareMode].join('|');
const isReady=()=>cloud.ready&&cloud.loggedIn;
const userName=()=>cloud.user||'管理員';
function ensureReady(){if(!isReady()){alert('需先完成 Firebase 管理員登入，才能儲存雲端資料。');return false}return true}
function status(text,bad=false){const el=$('cloudStatus');if(el){el.textContent=text;el.className='cloud-status '+(bad?'cloud-error':'')}}
function feeAmount(r){return r&&r.status!=='尚未申報'&&r.amount!==null&&r.amount!==undefined?Number(r.amount)-Number(r.refund||0):null}
function baselineRecord(year,type,site,period){
 const t=typeOf(type),d=rawStats[year];if(!t||!d||!periods(t).includes(period))return null;
 let amount=null;
 if(type==='soil')amount=d.soil?.[periods(t).indexOf(period)]??null;
 else if(type==='air'||type==='water')amount=d[type]?.[site]?.[periods(t).indexOf(period)]??null;
 else return null;
 return {year,type,site,period,amount,refund:0,status:amount===null?'尚未申報':'已申報',note:'',baseline:true};
}
function effectiveRecord(year,type,site,period){
 const key=[year,type,period,site].join('|');
 const r=cloud.records.get(key);
 if(r)return r.deleted?null:r;
 return baselineRecord(year,type,site,period);
}
function activeRecordRows(year,type,site='all'){
 const t=typeOf(type);if(!t)return [];
 const scoped=t.scope==='company'?['全公司']:(site==='all'?sites:[site]);
 return scoped.flatMap(s=>periods(t).map(p=>effectiveRecord(year,type,s,p)).filter(Boolean));
}
function sumPeriod(year,type,site,period){
 const t=typeOf(type);if(!t)return null;
 const scoped=t.scope==='company'?['全公司']:(site==='all'?sites:[site]);
 const rows=scoped.map(s=>effectiveRecord(year,type,s,period));
 const nums=rows.map(feeAmount).filter(v=>v!==null);
 return nums.length?nums.reduce((a,b)=>a+b,0):null;
}
function sumType(year,type,site){
 const t=typeOf(type);if(!t)return null;
 const vals=periods(t).map(p=>sumPeriod(year,type,site,p)).filter(v=>v!==null);
 return vals.length?vals.reduce((a,b)=>a+b,0):null;
}
function deltaFor(year,type,site){
 const t=typeOf(type);if(!t||!['air','soil','water'].includes(type))return 0;
 const match=(rec)=>Number(rec.year)===Number(year)&&rec.type===type&&(t.scope==='company'||site==='all'||rec.site===site);
 return [...cloud.records.values()].filter(match).reduce((sum,r)=>{
  const baseline=baselineRecord(r.year,r.type,r.site,r.period);
  return sum+(r.deleted?0:(feeAmount(r)??0))-(feeAmount(baseline)??0);
 },0);
}
function refundFor(year,type,site){
 const t=typeOf(type);if(!t)return 0;
 return [...cloud.records.values()].filter(r=>!r.deleted&&Number(r.year)===Number(year)&&r.type===type&&(t.scope==='company'||site==='all'||r.site===site)&&r.status!=='尚未申報').reduce((s,r)=>s+Number(r.refund||0),0);
}
function displayYear(year){
 const base=rawData[year]||{air:0,soil:0,water:0,sites:Object.fromEntries(sites.map(s=>[s,0])),waterSites:Object.fromEntries(sites.map(s=>[s,0])),total:0};
 const d=structuredClone(base);
 for(const type of ['air','soil','water'])d[type]=(base[type]||0)+deltaFor(year,type,'all');
 d.sites=Object.fromEntries(sites.map(s=>[s,(base.sites?.[s]||0)+deltaFor(year,'air',s)]));
 d.waterSites=Object.fromEntries(sites.map(s=>[s,(base.waterSites?.[s]||0)+deltaFor(year,'water',s)]));
 d.custom={};for(const t of allTypes().filter(t=>!t.locked))d.custom[t.id]=sumType(year,t.id,'all')||0;
 d.soilGross=d.soil+refundFor(year,'soil','all');d.soilRefund=refundFor(year,'soil','all');
 d.total=d.air+d.soil+d.water+Object.values(d.custom).reduce((a,b)=>a+b,0);
 return d;
}
function ensureYears(){
 const ys=new Set([...Object.keys(rawStats).map(Number),...Object.keys(rawData).map(Number),...[...cloud.records.values()].map(r=>Number(r.year))]);
 const list=[...ys].filter(Number.isInteger).sort((a,b)=>b-a);
 for(const y of list){
  if(!STATS_DATA[y])STATS_DATA[y]={air:Object.fromEntries(sites.map(s=>[s,[null,null,null,null]])),soil:[null,null,null,null],water:Object.fromEntries(sites.filter(s=>s!=='台醋').map(s=>[s,[null,null]]))};
  if(!DATA[y])DATA[y]=displayYear(y);
 }
 ['annualYear','compareYear','mfYear','statsYearLeft','statsYearRight','exportStartYear','exportEndYear'].forEach(id=>{
  const el=$(id);if(!el)return;
  const preserve=el.value;
  const first=id==='mfYear'?'<option value="">全部年度</option>':'';
  el.innerHTML=first+list.map(y=>`<option value="${y}">${y}</option>`).join('');
  if([...el.options].some(o=>o.value===preserve))el.value=preserve;else if(list.length)el.value=String(list[0]);
 });
}
function syncModels(){
 ensureYears();
 for(const ystr of Object.keys(STATS_DATA)){
  const y=Number(ystr),d=structuredClone(rawStats[y]||{air:Object.fromEntries(sites.map(s=>[s,[null,null,null,null]])),soil:[null,null,null,null],water:Object.fromEntries(sites.filter(s=>s!=='台醋').map(s=>[s,[null,null]]))});
  for(const t of DEFAULT_TYPES){
   for(const site of (t.scope==='company'?['全公司']:sites)){
    const arr=periods(t).map(p=>feeAmount(effectiveRecord(y,t.id,site,p)));
    if(t.id==='soil')d.soil=arr;else d[t.id][site]=arr;
   }
  }
  STATS_DATA[y]=d;
  DATA[y]=displayYear(y);
 }
 for(const t of allTypes())TYPE_NAMES[t.id]=t.name,TYPE_COLORS[t.id]=t.color;
 refreshSelectors();
 renderAnnual();renderStatsTable();updateComparePeriodOptions();updateTrendRangeOptions();renderCompare();renderManagerRows();renderTypeRows();showNote();
}
function refreshSelectors(){
 const active=visibleTypes();
 const elements=['fType','compareType','exportType','mfType'];
 for(const id of elements){
  const sel=$(id);if(!sel)continue;
  const prev=sel.value;const prefix=id==='exportType'?'<option value="all">全部規費</option>':id==='mfType'?'<option value="">全部類型</option>':'';
  sel.innerHTML=prefix+(id==='fType'?active:allTypes()).map(t=>`<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
  if([...sel.options].some(o=>o.value===prev))sel.value=prev;
 }
 compareType=$('compareType').value;
 applyCompareSiteRules();refreshFormOptions();
}
function refreshFormOptions(){
 const t=typeOf($('fType').value),sel=$('fPeriod');if(!t)return;
 const old=sel.value;sel.innerHTML=periods(t).map(x=>`<option>${esc(x)}</option>`).join('');
 if(periods(t).includes(old))sel.value=old;
 $('fSite').disabled=t.scope==='company';if(t.scope==='company')$('fSite').value='全公司';else if($('fSite').value==='全公司')$('fSite').value=sites[0];
}
function effectiveYears(){return Object.keys(STATS_DATA).map(Number).sort((a,b)=>a-b)}
const originalRenderAnnual=renderAnnual;
renderAnnual=function(){
 const d=DATA[annualYear];if(!d)return;
 originalRenderAnnual();
 const isAll=annualSite==='all',custom=dashboardTypes(annualYear,annualSite).filter(t=>!t.locked);
 const cards=$('annualKpi');
 let totalCustom=0;
 custom.forEach(t=>{
  const val=sumType(annualYear,t.id,annualSite);const num=val??0;totalCustom+=num;
  cards.insertAdjacentHTML('beforeend',`<div class="kpi" style="--accent:${esc(t.color)}"><div class="kpi-title">${esc(t.name)}</div><div class="kpi-value">${val===null?'尚未申報':fmt(num)}</div><div class="kpi-meta"><span>範圍</span><strong>${t.scope==='company'?'全公司':esc(isAll?'全部廠區':annualSite)}</strong></div></div>`);
 });
 const baseTotal=(isAll?d.air+d.soil+d.water:(d.sites[annualSite]||0)+(d.waterSites[annualSite]||0));
 const first=cards.querySelector('.kpi-value');if(first)first.textContent=fmt(baseTotal+totalCustom);
 const soilRefund=$('annualSoilRefund');if(soilRefund)soilRefund.textContent=fmt(d.soilRefund||0);
 if($('annualSoilGross'))$('annualSoilGross').textContent=fmt(d.soilGross||d.soil);
 if($('annualSoilNet'))$('annualSoilNet').textContent=fmt(d.soil);
 cards.style.gridTemplateColumns=`repeat(${Math.min(cards.children.length,4)},minmax(0,1fr))`;
 const waterCard=[...cards.children].find(el=>el.querySelector('.kpi-title')?.textContent==='水污費');
 if(waterCard&&sumType(annualYear,'water',annualSite)===null)waterCard.querySelector('.kpi-value').textContent='尚未申報';
 renderAnnualTrend();renderAnnualDonut();
};
renderAnnualTrend=function(){
 const years=effectiveYears().filter(y=>y<=annualYear).slice(-6),all=annualSite==='all';
 const bars=years.map(y=>{
  const d=DATA[y],values=dashboardTypes(y,all?'all':annualSite).map(t=>({t,val:t.locked?(t.id==='air'?(all?d.air:d.sites?.[annualSite]||0):t.id==='water'?(all?d.water:d.waterSites?.[annualSite]||0):d.soil):sumType(y,t.id,annualSite)||0}));
  const total=values.reduce((s,x)=>s+x.val,0);return {y,total,values};
 });
 const max=Math.max(1,...bars.map(b=>b.total));
 $('annualTrend').innerHTML=bars.map(b=>`<div class="bar-stack" style="--h:${(b.total/max*100).toFixed(3)}%" title="${esc(b.values.map(x=>x.t.name+'：'+fmtUnit(x.val)).join(' / '))}"><div class="bar-total-label">${fmtUnit(b.total)}</div>${b.values.map(x=>`<div class="seg" style="background:${esc(x.t.color)};height:${b.total?(x.val/b.total*100):0}%"></div>`).join('')}<div class="year-label">${b.y}年${b.y===annualYear?'<br><small>累計</small>':''}</div></div>`).join('');
 const legend=$('annualTrend').closest('.panel-body').querySelector('.legend');if(legend)legend.innerHTML=dashboardTypes(annualYear,annualSite).map(t=>`<span><i class="dot" style="background:${esc(t.color)}"></i>${esc(t.name)}</span>`).join('');
};
renderAnnualDonut=function(){
 const d=DATA[annualYear],all=annualSite==='all';
 const entries=allTypes().filter(t=>t.active!==false&&(all||t.scope==='site')).map(t=>({t,val:t.locked?(t.id==='air'?(all?d.air:d.sites?.[annualSite]||0):t.id==='water'?(all?d.water:d.waterSites?.[annualSite]||0):d.soil):sumType(annualYear,t.id,annualSite)||0}));
 const total=entries.reduce((s,x)=>s+x.val,0);let angle=0;
 const stops=entries.map(x=>{const from=angle;angle+=total?x.val/total*100:0;return `${x.t.color} ${from}% ${angle}%`});
 $('annualDonut').style.background=total?`conic-gradient(${stops.join(',')})`:'#e2e8f0';
 $('annualDonutTotal').textContent=fmt(total);
 $('annualDonutLegend').innerHTML=entries.map(x=>`<div><i class="dot" style="background:${esc(x.t.color)}"></i>${esc(x.t.name)} ${total?(x.val/total*100).toFixed(1):'0.0'}%</div>`).join('');
};
getStatsPeriodArray=function(year,type,site='all'){
 const t=typeOf(type);if(!t)return null;
 return periods(t).map(p=>sumPeriod(year,type,site,p));
};
periodLabel=function(type,idx){return periods(typeOf(type))[idx]||'—'};
getPeriodArray=function(d,type,site='all'){
 const y=Object.keys(DATA).find(k=>DATA[k]===d);return y?getStatsPeriodArray(Number(y),type,site):null;
};
applyCompareSiteRules=function(){const t=typeOf(compareType);const sel=$('compareSite');if(t?.scope==='company'){compareSite='all';sel.value='all';sel.disabled=true}else sel.disabled=false};
updateComparePeriodOptions=function(){
 const sel=$('comparePeriod'),arr=getStatsPeriodArray(compareYear,compareType,compareSite)||[];
 const labels=periods(typeOf(compareType));sel.innerHTML=labels.map((p,i)=>`<option value="${i}">${esc(p)}${arr[i]===null?'（尚未申報）':''}</option>`).join('');
 const idx=arr.findLastIndex(v=>v!==null);comparePeriod=idx>=0?idx:0;sel.value=String(comparePeriod);
};
const originalGetComparePair=getComparePair;
getComparePair=function(){
 const t=typeOf(compareType);
 if(t?.locked)return originalGetComparePair();
 const labels=periods(t),idx=Math.max(0,Math.min(comparePeriod,labels.length-1)),curLabel=`${compareYear} ${labels[idx]}`;
 const current=getStatsPeriodArray(compareYear,compareType,compareSite)?.[idx]??null;
 if(compareMode==='ytd'){
  const cumulative=(year)=>{const arr=getStatsPeriodArray(year,compareType,compareSite)?.slice(0,idx+1)||[];const vals=arr.filter(v=>v!==null);return vals.length?vals.reduce((a,b)=>a+b,0):null};
  return {current:cumulative(compareYear),previous:cumulative(compareYear-1),currentLabel:`${curLabel}累計`,previousLabel:`${compareYear-1} 同期累計`};
 }
 if(compareMode==='yoyq'||t.mode==='year')return {current,previous:getStatsPeriodArray(compareYear-1,compareType,compareSite)?.[idx]??null,currentLabel:curLabel,previousLabel:`${compareYear-1} ${labels[idx]}`};
 return {current,previous:idx>0?(getStatsPeriodArray(compareYear,compareType,compareSite)?.[idx-1]??null):(getStatsPeriodArray(compareYear-1,compareType,compareSite)?.[labels.length-1]??null),currentLabel:curLabel,previousLabel:idx>0?`${compareYear} ${labels[idx-1]}`:`${compareYear-1} ${labels[labels.length-1]}`};
};
buildSequentialItems=function(){
 const ys=effectiveYears().filter(y=>y<=compareYear),labels=periods(typeOf(compareType));
 return ys.flatMap(y=>labels.map((p,i)=>({year:y,key:`${y}-${i}`,period:i,value:getStatsPeriodArray(y,compareType,compareSite)?.[i]??null,shortLabel:`${y}${p}`,fullLabel:`${y} ${p}`})));
};

renderCompareSites=function(){
 const panel=$('compareSitePanel'),t=typeOf(compareType);
 if(!t||t.scope==='company'||compareSite!=='all'){panel.classList.add('hidden');return}
 panel.classList.remove('hidden');
 $('compareSiteBars').innerHTML=sites.map(s=>({s,v:sumType(compareYear,compareType,s)})).map(({s,v})=>{
  const max=Math.max(1,...sites.map(n=>sumType(compareYear,compareType,n)||0));
  return `<div class="hbar-row"><b>${esc(s)}</b><div class="hbar-track"><div class="hbar-fill" style="width:${(v||0)/max*100}%"></div></div><span>${v===null?'尚未申報':fmt(v)}</span></div>`;
 }).join('');
};
function customQuarterTotals(year){
 const v=[0,0,0,0];
 for(const t of allTypes().filter(x=>!x.locked)){
  periods(t).forEach((p,i)=>{const idx=t.mode==='quarter'?i:t.mode==='half'?i*2:3;v[idx]+=sumPeriod(year,t.id,'all',p)||0});
 }return v;
}
const baseRenderStatsTable=renderStatsTable;
renderStatsTable=function(){
 baseRenderStatsTable();
 const table=$('statsTableContainer')?.querySelector('table');if(!table)return;
 const y1=Number($('statsYearLeft').value),y2=Number($('statsYearRight').value);
 const custom=allTypes().filter(t=>!t.locked),tbody=table.tBodies[0],last=tbody.querySelector('tr.grand-total');if(!last)return;
 for(const t of custom){
  const values=(year)=>{const q=[null,null,null,null];periods(t).forEach((p,i)=>{const qi=t.mode==='quarter'?i:t.mode==='half'?i*2:3;q[qi]=sumPeriod(year,t.id,'all',p)});return q};
  const a=values(y1),b=values(y2);
  const tr=document.createElement('tr');tr.className='custom-fee-row';
  tr.innerHTML=`<td class="section">${esc(t.name)}（${t.mode==='quarter'?'季':t.mode==='half'?'半年':'年'}）</td><td>${t.scope==='company'?'全公司':'全部廠區'}</td>${a.map(v=>`<td>${displayStatsValue(v)}</td>`).join('')}<td>${displayStatsValue(sumType(y1,t.id,'all'))}</td>${b.map(v=>`<td>${displayStatsValue(v)}</td>`).join('')}<td>${displayStatsValue(sumType(y2,t.id,'all'))}</td>`;
  tbody.insertBefore(tr,last);
 }
 const qa=customQuarterTotals(y1),qb=customQuarterTotals(y2),cells=[...last.cells];
 for(let i=0;i<4;i++){
  cells[1+i].textContent=Number(cells[1+i].textContent.replace(/,/g,'')) + qa[i];
  cells[6+i].textContent=Number(cells[6+i].textContent.replace(/,/g,'')) + qb[i];
 }
 for(const ix of [1,2,3,4,6,7,8,9])cells[ix].textContent=Number(cells[ix].textContent).toLocaleString('zh-TW');
 cells[5].textContent=fmtStatic(getStatsYearTotal(STATS_DATA[y1])+qa.reduce((a,b)=>a+b,0));
 cells[10].textContent=fmtStatic(getStatsYearTotal(STATS_DATA[y2])+qb.reduce((a,b)=>a+b,0));
};
function fmtStatic(n){return Number(n||0).toLocaleString('zh-TW',{maximumFractionDigits:12})}
function renderDiscrepancy(){
 const rows=Object.keys(rawStats).map(y=>{
  const d=rawStats[y],n=Object.values(d.air||{}).flat().reduce((a,b)=>a+(b||0),0)+ (d.soil||[]).reduce((a,b)=>a+(b||0),0)+Object.values(d.water||{}).flat().reduce((a,b)=>a+(b||0),0);
  return {y:Number(y),dashboard:rawData[y]?.total,stats:n,diff:n-(rawData[y]?.total||0)};
 }).filter(r=>r.diff);
 const el=$('historicalDiscrepancy');if(!el)return;
 el.innerHTML=`<details><summary>歷史原始資料口徑差異：${rows.length} 個年度待核對（不自動覆寫）</summary><div class="mgmt-table-wrap"><table><thead><tr><th>年度</th><th>Dashboard 原始</th><th>統計表明細</th><th>差額（統計－Dashboard）</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r.y}</td><td>${fmtStatic(r.dashboard)}</td><td>${fmtStatic(r.stats)}</td><td>${fmtStatic(r.diff)}</td></tr>`).join('')}</tbody></table></div></details>`;
}
function showNote(){
 const el=$('annualNote');if(!el)return;
 const k=noteKey(annualYear,annualSite==='all'?'全公司':annualSite);
 const data=cloud.notes.get(k);
 if(dirtyNote&&activeNoteKey===k)return;
 activeNoteKey=k;lastNoteValue=data?.content||'';el.value=lastNoteValue;dirtyNote=false;
 $('noteMeta').textContent=data?.updatedAt?`最後更新：${new Date(data.updatedAt).toLocaleString('zh-TW')}／${data.updatedBy||'管理員'}`:'尚未建立備註';
 $('noteSave').disabled=!isReady();$('noteDelete').disabled=!isReady()||!lastNoteValue;
}
function noteGuard(){
 if(dirtyNote&&!confirm('備註內容尚未儲存，確定放棄修改並切換嗎？'))return false;
 dirtyNote=false;return true;
}
function onNoteContextChange(e,id,prop){
 if(!noteGuard()){$(id).value=String(window['envFeeLast'+prop]|| (prop==='Year'?annualYear:annualSite));return}
 if(prop==='Year')annualYear=+e.target.value;else annualSite=e.target.value;
 window['envFeeLast'+prop]=prop==='Year'?annualYear:annualSite;
 renderAnnual();showNote();
}
function reasonBind(){
 const k=reasonKey(),r=cloud.reasons.get(k);currentReasonKey=k;
 const el=$('reasonText');if(!el)return;el.value=r?.content||'';
 $('reasonStatus').textContent=r?.updatedAt?`已儲存：${new Date(r.updatedAt).toLocaleString('zh-TW')}`:'尚未儲存';
 $('saveReason').disabled=!isReady();
}
const oldCompareSummary=renderCompareSummary;
renderCompareSummary=function(pair){const wasKey=currentReasonKey,wasValue=$('reasonText')?.value;const wasChanged=wasKey===reasonKey()&&wasValue!==(cloud.reasons.get(wasKey)?.content||'');oldCompareSummary(pair);const target=$('compareSummary')?.querySelector('.reason');if(target){target.outerHTML='<textarea class="reason" id="reasonText" rows="2" maxlength="2000" placeholder="填寫差異原因"></textarea><button class="btn primary" id="saveReason" type="button">儲存原因</button><div class="muted" id="reasonStatus"></div>';reasonBind();if(wasChanged){$('reasonText').value=wasValue;$('reasonStatus').textContent='尚未儲存的編輯內容';}$('saveReason').onclick=async()=>{if(!ensureReady())return;try{await window.feeCloudAPI.saveReason({id:encodeURIComponent(reasonKey()),key:reasonKey(),content:$('reasonText').value});$('reasonStatus').textContent='已儲存至 Firebase';}catch(e){alert('原因儲存失敗：'+e.message)}}}}
function renderTypeRows(){
 const tbody=$('typeRows');if(!tbody)return;
 tbody.innerHTML=allTypes().map(t=>`<tr><td>${esc(t.name)}</td><td>${t.mode==='quarter'?'季度':t.mode==='half'?'半年':'全年'}</td><td>${t.scope==='company'?'全公司':'依廠區'}</td><td>${t.active===false?'停用':'啟用'}</td><td>${t.locked?'內建不可刪除':`<button class="small-btn edit" data-typeedit="${esc(t.id)}">編輯</button><button class="small-btn delete" data-typetoggle="${esc(t.id)}">${t.active===false?'啟用':'停用'}</button>`}</td></tr>`).join('');
 tbody.querySelectorAll('[data-typeedit]').forEach(b=>b.onclick=()=>editType(b.dataset.typeedit));
 tbody.querySelectorAll('[data-typetoggle]').forEach(b=>b.onclick=()=>toggleType(b.dataset.typetoggle));
}
// 分類屬性會決定既有紀錄的唯一鍵。只有尚無有效紀錄時，才允許直接修改申報週期與範圍。
function typeRecordCount(id){return [...cloud.records.values()].filter(r=>r.type===id&&!r.deleted).length}
function resetTypeEditor(){
 typeEditId='';$('feeTypeForm').reset();$('typeMode').disabled=false;$('typeScope').disabled=false;
 $('typeSave').textContent='新增規費類型';$('typeEditHint').textContent='新增規費時可設定名稱、申報週期及適用範圍。';
}
function editType(id){
 const t=cloud.types.get(id);if(!t)return;
 typeEditId=id;$('typeName').value=t.name;$('typeMode').value=t.mode;$('typeScope').value=t.scope;
 const count=typeRecordCount(id),locked=count>0;
 $('typeMode').disabled=locked;$('typeScope').disabled=locked;
 $('typeSave').textContent='儲存變更';
 $('typeEditHint').textContent=locked
  ?`「${t.name}」已有 ${count} 筆有效雲端紀錄。可修改名稱；為避免既有申報金額或備註遺失，週期與範圍暫時鎖定。如需調整，請先匯出備份並處理相關紀錄，或新增另一個規費類型。`
  :`「${t.name}」目前沒有有效雲端紀錄，可以修改名稱、申報週期及範圍，儲存後將同步更新報表。`;
 $('typeName').focus();
}
async function toggleType(id){if(!ensureReady())return;const t=cloud.types.get(id);if(!t)return;if(!confirm(`確定${t.active===false?'啟用':'停用'}「${t.name}」？歷史資料仍保留。`))return;try{await window.feeCloudAPI.saveType({...t,active:t.active===false});}catch(e){alert(e.message)}}
async function saveType(e){
 e.preventDefault();if(!ensureReady())return;
 const name=$('typeName').value.trim();if(!name||name.length>40)return alert('規費名稱需為 1～40 字。');
 if(allTypes().some(t=>t.name===name&&t.id!==typeEditId))return alert('規費名稱不可重複。');
 const previous=typeEditId?cloud.types.get(typeEditId):null;
 if(typeEditId&&!previous)return alert('此規費類型已不存在，請重新整理資料。');
 const mode=$('typeMode').value,scope=$('typeScope').value;
 if(previous&&typeRecordCount(previous.id)>0&&(mode!==previous.mode||scope!==previous.scope)){
  return alert('此規費已有有效申報紀錄，不能直接變更週期或範圍。請先處理原資料，避免遺失。');
 }
 const t={id:typeEditId||'fee_'+crypto.randomUUID(),name,mode,scope,active:previous?.active??true,createdAt:previous?.createdAt||new Date().toISOString(),color:previous?.color||palette[cloud.types.size%palette.length]};
 $('typeSave').disabled=true;
 try{await window.feeCloudAPI.saveType(t);resetTypeEditor();}catch(err){alert('儲存規費類型失敗：'+err.message)}
 finally{$('typeSave').disabled=false}
}
function formToRecord(){
 const t=typeOf($('fType').value);if(!t)throw Error('規費類型不存在');
 const year=Number($('fYear').value),period=$('fPeriod').value,site=t.scope==='company'?'全公司':$('fSite').value;
 const status=$('fStatus').value,amount=status==='尚未申報'?null:Number($('fAmount').value),refund=status==='尚未申報'?0:Number($('fRefund').value||0);
 if(!Number.isInteger(year)||year<2016||year>2100)throw Error('年度超出範圍');
 if(!periods(t).includes(period))throw Error('期間不符合規費週期');
 if(t.scope==='site'&&!sites.includes(site))throw Error('請選擇廠區');
 if(status!=='尚未申報'&&(!$('fAmount').value.trim()||!Number.isFinite(amount)||amount<0))throw Error('原始金額必須是非負數字');
 if(!Number.isFinite(refund)||refund<0||amount!==null&&refund>amount)throw Error('退費不可大於原始金額');
 return {year,period,type:t.id,site,amount,refund,status,note:$('fNote').value.trim().slice(0,2000)};
}
function renderManagerRowsR11(){
 const fy=$('mfYear').value,ft=$('mfType').value,fs=$('mfSite').value,fst=$('mfStatus').value;
 const years=effectiveYears(),rows=[];
 for(const year of years){if(fy&&String(year)!==fy)continue;for(const t of allTypes()){
  if(ft&&t.id!==ft)continue;
  const ss=t.scope==='company'?['全公司']:sites;
  for(const site of ss){if(fs&&site!==fs)continue;for(const p of periods(t)){
   const r=effectiveRecord(year,t.id,site,p);if(!r||(!r.baseline&&!cloud.records.has(keyOf(r))))continue;
   if(!r.baseline&&r.status==='尚未申報'&&r.amount===null&&(!r.note))continue;
   if(fst&&r.status!==fst)continue;
   rows.push(r);
  }}
 }}
 $('managerRows').innerHTML=rows.length?rows.sort((a,b)=>b.year-a.year||a.type.localeCompare(b.type)||a.site.localeCompare(b.site)).map(r=>`<tr><td>${r.year}</td><td>${esc(r.period)}</td><td>${esc(typeOf(r.type)?.name||r.type)}</td><td>${esc(r.site)}</td><td>${r.amount===null?'尚未申報':fmtStatic(r.amount)}</td><td>${fmtStatic(r.refund)}</td><td>${feeAmount(r)===null?'尚未申報':fmtStatic(feeAmount(r))}</td><td><span class="badge ${r.status==='已申報'?'ok':'pending'}">${esc(r.status)}</span></td><td class="long-note">${esc(r.note)}</td><td><button class="small-btn edit" data-edit="${esc(keyOf(r))}">編輯</button><button class="small-btn delete" data-del="${esc(keyOf(r))}">刪除</button></td></tr>`).join(''):'<tr><td colspan="10">目前篩選條件沒有資料</td></tr>';
 $('managerRows').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editRecord(b.dataset.edit));
 $('managerRows').querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>deleteRecord(b.dataset.del));
}
renderManagerRows=renderManagerRowsR11;
editRecord=function(key){
 const [y,type,p,site]=key.split('|');const r=effectiveRecord(Number(y),type,site,p);if(!r)return;
 $('editId').value=key;$('fYear').value=y;$('fType').value=type;refreshFormOptions();$('fPeriod').value=p;$('fSite').value=site;$('fAmount').value=r.amount??'';$('fRefund').value=r.refund??0;$('fStatus').value=r.status;$('fNote').value=r.note||'';$('fAmount').disabled=$('fRefund').disabled=r.status==='尚未申報';
 showManagerTab('form');
};
deleteRecord=async function(key){
 if(!ensureReady())return;const [year,type,period,site]=key.split('|');
 if(!confirm(`確定刪除 ${year} / ${typeOf(type)?.name} / ${period} / ${site} 的資料？\n此動作會在雲端留下刪除標記及稽核紀錄，不會抹除內建原始數據。`))return;
 try{await window.feeCloudAPI.saveRecord({year:Number(year),type,period,site,deleted:true,amount:null,refund:0,status:'尚未申報',note:''},'delete');}catch(e){alert('刪除失敗：'+e.message)}
};
function setupFeeForm(){
 $('feeForm').onsubmit=async e=>{
  e.preventDefault();if(!ensureReady())return;
  try{
   const r=formToRecord();const old=$('editId').value;
   if(old&&old!==keyOf(r)&&!confirm('已修改原有紀錄的年度、種類、期間或廠區。儲存後將新增另一筆紀錄，原紀錄仍保留。確定繼續？'))return;
   await window.feeCloudAPI.saveRecord(r,'upsert');alert('資料已儲存至 Firebase');resetManagerForm();showManagerTab('list');
  }catch(err){alert('儲存失敗：'+err.message)}
 };
 $('fType').onchange=refreshFormOptions;
 $('fStatus').onchange=()=>{const pending=$('fStatus').value==='尚未申報';$('fAmount').disabled=$('fRefund').disabled=pending;if(pending){$('fAmount').value='';$('fRefund').value='0'}};
 $('clearForm').onclick=()=>{resetManagerForm();refreshFormOptions();$('fAmount').disabled=$('fRefund').disabled=false};
 ['mfYear','mfType','mfSite','mfStatus'].forEach(id=>$(id).onchange=renderManagerRows);
}
function showLoading(show){const e=$('feeBusy');if(e)e.hidden=!show}
async function previewImportR11(){
 const file=$('importFile').files[0],stat=$('importStatus'),btn=$('commitImport');btn.disabled=true;pendingImportRows=[];
 if(!file){stat.textContent='請先選擇檔案';return}
 try{
  let rows=[];
  if(file.name.toLowerCase().endsWith('.csv'))rows=parseCsv(await file.text());
  else{if(typeof XLSX==='undefined')throw Error('Excel 元件尚未載入');const buf=await file.arrayBuffer();const w=XLSX.read(buf,{type:'array'});rows=XLSX.utils.sheet_to_json(w.Sheets[w.SheetNames[0]],{defval:''})}
  const mapped=rows.map(row=>{
   const r=mapImportRow(row),t=allTypes().find(t=>t.name===String(row['規費類型']||row['項目']||row['類型']).trim());
   if(t)r.type=t.id;
   const raw=String(row['原始金額']??row['金額']??row['申報金額']??'').trim();
   if(r.status==='尚未申報'&&!raw)r.amount=null;
   return r;
  });
  const seen=new Set();const validation=mapped.map((r,i)=>{
   const errs=[];const t=typeOf(r.type);
   if(!Number.isInteger(r.year)||r.year<2016||r.year>2100)errs.push('年度無效');
   if(!t)errs.push('請先建立規費類型');
   else{if(!periods(t).includes(r.period))errs.push('週期錯誤');if(t.scope==='company'&&r.site!=='全公司'||t.scope==='site'&&!sites.includes(r.site))errs.push('廠區錯誤')}
   if(r.status!=='已申報'&&r.status!=='尚未申報')errs.push('申報狀態錯誤');
   if(r.status==='已申報'&&(!Number.isInteger(r.amount)||r.amount<0))errs.push('金額錯誤');
   if(r.status==='尚未申報'&&r.amount!==null)errs.push('未申報不能有金額');
   if(!Number.isInteger(r.refund)||r.refund<0||r.amount!==null&&r.refund>r.amount)errs.push('退費錯誤');
   if(seen.has(keyOf(r)))errs.push('檔內重複唯一鍵');seen.add(keyOf(r));
   return {row:i+2,errors:errs};
  });
  renderImportPreview(mapped,validation);$('importPreview').classList.remove('hidden');
  const bad=validation.filter(v=>v.errors.length).length;
  const overwrite=mapped.filter(r=>!!cloud.records.get(keyOf(r))).length;const historical=mapped.filter(r=>!!baselineRecord(r.year,r.type,r.site,r.period)).length;
  stat.className='io-status '+(bad?'error':'ok');stat.textContent=`共 ${mapped.length} 筆；${bad} 筆錯誤。已存在雲端覆寫：${overwrite} 筆；涉及原始歷史資料：${historical} 筆（原始檔不會刪除）。`;
  if(!bad&&mapped.length){pendingImportRows=mapped;btn.disabled=!isReady()}
 }catch(err){stat.className='io-status error';stat.textContent='讀取失敗：'+err.message}
}
commitImportRows=async function(){
 if(!ensureReady()||!pendingImportRows.length)return;
 if(!confirm(`將 ${pendingImportRows.length} 筆資料寫入 Firebase；同一年度＋種類＋期間＋廠區會取代先前的值。確定嗎？`))return;
 showLoading(true);
 try{await window.feeCloudAPI.importRows(pendingImportRows);$('importStatus').className='io-status ok';$('importStatus').textContent=`已確認 ${pendingImportRows.length} 筆資料成功提交至 Firebase。`;pendingImportRows=[];$('commitImport').disabled=true}
 catch(e){$('importStatus').className='io-status error';$('importStatus').textContent='匯入失敗：'+e.message}
 finally{showLoading(false)}
};
buildExportRows=function(){
 const from=Math.min(+$('exportStartYear').value,+$('exportEndYear').value),to=Math.max(+$('exportStartYear').value,+$('exportEndYear').value),tf=$('exportType').value;
 const result=[];
 for(let year=from;year<=to;year++)for(const t of allTypes()){
  if(tf!=='all'&&tf!==t.id)continue;
  for(const site of (t.scope==='company'?['全公司']:sites))for(const p of periods(t)){
   const r=effectiveRecord(year,t.id,site,p);if(!r)continue;
   result.push({年度:year,期間:p,規費類型:t.name,'範圍／廠區':site,原始金額:r.amount,'退費／扣抵':r.refund??0,淨支出:feeAmount(r),申報狀態:r.status,備註:r.note||''});
  }
 }return result;
};
function auxRows(kind){
 if(kind==='notes')return [...cloud.notes.values()].filter(r=>!r.deleted&&r.content).map(r=>({年度:r.year,廠區:r.site,備註:r.content,最後修改:r.updatedAt||'',修改人:r.updatedBy||''}));
 if(kind==='types')return allTypes().map(t=>({規費名稱:t.name,代碼:t.id,週期:t.mode,範圍:t.scope,狀態:t.active===false?'停用':'啟用'}));
 if(kind==='reasons')return [...cloud.reasons.values()].filter(r=>r.content).map(r=>({比較識別:r.key,差異原因:r.content,最後修改:r.updatedAt||'',修改人:r.updatedBy||''}));
 return [];
}
function safeCsv(rows,basename){
 if(!rows.length)return alert('目前無可匯出的資料。');
 const keys=Object.keys(rows[0]);
 const cell=v=>{let s=v==null?'':String(v);if(/^[=+@\-\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};
 const csv='\uFEFF'+[keys.map(cell).join(','),...rows.map(r=>keys.map(k=>cell(r[k])).join(','))].join('\r\n');
 downloadBlob(new Blob([csv],{type:'text/csv;charset=utf-8'}),basename+'.csv');
}
function exportAuxiliary(kind){safeCsv(auxRows(kind),`環保規費_${{notes:'年度備註',types:'規費類型',reasons:'差異原因'}[kind]}`)}
exportData=function(format){
 const rows=buildExportRows(),status=$('exportStatus');
 if(!rows.length){status.className='io-status error';status.textContent='選定範圍沒有可匯出的資料';return}
 try{
  if(format==='csv')safeCsv(rows,'環保規費_資料_'+new Date().toISOString().slice(0,10));
  else{
   if(typeof XLSX==='undefined')throw Error('Excel 元件尚未載入，請確認網路連線');
   const wb=XLSX.utils.book_new();
   for(const [name,data] of [['規費資料',rows],['年度備註',auxRows('notes')],['規費類型',auxRows('types')],['差異原因',auxRows('reasons')]]){
    XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(data.length?data:[{訊息:'無資料'}]),name);
   }
   XLSX.writeFile(wb,`環保規費_R1.2_${new Date().toISOString().slice(0,10)}.xlsx`);
  }
  status.className='io-status ok';status.textContent=`已產生 ${rows.length} 筆規費資料的${format==='csv'?' CSV':' Excel'} 匯出檔。`;
 }catch(e){status.className='io-status error';status.textContent='匯出失敗：'+e.message}
};
const previousPreview=renderImportPreview;
renderImportPreview=function(rows,validations){
 const columns=['年度','期間','規費類型','範圍／廠區','原始金額','退費／扣抵','申報狀態','備註','驗證結果'];
 $('importPreview').innerHTML=`<table class="preview-table"><thead><tr>${columns.map(c=>`<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${esc(r.year)}</td><td>${esc(r.period)}</td><td>${esc(TYPE_NAMES[r.type]||r.type)}</td><td>${esc(r.site)}</td><td>${r.amount===null?'尚未申報':Number.isFinite(r.amount)?fmtStatic(r.amount):'錯誤'}</td><td>${fmtStatic(r.refund)}</td><td>${esc(r.status)}</td><td>${esc(r.note)}</td><td>${esc(validations[i].errors.length?validations[i].errors.join('；'):'通過')}</td></tr>`).join('')}</tbody></table>`;
};
const beforeTrend=renderCompareTrend;
renderCompareTrend=function(){beforeTrend();const t=typeOf(compareType);if(t&&!t.locked){const el=$('compareTrendTitle');el.textContent=el.textContent.replace('逐季趨勢','逐期趨勢').replace(/累計至Q([1-4])/,(_,n)=>'累計至'+(periods(t)[Number(n)-1]||''));}};
function install(){
 $('annualPage').insertAdjacentHTML('beforeend',`<section class="panel annual-notes"><div class="panel-title">年度環保規費備註（依年度＋廠區獨立管理）</div><div class="panel-body"><textarea id="annualNote" rows="6" maxlength="10000" placeholder="填寫當年度的申報說明、異常或其他注意事項…"></textarea><div class="note-tools"><span class="muted" id="noteMeta">尚未建立備註</span><span id="noteDirty" class="muted"></span><button class="btn danger" type="button" id="noteDelete">刪除備註</button><button class="btn primary" type="button" id="noteSave">儲存備註</button></div></div></section><div id="historicalDiscrepancy" class="discrepancy"></div>`);
 $('managerModal').querySelector('.tabs').insertAdjacentHTML('beforeend','<button class="tab" data-tab="types">規費類型管理</button>');
 $('managerModal').querySelector('.modal-body').insertAdjacentHTML('beforeend',`<section id="managerTypes" class="hidden"><form id="feeTypeForm" class="type-form"><div class="form-group"><label>規費名稱</label><input id="typeName" required maxlength="40" placeholder="例如：廢棄物清理費"></div><div class="form-group"><label>申報週期</label><select id="typeMode"><option value="quarter">季度</option><option value="half">半年</option><option value="year">全年</option></select></div><div class="form-group"><label>範圍</label><select id="typeScope"><option value="site">依廠區</option><option value="company">全公司</option></select></div><button class="btn primary" id="typeSave">新增規費類型</button><button class="btn secondary" type="button" id="typeReset">清除</button><p class="note" id="typeEditHint" style="grid-column:1/-1" aria-live="polite">新增規費時可設定名稱、申報週期及適用範圍。</p></form><div class="mgmt-table-wrap"><table><thead><tr><th>類型</th><th>週期</th><th>範圍</th><th>狀態</th><th>操作</th></tr></thead><tbody id="typeRows"></tbody></table></div><p class="note">沒有有效申報紀錄的自訂規費，可修改名稱、週期與範圍；已有資料的規費只可更名或停用。停用不刪除歷史紀錄。</p></section>`);
 const oldShowManagerTab=showManagerTab;
 showManagerTab=function(tab){oldShowManagerTab(tab);$('managerTypes').classList.toggle('hidden',tab!=='types')};
 document.querySelectorAll('#managerModal .tab').forEach(tab=>tab.onclick=()=>showManagerTab(tab.dataset.tab));
 $('feeTypeForm').onsubmit=saveType;
 $('typeReset').onclick=resetTypeEditor;
 $('managerModal').querySelector('.tabs').insertAdjacentHTML('afterend','<div id="cloudStatus" class="cloud-status">正在檢查 Firebase 登入狀態…</div>');
 $('annualNote').oninput=()=>{dirtyNote=$('annualNote').value!==lastNoteValue;$('noteDirty').textContent=dirtyNote?'內容尚未儲存':''};
 $('noteSave').onclick=async()=>{if(!ensureReady())return;try{const [year,site]=activeNoteKey.split('|');const content=$('annualNote').value;await window.feeCloudAPI.saveNote({id:encodeURIComponent(activeNoteKey),key:activeNoteKey,year:Number(year),site,content});lastNoteValue=content;dirtyNote=false;$('noteDirty').textContent='已儲存';}catch(e){alert('備註儲存失敗：'+e.message)}};
 $('noteDelete').onclick=async()=>{if(!ensureReady()||!confirm('確定刪除此年度／廠區的全部備註嗎？'))return;try{const [year,site]=activeNoteKey.split('|');await window.feeCloudAPI.saveNote({id:encodeURIComponent(activeNoteKey),key:activeNoteKey,year:Number(year),site,content:'',deleted:true});$('annualNote').value='';lastNoteValue='';dirtyNote=false;$('noteDirty').textContent='已刪除';}catch(e){alert(e.message)}};
 window.envFeeLastYear=annualYear;window.envFeeLastSite=annualSite;
 $('annualYear').onchange=e=>onNoteContextChange(e,'annualYear','Year');
 $('annualSite').onchange=e=>onNoteContextChange(e,'annualSite','Site');
 $('feeForm').insertAdjacentHTML('beforeend','<p class="note">雲端儲存：唯一識別為「年度＋類型＋期間＋廠區」。既有歷史原始資料不會直接修改。</p>');
 setupFeeForm();
 $('previewImport').onclick=previewImportR11;
 $('commitImport').onclick=commitImportRows;
 $('exportCsv').onclick=()=>exportData('csv');$('exportXlsx').onclick=()=>exportData('xlsx');
 $('ioPage').insertAdjacentHTML('beforeend','<p class="note" id="feeBusy" hidden>正在提交雲端資料…</p>');
 const header=document.querySelector('.header');header.insertAdjacentHTML('afterend','<div class="login-bar"><span id="feeAuthStatus">正在確認管理員雲端登入…</span><button class="btn primary" id="feeLogin" type="button">使用 Google 帳號登入</button><button class="btn secondary hidden" id="feeLogout" type="button">登出</button></div>');
 $('feeLogin').onclick=()=>window.feeCloudAPI?.login().catch(e=>alert('登入失敗：'+e.message));
 $('feeLogout').onclick=()=>window.feeCloudAPI?.logout().catch(e=>alert('登出失敗：'+e.message));
 renderDiscrepancy();syncModels();
}
window.envFeeR11.applyCloud=function(part){
 const convert=(arr)=>new Map(arr.map(x=>[x.key||keyOf(x),x]));
 if(part.records)cloud.records=convert(part.records);
 if(part.types)cloud.types=new Map(part.types.map(x=>[x.id,x]));
 if(part.notes)cloud.notes=convert(part.notes);
 if(part.reasons)cloud.reasons=convert(part.reasons);
 if('ready'in part)cloud.ready=part.ready;
 if('loggedIn'in part)cloud.loggedIn=part.loggedIn;
 if('user'in part)cloud.user=part.user;
 if('loading'in part)cloud.loading=part.loading;
 if('error'in part)cloud.error=part.error;
 const ok=isReady();
 $('feeAuthStatus').textContent=cloud.error|| (ok?`已登入雲端：${cloud.user}`:cloud.loading?'正在連線 Firebase…':'尚未登入管理員，僅提供原始資料檢視');
 $('feeLogin').classList.toggle('hidden',cloud.loggedIn);$('feeLogout').classList.toggle('hidden',!cloud.loggedIn);
 status(ok?'Firebase 已連線，資料可新增、修改、刪除與跨裝置同步':cloud.error||'Firebase 未授權：無法雲端儲存',!ok);
 $('noteSave').disabled=$('noteDelete').disabled=!ok;
 $('commitImport').disabled=!ok||!pendingImportRows.length;
 syncModels();
};
window.envFeeR11.getModel={typeOf,allTypes,periods,keyOf,recId,baselineRecord,effectiveRecord,notes:()=>cloud.notes};
install();
})();
