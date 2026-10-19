# 事实层 2D 地图配色与动效设计说明（给前端）

本文所有数值都来自当前线上制品 **V2.9**（源码 `src/v03/fact.js` / `src/v03/intake.js` / `src/v03/app.css`），不是设计稿。
配套：`star-flash.svg`（亮星的矢量版）、三张实拍截图（`design-L1-world.png` / `design-L2-china.png` / `design-L3-hunan.png`）。

> **先明确一件事**：2D 地图的配色**权威来源是 `src/v03/fact.js` 里的 `MAP_PALETTE` 常量**，
> 不是 CSS 变量。CSS 的 `--ocean / --land / --land-2 / --map-line / --map-label` 目前**只有 `--ocean` 被用到**
> （用作地图容器 `.fact-mapbox` 的背景色，也就是"海"），其余三个没有代码引用。
> 复刻时请直接取 `MAP_PALETTE`，不要以为改 CSS 变量就能改陆地/边界色。

## 一、2D 底图配色

| 元素 | 取值 | 代码位置 / 说明 |
|---|---|---|
| 海（画布底色） | `#5fbdf2` | CSS `--ocean`（主题 `data-theme="color"`），.fact-mapbox 背景；ECharts 画布本身 `backgroundColor: transparent` |
| 陆地（默认填充） | `#cfe9bd` | `MAP_PALETTE.land` → `geo.itemStyle.areaColor` |
| 陆地（hover 高亮） | `#b6dfa4` | `MAP_PALETTE.land2` → `geo.emphasis.itemStyle.areaColor` |
| 行政边界 | `rgba(224,128,118,.55)`，线宽 `0.7` | `MAP_PALETTE.line` → `geo.itemStyle.borderColor` |
| 区域配色 | 8 色轮换，见下表 | `MAP_PALETTE.regions`，**按接壤关系自动分配**（见下） |
| 地名标签 | `#22303f`，10px，仅 hover 显示 | `MAP_PALETTE.ink` → `geo.emphasis.label` |
| Tooltip | 背景 `rgba(255,255,255,.98)`，描边 `rgba(30,58,92,.22)`，字号 11 | `MAP_PALETTE.tipBg / tipLine` |

**区域配色 8 色**（`MAP_PALETTE.regions`）：

| # | 色值 | # | 色值 |
|---|---|---|---|
| 1 | `#cfe9bd` | 5 | `#c9e6cd` |
| 2 | `#e2efc6` | 6 | `#d7e4b2` |
| 3 | `#b6dfa4` | 7 | `#bcdcc9` |
| 4 | `#eae7c4` | 8 | `#e8f0d8` |

**"不同区域不同色"是怎么来的**（不是固定映射，而是自动图着色）：
1. 取地图 GeoJSON 里每个区域的边界顶点（保留 3 位小数）；
2. 两个区域**共享 ≥2 个边界顶点**才算"接壤"（只碰一个点不算，避免四角相接被当成相邻）；
3. 按邻居数量从多到少排序，依次取"邻居里还没用过的最小颜色下标"，天然保证接壤区域不同色；
4. 同一地图里最多用到 8 色，超出则回绕。

## 二、三个视角的相机参数（全球 / 中国 / 湖南）

| 视角 | 底图 | center（经度,纬度） | zoom | 可缩放范围 | 层级切换阈值 |
|---|---|---:|---:|---|---|
| L1 全球 | `worldChina` | `[107.98, 26.65]` | `1.36` | 1.1 – 2.6 | 放大到 `≥2.15` 进中国 |
| L2 中国 | `china` | `[108.05, 36.15]` | `1.59` | 0.85 – 4 | 放大到 `≥2.6` 进湖南；缩小到 `≤0.95` 回全球 |
| L3 湖南 | `china` | `[111.73, 27.54]` | `9.08` | 3.4 – 16 | 缩小到 `≤3.5` 回中国 |

两个必须知道的技术细节：

- **L1 会画三份世界副本**（经度 ±360°）：`worldCopies(lng,lat) = [-1,0,1].map(c => worldLongitude(lng) + c*360)`。
  所以前端统计点数时要按经度归一到 `[-180,180)` 再去重，否则会是 3 倍。
- **叠加图层（产区/港口/机场/农贸市场/风险区）按视角过滤**：全球全量；中国只保留 `lng 73–136 / lat 17.5–54.5`；湖南只保留 `lng 108–115 / lat 24–31`。全球视角机场最多取 180 个（地理均衡采样，避免几千个 emoji 阻塞）。

## 三、单个事实点怎么画（全部可调值）

| 属性 | 取值 | 说明 |
|---|---|---|
| 形状/尺寸 | 圆点，直径 `6px` | `DOT_SIZE = 6`，屏幕像素（不随 zoom 变） |
| 填充色 | 该事实的**一级分类色** | 见第四节 7 色 |
| 外圈 | `rgba(255,255,255,.92)`，线宽 `0.9` | 白色描边，让高密度点之间留缝 |
| 透明度 | `ageAlpha × 动画系数` | 见下表 |
| 同坐标合并 | 一个点承载多条记录 | 点击时弹出"此位置有 N 条事实"选择器 |
| 光晕（影响圆） | 仅"高影响 + 有真实半径"的点，最多 24 个，屏幕间距 ≥40px | 径向渐变：`10%` 透明度在内圈、`55%` 处 `4%`、边缘 `0`；直径 = `min(88, max(16, radiusPx*1.2))` |
| 光晕默认强度 | high `0.18` / mid `0.13` / low `0.09` | `IMPACT_ALPHA` |
| 涟漪（effectScatter） | 最多 8 个；周期 `7s`；扩散 `4.2` 倍；`stroke` 描边；每轮 `2` 个；透明度 `.55` | 与光晕同一批高影响点 |
| 半径换算 | `radiusPx = 2*radiusKm / ((40075 或 6900)/屏宽/zoom)` | 全球用 40075km 周长，中国/湖南用 6900km 近似 |

**透明度（时间窗年龄）曲线** `ageAlpha`：

| 情况 | 透明度 |
|---|---|
| 时间窗 = 全部，或档案类事实 | `0.9` |
| 距今天 ≤30 天 | `1.0` |
| 30–60 天 | `0.9` |
| 60 天以后 | 线性衰减到 `0`（窗口边界处正好消失） |

## 四、7 个一级事实分类的色值（点的填充色）

| 一级分类 | CSS 变量 | 色值 |
|---|---|---|
| 自然与生态 | `--fact-l1-1` | `#4f8fa8` |
| 生产与供给 | `--fact-l1-2` | `#6aa35c` |
| 流通与供应链 | `--fact-l1-3` | `#43a09a` |
| 市场与交易 | `--fact-l1-4` | `#c9705f` |
| 消费与舆情 | `--fact-l1-5` | `#8d7fbe` |
| 政策与治理 | `--fact-l1-6` | `#5d80c4` |
| 宏观与公共事件 | `--fact-l1-7` | `#b08a3c` |

（这 7 个值确实存在于 CSS 里，且被 `src/v03/theme.js` 读取后用于点、光晕、3D 点、菜单图例。）

## 五、新事实点"亮起来"的效果是怎么做的

**结论：不是 SVG 图片，也不是 canvas 绘制的；是 DOM 里插一个 `.star-flash` 元素 + CSS 关键帧动画。**
另外还有右侧通知条和卡片高亮，三层一起构成"新事实出现"的观感。

### 5.1 星星本体（`src/v03/intake.js` + `app.css`）

```html
<!-- 插在地图容器里，位置 = 该点经纬度换算出的屏幕像素 -->
<div class="star-flash bright" style="left:908.7px; top:167.9px"><i></i></div>
```

```css
.star-flash{position:absolute;pointer-events:none;z-index:20;transform-origin:50% 50%;
  will-change:transform,opacity;
  animation:starFlash .9s cubic-bezier(.22,1,.36,1) forwards}
.star-flash i{display:block;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;
  background:radial-gradient(circle,
      rgba(255,255,255,.98),
      rgba(255,236,150,.85) 38%,
      rgba(255,214,102,.25) 62%,
      rgba(255,214,102,0) 78%);
  box-shadow:0 0 10px rgba(255,220,120,.75)}
.star-flash.dim i   {width:9px;height:9px;margin:-4.5px 0 0 -4.5px;opacity:.75;box-shadow:0 0 6px rgba(255,220,120,.5)}
.star-flash.bright i{transform:scale(1.5)}

@keyframes starFlash{
  0%  {opacity:0;   transform:scale(.3)}
  20% {opacity:1;   transform:scale(1.2)}
  50% {opacity:.7;  transform:scale(1)}
  100%{opacity:0;   transform:scale(.5)}
}
```

设计要点（复刻时照这个来）：
- 时长 **0.9s**，缓动 `cubic-bezier(.22,1,.36,1)`（先冲后收），`forwards` 停在结束态；
- 先 0.3 倍放大到 1.2 倍（20% 处最亮），再回落到 1 倍（50% 处透明度降到 0.7），最后缩到 0.5 倍淡出；
- 颜色是**暖金色**（不是分类色）：中心白 `#fff` → `#ffec96` → `#ffd666`，外发光 `rgba(255,220,120,.75)`；
- 两档：`bright`（高影响/默认，1.5 倍基底）与 `dim`（9px、透明度 .75）；
- **同一时刻最多 6 颗**（超出先移除最旧的），元素 1s 后自动移除（比动画长 0.1s，保证播完）；
- 位置是**屏幕像素**：经纬度 → `chart.convertToPixel({geoIndex:0})`，落在地图可视区外则不画。

矢量等价版：附件 `star-flash.svg`（径向渐变 + 外发光，同上配色），需要 SVG 资源时直接用它。

### 5.2 右侧通知条与卡片

```css
/* 通知条：从上方 6px 淡入，3.8 秒后淡出，再 350ms 移除 */
.fresh-note{background:#e0f2fe;border:1px solid #0ea5e955;color:#0b7285;font-size:.6875rem;
  border-radius:10px;opacity:0;transform:translateY(-6px);transition:opacity .35s,transform .35s}
.fresh-note.on{opacity:1;transform:none}
.fresh-note b{color:#0369a1}
/* 新卡片：浅蓝描边光晕 + 右上角「新接入」徽标 */
.fcard.is-fresh{box-shadow:0 0 0 2px #0ea5e955, 0 10px 24px -18px #0b7285}
.fcard.is-fresh::after{content:"新接入";position:absolute;top:8px;right:8px;font-size:.5625rem;
  color:#0369a1;background:#e0f2fe;border:1px solid #bae6fd;border-radius:999px;padding:1px 6px}
```

### 5.3 点本身的出现（时间筛选 / 首屏）

| 动画 | 参数 |
|---|---|
| 首屏铺点 | 分批揭示，约 6.5 秒铺完（页面内渐进，不是网络流式） |
| 时间筛选铺点 | 按窗口分档：今天 `1.5s` / 7 天 `1.8s` / 30 天 `2.2s` / 半年 `2.7s` / 一年 `2.9s` / 全部 `3.2s`；缓动 `growK = 1-(1-p)^2.2`（先快后慢） |
| 动画中退场 | 随机取 `n/20`，每个点在动画 `45%–82%` 处开始淡出，淡出时长 = 动画的 `18%`，且钳制到"动画结束前一定收干净" |
| 动画结束 | **冻结**：不再新增、不再消失 |
| 首屏之后 | 每 `10s / 20s / 15s` 循环退场 1 个坐标点（跨视角一致） |

## 六、复刻要点与坑

1. **别开 ECharts 的 `large` 模式**：`large:true` 会忽略逐点 `itemStyle`，所有点变成同一个颜色（我们在 V2.8.5 踩过）。
2. **世界副本 ×3**：L1 统计点/去重前先按经度归一到 `[-180,180)`。
3. **同坐标合并**：一个屏上点可能是多条记录，点开要有"该位置共 N 条"的选择器。
4. **`--ocean` 只决定容器底色**，陆地/边界/区域色在 `MAP_PALETTE` 里；想整体换肤要同时改这两处。
5. **无坐标事实**（直播源等 11 条 `lng=null`）不参与任何点位/退场计算，取坐标键前必须判空（我们因此崩过一次整页）。
6. **ECharts 的 `freshFlash` 系列是历史遗留、当前没有数据源**：亮星效果完全由 5.1 的 DOM 元素 + CSS 完成，别去复刻那个 series。

## 七、这次没做的

- 3D 地球的配色（`--globe-*` 变量）与地球上的点绘制，另有实现，需要的话单独出一份；
- 关联层的本体点/关系线配色（一级本体 4 色 + 关系 6 类建议值）已在上一份色值文档里给过。
