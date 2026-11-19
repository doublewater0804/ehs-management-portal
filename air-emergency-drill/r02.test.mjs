import test from 'node:test';
import assert from 'node:assert/strict';
import {yearInventory,hasFormalYearData,canRemoveYear,isYearClosed,unitWasUsed,validateBatchUnits,recordKey,INITIAL_SITES,proposedUnit} from '../model.js';
test('legacy data without year metadata remains accessible',()=>{
 const existing=[{id:recordKey(2027,'site-mailiao'),year:2027,actualDate:'2027-06-09'}];
 const rows=yearInventory([],existing,[]);
 assert.deepEqual(rows.map(x=>x.year),[2026,2027]);
 assert.equal(rows.find(x=>x.year===2027).implicit,true);
});
test('explicit deleted/archived status overrides legacy implicit years without losing records',()=>{
 const d=[{year:2026,actualDate:'2026-06-08'}];
 const [y]=yearInventory([{year:2026,status:'archived',note:'保留',version:2}],d,[]);
 assert.equal(y.status,'archived');assert.equal(isYearClosed(y),true);
 const rows=yearInventory([{year:2026,status:'deleted',version:3}],d,[]);
 assert.equal(rows[0].status,'deleted');
 assert.equal(d.length,1);
});
test('formal drill or filing prevents deletion; planned-only permits logical deletion',()=>{
 assert.equal(canRemoveYear(2026,[{year:2026,plannedDate:'2026-05-06'}]),true);
 assert.equal(canRemoveYear(2026,[{year:2026,actualDate:'2026-05-06'}]),false);
 assert.equal(canRemoveYear(2026,[{year:2026,sentDate:'2026-06-06'}]),false);
 assert.equal(hasFormalYearData(2027,[{year:2026,actualDate:'2026-05-06'}]),false);
});
test('historical references in drills and rotations block permanent unit deletion',()=>{
 const u={id:'u1',siteId:'s1',name:'單元一'};
 assert.equal(unitWasUsed(u,[],[]),false);
 assert.equal(unitWasUsed(u,[{assignedUnitId:'u1'}],[]),true);
 assert.equal(unitWasUsed(u,[],[{originalUnitId:'u1'}]),true);
 assert.equal(unitWasUsed(u,[],[{siteId:'s1',history:[{from:'單元一',to:'單元二'}]}]),true);
});
test('bulk unit validation blocks duplicates and collisions with old active order',()=>{
 const prev=[{siteId:'s1',name:'廠處A',order:1,active:true}];
 const draft=[{name:'廠處B',order:2,active:true},{name:'廠處C',order:3,active:true}];
 assert.equal(validateBatchUnits('s1',draft,prev),true);
 assert.throws(()=>validateBatchUnits('s1',[{name:'廠處B',order:1,active:true}],prev),/輪值順序/);
 assert.throws(()=>validateBatchUnits('s1',[{name:'廠處A',order:2,active:true}],prev),/名稱重複/);
 assert.throws(()=>validateBatchUnits('s1',[{name:'廠處B',order:2,active:true},{name:'廠處B',order:3,active:true}],prev),/名稱重複/);
 assert.equal(validateBatchUnits('s1',[{name:'廠處B',order:1,active:false}],prev),true);
});
test('R0.1 three-year rotation remains unchanged',()=>{
 const site=INITIAL_SITES[0];
 const roster=['SM麥寮','PC','ARO1'].map((name,i)=>({id:String(i),name,siteId:site.id,order:i+1,active:true}));
 assert.equal(proposedUnit(site,roster,2026).unit.name,'SM麥寮');
 assert.equal(proposedUnit(site,roster,2027).unit.name,'PC');
 assert.equal(proposedUnit(site,roster,2028).unit.name,'ARO1');
 assert.equal(proposedUnit(site,roster,2029).unit.name,'SM麥寮');
});
