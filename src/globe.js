/* ============================================================
   L1 · 自动旋转地球 + 按量级依次生长的贸易弧（canvas 2D 正射投影）
   无任何 3D 依赖：离线可用、无 WebGL 也能跑。
   ============================================================ */
window.AGRI_GLOBE = (function () {
  const D2R = Math.PI / 180;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

  let cv, ctx, W = 0, H = 0, R = 0, cx = 0, cy = 0, dpr = 1;
  let rings = [];                 // [[ [lon,lat]... ], ...]
  let arcs = [], nodes = [];
  let rot = -100, tilt = 16, spin = 0.055;   // rot: 中央经度（度/帧步）
  let raf = null, running = false, last = 0;
  let phase = 'idle', phaseT = 0;
  let sel = null, hover = null, focusLon = null, focusTween = null;
  let hit = { nodes: [], arcs: [] };         // 每帧重建的屏幕命中表
  let onSelect = () => {}, onHover = () => {};
  let dragging = false, dragMoved = 0, pauseSpin = 0;

  /* ---------- 投影 ---------- */
  function proj(lon, lat, lift) {
    const l = (lon - rot) * D2R, p = lat * D2R, st = Math.sin(tilt * D2R), ct = Math.cos(tilt * D2R);
    const cp = Math.cos(p), sp = Math.sin(p), cl = Math.cos(l), sl = Math.sin(l);
    const k = lift || 1;
    const x = cp * sl * k;
    const y = (ct * sp - st * cp * cl) * k;
    const z = st * sp + ct * cp * cl;
    return { x: cx + R * x, y: cy - R * y, z, nx: x / k, ny: y / k };
  }

  /* ---------- 大圆插值（弧线） ---------- */
  function arcPoints(a, b, n) {
    const v = (lon, lat) => {
      const l = lon * D2R, p = lat * D2R;
      return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
    };
    const cross = (u, w) => [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const dot = (u, w) => u[0] * w[0] + u[1] * w[1] + u[2] * w[2];
    const norm = u => { const m = Math.hypot(u[0], u[1], u[2]) || 1; return [u[0] / m, u[1] / m, u[2] / m]; };
    const A = v(a.lng, a.lat), B = v(b.lng, b.lat);
    let axis = cross(A, B); const s = Math.hypot(axis[0], axis[1], axis[2]);
    const angle = Math.atan2(s, dot(A, B));
    const out = [];
    if (s < 1e-6) return [{ lon: a.lng, lat: a.lat, k: 0 }];
    axis = norm(axis);
    for (let i = 0; i <= n; i++) {
      const t = i / n, ang = angle * t;
      const c = Math.cos(ang), sn = Math.sin(ang);
      // Rodrigues: rotate A toward B around axis
      const ca = cross(axis, A);
      const da = dot(axis, A);
      const p = [A[0] * c + ca[0] * sn + axis[0] * da * (1 - c),
                 A[1] * c + ca[1] * sn + axis[1] * da * (1 - c),
                 A[2] * c + ca[2] * sn + axis[2] * da * (1 - c)];
      const lift = 1 + 0.075 * Math.sin(Math.PI * t);   // 弧顶抬升
      out.push({
        lon: Math.atan2(p[1], p[0]) / D2R,
        lat: Math.atan2(p[2], Math.hypot(p[0], p[1])) / D2R,
        lift, k: t
      });
    }
    return out;
  }

  /* ---------- 初始化 ---------- */
  function mount(canvas, world, flows, china, cb) {
    cv = canvas; ctx = cv.getContext('2d');
    DATA.flows = flows; DATA.CHINA = china;
    onSelect = (cb && cb.select) || (() => {});
    onHover = (cb && cb.hover) || (() => {});
    rings = [];
    world.forEach(f => f.c.forEach(poly => poly.forEach(r => rings.push(r))));
    nodes = flows.map(f => ({ id: f.id, flow: f, lon: f.lng, lat: f.lat }));
    nodes.push({ id: 'CN', flow: china, lon: china.lng, lat: china.lat, china: true });
    arcs = flows.map(f => ({
      id: f.id, flow: f, pts: arcPoints(f, china, 90), grow: 0, delay: 0, dur: 1100, alive: false, phase: 0
    }));
    resize();
    window.addEventListener('resize', resize);
    bind();
    return api;
  }

  function resize() {
    const box = cv.parentElement.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(320, box.width); H = Math.max(320, box.height);
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    R = Math.min(W, H) * 0.355; cx = W / 2; cy = H / 2;
  }

  /* ---------- 动画控制 ---------- */
  function start() { if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = null; }

  function playIntro() {
    // 节点先出现 → 弧线按贸易量从大到小依次缓慢长出
    phase = 'intro'; phaseT = 0;
    const order = arcs.slice().sort((a, b) => b.flow.vol - a.flow.vol);
    order.forEach((a, i) => { a.alive = true; a.delay = 620 + i * 330; a.dur = 900 + Math.min(480, a.flow.vol * 3); a.grow = 0; a.phase = i; });
    state.grownOrder = []; state.grownCount = 0;
  }

  function frame(now) {
    const dt = Math.min(48, now - last); last = now; phaseT += dt;
    if (pauseSpin > 0) pauseSpin -= dt;
    if (focusTween && !dragging) {
      const t = Math.min(1, (now - focusTween.t0) / focusTween.dur);
      const e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      rot = focusTween.from + focusTween.delta * e;
      if (t >= 1) { rot = focusTween.from + focusTween.delta; focusTween = null; }
    } else if (!dragging && pauseSpin <= 0 && !sel) {
      rot += spin * dt;
    }
    if (rot > 180) rot -= 360; if (rot < -180) rot += 360;
    // 弧线生长
    if (phase === 'intro' || phase === 'flow') {
      let done = true;
      arcs.forEach(a => {
        if (!a.alive) return;
        if (phaseT > a.delay) {
          a.grow = Math.min(1, (phaseT - a.delay) / a.dur);
          if (a.grow >= 1 && !a.done) {
            a.done = true; state.grownOrder.push(a.flow.country); state.grownCount = state.grownOrder.length;
            if (state.grownOrder.length === arcs.length) phase = 'flow';
          }
        }
        if (a.grow < 1) done = false;
      });
      if (done) phase = 'flow';
    }
    draw(now);
    if (running) raf = requestAnimationFrame(frame);
  }

  /* ---------- 绘制 ---------- */
  function draw(now) {
    ctx.clearRect(0, 0, W, H);
    // 海洋
    const og = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.42, R * 0.15, cx, cy, R * 1.04);
    og.addColorStop(0, '#f7faff'); og.addColorStop(0.65, '#e8f0fb'); og.addColorStop(1, '#cfe0f6');
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = og; ctx.fill();
    // 大气光环
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.055, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(90,130,205,.20)'; ctx.lineWidth = Math.max(1, R * 0.03); ctx.stroke();

    // 经纬网
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    ctx.strokeStyle = 'rgba(70,105,170,.10)'; ctx.lineWidth = 1;
    for (let lat = -60; lat <= 60; lat += 30) {
      ctx.beginPath();
      let started = false;
      for (let lon = -180; lon <= 180; lon += 4) {
        const p = proj(lon, lat); if (p.z <= 0) { started = false; continue; }
        started ? ctx.lineTo(p.x, p.y) : (ctx.moveTo(p.x, p.y), started = true);
      }
      ctx.stroke();
    }
    for (let lon = -180; lon < 180; lon += 30) {
      ctx.beginPath(); let started = false;
      for (let lat = -88; lat <= 88; lat += 4) {
        const p = proj(lon, lat); if (p.z <= 0) { started = false; continue; }
        started ? ctx.lineTo(p.x, p.y) : (ctx.moveTo(p.x, p.y), started = true);
      }
      ctx.stroke();
    }

    // 陆地
    ctx.fillStyle = '#dde7f6'; ctx.strokeStyle = 'rgba(110,140,190,.55)'; ctx.lineWidth = 0.8;
    for (const ring of rings) {
      // 背面剔除：先看环的采样点是否都不可见
      let anyFront = false, minZ = 1;
      const n = ring.length;
      const step = n > 120 ? 4 : 1;
      for (let i = 0; i < n; i += step) {
        const p = proj(ring[i][0], ring[i][1]);
        if (p.z > 0.02) anyFront = true;
        if (p.z < minZ) minZ = p.z;
      }
      if (!anyFront) continue;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < n; i++) {
        let p = proj(ring[i][0], ring[i][1]);
        if (p.z < 0.03) { // 贴到球缘，避免背面点拉出直线
          const m = Math.hypot(p.nx, p.ny) || 1;
          p = { x: cx + R * (p.nx / m), y: cy - R * (p.ny / m), z: 0.03 };
        }
        started ? ctx.lineTo(p.x, p.y) : (ctx.moveTo(p.x, p.y), started = true);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // 球体明暗（贴边变暗，增强立体感）
    const sh = ctx.createRadialGradient(cx - R * 0.4, cy - R * 0.45, R * 0.1, cx + R * 0.35, cy + R * 0.4, R * 1.5);
    sh.addColorStop(0, 'rgba(255,255,255,.55)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(30,55,110,.16)');
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = sh; ctx.fill();
    ctx.restore();

    // 弧线 + 流光
    hit.arcs = [];
    const t = now / 1000;
    arcs.forEach(a => {
      if (!a.alive) return;
      const N = a.pts.length, drawn = Math.max(1, Math.floor(N * easeOutCubic(a.grow)));
      const col = DATA.CAT[a.flow.cat] || '#2563eb';
      const dim = sel && sel !== a.id && sel !== 'CN';
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = col; ctx.globalAlpha = dim ? 0.22 : (sel === a.id ? 0.95 : 0.7);
      ctx.lineWidth = sel === a.id ? 3 : (hover === a.id ? 2.6 : 1.8);
      if (a.flow.vol >= 90) ctx.lineWidth += 0.8;      // 线宽编码量级
      ctx.beginPath(); let started = false;
      for (let i = 0; i < drawn; i++) {
        const s0 = a.pts[i];
        const p = proj(s0.lon, s0.lat, s0.lift);
        if (p.z <= 0) { started = false; continue; }
        started ? ctx.lineTo(p.x, p.y) : (ctx.moveTo(p.x, p.y), started = true);
      }
      ctx.stroke();
      // 生长中的箭头 / 尖端
      const tipP = a.pts[Math.min(drawn, N - 1)];
      if (tipP) {
        const tp = proj(tipP.lon, tipP.lat, tipP.lift);
        if (tp.z > 0) {
          const prev = a.pts[Math.max(0, drawn - 6)];
          const pp = proj(prev.lon, prev.lat, prev.lift);
          const ang = Math.atan2(tp.y - pp.y, tp.x - pp.x);
          const s = (sel === a.id ? 7 : 5.4);
          ctx.globalAlpha = dim ? 0.25 : 0.95; ctx.fillStyle = col;
          ctx.beginPath();
          ctx.moveTo(tp.x, tp.y);
          ctx.lineTo(tp.x - s * Math.cos(ang - 0.42), tp.y - s * Math.sin(ang - 0.42));
          ctx.lineTo(tp.x - s * Math.cos(ang + 0.42), tp.y - s * Math.sin(ang + 0.42));
          ctx.closePath(); ctx.fill();
          if (a.grow < 1) { ctx.beginPath(); ctx.arc(tp.x, tp.y, 3.4, 0, Math.PI * 2); ctx.fill(); }
        }
      }
      // 流光点（长成后持续流动）
      if (a.grow >= 1 && !dim) {
        for (let k = 0; k < 2; k++) {
          const t2 = ((t * (0.10 + a.flow.vol / 2200)) + k * 0.5) % 1;
          const idx = Math.floor(t2 * (N - 1));
          const s1 = a.pts[idx], lp = proj(s1.lon, s1.lat, s1.lift);
          if (lp.z <= 0) continue;
          ctx.globalAlpha = 0.9; ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(lp.x, lp.y, sel === a.id ? 3.2 : 2.5, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(lp.x, lp.y, 5.4, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
          hit.arcs.push({ id: a.id, x: lp.x, y: lp.y, r: 12 });
        }
        // 弧上任意采样点都可点（每 6 个采样点记录一次命中）
        for (let i = 0; i < N; i += 6) {
          const s2 = a.pts[i]; const p = proj(s2.lon, s2.lat, s2.lift);
          if (p.z > 0) hit.arcs.push({ id: a.id, x: p.x, y: p.y, r: 10 });
        }
      }
      ctx.restore();
    });

    // 来源国节点 + 中国节点
    hit.nodes = [];
    const reveal = phase === 'intro' ? clamp((phaseT - 120) / 500, 0, 1) : 1;
    nodes.forEach((nd, i) => {
      const p = proj(nd.lon, nd.lat);
      if (p.z <= 0) return;
      const sz = nd.china ? 9 : 4.5 + Math.sqrt(nd.flow.vol) * 0.32;
      const col = nd.china ? '#1d4ed8' : (DATA.CAT[nd.flow.cat] || '#2563eb');
      const a = nd.china ? 1 : clamp(reveal * 1.6 - i * 0.06, 0, 1);
      ctx.globalAlpha = a;
      if (sel === nd.id || (sel && arcs.some(x => x.id === sel && x.flow.id === nd.id))) {
        ctx.beginPath(); ctx.arc(p.x, p.y, sz + 7, 0, Math.PI * 2); ctx.fillStyle = col + '22'; ctx.fill();
      }
      ctx.beginPath(); ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
      // 名称：中国常显；hover 或「已选中该来源国」时显示（选中即标注，避免满屏标签）
      if (nd.china || hover === nd.id || sel === nd.id) {
        ctx.globalAlpha = 1; ctx.fillStyle = '#10151f'; ctx.font = '600 13px "IBM Plex Sans SC",sans-serif';
        const rAlign = p.x < cx + R * 0.4;              // 贴右侧球缘时标签翻到左边，避免越出画布
        ctx.textAlign = rAlign ? 'left' : 'right';
        ctx.fillText(nd.china ? '中国' : nd.flow.country, rAlign ? p.x + sz + 5 : p.x - sz - 5, p.y + 4);
      }
      hit.nodes.push({ id: nd.id, x: p.x, y: p.y, r: Math.max(12, sz + 6), china: !!nd.china });
      ctx.globalAlpha = 1;
    });
    state.rot = rot; state.phase = phase;
  }

  /* ---------- 交互 ---------- */
  function pick(mx, my) {
    for (const n of hit.nodes) if (Math.hypot(n.x - mx, n.y - my) <= n.r) return { kind: n.china ? 'china' : 'node', id: n.id };
    let best = null, bd = 13;
    for (const a of hit.arcs) { const d = Math.hypot(a.x - mx, a.y - my); if (d < bd) { bd = d; best = a.id; } }
    if (best) return { kind: 'arc', id: best };
    return null;
  }
  function bind() {
    const pos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    cv.addEventListener('pointerdown', e => { dragging = true; dragMoved = 0; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => {
      const p = pos(e);
      if (dragging) {
        dragMoved += Math.abs(e.movementX || 0);
        rot -= (e.movementX || 0) * 0.28; focusTween = null;
        return;
      }
      const h = pick(p.x, p.y);
      const id = h ? h.id : null;
      if (id !== hover) {
        hover = id;
        cv.style.cursor = id ? 'pointer' : 'grab';
        const f = id && id !== 'CN' && DATA.flows ? DATA.flows.find(x => x.id === id) : null;
        onHover(h, f ? { x: p.x, y: p.y, flow: f } : h && h.kind === 'china' ? { x: p.x, y: p.y, china: true } : null);
      }
    });
    cv.addEventListener('pointerup', e => {
      const wasDrag = dragMoved > 6; dragging = false; pauseSpin = 2400;
      if (wasDrag) return;
      const p = pos(e); const h = pick(p.x, p.y);
      if (!h) { onSelect(null); return; }
      onSelect(h);   // 由 app 决定：选中 / 再次点击进入 L2
    });
    cv.addEventListener('pointerleave', () => { dragging = false; hover = null; onHover(null, null); });
    cv.addEventListener('touchstart', () => { pauseSpin = 3000; }, { passive: true });
  }

  const DATA = { CAT: {} };
  const state = { rot: 0, phase: 'idle', grownOrder: [], grownCount: 0 };

  const api = {
    mount, start, stop, playIntro, state,
    set CAT(v) { DATA.CAT = v; },
    resize,
    select(id) {
      sel = id;
      const f = DATA.flows && DATA.flows.find(x => x.id === id);
      if (f && DATA.CHINA) {
        const target = ((f.lng + (DATA.CHINA.lng - f.lng) / 2 + 540) % 360) - 180;
        focusTween = { from: rot, delta: ((target - rot + 540) % 360) - 180, t0: performance.now(), dur: 800 };
      }
    },
    clearSelect() { sel = null; },
    clearHover() { hover = null; },
    pick,
    hits: () => ({ nodes: hit.nodes.map(n => ({ id: n.id, x: n.x, y: n.y, china: n.china })), arcs: hit.arcs.slice(0, 60) }),
    debug: () => ({ rot, phase, sel, grownOrder: state.grownOrder.slice(), grownCount: state.grownOrder.length, arcs: arcs.map(a => ({ id: a.id, grow: +a.grow.toFixed(2) })) })
  };
  return api;
})();
