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
    return { map: pos.geo[0].map, china, northAmerica, southAmerica,
      nodes: (nodes?.data || []).length,
      westCount: (nodes?.data || []).filter(x => x.value?.[0] < -25).length,
      palette: document.documentElement.dataset.theme,
      tabLabel: document.querySelector('#btnTheme .theme-name')?.textContent };
  }, view);
  for (const theme of ['light', 'color']) {
    await page.evaluate(theme => V03Store.set({ theme }), theme);
    await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
    for (const view of ['fact', 'relation']) {
      if (view === 'relation') {
        await page.evaluate(() => V03Store.set({ tab: 'relation', rel: { view: 'geo' } }));
        await page.waitForFunction(() => echarts.getInstanceByDom(document.querySelector('#relCanvas'))?.getOption()?.geo?.[0]?.map === 'worldChina');
      } else await page.evaluate(() => V03Store.set({ tab: 'fact' }));
      const data = await inspect(view);
      if (data.map !== 'worldChina' || data.northAmerica[0] <= data.china[0] ||
          data.southAmerica[0] <= data.china[0] || data.northAmerica[0] > 1020 ||
          data.southAmerica[0] > 1020 || data.westCount || !data.nodes ||
          data.palette !== theme || data.tabLabel !== (theme === 'light' ? '配色 1' : '配色 2'))
        throw new Error(`${view}/${theme}: ${JSON.stringify(data)}`);
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Two palettes render without errors; both geographic views recenter China and position the Americas to its right with correctly wrapped data.');
  await page.close();
} finally { await browser.close(); }
