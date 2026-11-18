# EHS 首頁功能統一優化 R1.0｜驗收紀錄

日期：2026-11-18

| 檢查項目 | 結果 | 備註 |
|---|---|---|
| ZIP 原始檔解壓 | 通過 | 來源 `ehs-management-portal-main (2)(1).zip`，無損壞 |
| 22 個業務系統清單 | 通過 | 20 個共用按鈕、1 個 React 內嵌、1 個智慧行事曆原生 |
| 共用 JS 語法檢查 | 通過 | `node --check` |
| 20 系統共用 JS 模擬執行 | 通過 | 20／20；未建立重複按鈕、連結與 target 正確 |
| 20 系統 HTML 標題操作區 selector | 通過 | BeautifulSoup CSS selector 每個精確匹配 1 個節點 |
| 20 系統三寬度版面檢查 | 通過 | 390px、768px、1440px，共 60 組；離線 HTML+CSS 模擬環境 |
| 統一按鈕不再固定浮動 | 通過 | CSS `position: static`；共用 JS 不再設定 fixed |
| EHS 首頁網址 | 通過 | `https://doublewater0804.github.io/ehs-management-portal/` |
| 單分頁返回 | 通過（程式碼） | `target="_self"`；未實測正式網站導頁 |
| 颱風值勤 `#homeBtn` 相容性 | 通過（程式碼） | 原 ID 保留，原應用程式仍可修改 href |
| React 專案內嵌連結 | 通過（靜態） | 包含一般狀態與載入中畫面；未接正式 Firebase 渲染 |
| 智慧行事曆按鈕 | 保留 | 範本 R0.4 原始頁面不變 |
| Firebase、Firestore、登入權限 | 未改動 | 未操作正式雲端；部署後需實際登入驗收 |
| GitHub Pages 線上部署 | 尚未執行 | 使用者自行部署 |
| iPad／iPhone 實機、PWA | 尚未執行 | 需部署後實際測試 |
| 外部 Repository 與 Firestore 動態子系統 | 未涵蓋 | 本 ZIP 以外的原始碼未取得 |

> 以上離線版面檢查使用移除外部 CDN/登入腳本後的 HTML＋CSS 測試，不等同正式環境端到端驗收；FLARE 頁面依 CSS 隱藏模態框進行檢查。
