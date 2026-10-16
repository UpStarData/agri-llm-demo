"""Real model records on explicitly labelled reference grids, not business entities."""
import csv,json,math,urllib.parse,urllib.request,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'data/pkg2';CACHE=OUT/'v24-weather-raw';CACHE.mkdir(exist_ok=True)
def ring(pt,poly):
 x,y=pt;inside=False
 for a,b in zip(poly,poly[1:]+poly[:1]):
  if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:inside=not inside
 return inside
def inside(pt,geom):
 polys=geom['coordinates'] if geom['type']=='MultiPolygon' else [geom['coordinates']]
 return any(ring(pt,p[0]) and not any(ring(pt,h) for h in p[1:]) for p in polys)
def spaced(items,n):
 return [items[int(i*len(items)/n)] for i in range(n)] if len(items)>n else items
features=json.loads((ROOT/'data/china.geo.json').read_text())['features'];places=[]
for f in features:
 name=f['properties']['name'];hn='湖南' in name;step=.14 if hn else .55;pts=[]
 for iy in range(math.ceil(17.5/step),math.ceil(54.5/step)):
  for ix in range(math.ceil(73/step),math.ceil(136/step)):
   pt=[round(ix*step,3),round(iy*step,3)]
   if inside(pt,f['geometry']):pts.append(dict(lng=pt[0],lat=pt[1],province=name,country='中国',code='CN',anchor='气象模型网格参考坐标'))
 places+=spaced(pts,740 if hn else 60)
world=[];cells=set()
for a in csv.DictReader((OUT/'v24-airports-source.csv').open()):
 if a['type'] not in ('large_airport','medium_airport') or a['iso_country']=='CN':continue
 lat,lng=map(float,a['coordinates'].split(','));cell=(math.floor(lng/3),math.floor(lat/3))
 if cell in cells:continue
 cells.add(cell);world.append(dict(lng=lng,lat=lat,country=a['iso_country'],code=a['iso_country'],province='',anchor=a['name']+' 周边气象网格'))
places+=spaced(world,600)
(OUT/'v24-weather-places.json').write_text(json.dumps(places,ensure_ascii=False,separators=(',',':')))
print('reference coordinates',len(places),'Hunan',sum('湖南' in p['province'] for p in places),flush=True)
def fetch(i):
 p=CACHE/(str(i)+'.json')
 if p.exists():return i,'cached'
 chunk=places[i:i+70]
 params=dict(latitude=','.join(str(p['lat']) for p in chunk),longitude=','.join(str(p['lng']) for p in chunk),start_date='2026-10-07',end_date='2026-10-13',daily='temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',timezone='UTC')
 url='https://archive-api.open-meteo.com/v1/archive?'+urllib.parse.urlencode(params)
 with urllib.request.urlopen(url,timeout=45) as r:d=json.load(r)
 if not isinstance(d,list) or len(d)!=len(chunk):raise ValueError('response count mismatch')
 p.write_text(json.dumps(dict(sourceUrl=url,places=chunk,responses=d),ensure_ascii=False,separators=(',',':')))
 return i,'ok'
pending=[i for i in range(0,len(places),70) if not (CACHE/(str(i)+'.json')).exists()]
pending.sort(key=lambda i:0 if any('湖南' in p['province'] for p in places[i:i+70]) else 1)
for i in pending:
 try:print(fetch(i),flush=True)
 except Exception as e:
  print(type(e).__name__,str(e),flush=True)
  # Respect service limits: stop rather than retrying every pending location.
  break
 time.sleep(9)
