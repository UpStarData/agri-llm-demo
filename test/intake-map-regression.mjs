import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const browser = await chromium.launch();
const report = {};
const out = path.resolve('test/artifacts/llm291');
fs.mkdirSync(out, { recursive: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve('index.html')).href);
  await page.waitForFunction(() => window.__AGRI_READY);
  await page.evaluate(() => { V03Feed.complete(); V03Feed.stop(); V03Store.set({ time:'all', panels: { stream: false }, geo: { level: 'L3', focus: '湖南' } }); });
  const inspectHalos = () => page.evaluate(() => {
    const c = echarts.getInstanceByDom(document.querySelector('#factMap'));
    const data = c.getOption().series.find(s => s.id === 'halo').data;
    const xy = data.map(h => c.convertToPixel({ geoIndex: 0 }, h.value));
    return { count: data.length, maxDiameter: Math.max(0, ...data.map(h => h.symbolSize)),
      minSpacing: Math.min(Infinity, ...xy.flatMap((a, i) => xy.slice(i + 1).map(b => Math.hypot(a[0] - b[0], a[1] - b[1])))) };
  });
  await page.waitForFunction(()=>echarts.getInstanceByDom(document.querySelector('#factMap')).getOption().series.find(s=>s.id==='halo').data.length>0,{},{timeout:12000});
  report.coldHunan = await inspectHalos();
  assert(report.coldHunan.count > 0 && report.coldHunan.maxDiameter <= 100 && report.coldHunan.minSpacing >= 25, JSON.stringify(report.coldHunan));
  await page.screenshot({ path: path.join(out, 'fact-hunan.png') });
  const factGeo = await page.evaluate(() => {
    const c = echarts.getInstanceByDom(document.querySelector('#factMap')), g = c.getOption().geo[0];
    return { map: g.map, center: g.center, zoom: g.zoom, point: c.convertToPixel({ geoIndex: 0 }, [112.98, 28.19]) };
  });
  await page.evaluate(() => V03Store.set({ geo: { level: 'L1', focus: null } }));
  await page.evaluate(() => V03Store.set({ geo: { level: 'L3', focus: '湖南' } }));
  report.returnHunan = await inspectHalos();
  assert(report.returnHunan.maxDiameter <= 100 && report.returnHunan.minSpacing >= 25);

  // Use the production stream event, not a test-only DOM insertion.
  const factId = await page.evaluate(() => {
    const c = echarts.getInstanceByDom(document.querySelector('#factMap'));
    const f = V03Filter.mappable(V03Filter.factsAtLevel()).find(f => !V03Store.state.newFacts.includes(f.id) && (() => {
      const p = c.convertToPixel({ geoIndex: 0 }, [f.lng, f.lat]); return p[0] > 50 && p[0] < 850 && p[1] > 50 && p[1] < 650;
    })());
    V03Store.emit('stream:line', { fact: f, level: 'bright' }); return f.id;
  });
  await page.waitForFunction(() => document.querySelector('#factSide .fresh-note.on') && document.querySelector('#factMapBox .star-flash'));
  assert.equal(await page.locator('#sideBody .fcard').first().getAttribute('data-fid'), factId);
  await page.screenshot({ path: path.join(out, 'fact-intake.png') });
  await page.waitForTimeout(4300);
  assert.equal(await page.locator('#factSide .fresh-note').count(), 0);
  assert.equal(await page.locator('#factMapBox .star-flash').count(), 0);

  // The real insertion boundary must produce the same presentation and dedupe repeats.
  report.ingestion = await page.evaluate(() => {
    const old = V03Data.factById(V03Store.state.newFacts.at(-1));
    const fact = { ...old, id: 'regression:arrival', title: '回归检查：新增农业事实' };
    const first = V03Data.ingest({ facts: [fact] });
    const second = V03Data.ingest({ facts: [fact] });
    return { added: first.facts.length, repeated: second.facts.length };
  });
  assert.deepEqual(report.ingestion, { added: 1, repeated: 0 });
  await page.waitForFunction(() => document.querySelector('#factSide .fresh-note.on')?.textContent.includes('新增农业事实'));
  assert.equal(await page.locator('#sideBody .fcard').first().getAttribute('data-fid'), 'regression:arrival');

  await page.evaluate(() => V03Store.set({ tab: 'relation', rel: { view: 'geo', level: 'L3', focus: '湖南' } }));
  assert(await page.evaluate(() => V03Relation.debug().intro >= 0), 'first Hunan visit did not animate');
  report.relHunan = await page.evaluate(() => {
    const c = echarts.getInstanceByDom(document.querySelector('#relCanvas')), g = c.getOption().geo[0];
    return { map: g.map, center: g.center, zoom: g.zoom, point: c.convertToPixel({ geoIndex: 0 }, [112.98, 28.19]) };
  });
  assert.deepEqual(report.relHunan, factGeo);
  await page.waitForTimeout(3600);
  await page.locator('#relBody .rel-card').first().click();
  assert.equal(await page.evaluate(() => V03Relation.debug().intro), -1, 'drawer restarted map intro');
  await page.evaluate(() => V03Store.set({ rel: { stack: [], sel: null, kind: null, level: 'L1', focus: null } }));
  await page.waitForTimeout(3600);
  report.routes = await page.evaluate(() => {
    const c = echarts.getInstanceByDom(document.querySelector('#relCanvas'));
    const data = c.getOption().series.find(s => s.id === 'relLine').data;
    const lanes = {};
    for (const l of data) { const key = l.coords.map(p => p.map(x => x.toFixed(3)).join(',')).join(':') + ':' + l.lineStyle.curveness; lanes[key] = (lanes[key] || 0) + 1; }
    return { count: data.length, ids: new Set(data.map(l => l.id)).size, curves: new Set(data.map(l => l.lineStyle.curveness)).size, maxOverlap: Math.max(...Object.values(lanes)), silent: c.getOption().series.find(s => s.id === 'relLine').silent };
  });
  assert(report.routes.count <= 100 && report.routes.ids === report.routes.count && report.routes.curves >= 3 && report.routes.maxOverlap === 1, JSON.stringify(report.routes));
  assert.equal(report.routes.silent, true, 'background lines intercept geographic navigation');
  report.dataCleanup = await page.evaluate(() => V03Data.relationAudit);
  assert(report.dataCleanup.unsupportedCrossBorder > 0, 'unrelated evidence still creates cross-border market routes');
  assert(await page.evaluate(() => !V03Data.RELATIONS.some(r => r.id === 'r:e:base:ci-abidjan|FLOWS_INTO|e:mkt-hongxing')));
  await page.screenshot({ path: path.join(out, 'relation-world.png') });
  await page.evaluate(() => {
    const c = echarts.getInstanceByDom(document.querySelector('#relCanvas'));
    const s = c.getModel().getSeries().find(s => s.id.startsWith('relFlow-') && s.getData().count());
    const element = s.getData().getItemGraphicEl(0);
    window.__flowCheck = { id: s.id, element, animator: element.childAt(1).animators[0] };
  });
  await page.locator('#relBody .rel-card').first().click();
  await page.evaluate(() => V03Store.set({ rel: { sel: null, kind: null, stack: [] } }));
  report.flowPreserved = await page.evaluate(() => {
    const c = echarts.getInstanceByDom(document.querySelector('#relCanvas')), before = window.__flowCheck;
    const s = c.getModel().getSeries().find(s => s.id === before.id), el = s.getData().getItemGraphicEl(0);
    return el === before.element && el.childAt(1).animators[0] === before.animator;
  });
  assert(report.flowPreserved, 'opening/closing a drawer replaced the running flow animation');
  // Click an unobstructed map region through the real canvas, then drill into Hunan.
  for (const [point, expected] of [[[103, 36], 'L2'], [[111, 28], 'L3']]) {
    const xy = await page.evaluate(point => {
      const c = echarts.getInstanceByDom(document.querySelector('#relCanvas'));
      const p = c.convertToPixel({ geoIndex: 0 }, point), r = c.getDom().getBoundingClientRect();
      return [r.x + p[0], r.y + p[1]];
    }, point);
    await page.mouse.click(...xy);
    await page.waitForFunction(expected => V03Store.state.rel.level === expected, expected);
    await page.waitForTimeout(400);
  }
  await page.evaluate(() => V03Store.set({ rel: { level: 'L3', focus: '湖南' } }));
  assert.equal(await page.evaluate(() => V03Relation.debug().intro), -1, 'returning to a visited view replays intro');
  await page.evaluate(() => V03Store.set({ rel: { view: 'globe' } }));
  assert(await page.evaluate(() => V03Relation.debug().globe.intro >= 0));
  await page.waitForTimeout(3800);
  await page.locator('#relBody .rel-card').first().click();
  assert(await page.evaluate(() => V03Relation.debug().globe.intro > 3500));
  await page.evaluate(() => V03Store.set({ rel: { view: 'geo', level: 'L3', stack: [], sel: null, kind: null } }));
  await page.evaluate(() => V03Relation.notifyNewest());
  await page.waitForFunction(() => document.querySelector('#relSide .fresh-note.on')?.textContent.includes('新本体'));
  assert(await page.locator('#layer-relation .star-flash').count() > 0);
  assert(await page.locator('#relBody .rel-card').first().evaluate(e => e.classList.contains('is-fresh')));
  await page.screenshot({ path: path.join(out, 'relation-intake.png') });
  await page.evaluate(() => {
    const base = V03Filter.objects(V03Store.state).find(o => o.domain === 'commodity');
    V03Data.ingest({ objects: [{ ...base, id: 'regression:ontology', name: '回归检查：新辣椒本体' }] });
  });
  await page.waitForFunction(() => document.querySelector('#relSide .fresh-note.on')?.textContent.includes('新辣椒本体'));
  assert.equal(await page.locator('#relBody .rel-card').first().getAttribute('data-obj'), 'regression:ontology');

  // New facts without extracted objects must still light a star on the relation map.
  await page.evaluate(id => V03Store.emit('stream:line', { fact: V03Data.factById(id), level: 'bright' }), factId);
  assert(await page.locator('#relMain .star-flash').count() > 0);
  for (const tab of ['fact', 'relation']) {
    await page.evaluate(tab => {
      V03Store.set({ tab, sk: { mode3d: true }, rel: { view: 'globe' } });
      (tab === 'fact' ? V03Fact : V03Relation).notifyNewest();
    }, tab);
    await page.waitForFunction(tab => document.querySelector(tab === 'fact' ? '#factMapBox .star-flash' : '#relMain .star-flash'), tab);
    assert(await page.locator(tab === 'fact' ? '#factMapBox .star-flash' : '#relMain .star-flash').first().isVisible());
  }
  await page.evaluate(() => V03Store.set({ sk: { mode3d: false }, rel: { view: 'geo' } }));

  report.data = await page.evaluate(() => ({ total: V03Data.FACTS.filter(f => !f.id.startsWith('regression:')).length, added: V03Data.FACTS.filter(f => f.provenanceMeta?.sourcePlugin === 'global-agri-enrichment').length,
    continents: [...new Set(V03Data.FACTS.map(f => f.provenanceMeta?.continent).filter(Boolean))],
    themes: ['车厘子', '樱桃', '辣椒', '天气', '运输'].map(w => [w, V03Data.FACTS.filter(f => (f.title + f.summary).includes(w)).length]) }));
  assert(report.data.added >= 200 && report.data.continents.length >= 6, JSON.stringify(report.data));
  assert(report.data.themes.every(([, n]) => n > 0));
  await page.evaluate(() => { window.__perf = []; new PerformanceObserver(l => window.__perf.push(...l.getEntries().map(e => e.duration))).observe({ type: 'longtask', buffered: false }); });
  for (const level of ['L1', 'L2', 'L3']) {
    await page.evaluate(level => V03Store.set({ tab: 'fact', geo: { level, focus: level === 'L3' ? '湖南' : null } }), level);
    await page.waitForTimeout(100);
  }
  report.performance = await page.evaluate(() => ({ longTasks: window.__perf, max: Math.max(0, ...window.__perf) }));
  assert(report.performance.max < 250, JSON.stringify(report.performance));
  report.frames = await page.evaluate(async () => {
    const dt = [], durations = []; let last = performance.now(), active = true;
    function frame(now) { dt.push(now - last); last = now; if (active) requestAnimationFrame(frame); }
    requestAnimationFrame(frame);
    for (const tab of ['fact', 'relation']) {
      for (const level of ['L1', 'L2', 'L3']) {
        const t = performance.now();
        V03Store.set(tab === 'fact' ? { tab, geo: { level, focus: level === 'L3' ? '湖南' : null } }
          : { tab, rel: { view: 'geo', level, focus: level === 'L3' ? '湖南' : null } });
        durations.push(performance.now() - t);
        const c = echarts.getInstanceByDom(document.querySelector(tab === 'fact' ? '#factMap' : '#relCanvas'));
        for (let i = 0; i < 15; i++) {
          c.dispatchAction({ type: 'geoRoam', componentType: 'geo', geoIndex: 0, dx: 2, dy: 1 });
          await new Promise(resolve => requestAnimationFrame(resolve));
        }
      }
    }
    active = false;
    const sorted = dt.slice().sort((a, b) => a - b);
    return { samples: dt.length, p95: sorted[Math.floor(sorted.length * .95)], max: Math.max(...dt), switchMax: Math.max(...durations) };
  });
  assert(report.frames.p95 < 100 && report.frames.max < 250 && report.frames.switchMax < 200, JSON.stringify(report.frames));
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify(report, null, 2));
} finally {
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
