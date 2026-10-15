"""Collect real weather at public administrative/airport anchors; no invented events."""
import collections, concurrent.futures, datetime, json, subprocess, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/pkg2'
SNAPSHOT = '2026-10-13'
CITIES = '''莫斯科|RU|37.62|55.75
圣彼得堡|RU|30.32|59.94
克拉斯诺达尔|RU|38.98|45.04
罗斯托夫|RU|39.70|47.24
沃罗涅日|RU|39.20|51.66
别尔哥罗德|RU|36.59|50.60
库尔斯克|RU|36.19|51.73
奥廖尔|RU|36.06|52.97
布良斯克|RU|34.36|53.24
斯摩棱斯克|RU|32.05|54.78
喀山|RU|49.12|55.79
萨拉托夫|RU|46.03|51.53
萨马拉|RU|50.10|53.20
伏尔加格勒|RU|44.51|48.71
阿斯特拉罕|RU|48.04|46.35
斯塔夫罗波尔|RU|41.97|45.04
马哈奇卡拉|RU|47.50|42.98
乌法|RU|55.96|54.74
奥伦堡|RU|55.10|51.77
车里雅宾斯克|RU|61.40|55.16
叶卡捷琳堡|RU|60.60|56.84
秋明|RU|65.53|57.15
鄂木斯克|RU|73.37|54.99
新西伯利亚|RU|82.92|55.03
巴尔瑙尔|RU|83.78|53.35
克麦罗沃|RU|86.09|55.35
克拉斯诺亚尔斯克|RU|92.87|56.01
伊尔库茨克|RU|104.30|52.29
乌兰乌德|RU|107.58|51.83
赤塔|RU|113.50|52.03
布拉戈维申斯克|RU|127.54|50.29
哈巴罗夫斯克|RU|135.07|48.48
符拉迪沃斯托克|RU|131.89|43.12
雅库茨克|RU|129.73|62.03
马加丹|RU|150.81|59.56
彼得罗巴甫洛夫斯克|RU|158.65|53.04
南萨哈林斯克|RU|142.74|46.96
托木斯克|RU|84.97|56.50
加里宁格勒|RU|20.50|54.70
阿尔汉格尔斯克|RU|40.54|64.54
摩尔曼斯克|RU|33.08|68.97
沃洛格达|RU|39.88|59.22
彼尔姆|RU|56.25|58.01
托博尔斯克|RU|68.26|58.20
多伦多|CA|-79.38|43.65
渥太华|CA|-75.69|45.42
蒙特利尔|CA|-73.57|45.50
魁北克|CA|-71.21|46.81
温尼伯|CA|-97.14|49.90
萨斯卡通|CA|-106.67|52.13
里贾纳|CA|-104.62|50.45
卡尔加里|CA|-114.07|51.05
埃德蒙顿|CA|-113.49|53.55
维多利亚|CA|-123.37|48.43
阿伯茨福德|CA|-122.29|49.05
坎卢普斯|CA|-120.33|50.67
彭蒂克顿|CA|-119.59|49.50
哈利法克斯|CA|-63.57|44.65
蒙克顿|CA|-64.78|46.09
夏洛特敦|CA|-63.13|46.24
弗雷德里克顿|CA|-66.64|45.96
桑德贝|CA|-89.25|48.38
圣约翰斯|CA|-52.71|47.56
怀特霍斯|CA|-135.06|60.72
耶洛奈夫|CA|-114.38|62.45
伊卡卢伊特|CA|-68.52|63.75
长沙|CN|112.94|28.23
株洲|CN|113.15|27.83
湘潭|CN|112.94|27.83
衡阳|CN|112.57|26.89
邵阳|CN|111.47|27.24
岳阳|CN|113.13|29.36
常德|CN|111.70|29.03
张家界|CN|110.48|29.13
益阳|CN|112.36|28.55
郴州|CN|113.02|25.77
永州|CN|111.61|26.42
怀化|CN|109.98|27.55
娄底|CN|112.00|27.70
吉首|CN|109.70|28.26
邵阳县|CN|111.27|26.99
洞口|CN|110.57|27.06
隆回|CN|111.03|27.11
新宁|CN|110.85|26.43
武冈|CN|110.63|26.73
酉阳|CN|108.77|28.84
花垣|CN|109.48|28.58
浏阳|CN|113.63|28.15
宁乡|CN|112.55|28.28
平江|CN|113.58|28.70'''
names = {'RU':'俄罗斯','CA':'加拿大','CN':'中国','US':'美国','BR':'巴西','MX':'墨西哥','AU':'澳大利亚','NZ':'新西兰','JP':'日本','KR':'韩国','TH':'泰国','VN':'越南','MY':'马来西亚','ID':'印度尼西亚','IN':'印度','DE':'德国','FR':'法国','IT':'意大利','ES':'西班牙','GB':'英国','ZA':'南非','KE':'肯尼亚','EG':'埃及','NG':'尼日利亚','AR':'阿根廷','CL':'智利','PE':'秘鲁'}
def continent(iso):
    if iso in 'AI AG AW BS BB BZ BM BQ VG CA KY CR CU CW DM DO SV GL GD GP GT HT HN JM MQ MS MX NI PA PR BL KN LC MF PM VC SX TT TC US VI'.split(): return '北美洲'
    if iso in 'AR CL BR PE EC CO VE UY PY BO GY SR GF'.split(): return '南美洲'
    if iso in 'AS AU CK FJ PF GU KI MH FM NR NC NZ NU NF MP PW PG PN WS SB TK TO TV UM VU WF'.split(): return '大洋洲'
    if iso in 'DZ AO BJ BW BF BI CM CV CF TD KM CG CD CI DJ EG GQ ER ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD SZ TZ TG TN UG ZM ZW EH RE YT'.split(): return '非洲'
    if iso in 'AL AD AT BY BE BA BG HR CY CZ DK EE FO FI FR DE GI GR GG HU IS IE IM IT JE XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SJ SE CH UA GB VA'.split(): return '欧洲'
    return '亚洲'

places=[]
for line in CITIES.splitlines():
    name,iso,lng,lat=line.split('|')
    places.append(dict(name=name,iso=iso,lng=float(lng),lat=float(lat),province=('重庆市' if name=='酉阳' else '湖南省') if iso=='CN' else '',anchor='城市代表点'))
for feature in json.loads((ROOT/'data/china.geo.json').read_text())['features']:
    props=feature['properties']; point=props.get('center')
    if props.get('name') and point:
        places.append(dict(name=props['name'],iso='CN',province=props['name'],lng=point[0],lat=point[1],anchor='行政区代表点'))
airports=collections.defaultdict(list)
for f in json.loads((OUT/'airports-large.geojson').read_text())['features']:
    p=f['properties'];airports[p['country']].append(f)
for turn in range(20):
    for iso,items in sorted(airports.items()):
        if len(places)>=260: break
        if turn>=len(items):continue
        f=items[turn]; p=f['properties']; x,y=f['geometry']['coordinates']
        places.append(dict(name=p.get('municipality') or p['name'],iso=iso,lng=x,lat=y,province='',anchor='OurAirports 机场周边参考点',anchorUrl=p['provenance']['url']))
    if len(places)>=260:break
assert len(places)>=250

raw_file=OUT/'v23-weather-source.json'
def collect(batch):
    params=dict(latitude=','.join(str(p['lat']) for p in batch),longitude=','.join(str(p['lng']) for p in batch),start_date='2026-10-07',end_date=SNAPSHOT,daily='temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',timezone='UTC')
    url='https://archive-api.open-meteo.com/v1/archive?'+urllib.parse.urlencode(params,safe=',')
    cache=ROOT/'test/artifacts/v23/weather-cache'
    cache.mkdir(parents=True,exist_ok=True)
    cache_file=cache/(str(places.index(batch[0]))+'.json')
    if cache_file.exists():return json.loads(cache_file.read_text())
    # macOS TLS/proxy occasionally drops the connection. Checkpoint each successful batch.
    result=json.loads(subprocess.check_output(['curl','--fail','--silent','--show-error','--retry','2','--retry-all-errors','--retry-delay','1','--connect-timeout','10','--max-time','25',url]))
    result=result if isinstance(result,list) else [result]
    assert len(result)==len(batch)
    records=[dict(place=p,response=r,sourceUrl=url) for p,r in zip(batch,result)]
    cache_file.write_text(json.dumps(records,ensure_ascii=False))
    return records
if raw_file.exists():raw=json.loads(raw_file.read_text())
else:
    batches=[places[i:i+10] for i in range(0,len(places),10)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        raw=[r for batch in pool.map(collect,batches) for r in batch]
    raw_file.write_text(json.dumps(raw,ensure_ascii=False,indent=2)+'\n')

names.update(json.loads(subprocess.check_output(['node','-e',"let s='';process.stdin.on('data',x=>s+=x).on('end',()=>{const d=new Intl.DisplayNames(['zh'],{type:'region'});process.stdout.write(JSON.stringify(Object.fromEntries(JSON.parse(s).map(x=>[x,d.of(x)]))));});"],input=json.dumps(list({r['place']['iso'] for r in raw})).encode())))
entities=[]; facts=[]; relations=[]; countries={}
for index, entry in enumerate(raw):
    p=entry['place'];iso=p['iso'];country=names.get(iso,iso);eid=f'e:v23:weather:{index:03}';cid='e:v23:country:'+iso
    rp=[dict(level='global',code='GLOBAL',name='全球'),dict(level='country',code=iso,name=country)]
    if p['province']:rp.append(dict(level='province',code=p['province'],name=p['province']))
    rp.append(dict(level='city',code=eid,name=p['name']))
    countries[iso]=dict(entityId=cid,type='Region',canonicalName=country,status='active',geo=dict(geoPoint=None,regionPath=rp[:2]),attributes={},supportingFactIds=[],provenanceMeta=dict(dataMode='real'))
    ids=[]; daily=entry['response']['daily']
    for day,date in enumerate(daily['time']):
        hi,lo,rain,wind=[daily[k][day] for k in ['temperature_2m_max','temperature_2m_min','precipitation_sum','wind_speed_10m_max']]
        if any(x is None for x in [hi,lo,rain,wind]):continue
        fid=f'v23-weather-{index:03}-{date}';ids.append(fid)
        params=dict(latitude=p['lat'],longitude=p['lng'],start_date=date,end_date=date,daily='temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max',timezone='UTC')
        url='https://archive-api.open-meteo.com/v1/archive?'+urllib.parse.urlencode(params)
        title=f"{country}·{p['name']}农业与运输天气：{lo}–{hi}℃，降水{rain}mm"
        facts.append(dict(factId=fid,factType='observation',status='active',title=title,summary=f'{date} 公开气象再分析：最低/最高气温 {lo}/{hi}℃，降水 {rain}mm，10米最大风速 {wind}km/h。用于农业作业、农产品道路运输及冷链安排参考，不表示当地发生了气象灾害或运输中断。',category='natural',cardType='weather',entityIds=[eid,cid],occurredAt=date+'T12:00:00Z',publishedAt=date+'T12:00:00Z',ingestedAt='2026-10-15T10:00:00Z',sourceUrl=url,sourcePlugin='open-meteo',geo=dict(geoPrecision='approx',scopeLayer='L3' if iso=='CN' else 'L1',regionPath=rp,geoPoint=[p['lng'],p['lat']]),severity=40,credibility=dict(score=.82,band='high'),card=dict(fields=dict(regionName=p['name'],weatherIconCode='rain' if rain>0 else 'clear',temperatureMax=hi,temperatureMin=lo,precipitationMm=rain,windMaxKmh=wind,impactText='田间作业、道路交通及冷链运输天气参考')),evidence=[dict(k='气象再分析',t='Open-Meteo 历史天气',q=f'{date}：{lo}–{hi}℃；降水 {rain}mm；风速 {wind}km/h',url=url)],provenanceMeta=dict(dataMode='real',dataOrigin='public-reanalysis',sourcePlugin='v23-global-coverage',continent=continent(iso),sourceDate=date,geoAnchorPlace=p['name'],geoAnchorPrecision=p['anchor'],sourceUrl=url)))
    entities.append(dict(entityId=eid,type='WeatherArea',canonicalName=p['name']+'农业气象参考点',status='active',geo=dict(geoPoint=[p['lng'],p['lat']],geoPrecision='approx',regionPath=rp),attributes=dict(function='农业与运输天气参考',anchorPlace=p['name'],coordinateMeaning=p['anchor']),commodityTags=[],supportingFactIds=ids,provenanceMeta=dict(dataMode='real',note='公开气象网格参考点，不代表农场或气象站',sourceUrl=entry['sourceUrl'])))
    relations.append(dict(relationId=f'r:v23:weather:{index}:country',relationType='LOCATED_IN',sourceEntityId=eid,targetEntityId=cid,nature='verified',supportingFactIds=ids,validity=dict(validFrom=SNAPSHOT),provenanceMeta=dict(dataMode='real',supportCount=len(ids),note='参考点所属国家/地区')))
entities.extend(countries.values())
bundle=dict(snapshotDate='2026-10-15',weatherThrough=SNAPSHOT,facts=facts,entities=entities,relations=relations)
(OUT/'v23-weather.json').write_text(json.dumps(bundle,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(dict(locations=len(raw),facts=len(facts),entities=len(entities),countries=len(countries),byCountry=dict(collections.Counter(e['place']['iso'] for e in raw))),ensure_ascii=False))
