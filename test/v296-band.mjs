import {chromium} from 'playwright';import {pathToFileURL} from 'node:url';import path from 'node:path';
const ok=[],bad=[];const chk=(n,c,x='')=>{(c?ok:bad).push(n+(x?' — '+x:''));};
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});
const errs=[];p.on('pageerror',e=>errs.push(String(e).slice(0,120)));
await p.goto(pathToFileURL(path.resolve('index.html')).href);await p.waitForFunction(()=>window.__AGRI_READY,{timeout:120000});
await p.evaluate(()=>{V03Feed.complete();V03Feed.stop();V03Store.set({tab:'fact',menu:false,panels:{cards:false,stream:true}});});
await p.waitForTimeout(2600);
const L=await p.evaluate(()=>{
  const r=id=>{const e=document.getElementById(id);if(!e)return null;const b=e.getBoundingClientRect();return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)};};
  const cs=sel=>{const e=document.querySelector(sel);return e?getComputedStyle(e):null;};
  const band=document.getElementById('factBand');
  return {band:r('factBand'),order:[...document.querySelectorAll('#factStreams .fact-stream')].map(x=>x.id),
    out:r('facts-out'),in:r('facts-in'),tl:r('tlBar'),
    tlGlass:cs('.tlbar')?.backdropFilter, fsGlass:cs('.fstreams .fact-stream')?.backdropFilter,
    tlBg:cs('.tlbar')?.backgroundColor, bandBg:cs('.fact-band')?.backgroundColor,
    axisLabels:cs('.fact-axis-labels')?.display, streamDate:cs('.fact-stream-date')?.display,
    inRows:document.querySelectorAll('#facts-in .fact-row').length,
    outRows:document.querySelectorAll('#facts-out .fact-row').length};});
chk('无玻璃/无卡片（无 backdrop-filter）', (L.tlGlass==='none'||!L.tlGlass) && (L.fsGlass==='none'||!L.fsGlass), JSON.stringify({tl:L.tlGlass,fs:L.fsGlass}));
chk('时间轴无底色（无痕）', L.tlBg==='rgba(0, 0, 0, 0)', L.tlBg);
chk('带子用终端底色', L.bandBg==='rgb(36, 68, 77)', L.bandBg);
chk('呼出在上/呼入在下', L.out && L.in && L.out.y < L.in.y, `${L.out?.y} < ${L.in?.y}`);
chk('时间轴在呼入右侧', L.tl && L.tl.x > L.in.x + L.in.w - 10, `tl.x=${L.tl?.x} in.right=${(L.in?.x||0)+(L.in?.w||0)}`);
chk('日期标签已去掉', L.axisLabels==='none' && L.streamDate==='none', JSON.stringify({a:L.axisLabels,s:L.streamDate}));
chk('两路有数据', L.inRows>0||L.outRows>0, `in=${L.inRows} out=${L.outRows}`);
await p.screenshot({path:'test/artifacts/v296.png'});
console.log('PASS('+ok.length+'):');ok.forEach(x=>console.log('  ✓ '+x));
console.log('FAIL('+bad.length+'):');bad.forEach(x=>console.log('  ✗ '+x));
console.log('errors:',errs.length?errs.slice(0,2):'none');
await b.close();process.exit(bad.length?1:0);
