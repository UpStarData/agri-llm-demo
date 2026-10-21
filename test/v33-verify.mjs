import {chromium} from 'playwright';import {pathToFileURL} from 'node:url';import path from 'node:path';
const ok=[],bad=[];const chk=(n,c,x='')=>{(c?ok:bad).push(n+(x?' — '+x:''));};
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});
const errs=[];p.on('pageerror',e=>errs.push(String(e).slice(0,120)));
await p.goto(pathToFileURL(path.resolve('index.html')).href);await p.waitForFunction(()=>window.__AGRI_READY,{timeout:120000});
await p.evaluate(()=>{V03Feed.complete();V03Feed.stop();V03Store.set({tab:'fact',panels:{cards:true,stream:true}});});
await p.waitForTimeout(900);

// 3.4 触底：菜单底部随日志开闭
const dock=await p.evaluate(()=>{const m=document.getElementById('menu');const open=getComputedStyle(m).bottom;
  document.getElementById('streamBox').classList.contains('on');return {bottomOpen:open};});
await p.evaluate(()=>V03Store.set({panels:{stream:false}}));await p.waitForTimeout(400);
const dock2=await p.evaluate(()=>getComputedStyle(document.getElementById('menu')).bottom);
await p.evaluate(()=>V03Store.set({panels:{stream:true}}));await p.waitForTimeout(300);
chk('3.4 菜单触底随日志', dock.bottomOpen!==dock2, 'log开='+dock.bottomOpen+' log关='+dock2);

// 3.9 核心摘要（价格类 + 新闻类）
const core=await p.evaluate(async()=>{
  V03Store.set({time:'all',q:'',catKeys:null});
  await new Promise(r=>setTimeout(r,500));
  const out=[];
  for (const card of document.querySelectorAll('.fcards .fcard')) {
    const c=card.querySelector('.fcard-core'); if(!c) continue;
    const lines=[...c.querySelectorAll('.fc-line')].map(l=>l.textContent.trim());
    if(!out.length) out.push({lines});
    if(out.length>=2) break;
  }
  return out;
});
chk('3.9 核心摘要三行', core.length>0 && core[0].lines.length===3, JSON.stringify(core[0]||null));

// 3.6 单例替换：同一 frame 节点、内容滑动
const slide=await p.evaluate(async()=>{
  const cards=[...document.querySelectorAll('.fcards .fcard')];
  cards[0].click(); await new Promise(r=>setTimeout(r,600));
  const frame1=document.querySelector('.drawer-single'); const id1=frame1?.dataset.key;
  cards[1].click(); await new Promise(r=>setTimeout(r,120));
  const frame2=document.querySelector('.drawer-single');
  const slides=document.querySelectorAll('.drawer-stage .drawer-slide').length;
  const hasOut=!!document.querySelector('.drawer-slide.out');
  await new Promise(r=>setTimeout(r,500));
  return {sameNode:frame1===frame2, id1, id2:frame2?.dataset.key, slidesAtMid:slides, animated:hasOut,
          slidesAfter:document.querySelectorAll('.drawer-stage .drawer-slide').length};
});
chk('3.6 详情单例滑动替换', slide.sameNode && slide.animated && slide.slidesAfter===1, JSON.stringify(slide));
await p.screenshot({path:'test/artifacts/v33-detail.png'});

// 4.11 形成过程弹窗内容
const form=await p.evaluate(async()=>{const btn=document.querySelector('#toLog');btn?.click();await new Promise(r=>setTimeout(r,250));
  const pop=document.querySelector('.ev-pop');return {open:!!pop&&!pop.hidden, body:pop?.querySelector('.ev-pop-body')?.textContent?.slice(0,120)};});
chk('4.11 形成过程弹窗内容', form.open && /首次采集时间/.test(form.body||''), JSON.stringify(form));
await p.screenshot({path:'test/artifacts/v33-formation.png'});
await p.evaluate(()=>{document.querySelector('.ev-pop')?.setAttribute('hidden','');});

// 1.4 灵动岛点击 → 打开事实详情
const island=await p.evaluate(async()=>{
  V03Store.set({factId:null});
  const f=V03Data.FACTS.find(x=>x.title&&x.lng!=null);
  V03Intake.note(null,'新闻',f.title,f.id);
  await new Promise(r=>setTimeout(r,150));
  const node=document.querySelector('#island .isl'); node?.click();
  await new Promise(r=>setTimeout(r,400));
  return {shown:!!node, factId:V03Store.state.factId, expect:f.id, drawer:!!document.querySelector('.drawer-single')};
});
chk('1.4 通知点击开详情', island.factId===island.expect && island.drawer, JSON.stringify(island));

// 3.1 侧栏 X
const xb=await p.evaluate(()=>{const x=document.querySelector('.drawer-x');return {has:!!x, text:x?.textContent};});
chk('3.1 侧栏 X 按钮', xb.has, JSON.stringify(xb));
await p.evaluate(()=>V03Store.set({factId:null}));

// 3.7/3.8 滚动：先归位指针与面板，再测自动滚动 / 悬停暂停
await p.mouse.move(2, 2);
await p.evaluate(()=>V03Store.set({factId:null, panels:{cards:true,stream:true}}));
await p.waitForTimeout(3200);
const scroll=await p.evaluate(async()=>{
  const el=document.querySelector('.fact-side .fs-body')||document.querySelector('.fact-side .fcards')?.parentElement;
  if(!el) return null;
  const a=el.scrollTop; await new Promise(r=>setTimeout(r,1600));
  return {from:a,to:el.scrollTop,hasAuto:!!el.__auto,sh:el.scrollHeight,ch:el.clientHeight};
});
chk('3.7 自动滚动在跑', scroll && scroll.to>scroll.from, JSON.stringify(scroll));
const box=await p.evaluate(()=>{const el=document.querySelector('.fact-side .fs-body')||document.querySelector('.fact-side .fcards')?.parentElement;const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+60};});
await p.mouse.move(box.x,box.y); await p.waitForTimeout(400);
const hov=await p.evaluate(async()=>{const el=document.querySelector('.fact-side .fs-body')||document.querySelector('.fact-side .fcards')?.parentElement;
  const a=el.scrollTop;await new Promise(r=>setTimeout(r,1600));return {from:a,to:el.scrollTop,hover:el.__auto?.hover};});
chk('3.8 悬停暂停', hov && Math.abs(hov.to-hov.from)<2 && hov.hover===true, JSON.stringify(hov));
await p.mouse.move(2,2);

console.log('PASS('+ok.length+'):');ok.forEach(x=>console.log('  ✓ '+x));
console.log('FAIL('+bad.length+'):');bad.forEach(x=>console.log('  ✗ '+x));
console.log('errors:',errs.length?errs:'none');
await b.close();process.exit(bad.length?1:0);
