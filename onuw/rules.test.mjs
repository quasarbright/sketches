// Engine tests against the official rules: the base game, Daybreak, Bonus Packs 1 and 2, Vampire
// (Copycat, Gremlin) and Alien (wake order), plus the designer rulings in the FAQs. Each test names
// the rule it checks. Cases already covered in engine.test.mjs aren't repeated here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRoom, handle, tick, resolveVotes, effRole, tableLine } from "./engine.mjs";
import { NIGHT_STEPS, ROLES } from "./roles.mjs";

const FAST = { timing: { stepMin: 100, stepJitter: 0 } };

function room(names) {
  const s = createRoom("TEST", { id: names[0], name: names[0].toUpperCase() }, 0, FAST);
  for (const n of names.slice(1)) handle(s, n, { t: "hello", name: n.toUpperCase() }, 0);
  return s;
}

// Deal fixed cards: `seats` maps player -> card, `center` is the 3 center cards.
function rig(seats, center, spare = null) {
  const s = room(Object.keys(seats));
  const roles = {};
  for (const r of [...Object.values(seats), ...center]) roles[r] = (roles[r] || 0) + 1;
  assert.equal(handle(s, s.hostId, { t: "setRoles", roles }, 0).error, undefined);
  assert.equal(handle(s, s.hostId, { t: "start" }, 0).error, undefined);
  s.g.seats = Object.keys(seats);
  s.g.dealt = { ...seats };
  s.g.cards = { ...seats };
  s.g.center = [...center];
  s.g.spare = spare ?? (roles.packleader ? "werewolf" : null);
  return s;
}

const act = (s, pid, body) => handle(s, pid, { t: "act", step: s.g.step.id, ...body }, s.now ?? 0);
const info = (s, pid) => (s.g.info[pid] || []).map((i) => i.text).join(" | ");

// Skip each open turn; a required one takes the first allowed choice.
function skipStep(s) {
  for (const a of s.g.step.actors) {
    let guard = 0;
    while (!s.g.step.done[a]) {
      assert.ok(guard++ < 5, `${a} is stuck on ${s.g.step.id}`);
      const p = s.g.step.prompts[a];
      const body = !p.required ? { skip: true } : p.kind === "center1" ? { center: 0 }
        : { target: s.g.seats.find((t) => !(p.exclude || []).includes(t)) };
      handle(s, a, { t: "act", step: s.g.step.id, ...body }, s.now);
    }
  }
  s.now += 150; tick(s, s.now);
}

// Run the night up to the start of `stepId`, skipping (or acking) every turn before it.
function nightTo(s, stepId) {
  if (s.phase === "deal") { s.now = 0; for (const id of s.g.seats) handle(s, id, { t: "peeked" }, 0); }
  let guard = 0;
  while (s.phase === "night" && s.g.step.id !== stepId) {
    assert.ok(guard++ < 500, `stuck before ${stepId}`);
    const before = s.g.stepIdx;
    if (Object.keys(s.g.step.done).length === s.g.step.actors.length || !s.g.step.actors.length) { s.now += 150; tick(s, s.now); }
    else skipStep(s);
    if (s.g.stepIdx === before && s.phase === "night") { s.now += 150; tick(s, s.now); }
  }
  assert.equal(s.phase === "night" ? s.g.step.id : null, stepId, `the night never reached ${stepId}`);
  return s;
}
// Skip every remaining turn to the day. `step` advances past the current one first when it's done.
function finishNight(s) {
  if (s.phase === "deal") nightTo(s, s.g.steps[0]);
  let guard = 0;
  while (s.phase === "night") { assert.ok(guard++ < 500); skipStep(s); }
  return s;
}
// Vote and resolve: `votes` maps voter -> target.
function vote(s, votes) {
  finishNight(s);
  handle(s, s.hostId, { t: "hostSkipDay" }, s.now);
  for (const [p, t] of Object.entries(votes)) assert.equal(handle(s, p, { t: "vote", target: t }, s.now).error, undefined);
  if (s.phase !== "results") handle(s, s.hostId, { t: "hostEndVote" }, s.now);
  return s.g.result;
}
// Pure vote resolution from final cards.
const resolve = (cards, votes) => resolveVotes(Object.keys(cards), votes, cards);
const sorted = (a) => [...a].sort();

// ---------------------------------------------------------------- wake order

test("night steps follow the official wake order", () => {
  const ids = NIGHT_STEPS.map((s) => s.id);
  const before = (a, b) => assert.ok(ids.indexOf(a) < ids.indexOf(b), `${a} wakes before ${b}`);
  // base game: Doppelganger, Werewolves, Minion, Masons, Seer, Robber, Troublemaker, Drunk, Insomniac
  const base = ["lookalike", "wolves", "lackey", "masons", "seer", "thief", "meddler", "sleepwalker", "nightowl"];
  for (let i = 1; i < base.length; i++) before(base[i - 1], base[i]);
  before("copycat", "lookalike");           // Vampire: the Copycat wakes at dusk, before the Doppelganger
  before("wolves", "packleader"); before("packleader", "prowler"); before("prowler", "lackey"); // Daybreak 2-B, 2-C
  before("lackey", "apprentice"); before("apprentice", "masons");                             // Bonus Pack 2: 3-B
  before("seer", "noviceseer"); before("noviceseer", "investigator"); before("investigator", "thief"); // 5-B, 5-C
  before("thief", "witch"); before("witch", "meddler");                                       // 6-B
  before("meddler", "aurareader"); before("aurareader", "imp"); before("imp", "sleepwalker"); // 7-C, 7-D
  before("nightowl", "scout"); before("scout", "watcher"); before("watcher", "unveiler");     // 9-C, 9-Z, 10
  assert.equal(ids.at(-1), "unveiler", "the Revealer wakes last");
});

test("a step runs for a card in the center too, so the night's length doesn't give it away", () => {
  const s = rig({ a: "villager", b: "villager", c: "werewolf" }, ["seer", "thief", "nightowl"]);
  for (const id of ["seer", "thief", "nightowl"]) assert.ok(s.g.steps.includes(id));
  nightTo(s, "seer");
  assert.deepEqual(s.g.step.actors, []);
});

test("night roles come from the starting card: taking a card never gives its night action", () => {
  // Witch takes the Seer onto herself; the Drunk takes the Insomniac; the Robber takes the Masons' card
  const s = rig({ a: "witch", b: "sleepwalker", c: "thief", d: "mason", e: "werewolf" }, ["seer", "nightowl", "mason"]);
  nightTo(s, "masons");
  assert.deepEqual(s.g.step.actors, ["d"]);
  nightTo(s, "thief"); act(s, "c", { target: "d" });
  nightTo(s, "witch"); act(s, "a", { center: 0 }); act(s, "a", { target: "a" });
  assert.equal(s.g.cards.a, "seer");
  nightTo(s, "sleepwalker"); act(s, "b", { center: 1 });
  assert.equal(s.g.cards.b, "nightowl");
  nightTo(s, "nightowl");
  assert.deepEqual(s.g.step.actors, [], "the Drunk holding the Insomniac doesn't wake");
  assert.equal(s.g.cards.c, "mason");
});

// ---------------------------------------------------------------- werewolves

test("the wolves see each other; a lone wolf may look at one center card", () => {
  let s = rig({ a: "werewolf", b: "prowler", c: "villager" }, ["seer", "villager", "thief"]);
  nightTo(s, "wolves");
  assert.deepEqual(sorted(s.g.step.actors), ["a", "b"], "the Mystic Wolf wakes with the wolves");
  assert.equal(s.g.step.prompts.a.kind, "ack", "a wolf with another wolf isn't alone");
  assert.match(s.g.step.prompts.a.text, /B/);

  s = rig({ a: "werewolf", b: "villager", c: "seer" }, ["werewolf", "villager", "thief"]);
  nightTo(s, "wolves");
  assert.equal(s.g.step.prompts.a.kind, "center1");
  assert.equal(s.g.step.prompts.a.optional, true);
  assert.ok(act(s, "a", { center: 3 }).error, "only the 3 center cards");
  assert.equal(act(s, "a", { center: 0 }).error, undefined);
  assert.match(info(s, "a"), /You saw center card 1\. It's the Werewolf/);
});

test("the Mystic Wolf may look at one other player's card on her own turn", () => {
  const s = rig({ a: "prowler", b: "seer", c: "villager" }, ["werewolf", "villager", "thief"]);
  nightTo(s, "prowler");
  assert.equal(s.g.step.prompts.a.optional, true);
  assert.ok(act(s, "a", { target: "a" }).error, "not her own card");
  assert.equal(act(s, "a", { target: "b" }).error, undefined);
  assert.match(info(s, "a"), /You saw B's card\. It's the Seer/);
});

test("the Alpha Wolf must give the spare Werewolf card away; with only wolves left, nothing moves", () => {
  let s = rig({ a: "packleader", b: "villager", c: "seer" }, ["werewolf", "villager", "thief"]);
  nightTo(s, "packleader");
  assert.equal(act(s, "a", { skip: true }).error, "A choice is required", "the exchange is mandatory (designer ruling)");
  assert.ok(act(s, "a", { target: "a" }).error, "not her own card");
  act(s, "a", { target: "c" });
  assert.equal(s.g.cards.c, "werewolf");
  assert.equal(s.g.spare, "seer");
  // c doesn't learn about it, and is now a Werewolf for the vote
  assert.equal(info(s, "c"), "");
  assert.equal(effRole(s.g, s.g.cards.c), "werewolf");
  const r = vote(s, { a: "b", b: "c", c: "b" });
  assert.deepEqual(r.dead, ["b"]);
  assert.deepEqual(sorted(r.winners), ["a", "c"], "c wins with the wolves");

  s = rig({ a: "packleader", b: "werewolf", c: "dozingwolf" }, ["seer", "villager", "thief"]);
  nightTo(s, "packleader");
  assert.equal(s.g.step.prompts.a.kind, "ack");
  act(s, "a", {});
  assert.equal(s.g.spare, "werewolf");
});

test("the Dream Wolf can't be given the spare card: the Alpha Wolf knows she's a wolf", () => {
  const s = rig({ a: "packleader", b: "dozingwolf", c: "villager", d: "seer" }, ["werewolf", "villager", "thief"]);
  nightTo(s, "packleader");
  assert.ok(act(s, "a", { target: "b" }).error);
  assert.equal(act(s, "a", { target: "c" }).error, undefined);
});

// ---------------------------------------------------------------- Minion, Squire, Masons

test("the Minion sees the wolves (including the Dream Wolf), or that no player is a wolf", () => {
  let s = rig({ a: "lackey", b: "werewolf", c: "dozingwolf", d: "villager" }, ["seer", "villager", "thief"]);
  nightTo(s, "lackey");
  assert.match(s.g.step.prompts.a.text, /wolves are B and C/);
  s = rig({ a: "lackey", b: "villager", c: "seer" }, ["werewolf", "werewolf", "thief"]);
  nightTo(s, "lackey");
  assert.match(s.g.step.prompts.a.text, /No player is a wolf/);
});

test("the Squire wakes after the Insomniac and sees the wolves' cards as they are at the end of the night", () => {
  const s = rig({ a: "scout", b: "werewolf", c: "thief", d: "villager" }, ["seer", "villager", "meddler"]);
  nightTo(s, "thief"); act(s, "c", { target: "b" });
  nightTo(s, "scout");
  const p = s.g.step.prompts.a;
  assert.match(p.text, /wolf is B/, "B started as the wolf and shows a thumb");
  assert.deepEqual(p.cards, [{ label: "B", role: "thief" }], "the Squire sees B is no longer a wolf");
});

test("Masons see each other; a lone Mason learns the other is in the center", () => {
  let s = rig({ a: "mason", b: "mason", c: "werewolf" }, ["seer", "villager", "thief"]);
  nightTo(s, "masons");
  assert.match(s.g.step.prompts.a.text, /other Mason is B/);
  s = rig({ a: "mason", b: "villager", c: "werewolf" }, ["mason", "villager", "thief"]);
  nightTo(s, "masons");
  assert.match(s.g.step.prompts.a.text, /only Mason/);
});

// ---------------------------------------------------------------- seers and lookers

test("the Seer looks at one other player or two different center cards, never her own", () => {
  const s = rig({ a: "seer", b: "werewolf", c: "villager" }, ["thief", "villager", "meddler"]);
  nightTo(s, "seer");
  assert.ok(act(s, "a", { target: "a" }).error);
  assert.ok(act(s, "a", { center: [1, 1] }).error);
  assert.ok(act(s, "a", { center: [0] }).error);
  assert.equal(act(s, "a", { center: [0, 2] }).error, undefined);
  assert.match(info(s, "a"), /They're the Robber and the Troublemaker/);
});

test("the Apprentice Seer looks at exactly one center card, and may skip", () => {
  const s = rig({ a: "noviceseer", b: "werewolf", c: "villager" }, ["thief", "villager", "meddler"]);
  nightTo(s, "noviceseer");
  assert.ok(act(s, "a", { target: "b" }).error);
  assert.equal(act(s, "a", { skip: true }).error, undefined);
});

test("the Paranormal Investigator becomes the Tanner on seeing one, and then wins only by dying", () => {
  const s = rig({ a: "investigator", b: "jester", c: "werewolf", d: "villager" }, ["seer", "villager", "thief"]);
  nightTo(s, "investigator");
  act(s, "a", { target: "b" });
  assert.ok(s.g.step.done.a, "seeing the Tanner ends the turn");
  assert.equal(s.g.copied.investigator, "jester");
  const r = vote(s, { a: "c", b: "a", c: "a", d: "a" });
  assert.deepEqual(r.dead, ["a"]);
  assert.ok(r.winners.includes("a"), "the turned P.I. wins by dying");
  assert.equal(r.wolfTeam, false, "and, like a Tanner, stops the wolves");
});

test("every kind of wolf turns the Paranormal Investigator (designer ruling)", () => {
  for (const wolf of ["werewolf", "packleader", "prowler", "dozingwolf", "greatwolf"]) {
    const s = rig({ a: "investigator", b: wolf, c: "villager", d: "seer" }, ["villager", "werewolf", "thief"]);
    nightTo(s, "investigator");
    act(s, "a", { target: "b" });
    assert.equal(s.g.copied.investigator, wolf, wolf);
  }
  // the Minion isn't a wolf: the P.I. keeps looking
  const s = rig({ a: "investigator", b: "lackey", c: "villager", d: "werewolf" }, ["villager", "seer", "thief"]);
  nightTo(s, "investigator");
  act(s, "a", { target: "b" });
  assert.equal(s.g.step.done.a, undefined);
  assert.ok(act(s, "a", { target: "b" }).error, "the second look is at a different player");
});

test("a turned P.I.'s side moves with the card (FAQ: allegiance follows the card)", () => {
  const s = rig({ a: "investigator", b: "werewolf", c: "meddler", d: "villager", e: "seer" }, ["villager", "werewolf", "thief"]);
  nightTo(s, "investigator"); act(s, "a", { target: "b" });
  nightTo(s, "meddler"); act(s, "c", { targets: ["a", "d"] });
  const r = vote(s, { a: "d", b: "a", c: "d", d: "a", e: "d" });
  assert.equal(r.effective.d, "werewolf", "d holds the P.I. card that turned wolf");
  assert.equal(r.effective.a, "villager");
  assert.deepEqual(r.dead, ["d"]);
  assert.equal(r.village, true);
});

test("the Beholder wakes after the Insomniac and sees the seers' cards as they are then", () => {
  const s = rig({ a: "watcher", b: "seer", c: "thief", d: "werewolf" }, ["noviceseer", "villager", "meddler"]);
  nightTo(s, "thief"); act(s, "c", { target: "b" });
  nightTo(s, "watcher");
  const p = s.g.step.prompts.a;
  assert.match(p.text, /B started as the Seer/);
  assert.doesNotMatch(p.text, /Apprentice Seer/, "a center Apprentice Seer has no thumb to show");
  assert.deepEqual(p.cards, [{ label: "B", role: "thief" }]);
});

test("the Aura Seer sees who looked or moved before her, but not the Gremlin or the Drunk who wake after", () => {
  const s = rig({ a: "aurareader", b: "werewolf", c: "witch", d: "lackey", e: "imp", f: "sleepwalker", g: "prowler" },
    ["villager", "seer", "villager"]);
  nightTo(s, "wolves"); for (const w of ["b", "g"]) act(s, w, {});
  nightTo(s, "prowler"); act(s, "g", { target: "a" });
  nightTo(s, "lackey"); act(s, "d", {});
  nightTo(s, "witch"); act(s, "c", { center: 1 }); act(s, "c", { target: "c" });
  nightTo(s, "aurareader");
  const t = s.g.step.prompts.a.text;
  assert.match(t, /^C and G moved or looked/, t);
  for (const n of ["B", "D", "E", "F"]) assert.doesNotMatch(t, new RegExp(`\\b${n}\\b`));
});

test("the Revealer turns a Tanner or Dream Wolf card back face down", () => {
  for (const hidden of ["jester", "dozingwolf"]) {
    const s = rig({ a: "unveiler", b: hidden, c: "villager" }, ["werewolf", "seer", "thief"]);
    nightTo(s, "unveiler"); act(s, "a", { target: "b" });
    finishNight(s);
    assert.deepEqual(s.g.revealed, [], hidden);
  }
});

test("the Insomniac sees her card after a swap, and is told when she changed teams", () => {
  const s = rig({ a: "nightowl", b: "werewolf", c: "meddler", d: "villager" }, ["seer", "villager", "thief"]);
  nightTo(s, "meddler"); act(s, "c", { targets: ["a", "b"] });
  nightTo(s, "nightowl");
  assert.match(s.g.step.prompts.a.text, /now the Werewolf\. You're on the wolf team now/);
});

// ---------------------------------------------------------------- movers

test("the Robber may only swap with another player; the robbed player isn't told", () => {
  const s = rig({ a: "thief", b: "werewolf", c: "villager" }, ["seer", "villager", "meddler"]);
  nightTo(s, "thief");
  assert.ok(act(s, "a", { target: "a" }).error);
  act(s, "a", { target: "b" });
  assert.doesNotMatch(info(s, "b"), /swap|Robber/);
  const r = vote(s, { a: "c", b: "a", c: "a" });
  assert.deepEqual(r.dead, ["a"], "the Robber took the Werewolf card and dies as a wolf");
  assert.equal(r.village, true);
  assert.deepEqual(sorted(r.winners), ["b", "c"]);
});

test("the Troublemaker swaps two other players, never herself", () => {
  const s = rig({ a: "meddler", b: "werewolf", c: "villager" }, ["seer", "villager", "thief"]);
  nightTo(s, "meddler");
  assert.ok(act(s, "a", { targets: ["a", "b"] }).error);
  assert.ok(act(s, "a", { targets: ["b", "b"] }).error);
  act(s, "a", { targets: ["b", "c"] });
  assert.equal(s.g.cards.c, "werewolf");
});

test("the Drunk must swap with a center card", () => {
  const s = rig({ a: "sleepwalker", b: "werewolf", c: "villager" }, ["seer", "villager", "thief"]);
  nightTo(s, "sleepwalker");
  assert.equal(s.g.step.prompts.a.required, true);
  assert.equal(act(s, "a", { skip: true }).error, "A choice is required");
});

// ---------------------------------------------------------------- Copycat

test("a Copycat card that starts in the center has no power, and its holder is on the village team", () => {
  const s = rig({ a: "sleepwalker", b: "werewolf", c: "villager" }, ["copycat", "villager", "seer"]);
  nightTo(s, "copycat");
  assert.deepEqual(s.g.step.actors, []);
  nightTo(s, "sleepwalker"); act(s, "a", { center: 0 });
  const r = vote(s, { a: "b", b: "c", c: "b" });
  assert.equal(r.effective.a, "copycat");
  assert.ok(r.winners.includes("a"), "the village won, and the Drunk holding the Copycat with it");
});

test("the Copycat may copy the Doppelganger in the center and then acts as her", () => {
  const s = rig({ a: "copycat", b: "seer", c: "werewolf" }, ["lookalike", "villager", "thief"]);
  nightTo(s, "copycat"); act(s, "a", { center: 0 });
  nightTo(s, "lookalike");
  assert.deepEqual(s.g.step.actors, ["a"]);
  act(s, "a", { target: "c" });
  assert.equal(effRole(s.g, "copycat"), "werewolf");
  nightTo(s, "wolves");
  assert.deepEqual(sorted(s.g.step.actors), ["a", "c"]);
});

test("a Copycat who copies a Tanner wins only by dying", () => {
  const s = rig({ a: "copycat", b: "werewolf", c: "villager" }, ["jester", "villager", "seer"]);
  nightTo(s, "copycat"); act(s, "a", { center: 0 });
  const r = vote(s, { a: "b", b: "a", c: "a" });
  assert.deepEqual(r.dead, ["a"]);
  assert.deepEqual(r.winners, ["a"]);
});

// ---------------------------------------------------------------- Doppelganger

// Puts the Doppelganger (a) on `role` by viewing b. Returns the room on the Doppelganger's turn.
function doppel(role, others = {}, center = ["villager", "villager", "cursed"]) {
  const seats = { a: "lookalike", b: role, ...others };
  const s = rig(seats, center);
  nightTo(s, "lookalike");
  assert.equal(act(s, "a", { target: "b" }).error, undefined);
  return s;
}

test("the Doppelganger acts out every look or swap role on the spot, and doesn't wake for it again", () => {
  const cases = {
    prowler: [{ target: "c" }, (s) => assert.match(info(s, "a"), /You saw C's card\. It's the Werewolf/)],
    seer: [{ center: [0, 1] }, (s) => assert.match(info(s, "a"), /You saw center cards 1 and 2\. They.re the Villager and the Villager/)],
    noviceseer: [{ center: 2 }, (s) => assert.match(info(s, "a"), /You saw center card 3\. It's the Cursed/)],
    thief: [{ target: "c" }, (s) => assert.equal(s.g.cards.a, "werewolf")],
    meddler: [{ targets: ["b", "c"] }, (s) => assert.equal(s.g.cards.b, "werewolf")],
    sleepwalker: [{ center: 2 }, (s) => assert.equal(s.g.cards.a, "cursed")],
    investigator: [{ target: "c" }, (s) => assert.equal(s.g.copied.lookalike, "werewolf")],
  };
  for (const [role, [body, check]] of Object.entries(cases)) {
    const s = doppel(role, { c: "werewolf", d: "villager" });
    assert.equal(s.g.step.id, "lookalike", role);
    assert.equal(s.g.step.prompts.a.as, role === "prowler" ? "prowler" : ROLES[role].step, role);
    assert.equal(act(s, "a", body).error, undefined, role);
    check(s);
    if (ROLES[role].step !== "prowler") {
      nightTo(s, ROLES[role].step);
      assert.ok(!s.g.step.actors.includes("a"), `${role}: no second turn`);
    }
  }
});

test("the Doppelganger-Witch looks and swaps on the spot, herself included", () => {
  const s = doppel("witch", { c: "werewolf" }, ["thief", "villager", "seer"]);
  act(s, "a", { center: 0 });
  assert.equal(s.g.step.prompts.a.required, true);
  act(s, "a", { target: "a" });
  assert.equal(s.g.cards.a, "thief");
  assert.equal(s.g.center[0], "lookalike");
  nightTo(s, "witch");
  assert.deepEqual(s.g.step.actors, ["b"]);
});

test("the Doppelganger-Alpha Wolf swaps the spare card right away, without being shown the wolves", () => {
  const s = doppel("packleader", { c: "werewolf", d: "villager" });
  const p = s.g.step.prompts.a;
  assert.equal(p.required, true);
  assert.deepEqual(sorted(p.exclude), ["a", "b"], "only herself and the Alpha Wolf she copied: excluding c would name a wolf");
  act(s, "a", { target: "d" });
  assert.equal(s.g.cards.d, "werewolf");
  assert.equal(s.g.spare, "villager");
  nightTo(s, "wolves");
  assert.deepEqual(sorted(s.g.step.actors), ["a", "b", "c"], "she still wakes with the wolves");
  nightTo(s, "packleader");
  assert.deepEqual(s.g.step.actors, ["b"], "and doesn't take the Alpha Wolf's turn");
});

test("the Doppelganger-Mystic Wolf looks right away and still wakes with the wolves", () => {
  const s = doppel("prowler", { c: "werewolf" });
  act(s, "a", { target: "c" });
  nightTo(s, "wolves");
  assert.deepEqual(sorted(s.g.step.actors), ["a", "b", "c"]);
  nightTo(s, "prowler");
  assert.deepEqual(s.g.step.actors, ["b"]);
});

test("the Doppelganger-Gremlin waits for the Gremlin's turn (Vampire rulebook)", () => {
  const s = doppel("imp", { c: "werewolf" });
  assert.ok(s.g.step.done.a, "nothing more to do now");
  nightTo(s, "imp");
  assert.deepEqual(sorted(s.g.step.actors), ["a", "b"]);
});

test("the Doppelganger wakes again on the turn of every shown-something role", () => {
  for (const role of ["lackey", "apprentice", "aurareader", "nightowl", "scout", "watcher", "unveiler"]) {
    const extra = role === "apprentice" ? { c: "jester" } : role === "watcher" ? { c: "seer" } : { c: "werewolf" };
    const s = doppel(role, extra);
    assert.ok(s.g.step.done.a, role);
    nightTo(s, ROLES[role].step);
    assert.ok(s.g.step.actors.includes("a"), `${role}: the Doppelganger wakes on its turn`);
  }
});

test("the Doppelganger-Mason wakes with the Masons, so a lone Mason isn't alone", () => {
  const s = doppel("mason", { c: "werewolf" }, ["mason", "villager", "seer"]);
  nightTo(s, "masons");
  assert.deepEqual(sorted(s.g.step.actors), ["a", "b"]);
  assert.match(s.g.step.prompts.b.text, /other Mason is A/);
});

test("the Doppelganger-Minion sees the wolves; the wolves don't see her", () => {
  const s = doppel("lackey", { c: "werewolf" });
  nightTo(s, "wolves");
  assert.deepEqual(s.g.step.actors, ["c"]);
  assert.equal(s.g.step.prompts.c.kind, "center1", "the wolf is still a lone wolf");
  nightTo(s, "lackey");
  assert.match(s.g.step.prompts.a.text, /wolf is C/);
});

test("the Doppelganger-Robber who takes a Werewolf doesn't wake with the wolves (designer ruling)", () => {
  const s = doppel("thief", { c: "werewolf" });
  act(s, "a", { target: "c" });
  nightTo(s, "wolves");
  assert.deepEqual(s.g.step.actors, ["c"], "the robbed player still wakes as a wolf: it's the starting card that counts");
  const r = vote(s, { a: "b", b: "a", c: "a" });
  assert.equal(r.effective.c, "thief", "c holds the Doppelganger card, which is a Robber");
  assert.equal(r.village, true, "a held the Werewolf card and died");
});

test("a Doppelganger who views the Copycat becomes the Copycat's role and does nothing with it", () => {
  const s = rig({ a: "lookalike", b: "copycat", c: "werewolf", d: "villager" }, ["seer", "villager", "thief"]);
  nightTo(s, "copycat"); act(s, "b", { center: 0 });
  nightTo(s, "lookalike"); act(s, "a", { target: "b" });
  assert.ok(s.g.step.done.a, "she doesn't look now");
  assert.equal(s.g.copied.lookalike, "seer");
  nightTo(s, "seer");
  assert.deepEqual(s.g.step.actors, ["b"], "and doesn't wake on the Seer's turn either");
});

test("a Doppelganger who copies a no-night role keeps its powers in the vote", () => {
  // Doppel-Hunter dies and takes her vote down
  let s = doppel("hunter", { c: "werewolf", d: "villager" });
  let r = vote(s, { a: "c", b: "a", c: "a", d: "b" });
  assert.deepEqual(r.dead, ["a", "c"]);
  assert.equal(r.village, true);
  // Doppel-Tanner wins by dying
  s = doppel("jester", { c: "werewolf", d: "villager" });
  r = vote(s, { a: "c", b: "a", c: "a", d: "b" });
  assert.deepEqual(r.winners, ["a"]);
  // Doppel-Bodyguard protects whoever she votes for
  s = doppel("bodyguard", { c: "werewolf", d: "villager", e: "seer" });
  r = vote(s, { a: "c", b: "c", c: "d", d: "c", e: "d" });
  assert.deepEqual(r.dead, ["d"]);
  // Doppel-Prince can't die
  s = doppel("prince", { c: "werewolf", d: "villager" });
  r = vote(s, { a: "c", b: "a", c: "a", d: "a" });
  assert.deepEqual(r.dead, []);
  assert.deepEqual(r.saved, ["a"]);
});

test("whoever holds the Doppelganger card at the end is the role she copied", () => {
  const s = doppel("jester", { c: "werewolf", d: "meddler" });
  nightTo(s, "meddler"); act(s, "d", { targets: ["a", "b"] });
  const r = vote(s, { a: "b", b: "c", c: "b", d: "b" });
  assert.equal(r.effective.b, "jester");
  assert.deepEqual(r.dead, ["b"]);
  assert.deepEqual(r.winners, ["b"]);
});

// ---------------------------------------------------------------- the vote

test("a tie for the most votes kills everyone tied", () => {
  const cards = { a: "werewolf", b: "villager", c: "seer", d: "thief" };
  const r = resolve(cards, { a: "b", b: "a", c: "a", d: "b" });
  assert.deepEqual(sorted(r.dead), ["a", "b"]);
  assert.equal(r.village, true, "a wolf died, so the village wins even though a villager died too");
  assert.deepEqual(sorted(r.winners), ["b", "c", "d"]);
});

test("if every player gets one vote, nobody dies; with a wolf among the players the wolves win", () => {
  const r = resolve({ a: "werewolf", b: "villager", c: "seer", d: "lackey" }, { a: "b", b: "c", c: "d", d: "a" });
  assert.deepEqual(r.dead, []);
  assert.deepEqual(sorted(r.winners), ["a", "d"]);
});

test("missing votes don't count", () => {
  const s = rig({ a: "werewolf", b: "villager", c: "villager", d: "seer" }, ["villager", "thief", "meddler"]);
  const r = vote(s, { b: "a", c: "a" });
  assert.deepEqual(r.dead, ["a"]);
});

test("the Tanner and a wolf both dying: the Tanner and the village both win", () => {
  const r = resolve({ a: "werewolf", b: "jester", c: "villager", d: "seer" }, { a: "b", b: "a", c: "a", d: "b" });
  assert.deepEqual(sorted(r.dead), ["a", "b"]);
  assert.equal(r.village, true);
  assert.deepEqual(sorted(r.winners), ["b", "c", "d"]);
});

test("the Tanner and the Minion both dying: only the Tanner wins (designer ruling)", () => {
  const r = resolve({ a: "werewolf", b: "jester", c: "lackey", d: "seer" }, { a: "b", b: "c", c: "b", d: "c" });
  assert.deepEqual(sorted(r.dead), ["b", "c"]);
  assert.deepEqual(r.winners, ["b"]);
});

test("with no wolf among the players, a Tanner's death is a loss for everyone else", () => {
  const r = resolve({ a: "jester", b: "lackey", c: "villager", d: "seer" }, { a: "c", b: "a", c: "a", d: "a" });
  assert.deepEqual(r.dead, ["a"]);
  assert.deepEqual(r.winners, ["a"], "the Minion is on the wolf team, which can't win when the Tanner dies");
});

test("the Minion isn't a wolf: with only a Minion, killing them loses it for the village (FAQ)", () => {
  const r = resolve({ a: "lackey", b: "villager", c: "seer" }, { a: "b", b: "a", c: "a" });
  assert.deepEqual(r.dead, ["a"]);
  assert.equal(r.village, false);
  assert.deepEqual(r.winners, []);
});

test("the Hunter's shot ignores vote counts and can kill the Tanner, who then wins", () => {
  const r = resolve({ a: "hunter", b: "jester", c: "werewolf", d: "seer" }, { a: "b", b: "a", c: "a", d: "c" });
  assert.deepEqual(r.dead, ["a", "b"]);
  assert.deepEqual(r.hunterShots, [["a", "b"]]);
  assert.deepEqual(r.winners, ["b"], "the wolves can't win once the Tanner dies, and no wolf died");
});

test("a Hunter dying in a tie still shoots", () => {
  const r = resolve({ a: "hunter", b: "villager", c: "werewolf", d: "seer", e: "thief" },
    { a: "c", b: "a", c: "b", d: "a", e: "b" });
  assert.deepEqual(r.dead, ["a", "b", "c"]);
  assert.deepEqual(r.hunterShots, [["a", "c"]]);
  assert.equal(r.village, true);
});

test("Bodyguard and Hunter: protection beats the shot, and a protected Hunter never shoots", () => {
  // the Hunter dies and points at the wolf the Bodyguard protects: the wolf lives (designer ruling)
  let r = resolve({ a: "bodyguard", b: "werewolf", c: "hunter", d: "villager", e: "seer" },
    { a: "b", b: "c", c: "b", d: "c", e: "a" });
  assert.deepEqual(r.dead, ["c"]);
  assert.deepEqual(r.hunterBlocked, [["c", "b"]]);
  assert.equal(r.wolfTeam, true);
  // the Bodyguard protects the Hunter, who had the most votes: the Hunter lives and doesn't shoot
  r = resolve({ a: "bodyguard", b: "werewolf", c: "hunter", d: "villager", e: "seer" },
    { a: "c", b: "c", c: "b", d: "c", e: "d" });
  assert.deepEqual(r.dead, []);
  assert.deepEqual(r.saved, ["c"]);
  assert.deepEqual(r.hunterShots, []);
});

test("the Bodyguard protecting one of several tied players: the other tied players die", () => {
  const cards = { a: "bodyguard", b: "werewolf", c: "villager", d: "seer", e: "thief", f: "villager", g: "meddler" };
  // b, c and d have two votes each; a and e one each; the Bodyguard protects b
  const r = resolve(cards, { a: "b", b: "c", c: "d", d: "b", e: "c", f: "d", g: "e" });
  assert.equal(r.counts.b, 2); assert.equal(r.counts.c, 2); assert.equal(r.counts.d, 2);
  assert.deepEqual(sorted(r.dead), ["c", "d"]);
  assert.equal(r.wolfTeam, true);
});

test("the next most votes must be at least two for a Prince or Bodyguard save to kill someone else", () => {
  const r = resolve({ a: "prince", b: "werewolf", c: "villager", d: "seer" }, { a: "b", b: "a", c: "a", d: "c" });
  assert.deepEqual(r.dead, []);
  assert.deepEqual(r.saved, ["a"]);
});

test("the Cursed turns when the Dream Wolf or a wolf from the spare card votes for them", () => {
  let r = resolve({ a: "cursed", b: "dozingwolf", c: "villager", d: "seer" }, { a: "b", b: "a", c: "b", d: "b" });
  assert.deepEqual(r.turned, ["a"]);
  assert.equal(r.wolfTeam, false, "the Dream Wolf died");
  // the turned Cursed isn't on the village team any more: they lose with the wolves
  assert.ok(!r.winners.includes("a"));
  r = resolve({ a: "cursed", b: "villager", c: "lackey", d: "seer" }, { a: "b", b: "c", c: "a", d: "b" });
  assert.deepEqual(r.turned, [], "the Minion isn't a wolf, so their vote doesn't turn the Cursed");
});

test("the Apprentice Tanner wins with the Tanner, and the wolves can't win when the Tanner dies", () => {
  const r = resolve({ a: "apprentice", b: "jester", c: "werewolf", d: "villager" }, { a: "c", b: "a", c: "b", d: "b" });
  assert.deepEqual(r.dead, ["b"]);
  assert.deepEqual(sorted(r.winners), ["a", "b"]);
  assert.equal(r.wolfTeam, false);
});

// ---------------------------------------------------------------- deliberate deviations

// Mike, 2026-11-22: a copied card counts as the role it became for everyone. Officially a P.I. who
// views a Doppelganger card keeps looking and the Revealer leaves it face up, but that only comes from
// the physical card still showing the Doppelganger. Keep it this way.
test("a Doppelganger card that copied a wolf turns the P.I. and is flipped back by the Revealer (on purpose)", () => {
  let s = rig({ a: "lookalike", b: "werewolf", c: "investigator", d: "villager" }, ["seer", "villager", "thief"]);
  nightTo(s, "lookalike"); act(s, "a", { target: "b" });
  nightTo(s, "investigator"); act(s, "c", { target: "a" });
  assert.ok(s.g.step.done.c);
  assert.equal(s.g.copied.investigator, "werewolf");

  s = rig({ a: "lookalike", b: "werewolf", c: "unveiler", d: "villager" }, ["seer", "villager", "thief"]);
  nightTo(s, "lookalike"); act(s, "a", { target: "b" });
  nightTo(s, "unveiler"); act(s, "c", { target: "a" });
  finishNight(s);
  assert.deepEqual(s.g.revealed, []);
});

test("a Doppelganger that copied the Revealer turns a second card face up; both stay up, both are logged", () => {
  const s = rig({ a: "lookalike", b: "hunter", c: "unveiler", d: "villager", e: "seer" }, ["werewolf", "werewolf", "thief"]);
  nightTo(s, "lookalike"); act(s, "a", { target: "c" });
  nightTo(s, "unveiler");
  act(s, "c", { target: "b" });
  act(s, "a", { target: "e" });
  finishNight(s);
  assert.deepEqual(s.g.revealed, [{ pid: "b", role: "hunter", by: ["unveiler"] }, { pid: "e", role: "seer", by: ["lookalike"] }]);
  const logs = s.g.log.filter((l) => l.step === "unveiler").map((l) => l.text);
  assert.equal(logs.length, 2);
  assert.ok(logs.some((t) => /turned B's card face up: the Hunter/.test(t)));
  assert.ok(logs.some((t) => /turned E's card face up: the Seer/.test(t)));
  assert.match(s.g.info.c.map((i) => i.text).join(" "), /Hunter/);
  assert.match(s.g.info.a.map((i) => i.text).join(" "), /Seer\. Everyone else sees it when the night ends/);
});

// The day table's sentence names no acting role at all (Mike, 2026-11-26): only that cards were turned.
const tableText = (s) => tableLine(s.g.revealed, (id) => id.toUpperCase());
const OTHERS = ["Doppelganger", "Copycat", "Revealer"];
const onlyNames = (text) => { for (const r of OTHERS) assert.doesNotMatch(text, new RegExp(r), `the day table never names ${r}`); };

test("the table sentence names no role: the Revealer alone", () => {
  const s = rig({ a: "unveiler", b: "hunter", c: "villager", d: "werewolf" }, ["seer", "villager", "thief"]);
  nightTo(s, "unveiler"); act(s, "a", { target: "b" });
  finishNight(s);
  const t = tableText(s);
  assert.equal(t, "B's Hunter was turned face up in the night. It stays face up for the rest of the game.");
  onlyNames(t);
});

test("the table sentence names no role: the Revealer and a Doppelganger that copied it", () => {
  const s = rig({ a: "lookalike", b: "hunter", c: "unveiler", d: "villager", e: "seer" }, ["werewolf", "werewolf", "thief"]);
  nightTo(s, "lookalike"); act(s, "a", { target: "c" });
  nightTo(s, "unveiler"); act(s, "c", { target: "b" }); act(s, "a", { target: "e" });
  finishNight(s);
  const t = tableText(s);
  assert.equal(t, "B's Hunter and E's Seer were turned face up in the night. They stay face up for the rest of the game.");
  onlyNames(t);
  assert.match(s.g.log.filter((l) => l.step === "unveiler").map((l) => l.text).join(" | "), /^C \(Revealer\) turned B's .* \| A \(Doppelganger, as the Revealer\) turned E's/);
});

test("the table sentence names no role: a Copycat that copied a center Revealer turns a card face up on the Revealer's turn", () => {
  const s = rig({ a: "copycat", b: "hunter", c: "villager", d: "werewolf" }, ["unveiler", "villager", "thief"]);
  nightTo(s, "copycat"); act(s, "a", { center: 0 });
  nightTo(s, "unveiler"); act(s, "a", { target: "b" });
  finishNight(s);
  const t = tableText(s);
  assert.equal(t, "B's Hunter was turned face up in the night. It stays face up for the rest of the game.");
  onlyNames(t);
  assert.match(s.g.log.find((l) => l.step === "unveiler").text, /^A \(Copycat, as the Revealer\) turned B's card face up/);
});

test("the table sentence names no role: a Doppelganger that copied a Copycat-as-Revealer doesn't turn a card (Vampire rules)", () => {
  const s = rig({ a: "copycat", b: "lookalike", c: "hunter", d: "villager", e: "seer", f: "werewolf" }, ["unveiler", "villager", "thief"]);
  nightTo(s, "copycat"); act(s, "a", { center: 0 });
  nightTo(s, "lookalike"); act(s, "b", { target: "a" });
  nightTo(s, "unveiler");
  assert.ok(!s.g.step.actors.includes("b"), "the Doppelganger doesn't wake as the Revealer");
  act(s, "a", { target: "c" });
  finishNight(s);
  const t = tableText(s);
  assert.equal(t, "C's Hunter was turned face up in the night. It stays face up for the rest of the game.");
  onlyNames(t);
});

test("the table sentence names no role: all three roles, and one card turned by two of them", () => {
  const t = tableLine([{ pid: "b", role: "hunter", by: ["unveiler", "lookalike"] }, { pid: "e", role: "seer", by: ["copycat"] }], (id) => id.toUpperCase());
  assert.equal(t, "B's Hunter and E's Seer were turned face up in the night. They stay face up for the rest of the game.");
  onlyNames(t);
});
