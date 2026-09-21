/* ============================================================
   L3 分析卡片（品类结构 + 竞争力雷达 + 对象要点，始终绑定「当前对象」）
   L4：城市代表单品全链路（六环节按流程依次点亮 + 价格链路 + 经营主体抽屉）
   旧版资产复用：品类结构条 / 竞争力雷达 / 分析卡片三栏（产区产业档案）
   ============================================================ */
window.AGRI_CHAIN = (function () {
  const D = window.AGRI_DATA;
  const $ = id => document.getElementById(id);
  let cur = null, stage = 0, hooks = {}, timers = [], radarRaf = null;
  let curImportId = null;
  let l3 = { prov: null, city: null, avg: {}, mode: 'prov' };

  /* ---------------- 结构条（渐进出现，绑定当前对象） ---------------- */
  function bars(rows) {
    $('l3Bars').innerHTML = rows.map(r => `<div class="l3-row${r.on ? ' on' : ''}"><span>${r.k}</span><div class="bar"><i data-w="${r.pct}%"></i></div><b>${r.v}</b></div>`).join('');
    $('l3Bars').querySelectorAll('.bar i').forEach((el, i) => setTimeout(() => { el.style.width = el.dataset.w; }, 260 + i * 190));
  }

  /* ---------------- 雷达：当前对象为主多边形，省均值为参考线 ---------------- */
  function radar(main, ref) {
    const cv = $('l3Radar'); if (!cv) return;
    const ctx = cv.getContext('2d');
    const dims = Object.keys(main), vals = dims.map(k => main[k]);
    const W = cv.width, H = cv.height, cx = W / 2, cy = H / 2 + 6, R = Math.min(W, H) * 0.33;
    const N = dims.length;
    const pt = (i, r) => { const a = -Math.PI / 2 + i * 2 * Math.PI / N; return [cx + Math.cos(a) * R * r, cy + Math.sin(a) * R * r]; };
    const path = (radiusOf) => {
      ctx.beginPath();
      dims.forEach((k, i) => { const p = pt(i, radiusOf(i)); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
      ctx.closePath();
    };
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
      // 参考基准（全省均值）：虚线，不填充
      if (ref) {
        path(i => ref[dims[i]] / 100);
        ctx.setLineDash([4, 3]); ctx.strokeStyle = 'rgba(100,112,127,.75)'; ctx.lineWidth = 1.4; ctx.stroke(); ctx.setLineDash([]);
      }
      const prog = dims.map((k, i) => {
        const s = 300 + i * 180, t = (now - t0 - s) / 420;
        return Math.max(0, Math.min(1, t)) * (vals[i] / 100);
      });
      path(i => prog[i]);
      ctx.fillStyle = 'rgba(29,78,216,.16)'; ctx.fill();
      ctx.strokeStyle = '#1d4ed8'; ctx.lineWidth = 1.8; ctx.stroke();
      prog.forEach((r, i) => { if (r <= 0) return; const p = pt(i, r); ctx.beginPath(); ctx.arc(p[0], p[1], 2.6, 0, Math.PI * 2); ctx.fillStyle = '#1d4ed8'; ctx.fill(); });
      ctx.font = '11px "IBM Plex Sans SC",sans-serif'; ctx.fillStyle = '#4d586a';
      dims.forEach((k, i) => {
        const p = pt(i, 1.24);
        ctx.textAlign = Math.abs(p[0] - cx) < 6 ? 'center' : (p[0] > cx ? 'left' : 'right');
        ctx.fillText(k, p[0], p[1] + 4);
      });
      if (now - t0 < 300 + N * 180 + 420) radarRaf = requestAnimationFrame(draw); else radarRaf = null;
    }
    radarRaf = requestAnimationFrame(draw);
  }

  const avgOf = (cities, key) => Math.round(cities.reduce((a, c) => a + c[key], 0) / cities.length);
  function provAvg(d) {
    const comp = {};
    Object.keys(d.cities[0].comp).forEach(k => { comp[k] = avgOf(d.cities, k); });
    return comp;
  }

  /* ---------------- L3：省内数据 ---------------- */
  function renderProvinceL3(prov, cfg) {
    hooks = cfg || {};
    const d = D.provinces[prov]; if (!d) return;
    l3.prov = prov; l3.city = null; l3.avg = provAvg(d);
    $('l3Sub').textContent = `${prov} · 省内 ${d.cities.length} 个重点产区 · 主导品类 ${D.CATN[d.cat]}`;
    l3Focus(prov, null);
  }

  /* 分析卡片绑定当前对象：省 = 全省均值口径；城市 = 该产区口径 + 省均值参考 */
  function l3Focus(prov, city) {
    const d = D.provinces[prov]; if (!d) return;
    if (!l3.avg || l3.prov !== prov) { l3.prov = prov; l3.avg = provAvg(d); }
    const c = city ? d.cities.find(x => x.name === city) : null;
    l3.city = c ? city : null; l3.mode = c ? 'city' : 'prov';

    // 结构条：全省品类结构，高亮当前对象所属品类
    const byCat = {};
    d.cities.forEach(x => { byCat[x.cat] = (byCat[x.cat] || 0) + x.out; });
    const total = Object.values(byCat).reduce((a, b) => a + b, 0) || 1;
    const rows = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({
      k: D.CATN[k], v: Math.round(v / total * 63) + '%', pct: Math.round(v / total * 63), on: !!c && c.cat === k
    }));
    rows.push({ k: '其他品类', v: '37%', pct: 37, on: false });
    bars(rows);
    $('l3BarsTitle').textContent = `品类结构 · ${c ? c.name + ' 所属品类已标注' : prov + ' 全省'}（示意）`;

    // 雷达：当前对象五维；城市模式下叠加全省均值参考
    radar(c ? c.comp : l3.avg, c ? l3.avg : null);
    $('l3RadarTitle').textContent = c ? `竞争力五维 · ${c.name}（示意）` : `竞争力五维 · ${prov}均值（示意）`;
    const cap = $('l3RadarCap');
    if (cap) cap.textContent = c ? `实线 = ${c.name} · 虚线 = ${prov}均值` : `实线 = ${prov} 省内均值（示意）`;

    // 卡片头 + 对象要点
    $('l3Obj').textContent = c ? `${c.name} · ${prov}` : `${prov} · 全省均值`;
    const tag = $('l3ObjCat');
    tag.className = 'tag ' + (c ? c.cat : d.cat);
    tag.textContent = `${c ? c.main : D.CATN[d.cat]}`;
    $('l3ObjNote').textContent = c
      ? (D.chains[c.name] ? '链路已标定 · 再次点击进入 L4' : '代表单品链路待标定')
      : '点城市节点可切换口径';
    const compAvg = c => Math.round(Object.values(c.comp).reduce((a, b) => a + b, 0) / Object.keys(c.comp).length);
    const facts = c
      ? [['外调规模', c.out + ' 万吨'], ['竞争力均值', compAvg(c)],
         ['代表单品链路', D.chains[c.name] ? '已标定' : '待标定'], ['区域定位', c.lead]]
      : [['重点产区', d.cities.length + ' 个'], ['供给规模指数', d.supply], ['省主导品类', D.CATN[d.cat]], ['同比', '+' + d.yoy + '%']];
    $('l3Facts').innerHTML = facts.map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`).join('');
  }

  /* ---------------- L4 ---------------- */
  const hubChain = () => (D.chains[cur] && D.chains[cur].kind === 'hub') ? D.chains[cur] : null;
  const hubIm = () => { const ch = hubChain(); return ch ? (D.imports[curImportId] || D.imports[ch.catalog[0]]) : null; };
  const stagesOf = () => { const im = hubIm(); if (im) return im.stages; const ch = D.chains[cur]; return (ch && ch.stages) || []; };
  const entsOf = i => { if (hubIm()) return []; const ch = D.chains[cur]; return (ch && ch.entities[i]) || []; };

  function render(key, cfg, importId) {
    hooks = cfg || {}; cur = key; stage = 0;
    const ch = D.chains[key];
    if (!ch) return false;
    if (ch.kind === 'hub') return renderHub(ch, importId || (hubChain() && curImportId) || ch.catalog[0]);
    curImportId = null;
    const hubRow = document.getElementById('hubCats');
    if (hubRow) hubRow.remove();
    return renderCity(key, ch);
  }

  /* 城市代表单品全链路（原有链路，不变） */
  function renderCity(key, ch) {
    const pt = document.getElementById('priceTitle');
    if (pt) pt.textContent = '田头 → 批发 → 零售 价格链路';
    $('chainAxis').classList.remove('axis-5');
    $('chainTitle').innerHTML = `${ch.city} · ${ch.emoji} ${ch.product}<span class="mark">示意/待标定</span>`;
    $('chainSub').textContent = `${ch.prov} ｜ 上市季 ${ch.season} ｜ ${ch.headline}`;
    // 环节轴：序号角标（旧版 .stage .no）+ 本环节成本，形成"流程 + 数值"的连续叙事
    $('chainAxis').innerHTML = ch.stages.map((s, i) =>
      `<div class="chip" data-i="${i}"><span class="no">${i + 1}/6</span><div class="ic">${s.icon}</div><b>${s.name}</b><span class="cv">成本 ${s.cost}</span></div>`).join('');
    $('chainAxis').querySelectorAll('.chip').forEach(el => {
      el.onclick = () => { selectStage(+el.dataset.i); };
    });
    // 价格链路：段值 + 对田头价的倍数 + 加价最大的一段高亮
    const base = ch.price[0].v, top = ch.price[ch.price.length - 1].v;
    let hot = { r: 0, i: 0 };
    ch.price.forEach((p, i) => { if (!i) return; const r = p.v / ch.price[i - 1].v; if (r > hot.r) hot = { r, i }; });
    $('priceChain').innerHTML = `<div class="price-head"><span>环节</span><span>价格</span><span>×对田头</span><span>占零售价</span><span>环节说明</span></div>`
      + ch.price.map((p, i) => {
      const pct = Math.round(p.v / top * 100);
      return `<div class="price-row${i === hot.i ? ' hot' : ''}"><span class="pk">${p.k}</span><span class="pv">${p.v}</span><span class="px">×${(p.v / base).toFixed(2)}</span><div class="pbar"><i data-w="${pct}%"></i></div><span class="pn">${p.note}</span></div>`;
    }).join('');
    $('priceSum').innerHTML = `田头 → 零售累计 <b>×${(top / base).toFixed(2)}</b>（${base} → ${top} 元/kg，示意）；加价最大的一段是 <b>${ch.price[hot.i - 1].k} → ${ch.price[hot.i].k}（×${hot.r.toFixed(2)}）</b>。`;
    selectStage(0);
    return true;
  }

  /* L4 · 红星大市场：品类 / 部位 + 终端建议（五段 = 数据骨架） */
  function renderHub(ch, importId) {
    const hx = D.HONGXING;
    const im = D.imports[importId] || D.imports[ch.catalog[0]];
    curImportId = im.id;
    const pt = document.getElementById('priceTitle');
    if (pt) pt.textContent = '境外园口 → 口岸 → 集散 → 红星 → 终端 价格链路';
    $('chainTitle').innerHTML = `${hx.short} · ${im.emoji} ${im.title}<span class="mark">示意/待标定</span>`;
    $('chainSub').textContent = `${hx.prov}·${hx.city} ｜ ${im.origin} ｜ ${im.item}${im.cut ? '（' + im.cut + '）' : ''} ｜ 数据骨架：${hx.skeleton.join(' → ')}`;
    $('chainAxis').classList.add('axis-5');
    let row = document.getElementById('hubCats');
    if (!row) {
      row = document.createElement('div');
      row.id = 'hubCats'; row.className = 'hub-cats';
      $('chainAxis').parentElement.insertBefore(row, $('chainAxis'));
    }
    row.innerHTML = `<span class="hc-title">红星在营进口品类 · 部位</span>`
      + ch.catalog.map(k => { const x = D.imports[k];
        return `<button class="hc${k === im.id ? ' on' : ''}" data-imp="${k}"><b>${x.emoji} ${x.title}</b><small>${x.origin}</small></button>`; }).join('')
      + `<span class="hc-note">口径：${im.caliber.join(' ｜ ')}${im.sliceNote ? '；' + im.sliceNote : ''}</span>`;
    row.querySelectorAll('button.hc').forEach(b => b.onclick = () => pickImport(b.dataset.imp));
    // 五段环节轴 = 数据骨架（境外产区 → 中国进口 → 湖南集散 → 红星 → 渠道/终端）
    $('chainAxis').innerHTML = im.stages.map((s, i) =>
      `<div class="chip" data-i="${i}"><span class="no">${i + 1}/${im.stages.length}</span><div class="ic">${s.icon}</div><b>${s.name}</b><span class="cv">${s.price}</span></div>`).join('');
    $('chainAxis').querySelectorAll('.chip').forEach(el => { el.onclick = () => { selectStage(+el.dataset.i); }; });
    // 价格链路：段值 + 对源头价的倍数 + 加价最大的一段高亮
    const base = im.price[0].v, top = im.price[im.price.length - 1].v;
    let hot = { r: 0, i: 0 };
    im.price.forEach((p, i) => { if (!i) return; const r = p.v / im.price[i - 1].v; if (r > hot.r) hot = { r, i }; });
    $('priceChain').innerHTML = `<div class="price-head"><span>环节</span><span>价格</span><span>×对源头</span><span>占零售价</span><span>环节说明</span></div>`
      + im.price.map((p, i) => {
        const pct = Math.round(p.v / top * 100);
        return `<div class="price-row${i === hot.i ? ' hot' : ''}"><span class="pk">${p.k}</span><span class="pv">${p.v}</span><span class="px">×${(p.v / base).toFixed(2)}</span><div class="pbar"><i data-w="${pct}%"></i></div><span class="pn">${p.note}</span></div>`;
      }).join('');
    $('priceSum').innerHTML = `源头 → 零售累计 <b>×${(top / base).toFixed(2)}</b>（${base} → ${top} 元/kg，示意）；加价最大的一段是 <b>${im.price[hot.i - 1].k} → ${im.price[hot.i].k}（×${hot.r.toFixed(2)}）</b>；口径：${im.caliber.join(' ｜ ')}。`;
    selectStage(0);
    return true;
  }

  /* 切换红星在营品类 / 部位（一个选择贯穿全链路） */
  function pickImport(id) {
    const ch = hubChain();
    if (!ch || ch.catalog.indexOf(id) < 0) return false;
    renderHub(ch, id);
    if (hooks.onPickImport) hooks.onPickImport(id);
    light();
    return true;
  }
  function selectStage(i) {
    const st = stagesOf();
    if (!st.length) return;
    const n = st.length, im = hubIm();
    stage = i;
    $('chainAxis').querySelectorAll('.chip').forEach(el => el.classList.toggle('on', +el.dataset.i === i));
    const s = st[i];
    $('stageName').textContent = `${i + 1}/${n} · ${s.name}`;
    const dots = Array.from({ length: n }, (_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('');
    $('stageMetrics').innerHTML = [['规模', s.scale], ['成本', s.cost], ['价格', s.price],
      ['口径', im ? (s.caliber || D.cal.market) : `<span class="dots">${dots}</span>`, true]]
      .map(([k, v, plain]) => `<div class="metric"><div class="k">${k}</div><div class="v">${v}${plain ? '' : '<span class="mark">示意</span>'}</div></div>`).join('');
    $('stageRisk').innerHTML = `<b>风险敞口：</b>${s.risk}`;
    const ents = entsOf(i);
    const old = document.getElementById('stageEnts');
    if (old) old.remove();
    if (ents.length) {
      const box = document.createElement('div');
      box.id = 'stageEnts';
      box.style.marginTop = '12px';
      box.innerHTML = `<h3>本环节经营主体 <small>点击展开抽屉 · 示意</small></h3>
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
      <div class="card" style="margin-top:12px"><h3>客户 / 货物流向</h3><div style="font-size:.78125rem;color:#4d586a;line-height:1.85">${e.c}</div></div>
      <div class="tip-note">主体级数据是本项目下一步需要打通的口径（内部子分公司数据梳理）；当前为示意值，用于确认抽屉的信息结构。</div>`;
    $('drawer').classList.add('open');
    document.getElementById('stage').classList.add('drawer-open');   // 主内容让位，数据不被抽屉压住
  }
  function closeDrawer() {
    $('drawer').classList.remove('open');
    document.getElementById('stage').classList.remove('drawer-open');
  }
  function drawerOpen() { return $('drawer').classList.contains('open'); }

  return { renderProvinceL3, l3Focus, render, selectStage, light, openDrawer, closeDrawer, drawerOpen, pickImport,
    get stage() { return stage; }, get city() { return cur; }, get l3Mode() { return l3.mode; }, get importId() { return curImportId; } };
})();
