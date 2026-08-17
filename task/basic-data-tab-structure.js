/* Basic data tab structure fix v3
 * Remove the original horizontal scroll-container classes from the tab row.
 * This is a DOM structure correction, not a visual-only CSS override.
 */
(() => {
  'use strict';

  function patchBasicDataTabs() {
    const tabs = document.getElementById('master-tabs');
    if (!tabs) return;

    const shell = tabs.parentElement;
    if (shell) {
      shell.classList.remove('overflow-x-auto');
      shell.classList.add('overflow-visible');
      shell.style.overflow = 'visible';
      shell.style.overflowX = 'visible';
      shell.style.overflowY = 'visible';
      shell.style.minHeight = '62px';
      shell.style.paddingTop = '12px';
      shell.style.paddingBottom = '4px';
    }

    tabs.classList.remove('min-w-max');
    tabs.classList.add('w-full', 'min-w-0', 'flex-wrap');
    tabs.style.width = '100%';
    tabs.style.minWidth = '0';
    tabs.style.overflow = 'visible';
    tabs.style.alignItems = 'stretch';
    tabs.style.minHeight = '46px';

    [...tabs.children].forEach((button) => {
      button.style.minHeight = '46px';
      button.style.lineHeight = '1.35';
      button.style.overflow = 'visible';
      button.style.flexShrink = '0';
    });
  }

  function startObserver() {
    patchBasicDataTabs();
    if (!document.body) return;

    const observer = new MutationObserver(() => patchBasicDataTabs());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  } else {
    startObserver();
  }

  window.addEventListener('load', patchBasicDataTabs, { once: true });
})();
