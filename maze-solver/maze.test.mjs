// Logic tests for maze generation and the solvers. Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { generate, neighbors } from "./maze.mjs";
import { SOLVERS, bfs } from "./solvers.mjs";

const run = (gen) => { let last, steps = 0; for (const s of gen) { last = s; steps++; } return { last, steps }; };
const connected = (m, path) => path.every((c, i) => i === 0 || neighbors(m, path[i - 1]).includes(c));

test("a maze without loops is a tree: every cell reachable, one fewer passage than cells", () => {
  for (const style of ["corridors", "branchy"]) {
    const m = generate(30, 20, { style, seed: 3 });
    let edges = 0;
    for (let c = 0; c < 600; c++) edges += neighbors(m, c).length;
    assert.equal(edges / 2, 599, style);
    const seen = new Set([0]), q = [0];
    while (q.length) for (const n of neighbors(m, q.pop())) if (!seen.has(n)) { seen.add(n); q.push(n); }
    assert.equal(seen.size, 600, style);
  }
});

test("passages are open from both sides", () => {
  const m = generate(25, 18, { style: "branchy", loops: 0.5, seed: 9 });
  for (let c = 0; c < m.w * m.h; c++) for (const n of neighbors(m, c)) assert.ok(neighbors(m, n).includes(c));
});

test("loops add passages", () => {
  const count = (m) => { let e = 0; for (let c = 0; c < m.w * m.h; c++) e += neighbors(m, c).length; return e / 2; };
  assert.ok(count(generate(30, 20, { loops: 0.6, seed: 2 })) > count(generate(30, 20, { loops: 0, seed: 2 })) + 20);
});

test("every solver finds a connected path from start to goal", () => {
  for (const loops of [0, 0.4]) {
    const m = generate(24, 16, { style: "corridors", loops, seed: 5 });
    const start = 0, goal = m.w * m.h - 1;
    for (const [id, s] of Object.entries(SOLVERS)) {
      if (id === "wall" && loops) continue; // can circle an island forever with loops
      const { last } = run(s.run(m, start, goal));
      assert.ok(last.path, `${id} loops=${loops}`);
      assert.equal(last.path[0], start, id);
      assert.equal(last.path.at(-1), goal, id);
      assert.ok(connected(m, last.path), `${id} path is connected`);
    }
  }
});

test("BFS, A* and bidirectional BFS find shortest paths; greedy and DFS may not", () => {
  const m = generate(30, 20, { loops: 0.5, seed: 11 });
  const start = 0, goal = m.w * m.h - 1;
  const best = run(bfs(m, start, goal)).last.path.length;
  for (const id of ["astar", "bidirectional"]) assert.equal(run(SOLVERS[id].run(m, start, goal)).last.path.length, best, id);
  for (const id of ["greedy", "dfs"]) assert.ok(run(SOLVERS[id].run(m, start, goal)).last.path.length >= best, id);
});

test("A* looks at fewer cells than BFS when there are shortcuts", () => {
  const m = generate(40, 30, { loops: 0.8, seed: 4 });
  const start = 0, goal = m.w * m.h - 1;
  const looks = (g) => { let k = 0; for (const s of g) if (s.look !== undefined) k++; return k; };
  assert.ok(looks(SOLVERS.astar.run(m, start, goal)) < looks(bfs(m, start, goal)));
});
