# 数据核查库（事实层 + 关联层）· 使用说明

刘洋 2026-10-16：「把你现在用到的事实层关联层的数据…我想你直接是数据库，然后我可以查看」

## 它是什么

一台本机（127.0.0.1）上的 SQLite 库 + Datasette 网页查询界面，内容是**页面正在使用的同一份数据**：

| 表 | 行数 | 说明 |
|---|---:|---|
| `facts` | 55,218 | 事实层全部记录（含 title/summary/日期/层级/省市县/国家/经纬度/来源链接/来源类型/坐标含义/是否上地图） |
| `objects` | 5,189 | 关联层本体对象（域/类型/经纬度/来源/关联度） |
| `relations` | 4,096 | 关联层关系（两端本体、类型、置信度、支撑事实） |
| `meta` | — | 构建版本与导出时间 |

审计视图（Datasette 里直接点开，或自己写 SQL）：
`v_coverage_by_country`（每国记录数/独立点位数/来源覆盖率）、`v_thin_countries`（点位 <20 的国家）、
`v_facts_by_origin`（每类来源多少条）、`v_facts_by_province`（各省条数）、`v_fact_sources`（全部来源 URL）、
`v_suspect_rows`（缺来源/缺坐标/缺日期/标题重复）、`v_coordinate_reuse`（同一坐标堆了多少条）、
`v_localization_precision`（坐标精度自述）、`v_objects_by_country`、`v_relations_by_type`。

## 数据怎么生成（可复现）

```bash
# 1) 从已构建页面里导出两层真实数据（用的是页面自己的 V03Data/V03Filter）
node test/dump-db.mjs ~/agrilink-db/dump.json
# 2) 归一国家码（数据里混用 ISO2/ISO3）、建表建视图
python3 tools/db/load_db.py ~/agrilink-db/dump.json
# 3) 起服务 / 停服务 / 看状态
~/agrilink-db/serve.sh start|stop|status
```

访问：http://127.0.0.1:8100/ ・ 日志 `~/agrilink-db/datasette.log` ・ PID 文件 `datasette.pid`。进程由 `nohup` 拉起，独立于任务运行；本机没有进程守护，长期存活属尽力而为。

## 首次核查发现的问题（都可查询）

1. `data_origin='generated'` 的 **844 条事实没有来源链接**——最早那批演示基线记录（非公开来源），需要决定保留或清除；
2. **3,534 条设施目录记录**在库里但按此前指示**不上地图**（`map_eligible=0`），可查可核对；
3. 国家码此前**混用 ISO2/ISO3**（`CN` 与 `CHN` 并存），已归一为 `country_iso3` 并对齐国家名；
4. **289 个国家/地区**的独立点位 <20（58 个 ≥20），其中 WFP 未覆盖的国家（美国/智利/马来西亚/巴西/日本/加拿大/欧盟）记录虽有 130–170 条，但点位只有 9–19 个；
5. **1,310 条标题重复**、9 条缺坐标；
6. 中国各省中心坐标上各堆了 **800–1,400 条**记录——这就是"一个国家/省只有一个点"的量化形态。
