(function(){
  'use strict';

  const CONFIG = {
    fieldMapUrl: 'data/R41_FieldMap.json?v=20260921-final',
    snapshotUrl: 'data/R41_DataSnapshot.json?v=20260921-final',
    bindingsUrl: 'data/R41_StaffBindings.json?v=20260921-final',
    semanticUrl: 'data/R41_SemanticBindings.json?v=20260921-v7',
    placementUrl: 'data/R41_PlacementRules.json?v=20260921-v7',
    masterImageUrl: 'assets/R41_Master_200dpi.png?v=20260921-final',
    masterPdfUrl: 'assets/R41_Master_Template.pdf?v=20260921-final',
    previewDpi: 100,
    exportDpi: 200,
    fontFamily: '"DFKai-SB","BiauKai","標楷體","KaiTi",serif'
  };

  const api = { ready:false, error:'', CONFIG };
  window.EHSMasterPdf = api;

  let fieldMap=null, snapshot=null, bindings=null, semantic=null, placement=null, masterImage=null;
  let fieldsById=new Map(), parentByFieldId=new Map(), nodesById=new Map(), initPromise=null;

  function jsonFetch(url){
    return fetch(url,{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(`${url} 載入失敗 (${r.status})`);return r.json();});
  }
  function loadImage(url){
    return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error(`${url} 圖檔載入失敗`));img.src=url;});
  }
  function init(){
    if(initPromise)return initPromise;
    initPromise=Promise.all([
      jsonFetch(CONFIG.fieldMapUrl),jsonFetch(CONFIG.snapshotUrl),jsonFetch(CONFIG.bindingsUrl),jsonFetch(CONFIG.semanticUrl),jsonFetch(CONFIG.placementUrl),loadImage(CONFIG.masterImageUrl)
    ]).then(([fm,ss,bd,se,pl,img])=>{
      fieldMap=fm;snapshot=ss.fields||ss;bindings=bd.bindings||bd;semantic=se;placement=pl;masterImage=img;
      fieldsById=new Map();parentByFieldId=new Map();nodesById=new Map((fieldMap.nodes||[]).map(n=>[n.node_id,n]));
      for(const node of fieldMap.nodes||[]){for(const f of node.lines||[]){fieldsById.set(f.field_id,f);parentByFieldId.set(f.field_id,node.bbox||null);}}
      for(const f of fieldMap.special_fields||[]){fieldsById.set(f.field_id,f);parentByFieldId.set(f.field_id,null);}
      api.ready=true;api.error='';return api;
    }).catch(err=>{api.error=err.message||String(err);console.error('Master PDF engine init failed',err);throw err;});
    return initPromise;
  }
  api.init=init;

  function inferSummaryClass(title,fallbackLevel=''){
    const t=String(title||'').trim();
    if(t==='定期契約人員')return '定期契約人員';
    if(t==='培訓人員')return '培訓人員';
    if(t==='事務人員'||t==='健康助理員')return '事務人員';
    if(t==='助理工程師')return '基層人員';
    if(t==='健康管理師')return '一級主管';
    if(t==='處長'||t.includes('副處長')||t==='組長'||t==='副組長'||t.endsWith('組長'))return '一級主管';
    if(t.includes('高工師'))return '二級主管';
    if(t.includes('工程師')||t.includes('資工師'))return '基層主管';
    if(t.includes('管理員'))return '基層人員';
    const allowed=['經理級','一級主管','二級主管','基層主管','基層人員','事務人員','定期契約人員','培訓人員'];
    return allowed.includes(fallbackLevel)?fallbackLevel:'基層人員';
  }
  api.inferSummaryClass=inferSummaryClass;

  function findBindingBySlot(slotId){return Object.values(bindings||{}).find(b=>b.slotId===slotId)||null;}
  function getSlotMeta(slotId){return semantic?.slots?.[slotId]||null;}
  api.getSlotMeta=getSlotMeta;

  function normalizeKey(v){return String(v??'').trim().replace(/\s+/g,' ');}
  function hydrateStaff(staff){
    if(!Array.isArray(staff))return staff;
    const defaults=placement?.baselineStaffProfiles||{};
    for(const s of staff){
      if(!s)continue;
      let b=null;
      if(s.pdfSlotId)b=findBindingBySlot(s.pdfSlotId);
      if(!b&&bindings?.[s.name])b=bindings[s.name];
      if(b){
        if(!s.pdfSlotId)s.pdfSlotId=b.slotId;
        if(!s.education)s.education=b.baselineEducation||'';
      }
      // 舊版 Firestore 只有 unit，且 unit 曾混用業務/轄區。首次載入時依核准 R41 圖面校正為新欄位。
      const d=defaults[s.name];
      if(d && Number(s.profileSchemaVersion||0)<3){
        s.unit=d.unit||'';s.business=d.business||'';s.jurisdiction=d.jurisdiction||'';s.targetRole=d.targetRole||s.title||'';
        s.level=inferSummaryClass(s.title,s.level);
        s.profileSchemaVersion=3;
        if(s.layoutDirty==null)s.layoutDirty=false;
      }else{
        s.unit=normalizeKey(s.unit);s.business=normalizeKey(s.business);s.jurisdiction=normalizeKey(s.jurisdiction);s.targetRole=normalizeKey(s.targetRole||s.title);
        if(s.profileSchemaVersion==null)s.profileSchemaVersion=3;
        if(s.layoutDirty==null)s.layoutDirty=false;
      }
    }
    return staff;
  }
  api.hydrateStaff=hydrateStaff;

  function dimensionMatches(profile,key,value){
    const opts=profile?.[`${key}Options`];
    if(Array.isArray(opts)&&opts.length)return opts.map(normalizeKey).includes(normalizeKey(value));
    return normalizeKey(profile?.[key])===normalizeKey(value);
  }
  function profileMatches(profile,s){
    return dimensionMatches(profile,'unit',s.unit)
      && dimensionMatches(profile,'business',s.business)
      && dimensionMatches(profile,'jurisdiction',s.jurisdiction)
      && normalizeKey(profile.targetRole)===normalizeKey(s.targetRole);
  }
  function getProfileForStaff(s){
    if(!s||!placement)return null;
    return (placement.profiles||[]).find(p=>profileMatches(p,s))||null;
  }
  api.getProfileForStaff=getProfileForStaff;
  function profileCandidates(item){
    if(!placement)return [];
    return (placement.profiles||[]).filter(p=>dimensionMatches(p,'unit',item?.unit)&&dimensionMatches(p,'business',item?.business)&&dimensionMatches(p,'jurisdiction',item?.jurisdiction));
  }
  function targetRoleOptions(item){return [...new Set(profileCandidates(item).map(p=>p.targetRole).filter(Boolean))];}
  api.getTargetRoleOptions=targetRoleOptions;
  function suggestTargetRole(item){
    const c=profileCandidates(item);if(!c.length)return '';
    const current=normalizeKey(item?.targetRole);if(current&&c.some(p=>normalizeKey(p.targetRole)===current))return current;
    const title=normalizeKey(item?.title);const exact=c.find(p=>normalizeKey(p.targetRole)===title);if(exact)return exact.targetRole;
    return c.length===1?c[0].targetRole:'';
  }
  api.suggestTargetRole=suggestTargetRole;
  api.getPlacementSuggestions=()=>placement?.policy||{};

  function levelRank(level){const a=placement?.policy?.levelOrder||[];const i=a.indexOf(level);return i<0?999:i;}
  function joinRank(v){const m=String(v||'').match(/^(\d{4})[\/-](\d{1,2})/);return m?Number(m[1])*12+Number(m[2]):999999;}
  function sortPeople(a,b){return levelRank(a.level)-levelRank(b.level)||joinRank(a.joinMonth)-joinRank(b.joinMonth)||String(a.name||'').localeCompare(String(b.name||''),'zh-Hant');}

  function effectiveStaff(state){
    const source=hydrateStaff((state?.staff||[]).map(s=>({...s})));
    if(!placement)return source;
    const dirty=new Set();
    for(const s of source){
      if(!s.layoutDirty)continue;
      const p=getProfileForStaff(s);if(p)dirty.add(p.id);
      if(s.previousPlacementProfileId)dirty.add(s.previousPlacementProfileId);
    }
    if(!dirty.size)return source;
    const profileById=new Map((placement.profiles||[]).map(p=>[p.id,p]));
    for(const pid of dirty){
      const p=profileById.get(pid);if(!p)continue;
      const members=source.filter(s=>s.status!=='inactive'&&profileMatches(p,s)).sort(sortPeople);
      const owned=new Set([...(p.targetSlots||[]),...(p.otherSlots||[])]);
      for(const s of source){if(s.status!=='inactive'&&(members.includes(s)||owned.has(s.pdfSlotId)))s.pdfSlotId='';}
      const matching=members.filter(s=>normalizeKey(s.title)===normalizeKey(p.targetRole));
      const other=members.filter(s=>normalizeKey(s.title)!==normalizeKey(p.targetRole));
      const targetSlots=[...(p.targetSlots||[])],otherSlots=[...(p.otherSlots||[])];
      const used=new Set();
      const assign=(person,slot,border)=>{if(!person||!slot)return;person.pdfSlotId=slot;person.__desiredBorder=border;person.__placementProfileId=p.id;used.add(slot);};
      let ti=0,oi=0;
      for(const person of matching){
        let slot=targetSlots[ti++];
        if(!slot){while(oi<otherSlots.length&&used.has(otherSlots[oi]))oi++;slot=otherSlots[oi++];}
        assign(person,slot,'solid');
      }
      for(const person of other){
        while(oi<otherSlots.length&&used.has(otherSlots[oi]))oi++;
        const slot=otherSlots[oi++];assign(person,slot,'dashed');
      }
    }
    return source;
  }
  api.getEffectiveStaff=effectiveStaff;
  function dirtyProfileIds(state){
    const out=new Set();hydrateStaff(state?.staff||[]);
    for(const s of state?.staff||[]){if(!s?.layoutDirty)continue;const p=getProfileForStaff(s);if(p)out.add(p.id);if(s.previousPlacementProfileId)out.add(s.previousPlacementProfileId);}
    return out;
  }

  function zhRevisionDate(iso){
    const m=String(iso||'').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if(!m)return `修訂日期：${iso||''}`;
    return `修訂日期：${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日`;
  }
  function splitEducation(text,baselineLines){
    const lines=baselineLines||[];const count=Math.max(1,lines.length);text=String(text||'');
    if(count===1)return [text];
    if(text===lines.join(''))return lines.slice();
    const weights=lines.map(x=>Math.max(1,[...x].length)),total=weights.reduce((a,b)=>a+b,0),chars=[...text],out=[];let pos=0;
    for(let i=0;i<count;i++){
      const remaining=chars.length-pos;
      if(i===count-1){out.push(chars.slice(pos).join(''));break;}
      let take=Math.round(chars.length*weights[i]/total);take=Math.max(1,Math.min(take,Math.max(1,remaining-(count-i-1))));
      out.push(chars.slice(pos,pos+take).join(''));pos+=take;
    }
    while(out.length<count)out.push('');return out;
  }

  function activeStaff(state){return effectiveStaff(state).filter(s=>s&&s.status!=='inactive');}
  function occupiedBySlot(state){
    const map=new Map();
    for(const s of activeStaff(state)){if(s.pdfSlotId){if(!map.has(s.pdfSlotId))map.set(s.pdfSlotId,[]);map.get(s.pdfSlotId).push(s);}}
    return map;
  }
  function resolveStaffForBinding(state,b){
    const staff=effectiveStaff(state);
    const bySlot=staff.find(s=>s.pdfSlotId===b.slotId&&s.status!=='inactive');
    if(bySlot)return bySlot;
    const baselinePerson=staff.find(s=>s.name===b.baselineName);
    if(baselinePerson&&!baselinePerson.pdfSlotId&&baselinePerson.status!=='inactive')return baselinePerson;
    return null;
  }

  function baselinePlanMap(){
    const out={};for(const r of semantic?.staffingFields||[])out[r.fieldId]=Number(r.baselinePlanned)||0;return out;
  }
  function planMap(state){return {...baselinePlanMap(),...(state?.meta?.pdfStaffingPlan||{})};}
  api.getPlanMap=planMap;

  function computeSemantic(state){
    hydrateStaff(state?.staff||[]);
    const categories=(semantic?.summaryCategories||[]).filter(x=>x!=='合計');
    const groups=(semantic?.groups||[]).map(g=>g.id);
    const plan=planMap(state);
    const planned={},current={};
    for(const g of groups){
      planned[g]={};current[g]={};
      for(const c of categories){
        const base=semantic?.baselineSemantic?.[`${g}::${c}`]||{planned:0,current:0};
        planned[g][c]=Number(base.planned)||0;current[g][c]=0;
      }
    }
    // Planned totals begin from the Master and only change by editable 28-field deltas.
    for(const r of semantic?.staffingFields||[]){
      const delta=(Number(plan[r.fieldId])||0)-(Number(r.baselinePlanned)||0);
      if(delta&&planned[r.group]&&planned[r.group][r.summaryClass]!=null)planned[r.group][r.summaryClass]+=delta;
    }
    // Current bottom statistics are derived from active people + fixed PDF display slots.
    for(const s of activeStaff(state)){
      const slot=getSlotMeta(s.pdfSlotId);if(!slot||!current[slot.group])continue;
      const cls=inferSummaryClass(s.title,s.level);
      if(current[slot.group][cls]==null)current[slot.group][cls]=0;
      current[slot.group][cls]++;
    }
    for(const g of groups){
      planned[g]['合計']=categories.reduce((a,c)=>a+(Number(planned[g][c])||0),0);
      current[g]['合計']=categories.reduce((a,c)=>a+(Number(current[g][c])||0),0);
    }
    planned['總計']={};current['總計']={};
    for(const c of categories){
      planned['總計'][c]=groups.reduce((a,g)=>a+(Number(planned[g][c])||0),0);
      current['總計'][c]=groups.reduce((a,g)=>a+(Number(current[g][c])||0),0);
    }
    planned['總計']['合計']=groups.reduce((a,g)=>a+(Number(planned[g]['合計'])||0),0);
    current['總計']['合計']=groups.reduce((a,g)=>a+(Number(current[g]['合計'])||0),0);

    const staffingCurrent={};
    const occ=occupiedBySlot(state);
    for(const r of semantic?.staffingFields||[]){
      let n=0;
      for(const [slotId,people] of occ){const sm=getSlotMeta(slotId);if(sm?.staffingFieldId===r.fieldId)n+=people.length;}
      staffingCurrent[r.fieldId]=n;
    }
    // 只有人員歸屬/職務異動後才依新規則重算該 profile，未異動 R41 維持 Master 原始統計。
    const dirty=dirtyProfileIds(state);
    const eff=effectiveStaff(state).filter(s=>s.status!=='inactive');
    for(const p of placement?.profiles||[]){
      if(!p.staffingFieldId||!dirty.has(p.id))continue;
      staffingCurrent[p.staffingFieldId]=eff.filter(s=>profileMatches(p,s)&&normalizeKey(s.title)===normalizeKey(p.targetRole)).length;
    }
    return {plan,planned,current,staffingCurrent};
  }
  api.computeSemantic=computeSemantic;

  function formatStaffing(old,plan,current){
    return String(old||'').includes('人(')?`計${plan}人(${current})`:`計${plan}(${current})`;
  }

  function buildValues(state){
    const values={};
    if(state?.meta?.revisionDate)values.revision_date=zhRevisionDate(state.meta.revisionDate);
    const top=state?.meta?.pdfTopSummary||{male:39,female:13,outsource:0};
    const male=Math.max(0,Number(top.male??39)||0),female=Math.max(0,Number(top.female??13)||0),outsource=Math.max(0,Number(top.outsource??0)||0);
    values.top_summary_01=String(male);values.top_summary_02=String(female);values.top_summary_03=String(male+female);values.top_summary_04=String(outsource);values.top_summary_05=String(male+female+outsource);
    if(state?.meta && Object.prototype.hasOwnProperty.call(state.meta,'approvalDate')){
      const d=String(state.meta.approvalDate||'');
      if(d){const m=d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);values.approval_date_text=m?`編制簽准日 ${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日`:`編制簽准日 ${d}`;}
      else values.approval_date_text=String(snapshot?.approval_date_text||'編制簽准日    年  月   日');
    }
    hydrateStaff(state?.staff||[]);

    // Existing person slots.
    for(const [,b] of Object.entries(bindings||{})){
      const s=resolveStaffForBinding(state,b),active=!!s;
      values[b.nameField]=active?String(s.name||''):'';
      if(b.titleField){let title=b.baselinePdfTitle||'';if(active&&s.title&&s.title!==b.baselineAppTitle)title=String(s.title);values[b.titleField]=title;}
      if((b.educationFields||[]).length){
        const education=active?String(s.education||b.baselineEducation||''):'';
        const parts=splitEducation(education,b.baselineEducationLines||[]);
        b.educationFields.forEach((fid,i)=>{values[fid]=active?(parts[i]||''):'';});
      }
      if(b.startField){
        let join='';if(active){join=(!s.joinMonth||s.joinMonth===b.baselineAppJoin)?(b.baselinePdfJoin||s.joinMonth||''):String(s.joinMonth);}values[b.startField]=join;
      }
    }

    const comp=computeSemantic(state);
    // Empty fixed vacancy slots may reuse a static role/title field.
    for(const sm of Object.values(semantic?.slots||{})){
      if(sm.type!=='vacancy-inline'||!sm.titleField)continue;
      const person=activeStaff(state).find(s=>s.pdfSlotId===sm.slotId);
      values[sm.titleField]=person?String(person.title||sm.expectedTitle||snapshot?.[sm.titleField]||''):(snapshot?.[sm.titleField]||'');
    }
    // 28 staffing count fields.
    for(const r of semantic?.staffingFields||[]){
      values[r.fieldId]=formatStaffing(snapshot?.[r.fieldId],comp.plan[r.fieldId],comp.staffingCurrent[r.fieldId]||0);
    }
    // 62 existing bottom-summary fields.
    for(const [fid,r] of Object.entries(semantic?.bottomSummaryFields||{})){
      const p=comp.planned?.[r.group]?.[r.category]??0,c=comp.current?.[r.group]?.[r.category]??0;
      values[fid]=`${p}(${c})`;
    }
    return values;
  }
  api.buildValues=buildValues;

  function changedFields(state){
    const vals=buildValues(state),out=[];
    for(const [fid,val] of Object.entries(vals)){
      const old=String(snapshot?.[fid]??''),neu=String(val??'');
      if(old!==neu&&fieldsById.has(fid))out.push({fieldId:fid,old,newValue:neu,field:fieldsById.get(fid),parent:parentByFieldId.get(fid)});
    }
    return out;
  }
  api.changedFields=changedFields;

  function syntheticItems(state){
    const out=[];
    for(const s of activeStaff(state)){
      const sm=getSlotMeta(s.pdfSlotId);if(!sm||sm.type!=='vacancy-inline')continue;
      const push=(kind,text,box)=>{if(text)out.push({slotId:sm.slotId,kind,text:String(text),box,fontSize:Number(sm.fontSize)||16});};
      push('name',s.name,sm.nameBox);push('education',s.education||'',sm.educationBox);push('start',s.joinMonth||'',sm.startBox);
    }
    return out;
  }
  api.syntheticItems=syntheticItems;

  function placementInfo(item,state){
    if(!item)return {profile:null,slotId:'',lineStyle:'',label:'未判定'};
    hydrateStaff([item]);const p=getProfileForStaff(item);
    const previewState=state?{...state,staff:[...(state.staff||[]).filter(s=>s.id!==item.id),item]}:{staff:[item]};
    const eff=effectiveStaff(previewState).find(s=>s.id===item.id||s.name===item.name)||item;
    const match=!!p&&normalizeKey(item.title)===normalizeKey(p.targetRole);
    return {profile:p,slotId:eff.pdfSlotId||'',lineStyle:p?(match?'solid':'dashed'):'',label:p?(match?'實線｜符合編制目標職務':'虛線｜同區但職務未符合'):'未找到固定編排規則'};
  }
  api.getPlacementInfo=placementInfo;

  function borderOverrides(state){
    const out=[];for(const s of activeStaff(state)){
      if(s.__desiredBorder!=='solid'||!s.pdfSlotId)continue;
      const sm=getSlotMeta(s.pdfSlotId),node=sm?nodesById.get(sm.parentNodeId):null;
      if(node&&node.border!=='solid')out.push({slotId:s.pdfSlotId,bbox:node.bbox,border:'solid'});
    }return out;
  }
  api.borderOverrides=borderOverrides;

  function unsupportedChanges(state){
    const out=[];hydrateStaff(state?.staff||[]);
    const occ=occupiedBySlot(state);
    for(const [slotId,people] of occ){if(people.length>1)out.push(`PDF 顯示槽位「${slotId}」同時指派給 ${people.map(x=>x.name).join('、')}`);}
    for(const s of activeStaff(state)){
      if(!s.pdfSlotId){out.push(`「${s.name}」尚未指定 PDF 固定顯示槽位`);continue;}
      const sm=getSlotMeta(s.pdfSlotId);
      if(!sm){out.push(`「${s.name}」使用未知 PDF 槽位「${s.pdfSlotId}」`);continue;}
      if(sm.type==='vacancy-inline'&&inferSummaryClass(s.title,s.level)!==sm.summaryClass){
        out.push(`「${s.name}」職務分類「${inferSummaryClass(s.title,s.level)}」與空缺槽位「${sm.label}」不一致`);
      }
    }
    return [...new Set(out)];
  }
  api.unsupportedChanges=unsupportedChanges;

  function slotOptions(state,currentStaffId){
    const occ=occupiedBySlot(state),cur=(state?.staff||[]).find(s=>s.id===currentStaffId),currentSlot=cur?.pdfSlotId||'';
    return Object.values(semantic?.slots||{}).map(sm=>{
      const used=(occ.get(sm.slotId)||[]).filter(s=>s.id!==currentStaffId);
      return {...sm,available:used.length===0||sm.slotId===currentSlot,occupiedBy:used.map(s=>s.name)};
    }).sort((a,b)=>String(a.group).localeCompare(String(b.group),'zh-Hant')||String(a.label).localeCompare(String(b.label),'zh-Hant'));
  }
  api.getSlotOptions=slotOptions;

  function suggestSlot(item,state,reserved=new Set()){
    hydrateStaff([item]);const p=getProfileForStaff(item);if(!p)return null;
    const eff=effectiveStaff({...state,staff:[...(state?.staff||[]).filter(s=>s.id!==item.id),item]});
    const s=eff.find(x=>x.id===item.id||x.name===item.name);if(!s?.pdfSlotId||reserved.has(s.pdfSlotId))return null;
    return getSlotMeta(s.pdfSlotId)||{slotId:s.pdfSlotId,label:s.pdfSlotId};
  }
  api.suggestSlot=suggestSlot;

  function getStaffingRows(state){
    const comp=computeSemantic(state);
    return (semantic?.staffingFields||[]).map(r=>({...r,planned:Number(comp.plan[r.fieldId])||0,current:Number(comp.staffingCurrent[r.fieldId])||0}));
  }
  api.getStaffingRows=getStaffingRows;

  function fontString(px){return `${px}px ${CONFIG.fontFamily}`;}
  function patchText(ctx,item,scale){
    const f=item.field,text=String(item.newValue??''),b=f.bbox;
    const x0=Math.floor(b[0]*scale)-1,y0=Math.floor(b[1]*scale)-1,w=Math.ceil((b[2]-b[0])*scale)+2,h=Math.ceil((b[3]-b[1])*scale)+2;
    ctx.save();ctx.fillStyle='#fff';ctx.fillRect(x0,y0,w,h);ctx.restore();if(!text)return;
    let fontPx=Number(f.font_size||18)*scale;ctx.save();ctx.fillStyle='#000';ctx.textBaseline='alphabetic';ctx.font=fontString(fontPx);
    const original=String(item.old||''),oldMeasure=Math.max(1,ctx.measureText(original).width),targetOldWidth=Math.max(1,(b[2]-b[0])*scale);
    let hscale=Math.max(.70,Math.min(1.10,targetOldWidth/oldMeasure)),newWidth=ctx.measureText(text).width*hscale;
    if(item.parent){const maxW=Math.max(12*scale,(item.parent[2]-item.parent[0])*scale-12*scale);if(newWidth>maxW){const factor=maxW/newWidth;fontPx*=factor;ctx.font=fontString(fontPx);newWidth=ctx.measureText(text).width*hscale;}}
    const center=((b[0]+b[2])/2)*scale,x=center-newWidth/2,y=Number(f.origin?.[1]??b[3])*scale;
    ctx.translate(x,y);ctx.scale(hscale,1);ctx.fillText(text,0,0);ctx.restore();
  }
  function drawSynthetic(ctx,item,scale){
    const [x0,y0,x1,y1]=item.box,text=String(item.text||'');if(!text)return;
    let fontPx=(Number(item.fontSize)||16)*scale;ctx.save();ctx.fillStyle='#000';ctx.textBaseline='middle';ctx.textAlign='center';ctx.font=fontString(fontPx);
    const maxW=Math.max(8,(x1-x0-4)*scale),measured=ctx.measureText(text).width;
    if(measured>maxW){fontPx*=Math.max(.62,maxW/measured);ctx.font=fontString(fontPx);}
    ctx.fillText(text,((x0+x1)/2)*scale,((y0+y1)/2)*scale);ctx.restore();
  }

  async function renderCanvas(state,opts={}){
    await init();
    const dpi=Number(opts.dpi||CONFIG.previewDpi),widthPt=fieldMap.page.width_pt,heightPt=fieldMap.page.height_pt;
    const width=Math.round(widthPt*dpi/72),height=Math.round(heightPt*dpi/72),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(masterImage,0,0,width,height);
    if(!opts.masterOnly){const scale=width/widthPt;for(const item of changedFields(state))patchText(ctx,item,scale);for(const item of syntheticItems(state))drawSynthetic(ctx,item,scale);for(const b of borderOverrides(state)){const [x0,y0,x1,y1]=b.bbox;ctx.save();ctx.strokeStyle='#000';ctx.lineWidth=Math.max(1,1.2*scale);ctx.setLineDash([]);ctx.strokeRect(x0*scale,y0*scale,(x1-x0)*scale,(y1-y0)*scale);ctx.restore();}}
    return canvas;
  }
  api.renderCanvas=renderCanvas;

  async function renderPreview(state,targetCanvas,opts={}){
    const c=await renderCanvas(state,{dpi:opts.dpi||CONFIG.previewDpi,masterOnly:!!opts.masterOnly});targetCanvas.width=c.width;targetCanvas.height=c.height;
    targetCanvas.getContext('2d',{alpha:false}).drawImage(c,0,0);
    return {canvas:targetCanvas,changed:changedFields(state),synthetic:syntheticItems(state),borders:borderOverrides(state),unsupported:unsupportedChanges(state),computed:computeSemantic(state)};
  }
  api.renderPreview=renderPreview;

  function makeChangedTextPatch(item,scale=4){
    const f=item.field,text=String(item.newValue??''),b=f.bbox;
    if(!text)return null;
    const measure=document.createElement('canvas').getContext('2d');
    let fontPx=Number(f.font_size||18)*scale;measure.font=fontString(fontPx);
    const original=String(item.old||''),oldMeasure=Math.max(1,measure.measureText(original).width),targetOldWidth=Math.max(1,(b[2]-b[0])*scale);
    let hscale=Math.max(.70,Math.min(1.10,targetOldWidth/oldMeasure)),newWidth=measure.measureText(text).width*hscale;
    if(item.parent){const maxW=Math.max(12*scale,(item.parent[2]-item.parent[0])*scale-12*scale);if(newWidth>maxW){const factor=maxW/newWidth;fontPx*=factor;measure.font=fontString(fontPx);newWidth=measure.measureText(text).width*hscale;}}
    const widthPt=Math.max(b[2]-b[0],newWidth/scale),heightPt=b[3]-b[1];
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(widthPt*scale)+4);canvas.height=Math.max(1,Math.ceil(heightPt*scale)+4);
    const ctx=canvas.getContext('2d',{alpha:true});ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#000';ctx.textBaseline='alphabetic';ctx.font=fontString(fontPx);
    const center=canvas.width/2,baseY=(Number(f.origin?.[1]??b[3])-b[1])*scale+1;
    ctx.save();ctx.translate(center-newWidth/2,baseY);ctx.scale(hscale,1);ctx.fillText(text,0,0);ctx.restore();
    return {canvas,xPt:((b[0]+b[2])/2)-widthPt/2,yTopPt:b[1],widthPt,heightPt};
  }
  function makeSyntheticPatch(item,scale=4){
    const text=String(item.text||'');if(!text)return null;
    const [x0,y0,x1,y1]=item.box,widthPt=x1-x0,heightPt=y1-y0,canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(widthPt*scale));canvas.height=Math.max(1,Math.ceil(heightPt*scale));
    const ctx=canvas.getContext('2d',{alpha:true});ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#000';ctx.textBaseline='middle';ctx.textAlign='center';let fontPx=(Number(item.fontSize)||16)*scale;ctx.font=fontString(fontPx);
    const maxW=Math.max(8,(widthPt-4)*scale),measured=ctx.measureText(text).width;if(measured>maxW){fontPx*=Math.max(.62,maxW/measured);ctx.font=fontString(fontPx);}ctx.fillText(text,canvas.width/2,canvas.height/2);
    return {canvas,xPt:x0,yTopPt:y0,widthPt,heightPt};
  }
  async function exportMasterOverlayPdf(state,filename,changes,synthetic){
    if(!window.PDFLib?.PDFDocument)throw new Error('pdf-lib 元件尚未載入。');
    const r=await fetch(CONFIG.masterPdfUrl,{cache:'no-store'});if(!r.ok)throw new Error('Master PDF 載入失敗');
    const bytes=await r.arrayBuffer(),{PDFDocument,rgb}=window.PDFLib,pdf=await PDFDocument.load(bytes),page=pdf.getPages()[0],pageH=fieldMap.page.height_pt;
    // 只清除原文字 bbox，靜態框線與表格仍保留 Master PDF 向量內容。
    for(const item of changes){const b=item.field.bbox;page.drawRectangle({x:b[0],y:pageH-b[3],width:b[2]-b[0],height:b[3]-b[1],color:rgb(1,1,1),borderWidth:0});}
    for(const item of changes){const patch=makeChangedTextPatch(item,4);if(!patch)continue;const img=await pdf.embedPng(patch.canvas.toDataURL('image/png'));page.drawImage(img,{x:patch.xPt,y:pageH-patch.yTopPt-patch.heightPt,width:patch.widthPt,height:patch.heightPt});}
    for(const item of synthetic){const patch=makeSyntheticPatch(item,4);if(!patch)continue;const img=await pdf.embedPng(patch.canvas.toDataURL('image/png'));page.drawImage(img,{x:patch.xPt,y:pageH-patch.yTopPt-patch.heightPt,width:patch.widthPt,height:patch.heightPt});}
    for(const b of borderOverrides(state)){const [x0,y0,x1,y1]=b.bbox;page.drawRectangle({x:x0,y:pageH-y1,width:x1-x0,height:y1-y0,borderColor:rgb(0,0,0),borderWidth:1.2});}
    const out=await pdf.save({useObjectStreams:false});const blob=new Blob([out],{type:'application/pdf'});
    if(window.saveAs)saveAs(blob,filename);else{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
    return {mode:'dynamic-master-overlay',changed:changes.length+synthetic.length};
  }

  async function exportPdf(state,filename){
    await init();const unsupported=unsupportedChanges(state);if(unsupported.length)throw new Error('目前資料包含尚未能安全輸出的固定槽位問題：\n- '+unsupported.join('\n- '));
    const changes=changedFields(state),synthetic=syntheticItems(state),borders=borderOverrides(state);
    if(changes.length===0&&synthetic.length===0&&borders.length===0){
      const r=await fetch(CONFIG.masterPdfUrl,{cache:'no-store'});if(!r.ok)throw new Error('Master PDF 載入失敗');const blob=await r.blob();
      if(window.saveAs)saveAs(blob,filename);else{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}return {mode:'exact-master',changed:0};
    }
    if(window.PDFLib?.PDFDocument)return exportMasterOverlayPdf(state,filename,changes,synthetic);
    // CDN 暫時無法取得 pdf-lib 時才使用整頁 200 DPI 備援，避免輸出功能完全失效。
    if(!window.jspdf?.jsPDF)throw new Error('PDF 輸出元件尚未載入。');
    const canvas=await renderCanvas(state,{dpi:CONFIG.exportDpi}),mmW=fieldMap.page.width_pt/72*25.4,mmH=fieldMap.page.height_pt/72*25.4,{jsPDF}=window.jspdf;
    const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:[mmW,mmH],compress:true});pdf.addImage(canvas,'PNG',0,0,mmW,mmH,undefined,'FAST');pdf.save(filename);
    return {mode:'dynamic-raster-fallback',changed:changes.length+synthetic.length};
  }
  api.exportPdf=exportPdf;
})();
