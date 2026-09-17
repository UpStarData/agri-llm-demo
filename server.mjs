#!/usr/bin/env node
/* ============================================================
   农链 AgriLink — 本地演示服务（零依赖，只用 Node 内置能力）
   职责：
     1) 同源托管静态页面（index.html 等）
     2) POST /api/chat  —— 把前端的对话转发到可配置的 OpenAI-compatible 服务
     3) GET  /api/health —— 前端据此显示「真实模型已连接 / 规则演示」
     4) GET  /api/models —— 复现校验用（只回模型 id）

   凭证只在服务端读环境变量（或本机已有配置文件），
   绝不写进源码 / 前端 bundle / commit / 日志 —— 所有出站日志都过 redact()。

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

/* ---------------- 配置（只从环境变量 / 本机已有配置文件读） ---------------- */
const pick = (...names) => { for (const n of names) { const v = process.env[n]; if (v && String(v).trim()) return String(v).trim(); } return ''; };
const readKeyFile = p => { try { const s = fs.readFileSync(p, 'utf8').trim(); return s ? s.split(/\r?\n/)[0].trim() : ''; } catch (e) { return ''; } };

const PORT = +pick('PORT') || 4173;
const BASE_URL = (pick('AGRI_LLM_BASE_URL', 'OPENAI_BASE_URL', 'LM_STUDIO_BASE_URL') || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
const MODEL = pick('AGRI_LLM_MODEL', 'OPENAI_MODEL', 'LM_STUDIO_MODEL') || 'deepseek-chat';
const TIMEOUT_MS = +pick('AGRI_LLM_TIMEOUT_MS') || 60000;
const VERIFY_TIMEOUT_MS = +pick('AGRI_LLM_VERIFY_TIMEOUT_MS') || 4000;

let KEY = pick('AGRI_LLM_API_KEY', 'LM_API_TOKEN', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY');
let KEY_SOURCE = KEY ? 'env' : '';
if (!KEY) {
  const f = pick('AGRI_LLM_KEY_FILE');
  if (f) { KEY = readKeyFile(f); if (KEY) KEY_SOURCE = 'file'; }
}
const LOCAL_UPSTREAM = /(^|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/.test(BASE_URL);
if (!KEY && LOCAL_UPSTREAM) {
  // 本机已有配置：LM Studio 的本地 API token（只读，不进日志）
  const f = path.join(os.homedir(), '.lmstudio', '.internal', 'lms-key-2');
  KEY = readKeyFile(f);
  if (KEY) KEY_SOURCE = 'lmstudio-local';
}
const redact = s => { const t = String(s == null ? '' : s); return KEY ? t.split(KEY).join('«redacted»') : t; };

/* ---------------- 向上游校验 /models（缓存 60s，避免每次提问都打上游） ---------------- */
let verifyCache = { at: 0, ok: false, reason: '', ids: [] };
async function verifyUpstream(force) {
  if (!KEY) return { ok: false, reason: '服务端未配置模型凭证（AGRI_LLM_API_KEY / LM_API_TOKEN）', ids: [] };
  if (!force && Date.now() - verifyCache.at < 60000) return verifyCache;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), VERIFY_TIMEOUT_MS);
  try {
    const r = await fetch(`${BASE_URL}/models`, { signal: ac.signal, headers: { authorization: `Bearer ${KEY}`, accept: 'application/json' } });
    const text = await r.text();
    let j = null; try { j = JSON.parse(text); } catch (e) { /* 非 JSON */ }
    if (!r.ok) throw new Error(`上游 /models ${r.status}: ${redact((j && j.error && j.error.message) || text).slice(0, 160)}`);
    const ids = ((j && j.data) || []).map(m => m && m.id).filter(Boolean);
    verifyCache = { at: Date.now(), ok: true, reason: '', ids };
  } catch (e) {
    verifyCache = { at: Date.now(), ok: false, reason: `上游 /models 校验失败: ${redact(e && e.message)}`, ids: [] };
  } finally { clearTimeout(t); }
  return verifyCache;
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

/* ---------------- API ---------------- */
async function apiHealth(res) {
  const v = await verifyUpstream(false);
  return json(res, 200, {
    ok: !!v.ok, keyConfigured: !!KEY, keySource: KEY_SOURCE, verified: !!v.ok,
    model: MODEL, baseUrl: BASE_URL, models: (v.ids || []).slice(0, 20),
    reason: v.ok ? '' : v.reason, startedAt: STARTED
  });
}
async function apiModels(res) {
  const v = await verifyUpstream(true);
  return json(res, v.ok ? 200 : 502, { ok: !!v.ok, model: MODEL, ids: v.ids || [], reason: v.reason || '' });
}
async function apiChat(req, res) {
  const body = await readBody(req);
  if (!body || !Array.isArray(body.messages) || !body.messages.length) return json(res, 400, { ok: false, error: 'messages 必填（OpenAI-compatible 数组）' });
  if (!KEY) return json(res, 503, { ok: false, error: '服务端未配置模型凭证：设置 AGRI_LLM_API_KEY（或 LM_API_TOKEN）后重启' });
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const r = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST', signal: ac.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: body.model || MODEL,
        messages: body.messages,
        temperature: typeof body.temperature === 'number' ? body.temperature : 0.3,
        stream: false
      })
    });
    const text = await r.text();
    let j = null; try { j = JSON.parse(text); } catch (e) { /* 非 JSON */ }
    if (!r.ok) return json(res, 502, { ok: false, error: `上游 ${r.status}: ${redact((j && j.error && j.error.message) || text).slice(0, 240)}` });
    const content = j && j.choices && j.choices[0] && j.choices[0].message ? String(j.choices[0].message.content || '') : '';
    if (!content.trim()) return json(res, 502, { ok: false, error: '上游未返回内容' });
    return json(res, 200, { ok: true, content, model: (j && j.model) || MODEL, usage: (j && j.usage) || null, elapsedMs: Date.now() - t0 });
  } catch (e) {
    return json(res, 502, { ok: false, error: `上游请求失败: ${redact(e && e.message)}` });
  } finally { clearTimeout(t); }
}

/* ---------------- 静态托管 ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.md': 'text/markdown; charset=utf-8',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};
const DENY = /(^|\/)(\.git|node_modules|\.multica|\.pi)(\/|$)|(^|\/)\.env/;
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
const server = http.createServer(async (req, res) => {
  const t0 = Date.now();
  const url = req.url || '/';
  const route = url.split('?')[0];
  try {
    if (route === '/api/health' && req.method === 'GET') await apiHealth(res);
    else if (route === '/api/models' && req.method === 'GET') await apiModels(res);
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

server.listen(PORT, () => {
  console.log(`农链 AgriLink 演示服务  http://127.0.0.1:${PORT}/`);
  console.log(`  baseURL = ${BASE_URL}`);
  console.log(`  model   = ${MODEL}`);
  console.log(`  key     = ${KEY ? '已配置（来源 ' + KEY_SOURCE + '，值不打印）' : '未配置 → 前端会显示「规则演示」'}`);
  if (LOCAL_UPSTREAM && KEY_SOURCE === 'lmstudio-local') console.log('  提示：LM Studio 若开启「Require API token」，请把有效 token 放进 LM_API_TOKEN 或 AGRI_LLM_API_KEY');
  console.log('  同源代理标识：响应头 x-agri-proxy: 1（前端据此在「真实模型 / 规则演示」间选择）');
});
