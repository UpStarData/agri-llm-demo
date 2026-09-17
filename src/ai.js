/* ============================================================
   AI 分析助手 —— 绑定「当前选中对象」，同一问题在不同对象上答案不同
   能力边界：分析 / 推演全部基于示意数据，输出标注「示意 / 待标定」
   ============================================================ */
window.AGRI_AI = (function () {
  const D = () => window.AGRI_DATA;

  /* -------- 每个对象各自的预设问题 -------- */
  function presets(o) {
    if (!o) return [{ q: '先选一个数据对象', a: '' }];
    switch (o.type) {
      case 'flow': return [{ q: '这条流向的量级与节奏？' }, { q: '对国内同品类价格的传导？' }, { q: '运价 / 汇率变动会影响多少？' }];
      case 'market': return [{ q: '这个市场的到货结构？' }, { q: '与国内产区货源如何竞争？' }];
      case 'prov': return [{ q: '这个产区的供需缺口？' }, { q: '调出结构集中在哪？' }, { q: '竞争力短板在哪？' }];
      case 'pline': return [{ q: '这条调运线稳不稳定？' }, { q: '这条线的价差与风险？' }];
      case 'city': return [{ q: '这个产区的单品竞争力？' }, { q: '链条最卡在哪一段？' }, { q: '未来 6–12 个月的判断？' }];
      case 'stage': return [{ q: '这个环节的成本与风险？' }, { q: '这个环节的规模上限在哪？' }];
      case 'entity': return [{ q: '这个主体的量价存情况？' }, { q: '它的客户流向说明什么？' }];
      case 'chain': return [{ q: '这条链路最贵的一段在哪？' }, { q: '哪个环节是卡点？' }, { q: '6–12 个月的价格判断？' }];
    }
    return [{ q: '分析当前对象' }];
  }

  /* -------- 应答主体 -------- */
  function askCore(o, q) {
    if (!o) return { a: '**尚未选中对象**\n\n在左侧点击一个数据对象（贸易弧、国家节点、省份气泡、调运线、城市节点、环节卡片），我会基于这个对象回答——回答内容随对象变化。\n\n口径：全部为示意数据 · 待标定。', tags: ['示意 · 待标定'] };
    const d = D(), P = d.PERIOD, tag = ['示意 · 待标定'];
    const head = `**${o.label}** ｜ 周期 ${P} ｜ 口径：${o.cal || '示意'}`;

    if (o.type === 'flow') {
      const f = o.raw;
      if (/节奏|量级|规模|多少/.test(q)) return { a: `${head}\n\n- 年进口量 **${f.vol} 万吨**（示意），同比 **${f.yoy > 0 ? '+' : ''}${f.yoy}%**，环比 ${f.mom > 0 ? '+' : ''}${f.mom}%。\n- 品类：${f.item}（${d.CATN[f.cat]}）；入境方式 ${f.mode}，主要口岸 ${f.port}。\n- 节奏：${peak(f.months)} 为年内高峰，与国内同季品类形成直接竞争。\n- 口径：${d.cal.trade}。`, tags: tag };
      if (/价格|传导|影响/.test(q)) return { a: `${head}\n\n- 传导链：到岸价 → 一级批发价 → 二级市场 → 零售；该来源国在国内同品类进口里约占 **${f.vol} 万吨/年** 的量级（示意）。\n- 假设人民币贬值 3%：到岸成本约 +2.8%，一级批发价 +2%~3%（时滞 1–2 个月）；若同期国内产区集中上市，传导比例会降到 40% 以下。\n- 受益 / 受损：${f.client} 的采购成本上升；国产同季替代品（如 ${altCat(f.cat)}）短期放量。\n- 口径：${d.cal.trade}。`, tags: tag };
      if (/运价|汇率|油价|成本/.test(q)) return { a: `${head}\n\n- 该流向全程 ${f.mode}；运价敏感度：油价 +20% → 到货成本约 +3.5%（长运距）至 +1.2%（短运距）。\n- 汇率 +3%（人民币贬值）：进口成本 +2.8%。\n- 缓冲能力：${f.item} 的毛利空间决定能否吸收，反季高价值品类缓冲更强。\n- 口径：${d.cal.trade}。`, tags: tag };
      return { a: `${head}\n\n- 关键事实（示意）：年量 ${f.vol} 万吨，同比 ${f.yoy > 0 ? '+' : ''}${f.yoy}%，主打 ${f.item}。\n- 建议追问：量级节奏 / 价格传导 / 运价汇率敏感度。\n- 口径：${d.cal.trade}。`, tags: tag };
    }

    if (o.type === 'market') {
      const f = o.raw;
      return { a: `${head}\n\n- 进口直达量 **${f.vol} 万吨**（示意），来自 ${f.country}（${f.item}），同比 +${f.yoy}%。\n- 结构含义：该市场约 ${Math.min(60, 20 + f.vol)}% 的高值果品来自进口直达，其余靠国内产区（见 L2 调运线）。\n- 风险：进口直达量越集中，通关或运价波动越会直接放大到终端价。\n- 口径：${d.cal.market}。`, tags: tag };
    }

    if (o.type === 'prov') {
      const p = o.raw, name = o.label;
      const flows = d.interProv.filter(x => x.from === name || x.to === name);
      if (/缺口|供需|供给/.test(q)) return { a: `${head}\n\n- 供给规模指数 **${p.supply}**（示意），本省调出约 ${(p.out / 10).toFixed(1)} 十万吨、调入约 ${(p.in / 10).toFixed(1)} 十万吨。\n- 结构：主导品类 ${d.CATN[p.cat]}；${p.feature}。\n- 缺口判断：${p.out > p.in ? '供给外溢型——价格由主销区（华南 / 华东）需求节奏主导' : '净调入型——本地供给缺口靠外省与进口补足'}。\n- 口径：${d.cal.supply}。`, tags: tag };
      if (/调出|结构|流向|流通/.test(q)) {
        const outs = d.interProv.filter(x => x.from === name).sort((a, b) => b.vol - a.vol);
        const list = outs.slice(0, 3).map(x => `  - ${x.from} → ${x.to}：${x.vol} 万吨（${x.item}，同比 ${x.yoy > 0 ? '+' : ''}${x.yoy}%）`).join('\n');
        const share = outs.length ? Math.round(outs.slice(0, 3).reduce((a, b) => a + b.vol, 0) / outs.reduce((a, b) => a + b.vol, 0) * 100) : 0;
        return { a: `${head}\n\n- 量级最大的流向（示意）：\n${list || '  - 该省以调入为主，暂无标注调出线'}\n- 集中度：前 3 条占该省已标注调出量的约 ${share}%。\n- 含义：主销区需求收缩会沿这几条线快速回传到田头价。\n- 口径：${d.cal.inter}。`, tags: tag };
      }
      if (/竞争|短板|优势/.test(q)) {
        const c = worstDim(p);
        return { a: `${head}\n\n- 省内头部产区竞争力（示意）：${Object.entries(p.cities[0].comp).map(([k, v]) => `${k} ${v}`).join(' / ')}。\n- 短板维度：**${c}**（省均值偏低），直接限制溢价能力。\n- 提升路径：投入产出比最高的是 ${c === '冷链' ? '产地预冷与分选能力' : c === '成本' ? '规模化与机械替代' : '标准化与品牌渠道'}。\n- 口径：竞争力为示意评分（0–100），待标定。`, tags: tag };
      }
      return { a: `${head}\n\n- 供给规模指数 ${p.supply}，主导品类 ${d.CATN[p.cat]}，省内 ${p.cities.length} 个重点产区，标注流向 ${flows.length} 条。\n- 建议追问：供需缺口 / 调出结构 / 竞争力短板。\n- 口径：${d.cal.supply}。`, tags: tag };
    }

    if (o.type === 'pline') {
      const f = o.raw;
      return { a: `${head}\n\n- 调运量 **${f.vol} 万吨**（示意），品类 ${f.item}，同比 ${f.yoy > 0 ? '+' : ''}${f.yoy}%。\n- 稳定性：${f.vol >= 30 ? '干线级（多承运商 + 常态班期），中断风险低' : '专线级（承运商集中），雨季 / 节前运力紧张时会掉量'}。\n- 风险：到货集中期若与主销区本地货源重叠，容易形成价格踩踏。\n- 口径：${d.cal.inter}。`, tags: tag };
    }

    if (o.type === 'city') {
      const c = o.raw, ch = d.chains[c.name];
      if (/竞争力|优势/.test(q)) return { a: `${head}\n\n- 五维竞争力（示意）：${Object.entries(c.comp).map(([k, v]) => `${k} ${v}`).join(' / ')}。\n- 定位：${c.lead}；${c.feature}。\n- 短板：**${worstDim(c)}**，是溢价能力和规模扩张的主要约束。\n- 口径：竞争力为示意评分（0–100），待标定。`, tags: tag };
      if (/卡|瓶颈|环节|链路/.test(q)) {
        if (ch) {
          const weak = ch.stages.reduce((a, b) => (riskScore(b) > riskScore(a) ? b : a));
          return { a: `${head}\n\n- 代表单品 **${ch.product}**（${ch.season}）最卡的一段是 **${weak.name}**：${weak.risk}。\n- 链条判断：${ch.headline}\n- 口径：${d.cal.chain}。`, tags: tag };
        }
        return { a: `${head}\n\n- 该产区以产区级指标为主（外调 ${c.out} 万吨，示意）；代表单品链路待标定。\n- 通用卡点判断：先看采后预冷与冷链率，再看批发层级与分选标准。\n- 口径：${d.cal.supply}。`, tags: tag };
      }
      if (/趋势|判断|半年|一年|12|6/.test(q)) {
        return { a: `${head}\n\n- 6–12 个月方向性判断（示意推演）：\n  - 供给端：${c.main} 若维持当前扩种节奏，供给 +5%~9%，集中上市期价格承压。\n  - 需求端：商超 / 电商对品相与规格一致性的要求继续提升，精品分级件溢价拉大。\n  - 关键变量：${worstDim(c) === '冷链' ? '产地预冷能力（决定损耗与商品率）' : '运输半径与运价（决定到货成本）'}。\n- 口径：基于示意数据的推演，为方向性判断，非预测。`, tags: tag };
      }
      return { a: `${head}\n\n- 主导品类 **${c.main}**，外调 ${c.out} 万吨（示意），定位：${c.lead}。\n- 建议追问：单品竞争力 / 链条卡点 / 6–12 个月判断。\n- 口径：${d.cal.supply}。`, tags: tag };
    }

    if (o.type === 'stage') {
      const s = o.raw;
      return { a: `${head}\n\n- 规模：${s.scale}\n- 成本 / 价格：${s.cost} ｜ ${s.price}\n- 风险敞口：${s.risk}\n- 环节判断：本环节风险属于「${riskScore(s) >= 2 ? '结构性（需要投资或政策）' : '运营性（可管理）'}」，对整链价格的敏感度${riskScore(s) >= 2 ? '较高' : '中等'}。\n- 口径：${d.cal.chain}。`, tags: tag };
    }

    if (o.type === 'entity') {
      const e = o.raw;
      return { a: `${head}\n\n- 主体类型：${e.t}；规模 ${e.v}；价格 / 费用 ${e.p}。\n- 客户流向：${e.c} —— 决定了它在链条中的议价位置。\n- 判断：该主体的集中度变化会直接改变相邻环节的价差分配（示意）。\n- 口径：${d.cal.chain}。`, tags: tag };
    }

    if (o.type === 'chain') {
      const ch = o.raw;
      let maxStep = { r: 0, from: '', to: '' };
      ch.price.forEach((p, i) => { if (!i) return; const r = p.v / ch.price[i - 1].v; if (r > maxStep.r) maxStep = { r, from: ch.price[i - 1].k, to: p.k }; });
      const worst = ch.stages.reduce((a, b) => (riskScore(b) > riskScore(a) ? b : a));
      return { a: `${head}\n\n- 价格链路（示意）：${ch.price.map(p => `${p.k} ${p.v} 元/kg`).join(' → ')}。\n- 加价最大的一段：**${maxStep.from} → ${maxStep.to}（×${maxStep.r.toFixed(2)}）**。\n- 最卡环节：**${worst.name}** —— ${worst.risk}\n- 口径：${d.cal.price}（元·kg，单季均值，示意）。`, tags: tag };
    }
    return { a: `${head}\n\n- 已识别对象，请选择预设问题或直接提问（如「油价涨 20% 会怎样」）。\n- 口径：示意。`, tags: tag };
  }

  /* -------- 自由提问：关键词 → 对象化推演 -------- */
  function freeCore(o, q) {
    const d = D();
    const name = o ? o.label : '当前对象';
    const base = `**${name}** ｜ 自由提问 ｜ 周期 ${d.PERIOD}`;
    const drv = d.drivers.find(x => q.includes(x.k));
    if (drv) {
      const l1 = drv.chains[0];
      const hit = o && l1.tags.some(t => o.label.includes(t.split('·')[1] || t) || o.label.includes(t.split('·')[0]));
      return { a: `${base}\n\n- 推演变量：${drv.k} ${drv.p}，传导时滞 ${drv.lag}。\n- 传导路径：${l1.path}\n- 影响量级：${l1.impact}\n- 涉及对象：${l1.tags.join('、')}${hit ? `（含当前选中对象 ${name}）` : ''}。\n- 口径：方向性示意推演，非预测；变量参数待标定。`, tags: ['推演 · 示意'] };
    }
    if (/油价|汇率|天气|政策|补贴|扩种|地缘/.test(q)) {
      const drv2 = d.drivers.find(x => q.includes(x.k)) || d.drivers[0];
      return { a: `${base}\n\n- 已匹配关联变量「${drv2.k} ${drv2.p}」，传导时滞 ${drv2.lag}。\n- 传导路径：${drv2.chains[0].path}\n- 影响：${drv2.chains[0].impact}\n- 口径：示意推演，变量参数待标定。`, tags: ['推演 · 示意'] };
    }
    if (/价格|涨|跌|价差/.test(q)) return { a: `${base}\n\n- 价格三段（示意）：田头 → 批发 → 零售，加价主要发生在流通与零售端。\n- 判断方法：先看当前对象的成本项（运距 / 冷链 / 分级），再叠加销区需求节奏。\n- 口径：${d.cal.price}。`, tags: ['示意 · 待标定'] };
    if (/风险|卡点|瓶颈/.test(q)) return { a: `${base}\n\n- 风险优先级（示意）：① 采后预冷与冷链能力 ② 运输半径与运价 ③ 上市窗口集中度 ④ 品牌与标准一致性。\n- 建议：优先量化「损耗率」与「商品率」，它们同时决定成本与售价。\n- 口径：示意。`, tags: ['示意 · 待标定'] };
    if (/趋势|预测|6|12|半年|一年/.test(q)) return { a: `${base}\n\n- 方向性判断（示意，未来 6–12 个月）：供给端扩种惯性仍在，销区对分级与品牌的要求继续提高，价差向「标准化能力强的产区」集中。\n- 多场景预演：${d.scenarios.map(s => `${s.k}（${s.lag}）：${s.eff}`).join('；')}。\n- 口径：方向性推演，非预测。`, tags: ['推演 · 示意'] };
    return { a: `${base}\n\n- 我能基于当前对象回答：量价节奏、成本拆解、链条卡点、关联变量推演（油价 / 汇率 / 天气 / 政策）、6–12 个月方向性判断。\n- 当前对象口径：${o && o.cal ? o.cal : d.cal.supply}。\n- 口径：示意 · 待标定。`, tags: ['示意 · 待标定'] };
  }

  /* ============================================================
     上下文封套：每条回答（含真实模型回答）必须携带
     当前层级 / 当前选择 / 红星市场 / 品类 / 数据口径 —— 并把模拟数据标注为示意·待标定
     ============================================================ */
  const LAYER_NAME = { 1: 'L1 全球货源流向', 2: 'L2 全国产区与省际流通', 3: 'L3 省区产业分析', 4: 'L4 城市代表单品全链路' };
  function layerNo() {
    if (window.AGRI && window.AGRI.layer) return window.AGRI.layer;
    if (window.AGRI_DEBUG) { try { return window.AGRI_DEBUG.state().layer; } catch (e) { /* 启动中 */ } }
    return 1;
  }
  function hongxing() { return (D() && D().HONGXING) || { name: '长沙·红星全球农批中心', prov: '湖南', role: '湖南及中南区域集散枢纽', caliber: '' }; }
  function catOf(o) {
    if (!o) return '未指定';
    const d = D();
    if (o.type === 'flow' || o.type === 'market' || o.type === 'prov') return d.CATN[o.raw.cat] || '未指定';
    if (o.type === 'city') return o.raw.main || (d.CATN[o.raw.cat] || '未指定');
    if (o.type === 'chain') return o.raw.product || '未指定';
    if (o.type === 'hub') return '进口品类 · 部位（可切换）';
    return d.CATN[o.raw && o.raw.cat] || o.label || '未指定';
  }
  function ctxOf(o) {
    const d = D(), n = layerNo(), hx = hongxing();
    return {
      layer: `${n} · ${LAYER_NAME[n] || '—'}`,
      selection: o ? `${o.label}（${o.type}）` : '未选中对象',
      hongxing: `${hx.name} · ${hx.prov} · ${hx.role}（企业 / 媒体表述，口径待核）`,
      category: catOf(o),
      caliber: (o && o.cal) || d.cal.supply,
      nature: `全部为示意数据 · ${d.ORG} · 周期 ${d.PERIOD}`
    };
  }
  function ctxLine(c) {
    return `**上下文**｜层级 ${c.layer}｜选择 ${c.selection}｜红星 ${c.hongxing}｜品类 ${c.category}｜口径 ${c.caliber}｜数据属性 ${c.nature}`;
  }
  function withCtx(res, o) {
    const c = ctxOf(o);
    const tags = (res.tags || []).concat(['示意 · 待标定']);
    return { a: ctxLine(c) + '\n\n' + res.a, tags: tags.filter((t, i) => tags.indexOf(t) === i), ctx: c };
  }

  const SYS = [
    '你是「农链 AgriLink」的产业分析师，服务于湖南红星大市场（长沙·红星全球农批中心）为中心的农产品进口与集散分析。',
    '硬约束：',
    '1) 本页所有数值都是示意数据（待标定），不是官方统计；回答里凡引用数值必须显式标注「示意 · 待标定」。',
    '2) 不得编造或暗示官方口径，不得声称红星是「全国第一」；「中南最大」类表述只能注明为企业 / 媒体表述。',
    '3) 马来西亚猫山王是中国榴莲进口中的小份额高价值来源，不得写成中国最大榴莲供应国；牛肉以巴西为重要 / 主导来源；车厘子以智利为主要来源。',
    '4) 部位级品类（如牛前腱）属于市场经营 / 交易台账层级的切片，不得冒充海关公开统计口径。',
    '5) 数据骨架：境外产区/国家 → 中国进口与消费 → 湖南集散与消费 → 湖南红星大市场 → 渠道/终端。',
    '输出：中文，先给判断，再给依据，最后给口径提示；控制在 220 字以内，可用短列表。'
  ].join('\n');

  /* 真实模型通路：失败返回 null（由调用方降级到规则回答，不白屏） */
  async function live(o, q) {
    const P = window.AGRI_PROVIDER;
    if (!P || !P.live) return null;
    const c = ctxOf(o);
    const res = await P.chat(
      [{ role: 'system', content: SYS }, { role: 'user', content: `【当前上下文】\n层级：${c.layer}\n选择：${c.selection}\n红星市场：${c.hongxing}\n品类：${c.category}\n口径：${c.caliber}\n数据属性：${c.nature}\n\n【问题】${q}` }],
      c
    );
    if (!res) return null;
    return withCtx({
      a: `**真实模型回答**（${res.model}）\n\n${res.content}\n\n— 口径复核：${c.caliber}；数值均为示意 · 待标定，引用前需标定。`,
      tags: ['真实模型']
    }, o);
  }

  function ask(o, q) { return withCtx(askCore(o, q), o); }
  function free(o, q) { return withCtx(freeCore(o, q), o); }

  function peak(m) { const mx = Math.max.apply(null, m), i = m.indexOf(mx); return `${i + 1} 月（峰值 ${mx} 万吨/月）`; }
  function altCat(c) { return c === 'fruit' ? '国产同季柑橘 / 苹果' : c === 'veg' ? '国产设施蔬菜' : '国产粳稻 / 粮油'; }
  function riskScore(s) { let n = 0; if (/霜冻|冻|阴雨|病|天气/.test(s.risk)) n++; if (/损耗|集中|踩踏|波动/.test(s.risk)) n++; if (/依赖|不足|紧张|缺口|空载|窗口/.test(s.risk)) n++; return n; }
  function worstDim(c) {
    const comp = c.comp;
    if (!comp) return '冷链';
    return Object.entries(comp).sort((a, b) => a[1] - b[1])[0][0];
  }

  return { presets, ask, free, live, ctxOf, hongxing, layerNo };
})();
