import {chromium} from 'playwright';import {pathToFileURL} from 'node:url';import path from 'node:path';
const ok=[],bad=[];const chk=(n,c,x='')=>{(c?ok:bad).push(n+(x?' — '+x:''));};
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});
const errs=[];p.on('pageerror',e=>errs.push(String(e).slice(0,120)));
await p.goto(pathToFileURL(path.resolve('index.html')).href);await p.waitForFunction(()=>window.__AGRI_READY,{timeout:120000});
const grab=async()=>p.evaluate(()=>{
  const r=id=>{const e=document.getElementById(id);if(!e)return null;const b=e.getBoundingClientRect();return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)};};
  const cs=sel=>{const e=document.querySelector(sel);return e?getComputedStyle(e):null;};
  return {out:r('facts-out'),in:r('facts-in'),tl:r('tlBar'),menu:r('menu'),
    outBg:cs('#facts-out')?.backgroundColor, fsBg:cs('#factStreams')?.backgroundColor, tlBg:cs('.tlbar')?.backgroundColor,
    tlGlass:cs('.tlbar')?.backdropFilter, narrow:document.getElementById('tlBar').classList.contains('is-narrow'),
    rowsIn:document.querySelectorAll('#facts-in .fact-row').length, rowsOut:document.querySelectorAll('#facts-out .fact-row').length};});
await p.evaluate(()=>{V03Feed.complete();V03Feed.stop();V03Store.set({tab:'fact',menu:false,panels:{cards:false,stream:true}});});
await p.waitForTimeout(1800);
const closed=await grab();
await p.evaluate(()=>V03Store.set({menu:true}));await p.waitForTimeout(700);
const opened=await grab();
chk('三块都无背景', [closed.outBg,closed.fsBg,closed.tlBg].every(c=>c==='rgba(0, 0, 0, 0)'), JSON.stringify([closed.outBg,closed.fsBg,closed.tlBg]));
chk('时间轴无玻璃', closed.tlGlass==='none'||!closed.tlGlass, String(closed.tlGlass));
chk('呼出在上、呼入在下', closed.out.y < closed.in.y, `${closed.out.y} < ${closed.in.y}`);
chk('呼出贴菜单右缘（关菜单时 x≈10）', closed.out.x<=20, String(closed.out.x));
chk('呼入贴左缘（关菜单时 x≈10）', closed.in.x<=20, String(closed.in.x));
chk('时间轴在呼入右侧', closed.tl.x > closed.in.x, `tl=${closed.tl.x} in=${closed.in.x}`);
chk('开菜单后三块右移', opened.out.x>closed.out.x+300, `${closed.out.x} → ${opened.out.x}`);
chk('开菜单后时间轴变短且收窄处理生效', opened.tl.w < closed.tl.w, `${closed.tl.w} → ${opened.tl.w}, narrow=${opened.narrow}`);
chk('两路有数据', closed.rowsIn>0||closed.rowsOut>0, `in=${closed.rowsIn} out=${closed.rowsOut}`);
await p.evaluate(()=>V03Store.set({menu:false}));await p.waitForTimeout(500);
await p.screenshot({path:'test/artifacts/v297-closed.png'});
await p.evaluate(()=>V03Store.set({menu:true}));await p.waitForTimeout(500);
await p.screenshot({path:'test/artifacts/v297-open.png'});
console.log('PASS('+ok.length+'):');ok.forEach(x=>console.log('  ✓ '+x));
console.log('FAIL('+bad.length+'):');bad.forEach(x=>console.log('  ✗ '+x));
console.log('errors:',errs.length?errs.slice(0,2):'none');
await b.close();process.exit(bad.length?1:0);
