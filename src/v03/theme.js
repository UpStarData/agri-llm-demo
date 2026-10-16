/* ============================================================
   一级分类主题色（V2.8.4）
   · 事实层按 F3 一级分类 7 类着色；关联层按 PRD 本体一级分类 4 类着色
   · 色值先自动生成；**唯一来源是 CSS 变量**，改主题变量两层同时生效，
     避免颜色散落在各处（此前事实点、本体点、关系线各写各的）
   ============================================================ */
window.V03Theme = (() => {
  const FACT_L1 = [
    ['nature', '--fact-l1-1', '#4f8fa8'],   // 自然与生态
    ['supply', '--fact-l1-2', '#6aa35c'],   // 生产与供给
    ['chain',  '--fact-l1-3', '#43a09a'],   // 流通与供应链
    ['market', '--fact-l1-4', '#c9705f'],   // 市场与交易
    ['consume','--fact-l1-5', '#8d7fbe'],   // 消费与舆情
    ['policy', '--fact-l1-6', '#5d80c4'],   // 政策与治理
    ['macro',  '--fact-l1-7', '#b08a3c']    // 宏观与公共事件
  ];
  const OBJ_L1 = [
    ['地理与设施', '--obj-l1-1', '#2f6f9e'],
    ['主体与组织', '--obj-l1-2', '#a86a2c'],
    ['农作物',     '--obj-l1-3', '#5b9c46'],
    ['事件',       '--obj-l1-4', '#b04a6a']
  ];
  const FALLBACK = {
    facts: Object.fromEntries(FACT_L1.map(([k, , f]) => [k, f])),
    objs: Object.fromEntries(OBJ_L1.map(([k, , f]) => [k, f]))
  };
  let cache = null;
  function read() {
    if (cache) return cache;
    let css = null;
    try { css = getComputedStyle(document.documentElement); } catch (e) { css = null; }
    const v = n => (css ? css.getPropertyValue(n).trim() : '');
    const facts = {}, objs = {};
    FACT_L1.forEach(([k, varName, fb]) => { facts[k] = v(varName) || fb; });
    OBJ_L1.forEach(([k, varName, fb]) => { objs[k] = v(varName) || fb; });
    cache = {
      facts, objs,
      factOrder: FACT_L1.map(x => x[0]), objOrder: OBJ_L1.map(x => x[0]),
      factList: FACT_L1.map(x => facts[x[0]]), objList: OBJ_L1.map(x => objs[x[0]])
    };
    return cache;
  }
  return {
    read,
    fact: key => read().facts[key] || read().facts.nature,
    obj: name => read().objs[name] || read().objs['地理与设施'],
    reset: () => { cache = null; },
    fallbacks: FALLBACK,
    get factOrder() { return read().factOrder; },
    get objOrder() { return read().objOrder; },
    get factList() { return read().factList; },
    get objList() { return read().objList; }
  };
})();
