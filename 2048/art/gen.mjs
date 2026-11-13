// Generates the SVG art for the special tiles: node gen.mjs <out dir>. Seeded, so it's reproducible.
import { writeFileSync } from "node:fs";
let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const f = (v) => +v.toFixed(2);
const uri = (svg) => svg.replace(/\s+/g, " "); // collapse the template's whitespace

// ---- aurora: a curtain of rays along a wavy lower edge; periodic over its width so it can scroll
function aurora() {
  const W = 200, H = 100;
  const edge = (x) => 64 + 8 * Math.sin((x / W) * 2 * Math.PI * 2) + 4 * Math.sin((x / W) * 2 * Math.PI * 5 + 1);
  let rays = "";
  for (let x = 0; x < W; x += 0.9) {
    const y = edge(x), h = 22 + rnd() * 34, o = 0.25 + rnd() * 0.75, w = 0.5 + rnd() * 1.1;
    rays += `<rect x='${f(x)}' y='${f(y - h)}' width='${f(w)}' height='${f(h + 3)}' opacity='${f(o)}'/>`;
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${W} ${H}' preserveAspectRatio='none'>
    <defs><linearGradient id='r' x1='0' y1='1' x2='0' y2='0'>
      <stop offset='0' stop-color='#e8fff0'/><stop offset='.08' stop-color='#5dff9c'/>
      <stop offset='.45' stop-color='#22e0a0' stop-opacity='.8'/><stop offset='.75' stop-color='#b44dff' stop-opacity='.55'/>
      <stop offset='1' stop-color='#ff4dbb' stop-opacity='0'/></linearGradient>
      <filter id='b' x='-10%' y='-10%' width='120%' height='120%'><feGaussianBlur stdDeviation='2.5'/></filter></defs>
    <g fill='url(#r)'><g filter='url(#b)'>${rays}</g>${rays}</g></svg>`;
  return uri(svg);
}

// ---- galaxy: two logarithmic spiral arms of gas and stars around a bright core. Gas color
// shifts from warm near the core to blue at the rim; pink knots are star-forming regions.
function galaxy() {
  const gas = { warm: "", mid: "", blue: "" };
  let stars = "", knots = "";
  for (let arm = 0; arm < 2; arm++) {
    for (let i = 0; i < 700; i++) {
      const th = rnd() * 3.4 * Math.PI, r = 4.5 * Math.exp(0.2 * th);
      if (r > 46) continue;
      const spread = (rnd() - 0.5) * (2 + r * 0.22), a = th + arm * Math.PI;
      const x = 50 + Math.cos(a) * r - Math.sin(a) * spread, y = 50 + Math.sin(a) * r + Math.cos(a) * spread;
      const band = r < 14 ? "warm" : r < 26 ? "mid" : "blue";
      gas[band] += `<circle cx='${f(x)}' cy='${f(y)}' r='${f(1.8 + rnd() * 2.4)}'/>`;
      if (rnd() < 0.55) stars += `<circle cx='${f(x + (rnd() - .5) * 2)}' cy='${f(y + (rnd() - .5) * 2)}' r='${f(0.18 + rnd() * 0.4)}'/>`;
      if (r > 12 && rnd() < 0.05) knots += `<circle cx='${f(x)}' cy='${f(y)}' r='${f(0.7 + rnd() * 0.9)}'/>`;
    }
  }
  // a haze of loose stars between the arms
  for (let i = 0; i < 260; i++) {
    const a = rnd() * 2 * Math.PI, r = Math.sqrt(rnd()) * 40;
    stars += `<circle cx='${f(50 + Math.cos(a) * r)}' cy='${f(50 + Math.sin(a) * r)}' r='${f(0.15 + rnd() * 0.25)}' opacity='.6'/>`;
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>
    <defs><radialGradient id='c'><stop offset='0' stop-color='#ffffff'/><stop offset='.18' stop-color='#fff1c8'/>
      <stop offset='.45' stop-color='#ffc070' stop-opacity='.55'/><stop offset='1' stop-color='#ff9a5a' stop-opacity='0'/></radialGradient>
      <radialGradient id='h'><stop offset='0' stop-color='#7a6bff' stop-opacity='.45'/><stop offset='.7' stop-color='#3a2a9a' stop-opacity='.2'/><stop offset='1' stop-color='#3a2a9a' stop-opacity='0'/></radialGradient>
      <filter id='b' x='-10%' y='-10%' width='120%' height='120%'><feGaussianBlur stdDeviation='1.8'/></filter>
      <filter id='s'><feGaussianBlur stdDeviation='.35'/></filter></defs>
    <circle cx='50' cy='50' r='48' fill='url(#h)'/>
    <g filter='url(#b)'>
      <g fill='#ffcf8a' opacity='.32'>${gas.warm}</g>
      <g fill='#c58cff' opacity='.3'>${gas.mid}</g>
      <g fill='#5f8dff' opacity='.32'>${gas.blue}</g></g>
    <g fill='#ff5fc8' filter='url(#s)'>${knots}</g>
    <g fill='#f2f5ff'>${stars}</g>
    <circle cx='50' cy='50' r='19' fill='url(#c)'/></svg>`;
  return uri(svg);
}

// (the cosmic web is a raster: art/web-render.mjs)

// ---- lava: plates of dark cooled crust split by glowing cracks. The cracks are the edges of a
// Voronoi diagram (from a Bowyer-Watson Delaunay triangulation), made jagged. lava-glow.svg is
// the same cracks blurred, for the tile to pulse.
function delaunay(pts) {
  const big = [[-1e3, -1e3], [1e3, -1e3], [0, 1e3]];
  const P = [...pts, ...big], n = pts.length;
  const circ = (a, b, c) => {
    const [ax, ay] = P[a], [bx, by] = P[b], [cx, cy] = P[c];
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
    return [ux, uy, (ax - ux) ** 2 + (ay - uy) ** 2];
  };
  let tris = [[n, n + 1, n + 2, ...circ(n, n + 1, n + 2)]];
  for (let i = 0; i < n; i++) {
    const [x, y] = P[i], bad = tris.filter((t) => (x - t[3]) ** 2 + (y - t[4]) ** 2 < t[5]);
    const edges = new Map();
    for (const t of bad) for (const [a, b] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
      const k = a < b ? `${a},${b}` : `${b},${a}`; edges.set(k, edges.has(k) ? null : [a, b]);
    }
    tris = tris.filter((t) => !bad.includes(t));
    for (const e of edges.values()) if (e) tris.push([e[0], e[1], i, ...circ(e[0], e[1], i)]);
  }
  return tris;
}
function cracks() {
  const pts = [];
  for (let tries = 0; tries < 6000 && pts.length < 30; tries++) {
    const x = -15 + rnd() * 130, y = -15 + rnd() * 130;
    if (pts.every(([u, v]) => Math.hypot(u - x, v - y) > 22)) pts.push([x, y]);
  }
  const tris = delaunay(pts);
  // Voronoi edge = the two circumcenters of the triangles sharing a Delaunay edge
  const byEdge = new Map();
  for (const t of tris) for (const [a, b] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
    const k = a < b ? `${a},${b}` : `${b},${a}`;
    (byEdge.get(k) || byEdge.set(k, []).get(k)).push([t[3], t[4]]);
  }
  let d = "";
  for (const cs of byEdge.values()) {
    if (cs.length !== 2) continue;
    const [[x1, y1], [x2, y2]] = cs;
    if (Math.max(Math.abs(x1 - 50), Math.abs(y1 - 50), Math.abs(x2 - 50), Math.abs(y2 - 50)) > 70) continue;
    // jagged: split into a few segments pushed sideways at random
    const len = Math.hypot(x2 - x1, y2 - y1), nx = -(y2 - y1) / len, ny = (x2 - x1) / len, k = Math.max(2, Math.round(len / 4));
    d += `M${f(x1)} ${f(y1)}`;
    for (let i = 1; i <= k; i++) {
      const t = i / k, j = i === k ? 0 : (rnd() - 0.5) * 2.4;
      d += `L${f(x1 + (x2 - x1) * t + nx * j)} ${f(y1 + (y2 - y1) * t + ny * j)}`;
    }
  }
  return { pts, d };
}
function lava() {
  const { pts, d } = cracks();
  const plates = pts.map(([x, y]) => `<circle cx='${f(x)}' cy='${f(y)}' r='${f(5 + rnd() * 6)}' fill='${["#2a0805", "#1a0503", "#33100a"][Math.floor(rnd() * 3)]}'/>`).join("");
  const art = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='xMidYMid slice'>
    <defs><filter id='soft' x='-20%' y='-20%' width='140%' height='140%'><feGaussianBlur stdDeviation='4'/></filter>
      <filter id='g' x='-20%' y='-20%' width='140%' height='140%'><feGaussianBlur stdDeviation='1.1'/></filter></defs>
    <rect width='100' height='100' fill='#0e0302'/>
    <g filter='url(#soft)'>${plates}</g>
    <g fill='none' stroke-linecap='round' stroke-linejoin='round'>
      <path d='${d}' stroke='#e02800' stroke-width='3.4' opacity='.6' filter='url(#g)'/>
      <path d='${d}' stroke='#ff5a0a' stroke-width='1.2'/>
      <path d='${d}' stroke='#ffc65a' stroke-width='.4'/></g></svg>`;
  const glow = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='xMidYMid slice'>
    <defs><filter id='g' x='-20%' y='-20%' width='140%' height='140%'><feGaussianBlur stdDeviation='2.6'/></filter></defs>
    <path d='${d}' fill='none' stroke='#ff4a10' stroke-width='4' stroke-linecap='round' filter='url(#g)'/></svg>`;
  return [uri(art), uri(glow)];
}

const out = process.argv[2];
for (const [name, fn] of Object.entries({ aurora, galaxy })) writeFileSync(`${out}/${name}.svg`, fn());
const [lavaArt, lavaGlow] = lava();
writeFileSync(`${out}/lava.svg`, lavaArt);
writeFileSync(`${out}/lava-glow.svg`, lavaGlow);
