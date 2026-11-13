/* 環保規費 Dashboard R1.2 - 純資料解析，無 Firebase 寫入及網路操作。*/
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.FeeImportR12=api;
})(typeof window!=='undefined'?window:(typeof globalThis!=='undefined'?globalThis:null),function(){
 'use strict';
 const SITES=['龍德','彰化','麥寮','台醋','新港'];
 const QUARTERS={'第一季':'Q1','第二季':'Q2','第三季':'Q3','第四季':'Q4','Q1':'Q1','Q2':'Q2','Q3':'Q3','Q4':'Q4'};
 const HALVES={'上半年':'上半年','下半年':'下半年'};
 const tidy=v=>String(v??'').trim().replace(/\s+/g,'');
 const header=v=>tidy(v).toLowerCase();
 function colName(c){let t='';for(let i=c+1;i>0;i=Math.floor((i-1)/26))t=String.fromCharCode(65+(i-1)%26)+t;return t;}
 function siteName(v){const t=tidy(v).replace(/[()（）]/g,'');return t==='台醋'?'台醋':t;}
 function money(v){
  if(v===null||v===undefined||String(v).trim()==='')return {kind:'blank'};
  if(typeof v==='number')return Number.isFinite(v)&&v>=0?{kind:'valid',amount:v}:{kind:'invalid'};
  const str=String(v).trim().replace(/,/g,'').replace(/，/g,'');
  if(/^#(?:REF!|DIV\/0!|VALUE!|NAME\?|N\/A|NUM!|NULL!)/i.test(str))return {kind:'error'};
  const matched=str.match(/^([+]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*(\[(?:註|注)\s*\d+\]|[（(](?:註|注)\s*\d+[）)])?$/);
  if(!matched)return {kind:'invalid'};
  const amount=Number(matched[1]);if(!Number.isFinite(amount)||amount<0)return {kind:'invalid'};
  return {kind:'valid',amount,annotation:matched[2]||''};
 }
 function detectSummary(grid){
  const row=grid?.[0]||[];
  return row.some(x=>/^20\d{2}年$/.test(tidy(x)))&&grid.slice(0,14).some(r=>String(r?.[0]||'').includes('土污費'))&&grid.slice(0,16).some(r=>String(r?.[0]||'').includes('水污費'));
 }
 function parseSummary(grid){
  if(!detectSummary(grid))throw new Error('沒有找到「年度橫向、空污／土污／水污分區」的彙總格式。');
  const years=[];
  (grid[0]||[]).forEach((cell,i)=>{const m=tidy(cell).match(/^(20\d{2})年$/);if(m)years.push({year:Number(m[1]),start:i});});
  years.forEach((y,i)=>y.end=i+1<years.length?years[i+1].start-1:y.start+4);
  if(new Set(years.map(x=>x.year)).size!==years.length)throw new Error('年份標題有重複，請先確認來源報表。');
  const sections=[];
  grid.slice(0,30).forEach((r,i)=>{const name=tidy(r?.[0]);if(/^空污費/.test(name))sections.push({type:'air',idx:i});else if(/^土污費/.test(name))sections.push({type:'soil',idx:i});else if(/^水污費/.test(name))sections.push({type:'water',idx:i});});
  if(['air','soil','water'].some(t=>sections.filter(x=>x.type===t).length!==1))throw new Error('來源表缺少或重複空污費、土污費、水污費區塊。');
  const air=sections.find(x=>x.type==='air').idx,soil=sections.find(x=>x.type==='soil').idx,water=sections.find(x=>x.type==='water').idx;
  if(!(air<soil&&soil<water))throw new Error('規費區塊順序不符合彙總報表。');
  const airSites=[],waterSites=[];
  for(let i=air;i<soil;i++){const s=siteName(grid[i]?.[1]);if(SITES.includes(s)&&!airSites.some(x=>x.site===s))airSites.push({site:s,row:i});}
  for(let i=water+1;i<grid.length;i++){
   const raw=tidy(grid[i]?.[1]);if(/合計|總額|註|說明/.test(raw)||tidy(grid[i]?.[0]).includes('環保規費申繳總額'))break;
   const s=siteName(raw);if(SITES.includes(s)&&!waterSites.some(x=>x.site===s))waterSites.push({site:s,row:i});
   if(i>=water+12)break;
  }
  if(airSites.length!==5||waterSites.length!==4||!grid[soil+1])throw new Error('報表的廠區明細區塊不完整，為避免漏資料已停止匯入。');
  const entries=[],skipped=[],structure=[];
  const periodRows={air:grid[air-1]||[],soil:grid[soil]||[],water:grid[water]||[]};
  function process(type,site,row,period,y,col){
   const cell=`${colName(col)}${row+1}`,v=grid[row]?.[col]??'',m=money(v);
   const common={year:y.year,type,site,period,cell,value:v};
   if(m.kind==='valid')entries.push({...common,amount:m.amount,sourceAnnotation:m.annotation||'',provided:{amount:true}});
   else skipped.push({...common,kind:m.kind==='blank'?'blank':'error',reason:m.kind==='blank'?'尚無資料':m.kind==='error'?'Excel 公式參照錯誤':'不合法金額'});
  }
  for(const y of years)for(const type of ['air','soil','water']){
   const row=periodRows[type],choices=type==='water'?HALVES:QUARTERS;
   const cols=[];
   for(let col=y.start;col<=y.end;col++){
    const period=choices[tidy(row[col])];if(period)cols.push({period,col});
   }
   const expected=type==='water'?['上半年','下半年']:['Q1','Q2','Q3','Q4'];
   for(const p of expected){if(cols.filter(x=>x.period===p).length!==1)structure.push(`${y.year} ${type} ${p}：找不到唯一期間標題`);}
   if(structure.length)continue;
   for(const {period,col} of cols){
    if(type==='air')for(const x of airSites)process(type,x.site,x.row,period,y,col);
    if(type==='soil')process(type,'全公司',soil+1,period,y,col);
    if(type==='water')for(const x of waterSites)process(type,x.site,x.row,period,y,col);
   }
  }
  if(structure.length)throw new Error('來源格式無法安全定位：'+structure.slice(0,5).join('；'));
  return {format:'彙總報表',sheet:'',entries,skipped,years:years.map(y=>y.year)};
 }
 function parseStandard(rawRows,knownTypes=[]){
  const entries=[],skipped=[];
  const known=Object.fromEntries(knownTypes.map(t=>[tidy(t.name),t.id]));
  rawRows.forEach((raw,i)=>{
   const norm={};Object.entries(raw).forEach(([k,v])=>norm[header(k)]=v);
   const pick=(...keys)=>{for(const k of keys)if(Object.prototype.hasOwnProperty.call(norm,header(k)))return {given:true,value:norm[header(k)]};return {given:false,value:''}};
   const year=pick('年度','年'),period=pick('期間','季度','申報期間'),fee=pick('規費類型','項目','類型'),site=pick('範圍／廠區','範圍/廠區','廠區','範圍'),val=pick('原始金額','金額','申報金額');
   const refund=pick('退費／扣抵','退費/扣抵','退費','扣抵'),status=pick('申報狀態','狀態'),note=pick('備註','備註／原因','原因');
   const rawFee=tidy(fee.value);const type=known[rawFee]||({'空污費':'air','土污費':'soil','水污費':'water'}[rawFee])||'';
   const amt=money(val.value),rf=refund.given&&String(refund.value??'').trim()!==''?money(refund.value):null;
   const p=String(period.value??'').trim();const periodName=QUARTERS[tidy(p)]||HALVES[tidy(p)]||p;
   const record={year:Number(year.value),period:periodName,type,site:siteName(site.value)||'全公司',amount:amt.amount,refund:rf?.amount,status:status.given&&String(status.value).trim()?String(status.value).trim():'已申報',note:String(note.value??'').trim(),sourceAnnotation:'',cell:`第 ${raw.__rowNum__!==undefined?raw.__rowNum__+1:i+2} 列`,provided:{amount:true,refund:rf?.kind==='valid',status:status.given&&!!String(status.value||'').trim(),note:note.given&&!!String(note.value||'').trim()}};
   if(Object.values(raw).every(v=>v===null||v===undefined||String(v).trim()===''))return;
   if(amt.kind==='blank'){
    skipped.push({...record,kind:'blank',reason:'來源金額空白，不覆寫既有資料'});
    return;
   }
   if(amt.kind!=='valid'||(rf&&rf.kind!=='valid')){skipped.push({...record,kind:'error',reason:'金額或退費不可辨識'});return;}
   entries.push(record);
  });
  return {format:'標準明細',entries,skipped,years:[...new Set(entries.map(x=>x.year))]};
 }
 function moneyLabel(v){return Number.isFinite(v)?v.toLocaleString('zh-TW',{maximumFractionDigits:12}):'';}
 return {SITES,colName,siteName,money,detectSummary,parseSummary,parseStandard,moneyLabel};
});
