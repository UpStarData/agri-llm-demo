/* ============================================================
   推演层：七阶段流水线 · 种子确认 · 多轮时序模拟 · 报告逐步生成 · Jev-like 旁路信号
   状态真流转（计时器/单步写入 sim.stage / sim.round / sim.report / sim.status）
   离线推演为示意引擎，不声称真实 MiroFish 后端运行
   ============================================================ */
window.V03Sim = (function () {
  const D = window.V03Data, S = window.V03Store, F = window.V03Filter;
  let root, dom = {}, sig = '', timer = null, local = { hot: null };

  const TPL = `
  <div class="sim-wrap">
    <div class="sim-head">
      <h3><span id="simName">—</span><span class="sim-badge sample">样例场景</span></h3>
      <span class="goal" id="simGoal"></span>
      <span class="sim-badge engine">离线推演 · 示意引擎（非真实 MiroFish 后端）</span>
      <span class="sim-badge" id="simStatus"></span>
      <div class="sim-ctl" id="simCtl"></div>
    </div>
    <div class="sim-body">
      <div class="sim-col a">
        <div class="sim-card"><h4>七阶段流水线 <small id="simStageMeta"></small></h4><div id="simStages"></div></div>
        <div class="sim-card"><h4>方案输入与种子确认 <small id="simSeedMeta"></small></h4><div id="simSeeds"></div></div>
      </div>
      <div class="sim-col b">
        <div class="sim-card"><h4>Agent 配置 <small>农业角色 Agent（不是自由人设）</small></h4><div id="simAgents"></div></div>
        <div class="sim-card"><h4>轮次与过程 <small id="simRoundMeta"></small></h4><div id="simRounds"></div></div>
        <div class="sim-card"><h4>运行日志 <small>示意日志 · 逐行追加</small></h4><div class="sim-log" id="simLog"></div></div>
      </div>
      <div class="sim-col c">
        <div class="sim-card sim-rep"><h4>推演报告 <small>随轮次逐步生成 · 报告属于推演层</small></h4><div id="simReport"></div></div>
        <div class="sim-card sim-side" id="simSide"></div>
      </div>
    </div>
  </div>`;

  function mount(el) {
    root = el; root.innerHTML = TPL;
    dom = {
      name: root.querySelector('#simName'), goal: root.querySelector('#simGoal'), status: root.querySelector('#simStatus'),
      ctl: root.querySelector('#simCtl'), stages: root.querySelector('#simStages'), stageMeta: root.querySelector('#simStageMeta'),
      seeds: root.querySelector('#simSeeds'), seedMeta: root.querySelector('#simSeedMeta'), agents: root.querySelector('#simAgents'),
      rounds: root.querySelector('#simRounds'), roundMeta: root.querySelector('#simRoundMeta'), log: root.querySelector('#simLog'),
      report: root.querySelector('#simReport'), side: root.querySelector('#simSide')
    };
  }

  const scenario = id => (D.SCENARIOS || []).find(s => s.id === id) || (D.SCENARIOS || [])[0];
  const uniq = a => a.filter((x, i) => a.indexOf(x) === i);
  /* 种子口径统一由 V03Filter 提供：场景默认（可取消）+ 携带事实 + 手动种子 */
  const seedsOf = st => window.V03Filter.seeds(st);

  /* GraphRAG 子图：种子事实 → 对象 → 关系 → 追加事实（真实计算，不是写死数字） */
  function subgraph(st, sc) {
    const seeds = seedsOf(st).map(id => D.factById(id)).filter(Boolean);
    const objs = new Set(), facts = new Set(seeds.map(f => f.id)), rels = new Set();
    seeds.forEach(f => { f.objects.forEach(o => objs.add(o)); f.relations.forEach(r => rels.add(r)); });
    D.RELATIONS.filter(r => objs.has(r.from) && objs.has(r.to)).forEach(r => { rels.add(r.id); r.factIds.forEach(f => facts.add(f)); });
    return { seeds, objs: [...objs], rels: [...rels], facts: [...facts] };
  }

  /* ---------- 运行控制 ---------- */
  function stop() { clearInterval(timer); timer = null; }
  function start() {
    stop();
    timer = setInterval(tick, Math.round(1100 / (S.state.sim.speed || 1)));
  }
  function tick() {
    const st = S.state, sc = scenario(st.sim.scenario);
    if (st.sim.status !== 'running') { stop(); return; }
    if (st.sim.stage < 5) return S.set({ sim: { stage: st.sim.stage + 1 } });
    if (st.sim.round < sc.rounds.length) return S.set({ sim: { round: st.sim.round + 1 } });
    if (st.sim.stage === 5) return S.set({ sim: { stage: 6 } });
    if (st.sim.report < sc.report.length) return S.set({ sim: { report: st.sim.report + 1 } });
    stop();
    S.set({ sim: { status: 'done' } });
    S.emit('toast', '推演完成：' + sc.name + '（报告 ' + sc.report.length + ' 节，全部可回溯）');
  }
  function play() {
    const st = S.state, sc = scenario(st.sim.scenario);
    if (!seedsOf(st).length) return S.emit('toast', '请先确认至少 1 条种子事实');
    if (st.sim.status === 'done') S.set({ sim: { stage: 0, round: 0, report: 0, status: 'running', replay: false } });
    else S.set({ sim: { status: 'running' } });
    start();
  }
  function reset() { stop(); S.set({ sim: { stage: 0, round: 0, report: 0, status: 'idle', replay: false, failRound: null, hotRound: null } }); }

  /* ---------- 阶段细节（由真实状态算出） ---------- */
  function stageDetail(i, st, sc) {
    const g = subgraph(st, sc);
    switch (i) {
      case 0: return `已确认 ${g.objs.length} 个本体对象 · ${g.rels.length} 条关系（只读，不写回现实图谱）`;
      case 1: return `GraphRAG 子图：对象 ${g.objs.length} · 关系 ${g.rels.length} · 事实 ${g.facts.length} · 引用 ${g.facts.slice(0, 3).join(' / ')}${g.facts.length > 3 ? ' 等' : ''}`;
      case 2: return `创建 run_id=run-${sc.id.toLowerCase()}-0912 隔离环境（示意沙箱）`;
      case 3: return `${(D.AGENTS || []).length} 个农业角色 Agent 已配置 · 输入来源见下方`;
      case 4: return `${seedsOf(st).length} 条种子事实激活完成，作为第 0 轮输入`;
      case 5: return st.sim.round ? `第 ${st.sim.round}/${sc.rounds.length} 轮：${sc.rounds[st.sim.round - 1].title}` : `共 ${sc.rounds.length} 轮，等待开始`;
      case 6: return `已生成 ${Math.min(st.sim.report, sc.report.length)}/${sc.report.length} 节报告`;
      default: return '';
    }
  }

  const STAGE_STATUS = (i, st, sc) => {
    if (st.sim.status === 'failed' && i === st.sim.stage) return ['fail', '失败'];
    if (st.sim.status === 'idle' && !st.sim.stage && !st.sim.round) return ['wait', '待运行'];
    if (i < st.sim.stage || (i === 5 && st.sim.round >= sc.rounds.length && st.sim.stage > 5) || (i === 6 && st.sim.report >= sc.report.length && st.sim.status === 'done')) return ['done', '完成'];
    if (i === st.sim.stage) return [st.sim.status === 'running' ? 'run' : st.sim.status === 'done' ? 'done' : 'wait', st.sim.status === 'running' ? '进行中' : '当前'];
    return ['wait', '待运行'];
  };

  /* ---------- 渲染 ---------- */
  function renderHead(st, sc) {
    dom.name.textContent = sc.name;
    dom.goal.textContent = sc.goal;
    const map = { idle: ['', '待运行'], running: ['run', '运行中'], paused: ['pause', '已暂停'], done: ['done', '已完成'], failed: ['fail', '失败'] };
    const m = map[st.sim.status] || map.idle;
    dom.status.className = 'sim-badge ' + m[0];
    dom.status.textContent = m[1] + (st.sim.offline ? ' · 离线回放' : '') + (st.sim.replay ? ' · 回放' : '') +
      (st.sim.sidecar === 'degraded' ? ' · 旁路降级' : '');

    const seeds = seedsOf(st);
    const B = [];
    const btn = (label, cls, fn, disabled, title) => {
      const b = document.createElement('button');
      b.className = cls; b.textContent = label; b.disabled = !!disabled; if (title) b.title = title;
      b.onclick = fn; dom.ctl.appendChild(b);
    };
    dom.ctl.innerHTML = '';
    if (st.sim.status === 'idle' || st.sim.status === 'done') btn(st.sim.status === 'done' ? '回放' : '开始推演', '', play, !seeds.length, seeds.length ? '' : '没有种子事实时不能开始推演');
    if (st.sim.status === 'running') { btn('暂停', '', () => { stop(); S.set({ sim: { status: 'paused' } }); }); btn('单步一轮', 'sec', () => { step(); }); }
    if (st.sim.status === 'paused') { btn('继续', '', () => { S.set({ sim: { status: 'running' } }); start(); }); btn('单步一轮', 'sec', () => step()); }
    if (st.sim.status === 'failed') { btn('从第 ' + (st.sim.failRound || st.sim.round || 1) + ' 轮重试', '', () => { S.set({ sim: { status: 'running', failRound: null } }); start(); }); btn('重置', 'ter', reset); }
    if (st.sim.status === 'running' || st.sim.status === 'paused') btn('重置', 'ter', reset);
    btn(st.sim.offline ? '关闭离线回放' : '离线回放', 'ter', () => S.set({ sim: { offline: !st.sim.offline, speed: st.sim.offline ? 1 : 0.5 } }),
      false, '离线回放：使用本地记录，放慢推进速度，仍真实走阶段与轮次');
    btn(st.sim.sidecar === 'degraded' ? '恢复旁路信号' : '模拟旁路失败', 'ter', () => {
      const next = st.sim.sidecar === 'degraded' ? 'ok' : 'degraded';
      S.set({ sim: { sidecar: next } });
      S.emit('toast', next === 'degraded' ? '旁路信号降级：第 4 轮起 Agent 置信度改用规则基线（示意）' : '旁路信号已恢复（示意）');
    });
    if (st.sim.status === 'idle') btn('模拟第 3 轮 Agent 超时', 'ter', () => S.set({ sim: { status: 'running', stage: 5, round: 3, status2: 0 } }));
  }

  function step() {
    const st = S.state, sc = scenario(st.sim.scenario);
    if (st.sim.stage < 5) return S.set({ sim: { stage: st.sim.stage + 1 } });
    if (st.sim.round < sc.rounds.length) return S.set({ sim: { round: st.sim.round + 1 } });
    if (st.sim.stage === 5) return S.set({ sim: { stage: 6 } });
    if (st.sim.report < sc.report.length) return S.set({ sim: { report: st.sim.report + 1 } });
    S.set({ sim: { status: 'done' } });
  }

  function renderStages(st, sc) {
    dom.stageMeta.textContent = '阶段 ' + Math.min(st.sim.stage + 1, 7) + '/7';
    dom.stages.innerHTML = (D.STAGES || []).map((s, i) => {
      const [cls, txt] = STAGE_STATUS(i, st, sc);
      return `<div class="sim-stage ${cls}" data-stage="${i}">
        <span class="ix">${cls === 'done' ? '✓' : i + 1}</span>
        <span class="t"><b>${s.n}</b><small>${stageDetail(i, st, sc)}</small></span>
        <span class="st">${txt}</span></div>`;
    }).join('');
  }

  function renderSeeds(st, sc) {
    const effective = seedsOf(st);
    dom.seedMeta.textContent = effective.length + ' 条（含携带事实）';
    const rows = uniq(sc.seeds.concat(st.carry || []).concat(effective)).map(id => {
      const f = D.factById(id); if (!f) return '';
      const on = effective.includes(id);
      const carried = (st.carry || []).includes(id);
      return `<label class="sim-seed"><input type="checkbox" data-seed="${id}" ${on ? 'checked' : ''}>
        <span><b>${f.short} · ${f.date}</b><small>${f.title}${carried ? '（来自关联层携带）' : '（场景默认种子）'}</small></span></label>`;
    }).join('');
    dom.seeds.innerHTML = rows + `<p class="sim-note" style="margin-top:8px">${effective.length ? '种子用于第 0 轮激活；取消勾选后该事实不参与本轮推演。' : '当前没有种子：请勾选至少 1 条，或从事实详情「加入推演种子」/关联层携带事实进入。'}</p>`;
    dom.seeds.querySelectorAll('[data-seed]').forEach(el => el.onchange = () => {
      S.set({ sim: F.toggleSeed(S.state, el.dataset.seed, el.checked) });
    });
  }

  function renderAgents() {
    dom.agents.innerHTML = (D.AGENTS || []).map(a => `<div class="sim-agent"><span><b>${a.n}</b><small>${a.role}</small><small style="color:#94a3b8">输入来源：${a.src}</small></span></div>`).join('');
  }

  function citeChip(st, c) {
    if (!c) return '';
    if (c.fact) { const f = D.factById(c.fact); return f ? `<span class="sim-cite" data-cite="fact:${c.fact}">事实 · ${f.short} ${f.date}</span>` : ''; }
    if (c.rel) { const r = D.relById(c.rel); return r ? `<span class="sim-cite" data-cite="rel:${c.rel}">关系 · ${r.type}（置信 ${(r.confidence * 100).toFixed(0)}%）</span>` : ''; }
    if (c.round) return `<span class="sim-cite" data-cite="round:${c.round}">轮次 · 第 ${c.round} 轮</span>`;
    return '';
  }

  function renderRounds(st, sc) {
    dom.roundMeta.textContent = st.sim.round + '/' + sc.rounds.length + ' 轮';
    dom.rounds.innerHTML = sc.rounds.map(r => {
      const done = st.sim.round >= r.n && st.sim.stage >= 5;
      const hot = st.sim.round === r.n && st.sim.status === 'running';
      const failed = st.sim.status === 'failed' && st.sim.failRound === r.n;
      const open = done || hot || failed;
      const agents = r.agents.map(id => ((D.AGENTS || []).find(a => a.id === id) || {}).n || id).join(' / ');
      return `<div class="sim-round${hot ? ' hot' : ''}${open ? '' : ' pending'}" data-round="${r.n}">
        <div class="rh"><span class="rn">${r.n}</span><b>${r.title}</b><small>${agents}</small></div>
        ${open ? `<div class="rb">
          <p><b>动作：</b>${r.action}</p>
          <p><b>发现：</b>${r.finding}</p>
          <div class="sig">信号：${r.signal.status} · 不确定度 ${r.signal.uncertainty.toFixed(2)} · Provider ${r.signal.provider}${st.sim.sidecar === 'degraded' && r.n >= 4 ? '（旁路降级：改用规则基线）' : ''}</div>
          ${failed ? `<div class="sig" style="color:#b91c1c"><b>失败：</b>渠道谈判 Agent 超时（8s 未响应），本轮结论未生成。可点「从第 ${r.n} 轮重试」继续。</div>` : ''}
          <div class="sim-cites">${(r.cites.facts || []).map(f => citeChip(st, { fact: f })).join('')}${(r.cites.relations || []).map(x => citeChip(st, { rel: x })).join('')}${citeChip(st, { round: r.n })}</div>
        </div>` : `<div class="rb"><p class="sim-note">待生成：本轮将在阶段「多轮时序模拟」中按顺序展开。</p></div>`}
      </div>`;
    }).join('');
  }

  function renderReport(st, sc) {
    const shown = Math.min(st.sim.report, sc.report.length);
    dom.report.innerHTML = sc.report.map((s, i) => i < shown
      ? `<div class="sim-rep"><h5>${s.h}</h5><ul>${s.bullets.map(b => `<li>${b.t} ${citeChip(st, b.cite)}</li>`).join('')}</ul></div>`
      : `<div class="sim-rep" style="margin-top:8px"><h5 style="color:#94a3b8">${s.h}</h5><div class="sim-pending">待生成：将在第 ${s.at} 轮完成后生成（不提前显示结论）</div></div>`).join('') +
      `<p class="sim-note" style="margin-top:10px">报告为推演结果页，属于推演层，不单独作为第四个 TAB；每个要点都可回链事实、关系与轮次。全部数值为示意数据（待标定）。</p>`;
  }

  function renderSide(st, sc) {
    const sd = D.SIDECAR || {};
    const degraded = st.sim.sidecar === 'degraded';
    const lo = degraded ? sd.base.lo + 0.18 : sd.base.lo, hi = degraded ? sd.base.hi + 0.24 : sd.base.hi;
    dom.side.className = 'sim-card sim-side' + (degraded ? ' degraded' : '');
    dom.side.innerHTML = `
      <h4>${sd.n || 'Jev-like 旁路信号'} <small>只做参考 · 不参与事实入层</small></h4>
      <div class="kv"><span>状态</span><b>${degraded ? '降级 · ' + (sd.degrade || '服务不可用') : '正常（示意）'}</b></div>
      <div class="kv"><span>Provider</span><b>${sd.provider}</b></div>
      <div class="kv"><span>版本</span><b>${sd.version}</b></div>
      <div class="kv"><span>最近更新</span><b>${sd.updated}</b></div>
      <div class="kv"><span>不确定性</span><b>${lo.toFixed(2)} – ${hi.toFixed(2)}</b></div>
      <div class="unc"><div class="b"><i style="left:${(lo * 100).toFixed(0)}%;width:${((hi - lo) * 100).toFixed(0)}%"></i></div></div>
      ${degraded ? `<div class="sim-note" style="color:#b45309;margin-top:6px">降级原因：${sd.degrade}。影响：第 4 轮起 Agent 置信度改用规则基线；旁路信号不写入事实、关系与种子。</div>` : ''}
      <div class="sim-note" style="margin-top:6px">${sd.note || ''}</div>`;
  }

  function renderLog(st, sc) {
    const lines = [];
    if (st.sim.stage >= 1) lines.push('[环境] 创建 run_id=run-' + sc.id.toLowerCase() + '-0912 隔离沙箱（示意）');
    if (st.sim.stage >= 2) { const g = subgraph(st, sc); lines.push('[检索] GraphRAG 子图：对象 ' + g.objs.length + ' · 关系 ' + g.rels.length + ' · 事实 ' + g.facts.length); }
    if (st.sim.stage >= 3) lines.push('[配置] ' + (D.AGENTS || []).length + ' 个农业角色 Agent 就绪');
    if (st.sim.stage >= 5) lines.push('[激活] 种子 ' + seedsOf(st).length + ' 条已激活');
    sc.rounds.slice(0, st.sim.round).forEach(r => lines.push('[轮次] 第 ' + r.n + ' 轮 ' + r.title + ' 完成'));
    sc.report.slice(0, Math.min(st.sim.report, sc.report.length)).forEach(s => lines.push('[报告] 生成 ' + s.h));
    if (st.sim.sidecar === 'degraded') lines.push('[降级] jev-like 旁路超时 → 轮次置信度改用规则基线');
    if (st.sim.offline) lines.push('[离线] 离线回放模式 · 使用本地记录（示意）');
    if (st.sim.status === 'failed') lines.push('[失败] 第 ' + (st.sim.failRound || st.sim.round) + ' 轮渠道 Agent 超时');
    dom.log.innerHTML = (lines.length ? lines : ['[待运行] 点「开始推演」按七阶段推进']).map(l => '<div>' + l + '</div>').join('');
    dom.log.scrollTop = dom.log.scrollHeight;
  }

  function bindCites() {
    root.querySelectorAll('[data-cite]').forEach(el => el.onclick = () => {
      const [kind, id] = el.dataset.cite.split(':');
      if (kind === 'fact') S.set({ tab: 'fact', factId: id });
      else if (kind === 'rel') S.set({ tab: 'relation', rel: { sel: id, kind: 'relation' } });
      else {
        const n = Number(id);
        S.set({ sim: { hotRound: n } });
        const node = root.querySelector('[data-round="' + n + '"]');
        if (node) { node.classList.add('hot'); node.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        S.emit('toast', '定位到第 ' + n + ' 轮');
      }
    });
  }

  function update() {
    if (!root) return;
    const st = S.state, sc = scenario(st.sim.scenario);
    if (!sc) return;
    const key = JSON.stringify([st.sim.scenario, st.sim.stage, st.sim.round, st.sim.report, st.sim.status, st.sim.offline, st.sim.replay, st.sim.sidecar, st.sim.seedIds, st.carry, st.sim.failRound, st.sim.speed]);
    if (key === sig) return; sig = key;
    renderHead(st, sc); renderStages(st, sc); renderSeeds(st, sc); renderAgents(); renderRounds(st, sc); renderReport(st, sc); renderSide(st, sc); renderLog(st, sc);
    bindCites();
    if (st.sim.status === 'running' && !timer) start();
    if (st.sim.status !== 'running' && timer && st.sim.status === 'paused') stop();
  }

  const debug = () => {
    const st = S.state, sc = scenario(st.sim.scenario), g = subgraph(st, sc);
    return { scenario: st.sim.scenario, stages: (D.STAGES || []).length, stage: st.sim.stage, rounds: sc.rounds.length, round: st.sim.round,
      report: st.sim.report, reportSections: sc.report.length, status: st.sim.status, sidecar: st.sim.sidecar,
      seeds: seedsOf(st).length, subgraph: { objects: g.objs.length, relations: g.rels.length, facts: g.facts.length },
      renderedStages: root ? root.querySelectorAll('.sim-stage').length : 0, renderedRounds: root ? root.querySelectorAll('.sim-round').length : 0 };
  };

  return { mount, update, debug, streamLines: () => (window.V03Data.STREAM_SIM || []) };
})();
