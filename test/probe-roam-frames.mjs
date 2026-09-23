#!/usr/bin/env node
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = process.argv.find(arg => /^https?:|^file:/.test(arg)) || pathToFileURL(path.join(root, 'index.html')).href;
const massOff = process.argv.includes('--mass-off');
const influenceOff = process.argv.includes('--influence-off');
const panOnly = process.argv.includes('--pan-only');
const zoomOnly = process.argv.includes('--zoom-only');
const prewarm = process.argv.includes('--prewarm');
const video = process.argv.includes('--video');
const screenshot = process.argv.includes('--screenshot');
const singleRound = process.argv.includes('--single-round');
const assertVisual = process.argv.includes('--assert-visual');
const artifactDir = path.join(root, 'test/artifacts');
if (video || screenshot) await mkdir(artifactDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2,
  ...(video ? { recordVideo: { dir: artifactDir, size: { width: 1440, height: 900 } } } : {}) });
await page.goto(url);
await page.waitForFunction(() => window.__AGRI_READY === true);
await page.waitForTimeout(1000);
if (prewarm) console.log('PREWARM', await page.evaluate(() => {
  const t = performance.now();
  const n = V03Mass.sample('L2', '湖南', V03Filter.FACT_ITEMS.map(x => x.key)).length;
  return { n, ms: performance.now() - t };
}));
if (massOff || influenceOff) {
  await page.evaluate(({ massOff, influenceOff }) => V03_DEBUG.set({ sk: {
    ...(massOff ? { mass: false } : {}), ...(influenceOff ? { influence: false } : {})
  } }), { massOff, influenceOff });
  await page.evaluate(() => { V03_DEBUG.set({ theme: 'light' }); V03_DEBUG.set({ theme: 'dark' }); });
  await page.waitForTimeout(300);
}

await page.evaluate(() => {
  const chart = echarts.getInstanceByDom(document.getElementById('factMap'));
  const ids = ['mass', 'halo', 'ripple', 'facts', 'freshFlash'];
  window.__ROAM_TRACE = { frames: [], events: 0, rendered: 0, started: performance.now() };
  const geoModel = chart.getModel().getComponent('geo', 0);
  const geoGroup = chart.getViewOfComponentModel(geoModel).group.childAt(0);
  if (!geoGroup || !geoGroup.getComputedTransform()) throw new Error('Map visual transform unavailable');
  const anchorSeries = chart.getModel().getSeries().find(s => s.id === 'facts');
  const anchorElement = anchorSeries.getData().getItemGraphicEl(0);
  const initialMap = geoGroup.getComputedTransform().slice();
  const initialPoint = anchorElement.transformCoordToGlobal(0, 0);
  const initialLevel = V03_DEBUG.state().geo.level;
  const det = initialMap[0] * initialMap[3] - initialMap[1] * initialMap[2];
  const dx = initialPoint[0] - initialMap[4], dy = initialPoint[1] - initialMap[5];
  const localPoint = [(initialMap[3] * dx - initialMap[2] * dy) / det,
    (-initialMap[1] * dx + initialMap[0] * dy) / det];
  chart.on('georoam', () => window.__ROAM_TRACE.events++);
  chart.on('rendered', () => window.__ROAM_TRACE.rendered++);
  const tick = () => {
    const now = performance.now();
    const sample = { t: now - window.__ROAM_TRACE.started, level: V03_DEBUG.state().geo.level, rows: [] };
    const matrix = geoGroup.getComputedTransform();
    const point = anchorElement.transformCoordToGlobal(0, 0);
    const mapPoint = [matrix[0] * localPoint[0] + matrix[2] * localPoint[1] + matrix[4],
      matrix[1] * localPoint[0] + matrix[3] * localPoint[1] + matrix[5]];
    sample.visualDrift = sample.level === initialLevel ? Math.hypot(point[0] - mapPoint[0], point[1] - mapPoint[1]) : null;
    sample.visual = { point, mapPoint, matrix: matrix.slice() };
    chart.getModel().getSeries().filter(s => ids.includes(s.id)).forEach(s => {
      const data = s.getData();
      if (!data.count()) return;
      const item = data.getRawDataItem(0);
      const expected = chart.convertToPixel({ geoIndex: 0 }, item.value);
      const el = data.getItemGraphicEl(0);
      let actual = el && el.transformCoordToGlobal ? el.transformCoordToGlobal(0, 0) : null;
      if (!actual) {
        const points = data.getLayout('points');
        if (points && points.length >= 2) actual = [points[0], points[1]];
      }
      if (actual && expected) sample.rows.push({ id: s.id, d: Math.hypot(actual[0] - expected[0], actual[1] - expected[1]), a: actual, e: expected });
    });
    window.__ROAM_TRACE.frames.push(sample);
    if (now - window.__ROAM_TRACE.started < 8000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

const box = await page.locator('#factMap').boundingBox();
for (let round = 0; round < (singleRound ? 1 : 3); round++) {
  if (!zoomOnly) {
    await page.mouse.move(box.x + 420, box.y + 380);
    await page.mouse.down();
    for (let i = 0; i < 45; i++) {
      await page.mouse.move(box.x + 420 + i * 7, box.y + 380 + Math.sin(i / 5) * 35);
      await page.waitForTimeout(18);
    }
    await page.mouse.up();
    await page.waitForTimeout(150);
  }
  if (!panOnly) {
    await page.mouse.move(box.x + 700, box.y + 410);
    for (let i = 0; i < (singleRound ? 3 : 8); i++) {
      await page.mouse.wheel(0, round % 2 ? 95 : -95);
      await page.waitForTimeout(45);
    }
  }
}
await page.waitForTimeout(500);
const trace = await page.evaluate(() => window.__ROAM_TRACE);
const outside = await page.evaluate(() => {
  const chart = echarts.getInstanceByDom(document.getElementById('factMap'));
  const level = V03_DEBUG.state().geo.level;
  const facts = chart.getOption().series.find(s => s.id === 'facts')?.data || [];
  return { level, count: facts.length, outside: facts.filter(f => !V03Mass.insideMap(level, f.value[0], f.value[1])).length };
});
const drifts = trace.frames.flatMap(f => f.rows.map(r => r.d));
const visualDrifts = trace.frames.map(f => f.visualDrift).filter(x => x != null);
const gaps = trace.frames.slice(1).map((f, i) => f.t - trace.frames[i].t);
const maxGap = Math.max(0, ...gaps);
const maxGapAt = gaps.indexOf(maxGap) + 1;
const quantile = (a, q) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * q))] || 0;
console.log('RESULT', JSON.stringify({
  url, massOff, influenceOff, panOnly, zoomOnly, singleRound, prewarm, outside, events: trace.events, rendered: trace.rendered, frames: trace.frames.length,
  maxDrift: Math.max(0, ...drifts), p95Drift: quantile(drifts, .95),
  maxVisualDrift: Math.max(0, ...visualDrifts), p95VisualDrift: quantile(visualDrifts, .95),
  ...(process.argv.includes('--details') ? { firstVisual: trace.frames[0], maxVisual: trace.frames[visualDrifts.indexOf(Math.max(0,...visualDrifts))], lastVisual: trace.frames.at(-1) } : {}),
  maxFrameGap: maxGap, maxGapLevel: trace.frames[maxGapAt]?.level, p95FrameGap: quantile(gaps, .95), over32ms: gaps.filter(x => x > 32).length
}, null, 2));
if (screenshot) await page.screenshot({ path: path.join(artifactDir, 'roam-after.png'), fullPage: true });
await browser.close();
if (assertVisual && Math.max(0, ...visualDrifts) > .5) process.exitCode = 1;
