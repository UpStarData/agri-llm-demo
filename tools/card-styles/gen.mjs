/* 生成 5 套封面风格预设：预览图 + presets.json + STYLES.md（单一来源，避免文档与实现漂移）。
   用法：node tools/card-styles/gen.mjs [输出目录] */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const OUT = process.argv[2] || '../card-styles';
const SANS = "'Space Grotesk','Noto Sans SC','PingFang SC',sans-serif";
const MONO = "'JetBrains Mono','SF Mono',monospace";
const SERIF = "'Songti SC','Noto Serif SC','PingFang SC',serif";

/* 五套预览用同一个主题，方便横向比较风格本身 */
const T = { no: '01', title: '榴莲价格', sub: 'PRICE VOLATILITY', zh: '榴莲价格波动推演', tag: '价格', desc: '产地季重叠、到货量变化对批发价与份额的影响' };

const grid = (step, color, op = 1, w = 640, h = 360) => {
  const p = [];
  for (let x = step; x < w; x += step) p.push(`<path d="M${x} 0V${h}"/>`);
  for (let y = step; y < h; y += step) p.push(`<path d="M0 ${y}H${w}"/>`);
  return `<g stroke="${color}" stroke-opacity="${op}" stroke-width="1">${p.join('')}</g>`;
};
const ticks = (c, op) => `<path d="M28 40h7M28 40v7M612 40h-7M612 40v7M28 320h7M28 320v-7M612 320h-7M612 320v-7" stroke="${c}" stroke-opacity="${op}" stroke-width="2" fill="none"/>`;
const wm = (txt, fill, family = MONO, size = 150, x = 566, y = 252) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="700" fill="${fill}" font-family="${family}" text-anchor="middle">${txt}</text>`;

/* ---------------- 五套风格 ---------------- */
const STYLES = [
  {
    key: 'A', name: '暗色工程 Dark Editorial', when: '默认款。技术报告、数据看板、绝大多数农产品主题卡；深底突出标题，投影不刺眼。',
    base: '双色线性渐变深底（左上→右下），32px 网格线，右上强调色径向光晕，右下大号编号水印',
    geo: '单一强调色线稿，5–7px，圆头圆角；柱状 + 折线 + 端点圆 + 箭头',
    type: '主标题 66px 粗体近白；86×5 强调短线；副标等宽全大写 19px 62% 白',
    accent: '#ff6236', palette: ['#14323f', '#0a1d27', '#ff6236', '#f5f8f9'],
    doNot: '不要照片、不要 3D、不要第三种颜色、不要圆角卡片',
    shell: { bg: '#fff', border: '1px solid #e5e7eb', radius: '0', title: '#161616', meta: '#df5430', tagBg: '#fff2ec', tagBd: '#ffddce', tagFg: '#b74c2c', desc: '#6b7280' },
    svg: (a) => `
      <defs><linearGradient id="bgA" x1="0" y1="0" x2=".75" y2="1"><stop offset="0" stop-color="#14323f"/><stop offset="1" stop-color="#0a1d27"/></linearGradient>
      <radialGradient id="glowA"><stop offset="0" stop-color="${a}" stop-opacity=".22"/><stop offset="1" stop-color="${a}" stop-opacity="0"/></radialGradient></defs>
      <rect width="640" height="360" fill="url(#bgA)"/>${grid(32, '#fff', .055)}
      <circle cx="486" cy="150" r="188" fill="url(#glowA)"/>${wm('01', 'rgba(255,255,255,.05)')}${ticks('#fff', .34)}
      <g stroke="rgba(255,255,255,.20)" stroke-width="14"><path d="M368 300V236M412 300V250M456 300V210M500 300V226M544 300V172M588 300V146"/></g>
      <polyline points="348,264 392,240 436,254 480,208 524,190 570,124" stroke="${a}" stroke-width="6" fill="none"/>
      <circle cx="570" cy="124" r="11" fill="${a}"/>
      <path d="M570 96V58" stroke="rgba(255,255,255,.42)" stroke-width="4" stroke-dasharray="9 9"/>
      <path d="M558 76l12-16 12 16" stroke="${a}" stroke-width="5" fill="none"/>`,
    typeBlock: (a) => `<text x="28" y="86" font-family="${MONO}" font-size="13" letter-spacing="3" fill="rgba(255,255,255,.55)">AGRI · 热门推演 ${T.no}</text>
      <text x="27" y="176" font-family="${SANS}" font-size="66" font-weight="700" letter-spacing="2" fill="#f5f8f9">${T.title}</text>
      <rect x="29" y="196" width="86" height="5" rx="2.5" fill="${a}"/>
      <text x="29" y="232" font-family="${MONO}" font-size="19" letter-spacing="2.6" fill="rgba(255,255,255,.62)">${T.sub}</text>`
  },
  {
    key: 'B', name: '蓝图 Blueprint', when: '方法论、架构/流程、口径与阈值说明；要"工程可信"的场合。适合配 API 契约、数据表设计文档。',
    base: '深蓝底（#0b2545→#071a33），主网格 40px + 次网格 8px，四周刻度尺，图面留白多',
    geo: '白色细线 2px + 一条青色主路径；带尺寸标注（箭头 + 数字）、点划线辅助线、角度/半径标注',
    type: '主标题 58px 粗体白；副标等宽 16px #8ecae6；编号为空心描边数字',
    accent: '#7fd1ff', palette: ['#0b2545', '#071a33', '#7fd1ff', '#e8f4ff'],
    doNot: '不要渐变光晕、不要粗描边、不要暖色、不要照片',
    shell: { bg: '#fbfdff', border: '1px solid #cfe2f2', radius: '0', title: '#0b2545', meta: '#1d6fa5', tagBg: '#eaf5ff', tagBd: '#cfe6fb', tagFg: '#1d6fa5', desc: '#5b7288' },
    svg: (a) => `
      <defs><linearGradient id="bgB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b2545"/><stop offset="1" stop-color="#071a33"/></linearGradient></defs>
      <rect width="640" height="360" fill="url(#bgB)"/>
      ${grid(40, '#ffffff', .07)}${grid(8, '#ffffff', .032)}
      <g stroke="rgba(255,255,255,.5)" stroke-width="1.5">
        <path d="M0 20H12M0 60H12M0 100H12M0 140H12M0 180H12M0 220H12M0 260H12M0 300H12M0 340H12"/>
        <path d="M620 20h12M620 60h12M620 100h12M620 140h12M620 180h12M620 220h12M620 260h12M620 300h12M620 340h12"/>
        <path d="M60 8V16M100 8V16M140 8V16M180 8V16M220 8V16M260 8V16M300 8V16M340 8V16M380 8V16M420 8V16M460 8V16M500 8V16M540 8V16M580 8V16"/></g>
      <text x="596" y="252" font-size="150" font-weight="700" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="2" font-family="${MONO}" text-anchor="middle">01</text>
      <g stroke="rgba(255,255,255,.28)" stroke-width="1.5" fill="none">
        <path d="M400 300V236M440 300V250M480 300V210M520 300V226M560 300V172M596 300V146"/></g>
      <polyline points="380,264 424,240 468,254 512,208 556,190 596,124" stroke="${a}" stroke-width="3" fill="none" stroke-dasharray="1 0"/>
      <circle cx="596" cy="124" r="5" fill="none" stroke="${a}" stroke-width="3"/>
      <circle cx="594" cy="124" r="16" fill="none" stroke="${a}" stroke-width="1" stroke-opacity=".45"/>
      <g stroke="rgba(255,255,255,.5)" stroke-width="1.5"><path d="M596 124H470" stroke-dasharray="10 6"/>
        <path d="M470 116v16M596 116v16"/></g>
      <text x="500" y="112" font-family="${MONO}" font-size="15" fill="rgba(255,255,255,.72)">R 2.4×</text>
      <text x="28" y="86" font-family="${MONO}" font-size="13" letter-spacing="3" fill="rgba(200,225,245,.75)">AGRI · HOT TOPIC ${T.no}</text>
      <text x="27" y="172" font-family="${SANS}" font-size="58" font-weight="700" fill="#eef6ff">${T.title}</text>
      <rect x="29" y="192" width="70" height="3" fill="${a}"/>
      <text x="29" y="224" font-family="${MONO}" font-size="16" letter-spacing="2.4" fill="${a}">${T.sub}</text>`,
    typeBlock: () => ''
  },
  {
    key: 'C', name: '纸感台账 Ledger Paper', when: '合规、单据、验收记录、口径与责任说明；要"留痕感"。也适合历史记录、版本说明卡。',
    base: '米白纸底（#f6f1e7）+ 24px 极淡横线 + 左右红竖线（账本）+ 轻微纸纹噪点',
    geo: '墨黑 + 印章红双色，2px 细线；表格线、编号框、盖章方块、下划重点',
    type: '主标题 60px 黑体墨黑；副标等宽小字 + 红色编号戳；页脚一行小字（来源/日期）',
    accent: '#b3261e', palette: ['#f6f1e7', '#1f1c17', '#b3261e', '#8a8577'],
    doNot: '不要深底、不要发光、不要渐变、不要圆角',
    shell: { bg: '#fffdf8', border: '1px solid #e0d8c8', radius: '0', title: '#1f1c17', meta: '#b3261e', tagBg: '#fdecea', tagBd: '#f3c9c4', tagFg: '#b3261e', desc: '#7a7466' },
    svg: (a) => `
      <rect width="640" height="360" fill="#f6f1e7"/>
      ${grid(24, '#1f1c17', .06)}
      <g stroke="#b3261e" stroke-opacity=".35" stroke-width="1"><path d="M52 0V360M588 0V360"/></g>
      <rect x="0" y="0" width="640" height="360" fill="url(#noiseC)" opacity=".05"/>
      <defs><pattern id="noiseC" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="#1f1c17"/><circle cx="4" cy="4" r=".5" fill="#1f1c17"/></pattern></defs>
      <text x="566" y="252" font-size="150" font-weight="700" fill="#1f1c17" fill-opacity=".045" font-family="${SERIF}" text-anchor="middle">01</text>
      <g stroke="#1f1c17" stroke-opacity=".85" stroke-width="2" fill="none">
        <rect x="336" y="96" width="252" height="150"/><path d="M336 134h252M336 172h252M336 210h252"/>
        <path d="M462 96V246"/></g>
      <g font-family="${MONO}" font-size="15" fill="#1f1c17">
        <text x="352" y="122">批次</text><text x="478" y="122">批发价</text>
        <text x="352" y="160">第 1 批</text><text x="478" y="160">18.40</text>
        <text x="352" y="198">第 2 批</text><text x="478" y="198">21.05</text>
        <text x="352" y="236">第 3 批</text><text x="478" y="236" fill="${a}" font-weight="700">24.60</text></g>
      <path d="M472 240h56" stroke="${a}" stroke-width="4"/>
      <g transform="rotate(-8 336 268)"><rect x="286" y="252" width="104" height="34" fill="none" stroke="${a}" stroke-width="3"/>
        <text x="338" y="275" font-family="${SERIF}" font-size="17" fill="${a}" text-anchor="middle">核 定</text></g>
      <text x="28" y="86" font-family="${MONO}" font-size="12" letter-spacing="3" fill="#8a8577">AGRI · 热门推演 ${T.no}</text>
      <text x="27" y="176" font-family="${SANS}" font-size="60" font-weight="700" letter-spacing="1" fill="#1f1c17">${T.title}</text>
      <rect x="29" y="196" width="86" height="4" fill="${a}"/>
      <text x="29" y="232" font-family="${MONO}" font-size="18" letter-spacing="2.4" fill="#7a7466">${T.sub}</text>
      <text x="28" y="336" font-family="${MONO}" font-size="11" letter-spacing="1.6" fill="#8a8577">来源：产地季 + 到货量口径 · 单位 元/kg · 复核 2026-10</text>`,
    typeBlock: () => ''
  },
  {
    key: 'D', name: '地块地图 Field Map', when: '区域/产地/物流/流通路径主题；讲"在哪儿、怎么走"。适合和原型里的地图页配对使用。',
    base: '深绿底（#10241c→#071610）+ 等高线与地块多边形（8% 白填充 / 12% 描边）+ 比例尺与指北针',
    geo: '亮黄绿单色强调（节点 + 路径）；地块虚线边界；路线用实线 + 圆点节点',
    type: '主标题 62px 粗体白；副标等宽 18px 淡绿；右下角比例尺条',
    accent: '#c8f169', palette: ['#10241c', '#071610', '#c8f169', '#e9f6e6'],
    doNot: '不要暖色强调、不要照片底图、不要多于一种强调色',
    shell: { bg: '#fff', border: '1px solid #dfe7dd', radius: '0', title: '#12251b', meta: '#4a7a2a', tagBg: '#f0fbe0', tagBd: '#dcf0c2', tagFg: '#4a7a2a', desc: '#64756a' },
    svg: (a) => `
      <defs><linearGradient id="bgD" x1="0" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#10241c"/><stop offset="1" stop-color="#071610"/></linearGradient></defs>
      <rect width="640" height="360" fill="url(#bgD)"/>
      <g stroke="#ffffff" stroke-opacity=".10" stroke-width="1.4" fill="none">
        <path d="M0 90c70 24 120-18 190 4s140 44 210 12 140-40 240-6"/>
        <path d="M0 150c80 20 130-16 200 6s150 40 220 10 130-34 220-4"/>
        <path d="M0 214c70 22 128-20 196 2s146 42 214 12 138-36 230-8"/></g>
      <g fill="#ffffff" fill-opacity=".13" stroke="#ffffff" stroke-opacity=".34" stroke-width="1.6" stroke-dasharray="7 5">
        <path d="M356 236l86-40 92 30-14 74-96 12z"/><path d="M470 100l74 22-8 62-70-16z"/></g>
      <path d="M362 274c52-6 66-56 106-68s56 22 92-14" stroke="${a}" stroke-width="6" fill="none" stroke-linecap="round"/>
      <g fill="${a}"><circle cx="362" cy="274" r="9"/><circle cx="468" cy="206" r="7"/><circle cx="560" cy="192" r="9"/></g>
      <g fill="none" stroke="#ffffff" stroke-opacity=".38" stroke-width="2"><circle cx="468" cy="206" r="16"/><circle cx="560" cy="192" r="18"/></g>
      <g stroke="#ffffff" stroke-opacity=".55" stroke-width="2" fill="none"><path d="M470 62v18M461 71h18"/></g>
      <text x="486" y="70" font-family="${MONO}" font-size="13" fill="rgba(255,255,255,.6)">N</text>
      <g stroke="#ffffff" stroke-opacity=".5" stroke-width="2"><path d="M28 326h96M28 320v12M76 320v12M124 320v12"/></g>
      <text x="132" y="331" font-family="${MONO}" font-size="12" fill="rgba(255,255,255,.6)">500 km</text>
      ${wm('01', 'rgba(255,255,255,.035)', MONO, 132, 590, 262)}
      <text x="28" y="86" font-family="${MONO}" font-size="13" letter-spacing="3" fill="rgba(255,255,255,.55)">AGRI · 热门推演 ${T.no}</text>
      <text x="27" y="172" font-family="${SANS}" font-size="62" font-weight="700" fill="#f2fbf0">${T.title}</text>
      <rect x="29" y="192" width="80" height="5" rx="2.5" fill="${a}"/>
      <text x="29" y="226" font-family="${MONO}" font-size="18" letter-spacing="2.4" fill="rgba(233,246,230,.66)">${T.sub}</text>`,
    typeBlock: () => ''
  },
  {
    key: 'E', name: '告警面板 Alert Panel', when: '价格异常、风险、断链、超阈值类主题；要"一眼看到严重程度"。',
    base: '近黑底（#101418→#0a0d10）+ 20px 细网格 + 顶部状态色横条',
    geo: '允许两色（主状态色 + 琥珀辅色）：柱状 + 阈值虚线 + 尖峰红点 + 96px 大数字',
    type: '大数字 96px 等宽作主视觉；标题 44px 粗体；状态胶囊（高危/中等/正常）；副标等宽 15px',
    accent: '#ff4d4f', palette: ['#101418', '#0a0d10', '#ff4d4f', '#ffb020'],
    doNot: '本套是唯一允许两色的例外，但只允许"一主一辅"，且辅色只出现在阈值/标注上',
    shell: { bg: '#15191d', border: '1px solid #252b31', radius: '0', title: '#eef2f5', meta: '#ff6b6b', tagBg: '#2a1517', tagBd: '#5a2426', tagFg: '#ff8a8a', desc: '#9aa6b0' },
    svg: (a) => `
      <defs><linearGradient id="bgE" x1="0" y1="0" x2=".7" y2="1"><stop offset="0" stop-color="#101418"/><stop offset="1" stop-color="#0a0d10"/></linearGradient></defs>
      <rect width="640" height="360" fill="url(#bgE)"/>${grid(20, '#ffffff', .045)}
      <rect x="0" y="0" width="640" height="6" fill="${a}"/>
      <text x="600" y="330" font-size="112" font-weight="700" fill="rgba(255,255,255,.045)" font-family="${MONO}" text-anchor="end">2.4×</text>
      <g stroke="rgba(255,255,255,.16)" stroke-width="16"><path d="M392 320V262M428 320V278M464 320V238M500 320V252M536 320V206M572 320V216M606 320V140"/></g>
      <g stroke="${a}" stroke-width="16"><path d="M606 320V140"/></g>
      <path d="M378 252h240" stroke="#ffb020" stroke-width="3" stroke-dasharray="12 8"/>
      <text x="382" y="244" font-family="${MONO}" font-size="13" fill="#ffb020">阈值 22.0</text>
      <circle cx="606" cy="140" r="13" fill="none" stroke="${a}" stroke-width="5"/>
      <circle cx="606" cy="140" r="26" fill="none" stroke="${a}" stroke-width="2" stroke-opacity=".5"/>
      <g transform="translate(470 96)"><rect x="0" y="0" width="118" height="30" fill="${a}"/><text x="59" y="21" font-family="${MONO}" font-size="15" font-weight="700" fill="#14090a" text-anchor="middle">高危 · 24.60</text></g>
      <text x="28" y="80" font-family="${MONO}" font-size="12" letter-spacing="3" fill="rgba(255,255,255,.5)">AGRI · 热门推演 ${T.no}</text>
      <text x="27" y="134" font-family="${SANS}" font-size="42" font-weight="700" fill="#f4f7f9">${T.title}</text>
      <text x="25" y="216" font-size="86" font-weight="700" font-family="${MONO}" fill="#ffffff">24.6</text>
      <text x="212" y="216" font-family="${MONO}" font-size="19" fill="rgba(255,255,255,.5)">元/kg</text>
      <text x="29" y="252" font-family="${MONO}" font-size="15" letter-spacing="2.2" fill="rgba(255,255,255,.6)">${T.sub}</text>
      <rect x="27" y="264" width="300" height="3" fill="${a}" fill-opacity=".55"/>`,
    typeBlock: () => ''
  }
];

/* ---------------- 预览页 ---------------- */
const cover = (s) => `<svg viewBox="0 0 640 360" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">${s.svg(s.accent)}</svg>`;
const card = (s) => {
  const sh = s.shell;
  return `<div class="col"><div class="cap">${s.key} · ${s.name}</div>
  <div class="card" id="c-${s.key}" style="background:${sh.bg};border:${sh.border}">
    <span class="cov">${cover(s)}</span>
    <span class="b" style="color:${sh.title}">
      <span class="h"><span style="color:${sh.meta}">${T.no}</span><span class="tag" style="background:${sh.tagBg};border-color:${sh.tagBd};color:${sh.tagFg}">${T.tag}</span><span class="arw" style="color:${sh.meta};border-color:${sh.tagBd}">↗</span></span>
      <span class="t">${T.zh}</span><span class="d" style="color:${sh.desc}">${T.desc}</span>
    </span></div></div>`;
};
const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;background:#eef1f3;font-family:${SANS}}
.wrap{display:grid;grid-template-columns:1fr 1fr;gap:22px;padding:22px}
.col .cap{font:700 12px ${MONO};letter-spacing:.08em;color:#4b5563;margin:0 0 8px}
.card{border-radius:0;overflow:hidden;box-shadow:0 2px 8px #1113}
.cov{display:block;aspect-ratio:16/9}.cov svg{display:block;width:100%;height:100%}
.b{display:block;padding:13px 15px 16px}
.h{display:flex;align-items:center;gap:9px;font:700 12px ${MONO}}
.tag{font-size:10px;letter-spacing:.08em;padding:2px 6px;border:1px solid}
.arw{margin-left:auto;width:22px;height:22px;border:1px solid;border-radius:50%;display:grid;place-items:center;font-size:13px}
.t{display:block;margin-top:9px;font-size:14px;font-weight:650}
.d{display:block;margin-top:6px;font-size:11.5px;line-height:1.65}
</style><div class="wrap">${STYLES.map(card).join('')}<div class="col"><div class="cap">五套并排</div></div></div>`;

fs.mkdirSync('/tmp/card-styles', { recursive: true });
fs.writeFileSync('/tmp/card-styles/preview.html', html);

/* ---------------- presets.json ---------------- */
const presets = {
  version: 1,
  canvas: { ratio: '16:9', viewBox: '0 0 640 360', slice: true },
  skeleton: {
    zones: ['左上：小标 AGRI · 热门推演 {no}', '左下：主标题 {title} + 强调短线 + 等宽英文副标 {sub}', '右侧：图形区（单一视觉隐喻）', '右下：编号水印 {no}'],
    forbid: ['外部图片', '照片/3D', '多于预设的颜色数', '圆角卡片（除预设注明）', '装饰性文案']
  },
  styles: STYLES.map((s) => ({
    key: s.key, name: s.name, accent: s.accent, palette: s.palette,
    background: s.base, graphic: s.geo, typography: s.type, forbid: s.doNot,
    card_shell: s.shell, use_when: s.when
  }))
};
fs.writeFileSync(path.join(OUT, 'presets.json'), JSON.stringify(presets, null, 2));

/* ---------------- STYLES.md ---------------- */
const promptZh = (s) => `请你扮演版式工程师，按下面的风格规格输出一张 16:9 封面（**只输出 \`\`\`svg 代码块，不要解释**）。

【风格】${s.key} · ${s.name}
【画布】viewBox="0 0 640 360"，preserveAspectRatio="xMidYMid slice"
【底板】${s.base}
【图形】${s.geo}
【排版】${s.type}
【配色】底色 ${s.palette[0]} / ${s.palette[1]}，强调色 ${s.accent}，文字 ${s.palette[3]}
【内容】编号 ${T.no}；主标题「${T.title}」；英文副标「${T.sub}」；小标「AGRI · 热门推演 ${T.no}」
【禁止】${s.doNot}
【硬要求】1) 只用一个 <svg> 根元素，内联样式，不引外部资源；2) 所有文字必须真实可读（不许乱码占位）；3) 中文标题不得换行、不得溢出画布；4) 图形区只表达「${T.zh}」这一个含义，不要堆元素。`;

const promptEn = (s) => `16:9 cover card, style "${s.name}". Base: ${s.base}. Graphic: ${s.geo}. Type: ${s.type}. Palette: ${s.palette.slice(0, 2).join(' → ')} background, single accent ${s.accent}, text ${s.palette[3]}. Content: number "${T.no}", large Chinese title "${T.title}", uppercase mono subtitle "${T.sub}", small label "AGRI · HOT TOPIC ${T.no}". Flat vector, print-like layout, generous negative space. Avoid: photo, 3D, extra colors, decorative filler text.`;

const md = `# 封面风格预设（5 套）

给工程用的：把下面任一风格的「提示词」连同一行主题数据丢给语言模型，它就能按同一套版式出封面；也可以把 \`presets.json\` 直接喂给程序或模型当参数。

## 怎么用（三种）

1. **要一张封面**：选一套风格 → 复制那一节的「提示词」→ 替换【内容】里的编号 / 主标题 / 英文副标 → 丢给模型，拿回 \`svg\`。
2. **要一批**：把 \`presets.json\` + 下面「主题清单」的 JSON 一起给模型，让它按数组输出多张 SVG，字段一一对应。
3. **要栅格图**：用每节的「图像模型提示词（英文）」喂图像模型；风格会接近，但文字位置不保证，建议后期再叠字。

## 通用骨架（五套共用，只换表皮）

- 16:9，\`viewBox="0 0 640 360"\`，切片填充；
- 左上：等宽小标 \`AGRI · 热门推演 {no}\`；
- 左下：主标题（大、粗、近白或墨黑）+ 一条强调短线 + 等宽大写英文副标；
- 右侧：**一个**视觉隐喻的图形区；
- 右下：编号 \`{no}\` 作水印；
- 卡片外壳：白/纸/深底矩形 + 1px 边框 + 编号 + 标签胶囊 + 右上圆形箭头，hover 上浮 2px（圆角 0）。

**验收清单**（模型输出后照这个看）：① 只有 SVG、无外部资源；② 颜色不超过预设；③ 标题不换行不溢出；④ 图形只讲一个意思；⑤ 编号/副标/小标都在位。

## 主题数据长这样（丢给模型的部分）

\`\`\`json
{ "no": "01", "title": "榴莲价格", "sub": "PRICE VOLATILITY", "zh": "榴莲价格波动推演", "tag": "价格", "desc": "产地季重叠、到货量变化对批发价与份额的影响" }
\`\`\`

---

${STYLES.map((s) => `## ${s.key} · ${s.name}

**什么时候用**：${s.when}

| 项 | 规格 |
| --- | --- |
| 底板 | ${s.base} |
| 图形 | ${s.geo} |
| 排版 | ${s.type} |
| 配色 | 底 \`${s.palette[0]}\` → \`${s.palette[1]}\`；强调 \`${s.accent}\`；文字 \`${s.palette[3]}\` |
| 禁止 | ${s.doNot} |

**提示词（中文，直接复制）**

\`\`\`text
${promptZh(s)}
\`\`\`

**图像模型提示词（英文）**

\`\`\`text
${promptEn(s)}
\`\`\`

预览：\`preview-${s.key}.png\`
`).join('\n---\n\n')}
`;
fs.writeFileSync(path.join(OUT, 'STYLES.md'), md);

/* ---------------- 截图 ---------------- */
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1400 }, deviceScaleFactor: 2 });
await page.goto('file:///tmp/card-styles/preview.html');
await page.waitForTimeout(400);
for (const s of STYLES) await page.locator('#c-' + s.key).screenshot({ path: path.join(OUT, 'preview-' + s.key + '.png') });
await page.screenshot({ path: path.join(OUT, 'preview-all.png'), fullPage: true });
await browser.close();
console.log('styles', STYLES.length, '→', OUT);
