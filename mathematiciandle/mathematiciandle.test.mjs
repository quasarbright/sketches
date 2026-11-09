import { test } from "node:test";
import assert from "node:assert/strict";
import { ATTRS, LABELS, COUNTRIES, MATHEMATICIANS, POOL, byName, bornLabel, compare, compareAttr, search, sortKey, dailyAnswer, dayNumber, shareText } from "./mathematiciandle.mjs";

test("every value is a known label", () => {
  for (const m of MATHEMATICIANS) {
    assert.ok(Number.isInteger(m.born), m.name);
    assert.ok(m.country in COUNTRIES, `${m.name}.country: ${m.country}`);
    for (const key of ["fields", "also", "named"]) {
      assert.ok(m[key].length > 0, `${m.name}.${key} empty`);
      for (const v of m[key]) assert.ok(v in LABELS[key], `${m.name}.${key}: ${v}`);
      if (m[key].length > 1) assert.ok(!m[key].includes("none"), `${m.name}.${key}: none plus others`);
    }
  }
});

test("names and aliases are unique", () => {
  const seen = new Set();
  for (const m of MATHEMATICIANS) for (const n of [m.name, ...m.aliases].map((s) => s.toLowerCase())) {
    assert.ok(!seen.has(n), `duplicate ${n}`); seen.add(n);
  }
});

test("Mike's must-haves are answers", () => {
  for (const n of ["Terence Tao", "Grigori Perelman", "John Conway", "Alan Turing"]) assert.ok(byName(n)?.pool, n);
});

test("a mathematician matches themself everywhere", () => {
  for (const m of MATHEMATICIANS) for (const r of Object.values(compare(m, m))) assert.equal(r.status, "hit");
});

test("born: near within 20, arrow toward the answer", () => {
  assert.deepEqual(compareAttr("born", byName("Leonhard Euler"), byName("Joseph-Louis Lagrange")), { status: "miss", arrow: "up" });
  assert.deepEqual(compareAttr("born", byName("Bernhard Riemann"), byName("Georg Cantor")), { status: "near", arrow: "up" });
  assert.deepEqual(compareAttr("born", byName("Alan Turing"), byName("Kurt Gödel")), { status: "near", arrow: "down" });
});

test("born in: same continent is yellow, unknown never is", () => {
  assert.equal(compareAttr("country", byName("Carl Friedrich Gauss"), byName("David Hilbert")).status, "near");
  assert.equal(compareAttr("country", byName("Srinivasa Ramanujan"), byName("Maryam Mirzakhani")).status, "near");
  assert.equal(compareAttr("country", byName("Terence Tao"), byName("John Nash")).status, "miss");
  assert.equal(compareAttr("country", byName("Euclid"), byName("Hypatia")).status, "miss");
});

test("sets: overlap is yellow", () => {
  assert.equal(compareAttr("fields", byName("Alan Turing"), byName("Kurt Gödel")).status, "near");
  assert.equal(compareAttr("named", byName("Évariste Galois"), byName("Sophus Lie")).status, "hit");
  assert.equal(compareAttr("also", byName("John Nash"), byName("Isaac Newton")).status, "miss");
});

test("born labels", () => {
  assert.equal(bornLabel(byName("Archimedes")), "c. 287 BC");
  assert.equal(bornLabel(byName("Alan Turing")), "1912");
});

test("search finds family names, accents and aliases", () => {
  assert.equal(search("gauss")[0].name, "Carl Friedrich Gauss");
  assert.equal(search("godel")[0].name, "Kurt Gödel");
  assert.equal(search("perlman")[0].name, "Grigori Perelman");
  assert.equal(search("tao")[0].name, "Terence Tao");
  assert.ok(!search("euler", new Set(["Leonhard Euler"])).some((m) => m.name === "Leonhard Euler"));
  assert.equal(search("").length, 0);
});

test("sorting goes by family name", () => {
  assert.equal(sortKey(byName("Carl Friedrich Gauss")), "gauss");
  assert.equal(sortKey(byName("John von Neumann")), "neumann");
  assert.equal(sortKey(byName("Pierre de Fermat")), "fermat");
});

test("daily answers cover the pool before repeating", () => {
  const first = new Set();
  for (let d = 1; d <= POOL.length; d++) first.add(dailyAnswer(d).name);
  assert.equal(first.size, POOL.length);
});

test("day numbers count local calendar days", () => {
  assert.equal(dayNumber(new Date(2026, 10, 8, 23, 59)), 1);
  assert.equal(dayNumber(new Date(2026, 10, 9, 0, 0)), 2);
});

test("share text: title, rows, count, link; give-ups say so", () => {
  const t = shareText({ guesses: [byName("Isaac Newton"), byName("Leonhard Euler")], answer: byName("Leonhard Euler"), link: "https://x/" }).split("\n");
  assert.deepEqual([t[0], t[2], t[3], t[4]], ["Mathematiciandle", "🟩".repeat(ATTRS.length), "2 guesses", "https://x/"]);
  const g = shareText({ label: "unlimited", guesses: [byName("Isaac Newton")], answer: byName("Leonhard Euler"), gaveUp: true }).split("\n");
  assert.equal(g.at(-1), "🏳️ gave up after 1 guess");
});
