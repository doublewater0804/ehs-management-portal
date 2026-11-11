設備元件 VOC 檢測管理系統 R0.1.1
================================

本版修改：取消 Firebase Storage 原始圖片上傳、下載、刪除及上傳失敗造成的儲存阻擋。

使用方式
1. 上傳 PNG/JPG 圖片，僅在瀏覽器本機執行 Tesseract.js OCR 與預覽。
2. 人工核對 13 個廠別、四大設備類別的檢測數及異常數。
3. 勾選確認後，將統計數據、備註、年度/季度與版本資訊儲存到 Firestore。
4. 原始圖片沒有存入 Firebase；頁面重整或關閉後無法再顯示，請自行保存原檔。
5. 已有紀錄可直接進入修正版編輯；資料修改並不強制重新上傳圖片。

資料路徑
- Firestore：equipment_voc_records、equipment_voc_quarters（沿用既有 Collection）
- Firebase Storage：本版完全不呼叫；不需要修改 Storage Rules。
- 每筆新版本設 sourceImagePath:null、sourceImageStored:false；sourceFileName 僅保存檔名字串。
- 既有 Firestore 歷史版本保留；舊版若有 sourceImagePath，不自動遷移或刪除原 Storage 物件。

保留功能
- Dashboard、季度統計表、歷年比較、版本紀錄、Excel、列印/PDF。
- Tesseract.js 5.1.1 及現有 OCR 定位程式均不變。
- EHS 管理員 Google 登入、Firestore 權限及返回首頁按鈕不變。

限制與驗收
- 第一次需連線下載 Tesseract.js 及語言模型；公司圖片不交給第三方 OCR API。
- 目前 OCR 仍依固定表格版型定位，需人工檢查。
- 正式 GitHub Pages / Firestore 寫入需部署後進行登入和存檔實測。
- 請勿把本子系統的 index.html、app.js 上傳到 GitHub Repository 根目錄。
