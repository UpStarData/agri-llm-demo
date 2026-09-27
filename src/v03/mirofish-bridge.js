/* AgriLink v0.8.4 → MiroFish frontend preview. The payload stays in the browser. */
window.V03LegacySim = window.V03Sim;
window.V03Sim = (function () {
  const D = window.V03Data;
  const S = window.V03Store;
  const MIROFISH_ORIGIN = 'https://upstardata.github.io';
  const MIROFISH_URL = MIROFISH_ORIGIN + '/mirofish-frontend-preview/?embed=agrilink#/';
  let root, frame, promptInput, evidence, lastSelection = '', loaded = false;

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
      source: 'AgriLink v0.8.4',
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
    evidence.replaceChildren();
    const label = document.createElement('strong');
    label.textContent = ctx.facts.length ? `已携带 ${ctx.facts.length} 条事实` : '尚未选中事实';
    evidence.appendChild(label);
    ctx.facts.slice(0, 6).forEach(f => {
      const chip = document.createElement('span');
      chip.textContent = `${f.id} · ${f.title}`;
      chip.title = f.title;
      evidence.appendChild(chip);
    });
    if (ctx.relation) {
      const chip = document.createElement('span');
      chip.textContent = `${ctx.relation.id} · ${ctx.relation.type}`;
      evidence.appendChild(chip);
    }
    if (S.state.tab === 'sim') send();
  }

  function mount(el) {
    root = document.createElement('div');
    root.className = 'miro-bridge';
    root.innerHTML = '<div class="miro-bridge-bar"><div class="miro-bridge-title"><b>推演工作台</b><small>AgriLink × MiroFish</small></div><div class="miro-bridge-evidence" aria-live="polite"></div><label class="miro-bridge-prompt">推演问题 <textarea rows="2" aria-label="推演问题"></textarea></label><button type="button" class="miro-bridge-send">送入 MiroFish ↓</button><p class="miro-bridge-note">当前为前端体验：可查看页面及输入衔接，实际推演仍需接入 MiroFish 后端。</p></div><iframe class="miro-bridge-frame" title="MiroFish 推演前端" loading="lazy"></iframe>';
    el.replaceChildren(root);
    frame = root.querySelector('iframe');
    promptInput = root.querySelector('textarea');
    evidence = root.querySelector('.miro-bridge-evidence');
    root.querySelector('.miro-bridge-send').onclick = send;
    frame.onload = () => { loaded = true; send(); };
    frame.src = MIROFISH_URL;
    update();
  }

  return { mount, update };
})();
