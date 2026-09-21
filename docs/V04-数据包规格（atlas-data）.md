# V0.4 数据包规格 —— `src/v03/atlas-data.js`

本文件是页面重构（LLM-291）的数据侧规格。执行者只允许**新建** `src/v03/atlas-data.js`，
不得修改仓库内任何其它文件（不改 `src/v03/data.js`、不改 `index.html`、不跑构建）。

## 0. 交付物

一个浏览器可直接 `<script>` 加载的文件 `src/v03/atlas-data.js`，形如：

```js
/* V0.4 数据包：产区 / 港口机场 / 密集事实与本体（真实地理位置 + 补齐数据） */
window.V03Atlas = (function () {
  const REGIONS = [ /* 产区 */ ];
  const GATES = [ /* 港口 / 机场 */ ];
  const PACK = { facts: [], objects: [], relations: [] };
  return { REGIONS, GATES, PACK };
})();
```

必须满足：`global.window={}` 后在 node 中 `eval` 可执行（纯 ES5/ES2015 语法均可，但**不要**用 `import/export`、不要用 `await`）。

## 1. 硬性约束

1. **不出现「示意 / 示例 / 样例 / 待标定 / 模拟数据」等字样**（页面禁止出现这类提示）。
   文案必须以真实口吻呈现（如「到货台账」「海关统计」「产区测产」）。
2. **坐标必须真实**：全部 `lat/lng` 使用真实地理位置的经纬度（误差 ≤ 0.3°）。
   `lat` ∈ [-56, 72]，`lng` ∈ [-180, 180]。
3. 全部内容为**简体中文**文案（`lat`/`lng` 数字除外）。
4. 数据必须**确定性**（可硬编码或固定种子 PRNG），不得在运行期随机。
5. ID 唯一：`F-PK-###`（事实）、`O-PK-###`（本体）、`R-PK-###`（关系）、产区 `RG-###`、门户 `GT-###`。
6. 引用完整性：`PACK.objects` 里每个 id 唯一；`PACK.facts[].objects` / `[].relations`、
   `PACK.relations[].from/to/factIds` 只能引用 **PACK 内部** 的 id（不许引用 `data.js` 里的 `O-MKT-HX` 等）。

## 2. REGIONS —— 产区（≥ 36 条）

```js
{ id:'RG-001', name:'洞庭湖平原水稻区', emoji:'🌾', kind:'grain', variety:'水稻',
  lat:29.0, lng:112.5, country:'中国', region:'湖南 · 常德', scale:'常年种植面积 1,180 万亩', prov:'public' }
```

- `kind` 取值：`grain` | `fruit` | `vegetable` | `sugar` | `oilseed` | `livestock` | `aquatic` | `spice`
- `variety`：品种中文名（水稻 / 小麦 / 玉米 / 大豆 / 甘蔗 / 甜菜 / 柑橘 / 苹果 / 车厘子 / 榴莲 / 山竹 / 蔬菜 / 肉牛 / 生猪 / 水产 / 咖啡 / 可可 / 天然橡胶 / 棕榈油 …）
- `prov`：`'public'`（可公开查证的真实产区）或 `'synthesized'`（补齐的产区）——**两地都要有**
- 覆盖分布要求：
  - 中国：≥ 14 条，其中湖南 ≥ 3 条（洞庭湖平原、湘南柑橘、湘西猕猴桃/蔬菜）
  - 东南亚：马来西亚（彭亨劳勿榴莲、柔佛、沙巴）、泰国（尖竹汶榴莲、东北茉莉香米）、越南（湄公河三角洲）、印尼（苏门答腊棕榈油）、菲律宾（香蕉/椰子）
  - 南美：巴西（马托格罗索大豆、圣保罗甘蔗、巴拉那咖啡）、智利（中部山谷车厘子、奥希金斯）、阿根廷（潘帕斯）、秘鲁（蓝莓/牛油果）
  - 北美：美国（加州中央谷地、中西部玉米带、佛罗里达柑橘）、墨西哥（牛油果/龙舌兰）
  - 南亚：印度（旁遮普小麦、马哈拉施特拉甘蔗、古吉拉特棉花）、巴基斯坦
  - 大洋洲：澳大利亚（昆士兰甘蔗、西澳小麦带、新南威尔士棉区）、新西兰（怀卡托乳业）
  - 非洲：南非（西开普柑橘/葡萄）、埃及（尼罗河三角洲）、肯尼亚（茶叶/鲜花）、埃塞俄比亚（咖啡）
  - 欧洲：荷兰（温室蔬菜）、法国（巴黎盆地小麦）、西班牙（阿尔梅里亚蔬菜）、乌克兰（黑土小麦）
- 名称、级别（`region` 用「省 · 市」格式）、`scale` 用真实口径的描述性短语。

## 3. GATES —— 港口 / 机场（≥ 40 条，港口 ≥ 24 + 机场 ≥ 16）

```js
{ id:'GT-001', name:'上海港·洋山深水港区', kind:'port', emoji:'⚓',
  lat:30.62, lng:122.06, country:'中国', region:'上海', cargo:'集装箱 · 冷链生鲜', note:'全球最大集装箱港区之一', prov:'public' }
```

- `kind`: `port` | `airport`；`emoji`: 港口用 `⚓`，机场用 `✈️`
- 覆盖：中国主要港口（上海洋山、宁波舟山、深圳盐田、广州南沙、青岛、天津、厦门、大连、香港葵涌、高雄）与国际枢纽港（新加坡、巴生、林查班、圣安东尼奥、瓦尔帕莱索、桑托斯、巴拉那瓜、罗萨里奥、鹿特丹、安特卫普、洛杉矶、长滩、纽约新泽西、奥克兰、那瓦舍瓦、钦奈、弗里曼特尔、墨尔本、德班、开普敦、塞得港、杰贝阿里、釜山、东京、胡志明市·盖梅、钱凯）
- 机场：长沙黄花、上海浦东、广州白云、北京首都、深圳宝安、郑州新郑、香港国际、吉隆坡国际、曼谷素万那普、新加坡樟宜、胡志明市新山一、圣地亚哥·梅里诺、圣保罗瓜鲁柳斯、迈阿密、洛杉矶国际、迪拜国际、巴黎戴高乐、法兰克福、约翰内斯堡 OR Tambo、孟买、悉尼、东京成田、首尔仁川
- `cargo`：真实品类描述；`note`：一句真实定位描述。

## 4. PACK.objects —— 本体对象（≥ 60 条）

```js
{ id:'O-PK-001', domain:'base', name:'洞庭湖平原水稻产区', sub:'湖南 · 常年种植 1,180 万亩',
  lat:29.0, lng:112.5, geo:true, prov:'synthesized',
  props:[['产量','约 620 万吨/年'],['主供','粤港澳 · 长三角']] }
```

- `domain` 九类取值（必须与 `src/v03/data.js` 的 `DOMAINS` 一致）：
  `market` | `company` | `base` | `variety` | `agency` | `region` | `person` | `metric` | `facility`
- `geo:false` 的必须是抽象对象（`variety` / `agency` / `person` / `metric`），且**不要**写 `lat`/`lng`
- 九类都要有；`geo:false` 至少 12 条
- 每个 `REGIONS` 至少对应一个 `base` 或 `region` 对象；每个 `GATES` 对应一个 `facility` 对象
- `props` 2–3 组 `[键, 值]`

## 5. PACK.facts —— 事实（≥ 120 条）

严格沿用 `src/v03/data.js` 的事实 schema，并**额外**补两个字段：

```js
{ id:'F-PK-001', cat:'trade', date:'2026-09-12', level:'global', region:'巴西 · 马托格罗索',
  short:'巴西大豆', lat:-12.6, lng:-55.4, cred:'high', impact:'high', radius:300,
  media:'image', mediaNote:'装运台账 3 张', prov:'synthesized',
  title:'马托格罗索大豆对华发运 6.2 万吨，环比 +9%',
  summary:'…（2 句以内，真实口吻）',
  evidence:[{ t:'出口商发运台账', k:'台账', q:'对华发运 6.2 万吨，环比 +9.1%。' }],
  objects:['O-PK-001'], relations:['R-PK-001'],
  /* cat 为 price 时必填： */
  series:[3120,3150,3110,3180,3240,3210,3290], delta:'+5.4%' }
```

字段规则：
- `cat` ∈ `policy|price|weather|logistics|trade`，五类都要有，单类占比不超过 45%
- `level` ∈ `global|china|province`；**数量分布要求**：
  - `global` ≥ 55 条，且经纬度要**铺满全球**（南美 ≥ 10、东南亚 ≥ 8、北美 ≥ 6、南亚 ≥ 5、大洋洲 ≥ 4、非洲 ≥ 4、欧洲 ≥ 4、东亚其它 ≥ 4）——
    页面要求「全球视角下整个屏幕都应有数据分布」。
  - `china` ≥ 25 条：覆盖 ≥ 12 个省级行政区，`region` 用「省」或「省 · 市」
  - `province` ≥ 35 条：湖南 ≥ 12 条（长沙 / 常德 / 怀化 / 岳阳 / 郴州 / 永州 / 益阳 / 株洲），其余覆盖山东、四川、广东、广西、云南、河南、江苏、浙江、湖北、安徽、江西、福建、海南、陕西、辽宁、新疆
- `date` ∈ `['2026-06-20', '2026-09-20']`，且**近 7 天（2026-09-14 ~ 09-20）≥ 35 条**、近 30 天 ≥ 80 条（页面默认 7 天）
- `cred` ∈ `high|mid|low`，`impact` ∈ `high|mid|low`，`radius` 60–420 的整数
- `media` ∈ `image|video|live|text`，四类都要有（`video` ≥ 6、`live` ≥ 5）
- `mediaNote`：真实口吻素材描述，如「冷库到货台账 4 张」「央视财经 · 产区走访 2:14」
- `title` ≤ 34 字；`summary` ≤ 60 字；`evidence` 1–2 条，`k` ∈ `台账|统计|公告|政策|通告|协会|市场|平台|测产|口径|直播|周报|说明|公告|通报`
- `objects` 引用 `PACK.objects` 里的 id（1–4 个，必须包含该坐标处的本体）；`relations` 引用 `PACK.relations` 的 id

## 6. PACK.relations —— 关系（≥ 80 条）

```js
{ id:'R-PK-001', from:'O-PK-001', to:'O-PK-002', type:'供应流向', strength:0.82, confidence:0.78,
  formed:'2026-03', changedBy:'F-PK-001', factIds:['F-PK-001'],
  note:'产区经口岸到一级市场的稳定流向。' }
```

- `type` 至少覆盖 8 种且每种 ≥ 6 条：`产区供给|供应流向|经营主体主营|政策影响|指标度量|通道衔接|基地—品种|区域归属|加工转化|贸易通道`
- `strength` / `confidence` ∈ [0.4, 0.96]，**置信度 < 0.6 的占比 15%~30%**（页面「待观察」分支需要真实样本）
- `formed` 用 `YYYY-MM`；`changedBy` 必须是存在的 PACK fact id；`factIds` 1–3 个
- 关系图必须**连通**：不允许出现孤立对象——每个 `PACK.objects` 至少出现在一条关系里
- 每条关系 `from`/`to` 不能相同

## 7. 交付前自检（必须执行并在回复里贴出结果）

用 node 跑下面这段（把路径换成实际值）：

```bash
node -e "
global.window={}; const fs=require('fs');
eval(fs.readFileSync('src/v03/atlas-data.js','utf8'));
const A=window.V03Atlas, P=A.PACK;
const ids=a=>new Set(a.map(x=>x.id));
const o=ids(P.objects), f=ids(P.facts);
const bad=[];
P.facts.forEach(x=>{ if(!x.title||!x.summary||!x.lat||!x.lng) bad.push('fact '+x.id);
  (x.objects||[]).forEach(i=>{ if(!o.has(i)) bad.push('fact->obj '+x.id+' '+i) });
  (x.relations||[]).forEach(i=>{ if(!P.relations.some(r=>r.id===i)) bad.push('fact->rel '+x.id+' '+i) }) });
P.relations.forEach(r=>{ if(!o.has(r.from)||!o.has(r.to)) bad.push('rel node '+r.id);
  if(!f.has(r.changedBy)) bad.push('rel changedBy '+r.id);
  (r.factIds||[]).forEach(i=>{ if(!f.has(i)) bad.push('rel->fact '+r.id) }) });
const iso=new Set(); P.objects.forEach(x=>iso.add(x.id));
const deg={}; P.relations.forEach(r=>{deg[r.from]=1;deg[r.to]=1});
const lonely=[...iso].filter(i=>!deg[i]);
const by=(a,k)=>{const m={};a.forEach(x=>m[x[k]]=(m[x[k]]||0)+1);return m};
console.log('REGIONS',A.REGIONS.length,'GATES',A.GATES.length,'objects',P.objects.length,'facts',P.facts.length,'relations',P.relations.length);
console.log('fact.cat',by(P.facts,'cat'),'fact.level',by(P.facts,'level'),'fact.media',by(P.facts,'media'));
console.log('cred',by(P.facts,'cred'),'impact',by(P.facts,'impact'),'rel.type',by(P.relations,'type'));
console.log('geo:false objects',P.objects.filter(x=>x.geo===false).length);
console.log('近7天',P.facts.filter(x=>x.date>='2026-09-14').length,'近30天',P.facts.filter(x=>x.date>='2026-08-22').length);
console.log('bad refs',bad.length,bad.slice(0,8),'孤立对象',lonely.length,lonely.slice(0,8));
const lat=P.facts.concat(A.REGIONS,A.GATES); console.log('坐标越界',lat.filter(x=>!(x.lat>=-56&&x.lat<=72&&x.lng>=-180&&x.lng<=180)).length);
console.log('违禁词',JSON.stringify(fs.readFileSync('src/v03/atlas-data.js','utf8')).match(/示意|示例|样例|待标定/g));
"
```

自检必须全部为 0 违规（`bad refs 0`、`孤立对象 0`、`坐标越界 0`、`违禁词 null`）。
