/* AgriLink simulation launches in the published old-style workbench. Context stays in the browser. */
window.V03Sim = (function () {
  const D = window.V03Data;
  const S = window.V03Store;
  const MIROFISH_ORIGIN = 'https://upstardata.github.io';
  const MIROFISH_URL = MIROFISH_ORIGIN + '/mirofish-frontend-preview/?embed=agrilink#/';
  let root, frame, promptInput, lastSelection = '', loaded = false;

  function context() {
    const s = S.state;
    const selected = [s.factId, s.rel && s.rel.focusFact, ...(s.carry || [])].filter(Boolean);
    const relation = s.rel && s.rel.sel ? D.relById(s.rel.sel) : null;
    if (relation) selected.push(...(relation.factIds || []));
    const ids = [...new Set(selected)];
    const facts = ids.map(id => D.factById(id)).filter(Boolean).map(f => ({
      id: f.id, date: f.date || '', title: f.title || f.short || '',
      region: f.region || '', source: f.source || '', confidence: f.confidence ?? null
    }));
    return {
      source: 'AgriLink v1.0.3',
      facts,
      relation: relation ? { id: relation.id, type: relation.type, note: relation.note || '', factIds: relation.factIds || [] } : null,
      requirement: promptInput ? promptInput.value.trim() : ''
    };
  }

  function defaultRequirement(ctx) {
    const focus = ctx.facts[0];
    return focus
      ? `基于已选事实与关系，推演“${focus.title}”可能产生的供需、价格和流通影响。请区分已知事实、假设与待验证结论，并标出依据。`
      : '基于导入的农业交易事实与关系，推演供需、价格和流通影响。请区分已知事实、假设与待验证结论，并标出依据。';
  }

  function send() {
    if (!loaded || !frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage({ type: 'agrilink:simulation-context', version: 1, context: context() }, MIROFISH_ORIGIN);
  }

  function update() {
    if (!root) return;
    const ctx = context();
    const key = JSON.stringify([ctx.facts.map(f => f.id), ctx.relation && ctx.relation.id]);
    if (key !== lastSelection) {
      lastSelection = key;
      promptInput.value = defaultRequirement(ctx);
    }
    if (S.state.tab === 'sim') send();
  }

  function mount(el) {
    root = document.createElement('div');
    root.className = 'miro-bridge';
    root.innerHTML = '<textarea aria-label="推演问题" hidden></textarea><iframe class="miro-bridge-frame" title="agrilink 推演流程" loading="eager"></iframe>';
    el.replaceChildren(root);
    frame = root.querySelector('iframe');
    promptInput = root.querySelector('textarea');
    frame.onload = () => { loaded = true; send(); };
    frame.src = MIROFISH_URL;
    update();
  }

  return { mount, update };
})();
