/* expr.js — the little expression language shared by the data panel and the steps.
 *
 * Values are numbers, strings, arrays (of numbers) and opaque objects (shapes). Arithmetic on
 * arrays works element by element, broadcasting a scalar across an array, so `power * sunHours`
 * is an array when sunHours is. Reductions (sum, max, count, …) turn an array into a number.
 * Angles are in degrees everywhere: sin/cos take them and atan2 and angle() give them back.
 */

export class ExprError extends Error {}

/* ---------------- tokens ---------------- */

const OPS = ["<=", ">=", "==", "!=", "&&", "||", "+", "-", "*", "/", "%", "^", "(", ")", "[", "]", ",", ".", "<", ">", "?", ":", "!"];

export function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] || ""))) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
      out.push({ t: "num", v: parseFloat(m[0]), s: i, e: i + m[0].length });
      i += m[0].length; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
      out.push({ t: "id", v: m[0], s: i, e: i + m[0].length });
      i += m[0].length; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1, v = "";
      while (j < src.length && src[j] !== c) { v += src[j]; j++; }
      if (j >= src.length) throw new ExprError("unclosed string");
      out.push({ t: "str", v, s: i, e: j + 1 });
      i = j + 1; continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new ExprError(`unexpected "${c}"`);
    out.push({ t: "op", v: op, s: i, e: i + op.length });
    i += op.length;
  }
  return out;
}

/* ---------------- parser (precedence climbing) ---------------- */

const BIN = {
  "||": 1, "&&": 2, "==": 3, "!=": 3, "<": 4, ">": 4, "<=": 4, ">=": 4,
  "+": 5, "-": 5, "*": 6, "/": 6, "%": 6, "^": 8,
};

export function parse(src) {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v) => toks[p] && toks[p].t === "op" && toks[p].v === v;
  const expect = (v) => { if (!isOp(v)) throw new ExprError(`expected "${v}"`); p++; };

  function primary() {
    const t = toks[p++];
    if (!t) throw new ExprError("unexpected end");
    if (t.t === "num") return { k: "num", v: t.v };
    if (t.t === "str") return { k: "str", v: t.v };
    if (t.t === "id") {
      if (isOp("(")) {
        p++;
        const args = [];
        if (!isOp(")")) { do { args.push(expr(0)); } while (isOp(",") && ++p); }
        expect(")");
        return { k: "call", f: t.v, args };
      }
      return { k: "id", v: t.v };
    }
    if (t.v === "(") { const e = expr(0); expect(")"); return e; }
    if (t.v === "[") {
      const items = [];
      if (!isOp("]")) { do { items.push(expr(0)); } while (isOp(",") && ++p); }
      expect("]");
      return { k: "arr", items };
    }
    if (t.v === "-") return { k: "neg", e: unary() };
    if (t.v === "+") return unary();
    if (t.v === "!") return { k: "not", e: unary() };
    throw new ExprError(`unexpected "${t.v}"`);
  }
  function unary() {
    let e = primary();
    for (;;) {
      if (isOp("[")) { p++; const ix = expr(0); expect("]"); e = { k: "index", e, ix }; }
      else if (isOp(".")) {
        p++;
        const t = toks[p++];
        if (!t || t.t !== "id") throw new ExprError("expected a name after \".\"");
        e = { k: "member", e, name: t.v };       // a sub-picture's measurement, or a.width = width(a)
      } else return e;
    }
  }
  function expr(min) {
    let lhs = unary();
    for (;;) {
      const t = peek();
      if (t && t.t === "op" && t.v === "?" && min === 0) {
        p++;
        const a = expr(0); expect(":"); const b = expr(0);
        lhs = { k: "if", c: lhs, a, b };
        continue;
      }
      const prec = t && t.t === "op" ? BIN[t.v] : undefined;
      if (prec === undefined || prec < min) return lhs;
      p++;
      // ^ is right-associative, everything else left
      const rhs = expr(t.v === "^" ? prec : prec + 1);
      lhs = { k: "bin", op: t.v, a: lhs, b: rhs };
    }
  }

  if (!toks.length) throw new ExprError("empty");
  const e = expr(0);
  if (p < toks.length) throw new ExprError(`unexpected "${toks[p].v}"`);
  return e;
}

/* ---------------- evaluation ---------------- */

const isArr = Array.isArray;

function lift2(a, b, f) {
  if (isArr(a) && isArr(b)) {
    const n = Math.min(a.length, b.length);
    const out = new Array(n);
    for (let i = 0; i < n; i++) out[i] = f(a[i], b[i]);
    return out;
  }
  if (isArr(a)) return a.map((x) => f(x, b));
  if (isArr(b)) return b.map((y) => f(a, y));
  return f(a, b);
}
const lift1 = (f) => (x) => isArr(x) ? x.map(f) : f(x);
// any number of arguments, element by element over the arrays among them
const liftN = (f) => (...xs) => {
  const arrs = xs.filter(isArr);
  if (!arrs.length) return f(...xs);
  const n = Math.min(...arrs.map((a) => a.length));
  return Array.from({ length: n }, (_, i) => f(...xs.map((x) => isArr(x) ? x[i] : x)));
};

const D = Math.PI / 180;
const fmt = (x, d = 2) => {
  if (typeof x !== "number") return String(x);
  if (!isFinite(x)) return String(x);
  return String(+x.toFixed(d));
};

function needArr(name, a) {
  if (!isArr(a)) throw new ExprError(`${name}() needs an array`);
  return a;
}

// Functions that see the shapes (angle, width, …) are passed in by the engine as env.fn.
export const FUNCS = {
  sum: (a) => needArr("sum", a).reduce((s, x) => s + x, 0),
  mean: (a) => { needArr("mean", a); return a.length ? FUNCS.sum(a) / a.length : 0; },
  count: (a) => isArr(a) ? a.length : 1,
  min: (...xs) => xs.length === 1 && isArr(xs[0]) ? Math.min(...xs[0]) : xs.reduce((m, x) => lift2(m, x, Math.min)),
  max: (...xs) => xs.length === 1 && isArr(xs[0]) ? Math.max(...xs[0]) : xs.reduce((m, x) => lift2(m, x, Math.max)),
  cumsum: (a) => { let s = 0; return needArr("cumsum", a).map((x) => (s += x)); },
  reverse: (a) => [...needArr("reverse", a)].reverse(),
  sort: (a) => [...needArr("sort", a)].sort((x, y) => x - y),
  range: (n) => Array.from({ length: Math.max(0, Math.floor(n)) }, (_, i) => i),
  first: (a) => needArr("first", a)[0],
  last: (a) => needArr("last", a)[a.length - 1],
  abs: lift1(Math.abs), sqrt: lift1(Math.sqrt), floor: lift1(Math.floor), ceil: lift1(Math.ceil),
  round: (x, d = 0) => lift2(x, d, (v, k) => Math.round(v * 10 ** k) / 10 ** k),
  log: lift1(Math.log), log10: lift1(Math.log10), exp: lift1(Math.exp),
  sin: lift1((x) => Math.sin(x * D)), cos: lift1((x) => Math.cos(x * D)), tan: lift1((x) => Math.tan(x * D)),
  atan2: (y, x) => lift2(y, x, (a, b) => Math.atan2(a, b) / D),
  pow: (a, b) => lift2(a, b, Math.pow),
  clamp: liftN((x, lo, hi) => Math.min(Math.max(x, lo), hi)),
  lerp: liftN((a, b, t) => a + (b - a) * t),
  fmt: (x, d = 2) => isArr(x) ? x.map((v) => fmt(v, d)) : fmt(x, d),
  hsl: liftN((h, s = 70, l = 60) => `hsl(${h} ${s}% ${l}%)`),
  rgb: liftN((r, g, b) => `rgb(${r} ${g} ${b})`),
};

export const CONSTS = { pi: Math.PI, e: Math.E, true: 1, false: 0 };

const BINF = {
  "+": (a, b) => (typeof a === "string" || typeof b === "string") ? String(a) + String(b) : a + b,
  "-": (a, b) => a - b, "*": (a, b) => a * b, "/": (a, b) => a / b,
  "%": (a, b) => ((a % b) + b) % b, "^": (a, b) => a ** b,
  "<": (a, b) => +(a < b), ">": (a, b) => +(a > b), "<=": (a, b) => +(a <= b), ">=": (a, b) => +(a >= b),
  "==": (a, b) => +(a === b), "!=": (a, b) => +(a !== b),
  "&&": (a, b) => +(a && b), "||": (a, b) => +(a || b),
};

/** env: { lookup(name) -> value | undefined, fn: { name: (...args) => value } } */
export function evaluate(ast, env) {
  switch (ast.k) {
    case "num": case "str": return ast.v;
    case "id": {
      const v = env.lookup(ast.v);
      if (v !== undefined) return v;
      if (ast.v in CONSTS) return CONSTS[ast.v];
      throw new ExprError(`unknown "${ast.v}"`);
    }
    case "arr": return ast.items.map((e) => evaluate(e, env));
    case "neg": return lift1((x) => -x)(evaluate(ast.e, env));
    case "not": return lift1((x) => +!x)(evaluate(ast.e, env));
    case "index": {
      const a = evaluate(ast.e, env), i = evaluate(ast.ix, env);
      if (!isArr(a)) throw new ExprError("only arrays can be indexed");
      return lift2(i, 0, (k) => a[Math.floor(k)]);
    }
    case "if": {
      const c = evaluate(ast.c, env);
      return isArr(c) ? liftN((k, x, y) => k ? x : y)(c, evaluate(ast.a, env), evaluate(ast.b, env))
        : c ? evaluate(ast.a, env) : evaluate(ast.b, env);
    }
    case "bin": return lift2(evaluate(ast.a, env), evaluate(ast.b, env), BINF[ast.op]);
    case "member": {
      const o = evaluate(ast.e, env);
      if (o && typeof o === "object" && !isArr(o) && o.measures && ast.name in o.measures) return o.measures[ast.name];
      const f = env.fn?.[ast.name] || FUNCS[ast.name];
      if (!f) throw new ExprError(`no "${ast.name}" on that`);
      return f(o);
    }
    case "call": {
      const f = env.fn?.[ast.f] || FUNCS[ast.f];
      if (!f) throw new ExprError(`no function "${ast.f}"`);
      return f(...ast.args.map((e) => evaluate(e, env)));
    }
  }
  throw new ExprError("bad expression");
}

const cache = new Map();
export function compile(src) {
  src = String(src);
  let c = cache.get(src);
  if (!c) {
    try { c = { ast: parse(src) }; } catch (e) { c = { err: e.message }; }
    cache.set(src, c);
  }
  return c;
}

export function evalSrc(src, env) {
  const c = compile(src);
  if (c.err) throw new ExprError(c.err);
  return evaluate(c.ast, env);
}

/** Rewrite every mention of the name `from` in an expression to `to` (for renames). */
export function renameIdent(src, from, to) {
  let toks;
  try { toks = tokenize(String(src)); } catch { return src; }
  let out = String(src);
  for (let i = toks.length - 1; i >= 0; i--) {
    const t = toks[i];
    // `.width` after a dot is a function name, not a variable
    if (t.t === "id" && t.v === from && !(i > 0 && toks[i - 1].t === "op" && toks[i - 1].v === ".")) {
      out = out.slice(0, t.s) + to + out.slice(t.e);
    }
  }
  return out;
}

export const isPlainNumber = (src) => /^\s*-?(\d+\.?\d*|\.\d+)\s*$/.test(String(src));
export { fmt };
