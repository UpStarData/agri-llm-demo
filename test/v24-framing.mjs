import {chromium} from 'playwright';import fs from 'node:fs';import http from 'node:http';import assert from 'node:assert/strict';
const srv=http.createServer((q,s)=>{s.setHeader('Content-Type','text/html');s.end(fs.readFileSync('index.html'));});await new Promise(r=>srv.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
try {const page=await browser.newPage({viewport:{width:1440,height:900}});await page.goto('http://127.0.0.1:'+srv.address().port);await page.waitForFunction(()=>window.__AGRI_READY);await page.evaluate(()=>{V03Feed.complete();V03Fact.finishAnimation?.();V03Feed.stop();});
 for(const tab of ['fact','relation'])for(const level of ['L1','L2','L3']){
 await page.evaluate(({tab,level})=>V03Store.set({tab,geo:{level,focus:level==='L3'?'湖南':null},rel:{view:'geo',level,focus:level==='L3'?'湖南':null}}),{tab,level});await page.waitForTimeout(300);
 const result=await page.evaluate(({tab,level})=>{const c=echarts.getInstanceByDom(document.querySelector(tab==='fact'?'#factMap':'#relCanvas'));const el=document.createElement('div');el.style.cssText=`width:${c.getWidth()}px;height:${c.getHeight()}px;position:absolute;left:-20000px`;document.body.append(el);const ref=echarts.init(el);const config={L1:{map:'worldChina',center:[107.98,26.65],zoom:1.36,boundingCoords:[[-25,72],[335,-56]]},L2:{map:'china',center:[108.05,36.15],zoom:1.59},L3:{map:'china',center:[111.73,27.54],zoom:9.08}}[level];ref.setOption({geo:config});const coords=[[112.98,28.19],[108.05,36.15],[119.7,49.6]];const values=coords.map(p=>({p,actual:c.convertToPixel({geoIndex:0},p),expected:ref.convertToPixel({geoIndex:0},p)}));ref.dispose();el.remove();return {tab,level,values};},{tab,level});
 for(const v of result.values)assert(Math.hypot(v.actual[0]-v.expected[0],v.actual[1]-v.expected[1])<.01,JSON.stringify(result));
 console.log('Historical maplab projection matches:',tab,level);
 }
 // Physical map drill must use the same confirmed framing. The former fact
 // click handler overwrote it with an unrelated PROV_CENTER zoom of 4.2.
 for(const tab of ['fact','relation']){
  await page.evaluate(tab=>V03Store.set({tab,sk:{mode3d:false},geo:{level:'L2',focus:null},rel:{view:'geo',level:'L2',focus:null,sel:null,kind:null,stack:[]}}),tab);await page.waitForTimeout(450);
  const xy=await page.evaluate(tab=>{const c=echarts.getInstanceByDom(document.querySelector(tab==='fact'?'#factMap':'#relCanvas')),rect=c.getDom().getBoundingClientRect();const data=c.getOption().series.find(s=>s.id===(tab==='fact'?'facts':'relNode')).data;const points=data.map(d=>c.convertToPixel({geoIndex:0},d.value));for(const ll of [[90,35],[88,31],[104,38],[117,43],[109,35]]){const p=c.convertToPixel({geoIndex:0},ll);if(p[0]>40&&p[0]<c.getWidth()-40&&p[1]>70&&p[1]<c.getHeight()-70&&!points.some(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<18))return [rect.x+p[0],rect.y+p[1]];}throw Error('No clear China drill point');},tab);
  await page.mouse.click(...xy);await page.waitForFunction(tab=>(tab==='fact'?V03Store.state.geo.level:V03Store.state.rel.level)==='L3',tab);await page.waitForTimeout(950);
  const geo=await page.evaluate(tab=>echarts.getInstanceByDom(document.querySelector(tab==='fact'?'#factMap':'#relCanvas')).getOption().geo[0],tab);
  assert.deepEqual(geo.center,[111.73,27.54]);assert.equal(geo.zoom,9.08);console.log('Physical China → Hunan drill preserves historical framing:',tab);
 }
}finally{await browser.close();await new Promise(r=>srv.close(r));}
