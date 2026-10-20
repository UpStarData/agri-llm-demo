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
  const globe = window.V03Globe.create();   /* 与关联层共用同一套三维渲染，各自持有一个实例 */
  let freshFlashes = [], flashSeq = 0;
  let mapAnimationPaused = false;
  const camera = { level: null, center: [104.5, 34.5], zoom: 1.18, raf: null, roamTimer: null };

  /* 地图缩放规则（v07）：
     L1 全球：铺满屏幕即最小（不能再缩小），放大到 inAt 切到中国视角
     L2 中国：缩小到 outAt 回到全球；放大到 inAt 且视野在中国某省附近 → 切省区视角
     L3 省区：还能再放大 5 档（1.28^5 ≈ 3.4×），到顶后禁用放大 */
  const LEVEL = {
    L1: { map: 'worldChina', center: [107.98, 26.65], zoom: 1.36, fit: 1.36, bounds: [[-25, 72], [335, -56]], zoomBox: [1.1, 2.6], inAt: 2.15, divisor: 9 },
    // Historical maplab (2026-10-10): use the registered China geometry's extent.
    // A hand-written boundingCoords changes scale even when center/zoom match.
    L2: { map: 'china', center: [108.05, 36.15], zoom: 1.59, fit: 1.59, zoomBox: [0.85, 4], inAt: 2.6, outAt: 0.95, divisor: 15 },
    L3: { map: 'china', center: [111.73, 27.54], zoom: 9.08, fit: 9.08, zoomBox: [3.4, 16], outAt: 3.5, divisor: 7 }
  };

  /* ---------- 实验页确认过的手感：阻尼缩放 + 缓动 + 跨层中心接续 ---------- */
  const FEEL = { step: 1.09, gain: .0003, pinchGain: .00075, maxStep: .022, cap: .62, idle: 280 };
  const PROV_VIEW = { '湖南': [111.73, 27.54, 9.08] };
  let camTarget = null, camRaf = 0, camGesture = { at: 0, spent: 0 };

  function camLevel() { return LEVEL[S.state.geo.level]; }
  function camAdd(logDelta) {
    const now = performance.now();
    if (now - camGesture.at > FEEL.idle) camGesture.spent = 0;
    camGesture.at = now;
    const box = camLevel().zoomBox;
    const want = Math.max(-FEEL.maxStep, Math.min(FEEL.maxStep, logDelta));
    const room = Math.max(0, FEEL.cap - camGesture.spent);
    const d = Math.max(-room, Math.min(room, want));
    if (Math.abs(d) < 1e-6) return;
    camGesture.spent += Math.abs(d);
    camTarget = Math.max(box[0] * .92, Math.min(box[1] * 1.18, (camTarget == null ? camera.zoom : camTarget) * Math.exp(d)));
    startCamLoop();
  }
  function startCamLoop() { if (!camRaf) camRaf = requestAnimationFrame(camLoop); }
  function camLoop() {
    camRaf = requestAnimationFrame(camLoop);
    if (camTarget == null) { cancelAnimationFrame(camRaf); camRaf = 0; return; }
    const box = camLevel().zoomBox;
    camera.zoom += (camTarget - camera.zoom) * .16;
    if (Math.abs(camTarget - camera.zoom) < Math.max(.002, camera.zoom * .002)) {
      camera.zoom = Math.max(box[0], Math.min(box[1], camTarget === null ? camera.zoom : camTarget));
      camTarget = null;
      afterZoom();                       /* 停手后再做一次层级判定与状态提交 */
      return;
    }
    if (!S.state.sk.mode3d && chart) chart.setOption({ geo: { zoom: camera.zoom, center: camera.center.slice() } }, { lazyUpdate: true });
  }

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
  /* 一级事实分类色（V2.8.4）：地图点填充、地球、光晕、详情统一取这一份 */
  const l1Color = f => (window.V03Theme ? window.V03Theme.fact((groupOf(f) || {}).key) : '') || (groupOf(f) || {}).color || catOf(f).c;
  const dotColor = f => l1Color(f);
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
      <div class="catalog-credit">目录：<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors</a> · <a href="https://ourairports.com/data/" target="_blank" rel="noopener">OurAirports</a></div>
    </div>
    <button class="fact-search-status" id="factSearchStatus" type="button" hidden></button>
    <div class="fact-overlay-info" id="factOverlayInfo" hidden></div>
    <div class="fact-chooser" id="factChooser" hidden></div>
    <aside class="fact-side" id="factSide"><div class="fs-body" id="sideBody"></div></aside>
  </div>`;

  function mount(el) {
    root = el; root.innerHTML = TPL;
    dom = {
      mapBox: root.querySelector('#factMapBox'), map: root.querySelector('#factMap'), globe: root.querySelector('#factGlobe'),
      side: root.querySelector('#factSide'), sideBody: root.querySelector('#sideBody'), searchStatus: root.querySelector('#factSearchStatus'), overlayInfo: root.querySelector('#factOverlayInfo'), chooser: root.querySelector('#factChooser')
    };
    dom.searchStatus.onclick = () => S.set({ q: '' });
    /* 普通滚轮 / 触控板捏合都走阻尼（实验页那套参数），ECharts 自己的滚轮缩放已关 */
    dom.map.addEventListener('wheel', e => {
      if (S.state.sk.mode3d) return;
      const box = LEVEL[S.state.geo.level].zoomBox;
      /* 边界：全球缩到底回 3D；省区缩到底回中国 */
      if (e.deltaY > 0 && camera.zoom <= box[0] + .004) {
        if (S.state.geo.level === 'L1') { S.set({ sk: { mode3d: true } }); return; }
        if (S.state.geo.level === 'L3') { enterLevel('L2', null); return; }
      }
      e.preventDefault(); e.stopImmediatePropagation();
      camAdd(-e.deltaY * (e.ctrlKey ? FEEL.pinchGain : FEEL.gain));
    }, { capture: true, passive: false });
    window.addEventListener('resize', () => { if (chart) chart.resize(); });
    globe.mount(dom.globe, {
      pick: (kind, id) => (kind === 'fact' ? openFact(id) : showOverlay(id)),
      /* 放到最大 or 点球面任意区域（不是点）→ 进入 2D 全球视角 */
      zoomEdge: edge => {
        if (S.state.sk.mode3d && S.state.tab === 'fact') {
          /* V3.0：切换视角不再弹提示文案 */
          if (edge === 'in') { S.set({ sk: { mode3d: false }, geo: { level: 'L1', focus: null } }); }
          else if (edge === 'surface') { S.set({ sk: { mode3d: false }, geo: { level: 'L1', focus: null } }); }
        }
        if (edge === 'in' || edge === 'surface') { S.set({ sk: { mode3d: false } }); }
      }
    });
    /* 二维地图缩到最小还在缩：切回三维地球（ECharts 自身会卡住最小 zoom，需要在这里拦） */
    dom.map.addEventListener('wheel', e => {
      if (S.state.sk.mode3d || S.state.geo.level !== 'L1' || e.deltaY <= 0) return;
      const box = LEVEL[S.state.geo.level].zoomBox;
      if (camera.zoom > box[0] + .004) return;
      e.preventDefault(); e.stopImmediatePropagation();
      S.set({ sk: { mode3d: true } });
    }, { capture: true, passive: false });
    const seen = new Set();
    S.onEvent('stream:line', p => {
      if (!p || !p.fact || S.state.tab !== 'fact' || seen.has(p.fact.id)) return;
      seen.add(p.fact.id); receiveFact(p.fact);
    });
    S.onEvent('data:ingested', p => { (p.facts || []).forEach(f=>receiveFact(f)); });
    S.onEvent('feed:arrival', p=>{if(S.state.tab==='fact')receiveFact(p.fact,{replay:p.mode==='snapshot-replay'});});
  }

  /* ---------- 地图（浅色农业风） ---------- */
  function ensureChart() {
    if (chart) return chart;
    mapReady();
    if (!dom.map || !window.echarts) return null;
    chart = echarts.init(dom.map, null, { devicePixelRatio: Math.min(1.25, window.devicePixelRatio || 1) });
    chart.on('click', onMapClick);
    /* 交互（滚轮/拖拽）后把相机状态同步回 camera，保证缩放按钮与层级切换一致 */
    chart.on('georoam', () => {
      const g = (chart.getOption().geo || [])[0];
      if (!g) return;
      camera.zoom = g.zoom != null ? g.zoom : camera.zoom;
      if (g.center) camera.center = g.center.slice();
      /* V3.2：临界 zoom 之内 2D 地图只允许左右移动 —— 纬度被夹在默认纬度附近一个窄带，
         超过临界点（要进入下一级视野）才放开纵向拖动。不能在事件里 setOption，交回 afterZoom 落地。 */
      clampLat();
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
    const c = focus ? (PROV_VIEW[focus] || PROV[focus]) : null;
    S.set({ geo: { level, focus: focus || null }, factId: null });
    camera.level = level + '|' + (focus || '');
    camera.center = c ? [c[0], c[1]] : (t.center ? t.center.slice() : camera.center);
    if (t.zoomBox && camera.zoom) { /* 跨层沿用当前中心，不跳到默认中心 */ }
    camera.zoom = c ? (PROV_VIEW[focus] ? PROV_VIEW[focus][2] : c[2]) : t.zoom;
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
  /* V3.2：纵向拖动夹紧（level 的临界 zoom 之前只留一条窄带） */
  const LAT_LOCK = { L1: { maxZoom: 2.15, band: 8 }, L2: { maxZoom: 2.6, band: 6 }, L3: { maxZoom: Infinity, band: 4 } };
  function clampLat() {
    const st = S.state;
    if (st.sk.mode3d) return;
    const rule = LAT_LOCK[st.geo.level]; if (!rule) return;
    const def = (LEVEL[st.geo.level] || {}).center; if (!def) return;
    if (camera.zoom > rule.maxZoom) return;
    const lat = Math.max(def[1] - rule.band, Math.min(def[1] + rule.band, camera.center[1]));
    if (Math.abs(lat - camera.center[1]) > 0.01) {
      camera.center = [camera.center[0], lat];
      camera.latPending = true;
    }
  }

  function afterZoom() {
    if (camera.latPending && chart) {
      camera.latPending = false;
      chart.setOption({ geo: { center: camera.center.slice() } }, { lazyUpdate: true, silent: true });
    }
    const st = S.state, lv = LEVEL[st.geo.level], box = lv.zoomBox;
    /* 三份相同的世界互相接续；停手后按 360° 回到中央副本，视觉位置不跳变。 */
    if (st.geo.level === 'L1' && Math.abs(camera.center[0] - 105) > 180) camera.center = wrappedCenter(camera.center);
    /* 全球视角缩到最小还在缩：切回三维地球 */
    if (st.geo.level === 'L1' && camera.zoom < box[0] - .02) {
      camera.zoom = box[0];
      S.set({ sk: { mode3d: true } });
      return;
    }
    if (camera.zoom < box[0]) camera.zoom = box[0];
    if (camera.zoom > box[1]) camera.zoom = box[1];
    if (st.geo.level === 'L1' && camera.zoom >= lv.inAt) return enterLevel('L2', null);
    if (st.geo.level === 'L2') {
      if (camera.zoom <= (lv.outAt || 0)) return enterLevel('L1', null);
      /* 放到上限就进湖南（与点击规则一致；原来只有视野中心靠近某省才进，所以常常进不去） */
      if (camera.zoom >= lv.inAt) return enterLevel('L3', DEFAULT_FOCUS);   /* 与点击规则一致：进湖南 */
    }
    if (st.geo.level === 'L3' && camera.zoom <= (lv.outAt || 0)) return enterLevel('L2', null);
    if (chart) chart.setOption({ geo: { zoom: camera.zoom, center: camera.center.slice() } }, { lazyUpdate: true });
    S.set({ sk: { zoom: Math.round(camera.zoom * 100) } });
  }
  /* 触控板双指缩放：Chrome / Edge 发 ctrl+wheel，Safari 发 gesturechange（普通滚轮仍交给 ECharts 漫游） */
  function bindPinch(el) {
    let base = 0;
    el.addEventListener('wheel', e => {
      if (!e.ctrlKey) return;
      e.preventDefault(); e.stopImmediatePropagation();
      zoomByFactor(Math.exp(-e.deltaY * .006));
    }, { capture: true, passive: false });
    el.addEventListener('gesturestart', e => { e.preventDefault(); base = e.scale || 1; }, { passive: false });
    el.addEventListener('gesturechange', e => {
      e.preventDefault();
      const sc = e.scale || 1;
      const f = base ? sc / base : 1;
      base = sc;
      zoomByFactor(f);
    }, { passive: false });
  }
  /* 按倍率缩放（触控板双指用）；三维视图下作用于共用地球，二维视图下作用于地图 */
  function zoomByFactor(factor) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    if (S.state.sk.mode3d) return globe.zoomByFactor(factor);
    const box = LEVEL[S.state.geo.level].zoomBox;
    /* 全球视角在最小比例尺继续缩小：与滚轮 / 按钮一致，切回三维地球 */
    if (factor < 1 && S.state.geo.level === 'L1' && camera.zoom <= box[0] + .004) {
      S.set({ sk: { mode3d: true } });
      return;
    }
    const next = Math.min(box[1], Math.max(box[0], camera.zoom * factor));
    if (Math.abs(next - camera.zoom) < 1e-4) return;
    camera.zoom = next;
    afterZoom();
  }

  function zoomBy(dir) {
    if (S.state.sk.mode3d) return globe.zoomBy(dir);
    const box = LEVEL[S.state.geo.level].zoomBox;
    /* 省区视角缩到最小：回全国（原来卡在省区出不去） */
    if (dir < 0 && S.state.geo.level === 'L3' && camera.zoom <= box[0] + .004) return enterLevel('L2', null);
    /* 全球视角缩到最小再缩：切回三维地球 */
    if (dir < 0 && S.state.geo.level === 'L1' && camera.zoom <= box[0] + .004) {
      S.set({ sk: { mode3d: true } });
      return;
    }
    const next = Math.min(box[1], Math.max(box[0], camera.zoom * (dir > 0 ? 1.14 : 1 / 1.14)));
    if (Math.abs(next - camera.zoom) < 1e-3) return;
    camera.zoom = next;
    afterZoom();
  }
  const zoomState = () => {
    if (S.state.sk.mode3d) return globe.zoomState();
    const box = LEVEL[S.state.geo.level].zoomBox;
    /* 全球视角缩到底会切到三维地球，「缩小」始终可用 */
    return { canIn: camera.zoom < box[1] - 1e-3, canOut: true, zoom: camera.zoom };
  };

  const IMPACT_ALPHA = { high: .18, mid: .13, low: .09 };
  /* 切换时间范围时的事实点"持续生长"：只长点，不画线；非线性速度，约 3 秒长满 */
  let growK = 1, growRaf = 0, growKey = null;
  /* 切换时间范围时，被排除的点不能凭空消失：把上一帧的点留作「退场」图层淡出。
     不同时间窗的铺点节奏也不同（窗口越窄越快），用户能看出换的是哪个范围。 */
  let exitPoints = [], exitLevel = null;
  const GROW_MS = { today: 1500, '7d': 1800, '30d': 2200, '180d': 2700, '365d': 2900, all: 3200 };
  /* ---------- 点击时间范围后：动画结束时让约 1/20 的事实点淡出消失 ----------
     用户 2026-10-19：只改这一处——「点击时间范围筛选后，在动画结束后，消失大概 1/20 的事实点；
     点击不同筛选，数据总量不一样」（数据量本来就随窗口变化，这里只加"退场 5%"）。
     选点用 (坐标 + 视角 + 时间窗) 的哈希取模 20，所以：同一个筛选每次消失的是同一批点（不会乱跳），
     不同筛选消失的批次不同；首屏不触发，只有点了时间范围才触发。 */
  /* 用户 2026-10-19 第 2 条：消失要发生在「铺点动画过程中」，而不是动画结束之后——
     先把点从无到有铺出来，过程中缓慢随机掉掉约 1/20（每个点有自己的淡出窗口），
     同时新点继续铺；**动画一结束就冻结**，不再新增也不再消失。
     选点：随机取 n/20 个（他明确要"随机的"），每个点的淡出起点落在动画 45%–85% 之间，
     淡出时长 = 动画时长的 18%，因此最晚在 100% 处收干净。 */
  const PRUNE_MOD = 20;
  let pruneMap = null, pruneStats = null;
  /* 随机取 n/20 个点，每个点分配一个落在动画窗口内的淡出时段（结束时全部归零） */
  function pickPrune(selected, dur) {
    const list = [...selected];
    const want = Math.max(1, Math.round(list.length / PRUNE_MOD));
    for (let i = list.length - 1; i > 0; i--) {          /* Fisher–Yates 洗牌后取前 want 个 */
      const j = Math.floor(Math.random() * (i + 1));
      const t = list[i]; list[i] = list[j]; list[j] = t;
    }
    const out = new Map();
    const now = performance.now();
    list.slice(0, want).forEach(k => {
      const len = dur * 0.18;                                 /* 淡出占动画时长 18% */
      /* 起点限制在 45%–82%，且必须留满淡出时间，保证**动画结束那一刻全部收干净**（之后冻结） */
      const startAt = Math.min(dur * (0.45 + Math.random() * 0.37), dur - len);
      out.set(k, { t0: now + startAt, len });
    });
    return out;
  }
  /* 淡出透明度：1 → 0；到动画结束时应为 0（不再绘制）。不是退场点则恒为 1 */
  function pruneAlpha(coordKey) {
    if (!pruneMap) return 1;
    const w = pruneMap.get(coordKey);
    if (!w) return 1;
    const k = (performance.now() - w.t0) / w.len;
    return k <= 0 ? 1 : k >= 1 ? 0 : 1 - k;
  }
  function ensureGrow(st) {
    if (growKey === null) { growKey = st.time; return growK; }   /* 首次进入不生长 */
    if (growKey !== st.time) {
      /* exitLevel 初始为 null 时也要取退场点：否则「会话内第一次切时间」没有淡出，
         旧点是瞬时消失的（验收 2026-10-17 发现的边界）。 */
      const sameView = exitLevel === null || exitLevel === st.geo.level;
      exitPoints = sameView && lastPaint ? lastPaint.points.slice(0, 4000) : [];
      exitLevel = st.geo.level;
      growKey = st.time;
      growK = 0;
      const dur = GROW_MS[st.time] || 3200;
      /* 这次铺点过程中要随机退场的 1/20：动画一开始就分配好各自的淡出时段（都在 dur 内结束） */
      const sel = mapPlan(st).selected;
      pruneMap = pickPrune(sel, dur);
      pruneStats = { selected: sel.size, pruned: pruneMap.size };   /* 给验收/测试核对 1/20 用 */
      if (!growRaf) {
        const t0 = performance.now(); let paintedAt = 0;
        const tick = () => {
          growRaf = 0;
          const p = (performance.now() - t0) / dur;
          const finished = p >= 1;
          growK = finished ? 1 : 1 - Math.pow(1 - p, 2.2);   /* 先快后慢，不是线性 */
          const now = performance.now();
          /* 过程中不断重绘（铺新点 + 退场点淡出）；最后一帧正好落在动画结束处，之后冻结 */
          if (S.state.tab === 'fact' && (now - paintedAt >= 80 || finished)) {
            paintedAt = now;
            if (S.state.sk.mode3d) globe.update(globePayload()); else if (chart) applyMap();
          }
          if (!finished) growRaf = requestAnimationFrame(tick);
        };
        growRaf = requestAnimationFrame(tick);
      }
    }
    return growK;
  }
  /* 时间透明度：近 1 个月不透明 → 1~2 个月 90% → 之后线性衰减到 0（窗口边界处消失） */
  const ageAlpha = (f, win) => {
    // Archive profiles intentionally survive the current-event window. Their
    // original publication date remains visible; do not make retained records invisible.
    if (f.persistent || win === 'all') return .9;
    const span = { today: 1, '7d': 7, '30d': 30, '180d': 180, '365d': 365 }[win] || 30;
    const t = Date.parse(String(f.date || '').slice(0, 10) + 'T00:00:00Z');
    const now = Date.parse(String(D.TODAY || new Date().toISOString().slice(0, 10)) + 'T00:00:00Z');
    if (!Number.isFinite(t)) return 1;
    const days = Math.max(0, (now - t) / 86400000);
    if (days <= 30) return 1;
    if (days <= 60) return .9;
    const k = (days - 60) / Math.max(1, span - 60);
    return Math.max(0, .9 * (1 - k));
  };


  /* ---------- V0.8 的"星星亮起"：新事实接入时在坐标处闪一颗星（DOM 动画，1 秒后自动移除） ---------- */
  /* 验收接口：手动触发一次"新事实接入"（通知条 + 星星），便于确认效果 */
  const freshOrder = [];
  function receiveFact(f, options={}) {
    if (!f || !D.factById(f.id)) return null;
    freshIds.add(f.id);
    const at = freshOrder.indexOf(f.id); if (at >= 0) freshOrder.splice(at, 1);
    freshOrder.unshift(f.id); freshOrder.length = Math.min(20, freshOrder.length);
    // Arrival is explicit: changing filters or sorting existing cards is not an arrival.
    S.set({ newFacts: freshOrder.slice() });
    if (S.state.tab === 'fact') {
      renderCards();
      V03Intake.note(dom.side, ((leafOf(f) || {}).group || f.l1Label || '事实'), f.title, f.id);
      flashStar(f, 'bright');
      if (dom.sideBody.__auto) dom.sideBody.__auto.paused = Date.now() + 4500;
      dom.sideBody.scrollTop = 0;
    }
    return f.id;
  }
  function notifyNewest() {
    const list = F.mappable(F.mapFacts(S.state));
    const visible = list.find(f => visiblePixel(f));
    return receiveFact(visible || list[0]);
  }
  function visiblePixel(f) {
    if (!f || !Number.isFinite(f.lng) || !Number.isFinite(f.lat)) return null;
    if (S.state.sk.mode3d) return globe.screenPoint(f.lng, f.lat);
    if (!chart) return null;
    const W = dom.map.clientWidth, H = dom.map.clientHeight;
    for (const value of mapPoints(f.lng, f.lat)) {
      const q = chart.convertToPixel({ geoIndex: 0 }, value);
      if (Array.isArray(q) && q.every(Number.isFinite) && q[0] >= 0 && q[0] <= W && q[1] >= 0 && q[1] <= H) return q;
    }
    return null;
  }
  function flashStar(f, level) {
    if (S.state.tab !== 'fact' || !F.mapEligible(f)) return false;
    // V0.8's positioned overlay; world seam copies and 3D projection share the same presentation.
    return V03Intake.star(dom.mapBox, visiblePixel(f), f && f.id, level === 'bright' || f && f.impact === 'high');
  }
  window.__flashStar = flashStar;
  /* ---------- 卡片自动滚动（非线性、慢）+ 新事实提示 ---------- */
  const freshIds = new Set();
  function autoScrollCards(el) {
    if (!el || el.__auto) return;
    el.__auto = { t: 0, raf: 0, paused: 0, lastTop: el.scrollTop };
    const stepFn = () => {
      const a = el.__auto;
      a.raf = requestAnimationFrame(stepFn);
      if (S.state.tab !== 'fact' || !S.state.panels.cards || document.hidden) return;
      if (!el.isConnected) { cancelAnimationFrame(a.raf); el.__auto = null; return }
      if (Date.now() < a.paused) return;
      /* V3.0：鼠标在卡片区悬停时不自动滚动 */
      if (el.matches(':hover')) { a.lastTop = el.scrollTop; return; }
      if (Math.abs(el.scrollTop - a.lastTop) > 2) { a.paused = Date.now() + 2500; a.lastTop = el.scrollTop; return }  /* 用户手动滚动后暂停一小会儿 */
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 2) { a.t += 0.016; if (a.t > 6) { a.t = 0; el.scrollTop = 0 }    /* 到底停一下再回到顶部 */
        if (a.t > 0 && a.t < 0.02) { a.paused = Date.now() + 1800 } return }
      a.t += 0.016;
      const speed = 0.35 + 0.75 * (1 + Math.sin(a.t * 0.7)) / 2;      /* 0.35~1.1 px/帧，来回变速，不线性 */
      el.scrollTop += speed;
      a.lastTop = el.scrollTop;
    };
    el.__auto.raf = requestAnimationFrame(stepFn);
    el.addEventListener('pointerdown', () => { el.__auto && (el.__auto.paused = Date.now() + 4000) });
    el.addEventListener('wheel', () => { el.__auto && (el.__auto.paused = Date.now() + 4000) }, { passive: true });
  }
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
  /* 地图配色（唯一一套，取自 Mapbox Standard / 苹果地图参考）：绿陆 / 蓝水 / 珊瑚边界 */
  const MAP_PALETTE = {
    land: '#cfe9bd', land2: '#b6dfa4', line: 'rgba(224,128,118,.55)', ink: '#22303f',
    regions: ['#cfe9bd', '#e2efc6', '#b6dfa4', '#eae7c4', '#c9e6cd', '#d7e4b2', '#bcdcc9', '#e8f0d8'],
    tipBg: 'rgba(255,255,255,.98)', tipLine: 'rgba(30,58,92,.22)', mass: 'rgba(47,111,208,.22)', dot: '#2f6fd0'
  };
  const palette = () => MAP_PALETTE;
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
  let lastPaint = null, countryColors, provinceColors;
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

  /* 一次地图重建会用到两份 option（先画点、再按新的地理变换补光晕），采样与去重的前缀
     完全相同，因此按同一批输入缓存，避免对 4 万+ 条事实重复采样。 */
  let planKey='',planCache=null;
  function mapPlan(st, gk) {
    const key=[st.geo.level,st.geo.focus,st.geo.city,st.geo.county,gk,D.revision,window.V03Feed?.revision,
      st.time,st.catKeys,st.varieties,st.region,st.sourceMode,st.q,freshOrder.length].join('|');
    if(key===planKey&&planCache)return planCache;
    const facts = F.mappable(F.mapFacts(st)).filter(f => !window.V03Mass || V03Mass.insideMap(st.geo.level, f.lng, f.lat));
    const coordinates=new Map();facts.forEach(f=>{const k=f.lng.toFixed(4)+'|'+f.lat.toFixed(4);if(!coordinates.has(k))coordinates.set(k,f);});
    const cap=st.geo.level==='L1'?2600:st.geo.level==='L2'?2200:1600;
    const selected=new Set(V03Feed.sampleGeo([...coordinates.values()],cap,new Set([...freshOrder,...facts.filter(V03Scope.priority).map(f=>f.id)])).map(f=>f.lng.toFixed(4)+'|'+f.lat.toFixed(4)));
    planCache={facts,selected};planKey=key;return planCache;
  }

  function mapOption(withInfluence = true) {
    const st = S.state;
    /* 生长：切换时间范围后，点按非线性速度逐步出现（最新的先出，老的随透明度衰减消失） */
    const gk = ensureGrow(st);
    const plan = mapPlan(st, gk < 1 ? gk : 1);
    let facts = plan.facts;
    if (gk < 1) facts = facts.filter((f, i) => i < Math.ceil(facts.length * gk));
    const lv = LEVEL[st.geo.level], p = palette();
    const selected = plan.selected;
    const halos = [], pts = [], ripples = [];
    const pointGroups = new Map();
    const usedHalo = [];                       /* 已经在这些位置画过光晕，太近就不再画，避免叠成一大块 */
    /* 间距按"屏幕像素"算（原来比的是经纬度，等于 28°，中国全境只放得下 2 个 → 只剩 1 个光晕） */
    const toPx = (lng, lat) => { try { const q = chart.convertToPixel({ geoIndex: 0 }, [lng, lat]); return Array.isArray(q) && q.every(Number.isFinite) && q[0] >= 0 && q[0] <= dom.map.clientWidth && q[1] >= 0 && q[1] <= dom.map.clientHeight ? q : null } catch (e) { return null } };
    const tooClose = (lng, lat) => {
      const q = toPx(lng, lat); if (!q) return false;
      return usedHalo.some(p2 => Math.hypot(p2[0] - q[0], p2[1] - q[1]) < 40);
    };
    facts.forEach((f, index) => {
      if(!selected.has(f.lng.toFixed(4)+'|'+f.lat.toFixed(4)))return;
      const diameter = radiusPx(f);
      const coordKey = f.lng.toFixed(4) + '|' + f.lat.toFixed(4);
      const pA = pruneAlpha(coordKey);
      if (pA <= 0.02) return;                                  /* 退场已经结束：这个点不再画 */
      mapPoints(f.lng, f.lat).forEach(value => {
        /* 影响圆：只给"有影响半径"的事实画（既有产品规则，回归测试也在守）；
           之前看不到是因为数据侧大多缺半径 —— 改为在数据侧补默认半径 */
        /* 影响圆 = V0.8 的径向渐变光晕；只给"有真实半径"的事实画，避免整片叠成圆晕 */
        if (withInfluence && diameter > 0 && f.impact === 'high' && halos.length < 24 && toPx(value[0], value[1]) && !tooClose(value[0], value[1])) {   /* 只给高影响、限量、且屏幕间距足够 */
          const a0 = ageAlpha(f, st.time);
          halos.push({ id: f.id, value, symbolSize: Math.min(88, Math.max(16, diameter * 1.2)),
            itemStyle: { color: { type: 'radial', x: .5, y: .5, r: .5, colorStops: [
              { offset: 0, color: hexA(l1Color(f), .10 * a0) }, { offset: .55, color: hexA(l1Color(f), .04 * a0) },
              { offset: 1, color: hexA(l1Color(f), 0) }] } } });
          usedHalo.push(toPx(value[0], value[1]));
          if (ripples.length < 8) ripples.push({ id: f.id, name: f.title, value });
        }
        const pointKey=value.map(v=>v.toFixed(4)).join('|'), existing=pointGroups.get(pointKey);
        if(existing){existing.factIds.push(f.id);return;}
        const point={ id: f.id, factIds:[f.id], name: f.title, value, symbolSize: DOT_SIZE,
          itemStyle: { opacity: (() => {
            const target = ageAlpha(f, st.time);
            /* 生长过程中：老的点边出现边淡出，看起来是"随时间流动消失"；结束时停在目标值不再变 */
            const grow = growK < 1 ? Math.max(0.02, target * (0.25 + 0.75 * growK) * (target < 0.9 ? growK : 1)) : target;   /* 窗口内最老的点降到 0%，等于淡出消失 */
            return grow * pA;                              /* 动画结束后退场的那 1/20 在这里淡出 */
          })(), color: l1Color(f), borderColor: 'rgba(255,255,255,.92)', borderWidth: .9 } };
        pointGroups.set(pointKey,point);pts.push(point);
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
      /* 高影响事实的涟漪（V0.8 同款）：静默、周期性扩散 */
      { id: 'ripple', type: 'effectScatter', coordinateSystem: 'geo', data: st.sk.influence ? ripples : [], silent: true, z: 3,
        showEffectOn: 'render', rippleEffect: { period: 7, scale: 4.2, brushType: 'stroke', number: 2 }, itemStyle: { opacity: .55 } },
      { id: 'facts', type: 'scatter', coordinateSystem: 'geo', data: pts, z: 5, cursor: 'pointer',
        symbolSize:DOT_SIZE,
        /* large 模式会忽略逐点样式：全球视角 9,600 点时所有点被画成同一个默认色，
           分类填充在 2D 全球看不到（用户 2026-10-17 反馈第 2 条）。点量已按坐标组限流，
           关闭 large 后逐点填充色才真正生效。 */
        large: false, progressive: 0,
        itemStyle:{borderColor:'rgba(255,255,255,.92)',borderWidth:.9} },
      flashSeries()
    ].filter(Boolean);
    // Explicit empty data clears an independently disabled layer under ECharts
    // merging; omitting the series would leave its previous markers on screen.
    markerSeries('regions', st.sk.regions ? regionsAtLevel() : [], '#4d7c0f', LAYER_EMOJI.region, 13, st.geo.level !== 'L1').forEach(x => series.push(x));
    markerSeries('gatesP', st.sk.gates ? gatesAtLevel('port') : [], '#0369a1', LAYER_EMOJI.port, 11, st.geo.level !== 'L1').forEach(x => series.push(x));
    markerSeries('gatesA', st.sk.airports ? gatesAtLevel('airport') : [], '#0f766e', LAYER_EMOJI.airport, 11, st.geo.level !== 'L1').forEach(x => series.push(x));
    markerSeries('markets', st.sk.markets ? v12Overlay('market') : [], '#a16207', LAYER_EMOJI.market, 13, true).forEach(x => series.push(x));
    markerSeries('risks', st.sk.risks && st.geo.level === 'L1' ? v12Overlay('risk') : [], '#b91c1c', LAYER_EMOJI.risk, 13, false).forEach(x => series.push(x));
    lastPaint = { level: st.geo.level, points: pts.map(pt => ({ value: pt.value, color: pt.itemStyle.color })) };
    if (growK < 1 && exitPoints.length) {
      series.push({
        id: 'factExit', type: 'scatter', coordinateSystem: 'geo', z: 4, silent: true, animation: false,
        data: exitPoints.map(pt => ({ value: pt.value })),
        symbolSize: DOT_SIZE,
        itemStyle: { color: 'rgba(120,132,148,.55)', opacity: Math.max(0, .95 * (1 - growK)) }
      });
    }
    return {
      backgroundColor: 'transparent',
      /* Full map rebuilds (including level changes) must not tween independently of geo points. */
      animation: false,
      animationDurationUpdate: 0,
      geo: {
        map: lv.map, roam: true, zoom: camera.zoom, center: camera.center.slice(),
        zoomOnMouseWheel: false, moveOnMouseMove: true, moveOnMouseWheel: false,
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
            return '<b>' + esc(f.title) + '</b><br>' + esc(f.region) + ' · ' + f.date + '<br>' + esc(leafOf(f).n || catOf(f).n) + ((p.data.factIds||[]).length>1?'<br>该位置共 '+p.data.factIds.length+' 条事实，点击查看最新记录':'');
          }
          const it = allOverlays().find(r => r.id === (p.data || {}).id);
          return it ? '<b>' + esc(it.name) + '</b>' + (it.variety ? '<br>' + esc(it.variety) : '') : (p.name || '');
        }
      },
      series
    };
  }

  /* ---------- 叠加图层图标：纯 emoji 字形 ----------
     用户 2026-10-17 明确要求：不要手画的 SVG 图形，要「纯 emoji 表情」并且支持透明格式。
     做法：只把 emoji 字形画在 label 上，**不画圆底、不加底色块、不填任何背景**，
     所以图标区域除字形像素外全部透明，底图直接透上来。 */
  const LAYER_EMOJI = { region: '🌾', port: '⚓', airport: '✈️', market: '🏪', risk: '⚠️' };
  const KIND_OF_SERIES = { regions: 'region', gatesP: 'port', gatesA: 'airport', markets: 'market', risks: 'risk' };
  function markerSeries(id, list, color, emoji, size, showLabel) {
    // Airports are an independent reference overlay, not fact records. At
    // world scale, thousands of emoji labels (including seam copies) obscure
    // facts and make every pan expensive. Keep a geographically balanced set;
    // country/province views use their full regional airport list.
    if(id==='gatesA'&&S.state.geo.level==='L1')list=V03Feed.sampleGeo(list,180);
    return [{
      id, type: 'scatter', coordinateSystem: 'geo', z: 5, cursor: 'pointer',
      data: list.flatMap(r => mapPoints(r.lng, r.lat).map(value => ({ id: r.id, name: r.name, value, symbolSize: size }))),
      /* 只有 emoji 字形：符号本身完全透明（不画白圆底），label 也不带 backgroundColor */
      symbol: 'circle', symbolSize: size,
      /* 不设 opacity:0 —— 那会让 label 一起被隐藏；用全透明填充让圆底不可见即可 */
      itemStyle: { color: 'transparent', borderWidth: 0, opacity: 1 },
      label: {
        show: true, position: 'inside', fontSize: size, formatter: () => emoji,
        backgroundColor: 'transparent', padding: 0, textBorderWidth: 0
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

  /* B3/M7：新事实接入 → 同一 geo 坐标系内慢慢亮起再淡出一次（参考早期版本的新数据效果，不做循环闪烁） */
  const PULSE_MS = 2800;
  const pulseCurve = t => (t < .34 ? 1 - Math.pow(1 - t / .34, 3) : Math.max(0, 1 - (t - .34) / .66));
  function flashSeries() {
    const now = performance.now();
    freshFlashes = freshFlashes.filter(x => now - x.t0 < x.dur);
    if (!freshFlashes.length) return null;
    return {
      id: 'freshFlash', type: 'scatter', coordinateSystem: 'geo', silent: true, z: 8, animation: false,
      data: freshFlashes.map(x => {
        const t = Math.min(1, (now - x.t0) / x.dur);
        const a = pulseCurve(t);
        const size = 7 + 20 * (1 - Math.pow(1 - Math.min(1, t / .34), 3));
        return {
          id: x.id, factId: x.factId, value: x.value.slice(), symbolSize: size,
          itemStyle: { color: x.color, opacity: a * .5, borderColor: x.color, borderWidth: 1, shadowColor: x.color, shadowBlur: 20 * a }
        };
      })
    };
  }
  let flashTimer = 0;
  function syncFlashSeries() {
    clearInterval(flashTimer); flashTimer = 0;
    if (!chart || S.state.sk.mode3d || !freshFlashes.length) return;
    const push = () => {
      if (!chart || S.state.sk.mode3d) { clearInterval(flashTimer); flashTimer = 0; return; }
      const series = flashSeries();
      chart.setOption({ series: [series || { id: 'freshFlash', type: 'scatter', coordinateSystem: 'geo', silent: true, z: 8, data: [] }] }, { lazyUpdate: true, silent: true });
      if (!series) { clearInterval(flashTimer); flashTimer = 0; }
    };
    push();
    flashTimer = setInterval(push, 60);
  }
  const flashIds = () => [...document.querySelectorAll('#layer-fact .star-flash')].map(n=>n.dataset.fid);

  /* ---------- 点击 ---------- */
  function openFact(id) {
    const selected = D.factById(id);
    const same = selected && F.mapEligible(selected) && F.mappable(F.mapFacts(S.state)).filter(f => Math.abs(f.lng - selected.lng) < 0.00001 && Math.abs(f.lat - selected.lat) < 0.00001);
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
    /* 共同规则：2D 全球点任一区域 → 中国；中国点任一区域 → 湖南（与关联层同一套） */
    if (st.geo.level === 'L1') { S.set({ geo: { level: 'L2', focus: null } }); return; }
    if (st.geo.level === 'L2') {
      enterLevel('L3', DEFAULT_FOCUS);
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
  /* 只挂载公开直连 HLS，页面来源只作为外链。 */
  const CAN_EMBED = typeof location !== 'undefined' && (location.protocol === 'http:' || location.protocol === 'https:');
  const isPlayable = f => isStreamable(f);
  /* m3u8 直连：hls.js 可用，且流地址协议与页面协议一致（避免 https 页面被混合内容拦截） */
  const pageProto = (typeof location !== 'undefined' ? location.protocol : 'file:');
  const canHls = url => CAN_EMBED && /^https?:\/\//.test(url || '') && !(pageProto==='https:' && url.startsWith('http:')) &&
    ((typeof Hls !== 'undefined' && Hls.isSupported()) || !!document.createElement('video').canPlayType('application/vnd.apple.mpegurl'));
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
  /* 播放器懒挂载；同时最多一个解码器，离开视口立即释放。 */
  const VIS = {
    io: null, active:null,
    init() {
      if (this.io || typeof IntersectionObserver === 'undefined') return;
      this.io = new IntersectionObserver(list => list.forEach(en => VIS.apply(en.target, en.isIntersecting)), { rootMargin: '160px', threshold: .01 });
    },
    apply(box, visible) {
      if (!box || !box.dataset || box.dataset.embed !== '1') return;
      box._visible=visible;
      const on = S.state.sk.live && visible;
      box.classList.toggle('paused', !on);
      const video = box.querySelector('video');
      if (on && !video && box.dataset.hls) {
        if(this.active && !this.active.isConnected)this.dispose(this.active);
        if((!this.active || box.closest('.drawer')) && !box._failed)this.play(box);
        else if(!box.querySelector('button'))this.button(box,'点击播放');
      }
      if (!on) {
        this.dispose(box);
      }
    },
    dispose(scope){
      const boxes=scope?.matches?.('.fc-player')?[scope]:[...(scope?.querySelectorAll?.('.fc-player')||[])];
      boxes.forEach(box=>{if(box._hls){box._hls.destroy();box._hls=null;}const v=box.querySelector('video');if(v){v.pause();v.removeAttribute('src');v.load();v.remove();}if(this.active===box)this.active=null;if(!box.isConnected)this.io?.unobserve(box);});
    },
    button(box,text){box.querySelectorAll('button').forEach(b=>b.remove());const b=document.createElement('button');b.type='button';b.textContent=text;b.onclick=e=>{e.stopPropagation();box._failed=false;this.play(box);};box.appendChild(b);},
    play(box){
      if(this.active && this.active!==box){const previous=this.active;this.dispose(previous);this.button(previous,'点击播放');}
      this.dispose(box);this.active=box;box.querySelectorAll('button').forEach(b=>b.remove());
      const v=document.createElement('video');v.muted=true;v.autoplay=true;v.controls=true;v.playsInline=true;v.preload='none';v.poster=box.dataset.poster||'';v.setAttribute('playsinline','');box.appendChild(v);
      box.onclick=e=>e.stopPropagation();
      const fail=()=>{box._failed=true;this.dispose(box);this.button(box,'直播源暂不可用 · 点击重试');};
      v.addEventListener('error',fail,{once:true});
      if(v.canPlayType('application/vnd.apple.mpegurl')){v.src=box.dataset.hls;v.play().catch(()=>{});return;}
      try{const hls=new Hls({lowLatencyMode:false,maxBufferLength:8,maxMaxBufferLength:15,backBufferLength:0,capLevelToPlayerSize:true,startLevel:0});box._hls=hls;
        hls.loadSource(box.dataset.hls);hls.attachMedia(v);hls.on(Hls.Events.MANIFEST_PARSED,()=>v.play().catch(()=>{}));hls.on(Hls.Events.ERROR,(_,data)=>{if(data.fatal)fail();});
      }catch{fail();}
    },
    sync() {
      this.init();
      if(this.active && !this.active.isConnected)this.dispose(this.active);
      const boxes = [...document.querySelectorAll('.fc-player[data-embed="1"]')];
      boxes.forEach(box => { box.onclick=e=>e.stopPropagation(); if (this.io) { this.io.observe(box); } else this.apply(box, true); });
    }
  };

  function videoBlock(f) {
    const c = f.card || {};
    if (isStreamable(f)) {
      const hlsAttr = isStreamable(f) ? ' data-hls="' + esc(c.hlsUrl) + '"' : '';
      const srcAttr = '';
      return '<div class="fc-player" data-embed="1" data-play="' + (S.state.sk.live ? 1 : 0) + '"' + srcAttr + hlsAttr +
        ' data-poster="'+esc(window.V03Media?.photo(f)?.url||'')+'" data-title="' + esc(c.mediaTitle || '视频') + '">' + (S.state.sk.live ? '' : '<span class="pause">已暂停</span>') + '</div>';
    }
    return '<div class="fc-static" data-embed="0">' +
      '<div class="fs-line"><span class="fs-ic">▤</span><b>' + esc(c.mediaTitle || f.title) + '</b></div>' +
      '<div class="fs-why">' + esc(c.fallbackReason || '该视频源暂不可直接播放，保留静态卡片') + '</div>' +
      (c.hlsUrl || c.embedUrl ? '<a class="ext" href="' + esc(c.hlsUrl || c.embedUrl) + '" target="_blank" rel="noopener noreferrer">打开原始视频源</a>' : '') + '</div>';
  }
  const dataLabel = f => f.prov === 'real' ? '真实来源' : f.prov === 'deidentified' ? '脱敏数据' : '模拟数据';
  const sourceCount = f => new Set((f.evidence || []).map(e => e.t || e.url || e.k).filter(Boolean)).size;
  function cardHTML(f, fresh) {
    const c = f.card || {}, cat = catOf(f);
    const foot = '<div class="fcard-foot"><span>' + esc(f.region || '') + '</span>' +
      (f.date ? '<span>·</span><span>' + esc(f.date) + '</span>' : '') +
      '</div>';
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
        body = '<h5>' + esc(c.title || f.title) + '</h5><p>' + esc(f.summary) + '</p>' +
          ((c.sourceName || c.publishedAt) ? '<div class="fcard-note">' + esc(c.sourceName || '') + (c.sourceName && c.publishedAt ? ' · ' : '') + (c.publishedAt ? String(c.publishedAt).slice(0, 10) : '') + '</div>' : '');
    }
    return '<article class="fcard" data-fid="' + esc(f.id) + '" tabindex="0">' +
      '<div class="fcard-v12-meta"><span>' + esc(leafOf(f).n || cat.n) + '</span>' +
      (fresh ? '<i class="new-dot" aria-label="新接入"></i>' : '') + '</div>' +
      V03Media.figure(f) + body + foot + '</article>';
  }

  let visibleCardCount = 20;
  function renderCards() {
    const st = S.state;
    /* 卡片区用 factsForCards：无坐标事实（如直播源）只在这里出现，地图侧不画。 */
    const facts = F.factsForCards(st).filter(f => st.sk.live || f.cardType !== 'video').sort((a, b) => {
      const ai = freshOrder.indexOf(a.id), bi = freshOrder.indexOf(b.id);
      return (ai < 0 ? 1e9 : ai) - (bi < 0 ? 1e9 : bi) || Number(V03Scope.priority(b))-Number(V03Scope.priority(a));
    });
    dom.side.classList.toggle('off', !st.panels.cards);
    if (!facts.length) {
      dom.sideBody.innerHTML = '<div class="empty">当前筛选下没有事实<br><button class="btn sec" id="clrF">恢复默认筛选</button></div>';
      const b = dom.sideBody.querySelector('#clrF');
      if (b) b.onclick = () => S.set({ time: '7d', q: '', catKeys: null, varieties: [], region: '', sourceMode: 'all' });
      return;
    }
    const scroll = dom.sideBody.scrollTop;
    const stableKey=facts.slice(0,visibleCardCount).map(f=>f.id).join('|')+'|'+st.sk.live;
    if(dom.sideBody.dataset.cards===stableKey){VIS.sync();return;}
    dom.sideBody.dataset.cards=stableKey;
    VIS.dispose(dom.sideBody);
    V03Media.beginCards('fact');
    dom.sideBody.innerHTML = '<div class="fcards">' + facts.slice(0, visibleCardCount).map(f => cardHTML(f, false)).join('') + '</div>' +
      (facts.length > visibleCardCount ? '<div class="fc-more">已显示 ' + visibleCardCount + ' / ' + facts.length + '，继续滚动加载</div>' : '');
    dom.sideBody.querySelectorAll('.fcards .fcard').forEach(el => {
      if (!freshIds.has(el.dataset.fid)) return;
      el.classList.add('is-fresh');
      const meta = el.querySelector('.fcard-v12-meta');
      if (meta && !meta.querySelector('.new-dot')) meta.insertAdjacentHTML('beforeend', '<i class="new-dot" aria-label="新接入"></i>');
    });
    dom.sideBody.scrollTop = scroll;
    autoScrollCards(dom.sideBody);
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
    V03Media.mount(dom.sideBody);
  }

  /* ---------- F10：事实详情（右侧嵌套抽屉） ---------- */
  function renderDetail(box) {
    const st = S.state, f = D.factById(st.factId);
    if (!box) return;
    if (!f) { box.innerHTML = ''; return; }
    const c = f.card || {}, cat = catOf(f), leaf = leafOf(f);
    const objs = (f.objects || []).map(id => D.objById(id)).filter(F.isBusinessObject);
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
        ${f.cardType==='video' ? (isStreamable(f)?'':V03Media.figure(f,'fact',true))+videoBlock(f) : V03Media.figure(f,'fact',true)}
        <div class="fd-sec"><h4>事实摘要</h4><p>${esc(f.summary || '来源材料未提供摘要')}</p></div>
        <div class="fd-sec"><h4>分类与时间</h4>
          ${row('分类', [leaf.group, leaf.sub, leaf.n].filter(Boolean).join(' › '))}
          ${row('发生时间', f.occurredAt || f.date || '来源材料未提供发生时间')}
          ${row('地理范围', path || '来源材料未提供可靠位置')}
          ${row('涉及品种', (f.variety || (f.card && f.card.variety) || (f.commodityName) || '来源材料未提供涉及品种'))}
        </div>
        <div class="fd-sec"><h4>涉及本体 <small>点击进入关联层</small></h4>
          <div>${objs.map(o => { const dm = D.domain(o.domain); return '<span class="objchip" data-obj="' + esc(o.id) + '"><span class="d" style="background:' + dm.c + '"></span><b>' + esc(o.name) + '</b>' + esc(dm.n) + '</span>'; }).join('') || '<p>暂无已确认本体；Jev 候选尚未接入。</p>'}</div>
        </div>
        <div class="fd-sec"><h4>关键数值</h4>${metric ? row('指标', metric) : '<p>来源材料未提供可核对的数值和口径。</p>'}</div>
        <div class="fd-sec"><h4>证据状态</h4>${row('状态', status)}</div>
        <div class="fd-sec">
          ${evidence.length ? evidence.map((e, i) => `<div class="ev"><div class="ev-t">${esc(e.k || '证据')}<span>${esc(e.t || '来源名称缺失')}</span></div><q class="ev-q" data-ev="${i}" role="button" tabindex="0" title="查看完整来源">${esc(e.q || '原文片段缺失')}</q>${e.url ? '<a class="ext" href="' + esc(e.url) + '" target="_blank" rel="noopener noreferrer">来源链接</a>' : ''}</div>`).join('') : '<p>来源不详：材料未提供来源证据。</p>'}
          ${f.sourceUrl ? '<a class="ext" href="' + esc(f.sourceUrl) + '" target="_blank" rel="noopener noreferrer">原始来源</a>' : ''}
        </div>
        ${typeFields.filter(([, v]) => v != null && v !== '').length ? '<div class="fd-sec"><h4>类型字段</h4>' + typeFields.map(([k, v]) => row(k, v)).join('') + '</div>' : ''}
        <div class="fd-actions">
          <button class="btn sec" id="toRel">在关联层查看</button>
          <button class="btn sec" id="toSim">基于该事实发起推演</button>
        </div>
        <div class="fd-actions fd-actions-end">
          <button class="link-btn" id="toLog">查看事实形成过程</button>
        </div>
        ${st.logOpen ? '<div class="fd-sec">' + (f.ingestedAt ? row('首次采集时间', f.ingestedAt) + row('最近更新时间', f.ingestedAt) : '') + row('当前版本', f.version || 'V0.01') + '</div>' : ''}
      </div>`;
    box.querySelectorAll('[data-obj]').forEach(n => n.onclick = () => S.set({
      tab: 'relation', factId: null, factReturnId: f.id, q: '', factSearch: st.q, carry: uniq([...(st.carry || []), f.id]),
      rel: { sel: n.dataset.obj, kind: 'object', focusFact: f.id, stack: [{ kind: 'object', id: n.dataset.obj }] }
    }));
    const toRel = box.querySelector('#toRel');
    if (toRel) toRel.onclick = () => S.set({ tab: 'relation', factId: null, factReturnId: f.id, q: '', factSearch: st.q, carry: uniq([...(st.carry || []), f.id]), rel: { focusFact: f.id, sel: null, kind: null, stack: [] } });
    const toSim = box.querySelector('#toSim');
    if (toSim) toSim.onclick = () => S.set({ tab: 'sim', factId: null, factReturnId: f.id, q: '', factSearch: st.q, carry: uniq([...(st.carry || []), f.id]) });
    /* V3.0 证据弹窗：固定尺寸文字容器，证据原文与“事实形成过程”共用 */
    const pop = document.createElement('div');
    pop.className = 'ev-pop'; pop.hidden = true;
    pop.innerHTML = '<div class="ev-pop-box"><div class="ev-pop-t"></div><div class="ev-pop-body"></div><button class="ev-pop-x" type="button" aria-label="关闭">×</button></div>';
    box.appendChild(pop);
    const openEvPop = (title, body) => {
      pop.querySelector('.ev-pop-t').textContent = title;
      pop.querySelector('.ev-pop-body').textContent = body;
      pop.hidden = false;
    };
    pop.querySelector('.ev-pop-x').onclick = () => { pop.hidden = true; };
    pop.onclick = e => { if (e.target === pop) pop.hidden = true; };
    box.querySelectorAll('.ev-q').forEach(q => {
      const e = evidence[+q.dataset.ev] || {};
      q.onclick = () => openEvPop(e.t || '来源材料', (e.q || '原文片段缺失') + (e.url ? '\n\n来源链接：' + e.url : ''));
      q.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); q.click(); } };
    });
    const toLog = box.querySelector('#toLog');
    if (toLog) toLog.onclick = () => openEvPop('事实形成过程',
      '首次采集时间：' + (f.ingestedAt || '未知') +
      '\n最近更新时间：' + (f.updatedAt || f.ingestedAt || '未知') +
      '\n当前版本：' + (f.version || 'V0.01'));
    VIS.sync();
    V03Media.mount(box);
  }
  const uniq = a => a.filter((x, i) => a.indexOf(x) === i);

  /* 三维地球：与关联层共用同一套渲染（V03Globe），本层只提供事实点与叠加标记 */
  function globePayload() {
    const st = S.state;
    /* 2D 与 3D 必须画同一批点：3D 之前不做任何采样，同一个世界里 3D 比 2D 多出一批点，
       两个视角看起来是不同的数据。现在两者共用同一份采样方案（同一份缓存，不重复计算）。 */
    const gk = ensureGrow(st);
    const plan = mapPlan(st, gk < 1 ? gk : 1);
    let facts = plan.facts;
    if (gk < 1) facts = facts.filter((f, i) => i < Math.ceil(facts.length * gk));
    const unique=[...new Map(facts.slice().reverse().map(f=>[[f.lng.toFixed(4),f.lat.toFixed(4)].join('|'),f])).values()]
      .filter(f => plan.selected.has(f.lng.toFixed(4) + '|' + f.lat.toFixed(4)))
      .map(f => ({ f, a: pruneAlpha(f.lng.toFixed(4) + '|' + f.lat.toFixed(4)) }))
      .filter(x => x.a > 0.02);
    const points = unique.map(({ f, a }) => ({
      id: f.id, lng: f.lng, lat: f.lat, color: l1Color(f), big: f.impact === 'high',
      halo: (st.sk.influence && !f.radiusEstimated && Number.isFinite(f.radius) && f.radius > 0) ? f.radius / 5200 : 0,
      haloAlpha: IMPACT_ALPHA[f.impact] || .12,
      a,                                   /* 退场 1/20 的逐点透明度，3D 与 2D 一致 */
    }));
    const overlay = (st.sk.regions ? regionsAtLevel() : [])
      .concat(st.sk.gates ? gatesAtLevel('port') : [], st.sk.airports ? gatesAtLevel('airport') : [],
        st.sk.markets ? v12Overlay('market') : [], st.sk.risks ? v12Overlay('risk') : []);
    const marks = overlay.map(m => ({
      id: m.id, lng: m.lng, lat: m.lat,
      color: m.kind === 'region' ? '#65a30d' : m.kind === 'airport' ? '#0f766e' : m.kind === 'market' ? '#a16207' : m.kind === 'risk' ? '#b91c1c' : '#0369a1',
      glyph: m.kind === 'region' ? '🌾' : m.kind === 'airport' ? '✈️' : m.kind === 'market' ? '🛒' : m.kind === 'risk' ? '⚠️' : '⚓'
    }));
    return { mode: 'fact', points, marks };
  }
  function syncMode() {
    const st = S.state;
    const show3d = st.sk.mode3d;
    const visible = st.tab === 'fact' && document.visibilityState !== 'hidden';
    const target = show3d ? dom.globe : dom.map;
    if (globeShown !== target) {
      globeShown = target;
      target.classList.remove('view-fade');
      void target.offsetWidth;
      target.classList.add('view-fade');
    }
    dom.globe.style.display = show3d ? 'block' : 'none';
    dom.map.style.display = show3d ? 'none' : 'block';
    const animation = chart && chart.getZr().animation;
    const shouldPauseMap = !visible || show3d;
    if (animation && shouldPauseMap !== mapAnimationPaused) {
      if (shouldPauseMap) animation.stop(); else animation.start();
      mapAnimationPaused = shouldPauseMap;
    }
    globe.setVisible(show3d && visible);
    if (show3d && visible) globe.update(globePayload());
  }
  let globeShown = null;
  function setVisible() { if (dom.globe) syncMode(); }

  function update() {
    if (!root) return;
    const st = S.state;
    const key = JSON.stringify([st.time, st.q, st.catKeys, st.varieties, st.region, st.sourceMode, st.geo.level, st.geo.focus, st.geo.city, st.geo.county,
      st.factId, st.panels.cards, st.logOpen, st.carry, st.newFacts, st.sk.mode3d, st.sk.mass,
      st.sk.influence, st.sk.regions, st.sk.gates, st.sk.airports, st.sk.markets, st.sk.risks, st.sk.live, st.theme, D.revision, st.dataRevision]);
    if (key === sig) return; sig = key;

    dom.searchStatus.hidden = !st.q;
    if (st.q) dom.searchStatus.textContent = '搜索结果：' + st.q + ' · ' + F.facts(st).length + ' 条  ×';

    V03Scope.mount(dom.mapBox,st.geo,patch=>S.set({geo:patch}));
    syncMode();
    const lvKey = st.geo.level + '|' + (st.geo.focus || '');
    const c = ensureChart();
    if (c && !st.sk.mode3d) {
      if (camera.level !== lvKey) {
        camera.level = lvKey;
        const name = st.geo.focus || (st.geo.level === 'L3' ? '湖南' : '');
        const t = LEVEL[st.geo.level], focus = PROV_VIEW[name] || PROV[name];
        const target = focus ? [focus[0], focus[1]] : t.center;
        const zoom = focus ? focus[2] : t.zoom;
        if (st.geo.level === 'L3' && focus) { camera.center = [focus[0], focus[1]]; camera.zoom = focus[2]; }
        else if (st.geo.level !== 'L3' && target) { camera.center = target.slice(); camera.zoom = zoom; }
      }
      const nextMapSig = JSON.stringify([st.time, st.q, st.catKeys, st.varieties, st.region, st.sourceMode, st.geo.level, st.geo.focus, st.geo.city, st.geo.county,
        st.sk.mass, st.sk.influence, st.sk.regions, st.sk.gates, st.sk.airports, st.sk.markets, st.sk.risks, st.theme, D.revision, window.V03Feed?.revision]);
      if (nextMapSig !== mapSig) {
        applyMap();
        mapSig = nextMapSig;
      }
    }
    const nextCardSig = JSON.stringify([st.time, st.q, st.catKeys, st.varieties, st.region, st.sourceMode, st.geo.level, st.geo.focus, st.geo.city, st.geo.county, st.panels.cards, st.sk.live, st.newFacts, D.revision, window.V03Feed?.revision]);
    if (nextCardSig !== cardSig) { visibleCardCount = 20; renderCards(); cardSig = nextCardSig; }
  }

  let mapFrame='';
  function applyMap() {
    const frame=JSON.stringify([S.state.geo,S.state.theme]);
    if(frame!==mapFrame){
      chart.setOption(mapOption(false), { notMerge: true });
      mapFrame=frame;
      // The new geo transform is now available for pixel-spaced halos. Other
      // series were already drawn; resubmitting thousands of points doubles
      // the synchronous work on every level change.
      chart.setOption({series:mapOption(true).series.filter(s=>s.id==='halo'||s.id==='ripple')},{silent:true});
      return;
    }
    chart.setOption({ series: mapOption(true).series }, { silent: true });
  }
  function viewConfig(level, focus) {
    const t = LEVEL[level], c = level === 'L3' ? (PROV_VIEW[focus || '湖南'] || PROV[focus || '湖南']) : null;
    return { ...t, center: c ? c.slice(0, 2) : t.center.slice(), zoom: c ? c[2] : t.zoom, box: t.zoomBox.slice() };
  }
  const debug = () => {
    const st = S.state, all = F.factsAtLevel(st), pts = F.mappable(all);
    const vid = D.FACTS.filter(f => f.cardType === 'video');
    return {
      level: st.geo.level, focus: st.geo.focus, mode3d: st.sk.mode3d, zoom: camera.zoom,
      facts: all.length, mapFacts: F.mapFacts(st).length, mappable: pts.length,
      halos: chart && !st.sk.mode3d ? (chart.getOption().series.find(s => s.id === 'halo')?.data.length || 0) : 0,
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
      globe: globe.debug(), mapAnimationPaused
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
  return { layerEmoji: kind => LAYER_EMOJI[kind] || LAYER_EMOJI.market,
    pruneInfo: () => pruneStats, mount, update, setVisible, renderDetail, debug, flyTo, zoomBy, zoomByFactor, zoomState, flashIds, worldGeoJSON, pick, forceEmbeddable, isPlayable, flashStar, notifyNewest, worldLongitude, worldCopies,
    viewConfig, receiveFact, visiblePosition:visiblePixel, arrivalCandidates:()=>F.mappable(F.mapFacts(S.state)).filter(f=>visiblePixel(f)), mapRegionColor: (name, level) => regionFill(name, palette(), level || 'L1') };
})();
