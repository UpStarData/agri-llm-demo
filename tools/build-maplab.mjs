#!/usr/bin/env node
/* 独立地图实验页构建：把 src/maplab/index.html 与 echarts / 世界与省界数据内联成单文件。
   产物：maplab/index.html（发布仓库 agri-llm-demo 的 /maplab/ 地址） */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rd = p => fs.readFileSync(path.join(root, p), 'utf8');

let html = rd('src/maplab/index.html');
html = html.replace('/*ECHARTS*/', () => rd('vendor/echarts.min.js'));
html = html.replace('/*WORLD*/', () => rd('data/world110.geo.json'));
html = html.replace('/*CHINA*/', () => rd('data/china.geo.json'));

fs.mkdirSync(path.join(root, 'maplab'), { recursive: true });
fs.writeFileSync(path.join(root, 'maplab/index.html'), html);
console.log('maplab/index.html', (Buffer.byteLength(html) / 1024).toFixed(0) + ' KB');
