/* Bounded first paint, geographic batches, then real current-weather arrivals. */
window.V03Feed = (() => {
  const D=V03Data,S=V03Store, loaded=new Set(), objects=new Set(), history=[];
  const LOAD_MS=32000;
  const businessQueue=(window.__AGRI_PKG2__?.v24Business?.arrivals || []).slice();
  let started=false,done=false,loadTimer=0,arrivalTimer=0,t0=0,cursor=0,revision=0,seq=0;
  function sampleGeo(list,cap,priority=new Set()) {
    const chosen=[],ids=new Set(),buckets=new Map();
    const add=o=>{if(chosen.length<cap&&!ids.has(o.id)){chosen.push(o);ids.add(o.id);}};
    list.filter(o=>priority.has(o.id)||o.priority==='high').forEach(add);
    list.forEach(o=>{const key=Number.isFinite(o.lng)?[Math.floor((o.lng+180)/25),Math.floor((o.lat+90)/15)].join('|'):'none';if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(o);});
    for(let i=0;chosen.length<cap&&i<list.length;i++){let found=false;for(const bucket of buckets.values())if(bucket[i]){found=true;add(bucket[i]);}if(!found)break;}
    return chosen;
  }
  const plan=sampleGeo(D.FACTS.slice().sort((a,b)=>String(b.ingestedAt||b.date).localeCompare(String(a.ingestedAt||a.date))),D.FACTS.length);
  function expose(list) {list.forEach(f=>{loaded.add(f.id);(f.objects||[]).forEach(id=>objects.add(id));});}
  expose(D.FACTS.filter(f=>f.persistent&&!f.id.startsWith('v24-')));
  expose(sampleGeo(D.FACTS.filter(f=>f.impact==='high'),72));
  while(cursor<plan.length&&loaded.size<600)expose([plan[cursor++]]);
  function status(){return {loaded:loaded.size,total:D.FACTS.length,done,elapsed:started?Math.round(performance.now()-t0):0,revision,arrivals:history.slice()};}
  function changed(){revision++;S.emit('data:revealed',status());const meta=document.getElementById('streamMeta');if(meta)meta.textContent='事实 '+loaded.size.toLocaleString()+' / '+D.FACTS.length.toLocaleString();}
  function complete(){expose(D.FACTS);cursor=plan.length;done=true;clearInterval(loadTimer);changed();}
  function step(){
    const fraction=Math.min(1,(performance.now()-t0)/LOAD_MS), want=Math.ceil(600+(plan.length-600)*fraction);
    while(cursor<plan.length&&loaded.size<want)expose([plan[cursor++]]);
    if(fraction>=1)return complete();changed();
  }
  S.onEvent('data:ingested',batch=>{expose(batch.facts||[]);(batch.objects||[]).forEach(o=>objects.add(o.id));});
  const viewKey=()=>{const s=S.state;return [s.tab,s.tab==='fact'?s.geo.level:s.rel.level,s.tab==='fact'?s.geo.focus:s.rel.focus,s.tab==='fact'?s.sk.mode3d:s.rel.view].join('|');};
  async function arrive(){
    if(document.hidden || !['fact','relation'].includes(S.state.tab))return;
    const layer=S.state.tab==='fact'?window.V03Fact:window.V03Relation;
    if(S.state.tab==='relation') {
      const at=businessQueue.findIndex(batch=>layer.visiblePosition(batch.objects[0]));
      if(at>=0){
        const batch=businessQueue.splice(at,1)[0];
        batch.facts.forEach(f=>f.ingestedAt=new Date().toISOString());
        D.ingest(batch);
        history.push({at:Math.round(performance.now()),view:viewKey(),mode:'public-catalogue-ingest'});
        if(history.length>40)history.shift();
        return;
      }
    }
    const candidates=(layer.arrivalCandidates?.() || []).filter(o=>!o.id.startsWith('live-weather:')&&!o.id.startsWith('e:observation:'));
    if(!candidates.length)return;
    const target=candidates[(seq++)%candidates.length], key=viewKey();
    const url='https://api.open-meteo.com/v1/forecast?'+new URLSearchParams({latitude:target.lat,longitude:target.lng,current:'temperature_2m,precipitation,wind_speed_10m',timezone:'UTC'});
    let accepted=false;
    try {
      const response=await fetch(url,{signal:AbortSignal.timeout(3500)});if(!response.ok)throw Error('weather response '+response.status);
      const payload=await response.json(), w=payload.current;
      if(!w || ![w.temperature_2m,w.precipitation,w.wind_speed_10m].every(Number.isFinite))throw Error('missing current weather');
      if(viewKey()!==key)return;
      const id='live-weather:'+target.lng.toFixed(3)+':'+target.lat.toFixed(3)+':'+w.time;
      if(!D.factById(id)) {
        const businessIds=(target.title?(target.objects||[]):[target.id]).filter(id=>V03Filter.isBusinessObject(D.objById(id)));
        const place=target.city||target.region||target.name||'农业参考点';
        const title=place+' · 新气象记录：'+w.temperature_2m+'℃，降水'+w.precipitation+'mm';
        const fact={id,title,summary:w.time+' UTC 的公开气象模型当前值；用于农业作业、交通和冷链运输参考。',date:w.time.slice(0,10),occurredAt:w.time,persistent:true,ingestedAt:new Date().toISOString(),cat:'natural',cardType:'weather',card:{regionName:place,weatherIconCode:w.precipitation>0?'rain':'clear',temperatureMax:w.temperature_2m,precipitationMm:w.precipitation,impactText:'农业作业与运输天气参考'},level:(target.level==='L3'||target.lng>=73&&target.lng<=136&&target.lat>=17.5&&target.lat<=54.5)?'L3':'L1',region:place,province:target.province||((target.regionPath||[]).find(p=>p.level==='province')||{}).name,lng:target.lng,lat:target.lat,objects:businessIds,cred:'high',credScore:.8,impact:'mid',radius:0,prov:'real',sourceUrl:url,evidence:[{k:'气象当前值',t:'Open-Meteo',q:'气温 '+w.temperature_2m+'℃；降水 '+w.precipitation+'mm；风速 '+w.wind_speed_10m+'km/h',url}],provenanceMeta:{dataMode:'real',dataOrigin:'public-current-weather-model',sourceDate:w.time,sourceUrl:url}};
        D.ingest({facts:[fact]});accepted=true;
      }
    } catch { /* Network loss keeps the pinned snapshot usable; replay is identified as replay. */ }
    if((!accepted || S.state.tab==='relation') && viewKey()===key) {
      const fact=target.title?target:D.FACTS.find(f=>(f.objects||[]).includes(target.id));
      if(fact){S.emit('feed:arrival',{fact,objects:target.title?(fact.objects||[]).map(D.objById).filter(Boolean):[target],mode:'snapshot-replay'});}
    }
    S.emit('feed:log',{text:(accepted?'实时接入':'接入回放')+' · '+(target.title||target.name)+' · '+new Date().toLocaleTimeString('zh-CN')});
    history.push({at:Math.round(performance.now()),view:key,mode:accepted?'live':'snapshot-replay'});if(history.length>40)history.shift();
  }
  function schedule(){if(!started)return;clearTimeout(arrivalTimer);arrivalTimer=setTimeout(async()=>{await arrive();schedule();},7500+Math.random()*4500);}
  function stop(){started=false;clearInterval(loadTimer);clearTimeout(arrivalTimer);}
  function start(){if(started)return;started=true;t0=performance.now();loadTimer=setInterval(step,1000);schedule();changed();}
  return {start,stop,status,complete,sampleGeo,arrive,isFactVisible:id=>loaded.has(id),isObjectVisible:id=>!id.startsWith('e:v23:weather:')&&!id.startsWith('e:v24:')||objects.has(id),get revision(){return revision;}};
})();
