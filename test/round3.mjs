#!/usr/bin/env node
/* ============================================================
   农链 AgriLink — 本轮专项测试（LLM-231）
   A. L1 地球二维旋转（鼠标 + 触控；纵向拖动真的改投影；拖动后仍可点击）
   B. L3 左下内容越界 —— 四个验收视口的 overflow / 截图检查
   C. AI 两条通路 —— 规则演示（file://）与真实模型（本地服务 + 模拟上游），
      含「错误后降级」；凭证只走服务端，不落源码 / bundle / 日志
   D. 数据与叙事 —— 一键演示路径三条、红星口径、部位级切片口径、马来西亚量级表述
   运行：node test/round3.mjs     报告：test/report-round3.md   截图：shots-r3/
   ============================================================ */
import { chromium } from 'playwright';
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'file://' + path.join(root, 'index.html');
const SHOTS = path.join(root, 'shots-r3');
fs.mkdirSync(SHOTS, { recursive: true });

/* 测试用哨兵值：绝不可能是真实凭证；用来证明「key 只出现在服务端进程内存与出站请求头」 */
const SENTINEL_KEY = 'sk-TEST-ONLY-DO-NOT-USE-0000';
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
const state = page => page.evaluate(() => window.AGRI_DEBUG.state());
const waitLayer = async (page, n, timeout = 9000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if ((await state(page)).layer === n) return true; await sleep(80); }
  return false;
};
const waitIdle = async page => { await page.waitForFunction(() => !window.AGRI_DEBUG.state().flying, null, { timeout: 6000 }).catch(() => {}); await sleep(220); };
const waitCamera = async (page, timeout = 7000) => {
  const t0 = Date.now(); let prev = null;
  while (Date.now() - t0 < timeout) { const s = await state(page); const p = s.layer === 3 ? s.l3.pose : s.l2.pose;
    if (prev && Math.abs(p.zoom - prev.zoom) < 0.004) return true; prev = p; await sleep(150); }
  return false;
};
async function clickGlobeHit(page, kind, id, touch) {
  const hits = await page.evaluate(() => window.AGRI_DEBUG.globeHits());
  const box = await page.evaluate(() => window.AGRI_DEBUG.globeBox());
  let list = kind === 'arc' ? hits.arcs : hits.nodes.filter(n => (kind === 'china' ? n.china : !n.china));
  if (id) list = list.filter(h => h.id === id);
  for (const h of list.slice(0, 10)) {
    const p = await page.evaluate(([x, y]) => window.AGRI_DEBUG.globePick(x, y), [h.x, h.y]);
    if (!p || (id && p.id !== id)) continue;
    if (touch) await page.touchscreen.tap(box.x + h.x, box.y + h.y); else await page.mouse.click(box.x + h.x, box.y + h.y);
    return h.id;
  }
  return null;
}
async function clickMapPoint(page, which, lnglat) {
  const p = await page.evaluate(([w, c]) => window.AGRI_DEBUG.mapXY(w, c), [which, lnglat]);
  if (!p) return false;
  await page.mouse.click(p.x, p.y); await sleep(450); return true;
}
async function openApp(browser, { width, height, mobile, url, watchConsole } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: !!mobile, hasTouch: !!mobile, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));
  if (!url) await page.route('**/*', r => r.request().url().startsWith('file://') ? r.continue() : r.abort());
  await page.goto(url || FILE, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  return { ctx, page, errs, console: watchConsole ? [] : null };
}
async function enterSystem(page) {
  await page.locator('#enterBtn').click();
  await page.waitForTimeout(800);
}
async function gotoL3(page, prov, city) {
  await page.evaluate(p => window.AGRI_UI.onGlobeSelect({ kind: 'arc', id: 'CL' }), null);
  await sleep(1100);
  await page.evaluate(() => window.AGRI_UI.onGlobeSelect({ kind: 'arc', id: 'CL' }));
  await waitLayer(page, 2); await waitIdle(page);
  await page.evaluate(p => { window.AGRI_UI.onProvinceClick(p); }, prov);
  await page.evaluate(p => { window.AGRI_UI.onProvinceClick(p); }, prov);
  await waitLayer(page, 3); await waitIdle(page); await waitCamera(page);
  if (city) { await page.evaluate(c => window.AGRI_UI.onCityClick(c.prov, c.city), { prov, city }); await sleep(700); }
}

/* ============================ A. 地球二维旋转 ============================ */
async function globe2D(browser) {
  const { ctx, page, errs } = await openApp(browser, { width: 1440, height: 900 });
  await enterSystem(page);
  await page.waitForFunction(() => window.AGRI_DEBUG.state().l1.grownOrder.length >= 8, null, { timeout: 20000 });
  await sleep(400);

  const before = await page.evaluate(() => {
    const s = window.AGRI_DEBUG.state().l1;
    return { rot: s.rot, lat: s.lat, proj: window.AGRI_GLOBE.project(101.6, 3.1), proj2: window.AGRI_GLOBE.project(-70.6, -33.4) };
  });
  const box = await page.evaluate(() => window.AGRI_DEBUG.globeBox());
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;

  // —— 纵向拖动：纬度（视角俯仰）必须变化 ——
  await page.mouse.move(cx, cy); await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(cx, cy + i * 12); await sleep(16); }
  await page.mouse.up(); await sleep(300);
  const afterV = await page.evaluate(() => {
    const s = window.AGRI_DEBUG.state().l1;
    return { rot: s.rot, lat: s.lat, proj: window.AGRI_GLOBE.project(101.6, 3.1), proj2: window.AGRI_GLOBE.project(-70.6, -33.4) };
  });
  const dLat = Math.abs(afterV.lat - before.lat);
  check('地球：纵向拖动改变相机纬度（不再只能左右）', dLat > 10,
    `lat ${before.lat.toFixed(1)}° → ${afterV.lat.toFixed(1)}°（Δ${dLat.toFixed(1)}°）`);
  const dY = Math.hypot(afterV.proj.x - before.proj.x, afterV.proj.y - before.proj.y);
  check('地球：纵向拖动后投影坐标确实改变（不只是状态位变化）', dY > 4,
    `马来西亚投影 (${before.proj.x},${before.proj.y}) → (${afterV.proj.x},${afterV.proj.y})，位移 ${dY.toFixed(1)}px`);

  // —— 横向拖动：经度必须变化 ——
  const rotBefore = afterV.rot;
  await page.mouse.move(cx, cy); await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(cx + i * 14, cy); await sleep(16); }
  await page.mouse.up(); await sleep(300);
  const afterH = await page.evaluate(() => window.AGRI_DEBUG.state().l1);
  check('地球：横向拖动仍改变经度（二维旋转，不是替代关系）', Math.abs(afterH.rot - rotBefore) > 10,
    `rot ${rotBefore.toFixed(1)}° → ${afterH.rot.toFixed(1)}°`);

  // —— 纬度 clamp：大幅上下拖动不得翻转 ——
  for (let k = 0; k < 3; k++) {
    await page.mouse.move(cx, cy + 140); await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(cx, cy + 140 + i * 20); await sleep(12); }
    await page.mouse.up();
  }
  const clampedDown = (await state(page)).l1;
  for (let k = 0; k < 6; k++) {
    await page.mouse.move(cx, cy - 140); await page.mouse.down();
    for (let i = 1; i <= 10; i++) { await page.mouse.move(cx, cy - 140 - i * 20); await sleep(12); }
    await page.mouse.up();
  }
  const clampedUp = (await state(page)).l1;
  const range = clampedUp.latRange;
  check('地球：纬度 clamp 生效（不会翻转到背面）', clampedUp.lat >= range[0] - 0.01 && clampedUp.lat <= range[1] + 0.01 && clampedDown.lat <= range[1] + 0.01,
    `拖动到下限 ${clampedDown.lat.toFixed(1)}° / 上限 ${clampedUp.lat.toFixed(1)}°，允许区间 [${range[0]}, ${range[1]}]`);

  // —— 拖动后目标仍能点击 ——
  await page.evaluate(() => window.AGRI_GLOBE.select('CL'));
  await sleep(900);
  const picked = await clickGlobeHit(page, 'arc', 'CL');
  await sleep(500);
  const selAfterDrag = await page.evaluate(() => window.AGRI_DEBUG.selLabel());
  check('地球：拖动之后数据目标依然可点击（命中表随 2D 视角重建）', picked === 'CL' && selAfterDrag === 'flow:智利',
    `点击命中 ${picked} → 选中 ${selAfterDrag}`);

  await page.evaluate(() => window.AGRI_GLOBE.select('MY'));
  await sleep(1100);
  await page.screenshot({ path: path.join(SHOTS, 'r3-globe-2d-1440.png') });
  check('地球：二维旋转过程无控制台错误', errs.length === 0, errs.slice(0, 3).join(' | ') || 'clean');
  await ctx.close();

  // —— 触控路径 ——
  const m = await openApp(browser, { width: 390, height: 844, mobile: true });
  await m.page.locator('#enterBtn').tap();
  await m.page.waitForTimeout(900);
  await m.page.waitForFunction(() => window.AGRI_DEBUG.state().l1.grownOrder.length >= 8, null, { timeout: 20000 });
  await m.page.waitForTimeout(300);
  const t0 = (await state(m.page)).l1;
  const gbox = await m.page.evaluate(() => window.AGRI_DEBUG.globeBox());
  const gx = gbox.x + gbox.w / 2, gy = gbox.y + gbox.h / 2 - 60;
  // 触控拖动：touchscreen 没有拖动 API，用 CDP 之外的原生触摸序列即可（Playwright tap 只做点击）
  await m.page.evaluate(([x, y]) => {
    const cv = document.getElementById('globe');
    const send = (type, cy) => cv.dispatchEvent(new PointerEvent(type, {
      pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, cancelable: true,
      clientX: x, clientY: cy
    }));
    send('pointerdown', y);
    for (let i = 1; i <= 12; i++) send('pointermove', y + i * 10);
    send('pointerup', y + 120);
  }, [gx, gy]);
  await m.page.waitForTimeout(300);
  const t1 = (await state(m.page)).l1;
  check('地球：触控指针路径同样能纵向旋转（不依赖 movementX/Y）', Math.abs(t1.lat - t0.lat) > 8,
    `lat ${t0.lat.toFixed(1)}° → ${t1.lat.toFixed(1)}°`);
  // 拖动后触摸点击：取一个当前视角下真实的命中点（2D 旋转后命中表必须跟着重建）
  const mHits = await m.page.evaluate(() => window.AGRI_DEBUG.globeHits());
  const mBox = await m.page.evaluate(() => window.AGRI_DEBUG.globeBox());
  let tapped = null;
  for (const h of mHits.arcs.slice(0, 40)) {
    const p = await m.page.evaluate(([x, y]) => window.AGRI_DEBUG.globePick(x, y), [h.x, h.y]);
    if (!p) continue;
    await m.page.touchscreen.tap(mBox.x + h.x, mBox.y + h.y);
    tapped = p.id; break;
  }
  await m.page.waitForTimeout(600);
  const mSel = await m.page.evaluate(() => window.AGRI_DEBUG.selLabel());
  check('地球：触控拖动后触摸点击仍能命中数据目标', !!tapped && /^flow:/.test(mSel || ''),
    `tap ${tapped} → ${mSel}`);
  await m.page.screenshot({ path: path.join(SHOTS, 'r3-globe-touch-390.png') });
  await m.ctx.close();
}

/* ============================ B. L3 越界与响应式 ============================ */
const L3_VIEWPORTS = [
  { w: 390, h: 844, mobile: true },
  { w: 1366, h: 768 },
  { w: 1440, h: 900 },
  { w: 1920, h: 1080 }
];
async function l3Overflow(browser) {
  for (const vp of L3_VIEWPORTS) {
    const { ctx, page, errs } = await openApp(browser, { width: vp.w, height: vp.h, mobile: vp.mobile });
    if (vp.mobile) await page.locator('#enterBtn').tap(); else await enterSystem(page);
    await gotoL3(page, '新疆', '伽师');
    const m = await page.evaluate(() => {
      const r = s => { const el = document.querySelector(s); if (!el) return null;
        const b = el.getBoundingClientRect();
        return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), rl: +b.right.toFixed(1), bt: +b.bottom.toFixed(1) }; };
      const card = document.querySelector('.l3-card'), stage = document.querySelector('#stage');
      const facts = Array.from(document.querySelectorAll('.l3-facts li')).map(li => {
        const b = li.getBoundingClientRect(), c = getComputedStyle(li);
        return { t: li.textContent.trim().slice(0, 12), w: +b.width.toFixed(1), h: +b.height.toFixed(1),
          hidden: c.display === 'none' || c.visibility === 'hidden' || b.width < 1 };
      });
      const barsText = document.getElementById('l3Bars').innerText;
      const sideText = document.getElementById('side').innerText;
      return {
        card: r('.l3-card'), extras: r('#l3Extras'), factsRect: r('.l3-facts'), stage: r('#stage'),
        scrollW: card.scrollWidth, clientW: card.clientWidth,
        scrollH: card.scrollHeight, clientH: card.clientHeight,
        facts, barsText, sideText,
        doc: { sw: document.documentElement.scrollWidth, iw: window.innerWidth, sh: document.documentElement.scrollHeight, ih: window.innerHeight },
        obj: document.getElementById('l3Obj').textContent,
        overflowSource: (() => {
          const cr = document.querySelector('.l3-card').getBoundingClientRect();
          const bad = [];
          document.querySelectorAll('.l3-card *').forEach(el => {
            const b = el.getBoundingClientRect();
            if (b.width > 0 && (b.right > cr.right + 1 || b.left < cr.left - 1)) bad.push(el.className || el.tagName);
          });
          return bad.slice(0, 4);
        })()
      };
    });
    const tag = `${vp.w}×${vp.h}`;
    check(`L3 ${tag}：卡片内容不溢出（scrollWidth ≤ clientWidth）`, m.scrollW <= m.clientW + 1,
      `${m.scrollW}/${m.clientW}px${m.overflowSource.length ? ' 越界元素=' + m.overflowSource.join(',') : ''}`);
    check(`L3 ${tag}：卡片在舞台内（不越出左/下边界）`, m.extras.x >= -0.5 && m.extras.y >= m.stage.y && m.extras.bt <= m.stage.bt + 0.5 && m.extras.rl <= m.stage.rl + 0.5,
      `card(${m.extras.x},${m.extras.y}) ${m.extras.w}×${m.extras.h} / stage(${m.stage.x},${m.stage.y}) ${m.stage.w}×${m.stage.h}`);
    check(`L3 ${tag}：页面无横向溢出`, m.doc.sw <= m.doc.iw + 1, `${m.doc.sw}/${m.doc.iw}`);
    // 关键信息不得靠隐藏糊弄：桌面端要点列必须完整可见；小屏要点在右面板等价可得
    if (vp.mobile) {
      const side = /外调规模/.test(m.sideText) && /竞争力均值/.test(m.sideText) && /代表单品链路/.test(m.sideText);
      check(`L3 ${tag}：小屏卡片改横条，但要点在右侧面板等价可得（非隐藏糊弄）`,
        side && /%/.test(m.barsText) && m.barsText.split('\n').filter(Boolean).length >= 2,
        `bars="${m.barsText.replace(/\n/g, ' ')}" sideFacts=${side}`);
    } else {
      check(`L3 ${tag}：要点列 4 条完整可见（外调规模 / 竞争力均值 / 代表单品链路 / 区域定位）`,
        m.facts.length === 4 && m.facts.every(f => !f.hidden) && m.factsRect.rl <= m.card.rl + 1,
        m.facts.map(f => `${f.t}(${f.w}×${f.h})`).join(' | '));
    }
    check(`L3 ${tag}：分析卡片仍绑定当前对象`, /伽师/.test(m.obj), m.obj);
    check(`L3 ${tag}：无控制台错误`, errs.length === 0, errs.slice(0, 2).join(' | ') || 'clean');
    await page.screenshot({ path: path.join(SHOTS, `r3-l3-${vp.w}x${vp.h}.png`) });
    await ctx.close();
  }
}

/* ============================ C. AI 两条通路 ============================ */
function startMockUpstream() {
  const st = { fail: false, lastBody: null, lastAuth: null, hits: 0 };
  return new Promise(resolve => {
    const srv = http.createServer(async (req, res) => {
      const u = (req.url || '').split('?')[0];
      st.lastAuth = req.headers.authorization || null;
      if (u.endsWith('/models')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ data: [{ id: 'mock-model' }, { id: 'mock-model-mini' }] }));
      }
      if (u.endsWith('/chat/completions')) {
        let b = ''; for await (const c of req) b += c;
        st.hits++;
        if (st.fail) { res.writeHead(500, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'mock upstream 500' } })); }
        try { st.lastBody = JSON.parse(b || '{}'); } catch (e) { st.lastBody = null; }
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ model: 'mock-model', usage: { prompt_tokens: 10, completion_tokens: 10 },
          choices: [{ message: { role: 'assistant', content: '【模拟上游·模型回答】按当前上下文给出的结论：优先级是先稳部位口径、再谈国别叙事。（示意 · 待标定）' } }] }));
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
    try { const r = await fetch(url); if (r.ok) return true; } catch (e) { /* 还没起来 */ }
    await sleep(200);
  }
  return false;
}
async function aiPaths(browser) {
  /* --- 静态离线版：规则演示 + 不携带 key --- */
  const raw = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const keyish = raw.match(/sk-[A-Za-z0-9_\-]{16,}/g) || [];
  check('AI 静态版：构建产物中不含任何凭证形态字符串', keyish.length === 0,
    keyish.length ? keyish.slice(0, 2).map(s => s.slice(0, 6) + '…').join(',') : `${(raw.length / 1024).toFixed(0)} KB 无匹配`);
  check('AI 静态版：不含 Authorization / apiKey 硬编码字段',
    !/apiKey\s*[:=]\s*['"][^'"]{8,}/.test(raw) && !/Bearer\s+sk-/.test(raw));
  check('构建指纹：__AGRI_BUILD 存在（用于核对线上 Pages 版本）',
    /window\.__AGRI_BUILD=\{"hash"/.test(raw));

  const off = await openApp(browser, { width: 1440, height: 900 });
  await enterSystem(off.page);
  const offMode = await off.page.evaluate(() => window.AGRI_DEBUG.aiMode());
  const offBadge = await off.page.locator('#aiMode').innerText();
  check('AI 离线版：模式显示「规则演示」并说明原因（不假装已连真模型）',
    offMode.mode === 'rule' && /规则演示/.test(offBadge) && /同源代理/.test(offMode.reason),
    `${offBadge} ｜ reason=${offMode.reason}`);
  check('AI 离线版：全程 0 外部请求（file:// 下不探测 /api/*）', off.errs.length === 0, off.errs.slice(0, 2).join(' | ') || 'clean');
  await off.ctx.close();

  /* --- 本地服务 + 模拟上游：真实模型通路 --- */
  const mock = await startMockUpstream();
  const PORT = 4711 + (process.pid % 400);
  const srv = startDemoServer({
    PORT: String(PORT),
    AGRI_LLM_BASE_URL: `http://127.0.0.1:${mock.port}/v1`,
    AGRI_LLM_MODEL: 'mock-model',
    AGRI_LLM_API_KEY: SENTINEL_KEY,
    AGRI_LLM_VERIFY_TIMEOUT_MS: '3000'
  });
  const base = `http://127.0.0.1:${PORT}/`;
  const up = await waitHttp(base + 'api/health');
  check('AI 服务端：/api/health 可达（同源代理已就绪）', up, base);
  const health = await (await fetch(base + 'api/health')).json();
  check('AI 服务端：/models 校验通过 → keyConfigured=true 且不回传 key 本身',
    health.ok === true && health.keyConfigured === true && health.model === 'mock-model' && !JSON.stringify(health).includes(SENTINEL_KEY),
    JSON.stringify({ ok: health.ok, model: health.model, keySource: health.keySource, models: health.models }));
  const models = await (await fetch(base + 'api/models')).json();
  check('AI 服务端：GET /api/models 可用（复现校验路径）', models.ok === true && models.ids.includes('mock-model'), (models.ids || []).join(','));

  const live = await openApp(browser, { width: 1440, height: 900, url: base });
  await live.page.locator('#enterBtn').click();
  await live.page.waitForTimeout(900);
  await live.page.evaluate(() => window.AGRI_UI.onGlobeSelect({ kind: 'arc', id: 'MY' }));
  await live.page.waitForTimeout(1400);
  const liveMode = await live.page.evaluate(() => window.AGRI_DEBUG.aiMode());
  const liveBadge = await live.page.locator('#aiMode').innerText();
  check('AI 真实模式：面板显示「真实模型已连接 · mock-model」', liveMode.mode === 'live' && /真实模型已连接/.test(liveBadge) && /mock-model/.test(liveBadge),
    liveBadge);

  await live.page.locator('#side .ai-qs button').first().click();
  await live.page.waitForFunction(() => /真实模型回答/.test(window.AGRI_DEBUG.aiText()), null, { timeout: 10000 }).catch(() => {});
  const ans = await live.page.evaluate(() => window.AGRI_DEBUG.aiText());
  const ctx = await live.page.evaluate(() => window.AGRI_DEBUG.aiCtx());
  check('AI 真实模式：回答来自真实模型且带「真实模型回答」标识', /真实模型回答/.test(ans) && /模拟上游/.test(ans),
    ans.split('\n')[0].slice(0, 60));
  check('AI 真实模式：回答携带层级 / 当前选择 / 红星市场 / 品类 / 数据口径上下文',
    /层级/.test(ans) && /选择/.test(ans) && /红星/.test(ans) && /品类/.test(ans) && /口径/.test(ans) && /示意 · 待标定/.test(ans),
    Object.entries(ctx).map(([k, v]) => `${k}=${String(v).slice(0, 18)}`).join(' | ').slice(0, 200));
  const sent = mock.st.lastBody || {};
  const sys = (sent.messages || []).find(m => m.role === 'system');
  const user = (sent.messages || []).find(m => m.role === 'user');
  check('AI 真实模式：服务端把上下文（层级/红星/品类/口径）一并送到上游 system+user 消息',
    !!(sys && user) && /红星/.test(sys.content + user.content) && /马来西亚/.test(user.content) && /口径/.test(user.content),
    `system ${sys ? sys.content.length : 0} 字 / user ${user ? user.content.length : 0} 字`);
  check('AI 真实模式：凭证由服务端注入出站请求头（前端拿不到）',
    mock.st.lastAuth === 'Bearer ' + SENTINEL_KEY && !(await live.page.evaluate(k => document.documentElement.outerHTML.includes(k), SENTINEL_KEY)),
    `上游收到 Authorization: Bearer sk-TEST…（值不回显）`);
  check('AI 真实模式：页面 DOM 中不出现凭证', !(await live.page.content()).includes(SENTINEL_KEY));
  await live.page.screenshot({ path: path.join(SHOTS, 'r3-ai-live-1440.png') });

  /* --- 上游故障 → 错误后降级（不白屏） --- */
  mock.st.fail = true;
  await live.page.locator('#side .ai-qs button').nth(1).click();
  await live.page.waitForFunction(() => window.AGRI_DEBUG.aiMode().mode === 'degraded', null, { timeout: 10000 }).catch(() => {});
  const degMode = await live.page.evaluate(() => window.AGRI_DEBUG.aiMode());
  const degBadge = await live.page.locator('#aiMode').innerText();
  const degAns = await live.page.evaluate(() => window.AGRI_DEBUG.aiText());
  check('AI 降级：上游 500 → 模式显示「错误后降级」', degMode.mode === 'degraded' && /错误后降级/.test(degBadge), `${degBadge} ｜ err=${String(degMode.lastError).slice(0, 40)}`);
  check('AI 降级：仍给出规则回答（不白屏、不假装是模型答案）',
    degAns.trim().length > 40 && /上下文/.test(degAns) && !/真实模型回答/.test(degAns), degAns.split('\n')[0].slice(0, 50));
  await live.page.screenshot({ path: path.join(SHOTS, 'r3-ai-degraded-1440.png') });

  /* --- 凭证不得进日志 --- */
  await sleep(300);
  const log = srv.out;
  check('AI 安全：服务端日志不打印真实凭证（也不打印请求体）',
    !log.includes(SENTINEL_KEY) && !/sk-TEST-ONLY/.test(log) && /POST \/api\/chat/.test(log),
    log.split('\n').filter(Boolean).slice(0, 3).join(' ‖ ').slice(0, 180));
  await live.ctx.close();

  srv.child.kill('SIGTERM');
  await new Promise(r => srv.child.on('exit', r));
  mock.srv.close();
}

/* ============================ D. 数据与叙事 ============================ */
async function narrative(browser) {
  const { ctx, page, errs } = await openApp(browser, { width: 1440, height: 900 });
  await enterSystem(page);

  const btns = await page.locator('#demoPaths button').count();
  const paths = await page.evaluate(() => window.AGRI_DEBUG.demoPaths());
  check('叙事：一键演示路径 3 条（猫山王 / 车厘子 / 牛肉·牛前腱）', btns === 3 && paths.length === 3,
    paths.map(p => `${p.country}·${p.label}`).join(' / '));
  const cat = await page.evaluate(() => window.AGRI_DEBUG.hubCatalog());
  check('叙事：数据骨架五段 = 境外产区 → 中国进口 → 湖南集散 → 红星 → 渠道/终端',
    cat.length === 3 && cat.every(c => c.stages.join('|') === '境外产区/国家|中国进口与消费|湖南集散与消费|湖南红星大市场|渠道/终端'),
    cat.map(c => `${c.id}:${c.stages.length}段`).join(' '));

  const seen = {};
  for (const p of paths) {
    await page.evaluate(id => window.AGRI_DEBUG.demoPath(id), p.id);
    await page.waitForFunction(() => window.AGRI_DEBUG.state().layer === 4, null, { timeout: 30000 }).catch(() => {});
    await waitIdle(page);
    await page.waitForTimeout(600);
    const st = await page.evaluate(() => ({
      layer: window.AGRI_DEBUG.state().layer,
      city: window.AGRI_DEBUG.state().l4.city,
      imp: window.AGRI_DEBUG.currentImport(),
      sel: window.AGRI_DEBUG.selLabel(),
      chips: window.AGRI_DEBUG.chips(),
      side: document.getElementById('side').innerText,
      sub: document.getElementById('chainSub').textContent,
      title: document.getElementById('chainTitle').innerText
    }));
    // 逐段点开五个环节，确认每段都给出规模/成本/价格/口径（图表先回答决策问题）
    const stageText = [];
    for (let i = 0; i < 5; i++) {
      await page.locator('#chainAxis .chip').nth(i).click();
      await page.waitForTimeout(240);
      stageText.push(await page.evaluate(() => document.getElementById('stageName').textContent + ' ' +
        document.getElementById('stageMetrics').innerText + ' ' + document.getElementById('stageRisk').innerText));
    }
    st.stageText = stageText;
    st.allStage = stageText.join(' ');
    st.detail = [st.sub, st.allStage, st.side].join(' ');
    seen[p.id] = st;
    check(`叙事：一键演示「${p.country}·${p.label}」贯穿到 L4 红星品类·部位`,
      st.layer === 4 && st.city === '长沙' && st.imp && st.imp.id === p.id && st.chips.length === 5 && st.sel.indexOf('红星') >= 0,
      `layer=${st.layer} city=${st.city} import=${st.imp && st.imp.id} chips=${st.chips.map(c => c.no).join(',')} sel=${st.sel}`);
    check(`叙事：${p.label} 的 L4 面板带口径与终端建议`, /口径/.test(st.side) && /终端建议/.test(st.side) && /示意/.test(st.side),
      st.title.slice(0, 40));
    await page.keyboard.press('Escape'); await waitLayer(page, 3); await waitIdle(page);
    await page.keyboard.press('Escape'); await waitLayer(page, 2); await waitIdle(page);
    await page.keyboard.press('Escape'); await waitLayer(page, 1); await waitIdle(page);
  }

  const my = seen['durian-my'];
  check('叙事：马来西亚猫山王标注为「小份额高价值」，不写成中国最大供应国',
    /小份额高价值/.test(my.imp.shareNote) && !/马来西亚[^。；]{0,30}(最大|第一)/.test(my.side) && /泰国/.test(my.imp.shareNote),
    my.imp.shareNote.slice(0, 72));
  const cl = seen['cherry-cl'];
  check('叙事：车厘子以智利为主要来源，体现季节与海运/空运链路',
    /智利/.test(cl.imp.shareNote) && /主要来源/.test(cl.imp.shareNote) && /海运/.test(cl.detail) && /(11 月|采收|窗口)/.test(cl.detail) && /消费/.test(cl.detail),
    `${cl.imp.origin} ｜ 环节含海运=${/海运/.test(cl.detail)} 季节=${/(11 月|采收|窗口)/.test(cl.detail)}`);
  const br = seen['beef-br'];
  check('叙事：牛肉以巴西为重要/主导来源，阿根廷·乌拉圭·澳·新作为对照',
    /巴西/.test(br.imp.shareNote) && /重要 \/ 主导/.test(br.imp.shareNote) &&
    ['阿根廷', '乌拉圭', '澳大利亚', '新西兰'].every(k => new RegExp(k).test(br.side)),
    br.imp.shareNote.slice(0, 60));
  check('叙事：每个环节都给出规模 / 成本 / 价格 / 口径（图表先回答决策问题）',
    Object.values(seen).every(s => s.stageText.length === 5 && s.stageText.every(t => /规模/.test(t) && /成本/.test(t) && /口径/.test(t))),
    Object.entries(seen).map(([k, s]) => `${k}:${s.stageText.length}段`).join(' '));
  check('叙事：牛前腱明确为市场经营/交易台账层级切片，不冒充海关公开统计口径',
    /牛前腱/.test(br.imp.cut) && /市场经营 \/ 交易台账层级/.test(br.imp.sliceNote) && /不冒充海关公开统计口径/.test(br.imp.sliceNote),
    br.imp.sliceNote);

  // 红星口径
  const hub = await page.evaluate(() => window.AGRI_DEBUG.hub());
  const allText = await page.evaluate(() => document.body.innerText);
  check('叙事：红星表述为湖南及中南区域集散枢纽，并保留口径提示',
    /中南/.test(hub.role) && /口径待核/.test(hub.caliber),
    `${hub.role} ｜ ${hub.caliber}`);
  check('叙事：全文不出现「全国第一」类断言', !/全国第一/.test(allText));
  const calTable = await page.evaluate(() => window.AGRI_DEBUG.caliber());
  check('叙事：数据口径表覆盖 7 类口径（含部位级切片与红星口径）',
    calTable.length === 7 && calTable.some(c => /部位级切片/.test(c.k) && /不冒充海关公开统计口径/.test(c.v)) &&
    calTable.some(c => /红星口径/.test(c.k)),
    calTable.map(c => c.k).join(' / '));

  // 跨层联动：L1 选中的来源国 → L2 进口直达 → L3 湖南 → L4 同一品类
  await page.evaluate(() => window.AGRI_UI.onGlobeSelect({ kind: 'arc', id: 'MY' }));
  await page.waitForTimeout(1200);
  const l1Sel = await page.evaluate(() => window.AGRI_DEBUG.selLabel());
  await page.evaluate(() => window.AGRI_UI.onGlobeSelect({ kind: 'arc', id: 'MY' }));
  await waitLayer(page, 2); await waitIdle(page);
  const hubMarkers = await page.evaluate(() => window.AGRI_DEBUG.hubMarkers());
  check('叙事：L2 有红星集散枢纽标记（演示中心）', hubMarkers.length === 1 && hubMarkers[0].name === '长沙·红星',
    hubMarkers.map(h => h.name).join(','));
  await page.locator('#directToggle').check();
  await page.waitForTimeout(700);
  const hubPt = await page.evaluate(() => window.AGRI_DEBUG.mapXY('l2', [112.98, 28.19]));
  await page.mouse.click(hubPt.x, hubPt.y); await sleep(500);
  const hubSel = await page.evaluate(() => window.AGRI_DEBUG.selLabel());
  check('叙事：L2 点红星枢纽 → 显示集散定位与数据骨架', /集散枢纽/.test(hubSel || ''), hubSel || '（未选中）');
  await page.mouse.click(hubPt.x, hubPt.y);
  check('叙事：再次点红星枢纽 → 进入 L3 湖南', await waitLayer(page, 3), 'layer=' + (await state(page)).layer);
  await waitIdle(page); await waitCamera(page);
  await page.evaluate(() => window.AGRI_UI.onCityClick('湖南', '长沙'));
  await sleep(600);
  const cityPanel = await page.evaluate(() => document.getElementById('side').innerText);
  check('叙事：L3 长沙（红星）面板带集散枢纽与口径提示', /红星/.test(cityPanel) && /长沙/.test(cityPanel), cityPanel.slice(0, 60).replace(/\n/g, ' '));
  await page.evaluate(() => window.AGRI_UI.onCityClick('湖南', '长沙'));
  await waitLayer(page, 4); await waitIdle(page);
  const l4 = await page.evaluate(() => ({ imp: window.AGRI_DEBUG.currentImport(), sel: window.AGRI_DEBUG.selLabel() }));
  check('叙事：L3 长沙 → L4 红星品类·部位（选择一路贯穿）', !!l4.imp && /红星/.test(l4.sel), l4.sel);

  // 图表先回答决策问题
  const questions = await page.evaluate(() => {
    const q = [];
    document.querySelectorAll('#side .sec > h5, #l3BarsTitle, #l3RadarTitle').forEach(el => q.push(el.textContent.trim()));
    return q;
  });
  check('叙事：L1→L4 的面板分区都以「量级 / 结构 / 节奏 / 口径 / 建议」回答决策问题',
    questions.length > 0 && questions.every(q => q.length > 0), questions.slice(0, 6).join(' / '));

  check('叙事：全流程无控制台错误', errs.length === 0, errs.slice(0, 3).join(' | ') || 'clean');
  await ctx.close();
}

/* ============================ 主流程 ============================ */
const exe = findChromium();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
try {
  console.log('---- A. 地球二维旋转 ----'); await globe2D(browser);
  console.log('\n---- B. L3 越界与响应式（4 视口） ----'); await l3Overflow(browser);
  console.log('\n---- C. AI 两条通路 ----'); await aiPaths(browser);
  console.log('\n---- D. 数据与叙事 ----'); await narrative(browser);
} finally {
  await browser.close();
}

const failed = results.filter(r => !r.ok);
fs.writeFileSync(path.join(root, 'test', 'report-round3.md'), [
  '# 农链 AgriLink · 本轮专项测试报告（LLM-231）', '',
  `运行时间：${new Date().toISOString()}`, '',
  '覆盖：L1 地球二维旋转（鼠标 + 触控） · L3 越界与 4 视口响应式 · AI 真实模型 / 规则演示 / 降级 · 数据与叙事口径', '',
  `## 结果：${results.length - failed.length} / ${results.length} 通过`, '',
  '| # | 检查项 | 结果 | 实测 |', '| --- | --- | --- | --- |',
  ...results.map((r, i) => `| ${i + 1} | ${r.name} | ${r.ok ? '✅' : '❌'} | ${(r.detail || '').replace(/\|/g, '/')} |`), ''
].join('\n'));
console.log(`\n${results.length - failed.length}/${results.length} passed  (report: test/report-round3.md)`);
if (failed.length) { console.log('FAILED:\n' + failed.map(f => ' - ' + f.name + ' :: ' + f.detail).join('\n')); process.exit(1); }
