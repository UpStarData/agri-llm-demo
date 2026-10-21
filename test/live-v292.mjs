import {chromium} from 'playwright';
const b=await chromium.launch({args:['--host-resolver-rules=MAP upstardata.github.io 185.199.108.153']});
const p=await b.newPage({viewport:{width:1440,height:900}});
const errs=[];p.on('pageerror',e=>errs.push(String(e).slice(0,110)));
const bad=[];p.on('response',r=>{if(r.status()>=400)bad.push(r.status()+' '+r.url().slice(-60));});
await p.goto('https://upstardata.github.io/agri-llm-demo/v2.9.2/',{waitUntil:'domcontentloaded',timeout:600000});
await p.waitForFunction(()=>window.__AGRI_READY,{timeout:600000});
await p.evaluate(()=>V03Feed.complete());
await p.evaluate(()=>{const t=[...document.querySelectorAll('#tabs button,[role=tab]')].find(x=>x.textContent.includes('推演'));t?.click();});
await p.waitForTimeout(9000);
const fr=p.frames().find(f=>f.url().includes('mirofish'));
let inner=null;
if(fr){try{inner=await fr.evaluate(()=>({title:document.title,text:(document.body.innerText||'').replace(/\s+/g,' ').slice(0,60)}));}catch(e){inner={err:String(e).slice(0,60)};}}
const iframeSrc=await p.evaluate(()=>document.querySelector('iframe')?.src);
console.log(JSON.stringify({iframeSrc,inner,badResponses:bad.slice(0,3),pageErrors:errs.slice(0,3)},null,0));
await p.screenshot({path:'test/artifacts/live-v292-sim.png'});
await b.close();
