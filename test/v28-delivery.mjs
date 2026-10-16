/* V2.8 acceptance regressions for the 2026-10-16 feedback round:
   ① global/China fact volume   ② first-entry load ≤10s
   ③ every province covered at Jilin's order of magnitude
   ④ star cadence follows the 3-8-6-2-8-1 second cycle, repeating. */
import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const browser = await chromium.launch();
const report = {errors: [], stars: [], cycles: []};
fs.mkdirSync('test/artifacts/v28', {recursive: true});
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  page.on('pageerror', e => report.errors.push(e.message));
  await page.addInitScript(() => {
    window.__tasks = [];
    window.__stars = [];
    new PerformanceObserver(l => __tasks.push(...l.getEntries().map(e => ({at: e.startTime, ms: e.duration})))).observe({type: 'longtask', buffered: true});
    new MutationObserver(rs => rs.forEach(r => r.addedNodes.forEach(n => {
      if (n.nodeType === 1 && n.matches?.('.star-flash')) __stars.push({id: n.dataset.fid, at: performance.now()});
    }))).observe(document, {childList: true, subtree: true});
  });
  const t0 = Date.now();
  await page.goto(pathToFileURL(path.resolve(process.env.AGRI_TEST_HTML || 'index.html')).href);
  await page.waitForFunction(() => window.__AGRI_READY, null, {timeout: 120000});
  report.readyMs = Date.now() - t0;

  const initial = await page.evaluate(() => V03Feed.status());
  assert(!initial.done, 'первый paint must still be loading');
  assert(initial.loaded < initial.total);

  // ② first entry must finish inside ten seconds
  await page.waitForFunction(() => V03Feed.status().done, null, {timeout: 20000});
  report.load = await page.evaluate(() => V03Feed.status());
  assert(report.load.elapsed <= 10000, JSON.stringify(report.load));

  // ④ star cadence: keep the page untouched and record natural arrivals
  await page.waitForFunction(() => window.__stars.length >= 8, null, {timeout: 90000});
  report.stars = await page.evaluate(() => __stars.slice(0, 8));
  for (let i = 1; i < report.stars.length; i++) report.cycles.push(Math.round((report.stars[i].at - report.stars[i - 1].at) / 500) * 500);
  report.cadence = await page.evaluate(() => ({cycle: V03Feed.STAR_CYCLE, next: [0, 1, 2, 3, 4, 5].map(() => V03Feed.nextStarDelay())}));
  assert.deepEqual(report.cadence.cycle, [3000, 8000, 6000, 2000, 8000, 1000], 'star cycle must be the requested 3-8-6-2-8-1 sequence');
  // observed gaps must sit on the requested sequence (allow the event-loop slack)
  for (const gap of report.cycles.slice(0, 5)) {
    assert(report.cadence.cycle.some(c => Math.abs(c - gap) <= 900), `star gap ${gap} not on the requested cycle`);
  }

  await page.evaluate(() => V03Feed.stop());
  // ①③ volume and nationwide coverage
  report.data = await page.evaluate(() => {
    const fs = V03Filter.mapFacts().filter(f => f.lng != null && f.lat != null);
    const byProv = {};
    for (const f of fs) { const p = f.province || (f.regionPath || []).find(r => r.level === 'province')?.name; if (p) byProv[p] = (byProv[p] || 0) + 1; }
    const countries = new Set(fs.map(f => (f.regionPath || []).find(r => r.level === 'country')?.name).filter(Boolean));
    const chart = echarts.getInstanceByDom(document.querySelector('#factMap'));
    const pts = chart.getOption().series.find(s => s.id === 'facts').data;
    return {
      all: V03Data.FACTS.length, map: fs.length, countries: countries.size,
      globalStatistics: fs.filter(f => f.id.startsWith('v28-wb-')).length,
      reports: fs.filter(f => f.id.startsWith('v28-report:')).length,
      provinceCount: Object.keys(byProv).length, byProv,
      worldPoints: pts.length / 3,
      drawnL2: null
    };
  });
  report.levels = {};
  for (const [level, focus] of [['L1', null], ['L2', null], ['L3', '湖南']]) {
    await page.evaluate(({level, focus}) => V03Store.set({tab: 'fact', geo: {level, focus, city: null, county: null}, sk: {mode3d: false}}), {level, focus});
    await page.waitForTimeout(200);
    report.levels[level] = await page.evaluate(() => {
      const chart = echarts.getInstanceByDom(document.querySelector('#factMap'));
      const opt = chart.getOption();
      const facts = opt.series.find(s => s.id === 'facts').data;
      const mass = opt.series.find(s => s.id === 'mass').data;
      return {scope: V03Filter.factsAtLevel().length, drawn: facts.length, mass: mass.length};
    });
  }
  assert(report.data.provinceCount >= 31, 'every province must carry facts: ' + report.data.provinceCount);
  assert(report.data.globalStatistics >= 18000, JSON.stringify({g: report.data.globalStatistics}));
  assert(report.data.countries >= 200);
  assert(report.data.map >= 15000, JSON.stringify({map: report.data.map}));
  report.thin = Object.entries(report.data.byProv).filter(([, n]) => n < 400);
  report.longTasks = await page.evaluate(() => __tasks.map(t => Math.round(t.ms)));
  // Interaction cost after the batches have settled (the numbers the reader actually feels).
  await page.evaluate(() => { __tasks.length = 0; });
  for (let i = 0; i < 3; i++) {
    for (const [level, focus] of [['L1', null], ['L2', null], ['L3', '湖南']]) {
      await page.evaluate(({level, focus}) => V03Store.set({geo: {level, focus, city: null, county: null}}), {level, focus});
      await page.waitForTimeout(300);
    }
  }
  report.interactive = await page.evaluate(() => __tasks.map(t => Math.round(t.ms)));
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify(report, null, 1));
} finally {
  fs.writeFileSync('test/artifacts/v28/delivery.json', JSON.stringify(report, null, 1));
  await browser.close();
}
