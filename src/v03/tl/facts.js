(function () {
  const DAY = 86400000;
  const iso = date => date.toISOString().slice(0, 10);
  // 固定采用上海日历日，避免时区、夏令时和跨月减 30 天的误差。
  const todayKey = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const addDays = (key, days) => iso(new Date(Date.parse(key + 'T00:00:00Z') + days * DAY));
  /* V2.9.4：数据改为本项目真实事实（创建时间 = ingestedAt || date） */
  const createdKey = f => String(f.ingestedAt || f.date || '').slice(0, 10);
  const tagOf = f => { try { return window.V03Fact.tagOf(f); } catch (e) { return { label: '事实', color: '#B4A582' }; } };
  const varietyOf = f => { try { return window.V03Fact.varietyOf(f) || ''; } catch (e) { return ''; } };
  const cache = new Map();
  function getFacts(date) {
    if (!cache.has(date)) {
      const FACTS = (window.V03Data && V03Data.FACTS) || [];
      const hits = [];
      for (const f of FACTS) if (createdKey(f) === date) hits.push(f);
      hits.sort((a, b) => String(a.ingestedAt || a.date).localeCompare(String(b.ingestedAt || b.date)));
      cache.set(date, hits.slice(0, 80).map(f => {
        const tag = tagOf(f);
        return { id: f.id, date, category: tag.label, product: varietyOf(f),
                 summary: String(f.summary || f.title || ''), color: tag.color };
      }));
    }
    return cache.get(date);
  }
  const truncate = text => { const chars = Array.from(text); return chars.length > 12 ? chars.slice(0, 11).join('') + '…' : text; };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const randomBetween = (min, max) => min + Math.random() * (max - min);
  // 两个实例各自维持连发状态；下一次到达时间与每次上推动画分别随机。
  function nextPulse(outgoing, burstRemaining) {
    if (burstRemaining === 0 && Math.random() < (outgoing ? .3 : .48)) {
      burstRemaining = Math.floor(randomBetween(2, outgoing ? 4 : 6));
    }
    const burst = burstRemaining > 0;
    const lull = !burst && Math.random() < .16;
    const batchSize = burst ? Math.floor(randomBetween(outgoing ? 1 : 2, 5)) : 1;
    return {
      batchSize,
      burstRemaining: Math.max(0, burstRemaining - 1),
      delay: burst ? randomBetween(80, outgoing ? 260 : 200)
        : lull ? randomBetween(850, outgoing ? 1500 : 1100)
        : randomBetween(outgoing ? 160 : 80, outgoing ? 650 : 380),
      lead: outgoing ? randomBetween(35, 85) : randomBetween(0, 25),
      duration: (burst ? randomBetween(outgoing ? 340 : 300, outgoing ? 460 : 420)
        : randomBetween(outgoing ? 350 : 310, outgoing ? 500 : 450)) + (batchSize - 1) * 60,
      easing: outgoing
        ? `cubic-bezier(${randomBetween(.12, .24)},.64,.28,1)`
        : `cubic-bezier(${randomBetween(.12, .22)},.76,.3,1)`,
    };
  }
  class FactStream {
    constructor(root, outgoing) {
      this.root = root;
      this.outgoing = outgoing;
      this.track = root.querySelector('.fact-track');
      this.shards = root.querySelector('.fact-shards');
      this.animations = [];
      this.timers = [];
    }
    setData(data) {
      this.cancel();
      this.data = data;
      this.index = 0;
      this.track.replaceChildren();
      this.normalizeRows();
    }
    normalizeRows() {
      const count = Math.max(1, Math.floor(this.root.querySelector('.fact-viewport').clientHeight / 40));
      while (this.track.children.length > count) { this.track.lastElementChild.remove(); this.index--; }
      while (this.track.children.length < count) { if (this.append() == null) break; }
    }
    append(entering = false) {
      /* V2.9.4：当天没有新增事实时，data 为空 —— 空状态即可，不能因为取模 NaN 崩掉 */
      if (!this.data || !this.data.length) return null;
      const fact = this.data[this.index++ % this.data.length];
      const row = document.createElement('div');
      row.className = 'fact-row' + (this.outgoing ? ' is-outgoing' : '') + (entering && !reduced.matches ? ' entering' : '');
      row.dataset.factId = fact.id;
      for (const [className, value] of [['fact-tag', fact.category], ['fact-product', fact.product], ['fact-summary', truncate(fact.summary)]]) {
        const span = document.createElement('span');
        span.className = className;
        span.textContent = value;
        if (className === 'fact-tag') span.style.setProperty('--category', fact.color);
        if (className === 'fact-summary') span.title = fact.summary;
        row.append(span);
      }
      this.track.append(row);
      return row;
    }
    shatter(row, totalMs = 500) {
      const base = this.root.querySelector('.fact-viewport').getBoundingClientRect();
      const fragment = document.createDocumentFragment();
      for (const span of row.children) {
        const chars = Array.from(span.textContent);
        // 每个字分成上下两片，保留原文字形，再分别飞散。
        for (let i = 0; i < chars.length; i++) {
          const range = document.createRange();
          const start = chars.slice(0, i).join('').length;
          range.setStart(span.firstChild, start);
          range.setEnd(span.firstChild, start + chars[i].length);
          const rect = range.getBoundingClientRect();
          for (let part = 0; part < 2; part++) {
            const shard = document.createElement('span');
            shard.className = 'fact-shard';
            shard.textContent = chars[i];
            const dx = -randomBetween(18, 88);
            const dy = randomBetween(-22, 10);
            const delay = randomBetween(0, totalMs * .14);
            const duration = Math.max(100, totalMs - delay - randomBetween(20, 70));
            Object.assign(shard.style, {
              left: `${rect.left - base.left}px`, top: `${rect.top - base.top}px`,
              width: `${rect.width + 1}px`, height: `${rect.height}px`,
              font: getComputedStyle(span).font, lineHeight: `${rect.height}px`,
              clipPath: part ? 'inset(50% 0 0 0)' : 'inset(0 0 50% 0)',
            });
            shard.style.setProperty('--dx', `${dx}px`);
            shard.style.setProperty('--dy', `${dy}px`);
            shard.style.setProperty('--drift-x', `${dx * .28}px`);
            shard.style.setProperty('--drift-y', `${dy * .24}px`);
            shard.style.setProperty('--rotate', `${randomBetween(-24, 24)}deg`);
            shard.style.setProperty('--shatter-duration', `${duration}ms`);
            shard.style.animationDelay = `${delay}ms`;
            fragment.append(shard);
          }
        }
      }
      this.shards.append(fragment);
      row.classList.add('shattering');
    }
    start() {
      this.stop();
      this.active = true;
      this.burstRemaining = 0;
      this.queueNext();
    }
    stop() {
      this.active = false;
      clearTimeout(this.arrivalTimer);
      this.cancel();
    }
    queueNext() {
      if (!this.active) return;
      const pulse = nextPulse(this.outgoing, this.burstRemaining);
      this.burstRemaining = pulse.burstRemaining;
      this.arrivalTimer = setTimeout(() => {
        if (this.active) this.advance(pulse);
      }, pulse.delay);
    }
    advance(pulse) {
      this.cancel();
      this.normalizeRows();
      // 连发模拟到达量增大时，一整批向上推进；慢速仍逐条进出。
      const count = Math.min(pulse.batchSize, this.track.children.length);
      const departing = Array.from(this.track.children).slice(0, count);
      this.root.dataset.batchSize = String(count);
      if (reduced.matches) {
        departing.forEach(row => row.remove());
        for (let i = 0; i < count; i++) { if (this.append() == null) break; }
        this.arrivalTimer = setTimeout(() => { if (this.active) this.queueNext(); }, 1400);
        return;
      }
      this.pendingRows = [];
      for (let i = 0; i < count; i++) {
        const tail = this.append(true);
        const stagger = i * 18;
        tail.style.setProperty('--enter-duration', `${pulse.duration + pulse.lead - stagger}ms`);
        tail.style.animationDelay = `${stagger}ms`;
        this.pendingRows.push(tail);
      }
      this.shards.style.setProperty('--shatter-duration', `${Math.max(180, pulse.duration + pulse.lead - 35)}ms`);
      departing.forEach((row, i) => {
        const delay = i * 22 + randomBetween(0, 20);
        row.style.setProperty('--exit-delay', `${delay}ms`);
        row.style.setProperty('--exit-duration', `${pulse.duration + pulse.lead - delay}ms`);
        row.style.setProperty('--absorb-x', `${randomBetween(55, 95)}px`);
        if (this.outgoing) this.shatter(row, pulse.duration + pulse.lead); else row.classList.add('absorbing');
      });
      this.timers.push(setTimeout(() => {
        const animation = this.track.animate([
          { transform: 'translateY(0)' },
          { transform: `translateY(-${40 * count}px)` },
        ], { duration: pulse.duration, easing: pulse.easing, fill: 'forwards' });
        this.animations.push(animation);
        animation.onfinish = () => {
          departing.forEach(row => row.remove());
          animation.onfinish = null;
          animation.cancel();
          this.pendingRows = [];
          this.shards.replaceChildren();
          this.queueNext();
        };
      }, pulse.lead));
    }
    cancel() {
      if (this.pendingRows?.length) {
        this.index -= this.pendingRows.length;
        this.pendingRows.forEach(row => row.remove());
        this.pendingRows = [];
      }
      this.timers.forEach(clearTimeout); this.timers = [];
      this.animations.forEach(a => { a.onfinish = null; a.cancel(); }); this.animations = [];
      this.shards.replaceChildren();
      this.track.querySelectorAll('.absorbing,.shattering').forEach(row => row.classList.remove('absorbing', 'shattering'));
    }
  }
  const dateInput = document.querySelector('#fact-date');
  const axis = document.querySelector('#fact-range');
  const ticks = document.querySelector('.fact-axis-ticks');
  const todayButton = document.querySelector('#fact-today');
  const playButton = document.querySelector('#fact-play');
  const incoming = new FactStream(document.querySelector('#facts-in'), false);
  const outgoing = new FactStream(document.querySelector('#facts-out'), true);
  /* V2.9.5：数据里“今天”可能没有新增事实（当前数据到 2026-09-21 为止）。
     这种情况默认回落到“最近有事实的一天”，否则呼入区整块空白，看起来像坏了。 */
  function latestFactDay() {
    const FACTS = (window.V03Data && V03Data.FACTS) || [];
    const t = todayKey();
    const seen = new Set();
    for (const f of FACTS) { const k = String(f.ingestedAt || f.date || '').slice(0, 10); if (k && k <= t) seen.add(k); }
    if (!seen.size) return t;
    return [...seen].sort().pop();
  }
  let today = (() => { const t = todayKey(); return latestFactDay() === t ? t : t; })();
  let activeRange = null;
  let viewRange = null;
  function scheduleStreams() {
    incoming.stop();
    outgoing.stop();
    if (!document.hidden) { incoming.start(); outgoing.start(); }
  }
  function syncPlayback(state) {
    const isToday = state.selected === state.today;
    todayButton.setAttribute('aria-pressed', String(isToday));
    todayButton.classList.toggle('is-selected', isToday);
    playButton.textContent = state.playing ? 'Ⅱ' : '▷';
    playButton.setAttribute('aria-label', state.playing ? '暂停时间轴播放' : '播放时间轴');
    playButton.setAttribute('aria-pressed', String(state.playing));
    const host = document.getElementById('tlBar'); if (host) host.classList.toggle('is-replaying', state.playing);
  }
  function renderAxis(key) {
    const desiredStart = viewRange ? FactDateRange.startFor(today, viewRange) : addDays(today, -90);
    const start = key < desiredStart ? key : desiredStart;
    const plan = FactDateRange.axisPlan(start, today, document.querySelector('.fact-axis').clientWidth || 1040);
    const delta = Math.round((Date.parse(key) - Date.parse(today)) / DAY);
    axis.min = -plan.days;
    axis.value = delta;
    axis.setAttribute('aria-valuetext', key);
    ticks.replaceChildren();
    for (const item of plan.ticks) {
      const tick = document.createElement('i');
      tick.className = 'fact-axis-tick' + (item.major ? ' major' : '');
      tick.style.left = `calc(${item.percent}% - .5px)`;
      ticks.append(tick);
    }
    document.querySelector('.fact-axis-selected').style.left = `calc(${(delta + plan.days) / plan.days * 100}% - .5px)`;
    const labels = document.querySelector('.fact-axis-labels');
    labels.replaceChildren();
    for (const item of plan.labels) {
      const label = document.createElement('span');
      label.textContent = item.text;
      label.title = item.date;
      label.style.left = `${item.percent}%`;
      label.className = item.edge;
      labels.append(label);
    }
    document.querySelectorAll('[data-fact-range]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.factRange === activeRange));
    });
  }
  function renderDate(key) {
    // 到达今天立即退出预设选中态；保留显示范围，刻度不跳动。
    if (key === today) activeRange = null;
    dateInput.value = key;
    document.querySelector('#fact-next').disabled = key === today;
    const expired = addDays(key, -30);
    document.querySelector('#incoming-date').textContent = key.replaceAll('-', '.');
    document.querySelector('#outgoing-date').textContent = expired.replaceAll('-', '.');
    document.querySelector('#incoming-date').dateTime = key;
    document.querySelector('#outgoing-date').dateTime = expired;
    try { window.V03Store && V03Store.set({ dayCursor: key === today ? null : key }); } catch (e) {}
    /* V2.9.5：所选那天没有新增时，往前找最近 7 天里有数据的一天来展示（标签同步显示真实日期），避免整块空白 */
    let inKey = key, inData = getFacts(key);
    for (let d = 1; d <= 7 && !inData.length; d++) {
      const alt = addDays(key, -d);
      const altData = getFacts(alt);
      if (altData.length) { inKey = alt; inData = altData; break; }
    }
    document.querySelector('#incoming-date').textContent = inKey.replaceAll('-', '.');
    document.querySelector('#incoming-date').dateTime = inKey;
    incoming.setData(inData);
    outgoing.setData(getFacts(expired));
    renderAxis(key);
    scheduleStreams();
  }
  const playback = new FactDatePlayback({ today, onDateChange: renderDate, onStateChange: syncPlayback });
  function manualSelect(key) {
    if (viewRange && key < FactDateRange.startFor(today, viewRange)) {
      activeRange = null;
      viewRange = null;
    }
    return playback.select(key);
  }
  document.querySelectorAll('[data-fact-range]').forEach(button => {
    button.onclick = () => {
      activeRange = button.dataset.factRange;
      viewRange = activeRange;
      playback.select(FactDateRange.startFor(today, activeRange));
      playback.play();
    };
  });
  const axisResize = new ResizeObserver(() => renderAxis(playback.selected));
  axisResize.observe(document.querySelector('.fact-axis'));
  dateInput.max = today;
  /* 数据是启动后适配进来的：等就绪后再定位到“最近有事实的一天” */
  function seedInitial() {
    const seed = latestFactDay();
    playback.select(seed);
    dateInput.value = seed;
    renderDate(seed);
  }
  if (window.__AGRI_READY) seedInitial(); else setTimeout(seedInitial, 600);
  dateInput.addEventListener('pointerdown', () => playback.pause());
  dateInput.addEventListener('keydown', () => playback.pause());
  dateInput.addEventListener('change', () => {
    if (!dateInput.validity.valid || !dateInput.value || !manualSelect(dateInput.value)) dateInput.value = playback.selected;
  });
  axis.addEventListener('pointerdown', () => playback.pause());
  axis.addEventListener('keydown', () => playback.pause());
  axis.addEventListener('input', () => manualSelect(addDays(today, Number(axis.value))));
  document.querySelector('#fact-prev').onclick = () => manualSelect(addDays(playback.selected, -1));
  document.querySelector('#fact-next').onclick = () => manualSelect(addDays(playback.selected, 1));
  todayButton.onclick = () => playback.select(today);
  playButton.onclick = () => playback.playing ? playback.pause() : playback.play();
  document.addEventListener('visibilitychange', () => {
    const latest = todayKey();
    if (today !== latest) {
      today = latest;
      dateInput.max = today;
      playback.updateToday(today);
    }
    if (document.hidden) playback.pause();
    scheduleStreams();
  });
  playback.select(today);
  // 接入真实数据时替换 getFacts(date)，两侧继续共享同一个按日期查询的事实源。
})();
