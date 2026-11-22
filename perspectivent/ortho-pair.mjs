// The About's perspective-vs-orthographic demo: two balls, the left one still and the right one
// rolling off far away and back, seen from an eye (perspective) and from a sensor with no spread
// (orthographic) side by side. The still parts of each picture are traced once; every frame only
// the moving ball's patch (and its shadow) is traced again.

const GROUND = -1.0, R = 0.35, NEAR_Z = 2.2, FAR_Z = 30, PERIOD = 9;
// the eye spreads 0.55 m per meter ahead; the sensor is as tall as the eye's view at the balls'
// starting distance, so up close both pictures are the same
export const PAIR_LENSES = [
  { name: "perspective", A: 0, t: 0.55 },
  { name: "orthographic", A: 0.55 * NEAR_Z, t: 0 },
];
const SUN = (() => { const v = [-0.5, 0.8, -0.35], l = Math.hypot(...v); return v.map((c) => c / l); })();
const SKY = [201, 220, 239], GRASS = [95, 138, 67];
const BALLS = [[-0.6, GROUND + R, NEAR_Z, [242, 193, 78]], [0.6, GROUND + R, NEAR_Z, [232, 85, 61]]];

// the moving ball's distance at time t: out and back, easing at each end
export function farBallZ(t) {
  const u = (t % PERIOD) / PERIOD;
  return NEAR_Z + (FAR_Z - NEAR_Z) * (1 - Math.cos(2 * Math.PI * u)) / 2;
}

function sphereT(ox, oy, oz, dx, dy, dz, b) {
  const px = ox - b[0], py = oy - b[1], pz = oz - b[2];
  const a = dx * dx + dy * dy + dz * dz, bb = 2 * (px * dx + py * dy + pz * dz), c = px * px + py * py + pz * pz - R * R;
  const disc = bb * bb - 4 * a * c;
  if (disc < 0) return -1;
  return (-bb - Math.sqrt(disc)) / (2 * a);
}
// one pixel's color, for the balls at `balls`
function trace(ox, oy, dx, dy, balls, out, o) {
  let best = Infinity, hitB = -1;
  for (let k = 0; k < balls.length; k++) {
    const t = sphereT(ox, oy, 0, dx, dy, 1, balls[k]);
    if (t > 1e-6 && t < best) { best = t; hitB = k; }
  }
  let gt = -1;
  if (oy < GROUND) gt = 0; // a ray that starts under the ground sees it
  else if (dy < 0) gt = (GROUND - oy) / dy;
  let col, x, y, z, n;
  if (hitB >= 0 && (gt < 0 || best < gt)) {
    const b = balls[hitB];
    x = ox + dx * best; y = oy + dy * best; z = best;
    n = [(x - b[0]) / R, (y - b[1]) / R, (z - b[2]) / R];
    col = b[3];
  } else if (gt >= 0) {
    x = ox + dx * gt; y = GROUND; z = gt; n = [0, 1, 0];
    const k = (Math.floor(x) + Math.floor(z)) & 1 ? 1 : 0.9;
    col = [GRASS[0] * k, GRASS[1] * k, GRASS[2] * k];
  } else {
    const v = Math.max(0, Math.min(1, 0.5 + dy));
    out[o] = SKY[0] * (0.9 + 0.1 * v); out[o + 1] = SKY[1] * (0.9 + 0.1 * v); out[o + 2] = SKY[2] * (0.92 + 0.08 * v);
    return;
  }
  let lit = Math.max(0, n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2]);
  if (lit > 0) for (const b of balls) { // shadows
    if (b === balls[hitB] && col === b[3]) continue;
    if (sphereT(x, y, z, SUN[0], SUN[1], SUN[2], b) > 1e-4) { lit = 0; break; }
  }
  const s = 0.5 + 0.55 * lit, haze = 1 - Math.exp(-Math.max(0, z) / 45);
  for (let i = 0; i < 3; i++) out[o + i] = Math.min(255, col[i] * s) * (1 - haze) + SKY[i] * haze;
}

class Pic {
  constructor(w, lens) {
    this.w = w; this.lens = lens;
    this.bg = new ImageData(w, w); this.img = new ImageData(w, w); this.cv = new OffscreenCanvas(w, w);
    this.row = 0; // background rows done
    this.bg.data.fill(255);
  }
  ray(px, py) {
    const u = -1 + (2 * px + 1) / this.w, v = 1 - (2 * py + 1) / this.w, { A, t } = this.lens;
    return [u * A, v * A, u * t, v * t];
  }
  // the still scene (the moving ball left out), a few rows at a time
  advanceBg(ms) {
    const t0 = performance.now(), d = this.bg.data, still = [BALLS[0]];
    while (this.row < this.w && performance.now() - t0 < ms) {
      for (let px = 0; px < this.w; px++) { const [ox, oy, dx, dy] = this.ray(px, this.row); trace(ox, oy, dx, dy, still, d, 4 * (this.row * this.w + px)); }
      this.row++;
    }
    return this.row === this.w;
  }
  // where a point lands, in pixels
  project(x, y, z) {
    const { A, t } = this.lens, f = A + z * t;
    return [(x / f + 1) / 2 * this.w, (1 - y / f) / 2 * this.w];
  }
  frame(ballZ) {
    const balls = [BALLS[0], [BALLS[1][0], BALLS[1][1], ballZ, BALLS[1][3]]], b = balls[1];
    this.img.data.set(this.bg.data);
    // the patch the ball and its shadow can cover
    const sc = (b[1] - GROUND) / SUN[1], sh = [b[0] - SUN[0] * sc, GROUND, b[2] - SUN[2] * sc];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of [b, sh]) for (const ax of [-1, 1]) for (const ay of [-1, 1]) for (const az of [-1, 1]) {
      const e = c === sh ? 2.2 * R : R;
      const [px, py] = this.project(c[0] + ax * e, c[1] + ay * (c === sh ? 0.01 : e), Math.max(0.05, c[2] + az * e));
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
    x0 = Math.max(0, Math.floor(x0) - 2); y0 = Math.max(0, Math.floor(y0) - 2);
    x1 = Math.min(this.w, Math.ceil(x1) + 2); y1 = Math.min(this.w, Math.ceil(y1) + 2);
    const d = this.img.data;
    for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) {
      const [ox, oy, dx, dy] = this.ray(px, py);
      trace(ox, oy, dx, dy, balls, d, 4 * (py * this.w + px));
    }
    this.cv.getContext("2d").putImageData(this.img, 0, 0);
  }
}

export function pairLayout(W, H) {
  const gap = 14, pic = Math.round(Math.min(H - 22, (W - gap) / 2));
  const x0 = Math.round((W - 2 * pic - gap) / 2);
  return [0, 1].map((i) => ({ x: x0 + i * (pic + gap), y: 0, w: pic, h: pic }));
}

export function drawOrthoPair(ctx, W, H, dpr, t, store) {
  const boxes = pairLayout(W, H), pw = Math.round(boxes[0].w * dpr);
  if (!store.pics || store.pics[0].w !== pw) store.pics = PAIR_LENSES.map((l) => new Pic(pw, l));
  const z = farBallZ(t);
  ctx.clearRect(0, 0, W, H);
  store.pics.forEach((p, i) => {
    const B = boxes[i];
    if (p.advanceBg(12)) { p.frame(z); ctx.imageSmoothingEnabled = true; ctx.drawImage(p.cv, B.x, B.y, B.w, B.h); }
    else { ctx.fillStyle = "#111317"; ctx.fillRect(B.x, B.y, B.w, B.h); }
    ctx.strokeStyle = "rgba(233,228,216,0.25)"; ctx.lineWidth = 1;
    ctx.strokeRect(B.x - 0.5, B.y - 0.5, B.w + 1, B.h + 1);
    ctx.font = "11px 'JetBrains Mono', monospace"; ctx.fillStyle = "#9a978e"; ctx.textAlign = "center";
    ctx.fillText(p.lens.name, B.x + B.w / 2, B.y + B.h + 15);
    ctx.textAlign = "start";
  });
  return `The red ball is ${z.toFixed(1)} m ahead. Perspective draws it at ${(NEAR_Z / z).toFixed(2)} of its size up close; orthographic always at full size.`;
}
