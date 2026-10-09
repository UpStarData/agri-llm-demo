#!/usr/bin/env node
/* ============================================================
   LLM-291 关联层交互回归：三维地球 ⇄ 二维地图、逐级下钻、双指缩放、
   缩放按钮（单击 / 按住）、⌘+方向键面板开关、新数据光晕
   运行：node test/v107-relation-interactions.mjs
   ============================================================ */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = pathToFileURL(path.join(root, 'index.html')).href;
let failed = 0;
const assert = (ok, msg) => { if (!ok) { console.error('FAIL ' + msg); failed++; } else console.log('PASS ' + msg); };

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
    mode3d: V03Store.state.sk.mode3d, geoLevel: V03Store.state.geo.level,
    hint: document.querySelector('.rel-hint') ? document.querySelector('.rel-hint').textContent : '',
    zoom: V03Relation.debug().zoom, factZoom: V03Fact.debug().zoom,
    globe: V03Relation.debug().globe.radiusScale, factGlobe: V03Fact.debug().globeZoom
  }));
  /* 触控板双指缩放：Chrome 用 ctrl+wheel 表达 */
  const pinch = async (sel, n = 3, dy = -20) => {
    const b = await page.locator(sel).boundingBox();
    for (let i = 0; i < n; i++) {
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
      await page.keyboard.down('Control');
      await page.mouse.wheel(0, dy);
      await page.keyboard.up('Control');
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(300);
  };
  const dblAt = async (lng, lat) => {
    const px = await page.evaluate(c => echarts.getInstanceByDom(document.getElementById('relCanvas')).convertToPixel({ geoIndex: 0 }, c), [lng, lat]);
    const box = await page.locator('#relCanvas').boundingBox();
    await page.mouse.dblclick(box.x + px[0], box.y + px[1]);
    await page.waitForTimeout(1700);
  };

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

  /* ---------- 双指缩放（触控板）：三维 / 二维、两层都要生效 ---------- */
  await page.waitForTimeout(1200);
  const before3d = (await state()).globe;
  await pinch('#relGlobe', 2, -20);
  const after3d = await state();
  assert(after3d.globe > before3d, '关联层三维支持双指放大（' + before3d + ' → ' + after3d.globe + '）');
  if (after3d.view !== 'geo') await page.evaluate(() => V03Store.set({ rel: { view: 'geo' } }));
  await page.waitForTimeout(3600);
  const before2d = (await state()).zoom;
  await pinch('#relCanvas', 2, -20);
  assert((await state()).zoom > before2d, '关联层二维支持双指放大');
  await page.evaluate(() => V03Store.set({ tab: 'fact', sk: { mode3d: false }, geo: { level: 'L1', focus: null } }));
  await page.waitForTimeout(1600);
  const factBefore2d = (await state()).factZoom;
  await pinch('#factMap', 2, -20);
  assert((await state()).factZoom > factBefore2d, '事实层二维支持双指放大');
  await page.evaluate(() => V03Store.set({ sk: { mode3d: true } }));
  await page.waitForTimeout(1500);
  const factBefore3d = (await state()).factGlobe;
  await pinch('#factGlobe', 2, -20);
  assert((await state()).factGlobe > factBefore3d, '事实层三维支持双指放大');

  /* ---------- 缩放按钮：单击一格 + 按住连续 ---------- */
  await page.evaluate(() => V03Store.set({ tab: 'relation', rel: { view: 'geo', level: 'L1', focus: null } }));
  await page.waitForTimeout(3600);
  /* Safari 的触控板缩放是 gesturechange 事件（Chromium 里手工派发以覆盖这条分支） */
  const gBeforeState = await state();
  const gBefore = gBeforeState.zoom;
  await page.evaluate(() => {
    const el = document.getElementById('relCanvas');
    const fire = (type, scale) => {
      const ev = new Event(type, { bubbles: true, cancelable: true });
      ev.scale = scale; ev.rotation = 0; ev.clientX = 500; ev.clientY = 420;
      el.dispatchEvent(ev);
    };
    fire('gesturestart', 1);
    fire('gesturechange', 1.45);
    fire('gestureend', 1.45);
  });
  await page.waitForTimeout(400);
  const gAfterState = await state();
  assert(gAfterState.zoom > gBefore || gAfterState.level !== gBeforeState.level,
    'Safari 手势事件（gesturechange）同样能缩放（' + gBefore.toFixed(3) + ' → ' + gAfterState.zoom.toFixed(3) + ' · ' + gBeforeState.level + '→' + gAfterState.level + '）');
  const zbox = await page.locator('#mapSk .sk[data-k="zoomIn"]').boundingBox();
  const s0 = await state();
  const z0 = s0.zoom;
  await page.mouse.click(zbox.x + zbox.width / 2, zbox.y + zbox.height / 2);
  await page.waitForTimeout(500);
  const s1 = await state();
  const z1 = s1.zoom;
  await page.mouse.move(zbox.x + zbox.width / 2, zbox.y + zbox.height / 2);
  await page.mouse.down(); await page.waitForTimeout(1200); await page.mouse.up();
  await page.waitForTimeout(400);
  const z2 = (await state()).zoom;
  /* 已经靠近层级阈值时点一下会换层（缩放值被新层级重置），同样是「按了有效果」 */
  assert(z1 > z0 || s1.level !== s0.level, '＋ 按钮单击有效（' + z0.toFixed(2) + ' → ' + z1.toFixed(2) + (s1.level !== s0.level ? ' · 换层 ' + s0.level + '→' + s1.level : '') + '）');
  assert(z2 > z1 * 1.2, '＋ 按钮按住连续放大（→ ' + z2.toFixed(2) + '）');

  /* ---------- 逐级下钻：双击与点击都能下一级，Esc 返回 ---------- */
  await page.evaluate(() => V03Store.set({ rel: { view: 'geo', level: 'L1', focus: null } }));
  await page.waitForTimeout(3800);
  await dblAt(104, 34);
  let st = await state();
  assert(st.level === 'L2' && /中国/.test(st.hint), '双击地图进入中国视角（状态条同步）');
  await dblAt(112.9, 28.4);
  st = await state();
  assert(st.level === 'L3' && st.focus === '湖南', '双击省份进入省区视角（湖南）');
  const chart = await page.evaluate(() => {
    const c = echarts.getInstanceByDom(document.getElementById('relCanvas'));
    return { map: c.getOption().geo[0].map, nodes: c.getOption().series.find(s => s.id === 'relNode').data.length };
  });
  assert(chart.map === 'china' && chart.nodes > 0, '省区视角用中国地图且有本地点位');
  await page.keyboard.press('Escape'); await page.waitForTimeout(900);
  assert((await state()).level === 'L2', 'Esc 从省区返回全国');
  await page.keyboard.press('Escape'); await page.waitForTimeout(900);
  assert((await state()).level === 'L1', 'Esc 从全国返回全球');

  /* ---------- ⌘ / Win + 方向键：四周面板开关 ---------- */
  const panels = () => page.evaluate(() => ({ menu: V03Store.state.menu, cards: V03Store.state.panels.cards, stream: V03Store.state.panels.stream }));
  const p0 = await panels();
  await page.keyboard.press('Meta+ArrowLeft'); await page.waitForTimeout(250);
  const p1 = await panels();
  await page.keyboard.press('Meta+ArrowRight'); await page.waitForTimeout(250);
  const p2 = await panels();
  await page.keyboard.press('Meta+ArrowDown'); await page.waitForTimeout(250);
  const p3 = await panels();
  assert(p1.menu === !p0.menu, '⌘+← 开关左侧菜单');
  assert(p2.cards === !p1.cards, '⌘+→ 开关右侧面板');
  assert(p3.stream === !p2.stream, '⌘+↓ 开关底部流水');
  await page.keyboard.press('Meta+ArrowUp'); await page.waitForTimeout(400);
  assert(await page.evaluate(() => V03Store.state.sk.fullscreen || !!document.fullscreenElement), '⌘+↑ 进入全屏');
  await page.keyboard.press('Escape').catch(() => {});
  await page.evaluate(() => { V03Store.set({ menu: false, panels: { cards: true, stream: true } }); if (document.fullscreenElement) document.exitFullscreen(); });
  await page.waitForTimeout(400);

  /* ---------- 入场：先点亮本体，再逐条连线，最后持续流动 ---------- */
  await page.evaluate(() => V03Store.set({ tab: 'relation', rel: { view: 'globe', level: 'L1', focus: null } }));
  await page.waitForTimeout(400);
  await page.evaluate(() => V03Store.set({ rel: { view: 'geo' } }));
  const counts = async () => page.evaluate(() => {
    const c = echarts.getInstanceByDom(document.getElementById('relCanvas'));
    const opt = c.getOption();
    return {
      lines: (opt.series.find(s => s.id === 'relLine').data || []).length,
      nodes: (opt.series.find(s => s.id === 'relNode').data || []).length,
      flow: opt.series.filter(s => s.id.startsWith('relFlow-')).reduce((n, s) => n + (s.data || []).length, 0)
    };
  });
  await page.waitForTimeout(700);
  const early = await counts();
  await page.waitForTimeout(3400);
  const settled = await counts();
  assert(early.nodes > 0 && settled.nodes > early.nodes, '入场时本体逐个点亮（点位数量递增）');
  assert(settled.lines > early.lines && settled.lines > 0, '入场后关系线逐条画出');
  assert(settled.flow > 0, '关系线有持续流动的粒子层');

  /* ---------- 新数据：缓慢亮起再淡出一次（不循环闪烁） ---------- */
  await page.evaluate(() => V03Store.set({ panels: { stream: false } }));
  await page.waitForTimeout(300);
  const pulse = await page.evaluate(() => new Promise(res => {
    const c = echarts.getInstanceByDom(document.getElementById('relCanvas'));
    const read = () => {
      const s = (c.getOption().series || []).find(x => x.id === 'relFresh');
      const d = s ? (s.data || []) : [];
      return d.length ? Math.max(...d.map(x => (x.itemStyle && x.itemStyle.opacity) || 0)) : 0;
    };
    const samples = [];
    const t0 = performance.now();
    const tick = () => {
      samples.push(read());
      if (performance.now() - t0 > 9000) return res({ peak: Math.max(...samples), last: samples[samples.length - 1], samples: samples.length });
      setTimeout(tick, 250);
    };
    tick();
    const fact = V03Data.FACTS.find(f => f.lng != null && f.lat != null);
    setTimeout(() => V03Store.emit('stream:line', { fact, level: 'bright' }), 500);
  }));
  assert(pulse.peak > 0.2, '新数据光晕亮起（峰值 ' + pulse.peak.toFixed(2) + '）');
  assert(pulse.last === 0, '光晕随后淡出消失，不持续闪烁');

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
if (failed) { console.error('\n' + failed + ' 项未通过'); process.exit(1); }
console.log('\n关联层交互回归全部通过');
