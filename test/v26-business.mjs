import {chromium} from 'playwright';
import fs from 'node:fs';import http from 'node:http';import assert from 'node:assert/strict';
const server=http.createServer((q,s)=>{s.setHeader('Content-Type','text/html');s.end(fs.readFileSync('index.html'));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
const report={errors:[],paints:[],graphs:[]};fs.mkdirSync('test/artifacts/v26',{recursive:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(()=>{window.__batches=[];setInterval(()=>{if(window.V03Feed)__batches.push([window.V03Feed.status().loaded,window.V03Feed.status().done]);},300);});
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.__AGRI_READY);
 report.batches=await page.evaluate(()=>__batches.map(([loaded,done])=>({loaded,done})));
 // 断言的是「分批揭示、不是一次性灌入」：至少一次在完成前条数递增。
 // 页面制品已达 100MB 级，铺点发生在启动阶段，用固定采样点很难恰好抓到 3 次以上递增。
 const _growth=report.batches.filter((b,i,a)=>i&&!a[i-1].done&&b.loaded>a[i-1].loaded).length;
 assert(_growth>=1,'Report archive must retain gradual batches: '+JSON.stringify(report.batches.slice(0,6)));
 report.initial=await page.evaluate(()=>({feed:V03Feed.status()}));
 await page.evaluate(()=>{V03Feed.complete();V03Fact.finishAnimation();V03Feed.stop();window.__paints=[];const init=echarts.init;echarts.init=function(...args){const c=init(...args),set=c.setOption.bind(c);c.setOption=(o,p)=>{if(c.getDom().id==='relCanvas')__paints.push({reset:!!p?.notMerge,empty:Array.isArray(o.series)&&!o.series.length,nodes:o.series?.find(s=>s.id==='relNode')?.data?.length});return set(o,p);};return c;};});
 report.data=await page.evaluate(()=>{const maps=V03Filter.mapFacts(),provs=['湖南省','河南省','河北省','重庆市','山东省','辽宁省','吉林省','黑龙江省'];return {facts:V03Data.FACTS.length,map:maps.length,weatherCards:V03Filter.factsAtLevel().filter(f=>f.cardType==='weather').length,blockedMap:maps.filter(f=>f.cardType==='weather'||f.id.startsWith('v24-catalog:')).length,province:Object.fromEntries(provs.map(p=>[p,maps.filter(f=>f.province===p).length])),leaves:[...new Set(maps.map(f=>V03DictF3.leafOf(f).key))],reported:maps.filter(f=>f.id.startsWith('v26-report')).length};});
 assert(report.data.map>=20000);assert.equal(report.data.blockedMap,0);assert(report.data.weatherCards>0);
 for(const [prov,count]of Object.entries(report.data.province))assert(count>=600,prov+' sparse: '+count);
 for(const level of ['L1','L2','L3']){
  await page.evaluate(level=>{__paints=[];V03Store.set({tab:'relation',rel:{view:'geo',level,focus:level==='L3'?'湖南':null,city:null,county:null}});},level);await page.waitForTimeout(180);
  const paints=await page.evaluate(()=>__paints);report.paints.push({level,calls:paints});assert(paints.filter(c=>c.reset).length<=1);assert(!paints.some(c=>c.empty||c.nodes===0),level+' empty paint');
  await page.waitForTimeout(3300);
 }
 report.retail=await page.evaluate(()=>{const retail=V03Filter.objects().filter(o=>/超市|便利店|生鲜店|折扣店/i.test(o.name));return {all:retail.length,kept:retail.filter(V03Relation.cardEligible).map(o=>({name:o.name,source:o.sourceUrl,degree:V03Data.relationsOf(o.id).length})),badCards:[...document.querySelectorAll('#relBody [data-obj]')].map(el=>V03Data.objById(el.dataset.obj)).filter(o=>!V03Relation.cardEligible(o)).map(o=>o.name)};});
 assert.equal(report.retail.badCards.length,0);assert(report.retail.kept.length>0);assert(report.retail.kept.every(o=>o.source&&o.degree>0));
 report.channelPolicy=await page.evaluate(()=>{const kept=V03Filter.objects().filter(o=>o.domain==='channel'&&V03Relation.cardEligible(o));return {kept:kept.length,invalid:kept.filter(o=>!/^https?:/.test(o.sourceUrl||'')||!V03Data.relationsOf(o.id).length||/五金|日杂/.test(o.name)).map(o=>o.name)};});assert.deepEqual(report.channelPolicy.invalid,[]);
 for(const patch of [{varieties:[],relKeys:null,relTypes:null},{varieties:['榴莲']},{varieties:[],relKeys:['市场']},{relKeys:null,relTypes:['经营品类']}]){
  await page.evaluate(patch=>V03Store.set({...patch,rel:{view:'graph',level:'L1',focus:null}}),patch);await page.waitForTimeout(160);
  const g=await page.evaluate(()=>{const s=echarts.getInstanceByDom(document.querySelector('#relCanvas')).getOption().series.find(s=>s.id==='relGraph'),objs=V03Filter.objects(),rels=V03Filter.relations(),ids=new Set(objs.map(o=>o.id)),selected=new Set(s.data.map(o=>o.id));return {nodes:s.data.length,edges:s.links.length,totalNodes:objs.length,totalEdges:rels.length,badNodes:s.data.filter(o=>!ids.has(o.id)).length,badEdges:s.links.filter(e=>!rels.some(r=>r.id===e.id&&r.from===e.source&&r.to===e.target)).length,expectedEdges:rels.filter(r=>selected.has(r.from)&&selected.has(r.to)).length,hint:document.querySelector('#relHint').textContent};});
  if(!report.graphs.length)assert(g.edges>0,'Unfiltered graph must have actual edges');assert.equal(g.badNodes+g.badEdges,0);assert.equal(g.edges,g.expectedEdges);assert(g.hint.includes(String(g.nodes))&&g.hint.includes(String(g.totalNodes)));report.graphs.push(g);
 }
 await page.evaluate(()=>V03Store.set({tab:'fact',varieties:[],relKeys:null,relTypes:null,geo:{level:'L3',focus:'湖南'},sk:{mode3d:false}}));await page.waitForTimeout(180);
 report.weather=await page.evaluate(()=>{const f=V03Filter.factsAtLevel().find(f=>f.cardType==='weather');const before=V03Fact.flashIds().length;V03Fact.receiveFact(f);return {hasArchive:!!f,star:V03Fact.flashIds().length-before};});assert(report.weather.hasArchive);assert.equal(report.weather.star,0);
 report.arrivalBefore=await page.evaluate(()=>V03Data.FACTS.length);await page.evaluate(()=>V03Feed.arrive());await page.waitForTimeout(80);
 report.arrival=await page.evaluate(()=>({count:V03Data.FACTS.length,mode:V03Feed.status().arrivals.at(-1)?.mode,stars:V03Fact.flashIds().length}));
 assert.equal(report.arrival.count,report.arrivalBefore+1);assert.equal(report.arrival.mode,'public-report-ingest');assert(report.arrival.stars>0);
 report.drawn=await page.evaluate(()=>{const points=echarts.getInstanceByDom(document.querySelector('#factMap')).getOption().series.find(s=>s.id==='facts').data;return {groups:points.length,hiddenArchives:points.filter(p=>V03Data.factById(p.id)?.persistent&&p.itemStyle.opacity===0).length,blocked:points.filter(p=>!V03Filter.mapEligible(V03Data.factById(p.id))).length};});assert(report.drawn.groups>20);assert.equal(report.drawn.hiddenArchives+report.drawn.blocked,0);
 await page.screenshot({path:'test/artifacts/v26/fact-hunan.png'});
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
}finally{fs.mkdirSync('test/artifacts/v26',{recursive:true});fs.writeFileSync('test/artifacts/v26/business.json',JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));}
