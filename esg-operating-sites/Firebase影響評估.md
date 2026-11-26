# Firebase 影響評估 R0.1
沿用 `../portal/config.js` 的現有 esh-v85 Web 設定、命名 app `ehs-portal`、預設 Firestore、Google 登入。前端僅允許已驗證之既有管理員 email；實際讀寫由正式 Rules 控制。沿用 R3 記載的既有 Rules 基準，不重新發布。

| 路徑 | 用途 |
|---|---|
| `esg_operating_sites/records/items/{id}` | 每筆清單獨立自動 ID，values（11欄）、region、reason、deleted、createdAt、updatedAt、updatedBy |
| `esg_operating_sites/history/items/{id}` | recordId、action、before、after、at、uid、reason；新增、修改、軟刪除、恢復均記錄 |
| `esg_operating_sites/settings` | 全系統 revision、options、updatedAt |
| `esg_operating_sites/notes` | text、updatedAt、updatedBy |

交易比對 revision，紀錄、歷程與版本同一交易提交；每批最多200筆變更（401筆交易寫入以下），若資料過大或網路失敗則顯示錯誤。已回收資料不直接更新；不提供永久刪除。初始資料從登入後的瀏覽器本機 Excel 匯入，不預載至公開網頁。

正式環境無操作，未確認現場 Rules 是否與2026-10-23 基準一致，正式權限與實際交易仍待部署驗收。不需 Storage、Functions、排程或新增索引。歷史保留為應用程式層設計，不宣稱是不可竄改的稽核庫；現有管理員 Rules 仍可直接管理 Firestore。資料量增大後，因全量讀取歷史需評估分頁、用量及成本。
