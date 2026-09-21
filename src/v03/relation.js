/* ============================================================
   关联层（LLM-291 页面指令 二、关联层全部条目）
   A1  与事实层同一套页面框架（顶部导航 / 左侧图层菜单 / 地图主区域 / 右侧面板 / 底部流水）
   A2  分类字典为九类本体对象域（三级结构在 filter.js 的 REL_TREE）
   A3  地图上是本体节点（不是事实星点）
   A4  本体之间的关系用线表示，逐条可辨（关系清单 + 选中展开 + 独立色相）
   A5  暖色本体色系，与事实层冷色色系完全区分
   A6  非必要信息收进菜单与快捷键；A7 关系连线用流动粒子动画（Mirofish 取向）
   A8  右侧面板展示无法定位的非地理本体对象
   A9  底部流水与事实层一致（由 app.js 统一渲染「本体抽离与关联处理」日志）
   A10 本体详情弹窗；A11 关联详情弹窗
   ============================================================ */
window.V03Relation = (function () {
  const D = window.V03Data, S = window.V03Store, F = window.V03Filter;
  let root, chart, dom = {}, sig = '';
  const A = window.V03Atlas || { REGIONS: [], GATES: [] };

  const TPL = `
  <div class="rel-wrap">
    <div class="rel-main">
      <div class="rel-canvas" id="relCanvas"></div>
      <div class="rel-top">
        <div class="glassbar rel-ctx" id="relCtx"></div>
      </div>
      <div class="rel-legend" id="relLegend"></div>
      <div class="rel-tip" id="relTip"></div>
    </div>
    <aside class="rel-side" id="relSide">
      <div class="fs-meta"><b>本体对象</b><span id="relCount"></span><span class="sp"></span><span id="relNote"></span></div>
      <div class="rel-body" id="relBody"></div>
    </aside>
  </div>`;

  function mount(el) {
    root = el; root.innerHTML = TPL;
    dom = {
      canvas: root.querySelector('#relCanvas'), ctx: root.querySelector('#relCtx'), legend: root.querySelector('#relLegend'),
      tip: root.querySelector('#relTip'), side: root.querySelector('#relSide'), count: root.querySelector('#relCount'),
      note: root.querySelector('#relNote'), body: root.querySelector('#relBody')
    };
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
      if (p.dataType === 'edge' || (p.seriesId || '').startsWith('relLine') || (p.seriesId || '').startsWith('relSpoke')) {
        const r = D.relById(p.data && p.data.id);
        if (r) return S.set({ rel: { sel: r.id, kind: 'relation' } });
      }
      if (p.data && p.data.objId) return S.set({ rel: { sel: p.data.objId, kind: 'object' } });
      if (p.dataType === 'node' && p.data && p.data.id) return S.set({ rel: { sel: p.data.id, kind: 'object' } });
    });
    return chart;
  }

  /* ---------- 色彩：暖色本体色系 + 关系类型独立色相（与事实层冷色系完全区分） ---------- */
  const WARM_HUES = [28, 38, 48, 18, 62, 86, 320, 5, 72, 96];
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return Math.abs(h); };
  const relColor = type => 'hsl(' + WARM_HUES[hash(type) % WARM_HUES.length] + ',82%,63%)';
  const domColor = o => (D.domain(o.domain) || {}).c || '#f59e0b';

  const carriedObjects = st => {
    const s = new Set();
    (st.carry || []).forEach(id => { const f = D.factById(id); if (f) (f.objects || []).forEach(o => s.add(o)); });
    return s;
  };
  const degree = (rels, id) => rels.filter(r => r.from === id || r.to === id).length;

  /* ---------- 地图：本体节点 + 流动关系线（A3/A4/A7） ---------- */
  function option(objs, rels, st) {
    const carried = carriedObjects(st);
    const selectedId = st.rel.sel;
    const selObj = selectedId && st.rel.kind !== 'relation' ? D.objById(selectedId) : null;
    const selRel = selectedId && st.rel.kind === 'relation' ? D.relById(selectedId) : null;
    const geoObjs = objs.filter(o => o.geo !== false && o.lat != null);
    const pos = {}; geoObjs.forEach(o => { pos[o.id] = [o.lng, o.lat]; });
    const showAll = st.rel.showAll !== false;

    const typeOf = r => relColor(r.type);
    const lines = [], glow = [];
    rels.forEach(r => {
      const a = pos[r.from], b = pos[r.to];
      if (!a || !b) return;
      const hi = (selRel && selRel.id === r.id) || (selectedId && (r.from === selectedId || r.to === selectedId));
      const on = showAll || hi;
      const item = {
        id: r.id, objId: null, type: r.type, coords: [a, b],
        weight: hi ? 1 : 0,
        lineStyle: {
          color: hi ? '#fff' : typeOf(r), width: hi ? 3.4 : (.7 + r.strength * 2.6),
          opacity: on ? (r.confidence < .6 ? .5 : .82) : .18,
          type: r.confidence < .6 ? 'dashed' : 'solid', curveness: .22
        }
      };
      lines.push(item);
      if (on && r.confidence >= .6) glow.push({ id: r.id + ':g', coords: [a, b], lineStyle: { color: typeOf(r), width: (.7 + r.strength * 2.6) * 3.4, opacity: .1, curveness: .22 } });
    });

    /* 选中节点的非地理本体：以「卫星支线 + 卫星点」表现，不伪造地理坐标（A8 与 A4） */
    const spokes = [], sats = [];
    if (selectedId && st.rel.kind !== 'relation') {
      D.relationsOf(selectedId).forEach((r, i) => {
        const other = D.objById(r.from === selectedId ? r.to : r.from);
        const anchor = pos[selectedId] || (selObj && selObj.lat != null ? [selObj.lng, selObj.lat] : null);
        if (!other || other.geo !== false || !anchor) return;
        const ang = (i / 6) * Math.PI * 2 + .4;
        const end = [anchor[0] + Math.cos(ang) * 7, anchor[1] + Math.sin(ang) * 5];
        spokes.push({ id: r.id, coords: [anchor, end], lineStyle: { color: typeOf(r), width: 1.6, opacity: .85, curveness: .16, type: 'dashed' } });
        sats.push({ id: other.id, objId: other.id, name: other.name, value: end, symbolSize: 9,
          itemStyle: { color: domColor(other), borderColor: '#08101f', borderWidth: 1 },
          label: { show: true, position: 'right', distance: 4, fontSize: 9.5, color: 'hsl(' + WARM_HUES[hash(other.domain) % WARM_HUES.length] + ',85%,72%)', formatter: p => String(p.name || '') } });
      });
    }

    const nodes = geoObjs.map(o => {
      const deg = degree(rels, o.id), isCarried = carried.has(o.id), isSel = o.id === selectedId;
      return {
        id: o.id, objId: o.id, name: o.name, domain: o.domain, value: [o.lng, o.lat],
        symbolSize: 8 + Math.min(16, deg * 1.7) + (isSel ? 6 : 0),
        itemStyle: { color: domColor(o), borderColor: isSel ? '#fff' : isCarried ? '#4ade80' : '#08101f',
          borderWidth: isSel ? 2.6 : isCarried ? 2 : 1, shadowBlur: isSel ? 20 : 8, shadowColor: domColor(o) },
        /* 必须显式给 formatter：echarts 对 geo scatter 的默认标签会落到 value 上（渲染成经纬度） */
        label: { show: geoObjs.length <= 60 || deg >= 8 || isSel || isCarried, position: 'right', distance: 4, fontSize: 9.5,
          color: 'rgba(255,240,214,.92)',
          formatter: p => { const n = String(p.name || ''); return n.length > 12 ? n.slice(0, 11) + '…' : n; } }
      };
    });

    return {
      backgroundColor: 'transparent',
      geo: {
        map: 'world110', roam: false, zoom: 1.06, center: [30, 8], boundingCoords: [[-170, 72], [180, -56]],
        itemStyle: { areaColor: '#141d31', borderColor: 'rgba(215,170,120,.28)', borderWidth: .7 },
        emphasis: { itemStyle: { areaColor: '#1d2942' }, label: { show: false } },
        select: { disabled: true }, label: { show: false }
      },
      tooltip: {
        trigger: 'item', backgroundColor: 'rgba(20,12,6,.94)', borderColor: 'rgba(255,200,130,.25)', borderWidth: 1,
        textStyle: { color: '#ffe9cc', fontSize: 11.5 }, padding: [7, 10],
        formatter: p => {
          if (p.data && p.data.id && D.relById(p.data.id)) {
            const r = D.relById(p.data.id), a = D.objById(r.from), b = D.objById(r.to);
            return '<b>' + r.type + '</b><br>' + (a ? a.name : r.from) + ' → ' + (b ? b.name : r.to) +
              '<br><span style="opacity:.75">强度 ' + (r.strength * 100).toFixed(0) + '% · 置信 ' + (r.confidence * 100).toFixed(0) + '%</span>';
          }
          const o = p.data && p.data.objId ? D.objById(p.data.objId) : null;
          return o ? '<b>' + o.name + '</b><br>' + (D.domain(o.domain) || {}).n + ' · ' + degree(rels, o.id) + ' 条关系' : '';
        }
      },
      series: [
        { id: 'relGlow', type: 'lines', coordinateSystem: 'geo', data: glow, z: 2, silent: true, polyline: false },
        { id: 'relLine', type: 'lines', coordinateSystem: 'geo', data: lines, z: 3, polyline: false,
          effect: { show: true, period: 4.2, trailLength: .32, symbol: 'circle', symbolSize: 3.2, color: '#fff' },
          lineStyle: { curveness: .22 } },
        { id: 'relSpoke', type: 'lines', coordinateSystem: 'geo', data: spokes, z: 6, silent: true, polyline: false },
        { id: 'relNode', type: 'scatter', coordinateSystem: 'geo', data: nodes, z: 7, cursor: 'pointer' },
        { id: 'relSat', type: 'scatter', coordinateSystem: 'geo', data: sats, z: 8, cursor: 'pointer' }
      ]
    };
  }

  /* ---------- 右侧面板：非地理本体卡片 + 关系清单（A4 / A8） ---------- */
  const chip = (t, c) => '<span class="chip ' + (c || '') + '">' + t + '</span>';

  function relRows(rels, st) {
    return rels.map(r => {
      const a = D.objById(r.from), b = D.objById(r.to);
      const on = st.rel.sel === r.id;
      return '<button class="rel-row' + (on ? ' on' : '') + '" data-rel="' + r.id + '" style="--rc:' + relColor(r.type) + '">' +
        '<span class="rr-bar"></span>' +
        '<span class="rr-t"><b>' + (a ? a.name : r.from) + '</b><i>→</i><b>' + (b ? b.name : r.to) + '</b></span>' +
        '<span class="rr-m">' + r.type + '</span>' +
        '<span class="rr-n">强度 ' + (r.strength * 100).toFixed(0) + '% · 置信 ' + (r.confidence * 100).toFixed(0) + '%</span>' +
        (r.confidence < .6 ? '<span class="rr-w">待观察</span>' : '') + '</button>';
    }).join('');
  }

  function renderPanel(st, objs, rels) {
    const nogeo = objs.filter(o => o.geo === false);
    const carried = carriedObjects(st);
    dom.count.textContent = objs.length + ' 个对象 · ' + rels.length + ' 条关系';
    dom.note.textContent = (st.rel.domain === 'all' ? '全部对象域' : (D.domain(st.rel.domain) || {}).n) +
      (st.rel.onlyCarry ? ' · 仅携带事实相关' : '');
    /* 非地理本体按对象域轮转排序：首屏 12 张即可覆盖九个对象域（含人物角色 Person） */
    const ordered = (() => {
      const buckets = {};
      nogeo.forEach(o => (buckets[o.domain] = buckets[o.domain] || []).push(o));
      const order = D.DOMAINS.map(d => d.id).filter(k => buckets[k]);
      const out = [];
      for (let i = 0; out.length < nogeo.length; i++) order.forEach(k => { if (buckets[k][i]) out.push(buckets[k][i]); });
      return out;
    })();
    const capped = st.rel.allCards ? ordered : ordered.slice(0, 12);
    dom.body.innerHTML = `
      <section class="rel-sec">
        <div class="rel-sec-h">关联关系清单 <small>${rels.length} 条 · 点一条在地图上高亮</small></div>
        <div class="rel-rows">${rels.length ? relRows(rels, st) : '<div class="empty">当前筛选下没有关系。</div>'}</div>
      </section>
      <section class="rel-sec">
        <div class="rel-sec-h">非地理本体对象 <small>${nogeo.length} 个 · 不在地图上虚拟点位</small></div>
        <div class="rel-grid">${capped.length ? capped.map(o => {
          const fs = D.factsOfObject(o.id).length, rs = D.relationsOf(o.id).length;
          return `<button class="rel-card${carried.has(o.id) ? ' carried' : ''}" data-obj="${o.id}" style="--rc:${domColor(o)}">
            <span class="rc-top"><span class="rc-dot"></span><span class="rc-dom">${(D.domain(o.domain) || {}).e || ''} ${(D.domain(o.domain) || {}).n}</span></span>
            <b>${o.name}</b>
            <span class="rc-sub">${o.sub}</span>
            <span class="rc-m">${rs} 条关系 · ${fs} 条支撑事实</span></button>`;
        }).join('') : '<div class="empty" style="grid-column:1/-1">当前筛选下没有非地理本体对象。</div>'}</div>
        ${nogeo.length > capped.length ? `<button class="ghost sm" id="relMore" style="margin-top:7px">展开全部 ${nogeo.length} 个非地理本体</button>` : (st.rel.allCards && nogeo.length > 12 ? '<button class="ghost sm" id="relMore" style="margin-top:7px">收起</button>' : '')}
      </section>
      <div class="rel-foot">本体抽离、关系建立与打分由规则与评分机制自动完成；置信度低于 0.6 的关系标记「待观察」，不进入推演种子。</div>`;

    const more = dom.body.querySelector('#relMore');
    if (more) more.onclick = () => S.set({ rel: { allCards: !st.rel.allCards } });
    dom.body.querySelectorAll('[data-obj]').forEach(n => n.onclick = () => S.set({ rel: { sel: n.dataset.obj, kind: 'object' } }));
    dom.body.querySelectorAll('[data-rel]').forEach(n => n.onclick = () => S.set({ rel: { sel: n.dataset.rel, kind: 'relation' } }));
  }

  /* ---------- 覆盖层：携带上下文 / 图例 ---------- */
  function renderChrome(st, objs, rels) {
    const fb = st.rel.focusFact ? D.factById(st.rel.focusFact) : null;
    const bits = [];
    if ((st.carry || []).length) bits.push('<span>已携带 <b>' + st.carry.length + '</b> 条事实</span>' +
      '<button data-act="only">' + (st.rel.onlyCarry ? '显示全部' : '只看相关') + '</button><button data-act="clear">清除携带</button>');
    if (fb) bits.push('<span>来自事实：<b>' + fb.short + '</b> · ' + fb.date + '</span><button data-act="clearFact">清除上下文</button>');
    if (st.rel.sel) bits.push('<span>已选：<b>' + ((st.rel.kind === 'relation' ? (D.relById(st.rel.sel) || {}).type : (D.objById(st.rel.sel) || {}).name) || '') + '</b></span><button data-act="clearSel">取消选择</button>');
    dom.ctx.innerHTML = bits.length ? bits.join('') : '<span class="muted">点地图上的本体节点看详情 · 点关系线看关联详情 · 右侧清单可逐条定位</span>';
    const only = dom.ctx.querySelector('[data-act="only"]'); if (only) only.onclick = () => S.set({ rel: { onlyCarry: !st.rel.onlyCarry } });
    const clr = dom.ctx.querySelector('[data-act="clear"]'); if (clr) clr.onclick = () => S.set({ carry: [], rel: { onlyCarry: false, focusFact: null } });
    const clrF = dom.ctx.querySelector('[data-act="clearFact"]'); if (clrF) clrF.onclick = () => S.set({ rel: { focusFact: null } });
    const clrS = dom.ctx.querySelector('[data-act="clearSel"]'); if (clrS) clrS.onclick = () => S.set({ rel: { sel: null, kind: null } });

    dom.legend.style.display = st.sk.legend ? '' : 'none';
    if (!st.sk.legend) return;
    dom.legend.innerHTML = '<span class="lg-t">本体类型图例（暖色）</span>' +
      D.DOMAINS.map(d => '<span class="lg-i"><i style="background:' + d.c + '"></i>' + d.e + ' ' + d.n + (d.geo === false ? ' <em>无坐标</em>' : '') + '</span>').join('') +
      '<span class="lg-i"><span class="ln"></span>流动线 = 关系（色相按关系类型）</span>' +
      '<span class="lg-i"><span class="ln dash"></span>虚线 = 低置信（待观察）</span>';
    dom.tip.innerHTML = '<b>' + objs.filter(o => o.geo !== false).length + '</b> 个可定位本体 · <b>' +
      rels.filter(r => { const a = D.objById(r.from), b = D.objById(r.to); return a && b && a.geo !== false && b.geo !== false; }).length +
      '</b> 条线上关系 · <b>' + objs.filter(o => o.geo === false).length + '</b> 个非地理本体在右侧面板';
  }

  /* ---------- 详情弹窗（A10 本体 / A11 关联） ---------- */
  function renderDetail(wrap) {
    const st = S.state, sel = st.rel.sel;
    if (!sel) { wrap.innerHTML = ''; return; }
    if (st.rel.kind === 'relation') return renderRelationDetail(wrap, D.relById(sel));
    return renderObjectDetail(wrap, D.objById(sel));
  }

  function renderObjectDetail(wrap, o) {
    if (!o) { wrap.innerHTML = ''; return; }
    const st = S.state;
    const dm = D.domain(o.domain) || {};
    const facts = D.factsOfObject(o.id).filter(f => D.inWindow(f.date, st.time === 'all' ? 'all' : st.time));
    const allFacts = D.factsOfObject(o.id);
    const rels = D.relationsOf(o.id);
    const timeline = allFacts.slice().sort((a, b) => a.date < b.date ? -1 : 1).slice(-6);
    wrap.innerHTML = `
      <div class="fd-h"><div style="flex:1">
        <h3><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${dm.c};margin-right:7px"></span>${o.name}</h3>
        <div class="fd-id">${o.id} · ${dm.e || ''} ${dm.n} · ${o.geo === false ? '非地理本体（不在地图定位）' : '可定位本体'}</div>
      </div></div>
      <div class="fd-chips">${chip(dm.n)}${chip(o.geo === false ? '无坐标' : '坐标 ' + o.lng.toFixed(2) + '°E / ' + o.lat.toFixed(2) + '°N')}${chip(rels.length + ' 条关系')}${chip(allFacts.length + ' 条支撑事实')}</div>
      <div class="fd-grid">
        <div class="fd-col">
          <div class="fd-sec"><h4>对象说明 <small>${o.sub}</small></h4><p>${o.sub}。本体对象由事实抽离而来，关系与打分自动完成，不设人工审核入口。</p></div>
          <div class="fd-sec"><h4>关联关系 <small>${rels.length} 条 · 点击看关联详情</small></h4>
            ${rels.length ? rels.map(r => { const other = r.from === o.id ? D.objById(r.to) : D.objById(r.from); const on = st.rel.sel === r.id;
              return `<button class="rel-row${on ? ' on' : ''}" data-rel="${r.id}" style="--rc:${relColor(r.type)}">
                <span class="rr-bar"></span><span class="rr-t"><b>${r.type}</b><i>·</i>${other ? other.name : ''}</span>
                <span class="rr-n">强度 ${(r.strength * 100).toFixed(0)}% · 置信 ${(r.confidence * 100).toFixed(0)}%</span></button>`; }).join('')
            : '<p>暂无关系记录。</p>'}
          </div>
          <div class="fd-sec"><h4>时序记忆 <small>最近 ${timeline.length} 次变更</small></h4>
            <div class="rel-tl">${timeline.map(f => `<div class="it"><small>${f.date}</small><div><span class="rel-link" data-fact="${f.id}">${f.title}</span></div></div>`).join('') || '<div class="it"><small>—</small><div>暂无支撑事实</div></div>'}</div>
          </div>
        </div>
        <div class="fd-col">
          <div class="fd-sec"><h4>对象属性</h4>
            <div class="kv-grid">
              <div class="kv"><span>对象域</span><b>${dm.n}</b></div>
              <div class="kv"><span>定位</span><b>${o.geo === false ? '无坐标' : '可定位'}</b></div>
              ${(o.props || []).map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`).join('')}
            </div>
          </div>
          <div class="fd-sec"><h4>支撑事实 <small>当前时间范围 ${facts.length} 条 / 全部 ${allFacts.length} 条</small></h4>
            ${(facts.length ? facts : allFacts).slice(0, 6).map(f => `<p style="margin-bottom:5px"><span class="rel-link" data-fact="${f.id}">${f.date} · ${f.title}</span></p>`).join('') || '<p>暂无支撑事实。</p>'}
          </div>
          <div class="fd-actions">
            <button class="btn sec" id="objFocus">在地图上定位</button>
            <button class="btn ter" id="objRel">查看全部关系（${rels.length}）</button>
          </div>
        </div>
      </div>`;
    wrap.querySelectorAll('[data-rel]').forEach(n => n.onclick = () => S.set({ rel: { sel: n.dataset.rel, kind: 'relation' } }));
    wrap.querySelectorAll('[data-fact]').forEach(n => n.onclick = () => S.set({ tab: 'fact', factId: n.dataset.fact }));
    const focus = wrap.querySelector('#objFocus');
    if (focus) focus.onclick = () => { S.emit('toast', o.geo === false ? '该本体对象没有地理坐标，统一在右侧面板呈现' : '已在地图高亮：' + o.name); S.set({ rel: { sel: o.id, kind: 'object' } }); };
    const rl = wrap.querySelector('#objRel');
    if (rl) rl.onclick = () => S.set({ rel: { sel: rels[0] ? rels[0].id : null, kind: rels[0] ? 'relation' : null } });
  }

  function renderRelationDetail(wrap, r) {
    if (!r) { wrap.innerHTML = ''; return; }
    const a = D.objById(r.from), b = D.objById(r.to), fb = D.factById(r.changedBy);
    const facts = D.factsFor(r.factIds || []);
    const t0 = Date.parse((r.formed || '2026-01') + '-01T00:00:00Z');
    const span = Math.max(1, Date.parse(D.TODAY + 'T00:00:00Z') - t0);
    const age = Math.round((Date.now() - t0) / 86400000);
    const tl = [{ d: r.formed, t: '关系形成', x: '由本体抽离与规则评分建立' }]
      .concat(facts.filter(f => f.date >= (r.formed || '')).sort((x, y) => x.date < y.date ? -1 : 1)
        .map(f => ({ d: f.date, t: '由事实变更', x: f.title, id: f.id })));
    wrap.innerHTML = `
      <div class="fd-h"><div style="flex:1">
        <h3>${r.type}</h3>
        <div class="fd-id">${r.id} · ${a ? a.name : r.from} → ${b ? b.name : r.to}</div>
      </div></div>
      <div class="fd-chips">${chip('置信 ' + (r.confidence * 100).toFixed(0) + '%', r.confidence < .6 ? 'mid' : 'hi')}${chip('强度 ' + (r.strength * 100).toFixed(0) + '%')}${chip('形成 ' + r.formed)}${r.confidence < .6 ? chip('待观察', 'mid') : chip('已过阈值', 'hi')}</div>
      <div class="fd-grid">
        <div class="fd-col">
          <div class="fd-sec"><h4>关系说明</h4><p>${r.note || '由事实与规则自动建立并打分。'}</p></div>
          <div class="fd-sec"><h4>时序记忆 <small>从形成时间到最近变更</small></h4>
            <div class="rel-tl">${tl.map(x => `<div class="it"><small>${x.d}</small><div>${x.t}：${x.id ? '<span class="rel-link" data-fact="' + x.id + '">' + x.x + '</span>' : x.x}</div></div>`).join('')}</div>
          </div>
          <div class="fd-sec"><h4>支撑事实 <small>${facts.length} 条</small></h4>
            ${facts.map(f => `<p style="margin-bottom:5px"><span class="rel-link" data-fact="${f.id}">${f.date} · ${f.title}</span></p>`).join('') || '<p>本条关系来自规则推断，暂无直接支撑事实。</p>'}
          </div>
        </div>
        <div class="fd-col">
          <div class="fd-sec"><h4>关系强度</h4>
            <div class="rel-bar"><i style="width:${(r.strength * 100).toFixed(0)}%"></i></div>
            <div class="kv"><span>强度</span><b>${(r.strength * 100).toFixed(0)}%</b></div>
            <div class="rel-bar c" style="margin-top:6px"><i style="width:${(r.confidence * 100).toFixed(0)}%"></i></div>
            <div class="kv"><span>置信度</span><b>${(r.confidence * 100).toFixed(0)}%</b></div>
          </div>
          <div class="fd-sec"><h4>关键字段</h4>
            <div class="kv-grid">
              <div class="kv"><span>起点</span><b>${a ? a.name : r.from}</b></div>
              <div class="kv"><span>终点</span><b>${b ? b.name : r.to}</b></div>
              <div class="kv"><span>形成时间</span><b>${r.formed}</b></div>
              <div class="kv"><span>已持续</span><b>${age} 天</b></div>
              <div class="kv"><span>最近变更</span><b>${fb ? fb.short + ' · ' + fb.date : '无'}</b></div>
              <div class="kv"><span>支撑事实</span><b>${facts.length} 条</b></div>
            </div>
          </div>
          <div class="fd-actions">
            <button class="btn sec" id="relFrom">查看起点本体</button>
            <button class="btn sec" id="relTo">查看终点本体</button>
          </div>
          <div class="fd-sec" style="margin-top:9px"><h4>地图呈现</h4><p>两端本体均可定位时，地图上以流动粒子线表示（粗细 = 强度，虚线 = 低置信）；任一端为非地理本体时，以选中节点的虚线支线表示，不虚拟地理坐标。</p></div>
        </div>
      </div>`;
    wrap.querySelectorAll('[data-fact]').forEach(n => n.onclick = () => S.set({ tab: 'fact', factId: n.dataset.fact }));
    const f1 = wrap.querySelector('#relFrom'); if (f1) f1.onclick = () => S.set({ rel: { sel: r.from, kind: 'object' } });
    const f2 = wrap.querySelector('#relTo'); if (f2) f2.onclick = () => S.set({ rel: { sel: r.to, kind: 'object' } });
  }

  /* ---------- 主更新 ---------- */
  function update() {
    if (!root) return;
    const st = S.state;
    const key = JSON.stringify([st.time, st.cred, st.q, st.relKeys, st.rel.domain, st.rel.sel, st.rel.kind,
      st.rel.onlyCarry, st.rel.focusFact, st.rel.allCards, st.carry, st.panels.cards, st.sk.legend, st.sk.live]);
    if (key === sig) return; sig = key;
    dom.side.classList.toggle('off', !st.panels.cards);
    const objs = F.objects(st), rels = F.relations(st);
    const c = ensureChart();
    if (!c) return;
    c.setOption(option(objs, rels, st), { notMerge: true });
    renderChrome(st, objs, rels);
    renderPanel(st, objs, rels);
  }

  const communities = (objs, rels) => {
    const adj = {}; objs.forEach(o => { adj[o.id] = []; });
    rels.forEach(r => { if (adj[r.from] && adj[r.to]) { adj[r.from].push(r.to); adj[r.to].push(r.from); } });
    const seen = new Set(), out = [];
    objs.forEach(o => {
      if (seen.has(o.id)) return;
      const stack = [o.id], comp = [];
      while (stack.length) { const id = stack.pop(); if (seen.has(id)) continue; seen.add(id); comp.push(id); (adj[id] || []).forEach(n => { if (!seen.has(n)) stack.push(n); }); }
      if (comp.length >= 2) out.push(comp);
    });
    return out.sort((a, b) => b.length - a.length);
  };

  const debug = () => {
    const st = S.state, objs = F.objects(st), rels = F.relations(st);
    const geoObjs = objs.filter(o => o.geo !== false && o.lat != null);
    const online = rels.filter(r => { const a = D.objById(r.from), b = D.objById(r.to); return a && b && a.geo !== false && b.geo !== false; });
    return {
      view: 'geo', domain: st.rel.domain, sel: st.rel.sel, kind: st.rel.kind,
      nodes: objs.length, edges: rels.length, mapped: geoObjs.length, unmapped: objs.filter(o => o.geo === false).length,
      lines: online.length, communities: communities(objs, rels).length,
      graphNodes: geoObjs.length,
      legend: st.sk.legend,
      spokes: st.rel.sel && st.rel.kind !== 'relation' ? D.relationsOf(st.rel.sel).filter(r => { const o = D.objById(r.from === st.rel.sel ? r.to : r.from); return o && o.geo === false; }).length : 0,
      rows: document.querySelectorAll('#relBody .rel-row').length,
      cards: document.querySelectorAll('#relBody .rel-card').length,
      seriesCount: chart && chart.getOption() ? chart.getOption().series.length : 0
    };
  };

  return { mount, update, renderDetail, debug, communities };
})();
