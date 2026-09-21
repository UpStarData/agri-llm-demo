# 公网发布版本核验记录（AgriLink V1.0）

- 发布地址：`https://upstardata.github.io/agri-llm-demo-v04/`
- 期望构建指纹：`hash=013d9c717e3d git=57e6582`
- 结果：**16/16 通过** · 加载 3843 ms
- 控制台错误：0 · 未捕获异常：0 · 非本站请求：0

| 项目 | 结果 | 明细 |
| --- | --- | --- |
| 构建指纹与验收提交一致（hash / git / partial） | ✅ 通过 | {"hash":"013d9c717e3d","git":"57e6582","builtAt":"2026-09-21T22:37:54.142Z","partial":false} |
| 数据包指纹：861 事实 / 377 本体 / 585 关系 | ✅ 通过 | {"facts":861,"objects":377,"relations":585} |
| 地理数据：64 产区 / 56 港口 / 49 机场 / 4 节点 / 1135 时序事件 | ✅ 通过 | {"regions":64,"ports":56,"airports":49,"nodes":4,"streamEvents":1135} |
| 默认口径：近 7 天 + 高可信 + 高影响 | ✅ 通过 | {"time":"7d","cred":"high","infl":"high"} |
| 默认口径全球星点多区域覆盖（点数 / 地理分组 / 四象限） | ✅ 通过 | {"facts":77,"points":77,"regions":23,"west":true,"east":true,"south":true,"north":true,"cards":77,"cardTypes":{"price":42,"weather":18,"news":17}} |
| 事实层卡片按六类 cardType 渲染（默认视野内非空） | ✅ 通过 | {"price":42,"weather":18,"news":17} |
| 切「全部」恢复 342 点完整密度 | ✅ 通过 | {"facts":342,"points":339} |
| 关联层：377 本体节点 / 585 关系 / 流动线 / 非地理本体面板 | ✅ 通过 | {"nodes":377,"mapped":271,"edges":585,"lines":353,"unmapped":106,"rows":585} |
| 非地理本体面板含 Person 类型 | ✅ 通过 | {"cards":12,"person":true} |
| 页面骨架完整（三 TAB / 11 快捷键 / 流水 / 卡片） | ✅ 通过 | {"tabs":3,"streamLines":22,"mapSk":11,"cards":77} |
| 控制台无错误、无未捕获异常 | ✅ 通过 | {"consoleErrors":[],"pageErrors":[]} |
| 无横向溢出（1440×900） | ✅ 通过 |  |
| 390px 无横向溢出 | ✅ 通过 |  |
| 390px 图层菜单滑出且不超出视口 | ✅ 通过 |  |
| 390px 关联层可用且无溢出 | ✅ 通过 |  |
| 390px 控制台无错误 | ✅ 通过 |  |
