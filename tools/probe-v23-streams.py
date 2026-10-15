"""Validate supplied public HTTPS agricultural/nature HLS sources, including media bytes."""
import concurrent.futures, datetime, json, re, urllib.parse, urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
attachment=ROOT.parent/'attachments/llm291-v23/【附件 8】 港口机场清单、直播源清单.md'
candidates={}
for line in attachment.read_text().splitlines():
    cells=[x.strip().strip('`') for x in line.split('|')]
    if len(cells)<6:continue
    match=re.search(r'https://[^`\s|]+\.m3u8[^`\s|]*',line)
    if match and re.search(r'Agro|Agri|Farm|NatureTime|Stingray Naturescape|WildEarth|Real Wild|Terra Mater|PBS Nature',line,re.I):
        candidates[match[0]]=dict(country=cells[1],name=cells[2],url=match[0])
def read(url,limit=150000):
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Origin':'https://upstardata.github.io','Range':f'bytes=0-{limit-1}'})
    with urllib.request.urlopen(req,timeout=12) as r:return r.read(limit),dict(status=r.status,cors=r.headers.get('Access-Control-Allow-Origin'),contentType=r.headers.get('Content-Type'))
def probe(item):
    try:
        url=item['url'];trace=[]
        for depth in range(4):
            raw,headers=read(url);text=raw.decode('utf-8');trace.append(dict(url=url,**headers))
            if '#EXTM3U' not in text:raise ValueError('not an HLS playlist')
            lines=[x.strip() for x in text.splitlines() if x.strip()]
            if '#EXTINF:' in text:
                segment=next(x for x in lines if not x.startswith('#'));segment=urllib.parse.urljoin(url,segment)
                media,segHeaders=read(segment,4096)
                if not media:raise ValueError('empty media segment')
                if any(t['cors'] not in ['*','https://upstardata.github.io'] for t in trace):raise ValueError('playlist CORS unavailable')
                if segHeaders['cors'] not in ['*','https://upstardata.github.io']:raise ValueError('media CORS unavailable')
                return dict(**item,playable=True,checkedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),trace=trace,segment=dict(url=segment,bytes=len(media),**segHeaders))
            variant=next(x for x in lines if not x.startswith('#'));url=urllib.parse.urljoin(url,variant)
        raise ValueError('too many nested playlists')
    except Exception as e:return dict(**item,playable=False,error=str(e))
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:results=list(pool.map(probe,candidates.values()))
(ROOT/'data/pkg2/v23-stream-validation.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')
print(json.dumps([dict(name=r['name'],playable=r['playable'],error=r.get('error')) for r in results],ensure_ascii=False))
