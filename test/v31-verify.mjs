import {chromium} from 'playwright';import {pathToFileURL} from 'node:url';import path from 'node:path';
const ok=[];const bad=[];
const chk=(name,cond,extra='')=>{(cond?ok:bad).push(name+(extra?' — '+extra:''));};
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});
const errs=[];p.on('pageerror',e=>errs.push(String(e).slice(0,120)));
await p.goto(pathToFileURL(path.resolve('index.html')).href);await p.waitForFunction(()=>window.__AGRI_READY,{timeout:120000});
await p.evaluate(()=>{V03Feed.complete();V03Feed.stop();V03Store.set({tab:'fact',panels:{cards:true,stream:true}});});
await p.waitForTimeout(800);

// 1) 快捷键三排
const rows=await p.evaluate(()=>[...document.querySelectorAll('#mapSk .sk-row')].map(r=>[r.dataset?0:0,[...r.querySelectorAll('.sk')].map(b=>b.dataset.k||b.textContent.trim())]));
chk('2.13 三排',rows.length===3,'rows='+JSON.stringify(rows));
// 点“近 7 天”
await p.evaluate(()=>{[...document.querySelectorAll('#mapSk .sk-t')].find(b=>b.textContent.includes('近 7 天'))?.click();});
await p.waitForTimeout(400);
chk('2.13 时间档生效',(await p.evaluate(()=>V03Store.state.time))==='7d', 'time='+await p.evaluate(()=>V03Store.state.time));
await p.evaluate(()=>V03Store.set({time:'all'}));
// 视频开关
const liveBtn=await p.evaluate(()=>!!document.querySelector('#mapSk .sk[data-k="live"]'));
chk('2.13 视频开关',liveBtn);

// 2) 3D 海洋色（取球体左侧开阔海面像素）
await p.evaluate(()=>V03Store.set({sk:{mode3d:true},geo:{level:'L1'},panels:{cards:false,stream:false}}));
await p.waitForTimeout(2200);
const ocean=await p.evaluate(()=>{const cv=document.querySelector('.globe-wrap canvas')||document.querySelector('canvas');if(!cv)return null;
  const g=cv.getContext('2d'),w=cv.width,h=cv.height;const out=[];
  for(const [fx,fy] of [[0.30,0.52],[0.70,0.50],[0.50,0.32],[0.50,0.70]]){const d=g.getImageData(Math.round(w*fx),Math.round(h*fy),1,1).data;out.push([d[0],d[1],d[2]].join(','));}
  return out;});
const seaVar=await p.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--globe-sea-2').trim());
chk('2.5 海洋 token',seaVar.toLowerCase()==='#5fbdf2','--globe-sea-2='+seaVar);
const seaStat = await p.evaluate(()=>{
  const cvs=[...document.querySelectorAll('canvas')].map(c=>({c,r:c.getBoundingClientRect()}))
    .filter(o=>o.r.width>200&&o.r.height>200&&getComputedStyle(o.c).visibility!=='hidden'&&o.r.bottom>0)
    .sort((a,b)=>b.r.width*b.r.height-a.r.width*a.r.height);
  const cv=(cvs[0]||{}).c; if(!cv) return null;
  const g=cv.getContext('2d'), w=cv.width, h=cv.height, d=g.getImageData(0,0,w,h).data;
  let blue=0, total=0, sample=null;
  for(let y=0;y<h;y+=6) for(let x=0;x<w;x+=6){
    const i=(y*w+x)*4, r=d[i], gg=d[i+1], bb=d[i+2];
    if(r+gg+bb<40) continue;            // 太空/背景
    total++;
    if(bb>gg && gg>r && bb>140){ blue++; if(!sample) sample=[r,gg,bb]; }
  }
  return {blue,total,ratio:+(blue/Math.max(1,total)).toFixed(3),sample};
});
chk('2.5 球面蓝色海面占比', seaStat && seaStat.ratio>0.05, JSON.stringify(seaStat));
await p.evaluate(()=>V03Store.set({sk:{mode3d:false},geo:{level:'L1'},panels:{cards:true,stream:true}}));

// 3) 关联层：分类两级 + 底部提示移除 + 概览两排
await p.evaluate(()=>V03Store.set({tab:'relation',menu:true}));
await p.waitForTimeout(900);
const rel=await p.evaluate(()=>({
  l1:[...document.querySelectorAll('.mn-rel-l1')].map(n=>n.textContent.trim()),
  types:[...document.querySelectorAll('.mn-rel-types .l3')].map(n=>({t:n.dataset.relType,c:getComputedStyle(n.querySelector('i')).backgroundColor})),
  hintHidden:document.querySelector('.rel-hint')?.hidden ?? null,
  overview:[...document.querySelectorAll('.ov-i')].map(n=>n.textContent.replace(/\s+/g,'')),
}));
chk('5.4 关系两级',rel.l1.length===6,rel.l1.join('/'));
chk('5.4 关系类型已归类',rel.types.length>0&&rel.types.length<=14,'types='+rel.types.map(t=>t.t).join(','));
chk('5.2 底部提示移除',rel.hintHidden===true,'hidden='+rel.hintHidden);
chk('关联层概览三值',rel.overview.length===3,rel.overview.join(' / '));
await p.screenshot({path:'test/artifacts/v31-relation.png'});

// 4) 灵动岛中文分类
await p.evaluate(()=>V03Store.set({tab:'fact'}));
await p.waitForTimeout(300);
const isl=await p.evaluate(()=>{V03Fact.__notifyTest?V03Fact.__notifyTest():null;V03Intake.note(null,'新闻','测试通知',null);return document.querySelector('#island .isl')?.textContent;});
chk('1.3 通知中文分类',/[\u4e00-\u9fa5]/.test(isl||''),isl);

// 5) 悬停暂停自动滚动（真实鼠标移入卡片区）
const sideBox = await p.evaluate(()=>{const el=document.querySelector('.fact-side .fcards')?.parentElement; if(!el)return null; const r=el.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+80};});
if (sideBox) await p.mouse.move(sideBox.x, sideBox.y);
await p.waitForTimeout(300);
const hover=await p.evaluate(async()=>{const el=document.querySelector('.fact-side .fcards')?.parentElement;if(!el)return null;
  const t0=el.scrollTop;await new Promise(r=>setTimeout(r,1500));return {t0,t1:el.scrollTop};});
chk('3.8 悬停暂停',hover&&Math.abs(hover.t1-hover.t0)<2,JSON.stringify(hover));
await p.mouse.move(10,10);

// 6) 证据弹窗
const pop=await p.evaluate(async()=>{const card=document.querySelector('.fcards .fcard');card?.click();await new Promise(r=>setTimeout(r,500));
  const q=document.querySelector('.ev-q');if(!q)return {found:false};q.click();await new Promise(r=>setTimeout(r,200));
  const p=document.querySelector('.ev-pop');return {found:true,open:!!p&&!p.hidden,title:p?.querySelector('.ev-pop-t')?.textContent,size:p?getComputedStyle(p.querySelector('.ev-pop-box')).height:null};});
chk('4.7 证据弹窗',pop?.open===true,JSON.stringify(pop));
await p.screenshot({path:'test/artifacts/v31-evidence.png'});

console.log('PASS('+ok.length+'):'); ok.forEach(x=>console.log('  ✓ '+x));
console.log('FAIL('+bad.length+'):'); bad.forEach(x=>console.log('  ✗ '+x));
console.log('pageerrors:',errs.length?errs:'none');
await b.close();
process.exit(bad.length?1:0);
