/* 独立重写的驱动逻辑。只渲染可见刻度，支持长时间运行。 */
(function () {
  class RecordingTimeline {
    constructor(root, { compact = false, pixelsPerSecond = 10 } = {}) {
      this.root = root;
      this.compact = compact;
      this.pixelsPerSecond = pixelsPerSecond;
      this.elapsed = 0;
      this.startedAt = null;
      this.frame = 0;
      root.classList.add('recording-timeline');
      root.classList.toggle('recording-timeline--compact', compact);
      root.innerHTML = '<div class="recording-timeline__time" role="timer">00:00:00</div><div class="recording-timeline__wrapper" aria-hidden="true"><div class="recording-timeline__indicator"></div><div class="recording-timeline__scale"></div><div class="recording-timeline__fade"></div><div class="recording-timeline__baseline"></div></div>';
      this.time = root.querySelector('.recording-timeline__time');
      this.scale = root.querySelector('.recording-timeline__scale');
      this.tick = this.tick.bind(this);
      this.observer = new ResizeObserver(() => { this.range = ''; this.render(); });
      this.observer.observe(root);
      this.render();
    }
    get seconds() {
      return this.elapsed + (this.startedAt === null ? 0 : (performance.now() - this.startedAt) / 1000);
    }
    render() {
      const seconds = this.seconds;
      const total = Math.floor(seconds);
      this.time.textContent = [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60].map(n => String(n).padStart(2, '0')).join(':');
      const spacing = this.compact ? 6 : 10;
      const offset = seconds * this.pixelsPerSecond * (this.compact ? 0.6 : 1);
      const first = Math.floor(offset / spacing);
      const count = Math.ceil(this.root.clientWidth / spacing) + 3;
      const range = `${first}:${count}`;
      if (range !== this.range) {
        this.range = range;
        const fragment = document.createDocumentFragment();
        for (let i = first; i <= first + count; i++) {
          const mark = document.createElement('div');
          const size = i === 0 ? 'origin' : i % 10 === 0 ? 'large' : i % 5 === 0 ? 'medium' : '';
          mark.className = 'recording-timeline__mark' + (size ? ` recording-timeline__mark--${size}` : '');
          mark.style.left = `${(i - first) * spacing}px`;
          fragment.appendChild(mark);
        }
        this.scale.replaceChildren(fragment);
      }
      this.scale.style.transform = `translateX(${first * spacing - offset}px)`;
    }
    tick() {
      this.render();
      if (this.startedAt !== null) this.frame = requestAnimationFrame(this.tick);
    }
    start() {
      if (this.startedAt !== null) return;
      this.startedAt = performance.now();
      this.tick();
    }
    pause() {
      this.elapsed = this.seconds;
      this.startedAt = null;
      cancelAnimationFrame(this.frame);
      this.render();
    }
    reset() {
      this.pause();
      this.elapsed = 0;
      this.render();
    }
    setTime(seconds) {
      this.elapsed = Math.max(0, Number(seconds) || 0);
      if (this.startedAt !== null) this.startedAt = performance.now();
      this.render();
    }
    destroy() {
      this.pause();
      this.observer.disconnect();
    }
  }
  window.RecordingTimeline = RecordingTimeline;
})();
