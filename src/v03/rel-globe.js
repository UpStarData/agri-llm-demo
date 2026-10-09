/* ============================================================
   关联层三维地球（正交投影，离线自绘）
   - 深空底 + 三层星野（视差 + 闪烁）+ 大气层光圈 + 明暗交界
   - 陆块沿用二维地图的区域配色，保证 2D / 3D 同源
   - 关系线：入场时按顺序点亮本体、再逐条把线画出来；画完后持续流动（彗尾粒子）
   - 新本体接入：星芒闪 + 扩散环，随后新线从头画到尾并加入持续流动
   - 滚轮放到最大对外抛 onZoomEdge('in')，由关联层切到二维地图
   ============================================================ */
window.V03RelGlobe = (function () {
  let canvas, ctx, visible = false, raf = 0, last = 0, rotation = 105, tilt = .22, radiusScale = .38;
  let nodes = [], routes = [], hits = [], geoIndex = new Map();
  let onSelect = () => {}, onZoomEdge = () => {}, colorOf = () => '#4d966a';
  let pointer = null, pauseUntil = 0, reduced = false;

  /* ---------- 星野（固定种子，保证每次进入一致） ---------- */
  let seed = 7301; const random = () => ((seed = seed * 16807 % 2147483647) - 1) / 2147483646;
  const STAR_LAYERS = [
    { count: 190, min: .3, max: .9, alpha: .34, depth: .35 },   /* 远景：暗、慢 */
    { count: 120, min: .55, max: 1.3, alpha: .62, depth: .7 },  /* 中景 */
    { count: 46, min: 1, max: 1.9, alpha: .95, depth: 1.15 }    /* 近景：亮、快 */
  ].map(layer => ({
    ...layer,
    stars: Array.from({ length: layer.count }, () => ({
      x: random(), y: random(), r: layer.min + random() * (layer.max - layer.min),
      a: layer.alpha * (.55 + random() * .45), s: .12 + random() * .9
    }))
  }));
  const NEBULA = Array.from({ length: 3 }, (_, i) => ({
    x: .18 + random() * .64, y: .12 + random() * .72, r: .28 + random() * .34,
    dx: (random() - .5) * .5, dy: (random() - .5) * .5
  }));

  const rad = Math.PI / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  const polygons = window.V03Fact.worldGeoJSON(false).features.flatMap(f =>
    (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates)
      .map(rings => ({ name: f.properties.name, ring: rings[0] })));

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

  /* ---------- 入场动效状态 ---------- */
  let introT0 = 0, introOn = false;
  const NODE_SPAN = 1500, LINE_BASE = 1400, LINE_SPAN = 1500, LINE_DUR = 620, LIT_DUR = 460;
  let nodeDelay = [], routeDelay = [];
  let flashes = [];

  function mount(el, opts) {
    canvas = el; ctx = canvas.getContext('2d');
    onSelect = (opts && opts.select) || (() => {});
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
      if (!pointer.moved) {
        const rect = canvas.getBoundingClientRect();
        const hit = hits.find(h => Math.hypot(h.x - (e.clientX - rect.left), h.y - (e.clientY - rect.top)) < 10);
        if (hit) onSelect(hit.id);
      }
      pointer = null;
    });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1 : -1);
    }, { passive: false });
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

  /* ---------- 投影 ---------- */
  function project(lng, lat, cx, cy, R, altitude = 1) {
    const lambda = (lng - rotation) * rad, phi = lat * rad;
    const x = Math.cos(phi) * Math.sin(lambda), y = Math.sin(phi), z = Math.cos(phi) * Math.cos(lambda);
    return {
      x: cx + R * altitude * x, y: cy - R * altitude * (y * Math.cos(tilt) - z * Math.sin(tilt)),
      z: y * Math.sin(tilt) + z * Math.cos(tilt)
    };
  }
  /* 大圆航线：返回带高度的采样点 */
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

  function update(objects, relations, opts) {
    const options = opts || {};
    colorOf = options.colorOf || colorOf;
    geoIndex = new Map(objects.filter(o => o.geo !== false && Number.isFinite(o.lng) && Number.isFinite(o.lat)).map(o => [o.id, o]));
    const degree = new Map();
    relations.forEach(r => { degree.set(r.from, (degree.get(r.from) || 0) + 1); degree.set(r.to, (degree.get(r.to) || 0) + 1); });
    const ranked = [...geoIndex.values()].sort((a, b) => (degree.get(b.id) || 0) - (degree.get(a.id) || 0));
    const keep = new Set(options.keep || []);
    nodes = ranked.filter(o => keep.has(o.id) || ranked.indexOf(o) < 150).slice(0, 170);
    const limit = options.limit || 44;
    routes = relations.map(r => ({ r, a: geoIndex.get(r.from), b: geoIndex.get(r.to) })).filter(x => x.a && x.b &&
      Math.hypot(x.a.lng - x.b.lng, x.a.lat - x.b.lat) > 10)
      .map(x => ({
        id: x.r.id, points: arc(x.a, x.b), color: colorOf(x.r.type), keep: keep.has(x.r.id),
        score: Math.min(120, Math.hypot(x.a.lng - x.b.lng, x.a.lat - x.b.lat)) + (x.r.confidence || 0) * 24
      }))
      .sort((a, b) => Number(b.keep) - Number(a.keep) || b.score - a.score)
      .slice(0, limit)
      .map((route, i) => ({ ...route, phase: (i * .37) % 1, speed: .17 + (i % 5) * .035, drawFrom: 0 }));
    /* 用户正在看的对象先点亮，其余按连接数依次点亮 */
    nodes = nodes.slice().sort((a, b) => Number(keep.has(b.id)) - Number(keep.has(a.id)));
    nodeDelay = nodes.map((o, i) => (i / Math.max(1, nodes.length - 1)) * NODE_SPAN);
    routeDelay = routes.map((route, i) => LINE_BASE + (i / Math.max(1, routes.length - 1)) * LINE_SPAN);
    resize();
  }

  function beginIntro() {
    introOn = true; introT0 = performance.now(); flashes = [];
  }
  const revealed = now => !introOn || now - introT0 > LINE_BASE + LINE_SPAN + LINE_DUR;

  /* ---------- 新本体接入：星芒闪 + 扩散环；它的线从头画一遍 ---------- */
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
    drawAtmosphere(cx, cy, R, p, 1);

    /* --- 地球本体 --- */
    const sea = ctx.createRadialGradient(cx - R * .34, cy - R * .42, R * .06, cx, cy, R * 1.12);
    sea.addColorStop(0, p.sea1); sea.addColorStop(.55, p.sea2); sea.addColorStop(1, p.sea3);
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = sea; ctx.fill();
    ctx.save(); ctx.clip();
    drawLand(cx, cy, R, p);
    drawGraticule(cx, cy, R, now, p);
    drawRoutes(cx, cy, R, now, p);
    drawGates(cx, cy, R);
    drawNodes(cx, cy, R, now, p);
    drawFlashes(cx, cy, R, now);
    /* 明暗交界：光源在左上，右下压暗，球体不再是一张平贴的图 */
    const term = ctx.createLinearGradient(cx + R * .72, cy - R * .72, cx - R * .72, cy + R * .72);
    term.addColorStop(0, 'rgba(0,0,0,0)'); term.addColorStop(.62, hexA(p.space2, .06)); term.addColorStop(1, hexA(p.space2, .34));
    ctx.fillStyle = term; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
    ctx.restore();

    /* 边缘光 + 大气内环 */
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(' + p.atmo + ',' + (.85 * p.atmA) + ')'; ctx.lineWidth = 1.6;
    ctx.shadowColor = 'rgba(' + p.atmo + ',' + p.atmA + ')'; ctx.shadowBlur = 10; ctx.stroke(); ctx.shadowBlur = 0;
    drawAtmosphere(cx, cy, R, p, 2);
  }

  function drawSpace(w, h, now, p) {
    const sky = ctx.createLinearGradient(0, 0, w * .6, h);
    sky.addColorStop(0, p.space1); sky.addColorStop(1, p.space2);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
    /* 星云：两团随旋转缓慢漂移的冷色雾 */
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
      ctx.beginPath(); ctx.arc(x, st.y * h, st.r * layer.depth, 0, Math.PI * 2); ctx.fill();
    }));
    ctx.globalAlpha = 1;
  }

  /* 大气层：内圈勾勒球体，外圈把地球「包住」 */
  function drawAtmosphere(cx, cy, R, p, ring) {
    /* 参考苹果地图 / Mapbox：内圈是一道很窄的亮边，外圈只是很淡的一层雾 */
    const inner = ring === 1 ? R * 1.004 : R, outer = ring === 1 ? R * 1.04 : R * 1.18;
    const g = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
    const a = (ring === 1 ? .55 : .16) * p.atmA;
    const rgb = p.atmo + ',';
    g.addColorStop(0, 'rgba(' + rgb + (a) + ')');
    g.addColorStop(.5, 'rgba(' + rgb + (a * .3) + ')');
    g.addColorStop(1, 'rgba(' + rgb + '0)');
    ctx.beginPath(); ctx.arc(cx, cy, outer, 0, Math.PI * 2); ctx.arc(cx, cy, inner, 0, Math.PI * 2, true);
    ctx.fillStyle = g; ctx.fill('evenodd');
  }

  let fillCache = new Map(), fillTheme = '';
  function landFill(name, p) {
    if (fillTheme !== p.sea2) { fillCache = new Map(); fillTheme = p.sea2; }
    if (!fillCache.has(name)) fillCache.set(name, window.V03Fact.mapRegionColor(name));
    return fillCache.get(name);
  }
  function drawLand(cx, cy, R, p) {
    ctx.lineJoin = 'round';
    for (const feature of polygons) {
      let run = [];
      const flush = () => {
        if (run.length < 3) { run = []; return; }
        ctx.beginPath(); run.forEach((pt, i) => i ? ctx.lineTo(pt.x, pt.y) : ctx.moveTo(pt.x, pt.y)); ctx.closePath();
        ctx.fillStyle = landFill(feature.name, p);
        ctx.globalAlpha = .95; ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(9,26,38,.5)'; ctx.lineWidth = .6; ctx.stroke();
        /* 海岸线高光：只画朝光的一侧，陆地与海面之间有一道亮边 */
        ctx.strokeStyle = hexA('#ffffff', .22); ctx.lineWidth = .5; ctx.stroke();
        run = [];
      };
      for (const [lng, lat] of feature.ring) { const pt = project(lng, lat, cx, cy, R); if (pt.z > 0) run.push(pt); else flush(); }
      flush();
    }
  }

  function drawGraticule(cx, cy, R, now, p) {
    ctx.strokeStyle = hexA('#ffffff', .10); ctx.lineWidth = .6;
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

  /* 关系线：入场时逐条画出来，画完后持续有彗尾粒子在跑 */
  function drawRoutes(cx, cy, R, now, p) {
    routes.forEach((route, i) => {
      const delay = routeDelay[i] || 0;
      const from = Math.max(introOn ? introT0 + delay : 0, route.drawFrom);
      const drawn = clamp((now - from) / LINE_DUR, 0, 1);
      if (drawn <= 0) return;
      const pts = route.points.map(pt => {
        const proj = project(pt.lng, pt.lat, cx, cy, R, pt.altitude);
        return { x: cx + (proj.x - cx) * (1 + (pt.altitude - 1)), y: cy + (proj.y - cy) * (1 + (pt.altitude - 1)), z: proj.z };
      });
      const total = pts.length;
      const upto = Math.max(2, Math.round(ease(drawn) * (total - 1)));
      /* 底线 */
      ctx.beginPath();
      for (let j = 0; j <= upto; j++) {
        const pt = pts[j];
        if (pt.z <= 0) continue;
        if (j === 0 || pts[j - 1].z <= 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
      }
      ctx.strokeStyle = hexA(route.color, .52); ctx.lineWidth = 1.35; ctx.stroke();
      if (drawn < 1) {
        /* 正在连线：头部亮点，像从本体出发把一个一个本体接上 */
        const head = pts[upto];
        if (head && head.z > 0) {
          ctx.beginPath(); ctx.arc(head.x, head.y, 3.4, 0, Math.PI * 2);
          ctx.fillStyle = hexA(route.color, .95); ctx.shadowColor = route.color; ctx.shadowBlur = 16; ctx.fill(); ctx.shadowBlur = 0;
        }
        return;
      }
      /* 持续流动：彗尾粒子 */
      const phase = ((now - from) * .001 * route.speed + route.phase) % 1;
      const head = 1 + phase * (total - 3);
      const tail = 9;
      for (let k = 0; k < tail; k++) {
        const idx = head - k;
        const j0 = Math.floor(idx), j1 = Math.min(total - 1, j0 + 1), t = idx - j0;
        if (j0 < 0 || pts[j0].z <= 0 || pts[j1].z <= 0) continue;
        const x = pts[j0].x + (pts[j1].x - pts[j0].x) * t, y = pts[j0].y + (pts[j1].y - pts[j0].y) * t;
        const fade = 1 - k / tail;
        ctx.beginPath(); ctx.arc(x, y, 1.3 + fade * 2.4, 0, Math.PI * 2);
        ctx.fillStyle = k === 0 ? '#ffffff' : hexA(route.color, .16 + fade * .74);
        ctx.fill();
      }
      const hx = pts[Math.floor(head)];
      if (hx && hx.z > 0) {
        ctx.beginPath();
        for (let k = Math.max(0, Math.floor(head) - 6); k <= Math.floor(head); k++) {
          const pt = pts[k]; if (pt.z <= 0) continue;
          if (k === Math.max(0, Math.floor(head) - 6)) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
        }
        ctx.strokeStyle = hexA(route.color, .8); ctx.lineWidth = 3; ctx.shadowColor = route.color; ctx.shadowBlur = 12; ctx.stroke(); ctx.shadowBlur = 0;
      }
    });
  }

  function drawGates(cx, cy, R) {
    if (!window.V03Store.state.sk.gates) return;
    window.V03Data.GATES.filter(g => g.kind === 'port').forEach(g => {
      const pt = project(g.lng, g.lat, cx, cy, R); if (pt.z <= 0) return;
      ctx.font = '12px sans-serif'; ctx.fillStyle = '#e1a653'; ctx.fillText('⚓', pt.x - 6, pt.y + 4);
    });
  }

  function drawNodes(cx, cy, R, now, p) {
    hits = [];
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
      ctx.beginPath(); ctx.arc(pt.x, pt.y, halo * 2.6, 0, Math.PI * 2); ctx.fillStyle = haloG; ctx.fill();
      if (introOn && lit < 1) {
        /* 刚点亮：柔和的光斑渐显，不做扩散环 */
        ctx.beginPath(); ctx.arc(pt.x, pt.y, 3 + ease(lit) * 7, 0, Math.PI * 2);
        ctx.fillStyle = hexA('#ffffff', .3 * (1 - lit)); ctx.fill();
      }
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 2 + pop * 1.6, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.strokeStyle = p.accent; ctx.lineWidth = 1.3; ctx.stroke();
      hits.push({ x: pt.x, y: pt.y, id: o.id });
    });
  }

  /* 新本体：一次性的柔和光晕，缓慢亮起再淡出（不做循环闪烁，也不画扩散环） */
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
      ctx.beginPath(); ctx.arc(pt.x, pt.y, rr, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
      ctx.beginPath(); ctx.arc(pt.x, pt.y, 2.2 + 1.6 * a, 0, Math.PI * 2);
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
    if (!next) { if (raf) cancelAnimationFrame(raf); raf = 0; return; }
    resize();
    if (!was) beginIntro();
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function zoomBy(dir) { return zoomByFactor(dir > 0 ? 1.12 : .89); }
  /* 按倍率缩放（触控板双指 / 按钮共用）；放到最大再放大就切二维地图 */
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
  const debug = () => ({ visible, raf, rotation, radiusScale, nodes: nodes.length, routes: routes.length, hits: hits.length, flashes: flashes.length, intro: introOn ? Math.round(performance.now() - introT0) : -1 });
  return { mount, update, setVisible, zoomBy, zoomByFactor, zoomState, flash, replay, debug };
})();
