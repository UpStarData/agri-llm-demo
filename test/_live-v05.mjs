import { chromium } from 'playwright';
const URL = 'https://upstardata.github.io/agri-llm-demo-v05/';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const errs = [], perr = [];
p.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)); });
p.on('pageerror', e => perr.push(String(e).slice(0, 160)));
const t0 = Date.now();
await p.goto(URL, { waitUntil: 'load', timeout: 60000 });
await p.waitForFunction(() => window.__AGRI_READY === true, null, { timeout: 45000 });
await new Promise(r => setTimeout(r, 2500));
console.log('加载 ms', Date.now() - t0);
console.log(JSON.stringify(await p.evaluate(() => {
  const c = window.V03_DEBUG.counts(), f = window.V03Fact.debug(), st = window.V03DEBUG ? null : window.V03_DEBUG.state();
  return { build: window.__V03_BUILD.hash + '/' + window.__V03_BUILD.git,
    facts: c.facts, objects: c.objects, relations: c.relations, regions: c.regions, ports: c.ports, airports: c.airports,
    atLevel: c.factsAtLevel, mapSk: c.mapSk, legend: c.legendItems, topbar: window.V03_DEBUG.topbarHeight(),
    defaults: [st.time, st.cred, st.infl], videoEmbeddable: f.videoEmbeddable, videoPlayable: f.videoVerified };
})));
await new Promise(r => setTimeout(r, 3000));
console.log('视频 iframe:', await p.evaluate(() => document.querySelectorAll('#layer-fact iframe').length), '| frames:', p.frames().length);
await p.screenshot({ path: 'shots/v05b-20-live-default.png' });
await p.evaluate(() => window.V03_DEBUG.set({ tab: 'relation' }));
await new Promise(r => setTimeout(r, 3000));
console.log('关系层', JSON.stringify(await p.evaluate(() => { const r = window.V03Relation.debug(); return { nodes: r.nodes, mapped: r.mapped, unmapped: r.unmapped, edges: r.edges }; })));
await p.screenshot({ path: 'shots/v05b-21-live-relation.png' });
// 直播播放取证（https 下应挂载播放器）
await p.evaluate(() => { const f = window.V03Data.FACTS.find(x => window.V03Fact.isPlayable(x)); window.V03_DEBUG.set({ tab: 'fact', q: String(f.card.mediaTitle || '').slice(0, 4), time: 'all', cred: 'all', infl: 'all' }); });
await new Promise(r => setTimeout(r, 8000));
await p.screenshot({ path: 'shots/v05b-22-live-video.png' });
console.log('直播 iframe 数:', await p.evaluate(() => document.querySelectorAll('#layer-fact iframe').length));
const m = await ctx.newPage();
await m.setViewportSize({ width: 390, height: 844 });
await m.goto(URL, { waitUntil: 'load', timeout: 60000 });
await m.waitForFunction(() => window.__AGRI_READY === true, null, { timeout: 45000 });
await new Promise(r => setTimeout(r, 2000));
console.log('390 溢出:', await m.evaluate(() => window.V03_DEBUG.overflow()), '| topbar', await m.evaluate(() => window.V03_DEBUG.topbarHeight()));
console.log('控制台错误:', errs.length, errs.slice(0, 3), '| 未捕获:', perr.length, perr.slice(0, 2));
await b.close();
