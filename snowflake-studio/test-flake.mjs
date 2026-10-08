import { test } from "node:test";
import assert from "node:assert/strict";
import { Flake, UP, DEG } from "./flake.js";

test("one arm becomes six", () => {
  const f = new Flake();
  const o = f.optionsAt(0, 0);
  assert.equal(o.length, 6);
  f.grow(0, 0, o.find(x => Math.abs(x.a - UP) < 1e-9), 100);
  assert.equal(f.images.length, 6);   // on the mirror line, so mirror adds nothing
});

test("a split off an arm is a mirrored pair on every arm", () => {
  const f = new Flake();
  f.grow(0, 0, f.optionsAt(0, 0)[0], 100);
  const tip = f.tips().find(t => Math.abs(t.x) < 1e-6 && t.y < 0);
  const opts = f.optionsAt(tip.x, tip.y);
  assert.equal(opts.length, 3);
  const side = opts.find(o => o.order === 1);
  f.grow(tip.x, tip.y, side, 40);
  assert.equal(f.images.length, 6 + 12);
});

test("branches touch but never cross", () => {
  const f = new Flake();
  f.grow(0, 0, f.optionsAt(0, 0)[0], 200);
  // sprout from partway up the arm, heading toward the next arm over
  const opts = f.optionsAt(0, -60);
  assert.equal(opts.length, 2);
  const [s] = f.grow(0, -60, opts[0], 1000);
  // meets its own copy coming off the next arm, on the mirror line between: an equilateral triangle
  assert.ok(Math.abs(Math.hypot(s.x2 - s.x1, s.y2 - s.y1) - 60) < 1e-6, String(Math.hypot(s.x2 - s.x1, s.y2 - s.y1)));
  for (const a of f.images) for (const b of f.images) if (a !== b) {
    // no proper crossings anywhere
    const d = (a.x2 - a.x1) * (b.y2 - b.y1) - (a.y2 - a.y1) * (b.x2 - b.x1);
    if (Math.abs(d) < 1e-9) continue;
    const t = ((b.x1 - a.x1) * (b.y2 - b.y1) - (b.y1 - a.y1) * (b.x2 - b.x1)) / d;
    const u = ((b.x1 - a.x1) * (a.y2 - a.y1) - (b.y1 - a.y1) * (a.x2 - a.x1)) / d;
    assert.ok(!(t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6), "crossing");
  }
});

test("no room at the plate's edge", () => {
  const f = new Flake({ R: 100 });
  const [s] = f.grow(0, 0, f.optionsAt(0, 0)[0], 500);
  assert.ok(Math.abs(Math.hypot(s.x2, s.y2) - 100) < 1e-6);
});

test("erase takes everything grown off a branch", () => {
  const f = new Flake();
  const [arm] = f.grow(0, 0, f.optionsAt(0, 0)[0], 100);
  const o = f.optionsAt(arm.x2, arm.y2);
  f.grow(arm.x2, arm.y2, o[1], 30);
  f.capAt(arm.x2 + Math.cos(o[1].a) * 30, arm.y2 + Math.sin(o[1].a) * 30, "hexagon", 6);
  assert.equal(f.caps.length, 1);
  f.erase(arm.id);
  assert.ok(f.empty);
});

test("mirror off pinwheels", () => {
  const f = new Flake({ mirror: false });
  const [arm] = f.grow(0, 0, f.optionsAt(0, 0)[0], 100);
  f.grow(arm.x2, arm.y2, f.optionsAt(arm.x2, arm.y2).find(o => o.order === 1), 30);
  assert.equal(f.images.length, 12);
});

test("split off a side branch makes a pair at that point, on every copy", () => {
  const f = new Flake();
  f.grow(0, 0, f.optionsAt(0, 0)[0], 150);
  const [side] = f.grow(0, -60, f.optionsAt(0, -60)[0], 40);
  const before = f.images.length;
  const base = Math.atan2(side.y2 - side.y1, side.x2 - side.x1);
  const made = f.split(side.x2, side.y2, base, 8);   // short of where one twin would be blocked
  assert.equal(made.length, 1);   // one branch, in a group of two twins
  assert.equal(f.images.length, before + 24);
  const three = f.trial(() => f.split(0, -150, UP, 20, true));
  assert.equal(three.length, 2);   // the pair (one branch; the arm's mirror is its twin) and straight on
  assert.equal(f.segs.length, 3);  // trial left nothing behind
});

test("twins from a split do everything together", () => {
  const f = new Flake();
  f.grow(0, 0, f.optionsAt(0, 0)[0], 150);
  const [side] = f.grow(0, -100, f.optionsAt(0, -100)[0], 20);
  const base = Math.atan2(side.y2 - side.y1, side.x2 - side.x1);
  const [pair] = f.split(side.x2, side.y2, base, 15);
  // one end of the pair, as drawn somewhere on the flake
  const img = f.images.find(s => s.id === pair.id);
  f.capAt(img.x2, img.y2, "hexagon", 4);
  assert.equal(f.capImages.length, 24);
  // growing one twin straight on grows the other too
  const before = f.images.length;
  f.grow(img.x2, img.y2, f.optionsAt(img.x2, img.y2).find(o => o.ahead), 10);
  assert.equal(f.images.length, before + 24);
});

test("pointing just past a junction picks the branch that carries on, not the one it grew from", () => {
  const f = new Flake();
  const [arm] = f.grow(0, 0, f.optionsAt(0, 0)[0], 100);
  const [ext] = f.grow(0, -100, f.optionsAt(0, -100).find(o => o.ahead), 10);
  // 3 units past the junction, 2.5 off to the side: the arm's end is about as close as the extension
  assert.equal(f.nearestSeg(2.5, -103, 14).id, ext.id);
  assert.equal(f.nearestSeg(2.5, -97, 14).id, arm.id);
});

test("when one twin is blocked, the other carries on alone past the shared part", () => {
  const f = new Flake();
  f.grow(0, 0, f.optionsAt(0, 0)[0], 150);
  const [side] = f.grow(0, -60, f.optionsAt(0, -60)[0], 40);
  const base = Math.atan2(side.y2 - side.y1, side.x2 - side.x1);
  // the twin turning back runs into its own copy off the next arm after 10; the other has room
  const made = f.split(side.x2, side.y2, base, 30);
  assert.equal(made.length, 2);
  const [shared, alone] = made;
  assert.ok(Math.abs(Math.hypot(shared.x2 - shared.x1, shared.y2 - shared.y1) - 10) < 1e-6);
  assert.equal(f.groups[shared.group].length, 2);   // both twins
  assert.equal(f.groups[alone.group].length, 1);    // just the one that could go on
  assert.ok(Math.abs(Math.hypot(alone.x2 - alone.x1, alone.y2 - alone.y1) - 20) < 1e-6);
  assert.equal(alone.parent, shared.id);            // erasing the shared part takes it too
});

test("a direction stays open while any clone can still grow that way", () => {
  const f = new Flake();
  f.grow(0, 0, f.optionsAt(0, 0)[0], 150);
  const [side] = f.grow(0, -60, f.optionsAt(0, -60)[0], 40);
  const base = Math.atan2(side.y2 - side.y1, side.x2 - side.x1);
  const [shared] = f.split(side.x2, side.y2, base, 10);   // both twins, the back-turning one now touching
  const tip = f.images.find(s => s.id === shared.id && s.y2 < s.y1 && Math.abs(s.x2 - s.x1) < 1e-6);
  const ahead = f.optionsAt(tip.x2, tip.y2).find(o => o.ahead);
  assert.ok(ahead, "the free twin can still be grown straight on");
  assert.ok(f.grow(tip.x2, tip.y2, ahead, 15).length);
});

test("a twin that stops by grazing another branch's tip lets the other carry on", () => {
  const f = new Flake();
  f.grow(0, 0, f.optionsAt(0, 0)[0], 200);
  const opt = f.optionsAt(0, -120).find(o => Math.cos(o.a) > 0);
  const [side] = f.grow(0, -120, opt, 48);
  const made = f.split(side.x2, side.y2, opt.a, 72);
  assert.ok(made.length >= 2, `made ${made.length}`);
  assert.equal(f.groups[made.at(-1).group].length, 1);
});

test("every branch point takes a cap: ends, junctions partway along a branch, and the center", () => {
  const f = new Flake();
  f.grow(0, 0, f.optionsAt(0, 0)[0], 100);
  f.split(0, -50, UP, 20);                       // a pair from partway up the arm
  for (const [x, y] of [[0, -100], [0, -50], [0, 0]]) {
    assert.ok(f.capAt(x, y, "hexagon", 5), `no cap at ${x},${y}`);
  }
  assert.equal(f.caps.length, 3);
});

test("erasing past a split partway along a branch takes only the stretch past it", () => {
  const f = new Flake();
  const [arm] = f.grow(0, 0, f.optionsAt(0, 0)[0], 120);
  f.split(0, -90, UP, 20);                       // a pair 90 up a 120-long arm
  const img = f.images.find(s => s.id === arm.id && Math.abs(s.x2) < 1e-6 && s.y2 < 0);
  const tail = f.erasePlan(img, 0, -110);        // pointing at the 30 past the split
  assert.ok(Math.abs(tail.cut - .75) < 1e-6);
  assert.equal(tail.segs.size, 0);               // the pair stays
  f.applyErase(tail);
  assert.ok(Math.abs(f.segs[0].y2 + 90) < 1e-6);
  assert.equal(f.segs.length, 2);
  const all = f.erasePlan(f.images.find(s => s.id === arm.id), 0, -40);   // below the split
  assert.equal(all.cut, null);
  f.applyErase(all);
  assert.ok(f.empty);
});
