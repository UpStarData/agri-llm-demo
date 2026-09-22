#!/usr/bin/env node
/* ============================================================
   AgriLink V1.0 · V2 视觉校准阶段自检（结构 / 明确删除 / 一票退回项）
   说明：本脚本只做结构性自检，**不代替人眼视觉验收**（V2 执行边界）。
   运行：node test/v03.mjs      报告：test/report-v03.md
   ============================================================ */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'file://' + path.join(root, 'index.html');
const results = [];
const consoleErrors = [], pageErrors = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined && detail !== '' ? '  — ' + detail : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(browser, w = 1440, h = 900, tag = 'desktop') {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(tag + ': ' + m.text()); });
  page.on('pageerror', e => pageErrors.push(tag + ': ' + String(e)));
  await page.route('**/*', rt => { const u = rt.request().url(); return (u.startsWith('file://') || u.startsWith('about:')) ? rt.continue() : rt.abort(); });
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__AGRI_READY === true, null, { timeout: 30000 });
  await sleep(900);
  return page;
}
const counts = page => page.evaluate(() => window.V03_DEBUG.counts());
const factDbg = page => page.evaluate(() => window.V03Fact.debug());
const relDbg = page => page.evaluate(() => window.V03Relation.debug());
const overflow = page => page.evaluate(() => window.V03_DEBUG.overflow());
const bodyText = page => page.evaluate(() => document.body.innerText);
/* 一票退回项：界面不得出现的演示 / 技术文案 */
const BANNED = /样例|示意|Demo 数据|数据包|L1|L2|L3|生成器|generator|调试|debug|agrilink-demo-v1|geo\s*=\s*null|真实数据|演示环境/;

const browser = await chromium.launch();
const page = await open(browser);

/* ---------------- G1 顶部工具条 ---------------- */
const top = await page.evaluate(() => {
  const bar = document.querySelector('.topbar').getBoundingClientRect();
  const order = ['#menuBtn', '.brand', '#tabs', '#btnStream', '#btnCards', '#btnTheme', '#btnSettings']
    .map(s => ({ s, x: document.querySelector(s).getBoundingClientRect().left }));
  const icons = [...document.querySelectorAll('.topbar svg')].length;
  return { h: Math.round(bar.height), order, icons,
    ctrlH: Math.max(...['#menuBtn', '#btnStream', '#btnCards', '#btnTheme', '#btnSettings'].map(s => Math.round(document.querySelector(s).getBoundingClientRect().height))) };
});
check('G1 顶部工具条总高 ≤32px，图标热区 ≤32px', top.h <= 32 && top.ctrlH <= 32, JSON.stringify(top));
check('T1 三 TAB 小巧低调（≤13px、细下划线高亮、非大块按钮）', await page.evaluate(() => {
  const b = document.querySelector('#tabs button.on');
  const cs = getComputedStyle(b, '::after');
  return parseFloat(getComputedStyle(b).fontSize) <= 13.5 && !/rgb\(16, 21, 31\)/.test(getComputedStyle(b).backgroundColor) && parseFloat(cs.height) <= 2.5;
}));
check('T3 品牌为 🌾 AgriLink v1.0，Logo 为轻柔摇摆动画（sway）', await page.evaluate(() => {
  const t = document.querySelector('.brand').innerText.replace(/\s+/g, ' ');
  const logo = document.getElementById('logo');
  return /AgriLink v1\.0/.test(t) && !!logo;
}));
check('G1 顶部顺序：菜单显隐 → 🌾 AgriLink → 三 TAB → 流水显隐 → 卡片显隐 → 主题 → 设置',
  top.order[0].x < top.order[1].x && top.order[1].x < top.order[2].x && top.order[2].x < top.order[3].x && top.order[3].x < top.order[5].x && top.order[5].x < top.order[6].x,
  JSON.stringify(top.order.map(o => o.s)));
const iconStrokes = await page.evaluate(() => [...document.querySelectorAll('.topbar svg')].map(s => s.getAttribute('stroke')));
const iconStyle = await page.evaluate(() => [...document.querySelectorAll('.topbar svg, #mapSk svg, #menuBody svg')].map(s => ({
  w: s.getAttribute('stroke-width'), cap: s.getAttribute('stroke-linecap'), join: s.getAttribute('stroke-linejoin'), sz: s.getAttribute('width')
})));
check('五 全局图标统一 Cursor 风格（stroke 1.5、无圆角 butt/miter、16px、主题色）',
    iconStyle.length >= 8 && iconStyle.every(i => i.w === '1.5' && i.cap === 'butt' && i.join === 'miter') &&
  await page.evaluate(() => getComputedStyle(document.querySelector('.tb-ic')).color === 'rgb(145, 164, 169)'),
  JSON.stringify(iconStyle.slice(0, 3)));
check('G1 TAB 为细文字 + 轻底色选中态（非黑白大块按钮）', await page.evaluate(() => {
  const b = document.querySelector('#tabs button.on');
  const cs = getComputedStyle(b);
  return cs.backgroundColor !== 'rgb(16, 21, 31)' && parseFloat(cs.fontSize) <= 13;
}));

/* ---------------- 视觉基线（HungerMap 日夜主题，默认夜间） ---------------- */
const light = await page.evaluate(() => ({
  body: getComputedStyle(document.body).backgroundColor,
  panel: getComputedStyle(document.querySelector('.fact-side')).backgroundColor,
  land: (window.echarts.getInstanceByDom(document.getElementById('factMap')).getOption().geo[0].itemStyle.areaColor) || ''
}));
const glassy = await page.evaluate(() => {
  const f = sel => { const n = document.querySelector(sel); if (!n) return ''; const cs = getComputedStyle(n); return cs.backdropFilter || cs.webkitBackdropFilter || ''; };
  return { topbar: f('.topbar'), menu: f('.menu'), side: f('.fact-side'), sk: f('#mapSk'), legend: f('#legend'), stream: getComputedStyle(document.getElementById('streamBox')).backgroundColor };
});
check('M1 毛玻璃覆盖顶栏 / 菜单 / 右侧面板 / 快捷键条 / 图例（blur 20px saturate160%），流水保持纯黑',
  ['topbar', 'menu', 'side', 'sk', 'legend'].every(k => /blur\((2[0-9]|[3-9][0-9])px\)/.test(glassy[k])) && /rgb\(11, 15, 20\)|rgb\(0, 0, 0\)/.test(glassy.stream),
  JSON.stringify(glassy));
check('视觉基线：默认 HungerMap 夜间（深青海面 + 深色面板 + 深青陆地）',
  /7, 31, 37/.test(light.body) && /25, 27, 28/.test(light.panel) && /#0b3f47/i.test(String(light.land)),
  JSON.stringify(light));
const fonts = await page.evaluate(() => [...document.styleSheets].map(s => { try { return [...s.cssRules].map(r => r.cssText).join('\n'); } catch (e) { return ''; } }).join('\n'));
check('G2 IBM Plex Sans SC 三档字重齐备（300 / 400 / 600/700）',
  /IBM Plex Sans SC/.test(fonts) && [300, 400, 600].every(w => new RegExp('font-weight:\\s*' + w).test(fonts)));

/* ---------------- G3 明确删除 ---------------- */
const removed = await page.evaluate(() => {
  const t = document.body.innerText;
  return {
    breadcrumb: /全球\s*[›>]\s*中国/.test(t),
    teaching: /点省份进入|点星点看|点中国进入|操作教学|点击查看/.test(t),
    kpiOnMap: document.querySelectorAll('#stage > .kpi, .fact-kpi, .fact-top').length,
    distribution: /事实类型分布/.test(t),
    countsLine: /事实卡片\s*\d+\s*条|本层事实\s*\d+\s*条/.test(t),
    tech: /样例|示意|Demo 数据|数据包|L1|L2|L3|生成器|generator|调试|debug|agrilink-demo-v1|geo\s*=\s*null|真实数据|演示环境/.test(t)
  };
});
check('G3 删除地图层级面包屑', !removed.breadcrumb);
check('G3 删除操作教学文案', !removed.teaching);
check('G3 删除地图上的指标卡（本层事实 / 高可信占比 / 关联对象 / 最近更新）', removed.kpiOnMap === 0, 'kpi 容器数 ' + removed.kpiOnMap);
check('G3 删除「事实类型分布」', !removed.distribution);
check('G3 删除卡片总数与层级说明', !removed.countsLine);
check('G3/F8 界面无演示 / 技术文案（样例·示意·数据包·L1/L2/L3·生成器·调试）', !removed.tech);

/* ---------------- F2 左侧菜单四段 ---------------- */
await page.click('#menuBtn'); await sleep(600);
const menu = await page.evaluate(() => ({
  secs: document.querySelectorAll('#menuBody .mn-sec').length,
  ovRows: document.querySelectorAll('#menuBody .ov-i').length,
  hasDist: /事实类型分布/.test(document.getElementById('menuBody').innerText),
  sk: document.querySelectorAll('#menuBody .mn-sk .sk').length,
  master: !!document.getElementById('skMaster'),
  dictL1: document.querySelectorAll('#menuBody .mn-l1').length,
  dictL2: document.querySelectorAll('#menuBody .mn-l2').length,
  dictL3: document.querySelectorAll('#menuBody .l3').length
}));
check('F2 菜单固定四段（数据概览 / 分类筛选 / 地图快捷控制 / 总开关）', menu.secs === 4, JSON.stringify(menu));
check('L1/S2 数据概览只留「事实条数」（可信占比已按补充指令去掉），无边框、数字大于文字', await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#menuBody .ov-i')];
  if (rows.length !== 1) return false;
  const big = parseFloat(getComputedStyle(rows[0].querySelector('b')).fontSize);
  const small = parseFloat(getComputedStyle(rows[0].querySelector('span')).fontSize);
  const cs = getComputedStyle(rows[0]);
  return big >= 20 && small <= 12 && big > small && (cs.borderStyle === 'none' || cs.borderWidth === '0px') && !/事实类型分布/.test(document.getElementById('menuBody').innerText);
}));
check('F2 菜单内含地图快捷控制（11 项 + 放大/缩小）与总开关', menu.sk === 13 && menu.master, '菜单内控制项 ' + menu.sk);
/* v08：数据概览主数字 —— hyperresearch.ai 同款「实时大数字」 */
check('L1/v08 主数字为全位数千分位 + tabular-nums 大数字，且不超过菜单宽度', await page.evaluate(() => {
  const b = document.querySelector('#menuBody .mn-ov.hero .ov-i b');
  if (!b) return false;
  const cs = getComputedStyle(b), wrap = b.closest('.mn-ov').getBoundingClientRect();
  return /^\d{1,3}(,\d{3})+$/.test(b.textContent.trim()) && parseFloat(cs.fontSize) >= 32 && cs.fontWeight === '400'
    && /tabular-nums/.test(cs.fontVariantNumeric) && /tnum/.test(cs.fontFeatureSettings)
    && b.getBoundingClientRect().width <= wrap.width + 1 && !!document.querySelector('#menuBody .ov-note');
}));
const ovT1 = await page.evaluate(() => document.querySelector('#menuBody .mn-ov.hero .ov-i b').textContent);
await sleep(2400);
const ovT2 = await page.evaluate(() => document.querySelector('#menuBody .mn-ov.hero .ov-i b').textContent);
check('L1/v08 主数字按不规则批次递增（允许停顿）且分组格式稳定',
  Number(ovT2.replace(/,/g, '')) - Number(ovT1.replace(/,/g, '')) >= 1 && /^\d{1,3}(,\d{3})+$/.test(ovT2),
  ovT1 + ' → ' + ovT2);
/* 回归：菜单重绘 / 终端事件都会重绘数字，历史上一度会把已走时间丢掉 → 数字倒着走 */
const ovSeries = [];
for (let i = 0; i < 10; i++) { ovSeries.push(await page.evaluate(() => document.querySelector('#menuBody .mn-ov.hero .ov-i b').textContent)); await sleep(320); }
const ovNums = ovSeries.map(s => Number(s.replace(/,/g, '')));
check('L1/v08 主数字只增不减（重绘不掉数）', ovNums.every((v, i) => i === 0 || v >= ovNums[i - 1]), ovSeries.join(' '));

/* ---------------- F3 事实三级分类字典 ---------------- */
check('F3 分类字典与指令一致：一级 7 / 二级 26 / 三级 125，逐条未合并改名',
  menu.dictL1 === 7 && menu.dictL2 === 26 && menu.dictL3 === 125, JSON.stringify(menu));
const dictNames = await page.evaluate(() => ({
  groups: [...document.querySelectorAll('#menuBody .mn-l1 span')].map(n => n.textContent),
  leaves: [...document.querySelectorAll('#menuBody .l3')].map(n => n.textContent.trim())
}));
check('F3 一级分类名称与指令一致',
  dictNames.groups.join('|') === '自然与生态|生产与供给|流通与供应链|市场与交易|消费与舆情|政策与治理|宏观与公共事件', dictNames.groups.join('/'));
check('F3 三级类型抽样存在（高温 / 强降雨 / 产地流出 / 批发价 / 品牌舆情 / 应急保供 / 平陆运河）',
  ['高温', '强降雨', '产地流出', '批发价', '品牌舆情', '应急保供', '平陆运河'].every(n => dictNames.leaves.some(x => x.indexOf(n) >= 0)));
const before = (await counts(page)).factsAtLevel;
await page.locator('#menuBody .l3').first().click(); await sleep(700);
const afterOne = (await counts(page)).factsAtLevel;
await page.locator('#menuBody .ghost.sm', { hasText: '全不选' }).click(); await sleep(700);
const zeroRaw = await counts(page);
const zeroExtra = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('#layer-fact .fcard')];
  const live = cards.filter(n => window.V03Fact.isPlayable(window.V03Data.factById(n.dataset.fid) || {})).length;
  const fresh = cards.filter(n => n.classList.contains('fresh')).length;
  return { live, fresh };
});
const zero = Object.assign({}, zeroRaw, { regular: zeroRaw.cards - zeroExtra.live - zeroExtra.fresh, live: zeroExtra.live, fresh: zeroExtra.fresh });
await page.locator('#menuBody .ghost.sm', { hasText: '全选' }).click(); await sleep(700);
const back = (await counts(page)).factsAtLevel;
check('F3 三级类型为可勾选紧凑项，取消即真实过滤（并可全不选 / 全选恢复）',
  afterOne !== before && zero.factsAtLevel === 0 && zero.regular === 0 && back === before,
  JSON.stringify({ before, afterOne, zero: zero.factsAtLevel, 常规卡片: zero.regular, 直播卡: zero.live, 新接入卡: zero.fresh, back }));
await page.click('#menuClose'); await sleep(500);

/* ---------------- F4 / F5 地图事实与闪光 ---------------- */
const mapSeries = await page.evaluate(() => {
  const o = window.echarts.getInstanceByDom(document.getElementById('factMap')).getOption();
  return o.series.map(s => ({ id: s.id, type: s.type, n: (s.data || []).length }));
});
check('F4 事实层地图只画事实点 + 影响范围，不出现事实之间的线路',
  !mapSeries.some(s => s.type === 'lines' || s.type === 'graph'),
  JSON.stringify(mapSeries));
check('F4 一级分类决定颜色（事实点为 4–6px 小亮点，点上不再贴 Emoji 标签）', await page.evaluate(() => {
  const o = window.echarts.getInstanceByDom(document.getElementById('factMap')).getOption();
  const facts = o.series.find(s => s.id === 'facts');
  const sizes = facts.data.map(d => d.symbolSize);
  const hasPointLabel = facts.data.some(d => d.label && d.label.show);
  return sizes.length > 0 && Math.max(...sizes) <= 6.5 && Math.min(...sizes) >= 4 && !hasPointLabel;
}));
check('F4 影响范围半透明不遮蔽底图（径向渐变 + 低透明度）', await page.evaluate(() => {
  const o = window.echarts.getInstanceByDom(document.getElementById('factMap')).getOption();
  const halo = o.series.find(s => s.id === 'halo');
  return !!(halo && halo.data.length && halo.data[0].itemStyle && halo.data[0].itemStyle.color);
}));
check('F5 持久事实为稳定小点（非 effectScatter 长期发光）', await page.evaluate(() => {
  const o = window.echarts.getInstanceByDom(document.getElementById('factMap')).getOption();
  const facts = o.series.find(s => s.id === 'facts');
  return facts && facts.type === 'scatter';
}));
await sleep(2500);
const flash = await page.evaluate(() => window.V03_DEBUG.flashIds());
check('F5 亮光为一闪而过（≤0.8s 消退为普通小点，不持续发光）', flash.length <= 3, '当前闪光点数 ' + flash.length);

/* ---------------- F6 快捷键与缩放 ---------------- */
const sk = await page.evaluate(() => {
  const mapSk = document.getElementById('mapSk');
  const r = mapSk.getBoundingClientRect();
  const items = [...mapSk.querySelectorAll('.sk')];
  const rows = new Set(items.map(b => Math.round(b.getBoundingClientRect().top)));
  return {
    mapSk: items.length,
    zooms: mapSk.querySelectorAll('.sk[data-k="zoomIn"], .sk[data-k="zoomOut"]').length,
    rows: rows.size,
    rightSide: (window.innerWidth - r.right) < 500,
    borderless: getComputedStyle(mapSk).borderStyle === 'none' || getComputedStyle(mapSk).borderWidth === '0px',
    tooltips: items.filter(b => (b.title || '').length > 3).length,
    shiftsForPanel: (window.innerWidth - r.right) > 380
  };
});
check('M3 快捷键条在地图右下角、无框线、每键有 tooltip、右侧面板打开时自动左移',
  sk.mapSk === 13 && sk.zooms === 2 && sk.rows === 2 && sk.rightSide && sk.borderless && sk.tooltips === 13 && sk.shiftsForPanel, JSON.stringify(sk));
const zoomTest = await page.evaluate(async () => {
  const z0 = window.V03Fact.debug().zoom;
  document.querySelector('#mapSk .sk[data-k="zoomIn"]').click();
  await new Promise(r => setTimeout(r, 350));
  const z1 = window.V03Fact.debug().zoom;
  document.querySelector('#mapSk .sk[data-k="zoomOut"]').click();
  await new Promise(r => setTimeout(r, 350));
  return { z0, z1, z2: window.V03Fact.debug().zoom };
});
check('F6 缩放键真实改变地图缩放', zoomTest.z1 > zoomTest.z0 && Math.abs(zoomTest.z2 - zoomTest.z0) < 1e-6, JSON.stringify(zoomTest));
await page.click('#menuBtn'); await sleep(600);
await page.locator('#skMaster').uncheck(); await sleep(400);
const off = await page.evaluate(() => ({
  hidden: getComputedStyle(document.getElementById('mapSk')).display === 'none',
  menuSk: document.querySelectorAll('#menuBody .mn-sk .sk').length
}));
const t0 = (await page.evaluate(() => window.V03_DEBUG.state())).time;
await page.locator('#menuBody .mn-sk .sk[data-k="time"]').click(); await sleep(200);
await page.locator('#menuBody .sk-pop .sk-opt').nth(1).click(); await sleep(700);
const t1 = (await page.evaluate(() => window.V03_DEBUG.state())).time;
check('F6 总开关只隐藏地图右下角整组快捷键，菜单内快捷控制仍可用',
  off.hidden && off.menuSk === 13 && t0 !== t1, JSON.stringify({ ...off, t0, t1 }));
await page.evaluate(() => window.V03_DEBUG.set({ time: '7d' }));
await page.locator('#skMaster').check(); await sleep(400);
await page.click('#menuClose'); await sleep(400);

/* ---------------- F7 图例 ---------------- */
const legend = await page.evaluate(() => {
  const el = document.getElementById('legend');
  const r = el.getBoundingClientRect();
  const stream = document.getElementById('streamBox').getBoundingClientRect();
  const st = getComputedStyle(el);
  const visibleGroups = new Set(window.V03Filter.factsAtLevel().map(f => (window.V03Filter.leafOf(f) || {}).group).filter(Boolean));
  const legendNames = [...document.querySelectorAll('#legend .lg-i')].map(n => n.textContent.trim());
  return { inMenu: !!document.querySelector('#menuBody .mn-legend'), display: st.display,
    horizontal: r.width > r.height * 2, aboveStream: r.bottom <= stream.top + 2, items: legendNames.length,
    centered: Math.abs((r.left + r.right) / 2 - window.innerWidth / 2) < 160 || r.right <= window.innerWidth - 380,
    singleRow: st.flexWrap === 'nowrap', borderless: st.borderStyle === 'none' || st.borderWidth === '0px',
    hasTitleText: /当前视野类型/.test(el.innerText),
    matchesVisibleTypes: legendNames.length > 0 && legendNames.every(n => visibleGroups.has(n) || /产区|港口|机场|冷链/.test(n)) };
});
check('M4/M5 图例在地图底部居中、单行横排、无框线、不显示「当前视野类型」标题，且内容取自地图上可见类型',
  !legend.inMenu && legend.display !== 'none' && legend.centered && legend.singleRow && legend.borderless &&
  !legend.hasTitleText && legend.items > 0 && legend.matchesVisibleTypes, JSON.stringify(legend));
const legendSync = await page.evaluate(async () => {
  const n0 = document.querySelectorAll('#legend .lg-i').length;
  window.V03_DEBUG.set({ catKeys: window.V03Filter.FACT_ITEMS.slice(0, 3).map(x => x.key) });
  await new Promise(r => setTimeout(r, 600));
  return { n0, n1: document.querySelectorAll('#legend .lg-i').length };
});
check('F7 图例内容随当前分类筛选同步变化', legendSync.n1 !== legendSync.n0, JSON.stringify(legendSync));
await page.evaluate(() => window.V03_DEBUG.set({ catKeys: null })); await sleep(600);

/* ---------------- F8 底部流水 ---------------- */
const stream = await page.evaluate(() => {
  const b = document.getElementById('streamBox');
  return { h: Math.round(b.getBoundingClientRect().height), bg: getComputedStyle(b).backgroundColor,
    hasTitle: !!b.querySelector('h1,h2,h3,h4'), tabs: b.querySelectorAll('.st-tab').length,
    txt: document.getElementById('streamBody').innerText.slice(0, 200), lines: document.querySelectorAll('#streamBody .st-line').length,
    close: !!document.getElementById('streamClose') };
});
check('F8/S2 流水为纯黑终端（约 3 行高、无标题、× 可关闭、多 Tab 预留）',
  /rgb\(11, 15, 20\)|rgb\(0, 0, 0\)/.test(stream.bg) && stream.h >= 60 && stream.h <= 96 && !stream.hasTitle && stream.close && stream.tabs === 2,
  JSON.stringify({ h: stream.h, bg: stream.bg, tabs: stream.tabs }));
check('F8 流水使用产品语言（接入 / 定位 / 影响 / 关联），无技术字段',
  /接入|定位|影响范围|关联|抽取|归并|评分/.test(stream.txt) && !BANNED.test(stream.txt) && !/gen-|real-|r:\*|MERGE|API|uuid/.test(stream.txt),
  stream.txt.replace(/\n/g, ' | ').slice(0, 90));

/* ---------------- F9 右侧事实卡片 ---------------- */
const cards = await page.evaluate(() => {
  const wrap = document.querySelector('.fcards');
  const first = document.querySelector('#layer-fact .fcard');
  return {
    columns: wrap ? getComputedStyle(wrap).columnCount : null,
    n: document.querySelectorAll('#layer-fact .fcard').length,
    chips: document.querySelectorAll('#layer-fact .fcard .chip').length,
    title: !!first.querySelector('h5'),
    order: first ? [...first.children].map(n => n.className || n.tagName) : [],
    staticVideo: document.querySelectorAll('#layer-fact .fc-static').length,
    players: document.querySelectorAll('#layer-fact .fc-player').length,
    iframes: document.querySelectorAll('#layer-fact iframe').length,
    types: window.V03Fact.debug().cardTypes
  };
});
check('F9 两列紧凑瀑布流', cards.columns === '2' && cards.n > 10, JSON.stringify({ columns: cards.columns, n: cards.n }));
check('F9 不显示类型徽章（无类别 chip），可信 / 影响为简短文字',
  cards.chips === 0 && cards.title, JSON.stringify({ chips: cards.chips }));
check('F9 内容层级：标题 → 摘要 → 地点 / 时间 / 来源', await page.evaluate(() => {
  const c = document.querySelector('#layer-fact .fcard');
  const t = c.innerText.split('\n').filter(Boolean);
  return t.length >= 3 && !!c.querySelector('.fcard-foot');
}));
const vidCards = await page.evaluate(async () => {
  const f = window.V03Data.FACTS.find(x => x.cardType === 'video');
  window.V03_DEBUG.set({ q: String(f.title).slice(0, 6), time: 'all', cred: 'all', infl: 'all' });
  await new Promise(r => setTimeout(r, 700));
  const n = document.querySelectorAll('#layer-fact .fc-static').length;
  const p = document.querySelectorAll('#layer-fact .fc-player').length;
  const i = document.querySelectorAll('#layer-fact iframe').length;
  window.V03_DEBUG.set({ q: '', time: '7d', cred: 'high', infl: 'high' });
  await new Promise(r => setTimeout(r, 500));
  const d = window.V03Fact.debug();
  return { n, p, i, verified: d.videoEmbeddable, playable: d.videoVerified, total: d.videoTotal };
});
check('F9 已核验可嵌入的公开直播源已接入（7 路）；file:// 下按静态卡片降级、不挂 iframe 也不产生外链请求',
  vidCards.verified >= 7 && vidCards.n > 0 && vidCards.i === 0 && vidCards.total >= 10, JSON.stringify(vidCards));
check('F9 六类内容模板仍在（价格 / 天气 / 新闻 / 政策 / 视频 / 市场分布）',
  Object.keys(cards.types).length >= 2, JSON.stringify(cards.types));

/* ---------------- F10 事实详情嵌套抽屉 ---------------- */
await page.locator('#layer-fact .fcard').first().click(); await sleep(800);
const drawer = await page.evaluate(() => {
  const d = document.querySelector('#drawerStack .drawer');
  const r = d ? d.getBoundingClientRect() : null;
  return {
    drawers: document.querySelectorAll('#drawerStack .drawer').length,
    centeredModal: !!document.querySelector('.modal'),
    rightSide: r ? r.right >= window.innerWidth - 2 : false,
    text: (d || {}).innerText || ''
  };
});
check('F10 详情为右侧嵌套抽屉，不是居中弹窗', drawer.drawers === 1 && !drawer.centeredModal && drawer.rightSide, JSON.stringify({ drawers: drawer.drawers, right: drawer.rightSide }));
check('F10 详情按核心事实 / 影响 / 证据来源 / 关联本体分组',
  /核心事实/.test(drawer.text) && /影响/.test(drawer.text) && /证据来源/.test(drawer.text) && /关联本体/.test(drawer.text));
check('F10 详情不出现无关统计（事实类型分布等）', !/事实类型分布|数据包/.test(drawer.text));
await page.keyboard.press('Escape'); await sleep(400);
check('F10 抽屉可关闭并回到卡片视图', await page.evaluate(() => document.querySelectorAll('#drawerStack .drawer').length === 0));

/* ---------------- 关联层 A1–A7 ---------------- */
await page.click('#tabs button[data-tab="relation"]'); await sleep(2600);
check('A1 关联层与事实层共用同一框架（顶栏 / 菜单 / 底部图例 / 右下快捷键 / 流水）', await page.evaluate(() =>
  !!document.querySelector('.topbar') && !!document.getElementById('menu') && !!document.getElementById('legend') &&
  !!document.getElementById('mapSk') && !!document.getElementById('streamBox')));
await page.click('#menuBtn'); await sleep(600);
const relMenu = await page.evaluate(() => ({
  l1: [...document.querySelectorAll('#menuBody .mn-l1 span')].map(n => n.textContent).join('|'),
  leaves: [...document.querySelectorAll('#menuBody .l3')].map(n => n.textContent.trim()),
  ovRows: document.querySelectorAll('#menuBody .ov-i').length
}));
check('A2 固定九类对象域齐全且名称与指令一致',
  relMenu.leaves.length === 9 &&
  ['商品与标准', '生产与资源', '经营主体', '市场与渠道', '物流与设施', '政策与机构', '环境与事件', '空间与行政', '指标与状态'].every(n => relMenu.leaves.some(x => x.indexOf(n) >= 0)),
  relMenu.leaves.join('/'));
check('A2 顶部不再重复铺一排大分类按钮（分类只在菜单与紧凑组件中）', await page.evaluate(() => document.querySelectorAll('#layer-relation .catbar, #layer-relation .rel-seg').length === 0));
await page.click('#menuClose'); await sleep(500);
const rel = await relDbg(page);
check('A3 有坐标本体上图，无坐标本体不编造坐标（进入右侧瀑布流）',
  rel.mapped > 200 && rel.unmapped > 0 && rel.nodes === rel.mapped + rel.unmapped, JSON.stringify({ mapped: rel.mapped, unmapped: rel.unmapped }));
check('A4 关系线为细半透明曲线 + 低速方向粒子', await page.evaluate(() => {
  const o = window.echarts.getInstanceByDom(document.getElementById('relCanvas')).getOption();
  const line = o.series.find(s => s.id === 'relLine');
  if (!line) return false;
  const w = line.data[0] && line.data[0].lineStyle ? line.data[0].lineStyle.width : 0;
  const op = line.data[0] && line.data[0].lineStyle ? line.data[0].lineStyle.opacity : 0;
  return w <= 2 && op <= .6;
}));
const focusTest = await page.evaluate(async () => {
  const chart = window.echarts.getInstanceByDom(document.getElementById('relCanvas'));
  const before = chart.getOption().series.find(s => s.id === 'relLine').data.map(d => d.lineStyle.opacity);
  const node = window.V03Filter.objects(window.V03Store.state).find(o => o.geo !== false && window.V03Data.relationsOf(o.id).length > 3);
  window.V03_DEBUG.set({ rel: { sel: node.id, kind: 'object', stack: [{ kind: 'object', id: node.id }] } });
  await new Promise(r => setTimeout(r, 900));
  const after = chart.getOption().series.find(s => s.id === 'relLine').data.map(d => d.lineStyle.opacity);
  window.V03_DEBUG.set({ rel: { sel: null, kind: null, stack: [] } });
  await new Promise(r => setTimeout(r, 700));
  return { defMin: Math.min(...before), focusMax: Math.max(...after), focusMin: Math.min(...after), node: node.name };
});
check('A4 默认降低非焦点透明度；选中本体时直接相关线强化、其余进一步降低',
  focusTest.defMin <= .5 && focusTest.focusMax >= .8 && focusTest.focusMin <= .2, JSON.stringify(focusTest));
check('A4/A5 右侧不出现独立关系清单，只有不可定位本体瀑布流',
  await page.evaluate(() => document.querySelectorAll('#relBody .rel-row, #relBody .rel-list').length === 0) && rel.drawerCards > 0,
  '本体卡片 ' + rel.drawerCards);
await page.locator('#relBody .rel-card').first().click(); await sleep(800);
const entityDrawer = await page.evaluate(() => {
  const d = document.querySelector('#drawerStack .drawer');
  return { n: document.querySelectorAll('#drawerStack .drawer').length, text: d ? d.innerText : '', rows: document.querySelectorAll('#drawerStack .rel-row').length };
});
check('A5 本体卡片点击后右侧嵌套本体详情抽屉（含关系条目，可继续展开）',
  entityDrawer.n === 1 && entityDrawer.rows > 0 && /基本属性/.test(entityDrawer.text) && /当前关系/.test(entityDrawer.text));
await page.locator('#drawerStack .rel-row').first().click(); await sleep(800);
const nested = await page.evaluate(() => ({
  n: document.querySelectorAll('#drawerStack .drawer').length,
  heads: [...document.querySelectorAll('#drawerStack .drawer-head b')].map(x => x.textContent),
  text: [...document.querySelectorAll('#drawerStack .drawer')].map(d => d.innerText).join('\n')
}));
check('A5/A6 关系详情在右侧再嵌套一层，且关闭逐层返回',
  nested.n === 2 && nested.heads.join('|') === '本体详情|关联详情' &&
  /关系语义/.test(nested.text) && /支持事实/.test(nested.text) && /最近导致关系变化的事实/.test(nested.text),
  nested.heads.join('|'));
await page.keyboard.press('Escape'); await sleep(400);
const back1 = await page.evaluate(() => document.querySelectorAll('#drawerStack .drawer').length);
await page.keyboard.press('Escape'); await sleep(400);
const back0 = await page.evaluate(() => document.querySelectorAll('#drawerStack .drawer').length);
check('A5 关闭时逐层返回（2 → 1 → 0）', back1 === 1 && back0 === 0, JSON.stringify({ back1, back0 }));
check('A7 关联层底部流水与事实层一致（本体抽离处理，产品语言）', await page.evaluate(() => {
  const t = document.getElementById('streamBody').innerText;
  const banned = /样例|示意|Demo 数据|数据包|L1|L2|L3|生成器|generator|调试|debug|agrilink-demo-v1|geo\s*=\s*null|真实数据|演示环境/;
  return document.querySelectorAll('#streamBody .st-line').length > 0 && !banned.test(t) && !/gen-|r:\*|MERGE/.test(t);
}));
const relText = await bodyText(page);
check('A5/A6 关联层界面同样无演示 / 技术文案（含抽屉内）', !BANNED.test(relText) && !/关系清单/.test(relText));

/* ---------------- 默认口径与数据指纹 ---------------- */
await page.click('#tabs button[data-tab="fact"]'); await sleep(1200);
const st0 = await page.evaluate(() => window.V03_DEBUG.state());
check('默认口径仍为：近 7 天 + 高可信 + 高影响（未被视觉校准改动）',
  st0.time === '7d' && st0.cred === 'high' && st0.infl === 'high', JSON.stringify({ time: st0.time, cred: st0.cred, infl: st0.infl }));
const c = await counts(page);
check('数据接入成果未回退，且已并入第三方公开数据（天气事实 / 900 个大型机场）',
  c.facts >= 861 && c.objects >= 377 && c.relations === 585 && c.regions === 64 && c.ports === 56 && c.airports >= 500 && c.nodes === 4,
  JSON.stringify({ facts: c.facts, objects: c.objects, relations: c.relations, airports: c.airports }));
const dens = await page.evaluate(() => ({ def: window.V03Fact.debug().mappable }));
await page.evaluate(() => window.V03_DEBUG.set({ time: 'all', cred: 'all', infl: 'all' })); await sleep(1200);
const allDens = (await factDbg(page)).mappable;
check('默认口径全球星点足够（≥50）且切「全部」恢复 342 点完整密度',
  dens.def >= 50 && allDens >= 335, JSON.stringify({ 默认: dens.def, 全部: allDens }));
await page.evaluate(() => window.V03_DEBUG.set({ time: '7d', cred: 'high', infl: 'high' })); await sleep(800);

/* ---------------- 密度点地图锚定回归（用户反馈：拖动后点与地图分离） ---------------- */
const landSamples = await page.evaluate(() => {
  const M = window.V03Mass;
  const levels = [['L1', '湖南'], ['L2', '湖南'], ['L3', '湖南']];
  return levels.map(([level, focus]) => {
    const pts = M.sample(level, focus, ['probe']);
    return { level, count: pts.length, outside: pts.filter(p => !M.insideMap(level, p.lng, p.lat)).length };
  });
});
check('密度效果点全部落在世界/中国地图面内（不漂到海上或国界外）',
  landSamples.every(x => x.count === ({ L1: 20000, L2: 16000, L3: 12000 })[x.level] && x.outside === 0), JSON.stringify(landSamples));
const anchor = await page.evaluate(() => {
  const chart = echarts.getInstanceByDom(document.getElementById('factMap'));
  const opt = chart.getOption(), mass = opt.series.find(s => s.id === 'mass');
  const ll = mass.data[0].value;
  return { ll, px: chart.convertToPixel({ geoIndex: 0 }, ll), n: mass.data.length, geo: mass.coordinateSystem, large: mass.large,
    detachedCanvas: !!document.querySelector('#factMapBox > .ripple-canvas') };
});
const mapBox = await page.locator('#factMap').boundingBox();
const drag = [Math.round(mapBox.width * .18), Math.round(mapBox.height * .08)];
await page.mouse.move(mapBox.x + mapBox.width * .5, mapBox.y + mapBox.height * .5);
await page.mouse.down();
await page.mouse.move(mapBox.x + mapBox.width * .68, mapBox.y + mapBox.height * .58, { steps: 20 });
await page.mouse.up(); await sleep(300);
const anchoredAfter = await page.evaluate(ll => {
  const chart = echarts.getInstanceByDom(document.getElementById('factMap'));
  return chart.convertToPixel({ geoIndex: 0 }, ll);
}, anchor.ll);
const projectedDelta = [anchoredAfter[0] - anchor.px[0], anchoredAfter[1] - anchor.px[1]];
check('拖动地图后密度点与底图使用同一 geo 投影同步移动（关闭独立 large 绘制路径）',
  anchor.geo === 'geo' && anchor.large === false && anchor.n === 20000 && !anchor.detachedCanvas && Math.abs(projectedDelta[0] - drag[0]) <= 2 && Math.abs(projectedDelta[1] - drag[1]) <= 2,
  JSON.stringify({ count: anchor.n, projectedDelta, drag }));

/* ---------------- 会话健康 ---------------- */
check('控制台无错误、无未捕获异常', consoleErrors.length === 0 && pageErrors.length === 0,
  JSON.stringify({ consoleErrors: consoleErrors.slice(0, 3), pageErrors: pageErrors.slice(0, 3) }));
check('1440×900 无横向溢出', (await overflow(page)) === 0);
await page.close();

/* ---------------- 390px（基础可用性，本阶段不交付窄屏截图） ---------------- */
const m = await open(browser, 390, 844, '390');
check('390px 无横向溢出', (await overflow(m)) === 0);
check('390px 顶部工具条仍 ≤32px 且三 TAB 可点', await m.evaluate(() => Math.round(document.querySelector('.topbar').getBoundingClientRect().height) <= 32));
await m.click('#menuBtn'); await sleep(800);
check('390px 大数字不超出菜单宽度，且菜单展开仍无横向溢出', await m.evaluate(() => {
  const b = document.querySelector('#menuBody .mn-ov.hero .ov-i b');
  return !!b && b.getBoundingClientRect().width <= b.closest('.mn-ov').getBoundingClientRect().width + 1
    && window.V03_DEBUG.overflow() === 0;
}));
check('390px 控制台无错误', consoleErrors.filter(x => x.startsWith('390')).length === 0);
await m.close();
await browser.close();

/* ---------------- 报告 ---------------- */
const pass = results.filter(r => r.ok).length;
const md = ['# AgriLink V1.0 · V2 视觉校准阶段自检报告', '',
  '- 运行：`node test/v03.mjs`（Playwright / file:// 离线 / 1440×900 + 390×844）',
  '- 说明：结构性自检，不代替人眼视觉验收；截图见 `shots/v05-*.png`',
  `- 结果：**${pass}/${results.length} 通过**`,
  `- 控制台错误：${consoleErrors.length} · 未捕获异常：${pageErrors.length}`, '',
  '| 项目 | 结果 | 明细 |', '| --- | --- | --- |',
  ...results.map(r => `| ${r.name} | ${r.ok ? '✅ 通过' : '❌ 失败'} | ${String(r.detail).replace(/\|/g, '/').slice(0, 160)} |`),
  ''].join('\n');
fs.writeFileSync(path.join(root, 'test', 'report-v03.md'), md);
console.log(`\n${pass}/${results.length} 通过 · 报告 test/report-v03.md`);
if (pass !== results.length) process.exitCode = 1;
