"""Distinct claims from public Hongxing reports; never jitter the source locations."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'data/pkg2'
G='e:ent-hongxing-group';M='e:v23:hongxing-global';CHERRY='e:cmd:cherry';DUR='e:cmd:durian'
sources={
 'gan26':('2026-06-01','兰州新区政府 / 甘肃日报','https://www.lzxq.gov.cn/system/2026/06/01/031377265.shtml'),
 'gan25':('2025-07-03','甘肃一带一路网 / 甘肃日报','https://ydyl.gansu.gov.cn/gsydyl/gjjl/cxsl/202507/t20250703_28756.html'),
 'fruit':('2026-06-17','商务部商务预报 / 长沙市商务局','https://cif.mofcom.gov.cn/newsite/html/hunan/html/160706/2026/6/17/1781679529058.html'),
 'yulin':('2025-06-25','人民网湖南频道','https://hn.people.com.cn/n2/2025/0625/c356883-41271420.html'),
 'cherry':('2024-12-14','红网 / 徐磊','https://life.rednet.cn/content/646856/58/14541584.html')}
rows=[
 ('gan26','2025年红星市场甘味果品交易量22.8万吨','公开报道中的2025年全年统计，不代表今日成交量。','supply',[G,M]),
 ('gan26','2025年红星市场甘味高原夏菜交易量4.3万吨','年度交易资料，统计期为2025年。','circulation',[G,M]),
 ('gan26','2025年红星市场甘味牛羊肉及其他产品交易量4.5万吨','按原文合并口径保留，未拆造商品分项。','circulation',[G,M]),
 ('gan26','2025年红星市场甘味农产品全年交易额20.6亿元','2025年历史交易额；原文口径为红星农副产品大市场。','circulation',[G,M]),
 ('gan26','2025年红星市场甘味农产品交易额同比增长15%','与2024年相比，采用报道的同口径增幅。','circulation',[G,M]),
 ('gan26','甘味果品红星运营中心对接天水、静宁、庄浪和秦安苹果','报道记录苹果品类产销对接，不推断股权或逐车物流。','supply',[G,M]),
 ('gan26','红星高原夏菜经销商在甘肃永昌县建立蔬菜基地','原文记录经销商基地，不冒称红星集团自有基地。','production',[G,M]),
 ('gan26','红星平台对接兰州榆中娃娃菜、西蓝花和松花菜','保持公开报道的产地与商品信息，不伪造日交易量。','supply',[G,M]),
 ('gan26','红星实业集团与甘味品牌中心推进农产品流通合作','公开产销合作资料；地图沿用红星园区参考点。','circulation',[G,M]),
 ('gan25','2025年7月甘味高原夏菜红星市场运营中心揭牌','2025年7月1日活动，来源于7月3日公开报道。','industry_event',[G,M]),
 ('gan25','2025年7月甘味果品红星市场运营中心揭牌','与高原夏菜平台分别服务果品与蔬菜产销。','industry_event',[G,M]),
 ('gan25','甘味在红星平台经营樱桃、葡萄、人参果等小品类','原文提及樱桃品类，不推定进口国家或当前库存。','circulation',[G,M,CHERRY]),
 ('gan25','红星甘味平台提供展示展销、交易对接和品牌推广服务','公开运营功能资料，保留历史来源日期。','circulation',[G,M]),
 ('fruit','红星2026年第24周重点果品批发价六涨三跌','监测期2026年6月8日至14日；不是实时行情。','price',[M]),
 ('fruit','红星2026年第24周榴莲批发价环比上涨5.94%','同一周重点监测商品口径；原始周报可核对。','price',[M,DUR]),
 ('fruit','红星2026年第24周橘类批发价环比上涨2.68%','保留周报期，不改写为当前价格。','price',[M]),
 ('fruit','红星2026年第24周梨批发价环比上涨1.93%','原始监测周为6月8日至14日。','price',[M]),
 ('fruit','红星2026年第24周苹果批发价环比上涨0.89%','来源为长沙市商务局果品监测周报。','price',[M]),
 ('fruit','红星2026年第24周菠萝蜜批发价环比下降2.59%','原文环比方向和数值保持不变。','price',[M]),
 ('yulin','玉林玉州区、红星市场与湖南产销协会签订战略合作协议','2025年6月25日公开报道，涵盖品牌推广与产销对接。','circulation',[G,M]),
 ('yulin','红星市场参与玉林三黄鸡和米粉长沙产销对接','这是公开活动记录，不是虚构采购订单。','industry_event',[G,M]),
 ('cherry','红星2024年12月12日启动线上运营综合服务平台','红网报道的历史平台启动活动，非今日新发布。','industry_event',[G,M]),
 ('cherry','红星举办2024产季智利海运车厘子首发开柜仪式','活动位于长沙红星农谷，原文发布日期为2024年12月14日。','industry_event',[G,M,CHERRY]),
 ('cherry','红星全球农批中心与抖音电商新零售平台签订合作协议','仅保留报道确认的合作，不推断独家关系。','circulation',[G,M]),
 ('cherry','红星全球农批中心与顺丰速运开展农产品物流合作','公开合作协议资料，不改造成具体车辆运输记录。','logistics',[G,M]),
 ('cherry','红星2024年12月12日车厘子开柜直播销量达1万单','历史活动单日订单数；不是车厘子重量或当前销售数据。','circulation',[M,CHERRY])]
facts=[]
for i,(key,title,summary,cat,ids) in enumerate(rows):
 date,publisher,url=sources[key]
 facts.append(dict(factId=f'v27-hongxing-{i:02d}',factType='profile',status='active',title=title,summary=summary+' 地图沿用红星全球农批中心参考点；同地点资料合并成点。',category=cat,cardType='news',entityIds=ids,occurredAt=date+'T00:00:00Z',publishedAt=date+'T00:00:00Z',ingestedAt='2026-10-16T03:00:00Z',geo=dict(geoPoint=[113.071332,28.0992042],geoPrecision='approx',scopeLayer='L3',regionPath=[dict(level='country',code='CHN',name='中国'),dict(level='province',name='湖南省'),dict(level='city',name='长沙市'),dict(level='county',name='雨花区')]),severity=45,credibility=dict(band='high',score=.88),sourceUrl=url,sourcePlugin=publisher,card=dict(fields=dict(sourceName=publisher,publishedAt=date)),evidence=[dict(k='公开报道',t=publisher,q=summary,url=url)],provenanceMeta=dict(dataMode='real',dataOrigin='public-hongxing-report',sourceDate=date,sourceUrl=url,archiveRecord=True,coordinateMeaning='沿用同一红星园区参考点，不是新增地物')))
(OUT/'v27-hongxing.json').write_text(json.dumps(dict(facts=facts,entities=[],relations=[],sources=sources),ensure_ascii=False,separators=(',',':'))+'\n')
print('New Hongxing facts:',len(facts))
