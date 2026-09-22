/* ============================================================
   推演层：五阶段承载十二步骤 · 统一用户故事「马来西亚榴莲 → 红星市场份额」
   - 两个核心指标：分子 / 分母 / 时间范围 / 口径 / 演示基线 全部显式
   - 现实基线 / 模型推断 / 模拟结果 / 建议 使用不同标签
   - 状态真流转：tick 驱动步骤与轮次；报告随步骤十一定稿；步骤十二可创建新 run
   - Jev 旁路模型信号：只显示接入状态与降级原因；本页不接收、不记录、不提交任何密钥
   - 离线推演 · 示意引擎（非真实 MiroFish 后端）
   ============================================================ */
window.V03Sim = (function () {
  const D = window.V03Data, S = window.V03Store, F = window.V03Filter;
  let root, dom = {}, sig = '', timer = null;

  const TPL = `
  <div class="sim-wrap">
    <div class="sim-head">
      <h3><span id="simName">—</span><span class="sim-badge sample">演示样例</span></h3>
      <span class="goal" id="simGoal"></span>
      <span class="sim-badge engine">离线推演 · 示意引擎（非真实 MiroFish 后端）</span>
      <span class="sim-badge" id="simStatus"></span>
      <div class="sim-ctl" id="simCtl"></div>
    </div>
    <div class="sim-body">
      <div class="sim-col a">
        <div class="sim-card"><h4>五阶段 · 十二步骤 <small id="simStepMeta"></small></h4><div id="simStages"></div></div>
        <div class="sim-card"><h4>当前步骤 <small id="simCurMeta"></small></h4><div id="simCur"></div></div>
        <div class="sim-card"><h4>推演种子 <small id="simSeedMeta"></small></h4><div id="simSeeds"></div></div>
      </div>
      <div class="sim-col b">
        <div class="sim-card"><h4>两个核心指标 <small>分子 / 分母 / 时间范围 / 口径 · 演示样例</small></h4><div id="simInd"></div></div>
        <div class="sim-card"><h4>规则与参数 <small>区分基线 / 规则 / 模拟 / 假设</small></h4><div id="simParams"></div></div>
        <div class="sim-card"><h4>轮次与过程 <small id="simRoundMeta"></small></h4><div id="simRounds"></div></div>
        <div class="sim-card"><h4>运行日志 <small>示意日志 · 逐行追加</small></h4><div class="sim-log" id="simLog"></div></div>
      </div>
      <div class="sim-col c">
        <div class="sim-card sim-rep"><h4>决策报告 <small>报告属于推演层 · 每个要点带引用</small></h4><div id="simReport"></div></div>
        <div class="sim-card"><h4>深度追问（步骤十二） <small>解释沿用当前 run；改关键假设则新建 run</small></h4><div id="simQa"></div></div>
        <div class="sim-card sim-side" id="simSide"></div>
      </div>
    </div>
  </div>`;

  const AGENTS_BY_ID = id => (D.AGENTS || []).find(a => a.id === id) || { n: id };

  function mount(el) {
    root = el; root.innerHTML = TPL;
    dom = {
      name: root.querySelector('#simName'), goal: root.querySelector('#simGoal'), status: root.querySelector('#simStatus'),
      ctl: root.querySelector('#simCtl'), stages: root.querySelector('#simStages'), stepMeta: root.querySelector('#simStepMeta'),
      cur: root.querySelector('#simCur'), curMeta: root.querySelector('#simCurMeta'),
      seeds: root.querySelector('#simSeeds'), seedMeta: root.querySelector('#simSeedMeta'),
      ind: root.querySelector('#simInd'), params: root.querySelector('#simParams'),
      rounds: root.querySelector('#simRounds'), roundMeta: root.querySelector('#simRoundMeta'), log: root.querySelector('#simLog'),
      report: root.querySelector('#simReport'), qa: root.querySelector('#simQa'), side: root.querySelector('#simSide')
    };
  }

  /* ---------- 进度：十二步骤的程序（步骤 8/9 每轮重复一次） ---------- */
  const ROUNDS = () => D.ROUNDS || [];
  function program() {
    const p = [1, 2, 3, 4, 5, 6, 7];
    ROUNDS().forEach(r => { p.push(8); p.push(9); });
    p.push(10); p.push(11); p.push(12);
    return p;
  }
  function derived(st) {
    const p = program(), i = Math.min(st.sim.tick || 0, p.length);
    const done = i >= p.length;
    const step = done ? 12 : p[i];
    let round = 0;
    for (let k = 7; k < i; k++) if (p[k] === 9) round++;
    const stage = (D.STAGES || []).findIndex(s => s.steps.includes(step));
    return { i, done, step, round, stage: stage < 0 ? 0 : stage };
  }
  function stop() { clearInterval(timer); timer = null; }
  function start() { stop(); timer = setInterval(tick, Math.round(1100 / (S.state.sim.speed || 1))); }
  function tick() {
    const st = S.state, p = program();
    if (st.sim.status !== 'running') { stop(); return; }
    if ((st.sim.tick || 0) >= p.length) { stop(); S.set({ sim: { status: 'done' } }); return; }
    const next = (st.sim.tick || 0) + 1;
    const patch = { tick: next };
    if (p[next - 1] === 11) patch.report = (D.REPORT || []).length;
    S.set({ sim: patch });
    if (next >= p.length) { stop(); S.set({ sim: { status: 'done' } }); S.emit('toast', '推演完成：12 轮 / 30 天 · 报告 ' + (D.REPORT || []).length + ' 节，全部可回溯'); }
  }
  function play() {
    const st = S.state;
    if (!seedsOf(st).length) return S.emit('toast', '请先确认至少 1 条种子事实');
    if (st.sim.status === 'done') S.set({ sim: { tick: 0, report: 0, status: 'running', replay: false } });
    else S.set({ sim: { status: 'running' } });
    start();
  }
  function reset() { stop(); S.set({ sim: { tick: 0, report: 0, status: 'idle', replay: false, failRound: null, hotRound: null } }); }

  const seedsOf = st => window.V03Filter.seeds(st);

  /* ---------- 引擎文案 ---------- */
  const STATUS = { idle: ['', '待运行'], running: ['run', '运行中'], paused: ['pause', '已暂停'], done: ['done', '已完成'], failed: ['fail', '失败'] };

  function renderHead(st, dv) {
    dom.name.textContent = '马来西亚榴莲 → 红星市场份额（统一用户故事）';
    dom.goal.textContent = '推演问题：未来 30 天马来西亚榴莲进入湖南总量增长 20%、其他批发市场加强采购时，红星的流入占比与湖南市场份额将如何变化？';
    const m = STATUS[st.sim.status] || STATUS.idle;
    dom.status.className = 'sim-badge ' + m[0];
    dom.status.textContent = m[1] + (st.sim.offline ? ' · 离线回放' : '') + (st.sim.sidecar === 'degraded' ? ' · Jev 降级' : '');

    const seeds = seedsOf(st), B = [];
    const btn = (label, cls, fn, disabled, title) => {
      const b = document.createElement('button');
      b.className = cls; b.textContent = label; b.disabled = !!disabled; if (title) b.title = title;
      b.onclick = fn; B.push(b); return b;
    };
    dom.ctl.innerHTML = '';
    if (st.sim.status === 'idle') btn('开始推演', '', play, !seeds.length, seeds.length ? '' : '没有种子事实时不能开始推演');
    if (st.sim.status === 'done') btn('回放', '', play);
    if (st.sim.status === 'running') { btn('暂停', '', () => { stop(); S.set({ sim: { status: 'paused' } }); }); btn('单步推进', 'sec', tick); }
    if (st.sim.status === 'paused') { btn('继续', '', () => { S.set({ sim: { status: 'running' } }); start(); }); btn('单步推进', 'sec', tick); }
    if (st.sim.status === 'failed') btn('从第 ' + (st.sim.failRound || 1) + ' 轮重试', '', () => { S.set({ sim: { status: 'running', failRound: null } }); start(); });
    if (st.sim.status !== 'idle') btn('重置', 'ter', reset);
    btn(st.sim.offline ? '关闭离线回放' : '离线回放', 'ter', () => S.set({ sim: { offline: !st.sim.offline, speed: st.sim.offline ? 1 : 0.5 } }));
    btn(st.sim.sidecar === 'degraded' ? '恢复 Jev 信号' : '模拟 Jev 失败', 'ter', () => {
      const next = st.sim.sidecar === 'degraded' ? 'ok' : 'degraded';
      S.set({ sim: { sidecar: next } });
      S.emit('toast', next === 'degraded' ? 'Jev 信号降级：轮次置信度改用规则基线（示意）' : 'Jev 信号已恢复（示意）');
    });
    if (st.sim.status === 'idle') btn('模拟第 8 轮 Agent 超时', 'ter', () => S.set({ sim: { status: 'failed', tick: 15, failRound: 8 } }));
    B.forEach(b => dom.ctl.appendChild(b));
  }

  /* ---------- 五阶段 · 十二步骤 ---------- */
  const STEP_STATUS = (n, st, dv) => {
    if (st.sim.status === 'failed' && n === dv.step) return ['fail', '失败'];
    if (dv.done) return ['done', '完成'];
    if (n < dv.step) return ['done', '完成'];
    if (n === dv.step) return [st.sim.status === 'running' ? 'run' : 'wait', st.sim.status === 'running' ? '进行中' : '当前'];
    return ['wait', '待运行'];
  };

  function renderStages(st, dv) {
    dom.stepMeta.textContent = dv.done ? '12/12 步骤完成' : '步骤 ' + dv.step + '/12 · 阶段 ' + (dv.stage + 1) + '/5';
    dom.stages.innerHTML = (D.STAGES || []).map((s, si) => {
      const cur = si === dv.stage;
      return `<div class="sim-stageblk${cur ? ' cur' : ''}">
        <div class="sb-head"><span class="ix">${si + 1}</span><b>${s.n}</b><small>${s.steps.map(n => '步骤 ' + n).join(' · ')}</small></div>
        <div class="sb-steps">
          ${s.steps.map(n => {
            const sp = (D.STEPS || []).find(x => x.n === n) || {};
            const [cls, txt] = STEP_STATUS(n, st, dv);
            return `<div class="sim-step ${cls}"><span class="st-n">${n}</span><span class="st-t">${sp.t}</span><span class="st-s">${txt}</span></div>`;
          }).join('')}
        </div>
        <div class="sb-d">${s.d}</div>
      </div>`;
    }).join('');
  }

  function renderCurrent(st, dv) {
    const sp = (D.STEPS || []).find(x => x.n === dv.step) || {};
    dom.curMeta.textContent = '步骤 ' + dv.step + ' · ' + ((D.STAGES || [])[dv.stage] || {}).n;
    const list = (arr, cls) => `<ul class="sim-ul ${cls || ''}">${(arr || []).map(x => '<li>' + x + '</li>').join('')}</ul>`;
    dom.cur.innerHTML = `
      <div class="sim-stephead"><b>${sp.t}</b><span class="sim-badge">${dv.done ? '已完成' : st.sim.status === 'running' ? '进行中' : '当前步骤'}</span></div>
      <div class="sim-sub"><h6>输入</h6>${list(sp.input)}</div>
      <div class="sim-sub"><h6>处理</h6>${list(sp.process)}</div>
      <div class="sim-sub"><h6>输出</h6>${list(sp.output)}</div>
      <div class="sim-sub"><h6>页面承载</h6><p class="sim-note">${sp.page || ''}</p></div>
      <div class="sim-sub"><h6>下一步</h6><p class="sim-note">${sp.next || ''}</p></div>`;
  }

  function renderSeeds(st) {
    const seeds = seedsOf(st);
    dom.seedMeta.textContent = seeds.length + ' 条（含携带事实）';
    const all = (D.BASELINE || []).map(b => b.fact).concat(st.carry || []).concat(seeds);
    const rows = all.filter((v, i) => all.indexOf(v) === i).map(id => {
      const f = D.factById(id); if (!f) return '';
      const on = seeds.includes(id);
      return `<label class="sim-seed"><input type="checkbox" data-seed="${id}" ${on ? 'checked' : ''}>
        <span><b>${f.short} · ${f.date}</b><small>${f.title}${(st.carry || []).includes(id) ? '（来自关联层携带）' : '（统一用户故事种子）'}</small></span></label>`;
    }).join('');
    const base = (D.BASELINE || []).map(b => `<div class="sim-kv"><span>${b.k}</span><b>${b.v}</b></div>`).join('');
    dom.seeds.innerHTML = rows +
      `<p class="sim-note" style="margin-top:8px">可计算基线（现实基线 · 演示样例）：</p>${base}
       <p class="sim-note" style="margin-top:6px">缺失项：竞争市场采购能力没有现实台账 → 标记为「模拟参数」，不伪装为事实。</p>`;
    dom.seeds.querySelectorAll('[data-seed]').forEach(el => el.onchange = () => S.set({ sim: F.toggleSeed(S.state, el.dataset.seed, el.checked) }));
  }

  /* ---------- 两个核心指标 ---------- */
  function indicatorValue(st, dv, ind) {
    const rs = ROUNDS();
    const r = rs[Math.min(Math.max(dv.round, 1), rs.length) - 1];
    if (!r) return { num: ind.numV, den: ind.denV, share: ind.base };
    const num = ind.id === 'A' ? r.numA : r.numB;
    const den = ind.id === 'A' ? r.denA : r.denB;
    return { num, den, share: num / den };
  }
  function delta(a, b) {
    const d = (b - a) * 100;
    return (d >= 0 ? '+' : '') + d.toFixed(1) + ' 个百分点';
  }
  function renderIndicators(st, dv) {
    const r0 = ROUNDS()[0] || {};
    dom.ind.innerHTML = (D.INDICATORS || []).map(ind => {
      const cur = indicatorValue(st, dv, ind);
      const show = cur.share;
      const rev = dv.round > 0;
      return `<div class="sim-ind">
        <div class="ind-h"><b>${ind.id} · ${ind.n}</b><span class="sim-badge">${ind.window}</span></div>
        <div class="ind-grid">
          <div class="sim-kv"><span>分子 · ${ind.num}</span><b>${cur.num.toLocaleString()} ${ind.unit}</b></div>
          <div class="sim-kv"><span>分母 · ${ind.den}</span><b>${cur.den.toLocaleString()} ${ind.unit}</b></div>
          <div class="sim-kv"><span>口径</span><b>${ind.caliber}</b></div>
          <div class="sim-kv"><span>演示基线</span><b>${ind.baseText}</b></div>
        </div>
        <div class="ind-value"><span class="iv">${(show * 100).toFixed(1)}%</span>
          <span class="sim-badge ${rev ? 'val' : ''}">${rev ? '模拟结果 · 第 ' + dv.round + ' 轮' : '现实基线'}</span>
          <span class="ind-delta ${show >= ind.base ? 'up' : 'down'}">${rev ? delta(ind.base, show) + ' vs 基线' : '基线值'}</span></div>
        <div class="ind-cites">${(ind.facts || []).map(f => `<span class="sim-cite" data-cite="fact:${f}">事实 · ${(D.factById(f) || {}).short || f}</span>`).join('')}</div>
        <div class="ind-trend">${ROUNDS().map(r => {
          const v = ind.id === 'A' ? r.shareA : r.shareB;
          const on = r.n <= dv.round;
          return `<i class="${on ? 'on' : ''}" style="height:${Math.max(12, (v - 0.30) * 2000 / 10)}%" title="第 ${r.n} 轮 ${(v * 100).toFixed(1)}%"></i>`;
        }).join('')}<span class="trend-cap">12 轮轨迹（未执行轮次为空心）</span></div>
      </div>`;
    }).join('');
  }

  /* ---------- 参数 / 轮次 / 报告 / 追问 / 侧栏 ---------- */
  const TYPE_CLS = { '现实基线': 'base', '规则参数': 'rule', '模拟参数': 'simfmt', '用户假设': 'assume', '模型推断': 'infer', '建议': 'advice', '模拟结果': 'val', '待复核': 'review' };
  const tag = t => `<span class="sim-tag ${TYPE_CLS[t] || ''}">${t}</span>`;

  function renderParams(st) {
    const A = st.sim.assumption || {};
    dom.params.innerHTML = (D.PARAMS || []).map(p => {
      let v = p.v;
      if (p.key === 'supply') v = '+' + A.supply + '%（马来西亚对湖南）';
      return `<div class="sim-kv"><span>${p.k}</span><b>${v}</b>${tag(p.type)}</div>`;
    }).join('') + `<p class="sim-note" style="margin-top:8px">当前 run：${st.sim.run} · context_version=${st.sim.contextVersion}；修改关键假设将创建新 run（历史 run 与报告保持不变）。</p>`;
  }

  function renderRounds(st, dv) {
    dom.roundMeta.textContent = dv.round + '/' + ROUNDS().length + ' 轮 · 每轮 2.5 天';
    dom.rounds.innerHTML = ROUNDS().map(r => {
      const open = r.n <= dv.round;
      const hot = !dv.done && dv.round === r.n - 1 && dv.step === 8 && st.sim.status === 'running';
      const failed = st.sim.status === 'failed' && st.sim.failRound === r.n;
      return `<div class="sim-round${hot ? ' hot' : ''}${open ? '' : ' pending'}" data-round="${r.n}">
        <div class="rh"><span class="rn">${r.n}</span><b>${r.title}</b><small>第 ${r.day} 天</small></div>
        ${open ? `<div class="rb">
          <p><b>动作：</b>${r.actions.join('；')}</p>
          <p><b>事件：</b>${r.events}</p>
          <div class="rvals"><span>流入占比 ${(r.shareA * 100).toFixed(1)}%</span><span>市场份额 ${(r.shareB * 100).toFixed(1)}%</span><span>批发价 ${r.price.toFixed(1)} 元/kg</span><span>周转 ${r.turnover.toFixed(1)} 天</span></div>
          <div class="sig">信号：${r.signal.status} · 不确定度 ${r.signal.uncertainty.toFixed(2)} · Provider ${r.signal.provider}${st.sim.sidecar === 'degraded' ? '（Jev 降级：改用规则基线）' : ''}</div>
          ${failed ? '<div class="sig fail"><b>失败：</b>渠道 Agent 超时（8s 未响应），本轮状态未写入推演图谱。可点「从第 ' + r.n + ' 轮重试」继续。</div>' : ''}
          <div class="sim-cites">${(r.cites.facts || []).map(f => citeChip({ fact: f })).join('')}${(r.cites.relations || []).map(x => citeChip({ rel: x })).join('')}${(r.cites.steps || []).map(n => `<span class="sim-cite" data-cite="step:${n}">步骤 ${n}</span>`).join('')}</div>
        </div>` : '<div class="rb"><p class="sim-note">待生成：本轮将在步骤 8「进行多轮推演」中按顺序展开。</p></div>'}
      </div>`;
    }).join('');
  }

  function citeChip(c) {
    if (!c) return '';
    if (c.fact) { const f = D.factById(c.fact); return f ? `<span class="sim-cite" data-cite="fact:${c.fact}">事实 · ${f.short}</span>` : ''; }
    if (c.rel) { const r = D.relById(c.rel); return r ? `<span class="sim-cite" data-cite="rel:${c.rel}">关系 · ${r.type}（置信 ${(r.confidence * 100).toFixed(0)}%）</span>` : ''; }
    if (c.round) return `<span class="sim-cite" data-cite="round:${c.round}">轮次 · 第 ${c.round} 轮</span>`;
    if (c.step) return `<span class="sim-cite" data-cite="step:${c.step}">步骤 ${c.step}</span>`;
    return '';
  }

  function renderReport(st, dv) {
    const generated = dv.i > program().indexOf(11) || dv.done;
    dom.report.innerHTML = (D.REPORT || []).map((s, i) => {
      const open = generated || st.sim.report >= (D.REPORT || []).length && dv.step === 12;
      return open
        ? `<div class="sim-rep-sec"><h5>${s.h}</h5><ul>${s.bullets.map(b => `<li>${tag(b.label)}${b.t} ${citeChip(b.cite)}</li>`).join('')}</ul></div>`
        : `<div class="sim-rep-sec" style="margin-top:8px"><h5 class="dim">${s.h}</h5><div class="sim-pending">待生成：在步骤 11「生成决策报告」完成（不提前显示结论）</div></div>`;
    }).join('') +
    `<p class="sim-note" style="margin-top:10px">报告为推演结果页，属于推演层；每个要点都可回链事实、关系与轮次。标签说明：${['现实基线', '模型推断', '模拟结果', '建议'].map(t => tag(t)).join(' ')}。全部数值为演示样例数据。</p>`;
  }

  function renderQa(st, dv) {
    const asked = st.sim.qa || [];
    const open = dv.done || dv.step === 12;
    dom.qa.innerHTML = (D.QA || []).map((qa, i) => {
      const done = asked.includes(i);
      return `<div class="qa-item${done ? ' open' : ''}">
        <button class="qa-q" data-qa="${i}" ${open ? '' : 'disabled'}>${qa.q}<span class="sim-tag ${qa.newRun ? 'assume' : 'infer'}">${qa.kind}</span></button>
        ${done ? `<div class="qa-a">${qa.a}<div class="sim-cites">${(qa.cites || []).map(c => citeChip({ rel: c }).startsWith('relation') ? citeChip({ rel: c }) : citeChip({ fact: c })).join('')}</div></div>` : ''}
      </div>`;
    }).join('') + (open ? '' : '<p class="sim-note">步骤十二「深度追问」在报告完成后解锁。</p>');
  }

  function renderSide(st) {
    const sd = D.SIDECAR || {};
    const degraded = st.sim.sidecar === 'degraded';
    const lo = degraded ? sd.base.lo + 0.16 : sd.base.lo, hi = degraded ? sd.base.hi + 0.22 : sd.base.hi;
    dom.side.className = 'sim-card sim-side' + (degraded ? ' degraded' : '');
    dom.side.innerHTML = `
      <h4>${sd.n || 'Jev 旁路模型信号'} <small>只做参考 · 不参与事实入层</small></h4>
      <div class="sim-kv"><span>状态</span><b>${degraded ? '降级 · ' + sd.degrade : (sd.version || '接入已就绪（示意）')}</b></div>
      <div class="sim-kv"><span>Provider</span><b>${sd.provider}</b></div>
      <div class="sim-kv"><span>最近更新</span><b>${sd.updated}</b></div>
      <div class="sim-kv"><span>不确定性</span><b>${lo.toFixed(2)} – ${hi.toFixed(2)}</b></div>
      <div class="unc"><div class="b"><i style="left:${(lo * 100).toFixed(0)}%;width:${((hi - lo) * 100).toFixed(0)}%"></i></div></div>
      ${degraded ? `<div class="sim-note" style="color:#b45309;margin-top:6px">降级原因：${sd.degrade}。影响：轮次置信度改用规则基线；Jev 信号不写入事实、关系与种子。</div>` : ''}
      <div class="sim-note" style="margin-top:6px">${sd.note || ''}</div>
      <div class="sim-note" style="margin-top:6px"><b>密钥说明：</b>本页不接收、不记录、不提交任何密钥；Jev 钥匙只在服务端配置，页面只展示接入状态。</div>
      <div class="sim-sec">
        <div class="sim-kv"><span>run_id</span><b>${st.sim.run}</b></div>
        <div class="sim-kv"><span>context_version</span><b>${st.sim.contextVersion}</b></div>
        <div class="sim-kv"><span>现实图谱</span><b>只读引用</b></div>
        <div class="sim-kv"><span>推演图谱</span><b>当前 run 可变 · 不写回现实</b></div>
        ${(st.sim.runs || []).length > 1 ? `<div class="sim-kv"><span>历史 run</span><b>${st.sim.runs.join(' · ')}</b></div>` : ''}
      </div>`;
  }

  function renderLog(st, dv) {
    const lines = [];
    const p = program();
    if (dv.i >= 3) lines.push('[上下文] GraphRAG 子图完成 · context_version=' + st.sim.contextVersion);
    if (dv.i >= 4) lines.push('[隔离] run_id=' + st.sim.run + ' · 现实图谱只读');
    if (dv.i >= 5) lines.push('[Agent] ' + (D.AGENTS || []).length + ' 个农业角色 Agent 就绪');
    if (dv.i >= 6) lines.push('[参数] 12 轮 × 2.5 天 = 30 天 · 供应 +' + (st.sim.assumption || {}).supply + '%（用户假设）');
    if (dv.i >= 7) lines.push('[事件] 注入：马来西亚对湖南供应增长 20%');
    ROUNDS().slice(0, dv.round).forEach(r => lines.push('[轮次] 第 ' + r.n + ' 轮 ' + r.title + ' · 流入占比 ' + (r.shareA * 100).toFixed(1) + '%'));
    if (dv.i > p.indexOf(11)) lines.push('[报告] ReportAgent 生成 ' + (D.REPORT || []).length + ' 节 · 每节分离事实/推断/模拟/建议');
    if (dv.i >= p.length) lines.push('[追问] 步骤十二可用 · 新假设将创建新 run');
    if (st.sim.sidecar === 'degraded') lines.push('[降级] Jev 超时 → 轮次置信度改用规则基线');
    if (st.sim.offline) lines.push('[离线] 离线回放模式 · 使用本地记录（示意）');
    if (st.sim.status === 'failed') lines.push('[失败] 第 ' + (st.sim.failRound || '') + ' 轮 Agent 超时');
    dom.log.innerHTML = (lines.length ? lines : ['[待运行] 点「开始推演」按五阶段十二步骤推进']).map(l => '<div>' + l + '</div>').join('');
    dom.log.scrollTop = dom.log.scrollHeight;
  }

  function bindCites(st, dv) {
    root.querySelectorAll('[data-cite]').forEach(el => el.onclick = () => {
      const [kind, id] = el.dataset.cite.split(':');
      if (kind === 'fact') S.set({ tab: 'fact', factId: id });
      else if (kind === 'rel') S.set({ tab: 'relation', rel: { sel: id, kind: 'relation' } });
      else if (kind === 'round') {
        const n = Number(id);
        S.set({ sim: { hotRound: n } });
        const node = root.querySelector('[data-round="' + n + '"]');
        if (node) { node.classList.add('hot'); node.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        S.emit('toast', '定位到第 ' + n + ' 轮');
      } else if (kind === 'step') {
        const n = Number(id);
        const sp = (D.STEPS || []).find(x => x.n === n);
        S.emit('toast', '步骤 ' + n + '：' + (sp ? sp.t : ''));
        const node = root.querySelector('.sim-step:nth-child(1)');
        if (node) node.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    });
    root.querySelectorAll('[data-qa]').forEach(el => el.onclick = () => {
      const i = Number(el.dataset.qa);
      const qa = (D.QA || [])[i]; if (!qa) return;
      const asked = (S.state.sim.qa || []).slice();
      if (asked.indexOf(i) < 0) asked.push(i);
      const patch = { qa: asked };
      if (qa.newRun) {   // 关键假设变化 → 新 run（原 run 与报告保持不变）
        const runs = (S.state.sim.runs || []).slice();
        if (runs.indexOf(qa.newRun.id) < 0) runs.push(qa.newRun.id);
        patch.runs = runs;
        patch.run = qa.newRun.id;
        patch.assumption = { supply: qa.newRun.assumption, compete: (S.state.sim.assumption || {}).compete };
      }
      S.set({ sim: patch });
      S.emit('toast', qa.newRun ? '已创建新 run ' + qa.newRun.id + '（供应增幅 ' + qa.newRun.assumption + '%）· 原 run 保留' : '已按当前 run 回答');
    });
  }

  function update() {
    if (!root) return;
    const st = S.state;
    const key = JSON.stringify([st.sim.tick, st.sim.status, st.sim.report, st.sim.offline, st.sim.sidecar, st.sim.seedIds, st.carry, st.sim.failRound, st.sim.qa, st.sim.run, st.sim.assumption, st.sim.speed]);
    if (key === sig) return; sig = key;
    const dv = derived(st);
    renderHead(st, dv);
    renderStages(st, dv); renderCurrent(st, dv); renderSeeds(st);
    renderIndicators(st, dv); renderParams(st); renderRounds(st, dv); renderReport(st, dv); renderQa(st, dv); renderSide(st); renderLog(st, dv);
    bindCites(st, dv);
    if (st.sim.status === 'running' && !timer) start();
    if (st.sim.status !== 'running' && timer) stop();
  }

  const debug = () => {
    const st = S.state, dv = derived(st);
    return {
      scenario: st.sim.scenario, stages: (D.STAGES || []).length, steps: (D.STEPS || []).length,
      stage: dv.stage, step: dv.step, round: dv.round, rounds: ROUNDS().length, tick: st.sim.tick,
      status: st.sim.status, sidecar: st.sim.sidecar, run: st.sim.run, runs: (st.sim.runs || []).length,
      seeds: seedsOf(st).length, report: (D.REPORT || []).length,
      renderedStages: root ? root.querySelectorAll('.sim-stageblk').length : 0,
      renderedSteps: root ? root.querySelectorAll('.sim-step').length : 0,
      renderedRounds: root ? root.querySelectorAll('.sim-round').length : 0,
      indicators: root ? root.querySelectorAll('.sim-ind').length : 0
    };
  };

  return { mount, update, debug, progress: () => derived(S.state), streamLines: () => (window.V03Data.STREAM_SIM || []) };
})();
