from pathlib import Path
p=Path('project/index.html')
s=p.read_text(encoding='utf-8')

def rep(old,new,label):
    global s
    if old not in s:
        raise SystemExit(f'{label}: target not found')
    s=s.replace(old,new,1)

# 1) master data: add progress types and remove hard-coded constant
rep("""      permitCategories: [
        { id:'AIR', label:'空污', active:true, order:1, color:'#64748b' },
        { id:'WATER', label:'廢水', active:true, order:2, color:'#0284c7' },
        { id:'WASTE', label:'廢棄物', active:true, order:3, color:'#b45309' }
      ]
    });

    const PROGRESS_TYPES = ['工作日報','電話確認','Notes','公文','會議','現場確認','待辦事項','主管指示','其他'];""",
"""      permitCategories: [
        { id:'AIR', label:'空污', active:true, order:1, color:'#64748b' },
        { id:'WATER', label:'廢水', active:true, order:2, color:'#0284c7' },
        { id:'WASTE', label:'廢棄物', active:true, order:3, color:'#b45309' }
      ],
      progressTypes: [
        { id:'WORK_LOG', label:'工作日報', active:true, order:1, color:'#2563eb' },
        { id:'PHONE', label:'電話確認', active:true, order:2, color:'#0f766e' },
        { id:'NOTES', label:'Notes', active:true, order:3, color:'#64748b' },
        { id:'DOCUMENT', label:'公文', active:true, order:4, color:'#7c3aed' },
        { id:'MEETING', label:'會議', active:true, order:5, color:'#9333ea' },
        { id:'ONSITE', label:'現場確認', active:true, order:6, color:'#ea580c' },
        { id:'TODO', label:'待辦事項', active:true, order:7, color:'#d97706' },
        { id:'SUPERVISOR', label:'主管指示', active:true, order:8, color:'#dc2626' },
        { id:'OTHER', label:'其他', active:true, order:9, color:'#475569' }
      ]
    });""",'progress master defaults')

# 2) normalize logs with stable typeId
rep("""      type:String(r?.type || '工作日報').trim() || '工作日報',
      content:String(r?.content || ''),""",
"""      typeId:String(r?.typeId || ''),
      type:String(r?.type || '工作日報').trim() || '工作日報',
      content:String(r?.content || ''),""",'log typeId')

# 3) state and memos
rep("""      const [logDraft, setLogDraft] = useState({ id:null, date:today(), person:'', type:'工作日報', customType:'', progress:0, content:'' });""",
"""      const [logDraft, setLogDraft] = useState({ id:null, date:today(), person:'', typeId:'WORK_LOG', customType:'', progress:0, content:'' });""",'draft state')
rep("""      const permitCategories = useMemo(() => normalizeItems(master.permitCategories, DEFAULT_MASTER.permitCategories), [master.permitCategories]);
      const typeMap = useMemo(() => Object.fromEntries(projectTypes.map(x => [x.id, x])), [projectTypes]);
      const factoryMap = useMemo(() => Object.fromEntries(factories.map(x => [x.id, x])), [factories]);
      const permitMap = useMemo(() => Object.fromEntries(permitCategories.map(x => [x.id, x])), [permitCategories]);""",
"""      const permitCategories = useMemo(() => normalizeItems(master.permitCategories, DEFAULT_MASTER.permitCategories), [master.permitCategories]);
      const progressTypes = useMemo(() => normalizeItems(master.progressTypes, DEFAULT_MASTER.progressTypes), [master.progressTypes]);
      const typeMap = useMemo(() => Object.fromEntries(projectTypes.map(x => [x.id, x])), [projectTypes]);
      const factoryMap = useMemo(() => Object.fromEntries(factories.map(x => [x.id, x])), [factories]);
      const permitMap = useMemo(() => Object.fromEntries(permitCategories.map(x => [x.id, x])), [permitCategories]);
      const progressTypeMap = useMemo(() => Object.fromEntries(progressTypes.map(x => [x.id, x])), [progressTypes]);""",'progress memo')

# 4) firebase master subscription
rep("""                projectTypes:normalizeItems(data.projectTypes, DEFAULT_MASTER.projectTypes),
                permitCategories:normalizeItems(data.permitCategories, DEFAULT_MASTER.permitCategories)""",
"""                projectTypes:normalizeItems(data.projectTypes, DEFAULT_MASTER.projectTypes),
                permitCategories:normalizeItems(data.permitCategories, DEFAULT_MASTER.permitCategories),
                progressTypes:normalizeItems(data.progressTypes, DEFAULT_MASTER.progressTypes)""",'subscribe progress master')

# 5) modal setup and reset helper
rep("""        setActualProgress(actual);
        setLogDraft({ id:null, date:today(), person:window.__currentUserName || editingProject?.mainPic || '', type:'工作日報', customType:'', progress:actual, content:'' });
      }, [isModalOpen, editingProject, factories, projectTypes]);""",
"""        setActualProgress(actual);
        const defaultProgressType = progressTypes.find(x => x.active)?.id || 'WORK_LOG';
        setLogDraft({ id:null, date:today(), person:window.__currentUserName || editingProject?.mainPic || '', typeId:defaultProgressType, customType:'', progress:actual, content:'' });
      }, [isModalOpen, editingProject, factories, projectTypes, progressTypes]);""",'modal draft setup')
rep("""      const resetLogDraft = (person, progress=actualProgress) => setLogDraft({ id:null, date:today(), person:person || window.__currentUserName || '', type:'工作日報', customType:'', progress:clampProgress(progress), content:'' });

      const saveProgressLog = () => {
        const finalType = logDraft.type === '其他' ? String(logDraft.customType || '').trim() : logDraft.type;
        const content = String(logDraft.content || '').trim();
        if (!finalType) return alert('請輸入進度類型');
        if (!content) return alert('請輸入進度內容');
        const item = {
          id:logDraft.id || uid('log'),
          date:logDraft.date || today(),
          person:String(logDraft.person || '').trim(),
          type:finalType,
          content,
          progress:clampProgress(logDraft.progress)
        };
        setExecutionLogs(prev => normalizeLogs(logDraft.id ? prev.map(x => x.id === logDraft.id ? item : x) : [item, ...prev]));
        setActualProgress(item.progress);
        resetLogDraft(item.person, item.progress);
      };

      const editProgressLog = (log) => {
        const isDefault = PROGRESS_TYPES.includes(log.type) && log.type !== '其他';
        setLogDraft({ id:log.id, date:log.date || today(), person:log.person || '', type:isDefault ? log.type : '其他', customType:isDefault ? '' : log.type, progress:clampProgress(log.progress), content:log.content || '' });
        document.getElementById('progress-entry')?.scrollIntoView({ behavior:'smooth', block:'center' });
      };""",
"""      const resetLogDraft = (person, progress=actualProgress) => {
        const defaultProgressType = progressTypes.find(x => x.active)?.id || 'WORK_LOG';
        setLogDraft({ id:null, date:today(), person:person || window.__currentUserName || '', typeId:defaultProgressType, customType:'', progress:clampProgress(progress), content:'' });
      };

      const saveProgressLog = () => {
        const selectedProgressType = progressTypes.find(x => x.id === logDraft.typeId);
        const isOther = selectedProgressType?.id === 'OTHER';
        const finalType = isOther ? String(logDraft.customType || '').trim() : String(selectedProgressType?.label || '').trim();
        const content = String(logDraft.content || '').trim();
        if (!selectedProgressType) return alert('請選擇進度類型');
        if (!finalType) return alert('請輸入進度類型');
        if (!content) return alert('請輸入進度內容');
        const item = {
          id:logDraft.id || uid('log'),
          date:logDraft.date || today(),
          person:String(logDraft.person || '').trim(),
          typeId:selectedProgressType.id,
          type:finalType,
          content,
          progress:clampProgress(logDraft.progress)
        };
        setExecutionLogs(prev => normalizeLogs(logDraft.id ? prev.map(x => x.id === logDraft.id ? item : x) : [item, ...prev]));
        setActualProgress(item.progress);
        resetLogDraft(item.person, item.progress);
      };

      const editProgressLog = (log) => {
        const matched = progressTypes.find(x => x.id === log.typeId) || progressTypes.find(x => x.label === log.type);
        const typeId = matched?.id || 'OTHER';
        const customType = typeId === 'OTHER' ? (matched && log.type === matched.label ? '' : log.type) : '';
        setLogDraft({ id:log.id, date:log.date || today(), person:log.person || '', typeId, customType, progress:clampProgress(log.progress), content:log.content || '' });
        document.getElementById('progress-entry')?.scrollIntoView({ behavior:'smooth', block:'center' });
      };""",'progress log logic')

# 6) master open/add/save/delete logic
rep("""      const openMaster = () => {
        setMasterDraft(deepClone({ factories, projectTypes, permitCategories }));
        setMasterTab('factories');
        setIsMasterOpen(true);
      };""",
"""      const openMaster = () => {
        setMasterDraft(deepClone({ factories, projectTypes, permitCategories, progressTypes }));
        setMasterTab('factories');
        setIsMasterOpen(true);
      };""",'open master progress')
rep("""        const prefix = key === 'factories' ? 'FAC' : key === 'projectTypes' ? 'TYPE' : 'PERMIT';
        const defaultColor = '#64748b';""",
"""        const prefix = key === 'factories' ? 'FAC' : key === 'projectTypes' ? 'TYPE' : key === 'permitCategories' ? 'PERMIT' : 'PROGRESS';
        const defaultColor = '#64748b';""",'progress prefix')
rep("""      const saveMaster = async () => {
        for (const key of ['factories','projectTypes','permitCategories']) {
          if (masterDraft[key].some(x => !String(x.label || '').trim())) return alert('基本資料名稱不可空白');
        }
        const normalized = {
          factories:normalizeItems(masterDraft.factories, DEFAULT_MASTER.factories),
          projectTypes:normalizeItems(masterDraft.projectTypes, DEFAULT_MASTER.projectTypes),
          permitCategories:normalizeItems(masterDraft.permitCategories, DEFAULT_MASTER.permitCategories)
        };""",
"""      const isProgressTypeUsed = (item) => projects.some(p => normalizeLogs(p.executionLogs || []).some(log => log.typeId === item.id || (!log.typeId && log.type === item.label)));
      const deleteProgressType = (id) => setMasterDraft(prev => {
        const item = prev.progressTypes.find(x => x.id === id);
        if (!item) return prev;
        if (item.id === 'OTHER') { alert('「其他」為保留類型，無法刪除。'); return prev; }
        if (isProgressTypeUsed(item)) { alert('此進度類型已有歷史紀錄使用，無法刪除；請改為停用。'); return prev; }
        if (!confirm(`確定刪除進度類型「${item.label || id}」？`)) return prev;
        return { ...prev, progressTypes:prev.progressTypes.filter(x => x.id !== id).map((x,i) => ({...x,order:i+1})) };
      });

      const saveMaster = async () => {
        for (const key of ['factories','projectTypes','permitCategories','progressTypes']) {
          if (masterDraft[key].some(x => !String(x.label || '').trim())) return alert('基本資料名稱不可空白');
        }
        const normalized = {
          factories:normalizeItems(masterDraft.factories, DEFAULT_MASTER.factories),
          projectTypes:normalizeItems(masterDraft.projectTypes, DEFAULT_MASTER.projectTypes),
          permitCategories:normalizeItems(masterDraft.permitCategories, DEFAULT_MASTER.permitCategories),
          progressTypes:normalizeItems(masterDraft.progressTypes, DEFAULT_MASTER.progressTypes).map(x => x.id === 'OTHER' ? {...x,active:true} : x)
        };""",'save progress master')

# 7) master labels
rep("""      const masterLabels = { factories:'廠區管理', projectTypes:'專案類型管理', permitCategories:'法規類別管理' };""",
"""      const masterLabels = { factories:'廠區管理', projectTypes:'專案類型管理', permitCategories:'法規類別管理', progressTypes:'進度類型管理' };""",'master labels')

# 8) progress selector UI
rep("""                      <div><label className=\"block text-[11px] font-bold text-slate-400 mb-1\">類型</label><select value={logDraft.type} onChange={e => setLogDraft({...logDraft,type:e.target.value,customType:e.target.value === '其他' ? logDraft.customType : ''})} className=\"w-full p-2.5 border rounded-lg bg-white\">{PROGRESS_TYPES.map(x => <option key={x}>{x}</option>)}</select></div>""",
"""                      <div><label className=\"block text-[11px] font-bold text-slate-400 mb-1\">類型</label><select value={logDraft.typeId} onChange={e => setLogDraft({...logDraft,typeId:e.target.value,customType:e.target.value === 'OTHER' ? logDraft.customType : ''})} className=\"w-full p-2.5 border rounded-lg bg-white\">{progressTypes.filter(x => x.active || x.id === logDraft.typeId).map(x => <option key={x.id} value={x.id}>{x.label}{x.active ? '' : '（已停用）'}</option>)}</select></div>""",'progress selector')
rep("""                    {logDraft.type === '其他' && <div><label className=\"block text-[11px] font-bold text-slate-400 mb-1\">其他類型名稱</label>""",
"""                    {logDraft.typeId === 'OTHER' && <div><label className=\"block text-[11px] font-bold text-slate-400 mb-1\">其他類型名稱</label>""",'other selector')

# 9) progress type color in quick view and history
rep("""<span className=\"text-[11px] font-bold bg-purple-50 text-purple-700 px-2 py-1 rounded border border-purple-100\">{log.type}</span>""",
"""<span style={tagStyle((progressTypeMap[log.typeId] || progressTypes.find(x => x.label === log.type) || progressTypeMap.OTHER)?.color || '#475569')} className=\"text-[11px] font-bold px-2 py-1 rounded border\">{log.type}</span>""",'quick view progress color')
rep("""<span className=\"text-[11px] font-bold rounded-full px-2 py-1 bg-purple-50 text-purple-700 border border-purple-100\">{log.type}</span>""",
"""<span style={tagStyle((progressTypeMap[log.typeId] || progressTypes.find(x => x.label === log.type) || progressTypeMap.OTHER)?.color || '#475569')} className=\"text-[11px] font-bold rounded-full px-2 py-1 border\">{log.type}</span>""",'history progress color')

# 10) master management UI: help, color already generic; add progress delete and protect OTHER enable
rep("""<p className=\"text-xs text-slate-400 mt-1\">可修改名稱、顏色、啟用狀態，並用上下箭頭調整排序。</p>""",
"""<p className=\"text-xs text-slate-400 mt-1\">可修改名稱、顏色、啟用狀態與排序；進度類型未被使用時可刪除，已使用者請改為停用。</p>""",'master help')
rep("""<label className=\"flex items-center gap-2 text-xs font-bold text-slate-600\"><input type=\"checkbox\" checked={item.active !== false} onChange={e => updateMasterItem(masterTab,item.id,{active:e.target.checked})}/>啟用</label><div className=\"flex gap-1\">""",
"""<label className=\"flex items-center gap-2 text-xs font-bold text-slate-600\"><input type=\"checkbox\" checked={item.active !== false} disabled={masterTab === 'progressTypes' && item.id === 'OTHER'} onChange={e => updateMasterItem(masterTab,item.id,{active:e.target.checked})}/>啟用</label>{masterTab === 'progressTypes' && <button type=\"button\" disabled={item.id === 'OTHER' || isProgressTypeUsed(item)} onClick={() => deleteProgressType(item.id)} title={item.id === 'OTHER' ? '其他為保留類型' : isProgressTypeUsed(item) ? '已有歷史紀錄，只能停用' : '刪除此進度類型'} className=\"px-2 py-1 border border-red-200 text-red-600 rounded text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed\">刪除</button>}<div className=\"flex gap-1\">""",'progress delete UI')

p.write_text(s,encoding='utf-8')
