import { test } from "node:test";
import assert from "node:assert/strict";
import { ladder, LEVELS } from "./levels.mjs";
import { loadLevel } from "./setup.mjs";
import { fromSlots, drive, toggleCoupling, switchLocked, throwSwitch, joints, goalMet, FOUL } from "./motion.mjs";

const setup = (start, layout = ladder(3, [3, 3])) => {
  const lv = loadLevel({ layout, start, goals: [] });
  return { yard: lv.yard, state: fromSlots(lv.yard, lv.state) };
};
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);

test("the loco stops exactly where it's driven to", () => {
  const { yard, state } = setup({ head: "L" });
  const s0 = state.at[0].s;
  const r = drive(yard, state, 0, 1, 0.37);
  near(r.moved, 0.37, "moved");
  near(state.at[0].s, s0 + 0.37, "position");
});

test("pushing moves an uncoupled car; backing off leaves it where it was pushed", () => {
  const { yard, state } = setup({ head: "L . A" });
  const a0 = state.at[1].s;
  drive(yard, state, 0, 1, 1.4); // 1 car of gap, then 0.4 of pushing
  near(state.at[1].s, a0 + 0.4, "A pushed");
  drive(yard, state, 0, -1, 0.8);
  near(state.at[1].s, a0 + 0.4, "A stays put");
});

test("coupled cars move rigidly both ways, across a switch", () => {
  const { yard, state } = setup({ head: "L A B" });
  state.sw[0] = 1;
  toggleCoupling(state, 0, 1); toggleCoupling(state, 1, 2);
  for (const [d, amt] of [[1, 2.3], [-1, 1.1], [1, 0.6]]) {
    drive(yard, state, 0, d, amt);
    assert.equal(joints(yard, state).length, 2, "still touching after each drive");
  }
});

test("buffers stop a train", () => {
  const { yard, state } = setup({ head: ". L" });
  const r = drive(yard, state, 0, -1, 5);
  near(r.moved, 1.15, "rolls until it touches the buffer");
  assert.equal(r.stop.why, "buffer");
});

test("a car on the points locks the switch; next to it doesn't", () => {
  const { yard, state } = setup({ head: ". . L" });
  assert.ok(!switchLocked(yard, state, 0));
  drive(yard, state, 0, 1, 0.3); // now overhangs the points
  assert.ok(switchLocked(yard, state, 0));
  assert.equal(throwSwitch(yard, state, 0), false);
  drive(yard, state, 0, 1, 1); // all the way onto the leg
  assert.ok(!switchLocked(yard, state, 0));
});

test("a car beside the points on one leg blocks the other leg at the points", () => {
  const { yard, state } = setup({ head: ". . L", s2: "A" });
  const r = drive(yard, state, 0, 1, 3);
  near(r.moved, 0, "can't enter s1");
  assert.equal(r.stop.why, "foul");
  const far = setup({ head: ". . L", s2: ". A" });
  near(drive(far.yard, far.state, 0, 1, 3).moved, 3, "fine once A is clear of the points");
  void FOUL;
});

test("every level's start is a legal position and not already solved", () => {
  for (const lv of LEVELS) {
    const { yard, cars, goals, state } = loadLevel(lv);
    assert.ok(!goalMet(yard, cars, goals, fromSlots(yard, state)), lv.name);
  }
});
