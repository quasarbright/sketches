import { test } from "node:test";
import assert from "node:assert/strict";
import { createRoom, handle, tick, viewFor, resolveVotes, startProblem, transferHost } from "./engine.mjs";

const FAST = { timing: { stepMin: 100, stepJitter: 0, stepMax: 1000 } };

// deterministic rng
function seeded(seed = 1) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

function room(names = ["a", "b", "c", "d"], opts = FAST) {
  const s = createRoom("TEST", { id: names[0], name: names[0].toUpperCase() }, 0, opts);
  for (const n of names.slice(1)) handle(s, n, { t: "hello", name: n.toUpperCase() }, 0);
  return s;
}

// Deal a fixed set of cards: `seats` maps player -> role, center is 3 roles.
function rig(s, seats, center, spare = null) {
  const ids = Object.keys(seats);
  const roles = {};
  for (const r of [...Object.values(seats), ...center]) roles[r] = (roles[r] || 0) + 1;
  if (spare) roles.packleader = roles.packleader || 1;
  assert.equal(handle(s, s.hostId, { t: "setRoles", roles }, 0).error, undefined);
  assert.equal(handle(s, s.hostId, { t: "start" }, 0).error, undefined);
  s.g.seats = ids;
  s.g.dealt = { ...seats };
  s.g.cards = { ...seats };
  s.g.center = [...center];
  s.g.spare = spare;
}

function runNight(s, actions = {}, start = 0) {
  let now = start;
  for (const id of s.g.seats) handle(s, id, { t: "peeked" }, now);
  assert.equal(s.phase, "night");
  let guard = 0;
  while (s.phase === "night" && guard++ < 100) {
    const st = s.g.step;
    for (const a of st.actors) {
      if (st.done[a]) continue;
      const act = actions[st.id]?.[a];
      const msg = act ? { t: "act", step: st.id, ...act } : { t: "act", step: st.id, skip: true };
      const r = handle(s, a, msg, now);
      if (r.error && !st.prompts[a].required) assert.fail(`${st.id} ${a}: ${r.error}`);
    }
    now += 150;
    tick(s, now);
  }
  return now;
}

test("suggested deck always fits the table", () => {
  for (let n = 3; n <= 12; n++) {
    const s = room(Array.from({ length: n }, (_, i) => `p${i}`));
    assert.equal(startProblem(s), null, `${n} players`);
  }
});

test("start explains what's missing", () => {
  const s = room(["a", "b"]);
  assert.match(startProblem(s), /at least 3/);
  handle(s, "c", { t: "hello", name: "C" }, 0);
  handle(s, "a", { t: "setRoles", roles: { werewolf: 2, seer: 1 } }, 0);
  assert.equal(startProblem(s), "Pick 3 more cards");
  handle(s, "a", { t: "setRoles", roles: { werewolf: 2, seer: 1, villager: 3, mason: 1 } }, 0);
  // a single mason is bumped to a pair
  assert.equal(s.roles.mason, 2);
  assert.equal(startProblem(s), "Remove 2 cards");
});

test("only the host changes cards", () => {
  const s = room();
  assert.ok(handle(s, "b", { t: "setRoles", roles: {} }, 0).error);
});

test("the Pack Leader's spare card is added on its own and isn't a center card", () => {
  const s = room(["a", "b", "c"]);
  handle(s, "a", { t: "setRoles", roles: { packleader: 1, werewolf: 1, seer: 1, villager: 3 } }, 0);
  assert.equal(startProblem(s), null);
  handle(s, "a", { t: "start" }, 0, seeded(3));
  assert.equal(s.g.center.length, 3);
  assert.equal(s.g.spare, "werewolf");
  assert.ok(viewFor(s, "a", 0).game.hasSpare);
});

test("Pack Leader gives the spare card; a lone Pack Leader peeks at a real center card first", () => {
  const s = room(["a", "b", "c"]);
  rig(s, { a: "packleader", b: "seer", c: "villager" }, ["werewolf", "villager", "villager"], "werewolf");
  runNight(s, {
    wolves: { a: { center: 0 } },
    packleader: { a: { target: "b" } },
  });
  assert.equal(s.g.cards.b, "werewolf");
  assert.equal(s.g.spare, "seer");
  assert.deepEqual(s.g.center, ["werewolf", "villager", "villager"]);
  const info = s.g.info.a.map((i) => i.text).join("\n");
  assert.match(info, /Center card 1 is the Werewolf/);
  assert.match(info, /spare Werewolf card with B.s card/);
});

test("Pack Leader can't target a known wolf", () => {
  const s = room(["a", "b", "c"]);
  rig(s, { a: "packleader", b: "werewolf", c: "villager" }, ["seer", "villager", "villager"], "werewolf");
  for (const id of s.g.seats) handle(s, id, { t: "peeked" }, 0);
  for (const id of ["a", "b"]) handle(s, id, { t: "act", step: "wolves", skip: true }, 0);
  tick(s, 200);
  assert.equal(s.g.step.id, "packleader");
  assert.ok(handle(s, "a", { t: "act", step: "packleader", target: "b" }, 200).error);
  assert.equal(handle(s, "a", { t: "act", step: "packleader", target: "c" }, 200).error, undefined);
});

test("night steps run in wake order and act on the card as it is at that moment", () => {
  const s = room(["a", "b", "c", "d"]);
  rig(s, { a: "seer", b: "thief", c: "werewolf", d: "nightowl" }, ["meddler", "villager", "villager"]);
  runNight(s, {
    seer: { a: { target: "c" } },
    thief: { b: { target: "c" } },
  });
  // seer saw the wolf before the thief took it; the thief now holds it
  assert.match(s.g.info.a[0].text, /C's card is the Werewolf/);
  assert.equal(s.g.cards.b, "werewolf");
  assert.equal(s.g.cards.c, "thief");
  // the meddler step runs even though the card is in the center
  assert.ok(s.g.steps.includes("meddler"));
  assert.equal(s.phase, "day");
});

test("a step lasts the minimum time even when its actors are quick, and nobody acts as a center card", () => {
  const s = room(["a", "b", "c"]);
  rig(s, { a: "seer", b: "villager", c: "villager" }, ["werewolf", "werewolf", "thief"]);
  for (const id of s.g.seats) handle(s, id, { t: "peeked" }, 0);
  assert.equal(s.g.step.id, "wolves");
  assert.equal(s.g.step.actors.length, 0);
  tick(s, 50);
  assert.equal(s.g.step.id, "wolves");
  tick(s, 100);
  assert.equal(s.g.step.id, "seer");
});

test("a player who never acts gets the default when the step times out", () => {
  const s = room(["a", "b", "c"]);
  rig(s, { a: "sleepwalker", b: "villager", c: "villager" }, ["werewolf", "werewolf", "seer"]);
  for (const id of s.g.seats) handle(s, id, { t: "peeked" }, 0);
  let now = 0;
  while (s.phase === "night") { now += 500; tick(s, now, seeded(5)); }
  assert.notEqual(s.g.cards.a, "sleepwalker"); // required swap happened anyway
});

test("Meddler and Sleepwalker swap", () => {
  const s = room(["a", "b", "c", "d"]);
  rig(s, { a: "meddler", b: "sleepwalker", c: "werewolf", d: "villager" }, ["seer", "villager", "hunter"]);
  runNight(s, { meddler: { a: { targets: ["c", "d"] } }, sleepwalker: { b: { center: 2 } } });
  assert.equal(s.g.cards.c, "villager");
  assert.equal(s.g.cards.d, "werewolf");
  assert.equal(s.g.cards.b, "hunter");
  assert.equal(s.g.center[2], "sleepwalker");
});

test("nobody dies when nobody gets two votes", () => {
  const r = resolveVotes(["a", "b", "c"], { a: "b", b: "c", c: "a" }, { a: "werewolf", b: "villager", c: "seer" });
  assert.deepEqual(r.dead, []);
  assert.equal(r.village, false);
  assert.equal(r.wolfTeam, true);
});

test("killing a wolf wins it for the village", () => {
  const r = resolveVotes(["a", "b", "c"], { a: "b", b: "a", c: "a" }, { a: "werewolf", b: "villager", c: "seer" });
  assert.deepEqual(r.dead, ["a"]);
  assert.equal(r.village, true);
  assert.deepEqual(r.winners.sort(), ["b", "c"]);
});

test("the Scout dying wins it for the village (issue 279)", () => {
  const cards = { a: "werewolf", b: "scout", c: "villager", d: "seer" };
  const r = resolveVotes(["a", "b", "c", "d"], { a: "c", b: "c", c: "b", d: "b" }, cards);
  // a tie: the Scout and a villager both die, no wolf does
  assert.deepEqual(r.dead.sort(), ["b", "c"]);
  assert.equal(r.village, true);
  assert.equal(r.wolfTeam, false);
  assert.deepEqual(r.winners.sort(), ["c", "d"]);
  const r2 = resolveVotes(["a", "b", "c", "d"], { a: "b", b: "c", c: "b", d: "b" }, cards);
  assert.deepEqual(r2.dead, ["b"]);
  assert.equal(r2.village, true);
});

test("the Lackey dying alone still wins it for the wolves", () => {
  const r = resolveVotes(["a", "b", "c"], { a: "b", b: "a", c: "b" }, { a: "werewolf", b: "lackey", c: "villager" });
  assert.deepEqual(r.dead, ["b"]);
  assert.equal(r.village, false);
  assert.deepEqual(r.winners.sort(), ["a", "b"]);
});

test("the Jester wins by dying and stops the wolves", () => {
  const r = resolveVotes(["a", "b", "c"], { a: "b", b: "a", c: "b" }, { a: "werewolf", b: "jester", c: "villager" });
  assert.deepEqual(r.dead, ["b"]);
  assert.equal(r.wolfTeam, false);
  assert.equal(r.village, false);
  assert.deepEqual(r.winners, ["b"]);
});

test("the Hunter takes their vote down with them", () => {
  const r = resolveVotes(["a", "b", "c", "d"], { a: "b", b: "a", c: "b", d: "b" }, { a: "werewolf", b: "hunter", c: "villager", d: "villager" });
  assert.deepEqual(r.dead, ["b", "a"]);
  assert.equal(r.village, true);
});

test("with no wolves among the players, the village wins only if nobody dies", () => {
  const cards = { a: "villager", b: "seer", c: "thief" };
  assert.equal(resolveVotes(["a", "b", "c"], { a: "b", b: "c", c: "a" }, cards).village, true);
  assert.equal(resolveVotes(["a", "b", "c"], { a: "b", b: "a", c: "b" }, cards).village, false);
});

test("a dropped player doesn't block the vote, and the host can end it", () => {
  const s = room(["a", "b", "c", "d"]);
  rig(s, { a: "werewolf", b: "villager", c: "villager", d: "seer" }, ["villager", "hunter", "thief"]);
  let now = runNight(s);
  handle(s, "a", { t: "hostSkipDay" }, now);
  assert.equal(s.phase, "vote");
  handle(s, "d", { t: "disconnect" }, now);
  handle(s, "a", { t: "vote", target: "b" }, now);
  handle(s, "b", { t: "vote", target: "a" }, now);
  assert.equal(s.phase, "vote");
  handle(s, "c", { t: "vote", target: "a" }, now);
  assert.equal(s.phase, "results");
  assert.deepEqual(s.g.result.dead, ["a"]);

  handle(s, "a", { t: "hostReset" }, now);
  assert.equal(s.phase, "lobby");
});

test("host can end a vote early; missing votes count as none", () => {
  const s = room(["a", "b", "c"]);
  rig(s, { a: "werewolf", b: "villager", c: "villager" }, ["seer", "villager", "thief"]);
  const now = runNight(s);
  handle(s, "a", { t: "hostSkipDay" }, now);
  handle(s, "b", { t: "vote", target: "a" }, now);
  assert.ok(handle(s, "b", { t: "hostEndVote" }, now).error);
  handle(s, "a", { t: "hostEndVote" }, now);
  assert.equal(s.phase, "results");
  assert.deepEqual(s.g.result.dead, []);
});

test("you can't vote for yourself", () => {
  const s = room(["a", "b", "c"]);
  rig(s, { a: "werewolf", b: "villager", c: "villager" }, ["seer", "villager", "thief"]);
  const now = runNight(s);
  handle(s, "a", { t: "hostSkipDay" }, now);
  assert.ok(handle(s, "a", { t: "vote", target: "a" }, now).error);
});

test("everyone ready to vote ends the day; the timer does too", () => {
  const s = room(["a", "b", "c"]);
  rig(s, { a: "werewolf", b: "villager", c: "villager" }, ["seer", "villager", "thief"]);
  let now = runNight(s);
  assert.equal(s.phase, "day");
  for (const id of ["a", "b", "c"]) handle(s, id, { t: "dayReady", ready: true }, now);
  assert.equal(s.phase, "vote");

  const s2 = room(["a", "b", "c"]);
  rig(s2, { a: "werewolf", b: "villager", c: "villager" }, ["seer", "villager", "thief"]);
  now = runNight(s2);
  tick(s2, now + 5 * 60000);
  assert.equal(s2.phase, "vote");
});

test("kicked players can't come back; lobby drop-outs are removed after a grace period", () => {
  const s = room(["a", "b", "c", "d"]);
  handle(s, "a", { t: "hostKick", target: "b" }, 0);
  assert.equal(s.players.length, 3);
  assert.deepEqual(handle(s, "b", { t: "hello", name: "B" }, 0), { kicked: true });
  handle(s, "c", { t: "disconnect" }, 0);
  tick(s, 1000);
  assert.equal(s.players.length, 3);
  tick(s, 20000);
  assert.equal(s.players.length, 2);
});

test("a new host keeps the game going; the old host is marked gone", () => {
  const s = room(["a", "b", "c"]);
  rig(s, { a: "werewolf", b: "villager", c: "villager" }, ["seer", "villager", "thief"]);
  const now = runNight(s);
  transferHost(s, "c", now);
  assert.equal(s.hostId, "c");
  assert.equal(s.players.find((p) => p.id === "a").connected, false);
  handle(s, "c", { t: "hostSkipDay" }, now);
  handle(s, "b", { t: "vote", target: "c" }, now);
  handle(s, "c", { t: "vote", target: "b" }, now);
  assert.equal(s.phase, "results");
});

test("names are cleaned and kept unique", () => {
  const s = room(["a"]);
  handle(s, "b", { t: "hello", name: "  A  " }, 0);
  assert.equal(s.players[1].name, "A 2");
  handle(s, "b", { t: "rename", name: "x".repeat(50) }, 0);
  assert.equal(s.players[1].name.length, 20);
});

test("views never leak other players' cards before the results", () => {
  const s = room(["a", "b", "c"]);
  rig(s, { a: "werewolf", b: "villager", c: "seer" }, ["villager", "villager", "thief"]);
  const v = viewFor(s, "b", 0);
  assert.equal(v.game.myCard, "villager");
  const json = JSON.stringify({ ...v, roles: null, game: { ...v.game, steps: null } });
  assert.ok(!json.includes("werewolf") && !json.includes("seer") && !json.includes("thief"), json);
});

test("a player who lets their turn pass is told they didn't use their power", () => {
  const s = room(["a", "b", "c"]);
  rig(s, { a: "seer", b: "thief", c: "werewolf" }, ["villager", "villager", "meddler"]);
  for (const id of s.g.seats) handle(s, id, { t: "peeked" }, 0);
  let now = 0;
  while (s.phase === "night") { now += 500; tick(s, now); }
  assert.match(s.g.info.a.at(-1).text, /Time ran out. You didn't use your Seer power/);
  assert.match(s.g.info.b.at(-1).text, /didn't use your Thief power/);
});

test("taking a card from another team says so", () => {
  const s = room(["a", "b", "c"]);
  rig(s, { a: "thief", b: "werewolf", c: "villager" }, ["villager", "villager", "seer"]);
  runNight(s, { thief: { a: { target: "b" } } });
  assert.match(s.g.info.a.at(-1).text, /You're on the wolf team now/);
});
