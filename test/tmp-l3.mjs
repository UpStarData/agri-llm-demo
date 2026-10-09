import { chromium } from 'playwright';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = '/Users/guohui/Documents/Multica_Project/LLM-Up/agri-intel/agri-llm-demo-visual-v0810';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
await page.waitForFunction(() => window.__AGRI_READY === true);
const st = () => page.evaluate(() => ({ level: V03Store.state.rel.level, focus: V03Store.state.rel.focus, zoom: V03Relation.debug().zoom }));
await page.evaluate(() => V03Store.set({ tab: 'relation', rel: { view: 'geo', level: 'L1', focus: null } }));
await page.waitForTimeout(3600);
// L1 → L2
const box = await page.locator('#relCanvas').boundingBox();
let px = await page.evaluate(() => echarts.getInstanceByDom(document.getElementById('relCanvas')).convertToPixel({ geoIndex: 0 }, [104, 34]));
await page.mouse.click(box.x + px[0], box.y + px[1]); await page.waitForTimeout(1800);
console.log('after click L1', JSON.stringify(await st()));
// 检查 L2 下湖南的像素与反向映射
const info = await page.evaluate(() => {
  const c = echarts.getInstanceByDom(document.getElementById('relCanvas'));
  const px = c.convertToPixel({ geoIndex: 0 }, [112.9, 28.4]);
  const back = c.convertFromPixel({ geoIndex: 0 }, px);
  return { px, back, geo: c.getOption().geo[0] && { map: c.getOption().geo[0].map, center: c.getOption().geo[0].center, zoom: c.getOption().geo[0].zoom } };
});
console.log('hunan pixel', JSON.stringify(info));
// 双击该像素
await page.mouse.dblclick(box.x + info.px[0], box.y + info.px[1]); await page.waitForTimeout(2000);
console.log('after dblclick', JSON.stringify(await st()));
// 再试：直接点空白（湖南西南）
px = await page.evaluate(() => echarts.getInstanceByDom(document.getElementById('relCanvas')).convertToPixel({ geoIndex: 0 }, [110.5, 27.5]));
await page.mouse.click(box.x + px[0], box.y + px[1]); await page.waitForTimeout(1800);
console.log('after click 110.5,27.5', JSON.stringify(await st()));
await browser.close();
