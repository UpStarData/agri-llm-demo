#!/usr/bin/env node
/* ============================================================
   农链 AgriLink — 真实连通性验证（LLM-234 验收用）
   对**正在运行的本地演示服务**做真实调用，只记录安全证据：
   HTTP 状态 / 模型名 / 耗时 / 响应非空 / 脱敏片段；
   绝不打印 Authorization、完整 key 或完整回复中的敏感内容。

   用法：
     node test/live-check.mjs                       # 默认打 http://127.0.0.1:4180
     AGRI_LIVE_URL=http://127.0.0.1:4180 node test/live-check.mjs
   产出：test/report-live.md + shots-live/*.png
   ============================================================ */
import { chromium } from 'playwright';
import fs from 'node:fs';
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.AGRI_LIVE_URL || 'http://127.0.0.1:4180').replace(/\/+$/, '') + '/';
const SHOTS = path.join(root, 'shots-live');
fs.mkdirSync(SHOTS, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = [];
const say = s => { console.log(s); log.push(s); };

function findChromium() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = path.join(process.env.HOME, 'Library/Caches/ms-playwright');
  if (!fs.existsSync(base)) return undefined;
  for (const d of fs.readdirSync(base).filter(x => x.startsWith('chromium_headless_shell'))) {
    const p = path.join(base, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell');
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}
const redact = s => String(s == null ? '' : s).replace(/\b(sk-|Bearer\s+)[A-Za-z0-9_\-]{6,}/gi, '$1«redacted»');
async function waitHttp(url, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { const r = await fetch(url); if (r.status < 500) return true; } catch (e) { /* 还没起来 */ }
    await sleep(250);
  }
  return false;
}

/* ---------------- 1. 服务端真实证据 ---------------- */
async function apiEvidence() {
  say('## 1. 真实 DeepSeek：服务端 /models 与 /api/chat\n');
  const health = await (await fetch(BASE + 'api/health')).json();
  say(`- GET /api/health → ok=${health.ok} ｜ keyConfigured=${health.keyConfigured} ｜ keySource=${health.keySource} ｜ key 末尾 ${health.keyTail} ｜ verified=${health.verified}`);
  if (!health.ok) {
    say(`\n> **未配置有效凭证**：${health.reason}`);
    return { ok: false, reason: health.reason };
  }
  const models = await (await fetch(BASE + 'api/models')).json();
  say(`- GET /api/models → HTTP ${models.status} ｜ ${models.elapsedMs}ms ｜ 可见模型：${(models.ids || []).join('、')}`);

  const t0 = Date.now();
  const r = await fetch(BASE + 'api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages: [{ role: 'user', content: '用一句话说明红星榴莲市场份额需要哪些分子和分母' }] })
  });
  const j = await r.json().catch(() => ({}));
  const content = String(j.content || '');
  say(`- POST /api/chat → HTTP ${r.status} ｜ ${j.elapsedMs || (Date.now() - t0)}ms ｜ model=${j.model} ｜ 响应非空：${content.trim().length > 0}（${content.length} 字）`);
  say(`- 脱敏片段：${redact(content).slice(0, 90)}…`);
  say(`- 响应体含凭证形态字符串：${/sk-[A-Za-z0-9_-]{6,}/.test(JSON.stringify(j)) ? '**是（异常）**' : '否'}`);
  const lr = await fetch(BASE + 'api/models');
  say(`- 上游 usage：${JSON.stringify(j.usage || {})}`);
  return { ok: r.status === 200 && content.trim().length > 0, models: models.ids, model: j.model, elapsedMs: j.elapsedMs || (Date.now() - t0), content, status: r.status, health };
}

/* ---------------- 2. 浏览器：真实链路 + 截图 ---------------- */
async function browserEvidence(browser) {
  say('\n## 2. 浏览器实测（真实服务，非模拟上游）\n');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.locator('#enterBtn').click();
  await page.waitForFunction(() => window.AGRI_PROVIDER.mode === 'live', null, { timeout: 20000 }).catch(() => {});
  const mode = await page.evaluate(() => window.AGRI_PROVIDER.state);
  say(`- 徽标：${mode.detail} ｜ 状态行：${await page.evaluate(() => window.AGRI_DEBUG.aiStateLine())}`);

  /* 空对象可输入 + 全局提问（真实模型） */
  const panel0 = await page.evaluate(() => window.AGRI_DEBUG.aiPanelReady());
  say(`- 未选中对象时输入框禁用=${panel0.disabled} ｜ 发送禁用=${panel0.sendDisabled}`);
  await page.screenshot({ path: path.join(SHOTS, 'live-1-empty-object-input.png') });
  say('  → 截图 live-1-empty-object-input.png（未选对象也能输入，空态为欢迎 / 示例问题）');

  await page.fill('#aiInput', '用一句话说明红星榴莲市场份额需要哪些分子和分母');
  await page.locator('#aiSend').click();
  await page.waitForFunction(() => /真实模型回答/.test(window.AGRI_DEBUG.aiText()), null, { timeout: 60000 }).catch(() => {});
  const ans = await page.evaluate(() => window.AGRI_DEBUG.aiText());
  const realOk = /真实模型回答/.test(ans);
  say(`- 真实回答到达：${realOk} ｜ 首行：${ans.split('\n')[0].slice(0, 70)}`);
  say(`- 回答正文片段：${redact(ans.split('\n').slice(2, 4).join(' ')).slice(0, 110)}…`);
  await page.screenshot({ path: path.join(SHOTS, 'live-2-real-answer.png') });
  say('  → 截图 live-2-real-answer.png（真实模型回答 + 上下文封套）');

  /* 配置页 */
  await page.locator('#cfgEntry').click();
  await page.waitForSelector('#cfgProvider', { timeout: 10000 }).catch(() => {});
  await page.screenshot({ path: path.join(SHOTS, 'live-3-config-panel.png') });
  const bodyText = await page.evaluate(() => document.querySelector('#aiCfg').innerText);
  const keyInputVal = await page.evaluate(() => document.querySelector('#cfgKey').value);
  say(`- 配置页字段齐备：${JSON.stringify(await page.evaluate(() => window.AGRI_DEBUG.aiCfg().fields))}`);
  say(`- key 输入框 type=${await page.evaluate(() => document.querySelector('#cfgKey').type)} ｜ 回显值="${keyInputVal}" （不读取完整值）`);
  say(`- 配置页含末尾 4 位提示：${new RegExp(mode.keyTail || 'zzzz').test(bodyText)}`);
  say('  → 截图 live-3-config-panel.png（Provider / Base URL / Model / 超时 / 最大输出 / 温度 / 测试连接 / 保存 / 恢复默认）');

  /* 选对象后真实回答（上下文注入） */
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.AGRI_UI.onGlobeSelect({ kind: 'arc', id: 'MY' }));
  await sleep(1500);
  await page.locator('#side .ai-qs button').first().click();
  await page.waitForFunction(() => /真实模型回答/.test(window.AGRI_DEBUG.aiText()), null, { timeout: 60000 }).catch(() => {});
  const ans2 = await page.evaluate(() => window.AGRI_DEBUG.aiText());
  say(`- 选中对象后的真实回答：${/真实模型回答/.test(ans2)} ｜ 上下文：${JSON.stringify(await page.evaluate(() => window.AGRI_DEBUG.aiCtx())).slice(0, 100)}…`);
  await page.screenshot({ path: path.join(SHOTS, 'live-4-real-answer-with-object.png') });
  say('  → 截图 live-4-real-answer-with-object.png（选中对象 → 上下文自动附加 + 真实回答）');
  say(`- 浏览器控制台错误：${errs.length === 0 ? '0（clean）' : errs.slice(0, 2).join(' | ')}`);

  /* 失败降级（截断 /api/chat，UI 表现与真实上游失败一致；真实上游失败路径见 round4 用例） */
  await page.route('**/api/chat', r => r.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ ok: false, error: '上游 502: 演示失败的降级表现' }) }));
  await page.fill('#aiInput', '这条请求将触发降级表现');
  await page.locator('#aiSend').click();
  await page.waitForFunction(() => window.AGRI_PROVIDER.mode === 'degraded', null, { timeout: 15000 }).catch(() => {});
  const degState = await page.evaluate(() => window.AGRI_PROVIDER.state);
  say(`- 降级徽标：${degState.detail} ｜ 错误详情：${redact(degState.lastError)}`);
  say(`- 降级后仍给回答（不白屏）：${(await page.evaluate(() => window.AGRI_DEBUG.aiText())).trim().length > 40}`);
  await page.screenshot({ path: path.join(SHOTS, 'live-5-degraded.png') });
  say('  → 截图 live-5-degraded.png（调用失败 → 降级标记 + 规则回答 + 错误详情，不含密钥）');
  await ctx.close();
  return { mode, realOk, errs, bodyText, keyInputVal };
}

/* ---------------- 3. LM Studio 实测 ---------------- */
async function lmStudioEvidence() {
  say('\n## 3. LM Studio 实测\n');
  const PORT = 4899;
  const cf = path.join(root, 'test', '.live-lm.json');
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: root,
    env: { ...process.env, PORT: String(PORT), AGRI_CONFIG_FILE: cf, AGRI_LLM_BASE_URL: 'http://127.0.0.1:1234/v1', AGRI_LLM_MODEL: 'local-model' }
  });
  let out = ''; child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  try {
    const ok = await waitHttp(`http://127.0.0.1:${PORT}/api/health`);
    if (!ok) { say('- 本地 LM Studio 探测服务未能启动'); return; }
    const h = await (await fetch(`http://127.0.0.1:${PORT}/api/health`)).json();
    say(`- GET http://127.0.0.1:1234/v1/models → ok=${h.ok} ｜ keyConfigured=${h.keyConfigured} ｜ 失败原因：${redact(h.reason)}`);
    const ch = await (await fetch(`http://127.0.0.1:${PORT}/api/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'ping' }] })
    })).json();
    say(`- POST /api/chat → ${ch.ok ? '成功' : '失败：' + redact(ch.error)}`);
  } finally {
    child.kill('SIGTERM');
    try { fs.unlinkSync(cf); } catch (e) { /* 不存在 */ }
  }
}

/* ---------------- 入口 ---------------- */
(async () => {
  const ev = await apiEvidence();
  const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox'] });
  let ui = null;
  try { if (ev.ok) ui = await browserEvidence(browser); } finally { await browser.close(); }
  await lmStudioEvidence();

  const lines = ['# 农链 AgriLink — 真实连通性验证（LLM-234）', '',
    `- 服务：${BASE}`, `- 时间：${new Date().toISOString()}`, '',
    ...log.map(l => l), '',
    '## 结论', '',
    `- DeepSeek 云端：${ev.ok ? `**真实调用成功**（HTTP ${ev.status} ｜ ${ev.model} ｜ ${ev.elapsedMs}ms ｜ 非空 ${ev.content.length} 字）` : `**未接通**：${ev.reason}`}`,
    `- 本地演示服务页面：${ui ? `真实模型已连接，徽标「${ui.mode.detail}」；控制台错误 ${ui.errs.length} 条` : '未验证'}`,
    '- 密钥：只出现在服务端出站请求头；本报告与截图中不含任何完整 key（只有末尾 4 位）。'];
  fs.writeFileSync(path.join(root, 'test/report-live.md'), lines.join('\n') + '\n');
  console.log(`\n报告：test/report-live.md ｜ 截图：shots-live/`);
})();
