import type {WildfireCase,Area} from './types';
export type Resource={id:string;name:string;kind:'water'|'road'|'station'|'school'|'shelter';latitude:number;longitude:number;distanceKm:number};
export type RecoveryMeasurement={recovery_id:string;case_id:string;observation_date:string;vegetation_index:number|null;burned_area_hectares:number|null;burn_severity:string|null;recovery_status:string;source:string};
export type MapTools={hotspots:boolean;cases:boolean;boundaries:boolean;satellite:boolean;resourceKinds:string[];resources:Resource[];mode:'browse'|'point'|'polygon'|'rectangle';draft:[number,number][];focus?:[number,number];onPoint:(point:[number,number])=>void};
export function distanceKm(a:number,b:number,c:number,d:number){const rad=Math.PI/180;const h=Math.sin((c-a)*rad/2)**2+Math.cos(a*rad)*Math.cos(c*rad)*Math.sin((d-b)*rad/2)**2;return 6371*2*Math.asin(Math.sqrt(Math.min(1,h)))}
export function polygonFromPoints(points:[number,number][],rectangle=false){
 if(points.some(([lat,lon])=>!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180))throw new Error('Invalid map coordinates.');
 let ring:number[][];
 if(rectangle){if(points.length!==2)throw new Error('Select two opposite corners.');const [[a,b],[c,d]]=points;if(a===c||b===d)throw new Error('Choose corners with different latitude and longitude.');ring=[[b,a],[d,a],[d,c],[b,c],[b,a]]}
 else {if(points.length<3)throw new Error('Select at least three polygon vertices.');ring=points.map(([lat,lon])=>[lon,lat]);ring.push([...ring[0]]);const area=ring.slice(1).reduce((n,p,i)=>n+ring[i][0]*p[1]-p[0]*ring[i][1],0);if(Math.abs(area)<1e-10)throw new Error('The polygon must enclose an area.');}
 return {type:'Polygon' as const,coordinates:[ring]};
}
export function parsePolygonOverlay(text:string){
 const parsed=JSON.parse(text);const geometries=parsed.type==='FeatureCollection'?parsed.features?.map((f:{geometry:unknown})=>f.geometry):[parsed.type==='Feature'?parsed.geometry:parsed];
 if(!Array.isArray(geometries)||!geometries.length||geometries.length>100)throw new Error('Import 1–100 Polygon or MultiPolygon features.');
 const features=geometries.map((geometry:{type:string;coordinates:unknown})=>{
  if(!geometry||!['Polygon','MultiPolygon'].includes(geometry.type))throw new Error('Only Polygon and MultiPolygon overlays are supported.');
  const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  if(!Array.isArray(polygons)||!polygons.length)throw new Error('Overlay coordinates are missing.');
  for(const polygon of polygons){if(!Array.isArray(polygon)||!polygon.length)throw new Error('Polygon rings are missing.');for(const ring of polygon){if(!Array.isArray(ring)||ring.length<4||ring.length>5000)throw new Error('Each ring needs 4–5000 coordinates.');for(const p of ring){if(!Array.isArray(p)||p.length<2||!p.every(Number.isFinite)||Math.abs(p[0])>180||Math.abs(p[1])>90)throw new Error('Invalid longitude/latitude coordinate.');}if(ring[0][0]!==ring[ring.length-1][0]||ring[0][1]!==ring[ring.length-1][1])throw new Error('Polygon rings must be closed.');}}
  return {type:'Feature' as const,geometry,properties:{source:'User imported overlay'}};
 });return {type:'FeatureCollection' as const,features};
}
export function csvText(rows:Record<string,unknown>[]){const keys=Array.from(new Set(rows.flatMap(row=>Object.keys(row))));const escape=(v:unknown)=>{let text=v==null?'':typeof v==='object'?JSON.stringify(v):String(v);if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"'};return '\uFEFF'+[keys.map(escape).join(','),...rows.map(row=>keys.map(key=>escape(row[key])).join(','))].join('\r\n')}
export function downloadFile(name:string,value:string,type:string){const url=URL.createObjectURL(new Blob([value],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
export function caseGeoJSON(cases:WildfireCase[],areas:Area[]=[]){return {type:'FeatureCollection',features:[...cases.map(({latitude,longitude,...properties})=>({type:'Feature',geometry:{type:'Point',coordinates:[longitude,latitude]},properties})),...areas.filter(a=>a.boundary).map(a=>({type:'Feature',geometry:a.boundary,properties:{id:a.id,name:a.name,hectares:a.hectares}}))]}}
