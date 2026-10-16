import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const browser=await chromium.launch(), report={errors:[],batches:[]};
fs.mkdirSync('test/artifacts/v27',{recursive:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.addInitScript(()=>{
    window.__tasks=[];
    new PerformanceObserver(l=>__tasks.push(...l.getEntries().map(e=>({at:e.startTime,ms:e.duration})))).observe({type:'longtask',buffered:true});
  });
  await page.goto(pathToFileURL(path.resolve('index.html')).href);
  await page.waitForFunction(()=>window.__AGRI_READY);
  const sample=()=>page.evaluate(()=>({feed:V03Feed.status(),map:V03Filter.mapFacts().length,global:V03Filter.mapFacts().filter(f=>f.id.startsWith('v27-wb:')).length,at:performance.now()}));
  report.initial=await sample();
  assert(!report.initial.feed.done);
  for(let i=0;i<2;i++){
    await page.waitForTimeout(5000);
    report.batches.push(await sample());
  }
  assert(report.batches[1].global>report.batches[0].global);
  // Observe batches while the relation view is live. Existing IDs may only
  // make room for an explicitly prioritized fresh object, never reshuffle en masse.
  await page.evaluate(()=>{
    V03Store.set({tab:'relation',rel:{view:'geo',level:'L1',focus:null}});
    window.__stable={frames:0,empty:0,opacityDrops:0,maxRemoved:0};
    let previous=new Set(),active=true;
    const tick=()=>{
      const opt=echarts.getInstanceByDom(document.querySelector('#relCanvas')).getOption();
      const current=new Set(opt.series.find(s=>s.id==='relNode').data.map(n=>n.id));
      if(!current.size)__stable.empty++;
      const removed=[...previous].filter(id=>!current.has(id));
      __stable.maxRemoved=Math.max(__stable.maxRemoved,removed.length);
      previous=current;
      for(const id of ['layer-relation','relCanvas'])if(+getComputedStyle(document.getElementById(id)).opacity<.999)__stable.opacityDrops++;
      __stable.frames++;
      if(active)requestAnimationFrame(tick);
    };
    window.__stopStable=()=>{active=false;return __stable;};
    requestAnimationFrame(tick);
  });
  await page.waitForFunction(()=>V03Feed.status().done,{},{timeout:30000});
  report.loaded=await sample();
  report.stability=await page.evaluate(()=>__stopStable());
  assert(report.loaded.feed.elapsed<40000);
  assert(report.loaded.global>=5018);
  assert.equal(report.stability.empty+report.stability.opacityDrops,0);
  assert(report.stability.maxRemoved<=12,JSON.stringify(report.stability));
  await page.evaluate(()=>V03Feed.stop());
  await page.screenshot({path:'test/artifacts/v27/relation-batches.png'});
  // Real frames, including the first composite of the 3D view, must stay opaque.
  report.globe=await page.evaluate(async()=>{
    V03Store.set({rel:{view:'globe'}});
    let fades=0,blank=0,frames=0;
    const canvas=document.querySelector('#relGlobe'),ctx=canvas.getContext('2d');
    const until=performance.now()+3600;
    await new Promise(resolve=>{const tick=()=>{
      if(+getComputedStyle(canvas).opacity<.999)fades++;
      const c=ctx.getImageData(canvas.width/2|0,canvas.height/2|0,1,1).data;
      if(!c[3])blank++;
      frames++;
      if(performance.now()<until)requestAnimationFrame(tick);else resolve();
    };requestAnimationFrame(tick);});
    return {fades,blank,frames,debug:V03Relation.debug().globe};
  });
  assert.equal(report.globe.fades+report.globe.blank,0);
  assert(report.globe.debug.nodes>=500);
  await page.screenshot({path:'test/artifacts/v27/relation-globe.png'});
  // Measure interactions separately from startup and deliberate batch processing.
  const start=await page.evaluate(()=>performance.now());
  for(const level of ['L1','L2','L3']){
    await page.evaluate(level=>V03Store.set({tab:'fact',sk:{mode3d:false},geo:{level,focus:level==='L3'?'湖南':null,city:null,county:null}}),level);
    await page.waitForTimeout(400);
    await page.evaluate(()=>V03Fact.zoomBy(1));
    await page.waitForTimeout(400);
  }
  report.performance=await page.evaluate(({ready,start})=>({startup:__tasks.filter(t=>t.at<ready),batches:__tasks.filter(t=>t.at>=ready&&t.at<start),interactions:__tasks.filter(t=>t.at>=start)}),{ready:report.initial.at,start});
  assert.deepEqual(report.errors,[]);
  console.log(JSON.stringify(report,null,2));
} finally {
  fs.writeFileSync('test/artifacts/v27/batches.json',JSON.stringify(report,null,2));
  await browser.close();
}
