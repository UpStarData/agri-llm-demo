/* ============================================================
   V1.0 视觉校准版过滤：事实层 / 关联层共用的唯一过滤实现
   · 事实分类字典严格使用 V2 指令 F3（7 一级 / 26 二级 / 125 三级），不合并、不改名、不删减
   · 关联层对象域严格使用 V2 A2 固定九类
   · 空间层级沿用数据包 geo.scopeLayer（L1 全球 / L2 中国 / L3 省区）
   ============================================================ */
window.V03Filter = (function () {
  const D = window.V03Data;
  const PKG = D.PKG || null;
  const D3 = window.V03DictF3 || null;

  /* ---------- 事实层：F3 三级字典（由 src/v03/dict-f3.js 提供，逐条来自指令表格） ---------- */
  const FALLBACK_TREE = [
    { n: '自然与生态', key: 'nature', color: '#0891b2', subs: [{ n: '天气', items: [{ key: 'nature|天气|异常天气', n: '异常天气', e: '🌤️', kw: ['天气'] }] }] },
    { n: '生产与供给', key: 'supply', color: '#16a34a', subs: [{ n: '产能供给', items: [{ key: 'supply|产能供给|产量', n: '产量', e: '📦', kw: ['产量'] }] }] },
    { n: '流通与供应链', key: 'chain', color: '#0d9488', subs: [{ n: '流向', items: [{ key: 'chain|流向|市场到货', n: '市场到货', e: '🚚', kw: ['到货'] }] }] },
    { n: '市场与交易', key: 'market', color: '#dc2626', subs: [{ n: '价格', items: [{ key: 'market|价格|批发价', n: '批发价', e: '🏷️', kw: ['批发价', '价格'] }] }] },
    { n: '消费与舆情', key: 'consume', color: '#7c3aed', subs: [{ n: '媒体舆情', items: [{ key: 'consume|媒体舆情|新闻', n: '新闻', e: '📰', kw: ['新闻'] }] }] },
    { n: '政策与治理', key: 'policy', color: '#1d4ed8', subs: [{ n: '农业政策', items: [{ key: 'policy|农业政策|产业扶持', n: '产业扶持', e: '📜', kw: ['扶持', '补贴'] }] }] },
    { n: '宏观与公共事件', key: 'macro', color: '#b45309', subs: [{ n: '地缘与安全', items: [{ key: 'macro|地缘与安全|公共安全', n: '公共安全', e: '⚠️', kw: ['安全'] }] }] }
  ];
  const FACT_TREE_RAW = (D3 && D3.TREE && D3.TREE.length) ? D3.TREE : FALLBACK_TREE;
  /* L2：一级分类改用低饱和配色（与整体明亮风格一致；地图点/图例/菜单同一套） */
  const MUTED = { nature: '#5b8ea6', supply: '#6f9a6a', chain: '#5f9a94', market: '#b0736b', consume: '#8b7fa8', policy: '#6f86b8', macro: '#a08a63' };
  const FACT_TREE = FACT_TREE_RAW.map(g => Object.assign({}, g, { color: MUTED[g.key] || g.color }));
  const leafOf = f => (D3 && D3.leafOf) ? D3.leafOf(f) : null;

  /* ---------- 关联层：A2 固定九类对象域（不得缩减） ---------- */
  const REL_TREE = [
    { n: '要素与商品', subs: [
      { n: '商品与要素', items: [mk('commodity'), mk('resource')] },
      { n: '环境', items: [mk('environment')] }
    ] },
    { n: '主体与机构', subs: [
      { n: '经营主体', items: [mk('operator')] },
      { n: '政策机构', items: [mk('institution')] }
    ] },
    { n: '空间与流通', subs: [
      { n: '空间', items: [mk('admin')] },
      { n: '市场与物流', items: [mk('channel'), mk('logistics')] },
      { n: '状态', items: [mk('metric')] }
    ] }
  ];
  function mk(key) {
    const d = D.DOMAINS.find(x => x.id === key) || { n: key, e: '📌', c: '#64707f' };
    return { key, n: d.n, e: d.e, c: key };
  }

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

  /* ---------- 事实：三级类型命中（F3）+ 时间 / 可信度 / 影响 / 搜索 ---------- */
  const leafKeyOf = f => {
    const it = leafOf(f);
    return it ? it.key : null;
  };
  function matched(f, set) {
    const key = leafKeyOf(f);
    if (!key) return true;                       /* 未命中任何类型时不因分类而丢失 */
    return set.has(key);
  }
  const RANK = { high: 3, medium: 2, mid: 2, low: 1 };
  const minOf = v => ({ high: 3, mid: 2, low: 1 }[v] || 1);
  const credOk = (f, v) => (RANK[f.cred] || 1) >= minOf(v);
  const inflOk = (f, v) => (RANK[f.impact] || 1) >= minOf(v);
  const hit = (f, q) => {
    if (!q) return true;
    const s = q.toLowerCase();
    return (f.title + f.summary + f.region).toLowerCase().includes(s);
  };

  function facts(s) {
    s = s || window.V03Store.state;
    const set = selected(s, 'catKeys', FACT_ITEMS);
    return D.FACTS.filter(f =>
      D.inWindow(f.date, s.time) &&
      matched(f, set) &&
      credOk(f, s.cred) &&
      inflOk(f, s.infl) &&
      hit(f, s.q)
    );
  }

  /* ---------- 空间层级（geo.scopeLayer 为准） ---------- */
  const shortProv = n => String(n || '').replace(/壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市$/g, '') || n;
  const DEFAULT_FOCUS = '湖南';

  /* M6 空间漏斗：全球=全部事实；中国=落入中国范围的事实；省区=聚焦省区的事实。
     层越深，视野内密度越高（全球各大洲都有点，缩到中国/湖南后局部更密）。 */
  const inChina = f => f.lng >= 73 && f.lng <= 136 && f.lat >= 17.5 && f.lat <= 54.5;
  const inProvince = (f, focus) => {
    const prov = (PKG && PKG.PROV_BY_SHORT ? PKG.PROV_BY_SHORT[focus] : null) || {};
    const c = (D.PROV_CENTER || {})[focus];
    if (prov.code && f.provinceCode === prov.code) return true;
    if (shortProv(f.province) === focus) return true;
    return !!(c && Math.abs(f.lng - c[0]) <= 2.8 && Math.abs(f.lat - c[1]) <= 2.4);
  };
  function factsAtLevel(s) {
    s = s || window.V03Store.state;
    const all = facts(s);
    const lv = s.geo.level;
    const focus = shortProv(s.geo.focus || DEFAULT_FOCUS);
    let list = lv === 'L1' ? all.slice()
      : lv === 'L2' ? all.filter(f => f.lng != null && inChina(f))
        : all.filter(f => f.lng != null && inProvince(f, focus));
    (s.carry || []).forEach(id => {
      const f = D.factById(id);
      if (f && !list.includes(f) && all.some(x => x.id === id)) list = list.concat(f);
    });
    if (!list.length) list = all;
    return list;
  }
  const mappable = list => list.filter(f => f.lng != null && f.lat != null);

  function levelMixed(s) {
    s = s || window.V03Store.state;
    const all = facts(s);
    if (!all.length || s.geo.level === 'L1') return false;
    return factsAtLevel(s).length === all.length;
  }

  /* ---------- 关联层对象 / 关系 ---------- */
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
      list = list.filter(o => (o.name + ' ' + (o.sub || '')).toLowerCase().includes(q));
    }
    if (rel.focusFact) {
      const f = D.factById(rel.focusFact);
      const focus = new Set(f ? f.objects : []);
      list = list.sort((a, b) => (focus.has(b.id) ? 1 : 0) - (focus.has(a.id) ? 1 : 0));
    }
    return list.map(o => Object.assign({}, o, { _carried: carried.has(o.id) }));
  }

  const MIN_CONF = { high: .75, mid: .6, low: 0, all: 0 };
  function relations(s) {
    s = s || window.V03Store.state;
    const ids = new Set(objects(s).map(o => o.id));
    const need = MIN_CONF[s.cred] != null ? MIN_CONF[s.cred] : 0;
    return D.RELATIONS.filter(r => ids.has(r.from) && ids.has(r.to) && r.confidence >= need)
      .map(r => Object.assign({}, r, { _carried: (r.factIds || []).some(f => (s.carry || []).includes(f)) }));
  }

  /* ---------- 数据概览（F2 固定四项：本层事实数 / 高可信占比 / 关联本体数 / 最近更新时间） ---------- */
  /* L1：数据概览 —— 事实条数（该视角数据库体量）+ 整体可信占比；由 app.js 做滚动 +1 动画 */
  function overview(s) {
    s = s || window.V03Store.state;
    if (s.tab === 'relation') {
      const objs = objects(s), rels = relations(s);
      const landed = objs.filter(o => o.geo !== false && o.lat != null);
      const hi = rels.filter(r => r.confidence >= .75).length;
      return {
        rows: [
          ['本体对象', objs.length],
          ['可信关系', (rels.length ? Math.round(hi / rels.length * 100) : 0) + '%']
        ],
        note: landed.length + ' 个可定位'
      };
    }
    const list = factsAtLevel(s);
    const hi = list.filter(f => f.cred === 'high').length;
    const M = window.V03Mass;
    const leaves = selected(s, 'catKeys', FACT_ITEMS).size || FACT_ITEMS.length;
    const t = M ? M.totals(s.geo.level, FACT_ITEMS.length, leaves) : null;
    return {
      rows: [
        ['事实条数', t ? M.fmt(t.total) : list.length, t ? t.total : list.length],
        ['整体可信占比', (list.length ? Math.round(hi / list.length * 100) : 62) + '%', null]
      ],
      note: t ? '每个三级类型 ' + M.fmt(t.per) + ' 条 · 本视野采样 ' + t.sampled + ' 点' : '',
      real: list.length
    };
  }

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
    return uniq(defaultSeeds(sim).filter(id => !off.includes(id)).concat(s.carry || []).concat(sim.seedIds || []));
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
    FACT_TREE, REL_TREE, FACT_ITEMS, REL_ITEMS, itemBy, selected, toggleLeaf, factLeafOn,
    facts, factsAll: facts, factsAtLevel, mappable, levelMixed, objects, relations, overview, seeds, toggleSeed,
    leafKeyOf, leafOf, dictReady: !!(D3 && D3.TREE),
    totalFacts: () => D.FACTS.length,
    prov: x => (x && x.prov) || 'generated'
  };
})();
