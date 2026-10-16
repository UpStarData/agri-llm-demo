"""Convert dated report metadata to evidence-backed archive facts, never transactions."""
import collections,hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'data/pkg2'
source=json.loads((OUT/'v28-reports-source.json').read_text())
areas=json.loads((OUT/'v28-areas.json').read_text())['areas']
provs={a['province']:a['center'] for a in areas if a['level']=='province'}
# Collector jobs may name a province in short form (江苏); the fact path uses the
# dataset's full administrative name so geography stays comparable to v26.
_by_short={re.sub(r'(?:壮族自治区|回族自治区|维吾尔自治区|自治区|省|市)$','',p):p for p in provs}
# 全国信息联播的省份标签偶尔带行业后缀（如「吉林畜牧」）；去掉后缀后仍按该省归属。
_by_short.update({k+'畜牧':v for k,v in list(_by_short.items())})
def normalize_prov(n):
    if n in provs:return n
    n=str(n).strip()
    if n in _by_short:return _by_short[n]
    return _by_short.get(re.sub(r'(?:壮族自治区|回族自治区|维吾尔自治区|自治区|省|市|畜牧|农垦|兵团)$','',n),n)
def short(n):return re.sub(r'(?:土家族苗族自治州|朝鲜族自治州|蒙古族自治县|满族自治县|自治县|市|区|县|省)$','',n)
def locate(row):
    prov=row['province'];title=row['title'];local=[a for a in areas if a['province']==prov]
    if prov=='河北省':local=[a for a in local if a.get('city')=='石家庄市' or a['name']=='石家庄市']
    matches=[a for a in local if len(short(a['name']))>=2 and (a['name'] in title or short(a['name']) in title)]
    # Prefer the narrowest explicit administrative name, without moving same-place reports.
    matches.sort(key=lambda a:(a['level']=='county',len(short(a['name']))),reverse=True)
    if matches:return matches[0]
    # No explicit city/county named in the headline: keep the province's own
    # representative point rather than inventing a location.
    return dict(province=prov,name=prov,level='province',center=provs[prov])
def category(title):
    rules=[('customs','进口|出口|通关|海关|关税'),('price','价格|报价|涨价|降价|行情'),('logistics','冷链|物流|运输|货运|仓储|配送|班列'),('supply','产量|亩产|供给|供应|库存|丰收|减产'),('circulation','订单|产销|采购|交易|销售|电商'),('policy','政策|通知|公告|公示|补贴|办法|规定|条例|整治|监管'),('production','种植|养殖|播种|育种|秋收|秋种|收获|春耕|水稻|大豆|玉米|小麦|粮食|秸秆|农业|农机|农田|蔬菜|水果|农产品|畜牧|渔业|畜禽|农作物')]
    return next((cat for cat,pattern in rules if re.search(pattern,title)),'news')
facts=[];seen=set();excluded=[]
for row in source['records']:
    row['province']=normalize_prov(row['province'])
    if row['province'] not in provs:  # unreachable administrative name: keep out of the map
        excluded.append(row);continue
    title=row['title'];key=(row['province'],re.sub(r'\s','',title),row['date'])
    if key in seen:continue
    seen.add(key)
    if row['date']>'2026-10-16' or re.search(r'天气|气象|气温|降雨|暴雨|台风|寒潮|干旱|高温|冰雪|进货目录|到货目录',title):excluded.append(row);continue
    # Exclude purely internal ceremonial/personnel news; keep actual agricultural governance.
    if re.search(r'重阳|趣味|游园|民主生活会|党组理论|主题党日|退休|党纪学习|八项规定|招聘|遴选公务员|干部任免|树立和践行|述职|党风廉政|调查问卷|网络安全宣传',title):excluded.append(row);continue
    if re.search(r'^全国|^习近平|^李强|^韩俊|^国务院|^农业农村部',title) and row['province'] not in title:excluded.append(row);continue
    a=locate(row);prov=row['province'];cat=category(title);date=row['date'];url=row['url'];fid='v28-report-'+hashlib.sha256(url.encode()).hexdigest()[:16]
    path=[dict(level='country',name='中国',code='CHN'),dict(level='province',name=prov,code=prov)]
    if a.get('city'):path.append(dict(level='city',name=a['city']))
    if a['level']=='county':path.append(dict(level='county',name=a['name']))
    note=f'{date}，{row["publisher"]}公开发布的农业资料。地图定位到{a["name"]}行政区代表点，不代表具体农场、企业或交易发生地点。历史报道保留原始发布日期。'
    # One fact per original report; no numerical price/volume is extracted or fabricated.
    facts.append(dict(factId=fid,factType='profile',status='active',title=title,summary=note,category=cat,cardType='news',entityIds=[],occurredAt=date+'T12:00:00Z',publishedAt=date+'T12:00:00Z',ingestedAt='2026-10-16T04:30:00Z',geo=dict(geoPoint=a['center'],geoPrecision='region_only',scopeLayer='L3',regionPath=path),severity=35,credibility=dict(band='high',score=.85),sourceUrl=url,sourcePlugin=row['publisher'],card=dict(fields=dict(sourceName=row['publisher'],publishedAt=date)),evidence=[dict(k='原始发布日期 '+date,t=row['publisher'],q='公开报道索引；点击原文核对内容与适用时间。',url=url)],provenanceMeta=dict(dataMode='real',dataOrigin='public-agricultural-report',sourceDate=date,sourceUrl=url,indexUrl=row['indexUrl'],coordinateMeaning='行政区代表点；不是地物精确坐标',dateMeaning='历史资料原始发布日期；不是实时交易',archiveRecord=True)))
# Reserve actual unpublished-to-this-session reports for the existing ingestion event path.
for prov in set(f['geo']['regionPath'][1]['name'] for f in facts):
    candidates=sorted([f for f in facts if f['geo']['regionPath'][1]['name']==prov],key=lambda f:f['publishedAt'],reverse=True)
    # A geographic spread includes visible Hunan cities as well as the province anchor.
    picked=set()
    for f in candidates:
        pt=tuple(f['geo']['geoPoint'])
        if pt not in picked and len(picked)<12:f['provenanceMeta']['arrivalReserved']=True;picked.add(pt)
counts=collections.Counter(f['geo']['regionPath'][1]['name'] for f in facts)
result=dict(facts=facts,entities=[],relations=[],counts=dict(counts),excluded=len(excluded),uniqueCoordinates=len(set(tuple(f['geo']['geoPoint']) for f in facts)),categories=dict(collections.Counter(f['category'] for f in facts)))
(OUT/'v28-reports.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')
print(json.dumps({k:v for k,v in result.items() if k not in ['facts','entities','relations']},ensure_ascii=False))
