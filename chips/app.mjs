// chips: the page. One person's browser hosts the table (it holds the state and runs every
// request through core.mjs's rules); everyone else connects to it peer-to-peer and asks.
//
// URL: chips/#CODE. The host's page keeps the table in localStorage, so a reload picks it back up;
// a player's page keeps a secret seat token, so a reload (or a dropped connection) sits them
// back down in the same seat.
//
// Wire messages, player → host:  hello{token} · join{token,name,color} · act{rid,action}
//                 host → player:  lobby{state} · welcome{you,state} · state{state} · ack{rid,error}
//                                 joinError{error} · kicked · ended

import {
  COLORS, COLOR_NAMES, MAX_NAME, apply, newTable, player, pot, stack, sameRef, freeColors, total,
  cleanName, setOnline, randomId, headIndex, canRewindTo, publicState, refundShares,
} from "./core.mjs";
import { transport } from "./net.mjs";

const qs = new URLSearchParams(location.search);
const net = transport(qs.get("net"));
// Device-wide settings (not per tab, not per table).
const SETTINGS_KEY = "chips:settings";
function settings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; } }
function saveSettings(x) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings(), ...x })); } catch {} }

// Storage namespace. Normally every tab on a device is the same person. With the "each tab is a
// different player" setting on (for testing on one phone), each open tab claims a numbered slot (a
// Web Lock held while the tab lives): slot 0 is the plain namespace, every extra tab gets its own.
// ?ns= sets it outright (the browser tests).
let NS = "chips:", tabSlot = 0;
async function claimSlot() {
  if (qs.get("ns")) { NS = "chips:" + qs.get("ns") + ":"; return; }
  if (!settings().tabsArePlayers || !navigator.locks) return;
  let want = null;
  try { want = sessionStorage.getItem("chips:slot") || null; } catch {}
  const grab = (n) => new Promise((res) => {
    navigator.locks.request("chips-slot-" + n, { ifAvailable: true }, (lock) => {
      if (lock) held.add(n);
      res(!!lock);
      return lock ? new Promise(() => {}) : undefined; // hold it until the tab goes away
    }).catch(() => res(false));
  });
  let slot = +want || 0;
  // after a reload the old page may still hold this tab's slot for a moment: wait for it
  const tries = want == null ? 1 : 8;
  for (let i = 0; i < tries && !(await grab(slot)); i++) if (i < tries - 1) await new Promise((r) => setTimeout(r, 150));
  if (!held.has(slot)) for (slot = 0; slot < 50 && !(await grab(slot)); slot++);
  try { sessionStorage.setItem("chips:slot", slot); } catch {}
  tabSlot = slot;
  if (slot) NS = "chips:tab" + slot + ":";
}
const held = new Set();
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(NS + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(NS + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(NS + k); } catch {} },
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (n) => Number(n).toLocaleString("en-US");
const chipHTML = (color, cls = "") => `<span class="chip ${cls}" style="--c:${color}"><i></i></span>`;
const buzz = (ms = 12) => { try { navigator.vibrate?.(ms); } catch {} };

let S = null;          // the table, as last seen
let me = null;         // my player id
let isHost = false;
let code = "";

/* ------------------------------------------------------------------ *
 * screens
 * ------------------------------------------------------------------ */

const SCREENS = ["landing", "connecting", "unreachable", "join", "gone", "table"];
let screen = null;
function show(name) {
  screen = name;
  for (const s of SCREENS) $("#" + s).hidden = s !== name;
  $("#cornerSettings").hidden = name === "table";
  scrollTo(0, 0);
  if (name === "table") requestAnimationFrame(fitDock);
}

function boot() {
  code = location.hash.slice(1).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!code) return showLanding();
  const saved = store.get("host:" + code);
  if (saved?.state) startHost(saved);
  else startClient();
}
addEventListener("hashchange", () => location.reload());

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const genCode = () => Array.from({ length: 5 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
const tableURL = () => {
  const q = new URLSearchParams(location.search); q.delete("ns");
  return location.origin + location.pathname + (q.size ? "?" + q : "") + "#" + code;
};

function remember(entry) {
  const list = (store.get("recent") || []).filter((r) => r.code !== entry.code);
  list.unshift({ ...entry, ts: Date.now() });
  store.set("recent", list.slice(0, 6));
}
function forget(c) { store.set("recent", (store.get("recent") || []).filter((r) => r.code !== c)); }

/* ---------- color picker (landing, join, edit-me) ---------- */

function colorPicker(el, { taken = [], selected, onPick }) {
  let sel = selected && !taken.includes(selected) ? selected : COLORS.find((c) => !taken.includes(c));
  const render = (tk = taken) => {
    taken = tk;
    if (taken.includes(sel)) sel = COLORS.find((c) => !taken.includes(c));
    el.innerHTML = COLORS.map((c) =>
      `<button type="button" class="color" data-c="${c}" aria-label="${COLOR_NAMES[c]}" aria-pressed="${c === sel}" ${taken.includes(c) ? "disabled" : ""}>${chipHTML(c)}</button>`).join("");
  };
  el.addEventListener("click", (e) => {
    const b = e.target.closest(".color");
    if (!b || b.disabled) return;
    sel = b.dataset.c; buzz(8);
    $$(".color", el).forEach((x) => x.setAttribute("aria-pressed", x.dataset.c === sel));
    onPick?.(sel);
  });
  render();
  return { get value() { return sel; }, update: render };
}

/* ---------- landing ---------- */

let landingPicker;
function showLanding() {
  const f = $("#createForm"), prof = store.get("profile") || {};
  f.name.value = prof.name || "";
  f.start.value = prof.start ?? 1000;
  landingPicker ||= colorPicker($("[data-colors]", f), { selected: prof.color });
  const recent = store.get("recent") || [];
  $("#recent").hidden = !recent.length;
  $("#recent [data-list]").innerHTML = recent.map((r) =>
    `<a href="#${esc(r.code)}">${chipHTML(r.color || "#888", "sm")}<span><b>${esc(r.code)}</b> · ${esc(r.title || "")}</span><small>${r.host ? "hosting" : "playing"}</small></a>`).join("");
  show("landing");
}

$("#createForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target, name = cleanName(f.name.value);
  const start = parseInt(f.start.value.replace(/\D/g, ""), 10);
  const err = $("[data-err]", f);
  if (!name) { err.textContent = "What should everyone call you?"; f.name.focus(); return; }
  if (!Number.isSafeInteger(start)) { err.textContent = "How many chips does everyone start with?"; f.start.focus(); return; }
  store.set("profile", { name, color: landingPicker.value, start });
  code = genCode();
  const state = newTable({ code, host: { name, color: landingPicker.value }, start });
  store.set("host:" + code, { state, tokens: {} });
  history.pushState(null, "", "#" + code);
  startHost({ state, tokens: {} });
});

$("#codeForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target, raw = f.code.value.trim();
  // a pasted link works too: take what's after the #
  const c = (raw.includes("#") ? raw.slice(raw.lastIndexOf("#") + 1) : raw).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (c.length !== 5) { $("[data-err]", f).textContent = "Codes are 5 letters, like K7QXM."; f.code.focus(); return; }
  location.hash = c;
});
$("#codeForm").code.addEventListener("input", (e) => {
  $("#codeForm [data-err]").textContent = "";
  if (/^[a-z0-9]{5}$/i.test(e.target.value.trim())) $("#codeForm").requestSubmit();
});

$$("[data-home]").forEach((b) => b.addEventListener("click", () => { location.hash = ""; }));

/* ------------------------------------------------------------------ *
 * hosting
 * ------------------------------------------------------------------ */

let tokens = {};             // secret seat token → player id (never broadcast)
const conns = new Set();     // { c, pid }

async function startHost(saved) {
  isHost = true;
  S = saved.state; tokens = saved.tokens || {}; me = S.hostId;
  for (const p of S.players) p.online = p.id === me;
  persist();
  remember({ code, host: true, color: player(S, me).color, title: "your table" });
  showTable();
  try {
    await net.host(code, {
      onConn: hostConn,
      onStatus: (st, msg) => setBanner(st === "online" ? null : st === "error" ? msg : "Opening the table to players…", st === "error"),
    });
  } catch (e) { setBanner(e.message, true); }
}

function persist() { if (isHost) store.set("host:" + code, { state: S, tokens }); }
function broadcast(msg) { for (const x of conns) try { x.c.send(msg); } catch {} }
function commit(next) {
  if (next === S) return;
  S = next; persist(); broadcast({ t: "state", state: publicState(S) }); render();
}

function hostConn(c) {
  const x = { c, pid: null };
  conns.add(x);
  c.on("data", (m) => { try { hostMsg(x, m); } catch (e) { console.error(e); } });
  c.on("close", () => {
    conns.delete(x);
    if (x.pid && ![...conns].some((o) => o.pid === x.pid)) commit(setOnline(S, x.pid, false));
  });
}

function seat(x, pid) {
  x.pid = pid;
  x.c.send({ t: "welcome", you: pid, state: publicState(S) });
  commit(setOnline(S, pid, true));
}

function hostMsg(x, m) {
  if (!m || typeof m !== "object") return;
  const known = typeof m.token === "string" && m.token.length >= 16 && tokens[m.token];
  if (m.t === "hello") {
    if (known && player(S, known)) seat(x, known);
    else x.c.send({ t: "lobby", state: publicState(S) });
  } else if (m.t === "join") {
    if (typeof m.token !== "string" || m.token.length < 16) return;
    if (known && player(S, known)) return seat(x, known);
    const id = randomId();
    const r = apply(S, { type: "join", id, name: m.name, color: m.color }, id);
    if (r.error) return x.c.send({ t: "joinError", error: r.error });
    tokens[m.token] = id;
    x.pid = id;
    commit(r.state); // everyone sees the new player
    seat(x, id);
  } else if (m.t === "act") {
    if (!x.pid) return x.c.send({ t: "ack", rid: m.rid, error: "Not seated." });
    const error = hostAct(m.action, x.pid);
    x.c.send({ t: "ack", rid: m.rid, error });
  }
}

// run an action through the rules for `actor`; returns an error message or null
function hostAct(action, actor) {
  if (!action || typeof action !== "object") return "Bad request.";
  const r = apply(S, action, actor);
  if (r.error) return r.error;
  if (action.type === "removePlayer") {
    for (const [t, id] of Object.entries(tokens)) if (id === action.id) delete tokens[t];
    for (const x of conns) if (x.pid === action.id) { try { x.c.send({ t: "kicked" }); } catch {} x.pid = null; setTimeout(() => x.c.close(), 300); }
  }
  commit(r.state);
  return null;
}

/* ------------------------------------------------------------------ *
 * joining someone else's table
 * ------------------------------------------------------------------ */

let conn = null, connecting = false, retryTimer = 0, retryDelay = 1000, ended = false;
const pending = new Map();
let ridSeq = 0;

function myToken() {
  let t = store.get("token:" + code);
  if (!t) {
    t = (crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join(""));
    store.set("token:" + code, t);
  }
  return t;
}

function startClient() {
  isHost = false;
  $("#connecting [data-msg]").textContent = `Finding table ${code}…`;
  show("connecting");
  connectClient();
}

async function connectClient() {
  if (connecting || conn || ended) return;
  connecting = true; clearTimeout(retryTimer);
  let c;
  try { c = await net.join(code); }
  catch (e) {
    connecting = false;
    if (screen === "connecting" || screen === "unreachable") {
      $("#unreachable [data-code]").textContent = code;
      show("unreachable");
      retryTimer = setTimeout(connectClient, 5000);
    } else {
      setBanner("Lost the host. Reconnecting…");
      retryTimer = setTimeout(connectClient, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 8000);
    }
    return;
  }
  connecting = false; conn = c; retryDelay = 1000;
  c.on("data", clientMsg);
  c.on("close", () => {
    if (conn !== c) return;
    conn = null;
    for (const [, p] of pending) p("Lost the connection — try again.");
    pending.clear();
    if (ended) return;
    if (screen === "table") setBanner("Lost the host. Reconnecting…");
    retryTimer = setTimeout(connectClient, retryDelay);
  });
  c.send({ t: "hello", token: myToken() });
}
$("#unreachable [data-retry]").addEventListener("click", () => {
  $("#connecting [data-msg]").textContent = `Finding table ${code}…`;
  show("connecting"); connectClient();
});
const wake = () => { if (!isHost && code && !conn && !connecting && !ended && screen !== "landing") connectClient(); };
document.addEventListener("visibilitychange", () => { if (!document.hidden) wake(); });
addEventListener("online", wake);
addEventListener("pageshow", wake);

function clientMsg(m) {
  if (!m || typeof m !== "object") return;
  if (m.t === "lobby") { S = m.state; showJoin(); }
  else if (m.t === "welcome") {
    me = m.you; S = m.state; setBanner(null);
    const p = player(S, me);
    store.set("profile", { ...(store.get("profile") || {}), name: p.name, color: p.color });
    remember({ code, host: false, color: p.color, title: `${player(S, S.hostId)?.name ?? "someone"}'s table` });
    if (screen !== "table") showTable(); else render();
  } else if (m.t === "state") {
    S = m.state;
    if (screen === "table") render();
    else if (screen === "join") joinPicker?.update(S.players.map((p) => p.color));
  } else if (m.t === "ack") { pending.get(m.rid)?.(m.error || null); pending.delete(m.rid); }
  else if (m.t === "joinError") { $("#joinForm [data-err]").textContent = m.error; joinBusy(false); }
  else if (m.t === "kicked") { store.del("token:" + code); forget(code); end("The host took you off the table."); }
  else if (m.t === "ended") { store.del("token:" + code); forget(code); end("The host closed this table."); }
}

function end(msg) {
  ended = true; closeSheet();
  try { conn?.close(); } catch {}
  $("#gone [data-msg]").textContent = msg;
  show("gone");
}

let joinPicker;
function showJoin() {
  const f = $("#joinForm"), prof = store.get("profile") || {};
  const host = player(S, S.hostId);
  $("#join [data-title]").innerHTML = `Join <b style="color:${host?.color}">${esc(host?.name ?? "the")}</b>'s table <b>${esc(code)}</b>. Everyone starts with <b>${fmt(S.start)}</b>.`;
  const taken = S.players.map((p) => p.color);
  if (screen !== "join") {
    f.name.value ||= prof.name || "";
    if (!joinPicker) joinPicker = colorPicker($("[data-colors]", f), { taken, selected: prof.color });
    else joinPicker.update(taken);
    show("join");
    if (!f.name.value) setTimeout(() => f.name.focus(), 50);
  } else joinPicker.update(taken);
  joinBusy(false);
  if (S.players.length >= COLORS.length) { $("[data-err]", f).textContent = "This table is full."; $("button[type=submit]", f).disabled = true; }
}
function joinBusy(b) { const btn = $("#joinForm button[type=submit]"); btn.disabled = b; btn.textContent = b ? "Sitting down…" : "Sit down"; }
$("#joinForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const f = e.target, name = cleanName(f.name.value);
  if (!name) { $("[data-err]", f).textContent = "What should everyone call you?"; f.name.focus(); return; }
  if (!conn) { $("[data-err]", f).textContent = "Lost the host — reconnecting…"; connectClient(); return; }
  $("[data-err]", f).textContent = "";
  joinBusy(true);
  conn.send({ t: "join", token: myToken(), name, color: joinPicker.value });
});

/* ------------------------------------------------------------------ *
 * acting: the host runs actions directly, players ask the host
 * ------------------------------------------------------------------ */

function act(action) {
  if (isHost) return Promise.resolve(hostAct(action, me));
  if (!conn) return Promise.resolve("Not connected to the host right now.");
  const rid = ++ridSeq;
  return new Promise((res) => {
    const t = setTimeout(() => { pending.delete(rid); res("The host didn't answer — try again."); }, 10000);
    pending.set(rid, (err) => { clearTimeout(t); res(err); });
    conn.send({ t: "act", rid, action });
  });
}
async function run(action, okMsg) {
  const err = await act(action);
  if (err) { toast(esc(err), true); buzz([30, 40, 30]); return false; }
  if (okMsg) toast(okMsg);
  buzz();
  return true;
}

/* ------------------------------------------------------------------ *
 * the table view
 * ------------------------------------------------------------------ */

let seenLog = new Set(), prevChips = new Map(), logLimit = 30;

function showTable() {
  seenLog = new Set(S.log.map((e) => e.id));
  prevChips = new Map();
  $("#codeTag").textContent = code;
  show("table");
  render();
}

function setBanner(msg, bad = false) {
  const b = $("#banner");
  b.hidden = !msg; b.classList.toggle("bad", bad);
  if (msg) $("[data-msg]", b).textContent = msg;
}

const nameOf = (ref) => stack(S, ref)?.name ?? "?";
const colorOf = (id) => player(S, id)?.color ?? "#888";

function render() {
  if (!S || screen !== "table") return;
  const mine = player(S, me);
  if (!mine) return;

  // pots
  const potsEl = $("#pots"), one = S.pots.length === 1;
  $("#potsTitle").textContent = S.pots.length > 1 ? "Pots" : "Pot";
  $("#addPotBtn").hidden = !isHost;
  $("#potsSec").hidden = !S.pots.length && !isHost;
  potsEl.innerHTML = S.pots.length
    ? S.pots.map((p) => `<button class="pot ${one ? "only" : ""} ${isHost ? "host" : ""}" data-pot="${p.id}" ${isHost ? "" : "tabindex=-1"}>
        ${isHost ? `<span class="hint">${p.chips ? "award ›" : "edit ›"}</span>` : ""}
        <span class="name">${esc(p.name)}</span><span class="amt" data-k="pot:${p.id}">${fmt(p.chips)}</span></button>`).join("")
    : `<div class="no-pots">No pots — just players. Add one any time.</div>`;

  // players: me first, then in seat order
  const order = [mine, ...S.players.filter((p) => p !== mine)];
  $("#players").innerHTML = order.map((p) => {
    const tags = [p.id === me ? "you" : "", p.id === S.hostId ? `<span class="tag-host">host</span>` : "", p.online ? "" : "offline"].filter(Boolean).join(" · ");
    const tappable = isHost || p.id === me;
    return `<button class="prow ${p.id === me ? "me" : ""} ${p.online ? "" : "off"}" data-player="${p.id}" ${tappable ? "" : "tabindex=-1"}>
      ${chipHTML(p.color)}<span class="who"><span class="nm">${esc(p.name)}</span><span class="tags">${tags}</span></span>
      <span class="n" data-k="p:${p.id}">${fmt(p.chips)}</span>${tappable ? `<span class="chev">›</span>` : ""}</button>`;
  }).join("");
  $("#playerCount").textContent = `${S.players.length} at the table`;
  $("#nudge").hidden = S.players.length > 1;

  // flash any stack that changed since the last render
  for (const el of $$("[data-k]")) {
    const k = el.dataset.k, [kind, id] = k.split(":"), now = stack(S, { k: kind, id })?.chips;
    const before = prevChips.get(k);
    if (before != null && before !== now) { el.classList.add(now > before ? "bump-up" : "bump-down"); }
  }
  prevChips = new Map([...S.players.map((p) => ["p:" + p.id, p.chips]), ...S.pots.map((p) => ["pot:" + p.id, p.chips])]);

  renderLog();
  $("#total").textContent = `${fmt(total(S))} chips on the table`;

  // toasts for chips that came my way from someone else
  for (const e of S.log) {
    if (seenLog.has(e.id)) continue;
    seenLog.add(e.id);
    if (e.delta?.["p:" + me] > 0 && !(e.parts[0]?.r === "p" && e.parts[0].id === me)) toastEntry(e);
    else if (isHost && e.parts[1] === " joined with ") toastEntry(e);
  }

  renderDock();
  sheetUpdate?.();
}

function partsHTML(parts) {
  return parts.map((x) => {
    if (typeof x === "string") return esc(x);
    if (x.a != null) return `<b class="a">${fmt(x.a)}</b>`;
    if (x.r === "p") { const p = player(S, x.id); return `<b style="color:${p?.color ?? x.c ?? "inherit"}">${esc(p?.name ?? x.n)}</b>`; }
    if (x.r === "pot") return `<b>${esc(pot(S, x.id)?.name ?? x.n)}</b>`;
    return "";
  }).join("");
}

function renderLog() {
  // the log is a timeline: entries after the head were rewound past, and show crossed out
  const h = headIndex(S), from = Math.max(0, S.log.length - logLimit);
  const time = (ts) => new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }).replace(/\s?[AP]M$/i, "");
  const btn = (e, i) => !isHost || i === h || !canRewindTo(S, e.id) ? ""
    : `<button class="tl" data-goto="${e.id}">${i < h ? "rewind to here" : "restore to here"}</button>`;
  $("#log").innerHTML = S.log.slice(from).map((e, k) => {
    const i = from + k;
    return `<li class="${i > h ? "rewound" : ""}"><span class="t">${time(e.ts)}</span><span class="x">${partsHTML(e.parts)}</span>${btn(e, i)}</li>`;
  }).reverse().join("")
    + (S.log.length > logLimit ? `<li><button class="more" data-more>Show more</button></li>` : "");
}

$("#log").addEventListener("click", async (e) => {
  if (e.target.closest("[data-more]")) { logLimit += 50; renderLog(); return; }
  const b = e.target.closest("[data-goto]");
  if (b) run({ type: "goto", entry: b.dataset.goto });
});

/* ---------- the dock: send chips from my stack ---------- */

let dest = null;      // ref the dock will send to
let destAuto = false; // dest was picked for them because there's only one pot

function quickAmounts(start) {
  if (start <= 200) return [1, 5, 10, 25];
  if (start <= 2000) return [5, 10, 25, 100];
  if (start <= 20000) return [25, 100, 500, 1000];
  return [100, 1000, 5000, 10000];
}

function destPills(refs, selected) {
  const pots = refs.filter((r) => r.k === "pot"), people = refs.filter((r) => r.k === "p");
  let h = "";
  if (pots.length) h += pots.map((r) => { const p = pot(S, r.id); return `<button type="button" class="dest pot-d" data-k="pot" data-id="${r.id}" aria-pressed="${sameRef(r, selected)}">${esc(p.name)} <small>${fmt(p.chips)}</small></button>`; }).join("");
  if (people.length) {
    h += `<span class="lbl ${pots.length ? "" : "first"}">${pots.length ? "or to" : "To"}</span>`;
    h += people.map((r) => { const p = player(S, r.id); return `<button type="button" class="dest" data-k="p" data-id="${r.id}" aria-pressed="${sameRef(r, selected)}">${chipHTML(p.color, "sm")}${esc(p.name)}</button>`; }).join("");
  }
  return h || `<span class="empty">Nowhere to send chips yet — invite someone.</span>`;
}
const allRefs = (exclude) => [...S.pots.map((p) => ({ k: "pot", id: p.id })), ...S.players.map((p) => ({ k: "p", id: p.id }))].filter((r) => !sameRef(r, exclude));

function renderDock() {
  const mine = player(S, me);
  const refs = allRefs({ k: "p", id: me });
  if (dest && (!stack(S, dest) || (destAuto && S.pots.length !== 1))) dest = null;
  if (!dest && S.pots.length === 1) { dest = { k: "pot", id: S.pots[0].id }; destAuto = true; }
  $("#myChips").textContent = fmt(mine.chips);
  const sc = $("#dests").scrollLeft;
  $("#dests").innerHTML = destPills(refs, dest);
  $("#dests").scrollLeft = sc;
  const qa = quickAmounts(S.start);
  const quick = $("#quick");
  if (quick.dataset.for !== qa.join()) {
    quick.dataset.for = qa.join();
    quick.innerHTML = qa.map((n) => `<button type="button" data-add="${n}">+${fmt(n)}</button>`).join("") + `<button type="button" class="all" data-all>All in</button>`;
  }
  dockState();
}

const amtIn = $("#amt");
const readAmt = (inp) => parseInt(inp.value.replace(/\D/g, ""), 10) || 0;
const writeAmt = (inp, n) => { inp.value = n ? fmt(n) : ""; };

function dockState() {
  const mine = player(S, me), a = readAmt(amtIn), btn = $("#sendBtn");
  const over = a > mine.chips;
  amtIn.classList.toggle("over", over);
  $("#why").textContent = over ? `that's more than you have` : "";
  let l1 = "Send", l2 = "";
  if (dest) {
    l1 = dest.k === "pot" ? (a && a === mine.chips ? "All in" : "Bet") : "Give";
    l2 = "→ " + nameOf(dest);
  } else l2 = S.pots.length > 1 ? "pick a pot" : "pick where";
  if (a) l1 += " " + fmt(a);
  $("[data-l1]", btn).textContent = l1;
  $("[data-l2]", btn).textContent = l2;
  btn.disabled = !dest || !a || over || dockBusy;
}

let dockBusy = false;
amtIn.addEventListener("input", () => {
  const pos = amtIn.value.length - amtIn.selectionStart;
  writeAmt(amtIn, readAmt(amtIn));
  try { amtIn.setSelectionRange(amtIn.value.length - pos, amtIn.value.length - pos); } catch {}
  dockState();
});
$("#amtClear").addEventListener("click", () => { writeAmt(amtIn, 0); dockState(); });
$("#quick").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const mine = player(S, me);
  writeAmt(amtIn, b.dataset.all != null ? mine.chips : Math.min(readAmt(amtIn) + +b.dataset.add, Math.max(mine.chips, readAmt(amtIn))));
  buzz(6); dockState();
});
$("#dests").addEventListener("click", (e) => {
  const b = e.target.closest(".dest");
  if (!b) return;
  const r = { k: b.dataset.k, id: b.dataset.id };
  // with one pot it's always the default; tapping it again does nothing, tapping a player toggles
  dest = sameRef(r, dest) && !(S.pots.length === 1 && r.k === "pot") ? null : r;
  destAuto = false;
  buzz(6); renderDock();
});
$("#dock").addEventListener("submit", async (e) => {
  e.preventDefault();
  const a = readAmt(amtIn);
  if (!dest || !a || dockBusy) return;
  dockBusy = true; dockState();
  const to = dest;
  const ok = await run({ type: "transfer", from: { k: "p", id: me }, to, amount: a });
  dockBusy = false;
  if (ok) {
    writeAmt(amtIn, 0);
    // a single pot stays selected; anything else has to be chosen again next time
    if (!(to.k === "pot" && S.pots.length === 1)) dest = null;
    amtIn.blur();
  }
  renderDock();
});

// keep the page's bottom clear of the dock
function fitDock() { const h = $("#dock").offsetHeight; $("#wrap").style.paddingBottom = h + 16 + "px"; }
new ResizeObserver(fitDock).observe($("#dock"));
// iOS leaves fixed elements behind the keyboard; ride the visual viewport instead
if (window.visualViewport) {
  const ride = () => {
    const vv = visualViewport, gap = Math.max(0, innerHeight - vv.height - vv.offsetTop);
    $("#dock").style.transform = gap > 40 ? `translateY(${-gap}px)` : "";
  };
  visualViewport.addEventListener("resize", ride);
  visualViewport.addEventListener("scroll", ride);
}

/* ---------- taps on pots and players ---------- */

$("#pots").addEventListener("click", (e) => { const b = e.target.closest("[data-pot]"); if (b && isHost) potSheet(b.dataset.pot); });
$("#players").addEventListener("click", (e) => {
  const b = e.target.closest("[data-player]");
  if (!b) return;
  if (b.dataset.player === me) meSheet();
  else if (isHost) playerSheet(b.dataset.player);
});
$("#addPotBtn").addEventListener("click", () => addPotSheet());
$("#inviteBtn").addEventListener("click", inviteSheet);
$("#codeTag").addEventListener("click", inviteSheet);
$("[data-invite]", $("#nudge")).addEventListener("click", inviteSheet);
$("#menuBtn").addEventListener("click", menuSheet);
$$("[data-settings]").forEach((b) => b.addEventListener("click", settingsSheet));

/* ------------------------------------------------------------------ *
 * sheets
 * ------------------------------------------------------------------ */

let sheetClose = null, sheetUpdate = null;
function openSheet(html, { update, onClose } = {}) {
  closeSheet();
  const back = document.createElement("div");
  back.className = "sheet-back";
  back.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  const el = $(".sheet", back);
  const close = () => {
    if (sheetClose !== close) return;
    sheetClose = sheetUpdate = null;
    back.remove(); removeEventListener("keydown", onKey); onClose?.();
  };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  back.addEventListener("click", (e) => { if (e.target === back || e.target.closest("[data-close]")) close(); });
  addEventListener("keydown", onKey);
  document.body.appendChild(back);
  sheetClose = close;
  sheetUpdate = update ? () => { if (update(el) === false) close(); } : null;
  return { el, close };
}
function closeSheet() { sheetClose?.(); }
const head = (title, right = "") => `<div class="sheet-head"><h3>${title}</h3>${right}<button class="x" data-close aria-label="Close">×</button></div>`;

function confirmSheet(title, body, ok = "OK", danger = false) {
  return new Promise((res) => {
    let answered = false;
    const { el, close } = openSheet(`${head(esc(title))}<p>${body}</p>
      <div class="row"><button class="btn-soft" style="flex:1" data-close>Cancel</button><button class="btn-big ${danger ? "btn-danger" : ""}" style="flex:1;${danger ? "background:var(--danger);color:#2a0008" : ""}" data-ok>${esc(ok)}</button></div>`,
      { onClose: () => { if (!answered) res(false); } });
    $("[data-ok]", el).addEventListener("click", () => { answered = true; close(); res(true); });
  });
}

// an amount field with an "all" button, inside a sheet
const amountField = (name, max, label = "All") => `<div class="row" style="margin-bottom:10px">
  <input class="text" data-amt="${name}" inputmode="numeric" placeholder="Amount" />
  <button type="button" class="btn-soft" data-max="${name}">${label}${max != null ? ` <span class="muted">${fmt(max)}</span>` : ""}</button></div>`;
function wireAmounts(el, getMax, onChange) {
  for (const inp of $$("[data-amt]", el)) inp.addEventListener("input", () => { writeAmt(inp, readAmt(inp)); onChange?.(); });
  for (const b of $$("[data-max]", el)) b.addEventListener("click", () => { writeAmt($(`[data-amt="${b.dataset.max}"]`, el), getMax(b.dataset.max)); onChange?.(); });
}

// a destination picker inside a sheet
function sheetDests(holder, exclude, onChange) {
  let sel = null;
  const draw = () => {
    if (sel && !stack(S, sel)) sel = null;
    holder.innerHTML = destPills(allRefs(exclude), sel);
  };
  holder.addEventListener("click", (e) => {
    const b = e.target.closest(".dest");
    if (!b) return;
    const r = { k: b.dataset.k, id: b.dataset.id };
    sel = sameRef(r, sel) ? null : r; buzz(6); draw(); onChange?.();
  });
  draw();
  return { get value() { return sel; }, draw };
}

/* ---------- a pot (host) ---------- */

function potSheet(id) {
  const winners = new Set();
  const { el, close } = openSheet(`
    ${head(`<span data-name></span>`, `<span class="big" data-chips></span>`)}
    <div class="block" data-award-block>
      <h4>Who won it?</h4>
      <div class="winners" data-winners></div>
      <div class="preview" data-preview></div>
      <button class="btn-big" data-award disabled>Award</button>
      <button class="btn-soft refund" data-refund>Refund <small data-refund-note></small></button>
    </div>
    <details><summary>Move some chips</summary><div>
      ${amountField("move", null)}
      <div class="dests" data-dests></div>
      <button class="btn-soft" style="width:100%" data-move>Move</button>
    </div></details>
    <details><summary>Change the pot's chip count</summary><div><p>Type its new total. The difference is added or taken away, not moved from anyone, so the table total changes.</p><div class="row">
      <input class="text" data-amt="set" inputmode="numeric" placeholder="New total" />
      <button class="btn-soft" data-set>Set</button></div></div></details>
    <details><summary>Rename</summary><div><div class="row">
      <input class="text" data-rename maxlength="${MAX_NAME}" />
      <button class="btn-soft" data-save>Save</button></div></div></details>
    <details><summary>Remove this pot</summary><div>
      <p data-rm-note></p>
      <button class="btn-soft btn-danger" style="width:100%" data-remove>Remove pot</button></div></details>`, {
    update: () => { if (!pot(S, id)) return false; draw(); },
  });
  const ref = { k: "pot", id };
  $("[data-rename]", el).value = pot(S, id).name;
  const dests = sheetDests($("[data-dests]", el), ref, () => moveBtn());
  wireAmounts(el, () => pot(S, id).chips, () => moveBtn());

  const moveBtn = () => {
    const a = readAmt($("[data-amt=move]", el)), b = $("[data-move]", el), p = pot(S, id);
    b.disabled = !a || !dests.value || a > p.chips;
    b.textContent = !dests.value ? "Move" : `Move ${a ? fmt(a) + " " : ""}→ ${nameOf(dests.value)}`;
  };
  const preview = () => {
    const p = pot(S, id), n = winners.size, btn = $("[data-award]", el), pv = $("[data-preview]", el);
    const share = n ? Math.floor(p.chips / n) : 0, left = p.chips - share * n;
    btn.disabled = !n || !share;
    if (!p.chips) { pv.textContent = "This pot is empty."; btn.textContent = "Award"; return; }
    if (!n) { pv.textContent = "Tap the winner. Tap more than one to split it."; btn.textContent = "Award"; return; }
    if (!share) { pv.textContent = `Not enough chips to split ${n} ways.`; return; }
    const names = [...winners].map((w) => player(S, w)?.name);
    pv.textContent = n === 1 ? `${names[0]} gets all ${fmt(p.chips)}.` : `${fmt(share)} each${left ? ` · ${fmt(left)} stays in the pot` : ""}.`;
    btn.textContent = n === 1 ? `Give it to ${names[0]}` : n === S.players.length ? `Split between everyone` : `Split ${n} ways`;
  };
  const draw = () => {
    const p = pot(S, id);
    for (const w of [...winners]) if (!player(S, w)) winners.delete(w);
    $("[data-name]", el).textContent = p.name;
    $("[data-chips]", el).textContent = fmt(p.chips);
    const all = S.players.length > 1 && winners.size === S.players.length;
    $("[data-winners]", el).innerHTML = S.players.map((q) => `<button class="winner" data-w="${q.id}" aria-pressed="${winners.has(q.id)}">${chipHTML(q.color)}<span>${esc(q.name)}</span></button>`).join("")
      + (S.players.length > 1 ? `<button class="winner everyone" data-everyone aria-pressed="${all}">Everyone</button>` : "");
    $("[data-max]", el).innerHTML = `All <span class="muted">${fmt(p.chips)}</span>`;
    $("[data-rm-note]", el).textContent = p.chips ? "Award or move its chips first." : S.pots.length === 1 ? "With no pots, it's just players and their chips. You can add one back any time." : "It's empty, so nothing is lost.";
    $("[data-remove]", el).disabled = !!p.chips;
    const shares = refundShares(S, id);
    $("[data-refund]", el).disabled = !shares.length;
    $("[data-refund-note]", el).textContent = shares.length
      ? shares.map(([w, n]) => `${player(S, w).name} ${fmt(n)}`).join(" · ")
      : "nothing to give back";
    dests.draw(); preview(); moveBtn();
  };
  $("[data-winners]", el).addEventListener("click", (e) => {
    const b = e.target.closest(".winner");
    if (!b) return;
    if (b.dataset.everyone != null) {
      if (winners.size === S.players.length) winners.clear(); else S.players.forEach((q) => winners.add(q.id));
    } else if (winners.has(b.dataset.w)) winners.delete(b.dataset.w); else winners.add(b.dataset.w);
    buzz(6); draw();
  });
  $("[data-refund]", el).addEventListener("click", async () => {
    if (await run({ type: "refund", pot: id })) close();
  });
  $("[data-award]", el).addEventListener("click", async () => {
    if (await run({ type: "award", pot: id, winners: [...winners] })) close();
  });
  $("[data-move]", el).addEventListener("click", async () => {
    if (await run({ type: "transfer", from: ref, to: dests.value, amount: readAmt($("[data-amt=move]", el)) })) close();
  });
  $("[data-set]", el).addEventListener("click", async () => {
    const v = $("[data-amt=set]", el).value; if (!v) return;
    if (await run({ type: "setChips", target: ref, amount: readAmt($("[data-amt=set]", el)) })) close();
  });
  $("[data-save]", el).addEventListener("click", async () => { if (await run({ type: "renamePot", id, name: $("[data-rename]", el).value }, "Renamed")) close(); });
  $("[data-remove]", el).addEventListener("click", async () => { if (await run({ type: "removePot", id })) close(); });
  draw();
}

function addPotSheet() {
  const suggestion = S.pots.length ? (S.pots.some((p) => p.name === "Side pot") ? "" : "Side pot") : "Pot";
  const { el, close } = openSheet(`${head("Add a pot")}
    <label class="field"><span>Name</span><input class="text" data-name maxlength="${MAX_NAME}" placeholder="${esc(suggestion || "Side pot 2")}" /></label>
    <p>${S.pots.length ? "With more than one pot, players pick which pot each bet goes into." : "Bets will go straight into it."}</p>
    <button class="btn-big" data-add>Add pot</button>`);
  const go = async () => { if (await run({ type: "addPot", name: $("[data-name]", el).value })) close(); };
  $("[data-add]", el).addEventListener("click", go);
  $("[data-name]", el).addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
}

/* ---------- another player (host) ---------- */

function playerSheet(id) {
  const ref = { k: "p", id };
  const { el, close } = openSheet(`
    ${head(`<span data-name></span>`, `<span class="big" data-chips></span>`)}
    <div class="block"><h4>Move their chips</h4>
      ${amountField("move", null)}
      <div class="dests" data-dests></div>
      <button class="btn-big" data-move disabled>Move</button></div>
    <details><summary>Change their chip count</summary><div><p>Type their new total. The difference is added or taken away, not moved from anyone, so the table total changes. For buy-ins, rebuys, or fixing a mistake.</p><div class="row">
      <input class="text" data-amt="set" inputmode="numeric" placeholder="New total" />
      <button class="btn-soft" data-set>Set</button></div></div></details>
    <details><summary>Take them off the table</summary><div>
      <p data-rm-note></p>
      <button class="btn-soft btn-danger" style="width:100%" data-remove>Kick from table</button></div></details>`, {
    update: () => { if (!player(S, id)) return false; draw(); },
  });
  const dests = sheetDests($("[data-dests]", el), ref, () => moveBtn());
  wireAmounts(el, () => player(S, id).chips, () => moveBtn());
  const moveBtn = () => {
    const a = readAmt($("[data-amt=move]", el)), b = $("[data-move]", el), p = player(S, id);
    b.disabled = !a || !dests.value || a > p.chips;
    b.textContent = !dests.value ? "Pick where they go" : `Move ${a ? fmt(a) + " " : ""}→ ${nameOf(dests.value)}`;
  };
  const draw = () => {
    const p = player(S, id);
    $("[data-name]", el).innerHTML = `${chipHTML(p.color, "sm")} ${esc(p.name)}`;
    $("[data-chips]", el).textContent = fmt(p.chips);
    $("[data-max]", el).innerHTML = `All <span class="muted">${fmt(p.chips)}</span>`;
    $("[data-rm-note]", el).textContent = p.chips
      ? `Their ${fmt(p.chips)} chips leave with them. Move them somewhere first if they should stay.`
      : `Frees up their color. They can rejoin with the link.`;
    dests.draw(); moveBtn();
  };
  $("[data-move]", el).addEventListener("click", async () => {
    if (await run({ type: "transfer", from: ref, to: dests.value, amount: readAmt($("[data-amt=move]", el)) })) close();
  });
  $("[data-set]", el).addEventListener("click", async () => {
    if (!$("[data-amt=set]", el).value) return;
    if (await run({ type: "setChips", target: ref, amount: readAmt($("[data-amt=set]", el)) })) close();
  });
  $("[data-remove]", el).addEventListener("click", async () => {
    const p = player(S, id);
    if (await confirmSheet(`Kick ${p.name} from the table?`, esc($("[data-rm-note]", el)?.textContent || ""), "Kick from table", true)) run({ type: "removePlayer", id });
  });
  draw();
}

/* ---------- me ---------- */

function meSheet() {
  const p = player(S, me);
  const { el, close } = openSheet(`${head("You")}
    <label class="field"><span>Name</span><input class="text" data-name maxlength="${MAX_NAME}" /></label>
    <div class="field"><span>Color</span><div class="colors" data-colors></div></div>
    <button class="btn-big" data-save>Save</button>
    ${isHost ? `<details style="margin-top:18px"><summary>Change your chip count</summary><div><p>Type your new total. The difference is added or taken away, so the table total changes.</p><div class="row">
      <input class="text" data-amt="set" inputmode="numeric" placeholder="New total" />
      <button class="btn-soft" data-set>Set</button></div></div></details>` : ""}`, {
    update: () => picker.update(S.players.filter((q) => q.id !== me).map((q) => q.color)),
  });
  $("[data-name]", el).value = p.name;
  const picker = colorPicker($("[data-colors]", el), { taken: S.players.filter((q) => q.id !== me).map((q) => q.color), selected: p.color });
  $("[data-save]", el).addEventListener("click", async () => {
    if (await run({ type: "editMe", name: $("[data-name]", el).value, color: picker.value })) {
      store.set("profile", { ...(store.get("profile") || {}), name: cleanName($("[data-name]", el).value), color: picker.value });
      close();
    }
  });
  $("[data-amt=set]", el)?.addEventListener("input", (e) => writeAmt(e.target, readAmt(e.target)));
  $("[data-set]", el)?.addEventListener("click", async () => {
    if (!$("[data-amt=set]", el).value) return;
    if (await run({ type: "setChips", target: { k: "p", id: me }, amount: readAmt($("[data-amt=set]", el)) })) close();
  });
}

/* ---------- invite ---------- */

let qrLib;
const loadQR = () => (qrLib ||= new Promise((res, rej) => {
  if (window.qrcode) return res(window.qrcode);
  const s = document.createElement("script");
  s.src = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js";
  s.onload = () => res(window.qrcode); s.onerror = () => { qrLib = null; rej(); };
  document.head.appendChild(s);
}));

function inviteSheet() {
  const url = tableURL();
  const { el } = openSheet(`${head("Invite players")}
    <p>Anyone who opens this link sits down at the table. Or have them scan the code.</p>
    <div class="qr" data-qr></div>
    <div class="link-box">${esc(url)}</div>
    <div class="row">
      <button class="btn-big" style="flex:1" data-copy>Copy link</button>
      ${navigator.share ? `<button class="btn-soft" style="flex:1" data-share>Share…</button>` : ""}
    </div>`);
  loadQR().then((qrcode) => {
    const q = qrcode(0, "M"); q.addData(url); q.make();
    $("[data-qr]", el).innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  }).catch(() => { $("[data-qr]", el).hidden = true; });
  $("[data-copy]", el).addEventListener("click", async (e) => {
    try { await navigator.clipboard.writeText(url); e.target.textContent = "Copied!"; buzz(); }
    catch { e.target.textContent = "Select the link above"; }
    setTimeout(() => { e.target.textContent = "Copy link"; }, 1800);
  });
  $("[data-share]", el)?.addEventListener("click", () => {
    navigator.share({ title: "chips", text: `Join my table on chips`, url }).catch(() => {});
  });
}

/* ---------- menu ---------- */

function menuSheet() {
  const { el, close } = openSheet(`${head(`Table ${esc(code)}`)}
    <div class="menu-list">
      <button class="btn-soft" data-m="invite">Invite players</button>
      <button class="btn-soft" data-m="me">Change your name or color</button>
      ${isHost ? `
      <button class="btn-soft" data-m="pot">Add a pot</button>
      <button class="btn-soft" data-m="start">New players start with <span class="hint">${fmt(S.start)}</span></button>
      <button class="btn-soft" data-m="home">Leave this page <span class="hint">the table stays open in “Your tables”</span></button>
      <button class="btn-soft btn-danger" data-m="end">Close the table for everyone</button>`
      : `<button class="btn-soft" data-m="home">Leave <span class="hint">your seat stays — reopen the link to come back</span></button>`}
    </div>`);
  el.addEventListener("click", async (e) => {
    const m = e.target.closest("[data-m]")?.dataset.m;
    if (!m) return;
    if (m === "invite") inviteSheet();
    else if (m === "me") meSheet();
    else if (m === "pot") addPotSheet();
    else if (m === "start") startSheet();
    else if (m === "home") { close(); location.hash = ""; }
    else if (m === "end") {
      if (await confirmSheet("Close the table?", "Everyone gets sent away and the chip counts are gone for good.", "Close table", true)) {
        broadcast({ t: "ended" });
        store.del("host:" + code); forget(code);
        setTimeout(() => { location.hash = ""; }, 300);
      }
    }
  });
}

function settingsSheet() {
  const on = !!settings().tabsArePlayers;
  const { el } = openSheet(`${head("Settings")}
    <button class="switch-row" role="switch" aria-checked="${on}" data-tabs>
      <span><b>Each tab is a different player</b><small>For trying out a table alone on one device. When it's off, every tab on this device is you.</small></span>
      <span class="switch"></span>
    </button>
    ${on && !qs.get("ns") ? `<p style="margin:12px 2px 0">This tab is ${tabSlot ? `player tab ${tabSlot + 1}` : "your main tab"}.</p>` : ""}`);
  $("[data-tabs]", el).addEventListener("click", (e) => {
    const b = e.currentTarget, next = b.getAttribute("aria-checked") !== "true";
    b.setAttribute("aria-checked", next);
    saveSettings({ tabsArePlayers: next });
    try { sessionStorage.setItem("chips:slot", ""); } catch {}
    // who this tab is gets decided on load
    setTimeout(() => location.reload(), 250);
  });
}

function startSheet() {
  const { el, close } = openSheet(`${head("Starting chips")}
    <p>What each new player sits down with. Doesn't change anyone already here.</p>
    <div class="row"><input class="text" data-amt="start" inputmode="numeric" /><button class="btn-big" style="width:auto;padding:0 22px" data-save>Save</button></div>`);
  writeAmt($("[data-amt=start]", el), S.start);
  wireAmounts(el, () => 0);
  $("[data-save]", el).addEventListener("click", async () => { if (await run({ type: "setStart", amount: readAmt($("[data-amt=start]", el)) }, "Saved")) close(); });
}

/* ------------------------------------------------------------------ *
 * toasts
 * ------------------------------------------------------------------ */

function toast(html, bad = false) {
  const t = document.createElement("div");
  t.className = "toast" + (bad ? " bad" : "");
  t.innerHTML = html;
  $("#toasts").appendChild(t);
  while ($("#toasts").children.length > 3) $("#toasts").firstChild.remove();
  setTimeout(() => { t.style.transition = "opacity .3s"; t.style.opacity = "0"; setTimeout(() => t.remove(), 300); }, bad ? 3500 : 2800);
}
function toastEntry(e) {
  if (!e) return;
  toast(e.parts.map((x) => typeof x === "string" ? esc(x) : x.a != null ? `<b class="a">${fmt(x.a)}</b>` : `<b>${esc(stack(S, { k: x.r, id: x.id })?.name ?? x.n)}</b>`).join(""));
}

// for the browser tests: send a raw request, as a tampered page could
window.chipsTest = { act };

claimSlot().then(boot, boot);
