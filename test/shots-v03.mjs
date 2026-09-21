#!/usr/bin/env node
/* ============================================================
   AgriLink V1.0 截图取证（LLM-291 页面重构 + LLM-292 数据包定向接入）
   桌面 1440×900：事实层默认（全球 342 点）/ 全国 / 菜单 / 3D / 六类卡片 / 详情 / 产区口岸 /
                 省区 / 视频静态降级 / 流水 / 设置 / 关联地图 / 完整网络 / 菜单 / 本体详情 /
                 关联详情 / 面板
   窄屏 390×844：事实层 / 菜单 / 详情 / 关联层 / 3D
   运行：node test/shots-v03.mjs      产物：shots/v04-*.png
   ============================================================ */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'file://' + path.join(root, 'index.html');
const OUT = path.join(root, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(12000);
  await page.route('**/*', rt => {
    const u = rt.request().url();
    return (u.startsWith('file://') || u.startsWith('about:')) ? rt.continue() : rt.abort();
  });
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__AGRI_READY === true, null, { timeout: 30000 });
  await sleep(900);
  return page;
}
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name) }); console.log('  ▸', name); };
const set = async (page, patch, wait) => { await page.evaluate(p => window.V03_DEBUG.set(p), patch); await sleep(wait || 900); };
async function closeModals(page) {
  for (let i = 0; i < 4; i++) {
    if (!(await page.evaluate(() => document.getElementById('modal').classList.contains('on')))) return;
    await page.keyboard.press('Escape'); await sleep(260);
  }
}

const browser = await chromium.launch();

/* ---------------- 1440×900 ---------------- */
console.log('桌面 1440×900');
let page = await open(browser, 1440, 900);

await shot(page, 'v04-01-fact-default.png');                       // 事实层默认（全球 342 点 + 卡片 + 流水）
await set(page, { geo: { level: 'L2', focus: null } }, 1100);
await shot(page, 'v04-02-fact-l2-china.png');                      // 全国视角（175 点）

await page.click('#menuBtn'); await sleep(600);
await shot(page, 'v04-03-fact-menu.png');                          // 左侧图层菜单：概览 / 10 类 taxonomy / 快捷控制
await page.click('#menuClose'); await sleep(500);
await set(page, { time: '7d', cred: 'high', infl: 'high' }, 1200);
await shot(page, 'v04-01c-fact-default-regions.png');              // 默认口径（7 天 + 高 + 高）多区域星点

await page.locator('#mapSk .sk[data-k="mode3d"]').click(); await sleep(1600);
await shot(page, 'v04-04-fact-3d.png');                            // 3D 地球（缓慢自转）
await page.locator('#mapSk .sk[data-k="mode3d"]').click(); await sleep(800);

await set(page, { time: 'all', cred: 'all', infl: 'all', geo: { level: 'L1', focus: null } }, 1500);
await shot(page, 'v04-01b-fact-all-342.png');                      // 切「全部」后的 342 点完整密度
await shot(page, 'v04-05-fact-cards.png');                         // 两列瀑布流（价格 / 新闻 / 产地类模板）
await page.evaluate(() => {                                        // 滚动到天气 / 市场类卡片，取证其余模板
  const first = window.V03Data.FACTS.find(f => f.cardType === 'weather');
  const n = first && [...document.querySelectorAll('#layer-fact .fcard')].find(x => x.dataset.fid === first.id);
  if (n) n.scrollIntoView({ block: 'start' });
});
await sleep(700);
await shot(page, 'v04-05b-fact-cards-weather.png');
await page.evaluate(() => {
  const first = window.V03Data.FACTS.find(f => f.cardType === 'market');
  const n = first && [...document.querySelectorAll('#layer-fact .fcard')].find(x => x.dataset.fid === first.id);
  if (n) n.scrollIntoView({ block: 'start' });
});
await sleep(700);
await shot(page, 'v04-05c-fact-cards-market.png');
await page.evaluate(() => document.getElementById('sideBody').scrollTop = 0); await sleep(400);
await page.locator('#layer-fact .fcard').first().click(); await sleep(900);
await shot(page, 'v04-06-fact-detail.png');                        // 事实详情弹窗
await closeModals(page); await sleep(400);

await page.locator('#mapSk .sk[data-k="regions"]').click(); await sleep(600);
await page.locator('#mapSk .sk[data-k="gates"]').click(); await sleep(1100);
await shot(page, 'v04-07-fact-marks.png');                         // 64 产区 + 56 港口 + 49 机场 + 4 节点（真实经纬度）
await page.locator('#mapSk .sk[data-k="regions"]').click();
await page.locator('#mapSk .sk[data-k="gates"]').click(); await sleep(700);

await set(page, { geo: { level: 'L3', focus: '湖南' } }, 1500);
await shot(page, 'v04-08-fact-l3-hunan.png');                      // 省区视角（湖南 281 点）

await set(page, { geo: { level: 'L1', focus: null } }, 1200);
const vidId = await page.evaluate(() => (window.V03Data.FACTS.find(f => f.cardType === 'video') || {}).id);
await page.evaluate(id => { const n = [...document.querySelectorAll('#layer-fact .fcard')].find(x => x.dataset.fid === id); if (n) n.scrollIntoView({ block: 'center' }); }, vidId);
await sleep(600);
await shot(page, 'v04-09-video-static.png');                       // 视频卡片：源未验证可嵌入 → 静态卡片降级

await set(page, { geo: { level: 'L1', focus: null } }, 1000);
await page.locator('#streamClose').click(); await sleep(400);
await page.click('#btnStream'); await sleep(1800);
await shot(page, 'v04-10-stream.png');                             // 底部终端流水（数据包时序序列）

await page.click('#btnSettings'); await sleep(500);
await shot(page, 'v04-11-settings-gate.png');                      // 设置入口（演示口令）
await page.fill('#pwInput', '123321'); await page.click('#pwOk'); await sleep(600);
await shot(page, 'v04-12-settings-blank.png');                     // 设置页（本期空白）
await page.click('#setBack'); await sleep(500);

await page.click('#tabs button[data-tab="relation"]'); await sleep(2600);
await shot(page, 'v04-13-relation-map.png');                       // 关联层地图：377 本体节点 + 585 关系流动线
await set(page, { cred: 'high' }, 1200);
await shot(page, 'v04-14-relation-network.png');                   // 置信度收敛后的关联网络
await set(page, { cred: 'all' }, 1000);
await page.click('#menuBtn'); await sleep(600);
await shot(page, 'v04-15-relation-menu.png');                      // 关联层左侧菜单（九类对象域）
await page.click('#menuClose'); await sleep(500);
await page.locator('#relBody .rel-card').first().click(); await sleep(900);
await shot(page, 'v04-16-relation-obj-detail.png');                // 本体详情弹窗
await closeModals(page); await sleep(400);
await page.locator('#relBody .rel-row').first().click(); await sleep(900);
await shot(page, 'v04-17-relation-rel-detail.png');                // 关联详情弹窗
await closeModals(page); await sleep(400);
await page.evaluate(() => document.getElementById('relBody').scrollTop = 0); await sleep(400);
await shot(page, 'v04-18-relation-panel.png');                     // 右侧：关系清单（逐条可辨）+ 非地理本体卡片
await page.close();

/* ---------------- 390×844 ---------------- */
console.log('窄屏 390×844');
page = await open(browser, 390, 844);
await shot(page, 'v04-20-narrow-fact.png');
await page.click('#menuBtn'); await sleep(700);
await shot(page, 'v04-21-narrow-menu.png');
await page.click('#menuClose'); await sleep(600);
await page.locator('#layer-fact .fcard').first().click(); await sleep(900);
await shot(page, 'v04-22-narrow-detail.png');
await closeModals(page); await sleep(500);
await page.click('#tabs button[data-tab="relation"]'); await sleep(2600);
await shot(page, 'v04-23-narrow-relation.png');
await page.click('#tabs button[data-tab="fact"]'); await sleep(1400);
await page.click('#mapSk .sk[data-k="mode3d"]'); await sleep(1800);
await shot(page, 'v04-24-narrow-3d.png');
await page.close();

await browser.close();
console.log('截图完成 →', path.relative(root, OUT) + '/v04-*.png');
