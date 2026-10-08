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
  await page.evaluate(() => V03Store.set({ time: '30d', panels: { cards: false, stream: false } }));
  const fact = await page.evaluate(() => {
    const chart = echarts.getInstanceByDom(document.querySelector('#factMap'));
    return { rings: chart.getOption().series.find(x => x.id === 'halo').data.length,
      validRadii: V03Filter.mappable(V03Filter.factsAtLevel(V03Store.state)).filter(f => Number.isFinite(f.radius) && f.radius > 0).length,
      theme: V03Store.state.theme, enabled: V03Store.state.sk.influence };
  });
  if (fact.rings > fact.validRadii * 3 || !fact.enabled || fact.theme !== 'color') throw Error('地理影响圆含无半径事实，或主配色失效');

  await page.evaluate(() => V03Store.set({ tab: 'relation', menu: true, panels: { cards: true } }));
  await page.waitForFunction(() => document.querySelectorAll('.rel-card').length > 0);
  const rel = await page.evaluate(() => ({ view: V03Relation.debug().view,
    controls: [...document.querySelectorAll('#mapSk button')].map(b => b.dataset.k),
    total: document.querySelector('#menuBody .relation-overview')?.textContent }));
  if (rel.controls.join(',') !== 'zoomIn,zoomOut,view3d,view2d,viewGraph,search,gates,fullscreen') throw Error('关联层快捷键数量或顺序失效: ' + rel.controls);
  if (rel.view !== 'globe' || !rel.controls.includes('viewGraph') || !rel.total.includes('4128')) throw Error('关联层默认视图、控制或概览失效');
  if ((await page.locator('#menuBody').textContent()).includes('暂无记录')) throw Error('图例仍包含无数据提示');
  await page.locator('#mapSk button[data-k=gates]').click();
  if (!await page.evaluate(() => V03Store.state.sk.gates)) throw Error('港口锚点开关失效');
  await page.locator('#mapSk button[data-k=view2d]').click();
  if (!await page.evaluate(() => echarts.getInstanceByDom(document.querySelector('#relCanvas')).getOption().series.find(x => x.id === 'relPorts').data.length > 0)) throw Error('二维港口锚点未绘制');
  if (await page.evaluate(() => V03Relation.debug().view) !== 'geo') throw Error('快捷视图切换失效');
  await page.locator('#mapSk button[data-k=search]').click();
  await page.locator('.sk-input').fill('榴莲');
  if (!await page.locator('.search-result').count()) throw Error('本体搜索没有结果');
  await page.locator('.search-actions button').last().click();
  if (!await page.evaluate(() => V03Store.state.rel.search)) throw Error('本体搜索未提交');
  if (!await page.locator('#mapSk .sk-search-term').count() || !(await page.locator('#mapSk .sk-search-term').textContent()).includes('榴莲')) throw Error('已提交搜索词未持续显示');
  await page.evaluate(() => V03Store.set({ rel: { search: '' } }));
  await page.locator('#relBody .rel-card').first().click();
  await page.locator('#drawerStack .drawer').waitFor();
  await page.waitForTimeout(280); // wait for the drawer slide animation to finish
  const [drawerBox, cardBox] = await Promise.all([
    page.locator('#drawerStack .drawer').first().boundingBox(),
    page.locator('#relBody').boundingBox()
  ]);
  if (!drawerBox || !cardBox || drawerBox.x + drawerBox.width > cardBox.x + 2)
    throw Error('本体详情遮挡了右侧卡片列表: ' + JSON.stringify({drawerBox,cardBox}));
  await page.locator('.rel-start-sim').click();
  if (await page.evaluate(() => V03Store.state.tab) !== 'sim') throw Error('本体发起推演未切换页面');
  const iframe = await page.locator('.miro-bridge-frame').getAttribute('src');
  if (!iframe.includes('/mirofish-frontend-preview/')) throw Error('推演层未恢复旧版工作台');
  if (errors.length) throw Error(errors.join('\n'));
  console.log('Fact radius gate, relation controls/search, ontology-to-simulation and restored preview passed');
} finally { await browser.close(); }
