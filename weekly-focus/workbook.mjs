/* Excel operations: no cloud access or authentication in this module. */
export const MAX_ROWS=1400,MAX_COLS=90;
const clone=x=>structuredClone(x);
const address=(r,c)=>XLSX.utils.encode_cell({r,c});
const range=ws=>XLSX.utils.decode_range(ws['!ref']||'A1');
export const sheetNames=book=>Array.isArray(book?.SheetNames)?book.SheetNames:[];
export function parseWorkbook(bytes,filename=''){
  if(!/\.(xls|xlsx|xlsm)$/i.test(filename))throw Error('只接受 .xls、.xlsx、.xlsm');
  const book=XLSX.read(bytes,{type:'array',cellStyles:true,cellNF:true,cellText:true,cellDates:false,sheetStubs:true});
  if(!book.SheetNames?.length)throw Error('檔案沒有工作表');
  for(const name of book.SheetNames){const ws=book.Sheets[name];const lim=range(ws);if(lim.e.r>=MAX_ROWS||lim.e.c>=MAX_COLS)throw Error(`${name} 超過支援範圍（最多 ${MAX_ROWS} 列／${MAX_COLS} 欄），請先整理檔案`);}
  return book;
}
export function safeValue(cell){if(!cell)return '';if(cell.t==='e')return cell.w||'#ERROR!';if(cell.v===undefined||cell.v===null)return '';return String(cell.w??cell.v);}
export function isFormula(cell){return !!cell?.f;}
export function getCell(book,name,addr){return book?.Sheets?.[name]?.[addr]||null;}
export function isMergeChild(ws,r,c){return !!(ws['!merges']||[]).find(m=>r>=m.s.r&&r<=m.e.r&&c>=m.s.c&&c<=m.e.c&&(r!==m.s.r||c!==m.s.c));}
export function inspectLayout(ws){const ref=range(ws),merges=ws['!merges']||[];return {rows:ref.e.r+1,cols:ref.e.c+1,merges,columns:ws['!cols']||[],rowHeights:ws['!rows']||[]};}
function touchRef(ws,r,c){const old=range(ws);old.s.r=Math.min(old.s.r,r);old.s.c=Math.min(old.s.c,c);old.e.r=Math.max(old.e.r,r);old.e.c=Math.max(old.e.c,c);ws['!ref']=XLSX.utils.encode_range(old);}
export function writeCell(book,name,addr,value){
  const ws=book.Sheets[name];if(!ws)throw Error('工作表不存在');
  const pos=XLSX.utils.decode_cell(addr);
  if(pos.r>=MAX_ROWS||pos.c>=MAX_COLS)throw Error('超出編輯範圍');
  if(isMergeChild(ws,pos.r,pos.c))throw Error('合併儲存格僅能編輯左上角儲存格');
  const original=ws[addr];if(isFormula(original))throw Error('公式儲存格不可直接修改，請修改其來源資料');
  const cleaned=String(value??'').replace(/\r\n?/g,'\n');
  if(cleaned===''){
    if(original){ws[addr]={...original,t:'z'};delete ws[addr].v;delete ws[addr].w;delete ws[addr].f;}
  }else if(/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(cleaned.trim())&&Number.isFinite(Number(cleaned))){
    ws[addr]={...original,t:'n',v:Number(cleaned.trim())};delete ws[addr].w;
  }else{
    ws[addr]={...original,t:'s',v:cleaned};delete ws[addr].w;
  }
  touchRef(ws,pos.r,pos.c);
  return recompute(book);
}
// A safe limited formula interpreter: no eval / new Function. Unsupported formulas keep
// their cached values with an explicit warning and are force-recalculated by Excel.
function tokenize(s){
  const tokens=[];let i=0;
  const rule=/^(?:'((?:[^']|'')+)'!|([\p{L}_][\p{L}\p{N}_.]*)!)?(\$?[A-Za-z]{1,3}\$?\d{1,7})/u;
  while(i<s.length){const x=s.slice(i);if(/^\s/.test(x)){i++;continue}
    const ref=x.match(rule);if(ref){tokens.push({type:'ref',sheet:ref[1]?ref[1].replace(/''/g,"'"):ref[2]||null,cell:ref[3].replace(/\$/g,'').toUpperCase()});i+=ref[0].length;continue;}
    const number=x.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?/);if(number){tokens.push({type:'number',value:Number(number[0])});i+=number[0].length;continue;}
    const literal=x.match(/^"((?:[^"]|"")*)"/);if(literal){tokens.push({type:'string',value:literal[1].replace(/""/g,'"')});i+=literal[0].length;continue;}
    const id=x.match(/^[A-Za-z_][\w.]*/);if(id){tokens.push({type:'id',value:id[0].toUpperCase()});i+=id[0].length;continue;}
    const sign=x.match(/^(>=|<=|<>|[+\-*/^(),:=<>%&])/);if(sign){tokens.push({type:sign[0]});i+=sign[0].length;continue;}
    throw Error('不支援的公式語法');
  }
  return tokens;
}
export function evaluateFormula(book,sheetName,formula,trail=new Set()){
 const tokens=tokenize(formula.startsWith('=')?formula.slice(1):formula);let p=0;
 const at=()=>tokens[p];const consume=type=>{if(at()?.type!==type)throw Error('公式語法不正確');return tokens[p++]};
 const scalar=x=>Array.isArray(x)?x.flat(Infinity).reduce((acc,v)=>acc+Number(v||0),0):x;
 const numeric=x=>{const v=Number(scalar(x)??0);if(!Number.isFinite(v))throw Error('不是有效數字');return v};
 function lookup(ref){const name=ref.sheet||sheetName,ws=book.Sheets[name];if(!ws)throw Error('引用的工作表不存在');const addr=ref.cell,key=`${name}!${addr}`;if(trail.has(key))throw Error('循環參照');const cell=ws[addr];if(!cell)return 0;if(cell.f){trail.add(key);try{return evaluateFormula(book,name,cell.f,trail)}finally{trail.delete(key)}}return cell.v??0;}
 function readRange(start,end){const name=end.sheet||start.sheet||sheetName;if(start.sheet&&end.sheet&&start.sheet!==end.sheet)throw Error('跨工作表範圍不支援');const a=XLSX.utils.decode_cell(start.cell),b=XLSX.utils.decode_cell(end.cell);if(Math.abs(a.r-b.r)>MAX_ROWS||Math.abs(a.c-b.c)>MAX_COLS)throw Error('公式範圍過大');const result=[];for(let r=Math.min(a.r,b.r);r<=Math.max(a.r,b.r);r++)for(let c=Math.min(a.c,b.c);c<=Math.max(a.c,b.c);c++)result.push(lookup({sheet:name,cell:address(r,c)}));return result;}
 function primary(){const t=at();if(!t)throw Error('公式不完整');if(t.type==='number'||t.type==='string'){p++;return t.value}if(t.type==='-'){p++;return -numeric(primary())}if(t.type==='+'){p++;return numeric(primary())}if(t.type==='('){p++;const v=expression();consume(')');return v}
  if(t.type==='ref'){p++;if(at()?.type===':'){p++;const end=consume('ref');return readRange(t,end)}return lookup(t)}
  if(t.type==='id'){p++;if(t.value==='TRUE')return true;if(t.value==='FALSE')return false;consume('(');const args=[];if(at()?.type!==')'){do{args.push(expression());if(at()?.type!==',')break;p++;}while(true)}consume(')');const values=args.flat(Infinity),nums=values.map(Number).filter(Number.isFinite);
    switch(t.value){case'SUM':return nums.reduce((a,b)=>a+b,0);case'MIN':return Math.min(...nums);case'MAX':return Math.max(...nums);case'AVERAGE':return nums.reduce((a,b)=>a+b,0)/nums.length;case'COUNT':return nums.length;case'COUNTA':return values.filter(x=>x!==''&&x!==null&&x!==undefined).length;case'IF':return args[0]?args[1]:args[2];case'ROUND':return Number(numeric(args[0]).toFixed(numeric(args[1]??0)));case'ABS':return Math.abs(numeric(args[0]));default:throw Error(`函數 ${t.value} 尚未支援`);}}
  throw Error('公式不支援');}
 function power(){let v=primary();while(at()?.type==='^'){p++;v=numeric(v)**numeric(primary())}return v;}
 function mul(){let v=power();while(['*','/','%'].includes(at()?.type)){const op=tokens[p++].type,n=numeric(power());if(op==='*')v=numeric(v)*n;else if(op==='/')v=numeric(v)/n;else v=numeric(v)/100;}return v;}
 function add(){let v=mul();while(['+','-','&'].includes(at()?.type)){const op=tokens[p++].type,w=mul();if(op==='+')v=numeric(v)+numeric(w);else if(op==='-')v=numeric(v)-numeric(w);else v=String(v)+String(w);}return v;}
 function expression(){let v=add();if(['=','<>','<','>','<=','>='].includes(at()?.type)){const op=tokens[p++].type,w=add();if(op==='=')v=v==w;else if(op==='<>')v=v!=w;else if(op==='<')v=v<w;else if(op==='>')v=v>w;else if(op==='<=')v=v<=w;else v=v>=w;}return v;}
 const result=expression();if(p!==tokens.length)throw Error('公式有未處理的內容');if(typeof result==='number'&&!Number.isFinite(result))throw Error('數值運算失敗');return result;
}
export function recompute(book){const unsupported=[];for(const name of book.SheetNames){const ws=book.Sheets[name];for(const [addr,cell] of Object.entries(ws)){if(addr[0]==='!'||!cell?.f)continue;try{const value=evaluateFormula(book,name,cell.f,new Set([`${name}!${addr}`]));cell.v=value;cell.t=typeof value==='number'?'n':typeof value==='boolean'?'b':'s';delete cell.w;delete cell.__recalcError;}catch(e){cell.__recalcError=e.message;unsupported.push(`${name}!${addr}`);}}}return unsupported;}
function shiftFormula(formula,currentSheet,targetSheet,row,delta){
  const rex=/(?:(?:'((?:[^']|'')+)'|([\p{L}_][\p{L}\p{N}_.]*))!)?(\$?[A-Za-z]{1,3}\$?)(\d{1,7})/gu;
  let lastEnd=0,lastSheet=currentSheet;
  const strings=[];
  const literal=/"(?:[^"]|"")*"/g;let token;
  while((token=literal.exec(formula)))strings.push([token.index,token.index+token[0].length]);
  return formula.replace(rex,(full,quoted,bare,col,index,offset)=>{
    if(strings.some(([begin,end])=>offset>=begin&&offset<end))return full;
    // The second endpoint of a 3D range ('Source'!A1:B9) inherits
    // the sheet qualifier from the first endpoint.
    const explicit=quoted?quoted.replace(/''/g,"'"):bare||null;
    const on=explicit||(formula.slice(lastEnd,offset).trim()===':'?lastSheet:currentSheet);
    lastSheet=on;lastEnd=offset+full.length;
    if(on!==targetSheet)return full;
    const n=Number(index)-1;if(delta===-1&&n===row)return '#REF!';if(n<row+(delta===-1?1:0))return full;
    const prefix=quoted?`'${quoted}'!`:bare?`${bare}!`:'';return `${prefix}${col}${n+delta+1}`;
  });
}
export function changeRow(book,name,at,delta){
 if(delta!==1&&delta!==-1)throw Error('無效的增刪操作');const ws=book.Sheets[name];if(!ws)throw Error('工作表不存在');
 const bounds=range(ws);if(at<0||at>bounds.e.r+(delta===1?1:0))throw Error('列號超出範圍');if(delta===1&&bounds.e.r+1>=MAX_ROWS)throw Error('超過最大列數');
 for(const m of ws['!merges']||[])if(delta===1?m.s.r<at&&m.e.r>=at:m.s.r<=at&&m.e.r>=at)throw Error('這一列跨越合併儲存格，為保護原始排版不允許增刪。請選擇其他列。');
 const ordered=Object.keys(ws).filter(k=>!k.startsWith('!')).map(k=>({key:k,...XLSX.utils.decode_cell(k)})).filter(x=>x.r>=at).sort((a,b)=>delta===1?b.r-a.r:a.r-b.r);
 for(const c of ordered){if(delta===-1&&c.r===at){delete ws[c.key];continue;}const target=c.r+delta;ws[address(target,c.c)]=ws[c.key];delete ws[c.key];}
 for(const m of ws['!merges']||[]){if(m.s.r>=at+(delta===-1?1:0)){m.s.r+=delta;m.e.r+=delta;}}
 if(ws['!rows']){if(delta===1)ws['!rows'].splice(at,0,{});else ws['!rows'].splice(at,1);}
 bounds.e.r+=delta;ws['!ref']=XLSX.utils.encode_range(bounds);
 for(const parent of book.SheetNames){const other=book.Sheets[parent];for(const [addr,c] of Object.entries(other)){if(addr.startsWith('!')||!c?.f)continue;c.f=shiftFormula(c.f,parent,name,at,delta);delete c.w;}}
 return recompute(book);
}
export function exportXlsx(book){
 const payload=clone(book);if(!payload.Workbook)payload.Workbook={};payload.Workbook.CalcPr={calcMode:'auto',fullCalcOnLoad:true,forceFullCalc:true};
 for(const name of payload.SheetNames){for(const cell of Object.values(payload.Sheets[name]))if(cell&&typeof cell==='object'){delete cell.__recalcError;}}
 return XLSX.write(payload,{bookType:'xlsx',type:'array',cellStyles:true,compression:true});
}
function cellKey(cell){if(!cell)return '';return JSON.stringify([cell.t||'',cell.v??null,cell.f||'']);}
export function compareBooks(current,incoming){
 const older=current?.SheetNames||[],newer=incoming.SheetNames||[];const reasons=[];
 if(older.join('\0')!==newer.join('\0'))reasons.push('工作表名稱、順序或數量不同');
 const changes=[];let total=0;
 for(const name of newer){if(!current.Sheets[name])continue;const old=current.Sheets[name],next=incoming.Sheets[name];const a=inspectLayout(old),b=inspectLayout(next);
  if(a.rows!==b.rows||a.cols!==b.cols||JSON.stringify(a.merges)!==JSON.stringify(b.merges)||JSON.stringify(a.columns)!==JSON.stringify(b.columns))reasons.push(`${name} 的列欄配置或合併儲存格已變動`);
  const cells=new Set([...Object.keys(old),...Object.keys(next)].filter(x=>!x.startsWith('!')));
  for(const addr of cells){if(cellKey(old[addr])===cellKey(next[addr]))continue;total++;if(changes.length<1500)changes.push({sheet:name,addr,oldText:safeValue(old[addr]),newText:safeValue(next[addr]),oldCell:old[addr],newCell:next[addr],formula:!!old[addr]?.f||!!next[addr]?.f});}
 }
 return {changes,total,reasons,structural:reasons.length>0,truncated:total>changes.length};
}
export function mergeSelected(current,incoming,diff,keepOld){
 if(diff.structural&&keepOld.size)throw Error('版面結構有變更，請直接採用新版或取消匯入');
 for(const entry of diff.changes){const k=`${entry.sheet}!${entry.addr}`;if(!keepOld.has(k))continue;if(entry.formula)throw Error(`無法覆蓋公式欄位 ${k}`);
  const ws=incoming.Sheets[entry.sheet];if(entry.oldCell)ws[entry.addr]=clone(entry.oldCell);else delete ws[entry.addr];
 }
 return incoming;
}
