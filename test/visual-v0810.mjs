#!/usr/bin/env node
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch();
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('file://' + path.join(root, 'index.html'));
  await page.waitForFunction(() => window.__AGRI_READY === true);
  await page.waitForTimeout(500);
  const world = await page.evaluate(() => echarts.getInstanceByDom(document.getElementById('factMap')).getOption().geo[0].regions);
  if (world.length < 100 || new Set(world.map(x => x.itemStyle.areaColor)).size < 5) throw new Error('World region colors are missing');
  const facts = await page.evaluate(() => window.V03Filter.factsAtLevel(window.V03Store.state).length);
  if (!facts || !await page.locator('.data-snapshot').isVisible()) throw new Error('Snapshot facts are missing from the default view');
  await page.screenshot({ path: path.join(root, 'shots/v0810-fact-dark.png') });

  await page.evaluate(() => window.V03Store.set({ geo: { level: 'L2', focus: null } }));
  await page.waitForTimeout(350);
  const provinces = await page.evaluate(() => echarts.getInstanceByDom(document.getElementById('factMap')).getOption().geo[0].regions);
  const coloredProvinces = provinces.filter(x => x.itemStyle?.areaColor);
  if (coloredProvinces.length < 25 || new Set(coloredProvinces.map(x => x.itemStyle.areaColor)).size < 5) throw new Error('China province colors are missing');
  await page.screenshot({ path: path.join(root, 'shots/v0810-china-dark.png') });
  await page.evaluate(() => window.V03Store.set({ geo: { level: 'L1', focus: null } }));
  await page.waitForTimeout(300);

  await page.click('#mapSk [data-k="mode3d"]');
  await page.waitForTimeout(500);
  const globe = await page.evaluate(() => ({ visible: getComputedStyle(document.getElementById('factGlobe')).display !== 'none', caption: document.getElementById('globeCaption').textContent, before: document.getElementById('factGlobe').toDataURL() }));
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => document.getElementById('factGlobe').toDataURL());
  if (!globe.visible || !globe.caption.includes('演示数据') || globe.before === after) throw new Error('Globe or animated routes are missing');
  await page.screenshot({ path: path.join(root, 'shots/v0810-globe-dark.png') });

  const big = await browser.newPage({ viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 1 });
  big.on('pageerror', error => errors.push(error.message));
  await big.goto('file://' + path.join(root, 'index.html'));
  await big.waitForFunction(() => window.__AGRI_READY === true);
  const layout = await big.evaluate(() => ({ side: getComputedStyle(document.documentElement).getPropertyValue('--side-w').trim(), font: getComputedStyle(document.documentElement).fontSize, overflow: document.documentElement.scrollWidth > innerWidth }));
  if (layout.side !== '620px' || layout.font !== '20px' || layout.overflow) throw new Error('Large-screen layout failed: ' + JSON.stringify(layout));
  await big.screenshot({ path: path.join(root, 'shots/v0810-4k-fact.png') });
  if (errors.length) throw new Error('Browser errors: ' + errors.join(' | '));
  console.log(JSON.stringify({ worldRegions: world.length, chinaProvinces: provinces.length, distinctColors: new Set(world.map(x => x.itemStyle.areaColor)).size, defaultFacts: facts, globeAnimated: globe.before !== after, largeScreen: layout }));
} finally {
  await browser.close();
}
