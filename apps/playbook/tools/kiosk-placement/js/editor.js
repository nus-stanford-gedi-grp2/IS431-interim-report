(function () {
  // Step 1: top-down floor plan editor (SVG, world units = metres).
  const E = (KP.editor = {});
  const G = KP.geo, CAT = KP.CATALOG;
  const S = () => KP.state;

  let svg, wrap, inspector;
  const view = { s: 30, tx: 40, ty: 40 };
  let selId = null, drag = null, autoFit = true; // autoFit: keep refitting on resize until the user pans/zooms
  let snapOn = true, showLabels = true;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const r2 = (v) => Math.round(v * 100) / 100;
  const snap = (v, alt) => (snapOn && !alt ? Math.round(v / 0.25) * 0.25 : Math.round(v * 100) / 100);
  const find = (id) => S().elements.find((e) => e.id === id);

  // ---- element artwork (local coordinates, centred, front = +y) -----------------
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f));
    return `rgb(${c.join(',')})`;
  }
  const BOLT = 'M0.12 -0.42 L-0.2 0.06 L0 0.06 L-0.1 0.42 L0.22 -0.08 L0.02 -0.08 Z';

  E.shape = function (type, w, d) {
    const t = CAT[type], c = t.color, hw = w / 2, hd = d / 2, m = Math.min(w, d);
    const rect = (x, y, ww, hh, fill, extra = '') => `<rect x="${x}" y="${y}" width="${ww}" height="${hh}" fill="${fill}" ${extra}/>`;
    const line = 'stroke="rgba(0,0,0,.35)" stroke-width="0.03"';
    switch (type) {
      case 'main_entrance':
      case 'side_entrance': {
        const r = Math.min(hw, 1.6);
        return rect(-hw, -hd, w, d, c, `opacity="0.9" ${line}`) +
          `<path d="M${-hw} ${hd} L${-hw} ${hd + r} M${-hw} ${hd + r} A${r} ${r} 0 0 0 ${-hw + r} ${hd}" fill="none" stroke="${c}" stroke-width="0.04" stroke-dasharray="0.12 0.08"/>` +
          `<path d="M${hw} ${hd} L${hw} ${hd + r} M${hw} ${hd + r} A${r} ${r} 0 0 1 ${hw - r} ${hd}" fill="none" stroke="${c}" stroke-width="0.04" stroke-dasharray="0.12 0.08"/>` +
          `<path d="M0 ${-hd * 0.6} L0 ${hd + 0.7} M-0.22 ${hd + 0.45} L0 ${hd + 0.72} L0.22 ${hd + 0.45}" fill="none" stroke="#166534" stroke-width="0.08" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
      case 'lift':
        return rect(-hw, -hd, w, d, c, line) + rect(-hw + 0.08, -hd + 0.06, w - 0.16, d - 0.12, shade(c, 0.45)) +
          `<line x1="0" y1="${-hd + 0.06}" x2="0" y2="${hd - 0.06}" stroke="#475569" stroke-width="0.04"/>` +
          `<path d="M-0.3 ${hd + 0.25} l0.15 -0.15 l0.15 0.15 M0 ${hd + 0.1} l0.15 0.15 l0.15 -0.15" fill="none" stroke="#64748b" stroke-width="0.05"/>`;
      case 'checkin':
      case 'concierge':
        return rect(-hw, -hd, w, d, c, `rx="0.06" ${line}`) + rect(-hw, -hd, w, d * 0.38, shade(c, -0.3), 'rx="0.06"') +
          rect(-hw + 0.05, hd - 0.12, w - 0.1, 0.08, shade(c, 0.5));
      case 'bellhop':
        return rect(-hw, -hd, w, d, c, `rx="0.05" ${line}`) + `<circle r="${m * 0.22}" fill="#fde68a" stroke="#92400e" stroke-width="0.03"/>`;
      case 'staff':
        return `<ellipse rx="${hw * 0.95}" ry="${hd * 0.7}" fill="${c}" ${line}/><circle r="${m * 0.27}" fill="${shade(c, 0.55)}" stroke="${c}" stroke-width="0.04"/>` +
          `<path d="M-0.1 ${hd * 0.55} L0 ${hd * 0.95} L0.1 ${hd * 0.55} Z" fill="${c}"/>`;
      case 'sofa':
      case 'armchair': {
        const back = d * 0.28, arm = Math.min(0.2, w * 0.12);
        let s = rect(-hw, -hd, w, d, shade(c, 0.15), `rx="0.12" ${line}`) + rect(-hw, -hd, w, back, c, 'rx="0.1"') +
          rect(-hw, -hd, arm, d, c, 'rx="0.08"') + rect(hw - arm, -hd, arm, d, c, 'rx="0.08"');
        const seats = type === 'sofa' ? Math.max(2, Math.round((w - 2 * arm) / 0.75)) : 1;
        for (let i = 1; i < seats; i++) { const x = -hw + arm + ((w - 2 * arm) * i) / seats; s += `<line x1="${x}" y1="${-hd + back}" x2="${x}" y2="${hd - 0.05}" stroke="${c}" stroke-width="0.03"/>`; }
        return s;
      }
      case 'coffee_table':
        return rect(-hw, -hd, w, d, c, `rx="0.08" ${line}`) + rect(-hw + 0.08, -hd + 0.08, w - 0.16, d - 0.16, shade(c, 0.2), 'rx="0.05"');
      case 'round_table':
        return `<ellipse rx="${hw}" ry="${hd}" fill="${c}" ${line}/><ellipse rx="${hw * 0.75}" ry="${hd * 0.75}" fill="${shade(c, 0.2)}"/>`;
      case 'plant': {
        let s = `<ellipse rx="${hw}" ry="${hd}" fill="#78716c" ${line}/>`;
        for (let i = 0; i < 7; i++) s += `<ellipse cx="0" cy="${-hd * 0.45}" rx="${hw * 0.28}" ry="${hd * 0.5}" fill="${i % 2 ? c : shade(c, 0.25)}" transform="rotate(${i * 51.4})"/>`;
        return s + `<circle r="${m * 0.15}" fill="${shade(c, -0.2)}"/>`;
      }
      case 'rug':
        return rect(-hw, -hd, w, d, c, 'rx="0.05"') + rect(-hw + 0.15, -hd + 0.15, w - 0.3, d - 0.3, 'none', `stroke="${shade(c, -0.2)}" stroke-width="0.05" stroke-dasharray="0.2 0.1"`);
      case 'pillar':
        return rect(-hw, -hd, w, d, c, `${line}`) + rect(-hw, -hd, w, d, 'url(#hatch)');
      case 'wall':
        return rect(-hw, -hd, w, d, c) + rect(-hw, -hd, w, d, 'url(#hatch)', 'opacity="0.5"');
      case 'window':
        return rect(-hw, -hd, w, d, '#e0f2fe', `stroke="#0284c7" stroke-width="0.03"`) +
          `<line x1="${-hw}" y1="0" x2="${hw}" y2="0" stroke="#0284c7" stroke-width="0.025"/>` +
          Array.from({ length: Math.max(1, Math.round(w / 1.2)) - 1 }, (_, i) => { const x = -hw + (w * (i + 1)) / Math.max(1, Math.round(w / 1.2)); return `<line x1="${x}" y1="${-hd}" x2="${x}" y2="${hd}" stroke="#0284c7" stroke-width="0.03"/>`; }).join('');
      case 'signage':
        return rect(-hw, -hd, w, d, c, line) + rect(-hw + 0.05, hd - 0.1, w - 0.1, 0.07, '#38bdf8');
      case 'power':
        return rect(-hw, -hd, w, d, c, `rx="0.05" ${line}`) + `<path d="${BOLT}" transform="scale(${m * 0.9})" fill="#fff"/>`;
      case 'ethernet':
        return rect(-hw, -hd, w, d, c, `rx="0.05" ${line}`) +
          `<path d="M-0.3 0.25 V-0.05 H-0.15 V-0.25 H0.15 V-0.05 H0.3 V0.25 Z" transform="scale(${m * 0.85})" fill="none" stroke="#fff" stroke-width="${0.12}"/>`;
      case 'floorbox':
        return rect(-hw, -hd, w, d, c, `rx="0.04" ${line}`) + rect(-hw + 0.04, -hd + 0.04, w - 0.08, d - 0.08, 'none', 'stroke="#fff" stroke-width="0.025"') +
          `<path d="${BOLT}" transform="translate(${-m * 0.18} 0) scale(${m * 0.65})" fill="#fde047"/><rect x="${m * 0.06}" y="${-m * 0.12}" width="${m * 0.24}" height="${m * 0.24}" fill="none" stroke="#bfdbfe" stroke-width="0.03"/>`;
      default:
        return rect(-hw, -hd, w, d, c);
    }
  };

  E.icon = function (type, size = 40) {
    const t = CAT[type];
    const w = t.w, d = t.d;
    const extra = t.entry && t.flat ? 1.2 : type === 'lift' ? 0.3 : 0;
    const m = Math.max(w, d + extra) / 2 * 1.15;
    const cy = extra ? extra / 2 : 0;
    return `<svg viewBox="${-m} ${-m + cy} ${2 * m} ${2 * m}" width="${size}" height="${size}"><defs>${defs()}</defs>${E.shape(type, w, d)}</svg>`;
  };

  function defs() {
    return `<pattern id="hatch" width="0.2" height="0.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="0.2" stroke="rgba(0,0,0,.25)" stroke-width="0.05"/></pattern>`;
  }

  // ---- rendering -----------------------------------------------------------------------
  const ZORDER = (t) => (t.flat && !t.entry && !t.port ? 0 : t.entry ? 2 : t.port ? 3 : t.marker ? 4 : 1);

  function render() {
    if (!svg) return;
    const R = S().room, s = view.s, px = 1 / s; // px = one screen pixel in metres
    let h = `<defs>${defs()}
      <pattern id="grid-minor" width="0.5" height="0.5" patternUnits="userSpaceOnUse"><path d="M0.5 0 L0 0 0 0.5" fill="none" stroke="#e7e5e4" stroke-width="${px}"/></pattern>
      <pattern id="grid-major" width="1" height="1" patternUnits="userSpaceOnUse"><rect width="1" height="1" fill="url(#grid-minor)"/><path d="M1 0 L0 0 0 1" fill="none" stroke="#d6d3d1" stroke-width="${px}"/></pattern>
    </defs>`;
    h += `<g transform="translate(${view.tx} ${view.ty}) scale(${s})">`;
    // walls + floor
    const wt = 0.25;
    h += `<rect x="${-wt}" y="${-wt}" width="${R.w + 2 * wt}" height="${R.d + 2 * wt}" fill="#44403c" rx="${0.05}"/>`;
    h += `<rect x="0" y="0" width="${R.w}" height="${R.d}" fill="#faf8f5"/><rect x="0" y="0" width="${R.w}" height="${R.d}" fill="url(#grid-major)"/>`;
    // rulers
    const stepM = s > 40 ? 1 : s > 18 ? 2 : 5;
    const fs = 11 * px;
    for (let x = 0; x <= R.w + 1e-6; x += stepM) h += `<text x="${x}" y="${-wt - 6 * px}" font-size="${fs}" text-anchor="middle" class="ruler">${x}</text>`;
    for (let y = 0; y <= R.d + 1e-6; y += stepM) h += `<text x="${-wt - 6 * px}" y="${y + 4 * px}" font-size="${fs}" text-anchor="end" class="ruler">${y}</text>`;
    h += `<text x="${R.w / 2}" y="${-wt - 22 * px}" font-size="${12 * px}" text-anchor="middle" class="dim">${r2(R.w)} m</text>`;
    h += `<text x="${-wt - 30 * px}" y="${R.d / 2}" font-size="${12 * px}" text-anchor="middle" class="dim" transform="rotate(-90 ${-wt - 30 * px} ${R.d / 2})">${r2(R.d)} m</text>`;
    // compass
    h += `<g transform="translate(${R.w + wt + 26 * px} ${-wt - 18 * px}) scale(${px})"><circle r="12" fill="#fff" stroke="#d6d3d1"/><path d="M0 -9 L4 3 L0 0 L-4 3 Z" fill="#dc2626"/><text y="-15" font-size="10" text-anchor="middle" class="ruler">N</text></g>`;

    // elements
    const els = S().elements.slice().sort((a, b) => ZORDER(CAT[a.type]) - ZORDER(CAT[b.type]));
    let labels = '';
    for (const el of els) {
      const t = CAT[el.type];
      if (!t) continue;
      h += `<g class="el${el.id === selId ? ' sel' : ''}" data-id="${el.id}" transform="translate(${el.x} ${el.y}) rotate(${el.rot || 0})">${E.shape(el.type, el.w, el.d)}</g>`;
      // Key elements are always labelled; small items only once zoomed in, to avoid clutter.
      const key = t.entry || t.counter || el.type === 'wall' || el.type === 'signage';
      if (showLabels && (key || s >= 42 || el.id === selId)) {
        const b = G.aabb(el), big = b.w * b.d > 1.6 && !t.port && !t.entry;
        const ly = big ? el.y + 4 * px : b.y1 + 13 * px;
        labels += `<text x="${el.x}" y="${ly}" font-size="${11 * px}" text-anchor="middle" class="lbl${big ? ' in' : ''}">${esc(el.label)}</text>`;
      }
    }
    h += labels;

    // kiosks placed in step 2, shown read-only so they stay in mind while editing
    for (const k of S().kiosks) {
      const hk = KP.KIOSK.size / 2, f = G.facingVec(k.facing);
      h += `<g class="kiosk-mark"><rect x="${k.x - hk}" y="${k.y - hk}" width="${hk * 2}" height="${hk * 2}" rx="0.06" fill="#1e293b"/>` +
        `<line x1="${k.x + f.x * hk * 0.7 - f.y * hk * 0.7}" y1="${k.y + f.y * hk * 0.7 + f.x * hk * 0.7}" x2="${k.x + f.x * hk * 0.7 + f.y * hk * 0.7}" y2="${k.y + f.y * hk * 0.7 - f.x * hk * 0.7}" stroke="#38bdf8" stroke-width="0.08"/>` +
        `<text x="${k.x}" y="${k.y - hk - 6 * px}" font-size="${10 * px}" text-anchor="middle" class="lbl">${esc(k.label)}</text></g>`;
    }

    // selection
    const sel = find(selId);
    if (sel) {
      const b = G.aabb(sel), hs = 9 * px;
      h += `<rect x="${b.x0}" y="${b.y0}" width="${b.w}" height="${b.d}" class="sel-box" stroke-width="${1.5 * px}" stroke-dasharray="${5 * px} ${3 * px}"/>`;
      const H = { nw: [b.x0, b.y0], n: [(b.x0 + b.x1) / 2, b.y0], ne: [b.x1, b.y0], e: [b.x1, (b.y0 + b.y1) / 2], se: [b.x1, b.y1], s: [(b.x0 + b.x1) / 2, b.y1], sw: [b.x0, b.y1], w: [b.x0, (b.y0 + b.y1) / 2] };
      // Skip edge handles on items too thin to grab their middle (corners still resize them).
      const thinW = b.w * s < 34, thinD = b.d * s < 34;
      for (const k in H) {
        if ((thinW && (k === 'e' || k === 'w')) || (thinD && (k === 'n' || k === 's'))) continue;
        h += `<rect class="handle h-${k}" data-handle="${k}" x="${H[k][0] - hs / 2}" y="${H[k][1] - hs / 2}" width="${hs}" height="${hs}" rx="${2 * px}" stroke-width="${1.5 * px}"/>`;
      }
      const rx = (b.x0 + b.x1) / 2, ry = b.y0 - 26 * px;
      h += `<line x1="${rx}" y1="${b.y0}" x2="${rx}" y2="${ry}" stroke="#2563eb" stroke-width="${px}"/><circle class="handle rot" data-handle="rot" cx="${rx}" cy="${ry}" r="${6 * px}" stroke-width="${1.5 * px}"/>`;
      h += `<text x="${rx}" y="${b.y1 + (showLabels ? 28 : 16) * px}" font-size="${10.5 * px}" text-anchor="middle" class="dim-sel">${r2(b.w)} × ${r2(b.d)} m</text>`;
    }

    // room resize handles
    const rh = 10 * px;
    h += `<rect class="room-handle" data-handle="room-e" x="${R.w + wt / 2 - rh / 2}" y="${R.d / 2 - rh * 1.5}" width="${rh}" height="${rh * 3}" rx="${rh / 2}"/>`;
    h += `<rect class="room-handle" data-handle="room-s" x="${R.w / 2 - rh * 1.5}" y="${R.d + wt / 2 - rh / 2}" width="${rh * 3}" height="${rh}" rx="${rh / 2}"/>`;
    h += `<rect class="room-handle corner" data-handle="room-se" x="${R.w + wt / 2 - rh * 0.7}" y="${R.d + wt / 2 - rh * 0.7}" width="${rh * 1.4}" height="${rh * 1.4}" rx="${rh * 0.3}"/>`;
    h += '</g>';
    svg.innerHTML = h;
  }

  // ---- geometry helpers -----------------------------------------------------------------
  function toWorld(cx, cy) {
    const r = svg.getBoundingClientRect();
    return { x: (cx - r.left - view.tx) / view.s, y: (cy - r.top - view.ty) / view.s };
  }

  function clampInside(el) {
    const R = S().room, b = G.aabb(el);
    if (b.w >= R.w) el.x = R.w / 2; else if (b.x0 < 0) el.x -= b.x0; else if (b.x1 > R.w) el.x -= b.x1 - R.w;
    if (b.d >= R.d) el.y = R.d / 2; else if (b.y0 < 0) el.y -= b.y0; else if (b.y1 > R.d) el.y -= b.y1 - R.d;
    el.x = r2(el.x); el.y = r2(el.y);
  }

  // Doors, lifts and wall ports stick flush to the nearest wall and face into the room.
  function wallSnap(el, force) {
    const t = CAT[el.type];
    if (!t.wallMount) return;
    const R = S().room, b = G.aabb(el);
    const opts = [{ s: 'N', d: b.y0 }, { s: 'S', d: R.d - b.y1 }, { s: 'W', d: b.x0 }, { s: 'E', d: R.w - b.x1 }].sort((a, c) => a.d - c.d);
    const m = opts[0];
    if (m.d > 0.8 && !force) return;
    el.rot = { N: 0, S: 180, W: 270, E: 90 }[m.s];
    if (m.s === 'N') el.y = el.d / 2;
    if (m.s === 'S') el.y = R.d - el.d / 2;
    if (m.s === 'W') el.x = el.d / 2;
    if (m.s === 'E') el.x = R.w - el.d / 2;
    clampInside(el);
  }

  // Resize the room, keeping doors/lifts/ports attached to the wall they were flush against.
  function resizeRoom(apply) {
    const R = S().room;
    const sides = new Map();
    S().elements.forEach((el) => {
      if (!CAT[el.type].wallMount) return;
      const b = G.aabb(el), e = 0.05;
      sides.set(el, b.y0 < e ? 'N' : b.x0 < e ? 'W' : R.d - b.y1 < e ? 'S' : R.w - b.x1 < e ? 'E' : null);
    });
    apply(R);
    S().elements.forEach((el) => {
      const side = sides.get(el);
      if (side === 'S') el.y = R.d - G.aabb(el).d / 2;
      if (side === 'E') el.x = R.w - G.aabb(el).w / 2;
      clampInside(el);
    });
  }

  // ---- pointer interaction ---------------------------------------------------------------
  function onDown(e) {
    if (e.button === 1 || e.button === 2 || (e.button === 0 && E.spaceDown)) {
      drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, tx: view.tx, ty: view.ty };
      svg.setPointerCapture(e.pointerId); svg.classList.add('panning'); e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    const w = toWorld(e.clientX, e.clientY);
    const handle = e.target.closest('[data-handle]');
    if (handle) {
      const hn = handle.dataset.handle;
      if (hn.startsWith('room-')) drag = { mode: 'room', handle: hn };
      else if (hn === 'rot') drag = { mode: 'rotate', id: selId };
      else drag = { mode: 'resize', id: selId, handle: hn, box: G.aabb(find(selId)) };
      drag.cp = false;
      svg.setPointerCapture(e.pointerId);
      return;
    }
    const g = e.target.closest('[data-id]');
    if (g) {
      const el = find(g.dataset.id);
      select(el.id);
      drag = { mode: 'move', id: el.id, ox: w.x - el.x, oy: w.y - el.y, sx: e.clientX, sy: e.clientY, cp: false, moved: false };
      svg.setPointerCapture(e.pointerId);
      return;
    }
    select(null);
    drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, tx: view.tx, ty: view.ty };
    svg.setPointerCapture(e.pointerId); svg.classList.add('panning');
  }

  function ensureCheckpoint() {
    if (!drag.cp) { KP.checkpoint(); drag.cp = true; }
  }

  function onMove(e) {
    if (!drag) return;
    if (drag.mode === 'pan') {
      view.tx = drag.tx + e.clientX - drag.sx; view.ty = drag.ty + e.clientY - drag.sy;
      autoFit = false;
      render(); return;
    }
    const w = toWorld(e.clientX, e.clientY), alt = e.altKey, R = S().room;
    if (drag.mode === 'move') {
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 3) return;
      drag.moved = true; ensureCheckpoint();
      const el = find(drag.id), b = G.aabb(el);
      el.x = snap(w.x - drag.ox - b.w / 2, alt) + b.w / 2;
      el.y = snap(w.y - drag.oy - b.d / 2, alt) + b.d / 2;
      clampInside(el);
      wallSnap(el);
    } else if (drag.mode === 'resize') {
      ensureCheckpoint();
      const el = find(drag.id), b = Object.assign({}, drag.box), hn = drag.handle, MIN = 0.2;
      if (hn.includes('e')) b.x1 = Math.max(b.x0 + MIN, Math.min(R.w, snap(w.x, alt)));
      if (hn.includes('w')) b.x0 = Math.min(b.x1 - MIN, Math.max(0, snap(w.x, alt)));
      if (hn.includes('s')) b.y1 = Math.max(b.y0 + MIN, Math.min(R.d, snap(w.y, alt)));
      if (hn.includes('n')) b.y0 = Math.min(b.y1 - MIN, Math.max(0, snap(w.y, alt)));
      const ew = r2(b.x1 - b.x0), ed = r2(b.y1 - b.y0), swap = el.rot === 90 || el.rot === 270;
      el.w = swap ? ed : ew; el.d = swap ? ew : ed;
      el.x = r2((b.x0 + b.x1) / 2); el.y = r2((b.y0 + b.y1) / 2);
    } else if (drag.mode === 'rotate') {
      const el = find(drag.id);
      const ang = (Math.atan2(w.y - el.y, w.x - el.x) * 180) / Math.PI + 90; // handle starts "up"
      const rot = (((Math.round(ang / 90) * 90) % 360) + 360) % 360;
      if (rot !== el.rot) { ensureCheckpoint(); el.rot = rot; clampInside(el); }
    } else if (drag.mode === 'room') {
      ensureCheckpoint();
      resizeRoom((R) => {
        if (drag.handle !== 'room-s') R.w = Math.max(4, Math.min(80, snap(w.x, alt)));
        if (drag.handle !== 'room-e') R.d = Math.max(4, Math.min(80, snap(w.y, alt)));
      });
    }
    render(); renderInspector();
  }

  function onUp(e) {
    if (!drag) return;
    svg.classList.remove('panning');
    const changed = drag.cp;
    drag = null;
    if (changed) KP.changed('layout');
  }

  function onWheel(e) {
    e.preventDefault();
    const r = svg.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
    zoomAt(mx, my, f);
  }
  function zoomAt(mx, my, f) {
    const ns = Math.max(6, Math.min(220, view.s * f));
    view.tx = mx - ((mx - view.tx) * ns) / view.s;
    view.ty = my - ((my - view.ty) * ns) / view.s;
    view.s = ns;
    autoFit = false;
    render();
  }

  E.fit = function () {
    const r = wrap.getBoundingClientRect(), R = S().room;
    if (r.width < 50) return;
    const padX = 90, padTop = 110, padBot = 110;
    view.s = Math.max(6, Math.min((r.width - padX * 2) / R.w, (r.height - padTop - padBot) / R.d));
    view.tx = (r.width - R.w * view.s) / 2;
    view.ty = padTop + (r.height - padTop - padBot - R.d * view.s) / 2;
    autoFit = true;
    render();
  };

  // ---- palette ---------------------------------------------------------------------------
  function renderPalette() {
    const pal = document.getElementById('palette');
    let h = '';
    KP.CATEGORIES.forEach((cat) => {
      h += `<div class="pal-cat" data-cat="${esc(cat)}">${cat}</div><div class="pal-grid" data-cat="${esc(cat)}">`;
      Object.entries(CAT).filter(([, t]) => t.cat === cat).forEach(([type, t]) => {
        h += `<div class="pal-item" data-type="${type}" title="${esc(t.name)}">${E.icon(type, 34)}<span>${esc(t.name)}</span></div>`;
      });
      h += '</div>';
    });
    h += '<p class="pal-empty muted small" hidden>No matching elements.</p><p class="pal-note muted xsmall">Drag onto the plan, or click to drop in the centre.</p>';
    pal.innerHTML = h;
    document.getElementById('pal-search').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      let any = false;
      pal.querySelectorAll('.pal-grid').forEach((grid) => {
        let n = 0;
        grid.querySelectorAll('.pal-item').forEach((it) => {
          const hit = !q || it.title.toLowerCase().includes(q) || grid.dataset.cat.toLowerCase().includes(q);
          it.hidden = !hit; if (hit) n++;
        });
        grid.hidden = !n;
        pal.querySelector(`.pal-cat[data-cat="${grid.dataset.cat}"]`).hidden = !n;
        any = any || n > 0;
      });
      pal.querySelector('.pal-empty').hidden = any;
    });
    pal.addEventListener('pointerdown', (e) => {
      const it = e.target.closest('.pal-item');
      if (!it || e.button !== 0) return;
      e.preventDefault();
      startPaletteDrag(it.dataset.type, e);
    });
  }

  function startPaletteDrag(type, e0) {
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.innerHTML = E.icon(type, 44);
    document.body.appendChild(ghost);
    let moved = false;
    const pos = (e) => { ghost.style.transform = `translate(${e.clientX - 22}px, ${e.clientY - 22}px)`; };
    pos(e0);
    const mv = (e) => { if (Math.hypot(e.clientX - e0.clientX, e.clientY - e0.clientY) > 4) moved = true; pos(e); ghost.classList.toggle('over', overCanvas(e)); };
    const up = (e) => {
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      ghost.remove();
      if (!moved) { const r = svg.getBoundingClientRect(); addAt(type, toWorld(r.left + r.width / 2, r.top + r.height / 2)); return; }
      if (overCanvas(e)) addAt(type, toWorld(e.clientX, e.clientY));
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  }
  function overCanvas(e) {
    const r = svg.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  }
  function addAt(type, p) {
    KP.checkpoint();
    const t = CAT[type];
    const el = KP.makeElement(type, 0, 0);
    el.x = snap(p.x - t.w / 2) + t.w / 2; el.y = snap(p.y - t.d / 2) + t.d / 2;
    clampInside(el);
    wallSnap(el);
    S().elements.push(el);
    selId = el.id;
    KP.changed('layout');
  }

  // ---- inspector ---------------------------------------------------------------------------
  const TIPS = {
    main_entrance: 'The arrow shows which way guests walk in. Arrival viewpoints sit just inside the door.',
    side_entrance: 'Secondary doors carry less traffic but still count towards visibility.',
    lift: 'Guests arrive and leave here. Kiosk queues should stay at least 2.2 m clear of the landing.',
    checkin: 'The light edge is the guest side. A 2.5 m queue zone in front of it is kept clear.',
    concierge: 'Counts as a staff point. The light edge is the guest side.',
    bellhop: 'Counts as a staff point for the staff-proximity score.',
    staff: 'Where staff usually stand. Used for staff proximity and supervision.',
    plant: 'Tall plants (≥ 1.4 m) block line of sight.',
    pillar: 'Blocks line of sight and cable routes.',
    wall: 'Blocks line of sight, walking and cable routes. Use it to shape L-shaped lobbies.',
    signage: 'Tall screens block line of sight.',
    power: 'Kiosk power cables are routed from the cheapest outlet, along walls and under furniture where possible.',
    ethernet: 'Kiosk data cables are routed from the cheapest port.',
    floorbox: 'A floor box provides both power and data, so it is ideal near a kiosk.',
    window: 'Used to check screen glare: avoid screens facing, or backlit by, nearby glass.',
    rug: 'Cables can be hidden under rugs.',
  };

  function renderInspector() {
    if (!inspector) return;
    if (inspector.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
    const el = find(selId);
    if (!el) { inspector.innerHTML = roomPanel(); return; }
    const t = CAT[el.type];
    const facts = [];
    if (t.walk) facts.push('Blocks walking');
    if (KP.blocksSight(el)) facts.push('Blocks line of sight');
    if (t.cable === 'hidden') facts.push('Cables can run under');
    if (t.cable === 'block') facts.push('Cables route around');
    if (t.entry) facts.push('Guests arrive here');
    if (t.staff) facts.push('Staff point');
    if (t.power) facts.push('Power');
    if (t.ethernet) facts.push('Data');
    const num = (f, label, v, step = 0.05) => `<label class="field sm"><span>${label}</span><input type="number" data-f="${f}" value="${r2(v)}" step="${step}" min="0"></label>`;
    inspector.innerHTML = `
      <div class="insp-head"><div class="insp-icon">${E.icon(el.type, 42)}</div>
        <div class="insp-meta"><div class="insp-type">${esc(t.name)}</div><input class="insp-label" data-f="label" value="${esc(el.label)}" spellcheck="false"></div></div>
      <div class="grid2">
        ${num('x', 'X (m)', el.x)}${num('y', 'Y (m)', el.y)}
        ${num('w', 'Width (m)', el.w)}${num('d', 'Depth (m)', el.d)}
        ${t.flat ? '' : num('h', 'Height (m)', el.h ?? t.h)}
        <label class="field sm"><span>Rotation</span><select data-f="rot">${[0, 90, 180, 270].map((r) => `<option value="${r}" ${r === el.rot ? 'selected' : ''}>${r}°</option>`).join('')}</select></label>
      </div>
      <div class="chips">${facts.map((f) => `<span class="chip">${f}</span>`).join('')}</div>
      ${TIPS[el.type] ? `<p class="tip">${TIPS[el.type]}</p>` : ''}
      <div class="btn-row">
        <button class="btn" data-act="rotate">⟳ Rotate</button>
        <button class="btn" data-act="dup">⧉ Duplicate</button>
        <button class="btn danger" data-act="del">Delete</button>
      </div>`;
  }

  function roomPanel() {
    const R = S().room, els = S().elements;
    const has = (fn) => els.some((e) => fn(CAT[e.type], e));
    const checks = [
      ['Main entrance', has((t) => t.entry && t.entry.kind === 'main'), true],
      ['Lift(s)', has((t) => t.entry && t.entry.kind === 'lift'), false],
      ['Check-in counter', has((_, e) => e.type === 'checkin'), false],
      ['Staff positions', has((t) => t.staff), false],
      ['Power outlet', has((t) => t.power), true],
      ['Ethernet port', has((t) => t.ethernet), true],
    ];
    return `
      <h3 class="insp-h">Lobby</h3>
      <div class="grid2">
        <label class="field sm"><span>Width (m)</span><input type="number" data-room="w" value="${R.w}" step="0.25" min="4" max="80"></label>
        <label class="field sm"><span>Depth (m)</span><input type="number" data-room="d" value="${R.d}" step="0.25" min="4" max="80"></label>
      </div>
      <p class="muted small">${Math.round(R.w * R.d)} m² · or drag the blue handles on the plan's edges.</p>
      <h4 class="insp-h4">Checklist</h4>
      <ul class="checklist">${checks.map(([n, ok, req]) => `<li class="${ok ? 'ok' : req ? 'missing' : 'opt'}"><span class="ck">${ok ? '✓' : req ? '!' : '○'}</span>${n}${!ok && req ? ' <em>required</em>' : ''}</li>`).join('')}</ul>
      <h4 class="insp-h4">Elements <span class="muted">(${els.length})</span></h4>
      <div class="el-list">${els.map((e) => `<div class="el-row" data-sel="${e.id}"><span class="dot" style="background:${CAT[e.type].color}"></span>${esc(e.label)}</div>`).join('') || '<p class="muted small pad">Nothing yet. Drag items in from the left, or load the sample lobby from the File menu.</p>'}</div>
      ${els.length ? '<button class="btn subtle danger-text full" data-act="reset-lobby">Reset to empty lobby</button>' : ''}`;
  }

  function onInspectorChange(e) {
    const inp = e.target;
    if (inp.dataset.room) {
      KP.checkpoint();
      resizeRoom((R) => { R[inp.dataset.room] = Math.max(4, Math.min(80, +inp.value || R[inp.dataset.room])); });
      KP.changed('layout');
      return;
    }
    const f = inp.dataset.f, el = find(selId);
    if (!f || !el) return;
    KP.checkpoint();
    if (f === 'label') el.label = inp.value.trim() || CAT[el.type].name;
    else if (f === 'rot') el.rot = +inp.value;
    else {
      let v = +inp.value;
      if (!Number.isFinite(v)) return;
      if (f === 'w' || f === 'd') v = Math.max(0.1, v);
      if (f === 'h') v = Math.max(0, v);
      el[f] = r2(v);
    }
    clampInside(el);
    inp.blur();
    KP.changed('layout');
  }

  function onInspectorClick(e) {
    const row = e.target.closest('[data-sel]');
    if (row) { select(row.dataset.sel); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'reset-lobby') { KP.app.resetLobby(b); return; }
    ({ rotate: rotateSel, dup: duplicateSel, del: deleteSel })[b.dataset.act]();
  }

  // ---- commands ------------------------------------------------------------------------------
  function select(id) { selId = id; render(); renderInspector(); }
  E.select = select;

  function rotateSel() {
    const el = find(selId); if (!el) return;
    KP.checkpoint(); el.rot = ((el.rot || 0) + 90) % 360; clampInside(el); KP.changed('layout');
  }
  function duplicateSel() {
    const el = find(selId); if (!el) return;
    KP.checkpoint();
    const copy = Object.assign({}, el, { id: KP.uid('e'), x: el.x + 0.5, y: el.y + 0.5, label: KP.makeElement(el.type, 0, 0).label });
    clampInside(copy);
    S().elements.push(copy); selId = copy.id; KP.changed('layout');
  }
  function deleteSel() {
    const i = S().elements.findIndex((e) => e.id === selId); if (i < 0) return;
    KP.checkpoint(); S().elements.splice(i, 1); selId = null; KP.changed('layout');
  }
  function nudge(dx, dy) {
    const el = find(selId); if (!el) return;
    KP.checkpoint(); el.x = r2(el.x + dx); el.y = r2(el.y + dy); clampInside(el); KP.changed('layout');
  }

  E.onKey = function (e) {
    const k = e.key, mod = e.ctrlKey || e.metaKey;
    if (k === 'Delete' || k === 'Backspace') { deleteSel(); e.preventDefault(); }
    else if (k === 'r' || k === 'R') { if (!mod) rotateSel(); }
    else if (mod && (k === 'd' || k === 'D')) { duplicateSel(); e.preventDefault(); }
    else if (k === 'Escape') select(null);
    else if (k.startsWith('Arrow') && selId) {
      const st = e.shiftKey ? 0.5 : 0.05;
      nudge(k === 'ArrowLeft' ? -st : k === 'ArrowRight' ? st : 0, k === 'ArrowUp' ? -st : k === 'ArrowDown' ? st : 0);
      e.preventDefault();
    }
  };

  E.refresh = function () {
    if (selId && !find(selId)) selId = null;
    render(); renderInspector();
  };
  E.shown = function () { if (autoFit) E.fit(); else render(); };
  E.resetView = function () { autoFit = true; };

  E.init = function () {
    svg = document.getElementById('design-svg');
    wrap = document.getElementById('design-wrap');
    inspector = document.getElementById('inspector');
    renderPalette();
    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);
    svg.addEventListener('wheel', onWheel, { passive: false });
    svg.addEventListener('contextmenu', (e) => e.preventDefault());
    inspector.addEventListener('change', onInspectorChange);
    inspector.addEventListener('click', onInspectorClick);
    inspector.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); e.stopPropagation(); });
    const z = (f) => { const r = svg.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, f); };
    document.getElementById('dz-in').onclick = () => z(1.25);
    document.getElementById('dz-out').onclick = () => z(0.8);
    document.getElementById('dz-fit').onclick = E.fit;
    document.getElementById('opt-snap').onchange = (e) => { snapOn = e.target.checked; };
    document.getElementById('opt-labels').onchange = (e) => { showLabels = e.target.checked; render(); };
    new ResizeObserver(() => { if (autoFit) E.fit(); else render(); }).observe(wrap);
  };
})();
