/* V2.8.5 事实层三项验收：
   ① 切换时间范围：点会消失（退场淡出），且不同时间窗铺点节奏不同；
   ② 2D 全球与 2D 中国一样按一级分类上色（large 模式不再吞掉逐点颜色）；
   ③ 叠加数据图层图标为内联 SVG（矢量、透明底），菜单图例同图标。 */
import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const browser = await chromium.launch();
const report = {errors: []};
fs.mkdirSync('test/artifacts/v285', {recursive: true});
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  page.on('pageerror', e => report.errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(process.env.AGRI_TEST_HTML || 'index.html')).href);
  await page.waitForFunction(() => window.__AGRI_READY);
  await page.evaluate(() => { V03Feed.complete(); V03Feed.stop(); V03Store.set({tab: 'fact', time: 'all', geo: {level: 'L1', focus: null}}); });
  await page.waitForTimeout(700);

  // ② 全球视角按分类上色
  report.world = await page.evaluate(() => {
    const opt = echarts.getInstanceByDom(document.querySelector('#factMap')).getOption();
    const s = opt.series.find(x => x.id === 'facts');
    const colors = [...new Set((s.data || []).map(d => (d.itemStyle || {}).color))];
    return {level: 'L1', points: (s.data || []).length, large: s.large === true, distinctColors: colors.length,
      allClassColors: colors.every(c => V03Theme.factList.includes(c)), palette: V03Theme.factList};
  });
  assert.equal(report.world.large, false, '全球视角不能再用 large 模式（会吞掉逐点填充色）');
  assert(report.world.distinctColors >= 5, JSON.stringify(report.world));
  assert(report.world.allClassColors, JSON.stringify(report.world));
  await page.screenshot({path: 'test/artifacts/v285/world-colored.png'});

  // ① 时间窗：数据量随窗口收窄递减，且切换时有退场动画
  report.windows = await page.evaluate(async () => {
    const out = {};
    const drawn = () => {
      const opt = echarts.getInstanceByDom(document.querySelector('#factMap')).getOption();
      const s = opt.series.find(x => x.id === 'facts');
      return (s.data || []).length;
    };
    for (const t of ['all', '365d', '180d', '30d', '7d', 'today']) {
      V03Store.set({time: t});
      await new Promise(r => setTimeout(r, 3600));
      out[t] = {facts: V03Filter.factsAtLevel().length, drawn: drawn()};
    }
    return out;
  });
  const order = ['all', '365d', '180d', '30d', '7d', 'today'];
  for (let i = 1; i < order.length; i++) {
    assert(report.windows[order[i]].facts < report.windows[order[i - 1]].facts,
      `时间窗收窄后事实数应减少: ${order[i - 1]}=${report.windows[order[i - 1]].facts} → ${order[i]}=${report.windows[order[i]].facts}`);
  }
  assert(report.windows.today.facts >= 500, '今天窗口不应为空: ' + report.windows.today.facts);

  // 会话内「第一次」切时间也必须有退场层（验收发现的边界：exitLevel 初始 null 时为瞬时消失）
  report.firstSwitch = await page.evaluate(async () => {
    const opt0 = () => echarts.getInstanceByDom(document.querySelector('#factMap')).getOption();
    V03Store.set({time: 'all'});
    await new Promise(r => setTimeout(r, 3600));
    const before = (opt0().series.find(x => x.id === 'facts').data || []).length;
    V03Store.set({time: '30d'});           // 本次会话第一次切窗
    const seen = [];
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 200));
      const ser = opt0().series.find(x => x.id === 'factExit');
      seen.push({present: !!ser, points: ser ? (ser.data || []).length : 0, opacity: ser ? Number((ser.itemStyle || {}).opacity) : null});
    }
    return {before, seen};
  });
  assert(report.firstSwitch.seen.some(s => s.present && s.points > 100),
    '第一次切换时间窗也应有退场层: ' + JSON.stringify(report.firstSwitch.seen));

  // 退场动画：切回 all 再切到 today，采样 factExit 的不透明度轨迹
  report.exit = await page.evaluate(async () => {
    V03Store.set({time: 'all'});
    await new Promise(r => setTimeout(r, 3600));
    const before = (() => {
      const opt = echarts.getInstanceByDom(document.querySelector('#factMap')).getOption();
      return (opt.series.find(x => x.id === 'facts').data || []).length;
    })();
    V03Store.set({time: 'today'});
    const samples = [];
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 260));
      const opt = echarts.getInstanceByDom(document.querySelector('#factMap')).getOption();
      const ser = opt.series.find(x => x.id === 'factExit');
      samples.push({t: i * 260, present: !!ser, points: ser ? (ser.data || []).length : 0,
        opacity: ser ? Number((ser.itemStyle || {}).opacity) : null,
        drawn: (opt.series.find(x => x.id === 'facts').data || []).length});
    }
    return {beforeDrawn: before, samples};
  });
  const withExit = report.exit.samples.filter(s => s.present);
  assert(withExit.length > 0, '切换时间范围时应出现退场图层: ' + JSON.stringify(report.exit.samples.slice(0, 4)));
  assert(withExit[0].points > 100, '退场点数太少: ' + withExit[0].points);
  assert(withExit.at(-1).opacity < withExit[0].opacity + 1e-9, '退场图层透明度应随时间下降');

  // ③ 叠加图层图标：内联 SVG
  report.icons = await page.evaluate(() => {
    V03Store.set({time: 'all', sk: {regions: true, gates: true, airports: true, markets: true, risks: true}, menu: true});
    return null;
  });
  await page.waitForTimeout(700);
  report.icons = await page.evaluate(() => {
    const opt = echarts.getInstanceByDom(document.querySelector('#factMap')).getOption();
    const ids = ['regions', 'gatesP', 'gatesA', 'markets', 'risks'];
    const symbols = ids.map(id => {
      const s = opt.series.find(x => x.id === id);
      return {id, has: !!s, symbol: s ? String(s.symbol || '').slice(0, 40) : '', points: s ? (s.data || []).length : 0};
    });
    const legend = [...document.querySelectorAll('.mn-overlay .mn-ov-ic svg')].length;
    const emojiLabels = [...document.querySelectorAll('.mn-overlay span')].filter(sp => /[\u{1F300}-\u{1FAFF}\u2693\u26A0]/u.test(sp.textContent || '')).length;
    return {symbols, legendSvgs: legend, emojiLabels};
  });
  assert(report.icons.symbols.every(x => x.symbol.startsWith('image://data:image/svg+xml')), JSON.stringify(report.icons.symbols));
  assert(report.icons.legendSvgs === 5, '菜单图例应有 5 个 SVG 图标: ' + report.icons.legendSvgs);
  assert.equal(report.icons.emojiLabels, 0, '菜单图例不应再用 emoji 字形');
  await page.screenshot({path: 'test/artifacts/v285/overlay-icons.png'});

  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify(report, null, 1));
} finally {
  fs.writeFileSync('test/artifacts/v285/factlayer.json', JSON.stringify(report, null, 1));
  await browser.close();
}
