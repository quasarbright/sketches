// Headless tuning: run the world without rendering and print population + gene means.
// usage: node tune.mjs [steps] [cols] [rows] [key=value ...]
import { World, GENES } from "./sim.js";
const [steps = 20000, cols = 72, rows = 45] = process.argv.slice(2, 5).map(Number);
const opts = Object.fromEntries(process.argv.slice(5).map((a) => { const [k, v] = a.split("="); return [k, Number(v)]; }));
for (let seed = 0; seed < 3; seed++) {
  const w = new World(cols, rows, opts);
  let line = "";
  for (let t = 1; t <= steps; t++) {
    w.tick();
    if (!w.snakes.length) { line += ` EXTINCT@${t}`; break; }
    if (t % (steps / 5) === 0) {
      const m = w.geneMeans();
      const len = w.snakes.reduce((a, s) => a + s.body.length, 0) / w.snakes.length;
      const gen = Math.max(...w.snakes.map((s) => s.generation));
      line += `\n  t=${t} pop=${w.snakes.length} food=${w.foodCount} len=${len.toFixed(1)} gen=${gen} ` +
        GENES.map((g) => `${g.key.slice(0, 4)}=${m[g.key].toFixed(2)}`).join(" ") +
        ` starved=${w.stats.starved} trapped=${w.stats.trapped}`;
    }
  }
  console.log(`seed ${seed}:${line}`);
}
