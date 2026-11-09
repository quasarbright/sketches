// Plangdle: the language table and the rules for comparing a guess to the answer.
// Pure logic, no DOM, so the page, the about-modal diagrams and the tests all share it.
//
// Every attribute is either an origin fact (year, lineage) or a foundation that a language
// can't change without breaking every program written in it (blocks, indexing, typing,
// memory, comments, how it runs). Features that languages pick up over time are left out
// on purpose, so existing rows never need editing; only new languages get added.

// ---------------------------------------------------------------- attributes

export const ATTRS = [
  { key: "year",    field: "year",    title: "First appeared",
    help: "Year of the first public release. Yellow within 5 years; the arrow points toward the answer." },
  { key: "typing",  field: "typing",  title: "Typing",
    help: "Static: types are checked before the program runs. Dynamic: values carry their types at run time. Yellow when the languages share one of them." },
  { key: "runs",    field: "runs",    title: "Runs as",
    help: "What the language hands to the computer: a native binary, bytecode for a virtual machine, source for an interpreter (JITs count here), or source that compiles to another language." },
  { key: "blocks",  field: "blocks",  title: "Blocks",
    help: "How code is grouped: { braces }, indentation, keywords like begin/end, or Lisp parentheses." },
  { key: "memory",  field: "memory",  title: "Memory",
    help: "Whether memory is freed for you (automatic) or you free it yourself (manual). Green or red only." },
  { key: "index",   field: "index",   title: "Indexing",
    help: "Where arrays and lists start counting. 'declared' means you pick the bounds (Pascal, Ada); that's yellow against either." },
  { key: "comment", field: "comment", title: "Comment",
    help: "The token that starts a comment. Green or red only." },
  { key: "lineage", field: "lineage", title: "Lineage",
    help: "The family it descends from, which mostly decides its paradigm: C family, ALGOL / Pascal, ML / functional, Lisp, Smalltalk / OO, scripting, logic, array / numeric, Erlang / actors, or Fortran / BASIC / COBOL. Yellow when the languages share one of their families." },
];

export const LABELS = {
  typing:  { static: "static", dynamic: "dynamic" },
  runs:    { native: "native binary", vm: "VM bytecode", interp: "interpreter", trans: "transpiled" },
  blocks:  { braces: "{ braces }", indent: "indentation", keywords: "keywords", parens: "( parens )", none: "none" },
  memory:  { auto: "automatic", manual: "manual" },
  index:   { 0: "0", 1: "1", declared: "declared" },
  lineage: {
    c: "C family", algol: "ALGOL / Pascal", ml: "ML / functional", lisp: "Lisp",
    smalltalk: "Smalltalk / OO", script: "scripting", logic: "logic", array: "array / numeric",
    erlang: "Erlang / actors", early: "Fortran / BASIC / COBOL",
  },
};

// ---------------------------------------------------------------- the languages
// L(name, year, typing, runs, blocks, memory, index, comment, lineage, extra)
// Set-valued fields are space-separated. `pool: false` keeps a language guessable but never
// the answer, so the daily puzzle doesn't land on something obscure.
// Years follow Wikipedia's "first appeared".

function L(name, year, typing, runs, blocks, memory, index, comment, lineage, extra = {}) {
  const set = (s) => String(s).split(" ");
  return {
    name, year,
    typing: set(typing), runs: set(runs), blocks: set(blocks), memory: set(memory),
    index: set(index), comment: set(comment), lineage: set(lineage),
    aliases: extra.aliases || [], pool: extra.pool !== false,
  };
}

export const LANGUAGES = [
  L("C",            1972, "static",         "native",    "braces",        "manual",       0,   "//",    "c"),
  L("C++",          1985, "static",         "native",    "braces",        "manual",       0,   "//",    "c", { aliases: ["cpp", "cplusplus"] }),
  L("Java",         1995, "static",         "vm",        "braces",        "auto",0,   "//",    "c"),
  L("C#",           2000, "static",         "vm",        "braces",        "auto",0,   "//",    "c", { aliases: ["csharp", "c sharp"] }),
  L("JavaScript",   1995, "dynamic",        "interp",    "braces",        "auto",0,   "//",    "c script", { aliases: ["js", "ecmascript"] }),
  L("TypeScript",   2012, "static",         "trans",     "braces",        "auto",0,   "//",    "c script", { aliases: ["ts"] }),
  L("Python",       1991, "dynamic",        "interp",    "indent",        "auto",0,   "#",     "script", { aliases: ["py"] }),
  L("Ruby",         1995, "dynamic",        "interp",    "keywords",      "auto",0,   "#",     "smalltalk script", { aliases: ["rb"] }),
  L("PHP",          1995, "dynamic",        "interp",    "braces",        "auto",0,   "// #",  "c script"),
  L("Perl",         1987, "dynamic",        "interp",    "braces",        "auto",0,   "#",     "script"),
  L("Go",           2009, "static",         "native",    "braces",        "auto",0,   "//",    "c", { aliases: ["golang"] }),
  L("Rust",         2012, "static",         "native",    "braces",        "auto",0,   "//",    "c ml", { aliases: ["rs"] }),
  L("Swift",        2014, "static",         "native",    "braces",        "auto",0,   "//",    "c"),
  L("Kotlin",       2011, "static",         "vm",        "braces",        "auto",0,   "//",    "c", { aliases: ["kt"] }),
  L("Scala",        2004, "static",         "vm",        "braces indent", "auto",0,   "//",    "c ml"),
  L("Dart",         2011, "static",         "vm native", "braces",        "auto",0,   "//",    "c"),
  L("Groovy",       2003, "dynamic static", "vm",        "braces",        "auto",0,   "//",    "c script", { pool: false }),
  L("Objective-C",  1984, "static dynamic", "native",    "braces",        "auto",0,   "//",    "c smalltalk", { aliases: ["objc", "obj-c"] }),
  L("D",            2001, "static",         "native",    "braces",        "auto",0,   "//",    "c", { aliases: ["dlang"], pool: false }),
  L("Zig",          2016, "static",         "native",    "braces",        "manual",       0,   "//",    "c"),
  L("Haxe",         2005, "static",         "trans",     "braces",        "auto",0,   "//",    "c", { pool: false }),
  L("Haskell",      1990, "static",         "native",    "indent",        "auto",0,   "--",    "ml", { aliases: ["hs"] }),
  L("OCaml",        1996, "static",         "native",    "keywords",      "auto",0,   "(*",    "ml", { aliases: ["ml"] }),
  L("Standard ML",  1983, "static",         "native",    "keywords",      "auto",0,   "(*",    "ml", { aliases: ["sml"], pool: false }),
  L("F#",           2005, "static",         "vm",        "indent",        "auto",0,   "//",    "ml", { aliases: ["fsharp", "f sharp"] }),
  L("Elm",          2012, "static",         "trans",     "indent",        "auto",0,   "--",    "ml"),
  L("PureScript",   2013, "static",         "trans",     "indent",        "auto",0,   "--",    "ml", { pool: false }),
  L("Gleam",        2016, "static",         "vm trans",  "braces",        "auto",0,   "//",    "ml erlang", { pool: false }),
  L("Erlang",       1986, "dynamic",        "vm",        "keywords",      "auto",1,   "%",     "erlang"),
  L("Elixir",       2012, "dynamic",        "vm",        "keywords",      "auto",0,   "#",     "erlang", { aliases: ["ex"] }),
  L("Common Lisp",  1984, "dynamic",        "native",    "parens",        "auto",0,   ";",     "lisp", { aliases: ["lisp", "cl"] }),
  L("Scheme",       1975, "dynamic",        "interp",    "parens",        "auto",0,   ";",     "lisp"),
  L("Racket",       1995, "dynamic",        "vm",        "parens",        "auto",0,   ";",     "lisp"),
  L("Clojure",      2007, "dynamic",        "vm",        "parens",        "auto",0,   ";",     "lisp", { aliases: ["clj"] }),
  L("Emacs Lisp",   1985, "dynamic",        "interp",    "parens",        "auto",0,   ";",     "lisp", { aliases: ["elisp"], pool: false }),
  L("Lua",          1993, "dynamic",        "interp",    "keywords",      "auto",1,   "--",    "script"),
  L("R",            1993, "dynamic",        "interp",    "braces",        "auto",1,   "#",     "array"),
  L("MATLAB",       1984, "dynamic",        "interp",    "keywords",      "auto",1,   "%",     "array", { aliases: ["octave"] }),
  L("Julia",        2012, "dynamic",        "interp",    "keywords",      "auto",1,   "#",     "array", { aliases: ["jl"] }),
  L("APL",          1966, "dynamic",        "interp",    "braces",        "auto",1,   "⍝",     "array", { pool: false }),
  L("Fortran",      1957, "static",         "native",    "keywords",      "manual",       1,   "!",     "early"),
  L("COBOL",        1960, "static",         "native",    "keywords",      "manual",       1,   "*>",    "early"),
  L("BASIC",        1964, "static",         "interp",    "keywords",      "auto",0,   "REM '", "early"),
  L("Visual Basic .NET", 2001, "static",    "vm",        "keywords",      "auto",0,   "'",     "early", { aliases: ["vb", "vb.net", "visual basic"], pool: false }),
  L("Pascal",       1970, "static",         "native",    "keywords",      "manual",       "declared", "{", "algol"),
  L("Ada",          1980, "static",         "native",    "keywords",      "manual",       "declared", "--", "algol"),
  L("Nim",          2008, "static",         "native",    "indent",        "auto",0,   "#",     "algol script", { pool: false }),
  L("Crystal",      2014, "static",         "native",    "keywords",      "auto",0,   "#",     "smalltalk script", { pool: false }),
  L("Smalltalk",    1972, "dynamic",        "vm",        "braces",        "auto",1,   "\"",    "smalltalk"),
  L("Prolog",       1972, "dynamic",        "interp",    "none",          "auto",1,   "%",     "logic"),
  L("Bash",         1989, "dynamic",        "interp",    "keywords",      "auto",0,   "#",     "script", { aliases: ["sh", "shell"] }),
  L("AWK",          1977, "dynamic",        "interp",    "braces",        "auto",1,   "#",     "script", { pool: false }),
  L("Tcl",          1988, "dynamic",        "interp",    "braces",        "auto",0,   "#",     "script", { pool: false }),
  L("PowerShell",   2006, "dynamic",        "interp",    "braces",        "auto",0,   "#",     "script", { aliases: ["ps", "pwsh"], pool: false }),
  L("Raku",         2015, "dynamic static", "vm",        "braces",        "auto",0,   "#",     "script", { aliases: ["perl 6"], pool: false }),
  L("CoffeeScript", 2009, "dynamic",        "trans",     "indent",        "auto",0,   "#",     "script", { pool: false }),
];

export const POOL = LANGUAGES.filter((l) => l.pool);
export const byName = (name) => LANGUAGES.find((l) => l.name === name);

// ---------------------------------------------------------------- comparing

export const YEAR_NEAR = 5;

const overlaps = (a, b) => a.some((x) => b.includes(x));
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

// One attribute: { status: "hit" | "near" | "miss", arrow?: "up" | "down", shared?: [...] }
export function compareAttr(key, guess, answer) {
  if (key === "year") {
    const d = answer.year - guess.year;
    if (d === 0) return { status: "hit" };
    return { status: Math.abs(d) <= YEAR_NEAR ? "near" : "miss", arrow: d > 0 ? "up" : "down" };
  }
  const g = guess[key], a = answer[key];
  if (sameSet(g, a)) return { status: "hit" };
  if (overlaps(g, a)) return { status: "near", shared: g.filter((x) => a.includes(x)) };
  if (key === "index" && (g.includes("declared") || a.includes("declared"))) return { status: "near" };
  return { status: "miss" };
}

export function compare(guess, answer) {
  const out = {};
  for (const { key } of ATTRS) out[key] = compareAttr(key, guess, answer);
  return out;
}

// ---------------------------------------------------------------- search

const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();

// names first by prefix, then by substring, then aliases
export function search(query, exclude = new Set()) {
  const q = norm(query);
  if (!q) return [];
  const scored = [];
  for (const l of LANGUAGES) {
    if (exclude.has(l.name)) continue;
    const n = norm(l.name);
    let s = -1;
    if (n === q) s = 0;
    else if (l.aliases.some((a) => norm(a) === q)) s = 1;
    else if (n.startsWith(q)) s = 2;
    else if (l.aliases.some((a) => norm(a).startsWith(q))) s = 3;
    else if (n.includes(q)) s = 4;
    if (s >= 0) scored.push([s, l]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].name.length - b[1].name.length || a[1].name.localeCompare(b[1].name));
  return scored.map(([, l]) => l);
}

// ---------------------------------------------------------------- the daily puzzle

// day 1 is 2026-11-08, counted in the player's local calendar
const EPOCH = Date.UTC(2026, 10, 8);
export function dayNumber(date = new Date()) {
  const local = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((local - EPOCH) / 86400000) + 1;
}

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(arr, rand) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Walk through the pool in a fixed shuffled order, reshuffling each full cycle, so no
// language repeats until every pool language has had its day.
export function dailyAnswer(day) {
  const n = POOL.length, cycle = Math.floor((day - 1) / n), i = (((day - 1) % n) + n) % n;
  return shuffled(POOL, mulberry32(0x9e3779b9 ^ cycle))[i];
}

export function randomAnswer(rand = Math.random, not) {
  let l;
  do l = POOL[Math.floor(rand() * POOL.length)]; while (POOL.length > 1 && l === not);
  return l;
}

// ---------------------------------------------------------------- sharing

// Laid out like Permutle's: a title, the colors with no names, how it went, and a link. A round you
// gave up on never reaches an all-green row, and its last line says so.
const SQUARE = { hit: "🟩", near: "🟨", miss: "🟥" };
export function shareText({ label = "", guesses, answer, gaveUp = false, link = "" }) {
  const rows = guesses.map((g) => ATTRS.map(({ key }) => SQUARE[compareAttr(key, g, answer).status]).join(""));
  const n = guesses.length, count = `${n} ${n === 1 ? "guess" : "guesses"}`;
  const how = gaveUp ? `🏳️ gave up after ${count}` : count;
  return [label ? `Plangdle ${label}` : "Plangdle", ...rows, how, link].filter(Boolean).join("\n");
}
export const shareRows = (args) => shareText({ ...args, link: "" }).split("\n").slice(1, 1 + args.guesses.length).join("\n");
