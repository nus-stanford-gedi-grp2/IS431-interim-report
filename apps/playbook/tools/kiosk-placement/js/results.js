(function () {
  // Right-hand evaluation panel for step 2, organised in three tabs: Score, Checks and AI review.
  const R = (KP.results = {});
  const SC = KP.score;
  let el;
  const st = { an: null, ev: null, heat: null, busy: false, selK: null, tab: 'score', ai: null, aiFor: null, aiLoading: false, aiError: null, open: { weights: false, how: false }, openCrit: new Set(), openOverall: false };

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
  const pct = (v) => `${Math.round(v * 100)}%`;
  const STATUS = { ok: ['✓', 'Good'], watch: ['!', 'Watch'], issue: ['✕', 'Issue'], na: ['–', 'N/A'] };

  R.init = function () {
    el = document.getElementById('results');
    el.addEventListener('click', onClick);
    el.addEventListener('input', onInput);
    el.addEventListener('toggle', (e) => { if (e.target.dataset.open) st.open[e.target.dataset.open] = e.target.open; }, true);
  };
  R.update = function (patch) { Object.assign(st, patch); render(); };
  R.state = st;

  // Fingerprint of what the AI review was based on, so it can be flagged as outdated.
  R.fingerprint = () => JSON.stringify([KP.layoutSig(), KP.state.kiosks.map((k) => [k.x, k.y, k.facing]), SC.weights(), KP.F.config]);

  function ring(score, size = 96) {
    const r = size / 2 - 6, c = 2 * Math.PI * r, v = score == null ? 0 : score / 100, g = KP.F.grade(score);
    return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--ring-track)" stroke-width="7"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${KP.scoreColor(score ?? 0)}" stroke-width="7" stroke-linecap="round"
        stroke-dasharray="${c * v} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
      <text x="50%" y="53%" text-anchor="middle" dominant-baseline="middle" class="ring-num" style="fill:${g.color}">${esc(g.letter)}</text></svg>`;
  }

  function detail(id, r) {
    const m = r.m, fm = r.fm;
    switch (id) {
      case 'visibility': {
        const mv = m.entryVis.find((v) => v.entry.kind === 'main');
        return `${mv ? `Seen from ${pct(mv.frac)} of ${esc(mv.entry.label)} viewpoints · ` : ''}visible from ${pct(m.viewFrac)} of the lobby`;
      }
      case 'obviousness':
        return m.main ? `${f1(m.mainDist)} m from ${esc(m.main.label)}, ${Math.round(m.mainAngle)}° off the arrival direction · screen faces ${SC.compassLong(r.kiosk.facing)}` : `Screen faces ${SC.compassLong(r.kiosk.facing)}`;
      case 'flow':
        return `${isFinite(m.routeDist) ? `${f1(m.routeDist)} m from the nearest route` : 'No guest routes'} · <b>+${f1(Math.min(fm.extraToUse, 99))} m</b> walk to use it · ${m.routesPassing} route${m.routesPassing === 1 ? '' : 's'} within 3 m${r.detours.length ? ' · <b>obstructs a route</b>' : ''}${m.doorWorst ? ` · ${f1(m.doorWorst.d)} m from ${esc(m.doorWorst.entry.label)}` : ''}`;
      case 'staff':
        return m.staffNone ? 'No staff positions on the plan' : `Nearest: ${esc(m.staffNearest.label)} at ${f1(m.staffDist)} m · ${m.staffLosCount} staff point${m.staffLosCount === 1 ? '' : 's'} can see it`;
      case 'infra':
        return [['Power', m.power], ['Data', m.eth]].map(([n, c]) => (c ? `${n} ${f1(c.length)} m${c.exposed > 0.2 ? ` (${f1(c.exposed)} m exposed)` : ''}` : `${n}: none`)).join(' · ');
      case 'access':
        return `${pct(fm.frontFree)} of front zone clear · ${pct(fm.queueFree)} queue space · ${fm.reach ? 'reachable' : '<b>not reachable</b>'}`;
      case 'spacing': {
        const side = (g) => (g >= 3 ? '3 m+' : `${f1(g)} m`);
        return `Sides ${side(fm.gapSides[0])} / ${side(fm.gapSides[1])} · behind ${fm.gapBack <= 0.15 ? 'flush' : side(fm.gapBack)}${fm.nearestKiosk ? ` · ${f1(fm.nearestKiosk.d)} m to ${esc(fm.nearestKiosk.label)}` : ''}`;
      }
    }
    return '';
  }

  // ---- render ----------------------------------------------------------------------------------
  function render() {
    if (!el) return;
    const { ev, busy } = st;
    if (busy) { el.innerHTML = '<div class="res-pad"><div class="skeleton"></div><div class="skeleton short"></div><div class="skeleton"></div></div>'; return; }
    if (!ev || !ev.kiosks.length) {
      el.innerHTML = `<div class="res-pad">
        <div class="empty">
          <div class="empty-art">${kioskGlyph()}</div>
          <h3>Place your first kiosk</h3>
          <p>Click anywhere on the floor. Before you click, the ghost kiosk shows a predicted score and turns to face the best direction.</p>
          <ul class="empty-keys">
            <li><kbd>Space</kbd> turn 45°</li><li>Right-drag: turn the scene</li><li><kbd>Shift</kbd>-click: place several</li>
          </ul>
        </div>
        ${bestCard(null)}
        ${legend()}
      </div>`;
      return;
    }
    const sel = ev.kiosks.find((r) => r.id === st.selK) || ev.kiosks[0];
    const ai = st.ai, aiStale = ai && st.aiFor !== R.fingerprint();
    const issues = sel.checks.filter((c) => c.status === 'issue').length + sel.recs.filter((r) => r.sev === 'high').length;

    let h = `<div class="res-top">
      <div class="hero">
        ${ring(ev.overall)}
        <div class="hero-text">
          <div class="eyebrow"><span class="sim-tag">Simulated</span>${ev.kiosks.length > 1 ? `Lobby grade · ${ev.kiosks.length} kiosks` : 'Placement grade'}</div>
          <div class="hero-grade">Grade ${esc(KP.F.grade(ev.overall).letter)} <span>${esc(KP.F.grade(ev.overall).label)}</span></div>
          <div class="hero-sub">Bucket ${KP.F.grade(ev.overall).range} · score ${ev.overall}/100</div>
          ${ai && !aiStale && ai.overall_score != null ? `<div class="muted small">AI review: ${gtrip(ai.overall_score)}</div>` : ''}
        </div>
      </div>
      ${bucketScale(ev.overall)}
      ${capBanner(sel)}
      <p class="sim-note" title="${esc(R.DISCLAIMER)}"><b>Simulation.</b> Grades are estimates from a geometric model of your floor plan, not measured results.</p>
      ${ev.kiosks.length > 1 ? `<div class="ktabs">${ev.kiosks.map((r) => `<button class="ktab ${r.id === sel.id ? 'active' : ''}" data-act="k-sel" data-id="${r.id}">${esc(r.label)}${gtrip(r.overall)}</button>`).join('')}</div>` : ''}
      <div class="tabs" role="tablist">
        ${tabBtn('score', 'Score')}
        ${tabBtn('checks', 'Checks', issues ? `<span class="badge bad">${issues}</span>` : '')}
        ${tabBtn('ai', 'AI review', ai && !aiStale && ai.overall_score != null ? `<span class="badge">${esc(KP.F.grade(ai.overall_score).letter)}</span>` : aiStale ? '<span class="badge warn">!</span>' : '')}
      </div>
    </div><div class="res-pad">`;

    if (st.tab === 'score') h += scoreTab(sel, ev, ai && !aiStale ? ai : null);
    else if (st.tab === 'checks') h += checksTab(sel, ev);
    else h += aiCard(aiStale);
    h += '</div>';
    el.innerHTML = h;
  }

  const tabBtn = (id, label, extra = '') => `<button class="tab ${st.tab === id ? 'active' : ''}" data-act="tab" data-tab="${id}" role="tab">${label}${extra}</button>`;
  // Grade chip for a score: its bucket's letter, coloured by bucket.
  function gchip(score, size = '') {
    const g = KP.F.grade(score);
    return `<span class="gchip ${size}" style="background:${g.color}" title="${g.range}: ${esc(g.label)}">${esc(g.letter)}</span>`;
  }
  // Grade, then bucket, then score: "[A] 80–100 · 81".
  // The letter leads; bucket and score follow, smaller.
  function gtrip(score) {
    const g = KP.F.grade(score);
    return `<span class="gtrip">${gchip(score, 'md')}<span class="gt-rest">${g.range} · ${score}</span></span>`;
  }
  // Shown when the D rule caps the overall grade.
  function capBanner(r) {
    const cMin = KP.F.config.grades[2].min, d = KP.F.config.grades[3].letter;
    const low = SC.CRITERIA.filter((c) => r.scores[c.id] < cMin);
    if (!low.length) return '';
    return `<div class="cap-banner"><span class="gchip md" style="background:${KP.F.BUCKET_COLORS[3]}">${esc(d)}</span><div><b>${esc(r.label)} is capped at ${esc(d)}</b>: ${low.map((c) => `${esc(c.name)} is ${esc(d)} (${r.scores[c.id]})`).join(', ')}. Any ${esc(d)} criterion limits the overall grade to ${esc(d)}.</div></div>`;
  }
  R.DISCLAIMER = 'These grades and scores are a simulation: estimates computed from a simplified geometric model of the floor plan you drew (line of sight on a 0.25 m grid, shortest-path walking routes, modelled cable runs). They are not measurements of a real lobby and do not predict actual kiosk usage, guest satisfaction or compliance. Verify on site, and with your accessibility, fire-safety and electrical advisers, before installing.';
  // The grade buckets, with the current score's bucket highlighted.
  function bucketScale(score) {
    const cur = KP.F.grade(score).index;
    return `<div class="buckets">${KP.F.buckets().slice().reverse().map(([lo, hi], j) => {
      const i = 3 - j, g = KP.F.config.grades[i];
      return `<div class="bk ${i === cur ? 'on' : ''}" style="--c:${KP.F.BUCKET_COLORS[i]}"><b>${esc(g.letter)}</b><span>${lo}–${hi}</span></div>`;
    }).join('')}</div>`;
  }

  function scoreTab(sel, ev, ai) {
    const aiK = ai ? ai.kiosks.find((k) => k.id === sel.id) : null;
    let h = `<section class="card"><div class="card-h"><h4>${esc(sel.label)} <span class="muted small">faces ${SC.compassLong(sel.kiosk.facing)}</span></h4><button class="btn sm subtle" data-act="edit-formulas" title="Change how scores are calculated">ƒ Edit formulas</button></div>
      <p class="muted xsmall hint-line">Each criterion shows its <b>grade</b>, then bucket and score. Scores are simulated from measurements taken on your floor plan, and each measurement can be checked on site. Click a criterion for its formula and numbers.</p>`;
    for (const c of SC.CRITERIA) {
      const v = sel.scores[c.id], a = aiK && aiK.criteria[c.id], open = st.openCrit.has(c.id);
      h += `<div class="crit ${open ? 'open' : ''}">
        <button class="crit-top" data-act="crit-toggle" data-id="${c.id}" title="${esc(c.short)} (click for the formula)"><span class="crit-caret">▸</span>${gchip(v, 'md')}<span class="crit-name">${c.name}</span><span class="crit-w" title="Weight in the overall score">${Math.round((ev.W[c.id] / SC.CRITERIA.reduce((s, x) => s + ev.W[x.id], 0)) * 100)}%</span><span class="gt-rest">${KP.F.grade(v).range} · ${v}</span></button>
        <div class="bar"><div class="fill" style="width:${v}%;background:${KP.scoreColor(v)}"></div>${a && a.score != null ? `<div class="ai-mark" style="left:${Math.max(0, Math.min(100, a.score))}%" title="AI score ${a.score}"></div>` : ''}</div>
        <div class="crit-detail">${detail(c.id, sel)}</div>
        ${a && a.comment ? `<div class="crit-ai"><span class="ai-tag">AI${a.score != null && a.score !== v ? ` ${esc(KP.F.gbsText(a.score))}` : ''}</span>${esc(a.comment)}${a.adjustment_reason ? ` <em>(${esc(a.adjustment_reason)})</em>` : ''}</div>` : ''}
        ${open ? explainCriterion(c.id, sel) : ''}
      </div>`;
    }
    if (sel.bestFacing.overall > sel.overall) {
      h += `<div class="facing-tip"><span>Facing <b>${SC.compassLong(sel.bestFacing.facing)}</b>: ${gtrip(sel.bestFacing.overall)} <span class="muted">(+${sel.bestFacing.overall - sel.overall})</span></span><button class="btn sm" data-act="apply-facing" data-id="${sel.id}" data-f="${sel.bestFacing.facing}">Turn it</button></div>`;
    }
    h += '</section>';
    h += overallCard(sel, ev);
    h += bestCard(sel);
    h += weightsCard(ev.W);
    h += howCard();
    return h;
  }

  // ---- formula explanations ----------------------------------------------------------------------
  const VAR_INFO = Object.fromEntries(KP.F.VARS.map((v) => [v.name, v]));
  const code = (s) => `<code>${esc(s)}</code>`;

  // Every factor and measurement a formula depends on, in evaluation order.
  function dependencies(ast) {
    const cp = KP.F.compiled, factors = new Set(), vars = new Set();
    const walk = (a) => KP.F.names(a).forEach((n) => {
      if (cp.asts[n]) { if (!factors.has(n)) { factors.add(n); walk(cp.asts[n]); } }
      else if (VAR_INFO[n]) vars.add(n);
    });
    walk(ast);
    return {
      factors: KP.F.config.factors.filter((f) => factors.has(f.name)),
      vars: KP.F.VARS.filter((v) => vars.has(v.name)),
    };
  }

  function explainCriterion(id, r) {
    const cp = KP.F.compiled, crit = cp.criteria[id], env = r.env, score = r.scores[id];
    if (!crit) return '';
    const raw = crit.run(env), g = KP.F.grade(score), dep = dependencies(crit.ast);
    const capped = Math.round(raw) !== score;
    return `<div class="fx">
      <div class="fx-line"><span class="fx-k">Formula</span>${code(`${id} = ${KP.F.config.criteria[id]}`)}</div>
      <div class="fx-line"><span class="fx-k">Values</span>${code(`= ${KP.F.substitute(crit.ast, env)}`)}</div>
      <div class="fx-line"><span class="fx-k">Result</span><span>Grade ${gchip(score)} ${esc(g.label)} · bucket <b>${g.range}</b> · score <b>${score}</b> <span class="muted">(${KP.F.fmt(raw)}${capped ? ', kept within 0–100' : ' before rounding'})</span></span></div>
      ${factorTable(dep.factors, env)}
      ${varTable(dep.vars, env)}
      <button class="btn sm subtle" data-act="edit-formulas" data-key="criterion:${id}">ƒ Edit this formula</button>
    </div>`;
  }

  function factorTable(list, env) {
    if (!list.length) return '';
    return `<div class="fx-sub">Factors (0–1)</div>${list.map((f) => {
      const ast = KP.F.compiled.asts[f.name];
      return `<div class="fx-item"><div class="fx-item-h"><span class="fx-name">${esc(f.name)}</span>${f.note ? `<span class="fx-note">${esc(f.note)}</span>` : '<span></span>'}<span class="fx-val">${KP.F.fmt(env[f.name])}</span></div>
        ${code(f.expr)}<div class="fx-sub-val">${code(`= ${KP.F.substitute(ast, env)}`)}</div></div>`;
    }).join('')}`;
  }
  function varTable(list, env) {
    if (!list.length) return '';
    return `<div class="fx-sub">Observed measurements</div>${list.map((v) => `<div class="fx-item"><div class="fx-item-h"><span class="fx-name">${esc(v.name)}</span><span class="fx-note">${esc(v.desc)}</span><span class="fx-val">${KP.F.fmt(env[v.name])}<small> ${esc(v.unit)}</small></span></div><div class="fx-how"><b>How to observe:</b> ${esc(v.how)}</div></div>`).join('')}`;
  }

  function overallCard(sel, ev) {
    const W = ev.W, tw = SC.CRITERIA.reduce((s, c) => s + W[c.id], 0), env = sel.env, cp = KP.F.compiled;
    const g = KP.F.grade(sel.overall), open = st.openOverall;
    let body = '';
    if (open) {
      const terms = SC.CRITERIA.map((c) => `${KP.F.fmt(W[c.id])}×${sel.scores[c.id]}`).join(' + ');
      body = `<div class="fx">
        <div class="fx-line"><span class="fx-k">Weighted average</span>${code(`weighted_average = Σ(weight × score) / Σ(weight)`)}</div>
        <div class="fx-line"><span class="fx-k">Values</span>${code(`= (${terms}) / ${KP.F.fmt(tw)} = ${KP.F.fmt(env.weighted_average)}`)}</div>
        <div class="fx-line"><span class="fx-k">Overall</span>${code(`overall = ${KP.F.config.overall}`)}</div>
        <div class="fx-line"><span class="fx-k">Values</span>${code(`= ${KP.F.substitute(cp.overall.ast, env)}`)}</div>
        <div class="fx-line"><span class="fx-k">Result</span><span>Grade ${gchip(sel.overall)} ${esc(g.label)} · bucket <b>${g.range}</b> · score <b>${sel.overall}</b></span></div>
        ${ev.kiosks.length > 1 ? `<div class="fx-line"><span class="fx-k">Lobby score</span>${code(`average of kiosks = (${ev.kiosks.map((k) => k.overall).join(' + ')}) / ${ev.kiosks.length} = ${ev.overall}`)}</div>` : ''}
        <p class="muted xsmall">Weights come from Scoring priorities below. Criterion scores are rounded and kept within 0–100 before averaging.</p>
        <button class="btn sm subtle" data-act="edit-formulas" data-key="overall">ƒ Edit overall formula</button>
      </div>`;
    }
    return `<section class="card ${open ? 'open' : ''}"><button class="card-h fold-h" data-act="overall-toggle"><h4><span class="crit-caret">▸</span> How ${esc(sel.label)}'s overall is calculated</h4>${gtrip(sel.overall)}</button>${body}</section>`;
  }

  function checksTab(sel, ev) {
    const recs = sel.recs.filter((r) => r.sev !== 'good'), goods = sel.recs.filter((r) => r.sev === 'good');
    let h = `<section class="card"><div class="card-h"><h4>Findings</h4><span class="muted small">${recs.length ? `${recs.length} to address` : 'none'}</span></div>
      <ul class="findings">${recs.map((r) => `<li class="sev-${r.sev}"><span class="sev"></span><span>${esc(r.text)}</span></li>`).join('') || '<li class="muted">Nothing to fix in the core criteria.</li>'}</ul>
      ${goods.length ? `<details class="sub"><summary>${goods.length} strength${goods.length > 1 ? 's' : ''}</summary><ul class="findings">${goods.map((r) => `<li class="sev-good"><span class="sev"></span><span>${esc(r.text)}</span></li>`).join('')}</ul></details>` : ''}
    </section>`;

    for (const who of ['Guests', 'Manager']) {
      const list = sel.checks.filter((c) => c.who === who);
      h += `<section class="card"><div class="card-h"><h4>${who === 'Guests' ? 'Guest experience' : 'Hotel operations'}</h4><span class="muted small">${summary(list)}</span></div>
        <ul class="checks">${list.map((c) => `<li class="st-${c.status}"><span class="st" title="${STATUS[c.status][1]}">${STATUS[c.status][0]}</span><div class="ck-body">
          <div class="ck-head"><span class="ck-name">${esc(c.name)}</span>${c.observed != null ? `<span class="ck-obs">${esc(c.observed)}</span>` : ''}</div>
          <div class="ck-text">${esc(c.text)}</div>
          ${c.status !== 'na' ? `<details class="ck-more"><summary>${esc(c.measure)} · thresholds</summary><div><b>Rule:</b> ${esc(c.rule)}</div><div><b>How to observe:</b> ${esc(c.how)}</div></details>` : ''}
        </div></li>`).join('')}</ul></section>`;
    }

    h += `<section class="card"><div class="card-h"><h4>Cable routing</h4><span class="muted small">from the cheapest port</span></div>${cableRow('Power', sel.m.power, 'power', st.an.powerPorts)}${cableRow('Ethernet', sel.m.eth, 'eth', st.an.ethPorts)}</section>`;

    if (ev.pairs.length) {
      h += `<section class="card"><div class="card-h"><h4>Between kiosks</h4></div><ul class="plain">${ev.pairs.map((p) => `<li><span>${esc(p.a.label)} ↔ ${esc(p.b.label)}</span><b>${f1(p.d)} m</b>${p.d < 0.9 ? '<span class="tag bad">too close</span>' : p.d <= 2.5 ? '<span class="tag good">bank</span>' : '<span class="tag">separate</span>'}</li>`).join('')}</ul></section>`;
    }
    h += legend();
    return h;
  }

  function summary(list) {
    const n = (s) => list.filter((c) => c.status === s).length;
    const parts = [];
    if (n('issue')) parts.push(`<span class="c-issue">${n('issue')} issue${n('issue') > 1 ? 's' : ''}</span>`);
    if (n('watch')) parts.push(`<span class="c-watch">${n('watch')} to watch</span>`);
    if (!parts.length) parts.push('<span class="c-ok">all good</span>');
    return parts.join(' · ');
  }

  function cableRow(name, c, cls, ports) {
    if (!ports.length) return `<div class="cable ${cls}"><span class="cdot"></span><div><b>${name}</b><div class="muted small">No ${name.toLowerCase()} ports on the plan. Add some in step 1.</div></div></div>`;
    if (!c) return `<div class="cable ${cls}"><span class="cdot"></span><div><b>${name}</b><div class="muted small">No route can reach this spot.</div></div></div>`;
    const warn = c.crossings ? `<span class="tag bad">crosses ${c.crossings} walkway${c.crossings > 1 ? 's' : ''}</span>` : c.exposed > 3 ? '<span class="tag warn">needs cover</span>' : '<span class="tag good">mostly hidden</span>';
    return `<div class="cable ${cls}"><span class="cdot"></span><div><b>${name}</b> <span class="muted">from ${esc(c.port.label)}</span> ${warn}
      <div class="muted small">${f1(c.length)} m run · ${f1(c.exposed)} m on open floor · order ≈ ${Math.ceil(c.length + 1.5)} m</div></div></div>`;
  }

  function bestCard(sel) {
    const b = st.heat && st.heat.best;
    if (!b) return '';
    const delta = sel ? b.score - sel.overall : null;
    const close = sel && delta <= 3;
    return `<section class="card best">
      <div class="card-h"><h4>★ Best spot found</h4>${gtrip(b.score)}</div>
      <p class="small">(${f1(b.px)}, ${f1(b.py)}) m, screen facing ${SC.compassLong(b.facing)}.
      ${sel ? (close ? ` ${esc(sel.label)} is already within ${Math.max(0, delta)} points of it.` : ` That's <b>+${delta}</b> points on ${esc(sel.label)} (${esc(KP.F.gbsText(sel.overall))}).`) : ''}</p>
      <div class="btn-row">
        <button class="btn sm" data-act="best-show">Show me</button>
        ${sel ? (close ? '' : `<button class="btn sm primary" data-act="best-move" data-id="${sel.id}">Move ${esc(sel.label)} there</button>`) : '<button class="btn sm primary" data-act="best-place">Place a kiosk there</button>'}
      </div>
    </section>`;
  }

  function aiCard(stale) {
    const s = KP.settings;
    let body;
    if (st.aiLoading) {
      body = `<div class="ai-loading"><div class="spinner dark"></div><div><b>Asking ${esc(s.model)}…</b><div class="muted small">Sending the layout, measurements, checks and rubric. This usually takes 10–40 s.</div></div></div>
        <button class="btn sm" data-act="ai-cancel">Cancel</button>`;
    } else if (!s.apiKey) {
      body = `<p class="small">Add an OpenAI API key for a written review. The AI reads the engine's measurements, the guest & operations checks and the scoring rubric, then explains the placement and gives prioritised fixes.</p>
        <button class="btn primary sm" data-act="settings">Add API key</button>`;
    } else {
      body = '';
      if (st.aiError) body += `<div class="note bad">${esc(st.aiError)}</div>`;
      if (st.ai) {
        if (stale) body += '<div class="note warn">The placement has changed since this review. Run it again for an up-to-date one.</div>';
        body += aiResult(st.ai);
      }
      body += `<div class="btn-row"><button class="btn primary sm" data-act="ai-run">${st.ai ? 'Run review again' : 'Get AI review'}</button><span class="muted xsmall">${esc(s.model)} · <a href="#" data-act="settings">settings</a></span></div>`;
    }
    body += '<p class="muted xsmall sim-foot">The AI review interprets the simulated measurements; it has not seen the real lobby.</p>';
    return `<section class="card ai-card"><div class="card-h"><h4>✦ AI expert review</h4>${st.ai && !stale && st.ai.overall_score != null ? gtrip(st.ai.overall_score) : ''}</div>${body}</section>`;
  }

  function aiResult(a) {
    const label = (id) => { const k = KP.state.kiosks.find((q) => q.id === id); return k ? k.label : ''; };
    let h = a.headline ? `<p class="headline">${esc(a.headline)}</p>` : '';
    if (a.kiosks.length) h += a.kiosks.map((k) => `<p class="small"><b>${esc(label(k.id) || k.id)}</b> ${k.overall_score != null ? gtrip(k.overall_score) : ''} ${esc(k.summary)}</p>`).join('');
    if (a.recommendations.length) {
      h += `<h5>Recommendations</h5><ol class="recs">${a.recommendations.sort((x, y) => x.priority - y.priority).map((r) => `<li><div class="rec-action">${r.kiosk_id && label(r.kiosk_id) ? `<b>${esc(label(r.kiosk_id))}:</b> ` : ''}${esc(r.action)}</div>${r.why ? `<div class="muted small">${esc(r.why)}</div>` : ''}${r.expected_impact ? `<div class="impact">${esc(r.expected_impact)}</div>` : ''}</li>`).join('')}</ol>`;
    }
    if (a.issues.length) h += `<h5>Issues</h5><ul class="findings">${a.issues.map((i) => `<li class="sev-${i.severity}"><span class="sev"></span><span>${i.kiosk_id && label(i.kiosk_id) ? `<b>${esc(label(i.kiosk_id))}:</b> ` : ''}${esc(i.text)}</span></li>`).join('')}</ul>`;
    if (a.strengths.length) h += `<h5>Strengths</h5><ul class="findings">${a.strengths.map((s) => `<li class="sev-good"><span class="sev"></span><span>${esc(s)}</span></li>`).join('')}</ul>`;
    if (a.guest_and_manager_notes) h += `<h5>Guests & operations</h5><p class="small">${esc(a.guest_and_manager_notes)}</p>`;
    if (a.multi_kiosk_notes) h += `<h5>Multiple kiosks</h5><p class="small">${esc(a.multi_kiosk_notes)}</p>`;
    if (a.best_spot_comment) h += `<h5>About the best spot</h5><p class="small">${esc(a.best_spot_comment)}</p>`;
    return h;
  }

  function weightsCard(W) {
    const tw = SC.CRITERIA.reduce((s, c) => s + W[c.id], 0);
    return `<details class="card fold" data-open="weights" ${st.open.weights ? 'open' : ''}><summary><h4>Scoring priorities</h4><span class="muted small">adjust</span></summary>
      <p class="muted small">Tune what matters most in your hotel. The heatmap, scores and AI review all use these weights.</p>
      ${SC.CRITERIA.map((c) => `<label class="wrow"><span>${c.name}</span><input type="range" min="0" max="40" step="1" value="${W[c.id]}" data-w="${c.id}"><b>${Math.round((W[c.id] / tw) * 100)}%</b></label>`).join('')}
      <button class="btn sm subtle" data-act="reset-weights">Reset to defaults</button></details>`;
  }

  function howCard() {
    return `<details class="card fold" data-open="how" ${st.open.how ? 'open' : ''}><summary><h4>How it's evaluated</h4></summary>
      <ul class="how">${SC.CRITERIA.map((c) => `<li><b>${c.name}</b>: ${esc(c.short)}</li>`).join('')}</ul>
      <p class="small sim-full"><b>Simulation disclaimer.</b> ${esc(R.DISCLAIMER)}</p>
      <p class="muted small">The engine ray-casts line of sight on a 0.25 m grid (anything ≥ ${KP.SIGHT_BLOCK_H} m tall blocks the view), finds guest routes with A* pathfinding, re-routes them with the kiosk in place, measures free space around the kiosk in 8 directions, and routes cables along walls or under furniture. The Checks tab adds guest and operations considerations that aren't in the score. The AI reviewer gets all of this plus a written rubric, and may adjust each score by at most ±10 with a stated reason.</p>
      <div class="btn-row"><button class="btn sm" data-act="edit-formulas">ƒ View & edit formulas</button><button class="btn sm subtle" data-act="copy-prompt">Copy AI prompt + data</button></div></details>`;
  }

  function legend() {
    return `<div class="legend">
      <span><i class="lg route"></i>Guest route</span><span><i class="lg power"></i>Power</span><span><i class="lg eth"></i>Ethernet</span>
      <span><i class="lg warn">!</i>Walkway crossing</span><span><i class="lg zone"></i>Front clear zone</span></div>`;
  }

  function kioskGlyph() {
    return '<svg viewBox="0 0 48 48" width="44" height="44"><rect x="17" y="6" width="14" height="22" rx="2" fill="#1e293b"/><rect x="19" y="8" width="10" height="14" rx="1" fill="#38bdf8"/><rect x="21" y="28" width="6" height="12" fill="#334155"/><rect x="14" y="40" width="20" height="3" rx="1.5" fill="#0f172a"/></svg>';
  }

  // ---- events ----------------------------------------------------------------------------------
  function onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    e.preventDefault();
    const act = b.dataset.act, H = R.handlers || {};
    if (act === 'tab') { st.tab = b.dataset.tab; render(); el.scrollTop = 0; return; }
    if (act === 'k-sel') { st.selK = b.dataset.id; KP.iso.select(b.dataset.id); render(); return; }
    if (act === 'crit-toggle') { const id = b.dataset.id; st.openCrit.has(id) ? st.openCrit.delete(id) : st.openCrit.add(id); render(); return; }
    if (act === 'overall-toggle') { st.openOverall = !st.openOverall; render(); return; }
    if (act === 'edit-formulas') { KP.fxEditor.open(b.dataset.key); return; }
    H[act] && H[act](b.dataset);
  }

  let wTimer = null;
  function onInput(e) {
    const id = e.target.dataset.w;
    if (!id) return;
    KP.state.weights = Object.assign(SC.weights(), { [id]: +e.target.value });
    const lbls = el.querySelectorAll('.wrow b'), W = SC.weights(), tw = SC.CRITERIA.reduce((s, c) => s + W[c.id], 0);
    SC.CRITERIA.forEach((c, i) => { if (lbls[i]) lbls[i].textContent = `${Math.round((W[c.id] / tw) * 100)}%`; });
    clearTimeout(wTimer);
    wTimer = setTimeout(() => R.handlers.weights && R.handlers.weights(), 350);
  }
})();
