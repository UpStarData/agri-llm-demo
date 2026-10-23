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
  /* 一级分类色统一由主题变量提供（V2.8.4）：菜单图例、地图点填充、地球、详情同一份色值 */
  const T = window.V03Theme;
  const FACT_TREE = FACT_TREE_RAW.map(g => Object.assign({}, g, { color: T.fact(g.key) }));
  const leafOf = f => (D3 && D3.leafOf) ? D3.leafOf(f) : null;

  /* PRD 关联层 V1.3：四个一级类、十七个二级类。旧数据保留原始类型，只做可核对的映射。 */
  const REL_TREE = [
    { n:'地理与设施', color: window.V03Theme.obj('地理与设施'), subs:[{n:'类型',items:['产区与基地','市场','港口','机场','仓储与物流','地缘风险区','行政区划'].map(mkRel)}] },
    { n:'主体与组织', color: window.V03Theme.obj('主体与组织'), subs:[{n:'类型',items:['企业与贸易主体','政府与机构','政策与法规'].map(mkRel)}] },
    { n:'农作物', color: window.V03Theme.obj('农作物'), subs:[{n:'类型',items:['水果','蔬菜','粮油与油料','经济作物'].map(mkRel)}] },
    { n:'事件', color: window.V03Theme.obj('事件'), subs:[{n:'类型',items:['自然与生态','政策与贸易','地缘与安全','公共事件'].map(mkRel)}] }
  ];
  /* 本体一级分类：relKind(o) 给二级名，这里回到它所属的一级类（PRD 四类） */
  const REL_CLASS_OF_KIND = (() => {
    const out = {};
    REL_TREE.forEach(g => g.subs.forEach(sb => sb.items.forEach(it => { out[it.key] = g.n; })));
    return out;
  })();
  const relClass = o => REL_CLASS_OF_KIND[relKind(o)] || (o && o.domain === 'commodity' ? '农作物' : '事件');
  function mkRel(name){const emoji={'产区与基地':'🌾','市场':'🏪','港口':'⚓','机场':'✈️','地缘风险区':'⚠️','行政区划':'🗺️','企业与贸易主体':'🏢','政府与机构':'🏛️','政策与法规':'📜','水果':'🍉','蔬菜':'🥬','粮油与油料':'🌽','经济作物':'🍃','自然与生态':'🌦️','政策与贸易':'📋','地缘与安全':'🛡️','公共事件':'📡'};return {key:name,n:name,e:emoji[name]||'◇'};}
  function relKind(o){
    if(o.domain==='resource')return '产区与基地';
    if(o.domain==='channel')return '市场';
    if(o.domain==='admin')return '行政区划';
    if(o.domain==='logistics')return /仓储|warehouse|grain_storage/i.test(o.sub+' '+o.name)?'仓储与物流':/air|airport|机场/i.test(o.id+' '+o.name)?'机场':'港口';
    if(o.domain==='operator')return '企业与贸易主体';
    if(o.domain==='institution')return '政府与机构';
    if(o.domain==='environment')return '自然与生态';
    if(o.domain==='commodity'){
      const text=(o.name+' '+(o.sub||'')).toLowerCase();
      if(/辣椒|蒜|姜|蔬菜|pepper|chili/.test(text))return '蔬菜';
      if(/稻|米|麦|豆|玉米|花生|粮|油/.test(text))return '粮油与油料';
      if(/棉|橡胶|咖啡/.test(text))return '经济作物';
      return '水果';
    }
    return null; // 价格、库存、天气指标不是本体，不伪装成 PRD 分类
  }
  const PRD_REL_TYPES=['生产','供应','采购','运营','入驻','合作','位于','运输至','储存于','发布','适用于','监管','影响','发生于'];
  const legacyTypes=()=>[...new Set(D.RELATIONS.map(r=>r.type))].filter(t=>!PRD_REL_TYPES.includes(t));
  const RELATION_COLORS={
    '生产':'#4a9a68','贸易':'#4a9a68','采购':'#4a9a68',
    '供应':'#d68a3c','供应流向':'#d68a3c','运营':'#d68a3c','入驻':'#d68a3c','合作':'#d68a3c',
    '流入':'#1fa9a2','流出':'#1fa9a2','运输至':'#1fa9a2','储存于':'#1fa9a2',
    '运输经由':'#3f8fbf','位于':'#5a80b8','发生于':'#5a80b8','行政归属':'#5a80b8',
    '发布':'#8a6dba','适用于':'#8a6dba','监管':'#8a6dba','覆盖':'#8a6dba','依赖':'#8a6dba','替代':'#8a6dba',
    '影响':'#cf5f6a','价格传导':'#cf5f6a'
  };
  /* 关系线按「一级本体分类」着色：每种关系类型的一级类由该类型自身的两端本体统计得出
     （取多数；平票时取起点侧），因此地图、地球、图谱、菜单图例必然同色（V2.8.4 要求 4）。 */
  let typeClassCache = null;
  function relationTypeClass(type) {
    if (!typeClassCache) {
      const tally = new Map();
      const cls = id => { const o = D.objById(id); return o ? relClass(o) : null; };
      D.RELATIONS.forEach(r => {
        const a = cls(r.from), b = cls(r.to);
        if (!tally.has(r.type)) tally.set(r.type, { from: new Map(), any: new Map() });
        const t = tally.get(r.type);
        if (a) t.from.set(a, (t.from.get(a) || 0) + 1);
        [a, b].filter(Boolean).forEach(c => t.any.set(c, (t.any.get(c) || 0) + 1));
      });
      typeClassCache = new Map();
      tally.forEach((t, type) => {
        const rank = m => [...m.entries()].sort((x, y) => y[1] - x[1] || String(x[0]).localeCompare(String(y[0]), 'zh-CN'))[0];
        const top = rank(t.any) || rank(t.from);
        typeClassCache.set(type, top ? top[0] : '事件');
      });
    }
    return typeClassCache.get(type) || '事件';
  }
  const relationTypeColor = type => window.V03Theme.obj(relationTypeClass(type));
  const relationTypes = () => [...new Set(D.RELATIONS.map(r=>r.type))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
  function relationTypeOptions(s) {
    const counts=new Map();relations({...s,relTypes:null}).forEach(r=>counts.set(r.type,(counts.get(r.type)||0)+1));
    return relationTypes().filter(type=>counts.has(type)).map(type=>({type,count:counts.get(type),color:relationTypeColor(type)}));
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
    return String(f.title || '').toLowerCase().includes(s);
  };

  const VARIETY_WORDS = { '榴莲': ['榴莲', 'durian'], '车厘子': ['车厘子', '樱桃', 'cherry'], '辣椒': ['辣椒', 'chili', 'pepper'] };
  const varietyOk = (f, selected) => !selected || !selected.length || selected.some(v => {
    const body = [f.title, f.summary, f.card && f.card.commodityName, ...(f.objects || []).map(id => (D.objById(id) || {}).name)].join(' ').toLowerCase();
    return (VARIETY_WORDS[v] || [v]).some(w => body.includes(w.toLowerCase()));
  });
  const regionOk = (f, region) => !region || [f.region, f.province, f.city, ...(f.regionPath || []).map(x => x.name)].some(x => String(x || '').includes(region)) ||
    (region === '湖南' && f.lng >= 108 && f.lng <= 115 && f.lat >= 24 && f.lat <= 31);

  let factCacheKey='',factCache=[];
  function facts(s) {
    s = s || window.V03Store.state;
    const key=JSON.stringify([D.revision,window.V03Feed?.revision,s.time,s.catKeys,s.varieties,s.region,s.sourceMode,s.q,s.dayCursor||null]);
    if(key===factCacheKey)return factCache;
    const set = selected(s, 'catKeys', FACT_ITEMS);
    factCacheKey=key;
    return factCache = D.FACTS.filter(f =>
      /* 时间筛选对所有事实生效：此前档案类事实（占 94%）被豁免，导致切换时间几乎不变化、
         点不会消失（用户 2026-10-17 反馈第 1 条）。档案仍保留原始发布日期，只是按窗口过滤。 */
      D.inWindow(f.date, s.time) &&
      /* V2.9.3：时间轴播放/拖动时，只显示「这一天及以前」的事实 */
      (!s.dayCursor || String(f.date || '').slice(0, 10) <= s.dayCursor) &&
      (!window.V03Feed || V03Feed.isFactVisible(f.id)) &&
      (set.size===FACT_ITEMS.length || matched(f, set)) &&
      varietyOk(f, s.varieties) &&
      regionOk(f, s.region) &&
      (s.sourceMode !== 'real' || f.prov === 'real') &&
      hit(f, s.q)
    ).sort((a, b) => String(b.ingestedAt || b.date || '').localeCompare(String(a.ingestedAt || a.date || '')) || String(b.id).localeCompare(String(a.id)));
  }

  /* ---------- 空间层级（geo.scopeLayer 为准） ---------- */
  const shortProv = n => String(n || '').replace(/壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市$/g, '') || n;
  const DEFAULT_FOCUS = '湖南';

  /* Geographic membership is shared by map, cards and overview. */
  let scopeBase=null,scopeKey='',scopeFacts=[],mapBase=null,mapRecords=[];
  function factsAtLevel(s) {
    s = s || window.V03Store.state;
    const base=facts(s),key=JSON.stringify([s.geo.level,s.geo.focus,s.geo.city,s.geo.county]);
    if(base!==scopeBase||key!==scopeKey){
      scopeBase=base;scopeKey=key;
      scopeFacts=base.filter(f => f.level !== 'hidden' && V03Scope.includes(f,s.geo));
    }
    return scopeFacts;
  }

  /* 需求 4.2.3：右侧卡片区要承载「没有坐标、无法在地图上显示」的事实。
     这类事实按 geo.scopeLayer 声明的层级归属视野（L1 全局事实在任何视野的卡片区都出现）；
     有坐标的仍按地理范围收窄。地图侧不受影响：无坐标本来就不画点。 */
  const LEVEL_RANK = { L1: 1, L2: 2, L3: 3 };
  let cardBase = null, cardKey = '', cardFacts = [];
  function factsForCards(s) {
    s = s || window.V03Store.state;
    const base = facts(s), key = JSON.stringify([s.geo.level, s.geo.focus, s.geo.city, s.geo.county]);
    if (base !== cardBase || key !== cardKey) {
      cardBase = base; cardKey = key;
      const want = LEVEL_RANK[s.geo.level || 'L1'] || 1;
      cardFacts = base.filter(f => {
        if (Number.isFinite(f.lng) && Number.isFinite(f.lat)) return f.level !== 'hidden' && V03Scope.includes(f, s.geo);
        return (LEVEL_RANK[f.level] || 3) <= want;
      });
    }
    return cardFacts;
  }

  // Map eligibility is separate from archive/card eligibility: hidden feeds remain searchable.
  function mapEligible(f) {
    const key=leafKeyOf(f)||'';
    return f.cardType!=='weather' && !key.startsWith('nature|天气|') &&
      f.provenanceMeta?.dataOrigin!=='public-facility-catalogue' &&
      !/^v24-catalog:/.test(f.id) && !/进货目录|到货目录|目录记录|到货台账|(?:到货|进货).*(?:吨|公斤|kg)/i.test(f.title||'');
  }
  const mapFacts = s => {
    const base=factsAtLevel(s);
    if(base!==mapBase){mapBase=base;mapRecords=base.filter(mapEligible);}
    return mapRecords;
  };
  const mappable = list => list.filter(f => f.lng != null && f.lat != null);

  function levelMixed(s) {
    s = s || window.V03Store.state;
    const all = facts(s);
    if (!all.length || s.geo.level === 'L1') return false;
    return factsAtLevel(s).length === all.length;
  }

  /* ---------- 关联层对象 / 关系 ---------- */
  let objectCacheKey='',objectCache=[];
  function objects(s) {
    s = s || window.V03Store.state;
    const rel = s.rel || {};
    const cacheKey=JSON.stringify([D.revision,window.V03Feed?.revision,s.relKeys,s.varieties,s.carry,rel.domain,rel.search,rel.focusFact,rel.level,rel.focus,rel.city,rel.county,rel.crossRegion]);
    if(cacheKey===objectCacheKey)return objectCache;
    const set = selected(s, 'relKeys', REL_ITEMS);
    const carried = new Set();
    (s.carry || []).forEach(id => { const f = D.factById(id); if (f) (f.objects || []).forEach(o => carried.add(o)); });

    let list = D.OBJECTS.filter(o => isBusinessObject(o) && set.has(relKind(o)) && (!window.V03Feed || V03Feed.isObjectVisible(o.id)));
    if (rel.domain && rel.domain !== 'all') list = list.filter(o => o.domain === rel.domain);
    if (rel.search) {
      const q = rel.search.toLowerCase();
      list = list.filter(o => (o.name + ' ' + (o.sub || '')).toLowerCase().includes(q));
    }
    if (s.varieties && s.varieties.length) {
      const supported = new Set(D.RELATIONS.filter(r => (r.factIds||[]).some(id => {
        const f = D.factById(id);return f && varietyOk(f,s.varieties);
      })).flatMap(r => [r.from,r.to]));
      list=list.filter(o => supported.has(o.id) || (o.domain==='commodity' && s.varieties.some(v => o.name.includes(v))));
    }
    if ((rel.level||'L1') !== 'L1') {
      const scope={level:rel.level,focus:rel.focus,city:rel.city,county:rel.county};
      const local=new Set(list.filter(o=>V03Scope.includes(o,scope)).map(o=>o.id));
      const neighbors=new Set(D.RELATIONS.filter(r=>local.has(r.from)||local.has(r.to)).flatMap(r=>[r.from,r.to]));
      list=list.filter(o=>local.has(o.id)||neighbors.has(o.id)&&(!o.geo||rel.crossRegion&&
        (o.lng<73||o.lng>136||o.lat<17.5||o.lat>54.5))||!o.geo&&(o.factIds||[]).some(id=>{const f=D.factById(id);return f&&V03Scope.includes(f,scope);}));
    }
    if (rel.focusFact) {
      const f = D.factById(rel.focusFact);
      const focus = new Set(f ? f.objects : []);
      list = list.sort((a, b) => (focus.has(b.id) ? 1 : 0) - (focus.has(a.id) ? 1 : 0));
    }
    objectCacheKey=cacheKey;
    return objectCache=list.map(o => Object.assign({}, o, { _carried: carried.has(o.id) }));
  }

  const MIN_CONF = { high: .75, mid: .6, low: 0, all: 0 };
  // Measurements belong to fact details. They are not separate business ontologies.
  function isBusinessObject(o) {
    return !!o && !['WeatherArea','WeatherObservation','MetricObservation'].includes(o.entityType) &&
      !o.id.startsWith('e:observation:') && !/气象记录|气象参考点/.test(o.typeName || '');
  }
  function relations(s) {
    s = s || window.V03Store.state;
    const ids = new Set(objects(s).map(o => o.id));
    const need = MIN_CONF[s.cred] != null ? MIN_CONF[s.cred] : 0;
    const relTypes=s.relTypes;
    return D.RELATIONS.filter(r => ids.has(r.from) && ids.has(r.to) && r.confidence >= need && (!Array.isArray(relTypes)||relTypes.includes(r.type)))
      .map(r => Object.assign({}, r, { _carried: (r.factIds || []).some(f => (s.carry || []).includes(f)) }));
  }

  /* ---------- 数据概览（F2 固定四项：本层事实数 / 高可信占比 / 关联本体数 / 最近更新时间） ---------- */
  /* L1：数据概览 —— 事实条数（该视角数据库体量）+ 整体可信占比；由 app.js 做滚动 +1 动画 */
  function overview(s) {
    s = s || window.V03Store.state;
    if (s.tab === 'relation') {
      const ids=new Set(objects(s).map(o=>o.id));
      return { rows:[['当前本体',ids.size],['当前关系',relations(s).length]],note:'' };
    }
    const list = factsAtLevel(s);
    const raw = list.length;
    const today = list.filter(f => D.inWindow(f.ingestedAt || f.date, 'today')).length;
    return {
      rows: [
        ['当前事实', String(raw), raw],
        ['今日新增', String(today), today]
      ],
      note: '',
      real: list.length,
      raw,
      rate: 0
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
    FACT_TREE, REL_TREE, FACT_ITEMS, REL_ITEMS, relKind, relClass, relationTypeClass, PRD_REL_TYPES, legacyTypes, relationTypes, relationTypeOptions, relationTypeColor, itemBy, selected, toggleLeaf, factLeafOn,
    facts, factsAll: facts, factsAtLevel, factsForCards, mapFacts, mapEligible, mappable, levelMixed, objects, isBusinessObject, relations, overview, seeds, toggleSeed,
    leafKeyOf, leafOf, dictReady: !!(D3 && D3.TREE),
    totalFacts: () => D.FACTS.length,
    prov: x => (x && x.prov) || 'generated'
  };
})();
