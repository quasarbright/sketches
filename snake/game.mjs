// Snake rules as pure functions, so the bot can run copies of the game.
//
// A cell is an index y * W + x. The snake is an array of cells, head first. The game is
// deterministic: the egg's next spot comes from a seeded generator stored in the state, so a
// seed and a list of moves replay the same game.

export let W = 20, H = 20, CELLS = W * H;

// Sets the board size for good (the background mode fits the board to the screen).
export function setBoard(w, h) { W = w; H = h; CELLS = w * h; }

// Runs fn on a board of another size (the about modal's small diagrams use the real rules this
// way), then puts the size back.
export function withBoard(w, h, fn) {
  const saved = [W, H];
  W = w; H = h; CELLS = w * h;
  try { return fn(); } finally { [W, H] = saved; CELLS = W * H; }
}
export const UP = "UP", DOWN = "DOWN", LEFT = "LEFT", RIGHT = "RIGHT";
export const DIRECTIONS = [UP, RIGHT, DOWN, LEFT];
export const DELTA = { UP: [0, -1], DOWN: [0, 1], LEFT: [-1, 0], RIGHT: [1, 0] };
export const OPPOSITE = { UP: DOWN, DOWN: UP, LEFT: RIGHT, RIGHT: LEFT };
export const START_LENGTH = 3;

export const xy = (c) => [c % W, Math.floor(c / W)];

// the cell one step from c, or -1 off the board
export function stepCell(c, dir) {
  const x = (c % W) + DELTA[dir][0], y = Math.floor(c / W) + DELTA[dir][1];
  return x < 0 || y < 0 || x >= W || y >= H ? -1 : y * W + x;
}

export function neighbors(c) {
  const out = [];
  for (const d of DIRECTIONS) { const n = stepCell(c, d); if (n >= 0) out.push(n); }
  return out;
}

// the direction from cell a to the neighboring cell b
export function dirTo(a, b) {
  for (const d of DIRECTIONS) if (stepCell(a, d) === b) return d;
  return null;
}

// mulberry32: one 32-bit state, returns [value in [0, 1), next state]
export function rand(seed) {
  let t = (seed + 0x6d2b79f5) | 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return [((r ^ (r >>> 14)) >>> 0) / 4294967296, t];
}

// a uniformly random free cell, or -1 when the snake fills the board
function placeEgg(snake, seed) {
  const taken = new Uint8Array(CELLS);
  for (const c of snake) taken[c] = 1;
  const free = CELLS - snake.length;
  if (free <= 0) return [-1, seed];
  const [r, next] = rand(seed);
  let k = Math.floor(r * free);
  for (let c = 0; c < CELLS; c++) if (!taken[c] && k-- === 0) return [c, next];
  return [-1, next];
}

export function newGame(seed = (Math.random() * 2 ** 32) >>> 0) {
  const y = Math.floor(H / 2), x = Math.floor(W / 2) - 3;
  const snake = [];
  for (let i = 0; i < START_LENGTH; i++) snake.push(y * W + x + START_LENGTH - 1 - i); // heading right
  const [egg, next] = placeEgg(snake, seed >>> 0);
  return { snake, dir: RIGHT, egg, seed: next, alive: true, won: false, eaten: 0, steps: 0, sinceEat: 0 };
}

// Turning straight back into your neck isn't a move; the snake keeps going the way it was.
export function effectiveDir(game, dir) {
  return dir && dir !== OPPOSITE[game.dir] ? dir : game.dir;
}

// One step. Returns the new state; game.alive false means it hit a wall or itself.
// The tail leaves its cell on the same step, so moving into the tail is fine unless this step
// eats (then the snake grows and the tail stays put).
export function step(game, dir) {
  if (!game.alive || game.won) return game;
  dir = effectiveDir(game, dir);
  const head = stepCell(game.snake[0], dir);
  const eats = head === game.egg;
  const body = eats ? game.snake : game.snake.slice(0, -1);
  const dead = head < 0 || body.includes(head);
  if (dead) return { ...game, dir, alive: false, steps: game.steps + 1, hit: head };
  const snake = [head, ...body];
  let egg = game.egg, seed = game.seed;
  if (eats) [egg, seed] = placeEgg(snake, seed);
  return {
    snake, dir, egg, seed, alive: true, won: egg < 0, steps: game.steps + 1,
    eaten: game.eaten + (eats ? 1 : 0), sinceEat: eats ? 0 : game.sinceEat + 1,
  };
}

// moves that don't die right away
export function safeMoves(game) {
  return DIRECTIONS.filter((d) => d !== OPPOSITE[game.dir] && step(game, d).alive);
}
