/* V2.9.3：两块弹幕 —— 「新事实接入」与「事实消亡」。
   - 接入：竖排、新条目从底部进入，标签用分类色，摘要截 12 字
   - 消亡：新条目进入时，最老的一条“破碎”消失，其余上移
   两块都是毛玻璃、常驻左侧，不随底部终端开关消失。 */
window.V03Danmaku = (() => {
  const MAX_ARRIVE = 30, MAX_PERISH = 8;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clip = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n) + '…' : t; };
  let arriveBox = null, perishBox = null;

  function label(f) {
    try { if (window.V03Fact && V03Fact.tagOf) return V03Fact.tagOf(f).label; } catch (e) {}
    return (f.card && f.card.subCategory) || '事实';
  }
  function colorOf(f) {
    try { return (window.V03Fact && V03Fact.tagOf) ? V03Fact.tagOf(f).color : ''; } catch (e) { return ''; }
  }
  function row(f) {
    const el = document.createElement('div');
    el.className = 'dm-row';
    const variety = f.variety || (f.card && (f.card.variety || f.card.commodityName)) || '';
    el.innerHTML = '<b style="color:' + (colorOf(f) || 'inherit') + '">' + esc(label(f)) + '</b>' +
      (variety ? '<i>· ' + esc(clip(variety, 8)) + '</i>' : '') +
      '<span>' + esc(clip(f.summary || f.title, 12)) + '</span>';
    return el;
  }
  function arrive(f) {
    if (!arriveBox || !f) return;
    const node = row(f);
    arriveBox.appendChild(node);
    while (arriveBox.children.length > MAX_ARRIVE) arriveBox.firstChild.remove();
    arriveBox.scrollTop = arriveBox.scrollHeight;
    requestAnimationFrame(() => node.classList.add('on'));
  }
  function perish(f) {
    if (!perishBox || !f) return;
    const node = row(f);
    node.classList.add('once');
    perishBox.prepend(node);
    requestAnimationFrame(() => node.classList.add('on'));
    /* 新数据进来 → 最老的一条破碎消失 */
    const rows = [...perishBox.children];
    if (rows.length > MAX_PERISH) {
      const oldest = rows[rows.length - 1];
      oldest.classList.add('shatter');
      setTimeout(() => oldest.remove(), 620);
    }
  }
  function mount() {
    arriveBox = document.getElementById('danmakuArrive');
    perishBox = document.getElementById('danmakuPerishList');
    if (perishBox) perishBox.innerHTML = '';
    if (arriveBox) arriveBox.innerHTML = '';
  }
  return { mount, arrive, perish };
})();
