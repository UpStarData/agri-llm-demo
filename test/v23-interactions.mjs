import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import path from 'node:path';

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(pathToFileURL(path.resolve('index.html')).href);
  await page.waitForFunction(() => window.__AGRI_READY);
  await page.evaluate(() => V03Store.set({ tab: 'relation', panels: { stream: false }, rel: { view: 'geo', level: 'L1' } }));
  await page.waitForFunction(() => V03Relation.debug().intro === -1);
  const target = await page.evaluate(() => {
    const c = echarts.getInstanceByDom(document.querySelector('#relCanvas'));
    const s = c.getModel().getSeries().find(x => x.id === 'relLine'), data = s.getData();
    const nodes = c.getOption().series.find(x => x.id === 'relNode').data.map(x => c.convertToPixel({geoIndex:0},x.value));
    for (let i = 0; i < data.count(); i++) {
      if(data.getRawDataItem(i).lineStyle.opacity<.08)continue;
      const curve = data.getItemGraphicEl(i)?.childAt(0), q = curve?.shape;
      if (!q) continue;
      const p = curve.transformCoordToGlobal((q.x1 + 2*q.cpx1 + q.x2)/4,(q.y1 + 2*q.cpy1 + q.y2)/4);
      if (p[0] < 100 || p[0] > 850 || p[1] < 150 || p[1] > 650 || nodes.some(n => Math.hypot(n[0]-p[0],n[1]-p[1])<25)) continue;
      const r = c.getDom().getBoundingClientRect(); return { id: data.getRawDataItem(i).id, x:r.x+p[0], y:r.y+p[1] };
    }
    throw Error('No visible relation midpoint');
  });
  await page.mouse.click(target.x, target.y);
  const selected = await page.evaluate(() => ({ kind:V03Store.state.rel.kind, id:V03Store.state.rel.sel }));
  assert.deepEqual(selected, {kind:'relation', id:target.id}, 'clicking an actual visible relationship must open its detail');
  assert(await page.locator('#drawerStack').innerText().then(t => t.includes('关系详情')));
  console.log('Visible relationship click opens real relation detail', target.id);
  await page.evaluate(()=>V03Store.set({rel:{sel:null,kind:null,stack:[]}}));
 // 流动点沿航线移动，某一瞬间可能不在可点区域内：轮询到出现为止，而不是一次采样就判失败。
 let particle=null;
 for(let _i=0;_i<30&&!particle;_i++){particle=await page.evaluate(()=>{const c=echarts.getInstanceByDom(document.querySelector('#relCanvas')),rect=c.getDom().getBoundingClientRect();for(const s of c.getModel().getSeries().filter(s=>s.id.startsWith('relFlow-'))){const d=s.getData();for(let i=0;i<d.count();i++){const g=d.getItemGraphicEl(i),h=g?.childAt(1);if(!h||h.ignore||!h.scaleX)continue;const p=h.transformCoordToGlobal(0,0);if(p[0]<30||p[0]>850||p[1]<30||p[1]>600)continue;const heads=c.getModel().getSeries().filter(s=>s.id.startsWith('relFlow-')).flatMap(s=>Array.from({length:s.getData().count()},(_,j)=>s.getData().getItemGraphicEl(j)?.childAt(1))).filter(h=>h&&!h.ignore).map(h=>({h,p:h.transformCoordToGlobal(0,0)}));if(heads.some(other=>other.h!==h&&Math.hypot(other.p[0]-p[0],other.p[1]-p[1])<18))continue;const node=c.getDom();for(const type of ['pointerdown','click'])node.dispatchEvent(new MouseEvent(type,{bubbles:true,clientX:rect.x+p[0],clientY:rect.y+p[1]}));return {id:d.getRawDataItem(i).relationId,selected:V03Store.state.rel.sel,kind:V03Store.state.rel.kind};}}return null;});
  if(!particle)await page.waitForTimeout(400);}
 assert(particle,'No moving symbol appeared within 12s');
 assert.equal(particle.selected,particle.id);assert.equal(particle.kind,'relation');

 console.log('Visible moving symbol opens its relation detail',particle.id);
} finally { await browser.close(); }
