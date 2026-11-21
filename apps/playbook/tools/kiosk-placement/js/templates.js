(function () {
  // Lobby templates: ready-made floor plans to start from, plus "my templates" saved in this browser.
  // Built-in layouts are described with two helpers: add(type, x, y, opts) places an element by its
  // centre, and wall(type, side, pos, opts) mounts a door/lift/port/window flush on a wall
  // (side N/S/E/W, pos = metres along that wall) facing into the room. Sizes are metres.
  const T = (KP.templates = {});
  const CAT = KP.CATALOG;
  const LS_KEY = 'kp.templates.v1';

  function sketch(room) {
    const els = [];
    const add = (type, x, y, o = {}) => {
      const t = CAT[type];
      els.push(Object.assign({ type, label: t.name, x, y, w: t.w, d: t.d, h: t.h, rot: 0 }, o));
    };
    const wall = (type, side, pos, o = {}) => {
      const t = CAT[type], d = o.d || t.d;
      const at = { N: [pos, d / 2, 0], S: [pos, room.d - d / 2, 180], W: [d / 2, pos, 270], E: [room.w - d / 2, pos, 90] }[side];
      add(type, at[0], at[1], Object.assign({ rot: at[2] }, o));
    };
    const done = () => {
      // Number repeated labels so every element is distinguishable in findings and the AI review.
      const total = {}, seen = {};
      els.forEach((e) => { total[e.label] = (total[e.label] || 0) + 1; });
      els.forEach((e) => { if (total[e.label] > 1) { seen[e.label] = (seen[e.label] || 0) + 1; e.label += ` ${seen[e.label]}`; } });
      return { room, elements: els };
    };
    return { add, wall, done };
  }

  // ---- built-in layouts ------------------------------------------------------------------------
  const BUILTIN = [
    {
      id: 'boutique', name: 'Boutique hotel', tags: ['Small', '1 lift', 'Tight spaces'],
      desc: 'A compact lobby: one small desk, one lift and a lounge corner. Space is tight, so clearance and spacing matter.',
      build() {
        const s = sketch({ w: 12, d: 9 }), { add, wall } = s;
        wall('main_entrance', 'S', 6, { w: 2.4, label: 'Main entrance' });
        wall('lift', 'E', 3, { label: 'Lift' });
        add('checkin', 4, 1.7, { w: 3, label: 'Check-in desk' });
        add('staff', 4, 0.55, { label: 'Front desk agent' });
        add('rug', 2.6, 6.5, { w: 3, d: 2.2, label: 'Lounge rug' });
        add('sofa', 2.6, 5.6, { label: 'Lounge sofa' });
        add('coffee_table', 2.6, 6.7, { w: 1.1, d: 0.55, label: 'Coffee table' });
        add('armchair', 4.5, 6.9, { rot: 270, label: 'Armchair' });
        add('bellhop', 9.6, 7.6, { label: 'Bell stand' });
        add('staff', 10.6, 7.6, { label: 'Porter' });
        add('pillar', 8, 4.5, { label: 'Pillar' });
        add('plant', 4.2, 8.4, { label: 'Plant' });
        add('plant', 7.8, 8.4, { label: 'Plant' });
        wall('window', 'S', 2.4, { w: 3, label: 'Front window' });
        wall('window', 'S', 9.6, { w: 3, label: 'Front window' });
        wall('power', 'W', 4.5, { label: 'Outlet' });
        wall('power', 'N', 9, { label: 'Outlet' });
        wall('ethernet', 'N', 7, { label: 'Data port' });
        wall('ethernet', 'E', 6.5, { label: 'Data port' });
        add('floorbox', 6, 5, { label: 'Floor box' });
        return s.done();
      },
    },
    {
      id: 'business', name: 'Business hotel', tags: ['Medium', '2 lifts', 'Car-park door'],
      desc: 'A mid-size city hotel: front desk, concierge, café seating, two lifts and a second entrance from the car park.',
      build() {
        const s = sketch({ w: 20, d: 13 }), { add, wall } = s;
        wall('main_entrance', 'S', 10, { w: 3, label: 'Main entrance' });
        wall('side_entrance', 'W', 4.5, { w: 1.6, label: 'Car-park entrance' });
        wall('lift', 'E', 5, { label: 'Lift' });
        wall('lift', 'E', 7.4, { label: 'Lift' });
        add('checkin', 12, 2.2, { w: 6, label: 'Check-in desk' });
        add('staff', 10.5, 1.1, { label: 'Front desk agent' });
        add('staff', 13.5, 1.1, { label: 'Front desk agent' });
        add('concierge', 3.5, 2, { w: 1.8, label: 'Concierge desk' });
        add('staff', 3.5, 0.9, { label: 'Concierge' });
        add('rug', 4.5, 9.4, { w: 4, d: 2.8, label: 'Lounge rug' });
        add('sofa', 4.5, 8.3, { label: 'Lounge sofa' });
        add('sofa', 4.5, 10.5, { rot: 180, label: 'Lounge sofa' });
        add('coffee_table', 4.5, 9.4, { label: 'Coffee table' });
        [15.5, 18].forEach((x) => {
          add('round_table', x, 9.5, { label: 'Café table' });
          add('armchair', x, 8.4, { w: 0.8, d: 0.8, label: 'Café chair' });
          add('armchair', x, 10.6, { w: 0.8, d: 0.8, rot: 180, label: 'Café chair' });
        });
        add('pillar', 7.5, 6.5, { label: 'Pillar' });
        add('pillar', 12.5, 6.5, { label: 'Pillar' });
        add('bellhop', 14.5, 11.7, { label: 'Bell desk' });
        add('staff', 15.6, 11.7, { label: 'Bellhop' });
        add('plant', 8, 12.3, { label: 'Entrance plant' });
        add('plant', 12, 12.3, { label: 'Entrance plant' });
        wall('window', 'S', 4.5, { w: 4, label: 'Front window' });
        wall('window', 'S', 16.5, { w: 4, label: 'Front window' });
        wall('power', 'N', 7.5, { label: 'Outlet' });
        wall('power', 'N', 16.5, { label: 'Outlet' });
        wall('power', 'E', 10.5, { label: 'Outlet' });
        wall('ethernet', 'N', 9, { label: 'Data port' });
        wall('ethernet', 'N', 15, { label: 'Data port' });
        wall('ethernet', 'W', 9, { label: 'Data port' });
        add('floorbox', 10, 5.5, { label: 'Floor box' });
        return s.done();
      },
    },
    {
      id: 'midsize', name: 'Mid-size hotel (sample)', tags: ['Medium', '2 lifts', 'Pillars'],
      desc: 'The sample lobby: four central pillars, a lounge, a café corner, a bell desk and two lifts on the east wall.',
      build: () => KP.sampleLayout(),
    },
    {
      id: 'resort', name: 'Grand resort lobby', tags: ['Large', '4 lifts', '2 side doors'],
      desc: 'A large lobby with a long desk, four lifts, a central lounge, café, concierge and garden and pool doors. Long walking distances.',
      build() {
        const s = sketch({ w: 30, d: 20 }), { add, wall } = s;
        wall('main_entrance', 'S', 15, { w: 5, label: 'Main entrance' });
        wall('side_entrance', 'W', 16.5, { w: 2, label: 'Garden entrance' });
        wall('side_entrance', 'E', 4, { w: 2, label: 'Pool entrance' });
        [12, 14.4, 16.8, 19.2].forEach((x) => wall('lift', 'N', x, { label: 'Lift' }));
        add('checkin', 2.8, 9, { w: 8, rot: 270, label: 'Check-in desk' });
        [6.2, 9, 11.8].forEach((y) => add('staff', 1.55, y, { label: 'Front desk agent' }));
        add('concierge', 27.2, 14.5, { rot: 90, label: 'Concierge desk' });
        add('staff', 28.5, 14.5, { label: 'Concierge' });
        add('bellhop', 21.5, 18.4, { label: 'Bell desk' });
        add('staff', 22.6, 18.4, { label: 'Bellhop' });
        add('rug', 17, 11, { w: 7, d: 4.6, label: 'Lounge rug' });
        [14.8, 19.2].forEach((x) => {
          add('sofa', x, 9.1, { label: 'Lounge sofa' });
          add('sofa', x, 12.9, { rot: 180, label: 'Lounge sofa' });
          add('coffee_table', x, 11, { label: 'Coffee table' });
        });
        add('armchair', 12.6, 11, { rot: 270, label: 'Armchair' });
        add('armchair', 21.4, 11, { rot: 90, label: 'Armchair' });
        [8.2, 11.4].forEach((y) => {
          add('round_table', 25.5, y, { label: 'Café table' });
          add('armchair', 25.5, y - 1.1, { w: 0.8, d: 0.8, label: 'Café chair' });
          add('armchair', 25.5, y + 1.1, { w: 0.8, d: 0.8, rot: 180, label: 'Café chair' });
        });
        [[8, 4.5], [8, 15.5], [23, 4.5], [23, 15.5]].forEach(([x, y]) => add('pillar', x, y, { label: 'Pillar' }));
        [[6, 1.2], [24, 1.2], [6, 18.7], [26, 18.5], [11.6, 19.2], [18.4, 19.2]].forEach(([x, y]) => add('plant', x, y, { label: 'Planter' }));
        add('signage', 27.6, 10.5, { rot: 90, label: 'Welcome screen' });
        wall('window', 'S', 6, { w: 6, label: 'Front window' });
        wall('window', 'S', 24, { w: 6, label: 'Front window' });
        [[ 'N', 8], ['N', 23], ['W', 3], ['W', 15], ['E', 7], ['S', 9.5], ['S', 20.5]].forEach(([sd, p]) => wall('power', sd, p, { label: 'Outlet' }));
        [['N', 9], ['N', 22], ['W', 14], ['E', 17], ['S', 11]].forEach(([sd, p]) => wall('ethernet', sd, p, { label: 'Data port' }));
        add('floorbox', 17, 11, { label: 'Floor box' });
        add('floorbox', 6, 9, { label: 'Floor box' });
        add('floorbox', 22, 16, { label: 'Floor box' });
        return s.done();
      },
    },
    {
      id: 'corridor', name: 'Long narrow lobby', tags: ['Medium', '2 lifts', 'One main route'],
      desc: 'A long, narrow lobby: the entrance at one end and the lifts at the other, so almost everything sits on a single route.',
      build() {
        const s = sketch({ w: 26, d: 9 }), { add, wall } = s;
        wall('main_entrance', 'W', 4.5, { w: 2.8, label: 'Main entrance' });
        wall('lift', 'E', 3.2, { label: 'Lift' });
        wall('lift', 'E', 5.8, { label: 'Lift' });
        add('checkin', 14, 7.8, { w: 5, rot: 180, label: 'Check-in desk' });
        add('staff', 12.8, 8.7, { label: 'Front desk agent' });
        add('staff', 15.2, 8.7, { label: 'Front desk agent' });
        add('bellhop', 2.8, 7.9, { label: 'Bell desk' });
        add('staff', 3.9, 7.9, { label: 'Bellhop' });
        add('sofa', 8.2, 1.1, { label: 'Lounge sofa' });
        add('sofa', 11.2, 1.1, { label: 'Lounge sofa' });
        add('coffee_table', 9.7, 2.5, { w: 1.1, d: 0.55, label: 'Coffee table' });
        [19, 22].forEach((x) => {
          add('round_table', x, 2.2, { label: 'Café table' });
          add('armchair', x, 1, { w: 0.8, d: 0.8, label: 'Café chair' });
          add('armchair', x, 3.4, { w: 0.8, d: 0.8, rot: 180, label: 'Café chair' });
        });
        add('pillar', 10, 4.5, { label: 'Pillar' });
        add('pillar', 17.5, 4.5, { label: 'Pillar' });
        [[1.2, 0.8], [1.2, 8.2], [24.5, 0.8], [24.5, 8.2]].forEach(([x, y]) => add('plant', x, y, { label: 'Planter' }));
        wall('window', 'N', 21.5, { w: 4, label: 'North window' });
        [['N', 6], ['N', 16], ['N', 24], ['S', 8]].forEach(([sd, p]) => wall('power', sd, p, { label: 'Outlet' }));
        [['N', 12], ['S', 22], ['E', 7.8]].forEach(([sd, p]) => wall('ethernet', sd, p, { label: 'Data port' }));
        add('floorbox', 14, 3.8, { label: 'Floor box' });
        return s.done();
      },
    },
    {
      id: 'lshape', name: 'L-shaped lobby', tags: ['Medium', '2 lifts', 'Blind corner'],
      desc: 'An L-shaped lobby: a back-of-house block cuts off the north-east corner, creating blind spots and awkward sightlines.',
      build() {
        const s = sketch({ w: 22, d: 15 }), { add, wall } = s;
        add('wall', 18.5, 3, { w: 7, d: 6, label: 'Back-of-house block' });
        wall('main_entrance', 'S', 6, { w: 3, label: 'Main entrance' });
        wall('side_entrance', 'W', 13.2, { w: 1.6, label: 'Car-park entrance' });
        wall('lift', 'E', 9, { label: 'Lift' });
        wall('lift', 'E', 11.4, { label: 'Lift' });
        add('checkin', 3, 8, { w: 5, rot: 270, label: 'Check-in desk' });
        add('staff', 1.7, 6.3, { label: 'Front desk agent' });
        add('staff', 1.7, 9.7, { label: 'Front desk agent' });
        add('bellhop', 11, 13.8, { label: 'Bell desk' });
        add('staff', 12.1, 13.8, { label: 'Bellhop' });
        add('rug', 8, 3, { w: 5, d: 3, label: 'Lounge rug' });
        add('sofa', 8, 2, { label: 'Lounge sofa' });
        add('sofa', 8, 4, { rot: 180, label: 'Lounge sofa' });
        add('coffee_table', 8, 3, { w: 1.1, d: 0.5, label: 'Coffee table' });
        add('armchair', 5.6, 3, { rot: 270, label: 'Armchair' });
        add('armchair', 10.4, 3, { rot: 90, label: 'Armchair' });
        add('round_table', 17.5, 9.5, { label: 'Café table' });
        add('armchair', 17.5, 8.4, { w: 0.8, d: 0.8, label: 'Café chair' });
        add('armchair', 17.5, 10.6, { w: 0.8, d: 0.8, rot: 180, label: 'Café chair' });
        add('pillar', 12, 6.5, { label: 'Pillar' });
        add('pillar', 12, 10.5, { label: 'Pillar' });
        [[4, 14.3], [8, 14.3], [14.2, 0.6], [21.2, 13.9]].forEach(([x, y]) => add('plant', x, y, { label: 'Planter' }));
        wall('window', 'N', 9, { w: 6, label: 'North window' });
        wall('window', 'S', 16, { w: 5, label: 'Front window' });
        wall('window', 'W', 2.2, { w: 2.4, label: 'West window' });
        [['W', 3.2], ['S', 11], ['E', 13.8], ['N', 4]].forEach(([sd, p]) => wall('power', sd, p, { label: 'Outlet' }));
        [['W', 11.8], ['S', 2.4], ['E', 14.6], ['N', 13.5]].forEach(([sd, p]) => wall('ethernet', sd, p, { label: 'Data port' }));
        add('floorbox', 8, 7.5, { label: 'Floor box' });
        return s.done();
      },
    },
  ];

  // ---- listing -----------------------------------------------------------------------------------
  const cache = {};
  const clone = (o) => JSON.parse(JSON.stringify(o));
  T.builtin = () => BUILTIN.map((b) => Object.assign({ builtin: true }, b, { layout: (cache[b.id] = cache[b.id] || b.build()) }));

  function loadMine() { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]').filter((t) => t && t.layout && t.layout.room); } catch (e) { return []; } }
  function saveMine(list) { try { localStorage.setItem(LS_KEY, JSON.stringify(list)); return true; } catch (e) { return false; } }
  T.mine = () => loadMine().map((t) => Object.assign({ builtin: false, tags: [] }, t));

  // What a template contains, for its card.
  T.summary = function (layout) {
    const c = (fn) => layout.elements.filter((e) => CAT[e.type] && fn(CAT[e.type], e)).length;
    return {
      lifts: c((t) => t.entry && t.entry.kind === 'lift'), doors: c((t) => t.entry && t.entry.kind !== 'lift'),
      staff: c((t) => t.staff), ports: c((t) => t.port), items: layout.elements.length,
    };
  };

  // Save the current lobby (room + elements, not kiosks) as a template in this browser.
  T.saveCurrent = function (name) {
    const list = loadMine();
    const s = KP.state;
    list.push({ id: KP.uid('t'), name: name.trim() || 'My lobby', desc: `Saved from your lobby on ${new Date().toLocaleDateString()}.`, layout: clone({ room: s.room, elements: s.elements }) });
    return saveMine(list);
  };
  T.removeMine = (id) => saveMine(loadMine().filter((t) => t.id !== id));

  // ---- gallery UI ----------------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Top-down thumbnail drawn with the same artwork as the editor.
  function thumb(layout) {
    const R = layout.room, pad = 0.5;
    const order = (e) => { const t = CAT[e.type]; return t.flat && !t.entry && !t.port ? 0 : t.entry ? 2 : t.port ? 3 : t.marker ? 4 : 1; };
    const els = layout.elements.filter((e) => CAT[e.type]).sort((a, b) => order(a) - order(b))
      .map((e) => `<g transform="translate(${e.x} ${e.y}) rotate(${e.rot || 0})">${KP.editor.shape(e.type, e.w, e.d).replace(/url\(#hatch\)/g, 'rgba(0,0,0,.22)')}</g>`).join('');
    return `<svg viewBox="${-pad} ${-pad} ${R.w + 2 * pad} ${R.d + 2 * pad}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <rect x="${-pad / 2}" y="${-pad / 2}" width="${R.w + pad}" height="${R.d + pad}" fill="#44403c" rx="0.1"/>
      <rect width="${R.w}" height="${R.d}" fill="#faf8f5"/>${els}</svg>`;
  }

  function card(t) {
    const s = T.summary(t.layout), R = t.layout.room;
    return `<article class="tpl-card">
      <div class="tpl-thumb">${thumb(t.layout)}</div>
      <div class="tpl-body">
        <h4>${esc(t.name)}</h4>
        <div class="tpl-meta">${R.w} × ${R.d} m · ${Math.round(R.w * R.d)} m²</div>
        <p>${esc(t.desc || '')}</p>
        <div class="tpl-tags">${(t.tags || []).map((g) => `<span class="chip">${esc(g)}</span>`).join('')}<span class="chip">${s.lifts} lift${s.lifts === 1 ? '' : 's'}</span><span class="chip">${s.staff} staff</span><span class="chip">${s.items} items</span></div>
        <div class="tpl-actions"><button class="btn primary sm" data-use="${esc(t.id)}">Use this template</button>${t.builtin ? '' : `<button class="btn subtle sm danger-text" data-del="${esc(t.id)}">Delete</button>`}</div>
      </div></article>`;
  }

  function render() {
    const mine = T.mine();
    $('tpl-body').innerHTML = `<h3 class="tpl-h">Starter layouts</h3><div class="tpl-grid">${T.builtin().map(card).join('')}</div>
      <h3 class="tpl-h">My templates</h3>${mine.length ? `<div class="tpl-grid">${mine.map(card).join('')}</div>` : '<p class="muted small">None yet. Design a lobby, then save it below to reuse it later. Templates are stored in this browser.</p>'}`;
    const has = KP.state.elements.length > 0;
    $('tpl-save').disabled = !has;
    $('tpl-name').disabled = !has;
    $('tpl-replace-note').hidden = !has;
  }

  T.isOpen = () => !$('tpl-modal').hidden;
  T.close = () => { $('tpl-modal').hidden = true; };
  T.open = function () {
    render();
    $('tpl-modal').hidden = false;
    $('tpl-body').scrollTop = 0;
  };

  function use(id) {
    const t = [...T.builtin(), ...T.mine()].find((x) => x.id === id);
    if (!t) return;
    T.close();
    KP.app.applyLayout(clone(t.layout), `Loaded the “${t.name}” template.`);
  }

  // The "start from a template" prompt over an empty plan.
  function refreshEmpty() { const el = $('design-empty'); if (el) el.hidden = KP.state.elements.length > 0; }

  T.init = function () {
    $('tpl-body').addEventListener('click', (e) => {
      const u = e.target.closest('[data-use]'), d = e.target.closest('[data-del]');
      if (u) use(u.dataset.use);
      else if (d && confirm('Delete this saved template?')) { T.removeMine(d.dataset.del); render(); }
    });
    $('tpl-save').onclick = () => {
      if (T.saveCurrent($('tpl-name').value)) { $('tpl-name').value = ''; KP.toast('Saved your lobby as a template.'); render(); }
      else KP.toast('Could not save: browser storage is unavailable.', 'error');
    };
    $('tpl-name').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') $('tpl-save').click(); if (e.key === 'Escape') T.close(); });
    $('tpl-close').onclick = T.close;
    $('tpl-modal').addEventListener('pointerdown', (e) => { if (e.target === $('tpl-modal')) T.close(); });
    $('btn-templates').onclick = T.open;
    $('btn-empty-templates').onclick = T.open;
    KP.onChange(refreshEmpty);
    refreshEmpty();
  };
})();
