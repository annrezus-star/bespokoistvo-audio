import json,pathlib,urllib.request,urllib.parse,math,concurrent.futures,hashlib
ROOT=pathlib.Path(__file__).resolve().parents[1]
SOURCE=json.load(open(ROOT/'provenance/openfreemap-tilejson.json'));BOUNDS=[37.55,55.72,37.65,55.80]
HEADERS={'User-Agent':'BespokoistvoMap/1.0 (https://github.com/annrezus-star/bespokoistvo-audio)'}
def tile(lon,lat,z):
 n=2**z;return int((lon+180)/360*n),int((1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*n)
jobs=[]
for z in range(12,15):
 x0,y1=tile(BOUNDS[0],BOUNDS[1],z);x1,y0=tile(BOUNDS[2],BOUNDS[3],z)
 for x in range(x0,x1+1):
  for y in range(y0,y1+1):jobs.append((f'assets/tiles/{z}/{x}/{y}.pbf',SOURCE['tiles'][0].replace('{z}',str(z)).replace('{x}',str(x)).replace('{y}',str(y))))
for stack in ['Noto Sans Regular','Noto Sans Italic','Noto Sans Bold']:
 for glyph_range in ['0-255','256-511','1024-1279','8192-8447']:
  jobs.append((f'assets/fonts/{stack}/{glyph_range}.pbf','https://tiles.openfreemap.org/fonts/'+urllib.parse.quote(stack)+'/'+glyph_range+'.pbf'))
for suffix in ['.json','.png','@2x.json','@2x.png']:jobs.append(('assets/sprites/ofm'+suffix,'https://tiles.openfreemap.org/sprites/ofm_f384/ofm'+suffix))
def get(job):
 name,url=job;p=ROOT/name;p.parent.mkdir(parents=True,exist_ok=True)
 if not p.exists():
  with urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=40)as r:
   data=r.read();assert r.status==200 and len(data)>0
   if name.endswith('.json'):json.loads(data)
   p.write_bytes(data)
 data=p.read_bytes();return{'file':name,'source':url,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()}
print('Snapshot jobs',len(jobs),flush=True)
results=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=4)as ex:
 for i,r in enumerate(ex.map(get,jobs)):
  results.append(r)
  if(i+1)%20==0:print('Fetched',i+1,flush=True)
(ROOT/'provenance').mkdir(exist_ok=True)
(ROOT/'provenance/basemap-snapshot.json').write_text(json.dumps({'provider':'OpenFreeMap / OpenStreetMap','planetTileTemplate':SOURCE['tiles'][0],'downloadedDate':'2026-10-24','bounds':BOUNDS,'minzoom':12,'maxzoom':14,'tlsVerification':'Python default TLS validation with existing system trust; no certificate validation disabled; Chromium trust store unchanged','files':results},ensure_ascii=False,indent=2)+'\n')
print('Snapshot complete',sum(r['bytes']for r in results),'bytes',flush=True)
