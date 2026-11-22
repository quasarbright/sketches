// The About's 3D demos: on the left the scene from a camera off to the side, with your eye (or
// sensor) firing its rays into it; on the right the picture those rays make, built pixel by
// pixel. A grid of rays is always shown faintly; the rays of the pixels being worked out right
// now are bright yellow. Everything is in CSS pixels; `dpr` sets how finely the images are made.
import { Scan, rayPath, outsidePixel, outsideXY, withoutBalls, axes, SCENE3 } from "./render3d.mjs";
import { parseExpr, normalizedLens } from "./lens.mjs";
import { drawOrthoPair } from "./ortho-pair.mjs";
import { RENDER_PIXELS, EYE_LENS, SENSOR_LENS } from "./render-demo.mjs";

// the lenses the "any function of distance" demos cycle through, 2D and 3D alike
export const FUNCTIONS = [
  { name: "√z", src: "sqrt(z)" }, { name: "z²", src: "z^2" }, { name: "log(1 + z)", src: "log(1+z)" },
  { name: "1/(z + 5)", src: "1/(z+5)" },
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
  const s = sensorOf(lens) ?? [0, 0]; // with no sensor (1/z), still show where your eye is
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

// Pictures of a lens that changes every frame (the sensor sweep, the sliders) come from the game's
// own renderer, set by main.mjs: engine(lens, w) draws the scene through `lens`, w × w pixels,
// and returns the canvas it drew on.
let engine = null;
export const setEngine = (fn) => { engine = fn; };
export const sweepLens = (s) => ({ A: s * 1.1, t: (1 - s) * 0.55 });
export function drawEngineDemo(ctx, W, H, dpr, lens) {
  const L = layout(W, H), pw = Math.round(L.pic.w * dpr);
  ctx.clearRect(0, 0, W, H);
  drawView(ctx, L.view, dpr, lens, []);
  if (engine) ctx.drawImage(engine(lens, pw), L.pic.x, L.pic.y, L.pic.w, L.pic.h);
  labels(ctx, L);
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
  if (demo === "orthopair") return drawOrthoPair(ctx, W, H, dpr, t, store);
  if (demo === "vertex") return drawVertexDemo(ctx, W, H, dpr, t);
  if (demo === "plane3d") return drawEngineDemo(ctx, W, H, dpr, sweepLens(sensorSweep(t)));
  if (demo === "sliders3d") return drawEngineDemo(ctx, W, H, dpr, store.lens ?? EYE_LENS);
  if (demo === "functions3d") {
    const i = Math.floor(t / FUNCTION_PERIOD) % FUNCTIONS.length, j = (i + 1) % FUNCTIONS.length;
    const into = (t % FUNCTION_PERIOD) / 4.5;
    drawTraceDemo(ctx, W, H, dpr, { key: FUNCTIONS[i].src, lens: curved[i], frac: Math.min(1, into) });
    prewarm(FUNCTIONS[j].src, W, H, dpr, curved[j]);
    const s = sensorOf(curved[i]);
    return `f(z) = ${FUNCTIONS[i].name}. `
      + (!s ? "f is infinite at your eye, so the rays don't start there: they come in from infinitely far away."
        : s[0] > 0.01 ? `f(0) isn't 0, so the rays start on a ${(2 * s[0]).toFixed(1)} m sensor.`
        : "f(0) is 0, so the rays start at your eye.");
  }
}
// the sensor sweep's size: 0 (an eye), 1 (as tall as the picture, no spread), 1.6 (rays meeting 5.3 m ahead, in front of the blue box)
export function sensorSweep(t) {
  const period = 12, u = (t % period) / period;
  const keysS = [0, 0, 1, 1, 1.6, 1.6, 0];
  const seg = u * (keysS.length - 1), i = Math.floor(seg), f = seg - i;
  const ease = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
  return keysS[i] + (keysS[Math.min(i + 1, keysS.length - 1)] - keysS[i]) * ease;
}

/* ---------------- how the game cheats: triangle by triangle ---------------- */

// The scene's boxes and ground as triangles, in camera coordinates (the eye at 0, x right, y up,
// z ahead), with the faces that point away from the eye left out. Each is { p: [3 points], color }.
const SUN_D = (() => { const v = [-0.5, 0.8, -0.35], l = Math.hypot(...v); return v.map((c) => c / l); })();
const shadeHex = (hex, n) => {
  const k = 0.55 + 0.5 * Math.max(0, n[0] * SUN_D[0] + n[1] * SUN_D[1] + n[2] * SUN_D[2]);
  return [1, 3, 5].map((i) => Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * k)));
};
const TRIS = (() => {
  const out = [];
  // the red cube first (its first triangle is the one worked through slowly), then the blue box
  for (const b of [SCENE3.boxes[0], SCENE3.boxes[1]]) {
    const c = Math.cos(b.rot), sn = Math.sin(b.rot);
    const W = ([x, y, z]) => [b.c[0] + c * x + sn * z, b.c[1] + y, b.c[2] - sn * x + c * z];
    const N = ([x, y, z]) => [c * x + sn * z, y, -sn * x + c * z];
    const h = b.half, P = (sx, sy, sz) => W([sx * h[0], sy * h[1], sz * h[2]]);
    const faces = [ // corners counterclockwise seen from outside, and the outward normal
      [[P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), P(1, -1, -1)], [0, 0, -1]],
      [[P(-1, 1, -1), P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1)], [0, 1, 0]],
      [[P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1)], [1, 0, 0]],
      [[P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), P(-1, -1, -1)], [-1, 0, 0]],
      [[P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), P(-1, -1, 1)], [0, 0, 1]],
    ];
    for (const [q, n0] of faces) {
      const n = N(n0), mid = [0, 1, 2].map((a) => q.reduce((s2, p) => s2 + p[a], 0) / 4);
      if (n[0] * mid[0] + n[1] * mid[1] + n[2] * mid[2] >= 0) continue; // facing away
      const color = shadeHex(b.color, n);
      out.push({ p: [q[0], q[1], q[2]], color }, { p: [q[0], q[2], q[3]], color });
    }
  }
  // the ground: two big triangles, most of their corners far off the picture
  const g = SCENE3.ground, gc = SCENE3.grass;
  const G = [[-40, g, 0.6], [40, g, 0.6], [40, g, 90], [-40, g, 90]];
  out.push({ p: [G[0], G[1], G[2]], color: gc, ground: true }, { p: [G[0], G[2], G[3]], color: gc, ground: true });
  return out;
})();
const NAMES = ["A", "B", "C"];
// Timeline: the first triangle slowly (each vertex VSTEP seconds, its step 2 starting STEP2 of the
// way in, then FILL1 to fill it), then every other triangle a vertex at a time (VF seconds each,
// filled when its last vertex lands, held FILLF), then the finished picture for HOLDT.
const VSTEP = 4.4, STEP2 = 0.4, FILL1 = 2.0, VF = 0.28, FILLF = 0.14, TRI_T = 3 * VF + FILLF, HOLDT = 3.2;
const SLOW_END = 3 * VSTEP + FILL1, FAST_END = SLOW_END + (TRIS.length - 1) * TRI_T;
export const VERTEX_PERIOD = FAST_END + HOLDT;
const FADE = 0.35;
// how visible something shown from t0 to t1 is at time t: fades in after t0 and out before t1
const shown = (t, t0, t1) => Math.max(0, Math.min(1, (t - t0) / FADE, (t1 - t) / FADE));
const ACROSS = "#62d0c3", UP = "#ff8a5c";
const num = (v) => (v < 0 ? "−" : "") + Math.abs(v).toFixed(2);

export function drawVertexDemo(ctx, W, H, dpr, t) {
  const lens = EYE_LENS, narrow = W < 520, eqH = narrow ? 88 : 56;
  const L = layout(W, H - eqH), V = L.view, P = L.pic, f = (z) => lens.A + z * lens.t;
  const tc = t % VERTEX_PERIOD;
  // where the animation is. Slow: vertex k (3 = filling) of the first triangle. Fast: triangle
  // `cur` with `placed` of its vertices on the picture.
  const slow = tc < SLOW_END, k = slow ? Math.min(3, Math.floor(tc / VSTEP)) : 3;
  const vt0 = k * VSTEP, into = slow ? (tc - vt0) / VSTEP : 1, step2 = into > STEP2;
  const done = slow ? (k >= 3 ? Math.min(1, (tc - 3 * VSTEP) / 0.6) : 0) : 1; // first triangle's fill
  const fastI = slow || tc >= FAST_END ? -1 : Math.floor((tc - SLOW_END) / TRI_T) + 1;
  const local = fastI > 0 ? tc - SLOW_END - (fastI - 1) * TRI_T : 0;
  const placed = fastI > 0 ? Math.min(3, Math.floor(local / VF) + 1) : 0;
  const filled = slow ? (done > 0 ? 1 : 0) : fastI > 0 ? fastI + (local >= 3 * VF ? 1 : 0) : TRIS.length;
  const curTri = fastI > 0 ? fastI : 0, tri = TRIS[curTri];
  const cur = slow && k < 3 ? tri.p[k] : null;
  ctx.clearRect(0, 0, W, H);
  drawView(ctx, V, dpr, lens, [], { grid: 0, noBall: true });
  const X = (p) => outsideXY(p, V.x, V.y, V.w, V.h);
  const seg = (a, b, color, w = 2, dash = []) => {
    const p = X(a), q = X(b); if (!p || !q) return;
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(...p); ctx.lineTo(...q); ctx.stroke(); ctx.setLineDash([]);
  };
  const outline = (pts, closed, fill) => {
    ctx.strokeStyle = "#ffd23f"; ctx.lineWidth = 2;
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
    if (closed) ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    ctx.stroke();
  };
  ctx.save(); ctx.beginPath(); ctx.rect(V.x, V.y, V.w, V.h); ctx.clip();
  // the triangle being drawn, outlined in the world, with its placed vertices marked
  if (tc < FAST_END && !tri.ground) {
    const q = tri.p.map(X);
    if (q.every(Boolean)) {
      outline(q, true, "rgba(255,210,63,0.25)");
      if (!slow) q.slice(0, placed).forEach((p) => { ctx.fillStyle = "#ffd23f"; ctx.beginPath(); ctx.arc(...p, 3.5, 0, 7); ctx.fill(); });
    }
  }
  if (cur) { // step 1: the vertex's x, y and z; step 2: how far the view reaches at its z
    const [x, y, z] = cur;
    ctx.globalAlpha = shown(tc, vt0, vt0 + VSTEP);
    seg([0, 0, 0], [0, 0, z], "rgba(255,255,255,0.85)", 1.5, [4, 4]);
    seg([0, 0, z], [x, 0, z], ACROSS, 2.5);
    seg([x, 0, z], [x, y, z], UP, 2.5);
    if (step2) {
      ctx.globalAlpha = shown(tc, vt0 + STEP2 * VSTEP, vt0 + VSTEP);
      const F = f(z), sq = [[-F, -F, z], [F, -F, z], [F, F, z], [-F, F, z]].map(X);
      if (sq.every(Boolean)) {
        ctx.fillStyle = "rgba(255,210,63,0.1)"; ctx.strokeStyle = "rgba(255,210,63,0.85)"; ctx.lineWidth = 1.5;
        ctx.beginPath(); sq.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
  if (slow) {
    ctx.font = "bold 12px 'JetBrains Mono', monospace";
    const sp = TRIS[0].p.map(X), mid = [0, 1].map((a) => sp.reduce((s3, q) => s3 + q[a], 0) / 3);
    sp.forEach((s2, i) => {
      if (i > k || !s2) return;
      ctx.fillStyle = i === k ? "#ffd23f" : "#14161a"; ctx.beginPath(); ctx.arc(...s2, i === k ? 4.5 : 3, 0, 7); ctx.fill();
      const d = [s2[0] - mid[0], s2[1] - mid[1]], l = Math.hypot(...d) || 1;
      const lx = s2[0] + (d[0] / l) * 16 - 6, ly = s2[1] + (d[1] / l) * 16 + 4;
      ctx.fillStyle = "rgba(17,19,23,0.85)"; ctx.fillRect(lx - 2, ly - 12, 13, 15);
      ctx.fillStyle = "#e9e4d8"; ctx.fillText(NAMES[i], lx, ly);
    });
  }
  ctx.restore();
  // the picture: the triangles filled so far, farthest first, so nearer ones cover them
  ctx.save(); ctx.beginPath(); ctx.rect(P.x, P.y, P.w, P.h); ctx.clip();
  // dark until the picture is finished, then sky where no triangle was drawn
  ctx.fillStyle = tc >= FAST_END ? `rgb(${SCENE3.sky})` : "#1a1d22"; ctx.fillRect(P.x, P.y, P.w, P.h);
  const S = ([x, y, z]) => [P.x + (x / f(z) + 1) / 2 * P.w, P.y + (1 - y / f(z)) / 2 * P.h];
  const list = TRIS.slice(0, filled).map((tr, i) => ({ tr, i, z: tr.ground ? 1e9 : (tr.p[0][2] + tr.p[1][2] + tr.p[2][2]) / 3 }));
  list.sort((a, b) => b.z - a.z);
  for (const { tr, i } of list) {
    ctx.globalAlpha = i === 0 && slow ? done : 1; ctx.fillStyle = ctx.strokeStyle = `rgb(${tr.color})`; ctx.lineWidth = 0.75;
    ctx.beginPath(); tr.p.map(S).forEach((p, j) => (j ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.closePath(); ctx.fill(); ctx.stroke(); // the stroke hides seams
    ctx.globalAlpha = 1;
  }
  // grid: the picture's u and v from −1 to 1
  ctx.strokeStyle = "rgba(233,228,216,0.18)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(P.x + P.w / 2, P.y); ctx.lineTo(P.x + P.w / 2, P.y + P.h); ctx.moveTo(P.x, P.y + P.h / 2); ctx.lineTo(P.x + P.w, P.y + P.h / 2); ctx.stroke();
  if (fastI > 0) { // the triangle being drawn now: its vertices as they land, then its outline
    const q = tri.p.map(S).slice(0, placed);
    outline(q, placed === 3);
    ctx.fillStyle = "#ffd23f";
    q.forEach((p) => { ctx.beginPath(); ctx.arc(...p, 3.5, 0, 7); ctx.fill(); });
  }
  if (slow) {
    ctx.font = "bold 12px 'JetBrains Mono', monospace";
    TRIS[0].p.forEach((p, i) => {
      if (i > k || (i === k && !step2)) return;
      const [px, py] = S(p);
      if (i === k && cur) { // the offsets in the picture
        const c = [P.x + P.w / 2, P.y + P.h / 2];
        ctx.globalAlpha = shown(tc, vt0 + STEP2 * VSTEP, vt0 + VSTEP);
        ctx.lineWidth = 2.5; ctx.strokeStyle = ACROSS; ctx.beginPath(); ctx.moveTo(...c); ctx.lineTo(px, c[1]); ctx.stroke();
        ctx.strokeStyle = UP; ctx.beginPath(); ctx.moveTo(px, c[1]); ctx.lineTo(px, py); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = i === k ? "#ffd23f" : "#e9e4d8"; ctx.beginPath(); ctx.arc(px, py, i === k ? 4.5 : 3.5, 0, 7); ctx.fill();
      ctx.fillText(NAMES[i], px + 6, py - 5);
    });
  }
  ctx.restore();
  ctx.font = "10px 'JetBrains Mono', monospace"; ctx.fillStyle = "#7d7a72";
  ctx.fillText("v = 1", P.x + P.w / 2 + 3, P.y + 10); ctx.textAlign = "right"; ctx.fillText("u = 1", P.x + P.w - 3, P.y + P.h / 2 - 3); ctx.textAlign = "left";
  labels(ctx, L);
  // the words and numbers under it. Each line fades in when its part starts and out before it ends.
  const y0 = H - eqH + 16, lh = 17;
  ctx.font = "12px 'JetBrains Mono', monospace"; ctx.textAlign = "left";
  const line = (parts, row, a = 1) => {
    if (a <= 0) return;
    ctx.globalAlpha = a; let x = 4;
    for (const [txt, col] of parts) { ctx.fillStyle = col; ctx.fillText(txt, x, y0 + row * lh); x += ctx.measureText(txt).width; }
    ctx.globalAlpha = 1;
  };
  const W1 = "#e9e4d8", MUTE = "#9a978e", Y = "#ffd23f";
  if (cur) {
    const [x, y, z] = cur, F = f(z), nm = NAMES[k];
    const a1 = shown(tc, vt0, vt0 + VSTEP), a2 = shown(tc, vt0 + STEP2 * VSTEP, vt0 + VSTEP);
    line([[narrow ? `1. ${nm} = (` : `1. ${nm} in camera coordinates: (`, MUTE], [num(x), ACROSS], [", ", MUTE], [num(y), UP], [", ", MUTE], [num(z), W1], [")", MUTE]], 0, a1);
    if (step2) {
      const a = [[`2. u = x / f(z) = ${num(x / F)}`, ACROSS]], b = [[`v = y / f(z) = ${num(y / F)}`, UP]];
      line([["   f(z) = 0.55 × ", MUTE], [num(z), W1], [" = ", MUTE], [num(F), Y]], 1, a2);
      if (narrow) { line(a, 2, a2); line([["   ", W1], ...b], 3, a2); } else line([...a, ["    ", W1], ...b], 2, a2);
    }
  } else if (slow) {
    line([["3. Fill the triangle between A, B and C.", W1]], 0, shown(tc, 3 * VSTEP, SLOW_END));
  } else if (tc < FAST_END) {
    const a = shown(tc, SLOW_END, FAST_END);
    if (narrow) {
      line([["Every other triangle the same way:", W1]], 0, a);
      line([["place its corners, then fill it.", W1]], 1, a);
      line([["Nearer triangles cover farther ones,", MUTE]], 2, a);
      line([["and off-picture parts are clipped.", MUTE]], 3, a);
    } else {
      line([["Every other triangle the same way: place its corners, then fill it.", W1]], 0, a);
      line([["Nearer triangles cover farther ones, and off-picture parts are clipped.", MUTE]], 1, a);
    }
  } else {
    line([["Every triangle drawn: that's the picture.", W1]], 0, shown(tc, FAST_END, VERTEX_PERIOD));
  }
}
