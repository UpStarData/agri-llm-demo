import {chromium} from 'playwright';
import fs from 'node:fs';import http from 'node:http';import assert from 'node:assert/strict';
const baseline=process.argv.includes('--baseline');
const server=http.createServer((q,s)=>{s.setHeader('Content-Type','text/html');s.end(fs.readFileSync('index.html'));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
const report={views:[],errors:[]};
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.__AGRI_READY);
 await page.evaluate(()=>{V03Feed.complete();V03Fact.finishAnimation();V03Feed.stop();});
 if(!baseline)assert(await page.evaluate(()=>V03Data.FACTS.filter(f=>f.id.startsWith('v25-hongxing')).every(f=>f.objects.every(id=>V03Data.objById(id)?.factIds.includes(f.id)))),'Hongxing fact links must be bidirectional');
 for(const level of ['L1','L2','L3']){
  await page.evaluate(level=>V03Store.set({tab:'fact',sk:{mode3d:false},geo:{level,focus:level==='L3'?'湖南':null}}),level);
  await page.waitForTimeout(150);
  report.views.push(await page.evaluate(level=>{const fs=V03Filter.factsAtLevel(),ids=new Set(fs.map(f=>f.id));return {level,count:fs.length,hongxing:fs.filter(f=>f.id.startsWith('v25-hongxing')).length,grid:fs.filter(f=>f.id.startsWith('v24-weather:')).length,outsideCards:[...document.querySelectorAll('.fcards [data-fid]')].filter(el=>!ids.has(el.dataset.fid)).length};},level));
 }
 if(!baseline){
  await page.selectOption('#factMapBox select[aria-label="市级范围"]','430100');await page.waitForTimeout(120);
  report.city=await page.evaluate(()=>({count:V03Filter.factsAtLevel().length,cards:[...document.querySelectorAll('.fcards [data-fid]')].map(el=>el.dataset.fid)}));
  await page.selectOption('#factMapBox select[aria-label="县区范围"]','430111');await page.waitForTimeout(120);
  report.county=await page.evaluate(()=>({count:V03Filter.factsAtLevel().length,overview:V03Filter.overview().raw,outside:V03Filter.factsAtLevel().filter(f=>!V03Scope.includes(f,V03Store.state.geo)).length}));
  assert(report.views[2].count>report.city.count&&report.city.count>report.county.count);assert.equal(report.county.overview,report.county.count);assert.equal(report.county.outside,0);
  report.relation=[];
  for(const level of ['L1','L2','L3']){
   await page.evaluate(level=>V03Store.set({tab:'relation',rel:{view:'geo',level,focus:level==='L3'?'湖南':null,city:null,county:null}}),level);await page.waitForTimeout(3400);
   const result=await page.evaluate(level=>{const objs=V03Filter.objects(),c=echarts.getInstanceByDom(document.querySelector('#relCanvas')),nodes=c.getOption().series.find(s=>s.id==='relNode').data;return {level,count:objs.length,labels:nodes.filter(n=>/红星/.test(n.name)&&n.label.show).map(n=>n.name),cards:[...document.querySelectorAll('#relBody [data-obj]')].map(el=>V03Data.objById(el.dataset.obj).name),ids:nodes.map(n=>n.id)};},level);
   assert.equal(new Set(result.ids).size,result.ids.length);delete result.ids;
   assert(result.labels.some(n=>n.includes('红星实业')));for(const name of ['榴莲','车厘子','辣椒'])assert(result.cards.includes(name),level+' missing '+name);report.relation.push(result);
  }
  assert(report.relation[0].count>report.relation[1].count&&report.relation[1].count>report.relation[2].count);
  await page.evaluate(()=>V03Store.set({rel:{view:'graph'}}));await page.waitForTimeout(200);
  report.graph=await page.evaluate(()=>{const s=echarts.getInstanceByDom(document.querySelector('#relCanvas')).getOption().series.find(s=>s.id==='relGraph');return {nodes:s.data.length,edges:s.links.length,wrong:s.links.filter(r=>!V03Filter.relations().some(x=>x.id===r.id)).length,topic:s.data.filter(o=>/红星|榴莲|车厘子|辣椒/.test(o.name)).map(o=>o.name)};});
  assert(report.graph.edges>20&&report.graph.wrong===0);assert(report.graph.topic.some(n=>n.includes('红星实业')));
 }
 await page.evaluate(()=>V03Store.set({tab:'relation',rel:{view:'geo',level:'L1',focus:null}}));
 await page.waitForFunction(()=>V03Relation.debug().intro===-1);
 await page.evaluate(()=>{const c=echarts.getInstanceByDom(document.querySelector('#relCanvas'));window.__probe=[];window.__geoRef=c.getViewOfComponentModel(c.getModel().getComponent('geo',0)).group.childAt(0);window.__camera=JSON.stringify(c.getOption().geo[0].center);const data=c.getModel().getSeries().find(s=>s.id==='relNode').getData();window.__nodeRefs=new Map(Array.from({length:data.count()},(_,i)=>[data.getId(i),data.getItemGraphicEl(i)]));const fn=c.setOption.bind(c);c.setOption=(o,p)=>{window.__probe.push({geo:!!o.geo,reset:!!p?.notMerge});return fn(o,p);};});
 await page.evaluate(()=>V03Feed.advanceForTest ? V03Feed.advanceForTest() : V03Data.ingest({facts:[{...V03Data.FACTS.find(f=>f.objects.length),id:'v25-probe',title:'Probe'}]}));
 await page.waitForTimeout(250);report.updates=await page.evaluate(()=>window.__probe);
 report.stability=await page.evaluate(()=>{const c=echarts.getInstanceByDom(document.querySelector('#relCanvas')),data=c.getModel().getSeries().find(s=>s.id==='relNode').getData();let kept=0,total=0;for(let i=0;i<data.count();i++){const old=window.__nodeRefs.get(data.getId(i));if(old){total++;if(old===data.getItemGraphicEl(i))kept++;}}return {sameGeo:window.__geoRef===c.getViewOfComponentModel(c.getModel().getComponent('geo',0)).group.childAt(0),sameCamera:window.__camera===JSON.stringify(c.getOption().geo[0].center),kept,total};});
 if(!baseline){assert(report.stability.sameGeo&&report.stability.sameCamera);assert.equal(report.stability.kept,report.stability.total);await page.screenshot({path:'test/artifacts/v25/relation-world.png'});}
 console.log(JSON.stringify(report,null,2));
 if(!baseline){assert(report.views.every(v=>v.grid===0&&v.outsideCards===0));assert(report.views[0].count>report.views[1].count&&report.views[1].count>report.views[2].count);assert.equal(report.updates.length,0,'An unchanged business graph must not redraw for a new fact');assert.deepEqual(report.errors,[]);}
}finally{fs.mkdirSync('test/artifacts/v25',{recursive:true});fs.writeFileSync('test/artifacts/v25/'+(baseline?'baseline':'regional')+'.json',JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));}
