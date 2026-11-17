// The side-view ray diagram: the eye on the left, the screen at distance D, and the path each
// ray takes into the world. A ray through screen height u is the set of points y = u * h * g(z),
// where g is the normalized lens, so this draws the lens itself, not an illustration of it.
import { LUT, convergenceDepth } from "./lens.mjs";

const COL = {
  ray: "rgba(233,228,216,0.75)", rayX: "rgba(90,169,230,0.9)", screen: "#e8553d", plane: "#5aa9e6",
  axis: "rgba(233,228,216,0.14)", text: "#9a978e", meet: "#e8553d",
};

// Read a lens back out of the lookup table (component 0 = x, 1 = y), for showing what's on the
// GPU right now, including mid-morph.
export function lutFn(arr, comp) {
  return (z) => {
    const t = (Math.asinh(z / LUT.C) - LUT.a0) / (LUT.a1 - LUT.a0);
    const fi = Math.min(1, Math.max(0, t)) * (LUT.N - 1);
    const i0 = Math.floor(fi), i1 = Math.min(i0 + 1, LUT.N - 1), f = fi - i0;
    return arr[2 * i0 + comp] * (1 - f) + arr[2 * i1 + comp] * f;
  };
}

export function drawDiagram(ctx, W, H, { D, fov, gy, gx = null, s = null }) {
  ctx.clearRect(0, 0, W, H);
  const padL = 18, padR = 10;
  const zMax = 3.2 * D;
  const h = D * Math.tan(fov / 2);
  const X = (z) => padL + (z / zMax) * (W - padL - padR);
  const yScale = (H / 2 - 12) / (2.2 * h);
  const Y = (y) => H / 2 - y * yScale;

  // axis
  ctx.strokeStyle = COL.axis; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(zMax), Y(0)); ctx.stroke();

  const rays = (g, color, dash) => {
    ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.setLineDash(dash);
    const n = 9, steps = 160;
    for (let k = 0; k < n; k++) {
      const u = -1 + (2 * k) / (n - 1);
      ctx.beginPath();
      let started = false;
      for (let i = 0; i <= steps; i++) {
        const z = (zMax * i) / steps;
        const gz = g(Math.max(z, 1e-3));
        if (!(gz > 0)) { if (started) break; else continue; }
        const y = u * h * gz;
        if (Math.abs(y) > 2.6 * h) { // off the top: finish the line at the edge and move on
          if (started) { ctx.lineTo(X(z), Y(Math.sign(y) * 2.6 * h)); break; }
          continue;
        }
        if (!started) { ctx.moveTo(X(z), Y(y)); started = true; } else ctx.lineTo(X(z), Y(y));
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  };
  if (gx) rays(gx, COL.rayX, [4, 3]);
  rays(gy, COL.ray, []);

  // the screen
  ctx.strokeStyle = COL.screen; ctx.lineWidth = 2.5; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(X(D), Y(h)); ctx.lineTo(X(D), Y(-h)); ctx.stroke();

  // the back plane (or eye point)
  ctx.strokeStyle = COL.plane; ctx.fillStyle = COL.plane;
  if (s != null && s > 0.01) {
    const top = Math.min(s * h, 2.6 * h);
    ctx.beginPath(); ctx.moveTo(X(0), Y(top)); ctx.lineTo(X(0), Y(-top)); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(X(0), Y(0), 3, 0, 7); ctx.fill();
  }
  // where converging rays meet
  if (s != null && s > 1) {
    const zc = convergenceDepth(s, D);
    if (zc < zMax) {
      ctx.fillStyle = COL.meet;
      ctx.beginPath(); ctx.arc(X(zc), Y(0), 3.5, 0, 7); ctx.fill();
    }
  }

  ctx.font = "10px 'JetBrains Mono', monospace"; ctx.fillStyle = COL.text;
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.fillText("screen", X(D), Y(-h) + 4);
  ctx.textAlign = "left";
  ctx.fillText("eye", X(0) + 4, H - 14);
}
