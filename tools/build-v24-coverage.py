"""Build a compact, reproducible snapshot from captured public sources."""
import csv,json,collections,math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'data/pkg2'
def write(name,data):(OUT/name).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
weather=[]
for p in sorted((OUT/'v24-weather-raw').glob('*.json'),key=lambda p:int(p.stem)):
 raw=json.loads(p.read_text())
 for loc,res in zip(raw['places'],raw['responses']):
  d=res.get('daily',{});rows=[]
  for i,date in enumerate(d.get('time',[])):
   values=[d[k][i] for k in ['temperature_2m_min','temperature_2m_max','precipitation_sum','wind_speed_10m_max']]
   if all(isinstance(v,(int,float)) for v in values):rows.append([date,*values])
  if rows:weather.append([loc['lng'],loc['lat'],loc['province'],loc['country'],loc['anchor'],res['longitude'],res['latitude'],rows])
write('v24-weather.json',dict(source='https://open-meteo.com/en/docs/historical-weather-api',snapshotDate='2026-10-15',places=weather))
entities=[];facts=[];relations=[];byid={};seenplaces=set()
def region(country,province=''):
 rid='e:v24:area:'+country+':'+province
 path=[dict(level='country',name=country,code='CHN' if country=='中国' else country)]
 if province:path.append(dict(level='province',name=province,code=province))
 if rid not in byid:
  e=dict(entityId=rid,type='Region',canonicalName=province or country,status='active',geo=dict(geoPoint=None,regionPath=path),attributes={},supportingFactIds=[],provenanceMeta=dict(dataMode='real'));entities.append(e);byid[rid]=e
 return rid,path
def add(e,source,title,summary,category,meta):
 fid='v24-catalog:'+e['entityId'];e['supportingFactIds']=[fid];e['provenanceMeta']=dict(dataMode='real',sourceUrl=source,note=summary)
 country=next(x['name'] for x in e['geo']['regionPath'] if x['level']=='country');prov=next((x['name'] for x in e['geo']['regionPath'] if x['level']=='province'),'')
 rid,path=region(country,prov);e['geo']['regionPath']=path
 entities.append(e);byid[e['entityId']]=e
 f=dict(factId=fid,factType='profile',status='active',title=title,summary=summary,category=category,cardType='news',entityIds=[e['entityId'],rid],occurredAt='2026-10-15T12:00:00Z',ingestedAt='2026-10-15T12:00:00Z',geo=dict(e['geo'],scopeLayer='L3' if country=='中国' else 'L1',impactRadiusKm=0),credibility=dict(band='high',score=.8),severity=35,sourceUrl=source,sourcePlugin=meta['provider'],card=dict(fields=dict(sourceName=meta['provider'])),evidence=[dict(k='公开地物目录',t=meta['provider'],q=summary,url=source)],provenanceMeta=dict(dataMode='real',dataOrigin='public-facility-catalogue',dateMeaning='目录核对快照，非开业或交易日期',**meta))
 facts.append(f)
 relations.append(dict(relationId='r:v24:location:'+e['entityId'],relationType='LOCATED_IN',sourceEntityId=e['entityId'],targetEntityId=rid,nature='verified',supportingFactIds=[fid],provenanceMeta=dict(dataMode='real',note='公开目录地理归属，不代表供应或交易路线')))
for p in sorted(OUT.glob('v24-osm-*-source.json')):
 raw=json.loads(p.read_text())
 for o in raw.get('elements',[]):
  t=o['tags'];name=t.get('name:zh') or t.get('name');lng=o.get('lon',o.get('center',{}).get('lon'));lat=o.get('lat',o.get('center',{}).get('lat'))
  if not name or lng is None or lat is None:continue
  # One physical place can be mapped as both node and footprint.
  key=(name,round(lng,3),round(lat,3))
  if key in seenplaces:continue
  seenplaces.add(key);eid='e:v24:osm:'+o['type']+':'+str(o['id']);source='https://www.openstreetmap.org/'+o['type']+'/'+str(o['id'])
  isbase=t.get('landuse') in ('farmyard','orchard') or t.get('building')=='greenhouse';logistics=t.get('industrial') in ('warehouse','grain_storage')
  kind='Base' if isbase else 'LogisticsNode' if logistics else 'Market'
  label='果园' if t.get('landuse')=='orchard' else '农场' if isbase else '仓储设施' if logistics else {'greengrocer':'果蔬店','farm':'农产品直销店','supermarket':'食品零售商超','wholesale':'批发商店'}.get(t.get('shop'),'市场')
  address=''.join(t.get(k,'') for k in ['addr:city','addr:district','addr:street','addr:housenumber'])
  prov=o.get('province','');rid,path=region('中国',prov)
  summary='OpenStreetMap 登记为'+label+'；'+('地址：'+address+'；' if address else '')+'位置为'+('地物点' if o['type']=='node' else '建筑/地块参考中心')+'。目录记录不代表实时营业、库存或交易量。'
  attrs=dict(function=label,adminArea=prov,**{'设施类型':label})
  for k,v in [('地址',address),('营业时间',t.get('opening_hours')),('品牌',t.get('brand')),('经营者',t.get('operator')),('作物',t.get('crop')),('网站',t.get('website'))]:
   if v:attrs[k]=v
  add(dict(entityId=eid,type=kind,canonicalName=name,status='active',geo=dict(geoPoint=[lng,lat],geoPrecision='exact' if o['type']=='node' else 'approx',regionPath=path),attributes=attrs,commodityTags=[]),source,name+' · '+label+'目录记录',summary,'production' if isbase else 'logistics' if logistics else 'circulation',dict(provider='OpenStreetMap / Geofabrik',license='ODbL 1.0',attribution='© OpenStreetMap contributors',sourceUpdatedAt=o.get('timestamp','')))
old={x['properties']['id'] for x in json.loads((OUT/'airports-large.geojson').read_text())['features']};airportrows=[]
airportCandidates=collections.defaultdict(list)
for a in csv.DictReader((OUT/'v24-airports-source.csv').open()):
 if a['type'] in ('medium_airport','large_airport') and 'e:fac:apt-'+a['ident'].lower() not in old:airportCandidates[a['iso_country']].append(a)
# A balanced geography sample avoids replacing weather pseudo-entities with a
# directory dominated by one facility class/country. Keep all Chinese entries.
airportSelection=airportCandidates.pop('CN',[])
for i in range(50):
 for country,group in sorted(airportCandidates.items()):
  if i<len(group) and len(airportSelection)<1200:airportSelection.append(group[i])
for a in airportSelection:
 if a['type'] not in ('medium_airport','large_airport') or 'e:fac:apt-'+a['ident'].lower() in old:continue
 lat,lng=map(float,a['coordinates'].split(','));source='https://ourairports.com/airports/'+a['ident']+'/'
 eid='e:v24:airport:'+a['ident'];rid,path=region('中国' if a['iso_country']=='CN' else a['iso_country'],a['iso_region'] if a['iso_country']=='CN' else '')
 summary='OurAirports 公开登记的'+('中型' if a['type']=='medium_airport' else '大型')+'机场，'+(a['municipality']+'；' if a['municipality'] else '')+'用于农产品运输地理参考；不据此推断货运资质、农产品航线或实际吞吐量。'
 attrs=dict(function='机场',**{'设施类型':'机场','IATA':a['iata_code'],'ICAO':a['icao_code'],'城市':a['municipality']})
 add(dict(entityId=eid,type='LogisticsNode',canonicalName=a['name'],status='active',geo=dict(geoPoint=[lng,lat],geoPrecision='exact',regionPath=path),attributes=attrs,commodityTags=[]),source,a['name']+' · 机场目录记录',summary,'logistics',dict(provider='OurAirports',license='Public Domain'))
 airportrows.append(a)
write('v24-airports-selected.json',dict(sourceUrl='https://github.com/datasets/airport-codes/blob/master/data/airport-codes.csv',originalProvider='https://ourairports.com/data/',records=airportrows))
# Hold a small, geographically spread, real catalogue queue outside the registered graph.
# Arrivals create genuine business entities, not weather measurement pseudo-entities.
groups=[[],[],[]]
for e in entities:
 if e['type']=='Region':continue
 path=e['geo']['regionPath'];cn=any(p['name']=='中国' for p in path);hn=any(p['name']=='湖南省' for p in path)
 groups[0 if hn else 1 if cn else 2].append(e)
reserved=[]
for group in groups:
 if group:reserved += [group[int(i*len(group)/min(12,len(group)))] for i in range(min(12,len(group)))]
reservedIds={e['entityId'] for e in reserved};factById={f['factId']:f for f in facts};arrivals=[]
for e in reserved:
 f=factById[e['supportingFactIds'][0]];path=e['geo']['regionPath'];province=next((p['name'] for p in path if p['level']=='province'),None);pt=e['geo']['geoPoint'];domain={'Market':'channel','LogisticsNode':'logistics','Base':'resource'}[e['type']]
 obj=dict(id=e['entityId'],entityType=e['type'],typeName={'Market':'市场','LogisticsNode':'物流设施','Base':'产区与基地'}[e['type']],name=e['canonicalName'],domain=domain,geo=True,lng=pt[0],lat=pt[1],region=province or path[0]['name'],regionPath=path,props=list(e['attributes'].items()),factIds=e['supportingFactIds'],prov='real',sourceUrl=f['sourceUrl'],sub=e['attributes']['function'],commodityTags=[])
 fact=dict(id=f['factId'],title=f['title'],summary=f['summary'],cat=f['category'],cardType='news',card=f['card']['fields'],persistent=True,level=f['geo']['scopeLayer'],region=obj['region'],regionPath=path,province=province,lng=pt[0],lat=pt[1],date='2026-10-15',occurredAt=f['occurredAt'],ingestedAt=f['ingestedAt'],cred='high',credScore=.8,impact='low',radius=0,objects=[obj['id']],relations=[],prov='real',sourceUrl=f['sourceUrl'],evidence=f['evidence'],provenanceMeta=f['provenanceMeta'])
 rel=next(r for r in relations if r['sourceEntityId']==e['entityId'])
 arrivals.append(dict(objects=[obj],facts=[fact],relations=[dict(id=rel['relationId'],from_=obj['id'],to=rel['targetEntityId'],type='位于',typeCode='LOCATED_IN',nature='verified',confidence=.8,strength=.6,factIds=[fact['id']],prov='real')]))
 arrivals[-1]['relations'][0]['from']=arrivals[-1]['relations'][0].pop('from_')
write('v24-business.json',dict(entities=[e for e in entities if e['entityId'] not in reservedIds],facts=[f for f in facts if not any(x in reservedIds for x in f['entityIds'])],relations=[r for r in relations if r['sourceEntityId'] not in reservedIds],arrivals=arrivals))
print('weather reference points',len(weather),'records',sum(len(p[-1]) for p in weather),'Hunan',sum(len(p[-1]) for p in weather if '湖南' in p[2]))
print('business entities',len(entities),'facts',len(facts),'types',dict(collections.Counter(e['type'] for e in entities)))
