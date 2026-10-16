"""Verified Hongxing profiles and actual administrative boundaries; no jittered points."""
import json, pathlib, urllib.request, concurrent.futures
ROOT=pathlib.Path(__file__).resolve().parents[1]
def write(name,data):
 (ROOT/'data/pkg2'/name).write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
def get(code):
 url=f'https://geo.datav.aliyun.com/areas_v3/bound/{code}_full.json'
 with urllib.request.urlopen(url,timeout=45) as r: return json.load(r)
cities=get(430000)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 counties=list(pool.map(get,[f['properties']['adcode'] for f in cities['features']]))
areas=[]
for city,children in zip(cities['features'],counties):
 for f in [city]+children['features']:
  p=f['properties']; areas.append({'code':str(p['adcode']),'name':p['name'],'city':str(city['properties']['adcode']),'level':'city' if f is city else 'county','center':p.get('centroid') or p.get('center'),'geometry':f['geometry']})
write('v25-hunan-areas.json',{'source':'https://geo.datav.aliyun.com/areas_v3/bound/430000_full.json','capturedAt':'2026-10-16','areas':areas})
HN=[{'level':'country','code':'CHN','name':'中国'},{'level':'province','code':'CN-HN','name':'湖南省'}]
def geo(point,city='长沙市',county='雨花区'):
 return {'geoPoint':point,'geoPrecision':'approx','scopeLayer':'L3','regionPath':HN+[{'level':'city','name':city},{'level':'county','name':county}]}
GROUP='e:ent-hongxing-group'; MARKET='e:v23:hongxing-global'; DUR='e:cmd:durian'; CHERRY='e:cmd:cherry'; CHILI='e:cmd:chili'
# Existing reported locations are reused honestly; no invented point for each report.
LOC={GROUP:geo([113.071332,28.0992042]), MARKET:geo([113.071332,28.0992042]),'e:v23:hongxing-huayuan':geo([109.48,28.58],'湘西土家族苗族自治州','花垣县'),'e:v23:hongxing-jinpen':geo([111.27,26.99],'邵阳市','邵阳县')}
ENT=[
 ('cold','红星冷链（湖南）股份有限公司','LogisticsNode',[113.03068,28.13896],'环保东路一段21号；沿用冷链园区近似锚点','https://www.hnhxld.com/'),
 ('shengye','湖南红星盛业食品股份有限公司','Enterprise',[113.03068,28.13896],'雨花环保科技产业园；园区代表点，不是厂房精确坐标','https://scs.moa.gov.cn/ccll/zcwj/202401/t20240102_6443910.htm'),
 ('supply','湖南省供销集团','Enterprise',[112.98,28.19],'长沙市代表点；战略合作方，不代表红星持股','https://gxhzs.hunan.gov.cn/xxgk/gzdt/c102929/202402/t20240207_32845345.html'),
 ('coop','长沙市红星村供销合作社','Enterprise',[113.071332,28.0992042],'红星片区近似锚点','https://gxhzs.hunan.gov.cn/gxhzs/sytt/202004/t20200401_11868794.html'),
 ('phase2','红星全球农批中心·中部菜篮子','Market',[113.071332,28.0992042],'同园区定位；不拆分虚构散点','https://www.hunan.gov.cn/hnszf/hnyw/sy/hnyw1/202212/t20221218_29163572.html')]
def county_center(code):return next(a['center'] for a in areas if a['code']==code)
ENT += [
 ('chaling','红星盛康茶陵油茶产销项目（县域）','Base',county_center('430224'),'茶陵县代表点，不是工厂或油茶林地块坐标','https://hnrb.voc.com.cn/hnrb_epaper/html/2024-04/11/content_1680114.htm?div=0'),
 ('yanling','炎陵黄桃·红星产销合作项目（县域）','Base',county_center('430225'),'炎陵县代表点，不是具体果园坐标','https://hbj.icswb.com/h/168/20250725/938086.html'),
 ('shengkang','湖南红星盛康油脂股份有限公司','Enterprise',None,'茶陵油茶加工企业；企业暂未精确定位','https://lyj.hunan.gov.cn/lyj/xxgk_71167/gzdt/xlkb/201307/t20130708_2788193.html')]
entities=[]
for key,name,typ,pt,location,url in ENT:
 eid='e:v25:'+key;LOC[eid]=geo(pt)
 if key=='shengkang':LOC[eid]=geo(None,'株洲市','茶陵县');LOC[eid]['geoPrecision']='none'
 if key in ['chaling','yanling']:
  LOC[eid]=geo(pt,'株洲市','茶陵县' if key=='chaling' else '炎陵县');LOC[eid]['geoPrecision']='region_only'
 entities.append({'entityId':eid,'canonicalName':name,'type':typ,'status':'active','priority':'high','geo':LOC[eid],'attributes':{'role':location,'anchorPlace':location},'supportingFactIds':[],'provenanceMeta':{'dataMode':'real','dataOrigin':'public-report','sourceUrl':url,'note':location}})
S={
 'phase':('2022-12-18','湖南省人民政府','https://www.hunan.gov.cn/hnszf/hnyw/sy/hnyw1/202212/t20221218_29163572.html'),
 'cooperate':('2024-02-07','湖南省供销合作总社','https://gxhzs.hunan.gov.cn/xxgk/gzdt/c102929/202402/t20240207_32845345.html'),
 'coop':('2020-04-01','湖南省供销合作总社','https://gxhzs.hunan.gov.cn/gxhzs/sytt/202004/t20200401_11868794.html'),
 'cold':('2026-01-15','湖南省供销合作总社','https://gxhzs.hunan.gov.cn/gxhzs/xxgk/gzdt/c102929/202601/t20260115_33893845.html'),
 'plan':('2023-12-22','农业农村部市场与信息化司','https://scs.moa.gov.cn/ccll/zcwj/202401/t20240102_6443910.htm'),
 'import':('2016-08-04','湖南省商务厅','https://swt.hunan.gov.cn/hnswt/szdt/201611/t20161102_3412575.html'),
 'festival':('2025-05-31','湖南省人民政府','https://www.hunan.gov.cn/hnyw/szdt/202505/t20250531_33688515.html'),
 'cherry':('2021-01-13','红网','https://hn.rednet.cn/content/2021/01/13/8831661.html'),
 'huayuan':('2022-07-26','长沙晚报/红网','https://cs.rednet.cn/m/content/2022/07/26/11561574.html'),
 'holiday':('2024-10-01','湖南省人民政府','https://www.hunan.gov.cn/hnszf/hnyw/zwdt/202410/t20241001_33468586.html'),
 'chaling':('2024-04-11','湖南日报','https://hnrb.voc.com.cn/hnrb_epaper/html/2024-04/11/content_1680114.htm?div=0'),
 'yanling':('2025-07-25','长沙晚报','https://hbj.icswb.com/h/168/20250725/938086.html'),
 'shengkang':('2013-07-08','湖南省林业局','https://lyj.hunan.gov.cn/lyj/xxgk_71167/gzdt/xlkb/201307/t20130708_2788193.html'),
 'jinpen':('2024-08-14','红网','https://sy.rednet.cn/content/646842/58/14180519.html'),
}
rows=[
 ('phase',MARKET,'红星全球农批中心二期于2022年12月17日试运营',[GROUP,'e:v25:phase2'],'公开报道记载二期启动日期；这是历史项目资料，并非今日开业。'),
 ('phase',MARKET,'红星一期水果市场公开年均交易量为450万吨',[MARKET],'2022年报道口径的历史年均交易量，不作为当前实时交易量。'),
 ('phase',MARKET,'红星二期集蔬菜、水产、肉食和粮油干调采购于一体',['e:v25:phase2'],'中部菜篮子定位为全品类一站式采购平台。'),
 ('cooperate',GROUP,'红星实业与湖南省供销集团于2024年2月5日签约',[GROUP,'e:v25:supply'],'战略合作协议涉及农业产业化与农产品流通；不推断股权关系。'),
 ('cooperate',GROUP,'红星与省供销集团合作推进全省冷链体系',[GROUP,'e:v25:supply','e:v25:cold'],'协议明确协同推进冷链建设和五级流通服务网络优化。'),
 ('coop',GROUP,'红星村供销合作社于2020年挂牌',[GROUP,'e:v25:coop'],'省供销总社公开记录挂牌及社企合作座谈。'),
 ('cold','e:v25:cold','红星冷链2026年1月登陆港交所',['e:v25:cold',GROUP],'省供销总社2026年1月15日报道上市信息。'),
 ('cold','e:v25:cold','红星冷链公开资料记载服务逾700家合作伙伴',['e:v25:cold'],'2026年1月公开报道统计，保留来源日期，不作为实时客户数。'),
 ('plan','e:v25:cold','长沙骨干冷链基地建设方案列入红星冷链与红星大市场',['e:v25:cold',MARKET],'公开实施方案以冷链物流、商贸批发和互联网协同建设基地。'),
 ('plan','e:v25:shengye','红星盛业列入长沙国家骨干冷链基地运营单位',['e:v25:shengye','e:v25:cold'],'方案明确主要运营单位；没有将共同参与解释为母子公司持股。'),
 ('import',MARKET,'湖南商务厅记录红星市场榴莲进口消费需求',[MARKET,DUR],'2016年历史报道把榴莲列入长沙受欢迎的进口水果，不能代表今日销量。'),
 ('import',MARKET,'湖南商务厅记录红星市场车厘子销售',[MARKET,CHERRY],'2016年公开市场走访记录车厘子销售与进口水果消费。'),
 ('festival',MARKET,'2025年端午红星市场榴莲等水果降价明显',[MARKET,DUR],'市场营运负责人介绍季节性供应增加，保留2025年节日时间范围。'),
 ('cherry',MARKET,'2021年红星市场4J车厘子历史报价每斤45元',[MARKET,CHERRY],'红网2021年1月12日市场走访价格；历史报价，绝不标成当前价格。'),
 ('huayuan','e:v23:hongxing-huayuan','红星2021年在花垣联动19家种植合作社',[GROUP,'e:v23:hongxing-huayuan',CHILI],'公开报道记载4个乡镇19家合作社的辣椒产销合作。'),
 ('huayuan','e:v23:hongxing-huayuan','花垣红星辣椒合作种植规模逾3000亩',['e:v23:hongxing-huayuan',CHILI],'2021年合作种植历史规模，配送销售不等于红星拥有全部基地。'),
 ('holiday',MARKET,'2024年国庆前红星市场供应越南榴莲',[MARKET,DUR],'省政府2024年10月1日报道红星市场假期水果供应。'),
 ('chaling','e:v25:chaling','红星实业在茶陵投资成立盛康油脂公司',[GROUP,'e:v25:shengkang','e:v25:chaling'],'湖南日报2024年报道红星在茶陵发展油茶加工，地图仅定位到县域。'),
 ('chaling','e:v25:chaling','茶陵红星盛康利用冷库低温储存茶籽',['e:v25:shengkang','e:v25:chaling'],'公开报道记载冷库储存茶籽与全年冷榨茶油业务，不填造实时产量。'),
 ('yanling','e:v25:yanling','炎陵与红星签署黄桃产销战略合作协议',[MARKET,'e:v25:yanling'],'2025年7月长沙红星产销对接活动上签约，合作涉及供应链优化和品牌共建。'),
 ('shengkang','e:v25:chaling','湖南省林业局记录茶陵红星盛康油茶项目',['e:v25:shengkang','e:v25:chaling'],'2013年林业局公开记录茶陵红星盛康公司项目推进；历史项目资料。'),
 ('jinpen','e:v23:hongxing-jinpen','金盆村与红星签订农产品销售长期合作协议',[GROUP,'e:v23:hongxing-jinpen'],'村集体、农科专家和长沙红星集团三方协作，红星负责销售；不推断项目全资归属。'),
]
facts=[];relations=[]
for i,(sk,anchor,title,ids,summary) in enumerate(rows):
 date,publisher,url=S[sk];fid=f'v25-hongxing-{i}';ids=list(dict.fromkeys(ids))
 facts.append({'factId':fid,'factType':'profile','status':'active','title':title,'summary':summary,'category':'news','cardType':'news','entityIds':ids,'occurredAt':date+'T12:00:00Z','publishedAt':date+'T12:00:00Z','ingestedAt':'2026-10-16T02:00:00Z','geo':LOC[anchor],'sourceUrl':url,'sourcePlugin':publisher,'severity':60,'credibility':{'band':'high','score':.9},'card':{'fields':{'sourceName':publisher,'publishedAt':date}},'evidence':[{'k':'公开报道','t':publisher,'q':summary,'url':url}],'provenanceMeta':{'dataMode':'real','dataOrigin':'public-report','sourceDate':date,'sourceUrl':url,'dateMeaning':'历史报道资料；不是当前实时交易','coordinateMeaning':'报道涉及园区或行政区近似锚点，重复地点合并，不为每条报道伪造坐标'}})
 for eid in ids:
  for e in entities:
   if e['entityId']==eid:e['supportingFactIds'].append(fid)
 for target in ids[1:]:
  if target==ids[0]:continue
  typ='STRATEGIC_COOP' if sk=='cooperate' else 'PARTICIPATES_WITH' if sk=='plan' else 'REPORTED_WITH'
  # A co-mentioned commodity is an evidenced market assortment, not an invented trade flow.
  if target in [DUR,CHERRY,CHILI]:typ='HANDLES'
  rid=f'r:v25:{ids[0]}:{typ}:{target}'
  existing=next((r for r in relations if r['relationId']==rid),None)
  if existing:existing['supportingFactIds'].append(fid);continue
  relations.append({'relationId':rid,'relationType':typ,'sourceEntityId':ids[0],'targetEntityId':target,'nature':'verified','priority':'high','supportingFactIds':[fid],'provenanceMeta':{'dataMode':'real','note':'公开资料关联；不推断全资持股、实时交易或未知航线'}})
write('v25-hongxing.json',{'facts':facts,'entities':entities,'relations':relations,'sources':S})
print('Hongxing facts',len(facts),'entities',len(entities),'relations',len(relations),'areas',len(areas))
