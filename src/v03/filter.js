/* ============================================================
   V0.4 过滤 + 分类字典：事实层 / 关联层共用的唯一过滤实现
   分类字典直接来自数据包 ontology.json（taxonomy）与 displayDomains，
   三级卡片（一级文字标题 → 二级文字子标题 → 三级 emoji 方块）决定地图与卡片的可见数据。
   空间层级按数据包 geo.scopeLayer（L1 全球 / L2 中国 / L3 省区），下钻到 L3 时按省份收敛。
   ============================================================ */
window.V03Filter = (function () {
  const D = window.V03Data;
  const PKG = D.PKG || null;

  /* ---------- 事实层三级分类字典（数据包 taxonomy；无包时退回自带字典） ---------- */
  const LEGACY_FACT_TREE = [
    { n: '供给与生产', subs: [
      { n: '产区与品种', items: [
        { key: 'grain', n: '粮油产区', e: '🌾', c: 'trade', t: /水稻|小麦|玉米|大豆|油菜|薯|粮|油料/ },
        { key: 'fruitveg', n: '果蔬产区', e: '🍊', c: 'trade', t: /果|蔬|菜|柑|橙|苹果|车厘子|榴莲|香蕉|葡萄|猕猴桃/ },
        { key: 'livestock', n: '畜牧水产', e: '🐄', c: 'trade', t: /牛|猪|羊|禽|肉|乳|水产|虾|鱼|蟹/ }
      ] },
      { n: '气象与灾害', items: [
        { key: 'disaster', n: '气象灾害', e: '🌪️', c: 'weather', t: /台风|暴雨|洪|干旱|冻害|霜冻|冰雹|灾害/ },
        { key: 'extreme', n: '极端天气', e: '🌡️', c: 'weather', t: /高温|热浪|寒潮|低温|气温|降水/ }
      ] }
    ] },
    { n: '流通与政策', subs: [
      { n: '通道与口岸', items: [
        { key: 'gate', n: '口岸物流', e: '🛳️', c: 'logistics', t: /口岸|港口|机场|海关|通关|班列|航线/ },
        { key: 'freight', n: '干线运价', e: '🚚', c: 'logistics', t: /运价|运费|干线|空驶|物流成本|运输/ },
        { key: 'cold', n: '冷链仓储', e: '❄️', c: 'logistics', t: /冷库|冷链|库存|仓储|损耗|周转/ }
      ] },
      { n: '政策与监管', items: [
        { key: 'poltrade', n: '贸易政策', e: '📜', c: 'policy', t: /关税|自贸|协定|配额|进出口|贸易政策|采购/ },
        { key: 'polsupp', n: '地方扶持', e: '🏛️', c: 'policy', t: /补贴|扶持|专项|资金|目录|示范|奖补/ },
        { key: 'quarantine', n: '检疫通关', e: '🛡️', c: 'policy', t: /检疫|检验|通关|备案|许可|标准|准入/ }
      ] }
    ] },
    { n: '市场与交易', subs: [
      { n: '价格行情', items: [
        { key: 'wholesale', n: '批发价格', e: '🏷️', c: 'price', t: /批发|均价|收购价|价格|元／公斤|元\/公斤/ },
        { key: 'index', n: '价格指数', e: '📈', c: 'price', t: /指数|环比|同比|涨幅/ }
      ] },
      { n: '交易与库存', items: [
        { key: 'deal', n: '成交动态', e: '🤝', c: 'trade', t: /成交|交易|竞价|订单|签约|到货量|成交量/ },
        { key: 'stock', n: '库存周转', e: '📦', c: 'logistics', t: /库存|周转|压港|集港|库容|出入库/ }
      ] }
    ] }
  ];

  const FACT_TREE = (() => {
    const tax = (PKG && PKG.ONTOLOGY && PKG.ONTOLOGY.taxonomy) || null;
    if (!tax) return LEGACY_FACT_TREE;
    /* L3 方块卡片的 emoji：按二级类别语义就近取，保证每张卡片可辨识 */
    const EMOJI_RULES = [
      [/批发价|产地收购价|零售价/, '🏷️'], [/指数|价格传导|行情/, '📈'],
      [/行业新闻|舆情|风险/, '📰'], [/气象预警|灾害/, '🌪️'], [/气候/, '🌡️'],
      [/产量|种养面积/, '📦'], [/库存/, '🗄️'], [/基地|产地认证/, '🌱'],
      [/市场到货|批发交易/, '🚚'], [/损耗/, '🧊'],
      [/法规|补贴|标准/, '📜'], [/进出口政策/, '🛃'], [/通关|延误|运输|仓储/, '🚢'],
      [/进口|出口|检验/, '🛃'], [/疫病|事故|地缘|整治/, '⚠️']
    ];
    const emojiOf = (name, cat) => {
      const hit = EMOJI_RULES.find(([re]) => re.test(name));
      return hit ? hit[1] : (D.CATS[cat] ? D.CATS[cat].e : '📌');
    };
    return Object.keys(tax).map(cat => ({
      n: tax[cat].name || cat, cat,
      subs: (tax[cat].l2 || []).map(l2 => ({
        n: l2.name,
        items: (l2.l3 || []).map(x => ({
          key: cat + '|' + l2.name + '|' + x.id, n: x.title || l2.name,
          e: emojiOf(l2.name + ' ' + (x.title || ''), cat), c: cat, l2: l2.name, l3: x.id
        }))
      }))
    }));
  })();

  /* ---------- 关联层三级分类字典（数据包 ontology.displayDomains，九类本体对象域） ---------- */
  const REL_TREE = (() => {
    const dom = pk => (D.DOMAINS.find(d => d.id === pk) || { n: pk, e: '📌' });
    const mk = (key, label) => ({ key, n: dom(key).n, e: dom(key).e, c: key });
    return [
      { n: '地理实体', subs: [
        { n: '交易与物流节点', items: [mk('market'), mk('facility')] },
        { n: '生产与区域', items: [mk('base'), mk('region')] }
      ] },
      { n: '经营主体', subs: [
        { n: '企业与机构', items: [mk('company'), mk('agency')] },
        { n: '角色', items: [mk('person')] }
      ] },
      { n: '抽象对象', subs: [
        { n: '品种与指标', items: [mk('variety'), mk('metric')] }
      ] }
    ];
  })();

  const flat = tree => tree.reduce((a, g) => a.concat(g.subs.reduce((b, s) => b.concat(s.items), [])), []);
  const FACT_ITEMS = flat(FACT_TREE), REL_ITEMS = flat(REL_TREE);
  const itemBy = (items, key) => items.find(x => x.key === key) || null;
  const allKeys = items => items.map(x => x.key);

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
  /* cred / infl 为「阈值」语义：高 = 仅高；中 = 高 + 中；低/不限 = 全部 */
  const RANK = { high: 3, medium: 2, mid: 2, low: 1 };
  const BAND = { high: 'high', medium: 'mid', mid: 'mid', low: 'low' };
  const minOf = v => ({ high: 3, mid: 2, low: 1 }[v] || 1);
  const credOk = (f, v) => (RANK[f.cred] || 1) >= minOf(v);
  const inflOk = (f, v) => (RANK[f.impact] || 1) >= minOf(v);

  const hit = (f, q) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (f.title + f.summary + f.region + (f.card && f.card.commodityName ? f.card.commodityName : '')).toLowerCase().includes(s);
  };

  /* 三级卡片 → 事实：
     · 该分类下的叶子全选 → 不细分过滤
     · 只选中部分叶子 → 按数据包 taxonomy（二级 + 三级 id）精确取并集
     · 该分类一张都没选 → 本类事实不显示
     无数据包时退回自带字典的正则细分规则。 */
  function matched(f, set, items) {
    const catItems = items.filter(it => it.c === f.cat);
    if (!catItems.length) return false;
    const on = catItems.filter(it => set.has(it.key));
    if (!on.length) return false;
    if (on.length === catItems.length) return true;
    const l2 = (f.taxonomy || {}).l2, l3 = (f.taxonomy || {}).l3;
    return on.some(it => (it.l3 ? it.l2 === l2 && it.l3 === l3 : (!it.t || it.t.test(f.title + ' ' + f.summary))));
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

  /* ---------- 空间层级（数据包 scopeLayer 为准） ---------- */
  const shortProv = n => String(n || '').replace(/壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市$/g, '') || n;
  const DEFAULT_FOCUS = '湖南';

  function factsAtLevel(s) {
    s = s || window.V03Store.state;
    const all = facts(s);
    const lv = s.geo.level;
    let list;
    if (PKG) {
      if (lv === 'L1') list = all.filter(f => f.level === 'L1');
      else if (lv === 'L2') list = all.filter(f => f.level === 'L2');
      else {
        const focus = shortProv(s.geo.focus || DEFAULT_FOCUS);
        const prov = (PKG.PROV_BY_SHORT || {})[focus] || {};
        list = all.filter(f => f.level === 'L3' &&
          (f.provinceCode === prov.code || shortProv(f.province) === focus || shortProv(f.region) === focus));
      }
    } else {
      /* 无数据包：按视野盒兜底 */
      const prov = (D.PROV_CENTER || {})[shortProv(s.geo.focus || DEFAULT_FOCUS)] || null;
      list = lv === 'L1' ? all
        : lv === 'L2' ? all.filter(f => f.lng >= D.CHINA_BOX.lng[0] && f.lng <= D.CHINA_BOX.lng[1] && f.lat >= D.CHINA_BOX.lat[0] && f.lat <= D.CHINA_BOX.lat[1])
          : all.filter(f => shortProv(f.region) === shortProv(s.geo.focus || DEFAULT_FOCUS) ||
            (prov && Math.abs(f.lng - prov[0]) <= 2.8 && Math.abs(f.lat - prov[1]) <= 2.2));
    }
    /* 地理精度为 none 的事实（无坐标）不上地图，但保留在卡片列表 */
    const carry = s.carry || [];
    carry.forEach(id => {
      const f = D.factById(id);
      if (f && !list.includes(f) && all.some(x => x.id === id)) list = list.concat(f);
    });
    if (!list.length) list = all;
    return list;
  }
  /* 地图上可渲染的点（有坐标） */
  const mappable = list => list.filter(f => f.lng != null && f.lat != null);

  function levelMixed(s) {
    s = s || window.V03Store.state;
    const all = facts(s);
    if (!all.length || s.geo.level === 'L1') return false;
    const atLevel = factsAtLevel(s);
    return atLevel.length === all.length;
  }

  /* ---------- 关联层对象 / 关系 ---------- */
  const STRUCTURAL = { variety: 1, metric: 1, agency: 1, person: 1 };
  function objects(s) {
    s = s || window.V03Store.state;
    const rel = s.rel || {};
    const set = selected(s, 'relKeys', REL_ITEMS);
    const carried = new Set();
    (s.carry || []).forEach(id => { const f = D.factById(id); if (f) (f.objects || []).forEach(o => carried.add(o)); });

    let list = D.OBJECTS.filter(o => set.has(o.domain));
    if (rel.domain && rel.domain !== 'all') list = list.filter(o => o.domain === rel.domain);
    if (s.q) {
      const q = s.q.toLowerCase();
      list = list.filter(o => (o.name + ' ' + (o.sub || '') + ' ' + (D.domain(o.domain) || {}).n).toLowerCase().includes(q));
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
      const landed = objs.filter(o => o.geo !== false && o.lat != null);
      return {
        rows: [
          ['本体对象', objs.length + ' 个'],
          ['可定位 / 无坐标', landed.length + ' / ' + (objs.length - landed.length)],
          ['关联关系', rels.length + ' 条'],
          ['高置信关系', (rels.length ? Math.round(hi / rels.length * 100) : 0) + '%'],
          ['最近更新', D.TODAY]
        ],
        distTitle: '本体类型分布',
        dist: D.DOMAINS.map(d => ({ n: d.n, e: d.e, v: dist[d.id], c: d.c }))
      };
    }
    const list = factsAtLevel(s), all = facts(s);
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
      note: all.length > list.length ? '当前筛选共 ' + all.length + ' 条，本层视野内 ' + list.length + ' 条' : '',
      distTitle: '事实类型分布',
      dist: Object.keys(D.CATS).map(k => ({ n: D.CATS[k].n, e: D.CATS[k].e, v: dist[k], c: D.CATS[k].c })).filter(x => x.v > 0)
    };
  }

  const counts = (s, arr) => arr.reduce((m, x) => (m[x.cat || x.domain] = (m[x.cat || x.domain] || 0) + 1, m), {});

  /* ---------- 推演种子（推演层沿用，口径不变：种子 id 走自带数据别名） ---------- */
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
    facts, factsAll: facts, factsAtLevel, mappable, levelMixed, objects, relations, overview, counts, seeds, toggleSeed,
    totalFacts: () => D.FACTS.length,
    prov: x => (x && x.prov) || 'generated'
  };
})();
