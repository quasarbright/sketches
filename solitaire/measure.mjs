// How well the bot plays: deal and play games headlessly, report the win rate.
// Run: node measure.mjs [games] [firstSeed]
import { deal, apply, won, foundCount } from "./game.mjs";
import { decide, view, key } from "./bot.mjs";

export function playOut(seed, depth) {
  let state = deal(seed);
  const seen = new Set([key(view(state))]);
  let steps = 0;
  while (!won(state) && steps < 5000) {
    const p = decide(state, seen, depth);
    if (!p.move) break;
    state = apply(state, p.move).state;
    if (p.move.type !== "draw") seen.add(key(view(state)));
    steps++;
  }
  return { seed, won: won(state), found: foundCount(state), steps };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const games = +(process.argv[2] || 200), first = +(process.argv[3] || 1);
  const t0 = performance.now();
  const runs = [];
  for (let s = first; s < first + games; s++) runs.push(playOut(s));
  const ms = performance.now() - t0, steps = runs.reduce((a, r) => a + r.steps, 0);
  const wins = runs.filter((r) => r.won).length;
  const found = runs.map((r) => r.found).sort((a, b) => a - b);
  console.log(`${games} deals: won ${wins} (${(100 * wins / games).toFixed(1)}%), cards home median ${found[games >> 1]}, ${steps} steps in ${(ms / 1000).toFixed(1)} s (${Math.round(steps / (ms / 1000))} steps/s, ${(ms / games).toFixed(0)} ms/deal)`);
}
