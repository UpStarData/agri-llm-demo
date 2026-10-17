import {chromium} from 'playwright';
import fs from 'node:fs';import http from 'node:http';import assert from 'node:assert/strict';
const server=http.createServer((q,s)=>{s.setHeader('Content-Type','text/html');s.end(fs.readFileSync('index.html'));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
const report={views:[],errors:[]};
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(()=>{window.__tasks=[];new PerformanceObserver(l=>window.__tasks.push(...l.getEntries().map(t=>({at:t.startTime,ms:t.duration})))).observe({type:'longtask',buffered:true});});
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.__AGRI_READY);
 await page.evaluate(()=>{V03Feed.complete();V03Fact.finishAnimation();V03Feed.stop();});await page.waitForTimeout(500);
 for(const tab of ['fact','relation'])for(const level of ['L1','L2','L3']){
  const start=await page.evaluate(({tab,level})=>{const t=performance.now();V03Store.set({tab,geo:{level,focus:level==='L3'?'湖南':null},rel:{view:'geo',level,focus:level==='L3'?'湖南':null,sel:null,kind:null,stack:[]}});return t;},{tab,level});
  await page.waitForTimeout(3600);
  const result=await page.evaluate(({tab,start})=>{const c=echarts.getInstanceByDom(document.querySelector(tab==='fact'?'#factMap':'#relCanvas'));const before=performance.now();c.dispatchAction({type:'geoRoam',geoIndex:0,zoom:1.04,originX:c.getWidth()/2,originY:c.getHeight()/2});return {switchTasks:window.__tasks.filter(t=>t.at+t.ms>=start&&t.at<before),zoomStart:before};},{tab,start});
  await page.waitForTimeout(300);
  result.zoomTasks=await page.evaluate(t=>window.__tasks.filter(x=>x.at+x.ms>=t),result.zoomStart);report.views.push({tab,level,...result});
 }
 // A real pointer event must still pick a fact in the batched large scatter path.
 await page.evaluate(()=>V03Store.set({tab:'fact',geo:{level:'L1',focus:null},factId:null}));await page.waitForTimeout(300);
 const target=await page.evaluate(()=>{const c=echarts.getInstanceByDom(document.querySelector('#factMap')),rect=c.getDom().getBoundingClientRect();const data=c.getOption().series.find(s=>s.id==='facts').data;const points=data.map(d=>({id:d.id,p:c.convertToPixel({geoIndex:0},d.value)}));const found=points.find(x=>x.p[0]>100&&x.p[0]<c.getWidth()-100&&x.p[1]>100&&x.p[1]<c.getHeight()-120&&!points.some(y=>x!==y&&Math.hypot(x.p[0]-y.p[0],x.p[1]-y.p[1])<12));if(!found)throw Error('No isolated visible fact');return {id:found.id,x:rect.x+found.p[0],y:rect.y+found.p[1]};});
 await page.mouse.click(target.x,target.y);await page.waitForTimeout(150);
 const picked=await page.evaluate(()=>({id:V03Store.state.factId,chooser:!document.querySelector('.fact-chooser').hidden}));
 assert(picked.id===target.id||picked.chooser,JSON.stringify({target,picked}));
 report.factClick={target,picked};assert.deepEqual(report.errors,[]);
 report.max=Math.max(0,...report.views.flatMap(v=>[...v.switchTasks,...v.zoomTasks]).map(t=>t.ms));
 console.log(JSON.stringify(report,null,2));assert(report.max<=100,'View/zoom main-thread task exceeded 100ms: '+report.max);
}finally{fs.mkdirSync('test/artifacts/v24',{recursive:true});fs.writeFileSync('test/artifacts/v24/interactions.json',JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.close(r));}
