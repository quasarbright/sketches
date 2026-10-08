// Continuous movement: what actually happens on screen.
//
// Every car has a position along a track (the arclength `s` of its center)
// and is one car length long, so two cars touch when their centers are one
// car length apart along the route. Nothing moves unless a loco drives it:
// the loco carries the cars coupled to it, pushes whatever it runs into, and
// everything else stays exactly where it is.
//
// state = { at: [{ track, s }], sw: [leg per switch], coupled: Set("i,j") }

import { nextTrack, walk } from "./yard.mjs";

export const FOUL = 0.7;  // how far from the points the two legs are too close for two cars
const EPS = 1e-6, TOUCH = 1e-4;

const pairKey = (i, j) => (i < j ? `${i},${j}` : `${j},${i}`);
export const isCoupled = (state, i, j) => state.coupled.has(pairKey(i, j));
export function toggleCoupling(state, i, j) {
  const k = pairKey(i, j);
  if (state.coupled.has(k)) state.coupled.delete(k); else state.coupled.add(k);
}

export function fromSlots(yard, { pos, sw, coupled }) {
  return { at: pos.map((p) => ({ track: yard.slots[p].track, s: yard.slots[p].s })), sw: sw.slice(), coupled: new Set(coupled) };
}
export function clone(state) {
  return { at: state.at.map((p) => ({ ...p })), sw: state.sw.slice(), coupled: new Set(state.coupled) };
}

// Nearest car center along the route from (track, s) heading dir, within maxDist.
// Returns { car, dist, dir } (dir = travel direction on that car's track) or null.
export function scan(yard, state, track, s, dir, maxDist, skip = null) {
  let dist = 0;
  for (let guard = 0; guard < 100; guard++) {
    let best = null;
    state.at.forEach((p, c) => {
      if (p.track !== track || (skip && skip.has(c))) return;
      const ds = (p.s - s) * dir;
      if (ds > EPS && dist + ds <= maxDist + EPS && (!best || ds < best.ds)) best = { c, ds };
    });
    if (best) return { car: best.c, dist: dist + best.ds, dir };
    const t = yard.tracks[track];
    dist += dir > 0 ? t.len - s : s;
    if (dist > maxDist) return null;
    const nx = nextTrack(yard, track, dir > 0 ? t.to : t.from, state.sw);
    if (!nx) return null;
    track = nx.track; dir = nx.dir; s = dir > 0 ? 0 : yard.tracks[track].len;
  }
  return null;
}

// The cars that move when `loco` drives in direction d (relative to its own
// track), front first, each with the direction it travels on its own track:
// everything touching ahead of it (pushed) and, if `pull`, everything coupled
// behind it.
export function group(yard, state, loco, d, pull = true) {
  const at = state.at;
  const members = [{ c: loco, dir: d }];
  let cur = { track: at[loco].track, s: at[loco].s, dir: d };
  for (;;) {
    const r = scan(yard, state, cur.track, cur.s, cur.dir, 1 + TOUCH);
    if (!r || members.some((m) => m.c === r.car)) break;
    members.unshift({ c: r.car, dir: r.dir });
    cur = { track: at[r.car].track, s: at[r.car].s, dir: r.dir };
  }
  let prev = loco;
  cur = { track: at[loco].track, s: at[loco].s, dir: -d };
  while (pull) {
    const r = scan(yard, state, cur.track, cur.s, cur.dir, 1 + TOUCH);
    if (!r || !isCoupled(state, prev, r.car) || members.some((m) => m.c === r.car)) break;
    members.push({ c: r.car, dir: -r.dir });
    prev = r.car;
    cur = { track: at[r.car].track, s: at[r.car].s, dir: r.dir };
  }
  return members;
}

// distance from a car's center to node `nodeId` at one end of its track
const toNode = (yard, p, nodeId) => (yard.tracks[p.track].from === nodeId ? p.s : yard.tracks[p.track].len - p.s);

// Is a car (not in skip) within FOUL of the points on this leg?
function legFouled(yard, state, legId, nodeId, skip) {
  return state.at.some((p, c) => !skip.has(c) && p.track === legId && toNode(yard, p, nodeId) < FOUL + 0.5 - TOUCH);
}

// How far the front car can roll before it hits a buffer, a switch set
// against it, or the side of a car on the other leg of a switch it's
// converging on. { dist, node, why }
function barrier(yard, state, front, skip) {
  let { track, s } = state.at[front.c], dir = front.dir, dist = 0;
  for (let guard = 0; guard < 100; guard++) {
    const t = yard.tracks[track];
    const room = dir > 0 ? t.len - s : s;
    const nodeId = dir > 0 ? t.to : t.from;
    const k = yard.switchIndex[nodeId];
    const S = k != null ? yard.switches[k] : null;
    // heading along a leg toward its points: stop at the fouling mark
    if (S && S.legs.includes(track) && room - 0.5 >= FOUL - TOUCH) {
      const other = S.legs.find((l) => l !== track);
      if (legFouled(yard, state, other, nodeId, skip)) return { dist: dist + room - 0.5 - FOUL, node: nodeId, why: "foul" };
    }
    const nx = nextTrack(yard, track, nodeId, state.sw);
    if (!nx) return { dist: Math.max(0, dist + room - 0.5), node: nodeId, why: S ? "against" : "buffer" };
    dist += room;
    if (dist > 1e3) break;
    track = nx.track; dir = nx.dir; s = dir > 0 ? 0 : yard.tracks[track].len;
  }
  return { dist: Infinity };
}

// If the front car is going through a switch from its trunk side, the
// switch and how far the front car's nose is past the points (negative while
// it's still approaching).
function throughPoints(yard, state, front) {
  const p = state.at[front.c], t = yard.tracks[p.track];
  const ahead = front.dir > 0 ? t.to : t.from, behind = front.dir > 0 ? t.from : t.to;
  let k = yard.switchIndex[ahead];
  if (k != null && yard.switches[k].trunk === p.track) return { k, a: 0.5 - (front.dir > 0 ? t.len - p.s : p.s) };
  k = yard.switchIndex[behind];
  if (k != null && yard.switches[k].legs[state.sw[k]] === p.track) return { k, a: (front.dir > 0 ? p.s : t.len - p.s) + 0.5 };
  return null;
}

// Drive `loco` up to `amount` car lengths in direction d. Moves the cars in
// place. Returns { moved, dir (the loco's travel direction now), stop }.
export function drive(yard, state, loco, d, amount) {
  return moveChain(yard, state, loco, d, amount, true);
}

function moveChain(yard, state, lead, d, amount, pull) {
  let moved = 0, dir = d, stop = null;
  for (let guard = 0; guard < 500 && moved < amount - EPS; guard++) {
    const members = group(yard, state, lead, dir, pull);
    const skip = new Set(members.map((m) => m.c));
    const front = members[0];
    const bar = barrier(yard, state, front, skip);
    const fp = state.at[front.c];
    const ahead = scan(yard, state, fp.track, fp.s, front.dir, amount - moved + 1 + TOUCH, skip);
    const gap = ahead ? Math.max(0, ahead.dist - 1) : Infinity;
    const remaining = amount - moved;
    let len = Math.max(0, Math.min(remaining, bar.dist, gap));

    // Going through the points from the trunk, the nose meets the end of any
    // car parked close to the points on the other leg, and shoves it up that
    // leg until the two are clear of each other (FOUL past the points).
    let side = null;
    const tp = throughPoints(yard, state, front);
    if (tp && tp.a < FOUL && tp.a + len > 0) {
      const S = yard.switches[tp.k], other = S.legs[1 - state.sw[tp.k]], ot = yard.tracks[other];
      const into = ot.from === S.id ? 1 : -1;
      const r = scan(yard, state, other, into > 0 ? 0 : ot.len, into, FOUL + 0.5, skip);
      if (r) {
        len = Math.min(len, 0.05); // small steps while shouldering a car aside
        const need = Math.min(tp.a + len, FOUL) - (r.dist - 0.5);
        if (need > EPS) {
          const pushed = moveChain(yard, state, r.car, r.dir, need, false).moved;
          if (pushed < need - EPS) { len = Math.max(0, len - (need - pushed)); side = { node: S.id, why: "foul" }; }
        }
      }
    }

    if (len > 0) for (const m of members) {
      const p = walk(yard, state.at[m.c].track, state.at[m.c].s, m.dir, len, state.sw);
      state.at[m.c] = { track: p.track, s: p.s };
      if (m.c === lead) dir = p.dir;
    }
    moved += len;
    if (side) { stop = side; break; }
    if (bar.dist <= len + EPS && bar.dist < remaining - EPS) { stop = bar; break; } // up against something
    if (gap <= len + EPS && gap < remaining - EPS) continue; // reached a car: it gets pushed from here on
    if (len <= EPS) break;
  }
  return { moved, dir, stop };
}

// A switch can't be thrown while a car sits across the points, or while two
// cars are coupled across them.
export function switchLocked(yard, state, k) {
  const S = yard.switches[k];
  const tracksHere = [S.trunk, ...S.legs];
  const on = state.at.some((p) => tracksHere.includes(p.track) && toNode(yard, p, S.id) < 0.5 - TOUCH);
  if (on) return true;
  return joints(yard, state).some((j) => isCoupled(state, j.a, j.b) && j.across === S.id);
}

export function throwSwitch(yard, state, k) {
  if (switchLocked(yard, state, k)) return false;
  state.sw[k] = 1 - state.sw[k];
  return true;
}

// Every pair of cars touching end to end: [{ a, b, dir }] where dir is the
// direction from a to b along a's track, and `across` names a switch between them.
export function joints(yard, state) {
  const out = [], seen = new Set();
  state.at.forEach((p, a) => {
    for (const d of [1, -1]) {
      const r = scan(yard, state, p.track, p.s, d, 1 + TOUCH);
      if (!r || r.dist < 1 - 1e-3) continue;
      const k = pairKey(a, r.car);
      if (seen.has(k)) continue;
      seen.add(k);
      const q = state.at[r.car];
      let across = null;
      if (q.track !== p.track) {
        const t = yard.tracks[p.track];
        const n = d > 0 ? t.to : t.from;
        if (yard.switchIndex[n] != null) across = n;
      }
      out.push({ a, b: r.car, dir: d, across });
    }
  });
  return out;
}

// The goal: counting from the goal's end of its track, the cars there are
// exactly the goal's cars in order, with nothing but locos after them (and no
// loco in between), each fully on the track.
export function goalMet(yard, cars, goals, state) {
  return goals.every((g) => {
    const t = yard.tracks[g.track];
    const here = [];
    state.at.forEach((p, c) => { if (p.track === g.track) here.push(c); });
    for (const c of here) { const p = state.at[c]; if (p.s < 0.5 - 1e-3 || p.s > t.len - 0.5 + 1e-3) return false; }
    const fromEnd = (c) => toNode(yard, state.at[c], g.end);
    here.sort((a, b) => fromEnd(a) - fromEnd(b));
    // g.cars is listed left to right (from → to); nearest the end first
    const want = t.from === g.end ? g.cars : g.cars.slice().reverse();
    return want.every((c, i) => here[i] === c) && here.slice(want.length).every((c) => cars[c].loco);
  });
}
