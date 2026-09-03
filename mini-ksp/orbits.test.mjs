// Unit tests for the mini-ksp physics core (orbits.mjs).
// Run: node --test  (from mini-ksp/)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TAU,
  makeSystem,
  bodyStateAt,
  bodyRelStateAt,
  stateToOrbit,
  posVelAt,
  tAtNu,
  nuAtRadius,
  compileTrajectory,
  shipStateAt,
  tryJump,
  computeCA,
  sampleSeg,
  visibleSegments,
  conicPoint,
  segParamRange,
  paramTime,
  adaptiveCurve,
  wrapForward,
  resolveMapClick,
  relevantHorizon,
} from "./orbits.mjs";

const MU = 3531.6; // Vesper, km^3/s^2

function approx(actual, expected, tol, msg) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${msg ?? "approx"}: expected ${expected} ± ${tol}, got ${actual}`
  );
}

// The game's system: Kerbin/Mun-like planet + moon.
function gameSystem(lumePhase = 2.2) {
  return makeSystem({
    root: "vesper",
    bodies: {
      vesper: { name: "Vesper", mu: MU, radius: 600 },
      lume: { name: "Lume", mu: 65.14, radius: 200, parent: "vesper", orbitRadius: 12000, phase0: lumePhase },
    },
  });
}

const vc = (r) => Math.sqrt(MU / r); // circular speed around Vesper

/* ------------------------------ kepler core ------------------------------ */

test("kepler: state -> orbit -> state round-trips", () => {
  const cases = [
    { name: "circular", rx: 800, ry: 0, vx: 0, vy: vc(800) },
    { name: "elliptic", rx: 800, ry: 0, vx: 0, vy: vc(800) * 1.2 },
    { name: "hyperbolic", rx: 800, ry: 0, vx: 0.3, vy: vc(800) * 1.6 },
    { name: "retrograde", rx: 0, ry: 900, vx: vc(900) * 1.1, vy: 0.1 },
    { name: "tilted elliptic", rx: 500, ry: 700, vx: -1.2, vy: 1.4 },
  ];
  for (const c of cases) {
    const o = stateToOrbit(MU, c.rx, c.ry, c.vx, c.vy, 123);
    const s = posVelAt(o, 123);
    approx(s.x, c.rx, 1e-6, `${c.name} x`);
    approx(s.y, c.ry, 1e-6, `${c.name} y`);
    approx(s.vx, c.vx, 1e-6, `${c.name} vx`);
    approx(s.vy, c.vy, 1e-6, `${c.name} vy`);
  }
});

test("kepler: elliptic orbit is periodic", () => {
  const o = stateToOrbit(MU, 800, 0, 0.2, vc(800) * 1.25, 0);
  assert.ok(o.elliptic);
  const a = posVelAt(o, 500);
  const b = posVelAt(o, 500 + o.period);
  approx(b.x, a.x, 1e-5, "x after one period");
  approx(b.y, a.y, 1e-5, "y after one period");
  approx(b.vx, a.vx, 1e-8, "vx after one period");
});

test("kepler: energy and angular momentum are conserved", () => {
  for (const [name, state] of [
    ["elliptic e~0.6", [800, 0, 0, vc(800) * 1.35]],
    ["hyperbolic", [800, 0, 0, vc(800) * 1.7]],
    ["retrograde", [1000, 0, 0, -vc(1000) * 1.1]],
  ]) {
    const [rx, ry, vx, vy] = state;
    const o = stateToOrbit(MU, rx, ry, vx, vy, 0);
    const e0 = (vx * vx + vy * vy) / 2 - MU / Math.hypot(rx, ry);
    const h0 = rx * vy - ry * vx;
    for (const t of [100, 5000, 40000]) {
      const s = posVelAt(o, t);
      const e = (s.vx * s.vx + s.vy * s.vy) / 2 - MU / Math.hypot(s.x, s.y);
      const h = s.x * s.vy - s.y * s.vx;
      approx(e, e0, Math.abs(e0) * 1e-9 + 1e-12, `${name} energy at t=${t}`);
      approx(h, h0, Math.abs(h0) * 1e-9, `${name} h at t=${t}`);
    }
  }
});

test("kepler: tAtNu hits periapsis/apoapsis radii and never returns the past", () => {
  const o = stateToOrbit(MU, 800, 0, 0, vc(800) * 1.3, 0);
  for (const tAfter of [0, 12345, 7 * o.period + 1]) {
    const tPe = tAtNu(o, 0, tAfter);
    const tAp = tAtNu(o, Math.PI, tAfter);
    assert.ok(tPe >= tAfter, `tPe ${tPe} >= ${tAfter}`);
    assert.ok(tAp >= tAfter, `tAp ${tAp} >= ${tAfter}`);
    approx(posVelAt(o, tPe).r, o.rp, 1e-6, "radius at tPe");
    approx(posVelAt(o, tAp).r, o.ra, 1e-6, "radius at tAp");
  }
});

test("kepler: nuAtRadius round-trips through the radius", () => {
  const o = stateToOrbit(MU, 800, 0, 0, vc(800) * 1.3, 0);
  for (const rr of [o.rp + 1, (o.rp + o.ra) / 2, o.ra - 1]) {
    const nu = nuAtRadius(o, rr);
    assert.ok(nu != null);
    const t = tAtNu(o, nu, 0);
    approx(posVelAt(o, t).r, rr, 1e-6, `radius ${rr}`);
  }
  assert.equal(nuAtRadius(o, o.ra * 2), null, "unreachable radius");
});

/* ------------------------------- system -------------------------------- */

test("system: derived quantities and body positions", () => {
  const sys = gameSystem();
  const lume = sys.bodies.lume;
  approx(lume.soi, 12000 * (65.14 / MU) ** 0.4, 1e-9, "soi formula");
  approx(lume.period, TAU / Math.sqrt(MU / 12000 ** 3), 1e-6, "period");
  assert.deepEqual(sys.bodies.vesper.children, ["lume"]);
  const s = bodyStateAt(sys, "lume", 4321);
  approx(Math.hypot(s.x, s.y), 12000, 1e-6, "circular radius");
  approx(Math.hypot(s.vx, s.vy), 12000 * lume.n, 1e-9, "circular speed");
});

test("system: nested moons compose positions recursively", () => {
  const sys = makeSystem({
    root: "vesper",
    bodies: {
      vesper: { name: "Vesper", mu: MU, radius: 600 },
      lume: { name: "Lume", mu: 65.14, radius: 200, parent: "vesper", orbitRadius: 12000, phase0: 1.0 },
      pip: { name: "Pip", mu: 0.5, radius: 20, parent: "lume", orbitRadius: 900, phase0: 0.3 },
    },
  });
  const t = 5000;
  const lume = bodyStateAt(sys, "lume", t);
  const pip = bodyStateAt(sys, "pip", t);
  const rel = Math.hypot(pip.x - lume.x, pip.y - lume.y);
  approx(rel, 900, 1e-6, "pip stays 900 km from lume");
});

test("system: with a star above, a bound orbit past the planet's SOI hands off to a solar orbit", () => {
  const sys = makeSystem({
    root: "sol",
    bodies: {
      sol: { name: "Sol", mu: 1.1723e9, radius: 261600 },
      vesper: { name: "Vesper", mu: MU, radius: 600, parent: "sol", orbitRadius: 13599840, phase0: 0 },
      lume: { name: "Lume", mu: 65.14, radius: 200, parent: "vesper", orbitRadius: 12000, phase0: 2.2 },
    },
  });
  approx(sys.bodies.vesper.soi, 84000, 500, "planet SOI computed from the star");
  approx(sys.bodies.lume.soi, 2430, 10, "nested moon SOI still computed from the planet");
  // the sunless special case is gone: a bound orbit reaching past the planet's
  // SOI now genuinely leaves it, onto an orbit around the star
  const rp = 20000, ra = 150000, a = (rp + ra) / 2;
  const epoch = { body: "vesper", rx: rp, ry: 0, vx: 0, vy: Math.sqrt(MU * (2 / rp - 1 / a)) };
  const traj = compileTrajectory(sys, epoch, [], 5e6);
  const seg = traj.segs[0];
  assert.equal(seg.endType, "soiExit", "a real handoff, not a cosmetic escape");
  approx(posVelAt(seg.orbit, seg.tEnd).r, sys.bodies.vesper.soi, 5, "at the boundary");
  assert.equal(traj.segs[1].body, "sol", "now orbiting the star");
  const dt = 0.1;
  const before = shipStateAt(sys, traj, seg.tEnd - dt);
  const after = shipStateAt(sys, traj, seg.tEnd + dt);
  approx(after.x, before.x, 5, "continuous across the handoff");
  approx(after.y, before.y, 5, "continuous across the handoff");
});

/* ----------------------------- event finding ----------------------------- */

test("events: an orbit dipping below the surface ends in impact", () => {
  const sys = gameSystem();
  const epoch = { body: "vesper", rx: 800, ry: 0, vx: 0, vy: 1.2 }; // rp ~ 156 km < radius
  const traj = compileTrajectory(sys, epoch, [], 1e6);
  const seg = traj.segs[0];
  assert.equal(seg.endType, "impact");
  const st = posVelAt(seg.orbit, seg.tEnd);
  approx(st.r, 600, 0.5, "impact at the surface");
  assert.ok(st.x * st.vx + st.y * st.vy < 0, "impact while descending");
  // after impact the ship stays put (relative to its body)
  const later = shipStateAt(sys, traj, seg.tEnd + 5000);
  approx(later.rel.r, 600, 0.5, "frozen at the surface");
});

test("events: escaping a moon exits its SOI onto a planet orbit, continuously", () => {
  const sys = gameSystem();
  const epoch = { body: "lume", rx: 500, ry: 0, vx: 0, vy: 0.65 }; // > escape speed
  const traj = compileTrajectory(sys, epoch, [], 1e6);
  const seg = traj.segs[0];
  assert.equal(seg.endType, "soiExit");
  approx(posVelAt(seg.orbit, seg.tEnd).r, sys.bodies.lume.soi, 5, "exit at the SOI radius");
  assert.equal(traj.segs[1].body, "vesper");
  const dt = 0.1;
  const before = shipStateAt(sys, traj, seg.tEnd - dt);
  const after = shipStateAt(sys, traj, seg.tEnd + dt);
  approx(after.x, before.x, 1, "x continuous across handoff");
  approx(after.y, before.y, 1, "y continuous across handoff");
});

function soiSystem() {
  return makeSystem({
    root: "vesper",
    bodies: {
      vesper: { name: "Vesper", mu: MU, radius: 600, soi: 84000 },
      lume: { name: "Lume", mu: 65.14, radius: 200, parent: "vesper", orbitRadius: 12000, phase0: 2.2 },
    },
  });
}

test("events: crossing the root body's SOI outbound is an escape boundary, not a wall", () => {
  const sys = soiSystem();
  const epoch = { body: "vesper", rx: 800, ry: 0, vx: 0, vy: vc(800) * 1.7 }; // hyperbolic
  const traj = compileTrajectory(sys, epoch, [], 1e6);
  const esc = traj.segs.find((s) => s.endType === "escape");
  assert.ok(esc, "escape event found");
  approx(posVelAt(esc.orbit, esc.tEnd).r, 84000, 5, "escape at the SOI radius");
  assert.equal(traj.scannedUntil, Infinity, "nothing can happen out there");
  // the same conic continues beyond the boundary — no freeze, no kink
  const dt = 0.1;
  const before = shipStateAt(sys, traj, esc.tEnd - dt);
  const after = shipStateAt(sys, traj, esc.tEnd + dt);
  approx(after.x, before.x, 1, "continuous across the boundary");
  const later = shipStateAt(sys, traj, esc.tEnd + 50000);
  assert.ok(later.rel.r > 84000, "still receding after the escape");
});

test("events: falling back inside the root's SOI is an encounter with it", () => {
  const sys = soiSystem();
  // start outside the SOI, inbound
  const epoch = { body: "vesper", rx: 100000, ry: 0, vx: -0.5, vy: 0.05 };
  const traj = compileTrajectory(sys, epoch, [], 2e6);
  const enter = traj.segs[0];
  assert.equal(enter.endType, "soiEnter", "inbound crossing is an encounter");
  assert.equal(enter.enterBody, "vesper", "…with the root itself");
  approx(posVelAt(enter.orbit, enter.tEnd).r, 84000, 5, "at the SOI radius");
  assert.equal(traj.segs[1].body, "vesper", "no frame change");
  // this pass is hyperbolic: through periapsis and back out
  assert.equal(traj.segs[1].endType, "escape", "then leaves again");
  const dt = 0.1;
  const before = shipStateAt(sys, traj, enter.tEnd - dt);
  const after = shipStateAt(sys, traj, enter.tEnd + dt);
  approx(after.x, before.x, 1, "continuous across the boundary");
});

test("events: escape, then a return burn, shows the root encounter on the way back", () => {
  const sys = soiSystem();
  const epoch = { body: "vesper", rx: 800, ry: 0, vx: 0, vy: vc(800) * 1.7 };
  const probe = compileTrajectory(sys, epoch, [], 1e6);
  const tEsc = probe.segs.find((s) => s.endType === "escape").tEnd;
  const nodes = [{ id: 1, t: tEsc + 20000, prograde: -1900, radial: 0 }]; // fall back home
  const traj = compileTrajectory(sys, epoch, nodes, 1e6);
  const i = traj.segs.findIndex((s) => s.endType === "node");
  assert.ok(i >= 0, "the return burn fires");
  const reenter = traj.segs.slice(i + 1).find((s) => s.endType === "soiEnter" && s.enterBody === "vesper");
  assert.ok(reenter, "the way home is marked as an encounter with the root");
  approx(posVelAt(reenter.orbit, reenter.tEnd).r, 84000, 5, "at the SOI radius");
});

test("events: a bound orbit poking past the root's SOI is not an escape", () => {
  // with no outer attractor, crossing the boundary on a bound orbit changes
  // nothing — no escape going out, no encounter coming back, just a big orbit
  const sys = soiSystem();
  const rp = 13000; // periapsis clear of the moon's shell
  const ra = 157000; // apoapsis well beyond the 84,000 km SOI
  const a = (rp + ra) / 2;
  const vPe = Math.sqrt(MU * (2 / rp - 1 / a));
  const epoch = { body: "vesper", rx: rp, ry: 0, vx: 0, vy: vPe };
  const traj = compileTrajectory(sys, epoch, [], 3e6);
  assert.ok(!traj.segs.some((s) => s.endType === "escape"), "no escape marker");
  assert.ok(!traj.segs.some((s) => s.endType === "soiEnter" && s.enterBody === "vesper"), "no self-encounter chatter");
});

test("events: a maneuver planned beyond the escape still fires", () => {
  const sys = soiSystem();
  const epoch = { body: "vesper", rx: 800, ry: 0, vx: 0, vy: vc(800) * 1.7 };
  const probe = compileTrajectory(sys, epoch, [], 1e6);
  const tEsc = probe.segs.find((s) => s.endType === "escape").tEnd;
  const nodes = [{ id: 1, t: tEsc + 20000, prograde: 500, radial: 0 }];
  const traj = compileTrajectory(sys, epoch, nodes, 1e6);
  assert.ok(traj.nodeInfo.has(1), "the burn was applied");
  const nodeSeg = traj.segs.find((s) => s.endType === "node");
  assert.equal(nodeSeg.tEnd, tEsc + 20000);
  const before = posVelAt(nodeSeg.orbit, nodeSeg.tEnd);
  const afterSeg = traj.segs[traj.segs.indexOf(nodeSeg) + 1];
  const after = posVelAt(afterSeg.orbit, nodeSeg.tEnd);
  approx(Math.hypot(after.vx - before.vx, after.vy - before.vy) * 1000, 500, 1e-6, "Δv applied out there");
});

// Hohmann transfer timed so the moon is at the ship's apoapsis on arrival.
function hohmannSetup() {
  const r1 = 800, r2 = 12000;
  const a = (r1 + r2) / 2;
  const tFlight = Math.PI * Math.sqrt(a ** 3 / MU);
  const vPe = Math.sqrt(MU * (2 / r1 - 1 / a));
  const nLume = Math.sqrt(MU / r2 ** 3);
  const phase0 = Math.PI - nLume * tFlight; // moon reaches angle π at tFlight
  const sys = gameSystem(phase0);
  const epoch = { body: "vesper", rx: r1, ry: 0, vx: 0, vy: vPe };
  return { sys, epoch, tFlight };
}

test("events: a well-timed transfer enters the moon's SOI, continuously", () => {
  const { sys, epoch, tFlight } = hohmannSetup();
  const traj = compileTrajectory(sys, epoch, [], 60000);
  const seg = traj.segs[0];
  assert.equal(seg.endType, "soiEnter");
  assert.equal(seg.enterBody, "lume");
  assert.ok(seg.tEnd > 15000 && seg.tEnd < tFlight + 100, `entry time ${seg.tEnd}`);
  assert.equal(traj.segs[1].body, "lume");
  const moon = bodyStateAt(sys, "lume", seg.tEnd);
  const st = posVelAt(seg.orbit, seg.tEnd);
  approx(Math.hypot(st.x - moon.x, st.y - moon.y), sys.bodies.lume.soi, 5, "entry at the SOI radius");
  const dt = 0.1;
  const before = shipStateAt(sys, traj, seg.tEnd - dt);
  const after = shipStateAt(sys, traj, seg.tEnd + dt);
  approx(after.x, before.x, 1, "x continuous across handoff");
  approx(after.y, before.y, 1, "y continuous across handoff");
});

/* --------------------------- rolling horizon ---------------------------- */

test("horizon: an encounter beyond the scan horizon is invisible, then found, at the same time", () => {
  const { sys, epoch } = hohmannSetup();
  const short = compileTrajectory(sys, epoch, [], 5000);
  assert.ok(!short.segs.some((s) => s.endType === "soiEnter"), "not visible yet");
  assert.equal(short.scannedUntil, 5000);

  const a = compileTrajectory(sys, epoch, [], 40000);
  const b = compileTrajectory(sys, epoch, [], 60000);
  const ea = a.segs.find((s) => s.endType === "soiEnter");
  const eb = b.segs.find((s) => s.endType === "soiEnter");
  assert.ok(ea && eb, "both horizons find the encounter");
  approx(ea.tEnd, eb.tEnd, 2, "event time does not depend on the horizon");

  // physical state below the shorter horizon is identical
  const sa = shipStateAt(sys, a, 20000);
  const sb = shipStateAt(sys, b, 20000);
  approx(sa.x, sb.x, 1e-6, "x deterministic");
  approx(sa.y, sb.y, 1e-6, "y deterministic");
});

test("horizon: a predicted chain of encounters never shifts or vanishes on recompile", () => {
  // Find a burn that yields a flyby chain with a second encounter, then
  // recompile at ever-larger horizons (as the frame loop does while time
  // passes) and demand every event keeps its exact time. The flight the ship
  // actually flies IS this compiled chain — so if this holds, a predicted
  // encounter cannot silently fail to happen without the plan being edited.
  const sys = soiSystem();
  const epoch = { body: "vesper", rx: 800, ry: 0, vx: 0, vy: vc(800) };
  const U0 = 20 * sys.bodies.lume.period;
  let found = null;
  for (let dv = 760; dv <= 868 && !found; dv += 2) {
    const nodes = [{ id: 1, t: 1793, prograde: dv, radial: 0 }];
    const traj = compileTrajectory(sys, epoch, nodes, U0);
    const encs = traj.segs.filter((s) => s.endType === "soiEnter");
    if (encs.length >= 2 && !traj.segs.some((s) => s.endType === "impact")) found = { nodes, encs };
  }
  assert.ok(found, "some burn in range yields a multi-encounter chain");
  const times = found.encs.map((s) => s.tEnd);
  for (const until of [U0 + 54321, U0 * 1.5, U0 * 2.25]) {
    const t2 = compileTrajectory(sys, epoch, found.nodes, until);
    const encs2 = t2.segs.filter((s) => s.endType === "soiEnter");
    assert.ok(encs2.length >= times.length, `all ${times.length} encounters survive until=${until}`);
    times.forEach((t, k) => approx(encs2[k].tEnd, t, 1e-3, `encounter ${k} time at until=${until}`));
  }
});

test("horizon: an orbit that can never meet anything is certified forever", () => {
  const sys = gameSystem();
  const epoch = { body: "vesper", rx: 800, ry: 0, vx: 0, vy: vc(800) }; // low circular
  const traj = compileTrajectory(sys, epoch, [], 50000);
  assert.equal(traj.scannedUntil, Infinity);
});

/* ------------------------------ maneuvers ------------------------------- */

test("maneuvers: a node splits the trajectory and applies its Δv", () => {
  const sys = gameSystem();
  const epoch = { body: "vesper", rx: 800, ry: 0, vx: 0, vy: vc(800) };
  const nodes = [{ id: 1, t: 1000, prograde: 100, radial: 0 }]; // m/s
  const traj = compileTrajectory(sys, epoch, nodes, 50000);
  assert.equal(traj.segs[0].endType, "node");
  assert.equal(traj.segs[0].tEnd, 1000);
  assert.ok(traj.nodeInfo.has(1));
  const before = posVelAt(traj.segs[0].orbit, 1000);
  const after = posVelAt(traj.segs[1].orbit, 1000);
  const dv = Math.hypot(after.vx - before.vx, after.vy - before.vy);
  approx(dv * 1000, 100, 1e-6, "Δv magnitude in m/s");
  approx(after.x, before.x, 1e-9, "burn does not teleport");
});

test("maneuvers: radial Δv is perpendicular to the path, positive away from the body", () => {
  const sys = gameSystem();
  const epoch = { body: "vesper", rx: 800, ry: 0, vx: 0, vy: vc(800) * 1.3 }; // eccentric, starts at Pe
  const o = stateToOrbit(MU, 800, 0, 0, vc(800) * 1.3, 0);
  const tn = o.period * 0.2; // well away from both apsides
  const nodes = [{ id: 1, t: tn, prograde: 0, radial: 50 }];
  const traj = compileTrajectory(sys, epoch, nodes, 1e6);
  const before = posVelAt(traj.segs[0].orbit, tn);
  const after = posVelAt(traj.segs[1].orbit, tn);
  const dvx = after.vx - before.vx, dvy = after.vy - before.vy;
  approx(dvx * before.vx + dvy * before.vy, 0, 1e-9, "no component along the path");
  assert.ok(dvx * before.x + dvy * before.y > 0, "radial-out points away from the body");
  approx(Math.hypot(dvx, dvy) * 1000, 50, 1e-6, "Δv magnitude in m/s");
});

/* ------------------------------- warping -------------------------------- */

test("tryJump: aborts just before a newly discovered encounter", () => {
  const { sys, epoch, tFlight } = hohmannSetup();
  const traj = compileTrajectory(sys, epoch, [], 5000);
  const res = tryJump(sys, epoch, [], traj, tFlight, 100000);
  assert.equal(res.aborted, true);
  const entry = res.traj.segs.find((s) => s.endType === "soiEnter");
  assert.ok(entry, "encounter is known after the jump");
  assert.ok(res.t < entry.tEnd, "lands before the encounter");
  approx(res.t, entry.tEnd - 30, 1, "lands with a 30 s lead");
});

test("tryJump: a discovery beyond the target does not abort", () => {
  const { sys, epoch } = hohmannSetup();
  const traj = compileTrajectory(sys, epoch, [], 5000);
  const res = tryJump(sys, epoch, [], traj, 10000, 100000); // target well before the encounter
  assert.equal(res.aborted, false);
  assert.equal(res.t, 10000);
  assert.ok(res.traj.segs.some((s) => s.endType === "soiEnter"), "still learned about the encounter");
});

test("tryJump: a trajectory stale against edited nodes cannot skip the survey", () => {
  // The UI mutates node objects in place and recompiles a frame later; a jump
  // issued in between must not trust the stale trajectory's certification.
  const sys = gameSystem();
  const epoch = { body: "vesper", rx: 800, ry: 0, vx: 0, vy: vc(800) };
  const HORIZON = 20 * sys.bodies.lume.period;
  const nodes = [{ id: 1, t: 1793, prograde: 0, radial: 0 }];
  const stale = compileTrajectory(sys, epoch, nodes, HORIZON);
  assert.equal(stale.scannedUntil, Infinity, "0 m/s burn leaves a forever-stable orbit");
  nodes[0].prograde = 820; // edited in place after the compile
  const res = tryJump(sys, epoch, nodes, stale, 60 * 86400, HORIZON);
  assert.equal(res.aborted, true, "the encounter created by the edit still aborts the warp");
  assert.equal(res.enterBody, "lume");
});

test("tryJump: a forever-certified orbit jumps straight through", () => {
  const sys = gameSystem();
  const epoch = { body: "vesper", rx: 800, ry: 0, vx: 0, vy: vc(800) };
  const traj = compileTrajectory(sys, epoch, [], 50000);
  const res = tryJump(sys, epoch, [], traj, 5e6, 100000);
  assert.equal(res.aborted, false);
  assert.equal(res.t, 5e6);
});

// Regression: the exact scenario verified live in the browser. An 820 m/s
// prograde burn from the game's epoch puts the ship on a shell-crossing orbit
// nearly resonant with Lume, so the first encounter falls beyond the survey
// horizon. A +60d jump must discover it mid-warp and abort just before it.
test("tryJump regression: near-resonant orbit hides its encounter past the horizon", () => {
  const sys = gameSystem(); // game phase0 = 2.2
  const epoch = { body: "vesper", rx: 800, ry: 0, vx: 0, vy: vc(800) };
  const nodes = [{ id: 1, t: 1793, prograde: 820, radial: 0 }]; // T+ 0d 00:29:53
  const HORIZON = 20 * sys.bodies.lume.period; // ~32 days, the game's survey depth
  const traj = compileTrajectory(sys, epoch, nodes, HORIZON);
  assert.ok(!traj.segs.some((s) => s.endType === "soiEnter"), "no encounter within the horizon");
  assert.equal(traj.scannedUntil, HORIZON);

  const target = 60 * 86400;
  const res = tryJump(sys, epoch, nodes, traj, target, HORIZON);
  assert.equal(res.aborted, true, "the hidden encounter aborts the warp");
  assert.equal(res.enterBody, "lume");
  assert.ok(res.eventT > HORIZON && res.eventT < target, `encounter at ${res.eventT} lies past the horizon`);
  approx(res.t, res.eventT - 30, 1e-9, "parked 30 s before the encounter");
});

/* ---------------------------- closest approach --------------------------- */

test("closest approach: two circular orbits kiss at the radius difference", () => {
  const sys = gameSystem();
  const epoch = { body: "vesper", rx: 6000, ry: 0, vx: 0, vy: vc(6000) };
  const traj = compileTrajectory(sys, epoch, [], 200000);
  const ca = computeCA(sys, traj, "lume", 0);
  assert.ok(ca.best, "found a closest approach");
  approx(ca.best.d, 6000, 50, "min distance = orbit radius difference");
});

test("wrapForward: a time already passed maps to the same spot on a future revolution", () => {
  // Regression: dragging a maneuver after the clock passed the sampled
  // revolution pinned it to the ship (looked like an unbreakable Ap snap) —
  // every candidate time was in the past and got clamped to "now".
  const o = { elliptic: true, period: 1000 };
  assert.equal(wrapForward(300, 4500, o, Infinity), 5300, "wraps whole revolutions forward");
  assert.equal(wrapForward(300, 200, o, Infinity), 300, "future times pass through");
  assert.equal(wrapForward(4500, 4500, o, Infinity), 5500, "lands strictly after minT");
  assert.equal(wrapForward(300, 4500, { elliptic: false, period: Infinity }, Infinity), 300, "hyperbolas cannot wrap");
  assert.ok(wrapForward(300, 4500, o, 5000) <= 4500, "no pass before the segment ends -> a rejectable past time");
});

test("map clicks: a path hit beats the body disc beneath it", () => {
  // Regression: clicking a trajectory where it crossed a body's disc toggled
  // the target instead of opening the maneuver menu — the body check ran
  // first. Paths are thin and deliberate; bodies are huge and have the
  // dropdown as a fallback.
  const hit = { t: 5, seg: "s" };
  assert.deepEqual(resolveMapClick(hit, "earth"), { kind: "path", hit });
  assert.deepEqual(resolveMapClick(null, "earth"), { kind: "body", body: "earth" });
  assert.deepEqual(resolveMapClick(null, null), { kind: "none" });
});

/* ---------------------------- display visibility --------------------------- */
// visibleSegments decides what to DRAW; the simulation always runs full-depth.
// A deviation (SOI change / impact) more than one orbit past its anchor is
// hidden behind a closed "ellipse" loop; anchors reset at maneuver nodes.

const stubSeg = (tStart, tEnd, endType, period = 1000) =>
  ({ tStart, tEnd, endType, orbit: { period, elliptic: Number.isFinite(period) } });
const stubTraj = (segs, nodes = []) => ({ segs, sorted: nodes });
const modes = (list) => list.map((v) => v.mode);

test("visibility: a stable orbit is just shown", () => {
  const traj = stubTraj([stubSeg(0, Infinity, "none")]);
  assert.deepEqual(modes(visibleSegments(traj, 0)), ["full"]);
});

test("visibility: past an encounter, patches ghost out to the patch limit", () => {
  const traj = stubTraj([
    stubSeg(0, 400, "soiEnter"),          // 400 s away, period 1000 → shown
    stubSeg(400, 800, "soiExit"),         // inside the encounter → ghost
    stubSeg(800, Infinity, "none"),       // back out — second ghost (default limit 2)
  ]);
  const list = visibleSegments(traj, 0);
  assert.deepEqual(modes(list), ["arc", "ghost", "ghost"]);
  assert.equal(list[1].seg.tStart, 400, "the first ghost is the entered segment");
});

test("visibility: the patch limit bounds how deep the ghosts go", () => {
  const segs = [
    stubSeg(0, 400, "soiEnter"),
    stubSeg(400, 800, "soiExit"),
    stubSeg(800, 1200, "soiEnter"),
    stubSeg(1200, 1600, "soiExit"),
    stubSeg(1600, Infinity, "none"),
  ];
  assert.deepEqual(modes(visibleSegments(stubTraj(segs), 0, 1)), ["arc", "ghost"]);
  assert.deepEqual(modes(visibleSegments(stubTraj(segs), 0, 3)), ["arc", "ghost", "ghost", "ghost"]);
  assert.deepEqual(modes(visibleSegments(stubTraj(segs), 0, 64)), ["arc", "ghost", "ghost", "ghost", "ghost"]);
});

test("visibility: a maneuver before an escape keeps the post-escape ghost", () => {
  const traj = stubTraj([
    stubSeg(0, 300, "node"),
    stubSeg(300, 900, "escape"),
    stubSeg(900, Infinity, "none"),
  ], [{ id: 1, t: 300, prograde: 10, radial: 0 }]);
  assert.deepEqual(modes(visibleSegments(traj, 0)), ["arc", "arc", "ghost"]);
});

test("visibility: an SOI exit ends the path like an encounter — one ghost, nothing after", () => {
  const traj = stubTraj([
    stubSeg(0, 400, "soiExit"),
    stubSeg(400, Infinity, "none"),
  ]);
  const list = visibleSegments(traj, 0);
  assert.deepEqual(modes(list), ["arc", "ghost"]);
  assert.equal(list[1].seg.tStart, 400, "the ghost is the post-exit orbit");
});

test("visibility: a root escape shows its continuation as a ghost; past it, the conic goes on forever", () => {
  const traj = stubTraj([stubSeg(0, 500, "escape", Infinity), stubSeg(500, Infinity, "none", Infinity)]);
  assert.deepEqual(modes(visibleSegments(traj, 0)), ["arc", "ghost"], "before: path to the marker, faint beyond");
  const after = visibleSegments(traj, 600); // clock past the escape
  assert.deepEqual(modes(after), ["full"], "after: just the outbound conic");
  assert.equal(after[0].seg.tStart, 500, "the walk moved past the escape segment");
});

test("visibility: a maneuver beyond an encounter extends the display through it", () => {
  // burn planned inside the encounter: entry (solid) → flyby up to the burn
  // (ghost) → the burn's altered patch (normal) → its exit → final ghost
  const traj = stubTraj([
    stubSeg(0, 300, "soiEnter"),
    stubSeg(300, 600, "node"),
    stubSeg(600, 900, "soiExit"),
    stubSeg(900, Infinity, "none"),
  ], [{ id: 1, t: 600, prograde: 10, radial: 0 }]);
  assert.deepEqual(modes(visibleSegments(traj, 0)), ["arc", "ghost", "arc", "ghost"]);
});

test("visibility: an executed maneuver does not extend the display", () => {
  const traj = stubTraj([
    stubSeg(0, 100, "node"),
    stubSeg(100, 400, "soiEnter"),
    stubSeg(400, Infinity, "none"),
  ], [{ id: 1, t: 100, prograde: 10, radial: 0 }]);
  assert.deepEqual(modes(visibleSegments(traj, 150)), ["arc", "ghost"]);
});

test("visibility: a ghost patch whose event is many orbits out ends the chain", () => {
  // a marker on a ghost should mean "this happens within about one orbit of
  // the patch" — a far event draws as a plain loop and nothing follows it
  const traj = stubTraj([
    stubSeg(0, 400, "soiEnter"),
    stubSeg(400, 99999, "soiExit"),      // ~98 orbits inside the patch
    stubSeg(99999, Infinity, "none"),
  ]);
  const list = visibleSegments(traj, 0);
  assert.deepEqual(modes(list), ["arc", "ghost"], "the far exit's patch is the last thing drawn");
});

test("visibility: a deviation more than one orbit away is hidden", () => {
  const traj = stubTraj([stubSeg(0, 5000, "soiEnter"), stubSeg(5000, Infinity, "none")]);
  const list = visibleSegments(traj, 0);
  assert.deepEqual(modes(list), ["ellipse"]);
  assert.equal(list.length, 1, "nothing after the loop is drawn");
});

test("visibility: hyperbolic segments have no 'one orbit' and always show", () => {
  const traj = stubTraj([stubSeg(0, 99999, "soiEnter", Infinity), stubSeg(99999, Infinity, "none")]);
  assert.deepEqual(modes(visibleSegments(traj, 0)), ["arc", "ghost"]);
});

test("visibility: a maneuver resets the anchor to its own time", () => {
  // encounter at 1200: >1 orbit from now (t=0), but only 0.9 orbits after the burn at 300
  const near = stubTraj([stubSeg(0, 300, "node"), stubSeg(300, 1200, "soiEnter"), stubSeg(1200, Infinity, "none")]);
  assert.deepEqual(modes(visibleSegments(near, 0)), ["arc", "arc", "ghost"]);
  // encounter at 1400: >1 orbit even from the burn → hidden
  const far = stubTraj([stubSeg(0, 300, "node"), stubSeg(300, 1400, "soiEnter"), stubSeg(1400, Infinity, "none")]);
  assert.deepEqual(modes(visibleSegments(far, 0)), ["arc", "ellipse"]);
});

test("visibility: the walk starts at the segment containing the clock", () => {
  const traj = stubTraj([
    stubSeg(0, 400, "soiEnter"),
    stubSeg(400, 800, "soiExit"),
    stubSeg(800, Infinity, "none"),
  ]);
  const list = visibleSegments(traj, 500);
  assert.equal(list[0].seg.tStart, 400, "past segments are skipped");
  assert.deepEqual(modes(list), ["arc", "ghost"]);
});

test("visibility regression: the near-resonant encounter chain hides until it's near", () => {
  // Same setup as the tryJump regression: after the survey extends, the Lume
  // encounter sits ~23 ship-orbits ahead — the map should show just the burn
  // and one closed orbit, not the patch spaghetti.
  const sys = gameSystem();
  const epoch = { body: "vesper", rx: 800, ry: 0, vx: 0, vy: vc(800) };
  const nodes = [{ id: 1, t: 1793, prograde: 820, radial: 0 }];
  const traj = compileTrajectory(sys, epoch, nodes, 60 * 86400);
  assert.ok(traj.segs.some((s) => s.endType === "soiEnter"), "the encounter is simulated");
  const list = visibleSegments(traj, 0);
  assert.deepEqual(modes(list), ["arc", "ellipse"], "but only burn + closed orbit are drawn");
  assert.equal(list[0].seg.endType, "node");
});

/* ---------------------------- adaptive curves ---------------------------- */

test("adaptiveCurve: a giant arc crossing the viewport is never pruned into a stray chord", () => {
  // A circle so large that, zoomed in, single spans dwarf the viewport. The
  // curve dips through the viewport while span endpoints AND midpoints sit far
  // off one side — a straight-segment out-code prune would replace the visible
  // arc with a chord (the floating-label bug). Every on-screen point of the
  // true curve must be near the returned polyline.
  const W = 1280, H = 720;
  const R = 2e6;
  const cx = W / 2, cy = H / 2 + R - 100; // arc grazes the viewport near its top
  const P = (u) => ({ x: cx + R * Math.cos(u), y: cy - R * Math.sin(u) });
  const pts = adaptiveCurve(P, 0, TAU, 24, W, H);
  const distToPolyline = (q) => {
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      const u = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.y - a.y) * dy) / len2));
      best = Math.min(best, Math.hypot(q.x - (a.x + dx * u), q.y - (a.y + dy * u)));
    }
    return best;
  };
  // the visible sliver of so large a circle subtends a tiny angle — sample
  // densely around the grazing point (u = π/2 is the topmost point)
  let checked = 0;
  for (let i = 0; i <= 20000; i++) {
    const q = P(Math.PI / 2 + 0.01 * (i / 10000 - 1));
    if (q.x < 0 || q.x > W || q.y < 0 || q.y > H) continue;
    checked++;
    assert.ok(distToPolyline(q) < 1.5, `on-screen curve point ${checked} is ${distToPolyline(q).toFixed(1)}px from the polyline`);
  }
  assert.ok(checked > 200, `the test arc actually crosses the viewport (${checked} points)`);
  // every emitted point carries its curve parameter, so hit-testing can share
  // this exact geometry (fixed-count samples once put clicks 400px off the line)
  assert.equal(pts[0].u, 0, "first point carries u");
  assert.equal(pts[pts.length - 1].u, TAU, "last point carries u");
  for (let i = 1; i < pts.length; i++) assert.ok(pts[i].u > pts[i - 1].u, "u is monotone");
});

test("display: paramTime inverts segParamRange back to segment times", () => {
  const sys = gameSystem();
  const epoch = { body: "vesper", rx: 800, ry: 0, vx: 0, vy: vc(800) * 1.3 };
  const traj = compileTrajectory(sys, epoch, [{ id: 1, t: 2000, prograde: 10, radial: 0 }], 1e6);
  const seg = traj.segs[0];
  const { u1, u2 } = segParamRange(seg);
  approx(paramTime(seg.orbit, u1), seg.tStart, 1e-6, "start time");
  approx(paramTime(seg.orbit, u2), seg.tEnd, 1e-6, "end time");
});

/* ------------------------------- sampling -------------------------------- */

test("sampling: conicPoint traces the true curve between segParamRange endpoints", () => {
  const sys = gameSystem();
  for (const [name, vy] of [["elliptic", vc(800) * 1.3], ["hyperbolic", vc(800) * 1.7]]) {
    const epoch = { body: "vesper", rx: 800, ry: 0, vx: 0, vy };
    const traj = compileTrajectory(sys, epoch, [{ id: 1, t: 2000, prograde: 10, radial: 0 }], 1e6);
    const seg = traj.segs[0]; // partial arc ending at the node
    const o = seg.orbit;
    const { u1, u2 } = segParamRange(seg);
    const start = conicPoint(o, u1), end = conicPoint(o, u2);
    const sAt = posVelAt(o, seg.tStart), eAt = posVelAt(o, seg.tEnd);
    approx(start.x, sAt.x, 1e-6, `${name} start x`);
    approx(start.y, sAt.y, 1e-6, `${name} start y`);
    approx(end.x, eAt.x, 1e-6, `${name} end x`);
    approx(end.y, eAt.y, 1e-6, `${name} end y`);
    // every intermediate parameter lies on the conic (focal radius formula)
    for (let i = 0; i <= 20; i++) {
      const u = u1 + (u2 - u1) * i / 20;
      const p = conicPoint(o, u);
      const expected = o.elliptic ? o.a * (1 - o.e * Math.cos(u)) : o.a * (1 - o.e * Math.cosh(u));
      approx(Math.hypot(p.x, p.y), expected, 1e-6, `${name} radius at u=${u.toFixed(3)}`);
    }
  }
});

test("sampling: unbounded hyperbolas draw out to a requested radius, never backwards", () => {
  const o = stateToOrbit(MU, 800, 0, 0, vc(800) * 1.7, 0);
  const seg = { orbit: o, tStart: 0, tEnd: Infinity };
  const far = segParamRange(seg, 5e5);
  approx(Math.hypot(conicPoint(o, far.u2).x, conicPoint(o, far.u2).y), 5e5, 1, "reaches the requested radius");
  // a segment starting beyond the draw radius must not produce an inverted range
  const tFar = paramTime(o, far.u2);
  const beyond = segParamRange({ orbit: o, tStart: tFar + 50000, tEnd: Infinity }, 5e5);
  assert.ok(beyond.u2 >= beyond.u1, "range never runs backwards into the past");
});

test("sampling: a full elliptic loop closes on itself", () => {
  const o = stateToOrbit(MU, 800, 0, 0, vc(800) * 1.3, 0);
  const { u1, u2 } = segParamRange({ orbit: o, tStart: 500, tEnd: Infinity });
  approx(u2 - u1, TAU, 1e-9, "spans one full turn");
  const a = conicPoint(o, u1), b = conicPoint(o, u2);
  approx(a.x, b.x, 1e-6, "closed in x");
  approx(a.y, b.y, 1e-6, "closed in y");
});

test("sampling: segment samples are time-ordered and end where the orbit says", () => {
  const sys = gameSystem();
  const epoch = { body: "vesper", rx: 800, ry: 0, vx: 0, vy: vc(800) * 1.25 };
  const traj = compileTrajectory(sys, epoch, [{ id: 1, t: 3000, prograde: 50, radial: 10 }], 50000);
  for (const seg of traj.segs) {
    const pts = sampleSeg(seg);
    for (let i = 1; i < pts.length; i++) {
      assert.ok(pts[i].t > pts[i - 1].t, "monotone time");
    }
    const first = posVelAt(seg.orbit, pts[0].t);
    approx(pts[0].x, first.x, 1e-6, "first sample on the orbit");
    if (Number.isFinite(seg.tEnd)) {
      approx(pts[pts.length - 1].t, seg.tEnd, 1e-6, "last sample at segment end");
    }
  }
});

/* --------------------------- relevant horizon ---------------------------- */

// a sun with a slow outer planet and a jupiter-like planet with a fast moon;
// the scan horizon must track what the ship's final orbit can actually meet,
// not the slowest body in the whole system (that made Jupiter-orbit maneuver
// drags recompute 140 years of moon scans per frame)
function horizonSystem() {
  return makeSystem({
    root: "sun",
    bodies: {
      sun: { name: "Sun", mu: 1.1723e9, radius: 261600 },
      earth: { name: "Earth", mu: 3531.6, radius: 600, parent: "sun", orbitRadius: 13599840, phase0: 0 },
      jupiter: { name: "Jupiter", mu: 282528, radius: 6000, parent: "sun", orbitRadius: 68773560, phase0: 2.4 },
      io: { name: "Io", mu: 1962, radius: 500, parent: "jupiter", orbitRadius: 27184, phase0: 0.5 },
      pluto: { name: "Pluto", mu: 74.41, radius: 210, parent: "sun", orbitRadius: 525000000, phase0: 2.8 },
    },
  });
}

test("relevantHorizon: a Jupiter orbit among the moons ignores Pluto", () => {
  const sys = horizonSystem();
  const rA = 1500000;
  const a = (rA + 60000) / 2;
  const vA = Math.sqrt(sys.bodies.jupiter.mu * (2 / rA - 1 / a));
  const epoch = { body: "jupiter", rx: rA, ry: 0, vx: 0, vy: vA };
  const traj = compileTrajectory(sys, epoch, [], 10 * 86400);
  const h = relevantHorizon(sys, traj);
  const last = traj.segs[traj.segs.length - 1];
  assert.ok(h >= 2 * last.orbit.period, "covers two revolutions of the ship");
  assert.ok(h < 0.01 * 2 * sys.bodies.pluto.period, "nowhere near the Pluto-sized horizon");
});

test("relevantHorizon: a solar orbit reaching only Earth scales with Earth, not Pluto", () => {
  const sys = horizonSystem();
  // circular-ish orbit at Earth's radius
  const r = 13599840;
  const v = Math.sqrt(sys.bodies.sun.mu / r);
  const traj = compileTrajectory(sys, { body: "sun", rx: r * 1.05, ry: 0, vx: 0, vy: v }, [], 86400);
  const h = relevantHorizon(sys, traj);
  assert.ok(h >= 2 * sys.bodies.earth.period, "covers two Earth years");
  assert.ok(h < 2 * sys.bodies.jupiter.period, "does not scale with unreachable planets");
});

test("relevantHorizon: a Pluto-crossing transfer does scale with Pluto", () => {
  const sys = horizonSystem();
  const r = 13599840;
  const vEsc = Math.sqrt(sys.bodies.sun.mu / r);
  // ellipse with apoapsis past Pluto
  const aT = (r + 530000000) / 2;
  const v = Math.sqrt(sys.bodies.sun.mu * (2 / r - 1 / aT));
  const traj = compileTrajectory(sys, { body: "sun", rx: r, ry: 0, vx: 0, vy: v }, [], 86400);
  const h = relevantHorizon(sys, traj);
  assert.ok(h >= 2 * sys.bodies.pluto.period, `covers Pluto encounters (got ${h}, vEsc ${vEsc})`);
});

test("events: a long-period orbit crossing a fast moon's shell still finds the encounter", () => {
  // the adaptive scan leaps while far from the shell (fixed fine steps made
  // these compiles take ~500ms); it must still catch the brief crossing
  const sys = horizonSystem();
  const muJ = sys.bodies.jupiter.mu;
  const rA = 2000000, rp = 20000, a = (rA + rp) / 2; // dips inside Io's orbit
  const epoch = { body: "jupiter", rx: rA, ry: 0, vx: 0, vy: Math.sqrt(muJ * (2 / rA - 1 / a)) };
  // scan many periapsis passes; Io must be met on one of them
  const traj = compileTrajectory(sys, epoch, [], 40 * sys.bodies.jupiter.period ?? 4e9);
  const enc = traj.segs.find((s) => s.endType === "soiEnter" && s.enterBody === "io");
  assert.ok(enc, "Io encounter found by the adaptive scan");
  const io = sys.bodies.io;
  const st = posVelAt(enc.orbit, enc.tEnd);
  const m = bodyStateAt(sys, "io", enc.tEnd);
  const jup = bodyStateAt(sys, "jupiter", enc.tEnd);
  approx(Math.hypot(st.x - (m.x - jup.x), st.y - (m.y - jup.y)), io.soi, 5, "right at Io's SOI");
});

test("closest approach: the marker is the NEXT true approach, never a window artifact", () => {
  // Mike's calls, combined: markers describe the upcoming pass (the first
  // local minimum of the distance), never a better pass beyond it, and never
  // a fake minimum at the edge of some scan window.
  const sys = gameSystem(5.0); // alignment completes on the second revolution
  const epoch = { body: "vesper", rx: 6000, ry: 0, vx: 0, vy: vc(6000) };
  const traj = compileTrajectory(sys, epoch, [], 400000);
  const shipP = traj.segs[0].orbit.period;
  const now = computeCA(sys, traj, "lume", 0);
  assert.ok(now.best, "an approach exists");
  // the gap closes monotonically all through revolution 1, so the next REAL
  // approach is the aligned pass early in revolution 2 — that's the marker
  approx(now.best.d, 6000, 50, "the aligned pass is the next approach");
  assert.ok(now.best.t > shipP && now.best.t < 1.5 * shipP, `just into revolution 2 (t=${now.best.t}, P=${shipP})`);
  // asked again after that pass, the NEXT approach (a synodic cycle on) is found
  const later = computeCA(sys, traj, "lume", now.best.t + 1000);
  assert.ok(later.best.t > now.best.t + 1000, "a later query finds the following pass");
  approx(later.best.d, 6000, 50, "same kiss geometry a cycle later");
});

/* --------------------------- elliptic body rails -------------------------- */

test("system: an eccentric body rides a real Kepler ellipse", () => {
  const sys = makeSystem({
    root: "sun",
    bodies: {
      sun: { name: "Sun", mu: 1.327e11, radius: 696000 },
      merc: { name: "Merc", mu: 22032, radius: 2440, parent: "sun", a: 57.9e6, e: 0.2056, longPeri: 1.35, M0: 0 },
    },
  });
  const m = sys.bodies.merc;
  // M0 = 0 puts it at perihelion, at distance a(1-e) along the periapsis direction
  const s0 = bodyRelStateAt(sys, "merc", 0);
  approx(Math.hypot(s0.x, s0.y), 57.9e6 * (1 - 0.2056), 1, "starts at perihelion distance");
  approx(Math.atan2(s0.y, s0.x), 1.35, 1e-9, "periapsis points along longPeri");
  // half a period later it is at aphelion
  const s1 = bodyRelStateAt(sys, "merc", m.period / 2);
  approx(Math.hypot(s1.x, s1.y), 57.9e6 * (1 + 0.2056), 5, "aphelion half a period later");
  // energy is the two-body value everywhere
  const t = m.period * 0.37;
  const s = bodyRelStateAt(sys, "merc", t);
  const en = (s.vx ** 2 + s.vy ** 2) / 2 - 1.327e11 / Math.hypot(s.x, s.y);
  approx(en, -1.327e11 / (2 * 57.9e6), Math.abs(en) * 1e-9, "vis-viva energy");
});

test("system: a retrograde body orbits the other way", () => {
  const sys = makeSystem({
    root: "nep",
    bodies: {
      nep: { name: "Nep", mu: 6.837e6, radius: 24622 },
      tri: { name: "Tri", mu: 1428, radius: 1353, parent: "nep", a: 354800, e: 0, M0: 0, retrograde: true },
    },
  });
  const s = bodyRelStateAt(sys, "tri", 1);
  assert.ok(s.x * s.vy - s.y * s.vx < 0, "negative angular momentum");
});

test("events: an encounter with an eccentric moon is still found", () => {
  const sys = makeSystem({
    root: "vesper",
    bodies: {
      vesper: { name: "Vesper", mu: MU, radius: 600 },
      lume: { name: "Lume", mu: 65.14, radius: 200, parent: "vesper", a: 12000, e: 0.25, longPeri: 0.8, M0: 2.2 },
    },
  });
  const lume = sys.bodies.lume;
  // ship on an ellipse spanning the moon's whole radial range
  const rp = 2000, ra = lume.raO + 3000, a = (rp + ra) / 2;
  const epoch = { body: "vesper", rx: rp, ry: 0, vx: 0, vy: Math.sqrt(MU * (2 / rp - 1 / a)) };
  const traj = compileTrajectory(sys, epoch, [], 40 * lume.period);
  const enc = traj.segs.find((s) => s.endType === "soiEnter" && s.enterBody === "lume");
  assert.ok(enc, "encounter found");
  const st = posVelAt(enc.orbit, enc.tEnd);
  const mrel = bodyRelStateAt(sys, "lume", enc.tEnd);
  approx(Math.hypot(st.x - mrel.x, st.y - mrel.y), lume.soi, 5, "right at the moving SOI boundary");
});

test("events: a brief crossing of a thin fast shell is not stepped over", () => {
  // real-scale danger: child period/300 can exceed the SOI crossing time —
  // the fine scan step must be capped by how long a crossing can last
  const sys = makeSystem({
    root: "sun",
    bodies: {
      sun: { name: "Sun", mu: 1.327e11, radius: 696000 },
      merc: { name: "Merc", mu: 22032, radius: 2440, parent: "sun", a: 57.9e6, e: 0, M0: 0 },
    },
  });
  const merc = sys.bodies.merc;
  // steep ellipse from deep inside out past Mercury: crossing its SOI is quick
  const rp = 10e6, ra = 70e6, a = (rp + ra) / 2;
  // aim the apoapsis pass at where Mercury will be
  const traj0 = compileTrajectory(sys, { body: "sun", rx: rp, ry: 0, vx: 0, vy: Math.sqrt(1.327e11 * (2 / rp - 1 / a)) }, [], 1);
  const o = traj0.segs[0].orbit;
  const nu = nuAtRadius(o, 57.9e6);
  const tCross = tAtNu(o, nu, 0);
  const mercAngleAtCross = merc.n * tCross;
  const shipAngle = Math.atan2(posVelAt(o, tCross).y, posVelAt(o, tCross).x);
  // re-phase Mercury so it sits at the crossing point at the crossing time
  const sys2 = makeSystem({
    root: "sun",
    bodies: {
      sun: { name: "Sun", mu: 1.327e11, radius: 696000 },
      merc: { name: "Merc", mu: 22032, radius: 2440, parent: "sun", a: 57.9e6, e: 0, M0: shipAngle - mercAngleAtCross },
    },
  });
  const traj = compileTrajectory(sys2, { body: "sun", rx: rp, ry: 0, vx: 0, vy: Math.sqrt(1.327e11 * (2 / rp - 1 / a)) }, [], tCross + 5e6);
  const enc = traj.segs.find((s) => s.endType === "soiEnter" && s.enterBody === "merc");
  assert.ok(enc, "the graze is caught");
  assert.ok(Math.abs(enc.tEnd - tCross) < 20000, `caught near the aimed pass (got ${enc.tEnd}, aimed ${tCross})`);
});

test("wrapForward: a time on a LATER revolution wraps down to the first valid pass", () => {
  // clicking the path just before an encounter resolved to a time one orbit
  // AFTER it (paramTime can hand back a later revolution) — warp overshot
  const o = { elliptic: true, period: 200 };
  assert.equal(wrapForward(340, 1, o, 150), 140, "wraps down to the pass inside the segment");
  assert.ok(wrapForward(340, 145, o, 150) <= 145, "no valid pass left -> a rejectable past time");
  assert.equal(wrapForward(340, 1, o, Infinity), 140, "unbounded segment still canonicalizes");
  assert.equal(wrapForward(300, 4500, o, Infinity), 4700, "past times still wrap forward to the first pass");
});

test("closest approach: a 0 m/s maneuver does not move the markers", () => {
  const sys = gameSystem(2.2);
  // elliptic orbit crossing the moon's radius
  const rp = 2000, ra = 15000, a = (rp + ra) / 2;
  const epoch = { body: "vesper", rx: rp, ry: 0, vx: 0, vy: Math.sqrt(MU * (2 / rp - 1 / a)) };
  const plain = compileTrajectory(sys, epoch, [], 3e6);
  const ca0 = computeCA(sys, plain, "lume", 0);
  assert.ok(ca0.best, "an approach exists");
  // a do-nothing node halfway to the approach must not change the physics or the marker
  const noded = compileTrajectory(sys, epoch, [{ id: 1, t: ca0.best.t / 2, prograde: 0, radial: 0 }], 3e6);
  const ca1 = computeCA(sys, noded, "lume", 0);
  assert.ok(ca1.best, "approach still found");
  approx(ca1.best.t, ca0.best.t, 2, "same moment");
  approx(ca1.best.d, ca0.best.d, 2, "same distance");
});

/* --------------------------------- 3D ---------------------------------- */

test("3D: an inclined state vector round-trips through the orbit", () => {
  // 45-degree inclined circular-ish orbit
  const r = 800, v = vc(800);
  const c = Math.SQRT1_2;
  const cases = [
    { name: "45deg circular", rx: r, ry: 0, rz: 0, vx: 0, vy: v * c, vz: v * c },
    { name: "tilted elliptic", rx: 500, ry: 300, rz: 400, vx: -1.1, vy: 1.4, vz: 0.4 },
    { name: "polar hyperbolic", rx: r, ry: 0, rz: 0, vx: 0.2, vy: 0, vz: v * 1.7 },
  ];
  for (const s of cases) {
    const o = stateToOrbit(MU, s.rx, s.ry, s.rz, s.vx, s.vy, s.vz, 77);
    const b = posVelAt(o, 77);
    approx(b.x, s.rx, 1e-6, `${s.name} x`);
    approx(b.y, s.ry, 1e-6, `${s.name} y`);
    approx(b.z, s.rz, 1e-6, `${s.name} z`);
    approx(b.vx, s.vx, 1e-6, `${s.name} vx`);
    approx(b.vy, s.vy, 1e-6, `${s.name} vy`);
    approx(b.vz, s.vz, 1e-6, `${s.name} vz`);
    // energy + angular momentum vector conserved along the orbit
    const t2 = 9000;
    const b2 = posVelAt(o, t2);
    const e1 = (s.vx ** 2 + s.vy ** 2 + s.vz ** 2) / 2 - MU / Math.hypot(s.rx, s.ry, s.rz);
    const e2 = (b2.vx ** 2 + b2.vy ** 2 + b2.vz ** 2) / 2 - MU / Math.hypot(b2.x, b2.y, b2.z);
    approx(e2, e1, Math.abs(e1) * 1e-9, `${s.name} energy`);
    const h1 = [s.ry * s.vz - s.rz * s.vy, s.rz * s.vx - s.rx * s.vz, s.rx * s.vy - s.ry * s.vx];
    const h2 = [b2.y * b2.vz - b2.z * b2.vy, b2.z * b2.vx - b2.x * b2.vz, b2.x * b2.vy - b2.y * b2.vx];
    for (let k = 0; k < 3; k++) approx(h2[k], h1[k], Math.abs(h1[k]) * 1e-8 + 1e-9, `${s.name} h[${k}]`);
  }
});

test("3D: body rails honor inclination and node", () => {
  const sys = makeSystem({
    root: "vesper",
    bodies: {
      vesper: { name: "Vesper", mu: MU, radius: 600 },
      lume: { name: "Lume", mu: 65.14, radius: 200, parent: "vesper", a: 12000, e: 0, i: Math.PI / 4, Omega: Math.PI / 2, M0: 0 },
    },
  });
  // Omega=90deg: ascending node along +y; at M0=0 (periapsis-less circle,
  // measured from the node) the body sits ON the node line: (0, 12000, 0)
  const s0 = bodyRelStateAt(sys, "lume", 0);
  approx(s0.x, 0, 1, "on the node line (x)");
  approx(s0.y, 12000, 1, "on the node line (y)");
  approx(s0.z, 0, 1, "on the node line (z)");
  // a quarter period later it is at max elevation: z = a*sin(i)
  const q = sys.bodies.lume.period / 4;
  const s1 = bodyRelStateAt(sys, "lume", q);
  approx(s1.z, 12000 * Math.sin(Math.PI / 4), 5, "max z at quarter orbit");
  approx(Math.hypot(s1.x, s1.y, s1.z), 12000, 1e-6, "still circular");
});

test("3D: a normal burn tilts the plane without changing the energy", () => {
  const sys = gameSystem();
  const epoch = { body: "vesper", rx: 800, ry: 0, vx: 0, vy: vc(800) };
  const traj = compileTrajectory(sys, epoch, [{ id: 1, t: 500, prograde: 0, radial: 0, normal: 300 }], 50000);
  const after = traj.segs[1].orbit;
  const before = traj.segs[0].orbit;
  approx(after.a, before.a * 1 + (after.a - before.a), 0, "sanity");
  // plane tilted: the new angular momentum direction is no longer +z
  assert.ok(Math.abs(after.wz) < 0.9999, `plane tilted (wz=${after.wz})`);
  // speed change is perpendicular to velocity -> semi-major axis grows only
  // by the tiny quadratic term, not the linear one a prograde burn gives
  const dvFrac = Math.abs(after.a - before.a) / before.a;
  assert.ok(dvFrac < 0.03, `energy nearly unchanged (da/a=${dvFrac})`);
  // continuity of position across the burn
  const a1 = posVelAt(before, 500), a2 = posVelAt(after, 500);
  approx(a2.x, a1.x, 1e-6, "position continuous (x)");
  approx(a2.z, a1.z, 1e-6, "position continuous (z)");
});

test("3D: an encounter with an inclined moon is found at the 3D boundary", () => {
  const sys = makeSystem({
    root: "vesper",
    bodies: {
      vesper: { name: "Vesper", mu: MU, radius: 600 },
      lume: { name: "Lume", mu: 65.14, radius: 200, parent: "vesper", a: 12000, e: 0, i: 0.15, Omega: 0.4, M0: 2.2 },
    },
  });
  const lume = sys.bodies.lume;
  // co-planar-with-ecliptic transfer ellipse crossing the moon's radius; the
  // moon's plane is only 0.15 rad off, so its SOI (2430 km) is still reachable
  const rp = 800, ra = 13000, a = (rp + ra) / 2;
  const epoch = { body: "vesper", rx: rp, ry: 0, vx: 0, vy: Math.sqrt(MU * (2 / rp - 1 / a)) };
  const traj = compileTrajectory(sys, epoch, [], 40 * lume.period);
  const enc = traj.segs.find((s) => s.endType === "soiEnter" && s.enterBody === "lume");
  assert.ok(enc, "encounter found");
  const st = posVelAt(enc.orbit, enc.tEnd);
  const m = bodyRelStateAt(sys, "lume", enc.tEnd);
  approx(Math.hypot(st.x - m.x, st.y - m.y, st.z - m.z), lume.soi, 5, "at the 3D SOI boundary");
  // and the handoff is continuous in 3D
  const dt = 0.5;
  const before = shipStateAt(sys, traj, enc.tEnd - dt);
  const after = shipStateAt(sys, traj, enc.tEnd + dt);
  approx(after.x, before.x, 10, "x continuous");
  approx(after.z ?? 0, before.z ?? 0, 10, "z continuous");
});
