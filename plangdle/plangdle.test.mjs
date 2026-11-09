import { test } from "node:test";
import assert from "node:assert/strict";
import { ATTRS, LABELS, LANGUAGES, POOL, byName, compare, compareAttr, search, dailyAnswer, dayNumber, shareText } from "./plangdle.mjs";

test("every value is a known label", () => {
  for (const l of LANGUAGES) for (const { key } of ATTRS) {
    if (key === "year") { assert.ok(Number.isInteger(l.year) && l.year > 1940, l.name); continue; }
    assert.ok(l[key].length > 0, `${l.name}.${key} empty`);
    if (LABELS[key]) for (const v of l[key]) assert.ok(v in LABELS[key], `${l.name}.${key}: ${v}`);
  }
});

test("names and aliases are unique", () => {
  const seen = new Set();
  for (const l of LANGUAGES) for (const n of [l.name, ...l.aliases].map((s) => s.toLowerCase())) {
    assert.ok(!seen.has(n), `duplicate ${n}`); seen.add(n);
  }
});

test("a language matches itself everywhere", () => {
  for (const l of LANGUAGES) for (const r of Object.values(compare(l, l))) assert.equal(r.status, "hit");
});

test("year: near within 5, arrow toward the answer", () => {
  assert.deepEqual(compareAttr("year", byName("Java"), byName("Python")), { status: "near", arrow: "down" });
  assert.deepEqual(compareAttr("year", byName("C"), byName("Go")), { status: "miss", arrow: "up" });
  assert.deepEqual(compareAttr("year", byName("Ruby"), byName("Java")), { status: "hit" });
});

test("sets: overlap is yellow", () => {
  assert.equal(compareAttr("lineage", byName("Scala"), byName("Haskell")).status, "near");
  assert.equal(compareAttr("lineage", byName("Haskell"), byName("Java")).status, "miss");
  assert.equal(compareAttr("typing", byName("Groovy"), byName("Java")).status, "near");
});

test("memory: automatic or manual, Rust is automatic", () => {
  assert.equal(compareAttr("memory", byName("Rust"), byName("Java")).status, "hit");
  assert.equal(compareAttr("memory", byName("Rust"), byName("C")).status, "miss");
  assert.equal(compareAttr("memory", byName("C++"), byName("Zig")).status, "hit");
});

test("indexing: declared is yellow against either", () => {
  assert.equal(compareAttr("index", byName("Pascal"), byName("C")).status, "near");
  assert.equal(compareAttr("index", byName("Lua"), byName("Pascal")).status, "near");
  assert.equal(compareAttr("index", byName("Lua"), byName("C")).status, "miss");
});

test("search ranks names, then aliases, and skips excluded", () => {
  assert.equal(search("c")[0].name, "C");
  assert.equal(search("js")[0].name, "JavaScript");
  assert.equal(search("golang")[0].name, "Go");
  assert.ok(!search("java", new Set(["Java"])).some((l) => l.name === "Java"));
  assert.equal(search("").length, 0);
});

test("daily answers cover the pool before repeating", () => {
  const first = new Set();
  for (let d = 1; d <= POOL.length; d++) first.add(dailyAnswer(d).name);
  assert.equal(first.size, POOL.length);
  assert.equal(dailyAnswer(5), dailyAnswer(5));
});

test("day numbers count local calendar days", () => {
  assert.equal(dayNumber(new Date(2026, 10, 8, 0, 1)), 1);
  assert.equal(dayNumber(new Date(2026, 10, 8, 23, 59)), 1);
  assert.equal(dayNumber(new Date(2026, 10, 9, 0, 0)), 2);
});

test("share text: title, one row per guess, the count, the link", () => {
  const t = shareText({ guesses: [byName("C"), byName("Go")], answer: byName("Go"), link: "https://x/" }).split("\n");
  assert.deepEqual([t[0], t[3], t[4]], ["Plangdle", "2 guesses", "https://x/"]);
  assert.equal(t[2], "🟩".repeat(ATTRS.length));
});

test("share text says when you gave up", () => {
  const t = shareText({ label: "unlimited", guesses: [byName("C")], answer: byName("Go"), gaveUp: true }).split("\n");
  assert.equal(t.length, 3);
  assert.equal(t[2], "🏳️ gave up after 1 guess");
  assert.ok(!t.includes("🟩".repeat(ATTRS.length)));
});
