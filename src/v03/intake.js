/* Shared arrival presentation. Replay and real ingestion use the same event path. */
window.V03Intake = (() => {
  const timers = new WeakMap();
  /* V3.0：系统级通知 —— 苹果灵动岛样式，居中顶部，两层共用（2D / 3D 都显示）。
     host 参数保留兼容旧调用，实际挂载点固定为 #island。 */
  function note(host, kind, title, factId) {
    const dock = document.getElementById('island');
    if (!dock) return;
    const node = document.createElement('div');
    node.className = 'isl'; node.setAttribute('role', 'status');
    const cat = String(kind || '通知') + ' ' + String(title || '');
    node.innerHTML = '<b># ' + String(kind || '通知') + '</b><span>' + String(title || '') + '</span>';
    if (factId) {
      node.classList.add('click');
      node.onclick = () => {
        const st = window.V03Store && window.V03Store.state || {};
        if (st.tab === 'fact') window.V03Store.set({ factId, panels: { cards: true } });
        else if (window.V03App && window.V03App.openRelationFact) window.V03App.openRelationFact(factId);
      };
    }
    dock.appendChild(node);
    while (dock.children.length > 2) dock.firstChild.remove();
    requestAnimationFrame(() => node.classList.add('on'));
    const hide = setTimeout(() => { node.classList.remove('on'); setTimeout(() => node.remove(), 380); }, 4200);
    node.addEventListener('pointerenter', () => clearTimeout(hide));
    return cat;
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
