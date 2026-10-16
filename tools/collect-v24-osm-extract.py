"""Extract named agricultural/food distribution entities from public regional OSM dumps.
Install pyosmium in .probe/python, then run this script. No public Overpass dependency.
"""
import sys,json,urllib.request,hashlib,concurrent.futures
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'.probe/python'))
import osmium
OUT=ROOT/'data/pkg2';CACHE=ROOT/'.probe';CACHE.mkdir(exist_ok=True)
PROVINCES={'hunan':'湖南省','henan':'河南省','shandong':'山东省'}
def collect(key):
 url='https://download.geofabrik.de/asia/china/'+key+'-latest.osm.pbf';p=CACHE/(key+'.osm.pbf')
 if not p.exists():
  with urllib.request.urlopen(url,timeout=55) as r,p.open('wb') as f:
   while chunk:=r.read(1024*1024):f.write(chunk)
 elements=[]
 def wanted(t):
  return bool(t.get('name')) and (t.get('amenity')=='marketplace' or t.get('shop') in ['greengrocer','farm','supermarket','wholesale'] or t.get('landuse') in ['farmyard','orchard'] or t.get('industrial') in ['warehouse','grain_storage'] or t.get('building')=='greenhouse')
 class Handler(osmium.SimpleHandler):
  def add(self,obj,kind,point):
   tags=dict(obj.tags)
   if wanted(tags):elements.append(dict(type=kind,id=obj.id,lon=round(point[0],7),lat=round(point[1],7),tags=tags,province=PROVINCES[key],timestamp=str(obj.timestamp)))
  def node(self,n):
   if wanted(n.tags) and n.location.valid():self.add(n,'node',(n.location.lon,n.location.lat))
  def way(self,w):
   if not wanted(w.tags):return
   pts=[(n.lon,n.lat) for n in w.nodes if n.location.valid()]
   if pts:self.add(w,'way',(sum(x for x,y in pts)/len(pts),sum(y for x,y in pts)/len(pts)))
 Handler().apply_file(str(p),locations=True,idx='flex_mem')
 data=dict(sourceUrl=url,sha256=hashlib.sha256(p.read_bytes()).hexdigest(),license='ODbL 1.0',attribution='© OpenStreetMap contributors, extract by Geofabrik',elements=elements)
 (OUT/('v24-osm-'+key+'-source.json')).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
 return key,len(elements),p.stat().st_size
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 for f in concurrent.futures.as_completed([pool.submit(collect,k) for k in PROVINCES]):
  try:print(f.result(),flush=True)
  except Exception as e:print(type(e).__name__,str(e),flush=True)
