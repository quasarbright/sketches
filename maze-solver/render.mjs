// Running a solver and drawing it: shared by the page and the about modal's diagrams.
import { N, E, S, Wb } from "./maze.mjs";
import { SOLVERS } from "./solvers.mjs";

// ---------- the glow's colors ----------
// a cell's color depends on how many steps ago the algorithm last touched it: white-hot, then
// cyan, blue, violet, settling at a faint afterglow (bidirectional search's second side is pink;
// dead-end filling's sealed cells go gray)
export const DECAY = 140; // steps for a cell to cool to its afterglow
const RAMP = [[0, [244, 251, 255]], [.12, [94, 240, 255]], [.4, [59, 123, 255]], [.75, [96, 52, 230]], [1, [26, 22, 64]]];
const RAMP2 = [[0, [255, 246, 252]], [.12, [255, 120, 214]], [.4, [214, 74, 255]], [.75, [120, 46, 200]], [1, [48, 20, 70]]];
const FILL = [[0, [255, 255, 255]], [.15, [140, 150, 190]], [1, [16, 20, 34]]];
function lut(stops, n = 96) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    let k = 0; while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const [ta, a] = stops[k], [tb, b] = stops[k + 1], f = Math.min(1, Math.max(0, (t - ta) / (tb - ta)));
    out.push(`rgb(${a.map((v, j) => Math.round(v + (b[j] - v) * f)).join(",")})`);
  }
  return out;
}
const LUTS = [lut(RAMP), lut(RAMP2), lut(FILL)];
export const PATH = "#ffb347", START = "#5fffb0", GOAL = "#ff5e7e", WALL = "#1c2536";

// One run of one solver on one maze: steps it and remembers, per cell, the step it was last
// touched and which color ramp to use.
export class Run {
  constructor(maze, algo, start, goal, decay = DECAY) {
    this.maze = maze; this.algo = algo; this.start = start; this.goal = goal; this.decay = decay;
    this.gen = SOLVERS[algo].run(maze, start, goal);
    this.steps = 0; this.looked = 0; this.path = null; this.pathAt = 0; this.done = false; this.walker = -1;
    this.last = new Int32Array(maze.w * maze.h).fill(-1);
    this.kind = new Uint8Array(maze.w * maze.h);
  }
  step(now = 0) {
    if (this.done) return;
    const r = this.gen.next();
    if (r.done) { this.done = true; return; }
    const s = r.value;
    this.steps++;
    if (s.look !== undefined) { this.touch(s.look, s.side ? 1 : 0); this.looked++; }
    if (s.fill !== undefined) { this.touch(s.fill, 2); this.looked++; }
    if (s.at !== undefined) { if (this.last[s.at] < 0) this.looked++; this.touch(s.at, 0); this.walker = s.at; }
    if (s.path !== undefined) { this.done = true; this.path = s.path; this.pathAt = now; }
  }
  touch(c, k) { this.last[c] = this.steps; this.kind[c] = k; }
}

// where a maze sits: { ox, oy, cell } (top-left corner in CSS px, and the cell size)
export const centerOf = (m, at, c) => [at.ox + (c % m.w + 0.5) * at.cell, at.oy + (Math.floor(c / m.w) + 0.5) * at.cell];

export function drawWalls(g, m, { ox, oy, cell }, color = WALL) {
  g.strokeStyle = color; g.lineWidth = Math.max(1, cell * 0.12); g.lineCap = "round";
  g.beginPath();
  for (let c = 0; c < m.w * m.h; c++) {
    const x = ox + (c % m.w) * cell, y = oy + Math.floor(c / m.w) * cell, o = m.open[c];
    if (!(o & N)) { g.moveTo(x, y); g.lineTo(x + cell, y); }
    if (!(o & Wb)) { g.moveTo(x, y); g.lineTo(x, y + cell); }
    if (c % m.w === m.w - 1 && !(o & E)) { g.moveTo(x + cell, y); g.lineTo(x + cell, y + cell); }
    if (Math.floor(c / m.w) === m.h - 1 && !(o & S)) { g.moveTo(x, y + cell); g.lineTo(x + cell, y + cell); }
  }
  g.stroke();
}

// the glowing cells, the walker, the finished path (drawn out over half a second) and the markers
export function drawRun(g, run, at, now) {
  const { cell, ox, oy } = at, m = run.maze;
  const inset = Math.max(0.5, cell * 0.12), sz = cell - inset * 2, n = LUTS[0].length;
  for (let c = 0; c < run.last.length; c++) {
    const t = run.last[c];
    if (t < 0) continue;
    const age = Math.min(1, (run.steps - t) / run.decay);
    g.fillStyle = LUTS[run.kind[c]][Math.round(age * (n - 1))];
    g.fillRect(ox + (c % m.w) * cell + inset, oy + Math.floor(c / m.w) * cell + inset, sz, sz);
  }
  if (run.walker >= 0 && !run.path) {
    const [x, y] = centerOf(m, at, run.walker);
    g.fillStyle = "#ffffff"; g.beginPath(); g.arc(x, y, Math.max(2, cell * 0.32), 0, 7); g.fill();
  }
  if (run.path) {
    const f = Math.min(1, (now - run.pathAt) / 600), k = Math.max(2, Math.round(run.path.length * f));
    g.strokeStyle = PATH; g.lineWidth = Math.max(2, cell * 0.36); g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath();
    run.path.slice(0, k).forEach((c, i) => { const [x, y] = centerOf(m, at, c); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
  }
  marker(g, m, at, run.start, START); marker(g, m, at, run.goal, GOAL);
}
function marker(g, m, at, c, color) {
  const [x, y] = centerOf(m, at, c);
  g.fillStyle = color; g.beginPath(); g.arc(x, y, Math.max(3, at.cell * 0.38), 0, 7); g.fill();
  g.fillStyle = "#05070d"; g.beginPath(); g.arc(x, y, Math.max(1.2, at.cell * 0.14), 0, 7); g.fill();
}
