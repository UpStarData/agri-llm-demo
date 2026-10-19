import {chromium} from 'playwright';import {pathToFileURL} from 'node:url';
const b=await chromium.launch({args:['--use-gl=swiftshader','--enable-unsafe-swiftshader']});
for (const [name,file] of [['icon','/tmp/deck-icon-test.html'],['text','/tmp/deck-text-test.html']]) {
  const p=await b.newPage({viewport:{width:700,height:420}});
  const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error')errs.push('c:'+m.text().slice(0,80));});
  await p.goto(pathToFileURL(file).href); await p.waitForTimeout(3000);
  const pick=await p.evaluate(()=>window.__pick||null);
  await p.screenshot({path:`/tmp/deck-${name}.png`});
  console.log(name,'pick=',JSON.stringify(pick),'errs=',JSON.stringify(errs.slice(0,2)));
  await p.close();
}
await b.close();
