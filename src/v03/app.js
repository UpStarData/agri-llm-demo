/* ============================================================
   V0.4 应用骨架（LLM-291 页面指令）
   · 顶部：图层菜单 Icon / 🌾 AgriLink v1.0 / 三 TAB 居中 / 快捷图标组（流水·卡片·设置）
   · 左侧：图层菜单面板（数据概览 → 三级分类筛选 → 快捷控制 + 快捷键总开关）
   · 地图右下角：M1–M11 全套快捷键（总开关关闭时整组隐藏）
   · 底部：终端风格数据流水（纯黑 / 无标题 / × 关闭 / 不均匀滚动节奏）
   · 弹窗：事实详情 / 本体详情 / 关系详情统一由这里挂载；设置页需演示口令
   ============================================================ */
(function () {
  const D = window.V03Data, S = window.V03Store, F = window.V03Filter;
  const $ = id => document.getElementById(id);
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };

  /* ---------- 图标（Cursor 风格：16px / 1.6 描边 / 圆角端点） ---------- */
  const ICON = {
    menu:    ['M4 6.5h10', 'M4 12h16', 'M4 17.5h10', 'M18 6.5h2'],
    stream:  ['M3.5 5.5h17v13h-17z', 'M7 9.5l3 2.5-3 2.5', 'M12.5 15h4.5'],
    cards:   ['M4 4.5h7v15H4z', 'M13 4.5h7v8.5h-7z', 'M13 15.5h7V19h-7z'],
    gear:    ['M12 15.4a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8Z', 'M12 2.6v3', 'M12 18.4v3', 'M2.6 12h3', 'M18.4 12h3', 'M5.2 5.2l2.1 2.1', 'M16.7 16.7l2.1 2.1', 'M18.8 5.2l-2.1 2.1', 'M7.3 16.7l-2.1 2.1'],
    cube3d:  ['M12 2.8 3.8 7.1v9.8L12 21.2l8.2-4.3V7.1L12 2.8Z', 'M3.8 7.1 12 11.4l8.2-4.3', 'M12 11.4v9.8'],
    radar:   ['M12 3.4a8.6 8.6 0 1 1 0 17.2 8.6 8.6 0 0 1 0-17.2Z', 'M12 7.8a4.2 4.2 0 1 1 0 8.4 4.2 4.2 0 0 1 0-8.4Z', 'M12 12h.01'],
    expand:  ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
    video:   ['M3 6.5h12.5v11H3z', 'M15.5 11l5.5-3.2v8.4L15.5 13'],
    sprout:  ['M12 20.5V10', 'M12 10c0-4-3.4-6.2-8-6.2 0 4.2 3.2 6.2 8 6.2Z', 'M12 13.6c0-3.2 3.6-5.2 8-5.2 0 3.2-3.2 5.2-8 5.2Z'],
    anchor:  ['M12 3.6a2.1 2.1 0 1 0 0 4.2 2.1 2.1 0 0 0 0-4.2Z', 'M12 7.8v12', 'M5 13.4c0 5 3 7.4 7 7.4s7-2.4 7-7.4', 'M3.6 13.4h2.8', 'M17.6 13.4h2.8'],
    calendar: ['M4.5 6.2h15v13.3h-15z', 'M4.5 10.3h15', 'M8.4 3.8v4', 'M15.6 3.8v4'],
    shield:  ['M12 3.2 5.4 6v6.1c0 4.8 2.9 7.9 6.6 8.7 3.7-.8 6.6-3.9 6.6-8.7V6L12 3.2Z', 'M9.2 12.1l2 2 3.6-3.9'],
    gauge:   ['M4 17.4a8.6 8.6 0 1 1 16 0', 'M12 17.4l4-5.4'],
    search:  ['M11 4.2a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6Z', 'M16.1 16.1 21 21'],
    legend:  ['M4 6.5h3.2M10 6.5h10', 'M4 12h3.2M10 12h10', 'M4 17.5h3.2M10 17.5h10'],
    play:    ['M8.5 5.4 19 12 8.5 18.6V5.4Z'],
    close:   ['M6 6l12 12', 'M18 6 6 18']
  };
  const svg = (name, size) => '<svg viewBox="0 0 24 24" width="' + (size || 16) + '" height="' + (size || 16) +
    '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    (ICON[name] || []).map(d => '<path d="' + d + '"/>').join('') + '</svg>';

  /* ---------- 提示 ---------- */
  let toastTimer = null;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), 2400);
  }

  /* ---------- Logo 抖动：任何导致页面刷新数据的交互都会触发 ---------- */
  let shakeTimer = null;
  function shakeLogo() {
    const l = $('logo');
    if (!l) return;
    l.classList.remove('shake');
    void l.offsetWidth;
    l.classList.add('shake');
    clearTimeout(shakeTimer);
    shakeTimer = setTimeout(() => l.classList.remove('shake'), 700);
  }

  /* ---------- 三个 TAB ---------- */
  const TABS = [
    { id: 'fact', n: '事实层' },
    { id: 'relation', n: '关联层' },
    { id: 'sim', n: '推演层' }
  ];
  function renderTabs() {
    const box = $('tabs');
    if (!box.dataset.built) {
      box.dataset.built = '1';
      TABS.forEach(t => {
        const b = el('button');
        b.setAttribute('role', 'tab');
        b.dataset.tab = t.id;
        b.textContent = t.n;
        b.onclick = () => S.set({ tab: t.id, menu: false });
        box.appendChild(b);
      });
    }
    [...box.children].forEach(b => {
      const on = S.state.tab === b.dataset.tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
  }

  /* ---------- 顶部快捷图标组 ---------- */
  function renderTopIcons() {
    const st = S.state;
    const set = (btn, on) => { btn.classList.toggle('on', !!on); btn.setAttribute('aria-pressed', String(!!on)); };
    set($('btnStream'), st.panels.stream && st.tab !== 'sim');
    set($('btnCards'), st.panels.cards);
    $('btnStream').title = (st.tab === 'relation' ? '本体抽离与关联处理流水' : '数据接入与处理流水') + (st.panels.stream ? ' · 点击隐藏' : ' · 点击显示');
    $('btnCards').title = (st.tab === 'relation' ? '本体对象面板' : '事实卡片面板') + (st.panels.cards ? ' · 点击隐藏' : ' · 点击显示');
    const simOn = st.tab === 'sim';
    $('btnStream').disabled = simOn;
    $('btnStream').style.opacity = simOn ? .4 : 1;
    set($('menuBtn'), st.menu);
  }

  /* ---------- M1–M11 快捷键（双入口共用同一渲染器 → 状态必然一致） ---------- */
  const TIME_OPTS = [['7d', '7 天'], ['30d', '30 天'], ['90d', '90 天'], ['all', '全部']];
  const CRED_OPTS = [['high', '高'], ['mid', '中'], ['low', '低'], ['all', '不限']];
  const INFL_OPTS = [['high', '高'], ['mid', '中'], ['low', '低'], ['all', '不限']];
  const SK = [
    { k: 'mode3d', i: 'cube3d', n: '2D / 3D', d: '切换二维地图与三维地球（3D 地球缓慢自转）', kind: 'sw', get: s => s.sk.mode3d, set: v => ({ sk: { mode3d: v } }) },
    { k: 'influence', i: 'radar', n: '影响力动画', d: '事实影响力扩散波纹；强度与影响等级相关', kind: 'sw', get: s => s.sk.influence, set: v => ({ sk: { influence: v } }) },
    { k: 'fullscreen', i: 'expand', n: '全屏', d: '浏览器全屏显示地图', kind: 'sw', get: s => s.sk.fullscreen, set: v => ({ sk: { fullscreen: v } }) },
    { k: 'live', i: 'video', n: '直播流', d: '卡片内接入直播流 / 视频新闻流并同步播放', kind: 'sw', get: s => s.sk.live, set: v => ({ sk: { live: v } }) },
    { k: 'regions', i: 'sprout', n: '主要产区', d: '标注主要农产品产区，可点击查看本体详情', kind: 'sw', get: s => s.sk.regions, set: v => ({ sk: { regions: v } }) },
    { k: 'gates', i: 'anchor', n: '港口机场', d: '标注主要贸易港口与机场，可点击查看本体详情', kind: 'sw', get: s => s.sk.gates, set: v => ({ sk: { gates: v } }) },
    { k: 'time', i: 'calendar', n: '时间范围', d: '事实时间窗口；预留时间轴播放位', kind: 'sel', opts: TIME_OPTS, get: s => s.time, set: v => ({ time: v }) },
    { k: 'cred', i: 'shield', n: '可信度', d: '可信度阈值：高=仅高可信，中=高+中', kind: 'sel', opts: CRED_OPTS, get: s => s.cred, set: v => ({ cred: v }) },
    { k: 'infl', i: 'gauge', n: '影响等级', d: '影响等级阈值：高=仅高影响', kind: 'sel', opts: INFL_OPTS, get: s => s.infl, set: v => ({ infl: v }) },
    { k: 'search', i: 'search', n: '搜索', d: '按关键词搜索事实 / 本体对象', kind: 'input', get: s => s.q, set: v => ({ q: v }) },
    { k: 'legend', i: 'legend', n: '图例', d: '显示 / 隐藏事实类型图例', kind: 'sw', get: s => s.sk.legend, set: v => ({ sk: { legend: v } }) }
  ];
  const skVal = (sk, s) => (sk.kind === 'sw' ? (sk.get(s) ? '开' : '关') : sk.kind === 'input' ? (s.q ? '已设' : '空') : (sk.opts.find(o => o[0] === sk.get(s)) || ['', '—'])[1]);

  let pop = null;
  function closePop() { if (pop) { pop.remove(); pop = null; document.removeEventListener('mousedown', onDocDown, true); } }
  function onDocDown(e) { if (pop && !pop.contains(e.target) && !(pop._anchor && pop._anchor.contains(e.target))) closePop(); }

  function openPop(sk, anchor, rerender) {
    const wasThis = pop && pop._k === sk.k;
    closePop();
    if (wasThis) return;
    const box = el('div', 'sk-pop');
    box._k = sk.k; box._anchor = anchor;
    if (sk.kind === 'sel') {
      sk.opts.forEach(([v, n]) => {
        const b = el('button', 'sk-opt' + (sk.get(S.state) === v ? ' on' : ''), n);
        b.onclick = () => { S.set(sk.set(v)); closePop(); rerender(); };
        box.appendChild(b);
      });
      if (sk.k === 'time') {
        const b = el('button', 'sk-opt ghostish', svg('play', 13) + '<span>时间轴播放</span>');
        b.title = '本期预留位，后续版本启用';
        b.classList.add('reserved');
        b.onclick = () => { closePop(); toast('时间轴播放为本期预留功能，按钮位已固定，后续版本启用'); };
        box.appendChild(b);
      }
    } else if (sk.kind === 'input') {
      const inp = el('input', 'sk-input');
      inp.type = 'search'; inp.value = S.state.q; inp.placeholder = '事实 / 本体对象关键词';
      let t = null;
      inp.oninput = () => { clearTimeout(t); t = setTimeout(() => S.set({ q: inp.value.trim() }), 160); };
      inp.onkeydown = e => { if (e.key === 'Enter') { closePop(); rerender(); } };
      box.appendChild(inp);
      setTimeout(() => inp.focus(), 20);
    }
    anchor.parentElement.appendChild(box);
    pop = box;
    setTimeout(() => document.addEventListener('mousedown', onDocDown, true), 0);
  }

  function renderShortcutBar(mount, opts) {
    const st = S.state, mode = (opts || {}).mode || 'map';
    const na = st.tab === 'relation' ? ['mode3d'] : [];   // 3D 地球只在地图层生效
    mount.innerHTML = '';
    mount.classList.toggle('menu-mode', mode === 'menu');
    SK.forEach((sk, idx) => {
      const on = sk.kind === 'sw' ? !!sk.get(st) : false;
      const b = el('button', 'sk' + (on ? ' on' : '') + (sk.kind !== 'sw' ? ' sel' : ''));
      b.dataset.k = sk.k;
      b.title = 'M' + (idx + 1) + ' · ' + sk.n + '：' + sk.d;
      b.innerHTML = '<span class="sk-i">' + svg(sk.i, mode === 'menu' ? 15 : 14) + '</span>' +
        (mode === 'menu' ? '<span class="sk-n">' + sk.n + '</span><span class="sk-v">' + skVal(sk, st) + '</span>' : '<span class="sk-v">' + skVal(sk, st) + '</span>');
      b.setAttribute('aria-pressed', String(!!sk.get(st)));
      if (na.includes(sk.k)) {
        b.disabled = true;
        b.classList.add('sk-na');
        b.title = 'M' + (idx + 1) + ' · ' + sk.n + '：本层为地理关联视图，3D 地球在地图层使用';
      }
      b.onclick = () => {
        if (sk.kind === 'sw') {
          if (sk.k === 'fullscreen') return toggleFullscreen(!st.sk.fullscreen);
          S.set(sk.set(!sk.get(st)));
        } else openPop(sk, b, () => renderShortcutBar(mount, opts));
      };
      mount.appendChild(b);
    });
  }

  /* ---------- 全屏（M3） ---------- */
  function toggleFullscreen(on) {
    const de = document.documentElement;
    const p = on ? (de.requestFullscreen && de.requestFullscreen()) : (document.exitFullscreen && document.exitFullscreen());
    if (p && p.catch) p.catch(err => { S.set({ sk: { fullscreen: false } }); S.emit('toast', '当前环境不允许全屏：' + (err && err.message ? err.message : '被浏览器拒绝')); });
    else S.set({ sk: { fullscreen: false } });
  }

  /* ---------- 左侧图层菜单：数据概览 / 三级分类 / 快捷控制 ---------- */
  function renderMenu() {
    const st = S.state, body = $('menuBody');
    $('menu').classList.toggle('on', st.menu);
    $('menu').setAttribute('aria-hidden', String(!st.menu));
    if (!st.menu) return;

    const ov = F.overview(st);
    const tree = st.tab === 'relation' ? F.REL_TREE : F.FACT_TREE;
    const items = st.tab === 'relation' ? F.REL_ITEMS : F.FACT_ITEMS;
    const field = st.tab === 'relation' ? 'relKeys' : 'catKeys';
    const onSet = F.selected(st, field, items);

    body.innerHTML = '';

    /* 第一层：数据概览 */
    const s1 = el('section', 'mn-sec');
    s1.appendChild(el('div', 'mn-h', '数据概览'));
    s1.appendChild(el('div', 'mn-ov', ov.rows.map(([k, v]) =>
      '<div class="ov-i"><span>' + k + '</span><b>' + v + '</b></div>').join('')));
    const max = Math.max(1, ...ov.dist.map(d => d.v));
    s1.appendChild(el('div', 'mn-dist-t', ov.distTitle));
    s1.appendChild(el('div', 'mn-dist', ov.dist.map(d =>
      '<div class="ds-i" title="' + d.n + ' ' + d.v + ' 条"><span class="ds-e">' + d.e + '</span>' +
      '<span class="ds-b"><i style="width:' + (d.v / max * 100).toFixed(0) + '%;background:' + d.c + '"></i></span>' +
      '<span class="ds-v">' + d.v + '</span></div>').join('')));
    body.appendChild(s1);

    /* 第二层：图层数据分类筛选（三级） */
    const s2 = el('section', 'mn-sec');
    s2.appendChild(el('div', 'mn-h', st.tab === 'relation' ? '本体分类筛选' : '图层数据分类筛选'));
    tree.forEach(g => {
      const blk = el('div', 'mn-grp');
      blk.appendChild(el('div', 'mn-l1', g.n));
      g.subs.forEach(sub => {
        blk.appendChild(el('div', 'mn-l2', sub.n));
        const row = el('div', 'mn-l3');
        sub.items.forEach(it => {
          const on = onSet.has(it.key);
          const b = el('button', 'l3' + (on ? ' on' : ''));
          b.dataset.key = it.key;
          const cat = st.tab === 'relation' ? (D.domain(it.key) || {}) : (D.CATS[it.c] || {});
          b.title = it.n + (st.tab === 'relation' ? '' : ' · ' + (D.CATS[it.c] ? D.CATS[it.c].n : ''));
          b.innerHTML = '<span class="l3-e">' + it.e + '</span><span class="l3-n">' + it.n + '</span>' +
            '<i class="l3-dot" style="background:' + (cat.c || '#94a3b8') + '"></i>';
          b.setAttribute('aria-pressed', String(on));
          b.onclick = () => S.set(F.toggleLeaf(S.state, field, items, it.key));
          row.appendChild(b);
        });
        blk.appendChild(row);
      });
      s2.appendChild(blk);
    });
    const all = el('div', 'mn-quick');
    const bAll = el('button', 'ghost sm', '全选');
    bAll.onclick = () => S.set({ [field]: null });
    const bNone = el('button', 'ghost sm', '全不选');
    bNone.onclick = () => S.set({ [field]: [] });
    all.appendChild(bAll); all.appendChild(bNone);
    all.appendChild(el('span', 'mn-tip', '三级卡片默认全选；取消后地图与卡片立即只显示剩余分类'));
    s2.appendChild(all);
    body.appendChild(s2);

    /* 第三层：快捷控制（与地图右下角同一套 M1–M11） */
    const s3 = el('section', 'mn-sec');
    s3.appendChild(el('div', 'mn-h', '快捷控制'));
    const bar = el('div', 'mn-sk');
    renderShortcutBar(bar, { mode: 'menu' });
    s3.appendChild(bar);
    const master = el('label', 'mn-master');
    master.innerHTML = '<input type="checkbox" id="skMaster"' + (st.panels.shortcuts ? ' checked' : '') + '>' +
      '<span><b>地图快捷键总开关</b><small>关闭后仅隐藏地图右下角整组快捷键，本面板内快捷控制仍可使用</small></span>';
    master.querySelector('input').onchange = e => S.set({ panels: { shortcuts: e.target.checked } });
    s3.appendChild(master);

    /* 图例（M11 控制显示的是地图图例，这里保留一份完整图例说明） */
    const lg = el('div', 'mn-legend');
    lg.appendChild(el('div', 'mn-h', '事实类型图例'));
    if (st.tab === 'relation') {
      lg.innerHTML = '<div class="mn-h">本体类型图例（暖色色系）</div>' +
        D.DOMAINS.map(d => '<div class="lg-i"><i style="background:' + d.c + '"></i>' + d.e + ' ' + d.n +
          (d.geo ? '' : '<small>无坐标 · 不在图上</small>') + '</div>').join('') +
        '<div class="lg-i"><span class="ln"></span>关系连线：粗细 = 强度，虚线 = 低置信（待观察）</div>';
    } else {
      lg.innerHTML = '<div class="mn-h">事实类型图例（冷色色系）</div>' +
        Object.keys(D.CATS).map(k => '<div class="lg-i"><i style="background:' + D.CATS[k].c + '"></i>' + D.CATS[k].e + ' ' + D.CATS[k].n + '</div>').join('') +
        '<div class="lg-i"><span class="ln"></span>关系线 / 扩散波纹 = 影响力动画</div>' +
        '<div class="lg-i"><span class="ln dash"></span>冷色星点 = 事实，暖色标记 = 产区与口岸</div>';
    }
    s3.appendChild(lg);
    body.appendChild(s3);
  }

  /* ---------- 底部终端流水（纯黑 / 无标题 / 数据包 stream.sequence 驱动） ----------
     事件内容、顺序、批次、新星标记全部来自数据包 agrilink-demo-v1：
     1135 条事件按 seq 批次分组播放（一批 7–8 行），批之间留停顿，天然形成不均匀节奏（B3）。 */
  const ST = { i: 0, timer: null, lastTab: null };
  const REL_STAGES = { link: 1, graph: 1, resolve: 1, score: 1 };   // 关联层只播「本体抽离与关联处理」相关阶段
  function seqBatches(events) {
    const out = [];
    events.forEach(e => {
      const b = String(e.seq || '').split('.')[0];
      if (!out.length || out[out.length - 1].b !== b) out.push({ b, t: e.t, items: [] });
      out[out.length - 1].items.push(e);
    });
    return out;
  }
  const SEQ_ALL = (D.STREAM_SEQ || []).filter(e => e.stage !== 'warn' || Math.random() < 1);
  const BATCHES = { fact: seqBatches(SEQ_ALL), relation: seqBatches(SEQ_ALL.filter(e => REL_STAGES[e.stage])) };
  const STREAM_SPEED = 2.6;                     // 数据包一个循环 454s → 演示约 175s
  function pushStreamLine(e) {
    const body = $('streamBody');
    if (!body || !e) return;
    const row = el('div', 'st-line');
    row.appendChild(el('span', 'k' + (e.stage === 'warn' ? ' warn' : ''), e.k || e.stage));
    row.appendChild(el('span', 't', new Date().toTimeString().slice(0, 8)));
    row.appendChild(el('span', 'tx', e.text));
    if (e.factId) {
      const c = el('span', 'f', '[' + e.factId + ']');
      c.onclick = () => S.set({ tab: 'fact', factId: e.factId });
      row.appendChild(c);
    }
    body.appendChild(row);
    while (body.children.length > 70) body.removeChild(body.firstChild);
    body.scrollTop = body.scrollHeight;
    /* 新数据接入 → 地图对应位置亮星（M15，亮星/微弱星由数据包 star.level 决定） */
    if (e.star) {
      const f = D.factById(e.star.factId);
      if (f) S.emit('stream:line', { fact: f, level: e.star.level, severity: e.star.severity });
    }
  }
  function scheduleStream() {
    clearTimeout(ST.timer);
    if (!$('streamBox').classList.contains('on')) return;
    const list = BATCHES[S.state.tab === 'relation' ? 'relation' : 'fact'];
    if (!list.length) return;
    const idx = ST.i % list.length, batch = list[idx];
    ST.i++;
    batch.items.forEach(pushStreamLine);
    const next = list[(idx + 1) % list.length];
    const raw = next ? Math.max(400, next.t - batch.t) : 1800;
    /* 节奏整形（演示用）：内容 / 顺序 / 批次 / 新星全部来自数据包，只把批间停顿拉出快慢差 ——
       每 5 批一次「重批次」长停顿，每 5 批一次「追赶」连吐，其余为数据包原生批次间隔（B3）。 */
    const roll = ST.i % 5;
    let gap = Math.max(360, Math.min(2600, raw / STREAM_SPEED)) + Math.random() * 180;
    if (roll === 0) gap = gap * 2.4 + 1200;
    else if (roll === 2) gap = 140;
    ST.timer = setTimeout(scheduleStream, gap);
  }
  function streamPool() {   /* 兼容旧调用：返回当前批次文本 */
    const list = BATCHES[S.state.tab === 'relation' ? 'relation' : 'fact'];
    return list.length ? list[ST.i % list.length].items : [];
  }
  function syncStream() {
    const st = S.state, box = $('streamBox');
    const on = st.tab !== 'sim' && st.panels.stream;
    box.classList.toggle('on', on);
    document.documentElement.style.setProperty('--stream-h', on ? '124px' : '0px');
    /* 地图浮层避让右侧卡片面板（面板宽度写进 CSS 变量，窄屏由媒体查询覆盖） */
    document.documentElement.style.setProperty('--side-w', st.tab !== 'sim' && st.panels.cards ? '432px' : '0px');
    $('stTabName').textContent = st.tab === 'fact' ? '输入流' : '抽离流';
    const seq = BATCHES[st.tab === 'relation' ? 'relation' : 'fact'];
    $('streamMeta').textContent = '数据包 agrilink-demo-v1 · ' + (D.STREAM_SEQ || []).length + ' 条时序事件 · ' +
      seq.length + ' 个接入批次';
    if (ST.lastTab !== st.tab || !on) {
      ST.lastTab = st.tab; ST.i = 0; $('streamBody').innerHTML = '';
      const first = seq[0];
      if (first) { first.items.forEach(pushStreamLine); ST.i = 1; }
    }
    if (on && !ST.timer) scheduleStream();
    if (!on) { clearTimeout(ST.timer); ST.timer = null; }
  }

  /* ---------- 弹窗（事实 / 本体 / 关系详情统一容器） ---------- */
  function syncModal() {
    const st = S.state, box = $('modal');
    let kind = null;
    if (st.factId) kind = 'fact';
    else if (st.tab === 'relation' && st.rel.sel) kind = st.rel.kind === 'relation' ? 'relation' : 'object';
    const open = !!kind;
    box.classList.toggle('on', open);
    if (!open) { $('modalBody').innerHTML = ''; return; }
    const wrap = $('modalBody');
    if (box.dataset.kind === kind && box.dataset.sig === JSON.stringify([st.factId, st.rel.sel, st.rel.kind, st.logOpen, st.sk.live])) return;
    box.dataset.kind = kind; box.dataset.sig = JSON.stringify([st.factId, st.rel.sel, st.rel.kind, st.logOpen, st.sk.live]);
    wrap.innerHTML = '';
    const render = kind === 'fact' ? window.V03Fact && V03Fact.renderDetail
      : window.V03Relation && V03Relation.renderDetail;
    if (render) render(wrap);
  }

  /* ---------- 设置入口（演示口令 123321 → 空白设置页） ---------- */
  const PW = '123321';
  function renderSettings() {
    const st = S.state;
    $('pwBox').classList.toggle('on', st.settings.gate && !st.settings.authed);
    $('settingsPage').classList.toggle('on', st.settings.authed);
    if (st.settings.gate && !st.settings.authed) {
      const inp = $('pwInput');
      if (document.activeElement !== inp) setTimeout(() => inp.focus(), 30);
      $('pwHint').textContent = '';
    }
  }
  function bindSettings() {
    $('pwOk').onclick = () => {
      const v = $('pwInput').value.trim();
      if (v === PW) { $('pwInput').value = ''; S.set({ settings: { gate: false, authed: true } }); S.emit('toast', '口令通过，已进入设置页'); }
      else { $('pwHint').textContent = '口令不正确'; $('pwInput').value = ''; }
    };
    $('pwCancel').onclick = () => S.set({ settings: { gate: false } });
    $('pwInput').onkeydown = e => { if (e.key === 'Enter') $('pwOk').click(); };
    $('setBack').onclick = () => S.set({ settings: { authed: false } });
  }

  /* ---------- 层挂载与刷新 ---------- */
  const dirty = { fact: true, relation: true, sim: true };
  const markDirty = () => { dirty.fact = dirty.relation = dirty.sim = true; };
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
      const node = $('layer-' + k);
      const active = st.tab === k;
      node.classList.toggle('on', active);
      const m = window['V03' + k[0].toUpperCase() + k.slice(1)];
      if (!m || !m.update) return;
      if (active && (force || dirty[k])) { dirty[k] = false; try { m.update(); } catch (e) { console.error('update ' + k, e); } }
    });
  }

  /* ---------- 地图坐标注册（世界 110m 精简结构 → GeoJSON） ---------- */
  function regMaps() {
    try { if (window.__CHINA_GEO && window.echarts && !echarts.getMap('china')) echarts.registerMap('china', window.__CHINA_GEO); }
    catch (e) { console.error('registerMap china', e); }
  }

  /* ---------- 键盘 ---------- */
  function onKey(e) {
    if (e.key !== 'Escape') return;
    const st = S.state;
    if (st.settings.gate) return void S.set({ settings: { gate: false } });
    if (pop) return closePop();
    if (st.factId) return S.set({ factId: null, logOpen: false });
    if (st.rel.sel) return S.set({ rel: { sel: null, kind: null } });
    if (st.menu) return S.set({ menu: false });
    if (st.geo.level === 'L3') return S.set({ geo: { level: 'L2', focus: null } });
    if (st.geo.level === 'L1') return S.set({ geo: { level: 'L2', focus: null } });
  }

  /* ---------- 启动 ---------- */
  function bindOnce() {
    $('menuBtn').onclick = () => S.set({ menu: !S.state.menu });
    $('menuClose').onclick = () => S.set({ menu: false });
    $('btnStream').onclick = () => { if (S.state.tab !== 'sim') S.set({ panels: { stream: !S.state.panels.stream } }); };
    $('btnCards').onclick = () => S.set({ panels: { cards: !S.state.panels.cards } });
    $('btnSettings').onclick = () => S.set({ settings: { gate: true, authed: false } });
    $('streamClose').onclick = () => S.set({ panels: { stream: false } });
    $('modalClose').onclick = () => S.set({ factId: null, rel: { sel: null, kind: null } });
    $('modal').onclick = e => { if (e.target === $('modal')) S.set({ factId: null, rel: { sel: null, kind: null } }); };
    bindSettings();
    document.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', () => S.set({ sk: { fullscreen: !!document.fullscreenElement } }));
    /* 地图快捷键总开关：只隐藏地图那一组 */
    $('mapSk').dataset.built = '1';
  }

  function renderMapSk() {
    const box = $('mapSk'), st = S.state;
    const show = st.panels.shortcuts && st.tab !== 'sim';
    box.style.display = show ? '' : 'none';
    if (!show) { closePop(); return; }
    renderShortcutBar(box, { mode: 'map' });
  }

  let lastKey = '';
  function boot() {
    regMaps();
    bindOnce();
    mountLayers();
    S.on((st, changed) => {
      markDirty();
      renderTabs(); renderTopIcons(); renderMenu(); renderMapSk(); syncStream(); renderSettings();
      refreshLayers(false);
      syncModal();
      /* 因筛选 / 分类切换而需要刷新时，稻谷抖一下 */
      if (changed.some(k => ['time', 'cred', 'infl', 'q', 'catKeys', 'relKeys', 'geo', 'tab', 'rel', 'sk', 'carry'].includes(k))) shakeLogo();
      lastKey = JSON.stringify(changed);
    });
    S.onEvent('toast', toast);
    S.onEvent('jump', p => { if (p && p.tab) S.set({ tab: p.tab }); });
    renderTabs(); renderTopIcons(); renderMenu(); renderMapSk(); renderSettings();
    syncStream(); refreshLayers(true); syncModal();

    window.V03_DEBUG = {
      state: () => JSON.parse(JSON.stringify(S.state)),
      set: p => S.set(p),
      counts: () => {
        const lv = S.state.geo.level;
        return {
          /* 数据包口径（验收指纹） */
          dataset: D.counts,
          facts: D.FACTS.length,
          objects: D.OBJECTS.length,
          relations: D.RELATIONS.length,
          regions: D.REGIONS.length,
          ports: D.GATES.filter(g => g.kind === 'port').length,
          airports: D.GATES.filter(g => g.kind === 'airport').length,
          nodes: D.GATES.filter(g => g.kind === 'node').length,
          streamEvents: (D.STREAM_SEQ || []).length,
          /* 当前视野 / 筛选口径 */
          visibleFacts: F.facts().length,
          factsAtLevel: F.factsAtLevel().length,
          mappableAtLevel: F.mappable(F.factsAtLevel()).length,
          level: lv,
          byLevel: {
            L1: D.FACTS.filter(f => f.level === 'L1').length,
            L2: D.FACTS.filter(f => f.level === 'L2').length,
            L3: D.FACTS.filter(f => f.level === 'L3').length
          },
          objectsShown: F.objects().length,
          relationsShown: F.relations().length,
          cards: document.querySelectorAll('#layer-fact .fcard').length,
          mapSk: document.querySelectorAll('#mapSk .sk').length,
          menuSk: document.querySelectorAll('#menuBody .mn-sk .sk').length,
          dictL3: document.querySelectorAll('#menuBody .l3').length,
          l3On: document.querySelectorAll('#menuBody .l3.on').length,
          graphNodes: (window.V03Relation && V03Relation.debug) ? V03Relation.debug().nodes : null
        };
      },
      /* 数据来源标识（内部验收口径，普通界面不展示任何来源文案）
         provenanceMeta.dataMode：real（真实公开来源，带 sourceUrl / evidence）/ generated（按同一 schema 生成）
         geo/*.geojson 的经纬度全部为真实公开数据（产区 / 港口 / 机场 / 节点） */
      provSummary: () => {
        const groups = {
          facts: D.FACTS, objects: D.OBJECTS, relations: D.RELATIONS,
          regions: D.REGIONS || [], ports: (D.GATES || []).filter(g => g.kind === 'port'),
          airports: (D.GATES || []).filter(g => g.kind === 'airport'), nodes: (D.GATES || []).filter(g => g.kind === 'node')
        };
        const counts = {}, byType = {};
        Object.keys(groups).forEach(k => {
          const m = {};
          groups[k].forEach(x => { const p = x.prov || 'generated'; m[p] = (m[p] || 0) + 1; counts[p] = (counts[p] || 0) + 1; });
          byType[k] = m;
        });
        return {
          datasetId: (D.manifest || {}).datasetId, datasetVersion: (D.manifest || {}).datasetVersion,
          collectedAt: (D.manifest || {}).collectedAt, dataMode: (D.manifest || {}).dataMode,
          counts, byType,
          sources: (D.PKG && D.PKG.SOURCES ? D.PKG.SOURCES.length : 0),
          evidence: (D.PKG && D.PKG.EVIDENCE ? D.PKG.EVIDENCE.length : 0)
        };
      },
      /* 生成记录再平衡摘要（内部验收：真实记录零改动，生成记录按分层 + 地理分档调整） */
      rebalanceSummary: () => {
        const raw = (window.__AGRI_PKG__ || {}).facts || [];
        const byId = {};
        raw.forEach(r => { byId[r.factId] = r; });
        let realUnchanged = 0, realTotal = 0, genChanged = 0;
        const coverage = {};
        (window.V03Data.FACTS || []).forEach(f => {
          const r = byId[f.id]; if (!r) return;
          const orig = { date: String(r.occurredAt || r.timestamp).slice(0, 10), cred: (r.credibility || {}).band, severity: r.severity };
          if (f.prov === 'real') {
            realTotal++;
            if (f.date === orig.date && f.cred === orig.cred && f.severity === orig.severity) realUnchanged++;
          } else if (f.date !== orig.date || f.cred !== orig.cred || f.severity !== orig.severity) genChanged++;
          if (S.state.geo.level === f.level) {
            const key = f.provinceCode || (f.regionPath || []).map(p => p.code).join('/');
            coverage[key] = (coverage[key] || 0) + 1;
          }
        });
        return {
          applied: !!(window.V03Pkg && window.V03Pkg.REBALANCE), rules: (window.V03Pkg && window.V03Pkg.REBALANCE) || null,
          realTotal, realUnchanged, generatedChanged: genChanged,
          defaultFilters: { time: S.state.time, cred: S.state.cred, infl: S.state.infl },
          defaultViewFacts: F.factsAtLevel(S.state).length,
          defaultViewPoints: F.mappable(F.factsAtLevel(S.state)).length,
          defaultViewRegions: Object.keys(coverage).length
        };
      },
      text: sel => { const n = document.querySelector(sel); return n ? n.textContent : ''; },
      tab: () => (document.querySelector('#tabs button.on') || {}).dataset ? document.querySelector('#tabs button.on').dataset.tab : null,
      overflow: () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      streamLines: () => document.querySelectorAll('#streamBody .st-line').length,
      flashIds: () => (window.V03Fact && V03Fact.flashIds) ? V03Fact.flashIds() : []
    };
    window.__AGRI_READY = true;
  }
  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') boot();
})();
