/* ============================================================
   V0.4 过滤 + 分类字典：事实层 / 关联层共用的唯一过滤实现
   分类字典为三级结构（一级纯文字标题 → 二级文字子标题 → 三级 emoji 方块卡片）
   三级卡片的选中集合直接决定地图与卡片的可见数据；默认全选。
   过滤条件全部来自 V03Store.state（时间 / 可信度 / 影响 / 搜索 / 三级分类）
   ============================================================ */
window.V03Filter = (function () {
  const D = window.V03Data;
  const A = window.V03Atlas || { REGIONS: [], GATES: [], PACK: { facts: [], objects: [], relations: [] } };

  /* ---------- 事实层三级分类字典 ---------- */
  const FACT_TREE = [
    { n: '供给与生产', subs: [
      { n: '产区与品种', items: [
        { key: 'grain',   n: '粮油产区', e: '🌾', c: 'trade',     t: /水稻|小麦|玉米|大豆|油菜|薯|粮|油料/ },
        { key: 'fruitveg', n: '果蔬产区', e: '🍊', c: 'trade',    t: /果|蔬|菜|柑|橙|苹果|车厘子|榴莲|香蕉|葡萄|猕猴桃/ },
        { key: 'livestock', n: '畜牧水产', e: '🐄', c: 'trade',   t: /牛|猪|羊|禽|肉|乳|水产|虾|鱼|蟹/ }
      ] },
      { n: '气象与灾害', items: [
        { key: 'disaster', n: '气象灾害', e: '🌪️', c: 'weather', t: /台风|暴雨|洪|干旱|冻害|霜冻|冰雹|灾害/ },
        { key: 'extreme',  n: '极端天气', e: '🌡️', c: 'weather', t: /高温|热浪|寒潮|低温|气温|降水/ }
      ] }
    ] },
    { n: '流通与政策', subs: [
      { n: '通道与口岸', items: [
        { key: 'gate',   n: '口岸物流', e: '🛳️', c: 'logistics', t: /口岸|港口|机场|海关|通关|班列|航线/ },
        { key: 'freight', n: '干线运价', e: '🚚', c: 'logistics', t: /运价|运费|干线|空驶|物流成本|运输/ },
        { key: 'cold',   n: '冷链仓储', e: '❄️', c: 'logistics', t: /冷库|冷链|库存|仓储|损耗|周转/ }
      ] },
      { n: '政策与监管', items: [
        { key: 'poltrade', n: '贸易政策', e: '📜', c: 'policy', t: /关税|自贸|协定|配额|进出口|贸易政策|采购/ },
        { key: 'polsupp',  n: '地方扶持', e: '🏛️', c: 'policy', t: /补贴|扶持|专项|资金|目录|示范|奖补/ },
        { key: 'quarantine', n: '检疫通关', e: '🛡️', c: 'policy', t: /检疫|检验|通关|备案|许可|标准|准入/ }
      ] }
    ] },
    { n: '市场与交易', subs: [
      { n: '价格行情', items: [
        { key: 'wholesale', n: '批发价格', e: '🏷️', c: 'price', t: /批发|均价|收购价|价格|元／公斤|元\/公斤/ },
        { key: 'index',     n: '价格指数', e: '📈', c: 'price', t: /指数|环比|同比|涨幅/ }
      ] },
      { n: '交易与库存', items: [
        { key: 'deal',  n: '成交动态', e: '🤝', c: 'trade', t: /成交|交易|竞价|订单|签约|到货量|成交量/ },
        { key: 'stock', n: '库存周转', e: '📦', c: 'logistics', t: /库存|周转|压港|集港|库容|出入库/ }
      ] }
    ] }
  ];

  /* ---------- 关联层三级分类字典（九类本体对象域） ---------- */
  const REL_TREE = [
    { n: '地理实体', subs: [
      { n: '交易与物流节点', items: [
        { key: 'market',   n: '市场', e: '🏬' },
        { key: 'facility', n: '设施渠道', e: '🚉' }
      ] },
      { n: '生产与区域', items: [
        { key: 'base',   n: '基地', e: '🌱' },
        { key: 'region', n: '区域', e: '🗺️' }
      ] }
    ] },
    { n: '经营主体', subs: [
      { n: '企业与机构', items: [
        { key: 'company', n: '公司', e: '🏢' },
        { key: 'agency',  n: '政策机构', e: '🏛️' }
      ] },
      { n: '角色', items: [
        { key: 'person', n: '人物角色', e: '🧑‍🌾' }
      ] }
    ] },
    { n: '抽象对象', subs: [
      { n: '品种与指标', items: [
        { key: 'variety', n: '品种', e: '🍎' },
        { key: 'metric',  n: '指标', e: '📊' }
      ] }
    ] }
  ];

  const flat = tree => tree.reduce((a, g) => a.concat(g.subs.reduce((b, s) => b.concat(s.items), [])), []);
  const FACT_ITEMS = flat(FACT_TREE), REL_ITEMS = flat(REL_TREE);
  const itemBy = (items, key) => items.find(x => x.key === key) || null;
  const allKeys = items => items.map(x => x.key);

  /* 选中集合：null = 默认全选 */
  const selected = (state, field, items) => {
    const raw = state[field];
    const list = Array.isArray(raw) ? raw.filter(k => itemBy(items, k)) : allKeys(items);
    return new Set(list.length ? list : []);
  };

  function toggleLeaf(state, field, items, key) {
    const cur = selected(state, field, items);
    if (cur.has(key)) cur.delete(key); else cur.add(key);
    return { [field]: allKeys(items).filter(k => cur.has(k)) };
  }
  const factLeafOn = (state, key) => selected(state, 'catKeys', FACT_ITEMS).has(key);
  const relLeafOn = (state, key) => selected(state, 'relKeys', REL_ITEMS).has(key);

  /* ---------- 事实过滤 ---------- */
  /* cred / infl 为「阈值」语义：高 = 仅高；中 = 高 + 中；低 = 不限 */
  const minOf = v => ({ high: 3, mid: 2, low: 1 }[v] || 1);
  const RANK = { high: 3, mid: 2, low: 1 };
  const credOk = (f, v) => RANK[f.cred] >= minOf(v);
  const inflOk = (f, v) => RANK[f.impact] >= minOf(v);

  const hit = (f, q) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (f.title + f.summary + f.region + f.short).toLowerCase().includes(s);
  };
  /* 三级卡片 → 事实：
     · 本事实所属分类的叶子全部选中 → 不做细分过滤（全选 = 不筛）
     · 只选中了部分叶子 → 按选中叶子的细分规则取并集（取消一张即立即生效）
     · 该分类一张都没选 → 本类事实不显示 */
  function matched(f, set, items) {
    const all = items.filter(it => it.c === f.cat);
    if (!all.length) return false;
    const on = all.filter(it => set.has(it.key));
    if (!on.length) return false;
    if (on.length === all.length) return true;
    return on.some(it => !it.t || it.t.test(f.title + ' ' + f.summary));
  }

  function facts(s) {
    s = s || window.V03Store.state;
    const set = selected(s, 'catKeys', FACT_ITEMS);
    return D.FACTS.filter(f =>
      D.inWindow(f.date, s.time) &&
      matched(f, set, FACT_ITEMS) &&
      credOk(f, s.cred) &&
      inflOk(f, s.infl) &&
      hit(f, s.q)
    );
  }

  /* 事实层地图：视线漏斗 —— 地图看到哪里就显示哪里的数据（M0 / M13）
     L1 全球：全部事实（整个世界铺开）
     L2 全国：中国范围以内的事实（远处事实退出视野）
     L3 省区：聚焦省区范围内的事实（区域内更密） */
  const provOf = f => String(f.region || '').split('·')[0].trim();
  const inBox = (f, b) => f.lng >= b.lng[0] && f.lng <= b.lng[1] && f.lat >= b.lat[0] && f.lat <= b.lat[1];
  const PAD = { lng: 2.8, lat: 2.2 };

  function factsAtLevel(s) {
    s = s || window.V03Store.state;
    const all = facts(s);
    const lv = s.geo.level;
    let list;
    if (lv === 'L1') list = all;
    else if (lv === 'L2') list = all.filter(f => inBox(f, D.CHINA_BOX));
    else {
      const focus = s.geo.focus, c = (D.PROV_CENTER || {})[focus];
      list = all.filter(f => provOf(f) === focus ||
        (c && Math.abs(f.lng - c[0]) <= PAD.lng && Math.abs(f.lat - c[1]) <= PAD.lat));
    }
    /* 携带进来的事实始终可见，避免「带了上下文却看不到」 */
    const carry = s.carry || [];
    carry.forEach(id => {
      const f = D.factById(id);
      if (f && !list.includes(f) && facts(s).some(x => x.id === id)) list = list.concat(f);
    });
    /* 本层被筛空时，退回到「全部层级里符合筛选的事实」，并在界面上明说 */
    if (!list.length) list = all;
    return list;
  }
  function levelMixed(s) {
    s = s || window.V03Store.state;
    const all = facts(s);
    return all.length > 0 && factsAtLevel(s).length === all.length && s.geo.level !== 'L1' &&
      !all.some(f => s.geo.level === 'L2' ? inBox(f, D.CHINA_BOX) : provOf(f) === s.geo.focus);
  }
  /* 整体（不受层级限制）符合筛选的事实：地图星点做「全局可见、逐层加密」用 */
  const factsAll = s => facts(s);

  /* ---------- 关联层对象 / 关系 ---------- */
  /* 对象：按三级字典（=九类对象域）+ 导航域 + 搜索过滤；时间窗口下无支撑事实的对象退出视野
     （品种 / 指标 / 政策机构 / 角色为结构性对象，不因窗口缺失而消失） */
  const STRUCTURAL = { variety: 1, metric: 1, agency: 1, person: 1 };
  function objects(s) {
    s = s || window.V03Store.state;
    const rel = s.rel || {};
    const set = selected(s, 'relKeys', REL_ITEMS);
    const carried = new Set();
    (s.carry || []).forEach(id => { const f = D.factById(id); if (f) (f.objects || []).forEach(o => carried.add(o)); });

    let list = D.OBJECTS.filter(o => set.has(o.domain));
    if (rel.domain && rel.domain !== 'all') list = list.filter(o => o.domain === rel.domain);
    if (s.q) { const q = s.q.toLowerCase(); list = list.filter(o => (o.name + o.sub + (D.domain(o.domain) || {}).n).toLowerCase().includes(q)); }
    if (s.time && s.time !== 'all') {
      list = list.filter(o => STRUCTURAL[o.domain] || carried.has(o.id) ||
        D.factsOfObject(o.id).some(f => D.inWindow(f.date, s.time)));
    }
    if (rel.onlyCarry) list = list.filter(o => carried.has(o.id));
    if (rel.focusFact) {
      const f = D.factById(rel.focusFact);
      const focus = new Set(f ? f.objects : []);
      list = list.sort((a, b) => (focus.has(b.id) ? 1 : 0) - (focus.has(a.id) ? 1 : 0));
    }
    return list.map(o => Object.assign({}, o, { _carried: carried.has(o.id) }));
  }

  /* 关系：两端对象都在当前选择集内；可信度阈值映射到关系置信度（高 ≥ 0.75 / 中 ≥ 0.6 / 低不限） */
  const MIN_CONF = { high: .75, mid: .6, low: 0, all: 0 };
  function relations(s) {
    s = s || window.V03Store.state;
    const ids = new Set(objects(s).map(o => o.id));
    const need = MIN_CONF[s.cred] != null ? MIN_CONF[s.cred] : 0;
    return D.RELATIONS.filter(r => ids.has(r.from) && ids.has(r.to) && r.confidence >= need)
      .map(r => Object.assign({}, r, { _carried: (r.factIds || []).some(f => (s.carry || []).includes(f)) }));
  }

  /* ---------- 数据概览（左侧图层菜单第一层） ---------- */
  function overview(s) {
    s = s || window.V03Store.state;
    if (s.tab === 'relation') {
      const objs = objects(s), rels = relations(s);
      const factIds = new Set();
      rels.forEach(r => (r.factIds || []).forEach(f => factIds.add(f)));
      const hi = rels.filter(r => r.confidence >= .6).length;
      const dist = {};
      D.DOMAINS.forEach(d => { dist[d.id] = objs.filter(o => o.domain === d.id).length; });
      const maxDate = D.OBJECTS.length ? D.latestDate(objs.reduce((a, o) => a.concat(D.factsOfObject(o.id)), [])) : null;
      return {
        rows: [
          ['本体对象', objs.length + ' 个'],
          ['关联关系', rels.length + ' 条'],
          ['高置信关系', (rels.length ? Math.round(hi / rels.length * 100) : 0) + '%'],
          ['支撑事实', factIds.size + ' 条'],
          ['最近更新', maxDate || D.TODAY]
        ],
        distTitle: '本体类型分布',
        dist: D.DOMAINS.map(d => ({ n: d.n, e: d.e, v: dist[d.id], c: d.c }))
      };
    }
    const list = facts(s);
    const objIds = new Set();
    list.forEach(f => (f.objects || []).forEach(o => objIds.add(o)));
    const dist = {};
    Object.keys(D.CATS).forEach(k => { dist[k] = list.filter(f => f.cat === k).length; });
    return {
      rows: [
        ['本层事实', list.length + ' 条'],
        ['高可信占比', (list.length ? Math.round(list.filter(f => f.cred === 'high').length / list.length * 100) : 0) + '%'],
        ['关联本体对象', objIds.size + ' 个'],
        ['高影响事实', list.filter(f => f.impact === 'high').length + ' 条'],
        ['最近更新时间', D.latestDate(list) || D.TODAY]
      ],
      distTitle: '事实类型分布',
      dist: Object.keys(D.CATS).map(k => ({ n: D.CATS[k].n, e: D.CATS[k].e, v: dist[k], c: D.CATS[k].c }))
    };
  }

  const counts = (s, arr) => arr.reduce((m, x) => (m[x.cat || x.domain] = (m[x.cat || x.domain] || 0) + 1, m), {});

  /* ---------- 推演种子（推演层沿用，口径不变） ---------- */
  const uniq = a => a.filter((x, i) => a.indexOf(x) === i);
  const defaultSeeds = sim => {
    const sc = (D.SCENARIOS || []).find(x => x.id === (sim || {}).scenario);
    return sc ? sc.seeds : (D.BASELINE || []).map(b => b.fact);
  };
  function seeds(s) {
    s = s || window.V03Store.state;
    const sim = s.sim || {};
    const off = sim.seedOff || [];
    const base = defaultSeeds(sim).filter(id => !off.includes(id));
    return uniq(base.concat(s.carry || []).concat(sim.seedIds || []));
  }
  function toggleSeed(s, id, on) {
    const sim = s.sim || {};
    const isDefault = defaultSeeds(sim).includes(id);
    let ids = (sim.seedIds || []).filter(x => x !== id), off = (sim.seedOff || []).filter(x => x !== id);
    if (on) { ids = uniq(ids.concat([id])); }
    else if (isDefault) off = uniq(off.concat([id]));
    return { seedIds: ids, seedOff: off };
  }

  return {
    FACT_TREE, REL_TREE, FACT_ITEMS, REL_ITEMS, itemBy, selected, toggleLeaf, factLeafOn, relLeafOn,
    facts, factsAll, factsAtLevel, levelMixed, objects, relations, overview, counts, seeds, toggleSeed,
    totalFacts: () => D.FACTS.length,
    prov: x => (x && x.prov) || 'synthesized'
  };
})();
