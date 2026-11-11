import assert from "node:assert/strict";
import {emptyQuarter,FACTORY_LIST,FIELDS,totalsFor,validateData,ratio} from "../model.js";

const data=emptyQuarter(2026,3);
assert.equal(data.factories.length,13,"應有 13 個廠別");
for(const row of data.factories){
  row.status="completed";
  for(const field of FIELDS){row[field.count]=100;row[field.abnormal]=1;}
}
data.factories[0].status="not_executed";
for(const field of FIELDS){data.factories[0][field.count]=null;data.factories[0][field.abnormal]=null;}
data.factories[1].status="missing";
for(const field of FIELDS){data.factories[1][field.count]=null;data.factories[1][field.abnormal]=null;}
validateData(data);
const t=totalsFor(data);
assert.equal(t.completedCount,11);
assert.equal(t.notExecutedCount,1);
assert.equal(t.missingCount,1);
assert.equal(t.totalCount,4400);
assert.equal(t.totalAbnormal,44);
assert.equal(t.overallRate,1);
assert.equal(ratio(1,100),1);

const invalid=structuredClone(data);
const row=invalid.factories.find(x=>x.status==="completed");
row.rotatingAbnormal=row.rotatingCount+1;
assert.throws(()=>validateData(invalid),/異常數不可大於檢測數/);

const blank=structuredClone(data);
const row2=blank.factories.find(x=>x.status==="completed");
row2.valveCount=null;
assert.throws(()=>validateData(blank),/檢測數尚未填寫/);

console.log("PASS: 13 廠別、未執行排除、缺漏標示、比例公式及資料驗證");
