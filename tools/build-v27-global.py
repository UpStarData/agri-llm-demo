"""Freeze genuine agriculture observations; preserve annual periods and geographic precision."""
import collections,json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'data/pkg2';CACHE=ROOT/'.probe/v27-wb'
def write(path,data):path.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
specs={
 'AG.PRD.CREL.MT':('谷物产量','吨','supply'),
 'AG.YLD.CREL.KG':('谷物单产','公斤/公顷','production'),
 'AG.PRD.CROP.XD':('作物生产指数','指数（2014—2016=100）','production'),
 'AG.PRD.FOOD.XD':('食品生产指数','指数（2014—2016=100）','supply'),
 'AG.PRD.LVSK.XD':('畜牧业生产指数','指数（2014—2016=100）','production'),
 'AG.LND.ARBL.HA':('可耕地面积','公顷','production'),
 'NV.AGR.TOTL.ZS':('农林渔业增加值占GDP比重','%','supply'),
 'TX.VAL.FOOD.ZS.UN':('食品出口占商品出口比重','%','customs'),
 'TM.VAL.FOOD.ZS.UN':('食品进口占商品进口比重','%','customs')}
source_path=OUT/'v27-global-source.json'
if CACHE.exists() and len(list(CACHE.glob('*-metadata.json')))==len(specs):
 countries=json.loads((ROOT/'.probe/v27-worldbank-countries-zh.json').read_text())[1]
 countries=[c for c in countries if c['region']['id']!='NA' and c['latitude'] and c['longitude']]
 indicators={code:dict(metadata=json.loads((CACHE/(code+'-metadata.json')).read_text())[1][0],response=json.loads((CACHE/(code+'.json')).read_text())) for code in specs}
 write(source_path,dict(capturedAt='2026-10-16',countrySource='https://api.worldbank.org/v2/zh/country?format=json&per_page=400',countries=countries,indicators=indicators))
source=json.loads(source_path.read_text());countries={c['id']:c for c in source['countries']};facts=[]
for code,(label,unit,cat) in specs.items():
 data=source['indicators'][code];assert data['response'][0]['pages']==1
 for r in data['response'][1]:
  c=countries.get(r['countryiso3code']);year=r['date'];value=r['value']
  if not c or value is None or not year.isdigit() or not 2020<=int(year)<=2025:continue
  iso=c['id'];url=f'https://api.worldbank.org/v2/country/{iso}/indicator/{code}?format=json&date={year}'
  display=f'{value:,.2f}'.rstrip('0').rstrip('.')
  title=f'{c["name"]} · {year}年{label} {display}{unit}'
  meaning=f'{year}年度公开统计；地图采用世界银行提供的{c["capitalCity"] or "国家/地区"}参考坐标代表该国家/地区，不代表农场、作物地块或交易发生地。'
  facts.append(dict(factId=f'v27-wb:{iso}:{code}:{year}',factType='profile',status='active',title=title,summary=meaning,category=cat,cardType='news',entityIds=[],occurredAt=year,publishedAt=None,ingestedAt='2026-10-16T03:00:00Z',geo=dict(geoPoint=[float(c['longitude']),float(c['latitude'])],geoPrecision='region_only',scopeLayer='L1',regionPath=[dict(level='country',code=iso,name=c['name'])]),severity=35,credibility=dict(band='high',score=.9),metricKey=code,metricValue=value,metricUnit=unit,metricPeriod=year,sourceUrl=url,sourcePlugin='世界银行 WDI / '+('联合国粮农组织' if code.startswith('AG.') else '联合国商品贸易统计' if '.FOOD.' in code else '各国国民经济核算'),card=dict(fields=dict(sourceName='世界银行 WDI',publishedAt=year)),evidence=[dict(k=label,t='世界银行 WDI',q=f'{year}年度；{code}；原始数值{value}；单位{unit}',url=url)],provenanceMeta=dict(dataMode='real',dataOrigin='public-agricultural-statistics',sourceDate=year,sourceUrl=url,indicator=code,periodPrecision='year',coordinateMeaning=meaning,archiveRecord=True,sourceUpdated=data['response'][0].get('lastupdated'))))
counts=collections.Counter(f['geo']['regionPath'][0]['code'] for f in facts)
write(OUT/'v27-global.json',dict(facts=facts,entities=[],relations=[],countries=len(counts),counts=dict(counts),indicators=list(specs)))
print(json.dumps(dict(facts=len(facts),countries=len(counts),Russia=counts['RUS'],Canada=counts['CAN']),ensure_ascii=False))
