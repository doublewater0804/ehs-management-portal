EHS 智慧行事曆 R0.3｜行程顯示優化

【本次修改】
1. 當日行程改用各分類設定顏色所衍生的淺色底，已停用分類的歷史活動同樣沿用其顏色。
2. 當日行程類別標籤移至最前，顯示順序為：類別 → 開始時間（如有）→ 活動名稱 → 行程狀態；地點仍顯示。
3. 未設定開始時間者，當日行程及月份月曆不再顯示「未定時間」；明確設定的全天行程仍顯示「全天」。
4. 當日行程依「分類管理」目前顯示順序集中排列。同類別先排有開始時間者（由早到晚），無開始時間者最後；相同時間按活動名稱及 ID 穩定排序。月曆維持原先時間排序。
5. 既有 Firebase 資料、分類定義、ICS、假日底色、月份備註、Discord 等功能不變。

【部署】
本次增量更新僅需將 calendar/ 下 3 個檔案覆蓋原檔：index.html、app.js、style.css；並新增 display.js。
在 GitHub 根目錄對應同名 calendar/ 放置。不要覆蓋 portal/、backend/、.github/workflows/ 或其他 EHS 子系統。
依照本 ZIP 內與獨立提供的 R0.3_部署說明.txt 進行部署、回復與驗收。

【版本與衝突】
程式以既有 R0.2 ICS 增量包的 calendar/index.html、app.js，以及 R0.1 的 calendar/style.css 為基準；不變更 logic.js、ics.js、config.js、holidays.js。
如果 GitHub 上上述三個待覆蓋檔案在 R0.2 後有其他修改，請先比對合併，不可直接使用舊基準覆蓋。
