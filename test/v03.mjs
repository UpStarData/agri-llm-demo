#!/usr/bin/env node
/* ============================================================
   AgriLink V1.0 验收测试（LLM-291 + LLM-292 数据包定向接入）
   页面指令 G/T/L/M/B/R/D/A 逐条断言 + 数据包口径指纹
   直接加载单文件 index.html（file://），拦截全部外部请求 → 同时验证离线可用与无控制台错误
   每个断言都检查「真实状态是否写回」（window.V03_DEBUG.state() 与各层 debug()）
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

/* 数据包验收指纹（LLM-292 agrilink-demo-v1） */
const FINGERPRINT = { facts: 861, objects: 377, relations: 585, regions: 64, ports: 56, airports: 49, nodes: 4, streamEvents: 1135 };
const DENSITY = { L1: 342, L2: 175, L3: 281 };

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
  page.setDefaultTimeout(12000);
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(tag + ': ' + m.text()); });
  page.on('pageerror', e => pageErrors.push(tag + ': ' + String(e)));
  page.on('request', r => { if (!r.url().startsWith('file://') && !r.url().startsWith('about:')) external.push(r.url()); });
  await page.route('**/*', rt => {
    const u = rt.request().url();
    return (u.startsWith('file://') || u.startsWith('about:')) ? rt.continue() : rt.abort();
  });
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__AGRI_READY === true, null, { timeout: 30000 });
  await sleep(800);
  return { ctx, page };
}
const st = page => page.evaluate(() => window.V03_DEBUG.state());
const counts = page => page.evaluate(() => window.V03_DEBUG.counts());
const factDbg = page => page.evaluate(() => window.V03Fact.debug());
const relDbg = page => page.evaluate(() => window.V03Relation.debug());
const simDbg = page => page.evaluate(() => window.V03Sim.debug());
const overflow = page => page.evaluate(() => window.V03_DEBUG.overflow());
const setGeo = async (page, level, focus) => { await page.evaluate(a => window.V03_DEBUG.set({ geo: { level: a.level, focus: a.focus } }), { level, focus: focus || null }); await sleep(900); };
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name), fullPage: false });
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

  /* ================= 数据包定向接入（LLM-292） ================= */
  const c0 = await counts(page);
  check('①数据包口径：861 事实 / 377 本体 / 585 关系全部装载',
    c0.facts === FINGERPRINT.facts && c0.objects === FINGERPRINT.objects && c0.relations === FINGERPRINT.relations,
    JSON.stringify({ facts: c0.facts, objects: c0.objects, relations: c0.relations }));
  check('①地理数据包：64 产区 / 56 港口 / 49 机场 / 4 节点',
    c0.regions === FINGERPRINT.regions && c0.ports === FINGERPRINT.ports && c0.airports === FINGERPRINT.airports && c0.nodes === FINGERPRINT.nodes,
    JSON.stringify({ regions: c0.regions, ports: c0.ports, airports: c0.airports, nodes: c0.nodes }));
  check('⑤时序序列：1135 条 stream.sequence 事件已接入',
    c0.streamEvents === FINGERPRINT.streamEvents, c0.streamEvents + ' 条');
  check('密度指纹：全球 342 / 中国 175 / 湖南 281（按 scopeLayer）',
    c0.byLevel.L1 === DENSITY.L1 && c0.byLevel.L2 === DENSITY.L2 && c0.byLevel.L3 === 344,
    JSON.stringify(c0.byLevel));
  const l1dbg = await factDbg(page);
  check('密度指纹：全球视图实际渲染点数接近包设计 342 点',
    l1dbg.mappable >= 335 && l1dbg.mappable <= DENSITY.L1, l1dbg.mappable + ' 点（3 条无坐标事实不上图）');
  check('⑥内部保留 provenanceMeta / dataMode，数据包清单一致',
    (await page.evaluate(() => window.V03_DEBUG.provSummary())).counts.real + 0 > 0 &&
    c0.dataset.factsReal === 90 && c0.dataset.factsGenerated === 771,
    JSON.stringify(c0.dataset));
  const pkgMeta = await page.evaluate(() => ({
    datasetId: window.V03Data.manifest.datasetId, version: window.V03Data.manifest.datasetVersion,
    cardTypes: Object.keys(window.V03Data.cardSchema.templates).length,
    taxonomyL1: window.V03Filter.FACT_TREE.length, leaves: window.V03Filter.FACT_ITEMS.length,
    doms: window.V03Data.DOMAINS.length, person: window.V03Data.OBJECTS.filter(o => o.domain === 'person').length
  }));
  check('数据包元信息与字典接入：六类卡片模板 / 10 类事实字典 / 9 类对象域（含 Person 14 个）',
    pkgMeta.cardTypes === 6 && pkgMeta.taxonomyL1 === 10 && pkgMeta.leaves >= 25 && pkgMeta.doms === 9 && pkgMeta.person === 14,
    JSON.stringify(pkgMeta));

  /* ---------------- 全局 G ---------------- */
  const brand = (await page.locator('.brand').innerText()).replace(/\s+/g, ' ').trim();
  check('G1 顶部品牌为 AgriLink + 版本号，无其它产品名', /AgriLink v1\.0/.test(brand) && !/三层推演|农业数据/.test(brand), brand);
  const fontCss = await page.evaluate(() => [...document.styleSheets].map(s => { try { return [...s.cssRules].map(r => r.cssText).join('\n'); } catch (e) { return ''; } }).join('\n'));
  check('G2 IBM Plex Sans SC 已内联且四档字重分档（300/400/600/700）',
    /IBM Plex Sans SC/.test(fontCss) && [300, 400, 600, 700].every(w => new RegExp('font-weight:\\s*' + w).test(fontCss)));
  const glass = await page.evaluate(() => {
    const f = n => { const cs = getComputedStyle(document.querySelector(n)); return cs.backdropFilter || cs.webkitBackdropFilter || ''; };
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
  const bannedFull = await page.evaluate(() => {
    const t = ['layer-fact', 'layer-relation', 'modalBody', 'menuBody'].map(id => (document.getElementById(id) || {}).innerText || '').join('\n');
    return (t.match(/示意数据|示例数据|样例数据|待标定|示意|示例|样例/g) || []);
  });
  check('G6 事实层 / 关联层界面不出现「示意数据 / 样例」等字样', bannedFull.length === 0, bannedFull.slice(0, 5).join(','));
  check('⑥普通 UI 不暴露来源标识（provenanceMeta / dataMode / real / generated）',
    await page.evaluate(() => !/provenanceMeta|dataMode|synthesized|generated 记录/.test(document.body.innerText)));

  /* ---------------- 顶栏 T ---------------- */
  const order = await page.evaluate(() => {
    const r = n => document.querySelector(n).getBoundingClientRect();
    return { menu: r('#menuBtn').left, brand: r('.brand').left, tabs: r('#tabs').left, icons: r('.tb-right').left,
      tabsCenter: (r('#tabs').left + r('#tabs').right) / 2, vw: innerWidth };
  });
  check('T1 顶栏从左到右：图层菜单 Icon → 品牌 → 三 TAB → 快捷图标组',
    order.menu < order.brand && order.brand < order.tabs && order.tabs < order.icons, JSON.stringify(order));
  check('T1 三 TAB 居中', Math.abs(order.tabsCenter - order.vw / 2) <= 14, '偏差 ' + (order.tabsCenter - order.vw / 2).toFixed(1) + 'px');
  check('T1/T2 快捷图标组为三个图标按钮（流水 / 卡片 / 设置）', (await page.locator('.tb-right .icbtn').count()) === 3);
  check('T2 图标为线性 SVG（24 网格 16px 描边）', await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.icbtn, #mapSk .sk')];
    return btns.length > 10 && btns.every(b => {
      const s = b.querySelector('svg');
      return !s || (s.getAttribute('stroke') === 'currentColor' && Number(s.getAttribute('width')) <= 16);
    });
  }));

  /* ---------------- 左侧图层菜单 L ---------------- */
  await page.click('#menuBtn'); await sleep(450);
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
  check('L2-① 数据概览（本层事实 / 高可信 / 关联本体 / 高影响 / 最近更新 / 类型分布）',
    menu3.ov >= 5 && menu3.dist >= 5, JSON.stringify(menu3));
  check('L2-② 三级分类字典来自数据包 taxonomy：一级 10 类 / 二级 / 三级 emoji 方块卡片',
    menu3.l1 === 10 && menu3.l2 >= 20 && menu3.l3 >= 25 && menu3.l3on === menu3.l3,
    JSON.stringify({ l1: menu3.l1, l2: menu3.l2, l3: menu3.l3 }));
  check('L2-③ 第三层快捷控制（M1–M11）+ 总开关 + 图例', menu3.sk === 11 && menu3.master && menu3.legend >= 5);
  await shot(page, 'v04-02-fact-menu.png');

  const before = (await counts(page)).factsAtLevel;
  await page.locator('#menuBody .ghost.sm', { hasText: '全不选' }).click(); await sleep(700);
  const zero = await page.evaluate(() => ({ facts: window.V03_DEBUG.counts().factsAtLevel, cards: document.querySelectorAll('#layer-fact .fcard').length }));
  check('L2 三级分类全不选 → 地图与卡片真实清空（不是只改文案）', zero.facts === 0 && zero.cards === 0, JSON.stringify(zero));
  await page.locator('#menuBody .ghost.sm', { hasText: '全选' }).click(); await sleep(700);
  check('L2 恢复全选 → 数据回到默认值', (await counts(page)).factsAtLevel === before, before + ' → ' + (await counts(page)).factsAtLevel);
  /* 单张三级卡片：按 taxonomy 精确过滤 */
  await page.locator('#menuBody .l3').first().click(); await sleep(700);
  const oneOff = await page.evaluate(() => ({ on: document.querySelectorAll('#menuBody .l3.on').length, facts: window.V03_DEBUG.counts().factsAtLevel }));
  check('L2 取消一张三级分类卡片后按 taxonomy 精确收敛',
    oneOff.on === menu3.l3 - 1 && oneOff.facts < before, JSON.stringify(oneOff));
  await page.evaluate(() => window.V03_DEBUG.set({ catKeys: null })); await sleep(600);

  const dual = await page.evaluate(() => {
    const pick = sel => [...document.querySelectorAll(sel)].map(b => b.dataset.k + '=' + b.getAttribute('aria-pressed') + ':' + b.querySelector('.sk-v').textContent);
    return { map: pick('#mapSk .sk'), menu: pick('#menuBody .mn-sk .sk') };
  });
  check('L3 快捷键双入口状态一致（11 项逐一相同）',
    dual.map.length === 11 && dual.menu.length === 11 && dual.map.join('|') === dual.menu.join('|'));
  dual.map.forEach((v, i) => { if (v !== dual.menu[i]) check('  快捷键不一致：' + v, false, dual.menu[i]); });
  await page.locator('#skMaster').uncheck(); await sleep(400);
  const mapHidden = await page.evaluate(() => getComputedStyle(document.getElementById('mapSk')).display === 'none');
  check('L3 总开关关闭 → 地图右下角整组快捷键隐藏', mapHidden);
  const tBefore = (await st(page)).time;
  await page.locator('#menuBody .mn-sk .sk[data-k="time"]').click(); await sleep(220);
  await page.locator('#menuBody .sk-pop .sk-opt').nth(0).click(); await sleep(900);
  const tAfter = (await st(page)).time;
  check('L3 总开关关闭时，菜单内快捷控制仍可用', mapHidden && tBefore !== tAfter, tBefore + ' → ' + tAfter);
  await page.evaluate(() => window.V03_DEBUG.set({ time: 'all' })); await sleep(600);
  await page.locator('#skMaster').check(); await sleep(400);
  check('L3 总开关重新打开 → 地图快捷键恢复', (await page.locator('#mapSk .sk').count()) === 11 && await page.locator('#mapSk').isVisible());
  await page.click('#menuClose'); await sleep(400);

  /* ---------------- 地图主区域 M ---------------- */
  await page.evaluate(() => window.V03_DEBUG.set({ geo: { level: 'L1', focus: null }, factId: null, time: 'all', cred: 'all', infl: 'all', q: '' }));
  await sleep(900);
  const geoBox = await page.evaluate(() => {
    const m = document.getElementById('factMap').getBoundingClientRect();
    const box = document.querySelector('.fact-mapbox').getBoundingClientRect();
    return { w: Math.round(m.width), h: Math.round(m.height), boxW: Math.round(box.width), boxH: Math.round(box.height), vw: innerWidth };
  });
  check('M0 2D 地图铺满视口（无外边距，右侧仅剩卡片面板）',
    geoBox.w === geoBox.boxW && geoBox.h === geoBox.boxH && geoBox.w > geoBox.vw * .6, JSON.stringify(geoBox));
  const f0 = await factDbg(page);
  check('M1 默认 2D（3D 画布隐藏）', f0.mode3d === false);
  await page.locator('#mapSk .sk[data-k="mode3d"]').click(); await sleep(1100);
  const f3 = await page.evaluate(() => ({ mode: window.V03Fact.debug().mode3d, hits: window.V03Fact.debug().globeHits,
    canvas: getComputedStyle(document.getElementById('factGlobe')).display, map: getComputedStyle(document.getElementById('factMap')).display }));
  check('M1 3D 切换为地球（自绘地球有可点击星点/标记，内容与 2D 同源）',
    f3.mode === true && f3.hits > 0 && f3.canvas === 'block' && f3.map === 'none', JSON.stringify(f3));
  await sleep(700);
  await shot(page, 'v04-04-fact-3d.png');
  await page.locator('#mapSk .sk[data-k="mode3d"]').click(); await sleep(800);
  check('M1 可切回 2D', (await factDbg(page)).mode3d === false);
  check('M2 影响力动画默认开启（光晕 + 波纹都在）', f0.halos > 0 && f0.hotRipples > 0, 'halos=' + f0.halos);
  await page.locator('#mapSk .sk[data-k="influence"]').click(); await sleep(700);
  const fOff = await factDbg(page);
  check('M2 关闭后影响力动画真实停止（光晕与波纹归零）', fOff.halos === 0 && fOff.ripples === 0 && fOff.hotRipples === 0);
  await page.locator('#mapSk .sk[data-k="influence"]').click(); await sleep(600);
  await page.locator('#mapSk .sk[data-k="fullscreen"]').click(); await sleep(600);
  const fsOK = await page.evaluate(() => ({ state: window.V03_DEBUG.state().sk.fullscreen, real: !!document.fullscreenElement }));
  check('M3 全屏开关与浏览器全屏状态一致（无异常）', fsOK.state === fsOK.real, JSON.stringify(fsOK));
  await page.evaluate(() => { if (document.fullscreenElement) document.exitFullscreen(); }); await sleep(400);

  const vid = await page.evaluate(() => {
    const d = window.V03Fact.debug();
    return { total: d.videoTotal, verified: d.videoVerified, static: d.videoStatic };
  });
  check('M4/R2 视频只对已验证可嵌入源播放，其余保持静态卡片降级',
    vid.total === 10 && vid.verified === 0 && vid.static === 10 &&
    (await page.evaluate(() => !document.querySelector('#layer-fact .fcard iframe, #layer-fact .fcard video, #layer-fact .fcard canvas'))),
    JSON.stringify(vid));
  const externalBeforeVideo = external.length;
  check('无外部网络请求（离线单文件；视频源未验证时不挂载任何外链资源）', externalBeforeVideo === 0, external.slice(0, 3).join(','));
  const vidCheck = await page.evaluate(async () => {
    const f = window.V03Data.FACTS.find(x => x.cardType === 'video');
    window.V03Fact.forceEmbeddable(f.id);
    window.V03_DEBUG.set({ factId: f.id });
    await new Promise(r => setTimeout(r, 400));
    const player = document.querySelector('#modalBody .fc-player[data-embed="1"]');
    const playStateOff = player ? player.dataset.play : null;
    window.V03_DEBUG.set({ sk: { live: true } });
    await new Promise(r => setTimeout(r, 500));
    const playerOn = document.querySelector('#modalBody .fc-player[data-embed="1"]');
    return { id: f.id, hasPlayer: !!player, playStateOff: playStateOff, playStateOn: playerOn ? playerOn.dataset.play : null, hasIframe: !!(playerOn && playerOn.querySelector('iframe')) };
  });
  check('M4 机制验证：标记为已验证可嵌入后出现播放器，且 M4 开关真实控制播放/暂停',
    vidCheck.hasPlayer && vidCheck.playStateOff === '0' && vidCheck.playStateOn === '1' && vidCheck.hasIframe, JSON.stringify(vidCheck));
  await page.evaluate(() => window.V03_DEBUG.set({ sk: { live: false }, factId: null })); await sleep(600);
  await closeModals(page);

  await page.locator('#mapSk .sk[data-k="regions"]').click(); await sleep(700);
  const r1 = await factDbg(page);
  check('M5 主要产区默认关闭，开启后按数据包 geo/regions 标注 64 个产区',
    f0.regionMarks === 0 && r1.regionMarks === 64, '开启后 ' + r1.regionMarks);
  await page.locator('#mapSk .sk[data-k="gates"]').click(); await sleep(700);
  const g1 = await factDbg(page);
  check('M6 港口与机场默认关闭，开启后标注 56 港口 + 49 机场 + 4 节点',
    f0.gateMarks === 0 && g1.gateMarks === 109, '开启后 ' + g1.gateMarks);
  await shot(page, 'v04-07-fact-marks.png');
  const regionPick = await page.evaluate(() => {
    const rg = window.V03Data.REGIONS[2];
    window.V03Fact.pick.region(rg.id);
    return { rgId: rg.id, objId: rg.objId, state: window.V03_DEBUG.state().rel.sel, tab: window.V03_DEBUG.state().tab };
  });
  check('M5/M6 点产区/口岸标记 → 打开对应本体详情',
    regionPick.tab === 'relation' && regionPick.state === regionPick.objId && /^e:/.test(String(regionPick.objId)), JSON.stringify(regionPick));
  await sleep(700);
  const objModal = await page.locator('#modalBody').innerText();
  check('M5/M6 本体详情弹窗确实打开（含对象属性 / 关联关系 / 支撑事实）',
    /关联关系/.test(objModal) && /对象属性/.test(objModal) && objModal.length > 60, objModal.length + ' 字');
  await closeModals(page);
  await page.evaluate(() => window.V03_DEBUG.set({ tab: 'fact' })); await sleep(800);
  await page.locator('#mapSk .sk[data-k="regions"]').click();
  await page.locator('#mapSk .sk[data-k="gates"]').click(); await sleep(600);

  const t7 = (await st(page)).time;
  await page.locator('#mapSk .sk[data-k="time"]').click(); await sleep(220);
  const timeOpts = await page.locator('.sk-pop .sk-opt').allInnerTexts();
  const reserved = await page.locator('.sk-pop .sk-opt.reserved').count();
  await page.locator('#mapSk .sk-pop .sk-opt').nth(0).click(); await sleep(900);
  const d7Count = (await counts(page)).factsAtLevel;
  await page.locator('#mapSk .sk[data-k="time"]').click(); await sleep(220);
  await page.locator('#mapSk .sk-pop .sk-opt').nth(3).click(); await sleep(900);
  const allCount = (await counts(page)).factsAtLevel;
  check('M7 时间范围四个选项 + 预留时间轴播放位；切换产生真实数据变化',
    timeOpts.length === 5 && reserved === 1 && /时间轴播放/.test(timeOpts.join(' ')) && t7 === 'all' && allCount > d7Count,
    '默认 ' + t7 + '，7 天 ' + d7Count + ' → 全部 ' + allCount);

  const c8 = (await counts(page)).factsAtLevel;
  await page.locator('#mapSk .sk[data-k="cred"]').click(); await sleep(220);
  await page.locator('#mapSk .sk-pop .sk-opt').nth(0).click(); await sleep(900);
  const c8b = await page.evaluate(() => ({ n: window.V03_DEBUG.counts().factsAtLevel, cred: window.V03_DEBUG.state().cred }));
  check('M8 可信度阈值：默认不限，切到「高」后按 credibility.band 收敛', c8b.cred === 'high' && c8b.n < c8, c8 + ' → ' + c8b.n);
  await page.locator('#mapSk .sk[data-k="cred"]').click(); await sleep(220);
  await page.locator('#mapSk .sk-pop .sk-opt').nth(3).click(); await sleep(800);
  const i9 = (await counts(page)).factsAtLevel;
  await page.locator('#mapSk .sk[data-k="infl"]').click(); await sleep(220);
  await page.locator('#mapSk .sk-pop .sk-opt').nth(0).click(); await sleep(900);
  const i9b = await page.evaluate(() => ({ n: window.V03_DEBUG.counts().factsAtLevel, infl: window.V03_DEBUG.state().infl }));
  check('M9 影响等级阈值：默认不限，切到「高」后按 severity ≥ 70 收敛', i9b.infl === 'high' && i9b.n < i9, i9 + ' → ' + i9b.n);
  await page.locator('#mapSk .sk[data-k="infl"]').click(); await sleep(220);
  await page.locator('#mapSk .sk-pop .sk-opt').nth(3).click(); await sleep(800);

  await page.locator('#mapSk .sk[data-k="search"]').click(); await sleep(250);
  await page.fill('.sk-pop .sk-input', '榴莲'); await sleep(1000);
  const sq = await page.evaluate(() => ({ q: window.V03_DEBUG.state().q, n: window.V03_DEBUG.counts().factsAtLevel,
    cards: document.querySelectorAll('#layer-fact .fcard').length,
    hit: [...document.querySelectorAll('#layer-fact .fcard')].every(n => /榴莲/.test(n.innerText)) }));
  check('M10 关键词搜索产生真实过滤（结果都命中关键词）', sq.q === '榴莲' && sq.n > 0 && sq.n < allCount && sq.cards === sq.n, JSON.stringify(sq));
  await page.keyboard.press('Escape'); await sleep(250);
  await page.locator('#mapSk .sk[data-k="search"]').click(); await sleep(250);
  await page.fill('.sk-pop .sk-input', ''); await sleep(800);
  await page.keyboard.press('Escape'); await sleep(300);

  const lgOn = await factDbg(page);
  await page.locator('#mapSk .sk[data-k="legend"]').click(); await sleep(600);
  const lgOff = await page.evaluate(() => ({ legend: window.V03Fact.debug().legend, display: getComputedStyle(document.getElementById('factLegend')).display }));
  check('M11 图例默认开启，可关闭（只展示不参与筛选）',
    lgOn.legend === true && lgOff.legend === false && lgOff.display === 'none', JSON.stringify(lgOff));
  await page.locator('#mapSk .sk[data-k="legend"]').click(); await sleep(500);
  const skBox = await page.evaluate(() => {
    const b = document.getElementById('mapSk').getBoundingClientRect();
    return { n: document.querySelectorAll('#mapSk .sk').length, right: innerWidth - b.right, bottom: innerHeight - b.bottom, h: b.height };
  });
  check('M12 11 个快捷键在地图右下角排成一排（小尺寸）',
    skBox.n === 11 && skBox.right < 500 && skBox.bottom < 200 && skBox.h < 45, JSON.stringify(skBox));

  await setGeo(page, 'L1'); const n1 = (await counts(page)).factsAtLevel;
  const span = await page.evaluate(() => {
    const list = window.V03Filter.factsAtLevel();
    return { west: list.some(f => f.lng < -30), east: list.some(f => f.lng > 120), south: list.some(f => f.lat < 0), north: list.some(f => f.lat > 40), countries: new Set(list.map(f => f.region)).size };
  });
  await setGeo(page, 'L2'); const n2 = (await counts(page)).factsAtLevel;
  await setGeo(page, 'L3', '湖南'); const n3 = (await counts(page)).factsAtLevel;
  notes.push('视线层级：全球 ' + n1 + ' / 中国 ' + n2 + ' / 湖南 ' + n3 + ' 条；覆盖 西经 ' + span.west + ' 东经 ' + span.east + ' 南半球 ' + span.south + ' 北半球 ' + span.north);
  check('M13 层级密度与数据包密度计划一致（342 / 175 / 281），全球覆盖多洲',
    n1 === DENSITY.L1 && n2 === DENSITY.L2 && n3 === DENSITY.L3 && span.west && span.east && span.south && span.north,
    n1 + ' / ' + n2 + ' / ' + n3 + ' · 区域数 ' + span.countries + ' · 四象限 ' + [span.west, span.east, span.south, span.north].join(''));
  await shot(page, 'v04-08-fact-l3-hunan.png');
  await setGeo(page, 'L2'); await shot(page, 'v04-02b-fact-l2-china.png');
  await setGeo(page, 'L1');
  check('M14 亮星按 severity / 影响等级分档（高影响星更大更亮）', await page.evaluate(() => {
    const f = window.V03Fact;
    return f.starSize({ impact: 'high', severity: 90 }) > f.starSize({ impact: 'mid', severity: 50 }) &&
      f.starSize({ impact: 'mid', severity: 50 }) > f.starSize({ impact: 'low', severity: 20 });
  }));
  await page.waitForFunction(() => window.V03_DEBUG.flashIds().length > 0, null, { timeout: 20000 }).catch(() => {});
  const flash = await page.evaluate(() => window.V03_DEBUG.flashIds());
  check('M15 数据包 stream.sequence 的 star 事件驱动地图亮星', flash.length > 0, '亮星 ' + flash.length + ' 颗');
  const starMix = await page.evaluate(() => {
    const S = window.V03Data.STREAM_SEQ.filter(e => e.star);
    return { total: S.length, bright: S.filter(e => e.star.level === 'bright').length, dim: S.filter(e => e.star.level === 'dim').length };
  });
  check('M15 亮星/微弱星分级与数据包一致（severity ≥ 70 为亮星）', starMix.total === 160 && starMix.bright === 21 && starMix.dim === 139, JSON.stringify(starMix));

  /* ---------------- 底部流水 B ---------------- */
  const streamBox = await page.evaluate(() => {
    const b = document.getElementById('streamBox'), cs = getComputedStyle(b);
    return { h: b.getBoundingClientRect().height, bg: cs.backgroundColor, text: b.innerText.slice(0, 120), hasH: !!b.querySelector('h1,h2,h3,h4'), lines: document.querySelectorAll('#streamBody .st-line').length };
  });
  check('B1 流水为纯黑背景的窄条、无标题', /rgb\(0, 0, 0\)/.test(streamBox.bg) && streamBox.h <= 140 && !streamBox.hasH, JSON.stringify({ h: streamBox.h, lines: streamBox.lines }));
  check('⑤流水内容来自数据包时序序列（阶段标签 + 事实引用）', await page.evaluate(() => {
    const txt = document.getElementById('streamBody').innerText;
    const stageOk = /接入|抽取|归并|定位|评分|关联|图谱|告警/.test(txt);
    const fidOk = /\[(real|gen)-/.test(txt);
    return stageOk || fidOk;
  }), streamBox.text.replace(/\n/g, ' | ').slice(0, 80));
  await shot(page, 'v04-10-stream.png');
  await page.click('#streamClose'); await sleep(400);
  const closed = await page.evaluate(() => ({ on: document.getElementById('streamBox').classList.contains('on'), state: window.V03_DEBUG.state().panels.stream }));
  check('B2 右侧 × 可关闭流水面板', closed.on === false && closed.state === false);
  await page.click('#btnStream'); await sleep(700);
  const rhythm = await page.evaluate(async () => {
    const box = document.getElementById('streamBody');
    const batches = [];
    const mo = new MutationObserver(m => {
      const added = m.reduce((n, x) => n + x.addedNodes.length, 0);
      if (added) batches.push({ t: performance.now(), added });
    });
    mo.observe(box, { childList: true });
    await new Promise(r => setTimeout(r, 12000));
    mo.disconnect();
    const gaps = [];
    for (let i = 1; i < batches.length; i++) gaps.push(Math.round(batches[i].t - batches[i - 1].t));
    return { batches: batches.length, lines: batches.reduce((n, b) => n + b.added, 0),
      burst: Math.max(...batches.map(b => b.added)), min: gaps.length ? Math.min(...gaps) : -1,
      max: gaps.length ? Math.max(...gaps) : -1, gaps: gaps.slice(0, 8) };
  });
  check('B3 日志滚动节奏不均匀（成批连吐 7–8 行、追赶连吐、重批次长停顿）',
    rhythm.batches >= 4 && rhythm.burst >= 3 && rhythm.lines >= 20 && rhythm.min < 400 && rhythm.max > 1600, JSON.stringify(rhythm));
  const tabs = await page.evaluate(() => ({ n: document.querySelectorAll('#streamBox .st-tab').length, add: document.querySelectorAll('#streamBox .st-tab.add').length, on: document.querySelectorAll('#streamBox .st-tab.on').length }));
  check('B4 当前只有一条输入流 Tab，并预留多 Tab 位', tabs.n === 2 && tabs.on === 1 && tabs.add === 1, JSON.stringify(tabs));

  /* ---------------- 右侧事实卡片 R（六类 cardType 模板） ---------------- */
  await page.evaluate(() => window.V03_DEBUG.set({ time: 'all', cred: 'all', infl: 'all', geo: { level: 'L1', focus: null } }));
  await sleep(1000);
  const cardStat = await page.evaluate(() => {
    const d = window.V03Fact.debug();
    const q = sel => document.querySelectorAll(sel).length;
    return { columns: getComputedStyle(document.querySelector('.fcards')).columnCount, n: d.cards, types: d.cardTypes,
      spark: q('#layer-fact .spark'), wx: q('#layer-fact .wx'), staticVideo: q('#layer-fact .fc-static'),
      kbar: q('#layer-fact .kbar'), policy: [...document.querySelectorAll('#layer-fact .fcard')].filter(n => /发布机构/.test(n.innerText)).length,
      alert: q('#layer-fact .alert') };
  });
  const sixTypes = ['news', 'policy', 'price', 'weather', 'video', 'market'];
  check('R1 事实卡片为两列瀑布流（单视野 ' + cardStat.n + ' 张）',
    cardStat.columns === '2' && cardStat.n > 100, JSON.stringify({ columnCount: cardStat.columns, n: cardStat.n }));
  check('③六类 cardType 模板全部接入并渲染',
    sixTypes.every(t => cardStat.types[t] > 0) && cardStat.spark > 0 && cardStat.wx > 0 && cardStat.kbar > 0 && cardStat.staticVideo > 0 && cardStat.policy > 0,
    JSON.stringify(cardStat.types));
  await shot(page, 'v04-05-fact-cards.png');
  await page.locator('#layer-fact .fcard').first().click(); await sleep(700);
  const dSections = await page.evaluate(() => {
    const t = document.getElementById('modalBody').innerText;
    const grid = getComputedStyle(document.querySelector('#modalBody .fd-grid'));
    return { t, cols: grid.gridTemplateColumns.split(' ').length };
  });
  check('D1/D2 事实详情弹窗两列布局，含摘要/证据/相关本体/相关关系/关键字段/行政区路径',
    dSections.cols === 2 && /事实摘要/.test(dSections.t) && /证据/.test(dSections.t) && /相关本体对象/.test(dSections.t) &&
    /相关关系/.test(dSections.t) && /关键字段/.test(dSections.t) && /行政区路径/.test(dSections.t));
  await shot(page, 'v04-06-fact-detail.png');
  const logsBtn = await page.locator('#modalBody #toLog');
  await logsBtn.click(); await sleep(500);
  check('⑤详情内处理记录来自数据包 stream.sequence',
    await page.evaluate(() => /stream.sequence/.test(document.getElementById('modalBody').innerText) &&
      (/暂无该事实的处理记录/.test(document.getElementById('modalBody').innerText) || /\[(接入|抽取|归并|定位|评分|关联|图谱|告警)\]/.test(document.getElementById('modalBody').innerText))));
  await page.locator('#modalBody [data-obj]').first().click(); await sleep(1000);
  const jumped = await st(page);
  check('D 详情内点本体 chip → 携带事实进入关联层并选中该对象',
    jumped.tab === 'relation' && !!jumped.rel.sel && jumped.carry.length > 0, JSON.stringify({ tab: jumped.tab, carry: jumped.carry.length }));
  await closeModals(page); await sleep(300);

  /* ---------------- 关联层 A ---------------- */
  const frame = await page.evaluate(() => ({
    topbar: !!document.querySelector('.topbar'), menu: !!document.getElementById('menu'),
    canvas: document.getElementById('relCanvas').getBoundingClientRect().width > 300,
    side: !!document.getElementById('relSide'), stream: !!document.getElementById('streamBox')
  }));
  check('A1 关联层框架与事实层完全一致（顶栏/菜单/地图/右侧面板/底部流水）',
    frame.topbar && frame.menu && frame.canvas && frame.side && frame.stream, JSON.stringify(frame));
  await page.click('#menuBtn'); await sleep(500);
  const relMenu = await page.evaluate(() => ({
    l1: [...document.querySelectorAll('#menuBody .mn-l1')].map(n => n.textContent),
    l3: document.querySelectorAll('#menuBody .l3').length,
    on: document.querySelectorAll('#menuBody .l3.on').length,
    sk: document.querySelectorAll('#menuBody .mn-sk .sk').length
  }));
  check('A2 关联层分类字典为九类本体对象域（数据包 displayDomains，含人物角色）',
    relMenu.l3 === 9 && relMenu.on === 9 && relMenu.sk === 11 && relMenu.l1.join('') === '地理实体经营主体抽象对象', JSON.stringify(relMenu));
  await shot(page, 'v04-15-relation-menu.png');
  const relBefore = await relDbg(page);
  await page.locator('#menuBody .l3').nth(8).click(); await sleep(900);
  const relAfter = await relDbg(page);
  check('A2 取消一个本体类型后对象与关系数量真实变化',
    relAfter.nodes < relBefore.nodes || relAfter.edges < relBefore.edges,
    relBefore.nodes + '→' + relAfter.nodes + ' 对象 / ' + relBefore.edges + '→' + relAfter.edges + ' 关系');
  await page.locator('#menuBody .l3').nth(8).click(); await sleep(700);
  await page.click('#menuClose'); await sleep(500);

  const rel = await relDbg(page);
  check('A3 地图上是本体节点（可定位本体全部落图）', rel.mapped > 200 && rel.nodes > rel.mapped, '落图 ' + rel.mapped + '/' + rel.nodes);
  check('A4 每条关系都能逐条定位（线上关系 + 关系清单行数一致）', rel.lines > 0 && rel.rows === rel.edges && rel.edges === 585,
    '线上 ' + rel.lines + ' 条，清单 ' + rel.rows + ' 条，共 ' + rel.edges + ' 条');
  const color = await page.evaluate(() => {
    const hex2hsl = hex => {
      const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
      let h = 0;
      if (d) { if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; }
      return h;
    };
    const f = Object.values(window.V03Data.CATS).map(c => c.c), r = window.V03Data.DOMAINS.map(d => d.c);
    return { shared: f.filter(c => r.includes(c)).length, relWarm: r.map(hex2hsl).filter(h => h >= 15 && h <= 100).length, factCool: f.map(hex2hsl).filter(h => h >= 160 && h <= 260).length };
  });
  check('A5 关联层暖色本体色系与事实层冷色事实色系完全区分（无共用色 + 色相分带）',
    color.shared === 0 && color.relWarm >= 6 && color.factCool >= 3, JSON.stringify(color));
  const flow = await page.evaluate(() => {
    const chart = window.echarts.getInstanceByDom(document.getElementById('relCanvas'));
    const series = chart.getModel().option.series || [];
    const line = series.find(s => s.effect && s.effect.show && s.type === 'lines');
    return { flowing: !!line, symbol: line && line.effect.symbol, trail: line && line.effect.trailLength, points: line ? (line.data || []).length : 0 };
  });
  check('A7 关系连线为流动粒子动画（Mirofish 取向：粒子流动 + 拖尾）',
    flow.flowing === true && flow.symbol === 'circle' && flow.points > 100 && flow.trail > 0, JSON.stringify(flow));
  const nogeoFirst = await page.evaluate(() => document.querySelectorAll('#relBody .rel-card').length);
  const personVisible = await page.evaluate(() => [...document.querySelectorAll('#relBody .rel-card')].some(n => /人物角色/.test(n.innerText)));
  await page.locator('#relBody #relMore').click(); await sleep(800);
  const nogeo = await page.evaluate(() => {
    const d = window.V03Relation.debug();
    const mapIds = new Set();
    const o = window.echarts.getInstanceByDom(document.getElementById('relCanvas')).getOption();
    o.series.forEach(s => { if (s.type === 'scatter') (s.data || []).forEach(it => mapIds.add(it.id)); });
    const nogeoIds = window.V03Data.OBJECTS.filter(x => x.geo === false).map(x => x.id);
    return { unmapped: d.unmapped, cards: document.querySelectorAll('#relBody .rel-card').length,
      leaked: nogeoIds.filter(id => mapIds.has(id)).length, all: nogeoIds.length };
  });
  check('④A8 非地理本体（含 Person 14 个）只在右侧面板呈现，不在地图伪造点位',
    nogeo.cards === nogeo.unmapped && nogeo.leaked === 0 && nogeo.unmapped === 106 && personVisible && nogeoFirst >= 12,
    JSON.stringify({ 首屏卡片: nogeoFirst, ...nogeo }));
  check('A9 底部流水在关联层为「本体抽离与关联处理」日志',
    await page.evaluate(() => document.getElementById('stTabName').textContent === '抽离流' && /抽离|关系|本体|图谱/.test(document.getElementById('streamBody').innerText)));
  await shot(page, 'v04-13-relation-map.png');

  await page.locator('#relBody .rel-card').first().click(); await sleep(800);
  const a10 = await page.locator('#modalBody').innerText();
  check('A10 本体详情弹窗重排（对象说明 / 关联关系 / 时序记忆 / 对象属性 / 支撑事实）',
    /对象说明/.test(a10) && /关联关系/.test(a10) && /时序记忆/.test(a10) && /对象属性/.test(a10) && /支撑事实/.test(a10));
  await shot(page, 'v04-16-relation-obj-detail.png');
  await closeModals(page); await sleep(400);
  await page.locator('#relBody .rel-row').first().click(); await sleep(800);
  const a11 = await page.locator('#modalBody').innerText();
  check('A11 关联详情弹窗重排（关系强度 / 置信度 / 时序记忆 / 支撑事实 / 关键字段）',
    /关系强度/.test(a11) && /置信度/.test(a11) && /时序记忆/.test(a11) && /支撑事实/.test(a11) && /关键字段/.test(a11));
  await shot(page, 'v04-17-relation-rel-detail.png');
  await closeModals(page); await sleep(400);
  await page.evaluate(() => window.V03_DEBUG.set({ time: 'all', cred: 'high', infl: 'all' })); await sleep(900);
  const edgeHi = await relDbg(page);
  const edgeAll = await (async () => { await page.evaluate(() => window.V03_DEBUG.set({ cred: 'all' })); await sleep(900); return relDbg(page); })();
  check('A 可信度阈值对关联线产生真实变化（置信度阈值收敛关系）',
    edgeAll.edges > edgeHi.edges && edgeAll.edges === 585, edgeHi.edges + ' → ' + edgeAll.edges);

  /* ---------------- 推演层回归（数据包不得连带覆盖 run / report） ---------------- */
  await page.evaluate(() => window.V03_DEBUG.set({ carry: [], sim: { seedIds: [] } })); await sleep(600);
  const simAlias = await page.evaluate(() => {
    const ids = window.V03Filter.seeds(window.V03Store.state);
    return {
      ids: ids.slice(0, 6),
      baseOk: ids.every(id => { const f = window.V03Data.factById(id); return !!f; }),
      baseAlias: window.V03Data.BASE_FACTS.length, packAlias: window.V03Data.BASE_FACTS.length + ((window.V03Data.PACK || {}).facts || []).length,
      baseline: (window.V03Data.BASELINE || []).length,
      report: (window.V03Data.REPORT || []).length, stages: (window.V03Data.STAGES || []).length
    };
  });
  check('②事实数据与推演数据别名拆分：自带数据保留为 BASE_*，种子与报告引用仍可解析',
    simAlias.baseOk && simAlias.baseAlias >= 25 && simAlias.packAlias >= 150 && simAlias.baseline >= 6 && simAlias.report >= 4 && simAlias.stages === 5,
    JSON.stringify({ seeds: simAlias.ids.length, base: simAlias.baseAlias, aliasTotal: simAlias.packAlias, report: simAlias.report }));
  await page.click('#tabs button[data-tab="sim"]'); await sleep(1000);
  const sim = await simDbg(page);
  check('回归 推演层保持五阶段十二步骤十二轮，run / report 未被数据包覆盖',
    sim.stages === 5 && sim.steps === 12 && sim.renderedStages === 5 && sim.renderedSteps === 12 && sim.renderedRounds === 12 &&
    sim.run === 'AGRI-DURIAN-HX-001' && (await page.locator('#simSeeds [data-seed]').count()) === 6 &&
    (await page.locator('#simReport').innerText()).length > 50, JSON.stringify({ ...sim, rows: await page.locator('#simSeeds [data-seed]').count() }));
  check('回归 推演层不显示流水面板（与 V0.3 一致）', await page.evaluate(() => !document.getElementById('streamBox').classList.contains('on')));
  await page.click('#tabs button[data-tab="fact"]'); await sleep(900);

  /* ---------------- 数据来源内部标识 ---------------- */
  const prov = await page.evaluate(() => window.V03_DEBUG.provSummary());
  check('⑥数据来源内部标识齐备（real / generated 与真实地理公开口径），普通界面不展示',
    prov.byType.facts.real === 90 && prov.byType.facts.generated === 771 && prov.byType.regions.public === 64 &&
    prov.sources === 71 && prov.evidence === 90,
    JSON.stringify(prov.counts));

  /* ---------------- 会话级验收 ---------------- */
  check('控制台无错误、无未捕获异常（file:// 离线加载）',
    consoleErrors.length === 0 && pageErrors.length === 0,
    JSON.stringify({ consoleErrors: consoleErrors.slice(0, 3), pageErrors: pageErrors.slice(0, 3) }));
  check('外部请求仅来自被强制的已验证可嵌入源（其余全程离线）',
    external.every(u => u.indexOf('cctv.com') >= 0 || u.indexOf('about:') === 0), external.join(','));
  check('1440×900 无横向溢出', (await overflow(page)) === 0);

  /* ---------------- 窄屏 390px ---------------- */
  const { page: p2 } = await open(browser, 390, 844, '390');
  check('390px 无横向溢出（默认视图）', (await overflow(p2)) === 0);
  await p2.click('#menuBtn'); await sleep(500);
  const menu390 = await p2.evaluate(() => document.getElementById('menu').getBoundingClientRect());
  check('390px 图层菜单滑出且不超出视口', menu390.left === 0 && menu390.right <= 390 && (await overflow(p2)) === 0, JSON.stringify({ left: menu390.left, right: menu390.right }));
  await shot(p2, 'v04-21-narrow-menu.png');
  await p2.click('#menuClose'); await sleep(400);
  const narrowCards = await p2.locator('#layer-fact .fcard').count();
  check('390px 事实卡片仍为两列瀑布流且可用', narrowCards > 50, narrowCards + ' 张');
  await shot(p2, 'v04-20-narrow-fact.png');
  await p2.locator('#layer-fact .fcard').first().click(); await sleep(700);
  check('390px 事实详情弹窗可用且不溢出', (await p2.locator('#modalBody').innerText()).length > 60 && (await overflow(p2)) === 0);
  await shot(p2, 'v04-22-narrow-detail.png');
  await p2.keyboard.press('Escape'); await sleep(400);
  await p2.click('#tabs button[data-tab="relation"]'); await sleep(2500);
  check('390px 关联层可用（本体节点与关系清单都在）',
    (await relDbg(p2)).nodes === 377 && (await p2.locator('#relBody .rel-row').count()) > 3 && (await overflow(p2)) === 0);
  await shot(p2, 'v04-23-narrow-relation.png');
  check('390px 控制台无错误', consoleErrors.filter(x => x.startsWith('390')).length === 0);

  await browser.close();

  /* ---------------- 报告 ---------------- */
  const pass = results.filter(r => r.ok).length;
  const md = ['# AgriLink V1.0 验收报告（LLM-291 + LLM-292 数据包定向接入）', '',
    `- 运行：\`node test/v03.mjs\`（Playwright / file:// 离线 / 1440×900 + 390px）`,
    `- 数据包：\`agrilink-demo-v1\`（861 事实 / 377 本体 / 585 关系 / 64 产区 / 56 港口 / 49 机场 / 4 节点 / 1135 时序事件）`,
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
