"""Traceable Hongxing business network. Preserve original dates and representative-point precision."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'data/pkg2'
media=json.loads((OUT/'v23-media.json').read_text());geo=json.loads((OUT/'v23-project-geocodes.json').read_text())
GROUP='e:ent-hongxing-group';GLOBAL='e:v23:hongxing-global';YOUYANG='e:v23:hongxing-youyang';JINPEN='e:v23:hongxing-jinpen';HUAYUAN='e:v23:hongxing-huayuan';PARTNER='e:v23:youyang-huayu'
sources={
 'signed':'https://www.agri.cn/zx/xxlb/zq/202507/t20250704_8746564.htm',
 'unveiled':'https://youyang.gov.cn/sy_236/yyyw/202602/t20260212_15439651.html',
 'progress':'https://youyang.gov.cn/ysyy/yshd/202608/t20260810_15911759.html',
 'opened':'https://cq.people.com.cn/n2/2026/0924/c367650-41707128.html',
 'jinpen':'https://sy.rednet.cn/content/646842/58/14180519.html',
 'pepper':'https://cs.rednet.cn/m/content/2022/07/26/11561574.html',
 'fruit':'https://hnny.rednet.cn/content/646745/53/12249954.html',
 'supply':'https://hn.people.com.cn/n2/2022/0129/c356884-35119132.html'
}
def image(key,caption=None):
 p=media['articles'].get(sources[key],{})
 return dict(p,caption=caption or '来源原文配图') if p.get('url') else None
def rp(province,city):return [dict(level='global',code='GLOBAL',name='全球'),dict(level='country',code='CHN',name='中国'),dict(level='province',code='CN-HN' if province=='湖南省' else 'CN-CQ',name=province),dict(level='city',code=city,name=city)]
def entity(id,name,type,point,path,note,picture=None):
 return dict(entityId=id,type=type,canonicalName=name,status='active',priority='high',geo=dict(geoPoint=point,geoPrecision='approx' if point else 'none',regionPath=path),attributes=dict(function=note,coordinateMeaning='行政区/邻近站点代表点，非建筑轮廓或项目边界'),commodityTags=[],supportingFactIds=[],image=picture,provenanceMeta=dict(dataMode='real',note=note))
entities=[
 entity(GLOBAL,'红星全球农批中心','Market',[113.071332,28.0992042],rp('湖南省','长沙市'),'红星农副产品交易网络；沿用邻近同名公交站参考点',image('fruit','红星全球农批中心原文配图')),
 entity(YOUYANG,'红星酉阳武陵山农批中心','Market',[108.7634259,28.844414],rp('重庆市','酉阳土家族苗族自治县'),'红星实业集团与酉阳华渝共同建设；定位采用酉阳县行政代表点',image('progress','酉阳项目资料图 · 2026-08-10 报道')),
 entity(JINPEN,'邵阳县金盆村产销合作项目','Base',[111.27,26.99],rp('湖南省','邵阳县'),'金盆村种植基地与长沙红星集团开展产销合作；定位为邵阳县代表点',image('jinpen')),
 entity(HUAYUAN,'花垣县辣椒产销合作基地','Base',[109.48,28.58],rp('湖南省','花垣县'),'报道记录红星在花垣联动乡镇与合作社发展辣椒配送；县级参考点',image('pepper')),
 entity(PARTNER,'酉阳华渝产业集团','Enterprise',None,rp('重庆市','酉阳县'),'酉阳武陵山农批中心共建方')]
for e in entities:
 if e['entityId']==HUAYUAN:e['commodityTags']=['辣椒']
 if e['entityId']==GLOBAL:e['commodityTags']=['榴莲','车厘子','辣椒']
 if e['entityId']==YOUYANG:e['commodityTags']=['水果','蔬菜','农产品']
facts=[];relations=[]
def fact(key,title,summary,date,ids,anchor,category='news'):
 e=next(x for x in entities if x['entityId']==anchor);url=sources[key];fid='v23-hongxing-'+str(len(facts))
 fields=dict(title=title,sourceName={'signed':'中国农业农村信息网','unveiled':'酉阳县人民政府','progress':'酉阳县人民政府','opened':'人民网重庆','jinpen':'红网邵阳','pepper':'红网长沙','fruit':'红网/人民网','supply':'人民网湖南'}[key],publishedAt=date)
 photo=image(key)
 if photo:fields['imageUrl']=photo['url']
 facts.append(dict(factId=fid,factType='profile',status='active',title=title,summary=summary,category=category,cardType='news',entityIds=ids,occurredAt=date+'T12:00:00Z',publishedAt=date+'T12:00:00Z',ingestedAt='2026-10-15T11:00:00Z',geo=dict(e['geo'],scopeLayer='L3'),sourceUrl=url,sourcePlugin='hongxing-public-report',severity=55,credibility=dict(score=.9,band='high'),card=dict(fields=fields),evidence=[dict(k='公开报道',t=fields['sourceName'],q=summary,url=url)],provenanceMeta=dict(dataMode='real',dataOrigin='public-report',sourcePlugin='v23-hongxing-network',sourceDate=date,sourceUrl=url,dateMeaning='原文报道/事件日期；长期项目资料，不冒充今日新闻')))
 for obj in entities:
  if obj['entityId'] in ids:obj['supportingFactIds'].append(fid)
 return fid
def rel(a,b,code,ids,note):relations.append(dict(relationId='r:v23:'+a+'|'+code+'|'+b,relationType=code,sourceEntityId=a,targetEntityId=b,nature='verified',priority='high',supportingFactIds=ids,validity=dict(validFrom='2026-10-15'),provenanceMeta=dict(dataMode='real',supportCount=len(ids),note=note)))
signed=fact('signed','红星集团与酉阳华渝签约共建武陵山农产品流通中心','公开报道确认红星实业集团与酉阳华渝合作建设流通中心，推进区域农产品流通。','2025-07-04',[GROUP,PARTNER,YOUYANG],YOUYANG)
unveiled=fact('unveiled','红星酉阳武陵山农批招商中心揭牌','2026年2月11日招商中心揭牌，项目涵盖贸易、仓储、加工、物流等功能。','2026-02-11',[GROUP,PARTNER,YOUYANG],YOUYANG)
progress=fact('progress','截至2026-08-10：酉阳红星一期建设完成约95%','该日报道一期建设进度约95%、招商签约率超过86%；这是报道当时的进展，不代表实时施工数据。','2026-08-10',[GROUP,PARTNER,YOUYANG],YOUYANG)
opened=fact('opened','红星酉阳武陵山农批中心一期启用','2026年9月报道确认一期启用，项目辐射渝鄂湘黔区域并推进冷链与农产品集散。','2026-09-24',[GROUP,PARTNER,YOUYANG],YOUYANG)
jinpen=fact('jinpen','邵阳县金盆村与长沙红星集团建立产销合作','报道记载金盆村建设蔬菜、水稻、油菜基地，聘请农科专家指导，由长沙红星集团负责销售，并签订长期战略合作协议。','2024-08-14',[GROUP,JINPEN],JINPEN,'circulation')
pepper=fact('pepper','红星联动花垣乡镇合作社发展辣椒配送','2022年报道回顾：2021年红星在花垣联动4个乡镇、19家合作社，发展3000余亩辣椒种植与配送销售。','2022-07-26',[GROUP,HUAYUAN,'e:cmd:chili'],HUAYUAN,'circulation')
fruit=fact('fruit','红星全球农批中心经营泰国榴莲与智利车厘子','2023年春节前市场报道列明泰国榴莲、智利车厘子等进口水果；关系按原文国家和品种建立，不扩展到未经证实的具体产区。','2023-01-19',[GROUP,GLOBAL,'e:rgn:THA','e:rgn:CHL','e:cmd:durian','e:cmd:cherry'],GLOBAL,'circulation')
supply=fact('supply','红星全球农批中心进口水果冷链到货报道','2022年春节前，报道记录红星进口交易区有车厘子、榴莲等水果从国内港口运抵。','2022-01-29',[GLOBAL,'e:cmd:durian','e:cmd:cherry'],GLOBAL,'logistics')
rel(GROUP,YOUYANG,'CO_BUILDS',[signed,unveiled,opened],'双方合作共建，不能解读为红星单独持有全部股权')
rel(PARTNER,YOUYANG,'CO_BUILDS',[signed,opened],'酉阳华渝为共建方')
rel(GROUP,GLOBAL,'OPERATES',[fruit],'红星市场运营网络')
rel(JINPEN,GROUP,'COOPERATES_WITH',[jinpen],'邵阳项目为产销合作，不宣称是红星全资市场')
rel(HUAYUAN,GROUP,'COOPERATES_WITH',[pepper],'辣椒种植与配送销售合作')
rel('e:rgn:THA',GLOBAL,'FLOWS_INTO',[fruit],'泰国榴莲在红星市场经营；国别参考线，非已核实的逐段物流轨迹')
rel('e:rgn:CHL',GLOBAL,'FLOWS_INTO',[fruit],'智利车厘子在红星市场经营；国别参考线')
for commodity,ids in [('e:cmd:durian',[fruit,supply]),('e:cmd:cherry',[fruit,supply]),('e:cmd:chili',[pepper])]:
 rel(GLOBAL if commodity!='e:cmd:chili' else HUAYUAN,commodity,'TRADES_IN',ids,'依据原文列出的经营或合作品种')
bundle=dict(facts=facts,entities=entities,relations=relations)
(OUT/'v23-projects.json').write_text(json.dumps(bundle,ensure_ascii=False,indent=2)+'\n')
media['objects']={GROUP:image('fruit','红星市场资料图'),'e:mkt-hongxing':image('fruit'),'e:cmd:durian':media['topics']['durian'],'e:cmd:cherry':media['topics']['cherry'],'e:cmd:chili':media['topics']['chili']}
media['objects']={k:v for k,v in media['objects'].items() if v}
(OUT/'v23-media.json').write_text(json.dumps(media,ensure_ascii=False,indent=2)+'\n')
print('Hongxing facts',len(facts),'objects',len(entities),'relationships',len(relations))
