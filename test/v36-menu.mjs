import {chromium} from 'playwright';import {pathToFileURL} from 'node:url';import path from 'node:path';
const ok=[],bad=[];const chk=(n,c,x='')=>{(c?ok:bad).push(n+(x?' — '+x:''));};
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});
const errs=[];p.on('pageerror',e=>errs.push(String(e).slice(0,110)));
await p.goto(pathToFileURL(path.resolve('index.html')).href);await p.waitForFunction(()=>window.__AGRI_READY,{timeout:120000});
await p.evaluate(()=>{V03Feed.complete();V03Feed.stop();V03Store.set({menu:true,panels:{stream:true}});});
await p.waitForTimeout(900);
const m=await p.evaluate(()=>{
  const sec=[...document.querySelectorAll('.mn-sec')].map(e=>e.getBoundingClientRect());
  const grp=[...document.querySelectorAll('.mn-grp')].map(e=>e.getBoundingClientRect());
  const l2=[...document.querySelectorAll('.mn-grp .mn-l2')].map(e=>e.getBoundingClientRect());
  const l3=[...document.querySelectorAll('.mn-grp .mn-l3')].map(e=>e.getBoundingClientRect());
  const menu=document.getElementById('menu').getBoundingClientRect();
  const st=document.getElementById('streamBox').getBoundingClientRect();
  const cs=n=>getComputedStyle(document.querySelector(n));
  return {
    blockGaps:sec.slice(1).map((r,i)=>Math.round(r.top-sec[i].bottom)),
    groupGaps:grp.slice(1).map((r,i)=>Math.round(r.top-grp[i].bottom)).slice(0,6),
    labelToChips:l3.length&&l2.length?Math.round(l3[0].top-l2[0].bottom):null,
    dividers:[...document.querySelectorAll('.mn-sec')].filter(e=>parseFloat(getComputedStyle(e).borderBottomWidth)>0).length,
    menuBottom:Math.round(menu.bottom), streamTop:Math.round(st.top),
    accent:cs('.mn-h')?getComputedStyle(document.documentElement).getPropertyValue('--accent').trim():null,
    ocean:getComputedStyle(document.documentElement).getPropertyValue('--ocean').trim(),
    numSize:cs('.ov-i b').fontSize, numWeight:cs('.ov-i b').fontWeight,
    xHover:null
  };
});
chk('1 块间距 30px', m.blockGaps.every(g=>g===30), JSON.stringify(m.blockGaps));
chk('2 组间距 10px', m.groupGaps.every(g=>g>=8&&g<=12), JSON.stringify(m.groupGaps));
chk('2 二级标题紧跟 chips', m.labelToChips!==null&&m.labelToChips<=6, String(m.labelToChips));
chk('无分割线', m.dividers===0, String(m.dividers));
chk('6 菜单与日志贴合', m.streamTop-m.menuBottom===0, `menu.bottom=${m.menuBottom} stream.top=${m.streamTop}`);
chk('5 海洋蓝 #54b5f0', m.ocean.toLowerCase()==='#54b5f0'&&m.accent.toLowerCase()==='#54b5f0', `ocean=${m.ocean} accent=${m.accent}`);
chk('字体: 数字 20/700', m.numSize==='20px'&&m.numWeight==='700', m.numSize+'/'+m.numWeight);
// X 悬停不变色
const xh=await p.evaluate(async()=>{const x=document.querySelector('.menu-close');const before=getComputedStyle(x);
  const b0={bg:before.backgroundColor,c:before.color};x.dispatchEvent(new MouseEvent('mouseover',{bubbles:true}));
  await new Promise(r=>setTimeout(r,150));const a=getComputedStyle(x);
  return {b0,a:{bg:a.backgroundColor,c:a.color}};});
chk('7 X 悬停不变色', xh.b0.bg===xh.a.bg&&xh.b0.c===xh.a.c, JSON.stringify(xh));
await p.screenshot({path:'test/artifacts/v36-menu.png'});
console.log('PASS('+ok.length+'):');ok.forEach(x=>console.log('  ✓ '+x));
console.log('FAIL('+bad.length+'):');bad.forEach(x=>console.log('  ✗ '+x));
console.log('errors:',errs.length?errs:'none');
await b.close();process.exit(bad.length?1:0);
