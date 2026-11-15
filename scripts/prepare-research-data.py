"""Prepare real FIRMS observations and original weather/model datasets without changing inputs."""
import argparse,collections,csv,datetime as dt,hashlib,json,math
from pathlib import Path

WEATHER=['CLDTMP','PS','T2M','TO3','TQV','TS','U10M','U50M','V10M','V50M']

def finite(value):
 number=float(value)
 if not math.isfinite(number):raise ValueError('Non-finite measurement')
 return number

def in_ring(x,y,ring):
 inside=False
 for a,b in zip(ring,ring[1:]+ring[:1]):
  if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:inside=not inside
 return inside

def polygons(geometry):
 return geometry['coordinates'] if geometry['type']=='MultiPolygon' else [geometry['coordinates']]

def in_boundary(lon,lat,geometry):
 for polygon in polygons(geometry):
  outer=polygon[0]
  if not (min(p[0] for p in outer)<=lon<=max(p[0] for p in outer) and min(p[1] for p in outer)<=lat<=max(p[1] for p in outer)):continue
  if in_ring(lon,lat,outer) and not any(in_ring(lon,lat,hole) for hole in polygon[1:]):return True
 return False

def read_csv(path):
 with path.open(encoding='utf-8-sig',newline='') as handle:return list(csv.DictReader(handle))

def prepare(root,output,boundary):
 output.mkdir(parents=True,exist_ok=True)
 feature=json.loads(boundary.read_text(encoding='utf-8'))['features'][0]
 geometry=feature['geometry']
 candidates={};stats=collections.Counter();files=[]
 # Archive first: prefer science-quality rows over any matching NRT observation.
 for path in sorted(root.rglob('fire_*.csv'),key=lambda p:('nrt' in p.name,str(p))):
  rows=read_csv(path);files.append({'file':str(path.relative_to(root)),'rows':len(rows),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
  for row in rows:
   stats['raw_hotspot_rows']+=1
   lat,lon=finite(row['latitude']),finite(row['longitude'])
   if not (4.5<=lat<=21.2 and 116.9<=lon<=126.6):stats['outside_ph_training_bbox']+=1;continue
   if row.get('type','') not in ('','0'):stats['excluded_non_vegetation_types']+=1;continue
   if not in_boundary(lon,lat,geometry):stats['outside_bicol']+=1;continue
   sensor='VIIRS' if 'SV-C2' in path.name else 'MODIS'
   time=row['acq_time'].zfill(4)
   observed=dt.datetime.strptime(row['acq_date']+time,'%Y-%m-%d%H%M').replace(tzinfo=dt.timezone.utc).isoformat()
   key='|'.join([sensor,row['satellite'],observed,format(lat,'.7f'),format(lon,'.7f')])
   external=hashlib.sha256(key.encode()).hexdigest()
   if external in candidates:stats['duplicate_bicol_rows']+=1;continue
   raw_conf=row.get('confidence','').lower()
   # Preserve MODIS numeric confidence in metadata; do not invent categorical thresholds.
   confidence={'l':'low','n':'nominal','h':'high'}.get(raw_conf)
   frp=finite(row['frp']) if row.get('frp','') else None
   if frp is not None and frp<0:raise ValueError(f'Negative FRP: {path.name}')
   candidates[external]={'source':'nasa_firms_viirs' if sensor=='VIIRS' else 'nasa_firms_modis','external_detection_reference':external,'geographic_location':f'SRID=4326;POINT({lon} {lat})','detection_time':observed,'fire_radiative_power':frp,'confidence':confidence,'satellite_name':row['satellite'],'instrument_name':sensor,'source_metadata':{'import_dataset':'firecase-bicol-local-v1','region':'Bicol Region','region_code':'PH-05','input_file':str(path.relative_to(root)),'product':'nrt' if 'nrt' in path.name else 'archive','boundary_source':'geoBoundaries gbOpen PHL ADM1, 2020, commit 41af8f1','raw':row}}
 detections=sorted(candidates.values(),key=lambda r:r['detection_time'])
 weather=[]
 for row in read_csv(root/'FireCase_Weather_2021_2025.csv'):
  date=dt.date.fromisoformat(row['date_UTC']).isoformat()
  weather.append({'observation_date':date,**{key:finite(row[key]) for key in WEATHER},'hours_available':{key:int(row[key+'_n_hours']) for key in WEATHER},'spatial_scope':'unspecified in source CSV'})
 if len({r['observation_date'] for r in weather})!=len(weather):raise ValueError('Duplicate weather dates')
 processed=root.parent/'processed'/'FireCase_Merged_Daily_2021_2025.csv'
 model_rows=[]
 for row in read_csv(processed):
  date=dt.date.fromisoformat(row['date']).isoformat();count=finite(row['total_hotspots'])
  if count<0 or not count.is_integer():raise ValueError('Invalid hotspot count')
  if int(row['MODIS_count'])+int(row['VIIRS_count'])!=int(count):raise ValueError('Sensor count mismatch')
  model_rows.append({'observation_date':date,**{key:finite(row[key]) for key in WEATHER},'total_hotspots':int(count)})
 model_rows.sort(key=lambda r:r['observation_date'])
 for previous,current in zip(model_rows,model_rows[1:]):
  if dt.date.fromisoformat(current['observation_date'])-dt.date.fromisoformat(previous['observation_date'])!=dt.timedelta(days=1):raise ValueError('Gap in processed model observations')
 manifest={'version':1,'prepared_at':dt.datetime.now(dt.timezone.utc).isoformat(),'region':'Bicol Region','boundary':{'name':feature['properties']['shapeName'],'code':feature['properties']['shapeISO'],'source':'https://www.geoboundaries.org/api/current/gbOpen/PHL/ADM1/','commit':'41af8f1','license':'CC BY 3.0 IGO'},'hotspots':{'count':len(detections),'from':detections[0]['detection_time'] if detections else None,'to':detections[-1]['detection_time'] if detections else None,'counts_by_sensor':dict(collections.Counter(r['instrument_name'] for r in detections)),'files':files,'processing':dict(stats),'meaning':'Historical satellite thermal anomalies, not confirmed or currently active wildfire cases.'},'weather':{'count':len(weather),'from':weather[0]['observation_date'],'to':weather[-1]['observation_date'],'source':'FireCase_Weather_2021_2025.csv','spatial_scope':'Not specified by the weather CSV. Do not assume Bicol coverage.','sha256':hashlib.sha256((root/'FireCase_Weather_2021_2025.csv').read_bytes()).hexdigest()},'model_observations':{'count':len(model_rows),'from':model_rows[0]['observation_date'],'to':model_rows[-1]['observation_date'],'scope':'Philippines training aggregation (4.5-21.2 N, 116.9-126.6 E)','source':processed.name,'sha256':hashlib.sha256(processed.read_bytes()).hexdigest(),'notes':'Preserves the existing training preprocessing, including its zero-filled daily hotspot counts. Historical evaluation only; not a Bicol-specific or current forecast.'},'other_sources':{'gpm_nc4_files':len(list(root.glob('GPM*/*.nc4'))),'smap_nc4_files':len(list(root.glob('SPL*/*.nc4'))),'burned_area':'MCD64A1 folder contains download manifest only; no HDF measurements. No recovery measurements created.'}}
 for name,value in [('bicol-hotspots.json',detections),('weather.json',weather),('model-observations.json',model_rows),('manifest.json',manifest),('bicol-boundary.geojson',{'type':'FeatureCollection','features':[feature]})]:
  (output/name).write_text(json.dumps(value,separators=(',',':'),allow_nan=False),encoding='utf-8')
 print(json.dumps({key:manifest[key] for key in ['region','weather','model_observations','other_sources']},indent=2));print('Bicol detections:',len(detections),dict(stats))
 return manifest

if __name__=='__main__':
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--source',type=Path,required=True);parser.add_argument('--output',type=Path,default=Path('.local-data/research'));parser.add_argument('--boundary',type=Path,default=Path('data/reference/bicol-region.geojson'));args=parser.parse_args();prepare(args.source,args.output,args.boundary)
