# 数据包校验报告 · agrilink-demo-v1

校验时间：2026-09-21T18:00:00Z · 通过 39/39 项

- ✅ `unique.factId` — 861 条事实，重复 0 条
- ✅ `unique.entityId` — 377 个实体，重复 0 个
- ✅ `unique.relationId` — 585 条关系，重复 0 条
- ✅ `dedupe.title` — 完全同标题记录 11 条（同标题出现在不同区域/时间为正常：区域下钻需要同名指标）
- ✅ `refs.factEntityIds` — 事实引用不存在的实体：[]
- ✅ `refs.factCommodityIds` — 品种引用不存在：[]
- ✅ `refs.relationEndpoints` — 关系端点不存在：[]
- ✅ `refs.relationSupport` — 关系支撑事实不存在：[]
- ✅ `refs.sourcePlugin` — 事实引用了未登记来源：[]
- ✅ `refs.entityType` — 实体类型未在本体注册：[]
- ✅ `relation.verifiedHasSupport` — 已证实关系缺支撑：0 条
- ✅ `relation.inferredNoSupport` — 推断关系不应带支撑：0 条
- ✅ `relation.endpointConstraint` — 违反端点约束：0 条
- ✅ `relation.supportLinkage` — 支撑事实未直接引用端点的关系 154 条（同区域/同品种事实间接支撑，见报告说明）
- ✅ `real.sourceUrl` — 真实记录缺 URL：0 条
- ✅ `real.evidence1to1` — 真实记录缺证据：0 条
- ✅ `real.observation1to1` — 证据引用缺失观测：0 条
- ✅ `real.evidenceUrl` — 证据缺 URL：0 条
- ✅ `real.collectedAt` — 采集时间集合：['2026-09-21']
- ✅ `generated.noFakeUrl` — 生成记录带 sourceUrl：0 条
- ✅ `display.noSampleWording` — 标题/摘要出现示意类字样：0 条
- ✅ `generated.flagPresent` — 生成标记缺失：0 条
- ✅ `geo.coordinateRange` — 坐标越界/空岛：0 条
- ✅ `geo.notInOcean` — 距最近陆地块 >25km 的非港口事实：0 条（50m 简化面判定，容差 25km）
- ✅ `geo.portCoastal` — 港口事实点位于海侧（港口本身即海岸线地物）：11 条
- ✅ `geo.anchorConsistency` — 与登记锚点偏差 >1km 的事实：0 条
- ✅ `geo.regions` — 64 个要素；ID 唯一=True；坐标合法=True；含来源=True
- ✅ `geo.ports` — 56 个要素；ID 唯一=True；坐标合法=True；含来源=True
- ✅ `geo.airports` — 49 个要素；ID 唯一=True；坐标合法=True；含来源=True
- ✅ `geo.nodes` — 4 个要素；ID 唯一=True；坐标合法=True；含来源=True
- ✅ `geo.regionCommodityRefs` — 产区引用不存在品种：0
- ✅ `card.requiredFields` — 卡片缺必填字段：0 条
- ✅ `layer.scopeConsistency` — 分层与 regionPath 不一致：0 条
- ✅ `stream.monotonic` — 1135 条事件，tOffsetMs 单调=True
- ✅ `stream.starFacts` — 160 个新星事件，事实引用有效=True
- ✅ `stream.brightRatio` — 亮星 21 / 微弱 139（severity≥70 为亮星）
- ✅ `ontology.displayDomains` — 展示对象域 9 个：['市场', '公司', '基地', '品种', '政策机构', '区域', '人物角色', '指标', '设施渠道']
- ✅ `ontology.taxonomy` — L1 大类 10 个；三级字典层级数 10
- ✅ `stats.consistency` — stats 与文件一致：facts 861==861，relations 585==585

## 说明

- 陆海校验基于 Natural Earth 1:50m 国家面简化几何，容差 25km；港口点按海岸线地物单列，不计入落海判定。
- relation.supportLinkage 为提示项：部分关系由同区域/同品种事实间接支撑（契约允许 supportingFactIds 指向支撑事实集合）。
- 生成记录不含 evidence/observations，其来源可追溯性由 provenanceMeta + 生成器规则提供。
