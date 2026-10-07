/* 推演层 V0.2：离线交互原型。运行、附件和报告均是浏览器内演示，不写现实事实。 */
window.V03Sim = (function () {
  const S = window.V03Store, D = window.V03Data;
  const STAGES = ['本体确认', 'GraphRAG 构建', '生成 Agent 人设', '生成模拟配置', '初始方向启动', '双/单环境推演', '报告生成'];
  const STORE_KEY = 'agrilink-prd-sim-v02';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const initial = () => ({runs:[], current:null, page:'start', reportTab:'report', prompt:'', seedCleared:false,
    attachment:null, config:{period:'最近 3 个月', rounds:40, environment:'双环境', style:'专家风格'}});
  let state = initial(), root, timer;
  try { state = Object.assign(initial(), JSON.parse(localStorage.getItem(STORE_KEY) || 'null') || {}); } catch (_) {}
  const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) {} };
  const current = () => state.runs.find(r => r.id === state.current);
  const seedIds = () => [...new Set([...(S.state.carry || []), S.state.factId, S.state.rel?.focusFact].filter(Boolean))];
  const relationSeed = () => S.state.rel?.sel && D.relById(S.state.rel.sel) ? S.state.rel.sel : null;
  const seedCount = () => state.seedCleared ? 0 : seedIds().length + (relationSeed() ? 1 : 0);
  const evidenceLabel = c => c.fact ? `现实事实 ${c.fact}` : c.rel ? `现实关系 ${c.rel}` : c.round ? `第 ${c.round} 轮模拟事件` : '推演生成，无现实证据';
  const reportSections = D.REPORT || [];
  const demoRounds = D.ROUNDS || [];
  const stageAt = run => Math.min(6, Math.floor((Date.now() - run.startedAt) / 2600));
  const isDone = run => Date.now() - run.startedAt >= 7 * 2600;
  function reconcile() {
    for (const r of state.runs) if (r.status === 'running' && isDone(r)) r.status = 'done';
    save();
  }
  const shell = body => `<div class="prd-sim"><div class="prd-top"><strong>推演层 <span>PRD V0.2 原型</span></strong><span>演示运行 · 现实数据只读 · 模拟结果不写回事实与关联层</span><button data-action="new">＋ 新建推演</button></div>${body}</div>`;
  const history = () => `<aside class="prd-history"><h3>历史推演</h3>${state.runs.length ? state.runs.map(r => `<button data-run="${esc(r.id)}" class="prd-history-item ${r.id===state.current?'active':''}"><b>${esc(r.title)}</b><small>${r.status==='done'?'已完成':'运行中'} · ${new Date(r.startedAt).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</small></button>`).join('') : '<p>暂无推演记录</p>'}</aside>`;
  function startPage() {
    const attachment = state.attachment ? `<span class="prd-chip">${esc(state.attachment.name)} · ${esc(state.attachment.status)} <button data-action="remove-attachment">删除</button></span>` : '';
    const seed = seedIds().length + (relationSeed()?1:0);
    return shell(`<div class="prd-start">${history()}<main class="prd-compose"><div class="prd-intro"><span>AgriLink Simulation</span><h1>从现实依据出发，推演经营选择</h1><p>输入经营问题，查看系统种子与模拟假设，再发起一次独立推演。</p></div><div class="prd-editor"><div class="prd-seeds">${seed ? `<span class="prd-chip">系统种子 · ${seedIds().length} 条事实${relationSeed()?' / 1 条关系':''}</span><button data-action="seed">${state.seedCleared?'恢复':'清空'}</button>` : '<span>暂无系统种子，可直接输入推演要求</span>'}${attachment}</div><div id="prdPrompt" class="prd-prompt" role="textbox" aria-label="推演要求" contenteditable="true" data-placeholder="例如：评估长沙市场车厘子促销对价格、库存和销量的影响……">${esc(state.prompt)}</div><div class="prd-editor-actions"><label class="prd-file">＋ 添加附件<input id="prdFile" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.md,.markdown" hidden></label><button data-action="config">⚙ 配置项</button><button class="primary" data-action="launch" ${(state.prompt.trim()||seedCount())?'':'disabled'}>发起推演 →</button></div></div><p class="prd-note">此版本是离线演示：Markdown 可在浏览器读取；PDF、Word、Excel 需要后端解析。此离线原型不使用附件参与计算，附件不计入启动条件。</p></main><aside class="prd-recommend"><h3>推荐方向</h3><p>演示建议 · 点击填入输入框</p>${['评估榴莲供应增加后红星市场份额的变化','评估车厘子促销对长沙市场销量和库存的影响','分析辣椒运输受阻时的价格与渠道风险'].map(x=>`<button data-suggest="${esc(x)}">${esc(x)} <span>↗</span></button>`).join('')}</aside></div>${configDialog()}`);
  }
  function configDialog() {
    if (!state.showConfig) return '';
    const c=state.config;
    return `<div class="prd-modal" role="dialog" aria-modal="true" aria-label="推演配置"><div class="prd-modal-box"><h3>推演配置</h3><label>历史数据周期<select id="prdPeriod">${['最近 1 个月','最近 3 个月','最近 6 个月'].map(x=>`<option ${c.period===x?'selected':''}>${x}</option>`).join('')}</select></label><label>推演轮次 · <output id="prdRoundLabel">${c.rounds}</output> 天<input id="prdRounds" type="range" min="10" max="40" value="${c.rounds}"></label><label>环境模式<select id="prdEnvironment">${['双环境','市场交易环境','产业协作环境'].map(x=>`<option ${c.environment===x?'selected':''}>${x}</option>`).join('')}</select></label><p>报告风格：专家风格（Markdown）</p><div class="prd-modal-actions"><button data-action="close-config">取消</button><button class="primary" data-action="save-config">保存</button></div></div></div>`;
  }
  function graph(run, stage) {
    const n = Math.min(5, stage===0 ? 3 : 5), agents=(D.AGENTS||[]).slice(0,n);
    const positions=[[90,145],[280,65],[280,225],[470,95],[470,225]];
    const lines=stage>=1 ? [[0,1],[0,2],[1,3],[2,4],[3,4]] : [];
    return `<div class="prd-graph"><small>固定榴莲示例图谱 · 用于展示七阶段变化</small><svg viewBox="0 0 570 300" role="img" aria-label="现实关系为蓝色实线，模拟新增关系为橙色虚线">${lines.map(([a,b])=>`<line x1="${positions[a][0]}" y1="${positions[a][1]}" x2="${positions[b][0]}" y2="${positions[b][1]}" stroke="#4e87aa" stroke-width="2"/>`).join('')}${stage>=5?'<line x1="470" y1="225" x2="90" y2="145" stroke="#d9864a" stroke-width="2.5" stroke-dasharray="7 6"/>':''}${agents.map((a,i)=>`<g data-node="${esc(a.id)}" role="button" tabindex="0"><circle cx="${positions[i][0]}" cy="${positions[i][1]}" r="25" fill="${i===0?'#d7e8db':'#d9e9ee'}" stroke="#3e729a" stroke-width="2"/><text x="${positions[i][0]}" y="${positions[i][1]+43}" text-anchor="middle" font-size="12" fill="#243c42">${esc(a.n.replace(' Agent',''))}</text></g>`).join('')}</svg><div class="prd-legend"><span>━ 现实关系</span><span>┄ 模拟新增（仅本次 run）</span></div><p id="prdNodeDetail">点击节点查看主体与支撑来源。</p></div>`;
  }
  function runningPage(run) {
    const stage=stageAt(run);
    return shell(`<div class="prd-run-head"><div><button data-action="back-start">← 发起页</button><small>${esc(run.id)}</small><h2>${esc(run.title)}</h2><p>运行中 · ${esc(run.config.environment)} · ${run.config.rounds} 轮 · 演示流程</p></div><span class="prd-progress">第 ${stage+1} / 7 阶段</span></div><div class="prd-running"><section class="prd-graph-panel"><h3>推演知识图谱</h3>${graph(run,stage)}</section><aside class="prd-stage-panel"><h3>阶段进程</h3>${STAGES.map((x,i)=>`<div class="prd-stage ${i<stage?'done':i===stage?'active':''}"><span>${i+1}</span><b>${x}</b><small>${i<stage?'已完成':i===stage?'进行中':'等待中'}</small></div>`).join('')}<div class="prd-agent-box"><h4>本次参与主体</h4>${(D.AGENTS||[]).slice(0,5).map(a=>`<p>${esc(a.n)} · ${esc(a.role)}</p>`).join('')}</div></aside></div><div class="prd-terminal"><b>处理日志</b>${STAGES.slice(0,stage+1).map((x,i)=>`<div>[${new Date(run.startedAt+i*2600).toLocaleTimeString('zh-CN')}] ${esc(x)} · ${i===stage?'处理中':'完成'}${i===5?' · 模拟事件写入本次 run':''}</div>`).join('')}</div>`);
  }
  function reportBody(run) {
    return `<article class="prd-report"><h1>马来西亚榴莲供应增量 · 固定演示报告</h1><p class="prd-report-sub">发起问题：${esc(run.title)} · ${esc(run.id)} · 专家风格</p><div class="prd-disclaimer">本页沿用固定的榴莲示例数据，尚未根据发起问题进行计算。现实依据、模型推断、模拟结果与建议分别标注；数值仅用于演示，不构成实际预测。</div>${reportSections.map((sec,si)=>`<section id="report-${si}"><h2>${esc(sec.h)}</h2>${sec.bullets.map((b,bi)=>`<p><span class="prd-type">${esc(b.label)}</span>${esc(b.t)} <button class="prd-cite" data-cite="${si}:${bi}" title="${esc(evidenceLabel(b.cite||{}))}">[${si+1}.${bi+1}]</button></p>`).join('')}</section>`).join('')}<button data-action="export">导出 HTML 报告</button></article>`;
  }
  function reportPage(run) {
    return shell(`<div class="prd-report-head"><button data-action="back-start">← 发起页</button><span>${esc(run.id)} · 已完成</span><button data-action="new">＋ 新建推演</button></div><div class="prd-report-layout"><main class="prd-report-main"><div class="prd-report-tabs"><button data-report="report" class="${state.reportTab==='report'?'active':''}">推演报告</button><button data-report="graph" class="${state.reportTab==='graph'?'active':''}">推演知识图谱</button></div>${state.reportTab==='graph'?graph(run,6):reportBody(run)}</main><aside class="prd-report-side"><h3>参与 Agent</h3><div class="prd-agent-list">${(D.AGENTS||[]).slice(0,5).map(a=>`<button data-agent="${esc(a.id)}">${esc(a.n)} <small>${esc(a.role)}</small></button>`).join('')}</div><h3>深度追问</h3><div class="prd-chat" id="prdChat">${(run.qa||[]).map(m=>`<div class="${m.who==='user'?'user':''}"><b>${esc(m.who)}</b><p>${esc(m.text)}</p>${m.who!=='user'?'<button data-like="'+esc(m.id)+'">'+(m.liked?'已认可':'👍 认可')+'</button>':''}</div>`).join('')}</div><div class="prd-suggest">${(D.QA||[]).slice(0,3).map(q=>`<button data-question="${esc(q.q)}">${esc(q.q)}</button>`).join('')}</div><textarea id="prdQuestion" rows="3" placeholder="围绕本次报告追问…"></textarea><button class="primary" data-action="ask">发送追问</button></aside></div><div class="prd-evidence" id="prdEvidence" hidden></div>`);
  }
  function render() {
    if (!root) return;
    reconcile();const run=current();
    if (run && state.page!=='start') root.innerHTML=run.status==='done'?reportPage(run):runningPage(run);
    else root.innerHTML=startPage();
    bind();
  }
  function begin() {
    const prompt=root.querySelector('#prdPrompt')?.innerText.trim() || state.prompt.trim();
    if (!prompt && !seedCount()) return;
    state.prompt=prompt;
    const id=`run_${new Date().toISOString().slice(0,10).replaceAll('-','')}_${String(state.runs.length+1).padStart(3,'0')}`;
    const r={id,title:(prompt||'基于系统种子的农业经营推演').slice(0,30),status:'running',startedAt:Date.now(),config:{...state.config},seeds:state.seedCleared?[]:seedIds(),relation:state.seedCleared?null:relationSeed(),qa:[]};
    state.runs.unshift(r);state.current=id;state.page='run';save();render();
  }
  function bind() {
    root.querySelector('#prdPrompt')?.addEventListener('input', e=>{state.prompt=e.target.innerText;save();const button=root.querySelector('[data-action="launch"]');if(button)button.disabled=!state.prompt.trim()&&!seedCount();});
    root.querySelector('#prdPrompt')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();begin();}});
    root.querySelector('#prdFile')?.addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;state.attachment={name:f.name,size:f.size,status:/\.(md|markdown)$/i.test(f.name)?'已读取（演示）':'待后端解析',text:/\.(md|markdown)$/i.test(f.name)?(await f.text()).slice(0,30000):''};save();render();});
    root.querySelector('#prdRounds')?.addEventListener('input',e=>root.querySelector('#prdRoundLabel').textContent=e.target.value);
    root.querySelectorAll('[data-action]').forEach(el=>el.onclick=()=>{
      const a=el.dataset.action;
      if(a==='launch')begin();
      if(a==='seed'){state.seedCleared=!state.seedCleared;save();render();}
      if(a==='remove-attachment'){state.attachment=null;save();render();}
      if(a==='config'||a==='close-config'){state.showConfig=a==='config';render();}
      if(a==='save-config'){state.config={period:root.querySelector('#prdPeriod').value,rounds:+root.querySelector('#prdRounds').value,environment:root.querySelector('#prdEnvironment').value,style:'专家风格'};state.showConfig=false;save();render();}
      if(a==='new'||a==='back-start'){state.page='start';state.current=null;state.prompt='';save();render();}
      if(a==='ask'){const text=root.querySelector('#prdQuestion').value.trim(),r=current();if(!text||!r)return;const answer=(D.QA||[]).find(q=>q.q===text)?.a||'这是当前演示报告的追问示意。请沿报告引用核对现实事实与模拟事件；更改关键假设需创建新推演。';r.qa.push({who:'user',text,id:Date.now()+'u'},{who:(D.AGENTS||[])[0]?.n||'农业 Agent',text:answer,id:Date.now()+'a',liked:false});save();render();}
      if(a==='export'){const r=current(),html='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>'+esc(r.title)+'</title><body>'+root.querySelector('.prd-report').innerHTML+'</body></html>';const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=r.id+'.html';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    });
    root.querySelectorAll('[data-run]').forEach(el=>el.onclick=()=>{state.current=el.dataset.run;state.page='run';save();render();});
    root.querySelectorAll('[data-suggest]').forEach(el=>el.onclick=()=>{state.prompt=el.dataset.suggest;save();render();root.querySelector('#prdPrompt')?.focus();});
    root.querySelectorAll('[data-report]').forEach(el=>el.onclick=()=>{state.reportTab=el.dataset.report;save();render();});
    root.querySelectorAll('[data-question]').forEach(el=>el.onclick=()=>{root.querySelector('#prdQuestion').value=el.dataset.question;root.querySelector('#prdQuestion').focus();});
    root.querySelectorAll('[data-like]').forEach(el=>el.onclick=()=>{const m=current()?.qa.find(x=>x.id===el.dataset.like);if(m){m.liked=!m.liked;save();render();}});
    root.querySelectorAll('[data-cite]').forEach(el=>el.onclick=()=>{const [i,j]=el.dataset.cite.split(':').map(Number),b=reportSections[i].bullets[j],pane=root.querySelector('#prdEvidence');pane.hidden=false;pane.innerHTML=`<button data-close="evidence">关闭 ×</button><h3>证据回溯</h3><p>${esc(evidenceLabel(b.cite||{}))}</p><p>${esc(b.t)}</p><small>现实事实可返回事实层查阅；模拟事件只属于 ${esc(current().id)}。</small>`;pane.querySelector('[data-close]').onclick=()=>pane.hidden=true;});
    root.querySelectorAll('[data-agent]').forEach(el=>el.onclick=()=>{const a=(D.AGENTS||[]).find(x=>x.id===el.dataset.agent),pane=root.querySelector('#prdEvidence');pane.hidden=false;pane.innerHTML=`<button data-close="agent">关闭 ×</button><h3>${esc(a.n)}</h3><p>${esc(a.role)} · ${esc(a.behav)}</p><p>约束：${esc(a.cons)}</p><p>现实依据：${esc(a.src)}</p>`;pane.querySelector('[data-close]').onclick=()=>pane.hidden=true;});
    root.querySelectorAll('[data-node]').forEach(el=>el.onclick=()=>{const a=(D.AGENTS||[]).find(x=>x.id===el.dataset.node),p=root.querySelector('#prdNodeDetail');if(p)p.textContent=`${a.n}：${a.role}。现实依据：${a.src}`;});
  }
  function mount(el){root=el;render();timer=setInterval(()=>{if(S.state.tab==='sim'&&current()?.status==='running')render();},900);}
  function update(){if(S.state.tab==='sim')render();}
  return {mount,update,debug:()=>({page:state.page,runs:state.runs.length,current:state.current,status:current()?.status})};
})();
