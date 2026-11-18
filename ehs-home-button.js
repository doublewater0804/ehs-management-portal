/* EHS 首頁統一導覽 R1.0。
 * 按鈕嵌入各子系統標題功能列，不使用 position:fixed，不改動 Firebase 或頁面業務資料。
 */
(() => {
  'use strict';
  const script = document.currentScript;
  const scriptUrl = script && script.src ? new URL(script.src) : new URL('../ehs-home-button.js', location.href);
  const rootUrl = new URL('./', scriptUrl);
  const portalUrl = rootUrl.href;
  const buttonId = 'ehs-portal-home-button';
  const rootPath = rootUrl.pathname;
  const relative = location.pathname.startsWith(rootPath) ? location.pathname.slice(rootPath.length) : '';
  const system = relative.split('/')[0];

  // 適配表：所有業務子系統的「標題區右上角功能列」，避免錯誤插入其他內容區域。
  const hosts = {
    'FLARE': '.app-shell > div:first-child > div:nth-child(2)',
    'eia': 'header.topbar .top-actions',
    'env-fee': '.app > main > .header',
    'environmental-fines': 'header.top .actions',
    'equipment-voc': 'header.topbar .top-actions',
    'flare-management': 'header.topbar .ehs-home-status-actions',
    'incident-investigation': 'body > header .toolbar',
    'organization-management': 'header.app-header .header-actions',
    'performance': 'section.topbar .actions',
    'routine-work': 'main > .top .actions',
    'shutdown-inspection': 'body > header .account',
    'storage-facilities': 'body > header .account',
    'task': 'body > nav > div > div.flex.justify-between > div:last-child',
    'toxic-drill': 'header.page-topbar',
    'waste-contract-control': 'header.topbar .top-actions',
    'workhours': 'body > header > div > div:last-child',
    'supervisor-board': 'header.topbar .header-end',
    'typhoon-duty': 'header.topbar .toplinks',
    'weekly-focus': '#report.topbar .top-actions',
    'weekly-report': 'body > header .bar'
  };
  if (!(system in hosts)) return;
  document.body && document.body.classList.add('ehs-home--' + system);

  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('ehs-home-button.css?v=20261118-r1', rootUrl).href;
  stylesheet.dataset.ehsHomeStyle = 'r1';
  if (!document.querySelector('link[data-ehs-home-style]')) document.head.appendChild(stylesheet);

  function insert() {
    const host = document.querySelector(hosts[system]);
    if (!host) return false;
    if (document.getElementById(buttonId)) return true;
    host.classList.add('ehs-home-action-host');
    // 颱風系統應用程式會以 #homeBtn 更新連結，必須保留原 ID 以免破壞登入後狀態更新。
    if (system === 'typhoon-duty') {
      const nativeHome = document.getElementById('homeBtn');
      if (nativeHome) {
        nativeHome.classList.add('ehs-home-native-button');
        nativeHome.href = portalUrl;
        nativeHome.target = '_self';
        nativeHome.setAttribute('aria-label', 'EHS 首頁');
        nativeHome.title = '返回 EHS 管理入口網站';
        nativeHome.innerHTML = '<span class="ehs-home-icon" aria-hidden="true">🏠</span><span>EHS 首頁</span>';
        host.appendChild(nativeHome); // 最後方；保留程式原本使用的 #homeBtn
        return true;
      }
    }
    const home = document.createElement('a');
    home.id = buttonId;
    home.href = portalUrl;
    home.target = '_self';
    home.setAttribute('aria-label', 'EHS 首頁');
    home.title = '返回 EHS 管理入口網站';
    home.innerHTML = '<span class="ehs-home-icon" aria-hidden="true">🏠</span><span>EHS 首頁</span>';
    host.appendChild(home);  // 最後一個操作按鈕
    return true;
  }

  // 所有目標系統的標題容器都在靜態 HTML 內；若外部程式延遲掛載，短暫監看一次。
  function start() {
    document.body.classList.add('ehs-home--' + system);
    if (insert()) return;
    const observer = new MutationObserver(() => {
      if (insert()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 10000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
