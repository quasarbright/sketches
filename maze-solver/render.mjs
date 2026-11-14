// Running a solver and drawing it: shared by the page and the about modal's diagrams.
import { N, E, S, Wb } from "./maze.mjs";
import { SOLVERS } from "./solvers.mjs";

// ---------- the heat map ----------
// a cell's color depends on how long ago the algorithm last touched it, like a heat map:
// pale yellow when it's just been looked at, cooling through orange and red to a dim purple that
// stays (bidirectional search's goal side cools through greens and blues instead; dead-end
// filling's sealed cells go a flat gray)
export const DECAY = 2500; // ms for a cell to cool all the way (time, not steps, so a slow run and a fast one fade alike)
const RAMP = [[0, [252, 244, 170]], [.15, [247, 168, 64]], [.42, [214, 78, 66]], [.75, [128, 38, 96]], [1, [58, 26, 72]]];
const RAMP2 = [[0, [236, 248, 170]], [.15, [120, 206, 120]], [.42, [46, 150, 150]], [.75, [42, 88, 130]], [1, [30, 46, 84]]];
const FILL = [[0, [236, 238, 244]], [.2, [120, 128, 146]], [1, [44, 50, 62]]];
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
export const PATH = "#6fe7ff", START = "#5fffb0", GOAL = "#ff5e7e", WALL = "#06080d", FLOOR = "#161d29";

// One run of one solver on one maze: steps it and remembers, per cell, when it was last touched
// (a performance.now() time) and which color ramp to use.
export class Run {
  constructor(maze, algo, start, goal, decay = DECAY) {
    this.maze = maze; this.algo = algo; this.start = start; this.goal = goal; this.decay = decay;
    this.gen = SOLVERS[algo].run(maze, start, goal);
    this.steps = 0; this.looked = 0; this.path = null; this.pathAt = 0; this.done = false; this.walker = -1;
    this.last = new Float64Array(maze.w * maze.h).fill(-1);
    this.kind = new Uint8Array(maze.w * maze.h);
  }
  step(now = 0) {
    if (this.done) return;
    const r = this.gen.next();
    if (r.done) { this.done = true; return; }
    const s = r.value;
    this.steps++;
    if (s.look !== undefined) { this.touch(s.look, s.side ? 1 : 0, now); this.looked++; }
    if (s.fill !== undefined) { this.touch(s.fill, 2, now); this.looked++; }
    if (s.at !== undefined) { if (this.last[s.at] < 0) this.looked++; this.touch(s.at, 0, now); this.walker = s.at; }
    if (s.path !== undefined) { this.done = true; this.path = s.path; this.pathAt = now; }
  }
  touch(c, k, now) { this.last[c] = now; this.kind[c] = k; }
}

// where a maze sits: { ox, oy, cell } (top-left corner in CSS px, and the cell size)
export const centerOf = (m, at, c) => [at.ox + (c % m.w + 0.5) * at.cell, at.oy + (Math.floor(c / m.w) + 0.5) * at.cell];

// the maze's floor, before any heat
export function drawFloor(g, m, { ox, oy, cell }) {
  g.fillStyle = FLOOR;
  g.fillRect(ox, oy, m.w * cell, m.h * cell);
}

// walls go over the heat, so the maze always shows through it
export function drawWalls(g, m, { ox, oy, cell }, color = WALL) {
  g.strokeStyle = color; g.lineWidth = Math.max(1.5, cell * 0.2); g.lineCap = "square";
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

// The whole picture: floor, heat (each touched cell filled edge to edge), walls on top (from a
// cached image of them, if given), then the walker, the finished path (drawn out over half a
// second) and the markers.
export function drawRun(g, run, at, now, wallsImage = null) {
  const { cell, ox, oy } = at, m = run.maze, n = LUTS[0].length;
  drawFloor(g, m, at);
  for (let c = 0; c < run.last.length; c++) {
    const t = run.last[c];
    if (t < 0) continue;
    const age = Math.min(1, Math.max(0, (now - t) / run.decay));
    g.fillStyle = LUTS[run.kind[c]][Math.round(age * (n - 1))];
    g.fillRect(ox + (c % m.w) * cell, oy + Math.floor(c / m.w) * cell, cell + 0.5, cell + 0.5);
  }
  if (wallsImage) g.drawImage(wallsImage, 0, 0, wallsImage.width / wallsImage.scale, wallsImage.height / wallsImage.scale);
  else drawWalls(g, m, at);
  if (run.walker >= 0 && !run.path) {
    const [x, y] = centerOf(m, at, run.walker);
    g.fillStyle = "#ffffff"; g.strokeStyle = WALL; g.lineWidth = 1.5;
    g.beginPath(); g.arc(x, y, Math.max(2, cell * 0.32), 0, 7); g.fill(); g.stroke();
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
  g.fillStyle = color; g.strokeStyle = WALL; g.lineWidth = 1.5;
  g.beginPath(); g.arc(x, y, Math.max(3, at.cell * 0.38), 0, 7); g.fill(); g.stroke();
}
