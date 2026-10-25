/* engine.js — a picture is data plus a procedure.
 *
 * The data is a list of variables, each an expression, worked out declaratively (in dependency
 * order, like a spreadsheet). The procedure is a list of steps, run in order: draw a shape, move,
 * scale or rotate one, loop over some steps, or do some only if a condition holds. Every point a
 * step uses is a reference: to a magnet of another shape ("guide's top-left"), to a point along
 * one of its edges, to where two edges cross, or to a free spot. Snapping while drawing is what
 * records a reference, so relationships survive when the data moves the shapes they point at.
 *
 * A project has several pictures. A picture can be drawn inside another, like a shape: its
 * variables become parameters the outer picture can override, and its measurements (named
 * expressions worked out after it is drawn) can be read from outside as `inner.name`. A picture
 * can draw itself, down to a fixed depth.
 *
 * Running the procedure leaves a trace, one event per step executed (a step in a loop runs once
 * per iteration). The editor can stop the run at any event to show the picture as it was then.
 */

import { evalSrc, ExprError, fmt } from "./expr.js";

export const W = 640, H = 400;
const MAX_ITER = 1000, MAX_EVENTS = 20000, MAX_DEPTH = 7, MAX_SHAPES = 40000;

/* ---------------- data ---------------- */

/** overrides: Map of name -> value, used in place of those variables' own expressions. */
export function dataScope(vars, overrides = new Map()) {
  const byName = new Map(vars.map((v) => [v.name, v]));
  const vals = new Map(), errs = new Map(), busy = new Set();
  for (const [k, v] of overrides) if (byName.has(k)) vals.set(k, v);
  const get = (name) => {
    if (vals.has(name)) return vals.get(name);
    const v = byName.get(name);
    if (!v) return undefined;
    if (errs.has(name)) throw new ExprError(`${name} has an error`);
    if (busy.has(name)) throw new ExprError(`${name} depends on itself`);
    busy.add(name);
    try {
      const x = evalSrc(v.expr, { lookup: get });
      vals.set(name, x);
      return x;
    } catch (e) {
      errs.set(name, e.message);
      throw e;
    } finally { busy.delete(name); }
  };
  for (const v of vars) { try { get(v.name); } catch { /* recorded in errs */ } }
  return { get, vals, errs };
}

/* ---------------- vectors ---------------- */

const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const rot = (v, deg) => {
  const t = deg * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c];
};
export const V = { add, sub, mul, dot, rot };

/* ---------------- shapes ----------------
 * line   { a, b }
 * rect   { o, ex, ey, w, h }   o is the top-left; ex/ey its own axes, which turn with it
 * pic    { o, ex, ey, w, h, sub, measures }   a picture drawn into a box, geometrically a rect
 * circle { c, ex, ey, rx, ry }
 * text   { a, ex, ey, size }
 * path   { pts, arcs, closed }   arcs[k], if set, bends the segment into pts[k] round an ellipse
 */

const isBox = (s) => s.kind === "rect" || s.kind === "pic";

export const MAGNET_NAMES = {
  a: "start", b: "end", mid: "middle",
  tl: "top-left", t: "top", tr: "top-right", r: "right", br: "bottom-right",
  b_: "bottom", bl: "bottom-left", l: "left", c: "center",
};
export const magnetName = (m) => MAGNET_NAMES[m] || (/^p\d+$/.test(m) ? `point ${m.slice(1)}` : m);

export function magnets(s) {
  switch (s.kind) {
    case "line": return { a: s.a, b: s.b, mid: mul(add(s.a, s.b), 0.5) };
    case "rect": case "pic": {
      const u = mul(s.ex, s.w), v = mul(s.ey, s.h), o = s.o;
      const P = (i, j) => add(o, add(mul(u, i), mul(v, j)));
      return { tl: P(0, 0), t: P(.5, 0), tr: P(1, 0), r: P(1, .5), br: P(1, 1), b_: P(.5, 1), bl: P(0, 1), l: P(0, .5), c: P(.5, .5) };
    }
    case "circle": {
      const u = mul(s.ex, s.rx), v = mul(s.ey, s.ry);
      return { c: s.c, t: sub(s.c, v), r: add(s.c, u), b_: add(s.c, v), l: sub(s.c, u) };
    }
    case "text": return { a: s.a };
    case "path": {
      const M = {};
      s.pts.forEach((p, i) => { M["p" + (i + 1)] = p; });
      return M;
    }
  }
  return {};
}

// The straight edges a point can be snapped along, by name, as [from, to] points.
export function segments(s) {
  const M = magnets(s);
  switch (s.kind) {
    case "line": return { e: [s.a, s.b] };
    case "rect": case "pic": return { top: [M.tl, M.tr], right: [M.tr, M.br], bottom: [M.bl, M.br], left: [M.tl, M.bl] };
    case "path": {
      const out = {}, n = s.pts.length;
      for (let i = 1; i < n + (s.closed ? 1 : 0); i++) {
        if (s.arcs[i % n]) continue;
        out["s" + i] = [s.pts[i - 1], s.pts[i % n]];
      }
      return out;
    }
  }
  return {};
}

export const edgeName = (e) => e === "e" ? "" : e === "rim" ? "rim" : /^s\d+$/.test(e) ? `segment ${e.slice(1)}` : `${e} edge`;

export function edgeList(s) {
  if (s.kind === "circle") return ["rim"];
  return Object.keys(segments(s));
}

const ellipseAt = (f, t) => {
  const a = t * 2 * Math.PI;
  return add(f.c, add(mul(f.ex, f.rx * Math.cos(a)), mul(f.ey, f.ry * Math.sin(a))));
};

export function edgePoint(s, e, t) {
  if (s.kind === "circle") return ellipseAt(s, t);
  const seg = segments(s)[e];
  if (!seg) throw new ExprError(`${s.name} has no ${edgeName(e)}`);
  return add(seg[0], mul(sub(seg[1], seg[0]), t));
}

/** The point on an edge nearest p, as { t, p, d }. */
export function nearestOnEdge(s, e, p) {
  if (s.kind === "circle") {
    // in the circle's own frame, the angle to p, then back out
    const d = sub(p, s.c);
    const a = Math.atan2(dot(d, s.ey) / (s.ry || 1e-9), dot(d, s.ex) / (s.rx || 1e-9));
    const t = ((a / (2 * Math.PI)) % 1 + 1) % 1;
    const q = ellipseAt(s, t);
    return { t, p: q, d: Math.hypot(...sub(q, p)) };
  }
  const [a, b] = segments(s)[e], ab = sub(b, a);
  const L = dot(ab, ab);
  const t = L < 1e-9 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / L));
  const q = add(a, mul(ab, t));
  return { t, p: q, d: Math.hypot(...sub(q, p)) };
}

/** Where two segments cross, or null. */
export function intersect([a, b], [c, d]) {
  const r = sub(b, a), s = sub(d, c), den = cross(r, s);
  if (Math.abs(den) < 1e-9) return null;
  const t = cross(sub(c, a), s) / den, u = cross(sub(c, a), r) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return add(a, mul(r, t));
}

export function center(s) {
  if (s.kind === "path") return mul(s.pts.reduce(add, [0, 0]), 1 / (s.pts.length || 1));
  const M = magnets(s);
  return M.c || M.mid || M.a;
}

// Every point a transform has to carry, as [object, key] pairs, plus the frames that turn.
function pointsOf(s) {
  switch (s.kind) {
    case "line": return [[s, "a"], [s, "b"]];
    case "rect": case "pic": return [[s, "o"]];
    case "circle": return [[s, "c"]];
    case "text": return [[s, "a"]];
    case "path": return [...s.pts.map((_, i) => [s.pts, i]), ...s.arcs.filter(Boolean).map((f) => [f, "c"])];
  }
  return [];
}
const framesOf = (s) => s.kind === "path" ? s.arcs.filter(Boolean) : s.kind === "line" ? [] : [s];

function translate(s, d) {
  for (const [o, k] of pointsOf(s)) o[k] = add(o[k], d);
}

// Scale about p. Rects, pictures and circles scale along their own axes (sx along ex, sy along
// ey), so a turned bar still grows along its length. Lines, paths and text scale uniformly by sx.
function scaleAbout(s, p, sx, sy) {
  if (isBox(s) || s.kind === "circle") {
    const key = isBox(s) ? "o" : "c";
    const d = sub(s[key], p);
    s[key] = add(p, add(mul(s.ex, dot(d, s.ex) * sx), mul(s.ey, dot(d, s.ey) * sy)));
    if (isBox(s)) { s.w *= sx; s.h *= sy; } else { s.rx *= sx; s.ry *= sy; }
    return;
  }
  for (const [o, k] of pointsOf(s)) o[k] = add(p, mul(sub(o[k], p), sx));
  if (s.kind === "text") s.size *= Math.abs(sx);
  for (const f of s.kind === "path" ? s.arcs.filter(Boolean) : []) { f.rx *= sx; f.ry *= sx; }
}

function rotateAbout(s, p, deg) {
  for (const [o, k] of pointsOf(s)) o[k] = add(p, rot(sub(o[k], p), deg));
  for (const f of framesOf(s)) { f.ex = rot(f.ex, deg); f.ey = rot(f.ey, deg); }
}

/* ---------------- props ---------------- */

export const DEFAULT_PROPS = {
  line:    { stroke: "#e4e8f0", strokeWidth: "2", opacity: "1", arrow: false },
  rect:    { fill: "#7c8cf8", stroke: "none", strokeWidth: "1", opacity: "1" },
  circle:  { fill: "#7c8cf8", stroke: "none", strokeWidth: "1", opacity: "1" },
  path:    { fill: "none", stroke: "#e4e8f0", strokeWidth: "2", opacity: "1", arrow: false },
  text:    { text: "label", fill: "#e4e8f0", size: "14", opacity: "1", align: "center", baseline: "bottom" },
  picture: { opacity: "1" },
};

/* ---------------- steps ---------------- */

export const isBlock = (s) => s.type === "loop" || s.type === "if";

export function walk(steps, f, parent = null) {
  steps.forEach((s, i) => {
    f(s, steps, i, parent);
    if (isBlock(s)) walk(s.body, f, s);
  });
}

export function findStep(pic, id) {
  let hit = null;
  walk(pic.steps, (s, list, index, parent) => { if (s.id === id) hit = { step: s, list, index, parent }; });
  return hit;
}

/* ---------------- running ---------------- */

class Stop {}

/**
 * Run one picture of a project. Options:
 *   stopAt     stop once this trace event has run (to show the picture partway)
 *   overrides  Map of variable name -> value, from an outer picture
 *   depth      how deep in pictures-inside-pictures this is
 */
export function run(project, pic, { stopAt = Infinity, overrides, depth = 0, budget = { n: MAX_SHAPES } } = {}) {
  const data = dataScope(pic.vars, overrides);
  const shapes = [], byName = new Map(), trace = [], loops = [];
  let seq = 0;

  const latest = (name, back = 0) => {
    const list = byName.get(name);
    return list ? list[list.length - 1 - back] : undefined;
  };
  const lookup = (name) => {
    const d = data.get(name);
    if (d !== undefined) return d;
    if (loops.length) {
      if (name === "i") return loops[loops.length - 1].i;
      if (name === "n") return loops[loops.length - 1].n;
    }
    return latest(name);
  };
  const shape = (fn, s) => {
    if (!s || !s.kind) throw new ExprError(`${fn}() needs a shape`);
    return s;
  };
  const fn = {
    angle: (s) => { shape("angle", s); const v = s.kind === "line" ? sub(s.b, s.a) : s.kind === "path" ? sub(s.pts[s.pts.length - 1], s.pts[0]) : s.ex; return Math.atan2(v[1], v[0]) * 180 / Math.PI; },
    length: (s) => {
      shape("length", s);
      if (s.kind === "line") return Math.hypot(...sub(s.b, s.a));
      if (s.kind === "path") return s.pts.slice(1).reduce((L, p, i) => L + Math.hypot(...sub(p, s.pts[i])), 0);
      return isBox(s) ? Math.abs(s.w) : s.kind === "circle" ? 2 * Math.abs(s.rx) : 0;
    },
    width: (s) => { shape("width", s); return isBox(s) ? Math.abs(s.w) : s.kind === "circle" ? 2 * Math.abs(s.rx) : s.kind === "line" ? Math.abs(s.b[0] - s.a[0]) : 0; },
    height: (s) => { shape("height", s); return isBox(s) ? Math.abs(s.h) : s.kind === "circle" ? 2 * Math.abs(s.ry) : s.kind === "line" ? Math.abs(s.b[1] - s.a[1]) : 0; },
    x: (s) => center(shape("x", s))[0],
    y: (s) => center(shape("y", s))[1],
    dist: (s, u) => Math.hypot(...sub(center(shape("dist", s)), center(shape("dist", u)))),
  };
  const env = { lookup, fn };

  const value = (src) => {
    let v = evalSrc(src, env);
    if (Array.isArray(v)) {
      // inside a loop an array means its element for this iteration
      if (!loops.length) throw new ExprError("an array outside a loop: use a reduction like max()");
      v = v[loops[loops.length - 1].i];
      if (v === undefined) throw new ExprError("the array is shorter than the loop");
    }
    return v;
  };
  const num = (src) => {
    const v = value(src);
    if (typeof v !== "number" || !isFinite(v)) throw new ExprError(`${fmt(v)} is not a number`);
    return v;
  };
  const color = (v) => {
    if (typeof v !== "string") return v;
    const t = v.trim();
    if (t.startsWith("=")) return String(value(t.slice(1)));
    return t;
  };
  const template = (src) => String(src).replace(/\{([^}]*)\}/g, (_, e) => {
    const v = value(e);
    return typeof v === "number" ? fmt(v) : String(v);
  });

  const find = (ref) => {
    const s = latest(ref.shape, ref.back || 0);
    if (!s) throw new ExprError(ref.back ? `no ${ref.back === 1 ? "" : ref.back + " back "}previous ${ref.shape} yet` : `no ${ref.shape} yet`);
    return s;
  };
  const resolve = (ref, base) => {
    switch (ref.k) {
      case "abs": return [num(ref.x), num(ref.y)];
      case "rel": return add(base, [num(ref.dx), num(ref.dy)]);
      case "mag": {
        const p = magnets(find(ref))[ref.m];
        if (!p) throw new ExprError(`${ref.shape} has no ${magnetName(ref.m)}`);
        return p;
      }
      case "edge": return edgePoint(find(ref), ref.e, num(ref.t));
      case "x": {
        const s1 = segments(find(ref.a))[ref.a.e], s2 = segments(find(ref.b))[ref.b.e];
        if (!s1 || !s2) throw new ExprError("an edge it crossed is gone");
        const p = intersect(s1, s2);
        if (!p) throw new ExprError(`${ref.a.shape} and ${ref.b.shape} don't cross any more`);
        return p;
      }
    }
    throw new ExprError("bad point");
  };

  const props = (step) => {
    const P = { ...DEFAULT_PROPS[step.type], ...step.props };
    const out = { guide: !!P.guide, arrow: !!P.arrow, align: P.align, baseline: P.baseline };
    if ("fill" in P) out.fill = color(P.fill);
    if ("stroke" in P) out.stroke = color(P.stroke);
    if ("strokeWidth" in P) out.strokeWidth = num(P.strokeWidth);
    out.opacity = num(P.opacity ?? "1");
    if ("text" in P) out.text = template(P.text);
    if ("size" in P) out.size = num(P.size);
    return out;
  };

  const box = (a, b) => ({ o: [Math.min(a[0], b[0]), Math.min(a[1], b[1])], ex: [1, 0], ey: [0, 1], w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) });

  const make = (step) => {
    let s;
    if (step.type === "line") {
      const a = resolve(step.a), b = resolve(step.b, a);
      s = { kind: "line", a, b };
    } else if (step.type === "rect") {
      const a = resolve(step.a);
      s = { kind: "rect", ...box(a, resolve(step.b, a)) };
    } else if (step.type === "circle") {
      const c = resolve(step.c), p = resolve(step.p, c), r = Math.hypot(...sub(p, c));
      s = { kind: "circle", c, ex: [1, 0], ey: [0, 1], rx: r, ry: r };
    } else if (step.type === "text") {
      s = { kind: "text", a: resolve(step.a), ex: [1, 0], ey: [0, 1] };
    } else if (step.type === "path") {
      // Where a point sits on a circle's rim, as [circle, t], or null. A circle's four compass
      // magnets count as on its rim too.
      const COMPASS = { r: 0, b_: 0.25, l: 0.5, t: 0.75 };
      const onRim = (ref) => {
        if (ref.k === "edge" && ref.e === "rim") return [find(ref), num(ref.t)];
        if (ref.k === "mag" && ref.m in COMPASS) { const c = find(ref); if (c.kind === "circle") return [c, COMPASS[ref.m]]; }
        return null;
      };
      // two points in a row on the same circle's rim join with an arc of it
      const arcBetween = (r0, r1) => {
        const a = r0 && onRim(r0), b = a && onRim(r1);
        if (!a || !b || a[0] !== b[0]) return null;
        const c = a[0];
        let t0 = a[1], t1 = b[1];
        if (r0.k === "mag" || r1.k === "mag") {
          // between compass points: the short way round
          t1 = t0 + ((((t1 - t0) % 1) + 1.5) % 1 - 0.5);
        } else if (t1 <= t0) t1 += Math.ceil(t0 - t1 + 1e-12);  // fractions along the rim: forwards
        return { c: c.c, ex: c.ex, ey: c.ey, rx: c.rx, ry: c.ry, t0, t1 };
      };
      const pts = [], arcs = [];
      step.pts.forEach((ref, k) => {
        pts.push(resolve(ref, pts[k - 1]));
        arcs.push(k ? arcBetween(step.pts[k - 1], ref) : null);
      });
      if (step.closed && step.pts.length > 2) arcs[0] = arcBetween(step.pts[step.pts.length - 1], step.pts[0]);
      s = { kind: "path", pts, arcs, closed: !!step.closed };
    } else if (step.type === "picture") {
      const inner = project.pictures.find((p) => p.id === step.pic);
      if (!inner) throw new ExprError("that picture was deleted");
      const a = resolve(step.a);
      s = { kind: "pic", ...box(a, resolve(step.b, a)), picId: inner.id };
      // parameters: an array the inner picture expects whole is passed whole, even in a loop
      const defaults = dataScope(inner.vars).vals;
      const ov = new Map();
      for (const [k, src] of Object.entries(step.overrides || {})) {
        if (!String(src).trim()) continue;
        ov.set(k, Array.isArray(defaults.get(k)) ? evalSrc(src, env) : value(src));
      }
      if (depth < MAX_DEPTH && budget.n > 0) {
        const r = run(project, inner, { overrides: ov, depth: depth + 1, budget });
        s.sub = r.shapes; s.measures = r.measures;
      } else { s.sub = []; s.measures = {}; }
    }
    s.props = props(step);
    if (s.kind === "text") s.size = s.props.size;
    s.name = step.name; s.stepId = step.id; s.uid = seq++;
    shapes.push(s);
    budget.n--;
    if (!byName.has(step.name)) byName.set(step.name, []);
    byName.get(step.name).push(s);
    return s;
  };

  const target = (step) => {
    const s = latest(step.target);
    if (!s) throw new ExprError(`no ${step.target}`);
    return s;
  };

  const exec = (step) => {
    if (step.type === "loop" || step.type === "if") {
      const ev = { stepId: step.id, iters: loops.map((l) => l.i), ns: loops.map((l) => l.n), block: true };
      let n;
      try { n = step.type === "loop" ? Math.floor(num(step.count)) : (value(step.cond) ? 1 : 0); }
      catch (e) { ev.err = e.message; trace.push(ev); return; }
      if (step.type === "if") {
        if (n) for (const s of step.body) exec(s);
        return;
      }
      n = Math.max(0, Math.min(MAX_ITER, n));
      const L = { i: 0, n };
      loops.push(L);
      for (; L.i < n; L.i++) for (const s of step.body) exec(s);
      loops.pop();
      return;
    }
    // stopping before a step, so stopAt = k leaves events 0..k run (and -1 leaves none)
    if (trace.length > stopAt || trace.length >= MAX_EVENTS) throw new Stop();
    const ev = { stepId: step.id, iters: loops.map((l) => l.i), ns: loops.map((l) => l.n) };
    try {
      if (step.type === "move") {
        const s = target(step);
        const from = resolve(step.from), to = resolve(step.to, from);
        translate(s, sub(to, from));
        ev.inst = s;
      } else if (step.type === "scale") {
        const s = target(step);
        const p = resolve(step.origin), sx = num(step.sx);
        scaleAbout(s, p, sx, isBox(s) || s.kind === "circle" ? num(step.sy) : sx);
        ev.inst = s;
      } else if (step.type === "rotate") {
        const s = target(step);
        rotateAbout(s, resolve(step.origin), num(step.angle));
        ev.inst = s;
      } else {
        ev.inst = make(step);
      }
    } catch (e) {
      if (!(e instanceof ExprError)) throw e;
      ev.err = e.message;
    }
    trace.push(ev);
  };

  // the page itself is a guide everything can snap to
  const page = { kind: "rect", o: [0, 0], ex: [1, 0], ey: [0, 1], w: W, h: H, name: "page", stepId: null, uid: seq++, props: { guide: true }, page: true };
  byName.set("page", [page]);

  let stopped = false;
  try { for (const s of pic.steps) exec(s); }
  catch (e) { if (e instanceof Stop) stopped = true; else throw e; }

  // measurements: the picture's outputs, worked out from how it ended up
  const measures = {}, measureErrs = {};
  const menv = { fn, lookup: (name) => name in measures ? measures[name] : lookup(name) };
  for (const m of pic.measures || []) {
    try { measures[m.name] = evalSrc(m.expr, menv); }
    catch (e) { measureErrs[m.name] = e.message; }
  }

  return { shapes, page, byName, trace, data, stopped, latest, measures, measureErrs };
}

/* ---------------- describing steps ---------------- */

export function backOf(byName, s) {
  const list = byName.get(s.name) || [];
  const i = list.indexOf(s);
  return i < 0 ? 0 : list.length - 1 - i;
}

/** A reference to what a snap landed on, as it is right now. */
export function refTo(byName, hit) {
  if (hit.x) {
    const side = (h) => ({ shape: h.s.name, back: backOf(byName, h.s), e: h.e });
    return { k: "x", a: side(hit.x[0]), b: side(hit.x[1]) };
  }
  const base = { shape: hit.s.name, back: backOf(byName, hit.s) };
  if (hit.m) return { k: "mag", ...base, m: hit.m };
  return { k: "edge", ...base, e: hit.e, t: String(+hit.t.toFixed(3)) };
}

export function nextName(pic, base) {
  const used = new Set(["page", "i", "n", ...pic.vars.map((v) => v.name), ...(pic.measures || []).map((m) => m.name)]);
  walk(pic.steps, (s) => { if (s.name) used.add(s.name); });
  for (let k = 1; ; k++) if (!used.has(base + k)) return base + k;
}
