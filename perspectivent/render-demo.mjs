// The About's "how a picture gets made" demo: a side view of a small scene, and one column of the
// picture beside it, filled in one pixel at a time. Pixel u's ray starts at height s·u·H on the
// sensor (a point when s = 0) and crosses the screen at height u·H; the pixel takes the color of
// the first thing the ray hits. The same rule the lens uses, worked by hand for a few pixels.

const SCENE = {
  eyeY: 0, ground: -1.6, D: 2, H: 1.1, zMax: 10,
  boxes: [ // z0, z1, y0, y1, color
    [3.0, 3.8, -1.6, -0.7, "#e8553d"],
    [6.2, 7.8, -1.6, 1.3, "#5aa9e6"],
  ],
  balls: [[4.8, 0.55, 0.38, "#f2c14e"]], // z, y, r, color
  sky: "#c9dcef", grass: "#5f8a43",
};
export const RENDER_PIXELS = 18;

// the first thing pixel i's ray hits: { t, z, y, color }
function trace(i, s) {
  const { D, H, ground, boxes, balls, zMax } = SCENE;
  const u = 1 - (2 * i + 1) / RENDER_PIXELS; // top pixel first
  const y0 = s * u * H, dy = (u * H - y0) / D; // per meter of depth
  let best = { z: zMax, y: y0 + dy * zMax, color: SCENE.sky };
  const take = (z, color) => { if (z > 1e-6 && z < best.z) best = { z, y: y0 + dy * z, color }; };
  if (dy < 0) take((ground - y0) / dy, SCENE.grass);
  for (const [z0, z1, b0, b1, c] of boxes) { // slabs: the front face, or the top/bottom
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

// t in seconds; one pixel every `step` seconds, then a hold, then again
export function drawRenderDemo(ctx, W, Hpx, t, { s = 0, step = 0.22, hold = 2.2 } = {}) {
  const { D, H, ground, boxes, balls, zMax } = SCENE;
  const n = RENDER_PIXELS, cycle = n * step + hold;
  const tc = Math.max(0, t) % cycle, cur = Math.min(n - 1, Math.floor(tc / step)), done = tc >= n * step;
  ctx.clearRect(0, 0, W, Hpx);
  const colW = 26, padR = 18 + colW + 22, padL = 16;
  const yLo = -2.1, yHi = 2.1;
  const X = (z) => padL + (z / zMax) * (W - padL - padR);
  const Y = (y) => Hpx * (yHi - y) / (yHi - yLo);
  // ground and things
  ctx.fillStyle = "rgba(95,138,67,0.35)"; ctx.fillRect(0, Y(ground), X(zMax) + 4, Hpx - Y(ground));
  for (const [z0, z1, b0, b1, c] of boxes) { ctx.fillStyle = c; ctx.globalAlpha = 0.75; ctx.fillRect(X(z0), Y(b1), X(z1) - X(z0), Y(b0) - Y(b1)); }
  for (const [bz, by, r, c] of balls) {
    ctx.fillStyle = c; ctx.beginPath();
    ctx.ellipse(X(bz), Y(by), X(bz + r) - X(bz), Y(by - r) - Y(by), 0, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // rays already traced, faintly, in the color they found
  const shown = done ? n : cur + 1;
  const hits = [];
  for (let i = 0; i < n; i++) hits.push(trace(i, s));
  ctx.lineWidth = 1;
  for (let i = 0; i < shown; i++) {
    if (!done && i === cur) continue;
    const h = hits[i];
    ctx.strokeStyle = h.color; ctx.globalAlpha = 0.35;
    ctx.beginPath(); ctx.moveTo(X(0), Y(h.y0)); ctx.lineTo(X(h.z), Y(h.y)); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // the screen and where the rays start
  ctx.strokeStyle = "#e8553d"; ctx.lineWidth = 2.5; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(X(D), Y(H)); ctx.lineTo(X(D), Y(-H)); ctx.stroke();
  ctx.strokeStyle = "#5aa9e6"; ctx.fillStyle = "#5aa9e6";
  if (s > 0.01) { ctx.beginPath(); ctx.moveTo(X(0), Y(s * H)); ctx.lineTo(X(0), Y(-s * H)); ctx.stroke(); }
  else { ctx.beginPath(); ctx.arc(X(0), Y(0), 3.5, 0, 7); ctx.fill(); }
  // the current ray, bright, from its start through the screen to what it hits
  const pyTop = Y(H), cellH = (Y(-H) - Y(H)) / n, cx = W - 18 - colW;
  if (!done) {
    const h = hits[cur];
    ctx.strokeStyle = "#ffd23f"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(0), Y(h.y0)); ctx.lineTo(X(h.z), Y(h.y)); ctx.stroke();
    ctx.fillStyle = "#ffd23f"; ctx.beginPath(); ctx.arc(X(h.z), Y(h.y), 3.5, 0, 7); ctx.fill();
    ctx.fillStyle = "#e8553d"; ctx.beginPath(); ctx.arc(X(D), Y(h.u * H), 3, 0, 7); ctx.fill();
  }
  // the picture: one column, top pixel first, the same height as the screen
  ctx.strokeStyle = "rgba(233,228,216,0.25)"; ctx.lineWidth = 1;
  ctx.strokeRect(cx - 0.5, pyTop - 0.5, colW + 1, cellH * n + 1);
  for (let i = 0; i < shown; i++) {
    if (!done && i === cur && tc - cur * step < step * 0.45) continue; // fills as the ray lands
    ctx.fillStyle = hits[i].color; ctx.fillRect(cx, pyTop + i * cellH, colW, cellH - 0.6);
  }
  if (!done) { ctx.strokeStyle = "#ffd23f"; ctx.lineWidth = 2; ctx.strokeRect(cx - 1, pyTop + cur * cellH - 1, colW + 2, cellH + 1.4); }
  ctx.font = "11px 'JetBrains Mono', monospace"; ctx.fillStyle = "#9a978e"; ctx.textAlign = "center";
  ctx.fillText("picture", cx + colW / 2, pyTop + cellH * n + 15);
  ctx.fillText("screen", X(D), Y(-H) + 15);
  ctx.fillText(s > 0.01 ? "sensor" : "eye", X(0) + 14, Y(Math.max(s * H, 0.15)) - 8);
  ctx.textAlign = "start";
}
