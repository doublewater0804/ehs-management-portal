// 複製本檔為 config.js，再依部署說明設定。
// demo: 僅瀏覽器本機示範資料，不接正式雲端；firebase: 實際連結既有 EHS Firebase 專案。
window.EHS_TYPHOON_CONFIG = {
  mode: 'demo',
  firebaseConfig: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    appId: ''
  },
  ownerUid: '', // 只有這個 Firebase Authentication UID 可修改；Firestore Rules 也需使用同一 UID。
  portalHome: 'https://doublewater0804.github.io/ehs-management-portal/'
};
