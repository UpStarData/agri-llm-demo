import {chromium} from 'playwright';import {pathToFileURL} from 'node:url';import path from 'node:path';
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto(pathToFileURL(path.resolve('index.html')).href);await p.waitForFunction(()=>window.__AGRI_READY,{timeout:120000});
await p.evaluate(()=>{V03Feed.complete();V03Feed.stop();V03Store.set({tab:'fact',panels:{cards:false,stream:false}});});
await p.waitForTimeout(700);
const info=await p.evaluate(()=>{
  const rows=[...document.querySelectorAll('#mapSk .sk-row')].map(r=>({y:Math.round(r.getBoundingClientRect().y),n:r.children.length}));
  const figs=[...document.querySelectorAll('#mapSk .sk-fig svg')].length;
  const box=document.getElementById('mapSk').getBoundingClientRect();
  return {rows, figmaIcons:figs, total:[...document.querySelectorAll('#mapSk .sk')].length, box:{top:Math.round(box.top),bottom:Math.round(box.bottom),right:Math.round(box.right)}};
});
console.log(JSON.stringify(info));
const el=await p.$('#mapSk'); await el.screenshot({path:'test/artifacts/v34-shortcut.png'});
await b.close();
