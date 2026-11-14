// The endgame: a loop through every cell of the board (a Hamiltonian cycle), with the snake's body
// lying along it in order: going round the loop from the tail you meet the body's cells in order
// up to the head, maybe with free cells in between. A snake that only moves forward along the
// loop, and never past its own tail, can't run into itself, and it can skip ahead (a shortcut)
// as long as it lands well short of the tail.
//
// Building one: start with a small loop, the body plus a short path from the head back to the
// tail. Then grow it two cells at a time. Wherever two neighboring cells on the loop sit next to
// two free cells that make a 2x2 square with them, reroute the loop through those two cells. Keep
// going until it covers the board. The detours can go in between body cells too, which is why the
// body only has to be in order along the loop, not in one unbroken stretch.
import { CELLS, W, neighbors, rand } from "./game.mjs";

// the 2x2 squares an edge a-b (neighbors) is part of: the two cells on each side, [f next to a, g next to b]
function sides(a, b) {
  const out = [];
  const ax = a % W, ay = Math.floor(a / W), bx = b % W, by = Math.floor(b / W);
  const H = CELLS / W;
  if (ay === by) { // horizontal edge: squares above and below
    for (const dy of [-1, 1]) if (ay + dy >= 0 && ay + dy < H) out.push([a + dy * W, b + dy * W]);
  } else { // vertical: left and right
    for (const dx of [-1, 1]) if (ax + dx >= 0 && ax + dx < W) out.push([a + dx, b + dx]);
  }
  void bx; void by;
  return out;
}

// A loop through every cell with the body in order, or null if growing it got stuck.
// `seed` varies the starting path and the order of the detours, for another try.
// `trace`, if given, gets the starting loop and then each change, for the about modal to replay.
export function buildLoop(snake, seed = 1, trace = null) {
  const L = snake.length, head = snake[0], tail = snake[L - 1];
  const taken = new Uint8Array(CELLS);
  for (const c of snake) taken[c] = 1;
  let s = seed >>> 0;
  const random = () => { const [r, n] = rand(s); s = n; return r; };
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // the path back: free cells from the head to a cell next to the tail (none if they touch)
  let back = null;
  if (neighbors(head).includes(tail) && L > 2) back = [];
  else {
    const prev = new Int32Array(CELLS).fill(-2);
    prev[head] = -1;
    const queue = [head];
    while (queue.length && !back) {
      const c = queue.shift();
      for (const n of shuffle(neighbors(c))) {
        if (prev[n] !== -2 || taken[n]) continue;
        prev[n] = c;
        if (neighbors(n).includes(tail)) {
          back = [];
          for (let k = n; k !== head; k = prev[k]) back.push(k);
          back.reverse();
          break;
        }
        queue.push(n);
      }
    }
  }
  if (!back) return null;

  // the loop as "next" links: tail -> ... -> head along the body, then the path back to the tail
  const next = new Int32Array(CELLS).fill(-1);
  for (let i = L - 1; i > 0; i--) next[snake[i]] = snake[i - 1];
  let at = head;
  for (const c of back) { next[at] = c; at = c; taken[c] = 1; }
  next[at] = tail;
  let size = L + back.length;
  if (trace) trace.push({ start: [...[...snake].reverse(), ...back] });

  // Grow by 2x2 detours until nothing more fits. A free cell left on its own can't be taken in by
  // a detour (those add two cells), so when growing stalls, swap a stray free cell into the loop in
  // place of a loop cell next to it (one that isn't body, and whose two loop neighbors also touch
  // the free cell). The hole moves, and may now pair up with another one. A few hundred tries.
  const prevOf = (b) => { for (const n of neighbors(b)) if (next[n] === b) return n; return -1; };
  const isBody = new Uint8Array(CELLS);
  for (const c of snake) isBody[c] = 1;
  for (let round = 0; round < 300 && size < CELLS; round++) {
    // one detour at a time: the one that strands the fewest free cells (left with no free
    // neighbor, so no detour can reach them), then the one taking in the most cramped cells, so
    // the loop fills corners and corridors before they get cut off
    const freeN = (x) => { let k = 0; for (const n of neighbors(x)) if (!taken[n]) k++; return k; };
    while (size < CELLS) {
      let best = null, bestScore = Infinity, ties = 0;
      for (let a = 0; a < CELLS; a++) {
        if (next[a] < 0) continue;
        const b = next[a];
        for (const [f, g] of sides(a, b)) {
          if (taken[f] || taken[g]) continue;
          const cramp = freeN(f) + freeN(g) - 2;
          taken[f] = taken[g] = 1;
          let stranded = 0;
          for (const x of [...neighbors(f), ...neighbors(g)]) if (!taken[x] && freeN(x) === 0) stranded++;
          taken[f] = taken[g] = 0;
          const score = stranded * 100 + cramp;
          if (score < bestScore) { bestScore = score; best = [a, b, f, g]; ties = 1; }
          else if (score === bestScore && random() * ++ties < 1) best = [a, b, f, g];
        }
      }
      if (!best) break;
      const [a, b, f, g] = best;
      next[a] = f; next[f] = g; next[g] = b;
      if (trace) trace.push({ splice: [a, f, g, b] });
      taken[f] = taken[g] = 1;
      size += 2;
    }
    if (size >= CELLS) break;
    const swaps = [];
    for (let f = 0; f < CELLS; f++) {
      if (taken[f]) continue;
      for (const b of neighbors(f)) {
        if (!taken[b] || isBody[b]) continue;
        const a = prevOf(b), c = next[b];
        const fn = neighbors(f);
        if (a >= 0 && fn.includes(a) && fn.includes(c)) swaps.push([a, b, c, f]);
      }
    }
    if (!swaps.length) break;
    const [a, b, c, f] = swaps[Math.floor(random() * swaps.length)];
    next[a] = f; next[f] = c; next[b] = -1;
    taken[f] = 1; taken[b] = 0;
    if (trace) trace.push({ swap: [a, b, c, f] });
  }
  if (size < CELLS) return null;

  const order = [], index = new Int32Array(CELLS);
  for (let c = tail, k = 0; k < CELLS; k++, c = next[c]) { index[c] = order.length; order.push(c); }
  return { order, index };
}

// how far b is ahead of a going round the loop
export const ahead = (loop, a, b) => (loop.index[b] - loop.index[a] + CELLS) % CELLS;

// Is the body in order along the loop: from the head back to the tail, each cell somewhere behind
// the one before it, all within one lap?
export function bodyInOrder(loop, snake) {
  if (!loop || loop.order.length !== CELLS) return false;
  let span = 0;
  for (let k = 0; k + 1 < snake.length; k++) {
    const d = ahead(loop, snake[k + 1], snake[k]);
    if (d === 0) return false;
    span += d;
  }
  return span < CELLS;
}

// The next move along the loop: forward to the neighbor that gets closest to the egg, skipping
// ahead only to cells comfortably short of the tail (`room` cells of margin, since eating stalls
// the tail for a step). The free cells ahead of the head, up to the tail, are all free, because
// the whole body is behind it.
export function loopMove(loop, snake, egg, room) {
  const head = snake[0], tail = snake[snake.length - 1];
  const toTail = ahead(loop, head, tail);
  const body = new Set(snake);
  let best = -1, bestLeft = Infinity;
  for (const n of neighbors(head)) {
    const d = ahead(loop, head, n);
    if (d === 0 || (body.has(n) && n !== tail)) continue;
    const ok = d === 1 || d <= toTail - room; // one step along the loop is always fine
    if (!ok) continue;
    const left = egg >= 0 ? ahead(loop, n, egg) : 0; // how far round the loop the egg still is
    if (left < bestLeft) { bestLeft = left; best = n; }
  }
  return best;
}

// the loop from the head up to the egg (or the tail), for drawing where it's headed
export function loopAhead(loop, snake, egg) {
  const out = [], i = loop.index[snake[0]], stop = egg >= 0 ? egg : snake[snake.length - 1];
  for (let k = 1; k < CELLS; k++) { const c = loop.order[(i + k) % CELLS]; out.push(c); if (c === stop) break; }
  return out;
}
