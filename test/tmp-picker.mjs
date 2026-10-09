import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = '/Users/guohui/Documents/Multica_Project/LLM-Up/agri-intel/agri-llm-demo-visual-v0810';
const out = path.join(root, 'shots/llm291d');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
await page.waitForFunction(() => window.__AGRI_READY === true);
await page.evaluate(() => V03Store.set({ tab: 'relation', rel: { view: 'geo', level: 'L1', focus: null } }));
await page.waitForTimeout(3600);
for (const id of ['color', 'atlas', 'light']) {
  await page.evaluate(t => V03Store.set({ theme: t }), id);
  await page.waitForTimeout(700);
  await page.locator('#btnTheme').click();
  await page.waitForTimeout(400);
  const tiles = await page.locator('.pal-tile').count();
  console.log(id, 'tiles', tiles, 'current', await page.evaluate(() => V03Store.state.theme));
  await page.screenshot({ path: path.join(out, `picker-${id}.png`), clip: { x: 1060, y: 0, width: 380, height: 260 } });
  await page.keyboard.press('Escape');
  await page.mouse.click(700, 500);
  await page.waitForTimeout(200);
}
await browser.close();
