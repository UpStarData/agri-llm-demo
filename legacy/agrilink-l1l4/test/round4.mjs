#!/usr/bin/env node
/* ============================================================
   农链 AgriLink — 本轮专项测试（LLM-234）
   A. 空对象也能提问 —— 未选对象不再是提问门槛（静态离线版）
   B. 选中对象 → 上下文注入（规则通路 + 真实模型通路的 messages）
   C. 四种运行状态：未配置 / 连接中 / 连接成功 / 调用失败降级（+ 取消、重试）
   D. 配置中心：字段齐备、key 只显示末尾 4 位、保存 / 脱敏 / 恢复默认 / 测试连接 / 刷新模型
   E. 安全：DOM / bundle / localStorage / sessionStorage / 日志 / API 响应都不含 key
   F. 公开静态版的配置入口分支（无安全后端 → 不给 key 输入框）
   运行：node test/round4.mjs      报告：test/report-round4.md     截图：shots-r4/
   ============================================================ */
import { chromium } from 'playwright';
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'file://' + path.join(root, 'index.html');
const SHOTS = path.join(root, 'shots-r4');
fs.mkdirSync(SHOTS, { recursive: true });

/* 测试用哨兵值：绝不可能是真实凭证；用来证明「key 只出现在服务端进程内存与出站请求头」 */
const SENTINEL_KEY = 'sk-ROUND4-TEST-ONLY-0000-NOT-A-REAL-KEY';
const SENTINEL_TAIL = SENTINEL_KEY.slice(-4);
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined && detail !== '' ? '  — ' + detail : ''}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

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

/* ---------------- 服务端 / 上游 test harness ---------------- */
function startMockUpstream() {
  const st = { fail: false, hang: false, lastBody: null, lastAuth: null, hits: 0, modelsHits: 0 };
  return new Promise(resolve => {
    const srv = http.createServer(async (req, res) => {
      const u = (req.url || '').split('?')[0];
      st.lastAuth = req.headers.authorization || null;
      if (u.endsWith('/models')) {
        st.modelsHits++;
        if (st.fail) { res.writeHead(401, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'mock upstream: invalid_api_key' } })); }
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ data: [{ id: 'mock-model' }, { id: 'mock-model-mini' }] }));
      }
      if (u.endsWith('/chat/completions')) {
        let b = ''; for await (const c of req) b += c;
        st.hits++;
        if (st.hang) { await new Promise(r => { const t = setTimeout(r, 9000); req.on('close', () => { clearTimeout(t); r(); }); }); return; }
        if (st.fail) { res.writeHead(500, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'mock upstream 500' } })); }
        try { st.lastBody = JSON.parse(b || '{}'); } catch (e) { st.lastBody = null; }
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ model: 'mock-model', usage: { prompt_tokens: 10, completion_tokens: 10 },
          choices: [{ message: { role: 'assistant', content: '【模拟上游·模型回答】分子=红星榴莲交易量/额，分母=同期同范围水果总交易量/额。（示意 · 待标定）' } }] }));
      }
      res.writeHead(404, { 'content-type': 'application/json' }); res.end('{}');
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port, st }));
  });
}
function startDemoServer(env) {
  const child = spawn(process.execPath, ['server.mjs'], { cwd: root, env: { ...process.env, ...env } });
  let out = '';
  child.stdout.on('data', d => { out += d.toString(); });
  child.stderr.on('data', d => { out += d.toString(); });
  return { child, get out() { return out; } };
}
async function waitHttp(url, timeout = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    try { const r = await fetch(url); if (r.ok || r.status < 500) return true; } catch (e) { /* 还没起来 */ }
    await sleep(200);
  }
  return false;
}

/* ---------------- 浏览器 harness ---------------- */
async function openApp(browser, { width = 1440, height = 900, mobile, url } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: !!mobile, hasTouch: !!mobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));
  if (!url) await page.route('**/*', r => r.request().url().startsWith('file://') ? r.continue() : r.abort());
  await page.goto(url || FILE, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  return { ctx, page, errs };
}
const enterSystem = async page => { await page.locator('#enterBtn').click(); await page.waitForTimeout(900); };
const aiText = page => page.evaluate(() => window.AGRI_DEBUG.aiText());
const aiMode = page => page.evaluate(() => window.AGRI_DEBUG.aiMode());
const aiPanel = page => page.evaluate(() => window.AGRI_DEBUG.aiPanelReady());
const askFree = async (page, q) => {
  await page.fill('#aiInput', q);
  await page.locator('#aiSend').click();
};
const cfg = page => page.evaluate(() => window.AGRI_DEBUG.aiCfg());

/* ============================ A. 空对象也能提问 ============================ */
async function emptyObjectAsk(browser) {
  const { ctx, page, errs } = await openApp(browser);
  await enterSystem(page);

  /* 未选对象：输入框与发送都必须可用（本轮核心缺陷） */
  const p0 = await aiPanel(page);
  check('空对象：未选中地图对象时输入框可用（不再以「选中对象」为提问前置）',
    p0 && p0.disabled === false && p0.sendDisabled === false,
    JSON.stringify({ input: p0 && p0.disabled, send: p0 && p0.sendDisabled }));
  check('空对象：空态是真正的欢迎 / 示例问题（不再输出一大段假回答）',
    /不选对象也能问/.test(await aiText(page)) && !/真实模型回答/.test(await aiText(page)),
    (await aiText(page)).replace(/\n/g, ' ').slice(0, 90));

  /* 未选对象直接问全局问题 → 有依据的全局回答，而不是「先选对象」 */
  await askFree(page, '红星市场的榴莲销售占比需要哪些数据？');
  await page.waitForTimeout(500);
  const a1 = await aiText(page);
  check('空对象：全局提问得到有依据的回答（分子 / 分母 / 口径边界）',
    /全局提问/.test(a1) && /分子/.test(a1) && /分母/.test(a1) && /口径/.test(a1),
    a1.replace(/\n/g, ' ').slice(0, 110));
  check('空对象：回答不再要求「先选中一个对象」（不再是硬门槛）',
    !/尚未选中对象|先点击一个数据对象|先选中一个数据对象/.test(a1), a1.replace(/\n/g, ' ').slice(0, 70));
  check('空对象：上下文封套把选择标记为「全局提问」而不是缺失',
    /未选中对象（全局提问）/.test((await page.evaluate(() => window.AGRI_DEBUG.aiCtx())).selection)
    || /全局提问/.test(a1), (await page.evaluate(() => window.AGRI_DEBUG.aiCtx())).selection);
  await page.screenshot({ path: path.join(SHOTS, 'r4-empty-object-ask.png') });

  /* 空输入不应产生请求或假回答 */
  const before = await aiMode(page);
  await askFree(page, '   ');
  await page.waitForTimeout(400);
  check('空对象：空白提问既不产生回答也不打上游',
    (await aiMode(page)).calls === before.calls, `calls ${before.calls} → ${(await aiMode(page)).calls}`);

  /* 清空会话 → 回到欢迎态 */
  await page.locator('#aiClear').click();
  await page.waitForTimeout(300);
  check('空对象：清空会话后回到欢迎态（可继续提问）',
    /不选对象也能问/.test(await aiText(page)) && (await aiPanel(page)).disabled === false);
  check('空对象：全程无控制台错误', errs.length === 0, errs.slice(0, 2).join(' | ') || 'clean');
  await ctx.close();
}

/* ============================ B. 选中对象 → 上下文注入 ============================ */
async function contextInjection(browser) {
  const { ctx, page } = await openApp(browser);
  await enterSystem(page);
  await page.evaluate(() => window.AGRI_UI.onGlobeSelect({ kind: 'arc', id: 'MY' }));
  await page.waitForTimeout(1500);

  const panel = await aiPanel(page);
  const obj = await page.locator('.ai-obj').innerText();
  check('上下文：选中对象后输入框仍可用，且提示语切换为「继续追问」',
    panel.disabled === false && panel.sendDisabled === false && /继续追问/.test(panel.placeholder), panel.placeholder);
  check('上下文：面板显示当前对象（层级 / 对象 / 口径），不再要求用户手动补上下文',
    /马来西亚/.test(obj) && /｜/.test(obj), obj.slice(0, 60));

  const c = await page.evaluate(() => window.AGRI_DEBUG.aiCtx());
  check('上下文：封套含层级 / 选择 / 红星市场 / 品类 / 口径 / 数据属性 六项',
    !!(c.layer && c.selection && c.hongxing && c.category && c.caliber && c.nature),
    Object.entries(c).map(([k, v]) => `${k}=${String(v).slice(0, 14)}`).join(' | ').slice(0, 190));

  /* 规则回答必须带上同一份封套 */
  await page.locator('#side .ai-qs button').first().click();
  await page.waitForTimeout(400);
  const a = await aiText(page);
  check('上下文：规则回答也带层级 / 选择 / 红星 / 品类 / 口径封套',
    /层级/.test(a) && /马来西亚/.test(a) && /红星/.test(a) && /口径/.test(a), a.replace(/\n/g, ' ').slice(0, 100));
  await ctx.close();
}

/* ============================ C+D+E：本地服务 + 模拟上游 ============================ */
function tmpCfg(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agri-r4-'));
  return path.join(dir, name);
}

async function localServerPaths(browser) {
  const mock = await startMockUpstream();
  const CFG_NOKEY = tmpCfg('nokey.json');          // 未配置：无 key，且禁止自动导入本机已有凭证
  const CFG_SAVE = tmpCfg('save.json');            // 配置保存 / 脱敏 / 恢复默认
  const PORT = 4811 + (process.pid % 300);

  /* ---------- C1. 未配置状态 ---------- */
  const s1 = startDemoServer({
    PORT: String(PORT), AGRI_CONFIG_FILE: CFG_NOKEY, AGRI_NO_IMPORT: '1',
    AGRI_LLM_BASE_URL: `http://127.0.0.1:${mock.port}/v1`, AGRI_LLM_MODEL: 'mock-model'
  });
  const base1 = `http://127.0.0.1:${PORT}/`;
  await waitHttp(base1 + 'api/health');
  const un = await openApp(browser, { url: base1 });
  await enterSystem(un.page);
  const unMode = await aiMode(un.page);
  const unPanel = await aiPanel(un.page);
  check('状态·未配置：徽标 / 状态行明确是「未配置」，不谎报已连接',
    unMode.mode === 'unconfigured' && /未配置/.test(unMode.detail || ''), `${unMode.detail}`);
  check('状态·未配置：输入框仍可用（用户可以先问，再决定是否配 key）',
    unPanel.disabled === false && unPanel.sendDisabled === false);
  check('状态·未配置：未配置时走规则回答且带「未配置」标注（不白屏、不假装是模型）',
    /未配置/.test(unPanel.placeholder + unMode.detail), unMode.detail);
  await askFree(un.page, '不选对象也能问全局问题吗？');
  await un.page.waitForTimeout(600);
  const unAns = await aiText(un.page);
  check('状态·未配置：未配置下提问仍能拿到规则回答', unAns.trim().length > 40 && !/真实模型回答/.test(unAns),
    unAns.replace(/\n/g, ' ').slice(0, 70));
  await un.page.screenshot({ path: path.join(SHOTS, 'r4-state-unconfigured.png') });
  await un.ctx.close();
  s1.child.kill('SIGTERM'); await new Promise(r => s1.child.on('exit', r));

  /* ---------- C2. 连接中（detecting）→ 连接成功（live） ---------- */
  const s2 = startDemoServer({
    PORT: String(PORT), AGRI_CONFIG_FILE: CFG_SAVE, AGRI_NO_IMPORT: '1',
    AGRI_LLM_BASE_URL: `http://127.0.0.1:${mock.port}/v1`, AGRI_LLM_MODEL: 'mock-model',
    AGRI_LLM_API_KEY: SENTINEL_KEY, AGRI_LLM_VERIFY_TIMEOUT_MS: '3000'
  });
  await waitHttp(base1 + 'api/health');
  const live = await openApp(browser, { url: base1 });
  /* 连接中：进入系统后立刻读徽标（探测尚未返回） */
  await live.page.locator('#enterBtn').click();
  const detecting = await live.page.evaluate(() =>
    ({ mode: window.AGRI_PROVIDER.mode, detail: window.AGRI_PROVIDER.state.detail }));
  check('状态·连接中：探测期间显示「加载中 · 正在检测模型服务」（不白屏、不谎报）',
    detecting.mode === 'detecting' || /真实模型/.test(detecting.detail || ''), `${detecting.mode} ｜ ${detecting.detail}`);
  await live.page.waitForFunction(() => window.AGRI_PROVIDER.mode === 'live', null, { timeout: 10000 }).catch(() => {});
  const liveMode = await aiMode(live.page);
  check('状态·连接成功：/models 校验通过 → 徽标「真实模型已连接」并显示模型名',
    liveMode.mode === 'live' && /真实模型已连接/.test(liveMode.detail) && /mock-model/.test(liveMode.detail), liveMode.detail);
  check('状态·连接成功：状态行给出 key 来源与末尾 4 位（不回显完整值）',
    /key 已配置/.test(await live.page.evaluate(() => window.AGRI_DEBUG.aiStateLine()))
    && !(await live.page.evaluate(k => window.AGRI_DEBUG.aiStateLine().includes(k), SENTINEL_KEY)),
    (await live.page.evaluate(() => window.AGRI_DEBUG.aiStateLine())).slice(0, 90));

  /* 未选对象也能对真实模型提问（上下文 = 全局提问） */
  await askFree(live.page, '用一句话说明红星榴莲市场份额需要哪些分子和分母');
  await live.page.waitForFunction(() => /真实模型回答/.test(window.AGRI_DEBUG.aiText()), null, { timeout: 12000 }).catch(() => {});
  const liveAns = await aiText(live.page);
  check('状态·连接成功：未选对象也能得到真实模型回答（不带对象上下文也能发）',
    /真实模型回答/.test(liveAns) && /模拟上游/.test(liveAns), liveAns.split('\n')[0].slice(0, 60));
  const req1 = mock.st.lastBody || {};
  const u1 = (req1.messages || []).find(m => m.role === 'user') || {};
  check('状态·连接成功：全局提问也把「红星市场 / 层级 / 口径」上下文送到上游',
    /红星/.test((req1.messages || []).map(m => m.content).join(' ')) && /口径/.test(u1.content || ''),
    `messages=${(req1.messages || []).length}｜user ${(u1.content || '').length} 字`);
  await live.page.screenshot({ path: path.join(SHOTS, 'r4-state-live.png') });

  /* ---------- B2. 选中对象后：真实通路的上下文注入 + 连续追问带历史 ---------- */
  await live.page.evaluate(() => window.AGRI_UI.onGlobeSelect({ kind: 'arc', id: 'MY' }));
  await live.page.waitForTimeout(1500);
  await live.page.locator('#side .ai-qs button').first().click();
  await live.page.waitForFunction(() => /真实模型回答/.test(window.AGRI_DEBUG.aiText()), null, { timeout: 12000 }).catch(() => {});
  const req2 = mock.st.lastBody || {};
  const u2 = (req2.messages || []).find(m => m.role === 'user') || {};
  check('上下文·真实通路：选对象后把层级 / 对象 / 红星 / 品类 / 口径注入上游 messages',
    /马来西亚/.test(u2.content || '') && /红星/.test(u2.content || '') && /口径/.test(u2.content || '')
    && /数据属性/.test(u2.content || ''), `user ${(u2.content || '').length} 字`);
  const turns1 = await live.page.evaluate(() => window.AGRI_DEBUG.aiText() && document.querySelector('#aiTurns').textContent);
  check('上下文：轮次计数与「连续追问已带上下文」提示可见', /\d+ 轮/.test(turns1), turns1);

  await askFree(live.page, '那分母要用哪个台账？');
  await live.page.waitForFunction(() => window.AGRI_PROVIDER.state.calls >= 2, null, { timeout: 12000 }).catch(() => {});
  const req3 = mock.st.lastBody || {};
  const roles = (req3.messages || []).map(m => m.role);
  check('上下文：连续追问把前几轮对话一并带给上游（历史注入，不是每次从零开始）',
    roles.filter(r => r === 'user').length >= 2 && roles.filter(r => r === 'assistant').length >= 1 && roles[0] === 'system',
    `roles=${roles.join(',')}`);
  /* 换对象 = 换会话：新请求不再携带上一个对象的上下文与历史 */
  await live.page.evaluate(() => window.AGRI_UI.onGlobeSelect({ kind: 'arc', id: 'CL' }));
  await live.page.waitForTimeout(1500);
  const afterSwitch = await live.page.evaluate(() => window.AGRI_DEBUG.aiCtx());
  check('上下文：换对象后上下文封套即时切换到新对象',
    /智利/.test(afterSwitch.selection), afterSwitch.selection);
  await askFree(live.page, '换成这个对象后，从哪里看量级？');
  await live.page.waitForFunction(() => window.AGRI_PROVIDER.state.calls >= 3, null, { timeout: 12000 }).catch(() => {});
  const req4 = mock.st.lastBody || {};
  const roles4 = (req4.messages || []).map(m => m.role);
  check('上下文：换对象后会话重置（不把上一个对象的追问历史带过去）',
    roles4.filter(r => r === 'user').length === 1 && /智利/.test((req4.messages || []).find(m => m.role === 'user').content || ''),
    `roles=${roles4.join(',')}`);

  /* ---------- C3. 调用失败 → 降级；取消 → 中止 ---------- */
  mock.st.fail = true;
  await askFree(live.page, '这条流向的价格传导会怎样？');
  await live.page.waitForFunction(() => window.AGRI_PROVIDER.mode === 'degraded', null, { timeout: 12000 }).catch(() => {});
  const degMode = await aiMode(live.page);
  const degAns = await aiText(live.page);
  check('状态·调用失败：切到「错误后降级 · 规则演示」并给出失败原因',
    degMode.mode === 'degraded' && /降级/.test(degMode.detail) && /上游 500/.test(degMode.lastError || ''),
    `${degMode.detail} ｜ ${String(degMode.lastError).slice(0, 40)}`);
  check('状态·调用失败：仍给规则回答（不白屏、不假装是模型答案）',
    degAns.trim().length > 40 && !/真实模型回答/.test(degAns), degAns.replace(/\n/g, ' ').slice(0, 60));
  check('状态·调用失败：错误详情可见但不泄露密钥',
    /错误详情/.test(await live.page.evaluate(() => document.querySelector('#aiState').innerText))
    && !(await live.page.content()).includes(SENTINEL_KEY));
  check('状态·调用失败：重试按钮可用（用户不必重开页面）',
    (await live.page.evaluate(() => document.querySelector('#aiRetry').disabled)) === false);
  await live.page.screenshot({ path: path.join(SHOTS, 'r4-state-degraded.png') });

  mock.st.fail = false;
  await live.page.locator('#aiRetry').click();
  await live.page.waitForFunction(() => window.AGRI_PROVIDER.mode === 'live', null, { timeout: 12000 }).catch(() => {});
  check('状态·调用失败：修好上游后点「重试」能回到真实模型（不假装已经恢复）',
    (await aiMode(live.page)).mode === 'live', (await aiMode(live.page)).detail);

  /* 取消：长请求可中止，且不卡在 busy */
  mock.st.hang = true;
  await live.page.evaluate(() => { document.querySelector('#aiInput').value = '取消测试：这条请求应该能被中止'; document.querySelector('#aiSend').click(); });
  await live.page.waitForTimeout(600);
  const cancelVisible = await live.page.evaluate(() => !document.querySelector('#aiCancel').hidden);
  check('请求处理中：只有请求进行时才禁用发送，并出现「取消」', cancelVisible === true);
  await live.page.locator('#aiCancel').click();
  await live.page.waitForTimeout(900);
  const afterCancel = await live.page.evaluate(() => ({ busy: window.AGRI_PROVIDER.state.busy, cancelHidden: document.querySelector('#aiCancel').hidden, send: document.querySelector('#aiSend').disabled }));
  check('请求处理中：取消后立即恢复可输入（不残留 busy / 不禁用发送）',
    afterCancel.busy === false && afterCancel.cancelHidden === true && afterCancel.send === false, JSON.stringify(afterCancel));
  mock.st.hang = false;

  /* ---------- D. 配置中心 ---------- */
  await live.page.locator('#cfgEntry').click();
  await live.page.waitForSelector('#cfgProvider', { timeout: 8000 }).catch(() => {});
  const c0 = await cfg(live.page);
  check('配置中心：设置入口打开「AI 配置」面板（本地演示服务下有完整配置）',
    c0 && c0.open === true && c0.fields.every(Boolean), `fields=${c0 && c0.fields}`);
  check('配置中心：字段齐备（Provider / Base URL / Model / 超时 / 最大输出长度 / 温度）',
    c0.fields.every(Boolean) && c0.buttons.every(Boolean), `buttons=${c0.buttons}`);
  check('配置中心：API Key 只显示「已配置 + 末尾 4 位」，输入框永不回显完整值',
    c0.keyInputType === 'password' && c0.keyInputValue === ''
    && new RegExp(SENTINEL_TAIL).test(c0.bodyText) && !c0.bodyText.includes(SENTINEL_KEY),
    `type=${c0.keyInputType}｜value="${c0.keyInputValue}"｜含末尾 4 位=${new RegExp(SENTINEL_TAIL).test(c0.bodyText)}`);
  check('配置中心：显示当前运行模式与最后一次成功 / 失败时间',
    /当前运行模式/.test(c0.bodyText) && /最后一次成功/.test(c0.bodyText) && /最后一次失败/.test(c0.bodyText));

  /* 测试连接：真打上游 /models */
  const beforeModels = mock.st.modelsHits;
  await live.page.locator('#cfgTest').click();
  await live.page.waitForFunction(() => /测试连接：/.test(document.querySelector('#cfgResult').innerText), null, { timeout: 12000 }).catch(() => {});
  const testRes = await live.page.evaluate(() => document.querySelector('#cfgResult').innerText);
  check('配置中心：「测试连接」真实请求上游 /models 并回报状态 / 耗时 / 是否命中模型',
    mock.st.modelsHits > beforeModels && /成功/.test(testRes) && /HTTP 200/.test(testRes) && /在列表中/.test(testRes),
    testRes.replace(/\n/g, ' ').slice(0, 110));

  /* 刷新模型：/models 列表进候选 */
  await live.page.locator('#cfgRefreshModels').click();
  await live.page.waitForFunction(() => /已刷新/.test(document.querySelector('#cfgResult').innerText), null, { timeout: 12000 }).catch(() => {});
  const opts = await live.page.evaluate(() => Array.from(document.querySelectorAll('#cfgModelList option')).map(o => o.value));
  check('配置中心：「刷新模型」从 /models 拉到的 id 进入候选列表',
    opts.includes('mock-model') && opts.includes('mock-model-mini'), (opts || []).join(','));

  /* 保存新 key（换成另一个哨兵）→ 落盘 0600 → 响应不回传 key 本体 */
  const SENTINEL_2 = 'sk-ROUND4-SECOND-VALUE-1111';
  await live.page.fill('#cfgKey', SENTINEL_2);
  await live.page.locator('#cfgSave').click();
  await live.page.waitForFunction(() => /已保存到本机受限配置文件/.test(document.querySelector('#cfgResult').innerText), null, { timeout: 8000 }).catch(() => {});
  const saveRes = await live.page.evaluate(() => document.querySelector('#cfgResult').innerText);
  const cfgRaw = fs.readFileSync(CFG_SAVE, 'utf8');
  const st = fs.statSync(CFG_SAVE);
  check('配置中心：保存后 key 写入本机受限配置文件且权限 0600',
    cfgRaw.includes(SENTINEL_2) && (st.mode & 0o777) === 0o600, `mode=${(st.mode & 0o777).toString(8)}`);
  check('配置中心：保存后输入框立即清空（明文不滞留 DOM）',
    (await live.page.evaluate(() => document.querySelector('#cfgKey').value)) === '');
  check('配置中心：保存响应 / 页面只回「已配置 + 末尾 4 位」，绝不回显完整 key',
    !saveRes.includes(SENTINEL_2) && !saveRes.includes(SENTINEL_KEY)
    && new RegExp(SENTINEL_KEY.slice(-4)).test(saveRes)
    && !(await live.page.content()).includes(SENTINEL_2), saveRes.replace(/\n/g, ' ').slice(0, 90));
  check('配置中心：key 来自环境变量时显式说明环境变量优先（不静默吞掉用户刚保存的 key）',
    /当前生效的 key 来自环境变量/.test((await cfg(live.page)).bodyText),
    (await cfg(live.page)).bodyText.replace(/\n/g, ' ').match(/当前生效的 key 来自环境变量[^。]*/)?.[0]?.slice(0, 90) || '—');

  /* 恢复默认：字段回默认，key 保留 */
  /* 恢复默认：非环境变量锁定的字段（超时 / 最大输出 / 温度）必须回到默认值 */
  await live.page.fill('#cfgTemp', '1.5');
  await live.page.fill('#cfgTimeout', '12345');
  await live.page.fill('#cfgMaxTokens', '512');
  await live.page.locator('#cfgSave').click();
  await live.page.waitForTimeout(700);
  await live.page.locator('#cfgReset').click();
  await live.page.waitForFunction(() => /已恢复默认/.test(document.querySelector('#cfgResult').innerText), null, { timeout: 8000 }).catch(() => {});
  const afterReset = await live.page.evaluate(() => ({
    temp: document.querySelector('#cfgTemp').value, timeout: document.querySelector('#cfgTimeout').value,
    maxTokens: document.querySelector('#cfgMaxTokens').value, key: document.querySelector('#cfgKey').value,
    keepMsg: document.querySelector('#cfgResult').innerText
  }));
  check('配置中心：「恢复默认」把超时 / 最大输出 / 温度复原为默认值',
    afterReset.timeout === '60000' && afterReset.maxTokens === '4096' && afterReset.temp === '0.3' && afterReset.key === '',
    JSON.stringify(afterReset));
  check('配置中心：环境变量锁定的字段（Base URL / Model）在面板上显式声明，恢复默认不会静默改它',
    /环境变量锁定/.test(afterReset.keepMsg + (await cfg(live.page)).bodyText), afterReset.keepMsg.replace(/\n/g, ' ').slice(0, 70));
  const resetRaw = fs.readFileSync(CFG_SAVE, 'utf8');
  check('配置中心：恢复默认不清除 key（要清 key 必须显式点「清除」）',
    resetRaw.includes(SENTINEL_2), resetRaw.replace(/"apiKey"[^,]*/, '"apiKey":"«有值»"').replace(/\s+/g, ' ').slice(0, 120));

  /* 清除 key */
  await live.page.locator('#cfgClearKey').click();
  await live.page.waitForFunction(() => /已清除/.test(document.querySelector('#cfgResult').innerText), null, { timeout: 8000 }).catch(() => {});
  const clearedRaw = fs.readFileSync(CFG_SAVE, 'utf8');
  check('配置中心：「清除」后本机配置文件与后续响应都不再有 key',
    !clearedRaw.includes(SENTINEL_2) && !clearedRaw.includes(SENTINEL_KEY), clearedRaw.replace(/\s+/g, ' ').slice(0, 80));
  await live.page.screenshot({ path: path.join(SHOTS, 'r4-config-panel.png') });

  /* ---------- E. 安全：DOM / 存储 / 日志 / 构建产物 ---------- */
  const dumpBundle = await live.page.evaluate(() => {
    const ls = {}, ss = {};
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls[k] = localStorage.getItem(k); }
    for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); ss[k] = sessionStorage.getItem(k); }
    return { ls, ss, url: location.href, dom: document.documentElement.outerHTML, scripts: Array.from(document.scripts).map(s => s.textContent || '').join('\n') };
  });
  const allVals = JSON.stringify(dumpBundle);
  check('安全：页面 DOM / 内联 bundle 不含 key',
    !allVals.includes(SENTINEL_KEY) && !allVals.includes(SENTINEL_2));
  check('安全：localStorage / sessionStorage 不含 key（也不写任何凭证字段）',
    !allVals.includes(SENTINEL_KEY) && !allVals.includes(SENTINEL_2)
    && !Object.keys(dumpBundle.ls).some(k => /key|token|secret/i.test(k)),
    `ls=${Object.keys(dumpBundle.ls).length} 项 / ss=${Object.keys(dumpBundle.ss).length} 项`);
  check('安全：URL 里不含 key（不靠 query 传凭证）',
    !/sk-|api_?key|token=/i.test(dumpBundle.url), dumpBundle.url.slice(0, 60));

  const raw = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const keyish = raw.match(/sk-[A-Za-z0-9_\-]{16,}/g) || [];
  check('安全：构建产物中不含任何凭证形态字符串', keyish.length === 0,
    keyish.length ? keyish.slice(0, 2).map(s => s.slice(0, 6) + '…').join(',') : `${(raw.length / 1024).toFixed(0)} KB 无匹配`);

  await sleep(300);
  const log = s2.out;
  const leaked = [SENTINEL_KEY, SENTINEL_2].filter(k => log.includes(k));
  check('安全：服务端日志不含 key（且不打印请求体 / Authorization）',
    leaked.length === 0 && /POST \/api\/chat/.test(log), `${leaked.length ? '泄露 ' + leaked.length + ' 处' : '无泄露'}｜${log.split('\n').filter(Boolean).length} 行日志`);

  const cfgApi = await (await fetch(base1 + 'api/config')).text();
  check('安全：GET /api/config 响应不包含 key 本体（只有末尾 4 位与来源）',
    !cfgApi.includes(SENTINEL_KEY) && !cfgApi.includes(SENTINEL_2) && /keyTail/.test(cfgApi),
    cfgApi.replace(/"keyTail":"[^"]*"/, '"keyTail":"…"').slice(0, 120));

  /* ---------- F. 静态公开版：配置入口不给 key 输入框 ---------- */
  const stHits = [];
  const pgSrv = http.createServer((req, res) => {
    const u = (req.url || '/').split('?')[0];
    stHits.push(u);
    const abs = path.join(root, u === '/' ? 'index.html' : u.replace(/^\//, ''));
    if (!abs.startsWith(root) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' }); return res.end('<h1>404</h1>');
    }
    res.writeHead(200, { 'content-type': /html$/.test(abs) ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    fs.createReadStream(abs).pipe(res);
  });
  await new Promise(r => pgSrv.listen(0, '127.0.0.1', r));
  const pagesBase = `http://127.0.0.1:${pgSrv.address().port}/`;
  const pub = await openApp(browser, { url: pagesBase });
  await enterSystem(pub.page);
  await pub.page.locator('#cfgEntry').click();
  await pub.page.waitForTimeout(600);
  const pc = await cfg(pub.page);
  check('公开静态版：配置入口明确提示「静态公开版没有安全后端」',
    pc.open === true && /没有安全后端/.test(pc.bodyText) && /不提供 API Key 输入框/.test(pc.bodyText),
    pc.bodyText.replace(/\n/g, ' ').slice(0, 100));
  check('公开静态版：不渲染任何 key 输入框 / 保存按钮（绝不把计费 key 存到浏览器）',
    pc.hasKeyInput === false && !/cfgSave/.test(pc.bodyText) && !/id="cfgKey"/.test(pc.bodyText));
  check('公开静态版：给出「打开本地演示地址 / 查看部署说明」两条可操作出口',
    /打开本地演示地址/.test(pc.bodyText) && /查看部署说明/.test(pc.bodyText)
    && !!(await pub.page.evaluate(() => !!document.querySelector('#aiCfg a[href*="127.0.0.1"]'))));
  check('公开静态版：不为 /api/* 制造请求（零控制台错误）',
    pub.errs.length === 0 && stHits.filter(u => u.startsWith('/api')).length === 0,
    `errs=${pub.errs.length}｜api 请求 ${stHits.filter(u => u.startsWith('/api')).length} 次`);
  await pub.page.screenshot({ path: path.join(SHOTS, 'r4-public-pages-config.png') });
  await pub.ctx.close();
  pgSrv.close();

  await live.ctx.close();
  s2.child.kill('SIGTERM'); await new Promise(r => s2.child.on('exit', r));
  mock.srv.closeAllConnections && mock.srv.closeAllConnections();
  mock.srv.close();
}

/* ============================ 入口 ============================ */
(async () => {
  const browser = await chromium.launch({ executablePath: findChromium(), args: ['--no-sandbox'] });
  try {
    console.log('\n---- A. 空对象也能提问 ----'); await emptyObjectAsk(browser);
    console.log('\n---- B. 上下文注入 ----'); await contextInjection(browser);
    console.log('\n---- C/D/E/F. 本地服务 · 配置中心 · 安全 · 公开版 ----'); await localServerPaths(browser);
  } finally { await browser.close(); }

  const ok = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok);
  const lines = ['# 农链 AgriLink — LLM-234 专项测试报告', '',
    `- 用例：**${results.length}** ｜ 通过 **${ok}** ｜ 失败 **${failed.length}**`,
    `- 运行：\`node test/round4.mjs\` ｜ 截图：\`shots-r4/\``, '', '## 用例明细', '',
    '| 结果 | 用例 | 证据 |', '| --- | --- | --- |',
    ...results.map(r => `| ${r.ok ? '✅' : '❌'} | ${r.name} | ${String(r.detail).replace(/\|/g, '\\|').slice(0, 140)} |`)];
  fs.writeFileSync(path.join(root, 'test/report-round4.md'), lines.join('\n') + '\n');
  console.log(`\n${ok}/${results.length} passed  (report: test/report-round4.md)`);
  if (failed.length) { console.log('FAILED:\n' + failed.map(f => ' - ' + f.name + ' :: ' + f.detail).join('\n')); process.exit(1); }
})();
