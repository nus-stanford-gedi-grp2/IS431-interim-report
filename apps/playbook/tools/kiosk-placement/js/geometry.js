(function () {
  // Grid-based spatial helpers used by the scoring engine:
  // occupancy grids, line-of-sight raycasts, A* walking routes and cable routing.
  const G = (KP.geo = {});
  const CELL = (G.CELL = 0.25); // metres per grid cell

  // Axis-aligned footprint of an element after rotation (rotations are multiples of 90°).
  G.aabb = function (el) {
    const swap = el.rot === 90 || el.rot === 270;
    const w = swap ? el.d : el.w, d = swap ? el.w : el.d;
    return { x0: el.x - w / 2, y0: el.y - d / 2, x1: el.x + w / 2, y1: el.y + d / 2, w, d };
  };

  G.kioskBox = function (k, pad = 0) {
    const h = KP.KIOSK.size / 2 + pad;
    return { x0: k.x - h, y0: k.y - h, x1: k.x + h, y1: k.y + h };
  };

  // The element's "front" direction (local +y) rotated clockwise by rot degrees, in plan coordinates (y points south).
  G.frontDir = function (rot) {
    const r = ((rot || 0) * Math.PI) / 180;
    return { x: -Math.round(Math.sin(r) * 1e6) / 1e6, y: Math.round(Math.cos(r) * 1e6) / 1e6 };
  };

  // Kiosk facing: degrees, 0 = east, 90 = south, 180 = west, 270 = north.
  G.facingVec = (deg) => ({ x: Math.cos((deg * Math.PI) / 180), y: Math.sin((deg * Math.PI) / 180) });

  G.overlap = (a, b, eps = 0.001) => a.x0 < b.x1 - eps && a.x1 > b.x0 + eps && a.y0 < b.y1 - eps && a.y1 > b.y0 + eps;

  G.distToBox = function (p, b) {
    const dx = Math.max(b.x0 - p.x, 0, p.x - b.x1), dy = Math.max(b.y0 - p.y, 0, p.y - b.y1);
    return Math.hypot(dx, dy);
  };

  G.idx = function (g, x, y) {
    const c = Math.floor(x / CELL), r = Math.floor(y / CELL);
    if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return -1;
    return r * g.cols + c;
  };
  G.cellCenter = (g, i) => ({ x: ((i % g.cols) + 0.5) * CELL, y: (Math.floor(i / g.cols) + 0.5) * CELL });

  function forCells(g, b, fn) {
    const c0 = Math.max(0, Math.floor(b.x0 / CELL + 1e-6)), c1 = Math.min(g.cols - 1, Math.ceil(b.x1 / CELL - 1e-6) - 1);
    const r0 = Math.max(0, Math.floor(b.y0 / CELL + 1e-6)), r1 = Math.min(g.rows - 1, Math.ceil(b.y1 / CELL - 1e-6) - 1);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) fn(r * g.cols + c);
  }
  G.forCells = forCells;

  // Build occupancy grids for a layout.
  //   walk     1 = people cannot stand here
  //   walkInfl walk grid grown by one cell, so routes keep ~0.25 m clear of furniture
  //   sight    1 = blocks line of sight (owner = index of the element responsible)
  //   cable    0 = exposed floor, 1 = cable can be hidden (under furniture/rug or along a wall), 2 = impassable
  G.build = function (room, elements) {
    const cols = Math.max(1, Math.round(room.w / CELL)), rows = Math.max(1, Math.round(room.d / CELL));
    const N = cols * rows;
    const g = { cols, rows, room, walk: new Uint8Array(N), sight: new Uint8Array(N), owner: new Int16Array(N).fill(-1), cable: new Uint8Array(N) };
    const per = Math.round(0.5 / CELL);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (c < per || r < per || c >= cols - per || r >= rows - per) g.cable[r * cols + c] = 1;
    }
    elements.forEach((el, k) => {
      const t = KP.CATALOG[el.type];
      if (!t) return;
      const blocksSight = KP.blocksSight(el);
      forCells(g, G.aabb(el), (i) => {
        if (t.walk) g.walk[i] = 1;
        if (blocksSight) { g.sight[i] = 1; g.owner[i] = k; }
        if (t.cable === 'block') g.cable[i] = 2;
        else if (t.cable === 'hidden' && g.cable[i] < 1) g.cable[i] = 1;
      });
    });
    g.walkInfl = G.dilate(g, g.walk, 1);
    return g;
  };

  G.dilate = function (g, src, radius) {
    const out = new Uint8Array(src.length);
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
      if (!src[r * g.cols + c]) continue;
      for (let dr = -radius; dr <= radius; dr++) for (let dc = -radius; dc <= radius; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && cc >= 0 && rr < g.rows && cc < g.cols) out[rr * g.cols + cc] = 1;
      }
    }
    return out;
  };

  // Line of sight between two plan points. Ignores blockers within `ignore` metres of either end
  // (so a plant right beside the kiosk doesn't count as hiding it from itself).
  const CLEAR = Object.freeze({ clear: true });
  G.los = function (g, ax, ay, bx, by, ignore = 0.3) {
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    const n = Math.ceil(L / (CELL * 0.5));
    if (n < 2 || L <= 2 * ignore) return CLEAR;
    // Hot loop (millions of calls for the heatmap): inline the grid lookup.
    const inv = 1 / CELL, cols = g.cols, rows = g.rows, sight = g.sight;
    const s0 = Math.max(1, Math.ceil((ignore * n) / L)), s1 = Math.min(n - 1, Math.floor(n - (ignore * n) / L));
    for (let s = s0; s <= s1; s++) {
      const x = ax + (dx * s) / n, y = ay + (dy * s) / n;
      if (x < 0 || y < 0) continue;
      const c = (x * inv) | 0, r = (y * inv) | 0;
      if (c >= cols || r >= rows) continue;
      const i = r * cols + c;
      if (sight[i]) return { clear: false, x, y, owner: g.owner[i] };
    }
    return CLEAR;
  };

  // ---- small binary heap -------------------------------------------------------
  function Heap() { this.k = []; this.v = []; }
  Heap.prototype.push = function (key, val) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1; if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  };
  Heap.prototype.pop = function () {
    const k = this.k, v = this.v, top = v[0], lk = k.pop(), lv = v.pop(), n = k.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1; if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  };
  Object.defineProperty(Heap.prototype, 'size', { get() { return this.k.length; } });

  // Nearest cell that isn't blocked, searching outward up to maxR cells.
  G.nearestFree = function (g, x, y, blocked, maxR = 12) {
    const c0 = Math.min(g.cols - 1, Math.max(0, Math.floor(x / CELL))), r0 = Math.min(g.rows - 1, Math.max(0, Math.floor(y / CELL)));
    for (let R = 0; R <= maxR; R++) {
      let best = -1, bd = Infinity;
      for (let dr = -R; dr <= R; dr++) for (let dc = -R; dc <= R; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== R) continue;
        const r = r0 + dr, c = c0 + dc;
        if (r < 0 || c < 0 || r >= g.rows || c >= g.cols) continue;
        const i = r * g.cols + c;
        if (!blocked[i] && dr * dr + dc * dc < bd) { bd = dr * dr + dc * dc; best = i; }
      }
      if (best >= 0) return best;
    }
    return -1;
  };

  const D8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];

  // A* walking route over a blocked grid. Returns { cells, pts (smoothed), length (m) } or null.
  G.astar = function (g, from, to, blocked) {
    const s = G.nearestFree(g, from.x, from.y, blocked), t = G.nearestFree(g, to.x, to.y, blocked);
    if (s < 0 || t < 0) return null;
    const N = g.cols * g.rows, cost = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
    const tc = t % g.cols, tr = (t / g.cols) | 0;
    const h = (i) => { const dx = Math.abs((i % g.cols) - tc), dy = Math.abs(((i / g.cols) | 0) - tr); return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy); };
    const open = new Heap();
    cost[s] = 0; open.push(h(s), s);
    while (open.size) {
      const i = open.pop();
      if (i === t) break;
      if (closed[i]) continue;
      closed[i] = 1;
      const c = i % g.cols, r = (i / g.cols) | 0;
      for (const [dc, dr, w] of D8) {
        const cc = c + dc, rr = r + dr;
        if (cc < 0 || rr < 0 || cc >= g.cols || rr >= g.rows) continue;
        const j = rr * g.cols + cc;
        if (blocked[j] || closed[j]) continue;
        if (dc && dr && (blocked[r * g.cols + cc] || blocked[rr * g.cols + c])) continue; // no corner cutting
        const nc = cost[i] + w;
        if (nc < cost[j]) { cost[j] = nc; came[j] = i; open.push(nc + h(j), j); }
      }
    }
    if (!isFinite(cost[t])) return null;
    const cells = [];
    for (let i = t; i >= 0; i = came[i]) cells.push(i);
    cells.reverse();
    const raw = cells.map((i) => G.cellCenter(g, i));
    return { cells, raw, pts: smooth(g, raw, blocked), length: cost[t] * CELL };
  };

  function walkLos(g, a, b, blocked) {
    const L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.ceil(L / (CELL * 0.4));
    for (let s = 1; s < n; s++) {
      const i = G.idx(g, a.x + ((b.x - a.x) * s) / n, a.y + ((b.y - a.y) * s) / n);
      if (i < 0 || blocked[i]) return false;
    }
    return true;
  }
  // String-pulling: drop intermediate points that have a clear straight line between neighbours.
  function smooth(g, pts, blocked) {
    if (pts.length < 3) return pts.slice();
    const out = [pts[0]];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !walkLos(g, pts[i], pts[j], blocked)) j--;
      out.push(pts[j]); i = j;
    }
    return out;
  }

  // Flood fill: which cells can be walked to from the start points.
  G.flood = function (g, starts, blocked) {
    const N = g.cols * g.rows, seen = new Uint8Array(N), q = [];
    starts.forEach((p) => { const i = G.nearestFree(g, p.x, p.y, blocked); if (i >= 0 && !seen[i]) { seen[i] = 1; q.push(i); } });
    while (q.length) {
      const i = q.pop(), c = i % g.cols, r = (i / g.cols) | 0;
      for (const [dc, dr] of D8.slice(0, 4)) {
        const cc = c + dc, rr = r + dr;
        if (cc < 0 || rr < 0 || cc >= g.cols || rr >= g.rows) continue;
        const j = rr * g.cols + cc;
        if (!seen[j] && !blocked[j]) { seen[j] = 1; q.push(j); }
      }
    }
    return seen;
  };

  // Walking distance (m) from the nearest start point to every cell (8-connected, no corner cutting).
  G.walkField = function (g, starts, blocked) {
    const N = g.cols * g.rows, D = new Float32Array(N).fill(Infinity), heap = new Heap();
    starts.forEach((p) => { const i = G.nearestFree(g, p.x, p.y, blocked); if (i >= 0) { D[i] = 0; heap.push(0, i); } });
    while (heap.size) {
      const i = heap.pop(), c = i % g.cols, r = (i / g.cols) | 0, base = D[i];
      for (const [dc, dr, w] of D8) {
        const cc = c + dc, rr = r + dr;
        if (cc < 0 || rr < 0 || cc >= g.cols || rr >= g.rows) continue;
        const j = rr * g.cols + cc;
        if (blocked[j] || (dc && dr && (blocked[r * g.cols + cc] || blocked[rr * g.cols + c]))) continue;
        const v = base + w * CELL;
        if (v < D[j]) { D[j] = v; heap.push(v, j); }
      }
    }
    return D;
  };

  // Approximate Euclidean distance (m) from every cell to the nearest marked cell (two-pass chamfer).
  G.distanceField = function (g, mark) {
    const N = g.cols * g.rows, D = new Float32Array(N), C = g.cols, R = g.rows, s2 = Math.SQRT2;
    for (let i = 0; i < N; i++) D[i] = mark[i] ? 0 : 1e9;
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const i = r * C + c; let v = D[i];
      if (c > 0) v = Math.min(v, D[i - 1] + 1);
      if (r > 0) {
        v = Math.min(v, D[i - C] + 1);
        if (c > 0) v = Math.min(v, D[i - C - 1] + s2);
        if (c < C - 1) v = Math.min(v, D[i - C + 1] + s2);
      }
      D[i] = v;
    }
    for (let r = R - 1; r >= 0; r--) for (let c = C - 1; c >= 0; c--) {
      const i = r * C + c; let v = D[i];
      if (c < C - 1) v = Math.min(v, D[i + 1] + 1);
      if (r < R - 1) {
        v = Math.min(v, D[i + C] + 1);
        if (c < C - 1) v = Math.min(v, D[i + C + 1] + s2);
        if (c > 0) v = Math.min(v, D[i + C - 1] + s2);
      }
      D[i] = v;
    }
    for (let i = 0; i < N; i++) D[i] *= CELL;
    return D;
  };

  // ---- cable routing -------------------------------------------------------------
  // Multi-source Dijkstra from every port of one kind. Cables run orthogonally with a small
  // penalty per turn; hidden runs (along walls, under sofas/counters/rugs) are cheapest, exposed
  // floor costs more, and exposed crossings of a guest walkway cost the most (trip hazard).
  const D4 = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const COST_HIDDEN = 1, COST_OPEN = 2.2, COST_WALKWAY = 3.5, COST_TURN = 0.6;

  G.cableField = function (g, ports, walkway) {
    const N = g.cols * g.rows, S = N * 4;
    const dist = new Float32Array(S).fill(Infinity), prev = new Int32Array(S).fill(-1), src = new Int16Array(S).fill(-1);
    const heap = new Heap();
    const passable = new Uint8Array(N);
    for (let i = 0; i < N; i++) passable[i] = g.cable[i] !== 2 ? 1 : 0;
    ports.forEach((p, k) => {
      let i = G.idx(g, p.x, p.y);
      if (i < 0 || !passable[i]) i = G.nearestFree(g, p.x, p.y, g.cable.map((v) => (v === 2 ? 1 : 0)), 4);
      if (i < 0) return;
      for (let d = 0; d < 4; d++) { dist[i * 4 + d] = 0; src[i * 4 + d] = k; heap.push(0, i * 4 + d); }
    });
    while (heap.size) {
      const s = heap.pop(), i = s >> 2, d = s & 3, base = dist[s];
      const c = i % g.cols, r = (i / g.cols) | 0;
      for (let nd = 0; nd < 4; nd++) {
        if (nd === (d + 2) % 4) continue;
        const cc = c + D4[nd][0], rr = r + D4[nd][1];
        if (cc < 0 || rr < 0 || cc >= g.cols || rr >= g.rows) continue;
        const j = rr * g.cols + cc;
        if (!passable[j]) continue;
        let w = g.cable[j] === 1 ? COST_HIDDEN : walkway && walkway[j] ? COST_WALKWAY : COST_OPEN;
        if (nd !== d) w += COST_TURN;
        const ns = j * 4 + nd, nv = base + w;
        if (nv < dist[ns]) { dist[ns] = nv; prev[ns] = s; src[ns] = src[s]; heap.push(nv, ns); }
      }
    }
    return { g, dist, prev, src, ports, walkway };
  };

  // Route from the cheapest port to a plan point. Lengths in metres.
  G.cableRoute = function (field, x, y) {
    const g = field.g;
    let i = G.idx(g, x, y);
    if (i < 0) return null;
    let best = -1, bv = Infinity;
    for (let d = 0; d < 4; d++) if (field.dist[i * 4 + d] < bv) { bv = field.dist[i * 4 + d]; best = i * 4 + d; }
    if (best < 0) return null;
    const cells = [];
    for (let s = best; s >= 0; s = field.prev[s]) cells.push(s >> 2);
    cells.reverse();
    let exposed = 0, crossings = 0, inWalk = false;
    cells.forEach((c) => {
      const open = g.cable[c] === 0;
      if (open) exposed += CELL;
      const w = open && field.walkway && field.walkway[c];
      if (w && !inWalk) crossings++;
      inWalk = !!w;
    });
    // Corner points only, for drawing.
    const pts = [];
    cells.forEach((c, k) => {
      if (k === 0 || k === cells.length - 1) { pts.push(G.cellCenter(g, c)); return; }
      const a = cells[k - 1], b = cells[k + 1];
      if (b - c !== c - a) pts.push(G.cellCenter(g, c));
    });
    pts[pts.length - 1] = { x, y };
    return { port: field.ports[field.src[best]], pts, cells, length: Math.max(0, cells.length - 1) * CELL, exposed, crossings, cost: bv };
  };
})();
