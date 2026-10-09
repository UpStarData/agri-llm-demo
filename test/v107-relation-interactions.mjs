#!/usr/bin/env node
/* ============================================================
   V1.0.7 关联层交互回归：三维地球 ⇄ 二维地图、逐级下钻、新本体亮星与持续流动
   运行：node test/v107-relation-interactions.mjs
   ============================================================ */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = pathToFileURL(path.join(root, 'index.html')).href;
const assert = (ok, msg) => { if (!ok) { console.error('FAIL ' + msg); process.exitCode = 1; } else console.log('PASS ' + msg); };

const browser = await chromium.launch();
try {
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__AGRI_READY === true);

  const state = () => page.evaluate(() => ({
    view: V03Store.state.rel.view, level: V03Store.state.rel.level, focus: V03Store.state.rel.focus,
    mode3d: V03Store.state.sk.mode3d, geoLevel: V03Store.state.geo.level, hint: document.querySelector('.rel-hint') && document.querySelector('.rel-hint').textContent
  }));

  /* ---------- 关联层：三维放到最大 → 二维；二维缩到最小 → 三维 ---------- */
  await page.evaluate(() => V03Store.set({ tab: 'relation', rel: { view: 'globe', level: 'L1', focus: null } }));
  await page.waitForTimeout(1500);
  const gb = await page.locator('#relGlobe').boundingBox();
  for (let i = 0; i < 8; i++) { await page.mouse.move(gb.x + gb.width * .45, gb.y + gb.height * .5); await page.mouse.wheel(0, -240); await page.waitForTimeout(180); }
  assert((await state()).view === 'geo', '关联层三维放大到极致切二维地图');

  await page.waitForTimeout(3600);
  const cb = await page.locator('#relCanvas').boundingBox();
  for (let i = 0; i < 8; i++) { await page.mouse.move(cb.x + cb.width * .45, cb.y + cb.height * .5); await page.mouse.wheel(0, 260); await page.waitForTimeout(200); }
  assert((await state()).view === 'globe', '关联层二维缩到最小回三维地球');

  /* ---------- 关联层下钻：全球 → 中国 → 省区 → Esc 返回 ---------- */
  await page.evaluate(() => V03Store.set({ rel: { view: 'geo', level: 'L1', focus: null } }));
  await page.waitForTimeout(3600);
  await page.locator('.rel-hint').click();
  await page.waitForTimeout(2400);
  let st = await state();
  assert(st.level === 'L2' && /湖南/.test(st.hint || ''), '提示条进入中国视角并改文案');
  await page.locator('.rel-hint').click();
  await page.waitForTimeout(2400);
  st = await state();
  assert(st.level === 'L3' && st.focus === '湖南', '提示条进入省区视角（湖南）');
  const chart = await page.evaluate(() => {
    const c = echarts.getInstanceByDom(document.getElementById('relCanvas'));
    return { map: c.getOption().geo[0].map, nodes: c.getOption().series.find(s => s.id === 'relNode').data.length };
  });
  assert(chart.map === 'china' && chart.nodes > 0, '省区视角用中国地图且有本地点位');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);
  assert((await state()).level === 'L2', 'Esc 从省区返回全国');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(900);
  assert((await state()).level === 'L1', 'Esc 从全国返回全球');

  /* ---------- 入场：先点亮本体，再逐条连线，最后持续流动 ---------- */
  /* 先切到三维再切回，确保重新走一遍入场动画（同一个视图内不重播） */
  await page.evaluate(() => V03Store.set({ rel: { view: 'globe', level: 'L1', focus: null } }));
  await page.waitForTimeout(500);
  await page.evaluate(() => V03Store.set({ rel: { view: 'geo' } }));
  const counts = async () => page.evaluate(() => {
    const c = echarts.getInstanceByDom(document.getElementById('relCanvas'));
    const opt = c.getOption();
    const line = opt.series.find(s => s.id === 'relLine');
    const flows = opt.series.filter(s => s.id.startsWith('relFlow-'));
    return { lines: (line.data || []).length, nodes: (opt.series.find(s => s.id === 'relNode').data || []).length, flow: flows.reduce((n, s) => n + (s.data || []).length, 0) };
  });
  await page.waitForTimeout(700);
  const early = await counts();
  await page.waitForTimeout(3400);
  const settled = await counts();
  assert(early.nodes > 0 && settled.nodes > early.nodes, '入场时本体逐个点亮（点位数量递增）');
  assert(settled.lines > early.lines && settled.lines > 0, '入场后关系线逐条画出');
  assert(settled.flow > 0, '关系线有持续流动的粒子层');

  /* ---------- 新本体接入：亮星 + 连线；底部流水持续滚动 ---------- */
  const probe = await page.evaluate(() => new Promise(res => {
    let emits = 0, fresh = 0, flash = 0;
    V03Store.onEvent('stream:line', () => emits++);
    const t0 = performance.now();
    const tick = () => {
      const c = echarts.getInstanceByDom(document.getElementById('relCanvas'));
      const s = (c.getOption().series || []).find(x => x.id === 'relFresh');
      fresh = Math.max(fresh, s ? (s.data || []).length : 0);
      flash = Math.max(flash, V03Relation.debug().globe.flashes);
      if (performance.now() - t0 > 14000) return res({ emits, fresh, flash, logLines: document.querySelectorAll('#streamBody .st-line').length });
      setTimeout(tick, 400);
    };
    tick();
  }));
  assert(probe.emits >= 2, '底部流水持续滚动并发出新事实事件（' + probe.emits + ' 条）');
  assert(probe.fresh > 0, '二维地图出现新本体的星芒闪（' + probe.fresh + ' 个点）');
  assert(probe.logLines > 6, '底部日志持续写入（' + probe.logLines + ' 行）');

  /* ---------- 事实层：三维放到最大 → 二维；二维缩到最小 → 三维 ---------- */
  await page.evaluate(() => V03Store.set({ tab: 'fact', sk: { mode3d: true }, geo: { level: 'L1', focus: null } }));
  await page.waitForTimeout(1200);
  const fb = await page.locator('#factGlobe').boundingBox();
  for (let i = 0; i < 8; i++) { await page.mouse.move(fb.x + fb.width * .45, fb.y + fb.height * .5); await page.mouse.wheel(0, -240); await page.waitForTimeout(180); }
  assert((await state()).mode3d === false, '事实层三维放大到极致切二维地图');
  await page.waitForTimeout(900);
  for (let i = 0; i < 8; i++) { await page.mouse.move(700, 450); await page.mouse.wheel(0, 260); await page.waitForTimeout(200); }
  assert((await state()).mode3d === true, '事实层二维缩到最小回三维地球');

  /* ---------- 小屏不溢出、无控制台错误 ---------- */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => V03Store.set({ tab: 'relation', rel: { view: 'geo', level: 'L1', focus: null } }));
  await page.waitForTimeout(2600);
  const small = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth, chartW: document.getElementById('relCanvas').clientWidth }));
  assert(small.overflow <= 1, '390px 无横向溢出（' + small.overflow + '）');
  assert(small.chartW > 0, '390px 关联图画布有有效尺寸');
  assert(errors.length === 0, '无控制台错误' + (errors.length ? '：' + errors.slice(0, 2).join(' | ') : ''));
} finally {
  await browser.close();
}
