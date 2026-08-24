(() => {
  if (window.__flareLayoutRedesignLoaded) return;
  window.__flareLayoutRedesignLoaded = true;

  const params = new URLSearchParams(window.location.search);
  const isInputView = params.get('view') === 'input';
  const root = document.documentElement;
  root.classList.add(isInputView ? 'flare-input-view' : 'flare-report-view');

  const style = document.createElement('style');
  style.dataset.flareLayoutRedesign = '1';
  style.textContent = `
    :root {
      --flare-navy:#0f2f5f;
      --flare-blue:#1d5fd0;
      --flare-blue-strong:#174fb2;
      --flare-blue-soft:#edf4ff;
      --flare-green:#178a55;
      --flare-amber:#d97706;
      --flare-red:#c2413b;
      --flare-text:#172033;
      --flare-muted:#66758c;
      --flare-border:#d7dfeb;
      --flare-border-strong:#b8c5d8;
      --flare-surface:#ffffff;
      --flare-canvas:#f4f7fb;
      --flare-shadow:0 8px 24px rgba(15,47,95,.08);
    }

    html, body {
      color:var(--flare-text);
      background:var(--flare-canvas) !important;
      font-family:"Noto Sans TC","Microsoft JhengHei","PingFang TC",Arial,sans-serif !important;
      font-variant-numeric:tabular-nums;
    }
    body { padding:22px 26px 34px !important; }
    .app-shell { max-width:1560px !important; margin:0 auto !important; }

    /* Header */
    .app-shell > .flex.flex-col.lg\\:flex-row {
      margin-bottom:18px !important;
      padding:2px 2px 0;
      align-items:center !important;
    }
    .app-shell > .flex.flex-col.lg\\:flex-row h1 {
      color:var(--flare-navy) !important;
      font-size:24px !important;
      line-height:1.35 !important;
      letter-spacing:.01em;
      font-weight:900 !important;
    }
    .app-shell > .flex.flex-col.lg\\:flex-row h1::before {
      content:"▦";
      display:inline-grid;
      place-items:center;
      width:34px;
      height:34px;
      margin-right:10px;
      border-radius:9px;
      background:linear-gradient(145deg,#1d5fd0,#174fb2);
      color:#fff;
      font-size:20px;
      box-shadow:0 5px 12px rgba(29,95,208,.18);
      vertical-align:middle;
    }
    .app-shell > .flex.flex-col.lg\\:flex-row p.text-gray-500 {
      margin-left:44px;
      color:#7b8798 !important;
      font-size:12px !important;
      letter-spacing:.02em;
    }
    #view-year {
      border:1px solid var(--flare-border) !important;
      background:#fff !important;
      border-radius:8px !important;
      padding:5px 28px 5px 9px !important;
      color:var(--flare-navy) !important;
      font-size:14px !important;
      font-weight:800 !important;
      box-shadow:0 1px 2px rgba(15,23,42,.03);
    }

    /* Professional toolbar */
    .flare-pro-toolbar {
      display:flex !important;
      flex-wrap:wrap !important;
      justify-content:flex-end !important;
      align-items:center !important;
      gap:8px !important;
    }
    .flare-pro-toolbar > button,
    .flare-pro-toolbar .top-import-control > button,
    .flare-nav-link,
    .flare-menu-summary {
      min-height:38px !important;
      padding:8px 13px !important;
      border-radius:8px !important;
      border:1px solid var(--flare-border) !important;
      background:#fff !important;
      color:#34445c !important;
      box-shadow:0 1px 2px rgba(15,23,42,.03) !important;
      font-size:12.5px !important;
      line-height:1.2 !important;
      font-weight:800 !important;
      text-decoration:none !important;
      cursor:pointer;
      white-space:nowrap;
      transition:background .15s ease,border-color .15s ease,color .15s ease,box-shadow .15s ease;
    }
    .flare-pro-toolbar > button:hover,
    .flare-pro-toolbar .top-import-control > button:hover,
    .flare-menu-summary:hover {
      background:#f8fbff !important;
      border-color:#9db6dc !important;
      color:var(--flare-blue) !important;
    }
    #flare-open-input-page {
      background:var(--flare-blue) !important;
      border-color:var(--flare-blue) !important;
      color:#fff !important;
      box-shadow:0 4px 10px rgba(29,95,208,.18) !important;
    }
    #flare-open-input-page::before { content:"＋"; margin-right:5px; font-size:14px; }
    #flare-open-input-page:hover { background:var(--flare-blue-strong) !important; color:#fff !important; }
    #top-import-toggle {
      background:#f8fbff !important;
      color:var(--flare-navy) !important;
    }
    .top-import-menu {
      border-color:var(--flare-border) !important;
      border-radius:10px !important;
      box-shadow:0 14px 32px rgba(15,47,95,.14) !important;
    }
    .top-import-menu button {
      color:#34445c !important;
      font-size:12.5px !important;
    }
    #firebase-sync-status {
      min-height:34px;
      border:1px solid #bfe4d0;
      background:#effaf4 !important;
      color:#17754b !important;
      border-radius:999px !important;
      padding:7px 11px !important;
      font-size:11.5px !important;
      box-shadow:none !important;
    }
    .flare-menu-control { position:relative; }
    .flare-menu-control details { position:relative; }
    .flare-menu-control summary { list-style:none; }
    .flare-menu-control summary::-webkit-details-marker { display:none; }
    .flare-menu-summary::after { content:"⌄"; margin-left:7px; color:#7b8798; }
    .flare-menu-panel {
      position:absolute;
      right:0;
      top:calc(100% + 7px);
      z-index:70;
      width:220px;
      padding:7px;
      border:1px solid var(--flare-border);
      border-radius:10px;
      background:#fff;
      box-shadow:0 16px 36px rgba(15,47,95,.15);
    }
    .flare-menu-panel button {
      display:flex !important;
      align-items:center;
      justify-content:flex-start;
      width:100%;
      min-height:38px;
      padding:8px 10px !important;
      margin:0 !important;
      border:0 !important;
      border-radius:7px !important;
      background:#fff !important;
      color:#34445c !important;
      box-shadow:none !important;
      font-size:12.5px !important;
      font-weight:700 !important;
      text-align:left;
    }
    .flare-menu-panel button:hover { background:#f1f6ff !important; color:var(--flare-blue) !important; }
    .flare-menu-panel button.flare-danger-action { color:var(--flare-red) !important; }
    .flare-import-helper { display:none !important; }

    /* Summary cards */
    .flare-summary-shell {
      padding:0 !important;
      margin-bottom:18px !important;
      border:0 !important;
      background:transparent !important;
      box-shadow:none !important;
    }
    .flare-summary-grid {
      display:grid;
      grid-template-columns:repeat(4,minmax(0,1fr));
      gap:12px;
    }
    .flare-summary-card {
      min-height:100px;
      padding:16px 18px;
      border:1px solid var(--flare-border);
      border-radius:12px;
      background:#fff;
      box-shadow:0 4px 14px rgba(15,47,95,.055);
      display:grid;
      grid-template-columns:40px 1fr;
      gap:12px;
      align-items:center;
    }
    .flare-summary-icon {
      display:grid;
      place-items:center;
      width:40px;
      height:40px;
      border-radius:10px;
      background:var(--flare-blue-soft);
      color:var(--flare-blue);
      font-size:16px;
      font-weight:900;
    }
    .flare-summary-card.is-green .flare-summary-icon { background:#edf9f2; color:var(--flare-green); }
    .flare-summary-card.is-amber .flare-summary-icon { background:#fff6e8; color:var(--flare-amber); }
    .flare-summary-label {
      color:#526175;
      font-size:12px;
      font-weight:800;
      letter-spacing:.01em;
    }
    .flare-summary-value {
      display:flex;
      align-items:baseline;
      gap:4px;
      margin-top:4px;
      color:var(--flare-text);
      font-size:26px;
      line-height:1;
      font-weight:900;
    }
    .flare-summary-value .text-blue-600 { color:var(--flare-navy) !important; text-decoration:none !important; }
    .flare-summary-unit { color:#66758c; font-size:12px; font-weight:700; }
    .flare-summary-caption {
      margin-top:7px;
      color:#8894a6;
      font-size:11px;
      line-height:1.45;
    }
    #excluded-days-summary {
      margin:7px 0 0 !important;
      color:#8b6a35 !important;
      font-size:11px !important;
      line-height:1.45 !important;
      font-weight:600 !important;
    }

    /* Report-only layout */
    html.flare-report-view .entry-panel,
    html.flare-report-view .exclusion-panel,
    html.flare-report-view .excel-panel { display:none !important; }
    html.flare-report-view .main-layout {
      display:block !important;
      overflow:visible !important;
      padding-bottom:0 !important;
    }
    html.flare-report-view .report-panel {
      width:min(1320px,100%) !important;
      min-width:0 !important;
      margin:0 auto !important;
    }
    html.flare-report-view .report-card {
      width:100% !important;
      border:1px solid var(--flare-border) !important;
      border-radius:12px !important;
      background:#fff !important;
      box-shadow:var(--flare-shadow) !important;
      overflow:hidden;
    }
    .report-table {
      width:100% !important;
      border-collapse:collapse !important;
      color:#253248 !important;
      font-size:13px !important;
      line-height:1.42 !important;
    }
    .report-table th,
    .report-table td {
      border:1px solid #cbd5e1 !important;
      padding:7px 8px !important;
      vertical-align:middle !important;
    }
    .report-table thead th {
      background:#edf3fb !important;
      color:#24364f !important;
      font-weight:900 !important;
    }
    .report-table thead tr:first-child th { background:#e6eef9 !important; color:var(--flare-navy) !important; }
    .report-table tbody tr:nth-child(even) td:not(.area-header) { background:#fbfcfe; }
    .report-table .area-header,
    .report-table td[rowspan] {
      background:#f2f6fb !important;
      color:var(--flare-blue-strong) !important;
      font-weight:900 !important;
    }
    .report-table .text-blue-600 { color:var(--flare-blue-strong) !important; font-weight:900 !important; }
    .factory-label { color:#27364c !important; font-weight:700 !important; }
    .screen-remark-editor {
      margin-top:12px !important;
      padding:16px 18px !important;
      border:1px solid var(--flare-border) !important;
      border-radius:12px !important;
      background:#fff !important;
      box-shadow:0 4px 14px rgba(15,47,95,.05) !important;
    }
    .screen-remark-editor textarea {
      border-color:var(--flare-border) !important;
      border-radius:8px !important;
      color:#334155 !important;
      font-size:12.5px !important;
      line-height:1.65 !important;
      background:#fbfcfe !important;
    }

    /* Import panel */
    .top-import-panel {
      width:min(1180px,100%);
      margin:0 auto 18px !important;
      border:1px solid var(--flare-border) !important;
      border-left:4px solid var(--flare-blue) !important;
      border-radius:12px !important;
      box-shadow:var(--flare-shadow) !important;
    }

    /* Input view */
    html.flare-input-view .report-panel,
    html.flare-input-view .entry-panel,
    html.flare-input-view .exclusion-panel,
    html.flare-input-view .excel-panel,
    html.flare-input-view .flare-input-hide { display:none !important; }
    html.flare-input-view .main-layout {
      display:block !important;
      overflow:visible !important;
      padding-bottom:0 !important;
    }
    html.flare-input-view .app-shell > .flex.flex-col.lg\\:flex-row { margin-bottom:14px !important; }
    #flare-input-workspace {
      width:min(1280px,100%);
      margin:0 auto;
      background:#fff;
      border:1px solid var(--flare-border);
      border-radius:12px;
      box-shadow:var(--flare-shadow);
      overflow:hidden;
    }
    #flare-input-workspace .flare-input-header {
      display:flex;
      align-items:center;
      gap:12px;
      padding:18px 22px 15px;
      border-bottom:1px solid var(--flare-border);
      background:#fff;
    }
    #flare-input-workspace .flare-input-header::before {
      content:"✎";
      display:grid;
      place-items:center;
      width:36px;
      height:36px;
      flex:0 0 36px;
      border-radius:9px;
      background:var(--flare-blue-soft);
      color:var(--flare-blue);
      font-size:18px;
      font-weight:900;
    }
    #flare-input-workspace .flare-input-title {
      margin:0;
      color:var(--flare-navy);
      font-size:20px;
      font-weight:900;
    }
    #flare-input-workspace .flare-input-subtitle {
      margin:3px 0 0;
      color:var(--flare-muted);
      font-size:12px;
      line-height:1.55;
    }
    #flare-input-workspace .flare-input-tabs {
      display:flex;
      align-items:flex-end;
      gap:2px;
      padding:0 18px;
      background:#fbfcfe;
      border-bottom:1px solid var(--flare-border);
      overflow-x:auto;
    }
    #flare-input-workspace .flare-tab-button {
      min-height:46px;
      border:0;
      border-bottom:3px solid transparent;
      background:transparent;
      color:#5b697c;
      padding:12px 16px 10px;
      font-size:13px;
      font-weight:800;
      cursor:pointer;
      white-space:nowrap;
      transition:.15s ease;
    }
    #flare-input-workspace .flare-tab-button:hover { color:var(--flare-blue); background:#f5f8fd; }
    #flare-input-workspace .flare-tab-button.is-active {
      color:var(--flare-blue);
      border-bottom-color:var(--flare-blue);
      background:#fff;
    }
    #flare-input-workspace .flare-input-content { padding:20px 22px 24px; background:#fff; }
    #flare-input-workspace .flare-input-tab-panel { display:none; }
    #flare-input-workspace .flare-input-tab-panel.is-active { display:block; }
    #flare-input-workspace .flare-input-tab-panel > * {
      width:100% !important;
      min-width:0 !important;
      max-width:none !important;
      margin:0 !important;
      border:0 !important;
      box-shadow:none !important;
      background:#fff !important;
    }
    #flare-input-workspace h2,
    #flare-input-workspace h3 {
      color:var(--flare-navy) !important;
      font-weight:900 !important;
    }
    #flare-input-workspace h2 { font-size:17px !important; }
    #flare-input-workspace h3 { font-size:14px !important; }
    #flare-input-workspace label { color:#45546a !important; font-size:12.5px !important; font-weight:800 !important; }
    #flare-input-workspace input,
    #flare-input-workspace select,
    #flare-input-workspace textarea {
      min-height:40px;
      border:1px solid var(--flare-border-strong) !important;
      border-radius:8px !important;
      background:#fff !important;
      color:#253248 !important;
      font-size:13px !important;
      box-shadow:inset 0 1px 2px rgba(15,23,42,.02);
    }
    #flare-input-workspace input:focus,
    #flare-input-workspace select:focus,
    #flare-input-workspace textarea:focus {
      outline:none !important;
      border-color:#78a3e8 !important;
      box-shadow:0 0 0 3px rgba(29,95,208,.10) !important;
    }
    #flare-input-workspace button:not(.flare-tab-button) {
      min-height:38px;
      border-radius:8px !important;
      font-size:12.5px !important;
      font-weight:800 !important;
    }
    #flare-input-workspace table {
      width:100%;
      border:1px solid var(--flare-border) !important;
      border-collapse:collapse !important;
      font-size:12.5px !important;
    }
    #flare-input-workspace table th {
      background:#f1f5fb !important;
      color:#40516a !important;
      font-weight:900 !important;
    }
    #flare-input-workspace table th,
    #flare-input-workspace table td {
      border-bottom:1px solid var(--flare-border) !important;
      padding:8px 9px !important;
    }
    html.flare-input-view .exclusion-scroll { max-height:440px !important; }
    html.flare-input-view #factory-map-form { grid-template-columns:1fr 220px 180px !important; align-items:end; gap:12px !important; }
    html.flare-input-view #factory-map-form button { min-height:40px; }
    #flare-panel-schedule #schedule-form,
    #flare-panel-manual-event #event-form {
      border:1px solid var(--flare-border);
      border-radius:10px;
      padding:16px;
      background:#fbfcfe;
    }
    .flare-nav-link.report-link {
      background:#fff !important;
      color:var(--flare-blue) !important;
      border-color:#a7c0e8 !important;
    }
    .flare-nav-link.report-link::before { content:"←"; margin-right:5px; }

    /* Responsive */
    @media (max-width:1080px) {
      .flare-summary-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
      .report-table { font-size:12px !important; }
      .report-table th,.report-table td { padding:6px !important; }
    }
    @media (max-width:760px) {
      body { padding:12px !important; }
      .app-shell > .flex.flex-col.lg\\:flex-row h1 { font-size:20px !important; }
      .app-shell > .flex.flex-col.lg\\:flex-row h1::before { width:30px;height:30px;font-size:17px; }
      .app-shell > .flex.flex-col.lg\\:flex-row p.text-gray-500 { margin-left:0; }
      .flare-summary-grid { grid-template-columns:1fr; gap:8px; }
      .flare-summary-card { min-height:82px; padding:13px 14px; }
      .flare-summary-value { font-size:22px; }
      html.flare-report-view .report-card { overflow-x:auto; }
      .report-table { min-width:900px; }
      #flare-input-workspace .flare-input-content { padding:14px; }
      #flare-input-workspace .flare-input-header { padding:15px; }
      #flare-input-workspace .flare-input-tabs { padding:0 8px; }
      html.flare-input-view #factory-map-form { grid-template-columns:1fr !important; }
      .flare-menu-panel { left:0; right:auto; }
    }

    /* Print stays formal: black grid, no UI chrome */
    @media print {
      body { background:#fff !important; padding:0 !important; }
      .flare-summary-card { box-shadow:none !important; border:1px solid #aaa !important; }
      html.flare-report-view .report-card { box-shadow:none !important; border:0 !important; }
      .report-table th,.report-table td { border:1px solid #000 !important; }
      .report-table thead th,.report-table .area-header,.report-table td[rowspan] { background:#fff !important; color:#000 !important; }
    }
  `;
  document.head.appendChild(style);

  function makeLink(href, text, className) {
    const a = document.createElement('a');
    a.href = href;
    a.textContent = text;
    a.className = `flare-nav-link ${className || ''}`.trim();
    return a;
  }

  function getTopToolbar() {
    return document.getElementById('firebase-sync-status')?.parentElement || null;
  }

  function findToolbarButton(toolbar, keyword) {
    return [...(toolbar?.querySelectorAll('button') || [])].find(btn => btn.textContent.trim().includes(keyword)) || null;
  }

  function createActionMenu(id, label, buttons, dangerButton = null) {
    if (!buttons.filter(Boolean).length) return null;
    const wrap = document.createElement('div');
    wrap.id = id;
    wrap.className = 'flare-menu-control';
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.className = 'flare-menu-summary';
    summary.textContent = label;
    const panel = document.createElement('div');
    panel.className = 'flare-menu-panel';
    buttons.filter(Boolean).forEach(btn => {
      btn.className = dangerButton === btn ? 'flare-danger-action' : '';
      panel.appendChild(btn);
      btn.addEventListener('click', () => details.removeAttribute('open'));
    });
    details.append(summary, panel);
    wrap.appendChild(details);
    return wrap;
  }

  function enhanceToolbar({ inputView = false } = {}) {
    const toolbar = getTopToolbar();
    if (!toolbar || toolbar.dataset.professionalized === '1') return;
    toolbar.dataset.professionalized = '1';
    toolbar.classList.add('flare-pro-toolbar');

    [...toolbar.querySelectorAll('span')].forEach(span => {
      if (span.id !== 'firebase-sync-status' && span.textContent.includes('匯入功能集中')) span.classList.add('flare-import-helper');
    });

    if (inputView) return;

    const exportAll = findToolbarButton(toolbar, '匯出全部資料 CSV');
    const exportIncluded = findToolbarButton(toolbar, '匯出納入統計 CSV');
    const exportMaintenance = findToolbarButton(toolbar, '匯出維護用 CSV');
    const printButton = findToolbarButton(toolbar, '列印報表');
    const uploadButton = findToolbarButton(toolbar, '本機資料上傳雲端');
    const clearButton = findToolbarButton(toolbar, '清除所有數據');

    const exportMenu = createActionMenu('flare-export-menu', '匯出資料', [exportAll, exportIncluded, exportMaintenance]);
    const moreMenu = createActionMenu('flare-more-menu', '其他功能', [printButton, uploadButton, clearButton], clearButton);
    const status = document.getElementById('firebase-sync-status');
    if (exportMenu) toolbar.insertBefore(exportMenu, status);
    if (moreMenu) toolbar.insertBefore(moreMenu, status);
  }

  function enhanceSummary() {
    const mai = document.getElementById('summary-mai-liao');
    const hai = document.getElementById('summary-hai-feng');
    const hac = document.getElementById('summary-hac');
    const excluded = document.getElementById('excluded-days-summary');
    if (!mai || !hai || !hac || !excluded) return;
    const shell = mai.closest('.bg-white');
    if (!shell || shell.classList.contains('flare-summary-shell')) return;

    const grid = document.createElement('div');
    grid.className = 'flare-summary-grid';

    const makeCard = ({ label, icon, span, tone = '', caption = '' }) => {
      const card = document.createElement('div');
      card.className = `flare-summary-card ${tone}`.trim();
      const iconEl = document.createElement('div');
      iconEl.className = 'flare-summary-icon';
      iconEl.textContent = icon;
      const body = document.createElement('div');
      const labelEl = document.createElement('div');
      labelEl.className = 'flare-summary-label';
      labelEl.textContent = label;
      const value = document.createElement('div');
      value.className = 'flare-summary-value';
      span.classList.remove('underline');
      const unit = document.createElement('span');
      unit.className = 'flare-summary-unit';
      unit.textContent = '天';
      value.append(span, unit);
      const cap = document.createElement('div');
      cap.className = 'flare-summary-caption';
      cap.textContent = caption;
      body.append(labelEl, value, cap);
      card.append(iconEl, body);
      return card;
    };

    grid.append(
      makeCard({ label:'麥寮廠使用事件日數', icon:'M', span:mai, caption:'年度納入統計' }),
      makeCard({ label:'海豐廠使用事件日數', icon:'H', span:hai, caption:'年度納入統計' }),
      makeCard({ label:'醋酸廠使用事件日數', icon:'A', span:hac, tone:'is-green', caption:'年度納入統計' })
    );

    const excludedCard = document.createElement('div');
    excludedCard.className = 'flare-summary-card is-amber';
    const iconEl = document.createElement('div');
    iconEl.className = 'flare-summary-icon';
    iconEl.textContent = '－';
    const body = document.createElement('div');
    const label = document.createElement('div');
    label.className = 'flare-summary-label';
    label.textContent = '人工剔除使用日數';
    const value = document.createElement('div');
    value.className = 'flare-summary-value';
    const count = document.createElement('span');
    count.id = 'flare-excluded-count-display';
    const unit = document.createElement('span');
    unit.className = 'flare-summary-unit';
    unit.textContent = '天';
    value.append(count, unit);
    body.append(label, value, excluded);
    excludedCard.append(iconEl, body);
    grid.appendChild(excludedCard);

    const updateExcludedCount = () => {
      const matches = String(excluded.textContent || '').match(/(\d+)\s*天/);
      count.textContent = matches?.[1] || '0';
    };
    updateExcludedCount();
    new MutationObserver(updateExcludedCount).observe(excluded, { childList:true, characterData:true, subtree:true });

    shell.className = 'flare-summary-shell';
    shell.replaceChildren(grid);
  }

  function configureReportView() {
    const toolbar = getTopToolbar();
    if (toolbar && !document.getElementById('flare-open-input-page')) {
      const link = makeLink('./data-input.html', '資料輸入', 'input-link');
      link.id = 'flare-open-input-page';
      toolbar.insertBefore(link, document.getElementById('firebase-sync-status'));
    }
    enhanceToolbar();
    enhanceSummary();
  }

  function closestCard(node) {
    if (!node) return null;
    let current = node;
    while (current && current !== document.body) {
      if (current.classList?.contains('bg-white') && current.querySelector?.('form, table, h2, h3')) return current;
      current = current.parentElement;
    }
    return null;
  }

  function makePanel(id) {
    const panel = document.createElement('div');
    panel.id = id;
    panel.className = 'flare-input-tab-panel';
    return panel;
  }

  function configureInputView() {
    try {
      if (window.location.pathname.endsWith('/index.html')) {
        history.replaceState({ flareView:'input' }, '', './data-input.html');
      }
    } catch (_) {}

    const summary = document.getElementById('excluded-days-summary')?.parentElement;
    if (summary) summary.classList.add('flare-input-hide');
    document.getElementById('top-import-panel')?.classList.add('flare-input-hide');

    const toolbar = getTopToolbar();
    if (toolbar) {
      const status = document.getElementById('firebase-sync-status');
      [...toolbar.children].forEach(child => {
        if (child !== status) child.classList.add('flare-input-hide');
      });
      if (!document.getElementById('flare-back-report-page')) {
        const back = makeLink('./index.html', '返回統計報表', 'report-link');
        back.id = 'flare-back-report-page';
        toolbar.insertBefore(back, status || toolbar.firstChild);
      }
    }
    enhanceToolbar({ inputView:true });

    const mainLayout = document.querySelector('.main-layout');
    if (!mainLayout || document.getElementById('flare-input-workspace')) return;

    const scheduleForm = document.getElementById('schedule-form');
    const manualForm = document.getElementById('event-form');
    const factoryMapForm = document.getElementById('factory-map-form');
    const exclusionButton = document.getElementById('open-exclusion-modal-btn');

    const scheduleCard = closestCard(scheduleForm);
    const manualCard = closestCard(manualForm);
    const exclusionCard = closestCard(exclusionButton);
    const aliasSection = factoryMapForm?.parentElement || null;

    const workspace = document.createElement('section');
    workspace.id = 'flare-input-workspace';
    workspace.className = 'no-print';
    workspace.innerHTML = `
      <div class="flare-input-header">
        <div>
          <h2 class="flare-input-title">資料輸入與管理</h2>
          <p class="flare-input-subtitle">設定定檢期間、人工排放紀錄、人工剔除及工廠名稱對照。</p>
        </div>
      </div>
      <div class="flare-input-tabs" role="tablist"></div>
      <div class="flare-input-content"></div>`;

    const tabs = workspace.querySelector('.flare-input-tabs');
    const content = workspace.querySelector('.flare-input-content');
    const definitions = [
      { id:'schedule', label:'定檢期間設定', node:scheduleCard },
      { id:'manual-event', label:'人工新增排放紀錄', node:manualCard },
      { id:'exclusion', label:'人工剔除使用日數／清單', node:exclusionCard },
      { id:'factory-alias', label:'工廠名稱對照管理', node:aliasSection }
    ];

    if (aliasSection) aliasSection.classList.remove('mt-4','border-t','pt-3');

    definitions.forEach((def,index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `flare-tab-button${index === 0 ? ' is-active' : ''}`;
      button.textContent = def.label;
      button.dataset.target = `flare-panel-${def.id}`;
      button.setAttribute('role','tab');

      const panel = makePanel(`flare-panel-${def.id}`);
      if (index === 0) panel.classList.add('is-active');
      if (def.node) panel.appendChild(def.node);
      else {
        const empty = document.createElement('div');
        empty.textContent = '此功能目前沒有可顯示的內容。';
        empty.style.cssText = 'padding:24px;color:#64748b;text-align:center;';
        panel.appendChild(empty);
      }

      button.addEventListener('click', () => {
        workspace.querySelectorAll('.flare-tab-button').forEach(btn => btn.classList.remove('is-active'));
        workspace.querySelectorAll('.flare-input-tab-panel').forEach(p => p.classList.remove('is-active'));
        button.classList.add('is-active');
        panel.classList.add('is-active');
      });

      tabs.appendChild(button);
      content.appendChild(panel);
    });

    mainLayout.prepend(workspace);
    document.querySelector('.entry-panel')?.classList.add('flare-input-hide');
    document.querySelector('.exclusion-panel')?.classList.add('flare-input-hide');
    document.querySelector('.excel-panel')?.classList.add('flare-input-hide');
  }

  function applyLayout() {
    if (isInputView) configureInputView();
    else configureReportView();
  }

  if (document.readyState === 'complete') setTimeout(applyLayout,0);
  else window.addEventListener('load',() => setTimeout(applyLayout,0),{ once:true });
})();
