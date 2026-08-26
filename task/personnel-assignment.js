/* Compatibility loader for simplified Factory -> People management. */
(() => {
  'use strict';

  if (document.querySelector('script[data-ehs-task-personnel-management-v3]')) {
    return;
  }

  const script = document.createElement('script');
  script.src = './personnel-management.js?v=7';
  script.defer = true;
  script.dataset.ehsTaskPersonnelManagementV3 = '1';
  document.head.appendChild(script);
})();
