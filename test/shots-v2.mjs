#!/usr/bin/env node
/* ============================================================
   V2 视觉校准阶段 · 截图取证（第一阶段五组 + 对照）
   1) 事实层默认页          2) 事实层左侧菜单展开
   3) 事实详情右侧嵌套抽屉   4) 关联层默认页
   5) 关联层本体详情 + 关系详情逐层展开
   另出：原 AgriLink 配色对照、关系线样式对照
   运行：node test/shots-v2.mjs      产物：shots/v05-*.png
   ============================================================ */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'file://' + path.join(root, 'index.html');
const OUT = path.join(root, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name) }); console.log('  ▸', name); };

async function openLocal(browser, w = 1440, h = 900) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20000);
  await page.route('**/*', rt => { const u = rt.request().url(); return (u.startsWith('file://') || u.startsWith('about:')) ? rt.continue() : rt.abort(); });
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__AGRI_READY === true, null, { timeout: 30000 });
  await sleep(1000);
  return page;
}

const browser = await chromium.launch();
console.log('第一阶段五组截图（1440×900）');
const page = await openLocal(browser);

/* ① 事实层默认页 */
await shot(page, 'v05-01-fact-default.png');

/* ② 事实层左侧菜单展开 */
await page.click('#menuBtn'); await sleep(700);
await shot(page, 'v05-02-fact-menu.png');
await page.click('#menuClose'); await sleep(500);

/* ③ 事实详情右侧嵌套抽屉（先点卡片以同时体现「卡片—抽屉」关系） */
await page.locator('#layer-fact .fcard').nth(2).click(); await sleep(900);
await shot(page, 'v05-03-fact-drawer.png');
const drawerCount1 = await page.evaluate(() => document.querySelectorAll('#drawerStack .drawer').length);
await page.keyboard.press('Escape'); await sleep(400);

/* ④ 关联层默认页 */
await page.click('#tabs button[data-tab="relation"]'); await sleep(2600);
await shot(page, 'v05-04-relation-default.png');

/* ⑤ 关联层本体详情 → 关系详情逐层展开 */
await page.locator('#relBody .rel-card').first().click(); await sleep(900);
await shot(page, 'v05-05a-relation-entity-drawer.png');
const entityDrawer = await page.evaluate(() => ({ drawers: document.querySelectorAll('#drawerStack .drawer').length, rows: document.querySelectorAll('#drawerStack .rel-row').length }));
await page.locator('#drawerStack .rel-row').first().click(); await sleep(900);
await shot(page, 'v05-05b-relation-relation-drawer.png');
const nestedDrawer = await page.evaluate(() => ({ drawers: document.querySelectorAll('#drawerStack .drawer').length, title: [...document.querySelectorAll('#drawerStack .drawer-head b')].map(n => n.textContent) }));
await page.keyboard.press('Escape'); await sleep(400);
const afterBack = await page.evaluate(() => document.querySelectorAll('#drawerStack .drawer').length);
await page.keyboard.press('Escape'); await sleep(400);
const afterBack2 = await page.evaluate(() => document.querySelectorAll('#drawerStack .drawer').length);
console.log('  抽屉层级：', JSON.stringify({ 事实详情: drawerCount1, 本体详情: entityDrawer, 关系详情: nestedDrawer, 逐层返回: [afterBack, afterBack2] }));
await page.close();

/* ⑥ 对照：原 AgriLink（线上原版）与新版同视口并排 */
console.log('对照截图');
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const orig = await ctx.newPage();
orig.setDefaultTimeout(40000);
try {
  await orig.goto('https://upstardata.github.io/agri-llm-demo/', { waitUntil: 'load', timeout: 60000 });
  await sleep(1500);
  await orig.screenshot({ path: path.join(OUT, '_orig-live.png') });
  console.log('  ▸ _orig-live.png（原版线上）');
} catch (e) { console.log('  ! 原版线上截图失败：', String(e).slice(0, 120)); }
await ctx.close();

const cmp = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const cp = await cmp.newPage();
await sleep(200);
const newShot = path.join(OUT, 'v05-01-fact-default.png').replace(/\\/g, '/');
const origShot = path.join(OUT, '_orig-live.png').replace(/\\/g, '/');
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
  body{margin:0;background:#f4f6fa;font-family:'IBM Plex Sans SC','PingFang SC',sans-serif;color:#10151f}
  .head{padding:10px 14px 0;font-size:13px;font-weight:700}
  .head small{font-weight:400;color:#64707f;margin-left:8px}
  .row{display:flex;gap:10px;padding:10px 14px 14px}
  .col{flex:1;min-width:0;background:#fff;border:1px solid rgba(15,23,42,.10);border-radius:10px;overflow:hidden}
  .cap{font-size:11px;padding:6px 10px;color:#4d586a;border-bottom:1px solid rgba(15,23,42,.08);font-weight:600}
  .cap span{font-weight:400;color:#64707f}
  img{display:block;width:100%;height:auto}
</style></head><body>
  <div class="head">AgriLink 配色与视觉基线对照<small>左：原版 AgriLink（线上 upstardata.github.io/agri-llm-demo）· 右：本次视觉校准版事实层（同一 1440×900 视口）</small></div>
  <div class="row">
    <div class="col"><div class="cap">原版 AgriLink <span>· 浅色农业风：底 #f4f6fa / 白面板 / 蓝主色</span></div><img src="file://${origShot}"></div>
    <div class="col"><div class="cap">视觉校准版事实层 <span>· 同基线配色，地图为主体</span></div><img src="file://${newShot}"></div>
  </div></body></html>`;
const tmp = path.join(root, '.cmp-v2.html');
fs.writeFileSync(tmp, html);
await cp.goto('file://' + tmp, { waitUntil: 'load' });
await sleep(800);
await shot(cp, 'v05-10-compare-original.png');
await cmp.close();

await browser.close();
fs.rmSync(tmp, { force: true });
console.log('截图完成 → shots/v05-*.png');
