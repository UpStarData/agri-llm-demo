import {chromium} from 'playwright';import {pathToFileURL} from 'node:url';import path from 'node:path';
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto(pathToFileURL(path.resolve('index.html')).href);await p.waitForFunction(()=>window.__AGRI_READY,{timeout:120000});
await p.evaluate(()=>{V03Feed.complete();V03Feed.stop();V03Store.set({tab:'fact',panels:{cards:false,stream:false}});});
await p.waitForTimeout(600);
console.log(JSON.stringify(await p.evaluate(()=>{
  const t=document.querySelector('#mapSk .sk-t');
  if(!t) return {none:true};
  const cs=getComputedStyle(t), r=t.getBoundingClientRect();
  const v=t.querySelector('.sk-v'); const cv=v?getComputedStyle(v):null;
  return {text:t.textContent, rect:{w:Math.round(r.width),h:Math.round(r.height),y:Math.round(r.y)},
    color:cs.color, bg:cs.backgroundColor, vis:cs.visibility, opacity:cs.opacity,
    spanColor:cv?cv.color:null, spanFont:cv?cv.fontSize:null};
}),null,1));
await b.close();
