/* ============================================================
   数据包适配层 · agrilink-demo-v1（LLM-292）→ 页面内部模型
   严格按数据包 SCHEMA.md §2 定向接入，不改动视觉与交互：
     · Fact：factId/title/summary/category/cardType/card/geo.scopeLayer/geoPoint/
             credibility.band/severity/entityIds/provenanceMeta(dataMode)
     · Entity：entityId/type/canonicalName/geo.geoPoint/attributes/provenanceMeta
     · Relation：relationId/relationType/sourceEntityId/targetEntityId/nature/supportingFactIds
     · geo/*.geojson：regions(64) / ports(56) / airports(49) / nodes(4)
     · stream.sequence.json：1135 条时序事件（底部流水 B3 + 地图新星 M15）
   内部保留 provenanceMeta / dataMode，普通界面不展示样例文案。
   ============================================================ */
window.V03Pkg = (function () {
  const P = window.__AGRI_PKG__ || {};
  const ONT = P.ontology || { types: [], displayDomains: [], taxonomy: {}, lookup: {} };
  const FACTS_IN = P.facts || [], ENTITIES_IN = P.entities || [], RELATIONS_IN = P.relations || [];
  const EVIDENCE_IN = P.evidence || [], SOURCES_IN = P.sources || [], OBS_IN = P.observations || [];
  const STREAM_IN = P.stream || { events: [], loopMs: 1 };

  /* ---------- 类型 / 分类 字典（事实层冷色色系，与关联层暖色系区分） ---------- */
  const TYPE2DOMAIN = {
    Market: 'market', Enterprise: 'company', Base: 'base', Commodity: 'variety', Organization: 'agency',
    Region: 'region', Person: 'person', MetricObservation: 'metric', LogisticsNode: 'facility'
  };
  const TYPE_EMOJI = {
    Market: '🏬', Enterprise: '🏢', Base: '🌱', Commodity: '🍎', Organization: '🏛️',
    Region: '🗺️', Person: '🧑‍🌾', MetricObservation: '📊', LogisticsNode: '🚉'
  };
  const CAT_COLOR = {
    price: '#f43f5e', news: '#60a5fa', natural: '#22d3ee', supply: '#2dd4bf', circulation: '#818cf8',
    policy: '#8b5cf6', production: '#34d399', logistics: '#38bdf8', customs: '#a78bfa', industry_event: '#fb7185'
  };
  const CAT_EMOJI = {
    price: '🏷️', news: '📰', natural: '🌪️', supply: '📦', circulation: '🔄',
    policy: '📜', production: '🌱', logistics: '🚚', customs: '🛃', industry_event: '⚠️'
  };
  const REL_LABEL = {
    SUPPLIES_TO: '供应流向', FLOWS_INTO: '流入', FLOWS_OUT_OF: '流出', SHIPS_THROUGH: '运输经由',
    PRODUCES: '生产', LOCATED_IN: '行政归属', AFFECTS: '影响', DEPENDS_ON: '依赖',
    COVERS: '覆盖', TRADES: '贸易', SUBSTITUTES: '替代', PRICE_TRANSMITS_TO: '价格传导'
  };
  const STAGE_LABEL = {
    ingest: '接入', extract: '抽取', resolve: '归并', geo: '定位', score: '评分', link: '关联', graph: '图谱', warn: '告警'
  };

  /* ---------- 展示文案净化（G6） ----------
     数据包内部允许出现「示例/样例/示意」等登记用语（如「抖音农产品直播（示例链接）」），
     但页面指令 G6 要求普通 UI 不出现这类字样：这里只净化**渲染字段**，原始 JSON 原样保留在 data/pkg。 */
  const BANNED = /示例|样例|示意/g;
  const cleanText = t => String(t == null ? '' : t)
    .replace(/（示例链接）|(示例链接)/g, '')
    .replace(/（示例）|（样例）|（示意）/g, '')
    .replace(BANNED, '')
    .replace(/（\s*）|\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  const cleanCard = card => {
    const out = {};
    Object.keys(card || {}).forEach(k => {
      const v = card[k];
      out[k] = (typeof v === 'string' && /title|summary|name|reason|label|issuer|provider|commodity|instrument|region|exchange/i.test(k)) ? cleanText(v) : v;
    });
    return out;
  };

  /* ---------- 索引 ---------- */
  const sourceById = {};
  SOURCES_IN.forEach(s => { sourceById[s.sourceId] = s; });
  const evidenceByFact = {};
  EVIDENCE_IN.forEach(e => { (evidenceByFact[e.factId] = evidenceByFact[e.factId] || []).push(e); });
  const obsById = {};
  OBS_IN.forEach(o => { obsById[o.observationId] = o; });
  const entityById = {};
  ENTITIES_IN.forEach(e => { entityById[e.entityId] = e; });

  /* 关系 → 事实 反查（事实详情的「相关关系」） */
  const relIdsByFact = {};
  const supportCountOf = r => (r.provenanceMeta && r.provenanceMeta.supportCount) || (r.supportingFactIds || []).length;
  RELATIONS_IN.forEach(r => (r.supportingFactIds || []).forEach(fid => { (relIdsByFact[fid] = relIdsByFact[fid] || []).push(r.relationId); }));

  /* ---------- 地理层级与省份下拉数据（全部来自数据包实体） ---------- */
  const REGION_PATH = path => (path || []);
  const pathName = (path, level) => { const it = (path || []).find(p => p.level === level); return it ? it.name : null; };
  const provinceOf = path => (path || []).find(p => p.level === 'province') || null;

  const PROVINCES = (() => {
    const out = {};
    ENTITIES_IN.forEach(e => {
      if (e.type !== 'Region' || !e.geo || !e.geo.geoPoint) return;
      const p = provinceOf(e.geo.regionPath);
      if (!p || out[p.name]) return;
      out[p.name] = { code: p.code, name: p.name, lng: e.geo.geoPoint[0], lat: e.geo.geoPoint[1], objId: e.entityId };
    });
    return out;
  })();
  const shortProv = n => String(n || '').replace(/壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区|省|市$/g, '') || n;
  const PROV_BY_SHORT = {};
  Object.keys(PROVINCES).forEach(n => { PROV_BY_SHORT[shortProv(n)] = PROVINCES[n]; });

  /* ---------- Fact → 内部事实模型 ---------- */
  const IMPACT_OF = s => (s >= 70 ? 'high' : s >= 40 ? 'mid' : 'low');
  const radiusOf = s => 80 + Math.round(s * 3.2);            /* 影响半径（公里）按 severity 折算，用于光晕与详情展示 */
  const dateOf = f => String(f.occurredAt || f.publishedAt || f.timestamp || f.ingestedAt || '').slice(0, 10);
  const regionLabel = f => {
    const path = f.geo.regionPath || [];
    const prov = pathName(path, 'province'), city = pathName(path, 'city');
    const country = pathName(path, 'country');
    if (prov && city) return prov + ' · ' + city;
    if (prov) return prov;
    return country || pathName(path, 'global') || '全球';
  };
  const mediaOf = (f, card) => {
    if (f.cardType === 'video') return card.isLive ? 'live' : 'video';
    if (f.cardType === 'news' && card.imageUrl) return 'image';
    return 'text';
  };
  const MEDIA_NOTE = {
    video: c => c.mediaTitle || '视频',
    price: c => c.commodityName ? c.commodityName + ' ' + c.priceValue + ' ' + (c.priceUnit || '') : '价格',
    weather: c => c.regionName || '天气',
    policy: c => c.issuer || '政策',
    market: c => c.instrumentName || '市场',
    news: c => c.sourceName || '新闻'
  };
  function evidenceOf(f) {
    const list = evidenceByFact[f.factId] || [];
    if (list.length) {
      return list.map(e => {
        const src = sourceById[e.sourceId] || {};
        const ob = obsById[e.observationId] || {};
        return {
          k: (src.authorityTier || 'A') + ' 级来源', t: src.name || e.sourceId,
          q: e.quote || (ob.valueText || ob.rawValue || '') || '（原文摘录见来源链接）',
          url: e.sourceUrl || src.homepage || ''
        };
      });
    }
    /* 生成记录没有一手证据：按 SCHEMA §2.4 呈现登记信息（内部来源标识不进入普通 UI） */
    const pm = f.provenanceMeta || {};
    return [{ k: '记录登记', t: (pm.geoAnchorPlace || '区域登记') + ' · ' + (pm.collectedAt || ''),
      q: '坐标锚点：' + (pm.geoAnchorPlace || '—') + '（' + (pm.geoAnchorPrecision || '—') + '）', url: '' }];
  }

  const FACTS = FACTS_IN.map(f => {
    const card = (f.card && f.card.fields) || {};
    const pt = f.geo.geoPoint;
    const pm = f.provenanceMeta || {};
    return {
      id: f.factId, prov: pm.dataMode || 'generated',
      title: cleanText(f.title), summary: cleanText(f.summary),
      cat: f.category, cardType: f.cardType, card: cleanCard(card), cardTypeName: f.cardType,
      taxonomy: f.taxonomy || {}, factType: f.factType, status: f.status,
      level: f.geo.scopeLayer || 'L1',
      region: regionLabel(f), regionPath: f.geo.regionPath || [],
      province: (provinceOf(f.geo.regionPath) || {}).name || null,
      provinceCode: (provinceOf(f.geo.regionPath) || {}).code || null,
      city: pathName(f.geo.regionPath, 'city'),
      lat: pt ? pt[1] : null, lng: pt ? pt[0] : null,
      geoPrecision: f.geo.geoPrecision, drillableTo: f.geo.drillableTo || [], cityPrecisionOnly: !!f.geo.cityPrecisionOnly,
      date: dateOf(f), occurredAt: f.occurredAt, publishedAt: f.publishedAt, ingestedAt: f.ingestedAt,
      cred: f.credibility ? f.credibility.band : 'medium',
      credScore: f.credibility ? f.credibility.score : 0,
      impact: IMPACT_OF(f.severity), severity: f.severity,
      radius: radiusOf(f.severity),
      media: mediaOf(f, card), mediaNote: (MEDIA_NOTE[f.cardType] || MEDIA_NOTE.news)(card),
      sourcePlugin: f.sourcePlugin, sourceUrl: f.sourceUrl || '', authorityTier: f.authorityTier,
      confidence: f.confidence, review: (f.review || {}).state,
      evidence: evidenceOf(f), evidenceIds: f.evidenceIds || [],
      objects: (f.entityIds || []).filter(id => entityById[id]),
      relations: relIdsByFact[f.factId] || [],
      metric: f.metricKey ? { key: f.metricKey, value: f.metricValue, unit: f.metricUnit, period: f.metricPeriod } : null,
      provenanceMeta: pm
    };
  });

  /* ---------- Entity → 内部本体模型 ---------- */
  const OBJECTS = ENTITIES_IN.map(e => {
    const pt = e.geo && e.geo.geoPoint;
    const a = e.attributes || {};
    const dom = TYPE2DOMAIN[e.type] || 'metric';
    const props = [['对象域', ONT.lookup[e.type] || e.type], ['状态', e.status === 'active' ? '在册' : e.status]];
    if (a.landmark) props.push(['定位', a.landmark]);
    if (a.function) props.push(['功能', a.function]);
    if (a.role) props.push(['角色', a.role]);
    if (a.adminArea) props.push(['行政区', a.adminArea]);
    if (a.anchorPlace) props.push(['地理锚点', a.anchorPlace]);
    if (a.metricUnit) props.push(['单位', a.metricUnit]);
    if (a.priceUnit) props.push(['计价单位', a.priceUnit]);
    if (e.geo && e.geo.geoPrecision) props.push(['坐标精度', { exact: '地物点', approx: '近似', region_only: '行政区代表点', none: '无坐标' }[e.geo.geoPrecision] || e.geo.geoPrecision]);
    return {
      id: e.entityId, prov: (e.provenanceMeta || {}).dataMode || 'generated',
      entityType: e.type, typeName: ONT.lookup[e.type] || e.type,
      domain: dom, emoji: TYPE_EMOJI[e.type] || '📊',
      name: e.canonicalName,
      sub: a.landmark || a.function || a.role || a.adminArea || (ONT.lookup[e.type] || '') + '对象',
      alias: (e.aliases || []).join(' / '),
      lng: pt ? pt[0] : null, lat: pt ? pt[1] : null, geo: !!pt,
      regionPath: (e.geo && e.geo.regionPath) || [],
      region: (e.geo && e.geo.regionPath) ? ((pathName(e.geo.regionPath, 'province') || '') || pathName(e.geo.regionPath, 'country') || '全球') : '全球',
      props: props, commodityTags: e.commodityTags || [], factIds: e.supportingFactIds || [],
      note: (e.provenanceMeta || {}).note || ''
    };
  });

  /* ---------- Relation → 内部关系模型 ---------- */
  const RELATIONS = RELATIONS_IN.map(r => {
    const sc = supportCountOf(r);
    const verified = r.nature === 'verified';
    return {
      id: r.relationId, prov: (r.provenanceMeta || {}).dataMode || 'generated',
      from: r.sourceEntityId, to: r.targetEntityId,
      type: REL_LABEL[r.relationType] || r.relationType, typeCode: r.relationType,
      nature: r.nature,
      strength: Math.min(0.95, 0.5 + 0.12 * Math.min(4, sc)),
      confidence: verified ? (sc >= 3 ? 0.92 : sc >= 2 ? 0.82 : 0.72) : 0.55,
      formed: String((r.validity || {}).validFrom || '').slice(0, 7) || '',
      changedBy: (r.supportingFactIds || [])[0] || null,
      factIds: r.supportingFactIds || [],
      note: (r.provenanceMeta || {}).note || '',
      review: (r.review || {}).state
    };
  });

  /* ---------- 产区 / 港口 / 机场 / 节点 ---------- */
  const geoFeatures = g => ((P[g] || {}).features || []);
  const REGIONS = geoFeatures('regions').map(ft => ({
    id: ft.properties.id, name: ft.properties.name, emoji: '🌾',
    kind: ft.properties.kind, variety: (ft.properties.commodityNames || []).join(' / '),
    lat: ft.geometry.coordinates[1], lng: ft.geometry.coordinates[0],
    country: ft.properties.country, adminArea: ft.properties.adminArea,
    scale: ft.properties.coordinateMeaning, objId: ft.properties.id, prov: 'public',
    provider: (ft.properties.provenance || {}).provider
  }));
  const GATES = []
    .concat(geoFeatures('ports').map(ft => ({
      id: ft.properties.id, name: ft.properties.name, emoji: '⚓', kind: 'port',
      lat: ft.geometry.coordinates[1], lng: ft.geometry.coordinates[0], country: ft.properties.country,
      cargo: ft.properties.function, objId: ft.properties.id, prov: 'public',
      provider: (ft.properties.provenance || {}).provider
    })))
    .concat(geoFeatures('airports').map(ft => ({
      id: ft.properties.id, name: ft.properties.name, emoji: '✈️', kind: 'airport', iata: ft.properties.iata,
      lat: ft.geometry.coordinates[1], lng: ft.geometry.coordinates[0], country: ft.properties.country,
      cargo: ft.properties.function, objId: ft.properties.id, prov: 'public',
      provider: (ft.properties.provenance || {}).provider
    })))
    .concat(geoFeatures('nodes').map(ft => ({
      id: ft.properties.id, name: ft.properties.name, emoji: '🧊', kind: 'node', nodeKind: ft.properties.kind,
      lat: ft.geometry.coordinates[1], lng: ft.geometry.coordinates[0], country: 'CHN',
      cargo: ft.properties.function, objId: ft.properties.id, prov: 'public',
      provider: (ft.properties.provenance || {}).provider
    })));

  /* ---------- 底部流水 / 新星时序（B3 + M15） ---------- */
  const STREAM = (STREAM_IN.events || []).map(e => ({
    t: e.tOffsetMs, seq: e.seq, stage: e.stage, k: STAGE_LABEL[e.stage] || e.stage,
    text: e.line, factId: e.factId, star: e.star || null
  }));
  const STREAM_LOOP = STREAM_IN.loopMs || 1;

  /* ---------- 概览与来源统计（内部验收口径） ---------- */
  const STATS = P.stats || {};
  const MANIFEST = P.manifest || {};
  const realFacts = FACTS.filter(f => f.prov === 'real').length;

  return {
    datasetId: MANIFEST.datasetId || 'agrilink-demo-v1', datasetVersion: MANIFEST.datasetVersion || '1.0.0',
    collectedAt: MANIFEST.collectedAt || '', TODAY: MANIFEST.collectedAt || '2026-09-21',
    FACTS, OBJECTS, RELATIONS, REGIONS, GATES, STREAM, STREAM_LOOP,
    ONTOLOGY: ONT, SOURCES: SOURCES_IN, EVIDENCE: EVIDENCE_IN, OBSERVATIONS: OBS_IN,
    CARD_SCHEMA: P.cards || {}, STATS, MANIFEST, VALIDATION: P.validation || {},
    CAT_COLOR, CAT_EMOJI, TYPE_EMOJI, TYPE2DOMAIN, REL_LABEL, STAGE_LABEL,
    PROVINCES, PROV_BY_SHORT, shortProv,
    counts: {
      facts: FACTS.length, factsReal: realFacts, factsGenerated: FACTS.length - realFacts,
      entities: OBJECTS.length, relations: RELATIONS.length,
      regions: REGIONS.length, ports: GATES.filter(g => g.kind === 'port').length,
      airports: GATES.filter(g => g.kind === 'airport').length, nodes: GATES.filter(g => g.kind === 'node').length,
      streamEvents: STREAM.length, sources: SOURCES_IN.length
    }
  };
})();
