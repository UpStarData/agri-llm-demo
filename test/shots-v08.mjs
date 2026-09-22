#!/usr/bin/env node
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'shots');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();

async function open(width, height) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto('file://' + path.join(root, 'index.html'));
  await page.waitForFunction(() => window.__AGRI_READY === true);
  await page.waitForTimeout(900);
  return page;
}
async function shot(page, name) {
  await page.screenshot({ path: path.join(out, name) });
  console.log('▸ ' + name);
}

const page = await open(1440, 900);
await shot(page, 'v08-01-night.png');
await page.click('#menuBtn'); await page.waitForTimeout(500);
await shot(page, 'v08-02-night-overview.png');
await page.click('#menuClose');
await page.click('#btnTheme'); await page.waitForTimeout(500);
await shot(page, 'v08-03-day.png');
await page.click('#btnTheme');
await page.click('#mapSk [data-k="mode3d"]'); await page.waitForTimeout(1800);
await shot(page, 'v08-04-night-globe.png');
await page.close();

const mobile = await open(390, 844);
await mobile.click('#menuBtn'); await mobile.waitForTimeout(450);
await shot(mobile, 'v08-05-mobile-night.png');
await mobile.close();
await browser.close();
