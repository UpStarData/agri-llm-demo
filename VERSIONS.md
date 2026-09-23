# 版本一览（单仓库 · 按版本分目录）

所有版本都在**这一个仓库**里，按目录分开；每个版本一个固定地址，旧版本长期保留。

| 版本 | 预览地址 | 内容 | 构建指纹 | 源码提交 / tag |
| --- | --- | --- | --- | --- |
| **V0.8.3** | https://upstardata.github.io/agri-llm-demo/v0.8.3/ | 修复地图更新动画与事实点不同步；实际地图图形对点位逐帧回归 | `635be6b8ea29` | `32cf33e` · `v0.8.3` |
| **V0.8.2** | https://upstardata.github.io/agri-llm-demo/v0.8.2/ | 地图连续交互实测修复：国界外事实点清零、拖动缩放卡顿降低 | `2768363179f7` | `61c82f6` · `v0.8.2` |
| V0.8.1 | https://upstardata.github.io/agri-llm-demo/v0.8.1/ | 地图锚定补丁：新事实瞬时闪点迁入 `geo`，五类事实图层拖动缩放实测零漂移 | `cb2166ad01b7` | `ef5e5a8` · `v0.8.1` |
| V0.8 | https://upstardata.github.io/agri-llm-demo/v0.8/ | HungerMap 日夜主题（默认夜间）、3D 自转地球 + 视差星空、事实点与地图同层锚定、不规则数据概览 | `4bbc94fe4f2a` | `8e5334f` · `v0.8.0` |
| V0.7 | https://upstardata.github.io/agri-llm-demo/v0.7/ | 数据概览主数字改为实时大数字（全位数千分位 / 等宽数字 / 尾数持续递增） | `680e567a1986` | `b28b433` · `v0.7.0` |
| V0.6.2 | https://upstardata.github.io/agri-llm-demo/v0.6.2/ | 密度效果修复：2 万 / 1.6 万 / 1.2 万地图坐标点，世界与中国边界校验，拖动缩放同投影 | `18d6785b9c0c` | `b7129b3` · `v0.6.2` |
| V0.6.1 | https://upstardata.github.io/agri-llm-demo/v0.6.1/ | 第三轮补充指令：概览 + 翻牌、终端 3 行、直播卡、全屏地图 + 浮层、中性点 + 水波纹、毛玻璃 | `c01d17c112d4` | `4250f26` · `v0.6.1` |
| V0.6 | https://upstardata.github.io/agri-llm-demo/v0.6/ | 体量口径 + 实时滚动计数、地图缩放三项规则、铺满整屏 + 浮层、毛玻璃、统一中性点、直播卡常驻 | `60dd9ba775e5` | `e6c236a` · `v0.6.0` |
| V0.5 | https://upstardata.github.io/agri-llm-demo/v0.5/ | 浅色视觉校准 + 第二轮反馈（MiroFish 连线 / 纯黑终端 / 真实直播 / 左下两排快捷键） | `c44a4783ed88` | `13ed739` · `v0.5.0` |
| V0.4 | https://upstardata.github.io/agri-llm-demo/v0.4/ | 暗色重设计版（**已否决**，仅留档） | `013d9c717e3d` | `57e6582` · `v0.4.0` |
| **V0.0**（起点） | https://upstardata.github.io/agri-llm-demo/v0.0/ | 原版基线（三层 Demo 起始版）—— 迭代起点，与仓库根地址同一份文件 | `7710f0006c28` | `72e78d1` · `v0.0.0` |

> 版本号规则：**V0.0 是原版基线**，之后每次发版在最新版本上加一个号（当前 **V0.8.3**），旧版本地址长期保留。仓库根地址 `https://upstardata.github.io/agri-llm-demo/` 显示的就是 V0.0。

版本目录页：**https://upstardata.github.io/agri-llm-demo/versions/**

## 目录约定

```
agri-llm-demo/
├── index.html          # V0.0 原版基线（Pages 根，内容与 v0.0/ 同一份）
├── versions/index.html # 版本目录页
├── v0.0/ … v0.8.3/     # 每个版本：index.html + build-meta.json（V0.0 = 起点）
└── src/ data/ test/ …  # 源码（与版本产物同仓库）
```

## 版本号规则

- **V0.0**：原版基线（仓库根地址显示的那一版），作为迭代起点；
- 以后每次发版在最新版本上加一个号（V0.1 / V0.8 / V1.0 …），旧版本目录与地址都保留；
- 每个版本对应一个 git tag（`v0.0.0` `v0.4.0` … `v0.8.3`），拿到那一版的源码。

## 新增版本（不再新建仓库）

1. 在源码分支构建：`node build.mjs && node test/v03.mjs`（全绿）；
2. 新建目录 `vX.Y/`，放入 `index.html` 与 `build-meta.json`；
3. 更新本文件与 `versions/index.html`（新增一行）；
4. 在源码提交上打 tag（`vX.Y.0`）并推送；
5. 实测 `https://upstardata.github.io/agri-llm-demo/vX.Y/` 的指纹与功能后再对外给地址。

## 回滚

某个版本有问题时，直接给上一个版本的地址即可；需要下线时删除对应目录并更新本文件（旧地址会 404），或保留目录只从版本目录页移除链接。
