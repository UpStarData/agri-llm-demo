import {chromium} from 'playwright';import http from 'node:http';import fs from 'node:fs';import assert from 'node:assert/strict';
const server=http.createServer((q,s)=>{s.setHeader('Content-Type','text/html; charset=utf-8');s.end(fs.readFileSync('index.html'));});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();const report={errors:[],views:[]};fs.mkdirSync('test/artifacts/v25',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(()=>{window.__tasks=[];window.__stars=[];new PerformanceObserver(l=>window.__tasks.push(...l.getEntries().map(e=>({at:e.startTime,ms:e.duration})))).observe({type:'longtask',buffered:true});new MutationObserver(records=>records.forEach(r=>r.addedNodes.forEach(n=>{if(n.nodeType===1&&n.matches?.('.star-flash'))window.__stars.push({at:performance.now(),tab:window.V03Store?.state.tab,id:n.dataset.fid});}))).observe(document,{childList:true,subtree:true});});
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.__AGRI_READY);
 report.initial=await page.evaluate(()=>({feed:V03Feed.status(),ready:performance.now(),total:V03Data.FACTS.length}));assert(report.initial.feed.loaded<report.initial.total/4);
 await page.waitForFunction(()=>V03Feed.status().done,{},{timeout:40000});
 report.loaded=await page.evaluate(()=>({feed:V03Feed.status(),tasks:window.__tasks}));assert(report.loaded.feed.elapsed<=40000);
 for(const level of ['L1','L2','L3']){
 await page.evaluate(level=>V03Store.set({tab:'fact',time:'all',geo:{level,focus:level==='L3'?'湖南':null},panels:{stream:false}}),level);await page.waitForTimeout(900);
 const view=await page.evaluate(()=>{const a=V03Filter.mappable(V03Filter.factsAtLevel());const c=echarts.getInstanceByDom(document.querySelector('#factMap'));return {level:V03Store.state.geo.level,records:a.length,unique:new Set(a.map(f=>[f.lng.toFixed(4),f.lat.toFixed(4)].join('|'))).size,drawn:c.getOption().series.find(s=>s.id==='facts').data.length};});
 if(level==='L2')assert(view.unique>1000,JSON.stringify(view));
 if(level==='L3')assert(view.unique>600,JSON.stringify(view));
 report.views.push(view);
 }
 await page.evaluate(()=>V03Store.set({tab:'fact',geo:{level:'L1',focus:null}}));await page.waitForTimeout(500);
 report.cards=await page.evaluate(()=>{const cards=[...document.querySelectorAll('#sideBody .fcard')];const images=cards.flatMap(c=>[...c.querySelectorAll('.media-figure.card img')]).map(i=>i.src);return {columns:getComputedStyle(document.querySelector('.fcards')).columnCount,images,heights:cards.map(c=>Math.round(c.getBoundingClientRect().height)),empty:cards.filter(c=>!c.querySelector('img,video')).length};});
 assert.equal(report.cards.columns,'2');assert.equal(report.cards.images.length,new Set(report.cards.images).size);assert(report.cards.empty>0);assert(new Set(report.cards.heights).size>2);
 await page.screenshot({path:'test/artifacts/v25/fact-world.png'});
 report.arrivals=[];
 for(const tab of ['fact','relation'])for(const level of ['L1','L2','L3']){
 await page.evaluate(({tab,level})=>V03Store.set({tab,geo:{level,focus:level==='L3'?'湖南':null},rel:{view:'geo',level,focus:level==='L3'?'湖南':null,sel:null,kind:null,stack:[]}}),{tab,level});
 const before=await page.evaluate(()=>window.__stars.length);
 await page.waitForFunction(n=>window.__stars.length>n,before,{timeout:20000});
 const event=await page.evaluate(()=>({view:V03Store.state.tab,arrival:V03Feed.status().arrivals.at(-1),note:document.querySelector(V03Store.state.tab==='fact'?'#factSide .fresh-note':'#relSide .fresh-note')?.textContent,firstCard:document.querySelector(V03Store.state.tab==='fact'?'#sideBody [data-fid]':'#relBody [data-obj]')?.dataset}));
 if(tab==='relation'){assert(event.note?.includes('新本体'),JSON.stringify(event));const obj=await page.evaluate(()=>V03Data.objById(document.querySelector('#relBody [data-obj]').dataset.obj));assert(obj);assert(['Market','LogisticsNode','Base'].includes(obj.entityType));}
 report.arrivals.push({tab,level,...event});
 }
 report.business=await page.evaluate(()=>{const list=V03Filter.objects(),cards=[...document.querySelectorAll('#relBody .rel-card')];const images=cards.flatMap(c=>[...c.querySelectorAll('img')]).map(i=>i.src);return {count:list.length,invalid:list.filter(o=>['WeatherArea','WeatherObservation','MetricObservation'].includes(o.entityType)).length,cardKinds:[...new Set(cards.map(c=>V03Filter.relKind(V03Data.objById(c.dataset.obj))))],images};});
 assert.equal(report.business.invalid,0);assert(report.business.cardKinds.length>=3,JSON.stringify(report.business));assert.equal(report.business.images.length,new Set(report.business.images).size);
 await page.screenshot({path:'test/artifacts/v25/relation-hunan.png'});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);report.mobile=await page.evaluate(()=>({width:innerWidth,doc:document.documentElement.scrollWidth}));assert.equal(report.mobile.width,report.mobile.doc);await page.screenshot({path:'test/artifacts/v25/mobile.png'});
 report.performance=await page.evaluate(ready=>({startup:window.__tasks.filter(t=>t.at<ready),interactive:window.__tasks.filter(t=>t.at>=ready),max:Math.max(0,...window.__tasks.filter(t=>t.at>=ready).map(t=>t.ms))}),report.initial.ready);
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
}finally{fs.writeFileSync('test/artifacts/v25/delivery.json',JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));}
