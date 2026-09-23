#!/usr/bin/env node
/* V0.8.1 regression: every visible map point must be owned by the same ECharts geo coordinate system. */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
await page.goto('file://' + path.join(root, 'index.html'));
await page.waitForFunction(() => window.__AGRI_READY === true);
await page.waitForTimeout(700);

const checks = [];
function check(name, ok, detail = '') {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function alignment() {
  return page.evaluate(() => {
    const chart = echarts.getInstanceByDom(document.getElementById('factMap'));
    const ids = ['mass', 'halo', 'ripple', 'facts', 'freshFlash'];
    return chart.getModel().getSeries().filter(s => ids.includes(s.id)).map(s => {
      const data = s.getData();
      let max = 0, measured = 0;
      for (let i = 0; i < Math.min(25, data.count()); i++) {
        const item = data.getRawDataItem(i);
        const expected = chart.convertToPixel({ geoIndex: 0 }, item.value);
        const el = data.getItemGraphicEl(i);
        const actual = el && el.transformCoordToGlobal ? el.transformCoordToGlobal(0, 0) : null;
        if (!actual || !expected) continue;
        max = Math.max(max, Math.hypot(actual[0] - expected[0], actual[1] - expected[1]));
        measured++;
      }
      return { id: s.id, coordinateSystem: s.get('coordinateSystem'), count: data.count(), measured, maxDrift: max };
    });
  });
}

await page.evaluate(() => {
  const f = V03Data.FACTS.find(x => x.lng != null && x.lat != null);
  V03Fact.flashStar(f, 'bright');
});
await page.waitForTimeout(80);
const initial = await alignment();
const overlayCount = await page.locator('#factMapBox > .star-flash, #factMapBox > .ripple-canvas').count();
const fresh = initial.find(x => x.id === 'freshFlash');
check('新事实闪点不是独立 DOM/Canvas 覆盖层', overlayCount === 0, `overlay=${overlayCount}`);
check('新事实闪点属于 geo 系列', !!fresh && fresh.coordinateSystem === 'geo' && fresh.count > 0, JSON.stringify(fresh || null));

const box = await page.locator('#factMap').boundingBox();
for (let i = 0; i < 4; i++) {
  await page.mouse.move(box.x + box.width * (.35 + i * .04), box.y + box.height * (.42 + i * .025));
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * (.43 + i * .04), box.y + box.height * (.47 + i * .025), { steps: 8 });
  await page.mouse.up();
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .5);
  await page.mouse.wheel(0, i % 2 ? 110 : -110);
}
await page.evaluate(() => {
  const f = V03Data.FACTS.find(x => x.lng != null && x.lat != null);
  V03Fact.flashStar(f, 'bright');
});
await page.waitForTimeout(80);
const moved = await alignment();
check('连续拖动缩放后所有实际图元与 geo 投影重合', moved.length >= 5 && moved.every(x => x.coordinateSystem === 'geo' && x.measured > 0 && x.maxDrift < .25), JSON.stringify(moved));

await page.click('[data-tab="relation"]');
await page.waitForTimeout(250);
const relation = await page.evaluate(() => {
  const chart = echarts.getInstanceByDom(document.getElementById('relCanvas'));
  return chart.getModel().getSeries().map(s => ({ id: s.id, coordinateSystem: s.get('coordinateSystem') }));
});
check('关联层节点和连线同样只使用 geo 坐标系', relation.length > 0 && relation.every(x => x.coordinateSystem === 'geo'), JSON.stringify(relation));
check('页面无控制台错误', errors.length === 0, JSON.stringify(errors.slice(0, 5)));

await browser.close();
if (checks.some(x => !x.ok)) process.exitCode = 1;
