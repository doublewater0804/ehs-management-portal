// R0.3 正式 Firebase 模式：沿用同一網域 EHS Portal 的 portal/config.js。
// 此檔不包含帳號密碼、私鑰；若入口專案設定異動，會在登入時讀取新版設定。
window.EHS_TYPHOON_CONFIG = Object.freeze({
  mode: 'firebase',
  portalConfigModule: '../portal/config.js',
  portalHome: 'https://doublewater0804.github.io/ehs-management-portal/'
});
