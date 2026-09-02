/* orbits.mjs — mini-ksp physics core. Pure math, no DOM; unit-tested in node.
 *
 * Units: km, s, km/s (Δv on maneuver nodes is in m/s, converted where applied).
 * Model: 2D patched conics. One two-body problem at a time; bodies ride circular
 * rails around their parents; the ship's path is conic segments patched at
 * sphere-of-influence boundaries, maneuver nodes, and impacts.
 *
 * Everything is a pure function of (epoch state, node list, time) — except that
 * SOI *entries* must be found by scanning, which is only certified up to
 * `traj.scannedUntil`. Callers keep that horizon ahead of the clock
 * (recompile with a larger `until`), and use tryJump() for long jumps so a
 * newly discovered encounter aborts the warp instead of being skipped.
 */

export const TAU = Math.PI * 2;
const clampN = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const DRAW_RMAX = 1e6;     // km — default sampling reach for unbounded hyperbolas
export const MAX_SEGS = 64; // also bounds the display's patch-limit slider
const SCAN_DIVS = 300;     // scan steps per relevant orbital period

/* ------------------------------- system -------------------------------- */

// config: { root: id, bodies: { id: {name, mu, radius,
//   [parent, a|orbitRadius, e=0, longPeri=0, M0|phase0=0, retrograde], ...display} } }
// Returns bodies annotated with children[], and (for non-roots) an `orbit`
// (same shape posVelAt consumes), n, period, soi, rpO/raO (radial range), vMax.
export function makeSystem(config) {
  const bodies = {};
  for (const [id, b] of Object.entries(config.bodies)) bodies[id] = { ...b, id, children: [] };
  for (const b of Object.values(bodies)) {
    if (!b.parent) continue;
    const p = bodies[b.parent];
    p.children.push(b.id);
    const a = b.a ?? b.orbitRadius;
    const e = b.e ?? 0;
    const lp = b.longPeri ?? 0;
    const M0 = b.M0 ?? b.phase0 ?? 0;
    const s = b.retrograde ? -1 : 1;
    b.n = Math.sqrt(p.mu / a ** 3);
    b.period = TAU / b.n;
    b.orbitRadius = a; // kept for display code sizing labels/orbit rings
    b.orbit = {
      mu: p.mu, a, e, p: a * (1 - e * e),
      px: Math.cos(lp), py: Math.sin(lp),
      qx: -s * Math.sin(lp), qy: s * Math.cos(lp),
      n: b.n, tp: -M0 / b.n, elliptic: true,
      period: b.period, rp: a * (1 - e), ra: a * (1 + e),
    };
    b.rpO = b.orbit.rp;
    b.raO = b.orbit.ra;
    b.vMax = Math.sqrt(p.mu * (2 / b.rpO - 1 / a)); // perihelion speed
    b.soi = a * (b.mu / p.mu) ** 0.4;
  }
  const maxChildPeriod = Math.max(...Object.values(bodies).map((b) => b.period ?? 0), 0);
  return { root: config.root, bodies, maxChildPeriod };
}

// body state in its parent's frame (Kepler rails)
export function bodyRelStateAt(system, id, t) {
  return posVelAt(system.bodies[id].orbit, t);
}

// body state in the root frame
export function bodyStateAt(system, id, t) {
  if (id === system.root) return { x: 0, y: 0, vx: 0, vy: 0 };
  const rel = bodyRelStateAt(system, id, t);
  const par = bodyStateAt(system, system.bodies[id].parent, t);
  return { x: par.x + rel.x, y: par.y + rel.y, vx: par.vx + rel.vx, vy: par.vy + rel.vy };
}

/* ------------------------------- kepler -------------------------------- */

// 2D orbit from a state vector. Handles ellipse + hyperbola, both directions.
// Perifocal frame: p̂ toward periapsis, q̂ = ±90° so true anomaly always increases with time.
export function stateToOrbit(mu, rx, ry, vx, vy, t) {
  const r = Math.hypot(rx, ry);
  const v2 = vx * vx + vy * vy;
  const hz = rx * vy - ry * vx;
  const rv = rx * vx + ry * vy;
  let energy = v2 / 2 - mu / r;
  if (Math.abs(energy) < 1e-9) energy = -1e-9; // dodge exact parabola
  const a = -mu / (2 * energy);
  let ex = ((v2 - mu / r) * rx - rv * vx) / mu;
  let ey = ((v2 - mu / r) * ry - rv * vy) / mu;
  let e = Math.hypot(ex, ey);
  let px, py;
  if (e < 1e-9) { e = 0; px = rx / r; py = ry / r; }
  else { px = ex / e; py = ey / e; }
  const s = hz >= 0 ? 1 : -1;
  const qx = -s * py, qy = s * px;
  const p = hz * hz / mu;
  const elliptic = a > 0;
  const n = Math.sqrt(mu / Math.abs(a * a * a));
  const nu0 = Math.atan2(rx * qx + ry * qy, rx * px + ry * py);
  let tp;
  if (elliptic) {
    const E0 = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu0 / 2), Math.sqrt(1 + e) * Math.cos(nu0 / 2));
    tp = t - (E0 - e * Math.sin(E0)) / n;
  } else {
    const H0 = 2 * Math.atanh(clampN(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu0 / 2), -0.999999999, 0.999999999));
    tp = t - (e * Math.sinh(H0) - H0) / n;
  }
  return {
    mu, a, e, p, px, py, qx, qy, n, tp, elliptic,
    period: elliptic ? TAU / n : Infinity,
    rp: p / (1 + e),
    ra: elliptic ? p / (1 - e) : Infinity,
  };
}

function solveE(Mw, e) {
  let E = e < 0.8 ? Mw : Math.PI * Math.sign(Mw || 1);
  for (let i = 0; i < 40; i++) {
    const d = (E - e * Math.sin(E) - Mw) / (1 - e * Math.cos(E));
    E -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return E;
}
function solveH(M, e) {
  let H = Math.asinh(M / e);
  for (let i = 0; i < 60; i++) {
    const d = (e * Math.sinh(H) - H - M) / (e * Math.cosh(H) - 1);
    H -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  return H;
}
// eccentric anomaly at mean anomaly M, unwrapped (keeps winding count)
function unwrapE(o, M) {
  const k = Math.floor((M + Math.PI) / TAU);
  return solveE(M - TAU * k, o.e) + TAU * k;
}

export function posVelAt(o, t) {
  const M = o.n * (t - o.tp);
  let cx, cy, r;
  if (o.elliptic) {
    const E = unwrapE(o, M);
    const b = o.a * Math.sqrt(1 - o.e * o.e);
    cx = o.a * (Math.cos(E) - o.e);
    cy = b * Math.sin(E);
    r = o.a * (1 - o.e * Math.cos(E));
  } else {
    const H = solveH(M, o.e);
    const bh = -o.a * Math.sqrt(o.e * o.e - 1);
    cx = o.a * (Math.cosh(H) - o.e);
    cy = bh * Math.sinh(H);
    r = o.a * (1 - o.e * Math.cosh(H));
  }
  const nu = Math.atan2(cy, cx);
  const x = cx * o.px + cy * o.qx, y = cx * o.py + cy * o.qy;
  const sq = Math.sqrt(o.mu / o.p);
  const vxp = -sq * Math.sin(nu), vyp = sq * (o.e + Math.cos(nu));
  return { x, y, r, nu, vx: vxp * o.px + vyp * o.qx, vy: vxp * o.py + vyp * o.qy };
}

// first time ≥ tAfter at which true anomaly = nu (null if never)
export function tAtNu(o, nu, tAfter) {
  if (o.elliptic) {
    const E = 2 * Math.atan2(Math.sqrt(1 - o.e) * Math.sin(nu / 2), Math.sqrt(1 + o.e) * Math.cos(nu / 2));
    let t0 = o.tp + (E - o.e * Math.sin(E)) / o.n;
    t0 += Math.ceil((tAfter - t0) / o.period - 1e-9) * o.period;
    return t0;
  }
  const arg = Math.sqrt((o.e - 1) / (o.e + 1)) * Math.tan(nu / 2);
  if (Math.abs(arg) >= 1) return null;
  const H = 2 * Math.atanh(arg);
  const t0 = o.tp + (o.e * Math.sinh(H) - H) / o.n;
  return t0 >= tAfter ? t0 : null;
}

// |true anomaly| at which radius = rr (null if the orbit never reaches it)
export function nuAtRadius(o, rr) {
  if (o.e < 1e-9) return null;
  const c = (o.p / rr - 1) / o.e;
  if (c > 1 || c < -1) return null;
  return Math.acos(c);
}

/* ----------------------------- event finding ----------------------------- */

function shellOverlap(orbit, child) {
  return orbit.ra >= child.rpO - child.soi && orbit.rp <= child.raO + child.soi;
}

// How far ahead a trajectory needs to be scanned: two revolutions of the
// slowest mover the final orbit can actually meet. Encounters recur on that
// timescale, and the rolling horizon covers longer resonant waits. Anything
// slower (an outer planet a Jupiter-moon orbit can never reach) must not
// stretch the window — moon scans step at minutes, so a system-wide horizon
// makes every recompile walk years of scan steps.
export function relevantHorizon(system, traj) {
  const seg = traj.segs[traj.segs.length - 1];
  const body = system.bodies[seg.body];
  let p = seg.orbit.elliptic ? seg.orbit.period : 0;
  for (const cid of body.children ?? []) {
    const child = system.bodies[cid];
    if (shellOverlap(seg.orbit, child)) p = Math.max(p, child.period);
  }
  return Math.max(2 * p, 2 * 86400);
}

// outbound crossing of a child's outer shell edge (bounds how long a
// hyperbolic orbit can still meet that child); null if unreachable/past
function outboundShellExit(orbit, child, tAfter) {
  const nuH = nuAtRadius(orbit, child.raO + child.soi);
  return nuH != null ? tAtNu(orbit, nuH, tAfter) : null;
}

// scan for the ship (on `orbit` around `child.parent`) entering `child`'s SOI
function scanSoiEntry(system, orbit, childId, scanFrom, windowEnd) {
  const child = system.bodies[childId];
  if (windowEnd <= scanFrom) return null;
  // the gap to the shell closes no faster than the two top speeds combined,
  // so far from the shell the scan may leap ahead — fixed fine steps froze
  // maneuver editing whenever a long-period orbit crossed a fast moon's shell
  const vMax = Math.sqrt(orbit.mu * Math.max(2 / orbit.rp - 1 / orbit.a, 1e-12)) + child.vMax;
  // near the shell the step must resolve a crossing: at real solar scale a
  // thin fast SOI can be crossed in less than childPeriod/DIVS (a graze would
  // be stepped over entirely), so cap the fine step by the crossing time too
  const fine = Math.max(1, Math.min(
    Math.min(orbit.elliptic ? orbit.period : Infinity, child.period) / SCAN_DIVS,
    child.soi / vMax));
  const f = (t) => {
    const s = posVelAt(orbit, t), m = bodyRelStateAt(system, childId, t);
    return Math.hypot(s.x - m.x, s.y - m.y) - child.soi;
  };
  const stepAfter = (gap) => Math.max(fine, 0.8 * gap / vMax);
  let tPrev = scanFrom + 1e-3, fPrev = f(tPrev);
  while (fPrev <= 0 && tPrev < windowEnd) { tPrev += fine; fPrev = f(tPrev); } // skip if starting inside
  for (let t = tPrev + stepAfter(fPrev); ; t += 0) {
    const tc = Math.min(t, windowEnd);
    const fc = f(tc);
    if (fPrev > 0 && fc <= 0) {
      let a = tPrev, b = tc;
      for (let i = 0; i < 60; i++) { const mid = (a + b) / 2; if (f(mid) > 0) a = mid; else b = mid; }
      return b; // just inside the SOI
    }
    tPrev = tc; fPrev = fc;
    if (tc >= windowEnd) return null;
    t = tc + stepAfter(fc);
  }
}

// earliest event ending a segment. Everything here is generic per-body:
// crossing any body's SOI outbound is an exit (a handoff to its parent, or an
// "escape" if it has none), crossing back in is an encounter — including with
// the body you never stopped orbiting. Impacts and boundary crossings are
// closed-form; child-SOI entries are scanned, capped at `scanUntil`, and only
// matter while inside this body's own SOI (SOIs nest — the smaller one wins).
function findSegEnd(system, orbit, bodyId, tStart, tLimit, scanUntil) {
  const body = system.bodies[bodyId];
  const cands = [];
  let inside = true;
  if (body.soi) {
    const st0 = posVelAt(orbit, tStart + 1e-3);
    const rv0 = st0.x * st0.vx + st0.y * st0.vy;
    inside = st0.r < body.soi * (1 - 1e-9) || (st0.r < body.soi * (1 + 1e-9) && rv0 < 0);
  }
  if (inside && orbit.rp < body.radius) {
    const nuI = nuAtRadius(orbit, body.radius);
    if (nuI != null) {
      const ti = tAtNu(orbit, -nuI, tStart + 1e-3); // inbound crossing
      if (ti != null) cands.push({ t: ti, type: "impact" });
    }
  }
  // Outbound crossing: for a moon it is a real handoff to the parent whenever
  // the orbit reaches the boundary. For the root there is nothing beyond, so
  // only a genuinely unbound orbit "escapes" — a bound orbit poking past the
  // line just keeps flying its ellipse, no event either way.
  const canLeave = body.parent ? (!orbit.elliptic || orbit.ra > body.soi) : !orbit.elliptic;
  if (body.soi && inside && canLeave) {
    const nuX = nuAtRadius(orbit, body.soi);
    if (nuX != null) {
      const tx = tAtNu(orbit, nuX, tStart + 1e-3); // outbound crossing
      if (tx != null) cands.push({ t: tx, type: body.parent ? "soiExit" : "escape" });
    }
  }
  if (body.soi && !inside) {
    // outside, falling back in: an encounter with this very body
    const nuI = nuAtRadius(orbit, body.soi);
    if (nuI != null) {
      const ti = tAtNu(orbit, -nuI, tStart + 1e-3); // inbound crossing
      if (ti != null) cands.push({ t: ti, type: "soiEnter", enterBody: bodyId });
    }
  }
  // an analytic event caps how far entry scans can matter
  let entryCap = Math.min(tLimit, scanUntil);
  for (const c of cands) entryCap = Math.min(entryCap, c.t);
  if (inside) {
    for (const cid of body.children) {
      const child = system.bodies[cid];
      if (!shellOverlap(orbit, child)) continue;
      let wEnd = entryCap;
      if (!orbit.elliptic) {
        const tHi = outboundShellExit(orbit, child, tStart + 1e-6);
        wEnd = Math.min(wEnd, tHi ?? tStart);
      }
      const te = scanSoiEntry(system, orbit, cid, tStart, wEnd);
      if (te != null) cands.push({ t: te, type: "soiEnter", enterBody: cid });
    }
  }
  cands.sort((a, b) => a.t - b.t);
  return cands[0] || null;
}

// how far a final, event-free segment is certified encounter-free
function stableScanLimit(system, orbit, bodyId, tStart, until) {
  const body = system.bodies[bodyId];
  const overlapping = body.children.filter((cid) => shellOverlap(orbit, system.bodies[cid]));
  if (overlapping.length === 0) return Infinity; // can never meet anything
  if (!orbit.elliptic) {
    // outbound forever: once past every reachable shell, nothing can happen
    let cap = -Infinity;
    for (const cid of overlapping) {
      const tHi = outboundShellExit(orbit, system.bodies[cid], tStart + 1e-6);
      if (tHi != null) cap = Math.max(cap, tHi);
    }
    if (cap <= until) return Infinity;
  }
  return until;
}

/* ------------------------------- sampling -------------------------------- */

// parametric range of a segment's conic: eccentric anomaly (elliptic) or
// hyperbolic anomaly. tEnd = Infinity means a full loop (elliptic) or the
// draw horizon (hyperbolic).
export function segParamRange(seg, rMax = DRAW_RMAX) {
  const o = seg.orbit;
  if (o.elliptic) {
    const full = seg.tEnd === Infinity || (seg.tEnd - seg.tStart) >= o.period - 1e-6;
    const u1 = unwrapE(o, o.n * (seg.tStart - o.tp));
    return { u1, u2: full ? u1 + TAU : unwrapE(o, o.n * (seg.tEnd - o.tp)) };
  }
  const u1 = solveH(o.n * (seg.tStart - o.tp), o.e);
  const u2 = seg.tEnd === Infinity
    ? Math.max(u1, Math.acosh(Math.max(1, (1 - rMax / o.a) / o.e))) // never run backwards
    : solveH(o.n * (seg.tEnd - o.tp), o.e);
  return { u1, u2 };
}

// position on the conic at parametric angle u (no Kepler solve needed)
export function conicPoint(o, u) {
  let cx, cy;
  if (o.elliptic) {
    const b = o.a * Math.sqrt(1 - o.e * o.e);
    cx = o.a * (Math.cos(u) - o.e);
    cy = b * Math.sin(u);
  } else {
    const bh = -o.a * Math.sqrt(o.e * o.e - 1);
    cx = o.a * (Math.cosh(u) - o.e);
    cy = bh * Math.sinh(u);
  }
  return { x: cx * o.px + cy * o.qx, y: cx * o.py + cy * o.qy };
}

// time at parametric angle u (Kepler's equation, forward direction)
export function paramTime(o, u) {
  return o.tp + (o.elliptic ? (u - o.e * Math.sin(u)) : (o.e * Math.sinh(u) - u)) / o.n;
}

// Adaptive polyline for a screen-space curve P(u) over [u1, u2]: subdivide
// until the drawn line is within half a pixel of the true curve, pruning spans
// that provably stay off-screen. The prune margin scales with the span's chord
// — a curved span can bow out far from its chord, and a fixed margin here once
// replaced visible arcs with stray chords at high zoom.
export function adaptiveCurve(P, u1, u2, N, W, H, margin = 80) {
  const pts = [];
  const off = (pa, pm, pb) => {
    const m = margin + Math.hypot(pb.x - pa.x, pb.y - pa.y);
    const oc = (p) => (p.x < -m ? 1 : p.x > W + m ? 2 : 0) | (p.y < -m ? 4 : p.y > H + m ? 8 : 0);
    return oc(pa) & oc(pm) & oc(pb);
  };
  const emit = (ua, pa, ub, pb, depth) => {
    const um = (ua + ub) / 2, pm = P(um);
    const err = Math.hypot(pm.x - (pa.x + pb.x) / 2, pm.y - (pa.y + pb.y) / 2);
    if (depth < 22 && err > 0.5 && !off(pa, pm, pb)) {
      emit(ua, pa, um, pm, depth + 1);
      emit(um, pm, ub, pb, depth + 1);
    } else {
      // each point carries its curve parameter so interaction code (hit
      // tests, drags) can share this exact geometry with the renderer
      pts.push({ x: pm.x, y: pm.y, u: um }, { x: pb.x, y: pb.y, u: ub });
    }
  };
  let pu = u1;
  const pp = P(u1);
  pts.push({ x: pp.x, y: pp.y, u: u1 });
  let pprev = pp;
  for (let i = 1; i <= N; i++) {
    const u = u1 + (u2 - u1) * i / N;
    const p = P(u);
    emit(pu, pprev, u, p, 0);
    pu = u; pprev = p;
  }
  return pts;
}

// sample a segment's conic for hit testing (coords rel. to its body)
export function sampleSeg(seg) {
  const o = seg.orbit, pts = [];
  const N = 240;
  const { u1, u2 } = segParamRange(seg);
  for (let i = 0; i <= N; i++) {
    const u = u1 + (u2 - u1) * i / N;
    const p = conicPoint(o, u);
    pts.push({ x: p.x, y: p.y, t: paramTime(o, u) });
  }
  return pts;
}

export function segApsides(system, seg) {
  const o = seg.orbit, B = system.bodies[seg.body], out = [];
  const horizon = Math.min(seg.tEnd, seg.tStart + (o.elliptic ? o.period : Infinity));
  const tPe = tAtNu(o, 0, seg.tStart + 1e-3);
  if (tPe != null && tPe <= horizon) {
    out.push({ kind: "Pe", nu: 0, x: o.rp * o.px, y: o.rp * o.py, alt: o.rp - B.radius });
  }
  if (o.elliptic) {
    const tAp = tAtNu(o, Math.PI, seg.tStart + 1e-3);
    if (tAp != null && tAp <= horizon) {
      out.push({ kind: "Ap", nu: Math.PI, x: -o.ra * o.px, y: -o.ra * o.py, alt: o.ra - B.radius });
    }
  }
  return out;
}

/* ----------------------------- the compiler ----------------------------- */

// epoch: { body, rx, ry, vx, vy, t? }   nodes: [{id, t, prograde, radial}] (m/s)
// `until`: how far ahead to certify SOI-entry scanning. Deterministic below
// `scannedUntil`: growing `until` never changes already-computed history.
export function compileTrajectory(system, epoch, nodes, until) {
  // snapshot the nodes: the UI mutates node objects in place, and tryJump
  // compares traj.sorted against the live list to detect a stale trajectory
  const sorted = nodes.map((n) => ({ ...n })).sort((a, b) => a.t - b.t);
  const segs = [], nodeInfo = new Map();
  let body = epoch.body;
  let { rx, ry, vx, vy } = epoch;
  let t = epoch.t ?? 0, stage = 0;
  let scannedUntil = until;
  for (let guard = 0; ; guard++) {
    if (guard >= MAX_SEGS) { scannedUntil = Math.min(scannedUntil, t); break; }
    const orbit = stateToOrbit(system.bodies[body].mu, rx, ry, vx, vy, t);
    const nextNode = sorted.find((nd) => nd.t > t + 1e-6);
    const tLimit = nextNode ? nextNode.t : Infinity;
    const ev = findSegEnd(system, orbit, body, t, tLimit, until);
    let tEnd, endType, enterBody = null;
    if (ev && ev.t < tLimit) { tEnd = ev.t; endType = ev.type; enterBody = ev.enterBody ?? null; }
    else if (nextNode) { tEnd = nextNode.t; endType = "node"; }
    else { tEnd = Infinity; endType = "none"; }
    const seg = { orbit, body, tStart: t, tEnd, endType, enterBody, stage };
    seg.samples = sampleSeg(seg);
    seg.apsides = segApsides(system, seg);
    segs.push(seg);
    if (endType === "impact") { scannedUntil = Infinity; break; }
    if (endType === "none") { scannedUntil = stableScanLimit(system, orbit, body, t, until); break; }
    const st = posVelAt(orbit, tEnd);
    if (endType === "escape" || (endType === "soiEnter" && enterBody === body)) {
      // crossing this body's own SOI boundary (out, or back in) — there is no
      // other frame to hand off to, the same conic simply continues
      rx = st.x; ry = st.y; vx = st.vx; vy = st.vy;
    } else if (endType === "node") {
      const vm = Math.hypot(st.vx, st.vy) || 1;
      const rm = Math.hypot(st.x, st.y) || 1;
      const pgx = st.vx / vm, pgy = st.vy / vm;
      // radial is perpendicular to the path, in-plane, on the side away from the body
      let rox = -pgy, roy = pgx;
      if (rox * st.x + roy * st.y < 0) { rox = -rox; roy = -roy; }
      nodeInfo.set(nextNode.id, { body, t: tEnd, relX: st.x, relY: st.y, pgx, pgy, rox, roy, seg });
      rx = st.x; ry = st.y;
      vx = st.vx + (nextNode.prograde / 1000) * pgx + (nextNode.radial / 1000) * rox;
      vy = st.vy + (nextNode.prograde / 1000) * pgy + (nextNode.radial / 1000) * roy;
      // keep angular momentum away from exactly zero (degenerate radial orbit)
      if (Math.abs(rx * vy - ry * vx) < 0.5) { vx += (-st.y / rm) * 0.002; vy += (st.x / rm) * 0.002; }
      stage++;
    } else if (endType === "soiEnter") {
      const m = bodyRelStateAt(system, enterBody, tEnd);
      rx = st.x - m.x; ry = st.y - m.y; vx = st.vx - m.vx; vy = st.vy - m.vy;
      body = enterBody;
    } else { // soiExit
      const m = bodyRelStateAt(system, body, tEnd);
      rx = st.x + m.x; ry = st.y + m.y; vx = st.vx + m.vx; vy = st.vy + m.vy;
      body = system.bodies[body].parent;
    }
    t = tEnd;
  }
  return { segs, nodeInfo, sorted, scannedUntil, until };
}

export function shipStateAt(system, traj, t) {
  const segs = traj.segs;
  let seg = segs[segs.length - 1];
  for (const s of segs) if (t < s.tEnd) { seg = s; break; }
  const tc = seg.endType === "impact" ? Math.min(t, seg.tEnd) : t;
  const st = posVelAt(seg.orbit, Math.max(tc, seg.tStart));
  let x = st.x, y = st.y;
  if (seg.body !== system.root) {
    const b = bodyStateAt(system, seg.body, t);
    x += b.x; y += b.y;
  }
  return { seg, rel: st, x, y };
}

/* -------------------------------- warping -------------------------------- */

// Jump the clock to targetT — but honestly: first survey the path up to there
// (plus `horizon` beyond, so the display stays ahead). If the survey turns up
// an event the displayed trajectory didn't know about, the warp aborts with
// the clock parked `lead` seconds before it.
function trajMatchesNodes(traj, nodes) {
  const s = nodes.map((n) => ({ ...n })).sort((a, b) => a.t - b.t);
  return s.length === traj.sorted.length && s.every((n, i) => {
    const m = traj.sorted[i];
    return n.t === m.t && n.prograde === m.prograde && n.radial === m.radial;
  });
}

export function tryJump(system, epoch, nodes, traj, targetT, horizon, lead = 30) {
  // a trajectory compiled from different nodes proves nothing — rebuild first
  if (!trajMatchesNodes(traj, nodes)) traj = compileTrajectory(system, epoch, nodes, traj.until);
  if (traj.scannedUntil >= targetT) {
    const t2 = traj.scannedUntil >= targetT + horizon
      ? traj
      : compileTrajectory(system, epoch, nodes, targetT + horizon);
    return { traj: t2, t: targetT, aborted: false };
  }
  const known = traj.scannedUntil;
  const t2 = compileTrajectory(system, epoch, nodes, targetT + horizon);
  const ev = t2.segs.find(
    (s) => (s.endType === "soiEnter" || s.endType === "impact") && s.tEnd > known && s.tEnd <= targetT
  );
  if (ev) {
    return {
      traj: t2, t: Math.max(0, ev.tEnd - lead), aborted: true,
      eventT: ev.tEnd, eventType: ev.endType, enterBody: ev.enterBody,
    };
  }
  return { traj: t2, t: targetT, aborted: false };
}

// Map a time on an earlier revolution of a closed orbit to the same spot on
// the first revolution strictly after `minT` — drag and click targets must be
// in the future, however many times the ship has already lapped the samples.
export function wrapForward(t, minT, orbit, tEnd = Infinity) {
  if (!orbit.elliptic) return t;
  // canonicalize in BOTH directions to the first pass strictly after minT —
  // a raw time can sit on a LATER revolution too (paramTime measures from a
  // periapsis epoch that may follow the segment), which once made "warp here"
  // land one orbit past the clicked point
  const t2 = t - (Math.ceil((t - minT) / orbit.period) - 1) * orbit.period;
  // no pass before the segment ends: hand back a rejectable past time
  return t2 < tEnd ? t2 : t2 - orbit.period;
}

// Map-click policy: a click that lands on a drawn path wins over the body
// disc beneath it — paths are thin and deliberate targets, bodies are huge
// and have the target dropdown as a fallback.
export function resolveMapClick(pathHit, bodyId) {
  if (pathHit) return { kind: "path", hit: pathHit };
  if (bodyId) return { kind: "body", body: bodyId };
  return { kind: "none" };
}

/* ---------------------------- display visibility ---------------------------- */

// Decide which segments to DRAW — display only; the simulation always runs
// full-depth. Walking forward from the segment containing tNow:
//   - a segment ending at a maneuver node is always shown, and the anchor
//     resets to the burn time (a planned burn previews from when it fires);
//   - an SOI event (entry, exit, or root escape) within one orbit of the
//     anchor ends the normally-drawn path. If no maneuver lies beyond it, the
//     next segment is shown once as a "ghost" and nothing after it is drawn.
//     If a maneuver IS planned beyond, the patches leading to it draw as
//     ghosts, and from the burn on the walk resumes normally — so a plan
//     built inside an encounter still previews its full consequences;
//   - a deviation more than one orbit past the anchor is hidden: the orbit is
//     shown as a closed loop ("ellipse") and nothing later is drawn.
// Modes: "arc" (segment as compiled), "full" (stable orbit, endType none),
// "ellipse" (closed loop from `anchor`, deviation suppressed),
// "ghost" (post-event patch, drawn faint around its body).
// `patchLimit` is how many patches past an SOI event are drawn (as ghosts);
// a maneuver re-anchors the plan at full strength and resets the depth, and
// the walk never stops short of a planned maneuver.
export function visibleSegments(traj, tNow, patchLimit = 2) {
  const list = [];
  const segs = traj.segs;
  let i = segs.findIndex((s) => tNow < s.tEnd);
  if (i < 0) i = segs.length - 1;
  let anchor = tNow;
  let depth = 0; // SOI boundaries crossed since the clock or the last burn
  for (; i < segs.length; i++) {
    const seg = segs[i];
    const ghost = depth > 0;
    if (seg.endType === "node") {
      list.push({ seg, mode: ghost ? "ghost" : "arc", anchor });
      anchor = seg.tEnd;
      depth = 0;
    } else if (seg.endType === "none") {
      list.push({ seg, mode: ghost ? "ghost" : "full", anchor });
      break;
    } else if (!ghost && seg.tEnd - anchor > seg.orbit.period) {
      list.push({ seg, mode: "ellipse", anchor });
      break;
    } else {
      list.push({ seg, mode: ghost ? "ghost" : "arc", anchor });
      anchor = seg.tEnd;
      depth += 1;
      const nodeBeyond = traj.sorted.some((n) => n.t > tNow && n.t > seg.tEnd);
      // a ghost whose event sits many orbits inside the patch draws as a plain
      // loop and ends the chain — a shown marker should mean "about now"
      const farEvent = ghost && seg.orbit.elliptic && seg.tEnd - seg.tStart > seg.orbit.period;
      if ((depth > patchLimit || farEvent) && !nodeBeyond) break;
    }
  }
  return list;
}

/* ---------------------------- closest approach ---------------------------- */

// nearest the planned path gets to `targetId`, over segments that share the
// target's parent frame, looking ahead from `fromT` a bounded window
export function computeCA(system, traj, targetId, fromT) {
  const target = system.bodies[targetId];
  // the marker means "your NEXT closest approach": the first local minimum of
  // the distance after fromT. (A window-global minimum could jump to a closer
  // pass on a later revolution the moment a segment boundary — even a 0 m/s
  // node — shifted the scan window.)
  for (const seg of traj.segs) {
    if (seg.body !== target.parent || seg.tEnd < fromT) continue;
    const o = seg.orbit;
    const t0 = Math.max(seg.tStart, fromT);
    const win = o.elliptic ? 2 * o.period : 2 * target.period;
    const wEnd = Math.min(seg.tEnd, t0 + win);
    if (wEnd <= t0) continue;
    const dist = (t) => {
      const s = posVelAt(o, t), m = bodyRelStateAt(system, targetId, t);
      return Math.hypot(s.x - m.x, s.y - m.y);
    };
    const N = 800, dt = (wEnd - t0) / N;
    let dPrev2 = null, dPrev = dist(t0);
    for (let i = 1; i <= N; i++) {
      const d = dist(t0 + i * dt);
      if (dPrev2 != null && dPrev <= dPrev2 && dPrev <= d) {
        // bracketed the first local minimum — refine it
        let a = t0 + (i - 2) * dt, b = t0 + i * dt;
        for (let k = 0; k < 50; k++) {
          const m1 = a + (b - a) / 3, m2 = b - (b - a) / 3;
          if (dist(m1) < dist(m2)) b = m2; else a = m1;
        }
        const t = (a + b) / 2;
        return { fromT, best: { t, d: dist(t), seg } };
      }
      dPrev2 = dPrev; dPrev = d;
    }
    // still closing when the segment truly ends (an encounter, impact, or
    // frame exit): the boundary is the approach. A node boundary is not an
    // ending — the same orbit continues in the next segment.
    if (dPrev2 != null && dPrev < dPrev2 && wEnd >= seg.tEnd && seg.endType !== "node") {
      return { fromT, best: { t: wEnd, d: dPrev, seg } };
    }
  }
  return { fromT, best: null };
}
