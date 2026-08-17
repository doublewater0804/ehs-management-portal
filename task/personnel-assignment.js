/* Compatibility loader.
 * Personnel management is implemented by personnel-management.js v3.
 * Keeping this filename avoids changing the shared Firebase loader again.
 */
(() => {
  'use strict';
  if (document.querySelector('script[data-ehs-task-personnel-management-v3]')) return;
  const script = document.createElement('script');
  script.src = './personnel-management.js?v=1';
  script.defer = true;
  script.dataset.ehsTaskPersonnelManagementV3 = '1';
  document.head.appendChild(script);
})();
