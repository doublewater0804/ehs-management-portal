/* FLARE R0.7.5 – inline interference detail editing with per-record Firestore transaction.
   Shared Firestore document remains flare_control/global_state; this script never changes FLARE day counters. */
(() => {
  'use strict';
  const KEY='flare_r07_records_v1', MARK_KEY='flare_r07_migration_marks_v1';
  const BACKUP_PREFIX='flare_r07_raw_backup_';
  const AREA_FACTORIES={
    '麥寮廠':['ARO1廠','SM廠麥寮','PABS廠(麥寮)','PC廠'],
    '海豐廠':['ARO2廠','ARO3廠','SM廠海豐','合成酚廠','PP廠'],
    '醋酸廠':['HAC廠']
  };
  const AREAS=Object.keys(AREA_FACTORIES);
  const FACTORIES=Object.values(AREA_FACTORIES).flat();
  const aliases={
    'ARO1廠':['ARO1','ARO-1'], 'ARO2廠':['ARO2','ARO-2'],'ARO3廠':['ARO3','ARO-3'],
    'SM廠麥寮':['SM麥寮','SM廠(麥寮)'], 'SM廠海豐':['SM海豐','SM廠(海豐)'],
    'PABS廠(麥寮)':['PABS','PABS廠'], 'PC廠':['PC'],
    'HAC廠':['HAC','醋酸廠'], 'PP廠':['PP'], '合成酚廠':['PHL','PHL廠','合成酚']
  };
  const clean=v=>String(v??'').replace(/[\s　()（）\-_/]/g,'').toUpperCase();
  const html=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const stamp=()=>new Date().toISOString();
  const id=()=>typeof crypto!=='undefined' && crypto.randomUUID ? crypto.randomUUID() : `r07-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
  const areaOf=f=>AREAS.find(a=>AREA_FACTORIES[a].includes(f))||'';
  const normalizeFactory=v=>{
    const key=clean(v); if (!key) return '';
    for (const [factory,items] of Object.entries(aliases)) if ([factory,...items].some(x=>clean(x)===key)) return factory;
    return '';
  };
  const findFactoryInText=text=>{
    // Longest match first; prevent ARO1 accidentally matching ARO11.
    const items=Object.entries(aliases).flatMap(([canonical,alts])=>[canonical,...alts].map(alias=>({canonical,alias})));
    items.sort((a,b)=>b.alias.length-a.alias.length);
    for (const item of items) {
      const escaped=item.alias.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const suffix=/\d$/.test(item.alias)?'(?!\\d)':'';
      if (new RegExp(escaped+suffix,'i').test(String(text))) return item.canonical;
    }
    return '';
  };
  const isoDate=(v,yearHint)=>{
    if (v instanceof Date && Number.isFinite(v.getTime())) return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;
    const s=String(v??'').trim();
    const m=s.match(/(?:(\d{4})\s*[\/.-]\s*)?(\d{1,2})\s*(?:[\/.-]|月)\s*(\d{1,2})\s*日?/);
    if (!m) return '';
    const y=Number(m[1]||yearHint),mo=Number(m[2]),d=Number(m[3]);
    if (!(y>=2000 && y<=2100 && mo>=1 && mo<=12 && d>=1 && d<=31)) return '';
    const z=new Date(Date.UTC(y,mo-1,d));
    return z.getUTCFullYear()===y && z.getUTCMonth()+1===mo && z.getUTCDate()===d ? `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`:'';
  };
  const displayDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')?s.replace(/-/g,'/'):'待確認';
  const toAmount=v=>{
    if (v===null || v===undefined || String(v).trim()==='') return null;
    const n=Number(String(v).replace(/,/g,'').trim());
    return Number.isFinite(n) && n>=0 ? n : null;
  };
  const legacyAmount=text=>{
    const str=String(text||'');
    // Require an explicit volume unit to prevent reading days, dates and year as NM³.
    const m=str.match(/(?:干擾流量[：:\s]*)?([\d,]+(?:\.\d+)?)\s*(?:NM³|NM3|Nm3|立方公尺|m³|M3)/i);
    return m?toAmount(m[1]):null;
  };
  const fromStore=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback;}catch{return fallback;}};
  let records=fromStore(KEY,[]), marks=fromStore(MARK_KEY,{}), activeArea='', pendingImport=null, batchDrafts=[], activeDate=null;
  if (!Array.isArray(records)) records=[];
  if (!marks || typeof marks!=='object'||Array.isArray(marks)) marks={};
  let cloudReady=false, needsSave=false, initialized=false;
  let inlineEdit=null, inlineBusy=false;
  let selectedDiffs=new Set(),inspectedDiffs=new Set(),importBusy=false,historyRows=[],historyVisible=false;
  const selectedYear=()=>Number(document.getElementById('view-year')?.value||new Date().getFullYear());
  const saved=()=>{localStorage.setItem(KEY,JSON.stringify(records));localStorage.setItem(MARK_KEY,JSON.stringify(marks));};
  const push=()=>{
    saved();
    // A linked event reason may have been edited together with its R0.7 note.
    // Preserve that original event edit locally before cloud acknowledgement.
    const currentState = typeof window.__getFlareCloudState === 'function' ? window.__getFlareCloudState() : null;
    if(Array.isArray(currentState?.events)) localStorage.setItem('flare_events_final',JSON.stringify(currentState.events));
    if (cloudReady && typeof window.queueFlareCloudSave==='function') window.queueFlareCloudSave();
    else if (cloudReady && typeof queueFlareCloudSave==='function') queueFlareCloudSave();
    render(); updateAreaCounters(selectedYear());
  };
  // Fingerprints support migration idempotence and exact duplicate detection.
  const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(16);};
  const signature=r=>[r.kind,r.date,r.factory,r.amount===null?'':r.amount,String(r.content||'').replace(/\s+/g,' ').trim()].join('|');
  const normalizeRecord=r=>({
    id:String(r.id||id()), kind:r.kind==='interference'?'interference':'event',
    date:isoDate(r.date,Number(String(r.date||'').slice(0,4))||selectedYear())||'',
    factory:normalizeFactory(r.factory)||'', amount:r.kind==='interference'?toAmount(r.amount):null,
    content:String(r.content||''), source:String(r.source||'manual'),
    linkedEventId:String(r.linkedEventId||''), fingerprint:String(r.fingerprint||''),
    createdAt:String(r.createdAt||stamp()), year:Number(r.year)||(String(r.date||'').match(/^(\d{4})/)?.[1] ? Number(String(r.date).slice(0,4)):selectedYear()), needsReview:Boolean(r.needsReview)
  });
  records=records.map(normalizeRecord);
  const getState=()=>({records:records.map(r=>({...r})), migrationMarks:{...marks},version:1});
  const migrateLegacy=(legacyManual={},legacyInterference={})=>{
    let changed=false;
    const sourceGroups=[['event',legacyManual||{}],['interference',legacyInterference||{}]];
    sourceGroups.forEach(([kind,section])=>Object.entries(section).forEach(([y,raw])=>{
      const year=Number(y),text=String(raw||'').trim();if(!text||!Number.isInteger(year))return;
      const markKey=`${kind}:${year}`,fingerprint=hash(text);
      if (marks[markKey]===fingerprint)return;
      const backupKey=`${BACKUP_PREFIX}${year}_${kind}`;
      if(localStorage.getItem(backupKey)===null)localStorage.setItem(backupKey,text);
      const lines=text.replace(/\r/g,'').split('\n');
      // Each numbered or date-prefixed line starts a new item; continuation lines are retained.
      const blocks=[];let current=[];
      const startPattern=/^\s*(?:[（(]?\d{1,3}[）).、．\s]+)?(?:\d{4}[\/.-])?\d{1,2}\s*(?:[\/.-]|月)\s*\d{1,2}(?:\s*日)?(?:\b|[，,：:\s]|$)/;
      const numericPattern=/^\s*(?:\d{1,3})[.、．)）]\s*\S/;
      for(const line of lines){
        const beginning=startPattern.test(line)||numericPattern.test(line);
        if(beginning&&current.length){blocks.push(current.join('\n').trim());current=[];}
        current.push(line);
      }
      if(current.length)blocks.push(current.join('\n').trim());
      const meaningful=blocks.filter(x=>x&& !/^[\s=—─\-]+$/.test(x));
      const prior=new Set(records.filter(r=>r.source==='legacy'&&r.kind===kind).map(r=>r.fingerprint));
      meaningful.forEach((block,index)=>{
        const sig=`${kind}|${year}|${fingerprint}|${index}`;
        if(prior.has(sig))return;
        const date=isoDate(block,year),factory=findFactoryInText(block);
        const amount=kind==='interference'?legacyAmount(block):null;
        records.push(normalizeRecord({id:`legacy-${hash(sig)}`,kind,year,date,factory,amount,content:block,source:'legacy',fingerprint:sig,needsReview:!date||(kind==='interference'&&(!factory||amount===null))}));
        changed=true;
      });
      marks[markKey]=fingerprint;changed=true;
    }));
    if(changed){saved();needsSave=true;}
    return changed;
  };
  const applyCloud=(r07,legacyManual={},legacyInterference={})=>{
    // Firestore snapshots can arrive while a local inline form is open.
    // Capture the unsaved draft before the list is reconstructed.
    captureInlineDraft();
    cloudReady=false;
    // Cloud is authoritative; never copy stale local R0.7 rows over a new cloud snapshot.
    records=Array.isArray(r07?.records)?r07.records.map(normalizeRecord):[];
    marks=(r07?.migrationMarks&&typeof r07.migrationMarks==='object')?{...r07.migrationMarks}:{};
    needsSave=false;
    migrateLegacy(legacyManual,legacyInterference);
    saved();
    render();updateAreaCounters(selectedYear());
  };
  const onCloudReady=()=>{
    cloudReady=true;
    if(!needsSave)return;
    const migrateWriteWhenReady=(attempt=0)=>setTimeout(()=>{
      if(!needsSave)return;
      if(window.__flareCloudHydrated===true){
        needsSave=false;
        if(typeof queueFlareCloudSave==='function')queueFlareCloudSave();
      }else if(attempt<20) migrateWriteWhenReady(attempt+1);
      else console.warn('R0.7 歷史備註已在本機保留，但雲端未就緒；重新登入後再同步。');
    },500);
    migrateWriteWhenReady();
  };
  const clearAll=()=>{records=[];marks={};saved();render();updateAreaCounters(selectedYear());};
  const upsertLinkedEvent=ev=>{
    const eventId=String(ev.id||''),text=String(ev.reason||'').trim();
    if(!eventId||!text)return;
    const found=records.find(r=>r.kind==='event'&&r.linkedEventId===eventId);
    if(found){Object.assign(found,{date:ev.date,factory:ev.factory,content:`${ev.factory}｜${text}`});}
    else records.push(normalizeRecord({kind:'event',date:ev.date,factory:ev.factory,content:`${ev.factory}｜${text}`,source:'event',linkedEventId:eventId}));
  };
  const addLinkedEvent=ev=>{upsertLinkedEvent(ev);saved();};
  const syncLinkedChanges=(beforeEvents,afterEvents)=>{
    const afterMap=new Map(afterEvents.filter(e=>e.source==='manual').map(e=>[String(e.id),e]));
    const priorIds=new Set(beforeEvents.filter(e=>e.source==='manual').map(e=>String(e.id)));
    const deleted=[...priorIds].filter(k=>!afterMap.has(k));
    for(const key of deleted){
      const idx=records.findIndex(r=>r.kind==='event'&&r.linkedEventId===key);
      if(idx>=0){
        if(confirm('此排放紀錄有關聯的使用原因備註。是否一併刪除？\n「取消」將保留備註，僅解除關聯。')) records.splice(idx,1);
        else records[idx]={...records[idx],linkedEventId:'',source:'manual'};
      }
    }
    for(const ev of afterMap.values()) if(priorIds.has(String(ev.id)) && ev.reason) upsertLinkedEvent(ev);
    saved();return getState();
  };
  const yearRows=(year,kind)=>records.filter(r=>r.kind===kind&&Number(r.year)===Number(year));
  const newestFirst=(a,b)=>(b.date||'').localeCompare(a.date||'')||(b.createdAt||'').localeCompare(a.createdAt||'');
  // Unknown dates remain under the original year stored as a field on legacy rows.
  const groupRows=(year,areaFilter='')=>{
    const map=new Map();
    yearRows(year,'interference').filter(r=>!areaFilter||areaOf(r.factory)===areaFilter).forEach(r=>{
      const key=`${r.date}|${r.factory||'?'}`;
      if(!map.has(key))map.set(key,{date:r.date,factory:r.factory,area:areaOf(r.factory),entries:[],amount:0});
      const row=map.get(key);row.entries.push(r);if(r.amount!==null)row.amount+=r.amount;
    });
    return [...map.values()].sort((a,b)=>b.date.localeCompare(a.date)||(AREAS.indexOf(a.area)-AREAS.indexOf(b.area))||a.factory.localeCompare(b.factory,'zh-TW'));
  };
  const countAreaDays=(year)=>{
    const sets=Object.fromEntries(AREAS.map(a=>[a,new Set()]));
    const daily=new Map();
    yearRows(year,'interference').forEach(r=>{
      if(!r.date||!r.factory||r.amount===null)return;
      const area=areaOf(r.factory);if(!area)return;
      const key=`${area}|${r.date}`;daily.set(key,(daily.get(key)||0)+r.amount);
    });
    daily.forEach((amount,key)=>{if(amount>0){const [area,date]=key.split('|');sets[area].add(date);}});
    return Object.fromEntries(AREAS.map(a=>[a,sets[a].size]));
  };
  const updateAreaCounters=(year)=>{
    const days=countAreaDays(year);
    Object.entries({'麥寮廠':'mai-liao','海豐廠':'hai-feng','醋酸廠':'hac'}).forEach(([area,suffix])=>{
      const el=document.getElementById(`r07-interference-days-${suffix}`);
      if(el)el.textContent=String(days[area]);
    });
  };
  const validateMutation=()=>{
    if(!cloudReady || window.__flareCloudHydrated!==true){alert('尚未完成 Firebase 雲端同步，為避免資料覆蓋，請等顯示已同步雲端再操作。');return false;}
    return true;
  };
  const csvCell=v=>`"${String(v??'').replace(/^[=+\-@\t\r]/,"'$&").replace(/"/g,'""')}"`;
  const exportCSV=(kind)=>{
    const year=selectedYear(),headers=kind==='interference'?['項目','日期','廠區','工廠','干擾流量(NM³)','內容']:['項目','日期','內容'];
    const rows=kind==='interference'?
      groupRows(year,activeArea).map((g,i)=>[i+1,displayDate(g.date),g.area,g.factory,g.entries.every(r=>r.amount===null)?'':g.amount,g.entries.map(r=>r.content).filter(Boolean).join('；')]):
      yearRows(year,'event').sort(newestFirst).map((r,i)=>[i+1,displayDate(r.date),r.content]);
    const csv='\uFEFF'+[headers,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=`FLARE_R0.7.5_${kind==='event'?'使用事件及原因':'干擾流量'}_${year}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
  };
  const rowButton=(action,row,label)=>`<button type="button" class="r07-action" data-r07-action="${action}" data-r07-id="${html(row.id)}">${label}</button>`;
  const inlineForm=()=>document.getElementById('r075-inline-form');
  const captureInlineDraft=()=>{
    if(!inlineEdit)return;
    const el=inlineForm();if(!el||el.dataset.r075Id!==inlineEdit.id)return;
    inlineEdit.draft={
      date:el.querySelector('[name="r075-date"]')?.value??inlineEdit.draft.date,
      factory:el.querySelector('[name="r075-factory"]')?.value??inlineEdit.draft.factory,
      amount:el.querySelector('[name="r075-amount"]')?.value??inlineEdit.draft.amount,
      content:el.querySelector('[name="r075-content"]')?.value??inlineEdit.draft.content
    };
  };
  const draftChanged=()=>{
    if(!inlineEdit)return false;
    captureInlineDraft();
    const d=inlineEdit.draft,old=inlineEdit.original;
    return d.date!==old.date||d.factory!==old.factory||String(d.amount)!==String(old.amount??'')||d.content!==old.content;
  };
  const leaveInline=()=>{
    if(!inlineEdit)return true;
    if(inlineBusy){alert('這筆紀錄正在儲存雲端，請等待交易完成。');return false;}
    if(draftChanged()&&!confirm('這筆紀錄尚未儲存，確定放棄目前修改？'))return false;
    inlineEdit=null;
    return true;
  };
  const factoryOptions=chosen=>`<option value="">請選擇工廠…</option>${AREAS.map(area=>`<optgroup label="${html(area)}">${AREA_FACTORIES[area].map(f=>`<option value="${html(f)}" ${chosen===f?'selected':''}>${html(f)}</option>`).join('')}</optgroup>`).join('')}`;
  const inlineMarkup=(r,index)=>{
    const d=inlineEdit.draft;
    return `<tr class="r075-row-editing" data-r075-editing="${html(r.id)}"><td colspan="6"><form id="r075-inline-form" data-r075-id="${html(r.id)}" class="r075-inline-form"><div class="r075-inline-heading"><strong>項目 ${index+1}－原位編輯</strong><span class="r075-chip">編輯中</span></div><div class="r075-inline-fields"><label>日期（必填）<input name="r075-date" type="date" value="${html(d.date)}" required ${inlineBusy?'disabled':''}></label><label>工廠（必選）<select name="r075-factory" required ${inlineBusy?'disabled':''}>${factoryOptions(d.factory)}</select><small>廠區自動帶入：<strong data-r075-area>${html(areaOf(d.factory)||'請選擇工廠')}</strong></small></label><label>干擾流量 (NM³)<input name="r075-amount" type="number" min="0" step="any" value="${html(d.amount)}" required ${inlineBusy?'disabled':''}></label><label class="r075-content-field">內容（必填）<textarea name="r075-content" rows="3" maxlength="6000" required ${inlineBusy?'disabled':''}>${html(d.content)}</textarea></label></div><div class="r075-inline-actions"><button type="button" class="r07-btn" data-r075-cancel ${inlineBusy?'disabled':''}>取消</button><button type="submit" class="r07-btn primary" ${inlineBusy?'disabled':''}>${inlineBusy?'儲存中…':'儲存修改'}</button></div></form></td></tr>`;
  };
  const startInlineEdit=row=>{
    if(!row||row.kind!=='interference'||!validateMutation()||!leaveInline())return;
    batchForm()?.classList.add('hidden');form()?.classList.add('hidden');
    activeDate=row.date;
    inlineEdit={id:row.id,url:location.href,original:{...row},draft:{date:row.date,factory:row.factory,amount:row.amount??'',content:row.content},year:selectedYear()};
    render();
    document.getElementById('r075-inline-form')?.scrollIntoView({behavior:'smooth',block:'nearest'});
  };
  const cancelInline=()=>{if(inlineBusy)return;inlineEdit=null;render();};
  const saveInline=async ev=>{
    ev.preventDefault();
    if(!inlineEdit||inlineBusy||!validateMutation())return;
    captureInlineDraft();
    const current=inlineEdit;
    const d=current.draft,date=isoDate(d.date,selectedYear()),factory=normalizeFactory(d.factory),amount=toAmount(d.amount),content=String(d.content||'').trim();
    if(!date||Number(date.slice(0,4))!==current.year||current.year!==selectedYear())return alert('日期必須符合目前選取年度。');
    if(!factory)return alert('請選擇有效工廠。');
    if(amount===null)return alert('干擾流量必須是 0 或正數。');
    if(!content)return alert('內容不可空白。');
    if(typeof window.__flareR075Update!=='function')return alert('Firebase 交易更新元件尚未就緒，未修改資料。');
    // Only update the selected record ID, and never queue a full-document overwrite.
    // Cloud transaction compares original record fields before changing anything.
    inlineBusy=true;render();showMessage('正在檢查 Firebase 最新版本並儲存此筆紀錄…');
    try{
      const updated=await window.__flareR075Update(current.id,current.original,{date,factory,amount,content,year:current.year,needsReview:false});
      const local=records.find(r=>r.id===current.id);
      if(local)Object.assign(local,updated);
      saved();
      inlineEdit=null;activeDate=date;
      render();updateAreaCounters(selectedYear());
      showMessage(`Firebase 已確認儲存成功：${displayDate(date)} ${factory}。`);
      document.querySelector(`#r07-results [data-r07-date="${date}"]`)?.scrollIntoView({behavior:'smooth',block:'nearest'});
    }catch(error){
      showMessage(`原位編輯未確認成功：${error.message}。請先檢查雲端狀態，勿重複儲存。`);
      alert(`儲存未完成或發生版本衝突：${error.message}\n請確認雲端現況後再操作。`);
    }finally{inlineBusy=false;render();}
  };
  const showMessage=text=>{const el=document.getElementById('r07-message');if(el)el.textContent=text;};
  const render=()=>{
    captureInlineDraft();
    const root=document.getElementById('r07-workspace');if(!root)return;
    const kind=root.dataset.kind,year=selectedYear();
    root.querySelector('[data-r07-year]').textContent=String(year);
    const body=root.querySelector('#r07-results');if(!body)return;
    if(kind==='event'){
      const list=yearRows(year,kind).sort(newestFirst);
      body.innerHTML=`<div class="r07-scroll"><table class="r07-table"><thead><tr><th>項目</th><th>日期</th><th>內容</th><th>操作</th></tr></thead><tbody>${list.map((r,i)=>`<tr><td>${i+1}</td><td>${displayDate(r.date)}</td><td class="r07-content">${html(r.content)} ${r.needsReview?'<span class="r07-warn">待確認</span>':''}</td><td>${rowButton('edit',r,'編輯')} ${rowButton('delete',r,'刪除')}</td></tr>`).join('')||'<tr><td colspan="4">本年度尚無紀錄</td></tr>'}</tbody></table></div>`;
      root.querySelector('[data-r07-count]').textContent=`${list.length} 筆紀錄`;
    } else {
      const groups=groupRows(year,activeArea);
      const valid=yearRows(year,'interference').filter(r=>r.date&&r.factory&&r.amount!==null&&(!activeArea||areaOf(r.factory)===activeArea));
      const sum=valid.reduce((a,r)=>a+r.amount,0);
      const days=new Set(valid.filter(r=>r.amount>0).map(r=>r.date)).size;
      root.querySelector('[data-r07-count]').textContent=`流量合計 ${sum.toLocaleString('zh-TW')} NM³｜有流量日期 ${days} 日｜${groups.length} 筆工廠彙整`;
      const dates=[...new Set(groups.map(g=>g.date))].sort((a,b)=>b.localeCompare(a));
      let sequence=0;
      // R0.7.3: one detail/edit control and one delete control per date.
      // The detail is rendered directly under its date, not in a duplicate panel above the list.
      if(activeDate!==null&&!dates.includes(activeDate))activeDate=null;
      body.innerHTML=dates.map(date=>{
        const subs=groups.filter(g=>g.date===date);
        const daily=subs.reduce((a,g)=>a+g.amount,0);
        const expanded=activeDate===date;
        const allDayRows=yearRows(year,'interference').filter(r=>r.date===date).sort((a,b)=>
          (AREAS.indexOf(areaOf(a.factory))-AREAS.indexOf(areaOf(b.factory)))||
          a.factory.localeCompare(b.factory,'zh-TW')||(a.createdAt||'').localeCompare(b.createdAt||''));
        const canDelete=/^\d{4}-\d{2}-\d{2}$/.test(date);
        return `<section class="r07-date ${expanded?'r07-date-editing':''}" data-r07-date="${html(date)}"><div class="r07-date-heading"><strong>${displayDate(date)}${expanded?'<span class="r07-edit-indicator">編輯中</span>':''}</strong><div class="r07-date-controls"><span>當日合計：${daily.toLocaleString('zh-TW')} NM³</span><button type="button" class="r07-action" data-r07-date-details="${html(date)}" aria-expanded="${expanded}">${expanded?'收合明細':'明細／編輯'}</button><button type="button" class="r07-action r07-danger" data-r07-delete-date="${html(date)}" ${canDelete?'':'disabled title="日期未確認，請先修正日期"'}>刪除當日</button></div></div><div class="r07-scroll"><table class="r07-table"><thead><tr><th>項目</th><th>廠區</th><th>工廠</th><th>流量 (NM³)</th><th>內容</th></tr></thead><tbody>${subs.map(g=>`<tr><td>${++sequence}</td><td>${html(g.area)||'<span class="r07-warn">待確認</span>'}</td><td>${html(g.factory)||'<span class="r07-warn">待確認</span>'}</td><td>${g.entries.every(r=>r.amount===null)?'待確認':g.amount.toLocaleString('zh-TW')}</td><td class="r07-content">${g.entries.map(r=>html(r.content)).filter(Boolean).join('<div class="r07-content-line"></div>')||'—'}</td></tr>`).join('')}</tbody></table></div>${expanded?`<div class="r07-day-detail"><strong>${displayDate(date)}｜當日全部廠區原始明細（${allDayRows.length} 筆）</strong><p>可逐筆編輯／刪除；與上方彙整列不同，這裡保留每筆來源紀錄。</p><div class="r07-scroll"><table class="r07-table"><thead><tr><th>項目</th><th>廠區</th><th>工廠</th><th>流量 (NM³)</th><th>內容</th><th>操作</th></tr></thead><tbody>${allDayRows.map((r,i)=>inlineEdit?.id===r.id?inlineMarkup(r,i):`<tr><td>${i+1}</td><td>${html(areaOf(r.factory))||'<span class="r07-warn">待確認</span>'}</td><td>${html(r.factory)||'<span class="r07-warn">待確認</span>'}</td><td>${r.amount===null?'待確認':r.amount.toLocaleString('zh-TW')}</td><td class="r07-content">${html(r.content)}</td><td>${rowButton('edit',r,'編輯')} ${rowButton('delete',r,'刪除')}</td></tr>`).join('')}</tbody></table></div></div>`:''}</section>`;
      }).join('')||'<p class="r07-empty">本年度尚無干擾流量紀錄。</p>';
      root.querySelector('#r07-area-filter').value=activeArea;
    }
    const pending=yearRows(year,kind).filter(r=>r.needsReview).length;
    const warning=root.querySelector('#r07-review-warning');
    if(warning){warning.textContent=pending?`歷史資料有 ${pending} 筆需要人工確認日期／工廠／流量；未確認數值不納入流量統計。原始文字已備份。`:'歷史備註原文已保留，轉換後可逐筆編輯。';}
  };
  const form=()=>document.getElementById('r07-editor');
  const showForm=(record=null)=>{
    if(!leaveInline())return;
    const root=form();if(!root)return;
    batchForm()?.classList.add('hidden');
    const kind=document.getElementById('r07-workspace')?.dataset.kind;
    if(kind==='interference'&&record?.date){activeDate=record.date;render();}
    root.classList.remove('hidden');root.dataset.id=record?.id||'';
    root.querySelector('[name="r07-date"]').value=record?.date||'';
    root.querySelector('[name="r07-factory"]').value=record?.factory||'';
    root.querySelector('[name="r07-amount"]').value=record?.amount??'';
    root.querySelector('[name="r07-content"]').value=record?.content||'';
    root.querySelector('[data-r07-form-title]').textContent=record?'修改紀錄':'新增紀錄';
    root.querySelector('.r07-factory-field').classList.toggle('hidden',kind!=='interference');
    root.querySelector('.r07-amount-field').classList.toggle('hidden',kind!=='interference');
    root.scrollIntoView({behavior:'smooth',block:'nearest'});
  };
  const batchForm=()=>document.getElementById('r07-batch-editor');
  const newBatchDraft=()=>({key:id(),factory:'',amount:'',content:''});
  const readBatchDrafts=()=>{
    const root=batchForm();if(!root)return batchDrafts;
    return [...root.querySelectorAll('[data-r07-batch-row]')].map(row=>({
      key:row.dataset.r07BatchRow,
      factory:normalizeFactory(row.querySelector('[data-r07-batch-field="factory"]')?.value)||'',
      amount:row.querySelector('[data-r07-batch-field="amount"]')?.value??'',
      content:row.querySelector('[data-r07-batch-field="content"]')?.value??''
    }));
  };
  const renderBatchRows=()=>{
    const root=batchForm(),host=root?.querySelector('#r07-batch-items');if(!root||!host)return;
    host.innerHTML=batchDrafts.map((draft,index)=>{
      const options=AREAS.map(area=>`<optgroup label="${html(area)}">${AREA_FACTORIES[area].map(factory=>`<option value="${html(factory)}" ${draft.factory===factory?'selected':''}>${html(factory)}</option>`).join('')}</optgroup>`).join('');
      return `<section class="r07-batch-card" data-r07-batch-row="${html(draft.key)}"><div class="r07-batch-card-head"><strong>第 ${index+1} 筆廠處紀錄</strong>${batchDrafts.length>1?`<button type="button" class="r07-action" data-r07-batch-remove="${html(draft.key)}">移除此筆</button>`:''}</div><div class="r07-batch-fields"><label>工廠（必選）<select data-r07-batch-field="factory" required><option value="">請選擇工廠…</option>${options}</select><small>廠區自動帶入：<strong data-r07-batch-area>${html(areaOf(draft.factory)||'請先選擇工廠')}</strong></small></label><label>干擾流量（NM³）<input data-r07-batch-field="amount" type="number" step="any" min="0" required value="${html(draft.amount)}" placeholder="0 或正數"></label><label class="r07-batch-content">內容（必填）<textarea data-r07-batch-field="content" rows="2" maxlength="6000" required>${html(draft.content)}</textarea></label></div></section>`;
    }).join('');
    root.querySelector('[data-r07-batch-count]').textContent=`共 ${batchDrafts.length} 筆廠處紀錄`;
  };
  const showBatchForm=()=>{
    if(!leaveInline())return;
    const single=form(),root=batchForm();if(!root)return;
    single?.classList.add('hidden');if(single)single.dataset.id='';
    root.classList.remove('hidden');
    root.querySelector('[name="r07-batch-date"]').value='';
    batchDrafts=[newBatchDraft()];renderBatchRows();
    root.scrollIntoView({behavior:'smooth',block:'nearest'});
  };
  const prepareBatchRecords=(dateValue,drafts,year=selectedYear())=>{
    const date=isoDate(dateValue,year);
    if(!date||Number(date.slice(0,4))!==Number(year))throw new Error('日期必須符合目前選取的年度。');
    if(!Array.isArray(drafts)||!drafts.length)throw new Error('請至少新增一筆廠處紀錄。');
    return drafts.map((draft,index)=>{
      const factory=normalizeFactory(draft.factory),amount=toAmount(draft.amount),content=String(draft.content||'').trim();
      if(!factory)throw new Error(`第 ${index+1} 筆：請選擇有效工廠。`);
      if(amount===null)throw new Error(`第 ${index+1} 筆：干擾流量需輸入 0 或正數。`);
      if(!content)throw new Error(`第 ${index+1} 筆：內容不可空白。`);
      return normalizeRecord({kind:'interference',date,factory,amount,content,source:'manual'});
    });
  };
  const saveBatchForm=ev=>{
    ev.preventDefault();if(!validateMutation())return;
    const root=batchForm(),submit=root.querySelector('button[type="submit"]');
    if(submit.disabled)return;
    let prepared;
    try{prepared=prepareBatchRecords(root.querySelector('[name="r07-batch-date"]').value,readBatchDrafts(),selectedYear());}
    catch(error){alert(error.message);return;}
    // Validate every row first, then append all rows and queue exactly one cloud save.
    submit.disabled=true;
    try{
      records.push(...prepared);
      root.classList.add('hidden');batchDrafts=[];
      push();showMessage(`已新增 ${prepared.length} 筆廠處干擾流量紀錄，正在同步 Firebase。`);
    }finally{submit.disabled=false;}
  };
  const saveForm=ev=>{
    ev.preventDefault();if(!validateMutation())return;
    const root=form(),rid=root.dataset.id,kind=document.getElementById('r07-workspace').dataset.kind;
    const date=isoDate(root.querySelector('[name="r07-date"]').value,selectedYear());
    const factory=kind==='interference'?normalizeFactory(root.querySelector('[name="r07-factory"]').value):'';
    const amount=kind==='interference'?toAmount(root.querySelector('[name="r07-amount"]').value):null;
    const content=root.querySelector('[name="r07-content"]').value.trim();
    if(!date||Number(date.slice(0,4))!==selectedYear())return alert('日期必須符合目前選取的年度。');
    if(kind==='interference'&&!factory)return alert('請選擇有效工廠。');
    if(kind==='interference'&&amount===null)return alert('干擾流量需輸入 0 或正數。');
    if(!content)return alert('內容不可空白。');
    const target=records.find(r=>r.id===rid);
    if(target&&target.linkedEventId){
      if(date !== target.date) return alert('此紀錄與人工排放事件關聯，不能只從備註畫面修改事件日期；請維持原日期。');
      if(!confirm('這筆說明與人工排放紀錄關聯。修改會同步更新原排放紀錄的使用原因，確定修改？'))return;
      const state=typeof window.__getFlareCloudState==='function'?window.__getFlareCloudState():null;
      const linked=state?.events?.find(e=>String(e.id)===target.linkedEventId);
      if(linked){linked.reason=content.replace(/^.*?｜/,'');if(kind==='event')linked.date=date;}
    }
    if(target){Object.assign(target,{date,factory:kind==='event'?target.factory:factory,amount,content,needsReview:false});}
    else records.push(normalizeRecord({kind,date,factory,amount,content,source:'manual'}));
    root.classList.add('hidden');root.dataset.id='';activeDate=null;push();showMessage('紀錄已更新，正在同步 Firebase。');
  };
  const deleteRow=rid=>{
    if(!validateMutation()||!leaveInline())return;
    const row=records.find(r=>r.id===rid);if(!row)return;
    if(!confirm('確定永久刪除此筆紀錄？此操作會同步雲端。'))return;
    if(row.linkedEventId){
      const state=typeof window.__getFlareCloudState==='function'?window.__getFlareCloudState():null;
      const linked=state?.events?.find(e=>String(e.id)===row.linkedEventId);
      if(linked && !confirm('這是人工排放紀錄的關聯備註。刪除將清除其「使用原因」，排放紀錄本身保留。確定繼續？'))return;
      if(linked) linked.reason='';
    }
    records=records.filter(r=>r.id!==rid);push();
  };
  const toggleDateDetails=date=>{
    if(!leaveInline())return;
    activeDate=activeDate===date?null:date;
    form()?.classList.add('hidden');
    render();
    document.querySelector('#r07-results .r07-date-editing')?.scrollIntoView({behavior:'smooth',block:'nearest'});
  };
  const deleteDay=date=>{
    if(!validateMutation()||!leaveInline())return;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number(date.slice(0,4))!==selectedYear()){
      alert('日期不正確，請先確認日期後再刪除。');return;
    }
    // Delete the whole date, including rows from other areas while a filter is active.
    const targets=yearRows(selectedYear(),'interference').filter(r=>r.date===date);
    if(!targets.length)return;
    const areas=[...new Set(targets.map(r=>areaOf(r.factory)).filter(Boolean))];
    const factories=new Set(targets.map(r=>r.factory).filter(Boolean));
    const volume=targets.reduce((sum,r)=>sum+(r.amount??0),0);
    const info=`${displayDate(date)}\n廠區：${areas.join('、')||'待確認'}\n工廠：${factories.size} 個\n原始紀錄：${targets.length} 筆\n當日流量合計：${volume.toLocaleString('zh-TW')} NM³`;
    if(!confirm(`${info}\n\n將刪除此日期「全部廠區」的干擾流量紀錄（包含待確認原始資料），確定繼續？`))return;
    if(!confirm(`再次確認：永久刪除 ${displayDate(date)} 當日全部 ${targets.length} 筆干擾流量？\n此操作將同步 Firebase，且不影響原 FLARE 使用事件日數。`))return;
    try{
      localStorage.setItem(`flare_r073_deleted_day_backup_${date}_${Date.now()}`,JSON.stringify(targets));
    }catch(error){alert('本機備份失敗，已取消刪除以保護原始資料。');return;}
    const remove=new Set(targets.map(r=>r.id));
    records=records.filter(r=>!remove.has(r.id));
    activeDate=null;form()?.classList.add('hidden');batchForm()?.classList.add('hidden');
    push();showMessage(`已刪除 ${displayDate(date)} 當日 ${targets.length} 筆干擾流量，原始資料已先備份於本機，正在同步 Firebase。`);
  };
  const parseCSV=(text)=>{
    text=String(text).replace(/^\uFEFF/,'');
    const rows=[];let row=[],value='',quoted=false;
    for(let i=0;i<text.length;i++){
      const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
      else if(c===','&&!quoted){row.push(value);value='';}
      else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);if(row.some(x=>x!==''))rows.push(row);row=[];value='';}
      else value+=c;
    }
    row.push(value);if(row.some(x=>x!==''))rows.push(row);return rows;
  };
  const parseImportRows=matrix=>{
    if(!Array.isArray(matrix)||matrix.length<2)throw Error('檔案必須含標題及資料列。');
    const head=matrix[0].map(x=>clean(x));
    const column=(terms)=>head.findIndex(x=>terms.some(t=>x===clean(t)));
    const d=column(['日期','date']),f=column(['工廠','factory']),v=column(['干擾流量NM³','干擾流量NM3','干擾流量','流量NM3','流量']),c=column(['內容','原因','備註']);
    if([d,f,v,c].some(x=>x<0))throw Error('缺少「日期、工廠、干擾流量（NM³）、內容」欄位。');
    const items=[],messages=[],errors=[];
    matrix.slice(1).forEach((cells,index)=>{
      const yy=selectedYear(),date=isoDate(cells[d],yy),factory=normalizeFactory(cells[f]),amount=toAmount(cells[v]),content=String(cells[c]||'').trim();
      if(!date||Number(date.slice(0,4))!==yy||!factory||amount===null||!content){const error=`第 ${index+2} 列：日期／工廠／流量／內容不正確，已略過。`;messages.push(error);errors.push(error);return;}
      items.push({kind:'interference',date,factory,amount,content,source:'import'});
    });
    const uniques=[],seen=new Set();
    items.forEach(row=>{const sig=signature(row);if(!seen.has(sig)){seen.add(sig);uniques.push(row);}else messages.push('檔案內有完全重複紀錄，已忽略一筆。');});
    return {items:uniques,messages,errors};
  };
  // An import is a date+factory GROUP operation; the original rows are never
  // implicitly merged away by preview, and unselected groups are untouched.
  const r074Key=r=>`${r.date}|${normalizeFactory(r.factory)}`;
  const normalizedText=v=>String(v??'').replace(/\r\n?/g,'\n').trim();
  const groupText=rows=>rows.map(r=>normalizedText(r.content)).filter(Boolean).join('；');
  const groupAmount=rows=>rows.every(r=>toAmount(r.amount)===null)?null:rows.reduce((sum,r)=>sum+(toAmount(r.amount)??0),0);
  const equalAmount=(a,b)=>(a===null&&b===null)||(a!==null&&b!==null&&Math.abs(a-b)<0.0000001);
  // Including stable ID and metadata detects later edits, additions and deletions.
  const stableRows=rows=>JSON.stringify((rows||[]).map(r=>Object.keys(r).sort().map(k=>[k,r[k]]))
    .sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
  const groupOf=(all,key)=>all.filter(r=>r.kind==='interference'&&r074Key(r)===key);
  const compareGroups=(imports,serverRecords)=>{
    const incoming=new Map(),output=[];
    imports.forEach(row=>{
      const key=r074Key(row);
      if(!incoming.has(key))incoming.set(key,[]);
      incoming.get(key).push(row);
    });
    for(const [key,rows] of incoming){
      const existing=groupOf(serverRecords,key),beforeAmount=groupAmount(existing),afterAmount=groupAmount(rows);
      const beforeText=groupText(existing),afterText=groupText(rows);
      const same=existing.length&&equalAmount(beforeAmount,afterAmount)&&beforeText===afterText;
      const status=!existing.length?'new':same?'same':existing.length>1?'special':'changed';
      output.push({key,date:rows[0].date,factory:rows[0].factory,area:areaOf(rows[0].factory),
        rows,existing,beforeAmount,afterAmount,beforeText,afterText,status,
        baseline:stableRows(existing),amountChanged:!equalAmount(beforeAmount,afterAmount),contentChanged:beforeText!==afterText});
    }
    return output.sort((a,b)=>b.date.localeCompare(a.date)||a.factory.localeCompare(b.factory,'zh-TW'));
  };
  const importSelection=()=>pendingImport?.diffs.filter(d=>selectedDiffs.has(d.key)&&d.status!=='same')||[];
  const importPanel=()=>document.getElementById('r07-import-preview');
  const renderImportPreview=()=>{
    const host=importPanel();if(!host)return;
    if(!pendingImport){host.textContent='尚未選擇匯入檔案。';return;}
    const diffs=pendingImport.diffs;
    const count=k=>diffs.filter(d=>d.status===k).length;
    const labels={new:'新增',changed:'有差異',same:'相同',special:'特殊差異'};
    host.innerHTML=`<div class="r074-summary"><strong>檔案：${html(pendingImport.fileName)}</strong><p>有效 ${pendingImport.rawCount} 筆｜新增 ${count('new')} 組｜有差異 ${count('changed')} 組｜相同 ${count('same')} 組｜特殊差異 ${count('special')} 組</p><p class="r074-note">預設全部保留；只提交有勾選的日期＋工廠組。相同資料不重複寫入，CSV 未包含的舊資料不會刪除。</p></div>
      <div class="r07-tools"><button type="button" class="r07-btn" id="r074-select-all">全選可覆蓋項目</button><button type="button" class="r07-btn" id="r074-select-none">全部保留</button><span id="r074-selected-count">已選 ${selectedDiffs.size} 組</span></div>
      <div class="r07-scroll"><table class="r07-table r074-diff-table"><thead><tr><th>確認覆蓋</th><th>狀態</th><th>日期／工廠</th><th>比對欄位</th><th>Firebase 現有值</th><th>CSV 匯入值</th></tr></thead><tbody>${diffs.map(d=>{
        const isSpecial=d.status==='special',allowed=!isSpecial||inspectedDiffs.has(d.key);
        const statusClass=d.status==='special'?'r074-special':d.status==='changed'?'r074-changed':d.status==='new'?'r074-new':'r074-same';
        const beforeAmount=d.existing.length?(d.beforeAmount===null?'待確認':String(d.beforeAmount)):'無紀錄';
        const afterAmount=String(d.afterAmount??'待確認');
        const showDetails=isSpecial||d.rows.length>1;
        return `<tr class="${statusClass}"><td>${d.status==='same'?'—':`<input type="checkbox" data-r074-check="${html(d.key)}" ${selectedDiffs.has(d.key)?'checked':''} ${allowed?'':'disabled title="請先展開原始明細"'} aria-label="覆蓋 ${html(d.date)} ${html(d.factory)}">`}</td><td>${labels[d.status]}</td><td>${displayDate(d.date)}<br>${html(d.area)}｜${html(d.factory)}${showDetails?`<br><button class="r07-action" type="button" data-r074-inspect="${html(d.key)}">${inspectedDiffs.has(d.key)?'收合明細':'展開原始明細'}</button>`:''}${isSpecial&&!inspectedDiffs.has(d.key)?'<br><small class="r07-warn">須先檢視全部舊紀錄</small>':''}</td><td>${d.status==='new'?'新增':`${d.amountChanged?'流量':''}${d.amountChanged&&d.contentChanged?'＋':''}${d.contentChanged?'內容':''}`||'相同'}</td><td>流量：<strong>${html(beforeAmount)}</strong><div class="r074-long">${html(d.beforeText||'—')}</div></td><td>流量：<strong>${html(afterAmount)}</strong><div class="r074-long">${html(d.afterText||'—')}</div></td></tr>
          ${inspectedDiffs.has(d.key)?`<tr class="r074-details"><td colspan="6"><strong>Firebase 原始明細（${d.existing.length} 筆）</strong><ol>${d.existing.map((r,i)=>`<li>${i+1}. ${html(r.id)}｜${r.amount===null?'待確認':html(r.amount)} NM³｜${html(r.content)}</li>`).join('')||'<li>無既有紀錄</li>'}</ol><strong>CSV 原始明細（${d.rows.length} 筆）</strong><ol>${d.rows.map((r,i)=>`<li>${i+1}. ${html(r.amount)} NM³｜${html(r.content)}</li>`).join('')}</ol>${isSpecial?'<p class="r07-warn">勾選後將以 CSV 所列全部明細取代本組舊資料；舊資料會完整備份並保留復原功能。</p>':''}</td></tr>`:''}`;
      }).join('')}</tbody></table></div>${pendingImport.messages.map(m=>`<p class="r07-warn">${html(m)}</p>`).join('')}`;
    const countHost=document.getElementById('r074-selected-count');if(countHost)countHost.textContent=`已選 ${selectedDiffs.size} 組`;
    document.getElementById('r07-confirm-import').disabled=importBusy||!importSelection().length||!!pendingImport.errors.length;
  };
  const onFile=async input=>{
    pendingImport=null;selectedDiffs.clear();inspectedDiffs.clear();
    const file=input.files?.[0];if(!file)return;
    const confirmBtn=document.getElementById('r07-confirm-import');confirmBtn.disabled=true;
    if(!validateMutation())return;
    const currentYear=selectedYear();importPanel().textContent='正在讀取 CSV，並從 Firebase 取得最新資料進行差異比對…';
    try{
      let matrix;
      if(/\.csv$/i.test(file.name))matrix=parseCSV(await file.text());
      else if(/\.(xlsx|xls)$/i.test(file.name)){
        if(!window.XLSX)throw Error('Excel 解析元件尚未載入，請檢查網路。');
        const book=window.XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
        matrix=window.XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1,raw:false,defval:''});
      }else throw Error('僅支援 Excel（.xlsx/.xls）或 CSV。');
      const parsed=parseImportRows(matrix);
      if(parsed.errors.length)throw Error(`有 ${parsed.errors.length} 列無效：${parsed.errors.slice(0,10).join('；')}。請修正後重新匯入，避免部分資料寫入。`);
      if(!parsed.items.length)throw Error('未找到有效資料列。');
      if(typeof window.__flareR074Read!=='function')throw Error('Firebase 安全比對元件尚未就緒，請重新整理。');
      if(typeof window.__flareR074WaitForIdle==='function')await window.__flareR074WaitForIdle();
      const cloud=await window.__flareR074Read();
      if(currentYear!==selectedYear())throw Error('比對期間年度已改變，請重新選擇檔案。');
      const diffs=compareGroups(parsed.items,Array.isArray(cloud.records)?cloud.records:[]);
      pendingImport={year:currentYear,fileName:file.name,rawCount:parsed.items.length,diffs,messages:parsed.messages,errors:parsed.errors};
      renderImportPreview();
    }catch(err){pendingImport=null;importPanel().textContent=`匯入比對失敗：${err.message}`;confirmBtn.disabled=true;}
  };
  const commitDiffs=(r07,approved,batchId,filename,year)=>{
    const base=Array.isArray(r07.records)?r07.records:[];
    let next=[...base];
    const entries=[];
    for(const diff of approved){
      const before=groupOf(base,diff.key);
      // Fail the ENTIRE import if any selected group changed since preview.
      if(stableRows(before)!==diff.baseline)throw Error(`雲端資料已變更：${diff.date} ${diff.factory}。請重新匯入 CSV 比對，未覆蓋任何資料。`);
      const after=diff.rows.map(row=>normalizeRecord({...row,id:id(),year,createdAt:stamp(),source:'import'}));
      next=next.filter(r=>r074Key(r)!==diff.key||r.kind!=='interference');
      next.push(...after);
      entries.push({key:diff.key,date:diff.date,factory:diff.factory,action:before.length?'replace':'new',before,after});
    }
    const audit={id:batchId,year,filename,createdAt:stamp(),status:'committed',entries,
      newGroups:entries.filter(e=>e.action==='new').length,replacedGroups:entries.filter(e=>e.action==='replace').length,
      oldRecordCount:entries.reduce((n,e)=>n+e.before.length,0),newRecordCount:entries.reduce((n,e)=>n+e.after.length,0)};
    // Firestore document limit is 1MiB; fail before writes rather than risk an
    // unbacked replacement. Plenty of headroom is reserved for document metadata.
    if(new TextEncoder().encode(JSON.stringify(audit)).length>850000)throw Error('此批匯入備份超過單一文件安全容量，請分批匯入。沒有修改雲端。');
    return {nextR07:{...r07,records:next},historyDoc:audit,result:{...audit,entries:undefined}};
  };
  const confirmImport=async()=>{
    if(importBusy||!validateMutation()||!pendingImport)return;
    const chosen=importSelection();if(!chosen.length)return;
    const year=pendingImport.year;
    if(year!==selectedYear()){alert('年度已變更，請重新匯入比對。');return;}
    if(chosen.some(d=>d.status==='special'&&!inspectedDiffs.has(d.key))){alert('特殊差異須先展開舊紀錄明細。');return;}
    const added=chosen.filter(d=>d.status==='new').length;
    const replaced=chosen.length-added;
    if(!confirm(`年度 ${year}\n已選擇新增 ${added} 組、覆蓋 ${replaced} 組。\n其餘資料維持原狀。\n確定先備份原始明細，再使用 Firebase 交易提交？`))return;
    if(typeof window.__flareR074Atomic!=='function')return alert('Firebase 交易功能尚未就緒。');
    const snapshot=pendingImport;
    const filename=snapshot.fileName;
    const batchId=id();
    importBusy=true;renderImportPreview();showMessage('正在以 Firebase 交易檢查最新資料並建立覆蓋備份，尚未確認成功…');
    try{
      const result=await window.__flareR074Atomic(batchId,r07=>commitDiffs(r07,chosen,batchId,filename,year));
      pendingImport=null;selectedDiffs.clear();inspectedDiffs.clear();
      importPanel().textContent=`已確認雲端交易提交成功：新增 ${result.newGroups} 組、覆蓋 ${result.replacedGroups} 組。匯入批次 ${batchId} 已備份，可由「匯入歷史／復原」查詢。`;
      document.getElementById('r07-file').value='';
      showMessage(`Firebase 已完成：新增 ${result.newGroups} 組、覆蓋 ${result.replacedGroups} 組。`);
      // The realtime snapshot will authoritatively refresh records and counters.
      if(historyVisible)await showImportHistory();
    }catch(err){
      showMessage(`匯入未完成：${err.message}。所有勾選資料均未標示成功；如有疑問請先查詢匯入歷史。`);
      alert(`未能完成 CSV 匯入：${err.message}\n請檢查網路及雲端資料，再重新比對。`);
    }finally{importBusy=false;if(pendingImport)renderImportPreview();else document.getElementById('r07-confirm-import').disabled=true;}
  };
  const showImportHistory=async()=>{
    historyVisible=true;
    const host=document.getElementById('r074-history');if(!host)return;
    host.classList.remove('hidden');host.textContent='正在從 Firebase 讀取匯入歷史…';
    try{
      if(typeof window.__flareR074ListHistory!=='function')throw Error('Firebase 匯入歷史查詢功能尚未就緒。');
      const y=selectedYear();historyRows=await window.__flareR074ListHistory(y);
      if(y!==selectedYear())return showImportHistory();
      host.innerHTML=`<h3>${y} 年匯入歷史及復原</h3><p>備份保存在 Firebase；復原前會再次確認目前資料是否仍與匯入後相同，若後續有修改則整批停止復原。</p><div class="r07-scroll"><table class="r07-table"><thead><tr><th>匯入時間</th><th>檔案</th><th>新增／覆蓋</th><th>狀態</th><th>操作</th></tr></thead><tbody>${historyRows.map(h=>`<tr><td>${html(h.createdAt||'')}</td><td>${html(h.filename||'')}</td><td>${Number(h.newGroups)||0}／${Number(h.replacedGroups)||0}</td><td>${h.status==='restored'?'已復原':'已提交'}</td><td><button type="button" class="r07-action" data-r074-history-detail="${html(h.id)}">查看備份</button> ${h.status==='restored'?'':`<button type="button" class="r07-action r07-danger" data-r074-restore="${html(h.id)}">復原此批</button>`}</td></tr>`).join('')||'<tr><td colspan="5">本年度尚無匯入歷史</td></tr>'}</tbody></table></div><div id="r074-history-details"></div>`;
    }catch(err){host.textContent=`匯入歷史讀取失敗：${err.message}`;}
  };
  const renderHistoryDetails=auditId=>{
    const audit=historyRows.find(h=>h.id===auditId),host=document.getElementById('r074-history-details');if(!audit||!host)return;
    host.innerHTML=`<h3>備份批次 ${html(audit.id)}</h3><div class="r07-scroll"><table class="r07-table"><thead><tr><th>日期／工廠</th><th>覆蓋前原始紀錄</th><th>匯入後原始紀錄</th></tr></thead><tbody>${(audit.entries||[]).map(e=>`<tr><td>${html(e.date)}<br>${html(e.factory)}</td><td>${(e.before||[]).map(r=>`${html(r.amount)} NM³｜${html(r.content)}<br>`).join('')||'（無）'}</td><td>${(e.after||[]).map(r=>`${html(r.amount)} NM³｜${html(r.content)}<br>`).join('')||'（無）'}</td></tr>`).join('')}</tbody></table></div>`;
  };
  const restoreImport=async auditId=>{
    if(importBusy||!validateMutation())return;
    const audit=historyRows.find(h=>h.id===auditId);if(!audit||audit.status==='restored')return;
    if(Number(audit.year)!==selectedYear()){alert('請切換至匯入批次所屬年度後再操作。');return;}
    if(!confirm(`準備復原匯入批次：${audit.filename}\n影響 ${(audit.entries||[]).length} 組日期＋工廠資料。\n復原前將比對目前雲端是否仍與匯入後一致；任何衝突都會取消整批復原。確定繼續？`))return;
    if(!confirm('第二次確認：復原將移除本批新增／覆蓋後的資料，並恢復覆蓋前完整原始紀錄。確定送出 Firebase 交易？'))return;
    importBusy=true;showMessage('正在進行雲端復原交易與衝突檢查…');
    try{
      await window.__flareR074Atomic(auditId,(r07,stored)=>{
        if(stored.status!=='committed')throw Error('本批資料已復原或狀態不允許復原。');
        const base=Array.isArray(r07.records)?r07.records:[];
        let next=[...base];
        for(const entry of stored.entries||[]){
          if(stableRows(groupOf(base,entry.key))!==stableRows(entry.after))
            throw Error(`復原衝突：${entry.date} ${entry.factory} 已被後續修改、刪除或新增，已停止整批復原。`);
          next=next.filter(r=>r.kind!=='interference'||r074Key(r)!==entry.key);
          next.push(...entry.before);
        }
        return {nextR07:{...r07,records:next},historyDoc:{...stored,status:'restored',restoredAt:stamp()},result:{count:(stored.entries||[]).length}};
      },true);
      showMessage('Firebase 復原交易已完成；受影響資料已還原，其他資料保留。');
      await showImportHistory();
    }catch(err){showMessage(`復原未完成：${err.message}`);alert(`復原未完成：${err.message}`);}
    finally{importBusy=false;}
  };
  const downloadTemplate=()=>{
    const lines=[['日期','工廠','干擾流量 (NM³)','內容'],[`${selectedYear()}/11/10`,'ARO1廠','150','範例：設備異常（請刪除範例列）']];
    const blob=new Blob(['\uFEFF'+lines.map(x=>x.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`干擾流量匯入範本_${selectedYear()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
  };
  const init=()=>{
    if(initialized)return;initialized=true;
    // R0.7.1: initialize one workspace for both manager views so navigation is in-place;
    // the report DOM and its bound events stay mounted and Firestore never reconnects.
    const kind='event';
    const shell=document.querySelector('.app-shell'),header=shell?.firstElementChild;
    if(!shell||!header)return;
    const el=document.createElement('section');el.id='r07-workspace';el.dataset.kind=kind;el.className='no-print';
    el.innerHTML=`<div class="r07-head"><div><h2>${kind==='event'?'① FLARE 使用事件及原因':'② 干擾流量管理'}</h2><p><span data-r07-year></span> 年度｜<span data-r07-count></span></p></div><div class="r07-tools"><a href="./index.html" class="r07-btn">← 返回統計報表</a><button type="button" id="r07-new" class="r07-btn primary">＋ 新增紀錄</button><button type="button" id="r07-import-toggle" class="r07-btn" aria-controls="r07-import-panel" aria-expanded="false">匯入 CSV</button><button type="button" id="r07-csv" class="r07-btn">匯出 CSV</button><button type="button" id="r07-print" class="r07-btn">列印</button></div></div>
      <div class="r07-review" id="r07-review-warning"></div>
      <div class="r07-filter"><label>廠區篩選 <select id="r07-area-filter"><option value="">全部廠區</option>${AREAS.map(a=>`<option value="${a}">${a}</option>`).join('')}</select></label><span>同日同工廠自動彙總顯示；原始紀錄仍可逐筆修改。</span></div>
      <div class="r07-message" id="r07-message" aria-live="polite"></div>
      <form id="r07-editor" class="r07-editor hidden"><div class="r07-form-title" data-r07-form-title>新增紀錄</div><div class="r07-grid"><label>日期（必填）<input name="r07-date" type="date" required></label><label class="r07-factory-field">工廠（必選，廠區自動帶入）<select name="r07-factory"><option value="">請選擇…</option>${AREAS.map(a=>`<optgroup label="${a}">${AREA_FACTORIES[a].map(f=>`<option value="${f}">${f}</option>`).join('')}</optgroup>`).join('')}</select></label><label class="r07-amount-field">干擾流量 (NM³)<input name="r07-amount" type="number" step="any" min="0" placeholder="0 或正數"></label><label class="r07-wide">內容（必填）<textarea name="r07-content" rows="3" required maxlength="6000"></textarea></label></div><div class="r07-tools"><button type="submit" class="r07-btn primary">儲存紀錄</button><button type="button" id="r07-cancel" class="r07-btn">取消</button></div></form>
      <form id="r07-batch-editor" class="r07-editor hidden"><div class="r07-form-title">干擾流量批次新增</div><div class="r07-batch-date"><label>日期（共用，必填）<input name="r07-batch-date" type="date" required></label><p>選擇一次日期，即可新增同一天不同工廠的多筆干擾流量；每個工廠的流量與內容分別填寫。</p></div><div id="r07-batch-items"></div><div class="r07-tools"><button type="button" id="r07-batch-add" class="r07-btn">＋ 新增廠處</button><span class="r07-batch-count" data-r07-batch-count></span></div><div class="r07-tools"><button type="submit" class="r07-btn primary">儲存當日所有紀錄</button><button type="button" id="r07-batch-cancel" class="r07-btn">取消</button></div></form>
      <div id="r07-results"></div>
      <section id="r07-import-panel" class="r07-import hidden"><h3>Excel／CSV 干擾流量匯入與差異比對</h3><p>使用標準欄位「日期、工廠、干擾流量 (NM³)、內容」。上傳後會重新讀取 Firebase 雲端資料，比對「日期＋工廠」的流量和內容；先逐筆勾選，再進行交易提交，沒有選取的資料不變。</p><div class="r07-tools"><button type="button" class="r07-btn" id="r07-template">下載 CSV 範本</button><input type="file" id="r07-file" accept=".xlsx,.xls,.csv"><button type="button" id="r07-confirm-import" class="r07-btn primary" disabled>確認已選取差異並儲存雲端</button><button type="button" id="r074-history-toggle" class="r07-btn">匯入歷史／復原</button></div><div id="r07-import-preview" aria-live="polite"></div><section id="r074-history" class="r074-history hidden"></section></section>`;
    header.insertAdjacentElement('afterend',el);
    el.querySelector('.r07-head a[href="./index.html"]')?.setAttribute('data-r07-return','1');
    document.getElementById('r07-new').addEventListener('click',()=>el.dataset.kind==='interference'?showBatchForm():showForm());
    document.getElementById('r07-editor').addEventListener('submit',saveForm);
    document.getElementById('r07-cancel').addEventListener('click',()=>{form().classList.add('hidden');activeDate=null;render();});
    document.getElementById('r07-batch-editor').addEventListener('submit',saveBatchForm);
    document.getElementById('r07-batch-cancel').addEventListener('click',()=>batchForm().classList.add('hidden'));
    document.getElementById('r07-batch-add').addEventListener('click',()=>{batchDrafts=readBatchDrafts();batchDrafts.push(newBatchDraft());renderBatchRows();});
    document.getElementById('r07-batch-items').addEventListener('change',event=>{
      const select=event.target.closest('[data-r07-batch-field="factory"]');if(!select)return;
      const row=select.closest('[data-r07-batch-row]');const area=row?.querySelector('[data-r07-batch-area]');if(area)area.textContent=areaOf(select.value)||'請先選擇工廠';
    });
    document.getElementById('r07-batch-items').addEventListener('click',event=>{
      const button=event.target.closest('[data-r07-batch-remove]');if(!button)return;
      batchDrafts=readBatchDrafts().filter(row=>row.key!==button.dataset.r07BatchRemove);
      if(!batchDrafts.length)batchDrafts=[newBatchDraft()];renderBatchRows();
    });
    document.getElementById('r07-print').addEventListener('click',()=>window.print());
    document.getElementById('r07-csv').addEventListener('click',()=>exportCSV(el.dataset.kind));
    document.getElementById('r07-import-toggle').addEventListener('click',()=>{
      if(!leaveInline())return;
      const panel=document.getElementById('r07-import-panel');
      panel.classList.toggle('hidden');
      document.getElementById('r07-import-toggle').setAttribute('aria-expanded',String(!panel.classList.contains('hidden')));
      if(!panel.classList.contains('hidden'))panel.scrollIntoView({behavior:'smooth',block:'start'});
    });
    el.addEventListener('submit',event=>{if(event.target?.id==='r075-inline-form')saveInline(event);});
    el.addEventListener('click',event=>{
      if(event.target.closest('[data-r075-cancel]')){cancelInline();return;}
      const btn=event.target.closest('[data-r07-action],[data-r07-date-details],[data-r07-delete-date]');if(!btn)return;
      if(btn.hasAttribute('data-r07-date-details')){toggleDateDetails(btn.dataset.r07DateDetails);return;}
      if(btn.hasAttribute('data-r07-delete-date')){deleteDay(btn.dataset.r07DeleteDate);return;}
      const row=records.find(r=>r.id===btn.dataset.r07Id);
      if(btn.dataset.r07Action==='edit'&&row){if(row.kind==='interference')startInlineEdit(row);else showForm(row);}
      if(btn.dataset.r07Action==='delete'&&row)deleteRow(row.id);
    });
    el.addEventListener('change',event=>{
      if(event.target.matches('[name="r075-factory"]')){const label=inlineForm()?.querySelector('[data-r075-area]');if(label)label.textContent=areaOf(event.target.value)||'請選擇工廠';}
    });
    el.querySelector('#r07-area-filter').addEventListener('change',e=>{if(!leaveInline()){e.target.value=activeArea;return;}activeArea=e.target.value;render();});
    el.querySelector('#r07-file').addEventListener('change',e=>onFile(e.target));
    el.querySelector('#r07-confirm-import').addEventListener('click',confirmImport);
    el.querySelector('#r07-template').addEventListener('click',downloadTemplate);
    el.querySelector('#r074-history-toggle').addEventListener('click',()=>{
      if(historyVisible){historyVisible=false;document.getElementById('r074-history').classList.add('hidden');}
      else showImportHistory();
    });
    el.querySelector('#r07-import-preview').addEventListener('click',event=>{
      const inspect=event.target.closest('[data-r074-inspect]');
      if(inspect){const key=inspect.dataset.r074Inspect;if(inspectedDiffs.has(key)){inspectedDiffs.delete(key);selectedDiffs.delete(key);}else inspectedDiffs.add(key);renderImportPreview();return;}
      if(event.target.closest('#r074-select-all')){
        selectedDiffs=new Set((pendingImport?.diffs||[]).filter(d=>d.status!=='same'&&(d.status!=='special'||inspectedDiffs.has(d.key))).map(d=>d.key));
        renderImportPreview();return;
      }
      if(event.target.closest('#r074-select-none')){selectedDiffs.clear();renderImportPreview();}
    });
    el.querySelector('#r07-import-preview').addEventListener('change',event=>{
      const input=event.target.closest('[data-r074-check]');if(!input)return;
      if(input.checked)selectedDiffs.add(input.dataset.r074Check);else selectedDiffs.delete(input.dataset.r074Check);
      renderImportPreview();
    });
    el.querySelector('#r074-history').addEventListener('click',event=>{
      const detail=event.target.closest('[data-r074-history-detail]');
      if(detail){renderHistoryDetails(detail.dataset.r074HistoryDetail);return;}
      const restore=event.target.closest('[data-r074-restore]');
      if(restore)restoreImport(restore.dataset.r074Restore);
    });

    const activateRoute=()=>{
      const query=new URLSearchParams(location.search);
      const view=query.get('view');
      const isEvent=view==='r07-event';
      const isInterference=view==='r07-interference';
      const isManager=isEvent||isInterference;
      document.documentElement.classList.toggle('flare-r07-view',isManager);
      if(isManager){
        const currentKind=isEvent?'event':'interference';
        el.dataset.kind=currentKind;
        el.querySelector('.r07-head h2').textContent=isEvent?'① FLARE 使用事件及原因':'② 干擾流量管理';
        el.querySelector('.r07-filter').classList.toggle('hidden',!isInterference);
        el.querySelector('#r07-import-toggle').classList.toggle('hidden',!isInterference);
        pendingImport=null;selectedDiffs.clear();inspectedDiffs.clear();historyVisible=false;
        el.querySelector('#r074-history').classList.add('hidden');
        el.querySelector('#r07-import-panel').classList.add('hidden');
        el.querySelector('#r07-import-toggle').setAttribute('aria-expanded','false');
        activeDate=null;inlineEdit=null;
        activeArea=isInterference&&AREAS.includes(query.get('area'))?query.get('area'):'';
        el.querySelector('#r07-area-filter').value=activeArea;
        el.querySelector('#r07-editor').classList.add('hidden');
        el.querySelector('#r07-batch-editor').classList.add('hidden');
        render();
      }
      // Required on entry, return and browser back/forward (including iPad Safari).
      window.scrollTo(0,0);
    };
    const goTo=(view,area='')=>{
      const url=new URL('./index.html',location.href);
      url.searchParams.set('year',String(selectedYear()));
      if(view){url.searchParams.set('view',view);if(area)url.searchParams.set('area',area);}
      if(url.href!==location.href)window.history.pushState({flareView:view||'report'},'',url);
      activateRoute();
    };
    document.addEventListener('click',event=>{
      const link=event.target.closest?.('a#flare-r07-event-link,a#flare-r07-interference-link,a.r07-summary-link,a[data-r07-return]');
      if(!link)return;
      // Only intercept same-site routes; EHS home and unrelated links remain untouched.
      const url=new URL(link.href,location.href);
      const directory=new URL('./',location.href).pathname;
      if(url.origin!==location.origin||![directory,directory+'index.html'].includes(url.pathname))return;
      event.preventDefault();
      if(!leaveInline())return;
      if(link.hasAttribute('data-r07-return'))goTo('');
      else {
        const target=url.searchParams.get('view');
        if(target==='r07-event'||target==='r07-interference')goTo(target,url.searchParams.get('area')||'');
      }
    });
    window.addEventListener('popstate',()=>{const previous=inlineEdit?.url;if(!leaveInline()){history.pushState({flareView:'r07-interference'},'',previous||location.href);return;}activateRoute();});
    activateRoute();
  };
  window.FlareR07={getState,applyCloud,onCloudReady,init,clearAll,addLinkedEvent,syncLinkedChanges,countAreaDays,updateAreaCounters,normalizeFactory,areaOf,isoDate,parseCSV,parseImportRows,getRecords:()=>records.map(x=>({...x})),render,migration:()=>({marks:{...marks},count:records.length})};
  const style=document.createElement('style');style.textContent=`
    .flare-r07-top-btn{display:inline-flex;align-items:center;justify-content:center;padding:8px 11px;border:1px solid #c9d8ef;border-radius:8px;background:#fff;color:#164bb0;font-size:12px;font-weight:800;white-space:nowrap;text-decoration:none}
    .flare-r07-top-btn:hover{background:#edf4ff}
    /* R0.7.1: .flare-report-view's late !important display:block used to revive the report.
       Explicit dual-class selector has greater specificity. Summary is rebuilt as
       .flare-summary-shell by layout-redesign.js and therefore needs its own selector. */
    html.flare-r07-view.flare-report-view .main-layout,
    html.flare-r07-view .app-shell > .flare-summary-shell,
    html.flare-r07-view .app-shell > .bg-white:not(#r07-workspace),
    html.flare-r07-view #top-import-panel{display:none!important}
    #r07-workspace{display:none!important}
    html.flare-r07-view #r07-workspace{display:block!important}
    #r07-workspace{max-width:1220px;margin:12px auto 30px;background:#fff;border:1px solid #d7dfeb;border-radius:12px;box-shadow:0 8px 20px rgba(15,47,95,.06);padding:24px;color:#253248;font-size:13px}
    #r07-workspace .hidden{display:none!important}
    #r07-workspace .r07-head,#r07-workspace .r07-group-heading{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;border-bottom:1px solid #e2e8f0;padding-bottom:16px;margin-bottom:14px}
    #r07-workspace h2{font-size:20px;font-weight:900;color:#0f2f5f}#r07-workspace h3{font-size:15px;font-weight:900;color:#0f2f5f;margin-bottom:8px}
    #r07-workspace .r07-head p{color:#64748b;margin-top:5px;font-size:12px}
    #r07-workspace .r07-tools{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
    #r07-workspace .r07-btn,#r07-workspace .r07-action{display:inline-flex;justify-content:center;align-items:center;border:1px solid #bed0eb;border-radius:7px;padding:8px 12px;background:#fff;color:#1d5fd0;text-decoration:none;font-size:12px;font-weight:800;cursor:pointer}
    #r07-workspace .r07-btn.primary{color:#fff;background:#1d5fd0;border-color:#1d5fd0}#r07-workspace .r07-btn:disabled{opacity:.5;cursor:not-allowed}
    #r07-workspace .r07-review{background:#eff6ff;border:1px solid #d5e4ff;border-radius:8px;padding:10px 12px;color:#476080;margin-bottom:14px}
    #r07-workspace .r07-filter{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:15px 0;color:#64748b}
    #r07-workspace .r07-filter label{display:flex;gap:8px;align-items:center;color:#334155;font-weight:800}
    #r07-workspace select,#r07-workspace input,#r07-workspace textarea{padding:8px;border:1px solid #b8c5d8;border-radius:7px;background:#fff;color:#22334a;max-width:100%;font-size:13px}
    #r07-workspace .r07-editor{background:#f8fbff;border:1px solid #b9d0ed;border-radius:10px;padding:18px;margin:16px 0}
    #r07-workspace .r07-form-title{font-weight:900;margin-bottom:12px;color:#0f2f5f}
    #r07-workspace .r07-batch-date{display:grid;grid-template-columns:minmax(220px,1fr) 2fr;gap:12px;align-items:end;margin-bottom:14px}
    #r07-workspace .r07-batch-date label,#r07-workspace .r07-batch-fields label{display:flex;flex-direction:column;gap:6px;font-weight:800}
    #r07-workspace .r07-batch-date p,#r07-workspace .r07-batch-fields small{color:#64748b;font-size:12px;font-weight:500}
    #r07-workspace .r07-batch-card{border:1px solid #d7dfeb;border-radius:9px;background:#fff;padding:14px;margin:12px 0}
    #r07-workspace .r07-batch-card-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px;color:#174fb2}
    #r07-workspace .r07-batch-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    #r07-workspace .r07-batch-content{grid-column:1/-1}
    #r07-workspace .r07-batch-content textarea{width:100%;min-height:64px}
    #r07-workspace .r07-batch-count{color:#64748b;font-size:12px;font-weight:700;align-self:center}
    #r07-workspace .r07-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:12px}
    #r07-workspace .r07-grid label{display:flex;flex-direction:column;gap:6px;font-weight:700}
    #r07-workspace .r07-wide{grid-column:1/-1}
    #r07-workspace .r07-scroll{overflow-x:auto}#r07-workspace .r07-table{width:100%;border-collapse:collapse;margin:8px 0 16px}
    #r07-workspace .r07-table th,#r07-workspace .r07-table td{text-align:left;padding:10px 9px;border-bottom:1px solid #e2e8f0;vertical-align:top}
    #r07-workspace .r07-table th{background:#eef3fa;color:#24364f;font-weight:850;white-space:nowrap}
    #r07-workspace .r07-content{white-space:pre-wrap;overflow-wrap:anywhere;min-width:250px}
    #r07-workspace .r07-content-line{border-top:1px dashed #cbd5e1;margin:6px 0}
    #r07-workspace .r07-date{margin:16px 0;border:1px solid #d7dfeb;border-radius:8px;overflow:hidden}
    #r07-workspace .r07-date-heading{display:flex;justify-content:space-between;flex-wrap:wrap;background:#edf4fd;padding:12px 14px;color:#174fb2}
    #r07-workspace .r07-date-heading span{font-weight:800}
    #r07-workspace .r07-date-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
    #r07-workspace .r07-date-controls span{margin-right:8px}
    #r07-workspace .r07-date-editing{border:2px solid #e7a53b;background:#fffaf0;box-shadow:0 0 0 2px rgba(245,158,11,.10)}
    #r07-workspace .r07-date-editing>.r07-date-heading{background:#ffedc4;color:#925200}
    #r07-workspace .r07-edit-indicator{font-size:11px;padding:3px 7px;margin-left:10px;border-radius:10px;background:#f59e0b;color:#fff}
    #r07-workspace .r07-day-detail{padding:14px;background:#fffbf0;border-top:1px solid #f6d898}
    #r07-workspace .r07-day-detail>p{margin:6px 0 10px;font-size:12px;color:#8a5b17}
    #r07-workspace .r075-row-editing td{background:#fff7df;padding:12px;border-left:3px solid #eab04b;border-right:3px solid #eab04b}
    #r07-workspace .r075-inline-form{border:1px solid #eab04b;border-radius:9px;padding:13px;background:#fffaf0;min-width:0}
    #r07-workspace .r075-inline-heading{display:flex;align-items:center;gap:10px;margin-bottom:12px;color:#80500f}
    #r07-workspace .r075-chip{border-radius:14px;background:#f59e0b;color:white;padding:3px 9px;font-size:11px;font-weight:800}
    #r07-workspace .r075-inline-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
    #r07-workspace .r075-inline-fields label{display:flex;flex-direction:column;gap:6px;font-weight:800;font-size:12px}
    #r07-workspace .r075-inline-fields input,#r07-workspace .r075-inline-fields select,#r07-workspace .r075-inline-fields textarea{width:100%;max-width:100%;border-radius:6px;border:1px solid #bdcde4;background:#fff;padding:9px;font-size:14px;min-width:0;color:#172b4d}
    #r07-workspace .r075-inline-fields small{font-weight:500;color:#64748b}
    #r07-workspace .r075-content-field{grid-column:1/-1}
    #r07-workspace .r075-inline-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:13px}
    @media(max-width:760px){#r07-workspace .r075-inline-fields{grid-template-columns:1fr}}

    #r07-workspace .r07-action.r07-danger{color:#b42318;border-color:#f5b2ab;background:#fff}
    #r07-workspace .r07-action.r07-danger:hover{background:#fff1ef}
    #r07-workspace .r07-action:disabled{opacity:.5;cursor:not-allowed}
    #r07-workspace .r07-import{border-top:1px solid #e2e8f0;padding-top:20px;margin-top:24px}
    #r07-workspace .r07-import p{color:#64748b;margin-bottom:10px}#r07-workspace .r07-import .r07-tools{margin:10px 0}
    #r07-workspace .r074-diff-table td{min-width:95px;overflow-wrap:anywhere}#r07-workspace .r074-diff-table td:nth-child(1){min-width:76px}#r07-workspace .r074-diff-table td:nth-child(5),#r07-workspace .r074-diff-table td:nth-child(6){min-width:210px}
    #r07-workspace .r074-diff-table .r074-new{background:#f4faf5}#r07-workspace .r074-diff-table .r074-changed{background:#fffdf7}#r07-workspace .r074-diff-table .r074-special{background:#fff7ed}
    #r07-workspace .r074-long{white-space:pre-wrap;overflow-wrap:anywhere;max-width:430px;margin-top:5px}#r07-workspace .r074-summary{padding:12px;border:1px solid #d9e5f5;border-radius:8px;background:#f8fbff;margin:12px 0}
    #r07-workspace .r074-summary .r074-note{font-size:12px;color:#475569}#r07-workspace .r074-details{background:#fffdfa}#r07-workspace .r074-details ol{padding-left:22px;margin:8px 0}#r07-workspace .r074-details li{margin-bottom:4px}
    #r07-workspace .r074-history{border-top:1px solid #d7e3f0;padding-top:15px;margin-top:18px}#r07-workspace .r074-history .r07-table td{max-width:440px;overflow-wrap:anywhere}

    #r07-workspace .r07-warn{font-size:11px;color:#b45309}#r07-workspace .r07-message{color:#146c43;font-size:12px;margin-bottom:8px}
    .r07-summary-link{display:inline-block;margin-top:7px;color:#1d5fd0!important;text-decoration:none!important;border-top:1px solid #e2e8f0;padding-top:7px;font-size:12px;font-weight:800}
    .r07-summary-link:hover{text-decoration:underline!important}
    @media(max-width:760px){#r07-workspace{padding:12px}#r07-workspace .r07-grid,#r07-workspace .r07-batch-fields,#r07-workspace .r07-batch-date{grid-template-columns:1fr}#r07-workspace .r07-table{min-width:580px}}
    @media print{body{background:#fff!important}html.flare-r07-view #r07-workspace{display:block!important;border:0;box-shadow:none;padding:0}html.flare-r07-view .app-shell > .flex.flex-col,html.flare-r07-view #r07-workspace .r07-tools,html.flare-r07-view #r07-workspace .r07-editor,html.flare-r07-view #r07-workspace .r07-import,html.flare-r07-view #r07-workspace .r07-date-controls button,html.flare-r07-view #r07-workspace .r07-day-detail{display:none!important}html.flare-r07-view #r07-workspace,#r07-workspace .r07-head{display:block!important}#r07-workspace .r07-date{break-inside:avoid}}
  `;document.head.appendChild(style);
})();
