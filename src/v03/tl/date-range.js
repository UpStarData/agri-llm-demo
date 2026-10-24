(function () {
  const DAY = 86400000;
  const parse = key => new Date(key + 'T00:00:00Z');
  const format = date => date.toISOString().slice(0, 10);
  const shiftDays = (key, days) => format(new Date(parse(key).getTime() + days * DAY));
  function shiftMonths(key, months) {
    const date = parse(key);
    const day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + months);
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(day, lastDay));
    return format(date);
  }
  function startFor(today, preset) {
    if (preset === '7') return shiftDays(today, -7);
    if (preset === '30') return shiftDays(today, -30);
    return shiftMonths(today, preset === 'half' ? -6 : -12);
  }
  function axisPlan(start, end, width = 1040) {
    const days = Math.round((parse(end) - parse(start)) / DAY);
    const ticks = [];
    for (let offset = 0; offset <= days; offset++) {
      const key = shiftDays(start, offset);
      const firstOfMonth = key.endsWith('-01');
      if (days <= 31 || offset % 7 === 0 || firstOfMonth || offset === days) {
        ticks.push({ percent: offset / days * 100, major: days > 60 ? firstOfMonth : offset % (days <= 7 ? 1 : 7) === 0 });
      }
    }
    // 长区间以月份标注；根据实际宽度剔除相邻标签，保留首尾边界。
    const gap = width < 500 ? 70 : 92;
    const long = days > 60;
    const candidates = [];
    for (let offset = 1; offset < days; offset++) {
      const key = shiftDays(start, offset);
      if (long ? key.endsWith('-01') : offset % (days <= 7 ? 1 : 7) === 0) candidates.push({ key, offset });
    }
    const labels = [{ key: start, offset: 0 }];
    for (const label of candidates) {
      if ((label.offset - labels.at(-1).offset) / days * width >= gap && (days - label.offset) / days * width >= gap) labels.push(label);
    }
    labels.push({ key: end, offset: days });
    return {
      days,
      ticks,
      labels: labels.map((label, i) => ({
        date: label.key,
        percent: label.offset / days * 100,
        text: long ? label.key.slice(0, 7).replace('-', '.') : label.key.slice(5).replace('-', '.'),
        edge: i === 0 ? 'first' : i === labels.length - 1 ? 'last' : '',
      })),
    };
  }
  window.FactDateRange = { startFor, axisPlan };
})();
