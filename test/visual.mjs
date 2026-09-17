#!/usr/bin/env node
/* ============================================================
   农链 AgriLink — 视觉 / 布局验收（Playwright）
   与 e2e.mjs 分开：e2e 保交互回归，本文件保「细节精修」的版面质量。
   视口：桌面 1440×900 / 1920×1080 · 移动 390×844
   运行：node test/visual.mjs      报告：test/report-visual.md
   ============================================================ */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'file://' + path.join(root, 'index.html');
const SHOTS = path.join(root, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined && detail !== '' ? '  — ' + detail : ''}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------------- 页面内度量工具（在浏览器里执行） ---------------- */
const PROBE = {
  // 所有「有直接文本」的可见元素字号
  textSizes: () => Array.from(document.querySelectorAll('body *')).filter(el => {
    if (!Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim())) return false;
    const c = getComputedStyle(el), r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && c.display !== 'none' && +c.opacity > 0;
  }).map(el => ({ t: el.textContent.trim().slice(0, 18), fs: +parseFloat(getComputedStyle(el).fontSize).toFixed(2), cls: String(el.className) })),
  // 文本对比度（沿祖先解析实际背景色，半透明按 alpha 混合）
  contrast: () => {
    const lin = v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    const parse = s => { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null;
      const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const mix = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
    const lum = c => 0.2126 * lin(c.r / 255) + 0.7152 * lin(c.g / 255) + 0.0722 * lin(c.b / 255);
    const cr = (a, b) => { const l1 = lum(a), l2 = lum(b); const [x, y] = l1 > l2 ? [l1, l2] : [l2, l1]; return (x + 0.05) / (y + 0.05); };
    const backdrop = el => {
      let acc = { r: 255, g: 255, b: 255, a: 1 }, node = el;
      const stack = [];
      while (node && node !== document.documentElement) { const c = parse(getComputedStyle(node).backgroundColor); if (c && c.a > 0) stack.push(c); node = node.parentElement; }
      for (const c of stack.reverse()) acc = mix(c, acc);
      return acc;
    };
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!Array.from(el.childNodes).some(n => n.nodeType === 3 && n.textContent.trim())) continue;
      const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
      const c = getComputedStyle(el); if (c.visibility === 'hidden' || c.display === 'none' || +c.opacity === 0) continue;
      if (el.closest('#scene-l1') || el.closest('#scene-l2') || el.closest('#scene-l3')) { /* canvas 上的浮层也要查 */ }
      const fg = parse(c.color); if (!fg || fg.a === 0) continue;
      const bg = backdrop(el);
      const ratio = cr(mix(fg, bg), bg);
      if (ratio < 4.5) out.push({ t: el.textContent.trim().slice(0, 16), cls: String(el.className).slice(0, 24), fs: c.fontSize, ratio: +ratio.toFixed(2) });
    }
    return out;
  },
  // 矩形两两重叠
  overlaps: sels => {
    const rs = sels.map(s => { const el = document.querySelector(s);
      if (!el) return { s, r: null };
      const b = el.getBoundingClientRect();
      const c = getComputedStyle(el);
      if (b.width < 1 || b.height < 1 || c.display === 'none' || c.visibility === 'hidden' || +c.opacity === 0) return { s, r: null };
      return { s, r: { x: b.x, y: b.y, w: b.width, h: b.height } }; }).filter(x => x.r);
    const hits = [];
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i].r, b = rs[j].r;
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 2 && oy > 2) hits.push(`${rs[i].s} × ${rs[j].s} (${ox.toFixed(0)}×${oy.toFixed(0)}px)`);
    }
    return { checked: rs.map(x => x.s), hits };
  },
  rects: sels => sels.map(s => { const el = document.querySelector(s); if (!el) return { s, r: null };
    const b = el.getBoundingClientRect(); return { s, r: { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) } }; }),
  canvasHash: sel => { const cv = document.querySelector(sel); if (!cv) return null;
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let h = 0, ink = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 8) { ink++; h = (h * 31 + i + d[i] + d[i + 1] + d[i + 2]) % 2147483647; } }
    return { ink, h }; },
  pseudo: sel => { const el = document.querySelector(sel); if (!el) return null; const c = getComputedStyle(el, '::before');
    return { content: c.content, opacity: c.opacity, display: c.display }; },
  scroll: () => ({ sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight }),
  rootFont: () => getComputedStyle(document.documentElement).fontSize,
  focusRing: () => { const el = document.activeElement; if (!el) return null; const c = getComputedStyle(el);
    return { tag: el.tagName, cls: String(el.className), outline: c.outlineStyle, w: c.outlineWidth, color: c.outlineColor }; }
};

/* ---------------- 导航辅助（与 e2e 同法，保证同一套交互路径） ---------------- */
const state = page => page.evaluate(() => window.AGRI_DEBUG.state());
const waitLayer = async (page, n, timeout = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if ((await state(page)).layer === n) return true; await sleep(80); }
  return false;
};
const waitIdle = async page => { await page.waitForFunction(() => !window.AGRI_DEBUG.state().flying, null, { timeout: 6000 }).catch(() => {}); await sleep(250); };
const waitCamera = async (page, timeout = 7000) => {
  const t0 = Date.now(); let prev = null;
  while (Date.now() - t0 < timeout) { const s = await state(page); const p = s.layer === 3 ? s.l3.pose : s.l2.pose;
    if (prev && Math.abs(p.zoom - prev.zoom) < 0.004) return true; prev = p; await sleep(150); }
  return false;
};
async function clickGlobeHit(page, kind, id, touch) {
  const hits = await page.evaluate(() => window.AGRI_DEBUG.globeHits());
  const box = await page.evaluate(() => window.AGRI_DEBUG.globeBox());
  let list = kind === 'arc' ? hits.arcs : hits.nodes.filter(n => (kind === 'china' ? n.china : !n.china));
  if (id) list = list.filter(h => h.id === id);
  for (const h of list.slice(0, 10)) {
    const p = await page.evaluate(([x, y]) => window.AGRI_DEBUG.globePick(x, y), [h.x, h.y]);
    if (!p || (id && p.id !== id)) continue;
    if (touch) await page.touchscreen.tap(box.x + h.x, box.y + h.y); else await page.mouse.click(box.x + h.x, box.y + h.y);
    return h.id;
  }
  return null;
}
async function clickMapPoint(page, which, lnglat) {
  const p = await page.evaluate(([w, c]) => window.AGRI_DEBUG.mapXY(w, c), [which, lnglat]);
  if (!p) return false;
  await page.mouse.click(p.x, p.y); await sleep(450); return true;
}
async function enterL2(page, id) {
  // 选中该流向（对象驱动），再在球面上点击同一对象 → 进入 L2
  await page.evaluate(i => window.AGRI_UI.onGlobeSelect({ kind: 'arc', id: i }), id);
  await sleep(1100);
  await clickGlobeHit(page, 'arc', id);
  const ok = await waitLayer(page, 2); await waitIdle(page); return ok;
}
async function gotoL3(page, lnglat, which = 'l2') {
  await clickMapPoint(page, which, lnglat); await clickMapPoint(page, which, lnglat);
  const ok = await waitLayer(page, 3); await waitIdle(page); await waitCamera(page); return ok;
}

const PROBE_INIT = 'window.__P = {' + Object.entries(PROBE).map(([k, v]) => k + ':' + v.toString()).join(',') + '};';
async function newPage(browser, { width, height, mobile }) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: !!mobile, hasTouch: !!mobile, deviceScaleFactor: 1 });
  await ctx.addInitScript({ content: PROBE_INIT });
  const page = await ctx.newPage();
  await page.route('**/*', route => route.request().url().startsWith('file://') ? route.continue() : route.abort());
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  return { ctx, page };
}

/* ============================ 1440×900 ============================ */
async function desktop1440(browser) {
  const { ctx, page } = await newPage(browser, { width: 1440, height: 900 });

  /* --- 首页：排版与节奏 --- */
  const land = await page.evaluate(sels => __P.rects(sels), ['.land-top', '.kicker', '.land-title', '.land-sub', '.land-struct', '.land-cta', '.land-foot']);
  const xs = land.map(x => x.r && x.r.x).filter(v => v != null);
  check('首页：品牌 / 标题 / 说明 / 层级 / CTA / 免责声明共用一条左基线', xs.length === 7 && Math.max(...xs) - Math.min(...xs) <= 1,
    land.map(x => `${x.s.replace('.land-', '').replace('.', '')}=${x.r ? x.r.x : 'x'}`).join(' '));

  const structCols = await page.evaluate(() => {
    const li = Array.from(document.querySelectorAll('#landing .land-struct li'));
    const col = (sel) => li.map(x => { const el = x.querySelector(sel); const r = el.getBoundingClientRect(); return +r.x.toFixed(1); });
    return { em: col('em'), small: col('small'), n: li.length };
  });
  const span = a => Math.max(...a) - Math.min(...a);
  check('首页：四层说明按「序号 / 层级词 / 说明」三列对齐', structCols.n === 4 && span(structCols.em) <= 1 && span(structCols.small) <= 1,
    `em=${structCols.em.join(',')} small=${structCols.small.join(',')}`);

  const scr0 = await page.evaluate(() => __P.scroll());
  const foot = land.find(x => x.s === '.land-foot').r;
  check('首页：一屏内完成（无纵向滚动）且免责声明在首屏', scr0.sh <= scr0.ih + 1 && foot.y + foot.h <= scr0.ih + 1,
    `scrollH=${scr0.sh}/${scr0.ih} footBottom=${(foot.y + foot.h).toFixed(0)}`);

  await page.locator('#landing .land-struct li').first().click();
  await sleep(150);
  check('首页：层级词仍是说明文字（点击不进入系统，唯一 CTA 不变）',
    await page.locator('#landing .btn-primary').count() === 1 && !(await page.locator('#app').evaluate(e => e.classList.contains('on'))));

  const landSizes = await page.evaluate(() => __P.textSizes());
  const landSmall = landSizes.filter(x => x.fs < 12);
  check('首页：无小于 12px 的正文（投屏可读）', landSmall.length === 0, landSmall.map(x => `${x.fs}px ${x.t}`).join(' | ') || '0 处');

  const landCr = await page.evaluate(() => __P.contrast());
  check('首页：全部文本对比度 ≥4.5:1（含免责声明 / 说明文字）', landCr.length === 0, landCr.map(x => `${x.ratio}:1 ${x.fs} ${x.t}`).join(' | ') || '0 处不达标');
  await page.screenshot({ path: path.join(SHOTS, '10-landing-1440.png') });

  /* --- 进入系统：布局与浮层 --- */
  await page.locator('#enterBtn').click();
  await sleep(900);
  const scr1 = await page.evaluate(() => __P.scroll());
  const boxes = await page.evaluate(sels => __P.rects(sels), ['.topbar', '#stage', '#side']);
  check('主界面：顶栏 + 舞台精确铺满一屏（不再有 2px 硬编码错位）',
    scr1.sh <= scr1.ih + 1 && boxes[1].r.h + boxes[0].r.h === scr1.ih,
    `topbar=${boxes[0].r.h} stage=${boxes[1].r.h} viewport=${scr1.ih}`);

  const aiIdle = await page.evaluate(() => ({ send: document.querySelector('#aiSend').disabled, input: document.querySelector('#aiInput').disabled }));
  check('全局：未选中对象时 AI 提问为禁用态（不给假入口）', aiIdle.send === true && aiIdle.input === true, JSON.stringify(aiIdle));
  const ov1 = await page.evaluate(sels => __P.overlaps(sels), ['#scene-l1 .scene-head', '#legendL1', '#scene-l1 .scene-hint']);
  check('L1：层头 / 图例 / 操作提示三块浮层互不重叠', ov1.hits.length === 0,
    ov1.checked.join(' + ') + (ov1.hits.length ? ' → ' + ov1.hits.join(', ') : ' → 0 重叠'));

  const lg1 = await page.evaluate(() => window.AGRI_DEBUG.legend('legendL1'));
  check('L1：克制品类符号（Emoji 图例）已作为识别辅助，不进入画面装饰', lg1 && lg1.items.length >= 4 && /水果/.test(lg1.items.join()) && /蔬菜/.test(lg1.items.join()),
    lg1 && lg1.items.join(' / '));

  await page.evaluate(() => document.querySelector('#side .rel li[data-id="f:CL"]').click());
  await sleep(1100);
  const tipHasCat = await page.evaluate(() => {
    const info = window.AGRI_DEBUG.globeHits();
    return !!info;
  });
  const aiRaw = await page.evaluate(() => window.AGRI_DEBUG.aiText());
  check('全局：AI 回答里的粗体标记被渲染（不裸出 ** 星号）', !/\*\*/.test(aiRaw), aiRaw.split('\n')[0].slice(0, 40));
  check('L1：选中流向 → 右侧面板按「量级 → 结构 → 节奏 → 口径」分层', tipHasCat && await page.evaluate(() => {
    const secs = Array.from(document.querySelectorAll('#side .sec > h5')).map(x => x.textContent);
    return secs.join('|') === '量级与同比|结构|月度节奏' && /口径：/.test(document.querySelector('#side .caliber').textContent);
  }), 'sections=量级与同比|结构|月度节奏 + 口径');
  await page.screenshot({ path: path.join(SHOTS, '12-l1-flow-1440.png') });

  /* --- 全局：字号 / 对比度 / 焦点 --- */
  const appSizes = await page.evaluate(() => __P.textSizes());
  const appSmall = appSizes.filter(x => x.fs < 12);
  check('全局：主界面无小于 12px 的正文', appSmall.length === 0, appSmall.map(x => `${x.fs}px ${x.t}`).join(' | ') || `${appSizes.length} 处文本全部 ≥12px`);
  const appCr = await page.evaluate(() => __P.contrast());
  check('全局：主界面文本对比度全部 ≥4.5:1', appCr.length === 0, appCr.map(x => `${x.ratio}:1 ${x.fs} ${x.t}`).join(' | ') || '0 处不达标');

  for (let i = 0; i < 4; i++) await page.keyboard.press('Tab');
  const ring = await page.evaluate(() => __P.focusRing());
  check('全局：键盘 Tab 焦点有可见外圈（focus-visible）', ring && ring.outline !== 'none' && parseFloat(ring.w) > 0,
    ring && `${ring.tag}.${ring.cls} outline=${ring.outline} ${ring.w}`);
  const afterTab = await page.evaluate(() => {
    const st = document.querySelector('#stage');
    st.scrollLeft = 999; st.scrollTop = 999;                 // 试图把舞台滚走（关着的抽屉曾制造 408px 隐藏滚动区）
    const shifted = st.scrollLeft !== 0 || st.scrollTop !== 0;
    return { x: window.scrollX, y: window.scrollY, sw: document.documentElement.scrollWidth, iw: innerWidth,
      shifted, stageX: st.getBoundingClientRect().x };
  });
  check('全局：键盘遍历 + 舞台不可被滚走（隐藏层不进 Tab 顺序，舞台无隐藏滚动区）',
    afterTab.x === 0 && afterTab.y === 0 && afterTab.sw <= afterTab.iw + 1 && !afterTab.shifted && afterTab.stageX === 0,
    `scroll=${afterTab.x},${afterTab.y} 舞台可被滚动=${afterTab.shifted} 舞台x=${afterTab.stageX}`);

  /* --- L2 --- */
  check('进入 L2（供后续版面检查）', await enterL2(page, 'CL'));
  await waitCamera(page);
  const lg2 = await page.evaluate(() => window.AGRI_DEBUG.legend('legendL2'));
  check('L2：新增图层图例（供给 / 调运 / 底色 / 进口直达）', lg2 && lg2.items.length === 4 && /供给/.test(lg2.items.join()) && /调运线/.test(lg2.items.join()) && /底色/.test(lg2.items.join()) && /进口直达/.test(lg2.items.join()),
    lg2 && lg2.items.join(' / '));
  const ov2 = await page.evaluate(sels => __P.overlaps(sels), ['#scene-l2 .scene-head', '#legendL2', '#scene-l2 .scene-hint']);
  check('L2：层头 / 图例 / 提示三块浮层互不重叠', ov2.hits.length === 0, ov2.hits.join(', ') || '0 重叠');
  await page.screenshot({ path: path.join(SHOTS, '13-l2-national-1440.png') });

  const scale = await page.evaluate(() => window.AGRI_DEBUG.bubbleScale());
  const guards = await page.evaluate(() => window.AGRI_DEBUG.overlapGuard('l2'));
  check('L2：供给气泡尺寸编码有可读梯度（最大 / 最小 ≥1.8×）且标签启用防重叠',
    scale.sup[1] / scale.sup[0] >= 1.8 && guards.indexOf('prov') >= 0,
    `半径 ${scale.sup[0].toFixed(0)}→${scale.sup[1].toFixed(0)}px ｜ hideOverlap=${guards.join(',')}`);
  await page.locator('#lgDirect').click();
  await sleep(900);
  const lg2on = await page.evaluate(() => window.AGRI_DEBUG.legend('legendL2'));
  check('L2：进口直达线裁剪在图内（不出现图外游离虚线）', await page.evaluate(() => window.AGRI_DEBUG.directClip()));
  check('L2：图例与图层开关联动（勾选后图例进入开态且图层叠加）',
    lg2on.directOn === true && (await state(page)).l2.direct === true && await page.locator('#directToggle').isChecked());
  await page.screenshot({ path: path.join(SHOTS, '14-l2-direct-1440.png') });
  await page.locator('#lgDirect').click();
  await sleep(900);

  /* --- L2 选中态：供给 + 流通 视觉区分 --- */
  await clickMapPoint(page, 'l2', [85.5, 40]);                // 新疆
  await sleep(500);
  const selInfo = await page.evaluate(() => ({ sel: window.AGRI_DEBUG.selLabel(), lit: window.AGRI_DEBUG.state().l2.lit }));
  check('L2：选中省份 → 地图进入「选中态」（其余省份与无关调运线压到背景层）', selInfo.sel === 'prov:新疆' && selInfo.lit === 14, `sel=${selInfo.sel} lit=${selInfo.lit}`);

  /* --- L3 --- */
  await clickMapPoint(page, 'l2', [85.5, 40]);                // 再次点击 → L3
  check('进入 L3（新疆）', await waitLayer(page, 3));
  await waitIdle(page); await waitCamera(page);
  const railProv = await page.evaluate(() => window.AGRI_DEBUG.l3Rail());
  const hashProv = await page.evaluate(() => __P.canvasHash('#l3Radar'));
  check('L3：分析卡片标注当前对象 = 全省均值，雷达标题含该省',
    /新疆\s*·\s*全省均值/.test(railProv.obj) && /新疆均值/.test(railProv.radarTitle) && railProv.facts.length === 4,
    `${railProv.obj} ｜ ${railProv.radarTitle} ｜ ${railProv.radarCap}`);
  const ov3 = await page.evaluate(sels => __P.overlaps(sels), ['#scene-l3 .scene-head', '#l3Extras', '#scene-l3 .scene-hint']);
  check('L3：分析卡片不再与底部提示条重叠', ov3.hits.length === 0, ov3.hits.join(', ') || '0 重叠');
  await page.screenshot({ path: path.join(SHOTS, '15-l3-province-1440.png') });

  await clickMapPoint(page, 'l3', [76.73, 39.49]);            // 伽师
  await sleep(700);
  const railCity = await page.evaluate(() => window.AGRI_DEBUG.l3Rail());
  const hashCity = await page.evaluate(() => __P.canvasHash('#l3Radar'));
  check('L3：选中产区 → 分析卡片切换为该产区口径（旧版分析卡片复用）',
    /伽师/.test(railCity.obj) && /伽师/.test(railCity.radarTitle) && /虚线 = 新疆均值/.test(railCity.radarCap),
    `${railCity.obj} ｜ ${railCity.radarTitle} ｜ ${railCity.radarCap}`);
  const clearance = await page.evaluate(() => { const p = window.AGRI_DEBUG.mapXY('l3', [76.73, 39.49]);
    const r = window.AGRI_DEBUG.rect('#l3Extras');
    return { gap: Math.round(r.y - p.y), inside: p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h }; });
  check('L3：被选中的产区节点不被分析卡片遮住', !clearance.inside && clearance.gap >= 8, `节点距卡片上沿 ${clearance.gap}px`);
  check('L3：雷达图形随对象变化（不是全省均值那张图）', hashCity && hashProv && hashCity.h !== hashProv.h && hashCity.ink > 500,
    `ink ${hashProv.ink} → ${hashCity.ink}`);
  const guards3 = await page.evaluate(() => window.AGRI_DEBUG.overlapGuard('l3'));
  check('L3：城市标签启用防重叠（拥挤产区不再压字）', guards3.indexOf('city') >= 0, `hideOverlap=${guards3.join(',')}`);
  await page.mouse.move(6, 6); await sleep(200);   // 移开指针，避免地图悬浮卡进入截图
  const barsOn = await page.evaluate(() => window.AGRI_DEBUG.l3Rail().barsOn);
  check('L3：品类结构条高亮当前对象所属品类', barsOn.length === 1 && /水果/.test(barsOn[0]), `高亮=${barsOn.join('/')}`);
  const facts = railCity.facts.join(' | ');
  check('L3：卡片要点包含外调规模 / 竞争力均值 / 代表单品链路状态',
    /外调规模/.test(facts) && /竞争力均值/.test(facts) && /代表单品链路/.test(facts), facts);
  await page.screenshot({ path: path.join(SHOTS, '16-l3-city-1440.png') });

  /* --- L4 --- */
  await clickMapPoint(page, 'l3', [76.73, 39.49]);            // 再次点击 → L4
  check('进入 L4（伽师·西梅）', await waitLayer(page, 4));
  await waitIdle(page);
  await page.waitForTimeout(2200);
  const chips = await page.evaluate(() => window.AGRI_DEBUG.chips());
  check('L4：六环节每张卡片带「序号角标 + 环节名 + 成本数字」',
    chips.length === 6 && chips.every((c, i) => c.no === `${i + 1}/6` && c.name && /成本/.test(c.cv)),
    chips.map(c => `${c.no}${c.name}/${c.cv.replace('成本 ', '')}`).join(' '));
  const arrow = await page.evaluate(() => __P.pseudo('#chainAxis .chip:nth-child(2)'));
  check('L4：环节之间有流程方向箭头（旧版 ➤ 表达复用）', arrow && /➤/.test(String(arrow.content)) && parseFloat(arrow.opacity) > 0.9,
    `content=${arrow && arrow.content} opacity=${arrow && arrow.opacity}`);
  const rows = await page.evaluate(() => window.AGRI_DEBUG.priceRows());
  const mults = rows.map(r => parseFloat(String(r.mult).replace('×', '')));
  const sum = await page.evaluate(() => window.AGRI_DEBUG.priceSum());
  check('L4：价格链路给出每段对田头价的倍数且单调递增',
    rows.length === 4 && mults[0] === 1 && mults.every((v, i) => i === 0 || v > mults[i - 1]),
    rows.map(r => `${r.k} ${r.v} ${r.mult}`).join(' → '));
  check('L4：加价最大的一段被标出，且与链路合计一致',
    rows.filter(r => r.hot).length === 1 && /累计 ×/.test(sum) && new RegExp('×' + mults[mults.length - 1].toFixed(2)).test(sum),
    sum.replace(/\n/g, ' ').slice(0, 80));
  await page.screenshot({ path: path.join(SHOTS, '17-l4-chain-1440.png') });

  await page.locator('#chainAxis .chip').nth(3).click();      // 冷链
  await sleep(500);
  await page.locator('#stageEnts li').first().click();
  await sleep(600);
  const geo = await page.evaluate(sels => __P.rects(sels), ['#drawer', '#priceChain']);
  check('L4：抽屉展开时主内容让位（价格链路不再被抽屉压住）',
    await page.locator('#stage').evaluate(e => e.classList.contains('drawer-open')) &&
    geo[1].r.x + geo[1].r.w <= geo[0].r.x + 1,
    `价格链路右缘 ${(geo[1].r.x + geo[1].r.w).toFixed(0)} ≤ 抽屉左缘 ${geo[0].r.x.toFixed(0)}`);
  const shape = await page.evaluate(sels => __P.rects(sels).map(x => x.r), ['#priceChain']);
  const rowsOk = await page.evaluate(() => Array.from(document.querySelectorAll('#priceChain .price-row'))
    .every(r => r.getBoundingClientRect().height < 34));
  check('L4：抽屉展开后价格链路仍是可读表（单列让位，不被压成竖排字）',
    shape[0].w >= 460 && rowsOk, `价格表宽 ${shape[0].w.toFixed(0)}px 行高正常=${rowsOk}`);
  check('L4：经营主体抽屉展开（主体信息 + 口径说明）',
    await page.locator('#drawer').evaluate(e => e.classList.contains('open')) &&
    /示意/.test(await page.locator('#drawerBody').innerText()) && /所属环节/.test(await page.locator('#drawerSub').innerText()));
  await page.screenshot({ path: path.join(SHOTS, '18-l4-drawer-1440.png') });
  await page.keyboard.press('Escape');
  await sleep(300);

  await ctx.close();
}

/* ============================ 1920×1080 ============================ */
async function desktop1920(browser) {
  const { ctx, page } = await newPage(browser, { width: 1920, height: 1080 });
  const rootFs = await page.evaluate(() => __P.rootFont());
  const scr = await page.evaluate(() => __P.scroll());
  check('投屏 1920×1080：字号基准上浮（rem 缩放生效）且首页无溢出', parseFloat(rootFs) >= 17.5 && scr.sh <= scr.ih + 1,
    `root=${rootFs} scrollH=${scr.sh}/${scr.ih}`);
  const landCr = await page.evaluate(() => __P.contrast());
  check('投屏：首页文本对比度 ≥4.5:1', landCr.length === 0, landCr.map(x => `${x.ratio} ${x.t}`).join(' | ') || '0 处不达标');
  await page.screenshot({ path: path.join(SHOTS, '11-landing-1920.png') });

  await page.locator('#enterBtn').click();
  await sleep(900);
  const kpi = await page.evaluate(() => { const el = document.querySelector('#side .kpi .v'); return el ? +parseFloat(getComputedStyle(el).fontSize).toFixed(2) : 0; });
  const sizes = await page.evaluate(() => __P.textSizes());
  const small = sizes.filter(x => x.fs < 12);
  check('投屏：KPI 数字 ≥20px 且无小于 12px 的正文', kpi >= 20 && small.length === 0, `kpi=${kpi}px small=${small.length}`);
  await page.evaluate(() => document.querySelector('#side .rel li[data-id="f:CL"]').click());
  await sleep(1000);
  await page.screenshot({ path: path.join(SHOTS, '19-l1-1920.png') });
  check('投屏：进入 L2', await enterL2(page, 'CL'));
  await waitCamera(page);
  const ov = await page.evaluate(sels => __P.overlaps(sels), ['#scene-l2 .scene-head', '#legendL2', '#scene-l2 .scene-hint']);
  const scr2 = await page.evaluate(() => __P.scroll());
  check('投屏 L2：浮层不重叠且无横向 / 纵向溢出', ov.hits.length === 0 && scr2.sw <= scr2.iw + 1 && scr2.sh <= scr2.ih + 1,
    `${ov.hits.join(', ') || '0 重叠'} sw=${scr2.sw}/${scr2.iw}`);
  await page.screenshot({ path: path.join(SHOTS, '20-l2-1920.png') });
  await ctx.close();
}

/* ============================ 390×844 ============================ */
async function mobile(browser) {
  const { ctx, page } = await newPage(browser, { width: 390, height: 844, mobile: true });
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  check('移动端：首页无横向溢出', await overflow());
  const landSmall = (await page.evaluate(() => __P.textSizes())).filter(x => x.fs < 12);
  check('移动端：首页无小于 12px 的正文', landSmall.length === 0, landSmall.map(x => `${x.fs}px ${x.t}`).join(' | ') || '0 处');
  await page.screenshot({ path: path.join(SHOTS, '21-m-landing.png') });

  await page.locator('#enterBtn').tap();
  await page.waitForTimeout(800);
  check('移动端：进入 L1 无横向溢出', await overflow());
  const tapTargets = await page.evaluate(() => ['.crumbs button', '.lg-toggle', '.ai .ai-qs button', '.ai .ai-in button', '.drawer .dh button'].map(s => {
    const el = document.querySelector(s); if (!el) return { s, h: null };
    const r = el.getBoundingClientRect(); return { s, h: +r.height.toFixed(0), w: +r.width.toFixed(0) };
  }));
  const bad = tapTargets.filter(t => t.h !== null && t.h < 44);
  check('移动端：关键触控目标高度 ≥44px', bad.length === 0,
    tapTargets.map(t => `${t.s.split(' ').pop()}=${t.h}`).join(' ') + (bad.length ? ' → 过小:' + bad.map(b => b.s).join(',') : ''));
  const legendM = await page.evaluate(sels => __P.rects(sels), ['#legendL1']);
  check('移动端：L1 图例改为底部单行（不遮挡地球主体）', legendM[0].r.h <= 60 && legendM[0].r.y > 250, `h=${legendM[0].r.h} y=${legendM[0].r.y}`);
  await page.evaluate(() => document.querySelector('#side .rel li[data-id="f:CL"]').click());
  await sleep(1200);
  await page.screenshot({ path: path.join(SHOTS, '22-m-l1.png') });

  await clickGlobeHit(page, 'arc', 'CL', true);
  check('移动端：进入 L2', await waitLayer(page, 2));
  await waitIdle(page); await page.waitForTimeout(2400);
  await page.mouse.move(6, 6);          // 移开指针，避免悬浮卡进入截图
  await sleep(200);
  check('移动端：L2 无横向溢出且图例为单行', await overflow() &&
    (await page.evaluate(() => __P.rects(['#legendL2'])))[0].r.h <= 64);
  await page.screenshot({ path: path.join(SHOTS, '23-m-l2.png') });
  await clickMapPoint(page, 'l2', [85.5, 40]);
  await clickMapPoint(page, 'l2', [85.5, 40]);
  check('移动端：进入 L3', await waitLayer(page, 3));
  await waitIdle(page); await page.waitForTimeout(1800);
  const stage = (await page.evaluate(() => __P.rects(['#stage', '#l3Extras', '.radar-box']))).reduce((a, x) => (a[x.s] = x.r, a), {});
  check('移动端：L3 分析卡片压缩为横条（≤40% 舞台，雷达让位给地图）',
    stage['#l3Extras'].h <= stage['#stage'].h * 0.4 + 1 && stage['.radar-box'].w === 0,
    `card=${stage['#l3Extras'].h}px / stage=${stage['#stage'].h}px radar=${stage['.radar-box'] ? 'on' : 'hidden'}`);
  await page.mouse.move(6, 6); await sleep(200);
  check('移动端：L3 无横向溢出', await overflow(), await page.evaluate(() => `${document.documentElement.scrollWidth}/${window.innerWidth}`));
  await page.screenshot({ path: path.join(SHOTS, '24-m-l3.png') });
  const rail = await page.evaluate(() => window.AGRI_DEBUG.l3Rail());
  check('移动端：L3 分析卡片仍绑定当前对象（当前 = 省均值口径）', /新疆\s*·\s*全省均值/.test(rail.obj), rail.obj);
  await page.keyboard.press('Escape');
  await waitLayer(page, 2); await waitIdle(page);
  await clickMapPoint(page, 'l2', [85.5, 40]);
  await clickMapPoint(page, 'l2', [85.5, 40]);
  await waitLayer(page, 3); await waitIdle(page); await waitCamera(page);
  // 移动端：产区通过面板/对象接口选中（分析卡片覆盖区不吞地图手势，但小屏优先走列表路径）
  await page.evaluate(() => window.AGRI_UI.onCityClick('新疆', '伽师'));
  await sleep(500);
  await page.evaluate(() => window.AGRI_UI.onCityClick('新疆', '伽师'));
  check('移动端：进入 L4', await waitLayer(page, 4));
  await waitIdle(page); await page.waitForTimeout(2200);
  const chips = await page.evaluate(() => window.AGRI_DEBUG.chips());
  check('移动端：L4 六环节依次点亮且无横向溢出',
    chips.every(c => c.lit) && chips.length === 6 && await overflow(), chips.map(c => c.no).join(' '));
  const clip = await page.evaluate(() => { const b = document.querySelector('.chain-body');
    return { over: b.scrollHeight - b.clientHeight, scene: document.querySelector('#scene-l4').scrollHeight }; });
  check('移动端：L4 环节卡片不被容器内部裁切（整层纵向滚动）', clip.over <= 1 && clip.scene > 0, `卡片内部溢出=${clip.over}px 层高=${clip.scene}px`);
  await page.screenshot({ path: path.join(SHOTS, '25-m-l4.png') });
  await page.evaluate(() => { const s = document.querySelector('#scene-l4'); s.scrollTop = s.scrollHeight; });
  await sleep(500);
  await page.screenshot({ path: path.join(SHOTS, '26-m-l4-scroll.png') });
  await ctx.close();
}

/* ============================ 主流程 ============================ */
function findChromium() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = path.join(process.env.HOME, 'Library/Caches/ms-playwright');
  if (!fs.existsSync(base)) return undefined;
  for (const d of fs.readdirSync(base).filter(x => x.startsWith('chromium_headless_shell'))) {
    const p = path.join(base, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell');
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}
const exe = findChromium();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
const ONLY = process.env.ONLY || '';
try {
  if (!ONLY || ONLY === '1440') await desktop1440(browser);
  if (!ONLY || ONLY === '1920') { console.log('\n---- 1920×1080 ----'); await desktop1920(browser); }
  if (!ONLY || ONLY === 'mobile') { console.log('\n---- 390×844 ----'); await mobile(browser); }
} finally {
  await browser.close();
}

const failed = results.filter(r => !r.ok);
fs.writeFileSync(path.join(root, 'test', 'report-visual.md'), [
  '# 农链 AgriLink · 视觉 / 布局验收报告', '',
  `运行时间：${new Date().toISOString()}`, '',
  `视口：1440×900 · 1920×1080 · 390×844 ｜ 加载：本地单文件 \`file://\`（拦截全部外部请求）`, '',
  `## 结果：${results.length - failed.length} / ${results.length} 通过`, '',
  '| # | 检查项 | 结果 | 实测 |', '| --- | --- | --- | --- |',
  ...results.map((r, i) => `| ${i + 1} | ${r.name} | ${r.ok ? '✅' : '❌'} | ${(r.detail || '').replace(/\|/g, '/')} |`), ''
].join('\n'));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILED:\n' + failed.map(f => ' - ' + f.name + ' :: ' + f.detail).join('\n')); process.exit(1); }
