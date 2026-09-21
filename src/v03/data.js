/* ============================================================
   V0.3 三层数据底座 —— 事实层 / 关联层共用（口径字段为真实口径框架）
   结构：事实（Fact）→ 本体对象（Object，九类对象域）→ 关系（Relation）
   事实与对象/关系双向可回溯：fact.objects / fact.relations / obj.factIds / rel.factIds
   ============================================================ */
window.V03Data = (function () {
  const TODAY = '2026-09-20';            // 演示基准日（相对时间筛选以它为准）

  const CATS = {
    policy:    { n: '政策', c: '#8b5cf6', e: '📜' },
    price:     { n: '价格', c: '#f43f5e', e: '🏷️' },
    weather:   { n: '天气', c: '#22d3ee', e: '🌪️' },
    logistics: { n: '物流', c: '#2dd4bf', e: '🚚' },
    trade:     { n: '交易', c: '#60a5fa', e: '🤝' }
  };

  /* 九类对象域（关联层分类必须完整覆盖）——暖色本体色系，与事实层冷色系完全区分 */
  const DOMAINS = [
    { id: 'market',   n: '市场',       geo: true,  c: '#f59e0b', e: '🏬' },
    { id: 'company',  n: '公司',       geo: true,  c: '#ea580c', e: '🏢' },
    { id: 'base',     n: '基地',       geo: true,  c: '#65a30d', e: '🌱' },
    { id: 'variety',  n: '品种',       geo: false, c: '#eab308', e: '🍎' },
    { id: 'agency',   n: '政策机构',   geo: false, c: '#d946ef', e: '🏛️' },
    { id: 'region',   n: '区域',       geo: true,  c: '#16a34a', e: '🗺️' },
    { id: 'person',   n: '人物/角色',  geo: false, c: '#f472b6', e: '🧑‍🌾' },
    { id: 'metric',   n: '指标',       geo: false, c: '#facc15', e: '📊' },
    { id: 'facility', n: '设施/渠道',  geo: true,  c: '#fb923c', e: '🚉' }
  ];


  /* 省区中心与缩放（事实层与视线漏斗共用）：[经度, 纬度, 缩放级] */
  const PROV_CENTER = {

    湖南: [111.7, 27.6, 4.2], 山东: [118.2, 36.4, 4.0], 四川: [102.9, 30.6, 3.6], 广东: [113.4, 23.3, 4.0],
    河南: [113.6, 33.9, 4.2], 北京: [116.4, 40.2, 6.0], 江苏: [119.4, 32.9, 4.2], 浙江: [120.2, 29.2, 4.2],
    湖北: [112.2, 30.9, 4.2], 安徽: [117.2, 31.8, 4.0], 江西: [115.7, 27.6, 4.0], 重庆: [107.9, 29.9, 4.6],
    陕西: [108.9, 35.3, 4.0], 辽宁: [123.0, 41.5, 4.0], 河北: [115.5, 38.9, 4.0], 山西: [112.5, 37.6, 4.0],
    广西: [108.3, 23.8, 4.0], 云南: [101.5, 25.0, 3.6], 贵州: [106.7, 26.8, 4.0], 福建: [118.1, 26.1, 4.0],
    天津: [117.2, 39.1, 5.6], 上海: [121.4, 31.2, 6.0], 海南: [109.8, 19.2, 4.6], 新疆: [85.6, 41.7, 2.4],
    西藏: [87.9, 31.0, 2.4], 内蒙古: [111.7, 44.1, 3.0], 黑龙江: [127.9, 47.3, 2.8], 吉林: [126.2, 43.6, 3.0],
    甘肃: [100.5, 37.7, 3.0], 青海: [95.9, 35.7, 2.8], 宁夏: [106.2, 37.3, 4.4], 台湾: [121.0, 23.7, 4.6],
    香港: [114.2, 22.3, 7.0], 澳门: [113.5, 22.2, 7.0]
  };

  /* 视线漏斗：地图看到哪里就显示哪里的数据，缩放越深越密（M0 / M13） */
  const CHINA_BOX = { lng: [73, 136], lat: [17.5, 54.5] };

  /* ---------- 事实：地图对象 + 影响范围 + 证据 ---------- */
  /* ---------- 榴莲份额用户故事：事实（最近 30 天 · 交易量口径，演示基线） ---------- */
  const DURIAN_FACTS = [
    { id: 'F-DU-01', cat: 'trade', date: '2026-09-19', level: 'province', region: '湖南 · 长沙', short: '马来西亚榴莲',
      lat: 28.19, lng: 112.98, cred: 'high', impact: 'high', radius: 160, media: 'image', mediaNote: '冷库到货台账 4 张',
      title: '最近 30 天湖南接收马来西亚榴莲 4,800 吨（交易量口径）',
      summary: '按到货台账归并：湖南接收马来西亚榴莲 4,800 吨；其中红星市场接收 1,680 吨，流入占比 35%（演示基线基线）。',
      evidence: [{ t: '湖南进口商到货台账', k: '台账', q: '最近 30 天湖南接收马来西亚榴莲 4,800 吨；红星 1,680 吨。' },
                 { t: '口径说明', k: '口径', q: '统一采用交易量口径（吨），时间范围最近 30 天。' }],
      objects: ['O-REG-MY', 'O-VAR-DURIAN', 'O-MKT-HX', 'O-MET-DUSHR'], relations: ['R-DU-01', 'R-DU-02'] },

    { id: 'F-DU-02', cat: 'trade', date: '2026-09-19', level: 'province', region: '湖南 · 长沙', short: '红星榴莲到货',
      lat: 28.19, lng: 112.98, cred: 'high', impact: 'mid', radius: 120, media: 'image', mediaNote: '交易区到货照片 3 张',
      title: '红星市场接收马来西亚榴莲 1,680 吨，日均到货 56 吨',
      summary: '红星为湖南主要落地市场之一；日均到货约 56 吨，凌晨竞价为主。',
      evidence: [{ t: '红星市场到货台账', k: '台账', q: '最近 30 天接收马来西亚榴莲 1,680 吨，日均约 56 吨。' }],
      objects: ['O-MKT-HX', 'O-VAR-DURIAN', 'O-COM-IMP'], relations: ['R-DU-02'] },

    { id: 'F-DU-03', cat: 'trade', date: '2026-09-19', level: 'province', region: '湖南 · 长沙', short: '湖南榴莲交易量',
      lat: 28.10, lng: 112.90, cred: 'high', impact: 'mid', radius: 150, media: 'text', mediaNote: '市场交易台账摘录',
      title: '湖南全部来源榴莲交易量 6,600 吨，红星占 2,310 吨',
      summary: '含马来西亚、泰国、越南等全部来源；红星交易量 2,310 吨，市场份额 35%（演示基线基线）。',
      evidence: [{ t: '全省主要批发市场交易台账', k: '台账', q: '湖南榴莲交易量 6,600 吨；红星 2,310 吨。' }],
      objects: ['O-MKT-HX', 'O-MKT-GZ', 'O-MET-DUSHR'], relations: ['R-DU-07', 'R-DU-08'] },

    { id: 'F-DU-04', cat: 'trade', date: '2026-09-19', level: 'province', region: '湖南 · 长沙', short: '红星交易量',
      lat: 28.17, lng: 113.01, cred: 'high', impact: 'mid', radius: 120, media: 'image', mediaNote: '交易区价牌 2 张',
      title: '红星市场榴莲交易量 2,310 吨，占湖南市场份额 35%',
      summary: '红星份额以「红星交易量 ÷ 湖南总交易量」计算，基线 35%。',
      evidence: [{ t: '红星市场交易台账', k: '台账', q: '榴莲交易量 2,310 吨，占全省 35%。' }],
      objects: ['O-MKT-HX', 'O-MET-DUSHR'], relations: ['R-DU-07'] },

    { id: 'F-DU-05', cat: 'price', date: '2026-09-20', level: 'province', region: '湖南 · 长沙', short: '红星榴莲价',
      lat: 28.19, lng: 112.98, cred: 'high', impact: 'mid', radius: 110, media: 'image', mediaNote: '价牌照片 2 张',
      title: '红星榴莲平均批发价 32 元／公斤（最近 30 天）',
      summary: '按品类归并的批发均价；价格弹性为模型估计参数（降级项）。',
      evidence: [{ t: '红星市场挂牌价', k: '市场', q: '榴莲批发均价 32 元／公斤。' }],
      objects: ['O-MKT-HX', 'O-MET-PRICE', 'O-VAR-DURIAN'], relations: ['R-DU-05'] },

    { id: 'F-DU-06', cat: 'logistics', date: '2026-09-20', level: 'province', region: '湖南 · 长沙', short: '库存周转',
      lat: 28.19, lng: 112.98, cred: 'mid', impact: 'low', radius: 90, media: 'text', mediaNote: '库存台账摘录',
      title: '红星榴莲库存周转天数 3.8 天，冷链分拨能力接近上限',
      summary: '库容与分拨线接近能力上限，周转天数对到货增量较敏感。',
      evidence: [{ t: '冷库进出库台账', k: '台账', q: '库存周转 3.8 天，分拨利用率 87%。' }],
      objects: ['O-MKT-HX', 'O-FAC-PORT'], relations: ['R-DU-03'] },

    { id: 'F-DU-07', cat: 'trade', date: '2026-09-15', level: 'global', region: '马来西亚 · 彭亨劳勿', short: '彭亨产量',
      lat: 3.50, lng: 101.80, cred: 'mid', impact: 'high', radius: 220, media: 'image', mediaNote: '果园测产 3 张',
      title: '彭亨劳勿产季增产，对湖南可供量预计提升 20%',
      summary: '产季增产叠加专线运力恢复；「增长 20%」在本推演中作为用户假设，不写成现实事实。',
      evidence: [{ t: '产区测产与出口计划', k: '测产', q: '对湖南可供量预计提升 20%（作为推演假设）。' }],
      objects: ['O-REG-MY', 'O-COM-MY', 'O-VAR-DURIAN'], relations: ['R-DU-01'] },

    { id: 'F-DU-08', cat: 'trade', date: '2026-09-12', level: 'province', region: '广东 · 广州', short: '竞争采购',
      lat: 23.13, lng: 113.26, cred: 'low', impact: 'mid', radius: 200, media: 'text', mediaNote: '市场访谈记录（待核）',
      title: '竞争市场加强榴莲采购，采购能力缺现实台账（标记待核）',
      summary: '广州江南等竞争市场提高采购报价与订单量；采购能力缺少现实数据，本推演按模拟参数处理。',
      evidence: [{ t: '市场访谈（待核）', k: '访谈', q: '竞争市场采购报价上调，订单量增加；台账缺失。' }],
      objects: ['O-MKT-GZ', 'O-COM-IMP', 'O-MET-DUSHR'], relations: ['R-DU-04', 'R-DU-08'] }
  ];

  /* ---------- 榴莲份额用户故事：新增本体对象（无坐标对象不显示为地图点） ---------- */
  const DURIAN_OBJECTS = [
    { id: 'O-REG-MY', domain: 'region', name: '马来西亚·彭亨劳勿产区', sub: '境外榴莲主产带',
      lat: 3.50, lng: 101.80, geo: true, props: [['品类', '猫山王 · 黑刺'], ['对湖南可供量', '+20%（推演假设）']] },
    { id: 'O-COM-IMP', domain: 'company', name: '湖南榴莲进口商', sub: '口岸到市场分拨主体',
      lat: 28.23, lng: 112.94, geo: true, props: [['角色', '采购与市场分配'], ['依赖', '口岸与冷链能力']] },
    { id: 'O-FAC-PORT', domain: 'facility', name: '黄花机场生鲜口岸', sub: '空运冷链通关与分拨',
      lat: 28.19, lng: 113.22, geo: true, props: [['能力', '冷链分拨利用率 87%'], ['时效', '48 小时直达']] },
    { id: 'O-FAC-RETAIL', domain: 'facility', name: '湖南零售渠道', sub: '商超与水果连锁',
      lat: 28.20, lng: 112.95, geo: true, props: [['行为', '按价格与库存补货'], ['关注', '动销与损耗']] },
    { id: 'O-MET-DUSHR', domain: 'metric', name: '榴莲份额指标', sub: '流入占比 · 市场份额',
      geo: false, props: [['口径', '交易量（吨）· 最近 30 天'], ['基线', '35% / 35%']] }
  ];

  const FACTS = [
    { id: 'F-CL-01', cat: 'trade', date: '2026-09-14', level: 'global', region: '智利 · 中部山谷', short: '智利',
      lat: -34.6, lng: -70.9, cred: 'high', impact: 'mid', radius: 260, media: 'video', mediaNote: '央视财经 · 产区走访 2:14',
      title: '智利车厘子对华出口节奏前移，首批到港较去年提前 11 天',
      summary: '中部山谷产区采收窗口前移，对华发运集中在 11 月下旬至 1 月；海运冷链柜量同比增约 18%。',
      evidence: [{ t: '海关跨境电商与生鲜进口月度统计', k: '统计', q: '车厘子月度进口折万吨：9 月 0.9 万吨，同比增长 18.4%。' },
                 { t: '智利水果出口商协会周报', k: '协会', q: '对华发运窗口前移 11 天，包船计划增加 3 班。' }],
      objects: ['O-REG-CL', 'O-VAR-CHERRY', 'O-MKT-SH', 'O-MKT-HX'], relations: ['R-01', 'R-07', 'R-19'] },

    { id: 'F-BR-02', cat: 'trade', date: '2026-09-08', level: 'global', region: '巴西 · 马托格罗索', short: '巴西',
      lat: -12.6, lng: -55.4, cred: 'high', impact: 'high', radius: 300, media: 'image', mediaNote: '产区装运照片 3 张',
      title: '巴西牛肉对华发运回升，牛前腱货源集中到港',
      summary: '马托格罗索州发运环比 +9%，牛前腱为对华主力部位；到港集中在上海、广州，再分销至内地一级市场。',
      evidence: [{ t: '出口商发运台账', k: '台账', q: '对华发运 6.2 万吨，环比 +9.1%；牛前腱占 27%。' }],
      objects: ['O-COM-BR', 'O-VAR-BEEF', 'O-REG-HN', 'O-MKT-HX'], relations: ['R-02', 'R-08'] },

    { id: 'F-MY-03', cat: 'logistics', date: '2026-08-27', level: 'global', region: '马来西亚 · 彭亨劳勿', short: '马来西亚',
      lat: 3.5, lng: 101.8, cred: 'mid', impact: 'mid', radius: 180, media: 'image', mediaNote: '专线开仓现场 2 张',
      title: '猫山王冷链空运专线恢复，48 小时直达长沙',
      summary: '彭亨劳勿至长沙空运冷链专线复飞，周 3 班；液氮冷冻整果与鲜果分仓处理。',
      evidence: [{ t: '物流承运方公告', k: '公告', q: '周 3 班，48 小时直达，损耗率降至 4.5%。' }],
      objects: ['O-COM-MY', 'O-VAR-DURIAN', 'O-FAC-CORRIDOR', 'O-MKT-HX'], relations: ['R-03', 'R-09', 'R-20'] },

    { id: 'F-CN-04', cat: 'policy', date: '2026-09-05', level: 'china', region: '北京', short: '全国',
      lat: 39.90, lng: 116.40, cred: 'high', impact: 'mid', radius: 420, media: 'text', mediaNote: '原文 + 条款摘录',
      title: '进口农产品检疫便利化措施落地，生鲜通关时效压缩',
      summary: '对生鲜类进口农产品实施“提前申报 + 到港直提”，平均通关时效由 38 小时降至 26 小时。',
      evidence: [{ t: '主管部门公告', k: '政策', q: '生鲜农产品到港直提，平均通关时效压缩 12 小时。' }],
      objects: ['O-AGY-MOF', 'O-VAR-CHERRY', 'O-VAR-BEEF', 'O-COM-BR'], relations: ['R-04', 'R-21'] },

    { id: 'F-CN-05', cat: 'weather', date: '2026-09-12', level: 'china', region: '广东 · 湛江', short: '华南',
      lat: 21.27, lng: 110.36, cred: 'high', impact: 'high', radius: 340, media: 'live', mediaNote: '港口作业直播流（公开）',
      title: '台风“海葵”外围环流影响华南港口作业，冷链柜压港',
      summary: '湛江、南沙港区 36 小时限作业，冷链柜平均压港 1.8 天，内陆分拨节奏整体后移。',
      evidence: [{ t: '港区作业通告', k: '通告', q: '限作业 36 小时，冷链柜压港 1.8 天。' },
                 { t: '物流商应急说明', k: '说明', q: '改走铁路冷链 12 柜，成本上浮 6%。' }],
      objects: ['O-REG-HN', 'O-FAC-CORRIDOR', 'O-MET-FREIGHT', 'O-MKT-HX'], relations: ['R-05', 'R-11', 'R-22'] },

    { id: 'F-CN-06', cat: 'trade', date: '2026-09-10', level: 'china', region: '山东 · 寿光', short: '山东',
      lat: 36.86, lng: 118.79, cred: 'high', impact: 'mid', radius: 300, media: 'image', mediaNote: '大棚与交易区 4 张',
      title: '寿光设施蔬菜在田面积稳定，日交易量维持 1.2 万吨级',
      summary: '秋茬黄瓜、番茄上市量环比 +7%，价格平稳；南菜北运尚未启动。',
      evidence: [{ t: '产区周报', k: '周报', q: '在田面积持平，日交易 1.2 万吨，环比 +7%。' }],
      objects: ['O-BASE-SG', 'O-VAR-VEG', 'O-MKT-SH'], relations: ['R-06', 'R-12'] },

    { id: 'F-CN-07', cat: 'price', date: '2026-09-02', level: 'china', region: '山东 · 菏泽', short: '菏泽',
      lat: 35.23, lng: 115.48, cred: 'mid', impact: 'mid', radius: 200, media: 'image', mediaNote: '收购点价牌 2 张',
      title: '大蒜收购价环比回落 6.2%，库存出货压力显现',
      summary: '冷库库存高于去年同期，收购价 3.9 元/kg；出口订单尚未集中释放。',
      evidence: [{ t: '产地收购台账', k: '台账', q: '收购价 3.9 元/kg，环比 -6.2%；冷库库存 +12%。' }],
      objects: ['O-BASE-SG', 'O-VAR-GARLIC', 'O-MET-PRICE'], relations: ['R-13'] },

    { id: 'F-CN-08', cat: 'logistics', date: '2026-08-29', level: 'china', region: '河南 · 郑州', short: '郑州',
      lat: 34.75, lng: 113.62, cred: 'mid', impact: 'mid', radius: 260, media: 'text', mediaNote: '指数周报摘录',
      title: '京港澳冷链干线运价指数上行 4.1%，回程货源偏紧',
      summary: '南下冷链车源紧张，郑州—长沙段运价上行，回程空驶率 31%。',
      evidence: [{ t: '冷链运价指数', k: '指数', q: '郑州—长沙段运价指数环比 +4.1%，回程空驶率 31%。' }],
      objects: ['O-FAC-CORRIDOR', 'O-MET-FREIGHT', 'O-COM-HN'], relations: ['R-14'] },

    { id: 'F-CN-09', cat: 'trade', date: '2026-08-25', level: 'china', region: '四川 · 眉山', short: '四川',
      lat: 30.05, lng: 103.85, cred: 'mid', impact: 'mid', radius: 220, media: 'image', mediaNote: '果园测产 3 张',
      title: '眉山柑橘丰产预期，11 月起进入集中供货窗口',
      summary: '春见与爱媛挂果率提升，预计产量 +11%；渠道预签比例低于去年。',
      evidence: [{ t: '产区测产记录', k: '测产', q: '挂果率 +9%，预计产量 +11%。' }],
      objects: ['O-BASE-MEISHAN', 'O-VAR-CITRUS', 'O-REG-HN'], relations: ['R-15'] },

    { id: 'F-HN-10', cat: 'policy', date: '2026-09-16', level: 'province', region: '湖南 · 长沙', short: '长沙',
      lat: 28.19, lng: 112.98, cred: 'high', impact: 'high', radius: 180, media: 'text', mediaNote: '细则原文 + 补贴表',
      title: '湖南水产养殖绿色补贴细则发布，设施化改造按投资额 30% 补贴',
      summary: '补贴覆盖循环水养殖、增氧与尾水处理设备；单场上限 120 万元，需在 11 月底前完成备案。',
      evidence: [{ t: '省农业农村厅实施细则', k: '政策', q: '按设备投资额 30% 补贴，单场上限 120 万元。' },
                 { t: '备案窗口说明', k: '说明', q: '备案截止 11 月 30 日，先备案先审。' }],
      objects: ['O-AGY-HN', 'O-BASE-DT', 'O-VAR-FISH', 'O-MET-SUBSIDY'], relations: ['R-10', 'R-16', 'R-17'] },

    { id: 'F-HN-11', cat: 'price', date: '2026-09-15', level: 'province', region: '湖南 · 长沙', short: '长沙',
      lat: 28.19, lng: 112.98, cred: 'high', impact: 'mid', radius: 150, media: 'image', mediaNote: '水产区价牌 4 张',
      title: '红星水产区黄颡鱼批发价周环比 +8.4%，到货量下滑',
      summary: '高温后成活率下降叠加需求回升，批发价 24.6 元/kg；周边市场价差扩大至 2.2 元/kg。',
      evidence: [{ t: '市场交易台账', k: '台账', q: '黄颡鱼批发价 24.6 元/kg，环比 +8.4%；到货量 -6%。' },
                 { t: '周边市场挂牌价', k: '市场', q: '周边一级市场均价 22.4 元/kg，价差 2.2 元/kg。' }],
      objects: ['O-MKT-HX', 'O-VAR-FISH', 'O-MET-PRICE', 'O-BASE-DT'], relations: ['R-17', 'R-18'] },

    { id: 'F-HN-12', cat: 'trade', date: '2026-09-11', level: 'province', region: '湖南 · 长沙', short: '长沙',
      lat: 28.19, lng: 112.98, cred: 'high', impact: 'mid', radius: 140, media: 'live', mediaNote: '交易区公开直播流',
      title: '红星大市场日到货量 1.86 万吨，来源地结构中东盟占比提升',
      summary: '东盟水果占比升至 21%；水产到货同比 -4%，价格支撑较强。',
      evidence: [{ t: '市场到货台账', k: '台账', q: '日到货 1.86 万吨；东盟水果占比 21%（去年 16%）。' }],
      objects: ['O-MKT-HX', 'O-REG-HN', 'O-COM-HN', 'O-VAR-DURIAN'], relations: ['R-09', 'R-19'] },

    { id: 'F-HN-13', cat: 'logistics', date: '2026-09-06', level: 'province', region: '湖南 · 岳阳', short: '岳阳',
      lat: 29.37, lng: 113.13, cred: 'high', impact: 'high', radius: 190, media: 'video', mediaNote: '投运现场 1:32',
      title: '城陵矶港冷链集散中心投运，江海联运保鲜柜直达洞庭湖区',
      summary: '新增 1.2 万吨冷库与 8 条分拨线，洞庭湖区水产与果蔬可当天回程；预计降低损耗 2 个百分点。',
      evidence: [{ t: '港口投运通报', k: '通报', q: '1.2 万吨冷库、8 条分拨线，损耗下降 2 个百分点。' }],
      objects: ['O-FAC-CLD', 'O-BASE-DT', 'O-COM-HN', 'O-MKT-HX'], relations: ['R-16', 'R-20'] },

    { id: 'F-HN-14', cat: 'weather', date: '2026-08-30', level: 'province', region: '湖南 · 常德', short: '常德',
      lat: 29.03, lng: 111.69, cred: 'mid', impact: 'mid', radius: 160, media: 'image', mediaNote: '塘口测温 2 张',
      title: '持续高温导致淡水鱼运输成活率下降，塘头压塘增加',
      summary: '连续 9 天最高气温 ≥36℃，运输成活率下降 6–9 个百分点；塘头存塘量被动累积。',
      evidence: [{ t: '养殖场记录', k: '台账', q: '运输成活率 91% → 83%，塘头存塘 +14%。' }],
      objects: ['O-BASE-DT', 'O-VAR-FISH', 'O-COM-HN'], relations: ['R-17'] },

    { id: 'F-HN-15', cat: 'policy', date: '2026-08-24', level: 'province', region: '湖南 · 长沙', short: '长沙',
      lat: 28.23, lng: 112.94, cred: 'mid', impact: 'mid', radius: 150, media: 'text', mediaNote: '目录条目摘录',
      title: '湖南省农机购置补贴目录调整，水产增氧设备纳入补贴范围',
      summary: '增氧机、投饵机单台补贴比例 25%，与绿色补贴可叠加申报（同一设备不重复计量）。',
      evidence: [{ t: '农机补贴目录', k: '目录', q: '增氧机单台补贴 25%，可与绿色补贴叠加申报。' }],
      objects: ['O-AGY-HN', 'O-BASE-DT', 'O-MET-SUBSIDY'], relations: ['R-16'] },

    { id: 'F-HN-16', cat: 'price', date: '2026-08-22', level: 'province', region: '湖南 · 湘潭', short: '湘潭',
      lat: 27.83, lng: 112.94, cred: 'mid', impact: 'mid', radius: 150, media: 'image', mediaNote: '出栏价牌 2 张',
      title: '生猪出栏价与白条价差走阔至 4.1 元/kg，屠宰端利润承压',
      summary: '出栏价 15.2 元/kg，白条批发 19.3 元/kg；价差为近 6 个月高位。',
      evidence: [{ t: '屠宰企业结算单', k: '结算', q: '出栏 15.2 元/kg，白条 19.3 元/kg，价差 4.1 元/kg。' }],
      objects: ['O-MET-PRICE', 'O-REG-HN', 'O-COM-HN'], relations: ['R-18'] },

    { id: 'F-HN-17', cat: 'trade', date: '2026-09-18', level: 'province', region: '湖南 · 长沙', short: '长沙',
      lat: 28.17, lng: 113.01, cred: 'low', impact: 'low', radius: 90, media: 'live', mediaNote: '商户自播 · 公开直播流',
      title: '红星水产交易区商户自播活跃，凌晨竞价场次增加',
      summary: '凌晨 2–5 点直播场次周环比 +23%，线上询价向线下成交转化约 18%（平台口径，待核）。',
      evidence: [{ t: '平台公开场次统计', k: '平台', q: '直播场次 +23%，询价转化 18%（口径待核）。' }],
      objects: ['O-MKT-HX', 'O-PER-BUYER', 'O-MET-PRICE'], relations: ['R-18'] }
  ].concat(DURIAN_FACTS);

  /* ---------- 本体对象：九类对象域（无坐标对象不显示为地图点） ---------- */
  const OBJECTS = [
    { id: 'O-MKT-HX', domain: 'market', name: '长沙·红星全球农批中心', sub: '一级农产品批发市场 · 集散枢纽',
      lat: 28.19, lng: 112.98, geo: true,
      props: [['角色', '湖南及中南区域集散枢纽'], ['日到货量', '1.86 万吨'], ['口径', '市场经营/交易台账']] },
    { id: 'O-MKT-SH', domain: 'market', name: '上海·辉展批发市场', sub: '进口水果一级批发',
      lat: 31.23, lng: 121.47, geo: true, props: [['定位', '进口水果首站分销'], ['主力', '车厘子 · 柑橘']] },
    { id: 'O-MKT-GZ', domain: 'market', name: '广州·江南果菜市场', sub: '华南一级批发',
      lat: 23.13, lng: 113.26, geo: true, props: [['定位', '华南果菜集散'], ['主力', '东盟水果']] },

    { id: 'O-COM-MY', domain: 'company', name: '彭亨劳勿猫山王出口商', sub: '马来西亚 · 种植+出口一体',
      lat: 3.50, lng: 101.80, geo: true, props: [['品类', '猫山王整果'], ['通道', '空运冷链 48 小时直达']] },
    { id: 'O-COM-BR', domain: 'company', name: '马托格罗索牛肉出口商', sub: '巴西 · 对华发运主体',
      lat: -12.60, lng: -55.40, geo: true, props: [['品类', '牛前腱 · 后腱'], ['对华占比', '61%']] },
    { id: 'O-COM-HN', domain: 'company', name: '湖南冷链运营服务商', sub: '干线+城配一体',
      lat: 28.20, lng: 112.90, geo: true, props: [['干线', '郑州—长沙 冷链'], ['回程空驶率', '31%']] },

    { id: 'O-BASE-SG', domain: 'base', name: '寿光设施蔬菜基地', sub: '山东 · 冬暖式大棚集群',
      lat: 36.86, lng: 118.79, geo: true, props: [['在田面积', '持平'], ['日交易量', '1.2 万吨级']] },
    { id: 'O-BASE-MEISHAN', domain: 'base', name: '眉山柑橘基地', sub: '四川 · 春见/爱媛',
      lat: 30.05, lng: 103.85, geo: true, props: [['预计产量', '+11%'], ['供货窗口', '11 月—次年 1 月']] },
    { id: 'O-BASE-DT', domain: 'base', name: '洞庭湖区水产养殖基地', sub: '湖南 · 设施化循环水',
      lat: 29.03, lng: 111.69, geo: true, props: [['主力', '黄颡鱼 · 鲈鱼'], ['改造需求', '增氧/尾水处理（补贴覆盖）']] },

    { id: 'O-VAR-CHERRY', domain: 'variety', name: '车厘子', sub: '进口鲜果 · 季节性',
      geo: false, props: [['主产季', '11 月—1 月（南半球）'], ['口径', '元/kg · 批发均价']] },
    { id: 'O-VAR-DURIAN', domain: 'variety', name: '猫山王榴莲', sub: '进口鲜果 · 高价值',
      geo: false, props: [['形态', '整果/液氮冷冻'], ['通道', '空运冷链']] },
    { id: 'O-VAR-BEEF', domain: 'variety', name: '牛肉·牛前腱', sub: '进口部位肉',
      geo: false, props: [['部位占比', '27%'], ['到港', '上海 · 广州']] },
    { id: 'O-VAR-FISH', domain: 'variety', name: '黄颡鱼', sub: '淡水鱼 · 湖南主养',
      geo: false, props: [['批发价', '24.6 元/kg'], ['到货量', '-6%（周环比）']] },
    { id: 'O-VAR-GARLIC', domain: 'variety', name: '大蒜', sub: '出口与内销双主',
      geo: false, props: [['收购价', '3.9 元/kg'], ['库存', '+12%（同比）']] },
    { id: 'O-VAR-VEG', domain: 'variety', name: '设施蔬菜（黄瓜/番茄）', sub: '秋茬主力',
      geo: false, props: [['上市量', '+7%（环比）'], ['价格', '平稳']] },
    { id: 'O-VAR-CITRUS', domain: 'variety', name: '柑橘（春见/爱媛）', sub: '国产主力水果',
      geo: false, props: [['预计产量', '+11%'], ['预签比例', '低于去年']] },

    { id: 'O-AGY-MOF', domain: 'agency', name: '海关与商务主管部门', sub: '通关与贸易便利化',
      geo: false, props: [['措施', '提前申报 + 到港直提'], ['时效', '38h → 26h']] },
    { id: 'O-AGY-HN', domain: 'agency', name: '湖南省农业农村厅', sub: '省市两级政策发布主体',
      geo: false, props: [['政策', '绿色养殖补贴 · 农机补贴'], ['窗口', '备案截止 11-30']] },

    { id: 'O-REG-CL', domain: 'region', name: '智利中部山谷产区', sub: '南美 · 车厘子主产带',
      lat: -34.60, lng: -70.90, geo: true, props: [['窗口', '前移 11 天'], ['对华发运', '+18.4%']] },
    { id: 'O-REG-HN', domain: 'region', name: '湖南（集散与消费区）', sub: '省域 · 中南枢纽',
      lat: 28.10, lng: 112.90, geo: true, props: [['角色', '进口与省际货流集散'], ['消费', '城市群消费主力']] },

    { id: 'O-PER-BUYER', domain: 'person', name: '水产区采购经理（角色）', sub: '市场采购决策角色',
      geo: false, props: [['职责', '凌晨竞价 · 到货验收'], ['关注', '成活率 · 价差']] },

    { id: 'O-MET-PRICE', domain: 'metric', name: '农产品批发价格指数', sub: '元/kg · 折算口径',
      geo: false, props: [['口径', '批发均价，按品类归并'], ['周期', '周度']] },
    { id: 'O-MET-FREIGHT', domain: 'metric', name: '冷链干线运价指数', sub: '指数 · 周度',
      geo: false, props: [['口径', '干线整车折算'], ['周环比', '+4.1%']] },
    { id: 'O-MET-SUBSIDY', domain: 'metric', name: '绿色养殖补贴额度', sub: '万元 · 备案口径',
      geo: false, props: [['比例', '投资额 30%'], ['上限', '120 万元/场']] },

    { id: 'O-FAC-CLD', domain: 'facility', name: '城陵矶港冷链集散中心', sub: '江海联运 · 冷库 1.2 万吨',
      lat: 29.37, lng: 113.13, geo: true, props: [['冷库', '1.2 万吨'], ['分拨线', '8 条']] },
    { id: 'O-FAC-CORRIDOR', domain: 'facility', name: '京港澳冷链干线（郑州节点）', sub: '干线运力通道',
      lat: 34.75, lng: 113.62, geo: true, props: [['路径', '郑州 → 长沙'], ['运价指数', '+4.1%']] }
  ].concat(DURIAN_OBJECTS);

  const DURIAN_RELATIONS = [

    { id: 'R-DU-01', from: 'O-REG-MY', to: 'O-COM-MY', type: '产区供给', strength: 0.88, confidence: 0.84, formed: '2026-05',
      changedBy: 'F-DU-07', factIds: ['F-DU-07', 'F-DU-01'], note: '彭亨劳勿产季增产直接改变对湖南可供量；「+20%」为用户假设。' },
    { id: 'R-DU-02', from: 'O-COM-IMP', to: 'O-MKT-HX', type: '供应流向', strength: 0.83, confidence: 0.78, formed: '2026-06',
      changedBy: 'F-DU-02', factIds: ['F-DU-02', 'F-DU-01'], note: '进口商向红星分配货量，决定流入占比的分子。' },
    { id: 'R-DU-03', from: 'O-FAC-PORT', to: 'O-COM-IMP', type: '设施服务', strength: 0.71, confidence: 0.69, formed: '2026-06',
      changedBy: 'F-DU-06', factIds: ['F-DU-06'], note: '口岸冷链能力约束进口商可分配上限。' },
    { id: 'R-DU-04', from: 'O-COM-IMP', to: 'O-MKT-GZ', type: '供应流向', strength: 0.66, confidence: 0.58, formed: '2026-07',
      changedBy: 'F-DU-08', factIds: ['F-DU-08', 'F-DU-03'], note: '竞争市场加价采购分流；该关系支撑材料可信度低，标记待观察。' },
    { id: 'R-DU-05', from: 'O-VAR-DURIAN', to: 'O-MET-PRICE', type: '价格构成', strength: 0.77, confidence: 0.8, formed: '2026-05',
      changedBy: 'F-DU-05', factIds: ['F-DU-05'], note: '供应增加经该关系传导至批发价。' },
    { id: 'R-DU-06', from: 'O-FAC-RETAIL', to: 'O-MKT-HX', type: '渠道关系', strength: 0.62, confidence: 0.6, formed: '2026-08',
      changedBy: 'F-DU-03', factIds: ['F-DU-03'], note: '零售渠道补货节奏影响红星交易量。' },
    { id: 'R-DU-07', from: 'O-MKT-HX', to: 'O-VAR-DURIAN', type: '价格发现', strength: 0.8, confidence: 0.76, formed: '2026-05',
      changedBy: 'F-DU-04', factIds: ['F-DU-04', 'F-DU-05'], note: '红星竞价形成区域参考价，促销与锁量影响份额。' },
    { id: 'R-DU-08', from: 'O-MKT-GZ', to: 'O-MET-DUSHR', type: '份额分流', strength: 0.64, confidence: 0.52, formed: '2026-08',
      changedBy: 'F-DU-08', factIds: ['F-DU-08'], note: '竞争市场采购强度是红星份额下降的主要解释变量（置信度偏低）。' }
  ];

  /* ---------- 关系：强度 / 置信度 / 形成时间 / 最近由哪条事实改变 / 支撑事实 ---------- */
  const RELATIONS = [
    { id: 'R-01', from: 'O-REG-CL', to: 'O-VAR-CHERRY', type: '产区供给', strength: 0.86, confidence: 0.81, formed: '2026-04',
      changedBy: 'F-CL-01', factIds: ['F-CL-01'], note: '中部山谷为对华主力供给带；采收窗口前移直接改变供给节奏。' },
    { id: 'R-02', from: 'O-COM-BR', to: 'O-VAR-BEEF', type: '经营主体主营', strength: 0.91, confidence: 0.88, formed: '2026-01',
      changedBy: 'F-BR-02', factIds: ['F-BR-02'], note: '出口商主营牛前腱，对华发运回升强化该关系。' },
    { id: 'R-03', from: 'O-COM-MY', to: 'O-VAR-DURIAN', type: '基地—品种', strength: 0.9, confidence: 0.9, formed: '2025-11',
      changedBy: 'F-MY-03', factIds: ['F-MY-03'], note: '劳勿产区主供猫山王；专线复飞提高供给稳定性。' },
    { id: 'R-04', from: 'O-AGY-MOF', to: 'O-VAR-CHERRY', type: '政策影响', strength: 0.62, confidence: 0.7, formed: '2026-09',
      changedBy: 'F-CN-04', factIds: ['F-CN-04'], note: '通关便利化缩短在途时间，对鲜果损耗敏感。' },
    { id: 'R-05', from: 'O-MET-FREIGHT', to: 'O-FAC-CORRIDOR', type: '指标度量', strength: 0.78, confidence: 0.83, formed: '2026-03',
      changedBy: 'F-CN-05', factIds: ['F-CN-05', 'F-CN-08'], note: '台风压港与回程空驶共同推高干线运价指数。' },
    { id: 'R-06', from: 'O-BASE-SG', to: 'O-MKT-SH', type: '供应流向', strength: 0.74, confidence: 0.69, formed: '2025-09',
      changedBy: 'F-CN-06', factIds: ['F-CN-06'], note: '设施蔬菜在田稳定，向长三角稳定供货。' },
    { id: 'R-07', from: 'O-REG-CL', to: 'O-MKT-SH', type: '进口直达', strength: 0.68, confidence: 0.64, formed: '2025-12',
      changedBy: 'F-CL-01', factIds: ['F-CL-01'], note: '首站分销市场，再向内地一级市场分销。' },
    { id: 'R-08', from: 'O-COM-BR', to: 'O-MKT-HX', type: '供应流向', strength: 0.55, confidence: 0.58, formed: '2026-02',
      changedBy: 'F-BR-02', factIds: ['F-BR-02'], note: '经上海/广州再分拨至红星，链路长、价格传导慢。' },
    { id: 'R-09', from: 'O-COM-MY', to: 'O-MKT-HX', type: '供应流向', strength: 0.81, confidence: 0.76, formed: '2026-05',
      changedBy: 'F-HN-12', factIds: ['F-HN-12', 'F-MY-03'], note: '东盟水果占比提升，红星为主要落地市场之一。' },
    { id: 'R-10', from: 'O-AGY-HN', to: 'O-BASE-DT', type: '政策影响', strength: 0.72, confidence: 0.85, formed: '2026-08',
      changedBy: 'F-HN-10', factIds: ['F-HN-10', 'F-HN-15'], note: '补贴与农机目录叠加，直接指向设施化改造。' },
    { id: 'R-11', from: 'O-FAC-CORRIDOR', to: 'O-FAC-CLD', type: '通道衔接', strength: 0.66, confidence: 0.61, formed: '2026-09',
      changedBy: 'F-HN-13', factIds: ['F-HN-13', 'F-CN-05'], note: '港口投运后，干线冷链可与江海联运衔接。' },
    { id: 'R-12', from: 'O-BASE-SG', to: 'O-VAR-VEG', type: '基地—品种', strength: 0.88, confidence: 0.86, formed: '2025-09',
      changedBy: 'F-CN-06', factIds: ['F-CN-06'], note: '棚型与茬口决定品种结构。' },
    { id: 'R-13', from: 'O-VAR-GARLIC', to: 'O-MET-PRICE', type: '价格构成', strength: 0.7, confidence: 0.75, formed: '2026-06',
      changedBy: 'F-CN-07', factIds: ['F-CN-07'], note: '库存压力通过收购价传导至指数。' },
    { id: 'R-14', from: 'O-COM-HN', to: 'O-MET-FREIGHT', type: '指标度量', strength: 0.64, confidence: 0.72, formed: '2026-04',
      changedBy: 'F-CN-08', factIds: ['F-CN-08'], note: '运力方的报价行为构成指数样本。' },
    { id: 'R-15', from: 'O-BASE-MEISHAN', to: 'O-REG-HN', type: '供应流向', strength: 0.52, confidence: 0.5, formed: '2026-08',
      changedBy: 'F-CN-09', factIds: ['F-CN-09'], note: '丰产预期下，湖南为潜在增供方向（置信度偏低）。' },
    { id: 'R-16', from: 'O-FAC-CLD', to: 'O-BASE-DT', type: '设施服务', strength: 0.7, confidence: 0.68, formed: '2026-09',
      changedBy: 'F-HN-13', factIds: ['F-HN-13', 'F-HN-10'], note: '冷库与分拨线缩短塘头到市场的时间。' },
    { id: 'R-17', from: 'O-BASE-DT', to: 'O-VAR-FISH', type: '基地—品种', strength: 0.84, confidence: 0.8, formed: '2025-10',
      changedBy: 'F-HN-11', factIds: ['F-HN-11', 'F-HN-14'], note: '高温成活率下降直接压低到货量、抬高价格。' },
    { id: 'R-18', from: 'O-VAR-FISH', to: 'O-MET-PRICE', type: '价格构成', strength: 0.76, confidence: 0.79, formed: '2026-07',
      changedBy: 'F-HN-11', factIds: ['F-HN-11', 'F-HN-16'], note: '水产价格与生猪价差共同影响替代品结构。' },
    { id: 'R-19', from: 'O-REG-HN', to: 'O-MKT-HX', type: '集散关系', strength: 0.9, confidence: 0.87, formed: '2025-06',
      changedBy: 'F-HN-12', factIds: ['F-HN-12', 'F-CL-01'], note: '省域集散角色由红星到货结构体现。' },
    { id: 'R-20', from: 'O-FAC-CLD', to: 'O-MKT-HX', type: '设施服务', strength: 0.6, confidence: 0.57, formed: '2026-09',
      changedBy: 'F-HN-13', factIds: ['F-HN-13', 'F-MY-03'], note: '江海联运可承接部分进口货量，替代部分空运（推断）。' },
    { id: 'R-21', from: 'O-AGY-MOF', to: 'O-COM-BR', type: '政策影响', strength: 0.58, confidence: 0.62, formed: '2026-09',
      changedBy: 'F-CN-04', factIds: ['F-CN-04'], note: '通关时效压缩降低出口商到港成本。' },
    { id: 'R-22', from: 'O-PER-BUYER', to: 'O-MKT-HX', type: '角色职责', strength: 0.47, confidence: 0.44, formed: '2026-09',
      changedBy: 'F-HN-17', factIds: ['F-HN-17'], note: '角色行为来自平台公开场次，口径待核，置信度低。' },
    { id: 'R-23', from: 'O-MET-SUBSIDY', to: 'O-BASE-DT', type: '指标度量', strength: 0.66, confidence: 0.8, formed: '2026-08',
      changedBy: 'F-HN-10', factIds: ['F-HN-10', 'F-HN-15'], note: '补贴额度决定改造是否落地。' },
    { id: 'R-24', from: 'O-MKT-HX', to: 'O-VAR-FISH', type: '价格发现', strength: 0.79, confidence: 0.74, formed: '2026-06',
      changedBy: 'F-HN-11', factIds: ['F-HN-11', 'F-HN-17'], note: '批发市场竞价形成区域参考价。' }
  ].concat(DURIAN_RELATIONS);

  /* ---------- 底部流水：事实层「数据接入与处理」/ 关联层「本体抽离与关联处理」 ---------- */
  const STREAM = {
    fact: [
      ['接入', '海关月度统计入库 · 车厘子 9 月 0.9 万吨', 'F-CL-01'],
      ['解析', 'OCR 识别收购点价牌 → 结构化字段 6 个', 'F-CN-07'],
      ['接入', '港区作业通告抓取 · 限作业 36 小时', 'F-CN-05'],
      ['去重', '同源公告 2 条合并（相似度 0.94）', 'F-CN-04'],
      ['抽取', '时间/区域/品类 三元组写入事实索引', 'F-HN-11'],
      ['标定', '置信度评估：官方公告 → 高可信', 'F-HN-10'],
      ['影响', '影响范围估算完成 · 半径 180km', 'F-HN-10'],
      ['接入', '运输成活率台账（养殖场）字段映射完成', 'F-HN-14'],
      ['告警', '台风路径更新 → 关联物流事实重新评分', 'F-CN-05'],
      ['接入', '市场到货台账 1.86 万吨 · 来源地结构更新', 'F-HN-12'],
      ['转写', '公开直播流语音转写完成 · 转写置信度 0.71', 'F-HN-17'],
      ['抽取', '价格指数周度序列对齐（口径：批发均价）', 'F-HN-11'],
      ['挂账', '待核口径标记 1 条（平台场次统计）', 'F-HN-17'],
      ['入库', '本批 17 条事实写入完成 · 口径与来源字段齐备', null]
    ],
    relation: [
      ['抽离', '本体识别：市场 / 公司 / 基地 12 个', 'F-HN-12'],
      ['抽离', '无坐标实体 8 个（品种 / 指标 / 政策机构 / 角色）', 'F-HN-11'],
      ['关系', '建立「基地—品种」关系 3 条 · 规则命中', 'F-HN-10'],
      ['打分', 'R-10 强度 0.72 · 置信度 0.85（政策直连）', 'F-HN-10'],
      ['回溯', 'R-17 支撑事实 2 条 · 最近变更 F-HN-11', 'F-HN-11'],
      ['降级', 'R-15 置信度 0.50 低于阈值 → 标记待观察', 'F-CN-09'],
      ['关系', '「供应流向」新增 4 条 · 需事实支撑', 'F-MY-03'],
      ['打分', 'R-05 因台风事实变更，强度上调 0.06', 'F-CN-05'],
      ['抽离', '角色实体识别：采购经理（来自公开直播）', 'F-HN-17'],
      ['降级', 'R-22 置信度 0.44 < 0.5 → 不进入推演种子', 'F-HN-17'],
      ['社区', '社区摘要更新：湖南水产板块 9 实体', 'F-HN-14'],
      ['时序', '时序记忆写入：价格—到货量 4 周序列', 'F-HN-11'],
      ['校验', '本体一致性检查通过 · 冲突 0 条', null],
      ['入库', '本批 24 条关系写入完成 · 人工审核入口不开放', null]
    ]
  };

  /* ============================================================
     数据来源标识（内部识别用，不在普通界面暴露）
       public      真实公开可查证：产区 / 港口 / 机场的经纬度与品类定位
       curated     人工编写的场景事实：题录方向来自公开报道，数值为演示口径
       synthesized 按 schema 补齐生成：由 src/v03/atlas-data.js 提供
     验收方式：window.V03_DEBUG.provSummary() 与 docs/V04-指令映射与验收.md
     ============================================================ */
  const BASE_FACTS = FACTS.slice();
  const BASE_OBJECTS = OBJECTS.slice();
  const BASE_RELATIONS = RELATIONS.slice();
  BASE_FACTS.forEach(f => { if (!f.prov) f.prov = 'curated'; });
  BASE_OBJECTS.forEach(o => { if (!o.prov) o.prov = 'curated'; });
  BASE_RELATIONS.forEach(r => { if (!r.prov) r.prov = 'curated'; });

  /* 数据包（产区 / 港口机场 / 密集事实与本体）—— 缺失时页面仍可运行 */
  const ATLAS = window.V03Atlas || { REGIONS: [], GATES: [], PACK: { facts: [], objects: [], relations: [] } };
  const REGIONS = (ATLAS.REGIONS || []).map(r => { if (!r.prov) r.prov = 'public'; return r; });
  const GATES = (ATLAS.GATES || []).map(g => { if (!g.prov) g.prov = 'public'; return g; });
  const PACK = ATLAS.PACK || { facts: [], objects: [], relations: [] };
  /* 数据包产出的事实 / 本体 / 关系：一律标记为「按 schema 补齐生成」（口径统一，不随数据包自身声明浮动）；
     数据包只负责提供真实地理锚点（REGIONS / GATES 的经纬度），事实与本体仍属生成内容。 */
  (PACK.facts || []).forEach(f => { f.prov = 'synthesized'; });
  (PACK.objects || []).forEach(o => { o.prov = 'synthesized'; });
  (PACK.relations || []).forEach(r => { r.prov = 'synthesized'; });

  /* 产区 / 口岸与本体对象互相挂接：点地图标记即可打开对应本体详情 */
  REGIONS.forEach(r => {
    const obj = (PACK.objects || []).concat(BASE_OBJECTS).find(o => o.lat != null && Math.abs(o.lat - r.lat) < .35 && Math.abs(o.lng - r.lng) < .35 && o.domain !== 'facility');
    r.objId = r.objId || (obj ? obj.id : null);
  });
  GATES.forEach(g => {
    const obj = (PACK.objects || []).concat(BASE_OBJECTS).find(o => o.lat != null && Math.abs(o.lat - g.lat) < .35 && Math.abs(o.lng - g.lng) < .35);
    g.objId = g.objId || (obj ? obj.id : null);
  });

  const ALL_FACTS = BASE_FACTS.concat(PACK.facts || []);
  const ALL_OBJECTS = BASE_OBJECTS.concat(PACK.objects || []);
  const ALL_RELATIONS = BASE_RELATIONS.concat(PACK.relations || []);

  const idx = arr => arr.reduce((m, x) => (m[x.id] = x, m), {});
  const F = idx(ALL_FACTS), O = idx(ALL_OBJECTS), R = idx(ALL_RELATIONS);

  return {
    TODAY, CATS, DOMAINS, PROV_CENTER, CHINA_BOX, FACTS: ALL_FACTS, OBJECTS: ALL_OBJECTS, RELATIONS: ALL_RELATIONS, STREAM,
    REGIONS, GATES, PACK,
    factById: id => F[id] || null,
    objById: id => O[id] || null,
    relById: id => R[id] || null,
    domain: id => DOMAINS.find(d => d.id === id) || DOMAINS[0],
    /* 事实 → 相关对象/关系；对象/关系 → 支撑事实 */
    factsOfObject: id => ALL_FACTS.filter(f => (f.objects || []).includes(id)),
    factsOfRelation: id => ALL_FACTS.filter(f => (f.relations || []).includes(id)),
    relationsOf: id => ALL_RELATIONS.filter(r => r.from === id || r.to === id),
    factsFor: ids => (ids || []).map(i => F[i]).filter(Boolean),
    /* 一组事实里最近的日期（左侧菜单「最近更新时间」用） */
    latestDate: list => ((list || []).map(f => f.date).sort().pop()) || null,
    /* 相对时间窗口 */
    inWindow: (date, win) => {
      if (win === 'all') return true;
      const days = { '7d': 7, '30d': 30, '90d': 90 }[win] || 90;
      const t = Date.parse(date + 'T00:00:00Z'), now = Date.parse(TODAY + 'T00:00:00Z');
      return (now - t) / 86400000 <= days;
    }
  };
})();
