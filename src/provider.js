/* ============================================================
   AI chat provider adapter —— 统一「真实模型 / 规则演示」两条通路
   - 凭证永远只在服务端（server.mjs）读取环境变量，前端 bundle 不含任何 key
   - file:// 静态版（GitHub Pages / 双击打开）没有同源代理 → 直接进入规则演示，
     不发起任何网络请求（离线可用 + 零控制台错误）
   - 模式：加载中(detecting) / 真实模型已连接(live) / 规则演示(rule) / 错误后降级(degraded)
   ============================================================ */
window.AGRI_PROVIDER = (function () {
  const HTTP = typeof location !== 'undefined' && /^https?:$/.test(location.protocol);
  const LABEL = {
    detecting: '加载中 · 正在检测模型服务',
    live: '真实模型已连接',
    rule: '规则演示',
    degraded: '错误后降级 · 规则演示'
  };
  const st = {
    mode: 'rule', liveAvailable: false, busy: false,
    model: '', baseUrl: '', keyConfigured: false, lastError: '',
    reason: HTTP ? '' : '静态离线版没有同源代理（/api/chat）'
  };
  const subs = [];

  function snapshot() {
    return {
      mode: st.mode, label: LABEL[st.mode], model: st.model, baseUrl: st.baseUrl,
      keyConfigured: st.keyConfigured, busy: st.busy, lastError: st.lastError, reason: st.reason,
      detail: LABEL[st.mode] + (st.mode === 'live' && st.model ? ' · ' + st.model : (st.reason ? ' · ' + st.reason : ''))
    };
  }
  function emit() { const s = snapshot(); subs.forEach(f => { try { f(s); } catch (e) { /* 订阅者异常不影响主流程 */ } }); }

  async function probe() {
    if (!HTTP) { st.mode = 'rule'; st.reason = '静态离线版没有同源代理（/api/chat）'; emit(); return snapshot(); }
    st.mode = 'detecting'; emit();
    /* 先确认同源代理在不在：本地演示服务的静态响应带 x-agri-proxy: 1。
       GitHub Pages 等静态托管没有这个头，于是直接进规则演示，
       不会去打 /api/health 而制造 404 与控制台错误。 */
    try {
      const head = await fetch('.', { method: 'HEAD', cache: 'no-store' });
      if (head.headers.get('x-agri-proxy') !== '1') {
        st.mode = 'rule'; st.liveAvailable = false;
        st.reason = '当前是静态托管（GitHub Pages / 静态服务器），没有同源代理';
        emit(); return snapshot();
      }
    } catch (e) {
      st.mode = 'rule'; st.liveAvailable = false;
      st.reason = '未检测到同源代理（静态探测不可达）';
      emit(); return snapshot();
    }
    try {
      const r = await fetch('api/health', { headers: { accept: 'application/json' }, cache: 'no-store' });
      const ct = r.headers.get('content-type') || '';
      const j = /json/.test(ct) ? await r.json().catch(() => ({})) : {};
      st.model = (j && j.model) || ''; st.baseUrl = (j && j.baseUrl) || '';
      st.keyConfigured = !!(j && j.keyConfigured);
      if (r.ok && j && j.ok && st.keyConfigured) {
        st.mode = 'live'; st.liveAvailable = true; st.reason = '';
      } else {
        st.mode = 'rule'; st.liveAvailable = false;
        st.reason = (j && j.reason) || `同源代理异常（HTTP ${r.status}）`;
      }
    } catch (e) {
      st.mode = 'rule'; st.liveAvailable = false;
      st.reason = '未检测到本地演示服务（/api/health 不可达）';
    }
    emit(); return snapshot();
  }

  /* 返回 {content, model}；失败返回 null，并把面板切到「错误后降级」 */
  async function chat(messages, context) {
    if (!HTTP || !st.liveAvailable) return null;
    st.busy = true; if (st.mode !== 'degraded') st.mode = 'live'; emit();
    try {
      const r = await fetch('api/chat', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: messages || [], context: context || {} })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j || !j.ok) throw new Error((j && j.error) || ('HTTP ' + r.status));
      st.busy = false; st.lastError = ''; st.mode = 'live'; emit();
      return { content: String(j.content || ''), model: j.model || st.model };
    } catch (e) {
      st.busy = false; st.lastError = String((e && e.message) || e);
      st.mode = 'degraded';                       // 显示降级；liveAvailable 保持 true，下次提问可重试
      emit();
      return null;
    }
  }

  return {
    onChange(f) { subs.push(f); },
    probe, chat,
    get state() { return snapshot(); },
    get mode() { return st.mode; },
    get live() { return st.mode === 'live' && st.liveAvailable; }
  };
})();
