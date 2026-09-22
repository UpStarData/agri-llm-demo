#!/usr/bin/env node
/* ============================================================
   v06 第三轮截图取证（事实层优先，1440×900）
   1) 事实层默认页（密集星点 + 右下快捷键 + 底部居中图例 + 纯黑终端长日志）
   2) 左侧菜单（数据概览两项 + F3 字典 + 快捷控制）
   3) 全球 / 中国 / 湖南 三档密度对比
   4) 事实详情右侧嵌套抽屉
   5) 产区/口岸标记点击 → 事实层内直接展开本体详情（不切 Tab）
   6) 流水长日志 + 星闪取证
   运行：node test/shots-v06.mjs     产物：shots/v06-*.png
   ============================================================ */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name) }); console.log('  ▸', name); };

const srv = http.createServer((req, res) => {
  const rel = req.url === '/' || req.url.startsWith('/?') ? '/index.html' : req.url.split('?')[0];
  const f = path.join(root, rel);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': rel.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => srv.listen(4193, '127.0.0.1', r));

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(25000);
await page.goto('http://127.0.0.1:4193/', { waitUntil: 'load' });
await page.waitForFunction(() => window.__AGRI_READY === true, null, { timeout: 40000 });
await sleep(2600);

/* ① 默认页 */
await shot(page, 'v06-01-fact-default.png');

/* ② 菜单 */
await page.click('#menuBtn'); await sleep(800);
await shot(page, 'v06-02-fact-menu.png');
await page.click('#menuClose'); await sleep(500);

/* ③ 三档密度 */
await page.evaluate(() => window.V03_DEBUG.set({ geo: { level: 'L2', focus: null } })); await sleep(1500);
await shot(page, 'v06-03a-density-china.png');
await page.evaluate(() => window.V03_DEBUG.set({ geo: { level: 'L3', focus: '湖南' } })); await sleep(1500);
await shot(page, 'v06-03b-density-hunan.png');
await page.evaluate(() => window.V03_DEBUG.set({ geo: { level: 'L1', focus: null } })); await sleep(1500);

/* ④ 事实详情抽屉 */
await page.locator('#layer-fact .fcard').nth(2).click(); await sleep(1000);
await shot(page, 'v06-04-fact-drawer.png');
await page.keyboard.press('Escape'); await sleep(500);

/* ⑤ 产区/口岸标记 → 事实层内本体详情 */
await page.locator('#mapSk .sk[data-k="regions"]').click(); await sleep(600);
await page.locator('#mapSk .sk[data-k="gates"]').click(); await sleep(900);
await shot(page, 'v06-05a-marks.png');
const picked = await page.evaluate(() => {
  const rg = window.V03Data.REGIONS[3];
  window.V03Fact.pick.region(rg.id);
  return { name: rg.name, tab: window.V03_DEBUG.state().tab, factObj: window.V03_DEBUG.state().factObj };
});
await sleep(900);
await shot(page, 'v06-05b-entity-drawer-in-fact.png');
console.log('  标记点击：', JSON.stringify(picked));
await page.keyboard.press('Escape'); await sleep(400);
await page.locator('#mapSk .sk[data-k="regions"]').click();
await page.locator('#mapSk .sk[data-k="gates"]').click(); await sleep(600);

/* ⑥ 流水 + 星闪 */
const star = await page.evaluate(async () => {
  const t0 = performance.now();
  while (performance.now() - t0 < 12000) {
    if (document.querySelectorAll('#layer-fact .star-flash').length) return true;
    await new Promise(r => setTimeout(r, 120));
  }
  return false;
});
await shot(page, 'v06-06-stream-starflash.png');
console.log('  星闪出现：', star);

const info = await page.evaluate(() => {
  const c = window.V03_DEBUG.counts(), d = window.V03Fact.debug();
  return { facts: c.facts, objects: c.objects, airports: c.airports, atLevel: c.mappableAtLevel,
    legend: c.legendItems, mapSk: c.mapSk, topbar: window.V03_DEBUG.topbarHeight(),
    streamMaxLen: [...document.querySelectorAll('#streamBody .st-line')].map(n => n.innerText.length).sort((a, b) => b - a)[0],
    hls: window.V03Data.FACTS.filter(f => f.card && f.card.hlsUrl).length,
    channels: (window.V03Pkg.CHANNELS || []).length };
});
console.log('  概况：', JSON.stringify(info));
await page.close();
await browser.close();
srv.close();
console.log('截图完成 → shots/v06-*.png');
