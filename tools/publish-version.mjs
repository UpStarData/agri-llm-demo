/* 发版收尾：把新版本接上、旧版本加「去最新版」入口。
   用法：node tools/publish-version.mjs <versionDir>    例：node tools/publish-version.mjs v1.0.15
   做三件事：① 把该目录同步成 latest/ ② 给所有更早的版本页注入「去最新版」横幅 ③ 提示还需补的两处 */
import fs from 'node:fs';
import path from 'node:path';

const BANNER = '<style>.go-latest-v105{position:fixed;top:67px;right:18px;z-index:9999;padding:8px 12px;background:#1d4ed8;color:#fff!important;border-radius:7px;font:600 12px sans-serif;text-decoration:none;box-shadow:0 6px 18px #0003}</style><a class="go-latest-v105" href="../latest/">去最新版</a>\n';

const root = process.cwd();
const dir = process.argv[2];
if (!dir || !fs.existsSync(path.join(root, dir, 'index.html'))) {
  console.error('用法：node tools/publish-version.mjs <versionDir>（该目录需含 index.html）');
  process.exit(1);
}

fs.mkdirSync(path.join(root, 'latest'), { recursive: true });
for (const f of ['index.html', 'build-meta.json']) {
  const src = path.join(root, dir, f);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(root, 'latest', f));
}
console.log('latest/ 已同步自', dir);

const versions = fs.readdirSync(root).filter((x) => /^v\d/.test(x) && fs.statSync(path.join(root, x)).isDirectory()).sort();
let added = 0, kept = 0;
for (const v of versions) {
  if (v === dir) continue;
  const f = path.join(root, v, 'index.html');
  if (!fs.existsSync(f)) continue;
  const html = fs.readFileSync(f, 'utf8');
  if (html.includes('go-latest-v105')) { kept++; continue }
  if (!html.includes('<body>')) { console.log('跳过（没有 <body>）', v); continue }
  fs.writeFileSync(f, html.replace('<body>', '<body>' + BANNER));
  added++;
}
console.log('「去最新版」横幅：新加', added, '个版本，已有', kept, '个');
console.log('\n还要手工做：\n  1) versions/index.html 加一行（新版本标 now，旧版本去掉 now）\n  2) VERSIONS.md 加一行（更新时间取源码提交时间）\n  3) 实测 https://upstardata.github.io/agri-llm-demo/' + dir + '/ 与 /latest/');
