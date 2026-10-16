"""Widen the frozen World Bank agriculture series (2026-10-16 feedback round).

Same provenance rules as v27: country-level annual statistics, original year kept,
capital reference coordinate representing the country, never a farm or a trade.
The only change is breadth: more real indicators and a longer real year window.
"""
import collections, json, os, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/pkg2'
CACHE = ROOT / '.probe/v28-wb'
CACHE.mkdir(parents=True, exist_ok=True)
YEAR_FROM, YEAR_TO = int(os.environ.get('V28_WB_FROM', '2015')), 2025

specs = {
    'AG.PRD.CREL.MT': ('谷物产量', '吨', 'supply'),
    'AG.YLD.CREL.KG': ('谷物单产', '公斤/公顷', 'production'),
    'AG.PRD.CROP.XD': ('作物生产指数', '指数（2014—2016=100）', 'production'),
    'AG.PRD.FOOD.XD': ('食品生产指数', '指数（2014—2016=100）', 'supply'),
    'AG.PRD.LVSK.XD': ('畜牧业生产指数', '指数（2014—2016=100）', 'production'),
    'AG.LND.ARBL.HA': ('可耕地面积', '公顷', 'production'),
    'AG.LND.AGRI.K2': ('农业用地面积', '平方公里', 'production'),
    'AG.LND.ARBL.HA.PC': ('人均耕地面积', '公顷/人', 'production'),
    'AG.LND.CREL.HA': ('谷物耕地面积', '公顷', 'production'),
    'AG.LND.IRIG.AG.ZS': ('灌溉用地占农业用地比重', '%', 'production'),
    'AG.CON.FERT.ZS': ('化肥消费强度', '千克/公顷耕地', 'production'),
    'ER.H2O.FWAG.ZS': ('农业用水占淡水抽取比重', '%', 'supply'),
    'NV.AGR.TOTL.ZS': ('农林渔业增加值占GDP比重', '%', 'supply'),
    'TX.VAL.FOOD.ZS.UN': ('食品出口占商品出口比重', '%', 'customs'),
    'TM.VAL.FOOD.ZS.UN': ('食品进口占商品进口比重', '%', 'customs'),
}


def api(url):
    p = CACHE / (__import__('hashlib').sha256(url.encode()).hexdigest()[:20] + '.json')
    if not p.exists():
        r = subprocess.run(['curl', '-fsSL', '--max-time', '60', url], capture_output=True, check=True)
        p.write_bytes(r.stdout)
    return json.loads(p.read_text())


countries = [c for c in json.loads((ROOT / '.probe/v27-worldbank-countries-zh.json').read_text())[1]
             if c['region']['id'] != 'NA' and c['latitude'] and c['longitude']]
print('countries', len(countries), flush=True)
by_id = {c['id']: c for c in countries}
facts, per_indicator = [], {}
for code, (label, unit, cat) in specs.items():
    payload = api(f'https://api.worldbank.org/v2/country/all/indicator/{code}?format=json&per_page=20000&date={YEAR_FROM}:{YEAR_TO}')
    meta, rows = payload[0], payload[1] or []
    n = 0
    for r in rows:
        c = by_id.get(r['countryiso3code'])
        year, value = r['date'], r['value']
        if not c or value is None or not year.isdigit() or not YEAR_FROM <= int(year) <= YEAR_TO:
            continue
        iso = c['id']
        url = f'https://api.worldbank.org/v2/country/{iso}/indicator/{code}?format=json&date={year}'
        display = f'{value:,.2f}'.rstrip('0').rstrip('.')
        meaning = f'{year}年度公开统计；地图采用世界银行提供的{c["capitalCity"] or "国家/地区"}参考坐标代表该国家/地区，不代表农场、作物地块或交易发生地。'
        facts.append(dict(
            factId=f'v28-wb-{iso}-{code}-{year}', factType='profile', status='active',
            title=f'{c["name"]}·{year}年{label} {display}{unit}',
            summary=f'{year}年度公开统计，按国家/地区汇总；地图用世界银行提供的参考坐标代表该国家/地区，不代表农场或交易发生地。', category=cat, cardType='news', entityIds=[],
            occurredAt=year, ingestedAt='2026-10-16T04:30:00Z',
            geo=dict(geoPoint=[round(float(c['longitude']), 4), round(float(c['latitude']), 4)], geoPrecision='region_only',
                     scopeLayer='L1', regionPath=[dict(level='country', code=iso, name=c['name'])]),
            severity=35, credibility=dict(band='high', score=.9),
            metricKey=code, metricValue=value, metricUnit=unit, metricPeriod=year,
            sourceUrl=url, sourcePlugin='世界银行 WDI',
            card=dict(fields=dict(sourceName='世界银行 WDI')),
            evidence=[dict(k=label, t='世界银行 WDI', q=f'{year}年度；{code}；原始数值{value}；单位{unit}', url=url)],
            provenanceMeta=dict(dataMode='real', dataOrigin='public-agricultural-statistics', sourceDate=year,
                                indicator=code, periodPrecision='year', coordinateMeaning='国家/地区参考坐标；非农场、非交易发生地',
                                archiveRecord=True, sourceUpdated=meta.get('lastupdated'))))
        n += 1
    per_indicator[code] = n
    print(code, label, n, flush=True)

counts = collections.Counter(f['geo']['regionPath'][0]['code'] for f in facts)
(OUT / 'v28-global.json').write_text(json.dumps(dict(
    facts=facts, entities=[], relations=[], countries=len(counts), counts=dict(counts),
    indicators=list(specs), years=[YEAR_FROM, YEAR_TO], perIndicator=per_indicator),
    ensure_ascii=False, separators=(',', ':')) + '\n')
print(json.dumps(dict(facts=len(facts), countries=len(counts), RUS=counts['RUS'], CAN=counts['CAN'], years=[YEAR_FROM, YEAR_TO]), ensure_ascii=False))
