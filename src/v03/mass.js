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
  /* 单视野渲染采样上限：重复真实锚点来表达体量，但每个点仍是地图经纬度 */
  const SAMPLE = { L1: 20000, L2: 16000, L3: 12000 };
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

  /* 点必须真正落在地图面内。旧版只判断矩形并给锚点做大范围抖动，沿海点会漂到海上，
     看起来像脱离地图的屏幕贴层。这里对世界/中国 GeoJSON 做 point-in-polygon 校验。 */
  function inRing(lng, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (((yi > lat) !== (yj > lat)) && lng < (xj - xi) * (lat - yi) / ((yj - yi) || 1e-12) + xi) inside = !inside;
    }
    return inside;
  }
  function inPolygon(lng, lat, poly) {
    if (!poly || !poly.length || !inRing(lng, lat, poly[0])) return false;
    for (let i = 1; i < poly.length; i++) if (inRing(lng, lat, poly[i])) return false;
    return true;
  }
  function geometryContains(g, lng, lat) {
    if (!g) return false;
    if (g.type === 'Polygon') return inPolygon(lng, lat, g.coordinates);
    if (g.type === 'MultiPolygon') return g.coordinates.some(p => inPolygon(lng, lat, p));
    return false;
  }
  function worldFeatures() {
    return (window.__WORLD110 || []).map(o => {
      let x = o.c, depth = 0; while (Array.isArray(x) && x.length) { depth++; x = x[0]; }
      return { geometry: depth >= 4 ? { type: 'MultiPolygon', coordinates: o.c } : { type: 'Polygon', coordinates: depth === 3 ? o.c : [o.c] } };
    });
  }
  let MAP_FEATURES = null;
  function mapFeatures(level) {
    if (!MAP_FEATURES) MAP_FEATURES = { L1: worldFeatures(), china: ((window.__CHINA_GEO || {}).features || []) };
    return level === 'L1' ? MAP_FEATURES.L1 : MAP_FEATURES.china;
  }
  function insideMap(level, lng, lat) {
    if (level !== 'L1' && !inChina(lng, lat)) return false;
    return mapFeatures(level).some(f => geometryContains(f.geometry, lng, lat));
  }

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
    const list = anchors().filter(a => insideMap(level, a.lng, a.lat));
    const keys = (leafKeys && leafKeys.length) ? leafKeys : ['x'];
    const want = SAMPLE[level] || 2000;
    /* 小范围抖动：数据可以重复，位置不能离开真实锚点或地图面。 */
    const spread = level === 'L1' ? 2.4 : level === 'L2' ? 1.0 : .30;
    const out = [];
    const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
    let tries = 0;
    while (out.length < want && tries++ < want * 30) {
      const i = out.length;
      const a = list[Math.floor(rnd() * list.length)];
      if (!a) break;
      let lng = a.lng + gauss() * spread, lat = a.lat + gauss() * spread * .7;
      if (lng > 180) lng -= 360; if (lng < -180) lng += 360;
      if (lat > 74) lat = 74; if (lat < -58) lat = -58;
      if (!insideMap(level, lng, lat)) continue;
      if (level === 'L3' && focus) {
        const c = (data().PROV_CENTER || {})[focus];
        if (c && (Math.abs(lng - c[0]) > 3.4 || Math.abs(lat - c[1]) > 2.8)) continue;
      }
      const fixedLng = Math.round(lng * 10000) / 10000, fixedLat = Math.round(lat * 10000) / 10000;
      if (!insideMap(level, fixedLng, fixedLat)) continue;
      out.push({ lng: fixedLng, lat: fixedLat, leaf: keys[i % keys.length] });
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

  return { QUOTA, SAMPLE, totals, sample, insideMap, fmt, fmtUnit, SEED };
})();
