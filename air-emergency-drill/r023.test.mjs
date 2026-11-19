import test from 'node:test';
import assert from 'node:assert/strict';
import {EXCEL_HEADERS,LEGACY_EXCEL_HEADERS,exportRow,validateDrill,INITIAL_SITES,addDays,assess,hasFormalYearData} from '../model.js';
const sites=INITIAL_SITES;
const units=[{id:'m1',siteId:'site-mailiao',name:'SM麥寮',active:true,order:1}];
const base={id:'2026_site-mailiao',year:2026,siteId:'site-mailiao',assignedUnitId:'m1',actualDate:'2026-06-10',sentDate:'2026-07-08',refNumber:'公司字號',plannedDate:'2026-05-20',note:'',changeReason:''};
test('Excel new export headers include two authority reply fields in intended order',()=>{
 assert.equal(EXCEL_HEADERS.length,12);
 assert.deepEqual(EXCEL_HEADERS.slice(6,10),['發文日期','發文字號','備查日期','備查文號']);
 assert.equal(LEGACY_EXCEL_HEADERS.length,10);
});
test('new authority reply fields export without changing company filing fields',()=>{
 const row=exportRow(sites[0],{...base,authorityReplyDate:'2026-07-15',authorityReplyNo:'府環字第123號'},null,units,2026);
 assert.equal(row.length,12);assert.deepEqual(row.slice(6,10),['2026-07-08','公司字號','2026-07-15','府環字第123號']);
});
test('old drill records without new fields remain exportable',()=>{
 const row=exportRow(sites[0],base,null,units,2026);
 assert.deepEqual(row.slice(8,10),['','']);
});
test('reply date and reply document reference are independently optional and validated',()=>{
 assert.equal(validateDrill({...base,authorityReplyDate:'',authorityReplyNo:''},sites[0],units),true);
 assert.equal(validateDrill({...base,authorityReplyDate:'2026-07-15',authorityReplyNo:''},sites[0],units),true);
 assert.throws(()=>validateDrill({...base,authorityReplyDate:'2026-02-30'},sites[0],units),/日期/);
 assert.throws(()=>validateDrill({...base,authorityReplyNo:'a'.repeat(101)},sites[0],units),/備查文號/);
});
test('30-day filing status remains based on actual drill and company sending date',()=>{
 const r={...base,authorityReplyDate:'2026-08-30',authorityReplyNo:'府環字第123號'};
 assert.equal(addDays(r.actualDate,30),'2026-07-10');
 assert.equal(assess(r,'2026-11-19').code,'completed');
 assert.equal(assess({...r,sentDate:'2026-07-11'},'2026-11-19').code,'late-sent');
 assert.equal(hasFormalYearData(2026,[{...base,sentDate:'',actualDate:'',authorityReplyNo:'府環字第123號'}]),true);
});
