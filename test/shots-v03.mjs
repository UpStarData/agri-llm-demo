#!/usr/bin/env node
/* ============================================================
   V0.3 三层 Demo — 截图取证（自主视觉验收用）
   桌面 1440×900：总览 / 事实下钻 / 事实详情 / 关联图谱 / 地理关联 / 关系详情 /
                 推演过程 / 报告引用 / 旁路失败 / 离线回放 / 全球视角
   窄屏 390×844：事实层 / 关联层 / 推演层
   运行：node test/shots-v03.mjs     输出：shots/
   ============================================================ */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'file://' + path.join(root, 'index.html');
const SHOTS = path.join(root, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  await page.route('**/*', rt => rt.request().url().startsWith('file://') ? rt.continue() : rt.abort());
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__AGRI_READY === true, null, { timeout: 15000 });
  await sleep(700);
  return { ctx, page };
}
const shot = (page, n) => page.screenshot({ path: path.join(SHOTS, n) });
const set = (page, p) => page.evaluate(x => window.V03_DEBUG.set(x), p);

const made = [];
async function main() {
  const browser = await chromium.launch();
  const { ctx, page } = await open(browser, 1440, 900);

  // 1 总览（事实层 · 全国视角）
  await shot(page, 'v03-01-overview-fact-map.png'); made.push('v03-01-overview-fact-map.png');

  // 1b 分类栏展开（三级事实分类）
  await page.click('#railToggle'); await sleep(600);
  await shot(page, 'v03-12-fact-rail-open.png'); made.push('v03-12-fact-rail-open.png');
  await page.click('#railToggle'); await sleep(400);

  // 2 L1 全球视角 + 3 L3 湖南下钻
  await page.click('#layer-fact .fact-level button[data-lv="L1"]'); await sleep(900);
  await shot(page, 'v03-02-fact-l1-global.png'); made.push('v03-02-fact-l1-global.png');
  await page.click('#layer-fact .fact-level button[data-lv="L2"]'); await sleep(700);
  await set(page, { geo: { level: 'L3', focus: '湖南' } }); await sleep(900);
  await shot(page, 'v03-03-fact-l3-hunan.png'); made.push('v03-03-fact-l3-hunan.png');

  // 4 事实详情（影响范围 / 证据 / 相关本体对象）
  await set(page, { geo: { level: 'L2', focus: null } }); await sleep(600);
  await page.click('#layer-fact .fcard'); await sleep(700);
  await shot(page, 'v03-04-fact-detail.png'); made.push('v03-04-fact-detail.png');

  // 5 关联图谱（携带事实进入）
  await page.click('#toRel'); await sleep(1200);
  await shot(page, 'v03-05-relation-graph.png'); made.push('v03-05-relation-graph.png');

  // 6 地理关联（无坐标清单）
  await page.click('.rel-seg button[data-view="geo"]'); await sleep(1200);
  await shot(page, 'v03-06-relation-geo.png'); made.push('v03-06-relation-geo.png');

  // 7 关系详情（强度/置信/时序记忆）
  await page.click('#relNogeo .chip'); await sleep(600);
  await page.click('#relBody .rel-link[data-rel]'); await sleep(600);
  await shot(page, 'v03-07-relation-detail.png'); made.push('v03-07-relation-detail.png');

  // 8 推演过程（阶段 + 轮次）
  await page.click('#tabs button[data-tab="sim"]'); await sleep(900);
  await page.click('#layer-sim .sim-ctl button:has-text("开始推演")'); await sleep(2600);
  await page.click('#layer-sim .sim-ctl button:has-text("暂停")'); await sleep(400);
  for (let i = 0; i < 10; i++) { await page.click('#layer-sim .sim-ctl button:has-text("单步一轮")').catch(() => {}); await sleep(160); }
  await shot(page, 'v03-08-sim-process.png'); made.push('v03-08-sim-process.png');

  // 9 报告与引用（推到完成）
  for (let i = 0; i < 6; i++) { await page.click('#layer-sim .sim-ctl button:has-text("单步一轮")').catch(() => {}); await sleep(200); }
  await page.evaluate(() => window.V03_DEBUG.set({ sim: { stage: 6, report: 3, status: 'done' } })); await sleep(700);
  await page.locator('#layer-sim .sim-card:has-text("推演报告")').scrollIntoViewIfNeeded(); await sleep(300);
  await shot(page, 'v03-09-sim-report-cites.png'); made.push('v03-09-sim-report-cites.png');

  // 10 旁路模型失败（降级）
  await page.click('#layer-sim .sim-ctl button:has-text("模拟旁路失败")'); await sleep(600);
  await page.locator('#layer-sim .sim-side').scrollIntoViewIfNeeded(); await sleep(300);
  await shot(page, 'v03-10-sim-sidecar-degraded.png'); made.push('v03-10-sim-sidecar-degraded.png');

  // 11 离线回放
  await page.click('#layer-sim .sim-ctl button:has-text("离线回放")'); await sleep(600);
  await shot(page, 'v03-11-sim-offline-replay.png'); made.push('v03-11-sim-offline-replay.png');
  await ctx.close();

  // 窄屏 390
  const m = await open(browser, 390, 844);
  await shot(m.page, 'v03-20-narrow-fact.png'); made.push('v03-20-narrow-fact.png');
  await m.page.click('#railToggle'); await sleep(600);
  await shot(m.page, 'v03-24-narrow-rail-open.png'); made.push('v03-24-narrow-rail-open.png');
  await m.page.click('#railToggle'); await sleep(400);
  await m.page.click('#layer-fact .fcard').catch(() => {}); await sleep(600);
  await shot(m.page, 'v03-21-narrow-fact-detail.png'); made.push('v03-21-narrow-fact-detail.png');
  await m.page.click('#tabs button[data-tab="relation"]'); await sleep(1200);
  await shot(m.page, 'v03-22-narrow-relation.png'); made.push('v03-22-narrow-relation.png');
  await m.page.click('#tabs button[data-tab="sim"]'); await sleep(900);
  await shot(m.page, 'v03-23-narrow-sim.png'); made.push('v03-23-narrow-sim.png');
  await m.ctx.close();

  await browser.close();
  console.log(made.length + ' 张截图 → shots/');
  console.log(made.join('\n'));
}
await main();
