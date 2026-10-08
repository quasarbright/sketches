import { test } from "node:test";
import assert from "node:assert/strict";
import { LEVELS, ladder } from "./levels.mjs";
import { loadLevel } from "./setup.mjs";
import { buildYard, drive, throwSwitch, toggleCoupling, solve, goalMet, switchLocked } from "./yard.mjs";

const level = (start, layout = ladder(3, [3, 3])) =>
  loadLevel({ layout, start, goals: [] });

test("tracks are cut into whole car lengths", () => {
  const y = buildYard(ladder(3, [5, 3, 3]));
  assert.equal(y.tracks.head.slots.length, 3);
  assert.equal(y.tracks.s1.slots.length, 5);
  assert.equal(y.tracks.s3.slots.length, 3);
});

test("a loco pushes whatever it touches but only pulls what's coupled", () => {
  const { yard, state } = level({ head: "L A B" });
  const [L, A, B] = [0, 1, 2];
  const before = state.pos.slice();
  assert.notEqual(drive(yard, state, L, 1), null);
  assert.deepEqual(state.pos, before.map((s) => s + 1)); // all three shifted along the head
  drive(yard, state, L, -1);
  assert.equal(state.pos[L], before[L]);
  assert.equal(state.pos[A], before[A] + 1); // left behind
  toggleCoupling(state, L, A);
  drive(yard, state, L, 1); // back up against A
  drive(yard, state, L, -1);
  assert.equal(state.pos[A], before[A]);
  assert.equal(state.pos[B], before[B] + 1); // not coupled to A
});

test("buffers stop a train", () => {
  const { yard, state } = level({ head: "L" });
  assert.equal(drive(yard, state, 0, -1), null);
});

test("trailing into a switch set the other way is blocked", () => {
  const { yard, state } = level({ s2: "L" });
  assert.equal(drive(yard, state, 0, -1), null);
  state.sw[0] = 1;
  assert.notEqual(drive(yard, state, 0, -1), null);
});

test("switches can't be thrown with cars across the points", () => {
  const { yard, state } = level({ head: ". . L", s1: "A" });
  assert.ok(switchLocked(yard, state, 0));
  assert.equal(throwSwitch(yard, state, 0), false);
  const free = level({ head: ". . L", s2: "A" });
  assert.ok(throwSwitch(free.yard, free.state, 0)); // A is on the other leg
});

test("every level's par is the solver's answer", () => {
  for (const lv of LEVELS) {
    if (lv.par == null || (lv.slowPar && !process.env.SLOW)) continue;
    const { yard, cars, goals, state } = loadLevel(lv);
    assert.ok(!goalMet(yard, cars, goals, state.pos), `${lv.name} starts solved`);
    assert.equal(solve(yard, cars, state, goals).moves, lv.par, lv.name);
  }
});
