/* ============================================================
   关联层 · 视觉校准版（V2 指令）
   A1 与事实层共用同一套框架与浅色视觉
   A2 固定九类对象域（商品与标准 / 生产与资源 / 经营主体 / 市场与渠道 / 物流与设施 /
      政策与机构 / 环境与事件 / 空间与行政 / 指标与状态）
   A3 有真实坐标的本体上图（小型图标）；无坐标本体进入右侧瀑布流，不编造坐标
   A4 MiroFish 式可追踪关系线：细、半透明曲线 + 低速方向粒子；非焦点关系降低透明度；
      悬停/点击本体只强化直接相关线与节点
   A5 右侧只展示不可定位本体，两列紧凑瀑布流；点击后右侧嵌套本体详情抽屉，
      详情内点关系再嵌套打开关系详情，关闭逐层返回
   A6 本体详情 / 关系详情的信息层级（紧凑）
   A7 底部流水与事实层一致（本体抽离处理）
   ============================================================ */
window.V03Relation = (function () {
  const D = window.V03Data, S = window.V03Store, F = window.V03Filter;
  let root, chart, dom = {}, sig = '';
  const camera = { zoom: 1.06, center: [18, 10], raf: null, level: null };
  const ZOOM_BOX = [0.9, 3.0];

  /* 关系类型 → 曲线色（浅色底上可辨的柔和色系，逐条可区分） */
  const TYPE_COLOR = {
    '行政归属': '#7ea0cf', '生产': '#65a30d', '供应流向': '#d97706', '流入': '#0891b2',
    '流出': '#0d9488', '运输经由': '#0369a1', '影响': '#dc2626', '依赖': '#7e22ce',
    '覆盖': '#a16207', '贸易': '#b45309', '替代': '#db2777', '价格传导': '#ea580c'
  };
  const typeColor = t => TYPE_COLOR[t] || '#7ea0cf';
  const domOf = o => D.domain(o.domain);
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const TPL = `
  <div class="rel-wrap">
    <div class="rel-main" id="relMain">
      <div class="rel-canvas" id="relCanvas"></div>
    </div>
    <aside class="rel-side" id="relSide"><div class="rel-body" id="relBody"></div></aside>
  </div>`;

  function mount(el) {
    root = el; root.innerHTML = TPL;
    dom = { main: root.querySelector('#relMain'), canvas: root.querySelector('#relCanvas'), side: root.querySelector('#relSide'), body: root.querySelector('#relBody') };
    window.addEventListener('resize', () => { if (chart) chart.resize(); });
  }

  function mapReady() {
    if (!window.echarts) return;
    const cur = echarts.getMap('world110');
    if (!cur || !(cur.geoJSON && cur.geoJSON.features && cur.geoJSON.features.length)) {
      try { echarts.registerMap('world110', window.V03Fact.worldGeoJSON()); } catch (e) { console.error('registerMap world110', e); }
    }
  }
  function ensureChart() {
    if (chart) return chart;
    mapReady();
    if (!dom.canvas || !window.echarts) return null;
    chart = echarts.init(dom.canvas);
    chart.on('click', p => {
      const sid = p.seriesId || '';
      if ((sid === 'relNode' || sid === 'relNodeLabel') && p.data && p.data.objId) return openObject(p.data.objId);
      if (sid === 'relLine' && p.data && p.data.id) {
        const r = D.relById(p.data.id);
        if (r) S.set({ rel: { sel: r.id, kind: 'relation', stack: S.state.rel.stack.concat([{ kind: 'relation', id: r.id }]) } });
        return;
      }
      const o = p.data && p.data.objId ? D.objById(p.data.objId) : null;
      if (o) openObject(o.id);
    });
    chart.on('mouseover', p => {
      const id = (p.data && (p.data.objId || (D.relById(p.data.id) || {}).from)) || null;
      if (id && id !== hover) { hover = id; paintFocus(); }
    });
    chart.on('globalout', () => { if (hover) { hover = null; paintFocus(); } });
    return chart;
  }
  let hover = null;

  function openObject(id) {
    S.set({ rel: { sel: id, kind: 'object', stack: [{ kind: 'object', id }] } });
  }

  function zoomBy(dir) {
    const next = Math.min(ZOOM_BOX[1], Math.max(ZOOM_BOX[0], camera.zoom * (dir > 0 ? 1.28 : 1 / 1.28)));
    if (Math.abs(next - camera.zoom) < 1e-3) return;
    camera.zoom = next;
    if (chart) chart.setOption({ geo: { zoom: next } }, { lazyUpdate: true });
    if (window.V03Shell) window.V03Shell.toast('缩放 ' + next.toFixed(2) + '×');
    S.set({ sk: { zoom: Math.round(next * 100) } });
  }
  const zoomState = () => ({ canIn: camera.zoom < ZOOM_BOX[1] - 1e-3, canOut: camera.zoom > ZOOM_BOX[0] + 1e-3, zoom: camera.zoom });

  /* ---------- 地图：本体节点 + MiroFish 式关系线 ---------- */
  const focusId = () => {
    const st = S.state;
    if (hover) return hover;
    const top = (st.rel.stack || [])[(st.rel.stack || []).length - 1];
    if (top && top.kind === 'object') return top.id;
    if (st.rel.kind === 'relation' && st.rel.sel) { const r = D.relById(st.rel.sel); return r ? r.from : null; }
    return null;
  };

  function linesData(objs, rels, focus) {
    const pos = {};
    objs.forEach(o => { if (o.geo !== false && o.lat != null) pos[o.id] = [o.lng, o.lat]; });
    const out = [], labels = [], related = new Set();
    const total = rels.filter(r => pos[r.from] && pos[r.to]).length;
    rels.forEach(r => {
      const a = pos[r.from], b = pos[r.to];
      if (!a || !b) return;
      const isFocus = focus && (r.from === focus || r.to === focus);
      if (isFocus) related.add(r.id);
      const color = isFocus ? typeColor(r.type) : 'rgba(126,138,158,.85)';
      out.push({
        id: r.id, coords: [a, b],
        lineStyle: {
          color: color,
          width: isFocus ? 1.5 : 1,
          opacity: focus ? (isFocus ? .95 : .07) : (total <= 60 ? .55 : .38),
          type: 'solid',
          curveness: .18
        },
        _focus: isFocus
      });
      /* 关系语义标签：只在可辨认的场景出现（焦点相关线，或全局线数量很少时） */
      if (isFocus || (!focus && total <= 40)) {
        labels.push({
          id: r.id + '-l', coords: [a, b],
          label: { show: true, position: 'middle', formatter: r.type, fontSize: 9, color: '#4d586a',
            backgroundColor: 'rgba(255,255,255,.82)', padding: [1, 3], borderRadius: 3 },
          lineStyle: { opacity: 0 }
        });
      }
    });
    return { lines: out, labels, related, total };
  }

  function nodesData(objs, focus) {
    return objs.filter(o => o.geo !== false && o.lat != null).map(o => {
      const dm = domOf(o), degree = D.relationsOf(o.id).length;
      const isFocus = focus === o.id;
      return {
        id: o.id, objId: o.id, name: o.name, domain: o.domain, value: [o.lng, o.lat],
        symbolSize: isFocus ? 12 : 8 + Math.min(4, degree * .25),
        itemStyle: { color: '#ffffff', borderColor: dm.c, borderWidth: isFocus ? 2 : 1.1 },
        label: {
          show: isFocus || degree >= 8, position: 'right', distance: 3, fontSize: 9, color: '#2b3444',
          backgroundColor: 'rgba(255,255,255,.82)', padding: [1, 3], borderRadius: 3,
          formatter: p => { const n = String(p.name || ''); return n.length > 10 ? n.slice(0, 9) + '…' : n; }
        }
      };
    });
  }
  function option(objs, rels, st) {
    const focus = focusId();
    const { lines, labels } = linesData(objs, rels, focus);
    const nodes = nodesData(objs, focus);
    const focusLines = lines.filter(l => l._focus);
    return {
      backgroundColor: 'transparent',
      geo: {
        map: 'world110', roam: false, zoom: camera.zoom, center: camera.center.slice(),
        boundingCoords: [[-170, 72], [180, -56]],
        itemStyle: { areaColor: '#eef2f8', borderColor: 'rgba(120,145,185,.5)', borderWidth: .7 },
        emphasis: { itemStyle: { areaColor: '#e2eaf6' }, label: { show: false } },
        select: { disabled: true }, label: { show: false }
      },
      tooltip: {
        trigger: 'item', backgroundColor: 'rgba(255,255,255,.97)', borderColor: 'rgba(15,23,42,.12)', borderWidth: 1,
        textStyle: { color: '#10151f', fontSize: 11 }, padding: [6, 9],
        formatter: p => {
          const sid = p.seriesId || '';
          if (sid === 'relLine') {
            const r = D.relById(p.data.id), a = D.objById(r.from), b = D.objById(r.to);
            return '<b>' + esc(r.type) + '</b><br>' + esc(a ? a.name : r.from) + ' → ' + esc(b ? b.name : r.to) +
              '<br><span style="color:#64707f">强度 ' + (r.strength * 100).toFixed(0) + '% · 置信 ' + (r.confidence * 100).toFixed(0) + '%</span>';
          }
          const o = p.data && p.data.objId ? D.objById(p.data.objId) : null;
          return o ? '<b>' + esc(o.name) + '</b><br>' + esc(domOf(o).n) : '';
        }
      },
      series: [
        { id: 'relLineGlow', type: 'lines', coordinateSystem: 'geo', silent: true, z: 2, polyline: false,
          data: focusLines.map(l => ({ id: l.id + '-g', coords: l.coords, lineStyle: { color: l.lineStyle.color, width: 4, opacity: .08, curveness: .18 } })) },
        { id: 'relLine', type: 'lines', coordinateSystem: 'geo', z: 3, polyline: false, data: lines,
          effect: { show: true, period: 7, trailLength: .12, symbol: 'circle', symbolSize: 2, color: '#5b6b82' },
          lineStyle: { curveness: .18 } },
        { id: 'relLineLabel', type: 'lines', coordinateSystem: 'geo', silent: true, z: 4, polyline: false, data: labels },
        { id: 'relNode', type: 'scatter', coordinateSystem: 'geo', data: nodes, z: 5, cursor: 'pointer' }
      ]
    };
  }

  function paintFocus() {
    const st = S.state;
    if (!chart) return;
    const objs = F.objects(st).filter(o => o.geo !== false && o.lat != null);
    const { lines, labels } = linesData(objs, F.relations(st), focusId());
    chart.setOption({
      series: [
        { id: 'relLineGlow', data: lines.filter(l => l._focus).map(l => ({ id: l.id + '-g', coords: l.coords, lineStyle: { color: l.lineStyle.color, width: 4, opacity: .08, curveness: .18 } })) },
        { id: 'relLine', data: lines },
        { id: 'relLineLabel', data: labels },
        { id: 'relNode', data: nodesData(F.objects(st), focusId()) }
      ]
    }, { lazyUpdate: true });
  }

  /* ---------- A5：右侧本体瀑布流（仅不可定位本体，无关系清单） ---------- */
  const shortFacts = o => {
    const fs = (o.factIds || []).map(id => D.factById(id)).filter(Boolean);
    return fs.slice(0, 1).map(f => f.title)[0] || '';
  };
  const recentOf = o => {
    const fs = (o.factIds || []).map(id => D.factById(id)).filter(Boolean).sort((a, b) => a.date < b.date ? 1 : -1);
    return fs.length ? fs[0].date : '';
  };
  function renderPanel(st, objs) {
    dom.side.classList.toggle('off', !st.panels.cards);
    const nogeo = objs.filter(o => o.geo === false || o.lat == null);
    const buckets = {};
    nogeo.forEach(o => (buckets[o.domain] = buckets[o.domain] || []).push(o));
    const order = D.DOMAINS.map(d => d.id).filter(k => buckets[k]);
    const ordered = [];
    for (let i = 0; ordered.length < nogeo.length; i++) order.forEach(k => { if (buckets[k][i]) ordered.push(buckets[k][i]); });
    const capped = st.rel.allCards ? ordered : ordered.slice(0, 16);
    dom.body.innerHTML = (capped.length ? '<div class="rel-grid">' + capped.map(o => {
      const dm = domOf(o);
      const kv = (o.props || []).filter(([k]) => /功能|角色|行政区|定位|锚点|单位|计价单位|状态/.test(k)).slice(0, 3)
        .map(([k, v]) => '<span class="rc-kv"><i>' + esc(k) + '</i>' + esc(String(v).slice(0, 18)) + '</span>').join('');
      const relCount = D.relationsOf(o.id).length;
      return '<button class="rel-card" data-obj="' + o.id + '" style="--rc:' + dm.c + '">' +
        '<span class="rc-top"><span class="rc-dot"></span><span class="rc-dom">' + dm.e + ' ' + esc(dm.n) + '</span></span>' +
        '<b>' + esc(o.name) + '</b>' +
        '<span class="rc-sub">' + esc(o.sub || '') + '</span>' +
        (kv ? '<span class="rc-attrs">' + kv + '</span>' : '') +
        '<span class="rc-m">' + (o.factCount ? o.factCount + ' 条支撑事实 · ' : '') + relCount + ' 条关系 · 点击展开详情</span></button>';
    }).join('') + '</div>' : '<div class="rel-empty">当前筛选下没有不可定位的本体对象</div>')
      + (ordered.length > capped.length ? '<button class="ghost sm rel-more" id="relMore">展开其余 ' + (ordered.length - capped.length) + ' 个对象</button>' : '')
      + '<div class="rel-foot">有真实地理归属的本体显示在地图上；无坐标的抽象对象（品种 / 机构 / 指标 / 人物）在此列出，不编造位置。</div>';
    const more = dom.body.querySelector('#relMore');
    if (more) more.onclick = () => S.set({ rel: { allCards: !st.rel.allCards } });
    dom.body.querySelectorAll('[data-obj]').forEach(n => n.onclick = () => openObject(n.dataset.obj));
  }

  /* ---------- 图例（F7 横向） ---------- */
  function renderLegend(st) {
    if (!window.V03Shell) return;
    if (!st.sk.legend) return window.V03Shell.setLegend('');
    const doms = D.DOMAINS.map(d => '<span class="lg-i"><i style="background:' + d.c + '"></i>' + d.n + '</span>').join('');
    const lines = ['供应流向', '行政归属', '运输经由', '影响']
      .map(t => '<span class="lg-i"><svg width="16" height="6" viewBox="0 0 16 6"><path d="M0 3h16" stroke="' + typeColor(t) + '" stroke-width="1.4" stroke-dasharray="3 2"/><circle cx="12" cy="3" r="1.4" fill="' + typeColor(t) + '"/></svg>' + t + ' 等关系线（方向由流光指示）</span>').join('');
    window.V03Shell.setLegend('<span class="lg-cat">本体对象域</span>' + doms + '<span class="lg-sep"></span>' + lines);
  }

  /* ---------- A6：抽屉内容（本体详情 / 关系详情） ---------- */
  function renderDrawer(box, d) {
    if (!box) return;
    if (d.kind === 'relation') return renderRelation(box, D.relById(d.id));
    return renderObject(box, D.objById(d.id));
  }
  function renderObject(box, o) {
    if (!o) { box.innerHTML = ''; return; }
    const dm = domOf(o);
    const rels = D.relationsOf(o.id);
    const facts = (o.factIds || []).map(id => D.factById(id)).filter(Boolean).sort((a, b) => a.date < b.date ? 1 : -1);
    box.innerHTML = `
      <div class="fd">
        <div class="fd-id">${esc(dm.n)} · ${o.geo === false ? '不可定位（右侧列出）' : '可定位'}${o.prov === 'real' ? ' · 公开登记' : ''}</div>
        <h3>${esc(o.name)}</h3>
        <div class="fd-chips fcard-mark">${dm.e} ${esc(dm.n)}${o.prov === 'real' ? ' · 公开登记' : ''}</div>

        <div class="fd-sec">
          <h4>基本属性</h4>
          <div class="kv-grid">${(o.props || []).map(([k, v]) => '<div class="kv"><span>' + esc(k) + '</span><b>' + esc(v) + '</b></div>').join('')}</div>
          ${o.geo === false ? '' : '<div class="kv"><span>坐标</span><b>' + o.lng.toFixed(2) + '°E / ' + o.lat.toFixed(2) + '°N</b></div>'}
        </div>

        <div class="fd-sec">
          <h4>来源 <small>登记与依据</small></h4>
          <p>${esc(o.note || '由公开登记与事实抽离共同确定。')}</p>
        </div>

        <div class="fd-sec">
          <h4>相关事实 <small>${facts.length} 条</small></h4>
          ${facts.slice(0, 6).map(f => '<p style="margin-bottom:4px">' + f.date + ' · ' + esc(f.title) + '</p>').join('') || '<p>暂无直接支撑事实。</p>'}
        </div>

        <div class="fd-sec">
          <h4>当前关系 <small>${rels.length} 条 · 点击查看关系详情</small></h4>
          ${rels.length ? rels.slice(0, 12).map(r => {
            const other = D.objById(r.from === o.id ? r.to : r.from);
            return '<button class="rel-row" data-rel="' + r.id + '" style="--rc:' + typeColor(r.type) + '">' +
              '<span class="rr-bar"></span>' +
              '<span class="rr-t"><b>' + esc(r.type) + '</b><i>·</i>' + esc(other ? other.name : '') + '</span>' +
              '<span class="rr-m">' + esc(o.name) + ' ' + (r.from === o.id ? '→' : '←') + ' ' + esc(other ? other.name : '') + '</span>' +
              '<span class="rr-n">强度 ' + (r.strength * 100).toFixed(0) + '% · 置信 ' + (r.confidence * 100).toFixed(0) + '%</span></button>';
          }).join('') : '<p>暂无关系记录。</p>'}
        </div>
      </div>`;
    box.querySelectorAll('[data-rel]').forEach(n => n.onclick = () => {
      const stack = S.state.rel.stack || [];
      S.set({ rel: { sel: n.dataset.rel, kind: 'relation', stack: stack.concat([{ kind: 'relation', id: n.dataset.rel }]) } });
    });
  }
  function renderRelation(box, r) {
    if (!r) { box.innerHTML = ''; return; }
    const a = D.objById(r.from), b = D.objById(r.to), fb = D.factById(r.changedBy);
    const facts = (r.factIds || []).map(id => D.factById(id)).filter(Boolean);
    box.innerHTML = `
      <div class="fd">
        <div class="fd-id">${esc(r.type)} · 形成于 ${esc(r.formed || '—')}</div>
        <h3>${esc(r.type)}</h3>
        <div class="fd-chips fcard-mark">强度 ${(r.strength * 100).toFixed(0)}% · 置信 ${(r.confidence * 100).toFixed(0)}%${r.confidence < .6 ? ' · <em>待观察</em>' : ''}</div>

        <div class="fd-sec">
          <h4>关系语义</h4>
          <p><b>${esc(a ? a.name : r.from)}</b> → <b>${esc(b ? b.name : r.to)}</b></p>
          <p>${esc(r.note || '由事实与规则生成，可回溯至支撑事实。')}</p>
        </div>

        <div class="fd-sec">
          <h4>关键字段</h4>
          <div class="kv-grid">
            <div class="kv"><span>起点本体</span><b>${esc(a ? a.name : r.from)}</b></div>
            <div class="kv"><span>终点本体</span><b>${esc(b ? b.name : r.to)}</b></div>
            <div class="kv"><span>形成时间</span><b>${esc(r.formed || '—')}</b></div>
            <div class="kv"><span>最近变化</span><b>${fb ? esc(fb.date) : '—'}</b></div>
          </div>
        </div>

        <div class="fd-sec">
          <h4>支持事实 <small>${facts.length} 条</small></h4>
          ${facts.slice(0, 6).map(f => '<p style="margin-bottom:4px">' + f.date + ' · ' + esc(f.title) + '</p>').join('') || '<p>暂无直接支撑事实。</p>'}
        </div>

        <div class="fd-sec">
          <h4>最近导致关系变化的事实</h4>
          <p>${fb ? fb.date + ' · ' + esc(fb.title) : '近期无变更记录。'}</p>
        </div>
      </div>`;
  }

  /* ---------- 更新 ---------- */
  function update() {
    if (!root) return;
    const st = S.state;
    const key = JSON.stringify([st.time, st.cred, st.q, st.relKeys, st.rel.domain, st.rel.sel, st.rel.kind,
      st.rel.allCards, st.rel.focusFact, st.carry, st.panels.cards, st.sk.legend, (st.rel.stack || []).map(x => x.id)]);
    if (key === sig) return; sig = key;
    const objs = F.objects(st), rels = F.relations(st);
    const c = ensureChart();
    if (!c) return;
    c.setOption(option(objs, rels, st), { notMerge: true });
    renderPanel(st, objs);
    renderLegend(st);
  }

  const debug = () => {
    const st = S.state, objs = F.objects(st), rels = F.relations(st);
    const mapped = objs.filter(o => o.geo !== false && o.lat != null);
    return {
      view: 'geo', nodes: objs.length, mapped: mapped.length, unmapped: objs.length - mapped.length,
      edges: rels.length, lines: rels.filter(r => { const a = D.objById(r.from), b = D.objById(r.to); return a && b && a.geo !== false && b.geo !== false; }).length,
      drawerCards: document.querySelectorAll('#relBody .rel-card').length,
      relationRows: document.querySelectorAll('#drawerStack .rel-row').length,
      domains: D.DOMAINS.length, zoom: camera.zoom, focus: focusId()
    };
  };
  return { mount, update, renderDrawer, renderDetail: renderDrawer, debug, zoomBy, zoomState };
})();
