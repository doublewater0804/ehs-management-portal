from pathlib import Path
p=Path('project/index.html')
s=p.read_text(encoding='utf-8')

def rep(old,new,label):
    global s
    if old not in s:
        raise SystemExit(f'{label}: target not found')
    s=s.replace(old,new,1)

rep("{ id:'LD', label:'龍德', active:true, order:1 },","{ id:'LD', label:'龍德', active:true, order:1, color:'#1e3a5f' },",'factory LD')
rep("{ id:'CH', label:'彰化', active:true, order:2 },","{ id:'CH', label:'彰化', active:true, order:2, color:'#0f766e' },",'factory CH')
rep("{ id:'ML', label:'麥寮', active:true, order:3 },","{ id:'ML', label:'麥寮', active:true, order:3, color:'#c2410c' },",'factory ML')
rep("{ id:'SG', label:'新港', active:true, order:4 },","{ id:'SG', label:'新港', active:true, order:4, color:'#7c3aed' },",'factory SG')
rep("{ id:'CROSS', label:'跨廠區', active:true, order:5 }","{ id:'CROSS', label:'跨廠區', active:true, order:5, color:'#475569' }",'factory cross')
for old,color in [("tone:'blue'","#2563eb"),("tone:'purple'","#9333ea"),("tone:'red'","#dc2626"),("tone:'orange'","#ea580c"),("tone:'gray'","#64748b")]:
    rep(old+" }",old+f", color:'{color}' }}",'project type color')
rep("{ id:'AIR', label:'空污', active:true, order:1 },","{ id:'AIR', label:'空污', active:true, order:1, color:'#64748b' },",'permit air')
rep("{ id:'WATER', label:'廢水', active:true, order:2 },","{ id:'WATER', label:'廢水', active:true, order:2, color:'#0284c7' },",'permit water')
rep("{ id:'WASTE', label:'廢棄物', active:true, order:3 }","{ id:'WASTE', label:'廢棄物', active:true, order:3, color:'#b45309' }",'permit waste')

old="""    const normalizeItems = (items, fallback) => {
      const list = Array.isArray(items) && items.length ? items : deepClone(fallback);
      return list.map((x,i) => ({ ...x, id:String(x.id || uid('item')), label:String(x.label || '').trim(), active:x.active !== false, order:Number.isFinite(Number(x.order)) ? Number(x.order) : i + 1 })).sort((a,b) => a.order - b.order);
    };
    const typeTone = (tone='gray') => ({
      blue:'bg-blue-100 text-blue-800', purple:'bg-purple-100 text-purple-800', red:'bg-red-100 text-red-800', orange:'bg-orange-100 text-orange-800', green:'bg-green-100 text-green-800', gray:'bg-gray-100 text-gray-800'
    }[tone] || 'bg-gray-100 text-gray-800');
    const typeBar = (tone='gray') => ({ blue:'bg-blue-500', purple:'bg-purple-500', red:'bg-red-500', orange:'bg-orange-500', green:'bg-green-500', gray:'bg-gray-500' }[tone] || 'bg-gray-500');"""
new="""    const normalizeHexColor = (value, fallback='#64748b') => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value) : fallback;
    const toneHex = (tone='gray') => ({blue:'#2563eb',purple:'#9333ea',red:'#dc2626',orange:'#ea580c',green:'#16a34a',gray:'#64748b'}[tone] || '#64748b');
    const normalizeItems = (items, fallback) => {
      const list = Array.isArray(items) && items.length ? items : deepClone(fallback);
      return list.map((x,i) => {
        const fb = fallback.find(f => String(f.id) === String(x.id)) || fallback[i] || {};
        const fallbackColor = fb.color || toneHex(x.tone || fb.tone);
        return { ...x, id:String(x.id || uid('item')), label:String(x.label || '').trim(), active:x.active !== false, order:Number.isFinite(Number(x.order)) ? Number(x.order) : i + 1, color:normalizeHexColor(x.color, fallbackColor) };
      }).sort((a,b) => a.order - b.order);
    };
    const hexToRgba = (hex, alpha=.14) => { const h=normalizeHexColor(hex).slice(1); const r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16); return `rgba(${r},${g},${b},${alpha})`; };
    const darkenHex = (hex, amount=.28) => { const h=normalizeHexColor(hex).slice(1); const vals=[0,2,4].map(i=>Math.max(0,Math.round(parseInt(h.slice(i,i+2),16)*(1-amount)))); return `#${vals.map(v=>v.toString(16).padStart(2,'0')).join('')}`; };
    const contrastText = (hex) => { const h=normalizeHexColor(hex).slice(1); const [r,g,b]=[0,2,4].map(i=>parseInt(h.slice(i,i+2),16)); return (r*299+g*587+b*114)/1000 > 165 ? '#0f172a' : '#ffffff'; };
    const tagStyle = (color, solid=false) => { const c=normalizeHexColor(color); return solid ? {backgroundColor:c,color:contrastText(c),borderColor:c} : {backgroundColor:hexToRgba(c,.12),color:darkenHex(c,.22),borderColor:hexToRgba(c,.32)}; };"""
rep(old,new,'helpers')

rep("const base = { id:`${prefix}_${Date.now().toString(36).toUpperCase()}`, label:'', active:true, order:arr.length + 1 };","const defaultColor = '#64748b';\n        const base = { id:`${prefix}_${Date.now().toString(36).toUpperCase()}`, label:'', active:true, order:arr.length + 1, color:defaultColor };",'add item')
rep("<span className={`w-2 h-2 rounded-full ${typeBar(t.tone)}`}></span>","<span className=\"w-2 h-2 rounded-full\" style={{backgroundColor:t.color}}></span>",'summary')
rep("className={`px-4 py-2 rounded-full text-sm font-bold ${filterType === t.id ? `${typeBar(t.tone)} text-white shadow` : 'bg-white text-gray-600 border border-gray-200'}`}","style={filterType === t.id ? tagStyle(t.color,true) : undefined} className={`px-4 py-2 rounded-full text-sm font-bold ${filterType === t.id ? 'shadow border' : 'bg-white text-gray-600 border border-gray-200'}`}",'filter')
rep("const t = typeMap[p.type] || { label:p.type || '未分類', tone:'gray' }; const f = factoryMap[p.factory];","const t = typeMap[p.type] || { label:p.type || '未分類', color:'#64748b' }; const f = factoryMap[p.factory];",'type fallback')
rep("<span className=\"text-[10px] px-2 py-0.5 rounded font-bold bg-slate-800 text-white\">{f?.label || '未設定廠區'}</span>","<span style={tagStyle(f?.color || '#475569',true)} className=\"text-[10px] px-2 py-0.5 rounded font-bold border\">{f?.label || '未設定廠區'}</span>",'factory tag')
rep("<span className={`text-[10px] px-2 py-0.5 rounded font-bold ${typeTone(t.tone)}`}>{p.type === 'OTHER' && p.customTypeName ? p.customTypeName : t.label}</span>","<span style={tagStyle(t.color)} className=\"text-[10px] px-2 py-0.5 rounded font-bold border\">{p.type === 'OTHER' && p.customTypeName ? p.customTypeName : t.label}</span>",'type tag')
rep("{p.type === 'PERMIT' && (p.permitCategories || []).map(id => <span key={id} className=\"text-[10px] px-2 py-0.5 rounded font-bold bg-purple-50 text-purple-700 border border-purple-100\">{permitMap[id]?.label || id}</span>)}","{p.type === 'PERMIT' && (p.permitCategories || []).map(id => {const c=permitMap[id]; return <span key={id} style={tagStyle(c?.color || '#64748b')} className=\"text-[10px] px-2 py-0.5 rounded font-bold border\">{c?.label || id}</span>;})}",'permit tag')

rep("可直接修改名稱、停用，並用上下箭頭調整排序。","可修改名稱、顏色、啟用狀態，並用上下箭頭調整排序。",'help text')
needle="""<input value={item.label} onChange={e => updateMasterItem(masterTab,item.id,{label:e.target.value})} className=\"flex-1 p-2 border rounded-lg\" placeholder=\"名稱\"/><label className=\"flex items-center gap-2 text-xs font-bold text-slate-600\">"""
insert="""<input value={item.label} onChange={e => updateMasterItem(masterTab,item.id,{label:e.target.value})} className=\"flex-1 p-2 border rounded-lg\" placeholder=\"名稱\"/><div className=\"flex items-center gap-2 shrink-0\"><span style={masterTab === 'factories' ? tagStyle(item.color,true) : tagStyle(item.color)} className=\"px-2 py-1 rounded border text-xs font-bold min-w-14 text-center\">{item.label || '預覽'}</span><input type=\"color\" value={normalizeHexColor(item.color)} onChange={e => updateMasterItem(masterTab,item.id,{color:e.target.value})} className=\"w-10 h-9 p-1 border rounded-lg cursor-pointer bg-white\" title=\"自訂標籤顏色\"/></div><label className=\"flex items-center gap-2 text-xs font-bold text-slate-600\">"""
rep(needle,insert,'master picker')

p.write_text(s,encoding='utf-8')
