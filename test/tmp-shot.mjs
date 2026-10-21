import {chromium} from 'playwright';import {pathToFileURL} from 'node:url';import path from 'node:path';
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto(pathToFileURL(path.resolve('index.html')).href);await p.waitForFunction(()=>window.__AGRI_READY,{timeout:120000});
await p.evaluate(()=>{V03Feed.complete();V03Feed.stop();V03Store.set({tab:'fact',panels:{cards:false,stream:false}});});
await p.waitForTimeout(900);
await p.screenshot({path:'test/artifacts/v34-full.png', clip:{x:1020,y:700,width:420,height:200}});
console.log(JSON.stringify(await p.evaluate(()=>{const bk=document.getElementById('mapSk');const r=bk.getBoundingClientRect();
  return {h:Math.round(r.height),w:Math.round(r.width),t:Math.round(r.top),b:Math.round(r.bottom),
    rows:[...bk.querySelectorAll('.sk-row')].map(x=>{const q=x.getBoundingClientRect();return [Math.round(q.top),Math.round(q.height),x.children.length]}),
    times:[...bk.querySelectorAll('.sk-t')].map(x=>x.textContent)};})));
await b.close();
