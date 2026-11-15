import test from "node:test";
import assert from "node:assert/strict";
import { apply, newTable, player, pot, total, lastUndoable, COLORS } from "./core.mjs";

function table() {
  let s = newTable({ code: "ABCDE", host: { name: "Host", color: COLORS[0] }, start: 100 });
  for (const [id, name, color] of [["pa", "Ann", COLORS[1]], ["pb", "Bob", COLORS[2]]]) {
    s = ok(apply(s, { type: "join", id, name, color }, id));
  }
  return s;
}
const ok = (r) => { assert.equal(r.error, undefined, r.error); return r.state; };
const err = (r, re) => { assert.ok(r.error, "expected an error"); if (re) assert.match(r.error, re); };
const P = (id) => ({ k: "p", id }), POT = (id) => ({ k: "pot", id });

test("a new table has the host, one pot, and the start stack", () => {
  const s = table();
  assert.equal(s.players.length, 3);
  assert.equal(s.pots.length, 1);
  assert.equal(total(s), 300);
});

test("joining needs a name and a free color", () => {
  const s = table();
  err(apply(s, { type: "join", id: "pc", name: "  ", color: COLORS[3] }, "pc"), /name/);
  err(apply(s, { type: "join", id: "pc", name: "Cy", color: COLORS[1] }, "pc"), /color/);
  err(apply(s, { type: "join", id: "pc", name: "Cy", color: "#123456" }, "pc"));
  err(apply(s, { type: "join", id: "px", name: "Cy", color: COLORS[3] }, "pa"), /already/);
});

test("players bet their own chips into a pot and give to each other", () => {
  let s = table();
  const potId = s.pots[0].id;
  s = ok(apply(s, { type: "transfer", from: P("pa"), to: POT(potId), amount: 30 }, "pa"));
  s = ok(apply(s, { type: "transfer", from: P("pa"), to: P("pb"), amount: 10 }, "pa"));
  assert.equal(player(s, "pa").chips, 60);
  assert.equal(player(s, "pb").chips, 110);
  assert.equal(pot(s, potId).chips, 30);
  assert.equal(total(s), 300);
});

test("players can't take other people's chips or the pot's", () => {
  let s = table();
  const potId = s.pots[0].id;
  s = ok(apply(s, { type: "transfer", from: P("pa"), to: POT(potId), amount: 30 }, "pa"));
  err(apply(s, { type: "transfer", from: P("pb"), to: P("pa"), amount: 10 }, "pa"), /aren't your/);
  err(apply(s, { type: "transfer", from: POT(potId), to: P("pa"), amount: 10 }, "pa"), /aren't your/);
  err(apply(s, { type: "award", pot: potId, winners: ["pa"] }, "pa"), /host/);
  err(apply(s, { type: "setChips", target: P("pa"), amount: 9999 }, "pa"), /host/);
  err(apply(s, { type: "transfer", from: P("pa"), to: P("pb"), amount: 71 }, "pa"), /only have/);
  err(apply(s, { type: "transfer", from: P("pa"), to: P("pb"), amount: -5 }, "pa"));
  err(apply(s, { type: "transfer", from: P("pa"), to: P("pb"), amount: 1.5 }, "pa"));
  err(apply(s, { type: "transfer", from: P("pa"), to: P("pa"), amount: 1 }, "pa"));
  err(apply(s, { type: "transfer", from: P("pa"), to: P("pb"), amount: 1 }, "stranger"), /not at this table/);
});

test("the host moves anyone's chips", () => {
  let s = table();
  s = ok(apply(s, { type: "transfer", from: P("pa"), to: P("pb"), amount: 25 }, s.hostId));
  assert.equal(player(s, "pa").chips, 75);
  assert.equal(player(s, "pb").chips, 125);
  assert.match(JSON.stringify(s.log.at(-1).parts), /moved/);
});

test("awarding splits evenly and leaves the odd chips in the pot", () => {
  let s = table();
  const potId = s.pots[0].id;
  for (const id of ["pa", "pb"]) s = ok(apply(s, { type: "transfer", from: P(id), to: POT(potId), amount: 50 }, id));
  s = ok(apply(s, { type: "transfer", from: P(s.hostId), to: POT(potId), amount: 1 }, s.hostId));
  s = ok(apply(s, { type: "award", pot: potId, winners: ["pa", "pb"] }, s.hostId));
  assert.equal(player(s, "pa").chips, 100);
  assert.equal(player(s, "pb").chips, 100);
  assert.equal(pot(s, potId).chips, 1);
  err(apply(s, { type: "award", pot: potId, winners: ["pa", "pb"] }, s.hostId), /split/);
  s = ok(apply(s, { type: "award", pot: potId, winners: ["pa"] }, s.hostId));
  assert.equal(pot(s, potId).chips, 0);
  assert.equal(total(s), 300);
});

test("pots come and go; a pot with chips can't be removed", () => {
  let s = table();
  const first = s.pots[0].id;
  s = ok(apply(s, { type: "addPot" }, s.hostId));
  assert.equal(s.pots[1].name, "Side pot");
  s = ok(apply(s, { type: "addPot" }, s.hostId));
  assert.equal(s.pots[2].name, "Side pot 2");
  s = ok(apply(s, { type: "transfer", from: P("pa"), to: POT(first), amount: 5 }, "pa"));
  err(apply(s, { type: "removePot", id: first }, s.hostId), /first/);
  err(apply(s, { type: "addPot" }, "pa"), /host/);
  for (const p of s.pots.slice(1)) s = ok(apply(s, { type: "removePot", id: p.id }, s.hostId));
  s = ok(apply(s, { type: "award", pot: first, winners: ["pb"] }, s.hostId));
  s = ok(apply(s, { type: "removePot", id: first }, s.hostId));
  assert.equal(s.pots.length, 0);
  s = ok(apply(s, { type: "addPot" }, s.hostId));
  assert.equal(s.pots[0].name, "Pot");
  s = ok(apply(s, { type: "renamePot", id: s.pots[0].id, name: "Kitty" }, s.hostId));
  assert.equal(s.pots[0].name, "Kitty");
});

test("undo reverses a chip move, but not if the chips are already spent", () => {
  let s = table();
  const potId = s.pots[0].id;
  s = ok(apply(s, { type: "transfer", from: P("pa"), to: POT(potId), amount: 40 }, "pa"));
  const bet = lastUndoable(s);
  err(apply(s, { type: "undo", entry: bet.id }, "pa"), /host/);
  s = ok(apply(s, { type: "undo", entry: bet.id }, s.hostId));
  assert.equal(player(s, "pa").chips, 100);
  assert.equal(pot(s, potId).chips, 0);
  err(apply(s, { type: "undo", entry: bet.id }, s.hostId), /Already/);
  s = ok(apply(s, { type: "transfer", from: P("pa"), to: P("pb"), amount: 100 }, "pa"));
  const gift = lastUndoable(s);
  s = ok(apply(s, { type: "transfer", from: P("pb"), to: POT(potId), amount: 200 }, "pb"));
  err(apply(s, { type: "undo", entry: gift.id }, s.hostId), /give back/);
});

test("set chips, edit me, remove player", () => {
  let s = table();
  s = ok(apply(s, { type: "setChips", target: P("pa"), amount: 500 }, s.hostId));
  assert.equal(player(s, "pa").chips, 500);
  s = ok(apply(s, { type: "undo", entry: lastUndoable(s).id }, s.hostId));
  assert.equal(player(s, "pa").chips, 100);
  s = ok(apply(s, { type: "editMe", name: "Annie", color: COLORS[5] }, "pa"));
  assert.equal(player(s, "pa").name, "Annie");
  err(apply(s, { type: "editMe", name: "Annie", color: COLORS[2] }, "pa"), /color/);
  err(apply(s, { type: "removePlayer", id: "pb" }, "pa"), /host/);
  err(apply(s, { type: "removePlayer", id: s.hostId }, s.hostId));
  s = ok(apply(s, { type: "removePlayer", id: "pb" }, s.hostId));
  assert.equal(s.players.length, 2);
  err(apply(s, { type: "transfer", from: P("pb"), to: P("pa"), amount: 1 }, "pb"), /not at this table/);
});

test("apply never mutates its input", () => {
  const s = table(), before = JSON.stringify(s);
  apply(s, { type: "transfer", from: P("pa"), to: P("pb"), amount: 5 }, "pa");
  apply(s, { type: "award", pot: s.pots[0].id, winners: ["pa"] }, s.hostId);
  assert.equal(JSON.stringify(s), before);
});
