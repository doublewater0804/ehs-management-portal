// Deployment-added modules appear even when an older cloud catalog exists.
// Existing entries (including hidden or reclassified entries) always win.
const registration = {
  "id": "storage-facilities",
  "title": "防止貯存系統污染地下水體-貯存設施統計表",
  "description": "管理地上儲槽、地下儲槽與貯存容器基本資料，共用監測設定、井數統計及 Excel 匯出。",
  "href": "storage-facilities/index.html",
  "category": "environment",
  "order": 130,
  "visible": true,
  "favorite": false
};
export function registeredRows(rows) {
 const exists=rows.some(r=>r.id===registration.id || new URL(r.href,'https://doublewater0804.github.io/ehs-management-portal/').pathname==='/ehs-management-portal/storage-facilities/index.html');
 return exists?rows:[...rows,{...registration}];
}
