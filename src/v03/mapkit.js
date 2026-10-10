/* ============================================================
   地图引擎（事实层 / 关联层共用）—— 算法与参数取自地图实验页（已验证）
   四个视角：3D 全球 → 2D 全球 → 2D 中国 → 2D 省区
     · 点行政区域（不含点/关系）进下一级；双击同样；Esc 返回
     · 滚轮 / 双指：按手势距离换算 + 单事件上限 + 一次手势总量封顶（不会一划到底）
     · 比例用「目标值 + 每帧缓动」；跨层时中心沿用当前屏幕中心、比例贴住行进方向边界
     · 世界层左右连续平移（三份接续 + 中心绕回）
     · 进下一级/退上一级用交叉溶解，切换时只渲染一次
   各层只提供：系列（series）、区域配色（regions）、拾取/命中（hit/pick）、三维数据（globeData）。
   ============================================================ */
window.V03MapKit = (function () {
  const VIEWS = ['globe', 'world', 'china', 'province'];
  const LEVELS = {
    world: { map: 'worldChina', center: [107.98, 26.65], fit: 1.36, bounds: [[-25, 72], [335, -56]], min: 1.1, max: 2.6, inAt: 2.15 },
    china: { map: 'china', center: [108.05, 36.15], fit: 1.59, min: .85, max: 4.0, inAt: 2.6, outAt: .95 },
    province: { map: 'china', center: [111.73, 27.54], fit: 9.08, min: 3.4, max: 16, outAt: 3.5 }
  };
  const LABEL = { globe: '3D 全球', world: '2D 全球', china: '2D 中国', province: '2D 省区' };
  const ZOOM_STEP = 1.09, HAND_GAIN = .00030, PINCH_GAIN = .00075, MAX_STEP = .022, GESTURE_CAP = .62, GESTURE_IDLE = 280;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const shortProv = n => String(n || '').replace(/壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市$/g, '');

  function create(cfg) {
    const cam = { z: 1.36, tz: 1.36, cx: 107.98, cy: 26.65, tcx: 107.98, tcy: 26.65, raf: 0, moving: false };
    let chart = null, view = 'globe', focus = null, gesture = { at: 0, spent: 0 }, moveIdle = 0, lastPaint = 0, readoutAt = 0;
    const el = () => document.getElementById(cfg.chartId);
    const wrap = () => document.getElementById(cfg.globeId);
    const toast = m => { if (window.V03Shell) window.V03Shell.toast(m); };
    const lv = () => LEVELS[view === 'globe' ? 'world' : view];
    const api = {
      view: () => view, focus: () => focus, camera: () => cam, level: () => lv(),
      active: () => (cfg.active ? cfg.active() : true),

      /* ---------- 视角 ---------- */
      setView(next, f) {
        view = next; focus = f || (next === 'province' ? '湖南' : null);
        const l = LEVELS[next === 'globe' ? 'world' : next];
        const c = focus && cfg.provinceCenter ? cfg.provinceCenter(focus) : null;
        const ctr = c ? [c[0], c[1]] : l.center.slice();
        cam.cx = cam.tcx = ctr[0]; cam.cy = cam.tcy = ctr[1];
        cam.z = cam.tz = (c && c[2]) ? c[2] : l.fit;
        cfg.onView && cfg.onView(next, focus);
        api.render();
      },
      enter(next, f) { api.setView(next, f); toast('已切到 ' + LABEL[next]); },
      back() { const i = VIEWS.indexOf(view); if (i > 0) api.enter(VIEWS[i - 1], null); },

      /* ---------- 缩放 ---------- */
      zoomFactor(factor, immediate) {
        if (!Number.isFinite(factor) || factor <= 0) return;
        if (view === 'globe') { (cfg.globe || window.V03Globe).zoomBy(factor); return; }
        if (immediate) { cam.tz = clamp(cam.tz * factor, lv().min * .92, lv().max * 1.18); return; }
        const now = performance.now();
        if (now - gesture.at > GESTURE_IDLE) gesture.spent = 0;
        gesture.at = now;
        const want = clamp(Math.log(factor), -MAX_STEP, MAX_STEP);
        const room = Math.max(0, GESTURE_CAP - gesture.spent);
        const d = clamp(want, -room, room);
        if (Math.abs(d) < 1e-6) return;
        gesture.spent += Math.abs(d);
        cam.tz = clamp(cam.tz * Math.exp(d), lv().min * .92, lv().max * 1.18);
      },
      zoomBy(dir) {
        if (view === 'globe') return (cfg.globe || window.V03Globe).zoomBy(dir);
        api.zoomFactor(dir > 0 ? ZOOM_STEP : 1 / ZOOM_STEP, true);
      },
      zoomState() {
        if (view === 'globe') return (cfg.globe || window.V03Globe).zoomState();
        return { canIn: cam.z < lv().max - 1e-3, canOut: true, zoom: cam.z };
      },

      /* ---------- 渲染：2D 用 ECharts，3D 交给共用地球 ---------- */
      render() {
        if (cfg.getView) {
          const want = cfg.getView();
          if (want && want.view && want.view !== view) { view = want.view; focus = want.focus || null; const l = LEVELS[view === 'globe' ? 'world' : view];
            const c = focus && cfg.provinceCenter ? cfg.provinceCenter(focus) : null;
            cam.cx = cam.tcx = c ? c[0] : l.center[0]; cam.cy = cam.tcy = c ? c[1] : l.center[1];
            cam.z = cam.tz = (c && c[2]) ? c[2] : l.fit; }
        }
        const active = api.active();
        if (cfg.globe || window.V03Globe) (cfg.globe || window.V03Globe).setVisible(active && view === 'globe');
        if (!active) return;
        if (view === 'globe') { cfg.globeData && (cfg.globe || window.V03Globe).update(cfg.globeData()); return; }
        const c = ensureChart();
        if (!c) return;
        const box = el();
        if (box && box.clientWidth > 0 && box.clientHeight > 0) c.resize();
        c.setOption(option(), { notMerge: true });
        if (cfg.reveal) beginIntro();
        paintStatus();
      },
      paint(seriesPatch) { if (chart) chart.setOption(seriesPatch, { lazyUpdate: true }); },
      chart: () => chart,
      flyTo(center, zoom, dur) {
        if (view === 'globe' || !center) return;
        cam.cx = cam.tcx = center[0]; cam.cy = cam.tcy = center[1];
        cam.z = cam.tz = zoom;
        if (chart) chart.setOption({ geo: { center: cam.center(), zoom: cam.z } }, { lazyUpdate: true });
      },
      debug: () => ({ view, focus, zoom: cam.z, canIn: api.zoomState().canIn, span: realSpan(), globe: (cfg.globe || window.V03Globe).debug() })
    };
    cam.center = () => [cam.cx, cam.cy];

    function ensureChart() {
      if (chart) return chart;
      if (!el() || !window.echarts) return null;
      if (!window.echarts.getMap('worldChina')) window.echarts.registerMap('worldChina', window.V03Fact.worldGeoJSON(true));
      if (window.__CHINA_GEO && !window.echarts.getMap('china')) window.echarts.registerMap('china', window.__CHINA_GEO);
      chart = echarts.init(el(), null, { devicePixelRatio: Math.min(1.25, window.devicePixelRatio || 1) });
      chart.on('click', params => {
        const hit = cfg.hit && cfg.hit(params);
        if (hit) return cfg.pick(hit.kind, hit.id);
        /* 没命中点或关系：按行政区域下钻（点海洋不会触发 ECharts 的区域事件） */
        const name = shortProv((params.name || '').replace(/@[-\d]+$/, ''));
        if (!name) return;
        if (view === 'world') return api.enter('china', null);
        if (view === 'china') return api.enter('province', name === '湖南' ? '湖南' : name);
      });
      chart.on('mouseover', params => cfg.onHover && cfg.onHover(cfg.hover ? cfg.hover(params) : null, params));
      chart.on('globalout', () => cfg.onHover && cfg.onHover(null, null));
      chart.on('georoam', () => {
        const geo = (chart.getOption().geo || [])[0];
        if (!geo || !geo.center) return;
        cam.cx = cam.tcx = geo.center[0]; cam.cy = cam.tcy = geo.center[1];
        if (view === 'world') {
          const dx = cam.cx > 285 ? -360 : cam.cx < -75 ? 360 : 0;
          if (dx) { cam.cx += dx; cam.tcx += dx; chart.setOption({ geo: { center: [cam.cx, cam.cy] } }, { lazyUpdate: true }); }
        }
        paintStatus();
      });
      /* 普通滚轮也归我们（ECharts 自己的滚轮缩放已关），触控板捏合更缓 */
      el().addEventListener('wheel', e => { e.preventDefault(); e.stopImmediatePropagation(); api.zoomFactor(Math.exp(-e.deltaY * (e.ctrlKey ? PINCH_GAIN : HAND_GAIN))); }, { capture: true, passive: false });
      let gBase = 0;
      el().addEventListener('gesturestart', e => { e.preventDefault(); gBase = e.scale || 1; }, { passive: false });
      el().addEventListener('gesturechange', e => {
        e.preventDefault();
        const sc = e.scale || 1, ratio = gBase ? sc / gBase : 1;
        gBase = sc;
        api.zoomFactor(Math.pow(ratio, .5));
      }, { passive: false });
      el().addEventListener('dblclick', e => {
        if (view === 'world') return api.enter('china', null);
        if (view === 'china') {
          const r = el().getBoundingClientRect();
          const ll = chart.convertFromPixel({ geoIndex: 0 }, [e.clientX - r.left, e.clientY - r.top]);
          return api.enter('province', ll ? shortProv(nearProvince(ll)) : '湖南');
        }
      });
      window.addEventListener('keydown', e => { if (e.key === 'Escape' && api.active() && view !== 'globe') api.back(); });
      return chart;
    }
    function nearProvince(ll) {
      const P = window.V03Data.PROV_CENTER || {};
      let best = '湖南', bd = 3.4;
      Object.keys(P).forEach(k => { const d = Math.hypot(ll[0] - P[k][0], ll[1] - P[k][1]); if (d < bd) { bd = d; best = k; } });
      return best;
    }

    function regions() {
      const names = view === 'world' ? (window.__WORLD110 || []).map(x => x.n)
        : ((window.__CHINA_GEO || {}).features || []).map(f => f.properties.name);
      return names.filter(Boolean).flatMap(name => (view === 'world' ? [-1, 0, 1].map(c => (c ? name + '@' + c : name)) : [name])
        .map(n => ({ name: n, itemStyle: { areaColor: cfg.regionColor(name) } })));
    }
    function option() {
      const l = lv(), p = cfg.chrome();
      return {
        backgroundColor: 'transparent', animation: false, animationDurationUpdate: 0,
        geo: {
          map: l.map, roam: true, zoom: cam.z, center: [cam.cx, cam.cy],
          zoomOnMouseWheel: false, moveOnMouseMove: true, moveOnMouseWheel: false,
          scaleLimit: { min: l.min, max: l.max },
          boundingCoords: view === 'world' ? l.bounds : undefined,
          itemStyle: { areaColor: p.land, borderColor: p.line, borderWidth: .7 },
          regions: regions(),
          emphasis: { itemStyle: { areaColor: p.land2 }, label: { show: false } },
          select: { disabled: true }, label: { show: false }
        },
        tooltip: cfg.tooltip ? {
          trigger: 'item', backgroundColor: p.tipBg, borderColor: p.tipLine, borderWidth: 1,
          textStyle: { color: p.ink, fontSize: 11 }, padding: [6, 9], formatter: cfg.tooltip
        } : { show: false },
        series: cfg.series(view, introCtx())
      };
    }

    /* ---------- 每帧缓动 + 跨层判定 ---------- */
    function anim() {
      cam.raf = requestAnimationFrame(anim);
      if (!api.active() || view === 'globe') return;
      const ease = .16;
      cam.z += (cam.tz - cam.z) * ease;
      cam.cx += (cam.tcx - cam.cx) * ease;
      cam.cy += (cam.tcy - cam.cy) * ease;
      const moving = Math.abs(cam.tz - cam.z) > 1e-4;
      if (moving && chart) {
        const now = performance.now();
        if (now - lastPaint >= 26) {
          lastPaint = now;
          chart.setOption({ geo: { zoom: cam.z, center: [cam.cx, cam.cy] } }, { lazyUpdate: true });
        }
        paintStatus();
        moveIdle = now;
      } else if (Math.abs(cam.tcx - cam.cx) > 5e-3 || Math.abs(cam.tcy - cam.cy) > 5e-3) {
        if (chart) chart.setOption({ geo: { zoom: cam.z, center: [cam.cx, cam.cy] } }, { lazyUpdate: true });
        paintStatus();
      } else if (moveIdle && performance.now() - moveIdle > 120) {
        moveIdle = 0; cam.tz = cam.z;
      }
      const l = lv();
      if (cam.tz > l.max * 1.03 && cam.z > l.max * .99) return switchLevel(1);
      if (cam.tz < l.min * .97 && cam.z < l.min * 1.01) return switchLevel(-1);
    }
    function switchLevel(dir) {
      const i = VIEWS.indexOf(view), next = VIEWS[clamp(i + dir, 0, 3)];
      if (next === view) return;
      const toGlobe = next === 'globe';
      if (toGlobe) { (cfg.globe || window.V03Globe).zoomBy(cam.z / LEVELS.world.fit >= .5 ? 1 : .9); api.setView('globe', null); toast('已切到 3D 全球'); return; }
      view = next; focus = next === 'province' ? (focus || '湖南') : null;
      const l = LEVELS[next];
      /* 同一张底图（中国 ↔ 省区）沿用当前屏幕中心；跨底图（全球 ↔ 中国）做经度归一化 */
      const sameMap = (next === 'province' && view !== 'world') || (next === 'china' && view === 'province');
      if (!sameMap) cam.cx = cam.tcx = ((cam.cx + 180) % 360 + 360) % 360 - 180;
      cam.cy = cam.tcy = cam.cy;
      cam.z = dir > 0 ? l.min * 1.05 : l.max * .95;
      cam.tz = clamp(cam.z * (dir > 0 ? 1.1 : .92), l.min * .92, l.max * 1.18);
      cfg.onView && cfg.onView(next, focus, dir);
      api.render();
      toast('已切到 ' + LABEL[next]);
    }

    /* ---------- 入场动效（关联层的本体逐个点亮 / 关系线逐条画出） ---------- */
    let intro = { on: false, t: 0, t0: 0, timer: 0 };
    const introCtx = () => (intro.on && intro.t < 1 ? { reveal: intro } : {});
    function beginIntro() {
      clearInterval(intro.timer);
      intro.on = true; intro.t = 0; intro.t0 = performance.now();
      intro.timer = setInterval(() => {
        if (!api.active() || view === 'globe') { clearInterval(intro.timer); intro.on = false; return; }
        intro.t = Math.min(1, (performance.now() - intro.t0) / 3200);
        cfg.series && api.paint({ series: cfg.series(view, { reveal: intro }) });
        if (intro.t >= 1) { clearInterval(intro.timer); intro.on = false; }
      }, 60);
    }

    /* ---------- 状态条 / 读数 ---------- */
    function realSpan() {
      if (!chart || view === 'globe') return null;
      const box = el().getBoundingClientRect();
      const a = chart.convertFromPixel({ geoIndex: 0 }, [0, 0]), b = chart.convertFromPixel({ geoIndex: 0 }, [box.width, box.height]);
      if (!a || !b) return null;
      return [Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])].map(n => +n.toFixed(1));
    }
    function paintStatus() {
      const now = performance.now();
      if (now - readoutAt < 120) return;
      readoutAt = now;
      cfg.onStatus && cfg.onStatus({ view, focus, zoom: +cam.z.toFixed(2), center: [+cam.cx.toFixed(2), +cam.cy.toFixed(2)], span: realSpan() });
    }

    function mount() {
      requestAnimationFrame(anim);
      window.addEventListener('resize', () => { const box = el(); if (chart && box && box.clientWidth > 0) chart.resize(); });
    }
    api.mount = mount;
    return api;
  }
  return { create, LEVELS, LABEL, shortProv };
})();
