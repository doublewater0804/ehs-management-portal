(function(){
  'use strict';

  const CONFIG = {
    fieldMapUrl: 'data/R41_FieldMap.json?v=20260921-final',
    snapshotUrl: 'data/R41_DataSnapshot.json?v=20260921-final',
    bindingsUrl: 'data/R41_StaffBindings.json?v=20260921-final',
    semanticUrl: 'data/R41_SemanticBindings.json?v=20260924-v20',
    placementUrl: 'data/R41_PlacementRules.json?v=20260924-v20',
    layoutGridUrl: 'data/R41_LayoutGrid.json?v=20260924-v20',
    masterImageUrl: 'assets/R41_Master_200dpi.png?v=20260921-final',
    masterPdfUrl: 'assets/R41_Master_Template.pdf?v=20260921-final',
    previewDpi: 100,
    exportDpi: 200,
    fontFamily: '"DFKai-SB","BiauKai","標楷體","KaiTi",serif'
  };

  const api = { ready:false, error:'', CONFIG };
  window.EHSMasterPdf = api;

  let fieldMap=null, snapshot=null, bindings=null, semantic=null, placement=null, layoutGrid=null, masterImage=null;
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
      jsonFetch(CONFIG.fieldMapUrl),jsonFetch(CONFIG.snapshotUrl),jsonFetch(CONFIG.bindingsUrl),jsonFetch(CONFIG.semanticUrl),jsonFetch(CONFIG.placementUrl),jsonFetch(CONFIG.layoutGridUrl),loadImage(CONFIG.masterImageUrl)
    ]).then(([fm,ss,bd,se,pl,lg,img])=>{
      fieldMap=fm;snapshot=ss.fields||ss;bindings=bd.bindings||bd;semantic=se;placement=pl;layoutGrid=lg;masterImage=img;
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

  function layoutStyle(){return placement?.policy?.layoutBoxStyle||{};}
  function boxCenter(b){return b?[(b[0]+b[2])/2,(b[1]+b[3])/2]:[0,0];}
  function resizeBoxAroundCenter(b,w,h,topOverride=null){
    if(!b)return null;const cx=(b[0]+b[2])/2,cy=(b[1]+b[3])/2,y0=topOverride==null?cy-h/2:topOverride;return [cx-w/2,y0,cx+w/2,y0+h];
  }
  function nodeBoxForSlotRaw(slotId){const sm=getSlotMeta(slotId),node=sm?nodesById.get(sm.parentNodeId):null;return node?.bbox?node.bbox.slice():null;}
  function gridEntry(profileOrId){const id=typeof profileOrId==='string'?profileOrId:profileOrId?.id;return id?layoutGrid?.profiles?.[id]||null:null;}
  function gridAnchorBox(p){const g=gridEntry(p);if(g?.anchorBbox?.length===4)return g.anchorBbox.slice();const raw=nodeBoxForSlotRaw((p?.targetSlots||[])[0]);return raw?raw.slice():null;}
  function standardPersonBox(raw){const st=layoutStyle(),w=Number(st.personWidthPt)||138,h=Number(st.personHeightPt)||110;return resizeBoxAroundCenter(raw,w,h);}
  function standardJobBox(raw){const st=layoutStyle(),w=Number(st.jobWidthPt)||138,h=Number(st.jobHeightPt)||126;return resizeBoxAroundCenter(raw,w,h);}
  function standardSupervisorBox(raw,role){
    if(!raw)return null;if(!['組長','副組長'].includes(normalizeKey(role)))return raw.slice();
    const st=layoutStyle(),w=Number(st.supervisorWidthPt)||140,h=Number(st.supervisorHeightPt)||110;return resizeBoxAroundCenter(raw,w,h);
  }
  function profileAnchorBox(p){
    const g=gridEntry(p);if(g?.anchorBbox?.length===4)return g.anchorBbox.slice();
    const raw=nodeBoxForSlotRaw((p?.targetSlots||[])[0]);if(!raw)return null;
    if(isSupervisorProfile(p))return standardSupervisorBox(raw,p.supervisorRole);
    if(p?.staffingFieldId&&(p.targetSlots||[]).length===1)return standardJobBox(raw);
    return raw.slice();
  }
  function horizontalOverlap(a,b,pad=0){return !!a&&!!b&&Math.min(a[2]+pad,b[2]+pad)>Math.max(a[0]-pad,b[0]-pad);}
  function profileDynamicBottomLimit(p){
    // v12: 動態人員的垂直容量先以真正的單頁安全底線為準。
    // 不再因「下方存在另一個固定框」就預先截斷可用高度；
    // 真正是否碰撞改由 unsupportedChanges() 以實際矩形交疊判斷。
    const g=gridEntry(p),explicit=Number(g?.dynamicZone?.bottomY);
    if(Number.isFinite(explicit)&&explicit>0)return explicit;
    return Number(placement?.policy?.dynamicBottomLimitPt)||1655;
  }
  api.getProfileDynamicBottomLimit=profileDynamicBottomLimit;
  function nodeBoxForSlot(slotId){return nodeBoxForSlotRaw(slotId);}
  function uniqueBoxesForSlots(slotIds){
    const seen=new Set(),out=[];
    for(const sid of slotIds||[]){const sm=getSlotMeta(sid);if(!sm?.parentNodeId||seen.has(sm.parentNodeId))continue;const node=nodesById.get(sm.parentNodeId);if(node?.bbox){seen.add(sm.parentNodeId);out.push({nodeId:sm.parentNodeId,bbox:node.bbox.slice(),border:node.border||'dashed'});}}
    return out.sort((a,b)=>a.bbox[1]-b.bbox[1]||a.bbox[0]-b.bbox[0]);
  }
  function localGridForProfile(p){
    const g=gridEntry(p),id=g?.localGridId;return id?layoutGrid?.localGrids?.[id]||null:null;
  }
  function fixedSuccessorProfile(p){
    const id=gridEntry(p)?.fixedSuccessorProfileId;return id?(placement?.profiles||[]).find(x=>x.id===id)||null:null;
  }
  function shiftBoxY(b,dy=0){return b&&Number.isFinite(Number(dy))?[b[0],b[1]+Number(dy),b[2],b[3]+Number(dy)]:b?.slice()||null;}
  function reserveBoxForProfile(p){
    const ge=gridEntry(p)||{},raw=p?.reserveSlotId?nodeBoxForSlotRaw(p.reserveSlotId):null;if(!raw)return null;
    const st=layoutStyle(),w=Number(ge.reserveWidthPt)||Number(st.personWidthPt)||138,h=Number(ge.reserveHeightPt)||Number(st.personHeightPt)||126;
    const cx=Number.isFinite(Number(ge.reserveCenterX))?Number(ge.reserveCenterX):((raw[0]+raw[2])/2),top=Number(ge.reserveRowTop);
    return Number.isFinite(top)?[cx-w/2,top,cx+w/2,top+h]:resizeBoxAroundCenter(raw,w,h);
  }
  function profileShiftMap(state,effOverride=null){
    const profiles=placement?.profiles||[],eff=effOverride||effectiveStaff(state),shifts=new Map(profiles.map(p=>[p.id,0]));
    const gapDefault=Number(layoutStyle().personGapPt)||18;
    // fixedSuccessor 形成單向階層。先算各分支所需 Y，再讓同 successorSyncGroup 的下一層共用最大 Y，維持同排對齊。
    for(let pass=0;pass<Math.max(4,profiles.length);pass++){
      let changed=false;const requests=[];
      for(const p of profiles){
        const succ=fixedSuccessorProfile(p);if(!succ)continue;
        // v18：Bottom Anchor 節點（例如定期契約人員）不得再被上方人員一路往下推；
        // 上方動態列必須在自己的 dynamicZone 內消化，真的放不下才由 Preflight 報容量不足。
        if(gridEntry(succ)?.bottomAnchor?.enabled)continue;
        const pd=Number(shifts.get(p.id)||0),sd=Number(shifts.get(succ.id)||0),pa=shiftBoxY(profileAnchorBox(p),pd),sb=profileAnchorBox(succ);if(!pa||!sb)continue;
        let occupied=pa[3];
        for(const person of eff){if(person?.status==='inactive'||person?.__dynamicBox?.profileId!==p.id||!person.__dynamicBox.bbox)continue;occupied=Math.max(occupied,person.__dynamicBox.bbox[3]+pd);}
        const gap=Number(gridEntry(p)?.successorGapPt)||gapDefault,minTop=occupied+gap,currentTop=sb[1]+sd,requiredTop=Math.max(currentTop,minTop),syncGroup=normalizeKey(gridEntry(p)?.successorSyncGroup||'');
        requests.push({p,succ,sb,sd,requiredTop,syncGroup});
      }
      const groupTop=new Map();
      for(const r of requests){if(!r.syncGroup)continue;groupTop.set(r.syncGroup,Math.max(groupTop.get(r.syncGroup)||-Infinity,r.requiredTop));}
      for(const r of requests){const targetTop=r.syncGroup?Math.max(r.requiredTop,groupTop.get(r.syncGroup)||r.requiredTop):r.requiredTop,next=Math.max(r.sd,targetTop-r.sb[1]);if(next>r.sd+.05){shifts.set(r.succ.id,next);changed=true;}}
      if(!changed)break;
    }
    return shifts;
  }
  function effectiveProfileAnchorBox(p,shifts){return shiftBoxY(profileAnchorBox(p),Number(shifts?.get(p?.id)||0));}
  function dynamicBoxesForProfile(p,count,opts={}){
    const result=[];if(count<=0)return result;
    const st=layoutStyle(),anchor=profileAnchorBox(p);if(!anchor)return result;
    const ge=gridEntry(p)||{},grid=localGridForProfile(p);
    const h=Number(ge.personHeightPt)||Number(grid?.personHeightPt)||Number(st.personHeightPt)||110,w=Number(ge.personWidthPt)||Number(grid?.personWidthPt)||Number(st.personWidthPt)||138,minStartGap=Number(st.localGridMinStartGapPt)||14,minGap=Number(st.personMinGapPt)||8;
    const cx=Number(ge.centerX)||((anchor[0]+anchor[2])/2),baseX=cx-w/2;
    const afterBottom=Number(opts?.afterBox?.[3]);
    const startAfter=(Number.isFinite(afterBottom)?afterBottom:anchor[3])+minStartGap;
    const configuredRows=(Array.isArray(ge.dynamicRowTops)&&ge.dynamicRowTops.length?ge.dynamicRowTops:(grid?.rowTops||[]));
    let rows=configuredRows.map(Number).filter(Number.isFinite).filter(y=>y+0.01>=startAfter);
    const step=Number(ge.dynamicRowStep)||Number(grid?.rowStep)||Math.max(h+18,128),zoneBottom=Number(ge?.dynamicZone?.bottomY);

    // v18：先使用既有 Local Grid；若最後一列會侵入下方 Bottom Anchor 安全區，
    // 就在不改框高的前提下，把 Row gap 壓縮到最小值。仍放不下時保留最小 gap，交由 Preflight 報告。
    if(Number.isFinite(zoneBottom)&&count>0){
      const candidate=rows.slice(0,count),candidateFits=candidate.length===count&&candidate[count-1]+h<=zoneBottom+.01;
      if(!candidateFits){
        const preferredGap=Math.max(minGap,step-h),available=Math.max(0,zoneBottom-startAfter-count*h);
        const gap=count<=1?0:Math.max(minGap,Math.min(preferredGap,available/(count-1)));
        rows=Array.from({length:count},(_,i)=>startAfter+i*(h+gap));
      }
    }

    let y=rows.length?rows[rows.length-1]:Math.max(startAfter,anchor[3]+18);
    while(rows.length<count){y=(rows.length?rows[rows.length-1]:y)+step;rows.push(y);}
    for(let i=0;i<count;i++){const top=rows[i];result.push([baseX,top,baseX+w,top+h]);}
    return result;
  }

  function effectiveStaff(state){
    const source=hydrateStaff((state?.staff||[]).map(s=>({...s})));
    if(!placement)return source;
    const dirty=new Set(),normalizeAll=!!placement?.policy?.normalizeLayoutAlways;
    if(normalizeAll)for(const p of placement.profiles||[])dirty.add(p.id);
    for(const s of source){if(!s.layoutDirty&&!normalizeAll)continue;const p=getProfileForStaff(s);if(p)dirty.add(p.id);if(s.previousPlacementProfileId)dirty.add(s.previousPlacementProfileId);}
    if(!dirty.size)return source;
    const profileById=new Map((placement.profiles||[]).map(p=>[p.id,p]));
    for(const pid of dirty){
      const p=profileById.get(pid);if(!p)continue;
      const members=source.filter(s=>s.status!=='inactive'&&profileMatches(p,s)).sort(sortPeople);
      const owned=new Set([...(p.targetSlots||[]),...(p.otherSlots||[])]);
      for(const person of source){if(owned.has(person.pdfSlotId)||members.includes(person)){person.pdfSlotId='';delete person.__dynamicBox;delete person.__desiredBorder;delete person.__placementProfileId;}}
      const matching=members.filter(s=>isFormalProfileMatch(p,s)),other=members.filter(s=>!isFormalProfileMatch(p,s)),targetSlots=[...(p.targetSlots||[])];
      let ti=0;
      for(const person of matching.slice(0,targetSlots.length)){const slot=targetSlots[ti++];person.pdfSlotId=slot;person.__desiredBorder='solid';person.__placementProfileId=p.id;}
      const secondary=[...matching.slice(targetSlots.length).map(x=>({person:x,border:'solid'})),...other.map(x=>({person:x,border:'dashed'}))].sort((a,b)=>sortPeople(a.person,b.person));
      const reserveFixed=(p.reserveSlotId&&secondary.length&&supervisorRoleOf(secondary[0].person)==='儲備主管')?reserveBoxForProfile(p):null;
      const dynamicCount=secondary.length-(reserveFixed?1:0),normalBoxes=dynamicBoxesForProfile(p,dynamicCount,{afterBox:reserveFixed});let di=0;
      secondary.forEach((x,i)=>{
        const fixedReserve=!!reserveFixed&&i===0,bbox=fixedReserve?reserveFixed:(normalBoxes[di++]||null);
        x.person.__placementProfileId=p.id;x.person.__desiredBorder=x.border;x.person.__dynamicBox={bbox,border:x.border,profileId:p.id,group:profileGroup(p),regionLabel:[x.person.unit,x.person.business,x.person.jurisdiction].filter(Boolean).join(' → '),order:i,limitY:fixedReserve?bbox?.[3]:profileDynamicBottomLimit(p),fixedReserve,sourceSlotId:fixedReserve?p.reserveSlotId:''};
      });
    }
    return source;
  }
  api.getEffectiveStaff=effectiveStaff;
  function dirtyProfileIds(state){
    const out=new Set();hydrateStaff(state?.staff||[]);if(placement?.policy?.normalizeLayoutAlways)for(const p of placement.profiles||[])out.add(p.id);
    for(const s of state?.staff||[]){if(!s?.layoutDirty)continue;const p=getProfileForStaff(s);if(p)out.add(p.id);if(s.previousPlacementProfileId)out.add(s.previousPlacementProfileId);}return out;
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

  function bottomSummaryGridItems(state){
    const map=semantic?.bottomSummaryFields||{},ids=Object.keys(map);if(!ids.length)return [];
    const vals=buildValues(state),hasChange=ids.some(fid=>String(vals[fid]??'')!==String(snapshot?.[fid]??''));
    if(!hasChange)return [];
    const configured=layoutGrid?.statisticsGrid?.rowCenters||{};
    return ids.map(fid=>{
      const field=fieldsById.get(fid),meta=map[fid];if(!field||!meta)return null;
      const raw=field.bbox.slice(),h=raw[3]-raw[1],cy=Number(configured[meta.category]);
      const centerY=Number.isFinite(cy)?cy:(raw[1]+raw[3])/2,bbox=[raw[0],centerY-h/2,raw[2],centerY+h/2];
      return {fieldId:fid,field,meta,rawBbox:raw,bbox,text:String(vals[fid]??''),old:String(snapshot?.[fid]??'')};
    }).filter(Boolean);
  }
  api.getBottomSummaryGridItems=bottomSummaryGridItems;

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
    const eff=effectiveStaff(state),shifts=profileShiftMap(state,eff),dirty=dirtyProfileIds(state),profileById=new Map((placement.profiles||[]).map(p=>[p.id,p])),boxes=[],clears=[],connectors=[],connectorClears=[];
    const half=Number(layoutStyle().connectorClearHalfWidthPt)||5;
    const corridor=(x,y0,y1,extra=0)=>{
      if(!Number.isFinite(x)||!Number.isFinite(y0)||!Number.isFinite(y1)||Math.abs(y1-y0)<.2)return;
      connectorClears.push({bbox:[x-half-extra,Math.min(y0,y1)-1.5,x+half+extra,Math.max(y0,y1)+1.5]});
    };
    const rawCenter=b=>b?(b[0]+b[2])/2:NaN;
    for(const pid of dirty){
      const p=profileById.get(pid);if(!p)continue;
      const g=gridEntry(p)||{},legacy=uniqueBoxesForSlots(p.otherSlots||[]),reserveLegacy=p.reserveSlotId?uniqueBoxesForSlots([p.reserveSlotId]):[],anchor=effectiveProfileAnchorBox(p,shifts),rawAnchor=nodeBoxForSlotRaw((p.targetSlots||[])[0]);
      const people=eff.filter(s=>s.status!=='inactive'&&s.__dynamicBox?.profileId===pid).sort((a,b)=>(a.__dynamicBox.order||0)-(b.__dynamicBox.order||0));
      const succ=fixedSuccessorProfile(p),succBox=succ?effectiveProfileAnchorBox(succ,shifts):null,succRaw=succ?nodeBoxForSlotRaw((succ.targetSlots||[])[0]):null;
      const legacySorted=[...legacy,...reserveLegacy].sort((a,b)=>a.bbox[1]-b.bbox[1]);
      // 舊的人員框由動態排版接管：先完整清掉框本身。
      for(const item of legacySorted){const r=item.bbox;clears.push({profileId:pid,bbox:[r[0]-2,r[1]-2,r[2]+2,r[3]+2]});}

      // 主編制框以下的人員線由單一 Connector Engine 接管。
      // 清除 Master 舊中心線時，同時清 raw center 與 normalized center，避免位移後形成雙線/短殘線。
      const rawCx=rawCenter(rawAnchor),newCx=rawCenter(anchor);
      const branchOwned=people.length>0||legacySorted.length>0||!!succBox||!!g.clearTailBelowAnchor;
      if(branchOwned&&anchor){
        let endY=anchor[3];
        if(legacySorted.length)endY=Math.max(endY,...legacySorted.map(x=>x.bbox[3]));
        if(succRaw)endY=Math.max(endY,succRaw[1]);
        if(succBox)endY=Math.max(endY,succBox[1]);
        if(people.length){const pdy=Number(shifts.get(pid)||0);endY=Math.max(endY,...people.map(x=>(x.__dynamicBox?.bbox?.[3]||0)+pdy));}
        const tail=Number(g.clearTailToY);if(g.clearTailBelowAnchor&&Number.isFinite(tail))endY=Math.max(endY,tail);
        corridor(rawCx,rawAnchor?.[3]??anchor[3],endY,1);
        if(Number.isFinite(newCx)&&Math.abs(newCx-rawCx)>.2)corridor(newCx,anchor[3],endY,1);
        // 若固定下一主框的 raw/new center 不同，也清掉其舊進線中心，後面只畫一次新線。
        if(succRaw&&succBox){const sxRaw=rawCenter(succRaw),sxNew=rawCenter(succBox);corridor(sxRaw,Math.min(rawAnchor?.[3]??anchor[3],succRaw[1]),succRaw[1],1);if(Math.abs(sxNew-sxRaw)>.2)corridor(sxNew,Math.min(anchor[3],succBox[1]),succBox[1],1);}
      }

      let prev=anchor;const pShift=Number(shifts.get(pid)||0);
      for(const person of people){
        const box=shiftBoxY(person.__dynamicBox?.bbox,pShift);if(!box)continue;const pcx=rawCenter(box);
        boxes.push({person,bbox:box,border:person.__dynamicBox.border,profileId:pid,regionLabel:person.__dynamicBox.regionLabel,limitY:person.__dynamicBox.limitY,localGridId:g.localGridId||''});
        if(prev){const fx=rawCenter(prev),fy=prev[3],ty=box[1];connectors.push({profileId:pid,from:[fx,fy],to:[pcx,ty],kind:'person'});}
        prev=box;
      }
      // 固定主框永遠不進動態 Grid；若有固定下一主框，無論中間有沒有人，都由本引擎畫唯一一條實際連線。
      if(succBox&&prev){const fx=rawCenter(prev),fy=prev[3],tx=rawCenter(succBox),ty=succBox[1];connectors.push({profileId:pid,from:[fx,fy],to:[tx,ty],kind:'fixed-successor',targetProfileId:succ.id});}
      // 沒有實際下一框時不畫任何尾線；clearTailBelowAnchor 只負責清除 Master 懸空線。
    }

    // v18：多子框分支由單一 Connector Engine 接管。
    // 先把父框底部到子框頂部之間 Master 舊線完整清掉，再只畫一條中央主幹＋一條水平母線＋子支線。
    for(const bg of (layoutGrid?.branchGroups||[])){
      const parent=(placement?.profiles||[]).find(p=>p.id===bg.parentProfileId);if(!parent)continue;
      const parentDyn=boxes.filter(b=>b.profileId===parent.id).sort((a,b)=>a.bbox[1]-b.bbox[1]);
      const parentBox=(bg.parentSource==='last-dynamic-or-anchor'&&parentDyn.length)?parentDyn[parentDyn.length-1].bbox:effectiveProfileAnchorBox(parent,shifts);
      const childBoxes=(bg.childProfileIds||[]).map(id=>{const p=(placement?.profiles||[]).find(x=>x.id===id);const b=p?effectiveProfileAnchorBox(p,shifts):null;return p&&b?{profile:p,bbox:b}:null;}).filter(Boolean);
      if(!parentBox||childBoxes.length<2)continue;
      const pcx=rawCenter(parentBox),pBottom=parentBox[3],childTop=Math.min(...childBoxes.map(x=>x.bbox[1])),childXs=childBoxes.map(x=>rawCenter(x.bbox));
      if(childTop<=pBottom+2)continue;
      const branchY=pBottom+(childTop-pBottom)/2;
      // v20：清除整個舊分支走廊，不只中心線範圍。避免父框下方殘留 L 型／短折線。
      const minX=Math.min(parentBox[0],...childBoxes.map(x=>x.bbox[0])),maxX=Math.max(parentBox[2],...childBoxes.map(x=>x.bbox[2]));
      if(bg.clearMasterBranch!==false)connectorClears.push({bbox:[minX-8,pBottom+.6,maxX+8,childTop-.6]});
      connectors.push({kind:'branch',profileId:parent.id,from:[pcx,pBottom],branchY,children:childBoxes.map(x=>({profileId:x.profile.id,to:[rawCenter(x.bbox),x.bbox[1]]}))});
    }
    return {boxes,clears,connectors,connectorClears};
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
    const eff=effectiveStaff(state).filter(s=>s&&s.status!=='inactive'),shifts=profileShiftMap(state,eff),vals=currentFieldValues(state),out=[];
    for(const p of placement?.profiles||[]){
      if(!isSupervisorProfile(p)||(p.targetSlots||[]).length!==1)continue;
      const sid=p.targetSlots[0],sm=getSlotMeta(sid),cfg=p.supervisorBox||null,nodeId=cfg?.nodeId||sm?.parentNodeId,node=nodesById.get(nodeId);if(!node?.bbox)continue;
      const formal=eff.filter(s=>profileMatches(p,s)&&isFormalProfileMatch(p,s)).sort(sortPeople),person=formal[0]||null;
      let planned=1;if(p.staffingFieldId){planned=Number(planMap(state)[p.staffingFieldId]??1)||0;}else if(cfg&&cfg.planned!=null){planned=Math.max(0,Number(cfg.planned)||0);}const current=formal.length;
      let lines=[];
      if(cfg?.fixedLines?.length){lines=[...cfg.fixedLines,`計${planned}人(${current})`];if(person){if(person.name)lines.push(person.name);if(person.education)lines.push(person.education);if(person.joinMonth)lines.push(person.joinMonth);}}
      else{lines=(node.lines||[]).slice().sort((a,b)=>(a.bbox?.[1]||0)-(b.bbox?.[1]||0)).map(f=>String(vals[f.field_id]??'')).filter(Boolean);if(!lines.length)lines=[p.supervisorRole||p.targetRole,`計${planned}人(${current})`];}
      const g=gridEntry(p),bbox=effectiveProfileAnchorBox(p,shifts)||standardSupervisorBox(node.bbox,p.supervisorRole);
      const incomingManaged=(placement?.profiles||[]).some(q=>gridEntry(q)?.fixedSuccessorProfileId===p.id);const bridgeTop=!incomingManaged,bridgeBottom=!!gridEntry(p)?.preserveBottomBridge;out.push({profileId:p.id,nodeId,rawBbox:node.bbox.slice(),bbox,lines,person,planned,current,role:p.supervisorRole,bridgeTop,bridgeBottom});
    }
    return out;
  }

  api.getSupervisorBoxOverlays=supervisorBoxOverlays;

  function unionBbox(a,b,pad=3){if(!a)return b?.slice();if(!b)return a?.slice();return [Math.min(a[0],b[0])-pad,Math.min(a[1],b[1])-pad,Math.max(a[2],b[2])+pad,Math.max(a[3],b[3])+pad];}
  function currentFieldValues(state){return {...(snapshot||{}),...buildValues(state)};}
  function fixedJobBoxOverlays(state){
    if(!placement?.policy?.layoutNormalization)return [];
    const vals=currentFieldValues(state),eff=effectiveStaff(state).filter(s=>s&&s.status!=='inactive'),shifts=profileShiftMap(state,eff),out=[];
    for(const p of placement?.profiles||[]){
      const slots=p.targetSlots||[],g=gridEntry(p)||{};
      if(isSupervisorProfile(p)||p.suppressFixedOverlay||!p.staffingFieldId||!slots.length||(slots.length!==1&&!g.relativeFixedNode))continue;
      const sid=slots[0],sm=getSlotMeta(sid),node=sm?nodesById.get(sm.parentNodeId):null;if(!node?.bbox)continue;
      const raw=node.bbox.slice(),bbox=effectiveProfileAnchorBox(p,shifts)||standardJobBox(raw),lines=(node.lines||[]).slice().sort((a,b)=>(a.bbox?.[1]||0)-(b.bbox?.[1]||0)).map(f=>String(vals[f.field_id]??'')).filter(Boolean);
      const person=slots.length===1?(eff.find(s=>s.pdfSlotId===sid)||null):null,binding=slots.length===1?findBindingBySlot(sid):null;
      if(person&&!binding){if(person.name)lines.push(person.name);if(person.education)lines.push(person.education);if(person.joinMonth)lines.push(person.joinMonth);}
      const incomingManaged=(placement?.profiles||[]).some(q=>gridEntry(q)?.fixedSuccessorProfileId===p.id);
      const bridgeTop=!incomingManaged,bridgeBottom=!!g.preserveBottomBridge;
      const clearBboxes=[];clearBboxes.push([raw[0]-.8,raw[1]-.8,raw[2]+.8,raw[3]+.8]);
      if(Math.abs(raw[0]-bbox[0])>.2||Math.abs(raw[1]-bbox[1])>.2||Math.abs(raw[2]-bbox[2])>.2||Math.abs(raw[3]-bbox[3])>.2)clearBboxes.push([bbox[0]-.8,bbox[1]-.8,bbox[2]+.8,bbox[3]+.8]);
      out.push({profileId:p.id,nodeId:node.node_id,slotId:sid,rawBbox:raw,bbox,clearBboxes,lines,person,bridgeTop,bridgeBottom,compactText:Number(g.compactHeightPt)>0});
    }
    return out;
  }
  api.getFixedJobBoxOverlays=fixedJobBoxOverlays;

  // v20: moved / resized fixed nodes (notably 定期契約人員) own their text completely.
  // Their raw-position field patches must not be redrawn after the original node has been cleared.
  function fixedOverlayFieldIds(jobBoxes=[],supervisorBoxes=[]){
    const ids=new Set();
    for(const item of [...(jobBoxes||[]),...(supervisorBoxes||[])]){
      const node=nodesById.get(item?.nodeId);
      for(const f of (node?.lines||[]))if(f?.field_id)ids.add(f.field_id);
    }
    return ids;
  }

  function statisticsMasterLines(){
    return layoutGrid?.statisticsGrid?.redrawMasterLines===false?[]:(layoutGrid?.statisticsGrid?.masterLines||[]);
  }
  function drawStatisticsGridCanvas(ctx,scale){
    const lines=statisticsMasterLines();if(!lines.length)return;
    ctx.save();ctx.strokeStyle='#000';ctx.setLineDash([]);
    for(const l of lines){
      ctx.lineWidth=Math.max(1,(Number(l.width)||.72)*scale);ctx.beginPath();ctx.moveTo(Number(l.x1)*scale,Number(l.y1)*scale);ctx.lineTo(Number(l.x2)*scale,Number(l.y2)*scale);ctx.stroke();
    }
    ctx.restore();
  }

  function drawUniformBoxCanvas(ctx,item,scale,border='solid'){
    const [x0,y0,x1,y1]=item.bbox,w=(x1-x0)*scale,h=(y1-y0)*scale,st=layoutStyle(),minFont=(Number(st.minFontPt)||9)*scale;
    ctx.save();ctx.fillStyle='#fff';ctx.fillRect(x0*scale,y0*scale,w,h);ctx.strokeStyle='#000';ctx.lineWidth=Math.max(1,1.15*scale);ctx.setLineDash(border==='dashed'?[5*scale,3*scale]:[]);ctx.strokeRect(x0*scale,y0*scale,w,h);ctx.setLineDash([]);ctx.fillStyle='#000';ctx.textAlign='center';ctx.textBaseline='middle';
    const rawLines=(item.lines||[]).filter(x=>String(x||'').trim()!=='');const lines=[];
    for(const txt of rawLines){const chunks=wrapTextChars(txt,10);for(const c of chunks)lines.push(c);}
    const maxLines=Math.max(1,lines.length),compact=!!item.compactText;
    const lineH=compact?(h/Math.max(1,maxLines+.15)):(h/(maxLines+1));
    const topOffset=compact?Math.max(7*scale,(h-(lineH*(maxLines-1)))/2):lineH;
    let fontPx=Math.min(18*scale,lineH*(compact ? .86 : .74));
    for(let i=0;i<lines.length;i++){let f=fontPx;ctx.font=fontString(f);const maxW=w-10*scale;while(ctx.measureText(lines[i]).width>maxW&&f>minFont){f-=.5*scale;ctx.font=fontString(f);}const y=compact?(y0*scale+topOffset+lineH*i):(y0*scale+lineH*(i+1));ctx.fillText(lines[i],x0*scale+w/2,y);}
    ctx.restore();
  }

  function drawSupervisorBoxCanvas(ctx,item,scale){drawUniformBoxCanvas(ctx,item,scale,'solid');}


  function borderOverrides(state){
    if(placement?.policy?.layoutNormalization)return [];
    const out=[];for(const s of activeStaff(state)){
      if(s.__desiredBorder!=='solid'||!s.pdfSlotId)continue;
      const sm=getSlotMeta(s.pdfSlotId),node=sm?nodesById.get(sm.parentNodeId):null;
      if(node&&node.border!=='solid')out.push({slotId:s.pdfSlotId,bbox:node.bbox,border:'solid'});
    }return out;
  }
  api.borderOverrides=borderOverrides;

  function rectOverlap(a,b,pad=0){
    if(!a||!b)return false;
    return Math.min(a[2]-pad,b[2]-pad)>Math.max(a[0]+pad,b[0]+pad)
      && Math.min(a[3]-pad,b[3]-pad)>Math.max(a[1]+pad,b[1]+pad);
  }
  function segmentIntersectsRect(c,b,pad=0){
    if(!c||!b)return false;const x1=c.from[0],y1=c.from[1],x2=c.to[0],y2=c.to[1];
    if(Math.abs(x1-x2)<2){const x=(x1+x2)/2,minY=Math.min(y1,y2),maxY=Math.max(y1,y2);return x>b[0]+pad&&x<b[2]-pad&&maxY>b[1]+pad&&minY<b[3]-pad;}
    return false;
  }
  function unsupportedChanges(state){
    const out=[];hydrateStaff(state?.staff||[]);
    for(const s of activeStaff(state)){const p=getProfileForStaff(s);if(!p)out.push(`「${s.name}」尚未對應固定組織區塊（${[s.unit,s.business,s.jurisdiction,s.targetRole,s.supervisorRole&&s.supervisorRole!=='無'?`主管角色:${s.supervisorRole}`:''].filter(Boolean).join('／')}）`);}
    const effForPreflight=effectiveStaff(state),shifts=profileShiftMap(state,effForPreflight),dyn=dynamicLayout(state),pageLimit=Number(placement?.policy?.dynamicBottomLimitPt)||1655,fixed=[];
    for(const q of placement?.profiles||[]){const qb=effectiveProfileAnchorBox(q,shifts);if(qb)fixed.push({profile:q,bbox:qb,label:[profileRegionLabel(q),q.targetRole||q.supervisorRole].filter(Boolean).join(' → ')||q.id});}
    const collisionPad=Number(layoutStyle().actualCollisionPadPt)||2,connectorPad=Number(layoutStyle().connectorCollisionPadPt)||1.5,overflowMsg=placement?.policy?.overflowMessage||'本區人數已超出單頁可編排容量，請調整組織版型。';
    const badProfiles=new Set();
    // 相對下移的固定 successor 也必須留在底部統計安全線之上。
    for(const x of fixed){const dy=Number(shifts.get(x.profile.id)||0);if(dy>.05&&x.bbox[3]>pageLimit){out.push(`固定區塊「${x.label}」因上方人員增加已超出單頁可編排容量，請調整該區版面。`);badProfiles.add(x.profile.id);}}
    // Preflight 1：所有動態框完成後一次檢查固定框、頁面安全線。
    for(const b of dyn.boxes){
      if(!b.bbox||b.bbox[1]<0||b.bbox[3]>pageLimit){out.push(`「${b.person.name}」${overflowMsg}`);badProfiles.add(b.profileId);continue;}
      const owner=(placement?.profiles||[]).find(p=>p.id===b.profileId),exempt=new Set(gridEntry(owner)?.collisionExemptProfileIds||[]);const hit=fixed.find(x=>x.profile.id!==b.profileId&&!exempt.has(x.profile.id)&&rectOverlap(b.bbox,x.bbox,collisionPad));
      if(hit){out.push(`「${b.person.name}」的人員框會與固定區塊「${hit.label}」重疊，請調整該區版面。`);badProfiles.add(b.profileId);}
    }
    // Preflight 2：動態框彼此不得重疊。
    for(let i=0;i<dyn.boxes.length;i++)for(let j=i+1;j<dyn.boxes.length;j++){const a=dyn.boxes[i],b=dyn.boxes[j];if(a.profileId!==b.profileId&&rectOverlap(a.bbox,b.bbox,collisionPad))out.push(`「${a.person.name}」與「${b.person.name}」的人員框會互相重疊，請調整該區版面。`);}
    // Preflight 3：中心連線不可穿越不屬於該分支的固定框（端點目標除外）。
    for(const c of dyn.connectors||[]){if(badProfiles.has(c.profileId)||c.kind==='branch')continue;const owner=(placement?.profiles||[]).find(p=>p.id===c.profileId),exempt=new Set(gridEntry(owner)?.collisionExemptProfileIds||[]);const hit=fixed.find(x=>x.profile.id!==c.profileId&&x.profile.id!==c.targetProfileId&&!exempt.has(x.profile.id)&&segmentIntersectsRect(c,x.bbox,connectorPad));if(hit)out.push(`「${profileRegionLabel((placement?.profiles||[]).find(p=>p.id===c.profileId))||c.profileId}」的連線會穿越固定區塊「${hit.label}」，請調整該區版面。`);}
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

  function wrapTextChars(text,maxChars=9){const chars=[...String(text||'')],out=[];for(let i=0;i<chars.length;i+=maxChars)out.push(chars.slice(i,i+maxChars).join(''));return out.length?out:[''];}
  function drawStatisticsCellCanvas(ctx,item,scale){
    const [x0,y0,x1,y1]=item.bbox,text=String(item.text||''),f=item.field||{},w=(x1-x0)*scale,h=(y1-y0)*scale;if(!text)return;
    ctx.save();ctx.fillStyle='#000';ctx.textAlign='center';ctx.textBaseline='middle';let fontPx=(Number(f.font_size)||18)*scale;ctx.font=fontString(fontPx);
    const maxW=Math.max(8,w-3*scale),measured=ctx.measureText(text).width;if(measured>maxW){fontPx*=Math.max(.72,maxW/measured);ctx.font=fontString(fontPx);}ctx.fillText(text,(x0+x1)/2*scale,(y0+y1)/2*scale);ctx.restore();
  }
  function drawDynamicBoxCanvas(ctx,item,scale){
    const person=item.person||{},lines=[person.title||'',person.name||'',person.education||'',person.joinMonth||''].filter(Boolean);drawUniformBoxCanvas(ctx,{...item,lines},scale,item.border||'solid');
  }
  function drawConnectorCanvas(ctx,c,scale){
    ctx.save();ctx.strokeStyle='#000';ctx.lineWidth=Math.max(1,1.1*scale);ctx.setLineDash([]);ctx.beginPath();
    if(c.kind==='branch'&&Array.isArray(c.children)&&c.children.length){
      const fx=c.from[0]*scale,fy=c.from[1]*scale,my=Number(c.branchY)*scale,xs=c.children.map(ch=>ch.to[0]*scale);
      ctx.moveTo(fx,fy);ctx.lineTo(fx,my);ctx.moveTo(Math.min(fx,...xs),my);ctx.lineTo(Math.max(fx,...xs),my);
      for(const ch of c.children){const tx=ch.to[0]*scale,ty=ch.to[1]*scale;ctx.moveTo(tx,my);ctx.lineTo(tx,ty);}ctx.stroke();ctx.restore();return;
    }
    const fx=c.from[0]*scale,fy=c.from[1]*scale,tx=c.to[0]*scale,ty=c.to[1]*scale;ctx.moveTo(fx,fy);
    if(Math.abs(c.from[0]-c.to[0])<2){ctx.lineTo(tx,ty);}else{const my=(c.from[1]+Math.max(8,(c.to[1]-c.from[1])/2))*scale;ctx.lineTo(fx,my);ctx.lineTo(tx,my);ctx.lineTo(tx,ty);}ctx.stroke();ctx.restore();
  }
  function clearCanvasBbox(ctx,b,scale){if(!b)return;ctx.save();ctx.fillStyle='#fff';ctx.fillRect(b[0]*scale,b[1]*scale,(b[2]-b[0])*scale,(b[3]-b[1])*scale);ctx.restore();}
  function drawBoxBridgeCanvas(ctx,item,scale){
    if(!item?.rawBbox||!item?.bbox)return;const r=item.rawBbox,b=item.bbox,cx=(r[0]+r[2])/2;ctx.save();ctx.strokeStyle='#000';ctx.lineWidth=Math.max(1,1.05*scale);ctx.setLineDash([]);ctx.beginPath();
    // 只補上方進線。下方出線由「實際存在的下一框」或 Master 固定骨架負責，避免懸空尾線。
    if(item.bridgeTop!==false&&Math.abs(r[1]-b[1])>.5){ctx.moveTo(cx*scale,r[1]*scale);ctx.lineTo(cx*scale,b[1]*scale);}if(item.bridgeBottom&&Math.abs(r[3]-b[3])>.5){ctx.moveTo(cx*scale,b[3]*scale);ctx.lineTo(cx*scale,r[3]*scale);}ctx.stroke();ctx.restore();
  }

  async function renderCanvas(state,opts={}){
    await init();
    const dpi=Number(opts.dpi||CONFIG.previewDpi),widthPt=fieldMap.page.width_pt,heightPt=fieldMap.page.height_pt;
    const width=Math.round(widthPt*dpi/72),height=Math.round(heightPt*dpi/72),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(masterImage,0,0,width,height);
    if(!opts.masterOnly){
      const scale=width/widthPt,dyn=dynamicLayout(state),jobs=fixedJobBoxOverlays(state),sup=supervisorBoxOverlays(state),stats=bottomSummaryGridItems(state),statIds=new Set(stats.map(x=>x.fieldId)),fixedIds=fixedOverlayFieldIds(jobs,sup),changes=changedFields(state).filter(x=>!statIds.has(x.fieldId)&&!fixedIds.has(x.fieldId));
      for(const c of dyn.clears)clearCanvasBbox(ctx,c.bbox,scale);for(const c of dyn.connectorClears||[])clearCanvasBbox(ctx,c.bbox,scale);
      for(const st of stats){clearCanvasBbox(ctx,st.rawBbox,scale);if(Math.abs(st.rawBbox[1]-st.bbox[1])>.2)clearCanvasBbox(ctx,st.bbox,scale);}
      for(const item of changes)patchText(ctx,item,scale);for(const st of stats)drawStatisticsCellCanvas(ctx,st,scale);for(const item of syntheticItems(state))drawSynthetic(ctx,item,scale);
      for(const item of jobs)for(const b of (item.clearBboxes||[item.clearBbox]).filter(Boolean))clearCanvasBbox(ctx,b,scale);for(const item of sup)clearCanvasBbox(ctx,unionBbox(item.rawBbox,item.bbox,1),scale);
      for(const item of jobs){drawBoxBridgeCanvas(ctx,item,scale);drawUniformBoxCanvas(ctx,item,scale,'solid');}
      for(const item of sup){drawBoxBridgeCanvas(ctx,item,scale);drawSupervisorBoxCanvas(ctx,item,scale);}
      for(const c of dyn.connectors)drawConnectorCanvas(ctx,c,scale);for(const b of dyn.boxes)drawDynamicBoxCanvas(ctx,b,scale);
      for(const b of borderOverrides(state)){const [x0,y0,x1,y1]=b.bbox;ctx.save();ctx.strokeStyle='#000';ctx.lineWidth=Math.max(1,1.2*scale);ctx.setLineDash([]);ctx.strokeRect(x0*scale,y0*scale,(x1-x0)*scale,(y1-y0)*scale);ctx.restore();}
      // v20：所有統計數值與其他 overlay 完成後，最後重畫 Master 統計表格線。
      if(stats.length)drawStatisticsGridCanvas(ctx,scale);
    }
    return canvas;
  }


  api.renderCanvas=renderCanvas;

  async function renderPreview(state,targetCanvas,opts={}){
    const c=await renderCanvas(state,{dpi:opts.dpi||CONFIG.previewDpi,masterOnly:!!opts.masterOnly});targetCanvas.width=c.width;targetCanvas.height=c.height;
    targetCanvas.getContext('2d',{alpha:false}).drawImage(c,0,0);
    return {canvas:targetCanvas,changed:changedFields(state),statisticsGrid:bottomSummaryGridItems(state),synthetic:syntheticItems(state),fixedJobBoxes:fixedJobBoxOverlays(state),supervisorBoxes:supervisorBoxOverlays(state),dynamic:dynamicLayout(state),borders:borderOverrides(state),unsupported:unsupportedChanges(state),computed:computeSemantic(state)};
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
  function makeStatisticsPatch(item,scale=4){
    const [x0,y0,x1,y1]=item.bbox,widthPt=x1-x0,heightPt=y1-y0,text=String(item.text||''),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(widthPt*scale));canvas.height=Math.max(1,Math.ceil(heightPt*scale));
    const ctx=canvas.getContext('2d',{alpha:true});ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#000';ctx.textBaseline='middle';ctx.textAlign='center';let fontPx=(Number(item.field?.font_size)||18)*scale;ctx.font=fontString(fontPx);
    const maxW=Math.max(8,canvas.width-3*scale),measured=ctx.measureText(text).width;if(measured>maxW){fontPx*=Math.max(.72,maxW/measured);ctx.font=fontString(fontPx);}ctx.fillText(text,canvas.width/2,canvas.height/2);
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
  function makeUniformBoxPatch(item,scale=4,border='solid'){
    const [x0,y0,x1,y1]=item.bbox,w=x1-x0,h=y1-y0,canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(w*scale));canvas.height=Math.max(1,Math.ceil(h*scale));const ctx=canvas.getContext('2d',{alpha:true});ctx.clearRect(0,0,canvas.width,canvas.height);
    const shifted={...item,bbox:[0,0,w,h]};drawUniformBoxCanvas(ctx,shifted,scale,border);return {canvas,xPt:x0,yTopPt:y0,widthPt:w,heightPt:h};
  }
  async function exportMasterOverlayPdf(state,filename,changes,synthetic,statistics){
    if(!window.PDFLib?.PDFDocument)throw new Error('pdf-lib 元件尚未載入。');
    const r=await fetch(CONFIG.masterPdfUrl,{cache:'no-store'});if(!r.ok)throw new Error('Master PDF 載入失敗');
    const bytes=await r.arrayBuffer(),{PDFDocument,rgb}=window.PDFLib,pdf=await PDFDocument.load(bytes),page=pdf.getPages()[0],pageH=fieldMap.page.height_pt,dyn=dynamicLayout(state),jobs=fixedJobBoxOverlays(state),sup=supervisorBoxOverlays(state);
    const clearRect=b=>page.drawRectangle({x:b[0],y:pageH-b[3],width:b[2]-b[0],height:b[3]-b[1],color:rgb(1,1,1),borderWidth:0});
    for(const c of dyn.clears)clearRect(c.bbox);for(const c of dyn.connectorClears||[])clearRect(c.bbox);
    for(const item of changes)clearRect(item.field.bbox);
    for(const st of (statistics||[])){clearRect(st.rawBbox);if(Math.abs(st.rawBbox[1]-st.bbox[1])>.2)clearRect(st.bbox);}
    for(const item of jobs)for(const b of (item.clearBboxes||[item.clearBbox]).filter(Boolean))clearRect(b);for(const item of sup)clearRect(unionBbox(item.rawBbox,item.bbox,1));
    for(const item of changes){const patch=makeChangedTextPatch(item,4);if(!patch)continue;const img=await pdf.embedPng(patch.canvas.toDataURL('image/png'));page.drawImage(img,{x:patch.xPt,y:pageH-patch.yTopPt-patch.heightPt,width:patch.widthPt,height:patch.heightPt});}
    for(const st of (statistics||[])){const patch=makeStatisticsPatch(st,4);if(!patch)continue;const img=await pdf.embedPng(patch.canvas.toDataURL('image/png'));page.drawImage(img,{x:patch.xPt,y:pageH-patch.yTopPt-patch.heightPt,width:patch.widthPt,height:patch.heightPt});}
    for(const item of synthetic){const patch=makeSyntheticPatch(item,4);if(!patch)continue;const img=await pdf.embedPng(patch.canvas.toDataURL('image/png'));page.drawImage(img,{x:patch.xPt,y:pageH-patch.yTopPt-patch.heightPt,width:patch.widthPt,height:patch.heightPt});}
    const drawBridge=item=>{if(!item?.rawBbox||!item?.bbox)return;const rr=item.rawBbox,bb=item.bbox,cx=(rr[0]+rr[2])/2;if(item.bridgeTop!==false&&Math.abs(rr[1]-bb[1])>.5)page.drawLine({start:{x:cx,y:pageH-rr[1]},end:{x:cx,y:pageH-bb[1]},thickness:1,color:rgb(0,0,0)});if(item.bridgeBottom&&Math.abs(rr[3]-bb[3])>.5)page.drawLine({start:{x:cx,y:pageH-bb[3]},end:{x:cx,y:pageH-rr[3]},thickness:1,color:rgb(0,0,0)});};
    for(const item of jobs){drawBridge(item);const patch=makeUniformBoxPatch(item,4,'solid'),img=await pdf.embedPng(patch.canvas.toDataURL('image/png'));page.drawImage(img,{x:patch.xPt,y:pageH-patch.yTopPt-patch.heightPt,width:patch.widthPt,height:patch.heightPt});}
    for(const item of sup){drawBridge(item);const patch=makeSupervisorBoxPatch(item,4);if(!patch)continue;const img=await pdf.embedPng(patch.canvas.toDataURL('image/png'));page.drawImage(img,{x:patch.xPt,y:pageH-patch.yTopPt-patch.heightPt,width:patch.widthPt,height:patch.heightPt});}
    for(const c of dyn.connectors){
      if(c.kind==='branch'&&Array.isArray(c.children)&&c.children.length){
        const xs=c.children.map(ch=>ch.to[0]),minX=Math.min(c.from[0],...xs),maxX=Math.max(c.from[0],...xs),my=Number(c.branchY);
        page.drawLine({start:{x:c.from[0],y:pageH-c.from[1]},end:{x:c.from[0],y:pageH-my},thickness:1,color:rgb(0,0,0)});
        page.drawLine({start:{x:minX,y:pageH-my},end:{x:maxX,y:pageH-my},thickness:1,color:rgb(0,0,0)});
        for(const ch of c.children)page.drawLine({start:{x:ch.to[0],y:pageH-my},end:{x:ch.to[0],y:pageH-ch.to[1]},thickness:1,color:rgb(0,0,0)});
        continue;
      }
      if(Math.abs(c.from[0]-c.to[0])<2){page.drawLine({start:{x:c.from[0],y:pageH-c.from[1]},end:{x:c.to[0],y:pageH-c.to[1]},thickness:1,color:rgb(0,0,0)});continue;}
      const midY=c.from[1]+Math.max(8,(c.to[1]-c.from[1])/2),points=[[c.from[0],c.from[1]],[c.from[0],midY],[c.to[0],midY],[c.to[0],c.to[1]]];for(let i=1;i<points.length;i++)page.drawLine({start:{x:points[i-1][0],y:pageH-points[i-1][1]},end:{x:points[i][0],y:pageH-points[i][1]},thickness:1,color:rgb(0,0,0)});
    }
    for(const item of dyn.boxes){const patch=makeDynamicBoxPatch(item,4),img=await pdf.embedPng(patch.canvas.toDataURL('image/png'));page.drawImage(img,{x:patch.xPt,y:pageH-patch.yTopPt-patch.heightPt,width:patch.widthPt,height:patch.heightPt});}
    for(const b of borderOverrides(state)){const [x0,y0,x1,y1]=b.bbox;page.drawRectangle({x:x0,y:pageH-y1,width:x1-x0,height:y1-y0,borderColor:rgb(0,0,0),borderWidth:1.2});}
    // v20：統計文字白底清除可能蓋到原格線；最後依 Master 向量線完整重畫。
    if((statistics||[]).length){for(const l of statisticsMasterLines())page.drawLine({start:{x:Number(l.x1),y:pageH-Number(l.y1)},end:{x:Number(l.x2),y:pageH-Number(l.y2)},thickness:Number(l.width)||.72,color:rgb(0,0,0)});}
    const out=await pdf.save({useObjectStreams:false}),blob=new Blob([out],{type:'application/pdf'});
    if(window.saveAs)saveAs(blob,filename);else{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
    return {mode:'normalized-layout-master-overlay',changed:changes.length+(statistics||[]).length+synthetic.length+jobs.length+sup.length+dyn.boxes.length};
  }


  async function exportPdf(state,filename){
    await init();const unsupported=unsupportedChanges(state);if(unsupported.length)throw new Error('目前資料包含尚未能安全輸出的組織區塊編排問題：\n- '+unsupported.join('\n- '));
    const statistics=bottomSummaryGridItems(state),statIds=new Set(statistics.map(x=>x.fieldId)),jobBoxes=fixedJobBoxOverlays(state),supervisorBoxes=supervisorBoxOverlays(state),fixedIds=fixedOverlayFieldIds(jobBoxes,supervisorBoxes),changes=changedFields(state).filter(x=>!statIds.has(x.fieldId)&&!fixedIds.has(x.fieldId)),synthetic=syntheticItems(state),dyn=dynamicLayout(state),borders=borderOverrides(state);
    if(changes.length===0&&statistics.length===0&&synthetic.length===0&&jobBoxes.length===0&&supervisorBoxes.length===0&&dyn.boxes.length===0&&dyn.clears.length===0&&borders.length===0){
      const r=await fetch(CONFIG.masterPdfUrl,{cache:'no-store'});if(!r.ok)throw new Error('Master PDF 載入失敗');const blob=await r.blob();
      if(window.saveAs)saveAs(blob,filename);else{const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}return {mode:'exact-master',changed:0};
    }
    if(window.PDFLib?.PDFDocument)return exportMasterOverlayPdf(state,filename,changes,synthetic,statistics);
    // CDN 暫時無法取得 pdf-lib 時才使用整頁 200 DPI 備援，避免輸出功能完全失效。
    if(!window.jspdf?.jsPDF)throw new Error('PDF 輸出元件尚未載入。');
    const canvas=await renderCanvas(state,{dpi:CONFIG.exportDpi}),mmW=fieldMap.page.width_pt/72*25.4,mmH=fieldMap.page.height_pt/72*25.4,{jsPDF}=window.jspdf;
    const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:[mmW,mmH],compress:true});pdf.addImage(canvas,'PNG',0,0,mmW,mmH,undefined,'FAST');pdf.save(filename);
    return {mode:'dynamic-raster-fallback',changed:changes.length+statistics.length+synthetic.length+jobBoxes.length+supervisorBoxes.length+dyn.boxes.length};
  }
  api.exportPdf=exportPdf;
})();
