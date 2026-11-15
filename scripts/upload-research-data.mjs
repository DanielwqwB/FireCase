import {createClient} from '@supabase/supabase-js';
import nextEnv from '@next/env';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
nextEnv.loadEnvConfig(process.cwd());
const bucket='research-datasets';
const source=path.resolve(process.argv.find(arg=>arg.startsWith('--source='))?.slice(9)||'.local-data/research');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret=process.env.SUPABASE_SECRET_KEY;
if(!url||!secret)throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and server-only SUPABASE_SECRET_KEY in .env.');
const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
const load=async name=>JSON.parse(await readFile(path.join(source,name),'utf8'));
const manifest=await load('manifest.json');
const detections=await load('bicol-hotspots.json');
if(!process.argv.includes('--apply')){
 console.log(JSON.stringify({mode:'preview',detections:detections.length,weather:manifest.weather.count,modelObservations:manifest.model_observations.count,bucket,public:false}));
 process.exit(0);
}
const syncId='16c997ab-ecaf-4cd8-87c1-1d82fcbca4d0';
const started=new Date().toISOString();
const check=result=>{if(result.error)throw new Error(result.error.message);return result.data};
try{
 check(await db.from('satellite_sync_logs').upsert({sync_id:syncId,data_source:'Local Bicol FIRMS + FireCase weather import',sync_status:'running',started_at:started,completed_at:null,records_processed:0,error_message:null}));
 const buckets=check(await db.storage.listBuckets());
 const existing=buckets.find(value=>value.id===bucket);
 if(existing?.public)throw new Error('Research bucket unexpectedly public. Make it private before importing.');
 if(!existing)check(await db.storage.createBucket(bucket,{public:false,fileSizeLimit:10000000,allowedMimeTypes:['application/json','application/geo+json']}));
 for(let offset=0;offset<detections.length;offset+=250){
  check(await db.from('satellite_detections').upsert(detections.slice(offset,offset+250),{onConflict:'source,external_detection_reference'}));
  console.log(`Hotspots saved: ${Math.min(offset+250,detections.length)}/${detections.length}`);
 }
 // Publish the manifest last so readers cannot see an incomplete dataset revision.
 for(const name of ['weather.json','model-observations.json','bicol-boundary.geojson','bicol-hotspots.json','manifest.json']){
  const bytes=await readFile(path.join(source,name));
  check(await db.storage.from(bucket).upload(`bicol-v1/${name}`,bytes,{contentType:'application/json',upsert:true,cacheControl:'0'}));
  console.log(`Stored privately: ${name}`);
 }
 const remoteWeather=JSON.parse(await check(await db.storage.from(bucket).download('bicol-v1/weather.json')).text());
 const remoteModels=JSON.parse(await check(await db.storage.from(bucket).download('bicol-v1/model-observations.json')).text());
 const count=await db.from('satellite_detections').select('detection_id',{count:'exact',head:true}).contains('source_metadata',{import_dataset:'firecase-bicol-local-v1'});
 check(count);
 if(count.count!==detections.length||remoteWeather.length!==manifest.weather.count||remoteModels.length!==manifest.model_observations.count)throw new Error('Remote row counts did not match prepared datasets.');
 check(await db.from('satellite_sync_logs').update({sync_status:'succeeded',completed_at:new Date().toISOString(),records_processed:detections.length+remoteWeather.length+remoteModels.length}).eq('sync_id',syncId));
 console.log(JSON.stringify({verified:true,bicolHotspots:count.count,weather:remoteWeather.length,modelObservations:remoteModels.length,privateBucket:bucket}));
}catch(error){
 await db.from('satellite_sync_logs').update({sync_status:'failed',completed_at:new Date().toISOString(),error_message:error.message}).eq('sync_id',syncId);
 console.error(`Import failed: ${error.message}`);process.exitCode=1;
}
