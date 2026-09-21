/* ============================================================
   「AI 配置」产品入口 —— 右上角 ⚙ AI 配置
   两条分支：
   A. 本地演示服务（同源代理可用）：完整配置面板 —— Provider / Base URL / Model（可从 /models 刷新）
      / API Key（只显示「已配置 + 末尾 4 位」，输入框永不回显原值）/ 超时 / 最大输出长度 / 温度
      / 测试连接 / 保存配置 / 恢复默认 / 从本机已有配置导入；并显示运行模式与最后一次成功 / 失败时间。
   B. 公开静态版（GitHub Pages）：明确提示「静态公开版没有安全后端」，
      不渲染任何 key 输入框与保存按钮，只给「打开本地演示地址 / 查看部署说明」。
   安全：key 只经服务端配置 API 落盘到本机 0600 配置文件；前端不落 localStorage / URL / DOM / 日志。
   ============================================================ */
window.AGRI_AICFG = (function () {
  const LOCAL_DEMO = 'http://127.0.0.1:4173/';
  const DEPLOY_DOC = 'https://github.com/UpStarData/agri-llm-demo#ai-问答两种模式--安全降级';
  let dlg = null, last = null;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const P = () => window.AGRI_PROVIDER;
  const fmt = t => { if (!t) return '—'; const d = new Date(t); return isNaN(d) ? '—' : d.toLocaleString('zh-CN', { hour12: false }); };

  function el() {
    if (dlg) return dlg;
    dlg = document.createElement('div');
    dlg.className = 'cfg-mask';
    dlg.id = 'aiCfg';
    dlg.setAttribute('hidden', '');
    dlg.innerHTML = '<div class="cfg-box" role="dialog" aria-modal="true" aria-label="AI 配置"><div class="cfg-body" id="aiCfgBody"></div></div>';
    dlg.addEventListener('click', e => { if (e.target === dlg) close(); });
    document.body.appendChild(dlg);
    return dlg;
  }

  function close() { if (dlg) dlg.setAttribute('hidden', ''); }
  function open() {
    el().removeAttribute('hidden');
    render();
  }

  /* ---------- 分支 B：公开静态版 ---------- */
  function staticHtml() {
    const st = P().state;
    return `<div class="cfg-head"><b>AI 配置</b><button class="cfg-x" id="cfgClose" aria-label="关闭">✕</button></div>
      <div class="cfg-note warn">
        <b>静态公开版没有安全后端。</b>
        这个页面是纯静态托管（GitHub Pages），没有服务端代理，所以
        <b>这里不提供 API Key 输入框</b>：任何写在前端的 key 都会进入 bundle / 浏览器存储 / 网络请求，等于公开泄露。
      </div>
      <div class="cfg-sec">公开版当前行为</div>
      <div class="cfg-line">运行模式：<b>规则演示</b>（${esc(st.reason || '无同源代理')}）</div>
      <div class="cfg-line">问答能力：基于当前对象 / 全局问题的本地规则化分析，全部标注「示意 · 待标定」</div>
      <div class="cfg-sec">要接真实模型，用本机演示服务</div>
      <ol class="cfg-ol">
        <li>在本机项目目录执行 <code>node server.mjs</code>（或 <code>npm run serve</code>）</li>
        <li>打开 <a href="${LOCAL_DEMO}" target="_blank" rel="noopener">${LOCAL_DEMO}</a>（只监听本机 127.0.0.1）</li>
        <li>在本地页面的「⚙ AI 配置」里选 Provider、填 Base URL，粘贴一次 key → 测试连接 → 保存</li>
      </ol>
      <div class="cfg-row">
        <a class="cfg-btn primary" href="${LOCAL_DEMO}" target="_blank" rel="noopener">打开本地演示地址</a>
        <a class="cfg-btn" href="${DEPLOY_DOC}" target="_blank" rel="noopener">查看部署说明</a>
      </div>
      <div class="cfg-foot">安全规则：公开 Pages 永不携带计费 key；密钥只允许服务端写入本机受限配置文件（0600）。</div>`;
  }

  /* ---------- 分支 A：本地演示服务 ---------- */
  function branchHtml(j) {
    const c = j.config, st = P().state;
    const providers = (j.providers || []).map(p => `<option value="${p.id}"${p.id === c.provider ? ' selected' : ''}>${esc(p.label)}</option>`).join('');
    const models = (j.models || []).concat(c.model ? [] : []).filter((v, i, a) => a.indexOf(v) === i);
    const modelList = models.map(m => `<option value="${esc(m)}"${m === c.model ? ' selected' : ''}>${esc(m)}</option>`).join('');
    const envLocked = (c.envLocked || []);
    const mode = j.mode === 'live' ? `真实模型已连接（${esc(c.model)}）`
      : j.mode === 'unconfigured' ? '未配置模型凭证（规则演示）' : `连接失败（规则演示）：${esc((j.verify && j.verify.reason) || '')}`;
    return `<div class="cfg-head"><b>AI 配置</b><span class="cfg-mode ${j.mode}">${mode}</span><button class="cfg-x" id="cfgClose" aria-label="关闭">✕</button></div>
      <div class="cfg-note">
        key 只保存在服务端本地受限配置文件（<code>${esc(c.configFile)}</code>，权限 0600），
        <b>页面永不回显完整值</b>，也不写入 localStorage / URL / bundle。
      </div>
      <div class="cfg-grid">
        <label class="cfg-f"><span>Provider</span>
          <select id="cfgProvider">${providers}</select></label>
        <label class="cfg-f"><span>Base URL</span>
          <input id="cfgBaseUrl" value="${esc(c.baseUrl)}" placeholder="https://api.deepseek.com 或 http://127.0.0.1:1234/v1"${envLocked.indexOf('baseUrl') >= 0 ? ' disabled' : ''}></label>
        <label class="cfg-f"><span>Model <em>（可从 /models 刷新）</em></span>
          <span class="cfg-inline"><input id="cfgModel" list="cfgModelList" value="${esc(c.model)}" placeholder="deepseek-flash"><button class="cfg-btn" id="cfgRefreshModels">刷新模型</button></span>
          <datalist id="cfgModelList">${modelList}</datalist></label>
        <label class="cfg-f"><span>API Key</span>
          <span class="cfg-inline"><input id="cfgKey" type="password" autocomplete="off" placeholder="粘贴新 key（留空 = 不改动；页面不回显原值）"><button class="cfg-btn" id="cfgClearKey">清除</button></span>
          <small class="cfg-key">状态：<b>${c.keyConfigured ? '已配置' : '未配置'}</b>${c.keyConfigured ? ` ｜ 末尾 ${esc(c.keyTail)} ｜ 来源 ${esc(c.keySource || '—')}` : ''}${c.hasStoredKey ? ' ｜ 已落盘到本机配置文件' : ''}</small></label>
        <div class="cfg-f3">
          <label class="cfg-f"><span>超时（ms）</span><input id="cfgTimeout" type="number" min="1000" max="600000" step="1000" value="${c.timeoutMs}"></label>
          <label class="cfg-f"><span>最大输出长度（tokens）</span><input id="cfgMaxTokens" type="number" min="64" max="32768" step="64" value="${c.maxTokens}"></label>
          <label class="cfg-f"><span>温度（0–2）</span><input id="cfgTemp" type="number" min="0" max="2" step="0.1" value="${c.temperature}"></label>
        </div>
      </div>
      ${envLocked.length ? `<div class="cfg-note warn">这些字段被环境变量锁定，保存不会改变它们：${envLocked.map(esc).join('、')}</div>` : ''}
      ${c.keyEnvVar ? `<div class="cfg-note warn">当前生效的 key 来自环境变量 <code>${esc(c.keyEnvVar)}</code>，它的优先级高于本机配置文件：
        你在下面保存的 key 会写入配置文件，但<b>只有移除该环境变量后才会生效</b>（上面显示的末尾 4 位仍是环境变量里的那个）。</div>` : ''}
      <div class="cfg-row">
        <button class="cfg-btn primary" id="cfgTest">测试连接</button>
        <button class="cfg-btn primary" id="cfgSave">保存配置</button>
        <button class="cfg-btn" id="cfgReset">恢复默认</button>
        <button class="cfg-btn" id="cfgImportList">从本机已有配置导入</button>
      </div>
      <div class="cfg-result" id="cfgResult"></div>
      <div class="cfg-sec">运行状态</div>
      <div class="cfg-line">当前运行模式：<b>${mode}</b></div>
      <div class="cfg-line">最后一次成功：<b>${fmt(j.lastOkAt || st.lastOkAt)}</b> ｜ 最后一次失败：<b>${fmt(j.lastErrAt || st.lastErrAt)}</b> ｜ 服务端调用 <b>${j.calls || 0}</b> 次</div>
      ${j.lastError ? `<div class="cfg-line err">最近错误：${esc(j.lastError)}</div>` : ''}
      <div class="cfg-line">绑定：配置 API 只监听本机（<code>127.0.0.1</code>）；局域网访问请用 <code>AGRI_BIND</code> 显式放开。</div>
      <div class="cfg-foot">默认候选模型：DeepSeek 云端 <code>deepseek-flash</code> / <code>deepseek-v4-pro</code>；LM Studio 用 <code>GET /v1/models</code> 返回的 id。</div>`;
  }

  function result(msg, cls) {
    const r = document.getElementById('cfgResult');
    if (r) r.innerHTML = `<div class="cfg-res ${cls || ''}">${msg}</div>`;
    else toast(String(msg).replace(/<[^>]+>/g, ''));
  }
  function toast(m) { const t = document.getElementById('toast'); if (t) { t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 2400); } }

  function readForm() {
    const g = id => { const e = document.getElementById(id); return e ? String(e.value || '').trim() : ''; };
    const patch = { baseUrl: g('cfgBaseUrl'), model: g('cfgModel'), provider: g('cfgProvider') };
    const key = g('cfgKey');
    if (key) patch.apiKey = key;                                  // 留空 = 不改动
    if (g('cfgTimeout')) patch.timeoutMs = +g('cfgTimeout');
    if (g('cfgMaxTokens')) patch.maxTokens = +g('cfgMaxTokens');
    if (g('cfgTemp')) patch.temperature = +g('cfgTemp');
    return patch;
  }

  async function render() {
    const body = document.getElementById('aiCfgBody');
    if (!body) return;
    const p = P();
    /* 重绘会把 #cfgResult 一起重建 —— 先把上一条结果留下来，否则「保存 / 测试连接」的
       反馈会在 render() 里被立刻抹掉，用户点了按钮看不到任何结果。 */
    const keep = (() => { const r = document.getElementById('cfgResult'); return r ? r.innerHTML : ''; })();
    if (!p || !p.proxy) { body.innerHTML = staticHtml(); }
    else {
      body.innerHTML = '<div class="cfg-head"><b>AI 配置</b><span class="cfg-mode">加载中…</span></div>';
      try { last = await p.configGet(); body.innerHTML = branchHtml(last); }
      catch (e) { body.innerHTML = `<div class="cfg-head"><b>AI 配置</b><button class="cfg-x" id="cfgClose">✕</button></div><div class="cfg-note warn">读取配置失败：${esc(e && e.message)}</div>${staticHtml().replace(/^<div class="cfg-head">[\s\S]*?<\/div>/, '')}`; }
    }
    wire();
    const r = document.getElementById('cfgResult');
    if (r && keep) r.innerHTML = keep;
  }

  function wire() {
    const on = (id, fn) => { const e = document.getElementById(id); if (e) e.onclick = fn; };
    on('cfgClose', close);
    const p = P();
    if (!p || !p.proxy) return;
    /* Provider 预置：切换即填入该 Provider 的默认 baseUrl（用户可改） */
    const sel = document.getElementById('cfgProvider');
    if (sel) sel.onchange = () => {
      const hit = ((last && last.providers) || []).find(x => x.id === sel.value);
      if (hit && hit.baseUrl) { const b = document.getElementById('cfgBaseUrl'); if (b && !b.disabled) b.value = hit.baseUrl; }
    };
    on('cfgTest', async () => {
      result('测试中…（GET /models，真实请求上游）', 'busy');
      try {
        const r = await p.configTest({ baseUrl: String(document.getElementById('cfgBaseUrl').value).trim(), model: String(document.getElementById('cfgModel').value).trim(), apiKey: String(document.getElementById('cfgKey').value).trim() });
        result(`测试连接：<b>${r.ok ? '成功' : '失败'}</b> ｜ HTTP ${r.status || '—'} ｜ ${r.elapsedMs || 0}ms ｜ 模型 ${r.modelFound === null ? '—' : (r.modelFound ? '在列表中' : '不在列表中')} ${r.models && r.models.length ? '｜ 可见模型：' + r.models.slice(0, 6).map(esc).join(', ') : ''} ${r.reason ? '｜ 原因：' + esc(r.reason) : ''}`, r.ok ? 'ok' : 'err');
        if (r.ok) render();                                        // 刷新状态行（最后成功时间）
      } catch (e) { result('测试连接异常：' + esc(e && e.message), 'err'); }
    });
    on('cfgSave', async () => {
      const patch = readForm();
      try {
        const j = await p.configSave(patch);
        const k = document.getElementById('cfgKey'); if (k) k.value = '';   // 保存后立即清空输入框，避免明文滞留
        last = j; result('已保存到本机受限配置文件（key 已配置：' + (j.config.keyConfigured ? '是，末尾 ' + esc(j.config.keyTail) : '否') + '）', 'ok');
        render();
      } catch (e) { result('保存失败：' + esc(e && e.message), 'err'); }
    });
    on('cfgClearKey', async () => {
      try { const j = await p.configSave({ clearKey: true }); last = j; result('已清除本机保存的 key（环境变量里的 key 不受影响）', 'ok'); render(); }
      catch (e) { result('清除失败：' + esc(e && e.message), 'err'); }
    });
    on('cfgReset', async () => {
      try { const j = await p.configReset({}); last = j; result('已恢复默认（Provider / Base URL / Model / 超时 / 最大输出 / 温度；key 保留，可点「清除」单独删除）', 'ok'); render(); }
      catch (e) { result('恢复默认失败：' + esc(e && e.message), 'err'); }
    });
    on('cfgRefreshModels', async () => {
      result('正在从上游刷新模型列表…', 'busy');
      try {
        const r = await p.models(true);
        if (r.ok && r.ids && r.ids.length) {
          const dl = document.getElementById('cfgModelList');
          if (dl) dl.innerHTML = r.ids.map(m => `<option value="${esc(m)}"></option>`).join('');
          result(`已刷新 ${r.ids.length} 个模型：${r.ids.slice(0, 8).map(esc).join(', ')}${r.model && !r.ids.includes(r.model) ? ` ｜ 注意：当前模型 ${esc(r.model)} 不在列表里` : ''}`, 'ok');
        } else result('刷新失败：' + esc(r.reason || '上游不可达'), 'err');
      } catch (e) { result('刷新异常：' + esc(e && e.message), 'err'); }
    });
    on('cfgImportList', async () => {
      result('正在扫描本机已有配置…', 'busy');
      try {
        const list = await p.configImports();
        const box = document.getElementById('cfgResult');
        if (!list.length) return result('本机没有可导入的配置（未发现 pi / LM Studio 配置）', 'err');
        box.innerHTML = `<div class="cfg-res"><b>本机已有配置（只读扫描，key 只显示末尾 4 位）</b>
          <ul class="cfg-imports">${list.map(c => `<li><span>${esc(c.label)} ｜ ${esc(c.baseUrl)} ｜ ${esc((c.models || []).slice(0, 3).join(', '))} ${c.keyConfigured ? `｜ key 已配置（…${esc(c.keyTail)}）` : '｜ 无 key'}<br><small>${esc(c.source)}</small></span><button class="cfg-btn" data-imp="${esc(c.id)}">导入这一项</button></li>`).join('')}</ul>
          <small>导入 = 把该 baseUrl / model / key 复制进本机 AgriLink 配置文件；<b>不改动你的 pi / LM Studio 原配置</b>。</small></div>`;
        box.querySelectorAll('button[data-imp]').forEach(b => b.onclick = async () => {
          try { const j = await p.configImport(b.dataset.imp); last = j; result('已导入：' + esc(j.config.baseUrl) + ' ｜ 模型 ' + esc(j.config.model) + ' ｜ key ' + (j.config.keyConfigured ? '已配置（…' + esc(j.config.keyTail) + '）' : '无'), 'ok'); render(); }
          catch (e) { result('导入失败：' + esc(e && e.message), 'err'); }
        });
      } catch (e) { result('扫描失败：' + esc(e && e.message), 'err'); }
    });
  }

  document.addEventListener('keydown', e => { if (e.key === 'Escape' && dlg && !dlg.hasAttribute('hidden')) { e.stopPropagation(); close(); } }, true);

  return { open, close, get isOpen() { return !!dlg && !dlg.hasAttribute('hidden'); } };
})();
