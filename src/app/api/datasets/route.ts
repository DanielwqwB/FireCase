import {NextRequest,NextResponse} from 'next/server';
import {getCurrentUser} from '@/lib/supabase/auth';
import {createAdminClient} from '@/lib/supabase/admin';
import {storedModelInput,type ModelObservation} from '@/lib/research-input';
import type {ResearchSummary} from '@/lib/research-types';
export async function GET(request:NextRequest){
 const {user,error}=await getCurrentUser();
 if(!user)return NextResponse.json({error:error||'Authentication required.'},{status:401});
 const kind=request.nextUrl.searchParams.get('kind')||'summary';
 if(!['summary','model'].includes(kind))return NextResponse.json({error:'Unknown dataset request.'},{status:400});
 if(kind==='model'&&!['admin','emergency_responder'].includes(user.role))return NextResponse.json({error:'Only an Admin or Emergency Responder can load model inputs.'},{status:403});
 try{
  const db=createAdminClient();
  // Only these imported reference assets are exposed; operational tables remain subject to RLS.
  const read=async<T,>(name:string):Promise<T>=>{
   const {data,error}=await db.storage.from('research-datasets').download(`bicol-v1/${name}`);
   if(error||!data)throw new Error('Stored research dataset is unavailable. Run the research-data importer.');
   return JSON.parse(await data.text()) as T;
  }
  if(kind==='model'){
   const model=request.nextUrl.searchParams.get('model');
   if(model!=='daily'&&model!=='lstm')return NextResponse.json({error:'Choose Daily or LSTM.'},{status:400});
   const date=request.nextUrl.searchParams.get('date');
   if(!date||!/^\d{4}-\d{2}-\d{2}$/.test(date))return NextResponse.json({error:'Choose an observation date.'},{status:400});
   const rows=await read<ModelObservation[]>('model-observations.json');
   try{return NextResponse.json({input:storedModelInput(rows,model,date)})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Invalid stored observations.'},{status:400})}
  }
  const [manifest,hotspots]=await Promise.all([read<ResearchSummary>('manifest.json'),read<{external_detection_reference:string;detection_time:string;instrument_name:string;satellite_name:string;fire_radiative_power:number|null;source_metadata:{raw:{latitude:string;longitude:string}}}[]>('bicol-hotspots.json')]);
  const {region,weather,model_observations,other_sources}=manifest;
  return NextResponse.json({region,weather,model_observations,other_sources,hotspots:manifest.hotspots,sampleHotspots:hotspots.slice(-500).reverse().map(row=>({id:row.external_detection_reference,latitude:Number(row.source_metadata.raw.latitude),longitude:Number(row.source_metadata.raw.longitude),observedAt:row.detection_time,sensor:row.instrument_name,satellite:row.satellite_name,frp:row.fire_radiative_power}))});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Unable to read stored datasets.'},{status:503})}
}
