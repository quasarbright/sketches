// The About's side-view demos of a small scene, with one column of the picture beside it.
//
// drawRenderDemo: the column filled in one pixel at a time. Pixel u's ray starts at height u·A on
// the sensor (a point, your eye, when A = 0) and climbs u·t for every meter ahead, so its spread
// is the angle between the top ray (u = 1) and the bottom one. The pixel takes the color of the
// first thing the ray hits.
//
// The scene is the middle slice of render3d.mjs's SCENE3: the red cube is turned 30°, so straight
// through its middle it's 0.9 / cos 30° = 1.04 m deep.

const SCENE = {
  ground: -1.6, zMax: 10, H: 1.1,
  boxes: [ // z0, z1, y0, y1, color
    [3.38, 4.42, -1.6, -0.7, "#e8553d"],
    [6.6, 8.2, -1.6, 1.3, "#5aa9e6"],
  ],
  balls: [[5.3, 0.55, 0.38, "#f2c14e"]], // z, y, r, color
  sky: "#c9dcef", grass: "#5f8a43",
};
export const RENDER_PIXELS = 18;
// The demos' two lenses: an eye whose rays spread 0.55 m up and down per meter ahead (58°), and a
// sensor as tall as the picture with no spread (parallel rays).
export const EYE_LENS = { A: 0, t: 0.55 }, SENSOR_LENS = { A: 1.1, t: 0 };

// the first thing pixel i's ray hits: { z, y, color }
function trace(i, { A, t }) {
  const { ground, boxes, balls, zMax } = SCENE;
  const u = 1 - (2 * i + 1) / RENDER_PIXELS; // top pixel first
  const y0 = u * A, dy = u * t; // where it starts, and how much it climbs per meter ahead
  let best = { z: zMax, y: y0 + dy * zMax, color: SCENE.sky };
  const take = (z, color) => { if (z > 1e-6 && z < best.z) best = { z, y: y0 + dy * z, color }; };
  if (dy < 0) take((ground - y0) / dy, SCENE.grass);
  for (const [z0, z1, b0, b1, c] of boxes) { // the front face, or the top or bottom
    const yz0 = y0 + dy * z0;
    if (yz0 >= b0 && yz0 <= b1) take(z0, c);
    for (const yy of [b0, b1]) if (dy !== 0) { const z = (yy - y0) / dy; if (z > z0 && z < z1) take(z, c); }
  }
  for (const [bz, by, r, c] of balls) { // |(z, y0 + dy z) - (bz, by)| = r
    const a = 1 + dy * dy, b = 2 * (-bz + dy * (y0 - by)), cc = bz * bz + (y0 - by) ** 2 - r * r;
    const disc = b * b - 4 * a * cc;
    if (disc >= 0) take((-b - Math.sqrt(disc)) / (2 * a), c);
  }
  return { ...best, u, y0 };
}

// the scene from the side, the sensor or eye, and the layout both demos share
function frame(ctx, W, Hpx, lens, { ball = true } = {}) {
  const { ground, boxes, balls, zMax, H } = SCENE;
  ctx.clearRect(0, 0, W, Hpx);
  const colW = 26, padR = 18 + colW + 22, padL = 16;
  const yLo = -2.1, yHi = 2.1;
  // the same meters per pixel across and up, so the ball is round and angles are true
  const m = Math.min((W - padL - padR) / zMax, Hpx / (yHi - yLo));
  const X = (z) => padL + z * m;
  const Y = (y) => Hpx / 2 - y * m;
  ctx.fillStyle = "rgba(95,138,67,0.35)"; ctx.fillRect(0, Y(ground), X(zMax) + 4, Hpx - Y(ground));
  for (const [z0, z1, b0, b1, c] of boxes) { ctx.fillStyle = c; ctx.globalAlpha = 0.75; ctx.fillRect(X(z0), Y(b1), X(z1) - X(z0), Y(b0) - Y(b1)); }
  if (ball) for (const [bz, by, r, c] of balls) {
    ctx.fillStyle = c; ctx.beginPath();
    ctx.ellipse(X(bz), Y(by), X(bz + r) - X(bz), Y(by - r) - Y(by), 0, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const cx = W - 18 - colW, pyTop = Y(H), colH = Y(-H) - Y(H);
  return { X, Y, cx, colW, pyTop, colH, H };
}
// where the rays start, and their spread: an arc between the top and bottom rays
function source(ctx, L, lens) {
  const { X, Y } = L;
  ctx.strokeStyle = "#5aa9e6"; ctx.fillStyle = "#5aa9e6"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
  if (lens.A > 0.01) { ctx.beginPath(); ctx.moveTo(X(0), Y(lens.A)); ctx.lineTo(X(0), Y(-lens.A)); ctx.stroke(); }
  else { ctx.beginPath(); ctx.arc(X(0), Y(0), 3.5, 0, 7); ctx.fill(); }
  ctx.font = "11px 'JetBrains Mono', monospace"; ctx.textAlign = "left";
  ctx.fillText(lens.A > 0.01 ? "sensor" : "eye", X(0) - 8, Y(Math.max(lens.A, 0)) - 12);
  if (Math.abs(lens.t) > 1e-6) { // the spread, as an arc between the top and bottom rays
    const r = 34, a = Math.atan2(Y(lens.t) - Y(0), X(1) - X(0)); // canvas angle of the top ray
    ctx.strokeStyle = "rgba(255,210,63,0.7)"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(X(0), Y(0), r, a, -a); ctx.stroke();
    // the label sits under the fan, on a plate so lines don't run through it
    const txt = `spread ${Math.round(2 * Math.atan(lens.t) * 180 / Math.PI)}°`, w = ctx.measureText(txt).width;
    const lx = X(0) - 8, ly = Y(0) + r + 14;
    ctx.fillStyle = "rgba(17,19,23,0.9)"; ctx.fillRect(lx - 3, ly - 10, w + 6, 14);
    ctx.fillStyle = "#ffd23f"; ctx.textAlign = "left"; ctx.fillText(txt, lx, ly);
  }
  ctx.textAlign = "start";
}
function columnFrame(ctx, L, n) {
  ctx.strokeStyle = "rgba(233,228,216,0.25)"; ctx.lineWidth = 1;
  ctx.strokeRect(L.cx - 0.5, L.pyTop - 0.5, L.colW + 1, L.colH + 1);
  ctx.font = "11px 'JetBrains Mono', monospace"; ctx.fillStyle = "#9a978e"; ctx.textAlign = "center";
  ctx.fillText("picture", L.cx + L.colW / 2, L.pyTop + L.colH + 15);
  ctx.textAlign = "start";
}

// t in seconds; one pixel every `step` seconds, then a hold, then again
export function drawRenderDemo(ctx, W, Hpx, t, { lens = EYE_LENS, step = 0.22, hold = 2.2 } = {}) {
  const n = RENDER_PIXELS, cycle = n * step + hold;
  const tc = Math.max(0, t) % cycle, cur = Math.min(n - 1, Math.floor(tc / step)), done = tc >= n * step;
  const L = frame(ctx, W, Hpx, lens), { X, Y } = L;
  const shown = done ? n : cur + 1;
  const hits = [];
  for (let i = 0; i < n; i++) hits.push(trace(i, lens));
  // rays already traced, faintly, in the color they found
  ctx.lineWidth = 1;
  for (let i = 0; i < shown; i++) {
    if (!done && i === cur) continue;
    const h = hits[i];
    ctx.strokeStyle = h.color; ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.moveTo(X(0), Y(h.y0)); ctx.lineTo(X(h.z), Y(h.y)); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  source(ctx, L, lens);
  if (!done) { // the current ray, bright, from where it starts to what it hits
    const h = hits[cur];
    ctx.strokeStyle = "#ffd23f"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(0), Y(h.y0)); ctx.lineTo(X(h.z), Y(h.y)); ctx.stroke();
    ctx.fillStyle = "#ffd23f"; ctx.beginPath(); ctx.arc(X(h.z), Y(h.y), 3.5, 0, 7); ctx.fill();
  }
  // the picture: one column, top pixel first
  columnFrame(ctx, L, n);
  const cellH = L.colH / n;
  for (let i = 0; i < shown; i++) {
    if (!done && i === cur && tc - cur * step < step * 0.45) continue; // fills as the ray lands
    ctx.fillStyle = hits[i].color; ctx.fillRect(L.cx, L.pyTop + i * cellH, L.colW, cellH - 0.6);
  }
  if (!done) { ctx.strokeStyle = "#ffd23f"; ctx.lineWidth = 2; ctx.strokeRect(L.cx - 1, L.pyTop + cur * cellH - 1, L.colW + 2, cellH + 1.4); }
}
