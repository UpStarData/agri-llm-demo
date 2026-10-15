"""Rebuild the pinned 2026-09-15..21 agricultural weather snapshot.

No forecasts, artificial coordinates, dates or prices. The API's reanalysis
estimates are preserved in raw form; city/crop labels only provide context.
"""
import concurrent.futures
import datetime
import json
from pathlib import Path
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
# City | ISO | country | continent | lon | lat | agricultural context | province
PLACES = """长沙|CHN|中国|亚洲|112.94|28.23|辣椒|湖南省
常德|CHN|中国|亚洲|111.70|29.03|辣椒|湖南省
衡阳|CHN|中国|亚洲|112.57|26.89|农业|湖南省
永州|CHN|中国|亚洲|111.61|26.42|辣椒|湖南省
岳阳|CHN|中国|亚洲|113.13|29.36|农业|湖南省
郴州|CHN|中国|亚洲|113.02|25.77|农业|湖南省
遵义|CHN|中国|亚洲|106.93|27.73|辣椒|贵州省
贵阳|CHN|中国|亚洲|106.71|26.58|辣椒|贵州省
成都|CHN|中国|亚洲|104.07|30.67|辣椒|四川省
昆明|CHN|中国|亚洲|102.71|25.04|农业|云南省
丘北|CHN|中国|亚洲|104.19|24.05|辣椒|云南省
石柱|CHN|中国|亚洲|108.11|30.00|辣椒|重庆市
青岛|CHN|中国|亚洲|120.38|36.07|樱桃|山东省
烟台|CHN|中国|亚洲|121.45|37.46|樱桃|山东省
大连|CHN|中国|亚洲|121.61|38.91|樱桃|辽宁省
西安|CHN|中国|亚洲|108.94|34.34|樱桃|陕西省
寿光|CHN|中国|亚洲|118.74|36.88|蔬菜|山东省
郑州|CHN|中国|亚洲|113.62|34.75|农业|河南省
武汉|CHN|中国|亚洲|114.31|30.59|农业|湖北省
南昌|CHN|中国|亚洲|115.86|28.68|农业|江西省
上海|CHN|中国|亚洲|121.47|31.23|车厘子|上海市
广州|CHN|中国|亚洲|113.26|23.13|车厘子|广东省
深圳|CHN|中国|亚洲|114.06|22.54|农业|广东省
南宁|CHN|中国|亚洲|108.37|22.82|农业|广西壮族自治区
海口|CHN|中国|亚洲|110.33|20.03|辣椒|海南省
乌鲁木齐|CHN|中国|亚洲|87.62|43.83|辣椒|新疆维吾尔自治区
哈尔滨|CHN|中国|亚洲|126.64|45.76|农业|黑龙江省
天津|CHN|中国|亚洲|117.20|39.08|车厘子|天津市
曼谷|THA|泰国|亚洲|100.50|13.75|农业|
尖竹汶|THA|泰国|亚洲|102.10|12.61|水果|
河内|VNM|越南|亚洲|105.83|21.03|农业|
胡志明市|VNM|越南|亚洲|106.70|10.78|农业|
吉隆坡|MYS|马来西亚|亚洲|101.69|3.14|水果|
劳勿|MYS|马来西亚|亚洲|101.86|3.79|榴莲|
新加坡|SGP|新加坡|亚洲|103.82|1.35|农业|
雅加达|IDN|印度尼西亚|亚洲|106.85|-6.21|农业|
孟买|IND|印度|亚洲|72.88|19.08|农业|
贡土尔|IND|印度|亚洲|80.44|16.31|辣椒|
伊兹密尔|TUR|土耳其|亚洲|27.14|38.42|樱桃|
伊斯帕尔塔|TUR|土耳其|亚洲|30.55|37.76|樱桃|
首尔|KOR|韩国|亚洲|126.98|37.57|农业|
东京|JPN|日本|亚洲|139.69|35.68|农业|
华盛顿韦纳奇|USA|美国|北美洲|-120.31|47.42|樱桃|
雅基马|USA|美国|北美洲|-120.51|46.60|樱桃|
斯托克顿|USA|美国|北美洲|-121.29|37.96|樱桃|
洛杉矶|USA|美国|北美洲|-118.24|34.05|农业|
温哥华|CAN|加拿大|北美洲|-123.12|49.28|樱桃|
基洛纳|CAN|加拿大|北美洲|-119.50|49.89|樱桃|
瓜达拉哈拉|MEX|墨西哥|北美洲|-103.35|20.67|辣椒|
库利亚坎|MEX|墨西哥|北美洲|-107.39|24.81|辣椒|
韦拉克鲁斯|MEX|墨西哥|北美洲|-96.14|19.17|农业|
圣何塞|CRI|哥斯达黎加|北美洲|-84.09|9.93|农业|
库里科|CHL|智利|南美洲|-71.23|-34.98|车厘子|
塔尔卡|CHL|智利|南美洲|-71.67|-35.43|车厘子|
兰卡瓜|CHL|智利|南美洲|-70.74|-34.17|车厘子|
奇廉|CHL|智利|南美洲|-72.10|-36.61|车厘子|
圣安东尼奥港|CHL|智利|南美洲|-71.62|-33.59|车厘子|
瓦尔帕莱索|CHL|智利|南美洲|-71.63|-33.05|车厘子|
内乌肯|ARG|阿根廷|南美洲|-68.06|-38.95|樱桃|
门多萨|ARG|阿根廷|南美洲|-68.84|-32.89|樱桃|
利马|PER|秘鲁|南美洲|-77.04|-12.05|农业|
圣保罗|BRA|巴西|南美洲|-46.63|-23.55|农业|
桑托斯|BRA|巴西|南美洲|-46.33|-23.96|农业|
瓜亚基尔|ECU|厄瓜多尔|南美洲|-79.89|-2.17|农业|
阿尔梅里亚|ESP|西班牙|欧洲|-2.46|36.84|辣椒|
赫尔特|ESP|西班牙|欧洲|-5.75|40.22|樱桃|
维罗纳|ITA|意大利|欧洲|10.99|45.44|樱桃|
波尔多|FRA|法国|欧洲|-0.58|44.84|农业|
汉堡|DEU|德国|欧洲|9.99|53.55|农业|
鹿特丹|NLD|荷兰|欧洲|4.48|51.92|农业|
华沙|POL|波兰|欧洲|21.01|52.23|樱桃|
贝尔格莱德|SRB|塞尔维亚|欧洲|20.46|44.82|樱桃|
塞萨洛尼基|GRC|希腊|欧洲|22.94|40.64|樱桃|
开普敦|ZAF|南非|非洲|18.42|-33.92|水果|
德班|ZAF|南非|非洲|31.02|-29.86|农业|
内罗毕|KEN|肯尼亚|非洲|36.82|-1.29|农业|
蒙巴萨|KEN|肯尼亚|非洲|39.67|-4.04|农业|
开罗|EGY|埃及|非洲|31.24|30.04|农业|
卡萨布兰卡|MAR|摩洛哥|非洲|-7.59|33.57|农业|
拉各斯|NGA|尼日利亚|非洲|3.38|6.52|农业|
阿克拉|GHA|加纳|非洲|-0.19|5.56|农业|
霍巴特|AUS|澳大利亚|大洋洲|147.33|-42.88|樱桃|
奥兰治|AUS|澳大利亚|大洋洲|149.10|-33.28|樱桃|
墨尔本|AUS|澳大利亚|大洋洲|144.96|-37.81|农业|
克伦威尔|NZL|新西兰|大洋洲|169.20|-45.04|车厘子|
布伦海姆|NZL|新西兰|大洋洲|173.95|-41.51|樱桃|
奥克兰|NZL|新西兰|大洋洲|174.76|-36.85|农业|"""
places = [line.split('|') for line in PLACES.splitlines()]
target = ROOT / 'data/pkg2'
raw_file = target / 'global-weather-source.json'

def collect(batch):
    params = dict(latitude=','.join(p[5] for p in batch), longitude=','.join(p[4] for p in batch),
                  start_date='2026-09-15', end_date='2026-09-21',
                  daily='temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max', timezone='UTC')
    url = 'https://archive-api.open-meteo.com/v1/archive?' + urllib.parse.urlencode(params)
    with urllib.request.urlopen(url, timeout=50) as response:
        result = json.load(response)
    result = result if isinstance(result, list) else [result]
    if len(result) != len(batch):
        raise ValueError('Weather response location count differs')
    return [dict(place=p, response=r, sourceUrl=url) for p, r in zip(batch, result)]

if raw_file.exists():
    raw = json.loads(raw_file.read_text())
else:
    batches = [places[i:i + 18] for i in range(0, len(places), 18)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        raw = [entry for batch in pool.map(collect, batches) for entry in batch]
    raw_file.write_text(json.dumps(raw, ensure_ascii=False, indent=2) + '\n')

facts = []
for index, entry in enumerate(raw):
    city, iso, country, continent, lng, lat, crop, province = entry['place']
    data = entry['response']['daily']
    for day, date in enumerate(data['time']):
        hi, lo, rain, wind = [data[key][day] for key in ('temperature_2m_max', 'temperature_2m_min', 'precipitation_sum', 'wind_speed_10m_max')]
        if any(v is None for v in (hi, lo, rain, wind)):
            continue
        title = f'{city} · {crop}产区与运输天气：{lo}–{hi}℃，降水 {rain}mm'
        summary = f'{date} 气象再分析：日最高温 {hi}℃、最低温 {lo}℃、累计降水 {rain}mm、10米最大风速 {wind}km/h。供{crop}田间作业、道路交通及冷链运输安排参考。'
        point = [float(lng), float(lat)]
        params = dict(latitude=lat, longitude=lng, start_date=date, end_date=date,
                      daily='temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max', timezone='UTC')
        url = 'https://archive-api.open-meteo.com/v1/archive?' + urllib.parse.urlencode(params)
        region_path = [{'level': 'global', 'code': 'GLOBAL', 'name': '全球'}, {'level': 'country', 'code': iso, 'name': country}]
        if province:
            region_path.append({'level': 'province', 'code': 'CN-' + province, 'name': province})
        region_path.append({'level': 'city', 'code': f'weather-{index}', 'name': city})
        facts.append(dict(factId=f'global-agri-wx-{index:03}-{date}', factType='observation', status='active',
                          title=title, summary=summary, category='natural', cardType='weather',
                          entityIds=[], commodityIds=[], industryId='agriculture',
                          occurredAt=date + 'T12:00:00Z', publishedAt=date + 'T12:00:00Z',
                          regionIso=iso, sourceUrl=url, sourcePlugin='open-meteo',
                          geo=dict(geoPrecision='approx', scopeLayer='L3' if iso == 'CHN' else 'L1', regionPath=region_path, geoPoint=point),
                          severity=40, credibility=dict(score=.82, band='high'),
                          card=dict(type='weather', fields=dict(regionName=city, weatherIconCode='rain' if rain > 0 else 'clear',
                                                               temperatureMax=hi, temperatureMin=lo, precipitationMm=rain, windMaxKmh=wind,
                                                               impactText=f'{crop}作业及道路交通、冷链运输天气参考')),
                          evidence=[dict(k='气象再分析', t='Open-Meteo / ERA5、ECMWF IFS', q=f'{date}: {lo}–{hi}℃; {rain}mm; 最大风速 {wind}km/h', url=url)],
                          provenanceMeta=dict(dataMode='real', dataOrigin='public-reanalysis', sourcePlugin='global-agri-enrichment',
                                              continent=continent, collectedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                                              sourceUrl=url, sourceDate=date, geoAnchorPlace=city, geoAnchorPrecision='city',
                                              method='Public weather reanalysis; crop context and transport guidance are editorial labels, not incident claims.')))
(target / 'global-facts.json').write_text(json.dumps(facts, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(dict(locations=len(raw), facts=len(facts), continents=sorted(set(e['place'][3] for e in raw))), ensure_ascii=False))
