/* Diagnostics for the 2026-10-16 feedback round: where do global / China map facts actually go? */
import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(pathToFileURL(path.resolve('index.html')).href);
await page.waitForFunction(() => window.__AGRI_READY);
await page.evaluate(() => V03Feed.complete());

const out = await page.evaluate(() => {
  const D = V03Data, F = V03Filter;
  const mapAll = F.mapFacts().filter(f => f.lng != null && f.lat != null);
  const provOf = f => f.province || (f.regionPath || []).find(p => p.level === 'province')?.name || null;
  const byProv = {};
  for (const f of mapAll) {
    const p = provOf(f);
    byProv[p || '(无省份)'] = (byProv[p || '(无省份)'] || 0) + 1;
  }
  const byLevel = {};
  for (const f of mapAll) byLevel[f.level || '(空)'] = (byLevel[f.level || '(空)'] || 0) + 1;
  const bySource = {};
  for (const f of mapAll) {
    const k = String(f.id).split(/[-:]/)[0];
    bySource[k] = (bySource[k] || 0) + 1;
  }
  const inChinaBox = mapAll.filter(f => f.lng >= 73 && f.lng <= 136 && f.lat >= 17.5 && f.lat <= 54.5).length;
  const byCountry = {};
  for (const f of mapAll) {
    const c = (f.regionPath || []).find(p => p.level === 'country');
    const k = c ? (c.name || c.code) : '(无国家)';
    byCountry[k] = (byCountry[k] || 0) + 1;
  }
  // how many facts carry province info at all
  const all = D.FACTS;
  const withProv = all.filter(provOf).length;
  const mapEligibleDropped = F.factsAtLevel().length - mapAll.length;
  return {
    totalFacts: all.length,
    visibleFacts: F.facts().length,
    scopeFactsL1: F.factsAtLevel({...V03Store.state, geo: {level: 'L1', focus: null}}).length,
    mapAll: mapAll.length,
    inChinaBox,
    byLevel, bySource,
    mapEligibleDropped,
    withProv, allWithProv: withProv,
    provinceCount: Object.keys(byProv).length,
    byProv: Object.fromEntries(Object.entries(byProv).sort((a, b) => b[1] - a[1])),
    countryCount: Object.keys(byCountry).length,
    byCountryTop: Object.fromEntries(Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 30))
  };
});
console.log(JSON.stringify({...out, errors}, null, 1));
fs.writeFileSync('test/artifacts/v28-coverage.json', JSON.stringify(out, null, 1));
await browser.close();
