/* ============================================================
   L2 全国供给 + 省际流通 ｜ L3 省内城市产区
   L2 / L3 各一个 ECharts 实例（互不干扰，返回时天然恢复上层位姿）
   镜头飞行：geo center/zoom 的 rAF 缓动（真实相机推进，不是换页）
   ============================================================ */
window.createChinaMap = function (elId) {
  const D = window.AGRI_DATA;
  const HOMEPOSE = { center: [104.5, 34.5], zoom: 1.12 };
  /* 东部密集区：标签按方位避让（hideOverlap 兜底），避免上海/浙江/湖南挤成一团 */
  const LABEL_POS = { '上海': 'bottom', '浙江': 'bottom', '江苏': 'right', '北京': 'top', '天津': 'top', '辽宁': 'top',
    '广东': 'bottom', '湖南': 'left', '湖北': 'left', '重庆': 'left', '四川': 'left', '海南': 'bottom', '黑龙江': 'top', '吉林': 'top' };
  const labelPos = name => LABEL_POS[name] || 'right';
  const ZOOM_HINT = { '新疆': 2.3, '西藏': 2.0, '内蒙古': 1.9, '黑龙江': 2.3, '青海': 2.2, '四川': 2.3, '云南': 2.3, '广西': 2.5, '甘肃': 2.3, '海南': 3.2, '浙江': 3.0, '广东': 2.4, '陕西': 2.5, '山东': 2.6, '河南': 2.7 };
  let chart = null, pose = { center: HOMEPOSE.center.slice(), zoom: HOMEPOSE.zoom };
  let raf = null, directOn = false, mode = 'l2', curProv = null, litCount = 0, selProv = null;

  function init() {
    if (chart) return;
    // 离线单文件：中国地图数据内联在 window.__CHINA_GEO（注册幂等）
    if (window.echarts && window.__CHINA_GEO && !echarts.getMap('china')) {
      try { echarts.registerMap('china', window.__CHINA_GEO); }
      catch (e) { console.error('registerMap china failed', e); }
    }
    chart = echarts.init(document.getElementById(elId));
  }

  const baseGeo = extra => Object.assign({
    map: 'china', roam: false, zoom: pose.zoom, center: pose.center.slice(),
    itemStyle: { areaColor: '#eef3fa', borderColor: 'rgba(120,145,185,.55)', borderWidth: .7 },
    emphasis: { itemStyle: { areaColor: '#e0eafb' }, label: { show: true, color: '#0f172a', fontSize: 11 } },
    select: { disabled: true }, label: { show: false }
  }, extra || {});

  /* ---------- 相机 ---------- */
  // 相机位姿必须「完整提交」：lazyUpdate 会让 geo 位姿与 series 坐标不同步
  function applyPose() {
    if (!chart) return;
    chart.setOption({ geo: { center: pose.center.slice(), zoom: pose.zoom } }, { lazyUpdate: false, silent: true });
  }
  function flyTo(center, zoom, dur) {
    const from = { center: pose.center.slice(), zoom: pose.zoom }, t0 = performance.now();
    dur = dur || 1300;
    if (raf) cancelAnimationFrame(raf);
    return new Promise(res => {
      const step = now => {
        const t = Math.min(1, (now - t0) / dur), e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        pose.center = [from.center[0] + (center[0] - from.center[0]) * e, from.center[1] + (center[1] - from.center[1]) * e];
        pose.zoom = from.zoom + (zoom - from.zoom) * e;
        applyPose();
        if (t < 1) raf = requestAnimationFrame(step);
        else { raf = null; applyPose(); res(); }
      };
      raf = requestAnimationFrame(step);
    });
  }
  function setPose(p) { pose = { center: p.center.slice(), zoom: p.zoom }; applyPose(); }

  /* ---------- 公共：底部省份底色 ---------- */
  /* 规模 → 半径：供给指数 52–95 映射到约 14–37px，拉开可读梯度 */
  const supSize = sup => 12 + Math.max(0, Math.sqrt(sup) - 7) * 9;
  /* 省内产区规模 → 半径（外调量 8–46 万吨 → 约 15–33px） */
  const citySize = out => 13 + Math.max(0, Math.sqrt(out) - 3) * 4.2;
  /* 供给（面 + 点）与流通（线）两套视觉语言：底色 = 供给规模，气泡 = 供给对象，线 = 调运量 */
  function provinceRegions(active) {
    return Object.keys(D.provinces).map(p => {
      const on = active === p;
      return {
        name: p,
        itemStyle: {
          // 底色深浅 = 供给规模：拉开到 0.10–0.34，肉眼可辨
          areaColor: `rgba(37,99,235,${Math.min(.34, .08 + .26 * (D.provinces[p].supply - 50) / 50).toFixed(3)})`,
          opacity: active && !on ? 0.5 : 1,
          borderColor: on ? '#1d4ed8' : 'rgba(120,145,185,.55)', borderWidth: on ? 1.8 : .7
        }
      };
    });
  }
  // 选中省份时：相关调运线提亮加粗，其余线压到背景层
  function lineItem(x) {
    const related = !selProv || x.from === selProv || x.to === selProv;
    const w = 1 + x.vol / 11;
    return {
      coords: [[D.provinces[x.from].lng, D.provinces[x.from].lat], [D.provinces[x.to].lng, D.provinces[x.to].lat]],
      value: x.vol, cat: x.cat, x: x,
      lineStyle: {
        width: related ? w * (selProv ? 1.15 : 1) : w * 0.8,
        color: D.CAT[x.cat],
        opacity: related ? (selProv ? 0.92 : 0.62) : 0.14,
        curveness: .22
      }
    };
  }
  const litLines = () => D.interProv.slice().sort((a, b) => b.vol - a.vol).slice(0, litCount).map(lineItem);

  /* ---------- L2 ---------- */
  function l2Option() {
    const provs = Object.keys(D.provinces);
    // 窄屏地图小：只给"规模较大"的产区常显名称，其余靠悬浮/右侧列表，避免标签压住气泡
    const compact = !!(chart && chart.getWidth() < 560);
    const directs = directOn ? D.directFlows.map(f => ({
      coords: [[f.lng, f.lat], [f.mLng, f.mLat]], value: f.vol, f: f,
      lineStyle: { width: 1 + f.vol / 12, color: '#7c3aed', opacity: .8, curveness: .34, type: 'dashed' }
    })) : [];
    return {
      backgroundColor: 'transparent',
      geo: baseGeo({ regions: provinceRegions(null) }),
      tooltip: { trigger: 'item', backgroundColor: 'rgba(255,255,255,.97)', borderColor: 'rgba(15,23,42,.1)', textStyle: { color: '#10151f', fontSize: 12 }, formatter: tooltip },
      series: [
        { id: 'pline', type: 'lines', coordinateSystem: 'geo', zlevel: 3, data: [],
          effect: { show: true, period: 5.2, trailLength: .35, symbol: 'circle', symbolSize: 3.4, color: '#fff' },
          lineStyle: { curveness: .22 } },
        { id: 'direct', type: 'lines', coordinateSystem: 'geo', zlevel: 3, data: directs, clip: true,
          effect: directs.length ? { show: true, period: 6, trailLength: .3, symbol: 'circle', symbolSize: 3, color: '#fff' } : { show: false },
          lineStyle: { curveness: .34 } },
        { id: 'dmkt', type: 'effectScatter', coordinateSystem: 'geo', zlevel: 4,
          data: directOn ? D.directFlows.map(f => ({ name: f.market, value: [f.mLng, f.mLat], f: f })) : [],
          symbolSize: 9, rippleEffect: { scale: 2.4, brushType: 'stroke' }, itemStyle: { color: '#7c3aed' },
          labelLayout: { hideOverlap: true },
          label: { show: true, formatter: p => p.data.name, position: 'right', color: '#5b21b6', fontSize: 11, fontWeight: 600 } },
        { id: 'prov', type: 'scatter', coordinateSystem: 'geo', zlevel: 5,
          data: provs.map(p => ({ name: p, value: [D.provinces[p].lng, D.provinces[p].lat], sup: D.provinces[p].supply, cat: D.provinces[p].cat })),
          symbolSize: (v, p) => supSize(p.data.sup),
          itemStyle: { color: d => D.CAT[d.data.cat], borderColor: '#fff', borderWidth: 2, opacity: .95,
            shadowBlur: 8, shadowColor: 'rgba(15,23,42,.18)' },
          emphasis: { scale: 1.15 },
          labelLayout: { hideOverlap: true },
          label: { show: true, formatter: p => (compact && p.data.sup < 76) ? '' : p.name, distance: compact ? 11 : 5,
            position: p => labelPos(p.name), color: '#243043', fontSize: 11, fontWeight: 600,
            backgroundColor: 'rgba(255,255,255,.72)', padding: [1, 3], borderRadius: 3 } }
      ]
    };
  }
  /* ---------- 手势兜底 ----------
     点亮动画每一步都会 setOption 重绘，期间 zrender 的 click 目标可能落在
     非数据元素（compound）上，ECharts 于是整次点击不派发 —— 表现就是
     "切换图层后立刻点省份，第一次点击没有反应"。这里用坐标命中兜底：
     只在该次手势确实没被上层处理时生效，不重试、不猜。 */
  let gesture = { downAt: 0, pt: null, handledAt: 0, fallbackAt: 0 };
  const consumedByFallback = () => gesture.fallbackAt > gesture.downAt;
  const markHandled = () => { if (!consumedByFallback()) gesture.handledAt = performance.now(); };

  function px(lng, lat) { const p = chart.convertToPixel({ geoIndex: 0 }, [lng, lat]);
    return p && isFinite(p[0]) ? p : null; }

  function hitProvince(x, y) {
    let best = null, bd = 1e9;
    Object.keys(D.provinces).forEach(k => {
      const p = px(D.provinces[k].lng, D.provinces[k].lat); if (!p) return;
      const d = Math.hypot(p[0] - x, p[1] - y), r = supSize(D.provinces[k].supply) / 2 + 4;
      if (d <= r && d < bd) { bd = d; best = k; }
    });
    return best;
  }
  function hitCity(x, y) {
    const d = D.provinces[curProv]; if (!d) return null;
    let best = null, bd = 1e9;
    d.cities.forEach(c => {
      const p = px(c.lng, c.lat); if (!p) return;
      const dist = Math.hypot(p[0] - x, p[1] - y), r = citySize(c.out) / 2 + 4;
      if (dist <= r && dist < bd) { bd = dist; best = c.name; }
    });
    return best;
  }
  function hitMarket(x, y) {
    let best = null, bd = 14;
    D.directFlows.forEach(f => {
      const p = px(f.mLng, f.mLat); if (!p) return;
      const d = Math.hypot(p[0] - x, p[1] - y);
      if (d < bd) { bd = d; best = f; }
    });
    return best;
  }
  // 与 ECharts lines(curveness .22) 同一条二次曲线上的最近距离
  function hitLine(x, y) {
    let best = null, bd = 8;
    D.interProv.forEach(item => {
      const a = px(D.provinces[item.from].lng, D.provinces[item.from].lat);
      const b = px(D.provinces[item.to].lng, D.provinces[item.to].lat);
      if (!a || !b) return;
      const cx = (a[0] + b[0]) / 2 - (b[1] - a[1]) * .22, cy = (a[1] + b[1]) / 2 + (b[0] - a[0]) * .22;
      for (let i = 0; i <= 24; i++) {
        const t = i / 24, u = 1 - t;
        const qx = u * u * a[0] + 2 * u * t * cx + t * t * b[0];
        const qy = u * u * a[1] + 2 * u * t * cy + t * t * b[1];
        const d = Math.hypot(qx - x, qy - y);
        if (d < bd) { bd = d; best = item; }
      }
    });
    return best;
  }
  function hitTest(x, y) {
    if (mode === 'l2') {
      const p = hitProvince(x, y); if (p) { window.AGRI_UI.onProvinceClick(p); return true; }
      if (directOn) { const f = hitMarket(x, y); if (f) { window.AGRI_UI.onDirectClick(f); return true; } }
      const l = hitLine(x, y); if (l) { window.AGRI_UI.onPlineClick(l); return true; }
    } else if (mode === 'l3') {
      const c = hitCity(x, y); if (c) { window.AGRI_UI.onCityClick(curProv, c); return true; }
    }
    return false;
  }
  function bindGesture() {
    if (!chart || chart.__agriGesture) return;
    chart.__agriGesture = true;
    const zr = chart.getZr();
    zr.on('mousedown', e => { gesture.downAt = performance.now(); gesture.pt = { x: e.offsetX, y: e.offsetY }; });
    zr.on('globalout', () => { gesture.pt = null; });
    chart.getDom().addEventListener('pointerup', e => {
      const pt = gesture.pt, downAt = gesture.downAt; gesture.pt = null;
      if (!pt || performance.now() - downAt > 1500) return;
      if (Math.hypot(e.offsetX - pt.x, e.offsetY - pt.y) > 6) return;     // 拖动过就不算点击
      // 下一宏任务再判定：zrender 的 click 派发在同一次输入序列内完成，
      // 若它已处理（handledAt 更新）就跳过；若它丢了这次点击，则由兜底接手。
      setTimeout(() => {
        if (gesture.handledAt > downAt || consumedByFallback()) return;   // 上层已处理
        if (hitTest(pt.x, pt.y)) gesture.fallbackAt = performance.now();  // 兜底生效，迟到的事件不再重复处理
      }, 0);
    });
  }

  function tooltip(p) {
    if (p.seriesId === 'prov') {
      const d = D.provinces[p.name]; if (!d) return p.name;
      return `<b>${p.name}</b> · 供给规模指数 ${d.supply}（示意）<br>主导品类 ${D.CATN[d.cat]} ｜ 调出 ${(d.out / 10).toFixed(1)} 十万吨 ｜ 调入 ${(d.in / 10).toFixed(1)} 十万吨<br><span style="color:#98a2b3">再次点击进入省内城市层</span>`;
    }
    if (p.seriesId === 'pline') { const x = p.data.x; return `<b>${x.from} → ${x.to}</b> ｜ ${x.item}<br>调运量 ${x.vol} 万吨（示意）｜ 同比 ${x.yoy > 0 ? '+' : ''}${x.yoy}%`; }
    if (p.seriesId === 'direct') { const f = p.data.f; return `<b>${f.country} → ${f.market}</b>（进口直达）<br>${f.item} ｜ ${f.vol} 万吨（示意）`; }
    if (p.seriesId === 'dmkt') { const f = p.data.f; return `<b>${f.market}</b><br>进口直达 ${f.vol} 万吨（${f.country}，${f.item}）`; }
    return p.name || '';
  }
  // 气泡与连线重叠时：优先把点击算给省份气泡（避免点不动产区）
  function nearestProvince(x, y) {
    let best = null, bd = 26;
    Object.keys(D.provinces).forEach(k => {
      const px = chart.convertToPixel({ geoIndex: 0 }, [D.provinces[k].lng, D.provinces[k].lat]);
      if (!px || !isFinite(px[0])) return;
      const d = Math.hypot(px[0] - x, px[1] - y);
      if (d < bd) { bd = d; best = k; }
    });
    return best;
  }
  function bindL2Click() {
    bindGesture();
    chart.off('click');
    chart.on('click', p => {
      if (consumedByFallback()) return;
      // 只有真正派发了对象动作才算"已处理"：重绘期间 ECharts 可能把点击解析成
      // 非数据元素（seriesId 为空），此时必须让坐标兜底接手，而不是当成已处理吞掉。
      const ev = p.event || {};
      if (p.seriesId === 'pline' && ev.offsetX !== undefined) {
        const near = nearestProvince(ev.offsetX, ev.offsetY);
        if (near) { markHandled(); window.AGRI_UI.onProvinceClick(near); return; }
      }
      if (p.seriesId === 'prov') { markHandled(); window.AGRI_UI.onProvinceClick(p.name); }
      else if (p.seriesId === 'pline') { markHandled(); window.AGRI_UI.onPlineClick(p.data.x); }
      else if (p.seriesId === 'direct' || p.seriesId === 'dmkt') { markHandled(); window.AGRI_UI.onDirectClick(p.data.f); }
      else if (p.componentType === 'geo' && D.provinces[p.name]) { markHandled(); window.AGRI_UI.onProvinceClick(p.name); }
    });
  }
  function renderL2() {
    mode = 'l2'; init(); litCount = 0; selProv = null;
    chart.clear();
    chart.setOption(l2Option(), { notMerge: true });
    pose = { center: HOMEPOSE.center.slice(), zoom: HOMEPOSE.zoom };
    applyPose(); bindL2Click();
  }
  // 省际线按量级依次点亮（从大到小）
  function lightUp(stepMs) {
    const order = D.interProv.slice().sort((a, b) => b.vol - a.vol);
    order.forEach((x, i) => setTimeout(() => {
      litCount = i + 1;
      chart.setOption({ series: [{ id: 'pline', data: litLines() }] }, { lazyUpdate: false });
    }, 260 + i * (stepMs || 170)));
  }
  function setDirect(on) {
    directOn = on;
    if (!chart) return;
    chart.setOption(l2Option(), { notMerge: true });
    lightUp(50); bindL2Click(); applyPose();
  }
  function selectProvince(name) {
    if (!chart || mode !== 'l2') return;
    selProv = name || null;
    chart.setOption({ geo: { regions: provinceRegions(selProv) }, series: [{ id: 'pline', data: litLines() }] }, { lazyUpdate: false, silent: true });
  }

  /* ---------- L3 ---------- */
  function renderL3(prov) {
    mode = 'l3'; init(); curProv = prov;
    const d = D.provinces[prov];
    if (!d) return;
    chart.clear();
    chart.setOption({
      backgroundColor: 'transparent',
      geo: baseGeo({ regions: provinceRegions(prov) }),
      tooltip: { trigger: 'item', backgroundColor: 'rgba(255,255,255,.97)', borderColor: 'rgba(15,23,42,.1)', textStyle: { color: '#10151f', fontSize: 12 },
        formatter: p => p.seriesId === 'city'
          ? `<b>${p.name}</b> ｜ 主导 ${p.data.main}（${D.CATN[p.data.cat]}）<br>外调规模 ${p.data.out} 万吨（示意）｜ 五维竞争力 ${Object.values(p.data.comp).join(' / ')}<br><span style="color:#98a2b3">再次点击进入代表单品全链路</span>`
          : p.name },
      series: [
        { id: 'city', type: 'scatter', coordinateSystem: 'geo', zlevel: 5,
          data: d.cities.map(c => ({ name: c.name, value: [c.lng, c.lat], out: c.out, cat: c.cat, main: c.main, comp: c.comp })),
          symbolSize: (v, p) => citySize(p.data.out),
          itemStyle: { color: x => D.CAT[x.data.cat], borderColor: '#fff', borderWidth: 1.8, shadowBlur: 10, shadowColor: 'rgba(37,99,235,.25)' },
          labelLayout: { hideOverlap: true },
          label: { show: true, formatter: x => x.name, position: 'right', color: '#1d4ed8', fontSize: 12, fontWeight: 700,
            backgroundColor: 'rgba(255,255,255,.82)', padding: [2, 5], borderRadius: 4 } },
        { id: 'brace', type: 'effectScatter', coordinateSystem: 'geo', zlevel: 4,
          data: [{ name: prov, value: [d.lng, d.lat] }], symbolSize: 6, rippleEffect: { scale: 3.4, brushType: 'stroke' }, itemStyle: { color: '#1d4ed8' } }
      ]
    }, { notMerge: true });
    pose = { center: HOMEPOSE.center.slice(), zoom: HOMEPOSE.zoom };
    applyPose();
    bindGesture();
    chart.off('click');
    chart.on('click', p => {
      if (consumedByFallback()) return;
      if (p.seriesId === 'city') { markHandled(); window.AGRI_UI.onCityClick(prov, p.name); return; }
      // 兜底：城市节点附近（半径 24px）的点击也算点到该城市，避免点不动
      const ev = p.event || {};
      if (ev.offsetX !== undefined) {
        const near = nearestCity(prov, ev.offsetX, ev.offsetY);
        if (near) { markHandled(); window.AGRI_UI.onCityClick(prov, near); }
      }
    });
  }
  function nearestCity(prov, x, y) {
    const d = D.provinces[prov];
    if (!d) return null;
    let best = null, bd = 24;
    d.cities.forEach(c => {
      const px = chart.convertToPixel({ geoIndex: 0 }, [c.lng, c.lat]);
      if (!px || !isFinite(px[0])) return;
      const dist = Math.hypot(px[0] - x, px[1] - y);
      if (dist < bd) { bd = dist; best = c.name; }
    });
    return best;
  }
  // 进场后镜头真实推进到该省
  function focusProvince(prov, dur) {
    const d = D.provinces[prov];
    if (!d || !chart) return Promise.resolve();
    return flyTo([d.lng, d.lat], ZOOM_HINT[prov] || 3.0, dur || 1350);
  }
  function highlightCity(city) {
    if (!chart || !curProv) return;
    const d = D.provinces[curProv];
    chart.setOption({ series: [{ id: 'city', data: d.cities.map(c => ({
      name: c.name, value: [c.lng, c.lat], out: c.out, cat: c.cat, main: c.main, comp: c.comp,
      symbolSize: citySize(c.out) * (city && c.name !== city ? .82 : 1),
      itemStyle: { color: D.CAT[c.cat], borderColor: c.name === city ? '#1d4ed8' : '#fff', borderWidth: c.name === city ? 3 : 1.8 }
    })) }] }, { lazyUpdate: false, silent: true });
  }

  // 供验收使用：调运线在 t 处的页面坐标（与绘制曲线一致，便于确定性点击）
  function linePoint(from, to, t) {
    const a = px(D.provinces[from].lng, D.provinces[from].lat);
    const b = px(D.provinces[to].lng, D.provinces[to].lat);
    if (!a || !b) return null;
    const cx = (a[0] + b[0]) / 2 - (b[1] - a[1]) * .22, cy = (a[1] + b[1]) / 2 + (b[0] - a[0]) * .22;
    const u = 1 - t;
    const x = u * u * a[0] + 2 * u * t * cx + t * t * b[0];
    const y = u * u * a[1] + 2 * u * t * cy + t * t * b[1];
    const r = chart.getDom().getBoundingClientRect();
    return { x: r.x + x, y: r.y + y };
  }

  window.addEventListener('resize', () => { if (chart) chart.resize(); });
  return {
    get el() { return chart; },
    init, renderL2, lightUp, setDirect, selectProvince, renderL3, highlightCity, flyTo, setPose, focusProvince, linePoint,
    home() { return HOMEPOSE; },
    getPose: () => ({ center: pose.center.slice(), zoom: pose.zoom }),
    getLit: () => litCount, getDirect: () => directOn, getMode: () => mode, getSel: () => selProv,
    gestureConsumed: () => consumedByFallback(),
    resize() { if (chart) chart.resize(); }
  };
};
