(() => {
  const SCRIPT_URL = document.currentScript?.src || '';
  const BUTTON_ID = 'ehs-portal-home-button';
  const STYLE_ID = 'ehs-portal-home-button-style';

  function installHomeButton() {
    if (document.getElementById(BUTTON_ID)) return;

    const portalUrl = SCRIPT_URL
      ? new URL('./', SCRIPT_URL).href
      : new URL('../', window.location.href).href;

    if (!document.getElementById(STYLE_ID)) {
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
        #${BUTTON_ID} {
          position: fixed;
          top: max(12px, env(safe-area-inset-top));
          right: max(12px, env(safe-area-inset-right));
          z-index: 2147483647;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          min-height: 42px;
          padding: 9px 14px;
          border: 1px solid rgba(15, 23, 42, 0.14);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.96);
          color: #0f172a;
          font: 700 14px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft JhengHei", sans-serif;
          text-decoration: none;
          box-shadow: 0 5px 18px rgba(15, 23, 42, 0.18);
          -webkit-backdrop-filter: blur(10px);
          backdrop-filter: blur(10px);
          -webkit-tap-highlight-color: transparent;
        }
        #${BUTTON_ID}:hover,
        #${BUTTON_ID}:focus-visible {
          background: #f8fafc;
          box-shadow: 0 7px 22px rgba(15, 23, 42, 0.24);
          outline: none;
        }
        #${BUTTON_ID}:active {
          transform: translateY(1px);
        }
        #${BUTTON_ID} .ehs-home-short { display: none; }
        @media (max-width: 600px) {
          #${BUTTON_ID} {
            min-height: 40px;
            padding: 8px 12px;
            font-size: 13px;
          }
          #${BUTTON_ID} .ehs-home-full { display: none; }
          #${BUTTON_ID} .ehs-home-short { display: inline; }
        }
        @media print {
          #${BUTTON_ID} { display: none !important; }
        }
      `;
      document.head.appendChild(style);
    }

    const home = document.createElement('a');
    home.id = BUTTON_ID;
    home.href = portalUrl;
    home.target = '_self';
    home.setAttribute('aria-label', '返回 EHS 管理入口平台');
    home.setAttribute('title', '返回 EHS 管理入口平台');
    home.innerHTML = '<span aria-hidden="true">🏠</span><span class="ehs-home-full">EHS首頁</span><span class="ehs-home-short">首頁</span>';
    document.body.appendChild(home);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installHomeButton, { once: true });
  } else {
    installHomeButton();
  }
})();
