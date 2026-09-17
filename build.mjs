#!/usr/bin/env node
/* 构建：把 src/* + vendor/* + data/* + fonts/* 内联为单文件 index.html
   —— 无网络依赖、无外部文件依赖；双击即可运行，离线与线上是同一个文件 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const rd = p => fs.readFileSync(path.join(root, p), 'utf8');
const rb = p => fs.readFileSync(path.join(root, p));
const put = (tpl, token, val) => tpl.replace(token, () => val);

const b64 = p => rb(p).toString('base64');
const fontCss = `@font-face{font-family:'IBM Plex Sans SC';src:url(data:font/woff2;base64,${b64('fonts/PlexRegular-sub.woff2')}) format('woff2');font-weight:400;font-style:normal;font-display:swap}
@font-face{font-family:'IBM Plex Sans SC';src:url(data:font/woff2;base64,${b64('fonts/PlexBold-sub.woff2')}) format('woff2');font-weight:700;font-style:normal;font-display:swap}`;

const libs = `<script>${rd('vendor/echarts.min.js')}</script>`;

const data = [
  `<script>window.__CHINA_GEO=${rd('data/china.geo.json')};</script>`,
  `<script>window.__WORLD110=${rd('data/world110.geo.json')};</script>`,
  `<script>${rd('src/data.js')}</script>`
].join('\n');

const appJs = ['src/globe.js', 'src/provider.js', 'src/ai.js', 'src/aiconfig.js', 'src/map.js', 'src/app-chain.js', 'src/app.js']
  .map(f => `<script>\n${rd(f)}\n</script>`).join('\n');

/* 构建指纹：对所有输入取 sha256（确定性，与构建时间无关）—— 用于核对线上 Pages 的版本 */
const INPUTS = ['src/shell.html', 'src/app.css', 'src/data.js', 'src/globe.js', 'src/provider.js', 'src/ai.js', 'src/aiconfig.js',
  'src/map.js', 'src/app-chain.js', 'src/app.js', 'build.mjs',
  'data/china.geo.json', 'data/world110.geo.json', 'vendor/echarts.min.js',
  'fonts/PlexRegular-sub.woff2', 'fonts/PlexBold-sub.woff2'];
const hh = crypto.createHash('sha256');
INPUTS.forEach(p => { hh.update(p + '\0'); hh.update(rb(p)); });
const hash = hh.digest('hex').slice(0, 12);
let git = 'unknown';
try { git = execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim(); } catch (e) { /* 非 git 环境 */ }
const builtAt = new Date().toISOString();

let html = rd('src/shell.html');
html = put(html, '/*FONT_CSS*/', fontCss);
html = put(html, '/*APP_CSS*/', rd('src/app.css'));
html = put(html, '<!--BUILD-->', `<script>window.__AGRI_BUILD=${JSON.stringify({ hash, git, builtAt })};</script>`);
html = put(html, '<!--LIBS-->', libs);
html = put(html, '<!--DATA-->', data);
html = put(html, '<!--APP_JS-->', appJs);

fs.writeFileSync(path.join(root, 'index.html'), html);
fs.writeFileSync(path.join(root, 'build-meta.json'), JSON.stringify({
  hash, git, builtAt, inputs: INPUTS, bytes: Buffer.byteLength(html)
}, null, 2) + '\n');
console.log(`index.html  ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB  single-file / offline-ready  build=${hash} git=${git}`);
