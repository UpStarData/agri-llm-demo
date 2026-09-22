#!/usr/bin/env node
/* ============================================================
   v05 第二轮截图取证（1440×900）
   1) 事实层默认页（小亮点 + 左下两排快捷键 + 右下横向图例 + 纯黑终端流水）
   2) 事实层左侧菜单（F3 全量字典 / 快捷控制 / 总开关）
   3) 事实详情右侧嵌套抽屉
   4) 关联层默认页（MiroFish 式细灰曲线 + 方向流光 + 语义标签）
   5) 关联层本体详情 → 关系详情逐层展开
   6) 真实直播播放取证（已核验可嵌入的公开直播源，需 http(s) 打开）
   对照：原版 AgriLink 配色 / MiroFish 连线
   运行：node test/shots-v05.mjs       产物：shots/v05b-*.png
   ============================================================ */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = async (page, name) => { await page.screenshot({ path: path.join(OUT, name) }); console.log('  ▸', name); };

/* 本地 http 服务：直播源播放器帧会以 CSP frame-ancestors 拒绝 file:// 祖先，故用 http 取证 */
const srv = http.createServer((req, res) => {
  const rel = req.url === '/' || req.url.startsWith('/?') ? '/index.html' : req.url.split('?')[0];
  const f = path.join(root, rel);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': rel.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => srv.listen(4179, '127.0.0.1', r));
const URL = 'http://127.0.0.1:4179/';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
page.setDefaultTimeout(25000);
await page.goto(URL, { waitUntil: 'load' });
await page.waitForFunction(() => window.__AGRI_READY === true, null, { timeout: 40000 });
await sleep(1600);

/* ① 事实层默认页 */
await shot(page, 'v05b-01-fact-default.png');

/* ② 左侧菜单 */
await page.click('#menuBtn'); await sleep(700);
await shot(page, 'v05b-02-fact-menu.png');
await page.click('#menuClose'); await sleep(500);

/* ③ 事实详情嵌套抽屉 */
await page.locator('#layer-fact .fcard').nth(3).click(); await sleep(1000);
await shot(page, 'v05b-03-fact-drawer.png');
await page.keyboard.press('Escape'); await sleep(500);

/* ⑥ 真实直播播放（在卡片内直接播放，已核验可嵌入的公开源） */
await page.evaluate(() => {
  const f = window.V03Data.FACTS.find(x => window.V03Fact.isPlayable(x));
  window.V03_DEBUG.set({ q: String((f.card.mediaTitle || '')).slice(0, 4), time: 'all', cred: 'all', infl: 'all' });
});
await sleep(2500);
await page.evaluate(() => {
  const el = document.querySelector('#layer-fact .fcard .fc-player iframe');
  if (el) el.scrollIntoView({ block: 'center' });
});
await sleep(7000);
await shot(page, 'v05b-06-video-live.png');
const videoInfo = await page.evaluate(() => ({
  playable: window.V03Data.FACTS.filter(f => window.V03Fact.isPlayable(f)).length,
  iframes: document.querySelectorAll('#layer-fact iframe').length,
  frames: [...document.querySelectorAll('#layer-fact iframe')].map(f => f.getAttribute('src'))
}));
await page.evaluate(() => window.V03_DEBUG.set({ q: '', time: '7d', cred: 'high', infl: 'high' })); await sleep(1200);

/* ④ 关联层默认页 */
await page.click('#tabs button[data-tab="relation"]'); await sleep(3200);
await shot(page, 'v05b-04-relation-default.png');

/* ⑤ 本体详情 → 关系详情逐层展开 */
await page.locator('#relBody .rel-card').first().click(); await sleep(1000);
await shot(page, 'v05b-05a-relation-entity-drawer.png');
const entityRows = await page.locator('#drawerStack .rel-row').count();
if (entityRows) { await page.locator('#drawerStack .rel-row').first().click(); await sleep(1000); }
await shot(page, 'v05b-05b-relation-relation-drawer.png');
const drawerInfo = await page.evaluate(() => ({
  drawers: document.querySelectorAll('#drawerStack .drawer').length,
  heads: [...document.querySelectorAll('#drawerStack .drawer-head b')].map(x => x.textContent)
}));
console.log('  抽屉层级：', JSON.stringify(drawerInfo), '· 视频：', JSON.stringify(videoInfo));
await page.close();

/* 对照一：原版 AgriLink（线上） vs 新版 */
const c1 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const op = await c1.newPage();
op.setDefaultTimeout(45000);
try {
  await op.goto('https://upstardata.github.io/agri-llm-demo/', { waitUntil: 'load', timeout: 60000 });
  await sleep(1500);
  await op.screenshot({ path: path.join(OUT, '_orig-live.png') });
  console.log('  ▸ _orig-live.png（原版线上）');
} catch (e) { console.log('  ! 原版线上截图失败：', String(e).slice(0, 100)); }
await c1.close();

const cmp = await browser.newContext({ viewport: { width: 1440, height: 820 } });
const cp = await cmp.newPage();
const fileUrl = p => 'file://' + path.join(OUT, p);
const mkPanel = (title, sub, leftImg, leftCap, leftNotes, rightImg, rightCap, rightNotes) => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>
  body{margin:0;background:#f4f6fa;font-family:'IBM Plex Sans SC','PingFang SC',sans-serif;color:#10151f}
  .head{padding:10px 14px 0;font-size:13px;font-weight:700}
  .head small{font-weight:400;color:#64707f;margin-left:8px;display:block;margin-top:3px;line-height:1.6}
  .row{display:flex;gap:10px;padding:10px 14px 14px}
  .col{flex:1;min-width:0;background:#fff;border:1px solid rgba(15,23,42,.10);border-radius:10px;overflow:hidden;display:flex;flex-direction:column}
  .cap{font-size:11px;padding:6px 10px;color:#4d586a;border-bottom:1px solid rgba(15,23,42,.08);font-weight:600}
  .cap span{font-weight:400;color:#64707f}
  img{display:block;width:100%;height:auto;max-height:620px;object-fit:contain;background:#fff}
  ul{margin:6px 10px 10px 22px;font-size:11px;color:#4d586a;line-height:1.7}
</style></head><body>
  <div class="head">${title}<small>${sub}</small></div>
  <div class="row">
    <div class="col"><div class="cap">${leftCap}</div><img src="${fileUrl(leftImg)}"><ul>${leftNotes.map(x => '<li>' + x + '</li>').join('')}</ul></div>
    <div class="col"><div class="cap">${rightCap}</div><img src="${fileUrl(rightImg)}"><ul>${rightNotes.map(x => '<li>' + x + '</li>').join('')}</ul></div>
  </div></body></html>`;

const tmp = path.join(root, '.cmp-v05.html');
fs.writeFileSync(tmp, mkPanel(
  'AgriLink 配色与视觉基线对照',
  '左：原版 AgriLink（线上 upstardata.github.io/agri-llm-demo）· 右：本轮事实层（同一 1440×900 视口）· 底 #f4f6fa / 白面板 / 蓝主色 / 浅色底图',
  '_orig-live.png', '原版 AgriLink <span>· 浅色农业风</span>', ['底 #f4f6fa、白面板、蓝主色', '明亮、克制、数据叙事'],
  'v05b-01-fact-default.png', '本轮事实层 <span>· 同基线配色</span>', ['小亮点 4–6px + 淡色影响范围', '左下两排快捷键（含 +/−）', '右下横向图例 + 纯黑终端流水']
));
await cp.goto('file://' + tmp, { waitUntil: 'load' }); await sleep(900);
await shot(cp, 'v05b-10-compare-original.png');

fs.writeFileSync(tmp, mkPanel(
  '关系线样式对照：MiroFish 参考 与 关联层实现',
  '左：MiroFish 官方运行截图（Graph Relationship Visualization，来源 github.com/666ghj/MiroFish · static/image/Screenshot/运行截图2.png）· 右：AgriLink 关联层（浅色农业视觉）',
  'ref/mirofish-2.png', 'MiroFish 参考 <span>· 细半透明曲线 + 关系语义标签 + 节点小圆点</span>',
  ['线条细、半透明、曲线', '关系类型文字直接标在线中间', '节点小圆点 + 悬浮强化'],
  'v05b-05b-relation-relation-drawer.png', 'AgriLink 关联层 <span>· 细灰曲线 + 方向流光 + 焦点语义标签</span>',
  ['线宽 1–1.5px、灰色半透明曲线', '方向由低速流光粒子表示（period 7s）', '悬停/点击本体：直接相关线强化并显示关系语义，其余降至 7%']
));
await cp.goto('file://' + tmp, { waitUntil: 'load' }); await sleep(900);
await shot(cp, 'v05b-11-compare-mirofish.png');
await cmp.close();

await browser.close();
srv.close();
fs.rmSync(tmp, { force: true });
console.log('截图完成 → shots/v05b-*.png');
