import {chromium} from 'playwright';import http from 'node:http';import fs from 'node:fs';import assert from 'node:assert/strict';
const server=http.createServer((q,s)=>{s.setHeader('Content-Type','text/html; charset=utf-8');s.end(fs.readFileSync('index.html'));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();const report={errors:[],batches:[],arrivals:[]};fs.mkdirSync('test/artifacts/v26',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(()=>{window.__tasks=[];window.__stars=[];new PerformanceObserver(l=>__tasks.push(...l.getEntries().map(e=>({at:e.startTime,ms:e.duration})))).observe({type:'longtask',buffered:true});new MutationObserver(rs=>rs.forEach(r=>r.addedNodes.forEach(n=>{if(n.nodeType===1&&n.matches?.('.star-flash'))__stars.push({id:n.dataset.fid,at:performance.now(),tab:window.V03Store?.state.tab});}))).observe(document,{childList:true,subtree:true});});
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.__AGRI_READY);
 report.initial=await page.evaluate(()=>({feed:V03Feed.status(),ready:performance.now()}));assert(report.initial.feed.loaded<report.initial.feed.total);
 for(let i=0;i<3;i++){await page.waitForTimeout(8000);report.batches.push(await page.evaluate(()=>V03Feed.status()));}
 await page.waitForFunction(()=>V03Feed.status().done,{},{timeout:15000});report.loaded=await page.evaluate(()=>V03Feed.status());assert(report.loaded.elapsed<=40000);assert(report.batches[0].loaded<report.batches[1].loaded&&report.batches[1].loaded<report.batches[2].loaded);assert(report.loaded.loaded>=report.loaded.total);
 for(const tab of ['fact','relation'])for(const level of ['L1','L2','L3']){
  await page.evaluate(({tab,level})=>V03Store.set({tab,geo:{level,focus:level==='L3'?'湖南':null},sk:{mode3d:false},rel:{view:'geo',level,focus:level==='L3'?'湖南':null,sel:null,kind:null,stack:[]}}),{tab,level});
  const before=await page.evaluate(()=>__stars.length);await page.waitForFunction(n=>__stars.length>n,before,{timeout:22000});
  const entry=await page.evaluate(()=>({arrival:V03Feed.status().arrivals.at(-1),note:document.querySelector(V03Store.state.tab==='fact'?'#factSide .fresh-note':'#relSide .fresh-note')?.textContent,star:__stars.at(-1),blockedMap:V03Filter.mapFacts().filter(f=>!V03Filter.mapEligible(f)).length}));
  assert.equal(entry.blockedMap,0);assert(entry.note?.includes(tab==='fact'?'新事实':'新本体'));if(tab==='fact')assert.equal(entry.arrival.mode,'public-report-ingest');report.arrivals.push({tab,level,...entry});
 }
 for(const tab of ['fact','relation']){
  await page.evaluate(tab=>V03Store.set({tab,geo:{level:'L1',focus:null},sk:{mode3d:true},rel:{view:'globe',level:'L1',focus:null,sel:null,kind:null,stack:[]}}),tab);
  const before=await page.evaluate(()=>__stars.length);await page.waitForFunction(n=>__stars.length>n,before,{timeout:22000});
  const entry=await page.evaluate(tab=>({arrival:V03Feed.status().arrivals.at(-1),star:__stars.at(-1),debug:(tab==='fact'?V03Fact:V03Relation).debug().globe}),tab);if(tab==='fact')assert.equal(entry.arrival.mode,'public-report-ingest');report.arrivals.push({tab,level:'3D',...entry});
 }
 report.performance=await page.evaluate(ready=>({startup:__tasks.filter(t=>t.at<ready),interactive:__tasks.filter(t=>t.at>=ready),max:Math.max(0,...__tasks.filter(t=>t.at>=ready).map(t=>t.ms))}),report.initial.ready);
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
}finally{fs.writeFileSync('test/artifacts/v26/delivery.json',JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));}
