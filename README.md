# 农链 AgriLink · 中国农产品产业地图（阶段演示）

面向农博会 / 集团展示场景的**阶段性领导演示 Demo**，用于确认展示形态与信息结构。
线上：https://upstardata.github.io/agri-llm-demo/

> ⚠️ 页面内**所有数值均为示意数据（待标定）**，仅用于表达信息结构；
> 口径字段为真实口径框架（海关贸易量 / 产区供给规模 / 省际调运量 / 环节台账 / 元·kg）。
> 本 Demo 为独立阶段性演示，不关联、不替代长期「农产品交易大模型」。

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
| `规则演示` | `file://` 静态版；或静态托管（GitHub Pages）没有同源代理；或服务端未配置凭证 | 本地规则化应答（对象驱动），**不发起任何多余网络请求**，页面完全离线可用 |
| `加载中 · 正在检测模型服务` | 通过 http(s) 打开且正在探测 `/api/health` | 探测期间；提问时显示「加载中」，不白屏 |
| `真实模型已连接 · <model>` | 服务端 `/models` 校验通过 | 提问走 `POST /api/chat` → 服务端转发到 OpenAI-compatible 上游；回答带「真实模型回答」标识 |
| `错误后降级 · 规则演示` | 真实调用失败（超时 / 4xx / 5xx） | 立即回落到规则应答，徽标说明失败原因；不假装是模型答案 |

**每条回答（两种模式都是）都携带上下文封套**：当前层级 / 当前选择 / 红星市场 / 品类 / 数据口径 / 数据属性（示意·待标定）。真实模型还会额外收到同一份上下文的 system + user 消息。

### 同源代理的识别方式（公开版零控制台错误）

前端不会盲目去打 `/api/health`（静态托管上那会是一个 404 与控制台错误）。`server.mjs` 的所有静态响应都带 `x-agri-proxy: 1`；前端先对当前目录发一个 `HEAD`，

- 没有这个头 → 判定为静态托管，直接进「规则演示」，**一共只发了这一个 HEAD 请求**；
- 有这个头 → 再调 `/api/health`（内含 `/models` 校验）决定「真实模型已连接 / 规则演示」。

因此 https://upstardata.github.io/agri-llm-demo/ 是干净的静态演示：不谎报模型已连接，也不产生 404。

### 凭证的处理

- **只在服务端读取**：`server.mjs` 从环境变量或本机已有配置文件读 key，key 只存在于服务端进程内存与出站请求头。
- **绝不进源码 / 前端 bundle / commit / issue / 日志 / 截图 / 测试快照**：构建产物里没有任何 key（`test/round3.mjs` 会断言这一点）；服务端日志只打 `方法 路径 状态 耗时`，不打请求体与 Authorization，并且所有出站错误信息都过 `redact()`。
- GitHub Pages 是纯静态版：没有同源代理，因此**默认且只能是「规则演示」**，绝不携带云端 key。

## 使用

- **线上（静态 · 规则演示）**：https://upstardata.github.io/agri-llm-demo/
- **离线**：双击 `index.html`（单文件，字体 / 地图 / 图表 / 世界边界全部内联，无任何网络请求）
- **本地（可连真实模型）**：

```bash
cp .env.example .env          # 只填变量名与你的值；.env 已在 .gitignore
node --env-file=.env server.mjs     # Node ≥ 20；或先 export 变量再 node server.mjs
# 打开 http://127.0.0.1:4173/
```

`.env.example` 里只有变量名与安全示例，**没有任何真实 key**：

| 变量 | 作用 | 示例 |
| --- | --- | --- |
| `PORT` | 本地服务端口 | `4173` |
| `AGRI_LLM_BASE_URL` | OpenAI-compatible baseURL（不带结尾斜杠、不带 `/chat/completions`） | `https://api.deepseek.com/v1` / `http://127.0.0.1:1234/v1` |
| `AGRI_LLM_MODEL` | 模型名 | `deepseek-chat` / LM Studio 的 model id |
| `AGRI_LLM_API_KEY` | 模型凭证（也可用 `LM_API_TOKEN` / `OPENAI_API_KEY` / `DEEPSEEK_API_KEY`） | 填在你的 `.env` 里 |
| `AGRI_LLM_KEY_FILE` | 或指向本机已有的凭证文件（只读第一行） | `/absolute/path/to/keyfile` |
| `AGRI_LLM_TIMEOUT_MS` / `AGRI_LLM_VERIFY_TIMEOUT_MS` | 对话超时 / 启动时 `/models` 校验超时 | `60000` / `4000` |

同一台下，baseURL 指向 LM Studio 时会自动尝试本机已有配置 `~/.lmstudio/.internal/lms-key-2`（只读、不进日志）。

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

### 本机诊断（2026-09-17 执行机实测，未改动任何用户配置）

| 目标 | 结果 | 含义 / 下一步 |
| --- | --- | --- |
| LM Studio `http://127.0.0.1:1234/v1/models` | **服务在运行**（模型已加载），但返回 `401`「An LM Studio API token is required」 | LM Studio 侧开了「Require API token」；把有效 token 放进 `LM_API_TOKEN`（或 `AGRI_LLM_API_KEY`）即可切到「真实模型已连接」 |
| 本机已有配置 `~/.lmstudio/.internal/lms-key-2` | 存在（24 字符）但被上游判为 `invalid_api_key / malformed` | 该文件不是当前有效的 server token；**未改动用户配置**，改用 `LM_API_TOKEN` 传有效 token |
| DeepSeek 凭证 | 环境变量（`AGRI_LLM_API_KEY` / `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` …）均未设置，本机也未找到对应配置文件 | 需要真实云端调用时，把 key 填进本机 `.env`（不要贴进 issue / 源码） |

因此本轮**真实模型通路的正确性用「本地模拟上游」做了确定性验证**（`test/round3.mjs`：起一个 OpenAI-compatible mock，起 `server.mjs` 指向它，浏览器里跑完整链路），验证了：`/models` 校验 → 「真实模型已连接」徽标 → 回答带上下文封套 → 凭证只出现在服务端出站请求头 → 上游 500 时切「错误后降级」且仍给规则回答 → 服务端日志不含凭证。
真实 LM Studio / DeepSeek 只需按上表补一个有效 token，无需改代码。

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
node test/round3.mjs     # 本轮专项：二维地球 / L3 越界 / AI 两通路 / 叙事口径 → test/report-round3.md  shots-r3/
```

三个套件都需要 chromium（Playwright）：`node test/e2e.mjs && node test/visual.mjs && node test/round3.mjs`（或 `npm run test:all`）。

`test/round3.mjs` 里 AI 的真实通路用**进程内 mock 上游**验证，凭证是测试哨兵值（`sk-TEST-ONLY-…`），因此**真实 API 不会被测试日志录制**。

`node build.mjs` 会输出确定性构建指纹并写入 `build-meta.json`：

```
index.html  2325 KB  single-file / offline-ready  build=<sha256:12> git=<short sha>
```

线上核对：

```bash
curl -s https://upstardata.github.io/agri-llm-demo/ | grep -o 'window.__AGRI_BUILD={[^}]*}' | head -1
```

## 目录

```
index.html          # 构建产物：单文件、零外部依赖（发布对象）
build.mjs           # 构建脚本（含构建指纹）
server.mjs          # 本地演示服务：同源托管 + /api/chat 转发（零依赖）
.env.example        # 只有变量名与安全示例
src/                # shell.html / app.css / data.js / globe.js / provider.js / ai.js / map.js / app-chain.js / app.js
data/               # 中国省级边界、世界国界（构建时内联）
vendor/echarts.min.js
fonts/              # IBM Plex Sans SC 子集（构建时 base64 内联）
test/               # e2e.mjs + visual.mjs + round3.mjs + 报告
```

## 已知限制

- 全部数值为示意值（待标定）；数据骨架与口径框架是真的，数字不是。真实化第一期只需要换 `src/data.js` 的数值来源层。
- 进口直达 / 调运 / 环节台账依赖红星体系内部子分公司数据梳理；当前为示意。
- 主体级数据（L5）尚未成立，仅以 L4 内的「经营主体抽屉」确认信息结构。
- 真实模型问答未在本执行机对公开云端或局域网 LM Studio 做过实际调用（缺有效 token，见上表诊断）；通路正确性由本地 mock 上游确定性地覆盖。
- L3 左下分析卡片在 ≤860px 高的笔记本视口会把竞争力雷达降为缩略图（数值仍在要点列与右侧面板），以保证地图中央的数据节点不被卡片遮住。
- 移动端 L3 卡片是紧凑横条（雷达与要点列让位给地图），对应要点在右侧面板等价可得。
