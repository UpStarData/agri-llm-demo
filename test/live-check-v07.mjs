#!/usr/bin/env node
/* 实测：局域网 v0.7 产物（HTTP 部署路径，非本地 file://）大数字生效 */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
/* 用法：node test/live-check-v07.mjs [url]（默认局域网 v0.7） */
const url = process.argv[2] || 'http://192.168.1.83:3101/v0.7/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('console', m => { if (m.type() === 'error') /183\.196\.25\.171|CORS|ERR_/.test(m.text()) || errs.push(m.text()); });
page.on('pageerror', e => /CORS/.test(String(e)) || errs.push(String(e)));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__AGRI_READY === true, null, { timeout: 40000 });
await sleep(2600);
const meta = await page.evaluate(() => window.__V03_BUILD);
await page.click('#menuBtn'); await sleep(900);
const read = () => page.evaluate(() => {
  const b = document.querySelector('#menuBody .mn-ov.hero .ov-i b');
  const cs = getComputedStyle(b);
  return { v: b.textContent, size: cs.fontSize, tnum: cs.fontVariantNumeric };
});
const a = await read(); await sleep(3000); const b = await read();
await page.screenshot({ path: path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../live-v07-' + (process.argv[2] ? 'public' : 'lan') + '.png')) });
console.log(JSON.stringify({ build: meta, t0: a, t3: b, 递增: Number(b.v.replace(/,/g, '')) - Number(a.v.replace(/,/g, '')) >= 2, errs }, null, 1));
await browser.close();
