// Unit tests for the lens core. Run: node --test  (from perspectivent/)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseExpr, backPlaneF, convergenceDepth, backPlaneText, normalizedLens, compileLens,
  LUT, lutDepth, sampleLens, PRESETS,
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

test("non-finite lens values sample as clipped", () => {
  const g = normalizedLens(parseExpr("1/z"), 10);
  assert.equal(g(0), -1); // 1/0 = Infinity is not seen
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
