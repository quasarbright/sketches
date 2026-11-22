// The game itself, as plain data and pure-ish functions. Only the host runs this: it holds the
// whole state (including everyone's secret cards) and sends each player a filtered view.
// No DOM, no networking, so it runs under `node --test`.
import { ROLES, ROLE_ORDER, NIGHT_STEPS, suggestedRoles, deckSize } from "./roles.mjs";
import { NAMES as N } from "./skin.mjs";

export const TIMING = {
  stepMin: 6000,      // every night step lasts at least this long, actors or not,
  stepJitter: 3000,   // plus up to this much, so a step's length never reveals a center card.
                      // There's no upper limit: a step waits for every actor who is still connected.
  lobbyGrace: 15000,  // a player who drops out of the lobby is removed after this long
};

const MAX_NAME = 20;
export const MIN_PLAYERS = 3;

export function cleanName(name) {
  return String(name || "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
}

export function createRoom(code, host, now, opts = {}) {
  return {
    code,
    hostId: host.id,
    players: [{ id: host.id, name: cleanName(host.name) || "Player 1", connected: true, joinedAt: now }],
    kicked: [],
    roles: suggestedRoles(MIN_PLAYERS),
    rolesCustom: false,
    dayMinutes: 5,
    phase: "lobby",
    round: 0,
    g: null,
    notice: null,
    timing: { ...TIMING, ...(opts.timing || {}) },
  };
}

const player = (s, id) => s.players.find((p) => p.id === id);
const nameOf = (s, id) => player(s, id)?.name ?? "Someone";
const roleName = (r) => ROLES[r].name;
const centerLabel = (i) => `Center card ${i + 1}`;
// " You're on the wolf team now." when a new card moves you to another team
function teamNote(from, to) {
  const a = ROLES[from].team, b = ROLES[to].team;
  if (a === b) return "";
  return b === "wolf" ? " You're on the wolf team now." : b === "village" ? " You're on the village team now." : " You're on your own now: you win only if you die.";
}

function uniqueName(s, id, name) {
  let base = cleanName(name) || `Player ${s.players.length + 1}`;
  const taken = new Set(s.players.filter((p) => p.id !== id).map((p) => p.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) {
    const n = `${base.slice(0, MAX_NAME - 3)} ${i}`;
    if (!taken.has(n.toLowerCase())) return n;
  }
}

// People dealt in next round: everyone who isn't watching as a spectator.
export const gamePlayers = (s) => s.players.filter((p) => !p.spectator);

function autoRoles(s) {
  if (!s.rolesCustom) s.roles = suggestedRoles(gamePlayers(s).length);
}

export function cardsNeeded(s) {
  return gamePlayers(s).length + 3;
}

// Why the host can't start yet, or null when they can.
export function startProblem(s) {
  const n = gamePlayers(s).length;
  if (n < MIN_PLAYERS) return `Needs at least ${MIN_PLAYERS} players`;
  const have = deckSize(s.roles);
  const need = n + 3;
  if (have < need) return `Add ${need - have} more card${need - have === 1 ? "" : "s"}`;
  if (have > need) return `Remove ${have - need} card${have - need === 1 ? "" : "s"}`;
  if ((s.roles.mason || 0) === 1) return `${N.mason}s come in pairs`;
  return null;
}

function shuffle(a, rng) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------- messages

// Apply one message from player `pid`. Returns { error } or { kicked } or {}.
export function handle(s, pid, msg, now, rng = Math.random) {
  const isHost = pid === s.hostId;
  const g = s.g;
  switch (msg.t) {
    case "hello": {
      if (s.kicked.includes(pid)) return { kicked: true };
      const p = player(s, pid);
      if (p) { p.connected = true; delete p.droppedAt; delete p.left; return {}; }
      // Joining mid-game always watches; it becomes a seat at the next round unless they chose to watch.
      const midGame = s.phase !== "lobby";
      s.players.push({ id: pid, name: uniqueName(s, pid, msg.name), connected: true, joinedAt: now,
        spectator: !!msg.spectator || midGame, autoSpectator: midGame && !msg.spectator });
      if (s.phase === "lobby") autoRoles(s);
      return {};
    }
    case "disconnect": {
      const p = player(s, pid);
      if (p) { p.connected = false; p.droppedAt = now; }
      return {};
    }
    case "leave": {
      removeOrMarkGone(s, pid, now);
      return {};
    }
    case "rename": {
      const p = player(s, pid);
      const n = cleanName(msg.name);
      if (!p || !n) return { error: "Name can't be empty" };
      if (s.phase !== "lobby") return { error: "Names can only be changed in the lobby" };
      p.name = uniqueName(s, pid, n);
      return {};
    }
    case "setSpectator": {
      const p = player(s, pid);
      if (!p) return {};
      if (s.phase !== "lobby") return { error: "This can only be changed in the lobby" };
      p.spectator = !!msg.on;
      delete p.autoSpectator;
      autoRoles(s);
      return {};
    }
    case "setRoles": {
      if (!isHost || s.phase !== "lobby") return { error: "Only the host can change the cards" };
      const roles = {};
      for (const id of ROLE_ORDER) {
        let c = Math.max(0, Math.min(ROLES[id].max, Math.floor(msg.roles?.[id] || 0)));
        if (ROLES[id].pair && c === 1) c = 2;
        if (c) roles[id] = c;
      }
      s.roles = roles;
      s.rolesCustom = true;
      return {};
    }
    case "suggestRoles": {
      if (!isHost || s.phase !== "lobby") return { error: "Only the host can change the cards" };
      s.rolesCustom = false;
      autoRoles(s);
      return {};
    }
    case "setDay": {
      if (!isHost) return { error: "Only the host can change this" };
      const m = Number(msg.minutes);
      if (![1, 3, 5, 7, 10].includes(m)) return { error: "Bad day length" };
      s.dayMinutes = m;
      return {};
    }
    case "start": {
      if (!isHost || s.phase !== "lobby") return { error: "Only the host can start" };
      const problem = startProblem(s);
      if (problem) return { error: problem };
      deal(s, now, rng);
      return {};
    }
    case "peeked": {
      if (s.phase !== "deal" || !g.seats.includes(pid)) return {};
      g.ready[pid] = true;
      maybeStartNight(s, now, rng);
      return {};
    }
    case "act": {
      if (s.phase !== "night") return { error: "It's not night" };
      return act(s, pid, msg, now, rng);
    }
    case "dayReady": {
      if (s.phase !== "day" || !g.seats.includes(pid)) return {};
      if (msg.ready) g.dayReady[pid] = true; else delete g.dayReady[pid];
      if (connectedSeats(s).every((id) => g.dayReady[id])) startVote(s, now);
      return {};
    }
    case "vote": {
      if (s.phase !== "vote" || !g.seats.includes(pid)) return { error: "You can't vote now" };
      if (msg.target === pid || !g.seats.includes(msg.target)) return { error: "Vote for another player" };
      g.votes[pid] = msg.target;
      if (connectedSeats(s).every((id) => g.votes[id])) resolve(s, now);
      return {};
    }
    // ---- host actions
    case "hostStartNight":
      if (!isHost || s.phase !== "deal") return { error: "Not now" };
      startNight(s, now, rng);
      return {};
    case "hostSkipDay":
      if (!isHost || s.phase !== "day") return { error: "Not now" };
      startVote(s, now);
      return {};
    case "hostEndVote":
      if (!isHost || s.phase !== "vote") return { error: "Not now" };
      resolve(s, now);
      return {};
    case "hostKick": {
      if (!isHost || msg.target === pid) return { error: "Not allowed" };
      if (!player(s, msg.target)) return {};
      if (!s.kicked.includes(msg.target)) s.kicked.push(msg.target);
      removeOrMarkGone(s, msg.target, now);
      return {};
    }
    case "hostReset":
      if (!isHost) return { error: "Only the host can do that" };
      toLobby(s);
      return {};
    default:
      return { error: `Unknown message ${msg.t}` };
  }
}

function removeOrMarkGone(s, id, now) {
  const p = player(s, id);
  if (!p) return;
  const seated = s.g && s.phase !== "lobby" && s.g.seats.includes(id);
  if (seated) { p.connected = false; p.left = true; p.droppedAt = now; }
  else {
    s.players = s.players.filter((q) => q.id !== id);
    if (s.phase === "lobby") autoRoles(s);
  }
  // a seated player leaving can unblock whatever everyone else is waiting on
  if (s.phase === "deal") maybeStartNight(s, now, Math.random);
  if (s.phase === "day" && connectedSeats(s).every((x) => s.g.dayReady[x])) startVote(s, now);
  if (s.phase === "vote" && connectedSeats(s).length && connectedSeats(s).every((x) => s.g.votes[x])) resolve(s, now);
}

export function transferHost(s, newId, now) {
  const old = s.hostId;
  s.hostId = newId;
  removeOrMarkGone(s, old, now);
}

function toLobby(s) {
  s.phase = "lobby";
  s.g = null;
  s.round++;
  s.players = s.players.filter((p) => !p.left);
  for (const p of s.players) {
    delete p.left;
    if (p.autoSpectator) { p.spectator = false; delete p.autoSpectator; }
  }
  autoRoles(s);
}

const connectedSeats = (s) => s.g.seats.filter((id) => player(s, id)?.connected);

// ---------------------------------------------------------------- deal & night

function deal(s, now, rng) {
  const deck = [];
  for (const id of ROLE_ORDER) for (let i = 0; i < (s.roles[id] || 0); i++) deck.push(id);
  shuffle(deck, rng);
  const seats = shuffle(gamePlayers(s).map((p) => p.id), rng);
  const dealt = {};
  seats.forEach((id, i) => (dealt[id] = deck[i]));
  const inDeck = new Set(deck);
  s.g = {
    seats,
    dealt,
    cards: { ...dealt },
    center: deck.slice(seats.length, seats.length + 3),
    spare: s.roles.packleader ? "werewolf" : null, // the Pack Leader's extra Werewolf card
    roles: { ...s.roles },
    steps: NIGHT_STEPS.filter((st) => st.roles.some((r) => inDeck.has(r))).map((st) => st.id),
    step: null,
    stepIdx: -1,
    ready: {},
    info: {},
    log: [],
    copied: {},      // card id -> the role it became (Copycat, Lookalike, Investigator)
    touched: {},     // players who moved or looked at a card (for the Aura Reader)
    revealed: null,  // { pid, role }: a card the Unveiler left face up
    dayReady: {},
    votes: {},
    dayEndsAt: null,
    result: null,
  };
  s.phase = "deal";
}

function maybeStartNight(s, now, rng) {
  const seats = connectedSeats(s);
  if (seats.length && seats.every((id) => s.g.ready[id])) startNight(s, now, rng);
}

function startNight(s, now, rng) {
  s.phase = "night";
  s.g.stepIdx = -1;
  nextStep(s, now, rng);
}

function addInfo(s, pid, step, text, cards = []) {
  (s.g.info[pid] ||= []).push({ step, text, cards });
}

function logAction(s, step, actor, text) {
  s.g.log.push({ step, actor, text });
}

// A card's role, counting what a Copycat, Lookalike or Investigator card became.
export const effRole = (g, card) => g.copied?.[card] ?? card;
// The role a player wakes as: their starting card, or what it became.
const wakeRole = (g, pid) => effRole(g, g.dealt[pid]);
const dealtWolves = (g) => g.seats.filter((id) => ROLES[wakeRole(g, id)].wolf);

function nextStep(s, now, rng) {
  const g = s.g;
  g.stepIdx++;
  if (g.stepIdx >= g.steps.length) { startDay(s, now); return; }
  const id = g.steps[g.stepIdx];
  const T = s.timing;
  const actors = g.seats.filter((pid) => {
    const r = wakeRole(g, pid);
    return id === "wolves" ? ROLES[r].wolf && r !== "dozingwolf" : ROLES[r].step === id;
  });
  g.step = {
    id, actors, done: {}, prompts: {},
    startedAt: now,
    minEnd: now + T.stepMin + Math.floor(rng() * T.stepJitter),
  };
  for (const pid of actors) g.step.prompts[pid] = startStep(s, id, pid, actors);
}

// Hand out what an actor learns on waking, and return what they're asked to do.
function startStep(s, id, pid, actors) {
  const g = s.g;
  const names = (ids) => ids.map((x) => nameOf(s, x)).join(" and ");
  const wolves = dealtWolves(g);
  switch (id) {
    case "wolves": {
      const others = actors.filter((x) => x !== pid);
      const dozing = g.seats.filter((x) => wakeRole(g, x) === "dozingwolf");
      if (others.length || dozing.length) {
        const all = [...others, ...dozing];
        const t = `The other ${all.length === 1 ? "wolf is" : "wolves are"} ${names(all)}.${dozing.length ? ` ${names(dozing)} ${dozing.length === 1 ? "is" : "are"} the ${N.dozingwolf} and didn't wake up.` : ""}`;
        addInfo(s, pid, id, t);
        return { kind: "ack", text: t };
      }
      addInfo(s, pid, id, "You're the only wolf.");
      return { kind: "center1", optional: true, text: "You're the only wolf. You may look at one of the 3 center cards." };
    }
    case "packleader":
      if (!g.seats.some((x) => x !== pid && !wolves.includes(x))) {
        return { kind: "ack", text: `Every other player is a wolf, so the spare ${N.werewolf} card stays where it is.` };
      }
      return {
        kind: "player", required: true, spare: true,
        exclude: [pid, ...wolves],
        text: `Give the spare ${N.werewolf} card to a player who isn't a wolf. You swap it with their card: they'll hold the ${N.werewolf} card without knowing it, and their old card goes face down into the spare slot.`,
      };
    case "prowler":
      return { kind: "player", optional: true, exclude: [pid], text: "You may look at another player's card." };
    case "lackey": {
      const t = wolves.length ? `The ${wolves.length === 1 ? "wolf is" : "wolves are"} ${names(wolves)}. They don't know you're the ${N.lackey}.` : "No player is a wolf. Both wolf cards are in the center.";
      addInfo(s, pid, id, wolves.length ? `The ${wolves.length === 1 ? "wolf is" : "wolves are"} ${names(wolves)}.` : "No player is a wolf.");
      return { kind: "ack", text: t };
    }
    case "scout": {
      if (!wolves.length) {
        addInfo(s, pid, id, "No player is a wolf.");
        return { kind: "ack", text: "No player is a wolf." };
      }
      const cards = wolves.map((w) => ({ label: nameOf(s, w), role: g.cards[w] }));
      const t = `The ${wolves.length === 1 ? "wolf is" : "wolves are"} ${names(wolves)}. Here ${wolves.length === 1 ? "is their card" : "are their cards"} right now.`;
      addInfo(s, pid, id, t, cards);
      return { kind: "ack", text: t, cards };
    }
    case "masons": {
      const others = actors.filter((x) => x !== pid);
      const t = others.length ? `The other ${N.mason} is ${names(others)}.` : `You're the only ${N.mason}. The other ${N.mason} card is in the center.`;
      addInfo(s, pid, id, t);
      return { kind: "ack", text: t };
    }
    case "seer":
      return { kind: "seer", optional: true, exclude: [pid], text: "You may look at another player's card, or at two of the center cards." };
    case "thief":
      return { kind: "player", optional: true, exclude: [pid], text: "You may swap cards with another player. You'll see the card you take." };
    case "copycat":
      return { kind: "center1", required: true, text: "Look at a center card. You become that role, and you'll wake again on its turn." };
    case "lookalike":
      return { kind: "player", required: true, exclude: [pid], text: "Look at another player's card. You become that role, and you'll wake again on its turn." };
    case "apprentice": {
      const sk = g.seats.filter((x) => g.dealt[x] === "jester");
      const t = sk.length ? `The ${N.jester} is ${names(sk)}.` : `No player is the ${N.jester}. You win only if you die.`;
      addInfo(s, pid, id, t);
      return { kind: "ack", text: t };
    }
    case "noviceseer":
      return { kind: "center1", optional: true, text: "You may look at one of the center cards." };
    case "watcher": {
      const seers = g.seats.filter((x) => x !== pid && ["seer", "noviceseer"].includes(g.dealt[x]));
      if (!seers.length) { addInfo(s, pid, id, `No player started as the ${N.seer} or ${N.noviceseer}.`); return { kind: "ack", text: `No player started as the ${N.seer} or ${N.noviceseer}.` }; }
      const cards = seers.map((x) => ({ label: nameOf(s, x), role: g.cards[x] }));
      const t = seers.map((x) => `${nameOf(s, x)} started as the ${roleName(g.dealt[x])}.`).join(" ") + ` Here ${seers.length === 1 ? "is their card" : "are their cards"} now.`;
      addInfo(s, pid, id, t, cards);
      return { kind: "ack", text: t, cards };
    }
    case "investigator":
      return { kind: "player", optional: true, exclude: [pid], text: `You may look at another player's card. If it's a wolf or the ${N.jester}, you become that role.` };
    case "imp":
      return { kind: "two", optional: true, exclude: [], text: "You may swap the cards of any two players, yours included. You won't see them." };
    case "aurareader": {
      const seen = g.seats.filter((x) => x !== pid && g.touched[x]);
      const t = seen.length ? `${names(seen)} moved or looked at a card tonight.` : "Nobody else moved or looked at a card tonight.";
      addInfo(s, pid, id, t);
      return { kind: "ack", text: t };
    }
    case "unveiler":
      return { kind: "player", optional: true, exclude: [pid], text: `You may turn another player's card face up for the day. If it's a wolf or the ${N.jester}, it goes back face down.` };
    case "witch":
      return { kind: "center1", optional: true, text: "You may look at a center card. If you do, you must then swap it with any player's card, your own included." };
    case "meddler":
      return { kind: "two", optional: true, exclude: [pid], text: "You may swap the cards of two other players. You won't see them." };
    case "sleepwalker":
      return { kind: "center1", required: true, text: "Swap your card with a center card. You won't see your new card." };
    case "nightowl": {
      const r = g.cards[pid];
      const t = r === "nightowl" ? `Your card is still the ${N.nightowl}.` : `Your card is now the ${roleName(r)}.${teamNote("nightowl", r)}`;
      addInfo(s, pid, id, t, [{ label: "Your card", role: r }]);
      return { kind: "ack", text: t, cards: [{ label: "Your card", role: r }] };
    }
  }
  return { kind: "ack", text: "" };
}

function act(s, pid, msg, now, rng) {
  const g = s.g;
  const st = g.step;
  if (!st || msg.step !== st.id) return { error: "That turn is over" };
  const prompt = st.prompts[pid];
  if (!prompt) return { error: "It's not your turn" };
  if (st.done[pid]) return { error: "Already done" };
  const res = applyAction(s, pid, st.id, prompt, msg);
  if (res.error) return res;
  if (res.next) { st.prompts[pid] = res.next; return {}; }   // a two-part turn (the Witch)
  st.done[pid] = true;
  st.prompts[pid] = { ...prompt, result: res.result };
  advanceIfDone(s, now, rng);
  return {};
}

const validPlayer = (g, prompt, t) => g.seats.includes(t) && !(prompt.exclude || []).includes(t);
const validCenter = (i) => Number.isInteger(i) && i >= 0 && i < 3;

// Applies an action (or a skip) and returns { result } — what the actor sees afterwards.
// Anyone who moved or looked at a card is remembered for the Aura Reader.
function applyAction(s, pid, id, prompt, msg) {
  const r = applyAction1(s, pid, id, prompt, msg);
  if (!r.error && !msg.skip && prompt.kind !== "ack") s.g.touched[pid] = true;
  return r;
}

function applyAction1(s, pid, id, prompt, msg) {
  const g = s.g;
  const me = nameOf(s, pid);
  if (msg.skip) {
    if (prompt.required) return { error: "A choice is required" };
    if (prompt.kind === "ack") return { result: null };
    logAction(s, id, pid, `${me} (${roleName(g.dealt[pid])}) did nothing.`);
    const text = id === "wolves" ? "You didn't look at a center card." : prompt.stage === 2 ? "You stopped there." : `You didn't use your ${roleName(id === "masons" ? "mason" : (ROLES[id] ? id : g.dealt[pid]))} power.`;
    addInfo(s, pid, id, text);
    return { result: { text } };
  }
  switch (prompt.kind) {
    case "ack":
      return { result: null };
    case "center1": {
      const i = msg.center;
      if (!validCenter(i)) return { error: "Pick a center card" };
      if (id === "sleepwalker") {
        [g.cards[pid], g.center[i]] = [g.center[i], g.cards[pid]];
        const t = `You swapped your card with center card ${i + 1}. You didn't see your new card.`;
        addInfo(s, pid, id, t);
        logAction(s, id, pid, `${me} (${N.sleepwalker}) swapped with ${centerLabel(i).toLowerCase()}, getting the ${roleName(g.cards[pid])}.`);
        return { result: { text: t } };
      }
      if (id === "witch") {
        const cards = [{ label: centerLabel(i), role: g.center[i] }];
        const text = `${centerLabel(i)} is the ${roleName(g.center[i])}. Now swap it with a player's card.`;
        return {
          result: { text, cards },
          next: { kind: "player", required: true, witch: i, exclude: [], cards, stage: 2,
            text: `${centerLabel(i)} is the ${roleName(g.center[i])}. Swap it with a player's card, your own included.` },
        };
      }
      if (id === "copycat") {
        const r = g.center[i];
        g.copied[g.dealt[pid]] = r;
        const text = `${centerLabel(i)} is the ${roleName(r)}. You're now the ${roleName(r)}.${teamNote("copycat", r)}${ROLES[r].step || ROLES[r].wolf ? " You'll wake again on its turn." : ""}`;
        addInfo(s, pid, id, text, [{ label: centerLabel(i), role: r }]);
        logAction(s, id, pid, `${me} (${N.copycat}) looked at ${centerLabel(i).toLowerCase()} and became the ${roleName(r)}.`);
        return { result: { text, cards: [{ label: centerLabel(i), role: r }] } };
      }
      const t = `${centerLabel(i)} is the ${roleName(g.center[i])}.`;
      addInfo(s, pid, id, t, [{ label: centerLabel(i), role: g.center[i] }]);
      logAction(s, id, pid, `${me} (${id === "wolves" ? "lone wolf" : roleName(id)}) looked at ${centerLabel(i).toLowerCase()}: the ${roleName(g.center[i])}.`);
      return { result: { text: t, cards: [{ label: centerLabel(i), role: g.center[i] }] } };
    }
    case "player": {
      const t = msg.target;
      if (!validPlayer(g, prompt, t)) return { error: "Pick another player" };
      const them = nameOf(s, t);
      if (id === "packleader") {
        const old = g.cards[t];
        [g.cards[t], g.spare] = [g.spare, g.cards[t]];
        const text = `You swapped the spare ${N.werewolf} card with ${them}'s card. ${them} now holds the ${N.werewolf} card, and their old card is face down in the spare slot.`;
        const cards = [{ label: `${them} now holds`, role: "werewolf" }, { label: "Spare slot", back: true }];
        addInfo(s, pid, id, text, cards);
        logAction(s, id, pid, `${me} (${N.packleader}) gave the spare ${N.werewolf} card to ${them}, whose ${roleName(old)} went into the spare slot.`);
        return { result: { text, cards } };
      }
      if (id === "prowler") {
        const text = `${them}'s card is the ${roleName(g.cards[t])}.`;
        addInfo(s, pid, id, text, [{ label: them, role: g.cards[t] }]);
        logAction(s, id, pid, `${me} (${N.prowler}) looked at ${them}'s card: the ${roleName(g.cards[t])}.`);
        return { result: { text, cards: [{ label: them, role: g.cards[t] }] } };
      }
      if (id === "witch") {
        const i = prompt.witch, seen = g.center[i], old = g.cards[t];
        [g.cards[t], g.center[i]] = [g.center[i], g.cards[t]];
        const mine = t === pid;
        const text = mine
          ? `You looked at ${centerLabel(i).toLowerCase()} and swapped it with your own card. Your card is now the ${roleName(seen)}.${teamNote("witch", seen)}`
          : `You looked at ${centerLabel(i).toLowerCase()}, the ${roleName(seen)}, and swapped it with ${them}'s card. ${them} now holds the ${roleName(seen)}.`;
        const cards = [{ label: mine ? "Your new card" : `${them} now holds`, role: seen }];
        addInfo(s, pid, id, text, cards);
        logAction(s, id, pid, `${me} (${N.witch}) looked at ${centerLabel(i).toLowerCase()}, the ${roleName(seen)}, and swapped it with ${mine ? "their own" : `${them}'s`} ${roleName(old)}.`);
        return { result: { text, cards } };
      }
      if (id === "lookalike") {
        const r = effRole(g, g.cards[t]);
        g.copied[g.dealt[pid]] = r;
        const text = `${them}'s card is the ${roleName(r)}. You're now the ${roleName(r)}.${teamNote("lookalike", r)}${ROLES[r].step || ROLES[r].wolf ? " You'll wake again on its turn." : ""}`;
        addInfo(s, pid, id, text, [{ label: them, role: r }]);
        logAction(s, id, pid, `${me} (${N.lookalike}) looked at ${them}'s card and became the ${roleName(r)}.`);
        return { result: { text, cards: [{ label: them, role: r }] } };
      }
      if (id === "investigator") {
        const r = effRole(g, g.cards[t]);
        const cards = [{ label: them, role: r }];
        const turns = ROLES[r].wolf || r === "jester";
        logAction(s, id, pid, `${me} (${N.investigator}) looked at ${them}'s card: the ${roleName(r)}${turns ? `, and became the ${roleName(r)}` : ""}.`);
        if (turns) {
          g.copied[g.dealt[pid]] = r;
          const text = `${them}'s card is the ${roleName(r)}, so you're now the ${roleName(r)}.${teamNote("investigator", r)}`;
          addInfo(s, pid, id, text, cards);
          return { result: { text, cards } };
        }
        const text = `${them}'s card is the ${roleName(r)}.`;
        addInfo(s, pid, id, text, cards);
        if (prompt.stage === 2) return { result: { text, cards } };
        return {
          result: { text, cards },
          next: { kind: "player", optional: true, exclude: [pid, t], cards, stage: 2,
            text: `${text} You may look at one more player's card.` },
        };
      }
      if (id === "unveiler") {
        const r = effRole(g, g.cards[t]);
        const cards = [{ label: them, role: r }];
        const hide = ROLES[r].wolf || r === "jester";
        if (!hide) g.revealed = { pid: t, role: r };
        const text = hide ? `${them}'s card is the ${roleName(r)}, so you turned it back face down. Only you saw it.` : `${them}'s card is the ${roleName(r)}. It stays face up for everyone to see.`;
        addInfo(s, pid, id, text, cards);
        logAction(s, id, pid, `${me} (${N.unveiler}) turned over ${them}'s card: the ${roleName(r)}${hide ? ", and turned it back" : ", left face up"}.`);
        return { result: { text, cards } };
      }
      if (id === "thief") {
        [g.cards[pid], g.cards[t]] = [g.cards[t], g.cards[pid]];
        const text = `You swapped cards with ${them}. Your card is now the ${roleName(g.cards[pid])}.${teamNote("thief", g.cards[pid])}`;
        addInfo(s, pid, id, text, [{ label: "Your new card", role: g.cards[pid] }]);
        logAction(s, id, pid, `${me} (${N.thief}) swapped with ${them} and took the ${roleName(g.cards[pid])}.`);
        return { result: { text, cards: [{ label: "Your new card", role: g.cards[pid] }] } };
      }
      return { error: "Bad action" };
    }
    case "seer": {
      if (msg.target != null) {
        const t = msg.target;
        if (!validPlayer(g, prompt, t)) return { error: "Pick another player" };
        const them = nameOf(s, t);
        const text = `${them}'s card is the ${roleName(g.cards[t])}.`;
        addInfo(s, pid, id, text, [{ label: them, role: g.cards[t] }]);
        logAction(s, id, pid, `${me} (${N.seer}) looked at ${them}'s card: the ${roleName(g.cards[t])}.`);
        return { result: { text, cards: [{ label: them, role: g.cards[t] }] } };
      }
      const c = msg.center;
      if (!Array.isArray(c) || c.length !== 2 || c[0] === c[1] || !c.every(validCenter)) return { error: "Pick two center cards" };
      const cards = c.map((i) => ({ label: centerLabel(i), role: g.center[i] }));
      const text = `${centerLabel(c[0])} is the ${roleName(g.center[c[0]])} and ${centerLabel(c[1]).toLowerCase()} is the ${roleName(g.center[c[1]])}.`;
      addInfo(s, pid, id, text, cards);
      logAction(s, id, pid, `${me} (${N.seer}) looked at center cards ${c[0] + 1} and ${c[1] + 1}: the ${roleName(g.center[c[0]])} and the ${roleName(g.center[c[1]])}.`);
      return { result: { text, cards } };
    }
    case "two": {
      const ts = msg.targets;
      if (!Array.isArray(ts) || ts.length !== 2 || ts[0] === ts[1] || !ts.every((t) => validPlayer(g, prompt, t))) return { error: "Pick two other players" };
      const [a, b] = ts;
      [g.cards[a], g.cards[b]] = [g.cards[b], g.cards[a]];
      const nm = (x) => (x === pid ? "your" : `${nameOf(s, x)}'s`);
      const text = `You swapped ${nm(a)} and ${nm(b)} cards.`;
      addInfo(s, pid, id, text);
      logAction(s, id, pid, `${me} (${roleName(id === "imp" ? "imp" : "meddler")}) swapped ${nameOf(s, a)}'s and ${nameOf(s, b)}'s cards.`);
      return { result: { text } };
    }
  }
  return { error: "Bad action" };
}

// What an actor who dropped out before answering gets: optional actions are skipped, required ones
// picked at random. Night actions have no time limit, so this only happens to players who left.
function defaultAction(s, pid, prompt, rng) {
  if (!prompt.required) return { skip: true, timedOut: true };
  if (prompt.kind === "center1") return { center: Math.floor(rng() * 3) };
  const options = s.g.seats.filter((t) => !(prompt.exclude || []).includes(t));
  return { target: options[Math.floor(rng() * options.length)] };
}

function advanceIfDone(s, now, rng) {
  const st = s.g.step;
  const allDone = st.actors.every((a) => st.done[a] || !player(s, a)?.connected);
  if (allDone && now >= st.minEnd) {
    for (const a of st.actors) {
      if (st.done[a]) continue;
      const prompt = st.prompts[a];
      let p2 = prompt;
      let r = applyAction(s, a, st.id, p2, defaultAction(s, a, p2, rng));
      if (r.next) { p2 = r.next; r = applyAction(s, a, st.id, p2, defaultAction(s, a, p2, rng)); }
      if (r.error) r = { result: null };
      st.done[a] = true;
      st.prompts[a] = { ...p2, result: r.result, timedOut: true };
    }
    nextStep(s, now, rng);
  }
}

function startDay(s, now) {
  s.phase = "day";
  s.g.step = null;
  s.g.dayEndsAt = now + s.dayMinutes * 60000;
}

function startVote(s, now) {
  s.phase = "vote";
  s.g.voteStartedAt = now;
}

// ---------------------------------------------------------------- the vote

export function resolveVotes(seats, votes, cards) {
  const counts = {};
  // the Great Wolf's vote counts twice
  for (const v of seats) if (votes[v]) counts[votes[v]] = (counts[votes[v]] || 0) + (cards[v] === "greatwolf" ? 2 : 1);
  // The Prince, and whoever the Bodyguard votes for, can't die: the next most votes count instead.
  const guarded = new Set(seats.filter((p) => cards[p] === "prince"));
  for (const b of seats) if (cards[b] === "bodyguard" && votes[b]) guarded.add(votes[b]);
  const open = seats.filter((p) => !guarded.has(p));
  const max = Math.max(0, ...open.map((p) => counts[p] || 0));
  // nobody dies unless someone got at least two votes; ties all die
  const dead = max >= 2 ? open.filter((p) => counts[p] === max) : [];
  const saved = seats.filter((p) => guarded.has(p) && (counts[p] || 0) >= 2 && (counts[p] || 0) >= max);
  const hunterShots = [], hunterBlocked = [];
  const queue = [...dead];
  while (queue.length) {
    const p = queue.shift();
    const t = votes[p];
    if (cards[p] === "hunter" && t && !dead.includes(t)) {
      if (guarded.has(t)) { hunterBlocked.push([p, t]); continue; }
      dead.push(t); queue.push(t); hunterShots.push([p, t]);
    }
  }
  // A Cursed that any wolf voted for becomes a wolf.
  const born = (p) => ROLES[cards[p]].wolf;
  const turned = seats.filter((p) => cards[p] === "cursed" && seats.some((v) => votes[v] === p && born(v)));
  const team = (p) => (turned.includes(p) ? "wolf" : ROLES[cards[p]].team);
  const isWolf = (p) => born(p) || turned.includes(p);
  const died = (pred) => dead.some(pred);
  const deadWolf = died(isWolf);
  const deadScout = died((p) => cards[p] === "scout");
  const deadLackey = died((p) => cards[p] === "lackey");
  // With no Skinner among the players, the Apprentice is one: they win, and stop the wolves, by dying.
  const skinners = seats.some((p) => cards[p] === "jester") ? ["jester"] : ["jester", "apprentice"];
  const deadJester = died((p) => skinners.includes(cards[p]));
  let village, wolfTeam;
  if (seats.some(isWolf)) {
    village = deadWolf || deadScout;
    wolfTeam = !deadWolf && !deadScout && !deadJester;
  } else if (seats.some((p) => team(p) === "wolf")) {
    // only a Lackey and/or Scout: they win if someone off their team dies
    village = dead.length === 0 || deadLackey || deadScout;
    wolfTeam = !deadLackey && !deadScout && !deadJester && died((p) => team(p) !== "wolf");
  } else {
    village = dead.length === 0;
    wolfTeam = false;
  }
  const winners = seats.filter((p) =>
    cards[p] === "jester" ? dead.includes(p)
      : cards[p] === "apprentice" ? (skinners.length === 1 ? died((x) => cards[x] === "jester") : dead.includes(p))
      : team(p) === "village" ? village : wolfTeam);
  return { counts, dead, hunterShots, hunterBlocked, saved, guarded: [...guarded], turned, village, wolfTeam, jester: deadJester, winners };
}

function resolve(s, now) {
  const g = s.g;
  const eff = Object.fromEntries(g.seats.map((p) => [p, effRole(g, g.cards[p])]));
  g.result = { ...resolveVotes(g.seats, g.votes, eff), effective: eff, votes: { ...g.votes } };
  s.phase = "results";
}

// ---------------------------------------------------------------- time

// Call a few times a second on the host. Returns true when something changed.
export function tick(s, now, rng = Math.random) {
  let changed = false;
  if (s.phase === "lobby") {
    const before = s.players.length;
    s.players = s.players.filter((p) => p.connected || p.id === s.hostId || now - (p.droppedAt ?? now) < s.timing.lobbyGrace);
    if (s.players.length !== before) { autoRoles(s); changed = true; }
  }
  if (s.phase === "night" && s.g.step) {
    const idx = s.g.stepIdx;
    advanceIfDone(s, now, rng);
    if (s.g.stepIdx !== idx || s.phase !== "night") changed = true;
  }
  if (s.phase === "day" && now >= s.g.dayEndsAt) { startVote(s, now); changed = true; }
  return changed;
}

// ---------------------------------------------------------------- per-player view

export function viewFor(s, pid, now) {
  const g = s.g;
  const seated = !!g && g.seats.includes(pid);
  const me = player(s, pid);
  const spectator = !!me?.spectator || (!!g && !seated);
  const v = {
    code: s.code,
    you: pid,
    hostId: s.hostId,
    isHost: pid === s.hostId,
    phase: s.phase,
    round: s.round,
    now,
    players: s.players.map((p) => ({
      id: p.id, name: p.name, connected: p.connected, left: !!p.left,
      spectator: !!p.spectator, seated: g ? g.seats.includes(p.id) : !p.spectator,
      ready: !!g?.ready[p.id], dayReady: !!g?.dayReady[p.id], voted: !!g?.votes[p.id],
    })),
    roles: g ? g.roles : s.roles,
    rolesCustom: s.rolesCustom,
    spectator,
    dayMinutes: s.dayMinutes,
    startProblem: s.phase === "lobby" ? startProblem(s) : null,
    game: null,
  };
  if (!g) return v;
  const st = g.step;
  const knowsStep = spectator || s.phase !== "night" || !!(st && st.prompts[pid] && !st.done[pid]);
  v.game = {
    seated,
    seats: g.seats,
    myCard: seated ? g.dealt[pid] : null,
    hasSpare: !!g.spare,
    // At night a player learns nothing about the night's progress (which card is awake, how many
    // turns there are) except during their own turn. Spectators see it all.
    steps: knowsStep ? g.steps : null,
    stepIdx: knowsStep ? g.stepIdx : null,
    stepId: knowsStep ? st?.id ?? null : null,
    prompt: st && st.prompts[pid] ? { ...st.prompts[pid], step: st.id, done: !!st.done[pid] } : null,
    info: g.info[pid] || [],
    dayEndsAt: g.dayEndsAt,
    myVote: g.votes[pid] || null,
    revealed: s.phase !== "night" || spectator ? g.revealed : null,
    result: null,
  };
  // Spectators see everything, at every moment: every card, the night log and the votes.
  if (spectator) {
    v.game.omni = {
      dealt: g.dealt, cards: g.cards, center: g.center, spare: g.spare, log: g.log, copied: g.copied,
      actors: st ? st.actors : [], votes: g.votes, dayReady: g.dayReady,
    };
  }
  if (s.phase === "results") {
    v.game.result = { ...g.result, dealt: g.dealt, cards: g.cards, center: g.center, spare: g.spare, log: g.log, copied: g.copied, revealed: g.revealed };
  }
  return v;
}
