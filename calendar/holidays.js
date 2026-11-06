/**
 * EHS 智慧行事曆 R0.1 政府行政機關辦公日曆（臺灣）
 * 原則：僅內建已核對核定的 2026、2027 年；不推算其他年度或公司假別。
 * 2026 來源：https://www.dgpa.gov.tw/information?pid=12574&uid=82
 * 2027 來源：https://www.dgpa.gov.tw/information?pid=12983&uid=2
 * 人事行政總處 CSV：https://data.gov.tw/dataset/14718
 * 2026 與 2027 官方已核定無週末補班；週末依核定表視為非上班日。
 * 附註：若政府日後發布修訂版，應依正式公告更新本檔資料。
 */
const holidays = {
  2026: {
    '01-01':'開國紀念日',
    '02-15':'除夕前一日', '02-16':'除夕', '02-17':'春節初一',
    '02-18':'春節初二', '02-19':'春節初三', '02-20':'春節補假',
    '02-27':'和平紀念日補假', '02-28':'和平紀念日',
    '04-03':'兒童節補假', '04-04':'兒童節', '04-05':'清明節', '04-06':'清明節補假',
    '05-01':'勞動節', '06-19':'端午節',
    '09-25':'中秋節', '09-28':'孔子誕辰紀念日／教師節',
    '10-09':'國慶日補假', '10-10':'國慶日',
    '10-25':'臺灣光復暨金門古寧頭大捷紀念日', '10-26':'紀念日補假',
    '12-25':'行憲紀念日'
  },
  2027: {
    '01-01':'開國紀念日',
    '02-04':'除夕前一日', '02-05':'除夕', '02-06':'春節初一',
    '02-07':'春節初二', '02-08':'春節初三', '02-09':'春節補假', '02-10':'春節補假',
    '02-28':'和平紀念日', '03-01':'和平紀念日補假',
    '04-04':'兒童節', '04-05':'清明節', '04-06':'兒童節補假',
    '04-30':'勞動節補假', '05-01':'勞動節',
    '06-09':'端午節', '09-15':'中秋節', '09-28':'孔子誕辰紀念日／教師節',
    '10-10':'國慶日', '10-11':'國慶日補假',
    '10-25':'臺灣光復暨金門古寧頭大捷紀念日',
    '12-24':'行憲紀念日補假', '12-25':'行憲紀念日',
    '12-31':'翌年開國紀念日補假'
  }
};
export function officeYearSupported(year){return Object.hasOwn(holidays,Number(year));}
export function officeDay(date){
  const m=String(date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m)return {kind:'unknown',label:''};
  const year=Number(m[1]);
  if(!officeYearSupported(year))return {kind:'unknown',label:''};
  const stamp=new Date(Date.UTC(year,Number(m[2])-1,Number(m[3])));
  if(stamp.toISOString().slice(0,10)!==date)return {kind:'unknown',label:''};
  const label=holidays[year][date.slice(5)]||'';
  if(label)return {kind:'holiday',label};
  const day=stamp.getUTCDay();
  return day===0||day===6?{kind:'rest',label:''}:{kind:'work',label:''};
}
