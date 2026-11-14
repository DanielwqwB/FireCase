const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const vm=require('node:vm');
const compiled=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib/prediction-dataset.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const sandbox={exports:{},require};vm.runInNewContext(compiled,sandbox);
const {parsePredictionDataset,predictionRequestSchema,weatherKeys}=sandbox.exports;
const weather=Object.fromEntries(weatherKeys.map(key=>[key,1]));
const daily={observation_date:'2026-11-14',...weather,hotspots_today:3,hotspots_prev7_mean:2};
const sequence=()=>Array.from({length:14},(_,i)=>({observation_date:`2026-11-${String(i+1).padStart(2,'0')}`,...weather,total_hotspots:i}));
test('imports CSV with BOM, CRLF, quoted date and no changes to observation values',()=>{
 const headers=Object.keys(daily);const csv='\uFEFF'+headers.join(',')+'\r\n'+headers.map(key=>key==='observation_date'?`"${daily[key]}"`:daily[key]).join(',');
 const result=parsePredictionDataset(csv,'daily');assert.equal(result.observation.observation_date,daily.observation_date);assert.equal(result.observation.hotspots_today,3);
});
test('accepts the documented 14-day LSTM envelope',()=>assert.equal(parsePredictionDataset(JSON.stringify({observations:sequence()}),'lstm').observations.length,14));
test('rejects missing CSV measurements instead of turning them into zero',()=>{
 const headers=Object.keys(daily);const csv=headers.join(',')+'\n'+headers.map(key=>key==='T2M'?'':daily[key]).join(',');assert.throws(()=>parsePredictionDataset(csv,'daily'),/T2M/);
});
test('rejects duplicate, out-of-order and skipped dates',()=>{
 for(const date of ['2026-11-01','2026-10-31','2026-11-03']){const rows=sequence();rows[1].observation_date=date;assert.throws(()=>parsePredictionDataset(JSON.stringify(rows),'lstm'),/consecutive/);}
});
test('rejects incomplete sequences, nonfinite numbers and unexpected columns',()=>{
 assert.throws(()=>parsePredictionDataset(JSON.stringify(sequence().slice(0,13)),'lstm'),/14/);
 assert.equal(predictionRequestSchema.safeParse({model:'daily',observation:{...daily,T2M:Infinity}}).success,false);
 assert.throws(()=>parsePredictionDataset(JSON.stringify({...daily,latitude:13}),'daily'),/Unrecognized/);
});
test('accepts regional context without invented coordinates and rejects half a coordinate pair',()=>{
 const context={place:'Bicol Region, Philippines',source:'Local observations'};
 assert.equal(predictionRequestSchema.safeParse({model:'daily',observation:daily,context}).success,true);
 assert.equal(predictionRequestSchema.safeParse({model:'daily',observation:daily,context:{...context,latitude:13}}).success,false);
});
test('input fields match the fetched FireCase OpenAPI contract',()=>{
 const api=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/firecase-openapi.json'),'utf8'));
 const schema=api.components.schemas;
 assert.deepEqual(Object.keys(daily).sort(),schema.PredictionInput.required.slice().sort());
 assert.deepEqual(Object.keys(sequence()[0]).sort(),schema.LSTMDailyInput.required.slice().sort());
});
