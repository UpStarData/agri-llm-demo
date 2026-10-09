import { chromium } from 'playwright';
import path from 'node:path';
const out = path.join('/Users/guohui/Documents/Multica_Project/LLM-Up/agri-intel/attachments/llm291d');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
for (const [name, url] of [['iipmaps', 'https://iipmaps.com/'], ['atlas', 'https://atlas.co/maps/global-power-plants-map/']]) {
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 45000 });
    await page.waitForTimeout(6000);
    await page.screenshot({ path: path.join(out, name + '.png') });
    console.log(name, 'ok', await page.title());
  } catch (e) {
    console.log(name, 'FAIL', e.message.split('\n')[0]);
  }
}
await browser.close();
