const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const vm=require('node:vm');
const code=ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../src/lib/workspace-tools.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}}).outputText;
const sandbox={exports:{}};vm.runInNewContext(code,sandbox);const {polygonFromPoints,csvText,caseGeoJSON,distanceKm,parsePolygonOverlay}=sandbox.exports;
const plain=x=>JSON.parse(JSON.stringify(x));
test('drawn polygons use longitude first and close the ring',()=>{
 const result=polygonFromPoints([[13,124],[14,124],[14,125]]);assert.deepEqual(plain(result.coordinates[0]),[[124,13],[124,14],[125,14],[124,13]]);
});
test('rectangle drawing supports opposite corner order and rejects zero area',()=>{
 const result=polygonFromPoints([[14,125],[13,124]],true);assert.equal(result.coordinates[0].length,5);assert.throws(()=>polygonFromPoints([[13,124],[13,125]],true),/different/);
});
test('incomplete and invalid map selections cannot be saved',()=>{
 assert.throws(()=>polygonFromPoints([[13,124],[14,124]]),/three/);assert.throws(()=>polygonFromPoints([[NaN,124],[14,124],[14,125]]),/coordinates/);assert.throws(()=>polygonFromPoints([[0,0],[1,1],[2,2]]),/enclose/);
});
test('CSV preserves quoting, line breaks and nulls while blocking spreadsheet formulas',()=>{
 const csv=csvText([{name:'a,"b"\nc',note:'=HYPERLINK("bad")',empty:null},{name:'@SUM(A1)',note:'normal'}]);assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"a,""b""\nc"'));assert.ok(csv.includes('"\'=HYPERLINK'));assert.ok(csv.includes('"\'@SUM(A1)"'));assert.ok(csv.includes('"normal",""'));
});
test('geographic exports preserve case properties and supplied boundaries',()=>{
 const collection=caseGeoJSON([{id:'FC-1',latitude:13,longitude:124,status:'Active'}],[{id:'a',name:'Area',hectares:10,boundary:{type:'Polygon',coordinates:[]}}]);assert.deepEqual(plain(collection.features[0].geometry.coordinates),[124,13]);assert.equal(collection.features[0].properties.id,'FC-1');assert.equal(collection.features[1].properties.name,'Area');
});
test('distance is measured in kilometers and is symmetric',()=>{
 assert.equal(distanceKm(13,124,13,124),0);assert.ok(Math.abs(distanceKm(0,0,0,1)-111.195)<.01);assert.equal(distanceKm(13,124,14,125),distanceKm(14,125,13,124));
});
test('polygon overlays reject malformed and out-of-range coordinates',()=>{
 const overlay={type:'Polygon',coordinates:[[[124,13],[125,13],[125,14],[124,13]]]};assert.equal(parsePolygonOverlay(JSON.stringify(overlay)).features.length,1);assert.throws(()=>parsePolygonOverlay('{"type":"Point","coordinates":[124,13]}'),/Polygon/);overlay.coordinates[0][1][0]=200;assert.throws(()=>parsePolygonOverlay(JSON.stringify(overlay)),/coordinate/);
});
