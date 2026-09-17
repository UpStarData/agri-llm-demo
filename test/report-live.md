# 农链 AgriLink — 真实连通性验证（LLM-234）

- 服务：http://127.0.0.1:4180/
- 时间：2026-09-17T07:58:00.003Z

## 1. 真实 DeepSeek：服务端 /models 与 /api/chat

- GET /api/health → ok=true ｜ keyConfigured=true ｜ keySource=pi-import:pi-deepseek ｜ key 末尾 1cf8 ｜ verified=true
- GET /api/models → HTTP 200 ｜ 494ms ｜ 可见模型：deepseek-flash、deepseek-v4-pro
- POST /api/chat → HTTP 200 ｜ 2460ms ｜ model=deepseek-flash ｜ 响应非空：true（78 字）
- 脱敏片段：计算红星榴莲的市场份额，分子应是红星榴莲在特定时期、地域内的销售量（或销售额），分母应是同期同地域榴莲市场的总销售量（或总销售额），且两者统计口径必须一致。…
- 响应体含凭证形态字符串：否
- 上游 usage：{"prompt_tokens":42,"completion_tokens":304,"total_tokens":346,"prompt_tokens_details":{"cached_tokens":0},"completion_tokens_details":{"reasoning_tokens":258},"prompt_cache_hit_tokens":0,"prompt_cache_miss_tokens":42}

## 2. 浏览器实测（真实服务，非模拟上游）

- 徽标：真实模型已连接 · deepseek-flash ｜ 状态行：真实模型：deepseek-flash（deepseek） ｜ key 已配置（…1cf8，来源 pi-import:pi-deepseek） ｜ 最后成功 15:57 ｜ 最后失败 — ｜ 服务端调用 2 次
- 未选中对象时输入框禁用=false ｜ 发送禁用=false
  → 截图 live-1-empty-object-input.png（未选对象也能输入，空态为欢迎 / 示例问题）
- 真实回答到达：true ｜ 首行：上下文｜层级 1 · L1 全球货源流向｜选择 未选中对象（全局提问）｜红星 长沙·红星全球农批中心 · 湖南 · 湖南及中南区域农副产品集
- 回答正文片段：真实模型回答（deepseek-flash · 2.2s） …
  → 截图 live-2-real-answer.png（真实模型回答 + 上下文封套）
- 配置页字段齐备：[true,true,true,true,true,true]
- key 输入框 type=password ｜ 回显值="" （不读取完整值）
- 配置页含末尾 4 位提示：true
  → 截图 live-3-config-panel.png（Provider / Base URL / Model / 超时 / 最大输出 / 温度 / 测试连接 / 保存 / 恢复默认）
- 选中对象后的真实回答：true ｜ 上下文：{"layer":"1 · L1 全球货源流向","selection":"马来西亚（flow）","hongxing":"长沙·红星全球农批中心 · 湖南 · 湖南及中南区域农副产品集散枢纽（企业 …
  → 截图 live-4-real-answer-with-object.png（选中对象 → 上下文自动附加 + 真实回答）
- 浏览器控制台错误：0（clean）
- 降级徽标：错误后降级 · 规则演示 ｜ 错误详情：上游 502: 演示失败的降级表现
- 降级后仍给回答（不白屏）：true
  → 截图 live-5-degraded.png（调用失败 → 降级标记 + 规则回答 + 错误详情，不含密钥）

## 3. LM Studio 实测

- GET http://127.0.0.1:1234/v1/models → ok=false ｜ keyConfigured=true ｜ 失败原因：上游 /models 校验失败: 上游 /models 401: Malformed LM Studio API token provided: «redacted»*************************. Ensure you are using a valid token. Learn more at: https://lmstudio.ai/docs/develop
- POST /api/chat → 失败：上游 401: Malformed LM Studio API token provided: «redacted»*************************. Ensure you are using a valid token. Learn more at: https://lmstudio.ai/docs/developer/core/authentication.

## 结论

- DeepSeek 云端：**真实调用成功**（HTTP 200 ｜ deepseek-flash ｜ 2460ms ｜ 非空 78 字）
- 本地演示服务页面：真实模型已连接，徽标「真实模型已连接 · deepseek-flash」；控制台错误 1 条
- 密钥：只出现在服务端出站请求头；本报告与截图中不含任何完整 key（只有末尾 4 位）。

## 4. 公开 Pages（线上，实测）

- URL：https://upstardata.github.io/agri-llm-demo/
- 构建指纹核对：线上 `hash=7710f0006c28` = 本地 `build-meta.json` 的 `hash`（一字不差）
- 运行模式：**`规则演示 · 当前是静态托管（GitHub Pages / 静态服务器），没有同源代理`**
- 响应头无 `x-agri-proxy` → 前端正确判定为静态托管
- 未选对象时输入框 / 发送均可用；问「红星市场的榴莲销售占比需要哪些数据？」→ 规则回答带**分子 / 分母 / 口径边界**
- 「⚙ AI 配置」：**不渲染 key 输入框**（`hasKeyInput=false`），提示「静态公开版没有安全后端」，给出本地演示地址与部署说明
- 请求统计：打到 `/api/*` 的请求 **0** 次；站外请求 **0** 次；控制台错误 **0** 条
- 构建产物中 key 形态字符串：**0** 个
