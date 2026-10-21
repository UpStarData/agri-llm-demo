import {chromium} from 'playwright';import {pathToFileURL} from 'node:url';import path from 'node:path';
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto(pathToFileURL(path.resolve('index.html')).href);await p.waitForFunction(()=>window.__AGRI_READY,{timeout:120000});
await p.evaluate(()=>{V03Feed.complete();V03Feed.stop();V03Store.set({tab:'fact',panels:{cards:false,stream:false}});});
await p.waitForTimeout(900);
const r=await p.evaluate(()=>{const bk=document.getElementById('mapSk').getBoundingClientRect();
  return {x:Math.round(bk.x)-8,y:Math.round(bk.y)-8,width:Math.round(bk.width)+16,height:Math.round(bk.height)+16,
   rows:[...document.querySelectorAll('#mapSk .sk-row')].map(x=>{const q=x.getBoundingClientRect();return [Math.round(q.top),Math.round(q.height),x.children.length]})};});
console.log(JSON.stringify(r));
await p.screenshot({path:'test/artifacts/v34-cluster.png', clip:{x:r.x,y:r.y,width:r.width,height:r.height}});
await b.close();
