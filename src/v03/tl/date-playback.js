(function () {
  const DAY = 86400000;
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value + 'T00:00:00Z'))
    && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  // 日期回放只驱动日期；事实队列的直播节奏独立运行。
  class FactDatePlayback {
    constructor({ today, stepMs = 1200, onDateChange = () => {}, onStateChange = () => {} }) {
      this.today = today;
      this.selected = today;
      this.playing = false;
      this.stepMs = stepMs;
      this.onDateChange = onDateChange;
      this.onStateChange = onStateChange;
    }
    select(date) {
      this.pause();
      if (!validDate(date) || date > this.today) return false;
      this.selected = date;
      this.onDateChange(date);
      this.onStateChange(this);
      return true;
    }
    play() {
      this.pause();
      if (this.selected >= this.today) return;
      this.playing = true;
      this.onStateChange(this);
      this.schedule();
    }
    pause() {
      clearTimeout(this.timer);
      this.timer = null;
      this.playing = false;
      this.onStateChange(this);
    }
    schedule() {
      if (!this.playing) return;
      this.timer = setTimeout(() => {
        if (!this.playing) return;
        this.timer = null;
        const next = new Date(Date.parse(this.selected + 'T00:00:00Z') + DAY).toISOString().slice(0, 10);
        this.selected = next > this.today ? this.today : next;
        if (this.selected === this.today) this.playing = false;
        this.onDateChange(this.selected);
        this.onStateChange(this);
        this.schedule();
      }, this.stepMs);
    }
    updateToday(today) {
      if (!validDate(today) || this.today === today) return;
      const followedToday = this.selected === this.today;
      this.today = today;
      if (followedToday) this.select(today);
      else { this.onDateChange(this.selected); this.onStateChange(this); }
    }
  }
  window.FactDatePlayback = FactDatePlayback;
})();
