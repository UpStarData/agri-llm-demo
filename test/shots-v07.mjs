#!/usr/bin/env node
/* ============================================================
   v07 截图取证：数据概览大数字（hyperresearch.ai 同款实时数字）
   1) 事实层默认页（菜单收起）
   2) 菜单展开（大数字 + 口径小字 + 实时接入 · 1440×900）
   3) 大数字特写（2×，间隔 3s 两张 → 看尾数在走）
   4) 390px 菜单展开
   运行：node test/shots-v07.mjs     产物：shots/v07-*.png
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

const srv = http.createServer((req, res) => {
  const rel = req.url === '/' || req.url.startsWith('/?') ? '/index.html' : req.url.split('?')[0];
  const f = path.join(root, rel);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': rel.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => srv.listen(4197, '127.0.0.1', r));

const browser = await chromium.launch();
async function open(w, h, scale = 1) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  page.setDefaultTimeout(25000);
  await page.goto('http://127.0.0.1:4197/', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__AGRI_READY === true, null, { timeout: 40000 });
  await sleep(2600);
  return page;
}
const num = page => page.evaluate(() => {
  const b = document.querySelector('#menuBody .mn-ov.hero .ov-i b');
  return b ? b.textContent : '—';
});
const clip = page => page.evaluate(() => {
  const box = document.querySelector('#menuBody .mn-sec').getBoundingClientRect();
  return { x: Math.round(box.x) - 6, y: Math.round(box.y) - 6, width: Math.round(box.width) + 12, height: Math.round(box.height) + 12 };
});

/* ① 默认页（菜单收起） */
const page = await open(1440, 900);
await page.screenshot({ path: path.join(OUT, 'v07-01-fact-default.png') });
console.log('  ▸ v07-01-fact-default.png');

/* ② 菜单展开 */
await page.click('#menuBtn'); await sleep(900);
await page.screenshot({ path: path.join(OUT, 'v07-02-menu-number.png') });
console.log('  ▸ v07-02-menu-number.png  数字', await num(page));

/* ③ 大数字特写 ×2（隔 3s，看尾数在走；先把上一个页面关掉，后台页 rAF 会被浏览器暂停） */
await page.close();
const p2 = await open(1440, 900, 2);
await p2.click('#menuBtn'); await sleep(900);
const box = await clip(p2);
await p2.screenshot({ path: path.join(OUT, 'v07-03-number-zoom-a.png'), clip: box });
const n1 = await num(p2);
await sleep(3000);
await p2.screenshot({ path: path.join(OUT, 'v07-03-number-zoom-b.png'), clip: box });
const n2 = await num(p2);
console.log('  ▸ v07-03-number-zoom-a/b.png  ', n1, '→', n2);
await p2.close();

/* ④ 390px */
const m = await open(390, 844);
await m.click('#menuBtn'); await sleep(900);
await m.screenshot({ path: path.join(OUT, 'v07-04-menu-number-390.png') });
console.log('  ▸ v07-04-menu-number-390.png  数字', await num(m));

await browser.close();
srv.close();
