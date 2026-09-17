/* ============================================================
   L2 全国供给 + 省际流通 ｜ L3 省内城市产区
   L2 / L3 各一个 ECharts 实例（互不干扰，返回时天然恢复上层位姿）
   镜头飞行：geo center/zoom 的 rAF 缓动（真实相机推进，不是换页）
   ============================================================ */
window.createChinaMap = function (elId) {
  const D = window.AGRI_DATA;
  const HOMEPOSE = { center: [104.5, 34.5], zoom: 1.12 };
  const ZOOM_HINT = { '新疆': 2.0, '西藏': 2.0, '内蒙古': 1.9, '黑龙江': 2.3, '青海': 2.2, '四川': 2.3, '云南': 2.3, '广西': 2.5, '甘肃': 2.3, '海南': 3.2, '浙江': 3.0, '广东': 2.4, '陕西': 2.5, '山东': 2.6, '河南': 2.7 };
  let chart = null, pose = { center: HOMEPOSE.center.slice(), zoom: HOMEPOSE.zoom };
  let raf = null, directOn = false, mode = 'l2', curProv = null, litCount = 0;

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
  function provinceRegions(active) {
    return Object.keys(D.provinces).map(p => ({
      name: p,
      itemStyle: {
        areaColor: active && active !== p ? '#f4f6fa' : `rgba(37,99,235,${(0.05 + D.provinces[p].supply / 900).toFixed(3)})`,
        borderColor: active === p ? '#1d4ed8' : 'rgba(120,145,185,.55)', borderWidth: active === p ? 1.8 : .7
      }
    }));
  }
  function lineItem(x) {
    return {
      coords: [[D.provinces[x.from].lng, D.provinces[x.from].lat], [D.provinces[x.to].lng, D.provinces[x.to].lat]],
      value: x.vol, cat: x.cat, x: x,
      lineStyle: { width: 1 + x.vol / 11, color: D.CAT[x.cat], opacity: .62, curveness: .22 }
    };
  }

  /* ---------- L2 ---------- */
  function l2Option() {
    const provs = Object.keys(D.provinces);
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
        { id: 'direct', type: 'lines', coordinateSystem: 'geo', zlevel: 3, data: directs,
          effect: directs.length ? { show: true, period: 6, trailLength: .3, symbol: 'circle', symbolSize: 3, color: '#fff' } : { show: false },
          lineStyle: { curveness: .34 } },
        { id: 'dmkt', type: 'effectScatter', coordinateSystem: 'geo', zlevel: 4,
          data: directOn ? D.directFlows.map(f => ({ name: f.market, value: [f.mLng, f.mLat], f: f })) : [],
          symbolSize: 9, rippleEffect: { scale: 2.4, brushType: 'stroke' }, itemStyle: { color: '#7c3aed' },
          label: { show: true, formatter: p => p.data.name, position: 'right', color: '#5b21b6', fontSize: 11, fontWeight: 600 } },
        { id: 'prov', type: 'scatter', coordinateSystem: 'geo', zlevel: 5,
          data: provs.map(p => ({ name: p, value: [D.provinces[p].lng, D.provinces[p].lat], sup: D.provinces[p].supply, cat: D.provinces[p].cat })),
          symbolSize: (v, p) => 12 + Math.sqrt(p.data.sup) * 1.3,
          itemStyle: { color: d => D.CAT[d.data.cat], borderColor: '#fff', borderWidth: 1.6, opacity: .92 },
          label: { show: true, formatter: p => p.name, position: 'right', color: '#243043', fontSize: 11, fontWeight: 600,
            backgroundColor: 'rgba(255,255,255,.72)', padding: [1, 3], borderRadius: 3 } }
      ]
    };
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
    chart.off('click');
    chart.on('click', p => {
      const ev = p.event || {};
      if (p.seriesId === 'pline' && ev.offsetX !== undefined) {
        const near = nearestProvince(ev.offsetX, ev.offsetY);
        if (near) { window.AGRI_UI.onProvinceClick(near); return; }
      }
      if (p.seriesId === 'prov') window.AGRI_UI.onProvinceClick(p.name);
      else if (p.seriesId === 'pline') window.AGRI_UI.onPlineClick(p.data.x);
      else if (p.seriesId === 'direct' || p.seriesId === 'dmkt') window.AGRI_UI.onDirectClick(p.data.f);
      else if (p.componentType === 'geo' && D.provinces[p.name]) window.AGRI_UI.onProvinceClick(p.name);
    });
  }
  function renderL2() {
    mode = 'l2'; init(); litCount = 0;
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
      chart.setOption({ series: [{ id: 'pline', data: order.slice(0, i + 1).map(lineItem) }] }, { lazyUpdate: false });
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
    chart.setOption({ geo: { regions: provinceRegions(name) } }, { lazyUpdate: false, silent: true });
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
          symbolSize: (v, p) => 14 + Math.sqrt(p.data.out) * 2.1,
          itemStyle: { color: x => D.CAT[x.data.cat], borderColor: '#fff', borderWidth: 1.8, shadowBlur: 10, shadowColor: 'rgba(37,99,235,.25)' },
          label: { show: true, formatter: x => x.name, position: 'right', color: '#1d4ed8', fontSize: 12, fontWeight: 700,
            backgroundColor: 'rgba(255,255,255,.82)', padding: [2, 5], borderRadius: 4 } },
        { id: 'brace', type: 'effectScatter', coordinateSystem: 'geo', zlevel: 4,
          data: [{ name: prov, value: [d.lng, d.lat] }], symbolSize: 6, rippleEffect: { scale: 3.4, brushType: 'stroke' }, itemStyle: { color: '#1d4ed8' } }
      ]
    }, { notMerge: true });
    pose = { center: HOMEPOSE.center.slice(), zoom: HOMEPOSE.zoom };
    applyPose();
    chart.off('click');
    chart.on('click', p => {
      if (p.seriesId === 'city') { window.AGRI_UI.onCityClick(prov, p.name); return; }
      // 兜底：城市节点附近（半径 24px）的点击也算点到该城市，避免点不动
      const ev = p.event || {};
      if (ev.offsetX !== undefined) {
        const near = nearestCity(prov, ev.offsetX, ev.offsetY);
        if (near) window.AGRI_UI.onCityClick(prov, near);
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
      symbolSize: (14 + Math.sqrt(c.out) * 2.1) * (city && c.name !== city ? .8 : 1),
      itemStyle: { color: D.CAT[c.cat], borderColor: c.name === city ? '#1d4ed8' : '#fff', borderWidth: c.name === city ? 3 : 1.8 }
    })) }] }, { lazyUpdate: false, silent: true });
  }

  window.addEventListener('resize', () => { if (chart) chart.resize(); });
  return {
    get el() { return chart; },
    init, renderL2, lightUp, setDirect, selectProvince, renderL3, highlightCity, flyTo, setPose, focusProvince,
    home() { return HOMEPOSE; },
    getPose: () => ({ center: pose.center.slice(), zoom: pose.zoom }),
    getLit: () => litCount, getDirect: () => directOn, getMode: () => mode,
    resize() { if (chart) chart.resize(); }
  };
};
