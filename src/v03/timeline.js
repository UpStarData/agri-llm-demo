/* V2.9.3：时间轴组件
   - 默认 440px，鼠标移入展开到 1000px
   - 刻度只画“重要的天”（窗口内事实数达到阈值的那几天），所以刻度间距不相等
   - 选中时间范围后自动播放：红线从左跑到今天，日期跟着红线走，地图按 dayCursor 逐日长出来
   - 播放中可拖动红线：拖动即暂停，松手停在那一天；左侧出现播放按钮可继续
   - 跑完或取消 → 回到初始（dayCursor = null） */
window.V03Timeline = (() => {
  const S = () => window.V03Store;
  let host, track, ticksEl, fillEl, headEl, dateEl, playBtn;
  let days = [], t0 = 0, tEnd = 0, cur = 0, timer = 0, paused = false, started = false;

  const iso = ts => new Date(ts).toISOString().slice(0, 10);
  const todayTs = () => Date.parse(String((window.V03Data || {}).TODAY || iso(Date.now())) + 'T00:00:00Z');

  function spanDays() {
    const t = S().state.time;
    return ({ '7d': 7, '30d': 30, '180d': 180, '365d': 365, all: 365 })[t] || 30;
  }
  /* 窗口内每天的事实数 → 只留“重要的天”，最多 14 个刻度 */
  function computeDays() {
    const D = window.V03Data || {}, now = todayTs(), span = spanDays();
    const cnt = new Map();
    for (const f of (D.FACTS || [])) {
      const ds = String(f.date || '').slice(0, 10);
      const ts = Date.parse(ds + 'T00:00:00Z');
      if (!Number.isFinite(ts)) continue;
      const dd = (now - ts) / 86400000;
      if (dd < 0 || dd > span) continue;
      cnt.set(ds, (cnt.get(ds) || 0) + 1);
    }
    const all = [...cnt.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    if (!all.length) return [];
    const avg = all.reduce((s, x) => s + x[1], 0) / all.length;
    let imp = all.filter(([, c]) => c >= Math.max(2, Math.ceil(avg * .55)));
    if (imp.length > 14) imp = imp.slice(-14);
    if (imp.length < 2) imp = all.slice(-Math.min(7, all.length));
    return imp.map(([d]) => ({ date: d, ts: Date.parse(d + 'T00:00:00Z') }));
  }

  function xOf(ts) {
    const w = track.clientWidth || 440;
    if (tEnd <= t0) return 0;
    return Math.max(0, Math.min(w, (ts - t0) / (tEnd - t0) * w));
  }
  function tickAt(x) {
    const w = track.clientWidth || 440;
    const ts = t0 + (tEnd - t0) * (x / Math.max(1, w));
    if (!days.length) return iso(ts);
    let best = days[0];
    for (const d of days) if (Math.abs(d.ts - ts) < Math.abs(best.ts - ts)) best = d;
    return best.date;
  }

  function paintTicks() {
    /* 刻度按真实日期排布（所以间距不等）；标签太挤时只保留不互相压住的那几个 */
    let lastLabel = -999;
    ticksEl.innerHTML = days.map(d => {
      const x = xOf(d.ts);
      const showLabel = x - lastLabel >= 46;
      if (showLabel) lastLabel = x;
      return '<span class="tl-tick" style="left:' + x + 'px"><i></i>' +
        (showLabel ? '<b>' + d.date.slice(5) + '</b>' : '') + '</span>';
    }).join('');
  }
  function paintHead() {
    const x = xOf(cur);
    headEl.style.transform = 'translateX(' + x + 'px)';
    fillEl.style.width = x + 'px';
    dateEl.textContent = iso(cur);
  }
  function setCursor(dateStr, continuous) {
    if (continuous != null) {
      cur = Math.min(tEnd, Math.max(t0, continuous));
    } else {
      const ts = Date.parse(dateStr + 'T00:00:00Z');
      if (Number.isFinite(ts)) cur = Math.min(tEnd, Math.max(t0, ts));
    }
    paintHead();
    S().set({ dayCursor: dateStr });
  }
  function stop() { if (timer) cancelAnimationFrame(timer); timer = 0; }

  function play() {
    if (!days.length) days = computeDays();
    if (!days.length) return;
    t0 = days[0].ts; tEnd = todayTs();
    if (cur < t0 || cur >= tEnd) cur = t0;
    paused = false; started = true; host.classList.add('on', 'running'); host.classList.remove('paused');
    paintTicks(); paintHead();
    stop();
    let last = performance.now();
    const step = now => {
      const dt = now - last; last = now;
      cur = Math.min(tEnd, cur + dt * ((tEnd - t0) / 12000));   /* 12 秒跑完整个窗口 */
      setCursor(iso(cur), cur);
      if (cur < tEnd) timer = requestAnimationFrame(step);
      else { timer = 0; finish(); }
    };
    timer = requestAnimationFrame(step);
  }
  function finish() {
    host.classList.remove('running', 'paused', 'on');
    S().set({ dayCursor: null });
    cur = 0; started = false; paused = false;
  }
  function pause() {
    stop(); paused = true;
    host.classList.add('paused'); host.classList.remove('running');
  }

  function bind() {
    host = document.getElementById('timeline');
    if (!host) return;
    track = document.getElementById('tlTrack'); ticksEl = document.getElementById('tlTicks');
    fillEl = document.getElementById('tlFill'); headEl = document.getElementById('tlHead');
    dateEl = document.getElementById('tlDate'); playBtn = document.getElementById('tlPlay');

    playBtn.onclick = e => { e.stopPropagation(); play(); };
    headEl.addEventListener('pointerdown', e => {
      e.preventDefault(); headEl.setPointerCapture(e.pointerId);
      pause();
      const move = ev => {
        const r = track.getBoundingClientRect();
        setCursor(tickAt(Math.max(0, Math.min(r.width, ev.clientX - r.left))));
      };
      const up = () => { headEl.removeEventListener('pointermove', move); headEl.removeEventListener('pointerup', up); };
      headEl.addEventListener('pointermove', move); headEl.addEventListener('pointerup', up);
    });
    /* 时间范围变化由 app.js 的时间按钮显式调用 play()（订阅拿到的是补丁不是完整 state，会每帧重置） */
    days = computeDays();
    if (days.length) { t0 = days[0].ts; tEnd = todayTs(); }
    paintTicks();
  }

  function mount() { bind(); }
  return { mount, play, pause, days: () => days.slice() };
})();
