/* ============================================================
   AI chat provider adapter —— 统一「真实模型 / 规则演示」两条通路
   - 凭证永远只在服务端（server.mjs）读取/落盘；前端 bundle 不含任何 key，
     也不把 key 写进 localStorage / URL / DOM
   - file:// 静态版（GitHub Pages / 双击打开）没有同源代理 → 直接进入规则演示，
     不发起任何网络请求（离线可用 + 零控制台错误），并且不展示任何 key 输入框
   - 「AI 配置」只调用服务端配置 API（默认只监听 127.0.0.1，见 server.mjs）
   模式：detecting 加载中 / live 真实模型已连接 / unconfigured 未配置 /
        rule 规则演示（静态版）/ degraded 调用失败·已降级
   ============================================================ */
window.AGRI_PROVIDER = (function () {
  const HTTP = typeof location !== 'undefined' && /^https?:$/.test(location.protocol);
  const LABEL = {
    detecting: '加载中 · 正在检测模型服务',
    live: '真实模型已连接',
    unconfigured: '未配置模型 · 规则演示',
    rule: '规则演示',
    degraded: '错误后降级 · 规则演示'
  };
  const st = {
    mode: 'rule', liveAvailable: false, busy: false, proxyAvailable: false,
    model: '', baseUrl: '', provider: '', keyConfigured: false, keyTail: '', keySource: '',
    lastError: '', reason: '', lastOkAt: '', lastErrAt: '', calls: 0,
    reason0: HTTP ? '' : '静态离线版（file://）没有同源代理'
  };
  const subs = [];

  function snapshot() {
    return {
      mode: st.mode, label: LABEL[st.mode], model: st.model, baseUrl: st.baseUrl, provider: st.provider,
      keyConfigured: st.keyConfigured, keyTail: st.keyTail, keySource: st.keySource,
      busy: st.busy, lastError: st.lastError, reason: st.reason, proxy: st.proxyAvailable,
      lastOkAt: st.lastOkAt, lastErrAt: st.lastErrAt, calls: st.calls,
      detail: LABEL[st.mode] + (st.mode === 'live' && st.model ? ' · ' + st.model : (st.reason ? ' · ' + st.reason : ''))
    };
  }
  function emit() { const s = snapshot(); subs.forEach(f => { try { f(s); } catch (e) { /* 订阅者异常不影响主流程 */ } }); }

  async function api(path, opts) {
    const r = await fetch(path, Object.assign({ headers: { accept: 'application/json' } }, opts || {}));
    const ct = r.headers.get('content-type') || '';
    const j = /json/.test(ct) ? await r.json().catch(() => ({})) : {};
    return { status: r.status, ok: r.ok, body: j || {} };
  }

  function adopt(j) {
    const c = (j && j.config) || {};
    st.model = c.model || st.model; st.baseUrl = c.baseUrl || st.baseUrl; st.provider = c.provider || st.provider;
    st.keyConfigured = !!c.keyConfigured; st.keyTail = c.keyTail || ''; st.keySource = c.keySource || '';
    const v = (j && j.verify) || {};
    if (j && j.mode === 'live') { st.mode = 'live'; st.liveAvailable = true; st.reason = ''; }
    else if (j && j.mode === 'error') { st.mode = 'unconfigured'; st.liveAvailable = false; st.reason = v.reason || '连接失败'; }
    else if (j && j.mode === 'unconfigured') { st.mode = 'unconfigured'; st.liveAvailable = false; st.reason = v.reason || '未配置模型凭证'; }
    if (j && j.lastOkAt) st.lastOkAt = j.lastOkAt; else if (c.updatedAt) st.lastOkAt = c.updatedAt;
    if (j && j.lastErrAt) st.lastErrAt = j.lastErrAt;
    if (j && j.lastError) st.lastError = j.lastError;
    if (j && typeof j.calls === 'number') st.calls = j.calls;
  }

  async function probe() {
    if (!HTTP) { st.mode = 'rule'; st.reason = st.reason0; emit(); return snapshot(); }
    st.mode = 'detecting'; emit();
    /* 先确认同源代理在不在：本地演示服务的静态响应带 x-agri-proxy: 1。
       GitHub Pages 等静态托管没有这个头，于是直接进规则演示，
       不会去打 /api/health 而制造 404 与控制台错误。 */
    try {
      const head = await fetch('.', { method: 'HEAD', cache: 'no-store' });
      if (head.headers.get('x-agri-proxy') !== '1') {
        st.proxyAvailable = false; st.mode = 'rule'; st.liveAvailable = false;
        st.reason = '当前是静态托管（GitHub Pages / 静态服务器），没有同源代理';
        emit(); return snapshot();
      }
      st.proxyAvailable = true;
    } catch (e) {
      st.proxyAvailable = false; st.mode = 'rule'; st.liveAvailable = false;
      st.reason = '未检测到同源代理（静态探测不可达）';
      emit(); return snapshot();
    }
    try {
      const { status, ok, body } = await api('api/config');
      if (!ok) throw new Error((body && body.error) || ('HTTP ' + status));
      adopt(body);
    } catch (e) {
      st.mode = 'rule'; st.liveAvailable = false;
      st.reason = '未检测到本地演示服务（/api/config 不可达）';
      st.lastError = String((e && e.message) || e);
    }
    emit(); return snapshot();
  }

  /* 返回 {content, model, elapsedMs}；失败返回 null，并把面板切到「调用失败·已降级」 */
  async function chat(messages, context, opts) {
    if (!HTTP || !st.liveAvailable) return null;
    st.busy = true; if (st.mode !== 'degraded') st.mode = 'live'; emit();
    const t0 = Date.now();
    try {
      const r = await fetch('api/chat', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: messages || [], context: context || {} }),
        signal: (opts && opts.signal) || undefined
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j || !j.ok) throw new Error((j && j.error) || ('HTTP ' + r.status));
      st.busy = false; st.lastError = ''; st.mode = 'live'; st.liveAvailable = true;
      st.calls++; st.lastOkAt = new Date().toISOString(); emit();
      return { content: String(j.content || ''), model: j.model || st.model, elapsedMs: j.elapsedMs || (Date.now() - t0) };
    } catch (e) {
      const aborted = (e && (e.name === 'AbortError' || /abort/i.test(String(e.message || '')))) || !!(opts && opts.cancelled && opts.cancelled());
      st.busy = false;
      if (aborted) { st.lastError = '已取消（请求已中止）'; if (st.mode === 'live') st.mode = st.liveAvailable ? 'live' : 'rule'; emit(); return null; }
      st.lastError = String((e && e.message) || e);
      st.mode = 'degraded';                       // 显示降级；liveAvailable 保持 true，下次提问会自动重试真实模型
      st.lastErrAt = new Date().toISOString();
      emit();
      return null;
    }
  }

  /* ---- 配置 API（只在同源代理可用时；静态公开版一律拒绝，避免 key 落浏览器） ---- */
  async function configGet() { const r = await api('api/config'); if (!r.ok) throw new Error((r.body && r.body.error) || ('HTTP ' + r.status)); adopt(r.body); emit(); return r.body; }
  async function configSave(patch) {
    const r = await api('api/config', { method: 'PUT', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(patch) });
    if (!r.ok) throw new Error((r.body && r.body.error) || ('HTTP ' + r.status));
    adopt(r.body); emit(); return r.body;
  }
  async function configTest(patch) {
    const r = await api('api/config/test', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(patch || {}) });
    return Object.assign({ httpStatus: r.status }, r.body);
  }
  async function configReset(body) {
    const r = await api('api/config/reset', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body || {}) });
    if (!r.ok) throw new Error((r.body && r.body.error) || ('HTTP ' + r.status));
    adopt(r.body); emit(); return r.body;
  }
  async function configImports() { const r = await api('api/config/imports'); return r.ok ? (r.body.candidates || []) : []; }
  async function configImport(id) {
    const r = await api('api/config/import', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ id }) });
    if (!r.ok) throw new Error((r.body && r.body.error) || ('HTTP ' + r.status));
    adopt(r.body); emit(); return r.body;
  }
  async function models(refresh) { const r = await api('api/models' + (refresh ? '?refresh=1' : '')); return r.body || {}; }

  return {
    onChange(f) { subs.push(f); },
    probe, chat, configGet, configSave, configTest, configReset, configImports, configImport, models,
    get state() { return snapshot(); },
    get mode() { return st.mode; },
    /* liveAvailable = 「真实通路可用（代理在 + 凭证已配置）」，与当前是否刚调用失败无关：
       降级后下一次提问（或点「重试」）仍会重试真实模型，不必重载页面。
       mode 只用于展示时的钻标文案。 */
    get live() { return st.liveAvailable; },
    get proxy() { return st.proxyAvailable; },
    get staticOnly() { return !st.proxyAvailable; }
  };
})();
