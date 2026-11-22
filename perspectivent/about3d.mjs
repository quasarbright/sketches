// The About's 3D demos: on the left the scene from a camera off to the side, with your eye (or
// sensor) firing its rays into it; on the right the picture those rays make, built pixel by
// pixel. A grid of rays is always shown faintly; the rays of the pixels being worked out right
// now are bright yellow. Everything is in CSS pixels; `dpr` sets how finely the images are made.
import { Scan, rayPath, outsidePixel, outsideXY, projectBoxes, SCENE3 } from "./render3d.mjs";

// the left view's backdrop is the same for every demo of a size: make it once
const backdrops = new Map();
function backdrop(w, h) {
  const key = `${w}x${h}`;
  let sc = backdrops.get(key);
  if (!sc) { sc = new Scan(); sc.reset(key, w, h, outsidePixel); backdrops.set(key, sc); }
  return sc;
}
// work out pixels of a scan up to `target`, spending at most `ms` this frame
export function advanceScan(sc, target, ms = 8) {
  const t0 = performance.now(), end = Math.min(sc.total, Math.floor(target));
  while (sc.done < end && performance.now() - t0 < ms) sc.advance(Math.min(1500, end - sc.done));
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

// the left side: backdrop, the eye or sensor, the faint ray grid, and `hot` rays in yellow
function drawView(ctx, V, dpr, lens, hot, { grid = 7 } = {}) {
  const bd = backdrop(Math.round(V.w * dpr), Math.round(V.h * dpr));
  advanceScan(bd, bd.total, 12);
  ctx.save();
  ctx.beginPath(); ctx.rect(V.x, V.y, V.w, V.h); ctx.clip();
  bd.draw(ctx, V.w, V.h, { head: false, x: V.x, y: V.y });
  // the sensor, a square like the picture, or the eye
  if (lens.A > 0.01) {
    const A = lens.A, c = [[-A, -A, 0], [A, -A, 0], [A, A, 0], [-A, A, 0]].map((p) => outsideXY(p, V.x, V.y, V.w, V.h));
    if (c.every(Boolean)) {
      ctx.fillStyle = "rgba(90,169,230,0.45)"; ctx.strokeStyle = "#3d9be9"; ctx.lineWidth = 2;
      ctx.beginPath(); c.forEach((q, i) => (i ? ctx.lineTo(...q) : ctx.moveTo(...q))); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
  // the grid of rays, faint, each ending in a dot of the color it found
  ctx.lineWidth = 1;
  for (let i = 0; i < grid; i++) for (let j = 0; j < grid; j++) {
    const u = -1 + (2 * i + 1) / grid, v = 1 - (2 * j + 1) / grid;
    const r = rayPath(lens, u, v, 1);
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    line(ctx, r.pts, V);
    const e = r.hit && outsideXY(r.pts[r.pts.length - 1], V.x, V.y, V.w, V.h);
    if (e) { ctx.fillStyle = css(r.color); ctx.beginPath(); ctx.arc(...e, 2.5, 0, 7); ctx.fill(); }
  }
  // the rays being fired right now
  hot.forEach(([u, v], k) => {
    const r = rayPath(lens, u, v, 1);
    ctx.strokeStyle = `rgba(255,210,63,${k === 0 ? 1 : 0.75 - 0.6 * k / hot.length})`;
    ctx.lineWidth = k === 0 ? 2.2 : 1.4;
    line(ctx, r.pts, V);
    const e = outsideXY(r.pts[r.pts.length - 1], V.x, V.y, V.w, V.h);
    if (e && k === 0) { ctx.fillStyle = "#ffd23f"; ctx.beginPath(); ctx.arc(...e, 4, 0, 7); ctx.fill(); }
  });
  if (!(lens.A > 0.01)) {
    const e = outsideXY([0, 0, 0], V.x, V.y, V.w, V.h);
    ctx.fillStyle = "#f4f1ea"; ctx.beginPath(); ctx.arc(...e, 5, 0, 7); ctx.fill();
    ctx.fillStyle = "#3d8fd6"; ctx.beginPath(); ctx.arc(e[0] + 1.5, e[1], 2.6, 0, 7); ctx.fill();
  }
  ctx.restore();
}
function labels(ctx, L) {
  ctx.font = "11px 'JetBrains Mono', monospace"; ctx.fillStyle = "#9a978e"; ctx.textAlign = "center";
  ctx.fillText("picture", L.pic.x + L.pic.w / 2, L.pic.y + L.pic.h + 15);
  ctx.textAlign = "start";
  ctx.strokeStyle = "rgba(233,228,216,0.25)"; ctx.lineWidth = 1;
  ctx.strokeRect(L.pic.x - 0.5, L.pic.y - 0.5, L.pic.w + 1, L.pic.h + 1);
}

// The picture traced pixel by pixel, `frac` of the way through (0..1; its rows keep pace with the
// side view's column). `sc` is this demo's own Scan; `key` restarts it.
export function drawTraceDemo(ctx, W, H, dpr, { sc, key, lens, frac }) {
  const L = layout(W, H), pw = Math.round(L.pic.w * dpr);
  if (sc.key !== key || sc.w !== pw) sc.reset(key, pw, pw, lens);
  // the picture keeps up with the clock, as long as the computer keeps up
  advanceScan(sc, sc.total * frac, 10);
  const hot = [];
  if (sc.done < sc.total) for (let k = 0; k < 10; k++) {
    const i = sc.done - 1 - k * Math.max(1, Math.round(sc.w / 9));
    if (i >= 0) hot.push(sc.headUV(i));
  }
  ctx.clearRect(0, 0, W, H);
  drawView(ctx, L.view, dpr, lens, hot);
  sc.draw(ctx, L.pic.w, L.pic.h, { x: L.pic.x, y: L.pic.y });
  labels(ctx, L);
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

// The graphics card's way: a line from your eye to each box corner as it's placed, and the
// picture made by dividing. k as in projectBoxes.
export function drawCornerDemo(ctx, W, H, dpr, lens, k) {
  const L = layout(W, H);
  ctx.clearRect(0, 0, W, H);
  drawView(ctx, L.view, dpr, lens, [], { grid: 0 });
  ctx.save();
  ctx.translate(L.pic.x, L.pic.y);
  ctx.beginPath(); ctx.rect(0, 0, L.pic.w, L.pic.h); ctx.clip();
  const cur = projectBoxes(ctx, L.pic.w, L.pic.h, lens, k);
  ctx.restore();
  // the corners placed so far, each joined to your eye; the newest in yellow
  const corners = [];
  for (const b of SCENE3.boxes) for (const sz of [-1, 1]) for (const sy of [-1, 1]) for (const sx of [-1, 1]) {
    const c = Math.cos(b.rot), s = Math.sin(b.rot), x = sx * b.half[0], z = sz * b.half[2];
    corners.push([b.c[0] + c * x + s * z, b.c[1] + sy * b.half[1], b.c[2] - s * x + c * z]);
  }
  const shown = k >= 1 ? corners.length : Math.floor(k * corners.length) + 1, V = L.view;
  const eye = outsideXY([0, 0, 0], V.x, V.y, V.w, V.h);
  ctx.save(); ctx.beginPath(); ctx.rect(V.x, V.y, V.w, V.h); ctx.clip();
  for (let i = 0; i < Math.min(shown, corners.length); i++) {
    const q = outsideXY(corners[i], V.x, V.y, V.w, V.h), now = k < 1 && i === shown - 1;
    if (!q) continue;
    ctx.strokeStyle = now ? "#ffd23f" : "rgba(255,255,255,0.35)"; ctx.lineWidth = now ? 2 : 1;
    if (k < 2) { ctx.beginPath(); ctx.moveTo(...eye); ctx.lineTo(...q); ctx.stroke(); }
    ctx.fillStyle = now ? "#ffd23f" : "#14161a"; ctx.beginPath(); ctx.arc(...q, now ? 4 : 2.5, 0, 7); ctx.fill();
  }
  ctx.restore();
  labels(ctx, L);
  return cur;
}
