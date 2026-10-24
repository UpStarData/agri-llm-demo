import {chromium} from 'playwright';import {pathToFileURL} from 'node:url';import path from 'node:path';
const ok=[],bad=[];const chk=(n,c,x='')=>{(c?ok:bad).push(n+(x?' — '+x:''));};
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});
const errs=[];p.on('pageerror',e=>errs.push(String(e).slice(0,120)));
await p.goto(pathToFileURL(path.resolve('index.html')).href);await p.waitForFunction(()=>window.__AGRI_READY,{timeout:120000});
await p.evaluate(()=>{V03Feed.complete();V03Feed.stop();V03Store.set({tab:'fact',menu:false,panels:{cards:false,stream:true}});});
await p.waitForTimeout(2600);
const d=await p.evaluate(()=>{
  const row=document.querySelector('#facts-in .fact-row');
  const cells=row?[...row.querySelectorAll('span')].map(s=>s.textContent):[];
  const tl=document.getElementById('tlBar').getBoundingClientRect();
  const sk=document.getElementById('mapSk').getBoundingClientRect();
  const st=document.getElementById('streamBox').getBoundingClientRect();
  const cs=sel=>{const e=document.querySelector(sel);return e?getComputedStyle(e):null;};
  return {cells, dateShown:cs('#incoming-date')?.display, streamDate:cs('.fact-stream-date')?.display,
    overlap: !(tl.right < sk.left || tl.left > sk.right || tl.bottom < sk.top || tl.top > sk.bottom),
    tlBottom:Math.round(tl.bottom), streamTop:Math.round(st.top),
    tlBg:cs('.tlbar')?.backgroundColor, fsBg:cs('#facts-in')?.backgroundColor,
    presets:document.querySelectorAll('.tlbar .fact-presets button').length};});
chk('行格式 = 分类/品种/标题', d.cells.length===3 && d.cells[0].length>0 && d.cells[1].length>0 && d.cells[2].length>0, JSON.stringify(d.cells));
chk('顶部日期已去掉', d.streamDate==='none', String(d.streamDate));
chk('无背景', d.tlBg==='rgba(0, 0, 0, 0)' && d.fsBg==='rgba(0, 0, 0, 0)', JSON.stringify([d.tlBg,d.fsBg]));
const gap=await p.evaluate(()=>{const tl=document.getElementById('tlBar').getBoundingClientRect();const sk=document.getElementById('mapSk').getBoundingClientRect();return Math.round(sk.left-tl.right);});
chk('时间轴不压快捷键（留白≥0）', gap>=0, 'gap='+gap);
chk('范围预设仍在', d.presets===4, String(d.presets));
await p.screenshot({path:'test/artifacts/v298.png'});
console.log('PASS('+ok.length+'):');ok.forEach(x=>console.log('  ✓ '+x));
console.log('FAIL('+bad.length+'):');bad.forEach(x=>console.log('  ✗ '+x));
console.log('errors:',errs.length?errs.slice(0,2):'none');
await b.close();process.exit(bad.length?1:0);
