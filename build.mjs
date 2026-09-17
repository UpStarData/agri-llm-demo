#!/usr/bin/env node
/* 构建：把 src/* + vendor/* + data/* + fonts/* 内联为单文件 index.html
   —— 无网络依赖、无外部文件依赖；双击即可运行，离线与线上是同一个文件 */
import fs from 'node:fs';
import path from 'node:path';
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

const appJs = ['src/globe.js', 'src/ai.js', 'src/map.js', 'src/app-chain.js', 'src/app.js']
  .map(f => `<script>\n${rd(f)}\n</script>`).join('\n');

let html = rd('src/shell.html');
html = put(html, '/*FONT_CSS*/', fontCss);
html = put(html, '/*APP_CSS*/', rd('src/app.css'));
html = put(html, '<!--LIBS-->', libs);
html = put(html, '<!--DATA-->', data);
html = put(html, '<!--APP_JS-->', appJs);

fs.writeFileSync(path.join(root, 'index.html'), html);
console.log(`index.html  ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB  single-file / offline-ready`);
