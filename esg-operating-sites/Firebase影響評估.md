# R0.2 Firebase 影響評估
沿用原 Firebase 專案、Web Config、Authentication、Firestore `(default)` 與既有單一管理員權限。
- `esg_operating_sites/records/items/{id}`
- `esg_operating_sites/history/items/{id}`
- `esg_operating_sites/settings`
- `esg_operating_sites/notes`

以上路徑及資料欄位完全沿用。cloud.js 逐位元未改動。總覽、篩選與統計為前端讀取後計算，不新增寫入、不做遷移、不清除資料。原有操作仍按 R0.1 邏輯讀寫；不需要重匯 Excel。
未發布 Rules、未操作正式資料、Authentication、Storage、Actions 或 GitHub。正式權限和跨裝置雲端讀寫需部署後驗收。
