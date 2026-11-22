import { test } from "node:test";
import assert from "node:assert/strict";
import { createRoom, handle, tick, viewFor, resolveVotes, startProblem, transferHost } from "./engine.mjs";
import { ROLES } from "./roles.mjs";

const FAST = { timing: { stepMin: 100, stepJitter: 0 } };

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
  assert.equal(startProblem(s), "Add 3 more cards");
  handle(s, "a", { t: "setRoles", roles: { werewolf: 2, seer: 1, villager: 3, mason: 1 } }, 0);
  // a single mason is bumped to a pair
  assert.equal(s.roles.mason, 2);
  assert.equal(startProblem(s), "Remove 2 cards");
});

test("only the host changes cards", () => {
  const s = room();
  assert.ok(handle(s, "b", { t: "setRoles", roles: {} }, 0).error);
});

test("the Alpha Wolf's spare card is added on its own and isn't a center card", () => {
  const s = room(["a", "b", "c"]);
  handle(s, "a", { t: "setRoles", roles: { packleader: 1, werewolf: 1, seer: 1, villager: 3 } }, 0);
  assert.equal(startProblem(s), null);
  handle(s, "a", { t: "start" }, 0, seeded(3));
  assert.equal(s.g.center.length, 3);
  assert.equal(s.g.spare, "werewolf");
  assert.ok(viewFor(s, "a", 0).game.hasSpare);
});

test("Alpha Wolf gives the spare card; a lone Alpha Wolf peeks at a real center card first", () => {
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

test("Alpha Wolf can't target a known wolf", () => {
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

test("night actions have no time limit; a player who leaves mid-turn gets the default", () => {
  const s = room(["a", "b", "c"]);
  rig(s, { a: "sleepwalker", b: "villager", c: "villager" }, ["werewolf", "werewolf", "seer"]);
  let now = nightTo(s, "sleepwalker");
  for (let i = 0; i < 2000; i++) { now += 500; tick(s, now, seeded(5)); }   // over 16 minutes
  assert.equal(s.g.step.id, "sleepwalker", "still waiting on the Drunk");
  assert.equal(s.g.cards.a, "sleepwalker");
  assert.equal("stepEndsAt" in viewFor(s, "a").game, false, "no countdown is sent");
  handle(s, "a", { t: "disconnect" }, now);
  while (s.phase === "night") { now += 500; tick(s, now, seeded(5)); }
  assert.notEqual(s.g.cards.a, "sleepwalker"); // the required swap still happened
});

test("Troublemaker and Sleepwalker swap", () => {
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

test("the Minion dying alone still wins it for the wolves", () => {
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

test("names can only change in the lobby", () => {
  const s = room(["a", "b", "c"]);
  rig(s, { a: "werewolf", b: "villager", c: "seer" }, ["villager", "villager", "thief"]);
  const before = s.players[1].name;
  const r = handle(s, "b", { t: "rename", name: "Zed" }, 0);
  assert.ok(r.error);
  assert.equal(s.players[1].name, before);
});

test("views never leak other players' cards before the results", () => {
  const s = room(["a", "b", "c"]);
  rig(s, { a: "werewolf", b: "villager", c: "seer" }, ["villager", "villager", "thief"]);
  const v = viewFor(s, "b", 0);
  assert.equal(v.game.myCard, "villager");
  const json = JSON.stringify({ ...v, roles: null, game: { ...v.game, steps: null } });
  assert.ok(!json.includes("werewolf") && !json.includes("seer") && !json.includes("thief"), json);
});

test("a player who skips their turn is told they didn't use their power", () => {
  const s = room(["a", "b", "c"]);
  rig(s, { a: "seer", b: "thief", c: "werewolf" }, ["villager", "villager", "meddler"]);
  finishNight(s, nightTo(s, "seer"));
  assert.match(s.g.info.a.at(-1).text, /^You didn't use your Seer power/);
  assert.match(s.g.info.b.at(-1).text, /didn't use your Robber power/);
});

test("taking a card from another team says so", () => {
  const s = room(["a", "b", "c"]);
  rig(s, { a: "thief", b: "werewolf", c: "villager" }, ["villager", "villager", "seer"]);
  runNight(s, { thief: { a: { target: "b" } } });
  assert.match(s.g.info.a.at(-1).text, /You're on the wolf team now/);
});

test("display names live only in skin.mjs", async () => {
  const fs = await import("node:fs");
  const { NAMES } = await import("./skin.mjs");
  const names = Object.values(NAMES);
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");
  for (const f of ["app.mjs", "engine.mjs", "roles.mjs", "net.mjs", "art.mjs", "index.html"]) {
    if (!fs.existsSync(new URL(f, import.meta.url))) continue;
    const src = strip(fs.readFileSync(new URL(f, import.meta.url), "utf8"));
    for (const n of names) assert.ok(!new RegExp(`\\b${n}\\b`).test(src), `${f} hard-codes "${n}"; use NAMES from skin.mjs`);
  }
});

// ---------------------------------------------------------------- spectators

test("a spectator who joins in the lobby isn't dealt in or counted for the deck", () => {
  const s = room(["a", "b", "c"]);
  handle(s, "w", { t: "hello", name: "W", spectator: true }, 0);
  assert.equal(s.players.find((p) => p.id === "w").spectator, true);
  assert.equal(startProblem(s), null);               // 3 players + 3 center, the watcher doesn't count
  handle(s, "a", { t: "start" }, 0);
  assert.equal(s.g.seats.length, 3);
  assert.ok(!s.g.seats.includes("w"));
});

test("joining mid-game always watches, and is dealt in next round", () => {
  const s = room(["a", "b", "c"]);
  handle(s, "a", { t: "start" }, 0);
  handle(s, "late", { t: "hello", name: "Late" }, 0);
  const late = s.players.find((p) => p.id === "late");
  assert.equal(late.spectator, true);
  assert.equal(viewFor(s, "late", 0).spectator, true);
  handle(s, "a", { t: "hostReset" }, 0);
  assert.equal(s.phase, "lobby");
  assert.equal(late.spectator, false);
  handle(s, "a", { t: "start" }, 0);
  assert.ok(s.g.seats.includes("late"));
});

test("someone who chose to watch keeps watching next round", () => {
  const s = room(["a", "b", "c"]);
  handle(s, "w", { t: "hello", name: "W", spectator: true }, 0);
  handle(s, "a", { t: "start" }, 0);
  handle(s, "a", { t: "hostReset" }, 0);
  assert.equal(s.players.find((p) => p.id === "w").spectator, true);
});

test("players can switch between playing and watching only in the lobby", () => {
  const s = room(["a", "b", "c", "d"]);
  assert.equal(handle(s, "d", { t: "setSpectator", on: true }, 0).error, undefined);
  assert.equal(s.players.find((p) => p.id === "d").spectator, true);
  assert.equal(handle(s, "d", { t: "setSpectator", on: false }, 0).error, undefined);
  handle(s, "a", { t: "start" }, 0);
  assert.ok(handle(s, "d", { t: "setSpectator", on: true }, 0).error);
  assert.equal(s.players.find((p) => p.id === "d").spectator, false);
});

test("spectators see every card and the night log at every moment; players never do", () => {
  const s = room(["a", "b", "c"]);
  handle(s, "w", { t: "hello", name: "W", spectator: true }, 0);
  rig(s, { a: "werewolf", b: "seer", c: "thief" }, ["villager", "villager", "villager"]);
  let v = viewFor(s, "w", 0);
  assert.deepEqual(v.game.omni.dealt, { a: "werewolf", b: "seer", c: "thief" });
  assert.deepEqual(v.game.omni.center, ["villager", "villager", "villager"]);
  for (const id of ["a", "b", "c"]) assert.equal(viewFor(s, id, 0).game.omni, undefined);
  runNight(s, { seer: { b: { target: "a" } }, thief: { c: { target: "a" } } });
  v = viewFor(s, "w", 0);
  assert.equal(v.game.omni.cards.c, "werewolf");      // the Robber took the Werewolf
  assert.ok(v.game.omni.log.some((l) => l.actor === "b"));
  assert.ok(v.game.omni.log.some((l) => l.actor === "c"));
  for (const id of ["a", "b", "c"]) {
    const pv = viewFor(s, id, 0);
    assert.equal(pv.game.omni, undefined);
    assert.equal(pv.spectator, false);
  }
});

test("spectators can't act, ready up or vote", () => {
  const s = room(["a", "b", "c"]);
  handle(s, "w", { t: "hello", name: "W", spectator: true }, 0);
  rig(s, { a: "werewolf", b: "villager", c: "villager" }, ["villager", "seer", "thief"]);
  handle(s, "w", { t: "peeked" }, 0);
  assert.equal(s.g.ready.w, undefined);
  runNight(s);
  handle(s, "a", { t: "hostSkipDay" }, 0);
  assert.ok(handle(s, "w", { t: "vote", target: "a" }, 0).error);
  assert.equal(s.g.votes.w, undefined);
});

// ---- batch 1 of the missing roles: Witch, Bodyguard, Prince, Cursed

// Skip every remaining turn until the night ends (night actions have no time limit).
function finishNight(s, now = 0) {
  let guard = 0;
  while (s.phase === "night") {
    assert.ok(guard++ < 500, "the night never ended");
    for (const a of s.g.step.actors) if (!s.g.step.done[a]) handle(s, a, { t: "act", step: s.g.step.id, skip: true }, now);
    now += 150; tick(s, now);
  }
  return now;
}

function nightTo(s, stepId, now = 0) {
  for (const id of s.g.seats) handle(s, id, { t: "peeked" }, now);
  while (s.phase === "night" && s.g.step.id !== stepId) {
    for (const a of s.g.step.actors) if (!s.g.step.done[a]) handle(s, a, { t: "act", step: s.g.step.id, skip: true }, now);
    now += 150; tick(s, now);
  }
  return now;
}

test("the Witch looks at a center card, then must swap it onto a player", () => {
  const s = room(["a", "b", "c"]);
  rig(s, { a: "witch", b: "villager", c: "werewolf" }, ["seer", "werewolf", "hunter"]);
  assert.ok(s.g.steps.indexOf("thief") < s.g.steps.indexOf("witch") || !s.g.steps.includes("thief"));
  nightTo(s, "witch");
  assert.equal(s.g.step.prompts.a.kind, "center1");
  assert.equal(handle(s, "a", { t: "act", step: "witch", center: 2 }, 0).error, undefined);
  const p2 = viewFor(s, "a", 0).game.prompt;
  assert.equal(p2.kind, "player");
  assert.equal(p2.done, false, "looking isn't the end of the turn");
  assert.equal(p2.required, true, "once she looks she has to swap");
  assert.deepEqual(p2.cards, [{ label: "Center card 3", role: "hunter" }]);
  assert.equal(handle(s, "a", { t: "act", step: "witch", skip: true }, 0).error, "A choice is required");
  assert.equal(handle(s, "a", { t: "act", step: "witch", target: "b" }, 0).error, undefined);
  assert.equal(s.g.cards.b, "hunter");
  assert.equal(s.g.center[2], "villager");
  assert.ok(s.g.step.done.a);
  assert.match(s.g.log.at(-1).text, /Witch.*hunter|Hunter/);
});

test("the Witch can take the card herself, can skip, and a Witch who leaves after looking still swaps", () => {
  let s = room(["a", "b", "c"]);
  rig(s, { a: "witch", b: "villager", c: "werewolf" }, ["seer", "werewolf", "hunter"]);
  nightTo(s, "witch");
  handle(s, "a", { t: "act", step: "witch", center: 0 }, 0);
  assert.equal(handle(s, "a", { t: "act", step: "witch", target: "a" }, 0).error, undefined);
  assert.equal(s.g.cards.a, "seer");
  assert.equal(s.g.center[0], "witch");
  assert.match(ROLES.witch.short, /any player's card/, "her card text says she can pick herself too, as in the reference game");

  s = room(["a", "b", "c"]);
  rig(s, { a: "witch", b: "villager", c: "werewolf" }, ["seer", "werewolf", "hunter"]);
  nightTo(s, "witch");
  assert.equal(handle(s, "a", { t: "act", step: "witch", skip: true }, 0).error, undefined);
  assert.deepEqual(s.g.center, ["seer", "werewolf", "hunter"]);

  s = room(["a", "b", "c"]);
  rig(s, { a: "witch", b: "villager", c: "werewolf" }, ["seer", "werewolf", "hunter"]);
  let now = nightTo(s, "witch");
  handle(s, "a", { t: "act", step: "witch", center: 1 }, now);
  handle(s, "a", { t: "disconnect" }, now);
  while (s.phase === "night") { now += 500; tick(s, now, seeded(3)); }
  assert.equal(s.g.center[1] === "werewolf", false, "the card she looked at went to a player");
});

test("the Prince can't die: the next most votes die instead, and the Hunter can't take him down", () => {
  const cards = { a: "prince", b: "werewolf", c: "villager", d: "hunter", e: "seer", f: "villager" };
  const seats = Object.keys(cards);
  // a: 3 votes, b: 2 votes -> b dies instead of a
  let r = resolveVotes(seats, { a: "b", b: "a", c: "a", d: "a", e: "b", f: "c" }, cards);
  assert.deepEqual(r.dead, ["b"]);
  assert.deepEqual(r.saved, ["a"]);
  assert.equal(r.village, true);
  // only the Prince got two votes -> nobody dies
  r = resolveVotes(seats, { a: "b", b: "a", c: "a", d: "c", e: "d", f: "e" }, cards);
  assert.deepEqual(r.dead, []);
  assert.deepEqual(r.saved, ["a"]);
  // the Hunter dies and voted for the Prince: the Prince lives
  r = resolveVotes(seats, { a: "d", b: "d", c: "d", d: "a", e: "c", f: "c" }, cards);
  assert.deepEqual(r.dead, ["d"]);
  assert.deepEqual(r.hunterBlocked, [["d", "a"]]);
  assert.deepEqual(r.hunterShots, []);
});

test("whoever the Bodyguard votes for can't die", () => {
  const cards = { a: "bodyguard", b: "werewolf", c: "villager", d: "seer", e: "hunter" };
  const seats = Object.keys(cards);
  // the wolf gets 3 votes, but the Bodyguard voted for them: c (2 votes) dies instead
  let r = resolveVotes(seats, { a: "b", b: "c", c: "b", d: "b", e: "c" }, cards);
  assert.deepEqual(r.dead, ["c"]);
  assert.deepEqual(r.saved, ["b"]);
  assert.equal(r.wolfTeam, true);
  // the protected player is safe from the Hunter too
  r = resolveVotes(seats, { a: "c", b: "e", c: "e", d: "a", e: "c" }, cards);
  assert.deepEqual(r.dead, ["e"]);
  assert.deepEqual(r.hunterBlocked, [["e", "c"]]);
  // it's the card at the end that counts: no Bodyguard card among players, no protection
  r = resolveVotes(seats, { a: "b", b: "c", c: "b", d: "b", e: "c" }, { ...cards, a: "villager" });
  assert.deepEqual(r.dead, ["b"]);
});

test("the Cursed turns wolf only when a wolf votes for them", () => {
  const cards = { a: "cursed", b: "werewolf", c: "villager", d: "seer" };
  const seats = Object.keys(cards);
  // villagers vote the Cursed out: still a villager, so the wolves win
  let r = resolveVotes(seats, { a: "b", b: "c", c: "a", d: "a" }, cards);
  assert.deepEqual(r.turned, []);
  assert.deepEqual(r.dead, ["a"]);
  assert.equal(r.wolfTeam, true);
  // a wolf votes for the Cursed: they turn, and dying counts as a wolf dying
  r = resolveVotes(seats, { a: "c", b: "a", c: "a", d: "c" }, cards);
  assert.deepEqual(r.turned, ["a"]);
  assert.deepEqual(r.dead.sort(), ["a", "c"]);
  assert.equal(r.village, true);
  assert.ok(!r.winners.includes("a"), "a turned Cursed is on the wolf team");
  // a turned Cursed who lives wins with the wolves
  r = resolveVotes(seats, { a: "c", b: "a", c: "d", d: "c" }, cards);
  assert.deepEqual(r.turned, ["a"]);
  assert.equal(r.wolfTeam, true);
  assert.ok(r.winners.includes("a") && r.winners.includes("b"));
});

// ---- the rest of the missing roles

const act = (s, pid, body, now = 0) => handle(s, pid, { t: "act", step: s.g.step.id, ...body }, now);
const info = (s, pid) => (s.g.info[pid] || []).map((i) => i.text).join(" | ");

test("the Giant Wolf's vote counts twice", () => {
  const cards = { a: "greatwolf", b: "villager", c: "seer", d: "thief" };
  const r = resolveVotes(Object.keys(cards), { a: "b", b: "c", c: "d", d: "a" }, cards);
  assert.equal(r.counts.b, 2);
  assert.deepEqual(r.dead, ["b"]);
});

test("the Dream Wolf doesn't wake, the wolves see them, and a wolf with a Dream Wolf isn't alone", () => {
  const s = room(["a", "b", "c"]);
  rig(s, { a: "werewolf", b: "dozingwolf", c: "lackey" }, ["seer", "villager", "thief"]);
  nightTo(s, "wolves");
  assert.deepEqual(s.g.step.actors, ["a"]);
  assert.equal(s.g.step.prompts.a.kind, "ack");
  assert.match(s.g.step.prompts.a.text, /B .*Dream Wolf/);
  act(s, "a", {});
  nightTo(s, "lackey", 1000);
  assert.match(s.g.step.prompts.c.text, /A and B/);
});

test("the Copycat becomes a center card and acts on that role's turn", () => {
  const s = room(["a", "b", "c"]);
  rig(s, { a: "copycat", b: "werewolf", c: "villager" }, ["seer", "werewolf", "thief"]);
  assert.equal(s.g.steps[0], "copycat");
  nightTo(s, "copycat");
  assert.equal(act(s, "a", { center: 2 }).error, undefined);
  assert.equal(s.g.copied.copycat, "thief");
  let now = nightTo(s, "thief", 1000);
  assert.deepEqual(s.g.step.actors, ["a"]);
  act(s, "a", { target: "b" }, now);
  assert.equal(s.g.cards.a, "werewolf");
  assert.equal(s.g.cards.b, "copycat");
  // b now holds the Copycat card, which became the Robber: village team
  now = finishNight(s, now);
  s.g.votes = { a: "c", b: "c", c: "a" };
  handle(s, s.hostId, { t: "hostEndVote" }, now);
});

test("a Copycat who copies a wolf wakes with the wolves and wins with them", () => {
  const s = room(["a", "b", "c"]);
  rig(s, { a: "copycat", b: "werewolf", c: "villager" }, ["werewolf", "seer", "thief"]);
  nightTo(s, "copycat");
  act(s, "a", { center: 0 });
  nightTo(s, "wolves", 1000);
  assert.deepEqual(s.g.step.actors.sort(), ["a", "b"]);
  const eff = { a: "werewolf", b: "werewolf", c: "villager" };
  const r = resolveVotes(["a", "b", "c"], { a: "c", b: "c", c: "a" }, eff);
  assert.ok(r.winners.includes("a"));
});

test("the Doppelganger copies a player; whoever holds the Doppelganger card at the end is that role", () => {
  const s = room(["a", "b", "c", "d"]);
  rig(s, { a: "lookalike", b: "werewolf", c: "meddler", d: "villager" }, ["seer", "villager", "thief"]);
  nightTo(s, "lookalike");
  assert.equal(act(s, "a", { target: "b" }).error, undefined);
  assert.equal(s.g.copied.lookalike, "werewolf");
  let now = nightTo(s, "wolves", 1000);
  assert.deepEqual(s.g.step.actors.sort(), ["a", "b"]);
  now = nightTo(s, "meddler", now);
  act(s, "c", { targets: ["a", "d"] }, now);
  now = finishNight(s, now);
  // d now holds the Doppelganger card, which became a Werewolf; a holds the Villager
  for (const p of s.g.seats) handle(s, p, { t: "dayReady", ready: true }, now);
  for (const [p, t] of [["a", "d"], ["b", "d"], ["c", "a"], ["d", "a"]]) handle(s, p, { t: "vote", target: t }, now);
  assert.equal(s.phase, "results");
  assert.equal(s.g.result.effective.d, "werewolf");
  assert.deepEqual(s.g.result.dead.sort(), ["a", "d"]);
  assert.equal(s.g.result.village, true);
});

test("the Apprentice Tanner sees the Tanner and wins when the Tanner dies, or alone by dying", () => {
  const s = room(["a", "b", "c"]);
  rig(s, { a: "apprentice", b: "jester", c: "werewolf" }, ["seer", "villager", "thief"]);
  nightTo(s, "apprentice");
  assert.match(s.g.step.prompts.a.text, /Tanner is B/);
  let cards = { a: "apprentice", b: "jester", c: "werewolf", d: "villager" };
  let r = resolveVotes(Object.keys(cards), { a: "b", b: "c", c: "b", d: "a" }, cards);
  assert.deepEqual(r.winners.sort(), ["a", "b"]);
  r = resolveVotes(Object.keys(cards), { a: "c", b: "a", c: "a", d: "b" }, cards);
  assert.ok(!r.winners.includes("a"), "with a Tanner in play the Apprentice doesn't win by dying");
  cards = { a: "apprentice", b: "villager", c: "werewolf", d: "seer" };
  r = resolveVotes(Object.keys(cards), { a: "c", b: "a", c: "a", d: "b" }, cards);
  assert.deepEqual(r.dead, ["a"]);
  assert.deepEqual(r.winners, ["a"]);
  assert.equal(r.wolfTeam, false);
});

test("the Apprentice Seer looks at a center card; the Beholder sees who started as a seer", () => {
  const s = room(["a", "b", "c", "d"]);
  rig(s, { a: "noviceseer", b: "watcher", c: "seer", d: "werewolf" }, ["villager", "werewolf", "thief"]);
  nightTo(s, "noviceseer");
  act(s, "a", { center: 1 });
  assert.match(info(s, "a"), /Center card 2 is the Werewolf/);
  nightTo(s, "watcher", 1000);
  const p = s.g.step.prompts.b;
  assert.match(p.text, /A started as the Apprentice Seer.*C started as the Seer/);
  assert.equal(p.cards.length, 2);
});

test("the Paranormal Investigator stops and turns on seeing a wolf, and may look twice otherwise", () => {
  let s = room(["a", "b", "c", "d"]);
  rig(s, { a: "investigator", b: "werewolf", c: "villager", d: "seer" }, ["villager", "werewolf", "thief"]);
  nightTo(s, "investigator");
  act(s, "a", { target: "c" });
  assert.equal(s.g.step.prompts.a.stage, 2, "a village card lets them look again");
  assert.equal(s.g.step.done.a, undefined);
  act(s, "a", { target: "b" });
  assert.ok(s.g.step.done.a);
  assert.equal(s.g.copied.investigator, "werewolf");

  s = room(["a", "b", "c", "d"]);
  rig(s, { a: "investigator", b: "werewolf", c: "villager", d: "seer" }, ["villager", "werewolf", "thief"]);
  nightTo(s, "investigator");
  act(s, "a", { target: "b" });
  assert.ok(s.g.step.done.a, "seeing a wolf ends the turn");
  assert.equal(s.g.copied.investigator, "werewolf");
});

test("the Gremlin swaps any two players, their own card included", () => {
  const s = room(["a", "b", "c"]);
  rig(s, { a: "imp", b: "werewolf", c: "villager" }, ["seer", "villager", "thief"]);
  nightTo(s, "imp");
  assert.equal(act(s, "a", { targets: ["a", "b"] }).error, undefined);
  assert.equal(s.g.cards.a, "werewolf");
  assert.equal(s.g.cards.b, "imp");
});

test("the Aura Seer sees who moved or looked at a card", () => {
  const s = room(["a", "b", "c", "d"]);
  rig(s, { a: "aurareader", b: "seer", c: "villager", d: "thief" }, ["werewolf", "werewolf", "meddler"]);
  let now = nightTo(s, "seer");
  act(s, "b", { center: [0, 1] }, now);
  now = nightTo(s, "thief", now + 1000);
  act(s, "d", { skip: true }, now);
  nightTo(s, "aurareader", now + 1000);
  assert.match(s.g.step.prompts.a.text, /^B moved or looked/);
});

test("the Revealer leaves a village card face up for the day, but turns a wolf back over", () => {
  let s = room(["a", "b", "c"]);
  rig(s, { a: "unveiler", b: "seer", c: "werewolf" }, ["villager", "werewolf", "thief"]);
  let now = nightTo(s, "unveiler");
  act(s, "a", { target: "b" }, now);
  assert.equal(viewFor(s, "c", now).game.revealed, null, "nobody sees it during the night");
  now = finishNight(s, now);
  assert.deepEqual(viewFor(s, "c", now).game.revealed, { pid: "b", role: "seer" });

  s = room(["a", "b", "c"]);
  rig(s, { a: "unveiler", b: "seer", c: "werewolf" }, ["villager", "werewolf", "thief"]);
  now = nightTo(s, "unveiler");
  act(s, "a", { target: "c" }, now);
  now = finishNight(s, now);
  assert.equal(viewFor(s, "b", now).game.revealed, null);
  assert.match(info(s, "a"), /turned it back face down/);
});

test("win rules mention only the cards in the deck", async () => {
  const { winRules } = await import("./roles.mjs");
  const text = (roles) => winRules(roles).map(([, t]) => t).join(" ");
  const plain = text({ werewolf: 2, seer: 1, villager: 3 });
  for (const n of ["Tanner", "Apprentice", "Squire", "Minion", "Cursed"]) assert.ok(!plain.includes(n), `${n} in ${plain}`);
  assert.equal(winRules({ werewolf: 2, seer: 1, villager: 3 }).length, 2);
  assert.match(text({ werewolf: 2, jester: 1 }), /Tanner wins if the Tanner dies/);
  assert.ok(!text({ werewolf: 2, jester: 1 }).includes("Apprentice"));
  assert.match(text({ werewolf: 2, scout: 1 }), /Squire dies/);
  assert.match(text({}), /Tanner.*Apprentice/s, "with no deck yet (how to play), every rule shows");
});

test("anyone who looks at a Copycat or Doppelganger card sees the role it became", () => {
  const s = room(["a", "b", "c", "d"]);
  rig(s, { a: "copycat", b: "seer", c: "thief", d: "werewolf" }, ["villager", "hunter", "meddler"]);
  nightTo(s, "copycat");
  act(s, "a", { center: 1 });                       // the Copycat becomes the Hunter
  let now = nightTo(s, "seer", 1000);
  act(s, "b", { target: "a" }, now);
  assert.match(info(s, "b"), /A's card is the Hunter\./);
  assert.equal(s.g.step.prompts.b.result.cards[0].role, "hunter");
  now = nightTo(s, "thief", now);
  act(s, "c", { target: "a" }, now);
  assert.match(info(s, "c"), /Your card is now the Hunter\./);
  assert.doesNotMatch(info(s, "b") + info(s, "c"), /Copycat/);
});
