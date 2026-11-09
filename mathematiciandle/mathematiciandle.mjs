// Mathematiciandle: the mathematician table and the rules for comparing a guess to the answer.
// Pure logic, no DOM, so the page and the tests share it.
//
// Every attribute is a fact about someone's life or work that doesn't change: when and where they
// were born, what they worked on, and what kinds of things carry their name. Living mathematicians
// are in too; none of their fields here move when they publish something new.

// ---------------------------------------------------------------- attributes

export const ATTRS = [
  { key: "born",    field: "born",          title: "Born",
    help: "Year of birth. Yellow within 20 years; the arrow points toward the answer. Ancient dates are the usual estimates." },
  { key: "country", field: "born in",       title: "Born in",
    help: "The country their birthplace is in today, so Hilbert's Königsberg counts as Russia and Archimedes' Syracuse as Italy. Yellow on the same continent." },
  { key: "fields",  field: "fields",        title: "Fields",
    help: "The areas of math they're known for: algebra, analysis, geometry, number theory, topology, logic, probability & statistics, combinatorics, applied math, or computing. Yellow when they share one." },
  { key: "also",    field: "also",          title: "Also worked in",
    help: "Work outside math they're known for: physics, astronomy, philosophy, engineering or economics, or just math. Yellow when they share one." },
  { key: "named",   field: "named after",   title: "Named after them",
    help: "Kinds of things that carry their name: a theorem, theory, conjecture, number, equation, method, object (a space, group, curve, machine…), law, unit or paradox. Yellow when they share one." },
];

export const LABELS = {
  fields: {
    algebra: "algebra", analysis: "analysis", geometry: "geometry", number: "number theory",
    topology: "topology", logic: "logic", probability: "probability", combinatorics: "combinatorics",
    applied: "applied", computing: "computing",
  },
  also: { physics: "physics", astronomy: "astronomy", philosophy: "philosophy", engineering: "engineering", economics: "economics", none: "just math" },
  named: {
    theorem: "theorem", theory: "theory", conjecture: "conjecture", number: "number", equation: "equation",
    method: "method", object: "object", law: "law", unit: "unit", paradox: "paradox", none: "nothing",
  },
};

// country → [label, continent]; "born in" is yellow on the same continent
export const COUNTRIES = {
  greece: ["Greece", "europe"], italy: ["Italy", "europe"], egypt: ["Egypt", "africa"], turkey: ["Turkey", "asia"],
  india: ["India", "asia"], uk: ["UK", "europe"], ireland: ["Ireland", "europe"], france: ["France", "europe"],
  germany: ["Germany", "europe"], switzerland: ["Switzerland", "europe"], norway: ["Norway", "europe"],
  russia: ["Russia", "europe"], poland: ["Poland", "europe"], hungary: ["Hungary", "europe"],
  czechia: ["Czechia", "europe"], lithuania: ["Lithuania", "europe"], usa: ["USA", "namerica"],
  australia: ["Australia", "oceania"], iran: ["Iran", "asia"], unknown: ["unknown", "unknown"],
};

// ---------------------------------------------------------------- the mathematicians
// M(name, born, country, fields, also, named, extra)
// Set-valued fields are space-separated. Negative years are BC; `approx` marks the ancient
// estimates. `pool: false` keeps someone guessable but never the answer, so the daily puzzle
// stays on names most people have heard.

function M(name, born, country, fields, also, named, extra = {}) {
  const set = (s) => String(s).split(" ");
  return {
    name, born, approx: !!extra.approx, country,
    fields: set(fields), also: set(also), named: set(named),
    aliases: extra.aliases || [], pool: extra.pool !== false,
  };
}

export const MATHEMATICIANS = [
  M("Thales",             -624, "turkey",      "geometry",                                  "philosophy astronomy",      "theorem", { approx: true, pool: false, aliases: ["Thales of Miletus"] }),
  M("Pythagoras",         -570, "greece",      "geometry number",                           "philosophy",                "theorem object", { approx: true }),
  M("Euclid",             -325, "unknown",     "geometry number",                           "none",                      "theorem method object", { approx: true, pool: false }),
  M("Archimedes",         -287, "italy",       "geometry analysis applied",                 "physics engineering",       "object law number", { approx: true }),
  M("Hypatia",             360, "egypt",       "geometry algebra",                          "philosophy astronomy",      "none", { approx: true, pool: false }),
  M("Brahmagupta",         598, "india",       "algebra number",                            "astronomy",                 "theorem equation", { pool: false }),
  M("Fibonacci",          1170, "italy",       "number",                                    "none",                      "number", { approx: true, aliases: ["Leonardo of Pisa"] }),
  M("John Napier",        1550, "uk",          "analysis",                                  "none",                      "number object", { pool: false, aliases: ["Napier"] }),
  M("René Descartes",     1596, "france",      "geometry algebra",                          "philosophy physics",        "theorem object law", { aliases: ["Descartes", "Rene Descartes"] }),
  M("Pierre de Fermat",   1601, "france",      "number probability geometry analysis",      "physics",                   "theorem number law", { aliases: ["Fermat"] }),
  M("Blaise Pascal",      1623, "france",      "geometry probability combinatorics",        "physics philosophy engineering", "theorem object law unit", { aliases: ["Pascal"] }),
  M("Isaac Newton",       1643, "uk",          "analysis applied",                          "physics astronomy",         "method law unit", { aliases: ["Newton"] }),
  M("Gottfried Leibniz",  1646, "germany",     "analysis logic",                            "philosophy engineering",    "equation", { aliases: ["Leibniz", "Gottfried Wilhelm Leibniz"] }),
  M("Jacob Bernoulli",    1655, "switzerland", "probability analysis",                      "none",                      "number object equation", { aliases: ["Bernoulli", "Jakob Bernoulli"] }),
  M("Brook Taylor",       1685, "uk",          "analysis",                                  "none",                      "theorem object", { pool: false, aliases: ["Taylor"] }),
  M("Abraham de Moivre",  1667, "france",      "probability",                               "none",                      "theorem equation", { pool: false, aliases: ["de Moivre", "Moivre"] }),
  M("Christian Goldbach", 1690, "russia",      "number",                                    "none",                      "conjecture", { pool: false, aliases: ["Goldbach"] }),
  M("Thomas Bayes",       1701, "uk",          "probability",                               "none",                      "theorem", { pool: false, aliases: ["Bayes"] }),
  M("Leonhard Euler",     1707, "switzerland", "analysis number combinatorics geometry applied", "physics astronomy engineering", "theorem conjecture number equation method object", { aliases: ["Euler"] }),
  M("Joseph-Louis Lagrange", 1736, "italy",    "analysis number algebra applied",           "physics astronomy",         "theorem method equation object", { aliases: ["Lagrange"] }),
  M("Pierre-Simon Laplace",  1749, "france",   "analysis probability applied",              "physics astronomy",         "equation object", { aliases: ["Laplace"] }),
  M("Joseph Fourier",     1768, "france",      "analysis applied",                          "physics",                   "object law", { aliases: ["Fourier"] }),
  M("Sophie Germain",     1776, "france",      "number applied",                            "physics",                   "theorem number", { aliases: ["Germain"] }),
  M("Carl Friedrich Gauss", 1777, "germany",   "number analysis geometry probability algebra", "physics astronomy",      "theorem method object law unit", { aliases: ["Gauss"] }),
  M("Augustin-Louis Cauchy", 1789, "france",   "analysis algebra",                          "physics",                   "theorem equation object", { aliases: ["Cauchy"] }),
  M("August Möbius",      1790, "germany",     "geometry topology",                         "astronomy",                 "object", { aliases: ["Möbius", "Mobius", "August Mobius"] }),
  M("Niels Henrik Abel",  1802, "norway",      "algebra analysis",                          "none",                      "theorem object", { aliases: ["Abel"] }),
  M("William Rowan Hamilton", 1805, "ireland", "algebra applied",                           "physics astronomy",         "equation object", { pool: false, aliases: ["Hamilton"] }),
  M("Évariste Galois",    1811, "france",      "algebra",                                   "none",                      "theory object", { aliases: ["Galois", "Evariste Galois"] }),
  M("Ada Lovelace",       1815, "uk",          "computing",                                 "none",                      "object", { aliases: ["Lovelace", "Ada"] }),
  M("George Boole",       1815, "uk",          "logic algebra",                             "philosophy",                "object", { aliases: ["Boole"] }),
  M("Karl Weierstrass",   1815, "germany",     "analysis",                                  "none",                      "theorem object", { pool: false, aliases: ["Weierstrass"] }),
  M("Arthur Cayley",      1821, "uk",          "algebra",                                   "none",                      "theorem object", { pool: false, aliases: ["Cayley"] }),
  M("Bernhard Riemann",   1826, "germany",     "analysis geometry number",                  "physics",                   "conjecture theorem object", { aliases: ["Riemann"] }),
  M("Richard Dedekind",   1831, "germany",     "algebra number",                            "none",                      "object", { pool: false, aliases: ["Dedekind"] }),
  M("Sophus Lie",         1842, "norway",      "algebra geometry",                          "none",                      "theory object", { pool: false, aliases: ["Lie"] }),
  M("Georg Cantor",       1845, "russia",      "logic analysis",                            "none",                      "theorem object", { aliases: ["Cantor"] }),
  M("Felix Klein",        1849, "germany",     "geometry algebra",                          "none",                      "object", { aliases: ["Klein"] }),
  M("Sofya Kovalevskaya", 1850, "russia",      "analysis applied",                          "physics",                   "theorem object", { pool: false, aliases: ["Kovalevskaya", "Sofia Kovalevskaya"] }),
  M("Henri Poincaré",     1854, "france",      "topology geometry analysis applied",        "physics philosophy astronomy", "conjecture theorem object", { aliases: ["Poincaré", "Poincare", "Henri Poincare"] }),
  M("Andrey Markov",      1856, "russia",      "probability",                               "none",                      "object", { pool: false, aliases: ["Markov"] }),
  M("David Hilbert",      1862, "russia",      "algebra geometry logic analysis",           "physics",                   "theorem object", { aliases: ["Hilbert"] }),
  M("Hermann Minkowski",  1864, "lithuania",   "geometry number",                           "physics",                   "theorem equation object", { pool: false, aliases: ["Minkowski"] }),
  M("Felix Hausdorff",    1868, "poland",      "topology",                                  "none",                      "object", { pool: false, aliases: ["Hausdorff"] }),
  M("Bertrand Russell",   1872, "uk",          "logic",                                     "philosophy",                "paradox", { pool: false, aliases: ["Russell"] }),
  M("Henri Lebesgue",     1875, "france",      "analysis",                                  "none",                      "object", { pool: false, aliases: ["Lebesgue"] }),
  M("G. H. Hardy",        1877, "uk",          "number analysis",                           "none",                      "equation number", { aliases: ["Hardy", "Godfrey Harold Hardy"] }),
  M("Emmy Noether",       1882, "germany",     "algebra",                                   "physics",                   "theorem object", { aliases: ["Noether"] }),
  M("Srinivasa Ramanujan", 1887, "india",      "number analysis",                           "none",                      "number conjecture", { aliases: ["Ramanujan"] }),
  M("George Pólya",       1887, "hungary",     "combinatorics probability",                 "none",                      "theorem conjecture", { pool: false, aliases: ["Pólya", "Polya", "George Polya"] }),
  M("Stefan Banach",      1892, "poland",      "analysis topology",                         "none",                      "theorem object paradox", { aliases: ["Banach"] }),
  M("Frank Ramsey",       1903, "uk",          "combinatorics logic",                       "philosophy economics",      "theory theorem", { pool: false, aliases: ["Ramsey"] }),
  M("John von Neumann",   1903, "hungary",     "logic analysis applied computing",          "physics economics",         "theorem object", { aliases: ["von Neumann", "Neumann"] }),
  M("Andrey Kolmogorov",  1903, "russia",      "probability analysis logic topology",       "physics",                   "theorem equation object", { aliases: ["Kolmogorov"] }),
  M("Kurt Gödel",         1906, "czechia",     "logic",                                     "philosophy physics",        "theorem number", { aliases: ["Gödel", "Godel", "Kurt Godel"] }),
  M("André Weil",         1906, "france",      "number algebra geometry",                   "none",                      "conjecture", { pool: false, aliases: ["Weil", "Andre Weil"] }),
  M("Alan Turing",        1912, "uk",          "computing logic",                           "philosophy",                "object", { aliases: ["Turing"] }),
  M("Paul Erdős",         1913, "hungary",     "combinatorics number probability",          "none",                      "number conjecture theorem", { aliases: ["Erdős", "Erdos", "Paul Erdos"] }),
  M("Claude Shannon",     1916, "usa",         "probability computing applied",             "engineering",               "theorem unit", { pool: false, aliases: ["Shannon"] }),
  M("Benoit Mandelbrot",  1924, "poland",      "geometry analysis",                         "economics",                 "object", { aliases: ["Mandelbrot"] }),
  M("John Nash",          1928, "usa",         "applied geometry analysis",                 "economics",                 "theorem object", { aliases: ["Nash"] }),
  M("Alexander Grothendieck", 1928, "germany", "algebra geometry",                          "none",                      "theorem object", { aliases: ["Grothendieck"] }),
  M("Michael Atiyah",     1929, "uk",          "geometry topology",                         "physics",                   "theorem", { pool: false, aliases: ["Atiyah"] }),
  M("John Conway",        1937, "uk",          "combinatorics algebra number geometry",     "none",                      "object number", { aliases: ["Conway", "John Horton Conway"] }),
  M("William Thurston",   1946, "usa",         "geometry topology",                         "none",                      "conjecture", { pool: false, aliases: ["Thurston"] }),
  M("Andrew Wiles",       1953, "uk",          "number",                                    "none",                      "method", { aliases: ["Wiles"] }),
  M("Grigori Perelman",   1966, "russia",      "topology geometry",                         "none",                      "none", { aliases: ["Perelman", "Grigory Perelman", "Gregori Perelman", "Perlman", "Gregori Perlman"] }),
  M("Terence Tao",        1975, "australia",   "analysis number combinatorics probability", "none",                      "theorem", { aliases: ["Tao", "Terry Tao", "Terrence Tao"] }),
  M("Maryam Mirzakhani",  1977, "iran",        "geometry topology",                         "none",                      "equation", { aliases: ["Mirzakhani"] }),
];

export const POOL = MATHEMATICIANS.filter((m) => m.pool);
export const byName = (name) => MATHEMATICIANS.find((m) => m.name === name);

// "born" as a reader would write it
export const bornLabel = (m) => (m.approx ? "c. " : "") + (m.born < 0 ? `${-m.born} BC` : String(m.born));
export const continentOf = (country) => COUNTRIES[country][1];

// ---------------------------------------------------------------- comparing

export const BORN_NEAR = 20;

const overlaps = (a, b) => a.some((x) => b.includes(x));
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

// One attribute: { status: "hit" | "near" | "miss", arrow?: "up" | "down", shared?: [...] }
export function compareAttr(key, guess, answer) {
  if (key === "born") {
    const d = answer.born - guess.born;
    if (d === 0) return { status: "hit" };
    return { status: Math.abs(d) <= BORN_NEAR ? "near" : "miss", arrow: d > 0 ? "up" : "down" };
  }
  if (key === "country") {
    if (guess.country === answer.country) return { status: "hit" };
    const c = continentOf(guess.country);
    return c !== "unknown" && c === continentOf(answer.country) ? { status: "near", continent: c } : { status: "miss" };
  }
  const g = guess[key], a = answer[key];
  if (sameSet(g, a)) return { status: "hit" };
  if (overlaps(g, a)) return { status: "near", shared: g.filter((x) => a.includes(x)) };
  return { status: "miss" };
}

export function compare(guess, answer) {
  const out = {};
  for (const { key } of ATTRS) out[key] = compareAttr(key, guess, answer);
  return out;
}

// ---------------------------------------------------------------- search

// lowercase, accents dropped, so "godel" finds Gödel
const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const words = (s) => norm(s).split(/[\s-]+/);

// exact name, exact alias, name prefix, any word of the name (so "gauss" finds Carl Friedrich
// Gauss), alias prefix, then substring
export function search(query, exclude = new Set()) {
  const q = norm(query);
  if (!q) return [];
  const scored = [];
  for (const m of MATHEMATICIANS) {
    if (exclude.has(m.name)) continue;
    const n = norm(m.name);
    let s = -1;
    if (n === q) s = 0;
    else if (m.aliases.some((a) => norm(a) === q)) s = 1;
    else if (n.startsWith(q)) s = 2;
    else if (words(m.name).some((w) => w.startsWith(q))) s = 3;
    else if (m.aliases.some((a) => norm(a).startsWith(q))) s = 4;
    else if (n.includes(q)) s = 5;
    if (s >= 0) scored.push([s, m]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].name.length - b[1].name.length || a[1].name.localeCompare(b[1].name));
  return scored.map(([, m]) => m);
}

// family name for alphabetizing the full list ("Carl Friedrich Gauss" under G)
export const sortKey = (m) => norm(m.name.split(" ").filter((w) => !/^(de|von|van)$/i.test(w)).slice(-1)[0] || m.name);

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

// Walk through the pool in a fixed shuffled order, reshuffling each full cycle, so nobody
// repeats until everyone in the pool has had a day.
export function dailyAnswer(day) {
  const n = POOL.length, cycle = Math.floor((day - 1) / n), i = (((day - 1) % n) + n) % n;
  return shuffled(POOL, mulberry32(0x5f3759df ^ cycle))[i];
}

export function randomAnswer(rand = Math.random, not) {
  let m;
  do m = POOL[Math.floor(rand() * POOL.length)]; while (POOL.length > 1 && m === not);
  return m;
}

// ---------------------------------------------------------------- sharing

// Laid out like Permutle's: a title, the colors with no names, how it went, and a link. A round
// you gave up on never reaches an all-green row, and its last line says so.
const SQUARE = { hit: "🟩", near: "🟨", miss: "🟥" };
export function shareText({ label = "", guesses, answer, gaveUp = false, link = "" }) {
  const rows = guesses.map((g) => ATTRS.map(({ key }) => SQUARE[compareAttr(key, g, answer).status]).join(""));
  const n = guesses.length, count = `${n} ${n === 1 ? "guess" : "guesses"}`;
  const how = gaveUp ? `🏳️ gave up after ${count}` : count;
  return [label ? `Mathematiciandle ${label}` : "Mathematiciandle", ...rows, how, link].filter(Boolean).join("\n");
}
export const shareRows = (args) => shareText({ ...args, link: "" }).split("\n").slice(1, 1 + args.guesses.length).join("\n");
