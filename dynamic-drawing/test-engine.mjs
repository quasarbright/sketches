import { test } from "node:test";
import assert from "node:assert/strict";
import { evalSrc, renameIdent } from "./expr.js";
import { run, magnets, dataScope } from "./engine.js";
import { EXAMPLES } from "./examples.js";

const env = (o = {}) => ({ lookup: (n) => o[n] });

test("arrays broadcast and reduce", () => {
  assert.deepEqual(evalSrc("[1,2,3] * 2 + 1", env()), [3, 5, 7]);
  assert.equal(evalSrc("max(a) / count(a)", env({ a: [2, 8, 4] })), 8 / 3);
  assert.deepEqual(evalSrc("cumsum([1,2,3])", env()), [1, 3, 6]);
  assert.equal(evalSrc("2 ^ 3 ^ 2", env()), 512);
  assert.equal(evalSrc("1 < 2 ? 10 : 20", env()), 10);
  assert.equal(evalSrc("fmt(3.14159, 1)", env()), "3.1");
});

test("data is declarative: order doesn't matter, cycles are caught", () => {
  const d = dataScope([{ name: "b", expr: "a * 2" }, { name: "a", expr: "3" }, { name: "x", expr: "y" }, { name: "y", expr: "x" }]);
  assert.equal(d.vals.get("b"), 6);
  assert.ok(d.errs.has("x"));
});

test("rename leaves .member names alone", () => {
  assert.equal(renameIdent("width(bar) + bar.width + width", "width", "w"), "w(bar) + bar.width + w");
});

test("solar bar chart draws 12 bars scaled to the data", () => {
  const proj = EXAMPLES[0].make();
  const r = run(proj, proj.pictures[0]);
  const bars = r.byName.get("bar");
  assert.equal(bars.length, 12);
  assert.ok(r.trace.every((e) => !e.err), JSON.stringify(r.trace.filter((e) => e.err)));
  // bars sit on the bottom of the page and are as tall as energy / top
  const e = r.data.get("energyMwh");
  for (let i = 0; i < 12; i++) {
    const M = magnets(bars[i]);
    assert.ok(Math.abs(M.b_[1] - 400) < 1e-6);
    assert.ok(Math.abs((M.b_[1] - M.t[1]) - 400 * e[i] / 25) < 1e-6);
  }
  // the guide ends up past the right edge
  assert.ok(Math.abs(magnets(r.latest("guide")).tl[0] - 640) < 1e-6);
});

test("stopping partway shows the picture as it was", () => {
  const proj = EXAMPLES[0].make();
  const r = run(proj, proj.pictures[0], { stopAt: 1 + 4 * 3 + 1 }); // through the bar of the 4th month
  assert.equal(r.byName.get("bar").length, 4);
});

test("scatter: first link has no previous dot, the rest do", () => {
  const proj = EXAMPLES[1].make();
  const r = run(proj, proj.pictures[0]);
  const links = r.trace.filter((e) => e.stepId === 4);
  assert.ok(links[0].err);
  assert.ok(links.slice(1).every((e) => !e.err));
  assert.equal(r.byName.get("dot").length, 8);
  const w = r.byName.get("wing")[0], d = r.byName.get("dot")[0];
  assert.ok(Math.abs((w.a[0] + w.b[0]) / 2 - d.c[0]) < 1e-6);
});

test("pictures inside pictures take overrides and give measurements", () => {
  const proj = EXAMPLES[0].make();
  const r = run(proj, proj.pictures[1]);
  assert.ok(r.trace.every((e) => !e.err), JSON.stringify(r.trace.filter((e) => e.err)));
  const here = r.latest("here"), there = r.latest("there");
  assert.equal(here.sub.filter((s) => s.name === "bar").length, 12);
  assert.equal(here.sub.filter((s) => s.name === "label").length, 0);   // labels: 0 skips the if
  assert.equal(there.sub.find((s) => s.name === "bar").props.fill, "#f2a65a");
  assert.ok(r.measures.difference > 0);
});

test("a picture can draw itself, to a limited depth", () => {
  const proj = EXAMPLES[3].make();
  const r = run(proj, proj.pictures[0]);
  let lines = 0;
  const count = (shapes) => { for (const s of shapes) { if (s.kind === "line") lines++; if (s.sub) count(s.sub); } };
  count(r.shapes);
  assert.equal(lines, 2 ** 8 - 1);
});

test("pie wedges arc along the rim", () => {
  const proj = EXAMPLES[2].make();
  const r = run(proj, proj.pictures[0]);
  assert.ok(r.trace.every((e) => !e.err), JSON.stringify(r.trace.filter((e) => e.err)));
  const w = r.byName.get("wedge");
  assert.equal(w.length, 5);
  assert.ok(w[0].arcs[2] && Math.abs(w[0].arcs[2].t1 - w[0].arcs[2].t0 - 0.3) < 1e-9);
});
