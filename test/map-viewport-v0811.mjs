#!/usr/bin/env node
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch();
try {
  for (const width of [390, 1440, 3840]) {
    const page = await browser.newPage({ viewport: { width, height: width === 3840 ? 2160 : 900 } });
    await page.goto('file://' + path.join(root, 'index.html'));
    await page.waitForFunction(() => window.__AGRI_READY === true);
    for (const tab of ['fact', 'relation']) {
      if (tab === 'relation') {
        await page.evaluate(() => V03Store.set({ tab: 'relation', rel: { view: 'geo' } }));
        await page.waitForFunction(() => echarts.getInstanceByDom(document.getElementById('relCanvas')));
      }
      const result = await page.evaluate(tab => {
        const el = document.getElementById(tab === 'fact' ? 'factMap' : 'relCanvas');
        const chart = echarts.getInstanceByDom(el);
        return { width: el.clientWidth, height: el.clientHeight,
          china: chart.convertToPixel({ geoIndex: 0 }, [105, 35]),
          overflow: document.documentElement.scrollWidth > innerWidth };
      }, tab);
      if (result.overflow || Math.abs(result.china[0] - result.width / 2) > 2 ||
          Math.abs(result.china[1] - result.height / 2) > 2) {
        throw new Error(`${width}px ${tab} map is not centered: ${JSON.stringify(result)}`);
      }
      if (width === 1440 && tab === 'fact') {
        await page.evaluate(() => V03Store.set({ panels: { cards: false } }));
        await page.waitForFunction(() => document.getElementById('factMap').clientWidth === innerWidth);
        const hidden = await page.evaluate(() => {
          const el = document.getElementById('factMap');
          return echarts.getInstanceByDom(el).convertToPixel({ geoIndex: 0 }, [105, 35])[0];
        });
        if (Math.abs(hidden - width / 2) > 2) throw new Error('China moved off-center when cards closed');
        await page.evaluate(() => V03Store.set({ panels: { cards: true } }));
      }
    }
    await page.close();
  }
  console.log('China is centered in fact and relation maps at 390, 1440 and 3840 px; cards toggle keeps center.');
} finally { await browser.close(); }
