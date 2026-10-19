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

```text
形状/尺寸   圆点，直径 6px（屏幕像素，不随 zoom 变）
填充        该事实的一级分类色
外圈        rgba(255,255,255,.92)，线宽 0.9
透明度      ageAlpha × 动画系数
            ageAlpha：全部时间/档案类 0.9；≤30 天 1.0；30–60 天 0.9；>60 天线性降到 0
同坐标      多条记录合并成一个点（点开选“该位置共 N 条”）
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

**实现方式：代码画的，不是 SVG 文件。** ECharts `scatter` 系列 + 径向渐变（canvas），没有图片资源。

```text
谁能画        仅 impact === 'high'（severity ≥ 70）
半径          80 + severity × 3.2  km      // 当前数据没有真实半径，全部按严重度折算
像素换算      kmPerPixel = (全球 ? 40075 : 6900) / (画布宽 × zoom)
              直径px = 2 × radiusKm / kmPerPixel
              绘制尺寸 = min(88, max(16, 直径px × 1.2))
数量/间距     最多 24 个；相邻光晕圆心屏幕间距 ≥ 40px；圆心必须在可视区
渐变          径向：0% → 分类色 10% 不透明；55% → 4%；100% → 0
              （实际 alpha 再乘 ageAlpha）
```

**动效怎么做的**：光晕本身是静态渐变，没有关键帧动画；"呼吸"由同点的涟漪承担：

```text
涟漪   effectScatter
       period 7（秒）     每 7 秒扩散一次
       scale 4.2          扩散到 4.2 倍
       brushType 'stroke' 只画描边环
       number 2           同时 2 个环
       opacity .55        整体透明度
       最多 8 个          showEffectOn 'render'（进入即播）
```

## 五、新事实“亮起来”怎么做的

**DOM 插一个元素 + CSS 关键帧，不是图片也不是 canvas。**

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
