// Unit tests for the lens core. Run: node --test  (from perspectivent/)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseExpr, backPlaneF, convergenceDepth, backPlaneText, normalizedLens, compileLens,
  LUT, lutDepth, sampleLens, PRESETS, NEAR, planeRatio, fitScreenH,
} from "./lens.mjs";

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("parses arithmetic with precedence", () => {
  close(parseExpr("1 + 2*3")(0), 7);
  close(parseExpr("2^3^2")(0), 512);
  close(parseExpr("-z^2")(3), -9);
  close(parseExpr("(1+z)/2")(3), 2);
  close(parseExpr("z**2")(4), 16);
});

test("implicit multiplication and functions", () => {
  close(parseExpr("2z")(3), 6);
  close(parseExpr("3(z+1)")(1), 6);
  close(parseExpr("z sqrt(z)")(4), 8);
  close(parseExpr("log(1 + z)")(Math.E - 1), 1);
  close(parseExpr("max(z, 2)")(1), 2);
  close(parseExpr("pi")(0), Math.PI);
  close(parseExpr("√z")(9), 3);
  close(parseExpr("z²")(5), 25);
});

test("rejects bad input with a message", () => {
  for (const s of ["", "1 +", "foo(z)", "(z", "z)", "2 $ 3", "q"]) {
    assert.throws(() => parseExpr(s), Error, s);
  }
});

test("back plane: s = 0 is a pinhole, s = 1 is orthographic", () => {
  const D = 20;
  const pin = normalizedLens(backPlaneF(0, D), D);
  close(pin(40), 2); // twice as far, half as big
  const ortho = normalizedLens(backPlaneF(1, D), D);
  close(ortho(5), 1); close(ortho(500), 1);
});

test("back plane: s > 1 rays meet in front, where the lens hits zero", () => {
  const D = 20, s = 1.5;
  const zc = convergenceDepth(s, D);
  close(zc, 60);
  close(backPlaneF(s, D)(zc), 0);
  assert.equal(convergenceDepth(0.5, D), Infinity);
  // the ray geometry: a ray through screen point u starts at s*u on the back plane
  const u = 0.3, h = 2, z = 7;
  const xAtZ = s * u * h + (u * h - s * u * h) * (z / D);
  close(xAtZ / (u * h), backPlaneF(s, D)(z) / D);
});

test("normalization keeps the screen distance at size 1 for every preset", () => {
  const D = 15;
  for (const p of PRESETS) {
    const g = normalizedLens(parseExpr(p.src), D);
    assert.ok(g, p.id);
    close(g(D), 1, 1e-12);
  }
});

test("reverse makes far things bigger", () => {
  const g = normalizedLens(parseExpr("1/z"), 10);
  assert.ok(1 / g(100) > 1 / g(10));
});

test("compileLens rejects lenses that are not positive at the screen", () => {
  assert.ok(compileLens("z - 100", 20).error);
  assert.ok(compileLens("log(z - 30)", 20).error);
  assert.ok(compileLens("z", 20).f);
  assert.match(compileLens("z +", 20).error, /end/);
});

test("non-finite lens values stay finite and keep their sign", () => {
  const g = normalizedLens(parseExpr("1/z"), 10);
  assert.ok(g(0) >= 1e29); // 1/0 = Infinity: an infinitely big plane, not crossed rays
  const e = normalizedLens(parseExpr("exp(z)"), 2.42);
  assert.ok(e(1000) >= 1e29 && Number.isFinite(e(1000))); // exp overflows: shrunk to a dot
  const out = sampleLens(g, g);
  for (const v of out) assert.ok(Number.isFinite(v));
});

test("behind the near plane, lenses continue in a straight line", () => {
  const D = 10, near = 0.05;
  const persp = normalizedLens(parseExpr("z"), D);
  const out = sampleLens(persp, persp, undefined, near);
  for (let i = 0; i < LUT.N; i += 37) close(out[2 * i], persp(lutDepth(i)), 1e-3); // exact (float32)
  const rev = normalizedLens(parseExpr("1/z"), D);
  const o2 = sampleLens(rev, rev, undefined, near);
  for (let i = 0; i < LUT.N; i++) {
    const z = lutDepth(i);
    if (z < near) {
      // finite and positive, so the GPU clips it against the near plane instead of w = 0
      assert.ok(Number.isFinite(o2[2 * i]) && o2[2 * i] > 0, `${z}: ${o2[2 * i]}`);
    } else close(o2[2 * i], rev(z), Math.abs(rev(z)) * 1e-6 + 1e-6);
  }
});

test("lookup depths cover the range, dense near zero", () => {
  close(lutDepth(0), LUT.zMin, 1e-6);
  close(lutDepth(LUT.N - 1), LUT.zMax, 1e-3);
  let minStep = Infinity, at = 0;
  for (let i = 1; i < LUT.N; i++) {
    const d = lutDepth(i) - lutDepth(i - 1);
    if (d < minStep) { minStep = d; at = lutDepth(i); }
  }
  assert.ok(minStep < 0.01 && Math.abs(at) < 0.1, `${minStep} at ${at}`);
  // and fine enough at 1 m that 1/z is accurate
  const i1 = [...Array(LUT.N).keys()].find((i) => lutDepth(i) > 1);
  assert.ok(lutDepth(i1) - lutDepth(i1 - 1) < 0.02);
});

test("backPlaneText", () => {
  assert.equal(backPlaneText(0, 20), "z");
  assert.equal(backPlaneText(1, 20), "1");
  assert.equal(backPlaneText(0.4, 20), "8 + 0.6z");
  assert.equal(backPlaneText(1.5, 20), "30 - 0.5z");
});

import { linearS } from "./lens.mjs";

test("linearS recognizes straight lines and recovers the back plane size", () => {
  const D = 10;
  assert.equal(linearS(parseExpr("z"), D), 0);
  close(linearS(parseExpr("1"), D), 1);
  close(linearS(parseExpr("8 + 0.6z"), 20), 0.4);          // backPlaneText(0.4, 20)
  close(linearS(parseExpr("20 - z"), D), 2);                // rays meet at 20 m
  close(linearS(backPlaneF(1.37, D), D), 1.37);
  assert.equal(linearS(parseExpr("1/z"), D), null);
  assert.equal(linearS(parseExpr("z^2"), D), null);
  assert.equal(linearS(parseExpr("log(1+z)"), D), null);
});

import { screenPos } from "./lens.mjs";
import { readFileSync } from "node:fs";

// Mike, 2026-11-18: the eye must be in the same place for every lens. Something above eye height
// in perspective (the 10 m sign's board) must stay above the middle of the screen in every lens
// and every frame of a morph between lenses, and something below must stay below.
test("every lens and every morph frame is centered on the eye", () => {
  const D = 10, h = D * Math.tan(Math.PI / 6);
  const lenses = PRESETS.map((p) => sampleLens(...[0, 1].map(() => normalizedLens(parseExpr(p.src), D))));
  lenses.push(sampleLens(normalizedLens(parseExpr("1"), D), normalizedLens(parseExpr("z"), D))); // split
  lenses.push(sampleLens(normalizedLens(backPlaneF(1.5, D), D), normalizedLens(backPlaneF(1.5, D), D)));
  const frames = [];
  for (const a of lenses) for (const b of lenses) for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    frames.push(a.map((v, i) => v + (b[i] - v) * t));
  }
  let checked = 0;
  for (const lut of frames) {
    for (let i = 0; i < LUT.N; i += 7) {
      const z = lutDepth(i);
      const gx = lut[2 * i], gy = lut[2 * i + 1];
      if (z < NEAR || !(gy > 0) || !(gx > 0)) continue; // not seen
      for (const y of [-1.7, -0.2, 0.3, 1.1, 2.5]) { // the board of the 10 m sign is ~1 m above the eye
        for (const H of [0.25, 2, h, 25]) { // every screen size the slider allows
          const { sy } = screenPos(0, y, gx, gy, H, H);
          assert.equal(Math.sign(sy), Math.sign(y), `z=${z} y=${y} H=${H}`);
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 100000);
});

test("the shaders add nothing to y: lens, sky and earth all use the eye-centered mapping", () => {
  const src = readFileSync(new URL("./main.mjs", import.meta.url), "utf8");
  assert.match(src, /return vec4\(mv\.x \/ lensHalf\.x \* \(w \/ g\.x\), sy \* mv\.y \/ lensHalf\.y, zl \* w, w\);/);
  assert.match(src, /vNdc\.y \* skyHalf\.y \* skyG\.y, -/);
  assert.match(src, /vNdc\.y \* earthHalf\.y \* earthG\.y, -/);
  assert.doesNotMatch(src, /lensShift|sensorShift/i);
});

// Mike, three times: orthographic must not look into the ground. The orthographic window is the
// screen itself, centered on the eye, so its bottom edge must be above the ties you stand on (the
// track bed at the start) and the rails on them, not merely above the grass.
const MAIN = readFileSync(new URL("./main.mjs", import.meta.url), "utf8");
test("the default screen and back plane stay above the ground and the rails", () => {
  const H = +MAIN.match(/^\s*H: ([\d.]+),/m)[1];
  const EYE = +MAIN.match(/const EYE = ([\d.]+)/)[1];
  const RAIL_H = +MAIN.match(/const RAIL_H = ([\d.]+)/)[1];
  // looking level is the lowest the plane's edge gets; tilting it raises its bottom edge
  assert.ok(EYE - H >= RAIL_H + 0.05, `bottom edge ${(EYE - H).toFixed(2)} m above your feet, rails ${RAIL_H} m`);
  assert.ok(H >= 1, "and still big enough to see through");
});

// Mike, 2026-11-19: "I can literally see the character shadow like third person in first person
// ortho camera." You are only an eye: nothing follows you around except the camera, the sun's
// shadow box and the ground grid, and none of those cast a shadow of you.
test("nothing but the camera, sun and ground grid follows the player (no body, no body shadow)", () => {
  const followers = [...MAIN.matchAll(/([\w.]+)\.position\.(?:set|copy)\((?:Math\.round\()?player\.pos/g)].map((m) => m[1]);
  assert.deepEqual([...new Set(followers)].sort(), ["camera", "ground", "sun", "sun.target"].sort());
  // you're drawn only in the side view's own layer (which the main camera and the sun's shadow
  // camera never draw), and only as the blue sensor or a floating eyeball: no body, no camera
  // (Mike, 2026-11-22: "just make it a blue rectangle or an eyeball. no camera")
  assert.match(MAIN, /helpers\.add\(planeFill, planeEdge, eyeball,/);
  assert.doesNotMatch(MAIN, /figBody|camBody|camLens/);
  assert.match(MAIN, /helpers\.traverse\(\(o\) => o\.layers\.set\(INSET\)\)/);
  assert.doesNotMatch(MAIN, /fig\w*\.castShadow/);
  assert.doesNotMatch(MAIN, /CapsuleGeometry[\s\S]{0,200}castShadow = true/);
});

// Mike, 2026-11-19: "panning the camera should not move the eye or the center of the back plane".
// The back plane is centered on the camera (the lens shader divides camera-space x and y, adding
// nothing; see the test above), so it's enough that looking around never moves the camera.
test("looking around never moves the eye", () => {
  const sets = [...MAIN.matchAll(/\bcamera\.position\.(\w+)\(/g)];
  assert.equal(sets.length, 1, "the camera is placed in exactly one spot");
  assert.match(MAIN, /camera\.position\.set\(player\.pos\.x, player\.pos\.y \+ EYE, player\.pos\.z\)/);
  const look = MAIN.slice(MAIN.indexOf("function look("), MAIN.indexOf("\n}\n", MAIN.indexOf("function look(")));
  assert.doesNotMatch(look, /pos/, "look() only turns you");
});

// Mike, 2026-11-19: "in flight mode, the camera should always stay where up in 3D is up in the
// camera". Both modes turn by yaw and pitch only (pitch clamped short of straight up/down), and
// the camera's orientation comes from nothing else, so it can never roll.
test("the camera never rolls, walking or flying", () => {
  assert.doesNotMatch(MAIN, /camera\.quaternion\.(copy|set|slerp|multiply|premultiply|rotate)/);
  assert.match(MAIN, /walkQuat\(player\.yaw, player\.pitch, camera\.quaternion\)/);
  assert.match(MAIN, /new THREE\.Euler\(pitch, yaw, 0, "YXZ"\)/);
  assert.doesNotMatch(MAIN, /\broll\b|player\.q\b/i);
  assert.match(MAIN, /player\.pitch = THREE\.MathUtils\.clamp\(player\.pitch - dy \* k, -1\.55, 1\.55\)/);
});

// Mike, 2026-11-19: "back plane on reverse perspective clips into the ground". Every preset, picked
// at the default settings, must leave its back plane above the rails: picking one runs fitScreen,
// which shrinks the screen when the plane would reach too low.
test("every preset's back plane clears the rails at the default settings", () => {
  const H = +MAIN.match(/^\s*H: ([\d.]+),/m)[1];
  const D = +MAIN.match(/^\s*D: ([\d.]+),/m)[1];
  const EYE = +MAIN.match(/const EYE = ([\d.]+)/)[1];
  const RAIL_H = +MAIN.match(/const RAIL_H = ([\d.]+)/)[1];
  const clearH = EYE - RAIL_H - 0.08;
  for (const p of PRESETS) {
    const ratio = planeRatio(p.s != null ? backPlaneF(p.s, D) : parseExpr(p.src), D);
    const h = fitScreenH(H, ratio, clearH);
    assert.ok(ratio * h <= clearH + 1e-9, `${p.id}: plane reaches ${(EYE - ratio * h).toFixed(2)} m`);
    assert.ok(h > 0.3, `${p.id}: screen still usable`);
  }
  assert.ok(planeRatio(parseExpr("1/(z + 5)"), D) > 1, "reverse really does need the fit");
  assert.match(MAIN, /function choosePreset\(p\) \{\s*state\.sphere = false;\s*state\.split = false;.*\s*setAxis\(.*\);\s*state\.D = D0; state\.Hasked = CLEAR_H;\s*fitScreen\(\);/);
  assert.match(MAIN, /const CLEAR_H = EYE - RAIL_H - 0\.08;/);
});

// Mike, 2026-11-19: "when the rays converge ... they should keep going and the image could just be
// inverted". Past the crossing f < 0, and a point lands on the opposite side of the picture. The
// shader carries that sign on x and y (w must stay positive), and nothing clips it away.
test("converging rays cross and keep going: the world past the crossing is upside down", () => {
  const D = 2.42, s = 1.6, zc = convergenceDepth(s, D);
  const g = normalizedLens(backPlaneF(s, D), D);
  for (const z of [zc * 0.5, zc * 0.9]) assert.ok(screenPos(0, 1, 1, g(z), 1, 1).sy > 0, `before, z=${z}`);
  for (const z of [zc * 1.1, zc * 2, zc * 10]) assert.ok(screenPos(0, 1, 1, g(z), 1, 1).sy < 0, `after, z=${z}`);
  assert.match(MAIN, /float w = abs\(g\.y\), sy = g\.y < 0\.0 \? -1\.0 : 1\.0;/);
  assert.doesNotMatch(MAIN, /g\.x <= 0\.0/);
  assert.doesNotMatch(MAIN, /Nothing past that is seen/);
});

// Mike, 2026-11-19: "one where the screen is a lat-long rectangle on the sphere", with sliders for
// angular width and height (the radius went: it changed nothing). (A world-fixed grid mode was tried and dropped: "isn't even cool".) Across the picture is longitude and up is latitude, in
// the world (vertex shader), the sky and the ground painted behind, all with the same mapping.
test("the sphere lens maps longitude across and latitude up, everywhere it draws", () => {
  assert.match(MAIN, /float lon = atan\(d\.x, -d\.z\), lat = asin\(clamp\(d\.y \/ r, -1\.0, 1\.0\)\);/);
  assert.match(MAIN, /return vec4\(lon \/ sph\.y, lat \/ sph\.z,/);
  // the sky and the ground behind use one function for a pixel's direction
  assert.equal((MAIN.match(/spherePix\(vNdc, /g) || []).length, 2);
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /id="aw" min="10" max="360"/, "all the way around");
  assert.match(html, /id="ah" min="10" max="180"/, "straight down to straight up");
  assert.doesNotMatch(html, /id="rad"/, "Mike: remove the radius, it does nothing");
  assert.doesNotMatch(html, /data-mode=/, "Mike dropped the world-grid toggle: the patch only turns with you");
});

// Mike, 2026-11-21: hide where the ground ends when flying high. Everything lensified fades into
// the haze past HAZE_NEAR, and the sky below the horizon is the same haze, so the 4 km edge of the
// ground is already sky-colored. The haze must end before the ground does.
test("the far ground fades into the same haze the sky shows below the horizon", () => {
  const HTML = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const far = Number(MAIN.match(/HAZE_FAR = (\d+)/)[1]);
  const edge = Number(MAIN.match(/Math\.asinh\((\d+) \/ c\)/)[1]);
  assert.ok(far < edge, "haze must be complete before the ground's edge");
  assert.match(MAIN, /c = e < 0\.0 \? pvHaze\(e\)/, "the sky below the horizon is the haze");
  assert.match(MAIN, /gl_FragColor\.rgb = mix\(gl_FragColor\.rgb, sRGBTransferOETF\(vec4\(pvHaze/, "lensify hazes every material");
  assert.match(MAIN, /k = mix\(k, pvHaze\(/, "the sphere lens's ground backdrop hazes too");
  // and the two-lens fields say horizontal and vertical (Mike), nowhere across / up-down
  assert.match(MAIN, /"horizontal: f\(z\) ="/);
  assert.match(HTML, /vertical: f\(z\) =/);
  assert.doesNotMatch(MAIN + HTML, /across: f\(z\)|up\/down: f\(z\)/);
});

import { sensorSpreadToLens, lensToSensorSpread } from "./lens.mjs";
// Mike, 2026-11-22: no screen. Straight-ray lenses are a sensor size and a spread angle, positive
// through 0 to negative, and the view z meters out is A + z·tan(phi) tall (half), whatever D is.
test("sensor and spread give the view A + z·tan(phi), and survive the round trip", () => {
  for (const [A, phi] of [[0, 30], [0.7, 30], [1.4, 0], [1.4, -20], [0.3, -40], [1.2, 70]]) {
    const t = Math.tan(phi * Math.PI / 180);
    const { D, H, s } = sensorSpreadToLens(A, t, 2.42);
    assert.ok(H > 0 && D > 0, `${A},${phi}: positive view`);
    const g = normalizedLens(backPlaneF(s, D), D);
    for (const z of [0.5, 1, 3, 10]) {
      if (t < 0 && z > A / -t) continue;
      assert.ok(Math.abs(H * g(z) - (A + z * t)) < 1e-9, `${A},${phi} at ${z}`);
    }
    const back = lensToSensorSpread(s, H, D);
    assert.ok(Math.abs(back.A - A) < 1e-9 && Math.abs(back.tanPhi - t) < 1e-9);
  }
});
test("the panel has sensor size and spread, and no screen", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, />sensor size</); assert.match(html, />spread</);
  assert.match(html, /id="p" min="-90"/);
  assert.doesNotMatch(html, /screen distance|screen height|id="dRow"|id="hRow"/);
  const main = readFileSync(new URL("./main.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(main, /screenFill|screenEdge|tag\("screen"/);
});

// Mike, 2026-11-23: on phones, flying, the down button sat above up
test("flying on a phone, up sits above down", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const main = readFileSync(new URL("./main.mjs", import.meta.url), "utf8");
  assert.match(main, /\$\("jump"\)\.classList\.toggle\("pv-raised", m !== "walk"\)/);
  assert.match(html, /\.pv-raised \{ bottom: 196px !important; \}/);
  assert.doesNotMatch(html, /\.pv-down \{ bottom:/);
});

// ?background: the shared lib removes the panel, and the page must still run (it crashed on the
// missing chips row, found 2026-11-25)
test("?background runs without the panel and hides the button bar", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const main = readFileSync(new URL("./main.mjs", import.meta.url), "utf8");
  assert.match(main, /const \$ = \(id\) => document\.getElementById\(id\) \?\? standIns/);
  assert.match(html, /body\.pv-background \.pv-bar \{ display: none !important; \}/);
});

// Mike, 2026-11-25: "let's do rectangular fisheye and rename spherical to latitude-longitude".
// The fisheye places a direction by its angle from straight ahead (the same degrees per pixel
// everywhere), fills the whole rectangle, and its spread is measured across the width, up to 360°.
test("the fisheye places a direction by its angle from straight ahead, and lat-long is named so", () => {
  assert.match(MAIN, /float a = acos\(clamp\(-d\.z \/ r, -1\.0, 1\.0\)\);\s*return s < 1e-7 \* r \? vec2\(0\.0\) : d\.xy \* \(a \/ s\);/);
  assert.match(MAIN, /return vec4\(p\.x \/ sph\.y, p\.y \/ sph\.z,/);
  // the sky and the ground behind invert the same mapping
  assert.match(MAIN, /if \(sph\.x > 1\.5\) \{ \/\/ the fisheye/);
  // same degrees per pixel across and up: the height follows the window's shape
  assert.match(MAIN, /const fishHalf = \(\) => \{ const h = THREE\.MathUtils\.degToRad\(state\.fw \/ 2\); return \[h, h \/ camera\.aspect\]; \};/);
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /id="fw" min="10" max="360"/);
  assert.match(MAIN, /b\.textContent = "lat-long";/);
  assert.match(MAIN, /b\.textContent = "fisheye";/);
  assert.doesNotMatch(MAIN, /b\.textContent = "sphere";/);
  assert.doesNotMatch(MAIN, /patch of a sphere around your eye/);
});

// Pam, 2026-11-25: past 180° from straight ahead a fisheye pixel has no direction of its own, so
// it's dark rather than a second copy of the world; and the caption keeps its line count while the
// slider moves (the numbers keep one width, and the "behind you" sentence is always there).
test("the fisheye leaves pixels past 180° dark and its caption never rewraps mid-drag", () => {
  assert.match(MAIN, /bool fishOut\(vec2 ndc, vec3 sph\) \{ return sph\.x > 1\.5 && length\(ndc \* sph\.yz\) > /);
  assert.match(MAIN, /if \(fishOut\(vNdc, sph\)\) c = /);
  assert.match(MAIN, /if \(sd\.y > -1e-4 \|\| fishOut\(vNdc, earthSphere\)\) discard;/);
  assert.match(MAIN, /<b>\$\{state\.fw\}° × .*More than 180° across or up and down, it sees behind you\.`;/);
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.match(html, /\.pv-caption\.pv-fish \{ min-height: calc\(5 \* 1\.35em\); \}/);
  assert.doesNotMatch(html, /pv-fixnum/, "Pam: fixed-width numbers left a hole in the sentence");
  assert.match(html, /angular width<\/span>\s*<span class="value" id="fwVal">/);
});

// Mike, 2026-11-26: "When we switch lenses, make the rays lerp". Switching between kinds of lens
// (f(z), lat-long, fisheye) blends every point from where the old lens draws it to where the new
// one does, and the side view's rays slide from the old paths to the new ones.
test("switching kinds of lens blends the picture and the side view's rays", () => {
  assert.match(MAIN, /return vec4\(mix\(a\.xy \/ a\.w, b\.xy \/ b\.w, lensT\), 2\.0 \* vLensDepth - 1\.0, 1\.0\);/);
  assert.match(MAIN, /lensUniforms\.lensT\.value = kindMorph\.k;/);
  assert.match(MAIN, /for \(let i = 0; i < rayPos\.length; i\+\+\) rayPos\[i\] = mixf\(sideA\.rays\[i\], sideB\.rays\[i\]\);/);
});
