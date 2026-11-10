/* FLARE R0.7 – independent event/remark records, interference volumes and safe legacy migration.
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
  let records=fromStore(KEY,[]), marks=fromStore(MARK_KEY,{}), activeArea='', pendingImport=[];
  if (!Array.isArray(records)) records=[];
  if (!marks || typeof marks!=='object'||Array.isArray(marks)) marks={};
  let cloudReady=false, needsSave=false, initialized=false;
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
      yearRows(year,'event').sort((a,b)=>a.date.localeCompare(b.date)).map((r,i)=>[i+1,displayDate(r.date),r.content]);
    const csv='\uFEFF'+[headers,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=`FLARE_R0.7_${kind==='event'?'使用事件及原因':'干擾流量'}_${year}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
  };
  const rowButton=(action,row,label)=>`<button type="button" class="r07-action" data-r07-action="${action}" data-r07-id="${html(row.id)}">${label}</button>`;
  const showMessage=text=>{const el=document.getElementById('r07-message');if(el)el.textContent=text;};
  const render=()=>{
    const root=document.getElementById('r07-workspace');if(!root)return;
    const kind=root.dataset.kind,year=selectedYear();
    root.querySelector('[data-r07-year]').textContent=String(year);
    const body=root.querySelector('#r07-results');if(!body)return;
    if(kind==='event'){
      const list=yearRows(year,kind).sort((a,b)=>a.date.localeCompare(b.date));
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
      body.innerHTML=dates.map(date=>{
        const subs=groups.filter(g=>g.date===date);
        const daily=subs.reduce((a,g)=>a+g.amount,0);
        return `<section class="r07-date"><div class="r07-date-heading"><strong>${displayDate(date)}</strong><span>當日合計：${daily.toLocaleString('zh-TW')} NM³</span></div><div class="r07-scroll"><table class="r07-table"><thead><tr><th>項目</th><th>廠區</th><th>工廠</th><th>流量 (NM³)</th><th>內容</th><th>操作</th></tr></thead><tbody>${subs.map(g=>`<tr><td>${++sequence}</td><td>${html(g.area)||'<span class="r07-warn">待確認</span>'}</td><td>${html(g.factory)||'<span class="r07-warn">待確認</span>'}</td><td>${g.entries.every(r=>r.amount===null)?'待確認':g.amount.toLocaleString('zh-TW')}</td><td class="r07-content">${g.entries.map(r=>html(r.content)).filter(Boolean).join('<div class="r07-content-line"></div>')||'—'}</td><td><button type="button" class="r07-action" data-r07-group="${html(g.date+'|'+g.factory)}">明細／編輯</button></td></tr>`).join('')}</tbody></table></div></section>`;
      }).join('')||'<p class="r07-empty">本年度尚無干擾流量紀錄。</p>';
      root.querySelector('#r07-area-filter').value=activeArea;
    }
    const pending=yearRows(year,kind).filter(r=>r.needsReview).length;
    const warning=root.querySelector('#r07-review-warning');
    if(warning){warning.textContent=pending?`歷史資料有 ${pending} 筆需要人工確認日期／工廠／流量；未確認數值不納入流量統計。原始文字已備份。`:'歷史備註原文已保留，轉換後可逐筆編輯。';}
  };
  const form=()=>document.getElementById('r07-editor');
  const showForm=(record=null)=>{
    const root=form();if(!root)return;
    root.classList.remove('hidden');root.dataset.id=record?.id||'';
    root.querySelector('[name="r07-date"]').value=record?.date||'';
    root.querySelector('[name="r07-factory"]').value=record?.factory||'';
    root.querySelector('[name="r07-amount"]').value=record?.amount??'';
    root.querySelector('[name="r07-content"]').value=record?.content||'';
    root.querySelector('[data-r07-form-title]').textContent=record?'修改紀錄':'新增紀錄';
    const kind=document.getElementById('r07-workspace')?.dataset.kind;
    root.querySelector('.r07-factory-field').classList.toggle('hidden',kind!=='interference');
    root.querySelector('.r07-amount-field').classList.toggle('hidden',kind!=='interference');
    root.scrollIntoView({behavior:'smooth',block:'nearest'});
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
    root.classList.add('hidden');root.dataset.id='';push();showMessage('紀錄已更新，正在同步 Firebase。');
  };
  const deleteRow=rid=>{
    if(!validateMutation())return;
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
  const showGroup=(key)=>{
    const sep=key.indexOf('|'),date=key.slice(0,sep),factory=key.slice(sep+1);
    const rows=records.filter(r=>r.kind==='interference'&&r.date===date&&r.factory===factory);
    const root=document.getElementById('r07-group-detail');
    if(!root)return;
    root.classList.remove('hidden');
    root.querySelector('[data-r07-group-title]').textContent=`${displayDate(date)}｜${areaOf(factory)}｜${factory}（${rows.length} 筆原始紀錄）`;
    root.querySelector('[data-r07-group-body]').innerHTML=rows.map((r,i)=>`<tr><td>${i+1}</td><td>${r.amount===null?'待確認':r.amount.toLocaleString('zh-TW')}</td><td class="r07-content">${html(r.content)}</td><td>${rowButton('edit',r,'編輯')} ${rowButton('delete',r,'刪除')}</td></tr>`).join('');
    root.scrollIntoView({behavior:'smooth',block:'nearest'});
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
  const onFile=async input=>{
    pendingImport=[];const file=input.files?.[0];if(!file)return;
    try{
      let matrix;
      if(/\.csv$/i.test(file.name))matrix=parseCSV(await file.text());
      else if(/\.(xlsx|xls)$/i.test(file.name)){
        if(!window.XLSX)throw Error('Excel 解析元件尚未載入，請檢查網路。');
        const book=window.XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:true});
        matrix=window.XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]],{header:1,raw:false,defval:''});
      }else throw Error('僅支援 Excel（.xlsx/.xls）或 CSV。');
      const parsed=parseImportRows(matrix);pendingImport=parsed.items;
      const prev=document.getElementById('r07-import-preview');
      prev.innerHTML=`<strong>可匯入 ${pendingImport.length} 筆</strong>，${parsed.messages.length} 項檢查訊息。<div class="r07-scroll"><table class="r07-table"><thead><tr><th>日期</th><th>廠區</th><th>工廠</th><th>流量</th><th>內容</th></tr></thead><tbody>${pendingImport.slice(0,30).map(r=>`<tr><td>${displayDate(r.date)}</td><td>${areaOf(r.factory)}</td><td>${html(r.factory)}</td><td>${r.amount}</td><td>${html(r.content)}</td></tr>`).join('')}</tbody></table></div>${parsed.messages.slice(0,20).map(m=>`<p class="r07-warn">${html(m)}</p>`).join('')}`;
      document.getElementById('r07-confirm-import').disabled=!pendingImport.length||!!parsed.errors.length;
      if(parsed.errors.length)showMessage('匯入檔存在無效資料，請修正後重新選擇，避免部分匯入。');
    }catch(err){document.getElementById('r07-import-preview').textContent=`解析失敗：${err.message}`;document.getElementById('r07-confirm-import').disabled=true;}
  };
  const confirmImport=()=>{
    if(!validateMutation()||!pendingImport.length)return;
    const mode=document.getElementById('r07-import-mode').value;
    const year=selectedYear();
    let added=0,duplicate=0,skipped=0,replaced=0;
    const planned=[];const scratch=[...records];
    for(const row of pendingImport){
      if(scratch.some(r=>r.kind==='interference'&&signature(r)===signature(row))){duplicate++;continue;}
      const conflicts=scratch.filter(r=>r.kind==='interference'&&r.date===row.date&&r.factory===row.factory);
      if(conflicts.length&&mode==='skip'){skipped++;continue;}
      if(conflicts.length&&mode==='replace'){
        // Preserve originals in browser backup before replacing a date/factory group.
        planned.push(...conflicts);replaced+=conflicts.length;
        for(const rec of conflicts){const idx=scratch.indexOf(rec);if(idx>=0)scratch.splice(idx,1);}
      }
      scratch.push(normalizeRecord(row));added++;
    }
    if(!confirm(`年度 ${year}\n預計新增 ${added} 筆、完全重複 ${duplicate} 筆、略過 ${skipped} 筆、取代舊紀錄 ${replaced} 筆。\n確定匯入至 Firebase？`))return;
    if(planned.length){const backupKey=`flare_r07_import_replace_backup_${Date.now()}`;localStorage.setItem(backupKey,JSON.stringify(planned));}
    records=scratch;pendingImport=[];document.getElementById('r07-import-preview').textContent='匯入完成';
    document.getElementById('r07-confirm-import').disabled=true;document.getElementById('r07-file').value='';
    push();showMessage(`已加入 ${added} 筆，重複 ${duplicate} 筆、略過 ${skipped} 筆；取代資料已備份於本機。`);
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
    el.innerHTML=`<div class="r07-head"><div><h2>${kind==='event'?'① FLARE 使用事件及原因':'② 干擾流量管理'}</h2><p><span data-r07-year></span> 年度｜<span data-r07-count></span></p></div><div class="r07-tools"><a href="./index.html" class="r07-btn">← 返回統計報表</a><button type="button" id="r07-new" class="r07-btn primary">＋ 新增紀錄</button><button type="button" id="r07-csv" class="r07-btn">匯出 CSV</button><button type="button" id="r07-print" class="r07-btn">列印</button></div></div>
      <div class="r07-review" id="r07-review-warning"></div>
      <div class="r07-filter"><label>廠區篩選 <select id="r07-area-filter"><option value="">全部廠區</option>${AREAS.map(a=>`<option value="${a}">${a}</option>`).join('')}</select></label><span>同日同工廠自動彙總顯示；原始紀錄仍可逐筆修改。</span></div>
      <div class="r07-message" id="r07-message" aria-live="polite"></div>
      <form id="r07-editor" class="r07-editor hidden"><div class="r07-form-title" data-r07-form-title>新增紀錄</div><div class="r07-grid"><label>日期（必填）<input name="r07-date" type="date" required></label><label class="r07-factory-field">工廠（必選，廠區自動帶入）<select name="r07-factory"><option value="">請選擇…</option>${AREAS.map(a=>`<optgroup label="${a}">${AREA_FACTORIES[a].map(f=>`<option value="${f}">${f}</option>`).join('')}</optgroup>`).join('')}</select></label><label class="r07-amount-field">干擾流量 (NM³)<input name="r07-amount" type="number" step="any" min="0" placeholder="0 或正數"></label><label class="r07-wide">內容（必填）<textarea name="r07-content" rows="3" required maxlength="6000"></textarea></label></div><div class="r07-tools"><button type="submit" class="r07-btn primary">儲存紀錄</button><button type="button" id="r07-cancel" class="r07-btn">取消</button></div></form>
      <div id="r07-group-detail" class="r07-group-detail hidden"><div class="r07-group-heading"><strong data-r07-group-title></strong><button type="button" id="r07-close-detail" class="r07-btn">關閉</button></div><div class="r07-scroll"><table class="r07-table"><thead><tr><th>項目</th><th>流量 (NM³)</th><th>內容</th><th>操作</th></tr></thead><tbody data-r07-group-body></tbody></table></div></div>
      <div id="r07-results"></div>
      <section class="r07-import"><h3>Excel／CSV 干擾流量匯入</h3><p>使用標準欄位「日期、工廠、干擾流量 (NM³)、內容」；廠區由工廠自動對應。僅讀取 Excel 第一個工作表。</p><div class="r07-tools"><button type="button" class="r07-btn" id="r07-template">下載 CSV 範本</button><input type="file" id="r07-file" accept=".xlsx,.xls,.csv"><select id="r07-import-mode"><option value="append">新增不同事件、完全重複略過</option><option value="skip">同日期同工廠已存在則略過</option><option value="replace">取代同日期同工廠原始明細</option></select><button type="button" id="r07-confirm-import" class="r07-btn primary" disabled>確認匯入</button></div><div id="r07-import-preview" aria-live="polite"></div></section>`;
    header.insertAdjacentElement('afterend',el);
    el.querySelector('.r07-head a[href="./index.html"]')?.setAttribute('data-r07-return','1');
    document.getElementById('r07-new').addEventListener('click',()=>showForm());
    document.getElementById('r07-editor').addEventListener('submit',saveForm);
    document.getElementById('r07-cancel').addEventListener('click',()=>form().classList.add('hidden'));
    document.getElementById('r07-print').addEventListener('click',()=>window.print());
    document.getElementById('r07-csv').addEventListener('click',()=>exportCSV(el.dataset.kind));
    document.getElementById('r07-close-detail').addEventListener('click',()=>document.getElementById('r07-group-detail').classList.add('hidden'));
    el.addEventListener('click',event=>{
      const btn=event.target.closest('[data-r07-action],[data-r07-group]');if(!btn)return;
      if(btn.dataset.r07Group){showGroup(btn.dataset.r07Group);return;}
      const row=records.find(r=>r.id===btn.dataset.r07Id);
      if(btn.dataset.r07Action==='edit'&&row)showForm(row);
      if(btn.dataset.r07Action==='delete'&&row)deleteRow(row.id);
    });
    el.querySelector('#r07-area-filter').addEventListener('change',e=>{activeArea=e.target.value;render();});
    el.querySelector('#r07-file').addEventListener('change',e=>onFile(e.target));
    el.querySelector('#r07-confirm-import').addEventListener('click',confirmImport);
    el.querySelector('#r07-template').addEventListener('click',downloadTemplate);

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
        el.querySelector('.r07-import').classList.toggle('hidden',!isInterference);
        activeArea=isInterference&&AREAS.includes(query.get('area'))?query.get('area'):'';
        el.querySelector('#r07-area-filter').value=activeArea;
        el.querySelector('#r07-editor').classList.add('hidden');
        el.querySelector('#r07-group-detail').classList.add('hidden');
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
      if(link.hasAttribute('data-r07-return'))goTo('');
      else {
        const target=url.searchParams.get('view');
        if(target==='r07-event'||target==='r07-interference')goTo(target,url.searchParams.get('area')||'');
      }
    });
    window.addEventListener('popstate',activateRoute);
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
    #r07-workspace .r07-group-detail{margin:16px 0;padding:16px;border:1px solid #a7c0e8;border-radius:8px;background:#f8fbff}
    #r07-workspace .r07-import{border-top:1px solid #e2e8f0;padding-top:20px;margin-top:24px}
    #r07-workspace .r07-import p{color:#64748b;margin-bottom:10px}#r07-workspace .r07-import .r07-tools{margin:10px 0}
    #r07-workspace .r07-warn{font-size:11px;color:#b45309}#r07-workspace .r07-message{color:#146c43;font-size:12px;margin-bottom:8px}
    .r07-summary-link{display:inline-block;margin-top:7px;color:#1d5fd0!important;text-decoration:none!important;border-top:1px solid #e2e8f0;padding-top:7px;font-size:12px;font-weight:800}
    .r07-summary-link:hover{text-decoration:underline!important}
    @media(max-width:760px){#r07-workspace{padding:12px}#r07-workspace .r07-grid{grid-template-columns:1fr}#r07-workspace .r07-table{min-width:580px}}
    @media print{body{background:#fff!important}html.flare-r07-view #r07-workspace{display:block!important;border:0;box-shadow:none;padding:0}html.flare-r07-view .app-shell > .flex.flex-col,html.flare-r07-view #r07-workspace .r07-tools,html.flare-r07-view #r07-workspace .r07-editor,html.flare-r07-view #r07-workspace .r07-import,html.flare-r07-view #r07-workspace .r07-group-detail{display:none!important}html.flare-r07-view #r07-workspace,#r07-workspace .r07-head{display:block!important}#r07-workspace .r07-date{break-inside:avoid}}
  `;document.head.appendChild(style);
})();
