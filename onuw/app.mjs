// The page: connection handling (host or guest), rendering every screen, and input.
// The host runs engine.mjs and sends each player their own view; guests only render views.
import { openModal } from "../shared/cohesion.js";
import { ROLES, ROLE_ORDER, TEAMS, winRules, NIGHT_STEPS, emblemSvg, deckSize } from "./roles.mjs";
import * as E from "./engine.mjs";
import { makeNet } from "./net.mjs";
import { NAMES as N, TITLE } from "./skin.mjs";
import * as SKIN from "./skin.mjs";
import { artSvg } from "./art.mjs";
import * as WACK from "./wack.mjs";
const { openWack, closeWack, isOpen: wackOpen } = WACK;
document.title = TITLE;

// ---------------------------------------------------------------- setup

const params = new URLSearchParams(location.search);
const LOCAL = params.get("net") === "local";
const NET = makeNet(LOCAL ? "local" : "peer");
const HEARTBEAT = 2000;
const DEAD_AFTER = 8000;
// ?fast: short night steps, for tests and trying it out alone
const ROOM_OPTS = params.has("fast") ? { timing: { stepMin: 700, stepJitter: 300 } } : {};

const safe = (store) => ({
  get(k) { try { return store.getItem(k); } catch { return null; } },
  set(k, v) { try { store.setItem(k, v); } catch {} },
  del(k) { try { store.removeItem(k); } catch {} },
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ls = safe(window.localStorage);
const ss = safe(window.sessionStorage);

// Who this tab is. Normally every tab on a device is the same player, so reopening the link
// brings you back as yourself. With the "Each tab is a different player" setting on (for testing
// alone on one device), each open tab claims a numbered slot, a Web Lock held while the tab lives:
// slot 0 keeps the plain namespace, and every extra tab gets its own id and name. ?ns= sets the
// namespace outright.
const SETTINGS_KEY = "onuw:settings";
const settings = () => { try { return JSON.parse(ls.get(SETTINGS_KEY)) || {}; } catch { return {}; } };
const saveSettings = (x) => ls.set(SETTINGS_KEY, JSON.stringify({ ...settings(), ...x }));
let NS = "onuw:";
async function claimSlot() {
  if (params.get("ns")) { NS = `onuw:${params.get("ns")}:`; return; }
  if (!navigator.locks) return;
  const held = new Set();
  const grab = (n) => new Promise((res) => {
    navigator.locks.request(`onuw-slot-${n}`, { ifAvailable: true }, (lock) => {
      if (lock) held.add(n);
      res(!!lock);
      return lock ? new Promise(() => {}) : undefined; // hold it until the tab goes away
    }).catch(() => res(false));
  });
  // With the setting off, every tab is the plain namespace. One of them still holds slot 0, so a tab
  // that turns the setting on later can't take slot 0 and end up the same player as the host tab.
  if (!settings().tabsArePlayers) { await grab(0); ss.set("onuw:slot", "0"); return; }
  const want = ss.get("onuw:slot");
  let slot = +want || 0;
  // after a refresh the old page may still hold this tab's slot for a moment, so wait for it
  const tries = want == null || want === "" ? 1 : 8;
  for (let i = 0; i < tries && !(await grab(slot)); i++) if (i < tries - 1) await sleep(150);
  if (!held.has(slot)) for (slot = 0; slot < 50 && !(await grab(slot)); slot++);
  ss.set("onuw:slot", String(slot));
  if (slot) NS = `onuw:tab${slot}:`;
}
await claimSlot();

let myId = ls.get(NS + "id");
if (!myId) { myId = Math.random().toString(36).slice(2, 12); ls.set(NS + "id", myId); }
let myName = ls.get(NS + "name") || "";

const app = document.getElementById("app");
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------------------------------------------------------------- icons (Lucide)

const ICONS = {
  users: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
  info: `<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>`,
  help: `<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>`,
  book: `<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>`,
  shield: `<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4"/><path d="M12 16h.01"/>`,
  link: `<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>`,
  check: `<path d="M20 6 9 17l-5-5"/>`,
  crown: `<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>`,
  lock: `<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>`,
  skull: `<path d="m12.5 17-.5-1-.5 1h1z"/><path d="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="12" r="1"/>`,
  logout: `<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>`,
  minus: `<path d="M5 12h14"/>`,
  plus: `<path d="M5 12h14"/><path d="M12 5v14"/>`,
  arrow: `<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>`,
  pencil: `<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>`,
  wifiOff: `<path d="M12 20h.01"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/><path d="M5 12.859a10 10 0 0 1 5.17-2.69"/><path d="M19 12.859a10 10 0 0 0-2.007-1.523"/><path d="M2 8.82a15 15 0 0 1 4.177-2.643"/><path d="M22 8.82a15 15 0 0 0-11.288-3.764"/><path d="m2 2 20 20"/>`,
  share: `<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/>`,
  swap: `<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>`,
  eyeOff: `<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>`,
  hammer: `<path d="m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9"/><path d="m18 15 4-4"/><path d="m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5"/>`,
  copy: `<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>`,
  hand: `<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v2"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>`,
  flipCard: `<path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/>`,
  eye: `<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>`,
  userX: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m17 8 5 5"/><path d="m22 8-5 5"/>`,
  sun: `<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>`,
  vote: `<path d="m9 12 2 2 4-4"/><path d="M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7Z"/><path d="M22 19H2"/>`,
};
// "Click" with a mouse, "Tap" on a touch screen, decided when the text is drawn.
const mouse = () => matchMedia("(hover: hover) and (pointer: fine)").matches;
const Tap = () => (mouse() ? "Click" : "Tap");
const tap = () => Tap().toLowerCase();
const icon = (n, cls = "ms-ico") => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;

// ---------------------------------------------------------------- connection state

let mode = null;          // "host" | "guest" | null
let S = null;             // engine state (host only)
let hostNet = null;
const conns = new Map();  // host: connection id -> { pid, seen }
let guestNet = null;
let lastHostMsg = 0;
let lostSince = null;
let everJoined = false;
let leaving = false;
let migratingTo = null;   // guest: the player taking over as host
let view = null;
let clockOffset = 0;      // host clock minus ours
let screen = "home";      // home | connecting | room | kicked | notfound | sameplayer
let roomCode = (params.get("room") || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4) || null;
let lastHostId = null;

const now = () => Date.now();
const hostNow = () => now() + clockOffset;
const hostKey = (code) => `${NS}host:${code}`;

function setRoomInUrl(code) {
  const u = new URL(location.href);
  if (code) u.searchParams.set("room", code); else u.searchParams.delete("room");
  history.replaceState(null, "", u);
}

function inviteLink() {
  const u = new URL(location.href);
  u.search = "";
  u.searchParams.set("room", roomCode);
  if (LOCAL) u.searchParams.set("net", "local");
  if (params.has("fast")) u.searchParams.set("fast", "");
  return u.toString();
}

// ---------------------------------------------------------------- hosting

async function becomeHost(code, state, { tries = 1 } = {}) {
  mode = "host";
  S = state;
  roomCode = code;
  for (let i = 0; ; i++) {
    try {
      hostNet = await NET.host(code, { onConnect: hostOnConnect, onMessage: hostOnMessage, onClose: hostOnClose });
      break;
    } catch (e) {
      if (i + 1 >= tries) { mode = null; S = null; throw e; }
      await sleep(1000);
    }
  }
  setRoomInUrl(code);
  screen = "room";
  everJoined = true;
  publish();
}

function hostOnConnect(id) { conns.set(id, { pid: null, seen: now() }); }

function hostOnMessage(id, msg) {
  const c = conns.get(id);
  if (!c || !msg || typeof msg !== "object") return;
  c.seen = now();
  if (msg.t === "pong") return;
  if (msg.t === "hello") {
    const pid = String(msg.id || "").slice(0, 40);
    if (!pid) { hostNet.drop(id); return; }
    // another tab of this browser, which is the same player as this host tab
    if (pid === myId) { hostNet.send(id, { t: "same-player" }); setTimeout(() => hostNet?.drop(id), 300); return; }
    // a refreshed tab replaces its old connection
    for (const [oid, oc] of conns) if (oid !== id && oc.pid === pid) { conns.delete(oid); hostNet.drop(oid); }
    c.pid = pid;
    const r = E.handle(S, pid, { t: "hello", name: msg.name, spectator: !!msg.spectator }, now());
    if (r.kicked) { hostNet.send(id, { t: "kicked" }); conns.delete(id); setTimeout(() => hostNet.drop(id), 300); return; }
    publish();
    return;
  }
  if (!c.pid) return;
  if (msg.t === "hostKick" || msg.t === "hostReset" || msg.t.startsWith("host")) {
    // only the host's own UI sends these; a guest never gets to
    hostNet.send(id, { t: "error", text: "Only the host can do that" });
    return;
  }
  const r = E.handle(S, c.pid, msg, now());
  if (r.error) hostNet.send(id, { t: "error", text: r.error });
  publish();
}

function hostOnClose(id) {
  const c = conns.get(id);
  conns.delete(id);
  if (c?.pid && ![...conns.values()].some((o) => o.pid === c.pid)) {
    E.handle(S, c.pid, { t: "disconnect" }, now());
    publish();
  }
}

function publish() {
  if (mode !== "host") return;
  const t = now();
  for (const [id, c] of conns) if (c.pid) hostNet.send(id, { t: "view", view: E.viewFor(S, c.pid, t) });
  ss.set(hostKey(S.code), JSON.stringify(S));
  receiveView(E.viewFor(S, myId, t));
}

function kickConnections(pid) {
  for (const [id, c] of conns) if (c.pid === pid) {
    hostNet.send(id, { t: "kicked" });
    conns.delete(id);
    setTimeout(() => hostNet.drop(id), 300);
  }
}

setInterval(() => {
  if (mode !== "host" || !S) return;
  const t = now();
  if (E.tick(S, t)) publish();
}, 250);

setInterval(() => {
  if (mode === "host" && hostNet) {
    const t = now();
    for (const [id, c] of conns) {
      if (t - c.seen > DEAD_AFTER) { hostNet.drop(id); hostOnClose(id); continue; }
      hostNet.send(id, { t: "ping" });
    }
  }
  if (mode === "guest" && guestNet && screen === "room" && now() - lastHostMsg > DEAD_AFTER) {
    guestNet.close();
    guestNet = null;
    hostLost();
  }
}, HEARTBEAT);

// Hand the room to a random connected player, then go. Used for Leave and for closing the tab.
function handOffHost() {
  if (mode !== "host" || !S) return;
  const live = new Set([...conns.values()].map((c) => c.pid));
  const heirs = S.players.filter((p) => p.id !== myId && p.connected && live.has(p.id));
  if (heirs.length) {
    const heir = heirs[Math.floor(Math.random() * heirs.length)];
    E.transferHost(S, heir.id, now());
    for (const [id, c] of conns) {
      if (c.pid === heir.id) hostNet.send(id, { t: "state", state: S });
      hostNet.send(id, { t: "migrate", hostId: heir.id });
    }
  }
  ss.del(hostKey(S.code));
  const net = hostNet;
  hostNet = null;
  setTimeout(() => net?.close(), 400);
}

// ---------------------------------------------------------------- joining

// Whether this tab joined a room as a spectator. Remembered per room so a refresh rejoins the same way.
const joinedKey = (code) => `${NS}joined:${code}`;

function joinAsGuest(code, as) {
  if (as) ss.set(joinedKey(code), as);
  mode = "guest";
  roomCode = code;
  setRoomInUrl(code);
  if (!everJoined) screen = "connecting";
  render();
  const net = NET.guest(code, {
    onOpen() {
      lastHostMsg = now();
      net.send({ t: "hello", id: myId, name: myName, spectator: ss.get(joinedKey(code)) === "spectator" });
    },
    onMessage(m) {
      if (guestNet !== net) return;
      lastHostMsg = now();
      if (!m || typeof m !== "object") return;
      if (m.t === "ping") { net.send({ t: "pong" }); return; }
      if (m.t === "view") {
        lostSince = null; migratingTo = null; everJoined = true; screen = "room";
        receiveView(m.view);
        return;
      }
      if (m.t === "error") { toast(m.text); return; }
      if (m.t === "same-player") { screen = "sameplayer"; mode = null; guestNet = null; net.close(); render(); return; }
      if (m.t === "kicked") { screen = "kicked"; mode = null; guestNet = null; net.close(); render(); return; }
      if (m.t === "migrate") { migratingTo = m.hostId; return; }
      if (m.t === "state" && m.state?.hostId === myId) {
        guestNet = null;
        net.close();
        becomeHost(code, m.state, { tries: 20 }).then(() => toast("You're the host now")).catch(() => joinAsGuest(code));
      }
    },
    onClose(reason) {
      if (guestNet !== net) return;
      guestNet = null;
      if (leaving || screen === "kicked") return;
      hostLost(reason);
    },
  });
  guestNet = net;
}

// The host stopped answering. Keep trying to reach the room; if it stays gone, a player takes over.
function hostLost(reason) {
  if (mode !== "guest") return;
  if (!everJoined) {
    lostSince ||= now();
    if (now() - lostSince > 6000) { screen = "notfound"; render(); return; }
    setTimeout(() => mode === "guest" && !guestNet && joinAsGuest(roomCode), 1200);
    return;
  }
  lostSince ||= now();
  render();
  const waited = now() - lostSince;
  // successor order: the remaining players in list order, each given a later turn to claim the room
  const heirs = (view?.players || []).filter((p) => p.id !== view.hostId && p.connected && !p.left);
  const rank = migratingTo ? (migratingTo === myId ? 0 : -1) : heirs.findIndex((p) => p.id === myId);
  const myTurn = rank >= 0 && waited > (migratingTo ? 6000 : 8000) + rank * 5000;
  if (myTurn) { takeOverRoom(); return; }
  setTimeout(() => mode === "guest" && !guestNet && joinAsGuest(roomCode), 1500);
}

// Nobody handed us the game, so start the room over from what we last saw: same players and cards.
async function takeOverRoom() {
  const s = E.createRoom(roomCode, { id: myId, name: myName || "Player 1" }, now(), ROOM_OPTS);
  const old = view;
  for (const p of old.players) {
    if (p.id === myId || p.id === old.hostId || p.left) continue;
    s.players.push({ id: p.id, name: p.name, connected: false, droppedAt: now(), joinedAt: now() });
  }
  s.roles = { ...old.roles };
  s.rolesCustom = old.rolesCustom;
  s.dayMinutes = old.dayMinutes;
  s.round = old.round + 1;
  try {
    await becomeHost(roomCode, s);
    toast(old.phase === "lobby" ? "The host left. You're the host now." : "The host left mid-round, so the round was reset. You're the host now.");
  } catch {
    mode = "guest";
    setTimeout(() => joinAsGuest(roomCode), 500);
  }
}

function leaveRoom() {
  leaving = true;
  if (mode === "host") handOffHost();
  else if (guestNet) { guestNet.send({ t: "leave" }); const n = guestNet; guestNet = null; setTimeout(() => n.close(), 200); }
  mode = null; S = null; view = null; everJoined = false; lostSince = null;
  conns.clear();
  roomCode = null;
  setRoomInUrl(null);
  screen = "home";
  closePanel();
  render();
  setTimeout(() => (leaving = false), 500);
}

window.addEventListener("pagehide", () => {
  if (mode === "host") handOffHost();
});

// Everything the local player does goes through here.
function send(msg) {
  if (mode === "host") {
    const r = E.handle(S, myId, msg, now());
    if (r.error) toast(r.error);
    if (msg.t === "hostKick") kickConnections(msg.target);
    publish();
  } else if (guestNet) {
    guestNet.send(msg);
  }
}

async function createRoom() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  for (let i = 0; i < 5; i++) {
    const code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
    screen = "connecting"; roomCode = code; render();
    try {
      await becomeHost(code, E.createRoom(code, { id: myId, name: myName || "Player 1" }, now(), ROOM_OPTS));
      return;
    } catch (e) {
      if (e.message !== "taken") { screen = "home"; roomCode = null; render(); toast("Couldn't reach the matchmaking server. Check your connection and try again."); return; }
    }
  }
}

// ---------------------------------------------------------------- views & local UI state

let ui = freshUi();
// The room's creator names themselves in the lobby, right after the room is made.
let needName = false;
function freshUi() {
  return { key: null, sel: [], center: [], up: {}, peeked: false };
}

function receiveView(v) {
  const prev = view;
  view = v;
  clockOffset = v.now - now();
  if (lastHostId && v.hostId !== lastHostId && v.hostId !== myId) {
    const h = v.players.find((p) => p.id === v.hostId);
    if (h) toast(`${h.name} is the host now`);
  }
  lastHostId = v.hostId;
  const key = `${v.round}:${v.phase}:${v.game?.stepId ?? ""}:${v.game?.prompt?.stage ?? ""}`;
  if (key !== ui.key && v.phase === "night" && v.game?.prompt && !v.game.prompt.done) {
    try { navigator.vibrate?.([120, 80, 120]); } catch {}   // it's your turn: a buzz, since eyes are on your own screen
  }
  if (key !== ui.key) {
    const keepPeek = ui.peeked && prev?.round === v.round;
    const keepUp = prev?.round === v.round && prev?.phase === v.phase ? ui.up : {};   // a card you're looking at stays up between night turns
    ui = freshUi();
    ui.up = keepUp;
    ui.key = key;
    ui.peeked = keepPeek;
  }
  const me = v.players.find((p) => p.id === myId);
  if (me && me.name !== myName && !ui.renaming) { myName = me.name; ls.set(NS + "name", myName); }
  render();
  // Right after your turn, what you did and saw stays where you acted until you press OK (it's also
  // kept in the card-and-night panel for later). It's taken from your night notes, which only grow,
  // so it shows even if the night moved on before this view arrived.
  const cur = v.game?.prompt;
  // (a second part of the same turn waits; a different turn of yours shows after you press OK)
  // The last turn of the night may end it before this view arrives, so this also runs in the day.
  if (acted && v.game && !(v.phase === "night" && cur && !cur.done && cur.step === acted.promptStep) && v.game.info.length > acted.from) {
    if (!acted.skipped) { shownResult = { step: acted.step, entries: v.game.info.slice(acted.from) }; render(); }
    acted = null;
  }
  // a night result never carries into the day: the Revealer wakes last, so an open result would single them out
  if (v.phase !== "night" && (shownResult || acted)) { shownResult = null; acted = null; render(); }
  // the game closes the moment your turn comes, or when the night ends
  if (wackOpen() && (v.phase !== "night" || (cur && !cur.done))) closeWack();
}

// ---------------------------------------------------------------- toasts

const toastBox = document.getElementById("toasts");
function toast(text) {
  const el = document.createElement("div");
  el.className = "ms-toast";
  el.textContent = text;
  toastBox.appendChild(el);
  requestAnimationFrame(() => el.classList.add("in"));
  setTimeout(() => { el.classList.remove("in"); setTimeout(() => el.remove(), 300); }, 3500);
}

// ---------------------------------------------------------------- pieces

const team = (r) => ROLES[r].team;
const playerName = (id) => view?.players.find((p) => p.id === id)?.name ?? "?";

function avatar(name, id = name, cls = "") {
  const hues = [215, 265, 170, 25, 340, 80, 195, 45];
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `<span class="ms-avatar ${cls}" style="--h:${hues[h % hues.length]}">${esc((name.trim()[0] || "?").toUpperCase())}</span>`;
}

// A card face. size: "sm" (results, night info), "md" (picker), "lg" (your card)
// A card's own color (from skin.mjs ROLE_COLORS when set, else its team's color) and its team letter.
const roleColor = (role) => SKIN.ROLE_COLORS?.[role]?.card || TEAMS[ROLES[role].team].color;
// The name band and text strip use the role's band color (a lighter shade of the card) with white text,
// like a printed card. Without a band color, a brighter shade is computed from the card color.
function bandColor(role) {
  const set = SKIN.ROLE_COLORS?.[role]?.band;
  if (set) return set;
  const c = roleColor(role);
  if (!/^#[0-9a-f]{6}$/i.test(c)) return c;
  return "#" + [1, 3, 5].map((i) => Math.min(255, Math.round(parseInt(c.slice(i, i + 2), 16) * 1.22 + 6)).toString(16).padStart(2, "0")).join("");
}
const cardStyle = (role) => `--team:${roleColor(role)};--band:${bandColor(role)}`;
const teamMark = (role) => `<span class="ms-team-mark" aria-label="${esc(TEAMS[ROLES[role].team].name)}" title="${esc(TEAMS[ROLES[role].team].name)}">${esc(TEAMS[ROLES[role].team].letter)}</span>`;

function card(role, { size = "md", label = "", info = true, cls = "", attrs = "", times = 1 } = {}) {
  const R = ROLES[role];
  return `<div class="ms-card ms-${size} ${cls}" style="${cardStyle(role)}" ${attrs}>
    <div class="ms-card-name${R.name.length > 8 ? " is-long" : ""}${R.name.length > 10 && !(R.name.length > 18 && R.name.includes(" ")) ? " is-xlong" : ""}${R.name.length > 18 && R.name.includes(" ") ? " is-wrap" : ""}" style="--len:${R.name.length};--word:${Math.max(...R.name.split(" ").map((w) => w.length))}">${esc(R.name)}${times > 1 ? ` <span class="ms-mono ms-muted">×${times}</span>` : ""}</div>${teamMark(role)}
    <div class="ms-card-art">${size === "xs" ? emblemSvg(role) : artSvg(role)}</div>
    ${size === "md" || size === "lg" ? `<div class="ms-card-short">${esc(R.short)}</div>` : ""}
    ${info ? `<button class="ms-info" data-info="${role}" aria-label="What the ${esc(R.name)} does" data-tooltip="What the ${esc(R.name)} does">${icon("info")}</button>` : ""}
  </div>${label ? `<div class="ms-card-label">${esc(label)}</div>` : ""}`;
}

function cardBack({ size = "md", label = "", cls = "", attrs = "" } = {}) {
  return `<div class="ms-card ms-back ms-${size} ${cls}" ${attrs}><div class="ms-card-art">${size === "xs" ? emblemSvg("back") : artSvg("back")}</div></div>${label ? `<div class="ms-card-label">${esc(label)}</div>` : ""}`;
}

const wrap = (inner, cls = "") => `<div class="ms-cardwrap ${cls}">${inner}</div>`;

function topBar() {
  const v = view;
  const n = v.players.length;
  return `<header class="ms-top">
    <div class="ms-brand">${moonMark()}<span>${esc(TITLE)}</span></div>
    <div class="ms-top-actions">
      ${myNightShown() ? `<button class="ms-icon-btn" data-act="mynight" aria-label="Your card and your night" data-tooltip="Your night: the card you started with and what you did">${icon("help")}</button>` : ""}
      <button class="ms-icon-btn" data-act="cheatsheet" aria-label="Cards in this game" data-tooltip="Cards in this game: what each one does, and how each team wins">${icon("book")}</button>
      <button class="ms-icon-btn" data-act="players" aria-label="Players" data-tooltip="Players: see who's here and change your name">${icon("users")}<span class="ms-count">${n}</span></button>
      ${v.isHost ? `<button class="ms-host-btn" data-act="host" aria-label="Host controls" data-tooltip="Host controls: skip ahead, end the vote, kick a player, start over">${icon("shield")}<span>Host</span></button>` : ""}
    </div>
  </header>${lostSince ? `<div class="ms-banner">${icon("wifiOff")} Lost the host. Reconnecting…</div>` : ""}`;
}

function moonMark() {
  return `<svg class="ms-moonmark" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="11" fill="var(--moon)"/><circle cx="12" cy="13" r="2.2" fill="var(--moon-shade)"/><circle cx="19" cy="20" r="3" fill="var(--moon-shade)"/><circle cx="20" cy="11" r="1.4" fill="var(--moon-shade)"/></svg>`;
}

function bar(inner) {
  return `<div class="ms-bar"><div class="ms-bar-inner">${inner}</div></div>`;
}

function countdown(endsAt, cls = "") {
  return `<span class="ms-countdown ${cls}" data-ends="${endsAt}">${fmtLeft(endsAt)}</span>`;
}
function fmtLeft(endsAt) {
  const s = Math.max(0, Math.ceil((endsAt - hostNow()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
setInterval(() => {
  for (const el of document.querySelectorAll("[data-ends]")) el.textContent = fmtLeft(+el.dataset.ends);
}, 250);

// ---------------------------------------------------------------- screens

function render() {
  let html;
  if (screen === "home") html = homeScreen();
  else if (screen === "connecting") html = messageScreen("Connecting…", `Looking for room <b class="ms-mono">${esc(roomCode || "")}</b>.`, true);
  else if (screen === "notfound") html = messageScreen("Room not found", `Nobody is hosting room <b class="ms-mono">${esc(roomCode || "")}</b> right now. Check the code, or start your own room.`, false, true, true);
  else if (screen === "sameplayer") html = messageScreen("You're already in this room", `Another tab in this browser is hosting room <b class="ms-mono">${esc(roomCode || "")}</b> as you. To join as another player from this tab, turn on <b>Each tab is a different player</b> in Settings.`, false, true, false,
    `<button class="ms-btn ms-primary" data-act="settings">Settings</button>`);
  else if (screen === "kicked") html = messageScreen("You were removed", "The host removed you from the room.", false, true);
  else if (!view) html = messageScreen("Connecting…", "", true);
  else html = roomScreen();
  if (html !== app._html) {
    const focused = document.activeElement?.id;
    const sel = focused && document.activeElement.selectionStart;
    const oldMoon = app.querySelector(".ms-arc-moon")?.style.transform;
    app.innerHTML = html;
    app._html = html;
    restoreTurn();
    // the page is rebuilt from scratch, so start the moon where it was and let it glide to its new spot
    const moon = app.querySelector(".ms-arc-moon");
    if (moon && oldMoon && oldMoon !== moon.style.transform) {
      const target = moon.style.transform;
      moon.style.transition = "none";
      moon.style.transform = oldMoon;
      moon.getBoundingClientRect();
      moon.style.transition = "";
      requestAnimationFrame(() => (moon.style.transform = target));
    }
    if (focused) { const el = document.getElementById(focused); if (el) { el.focus(); try { el.setSelectionRange(sel, sel); } catch {} } }
  }
  document.body.dataset.phase = view && screen === "room" ? view.phase : screen;
  refreshPanel();
}

function messageScreen(title, body, spinner = false, back = false, retry = false, first = "") {
  return `<main class="ms-center">
    <div class="ms-hero-moon">${bigMoon()}</div>
    <h1 class="ms-h1">${title}</h1>
    <p class="ms-lede">${body}</p>
    ${spinner ? `<div class="ms-dots"><span></span><span></span><span></span></div>` : ""}
    ${retry || back ? `<div class="ms-msg-actions">${first}${retry ? `<button class="ms-btn ms-primary" data-act="retry">Try again</button>` : ""}${back ? `<button class="ms-btn ${retry || first ? "" : "ms-primary"}" data-act="home">Main Menu</button>` : ""}</div>` : ""}
    <mike-footer></mike-footer>
  </main>`;
}

function bigMoon() {
  return `<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="44" fill="var(--moon)"/>
    <circle cx="44" cy="48" r="8" fill="var(--moon-shade)"/><circle cx="72" cy="74" r="11" fill="var(--moon-shade)"/>
    <circle cx="76" cy="40" r="5" fill="var(--moon-shade)"/><circle cx="46" cy="80" r="4" fill="var(--moon-shade)"/></svg>`;
}

function homeScreen() {
  const joining = !!roomCode;
  return `<main class="ms-center ms-home">
    <div class="ms-hero-moon">${bigMoon()}</div>
    <h1 class="ms-title">${esc(TITLE)}</h1>
    <p class="ms-lede">A one-night werewolf game for 3 to 10 people in the same room, each on their own phone. Cards move in the dark, so you might not be who you think you are by morning.</p>
    <form class="ms-form" data-form="${joining ? "join" : "create"}">
      ${joining ? `<label class="ms-label" for="name-input">Your name</label>
      <input id="name-input" class="ms-input" maxlength="20" autocomplete="nickname" placeholder="Enter your name" value="${esc(myName)}" />` : ""}
      ${joining
        ? `<button class="ms-btn ms-primary ms-wide" type="submit" data-as="player" ${myName ? "" : "disabled"}>Join Room <span class="ms-mono">${esc(roomCode)}</span></button>
           <button class="ms-btn ms-wide" type="submit" data-as="spectator" ${myName ? "" : "disabled"}>${icon("eye")}<span>Spectate</span></button>
           <p class="ms-hint">Spectators see every card and everything that happens at night. If a game is already going, you'll watch until the next round.</p>
           <button class="ms-link" type="button" data-act="home">Main Menu</button>`
        : `<button class="ms-btn ms-primary ms-wide" type="submit">Create Room</button>
           <div class="ms-or"><span>or</span></div>
           <div class="ms-join-row">
             <input id="code-input" class="ms-input ms-code-input" maxlength="4" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="CODE" aria-label="Room code" />
             <button class="ms-btn" type="button" data-act="join-code">Join</button>
           </div>`}
    </form>
    <button class="ms-link ms-settings-link" type="button" data-act="settings">Settings</button>
    <mike-footer></mike-footer>
  </main>`;
}

function roomScreen() {
  const v = view;
  let body = "";
  if (v.phase === "lobby") body = lobby();
  else if (v.spectator && v.phase !== "results") body = spectatorScreen();
  else if (v.phase === "deal") body = dealScreen();
  else if (v.phase === "night") body = nightScreen();
  else if (v.phase === "day") body = dayScreen();
  else if (v.phase === "vote") body = voteScreen();
  else if (v.phase === "results") body = resultsScreen();
  return topBar() + body;
}

// ---- lobby

// One word per room-code letter, so the code is easy to say out loud.
const CODE_WORDS = { A: "Amber", B: "Bramble", C: "Candle", D: "Dusk", E: "Ember", F: "Fog", G: "Glade", H: "Hollow", J: "Juniper", K: "Kettle",
  L: "Lantern", M: "Meadow", N: "Nettle", P: "Pine", Q: "Quill", R: "Raven", S: "Shadow", T: "Thicket", U: "Umber", V: "Velvet", W: "Willow", X: "Xylem", Y: "Yarrow", Z: "Zephyr" };
const codeWords = (code) => [...(code || "")].map((c) => CODE_WORDS[c] || c).join(" · ");

function lobby() {
  const v = view;
  const playing = v.players.filter((p) => !p.spectator);
  const watching = v.players.filter((p) => p.spectator);
  const host = v.isHost;
  const have = deckSize(v.roles);
  const need = Math.max(3, v.players.length) + 3;   // the deck is sized for at least 3 players
  const okCount = have === need;
  const problem = v.startProblem;
  const namePrompt = needName ? `<form class="ms-panel ms-name-first" data-form="firstname">
      <label class="ms-h2" for="name-input">Enter your name</label>
      <div class="ms-rename-row">
        <input id="name-input" class="ms-input" maxlength="20" autocomplete="nickname" placeholder="Enter your name" />
        <button class="ms-btn ms-primary" type="submit" disabled>Done</button>
      </div>
    </form>` : "";
  return `<main class="ms-page">
    ${namePrompt}
    <section class="ms-room">
      <div>
        <div class="ms-label">Room code</div>
        <div class="ms-code">${esc(v.code)}</div>
        <div class="ms-code-words">${esc(codeWords(v.code))}</div>
      </div>
      <div class="ms-invite-btns">
        <button class="ms-btn" data-act="invite">${icon("link")}<span>Copy Invite Link</span></button>
        ${navigator.share ? `<button class="ms-btn" data-act="share">${icon("share")}<span>Share</span></button>` : ""}
      </div>
    </section>

    <section>
      <h2 class="ms-h2">Players <span class="ms-sub">${playing.length}</span></h2>
      <ul class="ms-players">${playing.map((p) => p.id === myId ? myLobbyRow(p) : playerRow(p)).join("")}</ul>
      ${watching.length ? `<h3 class="ms-watch-h">${icon("eye", "ms-ico-sm")} Watching</h3>
      <ul class="ms-players">${watching.map((p) => p.id === myId ? myLobbyRow(p) : playerRow(p)).join("")}</ul>` : ""}
      <button class="ms-link ms-spec-toggle" data-act="${v.spectator ? "spec-off" : "spec-on"}">${v.spectator ? "Play Instead" : "Spectate Instead"}</button>
      ${v.spectator ? `<p class="ms-hint">You're watching. You'll see every card and everything that happens at night, so keep your screen away from the players.</p>` : ""}
      ${playing.length < 3 ? `<p class="ms-hint">Share the room code or invite link. At least 3 players are needed.</p>` : ""}
    </section>

    <section>
      <div class="ms-h2row">
        <h2 class="ms-h2">Cards <span class="ms-sub ${v.players.length < 3 ? "" : okCount ? "ms-ok" : "ms-warn"}">${have} of ${need}</span></h2>
        ${host && v.rolesCustom ? `<button class="ms-link" data-act="suggest">Use Suggested Cards</button>` : ""}
      </div>
      <p class="ms-hint">One card for each player plus 3 in the center.${v.roles.packleader ? ` The ${N.packleader} also adds a spare ${N.werewolf} card, placed next to it with a lock, on top of these.` : ""} Cards are listed in wake-up order.${host ? ` ${Tap()} a card to add or remove it.` : ""}</p>
      ${deckGrid(v.roles, { all: true, host })}
    </section>

    <section class="ms-day-len">
      <h2 class="ms-h2">Day Length</h2>
      ${host
        ? `<div class="ms-chips" role="radiogroup" aria-label="Day length">${[3, 5, 7, 10].map((m) => `<button class="ms-chip ${v.dayMinutes === m ? "is-on" : ""}" role="radio" aria-checked="${v.dayMinutes === m}" data-day="${m}">${m} min</button>`).join("")}</div>`
        : `<p class="ms-hint">${v.dayMinutes} minutes to talk before the vote.</p>`}
    </section>
    <mike-footer></mike-footer>
  </main>
  ${bar(host
    ? `${problem && v.players.length >= 3 ? `<div class="ms-bar-note">${esc(problem)}</div>` : ""}<button class="ms-btn ms-primary ms-wide" data-act="start" ${problem ? "disabled" : ""}>${v.players.length < 3 ? "Need 3 Players" : "Start Game"}</button>`
    : `<div class="ms-bar-wait">Waiting for ${esc(playerName(v.hostId))} to start</div>`)}`;
}

// The one way a list of the game's cards is shown: the lobby's grid, in wake-up order, with the
// count pill and info buttons. The lobby shows every card (unpicked ones dimmed, and the host can
// change them); everywhere else shows the cards in this game.
function deckGrid(roles, { all = false, host = false } = {}) {
  const spare = roles.packleader ? spareCard(`Added for the ${N.packleader}`, { size: "md", locked: true }) : "";
  const list = all ? ROLE_ORDER : ROLE_ORDER.filter((r) => roles[r]);
  return `<div class="ms-grid">${list.map((r) => pickerCard(r, roles[r] || 0, host) + (r === "packleader" ? spare : "")).join("")}</div>`;
}

function pickerCard(r, count, host) {
  const R = ROLES[r];
  const on = count > 0;
  // Every card that can have more than one copy shows the same count pill. The host gets − and +
  // (disabled where they can't be used: the Masons' fixed pair, the limits). Guests see the same
  // full list with live counts, but only the number, since they can't change anything.
  const counted = on && (R.max > 1 || R.pair);
  const stepper = !counted ? ""
    : !host ? `<div class="ms-count is-view"><span>×${count}</span></div>`
    : `<div class="ms-count">
        <button data-step="${r}" data-d="-1" aria-label="One fewer ${esc(R.name)}" ${R.pair ? "disabled" : ""}>${icon("minus")}</button>
        <span>×${count}</span>
        <button data-step="${r}" data-d="1" aria-label="One more ${esc(R.name)}" ${R.pair || count >= R.max ? "disabled" : ""}>${icon("plus")}</button>
      </div>`;
  const label = "";
  return `<div class="ms-cardwrap ${on ? "is-on" : "is-off"}">
    ${card(r, {
      cls: `${on ? "" : "ms-off"} ${host ? "ms-pickable" : ""}`,
      attrs: host ? `data-toggle="${r}" role="button" tabindex="0" aria-pressed="${on}" aria-label="${on ? "Remove" : "Add"} the ${esc(R.name)}"` : "",
    }).replace("</div>", `</div>${stepper}`)}
    ${label ? `<div class="ms-card-label">${label}</div>` : ""}
  </div>`;
}

// Your own row in the lobby: a pencil to rename, which turns the row into a name field.
// Names are fixed once the game starts.
// `where` ("lobby" or "panel") keeps the two lists from both opening the same field.
function myLobbyRow(p, where = "lobby", extra = "") {
  if (ui.renaming !== where) return playerRow(p, { extra: `<button class="ms-icon-btn ms-edit-name" data-act="edit-name" data-where="${where}" aria-label="Change your name" data-tooltip="Change your name">${icon("pencil")}</button>${extra}` });
  return `<li class="ms-player ms-player-edit">${avatar(p.name, p.id)}<form class="ms-rename-inline" data-form="rename">
    <input id="rename-input" class="ms-input" maxlength="20" value="${esc(myName)}" autocomplete="nickname" aria-label="Your name" />
    <button class="ms-btn ms-sm-btn ms-primary" type="submit">Save</button>
    <button class="ms-btn ms-sm-btn" type="button" data-act="edit-name-cancel">Cancel</button>
  </form></li>`;
}

function playerRow(p, { extra = "" } = {}) {
  const v = view;
  const tags = [
    p.id === myId ? `<span class="ms-tag">you</span>` : "",
    p.spectator ? `<span class="ms-tag">${icon("eye", "ms-ico-sm")}watching</span>` : "",
    p.id === v.hostId ? `<span class="ms-tag ms-tag-host">${icon("crown", "ms-ico-sm")}host</span>` : "",
    !p.connected ? `<span class="ms-tag ms-tag-off">${icon("wifiOff", "ms-ico-sm")}${p.left ? "left" : "offline"}</span>` : "",
  ].join("");
  return `<li class="ms-player ${p.connected ? "" : "is-offline"}">${avatar(p.name, p.id)}<span class="ms-pname" title="${esc(p.name)}">${esc(p.name)}</span>${tags}${extra}</li>`;
}

// ---- spectators (joined mid-round)

// Spectators see the whole table at all times: every card, the night so far and the votes.
function spectatorBanner() {
  return `<div class="ms-spec-banner" role="note">${icon("eye")}<div><b>You're a spectator.</b> You see every card and every night action. Keep your screen away from the players.</div></div>`;
}

function spectatorScreen() {
  const v = view;
  const g = v.game;
  const o = g.omni;
  const st = NIGHT_STEPS.find((x) => x.id === g.stepId);
  let head = "";
  if (v.phase === "deal") {
    const waiting = v.players.filter((p) => p.seated && p.connected && !p.ready);
    head = `<div class="ms-label">Dealing</div><h1 class="ms-h1">Players are looking at their cards</h1>
      <p class="ms-hint">${waiting.length ? `Waiting for ${esc(waitNames(waiting))}.` : "Night falls in a moment."}</p>`;
  } else if (v.phase === "night" && g.stepId === "dawn") {
    head = `${moonArc(g)}<div class="ms-label">Night · dawn</div><h1 class="ms-h1">Everyone is asleep</h1><p class="ms-hint">Day starts in a moment.</p>`;
  } else if (v.phase === "night") {
    head = `${moonArc(g)}<div class="ms-label">Night · turn ${g.stepIdx + 1} of ${g.steps.length}</div>
      <h1 class="ms-h1">The ${esc(st?.label ?? "night")} ${st?.id === "wolves" || st?.id === "masons" ? "are" : "is"} awake</h1>
      <p class="ms-hint">${o.actors.length ? `Acting now: ${esc(o.actors.map(playerName).join(", "))}.` : "Nobody holds this card, so the turn passes on its own."}</p>`;
  } else if (v.phase === "day") {
    head = `<div class="ms-label">${icon("sun", "ms-ico-sm")} Day</div>${countdown(g.dayEndsAt, "ms-bigtime")}
      <p class="ms-hint">The players are talking it over.</p>`;
  } else if (v.phase === "vote") {
    const left = v.players.filter((p) => p.seated && p.connected && !p.voted);
    head = `<div class="ms-label">Vote</div><h1 class="ms-h1">The players are voting</h1>
      <p class="ms-hint">${left.length ? `Still to vote: ${esc(waitNames(left))}.` : "Counting the votes."}</p>`;
  }
  const seatRow = (id) => {
    const p = v.players.find((x) => x.id === id);
    const started = o.dealt[id], now = o.cards[id];
    const vote = o.votes[id];
    const acting = v.phase === "night" && o.actors.includes(id);
    return `<li class="ms-spec-seat ${acting ? "is-acting" : ""}">
      <div class="ms-spec-who">${avatar(p?.name ?? "?", id)}<div><div class="ms-pname">${esc(p?.name ?? "?")}${p && !p.connected ? ` <span class="ms-tag ms-tag-off">${p.left ? "left" : "offline"}</span>` : ""}</div>
        <div class="ms-hint">${acting ? "Acting now" : vote ? `Voted for ${esc(playerName(vote))}` : v.phase === "day" && o.dayReady[id] ? "Ready" : ""}</div></div></div>
      <div class="ms-row ms-spec-cards">${wrap(card(started, { size: "sm", label: "Started" }))}${now !== started ? icon("swap", "ms-ico ms-swap-ico") + wrap(card(now, { size: "sm", label: "Now" })) : ""}</div>
    </li>`;
  };
  return `<main class="ms-page ms-spectator">
    ${spectatorBanner()}
    <section class="ms-center ms-spec-head">${head}</section>
    <section>
      <h2 class="ms-h2">Players' Cards</h2>
      <ul class="ms-spec-seats">${g.seats.map(seatRow).join("")}</ul>
    </section>
    <section>
      <h2 class="ms-h2">Center</h2>
      <div class="ms-row ms-spec-center">${o.center.map((r, i) => wrap(card(r, { size: "sm", label: `Center ${i + 1}` }))).join("")}
        ${g.hasSpare ? (o.spare === "werewolf" ? spareCard("Spare slot") : wrap(card(o.spare, { size: "sm", label: "Spare slot" }))) : ""}</div>
    </section>
    <section>
      <h2 class="ms-h2">Night Log</h2>
      ${nightLog(o.log, "Nothing has happened yet.")}
    </section>
    <mike-footer></mike-footer>
  </main>`;
}

// ---- deal: look at your card

function dealScreen() {
  const v = view;
  const g = v.game;
  const me = v.players.find((p) => p.id === myId);
  const waiting = v.players.filter((p) => p.seated && p.connected && !p.ready);
  return `<main class="ms-center ms-deal">
    <h1 class="ms-h1">Your card</h1>
    <p class="ms-lede">${Tap()} the card to see your role, and ${tap()} it again to turn it back over.</p>
    <div class="ms-flipscope ${ui.up.deal ? "is-up" : ""}" data-flip="deal">
      <div class="ms-flip ms-turner" data-flip-tap tabindex="0" role="button" aria-pressed="${!!ui.up.deal}" aria-label="Flip your card">
        <div class="ms-flip-face is-front">${card(g.myCard, { size: "lg" })}</div>
        <div class="ms-flip-face is-back">${cardBack({ size: "lg" })}<span class="ms-flip-hint">${Tap()} to flip</span></div>
      </div>
      <div class="ms-after-peek is-front-soft">
        <p class="ms-hint">You act as this card tonight, even if someone swaps it away from you. In the morning you're on the team of whatever card you hold.</p>
      </div>
    </div>
    <mike-footer></mike-footer>
  </main>
  ${bar(me?.ready
    ? `<div class="ms-bar-wait">Night falls when everyone is ready. Waiting for ${waiting.length ? esc(waitNames(waiting)) : "the night"}.</div>`
    : `<button class="ms-btn ms-primary ms-wide" data-act="ready" ${ui.peeked ? "" : "disabled"}>${ui.peeked ? "Ready" : "Check Your Card First"}</button>`)}`;
}

// Names for a "waiting for …" line, with the local player called "you"
const waitNames = (players) => listNames([...players].sort((a, b) => (b.id === myId) - (a.id === myId)).map((p) => (p.id === myId ? "you" : p.name)));

function listNames(names) {
  if (names.length <= 1) return names.join("");
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length > 4) return `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

// ---- night

// The moon's path across the night. Only spectators see it move along the turns. For players it
// hangs still at the top for the whole night, their own turn included, so nothing on any player's
// screen moves because of what someone else does at night (someone watching a neighbor's screen
// would see the moon jump when that neighbor's turn came).
function moonArc(g) {
  const n = g.steps?.length || 0;
  const W = 320, H = 130, cx = W / 2, cy = 140, r = 128;
  const at = (t) => {
    const a = Math.PI * (1 - t);
    return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
  };
  const t = n && g.stepIdx != null ? Math.min(1, (g.stepIdx + 0.5) / n) : 0.5;
  const [mx, my] = at(t);
  const ticks = n && g.stepIdx != null ? g.steps.map((_, i) => {
    const [x, y] = at((i + 0.5) / n);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" class="${i < g.stepIdx ? "past" : i === g.stepIdx ? "now" : "next"}"/>`;
  }).join("") : "";
  const [x0, y0] = at(0), [x1, y1] = at(1);
  return `<svg class="ms-arc" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <path d="M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}" class="ms-arc-path"/>
    ${ticks}
    <g class="ms-arc-moon" style="transform:translate(${mx.toFixed(1)}px,${my.toFixed(1)}px)">
      <circle r="15" fill="var(--moon)"/><circle cx="-5" cy="-3" r="3" fill="var(--moon-shade)"/><circle cx="5" cy="5" r="4" fill="var(--moon-shade)"/>
    </g>
  </svg>`;
}

function resultPanel() {
  if (!shownResult) return "";
  return `<div class="ms-panel ms-prompt ms-result">
      ${shownResult.entries.map((e) => `<p class="ms-prompt-text">${esc(e.text)}</p>${resultCards(e.cards)}`).join("")}
      <div class="ms-prompt-actions"><button class="ms-btn ms-primary" data-act="result-ok">OK</button></div>
    </div>`;
}

// What you just did at night, shown where you did it until you press OK. `acted` marks where your
// night notes stood when you started acting.
let shownResult = null, acted = null;
const noteActed = (skipped) => {
  const p = view.game.prompt;
  if (!acted) acted = { from: view.game.info.length, step: p.as || p.step, promptStep: p.step, skipped };
  else acted.skipped = skipped;
};

function nightScreen() {
  const v = view;
  const g = v.game;
  const st = NIGHT_STEPS.find((s) => s.id === g.stepId);
  const p = g.prompt;
  let panel;
  if (shownResult) panel = resultPanel();
  else if (p && !p.done) panel = promptPanel(p, g);
  else panel = `<p class="ms-lede">When there is an action for you to perform, it will appear here.</p>
    <p class="ms-hint">${Tap()} and scroll occasionally so nobody can tell when your turn comes.</p>
    <button class="ms-btn ms-wack-btn" data-act="wack">${icon("hammer")}<span>Play Whack-a-Wolf</span></button>`;
  return `<main class="ms-center ms-night ${p && !p.done ? "is-acting" : ""}">
    ${moonArc(g)}
    <div class="ms-label">Night</div>
    <h1 class="ms-h1">${shownResult ? `Your turn: the ${esc(shownResult.step === "wolves" ? "wolves" : NIGHT_STEPS.find((x) => x.id === shownResult.step)?.label ?? "")}` : p && !p.done ? `Your turn: the ${esc(st.id === "wolves" ? "wolves" : st.label)}` : "Everyone is asleep"}</h1>
    ${panel}
    <mike-footer></mike-footer>
  </main>`;
}

function resultCards(cards) {
  if (!cards?.length) return "";
  const swap = cards.some((c) => c.swap);
  return `<div class="ms-row ms-result-cards">${cards.map((c) => wrap(c.back ? cardBack({ size: "sm", label: c.label }) : card(c.role, { size: "sm", label: c.label }))).join(swap ? icon("swap", "ms-ico ms-swap-ico") : "")}</div>`;
}

function promptPanel(p, g) {
  const v = view;
  const others = g.seats.filter((id) => !(p.exclude || []).includes(id));
  const sel = ui.sel;
  const csel = ui.center;
  const playerBtn = (id) => {
    const pl = v.players.find((x) => x.id === id);
    return `<button class="ms-target ${sel.includes(id) ? "is-on" : ""}" data-target="${id}">${avatar(pl.name, pl.id)}<span>${esc(pl.name)}${id === myId ? " (you)" : ""}</span></button>`;
  };
  const centerBtn = (i) => `<button class="ms-center-card ${csel.includes(i) ? "is-on" : ""}" data-center="${i}" aria-label="Center card ${i + 1}">${cardBack({ size: "sm" })}<span class="ms-card-label">Center ${i + 1}</span></button>`;
  const centers = `<div class="ms-row ms-centers">${[0, 1, 2].map(centerBtn).join("")}</div>`;
  let body = "", ready = false, confirm = "Confirm";
  switch (p.kind) {
    case "ack":
      body = resultCards(p.cards);
      ready = true; confirm = "OK";
      break;
    case "center1":
      body = centers;
      ready = csel.length === 1;
      confirm = (p.as || p.step) === "sleepwalker" ? (ready ? `Swap with center ${csel[0] + 1}` : "Pick a center card") : (ready ? `Look at center ${csel[0] + 1}` : "Pick a center card");
      break;
    case "player":
      if (p.spare) {
        body = `<div class="ms-spare-row">
          ${wrap(`<div class="ms-card ms-sm" style="${cardStyle("werewolf")}"><div class="ms-card-name">${N.werewolf}</div>${teamMark("werewolf")}<div class="ms-card-art">${artSvg("werewolf")}</div></div>`, "")}
          <div class="ms-spare-text"><b>The spare ${N.werewolf} card</b><br>Separate from the 3 center cards.</div>
        </div>
        <div class="ms-label">Give it to</div>
        <div class="ms-targets">${others.map(playerBtn).join("")}</div>`;
        ready = sel.length === 1;
        confirm = ready ? `Give it to ${playerName(sel[0])}` : "Pick a player";
      } else if (p.witch != null) {
        body = `${resultCards(p.cards)}<div class="ms-label">Swap it with</div><div class="ms-targets">${others.map(playerBtn).join("")}</div>`;
        ready = sel.length === 1;
        confirm = !ready ? "Pick a player" : sel[0] === myId ? "Swap it with your card" : `Swap it with ${playerName(sel[0])}'s card`;
      } else {
        body = `${resultCards(p.cards)}<div class="ms-targets">${others.map(playerBtn).join("")}</div>`;
        ready = sel.length === 1;
        confirm = !ready ? "Pick a player" : (p.as || p.step) === "thief" ? `Swap with ${playerName(sel[0])}` : (p.as || p.step) === "unveiler" ? `Turn over ${playerName(sel[0])}'s card` : `Look at ${playerName(sel[0])}'s card`;
      }
      break;
    case "seer":
      body = `<div class="ms-label">A player's card</div>
        <div class="ms-targets">${others.map(playerBtn).join("")}</div>
        <div class="ms-label">Or two center cards</div>${centers}`;
      ready = sel.length === 1 || csel.length === 2;
      confirm = sel.length === 1 ? `Look at ${playerName(sel[0])}'s card` : csel.length === 2 ? `Look at center ${csel[0] + 1} and ${csel[1] + 1}` : "Pick a player or two center cards";
      break;
    case "two":
      body = `<div class="ms-targets">${others.map(playerBtn).join("")}</div>`;
      ready = sel.length === 2;
      confirm = ready ? `Swap ${playerName(sel[0])} and ${playerName(sel[1])}` : `Pick ${2 - sel.length} more player${sel.length === 1 ? "" : "s"}`;
      break;
  }
  return `<div class="ms-panel ms-prompt">
    <p class="ms-prompt-text">${esc(p.text)}</p>
    ${body}
    <div class="ms-prompt-actions">
      ${p.optional ? `<button class="ms-btn" data-act="skip">Skip</button>` : ""}
      <button class="ms-btn ms-primary" data-act="confirm" ${ready ? "" : "disabled"}>${esc(confirm)}</button>
    </div>
  </div>`;
}

// ---- day

// The ? button in the top bar: your starting card and what you did at night, in a modal. Only in the
// day and the vote, for a seated player (the night has its own prompts and results).
const myNightShown = () => screen === "room" && (view?.phase === "day" || view?.phase === "vote") && !!view.game?.myCard;

function myNightPanel() {
  const g = view.game;
  // Your night, drawn with the same pictures as the end screen (only what you saw is face up).
  const items = g.info.length
    ? g.info.map((i) => { const text = i.day ?? i.text; return `<li class="ms-ep">${i.pic ? eventEntry(text, i.pic, { me: myId }) : `<p>${esc(text)}</p>${resultCards(i.cards)}`}</li>`; }).join("")
    : `<li><p>No night actions.</p></li>`;
  return `<h2 class="ms-h2">Your Night</h2>
    <div class="ms-secret-head">
      <div class="ms-secret-card">${card(g.myCard, { size: "sm" })}</div>
      <p class="ms-secret-text">You started as the <b>${esc(ROLES[g.myCard].name)}</b>.</p>
    </div>
    <ul class="ms-notes ms-eps">${items}</ul>`;
}

// The Alpha Wolf's spare Werewolf card, drawn apart from the role cards. The one renderer for it:
// the lobby (locked, since it comes with the Alpha Wolf), the cards in this game, the night table
// and its info panel.
function spareFace({ size = "sm", locked = false, info = true } = {}) {
  return `<div class="ms-card ms-${size} ${locked ? "ms-locked" : ""}" style="${cardStyle("werewolf")}">
    <div class="ms-card-name">${N.werewolf}</div>${teamMark("werewolf")}
    <div class="ms-card-art">${artSvg("werewolf")}</div>
    ${size === "md" || size === "lg" ? `<div class="ms-card-short">Spare card</div>` : ""}
    ${locked ? `<span class="ms-lock" aria-hidden="true">${icon("lock")}</span>` : ""}
    ${info ? `<button class="ms-info" data-info="spare" aria-label="About the spare ${N.werewolf} card" data-tooltip="Spare card: added for the ${N.packleader} to hand out">${icon("info")}</button>` : ""}
  </div>`;
}
function spareCard(label, opts) {
  return `<div class="ms-cardwrap ${opts?.locked ? "ms-spare-wrap" : ""}">${spareFace(opts)}<div class="ms-card-label">${label}</div></div>`;
}

function inGameStrip() {
  const v = view;
  return `<section>
    <h2 class="ms-h2">Cards in This Game</h2>
    <p class="ms-hint">Cards are listed in wake-up order.</p>
    ${deckGrid(v.roles)}
  </section>`;
}

function dayScreen() {
  const v = view;
  const g = v.game;
  const me = v.players.find((p) => p.id === myId);
  const seated = v.players.filter((p) => p.seated && p.connected);
  const readyN = seated.filter((p) => p.dayReady).length;
  return `<main class="ms-page ms-day">
    <section class="ms-dayhead">
      <div class="ms-label">${icon("sun", "ms-ico-sm")} Day</div>
      ${countdown(g.dayEndsAt, "ms-bigtime")}
      <p class="ms-lede">Discuss. Voting starts when the timer ends or everyone is ready.</p>
    </section>
    ${revealedPanel(g)}
    ${resultPanel()}
    ${inGameStrip()}
    <mike-footer></mike-footer>
  </main>
  ${bar(`<div class="ms-bar-note">${readyN} of ${seated.length} ready</div>
    <button class="ms-btn ${me?.dayReady ? "" : "ms-primary"} ms-wide" data-act="dayready">${me?.dayReady ? "Not Ready" : "Ready to Vote"}</button>`)}`;
}

// Columns for n cards so the rows come out even (10 as 5+5, 9 as 5+4, 7 as 4+3), at most `max` wide.
const evenCols = (n, max) => Math.ceil(n / Math.ceil(n / max));

// The table, for everyone through the day and the vote: every player's card face down, and any card
// the Revealer (or a Doppelganger that copied it) left face up. Every phone shows the same thing.
function revealedPanel(g) {
  const seats = view.players.filter((p) => p.seated);
  // in seat order, so the sentence reads in the same order as the table
  const rv = seats.flatMap((p) => (g.revealed || []).filter((r) => r.pid === p.id));
  if (!rv.length) return "";
  const up = (pid) => rv.find((r) => r.pid === pid);
  const text = E.tableLine(rv, playerName);
  return `<section class="ms-panel ms-revealed">
    <h2 class="ms-h2">The Table</h2>
    <p class="ms-hint">${esc(text)}</p>
    <div class="ms-daytable" style="--cols:${evenCols(seats.length, 5)};--cols-n:${evenCols(seats.length, 4)}"><div class="ms-daytable-in">${seats.map((p) => { const r = up(p.id); return epCard(r ? { who: p.id, role: r.role, hot: true, badge: "all" } : { who: p.id }, { me: myId }); }).join("")}</div></div>
  </section>`;
}

// ---- vote

function voteScreen() {
  const v = view;
  const g = v.game;
  const seated = v.players.filter((p) => p.seated);
  const live = seated.filter((p) => p.connected);
  const votedN = live.filter((p) => p.voted).length;
  const notYet = live.filter((p) => !p.voted);
  const pick = ui.vote ?? g.myVote ?? null;
  return `<main class="ms-page ms-vote">
    <section class="ms-dayhead">
      <div class="ms-label">${icon("vote", "ms-ico-sm")} Vote</div>
      <h1 class="ms-h1">Vote</h1>
      <p class="ms-lede">Select a player, then submit your vote. You can change it until everyone has voted.</p>
      <p class="ms-hint">Whoever gets the most votes dies. If there's a tie for the most votes, all of them die. Nobody dies if no one gets more than one vote: to do that, everyone votes for the player after them in this list, and the last player votes for the first.</p>
    </section>
    <div class="ms-targets ms-vote-list">
      ${seated.map((p) => p.id === myId
        ? `<button class="ms-target" disabled aria-label="You can't vote for yourself">${avatar(p.name, p.id)}<span>${esc(p.name)} (you)</span></button>`
        : `<button class="ms-target ${pick === p.id ? "is-on" : ""}" data-vote="${p.id}" aria-pressed="${pick === p.id}">${avatar(p.name, p.id)}<span>${esc(p.name)}</span>${g.myVote === p.id ? `<span class="ms-tag">your vote</span>` : ""}${!p.connected ? icon("wifiOff", "ms-ico-sm") : ""}</button>`).join("")}
    </div>
    ${revealedPanel(g)}
    <mike-footer></mike-footer>
  </main>
  ${bar(`<div class="ms-bar-note">${votedN} of ${live.length} voted${notYet.length ? `. Waiting for ${esc(waitNames(notYet))}.` : ""}</div>
    <button class="ms-btn ms-primary ms-wide" data-act="submit-vote" ${pick && pick !== g.myVote ? "" : "disabled"}>${g.myVote && pick === g.myVote ? "Vote Submitted" : g.myVote ? "Change Vote" : "Submit Vote"}</button>`)}`;
}

// ---- results

function resultsScreen() {
  const v = view;
  const g = v.game;
  const r = g.result;
  // Everything here lists players in lobby order, the same order as the vote list.
  const at = (id) => { const i = v.players.findIndex((p) => p.id === id); return i < 0 ? Infinity : i; };
  const seats = [...g.seats].sort((a, b) => at(a) - at(b));
  const won = r.winners.includes(myId);
  const teamsWon = [r.village && "the village", r.wolfTeam && "the wolves", r.jester && `the ${N.jester}`].filter(Boolean);
  const headline = teamsWon.length ? `${cap(listNames(teamsWon))} ${teamsWon.length > 1 || teamsWon[0] === "the wolves" ? "win" : "wins"}` : "Nobody wins";
  const color = r.village ? TEAMS.village.color : r.wolfTeam ? TEAMS.wolf.color : r.jester ? TEAMS.jester.color : "var(--muted)";
  // Votes: only the players who got any, most first, each with who voted for them.
  const voted = seats.filter((id) => r.counts[id]).sort((a, b) => r.counts[b] - r.counts[a] || seats.indexOf(a) - seats.indexOf(b));
  // The card a player started with and the one they ended with, as chips.
  const startEnd = (id) => `<div class="ms-ev-cards" aria-label="Started as the ${esc(ROLES[r.dealt[id]].name)}, ended as the ${esc(ROLES[r.cards[id]].name)}">${card(r.dealt[id], { size: "xs", info: false })}${icon("arrow", "ms-ico-sm ms-res-arrow")}${card(r.cards[id], { size: "xs", info: false })}</div>`;
  const voteRows = voted.map((id) => {
    const from = seats.filter((x) => r.votes[x] === id);
    return `<li class="ms-ev-vote">${avatar(playerName(id), id)}<div><div class="ms-pname">${esc(playerName(id))}${id === myId ? ` <span class="ms-tag">you</span>` : ""}${r.dead.includes(id) ? ` <span class="ms-flag ms-flag-dead">${icon("skull", "ms-ico-sm")}died</span>` : ""}</div>
      <div class="ms-hint">${r.counts[id]} vote${r.counts[id] === 1 ? "" : "s"}, from ${esc(listNames(from.map(playerName)))}</div>${startEnd(id)}</div></li>`;
  }).join("");
  const noVote = seats.filter((id) => !r.votes[id]);
  const votesBody = (voted.length ? `<ul class="ms-ev-votes">${voteRows}</ul>` : `<p class="ms-hint">Nobody got a vote.</p>`)
    + (noVote.length ? `<p class="ms-hint">${esc(listNames(noVote.map(playerName)))} didn't vote.</p>` : "");
  const copied = Object.entries(r.copied || {}).filter(([c]) => seats.some((id) => r.cards[id] === c) || r.center.includes(c));
  const winners = seats.filter((id) => r.winners.includes(id));
  const step = (n, title, body) => `<li class="ms-ev"><h2 class="ms-h2"><span class="ms-ev-n">${n}</span>${title}</h2>${body}</li>`;
  return `<main class="ms-page ms-results">
    <section class="ms-dayhead">
      <div class="ms-label">Morning</div>
      <h1 class="ms-h1 ms-headline" style="color:${color}">${esc(headline)}</h1>
      ${g.seated ? `<div class="ms-verdict ${won ? "is-won" : "is-lost"}">${won ? "You won" : "You lost"}</div>` : ""}
    </section>
    <section class="ms-ev ms-ev-top"><h2 class="ms-h2">The Votes</h2>${votesBody}</section>
    <ol class="ms-events">
      ${step(1, "The Deal", tableCards(r.dealt, r.dealtCenter || r.center, r.dealtSpare, { seats: seats }))}
      ${step(2, "The Night", `<p class="ms-hint">In wake-up order.</p>${nightLog(r.log, "Nobody moved or looked at a card.")}`)}
      ${step(3, "When the Night Ended", tableCards(r.cards, r.center, r.spare, { seats: seats, before: r.dealt, beforeCenter: r.dealtCenter, beforeSpare: r.dealtSpare })
        + copied.map(([c, to]) => `<p class="ms-hint">The ${esc(ROLES[c].name)} card became the ${esc(ROLES[to].name)}.</p>`).join(""))}
      ${step(4, "The Votes", votesBody)}
      ${step(5, "Who Died", `${r.dead.length ? `<ul class="ms-ev-votes">${r.dead.map((id) => `<li class="ms-ev-vote">${avatar(playerName(id), id)}<div><div class="ms-pname">${esc(playerName(id))}${id === myId ? ` <span class="ms-tag">you</span>` : ""} <span class="ms-flag ms-flag-dead">${icon("skull", "ms-ico-sm")}died</span></div>${startEnd(id)}</div></li>`).join("")}</ul>` : ""}
        <p class="ms-ev-why">${esc(whyLine(r, seats))}</p>
        <p class="ms-hint">${winners.length ? `Won: ${esc(listNames(winners.map(playerName)))}.` : "Nobody won."}</p>`)}
    </ol>
    <mike-footer></mike-footer>
  </main>
  ${bar(v.isHost
    ? `<button class="ms-btn ms-primary ms-wide" data-act="again">Play Again</button>`
    : `<div class="ms-bar-wait">Waiting for ${esc(playerName(v.hostId))} to start another game</div>`)}`;
}

// The one renderer for a whole table of cards: each player's card under their name, then the center
// cards and the spare slot. With before/beforeCenter, cards that changed since then are marked.
function tableCards(cards, center, spare, { seats, before, beforeCenter, beforeSpare } = {}) {
  const changed = (was, now) => before && was !== undefined && was !== now;
  const one = (role, label, was) => wrap((role === "werewolf" && label === "Spare slot" ? spareFace() : card(role, { size: "sm" }))
    + `<div class="ms-card-label">${esc(label)}</div>${changed(was, role) ? `<span class="ms-tag ms-changed">changed</span>` : ""}`, changed(was, role) ? "is-changed" : "");
  return `<div class="ms-table">
    <div class="ms-table-grid">${seats.map((id) => one(cards[id], playerName(id) + (id === myId ? " (you)" : ""), before?.[id])).join("")}</div>
    <div class="ms-table-grid ms-table-center">${center.map((c, i) => one(c, `Center ${i + 1}`, beforeCenter?.[i])).join("")}
      ${spare ? `<div class="ms-spare-slot">${one(spare, "Spare slot", beforeSpare ?? undefined)}</div>` : ""}</div>
  </div>`;
}

// The one renderer for the night's events, in the order they happened: each line, then its picture.
// A Doppelganger acting right away, or the Witch's give, is drawn indented under the line before it.
function nightLog(log, empty) {
  if (!log.length) return `<p class="ms-hint">${esc(empty)}</p>`;
  const groups = [];
  for (const l of log) (l.sub && groups.length ? groups.at(-1).subs : (groups.push({ l, subs: [] }), [])).push(l);
  return `<ol class="ms-log ms-eps">${groups.map(({ l, subs }) => `<li class="ms-ep">${eventEntry(l.text, l.pic, {}, l.note)}${subs.length ? `<div class="ms-ep-sub">${subs.map((x) => eventEntry(x.text, x.pic, {}, x.note)).join("")}</div>` : ""}</li>`).join("")}</ol>`;
}
const eventEntry = (text, pic, opts, note) => `<div class="ms-ep-one"><p>${esc(text)}</p>${pic ? eventPic(pic, opts) : ""}${note ? `<p class="ms-ep-note">${esc(note)}</p>` : ""}</div>`;

// The one renderer for a night event's picture (the end screen, the spectators' log and your own
// night notes): the actor's card, what they did, and the cards it touched. A gold ring marks a card
// the event touched; the eye means the actor saw it, the crossed-out eye that it moved or was
// touched unseen. A card with no role is face down. With `me`, your own cards are labeled "You".
const EP_OPS = { saw: ["eye", "saw"], "saw own": ["eye", "saw own"], swapped: ["swap", "swapped"], moved: ["hand", "moved"], became: ["copy", "became"], flipped: ["flipCard", "flipped"] };
// One card in an event picture or on the day's table: its badge, its face (or back), its label.
function epCard(c, { me } = {}) {
  const label = /^c\d$/.test(c.who) ? `C${+c.who[1] + 1}` : c.who === "spare" ? "Spare" : `${c.who === me ? "You" : playerName(c.who)}${c.now ? " now" : ""}`;
  const b = c.role ? c.badge : c.badge === "eyeoff" ? "eyeoff" : null;
  const badge = b ? `<span class="ms-ep-badge ${b === "eyeoff" ? "is-off" : ""}" aria-label="${b === "eyeoff" ? "not seen" : b === "all" ? "seen by everyone" : "seen"}">${icon(b === "eyeoff" ? "eyeOff" : "eye")}</span>` : "";
  return `<div class="ms-cardwrap ms-ep-card ${c.hot ? "is-hot" : ""} ${c.dim ? "is-dim" : ""} ${c.actor ? "is-actor" : ""}">${badge}${!c.role ? cardBack({ size: "sm" }) : card(c.role, { size: "sm", info: false })}<div class="ms-card-label">${esc(label)}</div>${c.badge === "all" ? `<div class="ms-ep-all">Seen by everyone</div>` : ""}</div>`;
}
function eventPic(pic, { me } = {}) {
  const one = (c) => epCard(c, { me });
  const part = (it) => {
    if (it.t === "card") return one(it);
    if (it.t === "op") { const [ic, w] = EP_OPS[it.op] || ["arrow", it.op]; return `<div class="ms-ep-op">${icon(ic)}<span>${esc(w)}</span></div>`; }
    if (it.t === "center") return `<div class="ms-ep-group" title="Center cards">${it.cards.map(one).join("")}</div>`;
    if (it.t === "each") return `<div class="ms-ep-each"><div class="ms-ep-group">${it.cards.map(one).join("")}</div><div class="ms-ep-each-l">${icon("eye")}saw each other</div></div>`;
    return "";
  };
  const segs = [[]];
  for (const it of pic) it.t === "br" ? segs.push([]) : segs.at(-1).push(it);
  // more cards than fit in one line (the Aura Seer seeing four players): that part may wrap too
  const many = (sg) => sg.reduce((n, it) => n + (it.t === "card" ? 1 : it.cards ? it.cards.length : 0), 0) > 4;
  return `<div class="ms-ep-pic">${segs.map((sg) => `<div class="ms-ep-seg ${many(sg) ? "is-many" : ""}">${sg.map(part).join("")}</div>`).join("")}</div>`;
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);

// Who died and why that decides the game, in plain sentences.
function whyLine(r, seats) {
  const c = r.effective || r.cards;
  const named = (ids) => listNames(ids.map(playerName));
  const parts = [];
  const shot = new Set(r.hunterShots.map(([, t]) => t));
  const voted = r.dead.filter((id) => !shot.has(id));
  const turned = r.turned || [];
  const saved = r.saved || [];
  const guardOf = (id) => (c[id] === "prince" ? `the ${N.prince}` : `protected by the ${N.bodyguard}`);
  for (const id of saved) parts.push(`${playerName(id)} had the most votes but was ${guardOf(id)}, so they couldn't die.`);
  const most = saved.length ? "the next most votes" : "the most votes";
  if (!r.dead.length) parts.push(saved.length ? "Nobody else got more than one vote, so nobody died." : "Nobody got more than one vote, so nobody died.");
  else if (voted.length > 1) parts.push(`${named(voted)} tied with ${most}, ${r.counts[voted[0]]} each, so they all died.`);
  else parts.push(`${named(voted)} got ${most} and died.`);
  for (const [h, t] of r.hunterShots) parts.push(`${playerName(h)} was the ${N.hunter}, so ${playerName(t)}, who they voted for, died too.`);
  for (const [h, t] of r.hunterBlocked || []) parts.push(`${playerName(h)} was the ${N.hunter}, but ${playerName(t)}, who they voted for, was ${guardOf(t)} and lived.`);
  if (turned.length) parts.push(`A wolf voted for ${named(turned)}, the ${N.cursed}, who became a ${N.werewolf}.`);
  const deadAs = (pred) => r.dead.filter((id) => pred(c[id]) || (turned.includes(id) && pred("werewolf")));
  const wolves = deadAs((x) => ROLES[x].wolf);
  const jesters = deadAs((x) => x === "jester");
  const anyWolf = seats.some((id) => ROLES[c[id]].wolf || turned.includes(id));
  const as = (ids, what) => `${named(ids)} ${ids.length > 1 ? "were" : "was"} ${what}`;
  const apprentices = seats.filter((id) => c[id] === "apprentice");
  const lonePupil = !seats.some((id) => c[id] === "jester") ? deadAs((x) => x === "apprentice") : [];
  if (jesters.length) parts.push(`${as(jesters, `the ${N.jester}`)}, so the ${N.jester} wins${apprentices.length ? ` with the ${N.apprentice}` : ""}${anyWolf && !r.village ? " and the wolves can't" : ""}.`);
  if (lonePupil.length) parts.push(`${as(lonePupil, `the ${N.apprentice}`)} with no ${N.jester} in play, so the ${N.apprentice} wins${anyWolf && !r.village ? " and the wolves can't" : ""}.`);
  if (r.village) {
    if (wolves.length) parts.push(`${as(wolves, wolves.length > 1 ? "wolves" : "a wolf")}, so the village wins.`);
    else parts.push("No player was a wolf and nobody died, so the village wins.");
  } else if (anyWolf) {
    if (r.wolfTeam) parts.push("No wolf died, so the wolf team wins.");
  } else if (r.dead.length && !jesters.length && !lonePupil.length) {
    const helpers = seats.filter((id) => ["lackey", "scout"].includes(c[id]));
    const won = helpers.filter((id) => r.winners.includes(id));
    const lost = helpers.filter((id) => r.dead.includes(id));
    let t = "No player was a wolf, so someone dying meant the village lost.";
    if (won.length) t += ` ${named(won)} stayed alive while someone else died, so ${won.length > 1 ? "they win" : `the ${ROLES[c[won[0]]].name} wins`}.`;
    if (lost.length) t += ` ${as(lost, lost.length > 1 ? "on the wolf team" : `the ${ROLES[c[lost[0]]].name}`)} and died, so ${won.length ? "they lose" : "nobody wins"}.`;
    parts.push(t);
  }
  return parts.join(" ");
}

// ---------------------------------------------------------------- panels (modals with live content)

let panel = null; // { kind, el, close }

function openPanel(kind) {
  closePanel();
  ui.confirmHost = null;
  ui.confirmKick = null;
  const { el, close } = openModal("", { className: `ms-modal ms-modal-${kind}`, onClose: () => { if (panel?.el === el) panel = null; } });
  panel = { kind, el, close };
  el.addEventListener("click", onClick);
  el.addEventListener("submit", onSubmit);
  refreshPanel(true);
}

function closePanel() {
  if (panel) { const p = panel; panel = null; p.close(); }
}

function refreshPanel(force = false) {
  if (!panel) return;
  if (panel.kind === "mynight" && !myNightShown()) { closePanel(); return; }
  if (panel.kind === "players" || panel.kind === "host") {
    if (!view || screen !== "room") { closePanel(); return; }
    if (panel.kind === "host" && !view.isHost) { closePanel(); return; }
  }
  let html = "";
  if (panel.kind === "players") html = playersPanel();
  else if (panel.kind === "host") html = hostPanel();
  else if (panel.kind === "cheatsheet") html = cheatsheetPanel();
  else if (panel.kind === "mynight") html = myNightPanel();
  else if (panel.kind === "settings") html = settingsPanel();
  else if (panel.kind.startsWith("info:")) html = infoPanel(panel.kind.slice(5));
  if (!force && html === panel.html) return;
  const focused = document.activeElement?.id;
  panel.el.innerHTML = html;
  panel.html = html;
  if (focused) document.getElementById(focused)?.focus();
}

function playersPanel() {
  const v = view;
  const confirmKick = ui.confirmKick;
  return `<h2 class="ms-h2">Players in Room <span class="ms-mono">${esc(v.code)}</span></h2>
    <ul class="ms-players">${v.players.map((p) => p.id === myId && v.phase === "lobby" ? myLobbyRow(p, "panel") : playerRow(p, {
      extra: v.isHost && p.id !== myId
        ? (confirmKick === p.id
          ? `<span class="ms-kick-confirm">Kick ${esc(p.name)} from the room for good? <span class="ms-confirm-row"><button class="ms-btn ms-danger ms-sm-btn" data-kick="${p.id}">Kick</button><button class="ms-btn ms-sm-btn" data-act="kick-cancel">Cancel</button></span></span>`
          : `<button class="ms-icon-btn ms-kick" data-kick-ask="${p.id}" aria-label="Kick ${esc(p.name)} from the room" data-tooltip="Kick from room: removes ${esc(p.name)} and stops them rejoining">${icon("userX")}</button>`)
        : "",
    })).join("")}</ul>
${v.phase === "lobby" ? "" : `    <p class="ms-hint">Names can only be changed in the lobby.</p>`}
    <button class="ms-btn ms-wide ms-leave" data-act="leave">${icon("logout")}<span>Leave room</span></button>
    ${v.isHost && v.players.length > 1 ? `<p class="ms-hint">If you leave, a random player becomes the host and the game carries on.</p>` : ""}
    <button class="ms-link ms-settings-link" type="button" data-act="settings">Settings</button>`;
}

function settingsPanel() {
  const on = !!settings().tabsArePlayers;
  return `<h2 class="ms-h2">Settings</h2>
    <button class="ms-switch-row" role="switch" aria-checked="${on}" data-act="tabs-toggle">
      <span><b>Each tab is a different player</b><small>For testing alone on one device: every tab you open joins as its own player. When it's off, every tab on this device is you.</small></span>
      <span class="ms-switch" aria-hidden="true"></span>
    </button>
    ${screen === "room" ? `<p class="ms-hint">Changing this reloads the page.</p>` : ""}`;
}

function hostPanel() {
  const v = view;
  const ph = v.phase;
  // dangerous items ask once, inline, like kicking does
  const item = (act, label, desc, danger = false) => danger && ui.confirmHost === act
    ? `<div class="ms-host-item is-danger is-confirming"><b>${label}?</b><span>${desc}</span>
        <div class="ms-confirm-row"><button class="ms-btn ms-danger ms-sm-btn" data-act="${act}">Yes, ${label.toLowerCase()}</button><button class="ms-btn ms-sm-btn" data-act="host-cancel">Cancel</button></div></div>`
    : `<button class="ms-host-item ${danger ? "is-danger" : ""}" data-act="${danger ? "host-ask" : act}" data-what="${act}"><b>${label}</b><span>${desc}</span></button>`;
  const inRound = ph !== "lobby" && ph !== "results";
  const missing = v.players.filter((p) => p.seated && p.connected && !p.ready).length;
  const unvoted = v.players.filter((p) => p.seated && p.connected && !p.voted).length;
  return `<h2 class="ms-h2 ms-host-title">${icon("shield")} Host Controls</h2>
    <p class="ms-hint">Only you see these. Use them when someone is stuck, has left, or the group wants to move on.</p>
    <div class="ms-host-list">
      ${ph === "deal" ? item("h-night", "Start Night", missing ? `${missing} player${missing === 1 ? " hasn't" : "s haven't"} said they're ready.` : "Everyone is ready.") : ""}
      ${ph === "day" ? item("h-skipday", "Skip to Vote", "Ends the discussion for everyone.") : ""}
      ${ph === "vote" ? item("h-endvote", "End Vote", unvoted ? `${unvoted} player${unvoted === 1 ? " hasn't" : "s haven't"} voted. Their votes count as no vote.` : "Everyone has voted.") : ""}
      ${item("players", "Kick a player", "Opens the player list, where each player has a kick button.")}
      ${inRound ? item("h-reset", "Return to Lobby", "Ends this round for everyone, without results.", true) : ""}
      ${item("leave", "Leave Room", inRound ? "A random player becomes the host. The round keeps going." : "A random player becomes the host and you leave the room.", true)}
    </div>`;
}

function cheatsheetPanel() {
  const roles = view?.roles || {};
  return `<h2 class="ms-h2">Cards in This Game</h2>
    <p class="ms-hint">Cards are listed in wake-up order.</p>
    ${deckGrid(roles)}
    <h2 class="ms-h2">Who Wins</h2>
    <ul class="ms-wins">${winRules(view?.roles).map(([t, txt]) => `<li><b style="color:${TEAMS[t].color}">${TEAMS[t].name}</b> ${esc(txt.replace(/^The .*? (?=wins )/, ""))}</li>`).join("")}</ul>`;
}

function infoPanel(r) {
  if (r === "spare") {
    return `<div class="ms-info-modal">
      ${wrap(spareFace({ size: "lg", info: false }))}
      <div>
        <h2 class="ms-h2" style="color:${TEAMS.wolf.color}">The Spare ${N.werewolf} Card</h2>
        <div class="ms-label">Only in games with the ${N.packleader}</div>
        <p>Picking the ${N.packleader} adds one extra ${N.werewolf} card. It isn't dealt to anyone and isn't one of the 3 center cards. It waits in its own spare slot.</p>
        <p>On the ${N.packleader}'s turn, they give it to a player who isn't a wolf. The two cards swap places: the player now holds the ${N.werewolf} card, so they're on the wolf team without knowing it, and their old card goes face down into the spare slot.</p>
      </div>
    </div>`;
  }
  const R = ROLES[r];
  const T = TEAMS[R.team];
  // wake order within this game's deck (or the whole list when nothing is picked)
  const deck = view?.roles || {};
  const steps = NIGHT_STEPS.filter((st) => st.roles.some((x) => deck[x]) || !Object.keys(deck).length);
  const stepId = R.wolf ? "wolves" : R.step;
  const stepIdx = steps.findIndex((st) => st.id === stepId);
  return `<div class="ms-info-modal">
    ${wrap(card(r, { size: "lg", info: false }))}
    <div>
      <h2 class="ms-h2" style="color:${T.color}">${esc(R.name)}</h2>
      <div class="ms-label">${esc(T.name)}${R.wolf ? " · counts as a wolf" : ""} · ${stepIdx >= 0 ? `wakes up on night turn ${stepIdx + 1} of ${steps.length}${Object.keys(deck).length ? " in this game" : ""}` : R.step ? "not in this game" : "doesn't wake up"}</div>
      <p>${esc(R.text)}</p>
      ${R.note ? `<p class="ms-hint">${esc(R.note)}</p>` : ""}
    </div>
  </div>`;
}
const ordinal = (n) => `${n}${["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || "th"}`;

// ---------------------------------------------------------------- input

function onSubmit(e) {
  const form = e.target.closest("[data-form]");
  if (!form) return;
  e.preventDefault();
  const kind = form.dataset.form;
  if (kind === "create" || kind === "join") {
    if (kind === "create") { needName = !myName; createRoom(); return; }
    const n = E.cleanName(document.getElementById("name-input").value);
    if (!n) { toast("Enter your name"); document.getElementById("name-input").focus(); return; }
    myName = n; ls.set(NS + "name", n);
    joinAsGuest(roomCode, e.submitter?.dataset.as === "spectator" ? "spectator" : "player");
  }
  if (kind === "firstname") {
    const n = E.cleanName(document.getElementById("name-input").value);
    if (!n) { toast("Enter your name"); return; }
    myName = n; ls.set(NS + "name", n);
    send({ t: "rename", name: n });
    needName = false;
    render();
    return;
  }
  if (kind === "rename") {
    const n = E.cleanName(form.querySelector("#rename-input").value);
    if (!n) { toast("Enter a name"); return; }
    myName = n; ls.set(NS + "name", n);
    send({ t: "rename", name: n });
    ui.renaming = false;
    render(); refreshPanel();
    toast("Name changed");
  }
}

function onClick(e) {
  const t = e.target.closest("button, [data-toggle]");
  if (!t || t.disabled) return;
  const d = t.dataset;
  if (d.info) { e.stopPropagation(); openPanel(`info:${d.info}`); return; }
  if (d.toggle) {
    const R = ROLES[d.toggle];
    const roles = { ...view.roles };
    roles[d.toggle] = roles[d.toggle] ? 0 : (R.pair ? 2 : 1);
    send({ t: "setRoles", roles });
    return;
  }
  if (d.step) {
    const roles = { ...view.roles };
    roles[d.step] = Math.max(0, (roles[d.step] || 0) + Number(d.d));
    send({ t: "setRoles", roles });
    return;
  }
  if (d.day) { send({ t: "setDay", minutes: Number(d.day) }); return; }
  if (d.target) {
    const p = view.game.prompt;
    const max = p.kind === "two" ? 2 : 1;
    if (ui.sel.includes(d.target)) ui.sel = ui.sel.filter((x) => x !== d.target);
    else ui.sel = max === 1 ? [d.target] : [...ui.sel, d.target].slice(-max);
    if (p.kind === "seer") ui.center = [];
    render();
    return;
  }
  if (d.center != null) {
    const p = view.game.prompt;
    const i = Number(d.center);
    const max = p.kind === "seer" ? 2 : 1;
    if (ui.center.includes(i)) ui.center = ui.center.filter((x) => x !== i);
    else ui.center = max === 1 ? [i] : [...ui.center, i].slice(-max);
    if (p.kind === "seer") ui.sel = [];
    render();
    return;
  }
  if (d.vote) { ui.vote = d.vote; render(); return; }
  if (d.kickAsk) { ui.confirmKick = d.kickAsk; refreshPanel(); return; }
  if (d.kick) { ui.confirmKick = null; send({ t: "hostKick", target: d.kick }); return; }
  switch (d.act) {
    case "home": leaveRoom(); return;
    case "retry": lostSince = null; joinAsGuest(roomCode); return;
    case "join-code": {
      const code = (document.getElementById("code-input").value || "").toUpperCase().replace(/[^A-Z]/g, "");
      if (code.length !== 4) { toast("Enter a 4-letter room code"); return; }
      roomCode = code; setRoomInUrl(code); render();
      return;
    }
    case "cheatsheet": openPanel("cheatsheet"); return;
    case "mynight": openPanel("mynight"); return;
    case "submit-vote": if (ui.vote) send({ t: "vote", target: ui.vote }); return;
    case "result-ok": shownResult = null; render(); return;
    case "settings": openPanel("settings"); return;
    case "tabs-toggle": {
      const next = !settings().tabsArePlayers;
      saveSettings({ tabsArePlayers: next });
      // a tab turning it on stays the player it was (slot 0) if it can; turning it off, every tab is slot 0
      if (!next) ss.set("onuw:slot", "0");
      t.setAttribute?.("aria-checked", String(next));
      // who this tab is gets decided on load
      setTimeout(() => location.reload(), 250);
      return;
    }
    case "players": openPanel("players"); return;
    case "host": openPanel("host"); return;
    case "kick-cancel": ui.confirmKick = null; refreshPanel(); return;
    case "host-ask": ui.confirmHost = d.what; refreshPanel(); return;
    case "host-cancel": ui.confirmHost = null; refreshPanel(); return;
    case "leave": closePanel(); leaveRoom(); return;
    case "edit-name": {
      ui.renaming = d.where || "lobby"; render(); refreshPanel();
      const inp = (ui.renaming === "panel" ? panel?.el : app)?.querySelector("#rename-input");
      if (inp) { inp.focus(); inp.select(); }
      return;
    }
    case "edit-name-cancel": ui.renaming = false; render(); refreshPanel(); return;
    case "spec-on": ss.set(joinedKey(roomCode), "spectator"); send({ t: "setSpectator", on: true }); return;
    case "spec-off": ss.set(joinedKey(roomCode), "player"); send({ t: "setSpectator", on: false }); return;
    case "invite": {
      const link = inviteLink();
      navigator.clipboard?.writeText(link).then(() => toast("Invite link copied"), () => toast(link));
      return;
    }
    // the system share sheet (on an iPhone it can also show the link as a QR code)
    case "share": navigator.share?.({ title: TITLE, text: `Join my ${TITLE} room ${roomCode}`, url: inviteLink() }).catch(() => {}); return;
    case "wack": openWack({ card: (r) => card(r, { size: "sm", info: false }), names: { werewolf: N.werewolf, villager: N.villager } }); return;
    case "suggest": send({ t: "suggestRoles" }); return;
    case "start": send({ t: "start" }); return;
    case "ready": send({ t: "peeked" }); return;
    case "skip": noteActed(true); send({ t: "act", step: view.game.prompt.step, skip: true }); return;
    case "confirm": {
      const p = view.game.prompt;
      const msg = { t: "act", step: p.step };
      if (p.kind === "center1") msg.center = ui.center[0];
      else if (p.kind === "player") msg.target = ui.sel[0];
      else if (p.kind === "two") msg.targets = ui.sel;
      else if (p.kind === "seer") { if (ui.sel.length) msg.target = ui.sel[0]; else msg.center = ui.center; }
      if (p.kind !== "ack") noteActed(false);
      send(msg);
      return;
    }
    case "dayready": {
      const me = view.players.find((p) => p.id === myId);
      send({ t: "dayReady", ready: !me?.dayReady });
      return;
    }
    case "again": send({ t: "hostReset" }); return;
    case "h-night": closePanel(); send({ t: "hostStartNight" }); return;
    case "h-skipday": closePanel(); send({ t: "hostSkipDay" }); return;
    case "h-endvote": closePanel(); send({ t: "hostEndVote" }); return;
    case "h-reset": closePanel(); send({ t: "hostReset" }); return;
  }
}

app.addEventListener("click", onClick);
app.addEventListener("submit", onSubmit);
app.addEventListener("keydown", (e) => {
  const t = e.target.closest("[data-toggle]");
  if (t && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); t.click(); }
});
app.addEventListener("input", (e) => {
  if (e.target.id === "code-input") e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, "");
  if (e.target.id === "name-input") {
    // every submit button in the form (Join Room and Spectate) needs a name
    for (const btn of e.target.closest("form")?.querySelectorAll('button[type="submit"]') || []) btn.disabled = !E.cleanName(e.target.value);
  }
});

// Face-down things (your card at the deal; your card and night notes later): tap and the card
// turns over like a card on the table (lifts, turns edge-on, comes down face up, as in card-table),
// and stays face up until it's tapped again. Everything role-specific in the same [data-flip]
// scope is marked .is-front and only shows while it's face up.
const FLIP_MS = 520;
const flip = { busy: {}, turning: null };
function turnCard(name, up) {
  const scope = app.querySelector(`[data-flip="${name}"]`);
  if (!scope || flip.busy[name] || !!ui.up[name] === up) return;
  const swap = () => {
    ui.up[name] = up;
    const now = app.querySelector(`[data-flip="${name}"]`);
    now?.classList.toggle("is-up", up);
    now?.querySelectorAll("[aria-pressed]").forEach((e) => e.setAttribute("aria-pressed", String(up)));
    if (up && name === "deal" && !ui.peeked) { ui.peeked = true; render(); }   // enables "ready"
  };
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { swap(); return; }
  flip.busy[name] = true;
  flip.turning = { name, start: performance.now() };
  restoreTurn();
  setTimeout(swap, FLIP_MS / 2);
  setTimeout(() => {
    flip.busy[name] = false;
    if (flip.turning?.name === name) flip.turning = null;
    app.querySelector(`[data-flip="${name}"] .ms-turner`)?.classList.remove("is-turning");
  }, FLIP_MS);
}
// The page is rebuilt on every change (the night countdown ticks each second), so a turn in progress
// is put back at the point it had reached.
function restoreTurn() {
  if (!flip.turning) return;
  const el = app.querySelector(`[data-flip="${flip.turning.name}"] .ms-turner`);
  if (!el) return;
  el.classList.remove("is-turning"); void el.offsetWidth;
  el.style.animationDelay = `-${Math.round(performance.now() - flip.turning.start)}ms`;
  el.classList.add("is-turning");
}
function flipScopeOf(t) { return t.closest("[data-flip-tap]")?.closest("[data-flip]")?.dataset.flip; }
app.addEventListener("click", (e) => { if (e.target.closest("[data-info]")) return; const n = flipScopeOf(e.target); if (n) turnCard(n, !ui.up[n]); });
app.addEventListener("keydown", (e) => {
  const t = e.target.closest("[data-flip-tap]");
  if (t && t.tagName !== "BUTTON" && (e.key === " " || e.key === "Enter")) { e.preventDefault(); if (!e.repeat) turnCard(flipScopeOf(t), !ui.up[flipScopeOf(t)]); }
});
app.addEventListener("contextmenu", (e) => { if (e.target.closest("[data-flip-tap]")) e.preventDefault(); });

// ---------------------------------------------------------------- start

async function boot() {
  if (!roomCode) { screen = "home"; render(); return; }
  const saved = ss.get(hostKey(roomCode));
  if (saved) {
    // this tab was hosting before a refresh: take the room back
    screen = "connecting"; render();
    try { await becomeHost(roomCode, JSON.parse(saved), { tries: 8 }); return; }
    catch { ss.del(hostKey(roomCode)); mode = null; S = null; }
  }
  if (myName && ss.get(joinedKey(roomCode))) joinAsGuest(roomCode);
  else { screen = "home"; render(); }
}

if (!LOCAL && !window.Peer) {
  app.innerHTML = messageScreen("Couldn't load", "The library that connects the players didn't load. Check your connection and refresh.");
} else {
  boot();
}

// for tests
window.__onuw = { get view() { return view; }, get mode() { return mode; }, get myId() { return myId; }, get state() { return S; }, send, publish, wack: WACK };
