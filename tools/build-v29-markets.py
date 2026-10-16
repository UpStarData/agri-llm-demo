"""Freeze real WFP/HDX market price observations (2026-10-16 feedback: foreign per-country density).

Source: WFP Global Food Prices (HDX). Each row is one published market-price
observation: country, market, market coordinates, commodity, unit, currency,
price and observation date. Nothing is interpolated: a fact exists only where a
row exists, and its coordinates are the market's own registered position.

Bounded on purpose — the map must stay usable, so per country we keep the
busiest markets and, per market, the most recent observation of a few commodities.
"""
import csv, hashlib, io, json, os, subprocess, collections
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/pkg2'
CACHE = ROOT / '.probe/v29-mfp'
CACHE.mkdir(parents=True, exist_ok=True)
MARKETS_PER_COUNTRY = int(os.environ.get('V29_MARKETS_PER_COUNTRY', '40'))
COMMODITIES_PER_MARKET = int(os.environ.get('V29_COMMODITIES_PER_MARKET', '3'))

DATASETS = ['global-wfp-food-prices'] + [
    f'wfp-food-prices-for-{x}' for x in (
        'afghanistan algeria angola argentina armenia bangladesh benin burkina-faso cambodia cameroon chad china colombia '
        'djibouti ecuador egypt eswatini ethiopia fiji gambia ghana guatemala guinea haiti honduras india indonesia iraq '
        'japan jordan kazakhstan kenya kyrgyzstan lebanon lesotho liberia libya madagascar malawi mali mauritania mexico '
        'mongolia mozambique myanmar namibia nepal nicaragua niger nigeria pakistan peru philippines rwanda senegal somalia '
        'south-sudan sri-lanka sudan tajikistan thailand togo turkiye uganda ukraine viet-nam yemen zambia zimbabwe').split()]

ISO_ZH = {c['id']: c['name'] for c in json.loads((ROOT / '.probe/v27-worldbank-countries-zh.json').read_text())[1]}
NAME_ISO = {
    'afghanistan': 'AFG', 'algeria': 'DZA', 'angola': 'AGO', 'argentina': 'ARG', 'armenia': 'ARM',
    'bangladesh': 'BGD', 'benin': 'BEN', 'burkina-faso': 'BFA', 'cambodia': 'KHM', 'cameroon': 'CMR',
    'chad': 'TCD', 'china': 'CHN', 'colombia': 'COL', 'djibouti': 'DJI', 'ecuador': 'ECU', 'egypt': 'EGY',
    'eswatini': 'SWZ', 'ethiopia': 'ETH', 'fiji': 'FJI', 'gambia': 'GMB', 'ghana': 'GHA', 'guatemala': 'GTM',
    'guinea': 'GIN', 'haiti': 'HTI', 'honduras': 'HND', 'india': 'IND', 'indonesia': 'IDN', 'iraq': 'IRQ',
    'japan': 'JPN', 'jordan': 'JOR', 'kazakhstan': 'KAZ', 'kenya': 'KEN', 'kyrgyzstan': 'KGZ', 'lebanon': 'LBN',
    'lesotho': 'LSO', 'liberia': 'LBR', 'libya': 'LBY', 'madagascar': 'MDG', 'malawi': 'MWI', 'mali': 'MLI',
    'mauritania': 'MRT', 'mexico': 'MEX', 'mongolia': 'MNG', 'mozambique': 'MOZ', 'myanmar': 'MMR',
    'namibia': 'NAM', 'nepal': 'NPL', 'nicaragua': 'NIC', 'niger': 'NER', 'nigeria': 'NGA', 'pakistan': 'PAK',
    'peru': 'PER', 'philippines': 'PHL', 'rwanda': 'RWA', 'senegal': 'SEN', 'somalia': 'SOM',
    'south-sudan': 'SSD', 'sri-lanka': 'LKA', 'sudan': 'SDN', 'tajikistan': 'TJK', 'thailand': 'THA',
    'togo': 'TGO', 'turkiye': 'TUR', 'uganda': 'UGA', 'ukraine': 'UKR', 'viet-nam': 'VNM', 'yemen': 'YEM',
    'zambia': 'ZMB', 'zimbabwe': 'ZWE',
}

CATEGORY_ZH = {
    'cereals and tubers': '谷物与薯类', 'meat, fish and eggs': '肉禽蛋鱼', 'milk and dairy': '乳制品',
    'vegetables and fruits': '蔬菜与水果', 'oil and fats': '油脂', 'pulses and nuts': '豆类与坚果',
    'miscellaneous food': '其他食品', 'non-food': '非食品', 'fuel': '燃料',
}
COMMODITY_ZH = {
    'Bread': '面包', 'Rice': '大米', 'Rice (imported)': '进口大米', 'Rice (local)': '本地大米', 'Wheat': '小麦',
    'Wheat flour': '面粉', 'Maize': '玉米', 'Maize (white)': '白玉米', 'Maize (yellow)': '黄玉米', 'Sorghum': '高粱',
    'Millet': '小米', 'Cassava': '木薯', 'Cassava flour': '木薯粉', 'Potatoes': '马铃薯', 'Sweet potatoes': '甘薯',
    'Beans': '豆类', 'Beans (dry)': '干豆', 'Groundnuts': '花生', 'Lentils': '扁豆', 'Chickpeas': '鹰嘴豆',
    'Cowpeas': '豇豆', 'Bananas': '香蕉', 'Plantains': '大蕉', 'Tomatoes': '番茄', 'Onions': '洋葱',
    'Carrots': '胡萝卜', 'Cabbage': '卷心菜', 'Okra': '秋葵', 'Eggplants': '茄子', 'Oranges': '橙子',
    'Apples': '苹果', 'Lemon': '柠檬', 'Mangoes': '芒果', 'Papaya': '木瓜', 'Pineapples': '菠萝', 'Avocados': '牛油果',
    'Beef': '牛肉', 'Pork': '猪肉', 'Chicken': '鸡肉', 'Goat meat': '山羊肉', 'Fish': '鱼', 'Fish (dried)': '干鱼',
    'Eggs': '鸡蛋', 'Milk': '牛奶', 'Milk (powdered)': '奶粉', 'Cheese': '奶酪', 'Yoghurt': '酸奶',
    'Oil (vegetable)': '植物油', 'Oil (palm)': '棕榈油', 'Oil (sunflower)': '葵花籽油', 'Sugar': '食糖',
    'Salt': '食盐', 'Tea': '茶叶', 'Coffee': '咖啡', 'Peas': '豌豆', 'Sesame': '芝麻', 'Soybeans': '大豆',
}


def api(url):
    p = CACHE / (hashlib.sha256(url.encode()).hexdigest()[:20] + '.json')
    if not p.exists():
        r = None
        for _ in range(3):
            r = subprocess.run(['curl', '-fsSL', '--max-time', '60', '-A', 'Mozilla/5.0', url], capture_output=True)
            if r.returncode == 0:
                break
        if r is None or r.returncode:
            raise RuntimeError('api fetch failed ' + url)
        p.write_bytes(r.stdout)
    return json.loads(p.read_text())


def fetch(url):
    p = CACHE / (hashlib.sha256(url.encode()).hexdigest()[:20] + '.csv')
    if not p.exists():
        r = subprocess.run(['curl', '-fsSL', '--max-time', '300', '-o', str(p), url], capture_output=True)
        if r.returncode or not p.exists():
            raise RuntimeError('csv fetch failed ' + url)
    return p.read_text(errors='replace')


def zh(name):
    name = (name or '').strip()
    return COMMODITY_ZH.get(name, name)


def iso_of(doc):
    """Per-country WFP files carry no country column; HDX records the country as a group."""
    groups = doc['result'].get('groups') or []
    if groups:
        code = (groups[0].get('name') or '').upper()
        if len(code) == 3:
            return code
    return None


def rows_for(dataset, default_iso=None):
    doc = api(f'https://data.humdata.org/api/3/action/package_show?id={dataset}')
    # The HDX country group is authoritative; the curated name map only fills gaps.
    default_iso = iso_of(doc) or default_iso
    for res in doc['result'].get('resources', []):
        if (res.get('format') or '').upper() == 'CSV' and 'price' in (res.get('name') or '').lower() \
                and 'market' not in (res.get('name') or '').lower():
            try:
                text = fetch(res['url'])
            except Exception as e:
                print('  skip', dataset, e, flush=True)
                continue
            for row in csv.DictReader(io.StringIO(text)):
                if default_iso and not (row.get('countryiso3') or '').strip():
                    row['countryiso3'] = default_iso
                yield row, res['url']


def main():
    # market_id -> latest observation per commodity, and per-country market counts
    best = {}
    markets = collections.defaultdict(set)
    source_of = {}
    for dataset in DATASETS:
        n = 0
        suffix = dataset.replace('wfp-food-prices-for-', '')
        hint = NAME_ISO.get(suffix)
        for row, src in rows_for(dataset, default_iso=hint):
            try:
                lat, lng = float(row.get('latitude') or ''), float(row.get('longitude') or '')
            except ValueError:
                continue
            price = row.get('price')
            try:
                price = float(price)
            except (TypeError, ValueError):
                continue
            if not (-90 <= lat <= 90 and -180 <= lng <= 180) or price <= 0:
                continue
            iso = (row.get('countryiso3') or '').strip().upper()
            market = (row.get('market') or '').strip()
            commodity = (row.get('commodity') or '').strip()
            date = (row.get('date') or '').strip()
            if not (iso and market and commodity and date):
                continue
            key = (iso, row.get('market_id') or market, commodity)
            prev = best.get(key)
            if prev and prev['date'] >= date:
                continue
            best[key] = dict(iso=iso, market=market, marketId=row.get('market_id') or '', lat=lat, lng=lng, date=date,
                             commodity=commodity, unit=(row.get('unit') or '').strip(), currency=(row.get('currency') or '').strip(),
                             price=price, usd=row.get('usdprice'), admin1=(row.get('admin1') or '').strip(),
                             category=(row.get('category') or '').strip(), pricetype=(row.get('pricetype') or '').strip(),
                             source=src, dataset=dataset)
            markets[iso].add((row.get('market_id') or market, lat, lng))
            source_of[iso] = dataset
            n += 1
        print(f'{dataset}: rows scanned {n}', flush=True)

    per_country = collections.defaultdict(list)
    for obs in best.values():
        per_country[obs['iso']].append(obs)

    facts = []
    for iso, obs_list in sorted(per_country.items()):
        by_market = collections.defaultdict(list)
        for o in obs_list:
            by_market[(o['marketId'] or o['market'], o['market'], o['lat'], o['lng'])].append(o)
        ranked = sorted(by_market.items(), key=lambda kv: (-len(kv[1]), kv[1][0]['market']))
        kept = 0
        for (mid, market, lat, lng), group in ranked[:MARKETS_PER_COUNTRY]:
            group = sorted(group, key=lambda o: o['date'], reverse=True)[:COMMODITIES_PER_MARKET]
            for o in group:
                name = zh(o['commodity'])
                cname = CATEGORY_ZH.get(o['category'], o['category'] or '食品')
                price = f'{o["price"]:,.2f}'.rstrip('0').rstrip('.')
                country = ISO_ZH.get(o['iso'], o['iso'])
                title = f'{country} · {market} · {name} {price} {o["currency"]}/{o["unit"]} · {o["date"]}'
                summary = (f'{o["date"]} 在 {market}（{o["admin1"] or country}）公开记录的 {cname} 价格：'
                           f'{price} {o["currency"]}/{o["unit"]}'
                           + (f'（约 {float(o["usd"]):.2f} 美元）' if str(o.get("usd") or "").replace(".", "").isdigit() and o.get("usd") else '')
                           + '。坐标为该市场在市场清单中的登记位置，不代表当日现场成交价或库存。')
                facts.append(dict(
                    factId='v29-mkt-' + hashlib.sha256(json.dumps([iso, mid, o['commodity'], o['date']], ensure_ascii=False).encode()).hexdigest()[:16],
                    factType='profile', status='active', title=title, summary=summary,
                    category='price', cardType='news', entityIds=[], occurredAt=o['date'], publishedAt=o['date'] + 'T12:00:00Z' if len(o['date']) == 10 else o['date'],
                    ingestedAt='2026-10-16T06:10:00Z',
                    geo=dict(geoPoint=[round(lng, 4), round(lat, 4)], geoPrecision='market_point', scopeLayer='L1',
                             regionPath=[dict(level='country', code=iso, name=ISO_ZH.get(iso, iso))]),
                    severity=30, credibility=dict(band='high', score=.85),
                    metricKey='WFP:' + o['commodity'], metricValue=o['price'], metricUnit=o['currency'] + '/' + o['unit'], metricPeriod=o['date'],
                    sourceUrl=o['source'], sourcePlugin='世界粮食计划署 WFP（HDX 公开数据）',
                    card=dict(fields=dict(sourceName='WFP 食品价格', publishedAt=o['date'])),
                    evidence=[dict(k='市场与价格', t='WFP 食品价格（HDX）', q=f'{o["date"]}；{market}；{o["commodity"]}；{price} {o["currency"]}/{o["unit"]}；{o["pricetype"]}', url=o['source'])],
                    provenanceMeta=dict(dataMode='real', dataOrigin='public-market-price-observation', sourceDate=o['date'],
                                        marketId=mid, commodity=o['commodity'], priceType=o['pricetype'],
                                        coordinateMeaning='市场清单登记坐标；不代表当日现场交易地点',
                                        dateMeaning='公开登记的价格观测日期；不是实时报价', archiveRecord=True,
                                        dataset=o['dataset'])))
        kept = len([f for f in facts if f['geo']['regionPath'][0]['code'] == iso])
        print(f'{iso}: markets {len(by_market)} -> kept points {kept}', flush=True)

    counts = collections.Counter(f['geo']['regionPath'][0]['code'] for f in facts)
    (OUT / 'v29-markets.json').write_text(json.dumps(dict(
        facts=facts, entities=[], relations=[], counts=dict(counts), datasets=DATASETS,
        marketsPerCountry=MARKETS_PER_COUNTRY, commoditiesPerMarket=COMMODITIES_PER_MARKET),
        ensure_ascii=False, separators=(',', ':')) + '\n')
    print(json.dumps({'facts': len(facts), 'countries': len(counts), 'counts': dict(sorted(counts.items()))}, ensure_ascii=False))


if __name__ == '__main__':
    main()
