import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = '/Users/guohui/Documents/Multica_Project/LLM-Up/agri-intel/agri-llm-demo-visual-v0810';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
await page.waitForFunction(() => window.__AGRI_READY === true);
const Z = () => page.evaluate(() => ({ fact: V03Fact.debug().zoom, fGlobe: V03Fact.debug().globeZoom, rel: V03Relation.debug().zoom, rGlobe: V03Relation.debug().globe.radiusScale, view: V03Store.state.rel.view, mode3d: V03Store.state.sk.mode3d }));
const pinch = async (sel, n = 3, dy = -24) => { const b = await page.locator(sel).boundingBox(); for (let i = 0; i < n; i++) { await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.keyboard.down('Control'); await page.mouse.wheel(0, dy); await page.keyboard.up('Control'); await page.waitForTimeout(160); } };

// 1) 双指缩放（ctrl+wheel）
await page.evaluate(() => V03Store.set({ tab: 'relation', rel: { view: 'geo', level: 'L1' } }));
await page.waitForTimeout(3200);
const a1 = await Z(); await pinch('#relCanvas'); await page.waitForTimeout(400);
console.log('rel 2D pinch', JSON.stringify(a1), '->', JSON.stringify(await Z()));
await page.evaluate(() => V03Store.set({ rel: { view: 'globe' } }));
await page.waitForTimeout(1500);
const a2 = await Z(); await pinch('#relGlobe'); await page.waitForTimeout(400);
console.log('rel 3D pinch', JSON.stringify(a2), '->', JSON.stringify(await Z()));
await page.evaluate(() => V03Store.set({ tab: 'fact', sk: { mode3d: false }, geo: { level: 'L1' } }));
await page.waitForTimeout(1500);
const a3 = await Z(); await pinch('#factMap'); await page.waitForTimeout(400);
console.log('fact 2D pinch', JSON.stringify(a3), '->', JSON.stringify(await Z()));
await page.evaluate(() => V03Store.set({ sk: { mode3d: true } }));
await page.waitForTimeout(1400);
const a4 = await Z(); await pinch('#factGlobe'); await page.waitForTimeout(400);
console.log('fact 3D pinch', JSON.stringify(a4), '->', JSON.stringify(await Z()));

// 2) 缩放按钮：单击 + 按住
await page.evaluate(() => V03Store.set({ tab: 'relation', rel: { view: 'geo', level: 'L1' } }));
await page.waitForTimeout(3200);
const box = await page.locator('#mapSk .sk[data-k="zoomIn"]').boundingBox();
const b1 = await Z();
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await page.waitForTimeout(500);
const b2 = await Z();
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.waitForTimeout(1200); await page.mouse.up(); await page.waitForTimeout(400);
const b3 = await Z();
console.log('zoom button: click', b1.rel, '->', b2.rel, '; hold ->', b3.rel);

// 3) ⌘ + 方向键
const panel = () => page.evaluate(() => ({ menu: V03Store.state.menu, cards: V03Store.state.panels.cards, stream: V03Store.state.panels.stream }));
const p0 = await panel();
await page.keyboard.press('Meta+ArrowLeft'); await page.waitForTimeout(300);
const p1 = await panel();
await page.keyboard.press('Meta+ArrowRight'); await page.waitForTimeout(300);
const p2 = await panel();
await page.keyboard.press('Meta+ArrowDown'); await page.waitForTimeout(300);
const p3 = await panel();
console.log('keys', JSON.stringify(p0), JSON.stringify(p1), JSON.stringify(p2), JSON.stringify(p3));

// 4) 新数据光晕：亮度先升后降、最终消失
const pulse = await page.evaluate(() => new Promise(res => {
  const c = echarts.getInstanceByDom(document.getElementById('relCanvas'));
  const read = () => { const s = (c.getOption().series || []).find(x => x.id === 'relFresh'); const d = s ? (s.data || []) : []; return d.length ? Math.max(...d.map(x => (x.itemStyle && x.itemStyle.opacity) || 0)) : 0; };
  const samples = [];
  const t0 = performance.now();
  const tick = () => {
    samples.push(read());
    if (performance.now() - t0 > 22000) return res({ max: Math.max(...samples), last: samples[samples.length - 1], n: samples.length });
    setTimeout(tick, 300);
  };
  tick();
  setTimeout(() => V03Store.emit('stream:line', { fact: V03Data.factById('gen-cs-circulation-008') || V03Data.FACTS.find(f => f.lng != null), level: 'bright' }), 800);
}));
console.log('pulse', JSON.stringify(pulse));
console.log('errors', JSON.stringify(errs.slice(0, 3)));
await browser.close();
