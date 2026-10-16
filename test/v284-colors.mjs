/* V2.8.4 一级分类配色验收：
   ① 事实层所有点按 F3 一级分类填充，色值来自主题变量；
   ② 关联层所有本体按 PRD 一级本体分类填充；
   ③ 关系线按一级本体分类着色（同一类型同色）；
   ④ 图谱与地图的本体/关系色值一一对应。 */
import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const browser = await chromium.launch();
const report = {errors: []};
fs.mkdirSync('test/artifacts/v284', {recursive: true});
try {
  const page = await browser.newPage({viewport: {width: 1440, height: 900}});
  page.on('pageerror', e => report.errors.push(e.message));
  await page.goto(pathToFileURL(path.resolve(process.env.AGRI_TEST_HTML || 'index.html')).href);
  await page.waitForFunction(() => window.__AGRI_READY);
  await page.evaluate(() => { V03Feed.complete(); V03Feed.stop(); V03Store.set({tab: 'fact', time: 'all', geo: {level: 'L1', focus: null}}); });
  await page.waitForTimeout(600);

  report.factLayer = await page.evaluate(() => {
    window.__factClassCounts = V03Filter.facts().reduce((a, f) => { const leaf = V03Filter.leafOf(f); const g = (V03Filter.FACT_TREE || []).find(x => (x.subs || []).some(sb => (sb.items || []).some(it => it.key === (leaf || {}).key))); const k = g ? g.key : 'unknown'; a[k] = (a[k] || 0) + 1; return a; }, {});
    const expected = key => V03Theme.fact(key);
    const groupKey = f => {
      const leaf = V03Filter.leafOf(f);
      const g = (V03Filter.FACT_TREE || []).find(x => (x.subs || []).some(sb => (sb.items || []).some(it => it.key === (leaf || {}).key)));
      return g ? g.key : null;
    };
    const series = echarts.getInstanceByDom(document.querySelector('#factMap')).getOption().series.find(s => s.id === 'facts');
    const rows = series.data.map(pt => {
      const f = V03Data.factById(pt.id);
      const key = f ? groupKey(f) : null;
      return {id: pt.id, key, color: (pt.itemStyle || {}).color, want: key ? expected(key) : null};
    });
    const distinct = new Set(rows.map(r => r.color));
    return {
      points: rows.length,
      distinctColors: distinct.size,
      palette: V03Theme.factList,
      byClass: [...distinct].map(c => ({color: c, isClassColor: V03Theme.factList.includes(c)})),
      mismatches: rows.filter(r => r.want && r.color !== r.want).slice(0, 5),
      unmapped: rows.filter(r => !r.key).length,
      classCounts: window.__factClassCounts
    };
  });
  assert(report.factLayer.mismatches.length === 0, JSON.stringify(report.factLayer.mismatches));
  assert(report.factLayer.byClass.every(c => c.isClassColor), JSON.stringify(report.factLayer.byClass));
  assert(report.factLayer.distinctColors >= 5, '至少 5 个一级事实分类同时可见: ' + report.factLayer.distinctColors);
  await page.screenshot({path: 'test/artifacts/v284/fact-l1.png'});

  report.relationLayer = await page.evaluate(() => {
    V03Store.set({tab: 'relation', rel: {view: 'geo', level: 'L1', focus: null, sel: null, kind: null, stack: []}});
    return null;
  });
  await page.waitForTimeout(900);
  report.relationLayer = await page.evaluate(() => {
    const opt = echarts.getInstanceByDom(document.querySelector('#relCanvas')).getOption();
    const nodes = opt.series.find(s => s.id === 'relNode').data;
    const lines = opt.series.filter(s => s.id === 'relLine' || s.id === 'relFocusLine').flatMap(s => s.data || []);
    const want = o => V03Theme.obj(V03Filter.relClass(o));
    const nodeRows = nodes.map(n => { const o = V03Data.objById(n.objId) || n; return {id: n.objId, color: (n.itemStyle || {}).color, want: o ? want(o) : null, cls: o ? V03Filter.relClass(o) : null}; });
    const lineRows = lines.map(l => ({id: l.id, type: V03Data.relById(l.id)?.type, color: (l.lineStyle || {}).color}));
    const typeColors = new Map();
    lineRows.forEach(l => { if (l.type) typeColors.set(l.type, new Set([...(typeColors.get(l.type) || []), l.color])); });
    return {
      nodeCount: nodeRows.length, lineCount: lineRows.length,
      nodeMismatch: nodeRows.filter(n => n.want && n.color !== n.want).slice(0, 4),
      nodeClasses: [...new Set(nodeRows.map(n => n.cls))],
      dataClasses: [...new Set(V03Filter.objects().map(o => V03Filter.relClass(o)))],
      classCounts: V03Filter.objects().reduce((a, o) => { const c = V03Filter.relClass(o); a[c] = (a[c] || 0) + 1; return a; }, {}),
      dataClassCoverage: V03Filter.objects().length,
      lineColors: [...new Set(lineRows.map(l => l.color))],
      objectPalette: V03Theme.objList,
      multiColorTypes: [...typeColors.entries()].filter(([, set]) => set.size > 1).map(([t]) => t),
      typeClasses: [...new Set(lineRows.map(l => l.type ? V03Filter.relationTypeClass(l.type) : null))].filter(Boolean)
    };
  });
  assert(report.relationLayer.nodeMismatch.length === 0, JSON.stringify(report.relationLayer.nodeMismatch));
  // 当前视野按连接度取样，未必四类同时出现；要求画面内 ≥2 类、且全库四类都有本体且映射正确
  assert(report.relationLayer.nodeClasses.length >= 2, JSON.stringify(report.relationLayer.nodeClasses));
  // 事件类本体在 V2.5 按用户要求清掉了气象伪本体后暂时为空，因此这里只要求 ≥3 类有本体，
  // 并把每类数量记下来（事件类目前 0 个，画面上不会出现该类颜色）。
  assert(report.relationLayer.dataClasses.length >= 3, JSON.stringify(report.relationLayer.classCounts));
  assert(report.relationLayer.lineColors.every(c => report.relationLayer.objectPalette.includes(c)), JSON.stringify(report.relationLayer.lineColors));
  assert(report.relationLayer.multiColorTypes.length === 0, '同一关系类型出现多色: ' + JSON.stringify(report.relationLayer.multiColorTypes));
  await page.screenshot({path: 'test/artifacts/v284/relation-map.png'});

  // ④ 图谱 vs 地图：本体点与关系线色值必须一致
  report.graphVsMap = await page.evaluate(() => {
    const map = echarts.getInstanceByDom(document.querySelector('#relCanvas')).getOption();
    const mapNodes = new Map(map.series.find(s => s.id === 'relNode').data.map(n => [n.objId, (n.itemStyle || {}).color]));
    const mapLines = new Map(map.series.filter(s => s.id === 'relLine' || s.id === 'relFocusLine').flatMap(s => s.data || []).map(l => [l.id, (l.lineStyle || {}).color]));
    V03Store.set({rel: {view: 'graph', level: 'L1', focus: null, sel: null, kind: null, stack: []}});
    return {mapNodes: [...mapNodes.entries()].slice(0, 400), mapLines: [...mapLines.entries()], mapNodeCount: mapNodes.size, mapLineCount: mapLines.size};
  });
  await page.waitForTimeout(900);
  report.graphVsMap = await page.evaluate(prev => {
    const g = echarts.getInstanceByDom(document.querySelector('#relCanvas')).getOption().series.find(s => s.id === 'relGraph');
    const mapNodes = new Map(prev.mapNodes);
    const mapLines = new Map(prev.mapLines);
    const nodeDiffs = g.data.filter(n => mapNodes.has(n.id) && (n.itemStyle || {}).color !== mapNodes.get(n.id)).map(n => ({id: n.id, graph: n.itemStyle.color, map: mapNodes.get(n.id)}));
    const linkDiffs = (g.links || []).filter(l => mapLines.has(l.id) && (l.lineStyle || {}).color !== mapLines.get(l.id)).map(l => ({id: l.id, graph: l.lineStyle.color, map: mapLines.get(l.id)}));
    return {graphNodes: g.data.length, graphLinks: (g.links || []).length, nodeDiffs: nodeDiffs.slice(0, 5), linkDiffs: linkDiffs.slice(0, 5),
      graphNodeColors: [...new Set(g.data.map(n => (n.itemStyle || {}).color))], graphLinkColors: [...new Set((g.links || []).map(l => (l.lineStyle || {}).color))]};
  }, report.graphVsMap);
  assert(report.graphVsMap.nodeDiffs.length === 0, JSON.stringify(report.graphVsMap.nodeDiffs));
  assert(report.graphVsMap.linkDiffs.length === 0, JSON.stringify(report.graphVsMap.linkDiffs));
  await page.screenshot({path: 'test/artifacts/v284/relation-graph.png'});

  // 菜单图例与地图同色（一级分类色板出处一致）
  report.legend = await page.evaluate(() => {
    V03Store.set({tab: 'fact', menu: true, geo: {level: 'L1', focus: null}});
    return null;
  });
  await page.waitForTimeout(600);
  report.legend = await page.evaluate(() => {
    const swatches = [...document.querySelectorAll('#menuBody .mn-l1 i')].map(i => getComputedStyle(i).backgroundColor);
    const toHex = rgb => '#' + rgb.match(/\d+/g).slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('');
    return {factLegend: swatches.map(toHex), palette: V03Theme.factList};
  });
  assert(report.legend.factLegend.every(h => report.legend.palette.includes(h)), JSON.stringify(report.legend));
  await page.screenshot({path: 'test/artifacts/v284/legend-fact.png'});
  await page.evaluate(() => V03Store.set({tab: 'relation', rel: {view: 'geo', level: 'L1', focus: null}, menu: true}));
  await page.waitForTimeout(600);
  report.legend.relationLegend = await page.evaluate(() => {
    const toHex = rgb => '#' + rgb.match(/\d+/g).slice(0, 3).map(n => (+n).toString(16).padStart(2, '0')).join('');
    return [...document.querySelectorAll('#menuBody .mn-l1 i')].map(i => toHex(getComputedStyle(i).backgroundColor));
  });
  assert(report.legend.relationLegend.every(h => report.relationLayer.objectPalette.includes(h)), JSON.stringify(report.legend.relationLegend));
  await page.screenshot({path: 'test/artifacts/v284/legend-relation.png'});

  assert.deepEqual(report.errors, []);
  console.log(JSON.stringify(report, null, 1));
} finally {
  fs.writeFileSync('test/artifacts/v284/colors.json', JSON.stringify(report, null, 1));
  await browser.close();
}
