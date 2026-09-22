#!/usr/bin/env python3
"""字重子集化（页面指令 G2）：IBM Plex Sans SC Light / SemiBold → fonts/*-sub.woff2

只保留页面 src/v03/* 里实际出现的字符，让单文件构建保持可接受的体积。

用法：
    python3 tools/subset-fonts.py [完整字体目录，默认 /tmp/plex]

字体来源（OFL 授权，免费可用）：
    https://cdn.jsdelivr.net/npm/@ibm/plex-sans-sc@1.1.0/fonts/complete/woff2/hinted/IBMPlexSansSC-<字重>.woff2
    https://www.ibm.com/design/language/typography/typeface/
"""
import pathlib
import sys
import urllib.request

from fontTools.subset import main as subset_main

CDN = 'https://cdn.jsdelivr.net/npm/@ibm/plex-sans-sc@1.1.0/fonts/complete/woff2/hinted'
WEIGHTS = [('Light', 'PlexLight-sub.woff2'), ('SemiBold', 'PlexSemiBold-sub.woff2')]
EXTRA = '0123456789%°·—…、。，；：！？（）《》「」【】[]{}<>=+-*/×÷→←↑↓▲▼●○■□⚓✈️🌾🍊🌱🏢🏛️🏬📈📦📊📜🤝🚚❄️🌀🌡️☀️▶'

root = pathlib.Path(__file__).resolve().parent.parent
src = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/plex')
src.mkdir(parents=True, exist_ok=True)
out_dir = root / 'fonts'
out_dir.mkdir(exist_ok=True)

text = EXTRA
for f in sorted((root / 'src' / 'v03').iterdir()):
    if f.suffix in ('.html', '.css', '.js'):
        text += f.read_text(encoding='utf-8')
text = ''.join(sorted(set(text)))
chars = pathlib.Path('/tmp/agri-subset-chars.txt')
chars.write_text(text, encoding='utf-8')
print('字符集', len(text), '个 →', chars)

for name, out in WEIGHTS:
    src_file = src / ('IBMPlexSansSC-%s.woff2' % name)
    if not src_file.exists():
        url = '%s/IBMPlexSansSC-%s.woff2' % (CDN, name)
        print('下载', url)
        urllib.request.urlretrieve(url, src_file)
    target = out_dir / out
    subset_main([str(src_file), '--text-file=' + str(chars), '--flavor=woff2',
                 '--layout-features=*', '--no-hinting', '--desubroutinize',
                 '--output-file=' + str(target)])
    print('生成', target.relative_to(root), '%.0f KB' % (target.stat().st_size / 1024))
