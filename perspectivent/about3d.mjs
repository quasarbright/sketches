// The About's 3D demos: on the left the scene from a camera off to the side, with your eye (or
// sensor) firing its rays into it; on the right the picture those rays make, built pixel by
// pixel. A grid of rays is always shown faintly; the rays of the pixels being worked out right
// now are bright yellow. Everything is in CSS pixels; `dpr` sets how finely the images are made.
import { Scan, rayPath, outsidePixel, outsideXY, projectBoxes, CORNERS, withoutBalls, axes } from "./render3d.mjs";
import { parseExpr, normalizedLens } from "./lens.mjs";
import { drawOrthoPair } from "./ortho-pair.mjs";
import { RENDER_PIXELS, EYE_LENS, SENSOR_LENS } from "./render-demo.mjs";

// the lenses the "any function of distance" demos cycle through, 2D and 3D alike
export const FUNCTIONS = [
  { name: "√z", src: "sqrt(z)" }, { name: "z²", src: "z^2" }, { name: "log(1 + z)", src: "log(1+z)" },
  { name: "1/(z + 5)", src: "1/(z+5)" }, { name: "1/z", src: "1/z" },
].map((d) => ({ ...d, f: parseExpr(d.src) }));
export const FUNCTION_PERIOD = 5.5;
// one of them as a 3D lens: the view is 2.2 m tall 2 m ahead, like the others
const curved = FUNCTIONS.map((d) => { const g = normalizedLens(d.f, 2); return { h: (z) => 1.1 * g(z) }; });
export const TWO_LENS = { Ax: 1.1, tx: 0, Ay: 0, ty: 0.55 }; // orthographic across, perspective up and down

// the left view's backdrop is the same for every demo of a size: make it once
const backdrops = new Map();
const outsideNoBall = withoutBalls(outsidePixel);
function backdrop(w, h, noBall) {
  const key = `${w}x${h}${noBall ? "-" : ""}`;
  let sc = backdrops.get(key);
  if (!sc) { sc = new Scan(); sc.reset(key, w, h, noBall ? outsideNoBall : outsidePixel); backdrops.set(key, sc); }
  return sc;
}
// work out pixels of a scan up to `target`, spending at most `ms` this frame
export function advanceScan(sc, target, ms = 8) {
  const t0 = performance.now(), end = Math.min(sc.total, Math.floor(target));
  while (sc.done < end && performance.now() - t0 < ms) sc.advance(Math.min(1500, end - sc.done));
}
// Each lens's picture is worked out once (a few frames' worth of spare time) and kept, so the
// demos can show it being traced at the pace of their clock, however fast the computer is.
const pictures = new Map();
function pictureOf(key, pw, lens) {
  const k = `${key}|${pw}`;
  let sc = pictures.get(k);
  if (!sc) {
    sc = new Scan(); sc.reset(k, pw, pw, lens); pictures.set(k, sc);
    if (pictures.size > 24) pictures.delete(pictures.keys().next().value);
  }
  return sc;
}

export function layout(W, H) {
  const pic = Math.round(Math.min(H - 20, W * 0.42)), gap = 10;
  const viewW = W - pic - gap;
  return { view: { x: 0, y: 0, w: viewW, h: H }, pic: { x: viewW + gap, y: Math.round((H - 20 - pic) / 2), w: pic, h: pic } };
}

const line = (ctx, pts, V) => {
  ctx.beginPath();
  let on = false;
  for (const p of pts) {
    const q = outsideXY(p, V.x, V.y, V.w, V.h);
    if (!q) { on = false; continue; }
    if (on) ctx.lineTo(...q); else { ctx.moveTo(...q); on = true; }
  }
  ctx.stroke();
};
const css = (c) => `rgb(${c.map(Math.round)})`;

// where the rays start: half the sensor's width and height, [0, 0] for an eye, or null when they
// come in from infinitely far away (1/z)
function sensorOf(lens) {
  if (lens.h) { const h0 = lens.h(1e-4); return Number.isFinite(h0) && h0 < 4 ? [Math.max(0, h0), Math.max(0, h0)] : null; }
  const { Ax, Ay } = axes(lens);
  return [Ax, Ay];
}
function drawSensor(ctx, V, lens) {
  const s = sensorOf(lens);
  if (!s) return;
  const [ax, ay] = s;
  if (ax > 0.01 || ay > 0.01) { // a rectangle, or a strip when one side is 0
    const c = [[-ax, -ay, 0], [ax, -ay, 0], [ax, ay, 0], [-ax, ay, 0]].map((p) => outsideXY(p, V.x, V.y, V.w, V.h));
    if (!c.every(Boolean)) return;
    ctx.fillStyle = "rgba(90,169,230,0.45)"; ctx.strokeStyle = "#3d9be9"; ctx.lineWidth = ax > 0.01 && ay > 0.01 ? 2 : 4;
    ctx.lineCap = "round";
    ctx.beginPath(); c.forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q))); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.lineCap = "butt";
  } else { // the eye
    const e = outsideXY([0, 0, 0], V.x, V.y, V.w, V.h);
    ctx.fillStyle = "#f4f1ea"; ctx.beginPath(); ctx.arc(...e, 5, 0, 7); ctx.fill();
    ctx.fillStyle = "#3d8fd6"; ctx.beginPath(); ctx.arc(e[0] - 1.5, e[1], 2.6, 0, 7); ctx.fill();
  }
}

// the left side: backdrop, the eye or sensor, the faint ray grid, and `hot` rays in yellow
function drawView(ctx, V, dpr, lens, hot, { grid = 7, noBall = false } = {}) {
  const bd = backdrop(Math.round(V.w * dpr), Math.round(V.h * dpr), noBall);
  advanceScan(bd, bd.total, 12);
  ctx.save();
  ctx.beginPath(); ctx.rect(V.x, V.y, V.w, V.h); ctx.clip();
  bd.draw(ctx, V.w, V.h, { head: false, x: V.x, y: V.y });
  // the grid of rays, faint, each ending in a dot of the color it found
  ctx.lineWidth = 1;
  for (let i = 0; i < grid; i++) for (let j = 0; j < grid; j++) {
    const u = -1 + (2 * i + 1) / grid, v = 1 - (2 * j + 1) / grid;
    const r = rayPath(lens, u, v, 1);
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    line(ctx, r.pts, V);
    const e = r.hit && r.pts.length && outsideXY(r.pts[r.pts.length - 1], V.x, V.y, V.w, V.h);
    if (e) { ctx.fillStyle = css(r.color); ctx.beginPath(); ctx.arc(...e, 2.5, 0, 7); ctx.fill(); }
  }
  // the rays being fired right now
  hot.forEach(([u, v], k) => {
    const r = rayPath(lens, u, v, 1);
    ctx.strokeStyle = `rgba(255,210,63,${k === 0 ? 1 : 0.75 - 0.6 * k / hot.length})`;
    ctx.lineWidth = k === 0 ? 2.2 : 1.4;
    line(ctx, r.pts, V);
    const e = r.pts.length && outsideXY(r.pts[r.pts.length - 1], V.x, V.y, V.w, V.h);
    if (e && k === 0) { ctx.fillStyle = "#ffd23f"; ctx.beginPath(); ctx.arc(...e, 4, 0, 7); ctx.fill(); }
  });
  drawSensor(ctx, V, lens);
  ctx.restore();
}
function labels(ctx, L, text = "picture") {
  ctx.font = "11px 'JetBrains Mono', monospace"; ctx.fillStyle = "#9a978e"; ctx.textAlign = "center";
  ctx.fillText(text, L.pic.x + L.pic.w / 2, L.pic.y + L.pic.h + 15);
  ctx.textAlign = "start";
  ctx.strokeStyle = "rgba(233,228,216,0.25)"; ctx.lineWidth = 1;
  ctx.strokeRect(L.pic.x - 0.5, L.pic.y - 0.5, L.pic.w + 1, L.pic.h + 1);
}

// The picture traced pixel by pixel, `frac` of the way through (0..1), left to right along each
// row, rows from the top. `key` names the lens, so its picture is only worked out once.
export function drawTraceDemo(ctx, W, H, dpr, { key, lens, frac }) {
  const L = layout(W, H), pw = Math.round(L.pic.w * dpr);
  const sc = pictureOf(key, pw, lens);
  advanceScan(sc, sc.total, 10);
  const n = Math.min(sc.done, Math.floor(sc.total * frac));
  const hot = [];
  if (n < sc.total) for (let k = 0; k < 10; k++) {
    const i = n - k * Math.max(1, Math.round(sc.w / 9));
    if (i >= 0) hot.push(sc.headUV(i));
  }
  ctx.clearRect(0, 0, W, H);
  drawView(ctx, L.view, dpr, lens, hot);
  sc.drawReveal(ctx, L.pic.w, L.pic.h, n, { x: L.pic.x, y: L.pic.y });
  labels(ctx, L);
}
// spend spare time working out a picture that's coming up next
function prewarm(key, W, H, dpr, lens) {
  const L = layout(W, H), sc = pictureOf(key, Math.round(L.pic.w * dpr), lens);
  advanceScan(sc, sc.total, 4);
}

// A lens that changes every frame (the sensor sweep): a coarse picture while it moves, the full
// one while it holds.
export function drawLiveDemo(ctx, W, H, dpr, st, lens, holding) {
  const L = layout(W, H), pw = Math.round(L.pic.w * dpr);
  if (!holding) {
    st.low.reset("", Math.max(8, Math.round(pw / 5)), Math.max(8, Math.round(pw / 5)), lens);
    st.low.advance(st.low.total);
    st.full.key = null;
  } else {
    const key = JSON.stringify(lens);
    if (st.full.key !== key || st.full.w !== pw) st.full.reset(key, pw, pw, lens);
    advanceScan(st.full, st.full.total, 10);
  }
  ctx.clearRect(0, 0, W, H);
  drawView(ctx, L.view, dpr, lens, []);
  (holding && st.full.done === st.full.total ? st.full : st.low).draw(ctx, L.pic.w, L.pic.h, { head: false, x: L.pic.x, y: L.pic.y });
  labels(ctx, L);
}

/* ---------------- the corner demo: what gets divided ---------------- */

// its clock: two corners placed slowly with the division shown, the rest quickly, then the
// triangles joined, then filled while the wireframe fades
const SLOW = 3.6, FAST = 0.18, JOIN = 1.2, FILL = 1.4, HOLD = 2.2;
const N_SLOW = 2, PLACE = N_SLOW * SLOW + (CORNERS.length - N_SLOW) * FAST;
export const CORNER_PERIOD = PLACE + JOIN + FILL + HOLD;
function cornerClock(t) {
  const tc = t % CORNER_PERIOD;
  if (tc < N_SLOW * SLOW) return { cur: Math.floor(tc / SLOW), into: (tc % SLOW) / SLOW, slow: true, join: 0, fill: 0 };
  if (tc < PLACE) return { cur: N_SLOW + Math.floor((tc - N_SLOW * SLOW) / FAST), into: 1, slow: false, join: 0, fill: 0 };
  const e = (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);
  return { cur: CORNERS.length, into: 1, slow: false,
    join: e(Math.min(1, (tc - PLACE) / JOIN)), fill: e(Math.max(0, Math.min(1, (tc - PLACE - JOIN) / FILL))) };
}
const ACROSS = "#62d0c3", UP = "#ff8a5c";
const fmt = (v) => (v < 0 ? "−" : "") + Math.abs(v).toFixed(2);

// The graphics card's way: each corner gets a line to your eye as it's placed. For the first two,
// the square the view covers at that corner's distance is drawn around it, with the corner's
// offset across and up; the picture is that square shrunk down, so the corner lands at the same
// fraction of the way to the edges. Returns the caption.
export function drawCornerDemo(ctx, W, H, dpr, lens, t) {
  const L = layout(W, H), V = L.view, k = cornerClock(t);
  const placed = Math.min(CORNERS.length, k.cur + 1), wire = 1 - k.fill;
  ctx.clearRect(0, 0, W, H);
  drawView(ctx, V, dpr, lens, [], { grid: 0, noBall: true });
  const X = (p) => outsideXY(p, V.x, V.y, V.w, V.h);
  const seg = (a, b, color, w = 2, dash = []) => {
    const p = X(a), q = X(b); if (!p || !q) return;
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(...p); ctx.lineTo(...q); ctx.stroke(); ctx.setLineDash([]);
  };
  const cur = k.cur < CORNERS.length ? CORNERS[k.cur].p : null;
  const f = cur ? lens.A + cur[2] * lens.t : 0;
  const show = k.slow ? Math.min(1, k.into / 0.12, (1 - k.into) / 0.06) : 0; // the slice fades in and out
  ctx.save(); ctx.beginPath(); ctx.rect(V.x, V.y, V.w, V.h); ctx.clip();
  const eye = [0, 0, 0];
  // the square the view covers at the current corner's distance
  if (show > 0) {
    const [x, y, z] = cur, sq = [[-f, -f, z], [f, -f, z], [f, f, z], [-f, f, z]].map(X);
    ctx.globalAlpha = show;
    if (sq.every(Boolean)) {
      ctx.fillStyle = "rgba(255,210,63,0.14)"; ctx.strokeStyle = "rgba(255,210,63,0.9)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); sq.forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q))); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    seg(eye, [0, 0, z], "rgba(255,255,255,0.8)", 1.2, [4, 4]); // the line you're looking along
    seg([0, 0, z], [x, 0, z], ACROSS, 2.5);
    seg([x, 0, z], [x, y, z], UP, 2.5);
    ctx.globalAlpha = 1;
  }
  // the corners placed so far, each on the ray from your eye; the newest in yellow
  for (let i = 0; i < placed; i++) {
    const now = i === k.cur, q = X(CORNERS[i].p);
    if (!q) continue;
    if (k.join === 0 || wire > 0) seg(eye, CORNERS[i].p, now ? "#ffd23f" : `rgba(255,255,255,${0.35 * wire})`, now ? 2 : 1);
    ctx.fillStyle = now ? "#ffd23f" : `rgba(20,22,26,${Math.max(wire, 0.0)})`;
    ctx.beginPath(); ctx.arc(...q, now ? 4 : 2.5, 0, 7); ctx.fill();
  }
  ctx.restore();
  // the picture
  ctx.save();
  ctx.translate(L.pic.x, L.pic.y);
  ctx.beginPath(); ctx.rect(0, 0, L.pic.w, L.pic.h); ctx.clip();
  const P = projectBoxes(ctx, L.pic.w, L.pic.h, lens, { placed, join: k.join, fill: k.fill });
  if (cur) {
    const [px, py] = P(...cur), c = [L.pic.w / 2, L.pic.h / 2];
    if (show > 0) { // the same offsets, shrunk with the square into the picture
      ctx.globalAlpha = show;
      ctx.strokeStyle = "rgba(20,22,26,0.5)"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(c[0], 0); ctx.lineTo(c[0], L.pic.h); ctx.moveTo(0, c[1]); ctx.lineTo(L.pic.w, c[1]); ctx.stroke();
      ctx.setLineDash([]); ctx.lineWidth = 3;
      ctx.strokeStyle = ACROSS; ctx.beginPath(); ctx.moveTo(...c); ctx.lineTo(px, c[1]); ctx.stroke();
      ctx.strokeStyle = UP; ctx.beginPath(); ctx.moveTo(px, c[1]); ctx.lineTo(px, py); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = "#ffd23f"; ctx.strokeStyle = "#14161a"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(px, py, 5, 0, 7); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
  labels(ctx, L);
  if (show > 0) { // the picture's frame is the square, shrunk
    ctx.globalAlpha = show; ctx.strokeStyle = "rgba(255,210,63,0.9)"; ctx.lineWidth = 2;
    ctx.strokeRect(L.pic.x - 1, L.pic.y - 1, L.pic.w + 2, L.pic.h + 2); ctx.globalAlpha = 1;
  }
  if (k.slow) {
    const [x, y, z] = cur;
    const ax = fmt(Math.abs(x)), ay = fmt(Math.abs(y)), F = f.toFixed(2);
    return `This corner is ${ax} m ${x < 0 ? "left" : "right"} of the line you're looking along and ${ay} m ${y < 0 ? "below" : "above"} it, ${z.toFixed(2)} m ahead. `
      + `The view there reaches 0.55 × ${z.toFixed(2)} = ${F} m from the middle to each edge, so the corner lands `
      + `${(Math.abs(x) / f).toFixed(2)} of the way ${x < 0 ? "left" : "right"} (${ax} ÷ ${F}) and ${(Math.abs(y) / f).toFixed(2)} of the way ${y < 0 ? "down" : "up"} (${ay} ÷ ${F}).`;
  }
  if (k.cur < CORNERS.length) return "Every other corner is placed the same way: its offset divided by 0.55 times its distance.";
  return k.fill === 0 ? "Neighboring corners are joined into triangles." : "The triangles are filled in, nearest in front.";
}

/* ---------------- every 3D demo, by name ---------------- */

// Draws the 3D demo `demo` at time t (seconds). `store` is an object kept per canvas. Returns
// the caption to show under it, or undefined to leave the caption alone.
export function drawAbout3D(demo, ctx, W, H, dpr, t, store) {
  // the scanline demos run on the same clock as the side view's column: the picture's rows keep
  // pace with its pixels, then both hold, then again
  const run = RENDER_PIXELS * 0.22, cycle = run + 2.2, frac = Math.min(1, (t % cycle) / run);
  if (demo === "render3d") return drawTraceDemo(ctx, W, H, dpr, { key: "eye", lens: EYE_LENS, frac });
  if (demo === "render3d-ortho") return drawTraceDemo(ctx, W, H, dpr, { key: "sensor", lens: SENSOR_LENS, frac });
  if (demo === "twolens3d") return drawTraceDemo(ctx, W, H, dpr, { key: "twolens", lens: TWO_LENS, frac });
  if (demo === "divide3d") return drawCornerDemo(ctx, W, H, dpr, EYE_LENS, t);
  if (demo === "orthopair") return drawOrthoPair(ctx, W, H, dpr, t, store);
  if (demo === "plane3d") {
    // sweep the sensor from a point (an eye) to as tall as the picture with no spread, and on to
    // bigger with the rays coming together, holding at each
    const s = sensorSweep(t), lens = { A: s * 1.1, t: (1 - s) * 0.55 };
    store.low ??= new Scan(); store.full ??= new Scan();
    const holding = Math.abs(s - (store.s ?? -1)) < 1e-9;
    store.s = s;
    return drawLiveDemo(ctx, W, H, dpr, store, lens, holding);
  }
  if (demo === "functions3d") {
    const i = Math.floor(t / FUNCTION_PERIOD) % FUNCTIONS.length, j = (i + 1) % FUNCTIONS.length;
    const into = (t % FUNCTION_PERIOD) / 4.5;
    drawTraceDemo(ctx, W, H, dpr, { key: FUNCTIONS[i].src, lens: curved[i], frac: Math.min(1, into) });
    prewarm(FUNCTIONS[j].src, W, H, dpr, curved[j]);
    const s = sensorOf(curved[i]);
    return `Divide by ${FUNCTIONS[i].name}. `
      + (!s ? "f is infinite at your eye, so the rays come in from infinitely far away, with no sensor to start from."
        : s[0] > 0.01 ? `f(0) isn't 0, so the rays start on a ${(2 * s[0]).toFixed(1)} m sensor.`
        : "f(0) is 0, so the rays start at your eye.");
  }
}
// the sensor sweep's size: 0 (an eye), 1 (as tall as the picture, no spread), 1.45 (rays meeting)
export function sensorSweep(t) {
  const period = 12, u = (t % period) / period;
  const keysS = [0, 0, 1, 1, 1.45, 1.45, 0];
  const seg = u * (keysS.length - 1), i = Math.floor(seg), f = seg - i;
  const ease = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
  return keysS[i] + (keysS[Math.min(i + 1, keysS.length - 1)] - keysS[i]) * ease;
}
