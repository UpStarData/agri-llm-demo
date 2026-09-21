/* ============================================================
   事实层：地图即主体（页面指令 一、事实层）
   数据源：数据包 agrilink-demo-v1（LLM-292 · SCHEMA §2）
   M0  地图铺满视口；3D 为地球（缓慢自转，内容与 2D 一致）
   M1  2D/3D · M2 影响力动画（半径与强度随 severity）· M3 全屏 · M4 直播流
   M5  主要产区（geo/regions）· M6 港口与机场（geo/ports + geo/airports + geo/nodes）
   M7–M11 时间 / 可信度 / 影响 / 搜索 / 图例（快捷键在 app.js 统一渲染）
   M12 快捷键条在地图右下角一排 · M13 密度按 scopeLayer（全球 342 / 中国 175 / 湖南 281）
   M14 亮星视觉 · M15 数据包 stream.sequence 的 star 事件驱动亮星
   R1  两列瀑布流 · R2 六类 cardType 卡片模板 · D1 事实详情弹窗
   ============================================================ */
window.V03Fact = (function () {
  const D = window.V03Data, S = window.V03Store, F = window.V03Filter;
  let root, chart, dom = {}, sig = '';
  const camera = { level: null, center: [104.5, 34.5], zoom: 1.18, raf: null };

  const LEVEL = {
    L1: { map: 'world110', center: [18, 10], zoom: 1.06, bounds: [[-170, 72], [180, -56]], note: '全球视野 · 数据包 L1 层事实', divisor: 9 },
    L2: { map: 'china', center: [104.5, 36], zoom: 1.0, bounds: [[73, 54.5], [136, 17.5]], note: '中国范围内事实', divisor: 15 },
    L3: { map: 'china', center: null, zoom: 4.2, bounds: [[73, 54.5], [136, 17.5]], note: '省区范围内事实', divisor: 7 }
  };
  const PROV = D.PROV_CENTER || {};
  const provOf = f => f.province || f.region || '';
  const CAT_COLOR = cat => (D.CATS[cat] ? D.CATS[cat].c : '#60a5fa');
  const CAT_NAME = cat => (D.CATS[cat] ? D.CATS[cat].n : cat);

  function worldGeoJSON() {
    const raw = window.__WORLD110 || [];
    const depth = x => { let d = 0; while (Array.isArray(x) && x.length) { d++; x = x[0]; } return d; };
    return {
      type: 'FeatureCollection',
      features: raw.map(o => {
        const d = depth(o.c);
        const geometry = d >= 4 ? { type: 'MultiPolygon', coordinates: o.c } : { type: 'Polygon', coordinates: d === 3 ? o.c : [o.c] };
        return { type: 'Feature', properties: { name: o.n }, geometry };
      })
    };
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
    S.onEvent('stream:line', p => flashFact(p && p.fact, p && p.level));
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

  const STAR_PATH = 'path://M0,-10 L2.1,-2.1 L10,0 L2.1,2.1 L0,10 L-2.1,2.1 L-10,0 L-2.1,-2.1 Z';
  const IMPACT_RANK = { high: 3, mid: 2, low: 1 };
  const starSize = f => 6.4 + IMPACT_RANK[f.impact] * 3.6 + Math.min(6, (f.severity || 30) / 18);
  const haloSymbol = f => Math.max(12, (f.radius || 120) / (LEVEL[S.state.geo.level] || LEVEL.L2).divisor);
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
    const st = S.state, all = F.factsAtLevel(st), facts = F.mappable(all);
    const lv = LEVEL[st.geo.level];
    const halos = [], stars = [], ripples = [], high = [];
    facts.forEach(f => {
      const color = CAT_COLOR(f.cat);
      if (st.sk.influence) {
        halos.push({ id: f.id, value: [f.lng, f.lat], symbolSize: haloSymbol(f), itemStyle: { color: haloGradient(f) } });
        (f.impact === 'high' ? high : ripples).push({
          id: f.id, name: f.title, value: [f.lng, f.lat], symbolSize: 7,
          itemStyle: { color: hexA(color, .5), borderColor: color, opacity: .9 }
        });
      }
      stars.push({
        id: f.id, name: f.title, value: [f.lng, f.lat, f.radius],
        symbol: STAR_PATH, symbolSize: starSize(f),
        itemStyle: { color: '#fff', shadowBlur: 10 + IMPACT_RANK[f.impact] * 5, shadowColor: color, opacity: .96 },
        label: (st.geo.level === 'L1' ? f.impact === 'high' : facts.length <= 46) ? {
          show: true, position: 'right', distance: 5, fontSize: 9.5, color: 'rgba(226,236,252,.92)',
          formatter: () => (f.short || f.title).slice(0, 10), textBorderColor: 'rgba(4,8,16,.85)', textBorderWidth: 2
        } : { show: false }
      });
    });
    const regions = [];
    if (st.geo.level === 'L2') {
      const byProv = {};
      all.forEach(f => { const p = provOf(f); byProv[p] = (byProv[p] || 0) + 1; });
      Object.keys(byProv).forEach(p => {
        const key = String(p).replace(/壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市$/g, '');
        const full = (window.__CHINA_GEO.features.find(x => String(x.properties.name || '').indexOf(key) === 0) || {}).properties;
        if (full) regions.push({ name: full.name, itemStyle: { areaColor: 'rgba(56,189,248,' + Math.min(.32, .05 + .04 * byProv[p]).toFixed(2) + ')' } });
      });
      if (st.geo.focus) {
        const key = String(st.geo.focus).replace(/壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市$/g, '');
        const f2 = window.__CHINA_GEO.features.find(x => String(x.properties.name || '').indexOf(key) === 0);
        if (f2) regions.push({ name: f2.properties.name, itemStyle: { areaColor: 'rgba(56,189,248,.16)', borderColor: '#38bdf8', borderWidth: 1.4 } });
      }
    }
    const series = [
      { id: 'halo', type: 'scatter', coordinateSystem: 'geo', data: halos, silent: true, z: 2, symbol: 'circle' },
      { id: 'flash', type: 'effectScatter', coordinateSystem: 'geo', data: flashData(), z: 9, symbol: STAR_PATH, symbolSize: 24,
        rippleEffect: { scale: 5.5, brushType: 'stroke', period: 2.6 }, itemStyle: { color: '#fff', shadowBlur: 22, shadowColor: '#fff' } },
      { id: 'facts', type: 'scatter', coordinateSystem: 'geo', data: stars, z: 7, cursor: 'pointer' }
    ];
    const capped = arr => arr.slice().sort((a, b) => (IMPACT_RANK[b.impact] - IMPACT_RANK[a.impact]) || ((b.severity || 0) - (a.severity || 0))).slice(0, 80);
    if (st.sk.influence && ripples.length) {
      series.push({ id: 'rippleLow', type: 'effectScatter', coordinateSystem: 'geo', data: capped(ripples), z: 5, silent: true,
        rippleEffect: { scale: 3.6, brushType: 'stroke', period: 4.8 } });
    }
    if (st.sk.influence && high.length) {
      series.push({ id: 'rippleHigh', type: 'effectScatter', coordinateSystem: 'geo', data: capped(high), z: 6, silent: true,
        rippleEffect: { scale: 5.4, brushType: 'stroke', period: 2.8 } });
    }
    if (st.sk.regions) markerSeries('regions', D.REGIONS, '#a3e635', 'diamond', 'region').forEach(s => series.push(s));
    if (st.sk.gates) {
      markerSeries('gatesP', D.GATES.filter(g => g.kind === 'port'), '#fb923c', 'triangle', 'gate').forEach(s => series.push(s));
      markerSeries('gatesA', D.GATES.filter(g => g.kind === 'airport'), '#fbbf24', 'rect', 'gate').forEach(s => series.push(s));
      markerSeries('gatesN', D.GATES.filter(g => g.kind === 'node'), '#38bdf8', 'roundRect', 'gate').forEach(s => series.push(s));
    }
    return {
      backgroundColor: 'transparent',
      animationDurationUpdate: 380,
      geo: {
        map: lv.map, roam: false, zoom: camera.zoom, center: camera.center.slice(), regions,
        boundingCoords: lv.bounds || undefined,
        itemStyle: { areaColor: '#101a2e', borderColor: 'rgba(125,160,215,.26)', borderWidth: .7 },
        emphasis: { itemStyle: { areaColor: '#16233b' }, label: { show: true, color: '#dbe7fa', fontSize: 10 } },
        select: { disabled: true }, label: { show: false }
      },
      tooltip: {
        trigger: 'item', backgroundColor: 'rgba(8,13,24,.94)', borderColor: 'rgba(255,255,255,.14)', borderWidth: 1,
        textStyle: { color: '#e6eefb', fontSize: 11.5 }, padding: [7, 10],
        formatter: p => {
          const sid = p.seriesId || '';
          if (sid.indexOf('regions') === 0) { const it = D.REGIONS.find(r => r.id === (p.data || {}).id); return it ? '<b>' + it.name + '</b><br>' + (it.variety || '') + (it.adminArea ? '<br>' + it.adminArea : '') : ''; }
          if (sid.indexOf('gates') === 0) { const it = D.GATES.find(r => r.id === (p.data || {}).id); return it ? '<b>' + it.name + '</b><br>' + ({ port: '港口', airport: '机场', node: '冷链 / 内河节点' }[it.kind] || '') + (it.cargo ? ' · ' + it.cargo : '') : ''; }
          if (sid === 'facts') {
            const f = D.factById(p.data.id); if (!f) return '';
            return '<b>' + f.title + '</b><br>' + f.date + ' · ' + f.region + ' · ' + CAT_NAME(f.cat) +
              '<br><span style="opacity:.7">影响半径 ' + f.radius + ' km · severity ' + f.severity + '</span>';
          }
          return p.name || '';
        }
      },
      series
    };
  }

  /* 产区 / 港口 / 机场 / 节点：数据包 geo/*.geojson（真实经纬度） */
  function markerSeries(id, list, color, sym, kind) {
    const item = p => list.find(r => r.id === (p.data || {}).id);
    return [{
      id, type: 'scatter', coordinateSystem: 'geo', z: 8, cursor: 'pointer',
      data: list.map(r => ({ id: r.id, name: r.name, value: [r.lng, r.lat], symbolSize: kind === 'region' ? 9 : 8 })),
      symbol: sym, itemStyle: { color: color, borderColor: '#08101f', borderWidth: 1, shadowBlur: 9, shadowColor: color },
      label: {
        show: false, position: kind === 'region' ? 'bottom' : 'top', distance: 3, fontSize: 9,
        color: kind === 'region' ? '#d9f99d' : '#fed7aa',
        formatter: p => { const it = item(p); return it ? (kind === 'region' ? (it.variety || it.name) : it.name) : ''; },
        textBorderColor: 'rgba(4,8,16,.8)', textBorderWidth: 2
      }
    }];
  }

  /* ---------- M15：数据包 star 事件 → 亮星（bright / dim 由数据包给定） ---------- */
  const flash = new Map();
  function flashFact(f, level) {
    if (!f || S.state.tab !== 'fact' || f.lng == null) return;
    const list = F.factsAtLevel(S.state);
    if (!list.some(x => x.id === f.id)) return;
    flash.set(f.id, { f, until: Date.now() + (level === 'bright' ? 3800 : 2400), bright: level === 'bright' });
    if (chart && !S.state.sk.mode3d) chart.setOption({ series: [{ id: 'flash', data: flashData() }] }, { lazyUpdate: true });
    clearTimeout(flashFact._t);
    flashFact._t = setTimeout(() => {
      const now = Date.now();
      [...flash.keys()].forEach(k => { if (flash.get(k).until <= now) flash.delete(k); });
      if (chart && !S.state.sk.mode3d) chart.setOption({ series: [{ id: 'flash', data: flashData() }] }, { lazyUpdate: true });
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

  /* ---------- 地图点击 ---------- */
  function onMapClick(p) {
    const st = S.state, sid = p.seriesId || '';
    if (sid.indexOf('regions') === 0) { const it = D.REGIONS.find(r => r.id === (p.data || {}).id); return it && openEntity(it.objId); }
    if (sid.indexOf('gates') === 0) { const it = D.GATES.find(r => r.id === (p.data || {}).id); return it && openEntity(it.objId); }
    if (sid === 'facts' && p.data && p.data.id) return S.set({ factId: p.data.id, logOpen: false });
    const name = p.name || '';
    if (!name) return;
    if (st.geo.level === 'L1') {
      if (name === 'China' || name === '中国') return S.set({ geo: { level: 'L2', focus: null } });
      return;
    }
    const short = String(name).replace(/壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市$/g, '');
    if (st.geo.level === 'L2') {
      const c = PROV[short];
      if (!c) return S.emit('toast', short + '：本层暂无省区事实，可在左侧图层菜单切换分类');
      S.set({ geo: { level: 'L3', focus: short }, factId: null });
      camera.center = [c[0], c[1]]; flyTo([c[0], c[1]], c[2], 900);
      return;
    }
    if (st.geo.level === 'L3' && short !== (st.geo.focus || '湖南')) S.emit('toast', '当前为省区视角（' + (st.geo.focus || '湖南') + '），返回全国后可切换到其它省区');
  }
  function openEntity(objId) {
    const o = objId && D.objById(objId);
    if (!o) return;
    S.set({ tab: 'relation', rel: { sel: objId, kind: 'object', view: 'geo' } });
    S.emit('toast', '已定位本体对象：' + o.name);
  }

  /* ---------- 覆盖层 ---------- */
  function renderLevel() {
    const st = S.state, lv = st.geo.level, focus = st.geo.focus || '湖南';
    const item = (level, label, isCur) => isCur ? '<b>' + label + '</b>' : '<button data-lv="' + level + '">' + label + '</button>';
    dom.level.innerHTML = item('L1', '全球', lv === 'L1') + '<span>›</span>' + item('L2', '中国', lv === 'L2') +
      (lv === 'L3' ? '<span>›</span><b>' + focus + '</b><button data-back="1">返回全国</button>' : '');
    dom.level.querySelectorAll('[data-lv]').forEach(b => b.onclick = () => {
      const want = b.dataset.lv, c = LEVEL[want];
      camera.center = c.center ? c.center.slice() : camera.center; camera.zoom = c.zoom;
      S.set({ geo: { level: want, focus: want === 'L3' ? '湖南' : null }, factId: null });
    });
    const back = dom.level.querySelector('[data-back]');
    if (back) back.onclick = () => { const c = LEVEL.L2; camera.center = c.center.slice(); camera.zoom = c.zoom; S.set({ geo: { level: 'L2', focus: null }, factId: null }); };
    dom.hint.textContent = st.sk.mode3d
      ? '3D 地球 · 缓慢自转 · 点星点看事实详情 · 点产区/口岸标记看本体对象'
      : lv === 'L3' ? '省区视角 · 点星点看详情 · Esc 或「返回全国」回到上一级'
        : lv === 'L2' ? '点省份进入省区视角 · 点星点看事实详情'
          : '全球视角 · 点中国进入全国视角 · 点境外区域查看该区域事实';
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
    if (!st.sk.legend || st.sk.mode3d) return;
    const cats = Object.keys(D.CATS).map(k => '<span class="lg-i"><i style="background:' + D.CATS[k].c + '"></i>' + D.CATS[k].e + ' ' + D.CATS[k].n + '</span>').join('');
    dom.legend.innerHTML = '<span class="lg-t">事实类型图例（冷色 · ' + Object.keys(D.CATS).length + ' 类）</span>' + cats +
      '<span class="lg-i"><span class="ring"></span>影响范围（半径随严重度 severity）</span>' +
      '<span class="lg-i"><span class="ln"></span>新接入数据在地图上亮星</span>' +
      '<span class="lg-i"><span class="ln dash"></span>暖色标记 = 产区 / 港口 / 机场</span>';
  }

  /* ---------- 3D 地球（自绘正交投影，内容与 2D 同源） ---------- */
  const globe = { rot: 105, tilt: .34, raf: 0, last: 0, hits: [] };
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
    return { x: cx + x * R, y: cy - y2 * R, z: z2, lng: lng, lat: lat };
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
      } else if (cur) {
        cur.push(lerpEdge(prev || p, p, cx, cy, R));
        out.push(cur); cur = null;
      }
      prev = p;
    });
    if (cur) { if (prev && prev.z > 0) cur.push(cur[0]); out.push(cur); }
    return out;
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
    const g = ctx.createRadialGradient(cx - R * .3, cy - R * .35, R * .1, cx, cy, R * 1.05);
    g.addColorStop(0, '#12203a'); g.addColorStop(.65, '#0c1729'); g.addColorStop(1, '#070d18');
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
    ctx.clip();
    ctx.lineWidth = 1;
    landRings.forEach(ring => clipRing(ring, cx, cy, R).forEach(run => {
      if (run.length < 2) return;
      ctx.beginPath();
      run.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = '#1b2c49'; ctx.fill();
      ctx.strokeStyle = 'rgba(120,170,235,.36)'; ctx.stroke();
    }));
    ctx.strokeStyle = 'rgba(125,160,215,.10)';
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts = [];
      for (let lng = -180; lng <= 180; lng += 4) pts.push([lng, lat]);
      clipRing(pts, cx, cy, R).forEach(run => { if (run.length < 2) return; ctx.beginPath(); run.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke(); });
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(150,200,255,.35)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.012, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(90,150,235,.14)'; ctx.lineWidth = 8; ctx.stroke();

    const hits = [], t = performance.now() / 1000;
    const facts = F.mappable(F.factsAtLevel(st));
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
    const marks = (st.sk.regions ? D.REGIONS.map(r => Object.assign({}, r, { kind2: 'region' })) : [])
      .concat(st.sk.gates ? D.GATES.map(gg => Object.assign({}, gg, { kind2: 'gate' })) : []);
    marks.forEach(m => {
      const p = gProject(m.lng, m.lat, cx, cy, R);
      if (p.z <= 0) return;
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2);
      ctx.fillStyle = m.kind2 === 'region' ? '#a3e635' : (m.kind === 'airport' ? '#fbbf24' : m.kind === 'node' ? '#38bdf8' : '#fb923c');
      ctx.fill();
      ctx.strokeStyle = 'rgba(8,16,31,.9)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.font = '9px "IBM Plex Sans SC",sans-serif'; ctx.fillStyle = m.kind2 === 'region' ? '#d9f99d' : '#fed7aa';
      ctx.textAlign = 'center'; ctx.fillText(m.kind2 === 'region' ? (m.variety || m.name) : m.name, p.x, p.y - 6);
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
    const m = (best.kind === 'region' ? D.REGIONS : D.GATES).find(x2 => x2.id === best.id);
    return m ? { type: 'obj', id: m.objId } : null;
  }
  function loopGlobe(now) {
    globe.raf = requestAnimationFrame(loopGlobe);
    if (now - globe.last < 42) return;
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

  /* ============================================================
     右侧：两列瀑布流事实卡片（R1–R4）—— 六类 cardType（数据包 cards.schema.json）
     ============================================================ */
  const CRED = { high: ['高可信', 'hi'], medium: ['中可信', 'mid'], mid: ['中可信', 'mid'], low: ['低可信', 'low'] };
  const IMPACT_LABEL = { high: '高影响', mid: '中影响', low: '低影响' };
  const CARD_LABEL = { news: '新闻', policy: '政策', price: '价格', weather: '天气', video: '视频/直播', market: '市场' };
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
  const chip = (t, c, dot) => '<span class="chip ' + (c || '') + '">' + (dot ? '<i style="background:' + dot + '"></i>' : '') + t + '</span>';
  const srcName = f => (f.evidence && f.evidence[0] && f.evidence[0].t) || f.sourcePlugin || '';
  const externalLink = (url, label) => url ? '<a class="ext" href="' + url + '" target="_blank" rel="noopener noreferrer">' + label + ' ↗</a>' : '';

  function spark(series, up) {
    const w = 176, h = 26, min = Math.min(...series), max = Math.max(...series), span = max - min || 1;
    const pts = series.map((v, i) => [i / (series.length - 1) * (w - 4) + 2, h - 3 - (v - min) / span * (h - 8)]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const c = up ? '#f43f5e' : '#16a34a';
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none">' +
      '<path d="' + line + ' L' + pts[pts.length - 1][0] + ' ' + h + ' L' + pts[0][0] + ' ' + h + ' Z" fill="' + hexA(c, .14) + '"/>' +
      '<path d="' + line + '" fill="none" stroke="' + c + '" stroke-width="1.4"/></svg>';
  }
  /* 数据包 kline 有两种形态：收盘价数组，或 [开,高,低,收] 数组（取收盘）；无报价时给占位 */
  const toClose = v => Array.isArray(v) ? Number(v[v.length - 1]) : Number(v);
  function kbar(raw) {
    const series = (raw || []).map(toClose).filter(v => isFinite(v));
    if (series.length < 2) return '<div class="kbar empty"><i style="height:40%"></i><i style="height:40%"></i></div>';
    const bars = series.slice(-8);
    const min = Math.min(...bars), max = Math.max(...bars), span = max - min || 1;
    return '<div class="kbar">' + bars.map((v, i) => {
      const hgt = 20 + (v - min) / span * 80;
      const dn = i > 0 && v < bars[i - 1];
      return '<i class="' + (dn ? 'dn' : '') + '" style="height:' + hgt.toFixed(0) + '%"></i>';
    }).join('') + '</div>';
  }
  /* 视频 / 直播：仅对数据包标注 embeddable=yes 的已验证源播放，其余静态卡片降级 */
  const isPlayable = f => f.cardType === 'video' && f.card && f.card.embeddable === 'yes' && !!f.card.embedUrl;
  function clock(t) {
    const s = Math.floor((t || 0) % 86400);
    return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(x => String(x).padStart(2, '0')).join(':');
  }
  function videoCard(f) {
    const c = f.card || {};
    if (isPlayable(f)) {
      /* 已验证可嵌入：M4 开启时才挂载 iframe（关闭时不产生任何外部请求） */
      const playing = S.state.sk.live;
      return '<div class="fc-player" data-embed="1" data-play="' + (playing ? 1 : 0) + '" data-src="' + c.embedUrl + '">' +
        (playing ? '<iframe src="' + c.embedUrl + '" title="' + (c.mediaTitle || '视频') + '" loading="lazy" allowfullscreen></iframe>' : '') +
        (c.isLive ? '<span class="live">● LIVE</span>' : '') +
        '<span class="ch">' + (c.provider || '视频源') + '</span>' +
        (playing ? '' : '<span class="pause"><span>▶</span><span>已暂停 · 快捷键 M4 开启直播流</span></span>') + '</div>';
    }
    return '<div class="fc-static" data-embed="0">' +
      '<div class="fs-cover"><span class="fs-play" aria-hidden="true">▶</span><span class="fs-badge">' + (c.isLive ? 'LIVE' : '视频') + '</span></div>' +
      '<div class="fs-meta"><b>' + (c.mediaTitle || f.title) + '</b><span>' + (c.provider || '') + '</span></div>' +
      '<div class="fs-why">' + (c.fallbackReason || '源未验证可嵌入，保持静态卡片') + '</div>' +
      externalLink(c.embedUrl, '打开原始视频源') + '</div>';
  }

  function cardHTML(f) {
    const cat = D.CATS[f.cat] || { n: f.cat, c: '#60a5fa', e: '📌' };
    const c = f.card || {};
    const cred = CRED[f.cred] || CRED.low;
    const head = '<div class="fcard-top">' + chip(cat.e + ' ' + cat.n, '', cat.c) + chip(cred[0], cred[1]) +
      (f.impact === 'high' ? chip('高影响', 'impact') : '') + '</div>';
    const foot = '<div class="fcard-foot"><span>' + f.region + '</span><span>·</span><span>' + f.date + '</span><span class="sp"></span>' +
      '<span class="fcard-tag">' + (CARD_LABEL[f.cardType] || '记录') + '</span></div>';
    let body = '';
    switch (f.cardType) {
      case 'price': {
        const s = (c.trend && c.trend.length > 1) ? c.trend : [Number(c.priceValue) || 0, Number(c.priceValue) || 0];
        const ch = typeof c.changePct === 'number' ? c.changePct : 0, up = ch >= 0;
        body = '<h5>' + (c.commodityName || f.title) + '</h5>' +
          '<div class="price-row"><span class="price-v">' + fmtNum(c.priceValue) + '</span>' +
          '<span class="price-d ' + (up ? 'up' : 'down') + '">' + (up ? '▲' : '▼') + ' ' + Math.abs(ch).toFixed(1) + '%</span>' +
          '<span class="price-u">' + (c.priceUnit || '') + '</span></div>' + spark(s, up) +
          '<p style="margin-top:4px">' + f.summary + '</p>' +
          (c.caliber ? '<div class="fcard-tag">口径：' + c.caliber + '</div>' : '');
        break;
      }
      case 'weather': {
        const lv = c.alertLevel || 'blue';
        body = '<div class="wx"><span class="wx-i">' + WX_ICON(c.weatherIconCode) + '</span><span class="wx-t">' + (c.regionName || f.region) + '</span>' +
          '<span class="alert alert-' + lv + '">' + ({ red: '红色预警', orange: '橙色预警', yellow: '黄色预警', blue: '蓝色提示' }[lv] || lv) + '</span></div>' +
          '<h5 style="margin-top:4px">' + f.title + '</h5><p>' + (c.impactText || f.summary) + '</p>';
        break;
      }
      case 'policy':
        body = '<h5>' + (c.policyTitle || f.title) + '</h5><p>' + (c.impactSummary || f.summary) + '</p>' +
          '<div class="fcard-tag">发布机构：' + (c.issuer || '—') + (c.effectiveDate ? ' · 生效 ' + c.effectiveDate : '') + '</div>';
        break;
      case 'market': {
        const hasQuote = !!Number(c.lastPrice);
        const ch = typeof c.changePct === 'number' ? c.changePct : 0, up = ch >= 0;
        body = '<h5>' + (c.instrumentName || f.title) + ' <small class="sym">' + (c.symbol || '') + '</small></h5>' +
          kbar(c.kline || []) + '<div class="price-row" style="margin-top:4px"><span class="price-v">' + (hasQuote ? fmtNum(c.lastPrice) : '—') + '</span>' +
          (hasQuote && ch ? '<span class="price-d ' + (up ? 'up' : 'down') + '">' + (up ? '▲' : '▼') + ' ' + Math.abs(ch).toFixed(2) + '%</span>' : '') +
          '<span class="price-u">' + (c.unit || '') + '</span></div>' +
          '<div class="fcard-tag">' + (c.exchange || '') + (hasQuote ? '' : ' · 无实时报价') + '</div>';
        break;
      }
      case 'video':
        body = videoCard(f) + '<h5>' + f.title + '</h5><p>' + f.summary + '</p>';
        break;
      default:
        body = (c.imageUrl ? '<div class="thumb">' + (c.sourceName || '图文') + '<span class="cam">▤</span></div>' : '') +
          '<h5>' + (c.title || f.title) + '</h5><p>' + f.summary + '</p>' +
          '<div class="fcard-tag">' + (c.sourceName || srcName(f)) + (c.publishedAt ? ' · ' + String(c.publishedAt).slice(0, 10) : '') + '</div>';
    }
    return '<article class="fcard" data-fid="' + f.id + '" tabindex="0" style="border-left-color:' + cat.c + '">' + head + body + foot + '</article>';
  }

  const TIME_LABEL = { '7d': '近 7 天', '30d': '近 30 天', '90d': '近 90 天', all: '全部' };
  const CRED_LABEL = { high: '高', mid: '中及以上', low: '低及以上', all: '不限' };

  function renderCards() {
    const st = S.state, facts = F.factsAtLevel(st);
    dom.sideCount.textContent = facts.length + ' 条';
    dom.sideNote.textContent = F.levelMixed(st) ? '本层无匹配，已显示其它层级' : LEVEL[st.geo.level].note;
    if (!facts.length) {
      dom.sideBody.innerHTML = '<div class="empty">当前筛选下没有事实。<br>时间「' + (TIME_LABEL[st.time] || st.time) + '」· 可信度「' +
        (CRED_LABEL[st.cred]) + '」· 影响「' + (CRED_LABEL[st.infl]) + '」<br>' +
        '<button class="btn sec" id="clrF">恢复默认筛选</button></div>';
      const b = dom.sideBody.querySelector('#clrF');
      if (b) b.onclick = () => S.set({ time: 'all', cred: 'all', infl: 'all', q: '', catKeys: null });
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

  /* ---------- 卡片内直播 / 视频流：仅已验证可嵌入源；M4 控制播放 ---------- */
  const LIVE = { raf: 0, t0: performance.now(), canvases: [] };
  function syncPlayers() {
    LIVE.canvases = [...document.querySelectorAll('#layer-fact .fc-player[data-embed="1"], #modal .fd-player')].map(box => ({
      box, cv: box.querySelector('canvas'), src: box.dataset.src || ''
    }));
    const on = S.state.sk.live;
    LIVE.canvases.forEach(c => { c.box.dataset.play = on ? '1' : '0'; c.box.classList.toggle('paused', !on); });
    if (on && !LIVE.raf) LIVE.raf = requestAnimationFrame(loopLive);
    if (!on && LIVE.raf) { cancelAnimationFrame(LIVE.raf); LIVE.raf = 0; LIVE.canvases.forEach(drawPaused); }
  }
  function loopLive(now) {
    LIVE.raf = requestAnimationFrame(loopLive);
    const t = (now - LIVE.t0) / 1000;
    LIVE.canvases.forEach((c, i) => { if (c.box.dataset.play === '1') drawLive(c.cv, t, i); });
    const tc = document.querySelector('#modal .fd-player .tc');
    if (tc) tc.textContent = clock(t);
  }
  function drawLive(cv, t, seed) {
    if (!cv || !cv.getContext) return;
    const ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
    ctx.fillStyle = '#05070c'; ctx.fillRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, 'hsl(' + ((seed * 40) % 360) + ',42%,26%)'); g.addColorStop(.55, 'hsl(' + ((seed * 40 + 40) % 360) + ',38%,16%)'); g.addColorStop(1, '#05070c');
    ctx.fillStyle = g;
    const yy = 34 + Math.sin(t * .6 + seed) * 10;
    ctx.fillRect(0, yy, W, H - yy - 18);
    ctx.globalAlpha = .16;
    for (let y = 0; y < H; y += 4) { ctx.fillStyle = '#fff'; ctx.fillRect(0, y + (t * 30 % 4), W, 1); }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 42; i++) {
      const bw = W / 42, amp = (Math.sin(t * 3 + i * .7 + seed) * .5 + .5) * (H * .26) + 3;
      ctx.globalAlpha = .28; ctx.fillStyle = '#fff';
      ctx.fillRect(i * bw + 2, H - 20 - amp, bw - 3, amp);
    }
    ctx.globalAlpha = .9;
    ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.font = 'bold 11px "IBM Plex Sans SC",sans-serif';
    ctx.fillText('已验证可嵌入源 · 直播画面', 8, 16);
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = '9px ui-monospace,Menlo,monospace';
    ctx.fillText(clock(t), 8, 27);
    ctx.globalAlpha = 1;
  }
  function drawPaused(c) {
    const cv = c.cv; if (!cv || !cv.getContext) return;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#080d18'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.font = '11px "IBM Plex Sans SC",sans-serif';
    ctx.fillText('画面已暂停', 8, 18);
  }

  /* ---------- 事实详情弹窗（D1 / D2） ---------- */
  function renderDetail(wrap) {
    const st = S.state, f = D.factById(st.factId);
    if (!f) { wrap.innerHTML = ''; return; }
    const cat = D.CATS[f.cat] || { n: f.cat, c: '#60a5fa', e: '📌' };
    const cred = CRED[f.cred] || CRED.low;
    const c = f.card || {};
    const objs = (f.objects || []).map(id => D.objById(id)).filter(Boolean);
    const rels = (f.relations || []).map(id => D.relById(id)).filter(Boolean);
    const logs = (D.STREAM_SEQ || []).filter(e => e.factId === f.id).slice(0, 40);
    const inSeeds = (st.sim.seedIds || []).includes(f.id);
    const playable = isPlayable(f);
    const path = (f.regionPath || []).map(p => p.name).join(' › ') || f.region;
    wrap.innerHTML = `
      <div class="fd-h">
        <div style="flex:1">
          <h3>${f.title}</h3>
          <div class="fd-id">${f.id} · ${cat.n} · ${f.region}</div>
        </div>
      </div>
      <div class="fd-chips">
        ${chip(cat.e + ' ' + cat.n, '', cat.c)}${chip(cred[0], cred[1])}${chip('影响 ' + IMPACT_LABEL[f.impact], f.impact === 'high' ? 'impact' : '')}
        ${chip(f.date)}${chip(f.level === 'L1' ? '全球层' : f.level === 'L2' ? '全国层' : '省区层')}${chip(CARD_LABEL[f.cardType] || f.cardType)}
      </div>
      <div class="fd-grid">
        <div class="fd-col">
          <div class="fd-sec">
            <h4>事实摘要 <small>${(f.taxonomy || {}).l2 || ''} ${(f.taxonomy || {}).l3 || ''}</small></h4>
            <p>${f.summary}</p>
            ${f.cardType === 'video' ? videoCard(f) : ''}
            ${f.cardType === 'price' ? '<div style="margin-top:9px">' + spark((c.trend && c.trend.length > 1 ? c.trend : [1, 1]), (c.changePct || 0) >= 0) + '</div>' : ''}
            ${f.cardType === 'market' ? '<div style="margin-top:9px">' + kbar((c.kline && c.kline.length > 1 ? c.kline : [1, 1])) + '</div>' : ''}
          </div>
          <div class="fd-sec">
            <h4>证据 <small>${f.evidence.length} 条 · 可回溯</small></h4>
            ${f.evidence.map(e => `<div class="ev"><div class="ev-t">${chip(e.k)}<span>${e.t}</span></div><q>${e.q}</q>${e.url ? '<div class="ev-u">' + externalLink(e.url, '来源链接') + '</div>' : ''}</div>`).join('')}
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
              <div class="kv"><span>严重度</span><b>${f.severity} / 100</b></div>
              <div class="kv"><span>可信度评分</span><b>${(f.credScore * 100).toFixed(0)}%</b></div>
              <div class="kv"><span>生效日期</span><b>${f.date}</b></div>
              <div class="kv"><span>空间层级</span><b>${f.level}</b></div>
              <div class="kv"><span>来源级别</span><b>${f.authorityTier || '—'} 级</b></div>
              <div class="kv"><span>坐标精度</span><b>${({ exact: '地物点', approx: '近似', region_only: '行政区', none: '无坐标' }[f.geoPrecision] || f.geoPrecision)}</b></div>
              <div class="kv"><span>经纬度</span><b>${f.lng == null ? '无坐标（不在地图定位）' : '东经 ' + f.lng.toFixed(2) + '° / 北纬 ' + f.lat.toFixed(2) + '°'}</b></div>
              <div class="kv"><span>影响半径</span><b>${f.radius} km</b></div>
            </div>
          </div>
          <div class="fd-sec">
            <h4>行政区路径 <small>数据包 regionPath</small></h4>
            <p>${path}</p>
          </div>
          <div class="fd-sec">
            <h4>影响范围 <small>半径随严重度</small></h4>
            <div class="impact">
              <div class="viz">${f.radius}<br><span style="font-size:.625rem">km</span></div>
              <div class="txt"><b>${IMPACT_LABEL[f.impact]}</b> · severity ${f.severity}<br>图上以扩散波纹与半透明光晕表示；无坐标对象只在对象清单中列出，不在地图上虚拟点位。</div>
            </div>
          </div>
          <div class="fd-actions">
            <button class="btn" id="toRel">进入关联层（携带本条事实）</button>
            <button class="btn sec" id="toSeed">${inSeeds ? '已在推演种子中 · 前往推演层' : '加入推演种子'}</button>
            <button class="btn ter" id="toLog">${st.logOpen ? '收起处理记录' : '查看处理记录'}</button>
          </div>
          ${st.logOpen ? `<div class="fd-sec"><h4>处理记录 <small>数据包 stream.sequence</small></h4><div class="rec-log">${logs.length ? logs.map(l => '<div>[' + (l.k || l.stage) + '] ' + l.text + '</div>').join('') : '<div>暂无该事实的处理记录</div>'}</div></div>` : ''}
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
      S.emit('toast', '已携带「' + (f.short || f.title.slice(0, 10)) + '」进入关联层');
    };
    wrap.querySelector('#toSeed').onclick = () => {
      const ids = uniq([...(st.sim.seedIds || []), f.id]);
      S.set({ sim: { seedIds: ids } });
      S.emit('toast', inSeeds ? '该事实已在推演种子中（共 ' + ids.length + ' 条）' : '已加入推演种子（共 ' + ids.length + ' 条）');
    };
    wrap.querySelector('#toLog').onclick = () => S.set({ logOpen: !st.logOpen });
  }
  const uniq = a => a.filter((x, i) => a.indexOf(x) === i);

  /* ---------- 主更新 ---------- */
  function update() {
    if (!root) return;
    const st = S.state;
    if (st.factId) {
      const f = D.factById(st.factId);
      if (f && f.level === 'L3' && f.province && st.geo.level !== 'L3') {
        S.set({ geo: { level: 'L3', focus: String(f.province).replace(/壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市$/g, '') } });
        return;
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
        const t = LEVEL[st.geo.level], focus = PROV[st.geo.focus || (st.geo.level === 'L3' ? '湖南' : '')];
        const target = focus ? [focus[0], focus[1]] : t.center;
        const zoom = focus ? focus[2] : t.zoom;
        if (st.geo.level === 'L3' && focus) { camera.center = [focus[0], focus[1]]; camera.zoom = focus[2]; }
        else if (st.geo.level !== 'L3' && target) { camera.center = target.slice(); camera.zoom = zoom; }
        c.clear();
      }
      c.setOption(mapOption(), { notMerge: true });
    }
    renderLevel(); renderKpi(); renderLegend(); renderCards();
  }

  const debug = () => {
    const st = S.state, all = F.factsAtLevel(st), pts = F.mappable(all);
    const vid = D.FACTS.filter(f => f.cardType === 'video');
    return {
      level: st.geo.level, focus: st.geo.focus, mode3d: st.sk.mode3d,
      facts: all.length, mappable: pts.length, stars: pts.length,
      halos: st.sk.influence ? pts.length : 0,
      ripples: st.sk.influence ? pts.filter(f => f.impact !== 'high').length : 0,
      hotRipples: st.sk.influence ? pts.filter(f => f.impact === 'high').length : 0,
      objects: new Set(all.flatMap(f => f.objects || [])).size,
      regionMarks: st.sk.regions ? D.REGIONS.length : 0,
      gateMarks: st.sk.gates ? D.GATES.length : 0,
      legend: st.sk.legend,
      videoTotal: vid.length,
      videoVerified: vid.filter(isPlayable).length,
      videoStatic: vid.filter(f => !isPlayable(f)).length,
      livePlaying: document.querySelectorAll('#layer-fact .fc-player[data-play="1"]').length,
      cards: document.querySelectorAll('#layer-fact .fcard').length,
      cardTypes: [...document.querySelectorAll('#layer-fact .fcard')].reduce((m, n) => { const f = D.factById(n.dataset.fid); if (f) m[f.cardType] = (m[f.cardType] || 0) + 1; return m; }, {}),
      globeHits: globe.hits.length
    };
  };

  const pick = {
    fact: id => onMapClick({ seriesId: 'facts', data: { id } }),
    region: id => onMapClick({ seriesId: 'regions', data: { id } }),
    gate: id => onMapClick({ seriesId: 'gatesP', data: { id } })
  };
  /* 仅用于验证「已验证可嵌入源才播放」这一机制：把某条视频事实临时标记为可嵌入 */
  const forceEmbeddable = id => {
    const f = D.factById(id);
    if (f && f.card) { f.card.embeddable = 'yes'; f.card.embedUrl = f.card.embedUrl || 'about:blank#verified'; sig = ''; update(); }
  };

  return { mount, update, renderDetail, debug, flyTo, flashIds: () => [...flash.keys()], starSize, worldGeoJSON, pick, forceEmbeddable, isPlayable };
})();
