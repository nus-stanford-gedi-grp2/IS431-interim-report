(function () {
  const LS_LAYOUT = 'kp.layout.v1';
  const LS_SETTINGS = 'kp.settings.v1';

  // Everything that gets saved/undone lives in KP.state.
  const S = (KP.state = { room: { w: 24, d: 16 }, elements: [], kiosks: [], weights: null });
  KP.layoutVersion = 1; // bumped whenever room/elements change, so step 2 knows to re-analyse

  let seq = 1;
  KP.uid = (prefix) => `${prefix}${(Date.now() % 1e6).toString(36)}${(seq++).toString(36)}`;

  KP.makeElement = function (type, x, y, extra) {
    const t = KP.CATALOG[type];
    const n = S.elements.filter((e) => e.type === type).length + 1;
    return Object.assign({ id: KP.uid('e'), type, label: `${t.name} ${n}`, x, y, w: t.w, d: t.d, h: t.h, rot: 0 }, extra || {});
  };

  // ---- change notification -------------------------------------------------
  const listeners = [];
  KP.onChange = (fn) => listeners.push(fn);
  let saveTimer = null;
  KP.changed = function (what) {
    if (what === 'layout' || what === 'all') KP.layoutVersion++;
    listeners.forEach((fn) => fn(what));
    clearTimeout(saveTimer);
    saveTimer = setTimeout(KP.save, 400);
  };

  // ---- undo / redo -------------------------------------------------------------
  // Call KP.checkpoint() *before* mutating state.
  let undo = [], redo = [];
  const snap = () => JSON.stringify({ room: S.room, elements: S.elements, kiosks: S.kiosks });
  function apply(json) {
    const o = JSON.parse(json);
    S.room = o.room; S.elements = o.elements; S.kiosks = o.kiosks;
  }
  KP.checkpoint = function () {
    undo.push(snap());
    if (undo.length > 150) undo.shift();
    redo = [];
  };
  KP.undo = function () {
    if (!undo.length) return false;
    redo.push(snap()); apply(undo.pop()); KP.changed('all'); return true;
  };
  KP.redo = function () {
    if (!redo.length) return false;
    undo.push(snap()); apply(redo.pop()); KP.changed('all'); return true;
  };

  // ---- persistence ---------------------------------------------------------------
  KP.serialize = () => JSON.stringify({ app: 'kiosk-placement-studio', version: 1, room: S.room, elements: S.elements, kiosks: S.kiosks, weights: S.weights }, null, 2);

  KP.loadObject = function (o) {
    if (!o || !o.room || !Array.isArray(o.elements)) throw new Error('Not a Kiosk Placement Studio layout file');
    S.room = { w: +o.room.w || 20, d: +o.room.d || 14 };
    S.elements = o.elements.filter((e) => KP.CATALOG[e.type]).map((e) => {
      const t = KP.CATALOG[e.type];
      return { id: e.id || KP.uid('e'), type: e.type, label: e.label || t.name, x: +e.x, y: +e.y, w: +e.w || t.w, d: +e.d || t.d, h: e.h ?? t.h, rot: +e.rot || 0 };
    });
    S.kiosks = (o.kiosks || []).map((k, i) => ({ id: k.id || KP.uid('k'), label: k.label || `Kiosk ${i + 1}`, x: +k.x, y: +k.y, facing: +k.facing || 0 }));
    if (o.weights) S.weights = o.weights;
  };

  KP.save = function () {
    try { localStorage.setItem(LS_LAYOUT, KP.serialize()); } catch (e) { /* storage unavailable: ignore */ }
  };

  KP.restoreSaved = function () {
    try {
      const raw = localStorage.getItem(LS_LAYOUT);
      if (raw) { KP.loadObject(JSON.parse(raw)); return true; }
    } catch (e) { /* corrupt or unavailable */ }
    return false;
  };

  KP.settings = { apiKey: '', model: 'gpt-5-mini', remember: true };
  try {
    const s = JSON.parse(localStorage.getItem(LS_SETTINGS) || 'null');
    if (s) Object.assign(KP.settings, s);
  } catch (e) { /* ignore */ }
  KP.saveSettings = function () {
    try {
      const out = Object.assign({}, KP.settings);
      if (!out.remember) out.apiKey = '';
      localStorage.setItem(LS_SETTINGS, JSON.stringify(out));
    } catch (e) { /* ignore */ }
  };

  // ---- sample lobby ------------------------------------------------------------
  KP.loadSample = function () {
    S.room = { w: 24, d: 16 };
    S.kiosks = [];
    const E = [];
    const add = (type, x, y, o) => {
      const t = KP.CATALOG[type];
      E.push(Object.assign({ id: KP.uid('e'), type, label: t.name, x, y, w: t.w, d: t.d, h: t.h, rot: 0 }, o || {}));
    };
    add('main_entrance', 12, 15.8, { w: 3.2, rot: 180, label: 'Main entrance' });
    add('side_entrance', 0.2, 4.5, { rot: 270, label: 'Side entrance (car park)' });
    add('lift', 23.8, 6.2, { rot: 90, label: 'Lift A' });
    add('lift', 23.8, 8.6, { rot: 90, label: 'Lift B' });
    add('checkin', 17, 2.3, { w: 5, label: 'Check-in counter' });
    add('staff', 15.8, 1.2, { label: 'Front desk agent 1' });
    add('staff', 18.2, 1.2, { label: 'Front desk agent 2' });
    add('concierge', 2.6, 10, { rot: 270, label: 'Concierge desk' });
    add('staff', 1.4, 10, { label: 'Concierge' });
    add('bellhop', 17.5, 14, { label: 'Bell desk' });
    add('staff', 18.4, 14, { label: 'Bellhop' });

    add('rug', 6, 6.5, { w: 4.4, d: 3.2, label: 'Lounge rug' });
    add('sofa', 6, 5.1, { label: 'Lounge sofa N' });
    add('sofa', 6, 7.9, { rot: 180, label: 'Lounge sofa S' });
    add('armchair', 4.1, 6.5, { rot: 270, label: 'Armchair W' });
    add('armchair', 7.9, 6.5, { rot: 90, label: 'Armchair E' });
    add('coffee_table', 6, 6.5, { label: 'Coffee table' });
    add('round_table', 19.5, 10.5, { label: 'Café table' });
    add('armchair', 19.5, 9.4, { w: 0.8, d: 0.8, label: 'Café chair N' });
    add('armchair', 19.5, 11.6, { w: 0.8, d: 0.8, rot: 180, label: 'Café chair S' });

    add('pillar', 9, 5, { label: 'Pillar NW' });
    add('pillar', 15, 5, { label: 'Pillar NE' });
    add('pillar', 9, 10.5, { label: 'Pillar SW' });
    add('pillar', 15, 10.5, { label: 'Pillar SE' });
    add('plant', 9.8, 15.1, { label: 'Entrance plant W' });
    add('plant', 14.2, 15.1, { label: 'Entrance plant E' });
    add('plant', 0.6, 0.6, { label: 'Corner plant NW' });
    add('plant', 23.3, 14.6, { label: 'Corner plant SE' });
    add('plant', 12.2, 9.4, { w: 0.9, d: 0.9, label: 'Feature planter' });
    add('wall', 2.6, 13.2, { w: 5.2, label: 'Feature wall' });
    add('signage', 21.6, 3.2, { rot: 90, label: 'Welcome screen' });
    add('window', 4.5, 15.9, { w: 5, rot: 180, label: 'Front windows W' });
    add('window', 18, 15.9, { w: 3.6, rot: 180, label: 'Front windows E' });
    add('window', 0.1, 7.6, { w: 2.4, rot: 270, label: 'West window' });

    add('power', 0.15, 7, { rot: 270, label: 'Outlet W1' });
    add('power', 11, 0.15, { label: 'Outlet N1' });
    add('power', 23.85, 12.5, { rot: 90, label: 'Outlet E1' });
    add('power', 20, 15.85, { rot: 180, label: 'Outlet S1' });
    add('ethernet', 12.2, 0.15, { label: 'Data N1' });
    add('ethernet', 23.85, 3.6, { rot: 90, label: 'Data E1' });
    add('ethernet', 0.15, 12, { rot: 270, label: 'Data W1' });
    add('floorbox', 12, 6.4, { label: 'Floor box centre' });
    S.elements = E;
  };

  // The sample lobby as plain data, without disturbing the current layout (used by the templates).
  KP.sampleLayout = function () {
    const keep = JSON.stringify({ room: S.room, elements: S.elements, kiosks: S.kiosks });
    KP.loadSample();
    const out = JSON.parse(JSON.stringify({ room: S.room, elements: S.elements }));
    const o = JSON.parse(keep);
    S.room = o.room; S.elements = o.elements; S.kiosks = o.kiosks;
    return out;
  };

  KP.resetEmpty = function () {
    S.room = { w: 20, d: 14 };
    S.elements = [];
    S.kiosks = [];
  };
})();
