const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const vm=require('node:vm');
const demoCode=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib/demo-operations.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}}).outputText;
const demoContext={exports:{}};vm.runInNewContext(demoCode,demoContext);
function load(file,{user={id:'user-1',role:'admin'},env={},fetch=()=>{throw new Error('Unexpected network call')},db,admin}={}){
 const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/app/api',file,'route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2021}}).outputText;
 const mocks={'@/lib/demo-operations':demoContext.exports,'next/server':{NextResponse:{json:(data,init)=>Response.json(data,init)}},'@/lib/supabase/auth':{getCurrentUser:async()=>({user})},'@/lib/supabase/server':{createClient:async()=>db},'@/lib/supabase/admin':{createAdminClient:()=>{if(!admin)throw new Error('Unexpected privileged database access');return admin}},'@/lib/workspace-tools':{distanceKm:()=>1}};
 const context={exports:{},require:name=>name in mocks?mocks[name]:require(name),process:{env},fetch,URL,URLSearchParams,AbortSignal,Date,console};vm.runInNewContext(code,context);return context.exports;
}
const request=body=>({json:async()=>body});
const point={latitude:13.1,longitude:124.1};
test('all operations require an authenticated account',async()=>{
 const route=load('operations',{user:null});assert.equal((await route.GET()).status,401);assert.equal((await route.POST(request({kind:'resources',...point}))).status,401);
});
test('invalid locations are rejected before provider access',async()=>{
 const route=load('operations');for(const latitude of [NaN,91,'13.1'])assert.equal((await route.POST(request({kind:'weather',latitude,longitude:124}))).status,400);
});
test('unconfigured forecasts return actionable errors, not simulated results',async()=>{
 const route=load('operations');assert.equal((await route.POST(request({kind:'spread',...point,hours:6}))).status,503);assert.equal((await route.POST(request({kind:'burn',...point}))).status,503);assert.deepEqual(await (await route.GET()).json(),{demoMode:false,spreadConfigured:false,burnConfigured:false,deliveryConfigured:false});
});
test('weather request uses Manila time and explicit wind units',async()=>{
 const route=load('operations',{fetch:async url=>{assert.equal(url.searchParams.get('timezone'),'Asia/Manila');assert.equal(url.searchParams.get('wind_speed_unit'),'kmh');return Response.json({hourly:{time:['2026-11-15T12:00'],temperature_2m:[30],relative_humidity_2m:[65],wind_speed_10m:[12],precipitation:[null]}})}});const response=await route.POST(request({kind:'weather',...point}));assert.equal(response.status,200);assert.equal((await response.json()).hours[0].rain,null);
});
test('resource lookup classifies mapped features and preserves OSM IDs',async()=>{
 const route=load('operations',{fetch:async(url,options)=>{assert.match(String(options.body),/around/);return Response.json({elements:[{type:'node',id:12,lat:13,lon:124,tags:{amenity:'fire_station',name:'Station'}}]})}});const response=await route.POST(request({kind:'resources',...point}));const result=await response.json();assert.equal(result.resources[0].kind,'station');assert.equal(result.resources[0].id,'node/12');
});
test('forecast adapter rejects expired or mismatched provider results',async()=>{
 const payload={model:'validated-model',issuedAt:new Date().toISOString(),validAt:new Date(Date.now()+3600000).toISOString(),hours:12,geometry:{type:'Polygon',coordinates:[[[124,13],[125,13],[125,14],[124,13]]]}};
 const route=load('operations',{env:{FIRECASE_SPREAD_API_URL:'https://example.test/spread'},fetch:async()=>Response.json(payload)});assert.equal((await route.POST(request({kind:'spread',...point,hours:6}))).status,502);payload.hours=6;assert.equal((await route.POST(request({kind:'spread',...point,hours:6}))).status,200);payload.validAt='2020-01-01T00:00:00Z';assert.equal((await route.POST(request({kind:'spread',...point,hours:6}))).status,502);
});
test('burn adapter rejects malformed or expired advisories',async()=>{
 const payload={source:'provider',authority:'authority',issuedAt:new Date().toISOString(),validUntil:'2020-01-01T00:00:00Z',status:'go',reason:'advisory'};
 const route=load('operations',{env:{FIRECASE_BURN_API_URL:'https://example.test/burn'},fetch:async()=>Response.json(payload)});assert.equal((await route.POST(request({kind:'burn',...point}))).status,502);payload.validUntil=new Date(Date.now()+3600000).toISOString();assert.equal((await route.POST(request({kind:'burn',...point}))).status,200);
});
test('warning delivery denies nonresponders and refuses unreviewed warnings',async()=>{
 assert.equal((await load('warnings/deliver').POST(request({}))).status,403);
 const db={from:()=>({select:()=>({eq:()=>({single:async()=>({data:{created_by:'user-1',warning_status:'draft'}})})})})};
 const route=load('warnings/deliver',{user:{id:'user-1',role:'emergency_responder'},env:{FIRECASE_ALERT_WEBHOOK_URL:'https://example.test/send',FIRECASE_ALERT_WEBHOOK_TOKEN:'test-only'},db});assert.equal((await route.POST(request({id:'00000000-0000-4000-8000-000000000001'}))).status,403);
});
test('reviewed warning delivery uses provider idempotency and server token',async()=>{
 const warning={warning_id:'00000000-0000-4000-8000-000000000001',created_by:'user-1',warning_status:'reviewed',warning_title:'Warning',warning_message:'Message'};let calls=0;
 const db={from:()=>({select:()=>({eq:()=>({single:async()=>({data:warning})})})})};
 const route=load('warnings/deliver',{user:{id:'user-1',role:'emergency_responder'},env:{FIRECASE_ALERT_WEBHOOK_URL:'https://example.test/send',FIRECASE_ALERT_WEBHOOK_TOKEN:'test-only'},db,fetch:async(url,options)=>{calls++;assert.equal(options.headers['Idempotency-Key'],warning.warning_id);assert.equal(options.headers.authorization,'Bearer test-only');return new Response(null,{status:202})}});const response=await route.POST(request({id:warning.warning_id}));assert.equal(response.status,200);assert.equal((await response.json()).accepted,true);assert.equal(calls,1);
});
test('recovery writes deny firefighters and inaccessible cases before privileged access',async()=>{
 const body={caseId:'00000000-0000-4000-8000-000000000001',date:'2020-01-01',vegetationIndex:.4,burnedArea:null,severity:'low',status:'improving',source:'Measured survey'};
 const forbidden=load('recovery',{user:{id:'user-1',role:'firefighter'}});assert.equal((await forbidden.POST(request(body))).status,403);
 const db={from:()=>({select:()=>({eq:()=>({single:async()=>({data:null,error:new Error('not visible')})})})})};const scoped=load('recovery',{user:{id:'user-1',role:'land_manager'},db});assert.equal((await scoped.POST(request(body))).status,403);
});
test('Resend delivery uses server recipients, text content and a stable idempotency key',async()=>{
 const warning={warning_id:'00000000-0000-4000-8000-000000000001',case_id:'incident',created_by:'user-1',warning_status:'reviewed',created_at:new Date().toISOString(),reviewed_at:new Date().toISOString(),warning_title:'Warning',warning_message:'Source message'};
 const db={from:()=>({select:()=>({eq:()=>({single:async()=>({data:warning})})})})};let calls=0;
 const route=load('warnings/deliver',{user:{id:'user-1',role:'emergency_responder'},env:{RESEND_API_KEY:'test-key',FIRECASE_ALERT_FROM:'FireCase <alerts@example.test>',FIRECASE_ALERT_TO:'team@example.test'},db,fetch:async(url,options)=>{calls++;assert.equal(url,'https://api.resend.com/emails');assert.equal(options.headers['Idempotency-Key'],warning.warning_id);const body=JSON.parse(options.body);assert.deepEqual(body.to,['team@example.test']);assert.ok(body.text.startsWith('Source message'));assert.equal(body.html,undefined);return Response.json({id:'receipt-id'})}});
 const response=await route.POST(request({id:warning.warning_id,to:'unapproved@example.test'}));assert.equal(response.status,200);assert.equal((await response.json()).providerId,'receipt-id');assert.equal(calls,1);
 warning.created_at='2020-01-01T00:00:00Z';assert.equal((await route.POST(request({id:warning.warning_id}))).status,502);assert.equal(calls,1);
});

test('demo mode runs spread and burn without network access and marks results synthetic',async()=>{
 const route=load('operations',{env:{FIRECASE_DEMO_MODE:'true'}});assert.equal((await (await route.GET()).json()).demoMode,true);
 const sizes=[];
 for(const hours of [6,12,24]){const response=await route.POST(request({kind:'spread',...point,hours,scenario:'windy'}));assert.equal(response.status,200);const data=await response.json();assert.equal(data.demo,true);assert.equal(data.confidence,null);assert.equal(data.hours,hours);assert.match(data.model,/DEMO/);const ring=data.geometry.coordinates[0];assert.equal(ring.length,49);assert.deepEqual(ring[0],ring.at(-1));assert.ok(ring.flat().every(Number.isFinite));sizes.push(Math.max(...ring.map(p=>p[0]))-Math.min(...ring.map(p=>p[0])));}
 assert.ok(sizes[0]<sizes[1]&&sizes[1]<sizes[2]);
 for(const [scenario,status] of [['mild','go'],['windy','caution'],['dry','no-go']]){const data=await (await route.POST(request({kind:'burn',...point,scenario}))).json();assert.equal(data.demo,true);assert.equal(data.status,status);assert.match(data.authority,/no authority approval/);}
 assert.equal((await route.POST(request({kind:'spread',...point,scenario:'invented'}))).status,400);
});
test('demo requires explicit opt-in and does not replace live model configuration',async()=>{
 const route=load('operations',{env:{FIRECASE_DEMO_MODE:'false'}});assert.equal((await route.POST(request({kind:'spread',...point}))).status,503);
});
