import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = '/Users/guohui/Documents/Multica_Project/LLM-Up/agri-intel/agri-llm-demo-visual-v0810';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
await page.waitForFunction(() => window.__AGRI_READY === true);
const snap = () => page.evaluate(() => ({
  tab: V03Store.state.tab, view: V03Store.state.rel.view, mode3d: V03Store.state.sk.mode3d, level: V03Store.state.geo.level, relLevel: V03Store.state.rel.level,
  factZoom: V03Fact.debug().zoom, relZoom: V03Relation.debug().zoom, globeR: V03Relation.debug().globe.radiusScale, factGlobe: V03Fact.debug().globeZoom,
  buttons: [...document.querySelectorAll('#mapSk .sk')].map(b => ({ k: b.dataset.k, disabled: b.disabled, title: b.title }))
}));
for (const [label, patch] of [['fact-2d', { tab: 'fact', sk: { mode3d: false }, geo: { level: 'L1', focus: null } }], ['rel-2d', { tab: 'relation', rel: { view: 'geo', level: 'L1' } }], ['rel-3d', { tab: 'relation', rel: { view: 'globe' } }], ['fact-3d', { tab: 'fact', sk: { mode3d: true } }]]) {
  await page.evaluate(p => V03Store.set(p), patch);
  await page.waitForTimeout(3000);
  const before = await snap();
  await page.locator('#mapSk .sk[data-k="zoomIn"]').click({ force: true }).catch(e => console.log('clickIn fail', e.message));
  await page.waitForTimeout(700);
  const after = await snap();
  console.log(label, 'before', JSON.stringify(before), '\n   after', JSON.stringify(after));
}
await browser.close();
