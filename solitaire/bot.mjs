// The bot. It plays only on what a player can see:
//   - face-up cards in the columns and on the foundations
//   - the stock and waste. With draw-one and unlimited passes you can flip through the whole
//     stock, so every card in it is reachable: the bot treats the stock and waste as one pool and
//     a "play from the pool" as drawing until that card is on top, then playing it.
//   - never the face-down cards. A move that turns one over ends that line of thinking, scored as
//     an uncovered card, since what's under it is unknown until it happens.
// Each turn it searches a few moves ahead and takes the first move of the best line it finds. It
// never makes a move that leads back to a position it has already been in this game, so it can't
// go round in circles; when every move would, it's stuck and the deal is lost.
import { fitsTab, suitOf, rankOf } from "./game.mjs";

export const DEPTH = +(globalThis.process?.env?.DEPTH ?? 2);

const top = (a) => a[a.length - 1];

// the bot's view of a game state: the pool instead of stock/waste, and only counts of face-down cards
export function view(state) {
  return {
    pool: [...state.stock, ...state.waste].sort((a, b) => a - b),
    found: state.found.map((f) => f.length),
    tab: state.tab.map((c) => ({ down: c.down.length, up: c.up })),
  };
}

export function key(v) {
  return v.found.join(",") + "|" + v.tab.map((c) => c.down + ":" + c.up.join(".")).join("/") + "|" + v.pool.join(".");
}

const canTab = (c, col) => fitsTab(c, { down: { length: col.down }, up: col.up });
const canFound = (c, found) => found[suitOf(c)] === rankOf(c);

// Moves in the bot's view: { from: { pile: "pool"|"tab"|"found", i, card }, to: { pile: "tab"|"found", i }, n }
export function viewMoves(v) {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const col = v.tab[i], c = top(col.up);
    if (c !== undefined && canFound(c, v.found)) out.push({ from: { pile: "tab", i }, to: { pile: "found", i: suitOf(c) }, n: 1 });
  }
  for (const c of v.pool) if (canFound(c, v.found)) out.push({ from: { pile: "pool", card: c }, to: { pile: "found", i: suitOf(c) }, n: 1 });
  for (let i = 0; i < 7; i++) {
    const col = v.tab[i];
    for (let n = 1; n <= col.up.length; n++) {
      const c = col.up[col.up.length - n];
      const whole = n === col.up.length;
      for (let j = 0; j < 7; j++) {
        if (j === i || !canTab(c, v.tab[j])) continue;
        // a king (with its run) that already sits at the bottom of a column gains nothing by moving to another empty one
        if (whole && col.down === 0 && v.tab[j].up.length === 0) continue;
        out.push({ from: { pile: "tab", i }, to: { pile: "tab", i: j }, n });
      }
    }
  }
  for (const c of v.pool) for (let j = 0; j < 7; j++) if (canTab(c, v.tab[j])) out.push({ from: { pile: "pool", card: c }, to: { pile: "tab", i: j }, n: 1 });
  for (let s = 0; s < 4; s++) {
    if (!v.found[s]) continue;
    const c = s * 13 + v.found[s] - 1;
    for (let j = 0; j < 7; j++) if (canTab(c, v.tab[j])) out.push({ from: { pile: "found", i: s }, to: { pile: "tab", i: j }, n: 1 });
  }
  return out;
}

// the card a move picks up first (the bottom of a moved run)
export function movedCard(v, m) {
  if (m.from.pile === "pool") return m.from.card;
  if (m.from.pile === "found") return m.from.i * 13 + v.found[m.from.i] - 1;
  const up = v.tab[m.from.i].up;
  return up[up.length - m.n];
}

// Applies a move in the bot's view. `uncovers` is true when it turns a face-down card over; the
// new state then has the column's face-up run empty and one fewer face-down card, standing for
// "an unknown card is now on top here".
export function viewApply(v, m) {
  const n = { pool: v.pool, found: v.found.slice(), tab: v.tab.slice() };
  let cards;
  if (m.from.pile === "pool") { cards = [m.from.card]; n.pool = v.pool.filter((c) => c !== m.from.card); }
  else if (m.from.pile === "found") { cards = [m.from.i * 13 + v.found[m.from.i] - 1]; n.found[m.from.i]--; }
  else { const col = v.tab[m.from.i]; cards = col.up.slice(col.up.length - m.n); n.tab[m.from.i] = { down: col.down, up: col.up.slice(0, col.up.length - m.n) }; }
  if (m.to.pile === "found") n.found[m.to.i] += cards.length;
  else { const col = n.tab[m.to.i]; n.tab[m.to.i] = { down: col.down, up: [...col.up, ...cards] }; }
  let uncovers = false;
  if (m.from.pile === "tab") {
    const col = n.tab[m.from.i];
    if (!col.up.length && col.down) { n.tab[m.from.i] = { down: col.down - 1, up: [], unknown: true }; uncovers = true; }
  }
  return { v: n, uncovers };
}

// How good a position looks: cards on the foundations, face-down cards turned over (worth the
// most: every one is new information and a new card to play), and empty columns when a king is
// waiting to use one.
export function score(v, hidden0) {
  const found = v.found.reduce((a, b) => a + b, 0);
  const hidden = v.tab.reduce((a, c) => a + c.down, 0); // a card just turned over (unknown) counts as uncovered
  let s = 30 * found + 70 * (hidden0 - hidden);
  // empty columns, worth more while kings are waiting for one (in the pool, or at the bottom of a
  // run with cards under it), but only one king per column
  const kings = v.pool.filter((c) => rankOf(c) === 12).length + v.tab.filter((c) => c.up.length && rankOf(c.up[0]) === 12 && (c.down || c.unknown)).length;
  const empty = v.tab.filter((c) => !c.up.length && !c.down && !c.unknown).length;
  s += 20 * Math.min(empty, kings) + 4 * Math.max(0, empty - kings);
  // digging: face-up cards piled on top of face-down ones are in the way
  for (const c of v.tab) if (c.down) s -= BURY * c.up.length;
  return s;
}

// Every move costs a little, so a line has to gain something to beat standing still, and of two
// lines that gain the same, the shorter wins.
const STEP = 1;
export const BURY = +(globalThis.process?.env?.BURY ?? 4);
export const SLACK = +(globalThis.process?.env?.SLACK ?? 0); // how far below standing still a move may score

// Best score reachable within `depth` moves from v (never revisiting a position in `seen`).
function search(v, depth, hidden0, seen, memo) {
  const k = key(v);
  const cached = memo.get(k);
  if (cached !== undefined && cached.depth >= depth) return cached.value;
  let best = score(v, hidden0);
  if (depth > 0) {
    for (const m of viewMoves(v)) {
      const { v: n, uncovers } = viewApply(v, m);
      const nk = key(n);
      if (seen.has(nk)) continue;
      const value = (uncovers ? score(n, hidden0) : search(n, depth - 1, hidden0, seen, memo)) - STEP;
      if (value > best) best = value;
    }
  }
  memo.set(k, { depth, value: best });
  return best;
}

// The plan for this turn: { move, why, card, to } where move is a game move ({ type: "draw" } or
// { type: "move", from, to, n }), or null when stuck. `seen` is the set of position keys this game
// has been in (the caller adds to it after each move that isn't a draw).
// Every move it would consider from here, with the score of the best line after it, best first.
// Also returns `now`, the score of standing still. When nothing within `depth` beats standing
// still it looks two moves further, up to four more.
export function rankMoves(state, seen, depth = DEPTH) {
  const v = view(state);
  const hidden0 = v.tab.reduce((a, c) => a + c.down, 0);
  const now = score(v, hidden0);
  let ranked = [];
  for (let d = depth; d <= depth + 4; d += 2) {
    const memo = new Map();
    ranked = [];
    for (const m of viewMoves(v)) {
      const { v: n, uncovers } = viewApply(v, m);
      if (seen.has(key(n))) continue;
      // ties go to whatever scores right away
      const value = (uncovers ? score(n, hidden0) : search(n, d - 1, hidden0, seen, memo)) - STEP + score(n, hidden0) * 1e-3;
      const card = movedCard(v, m);
      const why = uncovers ? "uncover" : m.to.pile === "found" ? "foundation" : !v.tab[m.to.i].up.length ? "empty" : "build";
      ranked.push({ m, value, card, why });
    }
    ranked.sort((a, b) => b.value - a.value);
    if (ranked.length && ranked[0].value > now) break;
  }
  return { ranked, now };
}

export function decide(state, seen, depth = DEPTH) {
  const { ranked, now } = rankMoves(state, seen, depth);
  const best = ranked[0];
  if (!best || best.value <= now - SLACK) return { move: null, why: "stuck" };
  const { m, card, why } = best;
  // from the pool: draw until the card is on top of the waste, then play it
  if (m.from.pile === "pool") {
    if (state.waste[state.waste.length - 1] !== card) return { move: { type: "draw" }, why: "draw", card, to: m.to };
    return { move: { type: "move", from: { pile: "waste", i: 0 }, to: m.to, n: 1 }, why, card, to: m.to };
  }
  return { move: { type: "move", from: m.from, to: m.to, n: m.n }, why, card, to: m.to };
}

