// Logic tests for the rules and the bot. Run: node --test
import { test } from "node:test";
import assert from "node:assert/strict";
import { deal, apply, legal, moves, won, foundCount, hiddenCount, autoMove, fitsTab, fitsFound } from "./game.mjs";
import { decide, view, key } from "./bot.mjs";
import { playOut } from "./measure.mjs";

const c = (rank, suit) => "SHDC".indexOf(suit) * 13 + ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"].indexOf(rank);

test("a deal: 28 cards in seven columns, the last of each face up, 24 in the stock", () => {
  const s = deal(1);
  assert.deepEqual(s.tab.map((col) => [col.down.length, col.up.length]), [0, 1, 2, 3, 4, 5, 6].map((d) => [d, 1]));
  assert.equal(s.stock.length, 24);
  const all = [...s.stock, ...s.tab.flatMap((col) => [...col.down, ...col.up])].sort((a, b) => a - b);
  assert.deepEqual(all, [...Array(52).keys()]);
  assert.deepEqual(deal(1), s, "the same seed deals the same game");
});

test("columns build down in alternating colors; an empty column takes only a king", () => {
  const col = (up, down = []) => ({ down, up });
  assert.ok(fitsTab(c("9", "H"), col([c("10", "S")])));
  assert.ok(!fitsTab(c("9", "D"), col([c("10", "H")])), "same color");
  assert.ok(!fitsTab(c("8", "H"), col([c("10", "S")])), "skips a rank");
  assert.ok(fitsTab(c("K", "D"), col([])));
  assert.ok(!fitsTab(c("Q", "D"), col([])));
  assert.ok(!fitsTab(c("K", "D"), col([], [5])), "face-down cards aren't an empty column");
});

test("foundations build up by suit from the ace", () => {
  const found = [[], [], [], []];
  assert.ok(fitsFound(c("A", "H"), found));
  assert.ok(!fitsFound(c("2", "H"), found));
  found[1] = [c("A", "H")];
  assert.ok(fitsFound(c("2", "H"), found));
});

test("drawing turns stock cards onto the waste, and an empty stock turns the waste back over", () => {
  let s = deal(2);
  const order = s.stock.slice().reverse();
  for (let i = 0; i < 24; i++) s = apply(s, { type: "draw" }).state;
  assert.deepEqual(s.waste, order);
  assert.equal(s.stock.length, 0);
  s = apply(s, { type: "draw" }).state;
  assert.equal(s.waste.length, 0);
  assert.deepEqual(s.stock.slice().reverse(), order);
});

test("moving a column's last face-up cards turns the next one over", () => {
  const s = { seed: 0, moves: 0, stock: [], waste: [], found: [[], [], [], []], tab: [
    { down: [c("2", "C")], up: [c("9", "H"), c("8", "S")] }, { down: [], up: [c("10", "S")] },
    { down: [], up: [] }, { down: [], up: [] }, { down: [], up: [] }, { down: [], up: [] }, { down: [], up: [] }] };
  const m = { type: "move", from: { pile: "tab", i: 0 }, to: { pile: "tab", i: 1 }, n: 2 };
  assert.ok(legal(s, m));
  const { state, flipped } = apply(s, m);
  assert.deepEqual(state.tab[1].up, [c("10", "S"), c("9", "H"), c("8", "S")]);
  assert.deepEqual(state.tab[0], { down: [], up: [c("2", "C")] });
  assert.deepEqual(flipped, { i: 0, card: c("2", "C") });
  assert.ok(!legal(s, { type: "move", from: { pile: "tab", i: 0 }, to: { pile: "tab", i: 1 }, n: 1 }), "8♠ alone doesn't go on 10♠");
});

test("every move the rules list is legal", () => {
  let s = deal(3);
  for (let i = 0; i < 40; i++) {
    for (const m of moves(s)) assert.ok(legal(s, m), JSON.stringify(m));
    s = apply(s, moves(s)[0] || { type: "draw" }).state;
  }
});

test("the bot only plays legal moves and never sees face-down cards", () => {
  let s = deal(4);
  const seen = new Set([key(view(s))]);
  // two deals that differ only in which cards are face down look the same to it
  for (let i = 0; i < 300 && !won(s); i++) {
    const p = decide(s, seen);
    if (!p.move) break;
    assert.ok(legal(s, p.move), JSON.stringify(p.move));
    s = apply(s, p.move).state;
    if (p.move.type !== "draw") seen.add(key(view(s)));
  }
  const a = deal(5), b = structuredClone(a);
  b.tab[6].down = b.tab[6].down.slice().reverse();
  assert.deepEqual(view(a), view(b));
  assert.deepEqual(decide(a, new Set()), decide(b, new Set()));
});

test("the last cards go home on their own once everything is face up", () => {
  const s = { seed: 0, moves: 0, stock: [], waste: [], found: [[], [], [], []], tab: Array.from({ length: 7 }, () => ({ down: [], up: [] })) };
  s.found = [[...Array(13).keys()], [...Array(12).keys()].map((k) => 13 + k), [...Array(13).keys()].map((k) => 26 + k), [...Array(13).keys()].map((k) => 39 + k)];
  s.tab[3].up = [c("K", "H")];
  const m = autoMove(s);
  assert.ok(m);
  assert.ok(won(apply(s, m).state));
});

test("the bot wins a good share of deals", { timeout: 120000 }, () => {
  let wins = 0;
  for (let seed = 1; seed <= 30; seed++) if (playOut(seed).won) wins++;
  assert.ok(wins >= 9, `won ${wins} of 30`);
});

