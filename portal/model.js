export const categories = [
 {id:'incident',title:'意外事故調查',color:'#995522',tint:'#fff1e5',path:'M5 3h14v18H5zM8 7h8M8 11h8M8 15h4'},
 {id:'safety',title:'工安管理',color:'#27689b',tint:'#e8f2fc',path:'M4 17v-4a8 8 0 0 1 16 0v4M2 17h20v3H2zM9 5v8M15 5v8'},
 {id:'environment',title:'環保管理',color:'#187456',tint:'#e4f5ec',path:'M20 3C7 3 2 8 5 16c8 6 15-1 15-13ZM4 21 16 8'},
 {id:'fire',title:'消防管理',color:'#ac571d',tint:'#fff0df',path:'M9 9h8v13H9zM11 9V5h4v4M12 5V2h6M18 3h3M10 5C4 5 4 9 3 11'},
 {id:'health',title:'職業健康',color:'#af4562',tint:'#fce9ee',path:'M12 21 3 12C-2 5 6 0 12 6c6-6 14-1 9 6ZM12 9v7M8.5 12.5h7'},
 {id:'admin',title:'行政工作',color:'#3a6586',tint:'#eaf1f8',path:'M8 4H5v18h14V4h-3M8 2h8v5H8zM8 11h8M8 15h8M8 19h5'},
 {id:'general',title:'綜合管理',color:'#087c87',tint:'#e3f5f6',path:'M3 3h18v18H3zM7 16v-4M12 16V7M17 16v-7'}
];
export function validateRows(rows,base='https://doublewater0804.github.io/ehs-management-portal/') {
 if(!Array.isArray(rows)||rows.length>200)throw Error('系統清單格式不正確，最多 200 套。');
 const ids=new Set();
 for(const r of rows){
  if(!r||typeof r.id!=='string'||!r.id||ids.has(r.id))throw Error('系統識別碼重複或無效。');ids.add(r.id);
  if(typeof r.title!=='string'||!r.title.trim()||r.title.length>80)throw Error('請填寫系統名稱（80 字以內）。');
  if(typeof r.description!=='string'||r.description.length>300)throw Error('用途說明限 300 字。');
  if(!categories.some(c=>c.id===r.category))throw Error('請選擇有效分類。');
  if(typeof r.href!=='string'||!r.href.trim()||r.href.length>2048||/[\u0000-\u0020\\]/.test(r.href))throw Error('請填寫有效網址，不可包含空白。');
  const url=new URL(r.href,base);if(url.protocol!=='https:'||url.username||url.password)throw Error('僅接受 HTTPS 網址或站內相對路徑。');
  if(!Number.isInteger(r.order)||r.order<0||r.order>99999)throw Error('順序需為 0～99999 的整數。');
  if(typeof r.visible!=='boolean'||typeof r.favorite!=='boolean')throw Error('顯示設定無效。');
 }
 if(rows.filter(r=>r.visible&&r.favorite).length>4)throw Error('首頁常用系統最多 4 套。');
 return rows;
}
export const sorted = rows => [...rows].sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
