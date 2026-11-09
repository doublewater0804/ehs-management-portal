export const pad = n => String(n).padStart(2, '0');
export const tz = 'Asia/Taipei';
export function localDate(date = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date).filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export function validISO(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
  const [y,m,d]=s.split('-').map(Number), dt=new Date(Date.UTC(y,m-1,d));
  return dt.getUTCFullYear()===y && dt.getUTCMonth()===m-1 && dt.getUTCDate()===d;
}
const dayNumber = s => Date.parse(`${s}T00:00:00Z`)/86400000;
const dateAt = n => new Date(n*86400000).toISOString().slice(0,10);
const weekday = s => new Date(`${s}T00:00:00Z`).getUTCDay();
const wd = {'日':0,'天':0,'一':1,'二':2,'三':3,'四':4,'五':5,'六':6};
function nextWeekday(base,wanted, nextWeek=false) {
  const delta=(wanted-weekday(base)+7)%7+(nextWeek?7:0);
  return dateAt(dayNumber(base)+delta);
}
function nextMonthly(base,day) {
  let [y,m]=base.split('-').map(Number);
  for(let k=0;k<24;k++) {
    const yy=y+Math.floor((m-1+k)/12), mm=(m-1+k)%12+1;
    const s=`${yy}-${pad(mm)}-${pad(day)}`;
    if(validISO(s) && s>=base)return s;
  }
  throw Error('無法計算下次月份');
}
export function parseSmart(input,base=localDate()) {
  if (!validISO(base)) throw Error('解析基準日期不正確');
  const yr=Number(base.slice(0,4));let carried='',items=[],errors=[];
  const parts=String(input||'').replace(/\r/g,'').replace(/[＋]/g,'+').split(/\s*\+\s*|\n+/).map(x=>x.trim()).filter(Boolean);
  for (const raw of parts) {
    let s=raw,date='',repeat='none',m;
    if((m=s.match(/每\s*(?:週|周)\s*([日一二三四五六天])/))) {
      repeat='weekly';date=nextWeekday(base,wd[m[1]]);s=s.replace(m[0],'').trim();
    } else if((m=s.match(/每\s*月\s*(\d{1,2})\s*(?:日|號)?/))) {
      const d=+m[1];if(d<1||d>31){errors.push(`每月日期無效：${raw}`);continue;}
      repeat='monthly';date=nextMonthly(base,d);s=s.replace(m[0],'').trim();
    } else if((m=s.match(/(?:(?:民國|民國\s*)(\d{2,3})\s*年\s*|(?:(\d{4})\s*[年\/-]\s*))?(\d{1,2})\s*[月\/-]\s*(\d{1,2})\s*(?:日|號)?/))) {
      const y=m[1]?Number(m[1])+1911:m[2]?+m[2]:yr;
      date=`${y}-${pad(+m[3])}-${pad(+m[4])}`;s=s.replace(m[0],'').trim();
    } else if((m=s.match(/(今天|明天|後天)/))) {
      date=dateAt(dayNumber(base)+({今天:0,明天:1,後天:2}[m[1]]));s=s.replace(m[0],'').trim();
    } else if((m=s.match(/(?:下週|下周)([日一二三四五六天])/))) {
      const target=wd[m[1]];
      date=dateAt(dayNumber(base)+7-weekday(base)+target);s=s.replace(m[0],'').trim();
    } else if((m=s.match(/(?:本週|這週|本周)([日一二三四五六天])/))) {
      date=dateAt(dayNumber(base)-weekday(base)+wd[m[1]]);s=s.replace(m[0],'').trim();
    } else if(carried) date=carried;
    if(!date){errors.push(`缺少日期：${raw}`);continue;}
    if(!validISO(date)){errors.push(`無效日期：${raw}`);continue;}
    carried=date;
    let time='';
    const timeRe=/(上午|早上|凌晨|下午|晚上|中午)?\s*(\d{1,2})\s*(?:[:：點時])\s*(\d{1,2})?\s*分?/;
    if((m=s.match(timeRe))) {
      let h=+m[2], minute=m[3]?+m[3]:0, period=m[1];
      if(minute>59||h>23||(period&&(h<1||h>12))) {
        errors.push(`無效時間：${raw}`);continue;
      }
      if(['下午','晚上'].includes(period) && h<12)h+=12;
      if(['上午','早上','凌晨'].includes(period)&&h===12)h=0;
      if(period==='中午'&&h<12)h+=12;
      time=`${pad(h)}:${pad(minute)}`;s=s.replace(m[0],'').trim();
    }
    let owner='',location='';
    if((m=s.match(/負責人\s*[:：]\s*([^，,；;]+)/))) {owner=m[1].trim();s=s.replace(m[0],'').trim();}
    if((m=s.match(/地點\s*[:：]\s*([^，,；;]+)/))) {location=m[1].trim();s=s.replace(m[0],'').trim();}
    const title=s.replace(/^[，,；;\s]+|[，,；;\s]+$/g,'');
    if(!title){errors.push(`缺少活動名稱：${raw}`);continue;}
    let categoryId='other';
    if(/稽核|查核|查廠/.test(title))categoryId='audit';
    else if(/教育訓練|培訓|上課|講習|課程/.test(title))categoryId='training';
    else if(/會議|檢討會|例會|處務室|開會|簡報檢討/.test(title))categoryId='meeting';
    items.push({title,startDate:date,startTime:time,endDate:'',endTime:'',location,owner,description:'',categoryId,status:'pending',reminder:'off',repeat,repeatUntil:'',allDay:false});
  }
  return {items,errors};
}
// R0.4：月曆以「實際涵蓋日期」呈現一筆事件；不寫入多筆資料。
// endDate 在 EHS 編輯表單中是包含在內的日期；只有「定時事件剛好於 00:00 結束」
// 才不占用結束日。沒有設定時間的跨日活動仍依日期區間顯示。
export function visibleEndDate(e) {
  if (!validISO(e?.startDate)) return '';
  if (!e.endDate) return e.startDate;
  if (!validISO(e.endDate) || e.endDate < e.startDate) return '';
  if (!e.allDay && e.startTime && e.endTime === '00:00' && e.endDate > e.startDate)
    return dateAt(dayNumber(e.endDate) - 1);
  return e.endDate;
}

// 每個結果均攜帶：occurrenceDate（目前顯示日）、occurrenceStart（本次重複事件的真正開始日）。
// 這兩個欄位僅供前端呈現／ICS 使用，不加入 Firestore。
// 同一活動跨月／跨年依然只有原始 id，不會複製任何事件。
export function monthOccurrences(events, year, month) {
  const begin = `${year}-${pad(month + 1)}-01`;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const end = `${year}-${pad(month + 1)}-${pad(days)}`;
  const firstDay = dayNumber(begin), lastDay = dayNumber(end);
  const result = [];
  for (const e of events) {
    if (!validISO(e.startDate) || e.startDate > end) continue;
    const visibleEnd = visibleEndDate(e);
    if (!visibleEnd) continue;
    const startDay = dayNumber(e.startDate);
    const duration = dayNumber(visibleEnd) - startDay;
    const rule = e.repeat || 'none';
    // 從月初回溯「事件長度」，以納入上個月開始但本月仍持續的事件。
    const firstStart = Math.max(startDay, firstDay - duration);
    const lastStart = Math.min(lastDay, e.repeatUntil && validISO(e.repeatUntil)
      ? dayNumber(e.repeatUntil) : lastDay);
    if (lastStart < firstStart) continue;
    for (let day = firstStart; day <= lastStart; day++) {
      const offset = day - startDay;
      const occurs = rule === 'none' ? offset === 0
        : rule === 'daily' ? true
        : rule === 'weekly' ? offset % 7 === 0
        : rule === 'monthly' ? dateAt(day).slice(8) === e.startDate.slice(8)
        : false;
      if (!occurs) continue;
      const occurrenceStart = dateAt(day);
      const shownFrom = Math.max(day, firstDay), shownTo = Math.min(day + duration, lastDay);
      for (let visibleDay = shownFrom; visibleDay <= shownTo; visibleDay++) {
        result.push({ ...e, occurrenceStart, occurrenceDate: dateAt(visibleDay),
          isOccurrence: occurrenceStart !== e.startDate });
      }
      if (rule === 'none') break;
    }
  }
  return result;
}

// 與月曆展開使用同一套跨日語意；僅用於本地日期判斷，不修改資料。
export function occursOn(e, date) {
  if (!validISO(date) || !validISO(e?.startDate)) return false;
  const visibleEnd = visibleEndDate(e);
  if (!visibleEnd || date < e.startDate) return false;
  const duration = dayNumber(visibleEnd) - dayNumber(e.startDate);
  const dateDay = dayNumber(date), baseDay = dayNumber(e.startDate);
  const maxStart = Math.min(dateDay, e.repeatUntil && validISO(e.repeatUntil)
    ? dayNumber(e.repeatUntil) : dateDay);
  for (let day = Math.max(baseDay, dateDay - duration); day <= maxStart; day++) {
    const n = day - baseDay;
    if (e.repeat === 'daily' ||
        (e.repeat === 'weekly' && n % 7 === 0) ||
        (e.repeat === 'monthly' && dateAt(day).slice(8) === e.startDate.slice(8)) ||
        ((!e.repeat || e.repeat === 'none') && n === 0)) return true;
  }
  return false;
}
