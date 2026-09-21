/* ============================================================
   V0.4 状态仓库 —— 三层共用唯一状态源
   规则：任何交互都必须通过 set()/emit() 写回状态；禁止只切换文案。
   架构按 LLM-291 页面指令重排：
     · 顶部导航只留「图层菜单 / 品牌 / 三 TAB / 快捷图标组」
     · 全部筛选与地图开关收进 M1–M11 快捷键（地图右下角 + 左侧图层菜单底部双入口）
     · 快捷键总开关 panels.shortcuts 只控制地图那一组，菜单内快捷控制始终可用
   ============================================================ */
window.V03Store = (function () {
  const listeners = [], events = {};

  const state = {
    tab: 'fact',                  // fact | relation | sim

    /* 左侧图层菜单（从左侧滑出）与顶部快捷图标组 */
    menu: false,
    panels: { cards: true, stream: true, shortcuts: true },
    settings: { gate: false, authed: false, page: false },

    /* M1–M6 / M11：开关型快捷键 */
    sk: {
      mode3d: false,              // M1 2D / 3D
      influence: true,            // M2 影响力扩散动画
      fullscreen: false,          // M3 全屏
      live: false,                // M4 直播流
      regions: false,             // M5 产区
      gates: false,               // M6 港口与机场
      legend: true                // M11 图例
    },

    /* M7–M10：选择型快捷键（与筛选状态同源） */
    time: '7d',                   // 7d | 30d | 90d | all
    cred: 'high',                 // high | mid | low | all
    infl: 'high',                 // high | mid | low | all
    q: '',

    /* 三级分类字典的选中项：null = 默认全选 */
    catKeys: null,                // 事实层
    relKeys: null,                // 关联层

    geo: { level: 'L1', focus: null },   // L1 全球（默认）/ L2 全国 / L3 省区（focus=省名）
    factId: null, logOpen: false,        // 事实详情弹窗
    carry: [],

    rel: { view: 'geo', domain: 'all', sel: null, kind: null, focusFact: null, onlyCarry: false, allCards: false },

    sim: {
      /* 统一用户故事：马来西亚榴莲 → 红星市场份额；五阶段承载十二步骤 */
      scenario: 'DURIAN', tick: 0, status: 'idle',   // idle | running | paused | done | failed
      report: 0, paused: false, replay: false, hotRound: null, failRound: null,
      offline: false,                               // 离线回放
      sidecar: 'ok',                                // ok | degraded：Jev 旁路模型信号
      speed: 1, seedIds: [], seedOff: [],
      run: 'AGRI-DURIAN-HX-001', runs: ['AGRI-DURIAN-HX-001'],
      assumption: { supply: 20, compete: 15 },      // 供应增幅 / 竞争采购强度
      qa: [],                                       // 已追问的问题（步骤十二）
      contextVersion: 'ctx-2026-09-21-1'
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
