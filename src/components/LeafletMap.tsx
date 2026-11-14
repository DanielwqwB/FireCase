'use client';
import {useState,useEffect} from 'react';
import {MapContainer,TileLayer,CircleMarker,Popup,ZoomControl,GeoJSON,Polyline,useMap,useMapEvents} from 'react-leaflet';
import type {ResearchHotspot} from '@/lib/research-types';
import {latLngBounds,geoJSON as leafletGeoJSON} from 'leaflet';
import type {GeoJsonObject} from 'geojson';
import type {MapTools} from '@/lib/workspace-tools';
import type {WildfireCase} from '@/lib/types';

const mapboxToken=process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
// Keep the operational map focused on Region V (Bicol) and prevent stray
// coordinates from pulling its viewport to another part of the country.
const BICOL_BOUNDS={south:11.3,north:14.5,west:122.3,east:126.1};
const BICOL_CENTER:[number,number]=[13.1,124.1];

function isInBicol(latitude:number,longitude:number){
 return Number.isFinite(latitude)&&Number.isFinite(longitude)&&latitude>=BICOL_BOUNDS.south&&latitude<=BICOL_BOUNDS.north&&longitude>=BICOL_BOUNDS.west&&longitude<=BICOL_BOUNDS.east;
}

export default function LeafletMap({cases,onPick,hotspots=[],boundaries=[],tools,overlay,overlayColor='#ef5418'}:{overlayColor?:string;tools?:MapTools;overlay?:GeoJsonObject;cases:WildfireCase[];onPick?:(c:WildfireCase)=>void;hotspots?:ResearchHotspot[];boundaries?:unknown[]}){
 const [tileError,setTileError]=useState(false);
 return <div className="leaflet-wrap">
  <MapContainer center={BICOL_CENTER} zoom={8} scrollWheelZoom={false} zoomControl={false} className="leaflet-map">
   <MapViewport cases={cases} hotspots={hotspots} boundaries={boundaries} focus={tools?.focus}/>{tools&&<DrawEvents tools={tools}/>}
   {overlay&&<GeoJSON key={JSON.stringify(overlay)} data={overlay} style={{color:overlayColor,fillColor:overlayColor,fillOpacity:.25,weight:2}}/>}
   {tools&&tools.draft.length>0&&<Polyline positions={tools.draft} pathOptions={{color:"#ff710f",dashArray:"5 5"}}/>}
   {tools?.resources.filter(r=>tools.resourceKinds.includes(r.kind)).map(r=><CircleMarker key={r.id} center={[r.latitude,r.longitude]} radius={7} pathOptions={{color:"#fff",weight:2,fillColor:r.kind==="water"?"#208ac5":r.kind==="station"?"#b34724":"#719848",fillOpacity:1}}><Popup><b>{r.name}</b><br/>{r.kind} ? {r.distanceKm.toFixed(1)} km straight-line</Popup></CircleMarker>)}
   {(!tools||tools.boundaries)&&boundaries.map(boundary=><GeoJSON key={JSON.stringify(boundary)} data={boundary as GeoJsonObject} style={{color:'#d77a33',weight:2,fillOpacity:.08}}/>)}
   <ZoomControl position="topright"/>
   {mapboxToken&&<TileLayer attribution='© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url={`https://api.mapbox.com/styles/v1/mapbox/${tools?.satellite===false?"streets-v12":"satellite-streets-v12"}/tiles/256/{z}/{x}/{y}?access_token=${mapboxToken}`} tileSize={256} eventHandlers={{tileerror:()=>setTileError(true),load:()=>setTileError(false)}}/>}
   {(!tools||tools.cases)&&cases.map(c=><CircleMarker key={c.id} center={[c.latitude,c.longitude]} radius={9} pathOptions={{color:'#fff',weight:3,fillColor:c.status==='Recovery'?'#22a06b':c.status==='Watch'?'#e8a324':'#f97316',fillOpacity:1}} eventHandlers={{click:()=>onPick?.(c)}}><Popup><b>{c.id}</b><br/>{c.location}<br/>{c.status} · {c.verification}</Popup></CircleMarker>)}
   {(!tools||tools.hotspots)&&hotspots.map(point=><CircleMarker key={point.id} center={[point.latitude,point.longitude]} radius={4} pathOptions={{color:'#b54d13',weight:1,fillColor:'#ef883d',fillOpacity:.7}}><Popup><b>Historical {point.sensor} hotspot</b><br/>{new Date(point.observedAt).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}<br/>{point.satellite} / FRP {point.frp??'not supplied'} MW<br/>Satellite observation; field confirmation not recorded.</Popup></CircleMarker>)}
  </MapContainer>
  {!mapboxToken&&<div className="mapbox-setup"><strong>Mapbox token required</strong><span>Add <code>NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN</code> to <code>.env.local</code>, then restart the app.</span></div>}
  {mapboxToken&&tileError&&<div className="mapbox-setup"><strong>Mapbox tiles could not load</strong><span>Check that the public token is valid, has Styles:Read access, and is allowed for this app’s URL.</span></div>}
  <div className="leaflet-caption">Stored records</div>
 </div>
}

function MapViewport({cases,hotspots,boundaries,focus}:{focus?:[number,number];cases:WildfireCase[];hotspots:ResearchHotspot[];boundaries:unknown[]}){
 const map=useMap();const focusLat=focus?.[0],focusLon=focus?.[1];
 useEffect(()=>{
  if(focusLat!==undefined&&focusLon!==undefined&&Number.isFinite(focusLat)&&Number.isFinite(focusLon)&&Math.abs(focusLat)<=90&&Math.abs(focusLon)<=180){map.setView([focusLat,focusLon],Math.max(map.getZoom(),10),{animate:false});map.invalidateSize();return;}
  const bounds=latLngBounds([]);
  for(const point of [...cases,...hotspots])if(isInBicol(point.latitude,point.longitude))bounds.extend([point.latitude,point.longitude]);
  for(const boundary of boundaries){try{const boundaryBounds=leafletGeoJSON(boundary as GeoJsonObject).getBounds();const center=boundaryBounds.getCenter();if(isInBicol(center.lat,center.lng))bounds.extend(boundaryBounds)}catch{/* Invalid boundaries are excluded from viewport fitting. */}}
  if(bounds.isValid())map.fitBounds(bounds,{padding:[28,28],maxZoom:10,animate:false});
  else map.setView(BICOL_CENTER,8,{animate:false});
 },[map,cases,hotspots,boundaries,focusLat,focusLon]);
 useEffect(()=>{const observer=new ResizeObserver(()=>map.invalidateSize());observer.observe(map.getContainer());return()=>observer.disconnect()},[map]);return null;
}

function DrawEvents({tools}:{tools:MapTools}){useMapEvents({click(event){if(tools.mode!=="browse")tools.onPoint([event.latlng.lat,event.latlng.lng])}});return null}
