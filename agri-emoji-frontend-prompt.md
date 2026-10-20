# 前端实现任务：叠加图层 emoji 图标系统（本地子集字体 + CSS 类）

你是前端工程师。请在我提供的项目里实现下面这套「5 个叠加图层图标」。**严格按规格实现，不要自创图标、不要换成图片或手画 SVG。**

## 0. 验收标准（做错任何一条都算未完成）

1. 图标是**彩色 emoji 字形本身**（矢量彩色字形），不是 PNG/SVG 图片、不是图标字体里的自绘图形；
2. **背景完全透明**：图标区域内除字形像素以外什么都不画——没有白色圆底、没有色块、没有边框、没有内边距、没有阴影；
3. **不依赖系统 emoji 字体**：使用项目内置的子集字体文件；字体未加载完成时回退系统 emoji，不出现空白或方块；
4. 子集字体只包含下述 5 个码位，woff2 体积 **≤ 30KB**；
5. 任意字号清晰（放大到 64px 边缘依然锐利）；
6. 有语义化标签（读屏能读出图标含义），纯装饰时可 `aria-hidden`；
7. 提供自检结果（见第 8 节），不接受"已完成"这类无证据结论。

## 1. 5 个图标与码位（严格照抄，含 VS16）

| 图层 | 字符 | 码位 | 建议类名 |
|---|---|---|---|
| 农作物主要产区/基地 | 🌾 | `U+1F33E` | `.agri-ic--farm` |
| 港口 | ⚓ | `U+2693 U+FE0F` | `.agri-ic--port` |
| 机场 | ✈️ | `U+2708 U+FE0F` | `.agri-ic--airport` |
| 农贸市场 | 🏪 | `U+1F3EA` | `.agri-ic--market` |
| 地缘风险区 | ⚠️ | `U+26A0 U+FE0F` | `.agri-ic--risk` |

`U+FE0F` 是 emoji 变体选择符（VS16）：**⚓ / ✈️ / ⚠️ 三个必须带上**，否则部分浏览器会按"文字形态"渲染成单色轮廓。

## 2. 需要产出的文件

```
<public 静态目录>/fonts/agri-emoji.woff2        # 子集字体（我可能已经给你，见第 3 节）
<样式目录>/agri-emoji.css                        # 字体声明 + 基础类 + 5 个图标类
<组件目录>/AgriIcon.(tsx|vue|svelte)             # 可选：按项目技术栈封装的图标组件
```

## 3. 字体：来源与生成（如果我直接把 woff2 给了你，跳过本节）

源字体：**Noto Color Emoji**（SIL Open Font License 1.1，允许商用与再分发）。
子集只保留 5 个码位，体积从 25MB 降到几十 KB：

```bash
# 1) 取官方全量字体（Google Fonts 的单文件 TTF 端点）
curl -L -o NotoColorEmoji-full.ttf \
  "https://fonts.gstatic.com/s/notocoloremoji/v47/Yq6P-KqIXTD0t4D9z1ESnKM3-HpFab4.ttf"

# 2) 子集（生成两份，二选一使用）
#  A. 兼容最广（COLR + SVG 双表，Safari 16 以下也彩色）≈ 26KB
pyftsubset NotoColorEmoji-full.ttf \
  --unicodes="U+1F33E,U+2693,U+2708,U+1F3EA,U+26A0" \
  --flavor=woff2 --output-file=agri-emoji.woff2 \
  --no-hinting --layout-features='*' --name-IDs='*'

#  B. 精简版（只留 COLR 表）≈ 4.6KB
pyftsubset NotoColorEmoji-full.ttf \
  --unicodes="U+1F33E,U+2693,U+2708,U+1F3EA,U+26A0" \
  --flavor=woff2 --output-file=agri-emoji-lean.woff2 \
  --no-hinting --layout-features='*' --name-IDs='*' --drop-tables+=SVG
```

要求：
- 按 OFL 许可，**子集必须重命名字体族**（这里用 `AgriEmoji`），并在 CSS 顶部保留来源与许可说明；
- 字体族名不要沿用 `Noto Color Emoji`。

## 4. CSS 规格（变量名、类名、数值都不要改）

```css
/* AgriEmoji · 叠加图层图标（Noto Color Emoji 的 5 码位子集，SIL OFL 1.1，已重命名） */
@font-face {
  font-family: 'AgriEmoji';
  src: url('/fonts/agri-emoji.woff2') format('woff2');   /* 静态资源路径按项目调整 */
  font-weight: 400;
  font-style: normal;
  font-display: swap;                                    /* 未加载时先用系统 emoji，不闪空 */
  unicode-range: U+1F33E, U+2693, U+2708, U+1F3EA, U+26A0, U+FE0F;  /* 只影响这 5 个码位 */
}

.agri-ic {
  font-family: 'AgriEmoji', 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
  font-style: normal;
  font-weight: 400;
  line-height: 1;
  display: inline-block;
  vertical-align: -0.125em;
  background: transparent;      /* 透明三件套：不要 background */
  border: 0;                    /*              不要 border */
  box-shadow: none;             /*              不要 box-shadow */
}

.agri-ic--xs { font-size: 11px; }
.agri-ic--sm { font-size: 13px; }
.agri-ic--md { font-size: 16px; }
.agri-ic--lg { font-size: 22px; }

/* 只写类名、不写字符的用法 */
.agri-ic--farm::before    { content: "\1F33E"; }
.agri-ic--port::before    { content: "\2693\FE0F"; }
.agri-ic--airport::before { content: "\2708\FE0F"; }
.agri-ic--market::before  { content: "\1F3EA"; }
.agri-ic--risk::before    { content: "\26A0\FE0F"; }
```

## 5. 用法（按我的技术栈实现其中一种或多种）

**纯 HTML：字符写在带类的元素里（推荐，可访问性最好）**
```html
<span class="agri-ic agri-ic--lg" role="img" aria-label="机场">✈️</span>
```

**纯 HTML：只用类名（数据驱动渲染时方便）**
```html
<i class="agri-ic agri-ic--md agri-ic--airport" role="img" aria-label="机场"></i>
```

**地图锚点（图标是 DOM 层，位置 = 经纬度换算的像素）**
```html
<div class="map">
  <span class="map-pin agri-ic agri-ic--md agri-ic--market" style="left:66%;top:66%"></span>
</div>
```
```css
.map { position: relative; overflow: hidden; }
.map-pin { position: absolute; transform: translate(-50%, -50%); }
```

**React（TS）**
```tsx
type LayerKind = 'farm' | 'port' | 'airport' | 'market' | 'risk';
const GLYPH: Record<LayerKind, string> = {
  farm: '🌾', port: '⚓', airport: '✈️', market: '🏪', risk: '⚠️',
};
export function AgriIcon({ kind, size = 'md', label }: { kind: LayerKind; size?: 'xs'|'sm'|'md'|'lg'; label?: string }) {
  return (
    <span className={`agri-ic agri-ic--${size}`} role={label ? 'img' : undefined}
          aria-label={label} aria-hidden={label ? undefined : true}>
      {GLYPH[kind]}
    </span>
  );
}
```

**ECharts（地图/散点上的图标）**
```js
series: [{
  type: 'scatter', coordinateSystem: 'geo', symbol: 'circle', symbolSize: 13,
  itemStyle: { color: 'transparent', borderWidth: 0 },   // 不画承载圆点
  label: {
    show: true, position: 'inside', fontSize: 13,
    fontFamily: 'AgriEmoji, Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji',
    formatter: () => '✈️',                                // 或 '\u2708\uFE0F'
    backgroundColor: 'transparent', padding: 0, textBorderWidth: 0,
  },
  labelLayout: { hideOverlap: true },
}]
```

**Leaflet / Mapbox / 高德**：用 `L.divIcon` / `Marker` 的 DOM 文本节点，内容为 `<span class="agri-ic agri-ic--airport"></span>`，不要用图片 icon。

## 6. 必须规避的坑（这些是真实踩过的）

1. **不要用 `opacity: 0` 去隐藏承载圆点**——ECharts 的 label 是 item 子元素会继承 opacity，emoji 会一起消失。要隐藏圆点用 `color: 'transparent'`。
2. **不要给图标元素加 `background` / `border` / `box-shadow` / `padding`**，否则就不再透明；需要提升可读性时只能考虑 `text-shadow`（会带轻微光晕，默认不开）。
3. **`unicode-range` 必须写上**，否则这个字体可能被用于页面其它文本，导致缺字回退异常。
4. **VS16 不要丢**：`✈️ ⚠️ ⚓` 若只有基础码位，个别环境会渲染成单色文字形态。
5. **ECharts 全球视角要限流**：世界地图常画 3 份副本，几千个 emoji label 会互相遮挡且拖动卡顿——按经纬度格子做均衡采样（例如世界视角机场最多 180 个），区域视角再用全量。
6. **写自动化探针别只查 `type === 'text'`**：zrender 里 emoji 常落在 `tspan` 上，按 text 过滤会得到"0 个字形"的假结论。
7. **字体未加载时不要出现方块**：`font-display: swap` + 回退链（Apple Color Emoji / Segoe UI Emoji / Noto Color Emoji）即可。

## 7. 浏览器支持

- `woff2` + `COLR/CPAL`：Chrome/Edge 98+、Firefox 106+、Safari 15.4+（若用 lean 版，Safari 16 以下可能退化为单色，故默认给 COLR+SVG 版）；
- 字体加载失败或环境完全不支持彩色字体时，回退到系统 emoji，仍能显示，只是外观随系统。

## 8. 自检清单（逐条给出实测结果与证据，不许只写"已完成"）

1. `document.fonts.check("16px AgriEmoji")` 返回 `true`，且 `document.fonts` 里该 face 的 `status === 'loaded'`；
2. 把 5 个图标各渲染成 64px，截图后逐格统计像素：每格应有 **≥100 种非背景彩色像素**（若渲染失败会是整块背景色；若 tofu 会是方块；若单色则彩色像素≈0）；
3. 在带底色的容器里截图，沿图标中心 9px 的 8 个方向采样：**不应出现接近 `rgb(255,255,255)` 的像素**（有白底就会采到）；
4. 5 个图标在 11 / 13 / 16 / 22px 四档下都不糊、不裁切；
5. ECharts 场景：详情/图例中只出现 1 个解码器级别的元素，无额外 DOM 包装；
6. 提供一张最终截图（含 5 个图标 + 一个地图锚点示例）。

## 9. 禁止事项

- 不许改成 PNG/SVG 图片方案（除非我明确要求）；
- 不许引入第三方图标库/字体包；
- 不许手绘或重绘 emoji 图形；
- 不许修改上述码位、类名、CSS 变量名；
- 不许给图标加底色、描边、圆角矩形等"贴纸"效果。
