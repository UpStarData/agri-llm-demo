import {chromium} from 'playwright';import {pathToFileURL} from 'node:url';import path from 'node:path';
const ok=[],bad=[];const chk=(n,c,x='')=>{(c?ok:bad).push(n+(x?' — '+x:''));};
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});
const errs=[];p.on('pageerror',e=>errs.push(String(e).slice(0,140)));
await p.goto(pathToFileURL(path.resolve('index.html')).href);await p.waitForFunction(()=>window.__AGRI_READY,{timeout:120000});
await p.evaluate(()=>{V03Feed.complete();V03Feed.stop();V03Store.set({tab:'fact',panels:{cards:false,stream:false}});});
await p.waitForTimeout(2500);
const t=await p.evaluate(()=>{
  const term=document.getElementById('factTerminal');
  const inRows=document.querySelectorAll('#facts-in .fact-row').length;
  const outRows=document.querySelectorAll('#facts-out .fact-row').length;
  const r=term?term.getBoundingClientRect():null;
  const order=[...document.querySelectorAll('.fact-streams .fact-stream')].map(x=>x.id);
  return {exists:!!term,rect:r?{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}:null,
    inRows,outRows,inDate:document.getElementById('incoming-date')?.textContent,
    outDate:document.getElementById('outgoing-date')?.textContent,
    order, todayPressed:document.getElementById('fact-today')?.getAttribute('aria-pressed'),
    axisTicks:document.querySelectorAll('.fact-axis-tick').length};});
chk('组件已挂载', t.exists, JSON.stringify(t.rect));
chk('呼出在上/呼入在下', JSON.stringify(t.order)==='["facts-out","facts-in"]', JSON.stringify(t.order));
chk('呼入有真实数据', t.inRows>0 || t.outRows>0, `in=${t.inRows} out=${t.outRows} inDate=${t.inDate} outDate=${t.outDate}`);
chk('日期=今天且今天高亮', !!t.inDate && t.todayPressed==='true', `${t.inDate} pressed=${t.todayPressed}`);
chk('轴有刻度', t.axisTicks>5, String(t.axisTicks));
// 选近 7 天 → 自动播放 & 地图跟随
const play=await p.evaluate(async()=>{
  [...document.querySelectorAll('[data-fact-range]')].find(b=>b.dataset.factRange==='7').click();
  await new Promise(r=>setTimeout(r,600));
  const d1=document.getElementById('fact-date').value, c1=V03Store.state.dayCursor;
  await new Promise(r=>setTimeout(r,1500));
  const d2=document.getElementById('fact-date').value, c2=V03Store.state.dayCursor;
  return {d1,c1,d2,c2,playing:document.getElementById('fact-play').textContent};});
chk('近7天自动播放并推进', play.d1!==play.d2, JSON.stringify(play));
chk('地图 dayCursor 跟随', !!play.c1||!!play.c2, JSON.stringify({c1:play.c1,c2:play.c2}));
await p.screenshot({path:'test/artifacts/v294.png'});
console.log('PASS('+ok.length+'):');ok.forEach(x=>console.log('  ✓ '+x));
console.log('FAIL('+bad.length+'):');bad.forEach(x=>console.log('  ✗ '+x));
console.log('errors:',errs.length?errs.slice(0,2):'none');
await b.close();process.exit(bad.length?1:0);
