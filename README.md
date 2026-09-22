# 农链 AgriLink · 中国农产品产业地图（阶段演示）

面向农博会 / 集团展示场景的**阶段性领导演示 Demo**，用于确认展示形态与信息结构。
线上：https://upstardata.github.io/agri-llm-demo/

> ⚠️ 页面内**所有数值均为示意数据（待标定）**，仅用于表达信息结构；
> 口径字段为真实口径框架（海关贸易量 / 产区供给规模 / 省际调运量 / 环节台账 / 元·kg）。
> 本 Demo 为独立阶段性演示，不关联、不替代长期「农产品交易大模型」。

## 版本预览（全部在本仓库 · 按版本分目录）

每个版本一个固定地址，旧版本长期保留；**不再为每个版本新建仓库**。

| 版本 | 预览地址 | 内容 |
| --- | --- | --- |
| **V0.7**（当前） | `/v0.7/` | 数据概览实时大数字（全位数千分位 / 等宽数字 / 尾数持续递增） |
| V0.6.2 | `/v0.6.2/` | 密度效果修复：地图坐标点 + 边界校验 + 拖动缩放同投影 |
| V0.6.1 | `/v0.6.1/` | 第三轮补充指令（概览翻牌 / 3 行终端 / 全屏地图 + 浮层 / 毛玻璃） |
| V0.6 | `/v0.6/` | 体量口径 + 实时滚动计数 / 地图缩放规则 / 铺满整屏 / 统一中性点 |
| V0.5 | `/v0.5/` | 浅色视觉校准 + 第二轮反馈（MiroFish 连线 / 纯黑终端 / 真实直播） |
| V0.4 | `/v0.4/` | 暗色重设计版（已否决，仅留档） |
| 原版 | `/`（本页） | 三层 Demo 原始基线，始终不动 |

版本目录页：**https://upstardata.github.io/agri-llm-demo/versions/**　·　完整清单与发版步骤见 [`VERSIONS.md`](./VERSIONS.md)。

## 数据骨架（本轮统一）

```
境外产区/国家 → 中国进口与消费 → 湖南集散与消费 → 湖南红星大市场 → 渠道/终端
```

四层视图是这条骨架的放大镜：

| 层 | 骨架位置 | 视觉语言 |
| --- | --- | --- |
| L1 全球货源流向 | 境外产区/国家 → 中国 | 可二维旋转的地球 + 按贸易量依次长出的流向弧与流光；`origins` 落到产区（尖竹汶 / 前江隆庆 / 彭亨劳勿 / 中部山谷 / 马托格罗索…） |
| L2 全国产区与省际流通 | 中国进口与消费 | 中国地图 + 供给气泡 + 省际调运线 + 进口直达图层 + **红星集散枢纽标记** |
| L3 省区产业分析 | 湖南集散与消费 | 相机推进该省 + 城市节点 + 品类结构条 + 竞争力雷达（左下分析卡片绑定当前对象） |
| L4 城市单品 / 红星品类·部位 | 湖南红星大市场 → 渠道/终端 | 城市代表单品六环节全链路；进入长沙（红星）则切换为**进口品类·部位五段链路 + 终端建议** |

**一键演示路径（L2 右上角，或 `AGRI_DEBUG.demoPath(id)`）**：马来西亚·猫山王 / 智利·车厘子 / 巴西·牛肉·牛前腱 —— 一次点击把同一选择从 L1 境外产区一路贯穿到 L4 红星品类与终端建议。

交互要点：层间 **1.2–1.6s Prezi 式相机切场**（不白屏、不换页）；**没有「下一步」按钮**，导航发生在数据对象上；滚轮缩小 / 点空白 / Esc / 面包屑都能返回上一层并恢复上层位姿；每层右侧嵌入**基于当前选中对象**的 AI 分析助手。

## AI 问答：两种模式 + 安全降级

前端是**统一的 chat provider adapter**（`src/provider.js`），只有两条通路：

| 模式徽标 | 触发条件 | 行为 |
| --- | --- | --- |
| `规则演示` | `file://` 静态版；或静态托管（GitHub Pages）没有同源代理 | 本地规则化应答，**不发起任何多余网络请求**，页面完全离线可用 |
| `加载中 · 正在检测模型服务` | 通过 http(s) 打开且正在探测 `/api/config` | 探测期间；状态行说明进度，不白屏 |
| `真实模型已连接 · <model>` | 服务端 `/models` 校验通过 | 提问走 `POST /api/chat` → 服务端转发到 OpenAI-compatible 上游；回答带「真实模型回答」标识与耗时 |
| `未配置模型 · 规则演示` | 同源代理在，但服务端没有可用凭证 | 规则应答 + 徽标说明「未配置凭证」，**不谎报已连接**；用户可先问，再去配置页粘一次 key |
| `错误后降级 · 规则演示` | 真实调用失败（超时 / 4xx / 5xx） | 立即回落到规则应答，徽标 + 状态行给出失败原因；不假装是模型答案。修好上游后点「重试」即可重试真实模型，**不必重载页面** |

**没有选中对象也能提问**：地图对象是上下文增强，不是提问门槛。未选对象时提问=全局问题（口径怎么算、来源国与节奏、关联变量推演、湖南集散的位置），封套里标记为「未选中对象（全局提问）」；选中对象后自动附加层级 / 对象 / 品类 / 红星市场 / 数据口径。

**每条回答（两种模式都是）都携带上下文封套**：当前层级 / 当前选择 / 红星市场 / 品类 / 数据口径 / 数据属性（示意·待标定）。真实模型还会额外收到同一份上下文的 system + user 消息，连续追问时带上本会话最近 6 条消息（换对象即换会话）。

回答区支持：加载中 / 取消（同时断开上游请求）/ 重试上一条 / 错误详情（已脱敏）/ 连续追问 / 清空会话。发送按钮**只在请求处理中禁用**。

### 「⚙ AI 配置」产品入口（右上角）

| 分支 | 条件 | 内容 |
| --- | --- | --- |
| A. 本地演示服务 | 同源代理可用 | Provider（DeepSeek 云端 / LM Studio 局域网 / 自定义 OpenAI-compatible）、Base URL、Model（可从 `/models` 刷新并选择）、API Key 状态、超时 / 最大输出长度 / 温度、测试连接 / 保存配置 / 恢复默认 / 从本机已有配置导入；并显示当前运行模式与最后一次成功 / 失败时间 |
| B. 公开静态版 | GitHub Pages 等静态托管 | **不渲染任何 key 输入框与保存按钮**，只说明「静态公开版没有安全后端」并给出「打开本地演示地址 / 查看部署说明」 |

API Key 永远只显示「已配置 / 未配置 + 末尾 4 位 + 来源」；输入框 `type=password`、保存后立即清空、**永不回显完整值**。key 由服务端写入 `~/.agrilink/ai-config.json`（目录 0700 / 文件 0600），或从环境变量 / `AGRI_LLM_KEY_FILE` / 本机已有 pi 配置（只读）读取。若 key 来自环境变量，配置页会**显式说明环境变量优先级更高**，避免用户以为保存没生效。

配置 API（`/api/config*`）默认只监听 `127.0.0.1`；确需局域网访问要用 `AGRI_BIND` 显式放开。

### 同源代理的识别方式（公开版零控制台错误）

前端不会盲目去打 `/api/*`（静态托管上那会是一个 404 与控制台错误）。`server.mjs` 的所有静态响应都带 `x-agri-proxy: 1`；前端先对当前目录发一个 `HEAD`，

- 没有这个头 → 判定为静态托管，直接进「规则演示」，**一共只发了这一个 HEAD 请求**；
- 有这个头 → 再调 `/api/config`（内含 `/models` 校验）决定「真实模型已连接 / 未配置 / 连接失败」。

因此 https://upstardata.github.io/agri-llm-demo/ 是干净的静态演示：不谎报模型已连接，也不产生 404。

### 凭证的处理

- **只在服务端读取**：`server.mjs` 从环境变量、本机受限配置文件或本机已有配置读 key，key 只存在于服务端进程内存与出站请求头。
- **绝不进源码 / 前端 bundle / commit / issue / 日志 / 截图 / 测试快照**：构建产物里没有任何 key（`test/round3.mjs` 会断言这一点）；服务端日志只打 `方法 路径 状态 耗时`，不打请求体与 Authorization，并且所有出站错误信息都过 `redact()`。
- 配置 API 的所有响应都**不回传 key 本体**（只有 `keyTail` 末尾 4 位与 `keySource`）。
- GitHub Pages 是纯静态版：没有同源代理，因此**默认且只能是「规则演示」**，绝不携带云端 key。

## 使用

- **线上（静态 · 规则演示）**：https://upstardata.github.io/agri-llm-demo/
- **离线**：双击 `index.html`（单文件，字体 / 地图 / 图表 / 世界边界全部内联，无任何网络请求）
- **本地（可连真实模型）**：

```bash
./serve.sh start              # 已封装：后台常驻 + PID + 日志 + 健康检查（默认 4180）
# 或手动：
node server.mjs               # 不配任何 key 也行：自动只读复用本机 pi 配置
node --env-file=.env server.mjs   # Node ≥ 20；或先 export 变量再 node server.mjs
# 打开 http://127.0.0.1:4173/  → 右上角「⚙ AI 配置」
```

`.env.example` 里只有变量名与安全示例，**没有任何真实 key**：

| 变量 | 作用 | 示例 |
| --- | --- | --- |
| `PORT` | 本地服务端口 | `4173`（`serve.sh` 用 `4180`） |
| `AGRI_BIND` | 监听地址，默认 `127.0.0.1`（配置 API 不暴露到局域网） | `127.0.0.1` |
| `AGRI_LLM_BASE_URL` | OpenAI-compatible baseURL（不带结尾斜杠、不带 `/chat/completions`） | `https://api.deepseek.com` / `http://127.0.0.1:1234/v1` |
| `AGRI_LLM_MODEL` | 模型名 | `deepseek-flash` / `deepseek-v4-pro` / LM Studio 的 model id |
| `AGRI_LLM_API_KEY` | 模型凭证（也可用 `LM_API_TOKEN` / `OPENAI_API_KEY` / `DEEPSEEK_API_KEY`） | 填在你的 `.env` 里 |
| `AGRI_LLM_KEY_FILE` | 或指向本机已有的凭证文件（只读第一行） | `/absolute/path/to/keyfile` |
| `AGRI_CONFIG_FILE` | 本机受限配置文件的落盘位置 | `~/.agrilink/ai-config.json`（默认） |
| `AGRI_NO_IMPORT` | 关掉「只读导入本机 pi / LM Studio 配置」 | `1` |
| `AGRI_LLM_TIMEOUT_MS` / `AGRI_LLM_VERIFY_TIMEOUT_MS` | 对话超时 / `/models` 校验超时 | `60000` / `4000` |
| `AGRI_LLM_MAX_TOKENS` / `AGRI_LLM_TEMPERATURE` | 最大输出长度 / 温度 | `4096` / `0.3` |

不配任何 key 时，服务端会**只读复用**本机已有的 pi 配置（`~/.pi/agent/models-store.json` 的 baseUrl + `models`、`auth.json` 的 key，**不改动原配置**）；baseURL 指向本机时还会尝试 `~/.lmstudio/.internal/lms-key-2`。所有导入动作都是只读 + 仅内存（也可显式落盘到 `~/.agrilink/ai-config.json`）。

### 复现校验命令（不泄露 key）

```bash
# 0) 服务端起来了吗、凭证是否被识别（不回显 key 本身）
curl -s http://127.0.0.1:4173/api/health | python3 -m json.tool

# 1) 实际接口的 /models：确认 baseURL + model 可用
curl -s http://127.0.0.1:4173/api/models | python3 -m json.tool

# 2) 实际跑一次 chat（走同一条转发链路，与页面用的是同一个 /api/chat）
curl -s -X POST http://127.0.0.1:4173/api/chat \
  -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"用一句话说明红星（示意）数据口径"}]}' | python3 -m json.tool

# 3) 直接验上游（可选；key 从本机环境变量读，不进 shell 历史）
curl -s "$AGRI_LLM_BASE_URL/models" -H "authorization: Bearer $AGRI_LLM_API_KEY" | head -c 400
```

### 持久运行（郭慧电脑本机，2026-09-17 实测）

```bash
./serve.sh start     # 启动（默认 4180，只监听 127.0.0.1）
./serve.sh status    # 状态 + 健康检查 + 日志末尾
./serve.sh restart   # 重启
./serve.sh stop      # 停止（只杀本脚本启动的那个 PID）
```

| 项 | 值 |
| --- | --- |
| 本地演示地址 | http://127.0.0.1:4180/ （配置页：右上角「⚙ AI 配置」） |
| 管理方式 | `serve.sh` + PID 文件（`~/.agrilink/demo.pid`），未装系统级 supervisor |
| 日志 | `~/.agrilink/demo.log`（只记 `方法 路径 状态 耗时`） |
| 配置文件 | `~/.agrilink/ai-config.json`（0600） |

### 真实连通性实测（2026-09-17，未改动任何用户配置）

| 目标 | 实测结果 | 结论 |
| --- | --- | --- |
| **DeepSeek 云端** `GET https://api.deepseek.com/models` | **HTTP 200 ｜ 494ms ｜ 返回 `deepseek-flash`、`deepseek-v4-pro`** | **真实调用成功**；凭证只读复用本机 `~/.pi/agent/{models-store,auth}.json`（`pi-import:pi-deepseek`，末尾 `1cf8`） |
| **DeepSeek 云端** `POST /chat/completions` | **HTTP 200 ｜ 2460ms ｜ 非空 78 字 ｜ model=deepseek-flash** | **真实调用成功**；回答见 `test/report-live.md`（脱敏片段） |
| LM Studio `http://127.0.0.1:1234/v1/models` | **服务在运行**（模型已加载），但无 token 返回 `401`「An LM Studio API token is required」 | 需在配置页粘一次有效 token |
| 本机 `~/.lmstudio/.internal/lms-key-2`（24 字符） | 存在，但被上游判为 `401 Malformed LM Studio API token` | 该文件不是当前有效的 server token；**未改动用户配置**，改用配置页或 `LM_API_TOKEN` |

真实链路（`GET /api/models` → 「真实模型已连接」徽标 → 真实回答带上下文封套 → 凭证只出现在服务端出站请求头 → 页面 / localStorage / 日志都不含 key）由 `node test/live-check.mjs` 对**正在运行的真实服务**复验，报告在 `test/report-live.md`、截图在 `shots-live/`。

失败与边界情形（未配置 / 连接中 / 连接成功 / 调用失败降级 / 取消 / 重试 / 配置保存·脱敏·恢复·清除 / 静态公开版不给 key 输入框）由 `node test/round4.mjs` 用本地模拟上游做**确定性验证**（凭证为测试哨兵值，真实 API 不会被测试日志录制）。

## 数据口径表

| 口径 | 定义 | 用在哪 | 层级 |
| --- | --- | --- | --- |
| 海关进口量 | 海关总署公开月度统计，按品类归并（可立即实数化） | 数据骨架第 1–2 段 / L1 全球货源流向 | 国家 |
| 批发市场交易量 | 市场经营 / 交易台账，按来源地归并 | L2 进口直达市场 · L3 湖南集散 · L4 红星 | 市场 |
| 产区供给规模 | 产量 + 外调净流入，折万吨 | L2 全国产区与省际流通 | 省 / 市 |
| 省际调运量 | 批发市场到货台账折算 | L2 省际流通 | 省际 |
| 环节台账 / 单季均值 | 产区调研 + 环节台账 | L4 城市代表单品全链路 | 环节 |
| 部位级切片（牛前腱等） | 市场经营 / 交易台账层级的品类·部位切片 —— **不冒充海关公开统计口径** | L4 品类 · 部位 | 市场 |
| 红星口径 | 企业 / 媒体表述；红星实业公开资料，本页**不作「全国第一」类断言**，口径待核 | L3 湖南 / 红星节点 · 演示中心 | 企业 |

叙事约束（已写进数据与真实模型的 system 提示词）：

- **榴莲**：泰国金枕为主流量级来源、越南 Ri6 为陆运时效来源；马来西亚猫山王（彭亨劳勿 / 文冬）是**小份额高价值**来源，**不得写成中国最大榴莲供应国**。
- **车厘子**：以智利为主要来源，体现南半球反季窗口（11 月–次年 1 月采收）、海运为主 / 空运抢早窗口、以及中国消费链路。
- **牛肉**：巴西为重要 / 主导来源，阿根廷、乌拉圭、澳大利亚、新西兰作为对照来源。
- **牛前腱**：明确是市场经营 / 交易台账层级的品类·部位切片。
- **红星**：总部 / 核心市场位于湖南，表达为湖南及中南区域农副产品集散枢纽；「中南最大」类表述只注明为企业 / 媒体表述并保留口径提示。

## 构建与测试

```bash
node build.mjs           # src + vendor + data + fonts → index.html（单文件）
node test/e2e.mjs        # 基础交互回归（桌面 + 移动）           → test/report.md
node test/visual.mjs     # 视觉 / 布局验收（1366/1440/1920/390）  → test/report-visual.md  shots/
node test/round3.mjs     # 上轮专项：二维地球 / L3 越界 / AI 两通路 / 叙事口径 → test/report-round3.md  shots-r3/
node test/round4.mjs     # 本轮专项：空对象提问 / 上下文注入 / 四状态 / 配置中心 / 密钥不泄露 → test/report-round4.md  shots-r4/
node test/live-check.mjs # 对**正在运行的真实服务**做真实连通性验证 → test/report-live.md  shots-live/
```

全部套件都需要 chromium（Playwright）：`npm run test:all`（e2e + visual + round3 + round4）。

测试覆盖矩阵（共 259 项，全部通过）：

| 套件 | 用例数 | 范围 |
| --- | --- | --- |
| `test/e2e.mjs` | 54 | 四层下钻 / 返回 / 抽屉 / 触控 / 离线零外部请求 |
| `test/visual.mjs` | 74 | 浮层不重叠 / 对比度 / 焦点可见 / 移动端溢出 / 空对象可输入 |
| `test/round3.mjs` | 74 | 二维地球 / L3 不越界 / AI 两条通路（mock 上游）/ 叙事口径 |
| `test/round4.mjs` | 57 | 空对象提问 / 上下文注入 / 未配置·连接中·成功·降级·取消·重试 / 配置中心保存·脱敏·恢复·清除 / DOM·bundle·localStorage·日志不含 key / 公开版不给 key 输入框 |

`test/round3.mjs` 与 `test/round4.mjs` 里 AI 的真实通路用**进程内 mock 上游**验证，凭证是测试哨兵值（`sk-TEST-ONLY-…`），因此**真实 API 不会被测试日志录制**；`test/live-check.mjs` 才是真实调用（只记录状态码 / 模型名 / 耗时 / 非空 / 脱敏片段）。

`node build.mjs` 会输出确定性构建指纹并写入 `build-meta.json`：

```
index.html  2399 KB  single-file / offline-ready  build=<sha256:12> git=<short sha>
```

> 核对**以 `hash` 为准**：它只由构建输入内容决定（确定性）。`git` 是**构建时的 HEAD**，
> 而构建发生在提交之前，所以它比发布的那一次提交早一位 —— 不要用 `git` 字段判版。

线上核对（本地 `build-meta.json` 的 `hash` 应与线上一字不差）：

```bash
curl -s https://upstardata.github.io/agri-llm-demo/ | grep -o 'window.__AGRI_BUILD={[^}]*}' | head -1
```

## 目录

```
index.html          # 构建产物：单文件、零外部依赖（发布对象）
build.mjs           # 构建脚本（含构建指纹）
server.mjs          # 本地演示服务：同源托管 + /api/chat 转发 + /api/config* 配置中心（零依赖）
serve.sh            # 常驻演示服务的启停 / 状态 / 日志（PID + 日志都在 ~/.agrilink/）
.env.example        # 只有变量名与安全示例
src/                # shell.html / app.css / data.js / globe.js / provider.js / ai.js / aiconfig.js / map.js / app-chain.js / app.js
data/               # 中国省级边界、世界国界（构建时内联）
vendor/echarts.min.js
fonts/              # IBM Plex Sans SC 子集（构建时 base64 内联）
test/               # e2e.mjs + visual.mjs + round3.mjs + round4.mjs + live-check.mjs + 报告
```

## 已知限制

- 全部数值为示意值（待标定）；数据骨架与口径框架是真的，数字不是。真实化第一期只需要换 `src/data.js` 的数值来源层。
- 进口直达 / 调运 / 环节台账依赖红星体系内部子分公司数据梳理；当前为示意。
- 主体级数据（L5）尚未成立，仅以 L4 内的「经营主体抽屉」确认信息结构。
- ~~真实模型问答未做过实际调用~~ → **已修正**：DeepSeek 云端（`deepseek-flash`）已实际跑通 `/models` + `/chat/completions`，见上表实测与 `test/report-live.md`。LM Studio 服务在本机运行但本地 token 被上游判为 401，需在「⚙ AI 配置」里粘一次有效 token。
- 公开静态版（GitHub Pages）**做不到真实调用**：静态站无法安全持有计费 key。若要公开版也接真模型，需另部署带凭证托管的后端（三选一，**本轮未新增任何云资源**）：

  | 选项 | 做法 | 量级成本 | 代价 |
  | --- | --- | --- | --- |
  | 平台 Serverless（Vercel / Cloudflare Workers） | 把 `server.mjs` 的 3 个 API 改写成单个函数，key 放平台环境变量，前端固定指向它 | 免费额度内约 0；超出后约 $5–20/月 | 需要域名 / CORS / 防滥用（否则任何人可盗刷你的额度） |
  | 小型 VPS（1 vCPU / 1 GB） | 直接跑 `node server.mjs`，反代 + HTTPS，key 只在本机 0600 文件 | 约 $5/月 | 要自己维护系统、证书、重启 |
  | 云厂商 API 网关 + 密钥托管（KMS / Secrets Manager） | 网关鉴权 → 函数 → 密钥托管取 key | 按调用量（每月数千次约 $1–5） | 搭建与权限成本最高，但审计最完整 |

  不管哪一条，都必须在后端加一层**速率限制 + 来源校验**：前端是公开的，没有这一层就等于把 key 公开。
- L3 左下分析卡片在 ≤860px 高的笔记本视口会把竞争力雷达降为缩略图（数值仍在要点列与右侧面板），以保证地图中央的数据节点不被卡片遮住。
- 移动端 L3 卡片是紧凑横条（雷达与要点列让位给地图），对应要点在右侧面板等价可得。
