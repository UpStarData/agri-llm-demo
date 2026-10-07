#!/usr/bin/env node
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(pathToFileURL(path.resolve('index.html')).href);
  await page.waitForFunction(() => window.__AGRI_READY === true);
  const fact = await page.evaluate(() => ({ tree: V03Filter.FACT_TREE.length, theme: V03Store.state.theme }));
  if (fact.tree !== 7 || fact.theme !== 'color') throw new Error('事实层分类或默认配色错误');

  await page.evaluate(() => V03Store.set({ tab: 'relation', menu: true }));
  await page.waitForFunction(() => document.querySelectorAll('.rel-card').length > 0);
  const relation = await page.evaluate(() => ({
    groups: V03Filter.REL_TREE.length, types: V03Filter.PRD_REL_TYPES.length,
    objects: V03Filter.objects().length, cards: document.querySelectorAll('.rel-card').length,
    view: V03Relation.debug().view
  }));
  if (relation.groups !== 4 || relation.types !== 14 || relation.view !== 'globe' || relation.cards < 20) throw new Error('关联层初始展示错误');
  await page.locator('#menuBody .mn-varieties button').first().click();
  const filtered = await page.evaluate(() => V03Filter.objects().length);
  if (!filtered || filtered >= relation.objects) throw new Error('关联层品种筛选未生效');
  await page.locator('#menuBody .mn-varieties button').first().click();

  await page.evaluate(() => V03Store.set({ tab: 'sim', menu: false }));
  await page.locator('[data-suggest]').first().click();
  await page.locator('[data-action="launch"]').click();
  await page.waitForFunction(() => V03Sim.debug().status === 'done', { timeout: 25000 });
  if (await page.locator('.prd-stage').count()) throw new Error('完成后未进入报告页');
  if (!await page.locator('.prd-disclaimer').textContent().then(t => t.includes('固定的榴莲示例数据'))) throw new Error('报告缺少演示数据告知');
  await page.locator('[data-cite]').first().click();
  if (!await page.locator('#prdEvidence').isVisible()) throw new Error('报告证据回溯未打开');
  await page.locator('[data-report="graph"]').click();
  if (!await page.locator('.prd-graph').isVisible()) throw new Error('报告图谱未显示');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('PRD prototype: fact taxonomy, relation taxonomy/filter/cards, 7-stage simulation, report/citations/graph passed');
} finally {
  await browser.close();
}
