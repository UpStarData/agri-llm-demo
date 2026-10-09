import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = '/Users/guohui/Documents/Multica_Project/LLM-Up/agri-intel/agri-llm-demo-visual-v0810';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
await page.waitForFunction(() => window.__AGRI_READY === true);
await page.evaluate(() => {
  window.__CLICKS = 0;
  document.getElementById('mapSk').addEventListener('click', e => { if (e.target.closest('.sk') && e.target.closest('.sk').dataset.k === 'zoomIn') window.__CLICKS++; });
});
const zoom = () => page.evaluate(() => ({ fact: V03Fact.debug().zoom, rel: V03Relation.debug().zoom, globe: V03Relation.debug().globe.radiusScale, mode3d: V03Store.state.sk.mode3d }));
await page.evaluate(() => V03Store.set({ tab: 'relation', rel: { view: 'geo', level: 'L1' } }));
await page.waitForTimeout(3000);
let box = await page.locator('#mapSk .sk[data-k="zoomIn"]').boundingBox();
console.log('zoomIn box', JSON.stringify(box), 'start', JSON.stringify(await zoom()));
// 1) 慢点击（按下 150ms 再松开）
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down(); await page.waitForTimeout(150); await page.mouse.up();
await page.waitForTimeout(500);
console.log('slow click', JSON.stringify(await zoom()), 'clicks', await page.evaluate(() => window.__CLICKS));
// 2) 连续三次快速点击
box = await page.locator('#mapSk .sk[data-k="zoomIn"]').boundingBox();
for (let i = 0; i < 3; i++) { await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(120); }
await page.waitForTimeout(600);
console.log('3 fast clicks', JSON.stringify(await zoom()), 'clicks', await page.evaluate(() => window.__CLICKS));
// 3) 触控板双指缩放（ctrl+wheel）
const cb = await page.locator('#relCanvas').boundingBox();
await page.evaluate(() => { window.__WHEEL = []; document.getElementById('relCanvas').addEventListener('wheel', e => window.__WHEEL.push({ dy: e.deltaY, ctrl: e.ctrlKey, def: e.defaultPrevented }), true); });
for (let i = 0; i < 4; i++) { await page.mouse.move(cb.x + 500, cb.y + 400); await page.keyboard.down('Control'); await page.mouse.wheel(0, -30); await page.keyboard.up('Control'); await page.waitForTimeout(220); }
console.log('ctrl+wheel', JSON.stringify(await zoom()), JSON.stringify(await page.evaluate(() => window.__WHEEL)));
// 4) 触控板双击/捏合 gesture（Safari）事件是否有人处理
console.log('gesture listeners', await page.evaluate(() => ({
  gesture: typeof window.GestureEvent !== 'undefined',
  handled: !!document.getElementById('relCanvas').ongesturechange || !!document.getElementById('factMap').ongesturechange
})));
await browser.close();
