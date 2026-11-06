EHS 智慧行事曆 R0.1（只更新本 calendar/ 子系統）

頁面：/ehs-management-portal/calendar/index.html
沿用 ../portal/config.js Firebase Web 設定與既有 Google 登入；不需修改 Firestore Rules。
本次新增「新增行程」功能列、當日行程上移、月份備註、完整年月標題及台灣政府辦公日曆底色。
月份備註 Firebase 路徑：ehs_smart_calendar_r0/data/monthly_notes/YYYY-MM
行程、分類、提醒及既有後端 GitHub Actions 的程式未更動。

假日來源：人事行政總處已核定的 2026、2027 年辦公日曆，內建於 holidays.js。
紅色＝核定國定假日／補假；灰藍＝核定一般非上班日；白色＝核定上班日。
其他年度不推測休假資訊，顯示「假日資料未提供」；政府年度資料更新後需更新 holidays.js。
官方開放資料：https://data.gov.tw/dataset/14718
2026 核定：https://www.dgpa.gov.tw/information?pid=12574&uid=82
2027 核定：https://www.dgpa.gov.tw/information?pid=12983&uid=2

正式部署請參閱獨立 R0.1 部署說明 PDF。
