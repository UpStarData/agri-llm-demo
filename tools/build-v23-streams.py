import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; data=ROOT/'data/pkg2'
results=json.loads((data/'v23-stream-validation.json').read_text())
browser=json.loads((data/'v23-browser-media-validation.json').read_text())
verified={r['title'].split(' · ')[0] for r in browser['streams'] if r['played']}
facts=[];entities=[]
names={'IQ':'伊拉克','MM':'缅甸','CA':'加拿大','CR':'哥斯达黎加','RO':'罗马尼亚','ZA':'南非'}
for i,item in enumerate(r for r in results if r['playable'] and r['name'] in verified):
 fid='v23-live-channel-'+str(i);eid='e:v23:live-channel:'+str(i)
 rp=[dict(level='global',code='GLOBAL',name='全球'),dict(level='country',code=item['country'],name=names.get(item['country'],item['country']))]
 title=item['name']+' · 农业/自然公开直播'
 entities.append(dict(entityId=eid,type='MediaChannel',canonicalName=item['name'],status='active',geo=dict(geoPoint=None,regionPath=rp),attributes=dict(function='公开直播频道'),commodityTags=[],supportingFactIds=[fid],provenanceMeta=dict(dataMode='real',sourceUrl=item['url'])))
 facts.append(dict(factId=fid,factType='profile',status='active',title=title,summary='来自附件清单的公开播放源，直接播放媒体。频道节目以当前实际播出为准。',category='news',cardType='video',entityIds=[eid],occurredAt=item['checkedAt'],publishedAt=item['checkedAt'],ingestedAt=item['checkedAt'],sourceUrl=item['url'],geo=dict(geoPoint=None,geoPrecision='none',scopeLayer='L1',regionPath=rp),severity=40,credibility=dict(score=.8,band='high'),card=dict(fields=dict(mediaTitle=item['name'],provider=item['name'],hlsUrl=item['url'],isLive=True,embeddable='yes',lastCheckedAt=item['checkedAt'])),evidence=[dict(k='播放源核验',t='用户提供的公开直播清单',q='已读取 HLS 清单及媒体分片，并通过 Chromium 实际解码出画验证。可用性随源站变化。',url=item['url'])],provenanceMeta=dict(dataMode='real',dataOrigin='user-provided-public-stream',sourcePlugin='v23-direct-hls',checkedAt=item['checkedAt'])))
(data/'v23-streams.json').write_text(json.dumps(dict(facts=facts,entities=entities,relations=[]),ensure_ascii=False,indent=2)+'\n')
print('direct HLS channels',len(facts))
