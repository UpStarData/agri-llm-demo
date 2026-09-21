/* ============================================================
   V0.3 应用骨架：三个一级 TAB + 共用筛选/分类栏/底部流水 + 层挂载
   层（fact / relation / sim）只渲染自己的 root；跳转与共用骨架在这里统一处理
   ============================================================ */
(function () {
  const D = window.V03Data, S = window.V03Store, F = window.V03Filter;
  const $ = id => document.getElementById(id);

  /* ---------- 地图注册（离线单文件：geo JSON 已内联）
     world110 内联的是精简 {n,c} 结构，由事实层转成 GeoJSON 后注册，这里不要注册原始数组 ---------- */
  function regMaps() {
    try { if (window.__CHINA_GEO && window.echarts && !echarts.getMap('china')) echarts.registerMap('china', window.__CHINA_GEO); }
    catch (e) { console.error('registerMap china', e); }
  }

  /* ---------- 提示 ---------- */
  let toastTimer = null;
  function toast(msg) {
    const el = $('toast'); el.textContent = msg; el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('on'), 2600);
  }

  /* ---------- 三个 TAB ---------- */
  const TABS = [
    { id: 'fact', n: '事实层', hasCards: '事实卡片', d: '事实地图 · 空间下钻与筛选 · 事实详情与证据' },
    { id: 'relation', n: '关联层', hasCards: '对象清单', d: '关系图谱 / 地理关联双视图 · 本体对象与关系详情' },
    { id: 'sim', n: '推演层', hasCards: null, d: '七阶段推演 · 轮次过程 · 报告与引用（报告属于本层）' }
  ];
  const tabMeta = id => TABS.find(t => t.id === id) || TABS[0];

  function renderTabs() {
    const box = $('tabs');
    box.innerHTML = '';
    TABS.forEach(t => {
      const b = document.createElement('button');
      b.setAttribute('role', 'tab');
      b.dataset.tab = t.id;
      b.textContent = t.n;
      b.setAttribute('aria-selected', String(S.state.tab === t.id));
      b.classList.toggle('on', S.state.tab === t.id);
      b.onclick = () => S.set({ tab: t.id });
      box.appendChild(b);
    });
    $('crumb').innerHTML = '<b>' + tabMeta(S.state.tab).n + '</b> · ' + tabMeta(S.state.tab).d;
  }

  /* ---------- 共用筛选栏 ---------- */
  function renderFilterbar() {
    const st = S.state;
    [...$('timeSeg').children].forEach(b => b.classList.toggle('on', b.dataset.time === st.time));
    $('credSel').value = st.cred;
    $('inflSel').value = st.infl;
    if ($('qInput').value !== st.q) $('qInput').value = st.q;
    const factTab = st.tab === 'fact';
    $('credWrap').style.display = factTab ? '' : 'none';
    $('inflWrap').style.display = factTab ? '' : 'none';
    $('fbNote').textContent = st.tab === 'fact'
      ? '事实层：地图即主体，点在点/卡片上进入详情；点国家或省份标记下钻'
      : st.tab === 'relation'
        ? '关联层：分类栏切换九类对象域；图谱与地理关联共用同一批事实'
        : '推演层：报告是推演结果页，随轮次逐步生成';
    $('railToggle').textContent = (st.rail ? '☰ ' : '☰ ') + '分类栏';
    $('railToggle').classList.toggle('on', st.rail);
    $('railToggle').setAttribute('aria-expanded', String(st.rail));
  }

  function bindFilterbar() {
    [...$('timeSeg').children].forEach(b => b.onclick = () => S.set({ time: b.dataset.time, cat: S.state.cat }));
    $('credSel').onchange = e => S.set({ cred: e.target.value });
    $('inflSel').onchange = e => S.set({ infl: e.target.value });
    let t = null;
    $('qInput').oninput = e => {
      const v = e.target.value;
      clearTimeout(t); t = setTimeout(() => S.set({ q: v.trim() }), 180);
    };
    $('railToggle').onclick = () => S.set({ rail: !S.state.rail });
  }

  /* ---------- 左上：面板显隐（评审结论：左上提供面板显隐控制） ---------- */
  function renderPanelCtl() {
    const st = S.state, meta = tabMeta(st.tab), box = $('panelCtl');
    box.innerHTML = '';
    const mk = (label, on, fn, title) => {
      const b = document.createElement('button');
      b.textContent = label; b.classList.toggle('on', !!on); b.title = title || '';
      b.onclick = fn; box.appendChild(b);
    };
    mk('分类栏', st.rail, () => S.set({ rail: !st.rail }));
    if (meta.hasCards) mk(meta.hasCards, st.panels.cards, () => S.set({ panels: { cards: !st.panels.cards } }));
    if (st.tab !== 'sim') mk(st.tab === 'fact' ? '数据接入与处理流水' : '本体抽离与关联处理流水', st.panels.stream, () => S.set({ panels: { stream: !st.panels.stream } }));
  }

  /* ---------- 左侧分类栏（事实层三级分类 / 关联层九类对象域 / 推演层场景） ---------- */
  function railItem(label, on, count, color, fn, extra) {
    const b = document.createElement('button');
    b.className = 'r-item' + (on ? ' on' : '');
    b.innerHTML = (color ? '<i style="background:' + color + '"></i>' : '') + '<span>' + label + '</span>' + (count != null ? '<span class="n">' + count + '</span>' : '');
    if (extra) b.title = extra;
    b.onclick = fn;
    return b;
  }

  function renderRail() {
    const st = S.state, rail = $('rail'), box = $('railBody') || rail;
    box.innerHTML = '';
    if (st.tab === 'fact') {
      const list = F.facts(st);
      const title = document.createElement('h4'); title.textContent = '事实分类（三级）'; box.appendChild(title);
      const all = railItem('全部事实', st.cat === 'all', list.length, '#10151f', () => S.set({ cat: 'all', sub: null }));
      box.appendChild(all);
      Object.keys(D.CATS).forEach(k => {
        box.appendChild(railItem(D.CATS[k].n, st.cat === k, list.filter(f => f.cat === k).length, D.CATS[k].c,
          () => S.set({ cat: st.cat === k ? 'all' : k, sub: null })));
        if (st.cat === k) {
          const sub = document.createElement('div'); sub.className = 'r-sub';
          (F.SUB[k] || []).forEach(w => {
            const b = document.createElement('button');
            b.textContent = '· ' + w; b.classList.toggle('on', st.sub === w);
            b.onclick = () => S.set({ sub: st.sub === w ? null : w });
            sub.appendChild(b);
          });
          box.appendChild(sub);
        }
      });
      const t3 = document.createElement('h4'); t3.textContent = '来源 / 口径'; t3.style.marginTop = '10px'; box.appendChild(t3);
      box.appendChild(railItem('全部来源', st.src === 'all', null, null, () => S.set({ src: 'all' })));
      Object.keys(F.SRC).forEach(k => box.appendChild(railItem(F.SRC[k].n, st.src === k, D.FACTS.filter(F.SRC[k].test).length, null, () => S.set({ src: st.src === k ? 'all' : k }))));
      const note = document.createElement('div'); note.className = 'r-note';
      note.textContent = '三级分类顺序为：分类 → 细分类别 → 来源与口径。左侧默认展开，可用左上「分类栏」收起为窄栏。';
      box.appendChild(note);
    } else if (st.tab === 'relation') {
      const objs = F.objects(st);
      const h = document.createElement('h4'); h.textContent = '本体对象域（九类）'; box.appendChild(h);
      box.appendChild(railItem('全部对象域', st.rel.domain === 'all', objs.length, '#10151f', () => S.set({ rel: { domain: 'all', sel: null, kind: null } })));
      D.DOMAINS.forEach(d => box.appendChild(railItem(d.n, st.rel.domain === d.id, objs.filter(o => o.domain === d.id).length, d.c,
        () => S.set({ rel: { domain: st.rel.domain === d.id ? 'all' : d.id, sel: null, kind: null } }))));
      const note = document.createElement('div'); note.className = 'r-note';
      note.textContent = '本体抽离、关系建立与打分由规则与评分机制自动完成，不设人工审核入口。无坐标对象不在地图上伪造点位，只在清单中列出。';
      box.appendChild(note);
    } else {
      const h = document.createElement('h4'); h.textContent = '推演场景（三条样例）'; box.appendChild(h);
      const SCN = D.SCENARIOS || [];
      SCN.forEach(sc => box.appendChild(railItem(sc.name, st.sim.scenario === sc.id, null, '#1d4ed8',
        () => S.set({ sim: { scenario: sc.id, stage: 0, round: 0, status: 'idle', seedIds: [] } }), sc.goal)));
      const note = document.createElement('div'); note.className = 'r-note';
      note.textContent = '三条场景均为样例，用于演示推演过程与证据回溯；离线推演为示意引擎，不是真实 MiroFish 后端运行。';
      box.appendChild(note);
    }
    rail.classList.toggle('closed', !st.rail);
  }

  /* ---------- 底部流水（矮、可关闭、逐行向上滚动） ---------- */
  const streamState = { tab: null, i: 0, timer: null };
  function streamLines() {
    const st = S.state;
    if (st.tab === 'sim' && window.V03Sim && V03Sim.streamLines) return V03Sim.streamLines();
    return (D.STREAM && D.STREAM[st.tab]) || [];
  }
  function pushStreamLine() {
    const body = $('streamBody'), lines = streamLines();
    if (!lines.length) return;
    const [k, text, fid] = lines[streamState.i % lines.length];
    streamState.i++;
    const row = document.createElement('div');
    row.className = 'st-line';
    const kk = document.createElement('span'); kk.className = 'k' + (/降级|告警|失败|待核|挂账/.test(k) ? ' warn' : ''); kk.textContent = k;
    const tt = document.createElement('span'); tt.className = 't'; tt.textContent = new Date().toTimeString().slice(0, 8);
    const tx = document.createElement('span'); tx.textContent = text;
    row.appendChild(kk); row.appendChild(tt); row.appendChild(tx);
    if (fid) {
      const c = document.createElement('span'); c.className = 'f'; c.textContent = '[' + fid + ']';
      c.onclick = () => S.set({ tab: 'fact', factId: fid });
      row.appendChild(c);
    }
    body.appendChild(row);
    while (body.children.length > 60) body.removeChild(body.firstChild);
    body.scrollTop = body.scrollHeight;
  }
  function syncStream() {
    const st = S.state, box = $('streamBox');
    const on = st.tab !== 'sim' && st.panels.stream;
    box.classList.toggle('on', on);
    document.documentElement.style.setProperty('--stream-h', on ? '132px' : '0px');
    $('streamTitle').textContent = st.tab === 'fact' ? '数据接入与处理流水' : '本体抽离与关联处理流水';
    $('streamMeta').textContent = st.tab === 'fact'
      ? '接入 ' + D.FACTS.length + ' 条事实 · 全部标记「示意数据 · 待标定」'
      : '抽离 ' + D.OBJECTS.length + ' 个本体对象 · ' + D.RELATIONS.length + ' 条关系 · 自动评分';
    if (streamState.tab !== st.tab || !on) {
      streamState.tab = st.tab; streamState.i = 0; $('streamBody').innerHTML = '';
      for (let i = 0; i < 6; i++) pushStreamLine();
    }
    clearInterval(streamState.timer);
    streamState.timer = on ? setInterval(pushStreamLine, 1700) : null;
  }
  function bindStream() {
    $('streamClose').onclick = () => S.set({ panels: { stream: false } });
  }

  /* ---------- 层挂载与刷新 ---------- */
  const dirty = { fact: true, relation: true, sim: true };
  function mountLayers() {
    ['fact', 'relation', 'sim'].forEach(k => {
      const m = window['V03' + k[0].toUpperCase() + k.slice(1)];
      if (m && m.mount) { try { m.mount($('layer-' + k)); } catch (e) { console.error('mount ' + k, e); } }
      else console.warn('层未加载：' + k);
    });
  }
  function refreshLayers(force) {
    const st = S.state;
    ['fact', 'relation', 'sim'].forEach(k => {
      const el = $('layer-' + k);
      const active = st.tab === k;
      el.classList.toggle('on', active);
      const m = window['V03' + k[0].toUpperCase() + k.slice(1)];
      if (!m || !m.update) return;
      if (active && (force || dirty[k])) { dirty[k] = false; try { m.update(); } catch (e) { console.error('update ' + k, e); } }
    });
  }
  const markDirty = () => { dirty.fact = dirty.relation = dirty.sim = true; };

  /* ---------- 键盘：Esc 关闭详情 / 返回上一级空间 ---------- */
  function onKey(e) {
    if (e.key === 'Escape') {
      const st = S.state;
      if (st.factId) return S.set({ factId: null, logOpen: false });
      if (st.rel.sel) return S.set({ rel: { sel: null, kind: null } });
      if (st.geo.level === 'L3') return S.set({ geo: { level: 'L2', focus: null } });
      if (st.geo.level === 'L1') return S.set({ geo: { level: 'L2', focus: null } });
    }
  }

  /* ---------- 联动跳转事件 ---------- */
  S.onEvent('toast', toast);
  S.onEvent('jump', p => { if (p && p.tab) S.set({ tab: p.tab }); });

  /* ---------- 启动 ---------- */
  function boot() {
    regMaps();
    renderTabs(); renderFilterbar(); renderPanelCtl(); renderRail();
    bindFilterbar(); bindStream();
    mountLayers();
    S.on(() => { markDirty(); renderTabs(); renderFilterbar(); renderPanelCtl(); renderRail(); syncStream(); refreshLayers(false); });
    syncStream();
    refreshLayers(true);
    document.addEventListener('keydown', onKey);

    /* 供 Playwright / 人工排查使用（只读 + 与页面同源的写入口） */
    window.V03_DEBUG = {
      state: () => JSON.parse(JSON.stringify(S.state)),
      set: p => S.set(p),
      counts: () => ({
        facts: F.facts().length,
        factsAtLevel: F.factsAtLevel().length,
        objects: F.objects().length,
        relations: F.relations().length,
        cards: document.querySelectorAll('#layer-fact .fcard').length,
        graphNodes: (window.V03Relation && V03Relation.debug) ? V03Relation.debug().nodes : null,
        stages: document.querySelectorAll('#layer-sim .sim-stage').length
      }),
      text: sel => (document.querySelector(sel) || {}).textContent || '',
      tab: () => document.querySelector('#tabs button.on').dataset.tab
    };
    window.__AGRI_READY = true;
  }
  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') boot();
})();
