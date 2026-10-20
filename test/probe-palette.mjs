import {chromium} from 'playwright';import {pathToFileURL} from 'node:url';import path from 'node:path';import fs from 'node:fs';import os from 'node:os';
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:900}});
await p.goto(pathToFileURL(path.resolve('index.html')).href);await p.waitForFunction(()=>window.__AGRI_READY);
const out = await p.evaluate(()=>{
  const T=V03Theme, F=V03Filter, D=V03Data;
  const factGroups=(F.FACT_TREE||[]).map(g=>({key:g.key,n:g.n,hex:g.color,
    subs:(g.subs||[]).map(s=>({n:s.n,items:(s.items||[]).map(i=>i.n)}))}));
  const objGroups=(F.REL_TREE||[]).map(g=>({n:g.n,hex:g.color,
    kinds:(g.subs||[]).flatMap(s=>(s.items||[]).map(i=>i.key))}));
  const counts={};D.RELATIONS.forEach(r=>{counts[r.type]=(counts[r.type]||0)+1});
  const relTypes=[...new Set(D.RELATIONS.map(r=>r.type))].sort((a,b)=>a.localeCompare(b,'zh-CN')).map(t=>({
    type:t,cls:F.relationTypeClass(t),hex:F.relationTypeColor(t),count:counts[t]||0}));
  const overlay={regions:'#4d7c0f',ports:'#0369a1',airports:'#0f766e',markets:'#a16207',risks:'#b91c1c'};
  return {facts:T.factList,objs:T.objList,factGroups,objGroups,relTypes,overlay,
    cssVars:{fact:T.factOrder.map((k,i)=>[`--fact-l1-${i+1}`,T.fact(k)]),obj:T.objOrder.map((k,i)=>[`--obj-l1-${i+1}`,T.obj(k)])}};
});
const DB_DIR = process.env.AGRILINK_DB_DIR || path.join(os.homedir(), 'agrilink-db');
fs.writeFileSync(path.join(DB_DIR, 'palette.json'), JSON.stringify(out,null,1));
console.log(JSON.stringify({facts:out.facts,objs:out.objs,relTypes:out.relTypes.length,
  relByHex:out.relTypes.reduce((a,r)=>{a[r.hex]=(a[r.hex]||0)+1;return a;},{}),
  factGroups:out.factGroups.map(g=>[g.n,g.hex]),objGroups:out.objGroups.map(g=>[g.n,g.hex,g.kinds.length])},null,1));
const csv=[['层','一级分类','二级/关系类型','色值','说明']];
out.factGroups.forEach(g=>csv.push(['事实层','一级事实分类',g.n,g.hex,'事实点填充/光晕/3D 点/菜单图例']));
out.objGroups.forEach(g=>csv.push(['关联层','一级本体分类',g.n,g.hex,'本体点填充（地图+图谱）']));
out.relTypes.forEach(r=>csv.push(['关联层','关系线（按一级本体分类）',r.type,r.hex,`${r.cls} · ${r.count} 条`]));
csv.push(['叠加图层','产区','🌾','#4d7c0f','emoji 图标']);
csv.push(['叠加图层','港口','⚓','#0369a1','emoji 图标']);
csv.push(['叠加图层','机场','✈️','#0f766e','emoji 图标']);
csv.push(['叠加图层','农贸市场','🏪','#a16207','emoji 图标']);
csv.push(['叠加图层','地缘风险区','⚠️','#b91c1c','emoji 图标']);
fs.writeFileSync(path.join(DB_DIR, 'agrilink-color-spec.csv'),'\ufeff'+csv.map(r=>r.join(',')).join('\n')+'\n');
console.log('csv rows',csv.length);
await b.close();
