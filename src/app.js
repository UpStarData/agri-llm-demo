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
    l2: { prov: null, line: null, direct: null },
    l3: { prov: null, city: null },
    l4: { city: null, stage: 0 },
    cam: { 2: null, 3: { prov: null, pose: null } }
  };
  const UI = window.AGRI_UI = {};

  let map2 = null, map3 = null, wheelOut = 0, lastWheel = 0;

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
    b.dataset.pose = dir > 0 ? 'under' : 'over';   // 更深一层从画布下方推入 / 更浅一层从远处退回
    b.classList.add('cur');
    void b.offsetWidth;                            // 强制回流：起始位姿必须先生效
    a.dataset.pose = dir > 0 ? 'over' : 'under';
    b.removeAttribute('data-pose');
    setTimeout(() => { a.classList.remove('cur'); a.removeAttribute('data-pose'); }, FLIGHT + 140);
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
    else { sceneEl(n).classList.add('cur'); }
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
      S.l2.prov = null; S.l2.line = null;
    }
    if (n === 3) {
      const prov = S.l3.prov || '山东';
      S.l3.prov = prov;
      map3.renderL3(prov);                              // 先渲染在整图位姿，进场后再飞入
      window.AGRI_CHAIN.renderProvinceL3(prov, {});
      window.AGRI_CHAIN.closeDrawer();
    }
    if (n === 4) {
      const key = S.l4.city || chainKeyFor(S.l3.prov) || '伽师';
      S.l4.city = key;
      window.AGRI_CHAIN.render(key, chainHooks());
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
    tip.style.left = Math.min(info.x + 14, 300) + 'px';
    tip.style.top = Math.max(8, info.y - 12) + 'px';
    tip.innerHTML = info.china
      ? `<b>中国</b><div class="t-cal">贸易终点 · 再次点击进入全国产区层</div>`
      : `<b>${info.flow.country}</b> · ${info.flow.item}<br>${info.flow.vol} 万吨/年（示意）｜ 同比 ${info.flow.yoy > 0 ? '+' : ''}${info.flow.yoy}%<div class="t-cal">${D.cal.trade} · 再次点击进入 L2</div>`;
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
      else toast('该产区代表单品链路待标定；当前已标定产区：伽师 · 红河蒙自 · 洛川 · 武鸣');
      return;
    }
    S.l3.city = city;
    if (map3) map3.highlightCity(city);
    setSel({ type: 'city', id: city, label: `${city}（${prov}）`, raw: c, cal: D.cal.supply });
  };
  function chainHooks() {
    const ch = () => D.chains[S.l4.city];
    return {
      onStage: i => setSel({ type: 'stage', id: S.l4.city + '-' + i, label: `${ch().city}·${ch().product} ｜ ${ch().stages[i].name}`, raw: ch().stages[i], cal: D.cal.chain }, true),
      onEntity: e => setSel({ type: 'entity', id: e.n, label: e.n, raw: e, cal: D.cal.chain }, true)
    };
  }
  const chainSelObj = () => ({ type: 'chain', id: S.l4.city, label: `${D.chains[S.l4.city].city}·${D.chains[S.l4.city].product} 全链路`, raw: D.chains[S.l4.city], cal: D.cal.price });

  function onBlank() {
    if (S.layer === 1) { setSel(null); window.AGRI_GLOBE.clearSelect(); return; }
    if (S.layer === 2) { S.l2.prov = null; S.l2.line = null; setSel(null); }
    if (S.layer === 3) { S.l3.city = null; setSel(null); }
    goUp();
  }
  UI.onBlank = onBlank;

  /* ---------------- 面包屑（弱化为文字） ---------------- */
  function crumbs() {
    const c = [{ l: 1, t: '全球' }];
    if (S.layer >= 2) c.push({ l: 2, t: '中国' });
    if (S.layer >= 3) c.push({ l: 3, t: S.l3.prov || '省区' });
    if (S.layer >= 4) c.push({ l: 4, t: (D.chains[S.l4.city] ? D.chains[S.l4.city].city : '城市') + '·单品' });
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
  function relatedPanel(title, inner) {
    return `<div class="panel"><div class="phead"><span class="lv">同层对象</span><span style="font-size:11.5px;color:#5b6677">${title}</span></div><div class="rel-note">数值均为示意 · 待标定；口径同当前层</div><ul class="rel">${inner}</ul></div>`;
  }

  function renderSide(keepScroll) {
    const side = $('side');
    if (!side) return;
    const scroll = keepScroll ? 0 : 0;
    let html = '';
    const sel = S.sel;

    if (S.layer === 1) {
      const flows = D.flows.slice().sort((a, b) => b.vol - a.vol);
      const sum = flows.reduce((a, b) => a + b.vol, 0);
      if (sel && sel.type === 'flow') {
        const f = sel.raw;
        html += `<div class="panel">
          <div class="phead"><span class="lv">L1 全球</span><span style="font-size:11.5px;color:#5b6677">来源国 → 中国</span></div>
          <h2>${f.country}<span class="mark">示意/待标定</span></h2>
          <div class="kpis">
            ${kpi('年进口量', f.vol + '<small>万吨</small>')}
            ${kpi('同比', (f.yoy > 0 ? '+' : '') + f.yoy + '%', f.yoy > 0 ? 'pos' : 'neg')}
            ${kpi('环比', (f.mom > 0 ? '+' : '') + f.mom + '%', f.mom > 0 ? 'pos' : 'neg')}
            ${kpi('年内峰值', (f.months.indexOf(Math.max.apply(null, f.months)) + 1) + ' 月')}
          </div>
          <div class="metrics" style="grid-template-columns:1fr 1fr;margin-top:9px">
            <div class="metric"><div class="k">品类</div><div class="v" style="font-size:13.5px">${f.item}</div></div>
            <div class="metric"><div class="k">入境方式</div><div class="v" style="font-size:13.5px">${f.mode}</div></div>
            <div class="metric"><div class="k">主要入境口岸</div><div class="v" style="font-size:13.5px">${f.port}</div></div>
            <div class="metric"><div class="k">下游</div><div class="v" style="font-size:13.5px">${f.client}</div></div>
          </div>
          <div class="months" title="月度节奏（示意）">
            ${f.months.map((m, i) => `<div class="mo${m === Math.max.apply(null, f.months) ? ' peak' : ''}"><i style="height:${Math.round(m / Math.max.apply(null, f.months) * 30)}px"></i><span>${i + 1}</span></div>`).join('')}
            <div class="months-cap">月度节奏 · ${f.months.indexOf(Math.max.apply(null, f.months)) + 1} 月为年内高峰（示意）</div>
          </div>
          <div class="caliber">周期：${D.PERIOD} ｜ 口径：${D.cal.trade} ｜ 来源：${D.ORG}</div>
          <div class="tip-note">再次点击这条弧线（或点击终点「中国」节点）→ 相机切场进入 L2 全国产区层。</div>
        </div>`;
        html += relatedPanel('其他来源国', flows.filter(x => x.id !== f.id).map(x => relLi('f:' + x.id, x.country, `${x.vol} 万吨 · ${D.CATN[x.cat]}`)).join('') + relLi('f:CN', '中国（终点）', '进入 L2 全国产区层'));
      } else {
        html += `<div class="panel">
          <div class="phead"><span class="lv">L1 全球</span><span style="font-size:11.5px;color:#5b6677">未选中对象</span></div>
          <h2>全球货源流向<span class="mark">示意/待标定</span></h2>
          <div class="kpis">
            ${kpi('来源国', D.flows.length + '<small>个</small>')}
            ${kpi('合计进口量', sum + '<small>万吨</small>')}
            ${kpi('最大来源国', flows[0].country, 'pos')}
            ${kpi('平均同比', '+' + (flows.reduce((a, b) => a + b.yoy, 0) / flows.length).toFixed(1) + '%')}
          </div>
          <div class="caliber">周期：${D.PERIOD} ｜ 口径：${D.cal.trade} ｜ 来源：${D.ORG}</div>
          <div class="tip-note">点击左侧任意弧线、弧上流光点或来源国节点 → 这里显示这条流向的明细（来源、品类、量、月份、同比、口径）。</div>
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
          <div class="phead"><span class="lv">L2 全国</span><span style="font-size:11.5px;color:#5b6677">产区 · 省际流通</span></div>
          <h2>${name}<span class="mark">示意/待标定</span></h2>
          <div class="kpis">
            ${kpi('供给规模指数', p.supply)}
            ${kpi('主导品类', D.CATN[p.cat])}
            ${kpi('调出量', (p.out / 10).toFixed(1) + '<small>十万吨</small>')}
            ${kpi('调入量', (p.in / 10).toFixed(1) + '<small>十万吨</small>')}
          </div>
          <div class="metrics" style="grid-template-columns:1fr;margin-top:9px">
            <div class="metric"><div class="k">产业特征</div><div class="v" style="font-size:12.5px;font-weight:400;line-height:1.8">${p.feature}</div></div>
          </div>
          <div class="caliber">周期：${D.PERIOD} ｜ 口径：${D.cal.supply} ｜ 来源：${D.ORG}</div>
          <div class="tip-note">再次点击该省份气泡 → 相机推进到 L3 省区层（省内城市 / 产区）。</div>
        </div>`;
        html += relatedPanel(`调出流向（${outs.length}）`, (outs.map(x => relLi('p:' + x.from + '>' + x.to, `${x.from} → ${x.to}`, `${x.vol} 万吨 · ${x.item}`)).join('')) || '<li style="cursor:default"><small>该省以调入为主，暂无标注调出线</small></li>');
      } else if (sel && sel.type === 'pline') {
        const x = sel.raw;
        html += `<div class="panel">
          <div class="phead"><span class="lv">L2 全国</span><span style="font-size:11.5px;color:#5b6677">省际调运线</span></div>
          <h2>${x.from} → ${x.to}<span class="mark">示意/待标定</span></h2>
          <div class="kpis">
            ${kpi('调运量', x.vol + '<small>万吨</small>')}
            ${kpi('品类', x.item)}
            ${kpi('同比', (x.yoy > 0 ? '+' : '') + x.yoy + '%', x.yoy > 0 ? 'pos' : 'neg')}
            ${kpi('起点供给指数', D.provinces[x.from].supply)}
          </div>
          <div class="caliber">周期：${D.PERIOD} ｜ 口径：${D.cal.inter} ｜ 来源：${D.ORG}</div>
          <div class="tip-note">线宽 = 调运量，颜色 = 品类；点击省份气泡可继续下钻到 L3。</div>
        </div>`;
        html += relatedPanel('其他调运线（按量级）', D.interProv.slice().sort((a, b) => b.vol - a.vol).filter(y => y !== x).slice(0, 8).map(y => relLi('p:' + y.from + '>' + y.to, `${y.from} → ${y.to}`, `${y.vol} 万吨`)).join(''));
      } else if (sel && sel.type === 'market') {
        const f = sel.raw;
        html += `<div class="panel">
          <div class="phead"><span class="lv">L2 全国</span><span style="font-size:11.5px;color:#5b6677">进口直达市场</span></div>
          <h2>${f.country} → ${f.market}<span class="mark">示意/待标定</span></h2>
          <div class="kpis">
            ${kpi('直达量', f.vol + '<small>万吨</small>')}
            ${kpi('品类', f.item)}
            ${kpi('同比', '+' + f.yoy + '%', 'pos')}
            ${kpi('所在省', f.mProv)}
          </div>
          <div class="caliber">周期：${D.PERIOD} ｜ 口径：${D.cal.market} ｜ 来源：${D.ORG}</div>
          <div class="tip-note">进口货源直达销地一级市场，与国内产区的调运线形成直接竞争（可在左上角开关叠加 / 关闭该图层）。</div>
        </div>`;
        html += relatedPanel('全部进口直达线', D.directFlows.map(y => relLi('m:' + y.id, `${y.country} → ${y.market}`, `${y.vol} 万吨 · ${y.item}`)).join(''));
      } else {
        const totalInter = D.interProv.reduce((a, b) => a + b.vol, 0);
        html += `<div class="panel">
          <div class="phead"><span class="lv">L2 全国</span><span style="font-size:11.5px;color:#5b6677">未选中对象</span></div>
          <h2>全国供给 + 省际流通<span class="mark">示意/待标定</span></h2>
          <div class="kpis">
            ${kpi('重点产区', provs.length + '<small>个</small>')}
            ${kpi('标注调运线', D.interProv.length + '<small>条</small>')}
            ${kpi('调运量合计', totalInter + '<small>万吨</small>')}
            ${kpi('最大调出省', provs[0])}
          </div>
          <div class="caliber">周期：${D.PERIOD} ｜ 口径：${D.cal.supply} / ${D.cal.inter} ｜ 来源：${D.ORG}</div>
          <div class="tip-note">气泡大小 = 供给规模；连线粗细 = 省际调运量，已按量级从大到小依次点亮。点省份气泡 → 看该省明细；再次点击 → 进入 L3。</div>
        </div>`;
        html += relatedPanel('重点产区（按供给规模）', provs.map(p => relLi('prov:' + p, p, `供给指数 ${D.provinces[p].supply} · ${D.CATN[D.provinces[p].cat]}`)).join(''));
      }
    }

    if (S.layer === 3) {
      const prov = S.l3.prov || '山东', d = D.provinces[prov];
      if (sel && sel.type === 'city') {
        const c = sel.raw;
        html += `<div class="panel">
          <div class="phead"><span class="lv">L3 省区</span><span style="font-size:11.5px;color:#5b6677">${prov} · 省内产区</span></div>
          <h2>${c.name}<span class="mark">示意/待标定</span></h2>
          <div class="kpis">
            ${kpi('外调规模', c.out + '<small>万吨</small>')}
            ${kpi('主导品类', c.main)}
            ${kpi('竞争力均值', Math.round(Object.values(c.comp).reduce((a, b) => a + b, 0) / Object.keys(c.comp).length))}
            ${kpi('代表单品链路', D.chains[c.name] ? '已标定' : '待标定', D.chains[c.name] ? 'pos' : '')}
          </div>
          <div class="metrics" style="grid-template-columns:1fr;margin-top:9px">
            <div class="metric"><div class="k">竞争力五维（示意）</div><div class="v" style="font-size:12.5px;font-weight:400">${Object.entries(c.comp).map(([k, v]) => `${k} ${v}`).join(' / ')}</div></div>
            <div class="metric"><div class="k">区域特征</div><div class="v" style="font-size:12.5px;font-weight:400;line-height:1.8">${c.feature}</div></div>
          </div>
          <div class="caliber">周期：${D.PERIOD} ｜ 口径：${D.cal.supply} ｜ 来源：${D.ORG}</div>
          <div class="tip-note">${D.chains[c.name] ? '再次点击该城市节点 → 进入 L4 城市代表单品全链路。' : '该产区代表单品链路待标定（已标定：伽师 / 红河蒙自 / 洛川 / 武鸣）。'}</div>
        </div>`;
        html += relatedPanel(`其他产区（${prov}）`, d.cities.filter(x => x.name !== c.name).map(x => relLi('city:' + x.name, x.name, `${x.out} 万吨 · ${x.main}`, D.chains[x.name] ? '<span class="chain-tag">全链路</span>' : '')).join(''));
      } else {
        html += `<div class="panel">
          <div class="phead"><span class="lv">L3 省区</span><span style="font-size:11.5px;color:#5b6677">${prov}</span></div>
          <h2>${prov} · 省内产业<span class="mark">示意/待标定</span></h2>
          <div class="kpis">
            ${kpi('重点产区', d.cities.length + '<small>个</small>')}
            ${kpi('主导品类', D.CATN[d.cat])}
            ${kpi('供给规模指数', d.supply)}
            ${kpi('同比', '+' + d.yoy + '%', 'pos')}
          </div>
          <div class="metrics" style="grid-template-columns:1fr;margin-top:9px">
            <div class="metric"><div class="k">产业特征</div><div class="v" style="font-size:12.5px;font-weight:400;line-height:1.8">${d.feature}</div></div>
          </div>
          <div class="caliber">周期：${D.PERIOD} ｜ 口径：${D.cal.supply} ｜ 来源：${D.ORG}</div>
          <div class="tip-note">点城市节点 → 看该产区的产量、主导品类、竞争力五维与区域特征；再次点击 → 进入 L4 单品全链路。</div>
        </div>`;
        html += relatedPanel('省内产区', d.cities.map(c => relLi('city:' + c.name, c.name, `${c.out} 万吨 · ${c.main}`, D.chains[c.name] ? '<span class="chain-tag">全链路</span>' : '')).join(''));
      }
    }

    if (S.layer === 4) {
      const key = S.l4.city, ch = D.chains[key];
      if (ch) {
        html += `<div class="panel">
          <div class="phead"><span class="lv">L4 单品</span><span style="font-size:11.5px;color:#5b6677">${ch.prov} · ${ch.city}</span></div>
          <h2>${ch.emoji} ${ch.product}<span class="mark">示意/待标定</span></h2>
          <div class="kpis">
            ${kpi('上市季', ch.season.split('（')[0])}
            ${kpi('环节数', '6 <small>环节</small>')}
            ${kpi('田头价', ch.price[0].v + '<small>元/kg</small>')}
            ${kpi('零售价', ch.price[ch.price.length - 1].v + '<small>元/kg</small>')}
          </div>
          <div class="caliber">周期：${D.PERIOD} ｜ 口径：${D.cal.chain} / ${D.cal.price} ｜ 来源：${D.ORG}</div>
          <div class="tip-note">点环节卡片 → 该环节的规模 / 成本 / 价格 / 风险；点「本环节经营主体」→ 抽屉展开明细（不强制第五次下钻）。</div>
        </div>`;
        html += relatedPanel('其他已标定产区（切换全链路）', Object.keys(D.chains).map(k => relLi('chain:' + k, `${D.chains[k].city}·${D.chains[k].product}`, k === key ? '当前' : '点击切换')).join(''));
      }
    }

    html += aiPanel();
    side.innerHTML = html;
    wireSide(scroll);
  }

  function aiPanel() {
    const o = S.sel;
    const qs = window.AGRI_AI.presets(o);
    const label = o ? `${o.label} ｜ ${o.cal}` : '尚未选中对象';
    const first = window.AGRI_AI.ask(o, qs[0].q);
    return `<div class="panel ai">
      <div class="ai-head"><span class="dot"></span>AI 分析助手<small>基于当前选中对象</small></div>
      <div class="ai-obj">当前对象：${label}</div>
      <div class="ai-qs">${qs.map((x, i) => `<button data-q="${i}">${x.q}</button>`).join('')}</div>
      <div class="ai-a">${first.a}</div>
      <div class="ai-tags">${first.tags.map(t => `<span>${t}</span>`).join('')}</div>
      <div class="ai-in"><input id="aiInput" placeholder="针对该对象提问，如：油价涨 20% 会怎样"><button id="aiSend">提问</button></div>
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
      } else if (id.indexOf('city:') === 0) { UI.onCityClick(S.l3.prov, id.slice(5)); }
      else if (id.indexOf('chain:') === 0) { S.l4.city = id.slice(6); prepare(4); layerEnter(4); renderSide(); }
    });
    side.querySelectorAll('.ai-qs button').forEach(b => b.onclick = () => {
      const o = S.sel, qs = window.AGRI_AI.presets(o);
      showAnswer(window.AGRI_AI.ask(o, qs[+b.dataset.q].q));
    });
    const input = side.querySelector('#aiInput'), send = side.querySelector('#aiSend');
    if (input && send) {
      const go = () => { const q = input.value.trim(); if (!q) return; showAnswer(window.AGRI_AI.free(S.sel, q)); input.value = ''; };
      send.onclick = go;
      input.onkeydown = e => { if (e.key === 'Enter') go(); };
    }
  }
  function showAnswer(res) {
    const a = $('side').querySelector('.ai-a');
    if (!a) return;
    a.innerHTML = res.a;
    const t = $('side').querySelector('.ai-tags');
    if (t) t.innerHTML = res.tags.map(x => `<span>${x}</span>`).join('');
    S.lastAnswer = res.a;
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
    $('directToggle').addEventListener('change', e => { map2.setDirect(e.target.checked); });
    if ($('drawerClose')) $('drawerClose').onclick = () => window.AGRI_CHAIN.closeDrawer();
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
    if (map2.el) map2.el.getZr().on('click', e => { if (!e.target && S.layer === 2) onBlank(); });
    if (map3.el) map3.el.getZr().on('click', e => { if (!e.target && S.layer === 3) onBlank(); });
    bindGlobal();
    renderSide();
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
    aiText: () => { const a = $('side').querySelector('.ai-a'); return a ? a.innerText : ''; },
    ask: q => { const r = window.AGRI_AI.ask(S.sel, q); showAnswer(r); return r.a; },
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
    chipState: () => Array.from(document.querySelectorAll('#chainAxis .chip')).map(c => c.classList.contains('lit')),
    barsW: () => Array.from(document.querySelectorAll('.l3-row .bar i')).map(i => i.style.width),
    radarInk: () => { const cv = $('l3Radar'); const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++; return n; },
    // 层间切场过程中两个场景的可见度（用于验证不白屏）
    sceneOpacity: () => Array.from(document.querySelectorAll('.scene')).map(s => ({ id: s.id, op: +getComputedStyle(s).opacity, cur: s.classList.contains('cur') })),
    clickGlobeAt: (x, y) => { const h = window.AGRI_GLOBE.pick(x, y); if (h) UI.onGlobeSelect(h); return h; }
  };

  $('enterBtn').onclick = enterSystem;
})();
