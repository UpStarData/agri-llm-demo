import {chromium} from 'playwright';import {pathToFileURL} from 'node:url';import path from 'node:path';
const ok=[],bad=[];const chk=(n,c,x='')=>{(c?ok:bad).push(n+(x?' — '+x:''));};
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});
const errs=[];p.on('pageerror',e=>errs.push(String(e).slice(0,120)));
await p.goto(pathToFileURL(path.resolve('index.html')).href);await p.waitForFunction(()=>window.__AGRI_READY,{timeout:120000});
await p.evaluate(()=>{V03Feed.complete();V03Feed.stop();V03Store.set({tab:'fact',panels:{cards:true,stream:true}});});
await p.waitForTimeout(2500);

// 1/2 卡片：标签 · 涉及品种 + 标签上色
const card=await p.evaluate(()=>{const c=document.querySelector('.fcards .fcard');if(!c)return null;
  const tag=c.querySelector('.fcard-tag');const v=c.querySelector('.fcard-variety');
  return {text:c.querySelector('.fcard-v12-meta')?.textContent.trim(),tagColor:tag?getComputedStyle(tag).color:null,hasVariety:!!v};});
chk('1 标签 · 涉及品种', !!card && /·/.test(card.text||''), JSON.stringify(card));
chk('2 标签用分类色', !!card && card.tagColor && card.tagColor!=='rgb(0, 0, 0)', card?.tagColor);

// 3 顶部通知不再出现
const noNote=await p.evaluate(()=>document.querySelectorAll('.fresh-note').length);
chk('3 顶部新事实通知已去掉', noNote===0, 'fresh-note='+noNote);

// 4 接入弹幕
const dm=await p.evaluate(async()=>{const f=V03Data.FACTS.find(x=>x.title);
  document.querySelectorAll('#danmakuArrive .dm-row').forEach(n=>n.remove());
  V03Danmaku.arrive(f);await new Promise(r=>setTimeout(r,120));
  const box=getComputedStyle(document.getElementById('danmakuArrive'));
  return {rows:document.querySelectorAll('#danmakuArrive .dm-row').length,
    text:document.querySelector('#danmakuArrive .dm-row')?.textContent.trim(),
    glass:box.backdropFilter||box.webkitBackdropFilter, w:box.width, bottom:box.bottom};});
chk('4 接入弹幕（毛玻璃/文字）', dm.rows===1 && /blur/.test(dm.glass||''), JSON.stringify(dm));

// 5 消亡弹幕：新条目让最老的破碎
const dmp=await p.evaluate(async()=>{const fs=V03Data.FACTS.slice(0,9);
  for(const f of fs){V03Danmaku.perish(f);await new Promise(r=>setTimeout(r,40));}
  await new Promise(r=>setTimeout(r,120));
  const rows=[...document.querySelectorAll('#danmakuPerishList .dm-row')];
  return {rows:rows.length,shattering:rows.filter(r=>r.classList.contains('shatter')).length,
    glass:(()=>{const s=getComputedStyle(document.getElementById('danmakuPerish'));return s.backdropFilter||s.webkitBackdropFilter;})()};});
chk('5 消亡弹幕（破碎离场/毛玻璃）', dmp.shattering>=1 && /blur/.test(dmp.glass||''), JSON.stringify(dmp));

// 7-11 时间轴
const tl=await p.evaluate(async()=>{
  const host=document.getElementById('timeline');
  const w0=host.getBoundingClientRect().width;
  document.querySelector('#mapSk .sk[data-k="time"]').click();
  await new Promise(r=>setTimeout(r,250));
  const opt=[...document.querySelectorAll('.sk-opt')].find(b=>b.textContent.includes('近 1 月'));
  opt.click();
  await new Promise(r=>setTimeout(r,900));
  const on=host.classList.contains('on');
  const ticks=document.querySelectorAll('#tlTicks .tl-tick').length;
  const w1=host.getBoundingClientRect().width;
  const d1=document.getElementById('tlDate').textContent;
  await new Promise(r=>setTimeout(r,1200));
  const d2=document.getElementById('tlDate').textContent;
  const cur=V03Store.state.dayCursor;
  return {w0:Math.round(w0),w1:Math.round(w1),on,ticks,d1,d2,cur,playing:d2>d1};});
chk('7 默认宽 440', tl.w0>=400&&tl.w0<=460, String(tl.w0));
chk('7/9 选范围后展开并自动播放', tl.on && tl.playing, JSON.stringify(tl));
chk('8 刻度=天(日期标签)', /^\d{4}-\d{2}-\d{2}$/.test(tl.d1), tl.d1);
chk('9 红线日期推进 → dayCursor 生效', !!tl.cur, String(tl.cur));
// 10 拖动暂停
const drag=await p.evaluate(async()=>{
  const head=document.getElementById('tlHead'); const r=head.getBoundingClientRect();
  const tr=document.getElementById('tlTrack').getBoundingClientRect();
  head.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:r.left,pointerId:1}));
  await new Promise(r2=>setTimeout(r2,80));
  const x=tr.left+tr.width*0.35;
  head.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:x,pointerId:1}));
  await new Promise(r2=>setTimeout(r2,120));
  const cur1=V03Store.state.dayCursor;
  head.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:x,pointerId:1}));
  await new Promise(r2=>setTimeout(r2,200));
  const paused=document.getElementById('timeline').classList.contains('paused');
  const playVisible=getComputedStyle(document.getElementById('tlPlay')).display!=='none';
  return {cur1,paused,playVisible};});
chk('10 拖动即暂停并定位', drag.paused, JSON.stringify(drag));
chk('11 暂停后出现播放按钮', drag.playVisible, String(drag.playVisible));
await p.screenshot({path:'test/artifacts/v293.png'});
console.log('PASS('+ok.length+'):');ok.forEach(x=>console.log('  ✓ '+x));
console.log('FAIL('+bad.length+'):');bad.forEach(x=>console.log('  ✗ '+x));
console.log('errors:',errs.length?errs.slice(0,2):'none');
await b.close();process.exit(bad.length?1:0);
