// The about modal's diagrams: the real solvers on small mazes, drawn with the page's renderer.
// Each diagram runs one or two algorithms side by side on the same maze, holds the result for a
// moment, then starts over. Its caption counts the cells each one explored and its path length.
import { generate } from "./maze.mjs";
import { SOLVERS } from "./solvers.mjs";
import { Run, drawRun } from "./render.mjs";

const BW = 23, BH = 15;

function diagram(cv, cap, { algos, loops = 0, style = "corridors", seed = 3, rate = 60, start, goal }) {
  const maze = generate(BW, BH, { style, loops, seed });
  const s = start ?? 0, g = goal ?? BW * BH - 1;
  let runs, doneAt = 0, w = 0, ctx = null, cell = 0;
  const reset = () => { runs = algos.map((a) => new Run(maze, a, s, g, 40)); doneAt = 0; };
  reset();
  const gap = 14;
  const size = () => {
    const nw = Math.min(460, cv.parentElement.clientWidth || 460);
    if (nw === w) return;
    w = nw;
    cell = Math.floor((w - gap * (algos.length - 1) - 8) / (BW * algos.length));
    const h = cell * BH + 8, d = Math.max(1, devicePixelRatio || 1);
    cv.width = Math.round(w * d); cv.height = Math.round(h * d);
    cv.style.width = w + "px"; cv.style.height = h + "px";
    ctx = cv.getContext("2d"); ctx.setTransform(d, 0, 0, d, 0, 0);
  };
  let acc = 0, last = 0;
  return (now) => {
    size();
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 0; last = now;
    acc += dt * rate;
    while (acc >= 1) { acc -= 1; for (const r of runs) r.step(now); }
    if (runs.every((r) => r.done)) { if (!doneAt) doneAt = now; else if (now - doneAt > 2600) reset(); }
    ctx.clearRect(0, 0, w, cv.height);
    const total = cell * BW * algos.length + gap * (algos.length - 1);
    runs.forEach((r, i) => {
      const at = { ox: (w - total) / 2 + i * (cell * BW + gap), oy: 4, cell };
      drawRun(ctx, r, at, now);
    });
    const text = runs.map((r) => `${SOLVERS[r.algo].name}: ${r.looked} cells explored` + (r.path ? `, path ${r.path.length}` : "")).join("   ·   ");
    if (cap.textContent !== text) cap.textContent = text;
  };
}

export function setupAbout(el) {
  const specs = {
    blind: { algos: ["bfs", "dfs"], seed: 8, rate: 50 },
    aimed: { algos: ["astar", "greedy"], loops: 0.3, seed: 391, rate: 35 }, // a maze where greedy wanders: 146 cells for a 97-cell route, A* 89 for 43
    walkers: { algos: ["wall", "tremaux"], seed: 6, rate: 30 },
    fill: { algos: ["deadend"], style: "branchy", seed: 2, rate: 60 },
  };
  const loops = [];
  for (const cv of el.querySelectorAll("canvas[data-dia]")) {
    const cap = cv.nextElementSibling;
    loops.push(diagram(cv, cap, specs[cv.dataset.dia]));
  }
  let raf = 0;
  const tick = (now) => { for (const f of loops) f(now); raf = requestAnimationFrame(tick); };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}
