/* ============================================================
   事实质量级模型（v07）：按产品定义的数据体量 + 采样展示
   定义（产品口径）：图层分类字典里**每个三级事实类型**的事实条数下限
     · 全球视角（L1）：100 万条 / 类型
     · 中国视角（L2）：10 万条 / 类型
     · 省区视角（L3）：1 万条 / 类型
   浏览器不可能逐条渲染上亿条记录，因此这里把「数据库体量」与「渲染采样」分开：
     · totals()  给出该视角下的真实体量（按类型数 × 配额，含可信/影响分布），供左侧数据概览展示
     · sample()  用**确定性分布**（固定种子 + 真实锚点）生成采样点，视觉上表达密度
   采样点 = 数据体量的代表，不是逐条事实；真实可交互的 934 条事实单独渲染在最上层（可点开详情）。
   ============================================================ */
window.V03Mass = (function () {
  const data = () => window.V03Data || {};   /* 延迟取用：mass.js 在 data.js 之前加载 */
  /* 每个三级类型的事实条数下限（产品定义） */
  const QUOTA = { L1: 1000000, L2: 100000, L3: 10000 };
  /* 单视野渲染采样上限（性能） */
  const SAMPLE = { L1: 3800, L2: 3400, L3: 2800 };   /* 点还不够密：采样数上调 */
  const SEED = 20260922;

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ---------- 真实锚点：产区 / 口岸 / 省区中心（采样点围绕它们分布） ---------- */
  let ANCHORS = null;
  function anchors() {
    if (ANCHORS) return ANCHORS;
    const out = [];
    (data().REGIONS || []).forEach(r => out.push({ lng: r.lng, lat: r.lat, w: 3, src: 'region' }));
    (data().GATES || []).forEach(g => out.push({ lng: g.lng, lat: g.lat, w: g.kind === 'port' ? 2 : 1, src: 'gate' }));
    (data().OBJECTS || []).forEach(o => { if (o.geo !== false && o.lat != null) out.push({ lng: o.lng, lat: o.lat, w: 1, src: 'entity' }); });
    Object.keys(data().PROV_CENTER || {}).forEach(k => { const c = data().PROV_CENTER[k]; out.push({ lng: c[0], lat: c[1], w: 2, src: 'province' }); });
    ANCHORS = out.length ? out : [{ lng: 0, lat: 20, w: 1, src: 'fallback' }];
    return ANCHORS;
  }

  const CHINA = { lng: [73, 136], lat: [17.5, 54.5] };
  const inChina = (lng, lat) => lng >= CHINA.lng[0] && lng <= CHINA.lng[1] && lat >= CHINA.lat[0] && lat <= CHINA.lat[1];

  /* ---------- 体量：按视角与分类字典的类型数计算 ---------- */
  function totals(level, leafCount, shownLeafCount) {
    const per = QUOTA[level] || QUOTA.L3;
    const n = Math.max(1, shownLeafCount || leafCount || 1);
    const total = per * n;
    return {
      per, leaves: n, total,
      sampled: Math.min(SAMPLE[level] || 2000, total),
      trusty: Math.round(total * 0.62),      /* 高可信占比（口径：官方/台账优先） */
      todayAdded: Math.round(total * 0.0031) /* 当日新增（约千分之三） */
    };
  }

  /* ---------- 采样：确定性、围绕真实锚点分布 ---------- */
  function sample(level, focus, leafKeys) {
    const rnd = mulberry32(SEED + (level === 'L1' ? 1 : level === 'L2' ? 2 : 3));
    const list = anchors();
    const keys = (leafKeys && leafKeys.length) ? leafKeys : ['x'];
    const want = SAMPLE[level] || 2000;
    const spread = level === 'L1' ? 4.2 : level === 'L2' ? 2.4 : 0.45;
    const out = [];
    const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
    for (let i = 0; i < want; i++) {
      const a = list[Math.floor(rnd() * list.length)];
      let lng = a.lng + gauss() * spread, lat = a.lat + gauss() * spread * .7;
      if (lng > 180) lng -= 360; if (lng < -180) lng += 360;
      if (lat > 74) lat = 74; if (lat < -58) lat = -58;
      if (level === 'L2' && !inChina(lng, lat)) { i--; continue; }
      if (level === 'L3' && focus) {
        const c = (data().PROV_CENTER || {})[focus];
        if (c && (Math.abs(lng - c[0]) > 3.4 || Math.abs(lat - c[1]) > 2.8)) { i--; continue; }
      }
      out.push({ lng: Math.round(lng * 100) / 100, lat: Math.round(lat * 100) / 100, leaf: keys[i % keys.length] });
    }
    return out;
  }

  /* ---------- 数字格式：按量级用 万 / 亿 ---------- */
  function fmt(n) {
    if (n >= 1e8) return (n / 1e8).toFixed(2) + ' 亿';
    if (n >= 1e4) return (n / 1e4).toFixed(n >= 1e6 ? 0 : 1) + ' 万';
    return n.toLocaleString();
  }
  function fmtUnit(n) {
    if (n >= 1e8) return { v: (n / 1e8).toFixed(2), u: '亿' };
    if (n >= 1e4) return { v: (n / 1e4).toFixed(1), u: '万' };
    return { v: String(n), u: '' };
  }

  return { QUOTA, SAMPLE, totals, sample, fmt, fmtUnit, SEED };
})();
