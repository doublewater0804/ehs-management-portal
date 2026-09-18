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
 const next=exists?rows:[...rows,{...registration}];
 return next.some(r=>r.id==='incident-investigation')?next:[...next,{id:'incident-investigation',title:'事故調查輪值人員管理',description:'台灣、大陸及越南輪值設定、人員名冊、調查紀錄與 A4 橫式列印。',href:'incident-investigation/index.html',category:'incident',order:140,visible:true,favorite:false}];
}
