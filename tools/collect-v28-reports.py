"""Freeze nationwide provincial agricultural report metadata (2026-10-16 feedback round).

Same contract as collect-v26-reports.py: each record is a distinct source URL +
original headline + original publication date. Nothing is invented; no price,
volume or coordinate is derived from the headline.

Job definitions come from the verified per-group probe files
(`.probe/v28/jobs-g*.json`, produced by fetching each listing page for real) plus
the eight provinces already frozen in v26. Job shape:

  {province, publisher, indexUrlTemplate, firstPageUrl, startPage,
   paginationKind: 'html'|'json'|'query', maxWorkingPage}
"""
import concurrent.futures, hashlib, html, json, os, re, subprocess, sys
from pathlib import Path
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/pkg2'
CACHE = ROOT / '.probe/v28-collection'
CACHE.mkdir(parents=True, exist_ok=True)
PAGE_CAP = int(os.environ.get('V28_PAGE_CAP', '160'))


UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36'


def fetch(url, post=None, referer=None, jar=None):
    key = hashlib.sha256((url + '|' + (post or '')).encode()).hexdigest()
    p = CACHE / (key + '.txt')
    if p.exists():
        return p.read_text(errors='replace')
    cmd = ['curl', '-fsSL', '-k', '--max-time', '20', '--http1.1', '-A', UA]
    if jar:
        cmd += ['-c', str(jar), '-b', str(jar)]
    if referer:
        cmd += ['-e', referer]
    if post:
        # Several provincial CMSes expose their listing through a POST search/query API.
        # They expect a session cookie from the section landing page plus an XHR marker.
        if jar and not jar.exists() and referer:
            subprocess.run(['curl', '-fsSL', '-k', '--max-time', '20', '--http1.1', '-A', UA, '-c', str(jar), referer], capture_output=True)
        cmd += ['-X', 'POST', '--data', post, '-H', 'Content-Type: application/x-www-form-urlencoded', '-H', 'X-Requested-With: XMLHttpRequest']
    cmd.append(url)
    last = None
    for _ in range(2):
        r = subprocess.run(cmd, capture_output=True)
        if r.returncode == 0:
            break
        last = r.returncode
        import time as _t
        _t.sleep(1.5)
    if r.returncode:
        raise RuntimeError(f'HTTP retrieval failed {r.returncode}: {url}')
    head = r.stdout[:4000].lower()
    s = r.stdout.decode('gb18030', 'replace') if b'gb2312' in head or b'gbk' in head or b'gb18030' in head else r.stdout.decode('utf8', 'replace')
    if s.count('\ufffd') > 20:
        s = r.stdout.decode('gb18030', 'replace')
    p.write_text(s)
    return s


def text(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', re.sub(r'<script.*?</script>', '', s, flags=re.S)))).strip()


LINK = re.compile(r'<a\b([^>]*)>(.*?)</a>', re.S | re.I)
FULL_DATE = re.compile(r'(20\d{2})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})')
MD_DATE = re.compile(r'(?<![\d./-])(\d{1,2})\s*[-/.月]\s*(\d{1,2})(?![\d./-])')
URL_DATE = re.compile(r'/?(20\d{2})(\d{2})(\d{2})\d*/|t(20\d{2})(\d{2})(\d{2})|/?(20\d{2})[-/](\d{2})[-/](\d{2})')
NAV = re.compile(r'^(?:首页|上一页|下一页|尾页|更多|返回|登录|注册|网站地图|联系我们|无障碍|EN|TOP|>>)$|index\.s?html?$', re.I)
SKIP_URL = re.compile(r'\.(?:jpg|jpeg|png|gif|pdf|docx?|xlsx?|zip|rar|mp4|mp3)(?:$|\?)', re.I)
TITLE_EL = re.compile(r'class\s*=\s*["\'][^"\']*(?:title|tit|biaoti|bt)[^"\']*["\'][^>]*>(.*?)</(?:p|div|span|h\d|a|td)>', re.S | re.I)
NOISE_TAIL = re.compile(r'\s*(?:时间|来源|发布|发布日期|访问量|点击|作者)\s*[:：]|\s*20\d{2}[-/.年]\d{1,2}')


def _item_block(s, a_start, a_end):
    """The enclosing list item of an anchor, so a date found nearby really belongs to it.

    Membership is provable: the nearest opening tag must come after the nearest
    closing tag of the same kind. Otherwise a header link would inherit the date of
    whatever list item happens to precede it on the page.
    """
    best = None
    for tag in ('li', 'tr', 'dd'):
        last_open = s.rfind('<' + tag, 0, a_start)
        if last_open < 0 or last_open < s.rfind('</' + tag + '>', 0, a_start):
            continue
        close = re.search('</' + tag + r'\s*>', s[a_end:], re.I)
        if not close:
            continue
        end = a_end + close.end()
        if end - last_open <= 2500 and (best is None or last_open > best[0]):
            best = (last_open, end)
    if best:
        return s[best[0]:best[1]]
    return s[max(0, a_start - 200):a_end + 200]


def _title_of(attrs, body):
    t = re.search(r'title\s*=\s*["\']([^"\']+)', attrs, re.I)
    if t and len(text(t[1])) >= 7:
        return text(t[1])
    m = TITLE_EL.search(body)
    cand = text(m[1]) if m else text(body)
    cand = NOISE_TAIL.split(cand)[0]
    cand = re.sub(r'^(?:进入新闻|查看详情|详情|更多)\s*', '', cand)
    return cand.strip(' ·•[]')


def _date_from_url(target):
    m = URL_DATE.search(target)
    if not m:
        return None
    g = [x for x in m.groups() if x]
    if len(g) == 3:
        return f'{g[0]}-{int(g[1]):02d}-{int(g[2]):02d}'
    if len(g) == 2:
        return f'{g[0]}-{int(g[1]):02d}'
    return None


def parse_html(s, url):
    """Article links with a real date taken from the surrounding list-item markup.

    A link is accepted when the enclosing list item (before *and* after the anchor)
    carries a publication date; many provincial CMSes put the date in a sibling
    <span> rather than in the URL, so a URL-only rule silently drops whole provinces.
    """
    out = []
    for m in LINK.finditer(s):
        attrs, body = m.groups()
        h = re.search(r'href\s*=\s*["\']([^"\']+)', attrs, re.I)
        if not h:
            continue
        raw = html.unescape(h[1]).strip()
        if not raw or raw.startswith(('#', 'javascript:', 'mailto:')):
            continue
        target = urljoin(url, raw)
        if SKIP_URL.search(target) or not re.match(r'https?://', target):
            continue
        t = re.search(r'title\s*=\s*["\']([^"\']+)', attrs, re.I)
        title = re.sub(r'^\[?(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\]?', '', _title_of(attrs, body)).strip()
        title = re.sub(r'[\[【]?\d{4}[-/.]\d{1,2}[-/.]\d{1,2}[\]】]?$', '', title).strip(' ·•[]')
        if len(title) < 7 or title.endswith(('...', '…')) or NAV.match(title):
            continue
        block = _item_block(s, m.start(), m.end())
        window = text(block) or text(s[max(0, m.start() - 200):m.end() + 200])
        fm = FULL_DATE.search(window)
        if fm:
            date = f'{fm.group(1)}-{int(fm.group(2)):02d}-{int(fm.group(3)):02d}'
        else:
            udate = _date_from_url(target)
            if udate and len(udate) == 10:
                date = udate
            elif udate:
                pm = FULL_DATE.search(text(s))
                if not pm:
                    continue
                date = f'{pm.group(1)}-{udate}'
            else:
                # Month-day only in the list item: keep the item so the caller can
                # resolve the real date from the article page itself.
                md = MD_DATE.search(window)
                if not md:
                    continue
                date = f'{int(md.group(1)):02d}-{int(md.group(2)):02d}'
        out.append(dict(title=title, date=date, url=target))
    return out


PUBDATE = re.compile(r'(?:PubDate|pubDate|publishDate|publishdate|Pubdate|docreltime)[^0-9]{0,24}(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})')


def article_date(url):
    """Exact publication date from the article page (listings that show month-day only)."""
    try:
        s = fetch(url)
    except Exception:
        return None
    m = PUBDATE.search(s)
    if not m:
        return None
    y, mo, d = re.split(r'[-/.]', m.group(1))
    return f'{y}-{int(mo):02d}-{int(d):02d}'


DATE_RE = re.compile(r'20\d{2}[-/.]\d{1,2}[-/.]\d{1,2}')


TITLE_KEYS = ('title', 'name', 'subject', 'headline', 'doctitle', 'showtitle', 'doctitle2')
URL_KEYS = ('url', 'link', 'href', 'docurl', 'detailurl', 'chnldocurl', 'docpuburl', '_docpuburl', 'docurl2', 'relationurl')
DATE_KEYS = ('publishedtimestr', 'publishtime', 'publishedtime', 'date', 'pubdate', 'docreltime', 'publishdate', 'releasetime', 'updatetime')


def walk(node, sink):
    """Generic JSON walk: any object carrying title + date + url-ish fields.

    Provincial CMS APIs all expose the same three things under different names, so
    the walk accepts a small synonym set instead of one parser per province. Strings
    that are themselves JSON (some APIs nest their URL map as a string) are opened.
    """
    if isinstance(node, dict):
        vals = {k.lower(): v for k, v in node.items() if isinstance(v, (str, int))}
        for k, v in list(vals.items()):
            if isinstance(v, str) and v[:1] in '{[' and len(v) > 12:
                try:
                    inner = []
                    walk(json.loads(v), inner)
                    for x in inner:
                        sink.append(x)
                    for kk in URL_KEYS:
                        if kk in [i.lower() for i in vals]:
                            pass
                except Exception:
                    pass
        title = next((str(vals[k]) for k in TITLE_KEYS if k in vals and len(str(vals[k])) >= 7), None)
        url = next((str(vals[k]) for k in URL_KEYS if k in vals and re.match(r'^(https?:|/)', str(vals[k]))), None)
        rawdate = next((str(vals[k]) for k in DATE_KEYS if k in vals), '')
        dm = DATE_RE.search(rawdate.replace('年', '-').replace('月', '-').replace('日', ''))
        if title and url and dm:
            d = dm.group(0).replace('/', '-').replace('.', '-')
            y, m, dd = d.split('-')
            sink.append(dict(title=text(title), date=f'{y}-{int(m):02d}-{int(dd):02d}', url=url))
        for v in node.values():
            walk(v, sink)
    elif isinstance(node, list):
        for v in node:
            walk(v, sink)


def load_jobs():
    jobs, index = [], {}
    for f in sorted((ROOT / '.probe/v28').glob('jobs-g*.json')):
        doc = json.loads(f.read_text())
        for p in doc.get('provinces', []):
            key = (p.get('province'), p.get('indexUrlTemplate'))
            if not p.get('indexUrlTemplate'):
                continue
            if key in index:
                # A later probe file may add knowledge about the same listing (e.g. that
                # its dates have to be read from the article page).
                for flag in ('resolveDateFromArticle', 'publisher', 'maxWorkingPage'):
                    if p.get(flag) is not None and index[key].get(flag) is None:
                        index[key][flag] = p[flag]
                continue
            index[key] = p
            jobs.append(p)
    only = os.environ.get('V28_ONLY')
    if only:
        wanted = set(only.split(','))
        jobs = [j for j in jobs if j['province'] in wanted]
    return jobs


def split_job(job):
    """Job templates may embed a POST body: 'URL  (POST body: a=1&page={n})'."""
    tpl = job['indexUrlTemplate']
    post = None
    m = re.search(r'\s*\(POST body:\s*(.+?)\)\s*$', tpl, re.S)
    if m:
        post = m.group(1).strip()
        tpl = tpl[:m.start()].strip()
    first = job.get('firstPageUrl') or tpl
    m2 = re.search(r'\s*\(POST body:\s*(.+?)\)\s*$', first, re.S)
    if m2:
        post = post or m2.group(1).strip()
        first = first[:m2.start()].strip()
    return tpl, first, post


def page_targets(job):
    """(url, postBody) for every candidate listing page, in order."""
    tpl, first, post = split_job(job)
    start = int(job.get('startPage', 1))
    out = []
    for n in range(start, PAGE_CAP + 1):
        url = first if n == start else tpl.replace('{n-1}', str(n - 1)).replace('{n}', str(n))
        body = post.replace('{n-1}', str(n - 1)).replace('{n}', str(n)) if post else None
        out.append((url, body))
    return out


PROVINCES = ['北京', '天津', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江', '上海', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南', '广东', '广西', '海南', '重庆', '四川', '贵州', '云南', '西藏', '陕西', '甘肃', '青海', '宁夏', '新疆']
# 有些列表把标签的方括号在渲染时丢掉，剩「宁夏]标题」；两种形态都要认出来。
BRACKET = re.compile(r'^\s*[\[【]?\s*([\u4e00-\u9fa5]{2,4})\s*[\]】]')


def short_prov(n):
    return re.sub(r'(?:壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市)$', '', str(n))


def tagged_province(title):
    m = BRACKET.match(title)
    return short_prov(m.group(1)) if m else None


def strip_tag(title):
    m = BRACKET.match(title)
    return title[m.end():].strip(' ·•[]') if m else title


def foreign_province(title, province):
    """True when the headline is explicitly tagged as another province (全国信息联播 style)."""
    m = BRACKET.match(title)
    if not m:
        return False
    tag = short_prov(m.group(1))
    return tag in PROVINCES and tag != short_prov(province)


def collect(job):
    prov, publisher = job['province'], job['publisher']
    rows, errors, empty_run, pages_ok = [], [], 0, 0
    tpl, first, post = split_job(job)
    jar = CACHE / ('jar-' + hashlib.sha256(first.encode()).hexdigest()[:12] + '.txt')
    for url, body in page_targets(job):
        if '{n' in url or '{n' in (body or ''):
            continue
        try:
            s = fetch(url, body, referer=first, jar=jar)
        except Exception as e:
            errors.append(str(e))
            empty_run += 1
            if empty_run >= 3:
                break
            continue
        found = []
        stripped = s.lstrip()
        if stripped[:1] in '[{' or stripped[:5].lower().startswith('<?xml'):
            try:
                walk(json.loads(stripped), found)
            except Exception:
                found = []
        if not found:
            found = parse_html(s, url)
        if not found and '\\"' in s:
            # Some CMS APIs return their rendered HTML inside a JSON string.
            found = parse_html(s.replace('\\"', '"').replace('\\/', '/'), url)
        for r in found:
            if not re.match(r'^20\d{2}-\d{2}-\d{2}$', r['date']) and job.get('resolveDateFromArticle') and re.match(r'^\d{2}-\d{2}$', r['date']):
                real = article_date(r['url'])
                if real:
                    r['date'] = real
            if not re.match(r'^20\d{2}-\d{2}-\d{2}$', r['date']):
                continue
            if foreign_province(r['title'], prov):
                continue
            r['title'] = strip_tag(r['title'])
            rows.append(dict(province=prov, publisher=publisher, title=r['title'], date=r['date'], url=r['url'], indexUrl=url))
        if found:
            pages_ok += 1
            empty_run = 0
        else:
            empty_run += 1
        if empty_run >= 3:
            break
    return prov, rows, errors, pages_ok


MOA_BASE = 'https://www.moa.gov.cn/xw/qg/'


def page_targets_moa():
    out = [MOA_BASE + 'index.htm']
    out += [MOA_BASE + f'index_{n}.htm' for n in range(1, 60)]
    return out


def collect_moa():
    """农业农村部「全国信息联播」：单一栏目、逐条带省份标签，为各省补齐真实公开报道。

    标签在标题前（[甘肃]…），因此归属来自栏目自身，不由我们推测。
    """
    rows, errors, empty_run = [], [], 0
    for url in page_targets_moa():
        try:
            s = fetch(url)
        except Exception as e:
            errors.append(str(e))
            empty_run += 1
            if empty_run >= 3:
                break
            continue
        before = len(rows)
        for m in LINK.finditer(s):
            attrs, body = m.groups()
            h = re.search(r'href\s*=\s*["\']([^"\']+)', attrs, re.I)
            if not h:
                continue
            target = urljoin(url, html.unescape(h[1]))
            if not re.search(r't20\d{6}_\d+\.htm', target):
                continue
            raw = text(body)
            tag = BRACKET.match(raw)
            if not tag:
                continue
            prov = short_prov(tag.group(1))
            title = raw[tag.end():].strip(' ·•[]')
            if len(title) < 7:
                continue
            dm = re.search(r't(20\d{2})(\d{2})(\d{2})_', target)
            date = f'{dm.group(1)}-{dm.group(2)}-{dm.group(3)}'
            rows.append(dict(province=prov, publisher='农业农村部 · 全国信息联播', title=title, date=date, url=target, indexUrl=url))
        if len(rows) == before:
            empty_run += 1
        else:
            empty_run = 0
        if empty_run >= 3:
            break
    return rows, errors


if __name__ == '__main__':
    jobs = load_jobs()
    print('jobs', len(jobs), [j['province'] for j in jobs], flush=True)
    rows, errors, meta = [], [], {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(collect, j) for j in jobs]
        for i, f in enumerate(concurrent.futures.as_completed(futures)):
            prov, r, e, pages = f.result()
            rows.extend(r)
            errors.extend(e[:5])
            meta[prov] = dict(rows=len(r), pages=pages)
            print(f'{i+1}/{len(jobs)} {prov} rows={len(r)} pages={pages} errors={len(e)}', flush=True)
    # Keep the eight provinces already frozen in v26 as-is (identical contract).
    try:
        prior = json.loads((OUT / 'v26-reports-source.json').read_text())
        for r in prior['records']:
            rows.append(dict(province=r['province'], publisher=r['publisher'], title=r['title'], date=r['date'], url=r['url'], indexUrl=r['indexUrl']))
            meta.setdefault(r['province'], {'rows': 0, 'pages': 0})['rows'] += 1
    except FileNotFoundError:
        pass
    # 农业农村部全国信息联播：单一栏目、逐条带省份标签，保证每个省都有真实公开报道。
    moa_rows, moa_errors = collect_moa()
    rows.extend(moa_rows)
    errors.extend(moa_errors[:5])
    print('moa rows', len(moa_rows), flush=True)
    unique = {r['url']: r for r in rows}
    rows = sorted(unique.values(), key=lambda r: (r['province'], r['date'], r['url']))
    counts = {p: sum(r['province'] == p for r in rows) for p in sorted(set(r['province'] for r in rows))}
    (OUT / 'v28-reports-source.json').write_text(json.dumps(dict(capturedAt='2026-10-16', records=rows, counts=counts, pageMeta=meta, errors=errors), ensure_ascii=False, separators=(',', ':')) + '\n')
    print(json.dumps(dict(records=len(rows), provinces=len(counts), counts=counts), ensure_ascii=False), flush=True)
