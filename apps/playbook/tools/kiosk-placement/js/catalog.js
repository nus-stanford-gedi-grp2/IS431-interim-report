window.KP = window.KP || {};

(function () {
  // All sizes are in metres. w = width along the element's local x axis, d = depth along local y.
  // Local +y is the element's "front": the inward side of a door/lift, the guest side of a counter,
  // the seat side of a sofa. Rotation turns that front to face another direction.
  //
  //   walk   – blocks people walking through it
  //   noSight – never blocks line of sight, whatever its height (doors, people, ports, rugs)
  //             (everything else blocks sight when it is >= KP.SIGHT_BLOCK_H tall)
  //   cable  – 'open' cable would lie exposed on the floor, 'hidden' cable can run under/inside it,
  //            'block' cable must route around it
  //   entry  – guests arrive here (weight = how much traffic it brings)
  //   staff  – a place staff work from; counter – has a guest-facing queue side
  //   power / ethernet – a port the kiosk can be cabled to
  //   wallMount – snaps flush to the nearest wall when dropped close to one
  //   flat   – drawn on the floor in 3D, no height
  //   glazing – a window; used to check screen glare
  KP.CATALOG = {
    main_entrance: { name: 'Main entrance', cat: 'Entrances & lifts', w: 3, d: 0.4, h: 0, color: '#16a34a', noSight: true, cable: 'open', wallMount: true, flat: true, entry: { kind: 'main', weight: 1 } },
    side_entrance: { name: 'Side entrance', cat: 'Entrances & lifts', w: 1.6, d: 0.4, h: 0, color: '#4ade80', noSight: true, cable: 'open', wallMount: true, flat: true, entry: { kind: 'side', weight: 0.5 } },
    lift:          { name: 'Lift', cat: 'Entrances & lifts', w: 1.6, d: 0.4, h: 2.4, color: '#94a3b8', noSight: true, cable: 'block', wallMount: true, entry: { kind: 'lift', weight: 0.7 } },

    checkin:   { name: 'Check-in counter', cat: 'Service & staff', w: 4, d: 0.9, h: 1.1, color: '#b7834f', walk: true, cable: 'hidden', staff: true, counter: true },
    concierge: { name: 'Concierge desk', cat: 'Service & staff', w: 1.8, d: 0.8, h: 1.1, color: '#9a6b3f', walk: true, cable: 'hidden', staff: true, counter: true },
    bellhop:   { name: 'Bellhop stand', cat: 'Service & staff', w: 0.8, d: 0.6, h: 1.2, color: '#c2410c', walk: true, cable: 'open', staff: true },
    staff:     { name: 'Staff position', cat: 'Service & staff', w: 0.6, d: 0.6, h: 1.7, color: '#7c3aed', noSight: true, cable: 'open', staff: true, marker: true },

    sofa:         { name: 'Sofa', cat: 'Furniture', w: 2.2, d: 0.9, h: 0.8, color: '#5b6b8c', walk: true, cable: 'hidden' },
    armchair:     { name: 'Armchair', cat: 'Furniture', w: 0.9, d: 0.9, h: 0.8, color: '#7488b4', walk: true, cable: 'hidden' },
    coffee_table: { name: 'Coffee table', cat: 'Furniture', w: 1.2, d: 0.6, h: 0.45, color: '#a47148', walk: true, cable: 'open' },
    round_table:  { name: 'Round table', cat: 'Furniture', w: 0.9, d: 0.9, h: 0.75, color: '#a47148', walk: true, cable: 'open', round: true },
    plant:        { name: 'Plant', cat: 'Furniture', w: 0.7, d: 0.7, h: 1.8, color: '#15803d', walk: true, cable: 'block', round: true },
    rug:          { name: 'Rug', cat: 'Furniture', w: 3, d: 2, h: 0.01, color: '#d9c7a3', noSight: true, cable: 'hidden', flat: true },

    pillar: { name: 'Pillar', cat: 'Structure', w: 0.6, d: 0.6, h: 3.2, color: '#a8a29e', walk: true, cable: 'block' },
    wall:   { name: 'Wall / partition', cat: 'Structure', w: 3, d: 0.2, h: 2.6, color: '#57534e', walk: true, cable: 'block' },
    window: { name: 'Window / glazing', cat: 'Structure', w: 3, d: 0.2, h: 0, color: '#7dd3fc', noSight: true, cable: 'open', wallMount: true, flat: true, glazing: true },
    signage: { name: 'Digital signage', cat: 'Structure', w: 1.2, d: 0.4, h: 2.1, color: '#334155', walk: true, cable: 'block' },

    power:    { name: 'Power outlet', cat: 'Power & data', w: 0.3, d: 0.3, h: 0.35, color: '#f59e0b', noSight: true, cable: 'open', wallMount: true, power: true, port: true },
    ethernet: { name: 'Ethernet port', cat: 'Power & data', w: 0.3, d: 0.3, h: 0.35, color: '#2563eb', noSight: true, cable: 'open', wallMount: true, ethernet: true, port: true },
    floorbox: { name: 'Floor box (power + data)', cat: 'Power & data', w: 0.4, d: 0.4, h: 0.02, color: '#0891b2', noSight: true, cable: 'open', flat: true, power: true, ethernet: true, port: true },
  };

  KP.CATEGORIES = ['Entrances & lifts', 'Service & staff', 'Furniture', 'Structure', 'Power & data'];

  // Kiosk footprint (square, metres) and height to the top of the screen.
  KP.KIOSK = { size: 0.6, h: 1.7 };

  // Anything at least this tall (and not marked noSight) blocks a standing guest's view of the kiosk.
  KP.SIGHT_BLOCK_H = 1.4;

  KP.blocksSight = function (el) {
    const t = KP.CATALOG[el.type];
    return !!t && !t.noSight && (el.h ?? t.h) >= KP.SIGHT_BLOCK_H;
  };
})();
