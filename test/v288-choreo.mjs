/* V2.8.8 · 40 秒编排（全球 / 中国 / 湖南 三个视角各跑一遍）
   用户 2026-10-17 的要求：先全屏无点 → 缓慢出现少量 → 集中出现一批 → 部分消失、部分新增 →
   趋于稳定 → 最后几个慢慢消失、几个慢慢点亮；约 40 秒结束；各视角数据量不同、效果相同。 */
import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const browser = await chromium.launch();
const report = {errors: [], views: {}};
fs.mkdirSync('test/artifacts/v288', {recursive: true});
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  page.on('pageerror', e => report.errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(process.env.AGRI_TEST_HTML || 'index.html')).href);
  await page.waitForFunction(() => window.__AGRI_READY);
  // 数据立刻给到（不走分批揭示），但编排动画照常播放——这正是用户要的首屏效果
  await page.evaluate(() => { V03Feed.complete(); V03Feed.stop(); });

  const sample = () => page.evaluate(() => {
    const opt = echarts.getInstanceByDom(document.querySelector('#factMap')).getOption();
    const s = opt.series.find(x => x.id === 'facts');
    const data = s.data || [];
    const vis = data.filter(d => (d.itemStyle || {}).opacity > .05).length;
    const fading = data.filter(d => { const o = (d.itemStyle || {}).opacity; return o > .05 && o < .6; }).length;
    return {vis, fading};
  });

  const runView = async (label, setup, stepMs, steps) => {
    if (setup) await page.evaluate(setup).then(() => page.waitForTimeout(150));
    const trace = [];
    for (let i = 0; i <= steps; i++) {
      trace.push({t: Math.round((i * stepMs) / 1000), ...(await sample())});
      if (i < steps) await page.waitForTimeout(stepMs);
    }
    const finalVis = trace[trace.length - 2].vis;            // 40s 那一刻
    const at = t => trace.reduce((best, x) => Math.abs(x.t - t) < Math.abs(best.t - t) ? x : best, trace[0]);
    report.views[label] = {finalVis, trace};
    assert(at(1).vis <= Math.max(3, finalVis * .02), `${label} 开场应几乎没有点: ${JSON.stringify(at(1))}`);
    assert(at(7).vis > 0 && at(7).vis < finalVis * .35, `${label} 7 秒应只有少量: ${JSON.stringify(at(7))}`);
    assert(at(13).vis > finalVis * .35, `${label} 13 秒应集中出现一大批: ${JSON.stringify(at(13))}`);
    const churn = trace.filter(x => x.t >= 14 && x.t <= 27).some(x => x.fading > 0);
    assert(churn, `${label} 中途应能观察到淡出/淡入中的点`);
    assert(at(35).vis >= finalVis * .85, `${label} 35 秒应趋于稳定: ${JSON.stringify(at(35))}`);
    assert.equal(trace[trace.length - 1].vis, finalVis, `${label} 40 秒后应稳定不再变化`);
    await page.screenshot({path: `test/artifacts/v288/${label}-end.png`});
    return finalVis;
  };

  // ① 全球（首屏自带编排）
  const l1 = await runView('world', null, 1000, 43);
  // ② 中国
  const l2 = await runView('china', () => V03Store.set({geo: {level: 'L2', focus: null}}), 1000, 43);
  // ③ 湖南
  const l3 = await runView('hunan', () => V03Store.set({geo: {level: 'L3', focus: '湖南'}}), 2000, 22);

  assert(l1 > l2 && l2 > l3, `三个视角的数据量应递减: 世界 ${l1} / 中国 ${l2} / 湖南 ${l3}`);
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify({world: l1, china: l2, hunan: l3,
    worldTrace: report.views.world.trace.map(x => `${x.t}s:${x.vis}${x.fading ? '/f' + x.fading : ''}`).join(' '),
    chinaTrace: report.views.china.trace.map(x => `${x.t}s:${x.vis}`).join(' '),
    hunanTrace: report.views.hunan.trace.map(x => `${x.t}s:${x.vis}`).join(' ')}, null, 1));
} finally {
  fs.writeFileSync('test/artifacts/v288/choreo.json', JSON.stringify(report, null, 1));
  await browser.close();
}
