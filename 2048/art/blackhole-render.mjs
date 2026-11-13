// Renders the black hole on the 65536 tile by tracing light rays around it, so the accretion
// disk bends the way it does in the Interstellar pictures: the far side of the disk shows up as
// an arc over the top of the shadow and a thinner one under it, while the near side crosses in
// front.
//   node art/blackhole-render.mjs      (from 2048/, needs @playwright/test to save the images)
//
// Physics, in units where the black hole's mass and the speed of light are 1 (the horizon is at
// r = 2): a light ray in Schwarzschild spacetime follows x'' = -1.5 h² x / |x|⁵, where h is its
// angular momentum |x × x'|. Each pixel's ray is stepped backward from the camera until it falls
// in (black), escapes (transparent), and every time it crosses the disk's plane between r = 3
// and r = 13 it picks up the disk's light there. That light is brighter toward the inner edge,
// and brighter on the side moving toward us (Doppler beaming, the disk orbiting at sqrt(1/r)).
// Outputs:
//   blackhole.webp       the hole and disk, transparent where you see past them
//   blackhole-glow.webp  the same light blurred, for the tile to pulse
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const N = 360;                        // pixels across
const CAM = 26, INC = (84 * Math.PI) / 180; // camera distance, and angle from the disk's axis
const FOV = 0.33;                     // half-width of the view, in radians-ish (tan)
const R_IN = 3, R_OUT = 13;
const TILT = (-12 * Math.PI) / 180;   // roll the picture a little, as in the reference

// camera at angle INC from the +z axis (the disk lies in the z = 0 plane)
const cam = [0, -CAM * Math.sin(INC), CAM * Math.cos(INC)];
const fwd = cam.map((c) => -c / CAM);
const up0 = [0, Math.cos(INC), Math.sin(INC)];               // perpendicular to fwd, toward +z
const right0 = [fwd[1] * up0[2] - fwd[2] * up0[1], fwd[2] * up0[0] - fwd[0] * up0[2], fwd[0] * up0[1] - fwd[1] * up0[0]];
const right = right0.map((v, i) => v * Math.cos(TILT) + up0[i] * Math.sin(TILT));
const up = up0.map((v, i) => v * Math.cos(TILT) - right0[i] * Math.sin(TILT));

const out = new Float32Array(N * N * 4); // r, g, b (linear light), alpha
for (let py = 0; py < N; py++) {
  for (let px = 0; px < N; px++) {
    const sx = ((px + 0.5) / N - 0.5) * 2 * FOV, sy = (0.5 - (py + 0.5) / N) * 2 * FOV;
    let d = [0, 1, 2].map((i) => fwd[i] + right[i] * sx + up[i] * sy);
    const dl = Math.hypot(...d); d = d.map((v) => v / dl);
    let x = cam.slice(), v = d.slice();
    const L = [x[1] * v[2] - x[2] * v[1], x[2] * v[0] - x[0] * v[2], x[0] * v[1] - x[1] * v[0]];
    const h2 = L[0] ** 2 + L[1] ** 2 + L[2] ** 2;
    let light = [0, 0, 0], alpha = 0, fell = false;
    for (let step = 0; step < 3000; step++) {
      const r = Math.hypot(...x);
      if (r < 2.0) { fell = true; break; }
      if (r > CAM * 1.6 && x[0] * v[0] + x[1] * v[1] + x[2] * v[2] > 0) break;
      const dt = Math.min(0.5, Math.max(0.01, 0.06 * r)); // small steps near the hole
      // leapfrog
      const acc = (p) => { const rr = Math.hypot(...p); const k = (-1.5 * h2) / rr ** 5; return p.map((c) => c * k); };
      const a0 = acc(x);
      const vh = v.map((c, i) => c + a0[i] * dt / 2);
      const xn = x.map((c, i) => c + vh[i] * dt);
      const a1 = acc(xn);
      const vn = vh.map((c, i) => c + a1[i] * dt / 2);
      if (x[2] * xn[2] < 0 && alpha < 0.999) {
        // crossed the disk plane: where?
        const t = x[2] / (x[2] - xn[2]);
        const hx = x[0] + (xn[0] - x[0]) * t, hy = x[1] + (xn[1] - x[1]) * t, hr = Math.hypot(hx, hy);
        if (hr > R_IN && hr < R_OUT) {
          // brightness: hot inner edge, fading outward; soft edges
          const q = R_IN / hr;
          let I = q ** 1.8 * (1 - Math.sqrt(q) * 0.75) * 26;
          I *= Math.min(1, (R_OUT - hr) / 3);
          // faint rings and wisps
          const phi = Math.atan2(hy, hx);
          I *= 0.9 + 0.1 * Math.sin(hr * 4.1 + Math.sin(phi * 3 + hr) * 0.6);
          // Doppler: the gas orbits counterclockwise at speed sqrt(1/r); light reaches us along -v
          const beta = Math.sqrt(1 / hr), vel = [-Math.sin(phi) * beta, Math.cos(phi) * beta, 0];
          const nd = Math.hypot(...vn), toCam = vn.map((c) => -c / nd);
          const cosA = vel[0] * toCam[0] + vel[1] * toCam[1];
          const g = Math.sqrt(1 - beta * beta) / (1 - cosA);
          I *= g ** 2.6;
          // color by brightness: white-hot where bright, orange and red where dim
          const c = I > 2.2 ? [1, 0.9, 0.74] : I > 1.1 ? [1, 0.74, 0.42] : I > 0.5 ? [1, 0.56, 0.24] : [1, 0.4, 0.12];
          const a = Math.min(1, I * 0.7) * (1 - alpha);
          light = light.map((l, i) => l + c[i] * I * (1 - alpha));
          alpha += a;
        }
      }
      x = xn; v = vn;
    }
    const o = (py * N + px) * 4;
    out[o] = light[0]; out[o + 1] = light[1]; out[o + 2] = light[2];
    out[o + 3] = fell ? 1 : Math.min(1, alpha);
  }
}

// tone-map to 8-bit: soft rolloff so the hot inner edge goes white instead of clipping
const px8 = new Uint8ClampedArray(N * N * 4);
const tone = (l) => 255 * (1 - Math.exp(-l * 1.3));
for (let i = 0; i < N * N; i++) {
  const o = i * 4, a = out[o + 3];
  if (a <= 0) continue;
  px8[o] = tone(out[o]); px8[o + 1] = tone(out[o + 1]); px8[o + 2] = tone(out[o + 2]);
  px8[o + 3] = Math.round(255 * Math.max(a, Math.max(px8[o], px8[o + 1], px8[o + 2]) / 255));
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const [main, glow] = await page.evaluate(({ N, data }) => {
  const cv = document.createElement("canvas"); cv.width = cv.height = N;
  const g = cv.getContext("2d");
  g.putImageData(new ImageData(new Uint8ClampedArray(data), N, N), 0, 0);
  const main = cv.toDataURL("image/webp", 0.9);
  // the glow: the light only (not the black shadow), blurred wide
  const lit = document.createElement("canvas"); lit.width = lit.height = N;
  const l = lit.getContext("2d"), src = g.getImageData(0, 0, N, N);
  for (let i = 0; i < src.data.length; i += 4) { const m = Math.max(src.data[i], src.data[i + 1], src.data[i + 2]); src.data[i + 3] = m; }
  l.putImageData(src, 0, 0);
  const gl = document.createElement("canvas"); gl.width = gl.height = N;
  const gg = gl.getContext("2d");
  gg.filter = `blur(${N * 0.035}px)`; gg.drawImage(lit, 0, 0); gg.drawImage(lit, 0, 0);
  return [main, gl.toDataURL("image/webp", 0.9)];
}, { N, data: Array.from(px8) });
await browser.close();
for (const [name, url] of [["blackhole.webp", main], ["blackhole-glow.webp", glow]]) {
  writeFileSync(new URL(`./${name}`, import.meta.url), Buffer.from(url.split(",")[1], "base64"));
  console.log(`wrote art/${name}`, Math.round((url.length * 3) / 4 / 1024) + " KB");
}
