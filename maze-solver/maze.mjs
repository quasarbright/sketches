// Mazes on a grid of cells. A cell is an index y * w + x; open[c] holds which of its four sides
// are open passages, as bits: N = 1, E = 2, S = 4, W = 8.
export const N = 1, E = 2, S = 4, Wb = 8;
const DIRS = [[N, 0, -1, S], [E, 1, 0, Wb], [S, 0, 1, N], [Wb, -1, 0, E]];

// mulberry32
export function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// the open neighbors of cell c
export function neighbors(m, c) {
  const out = [], o = m.open[c];
  if (o & N) out.push(c - m.w);
  if (o & E) out.push(c + 1);
  if (o & S) out.push(c + m.w);
  if (o & Wb) out.push(c - 1);
  return out;
}

function carve(m, a, b) {
  const d = b - a;
  if (d === -m.w) { m.open[a] |= N; m.open[b] |= S; }
  else if (d === 1) { m.open[a] |= E; m.open[b] |= Wb; }
  else if (d === m.w) { m.open[a] |= S; m.open[b] |= N; }
  else { m.open[a] |= Wb; m.open[b] |= E; }
}

// all grid neighbors of c, walls or not
function around(m, c) {
  const out = [], x = c % m.w, y = (c - x) / m.w;
  for (const [, dx, dy] of DIRS) {
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < m.w && ny < m.h) out.push(ny * m.w + nx);
  }
  return out;
}

// Generates a maze.
//   style "corridors": a depth-first carve (the recursive backtracker): long winding passages
//   style "branchy":   randomized Prim's: grows outward from many points, short dead ends everywhere
//   loops in [0, 1]:   knocks out that share of the remaining walls (scaled down so it stays a maze),
//                      so there's more than one route between places
export function generate(w, h, { style = "corridors", loops = 0, seed = 1 } = {}) {
  const rnd = random(seed);
  const m = { w, h, open: new Uint8Array(w * h) };
  const seen = new Uint8Array(w * h);
  if (style === "branchy") {
    const start = Math.floor(rnd() * w * h);
    seen[start] = 1;
    const frontier = [];
    const addFrontier = (c) => { for (const n of around(m, c)) if (!seen[n]) frontier.push([n, c]); };
    addFrontier(start);
    while (frontier.length) {
      const k = Math.floor(rnd() * frontier.length);
      const [c, from] = frontier[k];
      frontier[k] = frontier[frontier.length - 1]; frontier.pop();
      if (seen[c]) continue;
      seen[c] = 1; carve(m, from, c); addFrontier(c);
    }
  } else {
    const stack = [Math.floor(rnd() * w * h)];
    seen[stack[0]] = 1;
    while (stack.length) {
      const c = stack[stack.length - 1];
      const next = around(m, c).filter((n) => !seen[n]);
      if (!next.length) { stack.pop(); continue; }
      const n = next[Math.floor(rnd() * next.length)];
      seen[n] = 1; carve(m, c, n); stack.push(n);
    }
  }
  if (loops > 0) {
    const p = loops * 0.3;
    for (let c = 0; c < w * h; c++) {
      const x = c % w, y = (c - x) / w;
      if (x + 1 < w && !(m.open[c] & E) && rnd() < p) carve(m, c, c + 1);
      if (y + 1 < h && !(m.open[c] & S) && rnd() < p) carve(m, c, c + w);
    }
  }
  return m;
}
