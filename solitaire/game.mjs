// Klondike rules as pure functions: draw one, unlimited passes through the stock.
//
// A card is a number 0..51: suit = floor(c / 13) in SUITS order, rank = c % 13 (0 = ace,
// 12 = king). A state:
//   stock: cards face down, the last one is on top
//   waste: cards face up, the last one is on top
//   found: four piles, one per suit (found[s] holds suit s), the last card on top
//   tab:   seven columns, each { down: [...face-down cards], up: [...face-up run] }, last on top
//   moves: how many moves have been made
// A deal is seeded, so a seed replays the same game.

export const SUITS = ["S", "H", "D", "C"];
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export const suitOf = (c) => Math.floor(c / 13);
export const rankOf = (c) => c % 13;
export const isRed = (c) => suitOf(c) === 1 || suitOf(c) === 2;
export const cardName = (c) => RANKS[rankOf(c)] + "♠♥♦♣"[suitOf(c)];

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

export function deal(seed = (Math.random() * 2 ** 32) >>> 0) {
  const rnd = random(seed);
  const deck = [...Array(52).keys()];
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  const tab = [];
  for (let i = 0; i < 7; i++) {
    const cards = deck.splice(0, i + 1);
    tab.push({ down: cards.slice(0, i), up: cards.slice(i) });
  }
  return { seed, stock: deck, waste: [], found: [[], [], [], []], tab, moves: 0 };
}

const top = (a) => a[a.length - 1];

// can card c go on tableau column col (a column object)?
export function fitsTab(c, col) {
  const t = top(col.up);
  if (t === undefined) return col.down.length === 0 && rankOf(c) === 12;
  return isRed(c) !== isRed(t) && rankOf(t) === rankOf(c) + 1;
}
// can card c go up on its foundation?
export function fitsFound(c, found) { return found[suitOf(c)].length === rankOf(c); }

// Moves:
//   { type: "draw" }                          stock -> waste, or turn the waste back over
//   { type: "move", from, to, n }             from/to are { pile: "waste" | "tab" | "found", i }
//                                             n: how many cards (only more than 1 from a column)
export function cardsOf(state, from, n = 1) {
  if (from.pile === "waste") return state.waste.length ? [top(state.waste)] : [];
  if (from.pile === "found") return state.found[from.i].length ? [top(state.found[from.i])] : [];
  const up = state.tab[from.i].up;
  return n <= up.length ? up.slice(up.length - n) : [];
}

export function legal(state, m) {
  if (m.type === "draw") return state.stock.length > 0 || state.waste.length > 0;
  const n = m.n || 1;
  if (n > 1 && m.from.pile !== "tab") return false;
  const cards = cardsOf(state, m.from, n);
  if (!cards.length) return false;
  if (m.from.pile === m.to.pile && m.from.i === m.to.i) return false;
  if (m.to.pile === "found") return n === 1 && m.to.i === suitOf(cards[0]) && fitsFound(cards[0], state.found);
  if (m.to.pile === "tab") return fitsTab(cards[0], state.tab[m.to.i]);
  return false;
}

// Applies a legal move; returns the new state and, if a face-down card turned over, which one
// (as `flipped: { i, card }`).
export function apply(state, m) {
  const s = {
    seed: state.seed, moves: state.moves + 1,
    stock: state.stock, waste: state.waste,
    found: state.found.slice(), tab: state.tab.slice(),
  };
  if (m.type === "draw") {
    if (state.stock.length) { s.stock = state.stock.slice(0, -1); s.waste = [...state.waste, top(state.stock)]; }
    else { s.stock = state.waste.slice().reverse(); s.waste = []; }
    return { state: s };
  }
  const n = m.n || 1;
  const cards = cardsOf(state, m.from, n);
  if (m.from.pile === "waste") s.waste = state.waste.slice(0, -1);
  else if (m.from.pile === "found") s.found[m.from.i] = state.found[m.from.i].slice(0, -1);
  else {
    const col = state.tab[m.from.i];
    s.tab[m.from.i] = { down: col.down, up: col.up.slice(0, col.up.length - n) };
  }
  if (m.to.pile === "found") s.found[m.to.i] = [...s.found[m.to.i], ...cards];
  else { const col = s.tab[m.to.i]; s.tab[m.to.i] = { down: col.down, up: [...col.up, ...cards] }; }
  // a column whose face-up cards are all gone turns its top face-down card over
  let flipped = null;
  if (m.from.pile === "tab") {
    const col = s.tab[m.from.i];
    if (!col.up.length && col.down.length) {
      const card = top(col.down);
      s.tab[m.from.i] = { down: col.down.slice(0, -1), up: [card] };
      flipped = { i: m.from.i, card };
    }
  }
  return { state: s, flipped };
}

export const won = (state) => state.found.every((f) => f.length === 13);
export const foundCount = (state) => state.found.reduce((a, f) => a + f.length, 0);
export const hiddenCount = (state) => state.tab.reduce((a, c) => a + c.down.length, 0);

// Every legal move except drawing.
export function moves(state) {
  const out = [];
  const tops = [];
  if (state.waste.length) tops.push({ pile: "waste", i: 0 });
  for (let i = 0; i < 7; i++) if (state.tab[i].up.length) tops.push({ pile: "tab", i });
  for (const from of tops) {
    const c = cardsOf(state, from)[0];
    if (fitsFound(c, state.found)) out.push({ type: "move", from, to: { pile: "found", i: suitOf(c) }, n: 1 });
  }
  // runs from columns, and single cards from the waste and foundations, onto columns
  for (let i = 0; i < 7; i++) {
    const up = state.tab[i].up;
    for (let n = 1; n <= up.length; n++) {
      const c = up[up.length - n];
      for (let j = 0; j < 7; j++) if (j !== i && fitsTab(c, state.tab[j])) out.push({ type: "move", from: { pile: "tab", i }, to: { pile: "tab", i: j }, n });
    }
  }
  if (state.waste.length) {
    const c = top(state.waste);
    for (let j = 0; j < 7; j++) if (fitsTab(c, state.tab[j])) out.push({ type: "move", from: { pile: "waste", i: 0 }, to: { pile: "tab", i: j }, n: 1 });
  }
  for (let s = 0; s < 4; s++) {
    const c = top(state.found[s]);
    if (c === undefined) continue;
    for (let j = 0; j < 7; j++) if (fitsTab(c, state.tab[j])) out.push({ type: "move", from: { pile: "found", i: s }, to: { pile: "tab", i: j }, n: 1 });
  }
  return out;
}

// When every card is face up and the stock and waste are empty, the rest is automatic: the next
// card that can go to a foundation, or null.
export function autoMove(state) {
  if (hiddenCount(state) || state.stock.length || state.waste.length) return null;
  for (let i = 0; i < 7; i++) {
    const c = top(state.tab[i].up);
    if (c !== undefined && fitsFound(c, state.found)) return { type: "move", from: { pile: "tab", i }, to: { pile: "found", i: suitOf(c) }, n: 1 };
  }
  return null;
}
