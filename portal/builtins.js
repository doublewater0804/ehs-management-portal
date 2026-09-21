// Deployment-added modules appear even when an older cloud catalog exists.
// Existing entries (including hidden or reclassified entries) always win.
const registrations = [
  {
    id: 'storage-facilities',
    title: '防止貯存系統污染地下水體-貯存設施統計表',
    description: '管理地上儲槽、地下儲槽與貯存容器基本資料，共用監測設定、井數統計及 Excel 匯出。',
    href: 'storage-facilities/index.html',
    category: 'environment',
    order: 130,
    visible: true,
    favorite: false
  },
  {
    id: 'incident-investigation',
    title: '事故調查輪值人員管理',
    description: '台灣、大陸及越南輪值設定、人員名冊、調查紀錄與 A4 橫式列印。',
    href: 'incident-investigation/index.html',
    category: 'incident',
    order: 140,
    visible: true,
    favorite: false
  },
  {
    id: 'organization-management',
    title: '安全衛生處組織編制管理',
    description: '安全衛生處組織圖、人員資料、版次異動、Excel 匯入匯出及固定版型 PDF 輸出。',
    href: 'organization-management/index.html',
    category: 'admin',
    order: 150,
    visible: true,
    favorite: false
  }
];

export function registeredRows(rows) {
  let next=[...rows];
  for(const registration of registrations){
    const target=new URL(registration.href,'https://doublewater0804.github.io/ehs-management-portal/').pathname;
    const exists=next.some(r=>r.id===registration.id || new URL(r.href,'https://doublewater0804.github.io/ehs-management-portal/').pathname===target);
    if(!exists)next.push({...registration});
  }
  return next;
}
