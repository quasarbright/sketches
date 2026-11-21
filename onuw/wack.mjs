// Whack-a-wolf: a little game for players who are waiting during the night. Wolves pop out of hay
// bales and you bonk them; now and then a villager pops up instead, and bonking one costs you.
// It all happens on this phone (nothing is sent), and it closes by itself when your turn comes.
// It lives in its own overlay outside #app, because the night screen is rebuilt every second.

const ROUND_MS = 30000;
const BEST_KEY = "onuw:wack-best";
const HOLES = 9;

const css = `
.wk { position: fixed; inset: 0; z-index: 9000; display: flex; flex-direction: column; align-items: center;
  background: radial-gradient(120% 80% at 50% 0%, #1c2350 0%, #0b0f24 55%, #05070f 100%); color: var(--text, #eef);
  font-family: var(--font-ui, system-ui); padding: max(12px, env(safe-area-inset-top)) 16px 16px; overflow: hidden;
  touch-action: manipulation; user-select: none; -webkit-user-select: none; animation: wk-in .28s cubic-bezier(.2,.9,.3,1.2); }
@keyframes wk-in { from { opacity: 0; transform: scale(.96); } }
.wk.is-shaking { animation: wk-shake .32s; }
@keyframes wk-shake { 20% { transform: translate(-7px, 2px) rotate(-.6deg); } 40% { transform: translate(6px, -2px) rotate(.5deg); }
  60% { transform: translate(-4px, 1px); } 80% { transform: translate(3px, 0); } }
.wk-top { width: min(460px, 100%); display: flex; align-items: center; gap: 12px; }
.wk-title { font: 650 1.35rem/1 var(--font-display, Georgia); color: var(--accent, #f1e2b8); flex: 1; }
.wk-score { font: 800 1.5rem/1 var(--font-mono, monospace); min-width: 2.5ch; text-align: right; display: inline-block; }
.wk-score.is-bump { animation: wk-bump .3s cubic-bezier(.2,.9,.3,1.6); }
.wk-score.is-ouch { animation: wk-ouch .35s; color: #ff8c8c; }
@keyframes wk-bump { 40% { transform: scale(1.45) rotate(-6deg); color: #ffe08a; } }
@keyframes wk-ouch { 30% { transform: scale(.8) translateY(3px); } }
.wk-close { width: 44px; height: 44px; border-radius: 12px; border: 1px solid var(--border, #334); background: var(--panel, #141a33); color: inherit;
  display: grid; place-items: center; cursor: pointer; padding: 0; }
.wk-close svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
.wk-time { width: min(460px, 100%); height: 6px; border-radius: 99px; background: #ffffff1a; margin: 12px 0 6px; overflow: hidden; }
.wk-time i { display: block; height: 100%; width: 100%; background: var(--accent, #f1e2b8); transform-origin: left; border-radius: inherit; }
.wk-hint { font-size: .85rem; color: var(--muted, #99a); margin: 0 0 6px; text-align: center; }
.wk-board { position: relative; width: min(460px, 100%, 62vh); aspect-ratio: 1; display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 4% 3%; margin: auto 0; cursor: none; }
.wk-board::before { content: ""; position: absolute; inset: -6% -10%; border-radius: 50%;
  background: radial-gradient(closest-side, #1f3a2a 0%, #15291e 60%, transparent 100%); z-index: -1; }
.wk-hole { position: relative; }
.wk-pit { position: absolute; left: 6%; right: 6%; top: -34%; bottom: 34%; overflow: hidden; }
.wk-sprite { position: absolute; left: 0; right: 0; bottom: 0; height: 100%; transform: translateY(105%); transform-origin: 50% 100%; }
.wk-sprite svg { width: 100%; height: 100%; display: block; overflow: visible; }
.wk-hole.is-up .wk-sprite { transform: none; animation: wk-pop .34s cubic-bezier(.3,1.5,.5,1) both; }
@keyframes wk-pop { 0% { transform: translateY(105%) scale(1.25, .6); } 55% { transform: translateY(-6%) scale(.86, 1.18); }
  78% { transform: translateY(2%) scale(1.08, .92); } 100% { transform: none; } }
.wk-hole.is-taunt .wk-sprite { animation: wk-taunt .5s ease-in-out; }
@keyframes wk-taunt { 25% { transform: rotate(-9deg); } 50% { transform: rotate(8deg); } 75% { transform: rotate(-4deg); } }
.wk-hole.is-ducking .wk-sprite { animation: wk-duck .22s cubic-bezier(.6,-.4,.8,.6) forwards; }
@keyframes wk-duck { 0% { transform: none; } 35% { transform: translateY(-6%) scale(.92, 1.1); } 100% { transform: translateY(105%) scale(1.1, .8); } }
.wk-hole.is-bonked .wk-sprite { animation: wk-bonk .75s cubic-bezier(.3,.7,.4,1) forwards; }
@keyframes wk-bonk { 0% { transform: scale(1.35, .5); } 14% { transform: scale(.85, 1.15) rotate(10deg); } 28% { transform: scale(1.06, .95) rotate(-8deg); }
  42% { transform: rotate(5deg); } 56% { transform: rotate(-3deg); } 70% { transform: none; } 100% { transform: translateY(105%) scale(1.15, .75); } }
.wk-eyes-x { display: none; }
.wk-hole.is-bonked .wk-eyes { display: none; }
.wk-hole.is-bonked .wk-eyes-x { display: inline; }
.wk-bale { position: absolute; left: 0; right: 0; bottom: 0; height: 52%; transform-origin: 50% 100%; }
.wk-bale svg { width: 100%; height: 100%; display: block; }
.wk-hole.is-hit .wk-bale { animation: wk-bale .35s cubic-bezier(.3,1.6,.5,1); }
@keyframes wk-bale { 30% { transform: scale(1.08, .86); } 65% { transform: scale(.97, 1.04); } }
.wk-fx { position: absolute; inset: -20% -10% 30%; pointer-events: none; }
.wk-star { position: absolute; left: 50%; top: 45%; width: 18%; aspect-ratio: 1; margin: -9% 0 0 -9%; color: #ffe08a;
  animation: wk-star .6s cubic-bezier(.15,.8,.3,1) forwards; }
.wk-star svg { width: 100%; height: 100%; display: block; fill: currentColor; }
@keyframes wk-star { 0% { transform: translate(0, 0) scale(.3) rotate(0); opacity: 1; }
  70% { opacity: 1; } 100% { transform: translate(var(--dx), var(--dy)) scale(1) rotate(var(--r)); opacity: 0; } }
.wk-ring { position: absolute; left: 50%; top: 50%; width: 70%; aspect-ratio: 1; margin: -35% 0 0 -35%; border-radius: 50%;
  border: 3px solid #ffe08a; animation: wk-ring .35s ease-out forwards; }
@keyframes wk-ring { from { transform: scale(.2); opacity: 1; } to { transform: scale(1.2); opacity: 0; } }
.wk-pop { position: absolute; left: 50%; top: 20%; transform: translateX(-50%); font: 800 1.5rem/1 var(--font-mono, monospace); color: #ffe08a;
  text-shadow: 0 2px 0 #00000080; animation: wk-float .75s cubic-bezier(.2,.8,.3,1) forwards; white-space: nowrap; }
.wk-pop.is-bad { color: #ff8c8c; }
@keyframes wk-float { 0% { transform: translate(-50%, 10px) scale(.5); opacity: 0; } 20% { transform: translate(-50%, -6px) scale(1.25); opacity: 1; }
  100% { transform: translate(-50%, -48px) scale(1); opacity: 0; } }
.wk-mallet { position: fixed; z-index: 9001; width: 76px; height: 76px; margin: -18px 0 0 -38px; pointer-events: none; transform-origin: 50% 96%;
  transform: rotate(38deg); transition: transform .14s ease-out, opacity .2s; opacity: 0; filter: drop-shadow(0 4px 4px #0008); }
.wk-mallet.is-on { opacity: 1; }
.wk-mallet.is-swing { transition: transform .06s cubic-bezier(.5,0,1,.5); transform: rotate(-6deg); }
.wk-end { position: absolute; inset: 0; display: grid; place-items: center; background: #05070fcc; animation: wk-in .3s; z-index: 5; }
.wk-end > div { text-align: center; padding: 22px; }
.wk-end h2 { font: 650 1.7rem/1.15 var(--font-display, Georgia); margin: 0 0 8px; color: var(--accent, #f1e2b8); }
.wk-end p { color: var(--muted, #99a); margin: 0 0 16px; }
.wk-end b { color: var(--text, #eef); }
@media (prefers-reduced-motion: reduce) {
  .wk-hole.is-up .wk-sprite, .wk-hole.is-bonked .wk-sprite, .wk-hole.is-ducking .wk-sprite, .wk-hole.is-taunt .wk-sprite { animation-duration: .01s; }
}
`;

// Sprites, drawn as flat silhouettes with a few lighter lines, like the card art.
const WOLF = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <path d="M14 100 C14 70 20 52 28 44 L22 8 L42 30 Q50 27 58 30 L78 8 L72 44 C80 52 86 70 86 100 Z" fill="#3b2a3a"/>
  <path d="M28 14 L38 31 L31 36 Z M72 14 L62 31 L69 36 Z" fill="#6b4458"/>
  <path d="M34 62 Q50 54 66 62 L60 80 Q50 88 40 80 Z" fill="#4c3549"/>
  <ellipse cx="50" cy="66" rx="7" ry="5" fill="#140c14"/>
  <path d="M42 82 Q50 86 58 82" stroke="#f3e6d0" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <path d="M44 81 L45.5 86 L47 81.6 M53 81.6 L54.5 86 L56 81" fill="#f3e6d0"/>
  <g class="wk-eyes"><path d="M31 50 Q37 43 43 49 Q37 53 31 50 Z M57 49 Q63 43 69 50 Q63 53 57 49 Z" fill="#ffd34d"/>
    <circle cx="38" cy="49" r="2" fill="#140c14"/><circle cx="62" cy="49" r="2" fill="#140c14"/></g>
  <g class="wk-eyes-x" stroke="#ffd34d" stroke-width="3.2" stroke-linecap="round"><path d="M32 44 L42 53 M42 44 L32 53 M58 44 L68 53 M68 44 L58 53"/></g>
</svg>`;
const VILLAGER = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <path d="M18 100 C18 82 30 74 50 74 C70 74 82 82 82 100 Z" fill="#5b7a3a"/>
  <circle cx="50" cy="52" r="24" fill="#e9b98c"/>
  <circle cx="35" cy="60" r="5" fill="#f19c86" opacity=".7"/><circle cx="65" cy="60" r="5" fill="#f19c86" opacity=".7"/>
  <path d="M10 36 Q50 20 90 36 Q78 40 70 38 L66 14 Q50 6 34 14 L30 38 Q22 40 10 36 Z" fill="#d6a54a"/>
  <path d="M31 31 Q50 25 69 31" stroke="#a87a2c" stroke-width="3" fill="none"/>
  <g class="wk-eyes"><circle cx="41" cy="52" r="3" fill="#2b1a12"/><circle cx="59" cy="52" r="3" fill="#2b1a12"/></g>
  <g class="wk-eyes-x" stroke="#2b1a12" stroke-width="2.6" stroke-linecap="round"><path d="M37 48 L45 56 M45 48 L37 56 M55 48 L63 56 M63 48 L55 56"/></g>
  <path d="M43 63 Q50 69 57 63" stroke="#7a3b2a" stroke-width="2.4" fill="none" stroke-linecap="round"/>
</svg>`;
const BALE = `<svg viewBox="0 0 100 52" preserveAspectRatio="none" aria-hidden="true">
  <rect x="2" y="4" width="96" height="46" rx="10" fill="#c99a3f"/>
  <rect x="2" y="4" width="96" height="12" rx="8" fill="#e2b75a"/>
  <path d="M10 22 L24 20 M30 30 L46 27 M56 22 L70 24 M74 34 L90 31 M14 40 L28 38 M44 42 L60 40" stroke="#9c7426" stroke-width="2" stroke-linecap="round"/>
  <path d="M30 4 V50 M70 4 V50" stroke="#7d5a1c" stroke-width="3"/>
</svg>`;
const STAR = `<svg viewBox="0 0 24 24"><path d="M12 1.5 14.9 8.6 22.5 9.2 16.7 14.2 18.5 21.6 12 17.6 5.5 21.6 7.3 14.2 1.5 9.2 9.1 8.6Z"/></svg>`;
const MALLET = `<svg viewBox="0 0 80 80" aria-hidden="true">
  <rect x="36" y="26" width="8" height="52" rx="3" fill="#8a5a2b"/>
  <rect x="12" y="6" width="56" height="26" rx="8" fill="#b87a3c"/>
  <rect x="12" y="6" width="56" height="8" rx="4" fill="#d89a58"/>
  <rect x="12" y="6" width="9" height="26" rx="4" fill="#9c6630"/><rect x="59" y="6" width="9" height="26" rx="4" fill="#9c6630"/>
</svg>`;
const X = `<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>`;

let el = null, mallet = null, opts = {};
const st = { score: 0, best: 0, startedAt: 0, holes: [], timers: [], spawnTimer: 0, tick: 0, auto: true, over: false };

function bestGet() { try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; } }
function bestSet(n) { try { localStorage.setItem(BEST_KEY, String(n)); } catch {} }

export const isOpen = () => !!el;

export function openWack(o = {}) {
  if (el) return;
  opts = o;
  if (!document.getElementById("wk-css")) {
    const s = document.createElement("style"); s.id = "wk-css"; s.textContent = css; document.head.appendChild(s);
  }
  el = document.createElement("div");
  el.className = "wk";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Whack-a-wolf");
  el.innerHTML = `<div class="wk-top"><div class="wk-title">Whack-a-wolf</div><span class="wk-score" aria-live="polite">0</span>
      <button class="wk-close" data-wk="close" aria-label="Close the game">${X}</button></div>
    <div class="wk-time"><i></i></div>
    <p class="wk-hint">Bonk the wolves. Leave the villagers alone. It closes when your turn comes.</p>
    <div class="wk-board">${Array.from({ length: HOLES }, (_, i) => `<div class="wk-hole" data-hole="${i}">
      <div class="wk-pit"><div class="wk-sprite"></div></div><div class="wk-bale">${BALE}</div><div class="wk-fx"></div></div>`).join("")}</div>`;
  document.body.appendChild(el);
  mallet = document.createElement("div");
  mallet.className = "wk-mallet";
  mallet.innerHTML = MALLET;
  document.body.appendChild(mallet);
  el.addEventListener("pointerdown", onDown);
  el.addEventListener("pointermove", onMove);
  el.addEventListener("click", (e) => { const a = e.target.closest("[data-wk]")?.dataset.wk; if (a === "close") closeWack(); if (a === "again") start(); });
  addEventListener("keydown", onKey);
  start();
}

export function closeWack() {
  if (!el) return;
  stopAll();
  removeEventListener("keydown", onKey);
  el.remove(); mallet?.remove();
  el = null; mallet = null;
  opts.onClose?.();
}

function onKey(e) { if (e.key === "Escape") closeWack(); }

function stopAll() {
  clearTimeout(st.spawnTimer); cancelAnimationFrame(st.tick);
  st.timers.forEach(clearTimeout); st.timers = [];
}
const later = (fn, ms) => { st.timers.push(setTimeout(fn, ms)); };

function start() {
  stopAll();
  el.querySelector(".wk-end")?.remove();
  Object.assign(st, { score: 0, best: bestGet(), startedAt: performance.now(), over: false, holes: Array.from({ length: HOLES }, () => ({ kind: null, state: "down", id: 0 })) });
  el.querySelectorAll(".wk-hole").forEach((h) => { h.className = "wk-hole"; h.querySelector(".wk-sprite").innerHTML = ""; });
  setScore(0);
  const tick = () => {
    const left = Math.max(0, 1 - (performance.now() - st.startedAt) / ROUND_MS);
    const bar = el?.querySelector(".wk-time i");
    if (bar) bar.style.transform = `scaleX(${left})`;
    if (left <= 0) return end();
    st.tick = requestAnimationFrame(tick);
  };
  st.tick = requestAnimationFrame(tick);
  if (st.auto) scheduleSpawn(500);
}

function progress() { return Math.min(1, (performance.now() - st.startedAt) / ROUND_MS); }

function scheduleSpawn(ms) {
  st.spawnTimer = setTimeout(() => {
    if (!el || st.over) return;
    const free = st.holes.map((h, i) => (h.state === "down" ? i : -1)).filter((i) => i >= 0);
    if (free.length) spawn(free[Math.floor(Math.random() * free.length)], Math.random() < 0.22 ? "villager" : "wolf");
    const p = progress();
    scheduleSpawn(820 - 420 * p + Math.random() * 260);
  }, ms);
}

// Pops a wolf or villager out of hole i. Exposed for tests.
export function spawn(i, kind = "wolf", stayMs) {
  const h = st.holes[i], node = el?.querySelector(`[data-hole="${i}"]`);
  if (!h || !node || h.state !== "down") return;
  const id = ++h.id;
  Object.assign(h, { kind, state: "up" });
  node.querySelector(".wk-sprite").innerHTML = kind === "wolf" ? WOLF : VILLAGER;
  node.className = "wk-hole is-up";
  node.dataset.kind = kind;
  const stay = stayMs ?? 1150 - 500 * progress() + Math.random() * 250;
  // a wolf you missed sticks its tongue out at you (a little wiggle) before it ducks
  if (kind === "wolf") later(() => { if (h.id === id && h.state === "up") { node.classList.add("is-taunt"); } }, Math.max(0, stay - 520));
  later(() => { if (h.id === id && h.state === "up") duck(i); }, stay);
}

function duck(i) {
  const h = st.holes[i], node = el?.querySelector(`[data-hole="${i}"]`);
  if (!node) return;
  h.state = "leaving";
  node.className = "wk-hole is-ducking";
  const id = h.id;
  later(() => { if (h.id === id) { h.state = "down"; h.kind = null; node.className = "wk-hole"; } }, 230);
}

function bonk(i, x, y) {
  const h = st.holes[i], node = el.querySelector(`[data-hole="${i}"]`);
  if (h.state !== "up") return;
  h.state = "bonked";
  const id = h.id;
  node.className = "wk-hole is-bonked is-hit";
  const fx = node.querySelector(".wk-fx");
  if (h.kind === "wolf") {
    setScore(st.score + 1, "bump");
    burst(fx, 7);
    pop(fx, "+1");
    try { navigator.vibrate?.(18); } catch {}
  } else {
    setScore(st.score - 2, "ouch");
    pop(fx, "Ow! −2", true);
    el.classList.remove("is-shaking"); void el.offsetWidth; el.classList.add("is-shaking");
    try { navigator.vibrate?.([30, 40, 30]); } catch {}
  }
  later(() => { if (h.id === id) { h.state = "down"; h.kind = null; node.className = "wk-hole"; } }, 760);
}

function burst(fx, n) {
  const ring = document.createElement("div"); ring.className = "wk-ring"; fx.appendChild(ring);
  later(() => ring.remove(), 400);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + Math.random() * 0.5 - Math.PI / 2;
    const d = 70 + Math.random() * 45;
    const s = document.createElement("span");
    s.className = "wk-star";
    s.innerHTML = STAR;
    s.style.setProperty("--dx", `${Math.cos(a) * d}%`);
    s.style.setProperty("--dy", `${Math.sin(a) * d}%`);
    s.style.setProperty("--r", `${Math.round((Math.random() - 0.5) * 540)}deg`);
    s.style.width = `${12 + Math.random() * 10}%`;
    if (k % 3 === 1) s.style.color = "#fff6dc";
    fx.appendChild(s);
    later(() => s.remove(), 650);
  }
}

function pop(fx, text, bad = false) {
  const p = document.createElement("div");
  p.className = `wk-pop${bad ? " is-bad" : ""}`;
  p.textContent = text;
  fx.appendChild(p);
  later(() => p.remove(), 800);
}

function setScore(n, how) {
  st.score = n;
  const s = el.querySelector(".wk-score");
  s.textContent = String(n);
  if (how) { s.classList.remove("is-bump", "is-ouch"); void s.offsetWidth; s.classList.add(`is-${how}`); }
}

function end() {
  st.over = true;
  clearTimeout(st.spawnTimer);
  const best = Math.max(st.best, st.score);
  const isNew = st.score > st.best && st.score > 0;
  bestSet(best);
  const end = document.createElement("div");
  end.className = "wk-end";
  end.innerHTML = `<div><h2>${isNew ? "New best!" : "Time's up"}</h2>
    <p>You scored <b>${st.score}</b>. Your best is <b>${best}</b>.</p>
    <button class="ms-btn ms-primary" data-wk="again">Play again</button></div>`;
  el.appendChild(end);
}

function moveMallet(e) {
  if (!mallet) return;
  mallet.style.left = `${e.clientX}px`;
  mallet.style.top = `${e.clientY}px`;
}
function onMove(e) {
  const onBoard = !!e.target.closest(".wk-board") && !st.over;
  mallet?.classList.toggle("is-on", onBoard);
  moveMallet(e);
}
function onDown(e) {
  if (st.over || !e.target.closest(".wk-board")) return;
  moveMallet(e);
  mallet.classList.add("is-on", "is-swing");
  later(() => mallet?.classList.remove("is-swing"), 110);
  if (e.pointerType !== "mouse") later(() => mallet?.classList.remove("is-on"), 380);
  const hole = e.target.closest("[data-hole]");
  if (hole) bonk(Number(hole.dataset.hole), e.clientX, e.clientY);
}

// For tests: stop the random spawning so a test can place wolves itself.
export function setAuto(on) { st.auto = on; if (!on) clearTimeout(st.spawnTimer); }
export const score = () => st.score;
