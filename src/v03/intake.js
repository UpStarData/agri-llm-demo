/* Shared arrival presentation. Replay and real ingestion use the same event path. */
window.V03Intake = (() => {
  const timers = new WeakMap();
  function note(host, kind, title) {
    if (!host) return;
    const previous = timers.get(host);
    if (previous) { clearTimeout(previous.hide); clearTimeout(previous.remove); previous.node.remove(); }
    const node = document.createElement('div');
    node.className = 'fresh-note'; node.setAttribute('role', 'status');
    const badge = document.createElement('b'); badge.textContent = kind;
    const text = document.createElement('span'); text.textContent = title;
    node.append(badge, text); host.prepend(node);
    const state = { node, hide: 0, remove: 0 }; timers.set(host, state);
    requestAnimationFrame(() => node.classList.add('on'));
    state.hide = setTimeout(() => { node.classList.remove('on'); state.remove = setTimeout(() => { node.remove(); if (timers.get(host) === state) timers.delete(host); }, 350); }, 3800);
  }
  function star(host, point, id, bright = true) {
    if (!host || !point || !point.every(Number.isFinite)) return false;
    const [x, y] = point, box = host.getBoundingClientRect();
    if (x < 0 || y < 0 || x > box.width || y > box.height) return false;
    // Keep a burst bounded; existing stars finish their own animation.
    const active = host.querySelectorAll('.star-flash');
    if (active.length >= 6) active[0].remove();
    const node = document.createElement('div');
    node.className = 'star-flash ' + (bright ? 'bright' : 'dim'); node.dataset.fid = id;
    node.style.left = x + 'px'; node.style.top = y + 'px'; node.innerHTML = '<i></i>';
    host.append(node); setTimeout(() => node.remove(), 1200);
    return true;
  }
  return { note, star };
})();
