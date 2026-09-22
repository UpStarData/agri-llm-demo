/* ============================================================
   事实层 · 视觉校准版（V2 指令）
   F1 地图是第一视觉主体，铺满可用视口
   F4 只画事实点 + 影响范围；不画事实之间线路；一级分类决定颜色，三级类型决定 Emoji
   F5 持久事实为稳定小点，不持续发光；新事实接入时一次瞬时闪光（约 1.2s 消退）
   F6 右下角快捷键 + 正上方缩放 ±（菜单内同步）
   F7 底部横向图例（写入共享 #legend）
   F9 右侧两列紧凑瀑布流：无类型徽章，标题 → 摘要 → 地点/时间/来源
   F10 详情走右侧嵌套抽屉：核心事实 — 影响 — 证据来源 — 关联本体
   数据：agrilink-demo-v1（861 事实 / 377 本体 / 585 关系）· 默认口径 近 7 天 + 高可信 + 高影响
   ============================================================ */
window.V03Fact = (function () {
  const D = window.V03Data, S = window.V03Store, F = window.V03Filter;
  let root, chart, dom = {}, sig = '';
  const camera = { level: null, center: [104.5, 34.5], zoom: 1.18, raf: null };

  /* 地图缩放规则（v07）：
     L1 全球：铺满屏幕即最小（不能再缩小），放大到 inAt 切到中国视角
     L2 中国：缩小到 outAt 回到全球；放大到 inAt 且视野在中国某省附近 → 切省区视角
     L3 省区：还能再放大 5 档（1.28^5 ≈ 3.4×），到顶后禁用放大 */
  const LEVEL = {
    L1: { map: 'world110', center: [18, 10], zoom: 1.06, fit: 1.06, bounds: [[-170, 72], [180, -56]], zoomBox: [1.06, 2.4], inAt: 2.2, divisor: 9 },
    L2: { map: 'china', center: [104.5, 36], zoom: 1.0, fit: 0.86, bounds: [[73, 54.5], [136, 17.5]], zoomBox: [0.86, 3.2], inAt: 2.9, outAt: 0.9, divisor: 15 },
    L3: { map: 'china', center: null, zoom: 4.2, fit: 3.4, bounds: [[73, 54.5], [136, 17.5]], zoomBox: [3.4, 14.3], divisor: 7 }
  };
  const PROV = D.PROV_CENTER || {};
  const shortProv = n => String(n || '').replace(/壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市$/g, '') || n;
  const DEFAULT_FOCUS = '湖南';
  const IMPACT_RANK = { high: 3, mid: 2, low: 1 };
  const catOf = f => (D.CATS[f.cat] || { n: f.cat, c: '#1d4ed8', e: '📌' });
  const leafOf = f => ((F.leafOf && F.leafOf(f)) || { e: catOf(f).e, n: '', key: '' });
  /* F4/M6：一级分类决定颜色（低饱和色，与菜单/图例同一套） */
  const groupOf = f => {
    const g = (F.FACT_TREE || []).find(x => (x.subs || []).some(sb => (sb.items || []).some(it => it.key === leafOf(f).key)));
    return g || null;
  };
  const dotColor = f => (groupOf(f) || {}).color || catOf(f).c;
  const emojiOf = f => leafOf(f).e || catOf(f).e;
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

  const TPL = `
  <div class="fact-wrap">
    <div class="fact-mapbox" id="factMapBox">
      <div id="factMap"></div>
      <canvas id="factGlobe" width="1120" height="820" style="display:none"></canvas>
    </div>
    <aside class="fact-side" id="factSide"><div class="fs-body" id="sideBody"></div></aside>
  </div>`;

  function mount(el) {
    root = el; root.innerHTML = TPL;
    dom = {
      mapBox: root.querySelector('#factMapBox'), map: root.querySelector('#factMap'), globe: root.querySelector('#factGlobe'),
      side: root.querySelector('#factSide'), sideBody: root.querySelector('#sideBody')
    };
    window.addEventListener('resize', () => { if (chart) chart.resize(); resizeGlobe(); });
    dom.globe.addEventListener('click', e => {
      const r = dom.globe.getBoundingClientRect();
      const hit = globeHit(e.clientX - r.left, e.clientY - r.top);
      if (!hit) return;
      if (hit.type === 'fact') return openFact(hit.id);
      const o = hit.id && D.objById(hit.id);
      if (o) S.set({ factId: null, factObj: o.id });
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
      afterZoom();
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
  const radiusPx = f => Math.max(9, Math.min(26, (f.radius || 120) / (LEVEL[S.state.geo.level] || LEVEL.L2).divisor));

  const DOT = { high: 6, mid: 5.2, low: 4.6 };      /* 事实点：统一红点，大小随重要性 */
  const DOTC = '#3f4c5f';          /* 统一中性色点（与关联层本体点一致，不用红色） */

  function mapOption() {
    const st = S.state, all = F.factsAtLevel(st), facts = F.mappable(all);
    const lv = LEVEL[st.geo.level];
    const halos = [], pts = [], high = [];
    facts.forEach(f => {
      const sev = f.severity || 40;
      halos.push({ id: f.id, value: [f.lng, f.lat], symbolSize: radiusPx(f),
        itemStyle: { color: { type: 'radial', x: .5, y: .5, r: .5, colorStops: [
          { offset: 0, color: hexA(DOTC, .13) }, { offset: .55, color: hexA(DOTC, .06) }, { offset: 1, color: hexA(DOTC, 0) }] } } });
      pts.push({ id: f.id, name: f.title, value: [f.lng, f.lat], symbolSize: DOT[f.impact] || 5,
        itemStyle: { color: '#ffffff', borderColor: DOTC, borderWidth: 1.1 } });
      if (f.impact === 'high' && sev >= 70) high.push({ id: f.id, name: f.title, value: [f.lng, f.lat] });
    });
    /* 质量级采样层：代表数据库体量（每个三级类型 1 万 / 10 万 / 100 万条），只作密度表达，不参与交互 */
    const mass = (window.V03Mass && st.sk.mass !== false)
      ? V03Mass.sample(st.geo.level, shortProv(st.geo.focus || DEFAULT_FOCUS), F.FACT_ITEMS.map(x => x.key))
      : [];
    const series = [
      { id: 'mass', type: 'scatter', coordinateSystem: 'geo', data: mass.map((m, i) => ({ value: [m.lng, m.lat], symbolSize: 2.3, i })), z: 1, silent: true, symbol: 'circle',
        itemStyle: { color: 'rgba(63,76,95,.42)' } },
      { id: 'halo', type: 'scatter', coordinateSystem: 'geo', data: halos, silent: true, z: 2, symbol: 'circle' },
      { id: 'facts', type: 'scatter', coordinateSystem: 'geo', data: pts, z: 5, cursor: 'pointer' }
    ];
    if (st.sk.regions) markerSeries('regions', D.REGIONS, '#4d7c0f', '🌾', 13, st.geo.level !== 'L1').forEach(x => series.push(x));
    if (st.sk.gates) {
      markerSeries('gatesP', D.GATES.filter(g => g.kind === 'port'), '#0369a1', '⚓', 11, st.geo.level !== 'L1').forEach(x => series.push(x));
      markerSeries('gatesA', D.GATES.filter(g => g.kind === 'airport'), '#0f766e', '✈️', 11, st.geo.level !== 'L1').forEach(x => series.push(x));
      markerSeries('gatesN', D.GATES.filter(g => g.kind === 'node'), '#7e22ce', '🧊', 11, st.geo.level !== 'L1').forEach(x => series.push(x));
    }
    return {
      backgroundColor: 'transparent',
      animationDurationUpdate: 280,
      geo: {
        map: lv.map, roam: true, zoom: camera.zoom, center: camera.center.slice(),
        zoomOnMouseWheel: true, moveOnMouseMove: true, moveOnMouseWheel: false,
        scaleLimit: { min: lv.zoomBox[0], max: lv.zoomBox[1] },
        boundingCoords: lv.bounds || undefined,
        itemStyle: { areaColor: '#e9eef7', borderColor: 'rgba(120,145,185,.55)', borderWidth: .7 },
        emphasis: { itemStyle: { areaColor: '#dde6f4' }, label: { show: true, color: '#2b3444', fontSize: 10 } },
        select: { disabled: true }, label: { show: false }
      },
      tooltip: {
        trigger: 'item', backgroundColor: 'rgba(255,255,255,.97)', borderColor: 'rgba(15,23,42,.12)', borderWidth: 1,
        textStyle: { color: '#10151f', fontSize: 11 }, padding: [6, 9],
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
          const it = D.REGIONS.concat(D.GATES).find(r => r.id === (p.data || {}).id);
          return it ? '<b>' + esc(it.name) + '</b>' + (it.variety ? '<br>' + esc(it.variety) : '') : (p.name || '');
        }
      },
      series
    };
  }

  function markerSeries(id, list, color, emoji, size, showLabel) {
    return [{
      id, type: 'scatter', coordinateSystem: 'geo', z: 5, cursor: 'pointer',
      data: list.map(r => ({ id: r.id, name: r.name, value: [r.lng, r.lat], symbolSize: size })),
      symbol: 'circle', itemStyle: { color: 'rgba(255,255,255,.6)', borderColor: 'transparent', borderWidth: 0 },
      label: {
        show: true, fontSize: size, color: color, formatter: () => emoji, position: 'inside'
      },
      labelLayout: { hideOverlap: true }
    }, showLabel ? {
      id: id + 'Label', type: 'scatter', coordinateSystem: 'geo', silent: true, z: 5,
      data: list.map(r => ({ id: r.id, name: r.name, value: [r.lng, r.lat], symbolSize: 1 })),
      symbol: 'circle', itemStyle: { color: 'transparent' },
      label: { show: true, position: 'bottom', distance: 2, fontSize: 9, color: '#4d586a',
        backgroundColor: 'rgba(255,255,255,.78)', padding: [1, 3], borderRadius: 3,
        formatter: p => { const it = list.find(r => r.id === (p.data || {}).id); return it ? (it.variety || it.name).slice(0, 10) : ''; } },
      labelLayout: { hideOverlap: true }
    } : null].filter(Boolean);
  }

  /* B3/M7：新事实接入 → 对应坐标闪一颗星（DOM 动画，0.9–1s 后自动移除，不长期发光） */
  function flashStar(f, level) {
    if (!f || f.lng == null || S.state.tab !== 'fact' || S.state.sk.mode3d) return;
    if (!chart || !dom.mapBox) return;
    let px = null;
    try { px = chart.convertToPixel({ geoIndex: 0 }, [f.lng, f.lat]); } catch (e) { px = null; }
    if (!Array.isArray(px) || !isFinite(px[0]) || !isFinite(px[1])) return;
    const box = dom.mapBox.getBoundingClientRect();
    if (px[0] < 0 || px[1] < 0 || px[0] > box.width || px[1] > box.height) return;   /* 视野外不闪 */
    const d = document.createElement('div');
    d.className = 'star-flash ' + (level === 'bright' || f.impact === 'high' ? 'bright' : 'dim');
    d.dataset.fid = f.id;
    d.style.left = px[0] + 'px'; d.style.top = px[1] + 'px';
    d.innerHTML = '<i></i>';
    dom.mapBox.appendChild(d);
    setTimeout(() => d.remove(), 1000);
  }
  const flashIds = () => [...document.querySelectorAll('#layer-fact .star-flash')].map(n => n.dataset.fid);

  /* ---------- P2：水波纹扩散（自绘 canvas，缓慢外扩 + 渐隐，半径/速度随 severity） ---------- */
  const RIPPLE = { raf: 0, cv: null };
  function ensureRipple() {
    if (RIPPLE.cv || !dom.mapBox) return RIPPLE.cv;
    const cv = document.createElement('canvas');
    cv.className = 'ripple-canvas';
    dom.mapBox.appendChild(cv);
    RIPPLE.cv = cv;
    return cv;
  }
  function rippleLoop(now) {
    RIPPLE.raf = requestAnimationFrame(rippleLoop);
    const cv = ensureRipple();
    if (!cv || !chart) return;
    const box = dom.mapBox.getBoundingClientRect();
    if (cv.width !== Math.round(box.width) || cv.height !== Math.round(box.height)) { cv.width = Math.round(box.width); cv.height = Math.round(box.height); }
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    const st = S.state;
    if (!st.sk.influence || st.sk.mode3d || st.tab !== 'fact') return;
    const t = now / 1000;
    const facts = F.mappable(F.factsAtLevel(st)).filter(f => f.impact === 'high').slice(0, 60);
    facts.forEach(f => {
      let px = null;
      try { px = chart.convertToPixel({ geoIndex: 0 }, [f.lng, f.lat]); } catch (e) { return; }
      if (!Array.isArray(px) || px[0] < -40 || px[1] < -40 || px[0] > cv.width + 40 || px[1] > cv.height + 40) return;
      const sev = f.severity || 60;
      const period = 6 + sev / 60;                       /* 6.0–7.7s：慢，像水面波纹 */
      const base = radiusPx(f) * 2.4;
      for (let k = 0; k < 2; k++) {
        const phase = ((((t + (f.lng + f.lat) * .31) / period) + k * .5) % 1 + 1) % 1;
        const alpha = .30 * (1 - phase) * (1 - phase);    /* 越外越透明，尾段自然消失 */
        if (alpha < .004) continue;
        const r = base * phase;
        if (!(r > 0.5)) continue;
        ctx.beginPath();
        ctx.arc(px[0], px[1], r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(63,76,95,' + alpha.toFixed(3) + ')';
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
    });
  }
  function syncRipple() {
    const on = S.state.tab === 'fact' && S.state.sk.influence && !S.state.sk.mode3d;
    if (on && !RIPPLE.raf) { RIPPLE.raf = requestAnimationFrame(rippleLoop); }
    if (!on && RIPPLE.raf) { cancelAnimationFrame(RIPPLE.raf); RIPPLE.raf = 0; const cv = RIPPLE.cv; if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); }
  }

  /* ---------- 点击 ---------- */
  function openFact(id) {
    S.set({ factId: id, logOpen: false });
    const card = dom.sideBody && dom.sideBody.querySelector('[data-fid="' + id + '"]');
    if (card) card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const f = D.factById(id);
    if (f && f.level === 'L3' && S.state.geo.level !== 'L3') S.set({ geo: { level: 'L3', focus: String(f.province || '湖南').replace(/省|市$/g, '') } });
  }
  function focusOnMap(f) {
    if (!f || f.lng == null || S.state.sk.mode3d) return;
    const p = camera.center, d = Math.hypot(f.lng - p[0], f.lat - p[1]);
    if (d > 8) flyTo([f.lng, f.lat], Math.max(camera.zoom, LEVEL[S.state.geo.level].zoom), 800);
  }
  function onMapClick(p) {
    const st = S.state, sid = p.seriesId || '';
    if (sid.indexOf('regions') === 0 || sid.indexOf('gates') === 0) {
      const it = D.REGIONS.concat(D.GATES).find(r => r.id === (p.data || {}).id);
      if (it && it.objId) S.set({ factId: null, factObj: it.objId });   /* 就地看本体详情，不切 Tab */
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

  /* ---------- 图例（F7：横向，随筛选同步） ---------- */
  function renderLegend() {
    if (!window.V03Shell) return;
    const st = S.state;
    if (!st.sk.legend) return window.V03Shell.setLegend('');
    const facts = F.mappable(F.factsAtLevel(st));
    const byGroup = {};
    facts.forEach(f => { const g = groupOf(f); if (g) byGroup[g.key] = (byGroup[g.key] || 0) + 1; });
    const chips = (F.FACT_TREE || [])
      .filter(g => byGroup[g.key])
      .sort((a, b) => byGroup[b.key] - byGroup[a.key])
      .map(g => '<span class="lg-i"><i style="background:' + g.color + '"></i>' + g.n + '</span>');
    const marks = [];
    if (st.sk.regions) marks.push('<span class="lg-i">🌾 农产品产区</span>');
    if (st.sk.gates) marks.push('<span class="lg-i">⚓ 港口</span><span class="lg-i">✈️ 机场</span><span class="lg-i">🧊 冷链节点</span>');
    window.V03Shell.setLegend(chips.concat(marks).join(''));
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
  function cardHTML(f, fresh) {
    const c = f.card || {}, cat = catOf(f);
    const foot = '<div class="fcard-foot"><span>' + esc(f.region) + '</span><span>·</span><span>' + f.date + '</span>' +
      '<span class="sp"></span><span class="fcard-mark">' + esc(CRED_TXT[f.cred] || '') + (f.impact === 'high' ? ' · <em>高影响</em>' : '') + '</span></div>';
    let body = '';
    switch (f.cardType) {
      case 'price': {
        const s = (c.trend && c.trend.length > 1) ? c.trend : [Number(c.priceValue) || 0, Number(c.priceValue) || 0];
        const ch = typeof c.changePct === 'number' ? c.changePct : 0, up = ch >= 0;
        body = '<h5>' + esc(c.commodityName || f.title) + '</h5>' +
          '<div class="price-row"><span class="price-v">' + fmtNum(c.priceValue) + '</span>' +
          '<span class="price-d ' + (up ? 'up' : 'down') + '">' + (up ? '▲' : '▼') + ' ' + Math.abs(ch).toFixed(1) + '%</span>' +
          '<span class="price-u">' + esc(c.priceUnit || '') + '</span></div>' + spark(s, up) +
          '<p>' + esc(f.summary) + '</p>';
        break;
      }
      case 'weather': {
        const lv = c.alertLevel || 'blue';
        body = '<div class="wx"><span class="wx-i">' + WX_ICON(c.weatherIconCode) + '</span><span class="wx-t">' + esc(c.regionName || f.region) + '</span>' +
          '<span class="alert alert-' + lv + '">' + ({ red: '红色', orange: '橙色', yellow: '黄色', blue: '蓝色' }[lv] || lv) + '预警</span></div>' +
          '<h5>' + esc(f.title) + '</h5><p>' + esc(c.impactText || f.summary) + '</p>';
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
          kbar(c.kline || []) + '<div class="price-row"><span class="price-v">' + (hasQuote ? fmtNum(c.lastPrice) : '—') + '</span>' +
          (hasQuote && ch ? '<span class="price-d ' + (up ? 'up' : 'down') + '">' + (up ? '▲' : '▼') + ' ' + Math.abs(ch).toFixed(2) + '%</span>' : '') +
          '<span class="price-u">' + esc(c.unit || '') + '</span></div>' +
          '<div class="fcard-note">' + esc(c.exchange || '') + (hasQuote ? '' : ' · 暂无实时报价') + '</div>';
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
    return '<article class="fcard' + (fresh ? ' fresh' : '') + '" data-fid="' + f.id + '" tabindex="0">' +
      (fresh ? '<span class="fresh-tag">新接入</span>' : '') + body + foot + '</article>';
  }

  function renderCards() {
    const st = S.state;
    let facts = F.factsAtLevel(st);
    /* v07：直播卡常驻（已核验可嵌入的公开源不受事实筛选影响），新接入事实置顶 */
    const freshIds = (st.newFacts || []).filter(id => D.factById(id));
    const playable = D.FACTS.filter(f => isPlayable(f) && facts.every(x => x.id !== f.id));
    facts = freshIds.map(id => D.factById(id)).concat(playable).concat(facts);
    dom.side.classList.toggle('off', !st.panels.cards);
    if (!facts.length) {
      dom.sideBody.innerHTML = '<div class="empty">当前筛选下没有事实<br><button class="btn sec" id="clrF">恢复默认筛选</button></div>';
      const b = dom.sideBody.querySelector('#clrF');
      if (b) b.onclick = () => S.set({ time: '7d', cred: 'high', infl: 'high', q: '', catKeys: null });
      return;
    }
    dom.sideBody.innerHTML = '<div class="fcards">' + facts.map(f => cardHTML(f, freshIds.includes(f.id))).join('') + '</div>';
    dom.sideBody.querySelectorAll('.fcard').forEach(el => {
      const open = () => {
        const f = D.factById(el.dataset.fid);
        focusOnMap(f);
        S.set({ factId: el.dataset.fid, logOpen: false });
      };
      el.onclick = open;
      el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
    });
    if (st.factId) {
      const on = dom.sideBody.querySelector('[data-fid="' + st.factId + '"]');
      if (on) on.classList.add('on');
    }
    VIS.sync();
  }

  /* ---------- F10：事实详情（右侧嵌套抽屉） ---------- */
  function renderDetail(box) {
    const st = S.state, f = D.factById(st.factId);
    if (!box) return;
    if (!f) { box.innerHTML = ''; return; }
    const c = f.card || {}, cat = catOf(f), leaf = leafOf(f);
    const objs = (f.objects || []).map(id => D.objById(id)).filter(Boolean);
    const path = (f.regionPath || []).map(x => x.name).join(' › ') || f.region;
    const logs = (D.STREAM_SEQ || []).filter(e => e.factId === f.id).slice(0, 20);
    box.innerHTML = `
      <div class="fd">
        <div class="fd-id">${esc(f.date)} · ${esc(f.region)} · ${esc(cat.n)}${leaf.n ? ' · ' + esc(leaf.n) : ''}</div>
        <h3>${esc(f.title)}</h3>
        <div class="fd-chips fcard-mark">${esc(CRED_TXT[f.cred] || '')}${f.impact === 'high' ? ' · <em>高影响</em>' : ''}${f.level === 'L3' && f.province ? ' · ' + esc(f.province) : ''}</div>

        <div class="fd-sec">
          <h4>核心事实</h4>
          <p>${esc(f.summary)}</p>
          ${f.cardType === 'video' ? videoBlock(f) : ''}
          ${f.cardType === 'price' && c.trend ? spark(c.trend, (c.changePct || 0) >= 0) : ''}
          ${f.cardType === 'market' ? kbar(c.kline || []) : ''}
        </div>

        <div class="fd-sec">
          <h4>影响 <small>当前确认影响区域与判断依据</small></h4>
          <div class="impact">
            <div class="viz">${f.radius}<br><span style="font-size:.5625rem">km</span></div>
            <div class="txt">
              <b>${f.impact === 'high' ? '高影响' : f.impact === 'mid' ? '中影响' : '低影响'}</b> · 影响范围约 ${f.radius} km<br>
              ${esc(path)}<br>
              判断依据：${f.severity >= 70 ? '证据明确的事实' : '模型估算为主'}
            </div>
          </div>
        </div>

        <div class="fd-sec">
          <h4>证据来源 <small>${f.evidence.length} 条</small></h4>
          ${f.evidence.map(e => `<div class="ev"><div class="ev-t">${esc(e.k)}<span>${esc(e.t)}</span></div><q>${esc(e.q)}</q>${e.url ? '<a class="ext" href="' + esc(e.url) + '" target="_blank" rel="noopener noreferrer">来源链接</a>' : ''}</div>`).join('')}
        </div>

        <div class="fd-sec">
          <h4>关联本体 <small>${objs.length} 个</small></h4>
          <div>${objs.map(o => { const dm = D.domain(o.domain); return '<span class="objchip" data-obj="' + o.id + '"><span class="d" style="background:' + dm.c + '"></span><b>' + esc(o.name) + '</b>' + esc(dm.n) + '</span>'; }).join('') || '<p>本条事实暂未关联本体对象。</p>'}</div>
        </div>

        <div class="fd-actions">
          <button class="btn sec" id="toRel">在关联层查看</button>
          <button class="btn ter" id="toLog">${st.logOpen ? '收起处理记录' : '处理记录'}</button>
        </div>
        ${st.logOpen ? '<div class="fd-sec"><h4>处理记录</h4><div class="rec-log">' + (logs.length ? logs.map(l => '<div>' + esc(l.text) + '</div>').join('') : '<div>暂无处理记录</div>') + '</div></div>' : ''}
      </div>`;
    box.querySelectorAll('[data-obj]').forEach(n => n.onclick = () => S.set({
      tab: 'relation', factId: null, carry: uniq([...(st.carry || []), f.id]),
      rel: { sel: n.dataset.obj, kind: 'object', focusFact: f.id, stack: [{ kind: 'object', id: n.dataset.obj }] }
    }));
    const toRel = box.querySelector('#toRel');
    if (toRel) toRel.onclick = () => S.set({ tab: 'relation', factId: null, carry: uniq([...(st.carry || []), f.id]), rel: { focusFact: f.id, sel: null, kind: null, stack: [] } });
    const toLog = box.querySelector('#toLog');
    if (toLog) toLog.onclick = () => S.set({ logOpen: !st.logOpen });
    VIS.sync();
  }
  const uniq = a => a.filter((x, i) => a.indexOf(x) === i);

  /* ---------- 3D 地球（浅色） ---------- */
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
    g.addColorStop(0, '#f7fafd'); g.addColorStop(.7, '#eef3fa'); g.addColorStop(1, '#e4ebf6');
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.closePath();
    ctx.fillStyle = g; ctx.fill(); ctx.clip();
    landRings.forEach(ring => clipRing(ring, cx, cy, R).forEach(run => {
      if (run.length < 2) return;
      ctx.beginPath();
      run.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = '#dfe7f3'; ctx.fill();
      ctx.strokeStyle = 'rgba(120,145,185,.6)'; ctx.lineWidth = .8; ctx.stroke();
    }));
    ctx.strokeStyle = 'rgba(120,145,185,.18)';
    for (let lat = -60; lat <= 60; lat += 30) {
      const pts = [];
      for (let lng = -180; lng <= 180; lng += 4) pts.push([lng, lat]);
      clipRing(pts, cx, cy, R).forEach(run => { if (run.length < 2) return; ctx.beginPath(); run.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke(); });
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(120,145,185,.5)'; ctx.lineWidth = 1; ctx.stroke();
    const hits = [];
    const facts = F.mappable(F.factsAtLevel(st));
    if (st.sk.influence) facts.forEach(f => {
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
      ctx.font = '9px "IBM Plex Sans SC",sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#2b3444';
      ctx.fillText(emojiOf(f), p.x, p.y + 3);
      hits.push({ x: p.x, y: p.y, type: 'fact', id: f.id });
    });
    const marks = (st.sk.regions ? D.REGIONS : []).concat(st.sk.gates ? D.GATES : []);
    marks.forEach(m => {
      const p = gProject(m.lng, m.lat, cx, cy, R);
      if (p.z <= 0) return;
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.strokeStyle = m.kind === 'region' ? '#65a30d' : m.kind === 'airport' ? '#0f766e' : m.kind === 'node' ? '#7e22ce' : '#0369a1';
      ctx.lineWidth = 1; ctx.stroke();
      hits.push({ x: p.x, y: p.y, type: 'mark', id: m.objId });
    });
    globe.hits = hits;
  }
  function globeHit(x, y) {
    const sx = dom.globe.width / dom.globe.clientWidth, sy = dom.globe.height / dom.globe.clientHeight;
    const p = { x: x * sx, y: y * sy };
    let best = null, bd = 14 * sx;
    (globe.hits || []).forEach(h => { const d = Math.hypot(h.x - p.x, h.y - p.y); if (d < bd) { bd = d; best = h; } });
    if (!best) return null;
    return { type: best.type === 'fact' ? 'fact' : 'obj', id: best.id };
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

  /* ---------- 主更新 ---------- */
  function update() {
    if (!root) return;
    const st = S.state;
    const key = JSON.stringify([st.time, st.cred, st.infl, st.q, st.catKeys, st.geo.level, st.geo.focus,
      st.factId, st.panels.cards, st.logOpen, st.carry, st.sk.mode3d, st.sk.influence, st.sk.regions, st.sk.gates, st.sk.legend, st.sk.live]);
    if (key === sig) return; sig = key;

    syncMode();
    syncRipple();
    const lvKey = st.geo.level + '|' + (st.geo.focus || '');
    const c = ensureChart();
    if (c && !st.sk.mode3d) {
      let justLeveled = false;
    if (camera.level !== lvKey) {
        camera.level = lvKey; justLeveled = true;
        const t = LEVEL[st.geo.level], focus = PROV[st.geo.focus || (st.geo.level === 'L3' ? '湖南' : '')];
        const target = focus ? [focus[0], focus[1]] : t.center;
        const zoom = focus ? focus[2] : t.zoom;
        if (st.geo.level === 'L3' && focus) { camera.center = [focus[0], focus[1]]; camera.zoom = focus[2]; }
        else if (st.geo.level !== 'L3' && target) { camera.center = target.slice(); camera.zoom = zoom; }
        c.clear();
      }
      c.setOption(mapOption(), { notMerge: true });
      /* Z3：层级切换时事实点淡入（世界→中国→省区 过渡自然） */
      if (justLeveled) {
        c.setOption({ series: [{ id: 'facts', itemStyle: { opacity: .15 } }, { id: 'mass', itemStyle: { opacity: .1 } }] }, { lazyUpdate: true });
        setTimeout(() => c.setOption({ series: [{ id: 'facts', itemStyle: { opacity: 1 } }, { id: 'mass', itemStyle: { opacity: 1 } }] }, { lazyUpdate: true, animationDurationUpdate: 420 }), 90);
      }
    }
    renderLegend(); renderCards();
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
      legend: st.sk.legend, legendItems: document.querySelectorAll('#legend .lg-i').length,
      videoTotal: vid.length,
      videoEmbeddable: vid.filter(f => f.card && f.card.embeddable === 'yes' && f.card.embedUrl).length,   /* 已核验可嵌入的公开源 */
      videoStreamable: vid.filter(f => f.card && f.card.hlsUrl).length,                                    /* 有 m3u8 直连地址 */
      videoVerified: vid.filter(isPlayable).length,                                                        /* 当前环境下可播放（http/https） */
      videoStatic: vid.filter(f => !isPlayable(f)).length,
      cards: document.querySelectorAll('#layer-fact .fcard').length,
      cardTypes: [...document.querySelectorAll('#layer-fact .fcard')].reduce((m, n) => { const f = D.factById(n.dataset.fid); if (f) m[f.cardType] = (m[f.cardType] || 0) + 1; return m; }, {}),
      emojiLeaves: new Set(pts.map(f => leafOf(f).key)).size,
      flashes: document.querySelectorAll('#layer-fact .star-flash').length,
      roam: !!(chart && chart.getOption() && chart.getOption().geo && chart.getOption().geo[0] && chart.getOption().geo[0].roam),
      dictReady: !!F.dictReady
    };
  };
  const pick = {
    fact: id => onMapClick({ seriesId: 'facts', data: { id } }),
    region: id => onMapClick({ seriesId: 'regions', data: { id } }),
    gate: id => onMapClick({ seriesId: 'gatesP', data: { id } })
  };
  const forceEmbeddable = id => {
    const f = D.factById(id);
    if (f && f.card) { f.card.embeddable = 'yes'; f.card.embedUrl = f.card.embedUrl || 'about:blank#verified'; sig = ''; update(); }
  };
  return { mount, update, renderDetail, debug, flyTo, zoomBy, zoomState, flashIds, worldGeoJSON, pick, forceEmbeddable, isPlayable, flashStar };
})();
