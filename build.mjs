#!/usr/bin/env node
/* V0.3 三层 Demo 构建：把 src/v03/* + vendor + data + fonts 内联为单文件 index.html
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

const fontCss = `@font-face{font-family:'IBM Plex Sans SC';src:url(data:font/woff2;base64,${b64('fonts/PlexRegular-sub.woff2')}) format('woff2');font-weight:400;font-style:normal;font-display:swap}
@font-face{font-family:'IBM Plex Sans SC';src:url(data:font/woff2;base64,${b64('fonts/PlexBold-sub.woff2')}) format('woff2');font-weight:700;font-style:normal;font-display:swap}`;

const CSS = ['src/v03/app.css', 'src/v03/relation.css', 'src/v03/sim.css'];
const JS = [
  'src/v03/data.js',        // 事实 / 对象 / 关系（冻结）
  'src/v03/data-sim.js',    // 推演层场景与轮次
  'src/v03/store.js',       // 唯一状态源（冻结）
  'src/v03/filter.js',      // 三层共用的唯一过滤实现
  'src/v03/fact.js',        // 事实层
  'src/v03/relation.js',    // 关联层
  'src/v03/sim.js',         // 推演层
  'src/v03/app.js'          // 骨架 / 路由 / 共用控件 / 流水
];
const GEO = ['data/china.geo.json', 'data/world110.geo.json'];

const libs = `<script>${rd('vendor/echarts.min.js')}</script>`;
const data = [
  `<script>window.__CHINA_GEO=${rd('data/china.geo.json')};</script>`,
  `<script>window.__WORLD110=${rd('data/world110.geo.json')};</script>`
].join('\n');
const appJs = JS.map(f => `<script>\n${rd(f)}\n</script>`).join('\n');

const INPUTS = ['src/v03/shell.html', ...CSS, ...JS, ...GEO, 'build.mjs',
  'vendor/echarts.min.js', 'fonts/PlexRegular-sub.woff2', 'fonts/PlexBold-sub.woff2'];
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
