import assert from 'node:assert/strict';
import {evaluateFormula,recompute,writeCell,changeRow,compareBooks,mergeSelected} from '../workbook.mjs';
// In test only, use an A1 encoder with the same signatures as SheetJS.
globalThis.XLSX={utils:{
 encode_col:c=>{let s='';do{s=String.fromCharCode(65+c%26)+s;c=Math.floor(c/26)-1}while(c>=0);return s},
 decode_col:s=>s.toUpperCase().split('').reduce((v,c)=>v*26+c.charCodeAt(0)-64,0)-1,
 encode_cell:({r,c})=>globalThis.XLSX.utils.encode_col(c)+(r+1),
 decode_cell:s=>{const m=s.replace(/\$/g,'').match(/^([A-Z]+)(\d+)$/i);if(!m)throw Error('bad A1 '+s);return {c:globalThis.XLSX.utils.decode_col(m[1]),r:+m[2]-1}},
 encode_range:({s,e})=>globalThis.XLSX.utils.encode_cell(s)+':'+globalThis.XLSX.utils.encode_cell(e),
 decode_range:s=>{const [a,b=a]=s.split(':');return {s:globalThis.XLSX.utils.decode_cell(a),e:globalThis.XLSX.utils.decode_cell(b)}}
}};
const sheetA='2026年職災事故統計表',sheetB='TO 劉協理';
const create=()=>({SheetNames:[sheetA,sheetB],Sheets:{
 [sheetA]:{'!ref':'A1:C4',A1:{t:'s',v:'職災事故統計'},A2:{t:'n',v:5},A3:{t:'n',v:3},B2:{t:'n',v:1},C2:{t:'s',v:'安全永續組'}},
 [sheetB]:{'!ref':'A1:B4',A1:{t:'s',v:'劉協理報告'},A2:{f:`'${sheetA}'!A2`,t:'n',v:5},B2:{f:`SUM('${sheetA}'!A2:A3)`,t:'n',v:8}}
}});
// 1. Cross sheet references and formula recomputation.
{
 const wb=create();assert.equal(evaluateFormula(wb,sheetB,`'${sheetA}'!A2+3`),8);
 assert.equal(evaluateFormula(wb,sheetB,`SUM('${sheetA}'!A2:A3)`),8);
 assert.equal(evaluateFormula(wb,sheetB,`IF('${sheetA}'!A2>3,12,0)`),12);
 const problems=writeCell(wb,sheetA,'A2','12');assert.equal(problems.length,0);
 assert.equal(wb.Sheets[sheetB].A2.v,12);assert.equal(wb.Sheets[sheetB].B2.v,15);
 assert.throws(()=>writeCell(wb,sheetB,'A2','999'),/公式儲存格/);
 console.log('PASS 1: 跨 Sheet 參照、即時公式重算、公式不可編輯');
}
// 2. Row insert and delete - rewrite formulas with referenced sheet but leave other sheet untouched.
{
 const wb=create();changeRow(wb,sheetA,1,1);
 assert.equal(wb.Sheets[sheetA].A3.v,5);
 assert.equal(wb.Sheets[sheetB].A2.f,`'${sheetA}'!A3`);
 assert.equal(wb.Sheets[sheetB].A2.v,5);
 assert.equal(wb.Sheets[sheetB].B2.v,8);
 assert.equal(wb.Sheets[sheetA]['!ref'],'A1:C5');
 changeRow(wb,sheetA,1,-1);
 assert.equal(wb.Sheets[sheetB].A2.f,`'${sheetA}'!A2`);
 // A quoted string that looks like an A1 reference must remain untouched.
 const wb3=create();wb3.Sheets[sheetB].B3={f:`IF(A2=5,"A3","A2")`,t:'s',v:'A3'};
 changeRow(wb3,sheetA,1,1);
 assert.equal(wb3.Sheets[sheetB].B3.f,`IF(A2=5,"A3","A2")`);
 console.log('PASS 2: 新增／刪除整列、公式引用位移及引號字串保護');
}
// 3. Import review: keep selected online edits, replace others, preserve original workbook immutably.
{
 const a=create(),b=create();a.Sheets[sheetA].A2.v=10;b.Sheets[sheetA].A2.v=22;b.Sheets[sheetA].C2.v='新版本說明';
 const comparison=compareBooks(a,b);assert.equal(comparison.structural,false);assert.equal(comparison.total,2);
 const preserved=mergeSelected(a,b,comparison,new Set([sheetA+'!A2']));
 assert.equal(preserved.Sheets[sheetA].A2.v,10);assert.equal(preserved.Sheets[sheetA].C2.v,'新版本說明');
 console.log('PASS 3: 新版 Excel 逐格差異、選擇保留／覆蓋');
}
// 4. Merged region row edit is blocked; reference to deleted row generates #REF to guard publish.
{
 const wb=create();wb.Sheets[sheetA]['!merges']=[{s:{r:0,c:0},e:{r:1,c:0}}];
 assert.throws(()=>changeRow(wb,sheetA,1,1),/合併儲存格/);
 const wb2=create();changeRow(wb2,sheetA,1,-1);
 assert.ok(wb2.Sheets[sheetB].A2.f.includes('#REF!'));
 console.log('PASS 4: 合併格保護、刪除公式引用偵測');
}
console.log('ALL WORKBOOK TESTS PASS');
