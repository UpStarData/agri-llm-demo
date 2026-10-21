import {chromium} from 'playwright';import {pathToFileURL} from 'node:url';import path from 'node:path';
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto(pathToFileURL(path.resolve('index.html')).href);await p.waitForFunction(()=>window.__AGRI_READY,{timeout:120000});
await p.evaluate(()=>{V03Feed.complete();V03Feed.stop();V03Store.set({tab:'fact',panels:{cards:true,stream:true}});});
await p.waitForTimeout(2000);
// 自动滚动（鼠标在左上角，不在面板内）
await p.mouse.move(5,5);
const s1=await p.evaluate(()=>{const el=document.querySelector('.fact-side .fs-body');return {top:el.scrollTop,__auto:!!el.__auto,hover:el.__auto?.hover};});
await p.waitForTimeout(2500);
const s2=await p.evaluate(()=>document.querySelector('.fact-side .fs-body').scrollTop);
console.log('autoscroll:',JSON.stringify({...s1,after:s2,moved:s2-s1.top}));
// 打开详情，找 4.11 按钮
const d=await p.evaluate(async()=>{document.querySelector('.fcards .fcard').click();await new Promise(r=>setTimeout(r,700));
  const btn=document.querySelector('#toLog');const all=[...document.querySelectorAll('.drawer button')].map(b=>b.textContent.trim());
  return {found:!!btn,text:btn?.textContent,buttons:all,x:!!document.querySelector('.drawer-x')};});
console.log('detail:',JSON.stringify(d));
// 第三排时间按钮可见性
const t=await p.evaluate(()=>[...document.querySelectorAll('#mapSk .sk-t')].map(b=>{const r=b.getBoundingClientRect();const cs=getComputedStyle(b);
  return {t:b.textContent,vis:cs.visibility,color:cs.color,w:Math.round(r.width),h:Math.round(r.height),top:Math.round(r.top)};}));
console.log('timerow:',JSON.stringify(t));
await b.close();
