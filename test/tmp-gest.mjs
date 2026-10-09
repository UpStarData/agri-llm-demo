import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = '/Users/guohui/Documents/Multica_Project/LLM-Up/agri-intel/agri-llm-demo-visual-v0810';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
await page.waitForFunction(() => window.__AGRI_READY === true);
await page.evaluate(() => V03Store.set({ tab: 'relation', rel: { view: 'geo', level: 'L1', focus: null } }));
await page.waitForTimeout(3600);
console.log('before', await page.evaluate(() => V03Relation.debug().zoom));
console.log(JSON.stringify(await page.evaluate(() => {
  const el = document.getElementById('relCanvas');
  const seen = [];
  ['gesturestart','gesturechange','gestureend'].forEach(t => el.addEventListener(t, e => seen.push(t + ':' + (e.scale || 'x'))));
  const fire = (type, scale) => {
    let ev;
    try { ev = new GestureEvent(type, { scale, rotation: 0, bubbles: true, cancelable: true }); }
    catch (err) { ev = new Event(type, { bubbles: true, cancelable: true }); ev.scale = scale; ev.rotation = 0; }
    return el.dispatchEvent(ev);
  };
  const r1 = fire('gesturestart', 1);
  const r2 = fire('gesturechange', 1.45);
  return { seen, r1, r2, ctor: typeof GestureEvent };
})));
await page.waitForTimeout(500);
console.log('after', await page.evaluate(() => V03Relation.debug().zoom));
await browser.close();
