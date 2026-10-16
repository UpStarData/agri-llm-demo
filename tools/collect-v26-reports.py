"""Freeze public agricultural report metadata; never invent prices, dates or coordinates.

Each record is a distinct source URL + original headline + publication date, not
a reconstructed transaction. Full articles are not copied into the product.
"""
import concurrent.futures, hashlib, html, json, re, subprocess
from pathlib import Path
from urllib.parse import urljoin

ROOT=Path(__file__).resolve().parents[1]
CACHE=ROOT/'.probe/v26-collection'; CACHE.mkdir(parents=True,exist_ok=True)
def fetch(url):
    p=CACHE/(hashlib.sha256(url.encode()).hexdigest()+'.txt')
    if p.exists(): return p.read_text()
    r=subprocess.run(['curl','-fsSL','--max-time','18',url],capture_output=True)
    if r.returncode: raise RuntimeError(f'HTTP retrieval failed {r.returncode}: {url}')
    s=r.stdout.decode('utf8','replace');p.write_text(s);return s

jobs=[]
def pages(prov,base,count,ext='html',publisher=None):
    for i in range(count):jobs.append((prov,base+('index' if not i else 'index_'+str(i))+'.'+ext,publisher or prov+'农业农村厅','html'))
pages('湖南省','https://agri.hunan.gov.cn/agri/xxgk/gzdt/sxdt_1/',25)
pages('湖南省','https://agri.hunan.gov.cn/agri/xxgk/gzdt/gzdt_5/',25)
pages('河南省','https://nynct.henan.gov.cn/gzdt/tjdt/',140)
pages('山东省','http://nync.shandong.gov.cn/xwzx/dfdt/',70)
pages('吉林省','https://agri.jl.gov.cn/xw/stdt/',34)
pages('吉林省','https://agri.jl.gov.cn/gk/tzgg/',34)
pages('重庆市','https://nyncw.cq.gov.cn/zwxx_161/qxlb/',34,publisher='重庆市农业农村委员会')
pages('重庆市','https://nyncw.cq.gov.cn/zwxx_161/zwdt/',34,publisher='重庆市农业农村委员会')
for path,key,n in [('gzdt','b1ffe29e',26),('nyyw','200aac84',52)]:
    base='https://nync.ln.gov.cn/nync/index/nyyw/nyxw/'+path+'/'
    for i in range(1,n+1):jobs.append(('辽宁省',base+('index.shtml' if i==1 else key+'-'+str(i)+'.shtml'),'辽宁省农业农村厅','html'))
for i in range(1,48):
    jobs.append(('黑龙江省','https://www.hlj.gov.cn/common/search/bed20a69d50147b498cc5d38aa190f5a?_isAgg=false&_isJson=true&_pageSize=20&_template=index&page='+str(i),'黑龙江省人民政府','hlj'))
hb='https://nyncj.sjz.gov.cn/columns/308bd406-5e94-435b-98d9-476cb2aa5ec3/templates/55a2b45d-eda0-4ba3-9bfa-aca3325972c4/blocks/4b80770d-24d3-4569-928f-6b21dc85f58e?page='
for i in range(1,77):jobs.append(('河北省',hb+str(i)+'&fix=0','石家庄市农业农村局','html'))

def text(s):return re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]+>','',re.sub(r'<script.*?</script>','',s,flags=re.S)))).strip()
def parse(job):
    prov,url,publisher,kind=job;s=fetch(url);out=[]
    if kind=='hlj':
        for r in json.loads(s)['data']['results']:
            out.append(dict(province=prov,title=r['title'],date=r['publishedTimeStr'][:10],url=urljoin(url,r['url']),publisher=publisher,indexUrl=url))
        return out
    # Only dated article links; navigation, pagination, banners and downloads are excluded.
    for m in re.finditer(r'<a\b([^>]*)>(.*?)</a>',s,re.S|re.I):
        attrs,body=m.groups();h=re.search(r'href\s*=\s*[\"\']([^\"\']+)',attrs,re.I)
        if not h:continue
        target=urljoin(url,html.unescape(h[1]));after=s[m.end():m.end()+200]
        if not re.search(r'(?:/20\d{2}/\d{2}-\d{2}/|/20\d{4}/|/20\d{14,}/)',target):continue
        if re.search(r'\.(?:jpg|png|pdf|docx?|xlsx?)',target,re.I):continue
        t=re.search(r'title\s*=\s*[\"\']([^\"\']+)',attrs,re.I)
        title=text(t[1] if t else body);title=re.sub(r'^\d{4}-\d{2}-\d{2}','',title);title=re.sub(r'\[\d{4}-\d{2}-\d{2}\]$','',title).strip(' ·•')
        if len(title)<7 or '...' in title or '…' in title:continue
        date=re.search(r'20\d{2}-\d{2}-\d{2}',body+' '+after)
        if date:date=date[0]
        else:
            d=re.search(r't(20\d{6})_|/(20\d{6})\d{8,}/|/(20\d{2})/(\d{2}-\d{2})/',target)
            if not d:continue
            raw=d[1] or d[2];date=(raw[:4]+'-'+raw[4:6]+'-'+raw[6:8]) if raw else d[3]+'-'+d[4]
        if not re.match(r'^20\d{2}-\d{2}-\d{2}$',date):continue
        out.append(dict(province=prov,title=title,date=date,url=target,publisher=publisher,indexUrl=url))
    return out

if __name__=='__main__':
    rows=[];errors=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        futures={pool.submit(parse,j):j for j in jobs}
        for i,f in enumerate(concurrent.futures.as_completed(futures)):
            try:rows.extend(f.result())
            except Exception as e:errors.append(str(e))
            if i%60==0:print('pages',i+1,'records',len(rows),'errors',len(errors),flush=True)
    unique={r['url']:r for r in rows}
    rows=sorted(unique.values(),key=lambda r:(r['province'],r['date'],r['url']))
    counts={p:sum(r['province']==p for r in rows) for p in sorted(set(r['province'] for r in rows))}
    (ROOT/'data/pkg2/v26-reports-source.json').write_text(json.dumps(dict(capturedAt='2026-10-16',records=rows,counts=counts,errors=errors),ensure_ascii=False,separators=(',',':'))+'\n')
    print(json.dumps(dict(counts=counts,errors=errors[:10]),ensure_ascii=False),flush=True)
