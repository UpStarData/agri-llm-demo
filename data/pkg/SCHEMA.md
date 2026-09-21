# AgriLink 展示数据包 schema · agrilink-demo-v1

数据集 `agrilink-demo-v1@1.0.0` · 生成时间 2026-09-21 · 采集日 2026-09-21 · 统计见 `stats.json`，校验见 `validation.json`（39/39 通过）

## 1. 文件清单与消费方式

| 文件 | 内容 | 前端用法 |
|---|---|---|
| `manifest.json` | 数据集元信息、计数、分层与下钻规则、来源策略 | 顶部数据概览、左侧面板「数据概览」层 |
| `facts.json` | 861 条事实（真实 90 / 生成 771） | 事实星点、事实卡片流、详情弹窗 |
| `entities.json` | 377 个本体对象（9 类对象域 + 3 类事实投影） | 关联层节点、本体详情、品种筛选树 |
| `relations.json` | 585 条关系（已证实 583 / 推断 2） | 关联层连线、关联详情 |
| `observations.json` / `evidence.json` | 真实记录的一手观测与证据（各 90 条，1:1） | 证据详情页、可信度说明 |
| `ontology.json` | 本体类型注册表、关系端点约束、三级分类字典 | 左侧图层菜单三级分类、图例 |
| `sources.json` | 61 个真实来源 + 10 个生成数据族登记 | 来源清单、可信度分级 |
| `cards.schema.json` | 六类卡片模板字段 | 右侧卡片模板（R2） |
| `stream.sequence.json` | 1135 条时序事件（流水日志 + 新星事件） | 底部流水（B3）+ 地图新星（M15） |
| `geo/regions.geojson` | 64 个真实产区点位 | 快捷键 5（M5） |
| `geo/ports.geojson` | 56 个真实港口 | 快捷键 6（M6） |
| `geo/airports.geojson` | 49 个真实机场 | 快捷键 6（M6） |
| `geo/nodes.geojson` | 5 个冷链/内河口岸节点 | 图层与本体详情 |
| `stats.json` | 覆盖率、真实/生成统计、密度计划 | 验收与左侧概览 |
| `validation.json` / `validation.md` | 去重、引用、地理、卡片、时序校验报告 | 验收复核 |

## 2. Fact（与既有 `agri-three-layer-v1` 兼容，新增字段以 ◆ 标注）

```ts
interface Fact {
  factId: string; factType: 'event'|'metric'|'document'|'prediction'; dedupeKey: string;
  status: 'active'|'superseded'|'retracted'|'quarantined';
  title: string; summary: string;
  category: string;                  // L1 大类（10 个受控值，同既有 CATEGORY_COLORS）
  ◆ cardType: 'news'|'policy'|'price'|'weather'|'video'|'market';   // 六类卡片模板
  ◆ card: { type: string; fields: Record<string, unknown> };        // 卡片展示字段（见 cards.schema.json）
  taxonomy: { l1: string; l2?: string; l3?: string };
  entityIds: string[]; commodityIds: string[]; industryId?: string;
  timestamp/occurredAt/publishedAt/ingestedAt: string;
  regionIso: string;
  geo: { geoPrecision: 'exact'|'approx'|'region_only'|'none'; scopeLayer: 'L1'|'L2'|'L3';
         regionPath: Array<{level,code,name}>; geoPoint: [number,number]|null;
         drillableTo?: string[]; cityPrecisionOnly?: boolean };
  sourcePlugin: string; sourceUrl?: string; authorityTier: 'A'|'B'|'C'|'D'; confidence: number;
  severity: number; severityBasis: { ruleId: string; inputs: Record<string, unknown> };
  credibility: { score: number; band: 'high'|'medium'|'low'; inputs: {...} };
  evidenceIds: string[]; corroboration: { observationCount: number; distinctSourceCount: number };
  review: { state: string };
  ◆ provenanceMeta: { dataMode: 'real'|'generated'; dataOrigin: string; sourcePlugin: string;
                      collectedAt: string; realSourceHint: string|null; placeholders: string[];
                      geoAnchorPlace: string|null; geoAnchorPrecision: string; generator: string|null };
  sampleMeta: { dataMode: 'real'|'generated'; sampleKind: 'demo'; realSourceHint: string|null; placeholders: string[] };
  metricKey?/metricValue?/metricUnit?/metricPeriod?/metricGranularity?;   // metric 型事实
}
```

**与既有 sample 包的差异（前端改动点）**

1. `sampleMeta.dataMode` 取值由 `sample` 变为 `real|generated`。既有原型在 `proto.ts` 写死了「sample · 非真实业务数据」徽标与全站提示条，需按 G6/R2 移除；内侧区分改读 `provenanceMeta`。
2. 新增 `cardType` / `card` / `provenanceMeta` 三个字段；其余字段名、层级语义（`scopeLayer`、`regionPath`、`drillableTo`、`cityPrecisionOnly`）与既有 `core.ts` 一致，`factPoint()`、`factInLevel()` 可直接复用。
3. `category` 仍只取既有 10 个 L1 值 —— 视频卡与市场卡不新增 L1 大类，只切换卡片模板，因此 `CATEGORY_COLORS/CATEGORY_NAMES` 无需改动。
4. 生成记录**不带** `evidenceIds` / `evidence`（真实记录才有）。F3 证据页面对生成记录会显示「无证据记录」，建议改为渲染 `provenanceMeta`（生成器 + 锚点 + 采集日）。
5. `review.state`：真实记录按规则门控取 `auto_verified|pending_human`，生成记录统一 `agent_extracted`（UI 现有 `reviewLabel` 渲染为「待核验」）。

## 3. Entity / Relation / Ontology

- Entity：`entityId='e:{typePrefix}:{mnemonic}'`（区域 `e:rgn:CN-HN`、品种 `e:cmd:durian`、基地 `e:base:hn-mayang`、设施 `e:fac:port-shanghai`、其余 `e:mkt-*` / `e:ent-*` / `e:org-*` / `e:person-*` / `e:met-*`）。无坐标对象 `geo=null`（当前 18 个，含广州江南市场、Talaad Thai、Rungis 等），仅出现在右侧面板与图谱。
- 9 个展示对象域：Market 市场 / Enterprise 公司 / Base 基地 / Commodity 品种 / Organization 政策机构 / Region 区域 / Person 人物角色 / MetricObservation 指标 / LogisticsNode 设施渠道。另注册 Policy / WeatherEvent / IndustryEvent 三个事实投影类型（`isDisplayDomain=false`）。
- Relation：12 类业务关系 + 端点约束，见 `ontology.json.relationConstraints`。`nature=verified` 必有 `supportingFactIds`；`inferred` 必为空（校验项 `relation.verifiedHasSupport` / `relation.inferredNoSupport`）。
- `Relation.quantity.factId` 指向数值来源事实，可直接回链。

## 4. 坐标规范与地理校验

| 对象 | 坐标含义 | 精度 | 来源 |
|---|---|---|---|
| 产区 Base | 产区所在行政区代表点（**非田块级**） | `region_center` | OpenStreetMap Nominatim / GeoNames |
| 港口 LogisticsNode | 港口地物点 | `exact` | Natural Earth 10m ports（neId）/ OSM |
| 机场 LogisticsNode | 机场参考点 | `exact` | OurAirports（ourAirportsId + wikipedia） |
| 事实 | 等于其真实锚点，不额外抖动 | 随锚点 | 见 `provenanceMeta.geoAnchorPlace` |

校验口径（`validation.json`）：坐标范围合法、空岛排除、Natural Earth 1:50m 面陆海判定（容差 25 km，港口点单列不计落海）、事实点与登记锚点偏差 ≤1 km。

## 5. 卡片模板（R2）

| cardType | 必填字段 | 说明 |
|---|---|---|
| `news` | title, summary, sourceName, publishedAt | 标题 + 摘要 + 来源 + 时间 |
| `policy` | policyTitle, issuer, effectiveDate, impactSummary | 政策标题 + 机构 + 生效日 + 影响摘要 |
| `price` | commodityName, priceValue, priceUnit, changePct（+trend/caliber） | 品种 + 变动 + 迷你趋势 |
| `weather` | regionName, weatherIconCode, alertLevel(红橙黄蓝), impactText | 地区 + 图标 + 影响 |
| `video` | mediaTitle, embedUrl, provider, isLive, embeddable | `embeddable=no/unknown` 必须给 `fallbackReason` |
| `market` | instrumentName, symbol, lastPrice, unit, changePct, exchange（+kline） | 迷你 K 线/涨跌指标 |

## 6. 时序序列（B3 + M15）

`stream.sequence.json.events[]`：`{ tOffsetMs, seq, stage, line, factId, star }`

- `stage`：`ingest | extract | resolve | geo | score | link | graph | warn`（对应底部流水日志行）
- `star`：`{ factId, level: 'bright'|'dim', geoPoint, severity, category, occurredAt }`，`severity≥70` 为亮星（重要事实），否则微弱星
- `loopMs` 为一个循环总时长（当前 454067 ms ≈ 7.6 分钟，可按现场节奏整体缩放 `tOffsetMs`）
