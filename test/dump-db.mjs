/* Dump exactly what the page uses (fact layer + relation layer) so it can be loaded
   into a queryable SQLite database and audited row by row. */
import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const OUT = process.argv[2] || '/Users/guohui/agrilink-db/dump.json';
const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(pathToFileURL(path.resolve('index.html')).href);
await page.waitForFunction(() => window.__AGRI_READY);
await page.evaluate(() => { V03Feed.complete();V03Fact.finishAnimation?.(); V03Feed.stop(); });

const dump = await page.evaluate(() => {
  const D = V03Data, F = V03Filter;
  const facts = D.FACTS.map(f => {
    const path = f.regionPath || [];
    const country = path.find(p => p.level === 'country') || null;
    const province = path.find(p => p.level === 'province') || null;
    return {
      id: f.id, title: f.title, summary: f.summary || '', category: f.category || '', card_type: f.cardType || '',
      date: f.date || f.occurredAt || '', ingested_at: f.ingestedAt || '', level: f.level || '',
      province: f.province || (province && province.name) || '', city: f.city || '', county: f.county || '',
      country_code: country ? (country.code || '') : '', country_name: country ? (country.name || '') : '',
      lng: Number.isFinite(f.lng) ? f.lng : null, lat: Number.isFinite(f.lat) ? f.lat : null,
      cred: f.cred || '', impact: f.impact || '', data_mode: f.prov || '',
      source_url: f.sourceUrl || '', source_plugin: f.sourcePlugin || '',
      data_origin: (f.provenanceMeta || {}).dataOrigin || '', dataset: (f.provenanceMeta || {}).dataset || '',
      coordinate_meaning: (f.provenanceMeta || {}).coordinateMeaning || '',
      map_eligible: F.mapEligible(f) ? 1 : 0, feed_visible: (V03Feed.isFactVisible ? 1 : 1),
      region_path: JSON.stringify(path),
      evidence: JSON.stringify(f.evidence || [])
    };
  });
  const objects = F.objects().map(o => {
    const path = o.regionPath || [];
    const country = path.find(p => p.level === 'country') || null;
    return {
      id: o.id, name: o.name || '', domain: o.domain || '', type_name: o.typeName || '', sub: o.sub || '',
      lng: Number.isFinite(o.lng) ? o.lng : null, lat: Number.isFinite(o.lat) ? o.lat : null,
      country_code: country ? (country.code || '') : '', country_name: country ? (country.name || '') : '',
      source_url: o.sourceUrl || '', fact_count: (o.factIds || []).length,
      degree: D.relationsOf ? D.relationsOf(o.id).length : 0,
      region_path: JSON.stringify(path)
    };
  });
  const relations = D.RELATIONS.map(r => ({
    id: r.id, from_id: r.from, to_id: r.to, type: r.type, confidence: r.confidence,
    fact_ids: JSON.stringify(r.factIds || [])
  }));
  const meta = {
    total_facts: D.FACTS.length, total_objects: D.objects ? D.objects.length : null,
    relation_objects: objects.length, relations: relations.length,
    hash: (document.querySelector('meta[name="agri-build"]') || {}).content || '',
    app_version: (document.getElementById('appVer') || {}).textContent || '',
    build_meta: window.__BUILD_META__ || null
  };
  return {meta, facts, objects, relations};
});
dump.meta.page_errors = errors;
fs.writeFileSync(OUT, JSON.stringify(dump));
console.log(JSON.stringify({...dump.meta, bytes: fs.statSync(OUT).size}, null, 1));
await browser.close();
