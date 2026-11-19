// The lens: how a point's depth decides how big it looks.
//
// A camera here turns a point at sideways offset x and depth z (distance in front of the eye)
// into a screen position x / f(z), scaled so that things at the screen distance D keep their
// size: screen = x * f(D) / (h * f(z)), where h is the half-height of the screen. A normal
// camera has f(z) = z. Orthographic has f(z) = 1. Anything else is fair game.
//
// The "back plane" family comes from tracing rays from a plane at the eye (scaled by s) through
// the screen at distance D. A ray through screen point u starts at s*u and reaches u at depth D,
// so at depth z it is at u * (s + (1 - s) * z / D). Dividing by that is f(z) = s*D + (1 - s)*z,
// up to a constant that the normalization cancels. s = 0 is a pinhole, s = 1 is parallel rays,
// s > 1 makes rays meet in front at z = s*D / (s - 1).

/* ---------------- expression parsing ---------------- */

const FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, exp: Math.exp, abs: Math.abs,
  sqrt: Math.sqrt, log: Math.log, ln: Math.log, log2: Math.log2, log10: Math.log10,
  atan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  floor: Math.floor, ceil: Math.ceil, sign: Math.sign,
  min: Math.min, max: Math.max, pow: Math.pow,
};
const CONSTS = { pi: Math.PI, e: Math.E };

function tokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = src.slice(i).match(/^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i);
      if (!m) throw new Error(`bad number at "${src.slice(i)}"`);
      toks.push({ t: "num", v: parseFloat(m[0]) }); i += m[0].length; continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      const m = src.slice(i).match(/^[a-zA-Z_][a-zA-Z_0-9]*/);
      toks.push({ t: "id", v: m[0].toLowerCase() }); i += m[0].length; continue;
    }
    if (c === "*" && src[i + 1] === "*") { toks.push({ t: "op", v: "^" }); i += 2; continue; }
    if ("+-*/^(),".includes(c)) { toks.push({ t: "op", v: c }); i++; continue; }
    if (c === "√") { toks.push({ t: "id", v: "sqrt" }); i++; continue; }
    if (c === "·" || c === "×") { toks.push({ t: "op", v: "*" }); i++; continue; }
    if (c === "²") { toks.push({ t: "op", v: "^" }, { t: "num", v: 2 }); i++; continue; }
    throw new Error(`unexpected "${c}"`);
  }
  return toks;
}

// Grammar: sum := prod (('+'|'-') prod)*
//          prod := unary (('*'|'/'|implicit) unary)*
//          unary := '-' unary | pow
//          pow := atom ('^' unary)?
//          atom := num | id | id '(' args ')' | '(' sum ')'
export function parseExpr(src) {
  const toks = tokenize(src);
  if (!toks.length) throw new Error("empty");
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v) => peek() && peek().t === "op" && peek().v === v;
  const eat = (v) => { if (!isOp(v)) throw new Error(`expected "${v}"`); p++; };

  function sum() {
    let a = prod();
    while (isOp("+") || isOp("-")) {
      const op = toks[p++].v, b = prod(), l = a;
      a = op === "+" ? (z) => l(z) + b(z) : (z) => l(z) - b(z);
    }
    return a;
  }
  function startsAtom() {
    const t = peek();
    return t && (t.t === "num" || t.t === "id" || (t.t === "op" && t.v === "("));
  }
  function prod() {
    let a = unary();
    for (;;) {
      if (isOp("*") || isOp("/")) {
        const op = toks[p++].v, b = unary(), l = a;
        a = op === "*" ? (z) => l(z) * b(z) : (z) => l(z) / b(z);
      } else if (startsAtom()) { // implicit multiplication: 2z, 3(z+1), z sqrt(z)
        const b = pow(), l = a;
        a = (z) => l(z) * b(z);
      } else return a;
    }
  }
  function unary() {
    if (isOp("-")) { p++; const a = unary(); return (z) => -a(z); }
    if (isOp("+")) { p++; return unary(); }
    return pow();
  }
  function pow() {
    const a = atom();
    if (isOp("^")) { p++; const b = unary(); return (z) => Math.pow(a(z), b(z)); }
    return a;
  }
  function atom() {
    const t = toks[p++];
    if (!t) throw new Error("unexpected end");
    if (t.t === "num") return () => t.v;
    if (t.t === "id") {
      if (t.v === "z") return (z) => z;
      if (t.v in CONSTS) { const v = CONSTS[t.v]; return () => v; }
      if (t.v in FUNCS) {
        const fn = FUNCS[t.v];
        if (!isOp("(")) { const a = pow(); return (z) => fn(a(z)); } // √z, sqrt z
        eat("(");
        const args = [sum()];
        while (isOp(",")) { p++; args.push(sum()); }
        eat(")");
        if (args.length === 1) { const [a] = args; return (z) => fn(a(z)); }
        return (z) => fn(...args.map((g) => g(z)));
      }
      throw new Error(`unknown name "${t.v}"`);
    }
    if (t.v === "(") { const a = sum(); eat(")"); return a; }
    throw new Error(`unexpected "${t.v}"`);
  }
  const f = sum();
  if (p < toks.length) throw new Error(`unexpected "${toks[p].v}"`);
  return f;
}

/* ---------------- the back-plane family ---------------- */

export const backPlaneF = (s, D) => (z) => s * D + (1 - s) * z;

// Where the rays of a back plane of scale s meet (Infinity when they don't, in front).
export function convergenceDepth(s, D) {
  return s > 1 ? (s * D) / (s - 1) : Infinity;
}

// Readable text for the back-plane family's f(z), e.g. "8 + 0.6z".
export function backPlaneText(s, D) {
  const r = (v) => +v.toFixed(v === 0 ? 0 : Math.abs(v) < 1 ? 2 : 1);
  if (Math.abs(s) < 1e-4) return "z";
  if (Math.abs(1 - s) < 1e-4) return "1";
  const a = r(s * D), b = r(1 - s);
  const zTerm = b === 1 ? "z" : b === -1 ? "-z" : `${b}z`;
  return b < 0 ? `${a} - ${zTerm.replace("-", "")}` : `${a} + ${zTerm}`;
}

/* ---------------- sampling a lens into a lookup table ---------------- */

// Depths are sampled on an asinh scale so that the table is dense near the eye (where 1/z and
// friends change fastest) and still reaches far away and a little behind the eye.
export const LUT = {
  N: 2048,
  C: 0.25,          // asinh scale: spacing is about C * step near z = 0
  zMin: -200,       // behind the eye (only the sign matters there: negative means clipped)
  zMax: 6000,
};
LUT.a0 = Math.asinh(LUT.zMin / LUT.C);
LUT.a1 = Math.asinh(LUT.zMax / LUT.C);

export const lutDepth = (i) =>
  LUT.C * Math.sinh(LUT.a0 + (LUT.a1 - LUT.a0) * (i / (LUT.N - 1)));

// Normalized lens value g(z) = f(z) / f(D). Things at depth D appear at their screen size, and
// a non-positive or non-finite g means the point is not seen (rays never reach it).
export function normalizedLens(f, D) {
  const fD = f(D);
  if (!(fD > 0) || !isFinite(fD)) return null;
  return (z) => {
    const v = f(z) / fD;
    return isFinite(v) ? v : -1;
  };
}

// Fill `out` (Float32Array of 2*N, interleaved x then y) with the normalized lens values.
//
// Behind the near plane nothing is drawn, but triangles that cross it still need sensible
// corner values for the GPU to clip them. A curved lens can do anything back there (1/z flips
// from +infinity to -infinity at the eye), which smears slivers across the screen. So behind
// `near` the lens continues as the straight line it was heading along at `near`. For the
// back-plane family that's the lens itself, so those views stay exact.
export function sampleLens(gx, gy, out = new Float32Array(LUT.N * 2), near = 0.05) {
  const ext = (g) => {
    const a = g(near), b = g(2 * near), slope = (b - a) / near;
    return (z) => (z < near ? a + (z - near) * slope : g(z));
  };
  const ex = ext(gx), ey = ext(gy);
  for (let i = 0; i < LUT.N; i++) {
    const z = lutDepth(i);
    out[2 * i] = ex(z);
    out[2 * i + 1] = ey(z);
  }
  return out;
}

// Validate a typed f(z) for use as a lens at screen distance D. Returns { f } or { error }.
export function compileLens(src, D) {
  let f;
  try { f = parseExpr(src); } catch (e) { return { error: e.message }; }
  const fD = f(D);
  if (!isFinite(fD)) return { error: `f(${fmt(D)}) isn't a number` };
  if (fD <= 0) return { error: `f has to be positive at the screen (${fmt(D)} m)` };
  return { f };
}
const fmt = (v) => +v.toFixed(1);

/* ---------------- the presets ---------------- */

export const PRESETS = [
  { id: "perspective", label: "perspective", src: "z", s: 0,
    tip: "A normal camera: things shrink in proportion to their distance." },
  { id: "orthographic", label: "orthographic", src: "1", s: 1,
    tip: "Parallel rays: things stay the same size however far away they are." },
  { id: "reverse", label: "reverse", src: "1/(z + 5)",
    tip: "Multiply by distance instead of dividing: far things look bigger. The rays start on a plane bigger than the screen and bend in toward each other, meeting only infinitely far away. (1/z alone would need an infinitely big plane.)" },
  { id: "log", label: "log", src: "log(1 + z)",
    tip: "Shrinks with the log of distance: gentler than a normal camera." },
  { id: "sqrt", label: "√z", src: "sqrt(z)",
    tip: "Shrinks with the square root of distance: halfway between perspective and orthographic." },
  { id: "square", label: "z²", src: "z^2",
    tip: "Shrinks with distance squared: perspective, exaggerated." },
];

/* ---------------- recognizing straight-ray lenses ---------------- */

// If f is a straight line a + b*z (checked at a few depths), it's a back-plane lens: dividing by
// a + b*z is the same as dividing by s*D + (1 - s)*z with s = f(0) / f(D). Returns s, or null.
export function linearS(f, D) {
  const zs = [0, 1, 3.7, 25, D];
  const v = zs.map(f);
  if (!v.every(Number.isFinite) || !(v[4] > 0)) return null;
  const b = v[1] - v[0];
  for (let i = 2; i < zs.length; i++) {
    const want = v[0] + b * zs[i];
    if (Math.abs(v[i] - want) > 1e-9 * Math.max(1, Math.abs(want))) return null;
  }
  const s = v[0] / v[4];
  return Math.abs(s) < 1e-12 ? 0 : s;
}

/* ---------------- the eye plane ---------------- */

// The view starts just in front of the eye; nothing behind you is ever drawn.
export const NEAR = 0.05;

// How tall the back plane is, as a multiple of the screen: the up-and-down lens at the eye.
export function planeRatio(f, D) {
  const g = normalizedLens(f, D);
  if (!g) return 0;
  const g0 = g(NEAR);
  return g0 > 0 && isFinite(g0) ? g0 : 0;
}
// The screen's half-height for a lens: the one asked for, unless that would make the back plane
// (centered on the eye, `ratio` times the screen) reach lower than `clearH` below the eye, in
// which case the screen shrinks until the plane just clears. Mike: no lens's back plane may cut
// into the ground or the rails.
export function fitScreenH(hAsked, ratio, clearH) {
  return ratio > 0 && ratio * hAsked > clearH ? clearH / ratio : hAsked;
}

/* ---------------- where a point lands on the screen ---------------- */

// The projection the vertex shader does (main.mjs lensProject mirrors this exactly): a point at
// view-space (x, y), depth z, lands at x / (halfX * gx(z)), y / (halfY * gy(z)) in -1..1 screen
// units. Nothing is added to y, so every lens is centered on the eye: a point above eye height
// lands above the middle of the screen in every lens, and one below lands below.
export function screenPos(x, y, gx, gy, halfX, halfY) {
  return { sx: x / (halfX * gx), sy: y / (halfY * gy) };
}
