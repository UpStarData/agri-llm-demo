#!/usr/bin/env node
/* 整理后取证：版本目录页（含 V0.0）+ GitHub 仓库首页 */
import { chromium } from 'playwright';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto('https://upstardata.github.io/agri-llm-demo/versions/', { waitUntil: 'load' });
await sleep(1500);
await page.screenshot({ path: '../ver-versions-page.png' });
console.log('▸ ver-versions-page.png');
await page.goto('https://github.com/UpStarData/agri-llm-demo', { waitUntil: 'domcontentloaded' });
await sleep(3500);
await page.screenshot({ path: '../ver-github-repo.png' });
console.log('▸ ver-github-repo.png');
await browser.close();
