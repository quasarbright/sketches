// Renders the black hole on the 65536 tile by tracing light rays around it, so the accretion
// disk bends the way it does in the Interstellar pictures: the far side of the disk shows up as
// an arc over the top of the shadow and a thinner one under it, while the near side crosses in
// front.
//   node art/blackhole-render.mjs      (from 2048/, needs @playwright/test to save the images)
//
// Physics, in units where the black hole's mass and the speed of light are 1 (the horizon is at
// r = 2): a light ray in Schwarzschild spacetime follows x'' = -1.5 h² x / |x|⁵, where h is its
// angular momentum |x × x'|. Each pixel's ray is stepped backward from the camera until it falls
// in (black) or escapes (transparent), noting every place it crosses the disk's plane between
// R_IN and R_OUT. The disk's light there is brighter toward the inner edge and on the side moving
// toward us (Doppler beaming, the gas orbiting at sqrt(1/r)).
//
// The rays are traced once; the frames only change the disk's pattern of bright streaks, which
// turns by one repeat of the pattern over the loop, so the strip loops seamlessly.
// Outputs:
//   blackhole-spin.webp  the FRAMES frames in a grid, COLS across (the tile steps through them;
//                        a grid rather than one long strip, which phones may not load)
//   blackhole-glow.webp  the light of frame 0 blurred, for the tile to pulse
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const N = 300;                        // pixels across a frame
const FRAMES = 24, COLS = 6;
const ARMS = 6;                       // the streak pattern repeats 6 times around the disk
const CAM = 26, INC = (86.5 * Math.PI) / 180; // camera distance, and angle from the disk's axis
const FOV = 0.33;                     // half-width of the view (tangent)
const R_IN = 3, R_OUT = 10.5;
const TILT = (-12 * Math.PI) / 180;   // roll the picture a little, as in the reference

// camera at angle INC from the +z axis (the disk lies in the z = 0 plane)
const cam = [0, -CAM * Math.sin(INC), CAM * Math.cos(INC)];
const fwd = cam.map((c) => -c / CAM);
const up0 = [0, Math.cos(INC), Math.sin(INC)];
const right0 = [fwd[1] * up0[2] - fwd[2] * up0[1], fwd[2] * up0[0] - fwd[0] * up0[2], fwd[0] * up0[1] - fwd[1] * up0[0]];
const right = right0.map((v, i) => v * Math.cos(TILT) + up0[i] * Math.sin(TILT));
const up = up0.map((v, i) => v * Math.cos(TILT) - right0[i] * Math.sin(TILT));

// per pixel: whether the ray fell in, and its disk crossings [radius, angle, base brightness]
const fell = new Uint8Array(N * N), hits = new Array(N * N);
for (let py = 0; py < N; py++) {
  for (let px = 0; px < N; px++) {
    const sx = ((px + 0.5) / N - 0.5) * 2 * FOV, sy = (0.5 - (py + 0.5) / N) * 2 * FOV;
    let d = [0, 1, 2].map((i) => fwd[i] + right[i] * sx + up[i] * sy);
    const dl = Math.hypot(...d); d = d.map((v) => v / dl);
    let x = cam.slice(), v = d.slice();
    const L = [x[1] * v[2] - x[2] * v[1], x[2] * v[0] - x[0] * v[2], x[0] * v[1] - x[1] * v[0]];
    const h2 = L[0] ** 2 + L[1] ** 2 + L[2] ** 2;
    const acc = (p) => { const rr = Math.hypot(...p); const k = (-1.5 * h2) / rr ** 5; return p.map((c) => c * k); };
    const list = [];
    for (let step = 0; step < 3000; step++) {
      const r = Math.hypot(...x);
      if (r < 2.0) { fell[py * N + px] = 1; break; }
      if (r > CAM * 1.6 && x[0] * v[0] + x[1] * v[1] + x[2] * v[2] > 0) break;
      const dt = Math.min(0.5, Math.max(0.01, 0.06 * r)); // small steps near the hole
      const a0 = acc(x);
      const vh = v.map((c, i) => c + a0[i] * dt / 2);
      const xn = x.map((c, i) => c + vh[i] * dt);
      const a1 = acc(xn);
      const vn = vh.map((c, i) => c + a1[i] * dt / 2);
      if (x[2] * xn[2] < 0 && list.length < 4) {
        const t = x[2] / (x[2] - xn[2]);
        const hx = x[0] + (xn[0] - x[0]) * t, hy = x[1] + (xn[1] - x[1]) * t, hr = Math.hypot(hx, hy);
        if (hr > R_IN && hr < R_OUT) {
          const q = R_IN / hr;
          let I = q ** 1.8 * (1 - Math.sqrt(q) * 0.75) * 19;
          I *= Math.min(1, (R_OUT - hr) / 2.5);
          const phi = Math.atan2(hy, hx);
          I *= 0.92 + 0.08 * Math.sin(hr * 4.1);
          const beta = Math.sqrt(1 / hr), vel = [-Math.sin(phi) * beta, Math.cos(phi) * beta, 0];
          const nd = Math.hypot(...vn), toCam = vn.map((c) => -c / nd);
          const g = Math.sqrt(1 - beta * beta) / (1 - (vel[0] * toCam[0] + vel[1] * toCam[1]));
          list.push([hr, phi, I * g ** 2.6]);
        }
      }
      x = xn; v = vn;
    }
    hits[py * N + px] = list;
  }
}

// one frame: the streaks turn with the gas (counterclockwise, which is +phi)
const tone = (l) => 255 * (1 - Math.exp(-l * 1.3));
function frame(f) {
  const turn = ((2 * Math.PI) / ARMS) * (f / FRAMES);
  const px8 = new Uint8ClampedArray(N * N * 4);
  for (let i = 0; i < N * N; i++) {
    let light = [0, 0, 0], alpha = 0;
    for (const [hr, phi, base] of hits[i]) {
      // streaks: trailing spiral arcs, sharper and more of them toward the inside
      const s = Math.sin(ARMS * (phi - turn) + 9 / Math.sqrt(hr) + Math.sin(hr * 2.3) * 0.8);
      const I = base * (0.68 + 0.45 * s * Math.abs(s));
      const c = I > 2.2 ? [1, 0.9, 0.74] : I > 1.1 ? [1, 0.74, 0.42] : I > 0.5 ? [1, 0.56, 0.24] : [1, 0.4, 0.12];
      light = light.map((l, k) => l + c[k] * I * (1 - alpha));
      alpha += Math.min(1, I * 0.7) * (1 - alpha);
    }
    const o = i * 4;
    const a = fell[i] ? 1 : Math.min(1, alpha);
    if (a <= 0) continue;
    px8[o] = tone(light[0]); px8[o + 1] = tone(light[1]); px8[o + 2] = tone(light[2]);
    px8[o + 3] = Math.round(255 * Math.max(a, Math.max(px8[o], px8[o + 1], px8[o + 2]) / 255));
  }
  return px8;
}

const strip = new Uint8ClampedArray(N * FRAMES * N * 4);
for (let f = 0; f < FRAMES; f++) {
  const fr = frame(f);
  for (let y = 0; y < N; y++) strip.set(fr.subarray(y * N * 4, (y + 1) * N * 4), (y * N * FRAMES + f * N) * 4);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const [spin, glow] = await page.evaluate(({ N, FRAMES, COLS, b64 }) => {
  const W = N * FRAMES;
  const data = Uint8ClampedArray.from(atob(b64), (c) => c.charCodeAt(0));
  const cv = document.createElement("canvas"); cv.width = W; cv.height = N;
  const g = cv.getContext("2d");
  g.putImageData(new ImageData(data, W, N), 0, 0);
  const grid = document.createElement("canvas"); grid.width = N * COLS; grid.height = N * (FRAMES / COLS);
  const gr = grid.getContext("2d");
  for (let f = 0; f < FRAMES; f++) gr.drawImage(cv, f * N, 0, N, N, (f % COLS) * N, Math.floor(f / COLS) * N, N, N);
  const spin = grid.toDataURL("image/webp", 0.86);
  // the glow: frame 0's light (not the black shadow), blurred wide
  const lit = document.createElement("canvas"); lit.width = lit.height = N;
  const l = lit.getContext("2d"), src = g.getImageData(0, 0, N, N);
  for (let i = 0; i < src.data.length; i += 4) src.data[i + 3] = Math.max(src.data[i], src.data[i + 1], src.data[i + 2]);
  l.putImageData(src, 0, 0);
  const gl = document.createElement("canvas"); gl.width = gl.height = N;
  const gg = gl.getContext("2d");
  gg.filter = `blur(${N * 0.035}px)`; gg.drawImage(lit, 0, 0); gg.drawImage(lit, 0, 0);
  return [spin, gl.toDataURL("image/webp", 0.9)];
}, { N, FRAMES, COLS, b64: Buffer.from(strip.buffer).toString("base64") });
await browser.close();
for (const [name, url] of [["blackhole-spin.webp", spin], ["blackhole-glow.webp", glow]]) {
  writeFileSync(new URL(`./${name}`, import.meta.url), Buffer.from(url.split(",")[1], "base64"));
  console.log(`wrote art/${name}`, Math.round((url.length * 3) / 4 / 1024) + " KB");
}
