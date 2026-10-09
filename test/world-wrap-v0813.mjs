#!/usr/bin/env node
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file://' + path.join(root, 'index.html'));
  await page.waitForFunction(() => window.__AGRI_READY === true);
  const inspect = async view => page.evaluate(view => {
    const el = document.getElementById(view === 'fact' ? 'factMap' : 'relCanvas');
    const chart = echarts.getInstanceByDom(el), geo = { geoIndex: 0 };
    const china = chart.convertToPixel(geo, [105, 35]);
    const northAmerica = chart.convertToPixel(geo, [260, 39]);
    const southAmerica = chart.convertToPixel(geo, [310, -14]);
    const pos = chart.getOption();
    const nodes = (pos.series || []).find(x => x.id === (view === 'fact' ? 'facts' : 'relNode'));
    const region = name => pos.geo[0].regions.find(r => r.name === name)?.itemStyle.areaColor;
    return { map: pos.geo[0].map, roam: pos.geo[0].roam, china, northAmerica, southAmerica,
      usaColor: region('United States of America'), canadaColor: region('Canada'),
      nodes: (nodes?.data || []).length,
      westCount: (nodes?.data || []).filter(x => x.value?.[0] < -25).length,
      worldFeatures: echarts.getMap('worldChina').geoJSON.features.length,
      palette: document.documentElement.dataset.theme,
      tabLabel: document.querySelector('#btnTheme .theme-name')?.textContent };
  }, view);
  for (const theme of ['color']) {   /* 本轮只保留一套配色 */
    await page.evaluate(theme => V03Store.set({ theme }), theme);
    await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
    for (const view of ['fact', 'relation']) {
      if (view === 'relation') {
        await page.evaluate(() => V03Store.set({ tab: 'relation', rel: { view: 'geo' } }));
        await page.waitForFunction(() => echarts.getInstanceByDom(document.querySelector('#relCanvas'))?.getOption()?.geo?.[0]?.map === 'worldChina');
      } else await page.evaluate(() => V03Store.set({ tab: 'fact' }));
      const data = await inspect(view);
      if (data.map !== 'worldChina' || data.roam !== true || data.worldFeatures !== 531 ||
          data.northAmerica[0] <= data.china[0] || data.southAmerica[0] <= data.china[0] ||
          data.nodes % 3 !== 0 || data.westCount !== data.nodes / 3 ||
          !data.usaColor || !data.canadaColor || data.usaColor === data.canadaColor ||
          data.palette !== theme)
        throw new Error(`${view}/${theme}: ${JSON.stringify(data)}`);
    }
  }
  await page.evaluate(() => V03Store.set({ tab: 'fact', geo: { level: 'L1' } }));
  const map = page.locator('#factMap');
  const rect = await map.boundingBox();
  await page.mouse.move(rect.x + rect.width * .76, rect.y + rect.height * .5);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * .08, rect.y + rect.height * .5, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const moved = await inspect('fact');
  if (Math.abs(moved.china[0] - 510) < 100 || moved.worldFeatures !== 531) throw new Error('World did not wrap after drag: ' + JSON.stringify(moved));
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Two full palettes render; neighboring USA/Canada differ; both maps repeat the world and points while preserving drag navigation.');
  await page.close();
} finally { await browser.close(); }
