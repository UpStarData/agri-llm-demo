/* ============================================================
   关联层 · 视觉校准版（V2 指令）
   A1 与事实层共用同一套框架与浅色视觉
   A2 固定九类对象域（商品与标准 / 生产与资源 / 经营主体 / 市场与渠道 / 物流与设施 /
      政策与机构 / 环境与事件 / 空间与行政 / 指标与状态）
   A3 默认三维地球；二维地理关联图只定位有真实坐标的本体，不编造坐标
   A4 MiroFish 式可追踪关系线：细、半透明曲线 + 低速方向粒子；非焦点关系降低透明度；
      悬停/点击本体只强化直接相关线与节点
   A5 右侧只展示不可定位本体，两列紧凑瀑布流；点击后右侧嵌套本体详情抽屉，
      详情内点关系再嵌套打开关系详情，关闭逐层返回
   A6 本体详情 / 关系详情的信息层级（紧凑）
   A7 底部流水与事实层一致（本体抽离处理）
   ============================================================ */
window.V03Relation = (function () {
  const D = window.V03Data, S = window.V03Store, F = window.V03Filter;
  let root, chart, dom = {}, sig = '', shownView = '';
  const globe = window.V03Globe.create();   /* 与事实层共用同一套三维渲染 */
  const camera = { zoom: 1.26, graphZoom: 1, center: [105, 35], raf: null, roamTimer: null, level: null };
  /* 与事实层一致的三级视角：L1 全球 → L2 中国 → L3 省区。
     3D 放大到极致切二维，二维缩到最小回 3D；点地图与事实层一样逐级下钻。 */
  const REL_LEVEL = {
    L1: { map: 'worldChina', center: [105, 35], zoom: 1.26, bounds: [[-25, 72], [335, -56]], box: [1.26, 2.4], inAt: 2.2 },
    L2: { map: 'china', center: [104.5, 36], zoom: 1.0, box: [0.86, 3.2], inAt: 2.7, outAt: 0.9 },
    L3: { map: 'china', center: null, zoom: 4.2, box: [3.0, 14.3] }
  };
  const GRAPH_BOX = [1.26, 3.0];
  const relLevel = () => S.state.rel.level || 'L1';
  const relFocus = () => S.state.rel.focus || null;
  const levelCfg = () => REL_LEVEL[relLevel()];
  const shortProv = n => String(n || '').replace(/壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市$/g, '') || n;
  const mapPoints = (lng, lat) => relLevel() === 'L1' ? window.V03Fact.worldCopies(lng, lat) : [[lng, lat]];
  const inLevel = (lng, lat) => {
    const lv = relLevel();
    if (lv === 'L1') return true;
    if (lng < 73 || lng > 136 || lat < 17.5 || lat > 54.5) return false;
    /* 用真实省界多边形判断，避免把邻国 / 邻省的本体画进来 */
    if (window.V03Mass && V03Mass.insideMap && !V03Mass.insideMap(lv, lng, lat)) return false;
    if (lv === 'L2') return true;
    const c = (D.PROV_CENTER || {})[relFocus()];
    return c ? Math.abs(lng - c[0]) <= 2.8 && Math.abs(lat - c[1]) <= 2.4 : true;
  };
  const nearProvince = center => {
    if (!center) return null;
    let best = null, bd = 3.4;
    Object.keys(D.PROV_CENTER || {}).forEach(k => {
      const c = D.PROV_CENTER[k], d = Math.hypot(center[0] - c[0], center[1] - c[1]);
      if (d < bd) { bd = d; best = k; }
    });
    return best;
  };
  let dragging = false;

  /* 关系类型 → 曲线色（浅色底上可辨的柔和色系，逐条可区分） */
  const TYPE_COLOR = {
    /* 生产与贸易：绿 */
    '生产':'#4a9a68','贸易':'#4a9a68','采购':'#4a9a68',
    /* 供应与经营：橙（供给侧的流向线） */
    '供应':'#d68a3c','供应流向':'#d68a3c','运营':'#d68a3c','入驻':'#d68a3c','合作':'#d68a3c',
    /* 货物流向：青 */
    '流入':'#1fa9a2','流出':'#1fa9a2','运输至':'#1fa9a2','储存于':'#1fa9a2',
    /* 运输经由：青蓝 */
    '运输经由':'#3f8fbf',
    /* 位置与行政：蓝 */
    '位于':'#5a80b8','发生于':'#5a80b8','行政归属':'#5a80b8',
    /* 政策、依赖与替代：紫 */
    '发布':'#8a6dba','适用于':'#8a6dba','监管':'#8a6dba','覆盖':'#8a6dba','依赖':'#8a6dba','替代':'#8a6dba',
    /* 影响与价格传导：红 */
    '影响':'#cf5f6a','价格传导':'#cf5f6a'
  };
  const typeColor = t => TYPE_COLOR[t] || '#7ea0cf';
  /* 地图配色（与事实层同一套） */
  const MAP_PALETTE = {
    land: '#cfe9bd', land2: '#b6dfa4', line: 'rgba(224,128,118,.55)', ink: '#22303f', labelBg: 'rgba(255,255,255,.94)',
    tipBg: 'rgba(255,255,255,.98)', tipLine: 'rgba(30,58,92,.22)', neutral: 'rgba(58,84,112,.78)', flow: '#2f6fd0'
  };
  const palette = () => MAP_PALETTE;
  const domOf = o => D.domain(o.domain);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const TPL = `
  <div class="rel-wrap">
    <div class="rel-main" id="relMain">
      <div class="rel-canvas" id="relCanvas"></div>
      <canvas class="rel-globe" id="relGlobe" aria-label="关联层三维地球：可拖动旋转、滚轮缩放、点击本体"></canvas>
      <div class="rel-tip" id="relTip" role="tooltip" hidden></div>
      <div class="rel-hint" id="relHint" role="status" aria-live="polite"></div>
      <div class="rel-viewbar" role="group" aria-label="关联层视图">

      </div>
    </div>
    <aside class="rel-side" id="relSide"><div class="rel-body" id="relBody"></div></aside>
  </div>`;

  function mount(el) {
    root = el; root.innerHTML = TPL;
    dom = { main: root.querySelector('#relMain'), canvas: root.querySelector('#relCanvas'), globe: root.querySelector('#relGlobe'), side: root.querySelector('#relSide'), body: root.querySelector('#relBody'), tip: root.querySelector('#relTip'), hint: root.querySelector('#relHint') };
    globe.mount(dom.globe, {
      pick: (kind, id) => { if (kind === 'object') openObject(id); },
      /* 放到最大 or 点球面任意区域（不是点）→ 进入 2D 全球视角 */
      zoomEdge: edge => {
        if (S.state.rel.view !== 'globe') return;
        if (edge === 'in') { S.set({ rel: { view: 'geo', level: 'L1' } }); toast('三维地球已放到最大 · 切换到二维全球'); }
        else if (edge === 'surface') { S.set({ rel: { view: 'geo', level: 'L1' } }); toast('进入 2D 全球视角'); }
      }
    });

    bindPinch(dom.canvas);
    dom.canvas.addEventListener('pointerdown', () => { dragging = true; }, true);
    window.addEventListener('pointerup', () => { if (!dragging) return; dragging = false; if (hover) { hover = null; paintFocus(); } });
    /* 二维缩到最小再往下：回三维地球（与事实层同一套边界行为） */
    dom.canvas.addEventListener('wheel', e => {
      if (S.state.rel.view !== 'geo' || e.deltaY <= 0) return;
      if (relLevel() !== 'L1' || camera.zoom > levelCfg().box[0] + .004) return;
      e.preventDefault(); e.stopImmediatePropagation();
      toGlobe();
    }, { capture: true, passive: false });
    window.addEventListener('resize', () => {
      if (chart && dom.canvas.clientWidth > 0 && dom.canvas.clientHeight > 0) chart.resize();
      globe.setVisible(S.state.tab === 'relation' && S.state.rel.view === 'globe');
    });
    /* 每新增一条事实：先亮星，再把它的关系线接上（与底部同一路流水事件） */
    S.onEvent('stream:line', p => {
      if (S.state.tab !== 'relation' || !p || !p.fact) return;
      const fact = p.fact;
      const objects = (fact.objects || []).map(id => D.objById(id)).filter(Boolean);
      const ids = new Set(objects.map(o => o.id));
      const relations = D.RELATIONS.filter(r => ids.has(r.from) || ids.has(r.to)).slice(0, 6);
      /* 没有本体对象时（例如事件型事实）只按坐标亮一颗星 */
      flashObjects(objects.length ? objects : [fact], relations);
    });
  }

  function toast(msg) { if (window.V03Shell) window.V03Shell.toast(msg); }

  /* 相机飞行（双击放大 / 层级切换复用） */
  function flyTo(center, zoom, dur) {
    const from = { center: camera.center.slice(), zoom: camera.zoom }, t0 = performance.now();
    if (camera.raf) cancelAnimationFrame(camera.raf);
    return new Promise(res => {
      const step = now => {
        const t = Math.min(1, (now - t0) / (dur || 600)), e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        camera.center = [from.center[0] + (center[0] - from.center[0]) * e, from.center[1] + (center[1] - from.center[1]) * e];
        camera.zoom = from.zoom + (zoom - from.zoom) * e;
        if (chart) chart.setOption({ geo: { center: camera.center.slice(), zoom: camera.zoom } }, { silent: true });
        if (t < 1) camera.raf = requestAnimationFrame(step);
        else { camera.raf = null; afterZoom(); res(); }
      };
      camera.raf = requestAnimationFrame(step);
    });
  }
  function toGlobe() {
    S.set({ rel: { view: 'globe' } });
    toast('二维缩到最小 · 回到三维地球');
    globe.replay();
  }

  /* 下钻 / 返回：L1 全球 → L2 中国 → L3 省区 */
  let lastLevelAt = 0;
  function enterLevel(next, focus) {
    if (relLevel() === next && (!focus || relFocus() === focus)) return;
    if (performance.now() - lastLevelAt < 360) return;   /* 双击里的第二次点击不再连跳一级 */
    lastLevelAt = performance.now();
    S.set({ rel: { level: next, focus: focus || null } });
    toast(next === 'L2' ? '进入中国视角' : next === 'L3' ? '进入' + (focus || '') + '视角' : '返回全球视角');
  }
  /* 层级变化（含被其它地方改写）时把相机对准该层级 */
  function fitLevel() {
    const lv = relLevel(), t = REL_LEVEL[lv];
    const c = relFocus() ? (D.PROV_CENTER || {})[relFocus()] : null;
    camera.level = lv;
    camera.center = c ? [c[0], c[1]] : (t.center ? t.center.slice() : camera.center);
    camera.zoom = c ? c[2] : t.zoom;
  }

  function mapReady() {
    if (!window.echarts) return;
    const cur = echarts.getMap('worldChina');
    if (!cur || !(cur.geoJSON && cur.geoJSON.features && cur.geoJSON.features.length)) {
      try { echarts.registerMap('worldChina', window.V03Fact.worldGeoJSON(true)); } catch (e) { console.error('registerMap worldChina', e); }
    }
    /* L2 / L3 用中国地图，与事实层共用同一份数据 */
    if (window.__CHINA_GEO && !echarts.getMap('china')) { try { echarts.registerMap('china', window.__CHINA_GEO); } catch (e) { console.error('registerMap china', e); } }
  }
  function ensureChart() {
    if (chart) return chart;
    mapReady();
    if (!dom.canvas || !window.echarts) return null;
    chart = echarts.init(dom.canvas);
    chart.on('click', p => {
      const sid = p.seriesId || '';
      if (sid === 'relGraph') {
        if (p.dataType === 'node' && p.data && p.data.id) openObject(p.data.id);
        if (p.dataType === 'edge' && p.data && p.data.id) S.set({ rel: { sel: p.data.id, kind: 'relation', stack: [{ kind: 'relation', id: p.data.id }] } });
        return;
      }
      if ((sid === 'relNode' || sid === 'relNodeLabel') && p.data && p.data.objId) return openObject(p.data.objId);
      if (sid === 'relLine' && p.data && p.data.id) {
        const r = D.relById(p.data.id);
        if (r) S.set({ rel: { sel: r.id, kind: 'relation', stack: S.state.rel.stack.concat([{ kind: 'relation', id: r.id }]) } });
        return;
      }
      const o = p.data && p.data.objId ? D.objById(p.data.objId) : null;
      if (o) return openObject(o.id);
      /* 点地图逐级下钻：全球 → 中国 → 省区。
         这里按点击坐标判断而不是按区域名：地图区域命中在缩放后会偏几个像素，
         点到中国境内却可能返回蒙古，用坐标更稳。 */
      const ev = p.event || {};
      const px = Number.isFinite(ev.offsetX) ? ev.offsetX : null, py = Number.isFinite(ev.offsetY) ? ev.offsetY : null;
      if (px == null || !chart) return;
      const ll = chart.convertFromPixel({ geoIndex: 0 }, [px, py]);
      if (!Array.isArray(ll) || ll.length !== 2) return;
      /* 共同规则：2D 全球点任一区域 → 2D 中国 */
      if (relLevel() === 'L1') return enterLevel('L2', null);
      if (relLevel() === 'L2') enterLevel('L3', '湖南');   /* 共同规则：中国视角点任一区域 → 湖南 */
    });
    chart.on('mouseover', p => {
      if (dragging) return;
      showTip(p);
      const id = (p.data && (p.data.objId || (D.relById(p.data.id) || {}).from)) || null;
      if (S.state.rel.view === 'geo' && id && id !== hover) { hover = id; paintFocus(); }
    });
    chart.on('globalout', () => {
      hideTip();
      if (S.state.rel.view === 'geo' && !dragging && hover) { hover = null; paintFocus(); }
    });
    dom.canvas.addEventListener('mousemove', e => { lastPointer = { x: e.clientX, y: e.clientY }; positionTip(); });
    dom.canvas.addEventListener('mouseleave', hideTip);
    /* 双击地图：进入下一级（世界 → 中国 → 省区）；已经到省区就放大一点 */
    dom.canvas.addEventListener('dblclick', e => {
      if (S.state.rel.view !== 'geo') return;
      const r = dom.canvas.getBoundingClientRect();
      const ll = chart.convertFromPixel({ geoIndex: 0 }, [e.clientX - r.left, e.clientY - r.top]);
      const at = Array.isArray(ll) && ll.length === 2 ? ll : camera.center;
      if (relLevel() === 'L1') return enterLevel('L2', null);
      if (relLevel() === 'L2') return enterLevel('L3', '湖南');
      flyTo(at, Math.min(levelCfg().box[1], camera.zoom * 1.4), 420);
    });
    /* Esc：返回上一层（省区 → 全国 → 全球） */
    window.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || S.state.tab !== 'relation' || S.state.rel.view !== 'geo') return;
      if (relLevel() === 'L3') return enterLevel('L2', null);
      if (relLevel() === 'L2') return enterLevel('L1', null);
    });
    chart.on('georoam', () => {
      if (S.state.rel.view !== 'geo') return;
      const geo = (chart.getOption().geo || [])[0];
      if (!geo) return;
      if (geo.center) camera.center = geo.center.slice();
      if (geo.zoom != null) camera.zoom = geo.zoom;
      if (camera.roamTimer) clearTimeout(camera.roamTimer);
      camera.roamTimer = setTimeout(() => { camera.roamTimer = null; afterZoom(); }, 140);
    });
    return chart;
  }
  let hover = null, lastPointer = null, tipVisible = false;

  /* 自绘提示：ECharts 的 tooltip 在 notMerge 重设后会命中已释放的容器节点（控制台报错），改为自己画 */
  function tipHTML(p) {
    const sid = p.seriesId || '';
    if (sid === 'relLine' || (sid === 'relGraph' && p.dataType === 'edge')) {
      const r = D.relById(p.data && p.data.id);
      if (!r) return '';
      const a = D.objById(r.from), b = D.objById(r.to);
      return '<b>' + esc(r.type) + '</b><span>' + esc(a ? a.name : r.from) + ' → ' + esc(b ? b.name : r.to) + '</span>' +
        (p.dataType === 'edge' ? '' : '<i>强度 ' + (r.strength * 100).toFixed(0) + '% · 置信 ' + (r.confidence * 100).toFixed(0) + '%</i>');
    }
    const o = p.data && (p.data.objId || p.data.id) ? D.objById(p.data.objId || p.data.id) : null;
    return o ? '<b>' + esc(o.name) + '</b><span>' + esc(domOf(o).n) + (o.region ? ' · ' + esc(o.region) : '') + '</span>' : '';
  }
  function showTip(p) {
    if (!dom.tip) return;
    const html = tipHTML(p);
    if (!html) { hideTip(); return; }
    dom.tip.innerHTML = html;
    dom.tip.dataset.kind = (p.seriesId === 'relLine' || p.dataType === 'edge') ? 'relation' : 'object';
    dom.tip.hidden = false; tipVisible = true;
    positionTip();
  }
  function positionTip() {
    if (!dom.tip || !tipVisible || !lastPointer) return;
    const box = dom.tip.getBoundingClientRect(), main = dom.main.getBoundingClientRect();
    let x = lastPointer.x - main.left + 14, y = lastPointer.y - main.top + 16;
    if (x + box.width > main.width - 8) x = lastPointer.x - main.left - box.width - 14;
    if (y + box.height > main.height - 8) y = lastPointer.y - main.top - box.height - 12;
    dom.tip.style.transform = 'translate(' + Math.max(8, x) + 'px,' + Math.max(8, y) + 'px)';
  }
  function hideTip() { tipVisible = false; if (dom.tip) dom.tip.hidden = true; }

  function openObject(id) {
    S.set({ rel: { sel: id, kind: 'object', stack: [{ kind: 'object', id }] } });
  }

  /* 缩放后决策（滚轮 / 双指 / ＋－按钮共用）：到阀值切层，到边界收敛 */
  function afterZoom() {
    if (S.state.rel.view !== 'geo') return;
    const lv = relLevel(), box = levelCfg().box;
    if (lv === 'L1' && Math.abs(camera.center[0] - 105) > 180) {
      camera.center = [((camera.center[0] - 105 + 180) % 360 + 360) % 360 - 180 + 105, camera.center[1]];
    }
    if (camera.zoom < box[0]) camera.zoom = box[0];
    if (camera.zoom > box[1]) camera.zoom = box[1];
    /* 与事实层相同：全球放到底进中国，中国放到底进省区，中国缩到底回全球 */
    if (lv === 'L1' && camera.zoom >= REL_LEVEL.L1.inAt) return enterLevel('L2', null);
    if (lv === 'L2') {
      if (camera.zoom <= (REL_LEVEL.L2.outAt || 0)) return enterLevel('L1', null);
      if (camera.zoom >= REL_LEVEL.L2.inAt) { const pv = nearProvince(camera.center); if (pv) return enterLevel('L3', pv); }
    }
    if (chart) chart.setOption({ geo: { zoom: camera.zoom, center: camera.center.slice() } }, { lazyUpdate: true });
    S.set({ sk: { zoom: Math.round(camera.zoom * 100) } });
  }

  /* 触控板双指缩放：Chrome / Edge 发 ctrl+wheel，Safari 发 gesturechange（普通滚轮仍交给 ECharts 漫游） */
  function bindPinch(el) {
    let base = 0;
    el.addEventListener('wheel', e => {
      if (!e.ctrlKey) return;
      e.preventDefault(); e.stopImmediatePropagation();
      zoomByFactor(Math.exp(-e.deltaY * .012));
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
  /* 按倍率缩放（双指 / 触摸板用），与按钮的步进缩放在同一套边界规则里 */
  function zoomByFactor(factor) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    if (S.state.rel.view === 'globe') return globe.zoomByFactor(factor);
    if (S.state.rel.view === 'graph') {
      const next = Math.min(GRAPH_BOX[1], Math.max(GRAPH_BOX[0], camera.graphZoom * factor));
      if (Math.abs(next - camera.graphZoom) < 1e-4) return;
      camera.graphZoom = next;
      if (chart) chart.setOption({ series: [{ id: 'relGraph', zoom: next }] }, { lazyUpdate: true });
      return;
    }
    const box = levelCfg().box;
    /* 全球视角在最小比例尺继续缩小：与滚轮 / 按钮一致，切回三维地球 */
    if (factor < 1 && relLevel() === 'L1' && camera.zoom <= box[0] + .004) return toGlobe();
    const next = Math.min(box[1], Math.max(box[0], camera.zoom * factor));
    if (Math.abs(next - camera.zoom) < 1e-4) return;
    camera.zoom = next;
    afterZoom();
  }

  function zoomBy(dir) {
    if (S.state.rel.view === 'globe') return globe.zoomBy(dir);
    if (S.state.rel.view === 'graph') {
      const next = Math.min(GRAPH_BOX[1], Math.max(GRAPH_BOX[0], camera.graphZoom * (dir > 0 ? 1.28 : 1 / 1.28)));
      if (Math.abs(next - camera.graphZoom) < 1e-3) return;
      camera.graphZoom = next;
      if (chart) chart.setOption({ series: [{ id: 'relGraph', zoom: next }] }, { lazyUpdate: true });
      return S.set({ sk: { zoom: Math.round(next * 100) } });
    }
    const box = levelCfg().box;
    /* 全球视角缩到最小：切回三维地球 */
    if (dir < 0 && relLevel() === 'L1' && camera.zoom <= box[0] + .004) return toGlobe();
    const next = Math.min(box[1], Math.max(box[0], camera.zoom * (dir > 0 ? 1.28 : 1 / 1.28)));
    if (Math.abs(next - camera.zoom) < 1e-3) return;
    camera.zoom = next;
    toast('缩放 ' + next.toFixed(2) + '×');
    afterZoom();
  }
  const zoomState = () => {
    if (S.state.rel.view === 'globe') return globe.zoomState();
    if (S.state.rel.view === 'graph') {
      const zoom = camera.graphZoom;
      return { canIn: zoom < GRAPH_BOX[1] - 1e-3, canOut: zoom > GRAPH_BOX[0] + 1e-3, zoom };
    }
    /* 二维最外层缩到底会切到三维地球，所以「缩小」始终可用 */
    return { canIn: camera.zoom < levelCfg().box[1] - 1e-3, canOut: true, zoom: camera.zoom };
  };

  /* ---------- 地图：本体节点 + MiroFish 式关系线 ---------- */
  const focusId = () => {
    const st = S.state;
    if (hover) return hover;
    const top = (st.rel.stack || [])[(st.rel.stack || []).length - 1];
    if (top && top.kind === 'object') return top.id;
    if (st.rel.kind === 'relation' && st.rel.sel) { const r = D.relById(st.rel.sel); return r ? r.from : null; }
    return null;
  };

  function linesData(objs, rels, focus, reveal) {
    const pos = {};
    objs.forEach(o => { if (o.geo !== false && o.lat != null && inLevel(o.lng, o.lat)) pos[o.id] = mapPoints(o.lng, o.lat); });
    const out = [], labels = [], related = new Set();
    const total = rels.filter(r => pos[r.from] && pos[r.to]).length;
    rels.forEach(r => {
      const from = pos[r.from], to = pos[r.to];
      if (!from || !to) return;
      if (!S.state.rel.crossRegion && chart && S.state.rel.view === 'geo') {
        const inside = point => {const xy=chart.convertToPixel({geoIndex:0},point);return xy && xy[0]>=0 && xy[0]<=dom.canvas.clientWidth && xy[1]>=0 && xy[1]<=dom.canvas.clientHeight;};
        if (inside(from[1]) !== inside(to[1])) return;
      }
      const isFocus = focus && (r.from === focus || r.to === focus);
      if (isFocus) related.add(r.id);
      /* 线条颜色沿用关系类型色（原版基线的彩色流向线）；有关注对象时只压暗无关线 */
      const color = typeColor(r.type);
      const copies = from.length;
      for (let copy = 0; copy < copies; copy++) {
      const a = from[copy], b = to[copy].slice();
      if (b[0] - a[0] > 180) b[0] -= 360;
      if (b[0] - a[0] < -180) b[0] += 360;
      out.push({
        id: r.id, coords: [a, b],
        lineStyle: {
          color: color,
          width: Math.max(isFocus ? 1.8 : 1.15, (r.factIds||[]).length>=5 ? 2.6 : (r.factIds||[]).length>=2 ? 1.7 : 1.15),
          opacity: focus ? (isFocus ? .95 : .08) : (total <= 60 ? .66 : .52),
          type: 'solid',
          curveness: .18
        },
        _focus: isFocus,
        _score: (r.factIds || []).length * 4 + (r.confidence || 0) * 10
      });
      /* 关系语义标签：只在可辨认的场景出现（焦点相关线，或全局线数量很少时） */
      if (isFocus || (!focus && total <= 40)) {
        labels.push({
          id: r.id + '-l', coords: [a, b],
          label: { show: true, position: 'middle', formatter: r.type, fontSize: 9, color: palette().ink,
            backgroundColor: palette().labelBg, padding: [1, 3], borderRadius: 3 },
          lineStyle: { opacity: 0 }
        });
      }
      }
    });
    /* 入场渐进：先把本体点亮，再一条一条把线画出来（焦点线优先） */
    if (reveal && reveal.on && reveal.t < 1) {
      const t = reveal.t;
      const ranked = out.slice().sort((a, b) => Number(b._focus) - Number(a._focus) || b._score - a._score);
      /* 按颜色轮转，入场时各种关系的线交替画出 */
      const buckets = new Map();
      ranked.forEach(l => { const k = l.lineStyle.color; if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(l); });
      const lanes = [...buckets.values()];
      const ordered = [];
      for (let i = 0; ordered.length < ranked.length && i < 400; i++) lanes.forEach(b => { if (b[i]) ordered.push(b[i]); });
      const span = Math.max(1, Math.min(ordered.length, 200));
      const shown = [];
      ordered.slice(0, span).forEach((line, i) => {
        const at = .28 + (i / Math.max(1, span - 1)) * .62;
        const p = Math.max(0, Math.min(1, (t - at) / .05));
        if (p <= 0) return;
        const coords = [line.coords[0], [
          line.coords[0][0] + (line.coords[1][0] - line.coords[0][0]) * easeOut(p),
          line.coords[0][1] + (line.coords[1][1] - line.coords[0][1]) * easeOut(p)
        ]];
        shown.push({ ...line, coords, lineStyle: { ...line.lineStyle, opacity: Math.min(1, line.lineStyle.opacity * (.62 + .38 * p)) } });
      });
      if (t > .9) ordered.slice(span).forEach(line => shown.push(line));
      return { lines: shown, labels: t > .9 ? labels : labels.filter(l => shown.some(s => s.id === l.id)), related, total };
    }
    return { lines: out, labels, related, total };
  }
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function nodesData(objs, focus, reveal) {
    let peripheral = 0;
    const list = objs.filter(o => o.geo !== false && o.lat != null && inLevel(o.lng, o.lat)).filter(o => {
      if (focus === o.id || D.relationsOf(o.id).length) return true;
      return peripheral++ % 3 === 0;
    }).slice(0, 220);
    return list.flatMap((o, i) => {
      const dm = domOf(o), degree = D.relationsOf(o.id).length;
      const isFocus = focus === o.id;
      /* 入场时按顺序缓慢点亮：还没轮到的先不画 */
      let pop = 1;
      if (reveal && reveal.on && reveal.t < 1) {
        const at = (i / Math.max(1, list.length - 1)) * .46;
        const p = (reveal.t - at) / .08;
        if (p <= 0) return [];
        pop = Math.min(1, p);
      }
      return mapPoints(o.lng, o.lat).map(value => ({
        id: o.id, objId: o.id, name: o.name, domain: o.domain, value,
        symbolSize: 8 * (.55 + .45 * easeOut(pop)),
        itemStyle: { color: '#ffffff', borderColor: dm.c, borderWidth: isFocus ? 2 : 1.1, opacity: .35 + .65 * pop },
        label: {
          show: (isFocus || degree >= 8) && pop > .9, position: 'right', distance: 3, fontSize: 9, color: palette().ink,
          backgroundColor: palette().labelBg, padding: [1, 3], borderRadius: 3,
          formatter: p => { const n = String(p.name || ''); return n.length > 10 ? n.slice(0, 9) + '…' : n; }
        }
      }));
    });
  }
  /* 关系线持续的流动：按周期分成三组，避免所有线同一节奏，看起来一直在接 */
  /* 流动的线按颜色轮转挑选，多种关系同时在跑，不会只有一种颜色在流动 */
  function pickFlowLines(lines, focusLines, limit) {
    const cap = limit || 90;
    const source = focusLines.length ? focusLines : lines.slice().sort((a, b) => (b._score || 0) - (a._score || 0));
    const byColor = new Map();
    source.forEach(l => { const k = l.lineStyle.color; if (!byColor.has(k)) byColor.set(k, []); byColor.get(k).push(l); });
    const buckets = [...byColor.values()];
    const out = [];
    for (let i = 0; out.length < cap && i < 200; i++) buckets.forEach(b => { if (b[i] && out.length < cap) out.push(b[i]); });
    return out;
  }
  const FLOW_PERIODS = [3.2, 4.4, 5.8, 7.2];
  const FLOW_COLORS = [...new Set(Object.values(TYPE_COLOR))];
  function flowSeries(lines, p, limit) {
    const picked = lines.slice(0, limit || 90);
    const groups = new Map(FLOW_COLORS.map(c => [c, []]));
    picked.forEach(l => { const list = groups.get(l.lineStyle.color); if (list) list.push(l); });
    return FLOW_COLORS.map((color, k) => ({
      /* 每个关系色一条流动series，id 由颜色固定，不会有旧数据残留 */
      id: 'relFlow-' + color.replace(/[^a-z0-9]/gi, ''),
      type: 'lines', coordinateSystem: 'geo', silent: true, z: 4, polyline: false,
      data: groups.get(color).map(l => ({ id: l.id + '-f', coords: l.coords, lineStyle: { opacity: 0, curveness: .22 } })),
      effect: { show: true, period: FLOW_PERIODS[k % FLOW_PERIODS.length], trailLength: .38, symbol: 'circle', symbolSize: 4.6, color },
      lineStyle: { curveness: .22, opacity: 0 }
    }));
  }
  /* 新本体接入：一次性的柔和光晕，缓慢亮起再淡出（参考早期版本的新数据效果，不做循环闪烁） */
  const PULSE_MS = 2800;
  const pulseCurve = t => (t < .34 ? easeOut(t / .34) : Math.max(0, 1 - (t - .34) / .66));
  function freshData() {
    const now = performance.now();
    fresh = fresh.filter(f => now - f.t0 < f.dur);
    return fresh.flatMap(f => {
      const t = clamp((now - f.t0) / f.dur, 0, 1);
      const a = pulseCurve(t);
      return mapPoints(f.lng, f.lat).map(value => ({
        id: f.id, value,
        symbolSize: 7 + 20 * easeOut(Math.min(1, t / .34)),
        itemStyle: { color: f.color, opacity: a * .5, borderColor: f.color, borderWidth: 1, shadowColor: f.color, shadowBlur: 20 * a }
      }));
    });
  }
  function freshSeries() {
    const data = freshData();
    if (!data.length) return null;
    return { id: 'relFresh', type: 'scatter', coordinateSystem: 'geo', silent: true, z: 9, data, animation: false };
  }
  /* 有一条新本体就按 60ms 推进一次光度，全部淡出后自动收尾 */
  let freshTimer = 0;
  function syncFresh() {
    clearInterval(freshTimer); freshTimer = 0;
    if (!fresh.length || !chart || S.state.rel.view !== 'geo') return;
    const push = () => {
      if (!chart || S.state.rel.view !== 'geo' || !fresh.length) { clearInterval(freshTimer); freshTimer = 0; return; }
      const s2 = freshSeries();
      chart.setOption({ series: [s2 || { id: 'relFresh', type: 'scatter', coordinateSystem: 'geo', silent: true, z: 9, data: [] }] }, { lazyUpdate: true });
      if (!s2) { clearInterval(freshTimer); freshTimer = 0; }
    };
    push();
    freshTimer = setInterval(push, 60);
  }

  function option(objs, rels, st) {
    const p = palette(), cfg = levelCfg(), lv = relLevel();
    const focus = focusId();
    const { lines, labels } = linesData(objs, rels, focus, intro);
    const nodes = nodesData(objs, focus, intro);
    const focusLines = lines.filter(l => l._focus);
    const flowLines = pickFlowLines(lines, focusLines, 90);
    const regionNames = lv === 'L1' ? (window.__WORLD110 || []).map(x => x.n)
      : ((window.__CHINA_GEO || {}).features || []).map(f => f.properties && f.properties.name);
    return {
      backgroundColor: 'transparent',
      geo: {
        map: cfg.map, roam: true, zoom: camera.zoom, center: camera.center.slice(),
        boundingCoords: lv === 'L1' ? cfg.bounds : undefined,
        itemStyle: { areaColor: p.land, borderColor: p.line, borderWidth: .7 },
        regions: regionNames.filter(Boolean).flatMap(name => (lv === 'L1' ? [-1, 0, 1].map(copy => copy ? name + '@' + copy : name) : [name])
          .map(displayName => ({ name: displayName, itemStyle: { areaColor: window.V03Fact.mapRegionColor(name, lv) } }))),
        emphasis: { itemStyle: { areaColor: p.land2 }, label: { show: false } },
        select: { disabled: true }, label: { show: false }
      },
      tooltip: { show: false },   /* 提示由 .rel-tip 自绘，见 showTip() */
      series: [
        { id: 'relLineGlow', type: 'lines', coordinateSystem: 'geo', silent: true, z: 2, polyline: false, animation: false,
          data: focusLines.map(l => ({ id: l.id + '-g', coords: l.coords, lineStyle: { color: l.lineStyle.color, width: 4, opacity: .12, curveness: .18 } })) },
        { id: 'relLine', type: 'lines', coordinateSystem: 'geo', z: 3, polyline: false, data: lines, animation: false,
          lineStyle: { curveness: .22 } },
        ...flowSeries(flowLines, p, 90),
        { id: 'relLineLabel', type: 'lines', coordinateSystem: 'geo', silent: true, z: 4, polyline: false, data: labels, animation: false },
        { id: 'relNode', type: 'scatter', coordinateSystem: 'geo', data: nodes, z: 5, cursor: 'pointer', animation: false },
        { id: 'relPorts', type: 'scatter', coordinateSystem: 'geo', silent: true, z: 6,
          data: st.sk.gates ? D.GATES.filter(g => g.kind === 'port').flatMap(g => mapPoints(g.lng, g.lat).map(value => ({ value, name: g.name, symbolSize: 11, label: { show: true, formatter: '⚓', position: 'inside', fontSize: 10 }, itemStyle: { color: '#e1a653' } }))) : [] },
        ...[freshSeries()].filter(Boolean)
      ]
    };
  }

  /* 预置核心图谱仅展示少量高连接对象；筛选和事实携带优先保留用户正在看的对象。 */
  function graphOption(objs, rels, st) {
    const p = palette(), focus = focusId();
    const degrees = new Map();
    rels.forEach(r => { degrees.set(r.from, (degrees.get(r.from) || 0) + 1); degrees.set(r.to, (degrees.get(r.to) || 0) + 1); });
    const carried = new Set((st.carry || []).flatMap(id => (D.factById(id) || {}).objects || []));
    const ranked = objs.slice().sort((a, b) =>
      Number(b.id === focus || carried.has(b.id)) - Number(a.id === focus || carried.has(a.id)) ||
      (degrees.get(b.id) || 0) - (degrees.get(a.id) || 0) ||
      (b.factCount || 0) - (a.factCount || 0) || a.id.localeCompare(b.id));
    const selected = [], ids = new Set();
    /* 冷启动先覆盖各本体类型，剩余位置再按连接数补足。 */
    D.DOMAINS.forEach(d => {
      const o = ranked.find(x => x.domain === d.id);
      if (o && !ids.has(o.id)) { selected.push(o); ids.add(o.id); }
    });
    ranked.forEach(o => { if (selected.length < 20 && !ids.has(o.id)) { selected.push(o); ids.add(o.id); } });
    const nodes = selected.map(o => ({
      id: o.id, name: o.name, value: (degrees.get(o.id) || 0),
      symbolSize: 20,
      itemStyle: { color: domOf(o).c, borderColor: o.id === focus ? '#e91e63' : '#fff', borderWidth: o.id === focus ? 4 : 2.5 },
      label: { show: true, color: p.ink, fontSize: 11, fontWeight: 500,
        formatter: o.name.length > 9 ? o.name.slice(0, 8) + '…' : o.name }
    }));
    const links = rels.filter(r => ids.has(r.from) && ids.has(r.to)).map(r => ({
      id: r.id, name: r.type, source: r.from, target: r.to,
      lineStyle: { color: focus && (r.from === focus || r.to === focus) ? '#e91e63' : '#c0c0c0',
        width: focus && (r.from === focus || r.to === focus) ? 2.5 : 1.5, opacity: 1, curveness: .08 }
    }));
    return {
      backgroundColor: 'transparent',
      tooltip: { show: false },
      series: [{ id: 'relGraph', type: 'graph', layout: 'force', roam: true, zoom: camera.graphZoom,
        data: nodes, links, edgeSymbol: ['none', 'none'],
        edgeLabel: { show: true, color: p.ink, fontSize: 9, formatter: item => item.data.name,
          backgroundColor: p.labelBg, padding: [2, 4], borderRadius: 3 },
        force: { repulsion: 400, edgeLength: 150, gravity: .04, friction: .65 },
        emphasis: { focus: 'adjacency', itemStyle: { borderColor: '#333', borderWidth: 3 }, lineStyle: { color: '#e91e63', width: 2.5 } },
        label: { position: 'right', distance: 4 }, labelLayout: { hideOverlap: true }, animationDurationUpdate: 350 }]
    };
  }

  function paintFocus() {
    if (S.state.rel.view !== 'geo') return;
    const st = S.state;
    if (!chart) return;
    const objs = F.objects(st).filter(o => o.geo !== false && o.lat != null);
    const { lines, labels } = linesData(objs, F.relations(st), focusId(), intro);
    const flowLines = pickFlowLines(lines, lines.filter(l => l._focus), 90);
    chart.setOption({
      series: [
        ...flowSeries(flowLines, palette(), 90),
        { id: 'relLineGlow', data: lines.filter(l => l._focus).map(l => ({ id: l.id + '-g', coords: l.coords, lineStyle: { color: l.lineStyle.color, width: 4, opacity: .12, curveness: .18 } })) },
        { id: 'relLine', data: lines, animation: false },
        { id: 'relLineLabel', data: labels, animation: false },
        { id: 'relNode', data: nodesData(F.objects(st), focusId(), intro) }
      ]
    }, { lazyUpdate: true });
  }

  /* ---------- 入场动效：先缓慢点亮本体，再逐条连线；连完持续流动 ---------- */
  const INTRO_MS = 3200;
  let intro = { on: false, t: 0, t0: 0, timer: 0 };
  let fresh = [], freshSeq = 0;

  function beginIntro() {
    if (S.state.rel.view !== 'geo') return;
    intro.on = true; intro.t = 0; intro.t0 = performance.now();
    clearInterval(intro.timer);
    intro.timer = setInterval(() => {
      if (S.state.rel.view !== 'geo') { clearInterval(intro.timer); intro.timer = 0; intro.on = false; return; }
      /* 用户正在拖动地图时先让路，别和漫游抢帧 */
      if (dragging || camera.raf) { intro.t0 += 60; return; }
      intro.t = Math.min(1, (performance.now() - intro.t0) / INTRO_MS);
      paintFocus();
      if (intro.t >= 1) { clearInterval(intro.timer); intro.timer = 0; intro.on = false; }
    }, 60);
  }

  /* 新本体接入：缓慢亮起再淡出一次，随后它的新线从头画到尾 */
  function flashObjects(objects, relations) {
    const now = performance.now();
    objects.filter(Boolean).forEach((o, i) => {
      if (o.geo === false || !Number.isFinite(o.lng) || !inLevel(o.lng, o.lat)) return;
      fresh.push({ id: 'rel-fresh-' + (++freshSeq), lng: o.lng, lat: o.lat, t0: now + i * 160, dur: PULSE_MS, color: domOf(o).c || '#e4a449' });
    });
    if (!fresh.length) return;
    if (S.state.rel.view === 'globe') globe.flash(objects.map(o => o && o.id).filter(Boolean), relations.map(r => r && r.id));
    syncFresh();
    /* 新线晚一点再接上，看得出「先亮起、后连线」 */
    setTimeout(() => { if (S.state.rel.view === 'geo') paintFocus(); }, 1100);
  }

  /* ---------- PRD V1.3：右侧本体卡片与地图视角分离，包含可定位和不可定位本体 ---------- */
  const shortFacts = o => {
    const fs = (o.factIds || []).map(id => D.factById(id)).filter(Boolean);
    return fs.slice(0, 1).map(f => f.title)[0] || '';
  };
  const recentOf = o => {
    const fs = (o.factIds || []).map(id => D.factById(id)).filter(Boolean).sort((a, b) => a.date < b.date ? 1 : -1);
    return fs.length ? fs[0].date : '';
  };
  const CARD_SUMMARY = {
    '水果':['品种名称','主要产地','主要进口来源'], '蔬菜':['品种名称','主要产地','主要进口来源'],
    '粮油与油料':['品种名称','主要产地','主要进口来源'], '经济作物':['品种名称','主要产地','主要进口来源'],
    '产区与基地':['主要品种','年产量','规模','主要销往地区'],
    '市场':['市场类型','主营品种','辐射范围'],
    '港口':['设施类型','主要货类','运营状态'], '机场':['设施类型','主要货类','运营状态'],
    '企业与贸易主体':['经营角色','主营品种','所在地'],
    '政府与机构':['机构类型','适用地区','生效状态'], '政策与法规':['政策类型','适用地区','生效状态'],
    '自然与生态':['事件类型','事件状态','发生地区'], '政策与贸易':['事件类型','事件状态','发生地区'],
    '地缘与安全':['事件类型','事件状态','发生地区'], '公共事件':['事件类型','事件状态','发生地区'],
    '行政区划':['行政级别','上级区域']
  };
  const DETAIL_FIELDS = {
    '水果':['学名或别名','主要产地','主要进口来源国','主要产季','适宜生长条件'],
    '蔬菜':['学名或别名','主要产地','主要进口来源国','主要产季','适宜生长条件'],
    '粮油与油料':['学名或别名','主要产地','主要进口来源国','主要产季','适宜生长条件'],
    '经济作物':['学名或别名','主要产地','主要进口来源国','主要产季','适宜生长条件'],
    '产区与基地':['主要品种','产季','种植或养殖面积','年产量','主要销往地区','经营主体'],
    '市场':['市场类型','主营品种','辐射范围','交易规模','运营主体','主要货源地'],
    '港口':['设施类型','主要货类','是否具备冷链能力','主要航线或线路','吞吐或库容规模','运营状态','运营主体'],
    '机场':['设施类型','主要货类','是否具备冷链能力','主要航线或线路','吞吐或库容规模','运营状态','运营主体'],
    '企业与贸易主体':['主体类型','经营角色','主营品种','注册地','主要合作方'],
    '政府与机构':['机构或政策类型','发布机构','适用地区','适用对象','生效状态','主要内容'],
    '政策与法规':['机构或政策类型','发布机构','适用地区','适用对象','生效状态','主要内容'],
    '自然与生态':['事件类型','事件状态','开始时间','结束时间','发生地区','影响对象','影响环节'],
    '政策与贸易':['事件类型','事件状态','开始时间','结束时间','发生地区','影响对象','影响环节'],
    '地缘与安全':['事件类型','事件状态','开始时间','结束时间','发生地区','影响对象','影响环节'],
    '公共事件':['事件类型','事件状态','开始时间','结束时间','发生地区','影响对象','影响环节'],
    '行政区划':['行政级别','上级区域','主要农产品']
  };
  function renderPanel(st, objs) {
    dom.side.classList.toggle('off', !st.panels.cards);
    const nogeo = objs.slice().sort((a,b)=>String(recentOf(b)).localeCompare(String(recentOf(a))));
    const ordered = nogeo;
    const capped = st.rel.allCards ? ordered.slice(0, 120) : ordered.slice(0, 24);
    dom.body.innerHTML = (capped.length ? '<div class="rel-grid">' + capped.map(o => {
      const dm = domOf(o);
      const kind = F.relKind(o) || dm.n;
      const kv = (o.props || []).filter(([k]) => (CARD_SUMMARY[kind] || []).includes(k)).slice(0, 3)
        .map(([k, v]) => '<span class="rc-kv"><i>' + esc(k) + '</i>' + esc(String(v).slice(0, 18)) + '</span>').join('');
      const relCount = D.relationsOf(o.id).length;
      return '<button class="rel-card" data-obj="' + o.id + '" style="--rc:' + dm.c + '">' +
        '<span class="rc-top"><span class="rc-dot"></span><span class="rc-dom">' + esc(kind) + '</span></span>' +
        '<b>' + esc(o.name) + '</b>' +
        '<span class="rc-sub">' + esc([o.region, (o.commodityTags || []).join('、')].filter(Boolean).join(' / ') || o.sub || '') + '</span>' +
        (kv ? '<span class="rc-attrs">' + kv + '</span>' : '') +
        '<span class="rc-m">' + relCount + ' 条关系 · 查看详情 →</span></button>';
    }).join('') + '</div>' : '<div class="rel-empty">暂无符合条件的本体</div>')
      + (ordered.length > capped.length ? '<button class="ghost sm rel-more" id="relMore">展开其余 ' + (ordered.length - capped.length) + ' 个对象</button>' : '')
      ;
    const more = dom.body.querySelector('#relMore');
    if (more) more.onclick = () => S.set({ rel: { allCards: !st.rel.allCards } });
    dom.body.querySelectorAll('[data-obj]').forEach(n => n.onclick = () => openObject(n.dataset.obj));
  }

  /* ---------- A6：抽屉内容（本体详情 / 关系详情） ---------- */
  function renderDrawer(box, d) {
    if (!box) return;
    if (d.kind === 'relation') return renderRelation(box, D.relById(d.id));
    return renderObject(box, D.objById(d.id));
  }
  function openFact(id) {
    const stack=S.state.rel.stack || [];
    S.set({ factId:id, rel:{stack:stack.concat([{kind:'fact',id}]),sel:id,kind:'fact'} });
  }
  function renderObject(box, o) {
    if (!o) { box.innerHTML = ''; return; }
    const dm = domOf(o);
    const rels = D.relationsOf(o.id).filter(r => !Array.isArray(S.state.relTypes) || S.state.relTypes.includes(r.type));
    const facts = (o.factIds || []).map(id => D.factById(id)).filter(Boolean).sort((a, b) => a.date < b.date ? 1 : -1);
    box.innerHTML = `
      <div class="fd">
        <div class="fd-id">${esc(F.relKind(o)||dm.n)}</div>
        <h3>${esc(o.name)}</h3>

        <div class="fd-sec">
          <h4>分类与所在地</h4>
          <div class="kv"><span>分类</span><b>${esc(F.relKind(o)||dm.n)}</b></div>
          <div class="kv"><span>所在地</span><b>${esc(o.region || o.location || (o.geo === false ? '暂无位置' : (o.lat.toFixed(2) + '°N / ' + o.lng.toFixed(2) + '°E')))}</b></div>
        </div>
        ${(o.commodityTags || []).length ? '<div class="fd-sec"><h4>涉及品种</h4><p>' + esc(o.commodityTags.join('、')) + '</p></div>' : ''}
        ${o.note ? '<div class="fd-sec"><h4>简介</h4><p>' + esc(o.note) + '</p></div>' : ''}
        ${(o.props || []).some(([k]) => (DETAIL_FIELDS[F.relKind(o)] || []).includes(k)) ? '<div class="fd-sec"><h4>分类字段</h4><div class="kv-grid">' + (o.props || []).filter(([k]) => (DETAIL_FIELDS[F.relKind(o)] || []).includes(k)).map(([k,v])=>'<div class="kv"><span>'+esc(k)+'</span><b>'+esc(v)+'</b></div>').join('') + '</div></div>' : ''}

        <div class="fd-sec">
          <h4>证据与来源 <small>${facts.length} 条</small></h4>
          ${facts.map(f => '<button class="rel-evidence" data-fact="' + esc(f.id) + '">' + esc(f.date) + ' · ' + esc(f.title) + '</button>').join('') || '<p>暂无直接支撑事实</p>'}
        </div>

        <div class="fd-sec">
          <h4>关系 <small>${rels.length} 条</small></h4>
          ${rels.length ? rels.map(r => {
            const other = D.objById(r.from === o.id ? r.to : r.from);
            return '<button class="rel-row" data-rel="' + r.id + '" style="--rc:' + typeColor(r.type) + '">' +
              '<span class="rr-bar"></span>' +
              '<span class="rr-t"><b>' + esc(r.type) + '</b><i>·</i>' + esc(other ? other.name : '') + '</span>' +
              '<span class="rr-m">' + esc(o.name) + ' ' + (r.from === o.id ? '→' : '←') + ' ' + esc(other ? other.name : '') + '</span>' +
              '</button>';
          }).join('') : '<p>暂无关系</p>'}
        </div>
        <button type="button" class="rel-start-sim">基于该本体发起推演</button>
      </div>`;
    box.querySelector('.rel-start-sim').onclick = () => S.set({ carry: [...new Set([...(S.state.carry || []), ...(o.factIds || [])])], tab: 'sim' });
    box.querySelectorAll('[data-fact]').forEach(n=>n.onclick=()=>openFact(n.dataset.fact));
    box.querySelectorAll('[data-rel]').forEach(n => n.onclick = () => {
      const stack = S.state.rel.stack || [];
      S.set({ rel: { sel: n.dataset.rel, kind: 'relation', stack: stack.concat([{ kind: 'relation', id: n.dataset.rel }]) } });
    });
  }
  function renderRelation(box, r) {
    if (!r) { box.innerHTML = ''; return; }
    const a = D.objById(r.from), b = D.objById(r.to);
    const facts = (r.factIds || []).map(id => D.factById(id)).filter(Boolean);
    box.innerHTML = `
      <div class="fd">
        <div class="fd-id">关系详情</div>
        <h3>${esc(a ? a.name : r.from)} → ${esc(r.type)} → ${esc(b ? b.name : r.to)}</h3>

        <div class="fd-sec">
          <h4>关系类型</h4><p>${esc(r.type)}</p>
        </div>

        <div class="fd-sec">
          <h4>起点、终点</h4>
          <div class="kv-grid">
            <div class="kv"><span>起点本体</span><button class="rel-endpoint" data-object="${esc(r.from)}">${esc(a ? a.name : r.from)} · ${esc(a ? F.relKind(a) : '')}</button></div>
            <div class="kv"><span>终点本体</span><button class="rel-endpoint" data-object="${esc(r.to)}">${esc(b ? b.name : r.to)} · ${esc(b ? F.relKind(b) : '')}</button></div>
          </div>
        </div>

        <div class="fd-sec">
          <h4>支撑事实 <small>${facts.length} 条</small></h4>
          ${facts.map(f => '<button class="rel-evidence" data-fact="' + esc(f.id) + '">' + esc(f.date) + ' · ' + esc(f.title) + '</button>').join('') || '<p>暂无直接支撑事实</p>'}
        </div>
        ${r.note ? '<div class="fd-sec"><h4>判断依据</h4><p>' + esc(r.note) + '</p></div>' : ''}
        ${r.formed ? '<div class="fd-sec"><h4>形成过程</h4><p>首次写入时间：' + esc(r.formed) + '</p></div>' : ''}
        <button type="button" class="rel-start-sim">基于该关系发起推演</button>
      </div>`;
    box.querySelector('.rel-start-sim').onclick = () => S.set({carry:[...new Set([...(S.state.carry||[]),...(r.factIds||[])])],tab:'sim'});
    box.querySelectorAll('[data-fact]').forEach(n=>n.onclick=()=>openFact(n.dataset.fact));
    box.querySelectorAll('[data-object]').forEach(n=>n.onclick=()=>{const stack=S.state.rel.stack||[];S.set({rel:{sel:n.dataset.object,kind:'object',stack:stack.concat([{kind:'object',id:n.dataset.object}])}});});
  }

  /* ---------- 更新 ---------- */
  function update() {
    if (!root) return;
    const st = S.state;
    globe.setVisible(st.tab === 'relation' && st.rel.view === 'globe');
    const key = JSON.stringify([st.rel.search, st.varieties, st.relTypes, st.relKeys, st.rel.crossRegion, st.rel.view, st.rel.domain, st.rel.sel, st.rel.kind,
      st.rel.allCards, st.rel.focusFact, st.rel.level, st.rel.focus, st.carry, st.panels.cards, st.sk.gates, st.theme, (st.rel.stack || []).map(x => x.id)]);
    if (key === sig) return; sig = key;
    const objs = F.objects(st), rels = F.relations(st);
    if (camera.level !== st.rel.level) fitLevel();
    dom.main.classList.toggle('graph-view', st.rel.view === 'graph');
    dom.main.classList.toggle('globe-view', st.rel.view === 'globe');
    if (dom.hint) {
      const lv = relLevel();
      dom.hint.hidden = st.rel.view !== 'geo';
      /* 层级面包屑 + 一句交互提示；不做可点按钮 */
      const trail = ['世界', '中国', relFocus() || '省区'];
      const at = lv === 'L1' ? 0 : lv === 'L2' ? 1 : 2;
      dom.hint.innerHTML = trail.slice(0, at + 1).map((t, i) =>
        '<span' + (i === at ? ' class="on"' : '') + '>' + t + '</span>').join('<i>›</i>')
        + '<em>' + (lv === 'L1' ? '点击地图或双击进入中国 · 双指缩放 · Esc 返回'
          : lv === 'L2' ? '点击省份或双击进入省区 · 滚轮缩小返回世界 · Esc 返回'
          : '滚轮缩小或 Esc 返回全国') + '</em>';
    }
    if (shownView !== st.rel.view) {
      shownView = st.rel.view;
      [dom.globe, dom.canvas].forEach(el => { el.classList.remove('view-fade'); void el.offsetWidth; el.classList.add('view-fade'); });
    }
    if (st.rel.view === 'globe') {
      const keep = new Set([focusId(), ...(st.carry || []).flatMap(id => (D.factById(id) || {}).objects || [])].filter(Boolean));
      globe.update({ mode: 'relation', objects: objs, relations: rels, colorOf: typeColor, keep: [...keep] });
    } else {
      const c = ensureChart(); if (!c) return;
      /* 进图时把相机对准当前层级（切层时由 enterLevel 设定） */
      if (st.rel.view === 'geo') { camera.zoom = Math.max(levelCfg().box[0], Math.min(levelCfg().box[1], camera.zoom)); }
      /* 图层不可见时容器是 0 尺寸，此时 resize 会让 ECharts 在空画布上 drawImage 报错 */
      if (dom.canvas.clientWidth > 0 && dom.canvas.clientHeight > 0) c.resize();
      c.setOption(st.rel.view === 'geo' ? option(objs, rels, st) : graphOption(objs, rels, st), { notMerge: true });
      if (st.rel.view === 'geo') beginIntro();
    }

    renderPanel(st, objs);
  }

  const debug = () => {
    const st = S.state, objs = F.objects(st), rels = F.relations(st);
    const mapped = objs.filter(o => o.geo !== false && o.lat != null);
    return {
      view: st.rel.view, nodes: objs.length, mapped: mapped.length, unmapped: objs.length - mapped.length,
      edges: rels.length, lines: rels.filter(r => { const a = D.objById(r.from), b = D.objById(r.to); return a && b && a.geo !== false && b.geo !== false; }).length,
      drawerCards: document.querySelectorAll('#relBody .rel-card').length,
      relationRows: document.querySelectorAll('#drawerStack .rel-row').length,
      domains: D.DOMAINS.length, zoom: camera.zoom, level: relLevel(), focus: focusId(), intro: intro.on ? Math.round(intro.t * 100) : -1,
      globe: globe.debug()
    };
  };
  const setVisible = active => globe.setVisible(active && S.state.rel.view === 'globe');
  return { mount, update, setVisible, renderDrawer, renderDetail: renderDrawer, debug, zoomBy, zoomByFactor, zoomState };
})();
