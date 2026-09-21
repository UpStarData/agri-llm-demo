#!/usr/bin/env node
/* ============================================================
   V0.3 — 基线对照取证（对照截图 + 组件复用证据）
   1) 从 git 取基线 46be371 的单文件 index.html（不改仓库、不提交）
   2) 1440×900 逐页截基线：首页 / L1 全球地球 / L2 全国地图 / L3 省区分析面板 / L4 单品全链路
   3) 1440×900 截新三层：事实层 / 事实详情 / 关联层图谱 / 地理关联 / 推演层
   4) 用同一个 1440 视口把「基线页 ↔ 新页」拼成对照图（左右同宽）
   运行：node test/compare-v03.mjs   输出：shots/baseline/、shots/v03/、shots/compare/
   ============================================================ */
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = path.join(root, '.basecmp');
const OUT = path.join(root, 'shots');
const BASE = path.join(OUT, 'baseline'), V03 = path.join(OUT, 'v03'), CMP = path.join(OUT, 'compare');
for (const d of [TMP, BASE, V03, CMP]) fs.mkdirSync(d, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const W = 1440, H = 900;

fs.writeFileSync(path.join(TMP, 'index.html'), execSync('git show 46be371:index.html', { cwd: root, maxBuffer: 1 << 28 }));

async function open(browser, url) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H } });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15000);
  await page.route('**/*', rt => rt.request().url().startsWith('file://') ? rt.continue() : rt.abort());
  await page.goto(url, { waitUntil: 'load' });
  return { ctx, page };
}
const shot = (page, p) => page.screenshot({ path: p });

async function waitLayer(page, n, timeout = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const l = await page.evaluate(() => (window.AGRI_DEBUG ? window.AGRI_DEBUG.state().layer : null));
    if (l === n) return true;
    await sleep(120);
  }
  return false;
}

async function baseline(browser) {
  const { ctx, page } = await open(browser, 'file://' + path.join(TMP, 'index.html'));
  await sleep(700);
  await shot(page, path.join(BASE, '01-landing.png'));
  await page.click('#enterBtn');
  await waitLayer(page, 1); await sleep(2600);           // 进入系统 → L1 全球地球（含弧线生长动画）
  await shot(page, path.join(BASE, '02-l1-globe.png'));
  await page.evaluate(() => window.AGRI_DEBUG.demoPath('durian-my'));   // 一键演示路径：马来西亚·猫山王
  await waitLayer(page, 2); await sleep(1800);
  await shot(page, path.join(BASE, '03-l2-map.png'));
  await waitLayer(page, 3); await sleep(2600);
  await shot(page, path.join(BASE, '04-l3-province.png'));
  await waitLayer(page, 4); await sleep(1800);
  await shot(page, path.join(BASE, '05-l4-chain.png'));
  await ctx.close();
}

async function v03shots(browser) {
  const url = 'file://' + path.join(root, 'index.html');
  const { ctx, page } = await open(browser, url);
  await page.waitForFunction(() => window.__AGRI_READY === true, null, { timeout: 15000 });
  await sleep(900);
  await shot(page, path.join(V03, '01-fact-layer.png'));
  await page.click('#layer-fact .fcard'); await sleep(900);
  await shot(page, path.join(V03, '02-fact-detail.png'));
  await page.click('#toRel'); await sleep(1400);
  await shot(page, path.join(V03, '03-relation-graph.png'));
  await page.click('.rel-seg button[data-view="geo"]'); await sleep(1400);
  await shot(page, path.join(V03, '04-relation-geo.png'));
  await page.click('#tabs button[data-tab="sim"]'); await sleep(1000);
  await page.evaluate(() => window.V03_DEBUG.set({ sim: { tick: 28, status: 'paused' } })); await sleep(900);
  await shot(page, path.join(V03, '05-sim-steps.png'));
  await page.evaluate(() => window.V03_DEBUG.set({ sim: { tick: 60, status: 'done', report: 4 } })); await sleep(900);
  await shot(page, path.join(V03, '06-sim-report.png'));
  await ctx.close();
}

/* 左右同宽拼接：同一个 1440 视口，用一张对比页截图（不引入图像库） */
async function compose(browser, pairs) {
  for (const [name, base, neu, capBase, capNew] of pairs) {
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
      body{margin:0;background:#eef1f6;font-family:'IBM Plex Sans SC','PingFang SC',-apple-system,sans-serif;color:#10151f}
      .row{display:flex;gap:10px;padding:10px}
      .col{flex:1;min-width:0;background:#fff;border:1px solid rgba(15,23,42,.10);border-radius:12px;overflow:hidden}
      .cap{font-size:12px;padding:7px 11px;color:#4d586a;border-bottom:1px solid rgba(15,23,42,.08);font-weight:600}
      .cap span{font-weight:400;color:#64707f}
      img{display:block;width:100%;height:auto}
      .head{padding:10px 12px 0;font-size:13px;font-weight:700}
      .head small{font-weight:400;color:#64707f;margin-left:8px}
    </style></head><body>
      <div class="head">${name}<small>左：基线 AgriLink 46be371 · 右：V0.3 三层 Demo（同一 1440×900 视口，等宽缩放）</small></div>
      <div class="row">
        <div class="col"><div class="cap">${capBase}</div><img src="file://${base}"></div>
        <div class="col"><div class="cap">${capNew}</div><img src="file://${neu}"></div>
      </div></body></html>`;
    const p = path.join(TMP, 'cmp.html');
    fs.writeFileSync(p, html);
    const { ctx, page } = await open(browser, 'file://' + p);
    await sleep(500);
    await shot(page, path.join(CMP, name + '.png'));
    await ctx.close();
  }
}

const browser = await chromium.launch();
await baseline(browser);
await v03shots(browser);
await compose(browser, [
  ['cmp-01-baseline-landing-vs-fact-layer', path.join(BASE, '01-landing.png'), path.join(V03, '01-fact-layer.png'),
    '基线 · 品牌首页（landing：品牌位 / 标题 / 结构说明 / CTA / 免责声明）', 'V0.3 · 事实层（地图主体 + 右侧事实卡片 + 底部流水）'],
  ['cmp-02-baseline-l2map-vs-fact-detail', path.join(BASE, '03-l2-map.png'), path.join(V03, '02-fact-detail.png'),
    '基线 · L2 全国地图 + 右侧分析面板', 'V0.3 · 事实详情（统一影响范围 / 证据 / 相关本体与关系）'],
  ['cmp-03-baseline-l3panel-vs-relation', path.join(BASE, '04-l3-province.png'), path.join(V03, '03-relation-graph.png'),
    '基线 · L3 省区分析面板（对象绑定）', 'V0.3 · 关联层图谱（九类对象域 + 对象/关系详情）'],
  ['cmp-04-baseline-globe-vs-relation-geo', path.join(BASE, '02-l1-globe.png'), path.join(V03, '04-relation-geo.png'),
    '基线 · L1 全球地球（真实地理 + 境外产区）', 'V0.3 · 关联层地理关联（有坐标对象上图，无坐标单独列出）'],
  ['cmp-05-baseline-l4chain-vs-sim', path.join(BASE, '05-l4-chain.png'), path.join(V03, '05-sim-steps.png'),
    '基线 · L4 单品全链路（环节卡 / 价格链 / 抽屉）', 'V0.3 · 推演层（五阶段十二步骤 + 两个核心指标 + 轮次）'],
  ['cmp-06-baseline-landing-vs-sim-report', path.join(BASE, '01-landing.png'), path.join(V03, '06-sim-report.png'),
    '基线 · 品牌与免责声明（示意数据口径）', 'V0.3 · 推演报告（现实基线/模型推断/模拟结果/建议 分离 + 引用）']
]);
await browser.close();
console.log('基线截图 → shots/baseline/  新页截图 → shots/v03/  对照图 → shots/compare/');
console.log(fs.readdirSync(CMP).map(f => '  compare/' + f).join('\n'));
