(function () {
  // Deterministic placement scoring. Every number here is reproducible from the layout, and the
  // same measurements are handed to the AI so its review is grounded in them.
  const G = KP.geo, CAT = KP.CATALOG;
  const S = (KP.score = {});

  S.CRITERIA = [
    { id: 'visibility', name: 'Line of sight', short: 'Can arriving guests see it from the doors and around the lobby?' },
    { id: 'obviousness', name: 'Obviousness', short: 'In the natural field of view on arrival, screen facing guests, not lost in clutter' },
    { id: 'flow', name: 'Guest flow', short: 'Beside the main walking routes without blocking them, doorways or the desk queue' },
    { id: 'staff', name: 'Staff proximity', short: 'Staff nearby with a clear view, ready to help' },
    { id: 'infra', name: 'Power & data', short: 'Short, hidden cable runs from the nearest ports' },
    { id: 'access', name: 'Clearance & access', short: 'Clear floor space to use, queue and approach in a wheelchair' },
    { id: 'spacing', name: 'Spacing around kiosk', short: 'Room at the sides for luggage, no dead gaps behind, not crammed against other kiosks' },
  ];
  S.DEFAULT_WEIGHTS = { visibility: 20, obviousness: 16, flow: 18, staff: 13, infra: 12, access: 11, spacing: 10 };
  S.weights = () => Object.assign({}, S.DEFAULT_WEIGHTS, KP.state.weights || {});
  S.FACINGS = [0, 45, 90, 135, 180, 225, 270, 315];

  const COMPASS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
  const COMPASS_LONG = { E: 'east', SE: 'south-east', S: 'south', SW: 'south-west', W: 'west', NW: 'north-west', N: 'north', NE: 'north-east' };
  S.compass = (deg) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
  S.compassLong = (deg) => COMPASS_LONG[S.compass(deg)];
  S.bearing = (a, b) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI; // same convention as kiosk facing
  // Grades come from the five 20-point buckets defined in formulas.js.
  S.grade = (s) => KP.F.grade(s).letter;

  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const ramp = (v, a, b) => clamp01((v - a) / (b - a));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const angBetween = (u, v) => {
    const a = Math.abs(Math.atan2(u.y, u.x) - Math.atan2(v.y, v.x)) % (2 * Math.PI);
    return ((a > Math.PI ? 2 * Math.PI - a : a) * 180) / Math.PI;
  };
  const boxGap = (a, b) => Math.hypot(Math.max(a.x0 - b.x1, 0, b.x0 - a.x1), Math.max(a.y0 - b.y1, 0, b.y0 - a.y1));
  const clampIn = (room, p) => ({ x: Math.min(room.w - 0.1, Math.max(0.1, p.x)), y: Math.min(room.d - 0.1, Math.max(0.1, p.y)) });

  // ------------------------------------------------------------------------------
  // Layout-level analysis (independent of kiosks). Recomputed whenever the floor plan changes.
  S.analyze = function (state) {
    const t0 = performance.now();
    const room = state.room, els = state.elements;
    const g = G.build(room, els);

    const entries = [];
    els.forEach((el) => {
      const t = CAT[el.type];
      if (!t || !t.entry) return;
      const n = G.frontDir(el.rot), along = { x: -n.y, y: n.x };
      const base = { x: el.x + (n.x * el.d) / 2, y: el.y + (n.y * el.d) / 2 };
      const at = (d, off) => clampIn(room, { x: base.x + n.x * d + along.x * off, y: base.y + n.y * d + along.y * off });
      const half = el.w / 2;
      entries.push({
        id: el.id, label: el.label, type: el.type, kind: t.entry.kind, weight: t.entry.weight, el, n,
        anchor: at(0.8, 0),
        // Where an arriving guest's eyes are: just inside the door, and a few steps in.
        samples: [at(1, -half * 0.6), at(1, 0), at(1, half * 0.6), at(3, -half * 0.4), at(3, half * 0.4)],
      });
    });
    const mains = entries.filter((e) => e.kind === 'main');

    const counters = els.filter((el) => CAT[el.type] && CAT[el.type].counter).map((el) => {
      const n = G.frontDir(el.rot), along = { x: -n.y, y: n.x };
      const edge = { x: el.x + (n.x * el.d) / 2, y: el.y + (n.y * el.d) / 2 };
      const corners = [-1, 1].flatMap((s) => [0, 2.5].map((d) => ({ x: edge.x + along.x * s * el.w / 2 + n.x * d, y: edge.y + along.y * s * el.w / 2 + n.y * d })));
      const queue = { x0: Math.min(...corners.map((c) => c.x)), y0: Math.min(...corners.map((c) => c.y)), x1: Math.max(...corners.map((c) => c.x)), y1: Math.max(...corners.map((c) => c.y)) };
      return { el, n, front: clampIn(room, { x: edge.x + n.x * 0.9, y: edge.y + n.y * 0.9 }), queue };
    });

    const staff = els.filter((el) => CAT[el.type] && CAT[el.type].staff).map((el) => ({ id: el.id, label: el.label, type: el.type, x: el.x, y: el.y }));

    // Primary guest routes, weighted by how much traffic they carry.
    const lifts = entries.filter((e) => e.kind === 'lift'), sides = entries.filter((e) => e.kind === 'side');
    const desks = counters.filter((c) => c.el.type === 'checkin');
    const targets = desks.length ? desks : counters;
    const nearestOf = (p, list, key) => list.reduce((b, x) => (!b || dist(p, key(x)) < dist(p, key(b)) ? x : b), null);
    const defs = [];
    mains.forEach((m) => {
      targets.forEach((c) => defs.push({ kind: 'entrance_desk', from: m.anchor, to: c.front, w: 1, name: `${m.label} → ${c.el.label}` }));
      const l = nearestOf(m.anchor, lifts, (x) => x.anchor);
      if (l) defs.push({ kind: 'entrance_lift', from: m.anchor, to: l.anchor, w: 0.7, name: `${m.label} → ${l.label}` });
    });
    targets.forEach((c) => {
      const l = nearestOf(c.front, lifts, (x) => x.anchor);
      if (l) defs.push({ kind: 'desk_lift', from: c.front, to: l.anchor, w: 0.8, name: `${c.el.label} → ${l.label}` });
    });
    sides.forEach((s) => {
      const c = nearestOf(s.anchor, targets, (x) => x.front);
      const l = nearestOf(s.anchor, lifts, (x) => x.anchor);
      if (c) defs.push({ kind: 'side', from: s.anchor, to: c.front, w: 0.5, name: `${s.label} → ${c.el.label}` });
      else if (l) defs.push({ kind: 'side', from: s.anchor, to: l.anchor, w: 0.5, name: `${s.label} → ${l.label}` });
    });
    const routes = defs.slice(0, 8).map((d, k) => {
      const r = G.astar(g, d.from, d.to, g.walkInfl);
      return r ? Object.assign({ id: k }, d, r) : Object.assign({ id: k, blocked: true, cells: [], raw: [], pts: [d.from, d.to], length: dist(d.from, d.to) }, d);
    });

    // Route corridors: centre line (for distance) and a ~0.75 m wide band (for "is this in the walkway").
    const N = g.cols * g.rows, core = new Uint8Array(N), routeBits = new Uint8Array(N);
    routes.forEach((r) => r.cells.forEach((i) => {
      core[i] = 1;
      const c = i % g.cols, rr = (i / g.cols) | 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const r2 = rr + dr, c2 = c + dc;
        if (r2 >= 0 && c2 >= 0 && r2 < g.rows && c2 < g.cols) routeBits[r2 * g.cols + c2] |= 1 << r.id;
      }
    }));
    const routeMask = routeBits.map((b) => (b ? 1 : 0));
    const routeDist = G.distanceField(g, core);

    const reachFrom = (mains.length ? mains : entries).map((e) => e.anchor);
    const reach = G.flood(g, reachFrom, g.walk);

    // "How far out of the guest flow": walking distance fields for main entrance → kiosk → next stop
    // (the lifts, or the check-in desk when there are no lifts), compared with going there directly.
    const tripTo = lifts.length ? lifts.map((l) => l.anchor) : targets.map((c) => c.front);
    let trip = null;
    if (mains.length && tripTo.length) {
      const fromField = G.walkField(g, mains.map((e) => e.anchor), g.walkInfl), toField = G.walkField(g, tripTo, g.walkInfl);
      let direct = Infinity;
      tripTo.forEach((q) => { const i = G.nearestFree(g, q.x, q.y, g.walkInfl); if (i >= 0) direct = Math.min(direct, fromField[i]); });
      if (isFinite(direct)) trip = { fromField, toField, direct, goal: lifts.length ? 'lift' : 'desk' };
    }

    const ports = els.filter((el) => CAT[el.type] && CAT[el.type].port).map((el) => ({ id: el.id, label: el.label, type: el.type, x: el.x, y: el.y }));
    const powerPorts = ports.filter((p) => CAT[p.type].power), ethPorts = ports.filter((p) => CAT[p.type].ethernet);
    const powerField = powerPorts.length ? G.cableField(g, powerPorts, routeMask) : null;
    const ethField = ethPorts.length ? G.cableField(g, ethPorts, routeMask) : null;

    const grid = (step) => {
      const out = [];
      for (let y = step / 2; y < room.d; y += step) for (let x = step / 2; x < room.w; x += step) {
        const i = G.idx(g, x, y);
        if (i >= 0 && !g.walk[i]) out.push({ x, y });
      }
      return out;
    };

    return {
      room, els, g, entries, mains, counters, staff, routes, routeBits, routeMask, routeDist, reach, trip,
      powerPorts, ethPorts, powerField, ethField,
      viewSamples: grid(1.0), viewFast: grid(1.5),
      ms: Math.round(performance.now() - t0),
    };
  };

  S.validSpot = function (an, p, kiosks, excludeId) {
    const b = G.kioskBox(p), R = an.room;
    if (b.x0 < -1e-6 || b.y0 < -1e-6 || b.x1 > R.w + 1e-6 || b.y1 > R.d + 1e-6) return false;
    for (const el of an.els) {
      const t = CAT[el.type];
      if ((t.walk || t.entry || t.marker) && G.overlap(b, G.aabb(el))) return false;
    }
    for (const k of kiosks || []) if (k.id !== excludeId && G.overlap(b, G.kioskBox(k))) return false;
    return true;
  };

  // ------------------------------------------------------------------------------
  // Free space around the kiosk in the 8 compass directions (index = facing / 45): metres from the
  // kiosk's edge to the first obstacle, wall or other kiosk, capped at 3 m. Three parallel rays per
  // direction give the gap a body's width. Optionally records which guest routes run through each gap.
  const DIRS8 = S.FACINGS.map((d) => G.facingVec(d));
  function gapsAround(an, p, others, withRoutes) {
    const g = an.g, gaps = new Array(8), gapBits = withRoutes ? new Array(8).fill(0) : null;
    for (let k = 0; k < 8; k++) {
      const u = DIRS8[k], v = { x: -u.y, y: u.x }, edge = 0.3 / Math.max(Math.abs(u.x), Math.abs(u.y));
      let d = 0;
      walk: for (; d < 3; d += 0.1) {
        for (const o of [-0.25, 0, 0.25]) {
          const x = p.x + u.x * (edge + d + 0.05) + v.x * o, y = p.y + u.y * (edge + d + 0.05) + v.y * o;
          const i = G.idx(g, x, y);
          if (i < 0 || g.walk[i]) break walk;
          if (others.length && others.some((q) => G.distToBox({ x, y }, G.kioskBox(q)) < 0.01)) break walk;
          if (gapBits && o === 0) gapBits[k] |= an.routeBits[i];
        }
      }
      gaps[k] = Math.min(3, Math.round(d * 10) / 10);
    }
    return { gaps, gapBits };
  }

  // Measurements that don't depend on which way the screen faces.
  function baseMetrics(an, p, fast, others = []) {
    const g = an.g, m = {};

    // Line of sight from each entry's viewpoints.
    let ws = 0, vs = 0;
    m.entryVis = [];
    m.views = { main: [0, 0], lift: [0, 0], side: [0, 0] }; // [viewpoints that see it, viewpoints checked]
    for (const e of an.entries) {
      let v = 0;
      const blockers = new Set();
      for (const s of e.samples) {
        const r = G.los(g, s.x, s.y, p.x, p.y);
        if (r.clear) v++;
        else if (!fast && r.owner >= 0) blockers.add(r.owner);
      }
      const frac = v / e.samples.length;
      m.views[e.kind][0] += v; m.views[e.kind][1] += e.samples.length;
      ws += e.weight; vs += e.weight * frac;
      if (!fast) m.entryVis.push({ entry: e, frac, dist: dist(e.anchor, p), blockers: [...blockers].map((k) => an.els[k].label) });
    }
    m.entryVisW = ws ? vs / ws : 0;

    // Viewshed: share of the walkable lobby (within 15 m) that can see the kiosk.
    const samples = fast ? an.viewFast : an.viewSamples;
    m.visDirs = []; // unit vectors kiosk → each sample that can see it (flat x,y pairs)
    for (const s of samples) {
      const d = dist(s, p);
      if (d > 15 || d < 0.5) continue;
      if (G.los(g, s.x, s.y, p.x, p.y).clear) m.visDirs.push((s.x - p.x) / d, (s.y - p.y) / d);
    }
    m.viewTotal = samples.length;
    m.spotArea = fast ? 2.25 : 1; // m² represented by each survey point (1 m grid, 1.5 m for the heatmap)
    m.viewFrac = samples.length ? m.visDirs.length / 2 / samples.length : 0;

    // Relationship to the main entrance: inside the arriving guest's forward field of view, at a sensible distance?
    const main = an.mains.length ? an.mains.reduce((b, e) => (dist(e.anchor, p) < dist(b.anchor, p) ? e : b)) : an.entries.slice().sort((a, b) => b.weight - a.weight)[0];
    m.main = main || null;
    m.mainCount = an.mains.length;
    if (main) {
      const v = { x: p.x - main.anchor.x, y: p.y - main.anchor.y };
      m.mainDist = Math.hypot(v.x, v.y);
      m.mainAngle = m.mainDist < 0.3 ? 0 : angBetween(main.n, v);
    }

    // Clutter: tall items within 1.2 m that compete with or hide the kiosk.
    const kb = G.kioskBox(p);
    m.clutter = [];
    for (const el of an.els) {
      const t = CAT[el.type];
      if (t.entry || t.port || t.marker || t.flat || (el.h ?? t.h) < 1.2) continue;
      if (boxGap(kb, G.aabb(el)) <= 1.2) m.clutter.push(el.label);
    }

    // Guest flow: distance from the nearest route centre line, and which routes run through the footprint.
    const ci = G.idx(g, p.x, p.y);
    m.routeCount = an.routes.filter((r) => !r.blocked).length;
    m.routesPassing = an.routes.filter((r) => !r.blocked && r.raw.some((q) => (q.x - p.x) ** 2 + (q.y - p.y) ** 2 <= 9)).length;
    m.routeDist = an.routes.length && ci >= 0 ? an.routeDist[ci] : Infinity;
    let bits = 0;
    G.forCells(g, G.kioskBox(p, 0.3), (i) => { bits |= an.routeBits[i]; });
    // Estimate for the heatmap (exact detours are measured in evalOne): 1.8 m extra per route the spot sits in.
    m.approxExtra = {};
    an.routes.forEach((r) => { if (bits & (1 << r.id)) m.approxExtra[r.kind] = (m.approxExtra[r.kind] || 0) + (r.blocked ? 0 : 1.8); });

    // Doorway clearance: a queue mustn't spill into a doorway or lift landing.
    let deficit = -Infinity;
    m.doorWorst = null;
    m.doorDist = { main: Infinity, side: Infinity, lift: Infinity };
    for (const e of an.entries) {
      m.doorDist[e.kind] = Math.min(m.doorDist[e.kind], dist(e.anchor, p));
      const req = e.kind === 'main' ? 4 : 3, d = dist(e.anchor, p); // clearances match the default door_shortfall factor
      if (req - d > deficit) { deficit = req - d; m.doorWorst = { entry: e, d, req }; }
    }
    m.inQueue = an.counters.filter((c) => G.overlap(G.kioskBox(p, 0.2), c.queue)).map((c) => c.el.label);

    // Staff: nearest one, and how many can actually see the kiosk.
    m.staffCount = an.staff.length;
    if (an.staff.length) {
      let nd = Infinity, near = null, losN = 0, losAny = false;
      for (const s of an.staff) {
        const d = dist(s, p);
        if (d < nd) { nd = d; near = s; }
        if (d <= 15 && G.los(g, s.x, s.y, p.x, p.y, 0.5).clear) { losAny = true; m.staffLos15 = (m.staffLos15 || 0) + 1; if (d <= 12) losN++; }
      }
      Object.assign(m, { staffDist: nd, staffNearest: near, staffLosAny: losAny, staffLosCount: losN });
    } else m.staffNone = true;

    // Power & data: cheapest route from any port of each kind.
    m.power = an.powerField ? G.cableRoute(an.powerField, p.x, p.y) : null;
    m.eth = an.ethField ? G.cableRoute(an.ethField, p.x, p.y) : null;

    Object.assign(m, gapsAround(an, p, others, !fast));
    return m;
  }

  // Free fraction of a rectangle in front of the screen (d0..d1 metres from the kiosk centre, 1.2 m wide).
  function zone(an, p, f, side, d0, d1, others) {
    let n = 0, free = 0, onRoute = 0;
    for (let d = d0; d <= d1 + 1e-6; d += 0.35) for (let s = -0.6; s <= 0.6 + 1e-6; s += 0.3) {
      const x = p.x + f.x * d + side.x * s, y = p.y + f.y * d + side.y * s;
      n++;
      const i = G.idx(an.g, x, y);
      if (i < 0 || an.g.walk[i]) continue;
      if (others.length && others.some((o) => G.distToBox({ x, y }, G.kioskBox(o)) < 0.05)) continue;
      free++;
      if (an.routeBits[i]) onRoute++;
    }
    return { n, free: free / n, onRoute };
  }

  // Measurements that depend on the screen direction.
  function facingMetrics(an, p, facing, m, others) {
    const f = G.facingVec(facing), side = { x: -f.y, y: f.x }, fm = { facing };
    let best = 0;
    fm.faceBest = null;
    fm.screenAngle = { main: 180, lift: 180, side: 180 }; // best (smallest) screen angle to each kind of entry
    for (const e of an.entries) {
      const ang = angBetween(f, { x: e.anchor.x - p.x, y: e.anchor.y - p.y });
      fm.screenAngle[e.kind] = Math.min(fm.screenAngle[e.kind], ang);
      const s = (1 - ramp(ang, 40, 120)) * (0.4 + 0.6 * e.weight);
      if (s > best) { best = s; fm.faceBest = { entry: e, ang }; }
    }
    fm.faceS = best;
    // Share of the lobby that sees the screen face: viewers within 70° of the facing direction.
    const cosLim = Math.cos((70 * Math.PI) / 180), v = m.visDirs;
    let n = 0;
    for (let j = 0; j < v.length; j += 2) if (v[j] * f.x + v[j + 1] * f.y >= cosLim) n++;
    fm.screenCount = n;
    fm.screenFrac = m.viewTotal ? n / m.viewTotal : 0;
    const front = zone(an, p, f, side, 0.4, 1.8, others), queue = zone(an, p, f, side, 1.9, 3.3, others);
    fm.frontFree = front.free;
    fm.queueFree = queue.free;
    fm.queueOnRoute = (front.onRoute + queue.onRoute) / (front.n + queue.n);
    const fi = G.idx(an.g, p.x + f.x * 0.75, p.y + f.y * 0.75);
    fm.reach = fi >= 0 && an.reach[fi] === 1;

    // Detour to use it: entrance → stand at the screen → lifts/desk, minus entrance → lifts/desk.
    fm.extraToUse = 0;
    if (an.trip) {
      const ci = G.nearestFree(an.g, p.x + f.x * 0.75, p.y + f.y * 0.75, an.g.walkInfl, 4);
      const via = ci >= 0 ? an.trip.fromField[ci] + an.trip.toField[ci] : Infinity;
      fm.extraToUse = isFinite(via) ? Math.max(0, Math.round((via - an.trip.direct) * 10) / 10) : 99;
    }

    // Spacing, relative to the screen: sides (luggage, a companion, no dead slivers), back
    // (flush to a wall, or open enough to service; a narrow gap collects litter) and other kiosks.
    const k8 = ((Math.round(facing / 45) % 8) + 8) % 8, gp = m.gaps;
    fm.gapFront = gp[k8]; fm.gapBack = gp[(k8 + 4) % 8]; fm.gapSides = [gp[(k8 + 2) % 8], gp[(k8 + 6) % 8]];
    fm.nearestKiosk = others.reduce((b, o) => { const d = dist(o, p); return !b || d < b.d ? { label: o.label, d } : b; }, null);
    return fm;
  }

  // The observed inputs the scoring formulas use (KP.F.VARS documents each one's unit and how
  // to measure it on site). extra = metres of extra walking per route kind.
  S.variables = function (m, fm, extra) {
    const fin = (v, d) => (Number.isFinite(v) ? v : d), ZONE = 1.8; // m², 1.5 m × 1.2 m
    return {
      main_views: m.views.main[0], main_viewpoints: m.views.main[1],
      lift_views: m.views.lift[0], lift_viewpoints: m.views.lift[1],
      side_views: m.views.side[0], side_viewpoints: m.views.side[1],
      lobby_view_area: (m.visDirs.length / 2) * m.spotArea, lobby_walkable_area: m.viewTotal * m.spotArea,
      main_entrances: m.mainCount, main_distance: m.main && m.mainCount ? m.mainDist : 99, main_angle: m.main ? m.mainAngle : 0,
      screen_angle_main: fm.screenAngle.main, screen_angle_lift: fm.screenAngle.lift, screen_angle_side: fm.screenAngle.side,
      screen_view_area: fm.screenCount * m.spotArea, tall_items_nearby: m.clutter.length,
      guest_routes: m.routeCount, route_distance: fin(m.routeDist, 99),
      extra_walk_to_use: fm.extraToUse, routes_passing_3m: m.routesPassing,
      extra_walk_entrance_desk: extra.entrance_desk || 0, extra_walk_entrance_lift: extra.entrance_lift || 0,
      extra_walk_desk_lift: extra.desk_lift || 0, extra_walk_side: extra.side || 0,
      side_door_distance: fin(m.doorDist.side, 99), lift_distance: fin(m.doorDist.lift, 99),
      in_desk_queue: m.inQueue.length ? 1 : 0, walkway_area_in_front: fm.queueOnRoute * 2 * ZONE,
      staff_points: m.staffCount, staff_distance: m.staffNone ? 99 : m.staffDist,
      staff_seeing_15m: m.staffLos15 || 0, staff_seeing_12m: m.staffLosCount || 0,
      power_route: m.power ? 1 : 0, power_length: m.power ? m.power.length : 0, power_exposed: m.power ? m.power.exposed : 0, power_crossings: m.power ? m.power.crossings : 0,
      data_route: m.eth ? 1 : 0, data_length: m.eth ? m.eth.length : 0, data_exposed: m.eth ? m.eth.exposed : 0, data_crossings: m.eth ? m.eth.crossings : 0,
      front_clear_area: fm.frontFree * ZONE, queue_clear_area: fm.queueFree * ZONE, front_reachable: fm.reach ? 1 : 0,
      side_gap_a: fm.gapSides[0], side_gap_b: fm.gapSides[1], back_gap: fm.gapBack,
      nearest_kiosk: fm.nearestKiosk ? fm.nearestKiosk.d : 99,
    };
  };

  // Scores come from the editable formulas: variables → factors → criteria → overall.
  function combine(m, fm, extra, W) {
    return KP.F.run(S.variables(m, fm, extra), W);
  }

  // ------------------------------------------------------------------------------
  // Full evaluation of the user's kiosks.
  S.evaluate = function (an, kiosks, W) {
    W = W || S.weights();
    const res = kiosks.map((k) => evalOne(an, k, kiosks, W));
    const overall = res.length ? Math.round(res.reduce((a, r) => a + r.overall, 0) / res.length) : null;
    const pairs = [];
    for (let i = 0; i < kiosks.length; i++) for (let j = i + 1; j < kiosks.length; j++) pairs.push({ a: kiosks[i], b: kiosks[j], d: dist(kiosks[i], kiosks[j]) });
    return { kiosks: res, overall, grade: S.grade(overall), pairs, W };
  };

  function evalOne(an, k, all, W) {
    const others = all.filter((o) => o.id !== k.id);
    const m = baseMetrics(an, k, false, others);

    // Exact obstruction: re-route every guest path passing near the kiosk with the kiosk in place.
    const blocked = new Uint8Array(an.g.walkInfl);
    G.forCells(an.g, G.kioskBox(k, 0.25), (i) => { blocked[i] = 1; });
    // Measured extra walking per route kind (99 m = blocked). How it's penalised is up to the formulas.
    const detours = [], extra = {};
    for (const r of an.routes) {
      if (r.blocked || !r.raw.some((q) => dist(q, k) < 1.6)) continue;
      const nr = G.astar(an.g, r.from, r.to, blocked);
      const e = nr ? Math.max(0, Math.round((nr.length - r.length) * 100) / 100) : 99;
      extra[r.kind] = (extra[r.kind] || 0) + e;
      if (!nr) detours.push({ route: r, blocked: true });
      else if (e > 0.3) detours.push({ route: r, extra: e });
    }

    const fm = facingMetrics(an, k, k.facing, m, others);
    const c = combine(m, fm, extra, W);

    let bestFacing = { facing: k.facing, overall: c.overall };
    for (const f of S.FACINGS) {
      const c2 = combine(m, facingMetrics(an, k, f, m, others), extra, W);
      if (c2.overall > bestFacing.overall) bestFacing = { facing: f, overall: c2.overall };
    }

    let nearRoute = null, nd = Infinity;
    for (const r of an.routes) for (const q of r.raw) { const d = dist(q, k); if (d < nd) { nd = d; nearRoute = r; } }

    const sight = an.entries.map((e) => {
      const r = G.los(an.g, e.anchor.x, e.anchor.y, k.x, k.y);
      return { entry: e, clear: r.clear, hit: r.clear ? null : { x: r.x, y: r.y } };
    });
    const out = {
      kiosk: k, id: k.id, label: k.label, m, fm, extra, detours, scores: c.scores, overall: c.overall, grade: S.grade(c.overall), env: c.env,
      bestFacing, nearRoute, sight, spacing: others.map((o) => ({ label: o.label, d: dist(o, k) })),
    };
    out.recs = S.recommend(an, out);
    out.checks = S.checks(an, out);
    return out;
  }

  // ------------------------------------------------------------------------------
  // Heatmap: best achievable score at every 0.5 m spot (choosing the best facing for each).
  S.heatmap = function (an, W) {
    W = W || S.weights();
    const t0 = performance.now(), step = 0.5, R = an.room, cells = [];
    let best = null;
    for (let y = step / 2; y < R.d; y += step) for (let x = step / 2; x < R.w; x += step) {
      const half = KP.KIOSK.size / 2;
      const p = { x: Math.min(R.w - half, Math.max(half, x)), y: Math.min(R.d - half, Math.max(half, y)) };
      if (!S.validSpot(an, p, [], null)) continue;
      const m = baseMetrics(an, p, true);
      let bs = -1, bf = 0;
      for (const f of S.FACINGS) {
        const c = combine(m, facingMetrics(an, p, f, m, []), m.approxExtra, W);
        if (c.overall > bs) { bs = c.overall; bf = f; }
      }
      const cell = { x, y, px: p.x, py: p.y, score: bs, facing: bf };
      cells.push(cell);
      if (!best || bs > best.score) best = cell;
    }
    const cols = Math.ceil(R.w / step), map = new Map();
    cells.forEach((c) => map.set(Math.floor(c.y / step) * cols + Math.floor(c.x / step), c));
    return { step, cells, best, at: (x, y) => map.get(Math.floor(y / step) * cols + Math.floor(x / step)), ms: Math.round(performance.now() - t0) };
  };

  // ------------------------------------------------------------------------------
  // Rule-based findings. Severity: high / medium / low problems, 'good' for strengths.
  const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1);
  const pct = (v) => `${Math.round(v * 100)}%`;
  const list = (a) => (a.length <= 2 ? a.join(' and ') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

  S.recommend = function (an, r) {
    const out = [], m = r.m, fm = r.fm, k = r.kiosk, sc = r.scores;
    const add = (sev, crit, text) => out.push({ sev, crit, text });

    const mainVis = m.entryVis.find((v) => v.entry.kind === 'main');
    if (mainVis && mainVis.frac < 0.6) add('high', 'visibility', `Hidden from ${mainVis.entry.label}: only ${pct(mainVis.frac)} of arrival viewpoints can see it${mainVis.blockers.length ? ` (blocked by ${list(mainVis.blockers)})` : ''}.`);
    m.entryVis.filter((v) => v.entry.kind !== 'main' && v.frac < 0.4).forEach((v) => add('low', 'visibility', `Not visible from ${v.entry.label}${v.blockers.length ? ` (blocked by ${list(v.blockers)})` : ''}.`));
    if (m.viewFrac < 0.35) add('medium', 'visibility', `Only ${pct(m.viewFrac)} of the walkable lobby has a clear view of the kiosk, so it's tucked away.`);

    const gain = r.bestFacing.overall - r.overall;
    if (fm.faceS < 0.5 && m.main) add('high', 'obviousness', `The screen faces ${S.compassLong(k.facing)}, away from arriving guests.${gain > 0 ? ` Turning it to face ${S.compassLong(r.bestFacing.facing)} scores ${r.bestFacing.overall} (+${gain}).` : ''}`);
    else if (gain >= 4) add('medium', 'obviousness', `Rotating the screen to face ${S.compassLong(r.bestFacing.facing)} would score ${r.bestFacing.overall} (+${gain}).`);
    if (m.main && m.mainAngle > 95) add('medium', 'obviousness', `It's behind guests as they walk in from ${m.main.label} (${Math.round(m.mainAngle)}° off their direction of travel), so they would have to turn round to notice it.`);
    if (m.main && m.mainDist > 8) add(m.mainDist > 16 ? 'high' : 'medium', 'obviousness', `It's ${f1(m.mainDist)} m from ${m.main.label}, too far to stand out from the door (aim for 4–8 m).`);
    if (m.clutter.length) add('low', 'obviousness', `Tall items close by (${list(m.clutter)}) crowd the kiosk and make it less distinct.`);

    r.detours.forEach((d) => add('high', 'flow', d.blocked ? `It completely blocks the guest route ${d.route.name}.` : `It stands in the guest route ${d.route.name}, forcing a ${f1(d.extra)} m detour.`));
    if (m.routeDist > 3 && r.nearRoute) add(m.routeDist > 7 ? 'high' : 'medium', 'flow', `It's ${f1(m.routeDist)} m from the nearest guest route (${r.nearRoute.name}). Kiosks get used most when they're 1.2–3 m beside the main path.`);
    if (m.doorWorst && m.doorWorst.d < m.doorWorst.req) add(m.doorWorst.d < m.doorWorst.req - 1 ? 'high' : 'medium', 'flow', `Only ${f1(m.doorWorst.d)} m from ${m.doorWorst.entry.label}, so a queue would back up into the doorway (keep at least ${m.doorWorst.req} m).`);
    if (m.inQueue.length) add('high', 'flow', `It's inside the queueing area in front of ${list(m.inQueue)}.`);
    if (an.trip && fm.extraToUse > 2) add(fm.extraToUse > 12 ? 'high' : 'medium', 'flow', fm.extraToUse >= 99 ? 'Guests can’t reach it on their way in.' : `It's out of the guest flow: using it adds ${f1(fm.extraToUse)} m to the walk from ${m.main ? m.main.label : 'the entrance'} to the ${an.trip.goal === 'lift' ? 'lifts' : 'desk'} (aim for 2 m or less).`);
    if (m.routeCount && !m.routesPassing) add('medium', 'flow', 'No guest route passes within 3 m, so few people walk past it.');
    if (fm.queueOnRoute > 0.4) add('medium', 'flow', 'Guests using or waiting for the kiosk would be standing in a busy walkway.');

    if (m.staffNone) add('medium', 'staff', 'No staff positions are marked on the plan, so assistance can’t be assessed. Add the front desk or staff positions in step 1.');
    else {
      if (m.staffDist > 6) add(m.staffDist > 14 ? 'high' : 'medium', 'staff', `The nearest staff (${m.staffNearest.label}) is ${f1(m.staffDist)} m away, so guests who get stuck won't get quick help (aim for 2.5–6 m).`);
      if (!m.staffLosAny) add('high', 'staff', 'No staff position has a line of sight to the kiosk, so staff can’t spot guests who need help.');
      if (m.staffDist < 1.2) add('low', 'staff', `It's very close to ${m.staffNearest.label} (${f1(m.staffDist)} m) and may crowd their workspace.`);
    }

    // When power and data come from the same port (e.g. a floor box) they share one route: report it once.
    const shared = m.power && m.eth && m.power.port.id === m.eth.port.id;
    const cables = shared ? [['power and data', m.power, an.powerPorts]] : [['power', m.power, an.powerPorts], ['ethernet', m.eth, an.ethPorts]];
    cables.forEach(([name, c, ports]) => {
      const fix = c && c.port.type === 'floorbox' ? 'an extra floor box beside the kiosk' : 'a floor box nearer the kiosk';
      const what = shared ? 'cables' : 'cable';
      if (!ports.length) { add('high', 'infra', `No ${name} ports are marked on the plan. Add them in step 1 so cable runs can be assessed.`); return; }
      if (!c) { add('high', 'infra', `No ${name} cable route can reach this spot.`); return; }
      if (c.crossings) add('medium', 'infra', `The ${name} ${what} from ${c.port.label} cross${shared ? '' : 'es'} ${c.crossings} guest walkway${c.crossings > 1 ? 's' : ''}. That's a trip hazard: use a cable ramp, or install ${fix}.`);
      else if (c.exposed > 6) add('low', 'infra', `The ${name} ${what} from ${c.port.label} run${shared ? '' : 's'} ${f1(c.exposed)} m across open floor and need${shared ? '' : 's'} a cable cover, or ${fix}.`);
      if (c.length > 25) add('low', 'infra', `The ${name} run from ${c.port.label} is long (${f1(c.length)} m).`);
    });

    if (!fm.reach) add('high', 'access', 'Guests can’t reach the front of the kiosk from the entrance because it is boxed in.');
    if (fm.frontFree < 0.8) add(fm.frontFree < 0.6 ? 'high' : 'medium', 'access', `Only ${pct(fm.frontFree)} of the 1.5 m × 1.2 m area in front of the screen is clear. Wheelchair users need at least 0.8 × 1.2 m of clear floor, ideally a 1.5 m turning circle.`);
    if (fm.queueFree < 0.5 && fm.frontFree >= 0.6) add('low', 'access', 'There is little room for a second guest to wait behind the current user.');

    if (fm.nearestKiosk && fm.nearestKiosk.d < 1.2) add(fm.nearestKiosk.d < 1 ? 'high' : 'medium', 'spacing', `Only ${f1(fm.nearestKiosk.d)} m (centre to centre) from ${fm.nearestKiosk.label}. Leave at least 1.2 m so users don't bump elbows or read each other's screens.`);
    if (Math.max(...fm.gapSides) < 1) add(Math.max(...fm.gapSides) < 0.5 ? 'high' : 'medium', 'spacing', `Not enough room beside the kiosk for a suitcase or a companion (widest side gap ${f1(Math.max(...fm.gapSides))} m; aim for at least 1 m on one side).`);
    else if (fm.gapSides.some((g) => g > 0.1 && g < 0.75)) add('low', 'spacing', `There's a narrow ${f1(Math.min(...fm.gapSides.filter((g) => g > 0.1)))} m sliver on one side: hard to clean and easy to snag luggage on. Close it up or open it to 0.75 m+.`);
    if (fm.gapBack > 0.15 && fm.gapBack < 1) add('medium', 'spacing', `The ${f1(fm.gapBack)} m gap behind the kiosk is too narrow to walk through but collects litter. Push it flush to what's behind it, or leave 1 m for servicing.`);

    if (sc.visibility >= 80) add('good', 'visibility', `Clearly visible from ${m.main ? m.main.label : 'the entrances'} and ${pct(m.viewFrac)} of the lobby.`);
    if (sc.flow >= 80) add('good', 'flow', `Sits ${f1(m.routeDist)} m beside the guest route without blocking it.`);
    if (sc.staff >= 80 && m.staffNearest) add('good', 'staff', `${m.staffNearest.label} is ${f1(m.staffDist)} m away with a clear view.`);
    if (sc.infra >= 80 && m.power && m.eth) add('good', 'infra', `Short cable runs: power ${f1(m.power.length)} m, data ${f1(m.eth.length)} m, mostly hidden.`);
    if (sc.access >= 90) add('good', 'access', 'Plenty of clear space in front of the screen for use and queueing.');
    if (sc.spacing >= 80) add('good', 'spacing', 'Open space around the kiosk for luggage, a companion and servicing.');

    // The D rule: one D criterion caps the overall grade at D.
    const cMin = KP.F.config.grades[2].min, dCrit = S.CRITERIA.filter((c) => sc[c.id] < cMin);
    if (dCrit.length) add('high', dCrit[0].id, `Overall capped at ${KP.F.config.grades[3].letter}: ${list(dCrit.map((c) => `${c.name} is ${KP.F.config.grades[3].letter} (${sc[c.id]})`))}. Lift ${dCrit.length > 1 ? 'these' : 'it'} to ${cMin}+ to remove the cap.`);
    if (dCrit.length) out[out.length - 1].cap = true;

    const order = { high: 0, medium: 1, low: 2, good: 3 };
    return out.sort((a, b) => (b.cap ? 1 : 0) - (a.cap ? 1 : 0) || order[a.sev] - order[b.sev]);
  };

  // ------------------------------------------------------------------------------
  // Guest & operations checks: practical considerations beyond the core score. Each returns a
  // status ('ok' | 'watch' | 'issue' | 'na') and a plain-language explanation.
  // Each check reports one observed quantity (what to measure on site, its unit) and the
  // thresholds that turn it into good / watch / issue.
  S.CHECKS = [
    { id: 'privacy', name: 'Screen privacy', who: 'Guests', measure: 'Walkway behind the user', unit: '%',
      rule: 'Good < 15% · watch 15–40% · issue ≥ 40%', how: 'Standing at the screen, look at the 80° cone behind the user from 1.5 m to 4 m out. Estimate what share of that floor is a guest walkway.' },
    { id: 'luggage', name: 'Room for luggage', who: 'Guests', measure: 'Widest free space beside the kiosk', unit: 'm',
      rule: 'Good ≥ 0.9 m · watch 0.5–0.9 m · issue < 0.5 m', how: 'Measure from each side of the kiosk to the first obstacle; take the wider side.' },
    { id: 'comfort', name: 'Draughts at the doors', who: 'Guests', measure: 'Distance to the nearest outside door', unit: 'm',
      rule: 'Good ≥ 4.5 m · watch 2.5–4.5 m · issue < 2.5 m', how: 'Measure from 0.8 m inside the nearest main or side entrance to the kiosk centre.' },
    { id: 'journey', name: 'Walk on to the lifts', who: 'Guests', measure: 'Extra walk via the kiosk', unit: 'm',
      rule: 'Good ≤ 4 m · watch 4–10 m · issue > 10 m', how: 'Walk main entrance → kiosk front → nearest lift, then main entrance → lift directly. Subtract the two.' },
    { id: 'wayfinding', name: 'Lifts visible after check-in', who: 'Guests', measure: 'Lift doors visible from the kiosk (≤ 20 m)', unit: 'count',
      rule: 'Good ≥ 1 · watch 0', how: 'Stand 0.75 m in front of the screen and count the lift doors within 20 m you can see.' },
    { id: 'glare', name: 'Glare from windows', who: 'Guests', measure: 'Nearest window in front of / behind the screen', unit: 'm',
      rule: 'Issue: screen faces glass (within 45°) closer than 6 m · watch: faces glass 6–12 m away, or glass within 35° behind the kiosk · good: neither within 12 m', how: 'For each window within 12 m, measure its distance and its angle from the direction the screen faces.' },
    { id: 'lounge', name: 'Lounge & café impact', who: 'Manager', measure: 'Distance to the nearest seating', unit: 'm',
      rule: 'Issue: inside the lounge rug area · watch < 2 m · good ≥ 2 m', how: 'Measure from the kiosk to the nearest sofa, armchair or table, and check whether it stands on the lounge rug.' },
    { id: 'queue', name: 'Absorbs the desk queue', who: 'Manager', measure: 'Distance from the desk queue (and visible?)', unit: 'm',
      rule: 'Good: visible from the queue and ≤ 12 m · watch otherwise', how: 'Stand 1.7 m in front of the check-in counter (where the queue forms); measure to the kiosk and check whether you can see it.' },
    { id: 'overnight', name: 'Overnight supervision', who: 'Manager', measure: 'Front-desk positions that can see it (≤ 15 m)', unit: 'count',
      rule: 'Good ≥ 1 · watch 0', how: 'Stand at each front-desk staff position and check whether the kiosk is visible within 15 m.' },
    { id: 'egress', name: 'Emergency egress', who: 'Manager', measure: 'Narrowest guest-route width beside the kiosk', unit: 'm',
      rule: 'Good ≥ 1.2 m (or no route squeezed) · watch 0.9–1.2 m · issue < 0.9 m', how: 'Where a guest route passes the kiosk, measure the clear width between the kiosk and the nearest obstacle or wall.' },
    { id: 'install', name: 'Installation effort', who: 'Manager', measure: 'Longest run · open-floor metres · walkway crossings', unit: '',
      rule: 'Issue: a run > 30 m, or 2+ walkway crossings · watch: a crossing, or > 3 m of cable on open floor · good otherwise', how: 'Measure the power and data cable routes from the nearest ports.' },
  ];

  S.checks = function (an, r) {
    const k = r.kiosk, m = r.m, fm = r.fm, g = an.g, f = G.facingVec(k.facing), out = {};
    const set = (id, status, text, observed) => { out[id] = { status, text, observed: observed ?? null }; };
    const front = { x: k.x + f.x * 0.75, y: k.y + f.y * 0.75 };

    // Privacy: is the area behind the user (in the screen's view cone, 1.5–4 m out) a walkway?
    let n = 0, onRoute = 0;
    for (let d = 1.5; d <= 4; d += 0.5) for (let a = -40; a <= 40; a += 10) {
      const v = G.facingVec(k.facing + a), i = G.idx(g, k.x + v.x * d, k.y + v.y * d);
      if (i < 0 || g.walk[i]) continue;
      n++; if (an.routeBits[i]) onRoute++;
    }
    const exp = n ? onRoute / n : 0;
    set('privacy', exp < 0.15 ? 'ok' : exp < 0.4 ? 'watch' : 'issue', exp < 0.15
      ? 'Few people pass behind someone using it, so the screen is fairly private.'
      : `Passers-by can read names, room numbers and payment screens. Fit a privacy filter or angle the screen away from the route.`, `${Math.round(exp * 100)}%`);

    // Luggage: arriving guests have suitcases and need somewhere to park them beside the kiosk.
    const side = Math.max(...fm.gapSides);
    set('luggage', side >= 0.9 ? 'ok' : side >= 0.5 ? 'watch' : 'issue', side >= 0.9
      ? 'Space on one side for a suitcase or trolley.'
      : 'Guests will leave cases in the queue area. Aim for 0.9 m on one side.', `${f1(side)} m`);

    // Draughts / weather: standing right by an outside door is cold, wet and noisy.
    const outside = an.entries.filter((e) => e.kind !== 'lift');
    const door = outside.reduce((b, e) => { const d = dist(e.anchor, k); return !b || d < b.d ? { e, d } : b; }, null);
    if (!door) set('comfort', 'na', 'No outside doors on the plan.');
    else set('comfort', door.d < 2.5 ? 'issue' : door.d < 4.5 ? 'watch' : 'ok', door.d >= 4.5
      ? `Out of the draught from ${door.e.label}.`
      : `Close to ${door.e.label}: guests using it stand in draughts, rain and street noise each time the doors open.`, `${f1(door.d)} m`);

    // Journey: extra walking for entrance → kiosk → lift compared with entrance → lift.
    const lifts = an.entries.filter((e) => e.kind === 'lift'), main = m.main;
    if (!lifts.length || !main || main.kind === 'lift') set('journey', 'na', 'Needs a main entrance and at least one lift on the plan.');
    else {
      // Same measurement as the scored extra_walk_to_use input.
      const extra = fm.extraToUse;
      if (extra >= 99) set('journey', 'issue', 'No walkable route from the entrance via the kiosk to the lifts.');
      else set('journey', extra <= 4 ? 'ok' : extra <= 10 ? 'watch' : 'issue', extra <= 4
        ? `On the way from ${main.label} to the lifts.`
        : `Out of the guest flow: ${main.label} → kiosk → lifts is noticeably longer than going straight to the lifts.`, `${f1(extra)} m`);
    }

    // Wayfinding: after checking in, can the guest see where to go next?
    if (!lifts.length) set('wayfinding', 'na', 'No lifts on the plan.');
    else {
      const seen = lifts.filter((l) => dist(l.anchor, front) <= 20 && G.los(g, front.x, front.y, l.anchor.x, l.anchor.y).clear);
      set('wayfinding', seen.length ? 'ok' : 'watch', seen.length
        ? `${seen.map((l) => l.label).join(', ')} in view, so guests can see where to go next.`
        : 'No lift is visible from the kiosk. Add directional signage to the lifts.', String(seen.length));
    }

    // Glare: a window behind the user washes out the screen; a window behind the kiosk backlights it.
    const wins = an.els.filter((el) => CAT[el.type] && CAT[el.type].glazing);
    if (!wins.length) set('glare', 'na', 'No windows marked on the plan. Add them in step 1 to check for glare.');
    else {
      let worst = null;
      for (const w of wins) {
        const d = G.distToBox(k, G.aabb(w));
        if (d > 12) continue;
        const v = { x: w.x - k.x, y: w.y - k.y };
        const faces = angBetween(f, v) <= 45, behind = angBetween({ x: -f.x, y: -f.y }, v) <= 35;
        const sev = faces ? (d < 6 ? 2 : 1) : behind ? 1 : 0;
        if (sev && (!worst || sev > worst.sev)) worst = { w, d, sev, faces, ang: Math.round(faces ? angBetween(f, v) : angBetween({ x: -f.x, y: -f.y }, v)) };
      }
      if (!worst) set('glare', 'ok', 'No windows directly in front of or behind the screen within 12 m.', 'none');
      else set('glare', worst.sev === 2 ? 'issue' : 'watch', worst.faces
        ? `The screen faces ${worst.w.label}, so daylight will reflect off it. Use an anti-glare screen or turn it side-on to the glass.`
        : `Guests look towards ${worst.w.label} while using it; strong backlight makes the screen hard to read.`,
        `${f1(worst.d)} m, ${worst.ang}° ${worst.faces ? 'in front' : 'behind'}`);
    }

    // Lounge & café: don't take seating space or bring queue noise into quiet areas.
    const seats = an.els.filter((el) => ['sofa', 'armchair', 'round_table', 'coffee_table'].includes(el.type));
    const onRug = an.els.some((el) => el.type === 'rug' && G.overlap(G.kioskBox(k), G.aabb(el)));
    const seat = seats.reduce((b, el) => { const d = G.distToBox(k, G.aabb(el)); return !b || d < b.d ? { el, d } : b; }, null);
    const seatObs = onRug ? 'on the rug' : seat ? `${f1(seat.d)} m (${seat.el.label})` : 'no seating';
    if (onRug) set('lounge', 'issue', 'It sits inside the lounge area, taking seating space and bringing queue noise into a quiet zone.', seatObs);
    else if (seat && seat.d < 2) set('lounge', 'watch', `Close to ${seat.el.label}; kiosk queues and audio prompts may disturb seated guests.`, seatObs);
    else set('lounge', 'ok', 'Clear of lounge and café seating.', seatObs);

    // Queue absorption: guests waiting at the desk should notice the kiosk as a quicker alternative.
    const desks = an.counters.filter((c) => c.el.type === 'checkin');
    if (!desks.length) set('queue', 'na', 'No check-in counter on the plan.');
    else {
      const best = desks.map((c) => {
        const q = { x: c.front.x + c.n.x * 0.8, y: c.front.y + c.n.y * 0.8 };
        return { c, d: dist(q, k), los: G.los(g, q.x, q.y, k.x, k.y).clear };
      }).sort((a, b) => (b.los - a.los) || (a.d - b.d))[0];
      const ok = best.los && best.d <= 12;
      set('queue', ok ? 'ok' : 'watch', ok
        ? `Guests queuing at ${best.c.el.label} can see it, so it can take pressure off the desk.`
        : `Guests queuing at ${best.c.el.label} ${best.los ? 'would have to walk too far to it' : "can't see it"}, so it won't absorb the desk queue.`,
        `${f1(best.d)} m · ${best.los ? 'visible' : 'not visible'}`);
    }

    // Overnight: often only the front desk is staffed, so it should be able to see the kiosk.
    const deskStaff = an.staff.filter((s) => s.type === 'checkin' || desks.some((c) => G.distToBox(s, G.aabb(c.el)) <= 2.5));
    if (!deskStaff.length) set('overnight', 'na', 'No front-desk staff on the plan.');
    else {
      const seeing = deskStaff.filter((s) => dist(s, k) <= 15 && G.los(g, s.x, s.y, k.x, k.y, 0.5).clear).length;
      set('overnight', seeing ? 'ok' : 'watch', seeing
        ? 'The front desk can see the kiosk, so it is supervised overnight when other posts are empty.'
        : 'The front desk can’t see it. Overnight, when only the desk is staffed, guests needing help (and the hardware) are unsupervised.', `${seeing} of ${deskStaff.length}`);
    }

    // Egress: the kiosk must not squeeze a guest route below 1.2 m (evacuation and wheelchair width).
    let pinch = null;
    for (let d = 0; d < 8; d++) {
      const gap = m.gaps[d];
      if (!m.gapBits[d] || gap >= 1.2 || gap < 0.05) continue;
      if (!pinch || gap < pinch.gap) pinch = { gap, bits: m.gapBits[d] };
    }
    if (pinch) {
      const names = an.routes.filter((rt) => pinch.bits & (1 << rt.id)).map((rt) => rt.name);
      set('egress', pinch.gap < 0.9 ? 'issue' : 'watch', `It narrows ${names[0] || 'a guest route'}. Keep at least 1.2 m clear for evacuation and wheelchairs.`, `${f1(pinch.gap)} m`);
    } else set('egress', 'ok', 'Leaves guest routes at full width.', '≥ 1.2 m');

    // Installation: what the works will involve.
    const c = [m.power, m.eth].filter(Boolean);
    if (c.length < 2) set('install', 'issue', 'Missing a power or data port, so new cabling or an electrician is needed.');
    else {
      const len = Math.max(...c.map((x) => x.length)), exp = Math.max(...c.map((x) => x.exposed)), crossN = c.reduce((t, x) => t + x.crossings, 0);
      const obs = `${f1(len)} m · ${f1(exp)} m · ${crossN}`;
      if (crossN >= 2 || len > 30) set('install', 'issue', `Major works likely: ${crossN >= 2 ? 'cables would cross walkways' : 'a very long cable run'}. Budget for a new floor box or chasing cables into the floor.`, obs);
      else if (crossN || exp > 3) set('install', 'watch', `Moderate: ${crossN ? 'a walkway crossing needs a cable ramp' : 'the cable on open floor needs a cover strip or trunking'}.`, obs);
      else set('install', 'ok', 'Plug and play: short runs hidden along walls or under furniture.', obs);
    }

    return S.CHECKS.map((ch) => Object.assign({}, ch, out[ch.id]));
  };

  // ------------------------------------------------------------------------------
  // Compact, self-describing JSON for the AI reviewer.
  S.payload = function (state, an, ev, heat) {
    const r1 = (v) => Math.round(v * 10) / 10;
    const pt = (p) => [r1(p.x), r1(p.y)];
    const W = ev.W, tw = S.CRITERIA.reduce((s, c) => s + W[c.id], 0);
    const cab = (c, ports) => (!ports.length ? 'no ports of this type on the plan' : !c ? 'no route possible'
      : { from_port: c.port.label, route_length_m: r1(c.length), exposed_floor_m: r1(c.exposed), guest_walkway_crossings: c.crossings, suggested_cable_length_m: Math.ceil(c.length + 1.5) });
    const nearby = (p) => an.els.map((el) => ({ el, d: G.distToBox(p, G.aabb(el)) }))
      .filter((o) => o.d <= 4 && CAT[o.el.type].name !== 'Rug').sort((a, b) => a.d - b.d).slice(0, 8)
      .map((o) => ({ label: o.el.label, type: CAT[o.el.type].name, distance_m: r1(o.d), direction: S.compassLong(S.bearing(p, o.el)) }));
    const dirDeg = (v) => (Math.atan2(v.y, v.x) * 180) / Math.PI;
    // Grade first, then its bucket, then the exact score.
    const gbs = (score) => { const g = KP.F.grade(score); return { grade: g.letter, bucket: g.range, score }; };

    return {
      coordinate_system: 'Metres. Origin (0,0) is the north-west corner of the lobby; x increases to the east, y increases to the south. North is the y=0 wall.',
      room: { width_m: r1(an.room.w), depth_m: r1(an.room.d), area_m2: Math.round(an.room.w * an.room.d) },
      elements: state.elements.map((el) => {
        const t = CAT[el.type], b = G.aabb(el);
        const o = { label: el.label, type: t.name, center: pt(el), footprint_m: [r1(b.w), r1(b.d)], height_m: r1(el.h ?? t.h) };
        if (KP.blocksSight(el)) o.blocks_line_of_sight = true;
        if (t.walk) o.blocks_walking = true;
        if (t.entry) o.opens_towards = S.compassLong(dirDeg(G.frontDir(el.rot)));
        if (t.counter) o.guest_side_faces = S.compassLong(dirDeg(G.frontDir(el.rot)));
        return o;
      }),
      guest_routes: an.routes.map((r) => ({ name: r.name, traffic_weight: r.w, length_m: r1(r.length), blocked_by_layout: !!r.blocked })),
      criteria_weights_percent: Object.fromEntries(S.CRITERIA.map((c) => [c.id, Math.round((W[c.id] / tw) * 100)])),
      observed_input_definitions: Object.fromEntries(KP.F.VARS.map((v) => [v.name, `${v.unit}. ${v.desc}. How to observe: ${v.how}`])),
      scoring_formulas: {
        note: 'Exactly how the engine computed every score. Factors (0-1) are evaluated in order from the measured inputs; each criterion (0-100) from the factors and inputs; the overall from the criteria and their weighted average. ramp(x,a,b)=0 at a rising to 1 at b; band(x,a,b,c,d)=0 outside a..d and 1 between b and c.',
        factors: Object.fromEntries(KP.F.config.factors.map((f) => [f.name, f.expr])),
        criteria: KP.F.config.criteria,
        overall: KP.F.config.overall,
        grade_buckets: KP.F.buckets().map(([lo, hi], i) => ({ range: `${lo}-${hi}`, grade: KP.F.config.grades[i].letter, label: KP.F.config.grades[i].label })),
      },
      kiosks: ev.kiosks.map((r) => {
        const m = r.m, fm = r.fm;
        return {
          id: r.id, label: r.label, position: pt(r.kiosk), screen_faces: S.compassLong(r.kiosk.facing),
          engine_overall: gbs(r.overall),
          engine_criteria: Object.fromEntries(S.CRITERIA.map((c) => [c.id, gbs(r.scores[c.id])])),
          observed_inputs: Object.fromEntries(KP.F.VARS.map((v) => [v.name, Math.round(r.env[v.name] * 100) / 100])),
          derived_factors: Object.fromEntries(KP.F.config.factors.map((f) => [f.name, Math.round(r.env[f.name] * 1000) / 1000])),
          measurements: {
            main_entrance: m.main ? { label: m.main.label, distance_m: r1(m.mainDist), degrees_off_walking_direction: Math.round(m.mainAngle) } : null,
            entrance_visibility: m.entryVis.map((v) => ({ entrance: v.entry.label, kind: v.entry.kind, visible_fraction_of_viewpoints: r1(v.frac), distance_m: r1(v.dist), blocked_by: v.blockers })),
            lobby_floor_with_view_of_kiosk_pct: Math.round(m.viewFrac * 100),
            lobby_floor_seeing_screen_face_pct: Math.round(fm.screenFrac * 100),
            tall_items_within_1_2m: m.clutter,
            nearest_guest_route: r.nearRoute ? { name: r.nearRoute.name, distance_m: r1(m.routeDist) } : null,
            route_obstructions: r.detours.map((d) => (d.blocked ? { route: d.route.name, blocks_completely: true } : { route: d.route.name, extra_walk_m: r1(d.extra) })),
            nearest_doorway: m.doorWorst ? { label: m.doorWorst.entry.label, distance_m: r1(m.doorWorst.d), recommended_min_m: m.doorWorst.req } : null,
            inside_counter_queue_zone_of: m.inQueue,
            nearest_staff: m.staffNearest ? { label: m.staffNearest.label, distance_m: r1(m.staffDist) } : 'no staff on plan',
            staff_with_line_of_sight_within_12m: m.staffLosCount || 0,
            front_clear_zone_free_pct: Math.round(fm.frontFree * 100),
            queue_zone_free_pct: Math.round(fm.queueFree * 100),
            queue_zone_on_walkway_pct: Math.round(fm.queueOnRoute * 100),
            front_reachable_from_entrance: fm.reach,
            spacing: {
              free_space_behind_m: fm.gapBack, free_space_each_side_m: fm.gapSides,
              nearest_other_kiosk: fm.nearestKiosk ? { label: fm.nearestKiosk.label, centre_distance_m: r1(fm.nearestKiosk.d) } : null,
            },
          },
          guest_and_operations_checks: r.checks.map((c) => ({ check: c.name, matters_to: c.who, status: c.status, observed: c.observed ? `${c.measure}: ${c.observed}` : null, thresholds: c.rule, detail: c.text })),
          nearby_elements: nearby(r.kiosk),
          cabling: { power: cab(m.power, an.powerPorts), ethernet: cab(m.eth, an.ethPorts) },
          best_facing_at_this_spot: { screen_faces: S.compassLong(r.bestFacing.facing), engine_overall: r.bestFacing.overall },
          engine_findings: r.recs.map((x) => `[${x.sev}] ${x.text}`),
        };
      }),
      kiosk_spacing_m: ev.pairs.map((p) => ({ between: [p.a.label, p.b.label], distance_m: r1(p.d) })),
      best_spot_found_by_engine: heat && heat.best ? { position: [r1(heat.best.px), r1(heat.best.py)], screen_faces: S.compassLong(heat.best.facing), engine_overall_estimate: heat.best.score } : null,
    };
  };
})();
