import {chromium} from 'playwright';import {pathToFileURL} from 'node:url';import path from 'node:path';
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto(pathToFileURL(path.resolve('index.html')).href);await p.waitForFunction(()=>window.__AGRI_READY,{timeout:120000});
await p.evaluate(()=>{V03Feed.complete();V03Feed.stop();V03Store.set({tab:'fact',panels:{cards:false,stream:false}});});
await p.waitForTimeout(900);
console.log(JSON.stringify(await p.evaluate(()=>{
  const b1=document.querySelector('#mapSk .sk-t');const r=b1.getBoundingClientRect();
  const cs=getComputedStyle(b1);
  const hit=document.elementFromPoint(r.x+r.width/2, r.y+r.height/2);
  const row=b1.parentElement; const rs=getComputedStyle(row);
  const bk=document.getElementById('mapSk'); const bs=getComputedStyle(bk);
  return {rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},
    bg:cs.backgroundColor,color:cs.color,border:cs.border,font:cs.fontSize,opacity:cs.opacity,display:cs.display,
    hitCls:hit?.className, hitTag:hit?.tagName,
    rowDisplay:rs.display, rowOverflow:rs.overflow, bkOverflow:bs.overflow, bkHeight:bs.height};
}),null,1));
await b.close();
