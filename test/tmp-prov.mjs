import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = '/Users/guohui/Documents/Multica_Project/LLM-Up/agri-intel/agri-llm-demo-visual-v0810';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
await page.waitForFunction(() => window.__AGRI_READY === true);
console.log(JSON.stringify(await page.evaluate(() => {
  const P = V03Data.PROV_CENTER || {};
  const near = pt => { let best = null, bd = 3.4; Object.keys(P).forEach(k => { const c = P[k], d = Math.hypot(pt[0] - c[0], pt[1] - c[1]); if (d < bd) { bd = d; best = k; } }); return [best, bd]; };
  const out = { keys: Object.keys(P).length, sample: Object.keys(P).slice(0, 5), 湖南: P['湖南'], 湖北: P['湖北'] };
  out.near1129_284 = near([112.9, 28.4]);
  out.near1125_275 = near([110.5, 27.5]);
  out.near104_34 = near([104, 34]);
  return out;
})));
await browser.close();
