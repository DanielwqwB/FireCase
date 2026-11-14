import {demoOperation} from '@/lib/demo-operations';
import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {getCurrentUser} from '@/lib/supabase/auth';
import {distanceKm} from '@/lib/workspace-tools';
import type {Resource} from '@/lib/workspace-tools';
const input=z.object({kind:z.enum(['weather','resources','spread','burn']),latitude:z.number().min(-90).max(90),longitude:z.number().min(-180).max(180),hours:z.union([z.literal(6),z.literal(12),z.literal(24)]).optional(),scenario:z.enum(['mild','windy','dry']).default('mild')});
const point=z.tuple([z.number().min(-180).max(180),z.number().min(-90).max(90)]);
const ring=z.array(point).min(4).max(5000).refine(r=>r[0][0]===r[r.length-1][0]&&r[0][1]===r[r.length-1][1],'Polygon rings must be closed');
const spread=z.object({model:z.string().min(1),issuedAt:z.string().datetime({offset:true}),validAt:z.string().datetime({offset:true}),hours:z.union([z.literal(6),z.literal(12),z.literal(24)]),geometry:z.object({type:z.literal('Polygon'),coordinates:z.array(ring).min(1).max(50)}),confidence:z.number().min(0).max(1).nullable().optional(),notes:z.string().max(4000).optional()});
const burn=z.object({source:z.string().min(1),issuedAt:z.string().datetime({offset:true}),validUntil:z.string().datetime({offset:true}),status:z.enum(['go','caution','no-go']),reason:z.string().min(1).max(4000),authority:z.string().min(1)});
export async function GET(){const {user}=await getCurrentUser();if(!user)return NextResponse.json({error:'Authentication required.'},{status:401});return NextResponse.json({demoMode:process.env.FIRECASE_DEMO_MODE==='true',spreadConfigured:!!process.env.FIRECASE_SPREAD_API_URL,burnConfigured:!!process.env.FIRECASE_BURN_API_URL,deliveryConfigured:!!(process.env.FIRECASE_ALERT_WEBHOOK_URL||(process.env.RESEND_API_KEY&&process.env.FIRECASE_ALERT_FROM&&process.env.FIRECASE_ALERT_TO))})}
export async function POST(request:NextRequest){
 const {user}=await getCurrentUser();if(!user)return NextResponse.json({error:'Authentication required.'},{status:401});
 const parsed=input.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Provide a valid location and operation.'},{status:400});const q=parsed.data;
 try{
  if(process.env.FIRECASE_DEMO_MODE==='true'&&(q.kind==='spread'||q.kind==='burn'))return NextResponse.json(demoOperation(q.kind,q.latitude,q.longitude,q.hours??6,q.scenario));
  if(q.kind==='weather'){
   const url=new URL('https://api.open-meteo.com/v1/forecast');url.search=new URLSearchParams({latitude:String(q.latitude),longitude:String(q.longitude),hourly:'temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation',forecast_days:'7',timezone:'Asia/Manila',wind_speed_unit:'kmh'}).toString();
   const response=await fetch(url,{signal:AbortSignal.timeout(20000),next:{revalidate:900}});if(!response.ok)throw new Error('Weather provider is unavailable.');const data=await response.json();
   if(!Array.isArray(data.hourly?.time))throw new Error('Weather provider returned invalid data.');
   return NextResponse.json({source:'Open-Meteo',sourceUrl:'https://open-meteo.com/',timezone:'Asia/Manila',retrievedAt:new Date().toISOString(),hours:data.hourly.time.map((time:string,i:number)=>({time,temperature:data.hourly.temperature_2m[i],humidity:data.hourly.relative_humidity_2m[i],wind:data.hourly.wind_speed_10m[i],rain:data.hourly.precipitation[i]}))});
  }
  if(q.kind==='resources'){
   const around=`(around:5000,${q.latitude},${q.longitude})`;const query=`[out:json][timeout:20];(nwr["amenity"~"^(drinking_water|fire_station|school|shelter)$"]${around};nwr["emergency"="water_tank"]${around};nwr["natural"="water"]${around};way["highway"~"^(primary|secondary|trunk)$"]${around};);out center 150;`;
   const response=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(25000),cache:'no-store'});if(!response.ok)throw new Error('OpenStreetMap resource lookup is unavailable. Try again later.');const data=await response.json();if(!Array.isArray(data.elements)||data.remark)throw new Error('Resource lookup was incomplete. Try again later.');
   const resources:Resource[]=data.elements.flatMap((e:{type:string;id:number;lat?:number;lon?:number;center?:{lat:number;lon:number};tags?:Record<string,string>})=>{const lat=e.lat??e.center?.lat,lon=e.lon??e.center?.lon;if(lat==null||lon==null)return [];const t=e.tags||{};const kind:Resource['kind']=t.highway?'road':t.amenity==='fire_station'?'station':t.amenity==='school'?'school':t.amenity==='shelter'?'shelter':'water';return [{id:`${e.type}/${e.id}`,name:t.name||t.highway||t.amenity||'Mapped water feature',kind,latitude:lat,longitude:lon,distanceKm:distanceKm(q.latitude,q.longitude,lat,lon)}]});
   return NextResponse.json({source:'© OpenStreetMap contributors',sourceUrl:'https://www.openstreetmap.org/copyright',retrievedAt:new Date().toISOString(),resources:resources.sort((a,b)=>a.distanceKm-b.distanceKm).filter(r=>r.distanceKm<=5)});
  }
  const endpoint=q.kind==='spread'?process.env.FIRECASE_SPREAD_API_URL:process.env.FIRECASE_BURN_API_URL;
  if(!endpoint)return NextResponse.json({error:q.kind==='spread'?'A fire-spread model has not been connected. Daily/LSTM activity models do not predict fire perimeters.':'An authorized burn-advisory provider has not been connected. Weather alone cannot authorize a burn.'},{status:503});
  if(new URL(endpoint).protocol!=='https:')throw new Error('Provider URL must use HTTPS.');
  const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',...(process.env.FIRECASE_OPERATIONS_API_KEY?{authorization:`Bearer ${process.env.FIRECASE_OPERATIONS_API_KEY}`}:{})},body:JSON.stringify({latitude:q.latitude,longitude:q.longitude,hours:q.hours??6}),signal:AbortSignal.timeout(30000),cache:'no-store'});if(!response.ok)throw new Error('The connected provider could not complete this request.');const payload=await response.json();
  const result=q.kind==='spread'?spread.safeParse(payload):burn.safeParse(payload);if(!result.success)throw new Error('The provider response does not match the configured contract.');
  if(q.kind==='spread'){const value=spread.parse(payload);if(value.hours!==(q.hours??6)||Date.parse(value.validAt)<=Date.now()||Date.parse(value.issuedAt)>Date.now()+300000)throw new Error('The spread forecast is expired or does not match the requested horizon.');}
  else {const value=burn.parse(payload);if(Date.parse(value.validUntil)<=Date.now()||Date.parse(value.issuedAt)>Date.now()+300000)throw new Error('The burn advisory is expired or has an invalid issue time.');}
  return NextResponse.json(result.data);
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Operation failed.'},{status:502})}
}
