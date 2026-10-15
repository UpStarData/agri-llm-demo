"""Collect image URLs and credits only. Never download image bytes."""
import concurrent.futures, html, json, re, urllib.parse, urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
TOPICS={'durian':'Durian fruit','cherry':'Cherries fruit','chili':'Red chili peppers','rice':'Rice field','weather':'Cumulus clouds blue sky','market':'vegetable market stalls photograph -painting -painter -museum -Beuckelaer','airport':'Cargo aircraft','vegetables':'Carrots cucumbers tomatoes vegetables -restaurant -facade -painting','banana':'Banana fruit'}
ARTICLES=[
 'https://youyang.gov.cn/sy_236/yyyw/202602/t20260212_15439651.html',
 'https://youyang.gov.cn/ysyy/yshd/202608/t20260810_15911759.html',
 'https://www.agri.cn/zx/xxlb/zq/202507/t20250704_8746564.htm',
 'https://cq.people.com.cn/n2/2026/0924/c367650-41707128.html',
 'https://hn.people.com.cn/n2/2022/0129/c356884-35119132.html',
 'https://hnny.rednet.cn/content/646745/53/12249954.html',
 'https://cs.rednet.cn/m/content/2022/07/26/11561574.html',
 'https://sy.rednet.cn/content/646842/58/14180519.html',
 'https://news.shaoyangnews.net.cn/c/202510/30/125808764.html'
]
def get(url):
 req=urllib.request.Request(url,headers={'User-Agent':'AgriLink-public-media-research/2.3'})
 with urllib.request.urlopen(req,timeout=18) as response:return response.read()
def plain(s):return html.unescape(re.sub('<[^>]+>','',str(s or '')))
def topic(item):
 key,term=item
 try:
  params=dict(action='query',generator='search',gsrsearch=term+' filetype:bitmap',gsrnamespace=6,gsrlimit=1,prop='imageinfo',iiprop='url|extmetadata',iiurlwidth=900,format='json')
  data=json.loads(get('https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode(params)))
  page=next(iter(data['query']['pages'].values()));info=page['imageinfo'][0];meta=info.get('extmetadata',{})
  url=info.get('thumburl') or info['url'];url=url.split('?')[0]
  return key,dict(url=url,sourceUrl=info['descriptionurl'],credit=plain(meta.get('Artist',{}).get('value','Wikimedia Commons')),license=plain(meta.get('LicenseShortName',{}).get('value','见来源')),caption='品种/主题资料图 · Wikimedia Commons',alt=term)
 except Exception as e:return key,dict(error=str(e))
def article(url):
 try:
  raw=get(url);text=raw.decode('utf-8',errors='replace')
  # Prefer the article's editor body; site logos precede it.
  match=re.search(r'<div[^>]*(?:class=["\'][^"\']*TRS_Editor|id=["\'](?:zoom|content|article-content)["\'])',text)
  body=text[match.start():] if match else text
  tags=[tag for tag in re.findall(r'<img\b[^>]+>',body,re.I) if not re.search(r'bannerImg|height:\s*0px|qr-|logo|footer',tag,re.I)]
  images=[m[1] for tag in tags if (m:=re.search(r'(?:src|data-original)=["\']([^"\']+)["\']',tag))]
  images=[urllib.parse.urljoin(url,html.unescape(x)) for x in images if re.search(r'\.(?:jpe?g|png|webp)(?:\?|$)',x,re.I) and not re.search('logo|icon|banner|code|footer|header|/images/|_back',x,re.I)]
  photo=next((x for x in images if x.startswith('https://')),None)
  return url,dict(url=photo,sourceUrl=url,caption='来源原文配图',credit=urllib.parse.urlsplit(url).netloc) if photo else dict(sourceUrl=url,error='no HTTPS article photograph')
 except Exception as e:return url,dict(sourceUrl=url,error=str(e))
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 topics=dict(pool.map(topic,TOPICS.items()));articles=dict(pool.map(article,ARTICLES))
if not topics.get('market',{}).get('url'):
 source=ARTICLES[5]
 if articles.get(source,{}).get('url'):topics['market']=dict(articles[source],caption='农产品交易市场资料图',credit='人民网/红网')
(ROOT/'data/pkg2/v23-media.json').write_text(json.dumps(dict(topics=topics,articles=articles),ensure_ascii=False,indent=2)+'\n')
print(json.dumps(dict(topics={k:v.get('url',v.get('error')) for k,v in topics.items()},articles={k:v.get('url',v.get('error')) for k,v in articles.items()}),ensure_ascii=False))
