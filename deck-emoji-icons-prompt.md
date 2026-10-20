# 前端任务：deck.gl 地图上的叠加图层 emoji 图标（React + TypeScript）

你是资深前端工程师。项目栈固定为 **React 18 + TypeScript + deck.gl 9（@deck.gl/core、@deck.gl/layers、@deck.gl/react）**，地图本身就是 deck.gl 渲染的（**不是 ECharts**，也不要用图片图标）。请实现下面这套「5 个叠加图层图标」。

## 0. 验收标准（任何一条不满足都算未完成）

1. 图标是**彩色 emoji 字形**（来自项目内置的子集字体，跨系统外观一致），不是 PNG/SVG 图片、不是图标字体里的自绘图形；
2. **背景完全透明**：图标四边形内除字形像素外不绘制任何东西（无白底、无描边、无圆角底板、无阴影）；
3. 在 deck.gl 地图上**性能可接受**：≥ 2,000 个图标点仍能流畅拖动缩放（不允许每个点一个图片请求，不允许每帧重建纹理）；
4. 支持 `pickable` 点击/悬停，能拿到被点中的数据对象；
5. 地图缩放、倾斜、旋转时图标保持屏幕对齐（billboard），尺寸不随 zoom 变化；
6. 面板/图例/悬浮提示（DOM 场景）里同一套字形必须有**一致的观感**；
7. TypeScript 严格模式通过（无 `any` 兜底、无 `@ts-ignore`）；
8. 产出实测结果（见第 8 节），不接受"已完成"式结论。

## 1. 技术选型（这条有实测依据，别自行更换）

**必须用 `IconLayer` + 运行时生成的 RGBA 图集；不要用 `TextLayer`。**

原因（我实测过同一批数据、同一字体）：

| 方案 | 彩色像素数（5 个图标渲染后统计） | 结论 |
|---|---|---|
| `IconLayer` + canvas 生成 RGBA 图集 | **1,056** | 彩色正常 ✅ |
| `TextLayer` + `fontFamily:'AgriEmoji'` | **13**（字形被画成黑色剪影） | 丢失颜色 ❌ |

原因：`TextLayer` 内部把字符烘焙进单通道 alpha 图集再着色，彩色 emoji（COLR/SVG 字形）会退化为单色剪影。`IconLayer` 直接把 RGBA 图集当纹理贴，颜色原样保留。

## 2. 图标与码位（严格照抄，含 VS16）

| 图层 | 字符 | 码位 | LayerKind |
|---|---|---|---|
| 农作物主要产区/基地 | 🌾 | `U+1F33E` | `farm` |
| 港口 | ⚓ | `U+2693 U+FE0F` | `port` |
| 机场 | ✈️ | `U+2708 U+FE0F` | `airport` |
| 农贸市场 | 🏪 | `U+1F3EA` | `market` |
| 地缘风险区 | ⚠️ | `U+26A0 U+FE0F` | `risk` |

`U+FE0F`（VS16）不能省：`⚓ ✈️ ⚠️` 只有基础码位时，某些环境会按"文字形态"渲染成单色轮廓。

## 3. 字体资源

- 文件：`agri-emoji.woff2`（26KB，Noto Color Emoji 的 5 码位子集，字体族名 `AgriEmoji`，SIL OFL 1.1；另有 4.6KB 的精简版 `agri-emoji-lean.woff2`，注意 Safari 16 以下会退化成单色）；
- 放置：`public/fonts/agri-emoji.woff2`（Vite/Next 均如此；webpack 用 `url()` 让 loader 处理）；
- 若需要自己生成：

```bash
curl -L -o NotoColorEmoji-full.ttf \
  "https://fonts.gstatic.com/s/notocoloremoji/v47/Yq6P-KqIXTD0t4D9z1ESnKM3-HpFab4.ttf"
pyftsubset NotoColorEmoji-full.ttf \
  --unicodes="U+1F33E,U+2693,U+2708,U+1F3EA,U+26A0" \
  --flavor=woff2 --output-file=agri-emoji.woff2 \
  --no-hinting --layout-features='*' --name-IDs='*'
```
OFL 许可要求：子集必须重命名字体族（用 `AgriEmoji`），并在 CSS 顶部保留来源与许可说明。

## 4. 需要产出的文件

```
public/fonts/agri-emoji.woff2
src/styles/agri-emoji.css                    # @font-face + DOM 场景的图标类
src/lib/agriEmoji.ts                         # 码位表 + 图集生成（buildEmojiAtlas）
src/hooks/useAgriEmojiAtlas.ts               # 模块级单例 + React hook
src/layers/overlayIconLayer.ts               # IconLayer 工厂
src/components/AgriIcon.tsx                  # DOM 场景（图例/面板/提示）的图标组件
```

## 5. 核心实现（按此实现，签名与关键项不要改）

### 5.1 `src/lib/agriEmoji.ts`

```ts
export type LayerKind = 'farm' | 'port' | 'airport' | 'market' | 'risk';

export const AGRI_EMOJI: Record<LayerKind, string> = {
  farm: '\u{1F33E}',
  port: '\u2693\uFE0F',
  airport: '\u2708\uFE0F',
  market: '\u{1F3EA}',
  risk: '\u26A0\uFE0F',
};

export interface IconAtlasEntry {
  x: number; y: number; width: number; height: number;
  anchorX: number; anchorY: number; mask: boolean;
}
export interface AgriEmojiAtlas {
  iconAtlas: string;                                   // PNG data URL
  iconMapping: Record<LayerKind, IconAtlasEntry>;
}

export async function buildEmojiAtlas(opts: { cell?: number; fontFamily?: string; pad?: number } = {}): Promise<AgriEmojiAtlas> {
  const cell = opts.cell ?? 96;                        // ≥ 3× 最大显示尺寸，放大不糊
  const fontFamily = opts.fontFamily ?? 'AgriEmoji';
  const pad = opts.pad ?? 8;
  const kinds = Object.keys(AGRI_EMOJI) as LayerKind[];

  // 必须先等字体就绪：否则会把 tofu 方块烤进图集，而且不会自愈
  const fontSpec = `${cell - pad * 2}px '${fontFamily}'`;
  await document.fonts.load(fontSpec);
  if (!document.fonts.check(fontSpec)) {
    throw new Error('[agri-emoji] 子集字体未加载：检查 @font-face 路径与 unicode-range');
  }

  const canvas = document.createElement('canvas');
  canvas.width = cell * kinds.length;
  canvas.height = cell;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('[agri-emoji] 2D context 不可用');

  ctx.clearRect(0, 0, canvas.width, canvas.height);     // 透明底：clearRect，不要 fillRect
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = fontSpec;

  const iconMapping = {} as Record<LayerKind, IconAtlasEntry>;
  kinds.forEach((kind, i) => {
    ctx.fillText(AGRI_EMOJI[kind], i * cell + cell / 2, cell / 2);
    iconMapping[kind] = {
      x: i * cell, y: 0, width: cell, height: cell,
      anchorX: cell / 2, anchorY: cell / 2,
      mask: false,                                     // 必须 false：true 会被当遮罩着色，彩色丢失
    };
  });

  return { iconAtlas: canvas.toDataURL('image/png'), iconMapping };
}
```

### 5.2 `src/hooks/useAgriEmojiAtlas.ts`（单例，避免每帧重建纹理）

```ts
import { useEffect, useState } from 'react';
import { buildEmojiAtlas, type AgriEmojiAtlas } from '../lib/agriEmoji';

let atlasPromise: Promise<AgriEmojiAtlas> | null = null;
export function loadAgriEmojiAtlas(): Promise<AgriEmojiAtlas> {
  return (atlasPromise ??= buildEmojiAtlas());
}
export function useAgriEmojiAtlas(): AgriEmojiAtlas | null {
  const [atlas, setAtlas] = useState<AgriEmojiAtlas | null>(null);
  useEffect(() => {
    let alive = true;
    loadAgriEmojiAtlas().then(a => { if (alive) setAtlas(a); })
      .catch(err => console.error(err));               // 失败时保持 null，调用方回退
    return () => { alive = false; };
  }, []);
  return atlas;
}
```

### 5.3 `src/layers/overlayIconLayer.ts`

```ts
import { IconLayer } from '@deck.gl/layers';
import { AGRI_EMOJI, type AgriEmojiAtlas, type LayerKind } from '../lib/agriEmoji';

export interface OverlayPoint { id: string; kind: LayerKind; position: [number, number]; label?: string }

export function createOverlayIconLayer(
  points: OverlayPoint[],
  atlas: AgriEmojiAtlas,
  opts: { id?: string; size?: number; onClick?: (p: OverlayPoint) => void } = {},
) {
  return new IconLayer<OverlayPoint>({
    id: opts.id ?? 'agri-overlay-icons',
    data: points,
    iconAtlas: atlas.iconAtlas,
    iconMapping: atlas.iconMapping,
    getIcon: (d) => d.kind,
    getPosition: (d) => d.position,
    getSize: opts.size ?? 28,
    sizeUnits: 'pixels',            // 缩放地图时图标大小不变
    pickable: true,
    autoHighlight: true,
    highlightColor: [255, 255, 255, 120],
    onClick: (info) => { if (info.object) opts.onClick?.(info.object); },
    // 不要用 getColor 换色：它会与图集颜色相乘，彩色会被“染”掉
  });
}
```

### 5.4 React 接线

```tsx
const atlas = useAgriEmojiAtlas();
const overlayLayers = useMemo(
  () => (atlas ? [createOverlayIconLayer(points, atlas, { size: 28 })] : []),
  [atlas, points],
);
// 与现有 baseLayers 合并后交给 DeckGL
<DeckGL layers={[...baseLayers, ...overlayLayers]} controller viewState={viewState} onViewStateChange={onViewStateChange} />
```
字体/图集未就绪时不要渲染半成品：`atlas` 为 `null` 就先不挂这层（或先渲染 DOM 文字占位），避免出现方块。

### 5.5 DOM 场景（图例 / 面板 / tooltip）——同一套字形

```css
/* src/styles/agri-emoji.css */
@font-face {
  font-family: 'AgriEmoji';
  src: url('/fonts/agri-emoji.woff2') format('woff2');
  font-weight: 400; font-style: normal; font-display: swap;
  unicode-range: U+1F33E, U+2693, U+2708, U+1F3EA, U+26A0, U+FE0F;
}
.agri-ic {
  font-family: 'AgriEmoji', 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif;
  font-style: normal; line-height: 1; display: inline-block; vertical-align: -0.125em;
  background: transparent; border: 0; box-shadow: none;
}
.agri-ic--sm { font-size: 13px; } .agri-ic--md { font-size: 16px; } .agri-ic--lg { font-size: 22px; }
```
```tsx
export function AgriIcon({ kind, size = 'md', label }: { kind: LayerKind; size?: 'sm'|'md'|'lg'; label?: string }) {
  return (
    <span className={`agri-ic agri-ic--${size}`} role={label ? 'img' : undefined}
          aria-label={label} aria-hidden={label ? undefined : true}>{AGRI_EMOJI[kind]}</span>
  );
}
```
deck.gl 的 `getTooltip` 返回 HTML 时可以直接用同一个字符：
```ts
getTooltip: ({ object }) => object && ({ html: `<span class="agri-ic agri-ic--md">${AGRI_EMOJI[object.kind]}</span> ${object.label ?? ''}` });
```

## 6. 必须规避的坑（都是实测过的）

1. **不要用 `TextLayer`**：彩色 emoji 会变成单色剪影（实测彩色像素 1,056 → 13）。
2. **`iconMapping.mask` 必须 `false`**：为 `true` 时 deck.gl 把图集当遮罩，颜色被 `getColor` 取代。
3. **建图集前必须 `await document.fonts.load(...)`**：否则烤进图集的是 tofu 方块，且不会自愈（只能重建图集）。
4. **图集 canvas 用 `clearRect`**，不要 `fillRect` 填色，否则每个图标都带一块底色。
5. **图集 cell ≥ 3× 最大显示像素**（显示 28px 就用 96px cell），否则放大发虚。
6. **不要在 render 里调 `buildEmojiAtlas()`**：`toDataURL` + 纹理上传很贵，用模块级单例（第 5.2 节）。
7. **不要给每个点配独立图片**：一个图集 = 一个 draw call；2000 个点用 `IconLayer` 完全没压力。
8. **`getColor` 只用来调透明度**（如 `[255,255,255,200]`），不要用来换色——它与图集颜色相乘。
9. **字体 `unicode-range` 不能漏**，否则这个字体可能被用于页面其它文本，导致缺字回退异常。
10. **VS16 不能丢**：`\u2708` 少了 `\uFE0F`，部分环境会渲染成单色轮廓。
11. **SVG 表格版的字体在 Safari 16 以下才彩色**：若用 4.6KB 精简版，需接受老 Safari 变单色，或直接用 26KB 版。

## 7. 浏览器/档位

- deck.gl 9 + WebGL2：Chrome/Edge 98+、Firefox 106+、Safari 15.4+；
- 彩色字形：26KB 版全支持；4.6KB 精简版在 Safari 16 以下退化为单色（仍可辨认）；
- 字体加载失败时：`atlas` 保持 `null`，图层不渲染，DOM 场景回退系统 emoji。

## 8. 自检（逐条给实测值，不接受"已完成"）

1. `document.fonts.check("64px 'AgriEmoji'")` 为 `true`，且该 `FontFace.status === 'loaded'`；
2. 图集 `canvas.width === cell * 5`、`height === cell`，且 `iconMapping` 五项的 `mask` 均为 `false`；
3. 截图后逐图标统计：每个图标区域内 **≥ 100 种非背景彩色像素**（彩色≠单色，也≠tofu 方块）；
4. 在带底色容器里截图，沿图标中心 9px 的 8 个方向采样，**不出现接近 rgb(255,255,255) 的像素**（证明无白底）；
5. `deck.pickObject({x,y})` 命中的 `object.kind` 与点击位置的图标一致；
6. 20 / 28 / 48px 三档显示都不糊、不裁切；
7. 地图 zoom 从最小到最大、pitch 0→60 时图标大小不变形（billboard，`sizeUnits:'pixels'`）；
8. 2,000 个点的合成数据下拖动 10 秒，Chrome Performance 面板无 > 50ms 的长任务（或说明实际数值）；
9. `points` 引用不变时 React 不重建图层（`useMemo` 依赖正确）。

## 9. 禁止事项

- 不许用 `TextLayer` 渲染这 5 个图标；
- 不许改成 PNG/SVG 图片方案（除非我明确要求），不许每个点单独图片；
- 不许给图标加底色、描边、圆角底板、投影；
- 不许手绘/重绘 emoji 图形，不许引入第三方图标库或 emoji 资源包；
- 不许改码位、`LayerKind` 命名、CSS 类名。
