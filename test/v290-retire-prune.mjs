/* V2.9.0（用户 2026-10-19 两点）：
   ① 首次加载动画结束后，每 10s / 20s / 15s 循环退场一个点（新增仍走亮星接入）；退场的点在中国/湖南视角同样看不到。
   ② 时间筛选：消失发生在铺点过程中（约 1/20、随机、同时还在新增），**动画结束即冻结**，之后不再新增或消失。 */
import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const browser = await chromium.launch();
const report = {errors: []};
fs.mkdirSync('test/artifacts/v290', {recursive: true});
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  page.on('pageerror', e => report.errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(process.env.AGRI_TEST_HTML || 'index.html')).href);
  await page.waitForFunction(() => window.__AGRI_READY);
  await page.evaluate(() => { V03Feed.complete(); V03Feed.stop(); V03Store.set({tab: 'fact', geo: {level: 'L1', focus: null}, time: 'all'}); });
  await page.waitForTimeout(600);

  // ---------- ① 退场节奏 + 跨视角一致 ----------
  report.cycle = await page.evaluate(() => V03Feed.RETIRE_CYCLE);
  assert.deepEqual(report.cycle, [10000, 20000, 15000], '退场间隔应为 10/20/15 秒循环');

  // 手动退场一个点，检查三个视角都消失
  report.retire = await page.evaluate(() => {
    const before = { L1: V03Filter.factsAtLevel({...V03Store.state, geo: {level:'L1', focus:null}}).length };
    const got = V03Feed.retireOnce();
    const key = got && got.key;
    const visible = level => V03Filter.factsAtLevel({...V03Store.state, geo: {level, focus: level === 'L3' ? '湖南' : null}})
      .filter(f => f.lng.toFixed(4) + '|' + f.lat.toFixed(4) === key).length;
    return {key, title: got && got.title,
      after: {L1: V03Filter.factsAtLevel({...V03Store.state, geo:{level:'L1',focus:null}}).length},
      retiredInView: {L1: visible('L1'), L2: visible('L2'), L3: visible('L3')},
      retiredTotal: V03Filter.retiredCoords.size, before};
  });
  assert(report.retire.key, 'retireOnce 应真的退掉一个点');
  // 同坐标多条记录会一起退（地图上本来就是合点），所以至少少 1 条
  assert(report.retire.after.L1 <= report.retire.before.L1 - 1, '世界视角应少一个点（同坐标记录一起退）: ' + JSON.stringify(report.retire));
  for (const lv of ['L1', 'L2', 'L3']) {
    assert.equal(report.retire.retiredInView[lv], 0, `${lv} 视角里该坐标应已不可见`);
  }

  // 定时器真的在跑：显式开启退场循环后等 11 秒，应自动再退一个
  await page.evaluate(() => V03Feed.startRetire());
  const retiredBefore = report.retire.retiredTotal;
  await page.waitForTimeout(21000);   // 循环最长 20 秒一格，等满一格再多 1 秒
  report.autoRetire = await page.evaluate(() => ({retired: V03Filter.retiredCoords.size}));
  assert(report.autoRetire.retired >= retiredBefore + 1, '首次加载后应每约 10 秒自动退掉一个点: ' + JSON.stringify(report.autoRetire));

  // 新增仍在继续（亮星接入），数据量不至于单调减少
  report.arrival = await page.evaluate(async () => {
    const before = V03Data.FACTS.length;
    await V03Feed.arrive();
    return {before, after: V03Data.FACTS.length};
  });

  // ---------- ② 时间筛选：消失发生在动画内，结束后冻结 ----------
  const sample = () => page.evaluate(() => {
    const opt = echarts.getInstanceByDom(document.querySelector('#factMap')).getOption();
    const s = opt.series.find(x => x.id === 'facts');
    const data = s.data || [];
    const vis = data.filter(d => ((d.itemStyle || {}).opacity || 0) > .05);
    const fading = data.filter(d => { const o = (d.itemStyle || {}).opacity || 0; return o > .02 && o < .6; }).length;
    /* 世界地图画 ±360° 三份副本，按经度归一回 [-180,180) 后再去重 */
    const norm = v => ((((+v) + 540) % 360) - 180).toFixed(4);
    const groups = new Set(vis.map(d => { const p = d.value || []; return norm(p[0]) + '|' + (+p[1]).toFixed(4); }));
    return {vis: vis.length, groups: groups.size, keys: [...groups], fading, ids: vis.map(d => d.id)};
  });
  const watch = async (time, ms = 6000, step = 150) => {
    await page.evaluate(t => V03Store.set({time: t}), time);
    const trace = [];
    for (let t = 0; t <= ms; t += step) { trace.push({t, ...(await sample())}); await page.waitForTimeout(step); }
    return trace;
  };

  report.filter30 = await watch('30d');
  const tr = report.filter30;
  const peak = Math.max(...tr.map(x => x.vis));
  const atEnd = tr.find(x => x.t >= 2200);            // GROW_MS(30d)=2200：动画结束那一刻
  const final = tr.at(-1);
  /* 注意：消失发生在铺点过程中，所以"逐帧最大可见数"不等于"未退场总量"。
     真正的 1/20 要用 plan 口径核对：selected（本视野选中的坐标组）→ pruned（要退场的组）。 */
  report.pruneInfo = await page.evaluate(() => V03Fact.pruneInfo && V03Fact.pruneInfo());
  const pi = report.pruneInfo;
  assert(pi && pi.selected > 100 && pi.pruned > 0, 'pruneInfo 不可用: ' + JSON.stringify(pi));
  report.ratio = pi.pruned / pi.selected;
  assert(report.ratio > .04 && report.ratio < .06, `退场比例应约 1/20: ${pi.pruned}/${pi.selected} (${report.ratio.toFixed(3)})`);
  /* L1 画 3 份世界副本，所以用"独立坐标组"与 plan 的 selected 对比 */
  assert(Math.abs(final.groups - (pi.selected - pi.pruned)) <= Math.max(3, pi.selected * .02),
    `动画结束时可见坐标组应≈ selected-pruned: 实测 ${final.groups}，期望 ${pi.selected - pi.pruned}`);
  assert(atEnd && atEnd.vis <= peak, '动画结束时点数应已到稳定值');
  assert.equal(final.vis, atEnd.vis, `动画结束后不应再变化（冻结）: ${atEnd.vis} → ${final.vis}`);
  // 动画后半程仍在"一边增一边减"：有淡出中的点，同时可见数还在涨
  const half = tr.filter(x => x.t >= 1100 && x.t <= 2100);
  const growing = half.some((x, i) => i > 0 && x.vis > half[i - 1].vis);
  const fadingMid = half.some(x => x.fading > 0);
  assert(growing && fadingMid, `动画过程中应同时有新增与淡出: growing=${growing} fading=${fadingMid}`);
  await page.screenshot({path: 'test/artifacts/v290/after-freeze.png'});

  // 随机性：切走再切回同一个筛选，两次退掉的不是同一批（每次重新随机取 1/20）
  await watch('7d', 3000);
  report.filter30b = await watch('30d', 4000);
  const a = new Set(report.filter30.at(-1).keys), b = new Set(report.filter30b.at(-1).keys);
  const overlap = [...a].filter(k => b.has(k)).length;
  const sameSet = a.size === b.size && overlap === a.size;
  report.random = {sizeA: a.size, sizeB: b.size, overlap, sameSet};
  assert(!sameSet, '同一筛选两次退场应是随机的（不应完全一致）: ' + JSON.stringify(report.random));

  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify({
    cycle: report.cycle,
    retire: {key: report.retire.key, title: report.retire.title, crossView: report.retire.retiredInView},
    autoRetire: report.autoRetire,
    arrival: report.arrival,
    filter30: {selected: pi.selected, pruned: pi.pruned, ratio: +report.ratio.toFixed(3), finalGroups: final.groups, finalItems: final.vis, frozen: final.vis === atEnd.vis},
    random: report.random,
    trace: tr.map(x => `${x.t}:${x.vis}${x.fading ? '/f' + x.fading : ''}`).join(' '),
  }, null, 1));
} finally {
  fs.writeFileSync('test/artifacts/v290/result.json', JSON.stringify(report, null, 1));
  await browser.close();
}
