#!/usr/bin/env node
/* 整理后取证：版本目录页 + GitHub 仓库首页（同一仓库内 /v0.4 … /v0.7） */
import { chromium } from 'playwright';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto('https://upstardata.github.io/agri-llm-demo/versions/', { waitUntil: 'load' });
await sleep(1200);
await page.screenshot({ path: '../ver-versions-page.png' });
console.log('▸ ver-versions-page.png');
await page.goto('https://github.com/UpStarData/agri-llm-demo', { waitUntil: 'domcontentloaded' });
await sleep(3500);
await page.screenshot({ path: '../ver-github-repo.png' });
console.log('▸ ver-github-repo.png');
const txt = await page.evaluate(() => document.body.innerText.slice(0, 400));
console.log(txt.replace(/\n+/g, ' | ').slice(0, 300));
await browser.close();
