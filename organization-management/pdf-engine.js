(function(){
  'use strict';

  const CONFIG = {
    fieldMapUrl: 'data/R41_FieldMap.json?v=20260921-final',
    snapshotUrl: 'data/R41_DataSnapshot.json?v=20260921-final',
    bindingsUrl: 'data/R41_StaffBindings.json?v=20260921-final',
    semanticUrl: 'data/R41_SemanticBindings.json?v=20260922-v9',
    placementUrl: 'data/R41_PlacementRules.json?v=20260922-v9',
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
  function summaryClassForStaff(s){
    const allowed=['經理級','一級主管','二級主管','基層主管','基層人員','事務人員','定期契約人員','培訓人員'];
    return allowed.includes(s?.level)?s.level:inferSummaryClass(s?.title,s?.level);
  }
  api.summaryClassForStaff=summaryClassForStaff;

  function findBindingBySlot(slotId){return Object.values(bindings||{}).find(b=>b.slotId===slotId)||null;}
  function getSlotMeta(slotId){return semantic?.slots?.[slotId]||null;}
  api.getSlotMeta=getSlotMeta;

  function normalizeKey(v){return String(v??'').trim().replace(/\s+/g,' ');}
  function hydrateStaff(staff){
    if(!Array.isArray(staff))return staff;
    const defaults=placement?.baselineStaffProfiles||{};
    const allowedSupervisorRoles=placement?.policy?.supervisorRoles||['無','處長','工安副處長','環保副處長','組長','副組長','儲備主管'];
    for(const s of staff){
      if(!s)continue;
      let b=null;
      if(s.pdfSlotId)b=findBindingBySlot(s.pdfSlotId);
      if(!b&&bindings?.[s.name])b=bindings[s.name];
      if(b){
        if(!s.pdfSlotId)s.pdfSlotId=b.slotId;
        if(!s.education)s.education=b.baselineEducation||'';
      }
      const d=defaults[s.name];
      const schema=Number(s.profileSchemaVersion||0);
      // v3：將舊版混用的單位欄位拆成隸屬單位／業務／轄區／編制目標職務。
      if(d && schema<3){
        s.unit=d.unit||'';s.business=d.business||'';s.jurisdiction=d.jurisdiction||'';s.targetRole=d.targetRole||s.title||'';
        s.level=inferSummaryClass(s.title,s.level);
      }else{
        s.unit=normalizeKey(s.unit);s.business=normalizeKey(s.business);s.jurisdiction=normalizeKey(s.jurisdiction);s.targetRole=normalizeKey(s.targetRole||s.title);
      }
      // v4：主管角色獨立於職務、職務層級。核准 R41 基準人員依固定圖面補上角色。
      if(schema<4){
        s.supervisorRole=normalizeKey(d?.supervisorRole||s.supervisorRole||'無')||'無';
        if(d?.supervisorRole){
          s.unit=normalizeKey(d.unit||s.unit);s.business=normalizeKey(d.business||s.business);s.jurisdiction=normalizeKey(d.jurisdiction||s.jurisdiction);s.targetRole=normalizeKey(d.targetRole||s.targetRole||s.title);if(d.level)s.level=d.level;
          // 主管角色導入後需重新判斷主管位置，尤其儲備主管應改為虛線。
          if(s.layoutDirty==null||s.supervisorRole==='儲備主管')s.layoutDirty=true;
        }
      }else{
        s.supervisorRole=normalizeKey(s.supervisorRole||'無')||'無';
      }
      if(!allowedSupervisorRoles.includes(s.supervisorRole))s.supervisorRole='無';
      s.profileSchemaVersion=4;
      if(s.layoutDirty==null)s.layoutDirty=false;
    }
    return staff;
  }
  api.hydrateStaff=hydrateStaff;

  function dimensionMatches(profile,key,value){
    const opts=profile?.[`${key}Options`];
    if(Array.isArray(opts)&&opts.length)return opts.map(normalizeKey).includes(normalizeKey(value));
    return normalizeKey(profile?.[key])===normalizeKey(value);
  }
  function supervisorRoleOf(s){return normalizeKey(s?.supervisorRole||'無')||'無';}
  function officialSupervisorRoles(){return placement?.policy?.officialSupervisorRoles||['處長','工安副處長','環保副處長','組長','副組長'];}
  function isSupervisorProfile(p){return !!normalizeKey(p?.supervisorRole);}
  function supervisorProfileCandidates(item){
    if(!placement)return [];
    const role=supervisorRoleOf(item),profiles=(placement.profiles||[]).filter(isSupervisorProfile);
    if(role==='無')return [];
    if(role==='儲備主管'){
      const directId=placement?.policy?.reserveSupervisorProfileByUnit?.[normalizeKey(item?.unit)];
      if(directId){const p=profiles.find(x=>x.id===directId);if(p)return [p];}
      let c=profiles.filter(p=>dimensionMatches(p,'unit',item?.unit));
      if(item?.business){const byBusiness=c.filter(p=>dimensionMatches(p,'business',item.business));if(byBusiness.length)c=byBusiness;}
      if(item?.targetRole){const byTarget=c.filter(p=>normalizeKey(p.targetRole)===normalizeKey(item.targetRole));if(byTarget.length)c=byTarget;}
      return c;
    }
    let c=profiles.filter(p=>normalizeKey(p.supervisorRole)===role);
    if(item?.unit){const byUnit=c.filter(p=>dimensionMatches(p,'unit',item.unit));if(!byUnit.length)return [];c=byUnit;}
    if(c.length>1&&item?.business){const byBusiness=c.filter(p=>dimensionMatches(p,'business',item.business));if(byBusiness.length)c=byBusiness;}
    return c;
  }
  function getSupervisorProfileForStaff(s){
    const c=supervisorProfileCandidates(s);if(!c.length)return null;
    if(c.length===1)return c[0];
    const exactTarget=c.find(p=>normalizeKey(p.targetRole)===normalizeKey(s?.targetRole));return exactTarget||null;
  }
  function profileMatches(profile,s){
    const sr=supervisorRoleOf(s);
    if(isSupervisorProfile(profile)){
      if(sr==='無')return false;
      const p=getSupervisorProfileForStaff(s);return !!p&&p.id===profile.id;
    }
    if(sr!=='無')return false;
    return dimensionMatches(profile,'unit',s.unit)
      && dimensionMatches(profile,'business',s.business)
      && dimensionMatches(profile,'jurisdiction',s.jurisdiction)
      && normalizeKey(profile.targetRole)===normalizeKey(s.targetRole);
  }
  function getProfileForStaff(s){
    if(!s||!placement)return null;
    const sr=supervisorRoleOf(s);
    if(sr!=='無')return getSupervisorProfileForStaff(s);
    return (placement.profiles||[]).find(p=>!isSupervisorProfile(p)&&profileMatches(p,s))||null;
  }
  api.getProfileForStaff=getProfileForStaff;
  function profileCandidates(item){
    if(!placement)return [];
    if(supervisorRoleOf(item)!=='無')return supervisorProfileCandidates(item);
    return (placement.profiles||[]).filter(p=>!isSupervisorProfile(p)&&dimensionMatches(p,'unit',item?.unit)&&dimensionMatches(p,'business',item?.business)&&dimensionMatches(p,'jurisdiction',item?.jurisdiction));
  }
  function targetRoleOptions(item){return [...new Set(profileCandidates(item).map(p=>p.targetRole).filter(Boolean))];}
  api.getTargetRoleOptions=targetRoleOptions;
  function suggestTargetRole(item){
    const c=profileCandidates(item);if(!c.length)return '';
    const sr=supervisorRoleOf(item);
    if(sr!=='無'){
      const p=getSupervisorProfileForStaff(item)||c[0];return p?.targetRole||'';
    }
    const current=normalizeKey(item?.targetRole);if(current&&c.some(p=>normalizeKey(p.targetRole)===current))return current;
    const title=normalizeKey(item?.title);const exact=c.find(p=>normalizeKey(p.targetRole)===title);if(exact)return exact.targetRole;
    return c.length===1?c[0].targetRole:'';
  }
  api.suggestTargetRole=suggestTargetRole;
  api.getPlacementSuggestions=()=>placement?.policy||{};
  function isFormalProfileMatch(profile,s){
    if(!profile||!s)return false;
    if(isSupervisorProfile(profile))return supervisorRoleOf(s)===normalizeKey(profile.supervisorRole);
    return normalizeKey(s.title)===normalizeKey(profile.targetRole);
  }
  api.isFormalProfileMatch=isFormalProfileMatch;

  function levelRank(level){const a=placement?.policy?.levelOrder||[];const i=a.indexOf(level);return i<0?999:i;}
  function joinRank(v){const m=String(v||'').match(/^(\d{4})[\/-](\d{1,2})/);return m?Number(m[1])*12+Number(m[2]):999999;}
  function sortPeople(a,b){return levelRank(a.level)-levelRank(b.level)||joinRank(a.joinMonth)-joinRank(b.joinMonth)||String(a.name||'').localeCompare(String(b.name||''),'zh-Hant');}
  function profileRegionLabel(p){return [p?.unit,p?.business,p?.jurisdiction].filter(Boolean).join(' → ');}
  function profileGroup(p){for(const sid of [...(p?.targetSlots||[]),...(p?.otherSlots||[])]){const sm=getSlotMeta(sid);if(sm?.group)return sm.group;}return p?.unit||'';}
  api.getProfileRegionLabel=profileRegionLabel;

  function nodeBoxForSlot(slotId){const sm=getSlotMeta(slotId),node=sm?nodesById.get(sm.parentNodeId):null;return node?.bbox?node.bbox.slice():null;}
  function uniqueBoxesForSlots(slotIds){const seen=new Set(),out=[];for(const sid of slotIds||[]){const sm=getSlotMeta(sid);if(!sm?.parentNodeId||seen.has(sm.parentNodeId))continue;const node=nodesById.get(sm.parentNodeId);if(node?.bbox){seen.add(sm.parentNodeId);out.push({nodeId:sm.parentNodeId,bbox:node.bbox.slice(),border:node.border||'dashed'});}}return out.sort((a,b)=>a.bbox[1]-b.bbox[1]||a.bbox[0]-b.bbox[0]);}
  function dynamicBoxesForProfile(p,count){
    if(count<=0)return [];
    const legacy=uniqueBoxesForSlots(p.otherSlots||[]),anchor=nodeBoxForSlot((p.targetSlots||[])[0]);
    const template=legacy[0]?.bbox||anchor||[0,0,130,110],w=template[2]-template[0],h=template[3]-template[1];
    const baseX=template[0],baseY=legacy[0]?.bbox[1]??((anchor?.[3]||0)+24);
    let step=h+20;if(legacy.length>1){const diffs=[];for(let i=1;i<legacy.length;i++)diffs.push(legacy[i].bbox[1]-legacy[i-1].bbox[1]);diffs.sort((a,b)=>a-b);step=diffs[Math.floor(diffs.length/2)]||step;}
    const bottomLimit=Number(placement?.policy?.dynamicBottomLimitPt)||1655;const perCol=Math.max(1,Math.floor((bottomLimit-h-baseY)/step)+1),pageW=Number(fieldMap?.page?.width_pt)||2976;
    const boxes=[];
    for(let i=0;i<count;i++){
      if(i<legacy.length){boxes.push(legacy[i].bbox.slice());continue;}
      const col=Math.floor(i/perCol),row=i%perCol;let x0=baseX+col*(w+18);if(x0+w>pageW-18)x0=baseX-col*(w+18);const y0=baseY+row*step;boxes.push([x0,y0,x0+w,y0+h]);
    }
    return boxes;
  }

  function effectiveStaff(state){
    const source=hydrateStaff((state?.staff||[]).map(s=>({...s})));
    if(!placement)return source;
    const dirty=new Set();
    for(const s of source){if(!s.layoutDirty)continue;const p=getProfileForStaff(s);if(p)dirty.add(p.id);if(s.previousPlacementProfileId)dirty.add(s.previousPlacementProfileId);}
    if(!dirty.size)return source;
    const profileById=new Map((placement.profiles||[]).map(p=>[p.id,p]));
    for(const pid of dirty){
      const p=profileById.get(pid);if(!p)continue;
      const members=source.filter(s=>s.status!=='inactive'&&profileMatches(p,s)).sort(sortPeople);
      const owned=new Set([...(p.targetSlots||[]),...(p.otherSlots||[])]);
      for(const person of source){if(owned.has(person.pdfSlotId)||members.includes(person)){person.pdfSlotId='';delete person.__dynamicBox;delete person.__desiredBorder;delete person.__placementProfileId;}}
      const matching=members.filter(s=>isFormalProfileMatch(p,s));
      const other=members.filter(s=>!isFormalProfileMatch(p,s));
      const targetSlots=[...(p.targetSlots||[])];
      let ti=0;
      for(const person of matching.slice(0,targetSlots.length)){const slot=targetSlots[ti++];person.pdfSlotId=slot;person.__desiredBorder='solid';person.__placementProfileId=p.id;}
      const secondary=[...matching.slice(targetSlots.length).map(x=>({person:x,border:'solid'})),...other.map(x=>({person:x,border:'dashed'}))].sort((a,b)=>sortPeople(a.person,b.person));
      const boxes=dynamicBoxesForProfile(p,secondary.length);
      secondary.forEach((x,i)=>{x.person.__placementProfileId=p.id;x.person.__desiredBorder=x.border;x.person.__dynamicBox={bbox:boxes[i],border:x.border,profileId:p.id,group:profileGroup(p),regionLabel:[x.person.unit,x.person.business,x.person.jurisdiction].filter(Boolean).join(' → '),order:i};});
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
  function profileForSlot(slotId){return (placement?.profiles||[]).find(p=>[...(p.targetSlots||[]),...(p.otherSlots||[])].includes(slotId))||null;}
  function resolveStaffForBinding(state,b){
    const staff=effectiveStaff(state);
    const bySlot=staff.find(s=>s.pdfSlotId===b.slotId&&s.status!=='inactive');
    if(bySlot)return bySlot;
    const owner=profileForSlot(b.slotId),dirty=dirtyProfileIds(state);
    if(owner&&dirty.has(owner.id))return null;
    const baselinePerson=staff.find(s=>s.name===b.baselineName);
    if(baselinePerson&&!baselinePerson.pdfSlotId&&!baselinePerson.__dynamicBox&&baselinePerson.status!=='inactive')return baselinePerson;
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
      const slot=getSlotMeta(s.pdfSlotId),p=s.__placementProfileId?(placement?.profiles||[]).find(x=>x.id===s.__placementProfileId):getProfileForStaff(s);
      const group=slot?.group||profileGroup(p);if(!group||!current[group])continue;
      const cls=summaryClassForStaff(s);
      if(current[group][cls]==null)current[group][cls]=0;
      current[group][cls]++;
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
      staffingCurrent[p.staffingFieldId]=eff.filter(s=>profileMatches(p,s)&&isFormalProfileMatch(p,s)).length;
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
      if(b.titleField){const owner=profileForSlot(b.slotId);let title=b.baselinePdfTitle||'';if(!owner?.supervisorRole&&active&&s.title&&s.title!==b.baselineAppTitle)title=String(s.title);values[b.titleField]=title;}
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
      const person=activeStaff(state).find(s=>s.pdfSlotId===sm.slotId),owner=profileForSlot(sm.slotId);
      values[sm.titleField]=person?String(owner?.supervisorRole?(sm.expectedTitle||owner.targetRole||snapshot?.[sm.titleField]||''):(person.title||sm.expectedTitle||snapshot?.[sm.titleField]||'')):(snapshot?.[sm.titleField]||'');
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

  function dynamicLayout(state){
    const eff=effectiveStaff(state),dirty=dirtyProfileIds(state),profileById=new Map((placement?.profiles||[]).map(p=>[p.id,p])),boxes=[],clears=[],connectors=[];
    for(const pid of dirty){
      const p=profileById.get(pid);if(!p)continue;
      const legacy=uniqueBoxesForSlots(p.otherSlots||[]),anchor=nodeBoxForSlot((p.targetSlots||[])[0]);
      if(legacy.length){const x0=Math.min(...legacy.map(x=>x.bbox[0]))-3,x1=Math.max(...legacy.map(x=>x.bbox[2]))+3,y1=Math.max(...legacy.map(x=>x.bbox[3]))+4;const y0=(anchor?.[3]??Math.min(...legacy.map(x=>x.bbox[1])))-1;clears.push({profileId:pid,bbox:[x0,y0,x1,y1]});}
      const people=eff.filter(s=>s.status!=='inactive'&&s.__dynamicBox?.profileId===pid).sort((a,b)=>(a.__dynamicBox.order||0)-(b.__dynamicBox.order||0));
      const prevByColumn=new Map();
      for(const person of people){const box=person.__dynamicBox.bbox,cx=(box[0]+box[2])/2,key=Math.round(cx);boxes.push({person,bbox:box,border:person.__dynamicBox.border,profileId:pid,regionLabel:person.__dynamicBox.regionLabel});const prev=prevByColumn.get(key)||anchor;if(prev){connectors.push({profileId:pid,from:[(prev[0]+prev[2])/2,prev[3]],to:[cx,box[1]]});}prevByColumn.set(key,box);}
    }
    return {boxes,clears,connectors};
  }
  api.getDynamicLayout=dynamicLayout;

  function placementInfo(item,state){
    if(!item)return {profile:null,slotId:'',lineStyle:'',label:'未判定'};
    hydrateStaff([item]);const p=getProfileForStaff(item);
    const previewState=state?{...state,staff:[...(state.staff||[]).filter(s=>s.id!==item.id),item]}:{staff:[item]};
    const eff=effectiveStaff(previewState).find(s=>s.id===item.id||s.name===item.name)||item;
    const match=!!p&&isFormalProfileMatch(p,item),sr=supervisorRoleOf(item);
    const label=!p?'尚未對應固定組織區塊':(isSupervisorProfile(p)?(sr==='儲備主管'?'虛線｜儲備主管，未計入正式主管編制':'實線｜正式主管角色'):(match?'實線｜符合編制目標職務':'虛線｜同區但職務未符合'));
    return {profile:p,slotId:eff.pdfSlotId||'',lineStyle:p?(match?'solid':'dashed'):'',regionLabel:p?[item.unit,item.business,item.jurisdiction].filter(Boolean).join(' → '):'',label};
  }
  api.getPlacementInfo=placementInfo;

  function supervisorBoxOverlays(state){
    const eff=effectiveStaff(state).filter(s=>s&&s.status!=='inactive'),out=[];
    for(const p of placement?.profiles||[]){
      const cfg=p.supervisorBox;if(!cfg?.nodeId)continue;
      const node=nodesById.get(cfg.nodeId);if(!node?.bbox)continue;
      const formal=eff.filter(s=>profileMatches(p,s)&&isFormalProfileMatch(p,s)).sort(sortPeople);
      const person=formal[0]||null,planned=Math.max(0,Number(cfg.planned??1)||0),current=formal.length;
      const lines=[...(cfg.fixedLines||[p.supervisorRole||p.targetRole]).filter(Boolean),`計${planned}人(${current})`];
      if(person){lines.push(person.name||'');if(person.education)lines.push(person.education);if(person.joinMonth)lines.push(person.joinMonth);}
      out.push({profileId:p.id,nodeId:cfg.nodeId,bbox:node.bbox.slice(),lines,person,planned,current});
    }
    return out;
  }
  api.getSupervisorBoxOverlays=supervisorBoxOverlays;

  function drawSupervisorBoxCanvas(ctx,item,scale){
    const [x0,y0,x1,y1]=item.bbox,w=(x1-x0)*scale,h=(y1-y0)*scale,pad=Math.max(1.2*scale,2);
    ctx.save();ctx.fillStyle='#fff';ctx.fillRect(x0*scale+pad,y0*scale+pad,Math.max(0,w-2*pad),Math.max(0,h-2*pad));
    ctx.fillStyle='#000';ctx.textAlign='center';ctx.textBaseline='middle';
    const lines=(item.lines||[]).filter(x=>x!==''),lineH=h/(Math.max(1,lines.length)+1);let baseFont=Math.min(18*scale,lineH*.78);
    for(let i=0;i<lines.length;i++){
      let f=baseFont;ctx.font=fontString(f);const maxW=w-10*scale;
      while(ctx.measureText(lines[i]).width>maxW&&f>8.5*scale){f-=.5*scale;ctx.font=fontString(f);}
      ctx.fillText(lines[i],x0*scale+w/2,y0*scale+lineH*(i+1));
    }
    ctx.restore();
  }

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
    for(const s of activeStaff(state)){const p=getProfileForStaff(s);if(!p)out.push(`「${s.name}」尚未對應固定組織區塊（${[s.unit,s.business,s.jurisdiction,s.targetRole,s.supervisorRole&&s.supervisorRole!=='無'?`主管角色:${s.supervisorRole}`:''].filter(Boolean).join('／')}）`);}
    const dyn=dynamicLayout(state);for(const b of dyn.boxes){if(!b.bbox||b.bbox[1]<0||b.bbox[3]>(Number(placement?.policy?.dynamicBottomLimitPt)||1655))out.push(`「${b.person.name}」自動新增的人員框超出可編排範圍，請調整組織版型。`);}
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

  function wrapTextChars(text,maxChars=9){const chars=[...String(text||'')],out=[];for(let i=0;i<chars.length;i+=maxChars)out.push(chars.slice(i,i+maxChars).join(''));return out.slice(0,2);}
  function drawDynamicBoxCanvas(ctx,item,scale){
    const [x0,y0,x1,y1]=item.bbox,w=(x1-x0)*scale,h=(y1-y0)*scale,person=item.person;ctx.save();ctx.fillStyle='#fff';ctx.fillRect(x0*scale,y0*scale,w,h);ctx.strokeStyle='#000';ctx.lineWidth=Math.max(1,1.15*scale);ctx.setLineDash(item.border==='dashed'?[5*scale,3*scale]:[]);ctx.strokeRect(x0*scale,y0*scale,w,h);ctx.setLineDash([]);ctx.fillStyle='#000';ctx.textAlign='center';ctx.textBaseline='middle';
    const lines=[person.title||'',person.name||'',...wrapTextChars(person.education||'',9),person.joinMonth||''].filter(Boolean);const maxLines=Math.max(1,lines.length),lineH=h/(maxLines+1);let fontPx=Math.min(18*scale,lineH*.72);
    for(let i=0;i<lines.length;i++){let f=fontPx;ctx.font=fontString(f);const maxW=w-8*scale;while(ctx.measureText(lines[i]).width>maxW&&f>9*scale){f-=.6*scale;ctx.font=fontString(f);}ctx.fillText(lines[i],x0*scale+w/2,y0*scale+lineH*(i+1));}ctx.restore();
  }
  function drawConnectorCanvas(ctx,c,scale){ctx.save();ctx.strokeStyle='#000';ctx.lineWidth=Math.max(1,1.1*scale);ctx.setLineDash([]);ctx.beginPath();const mx=c.from[0]*scale,my=(c.from[1]+Math.max(8,(c.to[1]-c.from[1])/2))*scale;ctx.moveTo(c.from[0]*scale,c.from[1]*scale);ctx.lineTo(c.from[0]*scale,my);ctx.lineTo(c.to[0]*scale,my);ctx.lineTo(c.to[0]*scale,c.to[1]*scale);ctx.stroke();ctx.restore();}

  async function renderCanvas(state,opts={}){
    await init();
    const dpi=Number(opts.dpi||CONFIG.previewDpi),widthPt=fieldMap.page.width_pt,heightPt=fieldMap.page.height_pt;
    const width=Math.round(widthPt*dpi/72),height=Math.round(heightPt*dpi/72),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(masterImage,0,0,width,height);
    if(!opts.masterOnly){const scale=width/widthPt,dyn=dynamicLayout(state);for(const c of dyn.clears){const [x0,y0,x1,y1]=c.bbox;ctx.save();ctx.fillStyle='#fff';ctx.fillRect(x0*scale,y0*scale,(x1-x0)*scale,(y1-y0)*scale);ctx.restore();}for(const item of changedFields(state))patchText(ctx,item,scale);for(const item of syntheticItems(state))drawSynthetic(ctx,item,scale);for(const item of supervisorBoxOverlays(state))drawSupervisorBoxCanvas(ctx,item,scale);for(const c of dyn.connectors)drawConnectorCanvas(ctx,c,scale);for(const b of dyn.boxes)drawDynamicBoxCanvas(ctx,b,scale);for(const b of borderOverrides(state)){const [x0,y0,x1,y1]=b.bbox;ctx.save();ctx.strokeStyle='#000';ctx.lineWidth=Math.max(1,1.2*scale);ctx.setLineDash([]);ctx.strokeRect(x0*scale,y0*scale,(x1-x0)*scale,(y1-y0)*scale);ctx.restore();}}
    return canvas;
  }
  api.renderCanvas=renderCanvas;

  async function renderPreview(state,targetCanvas,opts={}){
    const c=await renderCanvas(state,{dpi:opts.dpi||CONFIG.previewDpi,masterOnly:!!opts.masterOnly});targetCanvas.width=c.width;targetCanvas.height=c.height;
    targetCanvas.getContext('2d',{alpha:false}).drawImage(c,0,0);
    return {canvas:targetCanvas,changed:changedFields(state),synthetic:syntheticItems(state),supervisorBoxes:supervisorBoxOverlays(state),dynamic:dynamicLayout(state),borders:borderOverrides(state),unsupported:unsupportedChanges(state),computed:computeSemantic(state)};
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
  function makeDynamicBoxPatch(item,scale=4){
    const [x0,y0,x1,y1]=item.bbox,w=x1-x0,h=y1-y0,canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(w*scale));canvas.height=Math.max(1,Math.ceil(h*scale));const ctx=canvas.getContext('2d',{alpha:true});ctx.clearRect(0,0,canvas.width,canvas.height);
    const shifted={...item,bbox:[0,0,w,h]};drawDynamicBoxCanvas(ctx,shifted,scale);return {canvas,xPt:x0,yTopPt:y0,widthPt:w,heightPt:h};
  }
  function makeSupervisorBoxPatch(item,scale=4){
    const [x0,y0,x1,y1]=item.bbox,w=x1-x0,h=y1-y0,canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(w*scale));canvas.height=Math.max(1,Math.ceil(h*scale));const ctx=canvas.getContext('2d',{alpha:true});ctx.clearRect(0,0,canvas.width,canvas.height);
    const shifted={...item,bbox:[0,0,w,h]};drawSupervisorBoxCanvas(ctx,shifted,scale);return {canvas,xPt:x0,yTopPt:y0,widthPt:w,heightPt:h};
  }
  async function exportMasterOverlayPdf(state,filename,changes,synthetic){
    if(!window.PDFLib?.PDFDocument)throw new Error('pdf-lib 元件尚未載入。');
    const r=await fetch(CONFIG.masterPdfUrl,{cache:'no-store'});if(!r.ok)throw new Error('Master PDF 載入失敗');
    const bytes=await r.arrayBuffer(),{PDFDocument,rgb}=window.PDFLib,pdf=await PDFDocument.load(bytes),page=pdf.getPages()[0],pageH=fieldMap.page.height_pt,dyn=dynamicLayout(state);
    // 固定組織/業務/轄區不動；只有 dirty profile 的舊人員區塊清除後依資料重排。
    for(const c of dyn.clears){const b=c.bbox;page.drawRectangle({x:b[0],y:pageH-b[3],width:b[2]-b[0],height:b[3]-b[1],color:rgb(1,1,1),borderWidth:0});}
    // 只清除原文字 bbox，靜態框線與表格仍保留 Master PDF 向量內容。
    for(const item of changes){const b=item.field.bbox;page.drawRectangle({x:b[0],y:pageH-b[3],width:b[2]-b[0],height:b[3]-b[1],color:rgb(1,1,1),borderWidth:0});}
    for(const item of changes){const patch=makeChangedTextPatch(item,4);if(!patch)continue;const img=await pdf.embedPng(patch.canvas.toDataURL('image/png'));page.drawImage(img,{x:patch.xPt,y:pageH-patch.yTopPt-patch.heightPt,width:patch.widthPt,height:patch.heightPt});}
    for(const item of synthetic){const patch=makeSyntheticPatch(item,4);if(!patch)continue;const img=await pdf.embedPng(patch.canvas.toDataURL('image/png'));page.drawImage(img,{x:patch.xPt,y:pageH-patch.yTopPt-patch.heightPt,width:patch.widthPt,height:patch.heightPt});}
    for(const item of supervisorBoxOverlays(state)){const patch=makeSupervisorBoxPatch(item,4);if(!patch)continue;const img=await pdf.embedPng(patch.canvas.toDataURL('image/png'));page.drawImage(img,{x:patch.xPt,y:pageH-patch.yTopPt-patch.heightPt,width:patch.widthPt,height:patch.heightPt});}
    for(const c of dyn.connectors){const midY=c.from[1]+Math.max(8,(c.to[1]-c.from[1])/2);const points=[[c.from[0],c.from[1]],[c.from[0],midY],[c.to[0],midY],[c.to[0],c.to[1]]];for(let i=1;i<points.length;i++)page.drawLine({start:{x:points[i-1][0],y:pageH-points[i-1][1]},end:{x:points[i][0],y:pageH-points[i][1]},thickness:1,color:rgb(0,0,0)});}
    for(const item of dyn.boxes){const patch=makeDynamicBoxPatch(item,4);const img=await pdf.embedPng(patch.canvas.toDataURL('image/png'));page.drawImage(img,{x:patch.xPt,y:pageH-patch.yTopPt-patch.heightPt,width:patch.widthPt,height:patch.heightPt});}
    for(const b of borderOverrides(state)){const [x0,y0,x1,y1]=b.bbox;page.drawRectangle({x:x0,y:pageH-y1,width:x1-x0,height:y1-y0,borderColor:rgb(0,0,0),borderWidth:1.2});}
    const out=await pdf.save({useObjectStreams:false});const blob=new Blob([out],{type:'application/pdf'});
    if(window.saveAs)saveAs(blob,filename);else{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
    return {mode:'dynamic-master-overlay',changed:changes.length+synthetic.length+supervisorBoxOverlays(state).length+dyn.boxes.length};
  }

  async function exportPdf(state,filename){
    await init();const unsupported=unsupportedChanges(state);if(unsupported.length)throw new Error('目前資料包含尚未能安全輸出的組織區塊編排問題：\n- '+unsupported.join('\n- '));
    const changes=changedFields(state),synthetic=syntheticItems(state),supervisorBoxes=supervisorBoxOverlays(state),dyn=dynamicLayout(state),borders=borderOverrides(state);
    if(changes.length===0&&synthetic.length===0&&supervisorBoxes.length===0&&dyn.boxes.length===0&&dyn.clears.length===0&&borders.length===0){
      const r=await fetch(CONFIG.masterPdfUrl,{cache:'no-store'});if(!r.ok)throw new Error('Master PDF 載入失敗');const blob=await r.blob();
      if(window.saveAs)saveAs(blob,filename);else{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}return {mode:'exact-master',changed:0};
    }
    if(window.PDFLib?.PDFDocument)return exportMasterOverlayPdf(state,filename,changes,synthetic);
    // CDN 暫時無法取得 pdf-lib 時才使用整頁 200 DPI 備援，避免輸出功能完全失效。
    if(!window.jspdf?.jsPDF)throw new Error('PDF 輸出元件尚未載入。');
    const canvas=await renderCanvas(state,{dpi:CONFIG.exportDpi}),mmW=fieldMap.page.width_pt/72*25.4,mmH=fieldMap.page.height_pt/72*25.4,{jsPDF}=window.jspdf;
    const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:[mmW,mmH],compress:true});pdf.addImage(canvas,'PNG',0,0,mmW,mmH,undefined,'FAST');pdf.save(filename);
    return {mode:'dynamic-raster-fallback',changed:changes.length+synthetic.length+supervisorBoxes.length+dyn.boxes.length};
  }
  api.exportPdf=exportPdf;
})();
