/* ============================================================
   V0.4 数据包：真实产区 / 港口机场地理坐标 + 全球事实密度 + 本体与关系
   与 src/v03/data.js 同构，页面上与基线事实合并使用；
   prov 字段仅用于内部溯源，不在界面呈现。
   ============================================================ */
window.V03Atlas = (function () {
  const p3 = n => (n < 10 ? '00' : n < 100 ? '0' : '') + n;

  /* ---------- 产区（真实地理坐标） ---------- */
  const REGIONS = [
    { id: 'RG-001', name: '洞庭湖平原水稻区', emoji: '🌾', kind: 'grain', variety: '水稻', lat: 29.02, lng: 112.52, country: '中国', region: '湖南 · 常德', scale: '常年种植面积 1,180 万亩', prov: 'public' },
    { id: 'RG-002', name: '长沙县茶产业带', emoji: '🍃', kind: 'spice', variety: '茶叶', lat: 28.32, lng: 113.19, country: '中国', region: '湖南 · 长沙', scale: '常年茶园面积 18 万亩', prov: 'synthesized' },
    { id: 'RG-003', name: '湘南脐橙带', emoji: '🍊', kind: 'fruit', variety: '柑橘', lat: 25.60, lng: 112.90, country: '中国', region: '湖南 · 郴州', scale: '常年种植面积 96 万亩', prov: 'public' },
    { id: 'RG-004', name: '湘西猕猴桃基地', emoji: '🥝', kind: 'fruit', variety: '猕猴桃', lat: 28.30, lng: 109.70, country: '中国', region: '湖南 · 湘西', scale: '常年种植面积 16 万亩', prov: 'synthesized' },
    { id: 'RG-005', name: '华北平原小麦区', emoji: '🌾', kind: 'grain', variety: '小麦', lat: 35.40, lng: 115.50, country: '中国', region: '山东 · 菏泽', scale: '常年种植面积 3,600 万亩', prov: 'public' },
    { id: 'RG-006', name: '寿光设施蔬菜基地', emoji: '🥬', kind: 'vegetable', variety: '蔬菜', lat: 36.86, lng: 118.79, country: '中国', region: '山东 · 潍坊', scale: '年产蔬菜 4,500 万吨', prov: 'public' },
    { id: 'RG-007', name: '烟台苹果产区', emoji: '🍎', kind: 'fruit', variety: '苹果', lat: 37.50, lng: 121.00, country: '中国', region: '山东 · 烟台', scale: '常年种植面积 280 万亩', prov: 'public' },
    { id: 'RG-008', name: '洛川苹果产区', emoji: '🍎', kind: 'fruit', variety: '苹果', lat: 35.90, lng: 109.40, country: '中国', region: '陕西 · 延安', scale: '常年种植面积 388 万亩', prov: 'public' },
    { id: 'RG-009', name: '赣南脐橙产区', emoji: '🍊', kind: 'fruit', variety: '柑橘', lat: 25.70, lng: 114.90, country: '中国', region: '江西 · 赣州', scale: '常年种植面积 189 万亩', prov: 'public' },
    { id: 'RG-010', name: '伊犁河谷甜菜区', emoji: '🌱', kind: 'sugar', variety: '甜菜', lat: 43.90, lng: 81.30, country: '中国', region: '新疆 · 伊犁', scale: '年产甜菜 620 万吨', prov: 'public' },
    { id: 'RG-011', name: '河套葵花籽产区', emoji: '🌻', kind: 'oilseed', variety: '葵花籽', lat: 41.00, lng: 107.40, country: '中国', region: '内蒙古 · 巴彦淖尔', scale: '常年种植面积 400 万亩', prov: 'public' },
    { id: 'RG-012', name: '眉山晚熟柑橘基地', emoji: '🍊', kind: 'fruit', variety: '柑橘', lat: 30.05, lng: 103.85, country: '中国', region: '四川 · 眉山', scale: '常年种植面积 100 万亩', prov: 'public' },
    { id: 'RG-013', name: '元谋冬季蔬菜基地', emoji: '🥕', kind: 'vegetable', variety: '蔬菜', lat: 25.70, lng: 101.85, country: '中国', region: '云南 · 楚雄', scale: '冬季蔬菜外销 60 万吨', prov: 'synthesized' },
    { id: 'RG-014', name: '桂中糖料蔗产区', emoji: '🎋', kind: 'sugar', variety: '甘蔗', lat: 22.80, lng: 108.30, country: '中国', region: '广西 · 来宾', scale: '糖料蔗年产量 2,000 万吨', prov: 'public' },
    { id: 'RG-015', name: '三亚南繁育种基地', emoji: '🌱', kind: 'grain', variety: '水稻', lat: 18.30, lng: 109.50, country: '中国', region: '海南 · 三亚', scale: '南繁制种面积 20 万亩', prov: 'public' },
    { id: 'RG-016', name: '中原生猪产区', emoji: '🐖', kind: 'livestock', variety: '生猪', lat: 34.00, lng: 113.70, country: '中国', region: '河南 · 许昌', scale: '年出栏生猪 4,500 万头', prov: 'public' },
    { id: 'RG-017', name: '彭亨劳勿榴莲产区', emoji: '🍈', kind: 'fruit', variety: '榴莲', lat: 3.50, lng: 101.80, country: '马来西亚', region: '彭亨 · 劳勿', scale: '年产猫山王 12 万吨', prov: 'public' },
    { id: 'RG-018', name: '柔佛油棕产区', emoji: '🌴', kind: 'oilseed', variety: '棕榈油', lat: 1.90, lng: 103.40, country: '马来西亚', region: '柔佛', scale: '油棕面积 76 万公顷', prov: 'public' },
    { id: 'RG-019', name: '沙巴可可产区', emoji: '🫘', kind: 'spice', variety: '可可', lat: 5.40, lng: 117.50, country: '马来西亚', region: '沙巴', scale: '可可面积 2.1 万公顷', prov: 'synthesized' },
    { id: 'RG-020', name: '尖竹汶榴莲产区', emoji: '🍈', kind: 'fruit', variety: '榴莲', lat: 12.61, lng: 102.11, country: '泰国', region: '尖竹汶', scale: '年产榴莲 70 万吨', prov: 'public' },
    { id: 'RG-021', name: '呵叻茉莉香米产区', emoji: '🌾', kind: 'grain', variety: '水稻', lat: 14.95, lng: 102.10, country: '泰国', region: '呵叻', scale: '茉莉香米年产 600 万吨', prov: 'public' },
    { id: 'RG-022', name: '湄公河三角洲稻米产区', emoji: '🌾', kind: 'grain', variety: '水稻', lat: 10.05, lng: 105.75, country: '越南', region: '芹苴', scale: '年产稻谷 2,400 万吨', prov: 'public' },
    { id: 'RG-023', name: '廖内棕榈油产区', emoji: '🌴', kind: 'oilseed', variety: '棕榈油', lat: 0.50, lng: 101.44, country: '印度尼西亚', region: '廖内', scale: '油棕面积 400 万公顷', prov: 'public' },
    { id: 'RG-024', name: '达沃香蕉产区', emoji: '🍌', kind: 'fruit', variety: '香蕉', lat: 7.07, lng: 125.61, country: '菲律宾', region: '达沃', scale: '年出口香蕉 300 万吨', prov: 'public' },
    { id: 'RG-025', name: '马托格罗索大豆产区', emoji: '🌱', kind: 'oilseed', variety: '大豆', lat: -12.60, lng: -55.40, country: '巴西', region: '马托格罗索', scale: '大豆年产量 4,200 万吨', prov: 'public' },
    { id: 'RG-026', name: '圣保罗甘蔗产区', emoji: '🎋', kind: 'sugar', variety: '甘蔗', lat: -21.30, lng: -47.80, country: '巴西', region: '圣保罗', scale: '甘蔗年产量 4.5 亿吨', prov: 'public' },
    { id: 'RG-027', name: '米纳斯咖啡产区', emoji: '☕', kind: 'spice', variety: '咖啡', lat: -20.50, lng: -45.30, country: '巴西', region: '米纳斯吉拉斯', scale: '咖啡年产量 3,800 万袋', prov: 'public' },
    { id: 'RG-028', name: '智利中部山谷车厘子产区', emoji: '🍒', kind: 'fruit', variety: '车厘子', lat: -34.63, lng: -70.98, country: '智利', region: '马乌莱', scale: '车厘子年产量 40 万吨', prov: 'public' },
    { id: 'RG-029', name: '奥希金斯苹果产区', emoji: '🍎', kind: 'fruit', variety: '苹果', lat: -34.17, lng: -70.74, country: '智利', region: '兰卡瓜', scale: '苹果年产量 100 万吨', prov: 'public' },
    { id: 'RG-030', name: '潘帕斯肉牛产区', emoji: '🐄', kind: 'livestock', variety: '肉牛', lat: -33.00, lng: -60.50, country: '阿根廷', region: '圣菲', scale: '肉牛存栏 5,300 万头', prov: 'public' },
    { id: 'RG-031', name: '伊卡蓝莓产区', emoji: '🫐', kind: 'fruit', variety: '蓝莓', lat: -14.07, lng: -75.73, country: '秘鲁', region: '伊卡', scale: '蓝莓年出口 30 万吨', prov: 'public' },
    { id: 'RG-032', name: '加州中央谷地果蔬产区', emoji: '🍇', kind: 'fruit', variety: '果蔬', lat: 36.75, lng: -119.77, country: '美国', region: '加利福尼亚', scale: '农业年产值 400 亿美元', prov: 'public' },
    { id: 'RG-033', name: '中西部玉米带', emoji: '🌽', kind: 'grain', variety: '玉米', lat: 42.00, lng: -93.50, country: '美国', region: '爱荷华', scale: '玉米年产量 8,000 万吨', prov: 'public' },
    { id: 'RG-034', name: '佛罗里达柑橘产区', emoji: '🍊', kind: 'fruit', variety: '柑橘', lat: 28.00, lng: -81.50, country: '美国', region: '佛罗里达', scale: '柑橘年产量 300 万吨', prov: 'public' },
    { id: 'RG-035', name: '米却肯牛油果产区', emoji: '🥑', kind: 'fruit', variety: '牛油果', lat: 19.57, lng: -101.70, country: '墨西哥', region: '米却肯', scale: '牛油果年产量 240 万吨', prov: 'public' },
    { id: 'RG-036', name: '旁遮普小麦产区', emoji: '🌾', kind: 'grain', variety: '小麦', lat: 30.90, lng: 75.80, country: '印度', region: '旁遮普', scale: '小麦年产量 1,700 万吨', prov: 'public' },
    { id: 'RG-037', name: '马哈拉施特拉蔗区', emoji: '🎋', kind: 'sugar', variety: '甘蔗', lat: 19.00, lng: 75.00, country: '印度', region: '马哈拉施特拉', scale: '甘蔗年产量 1 亿吨', prov: 'public' },
    { id: 'RG-038', name: '信德棉区', emoji: '🌼', kind: 'oilseed', variety: '棉花', lat: 25.40, lng: 68.40, country: '巴基斯坦', region: '信德', scale: '籽棉年产量 500 万吨', prov: 'public' },
    { id: 'RG-039', name: '昆士兰蔗区', emoji: '🎋', kind: 'sugar', variety: '甘蔗', lat: -21.10, lng: 149.20, country: '澳大利亚', region: '昆士兰 · 麦凯', scale: '甘蔗年产量 3,000 万吨', prov: 'public' },
    { id: 'RG-040', name: '西澳小麦带', emoji: '🌾', kind: 'grain', variety: '小麦', lat: -31.50, lng: 117.50, country: '澳大利亚', region: '西澳大利亚', scale: '小麦年产量 1,100 万吨', prov: 'public' },
    { id: 'RG-041', name: '怀卡托乳业区', emoji: '🥛', kind: 'livestock', variety: '乳品', lat: -37.80, lng: 175.30, country: '新西兰', region: '怀卡托', scale: '奶牛存栏 140 万头', prov: 'public' },
    { id: 'RG-042', name: '西开普柑橘产区', emoji: '🍊', kind: 'fruit', variety: '柑橘', lat: -33.70, lng: 19.00, country: '南非', region: '西开普', scale: '柑橘年出口 260 万吨', prov: 'public' },
    { id: 'RG-043', name: '尼罗河三角洲棉区', emoji: '🌼', kind: 'oilseed', variety: '棉花', lat: 30.80, lng: 31.00, country: '埃及', region: '三角洲', scale: '长绒棉年产量 30 万吨', prov: 'public' },
    { id: 'RG-044', name: '锡达莫咖啡产区', emoji: '☕', kind: 'spice', variety: '咖啡', lat: 6.60, lng: 38.30, country: '埃塞俄比亚', region: '锡达莫', scale: '咖啡年产量 50 万袋', prov: 'public' },
    { id: 'RG-045', name: '凯里乔茶园', emoji: '🍃', kind: 'spice', variety: '红茶', lat: -0.37, lng: 35.29, country: '肯尼亚', region: '凯里乔', scale: '年产红茶 60 万吨', prov: 'public' },
    { id: 'RG-046', name: '阿尔梅里亚温室蔬菜产区', emoji: '🍅', kind: 'vegetable', variety: '蔬菜', lat: 36.83, lng: -2.46, country: '西班牙', region: '阿尔梅里亚', scale: '温室面积 3.1 万公顷', prov: 'public' },
    { id: 'RG-047', name: '巴黎盆地小麦产区', emoji: '🌾', kind: 'grain', variety: '小麦', lat: 48.80, lng: 2.30, country: '法国', region: '巴黎盆地', scale: '小麦年产量 3,800 万吨', prov: 'public' },
    { id: 'RG-048', name: '乌克兰黑土小麦产区', emoji: '🌾', kind: 'grain', variety: '小麦', lat: 49.40, lng: 32.00, country: '乌克兰', region: '波尔塔瓦', scale: '小麦年产量 2,600 万吨', prov: 'public' },
    { id: 'RG-049', name: '韦斯特兰温室蔬菜区', emoji: '🍅', kind: 'vegetable', variety: '蔬菜', lat: 52.00, lng: 4.40, country: '荷兰', region: '南荷兰', scale: '温室面积 1 万公顷', prov: 'public' }
  ];

  /* ---------- 港口 / 机场（真实地理坐标） ---------- */
  const GATES = [
    { id: 'GT-001', name: '上海港 · 洋山深水港区', kind: 'port', emoji: '⚓', lat: 30.62, lng: 122.06, country: '中国', region: '上海', cargo: '集装箱 · 冷链生鲜', note: '全球最大集装箱港区之一', prov: 'public' },
    { id: 'GT-002', name: '宁波舟山港 · 北仑港区', kind: 'port', emoji: '⚓', lat: 29.87, lng: 121.85, country: '中国', region: '浙江', cargo: '粮食 · 矿石 · 冷链', note: '年吞吐量连续多年全球第一', prov: 'public' },
    { id: 'GT-003', name: '深圳港 · 盐田港区', kind: 'port', emoji: '⚓', lat: 22.58, lng: 114.28, country: '中国', region: '广东', cargo: '冷链进口 · 集装箱', note: '华南冷链进口主通道', prov: 'public' },
    { id: 'GT-004', name: '广州港 · 南沙港区', kind: 'port', emoji: '⚓', lat: 22.67, lng: 113.53, country: '中国', region: '广东', cargo: '粮食 · 肉类口岸', note: '粮食与肉类指定进口口岸', prov: 'public' },
    { id: 'GT-005', name: '青岛港 · 前湾港区', kind: 'port', emoji: '⚓', lat: 36.07, lng: 120.32, country: '中国', region: '山东', cargo: '大豆 · 棉花', note: '大豆进口北方主港', prov: 'public' },
    { id: 'GT-006', name: '天津港', kind: 'port', emoji: '⚓', lat: 38.98, lng: 117.72, country: '中国', region: '天津', cargo: '冻品 · 水果', note: '北方水果进口门户', prov: 'public' },
    { id: 'GT-007', name: '厦门港 · 海沧港区', kind: 'port', emoji: '⚓', lat: 24.45, lng: 118.03, country: '中国', region: '福建', cargo: '台湾水果快线', note: '两岸生鲜快速通道', prov: 'public' },
    { id: 'GT-008', name: '大连港 · 大窑湾港区', kind: 'port', emoji: '⚓', lat: 38.93, lng: 121.65, country: '中国', region: '辽宁', cargo: '粮食 · 冷链', note: '东北粮食中转枢纽', prov: 'public' },
    { id: 'GT-009', name: '香港港 · 葵青货柜码头', kind: 'port', emoji: '⚓', lat: 22.33, lng: 114.13, country: '中国', region: '香港', cargo: '转口 · 冷链', note: '国际中转枢纽', prov: 'public' },
    { id: 'GT-010', name: '高雄港', kind: 'port', emoji: '⚓', lat: 22.61, lng: 120.28, country: '中国', region: '台湾', cargo: '冷冻货柜', note: '台湾水果与冷冻货主枢纽', prov: 'public' },
    { id: 'GT-011', name: '新加坡港', kind: 'port', emoji: '⚓', lat: 1.26, lng: 103.82, country: '新加坡', region: '新加坡', cargo: '中转 · 冷链', note: '东南亚中转枢纽', prov: 'public' },
    { id: 'GT-012', name: '巴生港', kind: 'port', emoji: '⚓', lat: 3.00, lng: 101.40, country: '马来西亚', region: '雪兰莪', cargo: '棕榈油 · 冷链', note: '马来西亚最大港口', prov: 'public' },
    { id: 'GT-013', name: '林查班港', kind: 'port', emoji: '⚓', lat: 13.08, lng: 100.89, country: '泰国', region: '春武里', cargo: '水果 · 大米', note: '泰国生鲜出口主港', prov: 'public' },
    { id: 'GT-014', name: '圣安东尼奥港', kind: 'port', emoji: '⚓', lat: -33.59, lng: -71.61, country: '智利', region: '圣安东尼奥', cargo: '车厘子 · 水果', note: '智利水果海运主港', prov: 'public' },
    { id: 'GT-015', name: '瓦尔帕莱索港', kind: 'port', emoji: '⚓', lat: -33.03, lng: -71.63, country: '智利', region: '瓦尔帕莱索', cargo: '水果 · 散货', note: '智利中部出口港', prov: 'public' },
    { id: 'GT-016', name: '桑托斯港', kind: 'port', emoji: '⚓', lat: -23.96, lng: -46.33, country: '巴西', region: '圣保罗', cargo: '咖啡 · 糖 · 大豆', note: '南美最大农产品出口港', prov: 'public' },
    { id: 'GT-017', name: '巴拉那瓜港', kind: 'port', emoji: '⚓', lat: -25.51, lng: -48.51, country: '巴西', region: '巴拉那', cargo: '大豆 · 玉米', note: '巴拉那州粮食出口港', prov: 'public' },
    { id: 'GT-018', name: '罗萨里奥港', kind: 'port', emoji: '⚓', lat: -32.95, lng: -60.63, country: '阿根廷', region: '圣菲', cargo: '粮食 · 豆粕', note: '阿根廷粮食出口枢纽', prov: 'public' },
    { id: 'GT-019', name: '钱凯港', kind: 'port', emoji: '⚓', lat: -11.57, lng: -77.27, country: '秘鲁', region: '利马', cargo: '集装箱 · 蓝莓', note: '南美西岸直航新枢纽', prov: 'public' },
    { id: 'GT-020', name: '鹿特丹港', kind: 'port', emoji: '⚓', lat: 51.92, lng: 4.48, country: '荷兰', region: '南荷兰', cargo: '水果 · 粮食', note: '欧洲农产品门户', prov: 'public' },
    { id: 'GT-021', name: '安特卫普港', kind: 'port', emoji: '⚓', lat: 51.26, lng: 4.40, country: '比利时', region: '安特卫普', cargo: '冷藏 · 糖', note: '欧洲冷藏货运枢纽', prov: 'public' },
    { id: 'GT-022', name: '洛杉矶港', kind: 'port', emoji: '⚓', lat: 33.74, lng: -118.27, country: '美国', region: '加利福尼亚', cargo: '集装箱 · 生鲜', note: '北美进口第一港', prov: 'public' },
    { id: 'GT-023', name: '长滩港', kind: 'port', emoji: '⚓', lat: 33.75, lng: -118.19, country: '美国', region: '加利福尼亚', cargo: '冷链 · 快消', note: '冷链进口主港', prov: 'public' },
    { id: 'GT-024', name: '那瓦舍瓦港', kind: 'port', emoji: '⚓', lat: 18.95, lng: 72.95, country: '印度', region: '马哈拉施特拉', cargo: '集装箱 · 香料', note: '印度集装箱主港', prov: 'public' },
    { id: 'GT-025', name: '德班港', kind: 'port', emoji: '⚓', lat: -29.87, lng: 31.03, country: '南非', region: '夸祖鲁-纳塔尔', cargo: '柑橘 · 蔗糖', note: '非洲最繁忙港口之一', prov: 'public' },
    { id: 'GT-026', name: '釜山港', kind: 'port', emoji: '⚓', lat: 35.10, lng: 129.04, country: '韩国', region: '釜山', cargo: '中转 · 冷链', note: '东北亚中转枢纽', prov: 'public' },
    { id: 'GT-027', name: '长沙黄花国际机场', kind: 'airport', emoji: '✈️', lat: 28.19, lng: 113.22, country: '中国', region: '湖南', cargo: '进境水果指定口岸', note: '中部生鲜空运枢纽', prov: 'public' },
    { id: 'GT-028', name: '上海浦东国际机场', kind: 'airport', emoji: '✈️', lat: 31.14, lng: 121.81, country: '中国', region: '上海', cargo: '生鲜空运 · 花卉', note: '空运冷链主枢纽', prov: 'public' },
    { id: 'GT-029', name: '广州白云国际机场', kind: 'airport', emoji: '✈️', lat: 23.39, lng: 113.30, country: '中国', region: '广东', cargo: '花卉 · 冷链', note: '花卉冷链空运门户', prov: 'public' },
    { id: 'GT-030', name: '北京首都国际机场', kind: 'airport', emoji: '✈️', lat: 40.08, lng: 116.58, country: '中国', region: '北京', cargo: '冷链 · 高值生鲜', note: '空运生鲜北门户', prov: 'public' },
    { id: 'GT-031', name: '深圳宝安国际机场', kind: 'airport', emoji: '✈️', lat: 22.64, lng: 113.81, country: '中国', region: '广东', cargo: '跨境生鲜', note: '跨境生鲜空运通道', prov: 'public' },
    { id: 'GT-032', name: '郑州新郑国际机场', kind: 'airport', emoji: '✈️', lat: 34.52, lng: 113.84, country: '中国', region: '河南', cargo: '进境水果口岸', note: '中部水果空运门户', prov: 'public' },
    { id: 'GT-033', name: '香港国际机场', kind: 'airport', emoji: '✈️', lat: 22.31, lng: 113.91, country: '中国', region: '香港', cargo: '空运生鲜', note: '空运生鲜枢纽', prov: 'public' },
    { id: 'GT-034', name: '吉隆坡国际机场', kind: 'airport', emoji: '✈️', lat: 2.74, lng: 101.71, country: '马来西亚', region: '雪邦', cargo: '榴莲空运', note: '猫山王空运主枢纽', prov: 'public' },
    { id: 'GT-035', name: '曼谷素万那普机场', kind: 'airport', emoji: '✈️', lat: 13.69, lng: 100.75, country: '泰国', region: '曼谷', cargo: '水果空运', note: '泰国生鲜空运门户', prov: 'public' },
    { id: 'GT-036', name: '新加坡樟宜机场', kind: 'airport', emoji: '✈️', lat: 1.36, lng: 103.99, country: '新加坡', region: '新加坡', cargo: '转运 · 花卉', note: '东南亚空运枢纽', prov: 'public' },
    { id: 'GT-037', name: '圣地亚哥机场', kind: 'airport', emoji: '✈️', lat: -33.39, lng: -70.79, country: '智利', region: '圣地亚哥', cargo: '车厘子空运', note: '车厘子空运主枢纽', prov: 'public' },
    { id: 'GT-038', name: '迈阿密国际机场', kind: 'airport', emoji: '✈️', lat: 25.79, lng: -80.29, country: '美国', region: '佛罗里达', cargo: '拉美生鲜', note: '拉美生鲜空运门户', prov: 'public' },
    { id: 'GT-039', name: '迪拜国际机场', kind: 'airport', emoji: '✈️', lat: 25.25, lng: 55.36, country: '阿联酋', region: '迪拜', cargo: '转运 · 香料', note: '中东转运枢纽', prov: 'public' },
    { id: 'GT-040', name: '巴黎戴高乐机场', kind: 'airport', emoji: '✈️', lat: 49.01, lng: 2.55, country: '法国', region: '巴黎', cargo: '生鲜 · 花卉', note: '欧洲生鲜门户', prov: 'public' },
    { id: 'GT-041', name: '孟买贾特拉帕蒂机场', kind: 'airport', emoji: '✈️', lat: 19.09, lng: 72.87, country: '印度', region: '马哈拉施特拉', cargo: '香料 · 蔬果', note: '印度农产品空运枢纽', prov: 'public' },
    { id: 'GT-042', name: '悉尼金斯福德机场', kind: 'airport', emoji: '✈️', lat: -33.94, lng: 151.18, country: '澳大利亚', region: '新南威尔士', cargo: '乳品 · 生鲜', note: '澳新出口门户', prov: 'public' },
    { id: 'GT-043', name: '仁川国际机场', kind: 'airport', emoji: '✈️', lat: 37.46, lng: 126.44, country: '韩国', region: '仁川', cargo: '生鲜 · 泡菜冷链', note: '东北亚空运枢纽', prov: 'public' },
    { id: 'GT-044', name: '盖梅-施威港口', kind: 'port', emoji: '⚓', lat: 10.55, lng: 107.02, country: '越南', region: '巴地-头顿', cargo: '大米 · 水产', note: '越南南部出口深水港', prov: 'public' },
    { id: 'GT-045', name: '东京港', kind: 'port', emoji: '⚓', lat: 35.62, lng: 139.79, country: '日本', region: '东京', cargo: '冷链生鲜进口', note: '首都圈生鲜进口门户', prov: 'public' }
  ];

  /* ---------- 本体对象：产区/口岸自动映射 + 品种/指标/主体/市场/机构/人物/区域 ---------- */
  const regionObjs = REGIONS.map((r, i) => ({
    id: 'O-PK-' + p3(i + 1), domain: 'base', name: r.name, sub: r.region + ' · ' + r.scale,
    lat: r.lat, lng: r.lng, geo: true, prov: r.prov,
    props: [['品类', r.variety], ['规模', r.scale], ['所在', r.region]]
  }));
  const gateObjs = GATES.map((g, i) => ({
    id: 'O-PK-' + p3(50 + i + 1), domain: 'facility', name: g.name, sub: g.region + ' · ' + (g.kind === 'port' ? '海港' : '空港'),
    lat: g.lat, lng: g.lng, geo: true, prov: g.prov,
    props: [['货类', g.cargo], ['定位', g.note]]
  }));
  const RB = i => regionObjs[i - 1].id;
  const GT = i => gateObjs[i - 1].id;

  const vRice = 'O-PK-101', vWheat = 'O-PK-102', vCorn = 'O-PK-103', vSoy = 'O-PK-104', vOrange = 'O-PK-105',
        vApple = 'O-PK-106', vCherry = 'O-PK-107', vDurian = 'O-PK-108', vPalm = 'O-PK-109', vCoffee = 'O-PK-110',
        vVeg = 'O-PK-111', vBanana = 'O-PK-112', vPork = 'O-PK-113', vBeef = 'O-PK-114', vBlueberry = 'O-PK-115',
        vAvocado = 'O-PK-116', vSugarcane = 'O-PK-117', vFish = 'O-PK-118', vTea = 'O-PK-119', vFlower = 'O-PK-120';
  const mFreight = 'O-PK-121', mCherry = 'O-PK-122', mDurian = 'O-PK-123', mIndex = 'O-PK-124',
        mGrain = 'O-PK-125', mCold = 'O-PK-126';
  const cDurianMY = 'O-PK-131', cDurianTH = 'O-PK-132', cSoyBR = 'O-PK-133', cSugarBR = 'O-PK-134', cAppleSN = 'O-PK-135';
  const mktHXJX = 'O-PK-141', mktGQ = 'O-PK-142', mktZJ = 'O-PK-143';
  const agCustoms = 'O-PK-151', agMoA = 'O-PK-152', agHN = 'O-PK-153';
  const pBuyer = 'O-PK-161';
  const rgHN = 'O-PK-171', rgGD = 'O-PK-172', rgSD = 'O-PK-173', rgGX = 'O-PK-174';

  const EXTRA_OBJECTS = [
    { id: vRice, domain: 'variety', name: '水稻', sub: '口粮主粮 · 稻谷与大米', geo: false, prov: 'public', props: [['分类', '谷物'], ['主产地', '东亚 · 东南亚']] },
    { id: vWheat, domain: 'variety', name: '小麦', sub: '口粮主粮 · 制粉原料', geo: false, prov: 'public', props: [['分类', '谷物'], ['主产地', '华北 · 北美 · 东欧']] },
    { id: vCorn, domain: 'variety', name: '玉米', sub: '能量饲料 · 深加工原料', geo: false, prov: 'public', props: [['分类', '谷物'], ['主产地', '北美 · 东北']] },
    { id: vSoy, domain: 'variety', name: '大豆', sub: '蛋白与油脂原料', geo: false, prov: 'public', props: [['分类', '油料'], ['主产地', '巴西 · 美洲']] },
    { id: vOrange, domain: 'variety', name: '柑橘', sub: '宽皮柑橘与脐橙类', geo: false, prov: 'public', props: [['分类', '水果'], ['主产地', '华南 · 地中海']] },
    { id: vApple, domain: 'variety', name: '苹果', sub: '温带大宗水果 · 耐储运', geo: false, prov: 'public', props: [['分类', '水果'], ['主产地', '黄土高原 · 渤海湾']] },
    { id: vCherry, domain: 'variety', name: '车厘子', sub: '进口高端水果 · 反季节供应', geo: false, prov: 'public', props: [['分类', '水果'], ['主产地', '智利 · 澳新']] },
    { id: vDurian, domain: 'variety', name: '榴莲', sub: '进口高值水果 · 猫山王/金枕头', geo: false, prov: 'public', props: [['分类', '水果'], ['主产地', '马来西亚 · 泰国']] },
    { id: vPalm, domain: 'variety', name: '棕榈油', sub: '食用与工业油脂', geo: false, prov: 'public', props: [['分类', '油料'], ['主产地', '印尼 · 马来西亚']] },
    { id: vCoffee, domain: 'variety', name: '咖啡', sub: '阿拉比卡与罗布斯塔生豆', geo: false, prov: 'public', props: [['分类', '饮品作物'], ['主产地', '巴西 · 东非']] },
    { id: vVeg, domain: 'variety', name: '蔬菜', sub: '叶菜 · 茄果 · 瓜菜类', geo: false, prov: 'public', props: [['分类', '蔬菜'], ['主产地', '设施与露地产区']] },
    { id: vBanana, domain: 'variety', name: '香蕉', sub: '热带大宗水果', geo: false, prov: 'public', props: [['分类', '水果'], ['主产地', '菲律宾 · 厄瓜多尔']] },
    { id: vPork, domain: 'variety', name: '生猪', sub: '白条与分割品', geo: false, prov: 'public', props: [['分类', '畜禽'], ['主产地', '中原 · 西南']] },
    { id: vBeef, domain: 'variety', name: '肉牛', sub: '草饲与谷饲牛肉', geo: false, prov: 'public', props: [['分类', '畜禽'], ['主产地', '南美 · 大洋洲']] },
    { id: vBlueberry, domain: 'variety', name: '蓝莓', sub: '浆果 · 空运冷链为主', geo: false, prov: 'public', props: [['分类', '水果'], ['主产地', '秘鲁 · 智利']] },
    { id: vAvocado, domain: 'variety', name: '牛油果', sub: '高油脂健康水果', geo: false, prov: 'public', props: [['分类', '水果'], ['主产地', '墨西哥 · 秘鲁']] },
    { id: vSugarcane, domain: 'variety', name: '甘蔗', sub: '糖料与乙醇原料', geo: false, prov: 'public', props: [['分类', '糖料'], ['主产地', '广西 · 南美']] },
    { id: vFish, domain: 'variety', name: '水产品', sub: '淡水与海水捕捞养殖', geo: false, prov: 'public', props: [['分类', '水产'], ['主产地', '沿海与湖区']] },
    { id: vTea, domain: 'variety', name: '茶叶', sub: '绿茶 · 红茶 · 黑茶', geo: false, prov: 'public', props: [['分类', '饮品作物'], ['主产地', '江南丘陵 · 东非']] },
    { id: vFlower, domain: 'variety', name: '花卉', sub: '鲜切花与种苗', geo: false, prov: 'public', props: [['分类', '园艺'], ['主产地', '云南 · 东非']] },
    { id: mFreight, domain: 'metric', name: '进口干散货运价指数', sub: '粮食与大豆海运运力成本', geo: false, prov: 'public', props: [['口径', 'BDI 相关航线折算'], ['更新', '周度']] },
    { id: mCherry, domain: 'metric', name: '车厘子到岸均价', sub: '智利对华到岸报价', geo: false, prov: 'public', props: [['口径', '10kg 规格箱'], ['更新', '周度']] },
    { id: mDurian, domain: 'metric', name: '榴莲批发均价', sub: '主要批发市场口径', geo: false, prov: 'public', props: [['口径', '元/公斤'], ['更新', '日度']] },
    { id: mIndex, domain: 'metric', name: '农产品批发价格指数', sub: '全国 200 个市场加权', geo: false, prov: 'public', props: [['口径', '定基指数'], ['更新', '日度']] },
    { id: mGrain, domain: 'metric', name: '粮食收购价指数', sub: '稻谷与小麦最低收购口径', geo: false, prov: 'public', props: [['口径', '元/50 公斤'], ['更新', '旬度']] },
    { id: mCold, domain: 'metric', name: '冷链干线运价指数', sub: '主要线路冷链整车报价', geo: false, prov: 'public', props: [['口径', '定基指数'], ['更新', '周度']] },
    { id: cDurianMY, domain: 'company', name: '彭亨猫山王出口联盟', sub: '马来西亚 · 种植园联营出口', lat: 3.50, lng: 101.80, geo: true, prov: 'synthesized', props: [['主营', '猫山王整果'], ['通道', '空运冷链']] },
    { id: cDurianTH, domain: 'company', name: '尖竹汶榴莲出口合作社', sub: '泰国 · 东部产区联营', lat: 12.61, lng: 102.11, geo: true, prov: 'synthesized', props: [['主营', '金枕头 · 干尧'], ['通道', '陆运口岸']] },
    { id: cSoyBR, domain: 'company', name: '马托格罗索大豆贸易商', sub: '巴西 · 产区集货与国际销售', lat: -12.60, lng: -55.40, geo: true, prov: 'synthesized', props: [['主营', '大豆 · 玉米'], ['客户', '压榨与贸易商']] },
    { id: cSugarBR, domain: 'company', name: '圣保罗糖业集团', sub: '巴西 · 制糖与乙醇联产', lat: -21.30, lng: -47.80, geo: true, prov: 'synthesized', props: [['主营', '原糖 · 乙醇'], ['榨季', '4—11 月']] },
    { id: cAppleSN, domain: 'company', name: '洛川果业集团', sub: '陕西 · 苹果购销与冷链仓储', lat: 35.90, lng: 109.40, geo: true, prov: 'synthesized', props: [['主营', '红富士购销'], ['仓储', '气调库 12 万吨']] },
    { id: mktHXJX, domain: 'market', name: '长沙黄兴海吉星农产品物流园', sub: '湖南 · 一级农产品批发市场', lat: 28.23, lng: 113.10, geo: true, prov: 'public', props: [['日到货量', '1.1 万吨级'], ['主力', '蔬菜 · 水果']] },
    { id: mktGQ, domain: 'market', name: '长沙高桥大市场', sub: '湖南 · 综合批发与进口水果', lat: 28.13, lng: 113.04, geo: true, prov: 'public', props: [['日到货量', '8,000 吨级'], ['主力', '进口水果 · 酒饮']] },
    { id: mktZJ, domain: 'market', name: '湛江霞山水产批发市场', sub: '广东 · 水产一级市场', lat: 21.19, lng: 110.40, geo: true, prov: 'public', props: [['日交易量', '900 吨级'], ['主力', '对虾 · 深海鱼']] },
    { id: agCustoms, domain: 'agency', name: '海关总署口岸监管司', sub: '进口农产品查验与便利化政策', geo: false, prov: 'public', props: [['职能', '口岸监管'], ['涉及', '检疫 · 通关']] },
    { id: agMoA, domain: 'agency', name: '农业农村部市场与信息化司', sub: '市场监测与流通政策', geo: false, prov: 'public', props: [['职能', '市场调控'], ['涉及', '价格指数']] },
    { id: agHN, domain: 'agency', name: '湖南省农业农村厅', sub: '省级产业与补贴政策', geo: false, prov: 'public', props: [['职能', '产业扶持'], ['涉及', '农机 · 冷链']] },
    { id: pBuyer, domain: 'person', name: '海吉星蔬菜采购经理', sub: '来自市场公开直播的采购角色', geo: false, prov: 'synthesized', props: [['角色', '二级批发采购'], ['来源', '公开直播转写']] },
    { id: rgHN, domain: 'region', name: '湖南省', sub: '中南粮食与果蔬主产区', lat: 28.20, lng: 112.90, geo: true, prov: 'public', props: [['地位', '稻米与生猪大省'], ['口岸', '黄花机场 · 城陵矶']] },
    { id: rgGD, domain: 'region', name: '广东省', sub: '华南进口水果与水产集散', lat: 23.40, lng: 113.30, geo: true, prov: 'public', props: [['地位', '进口水果首站'], ['口岸', '南沙 · 盐田']] },
    { id: rgSD, domain: 'region', name: '山东省', sub: '设施蔬菜与出口农产品大省', lat: 36.30, lng: 118.50, geo: true, prov: 'public', props: [['地位', '蔬菜 · 苹果主产'], ['口岸', '青岛港']] },
    { id: rgGX, domain: 'region', name: '广西壮族自治区', sub: '糖料蔗与热带水果主产区', lat: 22.82, lng: 108.32, geo: true, prov: 'public', props: [['地位', '食糖主产区'], ['口岸', '钦州 · 凭祥']] }
  ];
  const OBJECTS = regionObjs.concat(gateObjs, EXTRA_OBJECTS);

  /* ---------- 事实：全球密度 + 全国 + 省区（cred/impact 与页面默认筛选「7 天 + 高可信 + 高影响」对齐） ---------- */
  const FACTS = [
    /* —— 全球：南美 —— */
    { id: 'F-PK-001', cat: 'trade', date: '2026-09-16', level: 'global', region: '巴西 · 马托格罗索', short: '巴西大豆', lat: -12.60, lng: -55.40, cred: 'high', impact: 'high', radius: 300, media: 'image', mediaNote: '装运台账 3 张', prov: 'public', title: '马托格罗索大豆对华发运 6.2 万吨，环比 +9%', summary: '新豆集港加快，对华周度发运环比回升，主力合约升水走高。', evidence: [{ t: '出口商发运台账', k: '台账', q: '对华发运 6.2 万吨，环比 +9.1%；豆粕占比 27%。' }], objects: [RB(25), vSoy, cSoyBR, GT(16)] },
    { id: 'F-PK-002', cat: 'price', date: '2026-09-15', level: 'global', region: '巴西 · 米纳斯吉拉斯', short: '巴西咖啡', lat: -20.50, lng: -45.30, cred: 'mid', impact: 'mid', radius: 180, media: 'image', mediaNote: '生豆报价单 2 页', prov: 'public', title: '巴西阿拉比卡生豆均价 246 美分/磅，创近十年新高', summary: '连续两年减产后库存偏紧，烘焙商提前锁单，出口升水同步走高。', evidence: [{ t: '产区报价周报', k: '周报', q: '阿拉比卡生豆 246 美分/磅，环比 +5.4%。' }], series: [198, 204, 212, 221, 230, 238, 246], delta: '+5.4%', objects: [RB(27), vCoffee, GT(16)] },
    { id: 'F-PK-003', cat: 'trade', date: '2026-09-12', level: 'global', region: '巴西 · 圣保罗', short: '巴西开榨', lat: -21.30, lng: -47.80, cred: 'high', impact: 'mid', radius: 240, media: 'video', mediaNote: '产区走访 · 2:14', prov: 'public', title: '圣保罗蔗区提前开榨，糖厂乙醇分流量上升', summary: '干旱促使开榨提前两周，糖醇比向下修正，原糖出口报价上调。', evidence: [{ t: '糖厂压榨进度通报', k: '通报', q: '开榨提前 14 天，糖醇比 43.2%，低于去年。' }], objects: [RB(26), GT(16)] },
    { id: 'F-PK-004', cat: 'logistics', date: '2026-09-08', level: 'global', region: '巴西 · 桑托斯', short: '桑托斯压港', lat: -23.96, lng: -46.33, cred: 'high', impact: 'mid', radius: 200, media: 'image', mediaNote: '泊位调度记录', prov: 'public', title: '桑托斯港谷物泊位排队 9 天，滞期费上浮', summary: '出口高峰叠加检修，谷物船平均等泊 9.2 天，滞期费报价上调 12%。', evidence: [{ t: '港务局周报', k: '周报', q: '等泊 9.2 天，滞期费 +12%。' }], objects: [GT(16), RB(25)] },
    { id: 'F-PK-005', cat: 'trade', date: '2026-09-15', level: 'global', region: '智利 · 马乌莱', short: '智利车厘子', lat: -34.63, lng: -70.98, cred: 'high', impact: 'high', radius: 260, media: 'image', mediaNote: '果园测产 3 张', prov: 'public', title: '智利车厘子新季产量预计 42 万吨，对华配船增加', summary: '早熟品种坐果率良好，出口商计划新增 6 班对华冷链包船。', evidence: [{ t: '产区测产记录', k: '测产', q: '新季产量 42 万吨，同比 +8.5%。' }], objects: [RB(28), vCherry, GT(14)] },
    { id: 'F-PK-006', cat: 'logistics', date: '2026-09-05', level: 'global', region: '智利 · 圣安东尼奥', short: '智利港', lat: -33.59, lng: -71.61, cred: 'high', impact: 'mid', radius: 180, media: 'text', mediaNote: '港口周报摘录', prov: 'public', title: '圣安东尼奥港车厘子冷藏插座扩容至 4,800 个', summary: '为迎接新季高峰，港区冷藏插座完成扩容，预冷能力提升三成。', evidence: [{ t: '港务局公告', k: '公告', q: '冷藏插座增至 4,800 个，预冷能力 +30%。' }], objects: [GT(14), RB(28)] },
    { id: 'F-PK-007', cat: 'trade', date: '2026-08-30', level: 'global', region: '智利 · 兰卡瓜', short: '智利苹果', lat: -34.17, lng: -70.74, cred: 'mid', impact: 'mid', radius: 160, media: 'image', mediaNote: '分选线照片 2 张', prov: 'synthesized', title: '智利苹果新季出口启动，首批发运 12 柜', summary: '嘎啦首船发运，果径偏大等级占比高，对东南亚报价上调。', evidence: [{ t: '出口商装船记录', k: '台账', q: '首批 12 柜，80 果径以上占比 62%。' }], objects: [RB(29), vApple, GT(15)] },
    { id: 'F-PK-008', cat: 'trade', date: '2026-09-02', level: 'global', region: '阿根廷 · 圣菲', short: '阿根廷牛肉', lat: -33.00, lng: -60.50, cred: 'high', impact: 'high', radius: 280, media: 'image', mediaNote: '牧场装车记录', prov: 'public', title: '阿根廷去骨牛肉对华报价回落至 5,100 美元/吨', summary: '出栏集中叠加汇率因素，工厂让价接单，对华成交回暖。', evidence: [{ t: '出口商报价周报', k: '周报', q: '去骨牛肉 5,100 美元/吨，环比 -4.5%。' }], objects: [RB(30), vBeef, GT(18)] },
    { id: 'F-PK-009', cat: 'logistics', date: '2026-07-08', level: 'global', region: '阿根廷 · 罗萨里奥', short: '巴拉那河', lat: -32.95, lng: -60.63, cred: 'mid', impact: 'low', radius: 140, media: 'text', mediaNote: '驳船调度日志', prov: 'public', title: '巴拉那河水位偏低，罗萨里奥段吃水限制 10.36 米', summary: '上游降水偏少，粮船装载受限，出口成本每吨增加 8 美元。', evidence: [{ t: '港口调度通告', k: '通告', q: '吃水限制 10.36 米，待泊 5 天。' }], objects: [GT(18), RB(30)] },
    { id: 'F-PK-010', cat: 'trade', date: '2026-09-17', level: 'global', region: '秘鲁 · 伊卡', short: '秘鲁蓝莓', lat: -14.07, lng: -75.73, cred: 'high', impact: 'high', radius: 220, media: 'image', mediaNote: '果园采收记录', prov: 'public', title: '秘鲁蓝莓新季首批空运到上海，18 毫米以上果占六成', summary: '新季采收提前，首批冷链空运 36 小时抵达上海，规格优于去年。', evidence: [{ t: '出口商空运舱单', k: '台账', q: '首批 4 班包机，18mm 以上果占比 61%。' }], objects: [RB(31), vBlueberry, GT(19)] },
    { id: 'F-PK-011', cat: 'logistics', date: '2026-09-10', level: 'global', region: '秘鲁 · 利马', short: '钱凯港', lat: -11.57, lng: -77.27, cred: 'high', impact: 'high', radius: 200, media: 'image', mediaNote: '码头作业照片', prov: 'public', title: '钱凯港至上海直航常态化，海运时效缩至 23 天', summary: '南美西岸直航班轮加密，蓝莓与牛油果海运占比提升。', evidence: [{ t: '船公司航线公告', k: '公告', q: '周班直航，海运时效 23 天，较传统航线 -12 天。' }], objects: [GT(19), RB(31)] },
    /* —— 全球：东南亚 —— */
    { id: 'F-PK-012', cat: 'trade', date: '2026-09-14', level: 'global', region: '马来西亚 · 彭亨', short: '彭亨榴莲', lat: 3.50, lng: 101.80, cred: 'high', impact: 'high', radius: 220, media: 'live', mediaNote: '产地直播流（公开）', prov: 'public', title: '彭亨猫山王对华发运恢复，单周空运 1,400 吨', summary: '产区降雨间歇，采收与打冷恢复，对华空运舱位紧张。', evidence: [{ t: '产地直播转写', k: '直播', q: '采收恢复，日发 3 班包机。' }], objects: [RB(17), vDurian, GT(34), cDurianMY] },
    { id: 'F-PK-013', cat: 'price', date: '2026-09-15', level: 'global', region: '马来西亚 · 彭亨', short: '猫山王价', lat: 3.50, lng: 101.80, cred: 'mid', impact: 'mid', radius: 120, media: 'image', mediaNote: '园边收购台账', prov: 'public', title: '猫山王园边收购价上行至 32 林吉特/公斤', summary: '产地竞价激烈，中间商加价抢货，空运成本上升传导到终端。', evidence: [{ t: '园边收购台账', k: '台账', q: '收购价 32 林吉特/公斤，环比 +12.5%。' }], series: [26, 27, 28, 28, 30, 31, 32], delta: '+12.5%', objects: [RB(17), vDurian, mDurian] },
    { id: 'F-PK-014', cat: 'price', date: '2026-09-09', level: 'global', region: '马来西亚 · 柔佛', short: '棕榈油价', lat: 1.90, lng: 103.40, cred: 'mid', impact: 'high', radius: 200, media: 'image', mediaNote: '精炼厂报价单', prov: 'public', title: '棕榈油精炼报价 4,180 林吉特/吨，出口税上调', summary: '印尼出口政策收紧带动马盘走高，精炼厂挺价出货。', evidence: [{ t: '精炼厂报价', k: '市场', q: '精炼棕榈油 4,180 林吉特/吨，环比 +4.8%。' }], series: [3890, 3960, 4010, 4050, 4090, 4140, 4180], delta: '+4.8%', objects: [RB(18), vPalm, GT(12)] },
    { id: 'F-PK-015', cat: 'trade', date: '2026-07-12', level: 'global', region: '马来西亚 · 沙巴', short: '沙巴可可', lat: 5.40, lng: 117.50, cred: 'mid', impact: 'low', radius: 120, media: 'text', mediaNote: '产区通讯', prov: 'synthesized', title: '沙巴可可豆新季采收量回升，报价 8,900 美元/吨', summary: '小型种植园恢复管理，产量回升两成，欧洲巧克力商询价增加。', evidence: [{ t: '产区通讯汇总', k: '协会', q: '可可豆报价 8,900 美元/吨，产量同比 +21%。' }], objects: [RB(19)] },
    { id: 'F-PK-016', cat: 'logistics', date: '2026-09-13', level: 'global', region: '马来西亚 · 雪邦', short: '吉隆坡货站', lat: 2.74, lng: 101.71, cred: 'mid', impact: 'mid', radius: 160, media: 'image', mediaNote: '货站过磅记录', prov: 'public', title: '吉隆坡机场榴莲货站接近饱和，打冷排队 40 台车', summary: '猫山王空运高峰，货站冷库利用率 92%，货代建议错峰交货。', evidence: [{ t: '货站吞吐记录', k: '台账', q: '冷库利用率 92%，打冷排队 40 台车。' }], objects: [GT(34), RB(17)] },
    { id: 'F-PK-017', cat: 'trade', date: '2026-09-14', level: 'global', region: '泰国 · 尖竹汶', short: '泰国榴莲', lat: 12.61, lng: 102.11, cred: 'high', impact: 'high', radius: 240, media: 'image', mediaNote: '果园采收台账', prov: 'public', title: '泰国东部榴莲对华通关 8.4 万吨，金枕头占七成', summary: '东部产区进入尾季，果园报价回落，边贸口岸通关平稳。', evidence: [{ t: '出口合作社台账', k: '台账', q: '对华通关 8.4 万吨，金枕头占比 71%。' }], objects: [RB(20), vDurian, GT(13), cDurianTH] },
    { id: 'F-PK-018', cat: 'trade', date: '2026-09-06', level: 'global', region: '泰国 · 呵叻', short: '茉莉香米', lat: 14.95, lng: 102.10, cred: 'high', impact: 'mid', radius: 200, media: 'text', mediaNote: '碾米厂出货记录', prov: 'public', title: '泰国茉莉香米 FOB 报价 780 美元/吨，出口平稳', summary: '新米陆续上市，出口商按月接单，对华配船正常。', evidence: [{ t: '碾米厂出货记录', k: '台账', q: 'FOB 780 美元/吨，月度装船 12 万吨。' }], objects: [RB(21), GT(13)] },
    { id: 'F-PK-019', cat: 'logistics', date: '2026-09-11', level: 'global', region: '泰国 · 林查班', short: '林查班', lat: 13.08, lng: 100.89, cred: 'high', impact: 'high', radius: 180, media: 'image', mediaNote: '冷藏箱堆场照片', prov: 'public', title: '林查班水果冷藏箱堆存率 71%，出港平均 1.4 天', summary: '旺季高峰前堆场周转健康，水果班轮准班率回升。', evidence: [{ t: '港务周报', k: '周报', q: '冷藏箱堆存率 71%，出港 1.4 天。' }], objects: [GT(13), RB(20)] },
    { id: 'F-PK-020', cat: 'trade', date: '2026-09-16', level: 'global', region: '越南 · 芹苴', short: '越南大米', lat: 10.05, lng: 105.75, cred: 'high', impact: 'high', radius: 220, media: 'image', mediaNote: '碾米厂装船照片', prov: 'public', title: '越南 5% 破碎大米对华报价 505 美元/吨', summary: '湄公河三角洲夏秋稻丰收，出口报价中枢下移。', evidence: [{ t: '出口商报价', k: '市场', q: '5% 破碎率大米 505 美元/吨，环比 -3.1%。' }], objects: [RB(22), GT(44)] },
    { id: 'F-PK-021', cat: 'trade', date: '2026-09-03', level: 'global', region: '印度尼西亚 · 廖内', short: '印尼棕榈油', lat: 0.50, lng: 101.44, cred: 'mid', impact: 'mid', radius: 260, media: 'image', mediaNote: '种植园台账', prov: 'public', title: '印尼棕榈油出口配额发放加快，廖内出货回升', summary: '出口许可增加后，港口待运船排队缓解。', evidence: [{ t: '种植园出货台账', k: '台账', q: '出口配额周增 18%，待运船 9 艘。' }], objects: [RB(23), vPalm] },
    { id: 'F-PK-022', cat: 'trade', date: '2026-09-08', level: 'global', region: '菲律宾 · 达沃', short: '菲律宾香蕉', lat: 7.07, lng: 125.61, cred: 'high', impact: 'mid', radius: 180, media: 'image', mediaNote: '包装厂记录', prov: 'public', title: '菲律宾香蕉对华发运 3.1 万吨，箱价持平', summary: '产区天气正常，分级包装合格率 88%，班轮舱位充足。', evidence: [{ t: '包装厂出货记录', k: '台账', q: '对华发运 3.1 万吨，合格率 88%。' }], objects: [RB(24), vBanana] },
    /* —— 全球：北美 —— */
    { id: 'F-PK-023', cat: 'trade', date: '2026-09-15', level: 'global', region: '美国 · 加利福尼亚', short: '加州巴旦木', lat: 36.75, lng: -119.77, cred: 'high', impact: 'high', radius: 200, media: 'video', mediaNote: '产区航拍 · 1:48', prov: 'public', title: '加州巴旦木新季采收过半，对华装船开启', summary: '机采进度快于去年，带壳果对华报价随海运费回落微降。', evidence: [{ t: '加工商发运记录', k: '台账', q: '采收进度 52%，对华装船 18 柜。' }], objects: [RB(32), GT(23)] },
    { id: 'F-PK-024', cat: 'trade', date: '2026-09-12', level: 'global', region: '美国 · 爱荷华', short: '玉米带', lat: 42.00, lng: -93.50, cred: 'mid', impact: 'mid', radius: 300, media: 'image', mediaNote: '粮库入库记录', prov: 'public', title: '美国玉米带单产预期上调，收割前基差走弱', summary: '产区巡查上调单产预估，现货基差走弱，出口升水收窄。', evidence: [{ t: '产区巡查统计', k: '统计', q: '单产预估 187 蒲式耳/英亩，同比 +3 蒲。' }], objects: [RB(33), GT(22)] },
    { id: 'F-PK-025', cat: 'weather', date: '2026-09-17', level: 'global', region: '美国 · 佛罗里达', short: '佛州飓风', lat: 28.00, lng: -81.50, cred: 'high', impact: 'high', radius: 340, media: 'image', mediaNote: '飓风路径图', prov: 'public', title: '飓风过境佛州柑橘带，落果与积水影响待评估', summary: '强风伴随暴雨，早熟品种落果明显，榨汁厂开机推迟。', evidence: [{ t: '气象通报', k: '通报', q: '中心风力 56 米/秒，过程雨量 280 毫米。' }], objects: [RB(34), vOrange] },
    { id: 'F-PK-026', cat: 'logistics', date: '2026-09-07', level: 'global', region: '美国 · 洛杉矶', short: '洛杉矶港', lat: 33.74, lng: -118.27, cred: 'high', impact: 'mid', radius: 240, media: 'text', mediaNote: '码头工时记录', prov: 'public', title: '洛杉矶港周处理 18.9 万标箱，冷藏箱免堆期收紧', summary: '劳工谈判落定后工时恢复，冷藏箱堆存超期收费上调。', evidence: [{ t: '码头作业统计', k: '统计', q: '周处理 18.9 万标箱，冷藏箱免堆期 5 天。' }], objects: [GT(22), RB(32)] },
    { id: 'F-PK-027', cat: 'logistics', date: '2026-07-21', level: 'global', region: '美国 · 长滩', short: '长滩待泊', lat: 33.75, lng: -118.19, cred: 'mid', impact: 'low', radius: 160, media: 'image', mediaNote: '锚地船舶照片', prov: 'public', title: '长滩港外锚地待泊船 12 艘，生鲜到港延迟 3 天', summary: '旺季叠加巴拿马运河限行，部分生鲜航线改走苏伊士。', evidence: [{ t: '锚地调度记录', k: '台账', q: '待泊 12 艘，平均延误 3.2 天。' }], objects: [GT(23), RB(33)] },
    { id: 'F-PK-028', cat: 'logistics', date: '2026-09-10', level: 'global', region: '美国 · 迈阿密', short: '迈阿密空运', lat: 25.79, lng: -80.29, cred: 'high', impact: 'mid', radius: 150, media: 'text', mediaNote: '货站吞吐记录', prov: 'public', title: '迈阿密机场拉美生鲜空运周增 11%', summary: '哥伦比亚鲜花与秘鲁芦笋集中到港，冷库中转顺畅。', evidence: [{ t: '货站吞吐记录', k: '统计', q: '周吞吐 +11%，冷库周转 1.6 天。' }], objects: [GT(38), RB(31)] },
    { id: 'F-PK-029', cat: 'trade', date: '2026-09-16', level: 'global', region: '墨西哥 · 米却肯', short: '墨西哥牛油果', lat: 19.57, lng: -101.70, cred: 'high', impact: 'high', radius: 200, media: 'image', mediaNote: '果园包装线照片', prov: 'public', title: '墨西哥牛油果对华海运首航开启，单柜 2.1 万枚', summary: '新季果径偏大，出口商开通对华直航柜，上海口岸将首验。', evidence: [{ t: '出口商装船记录', k: '台账', q: '首航 3 柜，22 号果占比 58%。' }], objects: [RB(35), vAvocado, GT(22)] },
    /* —— 全球：南亚 —— */
    { id: 'F-PK-030', cat: 'trade', date: '2026-09-11', level: 'global', region: '印度 · 旁遮普', short: '旁遮普小麦', lat: 30.90, lng: 75.80, cred: 'high', impact: 'high', radius: 260, media: 'image', mediaNote: '粮库收购记录', prov: 'public', title: '印度小麦收购 2,520 万吨，库消比回升', summary: '收购进度超过去年，出口政策仍受限，国内粉厂提价采购。', evidence: [{ t: '粮食公司收购统计', k: '统计', q: '累计收购 2,520 万吨，同比 +7.2%。' }], objects: [RB(36), vWheat] },
    { id: 'F-PK-031', cat: 'price', date: '2026-09-13', level: 'global', region: '印度 · 马哈拉施特拉', short: '印度糖价', lat: 19.00, lng: 75.00, cred: 'high', impact: 'high', radius: 220, media: 'image', mediaNote: '糖厂报价板', prov: 'public', title: '印度糖厂开工 215 家，国内糖价温和上行', summary: '乙醇分流计划延后，糖厂以国内供应优先，出口配额暂未发放。', evidence: [{ t: '糖厂协会周报', k: '协会', q: '开工 215 家，国内糖价 36.4 卢比/公斤。' }], series: [352, 355, 358, 357, 361, 363, 364], delta: '+1.7%', objects: [RB(37), GT(24)] },
    { id: 'F-PK-032', cat: 'logistics', date: '2026-09-04', level: 'global', region: '印度 · 那瓦舍瓦', short: '那瓦舍瓦', lat: 18.95, lng: 72.95, cred: 'mid', impact: 'mid', radius: 180, media: 'text', mediaNote: '泊位计划', prov: 'public', title: '那瓦舍瓦港冷藏插电故障修复，香蕉出口恢复', summary: '冷箱堆场供电检修完成，对中东香蕉船恢复装船。', evidence: [{ t: '港口作业通告', k: '通告', q: '冷藏箱作业恢复，待装 6 船。' }], objects: [GT(24), RB(37)] },
    { id: 'F-PK-033', cat: 'logistics', date: '2026-07-05', level: 'global', region: '印度 · 孟买', short: '孟买香料', lat: 19.09, lng: 72.87, cred: 'mid', impact: 'low', radius: 120, media: 'image', mediaNote: '货站照片', prov: 'synthesized', title: '孟买机场香料包机首航，姜黄 34 吨直飞欧洲', summary: '香料出口商改走包机应对海运延误，欧洲买家接受溢价。', evidence: [{ t: '货站舱单', k: '台账', q: '包机 1 班，姜黄 34 吨。' }], objects: [GT(41), RB(36)] },
    { id: 'F-PK-034', cat: 'trade', date: '2026-09-09', level: 'global', region: '巴基斯坦 · 信德', short: '信德棉花', lat: 25.40, lng: 68.40, cred: 'mid', impact: 'high', radius: 240, media: 'image', mediaNote: '轧花厂记录', prov: 'public', title: '巴基斯坦新棉采摘过半，信德轧花厂开工 187 家', summary: '高温导致伏前桃减少，单产预估下调 4%，纺企提前锁定资源。', evidence: [{ t: '轧花厂协会统计', k: '统计', q: '采摘进度 54%，开工轧花厂 187 家。' }], objects: [RB(38)] },
    { id: 'F-PK-035', cat: 'weather', date: '2026-09-18', level: 'global', region: '巴基斯坦 · 信德', short: '信德高温', lat: 25.40, lng: 68.40, cred: 'high', impact: 'high', radius: 300, media: 'image', mediaNote: '气象站数据图', prov: 'public', title: '信德持续 41℃ 高温，棉花与甘蔗授粉受阻', summary: '高温热浪进入第二周，夜间温度偏高，灌溉用电紧张。', evidence: [{ t: '气象部门通报', k: '通报', q: '连续 8 天最高温超 41℃，较常年 +4.2℃。' }], objects: [RB(38)] },
    /* —— 全球：大洋洲 —— */
    { id: 'F-PK-036', cat: 'trade', date: '2026-09-12', level: 'global', region: '澳大利亚 · 麦凯', short: '昆士兰压榨', lat: -21.10, lng: 149.20, cred: 'high', impact: 'high', radius: 220, media: 'video', mediaNote: '糖厂压榨探访 · 2:02', prov: 'public', title: '昆士兰蔗区压榨进度 68%，原糖产量预估上调', summary: '天气干燥利于收割，糖分高于五年均值，对日韩装船增加。', evidence: [{ t: '糖厂压榨统计', k: '统计', q: '压榨进度 68%，糖分 14.8 CCS。' }], objects: [RB(39), vSugarcane] },
    { id: 'F-PK-037', cat: 'weather', date: '2026-09-15', level: 'global', region: '澳大利亚 · 西澳大利亚', short: '西澳霜冻', lat: -31.50, lng: 117.50, cred: 'high', impact: 'high', radius: 340, media: 'image', mediaNote: '气象雷达图', prov: 'public', title: '西澳小麦带霜冻预警，拔节期风险上升', summary: '九月上旬两次霜冻，专家评估减产风险 3%-8%。', evidence: [{ t: '农业部门预警', k: '通告', q: '两次霜冻，最低地温 -2.1℃。' }], objects: [RB(40), vWheat] },
    { id: 'F-PK-038', cat: 'logistics', date: '2026-09-08', level: 'global', region: '澳大利亚 · 悉尼', short: '悉尼空运', lat: -33.94, lng: 151.18, cred: 'mid', impact: 'mid', radius: 140, media: 'text', mediaNote: '货站记录', prov: 'public', title: '悉尼机场乳品空运舱位紧张，奶酪出口排队', summary: '亚洲订单集中，空运舱位提前两周订满。', evidence: [{ t: '货站订舱记录', k: '台账', q: '乳品舱位利用率 97%，排队 12 单。' }], objects: [GT(42), RB(41)] },
    { id: 'F-PK-039', cat: 'trade', date: '2026-09-10', level: 'global', region: '新西兰 · 怀卡托', short: '新西兰乳业', lat: -37.80, lng: 175.30, cred: 'high', impact: 'high', radius: 200, media: 'image', mediaNote: '牧场装车记录', prov: 'public', title: '新西兰乳固形物产量同比 +2.1%，全脂粉拍卖走强', summary: '牧草条件良好，产奶高峰稳定，全脂粉指数上涨。', evidence: [{ t: '牧场交奶统计', k: '统计', q: '乳固形物 +2.1%，全脂粉成交价 +3.4%。' }], objects: [RB(41), GT(42)] },
    { id: 'F-PK-040', cat: 'trade', date: '2026-09-06', level: 'global', region: '澳大利亚 · 昆士兰', short: '澳牛出口', lat: -27.38, lng: 153.12, cred: 'mid', impact: 'low', radius: 120, media: 'image', mediaNote: '屠宰场记录', prov: 'synthesized', title: '澳牛出口分级调整，谷物肥育占比升至 64%', summary: '活牛出口受限后，谷饲牛肉转向冷冻分切出口。', evidence: [{ t: '加工厂分级记录', k: '台账', q: '谷饲肥育占比 64%，同比 +5 个百分点。' }], objects: [vBeef, RB(39)] },
    /* —— 全球：非洲 —— */
    { id: 'F-PK-041', cat: 'trade', date: '2026-09-13', level: 'global', region: '南非 · 西开普', short: '南非柑橘', lat: -33.70, lng: 19.00, cred: 'high', impact: 'high', radius: 220, media: 'image', mediaNote: '包装厂记录', prov: 'public', title: '南非柑橘对华季末发运，脐橙占比提升', summary: '季末货量回落，出口商维持对华周班轮，到岸价平稳。', evidence: [{ t: '出口商装船台账', k: '台账', q: '周装船 3 船，脐橙占比 46%。' }], objects: [RB(42), vOrange, GT(25)] },
    { id: 'F-PK-042', cat: 'logistics', date: '2026-09-06', level: 'global', region: '南非 · 德班', short: '德班检修', lat: -29.87, lng: 31.03, cred: 'high', impact: 'high', radius: 180, media: 'text', mediaNote: '港口公告', prov: 'public', title: '德班港岸桥检修，柑橘装船顺延 5 天', summary: '两台岸桥轮修，冷藏船改靠开普敦，运费小幅上浮。', evidence: [{ t: '港务公告', k: '公告', q: '岸桥检修 2 台，装船顺延 5 天。' }], objects: [GT(25), RB(42)] },
    { id: 'F-PK-043', cat: 'trade', date: '2026-07-18', level: 'global', region: '埃及 · 三角洲', short: '埃及长绒棉', lat: 30.80, lng: 31.00, cred: 'mid', impact: 'mid', radius: 200, media: 'image', mediaNote: '轧花厂记录', prov: 'public', title: '埃及长绒棉新季开秤，报价 1.62 美元/磅', summary: '种植面积恢复，吉扎 96 报价随国际棉价回升。', evidence: [{ t: '轧花厂报价', k: '市场', q: '吉扎 96 报价 1.62 美元/磅，环比 +2.5%。' }], objects: [RB(43)] },
    { id: 'F-PK-044', cat: 'price', date: '2026-09-16', level: 'global', region: '埃塞俄比亚 · 锡达莫', short: '埃塞咖啡', lat: 6.60, lng: 38.30, cred: 'high', impact: 'high', radius: 160, media: 'image', mediaNote: '水洗站报价单', prov: 'public', title: '埃塞水洗耶加雪菲竞拍价上浮 9%', summary: '精品批次竞价激烈，欧洲与东亚买家同台竞价。', evidence: [{ t: '交易所竞拍记录', k: '市场', q: '水洗批次均价 4.47 美元/公斤，环比 +9%。' }], series: [410, 418, 425, 430, 436, 441, 447], delta: '+4.0%', objects: [RB(44), vCoffee] },
    { id: 'F-PK-045', cat: 'trade', date: '2026-09-05', level: 'global', region: '肯尼亚 · 凯里乔', short: '肯尼亚红茶', lat: -0.37, lng: 35.29, cred: 'mid', impact: 'mid', radius: 150, media: 'image', mediaNote: '茶厂记录', prov: 'public', title: '肯尼亚红茶拍卖量回升，对中东装船增加', summary: '上周蒙巴萨拍卖成交 3.4 万吨，均价持稳。', evidence: [{ t: '茶叶拍卖周报', k: '周报', q: '成交 3.4 万吨，均价 2.86 美元/公斤。' }], objects: [RB(45), GT(36)] },
    /* —— 全球：欧洲 —— */
    { id: 'F-PK-046', cat: 'trade', date: '2026-09-14', level: 'global', region: '荷兰 · 南荷兰', short: '荷兰温室', lat: 52.00, lng: 4.40, cred: 'high', impact: 'high', radius: 150, media: 'live', mediaNote: '温室直播流（公开）', prov: 'public', title: '荷兰温室番茄季末出货，电价成本占比 31%', summary: '补光成本高企，种植商缩短冬季茬口，优先高糖品种。', evidence: [{ t: '种植商出货台账', k: '台账', q: '季末周出货 8,200 吨，电价成本占比 31%。' }], objects: [RB(49), vVeg, GT(20)] },
    { id: 'F-PK-047', cat: 'logistics', date: '2026-09-09', level: 'global', region: '荷兰 · 鹿特丹', short: '鹿特丹冷链', lat: 51.92, lng: 4.48, cred: 'high', impact: 'high', radius: 200, media: 'image', mediaNote: '码头冷藏区照片', prov: 'public', title: '鹿特丹水果冷链堆场扩建投用，周转缩至 1.2 天', summary: '新冷库投用后，南美水果中转效率提升，仓储费下调。', evidence: [{ t: '港务月报', k: '统计', q: '冷链周转 1.2 天，同比 -0.6 天。' }], objects: [GT(20), RB(49)] },
    { id: 'F-PK-048', cat: 'trade', date: '2026-09-05', level: 'global', region: '法国 · 巴黎盆地', short: '法国小麦', lat: 48.80, lng: 2.30, cred: 'high', impact: 'mid', radius: 260, media: 'text', mediaNote: '粮商收购记录', prov: 'public', title: '法国小麦收割完成，蛋白含量均值 11.8%', summary: '收获质量良好，对北非出口询价增加，FOB 报价持稳。', evidence: [{ t: '粮商收购统计', k: '统计', q: '收割进度 100%，蛋白均值 11.8%。' }], objects: [RB(47), vWheat, GT(20)] },
    { id: 'F-PK-049', cat: 'price', date: '2026-09-17', level: 'global', region: '西班牙 · 阿尔梅里亚', short: '西班牙番茄', lat: 36.83, lng: -2.46, cred: 'high', impact: 'high', radius: 140, media: 'image', mediaNote: '拍卖市场行情', prov: 'public', title: '阿尔梅里亚温室番茄拍卖价同比 +14%', summary: '夏季高温减产叠加能源成本，冬春茬种植计划推迟。', evidence: [{ t: '拍卖市场行情', k: '市场', q: '均价 0.98 欧元/公斤，同比 +14%。' }], series: [0.86, 0.89, 0.92, 0.95, 0.94, 0.97, 0.98], delta: '+5.6%', objects: [RB(46), vVeg] },
    { id: 'F-PK-050', cat: 'trade', date: '2026-06-28', level: 'global', region: '乌克兰 · 波尔塔瓦', short: '乌克兰小麦', lat: 49.40, lng: 32.00, cred: 'mid', impact: 'low', radius: 280, media: 'image', mediaNote: '粮库照片', prov: 'public', title: '乌克兰小麦出口通道切换，多瑙河港装船回升', summary: '黑海保险费率波动，部分货主改走多瑙河与铁路走廊。', evidence: [{ t: '粮商发运记录', k: '台账', q: '多瑙河装船 42 万吨，环比 +15%。' }], objects: [RB(48), vWheat] },
    /* —— 全球：东北亚 / 中东 / 欧洲 —— */
    { id: 'F-PK-051', cat: 'logistics', date: '2026-07-02', level: 'global', region: '日本 · 东京', short: '东京港', lat: 35.62, lng: 139.79, cred: 'mid', impact: 'low', radius: 120, media: 'text', mediaNote: '码头记录', prov: 'public', title: '东京港冷链生鲜进口平稳，周末需求带动到货', summary: '进口水果以柑橘与樱桃为主，冷库周转 2.1 天。', evidence: [{ t: '码头吞吐统计', k: '统计', q: '周吞吐 4.2 万吨，冷库周转 2.1 天。' }], objects: [GT(45)] },
    { id: 'F-PK-052', cat: 'logistics', date: '2026-09-12', level: 'global', region: '韩国 · 釜山', short: '釜山中转', lat: 35.10, lng: 129.04, cred: 'mid', impact: 'mid', radius: 180, media: 'image', mediaNote: '堆场照片', prov: 'public', title: '釜山港中转箱量创新高，冷藏插座扩容', summary: '东南亚航线旺季，冷藏箱堆存率 78%，新增插座 600 个。', evidence: [{ t: '港务统计', k: '统计', q: '中转箱量 +11%，新增冷藏插座 600 个。' }], objects: [GT(26), GT(43)] },
    { id: 'F-PK-053', cat: 'logistics', date: '2026-09-06', level: 'global', region: '韩国 · 仁川', short: '仁川查验', lat: 37.46, lng: 126.44, cred: 'mid', impact: 'mid', radius: 140, media: 'image', mediaNote: '货站记录', prov: 'public', title: '仁川机场进口水果查验批次周增 9%', summary: '东南亚水果与北美樱桃集中到港，冷库中转顺畅。', evidence: [{ t: '口岸查验统计', k: '统计', q: '查验批次 +9%，平均放行 5 小时。' }], objects: [GT(43)] },
    { id: 'F-PK-054', cat: 'logistics', date: '2026-09-13', level: 'global', region: '中国台湾 · 高雄', short: '高雄冷冻柜', lat: 22.61, lng: 120.28, cred: 'mid', impact: 'mid', radius: 150, media: 'text', mediaNote: '港口公告', prov: 'public', title: '高雄港冷冻柜堆存率 83%，出口以水产为主', summary: '冷链货量旺季，港区建议出口商提前 3 天预约插座。', evidence: [{ t: '港务公告', k: '公告', q: '冷冻柜堆存率 83%，预约周期 3 天。' }], objects: [GT(10)] },
    { id: 'F-PK-055', cat: 'logistics', date: '2026-09-13', level: 'global', region: '中国香港', short: '香港转口', lat: 22.33, lng: 114.13, cred: 'mid', impact: 'mid', radius: 160, media: 'image', mediaNote: '码头记录', prov: 'public', title: '香港葵青冷链进口回升，生鲜转口内地 +6%', summary: '周末进口鲜活水产增多，跨境冷链车平均等待 1.8 小时。', evidence: [{ t: '码头作业统计', k: '统计', q: '冷链进口 +6%，跨境车等待 1.8 小时。' }], objects: [GT(9)] },
    { id: 'F-PK-056', cat: 'trade', date: '2026-09-14', level: 'global', region: '巴西 · 巴拉那瓜', short: '巴拉那瓜玉米', lat: -25.51, lng: -48.51, cred: 'high', impact: 'high', radius: 220, media: 'image', mediaNote: '装船记录', prov: 'public', title: '巴拉那瓜玉米对华装船 3 船共 18 万吨', summary: '二茬玉米集中出口，对华配船增加，港外待泊 6 天。', evidence: [{ t: '装船台账', k: '台账', q: '对华 3 船 18 万吨，待泊 6 天。' }], objects: [GT(17), RB(25)] },
    { id: 'F-PK-057', cat: 'logistics', date: '2026-09-15', level: 'global', region: '比利时 · 安特卫普', short: '安特卫普冷库', lat: 51.26, lng: 4.40, cred: 'high', impact: 'high', radius: 150, media: 'text', mediaNote: '码头记录', prov: 'public', title: '安特卫普冷藏库满仓，南美香蕉分拨延后', summary: '冷库利用率 96%，分拨商转向鹿特丹中转。', evidence: [{ t: '冷库运营记录', k: '台账', q: '利用率 96%，分拨等待 2.4 天。' }], objects: [GT(21), vBanana] },
    { id: 'F-PK-058', cat: 'trade', date: '2026-09-16', level: 'global', region: '阿联酋 · 迪拜', short: '迪拜香料', lat: 25.25, lng: 55.36, cred: 'mid', impact: 'mid', radius: 160, media: 'image', mediaNote: '批发市场照片', prov: 'synthesized', title: '迪拜香料与干果批发到货量周增 14%', summary: '南亚货源集中到港，中东北非买家节前备货。', evidence: [{ t: '市场到货统计', k: '市场', q: '周到货 +14%，香辛料占比 38%。' }], objects: [GT(39)] },
    { id: 'F-PK-059', cat: 'price', date: '2026-09-18', level: 'global', region: '美国 · 加利福尼亚', short: '美西生菜', lat: 36.75, lng: -119.77, cred: 'mid', impact: 'mid', radius: 140, media: 'text', mediaNote: '批发市场行情', prov: 'public', title: '美西生菜批发价同比 +18%，高温减产', summary: '中部谷地热浪导致减产，餐饮渠道抢货。', evidence: [{ t: '批发市场行情', k: '市场', q: '生菜均价 1.32 美元/颗，同比 +18%。' }], series: [1.12, 1.18, 1.24, 1.27, 1.26, 1.31, 1.32], delta: '+7.3%', objects: [RB(32), vVeg, GT(23)] },
    { id: 'F-PK-060', cat: 'weather', date: '2026-09-14', level: 'global', region: '越南 · 芹苴', short: '湄公河水位', lat: 10.05, lng: 105.75, cred: 'high', impact: 'mid', radius: 240, media: 'image', mediaNote: '水文站数据', prov: 'public', title: '湄公河水位偏低，三角洲灌溉调度加严', summary: '上游来水偏少，九龙江平原水稻灌溉分区轮灌。', evidence: [{ t: '水文站通报', k: '通报', q: '同奈站水位低于常年 1.2 米。' }], objects: [RB(22), vRice] },
    /* —— 全国层级 —— */
    { id: 'F-PK-061', cat: 'policy', date: '2026-09-14', level: 'china', region: '北京', short: '检疫便利化', lat: 39.90, lng: 116.40, cred: 'high', impact: 'high', radius: 420, media: 'text', mediaNote: '公告原文 + 条款摘录', prov: 'public', title: '进口水果检疫便利化措施扩围，口岸抽检比例下调', summary: '「提前申报 + 到港直提」范围扩大，鲜果平均通关压缩至 22 小时。', evidence: [{ t: '主管部门公告', k: '政策', q: '抽检比例下调，鲜果通关时效 22 小时。' }], objects: [agCustoms, vCherry, vOrange] },
    { id: 'F-PK-062', cat: 'price', date: '2026-09-15', level: 'china', region: '山东 · 烟台', short: '苹果均价', lat: 37.50, lng: 121.00, cred: 'high', impact: 'mid', radius: 180, media: 'image', mediaNote: '批发行情单', prov: 'public', title: '全国苹果批发均价 8.4 元/公斤，红富士新果上市', summary: '早熟嘎啦退市，库存果出清，新果开秤价高于去年 6%。', evidence: [{ t: '批发市场价格日报', k: '市场', q: '苹果均价 8.4 元/公斤，环比 +1.8%。' }], series: [7.6, 7.7, 7.9, 8.0, 8.1, 8.3, 8.4], delta: '+3.7%', objects: [RB(7), vApple, mIndex] },
    { id: 'F-PK-063', cat: 'price', date: '2026-09-16', level: 'china', region: '山东 · 潍坊', short: '寿光指数', lat: 36.86, lng: 118.79, cred: 'high', impact: 'high', radius: 220, media: 'image', mediaNote: '指数日报', prov: 'public', title: '寿光蔬菜价格指数 128.6 点，环比 +4.2%', summary: '北方产区换茬，茄果类价格领涨，运费成本同步上行。', evidence: [{ t: '价格指数日报', k: '口径', q: '指数 128.6 点，环比 +4.2%。' }], series: [116, 119, 121, 123, 124, 126, 128.6], delta: '+4.2%', objects: [RB(6), vVeg, mIndex] },
    { id: 'F-PK-064', cat: 'trade', date: '2026-09-12', level: 'china', region: '陕西 · 延安', short: '洛川预订', lat: 35.90, lng: 109.40, cred: 'high', impact: 'mid', radius: 200, media: 'video', mediaNote: '产地探访 · 1:52', prov: 'public', title: '洛川苹果新季预订开启，产地直发比例升至 42%', summary: '客商提前锁定货源，电商直发与商超直采并行。', evidence: [{ t: '产地购销台账', k: '台账', q: '预订量 8.6 万吨，直发占比 42%。' }], objects: [RB(8), vApple, cAppleSN] },
    { id: 'F-PK-065', cat: 'price', date: '2026-09-10', level: 'china', region: '江西 · 赣州', short: '赣南脐橙', lat: 25.70, lng: 114.90, cred: 'mid', impact: 'mid', radius: 160, media: 'image', mediaNote: '产地行情', prov: 'public', title: '赣南脐橙蜜柚见新，脐橙预订价持平', summary: '果园预订按 70 果径起步，预计 11 月集中上市。', evidence: [{ t: '产地报价', k: '市场', q: '蜜柚产地价 3.1 元/斤，脐橙预订价持平。' }], series: [5.2, 5.3, 5.3, 5.4, 5.4, 5.5, 5.5], delta: '+2.0%', objects: [RB(9), vOrange] },
    { id: 'F-PK-066', cat: 'trade', date: '2026-09-08', level: 'china', region: '四川 · 眉山', short: '眉山柑橘', lat: 30.05, lng: 103.85, cred: 'high', impact: 'mid', radius: 180, media: 'image', mediaNote: '果园装车记录', prov: 'public', title: '眉山晚熟柑橘留树保鲜 60 万亩，错峰上市', summary: '爱媛与春见留树保鲜，春节前集中供货东部市场。', evidence: [{ t: '合作社台账', k: '台账', q: '留树保鲜 60 万亩，同比 +5 万亩。' }], objects: [RB(12), vOrange] },
    { id: 'F-PK-067', cat: 'trade', date: '2026-09-15', level: 'china', region: '云南 · 楚雄', short: '元谋外销', lat: 25.70, lng: 101.85, cred: 'mid', impact: 'mid', radius: 160, media: 'image', mediaNote: '冷库装车照片', prov: 'public', title: '元谋番茄外销 1.8 万吨，主发成渝与西北', summary: '秋季茬口衔接顺畅，冷链车平均在园 1.5 天。', evidence: [{ t: '产地外销台账', k: '台账', q: '周外销 1.8 万吨，冷链车 420 台次。' }], objects: [RB(13), vVeg] },
    { id: 'F-PK-068', cat: 'price', date: '2026-09-07', level: 'china', region: '广西 · 来宾', short: '糖料蔗价', lat: 22.80, lng: 108.30, cred: 'high', impact: 'mid', radius: 200, media: 'image', mediaNote: '糖厂报价', prov: 'public', title: '广西新榨季糖料蔗收购首付价维持 500 元/吨', summary: '种植面积稳定，机收比例提升，预计 11 月中旬开榨。', evidence: [{ t: '糖厂收购公告', k: '公告', q: '首付价 500 元/吨，机收率 34%。' }], series: [5400, 5400, 5410, 5420, 5420, 5430, 5440], delta: '+0.9%', objects: [RB(14), vSugarcane, rgGX] },
    { id: 'F-PK-069', cat: 'trade', date: '2026-09-11', level: 'china', region: '新疆 · 伊犁', short: '甜菜起收', lat: 43.90, lng: 81.30, cred: 'mid', impact: 'high', radius: 260, media: 'image', mediaNote: '甜菜起收记录', prov: 'public', title: '伊犁甜菜起收启动，含糖率 16.8% 高于去年', summary: '起收机械到位八成，糖厂按合同收购，交售进度正常。', evidence: [{ t: '糖厂收购台账', k: '台账', q: '含糖率 16.8%，起收进度 21%。' }], objects: [RB(10)] },
    { id: 'F-PK-070', cat: 'trade', date: '2026-09-04', level: 'china', region: '内蒙古 · 巴彦淖尔', short: '葵花籽', lat: 41.00, lng: 107.40, cred: 'mid', impact: 'mid', radius: 220, media: 'image', mediaNote: '晒场记录', prov: 'public', title: '河套葵花籽开始交售，油厂挂牌价 4.1 元/斤', summary: '新籽含油率 42%，交售以订单为主，外调种子减少。', evidence: [{ t: '油厂收购台账', k: '台账', q: '挂牌价 4.1 元/斤，含油率 42%。' }], objects: [RB(11)] },
    { id: 'F-PK-071', cat: 'policy', date: '2026-09-13', level: 'china', region: '海南 · 三亚', short: '南繁加代', lat: 18.30, lng: 109.50, cred: 'high', impact: 'mid', radius: 180, media: 'text', mediaNote: '实施方案摘录', prov: 'public', title: '南繁基地制种加代窗口开启，生物育种试验扩围', summary: '新批次水稻加代材料入田，隔离规程同步执行。', evidence: [{ t: '实施方案', k: '政策', q: '新批次加代材料 1,240 份入田。' }], objects: [RB(15), agMoA, vRice] },
    { id: 'F-PK-072', cat: 'logistics', date: '2026-09-16', level: 'china', region: '广东 · 广州', short: '广州口岸', lat: 23.13, lng: 113.26, cred: 'high', impact: 'high', radius: 200, media: 'image', mediaNote: '口岸到货记录', prov: 'public', title: '广州口岸进口水果到货 2.4 万吨，榴莲占四成', summary: '东南亚航线集中到港，冷链查验一体作业，平均 6 小时放行。', evidence: [{ t: '口岸通关统计', k: '统计', q: '进口水果 2.4 万吨，平均放行 6 小时。' }], objects: [GT(4), vDurian, rgGD] },
    { id: 'F-PK-073', cat: 'logistics', date: '2026-09-09', level: 'china', region: '江苏 · 南京', short: '粮食物流', lat: 32.06, lng: 118.80, cred: 'high', impact: 'mid', radius: 200, media: 'text', mediaNote: '粮食物流记录', prov: 'public', title: '南京都市圈粮食物流周吞吐 28 万吨，夏粮入库过半', summary: '散粮车船接卸顺畅，皖苏走廊发运平稳。', evidence: [{ t: '物流园区台账', k: '台账', q: '周吞吐 28 万吨，夏粮入库 52%。' }], objects: [vWheat, mIndex] },
    { id: 'F-PK-074', cat: 'logistics', date: '2026-09-10', level: 'china', region: '浙江 · 宁波', short: '宁波粮食', lat: 29.87, lng: 121.85, cred: 'mid', impact: 'mid', radius: 220, media: 'video', mediaNote: '码头作业 · 1:06', prov: 'public', title: '宁波舟山港粮食月吞吐 310 万吨，大豆船集中到港', summary: '南美大豆船集中抵港，筒仓周转 4.2 天。', evidence: [{ t: '港务统计', k: '统计', q: '粮食吞吐 310 万吨，筒仓周转 4.2 天。' }], objects: [GT(2), RB(25)] },
    { id: 'F-PK-075', cat: 'logistics', date: '2026-07-14', level: 'china', region: '福建 · 厦门', short: '厦门快线', lat: 24.45, lng: 118.03, cred: 'mid', impact: 'mid', radius: 180, media: 'text', mediaNote: '口岸公告', prov: 'public', title: '厦门港台湾水果快线周班加密，通关 2 小时', summary: '凤梨释迦集中到港，快速通道验放效率提升。', evidence: [{ t: '口岸公告', k: '公告', q: '快线周 3 班，平均通关 2 小时。' }], objects: [GT(7), vOrange] },
    { id: 'F-PK-076', cat: 'logistics', date: '2026-08-02', level: 'china', region: '辽宁 · 大连', short: '北粮南运', lat: 38.93, lng: 121.65, cred: 'mid', impact: 'low', radius: 160, media: 'image', mediaNote: '堆场照片', prov: 'public', title: '大连港北粮南运周发运 42 万吨', summary: '新季玉米陆续集港，散粮船南下计划排至月末。', evidence: [{ t: '港务发运统计', k: '统计', q: '周发运 42 万吨，同比 +9%。' }], objects: [GT(8), vCorn] },
    { id: 'F-PK-077', cat: 'price', date: '2026-09-15', level: 'china', region: '河南 · 许昌', short: '河南生猪', lat: 34.00, lng: 113.70, cred: 'mid', impact: 'high', radius: 240, media: 'image', mediaNote: '养殖场报价', prov: 'public', title: '河南生猪出栏均价 17.2 元/公斤，二次育肥入场', summary: '标猪供应偏紧，二次育肥分流屠宰量，白条走货平稳。', evidence: [{ t: '养殖场报价台账', k: '台账', q: '出栏均价 17.2 元/公斤，环比 +3.6%。' }], series: [16.1, 16.3, 16.5, 16.8, 17.0, 17.1, 17.2], delta: '+3.6%', objects: [RB(16), vPork] },
    { id: 'F-PK-078', cat: 'policy', date: '2026-09-16', level: 'china', region: '北京', short: '市场试点', lat: 39.90, lng: 116.40, cred: 'high', impact: 'high', radius: 380, media: 'text', mediaNote: '政策全文摘录', prov: 'public', title: '全国农产品批发市场信息化改造试点名单公布', summary: '首批 34 个市场纳入试点，交易数据实时归集入监管平台。', evidence: [{ t: '试点方案', k: '政策', q: '首批 34 个市场，覆盖 21 个省份。' }], objects: [agMoA, mIndex] },
    { id: 'F-PK-079', cat: 'price', date: '2026-09-18', level: 'china', region: '上海', short: '批发指数', lat: 31.23, lng: 121.47, cred: 'high', impact: 'high', radius: 200, media: 'text', mediaNote: '指数日报', prov: 'public', title: '全国农产品批发价格指数 116.4 点，菜篮子上行', summary: '叶菜与茄果领涨，猪肉价格贡献收窄。', evidence: [{ t: '价格指数日报', k: '口径', q: '指数 116.4 点，环比 +0.9%。' }], series: [112, 112.8, 113.5, 114, 114.6, 115.2, 116.4], delta: '+2.8%', objects: [mIndex, vVeg, GT(1)] },
    { id: 'F-PK-080', cat: 'price', date: '2026-09-17', level: 'china', region: '山东 · 潍坊', short: '冷链运价', lat: 36.86, lng: 118.79, cred: 'high', impact: 'high', radius: 140, media: 'text', mediaNote: '运价指数', prov: 'public', title: '冷链干线运价指数 1,284 点，环比 +2.6%', summary: '油价与旺季叠加，山东至华南线路报价上调。', evidence: [{ t: '运价指数周报', k: '口径', q: '指数 1,284 点，环比 +2.6%。' }], series: [1198, 1210, 1225, 1240, 1252, 1264, 1284], delta: '+2.6%', objects: [mCold, RB(6)] },
    { id: 'F-PK-081', cat: 'logistics', date: '2026-09-08', level: 'china', region: '中国香港', short: '供港生鲜', lat: 22.33, lng: 114.13, cred: 'high', impact: 'low', radius: 140, media: 'image', mediaNote: '口岸记录', prov: 'public', title: '供港生鲜日均 320 车，叶菜占比过半', summary: '凌晨批发行情平稳，跨境冷链车通行顺畅。', evidence: [{ t: '口岸通行统计', k: '统计', q: '日均 320 车，叶菜占比 54%。' }], objects: [GT(9), vVeg] },
    { id: 'F-PK-082', cat: 'policy', date: '2026-09-12', level: 'china', region: '中国台湾 · 高雄', short: '释迦重启', lat: 22.61, lng: 120.28, cred: 'mid', impact: 'mid', radius: 150, media: 'text', mediaNote: '口岸通报', prov: 'public', title: '台东凤梨释迦输陆重启，首批 12 柜', summary: '口岸检疫合格后快速放行，贸易商按周排产。', evidence: [{ t: '口岸检疫通报', k: '通报', q: '首批 12 柜，放行 4 小时。' }], objects: [GT(10), vOrange] },
    { id: 'F-PK-083', cat: 'logistics', date: '2026-09-17', level: 'china', region: '上海', short: '洋山冷链', lat: 30.62, lng: 122.06, cred: 'high', impact: 'high', radius: 220, media: 'image', mediaNote: '码头作业照片', prov: 'public', title: '洋山港冷链进口月度 4.6 万标箱，创年内新高', summary: '东南亚与南美航线并网，冷藏箱免堆期维持 7 天。', evidence: [{ t: '港务月报', k: '统计', q: '冷链进口 4.6 万标箱，环比 +12%。' }], objects: [GT(1), vDurian] },
    { id: 'F-PK-084', cat: 'logistics', date: '2026-09-13', level: 'china', region: '北京', short: '首都空运', lat: 40.08, lng: 116.58, cred: 'high', impact: 'mid', radius: 160, media: 'text', mediaNote: '货站记录', prov: 'public', title: '首都机场空运生鲜周增 8%，进口樱桃见新', summary: '南半球空运到港集中，查验与冷库中转顺畅。', evidence: [{ t: '货站吞吐记录', k: '台账', q: '周吞吐 +8%，樱桃批次 34 单。' }], objects: [GT(30), vCherry] },
    { id: 'F-PK-085', cat: 'trade', date: '2026-09-14', level: 'china', region: '中国全域', short: '进口统计', lat: 35.86, lng: 104.19, cred: 'high', impact: 'high', radius: 300, media: 'image', mediaNote: '海关月度统计', prov: 'public', title: '前 8 个月农产品进口额 1.42 万亿元，同比 +6.4%', summary: '粮食进口结构分化，水果与水产品进口增速领先。', evidence: [{ t: '海关月度统计', k: '统计', q: '进口额 1.42 万亿元，同比 +6.4%。' }], objects: [agCustoms, mFreight] },
    /* —— 省区层级：湖南 —— */
    { id: 'F-PK-086', cat: 'trade', date: '2026-09-16', level: 'province', region: '湖南 · 长沙', short: '海吉星到货', lat: 28.23, lng: 113.10, cred: 'high', impact: 'high', radius: 160, media: 'image', mediaNote: '市场到货台账', prov: 'public', title: '海吉星蔬菜日均到货 1.1 万吨，本地叶菜占比回升', summary: '换茬期外调菜增加，冬瓜与辣椒到货量居前。', evidence: [{ t: '市场到货台账', k: '台账', q: '日均到货 1.1 万吨，本地叶菜 46%。' }], objects: [mktHXJX, vVeg, pBuyer] },
    { id: 'F-PK-087', cat: 'price', date: '2026-09-15', level: 'province', region: '湖南 · 长沙', short: '长沙菜价', lat: 28.23, lng: 113.10, cred: 'high', impact: 'high', radius: 120, media: 'image', mediaNote: '市场行情单', prov: 'public', title: '长沙蔬菜均价 4.6 元/公斤，环比 +3.1%', summary: '叶菜领涨，茄果平稳，节前备货需求启动。', evidence: [{ t: '市场行情日报', k: '市场', q: '蔬菜均价 4.6 元/公斤，环比 +3.1%。' }], series: [4.2, 4.3, 4.35, 4.4, 4.45, 4.5, 4.6], delta: '+3.1%', objects: [mktHXJX, mIndex] },
    { id: 'F-PK-088', cat: 'logistics', date: '2026-09-17', level: 'province', region: '湖南 · 长沙', short: '黄花到货', lat: 28.19, lng: 113.22, cred: 'high', impact: 'high', radius: 140, media: 'text', mediaNote: '货站记录', prov: 'public', title: '黄花机场进境水果单周 1,240 吨，榴莲占六成', summary: '东南亚包机加密，冷库周转 1.9 天，查验即到即放。', evidence: [{ t: '口岸货站台账', k: '台账', q: '进境水果 1,240 吨，放行 4.5 小时。' }], objects: [GT(27), vDurian, rgHN] },
    { id: 'F-PK-089', cat: 'trade', date: '2026-09-14', level: 'province', region: '湖南 · 常德', short: '常德开秤', lat: 29.02, lng: 112.52, cred: 'high', impact: 'mid', radius: 180, media: 'image', mediaNote: '粮库收购记录', prov: 'public', title: '常德中晚稻开秤 1.34 元/斤，优质优价', summary: '烘干中心满负荷，粮库排队 1.2 天。', evidence: [{ t: '粮库收购台账', k: '台账', q: '开秤价 1.34 元/斤，日入库 2.1 万吨。' }], objects: [RB(1), vRice, mGrain] },
    { id: 'F-PK-090', cat: 'price', date: '2026-09-13', level: 'province', region: '湖南 · 常德', short: '菜籽油价', lat: 29.03, lng: 111.70, cred: 'high', impact: 'low', radius: 120, media: 'image', mediaNote: '油厂报价', prov: 'public', title: '常德菜籽油出厂价 9,800 元/吨，小幅回落', summary: '新季菜籽压榨进度过半，小包装出货平稳。', evidence: [{ t: '油厂报价单', k: '市场', q: '四级菜油 9,800 元/吨，环比 -1.6%。' }], series: [10100, 10050, 10000, 9960, 9920, 9880, 9800], delta: '-1.6%', objects: [RB(1)] },
    { id: 'F-PK-091', cat: 'price', date: '2026-09-12', level: 'province', region: '湖南 · 怀化', short: '冰糖橙预订', lat: 27.55, lng: 110.02, cred: 'mid', impact: 'mid', radius: 140, media: 'image', mediaNote: '果园行情', prov: 'public', title: '怀化冰糖橙预订启动，果园报价 3.2 元/斤', summary: '客商按 60 果径预订，预计 11 月下旬上市。', evidence: [{ t: '产地购销台账', k: '台账', q: '预订量 2.4 万吨，报价 3.2 元/斤。' }], series: [2.9, 2.95, 3.0, 3.05, 3.1, 3.15, 3.2], delta: '+3.2%', objects: [RB(3), vOrange] },
    { id: 'F-PK-092', cat: 'price', date: '2026-09-16', level: 'province', region: '湖南 · 岳阳', short: '岳阳生猪', lat: 29.36, lng: 113.13, cred: 'mid', impact: 'mid', radius: 160, media: 'image', mediaNote: '养殖场报价', prov: 'public', title: '岳阳生猪出栏价 17.4 元/公斤，二次育肥活跃', summary: '散户压栏增多，规模场正常出栏，收猪难度上升。', evidence: [{ t: '养殖场报价台账', k: '台账', q: '出栏价 17.4 元/公斤，环比 +2.9%。' }], series: [16.4, 16.7, 16.9, 17.0, 17.1, 17.3, 17.4], delta: '+2.9%', objects: [vPork, rgHN] },
    { id: 'F-PK-093', cat: 'trade', date: '2026-09-15', level: 'province', region: '湖南 · 郴州', short: '郴州脐橙', lat: 25.60, lng: 112.90, cred: 'high', impact: 'high', radius: 140, media: 'image', mediaNote: '果园记录', prov: 'public', title: '郴州脐橙套袋完成 82%，转色早于去年', summary: '山地果园昼夜温差大，转色进度提前一周。', evidence: [{ t: '果园生产台账', k: '台账', q: '套袋进度 82%，转色提前 7 天。' }], objects: [RB(3), vOrange] },
    { id: 'F-PK-094', cat: 'trade', date: '2026-09-14', level: 'province', region: '湖南 · 永州', short: '永州供港菜', lat: 26.42, lng: 111.61, cred: 'high', impact: 'high', radius: 140, media: 'image', mediaNote: '冷库装车照片', prov: 'public', title: '永州供粤港澳大湾区蔬菜日发 420 车', summary: '「菜篮子」基地采收正常，冷链直达 12 小时。', evidence: [{ t: '基地发运台账', k: '台账', q: '日发 420 车，直供港澳与珠三角。' }], objects: [vVeg, agHN, rgHN] },
    { id: 'F-PK-095', cat: 'trade', date: '2026-09-13', level: 'province', region: '湖南 · 益阳', short: '大通湖蟹', lat: 28.55, lng: 112.35, cred: 'mid', impact: 'low', radius: 130, media: 'image', mediaNote: '塘口记录', prov: 'public', title: '益阳大通湖大闸蟹起捕，四两规格占四成', summary: '养殖户分批起捕，批发商按规格分级收购。', evidence: [{ t: '塘口收购记录', k: '台账', q: '四两以上占 41%，日均起捕 18 吨。' }], objects: [vFish, mktHXJX] },
    { id: 'F-PK-096', cat: 'price', date: '2026-09-11', level: 'province', region: '湖南 · 株洲', short: '株洲红茶', lat: 27.83, lng: 113.13, cred: 'mid', impact: 'mid', radius: 120, media: 'image', mediaNote: '茶厂报价', prov: 'public', title: '株洲红茶出厂价 128 元/公斤，出口订单平稳', summary: '夏茶尾期产量有限，出口以中亚与东欧为主。', evidence: [{ t: '茶厂报价单', k: '市场', q: '出厂价 128 元/公斤，环比 +2.4%。' }], series: [118, 120, 121, 123, 124, 126, 128], delta: '+2.4%', objects: [RB(2), vTea] },
    { id: 'F-PK-097', cat: 'trade', date: '2026-09-10', level: 'province', region: '湖南 · 湘西', short: '湘西猕猴桃', lat: 28.30, lng: 109.70, cred: 'mid', impact: 'mid', radius: 130, media: 'video', mediaNote: '产地探访 · 1:36', prov: 'public', title: '湘西猕猴桃出口首柜启运，发往东南亚', summary: '米良一号糖度 15.8%，冷链车直发深圳口岸。', evidence: [{ t: '产地购销台账', k: '台账', q: '首柜 18 吨，糖度 15.8%。' }], objects: [RB(4), GT(3)] },
    { id: 'F-PK-098', cat: 'policy', date: '2026-09-16', level: 'province', region: '湖南 · 长沙', short: '农机补贴', lat: 28.23, lng: 112.94, cred: 'high', impact: 'mid', radius: 200, media: 'text', mediaNote: '实施方案摘录', prov: 'public', title: '湖南农机补贴目录更新，果蔬冷链设备入补', summary: '冷库与冷藏运输车纳入补贴，单户上限提高。', evidence: [{ t: '补贴目录公告', k: '政策', q: '新增冷库与冷藏车两类品目。' }], objects: [agHN, vVeg, rgHN] },
    { id: 'F-PK-099', cat: 'trade', date: '2026-09-18', level: 'province', region: '湖南 · 长沙', short: '红星榴莲', lat: 28.19, lng: 112.98, cred: 'high', impact: 'high', radius: 160, media: 'live', mediaNote: '市场行情直播流（公开）', prov: 'public', title: '红星市场榴莲到货 560 吨，猫山王占比升至 35%', summary: '东南亚直发柜增多，凌晨竞价激烈，均价持稳。', evidence: [{ t: '市场直播转写', k: '直播', q: '到货 560 吨，猫山王占比 35%。' }], objects: [mktGQ, vDurian, cDurianMY] },
    { id: 'F-PK-100', cat: 'price', date: '2026-09-19', level: 'province', region: '湖南 · 长沙', short: '榴莲均价', lat: 28.19, lng: 112.98, cred: 'high', impact: 'mid', radius: 120, media: 'image', mediaNote: '市场行情单', prov: 'public', title: '长沙榴莲批发均价 46 元/公斤，环比 +2.2%', summary: '到货集中但走货快，A 果溢价明显。', evidence: [{ t: '市场行情日报', k: '市场', q: '均价 46 元/公斤，A 果溢价 18%。' }], series: [41, 42, 43, 44, 44.5, 45, 46], delta: '+2.2%', objects: [mktGQ, mDurian] },
    { id: 'F-PK-101', cat: 'trade', date: '2026-09-12', level: 'province', region: '湖南 · 岳阳', short: '城陵矶', lat: 29.37, lng: 113.10, cred: 'mid', impact: 'mid', radius: 150, media: 'text', mediaNote: '口岸记录', prov: 'public', title: '城陵矶进口粮食口岸月到货 6.8 万吨', summary: '进口大豆与小麦到港集中，江海联运班轮加密。', evidence: [{ t: '口岸到货统计', k: '统计', q: '月到货 6.8 万吨，班轮 14 航次。' }], objects: [vSoy, rgHN] },
    { id: 'F-PK-102', cat: 'trade', date: '2026-09-15', level: 'province', region: '湖南 · 常德', short: '再生稻', lat: 29.02, lng: 112.52, cred: 'high', impact: 'high', radius: 130, media: 'image', mediaNote: '合作社台账', prov: 'public', title: '常德再生稻头季收割完成 14 万亩', summary: '机收损失率 2.1%，再生季管理同步展开。', evidence: [{ t: '合作社收割台账', k: '台账', q: '头季 14 万亩，损失率 2.1%。' }], objects: [RB(1), vRice] },
    /* —— 省区层级：其它省份 —— */
    { id: 'F-PK-103', cat: 'price', date: '2026-09-15', level: 'province', region: '山东 · 潍坊', short: '寿光辣椒', lat: 36.86, lng: 118.79, cred: 'high', impact: 'mid', radius: 160, media: 'image', mediaNote: '市场行情单', prov: 'public', title: '寿光辣椒批发价 6.8 元/公斤，环比 +5.2%', summary: '换茬期供应偏紧，尖椒与线椒价格领涨。', evidence: [{ t: '市场行情日报', k: '市场', q: '辣椒均价 6.8 元/公斤，环比 +5.2%。' }], series: [5.4, 5.7, 5.9, 6.1, 6.3, 6.5, 6.8], delta: '+5.2%', objects: [RB(6), vVeg] },
    { id: 'F-PK-104', cat: 'price', date: '2026-09-08', level: 'province', region: '山东 · 烟台', short: '库存苹果', lat: 37.45, lng: 121.20, cred: 'mid', impact: 'low', radius: 140, media: 'image', mediaNote: '冷库出库记录', prov: 'public', title: '烟台库存苹果出清，80 果 3.4 元/斤', summary: '冷库出库进入尾声，客商转向新果采购。', evidence: [{ t: '冷库出库台账', k: '台账', q: '出库率 96%，80 果 3.4 元/斤。' }], series: [3.6, 3.55, 3.5, 3.5, 3.45, 3.42, 3.4], delta: '-1.4%', objects: [RB(7), vApple] },
    { id: 'F-PK-105', cat: 'trade', date: '2026-09-14', level: 'province', region: '四川 · 成都', short: '濛阳到货', lat: 30.87, lng: 104.20, cred: 'high', impact: 'mid', radius: 150, media: 'image', mediaNote: '市场到货记录', prov: 'public', title: '濛阳市场蔬菜日到货 8,400 吨，本地菜占 46%', summary: '高原菜与本地菜衔接，价格总体平稳。', evidence: [{ t: '市场到货台账', k: '台账', q: '日到货 8,400 吨，本地菜 46%。' }], objects: [vVeg] },
    { id: 'F-PK-106', cat: 'price', date: '2026-09-13', level: 'province', region: '广东 · 广州', short: '广州水果', lat: 23.13, lng: 113.26, cred: 'high', impact: 'high', radius: 160, media: 'image', mediaNote: '市场行情单', prov: 'public', title: '广州水果批发指数上行，榴莲均价 44 元/公斤', summary: '进口水果到货集中，均价小幅走高。', evidence: [{ t: '市场行情日报', k: '市场', q: '榴莲均价 44 元/公斤，环比 +2.3%。' }], series: [40, 41, 41.5, 42, 43, 43.5, 44], delta: '+2.3%', objects: [vDurian, mDurian, rgGD] },
    { id: 'F-PK-107', cat: 'weather', date: '2026-09-09', level: 'province', region: '广东 · 湛江', short: '台风压港', lat: 21.27, lng: 110.36, cred: 'high', impact: 'high', radius: 340, media: 'live', mediaNote: '港区作业直播流（公开）', prov: 'public', title: '台风外围影响华南港口，冷链柜压港 1.8 天', summary: '湛江港区限作业 36 小时，冷链柜平均压港 1.8 天。', evidence: [{ t: '港区作业通告', k: '通告', q: '限作业 36 小时，冷链柜压港 1.8 天。' }], objects: [mktZJ, GT(4)] },
    { id: 'F-PK-108', cat: 'price', date: '2026-09-12', level: 'province', region: '广西 · 南宁', short: '南宁糖价', lat: 22.82, lng: 108.32, cred: 'high', impact: 'mid', radius: 180, media: 'image', mediaNote: '市场报价', prov: 'public', title: '南宁糖批发价 5,440 元/吨，榨季前备货启动', summary: '贸易商按需补库，新榨季前报价中枢上移。', evidence: [{ t: '批发市场报价', k: '市场', q: '白糖批发价 5,440 元/吨，环比 +0.9%。' }], series: [5390, 5400, 5410, 5415, 5420, 5430, 5440], delta: '+0.9%', objects: [RB(14), vSugarcane, rgGX] },
    { id: 'F-PK-109', cat: 'trade', date: '2026-09-16', level: 'province', region: '广西 · 钦州', short: '钦州榴莲', lat: 21.95, lng: 108.65, cred: 'mid', impact: 'mid', radius: 150, media: 'image', mediaNote: '口岸到货记录', prov: 'public', title: '钦州港进境水果口岸榴莲到货 1,050 柜', summary: '东向水果航线加密，口岸查验与冷链分拨顺畅。', evidence: [{ t: '口岸到货统计', k: '统计', q: '榴莲 1,050 柜，同比 +22%。' }], objects: [vDurian, rgGX] },
    { id: 'F-PK-110', cat: 'price', date: '2026-09-11', level: 'province', region: '云南 · 昆明', short: '斗南花价', lat: 24.90, lng: 102.83, cred: 'mid', impact: 'mid', radius: 140, media: 'live', mediaNote: '拍卖直播流（公开）', prov: 'public', title: '斗南花卉拍卖均价 0.86 元/枝，玫瑰领涨', summary: '婚庆与节庆需求叠加，A级玫瑰溢价明显。', evidence: [{ t: '拍卖行情日报', k: '市场', q: '均价 0.86 元/枝，环比 +6.2%。' }], series: [0.78, 0.8, 0.82, 0.83, 0.84, 0.85, 0.86], delta: '+6.2%', objects: [vFlower, GT(29)] },
    { id: 'F-PK-111', cat: 'trade', date: '2026-09-15', level: 'province', region: '河南 · 郑州', short: '万邦备货', lat: 34.75, lng: 113.68, cred: 'high', impact: 'high', radius: 200, media: 'image', mediaNote: '市场交易记录', prov: 'public', title: '万邦市场果蔬日交易 9.2 万吨，中秋备货启动', summary: '礼品果与礼盒蔬菜走量，交易高峰后移至午后。', evidence: [{ t: '市场交易台账', k: '台账', q: '日交易 9.2 万吨，礼盒装占比 21%。' }], objects: [vVeg, vApple, RB(16)] },
    { id: 'F-PK-112', cat: 'price', date: '2026-09-10', level: 'province', region: '江苏 · 南京', short: '南京水产', lat: 32.06, lng: 118.80, cred: 'mid', impact: 'mid', radius: 150, media: 'image', mediaNote: '市场行情单', prov: 'public', title: '南京水产均价 32 元/公斤，河蟹上市', summary: '大规格河蟹溢价明显，四两公蟹报价 88 元/斤。', evidence: [{ t: '市场行情日报', k: '市场', q: '水产均价 32 元/公斤，环比 +4.9%。' }], series: [29, 30, 30.5, 31, 31.4, 31.8, 32], delta: '+4.9%', objects: [vFish] },
    { id: 'F-PK-113', cat: 'trade', date: '2026-07-26', level: 'province', region: '浙江 · 杭州', short: '杭州到货', lat: 30.29, lng: 120.16, cred: 'mid', impact: 'low', radius: 130, media: 'image', mediaNote: '市场到货记录', prov: 'public', title: '杭州农副物流中心蔬菜日到货 5,600 吨', summary: '高温期叶菜外调比例上升，到货结构稳定。', evidence: [{ t: '物流园区台账', k: '台账', q: '日到货 5,600 吨，叶菜占 52%。' }], objects: [vVeg] },
    { id: 'F-PK-114', cat: 'price', date: '2026-09-14', level: 'province', region: '湖北 · 武汉', short: '白沙洲菜价', lat: 30.47, lng: 114.35, cred: 'high', impact: 'mid', radius: 170, media: 'image', mediaNote: '市场行情单', prov: 'public', title: '白沙洲市场蔬菜均价 4.2 元/公斤，莲藕上市', summary: '本地莲藕集中上市，叶菜价格小幅回落。', evidence: [{ t: '市场行情日报', k: '市场', q: '蔬菜均价 4.2 元/公斤，环比 -1.2%。' }], series: [4.5, 4.45, 4.4, 4.35, 4.3, 4.25, 4.2], delta: '-1.2%', objects: [vVeg, vFish] },
    { id: 'F-PK-115', cat: 'price', date: '2026-09-08', level: 'province', region: '安徽 · 合肥', short: '合肥水果', lat: 31.82, lng: 117.23, cred: 'mid', impact: 'mid', radius: 140, media: 'image', mediaNote: '市场行情单', prov: 'public', title: '周谷堆水果批发价同比 -3.2%，西瓜退市', summary: '秋令水果接档，苹果与梨走量上升。', evidence: [{ t: '市场行情日报', k: '市场', q: '水果均价同比 -3.2%，西瓜占 18%。' }], series: [6.8, 6.7, 6.6, 6.5, 6.45, 6.4, 6.3], delta: '-1.6%', objects: [vOrange] },
    { id: 'F-PK-116', cat: 'price', date: '2026-09-12', level: 'province', region: '江西 · 南昌', short: '南昌辣椒', lat: 28.68, lng: 115.89, cred: 'mid', impact: 'mid', radius: 150, media: 'image', mediaNote: '市场行情单', prov: 'public', title: '南昌辣椒到货增加，批发价回落至 7.2 元/公斤', summary: '本地椒上市量上升，外调椒补充充足。', evidence: [{ t: '市场行情日报', k: '市场', q: '辣椒均价 7.2 元/公斤，环比 -4.0%。' }], series: [8.2, 8.0, 7.8, 7.6, 7.5, 7.4, 7.2], delta: '-4.0%', objects: [vVeg, RB(9)] },
    { id: 'F-PK-117', cat: 'trade', date: '2026-09-13', level: 'province', region: '福建 · 福州', short: '海峡市场', lat: 26.05, lng: 119.30, cred: 'mid', impact: 'mid', radius: 140, media: 'image', mediaNote: '市场到货记录', prov: 'public', title: '海峡蔬菜批发市场日到货 4,300 吨，本地菜过半', summary: '叶菜与瓜菜到货均衡，价格波动收窄。', evidence: [{ t: '市场到货台账', k: '台账', q: '日到货 4,300 吨，本地菜 53%。' }], objects: [vVeg, GT(7)] },
    { id: 'F-PK-118', cat: 'trade', date: '2026-09-16', level: 'province', region: '海南 · 三亚', short: '冬季瓜菜', lat: 18.25, lng: 109.51, cred: 'high', impact: 'high', radius: 150, media: 'video', mediaNote: '产地探访 · 1:44', prov: 'public', title: '三亚冬季瓜菜首批豇豆发往北方，日发 86 车', summary: '产地冷库预冷到位，主要发往东北与华北市场。', evidence: [{ t: '产地发运台账', k: '台账', q: '日发 86 车，豇豆均价 5.6 元/公斤。' }], objects: [RB(15), vVeg] },
    { id: 'F-PK-119', cat: 'price', date: '2026-09-11', level: 'province', region: '陕西 · 西安', short: '西安苹果', lat: 34.40, lng: 108.94, cred: 'mid', impact: 'mid', radius: 140, media: 'image', mediaNote: '市场行情单', prov: 'public', title: '西安苹果批发均价 6.8 元/公斤，库存果走货加快', summary: '新果上市前清库，客商按需补货。', evidence: [{ t: '市场行情日报', k: '市场', q: '苹果均价 6.8 元/公斤，环比 +1.5%。' }], series: [6.5, 6.55, 6.6, 6.65, 6.7, 6.75, 6.8], delta: '+1.5%', objects: [vApple, RB(8)] },
    { id: 'F-PK-120', cat: 'price', date: '2026-09-07', level: 'province', region: '辽宁 · 沈阳', short: '沈阳叶菜', lat: 41.80, lng: 123.43, cred: 'mid', impact: 'low', radius: 130, media: 'image', mediaNote: '市场行情单', prov: 'public', title: '沈阳叶菜批发价随气温回落，环比 -5.1%', summary: '本地秋菜上市增加，外调需求减弱。', evidence: [{ t: '市场行情日报', k: '市场', q: '叶菜均价 3.7 元/公斤，环比 -5.1%。' }], series: [4.4, 4.2, 4.1, 4.0, 3.9, 3.8, 3.7], delta: '-5.1%', objects: [vVeg] },
    { id: 'F-PK-121', cat: 'price', date: '2026-09-10', level: 'province', region: '新疆 · 乌鲁木齐', short: '乌鲁木齐羊肉', lat: 43.82, lng: 87.62, cred: 'mid', impact: 'mid', radius: 130, media: 'image', mediaNote: '市场行情单', prov: 'public', title: '北园春市场活羊均价 27 元/公斤，牛羊肉持稳', summary: '秋季育肥出栏增加，供应充足价格平稳。', evidence: [{ t: '市场行情日报', k: '市场', q: '活羊 27 元/公斤，环比 +0.4%。' }], series: [26.5, 26.6, 26.7, 26.8, 26.9, 27, 27.1], delta: '+0.4%', objects: [vBeef] },
    { id: 'F-PK-122', cat: 'price', date: '2026-09-15', level: 'province', region: '河北 · 保定', short: '保定香菇', lat: 38.87, lng: 115.46, cred: 'mid', impact: 'mid', radius: 140, media: 'image', mediaNote: '产地行情', prov: 'public', title: '保定香菇批发价 12.4 元/公斤，环比 +6.8%', summary: '出菇茬口衔接偏紧，工厂化菇占比上升。', evidence: [{ t: '产地报价', k: '市场', q: '香菇均价 12.4 元/公斤，环比 +6.8%。' }], series: [10.8, 11.2, 11.5, 11.8, 12.0, 12.2, 12.4], delta: '+6.8%', objects: [vVeg] },
    { id: 'F-PK-123', cat: 'price', date: '2026-09-14', level: 'province', region: '重庆', short: '双福菜价', lat: 29.56, lng: 106.55, cred: 'mid', impact: 'mid', radius: 140, media: 'image', mediaNote: '市场行情单', prov: 'public', title: '双福农贸城蔬菜均价 4.4 元/公斤，持平', summary: '本地菜与高山菜互补，价格波动小。', evidence: [{ t: '市场行情日报', k: '市场', q: '蔬菜均价 4.4 元/公斤，环比 +0.2%。' }], series: [4.3, 4.35, 4.4, 4.4, 4.38, 4.4, 4.4], delta: '+0.2%', objects: [vVeg] },
    { id: 'F-PK-124', cat: 'price', date: '2026-09-13', level: 'province', region: '贵州 · 贵阳', short: '贵阳辣椒', lat: 26.65, lng: 106.63, cred: 'mid', impact: 'low', radius: 130, media: 'image', mediaNote: '市场行情单', prov: 'public', title: '贵阳辣椒均价 7.2 元/公斤，本地下市量上升', summary: '黔椒集中上市，价格进入季节性回落通道。', evidence: [{ t: '市场行情日报', k: '市场', q: '辣椒均价 7.2 元/公斤，环比 -3.5%。' }], series: [8.0, 7.8, 7.7, 7.6, 7.5, 7.3, 7.2], delta: '-3.5%', objects: [vVeg] },
    { id: 'F-PK-125', cat: 'trade', date: '2026-09-15', level: 'province', region: '广东 · 深圳', short: '深圳口岸', lat: 22.64, lng: 113.81, cred: 'high', impact: 'high', radius: 150, media: 'image', mediaNote: '口岸到货记录', prov: 'public', title: '深圳口岸进口水果周增 12%，车厘子见新', summary: '南半球空运集中到港，查验与冷库中转顺畅。', evidence: [{ t: '口岸通关统计', k: '统计', q: '进口水果 +12%，车厘子 46 批次。' }], objects: [vCherry, GT(3), rgGD] },
    { id: 'F-PK-126', cat: 'trade', date: '2026-09-14', level: 'province', region: '山东 · 青岛', short: '青岛大豆', lat: 36.07, lng: 120.32, cred: 'high', impact: 'high', radius: 180, media: 'image', mediaNote: '码头到货记录', prov: 'public', title: '青岛港进口大豆月度 210 万吨，压榨开机回升', summary: '南美船期集中到港，油厂开机率升至 68%。', evidence: [{ t: '港务到货统计', k: '统计', q: '大豆到港 210 万吨，开机率 68%。' }], objects: [GT(5), RB(25)] },
    { id: 'F-PK-127', cat: 'price', date: '2026-09-12', level: 'province', region: '四川 · 眉山', short: '眉山爱媛', lat: 30.05, lng: 103.85, cred: 'high', impact: 'mid', radius: 140, media: 'image', mediaNote: '产地行情', prov: 'public', title: '眉山爱媛 38 预订价 5.6 元/斤，同比 +8%', summary: '果径规格整体偏好，客商提前锁园。', evidence: [{ t: '产地购销台账', k: '台账', q: '预订价 5.6 元/斤，锁园 3.2 万亩。' }], series: [4.9, 5.0, 5.1, 5.2, 5.35, 5.5, 5.6], delta: '+5.7%', objects: [RB(12), vOrange] },
    { id: 'F-PK-128', cat: 'weather', date: '2026-09-11', level: 'province', region: '湖北 · 武汉', short: '秋汛预警', lat: 30.59, lng: 114.31, cred: 'high', impact: 'high', radius: 180, media: 'image', mediaNote: '水文预报图', prov: 'public', title: '长江中游秋汛预报，江汉平原稻田防涝', summary: '上游来水与本地降雨叠加，低洼田块提前排水。', evidence: [{ t: '水文预报通报', k: '通报', q: '汉口站水位 24.8 米，接近警戒。' }], objects: [vRice] },
    { id: 'F-PK-129', cat: 'trade', date: '2026-09-17', level: 'province', region: '云南 · 昆明', short: '斗南夜市', lat: 25.04, lng: 102.71, cred: 'high', impact: 'mid', radius: 130, media: 'image', mediaNote: '拍卖交易记录', prov: 'public', title: '昆明斗南花卉夜市单日成交 820 万枝', summary: '夜间拍卖高峰持续，玫瑰与满天星占主导。', evidence: [{ t: '拍卖交易统计', k: '统计', q: '成交 820 万枝，均价 0.84 元/枝。' }], objects: [vFlower, GT(29)] },
    { id: 'F-PK-130', cat: 'trade', date: '2026-09-18', level: 'province', region: '江苏 · 南通', short: '吕四带鱼', lat: 32.01, lng: 120.86, cred: 'mid', impact: 'low', radius: 130, media: 'image', mediaNote: '渔港到货记录', prov: 'public', title: '吕四渔港带鱼旺发，单日到港 2,400 吨', summary: '渔汛集中，冰鲜船满载返港，冷库预冷紧张。', evidence: [{ t: '渔港到货统计', k: '统计', q: '单日 2,400 吨，冰鲜船 86 艘。' }], objects: [vFish, GT(8)] }
  ];

  /* ---------- 关系：手工主干 + 就近补全（保证每个本体至少落在一条关系上） ---------- */
  const RAW = [];
  let relN = 0;
  const rel = (from, to, type, strength, confidence, formed, note) => {
    RAW.push({ id: 'R-PK-' + p3(++relN), from, to, type, strength, confidence, formed, note });
  };

  /* 基地—品种 */
  rel(RB(17), vDurian, '基地—品种', .90, .90, '2025-11', '劳勿产区主供猫山王。');
  rel(RB(20), vDurian, '基地—品种', .91, .89, '2025-10', '尖竹汶以金枕头为主力品种。');
  rel(RB(28), vCherry, '基地—品种', .89, .87, '2025-09', '中部山谷为车厘子核心产区。');
  rel(RB(29), vApple, '基地—品种', .84, .58, '2026-02', '奥希金斯以苹果与核果为主。');
  rel(RB(25), vSoy, '基地—品种', .93, .91, '2025-08', '马托格罗索为大豆最大产区。');
  rel(RB(26), vSugarcane, '基地—品种', .88, .86, '2025-04', '圣保罗蔗区糖醇联产。');
  rel(RB(27), vCoffee, '基地—品种', .87, .85, '2025-06', '米纳斯为阿拉比卡主产地。');
  rel(RB(31), vBlueberry, '基地—品种', .86, .83, '2026-03', '伊卡为秘鲁蓝莓核心产区。');
  rel(RB(35), vAvocado, '基地—品种', .90, .88, '2025-12', '米却肯为牛油果最大产区。');
  rel(RB(24), vBanana, '基地—品种', .85, .82, '2025-07', '达沃为菲律宾香蕉主产区。');
  rel(RB(23), vPalm, '基地—品种', .92, .90, '2025-05', '廖内为印尼油棕核心区。');
  rel(RB(18), vPalm, '基地—品种', .86, .55, '2025-05', '柔佛油棕与榴莲混作。');
  rel(RB(5), vWheat, '基地—品种', .90, .88, '2025-10', '华北平原为主麦区。');
  rel(RB(6), vVeg, '基地—品种', .92, .90, '2025-09', '寿光为设施蔬菜集散地。');
  rel(RB(7), vApple, '基地—品种', .89, .88, '2025-10', '烟台为渤海湾苹果主产区。');
  rel(RB(8), vApple, '基地—品种', .88, .87, '2025-10', '洛川为黄土高原苹果代表产区。');
  rel(RB(9), vOrange, '基地—品种', .87, .86, '2025-11', '赣南为脐橙最大产区。');
  rel(RB(3), vOrange, '基地—品种', .83, .81, '2025-11', '湘南脐橙带与赣南连片。');
  rel(RB(12), vOrange, '基地—品种', .82, .80, '2025-12', '眉山为晚熟柑橘优势区。');
  rel(RB(16), vPork, '基地—品种', .88, .86, '2025-09', '中原为生猪主产区。');

  /* 供应流向 */
  rel(RB(17), GT(34), '供应流向', .82, .78, '2026-05', '猫山王经空运主通道出岛。');
  rel(RB(20), GT(13), '供应流向', .81, .77, '2026-04', '东部榴莲经林查班海运出口。');
  rel(RB(28), GT(14), '供应流向', .84, .80, '2026-05', '车厘子经圣安东尼奥装船。');
  rel(RB(29), GT(15), '供应流向', .72, .54, '2026-02', '苹果由瓦尔帕莱索分批发运。');
  rel(RB(25), GT(16), '供应流向', .88, .85, '2025-09', '大豆经桑托斯主通道出口。');
  rel(RB(26), GT(16), '供应流向', .80, .78, '2025-04', '原糖经桑托斯装船。');
  rel(RB(30), GT(18), '供应流向', .79, .76, '2025-10', '牛肉经罗萨里奥河运出海。');
  rel(RB(31), GT(19), '供应流向', .83, .79, '2026-03', '蓝莓经钱凯直航对华。');
  rel(RB(22), GT(44), '供应流向', .80, .78, '2025-11', '大米经盖梅港出口。');
  rel(RB(21), GT(13), '供应流向', .74, .57, '2025-12', '茉莉香米小批量经海运。');
  rel(RB(1), mktHXJX, '供应流向', .76, .73, '2025-09', '洞庭湖稻米入湘北市场。');
  rel(RB(3), mktHXJX, '供应流向', .68, .65, '2025-11', '湘南柑橘错峰补市场空档。');
  rel(RB(6), mktHXJX, '供应流向', .79, .76, '2025-09', '寿光蔬菜南下补长沙缺口。');
  rel(cDurianMY, mktGQ, '供应流向', .85, .82, '2026-05', '出口联盟直发高桥市场。');
  rel(mktZJ, GT(4), '供应流向', .71, .68, '2025-08', '湛江水产经南沙港出海。');

  /* 贸易通道 */
  rel(GT(14), GT(1), '贸易通道', .86, .83, '2025-11', '车厘子冷链班轮直靠洋山。');
  rel(GT(15), GT(1), '贸易通道', .74, .56, '2025-12', '水果散货分流至洋山。');
  rel(GT(16), GT(5), '贸易通道', .82, .80, '2025-09', '南美大豆主力航线。');
  rel(GT(17), GT(2), '贸易通道', .78, .75, '2025-10', '玉米经宁波舟山上岸。');
  rel(GT(18), GT(4), '贸易通道', .72, .52, '2025-10', '豆粕经南沙中转。');
  rel(GT(19), GT(1), '贸易通道', .81, .79, '2026-03', '钱凯直航常态化。');
  rel(GT(13), GT(4), '贸易通道', .83, .81, '2025-09', '泰国水果主力进境航线。');
  rel(GT(12), GT(4), '贸易通道', .75, .72, '2025-09', '棕榈油经南沙进境。');
  rel(GT(11), GT(9), '贸易通道', .77, .74, '2025-08', '东南亚经新加坡中转香港。');
  rel(GT(34), GT(27), '贸易通道', .84, .82, '2026-04', '猫山王包机直飞长沙。');
  rel(GT(37), GT(28), '贸易通道', .80, .78, '2025-11', '车厘子空运主通道。');
  rel(GT(20), GT(21), '贸易通道', .68, .53, '2025-06', '欧洲内支线互为分拨。');

  /* 通道衔接 */
  rel(GT(1), mktHXJX, '通道衔接', .72, .70, '2025-09', '洋山冷链干线直达海吉星。');
  rel(GT(27), mktHXJX, '通道衔接', .78, .75, '2026-04', '机场货站直通一级市场。');
  rel(GT(27), mktGQ, '通道衔接', .74, .71, '2026-04', '进口水果经货站分拨高桥。');
  rel(GT(4), mktGQ, '通道衔接', .70, .51, '2025-09', '南沙冷柜夜发高桥。');
  rel(GT(3), mktGQ, '通道衔接', .69, .66, '2025-09', '盐田冷柜分流湖南。');
  rel(GT(2), mktHXJX, '通道衔接', .67, .64, '2025-10', '粮食散改集进长沙。');
  rel(GT(22), GT(23), '通道衔接', .76, .74, '2025-07', '双港分担旺季箱量。');
  rel(GT(26), GT(43), '通道衔接', .70, .55, '2025-08', '海空联运衔接仁川。');
  rel(GT(25), GT(11), '通道衔接', .73, .70, '2025-08', '非洲货经新加坡中转。');
  rel(GT(42), GT(11), '通道衔接', .71, .68, '2025-08', '澳新经新加坡中转。');

  /* 指标度量 */
  rel(vDurian, mDurian, '指标度量', .85, .82, '2026-05', '榴莲批发均价按日采集。');
  rel(vCherry, mCherry, '指标度量', .84, .81, '2025-11', '到岸均价随航线波动。');
  rel(vApple, mIndex, '指标度量', .76, .74, '2025-09', '苹果纳入批发价格指数。');
  rel(vVeg, mIndex, '指标度量', .82, .80, '2025-09', '蔬菜为指数主要权重。');
  rel(vWheat, mGrain, '指标度量', .78, .76, '2025-09', '小麦按收购价口径统计。');
  rel(mCold, GT(1), '指标度量', .72, .55, '2026-02', '冷链运价随口岸作业波动。');
  rel(mFreight, GT(16), '指标度量', .80, .78, '2025-09', '干散货运价跟踪南美航线。');
  rel(mDurian, mktGQ, '指标度量', .77, .74, '2026-05', '均价以主要市场报价为准。');

  /* 政策影响 */
  rel(agCustoms, vCherry, '政策影响', .66, .63, '2026-09', '检疫便利化压缩通关时效。');
  rel(agCustoms, vDurian, '政策影响', .68, .65, '2026-09', '指定口岸与包机航线扩围。');
  rel(agMoA, mIndex, '政策影响', .70, .68, '2026-09', '信息化试点统一指数口径。');
  rel(agHN, vVeg, '政策影响', .67, .64, '2026-09', '冷链设备入补降低流通成本。');
  rel(agHN, rgHN, '政策影响', .72, .70, '2026-08', '产业扶持向主产区倾斜。');
  rel(agCustoms, rgGD, '政策影响', .69, .66, '2026-09', '口岸扩容提升进口首站能力。');

  /* 区域归属 */
  rel(rgHN, RB(1), '区域归属', .88, .86, '2025-09', '洞庭湖平原为湖南粮仓。');
  rel(rgHN, RB(2), '区域归属', .74, .58, '2025-09', '长沙县茶产业纳入省域产业带。');
  rel(rgHN, RB(3), '区域归属', .80, .78, '2025-11', '湘南脐橙带属省水果产业布局。');
  rel(rgHN, RB(4), '区域归属', .76, .59, '2025-10', '湘西猕猴桃为山地特色板块。');
  rel(rgGD, GT(4), '区域归属', .82, .80, '2025-09', '南沙港属华南进口首站体系。');
  rel(rgGD, GT(3), '区域归属', .80, .78, '2025-09', '盐田港承担华南冷链分流。');
  rel(rgSD, RB(6), '区域归属', .84, .82, '2025-09', '寿光为山东蔬菜核心区。');
  rel(rgSD, RB(7), '区域归属', .82, .80, '2025-10', '烟台苹果为省果业支柱。');
  rel(rgGX, RB(14), '区域归属', .83, .81, '2025-09', '桂中为糖料蔗优势区。');
  rel(pBuyer, mktHXJX, '区域归属', .75, .72, '2026-06', '采购角色来自市场公开直播。');

  /* 经营主体主营 */
  rel(cDurianMY, vDurian, '经营主体主营', .89, .87, '2025-11', '出口联盟主营猫山王。');
  rel(cDurianTH, vDurian, '经营主体主营', .88, .86, '2025-10', '合作社主营金枕头。');
  rel(cSoyBR, vSoy, '经营主体主营', .90, .88, '2025-08', '贸易商主营大豆集货。');
  rel(cSugarBR, vSugarcane, '经营主体主营', .86, .84, '2025-04', '糖业集团主营原糖与乙醇。');
  rel(cAppleSN, vApple, '经营主体主营', .85, .83, '2025-10', '果业集团主营红富士购销。');
  rel(cAppleSN, RB(8), '经营主体主营', .79, .76, '2025-10', '集团在洛川设集货中心。');

  /* ---------- 覆盖补全：就近口岸 / 就近枢纽（确定性，无随机） ---------- */
  const RAD = Math.PI / 180, EARTH = 6371;
  const dist = (a, b) => {
    const dLat = (b.lat - a.lat) * RAD, dLng = (b.lng - a.lng) * RAD;
    const s = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * EARTH * Math.asin(Math.sqrt(s));
  };
  const objById = {}; OBJECTS.forEach(o => { objById[o.id] = o; });
  const covered = new Set();
  RAW.forEach(r => { covered.add(r.from); covered.add(r.to); });
  const nearestGate = (self, exclude) => gateObjs.reduce((best, g) => {
    if (g.id === (exclude || self)) return best;
    const d = dist(self, g);
    return !best || d < best.d ? { d, id: g.id } : best;
  }, null);
  let autoIdx = 0;
  OBJECTS.forEach(o => {
    if (covered.has(o.id)) return;
    autoIdx++;
    const lo = autoIdx % 3 === 0;   /* 低置信关系按确定性节奏分布 */
    if (o.domain === 'base' && o.geo) {
      const g = nearestGate(o);
      rel(o.id, g.id, '供应流向', .70, lo ? .56 : .72, '2026-01', '产区货量经就近口岸集散。');
    } else if (o.domain === 'facility' && o.geo) {
      const g = nearestGate(o, o.id);
      rel(o.id, g.id, '通道衔接', .66, lo ? .55 : .70, '2026-01', '相邻枢纽分担航线与堆场压力。');
    } else if (o.domain === 'variety') {
      const grain = o.id === vRice || o.id === vWheat || o.id === vCorn;
      rel(o.id, grain ? mGrain : mIndex, '指标度量', .72, lo ? .57 : .74, '2025-12', '纳入对应价格指数监测。');
    } else {
      rel(o.id, o.id === rgHN ? mktHXJX : rgHN, '区域归属', .70, lo ? .56 : .72, '2026-01', '与所在区域体系关联。');
    }
  });

  /* ---------- 关系 ↔ 事实自动接线：以对象共现为依据，确定性选取支撑事实 ---------- */
  const byObj = {};
  FACTS.forEach(f => (f.objects || []).forEach(id => { (byObj[id] = byObj[id] || []).push(f); }));
  Object.keys(byObj).forEach(k => byObj[k].sort((a, b) => (a.date < b.date ? 1 : -1)));
  const nearestFact = o => {
    if (!o || o.geo === false || o.lat == null) return FACTS[0];
    let best = null, bd = 1e9;
    FACTS.forEach(f => { const d = dist(o, f); if (d < bd) { bd = d; best = f; } });
    return best;
  };
  RAW.forEach(r => {
    const seen = new Set();
    const cand = (byObj[r.from] || []).concat(byObj[r.to] || []).filter(f => (seen.has(f.id) ? false : (seen.add(f.id), true)));
    r.factIds = cand.slice(0, 3).map(f => f.id);
    if (!r.factIds.length) {
      const f = nearestFact(objById[r.from]);
      r.factIds = [f.id];
    }
    r.changedBy = r.factIds[0];
    cand.forEach(f => { f.relations = f.relations || []; f.relations.push(r.id); });
  });

  return { REGIONS, GATES, PACK: { facts: FACTS, objects: OBJECTS, relations: RAW } };
})();
