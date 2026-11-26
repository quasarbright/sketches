// Night event pictures: every log entry and every night note carries a picture, every face-up card in it
// says whether the actor saw it, every wake is logged, and a player's own notes never show a card they
// didn't see.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRoom, handle, tick, resolveVotes, effRole } from "./engine.mjs";
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

const ROLE_SETS = [
  // every action and wake role, over a few deals; each player acts with the first legal choice
  [{ a: "lookalike", b: "werewolf", c: "werewolf", d: "lackey", e: "mason", f: "mason", g: "seer", h: "thief", i: "meddler", j: "sleepwalker" }, ["villager", "hunter", "witch"]],
  [{ a: "copycat", b: "witch", c: "packleader", d: "investigator", e: "nightowl", f: "aurareader", g: "unveiler", h: "scout" }, ["villager", "seer", "jester"]],
  [{ a: "prowler", b: "apprentice", c: "watcher", d: "noviceseer", e: "imp", f: "dozingwolf", g: "jester", h: "seer" }, ["villager", "werewolf", "hunter"]],
  [{ a: "lookalike", b: "seer", c: "villager", d: "werewolf" }, ["thief", "meddler", "sleepwalker"]],
];

// Play the whole night, each actor taking its first legal choice (never skipping), so every action is logged.
function playAll(s) {
  if (s.phase === "deal") { s.now = 0; for (const id of s.g.seats) handle(s, id, { t: "peeked" }, 0); }
  let guard = 0;
  while (s.phase === "night") {
    assert.ok(guard++ < 500);
    for (const a of s.g.step.actors) {
      let k = 0;
      while (!s.g.step.done[a] && k++ < 5) {
        const p = s.g.step.prompts[a];
        const others = s.g.seats.filter((t) => !(p.exclude || []).includes(t));
        const body = p.kind === "ack" ? {} : p.kind === "center1" ? { center: 1 } : p.kind === "seer" ? { center: [0, 2] }
          : p.kind === "two" ? { targets: others.slice(0, 2) } : { target: others[0] };
        handle(s, a, { t: "act", step: s.g.step.id, ...body }, s.now);
      }
    }
    s.now += 150; tick(s, s.now);
  }
  return s;
}
const cardsOf = (pic) => pic.flatMap((it) => (it.t === "card" ? [it] : it.cards || []));

test("every log entry has a picture, and every face-up card in it is marked seen or not seen", () => {
  for (const [seats, center] of ROLE_SETS) {
    const s = playAll(rig(seats, center));
    assert.ok(s.g.log.length > 0);
    for (const l of s.g.log) {
      assert.ok(Array.isArray(l.pic) && l.pic.length, `no picture: ${l.text}`);
      for (const c of cardsOf(l.pic)) {
        if (!c.role || c.actor) continue;
        assert.ok(["eye", "eyeoff", "all"].includes(c.badge), `${l.text}: ${c.who}'s ${c.role} has no seen mark`);
      }
    }
  }
});

test("every wake is logged: wolves and Masons see each other, Minion, Squire, Beholder, Apprentice Tanner, Aura Seer, Insomniac", () => {
  const texts = ROLE_SETS.flatMap(([seats, center]) => playAll(rig(seats, center)).g.log.map((l) => l.text));
  for (const re of [/^A, B and C \(wolves\) woke up and saw each other/, /^E and F \(Masons\) woke up and saw each other/, /^D \(Minion\) saw who the wolves are: A, B and C/,
    /^H \(Squire\) saw the wolves' cards/, /^C \(Beholder\) saw who started as a Seer and their cards now: D's Apprentice Seer and H's Seer/, /^B \(Apprentice Tanner\) saw who started as the Tanner: G/,
    /^A \(Mystic Wolf\) woke up and saw that F, the Dream Wolf, stayed asleep\./, /^F \(Aura Seer\) saw that/, /^E \(Insomniac\) looked at their own card/, /\(Revealer\) turned (over )?\w+.s card/])
    assert.ok(texts.some((t) => re.test(t)), `missing ${re}`);
});

test("a wake seen by several players is logged once", () => {
  const s = playAll(rig(ROLE_SETS[0][0], ROLE_SETS[0][1]));
  assert.equal(s.g.log.filter((l) => /saw each other/.test(l.text)).length, 2, "wolves once, Masons once");
});

test("your own night notes never show a card you didn't see", () => {
  for (const [seats, center] of ROLE_SETS) {
    const s = playAll(rig(seats, center));
    for (const [pid, notes] of Object.entries(s.g.info)) for (const n of notes) {
      if (!n.pic) continue;
      for (const c of cardsOf(n.pic)) {
        if (!c.role) continue;
        assert.ok(c.actor || c.known || c.badge === "eye" || c.badge === "all" || c.wolfish, `${pid}'s note "${n.text}" shows ${c.who}'s ${c.role} unseen`);
      }
    }
  }
});

test("the Troublemaker's notes show both swapped cards face down; the end screen shows them face up with a crossed-out eye", () => {
  const s = playAll(rig(ROLE_SETS[0][0], ROLE_SETS[0][1]));
  const log = s.g.log.find((l) => /\(Troublemaker\) swapped/.test(l.text));
  const swapped = log.pic.filter((c) => c.t === "card" && !c.actor);
  assert.equal(swapped.length, 2);
  for (const c of swapped) { assert.ok(c.role); assert.equal(c.badge, "eyeoff"); }
  const note = s.g.info.i.find((n) => n.pic && n.step === "meddler");
  for (const c of note.pic.filter((c) => c.t === "card" && !c.actor)) assert.equal(c.role, null);
});

test("other wolves show as a plain Werewolf in a wolf's own notes", () => {
  const s = playAll(rig({ a: "prowler", b: "werewolf", c: "villager" }, ["seer", "villager", "thief"]));
  const note = s.g.info.b.find((n) => n.step === "wolves");
  const cards = note.pic[0].cards;
  assert.equal(cards.find((c) => c.who === "a").role, "werewolf", "not the Mystic Wolf");
  assert.ok(cards.find((c) => c.who === "b").actor);
});

test("the Minion sees the wolves with an eye, and its notes show each as a plain Werewolf", () => {
  const s = playAll(rig({ a: "prowler", b: "werewolf", c: "lackey" }, ["seer", "villager", "thief"]));
  const logged = cardsOf(s.g.log.find((l) => l.step === "lackey").pic).filter((c) => c.who !== "c");
  assert.deepEqual(logged.map((c) => c.badge), ["eye", "eye"]);
  const note = cardsOf(s.g.info.c.find((n) => n.step === "lackey").pic).filter((c) => c.who !== "c");
  assert.deepEqual(note.map((c) => c.role), ["werewolf", "werewolf"], "not the Mystic Wolf");
});

test("a Doppelganger acting right away, and the Witch's give, are drawn under the line before", () => {
  const s = playAll(rig(ROLE_SETS[3][0], ROLE_SETS[3][1]));
  const i = s.g.log.findIndex((l) => /\(Doppelganger\) looked at/.test(l.text));
  assert.match(s.g.log[i + 1].text, /^Right away, A \(as the Seer\)/);
  assert.equal(s.g.log[i + 1].sub, true);
  const w = playAll(rig(ROLE_SETS[1][0], ROLE_SETS[1][1])).g.log;
  const k = w.findIndex((l) => /\(Witch\) looked at center card 2/.test(l.text));
  assert.ok(k >= 0 && w[k + 1].sub && /^Then B gave it to/.test(w[k + 1].text));
});

test("the Revealer: a village card stays face up for everyone; a wolf or Tanner is turned back, seen only by the Revealer", () => {
  let s = rig({ a: "unveiler", b: "hunter", c: "werewolf" }, ["seer", "villager", "thief"]);
  nightTo(s, "unveiler"); act(s, "a", { target: "b" });
  let l = s.g.log.at(-1);
  assert.match(l.text, /turned B's card face up: the Hunter\. It stays face up for the rest of the game\./);
  assert.equal(l.note, "A saw it right away. Everyone else sees it face up when the night ends.");
  assert.equal(l.pic.at(-1).badge, "all");
  s = rig({ a: "unveiler", b: "jester", c: "werewolf" }, ["seer", "villager", "thief"]);
  nightTo(s, "unveiler"); act(s, "a", { target: "b" });
  l = s.g.log.at(-1);
  assert.match(l.text, /the Tanner, so they turned it back face down\. Only A saw it\./);
  assert.equal(l.pic.at(-1).badge, "eye");
});
