#!/usr/bin/env node
/* AgriLink V1.0 构建：把 src/v03/* + vendor + data + fonts 内联为单文件 index.html
   —— 无网络依赖、无外部文件依赖；双击即可运行，离线与线上是同一个文件
   node build.mjs            正常构建（缺文件即失败）
   node build.mjs --partial  允许缺文件（并行开发自测用） */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const PARTIAL = process.argv.includes('--partial');
const missing = [];
const rd = p => {
  const f = path.join(root, p);
  if (!fs.existsSync(f)) {
    if (!PARTIAL) throw new Error('缺少构建输入：' + p);
    missing.push(p); return '/* missing: ' + p + ' */';
  }
  return fs.readFileSync(f, 'utf8');
};
const rb = p => {
  const f = path.join(root, p);
  if (!fs.existsSync(f)) { rd(p); return Buffer.from(''); }
  return fs.readFileSync(f);   // 二进制（字体 / echarts）必须读原始字节
};
const put = (tpl, token, val) => tpl.replace(token, () => val);
const b64 = p => rb(p).toString('base64');

/* 字重分档（页面指令 G2）：Light 辅助信息 / Regular 正文 / SemiBold 强调 / Bold 标题 */
const FACES = [
  { file: 'fonts/PlexLight-sub.woff2', weight: 300 },
  { file: 'fonts/PlexRegular-sub.woff2', weight: 400 },
  { file: 'fonts/PlexSemiBold-sub.woff2', weight: 600 },
  { file: 'fonts/PlexBold-sub.woff2', weight: 700 }
];
const fontCss = FACES.map(f =>
  `@font-face{font-family:'IBM Plex Sans SC';src:url(data:font/woff2;base64,${b64(f.file)}) format('woff2');font-weight:${f.weight};font-style:normal;font-display:swap}`
).join('\n');

const CSS = ['src/v03/app.css', 'src/v03/relation.css', 'src/v03/sim.css'];
const JS = [
  'src/v03/pkg-adapter.js', // 数据包 agrilink-demo-v1（LLM-292）→ 页面内部模型
  'src/v03/atlas-data.js',  // 上一轮自带数据（数据包缺失时的兜底 + 推演层别名来源）
  'src/v03/data.js',        // 事实 / 对象 / 关系（数据包为准，自带数据作别名）
  'src/v03/data-sim.js',    // 推演层场景与轮次
  'src/v03/dict-f3.js',     // V2 指令 F3 事实三级分类字典（7/26/125）
  'src/v03/store.js',       // 唯一状态源
  'src/v03/filter.js',      // 三层共用的唯一过滤实现 + 三级分类字典
  'src/v03/fact.js',        // 事实层
  'src/v03/relation.js',    // 关联层
  'src/v03/sim.js',         // 推演层
  'src/v03/app.js'          // 骨架 / 图层菜单 / 快捷键 / 流水 / 弹窗
];
const GEO = ['data/china.geo.json', 'data/world110.geo.json'];

/* 展示数据包（LLM-292 · agrilink-demo-v1）：原样内联，前端由 src/v03/pkg-adapter.js 适配 */
const PKG_FILES = {
  facts: 'facts.json', entities: 'entities.json', relations: 'relations.json',
  ontology: 'ontology.json', sources: 'sources.json', evidence: 'evidence.json',
  observations: 'observations.json', stream: 'stream.sequence.json',
  manifest: 'manifest.json', stats: 'stats.json', cards: 'cards.schema.json', validation: 'validation.json',
  regions: 'geo/regions.geojson', ports: 'geo/ports.geojson',
  airports: 'geo/airports.geojson', nodes: 'geo/nodes.geojson'
};
const PKG_INPUTS = Object.keys(PKG_FILES).map(k => 'data/pkg/' + PKG_FILES[k]);

/* 第三方数据补充包（D0/D2/D4/D1）：天气事实 / 大型机场 / 公开直播频道 / 重点农产品补齐事实 */
const PKG2_FILES = [
  'data/pkg2/weather-facts.json', 'data/pkg2/airports-large.geojson',
  'data/pkg2/live-channels.json', 'data/pkg2/extra-facts.json'
];
const pkg2Data = (() => {
  const read = f => { try { return JSON.parse(fs.readFileSync(path.join(root, f), 'utf8')); } catch (e) { return null; } };
  const out = { weather: read('data/pkg2/weather-facts.json') || [], airports: read('data/pkg2/airports-large.geojson'), channels: read('data/pkg2/live-channels.json') || [], extra: read('data/pkg2/extra-facts.json') || [] };
  return '<script>window.__AGRI_PKG2__=' + JSON.stringify(out) + ';</script>';
})();

const libs = `<script>${rd('vendor/echarts.min.js')}</script>\n<script>${rd('vendor/hls.min.js')}</script>`;
const pkgData = '<script>window.__AGRI_PKG__={' +
  Object.keys(PKG_FILES).map(k => JSON.stringify(k) + ':' + rd('data/pkg/' + PKG_FILES[k])).join(',') +
  '};</script>';
const data = [
  `<script>window.__CHINA_GEO=${rd('data/china.geo.json')};</script>`,
  `<script>window.__WORLD110=${rd('data/world110.geo.json')};</script>`,
  pkgData,
  pkg2Data
].join('\n');
const appJs = JS.map(f => `<script>\n${rd(f)}\n</script>`).join('\n');

const INPUTS = ['src/v03/shell.html', ...CSS, ...JS, ...GEO, ...PKG_INPUTS, 'build.mjs',
  'vendor/echarts.min.js', 'vendor/hls.min.js', ...FACES.map(f => f.file)];
const hh = crypto.createHash('sha256');
INPUTS.forEach(p => { hh.update(p + '\0'); hh.update(rb(p)); });
const hash = hh.digest('hex').slice(0, 12);
let git = 'unknown';
try { git = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim(); } catch (e) { /* 非 git 环境 */ }

let html = rd('src/v03/shell.html');
html = put(html, '/*FONT_CSS*/', fontCss);
html = put(html, '/*APP_CSS*/', rd(CSS[0]));
html = put(html, '/*REL_CSS*/', rd(CSS[1]));
html = put(html, '/*SIM_CSS*/', rd(CSS[2]));
html = put(html, '<!--BUILD-->', `<script>window.__V03_BUILD=${JSON.stringify({ hash, git, builtAt: new Date().toISOString(), partial: PARTIAL })};</script>`);
html = put(html, '<!--LIBS-->', libs);
html = put(html, '<!--DATA-->', data);
html = put(html, '<!--APP_JS-->', appJs);

fs.writeFileSync(path.join(root, 'index.html'), html);
fs.writeFileSync(path.join(root, 'build-meta.json'), JSON.stringify({
  hash, git, builtAt: new Date().toISOString(), partial: PARTIAL, inputs: INPUTS, missing,
  bytes: Buffer.byteLength(html)
}, null, 2) + '\n');
console.log(`index.html  ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB  single-file / offline-ready  build=${hash} git=${git}` +
  (missing.length ? `  缺文件 ${missing.length} 个：${missing.join(', ')}` : ''));
