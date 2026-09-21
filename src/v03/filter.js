/* ============================================================
   V0.3 过滤：事实层 / 关联层共用的唯一过滤实现
   过滤条件全部来自 V03Store.state（时间 / 分类 / 二级 / 来源 / 可信度 / 影响 / 搜索）
   ============================================================ */
window.V03Filter = (function () {
  const D = window.V03Data;

  /* 三级事实分类：一级 = cat；二级 = 关键词；三级 = 来源与口径 */
  const SUB = {
    policy:    ['补贴', '目录', '通关', '备案'],
    price:     ['批发价', '收购价', '价差'],
    weather:   ['高温', '台风'],
    logistics: ['运价', '港口', '专线'],
    trade:     ['到货量', '发运', '产量']
  };
  const SRC = {
    official: { n: '官方公告 / 统计', test: f => f.cred === 'high' && f.evidence.some(e => /政策|通告|公告|统计|通报|目录/.test(e.k)) },
    ledger:   { n: '市场 / 企业台账', test: f => f.evidence.some(e => /台账|结算|市场|说明|协会|周报/.test(e.k)) },
    platform: { n: '平台公开数据',   test: f => f.evidence.some(e => /平台|直播|公开/.test(e.k)) }
  };

  const hit = (f, q) => !q || (f.title + f.summary + f.region + f.short).toLowerCase().includes(q.toLowerCase());

  function facts(s) {
    s = s || window.V03Store.state;
    return D.FACTS.filter(f =>
      D.inWindow(f.date, s.time) &&
      (s.cat === 'all' || f.cat === s.cat) &&
      (!s.sub || (f.title + f.summary).includes(s.sub)) &&
      (s.src === 'all' || (SRC[s.src] ? SRC[s.src].test(f) : true)) &&
      (s.cred === 'all' || f.cred === s.cred) &&
      (s.infl === 'all' || f.impact === s.infl) &&
      hit(f, s.q)
    );
  }

  /* 事实层地图：按当前空间层级取该层事实（L1 全球事实 / L2 全国事实 / L3 省区事实） */
  const levelOf = lv => ({ L1: 'global', L2: 'china', L3: 'province' }[lv] || 'china');

  function factsAtLevel(s) {
    s = s || window.V03Store.state;
    const want = levelOf(s.geo.level);
    let list = facts(s).filter(f => f.level === want);
    /* 携带进来的事实始终可见，避免“带了上下文却看不到” */
    (s.carry || []).forEach(id => {
      const f = D.factById(id);
      if (f && !list.includes(f) && (s.geo.level !== 'L3' || f.level === 'province')) list = list.concat(f);
    });
    /* 本层被筛空时，退回到“全部层级里符合筛选的事实”，并在界面上明说 */
    if (!list.length) list = facts(s);
    return list;
  }
  /* 本次返回的列表是否跨了层级（用于界面提示） */
  function levelMixed(s) {
    s = s || window.V03Store.state;
    const want = levelOf(s.geo.level);
    const list = facts(s);
    return list.length > 0 && list.every(f => f.level !== want);
  }

  function objects(s) {
    s = s || window.V03Store.state;
    const rel = s.rel || {};
    const carried = new Set();
    (s.carry || []).forEach(id => {
      const f = D.factById(id);
      if (f) f.objects.forEach(o => carried.add(o));
    });
    let ids = D.OBJECTS.filter(o => rel.domain === 'all' || o.domain === rel.domain);
    if (s.q) { const q = s.q.toLowerCase(); ids = ids.filter(o => (o.name + o.sub + o.domain).toLowerCase().includes(q)); }
    if (s.time !== 'all') {
      const keep = new Set();
      Object.keys(keep);
      ids.forEach(o => {
        const fs = D.factsOfObject(o.id).filter(f => D.inWindow(f.date, s.time));
        if (fs.length || o.domain === 'variety' || o.domain === 'metric') keep.add(o.id);
      });
      ids = ids.filter(o => keep.has(o.id));
    }
    if (rel.focusFact) {   // 从事实详情进来：先看与该事实相关的对象
      const f = D.factById(rel.focusFact);
      const focus = new Set(f ? f.objects : []);
      ids = ids.sort((a, b) => (focus.has(b.id) ? 1 : 0) - (focus.has(a.id) ? 1 : 0));
    }
    return ids.map(o => Object.assign({}, o, { _carried: carried.has(o.id) }));
  }

  function relations(s) {
    s = s || window.V03Store.state;
    const ids = new Set(objects(s).map(o => o.id));
    return D.RELATIONS.filter(r => ids.has(r.from) && ids.has(r.to))
      .filter(r => s.time === 'all' || D.factsOfRelation(r.id).some(f => D.inWindow(f.date, s.time)) || D.factById(r.changedBy))
      .map(r => Object.assign({}, r, { _carried: r.factIds.some(f => (s.carry || []).includes(f)) }));
  }

  const counts = (s, arr) => arr.reduce((m, x) => (m[x.cat || x.domain] = (m[x.cat || x.domain] || 0) + 1, m), {});

  /* 推演种子：场景默认种子（可被取消）+ 携带事实 + 手动加入的种子，三处唯一口径 */
  const uniq = a => a.filter((x, i) => a.indexOf(x) === i);
  /* 默认种子：统一用户故事的 6 条基线事实（或旧结构的场景种子） */
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
  /* 种子勾选：默认种子被取消时记入 seedOff，手动种子记入 seedIds */
  function toggleSeed(s, id, on) {
    const sim = s.sim || {};
    const isDefault = defaultSeeds(sim).includes(id);
    let ids = (sim.seedIds || []).filter(x => x !== id), off = (sim.seedOff || []).filter(x => x !== id);
    if (on) { ids = uniq(ids.concat([id])); }
    else if (isDefault) off = uniq(off.concat([id]));
    return { seedIds: ids, seedOff: off };
  }

  return { SUB, SRC, facts, factsAtLevel, levelMixed, objects, relations, counts, seeds, toggleSeed, totalFacts: () => D.FACTS.length };
})();
