import {chromium} from 'playwright';import {pathToFileURL} from 'node:url';import path from 'node:path';
const ok=[],bad=[];const chk=(n,c,x='')=>{(c?ok:bad).push(n+(x?' — '+x:''));};
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});
const errs=[];p.on('pageerror',e=>errs.push(String(e).slice(0,140)));
await p.goto(pathToFileURL(path.resolve('index.html')).href);await p.waitForFunction(()=>window.__AGRI_READY,{timeout:120000});
await p.evaluate(()=>{V03Feed.complete();V03Feed.stop();V03Store.set({tab:'fact',menu:true,panels:{cards:false,stream:true}});});
await p.waitForTimeout(2500);
const L=await p.evaluate(()=>{
  const g=id=>{const e=document.getElementById(id);if(!e)return null;const r=e.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};};
  const tl=document.getElementById('tlBar'), fs=document.getElementById('factStreams');
  const cs=n=>n?getComputedStyle(n):null;
  const st=document.getElementById('streamBox').getBoundingClientRect();
  return {tl:g('tlBar'),streams:g('factStreams'),out:g('facts-out'),in:g('facts-in'),stream:g('streamBox'),
    tlBg:cs(tl)?.backgroundColor, fsBg:cs(fs)?.backgroundColor, menuW:Math.round(document.getElementById('menu').getBoundingClientRect().width),
    inRows:document.querySelectorAll('#facts-in .fact-row').length, outRows:document.querySelectorAll('#facts-out .fact-row').length,
    order:[...document.querySelectorAll('#factStreams .fact-stream')].map(x=>x.id)};});
chk('时间轴在终端顶部', L.tl && Math.abs(L.tl.y+L.tl.h - L.stream.y) < 40, JSON.stringify({tl:L.tl,stream:L.stream}));
chk('时间轴无深色底（透明/浅玻璃）', /rgba\(255, 255, 255/.test(L.tlBg||''), L.tlBg);
chk('呼入呼出紧贴左菜单', L.streams && Math.abs(L.streams.x - L.menuW) <= 2, `streams.x=${L.streams?.x} menuW=${L.menuW}`);
chk('呼出在上/呼入在下', L.out && L.in && L.out.y < L.in.y, `${L.out?.y} < ${L.in?.y}`);
chk('呼出呼入背景透明', L.fsBg==='rgba(0, 0, 0, 0)', L.fsBg);
chk('两路有数据', L.inRows>0 || L.outRows>0, `in=${L.inRows} out=${L.outRows}`);
await p.screenshot({path:'test/artifacts/v295.png'});
console.log('PASS('+ok.length+'):');ok.forEach(x=>console.log('  ✓ '+x));
console.log('FAIL('+bad.length+'):');bad.forEach(x=>console.log('  ✗ '+x));
console.log('errors:',errs.length?errs.slice(0,2):'none');
await b.close();process.exit(bad.length?1:0);
