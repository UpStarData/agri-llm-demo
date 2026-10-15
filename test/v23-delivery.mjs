import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync('index.html'));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch();
const report={errors:[],notes:[]};
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(()=>{window.__long=[];new PerformanceObserver(l=>l.getEntries().forEach(e=>window.__long.push({at:e.startTime,ms:e.duration}))).observe({type:'longtask',buffered:true});window.__stars=[];new MutationObserver(records=>records.forEach(r=>r.addedNodes.forEach(n=>{if(n.nodeType===1 && n.matches?.('.star-flash'))window.__stars.push({at:performance.now(),tab:window.V03Store?.state.tab,id:n.dataset.fid});}))).observe(document,{subtree:true,childList:true});});
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>window.__AGRI_READY);
 report.initial=await page.evaluate(()=>({feed:V03Feed.status(),total:V03Data.FACTS.length,visible:V03Filter.facts().length}));
 assert(report.initial.total>=3086);assert(report.initial.feed.loaded<report.initial.total/2);
 await page.waitForFunction(()=>V03Feed.status().done,{},{timeout:40000});
 report.loaded=await page.evaluate(()=>({feed:V03Feed.status(),tasks:window.__long,stars:window.__stars}));
 assert(report.loaded.feed.elapsed<=40000);
 assert(report.loaded.feed.loaded>=3371);
 report.coverage=await page.evaluate(()=>{const list=V03Data.FACTS.filter(f=>f.id.startsWith('v23-weather'));return {russia:list.filter(f=>f.region.includes('俄罗斯')).length,canada:list.filter(f=>f.region.includes('加拿大')).length,china:list.filter(f=>f.regionPath.some(p=>p.name==='中国')).length,globalObjects:V03Data.OBJECTS.filter(o=>o.id.startsWith('e:v23:weather')).length};});
 assert(report.coverage.russia>=308);assert(report.coverage.canada>=161);assert(report.coverage.globalObjects===260);
 report.views=[];
 for(const tab of ['fact','relation'])for(const level of ['L1','L2','L3']){
   await page.evaluate(({tab,level})=>V03Store.set({tab,time:'all',geo:{level,focus:level==='L3'?'湖南':null},rel:{view:'geo',level,focus:level==='L3'?'湖南':null,sel:null,kind:null,stack:[]},panels:{stream:false}}),{tab,level});
   const before=await page.evaluate(()=>window.__stars.length);
   await page.waitForFunction(n=>window.__stars.length>n,before,{timeout:19000});
   const view=await page.evaluate(()=>({tab:V03Store.state.tab,level:V03Store.state.geo.level,stars:window.__stars.at(-1),arrivals:V03Feed.status().arrivals.at(-1),note:document.querySelector(V03Store.state.tab==='fact'?'#factSide .fresh-note':'#relSide .fresh-note')?.textContent,noHalo:!document.querySelector('#relCanvas')||!echarts.getInstanceByDom(document.querySelector('#relCanvas'))?.getOption()?.series.some(s=>s.id==='relFresh')}));
   assert(view.noHalo);assert(view.note?.includes(tab==='fact'?'事实':'本体'));report.views.push(view);
 }
 await page.evaluate(()=>V03Store.set({tab:'relation',rel:{view:'geo',level:'L1',focus:null,sel:null,kind:null,stack:[]}}));
 await page.waitForFunction(()=>V03Relation.debug().intro===-1);
 report.lines=await page.evaluate(()=>{const c=echarts.getInstanceByDom(document.querySelector('#relCanvas'));const lines=c.getOption().series.find(s=>s.id==='relLine').data;return {all:lines.length,hidden:lines.filter(l=>l.lineStyle.opacity<.08).length,important:lines.filter(l=>l.lineStyle.opacity>=.08).length};});
 assert(report.lines.hidden>0 && report.lines.important>0);
 // Click the actual moving symbol; use pointerdown and click synchronously to avoid movement between samples.
 report.particle=await page.evaluate(()=>{const c=echarts.getInstanceByDom(document.querySelector('#relCanvas')),rect=c.getDom().getBoundingClientRect();for(const s of c.getModel().getSeries().filter(s=>s.id.startsWith('relFlow-'))){const d=s.getData();for(let i=0;i<d.count();i++){const g=d.getItemGraphicEl(i),h=g?.childAt(1);if(!h||h.ignore||!h.scaleX)continue;const p=h.transformCoordToGlobal(0,0);if(p[0]<30||p[0]>850||p[1]<30||p[1]>600)continue;const heads=c.getModel().getSeries().filter(s=>s.id.startsWith('relFlow-')).flatMap(s=>Array.from({length:s.getData().count()},(_,j)=>s.getData().getItemGraphicEl(j)?.childAt(1))).filter(h=>h&&!h.ignore).map(h=>({h,p:h.transformCoordToGlobal(0,0)}));if(heads.some(other=>other.h!==h&&Math.hypot(other.p[0]-p[0],other.p[1]-p[1])<18))continue;const node=c.getDom();for(const type of ['pointerdown','click'])node.dispatchEvent(new MouseEvent(type,{bubbles:true,clientX:rect.x+p[0],clientY:rect.y+p[1]}));return {id:d.getRawDataItem(i).relationId,selected:V03Store.state.rel.sel,kind:V03Store.state.rel.kind};}}throw Error('No moving symbol');});
 assert.equal(report.particle.selected,report.particle.id);assert.equal(report.particle.kind,'relation');
 const relationPhoto=await page.locator('#drawerStack .media-figure img').first();await relationPhoto.waitFor();
 await page.waitForFunction(()=>{const i=document.querySelector('#drawerStack .media-figure img');return i?.complete;});
 report.photo=await relationPhoto.evaluate(i=>({url:i.currentSrc,loaded:i.naturalWidth>0,caption:i.closest('figure').querySelector('figcaption').textContent}));
 assert(report.photo.loaded,'External detail image must actually load');
 await page.evaluate(()=>V03Store.set({tab:'fact',q:'MRTV',factId:null,rel:{sel:null,kind:null,stack:[]},sk:{live:true}}));
 const stream=await page.evaluate(()=>V03Data.FACTS.find(f=>f.id.startsWith('v23-live')&&f.title.includes('MRTV')));
 assert(stream);await page.evaluate(id=>V03Store.set({factId:id}),stream.id);
 await page.waitForFunction(()=>[...document.querySelectorAll('video')].some(v=>v.videoWidth>0&&v.currentTime>0),{},{timeout:30000});
 report.video=await page.evaluate(()=>({frames:[...document.querySelectorAll('video')].map(v=>({width:v.videoWidth,time:v.currentTime,paused:v.paused})),iframes:document.querySelectorAll('#factRoot iframe,#drawerStack iframe').length,decoders:document.querySelectorAll('video').length}));
 assert.equal(report.video.iframes,0);assert(report.video.decoders<=1);
 assert.deepEqual(report.errors,[]);
 console.log(JSON.stringify(report,null,2));
}finally{fs.mkdirSync('test/artifacts/v23',{recursive:true});fs.writeFileSync('test/artifacts/v23/delivery.json',JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));}
