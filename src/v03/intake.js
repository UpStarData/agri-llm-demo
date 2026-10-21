/* Shared arrival presentation. Replay and real ingestion use the same event path. */
window.V03Intake = (() => {
  const timers = new WeakMap();
  /* V3.5：按要求去掉顶部中间的灵动岛通知；新事实只做地图亮星 + 「今日新增事实」+1 */
  function note(host, kind, title, factId) {
    if (window.V03App && V03App.bumpToday) V03App.bumpToday();
    return null;
  }
  function star(host, point, id, bright = true) {
    if (!host || !point || !point.every(Number.isFinite)) return false;
    const [x, y] = point, box = host.getBoundingClientRect();
    if (x < 0 || y < 0 || x > box.width || y > box.height) return false;
    // Keep a burst bounded; existing stars finish their own animation.
    const active = host.querySelectorAll('.star-flash');
    active.forEach(n=>{if(n.dataset.fid===id)n.remove();});
    if (active.length >= 6) active[0].remove();
    const node = document.createElement('div');
    node.className = 'star-flash ' + (bright ? 'bright' : 'dim'); node.dataset.fid = id;
    node.style.left = x + 'px'; node.style.top = y + 'px'; node.innerHTML = '<i></i>';
    host.append(node); setTimeout(() => node.remove(), 1000);
    return true;
  }
  return { note, star };
})();
