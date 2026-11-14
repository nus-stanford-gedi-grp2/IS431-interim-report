(function () {
  // Step 2: isometric, RTS-style kiosk placement view (Canvas 2D).
  const I = (KP.iso = {});
  const G = KP.geo, CAT = KP.CATALOG, SC = KP.score;
  const ST = () => KP.state;

  let cv, ctx, wrap, tipEl, W = 0, H = 0, dpr = 1;
  // theta: camera yaw in radians (0 = north wall at the back left). target: where an animated turn is heading.
  const cam = { theta: 0, target: null, k: 30, ox: 0, oy: 0 };
  const org = { x: 0, y: 0 };
  let an = null, heat = null, ev = null, dataVer = 0;
  let tool = 'place', selK = null, hover = null, hoverKiosk = null, ghostFacing = null, drag = null, autoFit = true;
  let active = false, dirty = true, cache = null, cacheKey = '', lastFrame = 0;
  const ov = { heat: true, cables: true, flow: true, sight: false, labels: true };
  const WALL_H = 2.8, ZS = 1.0;

  // ---- colour helpers --------------------------------------------------------------------
  // Scores are coloured by their grade bucket (A–D), so the heatmap, bars and badges all match the grades.
  const hexRGB = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
  KP.scoreRGB = (s) => hexRGB(KP.F.BUCKET_COLORS[KP.F.bucketIndex(Math.max(0, Math.min(100, s)))]);
  KP.scoreColor = (s, a = 1) => `rgba(${KP.scoreRGB(s).join(',')},${a})`;
  const shadeCache = {};
  function shade(hex, f) {
    const key = hex + f;
    if (shadeCache[key]) return shadeCache[key];
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f));
    return (shadeCache[key] = `rgb(${c.join(',')})`);
  }

  // ---- projection ------------------------------------------------------------------------
  // The camera turns freely around the room centre (yaw theta), then a 2:1 isometric projection.
  // view = the floor direction pointing towards the viewer; depth() along it says what's nearer.
  const room = () => ST().room;
  let cosT = 1, sinT = 0, rcx = 0, rcy = 0;
  const view = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
  function computeOrigin() {
    const R = room();
    rcx = R.w / 2; rcy = R.d / 2;
    cosT = Math.cos(cam.theta); sinT = Math.sin(cam.theta);
    view.x = (cosT + sinT) * Math.SQRT1_2; view.y = (cosT - sinT) * Math.SQRT1_2;
    org.x = W / 2 + cam.ox;
    org.y = H / 2 + cam.oy + cam.k * 0.8;
  }
  // Camera-space floor coordinates (X grows to screen lower-right, Y to lower-left).
  function camXY(x, y) { const dx = x - rcx, dy = y - rcy; return [dx * cosT - dy * sinT, dx * sinT + dy * cosT]; }
  const P = (x, y, z = 0) => { const [X, Y] = camXY(x, y); return [org.x + (X - Y) * cam.k, org.y + (X + Y) * cam.k * 0.5 - z * cam.k * ZS]; };
  const depth = (x, y) => (x - rcx) * view.x + (y - rcy) * view.y;
  function toWorld(sx, sy) {
    const a = (sx - org.x) / cam.k, b = (sy - org.y) / (cam.k * 0.5), X = (a + b) / 2, Y = (b - a) / 2;
    return { x: rcx + X * cosT + Y * sinT, y: rcy - X * sinT + Y * cosT };
  }
  // Face shading that stays put on screen as the camera turns (lit from the screen's upper left).
  function faceShade(nx, ny) {
    const X = nx * cosT - ny * sinT, Y = nx * sinT + ny * cosT;
    return -0.12 - 0.18 * Math.max(0, Math.min(1, (X - Y + 1) / 2));
  }

  // ---- drawing primitives ------------------------------------------------------------------
  function path(pts) { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); }
  function poly(pts, fill, stroke, lw) {
    path(pts);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
  }
  const floorQuad = (x0, y0, x1, y1, z = 0) => [P(x0, y0, z), P(x1, y0, z), P(x1, y1, z), P(x0, y1, z)];

  function box(b, z0, z1, color, edge = true) {
    prism([{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }], z0, z1, color, null, edge ? 'rgba(0,0,0,0.22)' : null);
  }

  // Vertical prism over a 4-corner world footprint: draws the faces turned towards the viewer
  // (far ones first), then the top. Edge 0→1 is the "front" face; onFront(a, b) is called for it.
  function prism(corners, z0, z1, color, onFront, stroke = 'rgba(0,0,0,0.3)') {
    const cx = corners.reduce((t, c) => t + c.x, 0) / 4, cy = corners.reduce((t, c) => t + c.y, 0) / 4;
    const faces = [];
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      let nx = b.y - a.y, ny = -(b.x - a.x);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (nx * (mx - cx) + ny * (my - cy) < 0) { nx = -nx; ny = -ny; }
      const len = Math.hypot(nx, ny) || 1;
      nx /= len; ny /= len;
      if (nx * view.x + ny * view.y > 1e-6) faces.push({ i, a, b, d: depth(mx, my), lum: faceShade(nx, ny) });
    }
    faces.sort((p, q) => p.d - q.d);
    for (const f of faces) {
      poly([P(f.a.x, f.a.y, z0), P(f.b.x, f.b.y, z0), P(f.b.x, f.b.y, z1), P(f.a.x, f.a.y, z1)], shade(color, f.lum), stroke, 0.75);
      if (f.i === 0 && onFront) onFront(f.a, f.b);
    }
    poly(corners.map((c) => P(c.x, c.y, z1)), shade(color, 0.12), stroke, 0.75);
    return faces.some((f) => f.i === 0);
  }

  function ellipseAt(x, y, z, r, fill, stroke) {
    const [sx, sy] = P(x, y, z);
    ctx.beginPath();
    ctx.ellipse(sx, sy, r * cam.k * Math.SQRT2, r * cam.k * Math.SQRT2 * 0.5, 0, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function cylinder(x, y, r, z0, z1, color) {
    const [sx, sy0] = P(x, y, z0), [, sy1] = P(x, y, z1);
    const rx = r * cam.k * Math.SQRT2, ry = rx * 0.5;
    ctx.beginPath();
    ctx.ellipse(sx, sy0, rx, ry, 0, 0, Math.PI);
    ctx.lineTo(sx - rx, sy1);
    ctx.ellipse(sx, sy1, rx, ry, 0, Math.PI, 0, true);
    ctx.closePath();
    const gr = ctx.createLinearGradient(sx - rx, 0, sx + rx, 0);
    gr.addColorStop(0, shade(color, -0.05)); gr.addColorStop(1, shade(color, -0.35));
    ctx.fillStyle = gr; ctx.fill();
    ctx.beginPath(); ctx.ellipse(sx, sy1, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = shade(color, 0.15); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 0.75; ctx.stroke();
  }
  function polyline(pts, z, color, width, dash, offset = 0) {
    if (pts.length < 2) return;
    ctx.beginPath();
    pts.forEach((p, i) => { const s = P(p.x, p.y, z); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); });
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.setLineDash(dash || []); ctx.lineDashOffset = offset;
    ctx.stroke(); ctx.setLineDash([]);
  }
  function pill(text, sx, sy, bg, fg = '#fff', font = '600 11px system-ui, sans-serif') {
    ctx.font = font;
    const w = ctx.measureText(text).width + 12, h = 18;
    ctx.beginPath(); ctx.roundRect(sx - w / 2, sy - h / 2, w, h, 9);
    ctx.fillStyle = bg; ctx.fill();
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, sx, sy + 0.5);
  }

  // ---- walls ----------------------------------------------------------------------------------
  // The four room walls. A wall is drawn full height when we look at its inside face (it's behind
  // the room); walls nearer the viewer are cut away to a low kerb, Sims-style, so they don't hide anything.
  function walls() {
    const R = room();
    return [
      { side: 'N', a: { x: 0, y: 0 }, b: { x: R.w, y: 0 }, n: { x: 0, y: 1 } },
      { side: 'E', a: { x: R.w, y: 0 }, b: { x: R.w, y: R.d }, n: { x: -1, y: 0 } },
      { side: 'S', a: { x: R.w, y: R.d }, b: { x: 0, y: R.d }, n: { x: 0, y: -1 } },
      { side: 'W', a: { x: 0, y: R.d }, b: { x: 0, y: 0 }, n: { x: 1, y: 0 } },
    ].map((w) => Object.assign(w, { back: w.n.x * view.x + w.n.y * view.y > 0.02 }));
  }
  // 'b'/'f' (back or front wall) + side, or null if the element isn't against a wall.
  function wallOf(el) {
    const b = G.aabb(el), R = room(), e = 0.06;
    const side = b.y0 < e ? 'N' : b.y1 > R.d - e ? 'S' : b.x0 < e ? 'W' : b.x1 > R.w - e ? 'E' : null;
    if (!side) return null;
    const w = walls().find((q) => q.side === side);
    return (w.back ? 'b' : 'f') + side;
  }
  // The part of a wall an element covers, as two points on the wall line.
  function wallSpan(el, side) {
    const b = G.aabb(el), R = room();
    if (side === 'N') return [{ x: b.x0, y: 0 }, { x: b.x1, y: 0 }];
    if (side === 'S') return [{ x: b.x0, y: R.d }, { x: b.x1, y: R.d }];
    if (side === 'W') return [{ x: 0, y: b.y0 }, { x: 0, y: b.y1 }];
    return [{ x: R.w, y: b.y0 }, { x: R.w, y: b.y1 }];
  }
  const Pz = (p, z) => P(p.x, p.y, z);

  // ---- static layer (floor, walls, heatmap, flat items) ---------------------------------------
  function drawStatic(c) {
    const R = room();
    const bg = c.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0f172a'); bg.addColorStop(1, '#1e293b');
    c.fillStyle = bg; c.fillRect(0, 0, W, H);

    const prev = ctx; ctx = c;
    // floor + 1 m grid
    poly([P(0, 0), P(R.w, 0), P(R.w, R.d), P(0, R.d)], '#efe9df');
    ctx.strokeStyle = 'rgba(120,100,80,0.14)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < R.w; x++) { const a = P(x, 0), b = P(x, R.d); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    for (let y = 1; y < R.d; y++) { const a = P(0, y), b = P(R.w, y); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
    ctx.stroke();

    // back walls (far first), with a cap along the top
    const T = 0.2;
    walls().filter((w) => w.back).sort((p, q) => depth((p.a.x + p.b.x) / 2, (p.a.y + p.b.y) / 2) - depth((q.a.x + q.b.x) / 2, (q.a.y + q.b.y) / 2)).forEach((w) => {
      const tone = Math.max(0, Math.min(1, (faceShade(w.n.x, w.n.y) + 0.12) / -0.18));
      poly([Pz(w.a, 0), Pz(w.b, 0), Pz(w.b, WALL_H), Pz(w.a, WALL_H)], shade('#e4ddd1', -0.07 * tone), 'rgba(0,0,0,0.15)');
      const o = { x: -w.n.x * T, y: -w.n.y * T };
      poly([Pz(w.a, WALL_H), Pz(w.b, WALL_H), P(w.b.x + o.x, w.b.y + o.y, WALL_H), P(w.a.x + o.x, w.a.y + o.y, WALL_H)], '#8a8072');
      polyRaw([Pz(w.a, 0.12), Pz(w.b, 0.12)], 'rgba(0,0,0,0.12)', 2);
    });

    // doors / lifts / ports / windows on back walls
    for (const el of an.els) {
      const t = CAT[el.type], wall = wallOf(el);
      if (!wall || wall[0] !== 'b' || !(t.entry || t.port || t.glazing) || t.flat && t.port) continue;
      const [a, b] = wallSpan(el, wall[1]);
      const at = (u, z) => P(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, z);
      if (t.glazing) {
        poly([at(0, 0.5), at(1, 0.5), at(1, 2.4), at(0, 2.4)], 'rgba(186,230,253,0.85)', '#0284c7', 1.2);
        const n = Math.max(1, Math.round(el.w / 1.2));
        for (let q = 1; q < n; q++) polyRaw([at(q / n, 0.5), at(q / n, 2.4)], '#0284c7', 1);
      } else if (t.entry) {
        const top = el.type === 'lift' ? 2.3 : 2.4;
        const fill = el.type === 'lift' ? '#a8b3c2' : 'rgba(22,163,74,0.35)';
        poly([at(0, 0), at(1, 0), at(1, top), at(0, top)], fill, el.type === 'lift' ? '#64748b' : '#15803d', 1.5);
        polyRaw([at(0.5, 0), at(0.5, top)], el.type === 'lift' ? '#475569' : '#15803d', 1.5);
        if (el.type === 'lift') poly([at(0, top + 0.08), at(1, top + 0.08), at(1, top + 0.3), at(0, top + 0.3)], '#334155');
      } else {
        poly([at(0, 0.3), at(1, 0.3), at(1, 0.55), at(0, 0.55)], t.color, 'rgba(0,0,0,0.35)');
      }
    }

    // flat floor items: rugs, entrance mats, floor boxes
    for (const el of an.els) {
      const t = CAT[el.type], b = G.aabb(el);
      if (el.type === 'rug') {
        poly(floorQuad(b.x0, b.y0, b.x1, b.y1, 0.005), t.color, shade(t.color, -0.2), 1);
        poly(floorQuad(b.x0 + 0.2, b.y0 + 0.2, b.x1 - 0.2, b.y1 - 0.2, 0.006), null, shade(t.color, -0.15), 1);
      } else if (t.entry && t.flat) {
        poly(floorQuad(b.x0, b.y0, b.x1, b.y1, 0.01), 'rgba(22,163,74,0.55)', '#15803d', 1.5);
        // door mat just inside
        const n = G.frontDir(el.rot), along = { x: -n.y, y: n.x };
        const edge = { x: el.x + (n.x * el.d) / 2, y: el.y + (n.y * el.d) / 2 };
        const c = [[-0.4, 0], [0.4, 0], [0.4, 0.9], [-0.4, 0.9]].map(([u, v]) => P(edge.x + along.x * u * el.w + n.x * v, edge.y + along.y * u * el.w + n.y * v, 0.006));
        poly(c, 'rgba(68,64,60,0.3)');
      } else if (el.type === 'lift' && wallOf(el) && wallOf(el)[0] === 'f') {
        poly(floorQuad(b.x0, b.y0, b.x1, b.y1, 0.01), '#94a3b8', '#64748b', 1.5);
      } else if (t.glazing) {
        poly(floorQuad(b.x0, b.y0, b.x1, b.y1, 0.01), 'rgba(125,211,252,0.75)', '#0284c7', 1);
      } else if (el.type === 'floorbox') {
        poly(floorQuad(b.x0, b.y0, b.x1, b.y1, 0.01), '#0e7490', '#164e63', 1);
      }
    }

    // heatmap
    if (ov.heat && heat) {
      const s = heat.step / 2;
      for (const cell of heat.cells) poly(floorQuad(cell.x - s, cell.y - s, cell.x + s, cell.y + s, 0.012), KP.scoreColor(cell.score, 0.42));
    }

    // arrival direction arrows
    for (const e of an.entries) {
      const a = e.anchor, n = e.n, len = e.kind === 'main' ? 2.2 : 1.4;
      const p0 = { x: a.x - n.x * 0.5, y: a.y - n.y * 0.5 }, p1 = { x: a.x + n.x * len, y: a.y + n.y * len };
      polyline([p0, p1], 0.02, e.kind === 'lift' ? 'rgba(71,85,105,0.7)' : 'rgba(21,128,61,0.8)', 4);
      const side = { x: -n.y, y: n.x };
      poly([P(p1.x + n.x * 0.5, p1.y + n.y * 0.5, 0.02), P(p1.x + side.x * 0.4, p1.y + side.y * 0.4, 0.02), P(p1.x - side.x * 0.4, p1.y - side.y * 0.4, 0.02)], e.kind === 'lift' ? 'rgba(71,85,105,0.85)' : 'rgba(21,128,61,0.9)');
    }
    ctx = prev;
  }
  function polyRaw(pts, color, w) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.stroke();
  }

  // ---- objects -----------------------------------------------------------------------------------
  function backSide(el, b, frac) {
    const n = G.frontDir(el.rot), t = Math.max(0.18, (n.y ? b.d : b.w) * frac);
    if (n.y > 0) return { x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y0 + t };
    if (n.y < 0) return { x0: b.x0, x1: b.x1, y0: b.y1 - t, y1: b.y1 };
    if (n.x > 0) return { x0: b.x0, x1: b.x0 + t, y0: b.y0, y1: b.y1 };
    return { x0: b.x1 - t, x1: b.x1, y0: b.y0, y1: b.y1 };
  }
  function subBoxes(list) {
    const dc = (b) => depth((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
    list.sort((a, c) => dc(a.b) - dc(c.b)).forEach((q) => box(q.b, q.z0, q.z1, q.c));
  }

  function drawElement(el) {
    const t = CAT[el.type], b = G.aabb(el), h = el.h ?? t.h, wall = wallOf(el);
    switch (el.type) {
      case 'lift':
        if (wall && wall[0] === 'b') return;
        box(b, 0, wall ? 0.18 : h, t.color);
        return;
      case 'sofa':
      case 'armchair':
        subBoxes([{ b, z0: 0, z1: h * 0.55, c: t.color }, { b: backSide(el, b, 0.28), z0: h * 0.55, z1: h, c: shade(t.color, -0.1) }]);
        return;
      case 'checkin':
      case 'concierge':
        box(b, 0, h - 0.06, shade(t.color, -0.15));
        box({ x0: b.x0 - 0.03, y0: b.y0 - 0.03, x1: b.x1 + 0.03, y1: b.y1 + 0.03 }, h - 0.06, h, '#e7d3b5');
        return;
      case 'plant': {
        const r = Math.min(b.w, b.d) / 2;
        cylinder(el.x, el.y, r * 0.55, 0, 0.5, '#8b7d6b');
        const [sx, sy] = P(el.x, el.y, Math.max(0.9, h * 0.62));
        const R0 = r * cam.k * 1.35;
        [[0, 0, 1], [-0.35, 0.25, 0.7], [0.35, 0.2, 0.72], [0, -0.45, 0.65]].forEach(([dx, dy, s]) => {
          const g = ctx.createRadialGradient(sx + dx * R0 - R0 * 0.2 * s, sy + dy * R0 - R0 * 0.3 * s, R0 * 0.1, sx + dx * R0, sy + dy * R0, R0 * s);
          g.addColorStop(0, '#4ade80'); g.addColorStop(1, '#166534');
          ctx.beginPath(); ctx.arc(sx + dx * R0, sy + dy * R0, R0 * s, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
        });
        return;
      }
      case 'round_table':
        cylinder(el.x, el.y, 0.08, 0, h - 0.04, '#57534e');
        cylinder(el.x, el.y, Math.min(b.w, b.d) / 2, h - 0.04, h, t.color);
        return;
      case 'staff': {
        ellipseAt(el.x, el.y, 0.005, 0.28, 'rgba(0,0,0,0.18)');
        cylinder(el.x, el.y, 0.2, 0, 1.35, t.color);
        const [sx, sy] = P(el.x, el.y, 1.55);
        ctx.beginPath(); ctx.arc(sx, sy, 0.15 * cam.k * 1.2, 0, Math.PI * 2);
        ctx.fillStyle = '#f2c9a0'; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.stroke();
        return;
      }
      case 'bellhop':
        box(b, 0, h, t.color);
        cylinder(el.x, el.y, 0.1, h, h + 0.12, '#facc15');
        return;
      case 'power':
      case 'ethernet':
        if (wall && wall[0] === 'b') return;
        box(b, 0, wall ? 0.4 : h, t.color);
        return;
      default:
        if (t.flat) return;
        box(b, 0, h, t.color);
    }
  }

  // Kiosk model: plinth, body and a head with a glowing screen on the front face.
  function kioskCorners(k, w, d, fwd = 0) {
    const f = G.facingVec(k.facing), s = { x: -f.y, y: f.x }, c = { x: k.x + f.x * fwd, y: k.y + f.y * fwd };
    return [[d / 2, w / 2], [d / 2, -w / 2], [-d / 2, -w / 2], [-d / 2, w / 2]].map(([a, bb]) => ({ x: c.x + f.x * a + s.x * bb, y: c.y + f.y * a + s.y * bb }));
  }
  function drawKiosk(k, opts = {}) {
    const alpha = opts.ghost ? 0.7 : 1;
    ctx.save(); ctx.globalAlpha = alpha;
    const body = opts.invalid ? '#7f1d1d' : '#1e293b';
    ellipseAt(k.x, k.y, 0.004, 0.42, 'rgba(0,0,0,0.25)');
    prism(kioskCorners(k, 0.62, 0.5), 0, 0.06, '#0f172a');
    prism(kioskCorners(k, 0.42, 0.3, -0.04), 0.06, 1.0, body);
    prism(kioskCorners(k, 0.58, 0.16, 0.04), 1.0, KP.KIOSK.h, body, (a, b) => {
      const lerp = (u, z) => P(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, z);
      const q = [lerp(0.1, 1.08), lerp(0.9, 1.08), lerp(0.9, 1.62), lerp(0.1, 1.62)];
      ctx.save();
      ctx.shadowColor = 'rgba(56,189,248,0.9)'; ctx.shadowBlur = opts.ghost ? 0 : 10;
      const gr = ctx.createLinearGradient(q[0][0], q[3][1], q[1][0], q[0][1]);
      gr.addColorStop(0, '#7dd3fc'); gr.addColorStop(1, '#0284c7');
      poly(q, opts.invalid ? '#fca5a5' : gr);
      ctx.restore();
    });
    ctx.restore();
  }

  // Front clearance zone (1.5 m × 1.2 m) and facing arrow, drawn on the floor.
  function drawFrontZone(k, good) {
    const f = G.facingVec(k.facing), s = { x: -f.y, y: f.x };
    const at = (d, o) => P(k.x + f.x * d + s.x * o, k.y + f.y * d + s.y * o, 0.015);
    poly([at(0.35, -0.6), at(0.35, 0.6), at(1.85, 0.6), at(1.85, -0.6)], good ? 'rgba(56,189,248,0.16)' : 'rgba(239,68,68,0.2)', good ? 'rgba(56,189,248,0.7)' : 'rgba(239,68,68,0.8)', 1);
    poly([at(0.45, -0.18), at(0.45, 0.18), at(0.8, 0)], good ? 'rgba(56,189,248,0.85)' : 'rgba(239,68,68,0.85)');
  }

  // Painter's order for floor-aligned boxes seen from any angle: A is drawn before B when a gap
  // along x or y separates them and B lies on the viewer's side of that gap.
  function depthSort(items) {
    items.forEach((it) => { it.d = depth((it.b.x0 + it.b.x1) / 2, (it.b.y0 + it.b.y1) / 2); });
    items.sort((a, b) => a.d - b.d);
    const e = 1e-6;
    const behind = (A, B) => {
      const sx = A.x1 <= B.x0 + e ? 1 : B.x1 <= A.x0 + e ? -1 : 0;
      const sy = A.y1 <= B.y0 + e ? 1 : B.y1 <= A.y0 + e ? -1 : 0;
      const vx = sx * view.x, vy = sy * view.y;
      if (sx && sy) return vx > e && vy > e ? true : vx < -e && vy < -e ? false : (Math.abs(view.x) > Math.abs(view.y) ? vx : vy) > e;
      if (sx) return vx > e;
      if (sy) return vy > e;
      return false; // overlapping footprints: keep the centre-depth order
    };
    const out = [], state = new Map();
    const visit = (it) => {
      if (state.get(it)) return;
      state.set(it, 1);
      for (const o of items) if (o !== it && behind(o.b, it.b)) visit(o);
      state.set(it, 2); out.push(it);
    };
    items.forEach(visit);
    return out;
  }

  function screenBounds(b, z1) {
    const pts = [P(b.x0, b.y0, 0), P(b.x1, b.y0, 0), P(b.x1, b.y1, 0), P(b.x0, b.y1, 0), P(b.x0, b.y0, z1), P(b.x1, b.y0, z1), P(b.x1, b.y1, z1), P(b.x0, b.y1, z1)];
    return { x0: Math.min(...pts.map((p) => p[0])), x1: Math.max(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), y1: Math.max(...pts.map((p) => p[1])) };
  }

  // ---- frame -----------------------------------------------------------------------------------
  function ghostState() {
    if (tool !== 'place' || !hover || drag) return null;
    const p = snapPt(hover);
    const valid = SC.validSpot(an, p, ST().kiosks);
    const cell = heat && heat.at(p.x, p.y);
    const facing = ghostFacing != null ? ghostFacing : cell ? cell.facing : defaultFacing(p);
    return { x: p.x, y: p.y, facing, valid, cell };
  }
  function defaultFacing(p) {
    const m = an.mains[0] || an.entries[0];
    if (!m) return 90;
    return Math.round(SC.bearing(p, m.anchor) / 45) * 45;
  }
  const snapPt = (p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });

  function draw(now) {
    if (!an || !W) return;
    computeOrigin();
    const key = [W, H, dpr, cam.theta.toFixed(4), cam.k, cam.ox, cam.oy, dataVer, ov.heat].join('|');
    if (key !== cacheKey) {
      cacheKey = key;
      if (!cache) cache = document.createElement('canvas');
      cache.width = W * dpr; cache.height = H * dpr;
      const c = cache.getContext('2d');
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawStatic(c);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(cache, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const t = now / 1000;

    // guest routes
    if (ov.flow) {
      for (const r of an.routes) {
        if (r.blocked) continue;
        const a = 0.35 + 0.5 * r.w;
        polyline(r.pts, 0.02, `rgba(255,255,255,${a * 0.5})`, 5);
        polyline(r.pts, 0.02, `rgba(14,165,233,${a})`, 2.5, [7, 7], -t * 18);
      }
    }
    // cables
    const kres = ev ? ev.kiosks : [];
    if (ov.cables) {
      for (const r of kres) {
        [[r.m.power, '#f59e0b', -0.07], [r.m.eth, '#3b82f6', 0.07]].forEach(([c, col, off]) => {
          if (!c) return;
          const pts = c.pts.map((p) => ({ x: p.x + off, y: p.y + off }));
          polyline(pts, 0.03, 'rgba(0,0,0,0.35)', 5);
          polyline(pts, 0.03, col, 3);
          polyline(pts, 0.03, 'rgba(255,255,255,0.85)', 1.5, [3, 9], t * 20);
          // walkway crossings: warning markers
          let inW = false;
          c.cells.forEach((ci) => {
            const w = an.g.cable[ci] === 0 && an.routeMask[ci];
            if (w && !inW) {
              const p = G.cellCenter(an.g, ci), [sx, sy] = P(p.x, p.y, 0.03);
              ctx.beginPath(); ctx.moveTo(sx, sy - 9); ctx.lineTo(sx + 8, sy + 5); ctx.lineTo(sx - 8, sy + 5); ctx.closePath();
              ctx.fillStyle = '#facc15'; ctx.fill(); ctx.strokeStyle = '#78350f'; ctx.lineWidth = 1; ctx.stroke();
              ctx.fillStyle = '#78350f'; ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', sx, sy + 0.5);
            }
            inW = w;
          });
          // pulsing ring on the port in use
          const pr = 0.3 + 0.12 * Math.sin(t * 4);
          ellipseAt(c.port.x, c.port.y, 0.03, pr, null, col);
        });
      }
    }

    // best spot marker (hidden once a kiosk stands on it)
    const showBest = heat && heat.best && ov.heat && !ST().kiosks.some((k) => Math.hypot(k.x - heat.best.px, k.y - heat.best.py) < 0.6);
    if (showBest) {
      const b = heat.best, pr = 0.45 + 0.1 * Math.sin(t * 3);
      ellipseAt(b.px, b.py, 0.02, pr, 'rgba(250,204,21,0.25)', '#facc15');
    }

    // front zones (selected, dragging, ghost)
    const ghost = ghostState();
    const selRes = kres.find((r) => r.id === selK);
    if (selRes) drawFrontZone(selRes.kiosk, selRes.fm.frontFree >= 0.8);
    if (ghost) drawFrontZone(ghost, ghost.valid);

    // objects
    const items = [];
    for (const el of an.els) {
      const tt = CAT[el.type];
      if (tt.flat) continue;
      if ((el.type === 'lift' || tt.port) && wallOf(el) && wallOf(el)[0] === 'b') continue;
      items.push({ b: G.aabb(el), el, h: el.h ?? tt.h });
    }
    ST().kiosks.forEach((k) => items.push({ b: G.kioskBox(k), kiosk: k, h: KP.KIOSK.h }));
    if (ghost) items.push({ b: G.kioskBox(ghost), ghost, h: KP.KIOSK.h });

    // x-ray: tall things in front of a kiosk (or the cursor) go see-through
    const targets = items.filter((i) => i.kiosk || i.ghost).map((i) => ({ sb: screenBounds(i.b, KP.KIOSK.h), d: depth((i.b.x0 + i.b.x1) / 2, (i.b.y0 + i.b.y1) / 2) }));
    const sorted = depthSort(items);
    for (const it of sorted) {
      let alpha = 1;
      if (it.el && it.h >= 1.2) {
        const sb = screenBounds(it.b, it.h);
        for (const tg of targets) {
          const inFront = it.d > tg.d;
          if (inFront && sb.x0 < tg.sb.x1 && sb.x1 > tg.sb.x0 && sb.y0 < tg.sb.y1 && sb.y1 > tg.sb.y0) { alpha = 0.35; break; }
        }
      }
      ctx.save(); ctx.globalAlpha = alpha;
      if (it.el) drawElement(it.el);
      else if (it.kiosk) {
        if (it.kiosk.id === selK) ellipseAt(it.kiosk.x, it.kiosk.y, 0.01, 0.55, null, '#38bdf8');
        drawKiosk(it.kiosk);
      } else drawKiosk(it.ghost, { ghost: true, invalid: !it.ghost.valid });
      ctx.restore();
    }

    drawFrontWalls();

    // sightlines
    if (ov.sight) {
      for (const r of kres) {
        if (selK && r.id !== selK) continue;
        for (const s of r.sight) {
          const a = P(s.entry.anchor.x, s.entry.anchor.y, 1.5), b = P(r.kiosk.x, r.kiosk.y, 1.4);
          ctx.beginPath(); ctx.moveTo(a[0], a[1]);
          if (s.clear) { ctx.lineTo(b[0], b[1]); ctx.strokeStyle = 'rgba(34,197,94,0.95)'; ctx.setLineDash([]); ctx.lineWidth = 2; ctx.stroke(); }
          else {
            const hpt = P(s.hit.x, s.hit.y, 1.45);
            ctx.lineTo(hpt[0], hpt[1]); ctx.strokeStyle = 'rgba(239,68,68,0.95)'; ctx.lineWidth = 2; ctx.stroke();
            ctx.beginPath(); ctx.moveTo(hpt[0], hpt[1]); ctx.lineTo(b[0], b[1]); ctx.setLineDash([3, 5]); ctx.strokeStyle = 'rgba(239,68,68,0.45)'; ctx.stroke(); ctx.setLineDash([]);
            ctx.beginPath(); ctx.arc(hpt[0], hpt[1], 4, 0, Math.PI * 2); ctx.fillStyle = '#ef4444'; ctx.fill();
          }
        }
      }
    }

    // labels & badges
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const el of an.els) {
      const tt = CAT[el.type];
      if (tt.port) {
        const wall = wallOf(el);
        const [sx, sy] = P(el.x, el.y, wall ? 0.75 : 0.35);
        ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI * 2); ctx.fillStyle = tt.color; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 10px system-ui';
        ctx.fillText(el.type === 'power' ? '⚡' : el.type === 'ethernet' ? '⇄' : '◆', sx, sy + 0.5);
        if (ov.labels && cam.k >= 42) { ctx.font = '500 10px system-ui'; ctx.fillStyle = 'rgba(15,23,42,0.85)'; ctx.fillText(el.label, sx, sy - 15); }
        continue;
      }
      if (!ov.labels) continue;
      // Key landmarks always; staff and other details only when zoomed in (hover shows any label).
      const key = tt.entry || el.type === 'checkin';
      if (!key && !((tt.staff || el.type === 'signage') && cam.k >= 42)) continue;
      const h = tt.entry ? (wallOf(el) && wallOf(el)[0] === 'b' ? 2.7 : 0.4) : (el.h ?? tt.h) + 0.45;
      const [sx, sy] = P(el.x, el.y, h);
      pill(el.label, sx, sy, tt.entry ? (el.type === 'lift' ? 'rgba(71,85,105,0.92)' : 'rgba(21,128,61,0.92)') : tt.staff && !tt.counter ? 'rgba(109,40,217,0.9)' : 'rgba(41,37,36,0.85)', '#fff', '600 10.5px system-ui, sans-serif');
    }
    for (const r of kres) {
      const [sx, sy] = P(r.kiosk.x, r.kiosk.y, KP.KIOSK.h + 0.7);
      gradeBadge(sx, sy, r.overall, r.label, r.id === selK ? '#38bdf8' : null);
    }
    if (showBest) {
      const [sx, sy] = P(heat.best.px, heat.best.py, 1.0);
      gradeBadge(sx, sy, heat.best.score, '★ Best spot', '#facc15');
    }
    drawCompass();
  }

  // Badge with the grade letter big in a coloured disc; the label, bucket and score sit small beside it.
  function gradeBadge(sx, sy, score, label, ring) {
    const g = KP.F.grade(score), sub = `${g.range} · ${score}`;
    ctx.font = '650 11px system-ui, sans-serif';
    const tw = Math.max(ctx.measureText(label).width, (ctx.font = '500 10px system-ui, sans-serif', ctx.measureText(sub).width));
    const h = 32, w = tw + 46, x = sx - w / 2, y = sy - h / 2;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, 16);
    ctx.fillStyle = 'rgba(15,23,42,0.92)'; ctx.fill();
    if (ring) { ctx.strokeStyle = ring; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.beginPath(); ctx.arc(x + 16, sy, 12.5, 0, Math.PI * 2); ctx.fillStyle = g.color; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '800 15px system-ui, sans-serif'; ctx.fillText(g.letter, x + 16, sy + 1);
    ctx.textAlign = 'left';
    ctx.font = '650 11px system-ui, sans-serif'; ctx.fillStyle = '#f8fafc'; ctx.fillText(label, x + 34, sy - 6);
    ctx.font = '500 10px system-ui, sans-serif'; ctx.fillStyle = '#94a3b8'; ctx.fillText(sub, x + 34, sy + 7);
  }

  // Low "cut-away" kerbs along the walls nearest the viewer, with gaps for doors.
  function drawFrontWalls() {
    const R = room(), T = 0.2, hgt = 0.35;
    const segs = [];
    for (const w of walls()) {
      if (w.back) continue;
      const horiz = w.side === 'N' || w.side === 'S', len = horiz ? R.w : R.d;
      const gaps = an.els.filter((el) => CAT[el.type].entry && wallOf(el) === 'f' + w.side).map((el) => {
        const b = G.aabb(el);
        return horiz ? [b.x0, b.x1] : [b.y0, b.y1];
      }).sort((a, b) => a[0] - b[0]);
      let s0 = -T;
      const push = (a, b) => {
        if (b - a < 0.01) return;
        const box = horiz
          ? { x0: a, x1: b, y0: w.side === 'N' ? -T : R.d, y1: w.side === 'N' ? 0 : R.d + T }
          : { y0: a, y1: b, x0: w.side === 'W' ? -T : R.w, x1: w.side === 'W' ? 0 : R.w + T };
        segs.push(box);
      };
      gaps.forEach(([a, b]) => { if (a > s0) push(s0, a); s0 = Math.max(s0, b); });
      push(s0, len + T);
    }
    segs.sort((p, q) => depth((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2) - depth((q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2))
      .forEach((b) => box(b, 0, hgt, '#8a8072'));
  }

  function drawCompass() {
    const R = room(), cx = W - 46, cy = H - 56;
    const a = P(R.w / 2, R.d / 2), b = P(R.w / 2, R.d / 2 - 1);
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    ctx.save(); ctx.translate(cx, cy);
    ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI * 2); ctx.fillStyle = 'rgba(15,23,42,0.75)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.stroke();
    ctx.rotate(ang + Math.PI / 2);
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(5, 2); ctx.lineTo(0, -2); ctx.lineTo(-5, 2); ctx.closePath(); ctx.fillStyle = '#ef4444'; ctx.fill();
    ctx.rotate(-(ang + Math.PI / 2));
    const lx = Math.cos(ang) * 30, ly = Math.sin(ang) * 30;
    ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('N', lx, ly);
    ctx.restore();
  }

  // ---- loop ----------------------------------------------------------------------------------
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000);
    lastFrame = now;
    if (!active || !an) return;
    if (cam.target != null) {
      const diff = cam.target - cam.theta;
      if (Math.abs(diff) < 0.002) { cam.theta = cam.target; cam.target = null; }
      else cam.theta += diff * Math.min(1, dt * 12);
      dirty = true;
    }
    const animating = ov.flow || ov.cables || (ov.heat && heat);
    if (!dirty && !animating) return;
    dirty = false;
    draw(now);
  }

  // ---- interaction -----------------------------------------------------------------------------
  // Left button: click floor = place (in place mode) or deselect; drag = pan; drag a kiosk = move it.
  // Right button: drag = turn the scene freely; a click (no drag) turns it 90° (Shift = other way).
  // Middle button: pan.
  function hitKiosk(sx, sy) {
    let best = null, bd = -Infinity;
    for (const k of ST().kiosks) {
      const sb = screenBounds(G.kioskBox(k), KP.KIOSK.h);
      if (sx >= sb.x0 - 3 && sx <= sb.x1 + 3 && sy >= sb.y0 - 3 && sy <= sb.y1 + 3) {
        const dd = depth(k.x, k.y);
        if (dd > bd) { bd = dd; best = k; }
      }
    }
    return best;
  }
  // Front-most lobby element under the cursor (screen-space), for hover labels.
  function hitElement(sx, sy) {
    let best = null, bd = -Infinity;
    for (const el of an.els) {
      const t = CAT[el.type];
      if (el.type === 'rug') continue;
      const h = t.flat ? 0.05 : el.h ?? t.h;
      const sb = screenBounds(G.aabb(el), h);
      if (sx < sb.x0 || sx > sb.x1 || sy < sb.y0 || sy > sb.y1) continue;
      const dd = depth(el.x, el.y);
      if (dd > bd) { bd = dd; best = el; }
    }
    return best;
  }
  // Why a kiosk can't go here: the element it overlaps, or outside the room.
  function blockerAt(p) {
    const b = G.kioskBox(p), R = room();
    if (b.x0 < 0 || b.y0 < 0 || b.x1 > R.w || b.y1 > R.d) return 'Too close to the wall';
    const k = ST().kiosks.find((q) => G.overlap(b, G.kioskBox(q)));
    if (k) return `Overlaps ${k.label}`;
    const el = an.els.find((e) => { const t = CAT[e.type]; return (t.walk || t.entry || t.marker) && G.overlap(b, G.aabb(e)); });
    return el ? `Overlaps ${el.label}` : 'Blocked';
  }
  const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function onDown(e) {
    if (!an) return;
    const [sx, sy] = local(e);
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or already-released pointer */ }
    if (e.button === 2) { drag = { mode: 'rmb', sx: e.clientX, sy: e.clientY, lastX: e.clientX, rotated: false, shift: e.shiftKey }; e.preventDefault(); return; }
    if (e.button === 1) { drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, ox: cam.ox, oy: cam.oy }; cv.classList.add('panning'); e.preventDefault(); return; }
    if (e.button !== 0) return;
    const k = hitKiosk(sx, sy);
    if (k) {
      I.select(k.id);
      setTool('select');
      drag = { mode: 'move', id: k.id, sx: e.clientX, sy: e.clientY, moved: false, cp: false };
      return;
    }
    // Press on the floor: becomes a pan if the pointer moves, otherwise a click.
    drag = { mode: 'press', sx: e.clientX, sy: e.clientY, ox: cam.ox, oy: cam.oy, shift: e.shiftKey };
  }

  function onMove(e) {
    if (!an) return;
    const [sx, sy] = local(e);
    hover = toWorld(sx, sy);
    hoverKiosk = drag ? null : hitKiosk(sx, sy);
    dirty = true;
    if (drag) {
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (drag.mode === 'press' && Math.hypot(dx, dy) > 5) { drag.mode = 'pan'; cv.classList.add('panning'); }
      if (drag.mode === 'pan') {
        cam.ox = drag.ox + e.clientX - drag.sx; cam.oy = drag.oy + e.clientY - drag.sy;
        autoFit = false;
      } else if (drag.mode === 'rmb') {
        if (!drag.rotated && Math.abs(dx) < 4) return;
        // Turn around the point under the screen centre so the scene doesn't drift away.
        const before = toWorld(W / 2, H / 2);
        cam.target = null;
        cam.theta += (e.clientX - drag.lastX) * 0.008;
        drag.lastX = e.clientX; drag.rotated = true;
        computeOrigin();
        const [nx, ny] = P(before.x, before.y);
        cam.ox += W / 2 - nx; cam.oy += H / 2 - ny;
        cv.classList.add('rotating');
      } else if (drag.mode === 'move') {
        if (!drag.moved && Math.hypot(dx, dy) < 4) return;
        drag.moved = true;
        const k = ST().kiosks.find((q) => q.id === drag.id);
        const p = snapPt(hover);
        if (SC.validSpot(an, p, ST().kiosks, k.id)) {
          if (!drag.cp) { KP.checkpoint(); drag.cp = true; }
          k.x = p.x; k.y = p.y;
          I.onKiosksMoving && I.onKiosksMoving();
        }
      }
    }
    updateTip(sx, sy);
  }

  function onUp(e) {
    if (!drag) return;
    cv.classList.remove('panning', 'rotating');
    const d = drag; drag = null;
    if (d.mode === 'move' && d.cp) KP.changed('kiosks');
    else if (d.mode === 'rmb' && !d.rotated) I.rotateCamera(d.shift ? -1 : 1);
    else if (d.mode === 'press') {
      if (tool === 'place') {
        const g = ghostState();
        if (g && g.valid) placeKiosk(g, d.shift || e.shiftKey);
        else if (g && insideRoom(hover)) toast(`Can’t place a kiosk here: ${blockerAt(g).toLowerCase()}.`);
      } else I.select(null);
    }
    dirty = true;
  }

  function onWheel(e) {
    e.preventDefault();
    const [sx, sy] = local(e);
    const w = toWorld(sx, sy);
    cam.k = Math.max(8, Math.min(140, cam.k * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))));
    computeOrigin();
    const [nx, ny] = P(w.x, w.y);
    cam.ox += sx - nx; cam.oy += sy - ny;
    autoFit = false;
    dirty = true;
  }

  function updateTip(sx, sy) {
    let html = '';
    if (drag && drag.mode !== 'press') html = '';
    else if (hoverKiosk) {
      const r = ev && ev.kiosks.find((q) => q.id === hoverKiosk.id);
      html = `<b>${esc(hoverKiosk.label)}</b>${r ? ` <span class="tip-score" style="background:${KP.scoreColor(r.overall)}">${esc(KP.F.gbsText(r.overall))}</span>` : ''}<small>Faces ${SC.compassLong(hoverKiosk.facing)} · drag to move · <kbd>Space</kbd> to turn</small>`;
    } else if (tool === 'place' && hover && insideRoom(hover)) {
      const g = ghostState();
      if (g && !g.valid) html = `<b class="bad">Can’t place here</b><small>${esc(blockerAt(g))}</small>`;
      else if (g && g.cell) html = `<b>Predicted</b> <span class="tip-score" style="background:${KP.scoreColor(g.cell.score)}">${esc(KP.F.gbsText(g.cell.score))}</span><small>Facing ${SC.compassLong(g.facing)}${ghostFacing == null ? ' (best here)' : ''} · <kbd>Space</kbd> to turn</small>`;
    } else if (hover && insideRoom(hover)) {
      const el = hitElement(sx, sy);
      if (el) html = `<b>${esc(el.label)}</b>${el.label !== CAT[el.type].name ? `<small>${esc(CAT[el.type].name)}</small>` : ''}`;
    }
    tipEl.innerHTML = html;
    tipEl.style.display = html ? 'block' : 'none';
    if (html) tipEl.style.transform = `translate(${Math.min(sx + 16, W - 250)}px, ${sy + 18}px)`;
  }
  const insideRoom = (p) => p.x >= 0 && p.y >= 0 && p.x <= room().w && p.y <= room().d;

  function placeKiosk(g, keepPlacing) {
    KP.checkpoint();
    const ks = ST().kiosks;
    const n = ks.reduce((m, k) => Math.max(m, +(k.label.match(/\d+$/) || [0])[0]), 0) + 1;
    const k = { id: KP.uid('k'), label: `Kiosk ${n}`, x: g.x, y: g.y, facing: g.facing };
    ks.push(k);
    selK = k.id;
    ghostFacing = null;
    tipEl.style.display = 'none';
    if (!keepPlacing) setTool('select');
    KP.changed('kiosks');
  }

  function toast(msg) { KP.toast && KP.toast(msg, 'warn'); }

  function setTool(t) {
    tool = t;
    document.getElementById('tool-place').classList.toggle('active', t === 'place');
    document.getElementById('tool-select').classList.toggle('active', t === 'select');
    cv.classList.toggle('placing', t === 'place');
    dirty = true;
  }
  I.setTool = setTool;

  // Turn the selected kiosk (or the ghost while placing) by 1/8 of a circle.
  I.rotateFacing = function (dir) {
    const ks = ST().kiosks;
    const k = tool === 'place' ? null : ks.find((q) => q.id === selK) || (ks.length === 1 ? ks[0] : null);
    if (k) {
      KP.checkpoint();
      k.facing = (((k.facing + dir * 45) % 360) + 360) % 360;
      if (selK !== k.id) I.select(k.id);
      KP.changed('kiosks');
    } else if (tool === 'place') {
      const g = ghostState();
      const base = ghostFacing != null ? ghostFacing : g ? g.facing : 90;
      ghostFacing = (((base + dir * 45) % 360) + 360) % 360;
      dirty = true;
      if (hover) { const [sx, sy] = P(hover.x, hover.y); updateTip(sx, sy); }
    } else toast('Select a kiosk first, then press Space to turn it.');
  };
  I.deleteSelected = function () {
    const ks = ST().kiosks, i = ks.findIndex((q) => q.id === selK);
    if (i < 0) return;
    KP.checkpoint(); ks.splice(i, 1); selK = null; KP.changed('kiosks');
  };
  I.select = function (id) { selK = id; dirty = true; I.onSelect && I.onSelect(id); };
  I.selected = () => selK;

  // Turn the view 90° (to the next quarter), animated so it's easy to follow.
  I.rotateCamera = function (d) {
    const base = cam.target != null ? cam.target : cam.theta, q = Math.PI / 2;
    cam.target = (d > 0 ? Math.floor(base / q + 1e-6) + 1 : Math.ceil(base / q - 1e-6) - 1) * q;
    dirty = true;
  };
  I.fit = function () {
    const R = room(), th = cam.target != null ? cam.target : cam.theta, c = Math.cos(th), s = Math.sin(th);
    const pts = [[0, 0], [R.w, 0], [R.w, R.d], [0, R.d]].map(([x, y]) => { const dx = x - R.w / 2, dy = y - R.d / 2, X = dx * c - dy * s, Y = dx * s + dy * c; return [X - Y, X + Y]; });
    const wid = Math.max(...pts.map((p) => p[0])) - Math.min(...pts.map((p) => p[0]));
    const hgt = (Math.max(...pts.map((p) => p[1])) - Math.min(...pts.map((p) => p[1]))) / 2 + WALL_H;
    cam.k = Math.max(8, Math.min((W - 80) / wid, (H - 150) / hgt));
    cam.ox = 0; cam.oy = 0; autoFit = true; dirty = true;
  };
  I.focus = function (p) {
    computeOrigin();
    const [sx, sy] = P(p.x, p.y);
    cam.ox += W / 2 - sx; cam.oy += H / 2 - sy; autoFit = false; dirty = true;
  };

  I.setData = function (d) {
    if ('an' in d) an = d.an;
    if ('heat' in d) heat = d.heat;
    if ('ev' in d) ev = d.ev;
    if (selK && !ST().kiosks.some((k) => k.id === selK)) selK = null;
    document.getElementById('iso-coach').hidden = ST().kiosks.length > 0;
    dataVer++; dirty = true;
  };

  I.onKey = function (e) {
    const k = e.key;
    if (k === ' ' || e.code === 'Space') { if (!e.repeat) I.rotateFacing(e.shiftKey ? -1 : 1); e.preventDefault(); }
    else if (k === 'q' || k === 'Q') I.rotateFacing(-1);
    else if (k === 'e' || k === 'E') I.rotateFacing(1);
    else if (k === 'k' || k === 'K') setTool('place');
    else if (k === 'v' || k === 'V') setTool('select');
    else if (k === 'Escape') { if (tool === 'place') setTool('select'); else I.select(null); ghostFacing = null; }
    else if (k === 'Delete' || k === 'Backspace') { I.deleteSelected(); e.preventDefault(); }
    else if (k === '[' || e.code === 'BracketLeft') I.rotateCamera(-1);
    else if (k === ']' || e.code === 'BracketRight') I.rotateCamera(1);
    else if (k === 'f' || k === 'F') I.fit();
    else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'w', 's'].includes(k)) {
      const st = 40;
      if (k === 'ArrowLeft' || k === 'a') cam.ox += st;
      if (k === 'ArrowRight' || k === 'd') cam.ox -= st;
      if (k === 'ArrowUp' || k === 'w') cam.oy += st;
      if (k === 'ArrowDown' || k === 's') cam.oy -= st;
      autoFit = false; dirty = true; e.preventDefault();
    }
  };

  function resize() {
    const r = wrap.getBoundingClientRect();
    if (r.width < 10) return;
    dpr = window.devicePixelRatio || 1;
    W = r.width; H = r.height;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    if (autoFit) I.fit();
    dirty = true;
  }

  I.shown = function () { active = true; resize(); dirty = true; };
  I.hidden = function () { active = false; };
  I.redraw = function () { dirty = true; };

  I.init = function () {
    cv = document.getElementById('iso-canvas');
    wrap = document.getElementById('iso-wrap');
    tipEl = document.getElementById('iso-tip');
    ctx = cv.getContext('2d');
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', () => { drag = null; cv.classList.remove('panning'); });
    cv.addEventListener('pointerleave', () => { hover = null; tipEl.style.display = 'none'; dirty = true; });
    cv.addEventListener('wheel', onWheel, { passive: false });
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    document.getElementById('tool-place').onclick = () => setTool('place');
    document.getElementById('tool-select').onclick = () => setTool('select');
    document.getElementById('face-ccw').onclick = () => I.rotateFacing(-1);
    document.getElementById('face-cw').onclick = () => I.rotateFacing(1);
    document.getElementById('kiosk-del').onclick = () => I.deleteSelected();
    document.getElementById('cam-ccw').onclick = () => I.rotateCamera(-1);
    document.getElementById('cam-cw').onclick = () => I.rotateCamera(1);
    document.getElementById('cam-fit').onclick = () => I.fit();
    document.querySelectorAll('[data-ov]').forEach((inp) => {
      inp.onchange = () => {
        ov[inp.dataset.ov] = inp.checked; dirty = true;
        document.getElementById('heat-legend').hidden = !ov.heat;
      };
    });
    new ResizeObserver(() => { if (active) resize(); }).observe(wrap);
    setTool('place');
    requestAnimationFrame(loop);
  };
})();
