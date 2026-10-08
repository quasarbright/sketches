import { test } from "node:test";
import assert from "node:assert/strict";
import { flip, sorted, isSorted, scramble, gaps, fewestFlips, greedyFlips, parFlips, starTargets, History, SolveTimer } from "./pancakes.mjs";

test("flip reverses the top k", () => {
  assert.deepEqual(flip([3, 1, 2, 4], 3), [2, 1, 3, 4]);
  assert.deepEqual(flip([1, 2, 3], 1), [1, 2, 3]);
});

test("sorted and isSorted agree", () => {
  assert.ok(isSorted(sorted(7)));
  assert.ok(!isSorted([2, 1, 3]));
});

test("gap count", () => {
  assert.equal(gaps(sorted(5)), 0);
  assert.equal(gaps([5, 4, 3, 2, 1]), 1); // only the bottom against the griddle
});

// brute-force breadth-first distances to check the search against
function bfs(n) {
  const key = (s) => s.join(",");
  const dist = new Map([[key(sorted(n)), 0]]);
  let frontier = [sorted(n)];
  while (frontier.length) {
    const next = [];
    for (const s of frontier) for (let k = 2; k <= n; k++) {
      const t = flip(s, k), kt = key(t);
      if (!dist.has(kt)) { dist.set(kt, dist.get(key(s)) + 1); next.push(t); }
    }
    frontier = next;
  }
  return dist;
}

test("fewestFlips matches breadth-first search on every stack of 6", () => {
  const dist = bfs(6);
  assert.equal(dist.size, 720);
  for (const [k, d] of dist) assert.equal(fewestFlips(k.split(",").map(Number)), d, k);
});

test("fewestFlips is quick at 12", () => {
  const t0 = Date.now();
  for (let i = 0; i < 10; i++) fewestFlips(scramble(12));
  assert.ok(Date.now() - t0 < 5000);
});

test("scramble never hands back a solved or one-flip stack", () => {
  for (let i = 0; i < 200; i++) {
    const s = scramble(4);
    assert.ok(fewestFlips(s) >= 2);
    assert.deepEqual(s.slice().sort((a, b) => a - b), sorted(4));
  }
});

test("greedy sorts, never beats the fewest, and takes at most 2n-3", () => {
  for (let i = 0; i < 200; i++) {
    const s = scramble(8), g = greedyFlips(s), f = fewestFlips(s);
    assert.ok(g >= f && g <= 2 * 8 - 3, `${s} greedy ${g} fewest ${f}`);
    assert.ok(parFlips(f, g) >= f && parFlips(f, g) <= g);
  }
  assert.equal(greedyFlips([2, 1, 3]), 1);
  assert.equal(greedyFlips([1, 3, 2]), 3);
});

test("star targets always differ", () => {
  assert.deepEqual(starTargets(4, 4), [6, 5, 4]); // all equal: +1 and +2
  assert.deepEqual(starTargets(4, 5), [6, 5, 4]); // par equals fewest
  assert.deepEqual(starTargets(10, 16), [16, 13, 10]); // far apart: unchanged
  assert.deepEqual(starTargets(10, 11), [12, 11, 10]);
});

test("history undo/redo", () => {
  const h = new History();
  h.record(3); h.record(5);
  assert.equal(h.undo(), 5);
  assert.equal(h.count, 1);
  assert.equal(h.redo(), 5);
  h.undo(); h.record(2);
  assert.ok(!h.canRedo);
  assert.deepEqual(h.flips, [3, 2]);
});

test("timer: armed, running on first flip, done when solved", () => {
  let now = 0;
  const t = new SolveTimer(() => now);
  assert.equal(t.state, "hidden");
  t.arm(); assert.equal(t.state, "armed");
  now = 100; t.turn(); now = 1600;
  assert.equal(t.ms, 1500);
  t.solved(); now = 9999;
  assert.equal(t.state, "done");
  assert.equal(t.ms, 1500);
});

test("timer: pausing stops the clock until resume", () => {
  let now = 0;
  const t = new SolveTimer(() => now);
  t.arm();
  t.pause(); assert.equal(t.state, "armed"); // nothing running to pause
  t.turn(); now = 1000; t.pause();
  assert.equal(t.state, "paused");
  now = 5000; assert.equal(t.ms, 1000);
  t.resume(); now = 5500;
  assert.equal(t.state, "running");
  assert.equal(t.ms, 1500);
});
