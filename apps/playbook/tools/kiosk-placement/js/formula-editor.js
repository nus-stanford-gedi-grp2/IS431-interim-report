(function () {
  // Modal editor for the scoring formulas (KP.F). Edits go into a draft that is validated and
  // previewed live on one kiosk; "Apply formulas" saves them and re-scores everything.
  const X = (KP.fxEditor = {});
  const F = KP.F, SC = KP.score;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let draft = null, tab = 'criteria', lastInput = null, subject = null, timer = null, refQuery = '';

  const critName = (id) => (SC.CRITERIA.find((c) => c.id === id) || {}).name || id;

  X.isOpen = () => !$('fx-modal').hidden;
  X.close = () => { $('fx-modal').hidden = true; };

  X.open = function (key) {
    draft = F.clone();
    subject = KP.app.previewSubject();
    tab = !key ? 'criteria' : key.startsWith('factor') ? 'factors' : key === 'overall' || key.startsWith('grade') ? 'overall' : 'criteria';
    $('fx-subject').textContent = subject ? subject.label : 'a kiosk (place one in step 2 to see previews)';
    $('fx-modal').hidden = false;
    render();
    if (key) {
      const t = $('fx-body').querySelector(`textarea[data-key="${key}"]`);
      if (t) { t.scrollIntoView({ block: 'center' }); t.focus(); lastInput = t; t.closest('.fxe').classList.add('flash'); }
    }
  };

  // ---- rendering -------------------------------------------------------------------------------
  function render() {
    document.querySelectorAll('[data-fxtab]').forEach((b) => b.classList.toggle('active', b.dataset.fxtab === tab));
    const body = $('fx-body');
    if (tab === 'criteria') {
      body.innerHTML = `<p class="muted small">Each criterion gives a 0–100 score (rounded, kept within 0–100). Its weight in the overall score is set under <b>Scoring priorities</b> in the results panel.</p>` +
        SC.CRITERIA.map((c) => block(`criterion:${c.id}`, c.name, c.short, draft.criteria[c.id], F.DEFAULTS.criteria[c.id], `${c.id} =`)).join('');
    } else if (tab === 'factors') {
      body.innerHTML = `<p class="muted small">Factors turn the observed measurements into derived values, mostly 0–1 sub-scores (1 = ideal). They're evaluated top to bottom, so a factor can use the ones above it. Every number in them is a threshold in the measurement's own unit (m, m², °, count). Rename, edit, delete or add your own, then use them in the criteria.</p>` +
        draft.factors.map((f, i) => factorBlock(f, i)).join('') +
        '<button class="btn sm" data-fadd>＋ Add factor</button>';
    } else {
      const gr = draft.grades;
      body.innerHTML = block('overall', 'Overall score', 'Can use weighted_average, weighted_geomean, lowest_criterion, grade_a_min / grade_b_min / grade_c_min, the criterion scores (visibility, flow, …), factors and measurements.', draft.overall, F.DEFAULTS.overall, 'overall =') +
        `<div class="fxe"><div class="fxe-h"><b>Grade buckets</b><span class="muted xsmall">Every criterion and overall score gets one of four grades. Set the lowest score for A, B and C; anything below C is a D.</span></div>
        <table class="fx-grades"><thead><tr><th>Grade</th><th>Lowest score</th><th>Range</th><th>Label</th></tr></thead><tbody>
        ${gr.map((g, i) => `<tr><td><span class="bk-dot" style="background:${F.BUCKET_COLORS[i]}"></span><input class="fx-small" data-gletter="${i}" value="${esc(g.letter)}" maxlength="3"></td>
          <td>${i < 3 ? `<input class="fx-small" type="number" min="1" max="99" data-gmin="${i}" value="${esc(g.min)}">` : '<span class="muted">0</span>'}</td>
          <td class="muted" data-grange="${i}">${i === 0 ? `${g.min}–100` : i < 3 ? `${g.min}–${gr[i - 1].min}` : `0–${gr[2].min}`}</td>
          <td><input class="fx-small wide" data-glabel="${i}" value="${esc(g.label)}" maxlength="24"></td></tr>`).join('')}
        </tbody></table><div class="fxe-status" data-status="grades"></div></div>`;
    }
    renderRef();
    validate();
  }

  const rowsFor = (s) => Math.max(1, Math.min(6, Math.ceil(String(s).length / 70)));

  function block(key, title, sub, expr, def, lhs) {
    const changed = def != null && expr !== def;
    return `<div class="fxe ${changed ? 'changed' : ''}">
      <div class="fxe-h"><b>${esc(title)}</b><span class="muted xsmall">${esc(sub)}</span>${changed ? `<button class="linkbtn" data-reset="${key}">Reset</button>` : ''}</div>
      <div class="fxe-eq"><span class="fxe-lhs">${esc(lhs)}</span><textarea class="fx-input" data-key="${key}" rows="${rowsFor(expr)}" spellcheck="false">${esc(expr)}</textarea></div>
      <div class="fxe-status" data-status="${key}"></div>
    </div>`;
  }

  function factorBlock(f, i) {
    const def = F.defaultFactor(f.name), changed = !def || def.expr !== f.expr;
    return `<div class="fxe ${changed ? 'changed' : ''}">
      <div class="fxe-h"><input class="fx-name-input" data-fname="${i}" value="${esc(f.name)}" spellcheck="false" aria-label="Factor name">
        <input class="fx-note-input" data-fnote="${i}" value="${esc(f.note)}" placeholder="What it measures (optional)">
        ${def && changed ? `<button class="linkbtn" data-reset="factor:${i}">Reset</button>` : ''}<button class="linkbtn danger" data-fdel="${i}" title="Delete factor">Delete</button></div>
      <div class="fxe-eq"><span class="fxe-lhs">=</span><textarea class="fx-input" data-key="factor:${i}" rows="${rowsFor(f.expr)}" spellcheck="false">${esc(f.expr)}</textarea></div>
      <div class="fxe-status" data-status="factor:${i}"></div>
    </div>`;
  }

  function renderRef() {
    const q = refQuery.toLowerCase(), hit = (...s) => !q || s.join(' ').toLowerCase().includes(q);
    const vals = subject ? subject.vars : null;
    let h = '';
    const groups = [...new Set(F.VARS.map((v) => v.g))];
    for (const g of groups) {
      const list = F.VARS.filter((v) => v.g === g && hit(v.name, v.desc, v.how, g));
      if (!list.length) continue;
      h += `<div class="ref-g">${esc(g)}</div>` + list.map((v) => `<button class="ref-item" data-insert="${v.name}" title="${esc(v.desc)}">
        <span class="ref-name">${v.name}</span><span class="ref-unit">${esc(v.unit)}</span>${vals ? `<span class="ref-val">${F.fmt(vals[v.name])}</span>` : ''}
        <span class="ref-desc">${esc(v.desc)}</span><span class="ref-how">${esc(v.how)}</span></button>`).join('');
    }
    const fac = draft.factors.filter((f) => f.name && hit(f.name, f.note, 'factor'));
    if (fac.length && tab !== 'factors') h += '<div class="ref-g">Factors</div>' + fac.map((f) => `<button class="ref-item" data-insert="${esc(f.name)}"><span class="ref-name">${esc(f.name)}</span><span class="ref-desc">${esc(f.note || f.expr)}</span></button>`).join('');
    if (tab === 'overall') {
      const ov = F.OVERALL_VARS.filter((v) => hit(v.name, v.desc, 'overall'));
      const crit = F.CRITERIA_IDS.filter((n) => hit(n, critName(n), 'criterion'));
      if (ov.length) h += '<div class="ref-g">Overall inputs</div>' + ov.map((v) => `<button class="ref-item" data-insert="${v.name}"><span class="ref-name">${v.name}</span><span class="ref-desc">${esc(v.desc)}</span></button>`).join('');
      if (crit.length) h += '<div class="ref-g">Criterion scores</div>' + crit.map((n) => `<button class="ref-item" data-insert="${n}"><span class="ref-name">${n}</span><span class="ref-desc">${esc(critName(n))} score (0–100)</span></button>`).join('');
    }
    const fns = Object.entries(F.FUNCS).filter(([n, fn]) => hit(n, fn.doc, 'function'));
    if (fns.length) h += '<div class="ref-g">Functions</div>' + fns.map(([n, fn]) => `<button class="ref-item" data-insert="${n}("><span class="ref-name">${n}()</span><span class="ref-desc">${esc(fn.doc)}</span></button>`).join('');
    if (hit('operators')) h += '<div class="ref-g">Operators</div><p class="ref-ops"><code>+ - * /</code> maths · <code>( )</code> grouping · <code>&lt; &lt;= &gt; &gt;= == !=</code> compare (1 = true, 0 = false) · <code>&amp;&amp; || !</code> and / or / not</p>';
    $('fx-ref').innerHTML = h || '<p class="muted small">Nothing matches.</p>';
  }

  // ---- validation + live preview -------------------------------------------------------------
  function validate() {
    const cp = F.compile(draft);
    const res = subject ? safeRun(cp) : null; // partial previews still work while other formulas have errors
    $('fx-body').querySelectorAll('[data-status]').forEach((el) => {
      const key = el.dataset.status, err = cp.errors[key];
      const input = $('fx-body').querySelector(`textarea[data-key="${key}"]`);
      if (input) input.classList.toggle('bad', !!err);
      if (key === 'grades') {
        const ge = Object.entries(cp.errors).filter(([k]) => k.startsWith('grade:'));
        el.innerHTML = ge.length ? `<span class="err">${esc(ge[0][1])}</span>` : '';
        return;
      }
      if (err) { el.innerHTML = `<span class="err">✕ ${esc(err)}</span>`; return; }
      if (!res) { el.innerHTML = '<span class="ok">✓ Valid</span>'; return; }
      let v = null, extra = '';
      let html;
      if (key.startsWith('criterion:')) html = trip(res.scores[key.slice(10)]);
      else if (key === 'overall') html = trip(res.overall);
      else { const f = draft.factors[+key.slice(7)]; html = `<b>${F.fmt(f && res.env[f.name])}</b>`; }
      el.innerHTML = `<span class="ok">✓</span> <span class="muted">${esc(subject.label)}:</span> ${html}`;
    });
    const n = Object.keys(cp.errors).length;
    const dirty = JSON.stringify(draft) !== JSON.stringify(F.config);
    let status = '';
    if (n) status = `<span class="err">${n} formula${n > 1 ? 's have' : ' has'} an error. Fix ${n > 1 ? 'them' : 'it'} to apply.</span>`;
    else if (dirty && res && cp.ok && subject.current != null) status = `Unsaved changes · ${esc(subject.label)}: ${esc(F.gbsText(subject.current))} → ${trip(res.overall)}`;
    else if (dirty) status = 'Unsaved changes';
    $('fx-status').innerHTML = status;
    $('fx-apply').disabled = n > 0 || !dirty;
  }
  function safeRun(cp) { try { return F.runWith(cp, subject.vars, subject.W); } catch (e) { return null; } }
  // Grade (with the draft's letters), then bucket, then score.
  function trip(v) {
    if (!Number.isFinite(v)) return '';
    const gr = draft.grades.map((g) => ({ ...g, min: +g.min || 0 })), i = F.bucketIndexFor(gr, v), g = gr[i];
    const hi = i === 0 ? 100 : gr[i - 1].min;
    return `<span class="gchip sm" style="background:${F.BUCKET_COLORS[i]}">${esc(g.letter)}</span> ${g.min}–${hi} · <b>${v}</b>`;
  }
  const revalidate = () => { clearTimeout(timer); timer = setTimeout(validate, 120); };

  function setKey(key, val) {
    if (key.startsWith('criterion:')) draft.criteria[key.slice(10)] = val;
    else if (key.startsWith('factor:')) draft.factors[+key.slice(7)].expr = val;
    else if (key === 'overall') draft.overall = val;
  }

  function insert(text) {
    const t = lastInput;
    if (!t || !document.body.contains(t)) { KP.toast(`Click into a formula first, then click "${text}" to insert it.`); return; }
    const a = t.selectionStart, b = t.selectionEnd;
    t.value = t.value.slice(0, a) + text + t.value.slice(b);
    t.selectionStart = t.selectionEnd = a + text.length;
    t.focus();
    t.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function uniqueName(base) {
    let n = 1, name = base;
    while (draft.factors.some((f) => f.name === name)) name = `${base}_${++n}`;
    return name;
  }

  // ---- events ------------------------------------------------------------------------------------
  X.init = function () {
    const body = $('fx-body');
    body.addEventListener('input', (e) => {
      const t = e.target;
      if (t.dataset.key) { setKey(t.dataset.key, t.value); t.rows = rowsFor(t.value); }
      else if (t.dataset.fname != null) draft.factors[+t.dataset.fname].name = t.value.trim();
      else if (t.dataset.fnote != null) draft.factors[+t.dataset.fnote].note = t.value;
      else if (t.dataset.gletter != null) draft.grades[+t.dataset.gletter].letter = t.value.trim();
      else if (t.dataset.glabel != null) draft.grades[+t.dataset.glabel].label = t.value.trim();
      else if (t.dataset.gmin != null) {
        draft.grades[+t.dataset.gmin].min = t.value === '' ? NaN : +t.value;
        const gr = draft.grades;
        $('fx-body').querySelectorAll('[data-grange]').forEach((el) => { const i = +el.dataset.grange; el.textContent = i === 0 ? `${gr[0].min}–100` : i < 3 ? `${gr[i].min}–${gr[i - 1].min}` : `0–${gr[2].min}`; });
      }
      revalidate();
    });
    body.addEventListener('focusin', (e) => { if (e.target.tagName === 'TEXTAREA') lastInput = e.target; });
    body.addEventListener('keydown', (e) => e.stopPropagation());
    body.addEventListener('click', (e) => {
      const r = e.target.closest('[data-reset]'), d = e.target.closest('[data-fdel]'), a = e.target.closest('[data-fadd]');
      if (r) {
        const key = r.dataset.reset;
        if (key.startsWith('criterion:')) draft.criteria[key.slice(10)] = F.DEFAULTS.criteria[key.slice(10)];
        else if (key === 'overall') draft.overall = F.DEFAULTS.overall;
        else if (key.startsWith('factor:')) { const f = draft.factors[+key.slice(7)], def = F.defaultFactor(f.name); if (def) f.expr = def.expr; }
        render();
      } else if (d) {
        draft.factors.splice(+d.dataset.fdel, 1);
        render();
      } else if (a) {
        draft.factors.push({ name: uniqueName('my_factor'), expr: '1', note: '' });
        render();
        const ts = body.querySelectorAll('textarea'), t = ts[ts.length - 1];
        t.scrollIntoView({ block: 'center' }); t.focus(); t.select(); lastInput = t;
      }
    });
    $('fx-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-fxtab]'); if (b) { tab = b.dataset.fxtab; lastInput = null; render(); } });
    $('fx-ref').addEventListener('mousedown', (e) => { if (e.target.closest('[data-insert]')) e.preventDefault(); }); // keep the textarea focused
    $('fx-ref').addEventListener('click', (e) => { const b = e.target.closest('[data-insert]'); if (b) insert(b.dataset.insert); });
    $('fx-ref-search').addEventListener('input', (e) => { refQuery = e.target.value.trim(); renderRef(); });
    $('fx-ref-search').addEventListener('keydown', (e) => e.stopPropagation());
    $('fx-close').onclick = X.close;
    $('fx-cancel').onclick = X.close;
    $('fx-reset-all').onclick = () => { draft = JSON.parse(JSON.stringify(F.DEFAULTS)); render(); };
    $('fx-apply').onclick = () => {
      const cp = F.set(draft);
      if (!cp.ok) { validate(); return; }
      X.close();
      KP.toast(F.isDefault() ? 'Default formulas restored.' : 'Formulas applied. Scores and heatmap updated.');
    };
    $('fx-modal').addEventListener('pointerdown', (e) => { if (e.target === $('fx-modal')) X.close(); });
  };
})();
