/* ============================================================
   AgriLink 农链 V1.0 · 视觉校准骨架（V2 指令）
   G1 顶部 24px 轻量工具条：菜单显隐 · 🌾 AgriLink · 三 TAB · 流水显隐 · 卡片显隐 · 设置
   F2 左侧菜单四段：数据概览 / 分类筛选（F3 字典）/ 地图快捷控制 / 地图快捷键总开关
   F6 右下角快捷键组 + 正上方缩放 ±（同一组状态，菜单内同步）
   F7 底部横向图例（各层自行填充；不进入菜单）
   F10/A5 右侧嵌套抽屉：事实详情 / 本体详情 / 关系详情逐层展开
   F8 底部窄条流水（产品语言，无技术字段）
   ============================================================ */
(function () {
  const D = window.V03Data, S = window.V03Store, F = window.V03Filter;
  const D3 = window.V03DictF3 || null;
  const $ = id => document.getElementById(id);
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };

  /* ---------- 线性图标（同一套，浅色背景清晰可辨） ---------- */
  const ICON = {
    menu:    ['M3 6h12', 'M3 11h18', 'M3 16h12', 'M18 6h3'],
    stream:  ['M3 5h18v14H3z', 'M6.5 9.5l2.5 2.5-2.5 2.5', 'M12 14.5h4'],
    cards:   ['M3.5 4.5h7v15h-7z', 'M13 4.5h7.5v8H13z', 'M13 14.5h7.5V19.5H13z'],
    gear:    ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M12 2.8v2.6', 'M12 18.6v2.6', 'M2.8 12h2.6', 'M18.6 12h2.6', 'M5.5 5.5l1.8 1.8', 'M16.7 16.7l1.8 1.8', 'M18.5 5.5l-1.8 1.8', 'M7.3 16.7l-1.8 1.8'],
    cube3d:  ['M12 2.8 3.8 7.1v9.8L12 21.2l8.2-4.3V7.1L12 2.8Z', 'M3.8 7.1 12 11.4l8.2-4.3', 'M12 11.4v9.8'],
    radar:   ['M12 3.4a8.6 8.6 0 1 1 0 17.2 8.6 8.6 0 0 1 0-17.2Z', 'M12 7.8a4.2 4.2 0 1 1 0 8.4 4.2 4.2 0 0 1 0-8.4Z'],
    expand:  ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
    video:   ['M3 6.5h12.5v11H3z', 'M15.5 11l5.5-3.2v8.4L15.5 13'],
    sprout:  ['M12 20.5V10', 'M12 10c0-4-3.4-6.2-8-6.2 0 4.2 3.2 6.2 8 6.2Z', 'M12 13.6c0-3.2 3.6-5.2 8-5.2 0 3.2-3.2 5.2-8 5.2Z'],
    anchor:  ['M12 3.6a2.1 2.1 0 1 0 0 4.2 2.1 2.1 0 0 0 0-4.2Z', 'M12 7.8v12', 'M5 13.4c0 5 3 7.4 7 7.4s7-2.4 7-7.4', 'M3.6 13.4h2.8', 'M17.6 13.4h2.8'],
    calendar:['M4.5 6.2h15v13.3h-15z', 'M4.5 10.3h15', 'M8.4 3.8v4', 'M15.6 3.8v4'],
    shield:  ['M12 3.2 5.4 6v6.1c0 4.8 2.9 7.9 6.6 8.7 3.7-.8 6.6-3.9 6.6-8.7V6L12 3.2Z', 'M9.2 12.1l2 2 3.6-3.9'],
    gauge:   ['M4 17.4a8.6 8.6 0 1 1 16 0', 'M12 17.4l4-5.4'],
    search:  ['M11 4.2a6.8 6.8 0 1 0 0 13.6 6.8 6.8 0 0 0 0-13.6Z', 'M16.1 16.1 21 21'],
    legend:  ['M4 6.5h3M10 6.5h10', 'M4 12h3M10 12h10', 'M4 17.5h3M10 17.5h10'],
    play:    ['M8.5 5.4 19 12 8.5 18.6V5.4Z'],
    plus:    ['M12 5v14', 'M5 12h14'],
    minus:   ['M5 12h14'],
    close:   ['M6 6l12 12', 'M18 6 6 18']
  };
  const svg = (name, size) => '<svg viewBox="0 0 24 24" width="' + (size || 15) + '" height="' + (size || 15) +
    '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
    (ICON[name] || []).map(d => '<path d="' + d + '"/>').join('') + '</svg>';

  /* ---------- 提示 / Logo ---------- */
  let toastTimer = null;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), 2200);
  }
  let shakeTimer = null;
  function shakeLogo() {
    const l = $('logo'); if (!l) return;
    l.classList.remove('shake'); void l.offsetWidth; l.classList.add('shake');
    clearTimeout(shakeTimer); shakeTimer = setTimeout(() => l.classList.remove('shake'), 700);
  }

  /* ---------- 三 TAB ---------- */
  const TABS = [{ id: 'fact', n: '事实层' }, { id: 'relation', n: '关联层' }, { id: 'sim', n: '推演层' }];
  function renderTabs() {
    const box = $('tabs');
    if (!box.dataset.built) {
      box.dataset.built = '1';
      TABS.forEach(t => {
        const b = el('button'); b.setAttribute('role', 'tab'); b.dataset.tab = t.id; b.textContent = t.n;
        b.onclick = () => S.set({ tab: t.id, menu: false }); box.appendChild(b);
      });
    }
    [...box.children].forEach(b => {
      const on = S.state.tab === b.dataset.tab;
      b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on));
    });
  }

  function renderTopIcons() {
    const st = S.state;
    const set = (btn, on) => { btn.classList.toggle('on', !!on); btn.setAttribute('aria-pressed', String(!!on)); };
    set($('btnStream'), st.panels.stream && st.tab !== 'sim');
    set($('btnCards'), st.panels.cards && st.tab !== 'sim');
    set($('menuBtn'), st.menu);
    $('btnStream').disabled = st.tab === 'sim';
    $('btnCards').disabled = st.tab === 'sim';
    $('btnSettings').title = '设置';
  }

  /* ---------- F6：快捷键（地图右下角 + 菜单内同一组状态） ---------- */
  const TIME_OPTS = [['7d', '7 天'], ['30d', '30 天'], ['90d', '90 天'], ['all', '全部']];
  const CRED_OPTS = [['high', '高'], ['mid', '中'], ['low', '低'], ['all', '不限']];
  const INFL_OPTS = [['high', '高'], ['mid', '中'], ['low', '低'], ['all', '不限']];
  const SK = [
    { k: 'zoomIn', i: 'plus', n: '放大', d: '放大地图', kind: 'zoom', dir: 1 },
    { k: 'zoomOut', i: 'minus', n: '缩小', d: '缩小地图', kind: 'zoom', dir: -1 },
    { k: 'mode3d', i: 'cube3d', n: '2D / 3D', d: '切换二维地图与三维地球', kind: 'sw', get: s => s.sk.mode3d, set: v => ({ sk: { mode3d: v } }) },
    { k: 'influence', i: 'radar', n: '影响力动画', d: '事实影响范围与扩散表现', kind: 'sw', get: s => s.sk.influence, set: v => ({ sk: { influence: v } }) },
    { k: 'fullscreen', i: 'expand', n: '全屏', d: '浏览器全屏显示地图', kind: 'sw', get: s => s.sk.fullscreen, set: v => ({ sk: { fullscreen: v } }) },
    { k: 'live', i: 'video', n: '直播流', d: '卡片内接入可播放的公开视频源', kind: 'sw', get: s => s.sk.live, set: v => ({ sk: { live: v } }) },
    { k: 'regions', i: 'sprout', n: '主要产区', d: '标注主要农产品产区', kind: 'sw', get: s => s.sk.regions, set: v => ({ sk: { regions: v } }) },
    { k: 'gates', i: 'anchor', n: '港口机场', d: '标注主要贸易港口与机场', kind: 'sw', get: s => s.sk.gates, set: v => ({ sk: { gates: v } }) },
    { k: 'time', i: 'calendar', n: '时间范围', d: '事实时间窗口；预留时间轴播放位', kind: 'sel', opts: TIME_OPTS, get: s => s.time, set: v => ({ time: v }) },
    { k: 'cred', i: 'shield', n: '可信度', d: '可信度阈值：高 = 仅高可信', kind: 'sel', opts: CRED_OPTS, get: s => s.cred, set: v => ({ cred: v }) },
    { k: 'infl', i: 'gauge', n: '影响等级', d: '影响等级阈值：高 = 仅高影响', kind: 'sel', opts: INFL_OPTS, get: s => s.infl, set: v => ({ infl: v }) },
    { k: 'search', i: 'search', n: '搜索', d: '按关键词搜索', kind: 'input', get: s => s.q, set: v => ({ q: v }) },
    { k: 'legend', i: 'legend', n: '图例', d: '显示 / 隐藏底部图例', kind: 'sw', get: s => s.sk.legend, set: v => ({ sk: { legend: v } }) }
  ];
  const skVal = (sk, s) => (sk.kind === 'sw' ? (sk.get(s) ? '开' : '关')
    : sk.kind === 'zoom' ? '' : sk.kind === 'input' ? (s.q ? '已设' : '空') : (sk.opts.find(o => o[0] === sk.get(s)) || ['', '—'])[1]);

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
        const b = el('button', 'sk-opt reserved', svg('play', 12) + '<span>时间轴播放</span>');
        b.onclick = () => { closePop(); toast('时间轴播放为本期预留功能'); };
        box.appendChild(b);
      }
    } else if (sk.kind === 'input') {
      const inp = el('input', 'sk-input');
      inp.type = 'search'; inp.value = S.state.q; inp.placeholder = '关键词';
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
    const na = st.tab === 'relation' ? ['mode3d'] : [];
    mount.innerHTML = '';
    mount.classList.toggle('menu-mode', mode === 'menu');
    SK.forEach((sk, idx) => {
      const api = layerApi();
      const zs = (sk.kind === 'zoom' && api && api.zoomState) ? api.zoomState() : null;
      const on = sk.kind === 'sw' ? !!sk.get(st) : false;   /* zoom 为即时动作键 */
      const b = el('button', 'sk' + (on ? ' on' : '') + (sk.kind === 'zoom' ? ' zoom' : ''));
      b.dataset.k = sk.k;
      b.title = sk.n + '：' + sk.d;
      b.innerHTML = '<span class="sk-i">' + svg(sk.i, mode === 'menu' ? 14 : 13) + '</span>' +
        (mode === 'menu' ? '<span class="sk-n">' + sk.n + '</span><span class="sk-v">' + skVal(sk, st) + '</span>' : '<span class="sk-v">' + skVal(sk, st) + '</span>');
      b.setAttribute('aria-pressed', String(!!(sk.get && sk.get(st))));
      if (na.includes(sk.k)) { b.disabled = true; b.title = sk.n + '：关联层为地理关联视图'; }
      if (sk.kind === 'zoom') {
        if (!api || !api.zoomBy) { b.disabled = true; b.title = sk.n + '：当前层不支持缩放'; }
        else if (zs && ((sk.dir > 0 && !zs.canIn) || (sk.dir < 0 && !zs.canOut))) { b.disabled = true; b.title = sk.n + '：已到边界'; }
      }
      b.onclick = () => {
        if (sk.kind === 'zoom') { const a = layerApi(); if (a && a.zoomBy) a.zoomBy(sk.dir); return; }
        if (sk.kind === 'sw') {
          if (sk.k === 'fullscreen') return toggleFullscreen(!st.sk.fullscreen);
          S.set(sk.set(!sk.get(st)));
        } else openPop(sk, b, () => renderShortcutBar(mount, opts));
      };
      mount.appendChild(b);
    });
  }

  /* ---------- F6：缩放（快捷键组正上方；到边界禁用） ---------- */
  function layerApi() {
    const key = S.state.tab === 'relation' ? 'V03Relation' : S.state.tab === 'fact' ? 'V03Fact' : null;
    return key ? window[key] : null;
  }
  function renderZoom() { /* 缩放键已并入左下角快捷键组（两排） */ }

  function renderMapSk() {
    const box = $('mapSk'), st = S.state;
    const show = st.panels.shortcuts && st.tab !== 'sim';
    box.style.display = show ? 'grid' : 'none';
    if (!show) { closePop(); return; }
    renderShortcutBar(box, { mode: 'map' });
  }

  function toggleFullscreen(on) {
    const de = document.documentElement;
    const p = on ? (de.requestFullscreen && de.requestFullscreen()) : (document.exitFullscreen && document.exitFullscreen());
    if (p && p.catch) p.catch(err => { S.set({ sk: { fullscreen: false } }); toast('当前环境不允许全屏：' + (err && err.message ? err.message : '被浏览器拒绝')); });
  }

  /* ---------- F2：左侧菜单四段 ---------- */
  function renderMenu() {
    const st = S.state, body = $('menuBody');
    $('menu').classList.toggle('on', st.menu);
    $('menu').setAttribute('aria-hidden', String(!st.menu));
    if (!st.menu) return;

    const ov = F.overview(st);
    const isRel = st.tab === 'relation';
    const tree = isRel ? F.REL_TREE : F.FACT_TREE;
    const items = isRel ? F.REL_ITEMS : F.FACT_ITEMS;
    const field = isRel ? 'relKeys' : 'catKeys';
    const onSet = F.selected(st, field, items);

    body.innerHTML = '';

    /* ① 数据概览（F2 固定四项；不含事实类型分布） */
    const s1 = el('section', 'mn-sec');
    s1.appendChild(el('div', 'mn-h', '数据概览'));
    s1.appendChild(el('div', 'mn-ov', ov.rows.map(([k, v]) => '<div class="ov-i"><span>' + k + '</span><b>' + v + '</b></div>').join('')));
    body.appendChild(s1);

    /* ② 图层数据分类筛选（F3 三级字典 / A2 九类对象域） */
    const s2 = el('section', 'mn-sec');
    s2.appendChild(el('div', 'mn-h', isRel ? '本体分类筛选' : '图层数据分类筛选'));
    tree.forEach(g => {
      const blk = el('div', 'mn-grp');
      blk.appendChild(el('div', 'mn-l1', (g.color ? '<i style="background:' + g.color + '"></i>' : '') + '<span>' + g.n + '</span>'));
      g.subs.forEach(sub => {
        blk.appendChild(el('div', 'mn-l2', sub.n));
        const row = el('div', 'mn-l3');
        sub.items.forEach(it => {
          const on = onSet.has(it.key);
          const b = el('button', 'l3' + (on ? ' on' : ''));
          b.dataset.key = it.key;
          b.title = it.n;
          b.innerHTML = '<span>' + (it.e ? it.e + ' ' : '') + it.n + '</span>';
          b.setAttribute('aria-pressed', String(on));
          b.onclick = () => S.set(F.toggleLeaf(S.state, field, items, it.key));
          row.appendChild(b);
        });
        blk.appendChild(row);
      });
      s2.appendChild(blk);
    });
    const quick = el('div', 'mn-quick');
    const bAll = el('button', 'ghost sm', '全选');
    bAll.onclick = () => S.set({ [field]: null });
    const bNone = el('button', 'ghost sm', '全不选');
    bNone.onclick = () => S.set({ [field]: [] });
    quick.appendChild(bAll); quick.appendChild(bNone);
    quick.appendChild(el('span', 'mn-tip', '三级事实类型决定地图筛选与图例；默认全选'));
    s2.appendChild(quick);
    body.appendChild(s2);

    /* ③ 地图快捷控制（与地图右下角同一组状态） */
    const s3 = el('section', 'mn-sec');
    s3.appendChild(el('div', 'mn-h', '地图快捷控制'));
    const bar = el('div', 'mn-sk');
    renderShortcutBar(bar, { mode: 'menu' });
    s3.appendChild(bar);
    body.appendChild(s3);
    /* ④ 地图快捷键总开关（独立一段） */
    const s4 = el('section', 'mn-sec');
    s4.appendChild(el('div', 'mn-h', '地图快捷键总开关'));
    const master = el('label', 'mn-master');
    master.innerHTML = '<input type="checkbox" id="skMaster"' + (st.panels.shortcuts ? ' checked' : '') + '>' +
      '<span><b>地图快捷键</b><small>只控制地图右下角整组快捷键；关闭后本面板快捷控制仍可用</small></span>';
    master.querySelector('input').onchange = e => S.set({ panels: { shortcuts: e.target.checked } });
    s4.appendChild(master);
    body.appendChild(s4);
  }

  /* ---------- F8：底部流水（产品语言；无技术字段与计数） ---------- */
  const ST = { i: 0, timer: null, lastTab: null, started: false };
  const REL_STAGES = { link: 1, graph: 1, resolve: 1, score: 1 };
  const STAGE_LABEL = { ingest: '接入', extract: '抽取', resolve: '归并', geo: '定位', score: '评分', link: '关联', graph: '图谱', warn: '提醒' };
  function seqBatches(events) {
    const out = [];
    events.forEach(e => {
      const b = String(e.seq || '').split('.')[0];
      if (!out.length || out[out.length - 1].b !== b) out.push({ b, t: e.t, items: [] });
      out[out.length - 1].items.push(e);
    });
    return out;
  }
  const SEQ = D.STREAM_SEQ || [];
  const BATCHES = { fact: seqBatches(SEQ), relation: seqBatches(SEQ.filter(e => REL_STAGES[e.stage])) };
  const SPEED = 2.6;
  /* 流水文案：产品语言（接入 / 定位 / 影响 / 关联 / 入库），不显示内部 id、层级、生成器与规则名 */
  function productLines(e) {
    const f = e.factId ? D.factById(e.factId) : null;
    const leaf = (f && F.leafOf && F.leafOf(f)) || null;
    const kind = leaf ? leaf.n : (f ? (D.CATS[f.cat] || {}).n : '');
    const where = f ? String(f.region || '').split(' · ')[0] : '';
    const out = {
      ingest: [['接入', '接入' + (where ? where + '的' : '') + (kind || '行业') + '事实']],
      extract: [['抽取', '抽取事实要点：' + (f ? String(f.title).slice(0, 18) : '行业信息') + '…']],
      resolve: [['归并', '主体归一完成' + (where ? ' · ' + where : '')]],
      geo: [['定位', '完成地理定位' + (where ? ' · ' + where : '') + (f && f.lat != null ? '（' + Math.abs(f.lat).toFixed(1) + '°' + (f.lat >= 0 ? 'N' : 'S') + '）' : '')]],
      score: [['评分', '完成可信度与影响等级判定' + (f ? '：' + (f.cred === 'high' ? '高可信' : '中可信') + ' / ' + (f.impact === 'high' ? '高影响' : f.impact === 'mid' ? '中影响' : '低影响') : '')]],
      link: [['关联', '关联 ' + (f ? (f.objects || []).length : 2) + ' 个本体对象']],
      graph: [['图谱', '影响范围生成：半径约 ' + (f ? f.radius : 120) + ' km']],
      warn: [['提醒', '待复核口径 1 条，已标记']]
    };
    return (out[e.stage] || out.ingest)[0];
  }
  function pushStreamLine(e) {
    const body = $('streamBody');
    if (!body || !e) return;
    const [k, text] = productLines(e);
    const row = el('div', 'st-line');
    row.appendChild(el('span', 'k' + (e.stage === 'warn' ? ' warn' : ''), k));
    row.appendChild(el('span', 't', new Date().toTimeString().slice(0, 8)));
    row.appendChild(el('span', 'tx', text));
    body.appendChild(row);
    while (body.children.length > 60) body.removeChild(body.firstChild);
    body.scrollTop = body.scrollHeight;
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
    const roll = ST.i % 5;
    let gap = Math.max(360, Math.min(2600, raw / SPEED)) + Math.random() * 180;
    if (roll === 0) gap = gap * 2.4 + 1200; else if (roll === 2) gap = 140;
    ST.timer = setTimeout(scheduleStream, gap);
  }
  function syncStream() {
    const st = S.state, box = $('streamBox');
    const on = st.tab !== 'sim' && st.panels.stream;
    box.classList.toggle('on', on);
    document.documentElement.style.setProperty('--stream-h', on ? '132px' : '0px');
    document.documentElement.style.setProperty('--side-w',
      (st.tab === 'fact' || st.tab === 'relation') && st.panels.cards ? '420px' : '0px');
    const seq = BATCHES[st.tab === 'relation' ? 'relation' : 'fact'];
    if (ST.lastTab !== st.tab || !ST.started) {
      ST.lastTab = st.tab; ST.i = 0; ST.started = true; $('streamBody').innerHTML = '';
      const first = seq[0];
      if (first) { first.items.forEach(pushStreamLine); ST.i = 1; }
    }
    if (on && !ST.timer) scheduleStream();
    if (!on) { clearTimeout(ST.timer); ST.timer = null; }
  }

  /* ---------- F10 / A5：右侧嵌套抽屉 ---------- */
  function drawerStack() {
    const st = S.state;
    if (st.tab === 'fact') return st.factId ? [{ kind: 'fact', id: st.factId }] : [];
    if (st.tab === 'relation') {
      const stack = Array.isArray(st.rel.stack) ? st.rel.stack.filter(x => x && x.id) : [];
      if (stack.length) return stack;
      return st.rel.sel ? [{ kind: st.rel.kind === 'relation' ? 'relation' : 'object', id: st.rel.sel }] : [];
    }
    return [];
  }
  function popDrawer() {
    const st = S.state;
    if (st.tab === 'fact') return S.set({ factId: null, logOpen: false });
    const stack = drawerStack();
    if (!stack.length) return;
    if (stack.length === 1) return S.set({ rel: { sel: null, kind: null, stack: [] } });
    const next = stack.slice(0, -1);
    const top = next[next.length - 1];
    S.set({ rel: { stack: next, sel: top.id, kind: top.kind } });
  }
  function syncDrawers() {
    const stack = drawerStack();
    const box = $('drawerStack');
    const sig = JSON.stringify([S.state.tab, stack, S.state.logOpen, S.state.sk.live]);
    if (box.dataset.sig === sig) return;
    box.dataset.sig = sig;
    box.innerHTML = '';
    box.style.pointerEvents = stack.length ? 'auto' : 'none';
    stack.forEach((d, i) => {
      const wrap = el('div', 'drawer');
      const isTop = i === stack.length - 1;
      const head = el('div', 'drawer-head');
      const title = d.kind === 'fact' ? '事实详情' : d.kind === 'relation' ? '关联详情' : '本体详情';
      head.innerHTML = '<b>' + title + '</b><span class="sp"></span>';
      if (stack.length > 1 && isTop) {
        const back = el('button', 'drawer-back', '← 返回');
        back.onclick = () => popDrawer();
        head.appendChild(back);
      }
      const x = el('button', 'drawer-x', '×');
      x.onclick = () => (stack.length > 1 ? popDrawer() : S.set(d.kind === 'fact' ? { factId: null, logOpen: false } : { rel: { sel: null, kind: null, stack: [] } }));
      head.appendChild(x);
      wrap.appendChild(head);
      const bodyEl = el('div', 'drawer-body');
      wrap.appendChild(bodyEl);
      box.appendChild(wrap);
      const mod = d.kind === 'fact' ? window.V03Fact : window.V03Relation;
      try {
        if (d.kind === 'fact' && mod && mod.renderDetail) mod.renderDetail(bodyEl);
        else if (mod && mod.renderDrawer) mod.renderDrawer(bodyEl, d);
      } catch (e) { console.error('drawer', e); }
    });
  }
  const drawerStackApi = { top: () => drawerStack()[drawerStack().length - 1] || null, push: d => { const cur = drawerStack(); S.set({ rel: { stack: cur.concat([d]), sel: d.id, kind: d.kind } }); }, pop: popDrawer };

  /* ---------- 设置（口令 123321；本期空白页） ---------- */
  const PW = '123321';
  function renderSettings() {
    const st = S.state;
    $('pwBox').classList.toggle('on', st.settings.gate && !st.settings.authed);
    $('settingsPage').classList.toggle('on', st.settings.authed);
    if (st.settings.gate && !st.settings.authed) {
      const inp = $('pwInput');
      if (document.activeElement !== inp) setTimeout(() => inp.focus(), 30);
    }
  }
  function bindSettings() {
    $('pwOk').onclick = () => {
      if ($('pwInput').value.trim() === PW) { $('pwInput').value = ''; S.set({ settings: { gate: false, authed: true } }); }
      else { $('pwHint').textContent = '口令不正确'; $('pwInput').value = ''; }
    };
    $('pwCancel').onclick = () => S.set({ settings: { gate: false } });
    $('pwInput').onkeydown = e => { if (e.key === 'Enter') $('pwOk').click(); };
    $('setBack').onclick = () => S.set({ settings: { authed: false } });
  }

  /* ---------- 图层装配 ---------- */
  const dirty = { fact: true, relation: true, sim: true };
  const markDirty = () => { dirty.fact = dirty.relation = dirty.sim = true; };
  function mountLayers() {
    ['fact', 'relation', 'sim'].forEach(k => {
      const m = window['V03' + k[0].toUpperCase() + k.slice(1)];
      if (m && m.mount) { try { m.mount($('layer-' + k)); } catch (e) { console.error('mount ' + k, e); } }
    });
  }
  function refreshLayers(force) {
    const st = S.state;
    ['fact', 'relation', 'sim'].forEach(k => {
      const node = $('layer-' + k), active = st.tab === k;
      node.classList.toggle('on', active);
      const m = window['V03' + k[0].toUpperCase() + k.slice(1)];
      if (!m || !m.update) return;
      if (active && (force || dirty[k])) { dirty[k] = false; try { m.update(); } catch (e) { console.error('update ' + k, e); } }
    });
  }

  function regMaps() {
    try { if (window.__CHINA_GEO && window.echarts && !echarts.getMap('china')) echarts.registerMap('china', window.__CHINA_GEO); }
    catch (e) { console.error('registerMap china', e); }
  }

  function onKey(e) {
    if (e.key !== 'Escape') return;
    const st = S.state;
    if (st.settings.gate) return void S.set({ settings: { gate: false } });
    if (pop) return closePop();
    if (drawerStack().length) return popDrawer();
    if (st.menu) return S.set({ menu: false });
  }

  function bindOnce() {
    /* G1：顶部图标（同一套线性 SVG） */
    $('menuBtn').innerHTML = svg('menu', 14);
    $('btnStream').innerHTML = svg('stream', 14);
    $('btnCards').innerHTML = svg('cards', 14);
    $('btnSettings').innerHTML = svg('gear', 14);
    $('menuBtn').onclick = () => S.set({ menu: !S.state.menu });
    $('menuClose').onclick = () => S.set({ menu: false });
    $('btnStream').onclick = () => { if (S.state.tab !== 'sim') S.set({ panels: { stream: !S.state.panels.stream } }); };
    $('btnCards').onclick = () => { if (S.state.tab !== 'sim') S.set({ panels: { cards: !S.state.panels.cards } }); };
    $('btnSettings').onclick = () => S.set({ settings: { gate: true, authed: false } });
    $('streamClose').onclick = () => S.set({ panels: { stream: false } });
    bindSettings();
    document.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', () => S.set({ sk: { fullscreen: !!document.fullscreenElement } }));
  }

  /* ---------- 启动 ---------- */
  function boot() {
    regMaps();
    bindOnce();
    mountLayers();
    S.on((st, changed) => {
      markDirty();
      renderTabs(); renderTopIcons(); renderMenu(); renderMapSk(); renderZoom(); syncStream(); renderSettings(); syncDrawers();
      refreshLayers(false);
      if (changed.some(k => ['time', 'cred', 'infl', 'q', 'catKeys', 'relKeys', 'geo', 'tab', 'rel', 'sk', 'carry'].includes(k))) shakeLogo();
    });
    S.onEvent('toast', toast);
    S.onEvent('jump', p => { if (p && p.tab) S.set({ tab: p.tab }); });
    window.V03Shell = {
      setLegend: html => { const box = $('legend'); if (box) { box.innerHTML = html; box.style.display = (S.state.sk.legend && html) ? '' : 'none'; } },
      drawers: drawerStackApi,
      toast
    };
    renderTabs(); renderTopIcons(); renderMenu(); renderMapSk(); renderZoom(); renderSettings();
    syncStream(); refreshLayers(true); syncDrawers();
    window.V03_DEBUG = {
      state: () => JSON.parse(JSON.stringify(S.state)),
      set: p => S.set(p),
      counts: () => ({
        dataset: D.counts,
        facts: D.FACTS.length, objects: D.OBJECTS.length, relations: D.RELATIONS.length,
        regions: D.REGIONS.length, ports: D.GATES.filter(g => g.kind === 'port').length,
        airports: D.GATES.filter(g => g.kind === 'airport').length, nodes: D.GATES.filter(g => g.kind === 'node').length,
        streamEvents: (D.STREAM_SEQ || []).length,
        visibleFacts: F.facts().length, factsAtLevel: F.factsAtLevel().length,
        mappableAtLevel: F.mappable(F.factsAtLevel()).length, level: S.state.geo.level,
        byLevel: { L1: D.FACTS.filter(f => f.level === 'L1').length, L2: D.FACTS.filter(f => f.level === 'L2').length, L3: D.FACTS.filter(f => f.level === 'L3').length },
        objectsShown: F.objects().length, relationsShown: F.relations().length,
        cards: document.querySelectorAll('#layer-fact .fcard').length,
        relCards: document.querySelectorAll('#relBody .rel-card').length,
        drawers: document.querySelectorAll('#drawerStack .drawer').length,
        dictL1: document.querySelectorAll('#menuBody .mn-l1').length,
        dictL2: document.querySelectorAll('#menuBody .mn-l2').length,
        dictL3: document.querySelectorAll('#menuBody .l3').length,
        dictL3On: document.querySelectorAll('#menuBody .l3.on').length,
        mapSk: document.querySelectorAll('#mapSk .sk').length,
        menuSk: document.querySelectorAll('#menuBody .mn-sk .sk').length,
        zoom: document.querySelectorAll('#mapZoom button').length,
        legendItems: document.querySelectorAll('#legend .lg-i').length
      }),
      provSummary: () => {
        const groups = {
          facts: D.FACTS, objects: D.OBJECTS, relations: D.RELATIONS, regions: D.REGIONS || [],
          ports: (D.GATES || []).filter(g => g.kind === 'port'),
          airports: (D.GATES || []).filter(g => g.kind === 'airport'), nodes: (D.GATES || []).filter(g => g.kind === 'node')
        };
        const counts = {}, byType = {};
        Object.keys(groups).forEach(k => {
          const m = {};
          groups[k].forEach(x => { const p = x.prov || 'generated'; m[p] = (m[p] || 0) + 1; counts[p] = (counts[p] || 0) + 1; });
          byType[k] = m;
        });
        return {
          datasetId: (D.manifest || {}).datasetId, collectedAt: (D.manifest || {}).collectedAt, counts, byType,
          sources: (D.PKG && D.PKG.SOURCES ? D.PKG.SOURCES.length : 0),
          evidence: (D.PKG && D.PKG.EVIDENCE ? D.PKG.EVIDENCE.length : 0)
        };
      },
      rebalanceSummary: () => {
        const raw = (window.__AGRI_PKG__ || {}).facts || [];
        const byId = {}; raw.forEach(r => { byId[r.factId] = r; });
        let realUnchanged = 0, realTotal = 0, genChanged = 0;
        (D.FACTS || []).forEach(f => {
          const r = byId[f.id]; if (!r) return;
          const orig = { date: String(r.occurredAt || r.timestamp).slice(0, 10), cred: (r.credibility || {}).band, severity: r.severity };
          if (f.prov === 'real') { realTotal++; if (f.date === orig.date && f.cred === orig.cred && f.severity === orig.severity) realUnchanged++; }
          else if (f.date !== orig.date || f.cred !== orig.cred || f.severity !== orig.severity) genChanged++;
        });
        return { realTotal, realUnchanged, generatedChanged: genChanged, defaultFilters: { time: S.state.time, cred: S.state.cred, infl: S.state.infl },
          defaultViewFacts: F.factsAtLevel(S.state).length, defaultViewPoints: F.mappable(F.factsAtLevel(S.state)).length };
      },
      text: sel => { const n = document.querySelector(sel); return n ? n.textContent : ''; },
      overflow: () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      topbarHeight: () => document.querySelector('.topbar').getBoundingClientRect().height,
      streamLines: () => document.querySelectorAll('#streamBody .st-line').length,
      flashIds: () => (window.V03Fact && V03Fact.flashIds) ? V03Fact.flashIds() : [],
      dictF3: () => (D3 ? { groups: D3.GROUPS.length, items: D3.ITEMS.length } : null)
    };
    window.__AGRI_READY = true;
  }
  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') boot();
})();
