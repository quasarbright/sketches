// The About's 3D pictures: the same small scene as the side-view demos, drawn the two ways the
// About explains. `traceImage` follows every pixel's ray (straight from a sensor with a spread,
// or curved for any f), and `projectBoxes` places each box corner by dividing its offset by
// f(z), the way the game's graphics card does. Both draw into ImageData / a 2D canvas, a few
// thousand pixels a frame, so the picture builds up while you watch.

export const SCENE3 = {
  ground: -1.6,
  // center, half sizes, turn about the vertical (radians), color. The red cube is turned so you
  // see two of its sides; straight through its middle it's 0.9 / cos 30° = 1.04 m deep, which is
  // what the side view (render-demo.mjs) shows.
  boxes: [
    { c: [0, -1.15, 3.9], half: [0.45, 0.45, 0.45], rot: Math.PI / 6, color: "#e8553d" },
    { c: [0.6, -0.15, 7.4], half: [1.1, 1.45, 0.8], rot: 0, color: "#5aa9e6" },
  ],
  balls: [[0, 0.55, 5.3, 0.38, "#f2c14e"]], // x, y, z, r, color
  sky: [201, 220, 239], grass: [95, 138, 67],
};
const FAR_Z = 8.4; // past the far side of the farthest box
const SUN = (() => { const v = [-0.5, 0.8, -0.35], l = Math.hypot(...v); return v.map((c) => c / l); })();
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const BOX_RGB = SCENE3.boxes.map((b) => rgb(b.color)), BALL_RGB = SCENE3.balls.map((b) => rgb(b[4]));
// the yellow ball can be left out of the scene (the corner demo only has boxes)
let ballsOn = true;
export function withoutBalls(fn) { return (...a) => { ballsOn = false; try { return fn(...a); } finally { ballsOn = true; } }; }
// a lens's sideways and up-down halves: { Ax, tx, Ay, ty }. { A, t } is the same for both; the
// two-lens mode gives each its own.
export const axes = (l) => (l.Ax !== undefined ? l : { Ax: l.A, tx: l.t, Ay: l.A, ty: l.t });

// into and out of a box's own frame (centered, unturned)
const toLocal = (b, x, y, z, dir = false) => {
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  if (!dir) { x -= b.c[0]; y -= b.c[1]; z -= b.c[2]; }
  return [c * x - s * z, y, s * x + c * z];
};
const toWorld = (b, v) => { const c = Math.cos(b.rot), s = Math.sin(b.rot); return [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]]; };
// the nearest hit along O + t·d, t > tMin: { t, n, c } or null
function hit(ox, oy, oz, dx, dy, dz, tMin = 1e-6, any = false) {
  let best = null;
  const take = (t, n, c) => { if (t > tMin && (!best || t < best.t)) best = { t, n, c }; };
  if (dy < 0 && !any) take((SCENE3.ground - oy) / dy, [0, 1, 0], null);
  SCENE3.boxes.forEach((b, k) => {
    let t0 = -Infinity, t1 = Infinity, axis = 0, sign = 0;
    const o = toLocal(b, ox, oy, oz), d = toLocal(b, dx, dy, dz, true);
    for (let a = 0; a < 3; a++) {
      const lo = -b.half[a], hi = b.half[a];
      if (Math.abs(d[a]) < 1e-12) { if (o[a] < lo || o[a] > hi) return; continue; }
      let ta = (lo - o[a]) / d[a], tb = (hi - o[a]) / d[a], sg = -1;
      if (ta > tb) { [ta, tb] = [tb, ta]; sg = 1; }
      if (ta > t0) { t0 = ta; axis = a; sign = sg; }
      if (tb < t1) t1 = tb;
    }
    if (t0 <= t1) { const n = [0, 0, 0]; n[axis] = sign; take(t0, toWorld(b, n), BOX_RGB[k]); }
  });
  if (ballsOn) SCENE3.balls.forEach(([bx, by, bz, r], k) => {
    const px = ox - bx, py = oy - by, pz = oz - bz;
    const a = dx * dx + dy * dy + dz * dz, b = 2 * (px * dx + py * dy + pz * dz), c = px * px + py * py + pz * pz - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return;
    const t = (-b - Math.sqrt(disc)) / (2 * a);
    take(t, null, BALL_RGB[k]);
    if (best && best.c === BALL_RGB[k] && !best.n) {
      const x = ox + dx * t - bx, y = oy + dy * t - by, z = oz + dz * t - bz;
      best.n = [x / r, y / r, z / r];
    }
  });
  return best;
}

// the color of a surface point, lit by the sun, with shadows and a little haze far off
function shade(x, y, z, n, c) {
  let base = c;
  if (!c) { // the ground: a checkerboard of 1 m tiles, so you can see it recede
    const k = (Math.floor(x) + Math.floor(z)) & 1 ? 1 : 0.9;
    base = SCENE3.grass.map((v) => v * k);
  }
  const lit = Math.max(0, n[0] * SUN[0] + n[1] * SUN[1] + n[2] * SUN[2]);
  const shadow = lit > 0 && hit(x + n[0] * 1e-3, y + n[1] * 1e-3, z + n[2] * 1e-3, ...SUN, 1e-4, true) ? 0 : 1;
  const k = 0.5 + 0.55 * lit * shadow;
  const haze = 1 - Math.exp(-Math.max(0, z) / 45);
  return base.map((v, i) => Math.min(255, v * k) * (1 - haze) + SCENE3.sky[i] * haze);
}
const skyAt = (v) => SCENE3.sky.map((c, i) => c * (0.88 + 0.12 * v) + [24, 20, 10][i] * (1 - v) * 0.3);

// One pixel's color. `lens` is { A, t } for straight rays from a sensor of half-height A whose
// rays leave at half-angle atan(t), { Ax, tx, Ay, ty } for a different lens across and up, or
// { h } for curved rays: the view's half-height at depth z.
// u and v run from -1 to 1 across and up; `aspect` is width / height.
export function pixel(lens, u, v, aspect) {
  if (lens.h) return curvedPixel(lens.h, u, v, aspect);
  const { Ax, tx, Ay, ty } = axes(lens);
  const ox = u * Ax * aspect, oy = v * Ay, dx = u * tx * aspect, dy = v * ty;
  const h = hit(ox, oy, 0, dx, dy, 1);
  if (!h) return skyAt(v);
  const x = ox + dx * h.t, y = oy + dy * h.t, z = h.t;
  return shade(x, y, z, h.n, h.c);
}
function inBox(x, y, z, b) { // no arrays: this runs for every step of every curved ray
  const c = Math.cos(b.rot), sn = Math.sin(b.rot), dx = x - b.c[0], dy = y - b.c[1], dz = z - b.c[2];
  return Math.abs(dy) <= b.half[1] && Math.abs(c * dx - sn * dz) <= b.half[0] && Math.abs(sn * dx + c * dz) <= b.half[2];
}
function inside(x, y, z) {
  if (y < SCENE3.ground) return -1;
  for (let k = 0; k < SCENE3.boxes.length; k++) if (inBox(x, y, z, SCENE3.boxes[k])) return k;
  if (ballsOn) for (let k = 0; k < SCENE3.balls.length; k++) {
    const [bx, by, bz, r] = SCENE3.balls[k];
    if ((x - bx) ** 2 + (y - by) ** 2 + (z - bz) ** 2 < r * r) return 100 + k;
  }
  return null;
}
// curved rays: walk out along the curve until it's inside something, then home in on the surface.
// Every ray steps through the same depths, so the lens is worked out there once per lens.
const STEPS = (() => { const zs = []; for (let z = 0.02; z < 40; z += 0.08 * (1 + z / 4)) zs.push(z); return zs; })();
const tables = new WeakMap();
function curvedPixel(h, u, v, aspect) {
  const r = curvedHit(h, u, v, aspect);
  return r ? shade(r.x, r.y, r.z, r.n, r.c) : skyAt(v);
}
// where a curved ray first meets something: { x, y, z, n, c }, or null for the sky
function curvedHit(h, u, v, aspect) {
  let hs = tables.get(h);
  if (!hs) { hs = STEPS.map(h); tables.set(h, hs); }
  const at = (z, s = h(z)) => (Number.isFinite(s) && s > 0 ? [u * s * aspect, v * s, z] : null);
  let zPrev = null;
  // everything but the ground is closer than FAR_Z, and a ray in the top half never reaches the
  // ground (it's above your line of sight, and the ground is below), so it can stop there
  const zEnd = v >= 0 ? FAR_Z : 40;
  for (let i = 0; i < STEPS.length && STEPS[i] < zEnd; i++) {
    const z = STEPS[i], sz = hs[i];
    if (!(sz > 0) || !Number.isFinite(sz)) { zPrev = null; continue; }
    const k = inside(u * sz * aspect, v * sz, z);
    if (k === null) { zPrev = z; continue; }
    // a ray that starts inside something (the ground, for the rays that begin far below you) sees it
    let lo = zPrev ?? z, hi = z;
    if (zPrev !== null) for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2, q = at(m); if (q && inside(...q) !== null) hi = m; else lo = m; }
    const [x, y, zz] = at(hi), kk = inside(x, y, zz) ?? k;
    let n, c = null;
    if (kk === -1) n = [0, 1, 0];
    else if (kk >= 100) { const [bx, by, bz, r] = SCENE3.balls[kk - 100]; n = [(x - bx) / r, (y - by) / r, (zz - bz) / r]; c = BALL_RGB[kk - 100]; }
    else { // the box face nearest the point
      const b = SCENE3.boxes[kk], p = toLocal(b, x, y, zz);
      let best = Infinity;
      for (let a = 0; a < 3; a++) for (const sg of [-1, 1]) {
        const d = Math.abs(p[a] - sg * b.half[a]);
        if (d < best) { best = d; n = [0, 0, 0]; n[a] = sg; }
      }
      n = toWorld(b, n);
      c = BOX_RGB[kk];
    }
    return { x, y, z: zz, n, c };
  }
  return null;
}

// A picture built up pixel by pixel, row by row from the top. `reset` starts a new one,
// `advance(n)` works out n more pixels, and `draw` puts what's done onto a 2D context.
export class Scan {
  constructor() { this.key = null; this.w = 0; this.h = 0; this.done = 0; }
  reset(key, w, h, lens) {
    this.key = key; this.lens = lens; this.done = 0; this.drawn = -1;
    if (w !== this.w || h !== this.h || !this.img) {
      this.w = w; this.h = h;
      this.img = new ImageData(w, h);
      this.cv = new OffscreenCanvas(w, h);
    }
    const d = this.img.data;
    for (let i = 0; i < d.length; i += 4) { d[i] = 17; d[i + 1] = 19; d[i + 2] = 23; d[i + 3] = 255; }
  }
  get total() { return this.w * this.h; }
  advance(n) {
    const end = Math.min(this.total, this.done + n), d = this.img.data, aspect = this.w / this.h;
    for (let i = this.done; i < end; i++) {
      const px = i % this.w, py = (i / this.w) | 0;
      const u = -1 + (2 * px + 1) / this.w, v = 1 - (2 * py + 1) / this.h;
      const c = typeof this.lens === "function" ? this.lens(u, v, aspect) : pixel(this.lens, u, v, aspect);
      d[4 * i] = c[0]; d[4 * i + 1] = c[1]; d[4 * i + 2] = c[2];
    }
    this.done = end;
  }
  // the pixel the scan is on, as u, v from -1 to 1
  headUV(i = this.done) {
    const px = i % this.w, py = (i / this.w) | 0;
    return [-1 + (2 * px + 1) / this.w, 1 - (2 * py + 1) / this.h];
  }
  // the first n pixels (as far as they're worked out), on the dark background, and a yellow mark
  // on pixel n: the picture as if it were being traced right now
  drawReveal(ctx, W, H, n, { x = 0, y = 0 } = {}) {
    n = Math.max(0, Math.min(this.done, Math.floor(n)));
    if (this.drawn !== this.done) { this.cv.getContext("2d").putImageData(this.img, 0, 0); this.drawn = this.done; }
    ctx.fillStyle = "#111317"; ctx.fillRect(x, y, W, H);
    const row = Math.floor(n / this.w), col = n % this.w, sx = W / this.w, sy = H / this.h;
    ctx.imageSmoothingEnabled = true;
    if (row > 0) ctx.drawImage(this.cv, 0, 0, this.w, row, x, y, W, row * sy);
    if (col > 0 && row < this.h) ctx.drawImage(this.cv, 0, row, col, 1, x, y + row * sy, col * sx, sy);
    if (n < this.total) {
      ctx.fillStyle = "#ffd23f";
      ctx.fillRect(x + col * sx - 2, y + row * sy - 2, Math.max(4, sx + 4), Math.max(4, sy + 4));
    }
  }
  draw(ctx, W, H, { head = true, x = 0, y = 0 } = {}) {
    this.cv.getContext("2d").putImageData(this.img, 0, 0); this.drawn = this.done;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.cv, x, y, W, H);
    if (head && this.done < this.total) { // where the scan is: a yellow mark on the current pixel
      const px = this.done % this.w, py = (this.done / this.w) | 0, sx = W / this.w, sy = H / this.h;
      ctx.fillStyle = "#ffd23f";
      ctx.fillRect(x + px * sx - 2, y + py * sy - 2, Math.max(4, sx + 4), Math.max(4, sy + 4));
    }
  }
}

// Every box corner in the world, in the order the corner demo places them: first one corner of
// the near red cube, then one of the far blue box (the two it slows down on), then the rest.
// Each is { p: [x, y, z], box, i } with i its index in its box (x fastest, then y, then z).
export const CORNERS = (() => {
  const all = [];
  SCENE3.boxes.forEach((b, box) => {
    let i = 0;
    for (const sz of [-1, 1]) for (const sy of [-1, 1]) for (const sx of [-1, 1]) {
      const v = toWorld(b, [sx * b.half[0], sy * b.half[1], sz * b.half[2]]);
      all.push({ p: [v[0] + b.c[0], v[1] + b.c[1], v[2] + b.c[2]], box, i: i++ });
    }
  });
  // a top corner of the red cube, and the blue box's top front right corner
  const first = [all.find((c) => c.box === 0 && c.i === 2), all.find((c) => c.box === 1 && c.i === 3)];
  return [...first, ...all.filter((c) => !first.includes(c))];
})();

// The graphics card's way, for straight rays: each corner of each box goes to the place in the
// picture where its offset from the line of sight, divided by f(z) = A + z·t, puts it. `placed`
// corners (of CORNERS) are shown; `join` (0..1) grows the edges and triangle diagonals between
// them; `fill` (0..1) fades the faces in and the wireframe and corners out.
export function projectBoxes(ctx, W, H, lens, { placed = CORNERS.length, join = 0, fill = 0 } = {}) {
  const aspect = W / H, f = (z) => lens.A + z * lens.t;
  const P = (x, y, z) => [W / 2 + (x / (f(z) * aspect)) * W / 2, H / 2 - (y / f(z)) * H / 2];
  // sky, and the ground below the horizon (where the ground plane meets the line of sight)
  ctx.fillStyle = `rgb(${SCENE3.sky})`; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = `rgb(${SCENE3.grass.map((c) => c * 0.95)})`; ctx.fillRect(0, H / 2, W, H / 2);
  const q = (box, i) => { const c = CORNERS.find((c) => c.box === box && c.i === i); return P(...c.p); };
  if (fill > 0) { // the faces, far ones first
    const faces = [];
    SCENE3.boxes.forEach((b, bi) => {
      const F = [[[0, 1, 3, 2], [0, 0, -1]], [[4, 5, 7, 6], [0, 0, 1]], [[0, 2, 6, 4], [-1, 0, 0]],
        [[1, 3, 7, 5], [1, 0, 0]], [[2, 3, 7, 6], [0, 1, 0]], [[0, 1, 5, 4], [0, -1, 0]]];
      for (const [idx, n0] of F) {
        const n = toWorld(b, n0);
        const c = idx.map((i) => CORNERS.find((k) => k.box === bi && k.i === i).p);
        const mid = [0, 1, 2].map((a) => c.reduce((s, p) => s + p[a], 0) / 4);
        // a face shows when the ray that reaches its middle is heading into it: that ray goes
        // (x, y)·t/f(z) sideways and up for every meter forward
        const fz = f(mid[2]);
        if (!(n[0] * mid[0] * lens.t / fz + n[1] * mid[1] * lens.t / fz + n[2] < 0)) continue;
        faces.push({ q: c.map((p) => P(...p)), z: mid[2], color: shade(...mid, n, rgb(b.color)) });
      }
    });
    faces.sort((a, b) => b.z - a.z);
    ctx.globalAlpha = fill;
    for (const fc of faces) {
      ctx.fillStyle = `rgb(${fc.color.map(Math.round)})`; ctx.beginPath();
      fc.q.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  const wire = 1 - fill;
  if (join > 0 && wire > 0) { // each box's edges, and one diagonal across each face: the triangles
    ctx.strokeStyle = `rgba(20,22,26,${0.85 * wire})`; ctx.lineWidth = 1.5;
    const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7],
      [0, 3], [4, 7], [0, 6], [1, 7], [2, 7], [0, 5]];
    for (let bi = 0; bi < SCENE3.boxes.length; bi++) for (const [a, b] of edges) {
      const [x0, y0] = q(bi, a), [x1, y1] = q(bi, b);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + (x1 - x0) * join, y0 + (y1 - y0) * join); ctx.stroke();
    }
  }
  if (wire > 0) for (let i = 0; i < Math.min(placed, CORNERS.length); i++) { // the corners placed so far
    const [x, y] = P(...CORNERS[i].p);
    ctx.fillStyle = `rgba(20,22,26,${wire})`;
    ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
  }
  return P;
}

/* ---------------- the rays, seen from outside ---------------- */

// The path pixel (u, v)'s ray takes, from where it starts to what it hits (or a way into the
// sky): a list of [x, y, z] points, and the color it finds.
export function rayPath(lens, u, v, aspect) {
  if (lens.h) {
    const r = curvedHit(lens.h, u, v, aspect), zEnd = r ? r.z : 12, pts = [];
    for (let i = 0; i <= 40; i++) {
      const z = 0.02 + (zEnd - 0.02) * (i / 40) ** 1.3, sz = lens.h(z);
      if (Number.isFinite(sz) && sz > 0 && Math.abs(v * sz) < 30) pts.push([u * sz * aspect, v * sz, z]);
    }
    return { pts, color: r ? shade(r.x, r.y, r.z, r.n, r.c) : skyAt(v), hit: !!r };
  }
  const { Ax, tx, Ay, ty } = axes(lens);
  const ox = u * Ax * aspect, oy = v * Ay, dx = u * tx * aspect, dy = v * ty;
  const h = hit(ox, oy, 0, dx, dy, 1), t = h ? h.t : 12;
  const end = [ox + dx * t, oy + dy * t, t];
  return { pts: [[ox, oy, 0], end], color: h ? shade(...end, h.n, h.c) : skyAt(v), hit: !!h };
}

// a camera off to your right and above, looking back across the scene, so you are on the left
// and the scene runs off to the right, as in the side views. The pictures put +x on the right
// (x right, y up, z ahead), and this camera uses the same handedness, so left in your picture is
// left here too, and a row scanned left to right sweeps left to right in this view.
const OUT = (() => {
  const pos = [6.5, 2.6, -1.0], target = [-0.5, -0.5, 4.5];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unit = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
  const f = unit(target.map((c, i) => c - pos[i]));
  const r = unit(cross([0, 1, 0], f)), up = cross(f, r);
  return { pos, f, r, up, tan: Math.tan(30 * Math.PI / 180) };
})();
// the outside camera's own picture of the scene (a plain camera, for the backdrop)
export function outsidePixel(u, v, aspect) {
  const { pos, f, r, up, tan } = OUT;
  const d = [0, 1, 2].map((i) => f[i] + r[i] * u * tan * aspect + up[i] * v * tan);
  const h = hit(...pos, ...d);
  if (!h) return skyAt(0.4 + 0.6 * v);
  const p = pos.map((c, i) => c + d[i] * h.t);
  return shade(...p, h.n, h.c);
}
// where a point lands in the outside camera's picture, w × h at (x0, y0), or null behind it
export function outsideXY(p, x0, y0, w, h) {
  const { pos, f, r, up, tan } = OUT;
  const q = p.map((c, i) => c - pos[i]);
  const z = q[0] * f[0] + q[1] * f[1] + q[2] * f[2];
  if (z < 0.05) return null;
  const s = (h / 2) / tan / z;
  return [x0 + w / 2 + (q[0] * r[0] + q[1] * r[1] + q[2] * r[2]) * s, y0 + h / 2 - (q[0] * up[0] + q[1] * up[1] + q[2] * up[2]) * s];
}
