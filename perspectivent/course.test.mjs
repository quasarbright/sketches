// Mike, 2026-11-21: "some of the jumps are too far ... make sure it's possible within human
// tolerance". There's no real-time playtest here, so this runs the course in a copy of the game's
// walking physics (same constants, from course.mjs) with a simple player: hold forward toward the
// next platform and press jump somewhere 30-250 ms before the edge, at random, at 30, 60 and
// 144 fps with uneven frames. Every run has to reach the tower deck, at walking speed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PHYS, COURSE, TOWER } from "./course.mjs";

const boxes = [
  ...COURSE.map(({ x, z, w, top }) => ({ min: [x - w / 2, top - 0.5, z - w / 2], max: [x + w / 2, top, z + w / 2], x, z, w, top })),
  { min: [TOWER.x - TOWER.w / 2, 0, TOWER.z - TOWER.w / 2], max: [TOWER.x + TOWER.w / 2, TOWER.top - 0.5, TOWER.z + TOWER.w / 2] },
];
const deck = { min: [TOWER.x - TOWER.deckW / 2, TOWER.top - 0.5, TOWER.z - TOWER.deckW / 2],
  max: [TOWER.x + TOWER.deckW / 2, TOWER.top, TOWER.z + TOWER.deckW / 2], x: TOWER.x, z: TOWER.z, w: TOWER.deckW, top: TOWER.top };
boxes.push(deck);
const plats = [...boxes.slice(0, COURSE.length), deck];

// main.mjs's collide() and update() for walking, on plain arrays
function collide(ai, pos, vel) {
  const { RADIUS: r, HEIGHT: h } = PHYS;
  let hit = false;
  for (const c of boxes) {
    if (pos[0] + r <= c.min[0] || pos[0] - r >= c.max[0] || pos[1] + h <= c.min[1] || pos[1] >= c.max[1] ||
        pos[2] + r <= c.min[2] || pos[2] - r >= c.max[2]) continue;
    if (ai === 1) { if (vel[1] <= 0) { pos[1] = c.max[1]; hit = true; } else pos[1] = c.min[1] - h; vel[1] = 0; }
    else if (vel[ai] > 0) pos[ai] = c.min[ai] - r - 1e-4;
    else if (vel[ai] < 0) pos[ai] = c.max[ai] + r + 1e-4;
  }
  return hit;
}
function step(st, dt, dir, jump) {
  st.vel[0] = dir[0] * PHYS.WALK; st.vel[2] = dir[1] * PHYS.WALK;
  st.air = st.onGround ? 0 : st.air + dt;
  if (jump && st.air <= PHYS.COYOTE && st.vel[1] <= 0) { st.vel[1] = PHYS.JUMP_V; st.onGround = false; st.air = PHYS.COYOTE + 1; }
  st.vel[1] -= PHYS.G * dt;
  const p = st.pos;
  p[0] += st.vel[0] * dt; collide(0, p, st.vel);
  p[2] += st.vel[2] * dt; collide(2, p, st.vel);
  p[1] += st.vel[1] * dt;
  let g = collide(1, p, st.vel);
  if (p[1] <= 0) { p[1] = 0; st.vel[1] = Math.max(0, st.vel[1]); g = true; }
  st.onGround = g;
}
const toEdge = (p, d, b) => Math.min(...[0, 2].map((i, k) => Math.abs(d[k]) < 1e-9 ? Infinity
  : ((d[k] > 0 ? b.max[i] + PHYS.RADIUS : b.min[i] - PHYS.RADIUS) - p[i]) / d[k]));
// from the middle of platform a to platform b, pressing jump when a's edge is `e` m ahead
function leg(a, b, e, fps, rnd) {
  const st = { pos: [a.x, a.top, a.z], vel: [0, 0, 0], onGround: true, air: 0 };
  let pressed = false;
  for (let t = 0; t < 3;) {
    const dt = (1 / fps) * (0.7 + 0.6 * rnd());
    if (st.onGround && Math.abs(st.pos[1] - b.top) < 1e-6) return true;
    if (pressed && st.onGround && st.vel[1] <= 0 && t > 0.05 && Math.abs(st.pos[1] - a.top) > 1e-6) return false;
    let dx = b.x - st.pos[0], dz = b.z - st.pos[2]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const jump = toEdge(st.pos, [dx, dz], a) <= e || !st.onGround;
    pressed ||= jump;
    const over = Math.abs(st.pos[0] - b.x) < b.w / 2 - 0.3 && Math.abs(st.pos[2] - b.z) < b.w / 2 - 0.3;
    step(st, dt, over ? [0, 0] : [dx, dz], jump);
    t += dt;
  }
  return false;
}

test("every jump of the course works at walking speed with loose timing", () => {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (const fps of [30, 60, 144]) {
    for (let run = 0; run < 150; run++) {
      for (let i = 0; i + 1 < plats.length; i++) {
        const e = 0.15 + rnd() * 1.2; // 30-250 ms before the edge
        assert.ok(leg(plats[i], plats[i + 1], e, fps, rnd), `${fps} fps, run ${run}: jump ${i} -> ${i + 1} (pressed ${e.toFixed(2)} m early)`);
      }
    }
  }
});

test("a jump pressed a moment after walking off the edge still counts", () => {
  const rnd = () => 0.5;
  for (let i = 0; i + 1 < plats.length; i++) assert.ok(leg(plats[i], plats[i + 1], -0.3, 60, rnd), `late press, jump ${i}`);
});

test("each step is a small climb and no gap needs running", () => {
  for (let i = 0; i + 1 < plats.length; i++) {
    const a = plats[i], b = plats[i + 1];
    assert.ok(b.top - a.top <= 0.8 + 1e-9, `step ${i} climbs ${b.top - a.top}`);
    const gap = Math.hypot(b.x - a.x, b.z - a.z) - (a.w + b.w) / 2;
    assert.ok(gap <= 2.0, `gap ${i} is ${gap.toFixed(2)} m`);
  }
});

test("the game walks with these constants", () => {
  const MAIN = readFileSync(new URL("./main.mjs", import.meta.url), "utf8");
  assert.match(MAIN, /player\.vel\.y = PHYS\.JUMP_V/);
  assert.match(MAIN, /player\.vel\.y -= PHYS\.G \* dt/);
  assert.match(MAIN, /fast \? PHYS\.RUN : PHYS\.WALK/);
  assert.match(MAIN, /player\.air <= PHYS\.COYOTE/);
});
