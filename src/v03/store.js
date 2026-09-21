/* ============================================================
   V0.3 状态仓库 —— 三层共用唯一状态源
   规则：任何交互都必须通过 set()/emit() 写回状态；禁止只切换文案。
   三层的状态字段互相隔离（tab / fact / rel / sim），切换 TAB 不重置筛选。
   ============================================================ */
window.V03Store = (function () {
  const listeners = [], events = {};

  const state = {
    tab: 'fact',                  // fact | relation | sim
    time: '30d',                  // 7d | 30d | 90d | all
    cat: 'all',                   // 事实层：事实分类（policy/price/weather/logistics/trade）
    sub: null,                    // 事实层：二级分类关键词
    src: 'all',                   // 事实层：三级分类（来源/口径）official|ledger|platform
    cred: 'all',                  // 事实层：可信度 all|high|mid|low
    infl: 'all',                  // 事实层：影响等级 all|high|mid|low
    q: '',                        // 全局搜索
    logOpen: false,               // 事实详情：查看处理记录
    rail: false,                  // 左侧分类栏默认折叠为窄栏（评审结论），点击展开
    panels: { cards: true, stream: true },

    geo: { level: 'L2', focus: null },   // L1 全球 / L2 全国 / L3 省区（focus=省名）
    factId: null,                        // 打开的事实详情
    carry: [],                           // 携带进入关联层/推演层的事实 id

    rel: { view: 'graph', domain: 'all', sel: null, kind: null, focusFact: null, onlyCarry: false },

    sim: {
      scenario: 'S1', stage: 0, status: 'idle',   // idle | running | paused | done | failed
      round: 0, rounds: 0, report: 0, paused: false, replay: false, hotRound: null, failRound: null,
      offline: false,                             // 离线回放
      sidecar: 'ok',                              // ok | degraded | offline | error：Jev-like 旁路信号
      speed: 1, seedIds: [], seedOff: [], autoRun: false
    }
  };

  function set(patch) {
    const changed = [];
    Object.keys(patch || {}).forEach(k => {
      const v = patch[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && state[k] && typeof state[k] === 'object' && !Array.isArray(state[k])) {
        Object.assign(state[k], v);
      } else {
        state[k] = v;
      }
      changed.push(k);
    });
    listeners.forEach(fn => { try { fn(state, changed); } catch (e) { console.error(e); } });
  }
  const on = fn => listeners.push(fn);
  const emit = (name, payload) => (events[name] || []).forEach(fn => { try { fn(payload, state); } catch (e) { console.error(e); } });
  const onEvent = (name, fn) => (events[name] = events[name] || []).push(fn);

  return { state, set, on, emit, onEvent };
})();
