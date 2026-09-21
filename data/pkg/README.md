# AgriLink 农链 · 事实层 / 关联层展示数据包 v1

数据集 `agrilink-demo-v1@1.0.0` · 2026-09-21 · 真实数据优先，取不到的按同一 schema 生成并内部标记。

## 一页结论

- 事实 **861** 条（真实 **90** / 生成 **771**）、本体对象 **377** 个（9 类对象域）、关系 **585** 条（已证实 583）、
  真实产区 **64** 个 / 港口 **56** 个 / 机场 **49** 个（全部带机构、许可与可复核链接）。
- 全球视角可见点由现状 3 个提升到 **342** 个；中国大陆层 **175**、湖南 **281**、长沙 **98**（其中红星市场链路 174）。
- 六类卡片模板（新闻/政策/价格/天气灾害/视频直播/股票市场）全部有数据；`validation.json` 39 项校验全通过。

## 数据量如何定的（M13）

| 视野 | 可见事实 | 说明 |
|---|---|---|
| 全球 L1 | 342 | 覆盖中国、马来西亚、巴西、智利、美国、印度、澳大利亚、东南亚、非洲、欧洲 24 个国家，每国 ≥3 个真实地理锚点 |
| 中国 L2 | 175 | 全国政策/价格/海关/天气口径，锚定京沪渝穗汉昆等真实市场与口岸 |
| 湖南 L3 | 281 | 覆盖 14 个地市 + 18 个真实产区（麻阳、江永、安化、靖州、永兴、洞口、隆回、祁东、汉寿、炎陵、石门、沅江、道县、桃源、宁乡…） |
| 长沙 430100 | 98 | 9 个区县 + 红星农副产品大市场进口水果链路（榴莲/猫山王/龙眼/山竹/椰子） |
| 单视野上限 | 342 | 页面按视野过滤渲染，SVG 圆点 + 文本标签在 342 点实测可交互；超过约 500 点建议改为 Canvas/聚合 |

生成记录的地理锚点一律取真实坐标（OSM/GeoNames 行政区中心、Natural Earth 港口、OurAirports 机场），
不额外抖动，因此不存在落海、跨国错位或伪造坐标。

## 真实 / 生成如何区分（内部可追溯）

- 真实记录：`provenanceMeta.dataMode="real"` + 真实 `sourceUrl` + `sources.json` 登记的机构与采集日 + `evidence`/`observations` 一一对应。
  `sources.json` 中 61 个真实来源全部为检索到的真实页面（政府网站、交易所、行业协会、通讯社、国际组织）。
- 生成记录：`provenanceMeta.dataMode="generated"`，`sourcePlugin` 指向 `gen-*` 生成数据族，无 `sourceUrl`，无 evidence；
  生成规则与锚点在 `provenanceMeta` 中可见。
- 标题与摘要**不出现**「示意/样例/示例/sample」等字样（校验项 `display.noSampleWording` 强制）。

## 目录与接入

```
agrilink-demo-v1/
  manifest.json  facts.json  entities.json  relations.json  ontology.json  sources.json
  observations.json  evidence.json  cards.schema.json  stream.sequence.json
  stats.json  validation.json  validation.md  SCHEMA.md  README.md
  geo/{regions,ports,airports,nodes}.geojson
```

接入方式（不改本包内容即数据接入）：现有原型通过 `frontend/vite.config.ts:47` 与 `frontend/tsconfig.json:22`
的 `@sample3l` 别名读取 `shared/sample/agri-three-layer-v1`。将本包放到 `shared/sample/agrilink-demo-v1/`
并新增别名（或在开发环境切换别名指向）即可；`run.json` / `report.json`（推演层）本包不含，请继续沿用原样例包，
建议拆成 `@facts`（新包）与 `@sim`（旧包）两个别名，避免推演层数据被一并替换。

前端需要配合的改动清单见 `SCHEMA.md` §2「与既有 sample 包的差异」。

## 复现与校验

```bash
python3 build/assemble.py     # 生成数据包（确定性随机种子 20260921）
python3 build/validate.py     # 独立校验 → validation.json / validation.md
```

原始真实数据快照保存在 `build/raw/`（OurAirports 全量 CSV、Natural Earth 10m ports、GeoNames cities5000/15000、
Nominatim 解析缓存、World Bank WDI 序列），报告中的抽样复核可据此重放。
