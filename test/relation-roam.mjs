#!/usr/bin/env node
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
  await page.waitForFunction(() => window.__AGRI_READY === true);
  await page.evaluate(() => V03Store.set({ tab: 'relation', rel: { view: 'geo' } }));
  await page.waitForFunction(() => echarts.getInstanceByDom(document.getElementById('relCanvas'))?.getOption().geo?.length);
  await page.evaluate(() => {
    const chart = echarts.getInstanceByDom(document.getElementById('relCanvas'));
    const group = chart.getViewOfComponentModel(chart.getModel().getComponent('geo', 0)).group.childAt(0);
    const data = chart.getModel().getSeries().find(s => s.id === 'relNode').getData();
    const visibleIndex = Array.from({length:data.count()}, (_, i) => i).find(i => {
      const el = data.getItemGraphicEl(i); if (!el) return false;
      const [x,y] = el.transformCoordToGlobal(0,0); return x > 200 && x < 760 && y > 320 && y < 670;
    });
    if (visibleIndex == null) throw new Error('No visible relation node');
    const element = data.getItemGraphicEl(visibleIndex);
    const matrix = group.getComputedTransform(), point = element.transformCoordToGlobal(0, 0);
    const det = matrix[0] * matrix[3] - matrix[1] * matrix[2];
    const dx = point[0] - matrix[4], dy = point[1] - matrix[5];
    const local = [(matrix[3] * dx - matrix[2] * dy) / det, (-matrix[1] * dx + matrix[0] * dy) / det];
    window.__REL_TRACE = { max: 0, maxLive: 0, replacements: 0, frames: 0, events: 0, initial: { matrix, point, visibleIndex } };
    chart.on('georoam', () => window.__REL_TRACE.events++);
    let lastElement = element;
    const tick = () => {
      const m = group.getComputedTransform(), p = element.transformCoordToGlobal(0, 0);
      const expected = [m[0] * local[0] + m[2] * local[1] + m[4], m[1] * local[0] + m[3] * local[1] + m[5]];
      const d = Math.hypot(p[0] - expected[0], p[1] - expected[1]);
      if (Number.isFinite(d)) window.__REL_TRACE.max = Math.max(window.__REL_TRACE.max, d);
      const liveData = chart.getModel().getSeries().find(s => s.id === 'relNode').getData();
      const liveEl = liveData.getItemGraphicEl(visibleIndex);
      if (liveEl !== lastElement) window.__REL_TRACE.replacements++;
      lastElement = liveEl;
      if (liveEl) {
        const actual = liveEl.transformCoordToGlobal(0,0);
        const expectedPixel = chart.convertToPixel({ geoIndex: 0 }, liveData.getRawDataItem(visibleIndex).value);
        const liveD = Math.hypot(actual[0]-expectedPixel[0], actual[1]-expectedPixel[1]);
        if (Number.isFinite(liveD)) window.__REL_TRACE.maxLive = Math.max(window.__REL_TRACE.maxLive, liveD);
      }
      window.__REL_TRACE.frames++;
      if (window.__REL_TRACE.frames < 180) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const box = await page.locator('#relCanvas').boundingBox();
  await page.mouse.move(box.x + 430, box.y + 380); await page.mouse.down();
  for (let i = 0; i < 24; i++) {
    await page.mouse.move(box.x + 430 + i * 11, box.y + 380 + Math.sin(i / 4) * 18);
    await page.waitForTimeout(16);
  }
  await page.mouse.up(); await page.waitForTimeout(160);
  const trace = await page.evaluate(() => window.__REL_TRACE);
  console.log('RELATION_ROAM', JSON.stringify(trace));
  if (trace.events < 5 || trace.maxLive > 1 || trace.replacements > 30) process.exitCode = 1;
} finally { await browser.close(); }
