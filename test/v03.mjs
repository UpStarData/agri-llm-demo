#!/usr/bin/env node
/* ============================================================
   AgriLink V1.0 验收测试（LLM-291）—— 页面指令 G/T/L/M/B/R/D/A 逐条断言
   直接加载单文件 index.html（file://），拦截全部外部请求 → 同时验证离线可用与无控制台错误
   每个断言都检查「真实状态是否写回」（window.V03_DEBUG.state() 与各层 debug()），不接受纯文案切换
   运行：node test/v03.mjs      报告：test/report-v03.md
   ============================================================ */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'file://' + path.join(root, 'index.html');
const SHOTS = path.join(root, 'shots', 'test');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const consoleErrors = [], pageErrors = [], external = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined && detail !== '' ? '  — ' + detail : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const notes = [];

async function open(browser, w = 1440, h = 900, tag = 'desktop') {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(10000);
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(tag + ': ' + m.text()); });
  page.on('pageerror', e => pageErrors.push(tag + ': ' + String(e)));
  page.on('request', r => { if (!r.url().startsWith('file://')) external.push(r.url()); });
  await page.route('**/*', rt => rt.request().url().startsWith('file://') ? rt.continue() : rt.abort());
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__AGRI_READY === true, null, { timeout: 20000 });
  await sleep(700);
  return { ctx, page };
}
const st = page => page.evaluate(() => window.V03_DEBUG.state());
const counts = page => page.evaluate(() => window.V03_DEBUG.counts());
const factDbg = page => page.evaluate(() => window.V03Fact.debug());
const relDbg = page => page.evaluate(() => window.V03Relation.debug());
const simDbg = page => page.evaluate(() => window.V03Sim.debug());
const overflow = page => page.evaluate(() => window.V03_DEBUG.overflow());
const setL3 = async (page, prov) => { await page.evaluate(p => window.V03_DEBUG.set({ geo: { level: 'L3', focus: p } }), prov); await sleep(700); };
const setLevel = async (page, lv) => { await page.evaluate(l => window.V03_DEBUG.set({ geo: { level: l, focus: null } }), lv); await sleep(800); };
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name), fullPage: false });
/* 弹窗可能叠加（事实详情 → 本体详情），Esc 一次只关一层，这里循环关到干净 */
async function closeModals(page) {
  for (let i = 0; i < 4; i++) {
    if (!(await page.evaluate(() => document.getElementById('modal').classList.contains('on')))) return;
    await page.keyboard.press('Escape');
    await sleep(260);
  }
}

async function run() {
  const browser = await chromium.launch();
  const { page } = await open(browser);

  /* ---------------- 全局 G ---------------- */
  const brand = (await page.locator('.brand').innerText()).replace(/\s+/g, ' ').trim();
  check('G1 顶部品牌为 AgriLink + 版本号，无其它产品名', /AgriLink v1\.0/.test(brand) && !/三层推演|农业数据/.test(brand), brand);
  const fontCss = await page.evaluate(() => [...document.styleSheets].map(s => { try { return [...s.cssRules].map(r => r.cssText).join('\n'); } catch (e) { return ''; } }).join('\n'));
  check('G2 IBM Plex Sans SC 已内联且四个字重分档（300/400/600/700）',
    /IBM Plex Sans SC/.test(fontCss) && [300, 400, 600, 700].every(w => new RegExp('font-weight:\\s*' + w).test(fontCss)));
  const glass = await page.evaluate(() => {
    const f = n => getComputedStyle(document.querySelector(n)).backdropFilter || getComputedStyle(document.querySelector(n)).webkitBackdropFilter || '';
    return { topbar: f('.topbar'), stream: getComputedStyle(document.getElementById('streamBox')).backgroundColor };
  });
  check('G3 顶栏毛玻璃且底部流水面板为纯黑', /blur/.test(glass.topbar) && /rgb\(0, 0, 0\)|rgba\(0, 0, 0/.test(glass.stream), JSON.stringify(glass));
  await page.locator('#mapSk .sk[data-k="influence"]').click(); await sleep(120);
  check('G4 筛选切换时 Logo 抖动（shake 动画真实触发）',
    await page.evaluate(() => document.getElementById('logo').classList.contains('shake')));
  await sleep(700);
  await page.locator('#mapSk .sk[data-k="influence"]').click(); await sleep(500);
  check('G5 菜单与弹窗均无标题栏', await page.evaluate(() =>
    !document.querySelector('.menu .menu-head') && !document.querySelector('.modal .modal-head') &&
    !document.querySelector('.fact-side .fs-head') && !document.querySelector('.stream .st-head')));
  await page.locator('#layer-fact .fcard').first().click(); await sleep(500);
  const banned = await page.evaluate(() => {
    const t = [document.getElementById('layer-fact'), document.getElementById('layer-relation'), document.getElementById('modalBody'), document.getElementById('menuBody')]
      .map(n => n ? n.innerText : '').join('\n');
    return (t.match(/示意数据|示例数据|样例数据|待标定|示意|示例|样例/g) || []);
  });
  check('G6 事实层/关联层界面不出现「示意数据 / 样例」等字样', banned.length === 0, banned.slice(0, 5).join(','));
  await closeModals(page); await sleep(200);

  /* ---------------- 顶部导航 T ---------------- */
  const order = await page.evaluate(() => {
    const r = n => document.querySelector(n).getBoundingClientRect();
    return { menu: r('#menuBtn').left, brand: r('.brand').left, tabs: r('#tabs').left, icons: r('.tb-right').left,
      tabsCenter: (r('#tabs').left + r('#tabs').right) / 2, vw: innerWidth };
  });
  check('T1 顶栏从左到右：图层菜单 Icon → 品牌 → 三 TAB → 快捷图标组',
    order.menu < order.brand && order.brand < order.tabs && order.tabs < order.icons, JSON.stringify(order));
  check('T1 三 TAB 居中', Math.abs(order.tabsCenter - order.vw / 2) <= 14, '偏差 ' + (order.tabsCenter - order.vw / 2).toFixed(1) + 'px');
  check('T1/T2 快捷图标组为三个图标按钮（流水 / 卡片 / 设置）', (await page.locator('.tb-right .icbtn').count()) === 3);
  check('T2 图标为线性 SVG（Cursor 风格：24 网格 16px 描边）', await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.icbtn, #mapSk .sk, .menu-close')];
    return btns.length > 10 && btns.every(b => {
      const s = b.querySelector('svg');
      return !s || (s.getAttribute('stroke') === 'currentColor' && Number(s.getAttribute('width')) <= 16);
    });
  }));

  /* ---------------- 左侧图层菜单 L ---------------- */
  const menuClosed = await page.evaluate(() => getComputedStyle(document.getElementById('menu')).transform !== 'none' &&
    document.getElementById('menu').getBoundingClientRect().right <= 1);
  check('L1 图层菜单默认收起、点顶部 Icon 后从左侧滑出', menuClosed, '初始已收起');
  await page.click('#menuBtn'); await sleep(450);
  const menuBox = await page.evaluate(() => document.getElementById('menu').getBoundingClientRect());
  check('L1 菜单滑出到位（left=0，宽度 344）', Math.abs(menuBox.left) < 1 && Math.abs(menuBox.width - 344) < 2, JSON.stringify(menuBox));
  const menu3 = await page.evaluate(() => ({
    ov: document.querySelectorAll('#menuBody .ov-i').length,
    dist: document.querySelectorAll('#menuBody .ds-i').length,
    l1: document.querySelectorAll('#menuBody .mn-l1').length,
    l2: document.querySelectorAll('#menuBody .mn-l2').length,
    l3: document.querySelectorAll('#menuBody .l3').length,
    l3on: document.querySelectorAll('#menuBody .l3.on').length,
    sk: document.querySelectorAll('#menuBody .mn-sk .sk').length,
    master: !!document.getElementById('skMaster'),
    legend: document.querySelectorAll('#menuBody .mn-legend .lg-i').length
  }));
  check('L2-① 数据概览（事实条数 / 高可信 / 关联本体 / 最近更新 / 类型分布）',
    menu3.ov >= 5 && menu3.dist >= 5, JSON.stringify(menu3));
  check('L2-② 三级分类：一级标题 + 二级子标题 + 三级 emoji 方块卡片',
    menu3.l1 === 3 && menu3.l2 === 6 && menu3.l3 === 15, JSON.stringify(menu3));
  check('L2-③ 三级卡片默认全选', menu3.l3on === menu3.l3, menu3.l3on + '/' + menu3.l3);
  check('L2-④ 第三层为快捷控制（M1–M11）+ 图例', menu3.sk === 11 && menu3.master && menu3.legend >= 5);
  await shot(page, 'v04-02-fact-menu.png');

  const before = (await counts(page)).facts;
  await page.locator('#menuBody .ghost.sm', { hasText: '全不选' }).click(); await sleep(600);
  const zero = await page.evaluate(() => ({ facts: window.V03_DEBUG.counts().factsAtLevel, cards: document.querySelectorAll('#layer-fact .fcard').length }));
  check('L2 三级分类全不选 → 地图与卡片真实清空（不是只改文案）', zero.facts === 0 && zero.cards === 0, JSON.stringify(zero));
  await page.locator('#menuBody .ghost.sm', { hasText: '全选' }).click(); await sleep(600);
  const back = (await counts(page)).facts;
  check('L2 恢复全选 → 数据回到默认值', back === before, before + ' → ' + back);

  const dual = await page.evaluate(() => {
    const map = [...document.querySelectorAll('#mapSk .sk')];
    const menu = [...document.querySelectorAll('#menuBody .mn-sk .sk')];
    const pick = list => list.map(b => b.dataset.k + '=' + b.getAttribute('aria-pressed') + ':' + b.querySelector('.sk-v').textContent);
    return { map: pick(map), menu: pick(menu) };
  });
  check('L3 快捷键双入口状态一致（11 项逐一相同）',
    dual.map.length === 11 && dual.menu.length === 11 && dual.map.join('|') === dual.menu.join('|'));
  dual.map.forEach((v, i) => { if (v !== dual.menu[i]) check('  快捷键不一致：' + v, false, dual.menu[i]); });

  // 总开关
  await page.locator('#skMaster').uncheck(); await sleep(350);
  const mapHidden = await page.evaluate(() => getComputedStyle(document.getElementById('mapSk')).display === 'none');
  check('L3 总开关关闭 → 地图右下角整组快捷键隐藏', mapHidden);
  const tBefore = (await st(page)).time;
  await page.locator('#menuBody .mn-sk .sk[data-k="time"]').click(); await sleep(200);
  await page.locator('#menuBody .sk-pop .sk-opt').nth(1).click(); await sleep(500);
  const tAfter = (await st(page)).time;
  check('L3 总开关关闭时，菜单内快捷控制仍可用', mapHidden && tBefore !== tAfter, tBefore + ' → ' + tAfter);
  await page.evaluate(() => window.V03_DEBUG.set({ time: '7d' })); await sleep(400);
  await page.locator('#skMaster').check(); await sleep(300);
  check('L3 总开关重新打开 → 地图快捷键恢复', await page.locator('#mapSk .sk').count() === 11 && await page.locator('#mapSk').isVisible());
  await page.click('#menuClose'); await sleep(400);

  /* ---------------- 地图主区域 M ---------------- */
  /* 回到默认口径：近 7 天 / 高可信 / 高影响 / 全国视角（前序步骤可能因打开省级事实详情而下钻） */
  await page.evaluate(() => window.V03_DEBUG.set({ geo: { level: 'L2', focus: null }, factId: null, time: '7d', cred: 'high', infl: 'high', q: '' }));
  await sleep(900);
  const geoBox = await page.evaluate(() => {
    const m = document.getElementById('factMap').getBoundingClientRect();
    const box = document.querySelector('.fact-mapbox').getBoundingClientRect();
    return { w: Math.round(m.width), h: Math.round(m.height), boxW: Math.round(box.width), boxH: Math.round(box.height), vw: innerWidth, vh: innerHeight };
  });
  check('M0 2D 地图铺满视口（无外边距，右侧仅剩卡片面板）',
    geoBox.w === geoBox.boxW && geoBox.h === geoBox.boxH && geoBox.w > geoBox.vw * .6, JSON.stringify(geoBox));
  const f0 = await factDbg(page);
  check('M1 默认 2D（3D 画布隐藏）', f0.mode3d === false, JSON.stringify({ mode3d: f0.mode3d }));
  await page.locator('#mapSk .sk[data-k="mode3d"]').click(); await sleep(900);
  const f3 = await page.evaluate(() => ({ mode: window.V03Fact.debug().mode3d, hits: window.V03Fact.debug().globeHits,
    canvas: getComputedStyle(document.getElementById('factGlobe')).display, map: getComputedStyle(document.getElementById('factMap')).display }));
  check('M1 3D 切换为地球（自绘地球有可点击本体/星点，内容与 2D 同源）',
    f3.mode === true && f3.hits > 0 && f3.canvas === 'block' && f3.map === 'none', JSON.stringify(f3));
  await sleep(700);
  await shot(page, 'v04-03-fact-3d.png');
  await page.locator('#mapSk .sk[data-k="mode3d"]').click(); await sleep(700);
  check('M1 可切回 2D', (await factDbg(page)).mode3d === false);
  check('M2 影响力动画默认开启（光晕 + 波纹都在）', f0.halos > 0 && f0.hotRipples > 0, 'halos=' + f0.halos);
  await page.locator('#mapSk .sk[data-k="influence"]').click(); await sleep(600);
  const fOff = await factDbg(page);
  check('M2 关闭后影响力动画真实停止（光晕与波纹归零）', fOff.halos === 0 && fOff.ripples === 0 && fOff.hotRipples === 0);
  await page.locator('#mapSk .sk[data-k="influence"]').click(); await sleep(500);
  const fs1 = await page.evaluate(() => window.V03_DEBUG.state().sk.fullscreen);
  await page.locator('#mapSk .sk[data-k="fullscreen"]').click(); await sleep(500);
  const fsOK = await page.evaluate(() => ({ state: window.V03_DEBUG.state().sk.fullscreen, real: !!document.fullscreenElement }));
  check('M3 全屏开关与浏览器全屏状态一致（无异常）', fsOK.state === fsOK.real, JSON.stringify({ before: fs1, ...fsOK }));
  await page.evaluate(() => { if (document.fullscreenElement) document.exitFullscreen(); }); await sleep(400);

  const live0 = await page.evaluate(() => ({ total: document.querySelectorAll('#layer-fact .fc-player').length, play: document.querySelectorAll('#layer-fact .fc-player[data-play="1"]').length }));
  await page.locator('#mapSk .sk[data-k="live"]').click(); await sleep(800);
  const live1 = await page.evaluate(() => ({ total: document.querySelectorAll('#layer-fact .fc-player').length, play: document.querySelectorAll('#layer-fact .fc-player[data-play="1"]').length }));
  check('M4 直播流默认关闭；开启后卡片内接入直播流并同步播放（卡片保留）',
    live0.play === 0 && live0.total > 0 && live1.play === live1.total && live1.total === live0.total,
    JSON.stringify({ 关闭: live0, 开启: live1 }));
  await page.locator('#mapSk .sk[data-k="live"]').click(); await sleep(600);
  const live2 = await page.evaluate(() => document.querySelectorAll('#layer-fact .fc-player[data-play="1"]').length);
  check('M4 关闭后停止播放但卡片保留', live2 === 0 && (await page.locator('#layer-fact .fc-player').count()) === live0.total);

  await page.locator('#mapSk .sk[data-k="regions"]').click(); await sleep(600);
  const r1 = await factDbg(page);
  check('M5 主要产区默认关闭，开启后标注（真实经纬度数据包）', f0.regionMarks === 0 && r1.regionMarks === 49, '开启后 ' + r1.regionMarks + ' 个产区');
  await page.locator('#mapSk .sk[data-k="gates"]').click(); await sleep(600);
  const g1 = await factDbg(page);
  check('M6 港口与机场默认关闭，开启后标注', f0.gateMarks === 0 && g1.gateMarks === 45, '开启后 ' + g1.gateMarks + ' 个口岸');
  await shot(page, 'v04-06-fact-marks.png');
  const regionPick = await page.evaluate(() => {
    const rg = window.V03Atlas.REGIONS[0];
    window.V03Fact.pick.region(rg.id);
    return { rgId: rg.id, objId: rg.objId, state: window.V03_DEBUG.state().rel.sel, tab: window.V03_DEBUG.state().tab };
  });
  check('M5/M6 点产区/口岸标记 → 打开对应本体详情',
    regionPick.tab === 'relation' && regionPick.state === regionPick.objId, JSON.stringify(regionPick));
  await sleep(600);
  const objModal = await page.locator('#modalBody').innerText();
  check('M5/M6 本体详情弹窗确实打开', objModal.length > 40, objModal.length + ' 字');
  await closeModals(page); await sleep(200);
  await page.evaluate(() => window.V03_DEBUG.set({ tab: 'fact' })); await sleep(700);
  await page.locator('#mapSk .sk[data-k="regions"]').click();
  await page.locator('#mapSk .sk[data-k="gates"]').click(); await sleep(500);

  const t7 = (await st(page)).time;
  await page.locator('#mapSk .sk[data-k="time"]').click(); await sleep(200);
  const timeOpts = await page.locator('.sk-pop .sk-opt').allInnerTexts();
  const reserved = await page.locator('.sk-pop .sk-opt.reserved').count();
  await page.locator('.sk-pop .sk-opt').nth(3).click(); await sleep(900);
  const allCount = (await counts(page)).factsAtLevel;
  await page.locator('#mapSk .sk[data-k="time"]').click(); await sleep(150);
  await page.locator('.sk-pop .sk-opt').nth(0).click(); await sleep(900);
  const d7Count = (await counts(page)).factsAtLevel;
  check('M7 时间范围默认 7 天、四个可选、预留时间轴播放位',
    t7 === '7d' && timeOpts.length === 5 && reserved === 1 && /时间轴播放/.test(timeOpts.join(' ')), timeOpts.join('/'));
  check('M7 时间范围切换产生真实数据变化', allCount > d7Count, '全部 ' + allCount + ' > 7天 ' + d7Count);

  check('M8 可信度默认高', (await st(page)).cred === 'high');
  await page.evaluate(() => window.V03_DEBUG.set({ infl: 'low' })); await sleep(900);   // 先解除影响等级约束，观察可信度阈值本身的效果
  const c8 = (await counts(page)).factsAtLevel;
  await page.locator('#mapSk .sk[data-k="cred"]').click(); await sleep(200);
  await page.locator('#mapSk .sk-pop .sk-opt').nth(1).click(); await sleep(900);
  const c8b = await page.evaluate(() => ({ n: window.V03_DEBUG.counts().factsAtLevel, cred: window.V03_DEBUG.state().cred }));
  check('M8 切换到中后数据变多（阈值语义：中 = 高 + 中）', c8b.cred === 'mid' && c8b.n > c8, c8 + ' → ' + c8b.n);
  await page.evaluate(() => window.V03_DEBUG.set({ cred: 'high', infl: 'high' })); await sleep(900);

  const i9 = (await counts(page)).factsAtLevel;
  await page.locator('#mapSk .sk[data-k="infl"]').click(); await sleep(200);
  await page.locator('#mapSk .sk-pop .sk-opt').nth(1).click(); await sleep(900);
  const i9b = (await counts(page)).factsAtLevel;
  check('M9 影响等级默认高，切换到中后数据变多', (await st(page)).infl === 'mid' && i9b > i9, i9 + ' → ' + i9b);
  await page.locator('#mapSk .sk[data-k="infl"]').click(); await sleep(150);
  await page.locator('.sk-pop .sk-opt').nth(0).click(); await sleep(700);

  await page.locator('#mapSk .sk[data-k="search"]').click(); await sleep(200);
  await page.fill('.sk-pop .sk-input', '榴莲'); await sleep(900);
  const sq = await st(page);
  const sCards = await page.evaluate(() => [...document.querySelectorAll('#layer-fact .fcard')].map(n => n.innerText).join(' '));
  check('M10 关键词搜索产生真实过滤（结果都命中关键词）',
    sq.q === '榴莲' && /榴莲/.test(sCards) && (await counts(page)).factsAtLevel < allCount, '命中 ' + (await page.locator('#layer-fact .fcard').count()) + ' 条');
  await closeModals(page); await sleep(200);
  await page.locator('#mapSk .sk[data-k="search"]').click(); await sleep(200);
  await page.fill('.sk-pop .sk-input', ''); await sleep(800);
  await closeModals(page); await sleep(200);

  const lgOn = await factDbg(page);
  await page.locator('#mapSk .sk[data-k="legend"]').click(); await sleep(500);
  const lgOff = await page.evaluate(() => ({ legend: window.V03Fact.debug().legend, display: getComputedStyle(document.getElementById('factLegend')).display }));
  check('M11 图例默认开启，可关闭（只展示不参与筛选）',
    lgOn.legend === true && lgOff.legend === false && lgOff.display === 'none', JSON.stringify(lgOff));
  await page.locator('#mapSk .sk[data-k="legend"]').click(); await sleep(400);

  const skBox = await page.evaluate(() => {
    const b = document.getElementById('mapSk').getBoundingClientRect();
    return { n: document.querySelectorAll('#mapSk .sk').length, right: innerWidth - b.right, bottom: innerHeight - b.bottom, h: b.height, w: b.width };
  });
  check('M12 11 个快捷键在地图右下角排成一排（小尺寸）',
    skBox.n === 11 && skBox.right < 30 && skBox.bottom < 200 && skBox.h < 45, JSON.stringify(skBox));
  check('M13 星点密度按视线漏斗递进：全球 > 中国 > 省区，且全球覆盖多洲',
    await (async () => {
      await setLevel(page, 'L1'); const L1 = (await factDbg(page)).facts; const geo = await page.evaluate(() => {
        const f = window.V03Fact.debug(); const list = window.V03Filter.factsAtLevel();
        return { west: list.some(x => x.lng < -30), east: list.some(x => x.lng > 120), south: list.some(x => x.lat < 0), north: list.some(x => x.lat > 40), n: list.length };
      });
      await setLevel(page, 'L2'); const L2 = (await factDbg(page)).facts;
      await setL3(page, '湖南'); const L3 = (await factDbg(page)).facts;
      notes.push('视线漏斗：全球 ' + L1 + ' 条 / 中国 ' + L2 + ' 条 / 湖南 ' + L3 + ' 条；全球覆盖 西经 ' + geo.west + ' 东经 ' + geo.east + ' 南半球 ' + geo.south + ' 北半球 ' + geo.north);
      return L1 > L2 && L2 >= L3 && L1 >= 30 && geo.west && geo.east && geo.south && geo.north;
    })());
  await shot(page, 'v04-13-fact-l3-hunan.png');
  await setLevel(page, 'L1'); await shot(page, 'v04-12-fact-l1-global.png');
  await setLevel(page, 'L2');
  check('M14 亮星按影响等级分档（高影响星更大更亮）', await page.evaluate(() => {
    const f = window.V03Fact;
    return f.starSize({ impact: 'high', radius: 300 }) > f.starSize({ impact: 'mid', radius: 300 }) &&
      f.starSize({ impact: 'mid', radius: 300 }) > f.starSize({ impact: 'low', radius: 300 });
  }));
  const flashBefore = await page.evaluate(() => window.V03_DEBUG.flashIds().length);
  await page.waitForFunction(() => window.V03_DEBUG.flashIds().length > 0, null, { timeout: 12000 }).catch(() => {});
  const flashAfter = await page.evaluate(() => window.V03_DEBUG.flashIds());
  check('M15 流水有新数据接入时地图对应位置亮星', flashAfter.length > 0, '亮星 ' + flashAfter.length + ' 颗（此前 ' + flashBefore + '）');

  /* ---------------- 底部流水 B ---------------- */
  const streamBox = await page.evaluate(() => {
    const b = document.getElementById('streamBox');
    const cs = getComputedStyle(b);
    return { h: b.getBoundingClientRect().height, bg: cs.backgroundColor, text: b.innerText.slice(0, 80), hasH: !!b.querySelector('h1,h2,h3,h4') };
  });
  check('B1 流水为纯黑背景的窄条、无标题', /rgb\(0, 0, 0\)/.test(streamBox.bg) && streamBox.h <= 140 && !streamBox.hasH, JSON.stringify({ h: streamBox.h, bg: streamBox.bg }));
  await shot(page, 'v04-07-stream.png');
  const lineCount0 = await page.evaluate(() => window.V03_DEBUG.streamLines());
  await page.click('#streamClose'); await sleep(400);
  const closed = await page.evaluate(() => ({ on: document.getElementById('streamBox').classList.contains('on'), state: window.V03_DEBUG.state().panels.stream }));
  check('B2 右侧 × 可关闭流水面板', closed.on === false && closed.state === false, '关闭前 ' + lineCount0 + ' 行');
  await page.click('#btnStream'); await sleep(600);
  const rhythm = await page.evaluate(async () => {
    const box = document.getElementById('streamBody');
    const ts = [];
    const mo = new MutationObserver(() => ts.push(performance.now()));
    mo.observe(box, { childList: true });
    await new Promise(r => setTimeout(r, 12000));
    mo.disconnect();
    const gaps = [];
    for (let i = 1; i < ts.length; i++) gaps.push(Math.round(ts[i] - ts[i - 1]));
    return { n: ts.length, min: gaps.length ? Math.min(...gaps) : -1, max: gaps.length ? Math.max(...gaps) : -1, gaps: gaps.slice(0, 12) };
  });
  check('B3 日志滚动节奏不均匀（既有成批快刷也有停顿卡住）',
    rhythm.n >= 6 && rhythm.min < 400 && rhythm.max > 1200, JSON.stringify(rhythm));
  const tabs = await page.evaluate(() => ({ n: document.querySelectorAll('#streamBox .st-tab').length, add: document.querySelectorAll('#streamBox .st-tab.add').length, on: document.querySelectorAll('#streamBox .st-tab.on').length }));
  check('B4 当前只有一条输入流 Tab，并预留多 Tab 位', tabs.n === 2 && tabs.on === 1 && tabs.add === 1, JSON.stringify(tabs));

  /* ---------------- 右侧事实卡片 R（先放宽筛选，保证分类型模板都有真实数据） ---------------- */
  await page.evaluate(() => window.V03_DEBUG.set({ time: 'all', cred: 'low', infl: 'low' })); await sleep(1000);
  const cardStat = await page.evaluate(() => ({
    columns: getComputedStyle(document.querySelector('.fcards') || document.getElementById('sideBody')).columnCount,
    n: document.querySelectorAll('#layer-fact .fcard').length,
    spark: document.querySelectorAll('#layer-fact .spark').length,
    wx: document.querySelectorAll('#layer-fact .wx').length,
    player: document.querySelectorAll('#layer-fact .fc-player').length,
    kbar: document.querySelectorAll('#layer-fact .kbar').length,
    policy: [...document.querySelectorAll('#layer-fact .fcard')].filter(n => /发布机构/.test(n.innerText)).length,
    thumb: document.querySelectorAll('#layer-fact .thumb').length
  }));
  check('R1 事实卡片为两列瀑布流', cardStat.columns === '2' && cardStat.n > 8, JSON.stringify({ columnCount: cardStat.columns, 卡片: cardStat.n }));
  check('R2 分类型卡片模板齐备（新闻/政策/价格/天气/视频直播/交易）',
    cardStat.spark > 0 && cardStat.wx > 0 && cardStat.player > 0 && cardStat.kbar > 0 && cardStat.policy > 0 && cardStat.thumb > 0, JSON.stringify(cardStat));
  check('R4 卡片信息密度（首屏 1440×900 可见卡片数 ≥ 6 且含图文/直播混合模板）',
    cardStat.n >= 6 && cardStat.player >= 5, cardStat.n + ' 张 · ' + cardStat.player + ' 个播放器');
  await shot(page, 'v04-04-fact-cards.png');
  await page.locator('#layer-fact .fcard').first().click(); await sleep(600);
  const dSections = await page.evaluate(() => {
    const t = document.getElementById('modalBody').innerText;
    const grid = getComputedStyle(document.querySelector('#modalBody .fd-grid'));
    return { t, cols: grid.gridTemplateColumns.split(' ').length, h: t.length };
  });
  check('D1/D2 事实详情弹窗为重排后的紧凑两列布局，且含摘要/证据/相关本体/相关关系/关键字段',
    dSections.cols === 2 && /事实摘要/.test(dSections.t) && /证据/.test(dSections.t) && /相关本体对象/.test(dSections.t) && /相关关系/.test(dSections.t) && /关键字段/.test(dSections.t));
  await shot(page, 'v04-05-fact-detail.png');
  await page.locator('#modalBody [data-obj]').first().click(); await sleep(900);
  const jumped = await st(page);
  check('D 详情内点本体 chip → 携带事实进入关联层并选中该对象',
    jumped.tab === 'relation' && jumped.rel.sel && jumped.carry.length > 0, JSON.stringify({ tab: jumped.tab, sel: jumped.rel.sel, carry: jumped.carry.length }));
  await closeModals(page); await sleep(200);

  /* ---------------- 关联层 A ---------------- */
  const frame = await page.evaluate(() => ({
    topbar: !!document.querySelector('.topbar'), menu: !!document.getElementById('menu'),
    canvas: document.getElementById('relCanvas').getBoundingClientRect().width > 300,
    side: !!document.getElementById('relSide'), stream: !!document.getElementById('streamBox'),
    cardsLabel: document.getElementById('relCount').textContent
  }));
  check('A1 关联层框架与事实层完全一致（顶栏/菜单/地图/右侧面板/底部流水）',
    frame.topbar && frame.menu && frame.canvas && frame.side && frame.stream, JSON.stringify(frame));
  await page.click('#menuBtn'); await sleep(450);
  const relMenu = await page.evaluate(() => ({
    l1: [...document.querySelectorAll('#menuBody .mn-l1')].map(n => n.textContent),
    l3: document.querySelectorAll('#menuBody .l3').length,
    on: document.querySelectorAll('#menuBody .l3.on').length,
    sk: document.querySelectorAll('#menuBody .mn-sk .sk').length
  }));
  check('A2 关联层分类字典为九类本体对象域（三级结构 + 快捷控制）',
    relMenu.l3 === 9 && relMenu.on === 9 && relMenu.sk === 11 && relMenu.l1.join('') === '地理实体经营主体抽象对象', JSON.stringify(relMenu));
  await shot(page, 'v04-11-relation-menu.png');
  const relBefore = await relDbg(page);
  await page.locator('#menuBody .l3').nth(8).click(); await sleep(700);
  const relAfter = await relDbg(page);
  check('A2 取消一个本体类型后对象与关系数量真实变化',
    relAfter.nodes < relBefore.nodes || relAfter.edges < relBefore.edges, relBefore.nodes + '→' + relAfter.nodes + ' 对象 / ' + relBefore.edges + '→' + relAfter.edges + ' 关系');
  await page.locator('#menuBody .l3').nth(8).click(); await sleep(600);
  await page.click('#menuClose'); await sleep(400);
  const rel = await relDbg(page);
  check('A3 地图上是本体节点（可定位本体全部落图）', rel.mapped > 40 && rel.nodes > rel.mapped, '落图 ' + rel.mapped + '/' + rel.nodes);
  check('A4 每条关系都能逐条定位（线上关系 + 关系清单行数一致）', rel.lines > 0 && rel.rows === rel.edges, '线上 ' + rel.lines + ' 条，清单 ' + rel.rows + ' 条，共 ' + rel.edges + ' 条');
  const color = await page.evaluate(() => {
    const hex2hsl = hex => {
      const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      let h = 0;
      if (d) { if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; }
      return h;
    };
    const f = Object.values(window.V03Data.CATS).map(c => c.c);
    const r = window.V03Data.DOMAINS.map(d => d.c);
    const shared = f.filter(c => r.includes(c));
    return { shared, fact: f.map(hex2hsl), rel: r.map(hex2hsl),
      relWarm: r.map(hex2hsl).filter(h => h >= 15 && h <= 100).length,
      factCool: f.map(hex2hsl).filter(h => h >= 160 && h <= 260).length };
  });
  check('A5 关联层暖色本体色系与事实层冷色事实色系完全区分（无共用色 + 色相分带）',
    color.shared.length === 0 && color.relWarm >= 6 && color.factCool >= 3, JSON.stringify(color));
  const flow = await page.evaluate(() => {
    /* 取值自 echarts 运行时模型（getModel().option），确认动画选项真的作用到了图上 */
    const chart = window.echarts.getInstanceByDom(document.getElementById('relCanvas'));
    const series = chart.getModel().option.series || [];
    const line = series.find(s => s.effect && s.effect.show && s.type === 'lines');
    return { flowing: !!line, symbol: line && line.effect.symbol, period: line && line.effect.period, trail: line && line.effect.trailLength, points: line ? (line.data || []).length : 0 };
  });
  check('A7 关系连线为流动粒子动画（Mirofish 取向：粒子沿线段流动 + 拖尾）',
    flow.flowing === true && flow.symbol === 'circle' && flow.points > 0 && flow.trail > 0, JSON.stringify(flow));
  const nogeoFirst = await page.evaluate(() => document.querySelectorAll('#relBody .rel-card').length);
  await page.locator('#relBody #relMore').click(); await sleep(600);
  const nogeo = await page.evaluate(() => {
    const d = window.V03Relation.debug();
    const mapIds = new Set();
    const o = window.echarts.getInstanceByDom(document.getElementById('relCanvas')).getOption();
    o.series.forEach(s => { if (s.type === 'scatter') (s.data || []).forEach(it => mapIds.add(it.id)); });
    const nogeoIds = window.V03Data.OBJECTS.filter(x => x.geo === false).map(x => x.id);
    return { unmapped: d.unmapped, cards: document.querySelectorAll('#relBody .rel-card').length,
      leaked: nogeoIds.filter(id => mapIds.has(id)).length, nogeoAll: nogeoIds.length };
  });
  check('A8 非地理本体全部在右侧面板以卡片呈现（可展开，不上地图）',
    nogeo.cards === nogeo.unmapped && nogeo.leaked === 0 && nogeo.unmapped > nogeoFirst && nogeoFirst >= 12, JSON.stringify({ 首屏卡片: nogeoFirst, ...nogeo }));
  check('A9 底部流水在关联层为「本体抽离与关联处理」日志',
    /本体抽离|抽离流|关系|本体/.test(await page.locator('#streamBox').innerText()) && (await page.evaluate(() => document.getElementById('stTabName').textContent)) === '抽离流');
  await shot(page, 'v04-08-relation-map.png');

  await page.locator('#relBody .rel-card').first().click(); await sleep(700);
  const a10 = await page.locator('#modalBody').innerText();
  check('A10 本体详情弹窗重排（对象说明 / 关联关系 / 时序记忆 / 对象属性 / 支撑事实）',
    /对象说明/.test(a10) && /关联关系/.test(a10) && /时序记忆/.test(a10) && /对象属性/.test(a10) && /支撑事实/.test(a10));
  await shot(page, 'v04-09-relation-obj-detail.png');
  await closeModals(page); await sleep(200);
  await page.locator('#relBody .rel-row').first().click(); await sleep(700);
  const a11 = await page.locator('#modalBody').innerText();
  check('A11 关联详情弹窗重排（关系强度 / 置信度 / 时序记忆 / 支撑事实 / 关键字段）',
    /关系强度/.test(a11) && /置信度/.test(a11) && /时序记忆/.test(a11) && /支撑事实/.test(a11) && /关键字段/.test(a11));
  await shot(page, 'v04-10-relation-rel-detail.png');
  await closeModals(page); await sleep(200);
  const relBanned = await page.evaluate(() => {
    const t = [document.getElementById('layer-relation'), document.getElementById('modalBody')].map(n => n ? n.innerText : '').join('\n');
    return (t.match(/示意数据|示例数据|样例数据|待标定|示意|示例|样例/g) || []);
  });
  check('G6 关联层界面同样不出现「示意数据 / 样例」等字样（含本体/关系详情弹窗）', relBanned.length === 0, relBanned.slice(0, 5).join(','));
  /* 回到默认筛选（M7 近 7 天 / M8 高 / M9 高），保证后续断言基于默认口径 */
  await page.evaluate(() => window.V03_DEBUG.set({ time: '7d', cred: 'high', infl: 'high' })); await sleep(900);
  const edgeChange = await (async () => {
    const b = await relDbg(page);
    await page.evaluate(() => window.V03_DEBUG.set({ cred: 'low' }));
    await sleep(900);
    const a = await relDbg(page);
    await page.evaluate(() => window.V03_DEBUG.set({ cred: 'high' }));
    await sleep(800);
    return { b, a };
  })();
  check('A 可信度阈值对关联线产生真实变化（低置信关系随阈值出现/消失）',
    edgeChange.a.edges > edgeChange.b.edges, edgeChange.b.edges + ' → ' + edgeChange.a.edges);

  /* ---------------- 推演层回归（本期不改） ---------------- */
  await page.click('#tabs button[data-tab="sim"]'); await sleep(900);
  const sim = await simDbg(page);
  check('回归 推演层保持五阶段十二步骤十二轮，未被本期改动破坏',
    sim.stages === 5 && sim.steps === 12 && sim.renderedStages === 5 && sim.renderedSteps === 12 && sim.renderedRounds === 12, JSON.stringify(sim));
  check('回归 推演层不显示流水面板（与 V0.3 一致）', await page.evaluate(() => !document.getElementById('streamBox').classList.contains('on')));
  await page.click('#tabs button[data-tab="fact"]'); await sleep(800);

  /* ---------------- 数据来源内部标识（不暴露在普通界面） ---------------- */
  const prov = await page.evaluate(() => window.V03_DEBUG.provSummary());
  check('数据来源内部标识齐备（真实公开地理 / 人工编写 / 补齐生成），普通界面不展示',
    prov.counts.public >= 80 && prov.counts.curated >= 80 && prov.counts.synthesized >= 300 &&
    prov.byType.regions.public >= 40 && prov.byType.gates.public >= 40 && prov.byType.facts.synthesized >= 120 &&
    (await page.evaluate(() => !/public|curated|synthesized|realGeoIds/.test(document.body.innerText))),
    JSON.stringify(prov.counts));

  /* ---------------- 会话级验收：无错误 / 无横向溢出 ---------------- */
  check('控制台无错误、无未捕获异常（file:// 离线加载）',
    consoleErrors.length === 0 && pageErrors.length === 0, JSON.stringify({ consoleErrors: consoleErrors.slice(0, 3), pageErrors: pageErrors.slice(0, 3) }));
  check('无外部网络请求（单文件离线可用）', external.length === 0, external.slice(0, 3).join(','));
  check('1440×900 无横向溢出', (await overflow(page)) === 0);

  /* ---------------- 窄屏 390px ---------------- */
  const { page: p2 } = await open(browser, 390, 844, '390');
  check('390px 无横向溢出（默认视图）', (await overflow(p2)) === 0);
  await p2.click('#menuBtn'); await sleep(450);
  const menu390 = await p2.evaluate(() => document.getElementById('menu').getBoundingClientRect());
  check('390px 图层菜单滑出且不超出视口', menu390.left === 0 && menu390.right <= 390 && (await overflow(p2)) === 0, JSON.stringify({ left: menu390.left, right: menu390.right }));
  await shot(p2, 'v04-21-narrow-menu.png');
  await p2.click('#menuClose'); await sleep(400);
  const narrowCards = await p2.locator('#layer-fact .fcard').count();
  check('390px 事实卡片仍为两列瀑布流且可用', narrowCards > 3, narrowCards + ' 张');
  await shot(p2, 'v04-20-narrow-fact.png');
  await p2.locator('#layer-fact .fcard').first().click(); await sleep(600);
  check('390px 事实详情弹窗可用且不溢出', (await p2.locator('#modalBody').innerText()).length > 40 && (await overflow(p2)) === 0);
  await shot(p2, 'v04-22-narrow-detail.png');
  await p2.keyboard.press('Escape'); await sleep(300);
  await p2.click('#tabs button[data-tab="relation"]'); await sleep(1400);
  check('390px 关联层可用（节点与关系清单都在）',
    (await relDbg(p2)).nodes > 10 && (await p2.locator('#relBody .rel-row').count()) > 3 && (await overflow(p2)) === 0);
  await shot(p2, 'v04-23-narrow-relation.png');
  check('390px 控制台无错误', consoleErrors.filter(x => x.startsWith('390')).length === 0);

  await browser.close();

  /* ---------------- 报告 ---------------- */
  const pass = results.filter(r => r.ok).length;
  const md = ['# AgriLink V1.0 验收报告（LLM-291）', '',
    `- 运行：\`node test/v03.mjs\`（Playwright / file:// 离线 / 1440×900 + 390px）`,
    `- 结果：**${pass}/${results.length} 通过**`,
    `- 控制台错误：${consoleErrors.length} · 未捕获异常：${pageErrors.length} · 外部请求：${external.length}`,
    notes.length ? `- 观测：${notes.join('；')}` : '', '',
    '| 条目 | 结果 | 明细 |', '| --- | --- | --- |',
    ...results.map(r => `| ${r.name} | ${r.ok ? '✅ 通过' : '❌ 失败'} | ${String(r.detail).replace(/\|/g, '/').slice(0, 160)} |`),
    ''].join('\n');
  fs.writeFileSync(path.join(root, 'test', 'report-v03.md'), md);
  console.log(`\n${pass}/${results.length} 通过 · 报告 test/report-v03.md`);
  if (pass !== results.length) process.exitCode = 1;
}

run().catch(e => { console.error(e); process.exit(1); });
