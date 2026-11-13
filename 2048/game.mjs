// The 2048 rules and the AI's board score, ported line for line from Mike's 2020 Python
// (quasarbright/2048, game.py). Comments marked "Python:" point at the original.
//
// A game is { board, seed }:
//   board: 16 ints, row-major, board[y * 4 + x] (Python: numpy board[y][x]), 0 = empty
//   seed:  a float. Every tile spawn reseeds Python's Mersenne Twister with it, so where the
//          next tile lands is decided by the board and the seed alone. A move that changes the
//          board adds 1 to the seed, then spawns. This is what lets the AI "know" the future.

import { PyRandom, freshSeed } from "./pyrandom.mjs";

export const UP = "UP", DOWN = "DOWN", LEFT = "LEFT", RIGHT = "RIGHT";
export const DIRECTIONS = [UP, DOWN, LEFT, RIGHT]; // Python: directions (this order matters)
export const SIZE = 4;

const rng = new PyRandom();

// Python: allPositions = [Vector(x, y) for x in range(4) for y in range(4)]
// x outer, y inner, so free cells are listed column by column. As cell indices:
const ALL_POSITIONS = [];
for (let x = 0; x < SIZE; x++) for (let y = 0; y < SIZE; y++) ALL_POSITIONS.push(y * SIZE + x);

// ---------- snake paths (Python: snakeVectors / snakePaths) ----------
// One snaking Hamiltonian path through the grid, then its images under reversal, transpose,
// and the two reflections, with duplicates removed (reversing a snake is the same as
// reflecting it, so 8 paths are left, one per symmetry of the square), as lists of cell indices.
//   >────┐
//   ┌────┘
//   └────┐
//   <────┘
const SNAKE = [
  [0, 0], [1, 0], [2, 0], [3, 0],
  [3, 1], [2, 1], [1, 1], [0, 1],
  [0, 2], [1, 2], [2, 2], [3, 2],
  [3, 3], [2, 3], [1, 3], [0, 3],
];
function buildSnakePaths() {
  let paths = [SNAKE];
  paths = paths.concat(paths.map((p) => p.slice().reverse()));
  paths = paths.concat(paths.map((p) => p.map(([x, y]) => [y, x])));
  paths = paths.concat(paths.map((p) => p.map(([x, y]) => [3 - x, y])));
  paths = paths.concat(paths.map((p) => p.map(([x, y]) => [x, 3 - y])));
  const seen = new Set(), out = [];
  for (const p of paths) {
    const cells = p.map(([x, y]) => y * SIZE + x);
    const key = cells.join(",");
    if (!seen.has(key)) { seen.add(key); out.push(cells); }
  }
  return out;
}
export const SNAKE_PATHS = buildSnakePaths();

// ---------- spawning ----------
// Python: getFreePos + spawnTile. Note the reseed happens twice (spawnTile seeds, then
// getFreePos seeds again) before the choice; the 2-or-4 roll continues the same stream.
export function spawnTile(board, seed) {
  rng.seed(seed);
  const free = ALL_POSITIONS.filter((i) => board[i] === 0);
  if (!free.length) return null; // Python returns None here and then crashes; can't happen after a real move
  const p = rng.choice(free);
  const n = rng.randint(1, 10) === 1 ? 4 : 2;
  board[p] = n;
  return { at: p, value: n };
}

// Python: Game.__init__ with no board. Both opening tiles spawn from the same seed (it isn't
// bumped in between), so the second pick reuses the first one's random draws on 15 cells.
export function newGame(seed = freshSeed()) {
  const board = new Array(16).fill(0);
  const spawns = [spawnTile(board, seed), spawnTile(board, seed)];
  return { board, seed, spawns };
}

// ---------- moving ----------
// Python: condense. Drop zeros, then walk left to right merging equal neighbors.
// This always merges from the front of the list, whichever way the move goes: moving RIGHT,
// [2, 2, 2, 0] becomes [0, 0, 4, 2], where most 2048 games give [0, 0, 2, 4]. Kept as is.
function condense(nums) {
  nums = nums.filter((x) => x > 0);
  let i = 0;
  while (i < nums.length - 1) {
    if (nums[i] === nums[i + 1]) { nums.splice(i + 1, 1); nums[i] *= 2; }
    i++;
  }
  return nums;
}

// the cells of line k (a row for LEFT/RIGHT, a column for UP/DOWN), in board order
function lineCells(dir, k) {
  const cells = [];
  for (let j = 0; j < SIZE; j++) cells.push(dir === UP || dir === DOWN ? j * SIZE + k : k * SIZE + j);
  return cells;
}

// The board after sliding, without spawning. Python: the body of Game.move before `if old != self`.
export function slide(board, dir) {
  const away = dir === DOWN || dir === RIGHT;
  const out = new Array(16);
  for (let k = 0; k < SIZE; k++) {
    const cells = lineCells(dir, k);
    const nums = condense(cells.map((c) => board[c]));
    const pad = SIZE - nums.length;
    const line = away ? new Array(pad).fill(0).concat(nums) : nums.concat(new Array(pad).fill(0));
    cells.forEach((c, j) => { out[c] = line[j]; });
  }
  return out;
}

export const sameBoard = (a, b) => a.every((v, i) => v === b[i]);

// Python: Game.move on a copy. Returns the new game; same board and seed if nothing moved.
export function move(game, dir) {
  const board = slide(game.board, dir);
  if (sameBoard(board, game.board)) return { board: game.board, seed: game.seed };
  const seed = game.seed + 1;
  spawnTile(board, seed);
  return { board, seed };
}

export const isLegal = (game, dir) => !sameBoard(slide(game.board, dir), game.board);
export const legalMoves = (game) => DIRECTIONS.filter((d) => isLegal(game, d));

// Python: isDead. (The Python copies and moves, spawn included, then compares; a spawn only
// happens when the slide already changed the board, so comparing slides is the same test.)
export function isDead(board) {
  if (Math.min(...board) === 0) return false;
  for (const d of DIRECTIONS) if (!sameBoard(slide(board, d), board)) return false;
  return true;
}

// ---------- the AI's score of a board (Python: Game.score) ----------
// pathScore(path) folds the tiles along a snake path with halving, so the last cell on the
// path counts fully, the one before it half, and so on: big tiles want to sit at the path's
// end, in decreasing order along it.
export function pathScore(board, path) {
  let score = 0;
  for (const c of path) { score *= 0.5; score += board[c]; }
  return score;
}
// the same fold over the tiles sorted ascending: the best any path could do with these tiles
export function clusteriness(board) {
  let s = 0;
  for (const v of board.slice().sort((a, b) => a - b)) { s *= 0.5; s += v; }
  return s;
}
export function bestSnake(board) {
  let best = -Infinity, path = null;
  for (const p of SNAKE_PATHS) {
    const s = pathScore(board, p);
    if (s > best) { best = s; path = p; }
  }
  return { score: best, path };
}
export function scoreParts(board) {
  const snake = bestSnake(board);
  const snakiness = snake.score / clusteriness(board);
  const empty = board.filter((v) => v === 0).length;
  const emptiness = empty / 16;
  let score = Math.sqrt(emptiness) * snakiness;
  const dead = isDead(board);
  if (dead) score /= 10;
  return { score, snakiness, emptiness, empty, dead, path: snake.path };
}
export function score(board) {
  let best = -Infinity;
  for (const p of SNAKE_PATHS) { const s = pathScore(board, p); if (s > best) best = s; }
  const snakiness = best / clusteriness(board);
  let empty = 0;
  for (const v of board) if (v === 0) empty++;
  let s = Math.sqrt(empty / 16) * snakiness;
  if (isDead(board)) s /= 10;
  return s;
}

// Python: userScore, the sum of the tiles (what the text view printed at game over)
export const tileSum = (board) => board.reduce((a, b) => a + b, 0);

// ---------- for the page: the same slide, with where each tile went ----------
// Returns { board, moves: [{ from, to, value, merged }], merges: [{ at, value }], points },
// where points is the usual 2048 score for the move (the sum of the merged tiles).
// slide() and slideTrace() must agree on the board; the tests check it.
export function slideTrace(board, dir) {
  const away = dir === DOWN || dir === RIGHT;
  const out = new Array(16).fill(0);
  const moves = [], merges = [];
  let points = 0;
  for (let k = 0; k < SIZE; k++) {
    const cells = lineCells(dir, k);
    // same walk as condense, but carrying where each tile came from
    const items = cells.filter((c) => board[c] > 0).map((c) => ({ v: board[c], from: [c] }));
    let i = 0;
    while (i < items.length - 1) {
      if (items[i].v === items[i + 1].v) {
        items[i] = { v: items[i].v * 2, from: items[i].from.concat(items[i + 1].from), merged: true };
        items.splice(i + 1, 1);
      }
      i++;
    }
    const pad = SIZE - items.length;
    items.forEach((it, j) => {
      const to = cells[away ? pad + j : j];
      out[to] = it.v;
      for (const from of it.from) moves.push({ from, to, value: board[from], merged: !!it.merged });
      if (it.merged) { merges.push({ at: to, value: it.v }); points += it.v; }
    });
  }
  return { board: out, moves, merges, points };
}
