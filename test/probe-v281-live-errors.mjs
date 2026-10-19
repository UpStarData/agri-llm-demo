/* Live error hunt for the 3 transient pageerrors the acceptance agent saw. */
import {chromium} from 'playwright';
const URL = 'https://upstardata.github.io/agri-llm-demo/latest/';
const b = await chromium.launch();
const p = await b.newPage({viewport: {width: 1440, height: 900}});
const errors = [], consoleErr = [], failed = [];
p.on('pageerror', e => errors.push({at: Math.round(Date.now() - t0), msg: e.message, stack: String(e.stack || '').split('\n')[1] || ''}));
p.on('console', m => { if (m.type() === 'error') consoleErr.push({at: Math.round(Date.now() - t0), text: m.text().slice(0, 200)}); });
p.on('requestfailed', r => failed.push({at: Math.round(Date.now() - t0), url: r.url().slice(0, 120), err: r.failure()?.errorText}));
p.on('response', r => { if (r.status() >= 400) failed.push({at: Math.round(Date.now() - t0), url: r.url().slice(0, 120), status: r.status()}); });
const t0 = Date.now();
await p.goto(URL, {waitUntil: 'load', timeout: 180000});
await p.waitForFunction(() => window.__AGRI_READY, null, {timeout: 180000});
// exercise the two layers, a 3D view and the media/stream paths for 35s
for (const tab of ['fact', 'relation']) {
  for (const level of ['L2', 'L3']) await p.evaluate(({tab, level}) => V03Store.set({tab, geo: {level, focus: level === 'L3' ? '湖南' : null}, rel: {view: 'geo', level, focus: level === 'L3' ? '湖南' : null}}), {tab, level});
  await p.evaluate(tab => V03Store.set({tab, sk: {mode3d: true}}), tab);
  await p.waitForTimeout(3000);
  await p.evaluate(tab => V03Store.set({tab, sk: {mode3d: false}}), tab);
}
await p.waitForTimeout(17000);
console.log(JSON.stringify({pageErrors: errors, consoleErrors: consoleErr, failedRequests: failed.slice(0, 12), failedCount: failed.length}, null, 1));
await b.close();
