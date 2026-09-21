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
  page.setDefaultTimeout(8000);
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

  /* ---------- 6. 推演层：五阶段十二步骤 / 两个核心指标 / 轮次 / 报告 / 追问 / Jev ---------- */
  await page.click('#tabs button[data-tab="sim"]');
  await sleep(900);
  const s0 = await simDbg(page);
  const simText = async () => await page.locator('#layer-sim').innerText();
  check('推演层为第三个 TAB 且报告属于本层', s0.renderedStages === 5 && (await simText()).includes('决策报告'), JSON.stringify(s0));
  check('五阶段承载十二步骤', s0.renderedStages === 5 && s0.steps === 12 && s0.renderedSteps === 12, JSON.stringify({ stages: s0.renderedStages, steps: s0.renderedSteps }));
  check('五阶段名称与确认口径一致', await page.evaluate(() => ['图谱构建', '环境搭建', '开始模拟', '报告生成', '深度互动'].every(n => document.getElementById('layer-sim').innerText.includes(n))));
  check('当前步骤展示输入/处理/输出/页面承载/下一步', await page.evaluate(() => ['输入', '处理', '输出', '页面承载', '下一步'].every(n => document.getElementById('simCur').innerText.includes(n))));
  check('两个核心指标：分子/分母/时间范围/口径/演示基线', await page.evaluate(() => {
    const t = document.getElementById('simInd').innerText;
    return document.querySelectorAll('#layer-sim .sim-ind').length === 2 &&
      t.includes('分子') && t.includes('分母') && t.includes('最近 30 天') && t.includes('交易量口径') && t.includes('35%');
  }));
  check('统一用户故事替换旧三条样例', (await simText()).includes('马来西亚榴莲') && !(await simText()).includes('水产补贴套利'));
  check('旧泛化样例不再出现在页面', await page.evaluate(() => !/水产补贴套利|价格影响链|基地—湖南—红星/.test(document.body.innerText)));
  check('种子为榴莲基线事实（含 4,800/1,680 吨）', s0.seeds >= 6 && (await simText()).includes('4,800 吨') && (await simText()).includes('1,680 吨'));
  check('规则与参数区分现实基线/规则参数/模拟参数/用户假设', await page.evaluate(() => {
    const t = document.getElementById('simParams').innerText;
    return ['现实基线', '规则参数', '模拟参数', '用户假设'].every(x => t.includes(x));
  }));
  check('十二轮计划（12 轮 × 2.5 天 = 30 天）', s0.rounds === 12 && (await page.locator('#layer-sim .sim-round').count()) === 12 && (await simText()).includes('12 轮 × 2.5 天'));
  check('未开始时报告与追问为待生成', (await page.locator('#layer-sim .sim-pending').count()) >= 1);
  check('推演层标注示意引擎 + 演示样例', (await page.locator('#layer-sim .sim-badge.engine').innerText()).includes('非真实 MiroFish') && (await page.locator('#layer-sim .sim-badge.sample').innerText()).includes('演示样例'));

  await page.click('#layer-sim .sim-ctl button:has-text("开始推演")');
  await sleep(2600);
  const sRun = await simDbg(page);
  check('开始推演后步骤真实推进（计时器驱动）', sRun.status === 'running' && sRun.step >= 2, JSON.stringify({ step: sRun.step, tick: sRun.tick }));
  await page.click('#layer-sim .sim-ctl button:has-text("暂停")');
  await sleep(400);
  check('暂停真实写回状态', (await st(page)).sim.status === 'paused');
  await page.click('#layer-sim .sim-ctl button:has-text("继续")');
  await sleep(300);

  const stepBtn = page.locator('#layer-sim .sim-ctl button:has-text("单步推进")');
  for (let i = 0; i < 60; i++) {
    if ((await st(page)).sim.status === 'done') break;
    if (await stepBtn.count() === 0) break;
    await stepBtn.click();
    await sleep(110);
  }
  const sEnd = await simDbg(page);
  check('推进至 12 轮并生成报告', sEnd.round === 12 && sEnd.step === 12 && sEnd.status === 'done', JSON.stringify({ round: sEnd.round, step: sEnd.step, status: sEnd.status }));
  check('轮次详情含事件/指标值/引用', await page.evaluate(() => {
    const t = document.querySelector('#layer-sim .sim-round .rb').innerText;
    return t.includes('动作') && t.includes('事件') && t.includes('流入占比') && t.includes('市场份额');
  }));
  await shot(page, 'v03-07-sim-steps.png');
  check('报告分离现实基线/模型推断/模拟结果/建议', await page.evaluate(() => {
    const t = document.getElementById('simReport').innerText;
    return ['现实基线', '模型推断', '模拟结果', '建议'].every(x => t.includes(x));
  }));
  check('报告要点带引用胶囊', (await page.locator('#layer-sim .sim-rep-sec .sim-cite').count()) >= 1);
  await shot(page, 'v03-08-sim-report.png');
  await page.click('#layer-sim .sim-cite:has-text("事实")');
  await sleep(700);
  check('报告引用可回链事实层', (await st(page)).tab === 'fact' && !!(await st(page)).factId);

  await page.click('#tabs button[data-tab="sim"]');
  await sleep(700);
  await page.click('#layer-sim .qa-q:has-text("供应增幅从 20% 改为 10%")');
  await sleep(600);
  const sQa = await st(page);
  check('深度追问改关键假设创建新 run 且原 run 保留', sQa.sim.run === 'AGRI-DURIAN-HX-002' && (sQa.sim.runs || []).includes('AGRI-DURIAN-HX-001') && sQa.sim.assumption.supply === 10, JSON.stringify({ run: sQa.sim.run, runs: sQa.sim.runs }));
  check('追问回答标识为当前 run / 新 run 语义', (await simText()).includes('原 run 与原报告保持不变') || (await simText()).includes('新假设产生新 run'));
  await shot(page, 'v03-09-sim-qa-newrun.png');

  await page.click('#layer-sim .sim-ctl button:has-text("模拟 Jev 失败")');
  await sleep(500);
  check('Jev 旁路信号可降级并写明原因', (await st(page)).sim.sidecar === 'degraded' && (await page.locator('#layer-sim .sim-side').innerText()).includes('降级'));
  check('Jev 面板声明不参与事实入层、不做预测、密钥只在服务端', await page.evaluate(() => {
    const t = document.getElementById('simSide').innerText;
    return t.includes('不参与事实入层') && t.includes('不构成价格或产量预测') && t.includes('不接收、不记录、不提交任何密钥');
  }));
  await shot(page, 'v03-10-sim-jev-degraded.png');

  await page.click('#layer-sim .sim-ctl button:has-text("离线回放")');
  await sleep(400);
  check('离线回放可开启并明示', (await st(page)).sim.offline === true && (await page.locator('#layer-sim #simStatus').innerText()).includes('离线回放'));
  await shot(page, 'v03-11-sim-offline.png');

  check('全页统一写 Jev，不出现 Jev-like', await page.evaluate(() => /Jev/.test(document.body.innerText) && !/Jev-like/i.test(document.body.innerText)));
  check('页面不接收任何密钥输入', (await page.locator('input[type="password"]').count()) === 0 && await page.evaluate(() => !/api[_ ]?key|密钥输入|粘贴密钥/i.test(document.body.innerText) || /不接收、不记录、不提交任何密钥/.test(document.body.innerText)));

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
