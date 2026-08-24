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
    html.flare-report-view .entry-panel,
    html.flare-report-view .exclusion-panel,
    html.flare-report-view .excel-panel { display:none !important; }
    html.flare-report-view .main-layout {
      display:block !important;
      overflow:visible !important;
      padding-bottom:0 !important;
    }
    html.flare-report-view .report-panel {
      width:min(1100px, 100%) !important;
      min-width:0 !important;
      margin:0 auto !important;
    }
    html.flare-report-view .report-card { width:100% !important; }

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
    #flare-input-workspace {
      width:min(1180px, 100%);
      margin:0 auto;
      background:#fff;
      border:1px solid #e2e8f0;
      border-radius:16px;
      box-shadow:0 10px 30px rgba(15,23,42,.08);
      overflow:hidden;
    }
    #flare-input-workspace .flare-input-header {
      padding:20px 22px 16px;
      border-bottom:1px solid #e2e8f0;
      background:linear-gradient(180deg,#f8fbff 0%,#fff 100%);
    }
    #flare-input-workspace .flare-input-title {
      margin:0;
      color:#0f172a;
      font-size:22px;
      font-weight:900;
    }
    #flare-input-workspace .flare-input-subtitle {
      margin:6px 0 0;
      color:#64748b;
      font-size:13px;
      line-height:1.6;
    }
    #flare-input-workspace .flare-input-tabs {
      display:flex;
      flex-wrap:wrap;
      gap:8px;
      padding:14px 18px;
      background:#f8fafc;
      border-bottom:1px solid #e2e8f0;
    }
    #flare-input-workspace .flare-tab-button {
      border:1px solid #cbd5e1;
      background:#fff;
      color:#475569;
      border-radius:10px;
      padding:9px 14px;
      font-size:13px;
      font-weight:800;
      cursor:pointer;
      transition:.15s ease;
    }
    #flare-input-workspace .flare-tab-button:hover {
      border-color:#93c5fd;
      color:#1d4ed8;
      background:#eff6ff;
    }
    #flare-input-workspace .flare-tab-button.is-active {
      border-color:#2563eb;
      color:#fff;
      background:#2563eb;
      box-shadow:0 4px 12px rgba(37,99,235,.22);
    }
    #flare-input-workspace .flare-input-content { padding:20px; }
    #flare-input-workspace .flare-input-tab-panel { display:none; }
    #flare-input-workspace .flare-input-tab-panel.is-active { display:block; }
    #flare-input-workspace .flare-input-tab-panel > * {
      width:100% !important;
      min-width:0 !important;
      max-width:none !important;
      box-shadow:none !important;
      margin:0 !important;
    }
    html.flare-input-view .exclusion-scroll { max-height:420px !important; }
    html.flare-input-view #factory-map-form { grid-template-columns:1fr 220px 180px !important; align-items:end; }
    html.flare-input-view #factory-map-form button { min-height:38px; }
    .flare-nav-link {
      display:inline-flex;
      align-items:center;
      justify-content:center;
      min-height:38px;
      padding:8px 13px;
      border-radius:8px;
      font-size:13px;
      font-weight:800;
      text-decoration:none;
      white-space:nowrap;
    }
    .flare-nav-link.input-link { background:#7c3aed; color:#fff; }
    .flare-nav-link.input-link:hover { background:#6d28d9; }
    .flare-nav-link.report-link { background:#0f172a; color:#fff; }
    .flare-nav-link.report-link:hover { background:#1e293b; }
    @media (max-width:760px) {
      #flare-input-workspace .flare-input-content { padding:12px; }
      #flare-input-workspace .flare-input-header { padding:16px; }
      html.flare-input-view #factory-map-form { grid-template-columns:1fr !important; }
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

  function configureReportView() {
    const toolbar = getTopToolbar();
    if (toolbar && !document.getElementById('flare-open-input-page')) {
      const link = makeLink('./data-input.html', '資料輸入', 'input-link');
      link.id = 'flare-open-input-page';
      toolbar.insertBefore(link, document.getElementById('firebase-sync-status'));
    }
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
    // data-input.html is the public entry point; keep that address visible after the redirect page hands off to index.html.
    try {
      if (window.location.pathname.endsWith('/index.html')) {
        history.replaceState({ flareView: 'input' }, '', './data-input.html');
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
        const back = makeLink('./index.html', '← 返回統計報表', 'report-link');
        back.id = 'flare-back-report-page';
        toolbar.insertBefore(back, status || toolbar.firstChild);
      }
    }

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
        <h2 class="flare-input-title">資料輸入與清單管理</h2>
        <p class="flare-input-subtitle">輸入、維護與人工剔除集中於此頁；統計報表維持獨立主畫面。</p>
      </div>
      <div class="flare-input-tabs" role="tablist"></div>
      <div class="flare-input-content"></div>`;

    const tabs = workspace.querySelector('.flare-input-tabs');
    const content = workspace.querySelector('.flare-input-content');
    const definitions = [
      { id: 'schedule', label: '定檢期間', node: scheduleCard },
      { id: 'manual-event', label: '人工排放', node: manualCard },
      { id: 'exclusion', label: '人工剔除／清單', node: exclusionCard },
      { id: 'factory-alias', label: '工廠對照', node: aliasSection }
    ];

    // 工廠對照原本位於「設定預計定檢期間」卡片底部，先拆出再搬移。
    if (aliasSection) {
      aliasSection.classList.remove('mt-4', 'border-t', 'pt-3');
    }

    definitions.forEach((def, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `flare-tab-button${index === 0 ? ' is-active' : ''}`;
      button.textContent = def.label;
      button.dataset.target = `flare-panel-${def.id}`;
      button.setAttribute('role', 'tab');

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

  if (document.readyState === 'complete') {
    setTimeout(applyLayout, 0);
  } else {
    window.addEventListener('load', () => setTimeout(applyLayout, 0), { once: true });
  }
})();
