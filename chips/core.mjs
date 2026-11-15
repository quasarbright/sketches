// The table's rules: a pure reducer the host runs on every request. Nothing here touches the
// network or the page, so it is the one place that decides who may move whose chips.
//
// State (broadcast to everyone):
//   { code, hostId, start, players:[{id,name,color,chips,online}], pots:[{id,name,chips}],
//     log:[{id,ts,parts,delta?,undone?}], seq }
// A "ref" names a stack: { k: "p", id } for a player, { k: "pot", id } for a pot.

export const COLORS = [
  "#ef4444", "#f97316", "#facc15", "#84cc16", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#e7e5e4",
];
export const COLOR_NAMES = {
  "#ef4444": "red", "#f97316": "orange", "#facc15": "yellow", "#84cc16": "lime",
  "#22c55e": "green", "#14b8a6": "teal", "#06b6d4": "cyan", "#3b82f6": "blue",
  "#6366f1": "indigo", "#a855f7": "purple", "#ec4899": "pink", "#e7e5e4": "white",
};
const LOG_CAP = 200;
export const MAX_NAME = 20;

export function newTable({ code, host, start = 1000 }) {
  const s = { code, hostId: null, start, players: [], pots: [], log: [], seq: 0 };
  const id = nextId(s);
  s.hostId = id;
  s.players.push({ id, name: cleanName(host.name), color: host.color, chips: start, online: true });
  s.pots.push({ id: nextId(s), name: "Pot", chips: 0 });
  log(s, [pref(s, id), " opened the table with ", amt(start)]);
  return s;
}

export function cleanName(n) { return String(n ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_NAME); }
const nextId = (s) => "x" + (++s.seq).toString(36);
const isInt = (n) => Number.isSafeInteger(n);

export const player = (s, id) => s.players.find((p) => p.id === id);
export const pot = (s, id) => s.pots.find((p) => p.id === id);
export const stack = (s, ref) => ref && (ref.k === "p" ? player(s, ref.id) : ref.k === "pot" ? pot(s, ref.id) : null);
export const sameRef = (a, b) => a && b && a.k === b.k && a.id === b.id;
export const freeColors = (s) => COLORS.filter((c) => !s.players.some((p) => p.color === c));
export const total = (s) => s.players.reduce((t, p) => t + p.chips, 0) + s.pots.reduce((t, p) => t + p.chips, 0);

// log parts: plain strings, {r:"p"|"pot", id, n, c} for a name, {a:n} for an amount
function pref(s, id) { const p = player(s, id); return { r: "p", id, n: p?.name ?? "?", c: p?.color }; }
function sref(s, ref) { const x = stack(s, ref); return ref.k === "p" ? pref(s, ref.id) : { r: "pot", id: ref.id, n: x?.name ?? "pot" }; }
const amt = (a) => ({ a });
function log(s, parts, delta) {
  const e = { id: nextId(s), ts: Date.now(), parts };
  if (delta) e.delta = delta;
  s.log.push(e);
  if (s.log.length > LOG_CAP) s.log.splice(0, s.log.length - LOG_CAP);
  return e;
}
const key = (ref) => ref.k + ":" + ref.id;
const unkey = (k) => { const i = k.indexOf(":"); return { k: k.slice(0, i), id: k.slice(i + 1) }; };

const fail = (error) => ({ error });

// apply(state, action, actorId) → { state } or { error }. Never mutates its input.
export function apply(state, action, actor) {
  const s = structuredClone(state);
  const isHost = actor === s.hostId;
  const me = player(s, actor);
  if (!me && action.type !== "join") return fail("You're not at this table.");
  if (me && action.type === "join") return fail("You're already at this table.");
  const r = reducers[action.type];
  if (!r) return fail("Unknown action.");
  if (r.host && !isHost) return fail("Only the host can do that.");
  const err = r.run(s, action, actor, isHost);
  return err ? fail(err) : { state: s };
}

const reducers = {
  join: {
    run(s, { id, name, color }) {
      if (typeof id !== "string" || player(s, id)) return "Bad seat.";
      name = cleanName(name);
      if (!name) return "Pick a name.";
      if (!COLORS.includes(color)) return "Pick a color.";
      if (s.players.some((p) => p.color === color)) return "Someone just took that color — pick another.";
      s.players.push({ id, name, color, chips: s.start, online: true });
      log(s, [pref(s, id), " joined with ", amt(s.start)]);
    },
  },

  // move chips between any two stacks; players may only move their own
  transfer: {
    run(s, { from, to, amount }, actor, isHost) {
      if (!isInt(amount) || amount <= 0) return "Enter an amount.";
      const a = stack(s, from), b = stack(s, to);
      if (!a || !b) return "That stack is gone.";
      if (sameRef(from, to)) return "Pick somewhere else to send them.";
      const own = from.k === "p" && from.id === actor;
      if (!own && !isHost) return "Those aren't your chips.";
      if (a.chips < amount) return own ? `You only have ${a.chips}.` : `${a.name} only has ${a.chips}.`;
      a.chips -= amount; b.chips += amount;
      const delta = { [key(from)]: -amount, [key(to)]: amount };
      if (own) log(s, [pref(s, actor), to.k === "pot" ? " bet " : " gave ", amt(amount), " → ", sref(s, to)], delta);
      else log(s, [pref(s, actor), " moved ", amt(amount), " from ", sref(s, from), " → ", sref(s, to)], delta);
    },
  },

  // give a pot to one or more players, split evenly; the odd chips stay in the pot
  award: {
    host: true,
    run(s, { pot: potId, winners }) {
      const p = pot(s, potId);
      if (!p) return "That pot is gone.";
      winners = [...new Set(winners || [])].filter((id) => player(s, id));
      if (!winners.length) return "Pick who wins.";
      if (!p.chips) return "That pot is empty.";
      const share = Math.floor(p.chips / winners.length);
      if (!share) return `Not enough chips to split ${winners.length} ways.`;
      const delta = {};
      for (const id of winners) { player(s, id).chips += share; delta["p:" + id] = share; }
      const paid = share * winners.length;
      p.chips -= paid; delta["pot:" + potId] = -paid;
      const names = [];
      winners.forEach((id, i) => { if (i) names.push(i === winners.length - 1 ? " & " : ", "); names.push(pref(s, id)); });
      const parts = [{ r: "pot", id: potId, n: p.name }, " → ", ...names, " ", amt(share)];
      if (winners.length > 1) parts.push(" each");
      if (p.chips) parts.push(` (${p.chips} left in pot)`);
      log(s, parts, delta);
    },
  },

  // set a stack to an exact count (the host fixing a mistake, a rebuy, a buy-in)
  setChips: {
    host: true,
    run(s, { target, amount }, actor) {
      if (!isInt(amount) || amount < 0) return "Enter a whole number.";
      const x = stack(s, target);
      if (!x) return "That stack is gone.";
      const d = amount - x.chips;
      if (!d) return;
      x.chips = amount;
      log(s, [pref(s, actor), " set ", sref(s, target), " to ", amt(amount), ` (${d > 0 ? "+" : "−"}${Math.abs(d)})`], { [key(target)]: d });
    },
  },

  addPot: {
    host: true,
    run(s, { name }, actor) {
      name = cleanName(name) || defaultPotName(s);
      const id = nextId(s);
      s.pots.push({ id, name, chips: 0 });
      log(s, [pref(s, actor), " added ", { r: "pot", id, n: name }]);
    },
  },

  renamePot: {
    host: true,
    run(s, { id, name }) {
      const p = pot(s, id);
      if (!p) return "That pot is gone.";
      name = cleanName(name);
      if (!name) return "Give it a name.";
      p.name = name;
    },
  },

  removePot: {
    host: true,
    run(s, { id }, actor) {
      const p = pot(s, id);
      if (!p) return "That pot is gone.";
      if (p.chips) return "Award or move its chips first.";
      s.pots = s.pots.filter((x) => x !== p);
      log(s, [pref(s, actor), " removed ", p.name]);
    },
  },

  removePlayer: {
    host: true,
    run(s, { id }) {
      const p = player(s, id);
      if (!p) return "They already left.";
      if (id === s.hostId) return "The host can't leave their own table.";
      s.players = s.players.filter((x) => x !== p);
      log(s, [pref(s, id), " left the table", p.chips ? " with " : "", ...(p.chips ? [amt(p.chips)] : [])]);
      // their name stays readable in old log lines through the snapshot in each part
    },
  },

  // anyone may change their own name and color
  editMe: {
    run(s, { name, color }, actor) {
      const p = player(s, actor);
      name = cleanName(name);
      if (!name) return "Pick a name.";
      if (!COLORS.includes(color)) return "Pick a color.";
      if (color !== p.color && s.players.some((x) => x.color === color)) return "Someone has that color.";
      p.name = name; p.color = color;
    },
  },

  setStart: {
    host: true,
    run(s, { amount }) {
      if (!isInt(amount) || amount < 0) return "Enter a whole number.";
      s.start = amount;
    },
  },

  // reverse a logged chip movement, if every stack it touched is still there and can afford it
  undo: {
    host: true,
    run(s, { entry }, actor) {
      const e = s.log.find((x) => x.id === entry);
      if (!e || !e.delta) return "That can't be undone.";
      if (e.undone) return "Already undone.";
      const moves = Object.entries(e.delta).map(([k, d]) => [unkey(k), d]);
      for (const [ref, d] of moves) {
        const x = stack(s, ref);
        if (!x) return "A stack it touched is gone.";
        if (x.chips - d < 0) return `${x.name} doesn't have the chips to give back.`;
      }
      for (const [ref, d] of moves) stack(s, ref).chips -= d;
      e.undone = true;
      log(s, [pref(s, actor), " undid: ", ...e.parts]);
    },
  },
};

export function defaultPotName(s) {
  if (!s.pots.length) return "Pot";
  for (let i = 1; ; i++) {
    const n = i === 1 ? "Side pot" : `Side pot ${i}`;
    if (!s.pots.some((p) => p.name === n)) return n;
  }
}

// the latest log entry the host could still undo
export const lastUndoable = (s) => [...s.log].reverse().find((e) => e.delta && !e.undone);

// presence isn't an action anyone asks for, so it skips the log
export function setOnline(state, id, online) {
  const p = player(state, id);
  if (!p || p.online === online) return state;
  const s = structuredClone(state);
  player(s, id).online = online;
  return s;
}

export const randomId = () => "p" + Math.random().toString(36).slice(2, 10);
