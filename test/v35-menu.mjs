import {chromium} from 'playwright';import {pathToFileURL} from 'node:url';import path from 'node:path';
const ok=[],bad=[];const chk=(n,c,x='')=>{(c?ok:bad).push(n+(x?' — '+x:''));};
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});
const errs=[];p.on('pageerror',e=>errs.push(String(e).slice(0,110)));
await p.goto(pathToFileURL(path.resolve('index.html')).href);await p.waitForFunction(()=>window.__AGRI_READY,{timeout:120000});
await p.evaluate(()=>{V03Feed.complete();V03Feed.stop();V03Store.set({menu:true,panels:{cards:false,stream:false}});});
await p.waitForTimeout(900);
const ds=await p.evaluate(()=>{
  const g=n=>{const e=document.querySelector(n);return e?getComputedStyle(e):null;};
  const h=g('.mn-h'), desc=g('.ov-i span'), num=g('.ov-i b'), l1=g('.mn-l1 span'), btn=g('.mn-l3 .l3');
  const region=g('.mn-region');
  return {h:{size:h.fontSize,weight:h.fontWeight,color:h.color,font:h.fontFamily.split(',')[0]},
          desc:{size:desc.fontSize,color:desc.color},
          num:{size:num.fontSize,weight:num.fontWeight,font:num.fontFamily.split(',')[0]},
          l1:{size:l1.fontSize,color:l1.color},
          btn:{size:btn.fontSize},
          region:{h:region.height,placeholder:document.querySelector('.mn-region').placeholder},
          swatches:document.querySelectorAll('.mn-l1 i').length,
          sections:[...document.querySelectorAll('.mn-sec')].length,
          island:!!document.querySelector('#island .isl')};
});
chk('6 三级标题 18/400/#161616', ds.h.size==='18px'&&ds.h.weight==='400'&&ds.h.color==='rgb(22, 22, 22)', JSON.stringify(ds.h));
chk('6 字体 IBM Plex Sans SC', /IBM Plex Sans SC/.test(ds.h.font), ds.h.font);
chk('7 描述 14/#8d8d8d', ds.desc.size==='14px'&&ds.desc.color==='rgb(141, 141, 141)', JSON.stringify(ds.desc));
chk('14 数字 IBM Plex Mono 16 Bold', ds.num.size==='16px'&&ds.num.weight==='700'&&/IBM Plex Mono/.test(ds.num.font), JSON.stringify(ds.num));
chk('8 四级标题 16 且无色块', ds.l1.size==='16px'&&ds.swatches===0, JSON.stringify({l1:ds.l1,sw:ds.swatches}));
chk('10 按钮文字 14', ds.btn.size==='14px', ds.btn.size);
chk('3 区域框高 32 + 提示语', ds.region.h==='32px'&&ds.region.placeholder==='请输入地区', JSON.stringify(ds.region));
chk('2 顶部中间通知已去掉', ds.island===false, String(ds.island));
// 今日新增 +1
const bump=await p.evaluate(async()=>{const before=document.querySelectorAll('#menuBody .ov-i b')[1].textContent;
  V03Intake.note(null,'新闻','测试',null); await new Promise(r=>setTimeout(r,120));
  return {before,after:document.querySelectorAll('#menuBody .ov-i b')[1].textContent};});
chk('2 今日新增事实 +1', bump.before!==bump.after, JSON.stringify(bump));
// 清空区域 → 回全球 2D
const back=await p.evaluate(async()=>{V03Store.set({geo:{level:'L3',focus:'湖南'}});await new Promise(r=>setTimeout(r,400));
  const i=document.querySelector('.mn-region');i.value='';i.oninput();
  await new Promise(r=>setTimeout(r,400));const s=V03Store.state;return {level:s.geo.level,focus:s.geo.focus,mode3d:s.sk.mode3d};});
chk('3 清空回全球 2D', back.level==='L1'&&!back.focus&&back.mode3d===false, JSON.stringify(back));
await p.evaluate(()=>V03Store.set({geo:{level:'L1',focus:null}}));
await p.waitForTimeout(400);
await p.screenshot({path:'test/artifacts/v35-menu.png'});
console.log('PASS('+ok.length+'):');ok.forEach(x=>console.log('  ✓ '+x));
console.log('FAIL('+bad.length+'):');bad.forEach(x=>console.log('  ✗ '+x));
console.log('errors:',errs.length?errs:'none');
await b.close();process.exit(bad.length?1:0);
