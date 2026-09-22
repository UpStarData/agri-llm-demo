/* ============================================================
   农链 AgriLink — 层控制器（Prezi 相机切场 / 数据对象驱动导航）
   导航原则：没有「下一步」按钮；所有导航都发生在数据对象上。
   返回方式：滚轮缩小 / 点击空白 / Esc / 面包屑（并恢复上层位姿）
   ============================================================ */
(function () {
  const D = window.AGRI_DATA;
  const $ = id => document.getElementById(id);
  const FLIGHT = 1400;                 // 层间相机飞行 1.4s（规范 1.2–1.6s）

  const S = window.AGRI = {
    layer: 0, sel: null, flying: false, seen: {}, log: [],
    l1: { flow: null },
    l2: { prov: null, line: null, direct: null, hub: null },
    l3: { prov: null, city: null },
    l4: { city: null, stage: 0, importId: null },
    cam: { 2: null, 3: { prov: null, pose: null } }
  };
  const UI = window.AGRI_UI = {};

  let map2 = null, map3 = null, wheelOut = 0, lastWheel = 0;
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ---------------- 工具 ---------------- */
  const sceneEl = l => $('scene-l' + l);
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 2600);
  }
  const flowObj = f => ({ type: 'flow', id: f.id, label: f.country, raw: f, cal: D.cal.trade });
  const provObj = p => ({ type: 'prov', id: p, label: p, raw: D.provinces[p], cal: D.cal.supply });
  const plineObj = x => ({ type: 'pline', id: x.from + '>' + x.to, label: `${x.from} → ${x.to}`, raw: x, cal: D.cal.inter });
  const directObj = f => ({ type: 'market', id: f.id, label: `${f.country} → ${f.market}`, raw: f, cal: D.cal.market });

  /* ---------------- 层间相机切场（Prezi 画布） ---------------- */
  function dolly(from, to, dir) {
    const a = sceneEl(from), b = sceneEl(to);
    S.flying = true;
    b.removeAttribute('inert');                     // 进场层可交互（离场层等切场结束再 inert）
    b.dataset.pose = dir > 0 ? 'under' : 'over';   // 更深一层从画布下方推入 / 更浅一层从远处退回
    b.classList.add('cur');
    void b.offsetWidth;                            // 强制回流：起始位姿必须先生效
    a.dataset.pose = dir > 0 ? 'over' : 'under';
    b.removeAttribute('data-pose');
    setTimeout(() => { a.classList.remove('cur'); a.removeAttribute('data-pose'); a.setAttribute('inert', ''); }, FLIGHT + 140);
    setTimeout(() => { S.flying = false; }, FLIGHT);
    S.log.push({ t: Date.now(), ev: 'fly', from, to, dir });
  }

  function goTo(n, opts) {
    opts = opts || {};
    if (n === S.layer || n < 1 || n > 4) return false;
    if (S.flying && !opts.force) return false;
    const from = S.layer, dir = n > S.layer ? 1 : -1;
    prepare(n);
    saveExit(from);
    if (from > 0) dolly(from, n, dir);
    else { sceneEl(n).classList.add('cur'); sceneEl(n).removeAttribute('inert'); }
    S.layer = n;
    if (n === 2) S.sel = null;
    if (n === 3) S.sel = null;
    renderCrumbs(); renderSide();
    setTimeout(() => layerEnter(n), from > 0 ? FLIGHT : 30);
    return true;
  }
  function goUp() {
    if (window.AGRI_CHAIN.drawerOpen()) { window.AGRI_CHAIN.closeDrawer(); return true; }
    return goTo(S.layer - 1);
  }

  function saveExit(l) {
    if (l === 2 && map2) S.cam[2] = map2.getPose();
    if (l === 3 && map3) S.cam[3] = { prov: S.l3.prov, pose: map3.getPose() };
  }
  function prepare(n) {
    if (n === 2) {
      if (!S.seen[2]) { map2.renderL2(); S.pendingFocusChina = S.l1.flow; }
      else map2.setPose(S.cam[2] || map2.home());
      S.l2.prov = null; S.l2.line = null; S.l2.hub = null;
      map2.selectProvince(null);            // 回到 L2 = 恢复未选中态（与上层位姿一致）
    }
    if (n === 3) {
      const prov = S.l3.prov || '山东';
      S.l3.prov = prov;
      map3.renderL3(prov);                              // 先渲染在整图位姿，进场后再飞入
      window.AGRI_CHAIN.renderProvinceL3(prov, {});
      window.AGRI_CHAIN.l3Focus(prov, S.l3.city);       // 分析卡片始终绑定当前对象
      window.AGRI_CHAIN.closeDrawer();
    }
    if (n === 4) {
      const key = S.l4.city || chainKeyFor(S.l3.prov) || '伽师';
      S.l4.city = key;
      const ch = D.chains[key];
      if (ch && ch.kind === 'hub') {
        const cat = ch.catalog.slice();
        if (cat.indexOf(S.l4.importId) < 0) S.l4.importId = cat[0];   // 保住当前选择，否则回到第一个品类
      } else S.l4.importId = null;
      window.AGRI_CHAIN.render(key, chainHooks(), S.l4.importId);
      window.AGRI_CHAIN.closeDrawer();
    }
  }
  function layerEnter(n) {
    if (n === 1) {
      window.AGRI_GLOBE.start();
      if (!S.seen[1]) { window.AGRI_GLOBE.playIntro(); S.seen[1] = true; }
    } else window.AGRI_GLOBE.stop();
    if (n === 2) {
      if (!S.seen[2]) { map2.lightUp(170); S.seen[2] = true; }
      if (S.pendingFocusChina) { map2.flyTo([104.5, 34.5], 1.55, 1200); S.pendingFocusChina = null; }
    }
    if (n === 3) map3.focusProvince(S.l3.prov, 1350).then(() => { if (S.l3.city) map3.highlightCity(S.l3.city); });
    if (n === 4) { window.AGRI_CHAIN.light(); setSel(chainSelObj()); }
    S.log.push({ t: Date.now(), ev: 'enter', layer: n });
  }
  const chainKeyFor = prov => Object.keys(D.chains).find(k => D.chains[k].prov === prov) || null;

  /* ---------------- 数据对象交互 ---------------- */
  UI.onGlobeSelect = hit => {
    if (!hit) { setSel(null); window.AGRI_GLOBE.clearSelect(); return; }
    if (hit.kind === 'china') { S.l1.flow = null; goTo(2); return; }
    const f = D.flows.find(x => x.id === hit.id);
    if (!f) return;
    if (S.l1.flow === f.id) { goTo(2); return; }        // 再次点击 → 进入 L2
    S.l1.flow = f.id;
    window.AGRI_GLOBE.select(f.id);
    setSel(flowObj(f));
  };
  UI.onGlobeHover = (hit, info) => {
    const tip = $('gTip');
    if (!tip) return;
    if (!info) { tip.style.display = 'none'; return; }
    tip.style.display = 'block';
    const f = info.flow;
    tip.innerHTML = info.china
      ? `<b>中国</b><div class="t-row">贸易终点 · 再次点击进入全国产区层</div>`
      : `<b>${f.country}</b>
         <div class="t-row">${catTag(f.cat)}<span>${f.item}</span></div>
         <div class="t-row"><span class="t-num">${f.vol}</span><span>万吨/年（示意）</span><span class="t-num">${f.yoy > 0 ? '+' : ''}${f.yoy}%</span><span>同比</span></div>
         <div class="t-cal">${D.cal.trade} · 再次点击进入 L2</div>`;
    // 悬浮卡始终留在舞台内（贴边时自动内收）
    const cvBox = $('globe');
    tip.style.left = Math.max(8, Math.min(info.x + 14, (cvBox.clientWidth || 900) - tip.offsetWidth - 12)) + 'px';
    tip.style.top = Math.max(8, Math.min(info.y - 12, (cvBox.clientHeight || 600) - tip.offsetHeight - 8)) + 'px';
  };
  UI.onProvinceClick = name => {
    if (!D.provinces[name]) return;
    if (S.l2.prov === name) { S.l3.prov = name; S.l3.city = null; goTo(3); return; }   // 再次点击 → L3
    S.l2.prov = name; S.l2.line = null; S.l2.direct = null;
    if (map2) map2.selectProvince(name);
    setSel(provObj(name));
  };
  UI.onPlineClick = x => {
    S.l2.line = x.from + '>' + x.to; S.l2.prov = null; S.l2.direct = null;
    setSel(plineObj(x));
  };
  UI.onDirectClick = f => {
    S.l2.direct = f.id; S.l2.prov = null; S.l2.line = null;
    setSel(directObj(f));
  };
  UI.onCityClick = (prov, city) => {
    const c = D.provinces[prov].cities.find(x => x.name === city);
    if (!c) return;
    if (S.l3.city === city) {                                  // 再次点击 → L4
      if (D.chains[city]) { S.l4.city = city; goTo(4); }
      else toast('该产区代表单品链路待标定；当前已标定：伽师 · 红河蒙自 · 洛川 · 武鸣 · 长沙（红星）');
      return;
    }
    S.l3.city = city;
    if (map3) map3.highlightCity(city);
    setSel({ type: 'city', id: city, label: `${city}（${prov}）`, raw: c, cal: D.cal.supply });
    window.AGRI_CHAIN.l3Focus(prov, city);          // 左侧分析卡片切换到该产区口径
  };
  /* L2 集散枢纽（演示中心）：一次点击看口径，再次点击进入该省 L3 */
  UI.onHubClick = h => {
    if (S.l2.hub === h.id) { S.l3.prov = h.prov; S.l3.city = h.name.indexOf('·') > 0 ? h.name.split('·')[1] : null; goTo(3); return; }
    S.l2.hub = h.id; S.l2.prov = null; S.l2.line = null; S.l2.direct = null;
    if (map2) map2.selectProvince(null);
    setSel({ type: 'market', id: 'hub:' + h.id, label: `${h.name} · 集散枢纽`, raw: {
      country: h.name.split('·')[0], market: h.name, mProv: h.prov, vol: null, cat: 'fresh',
      item: D.HONGXING.role, yoy: null, hub: true, caliber: h.caliber, note: h.note
    }, cal: h.caliber, hub: h });
  };
  function chainHooks() {
    return {
      onStage: i => {
        const o = hubOrCityObj(i);
        if (o) setSel(o, true);
      },
      onEntity: e => setSel({ type: 'entity', id: e.n, label: e.n, raw: e, cal: D.cal.chain }, true),
      onPickImport: id => {
        S.l4.importId = id;
        window.AGRI_CHAIN.render(S.l4.city, chainHooks(), id);
        setSel(hubSelObj(id));
      }
    };
  }
  const hubChain = () => (D.chains[S.l4.city] && D.chains[S.l4.city].kind === 'hub') ? D.chains[S.l4.city] : null;
  const curImport = () => { const ch = hubChain(); return ch ? (D.imports[S.l4.importId] || D.imports[ch.catalog[0]]) : null; };
  function hubOrCityObj(i) {
    const im = curImport();
    if (im) {
      const s = im.stages[i];
      return { type: 'hubstage', id: im.id + '-' + i, label: `${D.HONGXING.short} · ${im.title} ｜ ${s.name}`, raw: s,
        cal: s.caliber || D.cal.market, import: im, calibers: im.caliber };
    }
    const ch = D.chains[S.l4.city];
    return { type: 'stage', id: S.l4.city + '-' + i, label: `${ch.city}·${ch.product} ｜ ${ch.stages[i].name}`, raw: ch.stages[i], cal: D.cal.chain };
  }
  function hubSelObj(id) {
    const im = D.imports[id] || curImport();
    return { type: 'hub', id: S.l4.city + ':' + im.id, label: `${D.HONGXING.short} · ${im.title}`, raw: im,
      cal: [im.caliber.join(' / '), im.sliceNote].filter(Boolean).join(' ｜ ') };
  }
  const chainSelObj = () => hubChain() ? hubSelObj(S.l4.importId) : {
    type: 'chain', id: S.l4.city, label: `${D.chains[S.l4.city].city}·${D.chains[S.l4.city].product} 全链路`,
    raw: D.chains[S.l4.city], cal: D.cal.price };

  function onBlank() {
    if (S.layer === 1) { setSel(null); window.AGRI_GLOBE.clearSelect(); return; }
    if (S.layer === 2) { S.l2.prov = null; S.l2.line = null; map2.selectProvince(null); setSel(null); }
    if (S.layer === 3) { S.l3.city = null; setSel(null); window.AGRI_CHAIN.l3Focus(S.l3.prov, null); }
    goUp();
  }
  UI.onBlank = onBlank;

  /* ---------------- 面包屑（弱化为文字） ---------------- */
  function crumbs() {
    const c = [{ l: 1, t: '全球' }];
    if (S.layer >= 2) c.push({ l: 2, t: '中国' });
    if (S.layer >= 3) c.push({ l: 3, t: S.l3.prov || '省区' });
    if (S.layer >= 4) c.push({ l: 4, t: hubChain() ? '红星·品类' : (D.chains[S.l4.city] ? D.chains[S.l4.city].city : '城市') + '·单品' });
    return c;
  }
  function renderCrumbs() {
    const el = $('crumbs'), list = crumbs();
    el.innerHTML = list.map((x, i) =>
      `<button data-l="${x.l}" class="${x.l === S.layer ? 'on' : ''}">${x.t}</button>${i < list.length - 1 ? '<span class="sep">›</span>' : ''}`).join('');
    el.querySelectorAll('button').forEach(b => b.onclick = () => {
      const l = +b.dataset.l;
      if (l < S.layer) goTo(l); else toast('已在当前层；继续下钻请点击数据对象');
    });
  }

  /* ---------------- 右侧面板 ---------------- */
  function setSel(obj, keepScroll) { S.sel = obj; renderSide(keepScroll); }
  const kpi = (k, v, cls) => `<div class="kpi"><div class="k">${k}</div><div class="v ${cls || ''}">${v}</div></div>`;
  const relLi = (id, t, v, extra) => `<li data-id="${id}"><span>${t} ${extra || ''}</span><small>${v}</small></li>`;
  /* AI 回答里的 **粗体** 标记渲染为 <b>（此前会裸出星号） */
  const md = s => String(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  /* 品类标识（旧版 .tag 表达复用）：Emoji 只作品类识别辅助，不做装饰 */
  const CAT_EMOJI = { fruit: '🍇', veg: '🥬', fresh: '🐟' };
  const catTag = c => c && D.CATN[c] ? `<span class="tag ${c}">${CAT_EMOJI[c]} ${D.CATN[c]}</span>` : '';
  /* 右侧面板的信息层级：量级 → 结构 → 节奏 → 口径 */
  const sec = (t, inner) => `<div class="sec"><h5>${t}</h5>${inner}</div>`;
  function relatedPanel(title, inner) {
    return `<div class="panel"><div class="phead"><span class="lv">同层对象</span><span style="font-size:.75rem;color:var(--dim)">${title}</span></div><div class="rel-note">数值均为示意 · 待标定；口径同当前层</div><ul class="rel">${inner}</ul></div>`;
  }

  function renderSide(keepScroll) {
    const side = $('side');
    if (!side) return;
    let html = '';
    const sel = S.sel;

    if (S.layer === 1) {
      const flows = D.flows.slice().sort((a, b) => b.vol - a.vol);
      const sum = flows.reduce((a, b) => a + b.vol, 0);
      if (sel && sel.type === 'flow') {
        const f = sel.raw, mx = Math.max.apply(null, f.months);
        html += `<div class="panel">
          <div class="phead"><span class="lv">L1 全球</span><span class="kind">来源国 → 中国 · 单条流向</span></div>
          <h2><span class="h2-txt">${f.country}</span>${catTag(f.cat)}<span class="mark">示意/待标定</span></h2>
          ${sec('量级与同比', `<div class="kpis">
            ${kpi('年进口量', f.vol + '<small>万吨</small>')}
            ${kpi('同比', (f.yoy > 0 ? '+' : '') + f.yoy + '%', f.yoy > 0 ? 'pos' : 'neg')}
            ${kpi('环比', (f.mom > 0 ? '+' : '') + f.mom + '%', f.mom > 0 ? 'pos' : 'neg')}
            ${kpi('年内峰值', (f.months.indexOf(mx) + 1) + ' <small>月</small>')}
          </div>`)}
          ${sec('结构', `<div class="metrics" style="grid-template-columns:1fr 1fr">
            <div class="metric"><div class="k">品类</div><div class="v" style="font-size:.84375rem">${f.item}</div></div>
            <div class="metric"><div class="k">入境方式</div><div class="v" style="font-size:.84375rem">${f.mode}</div></div>
            <div class="metric"><div class="k">主要入境口岸</div><div class="v" style="font-size:.84375rem">${f.port}</div></div>
            <div class="metric"><div class="k">下游</div><div class="v" style="font-size:.84375rem">${f.client}</div></div>
          </div>`)}
          ${sec('月度节奏', `<div class="months" title="月度节奏（示意）">
            ${f.months.map((m, i) => `<div class="mo${m === mx ? ' peak' : ''}"><i style="height:${Math.round(m / mx * 30)}px"></i><span>${i + 1}</span></div>`).join('')}
            <div class="months-cap">${f.months.indexOf(mx) + 1} 月为年内高峰</div>
          </div>`)}
          <div class="caliber">周期：${D.PERIOD} ｜ 口径：${D.cal.trade} ｜ 来源：${D.ORG}</div>
          <div class="tip-note">再次点击这条弧线（或点击终点<b>中国节点</b>）→ 相机切场进入 L2 全国产区层。</div>
        </div>`;
        html += relatedPanel('其他来源国', flows.filter(x => x.id !== f.id).map(x => relLi('f:' + x.id, x.country, `${x.vol} 万吨 · ${D.CATN[x.cat]}`)).join('') + relLi('f:CN', '中国（终点）', '进入 L2 全国产区层'));
      } else {
        html += `<div class="panel">
          <div class="phead"><span class="lv">L1 全球</span><span class="kind">未选中对象 · 全局概览</span></div>
          <h2><span class="h2-txt">全球货源流向</span><span class="mark">示意/待标定</span></h2>
          ${sec('量级', `<div class="kpis">
            ${kpi('来源国', D.flows.length + '<small>个</small>')}
            ${kpi('合计进口量', sum + '<small>万吨</small>')}
            ${kpi('最大来源国', flows[0].country, 'pos')}
            ${kpi('平均同比', '+' + (flows.reduce((a, b) => a + b.yoy, 0) / flows.length).toFixed(1) + '%')}
          </div>`)}
          <div class="caliber">周期：${D.PERIOD} ｜ 口径：${D.cal.trade} ｜ 来源：${D.ORG}</div>
          <div class="tip-note">点击地球上的<b>弧线 / 流光点 / 来源国节点</b> → 这里显示这条流向的明细（来源、品类、量、月份、同比、口径）。</div>
        </div>`;
        html += relatedPanel('来源国（按量级排序）', flows.map(x => relLi('f:' + x.id, x.country, `${x.vol} 万吨 · ${D.CATN[x.cat]}`)).join(''));
      }
    }

    if (S.layer === 2) {
      const provs = Object.keys(D.provinces).sort((a, b) => D.provinces[b].supply - D.provinces[a].supply);
      if (sel && sel.type === 'prov') {
        const p = sel.raw, name = sel.label;
        const outs = D.interProv.filter(x => x.from === name).sort((a, b) => b.vol - a.vol);
        html += `<div class="panel">
          <div class="phead"><span class="lv">L2 全国</span><span class="kind">产区 · 省际流通</span></div>
          <h2><span class="h2-txt">${name}</span>${catTag(p.cat)}<span class="mark">示意/待标定</span></h2>
          ${sec('供需与流通规模', `<div class="kpis">
            ${kpi('供给规模指数', p.supply)}
            ${kpi('主导品类', D.CATN[p.cat])}
            ${kpi('调出量', (p.out / 10).toFixed(1) + '<small>十万吨</small>')}
            ${kpi('调入量', (p.in / 10).toFixed(1) + '<small>十万吨</small>')}
          </div>`)}
          ${sec('产业特征', `<div class="metrics" style="grid-template-columns:1fr">
            <div class="metric"><div class="k">特征</div><div class="v" style="font-size:.78125rem;font-weight:400;line-height:1.8">${p.feature}</div></div>
          </div>`)}
          <div class="caliber">周期：${D.PERIOD} ｜ 口径：${D.cal.supply} ｜ 来源：${D.ORG}</div>
          <div class="tip-note">再次点击该省份气泡 → 相机推进到 L3 省区层（省内城市 / 产区）。</div>
        </div>`;
        html += relatedPanel(`调出流向（${outs.length}）`, (outs.map(x => relLi('p:' + x.from + '>' + x.to, `${x.from} → ${x.to}`, `${x.vol} 万吨 · ${x.item}`)).join('')) || '<li style="cursor:default"><small>该省以调入为主，暂无标注调出线</small></li>');
      } else if (sel && sel.type === 'pline') {
        const x = sel.raw;
        html += `<div class="panel">
          <div class="phead"><span class="lv">L2 全国</span><span class="kind">省际调运线</span></div>
          <h2><span class="h2-txt">${x.from} → ${x.to}</span>${catTag(x.cat)}<span class="mark">示意/待标定</span></h2>
          ${sec('流通量级', `<div class="kpis">
            ${kpi('调运量', x.vol + '<small>万吨</small>')}
            ${kpi('品类', x.item)}
            ${kpi('同比', (x.yoy > 0 ? '+' : '') + x.yoy + '%', x.yoy > 0 ? 'pos' : 'neg')}
            ${kpi('起点供给指数', D.provinces[x.from].supply)}
          </div>`)}
          <div class="caliber">周期：${D.PERIOD} ｜ 口径：${D.cal.inter} ｜ 来源：${D.ORG}</div>
          <div class="tip-note">线宽 = 调运量，颜色 = 品类；点击省份气泡可继续下钻到 L3。</div>
        </div>`;
        html += relatedPanel('其他调运线（按量级）', D.interProv.slice().sort((a, b) => b.vol - a.vol).filter(y => y !== x).slice(0, 8).map(y => relLi('p:' + y.from + '>' + y.to, `${y.from} → ${y.to}`, `${y.vol} 万吨`)).join(''));
      } else if (sel && sel.type === 'market' && sel.hub) {
        // 集散枢纽（演示中心）：体量不是重点，位置与口径才是
        const h = sel.hub;
        html += `<div class="panel">
          <div class="phead"><span class="lv">L2 全国</span><span class="kind">集散枢纽 · 演示中心</span></div>
          <h2><span class="h2-txt">${h.name}</span><span class="tag plain">集散枢纽</span><span class="mark">示意/待标定</span></h2>
          ${sec('定位', `<div class="metrics" style="grid-template-columns:1fr">
            <div class="metric"><div class="k">角色</div><div class="v" style="font-size:.84375rem;font-weight:400;line-height:1.8">${h.role}</div></div>
            <div class="metric"><div class="k">所属省 / 市</div><div class="v" style="font-size:.84375rem;font-weight:400;line-height:1.8">${h.prov} · ${D.HONGXING.city}</div></div>
            <div class="metric"><div class="k">数据骨架位置</div><div class="v" style="font-size:.84375rem;font-weight:400;line-height:1.8">${D.HONGXING.skeleton.join(' → ')}</div></div>
          </div>`)}
          <div class="caliber">口径：${h.caliber}</div>
          <div class="tip-note">本页以红星大市场为演示中心：一条选择从头到尾贯穿 L1 境外产区 → L2 中国进口 → L3 湖南 / 红星 → L4 品类·部位与终端建议。<b>再次点击该枢纽 → 进入 L3 湖南</b>。</div>
        </div>`;
        html += relatedPanel('以此为终端的进口直达品类', D.directFlows.filter(x => x.market === h.name).map(x => relLi('m:' + x.id, `${x.country} → ${x.item}`, `${x.vol} 万吨 · 示意`)).join('') || '<li style="cursor:default"><small>暂无标注的直达线</small></li>');
      } else if (sel && sel.type === 'market') {
        const f = sel.raw;
        html += `<div class="panel">
          <div class="phead"><span class="lv">L2 全国</span><span class="kind">进口直达市场</span></div>
          <h2><span class="h2-txt">${f.country} → ${f.market}</span>${catTag(f.cat)}<span class="mark">示意/待标定</span></h2>
          ${sec('直达量级', `<div class="kpis">
            ${kpi('直达量', f.vol + '<small>万吨</small>')}
            ${kpi('品类', f.item)}
            ${kpi('同比', '+' + f.yoy + '%', 'pos')}
            ${kpi('所在省', f.mProv)}
          </div>`)}
          <div class="caliber">周期：${D.PERIOD} ｜ 口径：${f.caliber || D.cal.market} ｜ 来源：${D.ORG}</div>
          <div class="tip-note">进口货源直达销地一级市场，与国内产区的调运线形成直接竞争（可在左侧图例栏勾选叠加 / 关闭该图层）。</div>
        </div>`;
        html += relatedPanel('全部进口直达线', D.directFlows.map(y => relLi('m:' + y.id, `${y.country} → ${y.market}`, `${y.vol} 万吨 · ${y.item}`)).join(''));      } else {
        const totalInter = D.interProv.reduce((a, b) => a + b.vol, 0);
        html += `<div class="panel">
          <div class="phead"><span class="lv">L2 全国</span><span class="kind">未选中对象 · 全国概览</span></div>
          <h2><span class="h2-txt">全国供给 + 省际流通</span><span class="mark">示意/待标定</span></h2>
          ${sec('规模概览', `<div class="kpis">
            ${kpi('重点产区', provs.length + '<small>个</small>')}
            ${kpi('标注调运线', D.interProv.length + '<small>条</small>')}
            ${kpi('调运量合计', totalInter + '<small>万吨</small>')}
            ${kpi('最大调出省', provs[0])}
          </div>`)}
          <div class="caliber">周期：${D.PERIOD} ｜ 口径：${D.cal.supply} / ${D.cal.inter} ｜ 来源：${D.ORG}</div>
          <div class="tip-note"><b>底色深浅</b> = 产区供给规模；<b>气泡</b> = 供给对象（色 = 主导品类）；<b>连线</b> = 省际调运量，已按量级从大到小依次点亮。点省份气泡 → 看该省明细；再次点击 → 进入 L3。</div>
        </div>`;
        html += relatedPanel('重点产区（按供给规模）', provs.map(p => relLi('prov:' + p, p, `供给指数 ${D.provinces[p].supply} · ${D.CATN[D.provinces[p].cat]}`)).join(''));
      }
    }

    if (S.layer === 3) {
      const prov = S.l3.prov || '山东', d = D.provinces[prov];
      if (sel && sel.type === 'city') {
        const c = sel.raw;
        html += `<div class="panel">
          <div class="phead"><span class="lv">L3 省区</span><span class="kind">${prov} · 省内产区</span></div>
          <h2><span class="h2-txt">${c.name}</span>${catTag(c.cat)}<span class="mark">示意/待标定</span></h2>
          ${sec('产区规模', `<div class="kpis">
            ${kpi('外调规模', c.out + '<small>万吨</small>')}
            ${kpi('主导品类', c.main)}
            ${kpi('竞争力均值', Math.round(Object.values(c.comp).reduce((a, b) => a + b, 0) / Object.keys(c.comp).length))}
            ${kpi('代表单品链路', D.chains[c.name] ? '已标定' : '待标定', D.chains[c.name] ? 'pos' : '')}
          </div>`)}
          ${sec('竞争力与区域特征', `<div class="metrics" style="grid-template-columns:1fr">
            <div class="metric"><div class="k">竞争力五维（示意）</div><div class="v" style="font-size:.78125rem;font-weight:400">${Object.entries(c.comp).map(([k, v]) => `${k} ${v}`).join(' / ')}</div></div>
            <div class="metric"><div class="k">区域特征</div><div class="v" style="font-size:.78125rem;font-weight:400;line-height:1.8">${c.feature}</div></div>
          </div>`)}
          <div class="caliber">周期：${D.PERIOD} ｜ 口径：${D.cal.supply} ｜ 来源：${D.ORG}</div>
          <div class="tip-note">${D.chains[c.name] ? '再次点击该城市节点 → 进入 L4 城市代表单品全链路。' : '该产区代表单品链路待标定（已标定：伽师 / 红河蒙自 / 洛川 / 武鸣）。'}</div>
        </div>`;
        html += relatedPanel(`其他产区（${prov}）`, d.cities.filter(x => x.name !== c.name).map(x => relLi('city:' + x.name, x.name, `${x.out} 万吨 · ${x.main}`, D.chains[x.name] ? '<span class="chain-tag">全链路</span>' : '')).join(''));
      } else {
        html += `<div class="panel">
          <div class="phead"><span class="lv">L3 省区</span><span class="kind">${prov} · 全省口径</span></div>
          <h2><span class="h2-txt">${prov}</span>${catTag(d.cat)}<span class="mark">示意/待标定</span></h2>
          ${sec('省域规模', `<div class="kpis">
            ${kpi('重点产区', d.cities.length + '<small>个</small>')}
            ${kpi('主导品类', D.CATN[d.cat])}
            ${kpi('供给规模指数', d.supply)}
            ${kpi('同比', '+' + d.yoy + '%', 'pos')}
          </div>`)}
          ${sec('产业特征', `<div class="metrics" style="grid-template-columns:1fr">
            <div class="metric"><div class="k">特征</div><div class="v" style="font-size:.78125rem;font-weight:400;line-height:1.8">${d.feature}</div></div>
          </div>`)}
          ${d.hub ? sec('本省集散枢纽（演示中心）', `<div class="metrics" style="grid-template-columns:1fr">
            <div class="metric"><div class="k">枢纽</div><div class="v" style="font-size:.84375rem">${D.HONGXING.name}</div></div>
            <div class="metric"><div class="k">角色</div><div class="v" style="font-size:.78125rem;font-weight:400;line-height:1.8">${D.HONGXING.role}（企业 / 媒体表述，口径待核）</div></div>
          </div>`) : ''}
          <div class="caliber">周期：${D.PERIOD} ｜ 口径：${D.cal.supply}${d.hub ? ' / ' + D.cal.hub : ''} ｜ 来源：${D.ORG}</div>
          <div class="tip-note">点城市节点 → 看该产区的产量、主导品类、竞争力五维与区域特征；<b>左侧分析卡片会同步切换为该产区口径</b>；${d.hub ? `点${D.HONGXING.city}（红星）→ 进入 L4 进口品类 · 部位与终端建议。` : '再次点击 → 进入 L4 单品全链路。'}</div>
        </div>`;
        html += relatedPanel('省内产区', d.cities.map(c => relLi('city:' + c.name, c.name, `${c.out} 万吨 · ${c.main}`, D.chains[c.name] ? '<span class="chain-tag">全链路</span>' : '')).join(''));
      }
    }

    if (S.layer === 4) {
      const key = S.l4.city, ch = D.chains[key];
      if (ch && ch.kind === 'hub') html += hubPanel(ch);
      else if (ch) {
        html += `<div class="panel">
          <div class="phead"><span class="lv">L4 单品</span><span class="kind">${ch.prov} · ${ch.city}</span></div>
          <h2><span class="h2-txt">${ch.emoji} ${ch.product}</span><span class="mark">示意/待标定</span></h2>
          ${sec('季节与价格区间', `<div class="kpis">
            ${kpi('上市季', ch.season.split('（')[0])}
            ${kpi('环节数', '6 <small>环节</small>')}
            ${kpi('田头价', ch.price[0].v + '<small>元/kg</small>')}
            ${kpi('零售价', ch.price[ch.price.length - 1].v + '<small>元/kg</small>')}
          </div>`)}
          <div class="caliber">周期：${D.PERIOD} ｜ 口径：${D.cal.chain} / ${D.cal.price} ｜ 来源：${D.ORG}</div>
          <div class="tip-note">点环节卡片 → 该环节的规模 / 成本 / 价格 / 风险；点「本环节经营主体」→ 抽屉展开明细（不强制第五次下钻）。</div>
        </div>`;
        html += relatedPanel('其他已标定产区（切换全链路）', Object.keys(D.chains).map(k => relLi('chain:' + k, `${D.chains[k].city}·${D.chains[k].product}`, k === key ? '当前' : '点击切换')).join(''));
      }
    }

    html += aiPanel();    side.innerHTML = html;
    // 换对象 = 换面板：滚动位置必须回到顶部，否则新面板的标题会被上一次的滚动位置截掉
    // （同一对象内重绘，例如环节/主体切换，保留当前位置）
    if (!keepScroll) side.scrollTop = 0;
    wireSide();
  }

  /* L4 · 红星大市场：品类 / 部位 + 终端建议（数据骨架五段） */
  function hubPanel(ch) {
    const im = curImport();
    const hx = D.HONGXING;
    const skel = hx.skeleton.map((s, i) => {
      const st = im.stages[i];
      return `<li><span><b>${i + 1}. ${s}</b> <small>${st.name}</small></span><small>${st.price}</small></li>`;
    }).join('');
    const cut = im.sliceNote ? `<div class="metric"><div class="k">部位 / 口径提示</div><div class="v" style="font-size:.78125rem;font-weight:400;line-height:1.8">${im.cut ? im.cut + ' —— ' : ''}${im.sliceNote}</div></div>` : '';
    return `<div class="panel">
      <div class="phead"><span class="lv">L4 品类·部位</span><span class="kind">${hx.prov} · ${hx.short}</span></div>
      <h2><span class="h2-txt">${im.emoji} ${im.title}</span>${catTag(im.cat)}<span class="mark">示意/待标定</span></h2>
      ${sec('境外产区 / 国家', `<div class="metrics" style="grid-template-columns:1fr">
        <div class="metric"><div class="k">产区</div><div class="v" style="font-size:.84375rem">${im.origin}</div></div>
        <div class="metric"><div class="k">品类 / 部位</div><div class="v" style="font-size:.84375rem">${im.item}</div></div>
        ${cut}
        <div class="metric"><div class="k">量级口径提示</div><div class="v" style="font-size:.78125rem;font-weight:400;line-height:1.8">${im.shareNote}</div></div>
      </div>`)}
      ${sec('数据骨架五段（选择一路贯穿）', `<ul class="rel">${skel}</ul>`)}
      ${sec('对照来源', `<ul class="rel">${im.peers.map(p => `<li style="cursor:default"><span>${p.k}</span><small>${p.v}</small></li>`).join('')}</ul>`)}
      ${sec('终端建议', `<div class="metrics" style="grid-template-columns:1fr">${im.advice.map((a, i) => `<div class="metric"><div class="k">建议 ${i + 1}</div><div class="v" style="font-size:.78125rem;font-weight:400;line-height:1.8">${a}</div></div>`).join('')}</div>`)}
      <div class="caliber">周期：${D.PERIOD} ｜ 口径：${im.caliber.join(' ｜ ')} ｜ 来源：${D.ORG}</div>
      <div class="tip-note">红星口径：${hx.caliber}</div>
    </div>` +
    relatedPanel('红星在营进口品类（切换）', ch.catalog.map(k => relLi('imp:' + k, `${D.imports[k].emoji} ${D.imports[k].title}`,
      k === im.id ? '当前' : D.imports[k].origin.split(' · ')[0] + ' · 点击切换')).join(''));
  }

  /* AI 模式徽标：真实模型已连接 / 未配置 / 加载中 / 规则演示 / 错误后降级 */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function aiModeBadge() {
    const P = window.AGRI_PROVIDER;
    const st = P ? P.state : { mode: 'rule', detail: '规则演示' };
    return `<span class="ai-mode ${st.mode}" id="aiMode" title="${esc(st.reason || st.lastError || '')}">${esc(st.detail)}</span>`;
  }
  const fmtT = t => { if (!t) return '—'; const d = new Date(t); if (isNaN(d)) return '—';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  /* 状态行：运行模式 + key 状态（只末尾 4 位）+ 最后成功 / 失败时间；失败时给错误详情 */
  function aiStateLine() {
    const P = window.AGRI_PROVIDER;
    if (!P) return '';
    const st = P.state;
    const mode = !st.proxy ? '公开静态版（无安全后端）· 规则演示'
      : st.mode === 'live' ? `真实模型：${st.model || '—'}（${st.provider || '—'}）`
      : st.mode === 'unconfigured' ? '未配置模型凭证 · 规则演示'
      : st.mode === 'degraded' ? '连接失败 · 已降级为规则回答'
      : st.mode === 'detecting' ? '加载中 · 正在检测模型服务' : '规则演示';
    const key = st.keyConfigured ? `key 已配置（…${st.keyTail || '****'}，来源 ${st.keySource || '—'}）` : 'key 未配置';
    const line = `${mode} ｜ ${key} ｜ 最后成功 ${fmtT(st.lastOkAt)} ｜ 最后失败 ${fmtT(st.lastErrAt)} ｜ 服务端调用 ${st.calls} 次`;
    const err = st.lastError && (st.mode === 'degraded' || st.mode === 'unconfigured')
      ? `<div class="ai-err">错误详情：${esc(st.lastError)}</div>` : '';
    return `<div id="aiStateInfo">${esc(line)}</div>${err}`;
  }
  function refreshAiMode() {
    const el = $('aiMode');
    if (!el || !window.AGRI_PROVIDER) return;
    const st = window.AGRI_PROVIDER.state;
    el.className = 'ai-mode ' + st.mode;
    el.textContent = st.detail;
    el.title = st.reason || st.lastError || '';
    const s = $('aiState');
    if (s) s.innerHTML = aiStateLine();            // 状态行原地刷新（不动回答区，不丢输入焦点）
  }

  /* ---------- AI 会话状态（对象切换即重置；同一对象内连续追问保留） ---------- */
  let aiS = { key: undefined, res: null, lastQ: '', turns: 0, history: [] };
  let aiBusy = false, aiCtl = null;
  const aiKey = () => (S.sel ? S.sel.type + ':' + S.sel.id : '@global');
  function aiReset() { aiS = { key: aiKey(), res: null, lastQ: '', turns: 0, history: [] }; }

  function aiPanel() {
    const o = S.sel;
    const qs = window.AGRI_AI.presets(o);
    const label = o ? `${o.label} ｜ ${o.cal}` : '未选中对象 · 可问全局问题（不选对象也能提问）';
    if (aiS.key !== aiKey()) aiReset();
    /* 空态 = 真正的欢迎 / 示例问题；选中对象时预置该对象的默认问题（对象驱动，换对象即换答案） */
    const res = aiS.res || (o ? window.AGRI_AI.ask(o, qs[0].q) : null);
    const body = res ? md(res.a) : md(window.AGRI_AI.welcome());
    const tags = res ? res.tags : ['欢迎', '示例问题可直接点'];
    return `<div class="panel ai">
      <div class="ai-head"><span class="dot"></span>AI 分析助手<small>对象 / 全局都能问</small>${aiModeBadge()}</div>
      <div class="ai-obj">当前对象：${label}</div>
      <div class="ai-state" id="aiState">${aiStateLine()}</div>
      <div class="ai-qs">${qs.map((x, i) => `<button data-q="${i}">${x.q}</button>`).join('')}</div>
      <div class="ai-a" id="aiAnswer">${body}</div>
      <div class="ai-tags">${tags.map(t => `<span>${t}</span>`).join('')}</div>
      <div class="ai-in">
        <input id="aiInput" placeholder="${o ? '继续追问，如：油价涨 20% 会怎样' : '问全局问题，如：红星榴莲销售占比需要哪些数据'}">
        <button id="aiSend">提问</button>
        <button id="aiCancel" class="ghost" hidden>取消</button>
      </div>
      <div class="ai-acts">
        <button id="aiRetry" class="ghost"${aiS.lastQ ? '' : ' disabled'}>重试上一条</button>
        <button id="aiClear" class="ghost">清空会话</button>
        <span class="ai-turns" id="aiTurns">${aiS.turns} 轮${aiS.history.length ? ' · 连续追问已带上下文' : ''}</span>
      </div>
    </div>`;
  }

  function wireSide() {
    const side = $('side');
    side.querySelectorAll('.rel li').forEach(li => li.onclick = () => {
      const id = li.dataset.id;
      if (id.indexOf('f:') === 0) {
        const v = id.slice(2);
        if (v === 'CN') { goTo(2); return; }
        UI.onGlobeSelect({ kind: 'arc', id: v });
      } else if (id.indexOf('prov:') === 0) { S.l3.prov = id.slice(5); UI.onProvinceClick(id.slice(5)); }
      else if (id.indexOf('p:') === 0) {
        const parts = id.slice(2).split('>');
        const x = D.interProv.find(y => y.from === parts[0] && y.to === parts[1]);
        if (x) UI.onPlineClick(x);
      } else if (id.indexOf('m:') === 0) {
        const f = D.directFlows.find(y => y.id === id.slice(2));
        if (f) UI.onDirectClick(f);
      } else if (id.indexOf('imp:') === 0) {
        window.AGRI_CHAIN.pickImport(id.slice(4));
      } else if (id.indexOf('city:') === 0) { UI.onCityClick(S.l3.prov, id.slice(5)); }
      else if (id.indexOf('chain:') === 0) { S.l4.city = id.slice(6); prepare(4); layerEnter(4); renderSide(); }
    });
    side.querySelectorAll('.ai-qs button').forEach(b => b.onclick = () => {
      const o = S.sel, qs = window.AGRI_AI.presets(o);
      askCurrent(qs[+b.dataset.q].q);
    });
    const input = side.querySelector('#aiInput'), send = side.querySelector('#aiSend');
    if (input && send) {
      const go = () => { const q = input.value.trim(); if (!q) return; askCurrent(q, { free: true }); input.value = ''; };
      send.onclick = go;
      input.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
    }
    const cancel = side.querySelector('#aiCancel');
    if (cancel) cancel.onclick = () => cancelAsk();
    const retry = side.querySelector('#aiRetry');
    if (retry) retry.onclick = () => { if (aiS.lastQ) askCurrent(aiS.lastQ); };
    const clear = side.querySelector('#aiClear');
    if (clear) clear.onclick = () => { aiReset(); renderSide(true); toast('已清空本对象会话'); };
  }

  /* ---------- 提问：有同源代理且已配置就真实调用，否则回落到规则演示（不白屏） ---------- */
  async function askCurrent(q, opts) {
    q = String(q || '').trim();
    if (!q || aiBusy) return;
    if (aiS.key !== aiKey()) aiReset();
    const o = S.sel;
    const rule = () => (opts && opts.free) ? window.AGRI_AI.free(o, q) : window.AGRI_AI.ask(o, q);
    const P = window.AGRI_PROVIDER;
    aiS.lastQ = q;
    if (!P || !P.live) {
      const res = rule();
      aiS.res = res; aiS.turns++;
      showAnswer(res, P && P.proxy && !P.state.keyConfigured ? '未配置模型 · 规则回答' : '');
      return;
    }
    const selId = o ? o.id : '@global';
    aiBusy = true;
    aiCtl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    showLoading(o, q);
    const res = await window.AGRI_AI.live(o, q, {
      signal: aiCtl ? aiCtl.signal : undefined,
      cancelled: () => !!aiCtl && aiCtl.signal.aborted,
      history: aiS.history
    });
    aiBusy = false; aiCtl = null;
    if ((S.sel ? S.sel.id : '@global') !== selId) return;       // 请求期间换了对象，丢弃这次结果
    aiS.turns++;
    if (res) {
      aiS.res = res;
      aiS.history.push({ role: 'user', content: q }, { role: 'assistant', content: res.a.replace(/^.*?\n\n/s, '') });
      if (aiS.history.length > 8) aiS.history = aiS.history.slice(-8);
      showAnswer(res); refreshAiMode(); return;
    }
    const st = P.state;
    const planned = st.lastError && st.lastError.indexOf('已取消') === 0;
    const rres = rule();
    aiS.res = rres;
    showAnswer(rres, planned ? '已取消 · 规则回答' : '真实模型失败 · 已降级');
    refreshAiMode();                                   // 徽标切到「错误后降级」
  }

  function cancelAsk() {
    if (aiCtl) { try { aiCtl.abort(); } catch (e) { /* 已结束 */ } }
    toast('已取消本次请求');
  }

  function showLoading(o, q) {
    const a = $('side').querySelector('.ai-a');
    if (!a) return;
    const c = window.AGRI_AI.ctxOf(o);
    a.innerHTML = md(`**加载中**｜正在请求真实模型…\n\n问题：${q}\n上下文：层级 ${c.layer} ｜ 选择 ${c.selection} ｜ 品类 ${c.category}`);
    const t = $('side').querySelector('.ai-tags');
    if (t) t.innerHTML = '<span>加载中</span><span>可点「取消」中止</span>';
    const send = $('side').querySelector('#aiSend'), cxl = $('side').querySelector('#aiCancel');
    if (send) send.disabled = true;
    if (cxl) cxl.hidden = false;                        // 只有请求处理中才禁用发送
  }
  function showAnswer(res, extraTag) {
    const a = $('side').querySelector('.ai-a');
    if (!a) return;
    a.innerHTML = md(res.a);
    const t = $('side').querySelector('.ai-tags');
    if (t) t.innerHTML = res.tags.concat(extraTag ? [extraTag] : []).map(x => `<span>${x}</span>`).join('');
    const send = $('side').querySelector('#aiSend'), cxl = $('side').querySelector('#aiCancel');
    if (send) send.disabled = false;
    if (cxl) cxl.hidden = true;
    const retry = $('side').querySelector('#aiRetry'), turns = $('side').querySelector('#aiTurns');
    if (retry) retry.disabled = !aiS.lastQ;
    if (turns) turns.textContent = `${aiS.turns} 轮${aiS.history.length ? ' · 连续追问已带上下文' : ''}`;
    S.lastAnswer = res.a;
  }

  /* ---------------- 一键演示路径（选择贯穿 L1→L2→L3→L4） ---------------- */
  let demoRunning = false;
  async function runDemoPath(id) {
    const p = (D.demoPaths || []).find(x => x.id === id);
    if (!p || demoRunning) return false;
    demoRunning = true;
    S.demoPath = id;
    try {
      if (S.layer !== 1) { toast(`一键演示：${p.country} · ${p.label} → ${D.HONGXING.prov}${D.HONGXING.short}`); goTo(1, { force: true }); await sleep(FLIGHT + 300); }
      const f = D.flows.find(x => x.id === p.flowId);
      if (f) { S.l1.flow = f.id; window.AGRI_GLOBE.clearSelect(); window.AGRI_GLOBE.select(f.id); setSel(flowObj(f)); }
      toast(`① 境外产区：${p.country} · ${p.label}（${p.sub}）`);
      await sleep(1500);
      goTo(2, { force: true }); await sleep(FLIGHT + 500);
      S.l2.prov = p.prov; S.l2.line = null; S.l2.direct = null; S.l2.hub = null;
      map2.selectProvince(p.prov); setSel(provObj(p.prov));
      toast(`② 中国进口与消费 → ③ ${D.HONGXING.prov}集散（长沙→中南五省）`);
      await map2.flyTo([D.HONGXING.lng, D.HONGXING.lat], 2.6, 1100); await sleep(420);
      S.l3.prov = p.prov; S.l3.city = p.city;
      goTo(3, { force: true }); await sleep(FLIGHT + 1500);
      S.l4.city = p.city; S.l4.importId = p.id;
      toast(`④ ${D.HONGXING.name} → ⑤ 品类 / 部位与终端建议`);
      goTo(4, { force: true }); await sleep(FLIGHT + 1200);
      return true;
    } finally { demoRunning = false; }
  }

  /* ---------------- 全局交互 ---------------- */
  function bindGlobal() {
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { e.preventDefault(); goUp(); }
    });
    // 滚轮：层内 = 相机拉近 / 拉远；缩到最小还在缩 = 回上一层
    $('stage').addEventListener('wheel', e => {
      const now = Date.now();
      if (now - lastWheel > 900) wheelOut = 0;
      lastWheel = now;
      const map = S.layer === 2 ? map2 : S.layer === 3 ? map3 : null;
      const out = e.deltaY > 0;
      if (map) {
        const pose = map.getPose(), home = map.home();
        const FLOOR = home.zoom + 0.1, EXIT_AT = home.zoom + 0.22;   // 留出浮点余量：缩到 FLOOR 后继续缩即退出本层
        if (out) {
          if (pose.zoom > EXIT_AT) { map.flyTo(pose.center, Math.max(FLOOR, pose.zoom - 0.3), 260); wheelOut = 0; }
          else wheelOut += e.deltaY;
        } else { wheelOut = 0; map.flyTo(pose.center, Math.min(5.4, pose.zoom + 0.3), 260); }
      } else if (out) wheelOut += e.deltaY;
      if (wheelOut > 240) { wheelOut = 0; goUp(); }
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    // 点击空白 = 回上一层（L4 场景内除交互元素外的区域）
    $('scene-l4').addEventListener('click', e => {
      if (e.target.closest('.chip, .ent-list li, .card, .scene-head, .scene-hint, .metric, button, input')) return;
      onBlank();
    });
    $('directToggle').addEventListener('change', e => {
      map2.setDirect(e.target.checked);
      $('legendL2').classList.toggle('direct-on', e.target.checked);
    });
    if ($('drawerClose')) $('drawerClose').onclick = () => window.AGRI_CHAIN.closeDrawer();
    document.querySelectorAll('#demoPaths button').forEach(b => {
      b.onclick = () => runDemoPath(b.dataset.demo);
    });
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    window.AGRI_GLOBE.CAT = D.CAT;
    window.AGRI_GLOBE.mount($('globe'), window.__WORLD110, D.flows, D.CHINA, {
      select: UI.onGlobeSelect, hover: UI.onGlobeHover
    });
    map2 = window.createChinaMap('mapL2');
    map3 = window.createChinaMap('mapL3');
    map2.init(); map3.init();
    if (map2.el) map2.el.getZr().on('click', e => { if (!e.target && S.layer === 2 && !map2.gestureConsumed()) onBlank(); });
    if (map3.el) map3.el.getZr().on('click', e => { if (!e.target && S.layer === 3 && !map3.gestureConsumed()) onBlank(); });
    bindGlobal();
    renderSide();
    // AI provider：有同源代理就探测真实模型，否则直接用规则演示（不发起任何网络请求）
    if (window.AGRI_PROVIDER) {
      window.AGRI_PROVIDER.onChange(() => refreshAiMode());
      window.AGRI_PROVIDER.probe().then(() => refreshAiMode());
    }
  }

  function enterSystem() {
    $('landing').style.display = 'none';
    $('app').classList.add('on');
    boot();
    S.layer = 1; S.seen[1] = true;
    sceneEl(1).classList.add('cur');
    window.AGRI_GLOBE.start(); window.AGRI_GLOBE.playIntro();
    S.log.push({ t: Date.now(), ev: 'enter', layer: 1 });
    renderCrumbs(); renderSide();
    setTimeout(() => { window.AGRI_GLOBE.resize(); if (map2.el) map2.el.resize(); if (map3.el) map3.el.resize(); }, 150);
  }
  /* 「⚙ AI 配置」：本地演示服务 → 完整配置面板；公开静态版 → 只提示「没有安全后端」+ 本地演示地址。
     两种分支都在 aiconfig.js 内判定，这里不接触任何 key。 */
  $('cfgEntry').onclick = () => {
    if (window.AGRI_AICFG) window.AGRI_AICFG.open();
    else toast('配置面板未加载');
  };
  window.addEventListener('resize', () => { if (map2 && map2.el) map2.el.resize(); if (map3 && map3.el) map3.el.resize(); });

  window.AGRI_DEBUG = {
    state: () => ({
      layer: S.layer, sel: S.sel && { type: S.sel.type, label: S.sel.label }, flying: S.flying,
      l1: window.AGRI_GLOBE.debug(),
      l2: { lit: map2 && map2.getLit(), direct: map2 && map2.getDirect(), pose: map2 && map2.getPose() },
      l3: { prov: S.l3.prov, city: S.l3.city, pose: map3 && map3.getPose() },
      l4: { city: S.l4.city, stage: window.AGRI_CHAIN.stage }, wheelOut: wheelOut, log: S.log.slice(-10)
    }),
    sideText: () => $('side').innerText,
    selLabel: () => (S.sel ? `${S.sel.type}:${S.sel.label}` : null),
    aiText: () => { const a = $('side').querySelector('.ai-a'); return a ? a.innerText : ''; },
    aiTags: () => Array.from($('side').querySelectorAll('.ai-tags span')).map(x => x.textContent),
    aiMode: () => (window.AGRI_PROVIDER ? window.AGRI_PROVIDER.state : null),
    aiStateLine: () => { const e = $('aiState'); return e ? e.innerText.replace(/\n/g, ' | ') : ''; },
    aiPanelReady: () => { const i = $('side').querySelector('#aiInput'); return i ? { disabled: !!i.disabled, placeholder: i.placeholder, hasSend: !!$('side').querySelector('#aiSend'), sendDisabled: !!($('side').querySelector('#aiSend') || {}).disabled, hasCancel: !!$('side').querySelector('#aiCancel'), hasRetry: !!$('side').querySelector('#aiRetry'), hasClear: !!$('side').querySelector('#aiClear') } : null; },
    aiOpenConfig: () => { if (window.AGRI_AICFG) window.AGRI_AICFG.open(); return !!window.AGRI_AICFG; },
    aiCfg: () => { const d = document.getElementById('aiCfg'); if (!d) return null; const q = s => d.querySelector(s); return {
      open: !d.hasAttribute('hidden'),
      hasKeyInput: !!q('#cfgKey'), keyInputType: q('#cfgKey') ? q('#cfgKey').type : '',
      keyInputValue: q('#cfgKey') ? q('#cfgKey').value : null,
      fields: ['#cfgProvider', '#cfgBaseUrl', '#cfgModel', '#cfgTimeout', '#cfgMaxTokens', '#cfgTemp'].map(s => !!q(s)),
      buttons: ['#cfgTest', '#cfgSave', '#cfgReset', '#cfgRefreshModels', '#cfgImportList', '#cfgClearKey'].map(s => !!q(s)),
      mode: q('.cfg-mode') ? q('.cfg-mode').textContent : '',
      bodyText: d.innerText || '' }; },
    aiCtx: () => window.AGRI_AI.ctxOf(S.sel),
    ask: q => { const r = window.AGRI_AI.ask(S.sel, q); showAnswer(r); return r.a; },
    askLive: q => askCurrent(q),
    demoPaths: () => (D.demoPaths || []).map(p => ({ id: p.id, country: p.country, label: p.label, sub: p.sub })),
    demoPath: id => runDemoPath(id),
    build: () => window.__AGRI_BUILD || null,
    caliber: () => D.caliber,
    hub: () => D.HONGXING,
    hubMarkers: () => (D.hubs || []).map(h => ({ id: h.id, name: h.name, role: h.role })),
    hubCatalog: () => { const ch = hubChain(); const keys = ch ? ch.catalog : Object.keys(D.imports); return keys.map(k => { const im = D.imports[k];
      return { id: k, title: im.title, origin: im.origin, item: im.item, cut: im.cut || '', stages: im.stages.map(s => s.name),
        text: im.stages.map(s => [s.scale, s.cost, s.price, s.risk].join(' ')).join(' ') + ' ' + im.price.map(p => p.k + p.note).join(' '),
        advice: im.advice, sliceNote: im.sliceNote || '' }; }); },
    currentImport: () => { const im = curImport(); return im ? { id: im.id, title: im.title, origin: im.origin, item: im.item, cut: im.cut || '', shareNote: im.shareNote, sliceNote: im.sliceNote || '' } : null; },
    globePick: (x, y) => window.AGRI_GLOBE.pick(x, y),
    globeHits: () => window.AGRI_GLOBE.hits(),
    globeBox: () => { const r = $('globe').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; },
    // 把 [lng,lat] 换算为页面坐标，供真实鼠标点击测试
    mapXY: (which, lnglat) => {
      const chart = which === 'l2' ? map2.el : map3.el;
      if (!chart) return null;
      let px = null;
      try { px = chart.convertToPixel({ geoIndex: 0 }, lnglat); } catch (e) { return null; }
      if (!px || !isFinite(px[0])) return null;
      const r = chart.getDom().getBoundingClientRect();
      return { x: r.x + px[0], y: r.y + px[1] };
    },
    linePoint: (from, to, t) => map2 && map2.linePoint ? map2.linePoint(from, to, t) : null,
    chipState: () => Array.from(document.querySelectorAll('#chainAxis .chip')).map(c => c.classList.contains('lit')),
    barsW: () => Array.from(document.querySelectorAll('.l3-row .bar i')).map(i => i.style.width),
    /* 分析卡片 / 图例 / 环节轴 / 价格链路的可读状态，供视觉验收断言 */
    rect: sel => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect();
      return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; },
    l3Rail: () => ({
      obj: $('l3Obj').textContent, cat: $('l3ObjCat').textContent, radarTitle: $('l3RadarTitle').textContent,
      radarCap: $('l3RadarCap') ? $('l3RadarCap').textContent : '',
      barsTitle: $('l3BarsTitle').textContent,
      barsOn: Array.from(document.querySelectorAll('#l3Bars .l3-row.on')).map(r => r.querySelector('span').textContent),
      facts: Array.from(document.querySelectorAll('#l3Facts li')).map(li => li.innerText.replace(/\n/g, ' '))
    }),
    legend: id => { const el = $(id); return el ? { items: Array.from(el.querySelectorAll('.lg-item')).map(x => x.innerText.trim()), directOn: el.classList.contains('direct-on') } : null; },
    chips: () => Array.from(document.querySelectorAll('#chainAxis .chip')).map(c => ({
      no: c.querySelector('.no').textContent, name: c.querySelector('b').textContent,
      cv: c.querySelector('.cv').textContent, on: c.classList.contains('on'), lit: c.classList.contains('lit')
    })),
    priceRows: () => Array.from(document.querySelectorAll('#priceChain .price-row')).map(r => ({
      k: r.querySelector('.pk').textContent, v: r.querySelector('.pv').textContent,
      mult: r.querySelector('.px').textContent, hot: r.classList.contains('hot'), w: r.querySelector('.pbar i').style.width
    })),
    priceSum: () => $('priceSum').innerText,
    /* 供视觉验收：气泡尺寸梯度是否仍有可读差异 */
    bubbleScale: () => {
      const sup = Object.values(D.provinces).map(p => p.supply);
      const out = [].concat.apply([], Object.values(D.provinces).map(p => p.cities.map(c => c.out)));
      const map2Size = x => 12 + Math.max(0, Math.sqrt(x) - 7) * 9, cityM = x => 13 + Math.max(0, Math.sqrt(x) - 3) * 4.2;
      return { sup: [map2Size(Math.min.apply(null, sup)), map2Size(Math.max.apply(null, sup))],
               city: [cityM(Math.min.apply(null, out)), cityM(Math.max.apply(null, out))] };
    },
    /* 供视觉验收：进口直达图层是否裁剪在图内（避免图外游离虚线） */
    directClip: () => { const o = map2 && map2.el && map2.el.getOption();
      const d = ((o && o.series) || []).find(x => x.id === 'direct'); return !!(d && d.clip); },
    /* 供视觉验收：关键图层的标签防重叠是否已启用 */
    overlapGuard: which => { const chart = which === 'l2' ? map2 : map3;
      const o = chart && chart.el && chart.el.getOption();
      return ((o && o.series) || []).filter(x => x.labelLayout && x.labelLayout.hideOverlap).map(x => x.id); },
    radarInk: () => { const cv = $('l3Radar'); const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++; return n; },
    // 层间切场过程中两个场景的可见度（用于验证不白屏）
    sceneOpacity: () => Array.from(document.querySelectorAll('.scene')).map(s => ({ id: s.id, op: +getComputedStyle(s).opacity, cur: s.classList.contains('cur') })),
    clickGlobeAt: (x, y) => { const h = window.AGRI_GLOBE.pick(x, y); if (h) UI.onGlobeSelect(h); return h; }
  };

  $('enterBtn').onclick = enterSystem;
})();
