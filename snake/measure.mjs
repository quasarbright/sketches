// How well the bot plays: run games headlessly and report how much of the board it fills.
// Run: node measure.mjs [games] [firstSeed]
import { newGame, step, CELLS } from "./game.mjs";
import { decide } from "./bot.mjs";

const games = +(process.argv[2] || 200), first = +(process.argv[3] || 1);
const STUCK = CELLS * 4; // this many steps without eating counts as going round in circles

export function playOut(seed) {
  let g = newGame(seed);
  const kinds = { egg: 0, gamble: 0, tail: 0, room: 0, stuck: 0 };
  while (g.alive && !g.won && g.sinceEat < STUCK) {
    const p = decide(g);
    kinds[p.kind]++;
    g = step(g, p.dir);
  }
  const end = g.won ? "won" : g.alive ? "circling" : "died";
  return { seed, length: g.snake.length, fill: g.snake.length / CELLS, steps: g.steps, end, kinds };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = performance.now();
  const runs = [];
  for (let s = first; s < first + games; s++) runs.push(playOut(s));
  const ms = performance.now() - t0, steps = runs.reduce((a, r) => a + r.steps, 0);
  const fills = runs.map((r) => r.fill).sort((a, b) => a - b);
  const pct = (x) => (100 * x).toFixed(1) + "%";
  const q = (f) => fills[Math.min(fills.length - 1, Math.floor(f * fills.length))];
  const ends = {};
  for (const r of runs) ends[r.end] = (ends[r.end] || 0) + 1;
  const kinds = {};
  for (const r of runs) for (const k in r.kinds) kinds[k] = (kinds[k] || 0) + r.kinds[k];
  console.log(`${games} games on a ${Math.sqrt(CELLS)}x${Math.sqrt(CELLS)} board`);
  console.log(`fill: mean ${pct(fills.reduce((a, b) => a + b) / fills.length)}, min ${pct(fills[0])}, 10% ${pct(q(0.1))}, median ${pct(q(0.5))}, 90% ${pct(q(0.9))}, max ${pct(fills.at(-1))}`);
  console.log("endings:", ends);
  console.log("decisions:", Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, pct(v / steps)])));
  console.log(`${steps} steps in ${(ms / 1000).toFixed(1)} s: ${Math.round(steps / (ms / 1000))} steps/s`);
}
