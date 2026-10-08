// The game's rules and bookkeeping, with no DOM and no animation, so the page and the tests share
// them. A stack is an array of pancake sizes 1..n listed from the top down; it's sorted when it
// reads 1, 2, …, n (smallest on top).

// flip the top k pancakes: they come off as a block and land upside down, so their order reverses
export function flip(stack, k) {
  return stack.slice(0, k).reverse().concat(stack.slice(k));
}

export function sorted(n) {
  return Array.from({ length: n }, (_, i) => i + 1);
}

export function isSorted(stack) {
  return stack.every((s, i) => s === i + 1);
}

// a uniformly random order that isn't already sorted (or a single flip from sorted, which
// would be no puzzle at all)
export function scramble(n, rand = Math.random) {
  for (;;) {
    const s = sorted(n);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [s[i], s[j]] = [s[j], s[i]];
    }
    if (n < 3 || fewestFlips(s) > 1) return s;
  }
}

// ---------- fewest flips ----------
// Iterative deepening search with the gap count as its estimate. A "gap" is a place in the
// stack where two neighbors aren't consecutive sizes (counting the griddle under the bottom as
// size n+1). One flip only changes the pair at the spatula, so it closes at most one gap, and
// a stack with g gaps needs at least g more flips. That makes the search exact and quick for
// stacks this size.
export function gaps(stack) {
  let g = 0;
  for (let i = 0; i < stack.length; i++) {
    const below = i + 1 < stack.length ? stack[i + 1] : stack.length + 1;
    if (Math.abs(stack[i] - below) !== 1) g++;
  }
  return g;
}

export function fewestFlips(start) {
  const s = start.slice(), n = s.length;
  if (isSorted(s)) return 0;
  const below = (i) => (i + 1 < n ? s[i + 1] : n + 1);
  const rev = (k) => {
    for (let a = 0, b = k - 1; a < b; a++, b--) [s[a], s[b]] = [s[b], s[a]];
  };
  // the gap count after flipping the top k only differs at the spatula: s[k-1]|s[k] becomes s[0]|s[k]
  const gapDelta = (k) => {
    const was = Math.abs(s[k - 1] - below(k - 1)) !== 1, now = Math.abs(s[0] - below(k - 1)) !== 1;
    return (now ? 1 : 0) - (was ? 1 : 0);
  };
  let bound = gaps(s);
  const search = (depth, g, last) => {
    if (g === 0) return isSorted(s) ? depth : -1;
    if (depth + g > bound) return -1;
    for (let k = 2; k <= n; k++) {
      if (k === last) continue; // flipping the same k twice undoes it
      const d = gapDelta(k);
      rev(k);
      const r = search(depth + 1, g + d, k);
      rev(k);
      if (r >= 0) return r;
    }
    return -1;
  };
  for (;;) {
    const r = search(0, gaps(s), 0);
    if (r >= 0) return r;
    bound++;
  }
}

// ---------- history ----------
// Every flip is its own undo, so the history is just the list of k's and a cursor; flips past
// the cursor are the ones redo would play again.
export class History {
  constructor() { this.clear(); }
  clear() { this.flips = []; this.cursor = 0; }
  record(k) {
    this.flips.length = this.cursor;
    this.flips.push(k);
    this.cursor++;
  }
  get canUndo() { return this.cursor > 0; }
  get canRedo() { return this.cursor < this.flips.length; }
  // the flip to play to undo or redo, or null
  undo() { return this.canUndo ? this.flips[--this.cursor] : null; }
  redo() { return this.canRedo ? this.flips[this.cursor++] : null; }
  get count() { return this.cursor; }
}

// ---------- solve timer (copied from cutwist's session.mjs) ----------
// Armed by a scramble; the first flip after starts it; sorting the stack stops it.
// now: a clock in ms (performance.now in the page).
export class SolveTimer {
  constructor(now = () => performance.now()) {
    this.now = now;
    this.clear();
  }
  // hidden: no scramble to time
  clear() { this.t = null; }
  arm() { this.t = { acc: 0, since: null, done: false }; }
  // "hidden" | "armed" | "running" | "done"
  get state() {
    const t = this.t;
    if (!t) return "hidden";
    if (t.done) return "done";
    return t.since !== null ? "running" : "armed";
  }
  get ms() {
    const t = this.t;
    return t ? t.acc + (t.since !== null ? this.now() - t.since : 0) : 0;
  }
  // a flip: starts an armed timer
  turn() {
    const t = this.t;
    if (!t || t.done || t.since !== null) return;
    t.since = this.now();
  }
  solved() {
    const t = this.t;
    if (!t || t.since === null) return;
    t.acc = this.ms;
    t.since = null;
    t.done = true;
  }
}

// 12.34, or 1:02.34 past a minute
export function formatTime(ms) {
  const cs = Math.floor(ms / 10), s = Math.floor(cs / 100), m = Math.floor(s / 60);
  const tail = `${String(s % 60).padStart(m ? 2 : 1, "0")}.${String(cs % 100).padStart(2, "0")}`;
  return m ? `${m}:${tail}` : tail;
}
