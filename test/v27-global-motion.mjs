import {chromium} from 'playwright';import {pathToFileURL}from'node:url';import path from'node:path';import fs from'node:fs';import assert from'node:assert/strict';
const browser=await chromium.launch(),report={errors:[],motion:[],scope:[]};fs.mkdirSync('test/artifacts/v27',{recursive:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(()=>{window.__longtasks=[];new PerformanceObserver(l=>__longtasks.push(...l.getEntries().map(e=>({at:e.startTime,ms:e.duration})))).observe({type:'longtask',buffered:true});});
 await page.goto(pathToFileURL(path.resolve(process.env.AGRI_TEST_HTML||'index.html')).href);await page.waitForFunction(()=>window.__AGRI_READY);
 await page.evaluate(()=>{V03Feed.complete();V03Feed.stop();});
 // Exercise the original first-entry sequence. Empty/reset counts alone missed
 // this bug: a running particle's destination changed on every intro tick.
 for(const level of ['L1','L2','L3']){
  await page.evaluate(level=>{window.__motion={flowWrites:0,pathChanges:0,nodeDrops:0,opacityDrops:0,frames:0};const original=echarts.init;echarts.init=function(...args){const c=original(...args);if(c.getDom().id==='relCanvas'&&!c.__motionWrapped){c.__motionWrapped=true;const set=c.setOption.bind(c);c.setOption=(o,p)=>{if(o.series?.some(s=>s.id?.startsWith('relFlow-')))__motion.flowWrites++;return set(o,p);};}return c;};
   const existing=echarts.getInstanceByDom(document.querySelector('#relCanvas'));if(existing&&!existing.__motionWrapped)echarts.init(existing.getDom());
   V03Store.set({tab:'relation',rel:{view:'geo',level,focus:level==='L3'?'湖南':null,sel:null,kind:null,stack:[]}});
   let paths=new Map(),oldNodes=new Set();const t0=performance.now();
   window.__motionDone=new Promise(resolve=>{const tick=()=>{const c=echarts.getInstanceByDom(document.querySelector('#relCanvas')),opt=c.getOption(),next=new Map();for(const s of opt.series.filter(s=>s.id.startsWith('relFlow-')))for(const l of s.data){const coords=JSON.stringify(l.coords);if(paths.has(l.id)&&paths.get(l.id)!==coords)__motion.pathChanges++;next.set(l.id,coords);}paths=next;
    const nodes=new Set(opt.series.find(s=>s.id==='relNode').data.map(n=>n.id));for(const id of oldNodes)if(!nodes.has(id))__motion.nodeDrops++;oldNodes=nodes;
    for(const id of ['layer-relation','relCanvas'])if(Number(getComputedStyle(document.getElementById(id)).opacity)<.999)__motion.opacityDrops++;
    __motion.frames++;if(performance.now()-t0<3500)requestAnimationFrame(tick);else resolve({...__motion});};requestAnimationFrame(tick);});
  },level);
  const motion=await page.evaluate(()=>__motionDone);report.motion.push({level,...motion});assert.equal(motion.pathChanges,0,level+' running flow destinations changed during intro');assert.equal(motion.nodeDrops,0,level+' already lit nodes disappeared');assert.equal(motion.opacityDrops,0,level+' whole map faded out');assert(motion.flowWrites<=2,JSON.stringify({level,motion}));
 }
 if(!process.argv.includes('--motion-only')){
  await page.evaluate(()=>V03Store.set({tab:'fact',geo:{level:'L1',focus:null},sk:{mode3d:false}}));
  report.data=await page.evaluate(()=>{const s=V03Store.state,fs=V03Filter.mapFacts(),countries=[...new Set(fs.map(f=>(f.regionPath||[]).find(r=>r.level==='country')?.name).filter(Boolean))],chart=echarts.getInstanceByDom(document.querySelector('#factMap')),pts=chart.getOption().series.find(s=>s.id==='facts').data;return{time:s.time,sk:s.sk,all:V03Data.FACTS.length,map:fs.length,countries,statistics:fs.filter(f=>f.id.startsWith('v28-wb-')).length,newHongxing:fs.filter(f=>f.id.startsWith('v27-hongxing')).length,hongxing:fs.filter(f=>/红星/.test(f.title)).length,oldBusiness:fs.filter(f=>!f.id.startsWith('v27-')&&!f.id.startsWith('v28-')).length,blocked:fs.filter(f=>!V03Filter.mapEligible(f)).length,pointGroups:pts.length/3,invisible:pts.filter(p=>p.itemStyle.opacity===0).length,RUS:pts.filter(p=>(p.factIds||[]).some(id=>id.startsWith("v28-wb-RUS-"))).length,CAN:pts.filter(p=>(p.factIds||[]).some(id=>id.startsWith("v28-wb-CAN-"))).length,provinces:Object.fromEntries(['湖南省','河南省','河北省','重庆市','山东省','辽宁省','吉林省','黑龙江省'].map(p=>[p,fs.filter(f=>f.province===p).length]))};});
  assert.equal(report.data.time,'all');for(const k of ['regions','gates','airports','markets','risks'])assert.equal(report.data.sk[k],true,k+' must default on');assert(report.data.statistics>=18000,JSON.stringify({statistics:report.data.statistics}));assert(report.data.countries.length>=200);// V2.8 rebuilt the provincial archive as v28-reports (it supersedes v26-reports), so this
 // guard now tracks the untouched pre-existing business base rather than the old 8111 snapshot.
 // This metric is now the untouched pre-V2.7 business base (base package + projects + streams +
 // media + hongxing); the provincial archive itself is guarded by the per-province counts below.
 assert(report.data.oldBusiness>=700,JSON.stringify({oldBusiness:report.data.oldBusiness}));;assert(report.data.hongxing>=82);assert.equal(report.data.newHongxing,26);assert(report.data.RUS&&report.data.CAN);assert.equal(report.data.invisible+report.data.blocked,0);for(const count of Object.values(report.data.provinces))assert(count>=600);
  await page.evaluate(()=>V03Store.set({menu:true}));assert.equal(await page.locator('.mn-overlay input:checked').count(),5);
  for(const k of ['regions','gates','airports','markets','risks']){await page.evaluate(k=>V03Store.set({sk:{[k]:false}}),k);const off=await page.evaluate(k=>{const ids={regions:'regions',gates:'gatesP',airports:'gatesA',markets:'markets',risks:'risks'},s=echarts.getInstanceByDom(document.querySelector('#factMap')).getOption().series;return{off:s.filter(x=>x.id.startsWith(ids[k])).every(x=>!x.data.length),others:['regions','gates','airports','markets','risks'].filter(x=>x!==k).every(x=>V03Store.state.sk[x])};},k);assert(off.off&&off.others,k+' not independent');await page.evaluate(k=>V03Store.set({sk:{[k]:true}}),k);}
  await page.evaluate(()=>V03Store.set({menu:false}));await page.screenshot({path:'test/artifacts/v27/fact-world.png'});
  for(const level of ['L2','L3']){await page.evaluate(level=>V03Store.set({geo:{level,focus:level==='L3'?'湖南':null,city:null,county:null}}),level);const d=await page.evaluate(()=>({facts:V03Filter.mapFacts().length,hongxing:V03Filter.mapFacts().filter(f=>/红星/.test(f.title)).length}));assert(d.hongxing>=60);report.scope.push({level,...d});}
  await page.evaluate(()=>V03Store.set({geo:{level:'L1',focus:null},sk:{mode3d:true}}));report.globe=await page.evaluate(()=>V03Fact.debug().globe);assert.equal(report.globe.points,report.data.pointGroups);assert(report.globe.marks>0);
 }
 assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
}finally{fs.writeFileSync('test/artifacts/v27/global-motion.json',JSON.stringify(report,null,2));await browser.close();}
