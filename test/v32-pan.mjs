import {chromium} from 'playwright';import {pathToFileURL} from 'node:url';import path from 'node:path';
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto(pathToFileURL(path.resolve('index.html')).href);await p.waitForFunction(()=>window.__AGRI_READY,{timeout:120000});
await p.evaluate(()=>{V03Feed.complete();V03Feed.stop();V03Store.set({tab:'fact',sk:{mode3d:false},geo:{level:'L1',focus:null},panels:{cards:false,stream:false}});});
await p.waitForTimeout(1200);
const read=()=>p.evaluate(()=>{const g=echarts.getInstanceByDom(document.getElementById('factMap')).getOption().geo[0];return {zoom:+g.zoom.toFixed(2),lat:+g.center[1].toFixed(2),lng:+g.center[0].toFixed(2)};});
const box=await p.evaluate(()=>{const r=document.getElementById('factMap').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};});
const before=await read();
// 垂直拖 300px
await p.mouse.move(box.x,box.y);await p.mouse.down();
for(let i=0;i<12;i++){await p.mouse.move(box.x,box.y-300+i*12);await p.waitForTimeout(25);}
await p.mouse.up();await p.waitForTimeout(800);
const afterV=await read();
// 水平拖 300px（应仍然可动）
await p.mouse.move(box.x,box.y);await p.mouse.down();
for(let i=0;i<12;i++){await p.mouse.move(box.x-300+i*12,box.y);await p.waitForTimeout(25);}
await p.mouse.up();await p.waitForTimeout(800);
const afterH=await read();
const pass = Math.abs(afterV.lat-before.lat)<=8.5 && Math.abs(afterH.lng-afterV.lng)>10;
console.log(JSON.stringify({before,afterV,afterH,pass},null,0));
await b.close(); process.exit(pass?0:1);
