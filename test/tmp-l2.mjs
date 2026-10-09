import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = '/Users/guohui/Documents/Multica_Project/LLM-Up/agri-intel/agri-llm-demo-visual-v0810';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => console.log('PAGEERROR', e.message, e.stack && e.stack.split('\n')[1]));
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)); });
await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
await page.waitForFunction(() => window.__AGRI_READY === true);
await page.evaluate(() => V03Store.set({ tab: 'relation', rel: { view: 'geo', level: 'L1', focus: null } }));
await page.waitForTimeout(2500);
console.log('L1', JSON.stringify(await page.evaluate(() => {
  const c = echarts.getInstanceByDom(document.getElementById('relCanvas'));
  return { hasChart: !!c, keys: c ? Object.keys(c.getOption()).slice(0, 12) : null, dbg: window.V03Relation.debug() };
})));
await page.evaluate(() => V03Store.set({ rel: { view: 'geo', level: 'L2', focus: null } }));
await page.waitForTimeout(2500);
console.log('L2', JSON.stringify(await page.evaluate(() => {
  const c = echarts.getInstanceByDom(document.getElementById('relCanvas'));
  const o = c ? c.getOption() : null;
  return { keys: o ? Object.keys(o) : null, geo: o && o.geo ? o.geo[0] && { map: o.geo[0].map, center: o.geo[0].center, zoom: o.geo[0].zoom, regions: (o.geo[0].regions || []).length } : null,
    china: !!echarts.getMap('china'), chinaGeo: !!window.__CHINA_GEO, dbg: window.V03Relation.debug() };
})));
await page.screenshot({ path: path.join(root, 'shots/llm291c/tmp-L2.png') });
await browser.close();
