// The About's "rays are a graph" demos. Pixel u's ray (u from −1 at the bottom of the picture to
// 1 at the top) is the curve y = u·f(z): at each distance z ahead, f(z) is how far the view
// reaches above the line you're looking along, and the pixel sees the point u of the way up it.
// A line sweeps out along z, marking f(z) there and the evenly spaced points the pixels' rays
// pass through, and the rays are drawn behind it like any graph.
import { parseExpr } from "./lens.mjs";

const wob = parseExpr("z + log(z)*sin(z)"), wob2 = wob(2);
// each scaled so the view is 2.2 m tall 2 m ahead, like the other demos
export const GRAPHS = {
  "graph-persp": { label: "f(z) = 0.55 z", f: (z) => 0.55 * z },
  "graph-ortho": { label: "f(z) = 1.1", f: () => 1.1 },
  "graph-sensor": { label: "f(z) = 0.6 + 0.25 z", f: (z) => 0.6 + 0.25 * z },
  "graph-wobble": { label: "f(z) = z + log(z)·sin(z), scaled", f: (z) => (z <= 0 ? 0 : 1.1 * wob(z) / wob2) },
};
const Z_MAX = 12, Y_MAX = 6.8, US = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];
const SWEEP = 4.2, PERIOD = 6;
const mono = "11px 'JetBrains Mono', monospace";

export function drawGraphDemo(ctx, W, H, demo, t) {
  const g = GRAPHS[demo];
  ctx.textBaseline = "alphabetic";
  ctx.clearRect(0, 0, W, H);
  const padL = 30, padR = 100, padT = 30, padB = 22;
  const X = (z) => padL + (z / Z_MAX) * (W - padL - padR), Y = (y) => padT + (Y_MAX - y) / (2 * Y_MAX) * (H - padT - padB);
  const tc = t % PERIOD, zs = Math.min(Z_MAX, (tc / SWEEP) * Z_MAX), sweeping = tc < SWEEP;
  // axes: z along the line you're looking along, y up
  ctx.strokeStyle = "rgba(233,228,216,0.35)"; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(Z_MAX), Y(0)); ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(X(0), Y(Y_MAX)); ctx.lineTo(X(0), Y(-Y_MAX)); ctx.stroke();
  ctx.font = mono; ctx.fillStyle = "#7d7a72"; ctx.textAlign = "center";
  for (let z = 2; z < Z_MAX; z += 2) {
    ctx.fillRect(X(z) - 0.5, Y(0) - 3, 1, 6);
    ctx.fillText(`${z}`, X(z), H - 6);
  }
  ctx.textAlign = "right";
  for (const y of [-6, -4, -2, 2, 4, 6]) { ctx.fillRect(X(0) - 3, Y(y) - 0.5, 6, 1); ctx.fillText(`${y}`, X(0) - 6, Y(y) + 4); }
  ctx.textAlign = "left";
  ctx.textAlign = "right"; ctx.fillText("z (m ahead)", W - 4, H - 6); ctx.textAlign = "left";
  ctx.fillText("y (m up)", X(0) + 6, Y(Y_MAX) + 4);
  // the rays: faint all the way, bright up to the sweep
  const curve = (u, z1) => {
    ctx.beginPath();
    for (let i = 0; i <= 200; i++) {
      const z = (i / 200) * z1, y = u * g.f(z);
      const yy = Math.max(-Y_MAX * 1.05, Math.min(Y_MAX * 1.05, y));
      if (i) ctx.lineTo(X(z), Y(yy)); else ctx.moveTo(X(z), Y(yy));
    }
    ctx.stroke();
  };
  ctx.save(); ctx.beginPath(); ctx.rect(0, padT - 2, W, H - padT - padB + 4); ctx.clip();
  for (const u of US) {
    const outer = Math.abs(u) === 1, hi = u === 0.5;
    ctx.lineWidth = outer || hi ? 2 : 1.2;
    ctx.strokeStyle = "rgba(255,210,63,0.16)"; curve(u, Z_MAX);
    ctx.strokeStyle = outer ? "#ffd23f" : hi ? "rgba(255,210,63,0.95)" : "rgba(255,210,63,0.5)";
    curve(u, sweeping ? zs : Z_MAX);
  }
  ctx.restore();
  // ray labels at the right end
  ctx.font = mono; ctx.textAlign = "left";
  // (the middle one only when there's room between the others)
  const fEnd = g.f(Z_MAX), gap = Math.abs(Y(0.5 * fEnd) - Y(fEnd));
  for (const [u, txt] of [[1, "y = 1·f(z)"], [0.5, "y = 0.5·f(z)"], [-1, "y = −1·f(z)"]]) {
    const y = u * fEnd;
    if (Math.abs(y) > Y_MAX || (u === 0.5 && gap < 14)) continue;
    ctx.fillStyle = "#ffd23f"; ctx.fillText(txt, X(Z_MAX) + 6, Y(y) + 4);
  }
  // the sensor, or the eye
  const f0 = g.f(0);
  ctx.strokeStyle = ctx.fillStyle = "#5aa9e6"; ctx.lineWidth = 3; ctx.lineCap = "round";
  if (f0 > 0.02) { ctx.beginPath(); ctx.moveTo(X(0), Y(f0)); ctx.lineTo(X(0), Y(-f0)); ctx.stroke(); }
  else { ctx.beginPath(); ctx.arc(X(0), Y(0), 3.5, 0, 7); ctx.fill(); }
  ctx.lineCap = "butt";
  // the sweep: f(z) there, and the points the pixels' rays pass through
  const a = sweeping ? 1 : Math.max(0, 1 - (tc - SWEEP) / 0.4);
  if (a > 0 && zs > 0.05) {
    ctx.globalAlpha = a;
    const fz = g.f(zs), x = X(zs);
    ctx.strokeStyle = "rgba(233,228,216,0.55)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, Y(Y_MAX)); ctx.lineTo(x, Y(-Y_MAX)); ctx.stroke();
    ctx.strokeStyle = "#e9e4d8"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, Y(0)); ctx.lineTo(x, Y(Math.max(-Y_MAX, Math.min(Y_MAX, fz)))); ctx.stroke();
    for (const u of US) {
      const y = u * fz;
      if (Math.abs(y) > Y_MAX) continue;
      ctx.fillStyle = u === 0.5 ? "#ffd23f" : "#e9e4d8";
      ctx.beginPath(); ctx.arc(x, Y(y), u === 0.5 ? 4 : 2.6, 0, 7); ctx.fill();
    }
    // f(z) by the top dot, and the highlighted row's value by its dot, each on a plate
    const tag = (txt, y, color) => {
      const w = ctx.measureText(txt).width, lx = x + 8 + w < X(Z_MAX) ? x + 8 : x - 8 - w;
      const ly = Y(Math.max(-Y_MAX + 0.4, Math.min(Y_MAX - 0.4, y))) + 4;
      ctx.fillStyle = "rgba(17,19,23,0.9)"; ctx.fillRect(lx - 3, ly - 11, w + 6, 15);
      ctx.fillStyle = color; ctx.fillText(txt, lx, ly);
    };
    tag(`f(${zs.toFixed(1)}) = ${fz.toFixed(2)}`, fz, "#e9e4d8");
    if (Math.abs(Y(fz) - Y(0.5 * fz)) > 15) tag(`0.5·f = ${(0.5 * fz).toFixed(2)}`, 0.5 * fz, "#ffd23f");
    ctx.globalAlpha = 1;
  }
  // which f this is
  ctx.font = "12px 'JetBrains Mono', monospace";
  ctx.fillStyle = "#ffd23f"; ctx.textAlign = "left"; ctx.fillText(g.label, 4, 14);
  ctx.fillStyle = "#9a978e"; ctx.textAlign = "right"; ctx.fillText("ray of row u: y = u·f(z)", W - 4, 14); ctx.textAlign = "left";
}
