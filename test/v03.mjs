#!/usr/bin/env node
/* ============================================================
   V0.3 三层 Demo — 端到端测试（Playwright / 桌面 1440 + 窄屏 390）
   直接加载单文件 index.html（file://），拦截全部外部请求 → 同时验证离线可用与无控制台错误
   每个断言都检查「真实状态是否写回」（window.V03_DEBUG.state()），不接受纯文案切换
   运行：node test/v03.mjs      报告：test/report-v03.md
   ============================================================ */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'file://' + path.join(root, 'index.html');
const SHOTS = path.join(root, 'shots', 'test');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const consoleErrors = [], pageErrors = [], external = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined && detail !== '' ? '  — ' + detail : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(browser, w = 1440, h = 900) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(String(e)));
  page.on('request', r => { if (!r.url().startsWith('file://')) external.push(r.url()); });
  await page.route('**/*', rt => rt.request().url().startsWith('file://') ? rt.continue() : rt.abort());
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__AGRI_READY === true, null, { timeout: 15000 });
  await sleep(600);
  return { ctx, page };
}
const st = page => page.evaluate(() => window.V03_DEBUG.state());
const counts = page => page.evaluate(() => window.V03_DEBUG.counts());
const relDbg = page => page.evaluate(() => window.V03Relation.debug());
const simDbg = page => page.evaluate(() => window.V03Sim.debug());
const factDbg = page => page.evaluate(() => window.V03Fact.debug());
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name), fullPage: false });

async function run() {
  const browser = await chromium.launch();
  const { ctx, page } = await open(browser);

  /* ---------- 1. 骨架 ---------- */
  check('三个一级 TAB 存在且默认事实层', (await page.locator('#tabs button').count()) === 3 && (await st(page)).tab === 'fact');
  check('报告不是第四个 TAB', (await page.locator('#tabs button', { hasText: '报告' }).count()) === 0);
  check('共用筛选骨架（时间 / 可信度 / 影响等级 / 搜索）', (await page.locator('#timeSeg button').count()) === 4 && (await page.locator('#qInput').count()) === 1);
  check('左侧三级分类默认折叠为窄栏', await page.evaluate(() => window.V03_DEBUG.state().rail === false && document.getElementById('rail').className.includes('closed')));
  check('分类栏可点击展开（不长期占据大面积）', await page.evaluate(async () => {
    document.getElementById('railToggle').click();
    await new Promise(r => setTimeout(r, 300));
    return window.V03_DEBUG.state().rail === true && !document.getElementById('rail').className.includes('closed');
  }));
  await sleep(200);

  /* ---------- 2. 事实层：地图 / 筛选 / 卡片 ---------- */
  const c0 = await counts(page);
  check('事实层默认渲染事实卡片', c0.cards > 0, c0.cards + ' 张卡片');
  check('地图已渲染事实点与影响范围（L2）', (await factDbg(page)).series.length >= 3 && (await factDbg(page)).series[1] > 0, JSON.stringify((await factDbg(page)).series));
  check('地图为主体的 KPI 概览', (await page.locator('#layer-fact .kpi').count()) === 5);

  await page.click('#timeSeg button[data-time="7d"]');
  await sleep(400);
  const c7 = await counts(page);
  check('时间筛选真实生效并写回状态', (await st(page)).time === '7d' && c7.cards !== c0.cards, `30天 ${c0.cards} → 7天 ${c7.cards}`);
  await page.click('#timeSeg button[data-time="30d"]');
  await sleep(300);

  await page.click('#rail .r-item:has-text("政策")');
  await sleep(400);
  const cPol = await counts(page);
  check('分类筛选真实生效', (await st(page)).cat === 'policy' && cPol.cards > 0 && cPol.cards < c0.cards, `政策 ${cPol.cards} 条`);
  await page.click('#rail .r-item:has-text("全部事实")');
  await sleep(300);

  await page.fill('#qInput', '补贴');
  await sleep(500);
  check('搜索真实生效', (await st(page)).q === '补贴' && (await counts(page)).cards > 0);
  await page.fill('#qInput', '');
  await sleep(400);

  check('三级事实分类（一级分类 + 二级关键词 + 三级来源）', await page.evaluate(() => {
    const cats = document.querySelectorAll('#rail .r-item').length;
    const srcs = document.querySelectorAll('#rail .r-note').length;
    return cats >= 6 && srcs >= 1;
  }));
  await page.click('#rail .r-item:has-text("政策")');
  await sleep(350);
  check('二级分类展开为关键词细分类别', (await page.locator('#rail .r-sub button').count()) >= 3, (await page.locator('#rail .r-sub button').count()) + ' 个二级项');
  await page.click('#rail .r-sub button');
  await sleep(350);
  check('二级分类真实生效（写回 sub）', !!(await st(page)).sub, (await st(page)).sub);
  await page.click('#rail .r-item:has-text("全部事实")');
  await sleep(300);

  /* ---------- 3. 空间下钻：L2 → L1 → L2 → L3 ---------- */
  await page.click('#layer-fact .fact-level button[data-lv="L1"]');
  await sleep(500);
  const l1 = await factDbg(page);
  check('空间层级：L1 全球视角（面包屑 + 地图下钻，无冗余层级按钮）', l1.level === 'L1' && (await st(page)).geo.level === 'L1' && (await page.locator('#layer-fact .fact-level button[data-lv="L2"]').count()) === 1, JSON.stringify(l1));
  await page.click('#layer-fact .fact-level button[data-lv="L2"]');
  await sleep(500);
  check('空间层级：返回 L2 全国视角', (await st(page)).geo.level === 'L2');
  await page.evaluate(() => window.V03_DEBUG.set({ geo: { level: 'L3', focus: '湖南' } }));
  await sleep(700);
  const l3 = await factDbg(page);
  check('空间层级：L3 省区下钻（湖南）', l3.level === 'L3' && l3.focus === '湖南' && l3.facts > 0, JSON.stringify(l3));
  await page.click('#layer-fact .fact-level button[data-back]');
  await sleep(500);

  /* ---------- 4. 事实详情：影响范围 / 证据 / 进入关联层 / 加入种子 ---------- */
  await page.click('#layer-fact .fcard');
  await sleep(500);
  check('事实详情打开并写回状态', !!(await st(page)).factId);
  check('详情有统一影响范围（不做三分区热力图）', (await page.locator('#layer-fact .impact').count()) === 1 && (await page.locator('#layer-fact .impact').innerText()).includes('km'));
  check('详情有证据列表可回溯', (await page.locator('#layer-fact .ev').count()) >= 1, (await page.locator('#layer-fact .ev').count()) + ' 条证据');
  check('详情有相关本体对象与关系', (await page.locator('#layer-fact [data-obj]').count()) >= 1 && (await page.locator('#layer-fact [data-rel]').count()) >= 1);
  check('「查看处理记录」是次级入口且可展开', await page.evaluate(async () => {
    const b = document.getElementById('toLog'); if (!b) return false;
    b.click(); await new Promise(r => setTimeout(r, 300));
    return window.V03_DEBUG.state().logOpen === true && !!document.querySelector('#layer-fact .rec-log');
  }));
  await shot(page, 'v03-02-fact-detail.png');

  const fid = (await st(page)).factId;
  await page.click('#toSeed');
  await sleep(300);
  check('「加入推演种子」真实写入推演状态', (await st(page)).sim.seedIds.includes(fid), fid);

  await page.click('#toRel');
  await sleep(700);
  check('「进入关联层」携带事实切换 TAB', (await st(page)).tab === 'relation' && (await st(page)).carry.includes(fid));
  check('关联层显示携带横幅与清除入口', (await page.locator('.rel-banner').count()) >= 1 && (await page.locator('.rel-banner').first().innerText()).includes('已携带'));
  await shot(page, 'v03-04-relation-graph.png');

  /* ---------- 5. 关联层：九类对象域 / 双视图 / 无坐标 / 关系详情 ---------- */
  const domainItems = await page.locator('#rail .r-item').count();
  check('关联层分类覆盖九类对象域（含全部）', domainItems === 10, domainItems + ' 项');
  const rg = await relDbg(page);
  check('图谱节点与边来自当前过滤数据', rg.nodes > 0 && rg.edges > 0 && rg.graphNodes === rg.nodes, JSON.stringify({ nodes: rg.nodes, edges: rg.edges, graphNodes: rg.graphNodes }));
  check('社区摘要由连通性算出', rg.communities >= 1, rg.communities + ' 个社区');

  await page.click('.rel-seg button[data-view="geo"]');
  await sleep(800);
  const rgeo = await relDbg(page);
  check('地理关联视图：只画有坐标对象', rgeo.mapped > 0 && rgeo.series[1] === rgeo.mapped, JSON.stringify({ mapped: rgeo.mapped, drawn: rgeo.series[1] }));
  check('无坐标对象在清单中列出、不在地图上', rgeo.unmapped > 0 && (await page.locator('#relNogeo .chip').count()) === rgeo.unmapped, rgeo.unmapped + ' 个无坐标对象');
  check('关联层声明自动抽离、无人工审核入口', (await page.locator('.rel-note').first().innerText()).includes('不设人工审核入口') && (await page.locator('button:has-text("审核")').count()) === 0);
  await shot(page, 'v03-05-relation-geo.png');

  await page.click('#relNogeo .chip');
  await sleep(400);
  const objSt = await st(page);
  check('无坐标对象可打开详情', objSt.rel.kind === 'object' && !!(await page.locator('#relBody .rel-card').count()));
  await page.click('#relBody .rel-link[data-rel]');
  await sleep(400);
  const relSt = await st(page);
  check('关系详情含强度/置信度/时序记忆/支撑事实', relSt.rel.kind === 'relation' &&
    (await page.locator('#relBody').innerText()).includes('时序记忆') &&
    (await page.locator('#relBody').innerText()).includes('支撑事实') &&
    (await page.locator('#relBody').innerText()).includes('最近由什么事实改变'));
  await shot(page, 'v03-06-relation-detail.png');

  await page.click('.rel-seg button[data-view="graph"]');
  await sleep(500);
  await page.click('.rel-banner button[data-act="only"]');
  await sleep(500);
  check('「只看携带事实相关」过滤真实生效', (await st(page)).rel.onlyCarry === true && (await relDbg(page)).nodes <= rg.nodes);
  await page.click('.rel-banner button[data-act="clear"]');
  await sleep(500);
  check('清除携带后回到全量', (await st(page)).carry.length === 0 && (await relDbg(page)).nodes === rg.nodes);

  /* ---------- 6. 推演层：七阶段 / 种子 / 轮次 / 报告 / 旁路 ---------- */
  await page.click('#tabs button[data-tab="sim"]');
  await sleep(700);
  const s0 = await simDbg(page);
  check('推演层为第三个 TAB 且报告属于本层', s0.renderedStages === 7 && (await page.locator('#layer-sim :text("推演报告")').count()) >= 1);
  check('七阶段流水线完整', (await page.locator('#layer-sim .sim-stage').count()) === 7);
  check('种子含场景默认 + 携带事实', s0.seeds >= 4, s0.seeds + ' 条');
  check('未开始时报告显示「待生成」', (await page.locator('#layer-sim .sim-pending').count()) >= 1);
  check('推演层明确标注示意引擎（非真实 MiroFish）', (await page.locator('#layer-sim .sim-badge.engine').innerText()).includes('非真实 MiroFish'));

  await page.click('#layer-sim .sim-ctl button:has-text("开始推演")');
  await sleep(2400);
  const sRun = await simDbg(page);
  check('开始推演后阶段真实推进（计时器驱动）', sRun.status === 'running' && sRun.stage >= 1, JSON.stringify({ stage: sRun.stage, status: sRun.status }));
  await page.click('#layer-sim .sim-ctl button:has-text("暂停")');
  await sleep(400);
  check('暂停真实写回状态', (await st(page)).sim.status === 'paused');
  await page.click('#layer-sim .sim-ctl button:has-text("继续")');
  await sleep(300);

  for (let i = 0; i < 14; i++) { await page.click('#layer-sim .sim-ctl button:has-text("单步一轮")').catch(() => {}); await sleep(180); }
  const sStep = await simDbg(page);
  check('单步推进至轮次与报告生成', sStep.round >= 1 && sStep.report >= 1, JSON.stringify({ round: sStep.round, report: sStep.report, stage: sStep.stage }));
  check('轮次详情含动作/发现/信号/引用', (await page.locator('#layer-sim .sim-round .rb').first().innerText()).includes('动作') && (await page.locator('#layer-sim .sim-cite').count()) >= 1);
  check('报告要点带引用胶囊', (await page.locator('#layer-sim .sim-rep .sim-cite').count()) >= 1);
  await shot(page, 'v03-07-sim-run.png');

  await page.click('#layer-sim .sim-cite:has-text("事实")');
  await sleep(700);
  check('报告引用可回链事实', (await st(page)).tab === 'fact' && !!(await st(page)).factId);
  await page.click('#tabs button[data-tab="sim"]');
  await sleep(500);

  await page.click('#layer-sim .sim-ctl button:has-text("模拟旁路失败")');
  await sleep(400);
  check('旁路模型信号可降级并写明原因', (await st(page)).sim.sidecar === 'degraded' && (await page.locator('#layer-sim .sim-side').innerText()).includes('降级'));
  check('旁路面板声明不参与事实入层/不构成预测', (await page.locator('#layer-sim .sim-side').innerText()).includes('不参与事实入层') || (await page.locator('#layer-sim .sim-side').innerText()).includes('不构成价格或产量预测'));
  await shot(page, 'v03-08-sim-sidecar-degraded.png');
  await page.click('#layer-sim .sim-ctl button:has-text("恢复旁路信号")');
  await sleep(300);

  await page.click('#layer-sim .sim-ctl button:has-text("离线回放")');
  await sleep(400);
  check('离线回放可开启并明示', (await st(page)).sim.offline === true && (await page.locator('#layer-sim #simStatus').innerText()).includes('离线回放'));
  await page.click('#layer-sim .sim-ctl button:has-text("关闭离线回放")');
  await sleep(300);

  /* ---------- 7. 窄屏 390 ---------- */
  const m = await open(browser, 390, 844);
  const overflow = await m.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check('390px 窄屏无横向溢出', overflow <= 2, 'overflow=' + overflow + 'px');
  check('390px 三个 TAB 可用', (await m.page.locator('#tabs button').count()) === 3);
  await m.page.click('#tabs button[data-tab="relation"]');
  await sleep(900);
  check('390px 关联层渲染图谱', (await relDbg(m.page)).nodes > 0);
  await shot(m.page, 'v03-09-narrow-relation.png');
  await m.page.click('#tabs button[data-tab="sim"]');
  await sleep(700);
  await shot(m.page, 'v03-10-narrow-sim.png');
  await m.ctx.close();

  /* ---------- 8. 全局质量 ---------- */
  check('无控制台错误', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
  check('无页面异常', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  check('离线可用：无任何外部网络请求', external.length === 0, external.slice(0, 3).join(' | '));
  check('页面无开发备注/TODO', !(await page.evaluate(() => /TODO|FIXME|待办|开发备注/.test(document.body.innerText))));

  await ctx.close();
  await browser.close();
}

await run();

const pass = results.filter(r => r.ok).length;
const report = [
  '# V0.3 三层 Demo — 端到端测试报告',
  '',
  `- 结果：**${pass}/${results.length} 通过**`,
  `- 运行：\`node test/v03.mjs\`（Playwright / file:// 离线加载 / 桌面 1440 + 窄屏 390）`,
  `- 断言口径：每个交互都检查状态是否写入 \`window.V03Store.state\`，不接受纯文案切换`,
  '',
  '| # | 断言 | 结果 | 证据 |',
  '| --- | --- | --- | --- |',
  ...results.map((r, i) => `| ${i + 1} | ${r.name} | ${r.ok ? 'PASS' : 'FAIL'} | ${String(r.detail).replace(/\|/g, '/').slice(0, 160)} |`),
  '',
  '控制台错误：' + (consoleErrors.length ? consoleErrors.join(' / ') : '无'),
  '外部请求：' + (external.length ? external.join(' / ') : '无'),
  ''
].join('\n');
fs.writeFileSync(path.join(root, 'test', 'report-v03.md'), report);
console.log(`\n${pass}/${results.length} 通过 · 报告 test/report-v03.md`);
process.exit(pass === results.length ? 0 : 1);
