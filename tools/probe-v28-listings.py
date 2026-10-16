"""Probe provincial agriculture-department listing pages (2026-10-16 feedback round).

Goal: find, for every province, a listing page that yields many dated public
agricultural report links, plus its numeric pagination pattern.
"""
import concurrent.futures, hashlib, json, re, subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.probe/v28-listings'
CACHE.mkdir(parents=True, exist_ok=True)

HOSTS = {
    '北京市': 'https://nyncj.beijing.gov.cn', '天津市': 'https://nync.tj.gov.cn',
    '山西省': 'https://nynct.shanxi.gov.cn', '内蒙古自治区': 'https://nynct.nmg.gov.cn',
    '上海市': 'https://nyncw.sh.gov.cn', '江苏省': 'https://nynct.jiangsu.gov.cn',
    '浙江省': 'https://nynct.zj.gov.cn', '安徽省': 'https://nynct.ah.gov.cn',
    '福建省': 'https://nynct.fujian.gov.cn', '江西省': 'https://nync.jiangxi.gov.cn',
    '湖北省': 'https://nynct.hubei.gov.cn', '广东省': 'https://nynct.gd.gov.cn',
    '广西壮族自治区': 'https://nynct.gxzf.gov.cn', '海南省': 'https://agri.hainan.gov.cn',
    '四川省': 'https://nynct.sc.gov.cn', '贵州省': 'https://nynct.guizhou.gov.cn',
    '云南省': 'https://nynct.yn.gov.cn', '西藏自治区': 'https://nynct.xizang.gov.cn',
    '陕西省': 'https://nynct.shaanxi.gov.cn', '甘肃省': 'https://nynct.gansu.gov.cn',
    '青海省': 'https://nynct.qinghai.gov.cn', '宁夏回族自治区': 'https://nynct.nx.gov.cn',
    '新疆维吾尔自治区': 'https://nynct.xinjiang.gov.cn',
}
PATHS = ['/xwzx/zwdt/', '/xwzx/sxdt/', '/xwzx/nyyw/', '/xwzx/gzdt/', '/zwgk/gzdt/',
         '/gzdt/', '/nyyw/', '/xwzx/', '/xwdt/', '/zwxx/gzdt/', '/xxgk/gzdt/', '/']


def fetch(url):
    p = CACHE / (hashlib.sha256(url.encode()).hexdigest() + '.txt')
    if p.exists():
        return p.read_text(errors='replace')
    r = subprocess.run(['curl', '-fsSL', '-k', '--max-time', '14', url], capture_output=True)
    if r.returncode:
        raise RuntimeError('fail ' + str(r.returncode))
    s = r.stdout.decode('utf8', 'replace')
    p.write_text(s)
    return s


LINK = re.compile(r'<a\b([^>]*)>(.*?)</a>', re.S | re.I)


def dated_links(s, url, limit=200):
    from urllib.parse import urljoin
    out = []
    for m in LINK.finditer(s):
        attrs, body = m.groups()
        h = re.search(r'href\s*=\s*["\']([^"\']+)', attrs, re.I)
        if not h:
            continue
        target = urljoin(url, h[1])
        if not re.search(r'(?:/20\d{2}[-/]\d{2}|/20\d{6,}/|/20\d{8,}/|t20\d{6})', target):
            continue
        if re.search(r'\.(?:jpg|png|pdf|docx?|xlsx?|zip|mp4)$', target, re.I):
            continue
        after = s[m.end():m.end() + 160]
        t = re.search(r'title\s*=\s*["\']([^"\']+)', attrs, re.I)
        title = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', t[1] if t else body)).strip()
        if len(title) < 6:
            continue
        date = re.search(r'20\d{2}-\d{2}-\d{2}', body + ' ' + after)
        if not date:
            d = re.search(r'/?(20\d{2})(\d{2})(\d{2})\d*/|t(20\d{6})', target)
            date = (d[1] + '-' + d[2] + '-' + d[3]) if d and d[1] else ((d[4][:4] + '-' + d[4][4:6] + '-' + d[4][6:8]) if d and d[4] else None)
        out.append(dict(title=title, url=target, date=date[0] if hasattr(date, 'group') else date))
        if len(out) >= limit:
            break
    return out


def paginate(base_href, s):
    """Detect the numeric pagination pattern used by the listing page."""
    hits = re.findall(r'href\s*=\s*["\']([^"\']*index_(\d+)\.(s?html?|jhtml))["\']', s, re.I)
    if hits:
        n = max(int(h[1]) for h in hits)
        return {'pattern': 'index_%d.' + hits[0][2], 'seenMax': n}
    if re.search(r'createPageHTML|totalPage|pageCount', s):
        return {'pattern': 'js', 'seenMax': None}
    return None


def probe(item):
    prov, host = item
    best = None
    for path in PATHS:
        for variant in ['index.html', 'index_1.html', '']:
            url = host + path + variant
            try:
                s = fetch(url)
            except Exception:
                continue
            links = dated_links(s, url)
            if len(links) >= 8:
                pg = paginate(url, s)
                cand = dict(province=prov, url=url, count=len(links), pages=pg,
                            sample=[l['title'][:40] for l in links[:3]],
                            withDate=sum(1 for l in links if l['date']))
                if not best or cand['count'] > best['count']:
                    best = cand
                break
    return best


if __name__ == '__main__':
    results = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for r in pool.map(probe, HOSTS.items()):
            if r:
                results[r['province']] = r
                print(r['province'], r['count'], r['withDate'], r['url'], (r['pages'] or {}).get('pattern'), (r['pages'] or {}).get('seenMax'), flush=True)
    missing = [p for p in HOSTS if p not in results]
    print('MISSING:', missing, flush=True)
    (ROOT / 'data/pkg2/v28-listing-probe.json').write_text(json.dumps(results, ensure_ascii=False, indent=1))
