#!/usr/bin/env node
/* LLM-291 视觉自查截图：两层 × 三视图 × 两套配色
   运行：node test/shots-llm291.mjs [输出目录] [前缀]                        */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || path.join(root, 'shots/llm291');
const prefix = process.argv[3] || 'shot';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
  await page.waitForFunction(() => window.__AGRI_READY === true);
  const shot = async (name, ms) => { await page.waitForTimeout(ms || 2600); await page.screenshot({ path: path.join(out, prefix + '-' + name + '.png') }); };

  for (const [theme, tag] of [['color', 'pal2'], ['light', 'pal1'], ['atlas', 'pal3']]) {
    await page.evaluate(t => V03Store.set({ theme: t, tab: 'fact', sk: { mode3d: true }, geo: { level: 'L1', focus: null } }), theme);
    await shot(tag + '-fact-3d');
    await page.evaluate(() => V03Store.set({ sk: { mode3d: false } }));
    await shot(tag + '-fact-2d', 1800);
    await page.evaluate(() => V03Store.set({ tab: 'relation', rel: { view: 'globe', level: 'L1', focus: null } }));
    await shot(tag + '-rel-3d');
    await page.evaluate(() => V03Store.set({ rel: { view: 'geo' } }));
    await shot(tag + '-rel-2d', 4200);
    await page.evaluate(() => V03Store.set({ rel: { level: 'L2', focus: null } }));
    await shot(tag + '-rel-L2', 2600);
    await page.evaluate(() => V03Store.set({ rel: { view: 'graph', level: 'L1', focus: null } }));
    await shot(tag + '-rel-graph', 1600);
  }
  console.log('shots written to', out);
} finally {
  await browser.close();
}
