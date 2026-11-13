// Logic tests: the JS port against outputs recorded from Mike's original Python
// (reference/reference.json, made by reference/make_reference.py). The Python repo has no
// tests of its own. Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PyRandom, hashFloat } from "./pyrandom.mjs";
import {
  newGame, move, slide, slideTrace, isDead, score, scoreParts, legalMoves, sameBoard,
  SNAKE_PATHS, DIRECTIONS, LEFT, RIGHT, UP, DOWN,
} from "./game.mjs";
import { chooseAction } from "./minimax.mjs";

const ref = JSON.parse(readFileSync(new URL("./reference/reference.json", import.meta.url)));

test("hash(float) matches CPython", () => {
  // values printed by python3: hash(x)
  assert.equal(hashFloat(0.5), 1152921504606846976n);
  assert.equal(hashFloat(3.7341), 1692719353063773187n);
  assert.equal(hashFloat(7.0), 7n);
  assert.equal(hashFloat(1e-300), 482449582752280463n);
});

test("Mersenne Twister seeded with a float matches CPython", () => {
  // python3: r = random.Random(); r.seed(0.123456789); r.getrandbits(32), r.choice(range(13)), r.randint(1, 10), r.random()
  const r = new PyRandom(0.123456789);
  assert.equal(r.getrandbits(32), 3852664718);
  assert.equal(r.choice([...Array(13).keys()]), 11);
  assert.equal(r.randint(1, 10), 9);
  assert.equal(r.random(), 0.3998446766453875);
});

test("snake paths: 8 distinct Hamiltonian snakes", () => {
  assert.equal(SNAKE_PATHS.length, 8);
  for (const p of SNAKE_PATHS) {
    assert.equal(new Set(p).size, 16);
    for (let i = 1; i < 16; i++) {
      const a = p[i - 1], b = p[i];
      assert.equal(Math.abs((a % 4) - (b % 4)) + Math.abs(Math.floor(a / 4) - Math.floor(b / 4)), 1);
    }
  }
});

test("opening boards match the Python for the same seed", () => {
  for (const o of ref.openings) assert.deepEqual(newGame(o.seed).board, o.board);
});

test("random playouts: every move's board and seed match the Python", () => {
  for (const p of ref.playouts) {
    let g = { board: p.start.board, seed: p.start.seed };
    for (const s of p.steps) {
      g = move(g, s.dir);
      assert.deepEqual(g.board, s.board);
      assert.equal(g.seed, s.seed);
    }
    assert.equal(isDead(g.board), p.dead);
  }
});

test("slideTrace gives the same board as slide, and moves every tile", () => {
  for (const p of ref.playouts) for (const s of p.steps) for (const d of DIRECTIONS) {
    const t = slideTrace(s.board, d);
    assert.deepEqual(t.board, slide(s.board, d));
    const from = t.moves.map((m) => m.from).sort((a, b) => a - b);
    const tiles = s.board.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    assert.deepEqual(from, tiles);
  }
});

test("merges pair up from the front of the line, whichever way you move (as in the Python)", () => {
  const b = [2, 2, 2, 0, ...new Array(12).fill(0)];
  assert.deepEqual(slide(b, RIGHT).slice(0, 4), [0, 0, 4, 2]);
  assert.deepEqual(slide(b, LEFT).slice(0, 4), [4, 2, 0, 0]);
  const c = [4, 4, 4, 4, ...new Array(12).fill(0)];
  assert.deepEqual(slide(c, RIGHT).slice(0, 4), [0, 0, 8, 8]);
  const col = new Array(16).fill(0); col[0] = 2; col[4] = 2; col[8] = 2;
  assert.deepEqual([0, 4, 8, 12].map((i) => slide(col, DOWN)[i]), [0, 0, 4, 2]);
  assert.deepEqual([0, 4, 8, 12].map((i) => slide(col, UP)[i]), [4, 2, 0, 0]);
});

test("a move that changes nothing keeps the seed and spawns nothing", () => {
  const g = { board: [2, 4, 8, 16, ...new Array(12).fill(0)], seed: 0.25 };
  const after = move(g, UP);
  assert.equal(after.seed, 0.25);
  assert.ok(sameBoard(after.board, g.board));
  assert.ok(!legalMoves(g).includes(UP));
});

test("board scores match the Python exactly", () => {
  for (const s of ref.scores) {
    assert.equal(score(s.board), s.score);
    assert.equal(scoreParts(s.board).score, s.score);
    assert.equal(isDead(s.board), s.dead);
  }
});

test("root move values match the Python at depths 0-3 and 5", () => {
  let n = 0;
  for (const s of ref.searches) {
    const r = chooseAction({ board: s.board, seed: s.seed }, s.depth, { shuffle: false });
    assert.deepEqual(Object.keys(r.values).sort(), Object.keys(s.values).sort());
    for (const [a, v] of Object.entries(s.values)) assert.equal(r.values[a], v, `depth ${s.depth} ${a}`);
    n++;
  }
  assert.ok(n > 50);
});

test("whole AI games replay move for move (root ties in UP, DOWN, LEFT, RIGHT order)", () => {
  for (const ag of ref.aiGames) {
    let g = { board: ag.start.board, seed: ag.start.seed };
    ag.moves.forEach((expected, i) => {
      const r = chooseAction(g, ag.depth, { shuffle: false });
      assert.equal(r.move, expected, `depth ${ag.depth}, move ${i}`);
      g = move(g, r.move);
    });
    assert.deepEqual(g.board, ag.final.board);
    assert.equal(g.seed, ag.final.seed);
  }
});

test("with shuffling on, the chosen move is always one of the best", () => {
  const s = ref.searches.find((x) => x.depth === 2);
  for (let i = 0; i < 20; i++) {
    const r = chooseAction({ board: s.board, seed: s.seed }, 2);
    const best = Math.max(...Object.values(r.values));
    assert.equal(r.values[r.move], best);
  }
});
