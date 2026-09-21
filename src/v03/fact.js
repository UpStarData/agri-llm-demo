/* ============================================================
   事实层：地图即主体
   筛选（分类/时间/来源/可信度/影响/搜索）→ 地图事实点 + 影响范围 → 事实卡片 → 事实详情/证据
   空间下钻：L1 全球 → L2 全国 → L3 省区（地图层级承担视角，不做冗余的 L1/L2/L3 按钮）
   ============================================================ */
window.V03Fact = (function () {
  const D = window.V03Data, S = window.V03Store, F = window.V03Filter;
  let root, chart, dom = {}, sig = '';
  const camera = { level: null, center: [104.5, 34.5], zoom: 1.18, raf: null };

  const LEVEL = {
    L1: { map: 'world110', center: [22, 16], zoom: 1.02, note: '全球货源与境外产区' },
    L2: { map: 'china', center: [104.5, 34.5], zoom: 1.18, note: '全国与省际事实' },
    L3: { map: 'china', center: null, zoom: 4.2, note: '省区与城市事实' }
  };
  const PROV = {
    湖南: [111.7, 27.6, 4.2], 山东: [118.2, 36.4, 4.0], 四川: [102.9, 30.6, 3.6], 广东: [113.4, 23.3, 4.0],
    河南: [113.6, 33.9, 4.2], 北京: [116.4, 40.2, 6.0], 江苏: [119.4, 32.9, 4.2], 浙江: [120.2, 29.2, 4.2],
    湖北: [112.2, 30.9, 4.2], 安徽: [117.2, 31.8, 4.0], 江西: [115.7, 27.6, 4.0], 重庆: [107.9, 29.9, 4.6],
    陕西: [108.9, 35.3, 4.0], 辽宁: [123.0, 41.5, 4.0], 河北: [115.5, 38.9, 4.0], 山西: [112.5, 37.6, 4.0],
    广西: [108.3, 23.8, 4.0], 云南: [101.5, 25.0, 3.6], 贵州: [106.7, 26.8, 4.0], 福建: [118.1, 26.1, 4.0],
    天津: [117.2, 39.1, 5.6], 上海: [121.4, 31.2, 6.0], 海南: [109.8, 19.2, 4.6], 新疆: [85.6, 41.7, 2.4],
    西藏: [87.9, 31.0, 2.4], 内蒙古: [111.7, 44.1, 3.0], 黑龙江: [127.9, 47.3, 2.8], 吉林: [126.2, 43.6, 3.0],
    甘肃: [100.5, 37.7, 3.0], 青海: [95.9, 35.7, 2.8], 宁夏: [106.2, 37.3, 4.4], 台湾: [121.0, 23.7, 4.6],
    香港: [114.2, 22.3, 7.0], 澳门: [113.5, 22.2, 7.0], 智利: [20, 18, 1.02], 巴西: [20, 18, 1.02], 马来西亚: [20, 18, 1.02]
  };
  const shortProv = n => String(n || '').replace(/壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市$/g, '') || n;
  const provOf = f => String(f.region || '').split('·')[0].trim();

  /* ---------- 世界底图：内联 world110 是精简 {n,c} 结构，转成 ECharts 可用的 GeoJSON ---------- */
  function worldGeoJSON() {
    const raw = window.__WORLD110 || [];
    const depth = x => { let d = 0; while (Array.isArray(x) && x.length) { d++; x = x[0]; } return d; };
    const features = raw.map(o => {
      const d = depth(o.c);
      const geometry = d >= 4
        ? { type: 'MultiPolygon', coordinates: o.c }
        : { type: 'Polygon', coordinates: d === 3 ? o.c : [o.c] };
      return { type: 'Feature', properties: { name: o.n }, geometry };
    });
    return { type: 'FeatureCollection', features };
  }

  /* ---------- DOM ---------- */
  const TPL = `
  <div class="fact-wrap">
    <div class="fact-mapbox">
      <div id="factMap"></div>
      <div class="fact-top">
        <div class="fact-level" id="factLevel"></div>
        <div class="fact-hint" id="factHint"></div>
      </div>
      <div class="fact-kpi" id="factKpi"></div>
      <div class="fact-legend" id="factLegend"></div>
    </div>
    <aside class="fact-side" id="factSide">
      <div class="fs-head">
        <b id="sideTitle">事实卡片</b><span class="n" id="sideCount"></span><span class="sp"></span>
        <button class="ghost sm" id="sideBack" hidden>← 返回事实卡片</button>
      </div>
      <div class="fs-body" id="sideBody"></div>
    </aside>
  </div>`;

  function mount(el) {
    root = el;
    root.innerHTML = TPL;
    dom = {
      map: root.querySelector('#factMap'), level: root.querySelector('#factLevel'), hint: root.querySelector('#factHint'),
      kpi: root.querySelector('#factKpi'), legend: root.querySelector('#factLegend'),
      side: root.querySelector('#factSide'), sideTitle: root.querySelector('#sideTitle'),
      sideCount: root.querySelector('#sideCount'), sideBody: root.querySelector('#sideBody'), sideBack: root.querySelector('#sideBack')
    };
    dom.sideBack.onclick = () => S.set({ factId: null, logOpen: false });
    window.addEventListener('resize', () => chart && chart.resize());
  }

  /* ---------- 地图 ---------- */
  function mapReady() {
    if (!window.echarts) return;
    const cur = echarts.getMap('world110');
    /* 内联数据是精简 {n,c}，必须转 GeoJSON；若曾被错误注册为原始数组则重新注册 */
    if (!cur || !(cur.geoJSON && cur.geoJSON.features && cur.geoJSON.features.length)) {
      try { echarts.registerMap('world110', worldGeoJSON()); } catch (e) { console.error('registerMap world110', e); }
    }
    if (window.__CHINA_GEO && !echarts.getMap('china')) { try { echarts.registerMap('china', window.__CHINA_GEO); } catch (e) { console.error('registerMap china', e); } }
  }

  function ensureChart() {
    if (chart) return chart;
    mapReady();
    if (!dom.map || !window.echarts) return null;
    chart = echarts.init(dom.map);
    chart.on('click', onMapClick);
    return chart;
  }

  function flyTo(center, zoom, dur) {
    const from = { center: camera.center.slice(), zoom: camera.zoom }, t0 = performance.now();
    dur = dur || 900;
    if (camera.raf) cancelAnimationFrame(camera.raf);
    return new Promise(res => {
      const step = now => {
        const t = Math.min(1, (now - t0) / dur), e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        camera.center = [from.center[0] + (center[0] - from.center[0]) * e, from.center[1] + (center[1] - from.center[1]) * e];
        camera.zoom = from.zoom + (zoom - from.zoom) * e;
        if (chart) chart.setOption({ geo: { center: camera.center.slice(), zoom: camera.zoom } }, { lazyUpdate: false, silent: true });
        if (t < 1) camera.raf = requestAnimationFrame(step);
        else { camera.raf = null; res(); }
      };
      camera.raf = requestAnimationFrame(step);
    });
  }

  const CAT_COLOR = cat => (D.CATS[cat] ? D.CATS[cat].c : '#1d4ed8');

  function mapOption() {
    const st = S.state, facts = F.factsAtLevel(st), lv = LEVEL[st.geo.level];
    const circles = [], pts = [], high = [];
    facts.forEach(f => {
      const r = Math.max(11, Math.min(34, (f.radius || 120) / 11)) * (st.geo.level === 'L1' ? 1.6 : 1);
      circles.push({ id: f.id, value: [f.lng, f.lat], symbolSize: r, itemStyle: { color: CAT_COLOR(f.cat), opacity: .12 } });
      const item = { id: f.id, name: f.title, value: [f.lng, f.lat, f.radius], symbolSize: 9 + Math.min(9, (f.radius || 100) / 45), itemStyle: { color: CAT_COLOR(f.cat) } };
      (f.impact === 'high' ? high : pts).push(item);
    });
    /* 省级底色：把事实数量映射到浅色梯度（L2 全国视角） */
    const regions = [];
    if (st.geo.level === 'L2') {
      const byProv = {};
      F.facts(st).filter(f => f.level !== 'global').forEach(f => { const p = provOf(f); byProv[p] = (byProv[p] || 0) + 1; });
      Object.keys(byProv).forEach(p => {
        const full = (window.__CHINA_GEO.features.find(x => shortProv(x.properties.name) === p) || {}).properties;
        if (full) regions.push({ name: full.name, itemStyle: { areaColor: 'rgba(37,99,235,' + Math.min(.3, .07 + .05 * byProv[p]).toFixed(2) + ')' } });
      });
      const focus = st.geo.focus;
      if (focus) { const f2 = window.__CHINA_GEO.features.find(x => shortProv(x.properties.name) === focus); if (f2) regions.push({ name: f2.properties.name, itemStyle: { areaColor: 'rgba(29,78,216,.14)', borderColor: '#1d4ed8', borderWidth: 1.6 } }); }
    }
    if (st.geo.level === 'L1') {
      ['Chile', 'Brazil', 'Malaysia', 'China'].forEach(n => regions.push({ name: n, itemStyle: { areaColor: 'rgba(37,99,235,.10)' } }));
    }
    const geo = {
      map: lv.map, roam: false, zoom: camera.zoom, center: camera.center.slice(), regions,
      itemStyle: { areaColor: '#eef3fa', borderColor: 'rgba(120,145,185,.5)', borderWidth: .7 },
      emphasis: { itemStyle: { areaColor: '#dfeafc' }, label: { show: true, color: '#0f172a', fontSize: 10 } },
      select: { disabled: true },
      label: { show: st.geo.level !== 'L1', fontSize: 9, color: '#94a3b8' }
    };
    return {
      geo,
      animationDurationUpdate: 320,
      tooltip: {
        trigger: 'item', backgroundColor: 'rgba(255,255,255,.96)', borderColor: 'rgba(15,23,42,.12)', textStyle: { color: '#10151f', fontSize: 12 },
        formatter: p => {
          if (p.seriesType === 'scatter' || p.seriesType === 'effectScatter') {
            const f = D.factById(p.data.id); if (!f) return '';
            return '<b>' + D.CATS[f.cat].n + '</b> · ' + f.date + '<br>' + f.title + '<br><span style="color:#64707f">' + f.region + ' · 影响半径 ' + f.radius + 'km（示意）</span>';
          }
          return p.name || '';
        }
      },
      series: [
        { id: 'impact', type: 'scatter', coordinateSystem: 'geo', data: circles, silent: true, z: 1, symbol: 'circle' },
        { id: 'facts', type: 'scatter', coordinateSystem: 'geo', data: pts, z: 6, symbol: 'circle',
          itemStyle: { borderColor: '#fff', borderWidth: 1.2 }, label: { show: true, position: 'right', fontSize: 10, color: '#334155', formatter: p => (D.factById(p.data.id) || {}).short || '' } },
        { id: 'hot', type: 'effectScatter', coordinateSystem: 'geo', data: high, z: 7, symbolSize: 11, rippleEffect: { scale: 2.2, brushType: 'stroke' },
          itemStyle: { color: '#dc2626', borderColor: '#fff', borderWidth: 1.2 }, label: { show: true, position: 'right', fontSize: 10, color: '#b91c1c', formatter: p => (D.factById(p.data.id) || {}).short || '' } }
      ]
    };
  }

  function onMapClick(p) {
    const st = S.state;
    if (p.data && p.data.id && (p.seriesType === 'scatter' || p.seriesType === 'effectScatter')) return S.set({ factId: p.data.id, logOpen: false });
    const name = p.name || '';
    if (!name) return;
    if (st.geo.level === 'L1') {
      if (name === 'China') return S.set({ geo: { level: 'L2', focus: null } });
      const probe = { Chile: '智利', Brazil: '巴西', Malaysia: '马来西亚' }[name];
      if (probe && F.facts(Object.assign({}, st, { q: probe })).length) return S.set({ q: probe });
      return S.emit('toast', '该区域暂无事实（本轮样例覆盖 3 个境外产区）');
    }
    const short = shortProv(name);
    if (st.geo.level === 'L2') {
      const c = PROV[short];
      if (!c) return S.emit('toast', short + '：本轮样例未覆盖，可在左侧分类栏查看全部事实');
      S.set({ geo: { level: 'L3', focus: short }, factId: null });
      camera.center = [c[0], c[1]]; flyTo([c[0], c[1]], c[2], 900);
      return;
    }
    if (st.geo.level === 'L3' && short !== st.geo.focus) return S.emit('toast', '当前为省区视角（' + st.geo.focus + '），返回全国后可切换到其它省区');
  }

  /* ---------- 覆盖层：层级 / KPI / 图例 ---------- */
  function renderLevel() {
    const st = S.state;
    const lv = st.geo.level;
    const item = (level, label, isCur) => isCur
      ? '<b>' + label + '</b>'
      : '<button data-lv="' + level + '">' + label + '</button>';
    const bc = item('L1', '全球', lv === 'L1') + '<span>›</span>' + item('L2', '中国', lv === 'L2');
    dom.level.innerHTML = bc
      + (lv === 'L3' ? '<span>›</span><b>' + st.geo.focus + '</b> <button data-back="1" class="ghost sm" style="margin-left:6px">返回全国</button>' : '')
      + (lv === 'L1' ? ' <span style="color:#64707f;font-size:.75rem">点中国或「中国」进入全国视角</span>' : '');
    dom.level.querySelectorAll('[data-lv]').forEach(b => b.onclick = () => {
      const want = b.dataset.lv;
      const c = LEVEL[want];
      if (want === 'L1') { camera.center = c.center.slice(); camera.zoom = c.zoom; }
      if (want === 'L2') { camera.center = c.center.slice(); camera.zoom = c.zoom; }
      S.set({ geo: { level: want, focus: null }, factId: null });
    });
    const back = dom.level.querySelector('[data-back]');
    if (back) back.onclick = () => { const c = LEVEL.L2; camera.center = c.center.slice(); camera.zoom = c.zoom; S.set({ geo: { level: 'L2', focus: null }, factId: null }); };
    dom.hint.textContent = st.geo.level === 'L3'
      ? '省区视角 · ' + LEVEL.L3.note + ' · Esc 或「返回全国」回到上一级'
      : st.geo.level === 'L2'
        ? '点省份进入省区视角 · 点事实点看详情 · 点空白处或 Esc 返回全球'
        : '点境外产区看该来源事实 · 点中国进入全国视角';
  }

  function renderKpi() {
    const st = S.state, facts = F.factsAtLevel(st);
    const hi = facts.filter(f => f.cred === 'high').length;
    const objIds = new Set(); facts.forEach(f => f.objects.forEach(o => objIds.add(o)));
    const risky = facts.filter(f => f.impact === 'high').length;
    const last = facts.map(f => f.date).sort().pop() || '—';
    dom.kpi.innerHTML = [
      ['本层事实', facts.length + ' <small>条</small>'],
      ['高可信', facts.length ? Math.round(hi / facts.length * 100) + '<small>%</small>' : '—'],
      ['关联本体对象', objIds.size + ' <small>个</small>'],
      ['高影响事实', risky + ' <small>条</small>'],
      ['最近更新', last]
    ].map(([k, v]) => '<div class="kpi"><span class="k">' + k + '</span><span class="kpi-v">' + v + '</span></div>').join('');
  }

  function renderLegend() {
    const cats = Object.keys(D.CATS).map(k => '<span class="lg-i"><i style="background:' + D.CATS[k].c + '"></i>' + D.CATS[k].n + '</span>').join('');
    dom.legend.innerHTML = '<span class="lg-t">事实类型</span>' + cats +
      '<span class="lg-i"><span class="ring"></span>影响范围（半径示意）</span>' +
      '<span class="lg-i" style="color:#b91c1c">红色脉冲 = 高影响事实</span>' +
      '<span class="lg-i" style="color:#64707f">点大小 = 影响半径 · 示意数据 · 待标定</span>';
  }

  /* ---------- 右侧：卡片列表 / 事实详情 ---------- */
  const MEDIA = { image: '图文', video: '视频', live: '公开直播流', text: '文本与原文' };
  const CRED = { high: ['高可信', 'hi'], mid: ['中等可信', 'mid'], low: ['低可信 · 待核', 'low'] };
  const IMPACT = { high: ['高影响', 'impact'], mid: ['中影响', ''], low: ['低影响', 'lower'] };

  function chip(txt, cls, color) {
    return '<span class="chip ' + (cls || '') + '">' + (color ? '<i style="background:' + color + '"></i>' : '') + txt + '</span>';
  }

  function renderCards() {
    const st = S.state, facts = F.factsAtLevel(st);
    dom.sideBack.hidden = true;
    dom.sideTitle.textContent = '事实卡片';
    dom.sideCount.textContent = facts.length + ' 条 · ' + (F.levelMixed(st) ? '本层无匹配，已显示其它层级' : LEVEL[st.geo.level].note);
    if (!facts.length) {
      dom.sideBody.innerHTML = '<div class="empty">当前筛选下本层没有事实。<br>时间「' + st.time + '」· 分类「' + (st.cat === 'all' ? '全部' : D.CATS[st.cat].n) + '」<br>' +
        '<button class="ghost sm" id="clrF" style="margin-top:10px">清除筛选条件</button></div>';
      const b = dom.sideBody.querySelector('#clrF');
      if (b) b.onclick = () => S.set({ time: 'all', cat: 'all', sub: null, src: 'all', cred: 'all', infl: 'all', q: '' });
      return;
    }
    dom.sideBody.innerHTML = facts.map(f => `
      <article class="fcard${st.factId === f.id ? ' on' : ''}" data-fid="${f.id}" tabindex="0">
        ${f.media === 'image' ? '<div class="fc-thumb">' + f.mediaNote + '</div>' : ''}
        <div class="fcard-t">${chip(D.CATS[f.cat].n, '', D.CATS[f.cat].c)}${chip(CRED[f.cred][0], CRED[f.cred][1])}${f.impact === 'high' ? chip('高影响', 'impact') : ''}</div>
        <h5>${f.title}</h5>
        <div class="fc-meta"><span>${f.date}</span><span>${f.region}</span><span>${f.objects.length} 个本体对象</span><span>${f.relations.length} 条关系</span></div>
        <div class="fc-media">${f.media === 'live' ? '<span style="color:#b91c1c">●</span>' : '▤'} ${MEDIA[f.media]} · ${f.mediaNote}</div>
      </article>`).join('');
    dom.sideBody.querySelectorAll('.fcard').forEach(el => {
      const open = () => S.set({ factId: el.dataset.fid, logOpen: false });
      el.onclick = open;
      el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
    });
  }

  function renderDetail() {
    const st = S.state, f = D.factById(st.factId);
    if (!f) return renderCards();
    const inSeeds = (st.sim.seedIds || []).includes(f.id);
    dom.sideBack.hidden = false;
    dom.sideTitle.textContent = '事实详情';
    dom.sideCount.textContent = f.id;
    const objs = f.objects.map(id => D.objById(id)).filter(Boolean);
    const relatedRels = f.relations.map(id => D.relById(id)).filter(Boolean);
    const logs = (D.STREAM.fact || []).concat(D.STREAM.relation || []).filter(l => l[2] === f.id);

    dom.sideBody.innerHTML = `
      <div class="fd">
        <h3>${f.title}</h3>
        <div class="fd-meta">
          ${chip(D.CATS[f.cat].n, '', D.CATS[f.cat].c)}${chip(CRED[f.cred][0], CRED[f.cred][1])}${chip(IMPACT[f.impact][0], IMPACT[f.impact][1])}
          ${chip(f.date)}${chip(f.region)}${chip(f.level === 'global' ? '全球' : f.level === 'china' ? '全国' : '省区')}
        </div>
        <div class="fd-media ${f.media}"><span class="tag-abs">${MEDIA[f.media]} · 示意素材</span>${f.mediaNote}</div>
        ${f.media === 'live' ? '<p class="pnote" style="margin-bottom:10px">公开直播流为示意占位，不接入真实视频源；卡片与详情共用同一媒介标签。</p>' : ''}
        <p>${f.summary}</p>

        <div class="fd-sec">
          <h4>影响范围 <small>当前时点的空间影响估算（示意 · 待标定）</small></h4>
          <div class="impact">
            <div class="viz">${f.radius}<br><span style="font-size:.6875rem">km</span></div>
            <div class="txt">
              <b>${IMPACT[f.impact][0]}</b> · 半径约 ${f.radius} km<br>
              图上以半透明圆表示当前时点的空间影响估算；无法投影到地图的影响对象只在下方对象列表中呈现，不做「直接影响区 / 主要影响区 / 潜在影响区」分区热力图。
            </div>
          </div>
        </div>

        <div class="fd-sec">
          <h4>证据 <small>${f.evidence.length} 条 · 可回溯</small></h4>
          ${f.evidence.map(e => `<div class="ev"><div class="ev-t">${chip(e.k)}${e.t}</div><q>${e.q}</q></div>`).join('')}
        </div>

        <div class="fd-sec">
          <h4>相关本体对象 <small>${objs.length} 个 · 点开进入关联层</small></h4>
          <div>${objs.map(o => {
            const d = D.domain(o.domain);
            return `<span class="rel-chip" data-obj="${o.id}"><i class="chip-dot" style="width:7px;height:7px;border-radius:50%;display:inline-block;background:${d.c}"></i><b>${o.name}</b>${d.n}${o.geo ? '' : ' · 无坐标'}</span>`;
          }).join('')}</div>
        </div>

        <div class="fd-sec">
          <h4>相关关系 <small>${relatedRels.length} 条</small></h4>
          <div>${relatedRels.map(r => {
            const a = D.objById(r.from), b = D.objById(r.to);
            return `<span class="rel-chip" data-rel="${r.id}"><b>${a ? a.name : r.from}</b> ${r.type} <b>${b ? b.name : r.to}</b> · 置信 ${(r.confidence * 100).toFixed(0)}%</span>`;
          }).join('')}</div>
        </div>

        <div class="fd-actions">
          <button class="btn" id="toRel">进入关联层（携带本条事实）</button>
          <button class="btn sec" id="toSeed">${inSeeds ? '已在推演种子中 · 前往推演层' : '加入推演种子'}</button>
          <button class="btn ter" id="toLog">${st.logOpen ? '收起处理记录' : '查看处理记录（次级）'}</button>
        </div>
        ${st.logOpen ? `<div class="fd-sec"><h4>处理记录 <small>本条事实在流水中的处理步骤</small></h4>
          <div class="rec-log">${logs.length ? logs.map(l => '<div>[' + l[0] + '] ' + l[1] + '</div>').join('') : '<div>暂无该事实的处理记录</div>'}</div></div>` : ''}
        <p class="pnote" style="margin-top:12px">全部数值为示意数据（待标定），仅用于确认展示形态与信息结构。</p>
      </div>`;

    const openObj = id => S.set({ tab: 'relation', rel: { sel: id, kind: 'object', domain: 'all', focusFact: f.id }, carry: uniq([...(st.carry || []), f.id]) });
    dom.sideBody.querySelectorAll('[data-obj]').forEach(el => el.onclick = () => openObj(el.dataset.obj));
    dom.sideBody.querySelectorAll('[data-rel]').forEach(el => el.onclick = () => S.set({ tab: 'relation', rel: { sel: el.dataset.rel, kind: 'relation', focusFact: f.id }, carry: uniq([...(st.carry || []), f.id]) }));
    dom.sideBody.querySelector('#toRel').onclick = () => {
      S.set({ tab: 'relation', carry: uniq([...(st.carry || []), f.id]), rel: { focusFact: f.id, sel: null, kind: null } });
      S.emit('toast', '已携带「' + f.short + '」进入关联层');
    };
    dom.sideBody.querySelector('#toSeed').onclick = () => {
      const ids = uniq([...(st.sim.seedIds || []), f.id]);
      S.set({ sim: { seedIds: ids } });
      S.emit('toast', inSeeds ? '该事实已在推演种子中（共 ' + ids.length + ' 条）' : '已加入推演种子（共 ' + ids.length + ' 条）');
    };
    dom.sideBody.querySelector('#toLog').onclick = () => S.set({ logOpen: !st.logOpen });
  }

  const uniq = a => a.filter((x, i) => a.indexOf(x) === i);

  /* ---------- 主更新 ---------- */
  function update() {
    if (!root) return;
    const st = S.state;
    /* 从推演层/关联层打开省级事实时，把地图同步到该省区，避免「详情在别的层级」 */
    if (st.factId) {
      const f = D.factById(st.factId);
      if (f && f.level === 'province') {
        const p = provOf(f);
        if (st.geo.level !== 'L3' || st.geo.focus !== p) { S.set({ geo: { level: 'L3', focus: p } }); return; }
      }
    }
    const key = JSON.stringify([st.time, st.cat, st.sub, st.src, st.cred, st.infl, st.q, st.geo.level, st.geo.focus, st.factId, st.panels.cards, st.logOpen, st.carry, (st.sim || {}).seedIds]);
    if (key === sig) return; sig = key;

    dom.side.classList.toggle('off', !st.panels.cards);
    const lvKey = st.geo.level + '|' + (st.geo.focus || '');
    const c = ensureChart();
    if (!c) return;
    if (camera.level !== lvKey) {
      camera.level = lvKey;
      const t = LEVEL[st.geo.level];
      const focus = st.geo.focus && PROV[st.geo.focus];
      const target = focus ? [focus[0], focus[1]] : t.center;
      const zoom = focus ? focus[2] : t.zoom;
      if (st.geo.level === 'L3' && focus) { camera.center = [focus[0], focus[1]]; camera.zoom = focus[2]; }
      else if (st.geo.level !== 'L3') { camera.center = target.slice(); camera.zoom = zoom; }
      c.clear();
    }
    c.setOption(mapOption(), { notMerge: true });
    renderLevel(); renderKpi(); renderLegend();
    if (st.factId) renderDetail(); else renderCards();
  }

  const debug = () => {
    const st = S.state, o = chart ? chart.getOption() : null;
    return { level: st.geo.level, focus: st.geo.focus, series: o ? o.series.map(s => (s.data || []).length) : [], facts: F.factsAtLevel(st).length };
  };

  return { mount, update, debug, flyTo };
})();
