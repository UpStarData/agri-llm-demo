import {chromium} from 'playwright';import http from 'node:http';import fs from 'node:fs';import assert from 'node:assert/strict';
const server=http.createServer((q,s)=>{s.setHeader('Content-Type','text/html; charset=utf-8');s.end(fs.readFileSync('index.html'));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();const report={errors:[],batches:[],arrivals:[]};fs.mkdirSync('test/artifacts/v26',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(()=>{window.__tasks=[];window.__stars=[];window.__batches=[];setInterval(()=>{if(window.V03Feed)__batches.push([window.V03Feed.status().loaded,window.V03Feed.status().done]);},400);new PerformanceObserver(l=>__tasks.push(...l.getEntries().map(e=>({at:e.startTime,ms:e.duration})))).observe({type:'longtask',buffered:true});new MutationObserver(rs=>rs.forEach(r=>r.addedNodes.forEach(n=>{if(n.nodeType===1&&n.matches?.('.star-flash'))__stars.push({id:n.dataset.fid,at:performance.now(),tab:window.V03Store?.state.tab});}))).observe(document,{childList:true,subtree:true});});
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.__AGRI_READY);
 report.initial=await page.evaluate(()=>({feed:V03Feed.status(),ready:performance.now()}));
 // 页面在 100MB 级制品上启动较慢，"渐进铺点"只能在页面内部观察：
 // 记录到的快照里必须存在未完成且条数更少的中间态。
 const seen=await page.evaluate(()=>__batches.map(([loaded,done])=>({loaded,done})));
 assert(seen.some(b=>!b.done&&b.loaded<report.initial.feed.total),JSON.stringify(seen.slice(0,4)));
 /* 首次进入事实层须在 10 秒内铺完（2026-10-16 反馈第 2 项），因此取样间隔相应缩短 */
 report.batches=await page.evaluate(()=>__batches.map(([loaded,done])=>({loaded,done})));
 await page.waitForFunction(()=>V03Feed.status().done,{},{timeout:15000});report.loaded=await page.evaluate(()=>V03Feed.status());assert(report.loaded.elapsed<=10000,JSON.stringify(report.loaded));const growth=report.batches.filter((b,i,a)=>i&&b.loaded>a[i-1].loaded&&!a[i-1].done);assert(growth.length>=3,JSON.stringify(report.batches.slice(0,6)));assert(report.loaded.loaded>=report.loaded.total);
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
