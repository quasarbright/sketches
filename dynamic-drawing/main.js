import { openModal } from "../shared/cohesion.js";
import { compile, isPlainNumber, renameIdent, fmt, evalSrc } from "./expr.js";
import {
  W, H, V, run, magnets, segments, edgeList, nearestOnEdge, intersect, refTo, nextName,
  findStep, walk, isBlock, magnetName, edgeName, DEFAULT_PROPS, center,
} from "./engine.js";
import { EXAMPLES } from "./examples.js";

const $ = (id) => document.getElementById(id);
const LS = "dynamic-drawing:project";

const css = getComputedStyle(document.documentElement);
const tok = (n, d) => css.getPropertyValue(n).trim() || d;
const C = {
  bg: tok("--bg", "#0d1016"), panel: tok("--panel", "#151a23"), border: tok("--border", "#283143"),
  text: tok("--text", "#e4e8f0"), muted: tok("--muted", "#8b94a7"), faint: tok("--faint", "#566074"),
  accent: tok("--accent", "#7c8cf8"), magnet: tok("--magnet", "#f5d04a"), guide: tok("--guide", "#5ab4f0"),
  danger: tok("--danger", "#e0556b"),
};
const FONT = "IBM Plex Sans, system-ui, sans-serif";

/* ================================================================ state */

let project, picId;
let cursorKey = null;      // { stepId, iters } of the event shown, or { start: true }; null = the last event
let insertAfter = null;    // new steps go after this step id (null: at the very start)
let sel = new Set();       // selected step ids
let tool = "select";
let previewMode = false;
let pictureChoice = null;  // which picture the picture tool draws

let full, at, cursorIdx;   // the whole run, the run stopped at the cursor, and its index
let previewAt = null;      // a run with a step that is still being drawn
let hover = null;          // { p, snap } under the pointer
let drag = null;
let pathDraft = null;
let dataDrag = null;       // the expression on a data chip being dragged
let dropPlan = null;       // what dropping it here would do

let saved, undoStack = [], redoStack = [];

const pic = () => project.pictures.find((p) => p.id === picId);

function load(state) {
  project = state.project;
  picId = project.pictures.some((p) => p.id === state.picId) ? state.picId : project.pictures[0].id;
  cursorKey = null; insertAfter = lastStepId(); sel = new Set();
  pathDraft = null; drag = null;
}
const snapshot = () => JSON.stringify({ project, picId });

function commit() {
  const now = snapshot();
  if (now === saved) return;
  undoStack.push(saved); redoStack = [];
  if (undoStack.length > 200) undoStack.shift();
  saved = now;
  try { localStorage.setItem(LS, now); } catch { /* private mode */ }
}
function undo() {
  if (!undoStack.length) return;
  redoStack.push(saved); saved = undoStack.pop();
  restore(saved);
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(saved); saved = redoStack.pop();
  restore(saved);
}
function restore(s) {
  const st = JSON.parse(s);
  const keep = { cursorKey, insertAfter };
  project = st.project; picId = st.picId;
  ({ cursorKey, insertAfter } = keep);
  if (insertAfter != null && !findStep(pic(), insertAfter)) insertAfter = lastStepId();
  try { localStorage.setItem(LS, s); } catch { /* private mode */ }
  refresh();
}

function lastStepId() {
  const steps = pic()?.steps || [];
  return steps.length ? steps[steps.length - 1].id : null;
}
const newId = () => ++project.seq;

/* ================================================================ running */

function sameish(a, b) {
  let k = 0;
  while (k < a.length && k < b.length && a[k] === b[k]) k++;
  return k;
}
function bestEvent(trace, stepId, iters) {
  let best = -1, score = -1;
  trace.forEach((e, i) => {
    if (e.stepId !== stepId) return;
    const s = sameish(e.iters, iters);
    if (s > score) { best = i; score = s; }
  });
  return best;
}
const curEvent = () => cursorIdx >= 0 ? full.trace[cursorIdx] : null;

function recompute() {
  full = run(project, pic());
  if (cursorKey?.start || !full.trace.length) cursorIdx = -1;
  else if (!cursorKey) cursorIdx = full.trace.length - 1;
  else {
    cursorIdx = bestEvent(full.trace, cursorKey.stepId, cursorKey.iters);
    if (cursorIdx < 0) cursorIdx = full.trace.length - 1;
  }
  at = run(project, pic(), { stopAt: cursorIdx });
}

function setCursor(idx) {
  if (idx < 0 || !full.trace.length) { cursorKey = { start: true }; insertAfter = null; }
  else {
    const e = full.trace[idx];
    cursorKey = { stepId: e.stepId, iters: e.iters };
    insertAfter = e.stepId;
  }
  refresh();
}

/* Where a new step goes, in a copy of the project or this one. */
function insertInto(proj, step) {
  const p = proj.pictures.find((q) => q.id === picId);
  const loc = insertAfter == null ? null : findStep(p, insertAfter);
  if (loc) loc.list.splice(loc.index + 1, 0, step);
  else p.steps.unshift(step);
  return p;
}

function previewRun(step) {
  const copy = structuredClone(project);
  const p = insertInto(copy, structuredClone(step));
  const f = run(copy, p);
  const idx = bestEvent(f.trace, step.id, curEvent()?.iters || []);
  return run(copy, p, { stopAt: idx < 0 ? cursorIdx : idx });
}

function addStep(step, { quiet = false } = {}) {
  const iters = curEvent()?.iters || [];
  insertInto(project, step);
  cursorKey = { stepId: step.id, iters };
  insertAfter = step.id;
  sel = new Set([step.id]);
  if (quiet) return;
  commit();
  refresh();
}

/* ================================================================ canvas */

const stage = $("stage"), cv = $("cv"), ctx = cv.getContext("2d");
let dpr = 1, sw = 0, sh = 0, k = 1, ox = 0, oy = 0;

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  const r = stage.getBoundingClientRect();
  sw = r.width; sh = r.height;
  cv.width = Math.round(sw * dpr); cv.height = Math.round(sh * dpr);
  cv.style.width = sw + "px"; cv.style.height = sh + "px";
  const narrow = sw < 700;
  // on a phone the title and step navigator sit above the page and the tools below it
  const top = narrow ? 88 : 70, bottom = narrow ? 58 : 96, side = narrow ? 10 : 80, right = narrow ? 10 : 40;
  k = Math.max(0.2, Math.min((sw - side - right) / W, (sh - top - bottom) / H));
  ox = side + (sw - side - right - W * k) / 2;
  oy = top + (sh - top - bottom - H * k) / 2;
  draw();
}

const toWorld = (e) => {
  const r = cv.getBoundingClientRect();
  return [(e.clientX - r.left - ox) / k, (e.clientY - r.top - oy) / k];
};

/* the outline of a shape, as a Path2D in its own coordinates */
function pathOf(s) {
  const P = new Path2D();
  switch (s.kind) {
    case "line": P.moveTo(...s.a); P.lineTo(...s.b); break;
    case "rect": case "pic": {
      const M = magnets(s);
      P.moveTo(...M.tl); P.lineTo(...M.tr); P.lineTo(...M.br); P.lineTo(...M.bl); P.closePath();
      break;
    }
    case "circle": {
      for (let i = 0; i <= 64; i++) {
        const a = i / 64 * 2 * Math.PI;
        const q = V.add(s.c, V.add(V.mul(s.ex, s.rx * Math.cos(a)), V.mul(s.ey, s.ry * Math.sin(a))));
        i ? P.lineTo(...q) : P.moveTo(...q);
      }
      P.closePath();
      break;
    }
    case "path": {
      outline(s).forEach((q, i) => i ? P.lineTo(...q) : P.moveTo(...q));
      if (s.closed) P.closePath();
      break;
    }
    case "text": {
      const b = textBox(s);
      b.forEach((q, i) => i ? P.lineTo(...q) : P.moveTo(...q));
      P.closePath();
      break;
    }
  }
  return P;
}

// A path as points, its arcs sampled.
function outline(s) {
  const out = [];
  const n = s.pts.length;
  const arcTo = (f, end) => {
    const steps = Math.max(2, Math.ceil(Math.abs(f.t1 - f.t0) * 64));
    for (let j = 1; j < steps; j++) {
      const a = (f.t0 + (f.t1 - f.t0) * j / steps) * 2 * Math.PI;
      out.push(V.add(f.c, V.add(V.mul(f.ex, f.rx * Math.cos(a)), V.mul(f.ey, f.ry * Math.sin(a)))));
    }
    out.push(end);
  };
  s.pts.forEach((p, i) => {
    if (i && s.arcs[i]) arcTo(s.arcs[i], p);
    else out.push(p);
  });
  if (s.closed && n > 1 && s.arcs[0]) arcTo(s.arcs[0], s.pts[0]);
  return out;
}

const measurer = document.createElement("canvas").getContext("2d");
function textBox(s) {
  measurer.font = `${s.size}px ${FONT}`;
  const w = measurer.measureText(s.props.text || "").width, h = s.size;
  const x0 = s.props.align === "left" ? 0 : s.props.align === "right" ? -w : -w / 2;
  const y0 = s.props.baseline === "top" ? 0 : s.props.baseline === "middle" ? -h / 2 : -h;
  return [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]].map(([x, y]) => V.add(s.a, V.add(V.mul(s.ex, x), V.mul(s.ey, y))));
}

function arrowHead(c, a, b, w) {
  const d = V.sub(b, a), L = Math.hypot(...d);
  if (L < 1e-6) return;
  const u = V.mul(d, 1 / L), n = [-u[1], u[0]], s = 4 + w * 2.5;
  c.beginPath();
  c.moveTo(...b);
  c.lineTo(...V.add(V.sub(b, V.mul(u, s * 1.6)), V.mul(n, s * 0.7)));
  c.lineTo(...V.sub(V.sub(b, V.mul(u, s * 1.6)), V.mul(n, s * 0.7)));
  c.closePath();
  c.fill();
}

/* mode: "final" (as in the picture), "guide" (blue, dashed), "ghost" (faint) */
function paint(c, s, mode = "final") {
  const P = s.props;
  if (s.kind === "pic") {
    c.save();
    c.globalAlpha *= P.opacity;
    c.transform(s.ex[0] * s.w / W, s.ex[1] * s.w / W, s.ey[0] * s.h / H, s.ey[1] * s.h / H, s.o[0], s.o[1]);
    for (const t of s.sub) if (!t.props.guide) paint(c, t, mode === "ghost" ? "ghost" : "final");
    c.restore();
    if (mode === "edit") {
      c.save(); c.setLineDash([3 / k, 4 / k]); c.strokeStyle = C.faint; c.lineWidth = 1 / k;
      c.stroke(pathOf(s)); c.restore();
    }
    return;
  }
  if (mode === "guide") {
    c.save();
    c.strokeStyle = C.guide; c.lineWidth = 1.25 / k; c.setLineDash([5 / k, 4 / k]);
    c.globalAlpha *= 0.85;
    if (s.kind === "text") { c.fillStyle = C.guide; drawText(c, s); }
    else c.stroke(pathOf(s));
    c.restore();
    return;
  }
  c.save();
  c.globalAlpha *= Math.max(0, Math.min(1, P.opacity));
  if (s.kind === "text") {
    c.fillStyle = P.fill || C.text;
    drawText(c, s);
    c.restore();
    return;
  }
  const path = pathOf(s);
  const filled = s.kind !== "line" && P.fill && P.fill !== "none";
  if (filled) { c.fillStyle = P.fill; c.fill(path); }
  if (P.stroke && P.stroke !== "none" && P.strokeWidth > 0) {
    c.strokeStyle = P.stroke; c.lineWidth = P.strokeWidth; c.lineCap = "round"; c.lineJoin = "round";
    c.stroke(path);
    if (P.arrow) {
      c.fillStyle = P.stroke;
      if (s.kind === "line") arrowHead(c, s.a, s.b, P.strokeWidth);
      else { const o = outline(s); if (o.length > 1) arrowHead(c, o[o.length - 2], o[o.length - 1], P.strokeWidth); }
    }
  }
  c.restore();
}

function drawText(c, s) {
  c.save();
  c.transform(s.ex[0], s.ex[1], s.ey[0], s.ey[1], s.a[0], s.a[1]);
  c.font = `${s.size}px ${FONT}`;
  c.textAlign = s.props.align || "center";
  c.textBaseline = s.props.baseline === "bottom" ? "alphabetic" : s.props.baseline || "alphabetic";
  // "bottom" sits the text just above its point
  c.fillText(s.props.text, 0, s.props.baseline === "bottom" ? -s.size * 0.28 : 0);
  c.restore();
}

const DRAW_TOOLS = new Set(["line", "rect", "circle", "text", "path", "picture", "move", "scale", "rotate"]);

function draw() {
  const c = ctx;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = C.bg; c.fillRect(0, 0, sw, sh);
  if (!full) return;

  c.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy);
  // the page
  c.save();
  c.shadowColor = "rgba(0,0,0,.45)"; c.shadowBlur = 30 * k; c.shadowOffsetY = 6 * k;
  c.fillStyle = "#12161f"; c.fillRect(0, 0, W, H);
  c.restore();
  if (!previewMode) {
    c.strokeStyle = "rgba(255,255,255,.035)"; c.lineWidth = 1 / k;
    c.beginPath();
    for (let x = 40; x < W; x += 40) { c.moveTo(x, 0); c.lineTo(x, H); }
    for (let y = 40; y < H; y += 40) { c.moveTo(0, y); c.lineTo(W, y); }
    c.stroke();
  }
  c.save();
  c.beginPath(); c.rect(-W, -H, W * 3, H * 3); c.clip();   // let things run a little past the page

  if (previewMode) {
    c.save(); c.beginPath(); c.rect(0, 0, W, H); c.clip();
    for (const s of full.shapes) if (!s.props.guide) paint(c, s);
    c.restore(); c.restore();
    return;
  }

  const state = previewAt || at;
  // what the finished picture will look like, faintly, while looking at an earlier step
  if (!previewAt && cursorIdx < full.trace.length - 1) {
    c.save(); c.globalAlpha = 0.12;
    for (const s of full.shapes) if (!s.props.guide) paint(c, s);
    c.restore();
  }
  for (const s of state.shapes) paint(c, s, s.props.guide ? "guide" : s.kind === "pic" ? "edit" : "final");

  // the shape the current step made or changed
  const ev = previewAt ? previewAt.trace[previewAt.trace.length - 1] : at.trace[at.trace.length - 1];
  const cur = ev?.inst;
  if (cur) {
    c.save();
    c.strokeStyle = C.accent; c.lineWidth = 2.2 / k; c.globalAlpha = 0.9;
    c.setLineDash([]);
    c.stroke(pathOf(cur));
    c.restore();
  }
  // other copies of the selected steps' shapes
  for (const s of state.shapes) {
    if (s === cur || !sel.has(s.stepId)) continue;
    c.save(); c.strokeStyle = C.accent; c.globalAlpha = 0.45; c.lineWidth = 1.2 / k; c.stroke(pathOf(s)); c.restore();
  }

  if (dataDrag && dropPlan?.act) drawDropTargets(c, dropPlan);

  // magnets near the pointer
  if (DRAW_TOOLS.has(tool) && hover && !dataDrag) {
    const near = 46 / k;
    c.fillStyle = C.magnet;
    for (const s of [at.page, ...at.shapes]) {
      const M = magnets(s);
      for (const m in M) {
        const p = M[m];
        if (Math.hypot(p[0] - hover.p[0], p[1] - hover.p[1]) > near) continue;
        c.beginPath(); c.arc(p[0], p[1], 2.6 / k, 0, 2 * Math.PI); c.fill();
      }
    }
    const sn = drag?.snapB !== undefined ? drag.snapB : hover.snap;
    if (sn) {
      c.save();
      c.strokeStyle = C.magnet; c.lineWidth = 2 / k;
      c.beginPath(); c.arc(sn.p[0], sn.p[1], (sn.m ? 6 : 5) / k, 0, 2 * Math.PI); c.stroke();
      if (sn.x) { c.beginPath(); c.moveTo(sn.p[0] - 5 / k, sn.p[1] - 5 / k); c.lineTo(sn.p[0] + 5 / k, sn.p[1] + 5 / k); c.moveTo(sn.p[0] + 5 / k, sn.p[1] - 5 / k); c.lineTo(sn.p[0] - 5 / k, sn.p[1] + 5 / k); c.stroke(); }
      c.restore();
      label(c, sn.p, snapLabel(sn));
    }
  }
  if (drag?.kind === "scale" || drag?.kind === "rotate") {
    c.save();
    c.fillStyle = C.accent;
    c.beginPath(); c.arc(drag.originP[0], drag.originP[1], 4 / k, 0, 2 * Math.PI); c.fill();
    c.restore();
  }
  c.restore();
}

function drawDropTargets(c, plan) {
  const { act, targets, target } = plan;
  c.save();
  // the shape being worked on, as it is before the drop
  c.strokeStyle = C.magnet; c.lineWidth = 1.5 / k; c.setLineDash([4 / k, 3 / k]); c.globalAlpha = 0.9;
  c.stroke(pathOf(act.s));
  c.setLineDash([]);
  for (const t of targets) {
    const on = t === target;
    if (t.kind === "handle") {
      c.fillStyle = C.magnet;
      c.beginPath(); c.arc(t.p[0], t.p[1], (on ? 5 : 3.2) / k, 0, 2 * Math.PI); c.fill();
      if (on) { c.strokeStyle = C.magnet; c.lineWidth = 2 / k; c.beginPath(); c.arc(t.p[0], t.p[1], 10 / k, 0, 2 * Math.PI); c.stroke(); }
    } else if (t.kind === "x" || t.kind === "y") {
      const w = PILL_W / k, hh = PILL_H / k;
      c.fillStyle = on ? C.magnet : "rgba(13,16,22,.92)";
      c.strokeStyle = C.magnet; c.lineWidth = 1.5 / k;
      c.beginPath(); c.roundRect(t.p[0] - w / 2, t.p[1] - hh / 2, w, hh, hh / 2); c.fill(); c.stroke();
      c.fillStyle = on ? "#0d1016" : C.magnet;
      c.font = `600 ${11 / k}px ${FONT}`; c.textAlign = "center"; c.textBaseline = "middle";
      c.fillText(t.text, t.p[0], t.p[1] + 0.5 / k);
    }
  }
  // what the drop will do: an arrow from the fixed point, and the shape where it lands
  if (target && previewAt) {
    const after = previewAt.trace[previewAt.trace.length - 1]?.inst;
    if (after) {
      c.fillStyle = "rgba(245,208,74,.18)"; c.strokeStyle = C.magnet; c.lineWidth = 2 / k;
      c.fill(pathOf(after)); c.stroke(pathOf(after));
      if (target.kind === "x" || target.kind === "y") {
        const a = center(act.s), b = center(after);
        if (Math.hypot(...V.sub(b, a)) > 2 / k) { c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke(); c.fillStyle = C.magnet; arrowHead(c, a, b, 1.5 / k); }
      }
    }
    if (plan.originP) {
      c.fillStyle = C.accent;
      c.beginPath(); c.arc(plan.originP[0], plan.originP[1], 4 / k, 0, 2 * Math.PI); c.fill();
    }
  }
  c.restore();
  if (target) label(c, target.p, plan.desc);
  else label(c, hover.p, "drop on a handle, ↔ x or ↕ y");
}

function label(c, p, text) {
  if (!text) return;
  c.save();
  c.font = `500 ${11 / k}px ${FONT}`;
  const w = c.measureText(text).width, pad = 5 / k, h = 17 / k;
  const x = p[0] + 10 / k, y = p[1] - 10 / k - h;
  c.fillStyle = "rgba(13,16,22,.88)";
  c.beginPath(); c.roundRect(x, y, w + pad * 2, h, 4 / k); c.fill();
  c.fillStyle = C.magnet; c.textBaseline = "middle";
  c.fillText(text, x + pad, y + h / 2);
  c.restore();
}

function snapLabel(sn) {
  if (sn.x) return `${sn.x[0].s.name} × ${sn.x[1].s.name}`;
  const nm = sn.s.name;
  if (sn.m) return `${nm} · ${magnetName(sn.m)}`;
  const e = edgeName(sn.e);
  return `${nm}${e ? " · " + e : ""} at ${fmt(sn.t, 2)}`;
}

/* ================================================================ snapping & hitting */

function snapAt(p, { magnetsOnly = false } = {}) {
  const tolM = 10 / k, tolE = 6 / k;
  const shapes = [at.page, ...at.shapes];
  let best = null;
  for (const s of shapes) {
    const M = magnets(s);
    for (const m in M) {
      const d = Math.hypot(M[m][0] - p[0], M[m][1] - p[1]);
      if (d <= tolM && (!best || d <= best.d)) best = { s, m, p: M[m], d };
    }
  }
  if (best || magnetsOnly) return best;
  // where two edges near the pointer cross
  const near = [];
  for (const s of shapes) {
    const S = segments(s);
    for (const e in S) {
      const r = nearestOnEdge(s, e, p);
      if (r.d <= tolM) near.push({ s, e, seg: S[e] });
    }
  }
  for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
    if (near[i].s === near[j].s) continue;
    const q = intersect(near[i].seg, near[j].seg);
    if (!q) continue;
    const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d <= tolM && (!best || d < best.d)) best = { x: [near[i], near[j]], p: q, d };
  }
  if (best) return best;
  for (const s of shapes) {
    for (const e of edgeList(s)) {
      const r = nearestOnEdge(s, e, p);
      if (r.d <= tolE && (!best || r.d <= best.d)) best = { s, e, t: r.t, p: r.p, d: r.d };
    }
  }
  return best;
}

function hitShape(p) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  let hit = null;
  for (let i = at.shapes.length - 1; i >= 0 && !hit; i--) {
    const s = at.shapes[i], P = pathOf(s);
    ctx.lineWidth = Math.max(10 / k, (s.props.strokeWidth || 0) + 6 / k);
    const open = s.kind === "line" || (s.kind === "path" && !s.closed && (!s.props.fill || s.props.fill === "none"));
    if ((!open && ctx.isPointInPath(P, p[0], p[1])) || ctx.isPointInStroke(P, p[0], p[1])) hit = s;
  }
  ctx.restore();
  return hit;
}

const round = (x, d = 0) => +x.toFixed(d);
const R1 = (x) => String(round(x));

function refFor(snap, p, base) {
  if (snap) return refTo(at.byName, snap);
  if (base) return { k: "rel", dx: R1(p[0] - base[0]), dy: R1(p[1] - base[1]) };
  return { k: "abs", x: R1(p[0]), y: R1(p[1]) };
}
const pointOf = (snap, p) => snap ? snap.p : [round(p[0]), round(p[1])];

const OPP = { tl: "br", br: "tl", tr: "bl", bl: "tr", t: "b_", b_: "t", l: "r", r: "l", a: "b", b: "a" };

/* ================================================================ dropping data on shapes
 * Like dragging an LFO onto a synth's knob. While a data chip is dragged over the canvas, the shape
 * under it shows where data can go:
 *   its handles     scale it along that handle's direction, about the opposite one
 *   ↔ x / ↕ y       sockets beside it that move it across or up the page, from where it was drawn
 *   a label's text  shows the value
 * An array is divided by its largest element, so the biggest value fills the shape (or the page),
 * and inside a loop each copy gets its own element. If the step you're on already does that kind of
 * thing to that shape, the drop rewrites it; otherwise it adds a step right after it. The result is
 * previewed live before you let go.
 */

const isArrayExpr = (src) => {
  try { return Array.isArray(evalSrc(src, { lookup: (n) => full.data.vals.get(n) })); } catch { return false; }
};
const norm = (src) => isArrayExpr(src) ? `${src} / max(${src})` : src;

function bounds(s) {
  const pts = s.kind === "line" ? [s.a, s.b] : s.kind === "path" ? s.pts : s.kind === "text" ? textBox(s) : Object.values(magnets(s));
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

// The shape the pointer is working with (near enough to reach the ↔ x and ↕ y sockets beside it):
// the one the current step drew if the pointer is over it, else the smallest one around, and on a
// tie a real shape before a guide and the topmost before the rest. A guide is often exactly the
// size of the shape drawn into it.
function activeShape(p) {
  const pad = 58 / k;
  const curInst = at.trace[at.trace.length - 1]?.inst;
  let best = null;
  at.shapes.forEach((s, idx) => {
    if (s.stepId == null) return;
    const B = bounds(s);
    if (p[0] < B.x0 - pad || p[0] > B.x1 + pad || p[1] < B.y0 - pad || p[1] > B.y1 + pad) return;
    const inside = p[0] >= B.x0 - 12 / k && p[0] <= B.x1 + 12 / k && p[1] >= B.y0 - 12 / k && p[1] <= B.y1 + 12 / k;
    const key = [s === curInst && inside ? 0 : 1, Math.round((B.x1 - B.x0 + 1) * (B.y1 - B.y0 + 1)), s.props.guide ? 1 : 0, -idx];
    if (!best || cmp(key, best.key) < 0) best = { s, B, key };
  });
  return best;
}
const cmp = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };

// Everything data can be dropped on for the active shape, in world coordinates.
function dropTargets(act) {
  if (!act) return [];
  const { s, B } = act, out = [];
  const mid = [(B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2];
  // under and to the left of the shape, unless that is off the visible page area (behind the tool
  // rail or the step navigator): then above or to the right
  const sx = (x) => ox + x * k, sy = (y) => oy + y * k;
  const below = sy(B.y1) + 26 + PILL_H < sh - 100;
  const left = sx(B.x0) - 30 - PILL_W / 2 > (sw < 700 ? 8 : 84);
  out.push({ kind: "x", p: [mid[0], below ? B.y1 + 26 / k : B.y0 - 26 / k], text: "↔ x" });
  out.push({ kind: "y", p: [left ? B.x0 - 30 / k : B.x1 + 30 / k, mid[1]], text: "↕ y" });
  if (s.kind === "text") out.push({ kind: "text", p: mid, text: "text" });
  else if (s.kind !== "path") {
    const M = magnets(s);
    for (const m in M) {
      if (s.kind === "line" && m === "mid") continue;
      out.push({ kind: "handle", m, p: M[m] });
    }
  }
  return out;
}

const PILL_W = 38, PILL_H = 20;
function hitTarget(t, p) {
  if (t.kind === "x" || t.kind === "y") return Math.abs(p[0] - t.p[0]) <= (PILL_W / 2 + 4) / k && Math.abs(p[1] - t.p[1]) <= (PILL_H / 2 + 4) / k;
  if (t.kind === "text") return false;   // handled by hitting the text itself
  return Math.hypot(p[0] - t.p[0], p[1] - t.p[1]) <= 14 / k;
}

function planDrop(p, src) {
  const act = activeShape(p);
  if (!act) return null;
  const s = act.s, targets = dropTargets(act);
  let t = targets.find((x) => (x.kind === "x" || x.kind === "y") && hitTarget(x, p))
    || targets.filter((x) => x.kind === "handle" && hitTarget(x, p)).sort((u, v) => Math.hypot(...V.sub(u.p, p)) - Math.hypot(...V.sub(v.p, p)))[0];
  if (!t && s.kind === "text" && hitShape(p) === s) t = targets.find((x) => x.kind === "text");
  const plan = { act, targets, target: t, s };
  if (!t) return plan;
  const name = s.name;
  const curStep = (proj) => {
    const ev = curEvent();
    return ev && findStep(proj.pictures.find((q) => q.id === picId), ev.stepId)?.step;
  };
  const insert = (proj, step) => { insertInto(proj, step); return step.id; };

  if (t.kind === "text") {
    plan.desc = `${name} shows ${src}`;
    plan.edit = (proj) => {
      const st = findStep(proj.pictures.find((q) => q.id === picId), s.stepId)?.step;
      if (!st) return null;
      st.props ||= {};
      st.props.text = `{${src}}`;
      return st.id;
    };
    plan.lands = "edit";
    return plan;
  }
  if (t.kind === "x" || t.kind === "y") {
    // a move from the shape's own anchor point, by a share of the page
    const M = magnets(s);
    const anchor = M.c ? "c" : M.mid ? "mid" : M.a ? "a" : Object.keys(M)[0];
    const f = norm(src);
    const off = t.kind === "x" ? `${f} * width(page)` : `-${/^[\w.]+( \/ max\([\w.]+\))?$/.test(f) ? f : `(${f})`} * height(page)`;
    plan.desc = t.kind === "x" ? `move ${name} right by ${f} of the page` : `move ${name} up by ${f} of the page`;
    plan.edit = (proj) => {
      const cur = curStep(proj);
      const same = cur && cur.type === "move" && cur.target === name && cur.from?.k === "mag" && cur.from.shape === name && cur.to?.k === "rel";
      const st = same ? cur : { id: pendingId(), type: "move", target: name, from: { k: "mag", shape: name, back: 0, m: anchor }, to: { k: "rel", dx: "0", dy: "0" } };
      st.to[t.kind === "x" ? "dx" : "dy"] = off;
      return same ? st.id : insert(proj, st);
    };
    return plan;
  }
  // a handle: scale along its direction
  const m = t.m;
  const box = s.kind === "rect" || s.kind === "pic";
  const axis = !box ? "both" : m === "t" || m === "b_" ? "y" : m === "l" || m === "r" ? "x" : "both";
  const originM = s.kind === "circle" || m === "c" ? "c" : OPP[m];
  const word = s.kind === "line" ? "length" : axis === "y" ? "height" : axis === "x" ? "width" : "size";
  const f = norm(src);
  plan.desc = `${name}'s ${word} × ${f}`;
  plan.originP = magnets(s)[originM];
  plan.edit = (proj) => {
    const cur = curStep(proj);
    const same = cur && cur.type === "scale" && cur.target === name && cur.origin?.k === "mag" && cur.origin.shape === name && cur.origin.m === originM;
    const st = same ? cur : { id: pendingId(), type: "scale", target: name, origin: { k: "mag", shape: name, back: 0, m: originM }, sx: "1", sy: "1" };
    if (axis !== "y") st.sx = f;
    if (axis !== "x") st.sy = f;
    return same ? st.id : insert(proj, st);
  };
  return plan;
}

// One id for whatever step a drop would add, kept while the chip is dragged so the preview and
// the real thing agree.
let pendingDropId = null;
const pendingId = () => pendingDropId ??= newId();

function previewDrop(plan) {
  if (!plan?.edit) return null;
  const copy = structuredClone(project);
  const id = plan.edit(copy);
  if (id == null) return null;
  const P = copy.pictures.find((q) => q.id === picId);
  const f = run(copy, P);
  const idx = bestEvent(f.trace, id, curEvent()?.iters || []);
  return run(copy, P, { stopAt: idx < 0 ? cursorIdx : idx });
}

function endDataDrag() {
  dataDrag = null; dropPlan = null; hover = null; previewAt = null; pendingDropId = null;
}

cv.addEventListener("dragover", (e) => {
  if (!dataDrag || previewMode) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "copy";
  const p = toWorld(e);
  hover = { p, snap: null };
  const plan = planDrop(p, dataDrag);
  const key = plan?.target ? `${plan.s.uid}|${plan.target.kind}|${plan.target.m}` : null;
  if (key !== dropPlan?.key) previewAt = plan?.target ? previewDrop(plan) : null;
  dropPlan = plan && { ...plan, key };
  draw();
});
cv.addEventListener("dragleave", (e) => {
  if (!dataDrag || cv.contains(e.relatedTarget)) return;
  dropPlan = null; previewAt = null; hover = null; draw();
});
cv.addEventListener("drop", (e) => {
  if (!dataDrag) return;
  e.preventDefault();
  const src = dataDrag, plan = dropPlan;
  const iters = curEvent()?.iters || [];
  if (!plan?.target) { endDataDrag(); toast("Drop it on a yellow handle, on ↔ x or ↕ y beside a shape, or on a label."); draw(); return; }
  const id = plan.edit(project);
  endDataDrag();
  if (id != null) {
    if (plan.lands !== "edit") { cursorKey = { stepId: id, iters }; insertAfter = id; }
    sel = new Set([id]);
  }
  commit(); refresh();
  // an array outside a loop can't pick one element: say how to fix it
  const ev = full.trace.find((x) => x.stepId === id && x.err);
  if (ev && /array outside a loop/.test(ev.err)) toast(`${src} is a list: select the steps that draw this shape and press Loop, to get one per element.`);
  else if (ev) toast(ev.err);
});


/* ================================================================ pointer */

cv.addEventListener("pointerdown", (e) => {
  if (previewMode || e.button !== 0) return;
  cv.setPointerCapture(e.pointerId);
  const p = toWorld(e);
  const snap = snapAt(p);
  const P = pic();

  if (tool === "select") {
    const s = hitShape(p);
    if (s?.stepId != null) selectStep(s.stepId, e.shiftKey || e.metaKey);
    else { sel = new Set(); renderPanels(); draw(); }
    return;
  }
  if (tool === "text") {
    addStep({ id: newId(), type: "text", name: nextName(P, "text"), a: refFor(snap, p), props: { text: "label" } });
    setTimeout(() => { const t = document.querySelector("[data-prop=text]"); t?.focus(); t?.select(); });
    return;
  }
  if (tool === "path") {
    if (!pathDraft) pathDraft = { refs: [refFor(snap, p)], pts: [pointOf(snap, p)] };
    else {
      const first = pathDraft.pts[0];
      if (pathDraft.pts.length > 2 && Math.hypot(first[0] - p[0], first[1] - p[1]) * k < 10) return finishPath(true);
      const last = pathDraft.pts[pathDraft.pts.length - 1];
      pathDraft.refs.push(refFor(snap, p, last));
      pathDraft.pts.push(pointOf(snap, p));
    }
    updatePathPreview(p);
    return;
  }
  if (["line", "rect", "circle", "picture"].includes(tool)) {
    if (tool === "picture" && !pictureChoice) return;
    drag = { kind: tool, snapA: snap, aP: pointOf(snap, p), refA: refFor(snap, p), sp: [e.clientX, e.clientY] };
    return;
  }
  // transforms: what to act on
  let target = snap && snap.s && !snap.s.page ? snap.s : hitShape(p);
  if (tool === "scale") {
    // a handle: the nearest magnet of the shape (or of anything nearby)
    let h = snap?.m && !snap.s.page ? snap : null;
    if (!h && target) {
      const M = magnets(target);
      let best = null;
      for (const m in M) { const d = Math.hypot(M[m][0] - p[0], M[m][1] - p[1]); if (!best || d < best.d) best = { s: target, m, p: M[m], d }; }
      h = best;
    }
    if (!h || h.s.kind === "text") return;
    target = h.s;
    const om = e.altKey ? (target.kind === "line" ? "mid" : target.kind === "path" ? null : "c") : OPP[h.m];
    const originP = om && magnets(target)[om];
    if (!originP) { toast("Drag a corner, edge or end: it scales about the opposite one."); return; }
    drag = { kind: "scale", target, m: h.m, handleP: h.p, originM: om, originP, sp: [e.clientX, e.clientY] };
    return;
  }
  if (!target) return;
  if (tool === "move") {
    drag = { kind: "move", target, refA: refFor(snap, p), aP: pointOf(snap, p), sp: [e.clientX, e.clientY] };
    return;
  }
  if (tool === "rotate") {
    const M = magnets(target);
    let om = "c";
    if (target.kind === "line") {
      const da = Math.hypot(...V.sub(M.a, p)), db = Math.hypot(...V.sub(M.b, p));
      om = Math.min(da, db) < Math.hypot(...V.sub(M.a, M.b)) / 4 ? (da < db ? "b" : "a") : "mid";
    } else if (target.kind === "text") om = "a";
    else if (target.kind === "path") om = "p1";
    const originP = M[om];
    drag = { kind: "rotate", target, originM: om, originP, a0: Math.atan2(p[1] - originP[1], p[0] - originP[0]), sp: [e.clientX, e.clientY] };
  }
});

cv.addEventListener("pointermove", (e) => {
  const p = toWorld(e);
  if (previewMode) return;
  hover = { p, snap: DRAW_TOOLS.has(tool) && tool !== "scale" && tool !== "rotate" ? snapAt(p) : tool === "scale" ? snapAt(p, { magnetsOnly: true }) : null };
  if (pathDraft) { updatePathPreview(p); return; }
  if (!drag) { draw(); return; }
  const step = dragStep(drag, p, e);
  if (step) previewAt = previewRun(step);
  draw();
});

cv.addEventListener("pointerup", (e) => {
  if (!drag) return;
  const p = toWorld(e);
  const moved = Math.hypot(e.clientX - drag.sp[0], e.clientY - drag.sp[1]) > 4;
  const step = moved ? dragStep(drag, p, e) : null;
  drag = null; previewAt = null;
  if (step) addStep(step); else draw();
});
cv.addEventListener("pointerleave", () => { if (!drag && !pathDraft) { hover = null; draw(); } });
cv.addEventListener("dblclick", () => { if (pathDraft) finishPath(false); });

function dragStep(d, p, e) {
  const P = pic();
  if (d.kind === "line" || d.kind === "rect" || d.kind === "circle" || d.kind === "picture") {
    const sn = snapAt(p);
    d.snapB = sn;
    const b = refFor(sn, p, d.aP);
    if (d.kind === "circle") return { id: d.id ??= newId(), type: "circle", name: d.name ??= nextName(P, "circle"), c: d.refA, p: b, props: {} };
    if (d.kind === "picture") {
      const inner = project.pictures.find((q) => q.id === pictureChoice);
      return { id: d.id ??= newId(), type: "picture", name: d.name ??= nextName(P, inner.name.replace(/\W/g, "") || "pic"), pic: inner.id, a: d.refA, b, overrides: {}, props: {} };
    }
    return { id: d.id ??= newId(), type: d.kind, name: d.name ??= nextName(P, d.kind), a: d.refA, b, props: {} };
  }
  const target = d.target.name;
  if (d.kind === "move") {
    const sn = snapAt(p);
    d.snapB = sn;
    return { id: d.id ??= newId(), type: "move", target, from: d.refA, to: refFor(sn, p, d.aP) };
  }
  const origin = { k: "mag", shape: target, back: 0, m: d.originM };
  if (d.kind === "scale") {
    const s = d.target, dv = V.sub(d.handleP, d.originP), ev = V.sub(p, d.originP);
    let sx = 1, sy = 1;
    if (s.kind === "rect" || s.kind === "pic" || s.kind === "circle") {
      const a = V.dot(dv, s.ex), b = V.dot(dv, s.ey);
      if (Math.abs(a) > 1e-6) sx = V.dot(ev, s.ex) / a;
      if (Math.abs(b) > 1e-6) sy = V.dot(ev, s.ey) / b;
      if (d.m === "t" || d.m === "b_") sx = 1;
      if (d.m === "l" || d.m === "r") sy = 1;
      if (e.shiftKey) { const u = V.dot(ev, dv) / (V.dot(dv, dv) || 1); sx = sy = u; }
    } else {
      sx = sy = V.dot(ev, dv) / (V.dot(dv, dv) || 1);
    }
    return { id: d.id ??= newId(), type: "scale", target, origin, sx: String(round(sx, 3)), sy: String(round(sy, 3)) };
  }
  if (d.kind === "rotate") {
    let deg = (Math.atan2(p[1] - d.originP[1], p[0] - d.originP[0]) - d.a0) * 180 / Math.PI;
    deg = ((deg + 540) % 360) - 180;
    deg = e.shiftKey ? Math.round(deg / 15) * 15 : round(deg, 1);
    return { id: d.id ??= newId(), type: "rotate", target, origin, angle: String(deg) };
  }
  return null;
}

function draftStep(d, p) {
  const refs = [...d.refs];
  if (p) {
    const sn = snapAt(p);
    refs.push(refFor(sn, p, d.pts[d.pts.length - 1]));
  }
  return { id: d.id ??= newId(), type: "path", name: d.name ??= nextName(pic(), "path"), pts: refs, closed: false, props: {} };
}
function updatePathPreview(p) {
  previewAt = pathDraft.refs.length + (p ? 1 : 0) > 1 ? previewRun(draftStep(pathDraft, p)) : null;
  draw();
}
function finishPath(closed) {
  const d = pathDraft;
  pathDraft = null; previewAt = null;
  if (!d || d.refs.length < 2) { draw(); return; }
  const step = draftStep(d, null);
  step.closed = closed;
  if (closed) step.props = { fill: "#7c8cf8", stroke: "none" };
  addStep(step);
}

/* ================================================================ panels */

let liveHooks = [];
const live = () => { recompute(); draw(); for (const f of liveHooks) f(); renderNav(); };
function refresh() { recompute(); renderPanels(); draw(); }

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [a, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (a === "class") el.className = v;
    else if (a.startsWith("on")) el.addEventListener(a.slice(2), v);
    else if (a === "style") el.style.cssText = v;
    else el.setAttribute(a, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
}

/* An expression field: edits obj[key]. Scrub sideways when it holds a plain number. */
const exprErr = (v) => v.trim() ? compile(v).err : null;
const colorErr = (v) => v.trim().startsWith("=") ? compile(v.trim().slice(1)).err : null;
const textErr = (v) => { for (const m of v.matchAll(/\{([^}]*)\}/g)) { const e = compile(m[1]).err; if (e) return e; } return null; };

function ex(obj, key, { title, placeholder, wide, onLive, check = exprErr } = {}) {
  const inp = h("input", { class: "ex", spellcheck: "false", title, placeholder, autocomplete: "off" });
  inp.value = obj[key] ?? "";
  const fit = () => {
    if (!wide) inp.style.width = Math.max(3, Math.min(28, (inp.value || placeholder || "").length + 1.5)) + "ch";
    inp.classList.toggle("num", isPlainNumber(inp.value));
    const err = check(inp.value);
    inp.classList.toggle("bad", !!err);
    inp.title = err || title || "";
  };
  fit();
  inp.addEventListener("input", () => { obj[key] = inp.value; fit(); onLive?.(); live(); });
  inp.addEventListener("change", () => { commit(); renderPanels(); });
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.blur(); e.stopPropagation(); });
  inp.addEventListener("pointerdown", (e) => {
    if (document.activeElement === inp || !isPlainNumber(inp.value)) return;
    e.preventDefault();
    const x0 = e.clientX, v0 = parseFloat(inp.value);
    const dec = (inp.value.split(".")[1] || "").length;
    const stepv = 10 ** -dec;
    let scrubbed = false;
    const mv = (ev) => {
      const dx = ev.clientX - x0;
      if (!scrubbed && Math.abs(dx) < 3) return;
      scrubbed = true;
      const v = v0 + Math.round(dx / 2) * stepv * (ev.shiftKey ? 10 : 1);
      inp.value = String(+v.toFixed(dec));
      obj[key] = inp.value; fit(); onLive?.(); live();
    };
    const up = () => {
      window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up);
      if (scrubbed) commit(); else { inp.focus(); inp.select(); }
    };
    window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
  });
  return inp;
}

function chip(text, alt) {
  return h("span", {
    class: "chip" + (alt ? " alt" : ""), draggable: "true", title: `Drag onto a shape's handle on the canvas, or into any field, to use ${text}`,
    ondragstart: (e) => { e.dataTransfer.setData("text/plain", text); e.dataTransfer.effectAllowed = "copy"; dataDrag = text; },
    ondragend: () => { if (dataDrag) { endDataDrag(); draw(); } },
  }, text);
}

function showValue(v) {
  if (Array.isArray(v)) {
    const head = v.slice(0, 8).map((x) => typeof x === "number" ? fmt(x, 2) : JSON.stringify(x)).join(", ");
    return `[${head}${v.length > 8 ? ", …" : ""}]  ·${v.length}`;
  }
  if (typeof v === "number") return fmt(v, 4);
  if (typeof v === "string") return JSON.stringify(v);
  if (v && v.kind) return `a ${v.kind}`;
  return String(v);
}

function renderPanels() {
  liveHooks = [];
  renderPictures();
  renderVars();
  renderSteps();
  renderMeasures();
  renderProps();
  renderNav();
  renderToolUI();
}

/* ---------------- pictures ---------------- */

function renderPictures() {
  const box = $("pics");
  box.replaceChildren();
  for (const p of project.pictures) {
    const b = h("button", {
      class: "dd-pic" + (p.id === picId ? " on" : ""), title: p.id === picId ? "Double-click to rename" : `Edit ${p.name}`,
      onclick: () => { if (p.id !== picId) openPicture(p.id); },
      ondblclick: () => renamePicture(p),
    }, p.name);
    box.append(b);
  }
  box.append(h("button", { class: "dd-mini", title: "A new, empty picture, to draw on its own or inside others", onclick: addPicture }, "+"));
}

function openPicture(id) {
  picId = id;
  cursorKey = null; insertAfter = lastStepId(); sel = new Set(); pathDraft = null;
  if (pictureChoice === id) pictureChoice = null;
  commit();
  refresh();
}
function addPicture() {
  const base = "picture";
  let n = 1;
  while (project.pictures.some((p) => p.name === base + n)) n++;
  const id = "pic" + newId();
  project.pictures.push({ id, name: base + n, vars: [{ name: "data", expr: "[1, 2, 3, 4, 5]" }], measures: [], steps: [] });
  openPicture(id);
}
function renamePicture(p) {
  const name = prompt("Rename picture", p.name);
  if (!name || !name.trim()) return;
  p.name = name.trim();
  commit(); renderPanels();
}
function deletePicture() {
  if (project.pictures.length < 2) return;
  const used = project.pictures.filter((q) => q.id !== picId && JSON.stringify(q.steps).includes(`"pic":"${picId}"`));
  if (used.length && !confirm(`${used.map((q) => q.name).join(", ")} draw${used.length === 1 ? "s" : ""} this picture. Delete it anyway?`)) return;
  project.pictures = project.pictures.filter((q) => q.id !== picId);
  openPicture(project.pictures[0].id);
}

/* ---------------- data ---------------- */

const openReductions = new Set();

function renderVars() {
  const box = $("vars");
  box.replaceChildren();
  const P = pic();
  P.vars.forEach((v, idx) => {
    const name = h("input", { class: "ex name", spellcheck: "false", title: "Variable name" });
    name.value = v.name;
    name.addEventListener("keydown", (e) => { if (e.key === "Enter") name.blur(); e.stopPropagation(); });
    name.addEventListener("change", () => {
      const nn = name.value.trim();
      if (!/^[A-Za-z_]\w*$/.test(nn) || nn === v.name) { name.value = v.name; return; }
      renameEverywhere(v.name, nn, "var");
      commit(); refresh();
    });
    const val = h("div", { class: "dd-val" });
    const fill = () => {
      val.replaceChildren();
      const err = full.data.errs.get(v.name);
      if (err) { val.append(h("span", { class: "v err" }, err)); return; }
      const x = full.data.vals.get(v.name);
      val.append(chip(v.name));
      if (Array.isArray(x)) {
        // the reductions hide behind a triangle, as in the talk
        const open = openReductions.has(v.name);
        val.append(h("button", { class: "dd-tri" + (open ? " open" : ""), title: "Reductions: drag one to use the whole array as a number", onclick: () => { open ? openReductions.delete(v.name) : openReductions.add(v.name); fill(); } }, "▸"));
        if (open) for (const f of ["count", "max", "min", "sum", "mean"]) val.append(chip(`${f}(${v.name})`, true));
      }
      val.append(h("span", { class: "v", title: showValue(x) }, showValue(x)));
    };
    fill();
    liveHooks.push(fill);
    box.append(h("div", { class: "dd-var" },
      name, h("span", { class: "eq" }, "="), ex(v, "expr", { wide: true, title: "An expression: a number, [an, array], or math on other variables" }),
      h("button", { class: "dd-x", title: "Remove this variable", onclick: () => { P.vars.splice(idx, 1); commit(); refresh(); } }, "×"),
      val));
  });
}

$("add-var").addEventListener("click", () => {
  const P = pic();
  P.vars.push({ name: nextName(P, "x"), expr: "1" });
  commit(); refresh();
});

// Drop a CSV or a column of numbers on the data panel: one array per column.
const dataSec = $("data-sec");
dataSec.addEventListener("dragover", (e) => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); dataSec.classList.add("drop"); } });
dataSec.addEventListener("dragleave", () => dataSec.classList.remove("drop"));
dataSec.addEventListener("drop", async (e) => {
  dataSec.classList.remove("drop");
  const f = e.dataTransfer.files?.[0];
  if (!f) return;
  e.preventDefault();
  importTable(await f.text(), f.name);
});

function importTable(text, fname = "data") {
  const rows = text.trim().split(/\r?\n/).map((r) => r.split(/[,\t;]/).map((c) => c.trim()));
  if (!rows.length) return;
  const numeric = (c) => c !== "" && !isNaN(+c);
  const header = rows[0].some((c) => !numeric(c)) ? rows.shift() : null;
  const cols = Math.max(...rows.map((r) => r.length));
  const P = pic();
  let added = 0;
  for (let j = 0; j < cols; j++) {
    const vals = rows.map((r) => r[j]).filter(numeric).map(Number);
    if (!vals.length) continue;
    let base = (header?.[j] || fname.replace(/\.\w+$/, "") + (cols > 1 ? j + 1 : "")).replace(/\W+/g, "_").replace(/^(\d)/, "_$1") || "col";
    let name = base, n = 2;
    while (P.vars.some((v) => v.name === name)) name = base + n++;
    P.vars.push({ name, expr: `[${vals.join(", ")}]` });
    added++;
  }
  if (added) { commit(); refresh(); toast(`Added ${added} array${added > 1 ? "s" : ""} from ${fname}.`); }
}

/* Rename a variable or a shape, and every mention of it in this picture (and, for a variable, the
   overrides other pictures give it). */
function renameEverywhere(from, to, what) {
  const P = pic();
  const fix = (s) => typeof s === "string" ? renameIdent(s, from, to) : s;
  const fixColor = (s) => typeof s === "string" && s.trim().startsWith("=") ? "=" + renameIdent(s.trim().slice(1), from, to) : s;
  const fixText = (s) => typeof s === "string" ? s.replace(/\{([^}]*)\}/g, (_, e) => `{${renameIdent(e, from, to)}}`) : s;
  const fixRef = (r) => {
    if (!r) return;
    for (const key of ["x", "y", "dx", "dy", "t"]) if (key in r) r[key] = fix(r[key]);
    if (what === "shape" && r.shape === from) r.shape = to;
    if (r.k === "x") { fixRef(r.a); fixRef(r.b); }
  };
  for (const v of P.vars) { v.expr = fix(v.expr); if (what === "var" && v.name === from) v.name = to; }
  for (const m of P.measures || []) m.expr = fix(m.expr);
  walk(P.steps, (s) => {
    for (const key of ["count", "cond", "sx", "sy", "angle"]) if (key in s) s[key] = fix(s[key]);
    for (const key of ["a", "b", "c", "p", "from", "to", "origin"]) fixRef(s[key]);
    (s.pts || []).forEach(fixRef);
    if (what === "shape") { if (s.name === from) s.name = to; if (s.target === from) s.target = to; }
    if (s.props) for (const key in s.props) {
      if (key === "text") s.props.text = fixText(s.props.text);
      else if (key === "fill" || key === "stroke") s.props[key] = fixColor(s.props[key]);
      else if (typeof s.props[key] === "string") s.props[key] = fix(s.props[key]);
    }
    if (s.overrides) for (const key in s.overrides) s.overrides[key] = fix(s.overrides[key]);
  });
  if (what === "var") {
    for (const q of project.pictures) walk(q.steps, (s) => {
      if (s.type === "picture" && s.pic === picId && s.overrides && from in s.overrides) {
        s.overrides[to] = s.overrides[from]; delete s.overrides[from];
      }
    });
  }
}

/* ---------------- steps ---------------- */

function stepErrors() {
  // for each step: how many of its runs failed, out of how many
  const m = new Map();
  for (const e of full.trace) {
    const r = m.get(e.stepId) || { n: 0, bad: 0, msg: null };
    r.n++;
    if (e.err) { r.bad++; r.msg ??= e.err; }
    m.set(e.stepId, r);
  }
  return m;
}

function refView(ref, guideNames) {
  if (!ref) return h("span", { class: "ref free" }, "?");
  const who = (r) => {
    const nm = h("span", { class: guideNames.has(r.shape) ? "nm guide" : "" }, r.shape);
    if (!r.back) return [nm];
    return [r.back === 1 ? "previous " : `${r.back}-back `, nm];
  };
  switch (ref.k) {
    case "mag": return h("span", { class: "ref", title: "A magnet of another shape: it follows that shape" }, ...who(ref), "'s ", magnetName(ref.m));
    case "edge": return h("span", { class: "ref" }, ...who(ref), edgeName(ref.e) ? `'s ${edgeName(ref.e)}` : "", " at ", ex(ref, "t", { title: "How far along: 0 at the start, 1 at the end (for a circle, once round)" }));
    case "x": return h("span", { class: "ref", title: "Where two edges cross" }, "where ", ...who(ref.a), " crosses ", ...who(ref.b));
    case "abs": return h("span", { class: "ref free" }, "(", ex(ref, "x"), ", ", ex(ref, "y"), ")");
    case "rel": return h("span", { class: "ref free", title: "An offset from the previous point" }, "+(", ex(ref, "dx"), ", ", ex(ref, "dy"), ")");
  }
  return "?";
}

function sentence(s, guideNames) {
  const V_ = (t) => h("span", { class: "verb" }, t);
  const N = (t) => h("span", { class: guideNames.has(t) ? "nm guide" : "nm" }, t);
  const R = (r) => refView(r, guideNames);
  switch (s.type) {
    case "line": return [V_("line "), N(s.name), V_(" from "), R(s.a), V_(" to "), R(s.b)];
    case "rect": return [V_("rect "), N(s.name), V_(" from "), R(s.a), V_(" to "), R(s.b)];
    case "circle": return [V_("circle "), N(s.name), V_(" at "), R(s.c), V_(" through "), R(s.p)];
    case "text": return [V_("text "), N(s.name), V_(" at "), R(s.a)];
    case "path": return [V_("path "), N(s.name), V_(" through "), ...s.pts.flatMap((r, i) => i ? [", ", R(r)] : [R(r)]), s.closed ? V_(", closed") : ""];
    case "picture": {
      const inner = project.pictures.find((q) => q.id === s.pic);
      return [V_("draw "), N(s.name), V_(` (${inner ? inner.name : "deleted picture"}) from `), R(s.a), V_(" to "), R(s.b)];
    }
    case "move": return [V_("move "), N(s.target), V_(" from "), R(s.from), V_(" to "), R(s.to)];
    case "scale": {
      const kind = kindOf(s.target);
      const two = kind === "rect" || kind === "circle" || kind === "picture";
      return [V_("scale "), N(s.target), V_(" about "), R(s.origin), V_(two ? " by x " : " by "), ex(s, "sx"), two ? V_(" y ") : "", two ? ex(s, "sy") : ""];
    }
    case "rotate": return [V_("rotate "), N(s.target), V_(" about "), R(s.origin), V_(" by "), ex(s, "angle"), V_("°")];
    case "loop": return [V_("repeat "), ex(s, "count", { title: "How many times. Inside, i counts from 0 and arrays mean their i-th element" }), V_(" times")];
    case "if": return [V_("if "), ex(s, "cond", { title: "Do these steps only when this isn't 0" })];
  }
  return [s.type];
}

function kindOf(name) {
  let kind = null;
  walk(pic().steps, (s) => { if (s.name === name) kind = s.type; });
  return kind;
}

function renderSteps() {
  const box = $("steps");
  box.replaceChildren();
  const P = pic();
  const errs = stepErrors();
  const guideNames = new Set(["page"]);
  walk(P.steps, (s) => { if (s.props?.guide) guideNames.add(s.name); });
  const curId = curEvent()?.stepId;
  let n = 0;

  const start = h("div", { class: "dd-start" + (cursorIdx < 0 ? " cur" : ""), title: "Before the first step: new steps go at the top", onclick: () => setCursor(-1) }, "start");
  box.append(start);

  const list = (steps, into) => {
    for (const s of steps) {
      n++;
      const er = errs.get(s.id);
      const dot = er?.bad ? h("span", { class: "dot" + (er.bad < er.n ? " soft" : ""), title: `${er.bad < er.n ? `${er.bad} of ${er.n} runs: ` : ""}${er.msg}` }) : null;
      const row = h("div", {
        class: "dd-step" + (sel.has(s.id) ? " sel" : "") + (s.id === curId || (isBlock(s) && s.id === insertAfter && !curId) ? " cur" : ""),
        onclick: (e) => { if (e.target.closest("input")) return; selectStep(s.id, e.shiftKey || e.metaKey); },
      }, h("span", { class: "ix" }, String(n)), h("span", { class: "txt" }, ...sentence(s, guideNames)), dot);
      into.append(row);
      if (isBlock(s)) {
        const inner = h("div", { class: "dd-loop" });
        into.append(inner);
        list(s.body, inner);
      }
    }
  };
  list(P.steps, box);
  if (!P.steps.length) box.append(h("p", { class: "dd-hint" }, "No steps yet. Pick a tool and draw: every action becomes a step here."));

  const selected = [...sel].map((id) => findStep(P, id)).filter(Boolean);
  const oneBlock = selected.length === 1 && isBlock(selected[0].step);
  const draws = selected.filter((x) => x.step.name);
  $("loop").disabled = !selected.length;
  $("if").disabled = !selected.length;
  $("unloop").disabled = !oneBlock;
  $("guide").disabled = !draws.length;
  $("del").disabled = !selected.length;
}

function selectStep(id, add) {
  const P = pic();
  const hit = findStep(P, id);
  if (!hit) return;
  if (add && sel.size) {
    const first = findStep(P, [...sel][0]);
    if (first && first.list === hit.list) {
      // a range in the same list
      const [a, b] = [first.index, hit.index].sort((x, y) => x - y);
      sel = new Set(hit.list.slice(a, b + 1).map((s) => s.id));
    } else sel = new Set([id]);
  } else sel = new Set([id]);
  // show the picture as of this step (in the same iteration if it's in the same loop)
  const iters = curEvent()?.iters || [];
  let idx;
  if (isBlock(hit.step)) {
    // after the whole block: its last event
    const ids = new Set();
    walk(hit.step.body, (s) => ids.add(s.id));
    idx = -1;
    full.trace.forEach((e, i) => { if (ids.has(e.stepId) && sameish(e.iters, iters) >= Math.min(iters.length, e.iters.length - 1)) idx = i; });
    if (idx < 0) full.trace.forEach((e, i) => { if (ids.has(e.stepId)) idx = i; });
    if (idx >= 0) { const e = full.trace[idx]; cursorKey = { stepId: e.stepId, iters: e.iters }; }
  } else {
    idx = bestEvent(full.trace, id, iters);
    if (idx >= 0) cursorKey = { stepId: id, iters: full.trace[idx].iters };
  }
  insertAfter = id;
  refresh();
}

function wrap(type) {
  const P = pic();
  const selected = [...sel].map((id) => findStep(P, id)).filter(Boolean);
  if (!selected.length) return;
  const list = selected[0].list;
  const idxs = selected.filter((x) => x.list === list).map((x) => x.index);
  const a = Math.min(...idxs), b = Math.max(...idxs);
  const firstArr = P.vars.find((v) => Array.isArray(full.data.vals.get(v.name)));
  const block = type === "loop"
    ? { id: newId(), type: "loop", count: firstArr ? `count(${firstArr.name})` : "5", body: list.slice(a, b + 1) }
    : { id: newId(), type: "if", cond: "i % 2 == 0", body: list.slice(a, b + 1) };
  list.splice(a, b - a + 1, block);
  sel = new Set([block.id]);
  commit(); refresh();
}
$("loop").addEventListener("click", () => wrap("loop"));
$("if").addEventListener("click", () => wrap("if"));
$("unloop").addEventListener("click", () => {
  const hit = findStep(pic(), [...sel][0]);
  if (!hit || !isBlock(hit.step)) return;
  hit.list.splice(hit.index, 1, ...hit.step.body);
  sel = new Set(hit.step.body.map((s) => s.id));
  if (insertAfter === hit.step.id) insertAfter = hit.step.body.at(-1)?.id ?? null;
  commit(); refresh();
});
$("guide").addEventListener("click", toggleGuide);
$("del").addEventListener("click", deleteSelected);

function toggleGuide() {
  const P = pic();
  const draws = [...sel].map((id) => findStep(P, id)?.step).filter((s) => s?.name);
  if (!draws.length) return;
  const on = !draws.every((s) => s.props?.guide);
  for (const s of draws) { s.props = s.props || {}; s.props.guide = on; }
  commit(); refresh();
}

function deleteSelected() {
  const P = pic();
  const hits = [...sel].map((id) => findStep(P, id)).filter(Boolean);
  if (!hits.length) return;
  // the cursor goes to the step before the first one deleted
  const ids = new Set();
  for (const x of hits) walk([x.step], (s) => ids.add(s.id));
  const order = [];
  walk(P.steps, (s) => order.push(s.id));
  const firstIdx = Math.min(...[...ids].map((id) => order.indexOf(id)));
  const prev = order.slice(0, firstIdx).filter((id) => !ids.has(id)).at(-1) ?? null;
  for (const x of hits.sort((a, b) => b.index - a.index)) {
    const again = findStep(P, x.step.id);
    if (again) again.list.splice(again.index, 1);
  }
  sel = new Set();
  insertAfter = prev;
  cursorKey = prev == null ? { start: true } : { stepId: prev, iters: curEvent()?.iters || [] };
  commit(); refresh();
}

/* ---------------- measurements ---------------- */

function renderMeasures() {
  const box = $("measures");
  box.replaceChildren();
  const P = pic();
  P.measures ||= [];
  P.measures.forEach((m, idx) => {
    const name = h("input", { class: "ex name", spellcheck: "false", title: "Measurement name: outside, read it as picture.name" });
    name.value = m.name;
    name.addEventListener("keydown", (e) => { if (e.key === "Enter") name.blur(); e.stopPropagation(); });
    name.addEventListener("change", () => {
      const nn = name.value.trim();
      if (!/^[A-Za-z_]\w*$/.test(nn)) { name.value = m.name; return; }
      m.name = nn; commit(); refresh();
    });
    const val = h("div", { class: "dd-val" });
    const fill = () => {
      val.replaceChildren();
      const err = full.measureErrs[m.name];
      if (err) { val.append(h("span", { class: "v err" }, err)); return; }
      const x = full.measures[m.name];
      val.append(h("span", { class: "v" }, showValue(x)));
    };
    fill();
    liveHooks.push(fill);
    box.append(h("div", { class: "dd-var" },
      name, h("span", { class: "eq" }, "="), ex(m, "expr", { wide: true, title: "Worked out after the picture is drawn. Can use shapes: width(bar), angle(line1)…" }),
      h("button", { class: "dd-x", title: "Remove", onclick: () => { P.measures.splice(idx, 1); commit(); refresh(); } }, "×"),
      val));
  });
  if (!P.measures.length) box.append(h("p", { class: "dd-hint" }, "Outputs of this picture, worked out once it's drawn. A picture drawn inside another can read them, as here.total."));
}
$("add-measure").addEventListener("click", () => {
  const P = pic();
  P.measures ||= [];
  P.measures.push({ name: nextName(P, "m"), expr: "1" });
  commit(); refresh();
});

/* ---------------- properties ---------------- */

function colorField(props, key, dflt) {
  if (!(key in props)) props[key] = dflt;
  const text = ex(props, key, { wide: true, check: colorErr, title: "A color (#hex, a name, none), or = and an expression, like =hsl(i * 30, 60, 60)" });
  text.dataset.prop = key;
  const pick = h("input", { type: "color", title: "Pick a color" });
  const sync = () => { pick.value = /^#[0-9a-f]{6}$/i.test(props[key]) ? props[key] : "#7c8cf8"; };
  sync();
  pick.addEventListener("input", () => { props[key] = pick.value; text.value = pick.value; live(); });
  pick.addEventListener("change", () => { commit(); });
  text.addEventListener("input", sync);
  return h("div", { class: "dd-color" }, pick, text);
}

function renderProps() {
  const box = $("props");
  box.replaceChildren();
  const P = pic();
  const hits = [...sel].map((id) => findStep(P, id)).filter(Boolean);
  $("props-title").textContent = "Properties";
  if (hits.length !== 1 || !hits[0].step.name) {
    box.append(h("p", { class: "dd-hint" }, hits.length > 1 ? `${hits.length} steps selected.` : "Select a shape (or the step that drew it) to see its properties."));
    return;
  }
  const s = hits[0].step;
  s.props ||= {};
  const D = DEFAULT_PROPS[s.type] || {};
  const pr = s.props;
  $("props-title").textContent = `Properties of ${s.name}`;
  const grid = h("div", { class: "dd-props" });
  const row = (label, el) => grid.append(h("label", {}, label), el);

  const name = h("input", { class: "ex", spellcheck: "false" });
  name.value = s.name;
  name.style.width = "100%";
  name.addEventListener("keydown", (e) => { if (e.key === "Enter") name.blur(); e.stopPropagation(); });
  name.addEventListener("change", () => {
    const nn = name.value.trim();
    let taken = nn === "page" || P.vars.some((v) => v.name === nn);
    walk(P.steps, (t) => { if (t.name === nn && t !== s) taken = true; });
    if (!/^[A-Za-z_]\w*$/.test(nn) || taken) { name.value = s.name; toast(taken ? `${nn} is taken` : "Names are letters, digits and _"); return; }
    renameEverywhere(s.name, nn, "shape");
    commit(); refresh();
  });
  row("name", name);
  const guide = h("input", { type: "checkbox" });
  guide.checked = !!pr.guide;
  guide.addEventListener("change", () => { pr.guide = guide.checked; commit(); refresh(); });
  row("guide", h("label", { class: "check" }, guide, "helps draw, not drawn (G)"));

  if (s.type === "picture") {
    const pickPic = h("select", {});
    for (const q of project.pictures) pickPic.append(h("option", { value: q.id, selected: q.id === s.pic }, q.name));
    pickPic.addEventListener("change", () => { s.pic = pickPic.value; s.overrides = {}; commit(); refresh(); });
    row("picture", pickPic);
    const inner = project.pictures.find((q) => q.id === s.pic);
    if (inner) {
      s.overrides ||= {};
      grid.append(h("div", { class: "section-label", style: "grid-column:1/-1;margin:.6em 0 0" }, `${inner.name}'s data`));
      for (const v of inner.vars) {
        const field = ex(s.overrides, v.name, { wide: true, placeholder: v.expr, title: `Leave empty to use ${inner.name}'s own: ${v.expr}` });
        row(v.name, field);
      }
      if (!inner.vars.length) grid.append(h("p", { class: "dd-hint", style: "grid-column:1/-1" }, `${inner.name} has no data to set.`));
    }
    row("opacity", ex(pr, "opacity", { placeholder: D.opacity }));
  } else {
    if ("fill" in D) row("fill", colorField(pr, "fill", D.fill));
    if ("stroke" in D) row("stroke", colorField(pr, "stroke", D.stroke));
    if ("strokeWidth" in D) { pr.strokeWidth ??= D.strokeWidth; row("stroke width", ex(pr, "strokeWidth")); }
    if ("text" in D) {
      pr.text ??= D.text;
      const t = ex(pr, "text", { wide: true, check: textErr, title: "The label. Put expressions in braces: {fmt(energy, 1)} MWh" });
      t.dataset.prop = "text";
      row("text", t);
      pr.size ??= D.size;
      row("size", ex(pr, "size"));
      const al = h("select", {});
      for (const a of ["left", "center", "right"]) al.append(h("option", { value: a, selected: (pr.align || D.align) === a }, a));
      al.addEventListener("change", () => { pr.align = al.value; commit(); live(); });
      row("align", al);
      const bl = h("select", {});
      for (const [a, l] of [["bottom", "above the point"], ["middle", "on the point"], ["top", "below the point"]]) bl.append(h("option", { value: a, selected: (pr.baseline || D.baseline) === a }, l));
      bl.addEventListener("change", () => { pr.baseline = bl.value; commit(); live(); });
      row("sits", bl);
    }
    pr.opacity ??= D.opacity;
    row("opacity", ex(pr, "opacity"));
    if ("arrow" in D) {
      const ar = h("input", { type: "checkbox" });
      ar.checked = !!pr.arrow;
      ar.addEventListener("change", () => { pr.arrow = ar.checked; commit(); live(); });
      row("arrow", h("label", { class: "check" }, ar, "arrowhead at the end"));
    }
    if (s.type === "path") {
      const cl = h("input", { type: "checkbox" });
      cl.checked = !!s.closed;
      cl.addEventListener("change", () => { s.closed = cl.checked; commit(); refresh(); });
      row("closed", h("label", { class: "check" }, cl, "join the last point to the first"));
    }
  }
  box.append(grid);
}

/* ---------------- trace navigation ---------------- */

function describe(stepId) {
  const hit = findStep(pic(), stepId);
  if (!hit) return "";
  const s = hit.step;
  return s.name ? `${s.type === "picture" ? "draw" : s.type} ${s.name}` : s.target ? `${s.type} ${s.target}` : s.type;
}

function renderNav() {
  const nav = $("nav");
  nav.replaceChildren();
  const T = full.trace;
  const btn = (title, d, f, dis) => h("button", { title, onclick: f, disabled: dis }, svgIcon(d));
  const e = curEvent();
  let text;
  if (!T.length) text = h("span", {}, "no steps yet");
  else if (!e) text = h("span", {}, h("b", {}, "start"), `  ·  ${T.length} step${T.length > 1 ? "s" : ""} ran`);
  else {
    const it = e.iters.map((i, j) => `${i + 1}/${e.ns[j]}`).join(" · ");
    text = h("span", {}, `${cursorIdx + 1}/${T.length}  `, h("b", {}, describe(e.stepId)), it ? `  ·  iteration ${it}` : "", e.err ? h("span", { class: "err" }, `  ·  ${e.err}`) : "");
  }
  nav.append(
    btn("Same step, previous iteration (←)", "M15 6l-6 6 6 6", () => sideways(-1)),
    btn("Previous step (↑)", "M6 15l6-6 6 6", () => step(-1)),
    text,
    btn("Next step (↓)", "M6 9l6 6 6-6", () => step(1)),
    btn("Same step, next iteration (→)", "M9 6l6 6-6 6", () => sideways(1)),
  );
}

function svgIcon(d) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", d);
  s.append(p);
  return s;
}

function step(d) {
  const n = full.trace.length;
  if (!n) return;
  let i = cursorIdx + d;
  if (i < -1) i = n - 1;
  if (i >= n) i = -1;
  sel = new Set(i >= 0 ? [full.trace[i].stepId] : []);
  setCursor(i);
}
function sideways(d) {
  const e = curEvent();
  if (!e) return;
  for (let i = cursorIdx + d; i >= 0 && i < full.trace.length; i += d) {
    if (full.trace[i].stepId === e.stepId) { setCursor(i); return; }
  }
}

/* ================================================================ tools, keys, menu */

const tools = $("tools");
function setTool(t) {
  if (pathDraft && t !== "path") finishPath(false);
  tool = t;
  for (const b of tools.querySelectorAll("[data-tool]")) b.classList.toggle("is-active", b.dataset.tool === t);
  cv.style.cursor = t === "select" ? "default" : t === "move" ? "move" : "crosshair";
  renderToolUI();
  draw();
}
tools.addEventListener("click", (e) => {
  const b = e.target.closest("[data-tool]");
  if (b) setTool(b.dataset.tool);
});

const HINTS = {
  select: "Click a shape to select the step that drew it",
  line: "Drag from point to point. Yellow dots are magnets",
  rect: "Drag corner to corner",
  circle: "Drag from the center out",
  text: "Click to place a label",
  path: "Click point after point. Click the first point to close, double-click or Enter to finish",
  move: "Drag a shape from a point to a point",
  scale: "Drag a yellow dot of a shape: it scales about the opposite one",
  rotate: "Drag a shape round its center",
  picture: "Drag a box to draw a picture into",
};
function renderToolUI() {
  const hint = $("toolhint");
  hint.replaceChildren(HINTS[tool] || "");
  if (tool === "picture") {
    const others = project.pictures.filter((q) => q.id !== picId);
    // a picture can draw itself too (recursion), so it is offered last
    const choices = [...others, pic()];
    if (!choices.some((q) => q.id === pictureChoice)) pictureChoice = choices[0].id;
    const s = h("select", { title: "Which picture to draw" });
    for (const q of choices) s.append(h("option", { value: q.id, selected: q.id === pictureChoice }, q.id === picId ? `${q.name} (itself)` : q.name));
    s.addEventListener("change", () => { pictureChoice = s.value; });
    hint.append(": ", s);
  }
}

$("undo").addEventListener("click", undo);
$("redo").addEventListener("click", redo);
$("preview").addEventListener("click", togglePreview);
$("del-pic").addEventListener("click", deletePicture);
function togglePreview() {
  previewMode = !previewMode;
  $("preview").classList.toggle("is-active", previewMode);
  draw();
}

const KEYS = { v: "select", l: "line", r: "rect", c: "circle", t: "text", a: "path", m: "move", s: "scale", o: "rotate", d: "picture" };
window.addEventListener("keydown", (e) => {
  if (e.target.closest?.("input, textarea, select")) return;
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
  if (mod) return;
  if (e.key === "ArrowUp") { e.preventDefault(); step(-1); return; }
  if (e.key === "ArrowDown") { e.preventDefault(); step(1); return; }
  if (e.key === "ArrowLeft") { e.preventDefault(); sideways(-1); return; }
  if (e.key === "ArrowRight") { e.preventDefault(); sideways(1); return; }
  if (e.key === "Enter" && pathDraft) { finishPath(false); return; }
  if (e.key === "Escape") {
    if (pathDraft) { pathDraft = null; previewAt = null; draw(); return; }
    if (drag) { drag = null; previewAt = null; draw(); return; }
    setTool("select"); return;
  }
  if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSelected(); return; }
  const key = e.key.toLowerCase();
  if (key === "g") { toggleGuide(); return; }
  if (key === "p") { togglePreview(); return; }
  if (KEYS[key]) setTool(KEYS[key]);
});

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

/* ---------------- export ---------------- */

function download(name, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function exportPNG() {
  const c = document.createElement("canvas");
  const s = 2;
  c.width = W * s; c.height = H * s;
  const g = c.getContext("2d");
  g.fillStyle = "#12161f"; g.fillRect(0, 0, c.width, c.height);
  g.setTransform(s, 0, 0, s, 0, 0);
  const keepK = k; k = 1;
  for (const sh of full.shapes) if (!sh.props.guide) paint(g, sh);
  k = keepK;
  c.toBlob((b) => download(`${pic().name}.png`, b));
}

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
function svgOf(shapes) {
  const out = [];
  const pts = (list) => list.map((p) => `${+p[0].toFixed(2)},${+p[1].toFixed(2)}`).join(" ");
  for (const s of shapes) {
    const P = s.props;
    if (P.guide) continue;
    const op = P.opacity < 1 ? ` opacity="${P.opacity}"` : "";
    const fill = P.fill && P.fill !== "none" ? esc(P.fill) : "none";
    const stroke = P.stroke && P.stroke !== "none" && P.strokeWidth > 0 ? ` stroke="${esc(P.stroke)}" stroke-width="${P.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"` : "";
    if (s.kind === "pic") {
      const m = [s.ex[0] * s.w / W, s.ex[1] * s.w / W, s.ey[0] * s.h / H, s.ey[1] * s.h / H, s.o[0], s.o[1]].map((x) => +x.toFixed(4));
      out.push(`<g transform="matrix(${m.join(" ")})"${op}>${svgOf(s.sub)}</g>`);
    } else if (s.kind === "line") {
      out.push(`<polyline points="${pts([s.a, s.b])}" fill="none"${stroke}${op}/>`);
    } else if (s.kind === "text") {
      const anchor = { left: "start", center: "middle", right: "end" }[P.align] || "middle";
      const base = P.baseline === "top" ? "hanging" : P.baseline === "middle" ? "central" : "auto";
      const dy = P.baseline === "bottom" ? -s.size * 0.28 : 0;
      out.push(`<text transform="matrix(${[s.ex[0], s.ex[1], s.ey[0], s.ey[1], s.a[0], s.a[1]].map((x) => +x.toFixed(4)).join(" ")})" y="${+dy.toFixed(2)}" font-family="IBM Plex Sans, sans-serif" font-size="${+s.size.toFixed(2)}" text-anchor="${anchor}" dominant-baseline="${base}" fill="${esc(P.fill || C.text)}"${op}>${esc(P.text)}</text>`);
    } else {
      const list = s.kind === "rect" ? (({ tl, tr, br, bl }) => [tl, tr, br, bl])(magnets(s))
        : s.kind === "circle" ? Array.from({ length: 64 }, (_, i) => { const a = i / 64 * 2 * Math.PI; return V.add(s.c, V.add(V.mul(s.ex, s.rx * Math.cos(a)), V.mul(s.ey, s.ry * Math.sin(a)))); })
        : outline(s);
      const closed = s.kind !== "path" || s.closed;
      out.push(`<${closed ? "polygon" : "polyline"} points="${pts(list)}" fill="${fill}"${stroke}${op}/>`);
    }
  }
  return out.join("\n");
}
function exportSVG() {
  const body = svgOf(full.shapes);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">\n<rect width="${W}" height="${H}" fill="#12161f"/>\n${body}\n</svg>\n`;
  download(`${pic().name}.svg`, new Blob([svg], { type: "image/svg+xml" }));
}

$("menu").addEventListener("click", () => {
  const { el, close } = openModal(`<h2 class="title" style="font-size:1.3rem">Examples</h2><div class="dd-menu" data-ex></div>
    <div class="section-label">This project</div>
    <div class="btn-row"><button class="btn" data-a="png">Download PNG</button><button class="btn" data-a="svg">Download SVG</button>
    <button class="btn" data-a="save">Save project</button><button class="btn" data-a="open">Open project…</button></div>
    <p class="muted" style="font-size:.82rem">Opening an example replaces what's here (undo brings it back). You can also drop a CSV on the Data panel.</p>`);
  const list = el.querySelector("[data-ex]");
  for (const x of EXAMPLES) {
    list.append(h("button", {
      class: "btn ex-pick", onclick: () => {
        const proj = x.make();
        load({ project: proj, picId: x.open || proj.pictures[0].id });
        commit(); refresh(); close();
      },
    }, h("b", {}, x.title), h("div", { class: "muted" }, x.blurb)));
  }
  el.querySelector("[data-a=png]").addEventListener("click", exportPNG);
  el.querySelector("[data-a=svg]").addEventListener("click", exportSVG);
  el.querySelector("[data-a=save]").addEventListener("click", () => download("dynamic-drawing.json", new Blob([JSON.stringify(project, null, 1)], { type: "application/json" })));
  el.querySelector("[data-a=open]").addEventListener("click", () => {
    const inp = h("input", { type: "file", accept: ".json,application/json" });
    inp.addEventListener("change", async () => {
      try {
        const proj = JSON.parse(await inp.files[0].text());
        if (!Array.isArray(proj.pictures) || !proj.pictures.length) throw new Error();
        load({ project: proj, picId: proj.pictures[0].id });
        commit(); refresh(); close();
      } catch { toast("That isn't a Dynamic Drawing project."); }
    });
    inp.click();
  });
});

/* ================================================================ start */

function initial() {
  try {
    const s = JSON.parse(localStorage.getItem(LS));
    if (s?.project?.pictures?.length) return s;
  } catch { /* none saved */ }
  const proj = EXAMPLES[0].make();
  return { project: proj, picId: EXAMPLES[0].open };
}

load(initial());
saved = snapshot();
setTool("select");
recompute();
renderPanels();
new ResizeObserver(resize).observe(stage);
resize();
document.fonts?.ready.then(draw);
