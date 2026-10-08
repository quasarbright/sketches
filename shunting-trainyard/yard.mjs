// Shunting trainyard: track geometry, the rules of moving cars, and a solver.
//
// Units are car lengths. A track is a polyline between two nodes, cut into
// car-length slots. A node is a buffer stop (one track), a plain join (two),
// or a switch (three: a trunk and two legs, one leg selected at a time).
// Every car sits in exactly one slot.

const PAD = { buffer: 0.05, join: 0, switch: 0.4 };

// def = {
//   nodes: { id: [x, y] },
//   tracks: [{ id, from, to, via?: [[x, y], ...] }],
//   switches: { nodeId: { trunk: trackId, legs: [trackId, trackId] } },
// }
export function buildYard(def) {
  const nodes = {};
  for (const [id, [x, y]] of Object.entries(def.nodes)) nodes[id] = { id, x, y, tracks: [] };
  const tracks = {}, slots = [];
  for (const t of def.tracks) {
    nodes[t.from].tracks.push(t.id);
    nodes[t.to].tracks.push(t.id);
  }
  const kind = (n) => nodes[n].tracks.length === 1 ? "buffer" : nodes[n].tracks.length === 2 ? "join" : "switch";
  for (const t of def.tracks) {
    const pts = [[nodes[t.from].x, nodes[t.from].y], ...(t.via || []), [nodes[t.to].x, nodes[t.to].y]];
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const len = cum[cum.length - 1];
    const a = PAD[kind(t.from)], b = PAD[kind(t.to)];
    const n = Math.max(1, Math.floor(len - a - b + 1e-6));
    const spacing = (len - a - b) / n;
    const track = { id: t.id, from: t.from, to: t.to, pts, cum, len, slots: [] };
    for (let i = 0; i < n; i++) {
      const s = a + spacing * (i + 0.5);
      const p = pointOnTrack(track, s);
      track.slots.push(slots.length);
      slots.push({ id: slots.length, track: t.id, i, s, x: p.x, y: p.y, ang: p.ang });
    }
    tracks[t.id] = track;
  }
  const switchIds = Object.keys(def.switches || {});
  const switches = switchIds.map((id) => ({ id, ...def.switches[id] }));
  for (const id of Object.keys(nodes)) {
    nodes[id].kind = kind(id);
    if (nodes[id].kind === "switch" && !def.switches[id]) throw new Error(`node ${id} has 3 tracks but no switch`);
  }
  // bounds, for fitting to the screen
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const t of Object.values(tracks)) for (const [x, y] of t.pts) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  return { nodes, tracks, slots, switches, switchIndex: Object.fromEntries(switchIds.map((id, i) => [id, i])), bounds: { minX, minY, maxX, maxY } };
}

export function pointOnTrack(track, s) {
  const { pts, cum } = track;
  s = Math.max(0, Math.min(track.len, s));
  let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const f = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1);
  const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
  return { x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f, ang: Math.atan2(y1 - y0, x1 - x0) };
}

// The slot you reach by leaving `slot` in direction dir (+1 toward the track's
// `to` node, -1 toward `from`), with switches set as `sw`. Returns {slot, dir}
// (dir is the direction of travel in the new slot's track) or null.
export function step(yard, slot, dir, sw) {
  const sl = yard.slots[slot], t = yard.tracks[sl.track];
  const j = sl.i + dir;
  if (j >= 0 && j < t.slots.length) return { slot: t.slots[j], dir };
  const node = yard.nodes[dir > 0 ? t.to : t.from];
  let next;
  if (node.kind === "buffer") return null;
  if (node.kind === "join") next = node.tracks[0] === t.id ? node.tracks[1] : node.tracks[0];
  else {
    const S = yard.switches[yard.switchIndex[node.id]], leg = S.legs[sw[yard.switchIndex[node.id]]];
    if (t.id === S.trunk) next = leg;
    else if (t.id === leg) next = S.trunk;
    else return null; // trailing into a switch set against you
  }
  return enterTrack(yard, next, node.id);
}

function enterTrack(yard, trackId, nodeId) {
  const t = yard.tracks[trackId];
  return t.from === nodeId ? { slot: t.slots[0], dir: 1 } : { slot: t.slots[t.slots.length - 1], dir: -1 };
}

// slot at a track's end next to a node
export function endSlot(yard, trackId, nodeId) { return enterTrack(yard, trackId, nodeId).slot; }

// Point along the path from slot a to its neighbor b (reached via step), at fraction f.
export function travel(yard, a, b, f) {
  const A = yard.slots[a], B = yard.slots[b];
  const segs = [];
  if (A.track === B.track) segs.push([A.track, A.s, B.s]);
  else {
    const ta = yard.tracks[A.track], tb = yard.tracks[B.track];
    const node = [ta.from, ta.to].find((n) => n === tb.from || n === tb.to);
    segs.push([A.track, A.s, node === ta.to ? ta.len : 0]);
    segs.push([B.track, node === tb.from ? 0 : tb.len, B.s]);
  }
  const total = segs.reduce((acc, [, s0, s1]) => acc + Math.abs(s1 - s0), 0);
  let d = f * total;
  for (let k = 0; k < segs.length; k++) {
    const [tid, s0, s1] = segs[k], L = Math.abs(s1 - s0);
    if (d <= L || k === segs.length - 1) {
      const sgn = Math.sign(s1 - s0) || 1;
      const p = pointOnTrack(yard.tracks[tid], s0 + sgn * Math.min(d, L));
      return p;
    }
    d -= L;
  }
}

// ---------- state ----------
// state = { pos: [slot per car], sw: [leg index per switch], coupled: Set("i,j" with i<j) }
// cars = [{ id, loco?: true }]

export function occupancy(yard, pos) {
  const occ = new Array(yard.slots.length).fill(-1);
  pos.forEach((s, c) => { occ[s] = c; });
  return occ;
}

const pairKey = (i, j) => (i < j ? `${i},${j}` : `${j},${i}`);
export function isCoupled(state, i, j) { return state.coupled.has(pairKey(i, j)); }

export function cloneState(s) { return { pos: s.pos.slice(), sw: s.sw.slice(), coupled: new Set(s.coupled) }; }

// A switch can't be thrown while cars sit on both sides of it along the set route.
export function switchLocked(yard, state, k, occ = occupancy(yard, state.pos)) {
  const S = yard.switches[k];
  return occ[endSlot(yard, S.trunk, S.id)] >= 0 && occ[endSlot(yard, S.legs[state.sw[k]], S.id)] >= 0;
}

export function throwSwitch(yard, state, k) {
  if (switchLocked(yard, state, k)) return false;
  state.sw[k] = 1 - state.sw[k];
  return true;
}

// Every place two cars touch: [{a, b, slotA, slotB}] (a, b are car indices).
export function joints(yard, state, occ = occupancy(yard, state.pos)) {
  const out = [], seen = new Set();
  for (let c = 0; c < state.pos.length; c++) for (const d of [1, -1]) {
    const nx = step(yard, state.pos[c], d, state.sw);
    if (!nx) continue;
    const o = occ[nx.slot];
    if (o < 0) continue;
    const k = pairKey(c, o);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ a: c, b: o, slotA: state.pos[c], slotB: nx.slot });
  }
  return out;
}

export function toggleCoupling(state, a, b) {
  const k = pairKey(a, b);
  if (state.coupled.has(k)) state.coupled.delete(k); else state.coupled.add(k);
}

// What moves if `loco` drives one car length in direction d (relative to its
// slot's track direction): every car touching it ahead gets pushed, and cars
// coupled behind it get pulled. Returns { chain: [car, ...] front to back,
// dest: slot the front car moves into, dirs } or { blocked: true, chain }.
export function driveChain(yard, state, loco, d, occ = occupancy(yard, state.pos), pullAll = false) {
  const ahead = [];
  let cur = { slot: state.pos[loco], dir: d }, next;
  for (;;) {
    next = step(yard, cur.slot, cur.dir, state.sw);
    if (!next || occ[next.slot] < 0) break;
    ahead.push(occ[next.slot]);
    cur = next;
  }
  const behind = [];
  let prev = loco, back = { slot: state.pos[loco], dir: -d };
  for (;;) {
    const nb = step(yard, back.slot, back.dir, state.sw);
    if (!nb) break;
    const c = occ[nb.slot];
    if (c < 0 || !(pullAll || isCoupled(state, prev, c))) break;
    behind.push(c);
    prev = c; back = nb;
  }
  const chain = [...ahead.reverse(), loco, ...behind];
  if (!next) {
    // what stopped it: the node at the far end of the front car's track
    const t = yard.tracks[yard.slots[cur.slot].track];
    return { blocked: true, chain, stopNode: cur.dir > 0 ? t.to : t.from };
  }
  return { chain, dest: next.slot };
}

// Drive one car length. Returns the loco's new travel direction, or null if blocked.
export function drive(yard, state, loco, d) {
  const r = driveChain(yard, state, loco, d);
  if (r.blocked) return null;
  const nd = step(yard, state.pos[loco], d, state.sw).dir;
  applyChain(state, r);
  return nd;
}

function applyChain(state, { chain, dest }) {
  const old = chain.map((c) => state.pos[c]);
  state.pos[chain[0]] = dest;
  for (let k = 1; k < chain.length; k++) state.pos[chain[k]] = old[k - 1];
}

// The loco's travel direction in its own slot that points toward `towardSlot`
// (a neighboring slot), or 0.
export function dirToward(yard, state, slot, towardSlot) {
  for (const d of [1, -1]) {
    const nx = step(yard, slot, d, state.sw);
    if (nx && nx.slot === towardSlot) return d;
  }
  return 0;
}

// ---------- goals ----------
// goal = { track, end: nodeId, cars: [carIndex, ...] } — cars listed in the
// track's from→to order, packed against the `end` node, and nothing else but
// locos sits on that track.
export function goalSlots(yard, goal) {
  const t = yard.tracks[goal.track], n = goal.cars.length;
  return t.from === goal.end ? t.slots.slice(0, n) : t.slots.slice(t.slots.length - n);
}

export function goalMet(yard, cars, goals, pos) {
  const occ = occupancy(yard, pos);
  for (const g of goals) {
    const t = yard.tracks[g.track];
    const want = goalSlots(yard, g);
    for (let k = 0; k < want.length; k++) if (occ[want[k]] !== g.cars[k]) return false;
    for (const s of t.slots) {
      const c = occ[s];
      if (c >= 0 && !cars[c].loco && !g.cars.includes(c)) return false;
    }
  }
  return true;
}

// ---------- solver ----------
// Fewest drives to reach the goal. Switch throws and couplings are free, so a
// search node is just where every car is (plus any switch that's pinned in
// place by cars). Each edge is one drive: pick switches, a loco, a direction,
// how many touching cars behind it to pull, and how far to go.
// Cars with `filler: true` are interchangeable.
export function solve(yard, cars, start, goals, { maxStates = 2e6 } = {}) {
  const nCars = cars.length;
  const fillers = cars.map((c, i) => (c.filler ? i : -1)).filter((i) => i >= 0);
  const locos = cars.map((c, i) => (c.loco ? i : -1)).filter((i) => i >= 0);
  const nSw = yard.switches.length;

  const key = (pos, sw, occ) => {
    const p = pos.slice();
    if (fillers.length > 1) {
      const fs = fillers.map((i) => p[i]).sort((a, b) => a - b);
      fillers.forEach((i, k) => { p[i] = fs[k]; });
    }
    let k = p.join(",") + "|";
    for (let s = 0; s < nSw; s++) k += switchLocked(yard, { sw }, s, occ) ? sw[s] : "*";
    return k;
  };

  const startOcc = occupancy(yard, start.pos);
  const seen = new Map([[key(start.pos, start.sw, startOcc), null]]);
  if (goalMet(yard, cars, goals, start.pos)) return { moves: 0, states: 1 };
  let frontier = [{ pos: start.pos.slice(), sw: start.sw.slice() }];
  let depth = 0;
  while (frontier.length) {
    depth++;
    const next = [];
    for (const node of frontier) {
      const occ = occupancy(yard, node.pos);
      // all switch settings reachable for free
      const choices = [];
      for (let s = 0; s < nSw; s++) choices.push(switchLocked(yard, node, s, occ) ? [node.sw[s]] : [0, 1]);
      const combos = cartesian(choices);
      for (const sw of combos) for (const loco of locos) for (const d of [1, -1]) {
        // touching cars behind, any of which may be coupled on
        const all = driveChain(yard, { pos: node.pos, sw, coupled: new Set() }, loco, d, occ, true);
        const locoAt = all.chain.indexOf(loco);
        const maxPull = all.chain.length - 1 - locoAt;
        for (let pull = 0; pull <= maxPull; pull++) {
          const coupled = new Set();
          for (let k = locoAt; k < locoAt + pull; k++) coupled.add(pairKey(all.chain[k], all.chain[k + 1]));
          const st = { pos: node.pos.slice(), sw, coupled };
          let dir = d;
          for (;;) {
            dir = drive(yard, st, loco, dir);
            if (dir === null) break;
            const o2 = occupancy(yard, st.pos);
            const k = key(st.pos, sw, o2);
            if (seen.has(k)) continue;
            seen.set(k, null);
            if (goalMet(yard, cars, goals, st.pos)) return { moves: depth, states: seen.size };
            next.push({ pos: st.pos.slice(), sw: sw.slice() });
            if (seen.size > maxStates) return { moves: null, states: seen.size, gaveUp: true };
          }
        }
      }
    }
    frontier = next;
  }
  return { moves: null, states: seen.size };
}

function cartesian(lists) {
  let out = [[]];
  for (const l of lists) out = out.flatMap((pre) => l.map((v) => [...pre, v]));
  return out;
}
