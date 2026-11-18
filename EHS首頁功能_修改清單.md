# EHS 首頁功能統一優化 R1.0｜修改清單

- 版本：R1.0
- 日期：2026-11-18
- 輸入來源：`ehs-management-portal-main (2)(1).zip`
- 原則：以 EHS 智慧行事曆 R0.4 的標題右上角白底細框按鈕為範本，單分頁返回 EHS 入口，不再使用浮動遮蓋的首頁按鈕。
- 首頁網址：`https://doublewater0804.github.io/ehs-management-portal/`

## 變更方式

1. 根目錄 `ehs-home-button.js`：改為依子系統識別、插入各頁面標題功能列最後方；`position: fixed` 全面取消。
2. 根目錄 **新增** `ehs-home-button.css`：統一白色底、細邊框、圓角、🏠 圖示、「EHS 首頁」文字，增加手機及平板版型規則、列印隱藏。
3. 既有 17 個使用共用 JS 的業務頁面，全面更新 JS 版本查詢參數 `v=20261118-r1`，避免瀏覽器繼續快取舊的浮動版 JS。
4. 主管交辦、颱風值勤、每週重點、週報中心：加入共用 JS；原有重複入口連結統一處理。
5. React 專案總表：在 React 的標題功能列中原生加入首頁連結，直接引用共用 CSS，避免對 React 元件直接插入外部 DOM 造成衝突。
6. 智慧行事曆 R0.4 已符合樣式，保留原始功能不變。
7. 颱風值勤沿用 `#homeBtn` 既有 ID（其 `app.js` 與 `app-bundle.js` 仍引用此元素），僅統一位置與外觀。
8. FLARE 資料輸入重導向頁 `FLARE/data-input.html` 非業務主頁面，移除無作用的共用浮動按鈕載入，保留直接跳轉至主頁的行為。

## 22 個業務／管理系統逐一處理

| # | 系統名稱 | 程式路徑 | R1.0 處理 |
|---:|---|---|---|
| 1 | 廠區廢氣燃燒塔管制表 FLARE | `FLARE/index.html` | 浮動→頁首工具列 |
| 2 | 環評案件管理系統 | `eia/index.html` | 浮動→頁首工具列 |
| 3 | 環保規費 Dashboard | `env-fee/index.html` | 浮動→標題右側 |
| 4 | 台化環保罰單 Dashboard | `environmental-fines/index.html` | 浮動→頁首工具列 |
| 5 | 設備元件 VOC 檢測管理 | `equipment-voc/index.html` | 浮動→頁首工具列 |
| 6 | 廢氣燃燒塔使用計畫書平台 | `flare-management/index.html` | 浮動→標題右側；移除不穩定上一頁按鈕 |
| 7 | 事故調查輪值人員管理 | `incident-investigation/index.html` | 浮動→頁首工具列 |
| 8 | 安全衛生處組織編制管理 | `organization-management/index.html` | 浮動→頁首工具列 |
| 9 | 個人工作績效 Dashboard | `performance/index.html` | 浮動→頁首工具列 |
| 10 | 環保例行工作 Dashboard | `routine-work/index.html` | 浮動→頁首工具列；窄螢幕側欄防遮擋 |
| 11 | 定檢（工檢）工安業務管理 | `shutdown-inspection/index.html` | 浮動→頁首工具列 |
| 12 | 貯存設施統計表 | `storage-facilities/index.html` | 浮動→頁首工具列 |
| 13 | 環安衛工作管理系統 | `task/index.html` | 浮動→頁首工具列 |
| 14 | 毒化物無預警應變演練統計 | `toxic-drill/index.html` | 浮動→標題工具列 |
| 15 | 廢棄物清運合約管控 | `waste-contract-control/index.html` | 浮動→頁首工具列 |
| 16 | 個人工作內容與工時分析 | `workhours/index.html` | 浮動→頁首工具列 |
| 17 | 年度安衛環專案管制總表 | `project/index.html` | React 內嵌統一按鈕 |
| 18 | EHS 智慧行事曆 R0.4 | `calendar/index.html` | 標準範本，保留不變 |
| 19 | 主管交辦布告欄 | `supervisor-board/index.html` | 原生返回連結→共用標準按鈕 |
| 20 | 安衛處颱風值勤 | `typhoon-duty/index.html` | 保留 `#homeBtn` 原 ID，樣式標準化及重排 |
| 21 | 每周安全永續組工作重點 | `weekly-focus/index.html` | 左側返回入口→標題右側按鈕 |
| 22 | EHS 自動週報管理中心 | `weekly-report/index.html` | 左側返回入口→標題右側按鈕 |

> 共用腳本註冊表實際含 20 個系統，含舊浮動 16 個與新接入 4 個；第 17 個舊浮動使用者（React 專案）改採原生按鈕，不再載入該腳本。

## 資料與登入設定保護

- 未修改 `portal/defaults.json`、`portal/builtins.js`、`portal/cloud.js`、Firestore Rules、Firebase 驗證設定、`.github/workflows` 或原有業務資料檔。
- 未連線正式 Firebase、未登入正式 GitHub、未修改遠端資料或現行正式版。
- 入口清單可以由 Firestore 動態管理；對於沒有包含在本 ZIP 中的外部 Repository，無法在本包內同步修改，需另外提供原始碼。

## 後續新增系統的共用規範

新增業務系統時，應在其標題功能列加入標準導覽連結，使用相同 CSS 樣式及相對入口路徑；採共用 JS 的頁面須在 `ehs-home-button.js` 的 `hosts` 註冊其系統目錄與標題操作區 CSS selector。React／Vue 等框架頁面應在框架內原生渲染連結，避免外部腳本直接修改框架管理的節點。
