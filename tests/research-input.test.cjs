const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const vm=require('node:vm');
function load(name){
 const source=fs.readFileSync(path.join(__dirname,'../src/lib',name+'.ts'),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const sandbox={exports:{},require:key=>key.startsWith('./')?load(key.slice(2)):require(key)};vm.runInNewContext(compiled,sandbox);return sandbox.exports;
}
const {storedModelInput}=load('research-input');
const weather=Object.fromEntries(['CLDTMP','PS','T2M','TO3','TQV','TS','U10M','U50M','V10M','V50M'].map(key=>[key,1]));
const rows=()=>Array.from({length:14},(_,i)=>({observation_date:`2025-12-${String(i+1).padStart(2,'0')}`,...weather,total_hotspots:i+1}));
test('Daily uses seven preceding days and excludes today from the mean',()=>{
 const result=storedModelInput(rows(),'daily','2025-12-08');assert.equal(result.observation.hotspots_today,8);assert.equal(result.observation.hotspots_prev7_mean,4);assert.match(result.context.place,/Philippines/);assert.match(result.context.source,/historical/);
});
test('LSTM preserves exactly 14 oldest-first observations',()=>{
 const result=storedModelInput(rows(),'lstm','2025-12-14');assert.equal(result.observations.length,14);assert.equal(result.observations[0].observation_date,'2025-12-01');assert.equal(result.observations[13].total_hotspots,14);
});
test('rejects insufficient history and unavailable dates',()=>{
 assert.throws(()=>storedModelInput(rows(),'daily','2025-12-07'),/preceding/);
 assert.throws(()=>storedModelInput(rows(),'lstm','2026-01-01'),/preceding/);
});
test('rejects gaps instead of treating missing dates as zero observations',()=>{
 const data=rows();data[3].observation_date='2025-11-01';assert.throws(()=>storedModelInput(data,'lstm','2025-12-14'),/gap/);
});
