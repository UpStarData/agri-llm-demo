"""Administrative representative points from DataV; no point jitter."""
import concurrent.futures,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];CACHE=ROOT/'.probe/v26-areas';CACHE.mkdir(exist_ok=True)
PROVS={'110000':'北京市','120000':'天津市','130000':'河北省','140000':'山西省','150000':'内蒙古自治区','210000':'辽宁省','220000':'吉林省','230000':'黑龙江省','310000':'上海市','320000':'江苏省','330000':'浙江省','340000':'安徽省','350000':'福建省','360000':'江西省','370000':'山东省','410000':'河南省','420000':'湖北省','430000':'湖南省','440000':'广东省','450000':'广西壮族自治区','460000':'海南省','500000':'重庆市','510000':'四川省','520000':'贵州省','530000':'云南省','540000':'西藏自治区','610000':'陕西省','620000':'甘肃省','630000':'青海省','640000':'宁夏回族自治区','650000':'新疆维吾尔自治区'}
def get(code):
    p=CACHE/(str(code)+'.json')
    if not p.exists():
        r=subprocess.run(['curl','-fsSL','--max-time','20',f'https://geo.datav.aliyun.com/areas_v3/bound/{code}_full.json'],capture_output=True,check=True);p.write_bytes(r.stdout)
    return json.loads(p.read_text())['features']
areas=[dict(province=f['properties']['name'],name=f['properties']['name'],code=str(f['properties']['adcode']),level='province',center=f['properties'].get('centroid') or f['properties']['center']) for f in get('100000') if str(f['properties']['adcode']) in PROVS];tasks=[]
for code,prov in PROVS.items():
    for f in get(code):
        p=f['properties'];areas.append(dict(province=prov,city=p['name'],name=p['name'],code=str(p['adcode']),level='city',center=p.get('centroid') or p['center']))
        if p.get('childrenNum',0):tasks.append((prov,p['name'],str(p['adcode'])))
def children(task):
    prov,city,code=task
    return [dict(province=prov,city=city,name=f['properties']['name'],code=str(f['properties']['adcode']),level='county',center=f['properties'].get('centroid') or f['properties'].get('center')) for f in get(code)]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    for result in pool.map(children,tasks):areas.extend(result)
(ROOT/'data/pkg2/v28-areas.json').write_text(json.dumps(dict(sourceUrl='https://geo.datav.aliyun.com/areas_v3/bound/',areas=areas),ensure_ascii=False,separators=(',',':'))+'\n')
print('areas',len(areas),flush=True)
