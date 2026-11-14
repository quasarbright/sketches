// The solvers. Each is a generator that yields one step at a time, so the page can run it at any
// speed. A step is an object:
//   { look: c }            the solver examined cell c (it glows)
//   { look: c, side: 1 }   bidirectional search: from the goal's side
//   { fill: c }            dead-end filling sealed off cell c
//   { at: c }              the wall follower, Trémaux and the random mouse: where the walker is now
// and the last step is { path: [start, ..., goal] }, or { path: null } if there's no way through.
import { neighbors, random } from "./maze.mjs";

const xy = (m, c) => [c % m.w, Math.floor(c / m.w)];
const manhattan = (m, a, b) => { const [ax, ay] = xy(m, a), [bx, by] = xy(m, b); return Math.abs(ax - bx) + Math.abs(ay - by); };
function walkBack(prev, goal) { const path = []; for (let c = goal; c !== -1; c = prev[c]) path.push(c); return path.reverse(); }

// a tiny binary heap of [priority, tiebreak, cell]
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(x) { const a = this.a; a.push(x); let i = a.length - 1; while (i) { const p = (i - 1) >> 1; if (less(a[p], a[i])) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && less(a[l], a[m])) m = l; if (r < a.length && less(a[r], a[m])) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top;
  }
}
const less = (x, y) => x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]);

// Breadth-first: explore in rings of equal distance from the start. Finds a shortest path.
export function* bfs(m, start, goal) {
  const prev = new Int32Array(m.w * m.h).fill(-2);
  prev[start] = -1;
  const queue = [start];
  for (let qi = 0; qi < queue.length; qi++) {
    const c = queue[qi];
    yield { look: c };
    if (c === goal) return yield { path: walkBack(prev, goal) };
    for (const n of neighbors(m, c)) if (prev[n] === -2) { prev[n] = c; queue.push(n); }
  }
  yield { path: null };
}

// Depth-first: follow one passage as far as it goes, back up only at a dead end.
export function* dfs(m, start, goal) {
  const prev = new Int32Array(m.w * m.h).fill(-2);
  const stack = [[start, -1]];
  while (stack.length) {
    const [c, from] = stack.pop();
    if (prev[c] !== -2) continue;
    prev[c] = from;
    yield { look: c };
    if (c === goal) return yield { path: walkBack(prev, goal) };
    for (const n of neighbors(m, c)) if (prev[n] === -2) stack.push([n, c]);
  }
  yield { path: null };
}

// Best-first search ordered by a priority. A*: distance so far + straight-line (grid) distance
// left, which still finds a shortest path. Greedy: distance left only, which heads straight at the
// goal and gets fooled by dead ends.
function* bestFirst(m, start, goal, greedy) {
  const prev = new Int32Array(m.w * m.h).fill(-2), dist = new Int32Array(m.w * m.h).fill(1 << 30);
  const done = new Uint8Array(m.w * m.h);
  const heap = new Heap();
  let tie = 0;
  dist[start] = 0; prev[start] = -1;
  heap.push([manhattan(m, start, goal), tie++, start]);
  while (heap.size) {
    const [, , c] = heap.pop();
    if (done[c]) continue;
    done[c] = 1;
    yield { look: c };
    if (c === goal) return yield { path: walkBack(prev, goal) };
    for (const n of neighbors(m, c)) {
      const d = dist[c] + 1;
      if (d < dist[n] && !done[n]) {
        dist[n] = d; prev[n] = c;
        // ties go to the newest, so equal-cost cells are explored deepest first
        heap.push([greedy ? manhattan(m, n, goal) : d + manhattan(m, n, goal), greedy ? -(tie++) : manhattan(m, n, goal) * 1e6 - (tie++), n]);
      }
    }
  }
  yield { path: null };
}
export const astar = (m, s, g) => bestFirst(m, s, g, false);
export const greedy = (m, s, g) => bestFirst(m, s, g, true);

// Bidirectional breadth-first: grow rings from both ends at once and stop where they meet.
export function* bidirectional(m, start, goal) {
  const n = m.w * m.h;
  const side = new Int8Array(n).fill(-1), prev = new Int32Array(n).fill(-2);
  const queues = [[start], [goal]], heads = [0, 0];
  side[start] = 0; prev[start] = -1; side[goal] = 1; prev[goal] = -1;
  for (let turn = 0; heads[0] < queues[0].length || heads[1] < queues[1].length; turn ^= 1) {
    if (heads[turn] >= queues[turn].length) continue;
    const c = queues[turn][heads[turn]++];
    yield { look: c, side: turn };
    for (const nb of neighbors(m, c)) {
      if (side[nb] === -1) { side[nb] = turn; prev[nb] = c; queues[turn].push(nb); }
      else if (side[nb] !== turn) {
        // the two searches touch: start…c and nb…goal (or the other way round)
        const a = walkBack(prev, turn === 0 ? c : nb), b = walkBack(prev, turn === 0 ? nb : c).reverse();
        return yield { path: [...a, ...b] };
      }
    }
  }
  yield { path: null };
}

// The route a walker actually needed: its walk with every loop it went round cut out.
function loopErase(walk) {
  const out = [], at = new Map();
  for (const c of walk) {
    if (at.has(c)) { const k = at.get(c); for (let i = k + 1; i < out.length; i++) at.delete(out[i]); out.length = k + 1; }
    else { at.set(c, out.length); out.push(c); }
  }
  return out;
}

// Wall follower: keep your right hand on the wall and walk. Always gets out of a maze without
// loops; with loops it can circle an island forever, so it gives up after visiting every passage
// from both sides.
const DIR = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up, right, down, left
function step(m, c, d) {
  const [x, y] = xy(m, c), nx = x + DIR[d][0], ny = y + DIR[d][1];
  if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) return -1;
  const nc = ny * m.w + nx;
  return neighbors(m, c).includes(nc) ? nc : -1;
}
export function* wallFollower(m, start, goal) {
  let c = start, d = 1;
  const walk = [start];
  const limit = m.w * m.h * 4 + 10;
  yield { at: c };
  for (let i = 0; i < limit && c !== goal; i++) {
    // try right, straight, left, back, in that order, relative to the way you're facing
    for (const turn of [1, 0, 3, 2]) {
      const nd = (d + turn) % 4, n = step(m, c, nd);
      if (n >= 0) { c = n; d = nd; break; }
    }
    walk.push(c);
    yield { at: c };
  }
  yield { path: c === goal ? loopErase(walk) : null };
}

// Trémaux's algorithm: mark each passage as you walk it. At a junction, take an unmarked passage
// if there is one; never walk a passage a third time; if you arrive somewhere you've already been
// by a fresh passage, turn straight back. Works on any maze, loops or not.
export function* tremaux(m, start, goal) {
  const marks = new Map();
  const key = (a, b) => (a < b ? a * m.w * m.h + b : b * m.w * m.h + a);
  const mark = (a, b) => marks.set(key(a, b), (marks.get(key(a, b)) || 0) + 1);
  const count = (a, b) => marks.get(key(a, b)) || 0;
  const visited = new Uint8Array(m.w * m.h);
  let c = start, from = -1;
  const walk = [start];
  visited[start] = 1;
  yield { at: c };
  for (let guard = 0; c !== goal && guard < m.w * m.h * 6; guard++) {
    const ns = neighbors(m, c);
    let next;
    const cameNewToOld = from >= 0 && count(c, from) === 1 && visited[c] > 1;
    if (cameNewToOld) next = from; // a loop: go back the way you came
    else {
      const fresh = ns.filter((n) => count(c, n) === 0);
      const once = ns.filter((n) => n !== from && count(c, n) === 1);
      next = fresh.length ? fresh[0] : once.length ? once[0] : from >= 0 && count(c, from) < 2 ? from : -1;
    }
    if (next < 0) break;
    mark(c, next);
    from = c; c = next;
    visited[c]++;
    walk.push(c);
    yield { at: c };
  }
  yield { path: c === goal ? loopErase(walk) : null };
}

// Random mouse: at every step pick a random way to go, but never straight back unless it's a dead
// end. Hopeless on a big maze, which is the point.
export function* randomMouse(m, start, goal, seed = 7) {
  const rnd = random(seed);
  let c = start, from = -1;
  const walk = [start];
  yield { at: c };
  while (c !== goal) {
    const ns = neighbors(m, c), options = ns.length > 1 ? ns.filter((n) => n !== from) : ns;
    const n = options[Math.floor(rnd() * options.length)];
    from = c; c = n;
    walk.push(c);
    yield { at: c };
  }
  yield { path: loopErase(walk) };
}

// Dead-end filling: a dead end (a cell with one way out, other than the start and goal) can't be on
// the route, so seal it off, which may turn its neighbor into a dead end too. Keep going until no
// dead ends are left. In a maze without loops only the route remains.
export function* deadEndFill(m, start, goal) {
  const n = m.w * m.h;
  const filled = new Uint8Array(n), degree = new Uint8Array(n);
  for (let c = 0; c < n; c++) degree[c] = neighbors(m, c).length;
  const stack = [];
  for (let c = 0; c < n; c++) if (degree[c] <= 1 && c !== start && c !== goal) stack.push(c);
  while (stack.length) {
    const c = stack.pop();
    if (filled[c]) continue;
    filled[c] = 1;
    yield { fill: c };
    for (const nb of neighbors(m, c)) {
      if (filled[nb]) continue;
      if (--degree[nb] <= 1 && nb !== start && nb !== goal) stack.push(nb);
    }
  }
  // what's left: walk it (a breadth-first search through the unfilled cells, not shown)
  const prev = new Int32Array(n).fill(-2);
  prev[start] = -1;
  const q = [start];
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    if (c === goal) return yield { path: walkBack(prev, goal) };
    for (const nb of neighbors(m, c)) if (!filled[nb] && prev[nb] === -2) { prev[nb] = c; q.push(nb); }
  }
  yield { path: null };
}

export const SOLVERS = {
  bfs: { name: "Breadth-first search", run: bfs },
  dfs: { name: "Depth-first search", run: dfs },
  astar: { name: "A*", run: astar },
  greedy: { name: "Greedy best-first", run: greedy },
  bidirectional: { name: "Bidirectional BFS", run: bidirectional },
  wall: { name: "Wall follower", run: wallFollower },
  tremaux: { name: "Trémaux", run: tremaux },
  deadend: { name: "Dead-end filling", run: deadEndFill },
  mouse: { name: "Random mouse", run: randomMouse },
};
