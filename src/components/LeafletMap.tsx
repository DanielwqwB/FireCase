'use client';
import {useState,useEffect} from 'react';
import {MapContainer,TileLayer,CircleMarker,Popup,ZoomControl,GeoJSON,useMap} from 'react-leaflet';
import type {ResearchHotspot} from '@/lib/research-types';
import {latLngBounds,geoJSON as leafletGeoJSON} from 'leaflet';
import type {GeoJsonObject} from 'geojson';
import type {WildfireCase} from '@/lib/types';

const mapboxToken=process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

export default function LeafletMap({cases,onPick,hotspots=[],boundaries=[]}:{cases:WildfireCase[];onPick?:(c:WildfireCase)=>void;hotspots?:ResearchHotspot[];boundaries?:unknown[]}){
 const [tileError,setTileError]=useState(false);
 return <div className="leaflet-wrap">
  <MapContainer center={hotspots.length?[13.1,123.5]:[12.9,122.8]} zoom={hotspots.length?7:5} scrollWheelZoom={false} zoomControl={false} className="leaflet-map">
   <MapViewport cases={cases} hotspots={hotspots} boundaries={boundaries}/>
   {boundaries.map(boundary=><GeoJSON key={JSON.stringify(boundary)} data={boundary as GeoJsonObject} style={{color:'#d77a33',weight:2,fillOpacity:.08}}/>)}
   <ZoomControl position="topright"/>
   {mapboxToken&&<TileLayer attribution='© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url={`https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}?access_token=${mapboxToken}`} tileSize={256} eventHandlers={{tileerror:()=>setTileError(true),load:()=>setTileError(false)}}/>}
   {cases.map(c=><CircleMarker key={c.id} center={[c.latitude,c.longitude]} radius={9} pathOptions={{color:'#fff',weight:3,fillColor:c.status==='Recovery'?'#22a06b':c.status==='Watch'?'#e8a324':'#f97316',fillOpacity:1}} eventHandlers={{click:()=>onPick?.(c)}}><Popup><b>{c.id}</b><br/>{c.location}<br/>{c.status} · {c.verification}</Popup></CircleMarker>)}
   {hotspots.map(point=><CircleMarker key={point.id} center={[point.latitude,point.longitude]} radius={4} pathOptions={{color:'#b54d13',weight:1,fillColor:'#ef883d',fillOpacity:.7}}><Popup><b>Historical {point.sensor} hotspot</b><br/>{new Date(point.observedAt).toLocaleString('en-PH',{timeZone:'Asia/Manila'})}<br/>{point.satellite} / FRP {point.frp??'not supplied'} MW<br/>Satellite observation; field confirmation not recorded.</Popup></CircleMarker>)}
  </MapContainer>
  {!mapboxToken&&<div className="mapbox-setup"><strong>Mapbox token required</strong><span>Add <code>NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN</code> to <code>.env.local</code>, then restart the app.</span></div>}
  {mapboxToken&&tileError&&<div className="mapbox-setup"><strong>Mapbox tiles could not load</strong><span>Check that the public token is valid, has Styles:Read access, and is allowed for this app’s URL.</span></div>}
  <div className="leaflet-caption">Stored records</div>
 </div>
}

function MapViewport({cases,hotspots,boundaries}:{cases:WildfireCase[];hotspots:ResearchHotspot[];boundaries:unknown[]}){
 const map=useMap();
 useEffect(()=>{
  const bounds=latLngBounds([]);
  for(const point of [...cases,...hotspots])if(Number.isFinite(point.latitude)&&Number.isFinite(point.longitude))bounds.extend([point.latitude,point.longitude]);
  for(const boundary of boundaries){try{bounds.extend(leafletGeoJSON(boundary as GeoJsonObject).getBounds())}catch{/* Invalid boundaries are excluded from viewport fitting. */}}
  if(bounds.isValid())map.fitBounds(bounds,{padding:[28,28],maxZoom:12,animate:false});
  const observer=new ResizeObserver(()=>map.invalidateSize());observer.observe(map.getContainer());return()=>observer.disconnect();
 },[map,cases,hotspots,boundaries]);return null;
}
