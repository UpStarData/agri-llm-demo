/* ============================================================
   三维地球（事实层 / 关联层共用同一套渲染）
   - 深空底 + 三层星野（视差 + 闪烁）+ 大气层边缘光 + 明暗交界 + 区域配色陆块
   - 事实层：事实点（分类色 + 表情）+ 地理影响圆 + 叠加图层标记；拾取返回 fact / mark
   - 关联层：本体节点 + 关系线（入场逐条画出、之后持续流动）+ 新本体淡入光晕；拾取返回 object
   - 滚轮 / 双指放到最大：对外抛 onZoomEdge('in')，由 mapkit 切换到二维全球视角
   ============================================================ */
window.V03Globe = (function () {
  /* 每个图层各持一个实例（两层同时挂载，画布与状态不能共用） */
  function create() {
  let canvas, ctx, visible = false, raf = 0, last = 0, rotation = 105, tilt = .22, radiusScale = .38;
  let mode = 'relation';
  let points = [], marks = [], nodes = [], routes = [], hits = [], geoIndex = new Map();
  let onPick = () => {}, onZoomEdge = () => {}, colorOf = () => '#4d966a';
  let pointer = null, pauseUntil = 0, reduced = false;

  /* ---------- 星野（固定种子） ---------- */
  let seed = 7301; const random = () => ((seed = seed * 16807 % 2147483647) - 1) / 2147483646;
  const STAR_LAYERS = [
    { count: 190, min: .3, max: .9, alpha: .34, depth: .35 },
    { count: 120, min: .55, max: 1.3, alpha: .62, depth: .7 },
    { count: 46, min: 1, max: 1.9, alpha: .95, depth: 1.15 }
  ].map(layer => ({
    ...layer,
    stars: Array.from({ length: layer.count }, () => ({
      x: random(), y: random(), r: layer.min + random() * (layer.max - layer.min),
      a: layer.alpha * (.55 + random() * .45), s: .12 + random() * .9
    }))
  }));
  const NEBULA = Array.from({ length: 3 }, () => ({
    x: .18 + random() * .64, y: .12 + random() * .72, r: .28 + random() * .34,
    dx: (random() - .5) * .5, dy: (random() - .5) * .5
  }));

  const rad = Math.PI / 180, TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  /* 世界面数据在首次绘制时再取（本文件先于 fact.js 加载） */
  /* 跨 ±180 的环线在经度跳变处切开，避免投影后出现 V 形楔子（截图里中国上方那道） */
  function splitSeam(ring) {
    const out = [[]];
    for (let i = 0; i < ring.length; i++) {
      const cur = ring[i], prev = ring[i - 1];
      if (i > 0 && Math.abs(cur[0] - prev[0]) > 180) {
        const west = prev[0] > 0 ? 180 : -180, east = -west;
        const t = (west - prev[0]) / (cur[0] + (cur[0] > 0 ? -360 : 360) - prev[0]);
        const lat = prev[1] + ((cur[1] - prev[1]) * (isFinite(t) ? t : .5));
        out[out.length - 1].push([west, lat]);
        out.push([[east, lat]]);
      }
      out[out.length - 1].push(cur);
    }
    return out.filter(r => r.length >= 3);
  }
  let polygons = null;
  function worldPolygons() {
    if (!polygons) {
      polygons = window.V03Fact.worldGeoJSON(false).features.flatMap(f =>
        (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates)
          .flatMap(rings => splitSeam(rings[0]).map(ring => ({ name: f.properties.name, ring }))));
    }
    return polygons;
  }

  function palette() {
    const css = getComputedStyle(document.documentElement);
    const v = n => css.getPropertyValue(n).trim();
    return {
      space1: v('--globe-space-1') || '#0b1f30', space2: v('--globe-space-2') || '#050f19',
      nebula: v('--globe-nebula') || '#236bad', star: v('--globe-star') || '#e6f4ff',
      sea1: v('--globe-sea-1') || '#7fb4c8', sea2: v('--globe-sea-2') || '#336c8b', sea3: v('--globe-sea-3') || '#102f47',
      atmo: v('--globe-atmo') || '150,214,255', atmA: Number(v('--globe-atmo-a')) || .62,
      line: v('--map-line') || 'rgba(79,108,123,.67)', accent: v('--accent') || '#236bad'
    };
  }
  const hexA = (hex, a) => {
    const h = String(hex).replace('#', '');
    const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const num = parseInt(n, 16);
    return 'rgba(' + ((num >> 16) & 255) + ',' + ((num >> 8) & 255) + ',' + (num & 255) + ',' + a + ')';
  };

  /* ---------- 入场动效 ---------- */
  let introT0 = 0, introOn = false;
  const NODE_SPAN = 1500, LINE_BASE = 1400, LINE_SPAN = 1500, LINE_DUR = 620, LIT_DUR = 460;
  let nodeDelay = [], routeDelay = [], flashes = [];

  function mount(el, opts) {
    canvas = el; ctx = canvas.getContext('2d');
    onPick = (opts && opts.pick) || (() => {});
    onZoomEdge = (opts && opts.zoomEdge) || (() => {});
    reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    canvas.addEventListener('pointerdown', e => { pointer = { x: e.clientX, y: e.clientY, moved: false }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', e => {
      if (!pointer) return;
      const dx = e.clientX - pointer.x, dy = e.clientY - pointer.y;
      pointer.moved ||= Math.abs(dx) + Math.abs(dy) > 3;
      rotation = (rotation - dx * .38 + 360) % 360;
      tilt = clamp(tilt + dy * .003, -.55, .55);
      pointer.x = e.clientX; pointer.y = e.clientY; pauseUntil = performance.now() + 2200;
    });
    canvas.addEventListener('pointerup', e => {
      if (!pointer) return;
      const wasMove = pointer.moved;
      pointer = null;
      if (wasMove) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const hit = hits.find(h => Math.hypot(h.x - x, h.y - y) < 10);
      if (hit) return onPick(hit.kind, hit.id);
      /* 没有点到点：任意区域（含海洋）都进入二维全球视角 */
      onZoomEdge('surface');
    });
    canvas.addEventListener('wheel', e => { e.preventDefault(); zoomBy(e.deltaY < 0 ? 1 : -1); }, { passive: false });
    window.addEventListener('resize', resize);
  }

  function resize() {
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, canvas.clientWidth), height = Math.max(1, canvas.clientHeight);
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function project(lng, lat, cx, cy, R, altitude = 1) {
    const lambda = (lng - rotation) * rad, phi = lat * rad;
    const x = Math.cos(phi) * Math.sin(lambda), y = Math.sin(phi), z = Math.cos(phi) * Math.cos(lambda);
    return {
      x: cx + R * altitude * x, y: cy - R * altitude * (y * Math.cos(tilt) - z * Math.sin(tilt)),
      z: y * Math.sin(tilt) + z * Math.cos(tilt)
    };
  }
  function arc(a, b) {
    const xyz = p => [Math.cos(p.lat * rad) * Math.cos(p.lng * rad), Math.cos(p.lat * rad) * Math.sin(p.lng * rad), Math.sin(p.lat * rad)];
    const u = xyz(a), v = xyz(b), angle = Math.acos(clamp(u.reduce((s, x, i) => s + x * v[i], 0), -1, 1));
    const sine = Math.sin(angle);
    return Array.from({ length: 33 }, (_, i) => {
      const t = i / 32, m = sine > .0001 ? Math.sin((1 - t) * angle) / sine : 1 - t, n = sine > .0001 ? Math.sin(t * angle) / sine : t;
      const p = u.map((x, j) => x * m + v[j] * n);
      return {
        lng: Math.atan2(p[1], p[0]) / rad, lat: Math.atan2(p[2], Math.hypot(p[0], p[1])) / rad,
        altitude: 1 + .16 * Math.sin(Math.PI * t)
      };
    });
  }

  /* ---------- 数据 ----------
     fact：{ points:[{id,lng,lat,color,glyph,halo}], marks:[{id,lng,lat,color,glyph}] }
     relation：{ nodes, relations, colorOf, keep } */
  function update(data) {
    const d = data || {};
    mode = d.mode || mode;
    colorOf = d.colorOf || colorOf;
    if (mode === 'fact') {
      points = (d.points || []).filter(p => Number.isFinite(p.lng) && Number.isFinite(p.lat));
      marks = (d.marks || []).filter(m => Number.isFinite(m.lng) && Number.isFinite(m.lat));
      nodes = []; routes = [];
    } else {
      const objects = d.objects || [], relations = d.relations || [];
      geoIndex = new Map(objects.filter(o => o.geo !== false && Number.isFinite(o.lng) && Number.isFinite(o.lat)).map(o => [o.id, o]));
      const degree = new Map();
      relations.forEach(r => { degree.set(r.from, (degree.get(r.from) || 0) + 1); degree.set(r.to, (degree.get(r.to) || 0) + 1); });
      const ranked = [...geoIndex.values()].sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0));
      const keep = new Set(d.keep || []);
      nodes = ranked.filter(o => keep.has(o.id) || ranked.indexOf(o) < 150).slice(0, 170);
      const limit = d.limit || 44;
      routes = relations.map(r => ({ r, a: geoIndex.get(r.from), b: geoIndex.get(r.to) })).filter(x => x.a && x.b &&
        Math.hypot(x.a.lng - x.b.lng, x.a.lat - x.b.lat) > 10)
        .map(x => ({
          id: x.r.id, points: arc(x.a, x.b), color: colorOf(x.r.type), keep: keep.has(x.r.id),
          score: Math.min(120, Math.hypot(x.a.lng - x.b.lng, x.a.lat - x.b.lat)) + (x.r.confidence || 0) * 24
        }))
        .sort((a, b) => Number(b.keep) - Number(a.keep) || b.score - a.score)
        .slice(0, limit)
        .map((route, i) => ({ ...route, phase: (i * .37) % 1, speed: .17 + (i % 5) * .035, drawFrom: 0 }));
      nodes = nodes.slice().sort((a, b) => Number(keep.has(b.id)) - Number(keep.has(a.id)));
      points = []; marks = [];
    }
    nodeDelay = nodes.map((o, i) => (i / Math.max(1, nodes.length - 1)) * NODE_SPAN);
    routeDelay = routes.map((route, i) => LINE_BASE + (i / Math.max(1, routes.length - 1)) * LINE_SPAN);
    resize();
  }

  function beginIntro() { introOn = true; introT0 = performance.now(); flashes = []; }

  /* 新数据：一次性的柔和光晕（缓慢亮起再淡出，不循环闪烁） */
  function flash(ids, routeIds) {
    const now = performance.now();
    const list = Array.isArray(ids) ? ids : [ids];
    list.forEach((id, i) => {
      const o = geoIndex.get(id);
      if (!o) return;
      if (!nodes.some(n => n.id === id)) { nodes.push(o); nodeDelay.push(0); }
      flashes.push({ lng: o.lng, lat: o.lat, t0: now + i * 160, dur: 2800, color: (window.V03Data.domain && (window.V03Data.domain(o.domain) || {}).c) || '#ffd98a' });
    });
    (routeIds || []).forEach(id => {
      const route = routes.find(x => x.id === id);
      if (route) route.drawFrom = now + 180;
    });
  }
  function replay() { beginIntro(); }

  function draw(now) {
    const w = canvas.clientWidth, h = canvas.clientHeight, cx = w * .5, cy = h * .5;
    const R = Math.min(w, h) * radiusScale, p = palette();
    ctx.clearRect(0, 0, w, h);
    drawSpace(w, h, now, p);
    drawAtmosphere(cx, cy, R, p, 2);

    const sea = ctx.createRadialGradient(cx - R * .34, cy - R * .42, R * .06, cx, cy, R * 1.12);
    sea.addColorStop(0, p.sea1); sea.addColorStop(.55, p.sea2); sea.addColorStop(1, p.sea3);
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fillStyle = sea; ctx.fill();
    ctx.save(); ctx.clip();
    hits = [];
    drawLand(cx, cy, R, p);
    drawGraticule(cx, cy, R, p);
    if (mode === 'relation') {
      drawRoutes(cx, cy, R, now, p);
      drawNodes(cx, cy, R, now, p);
    } else {
      drawFacts(cx, cy, R, now, p);
    }
    drawFlashes(cx, cy, R, now);
    const term = ctx.createLinearGradient(cx + R * .72, cy - R * .72, cx - R * .72, cy + R * .72);
    term.addColorStop(0, 'rgba(0,0,0,0)'); term.addColorStop(.62, hexA(p.space2, .06)); term.addColorStop(1, hexA(p.space2, .34));
    ctx.fillStyle = term; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.restore();

    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU);
    ctx.strokeStyle = 'rgba(' + p.atmo + ',' + (.85 * p.atmA) + ')'; ctx.lineWidth = 1.6;
    ctx.shadowColor = 'rgba(' + p.atmo + ',' + p.atmA + ')'; ctx.shadowBlur = 10; ctx.stroke(); ctx.shadowBlur = 0;
    drawAtmosphere(cx, cy, R, p, 1);
  }

  function drawSpace(w, h, now, p) {
    const sky = ctx.createLinearGradient(0, 0, w * .6, h);
    sky.addColorStop(0, p.space1); sky.addColorStop(1, p.space2);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    NEBULA.forEach((n, i) => {
      const drift = reduced ? 0 : now * .000012;
      const x = ((n.x + drift * n.dx + 1) % 1) * w, y = ((n.y + drift * n.dy + 1) % 1) * h, r = n.r * Math.max(w, h);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, hexA(i === 1 ? p.accent : p.nebula, .07));
      g.addColorStop(1, hexA(p.nebula, 0));
      ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    });
    STAR_LAYERS.forEach(layer => layer.stars.forEach(st => {
      const x = ((st.x + (reduced ? 0 : now * .000004 * layer.depth * st.s) + 1) % 1) * w;
      const twinkle = reduced ? 1 : .62 + .38 * Math.sin(now * .0011 * st.s + st.x * 26);
      ctx.globalAlpha = st.a * twinkle;
      ctx.fillStyle = p.star;
      ctx.beginPath(); ctx.arc(x, st.y * h, st.r * layer.depth, 0, TAU); ctx.fill();
    }));
    ctx.globalAlpha = 1;
  }

  function drawAtmosphere(cx, cy, R, p, ring) {
    const inner = ring === 1 ? R * 1.004 : R, outer = ring === 1 ? R * 1.04 : R * 1.18;
    const g = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
    const a = (ring === 1 ? .55 : .16) * p.atmA;
    const rgb = p.atmo + ',';
    g.addColorStop(0, 'rgba(' + rgb + a + ')');
    g.addColorStop(.5, 'rgba(' + rgb + (a * .3) + ')');
    g.addColorStop(1, 'rgba(' + rgb + '0)');
    ctx.beginPath(); ctx.arc(cx, cy, outer, 0, TAU); ctx.arc(cx, cy, inner, 0, TAU, true);
    ctx.fillStyle = g; ctx.fill('evenodd');
  }

  let fillCache = new Map(), fillTheme = '';
  function landFill(name, p) {
    if (fillTheme !== p.sea2) { fillCache = new Map(); fillTheme = p.sea2; }
    if (!fillCache.has(name)) fillCache.set(name, window.V03Fact.mapRegionColor(name, 'L1'));
    return fillCache.get(name);
  }
  function drawLand(cx, cy, R, p) {
    ctx.lineJoin = 'round';
    for (const feature of worldPolygons()) {
      let run = [];
      const flush = () => {
        if (run.length < 3) { run = []; return; }
        ctx.beginPath(); run.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)); ctx.closePath();
        ctx.fillStyle = landFill(feature.name, p);
        ctx.globalAlpha = .95; ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = p.line; ctx.lineWidth = .6; ctx.stroke();
        run = [];
      };
      for (const [lng, lat] of feature.ring) { const pt = project(lng, lat, cx, cy, R); if (pt.z > 0) run.push(pt); else flush(); }
      flush();
    }
  }

  function drawGraticule(cx, cy, R, p) {
    ctx.strokeStyle = hexA('#ffffff', .1); ctx.lineWidth = .6;
    for (let lat = -60; lat <= 60; lat += 30) {
      ctx.beginPath(); let started = false;
      for (let lng = -180; lng <= 180; lng += 4) {
        const pt = project(lng, lat, cx, cy, R);
        if (pt.z <= 0) { started = false; continue; }
        if (!started) { ctx.moveTo(pt.x, pt.y); started = true; } else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
    }
    for (let lng = -180; lng < 180; lng += 30) {
      ctx.beginPath(); let started = false;
      for (let lat = -88; lat <= 88; lat += 4) {
        const pt = project(lng, lat, cx, cy, R);
        if (pt.z <= 0) { started = false; continue; }
        if (!started) { ctx.moveTo(pt.x, pt.y); started = true; } else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
    }
  }

  /* 关系线：入场逐条画出，之后持续有彗尾粒子 */
  function drawRoutes(cx, cy, R, now, p) {
    routes.forEach((route, i) => {
      const delay = routeDelay[i] || 0;
      const from = Math.max(introOn ? introT0 + delay : 0, route.drawFrom);
      const drawn = clamp((now - from) / LINE_DUR, 0, 1);
      if (drawn <= 0) return;
      const pts = route.points.map(pt => {
        const proj = project(pt.lng, pt.lat, cx, cy, R, pt.altitude);
        return { x: proj.x, y: proj.y, z: proj.z };
      });
      const total = pts.length;
      const upto = Math.max(2, Math.round(ease(drawn) * (total - 1)));
      ctx.beginPath();
      for (let j = 0; j <= upto; j++) {
        const pt = pts[j];
        if (pt.z <= 0) continue;
        if (j === 0 || pts[j - 1].z <= 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
      }
      ctx.strokeStyle = hexA(route.color, .52); ctx.lineWidth = 1.35; ctx.stroke();
      if (drawn < 1) {
        const head = pts[upto];
        if (head && head.z > 0) {
          ctx.beginPath(); ctx.arc(head.x, head.y, 3.4, 0, TAU);
          ctx.fillStyle = hexA(route.color, .95); ctx.shadowColor = route.color; ctx.shadowBlur = 16; ctx.fill(); ctx.shadowBlur = 0;
        }
        return;
      }
      const phase = ((now - from) * .001 * route.speed + route.phase) % 1;
      const head = 1 + phase * (total - 3);
      const tail = 9;
      for (let k = 0; k < tail; k++) {
        const idx = head - k;
        const j0 = Math.floor(idx), j1 = Math.min(total - 1, j0 + 1), t = idx - j0;
        if (j0 < 0 || pts[j0].z <= 0 || pts[j1].z <= 0) continue;
        const x = pts[j0].x + (pts[j1].x - pts[j0].x) * t, y = pts[j0].y + (pts[j1].y - pts[j0].y) * t;
        const fade = 1 - k / tail;
        ctx.beginPath(); ctx.arc(x, y, 1.3 + fade * 2.4, 0, TAU);
        ctx.fillStyle = k === 0 ? '#ffffff' : hexA(route.color, .16 + fade * .74);
        ctx.fill();
      }
    });
  }

  function drawNodes(cx, cy, R, now, p) {
    nodes.forEach((o, i) => {
      const delay = nodeDelay[i] || 0;
      const lit = clamp((now - (introT0 + delay)) / LIT_DUR, 0, 1);
      if (introOn && lit <= 0) return;
      const pt = project(o.lng, o.lat, cx, cy, R); if (pt.z <= 0) return;
      const pop = introOn ? ease(lit) : 1;
      const halo = 3.6 + pop * 4.2;
      const haloG = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, halo * 2.6);
      haloG.addColorStop(0, hexA(p.accent, .26 * pop));
      haloG.addColorStop(1, hexA(p.accent, 0));
      ctx.beginPath(); ctx.arc(pt.x, pt.y, halo * 2.6, 0, TAU); ctx.fillStyle = haloG; ctx.fill();
      if (introOn && lit < 1) {
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 3 + ease(lit) * 7, 0, TAU);
        ctx.fillStyle = hexA('#ffffff', .3 * (1 - lit)); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 2 + pop * 1.6, 0, TAU);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.strokeStyle = p.accent; ctx.lineWidth = 1.3; ctx.stroke();
      hits.push({ x: pt.x, y: pt.y, kind: 'object', id: o.id });
    });
  }

  /* 事实层：影响圆 + 事实点（与关联层本体同一套观感）+ 叠加图层标记（五种，带 emoji） */
  function drawFacts(cx, cy, R, now, p) {
    points.forEach(f => {
      const pt = project(f.lng, f.lat, cx, cy, R);
      if (pt.z <= 0) return;
      if (f.halo > 0) {
        const rr = R * f.halo;
        const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, rr);
        g.addColorStop(0, hexA(f.color, f.haloAlpha || .14));
        g.addColorStop(1, hexA(f.color, 0));
        ctx.beginPath(); ctx.arc(pt.x, pt.y, rr, 0, TAU); ctx.fillStyle = g; ctx.fill();
      }
      const halo = f.big ? 8 : 6;
      const haloG = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, halo * 2.4);
      haloG.addColorStop(0, hexA(f.color, f.big ? .3 : .22));
      haloG.addColorStop(1, hexA(f.color, 0));
      ctx.beginPath(); ctx.arc(pt.x, pt.y, halo * 2.4, 0, TAU); ctx.fillStyle = haloG; ctx.fill();
      ctx.beginPath(); ctx.arc(pt.x, pt.y, f.big ? 3 : 2.4, 0, TAU);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.strokeStyle = f.color; ctx.lineWidth = 1.2; ctx.stroke();
      hits.push({ x: pt.x, y: pt.y, kind: 'fact', id: f.id });
    });
    marks.forEach(m => {
      const pt = project(m.lng, m.lat, cx, cy, R);
      if (pt.z <= 0) return;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 6.5, 0, TAU);
      ctx.fillStyle = hexA('#ffffff', .82); ctx.fill();
      ctx.strokeStyle = m.color; ctx.lineWidth = 1.2; ctx.stroke();
      if (m.glyph) {
        ctx.font = '9px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        ctx.textAlign = 'center'; ctx.fillText(m.glyph, pt.x, pt.y + 3.2);
      }
      hits.push({ x: pt.x, y: pt.y, kind: 'mark', id: m.id });
    });
  }

  function drawFlashes(cx, cy, R, now) {
    flashes = flashes.filter(f => now - f.t0 < f.dur);
    flashes.forEach(f => {
      const t = clamp((now - f.t0) / f.dur, 0, 1);
      if (t <= 0) return;
      const pt = project(f.lng, f.lat, cx, cy, R); if (pt.z <= 0) return;
      const a = t < .34 ? ease(t / .34) : Math.max(0, 1 - (t - .34) / .66);
      const rr = 9 + 22 * ease(Math.min(1, t / .34));
      const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, rr);
      g.addColorStop(0, hexA(f.color || '#ffd98a', .5 * a));
      g.addColorStop(.55, hexA(f.color || '#ffd98a', .22 * a));
      g.addColorStop(1, hexA(f.color || '#ffd98a', 0));
      ctx.beginPath(); ctx.arc(pt.x, pt.y, rr, 0, TAU); ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 2.2 + 1.6 * a, 0, TAU);
      ctx.fillStyle = hexA('#ffffff', .85 * a); ctx.fill();
    });
  }

  function loop(now) {
    if (!visible) { raf = 0; return; }
    raf = requestAnimationFrame(loop);
    if (now - last < 33) return;
    last = now;
    if (!pointer && now > pauseUntil) rotation = (rotation + .11) % 360;
    resize(); draw(now);
  }

  function setVisible(next) {
    const was = visible;
    visible = next;
    if (!was) canvas.classList.remove('view-fade');
    if (!next) { if (raf) cancelAnimationFrame(raf); raf = 0; return; }
    resize();
    if (!was) { beginIntro(); radiusScale = .38; canvas.classList.add('view-fade'); void canvas.offsetWidth; }   /* 每次回到三维都从舒适半径开始，留出放大余量 */
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function zoomBy(dir) { return zoomByFactor(dir > 0 ? 1.06 : .943); }
  function zoomByFactor(factor) {
    if (!Number.isFinite(factor) || factor <= 0) return '';
    const before = radiusScale;
    radiusScale = clamp(radiusScale * factor, .27, .47);
    pauseUntil = performance.now() + 1800;
    if (factor > 1 && before >= .4699) { onZoomEdge('in'); return 'in'; }
    if (factor < 1 && before <= .2701) return 'out';
    return '';
  }
  const zoomState = () => ({ canIn: radiusScale < .4699, canOut: radiusScale > .2701, zoom: radiusScale / .38 });
  const debug = () => ({
    visible, raf, rotation, radiusScale, mode,
    nodes: nodes.length, routes: routes.length, points: points.length, marks: marks.length,
    hits: hits.length, flashes: flashes.length, intro: introOn ? Math.round(performance.now() - introT0) : -1
  });
  return { mount, update, setVisible, zoomBy, zoomByFactor, zoomState, flash, replay, debug };
  }
  return { create };
})();
