import {chromium} from 'playwright';import {pathToFileURL} from 'node:url';import path from 'node:path';
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto(pathToFileURL(path.resolve('index.html')).href);await p.waitForFunction(()=>window.__AGRI_READY,{timeout:120000});
await p.evaluate(()=>{V03Feed.complete();V03Feed.stop();});
// 找一条视频事实并把它搜出来
const t=await p.evaluate(()=>{const v=V03Data.FACTS.find(f=>f.cardType==='video');return v?{title:v.title,id:v.id,hls:!!(v.card&&v.card.hlsUrl)}:null;});
console.log('video fact:',JSON.stringify(t));
await p.evaluate(title=>{V03Store.set({tab:'fact',time:'all',q:title,sk:{live:true},panels:{cards:true,stream:false}});},t.title);
await p.waitForTimeout(2500);
const info=await p.evaluate(()=>({
  players:document.querySelectorAll('.fcards .fc-player').length,
  videos:document.querySelectorAll('.fcards video').length,
  muted:[...document.querySelectorAll('.fcards video')].map(v=>v.muted),
  autoplay:[...document.querySelectorAll('.fcards video')].map(v=>v.autoplay),
  play:[...document.querySelectorAll('.fcards .fc-player')].map(p=>p.dataset.play),
}));
console.log('with live=on:',JSON.stringify(info));
if(info.videos){
  await p.evaluate(()=>V03Store.set({sk:{live:false}}));
  await p.waitForTimeout(1500);
  const off=await p.evaluate(()=>({videos:document.querySelectorAll('.fcards video').length,
    paused:[...document.querySelectorAll('.fcards video')].map(v=>v.paused),
    players:[...document.querySelectorAll('.fcards .fc-player')].map(x=>x.dataset.play)}));
  console.log('with live=off:',JSON.stringify(off));
}
await p.screenshot({path:'test/artifacts/v33-video.png'});
await b.close();
