import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(pathToFileURL(path.resolve('index.html')).href);
  await page.waitForSelector('.fcard');

  const first = await page.evaluate(() => {
    const s = V03Store.state, f = V03Filter.facts(s)[0];
    return { count: document.querySelectorAll('.fcard').length, id: f.id, data: document.querySelector('.fcard').innerText,
      sort: V03Filter.facts(s).every((x, i, all) => i === 0 || String(all[i - 1].ingestedAt || all[i - 1].date) >= String(x.ingestedAt || x.date)),
      mapCount: V03Filter.factsAtLevel(s).length, cardCount: V03Filter.facts(s).length };
  });
  assert.equal(first.count, 20);
  assert(first.data.includes('模拟数据') || first.data.includes('真实来源'));
  assert(first.sort, 'facts should sort by write time');

  await page.locator('.fcard').first().click();
  const drawer = await page.locator('.drawer-stack').evaluate(el => ({ right: getComputedStyle(el).right, text: el.innerText }));
  assert.equal(drawer.right, '420px');
  assert(drawer.text.includes('事实 ID：' + first.id));
  assert(drawer.text.includes('数据状态'));
  assert(drawer.text.includes('地理影响半径'));
  assert.equal(await page.locator('.fcard').count(), 20, 'cards remain visible beside detail');

  await page.locator('#toSim').click();
  assert.equal(await page.evaluate(() => V03Store.state.tab), 'sim');
  assert((await page.evaluate(() => V03Store.state.carry)).includes(first.id));
  await page.locator('#tabs button[data-tab="fact"]').click();
  assert.equal(await page.evaluate(() => V03Store.state.factId), first.id, 'return restores selected fact');
  await page.locator('.drawer-back').click();

  const before = await page.evaluate(() => V03Filter.facts().length);
  await page.evaluate(() => V03Store.set({ geo: { level: 'L2', focus: null } }));
  const after = await page.evaluate(() => V03Filter.facts().length);
  assert.equal(after, before, 'map view does not filter cards');

  await page.locator('#menuBtn').click();
  await page.locator('.mn-varieties button').first().click();
  assert.equal(await page.evaluate(() => V03Store.state.varieties[0]), '榴莲');
  assert((await page.evaluate(() => V03Filter.facts().length)) < before);
  await page.locator('.mn-overlay input').nth(3).check();
  assert.equal(await page.evaluate(() => V03Store.state.sk.markets), true);

  await page.evaluate(() => V03Store.set({ q: '榴莲' }));
  assert((await page.locator('#factSearchStatus').innerText()).includes('搜索结果'));
  assert(await page.evaluate(() => V03Filter.facts().every(f => f.title.includes('榴莲'))));
  await page.locator('#factSearchStatus').click();
  assert.equal(await page.evaluate(() => V03Store.state.q), '');

  assert.equal(await page.evaluate(() => V03Data.FACTS.length), 934, 'the data package is preserved');
  assert.equal(await page.locator('#legend, .fc-explore, #browseHunan, #browseHunanPublic, #browseAll').count(), 0);
  assert.equal((await page.locator('body').innerText()).includes('图例'), false);
  assert.equal((await page.locator('body').innerText()).includes('历史资料仍在'), false);
  assert.equal((await page.locator('body').innerText()).includes('全部历史'), false);
  const hunan = await page.evaluate(() => {
    V03Store.set({ time: '30d', region: '湖南', varieties: [], catKeys: null, q: '' });
    return {
      count: V03Filter.facts().length,
      knownSource: V03Filter.facts().some(f => f.id === 'real-hn-hongxing-price-20260911')
    };
  });
  assert(hunan.count > 0 && hunan.knownSource, 'Hunan data remains reachable within the documented 30-day filter');
  await page.locator('#tabs button[data-tab="relation"]').click();
  assert.equal(await page.locator('#legend').count(), 0);
  assert.equal((await page.locator('body').innerText()).includes('图例'), false);
  await page.locator('#tabs button[data-tab="sim"]').click();
  assert.equal((await page.locator('body').innerText()).includes('类型图例'), false);

  assert.deepEqual(errors, []);
  console.log('PASS V1.2 fact workflow: list, detail, simulation, map independence, filters, overlays, search, no extra history controls or legend');
} finally {
  await browser.close();
}
