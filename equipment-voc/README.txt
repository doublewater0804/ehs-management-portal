設備元件 VOC 檢測管理系統 R0.1
================================

系統用途
- 管理每季 VOC >= 1,000 ppm 設備元件檢測統計。
- 13 個固定廠別、4 個事業部。
- 圖片 OCR、人工校對、季度版本管理、Dashboard、歷年比較。
- 沿用 EHS Portal Firebase Authentication 與 portal/config.js。

資料位置
- Firestore：equipment_voc_records、equipment_voc_quarters
- Firebase Storage：equipment-voc/{管理員 UID}/{年度季度}/
- 不修改既有 Firestore Rules；Storage Rules 尚待正式環境檢查。

OCR 技術
- Tesseract.js 5.1.1，數字採英文模型，廠別及備註採繁體中文與英文模型。
- OCR 在瀏覽器端執行；第一次使用需連線下載 OCR 程式及語言模型。
- 圖片不會傳送至 OCR 服務；使用者按下確認儲存後，原始圖片才上傳至 Firebase Storage。
- OCR 僅為初步辨識，必須人工核對。

重要限制
- OCR 依目前統計表的固定版型與 13 個廠別順序定位。
- 若來源表格增刪廠別、調整欄位或改變版面，需先更新 OCR 定位程式。
- 圖片解析度、壓縮及表格線可能影響辨識；所有數字均須人工核對。
- 本套件不包含使用者原始季度圖片或公司統計數字，避免將內部資料放入公開 GitHub Repository。
