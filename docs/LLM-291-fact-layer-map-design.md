# 事实层 2D 地图配色与动效（精简版）

## 一、2D 底图配色

```text
海（画布底色）        #5fbdf2
陆地默认填充          #cfe9bd
陆地 hover 高亮       #b6dfa4
行政边界              rgba(224,128,118,.55)     线宽 0.7
区域配色（8 色轮换）  #cfe9bd #e2efc6 #b6dfa4 #eae7c4 #c9e6cd #d7e4b2 #bcdcc9 #e8f0d8
地名标签              #22303f   10px   （hover 才显示）
Tooltip              底 rgba(255,255,255,.98)   描边 rgba(30,58,92,.22)
```

区域配色规则（一行）：

```text
共享 ≥2 个边界顶点才算接壤；按邻居数从多到少排序，依次取“邻居未用过的最小下标”
```

三个视角同一套颜色，只有相机不同（复刻取景用）：

```text
全球  center [107.98, 26.65]  zoom 1.36   可缩放 1.1–2.6
中国  center [108.05, 36.15]  zoom 1.59   可缩放 0.85–4
湖南  center [111.73, 27.54]  zoom 9.08   可缩放 3.4–16
```

## 二、事实点（点本身）

方案：一个事实一个点，按一级分类上色，白色描边防止密集处粘连，透明度按时间窗衰减；同坐标的多条记录合并成一个点。

```js
// 一级分类色（见三）
const L1 = {
  nature:'#4f8fa8', supply:'#6aa35c', chain:'#43a09a', market:'#c9705f',
  consume:'#8d7fbe', policy:'#5d80c4', macro:'#b08a3c',
};

// 时间窗透明度：≤30 天 1.0，30–60 天 0.9，之后线性降到 0（窗口边界处正好消失）
const WINDOW = { today: 1, '7d': 7, '30d': 30, '180d': 180, '365d': 365 };
function ageAlpha(f, win) {
  if (f.persistent || win === 'all') return 0.9;          // 档案类/全部时间：恒定 0.9
  const span = WINDOW[win] || 30;
  const t = Date.parse(String(f.date || '').slice(0, 10) + 'T00:00:00Z');
  const now = Date.parse(TODAY + 'T00:00:00Z');            // TODAY = 'YYYY-MM-DD'
  if (!Number.isFinite(t)) return 1;
  const days = Math.max(0, (now - t) / 86400000);
  if (days <= 30) return 1;
  if (days <= 60) return 0.9;
  const k = (days - 60) / Math.max(1, span - 60);
  return Math.max(0, 0.9 * (1 - k));
}

// 同坐标合并：lng,lat 保留 4 位做 key，一个 key 一个点，其余记录挂在 factIds
const groups = new Map();
for (const f of facts) {
  const key = f.lng.toFixed(4) + '|' + f.lat.toFixed(4);
  const g = groups.get(key);
  if (g) { g.factIds.push(f.id); continue; }
  // 第四节的选点要用到 impact / severity / radiusKm / title，一并带过去
  groups.set(key, {
    id: f.id, factIds: [f.id], value: [f.lng, f.lat],
    l1: f.l1, date: f.date, persistent: f.persistent,
    impact: f.impact, severity: f.severity, radiusKm: f.radius, title: f.title,
  });
}

// 点数据
const pts = [...groups.values()].map(g => ({
  id: g.id,
  value: g.value,
  symbolSize: 6,                                    // 直径 6px（屏幕像素，不随 zoom 变）
  itemStyle: {
    color: L1[g.l1],                                // 填充 = 一级分类色
    opacity: ageAlpha(g, TIME) * anim,              // anim = 铺点/退场系数，稳定后为 1
    borderColor: 'rgba(255,255,255,.92)',           // 白色描边
    borderWidth: 0.9,
  },
}));

// series
const series = {
  id: 'facts', type: 'scatter', coordinateSystem: 'geo',
  data: pts, z: 5, cursor: 'pointer', animation: false,
  symbolSize: 6,
  large: false,                                     // 必须 false：large=true 会忽略逐点 color
};
```

## 三、7 个一级事实分类色（点填充色）

```text
自然与生态       #4f8fa8
生产与供给       #6aa35c
流通与供应链     #43a09a
市场与交易       #c9705f
消费与舆情       #8d7fbe
政策与治理       #5d80c4
宏观与公共事件   #b08a3c
```

## 四、地理影响圆（光晕）

方案：高影响事实（severity ≥ 70）按半径换算出像素直径，画一个很淡的径向渐变圆（静态，无关键帧）；同一批点再用 `effectScatter` 的描边环做"呼吸"。半径取值：数据给了 `geo.impactRadiusKm` 就用，没给就按 severity 折算成 `80 + severity × 3.2` 公里。

```js
// hex → rgba
const hexA = (hex, a) => {
  const n = (h => h.length === 3 ? h.split('').map(c => c + c).join('') : h)(hex.replace('#', ''));
  return `rgba(${parseInt(n.slice(0,2),16)},${parseInt(n.slice(2,4),16)},${parseInt(n.slice(4,6),16)},${a})`;
};

// 半径（km）→ 像素直径：地球周长按视角取值，再按画布宽 × zoom 换算
function radiusToPx(km, level, width, zoom) {
  if (!Number.isFinite(km) || km <= 0) return 0;
  const kmPerPixel = (level === 'L1' ? 40075 : 6900) / Math.max(1, width * zoom);
  return (2 * km) / kmPerPixel;                     // 返回直径
}
// 光晕尺寸：直径 × 1.2，上下限 16–88px
const haloSize = diameter => Math.min(88, Math.max(16, diameter * 1.2));

// 圆心能否落屏（落屏外不画）
const toPx = (lng, lat) => {
  try {
    const q = chart.convertToPixel({ geoIndex: 0 }, [lng, lat]);
    return Array.isArray(q) && q.every(Number.isFinite)
      && q[0] >= 0 && q[0] <= mapEl.clientWidth
      && q[1] >= 0 && q[1] <= mapEl.clientHeight ? q : null;
  } catch (e) { return null; }
};

const halos = [], ripples = [], usedHalo = [];

for (const g of groups.values()) {
  const diameter = radiusToPx(g.radiusKm, LEVEL, mapEl.clientWidth, zoom);
  // 条件：仅高影响 + 半径 > 0 + 最多 24 个 + 圆心在屏内 + 与已画的圆心间距 ≥ 40px
  if (!(g.impact === 'high' && diameter > 0 && halos.length < 24
        && toPx(g.value[0], g.value[1])
        && !usedHalo.some(q => {
             const p = toPx(g.value[0], g.value[1]);
             return Math.hypot(q[0] - p[0], q[1] - p[1]) < 40;
           }))) continue;

  const a0 = ageAlpha(g, WIN) * anim;              // anim = 铺点/退场系数
  halos.push({
    id: g.id,
    value: g.value,
    symbolSize: haloSize(diameter),
    itemStyle: {
      color: {
        type: 'radial', x: .5, y: .5, r: .5,
        colorStops: [
          { offset: 0,    color: hexA(L1[g.l1], 0.10 * a0) },   // 圆心只有 10% 不透明
          { offset: 0.55, color: hexA(L1[g.l1], 0.04 * a0) },
          { offset: 1,    color: hexA(L1[g.l1], 0) },
        ],
      },
    },
  });
  usedHalo.push(toPx(g.value[0], g.value[1]));

  if (ripples.length < 8) ripples.push({ id: g.id, name: g.title, value: g.value });
}

// series：光晕 + 涟漪
const haloSeries = {
  id: 'halo', type: 'scatter', coordinateSystem: 'geo',
  data: halos, silent: true, z: 2, symbol: 'circle',
};

const rippleSeries = {
  id: 'ripple', type: 'effectScatter', coordinateSystem: 'geo',
  data: ripples, silent: true, z: 3,
  showEffectOn: 'render',
  rippleEffect: { period: 7, scale: 4.2, brushType: 'stroke', number: 2 },
  itemStyle: { opacity: 0.55 },
};
```

## 五、新事实“亮起来”怎么做的

```js
// 1) 经纬度 → 屏幕像素
const [x, y] = chart.convertToPixel({ geoIndex: 0 }, [lng, lat]);

// 2) 插节点（同屏最多 6 个，超出先删最旧；1 秒后自动移除）
const node = document.createElement('div');
node.className = 'star-flash bright';          // 高影响用 bright，其余用 dim
node.style.left = x + 'px';
node.style.top  = y + 'px';
node.innerHTML = '<i></i>';
mapBox.append(node);
setTimeout(() => node.remove(), 1000);
```

```css
.star-flash {
  position: absolute; pointer-events: none; z-index: 20;
  transform-origin: 50% 50%; will-change: transform, opacity;
  animation: starFlash .9s cubic-bezier(.22, 1, .36, 1) forwards;
}
.star-flash i {
  display: block; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%;
  background: radial-gradient(circle,
    rgba(255, 255, 255, .98),
    rgba(255, 236, 150, .85) 38%,
    rgba(255, 214, 102, .25) 62%,
    rgba(255, 214, 102, 0) 78%);
  box-shadow: 0 0 10px rgba(255, 220, 120, .75);
}
.star-flash.dim i { width: 9px; height: 9px; margin: -4.5px 0 0 -4.5px; opacity: .75; box-shadow: 0 0 6px rgba(255, 220, 120, .5); }
.star-flash.bright i { transform: scale(1.5); }

@keyframes starFlash {
  0%   { opacity: 0;   transform: scale(.3); }
  20%  { opacity: 1;   transform: scale(1.2); }
  50%  { opacity: .7;  transform: scale(1); }
  100% { opacity: 0;   transform: scale(.5); }
}
```
