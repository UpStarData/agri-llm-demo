/* ============================================================
   关联层：本体对象 / 关系 / 时序记忆 / 社区摘要
   双视图：关系图谱（力导向） 与 地理关联（地图，无坐标对象不伪造点位）
   本体抽离、关系建立与打分自动完成 —— 不设人工审核入口
   ============================================================ */
window.V03Relation = (function () {
  const D = window.V03Data, S = window.V03Store, F = window.V03Filter;
  let root, chart, dom = {}, sig = '';

  const TPL = `
  <div class="rel-wrap">
    <div class="rel-main">
      <div class="rel-canvas" id="relCanvas"></div>
      <div class="rel-top">
        <div class="rel-seg" role="group" aria-label="关联层视图">
          <button data-view="graph">关系图谱</button>
          <button data-view="geo">地理关联</button>
        </div>
        <div id="relCtx"></div>
      </div>
      <div class="rel-nogeo" id="relNogeo"></div>
      <div class="rel-legend" id="relLegend"></div>
    </div>
    <aside class="rel-side" id="relSide">
      <div class="fs-head"><b id="relTitle">对象清单</b><span class="n" id="relCount"></span><span class="sp"></span>
        <button class="ghost sm" id="relBack" hidden>← 返回清单</button></div>
      <div class="rel-body" id="relBody"></div>
    </aside>
  </div>`;

  function mount(el) {
    root = el; root.innerHTML = TPL;
    dom = {
      canvas: root.querySelector('#relCanvas'), ctx: root.querySelector('#relCtx'), nogeo: root.querySelector('#relNogeo'),
      legend: root.querySelector('#relLegend'), side: root.querySelector('#relSide'), title: root.querySelector('#relTitle'),
      count: root.querySelector('#relCount'), body: root.querySelector('#relBody'), back: root.querySelector('#relBack')
    };
    dom.back.onclick = () => S.set({ rel: { sel: null, kind: null } });
    root.querySelectorAll('[data-view]').forEach(b => b.onclick = () => S.set({ rel: { view: b.dataset.view, sel: null, kind: null } }));
    window.addEventListener('resize', () => chart && chart.resize());
  }

  function ensureChart() {
    if (chart) return chart;
    if (!dom.canvas || !window.echarts) return null;
    if (window.__CHINA_GEO && !echarts.getMap('china')) { try { echarts.registerMap('china', window.__CHINA_GEO); } catch (e) { console.error(e); } }
    chart = echarts.init(dom.canvas);
    chart.on('click', p => {
      if (p.dataType === 'node' && p.data && p.data.id) S.set({ rel: { sel: p.data.id, kind: 'object' } });
      else if (p.dataType === 'edge' && p.data && p.data.id) S.set({ rel: { sel: p.data.id, kind: 'relation' } });
      else if (p.seriesId === 'geoObj' && p.data && p.data.id) S.set({ rel: { sel: p.data.id, kind: 'object' } });
    });
    return chart;
  }

  const carriedObjects = st => {
    const s = new Set();
    (st.carry || []).forEach(id => { const f = D.factById(id); if (f) f.objects.forEach(o => s.add(o)); });
    return s;
  };

  /* ---------- 图谱 / 地图 ---------- */
  function graphOption(objs, rels, st) {
    const carried = carriedObjects(st);
    const deg = {};
    rels.forEach(r => { deg[r.from] = (deg[r.from] || 0) + 1; deg[r.to] = (deg[r.to] || 0) + 1; });
    const focus = st.rel.focusFact ? new Set(D.factsFor([st.rel.focusFact])[0].objects) : null;
    return {
      tooltip: {
        backgroundColor: 'rgba(255,255,255,.97)', borderColor: 'rgba(15,23,42,.12)', textStyle: { color: '#10151f', fontSize: 12 },
        formatter: p => p.dataType === 'edge'
          ? '<b>' + (p.data.type || '关系') + '</b><br>强度 ' + (p.data.strength * 100).toFixed(0) + '% · 置信 ' + (p.data.confidence * 100).toFixed(0) + '%'
          : (p.data.sub || '') + '<br><span style="color:#64707f">' + D.domain(p.data.domain).n + (p.data.geo ? '' : ' · 无坐标') + '</span>'
      },
      series: [{
        id: 'graph', type: 'graph', layout: 'force', roam: true, draggable: true, top: 96, bottom: 26, left: 20, right: 20,
        categories: D.DOMAINS.map(d => ({ name: d.n, itemStyle: { color: d.c } })),
        force: { repulsion: objs.length > 16 ? 260 : 200, edgeLength: [80, 165], gravity: .14, friction: .28 },
        emphasis: { focus: 'adjacency', label: { show: true, fontWeight: 600 } },
        label: { show: objs.length <= 26, position: 'bottom', distance: 4, fontSize: 10, color: '#334155', formatter: p => p.name.length > 10 ? p.name.slice(0, 9) + '…' : p.name },
        data: objs.map(o => {
          const isCarried = carried.has(o.id), isFocus = focus && focus.has(o.id);
          return {
            id: o.id, name: o.name, sub: o.sub, domain: o.domain, geo: o.geo, category: D.DOMAINS.findIndex(d => d.id === o.domain),
            symbolSize: 13 + Math.min(20, (deg[o.id] || 0) * 2.6),
            itemStyle: {
              borderColor: isCarried ? '#16a34a' : isFocus ? '#1d4ed8' : '#fff', borderWidth: isCarried || isFocus ? 2.6 : 1.2,
              shadowBlur: isCarried ? 10 : 0, shadowColor: 'rgba(22,163,74,.5)'
            }
          };
        }),
        links: rels.map(r => ({
          id: r.id, source: r.from, target: r.to, type: r.type, strength: r.strength, confidence: r.confidence,
          lineStyle: {
            width: 1 + r.strength * 3.2,
            type: r.confidence < 0.6 ? 'dashed' : 'solid',
            color: r.confidence < 0.6 ? '#c7ccd6' : r._carried ? '#16a34a' : '#8aa2c8',
            opacity: r.confidence < 0.6 ? 0.55 : 0.8, curveness: .08
          }
        }))
      }]
    };
  }

  function geoOption(objs, rels, st) {
    const carried = carriedObjects(st);
    const geoObjs = objs.filter(o => o.geo !== false && o.lat != null);
    const color = o => D.domain(o.domain).c;
    const points = geoObjs.map(o => ({
      id: o.id, name: o.name, domain: o.domain, value: [o.lng, o.lat],
      symbolSize: 11 + Math.min(14, D.relationsOf(o.id).length * 2.2),
      itemStyle: { color: color(o), borderColor: carried.has(o.id) ? '#16a34a' : '#fff', borderWidth: carried.has(o.id) ? 2.6 : 1.2 }
    }));
    /* 有坐标的关系用连线表示（地理关联视图） */
    const lines = rels.filter(r => { const a = D.objById(r.from), b = D.objById(r.to); return a && b && a.geo !== false && b.geo !== false; })
      .map(r => {
        const a = D.objById(r.from), b = D.objById(r.to);
        return { id: r.id, coords: [[a.lng, a.lat], [b.lng, b.lat]], type: r.type, strength: r.strength, confidence: r.confidence,
          lineStyle: { width: .8 + r.strength * 3, opacity: r.confidence < 0.6 ? .3 : .5, color: r.confidence < 0.6 ? '#c7ccd6' : '#8aa2c8', curveness: .18, type: r.confidence < 0.6 ? 'dashed' : 'solid' } };
      });
    return {
      geo: {
        map: 'china', roam: false, zoom: 1.2, center: [104.5, 34.5], label: { show: false },
        itemStyle: { areaColor: '#eef3fa', borderColor: 'rgba(120,145,185,.5)', borderWidth: .7 }, emphasis: { itemStyle: { areaColor: '#dfeafc' } }, select: { disabled: true }
      },
      tooltip: {
        backgroundColor: 'rgba(255,255,255,.97)', borderColor: 'rgba(15,23,42,.12)', textStyle: { color: '#10151f', fontSize: 12 },
        formatter: p => p.seriesId === 'geoLine'
          ? '<b>' + p.data.type + '</b><br>强度 ' + (p.data.strength * 100).toFixed(0) + '% · 置信 ' + (p.data.confidence * 100).toFixed(0) + '%'
          : '<b>' + p.name + '</b><br>' + D.domain(p.data.domain).n
      },
      series: [
        { id: 'geoLine', type: 'lines', coordinateSystem: 'geo', data: lines, z: 3, silent: false, effect: { show: false } },
        { id: 'geoObj', type: 'scatter', coordinateSystem: 'geo', data: points, z: 6, symbol: 'circle',
          label: { show: true, position: 'bottom', distance: 3, fontSize: 10, color: '#334155', formatter: p => p.name.length > 8 ? p.name.slice(0, 7) + '…' : p.name } }
      ]
    };
  }

  /* ---------- 社区摘要（由当前过滤后的关系图算出连通社区） ---------- */
  function communities(objs, rels) {
    const idx = {}, adj = {};
    objs.forEach(o => { adj[o.id] = []; });
    rels.forEach(r => { if (adj[r.from] && adj[r.to]) { adj[r.from].push(r.to); adj[r.to].push(r.from); } });
    const seen = new Set(), out = [];
    objs.forEach(o => {
      if (seen.has(o.id)) return;
      const stack = [o.id], comp = [];
      while (stack.length) {
        const id = stack.pop();
        if (seen.has(id)) continue;
        seen.add(id); comp.push(id);
        (adj[id] || []).forEach(n => { if (!seen.has(n)) stack.push(n); });
      }
      if (comp.length >= 2) out.push(comp);
    });
    return out.sort((a, b) => b.length - a.length).slice(0, 4).map((comp, i) => {
      const doms = {};
      comp.forEach(id => { const o = D.objById(id); doms[o.domain] = (doms[o.domain] || 0) + 1; });
      const main = Object.keys(doms).sort((a, b) => doms[b] - doms[a]).slice(0, 2).map(d => D.domain(d).n);
      const facts = new Set();
      comp.forEach(id => D.factsOfObject(id).forEach(f => facts.add(f.id)));
      return { i: i + 1, size: comp.length, main, facts: facts.size, sample: comp.slice(0, 3).map(id => D.objById(id).name) };
    });
  }

  /* ---------- 右侧：清单 / 对象详情 / 关系详情 ---------- */
  const domName = id => D.domain(id).n;

  function renderList(st, objs, rels) {
    dom.back.hidden = true;
    dom.title.textContent = '对象清单';
    dom.count.textContent = objs.length + ' 个对象 · ' + rels.length + ' 条关系';
    const comm = communities(objs, rels);
    const carried = carriedObjects(st);
    const onlyCarry = st.rel.onlyCarry;
    let list = objs;
    if (onlyCarry) list = objs.filter(o => carried.has(o.id));

    dom.body.innerHTML = `
      <div class="rel-card">
        <h5>社区摘要 <small style="font-weight:400;color:#64707f">按关系连通性自动归纳</small></h5>
        ${comm.length ? comm.map(c => `<p style="margin-bottom:6px"><b>社区 ${c.i}</b> · ${c.size} 个实体 · ${c.main.join(' / ')} · 支撑事实 ${c.facts} 条<br>
          <span style="color:#64707f">${c.sample.join('、')}${c.size > 3 ? ' 等' : ''}</span></p>`).join('') : '<p>当前过滤下没有连通社区。</p>'}
      </div>
      <div class="rel-card">
        <h5>对象清单 ${onlyCarry ? '<span class="chip hi">只看携带事实相关</span>' : ''}</h5>
        <p style="margin-bottom:8px">${st.rel.domain === 'all' ? '全部对象域' : domName(st.rel.domain)} · 无坐标对象在下方单独列出，不在地图上伪造点位。</p>
        <div id="relList"></div>
      </div>
      <div class="rel-note">本体抽离、关系建立与打分由 LLM、领域规则与评分机制自动完成，不设人工审核入口；低置信度关系标记为「待观察」，不进入推演种子。</div>`;

    const box = dom.body.querySelector('#relList');
    if (!list.length) {
      box.innerHTML = '<div class="rel-empty">当前筛选下没有对象。<br><button class="ghost sm" id="relClr" style="margin-top:8px">清除筛选条件</button></div>';
      box.querySelector('#relClr').onclick = () => S.set({ rel: { domain: 'all', sel: null, kind: null, onlyCarry: false, focusFact: null }, q: '', time: 'all' });
      return;
    }
    list.forEach(o => {
      const fs = D.factsOfObject(o.id).length, rs = D.relationsOf(o.id).length;
      const el = document.createElement('button');
      el.className = 'rel-obj' + (carried.has(o.id) ? ' carried' : '');
      el.innerHTML = `<span class="dot" style="background:${D.domain(o.domain).c}"></span>
        <span class="t"><b>${o.name}</b><small>${domName(o.domain)}${o.geo === false ? ' · 无坐标' : ''}${carried.has(o.id) ? ' · 已携带事实支撑' : ''}</small></span>
        <span class="n">${fs} 事实<br>${rs} 关系</span>`;
      el.onclick = () => S.set({ rel: { sel: o.id, kind: 'object' } });
      box.appendChild(el);
    });
  }

  function renderObject(st, o) {
    dom.back.hidden = false;
    dom.title.textContent = '对象详情';
    dom.count.textContent = o.id;
    const facts = D.factsOfObject(o.id).filter(f => D.inWindow(f.date, st.time));
    const rels = D.relationsOf(o.id);
    dom.body.innerHTML = `
      <div class="rel-card">
        <h5><span class="dot" style="width:9px;height:9px;border-radius:50%;background:${D.domain(o.domain).c};display:inline-block"></span>${o.name}</h5>
        <p>${o.sub}</p>
        <div class="rel-kv"><span>对象域</span><b>${domName(o.domain)}</b></div>
        <div class="rel-kv"><span>坐标</span><b>${o.geo === false ? '无坐标（不在地图显示）' : o.lng + ', ' + o.lat}</b></div>
        ${o.props.map(([k, v]) => `<div class="rel-kv"><span>${k}</span><b>${v}</b></div>`).join('')}
      </div>
      <div class="rel-card">
        <h5>关联关系 <small style="font-weight:400;color:#64707f">${rels.length} 条</small></h5>
        ${rels.length ? rels.map(r => {
          const other = r.from === o.id ? D.objById(r.to) : D.objById(r.from);
          return `<div style="margin-bottom:8px">
            <div class="rel-kv"><span>${r.type} · ${other ? other.name : ''}</span><b>置信 ${(r.confidence * 100).toFixed(0)}%</b></div>
            <div class="rel-bar${r.confidence >= 0.6 ? '' : ' c'}"><i style="width:${(r.strength * 100).toFixed(0)}%"></i></div>
            <div style="margin-top:5px"><span class="rel-link" data-rel="${r.id}">查看关系详情（强度 / 时序 / 支撑事实）</span></div></div>`;
        }).join('') : '<p>暂无关系记录。</p>'}
      </div>
      <div class="rel-card">
        <h5>支撑事实 <small style="font-weight:400;color:#64707f">${facts.length} 条（当前时间范围内）</small></h5>
        ${facts.length ? facts.map(f => `<p style="margin-bottom:6px"><span class="rel-link" data-fact="${f.id}">${f.date} · ${f.title}</span></p>`).join('') : '<p>当前时间范围内没有支撑事实。</p>'}
      </div>`;
    dom.body.querySelectorAll('[data-rel]').forEach(el => el.onclick = () => S.set({ rel: { sel: el.dataset.rel, kind: 'relation' } }));
    dom.body.querySelectorAll('[data-fact]').forEach(el => el.onclick = () => S.set({ tab: 'fact', factId: el.dataset.fact }));
  }

  function renderRelation(st, r) {
    dom.back.hidden = false;
    dom.title.textContent = '关系详情';
    dom.count.textContent = r.id;
    const a = D.objById(r.from), b = D.objById(r.to), fb = D.factById(r.changedBy);
    const facts = D.factsFor(r.factIds);
    const tl = [{ d: r.formed, t: '关系形成', x: '由本体抽离与规则评分建立' }]
      .concat(facts.filter(f => f.date > r.formed).sort((x, y) => x.date < y.date ? -1 : 1)
        .map(f => ({ d: f.date, t: '由事实变更', x: f.title, id: f.id })));
    dom.body.innerHTML = `
      <div class="rel-card">
        <h5>${r.type}</h5>
        <p><b>${a ? a.name : r.from}</b> → <b>${b ? b.name : r.to}</b></p>
        <div class="rel-kv"><span>置信度</span><b>${(r.confidence * 100).toFixed(0)}%${r.confidence < 0.6 ? ' · 待观察' : ''}</b></div>
        <div class="rel-bar c"><i style="width:${(r.confidence * 100).toFixed(0)}%"></i></div>
        <div class="rel-kv" style="margin-top:8px"><span>关系强度</span><b>${(r.strength * 100).toFixed(0)}%</b></div>
        <div class="rel-bar"><i style="width:${(r.strength * 100).toFixed(0)}%"></i></div>
        <div class="rel-kv" style="margin-top:8px"><span>形成时间</span><b>${r.formed}</b></div>
        <div class="rel-kv"><span>最近由什么事实改变</span><b>${fb ? '<span class="rel-link" data-fact="' + fb.id + '">' + fb.short + ' · ' + fb.date + '</span>' : '无'}</b></div>
        <p style="margin-top:6px">${r.note}</p>
      </div>
      <div class="rel-card">
        <h5>时序记忆</h5>
        <div class="rel-tl">${tl.map(x => `<div class="it"><small>${x.d}</small><div>${x.t}：${x.id ? '<span class="rel-link" data-fact="' + x.id + '">' + x.x + '</span>' : x.x}</div></div>`).join('')}</div>
      </div>
      <div class="rel-card">
        <h5>支撑事实 <small style="font-weight:400;color:#64707f">${facts.length} 条</small></h5>
        ${facts.map(f => `<p style="margin-bottom:6px"><span class="rel-link" data-fact="${f.id}">${f.date} · ${f.title}</span></p>`).join('') || '<p>暂无支撑事实（关系来自规则推断，标记为待观察）。</p>'}
      </div>
      <div class="rel-note">关系由事实与规则自动建立并打分；${r.confidence < 0.6 ? '本条置信度低于 0.5 阈值，标记「待观察」，不进入推演种子。' : '本条已通过置信度阈值。'}</div>`;
    dom.body.querySelectorAll('[data-fact]').forEach(el => el.onclick = () => S.set({ tab: 'fact', factId: el.dataset.fact }));
  }

  /* ---------- 覆盖层 ---------- */
  function renderChrome(st, objs, rels) {
    root.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === st.rel.view));
    const fb = st.rel.focusFact ? D.factById(st.rel.focusFact) : null;
    const ctx = [];
    if ((st.carry || []).length) {
      ctx.push(`<div class="rel-banner"><span>已携带 ${st.carry.length} 条事实进入关联层</span>
        <button data-act="only">只看相关</button><button data-act="clear">清除携带</button></div>`);
    }
    if (fb) ctx.push(`<div class="rel-banner" style="background:rgba(239,246,255,.96);border-color:#bfdbfe;color:#1e40af">
      <span>来自事实：${fb.short} · ${fb.date}</span><button data-act="clearFact">清除上下文</button></div>`);
    dom.ctx.innerHTML = ctx.join('');
    const only = dom.ctx.querySelector('[data-act="only"]'); if (only) only.onclick = () => S.set({ rel: { onlyCarry: !st.rel.onlyCarry } });
    const clr = dom.ctx.querySelector('[data-act="clear"]'); if (clr) clr.onclick = () => S.set({ carry: [], rel: { onlyCarry: false, focusFact: null } });
    const clrF = dom.ctx.querySelector('[data-act="clearFact"]'); if (clrF) clrF.onclick = () => S.set({ rel: { focusFact: null } });

    const nogeo = objs.filter(o => o.geo === false);
    dom.nogeo.style.display = (st.rel.view === 'geo' && nogeo.length) ? '' : 'none';
    dom.nogeo.innerHTML = `<div class="h">无坐标 · 不在地图显示（${nogeo.length} 个对象）</div>
      <div class="list">${nogeo.map(o => `<span class="chip" data-obj="${o.id}"><i style="background:${D.domain(o.domain).c}"></i>${o.name}</span>`).join('')}</div>`;
    dom.nogeo.querySelectorAll('[data-obj]').forEach(el => el.onclick = () => S.set({ rel: { sel: el.dataset.obj, kind: 'object' } }));

    dom.legend.innerHTML = `<span class="lg-t">图例</span>
      ${st.rel.view === 'graph' ? `<span class="lg-i"><span class="ln"></span>关系：线宽 = 强度</span><span class="lg-i"><span class="ln dash"></span>置信 &lt; 0.6 · 待观察</span>` : `<span class="lg-i"><span class="ln"></span>有坐标关系连线</span><span class="lg-i"><span class="ln dash"></span>低置信关系</span>`}
      <span class="lg-i"><i style="background:#16a34a"></i>绿框 = 携带事实支撑</span>
      <span class="lg-i" style="color:#64707f">节点大小 = 关系连接度 · 示意数据 · 待标定</span>`;
  }

  function update() {
    if (!root) return;
    const st = S.state;
    const key = JSON.stringify([st.time, st.q, st.rel.domain, st.rel.view, st.rel.sel, st.rel.kind, st.rel.onlyCarry, st.rel.focusFact, st.carry, st.panels.cards]);
    if (key === sig) return; sig = key;
    dom.side.classList.toggle('off', !st.panels.cards);
    const objs = F.objects(st), rels = F.relations(st);
    const c = ensureChart();
    if (!c) return;
    if (st.rel.view === 'geo') c.setOption(geoOption(objs, rels, st), { notMerge: true });
    else c.setOption(graphOption(objs, rels, st), { notMerge: true });
    renderChrome(st, objs, rels);
    const sel = st.rel.sel;
    if (sel && st.rel.kind === 'relation') { const r = D.relById(sel); r ? renderRelation(st, r) : renderList(st, objs, rels); }
    else if (sel) { const o = D.objById(sel); o ? renderObject(st, o) : renderList(st, objs, rels); }
    else renderList(st, objs, rels);
  }

  const debug = () => {
    const st = S.state, o = chart ? chart.getOption() : null;
    const all = F.objects(st), rels = F.relations(st);
    return {
      view: st.rel.view, domain: st.rel.domain, sel: st.rel.sel,
      nodes: all.length, edges: rels.length,
      mapped: all.filter(x => x.geo !== false).length, unmapped: all.filter(x => x.geo === false).length,
      series: o ? o.series.map(s => (s.data || []).length) : [],
      communities: communities(all, rels).length,
      graphNodes: (o && o.series[0] && o.series[0].data) ? o.series[0].data.length : 0
    };
  };

  return { mount, update, debug };
})();
