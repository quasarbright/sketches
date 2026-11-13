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

// ---- cosmic web: a fine web of filaments between clusters of galaxies, over faint gas. Comets
// of light run along the threads (SMIL stroke-dashoffset) and the clusters breathe.
function web() {
  // clusters spread evenly over the tile (and a little past its edges), so the web fills it
  const nodes = [];
  for (let tries = 0; tries < 8000 && nodes.length < 130; tries++) {
    const x = -6 + rnd() * 112, y = -6 + rnd() * 112;
    if (nodes.every(([u, v]) => Math.hypot(u - x, v - y) > 7.6)) nodes.push([x, y, 0]);
  }
  // join each cluster to its neighbors within reach; clusters where many threads meet are bigger
  const edges = new Set(), degree = nodes.map(() => 0);
  nodes.forEach((a, i) => nodes.forEach((b, j) => {
    if (i < j && Math.hypot(a[0] - b[0], a[1] - b[1]) < 12.5 && rnd() < 0.85) { edges.add(`${i}-${j}`); degree[i]++; degree[j]++; }
  }));
  nodes.forEach((n, i) => { n[2] = 0.25 + Math.max(0, degree[i] - 3) * 0.4 + rnd() * 0.3; });
  let soft = "", comets = "";
  for (const e of edges) {
    const [i, j] = e.split("-").map(Number), [ax, ay] = nodes[i], [bx, by] = nodes[j];
    const mx = (ax + bx) / 2 + (rnd() - 0.5) * 7, my = (ay + by) / 2 + (rnd() - 0.5) * 7;
    const d = `M${f(ax)} ${f(ay)}Q${f(mx)} ${f(my)} ${f(bx)} ${f(by)}`;
    soft += d;
    if (rnd() < 0.4) {
      const dur = f(1.6 + rnd() * 2.4), to = (rnd() < 0.5 ? 1 : -1) * 30, begin = f(-rnd() * 4);
      comets += `<path d='${d}' stroke-dasharray='2.2 28'><animate attributeName='stroke-dashoffset' from='0' to='${to}' dur='${dur}s' begin='${begin}s' repeatCount='indefinite'/></path>`;
    }
  }
  let clusters = "";
  nodes.forEach(([x, y, r]) => {
    const d = f(1.6 + rnd() * 2.4), b = f(-rnd() * 3);
    clusters += `<circle cx='${f(x)}' cy='${f(y)}' r='${f(r * 2.4)}' fill='url(#n)'><animate attributeName='opacity' values='.4;1;.4' dur='${d}s' begin='${b}s' repeatCount='indefinite'/></circle><circle cx='${f(x)}' cy='${f(y)}' r='${f(0.25 + r * 0.3)}' fill='#fff'/>`;
  });
  let gasClouds = "";
  for (let i = 0; i < 9; i++) gasClouds += `<circle cx='${f(rnd() * 100)}' cy='${f(rnd() * 100)}' r='${f(14 + rnd() * 16)}' fill='${["#5a2bd0", "#1a6bd0", "#c02b9a"][i % 3]}'/>`;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>
    <defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#4de8ff'/>
      <stop offset='.5' stop-color='#a46bff'/><stop offset='1' stop-color='#ff5fc8'/></linearGradient>
      <radialGradient id='n'><stop offset='0' stop-color='#ffffff'/><stop offset='.25' stop-color='#bff4ff' stop-opacity='.85'/>
      <stop offset='1' stop-color='#a46bff' stop-opacity='0'/></radialGradient>
      <filter id='fog' x='-50%' y='-50%' width='200%' height='200%'><feGaussianBlur stdDeviation='9'/></filter>
      <filter id='b' x='-20%' y='-20%' width='140%' height='140%'><feGaussianBlur stdDeviation='1.4'/></filter></defs>
    <g opacity='.5' filter='url(#fog)'>${gasClouds}</g>
    <g fill='none' stroke='url(#g)' stroke-linecap='round'>
      <path d='${soft}' stroke-width='4' opacity='.6' filter='url(#b)'/>
      <path d='${soft}' stroke-width='.45'/>
      <g stroke='#ffffff' stroke-width='.9'>${comets}</g></g>
    ${clusters}</svg>`;
  return uri(svg);
}

const out = process.argv[2];
for (const [name, fn] of Object.entries({ aurora, galaxy, web })) writeFileSync(`${out}/${name}.svg`, fn());
