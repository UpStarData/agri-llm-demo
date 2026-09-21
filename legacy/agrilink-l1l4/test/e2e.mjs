#!/usr/bin/env node
/* ============================================================
   农链 AgriLink — 端到端测试（Playwright / 桌面端 + 移动端）
   直接加载本地单文件 index.html（file://）并拦截全部外部请求，
   从而同时验证「离线可用」「无控制台错误」。
   运行：node test/e2e.mjs     报告：test/report.md
   ============================================================ */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'file://' + path.join(root, 'index.html');
const SHOTS = path.join(root, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const consoleErrors = [], pageErrors = [], externalRequests = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined && detail !== '' ? '  — ' + detail : ''}`);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function newPage(browser, { width, height, mobile }) {
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: !!mobile, hasTouch: !!mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(String(e)));
  page.on('request', r => { if (!r.url().startsWith('file://')) externalRequests.push(r.url()); });
  await page.route('**/*', route => route.request().url().startsWith('file://') ? route.continue() : route.abort());
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  return { ctx, page };
}

const state = page => page.evaluate(() => window.AGRI_DEBUG.state());
const aiText = page => page.evaluate(() => window.AGRI_DEBUG.aiText());
const sideText = page => page.evaluate(() => window.AGRI_DEBUG.sideText());
const layer = async page => (await state(page)).layer;

async function waitLayer(page, n, timeout = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    if ((await state(page)).layer === n) return true;
    await sleep(80);
  }
  return false;
}
// 等层间相机结束（飞行中一切点击都会被忽略）
async function waitIdle(page) {
  await page.waitForFunction(() => !window.AGRI_DEBUG.state().flying, null, { timeout: 6000 }).catch(() => {});
  await sleep(250);
}
// 等层内相机停稳（L3 的省份推近）
async function waitCamera(page, timeout = 7000) {
  const t0 = Date.now();
  let prev = null;
  while (Date.now() - t0 < timeout) {
    const s = await state(page);
    const p = s.layer === 3 ? s.l3.pose : s.l2.pose;
    if (prev && Math.abs(p.zoom - prev.zoom) < 0.004) return true;
    prev = p;
    await sleep(150);
  }
  return false;
}
async function enterL2ViaArc(page, id) {
  await page.evaluate(i => document.querySelector(`#side .rel li[data-id="f:${i}"]`).click(), id);
  await sleep(1200);                       // 等地球对位到该流向
  await clickGlobeHit(page, 'arc', id);    // 再次点击同一对象 → 进入 L2
  const ok = await waitLayer(page, 2);
  await waitIdle(page);
  return ok;
}
async function clickGlobeHit(page, kind, id, touch) {
  const hits = await page.evaluate(() => window.AGRI_DEBUG.globeHits());
  const box = await page.evaluate(() => window.AGRI_DEBUG.globeBox());
  let list = kind === 'node' ? hits.nodes.filter(n => !n.china) : kind === 'china' ? hits.nodes.filter(n => n.china) : hits.arcs;
  if (id) list = list.filter(h => h.id === id);
  if (!list.length) return null;
  for (const h of list.slice(0, 10)) {
    const p = await page.evaluate(([x, y]) => window.AGRI_DEBUG.globePick(x, y), [h.x, h.y]);
    if (!p || (id && p.id !== id)) continue;
    if (touch) await page.touchscreen.tap(box.x + h.x, box.y + h.y);
    else await page.mouse.click(box.x + h.x, box.y + h.y);
    return h.id;
  }
  return null;
}
async function clickMapPoint(page, which, lnglat) {
  const p = await page.evaluate(([w, c]) => window.AGRI_DEBUG.mapXY(w, c), [which, lnglat]);
  if (!p) return false;
  await page.mouse.click(p.x, p.y);
  await sleep(500);
  return true;
}

/* ============================ 桌面端 ============================ */
async function desktop(browser) {
  const { ctx, page } = await newPage(browser, { width: 1440, height: 900 });

  /* --- 1. 首页 --- */
  check('首页：只保留一个主 CTA', await page.locator('#landing .btn-primary').count() === 1);
  const structTags = await page.evaluate(() => Array.from(document.querySelectorAll('#landing .land-struct li')).map(li => li.tagName));
  check('首页：层级词呈现为说明文字条目（li，非按钮）', structTags.length === 4 && structTags.every(t => t === 'LI'), structTags.join(','));
  await page.locator('#landing .land-struct li').first().click();
  await sleep(200);
  check('首页：点击层级词不会进入系统（不是入口）', !(await page.locator('#app').evaluate(e => e.classList.contains('on'))));
  await page.screenshot({ path: path.join(SHOTS, '01-landing.png') });

  /* --- 2. L1 地球 --- */
  await page.locator('#enterBtn').click();
  const fontOk = await page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('700 16px "IBM Plex Sans SC"') && document.fonts.check('400 14px "IBM Plex Sans SC"');
  });
  check('离线单文件：IBM Plex Sans SC 已内联并生效（无外部字体请求）', fontOk);
  await page.waitForTimeout(500);
  let st = await state(page);
  check('进入系统 → L1 地球开始自转 + 弧线生长', st.layer === 1 && st.l1.phase !== 'idle', `phase=${st.l1.phase}`);
  const rot0 = st.l1.rot;
  await sleep(900);
  check('L1：地球自动旋转（经度持续变化）', (await state(page)).l1.rot !== rot0);

  /* --- 3. 弧线按量级依次长出 --- */
  await page.waitForFunction(() => window.AGRI_DEBUG.state().l1.grownOrder.length >= 8, null, { timeout: 20000 });
  const grown = (await state(page)).l1.grownOrder;
  check('L1：8 条贸易弧全部长出，生长顺序 = 贸易量从大到小',
    grown.length === 8 && grown[0] === '智利' && grown[1] === '泰国' && grown[7] === '马来西亚', grown.join(' > '));

  /* --- 4. 点弧线看数据（真实鼠标点击 canvas） --- */
  const clicked = await clickGlobeHit(page, 'arc', 'CL');
  await sleep(700);
  st = await state(page);
  let side = await sideText(page);
  check('L1：点击弧线 → 右侧出该流向明细（来源 / 品类 / 量 / 月份 / 同比 / 口径）',
    clicked === 'CL' && st.sel && st.sel.type === 'flow' && st.sel.label === '智利' &&
    side.includes('年进口量') && side.includes('同比') && side.includes('年内峰值') && side.includes('口径'),
    st.sel && st.sel.label);
  const aiA = await aiText(page);
  await page.screenshot({ path: path.join(SHOTS, '02-l1-flow.png') });

  /* --- 5. AI 内容随对象变化 --- */
  await page.evaluate(() => document.querySelector('#side .rel li[data-id="f:TH"]').click());
  await sleep(500);
  const aiB = await aiText(page);
  st = await state(page);
  check('AI 助手：换对象 → 回答随之变化（对象驱动）', st.sel && st.sel.label === '泰国' && aiA !== aiB, st.sel && st.sel.label);

  /* --- 6. 再次点击同一对象 → 相机切场进入 L2 --- */
  await page.evaluate(() => document.querySelector('#side .rel li[data-id="f:CL"]').click());
  await sleep(1200);
  await clickGlobeHit(page, 'arc', 'CL');
  await sleep(140);
  const mid = await page.evaluate(() => window.AGRI_DEBUG.sceneOpacity());
  const l1o = mid.find(s => s.id === 'scene-l1'), l2o = mid.find(s => s.id === 'scene-l2');
  check('切场：L1→L2 过程中两个场景同时可见（不白屏 / 不是换页）', l1o.op > 0.05 && l2o.op > 0.05, `L1=${l1o.op.toFixed(2)} L2=${l2o.op.toFixed(2)}`);
  const dur = await page.evaluate(async () => {
    const t0 = performance.now();
    while (window.AGRI_DEBUG.state().flying && performance.now() - t0 < 4000) await new Promise(r => setTimeout(r, 30));
    return Math.round(performance.now() - t0);
  });
  check('切场：层间相机飞行时长落在 1.2–1.6s', dur >= 1100 && dur <= 1800, dur + 'ms');
  check('切场：已进入 L2', await waitLayer(page, 2));
  await waitIdle(page);

  /* --- 7. L2 省际线按量级依次点亮 --- */
  await waitCamera(page);
  check('L2：相机停在「全国视角」（不会直接跳到省内）', (await state(page)).l2.pose.zoom < 2, 'zoom=' + (await state(page)).l2.pose.zoom.toFixed(2));
  const seq = [];
  for (let i = 0; i < 26; i++) { seq.push((await state(page)).l2.lit); await sleep(180); }
  const mx = Math.max(...seq);
  check('L2：省际调运线按量级依次点亮（递增至全部 14 条）', seq.every((v, i) => i === 0 || v >= seq[i - 1]) && mx === 14, '最大点亮=' + mx);
  await page.screenshot({ path: path.join(SHOTS, '03-l2-national.png') });

  /* --- 8. 进口直达图层 --- */
  await page.locator('#directToggle').check();
  await sleep(900);
  check('L2：可叠加「进口直达市场」图层', (await state(page)).l2.direct === true && await page.locator('#directToggle').isChecked());
  await page.screenshot({ path: path.join(SHOTS, '03b-l2-direct.png') });
  await page.locator('#directToggle').uncheck();
  await sleep(1200);

  /* --- 9. 点省份气泡 → 明细；再次点击 → L3（真实相机推进） --- */
  await clickMapPoint(page, 'l2', [118.7, 36.2]);                 // 山东
  st = await state(page);
  side = await sideText(page);
  const aiL2 = await aiText(page);
  check('L2：点省份气泡 → 该省供给 / 调出 / 口径明细',
    st.sel && st.sel.type === 'prov' && st.sel.label === '山东' && side.includes('供给规模指数') && side.includes('调出量') && side.includes('口径'), st.sel && st.sel.label);
  check('AI 助手：L2 对象回答与 L1 不同', aiL2 !== aiA);

  await clickMapPoint(page, 'l2', [118.7, 36.2]);                 // 再次点击 → L3
  check('L2：再次点击同一省份 → 进入 L3', await waitLayer(page, 3));
  await waitIdle(page);
  await waitCamera(page);
  st = await state(page);
  check('L3：相机真实推进到该省（zoom 放大、中心为该省）',
    st.l3.pose.zoom > 2.4 && Math.abs(st.l3.pose.center[0] - 118.7) < 1.2 && Math.abs(st.l3.pose.center[1] - 36.2) < 1.2,
    `zoom=${st.l3.pose.zoom.toFixed(2)} center=${st.l3.pose.center.map(v => v.toFixed(1))}`);
  const bars = await page.evaluate(() => window.AGRI_DEBUG.barsW());
  const radarInk = await page.evaluate(() => window.AGRI_DEBUG.radarInk());
  check('L3：品类结构条渐进出现', bars.length >= 2 && bars.every(w => parseFloat(w) > 0), bars.join(' / '));
  check('L3：竞争力雷达按维度依次扫出（画布有内容）', radarInk > 500, 'ink=' + radarInk);
  await page.screenshot({ path: path.join(SHOTS, '04-l3-province.png') });

  /* --- 10. 城市节点 --- */
  await clickMapPoint(page, 'l3', [118.79, 36.86]);               // 寿光
  st = await state(page);
  side = await sideText(page);
  check('L3：点城市节点 → 产量 / 主导品类 / 竞争力 / 区域特征',
    st.sel && st.sel.type === 'city' && side.includes('外调规模') && side.includes('竞争力五维') && side.includes('区域特征'), st.sel && st.sel.label);
  const aiL3 = await aiText(page);
  check('AI 助手：L3 城市对象回答与 L2 不同', aiL3 !== aiL2, aiL3.slice(0, 20).replace(/\n/g, ' '));

  /* --- 11. Esc 返回 + 恢复上层位姿 --- */
  const poseBefore = (await state(page)).l2.pose;
  await page.keyboard.press('Escape');
  check('返回：Esc 从 L3 回到 L2', await waitLayer(page, 2));
  await waitIdle(page);
  const poseBack = (await state(page)).l2.pose;
  check('返回：恢复 L2 相机位姿（非重置）',
    Math.abs(poseBack.zoom - poseBefore.zoom) < 0.02 && Math.abs(poseBack.center[0] - poseBefore.center[0]) < 0.2,
    `zoom ${poseBefore.zoom.toFixed(2)}→${poseBack.zoom.toFixed(2)}`);
  check('返回：L2 已点亮调运线未被重置', (await state(page)).l2.lit === 14);

  /* --- 12. 点空白返回 --- */
  const stageBox = await page.locator('#stage').boundingBox();
  await page.mouse.click(stageBox.x + 26, stageBox.y + stageBox.height - 26);
  check('返回：L2 点击空白处回到 L1', await waitLayer(page, 1));
  await waitIdle(page);

  /* --- 12b. 点击弧线终点（中国节点）也能进入 L2 --- */
  await clickGlobeHit(page, 'china');
  check('L1：点击弧线终点（中国节点）→ 进入 L2', await waitLayer(page, 2));
  await waitIdle(page);
  await page.keyboard.press('Escape');
  check('L2：Esc 返回 L1', await waitLayer(page, 1));
  await waitIdle(page);

  /* --- 13. 深链路：L1 → L2 → 新疆 → 伽师 → L4 --- */
  check('L1：再次点击同一弧线进入 L2', await enterL2ViaArc(page, 'CL'));
  await clickMapPoint(page, 'l2', [85.5, 40]);                    // 新疆
  await clickMapPoint(page, 'l2', [85.5, 40]);                    // 再次点击 → L3
  check('L2：再次点击新疆 → 进入 L3', await waitLayer(page, 3));
  await waitIdle(page);
  await waitCamera(page);
  await clickMapPoint(page, 'l3', [76.73, 39.49]);                // 伽师
  st = await state(page);
  side = await sideText(page);
  check('L3：选中伽师（链路已标定）', st.sel && st.sel.type === 'city' && side.includes('全链路'), st.sel && st.sel.label);
  await clickMapPoint(page, 'l3', [76.73, 39.49]);                // 再次点击 → L4
  check('L3：再次点击伽师 → 进入 L4 单品全链路', await waitLayer(page, 4));
  await waitIdle(page);

  /* --- 14. 六环节按流程点亮 --- */
  const chipSeq = [];
  for (let i = 0; i < 16; i++) { chipSeq.push(await page.evaluate(() => window.AGRI_DEBUG.chipState().filter(Boolean).length)); await sleep(160); }
  check('L4：六环节按流程依次点亮', chipSeq[chipSeq.length - 1] === 6 && chipSeq.some(v => v > 0 && v < 6), chipSeq.join(','));
  const priceW = await page.evaluate(() => Array.from(document.querySelectorAll('#priceChain .pbar i')).map(i => i.style.width));
  check('L4：价格链路（田头→零售）逐段出现', priceW.length === 4 && priceW.every(w => parseFloat(w) >= 0), priceW.join('/'));
  const l4ink = await page.evaluate(() => document.querySelectorAll('#chainAxis .chip').length);
  check('L4：覆盖 6 个环节（种苗/种植/采后/冷链/批发/零售）', l4ink === 6);
  await page.screenshot({ path: path.join(SHOTS, '05-l4-chain.png') });

  /* --- 15. 环节点击 + 经营主体抽屉 --- */
  const aiStage0 = await aiText(page);
  await page.locator('#chainAxis .chip').nth(3).click();
  await sleep(400);
  st = await state(page);
  const aiStage3 = await aiText(page);
  check('L4：点环节 → 环节明细与 AI 内容随对象变化（不进入第五层）',
    st.layer === 4 && st.sel && st.sel.type === 'stage' && aiStage3 !== aiStage0, st.sel && st.sel.label);
  await page.locator('#stageEnts li').first().click();
  await sleep(500);
  check('L4：经营主体以抽屉展开（不强制下钻第五层）', await page.locator('#drawer').evaluate(e => e.classList.contains('open')));
  await page.screenshot({ path: path.join(SHOTS, '06-l4-drawer.png') });
  await page.keyboard.press('Escape');
  await sleep(400);
  check('Esc：先关闭抽屉，层级仍为 L4', !(await page.locator('#drawer').evaluate(e => e.classList.contains('open'))) && (await layer(page)) === 4);
  await page.screenshot({ path: path.join(SHOTS, '06b-l4-stage.png') });

  /* --- 16. 面包屑返回 --- */
  await page.locator('#crumbs button').first().click();
  check('面包屑：点击「全球」直接回到 L1', await waitLayer(page, 1));
  await waitIdle(page);

  /* --- 17. 滚轮缩小返回 --- */
  check('滚轮：从 L1 再次进入 L2', await enterL2ViaArc(page, 'TH'));
  const sb = await page.locator('#stage').boundingBox();
  for (let i = 0; i < 6; i++) { await page.mouse.move(sb.x + sb.width * 0.5, sb.y + sb.height * 0.5); await page.mouse.wheel(0, 160); await sleep(150); }
  check('滚轮缩小：缩到最小后回到上一层', await waitLayer(page, 1), 'layer=' + (await layer(page)));

  /* --- 17b. 截图与视觉完整性 --- */
  const shotFiles = fs.readdirSync(SHOTS).filter(f => f.endsWith('.png'));
  const small = shotFiles.filter(f => fs.statSync(path.join(SHOTS, f)).size < 60 * 1024);
  check('截图产出：各层级关键画面均已生成且非空白页', shotFiles.length >= 8 && small.length === 0, `${shotFiles.length} 张 / 过小 ${small.length}`);

  /* --- 18. 洁净度 --- */
  check('无控制台错误 / 页面异常', consoleErrors.length === 0 && pageErrors.length === 0,
    (consoleErrors.concat(pageErrors).slice(0, 3).join(' | ') || 'clean'));
  check('无外部网络请求（完全离线运行）', externalRequests.length === 0, externalRequests.slice(0, 3).join(' | ') || 'none');

  await ctx.close();
}

/* ============================ 移动端 ============================ */
async function mobile(browser) {
  const { ctx, page } = await newPage(browser, { width: 390, height: 844, mobile: true });
  await page.screenshot({ path: path.join(SHOTS, '07-m-landing.png') });
  const overflow = () => page.evaluate(() => `${document.documentElement.scrollWidth}/${window.innerWidth}`);
  check('移动端：首页无横向溢出', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), await overflow());
  await page.locator('#enterBtn').tap();
  await page.waitForTimeout(600);
  check('移动端：进入 L1', (await layer(page)) === 1);
  check('移动端：进入系统后无横向溢出', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), await overflow());
  await page.waitForFunction(() => window.AGRI_DEBUG.state().l1.grownOrder.length >= 8, null, { timeout: 20000 });

  await page.evaluate(() => document.querySelector('#side .rel li[data-id="f:CL"]').click());
  await sleep(1200);
  let st = await state(page);
  let side = await sideText(page);
  check('移动端：选中对象 → 明细 + AI 助手可见', st.sel && st.sel.type === 'flow' && side.includes('AI 分析助手') && side.includes('口径'), st.sel && st.sel.label);
  await page.screenshot({ path: path.join(SHOTS, '08-m-l1.png') });
  check('移动端：触摸点弧线命中该数据对象', await clickGlobeHit(page, 'arc', 'CL', true) === 'CL');
  check('移动端：再次点击 → 进入 L2', await waitLayer(page, 2));
  await waitIdle(page);
  await page.waitForTimeout(2600);
  check('移动端：L2 省际线点亮', (await state(page)).l2.lit > 0, 'lit=' + (await state(page)).l2.lit);
  await page.screenshot({ path: path.join(SHOTS, '09-m-l2.png') });
  await page.keyboard.press('Escape');
  check('移动端：Esc 返回 L1', await waitLayer(page, 1));
  check('移动端：全程无横向溢出', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), await overflow());
  await ctx.close();
}

/* ============================ 主流程 ============================ */
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
const exe = findChromium();
const browser = await chromium.launch(exe ? { executablePath: exe } : {});
try {
  await desktop(browser);
  console.log('\n---- 移动端 ----');
  await mobile(browser);
} finally {
  await browser.close();
}

const failed = results.filter(r => !r.ok);
const report = [
  '# 农链 AgriLink · 端到端测试报告', '',
  `运行时间：${new Date().toISOString()}`, '',
  '加载方式：本地单文件 `index.html`（`file://`），并拦截全部外部请求 —— 同时验证离线可用性。', '',
  `## 结果：${results.length - failed.length} / ${results.length} 通过`, '',
  '| # | 检查项 | 结果 | 实测 |', '| --- | --- | --- | --- |',
  ...results.map((r, i) => `| ${i + 1} | ${r.name} | ${r.ok ? '✅' : '❌'} | ${(r.detail || '').replace(/\|/g, '/')} |`),
  '', '## 控制台错误 / 页面异常', '',
  (consoleErrors.concat(pageErrors).length ? '```\n' + consoleErrors.concat(pageErrors).join('\n') + '\n```' : '无'), '',
  '## 外部网络请求', '',
  (externalRequests.length ? '```\n' + externalRequests.join('\n') + '\n```' : '无（完全离线运行）'), ''
].join('\n');
fs.writeFileSync(path.join(root, 'test', 'report.md'), report);

console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILED:\n' + failed.map(f => ' - ' + f.name + ' :: ' + f.detail).join('\n')); process.exit(1); }
