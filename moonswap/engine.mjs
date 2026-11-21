// The game itself, as plain data and pure-ish functions. Only the host runs this: it holds the
// whole state (including everyone's secret cards) and sends each player a filtered view.
// No DOM, no networking, so it runs under `node --test`.
import { ROLES, ROLE_ORDER, NIGHT_STEPS, suggestedRoles, deckSize } from "./roles.mjs";

export const TIMING = {
  stepMin: 6000,      // every night step lasts at least this long, actors or not,
  stepJitter: 3000,   // plus up to this much, so a step's length never reveals a center card
  stepMax: 45000,     // then anyone who hasn't acted gets the default (skip, or a random pick)
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

function uniqueName(s, id, name) {
  let base = cleanName(name) || `Player ${s.players.length + 1}`;
  const taken = new Set(s.players.filter((p) => p.id !== id).map((p) => p.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) {
    const n = `${base.slice(0, MAX_NAME - 3)} ${i}`;
    if (!taken.has(n.toLowerCase())) return n;
  }
}

function autoRoles(s) {
  if (!s.rolesCustom) s.roles = suggestedRoles(s.players.length);
}

export function cardsNeeded(s) {
  return s.players.length + 3;
}

// Why the host can't start yet, or null when they can.
export function startProblem(s) {
  const n = s.players.length;
  if (n < MIN_PLAYERS) return `Needs at least ${MIN_PLAYERS} players`;
  const have = deckSize(s.roles);
  const need = n + 3;
  if (have < need) return `Pick ${need - have} more card${need - have === 1 ? "" : "s"}`;
  if (have > need) return `Remove ${have - need} card${have - need === 1 ? "" : "s"}`;
  if ((s.roles.mason || 0) === 1) return "Masons come in pairs";
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
      s.players.push({ id: pid, name: uniqueName(s, pid, msg.name), connected: true, joinedAt: now });
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
      p.name = uniqueName(s, pid, n);
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
  for (const p of s.players) delete p.left;
  autoRoles(s);
}

const connectedSeats = (s) => s.g.seats.filter((id) => player(s, id)?.connected);

// ---------------------------------------------------------------- deal & night

function deal(s, now, rng) {
  const deck = [];
  for (const id of ROLE_ORDER) for (let i = 0; i < (s.roles[id] || 0); i++) deck.push(id);
  shuffle(deck, rng);
  const seats = shuffle(s.players.map((p) => p.id), rng);
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

const dealtWolves = (g) => g.seats.filter((id) => ROLES[g.dealt[id]].wolf);

function nextStep(s, now, rng) {
  const g = s.g;
  g.stepIdx++;
  if (g.stepIdx >= g.steps.length) { startDay(s, now); return; }
  const id = g.steps[g.stepIdx];
  const T = s.timing;
  const actors = g.seats.filter((pid) =>
    id === "wolves" ? ROLES[g.dealt[pid]].wolf : ROLES[g.dealt[pid]].step === id);
  g.step = {
    id, actors, done: {}, prompts: {},
    startedAt: now,
    minEnd: now + T.stepMin + Math.floor(rng() * T.stepJitter),
    maxEnd: now + T.stepMax,
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
      if (others.length) {
        addInfo(s, pid, id, `The other ${others.length === 1 ? "wolf is" : "wolves are"} ${names(others)}.`);
        return { kind: "ack", text: `The other ${others.length === 1 ? "wolf is" : "wolves are"} ${names(others)}.` };
      }
      addInfo(s, pid, id, "You're the only wolf.");
      return { kind: "center1", optional: true, text: "You're the only wolf. You may look at one of the 3 center cards." };
    }
    case "packleader":
      if (!g.seats.some((x) => x !== pid && !wolves.includes(x))) {
        return { kind: "ack", text: "Every other player is a wolf, so the spare Werewolf card stays where it is." };
      }
      return {
        kind: "player", required: true, spare: true,
        exclude: [pid, ...wolves],
        text: "Give the spare Werewolf card to a player who isn't a wolf. You swap it with their card: they'll hold the Werewolf card without knowing it, and their old card goes face down into the spare slot.",
      };
    case "prowler":
      return { kind: "player", optional: true, exclude: [pid], text: "You may look at another player's card." };
    case "lackey": {
      const t = wolves.length ? `The ${wolves.length === 1 ? "wolf is" : "wolves are"} ${names(wolves)}. They don't know you're the Lackey.` : "No player is a wolf. Both wolf cards are in the center.";
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
      const t = others.length ? `The other Mason is ${names(others)}.` : "You're the only Mason. The other Mason card is in the center.";
      addInfo(s, pid, id, t);
      return { kind: "ack", text: t };
    }
    case "seer":
      return { kind: "seer", optional: true, exclude: [pid], text: "You may look at another player's card, or at two of the center cards." };
    case "thief":
      return { kind: "player", optional: true, exclude: [pid], text: "You may swap cards with another player. You'll see the card you take." };
    case "meddler":
      return { kind: "two", optional: true, exclude: [pid], text: "You may swap the cards of two other players. You won't see them." };
    case "sleepwalker":
      return { kind: "center1", required: true, text: "Swap your card with a center card. You won't see your new card." };
    case "nightowl": {
      const r = g.cards[pid];
      const t = r === "nightowl" ? "Your card is still the Night Owl." : `Your card is now the ${roleName(r)}.`;
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
  st.done[pid] = true;
  st.prompts[pid] = { ...prompt, result: res.result };
  advanceIfDone(s, now, rng);
  return {};
}

const validPlayer = (g, prompt, t) => g.seats.includes(t) && !(prompt.exclude || []).includes(t);
const validCenter = (i) => Number.isInteger(i) && i >= 0 && i < 3;

// Applies an action (or a skip) and returns { result } — what the actor sees afterwards.
function applyAction(s, pid, id, prompt, msg) {
  const g = s.g;
  const me = nameOf(s, pid);
  if (msg.skip) {
    if (prompt.required) return { error: "You have to choose" };
    if (prompt.kind !== "ack") logAction(s, id, pid, `${me} (${roleName(g.dealt[pid])}) did nothing.`);
    return { result: prompt.kind === "ack" ? null : { text: "You did nothing." } };
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
        logAction(s, id, pid, `${me} (Sleepwalker) swapped with ${centerLabel(i).toLowerCase()}, getting the ${roleName(g.cards[pid])}.`);
        return { result: { text: t } };
      }
      const t = `${centerLabel(i)} is the ${roleName(g.center[i])}.`;
      addInfo(s, pid, id, t, [{ label: centerLabel(i), role: g.center[i] }]);
      logAction(s, id, pid, `${me} (lone wolf) looked at ${centerLabel(i).toLowerCase()}: the ${roleName(g.center[i])}.`);
      return { result: { text: t, cards: [{ label: centerLabel(i), role: g.center[i] }] } };
    }
    case "player": {
      const t = msg.target;
      if (!validPlayer(g, prompt, t)) return { error: "Pick another player" };
      const them = nameOf(s, t);
      if (id === "packleader") {
        const old = g.cards[t];
        [g.cards[t], g.spare] = [g.spare, g.cards[t]];
        const text = `You swapped the spare Werewolf card with ${them}'s card. ${them} now holds the Werewolf card, and their old card is face down in the spare slot.`;
        const cards = [{ label: `${them} now holds`, role: "werewolf" }, { label: "Spare slot", back: true }];
        addInfo(s, pid, id, text, cards);
        logAction(s, id, pid, `${me} (Pack Leader) gave the spare Werewolf card to ${them}, whose ${roleName(old)} went into the spare slot.`);
        return { result: { text, cards } };
      }
      if (id === "prowler") {
        const text = `${them}'s card is the ${roleName(g.cards[t])}.`;
        addInfo(s, pid, id, text, [{ label: them, role: g.cards[t] }]);
        logAction(s, id, pid, `${me} (Prowler) looked at ${them}'s card: the ${roleName(g.cards[t])}.`);
        return { result: { text, cards: [{ label: them, role: g.cards[t] }] } };
      }
      if (id === "thief") {
        [g.cards[pid], g.cards[t]] = [g.cards[t], g.cards[pid]];
        const text = `You swapped cards with ${them}. Your card is now the ${roleName(g.cards[pid])}.`;
        addInfo(s, pid, id, text, [{ label: "Your new card", role: g.cards[pid] }]);
        logAction(s, id, pid, `${me} (Thief) swapped with ${them} and took the ${roleName(g.cards[pid])}.`);
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
        logAction(s, id, pid, `${me} (Seer) looked at ${them}'s card: the ${roleName(g.cards[t])}.`);
        return { result: { text, cards: [{ label: them, role: g.cards[t] }] } };
      }
      const c = msg.center;
      if (!Array.isArray(c) || c.length !== 2 || c[0] === c[1] || !c.every(validCenter)) return { error: "Pick two center cards" };
      const cards = c.map((i) => ({ label: centerLabel(i), role: g.center[i] }));
      const text = `${centerLabel(c[0])} is the ${roleName(g.center[c[0]])} and ${centerLabel(c[1]).toLowerCase()} is the ${roleName(g.center[c[1]])}.`;
      addInfo(s, pid, id, text, cards);
      logAction(s, id, pid, `${me} (Seer) looked at center cards ${c[0] + 1} and ${c[1] + 1}: the ${roleName(g.center[c[0]])} and the ${roleName(g.center[c[1]])}.`);
      return { result: { text, cards } };
    }
    case "two": {
      const ts = msg.targets;
      if (!Array.isArray(ts) || ts.length !== 2 || ts[0] === ts[1] || !ts.every((t) => validPlayer(g, prompt, t))) return { error: "Pick two other players" };
      const [a, b] = ts;
      [g.cards[a], g.cards[b]] = [g.cards[b], g.cards[a]];
      const text = `You swapped ${nameOf(s, a)}'s and ${nameOf(s, b)}'s cards.`;
      addInfo(s, pid, id, text);
      logAction(s, id, pid, `${me} (Meddler) swapped ${nameOf(s, a)}'s and ${nameOf(s, b)}'s cards.`);
      return { result: { text } };
    }
  }
  return { error: "Bad action" };
}

// What an actor who never answered gets: optional actions are skipped, required ones picked at random.
function defaultAction(s, pid, prompt, rng) {
  if (!prompt.required) return { skip: true };
  if (prompt.kind === "center1") return { center: Math.floor(rng() * 3) };
  const options = s.g.seats.filter((t) => !(prompt.exclude || []).includes(t));
  return { target: options[Math.floor(rng() * options.length)] };
}

function advanceIfDone(s, now, rng) {
  const st = s.g.step;
  const allDone = st.actors.every((a) => st.done[a] || !player(s, a)?.connected);
  if (now >= st.maxEnd || (allDone && now >= st.minEnd)) {
    for (const a of st.actors) {
      if (st.done[a]) continue;
      const prompt = st.prompts[a];
      let r = applyAction(s, a, st.id, prompt, defaultAction(s, a, prompt, rng));
      if (r.error) r = { result: null };
      st.done[a] = true;
      st.prompts[a] = { ...prompt, result: r.result, timedOut: true };
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
  for (const v of seats) if (votes[v]) counts[votes[v]] = (counts[votes[v]] || 0) + 1;
  const max = Math.max(0, ...Object.values(counts));
  // nobody dies unless someone got at least two votes; ties all die
  const dead = max >= 2 ? seats.filter((p) => counts[p] === max) : [];
  const hunterShots = [];
  const queue = [...dead];
  while (queue.length) {
    const p = queue.shift();
    const t = votes[p];
    if (cards[p] === "hunter" && t && !dead.includes(t)) {
      dead.push(t); queue.push(t); hunterShots.push([p, t]);
    }
  }
  const team = (p) => ROLES[cards[p]].team;
  const isWolf = (p) => ROLES[cards[p]].wolf;
  const died = (pred) => dead.some(pred);
  const deadWolf = died(isWolf);
  const deadScout = died((p) => cards[p] === "scout");
  const deadLackey = died((p) => cards[p] === "lackey");
  const deadJester = died((p) => cards[p] === "jester");
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
    cards[p] === "jester" ? dead.includes(p) : team(p) === "village" ? village : wolfTeam);
  return { counts, dead, hunterShots, village, wolfTeam, jester: deadJester, winners };
}

function resolve(s, now) {
  const g = s.g;
  g.result = { ...resolveVotes(g.seats, g.votes, g.cards), votes: { ...g.votes } };
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
      seated: !g || g.seats.includes(p.id),
      ready: !!g?.ready[p.id], dayReady: !!g?.dayReady[p.id], voted: !!g?.votes[p.id],
    })),
    roles: g ? g.roles : s.roles,
    rolesCustom: s.rolesCustom,
    dayMinutes: s.dayMinutes,
    startProblem: s.phase === "lobby" ? startProblem(s) : null,
    game: null,
  };
  if (!g) return v;
  const st = g.step;
  v.game = {
    seated,
    seats: g.seats,
    myCard: seated ? g.dealt[pid] : null,
    hasSpare: !!g.spare,
    steps: g.steps,
    stepIdx: g.stepIdx,
    stepId: st?.id ?? null,
    stepEndsAt: st ? st.maxEnd : null,
    prompt: st && st.prompts[pid] ? { ...st.prompts[pid], step: st.id, done: !!st.done[pid] } : null,
    info: g.info[pid] || [],
    dayEndsAt: g.dayEndsAt,
    myVote: g.votes[pid] || null,
    result: null,
  };
  if (s.phase === "results") {
    v.game.result = { ...g.result, dealt: g.dealt, cards: g.cards, center: g.center, spare: g.spare, log: g.log };
  }
  return v;
}
