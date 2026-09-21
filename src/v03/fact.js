/* ============================================================
   事实层：地图即主体（LLM-291 页面指令 一、事实层全部条目）
   M0  地图铺满视口；3D 为地球（缓慢自转，内容与 2D 一致）
   M1  2D/3D  · M2 影响力动画（波纹与半径随影响等级）· M3 全屏 · M4 直播流
   M5  主要产区 · M6 港口与机场（真实经纬度，可点击进本体详情）
   M7  时间范围 · M8 可信度 · M9 影响等级 · M10 搜索 · M11 图例（快捷键在 app.js 统一渲染）
   M12 快捷键条在地图右下角一排 · M13 星点密度按层级递进 · M14 亮星星点 · M15 新数据亮星
   R1  两列瀑布流 · R2 分类型卡片模板 · R4 重做
   D1  事实详情弹窗重排
   ============================================================ */
window.V03Fact = (function () {
  const D = window.V03Data, S = window.V03Store, F = window.V03Filter;
  let root, chart, dom = {}, sig = '';
  const A = window.V03Atlas || { REGIONS: [], GATES: [] };
  const camera = { level: null, center: [104.5, 34.5], zoom: 1.18, raf: null };

  const LEVEL = {
    L1: { map: 'world110', center: [18, 10], zoom: 1.06, bounds: [[-170, 72], [180, -56]], note: '全球视野 · 全部事实铺开', divisor: 9 },
    L2: { map: 'china', center: [104.5, 36], zoom: 1.0, bounds: [[73, 54.5], [136, 17.5]], note: '中国范围内事实', divisor: 15 },
    L3: { map: 'china', center: null, zoom: 4.2, bounds: [[73, 54.5], [136, 17.5]], note: '省区范围内事实', divisor: 7 }
  };
  const PROV = (D.PROV_CENTER || {});
  const shortProv = n => String(n || '').replace(/壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市$/g, '') || n;
  const provOf = f => String(f.region || '').split('·')[0].trim();
  const CAT_COLOR = cat => (D.CATS[cat] ? D.CATS[cat].c : '#60a5fa');
  
  /* ---------- 世界底图：内联 world110 是精简 {n,c} 结构，转成 ECharts 可用的 GeoJSON ---------- */
  function worldGeoJSON() {
    const raw = window.__WORLD110 || [];
    const depth = x => { let d = 0; while (Array.isArray(x) && x.length) { d++; x = x[0]; } return d; };
    const features = raw.map(o => {
      const d = depth(o.c);
      const geometry = d >= 4
        ? { type: 'MultiPolygon', coordinates: o.c }
        : { type: 'Polygon', coordinates: d === 3 ? o.c : [o.c] };
      return { type: 'Feature', properties: { name: o.n }, geometry };
    });
    return { type: 'FeatureCollection', features };
  }
  function mapReady() {
    if (!window.echarts) return;
    const cur = echarts.getMap('world110');
    if (!cur || !(cur.geoJSON && cur.geoJSON.features && cur.geoJSON.features.length)) {
      try { echarts.registerMap('world110', worldGeoJSON()); } catch (e) { console.error('registerMap world110', e); }
    }
    if (window.__CHINA_GEO && !echarts.getMap('china')) { try { echarts.registerMap('china', window.__CHINA_GEO); } catch (e) { console.error('registerMap china', e); } }
  }

  /* ---------- DOM ---------- */
  const TPL = `
  <div class="fact-wrap">
    <div class="fact-mapbox" id="factMapBox">
      <div id="factMap"></div>
      <canvas id="factGlobe" width="1120" height="820" style="display:none"></canvas>
      <div class="fact-top">
        <div class="glassbar" id="factLevel"></div>
        <div class="glassbar" id="factHint"></div>
      </div>
      <div class="fact-kpi" id="factKpi"></div>
      <div class="fact-legend" id="factLegend"></div>
    </div>
    <aside class="fact-side" id="factSide">
      <div class="fs-meta"><b>事实卡片</b><span id="sideCount"></span><span class="sp"></span><span id="sideNote"></span></div>
      <div class="fs-body" id="sideBody"></div>
    </aside>
  </div>`;

  function mount(el) {
    root = el;
    root.innerHTML = TPL;
    dom = {
      mapBox: root.querySelector('#factMapBox'), map: root.querySelector('#factMap'), globe: root.querySelector('#factGlobe'),
      level: root.querySelector('#factLevel'), hint: root.querySelector('#factHint'), kpi: root.querySelector('#factKpi'),
      legend: root.querySelector('#factLegend'), side: root.querySelector('#factSide'), sideBody: root.querySelector('#sideBody'),
      sideCount: root.querySelector('#sideCount'), sideNote: root.querySelector('#sideNote')
    };
    window.addEventListener('resize', () => { if (chart) chart.resize(); resizeGlobe(); });
    dom.globe.addEventListener('click', e => {
      const r = dom.globe.getBoundingClientRect();
      const hit = globeHit(e.clientX - r.left, e.clientY - r.top);
      if (!hit) return;
      if (hit.type === 'fact') S.set({ factId: hit.id, logOpen: false });
      else S.emit('openObject', { id: hit.id });
    });
    S.onEvent('stream:line', p => flashFact(p && p.fact));
    S.onEvent('openObject', p => openEntity(p && p.id));
  }

  /* ---------- 2D 地图 ---------- */
  function ensureChart() {
    if (chart) return chart;
    mapReady();
    if (!dom.map || !window.echarts) return null;
    chart = echarts.init(dom.map);
    chart.on('click', onMapClick);
    return chart;
  }

  function flyTo(center, zoom, dur) {
    const from = { center: camera.center.slice(), zoom: camera.zoom }, t0 = performance.now();
    dur = dur || 900;
    if (camera.raf) cancelAnimationFrame(camera.raf);
    return new Promise(res => {
      const step = now => {
        const t = Math.min(1, (now - t0) / dur), e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        camera.center = [from.center[0] + (center[0] - from.center[0]) * e, from.center[1] + (center[1] - from.center[1]) * e];
        camera.zoom = from.zoom + (zoom - from.zoom) * e;
        if (chart) chart.setOption({ geo: { center: camera.center.slice(), zoom: camera.zoom } }, { silent: true });
        if (t < 1) camera.raf = requestAnimationFrame(step);
        else { camera.raf = null; res(); }
      };
      camera.raf = requestAnimationFrame(step);
    });
  }

  /* Windy 卫星图层那种亮星：四角星带光晕 + 按影响等级分档 */
  const STAR_PATH = 'path://M0,-10 L2.1,-2.1 L10,0 L2.1,2.1 L0,10 L-2.1,2.1 L-10,0 L-2.1,-2.1 Z';
  const IMPACT_RANK = { high: 3, mid: 2, low: 1 };
  const starSize = f => 7 + IMPACT_RANK[f.impact] * 3.4 + Math.min(6, (f.radius || 100) / 60);
  const haloSymbol = f => (f.radius || 120) / (LEVEL[S.state.geo.level] || LEVEL.L2).divisor;

  /* 影响范围光晕：径向渐变（中心淡、边缘透明），比纯色圆更自然 */
  const haloGradient = f => ({
    type: 'radial', x: .5, y: .5, r: .5,
    colorStops: [
      { offset: 0, color: hexA(CAT_COLOR(f.cat), .30 * (IMPACT_RANK[f.impact] / 3 + .45)) },
      { offset: .55, color: hexA(CAT_COLOR(f.cat), .13 * (IMPACT_RANK[f.impact] / 3 + .45)) },
      { offset: 1, color: hexA(CAT_COLOR(f.cat), 0) }
    ]
  });
  function hexA(hex, a) {
    const h = String(hex).replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a.toFixed(3) + ')';
  }

  function mapOption() {
    const st = S.state, facts = F.factsAtLevel(st), lv = LEVEL[st.geo.level];
    const halos = [], stars = [], ripples = [], high = [];
    facts.forEach(f => {
      const color = CAT_COLOR(f.cat);
      if (st.sk.influence) {
        halos.push({ id: f.id, value: [f.lng, f.lat], symbolSize: Math.max(14, haloSymbol(f)), itemStyle: { color: haloGradient(f) } });
        (f.impact === 'high' ? high : ripples).push({
          id: f.id, name: f.title, value: [f.lng, f.lat], symbolSize: 7,
          itemStyle: { color: hexA(color, .5), borderColor: color, opacity: .9 }
        });
      }
      stars.push({
        id: f.id, name: f.title, value: [f.lng, f.lat, f.radius],
        symbol: STAR_PATH, symbolSize: starSize(f),
        itemStyle: { color: '#fff', shadowBlur: 10 + IMPACT_RANK[f.impact] * 5, shadowColor: color, opacity: .96 },
        /* 标签策略：全球视角只标高影响事实，下钻后逐级放开（避免星点密集时糊成一团） */
        label: (st.geo.level === 'L1' ? f.impact === 'high' : facts.length <= 46) ? {
          show: true, position: 'right', distance: 5, fontSize: 9.5, color: 'rgba(226,236,252,.92)',
          formatter: () => f.short, textBorderColor: 'rgba(4,8,16,.85)', textBorderWidth: 2
        } : { show: false }
      });
    });
    /* 省份底色：事实数量映射为冷色梯度（L2 全国视角才有省界） */
    const regions = [];
    if (st.geo.level === 'L2') {
      const byProv = {};
      facts.forEach(f => { const p = provOf(f); byProv[p] = (byProv[p] || 0) + 1; });
      Object.keys(byProv).forEach(p => {
        const full = (window.__CHINA_GEO.features.find(x => shortProv(x.properties.name) === p) || {}).properties;
        if (full) regions.push({ name: full.name, itemStyle: { areaColor: 'rgba(56,189,248,' + Math.min(.32, .06 + .06 * byProv[p]).toFixed(2) + ')' } });
      });
      if (st.geo.focus) {
        const f2 = window.__CHINA_GEO.features.find(x => shortProv(x.properties.name) === st.geo.focus);
        if (f2) regions.push({ name: f2.properties.name, itemStyle: { areaColor: 'rgba(56,189,248,.16)', borderColor: '#38bdf8', borderWidth: 1.4 } });
      }
    }
    const series = [
      { id: 'halo', type: 'scatter', coordinateSystem: 'geo', data: halos, silent: true, z: 2, symbol: 'circle' },
      { id: 'flash', type: 'effectScatter', coordinateSystem: 'geo', data: flashData(st), z: 9, symbol: STAR_PATH, symbolSize: 24,
        rippleEffect: { scale: 5.5, brushType: 'stroke', period: 2.6 }, itemStyle: { color: '#fff', shadowBlur: 22, shadowColor: '#fff' } },
      { id: 'facts', type: 'scatter', coordinateSystem: 'geo', data: stars, z: 7, cursor: 'pointer' }
    ];
    /* 星点变密后仍保持流畅：波纹按影响等级 / 半径取前 60 个 */
    const capped = arr => arr.slice().sort((a, b) => (IMPACT_RANK[b.impact] - IMPACT_RANK[a.impact]) || ((b.radius || 0) - (a.radius || 0))).slice(0, 60);
    if (st.sk.influence && ripples.length) {
      series.push({ id: 'rippleLow', type: 'effectScatter', coordinateSystem: 'geo', data: capped(ripples), z: 5, silent: true,
        rippleEffect: { scale: 3.6, brushType: 'stroke', period: 4.8 } });
    }
    if (st.sk.influence && high.length) {
      series.push({ id: 'rippleHigh', type: 'effectScatter', coordinateSystem: 'geo', data: capped(high), z: 6, silent: true,
        rippleEffect: { scale: 5.4, brushType: 'stroke', period: 2.8 } });
    }
    if (st.sk.regions) series.push(regionSeries('regions', A.REGIONS, '#a3e635', '产区'));
    if (st.sk.gates) gateSeries('gates').forEach(s => series.push(s));

    return {
      backgroundColor: 'transparent',
      animationDurationUpdate: 380,
      geo: {
        map: lv.map, roam: false, zoom: camera.zoom, center: camera.center.slice(), regions,
        boundingCoords: lv.bounds || undefined,
        itemStyle: { areaColor: '#101a2e', borderColor: 'rgba(125,160,215,.26)', borderWidth: .7 },
        emphasis: { itemStyle: { areaColor: '#16233b' }, label: { show: true, color: '#dbe7fa', fontSize: 10 } },
        select: { disabled: true },
        label: { show: false },
        silent: false
      },
      tooltip: {
        trigger: 'item', backgroundColor: 'rgba(8,13,24,.94)', borderColor: 'rgba(255,255,255,.14)', borderWidth: 1,
        textStyle: { color: '#e6eefb', fontSize: 11.5 }, padding: [7, 10],
        formatter: p => {
          if (p.seriesId === 'regions') { const it = A.REGIONS.find(r => r.id === p.data.id); return it ? '<b>' + it.name + '</b><br>' + it.variety + ' · ' + it.scale : ''; }
          if (p.seriesId === 'gates') { const it = A.GATES.find(r => r.id === p.data.id); return it ? '<b>' + it.name + '</b><br>' + (it.kind === 'port' ? '港口' : '机场') + ' · ' + it.cargo : ''; }
          if (p.seriesId === 'facts') {
            const f = D.factById(p.data.id); if (!f) return '';
            return '<b>' + f.title + '</b><br>' + f.date + ' · ' + f.region + ' · ' + D.CATS[f.cat].n +
              '<br><span style="opacity:.7">影响半径 ' + f.radius + ' km</span>';
          }
          return p.name || '';
        }
      },
      series
    };
  }

  function regionSeries(id, list, color, kind) {
    return {
      id, type: 'scatter', coordinateSystem: 'geo', z: 8, cursor: 'pointer',
      data: list.map(r => ({ id: r.id, name: r.name, value: [r.lng, r.lat], symbolSize: 9 })),
      symbol: 'diamond', itemStyle: { color: color, borderColor: '#08101f', borderWidth: 1,
        shadowBlur: 10, shadowColor: color },
      label: { show: true, position: 'bottom', distance: 4, fontSize: 9.5, color: '#d9f99d',
        formatter: p => { const it = list.find(r => r.id === p.data.id); return it ? (kind === '产区' ? it.variety + ' · ' + it.name.replace(/区$/, '') : it.name) : ''; },
        textBorderColor: 'rgba(4,8,16,.8)', textBorderWidth: 2 }
    };
  }
  function gateSeries(id) {
    const ports = A.GATES.filter(g => g.kind === 'port'), airs = A.GATES.filter(g => g.kind === 'airport');
    const mk = (list, color, sym, suffix) => ({
      id: id + suffix, type: 'scatter', coordinateSystem: 'geo', z: 8, cursor: 'pointer',
      data: list.map(r => ({ id: r.id, name: r.name, value: [r.lng, r.lat], symbolSize: 8 })),
      symbol: sym, itemStyle: { color: color, borderColor: '#08101f', borderWidth: 1, shadowBlur: 9, shadowColor: color },
      label: { show: true, position: 'top', distance: 3, fontSize: 9, color: '#fed7aa',
        formatter: p => { const it = list.find(r => r.id === p.data.id); return it ? it.name.split('·').pop() : ''; },
        textBorderColor: 'rgba(4,8,16,.8)', textBorderWidth: 2 }
    });
    return [mk(ports, '#fb923c', 'triangle', 'P'), mk(airs, '#fbbf24', 'rect', 'A')];
  }

  /* ---------- M15：新数据接入 → 亮星 ---------- */
  const flash = new Map();
  function flashFact(f) {
    if (!f || S.state.tab !== 'fact') return;
    const list = F.factsAtLevel(S.state);
    if (!list.some(x => x.id === f.id)) return;
    flash.set(f.id, { f, until: Date.now() + 3200, bright: f.impact === 'high' });
    if (chart && !S.state.sk.mode3d) chart.setOption({ series: [{ id: 'flash', data: flashData(S.state) }] }, { lazyUpdate: true });
    clearTimeout(flashFact._t);
    flashFact._t = setTimeout(() => {
      const now = Date.now();
      [...flash.keys()].forEach(k => { if (flash.get(k).until <= now) flash.delete(k); });
      if (chart && !S.state.sk.mode3d) chart.setOption({ series: [{ id: 'flash', data: flashData(S.state) }] }, { lazyUpdate: true });
      if (flash.size) flashFact(null);
    }, 1000);
  }
  function flashData() {
    const now = Date.now();
    return [...flash.values()].filter(x => x.until > now).map(x => ({
      id: x.f.id, name: x.f.title, value: [x.f.lng, x.f.lat],
      symbolSize: x.bright ? 26 : 16,
      itemStyle: { color: '#fff', shadowBlur: x.bright ? 30 : 14, shadowColor: x.bright ? '#fff' : hexA(CAT_COLOR(x.f.cat), .9) }
    }));
  }

  /* ---------- 地图点击：星点 / 产区门户 / 国家省份下钻 ---------- */
  function onMapClick(p) {
    const st = S.state;
    if (p.seriesId === 'regions') { const it = A.REGIONS.find(r => r.id === (p.data || {}).id); return it && openEntity(it.objId || ('O-' + it.id)); }
    if ((p.seriesId || '').startsWith('gates')) { const it = A.GATES.find(r => r.id === (p.data || {}).id); return it && openEntity(it.objId || ('O-' + it.id)); }
    if (p.seriesId === 'facts' && p.data && p.data.id) return S.set({ factId: p.data.id, logOpen: false });
    const name = p.name || '';
    if (!name) return;
    if (st.geo.level === 'L1') {
      if (name === 'China' || name === '中国') return S.set({ geo: { level: 'L2', focus: null } });
      return;
    }
    const short = shortProv(name);
    if (st.geo.level === 'L2') {
      const c = PROV[short];
      if (!c) return S.emit('toast', short + '：本层暂无省区事实，可在左侧图层菜单切换分类');
      S.set({ geo: { level: 'L3', focus: short }, factId: null });
      camera.center = [c[0], c[1]]; flyTo([c[0], c[1]], c[2], 900);
      return;
    }
    if (st.geo.level === 'L3' && short !== st.geo.focus) S.emit('toast', '当前为省区视角（' + st.geo.focus + '），返回全国后可切换到其它省区');
  }

  function openEntity(objId) {
    const o = D.objById(objId);
    if (!o) return;
    S.set({ tab: 'relation', rel: { sel: objId, kind: 'object', view: 'geo' } });
    S.emit('toast', '已定位本体对象：' + o.name);
  }

  /* ---------- 覆盖层：层级 / KPI / 图例 ---------- */
  function renderLevel() {
    const st = S.state, lv = st.geo.level;
    const item = (level, label, isCur) => isCur ? '<b>' + label + '</b>' : '<button data-lv="' + level + '">' + label + '</button>';
    dom.level.innerHTML = item('L1', '全球', lv === 'L1') + '<span>›</span>' + item('L2', '中国', lv === 'L2') +
      (lv === 'L3' ? '<span>›</span><b>' + st.geo.focus + '</b><button data-back="1">返回全国</button>' : '');
    dom.level.querySelectorAll('[data-lv]').forEach(b => b.onclick = () => {
      const want = b.dataset.lv, c = LEVEL[want];
      camera.center = c.center ? c.center.slice() : camera.center; camera.zoom = c.zoom;
      S.set({ geo: { level: want, focus: null }, factId: null });
    });
    const back = dom.level.querySelector('[data-back]');
    if (back) back.onclick = () => { const c = LEVEL.L2; camera.center = c.center.slice(); camera.zoom = c.zoom; S.set({ geo: { level: 'L2', focus: null }, factId: null }); };
    dom.hint.textContent = st.sk.mode3d
      ? '3D 地球 · 缓慢自转 · 点星点看事实详情 · 点产区/口岸标记看本体对象'
      : lv === 'L3' ? '省区视角 · 点星点看详情 · Esc 或「返回全国」回到上一级'
        : lv === 'L2' ? '点省份进入省区视角 · 点星点看事实详情 · 滚轮缩放图层深度由左侧菜单控制'
          : '全球视角 · 点中国进入全国视角 · 点境外产区回看来源事实';
  }

  function renderKpi() {
    const st = S.state, facts = F.factsAtLevel(st);
    const hi = facts.filter(f => f.cred === 'high').length;
    const objIds = new Set(); facts.forEach(f => (f.objects || []).forEach(o => objIds.add(o)));
    const last = facts.map(f => f.date).sort().pop() || D.TODAY;
    dom.kpi.innerHTML = [
      ['本层事实', facts.length + ' <small>条</small>'],
      ['高可信占比', facts.length ? Math.round(hi / facts.length * 100) + '<small>%</small>' : '—'],
      ['关联本体', objIds.size + ' <small>个</small>'],
      ['最近更新', last]
    ].map(([k, v]) => '<div class="kpi"><span class="k">' + k + '</span><span class="kpi-v">' + v + '</span></div>').join('');
  }

  function renderLegend() {
    const st = S.state;
    dom.legend.style.display = st.sk.legend && !st.sk.mode3d ? '' : 'none';
    if (!st.sk.legend) return;
    const cats = Object.keys(D.CATS).map(k => '<span class="lg-i"><i style="background:' + D.CATS[k].c + '"></i>' + D.CATS[k].e + ' ' + D.CATS[k].n + '</span>').join('');
    dom.legend.innerHTML = '<span class="lg-t">事实类型图例（冷色）</span>' + cats +
      '<span class="lg-i"><span class="ring"></span>影响范围（半径随影响等级）</span>' +
      '<span class="lg-i"><span class="ln"></span>新接入数据在地图上亮星</span>' +
      '<span class="lg-i"><span class="ln dash"></span>暖色菱形 / 三角 = 产区与口岸</span>';
  }

  /* ---------- 3D 地球（自绘正交投影：与 2D 同源数据，缓慢自转） ---------- */
  const globe = { rot: 105, tilt: .34, rs: 0, raf: 0, last: 0, hits: [] };
  function resizeGlobe() {
    const c = dom.globe; if (!c) return;
    const r = dom.mapBox.getBoundingClientRect();
    c.width = Math.max(320, Math.round(r.width * (window.devicePixelRatio > 1 ? 1.5 : 1)));
    c.height = Math.max(240, Math.round(r.height * (window.devicePixelRatio > 1 ? 1.5 : 1)));
  }
  function globeR() { return Math.min(dom.globe.width, dom.globe.height) * (S.state.geo.level === 'L3' ? .46 : S.state.geo.level === 'L2' ? .40 : .36); }
  function gProject(lng, lat, cx, cy, R) {
    const lam = (lng - globe.rot) * Math.PI / 180, phi = lat * Math.PI / 180;
    const cp = Math.cos(phi), x = cp * Math.sin(lam), y = Math.sin(phi), z = cp * Math.cos(lam);
    const y2 = y * Math.cos(globe.tilt) - z * Math.sin(globe.tilt);
    const z2 = y * Math.sin(globe.tilt) + z * Math.cos(globe.tilt);
    return { x: cx + x * R, y: cy - y2 * R, z: z2, lng, lat };
  }
  /* 地平线裁剪：把环拆成若干段可见折线，并在 z=0 处插值到球缘 */
  function clipRing(ring, cx, cy, R) {
    const out = []; let cur = null;
    let prev = null;
    ring.forEach(([lng, lat]) => {
      const p = gProject(lng, lat, cx, cy, R);
      if (p.z > 0) {
        if (!cur) { cur = []; if (prev && prev.z <= 0) cur.push(lerpEdge(prev, p, cx, cy, R)); }
        cur.push(p);
      } else if (cur) {
        cur.push(lerpEdge(prev || p, p, cx, cy, R));
        out.push(cur); cur = null;
      }
      prev = p;
    });
    if (cur) { if (prev && prev.z > 0) cur.push(cur[0]); out.push(cur); }
    return out;
  }
  function lerpEdge(a, b, cx, cy, R) {
    const t = a.z / (a.z - b.z || 1e-6);
    const lng = a.lng + (b.lng - a.lng) * t, lat = a.lat + (b.lat - a.lat) * t;
    const p = gProject(lng, lat, cx, cy, R); p.z = 0; return p;
  }
  const landRings = (() => {
    const geo = worldGeoJSON();
    return geo.features.map(f => f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates)
      .reduce((a, mp) => a.concat(mp), []).map(rings => rings[0]);
  })();

  function drawGlobe() {
    const c = dom.globe, ctx = c.getContext('2d');
    const W = c.width, H = c.height, cx = W / 2, cy = H / 2, R = globeR();
    const st = S.state;
    ctx.clearRect(0, 0, W, H);
    /* 球体 */
    const g = ctx.createRadialGradient(cx - R * .3, cy - R * .35, R * .1, cx, cy, R * 1.05);
    g.addColorStop(0, '#12203a'); g.addColorStop(.65, '#0c1729'); g.addColorStop(1, '#070d18');
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
    ctx.clip();
    /* 陆地 */
    ctx.lineWidth = 1;
    landRings.forEach(ring => clipRing(ring, cx, cy, R).forEach(run => {
      if (run.length < 2) return;
      ctx.beginPath();
      run.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = '#1b2c49'; ctx.fill();
      ctx.strokeStyle = 'rgba(120,170,235,.36)'; ctx.stroke();
    }));
    /* 经纬网 */
    ctx.strokeStyle = 'rgba(125,160,215,.10)';
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts = [];
      for (let lng = -180; lng <= 180; lng += 4) pts.push([lng, lat]);
      clipRing(pts, cx, cy, R).forEach(run => { if (run.length < 2) return; ctx.beginPath(); run.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke(); });
    }
    ctx.restore();
    /* 行星边缘 */
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(150,200,255,.35)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.012, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(90,150,235,.14)'; ctx.lineWidth = 8; ctx.stroke();

    /* 数据层：与 2D 完全一致的事实 / 产区 / 口岸 */
    const hits = [], t = performance.now() / 1000;
    const facts = F.factsAtLevel(st);
    if (st.sk.influence) facts.forEach(f => {
      const p = gProject(f.lng, f.lat, cx, cy, R);
      if (p.z <= 0) return;
      const rr = Math.max(6, (f.radius || 120) / LEVEL[st.geo.level].divisor * .8) * (.96 + .04 * Math.sin(t * 1.7 + f.lng));
      const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
      const col = CAT_COLOR(f.cat);
      grd.addColorStop(0, hexA(col, .22)); grd.addColorStop(.6, hexA(col, .08)); grd.addColorStop(1, hexA(col, 0));
      ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.fillStyle = grd; ctx.fill();
    });
    facts.forEach(f => {
      const p = gProject(f.lng, f.lat, cx, cy, R);
      if (p.z <= 0) return;
      const size = (starSize(f) * .9) * (.86 + .14 * Math.sin(t * 2.2 + f.lat));
      drawStar(ctx, p.x, p.y, size * 1.15, CAT_COLOR(f.cat), f.impact === 'high' ? .95 : .62);
      hits.push({ x: p.x, y: p.y, type: 'fact', id: f.id });
    });
    const marks = (st.sk.regions ? A.REGIONS.map(r => ({ ...r, kind2: 'region' })) : []).concat(st.sk.gates ? A.GATES.map(g => ({ ...g, kind2: 'gate' })) : []);
    marks.forEach(m => {
      const p = gProject(m.lng, m.lat, cx, cy, R);
      if (p.z <= 0) return;
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = m.kind2 === 'region' ? '#a3e635' : '#fb923c'; ctx.fill();
      ctx.strokeStyle = 'rgba(8,16,31,.9)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.font = '9px "IBM Plex Sans SC",sans-serif'; ctx.fillStyle = m.kind2 === 'region' ? '#d9f99d' : '#fed7aa';
      ctx.textAlign = 'center'; ctx.fillText(m.kind2 === 'region' ? m.variety : m.name.split('·').pop(), p.x, p.y - 6);
      hits.push({ x: p.x, y: p.y, type: 'mark', id: m.id, kind: m.kind2 });
    });
    globe.hits = hits;
  }
  function drawStar(ctx, x, y, r, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r * 1.9);
    grd.addColorStop(0, hexA(color, .55)); grd.addColorStop(.45, hexA(color, .18)); grd.addColorStop(1, hexA(color, 0));
    ctx.beginPath(); ctx.arc(x, y, r * 1.9, 0, Math.PI * 2); ctx.fillStyle = grd; ctx.fill();
    ctx.beginPath();
    const k = r * .34;
    ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x + k, y - k, x + r, y); ctx.quadraticCurveTo(x + k, y + k, x, y + r);
    ctx.quadraticCurveTo(x - k, y + k, x - r, y); ctx.quadraticCurveTo(x - k, y - k, x, y - r);
    ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.restore();
  }
  function globeHit(x, y) {
    const sx = dom.globe.width / dom.globe.clientWidth, sy = dom.globe.height / dom.globe.clientHeight;
    const p = { x: x * sx, y: y * sy };
    let best = null, bd = 16 * sx;
    (globe.hits || []).forEach(h => { const d = Math.hypot(h.x - p.x, h.y - p.y); if (d < bd) { bd = d; best = h; } });
    if (!best) return null;
    if (best.type === 'fact') return { type: 'fact', id: best.id };
    const m = (best.kind === 'region' ? A.REGIONS : A.GATES).find(x2 => x2.id === best.id);
    return m ? { type: 'obj', id: m.objId || ('O-' + m.id) } : null;
  }
  function loopGlobe(now) {
    globe.raf = requestAnimationFrame(loopGlobe);
    if (now - globe.last < 42) return;   /* ≈24fps：自转够顺，也不和 2D 抢性能 */
    globe.last = now;
    globe.rot = (globe.rot + .09) % 360;
    drawGlobe();
  }
  function syncMode() {
    const on3d = S.state.sk.mode3d;
    dom.globe.style.display = on3d ? 'block' : 'none';
    dom.map.style.display = on3d ? 'none' : 'block';
    if (on3d) {
      resizeGlobe(); globe.rot = 105;
      if (!globe.raf) globe.raf = requestAnimationFrame(loopGlobe);
    } else if (globe.raf) { cancelAnimationFrame(globe.raf); globe.raf = 0; }
  }

  /* ---------- 右侧：两列瀑布流事实卡片（R1–R4） ---------- */
  const MEDIA = { image: '图文', video: '视频', live: '公开直播流', text: '文本与原文' };
  const CRED = { high: ['高可信', 'hi'], mid: ['中等可信', 'mid'], low: ['低可信', 'low'] };
  const CHANNELS = ['CCTV-1 综合', 'CCTV-13 新闻', '央视农业农村', '湖南卫视', '农林卫视'];
  const WX_ICON = f => {
    const s = f.title + f.summary;
    if (/台风/.test(s)) return '🌀'; if (/暴雨|洪/.test(s)) return '🌧️'; if (/高温|热浪/.test(s)) return '🌡️';
    if (/干旱/.test(s)) return '☀️'; if (/寒潮|冻害|霜/.test(s)) return '❄️'; if (/冰雹/.test(s)) return '🧊';
    return '⛅';
  };
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); };
  const seriesOf = f => {
    if (f.series && f.series.length > 2) return f.series;
    let h = hash(f.id); const out = []; let v = 100;
    for (let i = 0; i < 7; i++) { h = (h * 1103515245 + 12345) % 2147483648; v += ((h % 200) / 100 - 1) * 2.6; out.push(Math.round(v * 10) / 10); }
    return out;
  };
  const deltaOf = f => {
    if (f.delta) return f.delta;
    const s = seriesOf(f);
    const d = (s[s.length - 1] - s[0]) / (s[0] || 1) * 100;
    return (d >= 0 ? '+' : '') + d.toFixed(1) + '%';
  };
  function spark(series, up) {
    const w = 176, h = 26, min = Math.min(...series), max = Math.max(...series), span = max - min || 1;
    const pts = series.map((v, i) => [i / (series.length - 1) * (w - 4) + 2, h - 3 - (v - min) / span * (h - 8)]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const c = up ? '#f43f5e' : '#16a34a';
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
      '<path d="' + line + ' L' + pts[pts.length - 1][0] + ' ' + h + ' L' + pts[0][0] + ' ' + h + ' Z" fill="' + hexA(c, .14) + '"/>' +
      '<path d="' + line + '" fill="none" stroke="' + c + '" stroke-width="1.4"/></svg>';
  }
  function kbar(series) {
    const bars = series.slice(-8);
    const min = Math.min(...bars), max = Math.max(...bars), span = max - min || 1;
    return '<div class="kbar">' + bars.map((v, i) => {
      const hgt = 20 + (v - min) / span * 80;
      const dn = i > 0 && v < bars[i - 1];
      return '<i class="' + (dn ? 'dn' : '') + '" style="height:' + hgt.toFixed(0) + '%"></i>';
    }).join('') + '</div>';
  }
  const chip = (t, c, dot) => '<span class="chip ' + (c || '') + '">' + (dot ? '<i style="background:' + dot + '"></i>' : '') + t + '</span>';

  function player(f) {
    const on = S.state.sk.live;
    const ch = CHANNELS[hash(f.id) % CHANNELS.length];
    return '<div class="fc-player" data-live-player="' + f.id + '" data-play="' + (on ? '1' : '0') + '">' +
      '<canvas width="320" height="180"></canvas>' +
      (f.media === 'live' ? '<span class="live">● LIVE</span>' : '<span class="ch">' + ch + '</span>') +
      (f.media === 'live' ? '<span class="ch">' + ch + '</span>' : '') +
      '<span class="tc">00:00:00</span>' +
      (on ? '' : '<span class="pause"><span>▶</span><span>已暂停 · 快捷键 M4 开启直播流</span></span>') + '</div>';
  }

  function cardHTML(f) {
    const cat = D.CATS[f.cat], hasPlayer = f.media === 'video' || f.media === 'live';
    const head = '<div class="fcard-top">' + chip(cat.e + ' ' + cat.n, '', cat.c) + chip(CRED[f.cred][0], CRED[f.cred][1]) +
      (f.impact === 'high' ? chip('高影响', 'impact') : '') + '</div>';
    const foot = '<div class="fcard-foot"><span>' + f.region + '</span><span>·</span><span>' + f.date + '</span><span class="sp"></span>' +
      '<span class="fcard-tag">' + (hasPlayer ? MEDIA[f.media] : (f.media === 'image' ? '图文' : '原文')) + '</span></div>';
    let body = '';
    if (f.cat === 'price') {
      const s = seriesOf(f), d = deltaOf(f), up = !String(d).startsWith('-');
      body = '<h5>' + f.title + '</h5>' +
        '<div class="price-row"><span class="price-v">' + (s[s.length - 1]).toLocaleString() + '</span>' +
        '<span class="price-d ' + (up ? 'up' : 'down') + '">' + (up ? '▲' : '▼') + ' ' + d + '</span></div>' + spark(s, up) +
        '<p style="margin-top:4px">' + f.summary + '</p>';
    } else if (f.cat === 'weather') {
      body = '<div class="wx"><span class="wx-i">' + WX_ICON(f) + '</span><span class="wx-t">' + f.short + '</span></div>' +
        '<h5 style="margin-top:4px">' + f.title + '</h5><p>' + f.summary + '</p>';
    } else if (f.cat === 'policy') {
      const agency = (f.objects || []).map(id => D.objById(id)).filter(o => o && o.domain === 'agency')[0];
      body = '<h5>' + f.title + '</h5><p>' + f.summary + '</p>' +
        '<div class="fcard-tag">发布机构：' + (agency ? agency.name : '主管部门') + '</div>';
    } else if (f.cat === 'trade' && !hasPlayer) {
      body = '<h5>' + f.title + '</h5>' + kbar(seriesOf(f)) + '<p style="margin-top:4px">' + f.summary + '</p>';
    } else {
      body = (f.media === 'image' && !hasPlayer ? '<div class="thumb' + (hash(f.id) % 2 ? ' b2' : '') + '">' + (f.mediaNote || '现场素材') + '<span class="cam">▤</span></div>' : '') +
        '<h5>' + f.title + '</h5><p>' + f.summary + '</p>';
    }
    if (hasPlayer) body = player(f) + '<h5>' + f.title + '</h5><p>' + f.summary + '</p>';
    return '<article class="fcard" data-fid="' + f.id + '" tabindex="0" style="border-left-color:' + cat.c + '">' + head + body + foot + '</article>';
  }

  function renderCards() {
    const st = S.state, facts = F.factsAtLevel(st);
    dom.sideCount.textContent = facts.length + ' 条';
    dom.sideNote.textContent = F.levelMixed(st) ? '本层无匹配，已显示其它层级' : LEVEL[st.geo.level].note;
    if (!facts.length) {
      dom.sideBody.innerHTML = '<div class="empty">当前筛选下没有事实。<br>时间「' + (TIME_LABEL[st.time] || st.time) + '」· 可信度「' +
        (CRED_LABEL[st.cred]) + '」· 影响「' + (CRED_LABEL[st.infl]) + '」<br>' +
        '<button class="btn sec" id="clrF">恢复默认筛选</button></div>';
      const b = dom.sideBody.querySelector('#clrF');
      if (b) b.onclick = () => S.set({ time: '7d', cred: 'high', infl: 'high', q: '', catKeys: null });
      return;
    }
    dom.sideBody.innerHTML = '<div class="fcards">' + facts.map(cardHTML).join('') + '</div>';
    dom.sideBody.querySelectorAll('.fcard').forEach(el => {
      const open = () => S.set({ factId: el.dataset.fid, logOpen: false });
      el.onclick = open;
      el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
    });
    syncPlayers();
  }
  const TIME_LABEL = { '7d': '近 7 天', '30d': '近 30 天', '90d': '近 90 天', all: '全部' };
  const CRED_LABEL = { high: '高', mid: '中及以上', low: '低及以上', all: '不限' };

  /* ---------- 卡片内直播 / 视频流：M4 开启时同步播放，关闭时停止（保留卡片） ---------- */
  const LIVE = { raf: 0, t0: performance.now(), canvases: [] };
  function syncPlayers() {
    LIVE.canvases = [...document.querySelectorAll('#layer-fact .fc-player, #modal .fd-player')].map(box => ({
      box, cv: box.querySelector('canvas'), fid: box.dataset.livePlayer
    }));
    const on = S.state.sk.live;
    LIVE.canvases.forEach(c => { c.box.dataset.play = on ? '1' : '0'; c.box.classList.toggle('paused', !on); });
    if (on && !LIVE.raf) LIVE.raf = requestAnimationFrame(loopLive);
    if (!on && LIVE.raf) { cancelAnimationFrame(LIVE.raf); LIVE.raf = 0; LIVE.canvases.forEach(drawPaused); }
  }
  function loopLive(now) {
    LIVE.raf = requestAnimationFrame(loopLive);
    const t = (now - LIVE.t0) / 1000;
    LIVE.canvases.forEach((c, i) => { if (c.box.dataset.play === '1') drawLive(c.cv, t, i, c.fid); });
    const tc = document.querySelector('#modal .fd-player .tc');
    if (tc) tc.textContent = clock(t);
  }
  function clock(t) {
    const s = Math.floor(t % 86400);
    return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(x => String(x).padStart(2, '0')).join(':');
  }
  function drawLive(cv, t, seed, fid) {
    if (!cv || !cv.getContext) return;
    const ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
    const h = hash(fid + seed);
    const hue = h % 360;
    ctx.fillStyle = '#05070c'; ctx.fillRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, 'hsl(' + hue + ',42%,26%)'); g.addColorStop(.55, 'hsl(' + ((hue + 40) % 360) + ',38%,16%)'); g.addColorStop(1, '#05070c');
    ctx.fillStyle = g;
    const yy = 34 + Math.sin(t * .6 + seed) * 10;
    ctx.fillRect(0, yy, W, H - yy - 18);
    /* 扫描线 + 波形：看起来像在播的新闻画面 */
    ctx.globalAlpha = .16;
    for (let y = 0; y < H; y += 4) { ctx.fillStyle = '#fff'; ctx.fillRect(0, y + (t * 30 % 4), W, 1); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    for (let i = 0; i < 42; i++) {
      const bw = W / 42;
      const amp = (Math.sin(t * 3 + i * .7 + seed) * .5 + .5) * (H * .26) + 3;
      ctx.globalAlpha = .28;
      ctx.fillRect(i * bw + 2, H - 20 - amp, bw - 3, amp);
    }
    ctx.globalAlpha = .9;
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.font = 'bold 11px "IBM Plex Sans SC",sans-serif';
    ctx.fillText(CHANNELS[h % CHANNELS.length], 8, 16);
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.font = '9px ui-monospace,Menlo,monospace';
    ctx.fillText(clock(t) + ' · 播出的公开新闻与产区画面', 8, 27);
    ctx.globalAlpha = 1;
  }
  function drawPaused(c) {
    const cv = c.cv; if (!cv || !cv.getContext) return;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#080d18'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.font = '11px "IBM Plex Sans SC",sans-serif';
    ctx.fillText('画面已暂停', 8, 18);
  }

  /* ---------- 事实详情弹窗（D1 / D2：小字、分层、紧凑） ---------- */
  function renderDetail(wrap) {
    const st = S.state, f = D.factById(st.factId);
    if (!f) { wrap.innerHTML = ''; return; }
    const cat = D.CATS[f.cat], hasPlayer = f.media === 'video' || f.media === 'live';
    const objs = (f.objects || []).map(id => D.objById(id)).filter(Boolean);
    const rels = (f.relations || []).map(id => D.relById(id)).filter(Boolean);
    const logs = (D.STREAM.fact || []).concat(D.STREAM.relation || []).filter(l => l[2] === f.id);
    const inSeeds = (st.sim.seedIds || []).includes(f.id);
    const s = seriesOf(f), d = deltaOf(f), up = !String(d).startsWith('-');
    wrap.innerHTML = `
      <div class="fd-h">
        <div style="flex:1">
          <h3>${f.title}</h3>
          <div class="fd-id">${f.id} · ${D.CATS[f.cat].n} · ${f.region}</div>
        </div>
      </div>
      <div class="fd-chips">
        ${chip(cat.e + ' ' + cat.n, '', cat.c)}${chip(CRED[f.cred][0], CRED[f.cred][1])}${chip('影响 ' + (IMPACT_LABEL[f.impact]), f.impact === 'high' ? 'impact' : '')}
        ${chip(f.date)}${chip(f.level === 'global' ? '全球层' : f.level === 'china' ? '全国层' : '省区层')}${chip(MEDIA[f.media])}
      </div>
      <div class="fd-grid">
        <div class="fd-col">
          <div class="fd-sec">
            <h4>事实摘要 <small>题录与口径</small></h4>
            <p>${f.summary}</p>
            ${hasPlayer ? '<div class="fd-player fc-player" data-live-player="' + f.id + '" data-play="' + (st.sk.live ? 1 : 0) + '" style="margin-top:9px">' +
              '<canvas width="480" height="270"></canvas>' + (f.media === 'live' ? '<span class="live">● LIVE</span>' : '') +
              '<span class="ch">' + CHANNELS[hash(f.id) % CHANNELS.length] + '</span><span class="tc">00:00:00</span>' +
              (st.sk.live ? '' : '<span class="pause"><span>▶</span><span>已暂停 · 快捷键 M4 开启直播流</span></span>') + '</div>' : ''}
            ${f.media === 'image' ? '<div class="thumb' + (hash(f.id) % 2 ? ' b2' : '') + '" style="height:118px;margin-top:9px">' + (f.mediaNote || '现场素材') + '</div>' : ''}
          </div>
          <div class="fd-sec">
            <h4>证据 <small>${f.evidence.length} 条 · 可回溯</small></h4>
            ${f.evidence.map(e => `<div class="ev"><div class="ev-t">${chip(e.k)}<span>${e.t}</span></div><q>${e.q}</q></div>`).join('')}
          </div>
          <div class="fd-sec">
            <h4>相关本体对象 <small>${objs.length} 个 · 点击进入关联层</small></h4>
            <div>${objs.map(o => { const dm = D.domain(o.domain); return `<span class="objchip" data-obj="${o.id}"><span class="d" style="background:${dm.c}"></span><b>${o.name}</b>${dm.n}${o.geo === false ? ' · 无坐标' : ''}</span>`; }).join('') || '<p>本条事实暂未抽离出本体对象。</p>'}</div>
          </div>
          <div class="fd-sec">
            <h4>相关关系 <small>${rels.length} 条</small></h4>
            <div>${rels.map(r => { const a = D.objById(r.from), b = D.objById(r.to); return `<span class="objchip" data-rel="${r.id}"><b>${a ? a.name : r.from}</b> ${r.type} <b>${b ? b.name : r.to}</b> · 置信 ${(r.confidence * 100).toFixed(0)}%</span>`; }).join('') || '<p>本条事实暂未建立关系。</p>'}</div>
          </div>
        </div>
        <div class="fd-col">
          <div class="fd-sec">
            <h4>关键字段</h4>
            <div class="kv-grid">
              <div class="kv"><span>可信度</span><b>${CRED_LABEL[f.cred] === '高' ? '高可信' : CRED_LABEL[f.cred]}</b></div>
              <div class="kv"><span>影响等级</span><b>${IMPACT_LABEL[f.impact]}</b></div>
              <div class="kv"><span>生效日期</span><b>${f.date}</b></div>
              <div class="kv"><span>空间层级</span><b>${f.level === 'global' ? '全球' : f.level === 'china' ? '全国' : '省区'}</b></div>
              <div class="kv"><span>经纬度</span><b>${f.lng.toFixed(2)}, ${f.lat.toFixed(2)}</b></div>
              <div class="kv"><span>影响半径</span><b>${f.radius} km</b></div>
            </div>
          </div>
          <div class="fd-sec">
            <h4>影响范围 <small>半径随影响等级</small></h4>
            <div class="impact">
              <div class="viz">${f.radius}<br><span style="font-size:.625rem">km</span></div>
              <div class="txt"><b>${IMPACT_LABEL[f.impact]}</b><br>图上以扩散波纹与半透明光晕表示；无坐标对象只在对象清单中列出，不在地图上虚拟点位。</div>
            </div>
          </div>
          ${f.cat === 'price' || f.cat === 'trade' ? `<div class="fd-sec">
            <h4>走势 <small>按当前口径的相邻期序列</small></h4>
            <div class="price-row"><span class="price-v">${s[s.length - 1].toLocaleString()}</span>
              <span class="price-d ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${d}</span></div>
            ${spark(s, up)}
          </div>` : ''}
          <div class="fd-actions">
            <button class="btn" id="toRel">进入关联层（携带本条事实）</button>
            <button class="btn sec" id="toSeed">${inSeeds ? '已在推演种子中 · 前往推演层' : '加入推演种子'}</button>
            <button class="btn ter" id="toLog">${st.logOpen ? '收起处理记录' : '查看处理记录'}</button>
          </div>
          ${st.logOpen ? `<div class="fd-sec"><h4>处理记录</h4><div class="rec-log">${logs.length ? logs.map(l => '<div>[' + l[0] + '] ' + l[1] + '</div>').join('') : '<div>暂无该事实的处理记录</div>'}</div></div>` : ''}
        </div>
      </div>`;

    wrap.querySelectorAll('[data-obj]').forEach(n => n.onclick = () => S.set({
      tab: 'relation', factId: null, rel: { sel: n.dataset.obj, kind: 'object', view: 'geo', focusFact: f.id }, carry: uniq([...(st.carry || []), f.id])
    }));
    wrap.querySelectorAll('[data-rel]').forEach(n => n.onclick = () => S.set({
      tab: 'relation', factId: null, rel: { sel: n.dataset.rel, kind: 'relation', view: 'geo', focusFact: f.id }, carry: uniq([...(st.carry || []), f.id])
    }));
    wrap.querySelector('#toRel').onclick = () => {
      S.set({ tab: 'relation', factId: null, carry: uniq([...(st.carry || []), f.id]), rel: { focusFact: f.id, sel: null, kind: null, view: 'geo' } });
      S.emit('toast', '已携带「' + f.short + '」进入关联层');
    };
    wrap.querySelector('#toSeed').onclick = () => {
      const ids = uniq([...(st.sim.seedIds || []), f.id]);
      S.set({ sim: { seedIds: ids } });
      S.emit('toast', inSeeds ? '该事实已在推演种子中（共 ' + ids.length + ' 条）' : '已加入推演种子（共 ' + ids.length + ' 条）');
    };
    wrap.querySelector('#toLog').onclick = () => S.set({ logOpen: !st.logOpen });
    syncPlayers();
  }
  const IMPACT_LABEL = { high: '高影响', mid: '中影响', low: '低影响' };
  const uniq = a => a.filter((x, i) => a.indexOf(x) === i);

  /* ---------- 主更新 ---------- */
  function update() {
    if (!root) return;
    const st = S.state;
    if (st.factId) {
      const f = D.factById(st.factId);
      if (f && f.level === 'province') {
        const p = provOf(f);
        if (st.geo.level !== 'L3' || st.geo.focus !== p) { S.set({ geo: { level: 'L3', focus: p } }); return; }
      }
    }
    const key = JSON.stringify([st.time, st.cred, st.infl, st.q, st.catKeys, st.geo.level, st.geo.focus,
      st.panels.cards, st.logOpen, st.carry, st.sk.mode3d, st.sk.influence, st.sk.regions, st.sk.gates, st.sk.legend, st.sk.live]);
    if (key === sig) return; sig = key;

    dom.side.classList.toggle('off', !st.panels.cards);
    syncMode();
    const lvKey = st.geo.level + '|' + (st.geo.focus || '');
    const c = ensureChart();
    if (c && !st.sk.mode3d) {
      if (camera.level !== lvKey) {
        camera.level = lvKey;
        const t = LEVEL[st.geo.level], focus = st.geo.focus && PROV[st.geo.focus];
        const target = focus ? [focus[0], focus[1]] : t.center;
        const zoom = focus ? focus[2] : t.zoom;
        if (st.geo.level === 'L3' && focus) { camera.center = [focus[0], focus[1]]; camera.zoom = focus[2]; }
        else if (st.geo.level !== 'L3') { camera.center = target.slice(); camera.zoom = zoom; }
        c.clear();
      }
      c.setOption(mapOption(), { notMerge: true });
    }
    renderLevel(); renderKpi(); renderLegend(); renderCards();
  }

  const debug = () => {
    const st = S.state, facts = F.factsAtLevel(st);
    const objIds = new Set();
    facts.forEach(f => (f.objects || []).forEach(o => objIds.add(o)));
    return {
      level: st.geo.level, focus: st.geo.focus, mode3d: st.sk.mode3d,
      facts: facts.length,
      stars: facts.length,
      halos: st.sk.influence ? facts.length : 0,
      ripples: st.sk.influence ? facts.filter(f => f.impact !== 'high').length : 0,
      hotRipples: st.sk.influence ? facts.filter(f => f.impact === 'high').length : 0,
      objects: objIds.size,
      regionMarks: st.sk.regions ? A.REGIONS.length : 0,
      gateMarks: st.sk.gates ? A.GATES.length : 0,
      legend: st.sk.legend,
      livePlaying: document.querySelectorAll('#layer-fact .fc-player[data-play="1"]').length,
      liveTotal: document.querySelectorAll('#layer-fact .fc-player').length,
      cards: document.querySelectorAll('#layer-fact .fcard').length,
      globeHits: globe.hits.length,
      chartSeries: chart && !st.sk.mode3d && chart.getOption() ? chart.getOption().series.length : 0
    };
  };

  /* 地图点击路径（Playwright 无法稳定命中画布像素，这里给出与 echarts click 同一入口的调用） */
  const pick = {
    fact: id => onMapClick({ seriesId: 'facts', data: { id } }),
    region: id => onMapClick({ seriesId: 'regions', data: { id } }),
    gate: id => onMapClick({ seriesId: 'gatesP', data: { id } })
  };

  return { mount, update, renderDetail, debug, flyTo, flashIds: () => [...flash.keys()], starSize, worldGeoJSON, pick };
})();
