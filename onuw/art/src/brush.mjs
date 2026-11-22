// Tiny vector brush for the card art. Figures are built from smooth closed shapes (blob) and
// variable-width strokes (brush), all filled flat, then cut with background-colored strokes.
// Coordinates are on a 500×700 card.

const r = (n) => Math.round(n * 10) / 10;

// Catmull-Rom through points; returns a dense polyline.
export function spline(pts, closed = false, steps = 14) {
  const n = pts.length, out = [];
  const P = (i) => closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}

const poly = (pts) => "M" + pts.map((p) => `${r(p[0])} ${r(p[1])}`).join("L") + "Z";

// Closed smooth shape through points. Points may be [x, y] or [x, y, "c"] for a sharp corner.
export function blob(pts) {
  // split at sharp corners so they stay sharp
  if (!pts.some((p) => p[2] === "c")) return poly(spline(pts, true));
  const n = pts.length, start = pts.findIndex((p) => p[2] === "c");
  const rot = [...pts.slice(start), ...pts.slice(0, start), pts[start]];
  let out = [], run = [rot[0]];
  for (let i = 1; i < rot.length; i++) {
    run.push(rot[i]);
    if (rot[i][2] === "c" || i === rot.length - 1) { out = out.concat(spline(run, false).slice(out.length ? 1 : 0)); run = [rot[i]]; }
  }
  return poly(out);
}

// Variable-width stroke along a smooth path. w: number, [w0, w1], or array per point (interpolated).
export function brush(pts, w = 10, { cap = "round", capStart = cap, capEnd = cap } = {}) {
  const line = spline(pts, false, 16), n = line.length;
  const ws = Array.isArray(w) ? w : [w, w];
  const width = (t) => { const f = t * (ws.length - 1), i = Math.min(ws.length - 2, Math.floor(f)); return ws[i] + (ws[i + 1] - ws[i]) * (f - i); };
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1]; const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    const h = width(i / (n - 1)) / 2, p = line[i];
    L.push([p[0] - dy * h, p[1] + dx * h]); R.push([p[0] + dy * h, p[1] - dx * h]);
  }
  const capPts = (p, from, to, h) => { const out = []; const a0 = Math.atan2(from[1] - p[1], from[0] - p[0]); for (let k = 1; k < 8; k++) { const a = a0 + Math.PI * k / 8 * -1; out.push([p[0] + Math.cos(a) * h, p[1] + Math.sin(a) * h]); } return out; };
  let pts2 = [...L];
  const hEnd = width(1) / 2, hStart = width(0) / 2;
  if (capEnd === "round" && hEnd > .3) pts2 = pts2.concat(capPts(line[n - 1], L[n - 1], R[n - 1], hEnd));
  pts2 = pts2.concat(R.reverse());
  if (capStart === "round" && hStart > .3) pts2 = pts2.concat(capPts(line[0], R[R.length - 1], L[0], hStart));
  return poly(pts2);
}

// A set of tapering strands (hair, fur, claws): each from a base point along a direction.
export const strand = (pts, w0, w1 = 0) => brush(pts, [w0, w1]);

// layers: back to front. Each is a path string (ink) or { d, fill: "ink" | "bg" | color, halo: gap width }.
// A halo outlines the shape in the background color, separating it from what's behind it.
let maskId = 0;
export function card({ bg, ink, layers, transform = "" }) {
  const col = (f) => f === "bg" ? bg : f === "ink" || !f ? ink : f;
  const path = (d, fill, extra = "") => `<path d="${d}" fill="${fill}"${extra}/>`;
  // A layer is a path string, { d, fill, halo }, { layers: [...] } or { group: [...paths], halo, fill }: a group's halo
  // outlines the union of its shapes, so strands and claws don't each get their own outline.
  const one = (l) => {
    if (Array.isArray(l)) return l.map(one).join("\n");
    if (!l) return "";
    if (typeof l === "string") return path(l, ink);
    if (l.transform) return `<g transform="${l.transform}">${one({ ...l, transform: undefined })}</g>`;
    if (l.layers) return l.layers.map(one).join("\n");   // a nested scene, e.g. another card's figure drawn small
    const ds = l.group ? l.group.flat(Infinity) : [l.d];
    let stroke = l.halo ? ds.map((d) => path(d, bg, ` stroke="${bg}" stroke-width="${l.halo * 2}" stroke-linejoin="round"`)).join("\n") : "";
    // roots: circles [x, y, r] where the halo is left out, so a limb grows out of the body
    // without an outline (or a flat stroke end) showing where it joins.
    if (stroke && l.roots) {
      const id = `root${++maskId}`;
      stroke = `<mask id="${id}" maskUnits="userSpaceOnUse" x="-100" y="-100" width="700" height="900"><rect x="-100" y="-100" width="700" height="900" fill="#fff"/>${l.roots.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#000"/>`).join("")}</mask><g mask="url(#${id})">${stroke}</g>`;
    }
    return stroke + ds.map((d) => path(d, col(l.fill))).join("\n");
  };
  const body = layers.map(one).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 700">\n<rect width="500" height="700" fill="${bg}"/>\n<g${transform ? ` transform="${transform}"` : ""}>\n${body}\n</g>\n</svg>\n`;
}

// Seeded random, so a figure renders the same every build.
export function rng(seed = 1) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

// Fur or hair along a path: tapered strands sticking out of one side (side = 1 left of travel, -1 right),
// leaning back along the path by `lean` (0..1), lengths jittered between len[0] and len[1].
export function fringe(pts, { n = 10, len = [20, 40], w = 16, side = 1, lean = .5, curl = .3, seed = 7, from = 0, to = 1 } = {}) {
  const line = spline(pts, false, 20), rand = rng(seed), out = [];
  for (let k = 0; k < n; k++) {
    const t = from + (to - from) * (k + .2 + .6 * rand()) / n, i = Math.min(line.length - 2, Math.floor(t * (line.length - 1)));
    const p = line[i], q = line[i + 1]; let dx = q[0] - p[0], dy = q[1] - p[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const nx = -dy * side, ny = dx * side, l = len[0] + (len[1] - len[0]) * rand(), ww = w * (.75 + .5 * rand());
    const tip = [p[0] + (nx * (1 - lean) + dx * lean) * l, p[1] + (ny * (1 - lean) + dy * lean) * l];
    const base = [p[0] - nx * ww * .6, p[1] - ny * ww * .6];
    const mid = [(base[0] + tip[0]) / 2 + nx * curl * l * .12, (base[1] + tip[1]) / 2 + ny * curl * l * .12];
    out.push(brush([base, mid, tip], [ww, ww * .55, 0]));
  }
  return out;
}

// A clawed hand: palm at p, pointing toward angle a (degrees), fingers spread over `spread` degrees.
export function claws(p, a, { size = 1, spread = 70, n = 4, curl = 18, palm = 26, len = 48 } = {}) {
  const out = [], rad = (d) => d * Math.PI / 180;
  out.push(brush([[p[0] - Math.cos(rad(a)) * palm * .4 * size, p[1] - Math.sin(rad(a)) * palm * .4 * size], [p[0] + Math.cos(rad(a)) * palm * .5 * size, p[1] + Math.sin(rad(a)) * palm * .5 * size]], [palm * size, palm * .9 * size]));
  for (let i = 0; i < n; i++) {
    const ang = a - spread / 2 + spread * i / (n - 1), base = [p[0] + Math.cos(rad(ang)) * palm * .45 * size, p[1] + Math.sin(rad(ang)) * palm * .45 * size];
    const L = (n > 3 && i === 0 ? .75 : 1) * len * size;
    const k1 = [base[0] + Math.cos(rad(ang)) * L * .5, base[1] + Math.sin(rad(ang)) * L * .5];
    const tip = [base[0] + Math.cos(rad(ang + curl)) * L, base[1] + Math.sin(rad(ang + curl)) * L];
    out.push(brush([base, k1, tip], [10 * size, 7 * size, 0]));
  }
  return out;
}

// A four-point sparkle.
export const sparkle = (x, y, r, k = .22) => `M${x} ${y - r}Q${x + r * k} ${y - r * k} ${x + r} ${y}Q${x + r * k} ${y + r * k} ${x} ${y + r}Q${x - r * k} ${y + r * k} ${x - r} ${y}Q${x - r * k} ${y - r * k} ${x} ${y - r}Z`;

// A rectangle (card) centered at x,y, size w×h, rotated by a degrees, corner radius rr.
export function rect(x, y, w, h, a = 0, rr = 6) {
  const c = Math.cos(a * Math.PI / 180), s = Math.sin(a * Math.PI / 180), P = (u, v) => [x + u * c - v * s, y + u * s + v * c];
  const hw = w / 2, hh = h / 2, pts = [P(-hw + rr, -hh), P(hw - rr, -hh), P(hw, -hh + rr), P(hw, hh - rr), P(hw - rr, hh), P(-hw + rr, hh), P(-hw, hh - rr), P(-hw, -hh + rr)];
  const q = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`, C = [P(hw, -hh), P(hw, hh), P(-hw, hh), P(-hw, -hh)];
  return `M${q(pts[0])}L${q(pts[1])}Q${q(C[0])} ${q(pts[2])}L${q(pts[3])}Q${q(C[1])} ${q(pts[4])}L${q(pts[5])}Q${q(C[2])} ${q(pts[6])}L${q(pts[7])}Q${q(C[3])} ${q(pts[0])}Z`;
}
// The little card that appears in role art: always the same size, showing a simple version of the real card
// back (a border and the full moon as a plain circle). s scales it back up inside a figure drawn at a smaller scale.
export function minicard(x, y, a = 0, s = 1) {
  const R = (w, h, r) => rect(x, y, w * s, h * s, a, r * s), r = 9 * s;
  return [{ d: R(46, 66, 7), halo: 4 }, { d: R(36, 56, 5), fill: "bg" }, `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`];
}
// Transform a path's points: used to place a shape built at the origin.
export const at = (x, y, a = 0, sc = 1) => `translate(${x} ${y}) rotate(${a}) scale(${sc})`;

// A menacing eye for a wolf in profile facing right: a straight top edge slanting down toward the
// snout (the scowl), a rounded lower lid, and a sharp inner corner. `len` and `h` set its size.
// A wolf's eye in profile, as on a real wolf: an almond with both corners pointed, the outer (ear-side)
// corner raised a so the eye slants up toward the ear. Facing right; use pupil() with the same args.
const eyeFrame = (x, y, a) => (u, v) => { const r = a * Math.PI / 180; return [x + u * Math.cos(r) - v * Math.sin(r), y + u * Math.sin(r) + v * Math.cos(r)]; };
export function eye(x, y, { len = 22, h = 10, a = 12 } = {}) {
  const L = len / 2, P = eyeFrame(x, y, a);
  return blob([[...P(-L, 0), "c"], P(-L * .2, -h * .5), P(L * .5, -h * .38), [...P(L, h * .12), "c"], P(L * .2, h * .46), P(-L * .5, h * .3)]);
}
// A heavy brow over eye(): a cut that slopes down toward the nose, close over the lid, so the eye scowls.
export function brow(x, y, { len = 22, h = 10, a = 12 } = {}) {
  const L = len / 2, P = eyeFrame(x, y, a - 34);
  return brush([P(-L * 1.2, -h * 1.1), P(0, -h * .95), P(L * 1.15, -h * .55)], [2, h * .32, 1]);
}
export function pupil(x, y, { len = 22, h = 10, a = 12 } = {}) {
  // the pupil sits high and forward, half hidden under the upper lid: a glare, not a stare
  const [cx, cy] = eyeFrame(x, y, a)(len * .06, -h * .08), r = h * .44;
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
}

// A digitigrade wolf paw standing on y, toes pointing `dir` (1 right, -1 left): compact, heel raised, two toe bumps.
export function paw(x, y, { s = 16, dir = 1 } = {}) {
  const P = (u, v) => [x + dir * u * s, y + v * s];
  return blob([P(-.8, -.9), P(-.1, -1.25), P(.55, -.95), P(.95, -.55), [...P(1.15, -.05), "c"], P(.75, 0), P(.35, -.08), [...P(-.1, 0), "c"], P(-.75, -.2)]);
}
// A shoe standing on y, toe pointing `dir`: heel, instep, rounded toe, flat sole.
export function boot(x, y, { s = 22, dir = 1 } = {}) {
  const P = (u, v) => [x + dir * u * s, y + v * s];
  return blob([[...P(-.75, -1.1), "c"], P(.2, -1.05), P(.65, -.6), P(1.25, -.42), P(1.5, -.15), [...P(1.45, .05), "c"], [...P(-.8, .05), "c"]]);
}
