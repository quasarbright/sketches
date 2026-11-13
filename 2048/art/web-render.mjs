// Renders art/web.webp, the cosmic web on the 131072 tile, in the look of the Millennium
// Simulation pictures. The web is a foam: voids bounded by filaments that meet at clusters.
// Here that's Voronoi edges at three scales (big bright strands, finer threads, a faint fine
// mesh), drawn as wavy white light with additive blending into a density map. The density is
// then colored the way those pictures are: dark violet, magenta, orange, and yellow-white
// where the most matter is.
//   node art/web-render.mjs        (from 2048/, needs @playwright/test)
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const SIZE = 640;

function draw(SIZE) {
  let seed = 131072;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const M = SIZE * 0.2; // past the edges, so the tile's drift never shows a border

  function delaunay(P) {
    const n = P.length, all = [...P, [-1e5, -1e5], [1e5, -1e5], [0, 1e5]];
    const circ = (a, b, c) => {
      const [ax, ay] = all[a], [bx, by] = all[b], [cx, cy] = all[c];
      const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
      const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
      const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
      return [ux, uy, (ax - ux) ** 2 + (ay - uy) ** 2];
    };
    let tris = [[n, n + 1, n + 2, ...circ(n, n + 1, n + 2)]];
    for (let i = 0; i < n; i++) {
      const [x, y] = all[i], bad = new Set(tris.filter((t) => (x - t[3]) ** 2 + (y - t[4]) ** 2 < t[5]));
      const edges = new Map();
      for (const t of bad) for (const [a, b] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
        const k = a < b ? a * 1e5 + b : b * 1e5 + a;
        edges.set(k, edges.has(k) ? null : [a, b]);
      }
      tris = tris.filter((t) => !bad.has(t));
      for (const e of edges.values()) if (e) tris.push([e[0], e[1], i, ...circ(e[0], e[1], i)]);
    }
    return tris;
  }
  // Voronoi cells of `count` points spread over the canvas and its margin: returns the
  // filaments (cell edges) and the clusters (cell corners)
  function foam(count) {
    const P = [];
    for (let i = 0; i < count; i++) P.push([-M + rnd() * (SIZE + 2 * M), -M + rnd() * (SIZE + 2 * M)]);
    const tris = delaunay(P), byEdge = new Map();
    for (const t of tris) for (const [a, b] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
      const k = a < b ? a * 1e5 + b : b * 1e5 + a;
      (byEdge.get(k) || byEdge.set(k, []).get(k)).push([t[3], t[4]]);
    }
    const edges = [...byEdge.values()].filter((c) => c.length === 2);
    const corners = tris.map((t) => [t[3], t[4]]).filter(([x, y]) => x > -M && x < SIZE + M && y > -M && y < SIZE + M);
    return { edges, corners };
  }

  const cv = document.createElement("canvas");
  cv.width = cv.height = SIZE;
  const g = cv.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, SIZE, SIZE);
  g.globalCompositeOperation = "lighter";
  g.lineCap = "round"; g.lineJoin = "round";

  function wavy([x1, y1], [x2, y2], amp) {
    const len = Math.hypot(x2 - x1, y2 - y1), nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
    const n = Math.max(4, Math.round(len / 5)), p1 = rnd() * 6.28, p2 = rnd() * 6.28;
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const t = i / n, w = Math.sin(t * Math.PI) * (Math.sin(t * 7 + p1) * 0.65 + Math.sin(t * 19 + p2) * 0.35) * len * amp;
      const x = x1 + (x2 - x1) * t + nx * w, y = y1 + (y2 - y1) * t + ny * w;
      i ? g.lineTo(x, y) : g.moveTo(x, y);
    }
  }
  function blob(x, y, r, a) {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${a})`); grad.addColorStop(0.3, `rgba(255,255,255,${a * 0.35})`); grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill();
  }

  // [cells, line alpha, line width, glow width, wave, cluster radius, cluster alpha, fibers]
  const scales = [
    [520, 0.13, 0.7, 0, 0.12, SIZE * 0.006, 0.2, 1],  // fine mesh in the voids
    [110, 0.2, 0.9, 6, 0.09, SIZE * 0.014, 0.35, 2],  // threads
    [16, 0.42, 1.1, 16, 0.06, SIZE * 0.04, 0.8, 6],   // the big strands (bundles of fibers) and their clusters
  ];
  const big = [];
  for (const [cells, a, w, gw, wave, cr, ca, fibers] of scales) {
    const { edges, corners } = foam(cells);
    for (const [p, q] of edges) {
      if (gw) { g.filter = `blur(${gw / 3}px)`; g.strokeStyle = `rgba(255,255,255,${a * 0.35})`; g.lineWidth = gw; wavy(p, q, wave); g.stroke(); g.filter = "none"; }
      // a strand is a loose bundle of fibers, each with its own wobble
      const spread = fibers > 1 ? SIZE * 0.006 * fibers : 0;
      for (let f = 0; f < fibers; f++) {
        const j = () => [(rnd() - 0.5) * spread, (rnd() - 0.5) * spread];
        const [dx1, dy1] = j(), [dx2, dy2] = j();
        g.strokeStyle = `rgba(255,255,255,${(a * (fibers > 1 ? 1.7 : 1)) / Math.sqrt(fibers)})`; g.lineWidth = w;
        wavy([p[0] + dx1, p[1] + dy1], [q[0] + dx2, q[1] + dy2], wave * (1 + rnd() * 0.8)); g.stroke();
      }
    }
    for (const [x, y] of corners) blob(x, y, cr * (0.7 + rnd() * 0.5), ca);
    if (cells === 16) big.push(...corners);
  }
  // matter piles up toward the big clusters: a broad glow around each
  g.filter = `blur(${SIZE * 0.03}px)`;
  for (const [x, y] of big) blob(x, y, SIZE * 0.14, 0.18);
  // and a faint glow over everything, so the voids are deep violet rather than black
  g.fillStyle = "rgba(255,255,255,.035)"; g.fillRect(0, 0, SIZE, SIZE);
  g.filter = "none";

  // color the density like the simulation pictures
  const stops = [[0, [10, 3, 22]], [0.18, [40, 9, 72]], [0.36, [96, 24, 150]], [0.55, [180, 52, 178]], [0.72, [250, 104, 98]], [0.86, [255, 178, 72]], [1, [255, 246, 210]]];
  const lut = [];
  for (let i = 0; i < 256; i++) {
    const v = 1 - Math.exp(-i / 255 * 2.6) ; // tone: soft rolloff toward the brightest
    const t = v / (1 - Math.exp(-2.6));
    let k = 0; while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const [t0, c0] = stops[k], [t1, c1] = stops[k + 1], u = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
    lut.push(c0.map((c, j) => Math.round(c + (c1[j] - c) * u)));
  }
  const img = g.getImageData(0, 0, SIZE, SIZE), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const c = lut[d[i]]; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; }
  g.globalCompositeOperation = "source-over";
  g.putImageData(img, 0, 0);
  return cv.toDataURL("image/webp", 0.88);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const url = await page.evaluate(draw, SIZE);
await browser.close();
writeFileSync(new URL("./web.webp", import.meta.url), Buffer.from(url.split(",")[1], "base64"));
console.log("wrote art/web.webp", Math.round((url.length * 3) / 4 / 1024) + " KB");
