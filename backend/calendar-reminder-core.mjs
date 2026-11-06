// Shared pure helpers; Node/GitHub Actions need no timezone packages.
export const pad=n=>String(n).padStart(2,'0');
export const isoDay=date=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export const dayNumber=s=>Date.parse(s+'T00:00:00Z')/86400000;
export const atDay=n=>new Date(n*86400000).toISOString().slice(0,10);
export function occursOn(e,date){
 if(!e.startDate||!date||date<e.startDate||(e.repeatUntil&&date>e.repeatUntil))return false;
 const days=dayNumber(date)-dayNumber(e.startDate);
 if(!Number.isInteger(days)||days<0)return false;
 switch(e.repeat||'none'){
 case 'none':return days===0;
 case 'daily':return true;
 case 'weekly':return days%7===0;
 case 'monthly':return date.slice(8)===e.startDate.slice(8);
 default:return false;
 }
}
export function delayMinutes(e){
 if(e.reminder==='custom'){const d=Number(e.reminderMinutes);return Number.isInteger(d)&&d>=0&&d<=10080?d:null;}
 return ({at:0,'1h':60,'1d':1440})[e.reminder]??null;
}
export function dueOccurrences(e,now,windowMinutes=15){
 const delay=delayMinutes(e);
 if(delay===null||!e.startTime||e.allDay||['cancelled','completed'].includes(e.status))return [];
 if(!/^\d{2}:\d{2}$/.test(e.startTime)||Number(e.startTime.slice(0,2))>23||Number(e.startTime.slice(3,5))>59)return [];
 const start=dayNumber(isoDay(now));const output=[];
 // Custom reminders can be set up to 7 days prior.
 for(let n=start-1;n<=start+9;n++){
   const date=atDay(n);if(!occursOn(e,date))continue;
   const eventTime=Date.parse(`${date}T${e.startTime}:00+08:00`);
   if(!Number.isFinite(eventTime))continue;
   const due=eventTime-delay*60000,delta=(now.getTime()-due)/60000;
   if(delta>=0&&delta<=windowMinutes)output.push({date,delay,delta});
 }
 return output;
}
