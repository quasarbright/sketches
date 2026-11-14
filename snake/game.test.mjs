// Logic tests for the rules and the bot. Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { newGame, step, safeMoves, W, H, CELLS, UP, DOWN, LEFT, RIGHT, START_LENGTH } from "./game.mjs";
import { decide, pathTo, followPath, region, GAMBLE, LOOP_ROOM } from "./bot.mjs";
import { buildLoop, bodyInOrder, loopMove } from "./cycle.mjs";
import { withBoard, neighbors, dirTo } from "./game.mjs";

const at = (x, y) => y * W + x;
// a game in a given position: snake cells head first, heading `dir`
const pos = (snake, egg, dir = RIGHT, extra = {}) => ({ snake, egg, dir, seed: 7, alive: true, won: false, eaten: 0, steps: 0, sinceEat: 0, ...extra });
const row = (x0, x1, y) => { const out = []; for (let x = x0; x !== x1 + Math.sign(x1 - x0 || 1); x += Math.sign(x1 - x0 || 1)) out.push(at(x, y)); return out; };

test("a new game: a short snake heading right, an egg somewhere off it", () => {
  const g = newGame(1);
  assert.equal(g.snake.length, START_LENGTH);
  assert.equal(g.dir, RIGHT);
  assert.equal(g.snake[0] - g.snake[1], 1);
  assert.ok(g.egg >= 0 && !g.snake.includes(g.egg));
});

test("the same seed and moves replay the same game", () => {
  const moves = [RIGHT, DOWN, DOWN, LEFT, UP, UP, RIGHT, RIGHT];
  const run = () => moves.reduce((g, d) => step(g, d), newGame(42));
  assert.deepEqual(run(), run());
});

test("moving forward drops the tail; eating grows by one and places a new egg", () => {
  const g = pos([at(5, 5), at(4, 5), at(3, 5)], at(6, 5));
  const a = step(g, RIGHT);
  assert.deepEqual(a.snake, [at(6, 5), at(5, 5), at(4, 5), at(3, 5)]);
  assert.equal(a.eaten, 1);
  assert.equal(a.sinceEat, 0);
  assert.ok(a.egg >= 0 && !a.snake.includes(a.egg));
  const b = step(pos([at(5, 5), at(4, 5), at(3, 5)], at(0, 0)), UP);
  assert.deepEqual(b.snake, [at(5, 4), at(5, 5), at(4, 5)]);
  assert.equal(b.sinceEat, 1);
});

test("turning back into your neck keeps you going straight", () => {
  const g = step(pos([at(5, 5), at(4, 5), at(3, 5)], at(0, 0)), LEFT);
  assert.ok(g.alive);
  assert.equal(g.snake[0], at(6, 5));
  assert.equal(g.dir, RIGHT);
});

test("walls and your own body kill; the tail's cell is free unless you're eating", () => {
  assert.equal(step(pos([at(W - 1, 0), at(W - 2, 0)], at(5, 5)), RIGHT).alive, false);
  assert.equal(step(pos([at(0, 3), at(1, 3)], at(5, 5), LEFT), LEFT).alive, false);
  // a 2x2 loop: the head moves into where the tail is leaving
  const loop = [at(1, 1), at(1, 2), at(2, 2), at(2, 1)]; // head (1,1) heading up, tail (2,1)
  assert.equal(step(pos(loop, at(9, 9), UP), RIGHT).alive, true);
  // the same move into a body cell that isn't the tail
  const hook = [at(1, 1), at(1, 2), at(2, 2), at(2, 1), at(3, 1)];
  assert.equal(step(pos(hook, at(9, 9), UP), RIGHT).alive, false);
});

test("filling the board wins", () => {
  // a snake back and forth across every row but the top-left corner, with the egg there
  const snake = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const xx = y % 2 ? W - 1 - x : x;
    snake.push(at(xx, y));
  }
  const egg = snake.shift(); // the corner, right in front of the head at (1,0)
  const g = step(pos(snake, egg, LEFT), LEFT);
  assert.ok(g.alive && g.won);
  assert.equal(g.snake.length, CELLS);
  assert.equal(g.egg, -1);
});

test("paths go through body cells only once they've freed up", () => {
  // the head at (2,0) sealed in by its own body, which walks out of the way
  const snake = [at(2, 0), at(2, 1), at(1, 1), at(0, 1), at(0, 2), at(1, 2), at(2, 2), at(3, 2)];
  const p = pathTo(snake, at(3, 3));
  assert.ok(p, "a path exists once the tail end moves");
  const walk = followPath(snake, p.slice(0, -1), -1);
  assert.ok(new Set(walk).size === walk.length, "the path never runs into the body as it moves");
  // the plain board check agrees: every step of it is legal
  let g = pos(snake, at(3, 3), UP);
  for (const c of p) {
    const d = [UP, DOWN, LEFT, RIGHT].find((d) => step(g, d).snake?.[0] === c);
    g = step(g, d);
    assert.ok(g.alive);
  }
});

test("the bot takes a safe egg and turns down one that seals it in", () => {
  // open board: straight for the egg
  const open = pos([at(5, 5), at(4, 5), at(3, 5)], at(8, 5));
  const p = decide(open);
  assert.equal(p.kind, "egg");
  assert.equal(p.dir, RIGHT);

  // the egg at the end of a one-wide corridor between the body (row 1) and the top wall. The body
  // runs on down the left edge, so it's still there when the head arrives: after eating, the
  // head is in the corner with nowhere to go.
  const snake = [at(15, 0), ...row(15, 0, 1)];
  for (let y = 2; y < H; y++) snake.push(at(0, y));
  const g = pos(snake, at(0, 0), UP);
  const t = decide(g);
  assert.equal(t.path.length, 15, "it finds the path along the corridor");
  assert.notEqual(t.kind, "egg");
  assert.equal(t.trapped.length, 0, "and sees that the copy is stuck in the corner");
  assert.equal(t.kind, "tail");
  assert.equal(t.dir, RIGHT);
});

test("the bot never dies while a move would keep it alive", () => {
  let g = newGame(3);
  for (let i = 0; i < 3000 && g.alive && !g.won; i++) {
    const p = decide(g);
    const next = step(g, p.dir);
    if (!next.alive) assert.equal(safeMoves(g).length, 0, `step ${g.steps}: died with a way out`);
    g = next;
  }
});

test("region counts the open cells the head can reach", () => {
  // the head at (0,2) under a wall of body across row 1: it reaches every other cell below the
  // wall, and none of the top row
  assert.equal(region([at(0, 2), ...row(0, W - 1, 1)]).length, CELLS - 2 * W - 1);
});

test("the loop goes through every cell once, with the body in order along it", () => {
  withBoard(12, 8, () => {
    const a = (x, y) => y * 12 + x;
    const snake = [a(5, 4), a(4, 4), a(3, 4), a(3, 3), a(3, 2), a(4, 2), a(5, 2), a(6, 2), a(7, 2), a(8, 2), a(8, 3), a(8, 4), a(8, 5), a(7, 5)];
    let loop = null;
    for (let sd = 1; !loop && sd < 20; sd++) loop = buildLoop(snake, sd);
    assert.ok(loop, "built one");
    assert.equal(new Set(loop.order).size, 96);
    loop.order.forEach((c, i) => assert.ok(neighbors(c).includes(loop.order[(i + 1) % 96]), `step ${i} is to a neighbor`));
    assert.ok(bodyInOrder(loop, snake));
    // following it with shortcuts fills the board without dying
    let g = { snake, egg: a(10, 6), dir: LEFT, seed: 3, alive: true, won: false, eaten: 0, steps: 0, sinceEat: 0 };
    while (g.alive && !g.won && g.steps < 20000) {
      g = step(g, dirTo(g.snake[0], loopMove(loop, g.snake, g.egg, LOOP_ROOM)));
      if (g.alive && !g.won) assert.ok(bodyInOrder(loop, g.snake), `body in order at step ${g.steps}`);
    }
    assert.ok(g.won, "it fills the board");
  });
});

test("a whole game fills the board", { timeout: 60000 }, () => {
  let g = newGame(5);
  while (g.alive && !g.won && g.sinceEat <= (GAMBLE + 1) * CELLS) g = step(g, decide(g).dir);
  assert.ok(g.won, `filled ${g.snake.length} of ${CELLS}`);
});
