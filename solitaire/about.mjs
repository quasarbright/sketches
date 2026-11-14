// The about modal's diagram: the real bot ranking every move it could make in a real position.
// It plays a seeded deal until it reaches a turn with a few choices, then lists them, best first,
// with how much better than standing still the best line after each one scores.
import { deal, apply, cardName, isRed } from "./game.mjs";
import { decide, rankMoves, view, key } from "./bot.mjs";

const SEED = 11;

function position() {
  let s = deal(SEED);
  const seen = new Set([key(view(s))]);
  for (let i = 0; i < 400; i++) {
    const { ranked, now } = rankMoves(s, seen);
    if (i > 12 && ranked.length >= 5 && ranked[0].m.from.pile !== "pool" && ranked[0].value - now > 20) return { s, ranked, now };
    const p = decide(s, seen);
    if (!p.move) break;
    s = apply(s, p.move).state;
    if (p.move.type !== "draw") seen.add(key(view(s)));
  }
  return null;
}

const where = (m, s) => m.to.pile === "found" ? "its foundation" : !s.tab[m.to.i].up.length ? "an empty column" : "the " + cardName(s.tab[m.to.i].up.at(-1));
const from = (m) => m.from.pile === "pool" ? " from the stock" : m.from.pile === "found" ? " back off its foundation" : "";
const WHY = { uncover: "turns a card over", foundation: "", empty: "", build: "" };
const glyph = (c) => `<b style="color:${isRed(c) ? "#ff8a80" : "var(--text)"}">${cardName(c)}</b>`;

export function setupAbout(el) {
  const box = el.querySelector("[data-dia=ranks]");
  const found = position();
  if (!box || !found) return () => {};
  const { s, ranked, now } = found;
  const rows = ranked.slice(0, 6);
  const top = Math.max(1, rows[0].value - now);
  box.innerHTML = rows.map((r, i) => {
    const gain = r.value - now, w = Math.max(2, 100 * Math.max(0, gain) / top);
    const run = r.m.n > 1 ? ` and the ${r.m.n - 1} on it` : "";
    return `<div class="k-rank${i === 0 ? " is-best" : ""}">
      <div class="k-rank-move">${glyph(r.card)}${run}${from(r.m)} to ${where(r.m, s)}${WHY[r.why] ? ` <span class="k-rank-why">${WHY[r.why]}</span>` : ""}</div>
      <div class="k-rank-bar"><div style="width:${w}%"></div></div>
      <div class="k-rank-val">${gain >= 0 ? "+" : ""}${Math.round(gain)}</div></div>`;
  }).join("");
  return () => {};
}
