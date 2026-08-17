/* Compatibility loader.
 * Personnel management is implemented by personnel-management.js.
 * Existing Basic Data people/units are imported by personnel-legacy-import.js.
 */
(() => {
  'use strict';

  function loadImporter() {
    if (document.querySelector('script[data-ehs-task-personnel-legacy-import]')) return;
    const importer = document.createElement('script');
    importer.src = './personnel-legacy-import.js?v=2';
    importer.defer = true;
    importer.dataset.ehsTaskPersonnelLegacyImport = '1';
    document.head.appendChild(importer);
  }

  if (document.querySelector('script[data-ehs-task-personnel-management-v3]')) {
    loadImporter();
    return;
  }

  const script = document.createElement('script');
  script.src = './personnel-management.js?v=4';
  script.defer = true;
  script.dataset.ehsTaskPersonnelManagementV3 = '1';
  script.onload = loadImporter;
  document.head.appendChild(script);
})();
