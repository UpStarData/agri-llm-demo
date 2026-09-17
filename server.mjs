#!/usr/bin/env node
/* ============================================================
   农链 AgriLink — 本地演示服务（零依赖，只用 Node 内置能力）
   职责：
     1) 同源托管静态页面（index.html 等）
     2) POST /api/chat        —— 把前端的对话转发到可配置的 OpenAI-compatible 服务
     3) GET  /api/health      —— 前端据此显示「真实模型已连接 / 未配置 / 连接失败 / 规则演示」
     4) GET  /api/models      —— 从上游刷新模型列表（配置页「刷新模型」用）
     5) /api/config*          —— 「AI 配置」产品入口：读取 / 保存 / 测试连接 / 恢复默认 / 导入本机已有配置

   凭证规则（安全边界）：
     - 配置读写只发生在服务端；默认只监听 127.0.0.1（AGRI_BIND 可改）。
     - key 只允许来自：环境变量 / 本机受限配置文件（0600）/ 本机已有配置的只读导入。
       AGRI_NO_IMPORT=1 关闭「只读导入本机 pi / LM Studio 配置」的自动回退（只认环境变量与本机配置文件）。
     - 任何响应都不回传完整 key，只回「已配置/未配置 + 末尾 4 位」；日志全部过 redact()。

   启动：
     node server.mjs
     node --env-file=.env server.mjs          # Node ≥ 20，推荐
   变量见 .env.example（只有变量名与安全示例）。
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const HOME = os.homedir();
const pick = (...names) => { for (const n of names) { const v = process.env[n]; if (v && String(v).trim()) return String(v).trim(); } return ''; };
const readKeyFile = p => { try { const s = fs.readFileSync(p, 'utf8').trim(); return s ? s.split(/\r?\n/)[0].trim() : ''; } catch (e) { return ''; } };
/* 环境变量里填了 key 时，运行时就以它为准（优先级高于本机配置文件）——
   必须在配置页显式说明，否则用户保存了一个新 key 却看到旧 key 的末尾 4 位，会以为是 bug。 */
const ENV_KEY_VARS = ['AGRI_LLM_API_KEY', 'LM_API_TOKEN', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY'];
const envKeyVar = () => ENV_KEY_VARS.find(n => pick(n)) || '';

/* ---------------- 配置层：环境变量 > 本地受限配置文件 > 默认值 ---------------- */
const CFG_FILE = pick('AGRI_CONFIG_FILE') || path.join(HOME, '.agrilink', 'ai-config.json');
const DEFAULTS = {
  provider: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash',
  timeoutMs: 60000, maxTokens: 4096, temperature: 0.3, verifyTimeoutMs: 4000
};
const PROVIDERS = [
  { id: 'deepseek', label: 'DeepSeek 云端', baseUrl: 'https://api.deepseek.com', models: ['deepseek-flash', 'deepseek-v4-pro'] },
  { id: 'lmstudio', label: 'LM Studio 局域网', baseUrl: 'http://127.0.0.1:1234/v1', models: [] },
  { id: 'custom', label: '自定义 OpenAI-compatible', baseUrl: '', models: [] }
];
const providerOf = id => PROVIDERS.find(p => p.id === id) || PROVIDERS[2];
const guessProvider = baseUrl => /api\.deepseek\.com/i.test(baseUrl) ? 'deepseek'
  : /(^|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|192\.168\.|10\.)/.test(baseUrl) ? 'lmstudio' : 'custom';

function readCfgFile() { try { const j = JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')); return j && typeof j === 'object' ? j : {}; } catch (e) { return {}; } }
function writeCfgFile(patch) {
  const next = { ...readCfgFile(), ...patch, updatedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(CFG_FILE), { recursive: true, mode: 0o700 });
  fs.writeFileSync(CFG_FILE, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
  try { fs.chmodSync(CFG_FILE, 0o600); } catch (e) { /* 非 POSIX 文件系统 */ }
  return next;
}

/* 本机已有配置（pi / LM Studio）——只读扫描，只回候选摘要，绝不回 key 本体 */
function piCandidates() {
  const out = [];
  const store = (() => { try { return JSON.parse(fs.readFileSync(path.join(HOME, '.pi/agent/models-store.json'), 'utf8')); } catch (e) { return {}; } })();
  const auth = (() => { try { return JSON.parse(fs.readFileSync(path.join(HOME, '.pi/agent/auth.json'), 'utf8')); } catch (e) { return {}; } })();
  for (const [name, prov] of Object.entries(store || {})) {
    const ms = (prov && prov.models) || [];
    const key = auth && auth[name] && auth[name].key ? String(auth[name].key) : '';
    const baseUrl = (ms[0] && ms[0].baseUrl) || '';
    if (!ms.length || !baseUrl) continue;
    out.push({ id: 'pi-' + name, label: `pi 配置 · ${name}`, provider: guessProvider(baseUrl), baseUrl: baseUrl.replace(/\/+$/, ''),
      models: ms.map(m => m.id).filter(Boolean), keyConfigured: !!key, keyTail: key ? key.slice(-4) : '', key,
      source: `~/.pi/agent/{models-store.json${key ? ', auth.json' : ''}}` });
  }
  const mp = (() => { try { return JSON.parse(fs.readFileSync(path.join(HOME, '.pi/agent/models.json'), 'utf8')).providers || {}; } catch (e) { return {}; } })();
  for (const [name, p] of Object.entries(mp)) {
    if (!p || !p.baseUrl) continue;
    const key = p.apiKey ? String(p.apiKey) : '';
    out.push({ id: 'pi-' + name, label: `pi 配置 · ${name}`, provider: guessProvider(p.baseUrl), baseUrl: p.baseUrl.replace(/\/+$/, ''),
      models: (p.models || []).map(m => m.id || m).filter(Boolean), keyConfigured: !!key, keyTail: key ? key.slice(-4) : '', key,
      source: '~/.pi/agent/models.json' });
  }
  return out;
}

/* 运行配置（RT）：env 层 > 文件层 > 默认值；env 锁定的字段在配置页只读 */
const ENV_LOCK = {};
function buildRuntime() {
  const file = readCfgFile();
  const rt = { ...DEFAULTS, ...file };
  const envNums = { timeoutMs: 'AGRI_LLM_TIMEOUT_MS', maxTokens: 'AGRI_LLM_MAX_TOKENS', temperature: 'AGRI_LLM_TEMPERATURE', verifyTimeoutMs: 'AGRI_LLM_VERIFY_TIMEOUT_MS' };
  for (const [k, env] of Object.entries(envNums)) if (pick(env)) { rt[k] = +pick(env); ENV_LOCK[k] = env; }
  const envBase = pick('AGRI_LLM_BASE_URL', 'OPENAI_BASE_URL', 'LM_STUDIO_BASE_URL');
  if (envBase) { rt.baseUrl = envBase.replace(/\/+$/, ''); ENV_LOCK.baseUrl = 'AGRI_LLM_BASE_URL'; }
  const envModel = pick('AGRI_LLM_MODEL', 'OPENAI_MODEL', 'LM_STUDIO_MODEL');
  if (envModel) { rt.model = envModel; ENV_LOCK.model = 'AGRI_LLM_MODEL'; }
  rt.baseUrl = String(rt.baseUrl || '').replace(/\/+$/, '');
  rt.maxTokens = Math.max(64, Math.min(32768, +rt.maxTokens || DEFAULTS.maxTokens));
  rt.timeoutMs = Math.max(1000, Math.min(600000, +rt.timeoutMs || DEFAULTS.timeoutMs));
  rt.verifyTimeoutMs = Math.max(1000, Math.min(60000, +rt.verifyTimeoutMs || DEFAULTS.verifyTimeoutMs));
  rt.temperature = Math.max(0, Math.min(2, +rt.temperature || 0));
  rt.provider = rt.provider || guessProvider(rt.baseUrl);

  /* key 优先级：环境变量 > 密钥文件 > 配置文件 > 本机已有配置（只读、仅内存） */
  let key = pick('AGRI_LLM_API_KEY', 'LM_API_TOKEN', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY');
  let keySource = key ? 'env' : '';
  if (!key && pick('AGRI_LLM_KEY_FILE')) { key = readKeyFile(pick('AGRI_LLM_KEY_FILE')); if (key) keySource = 'key-file'; }
  if (!key && file.apiKey) { key = String(file.apiKey); keySource = 'config-file'; }
  if (!key && !pick('AGRI_NO_IMPORT')) {
    const hit = piCandidates().find(c => c.keyConfigured && c.provider === rt.provider && c.baseUrl === rt.baseUrl)
      || piCandidates().find(c => c.keyConfigured && c.provider === rt.provider);
    if (hit) { key = hit.key; keySource = 'pi-import:' + hit.id; }
  }
  if (!key && !pick('AGRI_NO_IMPORT') && /(^|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/.test(rt.baseUrl)) {
    // 本机 LM Studio 的本地 API token（只读，不进日志）
    key = readKeyFile(path.join(HOME, '.lmstudio', '.internal', 'lms-key-2'));
    if (key) keySource = 'lmstudio-local';
  }
  rt.apiKey = key || '';
  rt.keySource = keySource;
  return rt;
}
let RT = buildRuntime();
const reloadRuntime = () => { RT = buildRuntime(); verifyCache = { at: 0, ok: false, reason: '', ids: [] }; };

const redact = s => {
  const t = String(s == null ? '' : s);
  const a = RT.apiKey ? t.split(RT.apiKey).join('«redacted»') : t;
  return a.replace(/\b(sk-[A-Za-z0-9_\-]{6,})/g, '«redacted»');
};
const keyTail = () => (RT.apiKey ? RT.apiKey.slice(-4) : '');
function cfgSnapshot() {
  const p = providerOf(RT.provider);
  return {
    provider: RT.provider, providerLabel: p.label, baseUrl: RT.baseUrl, model: RT.model,
    timeoutMs: RT.timeoutMs, maxTokens: RT.maxTokens, temperature: RT.temperature, verifyTimeoutMs: RT.verifyTimeoutMs,
    keyConfigured: !!RT.apiKey, keyTail: keyTail(), keySource: RT.keySource,
    hasStoredKey: !!readCfgFile().apiKey, keyEnvVar: envKeyVar(), configFile: CFG_FILE.replace(HOME, '~'),
    envLocked: Object.keys(ENV_LOCK), updatedAt: readCfgFile().updatedAt || ''
  };
}

/* ---------------- 运行态：最后一次成功 / 失败（配置页显示） ---------------- */
const STATE = { lastOkAt: '', lastErrAt: '', lastError: '', calls: 0 };

/* ---------------- 向上游校验 /models（缓存 60s，避免每次提问都打上游） ---------------- */
let verifyCache = { at: 0, ok: false, reason: '', ids: [] };
async function verifyUpstream(force, opt) {
  const o = opt || {};
  const baseUrl = (o.baseUrl || RT.baseUrl).replace(/\/+$/, '');
  const key = o.apiKey !== undefined ? o.apiKey : RT.apiKey;
  const timeout = o.timeoutMs || RT.verifyTimeoutMs;
  if (!key) return { ok: false, reason: '服务端未配置模型凭证（在「AI 配置」里粘贴一次 key，或设置 AGRI_LLM_API_KEY）', ids: [], status: 0, elapsedMs: 0 };
  if (!force && !opt && Date.now() - verifyCache.at < 60000) return verifyCache;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeout);
  const t0 = Date.now();
  let out;
  try {
    const r = await fetch(`${baseUrl}/models`, { signal: ac.signal, headers: { authorization: `Bearer ${key}`, accept: 'application/json' } });
    const text = await r.text();
    let j = null; try { j = JSON.parse(text); } catch (e) { /* 非 JSON */ }
    const ids = ((j && j.data) || []).map(m => m && m.id).filter(Boolean);
    if (!r.ok) throw Object.assign(new Error(`上游 /models ${r.status}: ${redact((j && j.error && j.error.message) || text).slice(0, 160)}`), { status: r.status });
    out = { ok: true, reason: '', ids, status: r.status, elapsedMs: Date.now() - t0 };
  } catch (e) {
    out = { ok: false, reason: `上游 /models 校验失败: ${redact(e && e.message)}`, ids: [], status: e && e.status || 0, elapsedMs: Date.now() - t0 };
  } finally { clearTimeout(t); }
  if (!opt) verifyCache = { at: Date.now(), ...out };
  return out;
}

/* ---------------- HTTP 小工具 ---------------- */
const json = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(body);
};
const readBody = req => new Promise((resolve) => {
  let n = 0; const chunks = [];
  req.on('data', c => { n += c.length; if (n > 512 * 1024) { req.destroy(); return; } chunks.push(c); });
  req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { resolve(null); } });
  req.on('error', () => resolve(null));
});

/* ---------------- API：健康 / 模型 / 配置 / 对话 ---------------- */
async function apiHealth(res) {
  const v = await verifyUpstream(false);
  if (v.ok) { STATE.lastOkAt = new Date().toISOString(); STATE.lastError = ''; }
  return json(res, 200, {
    ok: !!v.ok, keyConfigured: !!RT.apiKey, keySource: RT.keySource, verified: !!v.ok,
    model: RT.model, baseUrl: RT.baseUrl, models: (v.ids || []).slice(0, 40),
    keyTail: keyTail(), reason: v.ok ? '' : v.reason, startedAt: STARTED, lastOkAt: STATE.lastOkAt
  });
}
async function apiModels(req, res, url) {
  const v = await verifyUpstream(true);            // 刷新模型列表 = 强制打一次上游
  return json(res, v.ok ? 200 : 502, { ok: !!v.ok, model: RT.model, ids: v.ids || [], reason: v.reason || '', elapsedMs: v.elapsedMs || 0, status: v.status || 0 });
}
async function apiConfigGet(res) {
  const p = providerOf(RT.provider);
  const v = RT.apiKey ? await verifyUpstream(false) : { ok: false, reason: '未配置凭证', ids: [], status: 0 };
  return json(res, 200, {
    ok: true, config: cfgSnapshot(), defaults: DEFAULTS,
    providers: PROVIDERS.map(x => ({ ...x, models: x.id === RT.provider && v.ok && v.ids.length ? v.ids : x.models })),
    models: v.ok ? v.ids : (p.models || []),
    mode: !RT.apiKey ? 'unconfigured' : v.ok ? 'live' : 'error',
    verify: { ok: !!v.ok, reason: v.reason || '', status: v.status || 0, elapsedMs: v.elapsedMs || 0 },
    lastOkAt: STATE.lastOkAt, lastErrAt: STATE.lastErrAt, lastError: STATE.lastError, calls: STATE.calls
  });
}
const numOr = (v, d, lo, hi) => (v === undefined || v === null || v === '' ? d : Math.max(lo, Math.min(hi, +v || d)));
async function apiConfigPut(req, res) {
  const b = await readBody(req);
  if (!b || typeof b !== 'object') return json(res, 400, { ok: false, error: '配置体必填（JSON）' });
  const patch = {};
  if (typeof b.provider === 'string' && b.provider) {
    if (!PROVIDERS.some(p => p.id === b.provider)) return json(res, 400, { ok: false, error: 'provider 只能是 deepseek / lmstudio / custom' });
    patch.provider = b.provider;
  }
  if (typeof b.baseUrl === 'string' && b.baseUrl.trim()) {
    const u = b.baseUrl.trim().replace(/\/+$/, '');
    if (!/^https?:\/\/[^\s]+$/i.test(u)) return json(res, 400, { ok: false, error: 'baseUrl 必须是 http(s) 地址，且不带结尾斜杠' });
    patch.baseUrl = u;
    if (!patch.provider) patch.provider = guessProvider(u);
  }
  if (typeof b.model === 'string' && b.model.trim()) patch.model = b.model.trim();
  if (b.timeoutMs !== undefined) patch.timeoutMs = numOr(b.timeoutMs, RT.timeoutMs, 1000, 600000);
  if (b.maxTokens !== undefined) patch.maxTokens = Math.round(numOr(b.maxTokens, RT.maxTokens, 64, 32768));
  if (b.temperature !== undefined) patch.temperature = numOr(b.temperature, RT.temperature, 0, 2);
  if (typeof b.apiKey === 'string' && b.apiKey.trim()) patch.apiKey = b.apiKey.trim();     // 只在服务端落盘，绝不回传
  if (b.clearKey === true) patch.apiKey = '';
  if (!Object.keys(patch).length) return json(res, 400, { ok: false, error: '没有可保存的字段' });
  for (const k of Object.keys(patch)) if (ENV_LOCK[k] && k !== 'apiKey') delete patch[k];
  try { writeCfgFile(patch); } catch (e) { return json(res, 500, { ok: false, error: '写配置文件失败: ' + redact(e && e.message) }); }
  reloadRuntime();
  return apiConfigGet(res);
}
async function apiConfigTest(req, res) {
  const b = (await readBody(req)) || {};
  const baseUrl = (b.baseUrl || RT.baseUrl).replace(/\/+$/, '');
  const key = typeof b.apiKey === 'string' && b.apiKey.trim() ? b.apiKey.trim() : RT.apiKey;   // 未填新 key 就用已存 key 测
  if (!/^https?:\/\/[^\s]+$/i.test(baseUrl)) return json(res, 400, { ok: false, error: 'baseUrl 必须是 http(s) 地址' });
  const v = await verifyUpstream(true, { baseUrl, apiKey: key, timeoutMs: Math.max(3000, Math.min(20000, +b.timeoutMs || 8000)) });
  const models = v.ok ? v.ids : [];
  const want = String(b.model || RT.model || '');
  const modelFound = want ? models.includes(want) : null;
  if (v.ok) { STATE.lastOkAt = new Date().toISOString(); STATE.lastError = ''; }
  else { STATE.lastErrAt = new Date().toISOString(); STATE.lastError = v.reason; }
  return json(res, v.ok ? 200 : 502, {
    ok: !!v.ok, baseUrl, status: v.status || 0, elapsedMs: v.elapsedMs || 0, models, model: want, modelFound,
    reason: v.ok ? '' : v.reason, keyTail: keyTail(), keyConfigured: !!key
  });
}
async function apiConfigReset(req, res) {
  const b = (await readBody(req)) || {};
  try {
    const cur = readCfgFile();
    const next = { ...DEFAULTS, updatedAt: new Date().toISOString() };
    if (!b.clearKey) { if (cur.apiKey) next.apiKey = cur.apiKey; }
    fs.mkdirSync(path.dirname(CFG_FILE), { recursive: true, mode: 0o700 });
    fs.writeFileSync(CFG_FILE, JSON.stringify(next, null, 2) + '\n', { mode: 0o600 });
    try { fs.chmodSync(CFG_FILE, 0o600); } catch (e) { /* 非 POSIX */ }
  } catch (e) { return json(res, 500, { ok: false, error: '恢复默认失败: ' + redact(e && e.message) }); }
  reloadRuntime();
  return apiConfigGet(res);
}
async function apiConfigImports(res) {
  return json(res, 200, {
    ok: true,
    candidates: piCandidates().map(c => ({ id: c.id, label: c.label, provider: c.provider, baseUrl: c.baseUrl, models: c.models.slice(0, 20),
      keyConfigured: c.keyConfigured, keyTail: c.keyTail, source: c.source }))
  });
}
async function apiConfigImport(req, res) {
  const b = (await readBody(req)) || {};
  const c = piCandidates().find(x => x.id === b.id);
  if (!c) return json(res, 404, { ok: false, error: '找不到该本机配置候选' });
  const patch = { provider: c.provider, baseUrl: c.baseUrl, model: (c.models.find(m => m === RT.model) || c.models[0] || RT.model) };
  if (c.key) patch.apiKey = c.key;                       // 只写入本地 0600 配置文件；源配置只读、不改动
  try { writeCfgFile(patch); } catch (e) { return json(res, 500, { ok: false, error: '导入失败: ' + redact(e && e.message) }); }
  reloadRuntime();
  return apiConfigGet(res);
}
async function apiChat(req, res) {
  const body = await readBody(req);
  if (!body || !Array.isArray(body.messages) || !body.messages.length) return json(res, 400, { ok: false, error: 'messages 必填（OpenAI-compatible 数组）' });
  if (!RT.apiKey) return json(res, 503, { ok: false, error: '未配置模型凭证：在「AI 配置」里粘贴一次 key（或设置 AGRI_LLM_API_KEY）后重试' });
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), RT.timeoutMs);
  let closed = false;
  req.on('close', () => { closed = true; try { ac.abort(); } catch (e) { /* 已结束 */ } });   // 前端「取消」→ 同时断开上游
  const t0 = Date.now();
  const model = (typeof body.model === 'string' && body.model.trim()) || RT.model;
  const temperature = typeof body.temperature === 'number' ? Math.max(0, Math.min(2, body.temperature)) : RT.temperature;
  const maxTokens = Math.round(Math.max(64, Math.min(32768, +body.maxTokens || RT.maxTokens)));
  try {
    const r = await fetch(`${RT.baseUrl}/chat/completions`, {
      method: 'POST', signal: ac.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${RT.apiKey}` },
      body: JSON.stringify({ model, messages: body.messages, temperature, max_tokens: maxTokens, stream: false })
    });
    const text = await r.text();
    let j = null; try { j = JSON.parse(text); } catch (e) { /* 非 JSON */ }
    STATE.calls++;
    if (!r.ok) {
      STATE.lastErrAt = new Date().toISOString(); STATE.lastError = `上游 ${r.status}`;
      return json(res, 502, { ok: false, error: `上游 ${r.status}: ${redact((j && j.error && j.error.message) || text).slice(0, 240)}` });
    }
    const msg = (j && j.choices && j.choices[0] && j.choices[0].message) || {};
    const content = String(msg.content || '');
    if (!content.trim()) {
      const rs = String(msg.reasoning_content || '');
      STATE.lastErrAt = new Date().toISOString(); STATE.lastError = '上游未返回正文';
      return json(res, 502, { ok: false, error: rs
        ? `上游只返回了推理内容，没有正文（max_tokens=${maxTokens} 可能太小，或该模型为纯推理模型）`
        : '上游未返回内容' });
    }
    STATE.lastOkAt = new Date().toISOString(); STATE.lastError = '';
    return json(res, 200, { ok: true, content, model: (j && j.model) || model, usage: (j && j.usage) || null,
      elapsedMs: Date.now() - t0, maxTokens, temperature });
  } catch (e) {
    if (closed) return;                                    // 前端已取消：不再回包
    STATE.lastErrAt = new Date().toISOString();
    const aborted = e && (e.name === 'AbortError' || /aborted/i.test(String(e && e.message)));
    STATE.lastError = aborted ? `上游请求超时（> ${RT.timeoutMs}ms）` : String(e && e.message || e);
    return json(res, 502, { ok: false, error: aborted ? `上游请求超时（> ${RT.timeoutMs}ms）` : `上游请求失败: ${redact(e && e.message)}` });
  } finally { clearTimeout(t); }
}

/* ---------------- 静态托管 ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.md': 'text/markdown; charset=utf-8',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};
const DENY = /(^|\/)(\.git|node_modules|\.multica|\.pi|\.agrilink)(\/|$)|(^|\/)\.env/;
function serve(res, urlPath) {
  let p = decodeURIComponent(String(urlPath).split('?')[0]);
  if (p === '/' || p === '') p = '/index.html';
  const abs = path.join(root, path.normalize(p));
  if (!abs.startsWith(root) || DENY.test(p)) return json(res, 404, { ok: false, error: 'not found' });
  fs.stat(abs, (err, st) => {
    if (err || !st.isFile()) return json(res, 404, { ok: false, error: 'not found' });
    // x-agri-proxy：前端靠这个响应头判断「同源代理在不在」。
    // 静态托管（GitHub Pages）不会有这个头，于是前端直接进规则演示，
    // 不会去打 /api/health 而报 404 —— 公开版零控制台错误。
    res.writeHead(200, { 'content-type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-agri-proxy': '1' });
    fs.createReadStream(abs).pipe(res);
  });
}

const STARTED = new Date().toISOString();
const BIND = pick('AGRI_BIND') || '127.0.0.1';     // 配置 API 默认只监听本机
const PORT = +pick('PORT') || 4173;
const server = http.createServer(async (req, res) => {
  const t0 = Date.now();
  const url = req.url || '/';
  const route = url.split('?')[0];
  try {
    if (route === '/api/health' && req.method === 'GET') await apiHealth(res);
    else if (route === '/api/models' && req.method === 'GET') await apiModels(req, res, url);
    else if (route === '/api/config' && req.method === 'GET') await apiConfigGet(res);
    else if (route === '/api/config' && (req.method === 'PUT' || req.method === 'POST')) await apiConfigPut(req, res);
    else if (route === '/api/config/test' && req.method === 'POST') await apiConfigTest(req, res);
    else if (route === '/api/config/reset' && req.method === 'POST') await apiConfigReset(req, res);
    else if (route === '/api/config/imports' && req.method === 'GET') await apiConfigImports(res);
    else if (route === '/api/config/import' && req.method === 'POST') await apiConfigImport(req, res);
    else if (route === '/api/chat' && req.method === 'POST') await apiChat(req, res);
    else if (route.startsWith('/api/')) json(res, 404, { ok: false, error: 'unknown api' });
    else if (req.method === 'GET' || req.method === 'HEAD') serve(res, url);
    else json(res, 405, { ok: false, error: 'method not allowed' });
  } catch (e) {
    json(res, 500, { ok: false, error: redact(e && e.message) });
  }
  // 只记方法 / 路径 / 状态 / 耗时：没有请求体、没有 Authorization、没有 key
  console.log(`${req.method} ${route} ${res.statusCode} ${Date.now() - t0}ms`);
});

server.listen(PORT, BIND, () => {
  console.log(`农链 AgriLink 演示服务  http://${BIND === '0.0.0.0' ? '127.0.0.1' : BIND}:${PORT}/`);
  console.log(`  baseURL = ${RT.baseUrl}`);
  console.log(`  model   = ${RT.model}`);
  console.log(`  key     = ${RT.apiKey ? '已配置（来源 ' + RT.keySource + '，末尾 ' + keyTail() + '，值不打印）' : '未配置 → 前端会显示「未配置模型」'}`);
  console.log(`  配置中心 = http://${BIND === '0.0.0.0' ? '127.0.0.1' : BIND}:${PORT}/  → 右上角「⚙ AI 配置」`);
  console.log(`  绑定地址 = ${BIND}${BIND === '127.0.0.1' ? '（只监听本机：密钥配置 API 不暴露到局域网）' : '（注意：非本地绑定）'}`);
  console.log('  同源代理标识：响应头 x-agri-proxy: 1（前端据此在「真实模型 / 规则演示」间选择）');
});
