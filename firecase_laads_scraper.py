"""FireCase: index NASA LAADS MCD64A1 Collection 6.1 (2021-2025).

Install: pip install requests
Run index only: python firecase_laads_scraper.py
Run plus download: set EARTHDATA_TOKEN=YOUR_TOKEN (Windows CMD)
                   python firecase_laads_scraper.py --download

NASA LAADS archive: https://ladsweb.modaps.eosdis.nasa.gov/archive/allData/61/MCD64A1/
Only candidate MODIS tiles intersecting the approximate Philippines bbox are selected.
The output is not clipped to the Philippines; actual HDF files need spatial clipping.
"""
import argparse
import csv
import datetime as dt
import os
import re
import sys
import time
from pathlib import Path
from urllib.parse import urljoin

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

BASE = 'https://ladsweb.modaps.eosdis.nasa.gov/archive/allData/61/MCD64A1/'
# Conservative candidate tiles for bounding box 116.9-126.6 E, 4.5-21.2 N.
TILES = {f'h{h:02d}v{v:02d}' for h in range(28,31) for v in range(6,9)}
PATTERN = re.compile(r'MCD64A1\.A\d{7}\.(h\d{2}v\d{2})\.061\.\d+\.hdf')

def months():
    for year in range(2021,2026):
        for month in range(1,13):
            d = dt.date(year, month, 1)
            yield year, month, d.timetuple().tm_yday

def session(token):
    s=requests.Session()
    retry=Retry(total=3, backoff_factor=1, status_forcelist=[429,500,502,503,504])
    s.mount('https://', HTTPAdapter(max_retries=retry))
    s.headers.update({'User-Agent':'FireCase-LAADS-index/1.0'})
    if token:
        s.headers['Authorization']='Bearer '+token
    return s

def index(s):
    found=[]
    failed=[]
    for year, month, doy in months():
        directory=f'{BASE}{year}/{doy:03d}/'
        try:
            r=s.get(directory,timeout=35)
            r.raise_for_status()
            matches=sorted(set(PATTERN.finditer(r.text)),key=lambda m:m.group(0))
            # Set of Match objects above is unique by identity, so dedup URL below.
            files={m.group(0):m.group(1) for m in matches if m.group(1) in TILES}
            if not files:
                failed.append((directory,'No matching files found; inspect this listing'))
            for filename,tile in sorted(files.items()):
                found.append({'year':year,'month':month,'tile':tile,
                              'filename':filename,'url':urljoin(directory,filename)})
            print(f'{year}-{month:02d}: {len(files)} Philippines-candidate HDF files',flush=True)
        except requests.RequestException as e:
            failed.append((directory,str(e)))
            print('ERROR:',directory,str(e),file=sys.stderr)
        time.sleep(0.2)
    return found,failed

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--download',action='store_true',help='Download HDF files after indexing')
    p.add_argument('--output',default='FireCase_MCD64A1_2021_2025')
    args=p.parse_args()
    out=Path(args.output); out.mkdir(exist_ok=True,parents=True)
    token=os.getenv('EARTHDATA_TOKEN','').strip()
    s=session(token)
    found,failed=index(s)
    with (out/'manifest.csv').open('w',newline='',encoding='utf-8') as f:
        w=csv.DictWriter(f,fieldnames=['year','month','tile','filename','url'])
        w.writeheader();w.writerows(found)
    (out/'download_urls.txt').write_text('\n'.join(x['url'] for x in found)+'\n',encoding='utf-8')
    if failed:
        (out/'errors.txt').write_text('\n'.join(f'{u} | {err}' for u,err in failed),encoding='utf-8')
    print(f'\nIndexed {len(found)} matching files. Manifest in {out.resolve()}')
    if not args.download:
        print('To actually download: set EARTHDATA_TOKEN and rerun with --download')
        return
    if not token:
        sys.exit('Missing EARTHDATA_TOKEN. Create an Earthdata bearer token and set the environment variable.')
    for i,x in enumerate(found,1):
        directory=out/str(x['year'])/f"{x['month']:02d}"
        directory.mkdir(exist_ok=True,parents=True)
        target=directory/x['filename']
        if target.exists() and target.stat().st_size>0:
            continue
        print(f'[{i}/{len(found)}] {target.name}',flush=True)
        try:
            with s.get(x['url'],stream=True,timeout=90,allow_redirects=True) as r:
                r.raise_for_status()
                if 'text/html' in r.headers.get('Content-Type','').lower():
                    raise ValueError('Received HTML login page instead of HDF: check Earthdata token')
                tmp=target.with_suffix('.part')
                with tmp.open('wb') as f:
                    for chunk in r.iter_content(chunk_size=1024*1024):
                        if chunk:f.write(chunk)
                tmp.replace(target)
        except Exception as e:
            print('DOWNLOAD FAILED:',str(e),file=sys.stderr)
    print('Finished. Files are raw MODIS tiles; mosaic/clip to Philippines before analysis.')

if __name__=='__main__':
    main()
