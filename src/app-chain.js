/* ============================================================
   L3 附加：品类结构条 + 竞争力雷达（渐进出现）
   L4：城市代表单品全链路（六环节按流程依次点亮 + 经营主体抽屉）
   ============================================================ */
window.AGRI_CHAIN = (function () {
  const D = window.AGRI_DATA;
  const $ = id => document.getElementById(id);
  let cur = null, stage = 0, hooks = {}, timers = [], radarRaf = null;

  /* ---------------- 结构条（渐进出现） ---------------- */
  function bars(rows) {
    $('l3Bars').innerHTML = rows.map(r => `<div class="l3-row"><span>${r.k}</span><div class="bar"><i data-w="${r.pct}%"></i></div><b>${r.v}</b></div>`).join('');
    $('l3Bars').querySelectorAll('.bar i').forEach((el, i) => setTimeout(() => { el.style.width = el.dataset.w; }, 260 + i * 190));
  }

  /* ---------------- 雷达（按维度依次扫出） ---------------- */
  function radar(comp) {
    const cv = $('l3Radar'); if (!cv) return;
    const ctx = cv.getContext('2d');
    const dims = Object.keys(comp), vals = dims.map(k => comp[k]);
    const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2 + 6, R = Math.min(W, H) * 0.33;
    const N = dims.length;
    const pt = (i, r) => { const a = -Math.PI / 2 + i * 2 * Math.PI / N; return [cx + Math.cos(a) * R * r, cy + Math.sin(a) * R * r]; };
    const t0 = performance.now();
    if (radarRaf) cancelAnimationFrame(radarRaf);
    function draw(now) {
      ctx.clearRect(0, 0, W, H);
      for (let g = 1; g <= 4; g++) {
        ctx.beginPath();
        for (let i = 0; i < N; i++) { const p = pt(i, g / 4); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
        ctx.closePath(); ctx.strokeStyle = 'rgba(120,145,185,.28)'; ctx.lineWidth = 1; ctx.stroke();
      }
      for (let i = 0; i < N; i++) { const p = pt(i, 1); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(p[0], p[1]); ctx.strokeStyle = 'rgba(120,145,185,.22)'; ctx.stroke(); }
      const prog = dims.map((k, i) => {
        const s = 300 + i * 180, t = (now - t0 - s) / 420;
        return Math.max(0, Math.min(1, t)) * (vals[i] / 100);
      });
      ctx.beginPath();
      prog.forEach((r, i) => { const p = pt(i, r); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
      ctx.closePath();
      ctx.fillStyle = 'rgba(29,78,216,.16)'; ctx.fill();
      ctx.strokeStyle = '#1d4ed8'; ctx.lineWidth = 1.8; ctx.stroke();
      prog.forEach((r, i) => { if (r <= 0) return; const p = pt(i, r); ctx.beginPath(); ctx.arc(p[0], p[1], 2.6, 0, Math.PI * 2); ctx.fillStyle = '#1d4ed8'; ctx.fill(); });
      ctx.font = '11px "IBM Plex Sans SC",sans-serif'; ctx.fillStyle = '#5b6677';
      dims.forEach((k, i) => {
        const p = pt(i, 1.24);
        ctx.textAlign = Math.abs(p[0] - cx) < 6 ? 'center' : (p[0] > cx ? 'left' : 'right');
        ctx.fillText(k, p[0], p[1] + 4);
      });
      if (now - t0 < 300 + N * 180 + 420) radarRaf = requestAnimationFrame(draw); else radarRaf = null;
    }
    radarRaf = requestAnimationFrame(draw);
  }

  /* ---------------- L3：省内数据 ---------------- */
  function renderProvinceL3(prov, cfg) {
    hooks = cfg || {};
    const d = D.provinces[prov]; if (!d) return;
    $('l3Sub').textContent = `${prov} · 省内 ${d.cities.length} 个重点产区 · 主导品类 ${D.CATN[d.cat]}`;
    const byCat = {};
    d.cities.forEach(c => { byCat[c.cat] = (byCat[c.cat] || 0) + c.out; });
    const total = Object.values(byCat).reduce((a, b) => a + b, 0) || 1;
    const rows = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({
      k: D.CATN[k], v: Math.round(v / total * 63) + '%', pct: Math.round(v / total * 63)
    }));
    rows.push({ k: '其他品类', v: '37%', pct: 37 });
    bars(rows);
    const comp = {};
    Object.keys(d.cities[0].comp).forEach(k => { comp[k] = Math.round(d.cities.reduce((a, c) => a + c.comp[k], 0) / d.cities.length); });
    radar(comp);
  }

  /* ---------------- L4 ---------------- */
  function render(key, cfg) {
    hooks = cfg || {}; cur = key; stage = 0;
    const ch = D.chains[key];
    if (!ch) return false;
    $('chainTitle').innerHTML = `${ch.city} · ${ch.emoji} ${ch.product}<span class="mark">示意/待标定</span>`;
    $('chainSub').textContent = `${ch.prov} ｜ 上市季 ${ch.season} ｜ ${ch.headline}`;
    $('chainAxis').innerHTML = ch.stages.map((s, i) =>
      `<div class="chip" data-i="${i}"><div class="ic">${s.icon}</div><b>${s.name}</b><small>${i + 1} / 6</small></div>`).join('');
    $('chainAxis').querySelectorAll('.chip').forEach(el => {
      el.onclick = () => { selectStage(+el.dataset.i); };
    });
    $('priceChain').innerHTML = ch.price.map(p => {
      const pct = Math.round(p.v / ch.price[ch.price.length - 1].v * 100);
      return `<div class="price-row"><span class="pk">${p.k}</span><span class="pv">${p.v}</span><div class="pbar"><i data-w="${pct}%"></i></div><span class="pn">${p.note}</span></div>`;
    }).join('');
    selectStage(0);
    return true;
  }
  function selectStage(i) {
    const ch = D.chains[cur];
    if (!ch) return;
    stage = i;
    $('chainAxis').querySelectorAll('.chip').forEach(el => el.classList.toggle('on', +el.dataset.i === i));
    const s = ch.stages[i];
    $('stageName').textContent = `${i + 1}/6 · ${s.name}`;
    $('stageMetrics').innerHTML = [['规模', s.scale], ['成本', s.cost], ['价格', s.price], ['环节位置', `${i + 1} / 6`]]
      .map(([k, v]) => `<div class="metric"><div class="k">${k}</div><div class="v">${v}<span class="mark">示意</span></div></div>`).join('');
    $('stageRisk').innerHTML = `<b>风险敞口：</b>${s.risk}`;
    const ents = ch.entities[i] || [];
    const old = document.getElementById('stageEnts');
    if (old) old.remove();
    if (ents.length) {
      const box = document.createElement('div');
      box.id = 'stageEnts';
      box.style.marginTop = '12px';
      box.innerHTML = `<h3 style="font-size:13px;margin-bottom:8px">本环节经营主体 <small style="color:#98a2b3;font-weight:400">点击展开抽屉 · 示意</small></h3>
        <ul class="ent-list">${ents.map((e, k) => `<li data-k="${k}"><b>${e.n}</b><small>${e.t} ｜ ${e.v} ｜ ${e.p}</small></li>`).join('')}</ul>`;
      document.querySelector('#scene-l4 .chain-body .card').appendChild(box);
      box.querySelectorAll('li').forEach(li => {
        li.onclick = () => {
          const e = ents[+li.dataset.k];
          openDrawer(s.name, e);
          if (hooks.onEntity) hooks.onEntity(e);
        };
      });
    }
    if (hooks.onStage) hooks.onStage(i, s);
  }
  function light() {
    timers.forEach(clearTimeout); timers = [];
    $('chainAxis').querySelectorAll('.chip').forEach((el, i) => timers.push(setTimeout(() => el.classList.add('lit'), 120 + i * 210)));
    $('chainProg').style.width = '0';
    timers.push(setTimeout(() => { $('chainProg').style.width = '100%'; }, 140));
    $('priceChain').querySelectorAll('.pbar i').forEach((el, i) => {
      el.style.width = '0';
      timers.push(setTimeout(() => { el.style.width = el.dataset.w; }, 420 + i * 170));
    });
  }
  function openDrawer(stageName, e) {
    $('drawerTitle').textContent = e.n;
    $('drawerSub').textContent = `${e.t} ｜ 所属环节 ${stageName} ｜ 示意 · 待标定`;
    $('drawerBody').innerHTML = `
      <div class="metrics" style="grid-template-columns:1fr 1fr">
        <div class="metric"><div class="k">规模 / 产能</div><div class="v">${e.v}<span class="mark">示意</span></div></div>
        <div class="metric"><div class="k">价格 / 费用</div><div class="v">${e.p}<span class="mark">示意</span></div></div>
      </div>
      <div class="card" style="margin-top:12px"><h3>客户 / 货物流向</h3><div style="font-size:12.5px;color:#5b6677;line-height:1.85">${e.c}</div></div>
      <div class="tip-note">主体级数据是本项目下一步需要打通的口径（内部子分公司数据梳理）；当前为示意值，用于确认抽屉的信息结构。</div>`;
    $('drawer').classList.add('open');
  }
  function closeDrawer() { $('drawer').classList.remove('open'); }
  function drawerOpen() { return $('drawer').classList.contains('open'); }

  return { renderProvinceL3, render, selectStage, light, openDrawer, closeDrawer, drawerOpen,
    get stage() { return stage; }, get city() { return cur; } };
})();
