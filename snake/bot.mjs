// The bot: tail-check greedy. Every step:
//   1. find the shortest path to the egg
//   2. send a copy of the snake along it; after the copy eats, can it still reach its own tail?
//      if so, take the first step of that path
//   3. otherwise follow the tail, taking the longest way round so the body has time to move
//   4. if even the tail is out of reach, take the move with the most open cells
// Following your tail is always safe: the tail leaves its cell every step, so a snake that can
// reach its tail can keep chasing it forever.
// Once the board is mostly full it switches to a loop through every cell that its body lies along
// in order (cycle.mjs), and follows that, with safe shortcuts, to the end of the game.
import { CELLS, DIRECTIONS, OPPOSITE, neighbors, stepCell, dirTo, step, rand } from "./game.mjs";
import { buildLoop, bodyInOrder, loopMove, loopAhead } from "./cycle.mjs";

export const LOOP_FREE = +(globalThis.process?.env?.LOOP_FREE ?? 250); // switch to the loop once this few cells are free
const RETRY = 128; // after failing to build a loop, steps before trying again (or the next egg)
let failedAt = -1, failedEaten = -1;
export const LOOP_ROOM = +(globalThis.process?.env?.ROOM ?? 3); // shortcuts land at least this far short of the tail
let loop = null; // the loop it's following, if any; checked against the snake every step

export const RESHUFFLE = CELLS; // steps without eating before the tail chase starts picking at random
export const GAMBLE = +(globalThis.process?.env?.GAMBLE ?? 3 * CELLS); // ...and before it goes for the egg anyway

// When each cell of the snake's body frees up: the cell at index i (head = 0) of a snake of
// length L is gone after L - i steps, so a path may enter it on step d when d >= L - i.
function freeAfter(snake) {
  const t = new Int32Array(CELLS);
  const L = snake.length;
  for (let i = 0; i < L; i++) t[snake[i]] = L - i;
  return t;
}

// Shortest path from the head to `goal` (a cell), treating each body cell as a wall until the
// step it frees up. Returns the cells after the head, or null. A cell turned away early can still
// be entered later from another side, so cells are only marked when entered. `avoid` is a cell
// to stay off: the egg, when chasing the tail, since eating on the way grows the snake and the
// tail stops for a step.
export function pathTo(snake, goal, avoid = -1) {
  const head = snake[0], free = freeAfter(snake);
  const prev = new Int32Array(CELLS).fill(-2);
  prev[head] = -1;
  let frontier = [head], d = 0;
  while (frontier.length) {
    d++;
    const next = [];
    for (const c of frontier) {
      for (const n of neighbors(c)) {
        if (prev[n] !== -2 || d < free[n] || n === avoid) continue;
        prev[n] = c;
        if (n === goal) {
          const path = [];
          for (let k = n; k !== head; k = prev[k]) path.push(k);
          return path.reverse();
        }
        next.push(n);
      }
    }
    frontier = next;
  }
  return null;
}

// the snake after following `path` (cells after the head), eating the egg at its end
export function followPath(snake, path, egg) {
  let s = snake.slice();
  for (const c of path) {
    s.unshift(c);
    if (c !== egg) s.pop();
  }
  return s;
}

// cells reachable from the head through cells the body doesn't cover right now
export function region(snake) {
  const blocked = new Uint8Array(CELLS);
  for (const c of snake) blocked[c] = 1;
  const seen = [], stack = [snake[0]];
  const mark = new Uint8Array(CELLS);
  mark[snake[0]] = 1;
  while (stack.length) {
    const c = stack.pop();
    for (const n of neighbors(c)) if (!mark[n] && !blocked[n]) { mark[n] = 1; seen.push(n); stack.push(n); }
  }
  return seen;
}

const tailPath = (snake, egg = -1) => pathTo(snake, snake[snake.length - 1], egg);

// Steps 1 and 2 for one state: the path to the egg, the copy after eating, and whether the copy
// can still reach its tail (or has filled the board).
function eggCheck(game) {
  if (game.egg < 0) return null;
  const path = pathTo(game.snake, game.egg);
  if (!path) return null;
  const ghost = followPath(game.snake, path, game.egg);
  return { path, ghost, ok: ghost.length >= CELLS || !!tailPath(ghost) };
}

// the moves after which the snake can still reach its tail without eating, with that path
function tailMoves(game) {
  const out = [];
  for (const d of DIRECTIONS) {
    if (d === OPPOSITE[game.dir]) continue;
    const next = step(game, d);
    if (!next.alive || next.eaten > game.eaten) continue; // eating here is what step 2 ruled out
    const p = tailPath(next.snake, next.egg);
    if (p) out.push({ d, next, p });
  }
  return out;
}

// Returns the move and what the bot was thinking, for drawing:
//   kind: "egg" | "loop" | "toloop" | "gamble" | "tail" | "room" | "stuck"
//   path: the path to the egg (cells after the head), or null if the egg can't be reached
//   ghost: the copy of the snake after eating, when there was a path
//   trapped: the cells the copy could still reach, when it couldn't reach its tail
//   chase: the path to the tail, in "tail" mode
//   loop: the cells ahead on the loop up to the egg, and loopOrder the whole loop, in "loop" mode
export function decide(game, { useLoop = true } = {}) {
  const { snake } = game;
  const plan = { dir: game.dir, kind: "stuck", path: null, ghost: null, trapped: null, chase: null, loop: null };

  // 0: near the end, the loop. Keep the one it has while the body is still in order along it
  // (it always is, once it's following it); otherwise build one, with a few tries.
  if (useLoop && CELLS - snake.length <= LOOP_FREE) {
    if (!bodyInOrder(loop, snake)) {
      loop = null;
      // building costs a few ms, so after a failure wait for the next egg or RETRY steps
      const waiting = game.steps >= failedAt && game.steps - failedAt < RETRY && game.eaten === failedEaten;
      if (!waiting) loop = buildLoop(snake, game.steps + 1);
      if (!loop && !waiting) { failedAt = game.steps; failedEaten = game.eaten; }
    }
    if (loop) {
      const n = loopMove(loop, snake, game.egg, LOOP_ROOM);
      if (n >= 0) return { ...plan, kind: "loop", dir: dirTo(snake[0], n), loop: loopAhead(loop, snake, game.egg), loopOrder: loop.order };
    }
  }

  // 1 and 2: the egg, if eating it leaves a way out
  const e = eggCheck(game);
  if (e) {
    plan.path = e.path;
    plan.ghost = e.ghost;
    if (e.ok) {
      plan.kind = "egg";
      plan.dir = dirTo(snake[0], e.path[0]);
      return plan;
    }
    plan.trapped = region(e.ghost);
  }

  // 2b: it has gone round long enough that waiting isn't going to make the egg safe: go for it
  // anyway. Sometimes the body moves out of the way in time; if not, the game ends.
  if (e && game.sinceEat > GAMBLE) {
    plan.kind = "gamble";
    plan.dir = dirTo(snake[0], e.path[0]);
    return plan;
  }

  // 3: chase the tail, the long way round: of the moves after which the tail is still
  // reachable, take the one with the longest path to it.
  const safe = tailMoves(game);
  let best = null;
  for (const o of safe) if (!best || o.p.length > best.p.length) best = o;
  // Going round the long way can settle into a loop that repeats forever without the egg ever
  // becoming safe. After a while without eating, pick any safe move at random (seeded from the
  // game, so a game replays the same way) to change the body's shape.
  if (safe.length > 1 && game.sinceEat > RESHUFFLE) {
    const [r] = rand((game.seed ^ Math.imul(game.steps, 0x9e3779b1)) >>> 0);
    best = safe[Math.floor(r * safe.length)];
  }
  if (best) {
    plan.kind = "tail";
    plan.dir = best.d;
    plan.chase = [best.next.snake[0], ...best.p];
    return plan;
  }

  // 4: no way to the tail: the move that leaves the most room
  let roomiest = null;
  for (const d of DIRECTIONS) {
    if (d === OPPOSITE[game.dir]) continue;
    const next = step(game, d);
    if (!next.alive) continue;
    const n = region(next.snake).length + 1;
    if (!roomiest || n > roomiest.n) roomiest = { d, n };
  }
  if (roomiest) { plan.kind = "room"; plan.dir = roomiest.d; }
  return plan;
}
