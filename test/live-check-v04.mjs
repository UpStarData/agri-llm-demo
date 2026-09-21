#!/usr/bin/env node
/* ============================================================
   公网发布版本核验（LLM-291 / 发布地址）
   对**已发布的公网地址**做与离线验收同口径的核对：
     构建指纹 / 数据包指纹 / 默认 7 天+高可信+高影响 / 默认星点多区域 /
     「全部」342 点完整密度 / 事实层与关联层 / 390px 无横向溢出 / 控制台无错误
   运行：node test/live-check-v04.mjs [url]      报告：test/report-live-v04.md
   ============================================================ */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL = process.argv[2] || 'https://upstardata.github.io/agri-llm-demo-v04/';
const EXPECT = { hash: '013d9c717e3d', git: '57e6582', facts: 861, objects: 377, relations: 585, regions: 64, ports: 56, airports: 49, nodes: 4, streamEvents: 1135 };

const results = [];
const consoleErrors = [], pageErrors = [], external = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined && detail !== '' ? '  — ' + detail : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(45000);
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => pageErrors.push(String(e)));
page.on('request', r => { if (!r.url().startsWith(URL)) external.push(r.url()); });

const t0 = Date.now();
await page.goto(URL, { waitUntil: 'load', timeout: 90000 });
await page.waitForFunction(() => window.__AGRI_READY === true, null, { timeout: 60000 });
await sleep(1500);
const loadMs = Date.now() - t0;

const build = await page.evaluate(() => window.__V03_BUILD);
check('构建指纹与验收提交一致（hash / git / partial）',
  build && build.hash === EXPECT.hash && build.git === EXPECT.git && build.partial === false,
  JSON.stringify(build));

const counts = await page.evaluate(() => window.V03_DEBUG.counts());
check('数据包指纹：861 事实 / 377 本体 / 585 关系',
  counts.facts === EXPECT.facts && counts.objects === EXPECT.objects && counts.relations === EXPECT.relations,
  JSON.stringify({ facts: counts.facts, objects: counts.objects, relations: counts.relations }));
check('地理数据：64 产区 / 56 港口 / 49 机场 / 4 节点 / 1135 时序事件',
  counts.regions === EXPECT.regions && counts.ports === EXPECT.ports && counts.airports === EXPECT.airports &&
  counts.nodes === EXPECT.nodes && counts.streamEvents === EXPECT.streamEvents,
  JSON.stringify({ regions: counts.regions, ports: counts.ports, airports: counts.airports, nodes: counts.nodes, streamEvents: counts.streamEvents }));

const boot = await page.evaluate(() => window.V03_DEBUG.state());
check('默认口径：近 7 天 + 高可信 + 高影响', boot.time === '7d' && boot.cred === 'high' && boot.infl === 'high',
  JSON.stringify({ time: boot.time, cred: boot.cred, infl: boot.infl }));
const defView = await page.evaluate(() => {
  const d = window.V03Fact.debug();
  const list = window.V03Filter.factsAtLevel();
  const groups = new Set(list.map(f => { const c = (f.regionPath || []).find(p => p.level === 'country'); return (c && c.code) || f.provinceCode || f.region; }));
  return { facts: d.facts, points: d.mappable, regions: groups.size,
    west: list.some(f => f.lng < -30), east: list.some(f => f.lng > 120), south: list.some(f => f.lat < 0), north: list.some(f => f.lat > 40),
    cards: d.cards, cardTypes: d.cardTypes };
});
check('默认口径全球星点多区域覆盖（点数 / 地理分组 / 四象限）',
  defView.points >= 50 && defView.points === defView.facts && defView.regions >= 15 && defView.west && defView.east && defView.south && defView.north,
  JSON.stringify(defView));
check('事实层卡片按六类 cardType 渲染（默认视野内非空）',
  Object.keys(defView.cardTypes).length >= 2 && defView.cards === defView.facts, JSON.stringify(defView.cardTypes));

await page.evaluate(() => window.V03_DEBUG.set({ time: 'all', cred: 'all', infl: 'all' })); await sleep(1500);
const allView = await page.evaluate(() => ({ facts: window.V03Fact.debug().facts, points: window.V03Fact.debug().mappable }));
check('切「全部」恢复 342 点完整密度', allView.facts === 342 && allView.points >= 335, JSON.stringify(allView));

await page.evaluate(() => window.V03_DEBUG.set({ tab: 'relation' })); await sleep(3000);
const rel = await page.evaluate(() => window.V03Relation.debug());
check('关联层：377 本体节点 / 585 关系 / 流动线 / 非地理本体面板',
  rel.nodes === 377 && rel.edges === 585 && rel.mapped > 200 && rel.lines > 0 && rel.rows === 585 && rel.unmapped > 0,
  JSON.stringify({ nodes: rel.nodes, mapped: rel.mapped, edges: rel.edges, lines: rel.lines, unmapped: rel.unmapped, rows: rel.rows }));
const nogeoCards = await page.evaluate(() => ({ cards: document.querySelectorAll('#relBody .rel-card').length, person: [...document.querySelectorAll('#relBody .rel-card')].some(n => /人物角色/.test(n.innerText)) }));
check('非地理本体面板含 Person 类型', nogeoCards.cards >= 12 && nogeoCards.person, JSON.stringify(nogeoCards));
await page.evaluate(() => window.V03_DEBUG.set({ tab: 'fact', time: '7d', cred: 'high', infl: 'high' })); await sleep(1200);

const snapshot = await page.evaluate(() => ({
  tabs: document.querySelectorAll('#tabs button').length,
  streamLines: document.querySelectorAll('#streamBody .st-line').length,
  mapSk: document.querySelectorAll('#mapSk .sk').length,
  cards: document.querySelectorAll('#layer-fact .fcard').length
}));
check('页面骨架完整（三 TAB / 11 快捷键 / 流水 / 卡片）',
  snapshot.tabs === 3 && snapshot.mapSk === 11 && snapshot.streamLines > 0 && snapshot.cards > 0, JSON.stringify(snapshot));

check('控制台无错误、无未捕获异常', consoleErrors.length === 0 && pageErrors.length === 0,
  JSON.stringify({ consoleErrors: consoleErrors.slice(0, 3), pageErrors: pageErrors.slice(0, 3) }));
check('无横向溢出（1440×900）', (await page.evaluate(() => window.V03_DEBUG.overflow())) === 0);
await page.screenshot({ path: path.join(root, 'shots', 'v04-30-live-desktop.png') });

/* ---------- 390×844 ---------- */
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
const m = await ctx2.newPage();
m.setDefaultTimeout(45000);
m.on('console', x => { if (x.type() === 'error') consoleErrors.push('390: ' + x.text()); });
m.on('pageerror', e => pageErrors.push('390: ' + String(e)));
await m.goto(URL, { waitUntil: 'load', timeout: 90000 });
await m.waitForFunction(() => window.__AGRI_READY === true, null, { timeout: 60000 });
await sleep(1500);
check('390px 无横向溢出', (await m.evaluate(() => window.V03_DEBUG.overflow())) === 0);
await m.click('#menuBtn'); await sleep(700);
check('390px 图层菜单滑出且不超出视口',
  (await m.evaluate(() => { const r = document.getElementById('menu').getBoundingClientRect(); return r.left === 0 && r.right <= 390; })) &&
  (await m.evaluate(() => window.V03_DEBUG.overflow())) === 0);
await m.click('#menuClose'); await sleep(500);
await m.click('#tabs button[data-tab="relation"]'); await sleep(3000);
check('390px 关联层可用且无溢出',
  (await m.evaluate(() => window.V03Relation.debug().nodes)) === 377 && (await m.evaluate(() => window.V03_DEBUG.overflow())) === 0);
await m.screenshot({ path: path.join(root, 'shots', 'v04-31-live-390.png') });
check('390px 控制台无错误', consoleErrors.filter(x => x.startsWith('390')).length === 0);

await browser.close();

const pass = results.filter(r => r.ok).length;
const md = ['# 公网发布版本核验记录（AgriLink V1.0）', '',
  `- 发布地址：\`${URL}\``,
  `- 期望构建指纹：\`hash=${EXPECT.hash} git=${EXPECT.git}\``,
  `- 结果：**${pass}/${results.length} 通过** · 加载 ${loadMs} ms`,
  `- 控制台错误：${consoleErrors.length} · 未捕获异常：${pageErrors.length} · 非本站请求：${external.length}`, '',
  '| 项目 | 结果 | 明细 |', '| --- | --- | --- |',
  ...results.map(r => `| ${r.name} | ${r.ok ? '✅ 通过' : '❌ 失败'} | ${String(r.detail).replace(/\|/g, '/').slice(0, 180)} |`),
  ''].join('\n');
fs.writeFileSync(path.join(root, 'test', 'report-live-v04.md'), md);
console.log(`\n${pass}/${results.length} 通过 · 报告 test/report-live-v04.md · 加载 ${loadMs} ms`);
if (pass !== results.length) process.exitCode = 1;
