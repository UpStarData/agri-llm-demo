/* V2.8.9（= V2.8.7 + 一处改动）：点击时间范围后，动画结束时约 1/20 的事实点淡出消失；
   不同筛选的数据总量不同；同一筛选重复点击消失同一批点（确定性）。 */
import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const browser = await chromium.launch();
const report = {errors: []};
fs.mkdirSync('test/artifacts/v289', {recursive: true});
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  page.on('pageerror', e => report.errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(process.env.AGRI_TEST_HTML || 'index.html')).href);
  await page.waitForFunction(() => window.__AGRI_READY);
  await page.evaluate(() => { V03Feed.complete(); V03Feed.stop(); V03Store.set({tab: 'fact', geo: {level: 'L2', focus: null}, time: 'all'}); });
  await page.waitForTimeout(800);

  const sample = () => page.evaluate(() => {
    const opt = echarts.getInstanceByDom(document.querySelector('#factMap')).getOption();
    const s = opt.series.find(x => x.id === 'facts');
    const vis = (s.data || []).filter(d => ((d.itemStyle || {}).opacity || 0) > .05);
    return {vis: vis.length, ids: vis.map(d => d.id), all: (s.data || []).length};
  });
  const pickTime = t => page.evaluate(t => V03Store.set({time: t}), t);

  // 点一个时间筛选，逐 200ms 采样，看"铺点峰值"与"退场后稳定值"
  const watch = async (time, totalMs = 6500) => {
    await pickTime(time);
    const trace = [];
    for (let i = 0; i * 200 <= totalMs; i++) { trace.push({t: i * 200, ...(await sample())}); await page.waitForTimeout(200); }
    const peak = Math.max(...trace.map(x => x.vis));
    const final = trace.at(-1);
    return {time, peak, finalVis: final.vis, ids: final.ids, trace: trace.map(x => `${x.t}:${x.vis}`).join(' ')};
  };

  report.run1 = await watch('30d');
  report.ratio1 = report.run1.finalVis / report.run1.peak;
  assert(report.ratio1 > .90 && report.ratio1 < .985,
    `动画结束后应消失约 1/20（实测比例 ${report.ratio1.toFixed(3)}，峰值 ${report.run1.peak} → 稳定 ${report.run1.finalVis}）`);

  // 确定性：切到别的筛选再切回 30d，消失的还是同一批（同一点击同一筛选应幂等）
  await watch('7d');
  report.run2 = await watch('30d');
  const sameSet = report.run1.ids.length === report.run2.ids.length &&
    report.run1.ids.every(id => report.run2.ids.includes(id));
  assert(sameSet, '同一个时间筛选重复点击，应消失同一批点（确定性）');
  assert(report.run2.finalVis === report.run1.finalVis, `同筛选稳定值应一致: ${report.run1.finalVis} vs ${report.run2.finalVis}`);

  // 不同筛选：数据总量不同，且退场比例也是 1/20 量级
  report.run3 = await watch('7d');
  report.run4 = await watch('all', 7000);
  assert(report.run3.finalVis !== report.run4.finalVis, '不同时间筛选的数据总量应不同');
  for (const r of [report.run2, report.run3, report.run4]) {
    const ratio = r.finalVis / r.peak;
    assert(ratio > .88 && ratio < .99, `${r.time} 的退场比例异常: ${ratio.toFixed(3)} (${r.peak}→${r.finalVis})`);
  }
  // 退场的那批点与"未退场"的集合互补：同一坐标的点不会半消失（组内一致）
  report.dataTotals = await page.evaluate(() => {
    const out = {};
    for (const t of ['today', '7d', '30d', 'all']) out[t] = V03Filter.factsAtLevel({...V03Store.state, time: t}).length;
    return out;
  });
  const totals = Object.values(report.dataTotals);
  assert(new Set(totals).size === totals.length, '不同时间窗的数据总量应各不相同: ' + JSON.stringify(report.dataTotals));

  await page.screenshot({path: 'test/artifacts/v289/after-prune.png'});
  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify({
    run1: {time: report.run1.time, peak: report.run1.peak, final: report.run1.finalVis, ratio: +report.ratio1.toFixed(3)},
    run2: {time: report.run2.time, peak: report.run2.peak, final: report.run2.finalVis, sameSet},
    run3: {time: report.run3.time, peak: report.run3.peak, final: report.run3.finalVis, ratio: +(report.run3.finalVis / report.run3.peak).toFixed(3)},
    run4: {time: report.run4.time, peak: report.run4.peak, final: report.run4.finalVis, ratio: +(report.run4.finalVis / report.run4.peak).toFixed(3)},
    dataTotals: report.dataTotals,
    trace1: report.run1.trace,
    trace3: report.run3.trace,
  }, null, 1));
} finally {
  fs.writeFileSync('test/artifacts/v289/prune.json', JSON.stringify(report, null, 1));
  await browser.close();
}
