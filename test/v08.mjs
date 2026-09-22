#!/usr/bin/env node
/* V0.8 regression: HungerMap theme, globe ambience, geo-anchored markers and irregular overview. */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
await page.goto('file://' + path.join(root, 'index.html'));
await page.waitForFunction(() => window.__AGRI_READY === true);
await page.waitForTimeout(700);

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok: !!ok, detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const theme0 = await page.evaluate(() => ({
  theme: document.documentElement.dataset.theme,
  body: getComputedStyle(document.body).backgroundColor,
  order: ['#btnTheme', '#btnSettings'].map(s => document.querySelector(s)?.getBoundingClientRect().left ?? -1),
  label: document.getElementById('btnTheme')?.getAttribute('aria-label') || ''
}));
check('默认夜间主题，主题键位于设置左侧', theme0.theme === 'dark' && theme0.order[0] >= 0 && theme0.order[0] < theme0.order[1] && /日间/.test(theme0.label), JSON.stringify(theme0));
await page.click('#btnTheme');
await page.waitForTimeout(250);
const theme1 = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, label: document.getElementById('btnTheme').getAttribute('aria-label') }));
check('主题按钮真实切到日间并更新可访问标签', theme1.theme === 'light' && /夜间/.test(theme1.label), JSON.stringify(theme1));
await page.click('#btnTheme');

const anchorBefore = await page.evaluate(() => {
  const chart = echarts.getInstanceByDom(document.getElementById('factMap'));
  const series = chart.getModel().getSeries().filter(s => ['mass', 'facts', 'halo', 'ripple'].includes(s.id));
  return {
    detachedCanvas: !!document.querySelector('#factMapBox > .ripple-canvas'),
    series: series.map(s => ({ id: s.id, geo: s.get('coordinateSystem'), p: s.getData().getItemLayout(0) || Array.from(s.getData().getLayout('points').slice(0, 2)) }))
  };
});
const box = await page.locator('#factMap').boundingBox();
await page.mouse.move(box.x + box.width * .45, box.y + box.height * .48);
await page.mouse.down();
await page.mouse.move(box.x + box.width * .61, box.y + box.height * .57, { steps: 14 });
await page.mouse.up();
await page.waitForTimeout(300);
const anchorAfter = await page.evaluate(() => {
  const chart = echarts.getInstanceByDom(document.getElementById('factMap'));
  return chart.getModel().getSeries().filter(s => ['mass', 'facts', 'halo', 'ripple'].includes(s.id))
    .map(s => ({ id: s.id, geo: s.get('coordinateSystem'), p: s.getData().getItemLayout(0) || Array.from(s.getData().getLayout('points').slice(0, 2)) }));
});
const deltas = anchorAfter.map(a => {
  const b = anchorBefore.series.find(x => x.id === a.id);
  return { id: a.id, geo: a.geo, dx: a.p[0] - b.p[0], dy: a.p[1] - b.p[1] };
});
const ref = deltas.find(x => x.id === 'facts');
check('事实点、密度点、影响动画全部绑定同一个 geo 绘制层', !anchorBefore.detachedCanvas && deltas.length >= 3 && deltas.every(x => x.geo === 'geo' && Math.abs(x.dx - ref.dx) < 1 && Math.abs(x.dy - ref.dy) < 1), JSON.stringify({ detachedCanvas: anchorBefore.detachedCanvas, deltas }));

await page.click('#mapSk [data-k="mode3d"]');
await page.waitForTimeout(450);
const globeA = await page.evaluate(() => ({ debug: window.V03Fact.debug(), image: document.getElementById('factGlobe').toDataURL() }));
await page.waitForTimeout(1400);
const globeB = await page.evaluate(() => ({ debug: window.V03Fact.debug(), image: document.getElementById('factGlobe').toDataURL() }));
check('夜间 3D 地球持续自转并有独立移动星空', globeA.debug.starCount >= 120 && globeB.debug.globeRotation !== globeA.debug.globeRotation && globeB.debug.starOffset !== globeA.debug.starOffset && globeB.image !== globeA.image, JSON.stringify({ a: globeA.debug, b: globeB.debug }));

await page.click('#menuBtn');
await page.waitForTimeout(8200);
const ov = await page.evaluate(() => window.V03_DEBUG.overview && window.V03_DEBUG.overview());
check('数据概览采用不规则停顿、间隔和增量', !!ov && ov.history.length >= 3 && ov.history.some(x => x.skipped) && new Set(ov.history.filter(x => !x.skipped).map(x => x.delay)).size >= 2 && new Set(ov.history.filter(x => !x.skipped).map(x => x.delta)).size >= 2, JSON.stringify(ov));

check('页面无控制台错误', errors.length === 0, JSON.stringify(errors.slice(0, 5)));
await browser.close();
if (checks.some(x => !x.ok)) process.exitCode = 1;
