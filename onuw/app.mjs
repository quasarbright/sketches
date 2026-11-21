// The page: connection handling (host or guest), rendering every screen, and input.
// The host runs engine.mjs and sends each player their own view; guests only render views.
import { openModal } from "../shared/cohesion.js";
import { ROLES, ROLE_ORDER, TEAMS, WIN_RULES, NIGHT_STEPS, emblemSvg, deckSize } from "./roles.mjs";
import * as E from "./engine.mjs";
import { makeNet } from "./net.mjs";
import { NAMES as N, TITLE } from "./skin.mjs";
import { artSvg } from "./art.mjs";
document.title = TITLE;

// ---------------------------------------------------------------- setup

const params = new URLSearchParams(location.search);
const LOCAL = params.get("net") === "local";
const NET = makeNet(LOCAL ? "local" : "peer");
const HEARTBEAT = 2000;
const DEAD_AFTER = 8000;
// ?fast: short night steps, for tests and trying it out alone
const ROOM_OPTS = params.has("fast") ? { timing: { stepMin: 700, stepJitter: 300, stepMax: 10000 } } : {};

const safe = (store) => ({
  get(k) { try { return store.getItem(k); } catch { return null; } },
  set(k, v) { try { store.setItem(k, v); } catch {} },
  del(k) { try { store.removeItem(k); } catch {} },
});
const ls = safe(window.localStorage);
const ss = safe(window.sessionStorage);

// One id per tab (so two tabs are two players), kept across refreshes of that tab.
let myId = ss.get("onuw:id");
if (!myId) { myId = Math.random().toString(36).slice(2, 12); ss.set("onuw:id", myId); }
let myName = ls.get("onuw:name") || "";

const app = document.getElementById("app");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------------------------------------------------------------- icons (Lucide)

const ICONS = {
  users: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>`,
  info: `<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>`,
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
  eye: `<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>`,
  chevronUp: `<path d="m18 15-6-6-6 6"/>`,
  userX: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m17 8 5 5"/><path d="m22 8-5 5"/>`,
  sun: `<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>`,
  vote: `<path d="m9 12 2 2 4-4"/><path d="M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7Z"/><path d="M22 19H2"/>`,
};
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
let screen = "home";      // home | connecting | room | kicked | notfound
let roomCode = (params.get("room") || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4) || null;
let lastHostId = null;

const now = () => Date.now();
const hostNow = () => now() + clockOffset;
const hostKey = (code) => `onuw:host:${code}`;

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
    if (!pid || pid === myId) { hostNet.drop(id); return; }
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
const joinedKey = (code) => `onuw:joined:${code}`;

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
  const s = E.createRoom(roomCode, { id: myId, name: myName }, now(), ROOM_OPTS);
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
      await becomeHost(code, E.createRoom(code, { id: myId, name: myName }, now(), ROOM_OPTS));
      return;
    } catch (e) {
      if (e.message !== "taken") { screen = "home"; roomCode = null; render(); toast("Couldn't reach the matchmaking server. Check your connection and try again."); return; }
    }
  }
}

// ---------------------------------------------------------------- views & local UI state

let ui = freshUi();
function freshUi() {
  return { key: null, sel: [], center: [], peeking: false, peeked: false };
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
  const key = `${v.round}:${v.phase}:${v.game?.stepId ?? ""}`;
  if (key !== ui.key && v.phase === "night" && v.game?.prompt && !v.game.prompt.done) {
    try { navigator.vibrate?.([120, 80, 120]); } catch {}   // it's your turn: a buzz, since eyes are on your own screen
  }
  if (key !== ui.key) {
    const keepPeek = ui.peeked && prev?.round === v.round;
    ui = freshUi();
    ui.key = key;
    ui.peeked = keepPeek;
  }
  const me = v.players.find((p) => p.id === myId);
  if (me && me.name !== myName && !ui.renaming) { myName = me.name; ls.set("onuw:name", myName); }
  render();
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
function card(role, { size = "md", label = "", info = true, cls = "", attrs = "", times = 1 } = {}) {
  const R = ROLES[role];
  return `<div class="ms-card ms-${size} ${cls}" style="--team:${TEAMS[R.team].color}" ${attrs}>
    <div class="ms-card-name">${esc(R.name)}${times > 1 ? ` <span class="ms-mono ms-muted">×${times}</span>` : ""}</div>
    <div class="ms-card-art">${size === "xs" ? emblemSvg(role) : artSvg(role)}</div>
    ${size === "md" || size === "lg" ? `<div class="ms-card-short">${esc(R.short)}</div>` : ""}
    ${info ? `<button class="ms-info" data-info="${role}" aria-label="What the ${esc(R.name)} does" data-tooltip="${esc(R.name)}: ${esc(R.short)}">${icon("info")}</button>` : ""}
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
  else if (screen === "kicked") html = messageScreen("You were removed", "The host removed you from the room.", false, true);
  else if (!view) html = messageScreen("Connecting…", "", true);
  else html = roomScreen();
  if (html !== app._html) {
    const focused = document.activeElement?.id;
    const sel = focused && document.activeElement.selectionStart;
    const oldMoon = app.querySelector(".ms-arc-moon")?.style.transform;
    app.innerHTML = html;
    app._html = html;
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

function messageScreen(title, body, spinner = false, back = false, retry = false) {
  return `<main class="ms-center">
    <div class="ms-hero-moon">${bigMoon()}</div>
    <h1 class="ms-h1">${title}</h1>
    <p class="ms-lede">${body}</p>
    ${spinner ? `<div class="ms-dots"><span></span><span></span><span></span></div>` : ""}
    ${retry || back ? `<div class="ms-msg-actions">${retry ? `<button class="ms-btn ms-primary" data-act="retry">Try again</button>` : ""}${back ? `<button class="ms-btn ${retry ? "" : "ms-primary"}" data-act="home">Back to the start</button>` : ""}</div>` : ""}
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
      <label class="ms-label" for="name-input">Your name</label>
      <input id="name-input" class="ms-input" maxlength="20" autocomplete="nickname" placeholder="What should people call you?" value="${esc(myName)}" />
      ${joining
        ? `<button class="ms-btn ms-primary ms-wide" type="submit" data-as="player" ${myName ? "" : "disabled"}>Join room <span class="ms-mono">${esc(roomCode)}</span> as a player</button>
           <button class="ms-btn ms-wide" type="submit" data-as="spectator" ${myName ? "" : "disabled"}>${icon("eye")}<span>Watch as a spectator</span></button>
           <p class="ms-hint">Spectators see every card and everything that happens at night. If a game is already going, you'll watch until the next round.</p>
           <button class="ms-link" type="button" data-act="home">Start a different room instead</button>`
        : `<button class="ms-btn ms-primary ms-wide" type="submit" ${myName ? "" : "disabled"}>Create a room</button>
           <div class="ms-or"><span>or join one</span></div>
           <div class="ms-join-row">
             <input id="code-input" class="ms-input ms-code-input" maxlength="4" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="CODE" aria-label="Room code" />
             <button class="ms-btn" type="button" data-act="join-code">Join</button>
           </div>`}
    </form>
    <button class="ms-link" data-act="howto">How to play</button>
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
  const need = v.players.length + 3;
  const okCount = have === need;
  const spare = v.roles.packleader ? `<div class="ms-cardwrap ms-spare-wrap">
      <div class="ms-card ms-md ms-locked" style="--team:${TEAMS.wolf.color}">
        <div class="ms-card-name">${N.werewolf}</div>
        <div class="ms-card-art">${artSvg("werewolf")}</div>
        <div class="ms-card-short">Spare card</div>
        <span class="ms-lock" aria-hidden="true">${icon("lock")}</span>
        <button class="ms-info" data-info="spare" aria-label="Why there's a spare card" data-tooltip="Spare card: added for the ${N.packleader} to hand out">${icon("info")}</button>
      </div>
      <div class="ms-card-label">Added for the ${N.packleader}</div>
    </div>` : "";
  const cards = ROLE_ORDER.filter((r) => host || v.roles[r]).map((r) => pickerCard(r, v.roles[r] || 0, host) + (r === "packleader" ? spare : "")).join("");
  const problem = v.startProblem;
  return `<main class="ms-page">
    <section class="ms-room">
      <div>
        <div class="ms-label">Room code</div>
        <div class="ms-code">${esc(v.code)}</div>
        <div class="ms-code-words">${esc(codeWords(v.code))}</div>
      </div>
      <button class="ms-btn" data-act="invite">${icon("link")}<span>Copy invite link</span></button>
    </section>

    <section>
      <h2 class="ms-h2">Players <span class="ms-sub">${playing.length}</span></h2>
      <ul class="ms-players">${playing.map((p) => p.id === myId ? myLobbyRow(p) : playerRow(p)).join("")}</ul>
      ${watching.length ? `<h3 class="ms-watch-h">${icon("eye", "ms-ico-sm")} Watching</h3>
      <ul class="ms-players">${watching.map((p) => p.id === myId ? myLobbyRow(p) : playerRow(p)).join("")}</ul>` : ""}
      <button class="ms-link ms-spec-toggle" data-act="${v.spectator ? "spec-off" : "spec-on"}">${v.spectator ? "Play in the next game instead" : "Watch as a spectator instead"}</button>
      ${v.spectator ? `<p class="ms-hint">You're watching. You'll see every card and everything that happens at night, so keep your screen away from the players.</p>` : ""}
      ${playing.length < 3 ? `<p class="ms-hint">Send the others the invite link or the room code. You need at least 3 players.</p>` : ""}
    </section>

    <section>
      <div class="ms-h2row">
        <h2 class="ms-h2">Cards <span class="ms-sub ${v.players.length < 3 ? "" : okCount ? "ms-ok" : "ms-warn"}">${have} of ${need}</span></h2>
        ${host && v.rolesCustom ? `<button class="ms-link" data-act="suggest">Use suggested cards</button>` : ""}
      </div>
      <p class="ms-hint">One card for each player plus 3 in the center.${v.roles.packleader ? ` The ${N.packleader} also adds a spare ${N.werewolf} card, placed next to it with a lock, on top of these.` : ""}${host ? " Tap a card to add or remove it." : ""}</p>
      <div class="ms-grid">${cards}</div>
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
    ? `${problem && v.players.length >= 3 ? `<div class="ms-bar-note">${esc(problem)}</div>` : ""}<button class="ms-btn ms-primary ms-wide" data-act="start" ${problem ? "disabled" : ""}>${v.players.length < 3 ? "Waiting for 3 players" : "Start the game"}</button>`
    : `<div class="ms-bar-wait">Waiting for ${esc(playerName(v.hostId))} to start the game</div>`)}`;
}

function pickerCard(r, count, host) {
  const R = ROLES[r];
  const on = count > 0;
  const stepper = host && on && R.max > 1 && !R.pair
    ? `<div class="ms-stepper">
        <button data-step="${r}" data-d="-1" aria-label="One fewer ${esc(R.name)}" data-tooltip="One fewer ${esc(R.name)}">${icon("minus")}</button>
        <span class="ms-mono">${count}</span>
        <button data-step="${r}" data-d="1" aria-label="One more ${esc(R.name)}" data-tooltip="One more ${esc(R.name)}" ${count >= R.max ? "disabled" : ""}>${icon("plus")}</button>
      </div>`
    : "";
  const badge = on && !stepper && (count > 1 || R.pair) ? `<span class="ms-badge">×${count}</span>` : "";
  const label = "";
  return `<div class="ms-cardwrap ${on ? "is-on" : "is-off"}">
    ${card(r, {
      cls: `${on ? "" : "ms-off"} ${host ? "ms-pickable" : ""}`,
      attrs: host ? `data-toggle="${r}" role="button" tabindex="0" aria-pressed="${on}" aria-label="${on ? "Remove" : "Add"} the ${esc(R.name)}"` : "",
    }).replace("</div>", `</div>${badge}`)}
    ${stepper}${label ? `<div class="ms-card-label">${label}</div>` : ""}
  </div>`;
}

// Your own row in the lobby: a pencil to rename, which turns the row into a name field.
// Names are fixed once the game starts.
function myLobbyRow(p) {
  if (!ui.renaming) return playerRow(p, { extra: `<button class="ms-icon-btn ms-edit-name" data-act="edit-name" aria-label="Change your name" data-tooltip="Change your name">${icon("pencil")}</button>` });
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
  } else if (v.phase === "night") {
    head = `${moonArc(g)}<div class="ms-label">Night · turn ${g.stepIdx + 1} of ${g.steps.length} · ${countdown(g.stepEndsAt)} left</div>
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
        <div class="ms-hint">${acting ? "Acting now" : vote ? `Voted for ${esc(playerName(vote))}` : v.phase === "day" && o.dayReady[id] ? "Ready to vote" : ""}</div></div></div>
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
      ${o.log.length ? `<ol class="ms-log">${o.log.map((l) => `<li><span class="ms-label">${esc(NIGHT_STEPS.find((x) => x.id === l.step)?.label ?? "")}</span> ${esc(l.text)}</li>`).join("")}</ol>` : `<p class="ms-hint">Nothing has happened yet.</p>`}
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
    <p class="ms-lede">Slide the cover up to look at your card, or press and hold it. Keep your screen to yourself.</p>
    <div class="ms-peek" data-peek tabindex="0" role="button" aria-label="Slide up, or press and hold, to see your card">
      <div class="ms-peek-card">${card(g.myCard, { size: "lg", info: false })}</div>
      <div class="ms-peek-cover">${cardBack({ size: "lg" })}<span class="ms-peek-hint">${icon("chevronUp")} Slide up to look</span></div>
    </div>
    <div class="ms-after-peek ${ui.peeked ? "" : "is-hidden"}">
      <p class="ms-hint">You act as this card tonight, even if someone swaps it away from you. In the morning you're on the team of whatever card you hold.</p>
      <button class="ms-link" data-info="${g.myCard}" ${ui.peeked ? "" : "tabindex=\"-1\""}>What does the ${esc(ROLES[g.myCard].name)} do?</button>
    </div>
    <mike-footer></mike-footer>
  </main>
  ${bar(me?.ready
    ? `<div class="ms-bar-wait">Night falls when everyone is ready. Waiting for ${waiting.length ? esc(waitNames(waiting)) : "the night"}.</div>`
    : `<button class="ms-btn ms-primary ms-wide" data-act="ready" ${ui.peeked ? "" : "disabled"}>${ui.peeked ? "I'm ready for the night" : "Look at your card first"}</button>`)}`;
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

function moonArc(g) {
  const n = g.steps.length;
  const W = 320, H = 130, cx = W / 2, cy = 140, r = 128;
  const at = (t) => {
    const a = Math.PI * (1 - t);
    return [cx + r * Math.cos(a), cy - r * Math.sin(a)];
  };
  const t = n ? (g.stepIdx + 0.5) / n : 0.5;
  const [mx, my] = at(t);
  const ticks = g.steps.map((_, i) => {
    const [x, y] = at((i + 0.5) / n);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" class="${i < g.stepIdx ? "past" : i === g.stepIdx ? "now" : "next"}"/>`;
  }).join("");
  const [x0, y0] = at(0), [x1, y1] = at(1);
  return `<svg class="ms-arc" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <path d="M${x0} ${y0} A${r} ${r} 0 0 1 ${x1} ${y1}" class="ms-arc-path"/>
    ${ticks}
    <g class="ms-arc-moon" style="transform:translate(${mx.toFixed(1)}px,${my.toFixed(1)}px)">
      <circle r="15" fill="var(--moon)"/><circle cx="-5" cy="-3" r="3" fill="var(--moon-shade)"/><circle cx="5" cy="5" r="4" fill="var(--moon-shade)"/>
    </g>
  </svg>`;
}

function nightScreen() {
  const v = view;
  const g = v.game;
  const st = NIGHT_STEPS.find((s) => s.id === g.stepId);
  const p = g.prompt;
  let panel;
  if (p && !p.done) panel = promptPanel(p, g);
  else if (p && p.done) panel = `<div class="ms-panel ms-result">
      <div class="ms-label">${esc(st.label)}</div>
      ${p.result ? `<p>${esc(p.result.text)}</p>${resultCards(p.result.cards)}` : `<p>${esc(p.text)}</p>${resultCards(p.cards)}`}
      ${p.timedOut ? `<p class="ms-hint">Time ran out, so ${p.required ? "one was picked for you" : "you did nothing"}.</p>` : ""}
      <p class="ms-hint">Close your eyes again. The night goes on.</p>
    </div>`;
  else panel = `<p class="ms-lede">Keep your eyes on your own screen. When it's your turn, it shows up here.</p>
    <p class="ms-hint">Tap and scroll now and then, so nobody can tell when your turn comes.</p>`;
  return `<main class="ms-center ms-night ${p && !p.done ? "is-acting" : ""}">
    ${moonArc(g)}
    <div class="ms-label">Night · turn ${g.stepIdx + 1} of ${g.steps.length}${p && !p.done ? ` · ${countdown(g.stepEndsAt)} left` : ""}</div>
    <h1 class="ms-h1">${p && !p.done ? `Your turn: the ${esc(st.id === "wolves" ? "wolves" : st.label)}` : `The ${esc(st?.label ?? "night")} ${st?.id === "wolves" || st?.id === "masons" ? "are" : "is"} awake`}</h1>
    ${panel}
    <div class="ms-mycard">You started as ${wrap(card(g.myCard, { size: "xs", info: true }))}</div>
    <mike-footer></mike-footer>
  </main>`;
}

function resultCards(cards) {
  if (!cards?.length) return "";
  const swap = cards.some((c) => c.back);
  return `<div class="ms-row ms-result-cards">${cards.map((c) => wrap(c.back ? cardBack({ size: "sm", label: c.label }) : card(c.role, { size: "sm", label: c.label }))).join(swap ? icon("swap", "ms-ico ms-swap-ico") : "")}</div>`;
}

function promptPanel(p, g) {
  const v = view;
  const others = g.seats.filter((id) => !(p.exclude || []).includes(id));
  const sel = ui.sel;
  const csel = ui.center;
  const playerBtn = (id) => {
    const pl = v.players.find((x) => x.id === id);
    return `<button class="ms-target ${sel.includes(id) ? "is-on" : ""}" data-target="${id}">${avatar(pl.name, pl.id)}<span>${esc(pl.name)}</span></button>`;
  };
  const centerBtn = (i) => `<button class="ms-center-card ${csel.includes(i) ? "is-on" : ""}" data-center="${i}" aria-label="Center card ${i + 1}">${cardBack({ size: "sm" })}<span class="ms-card-label">Center ${i + 1}</span></button>`;
  const centers = `<div class="ms-row ms-centers">${[0, 1, 2].map(centerBtn).join("")}</div>`;
  let body = "", ready = false, confirm = "Confirm";
  switch (p.kind) {
    case "ack":
      body = resultCards(p.cards);
      ready = true; confirm = "Got it";
      break;
    case "center1":
      body = centers;
      ready = csel.length === 1;
      confirm = p.step === "sleepwalker" ? (ready ? `Swap with center ${csel[0] + 1}` : "Pick a center card") : (ready ? `Look at center ${csel[0] + 1}` : "Pick a center card");
      break;
    case "player":
      if (p.spare) {
        body = `<div class="ms-spare-row">
          ${wrap(`<div class="ms-card ms-sm" style="--team:${TEAMS.wolf.color}"><div class="ms-card-name">${N.werewolf}</div><div class="ms-card-art">${artSvg("werewolf")}</div></div>`, "")}
          <div class="ms-spare-text"><b>The spare ${N.werewolf} card</b><br>Separate from the 3 center cards.</div>
        </div>
        <div class="ms-label">Give it to</div>
        <div class="ms-targets">${others.map(playerBtn).join("")}</div>`;
        ready = sel.length === 1;
        confirm = ready ? `Give it to ${playerName(sel[0])}` : "Pick a player";
      } else {
        body = `<div class="ms-targets">${others.map(playerBtn).join("")}</div>`;
        ready = sel.length === 1;
        confirm = !ready ? "Pick a player" : p.step === "thief" ? `Swap with ${playerName(sel[0])}` : `Look at ${playerName(sel[0])}'s card`;
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
      ${p.optional ? `<button class="ms-btn" data-act="skip">Do nothing</button>` : ""}
      <button class="ms-btn ms-primary" data-act="confirm" ${ready ? "" : "disabled"}>${esc(confirm)}</button>
    </div>
    ${p.required ? `<div class="ms-hint ms-timer-line">When time runs out, one is picked for you.</div>` : ""}
  </div>`;
}

// ---- day

function nightNotes(g) {
  const items = g.info.length
    ? g.info.map((i) => `<li><span class="ms-label">${esc(NIGHT_STEPS.find((s) => s.id === i.step)?.label ?? "")}</span><p>${esc(i.text)}</p>${resultCards(i.cards)}</li>`).join("")
    : `<li><p>You slept through the night.</p></li>`;
  return `<section class="ms-panel">
    <h2 class="ms-h2">Your Night</h2>
    <div class="ms-mycard">You started as ${wrap(card(g.myCard, { size: "xs" }))}</div>
    <ul class="ms-notes">${items}</ul>
  </section>`;
}

// The Pack Leader's spare Werewolf card, drawn apart from the role cards.
function spareCard(label) {
  return `<div class="ms-cardwrap"><div class="ms-card ms-sm" style="--team:${TEAMS.wolf.color}"><div class="ms-card-name">${N.werewolf}</div><div class="ms-card-art">${artSvg("werewolf")}</div><button class="ms-info" data-info="spare" aria-label="About the spare ${N.werewolf} card">${icon("info")}</button></div><div class="ms-card-label">${label}</div></div>`;
}

function inGameStrip() {
  const v = view;
  return `<section>
    <h2 class="ms-h2">Cards in This Game</h2>
    <p class="ms-hint">In the order they wake up.</p>
    <div class="ms-row ms-deck-row">${ROLE_ORDER.filter((r) => v.roles[r]).map((r) => wrap(card(r, { size: "sm", label: v.roles[r] > 1 ? `×${v.roles[r]}` : "" }))).join("")}
    ${v.game.hasSpare ? spareCard("Spare") : ""}
    </div>
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
      <p class="ms-lede">Talk it over. When the timer runs out, or everyone's ready, you vote on who to kill.</p>
    </section>
    ${nightNotes(g)}
    ${inGameStrip()}
    <mike-footer></mike-footer>
  </main>
  ${bar(`<div class="ms-bar-note">${readyN} of ${seated.length} ready to vote</div>
    <button class="ms-btn ${me?.dayReady ? "" : "ms-primary"} ms-wide" data-act="dayready">${me?.dayReady ? "Not ready yet" : "Ready to vote"}</button>`)}`;
}

// ---- vote

function voteScreen() {
  const v = view;
  const g = v.game;
  const seated = v.players.filter((p) => p.seated);
  const live = seated.filter((p) => p.connected);
  const votedN = live.filter((p) => p.voted).length;
  const notYet = live.filter((p) => !p.voted);
  return `<main class="ms-page ms-vote">
    <section class="ms-dayhead">
      <div class="ms-label">${icon("vote", "ms-ico-sm")} Vote</div>
      <h1 class="ms-h1">Who dies?</h1>
      <p class="ms-lede">Pick a player. Whoever gets the most votes dies, and ties all die. If nobody gets more than one vote, nobody dies. You can change your vote until everyone has voted.</p>
    </section>
    <div class="ms-targets ms-vote-grid">
      ${seated.filter((p) => p.id !== myId).map((p) => `<button class="ms-target ${g.myVote === p.id ? "is-on" : ""}" data-vote="${p.id}">${avatar(p.name, p.id)}<span>${esc(p.name)}</span>${!p.connected ? icon("wifiOff", "ms-ico-sm") : ""}</button>`).join("")}
    </div>
    ${nightNotes(g)}
    <mike-footer></mike-footer>
  </main>
  ${bar(`<div class="ms-bar-wait">${votedN} of ${live.length} voted${notYet.length ? `. Waiting for ${esc(waitNames(notYet))}.` : ""}</div>`)}`;
}

// ---- results

function resultsScreen() {
  const v = view;
  const g = v.game;
  const r = g.result;
  const won = r.winners.includes(myId);
  const teamsWon = [r.village && "the village", r.wolfTeam && "the wolves", r.jester && `the ${N.jester}`].filter(Boolean);
  const headline = teamsWon.length ? `${cap(listNames(teamsWon))} ${teamsWon.length > 1 || teamsWon[0] === "the wolves" ? "win" : "wins"}` : "Nobody wins";
  const color = r.village ? TEAMS.village.color : r.wolfTeam ? TEAMS.wolf.color : r.jester ? TEAMS.jester.color : "var(--muted)";
  const deathLine = whyLine(r, g.seats);
  const rows = g.seats.map((id) => {
    const p = v.players.find((x) => x.id === id);
    const votes = r.counts[id] || 0;
    const dead = r.dead.includes(id);
    const win = r.winners.includes(id);
    const changed = r.dealt[id] !== r.cards[id];
    return `<li class="ms-res-row ${id === myId ? "is-me" : ""}">
      <div class="ms-res-who">
        ${avatar(p?.name ?? "?", id)}
        <div>
          <div class="ms-pname">${esc(p?.name ?? "?")}${id === myId ? ` <span class="ms-tag">you</span>` : ""}${p && !p.connected ? ` <span class="ms-tag ms-tag-off">${p.left ? "left" : "offline"}</span>` : ""}</div>
          <div class="ms-res-meta">${votes} vote${votes === 1 ? "" : "s"}${r.votes[id] ? ` · voted for ${esc(playerName(r.votes[id]))}` : " · didn't vote"}</div>
        </div>
        <div class="ms-res-flags">
          ${dead ? `<span class="ms-flag ms-flag-dead">${icon("skull", "ms-ico-sm")}died</span>` : ""}
          ${win ? `<span class="ms-flag ms-flag-win">${icon("check", "ms-ico-sm")}won</span>` : `<span class="ms-flag">lost</span>`}
        </div>
      </div>
      <div class="ms-res-cards">
        ${wrap(card(r.dealt[id], { size: "sm", label: "started" }))}
        ${changed ? `${icon("arrow", "ms-ico ms-res-arrow")}${wrap(card(r.cards[id], { size: "sm", label: "ended" }))}` : `<span class="ms-res-same">Same card at the end</span>`}
      </div>
    </li>`;
  }).join("");
  return `<main class="ms-page ms-results">
    <section class="ms-dayhead">
      <div class="ms-label">Morning</div>
      <h1 class="ms-h1 ms-headline" style="color:${color}">${esc(headline)}</h1>
      ${g.seated ? `<div class="ms-verdict ${won ? "is-won" : "is-lost"}">${won ? "You won" : "You lost"}</div>` : ""}
      <p class="ms-lede">${esc(deathLine)}</p>
    </section>
    <ul class="ms-res">${rows}</ul>
    <section>
      <h2 class="ms-h2">Center Cards at the End</h2>
      <div class="ms-row ms-res-center">
        <div class="ms-row">${r.center.map((c, i) => wrap(card(c, { size: "sm", label: `Center ${i + 1}` }))).join("")}</div>
        ${r.spare ? `<div class="ms-spare-slot">${wrap(card(r.spare, { size: "sm", label: "Spare slot" }))}</div>` : ""}
      </div>
    </section>
    <section class="ms-panel">
      <h2 class="ms-h2">What Happened in the Night</h2>
      ${r.log.length ? `<ol class="ms-log">${r.log.map((l) => `<li><span class="ms-label">${esc(NIGHT_STEPS.find((s) => s.id === l.step)?.label ?? "")}</span> ${esc(l.text)}</li>`).join("")}</ol>` : `<p class="ms-hint">Nobody moved or looked at a card.</p>`}
    </section>
    <mike-footer></mike-footer>
  </main>
  ${bar(v.isHost
    ? `<button class="ms-btn ms-primary ms-wide" data-act="again">Play again</button>`
    : `<div class="ms-bar-wait">Waiting for ${esc(playerName(v.hostId))} to start the next round</div>`)}`;
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);

// Who died and why that decides the game, in plain sentences.
function whyLine(r, seats) {
  const c = r.cards;
  const named = (ids) => listNames(ids.map(playerName));
  const parts = [];
  const shot = new Set(r.hunterShots.map(([, t]) => t));
  const voted = r.dead.filter((id) => !shot.has(id));
  if (!r.dead.length) parts.push("Nobody got more than one vote, so nobody died.");
  else if (voted.length > 1) parts.push(`${named(voted)} tied with ${r.counts[voted[0]]} votes each, so they all died.`);
  else parts.push(`${named(voted)} got the most votes and died.`);
  for (const [h, t] of r.hunterShots) parts.push(`${playerName(h)} was the ${N.hunter}, so ${playerName(t)}, who they voted for, died too.`);
  const deadAs = (pred) => r.dead.filter((id) => pred(c[id]));
  const wolves = deadAs((x) => ROLES[x].wolf);
  const scouts = deadAs((x) => x === "scout");
  const jesters = deadAs((x) => x === "jester");
  const anyWolf = seats.some((id) => ROLES[c[id]].wolf);
  const as = (ids, what) => `${named(ids)} ${ids.length > 1 ? "were" : "was"} ${what}`;
  if (jesters.length) parts.push(`${as(jesters, `the ${N.jester}`)}, so the ${N.jester} wins${anyWolf && !r.village ? " and the wolves can't" : ""}.`);
  if (r.village) {
    if (wolves.length) parts.push(`${as(wolves, wolves.length > 1 ? "wolves" : "a wolf")}, so the village wins.`);
    else if (scouts.length) parts.push(`${as(scouts, `the ${N.scout}`)}, so the village wins.`);
    else if (!anyWolf && !r.dead.length) parts.push("No player was a wolf and nobody died, so the village wins.");
    else parts.push(`${as(deadAs((x) => x === "lackey"), `the ${N.lackey}`)}, and no player was a wolf, so the village wins.`);
  } else if (r.wolfTeam) {
    parts.push(anyWolf ? "No wolf died, so the wolves win." : `No player was a wolf, and someone off the wolf team died, so the ${N.lackey} and ${N.scout} win.`);
  } else if (!anyWolf && r.dead.length && !jesters.length) {
    parts.push("No player was a wolf, so anyone dying meant the village lost.");
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
  if (panel.kind === "players" || panel.kind === "host") {
    if (!view || screen !== "room") { closePanel(); return; }
    if (panel.kind === "host" && !view.isHost) { closePanel(); return; }
  }
  let html = "";
  if (panel.kind === "players") html = playersPanel();
  else if (panel.kind === "host") html = hostPanel();
  else if (panel.kind === "cheatsheet") html = cheatsheetPanel();
  else if (panel.kind.startsWith("info:")) html = infoPanel(panel.kind.slice(5));
  else if (panel.kind === "howto") html = howtoPanel();
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
    <ul class="ms-players">${v.players.map((p) => playerRow(p, {
      extra: v.isHost && p.id !== myId
        ? (confirmKick === p.id
          ? `<span class="ms-kick-confirm">Kick ${esc(p.name)} from the room for good? <span class="ms-confirm-row"><button class="ms-btn ms-danger ms-sm-btn" data-kick="${p.id}">Kick from room</button><button class="ms-btn ms-sm-btn" data-act="kick-cancel">Cancel</button></span></span>`
          : `<button class="ms-icon-btn ms-kick" data-kick-ask="${p.id}" aria-label="Kick ${esc(p.name)} from the room" data-tooltip="Kick from room: removes ${esc(p.name)} and stops them rejoining">${icon("userX")}</button>`)
        : "",
    })).join("")}</ul>
${v.phase === "lobby" ? `    <form class="ms-rename" data-form="rename">
      <label class="ms-label" for="rename-input">Your name</label>
      <div class="ms-join-row">
        <input id="rename-input" class="ms-input" maxlength="20" value="${esc(myName)}" autocomplete="nickname" />
        <button class="ms-btn" type="submit">${icon("pencil")}<span>Rename</span></button>
      </div>
    </form>` : `<p class="ms-hint">You can change your name in the lobby, between games.</p>`}
    <button class="ms-btn ms-wide ms-leave" data-act="leave">${icon("logout")}<span>Leave room</span></button>
    ${v.isHost && v.players.length > 1 ? `<p class="ms-hint">If you leave, a random player becomes the host and the game carries on.</p>` : ""}`;
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
      ${ph === "deal" ? item("h-night", "Start the night now", missing ? `${missing} player${missing === 1 ? " hasn't" : "s haven't"} said they're ready.` : "Everyone is ready.") : ""}
      ${ph === "day" ? item("h-skipday", "Skip to the vote", "Ends the talking now, for everyone.") : ""}
      ${ph === "vote" ? item("h-endvote", "End the vote now", unvoted ? `${unvoted} player${unvoted === 1 ? " hasn't" : "s haven't"} voted. Their votes count as no vote.` : "Everyone has voted.") : ""}
      ${item("players", "Kick a player", "Opens the player list, where each player has a kick button.")}
      ${inRound ? item("h-reset", "Back to the lobby", "Ends this round for everyone, without results.", true) : ""}
      ${item("leave", "Leave and hand off hosting", inRound ? "A random player becomes the host. The round keeps going." : "A random player becomes the host and you leave the room.", true)}
    </div>`;
}

function cheatsheetPanel() {
  const roles = view?.roles || {};
  const inGame = ROLE_ORDER.filter((r) => roles[r]);
  const list = (inGame.length ? inGame : ROLE_ORDER);
  return `<h2 class="ms-h2">Cards in This Game</h2>
    <p class="ms-hint">In the order they wake up.</p>
    <ul class="ms-sheet">${list.map((r) => `<li><span class="ms-sheet-card">${card(r, { size: "sm", info: false })}</span><div><b style="color:${TEAMS[ROLES[r].team].color}">${esc(ROLES[r].name)}</b>${roles[r] > 1 ? ` <span class="ms-mono ms-muted">×${roles[r]}</span>` : ""}<p>${esc(ROLES[r].text)}</p>${ROLES[r].note ? `<p class="ms-hint">${esc(ROLES[r].note)}</p>` : ""}</div></li>`).join("")}</ul>
    <h2 class="ms-h2">Who Wins</h2>
    <ul class="ms-wins">${WIN_RULES.map(([t, txt]) => `<li><b style="color:${TEAMS[t].color}">${TEAMS[t].name}</b> ${esc(txt.replace(/^The .*? (?=wins )/, ""))}</li>`).join("")}</ul>
    <button class="ms-link" data-act="howto">How to play</button>`;
}

function infoPanel(r) {
  if (r === "spare") {
    return `<div class="ms-info-modal">
      ${wrap(`<div class="ms-card ms-lg" style="--team:${TEAMS.wolf.color}"><div class="ms-card-name">${N.werewolf}</div><div class="ms-card-art">${artSvg("werewolf")}</div><div class="ms-card-short">Spare card</div></div>`)}
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
      <div class="ms-label">${esc(T.name)}${R.wolf ? " · counts as a wolf" : ""} · ${stepIdx >= 0 ? `wakes ${ordinal(stepIdx + 1)} of ${steps.length}` : R.step ? "not in this game" : "doesn't wake up"}</div>
      <p>${esc(R.text)}</p>
      ${R.note ? `<p class="ms-hint">${esc(R.note)}</p>` : ""}
    </div>
  </div>`;
}
const ordinal = (n) => `${n}${["th", "st", "nd", "rd"][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10] || "th"}`;

function howtoPanel() {
  return `<h2 class="ms-h2">How to Play</h2>
    <p>Get everyone in the same room, each on their own phone. One person creates a room and the others join with the code.</p>
    <h3 class="ms-h3">The Deal</h3>
    <p>Everyone gets one secret card, and 3 more go face down in the center. Your card says which team you're on: the village or the wolves.</p>
    <h3 class="ms-h3">The Night</h3>
    <p>Cards wake up one at a time, and each can look at or swap cards. You act as the card you were dealt, but swaps mean you might end the night holding a different card without knowing it. Whatever card you hold in the morning is who you are.</p>
    <h3 class="ms-h3">The Day</h3>
    <p>Talk. Claim a card, or lie about it. Then everyone votes for someone to die. Whoever gets the most votes dies, and ties all die. If nobody gets two votes, nobody dies.</p>
    <h3 class="ms-h3">Winning</h3>
    <ul class="ms-wins">${WIN_RULES.map(([t, txt]) => `<li><b style="color:${TEAMS[t].color}">${TEAMS[t].name}</b> ${esc(txt.replace(/^The .*? (?=wins )/, ""))}</li>`).join("")}</ul>
    <p class="ms-hint">The game runs between your browsers with no server in the middle and no ads. If the host leaves, someone else takes over.</p>`;
}

// ---------------------------------------------------------------- input

function onSubmit(e) {
  const form = e.target.closest("[data-form]");
  if (!form) return;
  e.preventDefault();
  const kind = form.dataset.form;
  if (kind === "create" || kind === "join") {
    const n = E.cleanName(document.getElementById("name-input").value);
    if (!n) { toast("Type your name first"); document.getElementById("name-input").focus(); return; }
    myName = n; ls.set("onuw:name", n);
    if (kind === "create") createRoom();
    else joinAsGuest(roomCode, e.submitter?.dataset.as === "spectator" ? "spectator" : "player");
  }
  if (kind === "rename") {
    const n = E.cleanName(document.getElementById("rename-input").value);
    if (!n) { toast("Name can't be empty"); return; }
    myName = n; ls.set("onuw:name", n);
    send({ t: "rename", name: n });
    ui.renaming = false;
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
  if (d.vote) { send({ t: "vote", target: d.vote }); return; }
  if (d.kickAsk) { ui.confirmKick = d.kickAsk; refreshPanel(); return; }
  if (d.kick) { ui.confirmKick = null; send({ t: "hostKick", target: d.kick }); return; }
  switch (d.act) {
    case "home": leaveRoom(); return;
    case "retry": lostSince = null; joinAsGuest(roomCode); return;
    case "howto": openPanel("howto"); return;
    case "join-code": {
      const code = (document.getElementById("code-input").value || "").toUpperCase().replace(/[^A-Z]/g, "");
      if (code.length !== 4) { toast("Room codes are 4 letters"); return; }
      const n = E.cleanName(document.getElementById("name-input").value);
      if (!n) { toast("Type your name first"); document.getElementById("name-input").focus(); return; }
      myName = n; ls.set("onuw:name", n);
      roomCode = code; setRoomInUrl(code); render();
      return;
    }
    case "cheatsheet": openPanel("cheatsheet"); return;
    case "players": openPanel("players"); return;
    case "host": openPanel("host"); return;
    case "kick-cancel": ui.confirmKick = null; refreshPanel(); return;
    case "host-ask": ui.confirmHost = d.what; refreshPanel(); return;
    case "host-cancel": ui.confirmHost = null; refreshPanel(); return;
    case "leave": closePanel(); leaveRoom(); return;
    case "edit-name": {
      ui.renaming = true; render();
      const inp = document.getElementById("rename-input");
      if (inp) { inp.focus(); inp.select(); }
      return;
    }
    case "edit-name-cancel": ui.renaming = false; render(); return;
    case "spec-on": ss.set(joinedKey(roomCode), "spectator"); send({ t: "setSpectator", on: true }); return;
    case "spec-off": ss.set(joinedKey(roomCode), "player"); send({ t: "setSpectator", on: false }); return;
    case "invite": {
      const link = inviteLink();
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        navigator.share({ title: TITLE, text: `Join my ${TITLE} room ${roomCode}`, url: link }).catch(() => {});
      } else {
        navigator.clipboard?.writeText(link).then(() => toast("Invite link copied"), () => toast(link));
      }
      return;
    }
    case "suggest": send({ t: "suggestRoles" }); return;
    case "start": send({ t: "start" }); return;
    case "ready": send({ t: "peeked" }); return;
    case "skip": send({ t: "act", step: view.game.prompt.step, skip: true }); return;
    case "confirm": {
      const p = view.game.prompt;
      const msg = { t: "act", step: p.step };
      if (p.kind === "center1") msg.center = ui.center[0];
      else if (p.kind === "player") msg.target = ui.sel[0];
      else if (p.kind === "two") msg.targets = ui.sel;
      else if (p.kind === "seer") { if (ui.sel.length) msg.target = ui.sel[0]; else msg.center = ui.center; }
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
    const btn = app.querySelector('.ms-form button[type="submit"]');
    if (btn) btn.disabled = !E.cleanName(e.target.value);
  }
});

// Look at your card: slide the cover up with a finger (it springs back when you let go),
// or press and hold without moving (the cover lifts all the way). Space/Enter held does the same.
const peek = { on: false, y0: 0, dy: 0, moved: false, held: false, timer: 0 };
const coverEl = () => app.querySelector(".ms-peek-cover");
function setCover(dy, animate) {
  const c = coverEl();
  if (!c) return;
  c.style.transition = animate ? "" : "none";
  c.style.transform = dy ? `translateY(${dy}px)` : "";
  peek.dy = dy;
  const h = c.offsetHeight || 1;
  if (-dy > h * 0.45) ui.peeked = true;
}
function liftAll() { const c = coverEl(); if (c) setCover(-(c.offsetHeight + 12), true); }
function endPeek() {
  if (!peek.on) return;
  clearTimeout(peek.timer);
  peek.on = false;
  const wasPeeked = ui.peeked, nudge = !peek.moved && !peek.held;
  setCover(0, true);
  if (nudge && !wasPeeked) { const c = coverEl(); c?.classList.remove("is-nudge"); void c?.offsetWidth; c?.classList.add("is-nudge"); }
  if (wasPeeked) { app._html = null; setTimeout(render, 260); }   // enables "ready" once the cover is back
}
app.addEventListener("pointerdown", (e) => {
  if (!e.target.closest("[data-peek]")) return;
  e.preventDefault();
  Object.assign(peek, { on: true, y0: e.clientY, dy: 0, moved: false, held: false });
  peek.timer = setTimeout(() => { if (peek.on && !peek.moved) { peek.held = true; liftAll(); } }, 320);
});
window.addEventListener("pointermove", (e) => {
  if (!peek.on || peek.held) return;
  const dy = Math.min(0, e.clientY - peek.y0);
  if (Math.abs(dy) > 6) peek.moved = true;
  if (peek.moved) setCover(dy, false);
});
window.addEventListener("pointerup", endPeek);
window.addEventListener("pointercancel", endPeek);
window.addEventListener("blur", endPeek);
app.addEventListener("keydown", (e) => {
  if (e.target.closest("[data-peek]") && (e.key === " " || e.key === "Enter")) {
    e.preventDefault();
    if (!peek.on) { Object.assign(peek, { on: true, moved: true, held: true }); liftAll(); }
  }
});
app.addEventListener("keyup", (e) => { if (e.key === " " || e.key === "Enter") endPeek(); });
app.addEventListener("contextmenu", (e) => { if (e.target.closest("[data-peek]")) e.preventDefault(); });

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
window.__onuw = { get view() { return view; }, get mode() { return mode; }, get state() { return S; }, send, publish };
