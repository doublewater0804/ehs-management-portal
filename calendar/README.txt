EHS 智慧行事曆 R0.2｜Google 行事曆改用 ICS

部署方式：這是行事曆子系統增量更新，將部署包內 calendar/ 的五個檔案上傳至 GitHub 儲存庫同名路徑；只覆蓋指定既有檔案，不覆蓋其他資料夾。

新增：calendar/ics.js
覆蓋：calendar/index.html、calendar/app.js、calendar/logic.js、calendar/README.txt
不需要更新：calendar/config.js、calendar/holidays.js、calendar/style.css，以及 portal/、backend/、.github/workflows/ 和其他 EHS 子系統。

版本 R0.2 功能：
1. 匯入 Google Calendar .ics（單檔最多 5MB、最多 5000 個 VEVENT），先顯示預覽，疑似重複預設不勾選，按確認才寫入 Firebase。
2. 匯出 Google Calendar .ics，套用選擇的日期區間、目前分類與搜尋篩選，最多一年。繁體中文 UTF-8，使用 RFC 5545 的 UTC 時間（正確由 Asia/Taipei 轉換），全天活動採日期格式。
3. 可辨識基本每天／每週／每月週期規則 RRULE；匯出範圍內兩次以上的週期保留 RRULE。Google ICS 的複雜規則、多個 BYDAY、跳過日期 EXDATE、個別修改 RECURRENCE-ID、RDATE 等不會不正確簡化，而是顯示為無法匯入／提示處理。
4. 沒有結束時間的非全天活動不會自動補一小時或當成全天；匯出前列出略過的行程。Google Calendar 匯入後不會與 EHS 雙向同步。
5. 原本 EHS 的行程、分類、月份備註與 Firestore 路徑均沿用，不需要修改 Firebase Web 設定或 Firestore Rules。

正式資料：仍在 esh-v85 專案內的 ehs_smart_calendar_r0/data/*；無資料遷移、無刪除舊資料。Google ICS 匯入前須檢查活動預覽及重複提示。

備份與回復：部署前備份四個待覆蓋檔案。如需回復至 R0.1，將 R0.1 的 calendar/index.html、calendar/app.js、calendar/logic.js、calendar/README.txt 復原；ics.js 可保留不使用。已匯入 Firestore 的資料不會因回復程式而自動刪除。

驗收：部署後開啟智慧行事曆，登入既有 Google 管理員帳號，測試 ICS 匯入預覽、確認儲存、重新整理、ICS 匯出及 Google 日曆匯入、智慧新增、分類、月份備註和假日底色。

注意：本機通過 18 項 ICS/解析單元測試及程式靜態驗證；由於執行環境阻擋本機頁面導航，未完成自動化瀏覽器端到端及正式 Firebase／Google 匯入驗收。
