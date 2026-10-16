/* 用户提供直播源核查：HTTP/HLS 清单 + Chromium 实际解码验证。
   产出 data/pkg2/v23-stream-validation.json（可达性与清单轨迹）与
   data/pkg2/v23-browser-media-validation.json 的 streams 段（是否真的解码出画）。
   清单来自用户附件《港口机场清单、直播源清单》。 */
import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');
const CANDIDATES = JSON.parse(fs.readFileSync('data/pkg2/v23-stream-candidates.json', 'utf8'));
const VALID = 'data/pkg2/v23-stream-validation.json';
const BROWSER = 'data/pkg2/v23-browser-media-validation.json';
const checkedAt = new Date().toISOString();
const hls = fs.readFileSync('vendor/hls.min.js', 'utf8');

const found = [];
for (const c of CANDIDATES) {
  const res = await fetch(c.url, {redirect: 'follow', headers: {'User-Agent': 'Mozilla/5.0'}}).catch(e => ({ok: false, err: String(e)}));
  let body = '', cors = '', type = '';
  if (res && res.ok) {
    cors = res.headers.get('access-control-allow-origin') || '';
    type = res.headers.get('content-type') || '';
    body = await res.text().catch(() => '');
  }
  const playable = body.includes('#EXTM3U');
  const variant = (body.match(/^(?!#)(\S+\.m3u8.*)$/m) || [])[1];
  found.push({country: c.country, name: c.name, url: c.url, playable,
    ...(playable ? {} : {error: res && res.err ? res.err : `HTTP ${res ? res.status : 'n/a'}`}),
    checkedAt, cors: cors || 'none', contentType: type,
    trace: [{url: c.url, status: res ? res.status : 0, cors: cors || 'none', contentType: type}],
    ...(variant ? {variant} : {})});
  console.log(`${playable ? 'PLAYLIST' : 'none    '} ${c.name} (${c.country}) cors=${cors || 'none'}`);
}
fs.writeFileSync(VALID, JSON.stringify(found, null, 1) + '\n');

// Chromium: 用页面同一套 hls.js 真解码，只有出画才算“可用”
const browser = await chromium.launch();
const streams = [];
for (const c of CANDIDATES) {
  const page = await browser.newPage({viewport: {width: 640, height: 360}});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setContent('<html><body><video id="v" muted playsinline></video></body></html>');
  await page.addScriptTag({content: hls});
  const outcome = await page.evaluate(async (url) => {
    const v = document.getElementById('v');
    if (v.canPlayType('application/vnd.apple.mpegurl')) { v.src = url; }
    else if (window.Hls && window.Hls.isSupported()) {
      const h = new window.Hls({maxBufferLength: 6, capLevelToPlayerSize: true});
      h.loadSource(url); h.attachMedia(v);
    } else return {played: false, reason: 'no hls support'};
    try { await v.play(); } catch (e) { /* autoplay may need the wait below */ }
    const t0 = performance.now();
    while (performance.now() - t0 < 20000) {
      if (v.videoWidth > 0 && v.currentTime > 0) return {played: true, width: v.videoWidth, time: v.currentTime, decoders: document.querySelectorAll('video').length, iframes: 0};
      await new Promise(r => setTimeout(r, 400));
    }
    return {played: false, reason: 'no frame within 20s'};
  }, c.url);
  streams.push({id: 'candidate:' + c.name + ':' + c.country, title: `${c.name} · 农业/自然公开直播`, url: c.url, country: c.country, ...outcome, ...(errors.length ? {errors} : {})});
  console.log(`BROWSER  ${outcome.played ? 'PLAYED' : 'failed'} ${c.name} ${outcome.width || ''} ${outcome.time ? outcome.time.toFixed(1) + 's' : (outcome.reason || '')}`);
  await page.close();
}
await browser.close();

const prev = fs.existsSync(BROWSER) ? JSON.parse(fs.readFileSync(BROWSER, 'utf8')) : {};
fs.writeFileSync(BROWSER, JSON.stringify({...prev, streams, checkedAt}, null, 1) + '\n');
console.log(JSON.stringify({screened: found.length, playlistOk: found.filter(f => f.playable).length, browserPlayed: streams.filter(s => s.played).length}));
