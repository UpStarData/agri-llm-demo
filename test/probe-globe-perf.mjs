#!/usr/bin/env node
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = process.argv.find(arg => /^https?:|^file:/.test(arg)) || pathToFileURL(path.join(root, 'index.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.goto(url);
await page.waitForFunction(() => window.__AGRI_READY === true);
const results = [];
for (let round = 0; round < 3; round++) {
  const sample = await page.evaluate(async () => {
    const gaps = [];
    const longTasks = [];
    const observer = new PerformanceObserver(list => list.getEntries().forEach(x => longTasks.push(x.duration)));
    observer.observe({ entryTypes: ['longtask'] });
    let last = performance.now();
    let active = true;
    const tick = t => { if (!active) return; gaps.push(t - last); last = t; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    const start = performance.now();
    V03_DEBUG.set({ sk: { mode3d: true } });
    const setMs = performance.now() - start;
    await new Promise(resolve => setTimeout(resolve, 1800));
    active = false;
    observer.disconnect();
    const sorted = gaps.slice().sort((a, b) => a - b);
    const result = { setMs, frames: gaps.length, p95Gap: sorted[Math.floor(sorted.length * .95)] || 0,
      maxGap: Math.max(0, ...gaps), longTasks, canvasWidth: document.getElementById('factGlobe').width,
      canvasHeight: document.getElementById('factGlobe').height };
    V03_DEBUG.set({ sk: { mode3d: false } });
    return result;
  });
  results.push(sample);
  await page.waitForTimeout(300);
}
console.log(JSON.stringify({ url, results }, null, 2));
await browser.close();
