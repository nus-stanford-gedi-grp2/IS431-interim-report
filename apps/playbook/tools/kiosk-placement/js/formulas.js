(function () {
  // Editable scoring formulas.
  //
  // Every score is computed from plain-text expressions in three layers:
  //   1. variables – measurements made by the geometry engine (metres, degrees, 0–1 shares, counts, 0/1 flags)
  //   2. factors   – 0–1 sub-scores, each an expression over variables and earlier factors
  //   3. criteria  – 0–100 scores, each an expression over variables and factors
  // The overall score is another expression (default: weighted average of the criteria, capped
  // if the kiosk can't be reached). Each score then falls into one of five 20-point buckets.
  //
  // Expressions are parsed by a small, safe parser here (no eval): numbers, variable names,
  // + - * / ( ), comparisons < <= > >= == !=, && || !, and the functions listed in FUNCS.
  const F = (KP.F = {});
  const LS_KEY = 'kp.formulas.v3'; // v3: stricter defaults and four grades (older saved formulas are not loaded)

  // ---- variables: observable measurements ----------------------------------------------------
  // Every input is something a person could measure or count in the real lobby: metres, square
  // metres, degrees, counts or yes/no (1/0). Shares, weights and penalties are not inputs; they
  // live in the factor formulas, where they can be seen and edited.
  //   unit – what it's measured in;  desc – what it is;  how – how to observe it on site
  const EYE = 'at eye height (1.5 m); anything 1.4 m or taller blocks the view';
  F.VARS = [
    { g: 'Line of sight', name: 'main_views', unit: 'count', desc: 'Main-entrance arrival viewpoints that can see the kiosk', how: `Each main entrance has 5 viewpoints: 1 m inside the door at its left, centre and right, and 3 m inside at two points. Stand at each ${EYE} and count those from which the kiosk is visible.` },
    { g: 'Line of sight', name: 'main_viewpoints', unit: 'count', desc: 'Main-entrance arrival viewpoints checked', how: 'Count: 5 per main entrance.' },
    { g: 'Line of sight', name: 'lift_views', unit: 'count', desc: 'Lift-landing viewpoints that can see the kiosk', how: `The same 5 viewpoints in front of each lift door; count those that can see the kiosk ${EYE}.` },
    { g: 'Line of sight', name: 'lift_viewpoints', unit: 'count', desc: 'Lift-landing viewpoints checked', how: 'Count: 5 per lift.' },
    { g: 'Line of sight', name: 'side_views', unit: 'count', desc: 'Side-entrance viewpoints that can see the kiosk', how: `The same 5 viewpoints inside each side entrance; count those that can see the kiosk ${EYE}.` },
    { g: 'Line of sight', name: 'side_viewpoints', unit: 'count', desc: 'Side-entrance viewpoints checked', how: 'Count: 5 per side entrance.' },
    { g: 'Line of sight', name: 'lobby_view_area', unit: 'm²', desc: 'Open floor area within 15 m from which the kiosk is visible', how: `Walk a 1 m grid over the open floor; at each point within 15 m of the kiosk, check whether you can see it ${EYE}. Each point that can is 1 m². (The heatmap preview uses a 1.5 m grid.)` },
    { g: 'Line of sight', name: 'lobby_walkable_area', unit: 'm²', desc: 'Total open floor area of the lobby', how: 'Floor area not covered by furniture, counters, pillars or walls: the number of 1 m grid points on open floor.' },
    { g: 'Obviousness', name: 'main_entrances', unit: 'count', desc: 'Main entrances in the lobby', how: 'Count the main guest entrances.' },
    { g: 'Obviousness', name: 'main_distance', unit: 'm', desc: 'Distance from the main entrance to the kiosk', how: 'Tape or laser-measure from 0.8 m inside the nearest main entrance (centre of the doorway) to the centre of the kiosk. 99 if there is no main entrance.' },
    { g: 'Obviousness', name: 'main_angle', unit: '°', desc: 'How far off the walking-in direction the kiosk is', how: 'Stand 0.8 m inside the main entrance facing straight into the lobby. Measure the angle between straight ahead and the line to the kiosk (0° = straight ahead, 90° = directly to one side).' },
    { g: 'Obviousness', name: 'screen_angle_main', unit: '°', desc: 'Angle between the screen and the main entrance', how: 'Measure the angle between the direction the screen faces and the line from the kiosk to the main entrance (0° = screen points straight at the door, 180° = faces away).' },
    { g: 'Obviousness', name: 'screen_angle_lift', unit: '°', desc: 'Angle between the screen and the nearest lift', how: 'The same angle, to whichever lift the screen points most towards. 180 if there are no lifts.' },
    { g: 'Obviousness', name: 'screen_angle_side', unit: '°', desc: 'Angle between the screen and the nearest side entrance', how: 'The same angle, to whichever side entrance the screen points most towards. 180 if there are none.' },
    { g: 'Obviousness', name: 'screen_view_area', unit: 'm²', desc: 'Part of lobby_view_area from which the screen face can be read', how: 'Of the grid points that can see the kiosk, those within 70° either side of the direction the screen faces (1 m² each).' },
    { g: 'Obviousness', name: 'tall_items_nearby', unit: 'count', desc: 'Tall items crowding the kiosk', how: 'Count furniture, plants, pillars, walls and signage 1.2 m or taller standing within 1.2 m of the kiosk.' },
    { g: 'Guest flow', name: 'guest_routes', unit: 'count', desc: 'Main guest walking routes mapped', how: 'Count the routes: main entrance → check-in desk, main entrance → lift, desk → lift, side entrance → desk.' },
    { g: 'Guest flow', name: 'route_distance', unit: 'm', desc: 'Distance from the kiosk to the nearest guest route', how: 'Measure from the kiosk centre to the centre line of the nearest guest walking route (the shortest walking path between the points above). 99 if there are no routes.' },
    { g: 'Guest flow', name: 'extra_walk_to_use', unit: 'm', desc: 'How far out of the guest flow it is: extra walking to use it on the way in', how: 'Walk the shortest path from 0.8 m inside the main entrance to the spot 0.75 m in front of the screen, then on to the nearest lift (or the check-in desk if there are no lifts). Subtract the shortest walk from the entrance straight to the lift. 0 if it is directly on the way; 99 if the front can’t be reached.' },
    { g: 'Guest flow', name: 'routes_passing_3m', unit: 'count', desc: 'Guest routes that pass within 3 m', how: 'Count the guest walking routes (entrance → desk, entrance → lift, desk → lift, side entrance → desk) whose centre line passes within 3 m of the kiosk centre.' },
    { g: 'Guest flow', name: 'extra_walk_entrance_desk', unit: 'm', desc: 'Extra walking the kiosk adds: main entrance → desk', how: 'Measure the shortest walking path from the main entrance to the check-in desk with and without the kiosk (keeping 0.25 m clear of obstacles); the difference in metres. 99 if the kiosk blocks the route. (The heatmap preview estimates 1.8 m for a spot on the route.)' },
    { g: 'Guest flow', name: 'extra_walk_entrance_lift', unit: 'm', desc: 'Extra walking the kiosk adds: main entrance → lift', how: 'As above, for the main entrance → nearest lift route.' },
    { g: 'Guest flow', name: 'extra_walk_desk_lift', unit: 'm', desc: 'Extra walking the kiosk adds: desk → lift', how: 'As above, for the check-in desk → nearest lift route.' },
    { g: 'Guest flow', name: 'extra_walk_side', unit: 'm', desc: 'Extra walking the kiosk adds: side entrance → desk', how: 'As above, for the side entrance → desk route.' },
    { g: 'Guest flow', name: 'side_door_distance', unit: 'm', desc: 'Distance to the nearest side entrance', how: 'Measure from 0.8 m inside the nearest side entrance to the kiosk centre. 99 if there are none.' },
    { g: 'Guest flow', name: 'lift_distance', unit: 'm', desc: 'Distance to the nearest lift door', how: 'Measure from 0.8 m in front of the nearest lift door to the kiosk centre. 99 if there are no lifts.' },
    { g: 'Guest flow', name: 'in_desk_queue', unit: 'yes/no', desc: 'Standing in a counter’s queue area', how: '1 if any part of the kiosk (plus 0.2 m) is inside the rectangle that runs 2.5 m out from a counter’s guest side and is as wide as the counter; otherwise 0.' },
    { g: 'Guest flow', name: 'walkway_area_in_front', unit: 'm²', desc: 'Walkway inside the kiosk’s user + queue strip', how: 'Mark the 3 m deep × 1.2 m wide strip in front of the screen (3.6 m², where the user and the next guest stand) and measure how much of it lies on a guest route (a route is about 0.75 m wide).' },
    { g: 'Staff proximity', name: 'staff_points', unit: 'count', desc: 'Staff positions in the lobby', how: 'Count staffed positions: check-in counter, concierge desk, bell desk and marked staff positions.' },
    { g: 'Staff proximity', name: 'staff_distance', unit: 'm', desc: 'Distance to the nearest staff position', how: 'Measure from the nearest staff position to the kiosk centre. 99 if there are none.' },
    { g: 'Staff proximity', name: 'staff_seeing_15m', unit: 'count', desc: 'Staff positions within 15 m that can see the kiosk', how: `Stand at each staff position within 15 m and check whether you can see the kiosk ${EYE}; count those that can.` },
    { g: 'Staff proximity', name: 'staff_seeing_12m', unit: 'count', desc: 'Staff positions within 12 m that can see the kiosk', how: 'The same count, only for staff positions within 12 m.' },
    { g: 'Power & data', name: 'power_route', unit: 'yes/no', desc: 'A power cable can reach the kiosk', how: '1 if a cable can be run from a power outlet to the kiosk without passing through pillars, walls or planters; otherwise 0.' },
    { g: 'Power & data', name: 'power_length', unit: 'm', desc: 'Length of the power cable route', how: 'Measure the cable route from the nearest practical outlet, running along walls and under furniture where possible.' },
    { g: 'Power & data', name: 'power_exposed', unit: 'm', desc: 'Power cable lying on open floor', how: 'Of that route, the metres not along a wall (within 0.5 m) or hidden under furniture or a rug.' },
    { g: 'Power & data', name: 'power_crossings', unit: 'count', desc: 'Walkways the power cable crosses', how: 'Count the guest walking routes the exposed cable crosses.' },
    { g: 'Power & data', name: 'data_route', unit: 'yes/no', desc: 'An ethernet cable can reach the kiosk', how: '1 if a cable can be run from an ethernet port or floor box to the kiosk; otherwise 0.' },
    { g: 'Power & data', name: 'data_length', unit: 'm', desc: 'Length of the ethernet cable route', how: 'Measure the cable route from the nearest practical data port.' },
    { g: 'Power & data', name: 'data_exposed', unit: 'm', desc: 'Ethernet cable lying on open floor', how: 'Of that route, the metres not along a wall or hidden under furniture or a rug.' },
    { g: 'Power & data', name: 'data_crossings', unit: 'count', desc: 'Walkways the ethernet cable crosses', how: 'Count the guest walking routes the exposed cable crosses.' },
    { g: 'Clearance & access', name: 'front_clear_area', unit: 'm²', desc: 'Free floor in the user zone (max 1.8 m²)', how: 'Mark the 1.5 m deep × 1.2 m wide zone directly in front of the screen and measure the floor area free of furniture, walls and other kiosks.' },
    { g: 'Clearance & access', name: 'queue_clear_area', unit: 'm²', desc: 'Free floor in the queue zone (max 1.8 m²)', how: 'The same for the next 1.5 m × 1.2 m behind it, where a second guest waits.' },
    { g: 'Clearance & access', name: 'front_reachable', unit: 'yes/no', desc: 'Guests can walk to the front of the screen', how: '1 if you can walk from the main entrance to stand 0.75 m in front of the screen; otherwise 0.' },
    { g: 'Spacing', name: 'side_gap_a', unit: 'm', desc: 'Free space on one side', how: 'Measure from the kiosk’s side to the first obstacle, wall or other kiosk (capped at 3 m).' },
    { g: 'Spacing', name: 'side_gap_b', unit: 'm', desc: 'Free space on the other side', how: 'The same on the other side.' },
    { g: 'Spacing', name: 'back_gap', unit: 'm', desc: 'Free space behind the kiosk', how: 'Measure from the back of the kiosk to the first obstacle or wall (0 = flush, capped at 3 m).' },
    { g: 'Spacing', name: 'nearest_kiosk', unit: 'm', desc: 'Distance to the nearest other kiosk', how: 'Measure centre to centre to the nearest other kiosk. 99 if there is only one.' },
  ];
  const VAR_NAMES = new Set(F.VARS.map((v) => v.name));

  F.FUNCS = {
    min: { n: [1, 20], f: Math.min, doc: 'min(a, b, …) smallest value' },
    max: { n: [1, 20], f: Math.max, doc: 'max(a, b, …) largest value' },
    clamp: { n: [3, 3], f: (x, lo, hi) => Math.min(hi, Math.max(lo, x)), doc: 'clamp(x, lo, hi) keep x between lo and hi' },
    ramp: { n: [3, 3], f: (x, a, b) => Math.max(0, Math.min(1, (x - a) / (b - a))), doc: 'ramp(x, a, b) 0 at a, rising evenly to 1 at b' },
    band: { n: [5, 5], f: (x, a, b, c, d) => (x <= a || x >= d ? 0 : x < b ? (x - a) / (b - a) : x <= c ? 1 : (d - x) / (d - c)), doc: 'band(x, a, b, c, d) 0 outside a…d, 1 between b and c' },
    if: { n: [3, 3], f: (c, a, b) => (c ? a : b), doc: 'if(condition, then, else)' },
    abs: { n: [1, 1], f: Math.abs, doc: 'abs(x)' },
    round: { n: [1, 1], f: Math.round, doc: 'round(x)' },
    sqrt: { n: [1, 1], f: Math.sqrt, doc: 'sqrt(x)' },
    pow: { n: [2, 2], f: Math.pow, doc: 'pow(x, y)' },
  };

  // ---- defaults ----------------------------------------------------------------------------------
  F.CRITERIA_IDS = ['visibility', 'obviousness', 'flow', 'staff', 'infra', 'access', 'spacing'];
  // Extra names the overall formula can use (besides the criterion scores, factors and measurements).
  F.OVERALL_VARS = [
    { name: 'weighted_average', desc: 'Σ(weight × criterion) / Σ(weight)' },
    { name: 'weighted_geomean', desc: 'Weighted geometric mean of the criteria: 100 × Π(criterion/100)^(weight share). A weak criterion drags it down hard' },
    { name: 'lowest_criterion', desc: 'The lowest of the seven criterion scores' },
    { name: 'grade_a_min', desc: 'Lowest score that earns an A' },
    { name: 'grade_b_min', desc: 'Lowest score that earns a B' },
    { name: 'grade_c_min', desc: 'Lowest score that earns a C (anything below is a D)' },
  ];
  F.DEFAULTS = {
    // Strict defaults: full marks only for clearly good placements, little credit for "near enough".
    factors: [
      { name: 'arrival_view', expr: 'if(main_viewpoints + lift_viewpoints + side_viewpoints > 0, (1 * main_views + 0.7 * lift_views + 0.5 * side_views) / (1 * main_viewpoints + 0.7 * lift_viewpoints + 0.5 * side_viewpoints), 0)', note: 'Share of all arrival viewpoints that see it; main entrance counts 1, lifts 0.7, side doors 0.5' },
      { name: 'main_view_share', expr: 'if(main_viewpoints > 0, main_views / main_viewpoints, 0)', note: 'Share of main-entrance viewpoints that see it' },
      { name: 'lobby_view_share', expr: 'if(lobby_walkable_area > 0, lobby_view_area / lobby_walkable_area, 0)', note: 'Share of the open floor that sees it' },
      { name: 'lobby_view_score', expr: 'min(1, lobby_view_share / 0.75)', note: 'Full marks only once 75% of the open floor can see it' },
      { name: 'in_view_on_arrival', expr: 'if(main_entrances > 0, 1 - ramp(main_angle, 30, 90), 0)', note: 'Full marks within 30° of straight ahead, none at 90° (beside or behind)' },
      { name: 'entrance_distance', expr: 'if(main_entrances > 0, band(main_distance, 2, 4, 8, 16), 0)', note: 'Full marks 4–8 m from the main entrance; none under 2 m or over 16 m' },
      { name: 'faces_arrivals', expr: 'max(1 - ramp(screen_angle_main, 25, 90), 0.75 * (1 - ramp(screen_angle_lift, 25, 90)), 0.6 * (1 - ramp(screen_angle_side, 25, 90)))', note: 'Screen within 25° of an entrance (main 1, lift 0.75, side 0.6); none at 90° or more' },
      { name: 'screen_seen', expr: 'if(lobby_walkable_area > 0, min(1, screen_view_area / lobby_walkable_area / 0.5), 0)', note: 'Full marks once 50% of the open floor can read the screen' },
      { name: 'uncluttered', expr: '1 - min(1, 0.4 * tall_items_nearby)', note: '−0.4 for each tall item within 1.2 m' },
      { name: 'near_route', expr: 'if(guest_routes > 0, if(route_distance < 0.75, 0, band(route_distance, 0.75, 1.2, 3, 7)), 0)', note: 'Full marks 1.2–3 m from a guest route; none if standing in it (< 0.75 m) or over 7 m away' },
      { name: 'on_the_way', expr: '1 - ramp(extra_walk_to_use, 2, 12)', note: 'How far out of the guest flow: full marks if using it adds ≤ 2 m to the walk from the entrance to the lifts, none at 12 m' },
      { name: 'footfall', expr: 'min(1, 0.7 * routes_passing_3m)', note: 'Guest routes passing within 3 m: none 0, one 0.7, two or more 1' },
      { name: 'detour_entrance_desk', expr: 'if(extra_walk_entrance_desk > 0.2, min(1, extra_walk_entrance_desk / 2), 0)', note: 'Ignored under 0.2 m; full penalty at 2 m' },
      { name: 'detour_entrance_lift', expr: 'if(extra_walk_entrance_lift > 0.2, min(1, extra_walk_entrance_lift / 2), 0)', note: 'Ignored under 0.2 m; full penalty at 2 m' },
      { name: 'detour_desk_lift', expr: 'if(extra_walk_desk_lift > 0.2, min(1, extra_walk_desk_lift / 2), 0)', note: 'Ignored under 0.2 m; full penalty at 2 m' },
      { name: 'detour_side', expr: 'if(extra_walk_side > 0.2, min(1, extra_walk_side / 2), 0)', note: 'Ignored under 0.2 m; full penalty at 2 m' },
      { name: 'not_obstructing', expr: '1 - min(1, 1 * detour_entrance_desk + 0.7 * detour_entrance_lift + 0.8 * detour_desk_lift + 0.5 * detour_side)', note: 'Detours weighted by route traffic: entrance→desk 1, desk→lift 0.8, entrance→lift 0.7, side 0.5' },
      { name: 'door_shortfall', expr: 'max(4 - main_distance, 3 - side_door_distance, 3 - lift_distance, 0)', note: 'Metres inside the required clearance: main door 4 m, side door 3 m, lift 3 m' },
      { name: 'door_clearance', expr: '(1 - clamp(door_shortfall / 1.5, 0, 1)) * if(in_desk_queue, 0, 1)', note: 'None left once 1.5 m inside a clearance; zero if in the desk queue' },
      { name: 'queue_off_walkway', expr: '1 - 0.8 * walkway_area_in_front / 3.6', note: 'Up to −80% if the whole 3.6 m² user/queue strip is walkway' },
      { name: 'staff_near', expr: 'if(staff_distance < 1.5, 0.3, band(staff_distance, 1.5, 2.5, 6, 14))', note: 'Full marks 2.5–6 m from staff; none beyond 14 m; 0.3 if crowding them (< 1.5 m)' },
      { name: 'staff_sees', expr: 'if(staff_seeing_15m > 0, 1, 0)', note: 'At least one staff position within 15 m can see it, otherwise nothing' },
      { name: 'staff_cover', expr: 'min(1, staff_seeing_12m / 2)', note: 'Full marks with 2+ staff positions within 12 m watching' },
      { name: 'power_cable', expr: 'power_route * (0.5 * (1 - ramp(power_length, 6, 30)) + 0.35 * (1 - ramp(power_exposed, 1, 10)) + 0.15 * max(0, 1 - 0.25 * power_crossings))', note: 'Lenient: full marks for runs up to 6 m (none at 30 m), up to 1 m on open floor (none at 10 m), −0.25 per walkway crossing' },
      { name: 'data_cable', expr: 'data_route * (0.5 * (1 - ramp(data_length, 6, 30)) + 0.35 * (1 - ramp(data_exposed, 1, 10)) + 0.15 * max(0, 1 - 0.25 * data_crossings))', note: 'Same lenient rules for the ethernet cable' },
      { name: 'front_clear_share', expr: 'front_clear_area / 1.8', note: 'Share of the 1.8 m² user zone that is free' },
      { name: 'queue_clear_share', expr: 'queue_clear_area / 1.8', note: 'Share of the 1.8 m² queue zone that is free' },
      { name: 'side_a', expr: 'if(side_gap_a <= 0.1, 0.5, if(side_gap_a < 0.75, 0.2 + 0.8 * ramp(side_gap_a, 0.1, 0.75), 1))', note: 'Flush is OK (0.5), a thin sliver is worst (0.2), 0.75 m+ is best' },
      { name: 'side_b', expr: 'if(side_gap_b <= 0.1, 0.5, if(side_gap_b < 0.75, 0.2 + 0.8 * ramp(side_gap_b, 0.1, 0.75), 1))', note: 'Same for the other side' },
      { name: 'luggage_space', expr: 'ramp(max(side_gap_a, side_gap_b), 0.5, 1)', note: 'Full marks with 1 m free on one side for a suitcase; none under 0.5 m' },
      { name: 'back_space', expr: 'if(back_gap <= 0.15, 1, if(back_gap >= 1, 0.8, 0.2))', note: 'Flush to a wall (1), or 1 m+ open for servicing (0.8); a gap in between collects litter (0.2)' },
      { name: 'kiosk_spacing', expr: 'if(nearest_kiosk >= 1.2, 1, if(nearest_kiosk < 1, 0, ramp(nearest_kiosk, 1, 1.2)))', note: 'At least 1.2 m between kiosk centres; none under 1 m' },
    ],
    criteria: {
      visibility: '100 * (0.4 * pow(main_view_share, 2) + 0.3 * pow(arrival_view, 2) + 0.3 * lobby_view_score)',
      obviousness: '100 * (0.3 * in_view_on_arrival + 0.2 * entrance_distance + 0.3 * faces_arrivals + 0.1 * screen_seen + 0.1 * uncluttered)',
      flow: '100 * (0.3 * near_route + 0.3 * on_the_way + 0.2 * door_clearance + 0.2 * footfall) * not_obstructing * queue_off_walkway',
      staff: 'if(staff_points > 0, 100 * (0.45 * staff_near + 0.35 * staff_sees + 0.2 * staff_cover), 0)',
      infra: '100 * (power_cable + data_cable) / 2',
      access: '100 * front_reachable * (0.75 * pow(front_clear_share, 2) + 0.25 * queue_clear_share) * if(front_clear_share < 0.8, 0.5, 1)',
      spacing: '100 * (0.3 * (side_a + side_b) / 2 + 0.3 * luggage_space + 0.2 * back_space + 0.2 * kiosk_spacing)',
    },
    // Weighted geometric mean, made stricter with a power of 1.5. Any D criterion scales the result
    // into the D range (keeping weak and very weak apart); an unreachable kiosk can't score above D.
    overall: 'min(if(lowest_criterion < grade_c_min, (grade_c_min - 1) / 100, 1) * 100 * pow(weighted_geomean / 100, 1.5), if(front_reachable, 100, grade_c_min - 1))',
    // Four grade buckets, best first. min = lowest score that earns the grade (D starts at 0).
    grades: [
      { letter: 'A', label: 'Excellent', min: 80 },
      { letter: 'B', label: 'Good', min: 60 },
      { letter: 'C', label: 'Marginal', min: 40 },
      { letter: 'D', label: 'Poor', min: 0 },
    ],
  };
  F.BUCKET_COLORS = ['#15803d', '#65a30d', '#d97706', '#dc2626'];
  // [low, high] score range of each bucket, from the current grade thresholds.
  F.buckets = () => { const m = F.config.grades.map((g) => g.min); return [[m[0], 100], [m[1], m[0]], [m[2], m[1]], [0, m[2]]]; };

  // ---- parser -------------------------------------------------------------------------------------
  function tokenize(src) {
    const out = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { i++; continue; }
      const rest = src.slice(i);
      let m;
      if ((m = /^(\d+\.?\d*|\.\d+)/.exec(rest))) { out.push({ t: 'num', v: parseFloat(m[0]), pos: i }); i += m[0].length; continue; }
      if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest))) { out.push({ t: 'id', v: m[0], pos: i }); i += m[0].length; continue; }
      const two = src.substr(i, 2);
      if (['<=', '>=', '==', '!=', '&&', '||'].includes(two)) { out.push({ t: 'op', v: two, pos: i }); i += 2; continue; }
      if ('+-*/(),<>!×÷−'.includes(c)) { out.push({ t: 'op', v: c === '×' ? '*' : c === '÷' ? '/' : c === '−' ? '-' : c, pos: i }); i++; continue; }
      throw new Error(`Unexpected "${c}" at character ${i + 1}`);
    }
    return out;
  }

  F.parse = function (src) {
    const toks = tokenize(String(src || ''));
    if (!toks.length) throw new Error('Empty formula');
    let p = 0;
    const peek = () => toks[p], next = () => toks[p++];
    const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;
    const expect = (v) => { if (!isOp(v)) throw new Error(`Expected "${v}"${peek() ? ` at character ${peek().pos + 1}` : ' at the end'}`); p++; };
    const bin = (sub, ops) => () => {
      let a = sub();
      while (peek() && peek().t === 'op' && ops.includes(peek().v)) { const op = next().v; a = { k: 'bin', op, a, b: sub() }; }
      return a;
    };
    const primary = () => {
      const t = next();
      if (!t) throw new Error('Formula ends too early');
      if (t.t === 'num') return { k: 'num', v: t.v };
      if (t.t === 'id') {
        if (isOp('(')) {
          p++;
          const args = [];
          if (!isOp(')')) { args.push(or()); while (isOp(',')) { p++; args.push(or()); } }
          expect(')');
          return { k: 'call', fn: t.v, args, pos: t.pos };
        }
        return { k: 'var', name: t.v, pos: t.pos };
      }
      if (t.v === '(') { const e = or(); expect(')'); return { k: 'paren', e }; }
      if (t.v === '-' || t.v === '!') return { k: 'un', op: t.v, a: primary() };
      throw new Error(`Unexpected "${t.v}" at character ${t.pos + 1}`);
    };
    const mul = bin(primary, ['*', '/']);
    const add = bin(mul, ['+', '-']);
    const cmp = bin(add, ['<', '<=', '>', '>=', '==', '!=']);
    const and = bin(cmp, ['&&']);
    const or = bin(and, ['||']);
    const ast = or();
    if (p < toks.length) throw new Error(`Unexpected "${toks[p].v}" at character ${toks[p].pos + 1}`);
    return ast;
  };

  // Compile an AST to a closure, checking every name and function call.
  function compileAst(ast, known) {
    const ops = {
      '+': (a, b) => a + b, '-': (a, b) => a - b, '*': (a, b) => a * b, '/': (a, b) => a / b,
      '<': (a, b) => +(a < b), '<=': (a, b) => +(a <= b), '>': (a, b) => +(a > b), '>=': (a, b) => +(a >= b),
      '==': (a, b) => +(a === b), '!=': (a, b) => +(a !== b), '&&': (a, b) => +(!!a && !!b), '||': (a, b) => +(!!a || !!b),
    };
    const c = (n) => {
      switch (n.k) {
        case 'num': { const v = n.v; return () => v; }
        case 'paren': return c(n.e);
        case 'var': {
          if (!known.has(n.name)) throw new Error(`Unknown name "${n.name}"${F.FUNCS[n.name] ? ' (it’s a function: add brackets)' : ''}`);
          const name = n.name;
          return (env) => env[name];
        }
        case 'un': { const a = c(n.a); return n.op === '-' ? (env) => -a(env) : (env) => +!a(env); }
        case 'bin': { const a = c(n.a), b = c(n.b), f = ops[n.op]; return (env) => f(a(env), b(env)); }
        case 'call': {
          const fn = F.FUNCS[n.fn];
          if (!fn) throw new Error(`Unknown function "${n.fn}"`);
          if (n.args.length < fn.n[0] || n.args.length > fn.n[1]) throw new Error(`${n.fn}() takes ${fn.n[0] === fn.n[1] ? fn.n[0] : `${fn.n[0]}+`} value${fn.n[1] > 1 ? 's' : ''}`);
          const args = n.args.map(c), f = fn.f;
          if (args.length === 3 && n.fn === 'if') return (env) => (args[0](env) ? args[1](env) : args[2](env));
          return (env) => f(...args.map((a) => a(env)));
        }
      }
      throw new Error('Bad formula');
    };
    return c(ast);
  }

  // Names an expression reads, for listing which factors/variables feed a score.
  F.names = function (ast, out = new Set()) {
    if (!ast) return out;
    if (ast.k === 'var') out.add(ast.name);
    if (ast.k === 'paren') F.names(ast.e, out);
    if (ast.k === 'un') F.names(ast.a, out);
    if (ast.k === 'bin') { F.names(ast.a, out); F.names(ast.b, out); }
    if (ast.k === 'call') ast.args.forEach((a) => F.names(a, out));
    return out;
  };

  // Print an expression with every name replaced by its value, e.g. "100 * (0.6 * 1 + 0.4 * 0.88)".
  const fmt = (v) => (v == null || !isFinite(v) ? String(v) : Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : String(Math.round(v * 100) / 100));
  F.fmt = fmt;
  F.substitute = function (ast, env) {
    const pr = (n) => {
      switch (n.k) {
        case 'num': return fmt(n.v);
        case 'var': return fmt(env[n.name]);
        case 'paren': return `(${pr(n.e)})`;
        case 'un': return `${n.op}${pr(n.a)}`;
        case 'bin': return `${pr(n.a)} ${n.op} ${pr(n.b)}`;
        case 'call': return `${n.fn}(${n.args.map(pr).join(', ')})`;
      }
      return '';
    };
    return pr(ast);
  };

  // ---- config: validate + compile ---------------------------------------------------------------
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const NAME_RE = /^[a-z_][a-z0-9_]*$/;

  F.compile = function (cfg) {
    const errors = {}, factors = [], criteria = {}, asts = {};
    const known = new Set(VAR_NAMES);
    const reserved = new Set([...VAR_NAMES, ...F.CRITERIA_IDS, ...F.OVERALL_VARS.map((v) => v.name), ...Object.keys(F.FUNCS)]);
    cfg.factors.forEach((fa, i) => {
      const key = `factor:${i}`;
      if (!NAME_RE.test(fa.name || '')) { errors[key] = 'Name must be lower-case letters, digits and _ (starting with a letter)'; return; }
      if (reserved.has(fa.name)) { errors[key] = `"${fa.name}" is already used by a measurement, criterion or function`; return; }
      if (factors.some((x) => x.name === fa.name)) { errors[key] = `Duplicate name "${fa.name}"`; return; }
      try {
        const ast = F.parse(fa.expr);
        factors.push({ name: fa.name, run: compileAst(ast, known), ast });
        asts[fa.name] = ast;
        known.add(fa.name);
      } catch (e) { errors[key] = e.message; }
    });
    for (const id of F.CRITERIA_IDS) {
      try {
        const ast = F.parse(cfg.criteria[id]);
        criteria[id] = { run: compileAst(ast, known), ast };
      } catch (e) { errors[`criterion:${id}`] = e.message; }
    }
    let overall = null;
    try {
      const ast = F.parse(cfg.overall);
      overall = { run: compileAst(ast, new Set([...known, ...F.CRITERIA_IDS, ...F.OVERALL_VARS.map((v) => v.name)])), ast };
    } catch (e) { errors.overall = e.message; }
    const gs = cfg.grades || [];
    gs.forEach((g, i) => { if (!String(g.letter || '').trim()) errors[`grade:${i}`] = 'Give the grade a letter'; });
    const mins = gs.slice(0, 3).map((g) => +g.min);
    if (mins.some((v) => !Number.isFinite(v) || v <= 0 || v >= 100) || !(mins[0] > mins[1] && mins[1] > mins[2])) errors['grade:min'] = 'Thresholds must fall between 1 and 99, with A > B > C';
    return { ok: !Object.keys(errors).length, errors, factors, criteria, overall, asts, cfg };
  };

  const num = (v) => (Number.isFinite(v) ? v : 0);
  const clamp100 = (v) => Math.round(Math.max(0, Math.min(100, num(v))));

  // Run a compiled config against one set of measured variables. W = criterion weights.
  F.runWith = function (cp, vars, W) {
    const env = Object.assign({}, vars);
    for (const fa of cp.factors) env[fa.name] = num(fa.run(env));
    const scores = {};
    let tw = 0, tot = 0;
    for (const id of F.CRITERIA_IDS) {
      scores[id] = cp.criteria[id] ? clamp100(cp.criteria[id].run(env)) : 0;
      env[id] = scores[id];
      tw += W[id] || 0; tot += (W[id] || 0) * scores[id];
    }
    env.weighted_average = tw ? tot / tw : 0;
    // Weighted geometric mean: one weak criterion pulls it down much more than an average would.
    let lg = 0;
    for (const id of F.CRITERIA_IDS) lg += ((W[id] || 0) / (tw || 1)) * Math.log(Math.max(1, scores[id]) / 100);
    env.weighted_geomean = 100 * Math.exp(lg);
    env.lowest_criterion = Math.min(...F.CRITERIA_IDS.map((id) => scores[id]));
    const g = (cp.cfg || F.config).grades; // the config being run (may be an unsaved draft)
    env.grade_a_min = +g[0].min; env.grade_b_min = +g[1].min; env.grade_c_min = +g[2].min;
    const overall = cp.overall ? clamp100(cp.overall.run(env)) : clamp100(env.weighted_average);
    return { scores, overall, env };
  };
  F.run = (vars, W) => F.runWith(F.compiled, vars, W);

  // ---- grade buckets ------------------------------------------------------------------------------
  F.bucketIndexFor = (grades, s) => (s >= grades[0].min ? 0 : s >= grades[1].min ? 1 : s >= grades[2].min ? 2 : 3);
  F.bucketIndex = (s) => F.bucketIndexFor(F.config.grades, s);
  F.grade = function (s) {
    if (s == null || !Number.isFinite(+s)) return { letter: '–', label: '', index: -1, range: '', color: '#a8a29e' };
    const i = F.bucketIndex(s), g = F.config.grades[i], b = F.buckets()[i];
    return { letter: g.letter, label: g.label, index: i, range: `${b[0]}–${b[1]}`, color: F.BUCKET_COLORS[i] };
  };

  // Plain-text "grade · bucket · score", the order used everywhere a result is shown.
  F.gbsText = (s) => { const g = F.grade(s); return `${g.letter} · ${g.range} · ${s}`; };

  // ---- load / save -----------------------------------------------------------------------------------
  const listeners = [];
  F.onChange = (fn) => listeners.push(fn);

  // Accepts a full or partial config; anything missing falls back to the defaults.
  function normalise(o) {
    const d = clone(F.DEFAULTS);
    if (!o || typeof o !== 'object') return d;
    return {
      factors: Array.isArray(o.factors) ? o.factors.map((f) => ({ name: String(f.name || ''), expr: String(f.expr || ''), note: String(f.note || '') })) : d.factors,
      criteria: Object.assign(d.criteria, o.criteria || {}),
      overall: typeof o.overall === 'string' ? o.overall : d.overall,
      grades: d.grades.map((g, i) => {
        const src = (o.grades || [])[i] || {}, out = Object.assign(g, src);
        out.min = i === 3 ? 0 : Number.isFinite(+src.min) ? +src.min : d.grades[i].min;
        return out;
      }),
    };
  }

  F.set = function (cfg, { save = true } = {}) {
    const next = normalise(cfg), cp = F.compile(next);
    if (!cp.ok) return cp;
    F.config = next; F.compiled = cp;
    if (save) { try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch (e) { /* storage unavailable */ } }
    listeners.forEach((fn) => fn());
    return cp;
  };
  F.reset = () => F.set(clone(F.DEFAULTS));
  F.isDefault = () => JSON.stringify(F.config) === JSON.stringify(normalise(F.DEFAULTS));
  F.defaultFactor = (name) => F.DEFAULTS.factors.find((f) => f.name === name);
  F.clone = () => clone(F.config);

  // The previous release's defaults, so an untouched saved copy can be upgraded automatically.
  function previousDefaults() {
    const d = clone(F.DEFAULTS);
    d.factors = d.factors.filter((f) => f.name !== 'on_the_way' && f.name !== 'footfall').map((f) =>
      f.name === 'power_cable' ? Object.assign(f, { expr: 'power_route * (0.4 * (1 - ramp(power_length, 3, 20)) + 0.4 * (1 - min(1, power_exposed / 5)) + 0.2 * max(0, 1 - 0.5 * power_crossings))', note: 'Length (full ≤ 3 m, none at 20 m), exposed metres (none at 5 m), walkway crossings (−0.5 each)' })
        : f.name === 'data_cable' ? Object.assign(f, { expr: 'data_route * (0.4 * (1 - ramp(data_length, 3, 20)) + 0.4 * (1 - min(1, data_exposed / 5)) + 0.2 * max(0, 1 - 0.5 * data_crossings))', note: 'Same rules for the ethernet cable' }) : f);
    d.criteria.flow = '100 * (0.5 * near_route + 0.5 * door_clearance) * not_obstructing * queue_off_walkway';
    return d;
  }
  const sameFormulas = (a, b) => JSON.stringify({ f: a.factors.map((x) => [x.name, x.expr]), c: a.criteria, o: a.overall }) === JSON.stringify({ f: b.factors.map((x) => [x.name, x.expr]), c: b.criteria, o: b.overall });

  // Start from saved formulas if they still compile, otherwise defaults. A saved copy of the previous
  // defaults is upgraded; customised formulas are kept and flagged (F.customOutdated) so the app can say so.
  F.config = clone(F.DEFAULTS);
  F.compiled = F.compile(F.config);
  try {
    const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
    if (saved) {
      const cfg = normalise(saved), cp = F.compile(cfg);
      if (sameFormulas(cfg, previousDefaults())) {
        const up = normalise(Object.assign(clone(F.DEFAULTS), { grades: cfg.grades }));
        F.config = up; F.compiled = F.compile(up);
        localStorage.setItem(LS_KEY, JSON.stringify(up));
      } else if (cp.ok) {
        F.config = cfg; F.compiled = cp;
        F.customOutdated = !sameFormulas(cfg, F.DEFAULTS) && !cfg.factors.some((f) => f.name === 'on_the_way');
      }
    }
  } catch (e) { /* ignore corrupt storage */ }
})();
