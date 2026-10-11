/* 把 sim-reports/*.json + *.expert.md 展开成 MiroFish 流程各步所需的完整内置数据。
   用法：node tools/gen-builtin.mjs
   产物：mirofish-frontend-preview/source/frontend/src/data/builtin/mirofish/<id>.json
   图谱规模：第一批 ≈120 个本体（图谱构建阶段逐步出现）→ 启动双平台后再补 ≈120 个（两个环境的事件），每份 ≈240 个。 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const SRC = path.join(ROOT, 'sim-reports');
const OUT = path.join(ROOT, 'mirofish-frontend-preview', 'source', 'frontend', 'src', 'data', 'builtin', 'mirofish');

const ROSTER = {
  'builtin-durian': [
    ['importer', '进口商', '经营主体', '按价差与到货节奏决定锁量与分流。', ['到货量', '批发价']],
    ['wholesaler', '批发商', '市场', '当日议价，最直接感到到货高峰。', ['批发价', '库存']],
    ['retailer', '零售商', '渠道', '把批发价变化传到终端，滞后 3—7 天。', ['零售价', '动销']],
    ['customs', '口岸报关', '制度', '申报量与放行时长决定在途时间。', ['通关时效', '查验']],
    ['coldchain', '冷链承运', '物流', '温控与在途天数决定损耗。', ['损耗率', '温控']],
    ['origin_my', '彭亨产区代表', '产区', '主产季集中，关注分级与到手价。', ['产季', '分级']],
    ['consumer', '终端消费者', '消费', '对价格敏感，贵了就先不买。', ['零售价', '替代品']],
    ['regulator', '市场监管', '制度', '关注价格异常波动与口径披露。', ['价格监测', '公示']]
  ],
  'builtin-origin': [
    ['thai_exporter', '泰国出口商', '产区', '保价不保量，维护品牌溢价。', ['品牌价', '高端']],
    ['vn_exporter', '越南出口商', '产区', '以价换量，抢中端货架。', ['价差', '走量']],
    ['importer', '进口商', '经营主体', '按价差与口岸时效分配两国货量。', ['价差', '时效']],
    ['wholesaler', '批发商', '市场', '最先感知替代速度。', ['批发价', '份额']],
    ['retailer', '零售商', '渠道', '按档位排货架，两头都有明确客人。', ['档位', '动销']],
    ['border', '边贸报关', '口岸', '排队时长直接决定谁先到。', ['排队', '放行']],
    ['shipping', '海运承运', '物流', '批量到港，单次冲击大。', ['船期', '批量']],
    ['market_admin', '市场管理', '制度', '关注价差失真与分级口径。', ['分级', '口径']]
  ]
};

/* 两个环境的实体词表：市场交易环境（trade）+ 产业协作环境并行（coop），各 60 个 */
const TRADE = ['产地报价', '到岸成本核算', '一批成交', '二批分销', '补货指令', '调运排期', '冷库出入库', '商超陈列调整', '促销活动', '临期折价',
  '退货处理', '在途改港', '船期变更', '集装箱周转', '结算回款', '价格调整通知', '库存盘点', '跨市场调货', '终端补货', '团购开团',
  '档口竞价', '到货验收', '分拣打包', '批发结算', '物流招标', '车皮调拨', '港口提柜', '报关申报', '税费核算', '批次贴标',
  '品质复检', '渠道铺货', '电商上架', '直播选品', '会员团购', '价格签更新', '毛利复盘', '损耗核销', '夜间到货', '凌晨开秤',
  '早市议价', '午市调价', '晚市甩货', '周度订货', '月度对账', '季度返利', '同行询价', '跨省承运', '城市配送', '末端履约',
  '售后理赔', '换货补发', '仓储租金', '装卸排班', '磅单核验', '冷链打冷', '温度记录', '包装耗材', '电子合同', '票据流转'];
const COOP = ['产地共建基地', '联合采购小组', '共享冷库', '干线共配', '标准分级共建', '信息互通机制', '价格指数共建', '质量追溯联盟', '产销对接会', '技术培训',
  '订单农业', '保底收购协议', '冷链协同调度', '纸箱共用池', '检验互助', '出口商联合会', '口岸协调会', '产业协作平台', '数据共享协议', '风险共担基金',
  '联合品牌推广', '产地溯源共建', '共建检测实验室', '共用分选线', '统一包装标准', '共建冷链干线', '共享订单池', '协同排产', '共享仓配网络', '共建价格指数',
  '联合议价', '行业自律公约', '纠纷调解机制', '人才联合培养', '共建试验田', '共享气象数据', '协同防疫', '共建出口通道', '共享船期资源', '联合投保',
  '共建结算规则', '共享信用档案', '产销信息共建', '共建应急储备', '联合质量抽检', '共建产地仓', '共用装卸设备', '共享运力平台', '共建加工中心', '联合培训基地',
  '共建标准委员会', '共享客户资源', '共建园区', '联合举办交易会', '共建线上平台', '共享数据接口', '共建评价体系', '联合风险评估', '共建绿色通道', '共享售后网络'];

/* ---------- 真实感图谱：几个枢纽 + 大小不一的社区 + 幂律度数 ---------- */
/* 社区按业务链条划分（同类本体故意分散在不同社区），枢纽取种子里的核心主体 */
const COMMUNITIES = {
  'builtin-durian': [
    { key: 'c1', name: '马来西亚/泰国季重叠', types: ['产区', '农产品'], hub: '马来西亚彭亨' },
    { key: 'c2', name: '通关与冷链时效', types: ['制度', '角色'], hub: '口岸通关' },
    { key: 'c3', name: '市场与价格传导', types: ['市场', '指标'], hub: '长沙红星市场' },
    { key: 'c4', name: '品种分档与替代', types: ['农产品', '指标'], hub: '金枕' },
    { key: 'c5', name: '进口与批发协作', types: ['角色', '市场'], hub: '进口商' },
    { key: 'c6', name: '口径与监管', types: ['制度', '指标'], hub: '批发价' }
  ],
  'builtin-origin': [
    { key: 'c1', name: '泰越同期上市', types: ['产区', '农产品'], hub: '泰国尖竹汶' },
    { key: 'c2', name: '口岸通道与时效', types: ['制度', '角色'], hub: '友谊关' },
    { key: 'c3', name: '价差与份额', types: ['指标', '市场'], hub: '产地价差' },
    { key: 'c4', name: '档位与替代', types: ['农产品', '指标'], hub: 'Ri6' },
    { key: 'c5', name: '出口商与渠道', types: ['角色', '市场'], hub: '泰国出口商' },
    { key: 'c6', name: '分级口径', types: ['制度', '指标'], hub: '产地分级口径' }
  ]
}
/* 确定性随机（同一份数据每次生成一致） */
function prng(seed) {
  let t = seed >>> 0;
  return () => { t += 0x6D2B79F5; let x = Math.imul(t ^ (t >>> 15), 1 | t); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296 }
}

const EXPAND = {
  'builtin-durian': {
    sources: ['马来西亚彭亨', '马来西亚柔佛', '马来西亚沙巴', '泰国东部尖竹汶', '泰国南部春蓬', '越南前江', '越南平顺', '菲律宾达沃', '海南保亭', '云南西双版纳', '老挝占巴塞', '柬埔寨马德望'],
    goods: ['金枕', 'D24', '猫山王', '黑刺', 'Ri6', '干尧', '青尼', '甲仑', '苏丹王', '红虾', '托玛尼', '甘尧'],
    markets: ['长沙红星市场', '广州江南市场', '北京新发地', '上海江桥市场', '成都濛阳市场', '西安雨润市场', '武汉白沙洲市场', '郑州万邦市场', '深圳海吉星', '杭州勾庄市场', '重庆双福市场', '南京众彩市场', '青岛城阳市场', '福州海峡市场', '昆明王旗营市场', '南昌深圳农产品市场', '贵阳农产品物流园', '沈阳盛发市场', '厦门中埔市场', '天津海吉星'],
    actors: ['进口商', '一级批发商', '二级批发商', '连锁商超采购', '水果专营店', '社区团购平台', '电商业态', '冷链承运商', '报关行', '船务代理', '产地经纪', '终端消费者', '行业协会', '市场监管', '价格监测机构', '结算与保险'],
    metrics: ['批发价', '到货量', '日成交量', '价差', '损耗率', '周转天数', '库存水位', '零售价', '终端渗透率', '鲜度等级', '退货率', '通关时长', '在途天数', '市场份额', '毛利空间', '价格波动率'],
    rules: ['口岸通关流程', '检验检疫要求', '产地分级标准', '冷链温控规范', '追溯码规则', '进口配额', '关税税率', '仓储管理规范', '批发市场准入', '价格公示制度', '质量抽检', '产地证核验', '运输许可', '包装标识规范', '结算账期约定', '争议处理流程', '应急调运机制', '价格异常预警', '储备投放规则', '口岸作业时长'],
    seedTypes: { n1: '产区', n2: '产区', n3: '农产品', n4: '农产品', n5: '农产品', n6: '市场', n7: '市场', n8: '角色', n9: '角色', n10: '角色', n11: '指标', n12: '指标', n13: '制度', n14: '指标' }
  },
  'builtin-origin': {
    sources: ['泰国尖竹汶', '泰国罗勇', '泰国南部', '越南前江', '越南平顺', '越南隆安', '马来西亚彭亨', '柬埔寨马德望', '老挝占巴塞', '缅甸掸邦', '海南东方', '云南河口'],
    goods: ['金枕', 'Ri6', '干尧', '青尼', '甲仑', '猫山王', 'D24', '黑刺', '苏丹王', '红虾', '托玛尼', '甘尧'],
    markets: ['广州江南市场', '长沙红星市场', '北京新发地', '上海江桥市场', '深圳海吉星', '成都濛阳市场', '武汉白沙洲市场', '郑州万邦市场', '西安雨润市场', '杭州勾庄市场', '重庆双福市场', '南京众彩市场', '青岛城阳市场', '福州海峡市场', '昆明王旗营市场', '南昌深圳农产品市场', '贵阳农产品物流园', '沈阳盛发市场', '厦门中埔市场', '天津海吉星'],
    actors: ['泰国出口商', '越南出口商', '中国进口商', '一级批发商', '二级批发商', '商超采购', '水果专营店', '社区团购平台', '边贸报关行', '海运承运商', '冷库运营方', '产地经纪', '终端消费者', '行业协会', '口岸协调机构', '价格监测机构'],
    metrics: ['产地价差', '批发价', '到货量', '份额', '通关时长', '排队时长', '损耗率', '周转天数', '库存水位', '零售价', '档位价差', '替代速度', '退货率', '毛利空间', '品牌溢价', '价格波动率'],
    rules: ['边贸通关流程', '海运报关要求', '产地分级口径', '原产地证明', '检验检疫要求', '冷链温控规范', '口岸排队规则', '关税与配额', '市场准入', '质量抽检', '包装标识规范', '结算账期约定', '争议处理流程', '价格公示制度', '运输许可', '仓储管理规范', '应急调运机制', '价格异常预警', '出口商备案', '通关时长公示'],
    seedTypes: {}
  }
};

/* 从专家文档切章节：导语 + 【NN 标题 正文】 */
function parseDoc(md) {
  const lines = md.split('\n');
  const lead = lines.find((l) => /^_.+_$/.test(l.trim()));
  const sections = [];
  let cur = null;
  for (const raw of lines) {
    const line = raw.trim();
    const chap = line.match(/^\*\*(\d{2})\*\*$/);
    if (chap) { cur = { no: chap[1], title: '', body: [] }; sections.push(cur); continue }
    if (/^###\s/.test(line)) {
      const t = line.replace(/^###\s*/, '').replace(/\*\*/g, '');
      if (cur && !cur.title) cur.title = t;
      else { cur = { no: '', title: t, body: [] }; sections.push(cur) }
      continue;
    }
    if (!line || !cur) continue;
    cur.body.push(line);
  }
  return {
    lead: lead ? lead.replace(/^_|_$/g, '') : '',
    sections: sections.filter((s) => s.title).map((s) => ({ title: s.title, content: s.body.join('\n\n') }))
  };
}

function build(name) {
  const d = JSON.parse(fs.readFileSync(path.join(SRC, name + '.json'), 'utf8'));
  const doc = parseDoc(fs.readFileSync(path.join(SRC, name + '.expert.md'), 'utf8'));
  const X = EXPAND[d.id];
  const pid = d.id.toUpperCase(), gid = pid + '-GRAPH', sid = pid + '-SIM', rid = pid + '-REPORT';

  /* ---------- 图谱：种子 14 + 第一批 ≈108 → 启动双平台后再补 120 ---------- */
  const nodes = [], edges = [];
  const add = (name_, type, group, summary, wave) => {
    const id = 'n' + (nodes.length + 1);
    nodes.push({ uuid: id, name: name_, labels: ['Entity', type], summary, wave, group,
      batch: wave === 1 ? Math.floor((nodes.filter((n) => n.wave === 1).length) / 12) + 1 : Math.floor((nodes.filter((n) => n.wave === 2).length) / 12) + 1 });
    return id;
  };
  const link = (a, b, nm, fact, wave) => edges.push({ uuid: 'e' + (edges.length + 1), source_node_uuid: a, target_node_uuid: b, name: nm, fact, wave });

  const seed = d.graph.nodes.map((n) => ({ name: n.name, type: n.type, group: n.group, summary: n.summary }));
  const seedIds = {};
  seed.forEach((n) => { seedIds[n.name] = add(n.name, n.type, n.group, n.summary, 1) });
  d.graph.edges.forEach((e) => {
    const a = (d.graph.nodes.find((n) => n.id === e.source) || {}).name;
    const b = (d.graph.nodes.find((n) => n.id === e.target) || {}).name;
    if (seedIds[a] && seedIds[b]) link(seedIds[a], seedIds[b], e.name, e.fact, 1);
  });

  const w1 = { source: [], goods: [], market: [], actor: [], metric: [], rule: [] };
  X.sources.forEach((s) => w1.source.push(add(s, '产区', 'source', s + '：可供量、产季窗口与分级能力', 1)));
  X.goods.forEach((g) => ['A 级', 'B 级'].forEach((grade) => w1.goods.push(add(g + ' ' + grade, '农产品', 'goods', g + ' 的 ' + grade + ' 货，分档定价与流向不同', 1))));
  X.markets.forEach((m) => w1.market.push(add(m, '市场', 'market', m + '：集散、价格发现与终端辐射', 1)));
  X.actors.forEach((a) => w1.actor.push(add(a, '角色', 'actor', a + '：在链条上的目标函数与出招方式', 1)));
  X.metrics.forEach((m) => w1.metric.push(add(m, '指标', 'metric', m + '：本案例的观测口径', 1)));
  X.rules.forEach((r) => w1.rule.push(add(r, '制度', 'rule', r + '：影响时效与成本的规则', 1)));
  /* 社区划分：按业务链条，同类本体故意散在不同社区 */
  const COM = COMMUNITIES[d.id];
  const rnd = prng(20261012);
  const comOf = new Map();
  nodes.forEach((n, i) => {
    const type = (n.labels || [])[1];
    const fit = COM.filter((c) => c.types.includes(type));
    /* 六成落到"本该在"的社区，四成按链条关系散到别处 —— 避免同类扎堆 */
    const pick = (fit.length && rnd() < 0.6) ? fit[Math.floor(rnd() * fit.length)] : COM[Math.floor(rnd() * COM.length)];
    comOf.set(n.uuid, pick.key);
    n.community = pick.key;
    n.communityName = pick.name;
  });
  const hubIds = new Map();
  COM.forEach((c) => { const hit = nodes.find((n) => n.name === c.hub); if (hit) hubIds.set(c.key, hit.uuid) });

  /* 优先连接：每条新边偏向度数高的节点 —— 长出来的就是"几个枢纽 + 长尾" */
  const deg = new Map(nodes.map((n) => [n.uuid, 0]));
  const bump = (id) => deg.set(id, (deg.get(id) || 0) + 1);
  const pickBy = (cands, community) => {
    const pool = cands.filter((id) => id);
    let total = 0;
    const w = pool.map((id) => {
      const base = (deg.get(id) || 0) + 1;
      const same = comOf.get(id) === community ? 3.2 : 0.5;   /* 社区内更密，跨社区更少 */
      const isHub = hubIds.get(community) === id ? 3 : 1;
      const val = base * same * isHub;
      total += val;
      return val;
    });
    let r = rnd() * total;
    for (let i = 0; i < pool.length; i++) { r -= w[i]; if (r <= 0) return pool[i] }
    return pool[pool.length - 1];
  };
  const attach = (id, name, fact, community) => {
    const cand = nodes.filter((n) => n.uuid !== id).map((n) => n.uuid);
    const target = pickBy(cand, community);
    if (!target) return;
    link(target, id, name, fact, 1);
    bump(target); bump(id);
    /* 度数高的节点再多连一条，形成枢纽 */
    if ((deg.get(target) || 0) > 4 && rnd() < 0.55) {
      const second = pickBy(cand.filter((x) => x !== target), community);
      if (second) { link(second === id ? target : second, id, name, fact, 1); bump(second); bump(id) }
    }
  };
  /* 种子之间的原有关系已经在图上（它们就是那几个核心），先把度数计上 */
  edges.forEach((e) => { bump(e.source_node_uuid); bump(e.target_node_uuid) });
  w1.source.forEach((id) => attach(id, '供应流向', '产地供给进入市场与品种链路', comOf.get(id)));
  w1.goods.forEach((id) => attach(id, '价格传导', '分档价格进入观测口径', comOf.get(id)));
  w1.actor.forEach((id) => attach(id, '供应流向', '经营主体在市场内成交', comOf.get(id)));
  w1.market.forEach((id) => attach(id, '供应流向', '集散市场的货流与价格发现', comOf.get(id)));
  w1.metric.forEach((id) => attach(id, '价格传导', '口径随链条变化', comOf.get(id)));
  w1.rule.forEach((id) => attach(id, '时效约束', '制度约束回压到出货节奏', comOf.get(id)));
  /* 枢纽之间再拉几条主干，形成跨社区干道 */
  COM.forEach((c, i) => {
    const a = hubIds.get(c.key), b = hubIds.get(COM[(i + 1) % COM.length].key);
    if (a && b && a !== b) { link(a, b, i % 2 ? '价格传导' : '时效约束', '社区之间的主干传导', 1); bump(a); bump(b) }
  });
  const wave1Count = nodes.length;

  /* 第二批：两个环境的事件节点（各 60） */
  const tradeIds = TRADE.map((t) => add(t, '交易事件', 'trade', '市场交易环境：' + t, 2));
  const coopIds = COOP.map((c) => add(c, '协作事件', 'coop', '产业协作环境并行：' + c, 2));
  const deg2 = new Map(nodes.map((n) => [n.uuid, (deg.get(n.uuid) || 0)]));
  const bump2 = (id) => deg2.set(id, (deg2.get(id) || 0) + 1);
  const pickHot = (cands) => {
    let total = 0;
    const w = cands.map((id) => { const v = Math.pow((deg2.get(id) || 0) + 1, 1.4); total += v; return v });
    let r = rnd() * total;
    for (let i = 0; i < cands.length; i++) { r -= w[i]; if (r <= 0) return cands[i] }
    return cands[cands.length - 1];
  };
  tradeIds.forEach((id) => { const t = pickHot(w1.market.concat(w1.actor)); link(t, id, '市场交易', '交易事件挂在最活跃的市场与主体上', 2); bump2(t); bump2(id) });
  coopIds.forEach((id) => { const t = pickHot(w1.actor.concat(w1.rule)); link(t, id, '产业协作', '协作事件挂在活跃主体与规则上', 2); bump2(t); bump2(id) });

  /* ---------- 环境与主体 ---------- */
  const roster = ROSTER[d.id];
  const profiles = roster.map(([nm, username, entity_type, bio, topics], i) => ({ agent_id: i, name: nm, username, profession: username, entity_type, bio, interested_topics: topics }));
  const simulationConfig = {
    time_config: { total_simulation_hours: 12, minutes_per_round: 30, agents_per_hour_min: 2, agents_per_hour_max: 6,
      peak_hours: [8, 9, 10], peak_activity_multiplier: 1.5, work_hours: [8, 9, 10, 11, 12, 13, 14, 15, 16, 17], work_activity_multiplier: 1,
      morning_hours: [6, 7, 8], morning_activity_multiplier: 1.2, off_peak_hours: [0, 1, 2, 3, 4, 5], off_peak_activity_multiplier: 0.5 },
    agent_configs: profiles.map((p, i) => ({ agent_id: p.agent_id, entity_name: p.username, entity_type: p.entity_type, stance: 'neutral',
      active_hours: [7, 8, 9, 10, 11, 12, 14, 15, 16], posts_per_hour: 2 + (i % 2), comments_per_hour: 3, response_delay_min: 2, response_delay_max: 8,
      activity_level: 0.6 + (i % 3) * 0.1, sentiment_bias: 0, influence_weight: 0.5 + (i % 4) * 0.1 })),
    twitter_config: { recency_weight: 0.6, popularity_weight: 0.3, relevance_weight: 0.8, viral_threshold: 0.7, echo_chamber_strength: 0.2 },
    reddit_config: { recency_weight: 0.4, popularity_weight: 0.4, relevance_weight: 0.9, viral_threshold: 0.6, echo_chamber_strength: 0.3 },
    environment_config: {
      market: { name: '市场交易环境', platform: 'twitter', focus: '报价、成交、调运、库存与终端价格' },
      industry: { name: '产业协作环境并行', platform: 'reddit', focus: '共建、共配、标准与信息互通' }
    },
    event_config: {
      narrative_direction: '市场交易环境与产业协作环境并行：' + d.requirement,
      hot_topics: [d.topic, ...d.kpis.slice(0, 2).map((k) => k.label)],
      initial_posts: [
        { poster_type: profiles[0].username, poster_agent_id: 0, content: '【市场交易环境】' + d.timeline[0].label + '：' + d.timeline[0].detail },
        { poster_type: profiles[1].username, poster_agent_id: 1, content: '【产业协作环境】' + d.summary.split('；')[0] + '。' }
      ]
    },
    generation_reasoning: '按本体生成 ' + profiles.length + ' 个角色|市场交易环境与产业协作环境并行推进|' + d.rounds + ' 轮观测到货节奏、价差与份额变化'
  };

  /* ---------- 双平台逐轮行为：两侧分别跑两个环境 ---------- */
  const facts = d.graph.edges.map((e) => e.fact), points = d.findings.flatMap((f) => f.points), quotes = d.findings.flatMap((f) => f.quotes.map((q) => q.text));
  const actions = [];
  let n = 0;
  for (let round = 1; round <= d.rounds; round++) {
    const ph = Math.min(d.timeline.length - 1, Math.floor((round / d.rounds) * d.timeline.length));
    const tl = d.timeline[ph];
    const rows = [
      ['twitter', round % profiles.length, '【市场交易环境 · ' + TRADE[(round - 1) % TRADE.length] + '】' + facts[(round - 1) % facts.length], 'CREATE_POST'],
      ['twitter', (round + 1) % profiles.length, '【市场交易环境】' + points[(round - 1) % points.length], 'CREATE_POST'],
      ['reddit', (round + 2) % profiles.length, '【产业协作环境并行 · ' + COOP[(round - 1) % COOP.length] + '】' + quotes[(round - 1) % quotes.length], 'CREATE_COMMENT'],
      ['reddit', (round + 3) % profiles.length, '【产业协作环境并行】' + d.process[Math.min(d.process.length - 1, Math.floor(round / 3))].finding, 'CREATE_POST']
    ];
    rows.forEach(([platform, ai, text, type]) => {
      n += 1;
      const body = tl.t + ' ' + tl.label + '｜' + text;
      actions.push({ id: d.id + '-a' + n, platform, agent_id: profiles[ai].agent_id,
        agent_name: profiles[ai].username, agent_username: profiles[ai].username,
        action_type: type, content: body,
        /* 前端时间轴卡片按 action_args.content 取正文，缺它就只剩空卡片 */
        action_args: { content: body, text: body },
        timestamp: new Date(Date.UTC(2026, 9, 12, 0, round * 30)).toISOString(), round_num: round });
    });
  }

  /* ---------- 报告：章节 = 专家文档；日志逐段推进 ---------- */
  const outline = { title: d.title, summary: doc.lead || d.summary, sections: [...doc.sections.map((s) => ({ title: s.title })), { title: '口径与来源' }] };
  const sourceLine = '口径与来源：' + d.sources.map((s) => s.name + '（' + s.type + '）').join('、') + '。';
  const at = (sec) => new Date(Date.UTC(2026, 9, 12, 0, 0, sec)).toISOString();
  let clock = 1;
  const step = (parts) => { clock += parts; return at(clock) };
  const reportLogs = [
    { action: 'report_start', elapsed_seconds: 0.6, timestamp: step(1), details: {} },
    { action: 'tool_call', elapsed_seconds: 1.4, timestamp: step(1), details: { tool: 'build_outline', parameters: { sections: doc.sections.length + 1 } } },
    { action: 'tool_result', elapsed_seconds: 1.1, timestamp: step(1), details: { tool: 'build_outline', ok: true } },
    { action: 'planning_complete', elapsed_seconds: 2.3, timestamp: step(1), details: { outline } },
    ...doc.sections.flatMap((s, i) => ([
      { action: 'tool_call', elapsed_seconds: 1.6 + i * 0.2, timestamp: step(2), details: { tool: 'write_section', parameters: { section_index: i + 1, title: s.title } } },
      { action: 'llm_response', elapsed_seconds: 3.1 + i * 0.3, timestamp: step(3), details: { response: '第 ' + (i + 1) + ' 节已生成：' + s.title } },
      { action: 'tool_result', elapsed_seconds: 0.8, timestamp: step(1), details: { tool: 'write_section', ok: true } },
      { action: 'section_complete', section_index: i + 1, elapsed_seconds: 2.4 + i * 0.4, timestamp: step(1), details: { content: s.content } }
    ])),
    { action: 'tool_call', elapsed_seconds: 1.2, timestamp: step(2), details: { tool: 'collect_sources', parameters: {} } },
    { action: 'section_complete', section_index: doc.sections.length + 1, elapsed_seconds: 1.5, timestamp: step(1), details: { content: sourceLine } },
    { action: 'report_complete', elapsed_seconds: 0.9, timestamp: step(1), details: {} }
  ];

  /* 度数写回节点：前端按度数定半径，几个枢纽自然更大；community 也带上 */
  const degFinal = new Map();
  edges.forEach((e) => { degFinal.set(e.source_node_uuid, (degFinal.get(e.source_node_uuid) || 0) + 1); degFinal.set(e.target_node_uuid, (degFinal.get(e.target_node_uuid) || 0) + 1) });
  nodes.forEach((n) => { n.degree = degFinal.get(n.uuid) || 0; n.hub = n.degree >= 8 ? 1 : 0 });

  return { id: d.id, project_id: pid, graph_id: gid, simulation_id: sid, report_id: rid, topic: d.topic, title: d.title, tag: d.tag,
    requirement: d.requirement, rounds: d.rounds, agents: profiles.length, generatedAt: d.generatedAt,
    wave1Count, wave2Count: nodes.length - wave1Count, nodeTotal: nodes.length,
    ontology: { entity_types: d.ontology.entity_types, edge_types: d.ontology.edge_types, relation_types: d.ontology.edge_types.map((e) => ({ name: e.name })) },
    nodes, edges, profiles, simulationConfig, actions, outline, reportLogs, dataset: d };
}

fs.mkdirSync(OUT, { recursive: true });
const index = {};
for (const nm of ['durian', 'origin']) {
  const b = build(nm);
  fs.writeFileSync(path.join(OUT, b.id + '.json'), JSON.stringify(b, null, 2));
  index[b.project_id] = { id: b.id, title: b.title, topic: b.topic, tag: b.tag, rounds: b.rounds, agents: b.agents, wave1Count: b.wave1Count, nodeTotal: b.nodeTotal };
  console.log(b.id, '| 第一批', b.wave1Count, '+ 第二批', b.wave2Count, '= 共', b.nodeTotal, '| 关系', b.edges.length, '| 行为', b.actions.length, '| 章节', b.outline.sections.length);
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2));
console.log('→', OUT);
