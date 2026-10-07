/* ============================================================
   事实层 · 视觉校准版（V2 指令）
   F1 地图是第一视觉主体，铺满可用视口
   F4 只画事实点 + 影响范围；不画事实之间线路；一级分类决定颜色，三级类型决定 Emoji
   F5 持久事实为稳定小点，不持续发光；新事实接入时一次瞬时闪光（约 1.2s 消退）
   F6 右下角快捷键 + 正上方缩放 ±（菜单内同步）
   F9 右侧两列紧凑瀑布流：无类型徽章，标题 → 摘要 → 地点/时间/来源
   F10 详情走右侧嵌套抽屉：核心事实 — 影响 — 证据来源 — 关联本体
   数据：agrilink-demo-v1（861 事实 / 377 本体 / 585 关系）· 默认口径 近 7 天 + 高可信 + 高影响
   ============================================================ */
window.V03Fact = (function () {
  const D = window.V03Data, S = window.V03Store, F = window.V03Filter;
  let root, chart, dom = {}, sig = '', mapSig = '', cardSig = '';
  let freshFlashes = [], flashSeq = 0;
  let mapAnimationPaused = false;
  const camera = { level: null, center: [104.5, 34.5], zoom: 1.18, raf: null, roamTimer: null };

  /* 地图缩放规则（v07）：
     L1 全球：铺满屏幕即最小（不能再缩小），放大到 inAt 切到中国视角
     L2 中国：缩小到 outAt 回到全球；放大到 inAt 且视野在中国某省附近 → 切省区视角
     L3 省区：还能再放大 5 档（1.28^5 ≈ 3.4×），到顶后禁用放大 */
  const LEVEL = {
    L1: { map: 'worldChina', center: [105, 35], zoom: 1.26, fit: 1.26, bounds: [[-25, 72], [335, -56]], zoomBox: [1.26, 2.4], inAt: 2.2, divisor: 9 },
    L2: { map: 'china', center: [104.5, 36], zoom: 1.0, fit: 0.86, bounds: [[73, 54.5], [136, 17.5]], zoomBox: [0.86, 3.2], inAt: 2.9, outAt: 0.9, divisor: 15 },
    L3: { map: 'china', center: null, zoom: 4.2, fit: 3.4, bounds: [[73, 54.5], [136, 17.5]], zoomBox: [3.4, 14.3], divisor: 7 }
  };
  const PROV = D.PROV_CENTER || {};
  const shortProv = n => String(n || '').replace(/壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市$/g, '') || n;
  const DEFAULT_FOCUS = '湖南';
  const IMPACT_RANK = { high: 3, mid: 2, low: 1 };
  const catOf = f => (D.CATS[f.cat] || { n: f.cat, c: '#1d4ed8', e: '📌' });
  const leafOf = f => ((F.leafOf && F.leafOf(f)) || { e: catOf(f).e, n: '', key: '' });
  /* F4/M6：一级分类决定颜色（低饱和色，与菜单同一套） */
  const groupOf = f => {
    const g = (F.FACT_TREE || []).find(x => (x.subs || []).some(sb => (sb.items || []).some(it => it.key === leafOf(f).key)));
    return g || null;
  };
  const dotColor = f => (groupOf(f) || {}).color || catOf(f).c;
  const emojiOf = f => leafOf(f).e || catOf(f).e;
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /* 以大西洋西经 25° 为接缝重新接合世界地图；美洲在中国右侧。
     原始坐标始终保留给 3D 地球和数据模型，仅 2D 世界图做显示坐标转换。 */
  const WORLD_SEAM = -25;
  const worldLongitude = lng => lng < WORLD_SEAM ? lng + 360 : lng;
  const worldCopies = (lng, lat) => [-1, 0, 1].map(copy => [worldLongitude(lng) + copy * 360, lat]);
  const mapPoints = (lng, lat) => S.state.geo.level === 'L1' ? worldCopies(lng, lat) : [[lng, lat]];
  const nearestWorldPoint = (lng, lat, centerLng) => {
    const base = worldLongitude(lng);
    return [base + Math.round((centerLng - base) / 360) * 360, lat];
  };
  const wrappedCenter = center => [((center[0] - 105 + 180) % 360 + 360) % 360 - 180 + 105, center[1]];
  function seamHalf(ring, west) {
    const inside = p => west ? p[0] < WORLD_SEAM : p[0] >= WORLD_SEAM;
    const clipped = [];
    let prev = ring[ring.length - 1];
    for (const point of ring) {
      if (inside(prev) !== inside(point)) {
        const t = (WORLD_SEAM - prev[0]) / (point[0] - prev[0]);
        clipped.push([WORLD_SEAM, prev[1] + t * (point[1] - prev[1])]);
      }
      if (inside(point)) clipped.push(point);
      prev = point;
    }
    if (clipped.length < 3) return null;
    const result = clipped.map(([lng, lat]) => [west ? lng + 360 : lng, lat]);
    if (result[0][0] !== result[result.length - 1][0] || result[0][1] !== result[result.length - 1][1]) result.push(result[0].slice());
    return result;
  }
  function worldGeoJSON(pacific = false) {
    const raw = window.__WORLD110 || [];
    const depth = x => { let d = 0; while (Array.isArray(x) && x.length) { d++; x = x[0]; } return d; };
    const features = raw.map(o => {
      const d = depth(o.c);
      const original = d >= 4 ? o.c : [d === 3 ? o.c : [o.c]];
      const coordinates = pacific ? original.flatMap(polygon => {
        const outer = polygon[0];
        if (outer.some(p => p[0] < WORLD_SEAM) && outer.some(p => p[0] >= WORLD_SEAM)) {
          return [seamHalf(outer, true), seamHalf(outer, false)].filter(Boolean).map(ring => [ring]);
        }
        return [polygon.map(ring => ring.map(([lng, lat]) => [worldLongitude(lng), lat]))];
      }) : original;
      return { type: 'Feature', properties: { name: o.n }, geometry: { type: 'MultiPolygon', coordinates } };
    });
    if (!pacific) return { type: 'FeatureCollection', features };
    const repeated = [-1, 0, 1].flatMap(copy => features.map(feature => ({
      type: 'Feature',
      properties: { name: copy ? feature.properties.name + '@' + copy : feature.properties.name, originalName: feature.properties.name },
      geometry: { type: 'MultiPolygon', coordinates: feature.geometry.coordinates.map(poly => poly.map(ring => ring.map(([lng, lat]) => [lng + copy * 360, lat]))) }
    })));
    return { type: 'FeatureCollection', features: repeated };
  }
  function mapReady() {
    if (!window.echarts) return;
    const cur = echarts.getMap('worldChina');
    if (!cur || !(cur.geoJSON && cur.geoJSON.features && cur.geoJSON.features.length)) {
      try { echarts.registerMap('worldChina', worldGeoJSON(true)); } catch (e) { console.error('registerMap worldChina', e); }
    }
    if (window.__CHINA_GEO && !echarts.getMap('china')) { try { echarts.registerMap('china', window.__CHINA_GEO); } catch (e) { console.error('registerMap china', e); } }
  }

  const TPL = `
  <div class="fact-wrap">
    <div class="fact-mapbox" id="factMapBox">
      <div id="factMap"></div>
      <canvas id="factGlobe" width="1120" height="820" style="display:none"></canvas>
      <div class="data-snapshot">演示数据截面 · ${D.TODAY}</div>
      <div class="globe-caption" id="globeCaption" hidden>关系流线 <span>关联层演示数据</span></div>
    </div>
    <button class="fact-search-status" id="factSearchStatus" type="button" hidden></button>
    <div class="fact-overlay-info" id="factOverlayInfo" hidden></div>
    <div class="fact-chooser" id="factChooser" hidden></div>
    <aside class="fact-side" id="factSide"><div class="fs-body" id="sideBody"></div></aside>
  </div>`;

  function mount(el) {
    root = el; root.innerHTML = TPL;
    dom = {
      mapBox: root.querySelector('#factMapBox'), map: root.querySelector('#factMap'), globe: root.querySelector('#factGlobe'), globeCaption: root.querySelector('#globeCaption'),
      side: root.querySelector('#factSide'), sideBody: root.querySelector('#sideBody'), searchStatus: root.querySelector('#factSearchStatus'), overlayInfo: root.querySelector('#factOverlayInfo'), chooser: root.querySelector('#factChooser')
    };
    dom.searchStatus.onclick = () => S.set({ q: '' });
    window.addEventListener('resize', () => { if (chart) chart.resize(); resizeGlobe(); });
    dom.globe.addEventListener('click', e => {
      const r = dom.globe.getBoundingClientRect();
      const hit = globeHit(e.clientX - r.left, e.clientY - r.top);
      if (!hit) return;
      if (hit.type === 'fact') return openFact(hit.id);
      showOverlay(hit.id);
    });
    S.onEvent('stream:line', p => flashStar(p && p.fact, p && p.level));
  }

  /* ---------- 地图（浅色农业风） ---------- */
  function ensureChart() {
    if (chart) return chart;
    mapReady();
    if (!dom.map || !window.echarts) return null;
    chart = echarts.init(dom.map);
    chart.on('click', onMapClick);
    /* 交互（滚轮/拖拽）后把相机状态同步回 camera，保证缩放按钮与层级切换一致 */
    chart.on('georoam', () => {
      const g = (chart.getOption().geo || [])[0];
      if (!g) return;
      camera.zoom = g.zoom != null ? g.zoom : camera.zoom;
      if (g.center) camera.center = g.center.slice();
      /* ECharts 已在当前交互帧完成 geo roam；不要在事件内重入 setOption。
         只在用户停手后提交层级 / 状态，避免 2 万点被每帧重复布局。 */
      if (camera.roamTimer) clearTimeout(camera.roamTimer);
      camera.roamTimer = setTimeout(() => { camera.roamTimer = null; afterZoom(); }, 120);
    });
    /* 双击放大 */
    dom.map.addEventListener('dblclick', e => {
      if (!chart || S.state.sk.mode3d) return;
      const r = dom.map.getBoundingClientRect();
      const lngLat = chart.convertFromPixel({ geoIndex: 0 }, [e.clientX - r.left, e.clientY - r.top]);
      const box = LEVEL[S.state.geo.level].zoomBox;
      const z = Math.min(box[1], camera.zoom * 1.35);
      const target = Array.isArray(lngLat) && lngLat.length === 2 ? lngLat : camera.center;
      flyTo(target, z, 420);
    });
    return chart;
  }
  /* 附近是否有可下钻的省区（供中国视角放大后自动进入省区视角） */
  function nearProvince(center) {
    if (!center) return null;
    let best = null, bd = 3.4;
    Object.keys(PROV).forEach(k => {
      const c = PROV[k]; const d = Math.hypot(center[0] - c[0], center[1] - c[1]);
      if (d < bd) { bd = d; best = k; }
    });
    return best;
  }
  function enterLevel(level, focus) {
    const st = S.state;
    if (st.geo.level === level && (!focus || st.geo.focus === focus)) return;
    const t = LEVEL[level];
    const c = focus && PROV[focus] ? PROV[focus] : null;
    S.set({ geo: { level, focus: focus || null }, factId: null });
    camera.level = level + '|' + (focus || '');
    camera.center = c ? [c[0], c[1]] : (t.center ? t.center.slice() : camera.center);
    camera.zoom = c ? c[2] : t.zoom;
    sig = '';
  }

  function flyTo(center, zoom, dur) {
    const from = { center: camera.center.slice(), zoom: camera.zoom }, t0 = performance.now();
    dur = dur || 800;
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
  /* 缩放后决策（滚轮与 +/− 按钮共用）：到阈值切层、到边界收敛 */
  function afterZoom() {
    const st = S.state, lv = LEVEL[st.geo.level], box = lv.zoomBox;
    /* 三份相同的世界互相接续；停手后按 360° 回到中央副本，视觉位置不跳变。 */
    if (st.geo.level === 'L1' && Math.abs(camera.center[0] - 105) > 180) camera.center = wrappedCenter(camera.center);
    if (camera.zoom < box[0]) camera.zoom = box[0];
    if (camera.zoom > box[1]) camera.zoom = box[1];
    if (st.geo.level === 'L1' && camera.zoom >= lv.inAt) return enterLevel('L2', null);
    if (st.geo.level === 'L2') {
      if (camera.zoom <= (lv.outAt || 0)) return enterLevel('L1', null);
      if (camera.zoom >= lv.inAt) { const pv = nearProvince(camera.center); if (pv) return enterLevel('L3', pv); }
    }
    if (chart) chart.setOption({ geo: { zoom: camera.zoom, center: camera.center.slice() } }, { lazyUpdate: true });
    S.set({ sk: { zoom: Math.round(camera.zoom * 100) } });
  }
  function zoomBy(dir) {
    const box = LEVEL[S.state.geo.level].zoomBox;
    const next = Math.min(box[1], Math.max(box[0], camera.zoom * (dir > 0 ? 1.28 : 1 / 1.28)));
    if (Math.abs(next - camera.zoom) < 1e-3) return;
    camera.zoom = next;
    afterZoom();
  }
  const zoomState = () => {
    const box = LEVEL[S.state.geo.level].zoomBox;
    return { canIn: camera.zoom < box[1] - 1e-3, canOut: camera.zoom > box[0] + 1e-3, zoom: camera.zoom };
  };

  const IMPACT_ALPHA = { high: .18, mid: .13, low: .09 };
  const radiusPx = f => {
    if (!Number.isFinite(f.radius) || f.radius <= 0) return 0;
    const width = (dom.map && dom.map.clientWidth) || 1000;
    const kmPerPixel = (S.state.geo.level === 'L1' ? 40075 : 6900) / Math.max(1, width * camera.zoom);
    return 2 * f.radius / kmPerPixel;
  };

  const DOT_SIZE = 6;
  const overlayAtLevel = list => list.filter(x => {
    const lv = S.state.geo.level;
    return lv === 'L1' || (lv === 'L2' ? x.lng >= 73 && x.lng <= 136 && x.lat >= 17.5 && x.lat <= 54.5
      : x.lng >= 108 && x.lng <= 115 && x.lat >= 24 && x.lat <= 31);
  });
  const regionsAtLevel = () => overlayAtLevel(D.REGIONS).filter(x => !S.state.varieties.length || S.state.varieties.some(v => String(x.variety || '').includes(v) || (v === '车厘子' && String(x.variety || '').includes('樱桃'))));
  const gatesAtLevel = kind => overlayAtLevel(D.GATES.filter(x => x.kind === kind));
  const v12Overlay = kind => window.V03Overlays ? V03Overlays.at(kind, S.state.geo.level) : [];
  const allOverlays = () => D.REGIONS.concat(D.GATES, window.V03Overlays ? V03Overlays.all : []);
  function showOverlay(id) {
    const x = allOverlays().find(o => o.id === id);
    if (!x || !dom.overlayInfo) return;
    dom.overlayInfo.hidden = false;
    dom.overlayInfo.innerHTML = '<button type="button" class="overlay-close" aria-label="关闭">×</button><b>' + esc(x.name) + '</b><small>' + esc(({ region:'产区',port:'港口',airport:'机场',market:'农贸市场',risk:'地缘风险区' })[x.kind] || '叠加图层') + '</small><p>' + esc(x.description || x.variety || x.cargo || '预置对象位置示意') + '</p>';
    dom.overlayInfo.querySelector('button').onclick = () => { dom.overlayInfo.hidden = true; };
  }
  /* 两套地图分别使用成体系的区域色、边界色、点色；色块只表示地理分区。 */
  const palette = () => S.state.theme === 'color' ? {
    land: '#e9ecd9', land2: '#bcd7ac', line: 'rgba(74,105,98,.67)', ink: '#243c42',
    regions: ['#d7e5c7', '#eee6d2', '#d5e8df', '#e7dec8', '#dce9be', '#e3eacb', '#cfe0ca'],
    tipBg: 'rgba(255,253,248,.98)', tipLine: 'rgba(61,96,84,.25)', mass: 'rgba(37,103,83,.26)', dot: '#315fb8'
  } : {
    land: '#f1efe8', land2: '#dce8df', line: 'rgba(79,108,123,.67)', ink: '#20384b',
    regions: ['#f0eee6', '#e2e9dd', '#e4ebef', '#ebe7dd', '#dce9e3', '#e8e8ed', '#ebe5d9'],
    tipBg: 'rgba(255,255,255,.99)', tipLine: 'rgba(58,88,112,.24)', mass: 'rgba(46,100,139,.25)', dot: '#236bad'
  };
  /* 共享至少两个边界顶点才算相邻；贪心图着色保证接壤区域异色。 */
  function regionColors(features) {
    const byVertex = new Map(), neighbors = new Map();
    features.forEach(({ name, coordinates }) => {
      neighbors.set(name, new Set());
      const seen = new Set();
      const visit = value => {
        if (Array.isArray(value) && typeof value[0] === 'number') {
          seen.add(value[0].toFixed(3) + ',' + value[1].toFixed(3));
        } else if (Array.isArray(value)) value.forEach(visit);
      };
      visit(coordinates);
      seen.forEach(key => {
        if (!byVertex.has(key)) byVertex.set(key, []);
        byVertex.get(key).push(name);
      });
    });
    const pairs = new Map();
    byVertex.forEach(names => {
      for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
        const key = [names[i], names[j]].sort().join('|');
        pairs.set(key, (pairs.get(key) || 0) + 1);
      }
    });
    pairs.forEach((count, pair) => {
      if (count < 2) return;
      const [a, b] = pair.split('|');
      neighbors.get(a).add(b); neighbors.get(b).add(a);
    });
    const colors = new Map();
    [...neighbors.keys()].sort((a, b) => neighbors.get(b).size - neighbors.get(a).size || a.localeCompare(b)).forEach(name => {
      const used = new Set([...neighbors.get(name)].map(next => colors.get(next)));
      let index = 0; while (used.has(index)) index++;
      colors.set(name, index);
    });
    return colors;
  }
  let countryColors, provinceColors;
  const regionIndex = (name, level) => {
    if (level === 'L1') {
      if (!countryColors) countryColors = regionColors((window.__WORLD110 || []).map(x => ({ name: x.n, coordinates: x.c })));
      return countryColors.get(String(name).replace(/@[-\d]+$/, '')) || 0;
    }
    if (!provinceColors) provinceColors = regionColors(((window.__CHINA_GEO || {}).features || []).map(x => ({ name: x.properties.name, coordinates: x.geometry.coordinates })));
    return provinceColors.get(name) || 0;
  };
  const regionFill = (name, p, level = 'L1') => p.regions[regionIndex(name, level) % p.regions.length];
  const mapRegions = (level, p) => {
    const names = level === 'L1' ? (window.__WORLD110 || []).map(x => x.n)
      : ((window.__CHINA_GEO || {}).features || []).map(x => x.properties && x.properties.name);
    return names.filter(Boolean).flatMap(name => (level === 'L1' ? [-1, 0, 1].map(copy => copy ? name + '@' + copy : name) : [name])
      .map(displayName => ({ name: displayName, itemStyle: { areaColor: regionFill(name, p, level) } })));
  };

  function mapOption() {
    const st = S.state, all = F.factsAtLevel(st);
    const facts = F.mappable(all).filter(f => !window.V03Mass || V03Mass.insideMap(st.geo.level, f.lng, f.lat));
    const lv = LEVEL[st.geo.level], p = palette();
    const halos = [], pts = [];
    facts.forEach(f => {
      const diameter = radiusPx(f);
      mapPoints(f.lng, f.lat).forEach(value => {
        if (diameter >= 8) halos.push({ id: f.id, value, symbolSize: diameter,
          itemStyle: { color: hexA(p.dot, diameter > Math.min(dom.map.clientWidth, dom.map.clientHeight) ? .3 : .1), borderColor: hexA(p.dot, .55), borderWidth: 1 } });
        pts.push({ id: f.id, name: f.title, value, symbolSize: DOT_SIZE,
          itemStyle: { color: '#fffdf8', borderColor: p.dot, borderWidth: 1.2 } });
      });
    });
    /* 质量级采样层：代表数据库体量（每个三级类型 1 万 / 10 万 / 100 万条），只作密度表达，不参与交互 */
    const mass = (window.V03Mass && st.sk.mass !== false)
      ? V03Mass.sample(st.geo.level, shortProv(st.geo.focus || DEFAULT_FOCUS), F.FACT_ITEMS.map(x => x.key))
      : [];
    const series = [
      { id: 'mass', type: 'scatter', coordinateSystem: 'geo', data: mass.flatMap((m, i) => mapPoints(m.lng, m.lat).map(value => ({ value, i }))), z: 1, silent: true, symbol: 'circle', symbolSize: 1.8,
        large: true, largeThreshold: 1000, progressive: 0, animation: false,
        itemStyle: { color: p.mass } },
      { id: 'halo', type: 'scatter', coordinateSystem: 'geo', data: st.sk.influence ? halos : [], silent: true, z: 2, symbol: 'circle' },
      { id: 'facts', type: 'scatter', coordinateSystem: 'geo', data: pts, z: 5, cursor: 'pointer' },
      flashSeries()
    ];
    if (st.sk.regions) markerSeries('regions', regionsAtLevel(), '#4d7c0f', '🌾', 13, st.geo.level !== 'L1').forEach(x => series.push(x));
    if (st.sk.gates) {
      markerSeries('gatesP', gatesAtLevel('port'), '#0369a1', '⚓', 11, st.geo.level !== 'L1').forEach(x => series.push(x));
    }
    if (st.sk.airports) markerSeries('gatesA', gatesAtLevel('airport'), '#0f766e', '✈️', 11, st.geo.level !== 'L1').forEach(x => series.push(x));
    if (st.sk.markets) markerSeries('markets', v12Overlay('market'), '#a16207', '🏪', 13, true).forEach(x => series.push(x));
    if (st.sk.risks && st.geo.level === 'L1') markerSeries('risks', v12Overlay('risk'), '#b91c1c', '⚠️', 13, false).forEach(x => series.push(x));
    return {
      backgroundColor: 'transparent',
      /* Full map rebuilds (including level changes) must not tween independently of geo points. */
      animation: false,
      animationDurationUpdate: 0,
      geo: {
        map: lv.map, roam: true, zoom: camera.zoom, center: camera.center.slice(),
        zoomOnMouseWheel: true, moveOnMouseMove: true, moveOnMouseWheel: false,
        scaleLimit: { min: lv.zoomBox[0], max: lv.zoomBox[1] },
        boundingCoords: lv.bounds || undefined,
        itemStyle: { areaColor: p.land, borderColor: p.line, borderWidth: .7 },
        regions: mapRegions(st.geo.level, p),
        emphasis: { itemStyle: { areaColor: p.land2 }, label: { show: true, color: p.ink, fontSize: 10, formatter: x => x.name.replace(/@[-\d]+$/, '') } },
        select: { disabled: true }, label: { show: false }
      },
      tooltip: {
        trigger: 'item', backgroundColor: p.tipBg, borderColor: p.tipLine, borderWidth: 1,
        textStyle: { color: p.ink, fontSize: 11 }, padding: [6, 9],
        formatter: p => {
          const sid = p.seriesId || '';
          if (sid === 'mass') {
            const t = V03Mass.totals(S.state.geo.level, F.FACT_ITEMS.length);
            return '<b>' + V03Mass.fmt(t.total) + '</b> 条事实（本视野采样 ' + t.sampled + ' 点表达密度）';
          }
          if (sid === 'facts') {
            const f = D.factById(p.data.id); if (!f) return '';
            return '<b>' + esc(f.title) + '</b><br>' + esc(f.region) + ' · ' + f.date + '<br>' + esc(leafOf(f).n || catOf(f).n);
          }
          const it = allOverlays().find(r => r.id === (p.data || {}).id);
          return it ? '<b>' + esc(it.name) + '</b>' + (it.variety ? '<br>' + esc(it.variety) : '') : (p.name || '');
        }
      },
      series
    };
  }

  function markerSeries(id, list, color, emoji, size, showLabel) {
    return [{
      id, type: 'scatter', coordinateSystem: 'geo', z: 5, cursor: 'pointer',
      data: list.flatMap(r => mapPoints(r.lng, r.lat).map(value => ({ id: r.id, name: r.name, value, symbolSize: size }))),
      symbol: 'circle', itemStyle: { color: 'rgba(255,255,255,.6)', borderColor: 'transparent', borderWidth: 0 },
      label: {
        show: true, fontSize: size, color: color, formatter: () => emoji, position: 'inside'
      },
      labelLayout: { hideOverlap: true }
    }, showLabel ? {
      id: id + 'Label', type: 'scatter', coordinateSystem: 'geo', silent: true, z: 5,
      data: list.flatMap(r => mapPoints(r.lng, r.lat).map(value => ({ id: r.id, name: r.name, value, symbolSize: 1 }))),
      symbol: 'circle', itemStyle: { color: 'transparent' },
      label: { show: true, position: 'bottom', distance: 2, fontSize: 9, color: '#4d586a',
        backgroundColor: 'rgba(255,255,255,.78)', padding: [1, 3], borderRadius: 3,
        formatter: p => { const it = list.find(r => r.id === (p.data || {}).id); return it ? (it.variety || it.name).slice(0, 10) : ''; } },
      labelLayout: { hideOverlap: true }
    } : null].filter(Boolean);
  }

  /* B3/M7：新事实接入 → 同一 geo 坐标系内闪一次；禁止另建 DOM/Canvas 覆盖层。 */
  function flashSeries() {
    return {
      id: 'freshFlash', type: 'effectScatter', coordinateSystem: 'geo', silent: true, z: 8,
      data: freshFlashes.map(x => ({
        id: x.id, factId: x.factId, value: x.value.slice(), symbolSize: x.bright ? 9 : 6,
        itemStyle: { color: x.bright ? '#ffe08a' : '#d8e8ea', opacity: x.bright ? .95 : .72 }
      })),
      showEffectOn: 'render', rippleEffect: { period: .75, scale: 5.6, brushType: 'fill', number: 2 },
      animation: false
    };
  }
  function syncFlashSeries() {
    if (!chart || S.state.sk.mode3d) return;
    chart.setOption({ series: [flashSeries()] }, { lazyUpdate: false, silent: true });
  }
  function flashStar(f, level) {
    if (!f || f.lng == null || S.state.tab !== 'fact' || S.state.sk.mode3d) return;
    if (window.V03Mass && !V03Mass.insideMap(S.state.geo.level, f.lng, f.lat)) return;
    if (!chart) return;
    const id = 'fresh-' + (++flashSeq);
    mapPoints(f.lng, f.lat).forEach(value => freshFlashes.push({ id, factId: f.id, value, bright: level === 'bright' || f.impact === 'high' }));
    syncFlashSeries();
    setTimeout(() => {
      freshFlashes = freshFlashes.filter(x => x.id !== id);
      syncFlashSeries();
    }, 1200);
  }
  const flashIds = () => freshFlashes.map(x => x.factId);

  /* ---------- 点击 ---------- */
  function openFact(id) {
    const selected = D.factById(id);
    const same = selected && F.mappable(F.factsAtLevel(S.state)).filter(f => Math.abs(f.lng - selected.lng) < 0.00001 && Math.abs(f.lat - selected.lat) < 0.00001);
    if (same && same.length > 1) {
      dom.chooser.hidden = false;
      dom.chooser.innerHTML = '<button class="overlay-close" type="button" aria-label="关闭">×</button><b>此位置有 ' + same.length + ' 条事实</b><div class="fact-chooser-list"></div>';
      dom.chooser.querySelector('.overlay-close').onclick = () => { dom.chooser.hidden = true; };
      same.slice(0, 50).forEach(f => {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = (f.date || '时间待核') + ' · ' + f.title;
        b.onclick = () => { dom.chooser.hidden = true; S.set({ factId: f.id, logOpen: false }); };
        dom.chooser.querySelector('.fact-chooser-list').appendChild(b);
      });
      return;
    }
    S.set({ factId: id, logOpen: false });
  }
  function focusOnMap(f) {
    if (!f || f.lng == null || S.state.sk.mode3d) return;
    const p = camera.center, target = S.state.geo.level === 'L1' ? nearestWorldPoint(f.lng, f.lat, p[0]) : [f.lng, f.lat], d = Math.hypot(target[0] - p[0], target[1] - p[1]);
    if (d > 8) flyTo(target, Math.max(camera.zoom, LEVEL[S.state.geo.level].zoom), 800);
  }
  function onMapClick(p) {
    const st = S.state, sid = p.seriesId || '';
    if (/^(regions|gates|markets|risks)/.test(sid)) {
      showOverlay((p.data || {}).id);
      return;
    }
    if (sid === 'facts' && p.data && p.data.id) return openFact(p.data.id);
    const name = p.name || '';
    if (!name) return;
    if (st.geo.level === 'L1') { if (name === 'China' || name === '中国') S.set({ geo: { level: 'L2', focus: null } }); return; }
    const short = String(name).replace(/壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市$/g, '');
    if (st.geo.level === 'L2') {
      const c = PROV[short];
      if (!c) return;
      S.set({ geo: { level: 'L3', focus: short }, factId: null });
      camera.center = [c[0], c[1]]; flyTo([c[0], c[1]], c[2], 800);
    }
  }

  /* ---------- 右侧卡片（F9） ---------- */
  const CRED_TXT = { high: '高可信', medium: '中可信', mid: '中可信', low: '低可信' };
  const WX_ICON = code => {
    const c = String(code || '');
    if (/typhoon|cyclone|storm/.test(c)) return '🌀';
    if (/rain|flood|precip/.test(c)) return '🌧️';
    if (/heat|high-temperature/.test(c)) return '🌡️';
    if (/drought|dry/.test(c)) return '☀️';
    if (/frost|snow|cold|freeze/.test(c)) return '❄️';
    if (/hail/.test(c)) return '🧊';
    if (/climate|alert/.test(c)) return '🌍';
    return '⛅';
  };
  const fmtNum = v => (typeof v === 'number' ? (Math.abs(v) >= 1000 ? v.toLocaleString() : v) : v == null ? '—' : v);
  /* 可嵌入播放条件：① 数据来自已核验可嵌入的公开源（响应头无 X-Frame-Options / CSP frame-ancestors）
     ② 页面本身通过 http(s) 打开 —— 公开直播源的播放器帧会以 CSP frame-ancestors 拒绝 file:// 祖先，
     此时按静态降级卡片处理（保留原始外链），避免控制台报错与"黑屏播放器"。 */
  const CAN_EMBED = typeof location !== 'undefined' && (location.protocol === 'http:' || location.protocol === 'https:');
  const isPlayable = f => CAN_EMBED && f.cardType === 'video' && f.card && f.card.embeddable === 'yes' && !!f.card.embedUrl;
  /* m3u8 直连：hls.js 可用，且流地址协议与页面协议一致（避免 https 页面被混合内容拦截） */
  const pageProto = (typeof location !== 'undefined' ? location.protocol : 'file:');
  const canHls = url => !!url && typeof Hls !== 'undefined' && Hls.isSupported() &&
    (url.indexOf('https://') === 0 ? pageProto === 'https:' : pageProto === 'http:');
  const isStreamable = f => !!(f.cardType === 'video' && f.card && f.card.hlsUrl && canHls(f.card.hlsUrl));
  function hexA(hex, a) {
    const h = String(hex).replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a.toFixed(3) + ')';
  }
  function spark(series, up) {
    const w = 160, h = 22, min = Math.min(...series), max = Math.max(...series), span = max - min || 1;
    const p = series.map((v, i) => [i / (series.length - 1) * (w - 4) + 2, h - 3 - (v - min) / span * (h - 8)]);
    const line = p.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(' ');
    const c = up ? '#dc2626' : '#16a34a';
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
      '<path d="' + line + ' L' + p[p.length - 1][0] + ' ' + h + ' L' + p[0][0] + ' ' + h + ' Z" fill="' + hexA(c, .12) + '"/>' +
      '<path d="' + line + '" fill="none" stroke="' + c + '" stroke-width="1.3"/></svg>';
  }
  const toClose = v => Array.isArray(v) ? Number(v[v.length - 1]) : Number(v);
  function kbar(raw) {
    const series = (raw || []).map(toClose).filter(v => isFinite(v));
    if (series.length < 2) return '<div class="kbar empty"><i style="height:40%"></i><i style="height:40%"></i></div>';
    const bars = series.slice(-8), min = Math.min(...bars), max = Math.max(...bars), span = max - min || 1;
    return '<div class="kbar">' + bars.map((v, i) => {
      const hgt = 20 + (v - min) / span * 80, dn = i > 0 && v < bars[i - 1];
      return '<i class="' + (dn ? 'dn' : '') + '" style="height:' + hgt.toFixed(0) + '%"></i>';
    }).join('') + '</div>';
  }
  /* 播放器懒挂载：仅当卡片进入视口且「直播流」开启时挂载 iframe（离开视口卸载，减少第三方资源与噪音） */
  const VIS = {
    io: null,
    init() {
      if (this.io || typeof IntersectionObserver === 'undefined') return;
      this.io = new IntersectionObserver(list => list.forEach(en => VIS.apply(en.target, en.isIntersecting)), { rootMargin: '160px', threshold: .01 });
    },
    apply(box, visible) {
      if (!box || !box.dataset || box.dataset.embed !== '1') return;
      const on = S.state.sk.live && visible;
      box.classList.toggle('paused', !on);
      const frame = box.querySelector('iframe'), video = box.querySelector('video');
      if (on && !frame && !video && box.dataset.hls) {
        /* D1：m3u8 直连（hls.js） */
        const v = document.createElement('video');
        v.muted = true; v.autoplay = true; v.playsInline = true; v.setAttribute('playsinline', '');
        box.appendChild(v);
        try {
          const hls = new Hls({ lowLatencyMode: false, liveDurationInfinity: true });
          box._hls = hls;
          hls.loadSource(box.dataset.hls);
          hls.attachMedia(v);
          hls.on(Hls.Events.MANIFEST_PARSED, () => { v.play().catch(() => {}); });
          hls.on(Hls.Events.ERROR, () => { /* 流不可用时退回 iframe 播放页 */
            try { hls.destroy(); } catch (e) {}
            box._hls = null; v.remove();
            if (box.dataset.src) { const f2 = document.createElement('iframe'); f2.src = box.dataset.src; f2.allowFullscreen = true; box.appendChild(f2); }
          });
        } catch (e) { v.remove(); }
        return;
      }
      if (on && !frame && !video && box.dataset.src) {
        const f2 = document.createElement('iframe');
        f2.src = box.dataset.src; f2.title = box.dataset.title || '直播'; f2.allowFullscreen = true;
        box.appendChild(f2);
      }
      if (!on) {
        if (frame) frame.remove();
        if (box._hls) { try { box._hls.destroy(); } catch (e) {} box._hls = null; }
        if (video) video.remove();
      }
    },
    sync() {
      this.init();
      const boxes = [...document.querySelectorAll('.fc-player[data-embed="1"]')];
      boxes.forEach(box => { if (this.io) { this.io.observe(box); } else this.apply(box, true); });
    }
  };

  function videoBlock(f) {
    const c = f.card || {};
    if (isPlayable(f) || isStreamable(f)) {
      const hlsAttr = isStreamable(f) ? ' data-hls="' + esc(c.hlsUrl) + '"' : '';
      const srcAttr = isPlayable(f) ? ' data-src="' + esc(c.embedUrl) + '"' : '';
      return '<div class="fc-player" data-embed="1" data-play="' + (S.state.sk.live ? 1 : 0) + '"' + srcAttr + hlsAttr +
        ' data-title="' + esc(c.mediaTitle || '视频') + '">' + (S.state.sk.live ? '' : '<span class="pause">已暂停</span>') + '</div>';
    }
    return '<div class="fc-static" data-embed="0">' +
      '<div class="fs-line"><span class="fs-ic">▤</span><b>' + esc(c.mediaTitle || f.title) + '</b></div>' +
      '<div class="fs-why">' + esc(c.fallbackReason || '该视频源暂不可直接播放，保留静态卡片') + '</div>' +
      (c.embedUrl ? '<a class="ext" href="' + esc(c.embedUrl) + '" target="_blank" rel="noopener noreferrer">打开原始视频源</a>' : '') + '</div>';
  }
  const dataLabel = f => f.prov === 'real' ? '真实来源' : f.prov === 'deidentified' ? '脱敏数据' : '模拟数据';
  const sourceCount = f => new Set((f.evidence || []).map(e => e.t || e.url || e.k).filter(Boolean)).size;
  function cardHTML(f, fresh) {
    const c = f.card || {}, cat = catOf(f);
    const foot = '<div class="fcard-foot"><span>' + esc(f.region || '') + '</span>' +
      (f.date ? '<span>·</span><span>' + esc(f.date) + '</span>' : '') +
      '<span class="sp"></span><span class="fcard-mark">' + sourceCount(f) + ' 个来源</span></div>';
    let body = '';
    switch (f.cardType) {
      case 'price': {
        const s = (c.trend && c.trend.length > 1) ? c.trend : null;
        const ch = typeof c.changePct === 'number' ? c.changePct : null, up = ch == null || ch >= 0;
        body = '<h5>' + esc(c.commodityName || f.title) + '</h5>' +
          (c.priceValue != null ? '<div class="price-row"><span class="price-v">' + fmtNum(c.priceValue) + '</span>' +
          (ch == null ? '' : '<span class="price-d ' + (up ? 'up' : 'down') + '">' + (up ? '▲' : '▼') + ' ' + Math.abs(ch).toFixed(1) + '%</span>') +
          '<span class="price-u">' + esc(c.priceUnit || '') + '</span></div>' : '') + (s ? spark(s, up) : '') +
          '<p>' + esc(String(f.summary || '').slice(0, 50)) + '</p>';
        break;
      }
      case 'weather': {
        const lv = c.alertLevel;
        body = '<div class="wx"><span class="wx-i">' + WX_ICON(c.weatherIconCode) + '</span><span class="wx-t">' + esc(c.regionName || f.region) + '</span>' +
          (lv ? '<span class="alert alert-' + esc(lv) + '">' + ({ red: '红色', orange: '橙色', yellow: '黄色', blue: '蓝色' }[lv] || esc(lv)) + '预警</span>' : '') + '</div>' +
          '<h5>' + esc(f.title) + '</h5><p>' + esc(String(c.impactText || f.summary || '').slice(0, 50)) + '</p>';
        break;
      }
      case 'policy':
        body = '<h5>' + esc(c.policyTitle || f.title) + '</h5><p>' + esc(c.impactSummary || f.summary) + '</p>' +
          ((c.issuer || c.effectiveDate) ? '<div class="fcard-note">' + esc(c.issuer || '') + (c.issuer && c.effectiveDate ? ' · ' : '') + (c.effectiveDate ? c.effectiveDate + ' 起' : '') + '</div>' : '');
        break;
      case 'market': {
        const hasQuote = !!Number(c.lastPrice);
        const ch = typeof c.changePct === 'number' ? c.changePct : 0, up = ch >= 0;
        body = '<h5>' + esc(c.instrumentName || f.title) + '<small class="sym">' + esc(c.symbol || '') + '</small></h5>' +
          (c.kline && c.kline.length >= 2 ? kbar(c.kline) : '') + (hasQuote ? '<div class="price-row"><span class="price-v">' + fmtNum(c.lastPrice) + '</span>' +
          (ch ? '<span class="price-d ' + (up ? 'up' : 'down') + '">' + (up ? '▲' : '▼') + ' ' + Math.abs(ch).toFixed(2) + '%</span>' : '') +
          '<span class="price-u">' + esc(c.unit || '') + '</span></div>' : '') +
          (c.exchange ? '<div class="fcard-note">' + esc(c.exchange) + '</div>' : '');
        break;
      }
      case 'video':
        body = videoBlock(f) + '<h5>' + esc(f.title) + '</h5><p>' + esc(f.summary) + '</p>';
        break;
      default:
        body = (c.imageUrl ? '<div class="thumb">' + esc(c.sourceName || '') + '<span class="cam">▤</span></div>' : '') +
          '<h5>' + esc(c.title || f.title) + '</h5><p>' + esc(f.summary) + '</p>' +
          ((c.sourceName || c.publishedAt) ? '<div class="fcard-note">' + esc(c.sourceName || '') + (c.sourceName && c.publishedAt ? ' · ' : '') + (c.publishedAt ? String(c.publishedAt).slice(0, 10) : '') + '</div>' : '');
    }
    return '<article class="fcard' + (fresh ? ' fresh' : '') + '" data-fid="' + esc(f.id) + '" tabindex="0">' +
      '<div class="fcard-v12-meta"><span>' + esc(leafOf(f).n || cat.n) + '</span><span>' + dataLabel(f) + '</span></div>' +
      body + foot + '<button class="fcard-detail" type="button">查看详情 →</button></article>';
  }

  let visibleCardCount = 20;
  function renderCards() {
    const st = S.state;
    const facts = F.facts(st).filter(f => st.sk.live || f.cardType !== 'video');
    dom.side.classList.toggle('off', !st.panels.cards);
    if (!facts.length) {
      dom.sideBody.innerHTML = '<div class="empty">当前筛选下没有事实<br><button class="btn sec" id="clrF">恢复默认筛选</button></div>';
      const b = dom.sideBody.querySelector('#clrF');
      if (b) b.onclick = () => S.set({ time: '7d', q: '', catKeys: null, varieties: [], region: '', sourceMode: 'all' });
      return;
    }
    const scroll = dom.sideBody.scrollTop;
    dom.sideBody.innerHTML = '<div class="fcards">' + facts.slice(0, visibleCardCount).map(f => cardHTML(f, false)).join('') + '</div>' +
      (facts.length > visibleCardCount ? '<div class="fc-more">已显示 ' + visibleCardCount + ' / ' + facts.length + '，继续滚动加载</div>' : '');
    dom.sideBody.scrollTop = scroll;
    dom.sideBody.onscroll = () => {
      if (dom.sideBody.scrollTop + dom.sideBody.clientHeight >= dom.sideBody.scrollHeight - 120 && visibleCardCount < facts.length) {
        visibleCardCount += 20;
        renderCards();
      }
    };
    dom.sideBody.querySelectorAll('.fcard').forEach(el => {
      const open = () => {
        S.set({ factId: el.dataset.fid, logOpen: false });
      };
      el.onclick = open;
      el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
    });
    VIS.sync();
  }

  /* ---------- F10：事实详情（右侧嵌套抽屉） ---------- */
  function renderDetail(box) {
    const st = S.state, f = D.factById(st.factId);
    if (!box) return;
    if (!f) { box.innerHTML = ''; return; }
    const c = f.card || {}, cat = catOf(f), leaf = leafOf(f);
    const objs = (f.objects || []).map(id => D.objById(id)).filter(Boolean);
    const path = (f.regionPath || []).map(x => x.name).filter(Boolean).join(' › ') || f.region;
    const logs = (D.STREAM_SEQ || []).filter(e => e.factId === f.id).slice(0, 20);
    const evidence = f.evidence || [];
    const status = f.review === 'conflict' ? '存在冲突' : evidence.length === 1 ? '单一来源' : '待补证（尚未核实来源独立性）';
    const scope = { L1: '全球', L2: '中国', L3: '湖南', hidden: '不显示' }[f.level] || '未判定';
    const row = (label, value) => value == null || value === '' ? '' : '<div class="fd-row"><b>' + esc(label) + '</b><span>' + esc(value) + '</span></div>';
    const metric = f.metric && f.metric.value != null ? [f.metric.value, f.metric.unit, f.metric.period].filter(Boolean).join(' · ') : '';
    const typeFields = {
      price: [['价格对象', c.commodityName], ['市场层级', c.marketLevel], ['当前值', c.priceValue != null ? c.priceValue + ' ' + (c.priceUnit || '') : ''], ['变化幅度', c.changePct != null ? c.changePct + '%' : '']],
      weather: [['天气类型', c.weatherType], ['预警等级', c.alertLevel], ['覆盖范围', c.regionName], ['受影响环节', c.impactText]],
      policy: [['发布机构', c.issuer], ['生效时间', c.effectiveDate], ['政策动作', c.impactSummary]],
      market: [['指数名称', c.instrumentName], ['指数值', c.lastPrice], ['交易所', c.exchange], ['基期', c.basePeriod]]
    }[f.cardType] || [];
    box.innerHTML = `
      <div class="fd">
        <div class="fd-id">事实 ID：${esc(f.id)}</div>
        <h3>${esc(f.title)}</h3>
        <div class="fd-sec"><h4>事实摘要</h4><p>${esc(f.summary || '来源材料未提供摘要')}</p></div>
        <div class="fd-sec"><h4>分类与时间</h4>
          ${row('分类', [leaf.group, leaf.sub, leaf.n].filter(Boolean).join(' › '))}
          ${row('发生时间', f.occurredAt || f.date || '来源材料未提供发生时间')}
          ${row('地理范围', path || '来源材料未提供可靠位置')}
        </div>
        <div class="fd-sec"><h4>涉及本体 <small>点击进入关联层</small></h4>
          <div>${objs.map(o => { const dm = D.domain(o.domain); return '<span class="objchip" data-obj="' + esc(o.id) + '"><span class="d" style="background:' + dm.c + '"></span><b>' + esc(o.name) + '</b>' + esc(dm.n) + '</span>'; }).join('') || '<p>暂无已确认本体；Jev 候选尚未接入。</p>'}</div>
        </div>
        <div class="fd-sec"><h4>关键数值</h4>${metric ? row('指标', metric) : '<p>来源材料未提供可核对的数值和口径。</p>'}</div>
        <div class="fd-sec"><h4>显示层级与地理影响</h4>
          ${row('显示层级', scope + '（数据包标注，Jev 判断依据待接入）')}
          ${row('地理影响半径', f.radius ? f.radius + ' km（演示数据估算）' : '未知：材料中无可核实半径')}
        </div>
        <div class="fd-sec"><h4>证据状态</h4>${row('状态', status)}</div>
        <div class="fd-sec"><h4>证据与来源 <small>${evidence.length} 条</small></h4>
          ${evidence.length ? evidence.map(e => `<div class="ev"><div class="ev-t">${esc(e.k || '证据')}<span>${esc(e.t || '来源名称缺失')}</span></div><q>${esc(e.q || '原文片段缺失')}</q>${e.url ? '<a class="ext" href="' + esc(e.url) + '" target="_blank" rel="noopener noreferrer">来源链接</a>' : ''}</div>`).join('') : '<p>来源不详：材料未提供来源证据。</p>'}
          ${f.sourceUrl ? '<a class="ext" href="' + esc(f.sourceUrl) + '" target="_blank" rel="noopener noreferrer">原始来源</a>' : ''}
        </div>
        <div class="fd-sec"><h4>数据来源类型</h4>${row('数据状态', dataLabel(f))}${row('材料类型', f.prov === 'real' ? '公开来源' : '演示样本')}</div>
        ${typeFields.filter(([, v]) => v != null && v !== '').length ? '<div class="fd-sec"><h4>类型字段</h4>' + typeFields.map(([k, v]) => row(k, v)).join('') + '</div>' : ''}
        <div class="fd-actions">
          <button class="btn sec" id="toRel">在关联层查看</button>
          <button class="btn sec" id="toSim">基于该事实发起推演</button>
          <button class="btn ter" id="toLog">${st.logOpen ? '收起事实形成过程' : '查看事实形成过程'}</button>
        </div>
        ${st.logOpen ? '<div class="fd-sec"><h4>事实形成过程</h4>' + row('采集时间', f.ingestedAt || '采集时间未记录') + row('抽取时间', '数据包未提供') + row('处理版本', '数据包未提供') + row('最近更新', f.ingestedAt || '更新时间未记录') + '<div class="rec-log">演示日志 ' + logs.length + ' 条，不代表实时后台任务。</div></div>' : ''}
      </div>`;
    box.querySelectorAll('[data-obj]').forEach(n => n.onclick = () => S.set({
      tab: 'relation', factId: null, factReturnId: f.id, q: '', factSearch: st.q, carry: uniq([...(st.carry || []), f.id]),
      rel: { sel: n.dataset.obj, kind: 'object', focusFact: f.id, stack: [{ kind: 'object', id: n.dataset.obj }] }
    }));
    const toRel = box.querySelector('#toRel');
    if (toRel) toRel.onclick = () => S.set({ tab: 'relation', factId: null, factReturnId: f.id, q: '', factSearch: st.q, carry: uniq([...(st.carry || []), f.id]), rel: { focusFact: f.id, sel: null, kind: null, stack: [] } });
    const toSim = box.querySelector('#toSim');
    if (toSim) toSim.onclick = () => S.set({ tab: 'sim', factId: null, factReturnId: f.id, q: '', factSearch: st.q, carry: uniq([...(st.carry || []), f.id]) });
    const toLog = box.querySelector('#toLog');
    if (toLog) toLog.onclick = () => S.set({ logOpen: !st.logOpen });
    VIS.sync();
  }
  const uniq = a => a.filter((x, i) => a.indexOf(x) === i);

  /* ---------- 3D 地球：自转和关系流线（同一 Canvas，避免独立层错位） ---------- */
  const globe = { rot: 105, tilt: .34, raf: 0, last: 0, hits: [], active: false, starOffset: 0, stars: [] };
  let starSeed = 9137;
  const starRnd = () => ((starSeed = (starSeed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 260; i++) globe.stars.push({ x: starRnd(), y: starRnd(), r: .35 + starRnd() * 1.35, a: .24 + starRnd() * .62, speed: .15 + starRnd() * .85 });
  function resizeGlobe() {
    const c = dom.globe; if (!c) return;
    const r = dom.mapBox.getBoundingClientRect();
    /* The globe redraws continuously; a 1.5x backing store costs 2.25x pixels per frame. */
    const width = Math.max(320, Math.round(r.width));
    const height = Math.max(240, Math.round(r.height));
    if (c.width !== width) c.width = width;
    if (c.height !== height) c.height = height;
  }
  function globeR() { return Math.min(dom.globe.width, dom.globe.height) * (S.state.geo.level === 'L3' ? .46 : S.state.geo.level === 'L2' ? .40 : .36); }
  function gProject(lng, lat, cx, cy, R) {
    const lam = (lng - globe.rot) * Math.PI / 180, phi = lat * Math.PI / 180;
    const cp = Math.cos(phi), x = cp * Math.sin(lam), y = Math.sin(phi), z = cp * Math.cos(lam);
    const y2 = y * Math.cos(globe.tilt) - z * Math.sin(globe.tilt);
    const z2 = y * Math.sin(globe.tilt) + z * Math.cos(globe.tilt);
    return { x: cx + x * R, y: cy - y2 * R, z: z2, lng, lat };
  }
  function lerpEdge(a, b, cx, cy, R) {
    const t = a.z / (a.z - b.z || 1e-6);
    const p = gProject(a.lng + (b.lng - a.lng) * t, a.lat + (b.lat - a.lat) * t, cx, cy, R);
    p.z = 0; return p;
  }
  function clipRing(ring, cx, cy, R) {
    const out = []; let cur = null, prev = null;
    ring.forEach(([lng, lat]) => {
      const p = gProject(lng, lat, cx, cy, R);
      if (p.z > 0) {
        if (!cur) { cur = []; if (prev && prev.z <= 0) cur.push(lerpEdge(prev, p, cx, cy, R)); }
        cur.push(p);
      } else if (cur) { cur.push(lerpEdge(prev || p, p, cx, cy, R)); out.push(cur); cur = null; }
      prev = p;
    });
    if (cur) { if (prev && prev.z > 0) cur.push(cur[0]); out.push(cur); }
    return out;
  }
  const landFeatures = (() => {
    const geo = worldGeoJSON();
    return geo.features.flatMap(f => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates)
      .map(rings => ({ name: f.properties.name, ring: rings[0] })));
  })();
  const routeColors = ['#61d6e8', '#f1c778', '#a7dc88', '#ef9e83', '#aab8f3'];
  const routeColor = type => routeColors[/供应|流入|流出|贸易/.test(type) ? 0 :
    /运输|通道|设施/.test(type) ? 1 : /生产|产区|基地/.test(type) ? 2 :
    /影响|政策|价格/.test(type) ? 3 : 4];
  const toUnit = (lng, lat) => {
    const a = lng * Math.PI / 180, b = lat * Math.PI / 180;
    return [Math.cos(b) * Math.cos(a), Math.cos(b) * Math.sin(a), Math.sin(b)];
  };
  function routePoints(a, b) {
    const u = toUnit(a.lng, a.lat), v = toUnit(b.lng, b.lat);
    const angle = Math.acos(Math.max(-1, Math.min(1, u.reduce((s, n, i) => s + n * v[i], 0))));
    const denominator = Math.sin(angle);
    return Array.from({ length: 33 }, (_, i) => {
      const t = i / 32;
      const ka = denominator > .0001 ? Math.sin((1 - t) * angle) / denominator : 1 - t;
      const kb = denominator > .0001 ? Math.sin(t * angle) / denominator : t;
      const xyz = u.map((n, j) => n * ka + v[j] * kb);
      return { lng: Math.atan2(xyz[1], xyz[0]) * 180 / Math.PI,
        lat: Math.atan2(xyz[2], Math.hypot(xyz[0], xyz[1])) * 180 / Math.PI,
        altitude: 1 + .11 * Math.sin(Math.PI * t) };
    });
  }
  const routeCandidates = D.RELATIONS.map(r => {
    const a = D.objById(r.from), b = D.objById(r.to);
    if (!a || !b || a.geo === false || b.geo === false || !Number.isFinite(a.lng) || !Number.isFinite(a.lat) || !Number.isFinite(b.lng) || !Number.isFinite(b.lat)) return null;
    const distance = Math.hypot(a.lng - b.lng, a.lat - b.lat);
    if (distance < 2 || (r.confidence || 0) < .6) return null;
    return { id: r.id, color: routeColor(r.type), width: 1 + Math.min(1.4, (r.strength || .5) * 1.3),
      score: Math.min(distance, 110) + (r.confidence || 0) * 25, points: routePoints(a, b) };
  }).filter(Boolean).sort((a, b) => b.score - a.score);
  const routeCounts = new Map();
  const globeRoutes = routeCandidates.filter(route => {
    const count = routeCounts.get(route.color) || 0;
    if (count >= 4) return false;
    routeCounts.set(route.color, count + 1);
    return true;
  }).slice(0, 16);
  function drawGlobeRoutes(ctx, cx, cy, R) {
    globeRoutes.forEach((route, index) => {
      const projected = route.points.map(p => {
        const v = gProject(p.lng, p.lat, cx, cy, R);
        return { x: cx + (v.x - cx) * p.altitude, y: cy + (v.y - cy) * p.altitude, z: v.z };
      });
      ctx.beginPath();
      projected.forEach((p, i) => {
        if (p.z <= 0) return;
        if (!i || projected[i - 1].z <= 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.strokeStyle = route.color; ctx.globalAlpha = .28; ctx.lineWidth = route.width; ctx.stroke();
      const head = Math.floor(((globe.starOffset * .0075 * (1 + index % 3 * .18) + index * .19) % 1) * 32);
      const bead = projected[head];
      if (bead && bead.z > 0) {
        ctx.beginPath();
        for (let j = Math.max(0, head - 5); j <= head; j++) {
          const p = projected[j];
          if (p.z <= 0) continue;
          if (j === Math.max(0, head - 5) || projected[j - 1].z <= 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.globalAlpha = .82; ctx.lineWidth = route.width + .6; ctx.shadowColor = route.color; ctx.shadowBlur = 5; ctx.stroke();
        ctx.beginPath(); ctx.arc(bead.x, bead.y, 1.8, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
    });
  }
  function drawGlobe() {
    const c = dom.globe, ctx = c.getContext('2d');
    const W = c.width, H = c.height, cx = W / 2, cy = H / 2, R = globeR();
    const st = S.state;
    ctx.clearRect(0, 0, W, H);
    const strong = st.theme === 'color';
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, strong ? '#315770' : '#c7d7dc'); sky.addColorStop(1, strong ? '#557f91' : '#e1e7e4');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    const g = ctx.createRadialGradient(cx - R * .3, cy - R * .35, R * .1, cx, cy, R * 1.05);
    if (strong) { g.addColorStop(0, '#90b8c2'); g.addColorStop(.58, '#5b879b'); g.addColorStop(1, '#284f68'); }
    else { g.addColorStop(0, '#e7e9e2'); g.addColorStop(.7, '#b1c4c9'); g.addColorStop(1, '#819ea9'); }
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.closePath();
    ctx.fillStyle = g; ctx.fill(); ctx.clip();
    const p = palette();
    landFeatures.forEach(feature => clipRing(feature.ring, cx, cy, R).forEach(run => {
      if (run.length < 2) return;
      ctx.beginPath();
      run.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = regionFill(feature.name, p); ctx.fill();
      ctx.strokeStyle = p.line; ctx.lineWidth = .8; ctx.stroke();
    }));
    ctx.strokeStyle = strong ? 'rgba(205,230,225,.2)' : 'rgba(55,79,95,.2)';
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts = [];
      for (let lng = -180; lng <= 180; lng += 4) pts.push([lng, lat]);
      clipRing(pts, cx, cy, R).forEach(run => { if (run.length < 2) return; ctx.beginPath(); run.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke(); });
    }
    drawGlobeRoutes(ctx, cx, cy, R);
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.strokeStyle = strong ? 'rgba(220,235,230,.7)' : 'rgba(55,79,95,.5)'; ctx.lineWidth = 1; ctx.stroke();
    const hits = [];
    const facts = F.mappable(F.factsAtLevel(st));
    if (st.sk.influence) facts.filter(f => radiusPx(f) >= 8).forEach(f => {
      const p = gProject(f.lng, f.lat, cx, cy, R);
      if (p.z <= 0) return;
      const rr = radiusPx(f) * .9;
      const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
      const col = catOf(f).c;
      grd.addColorStop(0, hexA(col, IMPACT_ALPHA[f.impact] || .12));
      grd.addColorStop(1, hexA(col, 0));
      ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.fillStyle = grd; ctx.fill();
    });
    facts.forEach(f => {
      const p = gProject(f.lng, f.lat, cx, cy, R);
      if (p.z <= 0) return;
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = hexA(catOf(f).c, .28); ctx.fill();
      ctx.strokeStyle = catOf(f).c; ctx.lineWidth = .9; ctx.stroke();
      ctx.font = '9px "IBM Plex Sans SC",sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = strong ? '#f5e7b8' : '#263d4c';
      ctx.fillText(emojiOf(f), p.x, p.y + 3);
      hits.push({ x: p.x, y: p.y, type: 'fact', id: f.id });
    });
    const marks = (st.sk.regions ? regionsAtLevel() : [])
      .concat(st.sk.gates ? gatesAtLevel('port') : [], st.sk.airports ? gatesAtLevel('airport') : [],
        st.sk.markets ? v12Overlay('market') : [], st.sk.risks ? v12Overlay('risk') : []);
    marks.forEach(m => {
      const p = gProject(m.lng, m.lat, cx, cy, R);
      if (p.z <= 0) return;
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = strong ? '#e4f1ed' : '#fff'; ctx.fill();
      ctx.strokeStyle = m.kind === 'region' ? '#65a30d' : m.kind === 'airport' ? '#0f766e' : m.kind === 'node' ? '#7e22ce' : '#0369a1';
      ctx.lineWidth = 1; ctx.stroke();
      hits.push({ x: p.x, y: p.y, type: 'mark', id: m.id });
    });
    globe.hits = hits;
  }
  function globeHit(x, y) {
    const sx = dom.globe.width / dom.globe.clientWidth, sy = dom.globe.height / dom.globe.clientHeight;
    const p = { x: x * sx, y: y * sy };
    let best = null, bd = 14 * sx;
    (globe.hits || []).forEach(h => { const d = Math.hypot(h.x - p.x, h.y - p.y); if (d < bd) { bd = d; best = h; } });
    if (!best) return null;
    return { type: best.type === 'fact' ? 'fact' : 'mark', id: best.id };
  }
  function loopGlobe(now) {
    globe.raf = requestAnimationFrame(loopGlobe);
    if (now - globe.last < 16) return;
    globe.last = now;
    globe.rot = (globe.rot + .09) % 360;
    globe.starOffset = (globe.starOffset + .42) % 100000;
    drawGlobe();
  }
  function syncMode() {
    const show3d = S.state.sk.mode3d;
    const visible = S.state.tab === 'fact' && document.visibilityState !== 'hidden';
    const on3d = show3d && visible;
    dom.globe.style.display = show3d ? 'block' : 'none';
    dom.globeCaption.hidden = !show3d;
    dom.map.style.display = show3d ? 'none' : 'block';
    const animation = chart && chart.getZr().animation;
    const shouldPauseMap = !visible || show3d;
    if (animation && shouldPauseMap !== mapAnimationPaused) {
      if (shouldPauseMap) animation.stop(); else animation.start();
      mapAnimationPaused = shouldPauseMap;
    }
    if (on3d && !globe.active) {
      globe.active = true; resizeGlobe(); globe.rot = 105;
      if (!globe.raf) globe.raf = requestAnimationFrame(loopGlobe);
    } else if (!on3d && globe.active) {
      globe.active = false;
      if (globe.raf) { cancelAnimationFrame(globe.raf); globe.raf = 0; }
    }
  }
  function setVisible() { if (dom.globe) syncMode(); }

  /* ---------- 主更新 ---------- */
  function update() {
    if (!root) return;
    const st = S.state;
    const key = JSON.stringify([st.time, st.q, st.catKeys, st.varieties, st.region, st.sourceMode, st.geo.level, st.geo.focus,
      st.factId, st.panels.cards, st.logOpen, st.carry, st.newFacts, st.sk.mode3d, st.sk.mass,
      st.sk.influence, st.sk.regions, st.sk.gates, st.sk.airports, st.sk.markets, st.sk.risks, st.sk.live, st.theme]);
    if (key === sig) return; sig = key;

    dom.searchStatus.hidden = !st.q;
    if (st.q) dom.searchStatus.textContent = '搜索结果：' + st.q + ' · ' + F.facts(st).length + ' 条  ×';

    syncMode();
    const lvKey = st.geo.level + '|' + (st.geo.focus || '');
    const c = ensureChart();
    if (c && !st.sk.mode3d) {
      if (camera.level !== lvKey) {
        camera.level = lvKey;
        const t = LEVEL[st.geo.level], focus = PROV[st.geo.focus || (st.geo.level === 'L3' ? '湖南' : '')];
        const target = focus ? [focus[0], focus[1]] : t.center;
        const zoom = focus ? focus[2] : t.zoom;
        if (st.geo.level === 'L3' && focus) { camera.center = [focus[0], focus[1]]; camera.zoom = focus[2]; }
        else if (st.geo.level !== 'L3' && target) { camera.center = target.slice(); camera.zoom = zoom; }
      }
      const nextMapSig = JSON.stringify([st.time, st.q, st.catKeys, st.varieties, st.region, st.sourceMode, st.geo.level, st.geo.focus,
        st.sk.mass, st.sk.influence, st.sk.regions, st.sk.gates, st.sk.airports, st.sk.markets, st.sk.risks, st.theme]);
      if (nextMapSig !== mapSig) {
        c.setOption(mapOption(), { notMerge: true });
        mapSig = nextMapSig;
      } else c.resize();
    }
    const nextCardSig = JSON.stringify([st.time, st.q, st.catKeys, st.varieties, st.region, st.sourceMode, st.panels.cards, st.sk.live]);
    if (nextCardSig !== cardSig) { visibleCardCount = 20; renderCards(); cardSig = nextCardSig; }
  }

  const debug = () => {
    const st = S.state, all = F.factsAtLevel(st), pts = F.mappable(all);
    const vid = D.FACTS.filter(f => f.cardType === 'video');
    return {
      level: st.geo.level, focus: st.geo.focus, mode3d: st.sk.mode3d, zoom: camera.zoom,
      facts: all.length, mappable: pts.length,
      halos: st.sk.influence ? pts.length : 0,
      regionMarks: st.sk.regions ? D.REGIONS.length : 0,
      gateMarks: st.sk.gates ? D.GATES.length : 0,
      videoTotal: vid.length,
      videoEmbeddable: vid.filter(f => f.card && f.card.embeddable === 'yes' && f.card.embedUrl).length,   /* 已核验可嵌入的公开源 */
      videoStreamable: vid.filter(f => f.card && f.card.hlsUrl).length,                                    /* 有 m3u8 直连地址 */
      videoVerified: vid.filter(isPlayable).length,                                                        /* 当前环境下可播放（http/https） */
      videoStatic: vid.filter(f => !isPlayable(f)).length,
      cards: document.querySelectorAll('#layer-fact .fcard').length,
      cardTypes: [...document.querySelectorAll('#layer-fact .fcard')].reduce((m, n) => { const f = D.factById(n.dataset.fid); if (f) m[f.cardType] = (m[f.cardType] || 0) + 1; return m; }, {}),
      emojiLeaves: new Set(pts.map(f => leafOf(f).key)).size,
      flashes: freshFlashes.length,
      roam: !!(chart && chart.getOption() && chart.getOption().geo && chart.getOption().geo[0] && chart.getOption().geo[0].roam),
      dictReady: !!F.dictReady,
      globeRotation: Number(globe.rot.toFixed(3)), starOffset: Number(globe.starOffset.toFixed(3)), starCount: globe.stars.length,
      globeActive: globe.active, mapAnimationPaused
    };
  };
  const pick = {
    fact: id => onMapClick({ seriesId: 'facts', data: { id } }),
    region: id => onMapClick({ seriesId: 'regions', data: { id } }),
    gate: id => onMapClick({ seriesId: 'gatesP', data: { id } })
  };
  const forceEmbeddable = id => {
    const f = D.factById(id);
    if (f && f.card) { f.card.embeddable = 'yes'; f.card.embedUrl = f.card.embedUrl || 'about:blank#verified'; sig = ''; cardSig = ''; update(); }
  };
  return { mount, update, setVisible, renderDetail, debug, flyTo, zoomBy, zoomState, flashIds, worldGeoJSON, pick, forceEmbeddable, isPlayable, flashStar, worldLongitude, worldCopies,
    mapRegionColor: name => regionFill(name, palette(), 'L1') };
})();
