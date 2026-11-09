(function () {
  // Wires the two steps together: analysis caching, evaluation, header actions, settings, keyboard.
  const A = (KP.app = { step: 1 });
  const SC = KP.score;
  let an = null, anSig = '', heat = null, ev = null, aiAbort = null;

  KP.layoutSig = () => JSON.stringify([KP.state.room, KP.state.elements]);

  // Toast message, optionally with one action button (e.g. Undo).
  KP.toast = function (msg, kind = 'info', action) {
    const box = document.getElementById('toasts');
    const t = document.createElement('div');
    t.className = `toast ${kind}`;
    const span = document.createElement('span');
    span.textContent = msg;
    t.appendChild(span);
    if (action) {
      const b = document.createElement('button');
      b.textContent = action.label;
      b.onclick = () => { action.fn(); t.remove(); };
      t.appendChild(b);
    }
    box.appendChild(t);
    const life = action ? 6000 : 3600;
    setTimeout(() => t.classList.add('out'), life);
    setTimeout(() => t.remove(), life + 400);
  };

  const throttle = (fn, ms) => {
    let last = 0, timer = null;
    return () => {
      const now = Date.now();
      clearTimeout(timer);
      if (now - last >= ms) { last = now; fn(); } else timer = setTimeout(() => { last = Date.now(); fn(); }, ms - (now - last));
    };
  };

  // ---- analysis & evaluation ------------------------------------------------------------
  function setBusy(b) {
    document.getElementById('iso-busy').classList.toggle('show', b);
    if (b) KP.results.update({ busy: true });
  }

  function ensureAnalysis() {
    const sig = KP.layoutSig();
    if (an && sig === anSig) { evaluateNow(); return; }
    setBusy(true);
    setTimeout(() => {
      try {
        an = SC.analyze(KP.state);
        anSig = sig;
        heat = SC.heatmap(an, SC.weights());
        const bad = KP.state.kiosks.filter((k) => !SC.validSpot(an, k, KP.state.kiosks, k.id));
        if (bad.length) KP.toast(`${bad.map((k) => k.label).join(', ')} now overlap${bad.length === 1 ? 's' : ''} something in the new layout. Move ${bad.length === 1 ? 'it' : 'them'}.`, 'warn');
      } catch (e) {
        console.error(e);
        KP.toast('Analysis failed: ' + e.message, 'error');
      }
      setBusy(false);
      KP.results.update({ busy: false });
      KP.iso.setData({ an, heat });
      evaluateNow();
    }, 30);
  }

  function evaluateNow() {
    if (!an) return;
    ev = SC.evaluate(an, KP.state.kiosks, SC.weights());
    KP.iso.setData({ ev });
    const sel = KP.iso.selected();
    KP.results.update({ an, ev, heat, selK: sel || (ev.kiosks[0] && ev.kiosks[0].id) });
  }

  function recomputeHeat() {
    if (!an) return;
    heat = SC.heatmap(an, SC.weights());
    KP.iso.setData({ heat });
    evaluateNow();
  }

  // A kiosk to preview formula edits on: the selected kiosk, else the best spot found.
  A.previewSubject = function () {
    const W = SC.weights();
    const pick = (env) => Object.fromEntries(KP.F.VARS.map((v) => [v.name, env[v.name]]));
    if (an && anSig === KP.layoutSig() && ev && ev.kiosks.length) {
      const r = ev.kiosks.find((k) => k.id === KP.iso.selected()) || ev.kiosks[0];
      return { label: r.label, vars: pick(r.env), W, current: r.overall };
    }
    const a = an && anSig === KP.layoutSig() ? an : KP.state.elements.length ? SC.analyze(KP.state) : null;
    if (!a) return null;
    if (KP.state.kiosks.length) {
      const r = SC.evaluate(a, KP.state.kiosks, W).kiosks[0];
      return { label: r.label, vars: pick(r.env), W, current: r.overall };
    }
    if (heat && heat.best && a === an) {
      const b = heat.best, r = SC.evaluate(a, [{ id: '_best', label: 'Best spot', x: b.px, y: b.py, facing: b.facing }], W).kiosks[0];
      return { label: 'the best spot', vars: pick(r.env), W, current: r.overall };
    }
    return null;
  };

  function renderHeatLegend() {
    document.getElementById('hl-buckets').innerHTML = KP.F.buckets().slice().reverse().map(([lo, hi], j) => {
      const i = 3 - j;
      return `<span style="background:${KP.F.BUCKET_COLORS[i]}" title="${lo}–${hi}">${KP.F.config.grades[i].letter}</span>`;
    }).join('');
  }

  function onChange(what) {
    if (what === 'layout' || what === 'all') KP.editor.refresh();
    if (A.step === 2) {
      if (what === 'kiosks') evaluateNow(); else ensureAnalysis();
    }
    updateUndo();
  }

  // ---- steps ------------------------------------------------------------------------------
  function goStep(n) {
    if (n === 2) {
      const els = KP.state.elements, has = (fn) => els.some((e) => fn(KP.CATALOG[e.type]));
      if (!has((t) => t.entry && t.entry.kind === 'main')) {
        KP.toast('Add a main entrance first. Placement is judged from where guests arrive.', 'error');
        return;
      }
      if (!has((t) => t.power)) KP.toast('No power outlets marked, so the power score will be 0.', 'warn');
      if (!has((t) => t.ethernet)) KP.toast('No ethernet ports marked, so the data score will be 0.', 'warn');
    }
    A.step = n;
    document.querySelectorAll('.step').forEach((b) => b.classList.toggle('active', +b.dataset.step === n));
    document.getElementById('view-design').classList.toggle('active', n === 1);
    document.getElementById('view-place').classList.toggle('active', n === 2);
    if (n === 1) { KP.iso.hidden(); KP.editor.shown(); }
    else {
      KP.iso.shown();
      KP.iso.setTool(KP.state.kiosks.length ? 'select' : 'place');
      ensureAnalysis();
    }
  }
  A.goStep = goStep;

  // ---- header actions -----------------------------------------------------------------------
  function updateUndo() {
    document.getElementById('ai-dot').classList.toggle('on', !!KP.settings.apiKey);
  }

  function replaceLayout(fn, msg) {
    KP.checkpoint();
    fn();
    if (msg) KP.toast(msg, 'info', { label: 'Undo', fn: () => KP.undo() });
    KP.editor.select(null);
    KP.editor.resetView();
    KP.changed('all');
    if (A.step === 1) KP.editor.fit();
    else KP.iso.fit();
  }

  function exportLayout() {
    const data = JSON.parse(KP.serialize());
    data.formulas = KP.F.config; // scoring formulas travel with the layout
    data.disclaimer = KP.results.DISCLAIMER;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'lobby-layout.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importLayout(file) {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const o = JSON.parse(rd.result);
        replaceLayout(() => KP.loadObject(o));
        let note = '';
        if (o.formulas) note = KP.F.set(o.formulas).ok ? ' with its scoring formulas' : ' (its scoring formulas had errors, so they were skipped)';
        KP.toast(`Imported ${file.name}${note}`);
      } catch (e) { KP.toast('Could not import: ' + e.message, 'error'); }
    };
    rd.readAsText(file);
  }

  // Reset to an empty lobby (keeps the current room size). Destructive, so the button asks for a
  // second click, and the result can be undone from the toast.
  let resetArmed = null;
  A.resetLobby = function (btn) {
    if (!KP.state.elements.length && !KP.state.kiosks.length) { KP.toast('The lobby is already empty.'); return; }
    if (btn && resetArmed !== btn) {
      resetArmed = btn;
      const orig = btn.textContent;
      btn.textContent = 'Click again to reset';
      btn.classList.add('armed');
      setTimeout(() => { if (resetArmed === btn) resetArmed = null; btn.textContent = orig; btn.classList.remove('armed'); }, 3000);
      return;
    }
    resetArmed = null;
    replaceLayout(() => { KP.state.elements = []; KP.state.kiosks = []; }, 'Lobby reset to empty.');
    if (btn) { btn.textContent = 'Reset to empty lobby'; btn.classList.remove('armed'); }
  };

  // Dropdown menus (File, Layers) and shortcut popovers: one open at a time, click outside closes.
  function closePopups(except) {
    document.querySelectorAll('.menu, .help-pop').forEach((m) => { if (m !== except) m.hidden = true; });
  }
  function initPopups() {
    const toggle = (pop) => { const open = pop.hidden; closePopups(); pop.hidden = !open; };
    document.getElementById('btn-file').onclick = (e) => { e.stopPropagation(); toggle(document.getElementById('menu-file')); };
    document.getElementById('btn-layers').onclick = (e) => { e.stopPropagation(); toggle(document.getElementById('menu-layers')); };
    document.querySelectorAll('[data-help]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); toggle(document.getElementById(b.dataset.help)); }; });
    document.querySelectorAll('.menu, .help-pop').forEach((m) => m.addEventListener('click', (e) => { if (!e.target.closest('[data-file]')) e.stopPropagation(); }));
    document.addEventListener('click', () => closePopups());
    document.getElementById('menu-file').addEventListener('click', (e) => {
      const b = e.target.closest('[data-file]');
      if (!b) return;
      closePopups();
      const act = b.dataset.file;
      if (act === 'empty') {
        replaceLayout(KP.resetEmpty, 'Started a new empty lobby.');
        if (A.step === 2) goStep(1);
      } else if (act === 'sample') replaceLayout(KP.loadSample, 'Loaded the sample lobby.');
      else if (act === 'import') document.getElementById('file-import').click();
      else if (act === 'export') exportLayout();
    });
  }

  // ---- settings ------------------------------------------------------------------------------
  const modal = () => document.getElementById('settings-modal');
  function openSettings() {
    document.getElementById('set-key').value = KP.settings.apiKey || '';
    document.getElementById('set-model').value = KP.settings.model || 'gpt-5-mini';
    document.getElementById('set-remember').checked = KP.settings.remember !== false;
    modal().hidden = false;
    setTimeout(() => document.getElementById('set-key').focus(), 30);
  }
  function closeSettings() { modal().hidden = true; }
  function saveSettings() {
    KP.settings.apiKey = document.getElementById('set-key').value.trim();
    KP.settings.model = document.getElementById('set-model').value.trim() || 'gpt-5-mini';
    KP.settings.remember = document.getElementById('set-remember').checked;
    KP.saveSettings();
    updateUndo();
    closeSettings();
    KP.results.update({ aiError: null });
    KP.toast(KP.settings.apiKey ? 'AI settings saved' : 'AI settings saved (no key)');
  }

  // ---- AI review -------------------------------------------------------------------------------
  async function runAI() {
    if (!ev || !ev.kiosks.length) return;
    if (!KP.settings.apiKey) { openSettings(); return; }
    const payload = SC.payload(KP.state, an, ev, heat);
    const fp = KP.results.fingerprint();
    aiAbort = new AbortController();
    KP.results.update({ aiLoading: true, aiError: null, tab: 'ai' });
    try {
      const res = await KP.ai.evaluate(payload, { apiKey: KP.settings.apiKey, model: KP.settings.model, signal: aiAbort.signal });
      KP.results.update({ ai: res, aiFor: fp, aiLoading: false });
    } catch (e) {
      KP.results.update({ aiLoading: false, aiError: e.name === 'AbortError' ? null : e.message });
    }
    aiAbort = null;
  }

  // ---- results-panel actions -------------------------------------------------------------------
  const kioskById = (id) => KP.state.kiosks.find((k) => k.id === id);
  const handlers = {
    'apply-facing': (d) => { const k = kioskById(d.id); if (!k) return; KP.checkpoint(); k.facing = +d.f; KP.changed('kiosks'); },
    'best-move': (d) => {
      const k = kioskById(d.id), b = heat && heat.best; if (!k || !b) return;
      if (!SC.validSpot(an, { x: b.px, y: b.py }, KP.state.kiosks, k.id)) { KP.toast('Another kiosk is in the way.', 'warn'); return; }
      KP.checkpoint(); k.x = b.px; k.y = b.py; k.facing = b.facing; KP.changed('kiosks'); KP.iso.focus(k);
    },
    'best-place': () => {
      const b = heat && heat.best; if (!b) return;
      KP.checkpoint();
      const k = { id: KP.uid('k'), label: `Kiosk ${KP.state.kiosks.length + 1}`, x: b.px, y: b.py, facing: b.facing };
      KP.state.kiosks.push(k); KP.iso.select(k.id); KP.iso.setTool('select'); KP.changed('kiosks'); KP.iso.focus(k);
    },
    'best-show': () => { const b = heat && heat.best; if (b) KP.iso.focus({ x: b.px, y: b.py }); },
    'ai-run': runAI,
    'ai-cancel': () => aiAbort && aiAbort.abort(),
    settings: openSettings,
    weights: recomputeHeat,
    'reset-weights': () => { KP.state.weights = null; KP.save(); recomputeHeat(); },
    'copy-prompt': async () => {
      const text = `SYSTEM PROMPT\n=============\n${KP.ai.SYSTEM_PROMPT}\n\nUSER DATA\n=========\n${JSON.stringify(SC.payload(KP.state, an, ev, heat), null, 2)}`;
      try { await navigator.clipboard.writeText(text); KP.toast('Prompt and data copied to clipboard'); }
      catch (e) { KP.toast('Clipboard unavailable in this browser', 'warn'); }
    },
  };

  // ---- keyboard ---------------------------------------------------------------------------------
  function onKey(e) {
    if (KP.fxEditor.isOpen()) { if (e.key === 'Escape') KP.fxEditor.close(); return; }
    if (!modal().hidden) { if (e.key === 'Escape') closeSettings(); if (e.key === 'Enter' && e.target.tagName === 'INPUT') saveSettings(); return; }
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === 'z' || e.key === 'Z')) { e.shiftKey ? KP.redo() : KP.undo(); e.preventDefault(); return; }
    if (mod && (e.key === 'y' || e.key === 'Y')) { KP.redo(); e.preventDefault(); return; }
    if (e.key === 'Escape') closePopups();
    if (e.key === ' ' && A.step === 1) { KP.editor.spaceDown = true; e.preventDefault(); return; }
    if (e.key === ' ' && document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.blur();
    if (A.step === 1) KP.editor.onKey(e); else KP.iso.onKey(e);
  }

  function init() {
    if (!KP.restoreSaved()) KP.loadSample();
    KP.editor.init();
    KP.iso.init();
    KP.results.init();
    KP.results.handlers = handlers;
    KP.fxEditor.init();
    document.getElementById('btn-formulas').onclick = () => KP.fxEditor.open();
    renderHeatLegend();
    // New formulas change every score, so re-score kiosks and rebuild the heatmap.
    KP.F.onChange(() => { renderHeatLegend(); if (an) recomputeHeat(); else KP.results.update({}); });
    if (KP.F.customOutdated) {
      setTimeout(() => KP.toast('Your saved scoring formulas are customised, so the new defaults (lenient power & data, guest-flow detour and footfall) weren’t applied.', 'info', { label: 'Open formulas', fn: () => KP.fxEditor.open('criterion:flow') }), 600);
    }
    KP.iso.onSelect = (id) => { if (ev) KP.results.update({ selK: id || (ev.kiosks[0] && ev.kiosks[0].id) }); };
    KP.iso.onKiosksMoving = throttle(evaluateNow, 120);
    KP.onChange(onChange);

    document.querySelectorAll('.step').forEach((b) => { b.onclick = () => goStep(+b.dataset.step); });
    document.getElementById('btn-to-place').onclick = () => goStep(2);
    document.getElementById('btn-undo').onclick = () => KP.undo();
    document.getElementById('btn-redo').onclick = () => KP.redo();
    document.getElementById('btn-reset-lobby').onclick = (e) => A.resetLobby(e.currentTarget);
    initPopups();
    const fi = document.getElementById('file-import');
    fi.onchange = () => { if (fi.files[0]) importLayout(fi.files[0]); fi.value = ''; };
    document.getElementById('btn-settings').onclick = openSettings;
    document.getElementById('set-save').onclick = saveSettings;
    document.getElementById('set-cancel').onclick = closeSettings;
    document.getElementById('set-clear').onclick = () => { document.getElementById('set-key').value = ''; };
    modal().addEventListener('pointerdown', (e) => { if (e.target === modal()) closeSettings(); });

    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', (e) => { if (e.key === ' ') { KP.editor.spaceDown = false; e.preventDefault(); } });

    KP.editor.refresh();
    KP.results.update({});
    updateUndo();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
