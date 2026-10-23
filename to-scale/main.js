import { openModal } from "../shared/cohesion.js";
import { LIBRARY, BY_ID } from "./library.js";
import { deflateSync, inflateSync, strToU8, strFromU8 } from "https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js";

// World units are millimeters, y pointing down. The view maps them to CSS pixels:
// screen = (world - view.center) * view.z + canvas center, so view.z is px per mm.

const COLORS = ["#ff8a75", "#62c6ff", "#b59cff", "#72e0ae", "#ff8fcf", "#f5a15a"];
const CHALK = "#f1ede0";
const ACCENT = "#e8c547";
const MAT = "#0f2a22";
const GRID_MINOR = "#1c4134";
const GRID_MAJOR = "#346b55";
const GAP_MM = 15;            // space between things placed side by side
const SNAP_DEG = 6;           // rotation snaps to a multiple of 45° within this many degrees
const SNAP_PX = 7;            // edge / center alignment snapping distance, in screen px
const MM_PER_IN = 25.4;
const DEFAULT_CALIB = 96 / MM_PER_IN; // the CSS reference pixel: 96 per inch

const LS_MAT = "to-scale:mat";
const LS_CALIBS = "to-scale:calibrations"; // { "<display key>": device px per mm }
const LS_CLOSED = "to-scale:closed-groups";
const LS_CUSTOM = "to-scale:custom-rects";

const $ = (id) => document.getElementById(id);
const canvas = $("mat");
const ctx = canvas.getContext("2d");
const wrap = $("mat-wrap");

// ---------------------------------------------------------------- state

let shapes = [];
let selId = null;
let hoverId = null;
let view = { x: 0, y: 0, z: 2 };
let unit = "mm";
// The calibration is stored as device pixels per mm: a device pixel has a fixed physical size
// on a given screen, while a CSS pixel grows and shrinks with browser zoom. calib (CSS px per
// mm, what drawing uses) is derived from it for the current devicePixelRatio, and re-derived
// whenever that changes, so 100% stays real size through window resizes and browser zoom.
//
// Each display gets its own calibration, keyed by its resolution in device pixels. A browser
// can't name a monitor without a permission prompt, but it can see the screen's size, and
// screen.width × devicePixelRatio is the panel's native resolution whatever the browser zoom.
// Two monitors with the same resolution share a key; that's only wrong when they're also
// different physical sizes, and pressing 1:1 at 100% recalibrates.
function displayKey() {
  const r = window.devicePixelRatio || 1;
  return `${Math.round(screen.width * r)}x${Math.round(screen.height * r)}`;
}
function readCalibrations() {
  try { return JSON.parse(localStorage.getItem(LS_CALIBS)) || {}; } catch { return {}; }
}
function calibrationFor(key) {
  const all = readCalibrations();
  if (all[key] > 0) return all[key];
  // allow a pixel of rounding either way
  const [w, h] = key.split("x").map(Number);
  for (const [k, v] of Object.entries(all)) {
    const [kw, kh] = k.split("x").map(Number);
    if (Math.abs(kw - w) <= 2 && Math.abs(kh - h) <= 2 && v > 0) return v;
  }
  return null;
}
let display = displayKey();
let devicePxPerMm = calibrationFor(display);
let calib = devicePxPerMm ? devicePxPerMm / (window.devicePixelRatio || 1) : DEFAULT_CALIB;
let undoStack = [], redoStack = [];
let W = 0, H = 0, dpr = 1;
let nextId = 1;
let guides = [];              // alignment guides to draw while dragging
let rotating = null;          // {cx, cy, angle, snapped} while the rotate handle is dragged

function readNum(k) { try { const v = parseFloat(localStorage.getItem(k)); return v > 0 ? v : null; } catch { return null; } }

const sel = () => shapes.find((s) => s.id === selId) || null;

function makeShape(spec, x = 0, y = 0) {
  const lib = spec.src ? BY_ID[spec.src] : null;
  const colored = lib ? lib.colored : true;
  return {
    id: nextId++,
    src: spec.src || null,
    name: spec.name ?? (lib ? lib.name : ""),
    w: spec.w ?? lib.w,
    h: spec.h ?? lib.h,
    r: spec.r ?? (lib ? lib.r : 0),
    kind: spec.kind ?? (lib ? lib.kind : "plain"),
    circle: spec.circle ?? !!(lib && lib.circle),
    color: spec.color ?? (colored ? pickColor() : null),
    x, y, a: spec.a ?? 0,
  };
}

function pickColor() {
  const counts = COLORS.map((c) => shapes.filter((s) => s.color === c).length);
  const min = Math.min(...counts);
  return COLORS[counts.indexOf(min)];
}

// ---------------------------------------------------------------- history + persistence

const serialize = () => JSON.stringify(shapes.map(({ id, ...s }) => s));
function restore(json) {
  shapes = JSON.parse(json).map((s) => ({ ...s, id: nextId++ }));
  if (!shapes.some((s) => s.id === selId)) selId = null;
}
function commit(prev) {
  if (prev === serialize()) return;
  undoStack.push(prev);
  if (undoStack.length > 200) undoStack.shift();
  redoStack = [];
  changed();
}
function undo() {
  if (!undoStack.length) return;
  redoStack.push(serialize());
  const keep = sel() && indexOf(selId);
  restore(undoStack.pop());
  reselect(keep);
  changed();
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(serialize());
  const keep = sel() && indexOf(selId);
  restore(redoStack.pop());
  reselect(keep);
  changed();
}
const indexOf = (id) => shapes.findIndex((s) => s.id === id);
function reselect(i) { selId = (i !== false && i != null && shapes[i]) ? shapes[i].id : null; }

let saveTimer = 0;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(LS_MAT, JSON.stringify({ shapes: JSON.parse(serialize()), view: { x: view.x, y: view.y, pct: view.z / calib }, unit })); } catch {}
  }, 150);
}
function changed() { syncUI(); save(); draw(); }

// share links carry the shapes and unit in the hash
// Same scheme as dinner-debt: deflate the JSON and base64url it behind a "z." prefix. Each
// shape is [library id or 0, x, y, angle, color index, name?, [w, h]?], with the name and size
// left out when they're the library object's own. Older links are plain base64 JSON.
const DEFLATE_PREFIX = "z.";
function bytesToBase64Url(bytes) {
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64UrlToBytes(str) {
  return Uint8Array.from(atob(str.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
}
function encodeMat() {
  const s = shapes.map((s) => {
    const lib = s.src && BY_ID[s.src];
    const row = [lib ? s.src : 0, r1(s.x), r1(s.y), r1(s.a), s.color ? COLORS.indexOf(s.color) : null];
    const name = lib && s.name === lib.name ? null : s.name;
    const size = lib && s.w === lib.w && s.h === lib.h ? null : [r1(s.w), r1(s.h)];
    if (name !== null || size) row.push(name);
    if (size) row.push(size);
    return row;
  });
  return DEFLATE_PREFIX + bytesToBase64Url(deflateSync(strToU8(JSON.stringify({ u: unit, s })), { level: 9 }));
}
function decodeMat(str) {
  const json = str.startsWith(DEFLATE_PREFIX)
    ? strFromU8(inflateSync(base64UrlToBytes(str.slice(DEFLATE_PREFIX.length))))
    : decodeURIComponent(escape(atob(str)));
  const data = JSON.parse(json);
  unit = okUnit(data.u);
  shapes = [];
  for (const [src, x, y, a, color, name, wh] of data.s) {
    const spec = src && BY_ID[src] ? { src } : { kind: "plain", w: wh[0], h: wh[1], name: name || "" };
    const s = makeShape(spec, x, y);
    s.a = a;
    if (typeof color === "number") s.color = COLORS[color] || COLORS[0];
    else if (color !== undefined) s.color = color;
    if (name !== undefined && name !== null) s.name = name;
    if (wh) { s.w = wh[0]; s.h = wh[1]; }
    shapes.push(s);
  }
}
const r1 = (v) => Math.round(v * 10) / 10;

// ---------------------------------------------------------------- units

// mm: size of one unit in millimeters; dp: decimals shown; area: the unit areas are shown in
const UNITS = {
  mm: { mm: 1, dp: 1, metric: true, area: "cm" },
  cm: { mm: 10, dp: 2, metric: true, area: "cm" },
  m:  { mm: 1000, dp: 3, metric: true, area: "m" },
  in: { mm: MM_PER_IN, dp: 2, metric: false, area: "in" },
  ft: { mm: MM_PER_IN * 12, dp: 3, metric: false, area: "ft" },
};
const okUnit = (u) => (UNITS[u] ? u : "mm");
const metric = () => UNITS[unit].metric;
const step = () => (metric() ? 1 : MM_PER_IN / 16);
const snapLen = (mm) => Math.max(step(), Math.round(mm / step()) * step());
const trim = (s) => s.replace(/\.?0+$/, "");
function fmtNum(mm) { const u = UNITS[unit]; return trim((mm / u.mm).toFixed(u.dp)); }
function fmtLen(mm) { return fmtNum(mm) + " " + unit; }
function fmtArea(mm2) {
  const a = UNITS[unit].area, per = UNITS[a].mm ** 2;
  return trim((mm2 / per).toFixed(a === "cm" || a === "in" ? 1 : 3)) + ` ${a}²`;
}
function parseLen(str, u = unit) {
  const v = parseFloat(String(str).replace(",", "."));
  if (!(v > 0)) return null;
  return v * UNITS[u].mm;
}

// ---------------------------------------------------------------- geometry

const rad = (d) => (d * Math.PI) / 180;
const toScreen = (x, y) => [(x - view.x) * view.z + W / 2, (y - view.y) * view.z + H / 2];
const toWorld = (px, py) => [(px - W / 2) / view.z + view.x, (py - H / 2) / view.z + view.y];
function localToWorld(s, lx, ly) {
  const c = Math.cos(rad(s.a)), n = Math.sin(rad(s.a));
  return [s.x + lx * c - ly * n, s.y + lx * n + ly * c];
}
function worldToLocal(s, x, y) {
  const c = Math.cos(rad(s.a)), n = Math.sin(rad(s.a));
  const dx = x - s.x, dy = y - s.y;
  return [dx * c + dy * n, -dx * n + dy * c];
}
function aabb(s) {
  if (s.circle) return { l: s.x - s.w / 2, r: s.x + s.w / 2, t: s.y - s.w / 2, b: s.y + s.w / 2 };
  const c = Math.abs(Math.cos(rad(s.a))), n = Math.abs(Math.sin(rad(s.a)));
  const hw = (s.w / 2) * c + (s.h / 2) * n, hh = (s.w / 2) * n + (s.h / 2) * c;
  return { l: s.x - hw, r: s.x + hw, t: s.y - hh, b: s.y + hh };
}
function union(list) {
  if (!list.length) return null;
  const bs = list.map(aabb);
  return { l: Math.min(...bs.map((b) => b.l)), r: Math.max(...bs.map((b) => b.r)),
           t: Math.min(...bs.map((b) => b.t)), b: Math.max(...bs.map((b) => b.b)) };
}
const area = (s) => (s.circle ? Math.PI * (s.w / 2) ** 2 : s.w * s.h);
function contains(s, x, y, padMm = 0) {
  const [lx, ly] = worldToLocal(s, x, y);
  if (s.circle) return Math.hypot(lx, ly) <= s.w / 2 + padMm;
  return Math.abs(lx) <= s.w / 2 + padMm && Math.abs(ly) <= s.h / 2 + padMm;
}

// Smaller things sit on top, so a phone laid on a sheet of paper stays visible and clickable.
const drawOrder = () => [...shapes].sort((a, b) => area(b) - area(a));
function hitShape(x, y) {
  const order = drawOrder();
  for (let i = order.length - 1; i >= 0; i--) if (contains(order[i], x, y, 2 / view.z)) return order[i];
  return null;
}

// handles of the selected shape, in screen px
function handles(s) {
  const out = [];
  if (!s.circle) {
    const top = s.h / 2 + 30 / view.z;
    out.push({ type: "rotate", p: toScreen(...localToWorld(s, 0, -top)), stem: toScreen(...localToWorld(s, 0, -s.h / 2)) });
  }
  if (!s.src && !s.circle) {
    for (const sx of [-1, 0, 1]) for (const sy of [-1, 0, 1]) {
      if (!sx && !sy) continue;
      out.push({ type: "resize", sx, sy, p: toScreen(...localToWorld(s, (sx * s.w) / 2, (sy * s.h) / 2)) });
    }
  }
  return out;
}
function hitHandle(px, py) {
  const s = sel();
  if (!s) return null;
  for (const h of handles(s)) if (Math.hypot(px - h.p[0], py - h.p[1]) <= (h.type === "rotate" ? 11 : 9)) return h;
  return null;
}

// Browser zoom changes how big a CSS pixel is, and dragging the window to another monitor
// changes the display. Either way, re-derive calib and keep the zoom percentage, so a calibrated
// 100% stays true size.
function syncDisplay() {
  const key = displayKey();
  if (key !== display) { display = key; devicePxPerMm = calibrationFor(key); }
  const next = devicePxPerMm ? devicePxPerMm / (window.devicePixelRatio || 1) : DEFAULT_CALIB;
  if (Math.abs(next - calib) < 1e-9) return;
  view = { ...view, z: view.z * (next / calib) };
  calib = next;
  syncZoom();
  draw();
}

// ---------------------------------------------------------------- drawing

function resize() {
  const r = wrap.getBoundingClientRect();
  W = Math.round(r.width); H = Math.round(r.height);
  dpr = window.devicePixelRatio || 1;
  syncDisplay();
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.style.width = W + "px"; canvas.style.height = H + "px";
  draw();
}

let drawQueued = false;
function draw() {
  if (drawQueued) return;
  drawQueued = true;
  requestAnimationFrame(() => { drawQueued = false; render(); });
}

function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = MAT;
  ctx.fillRect(0, 0, W, H);
  drawGrid();
  for (const s of drawOrder()) drawShape(s);
  for (const s of drawOrder()) drawLabel(s);
  const s = sel();
  if (s) { drawDims(s, true); drawSelection(s); }
  drawGuides();
  if (rotating) drawRotateReadout();
  drawRulers();
  $("empty").hidden = shapes.length > 0;
}

// grid levels: the finest one at least ~7px apart is drawn faintly, the next one up boldly
function gridLevels() {
  return metric() ? [1, 10, 100, 1000, 10000, 100000] : [MM_PER_IN / 16, MM_PER_IN / 4, MM_PER_IN, MM_PER_IN * 12, MM_PER_IN * 120, MM_PER_IN * 1200];
}
function gridSteps() {
  const lv = gridLevels();
  let i = lv.findIndex((v) => v * view.z >= 7);
  if (i < 0) i = lv.length - 2;
  return { minor: lv[i], major: lv[Math.min(i + 1, lv.length - 1)] };
}
function drawGrid() {
  const { minor, major } = gridSteps();
  const [x0, y0] = toWorld(0, 0), [x1, y1] = toWorld(W, H);
  const lines = (stepMm, color, width) => {
    ctx.beginPath();
    // step by line index rather than adding stepMm, so fractional-inch steps don't drift
    for (let k = Math.ceil(x0 / stepMm); k * stepMm <= x1; k++) {
      const sx = Math.round(toScreen(k * stepMm, 0)[0]) + 0.5; ctx.moveTo(sx, 0); ctx.lineTo(sx, H);
    }
    for (let k = Math.ceil(y0 / stepMm); k * stepMm <= y1; k++) {
      const sy = Math.round(toScreen(0, k * stepMm)[1]) + 0.5; ctx.moveTo(0, sy); ctx.lineTo(W, sy);
    }
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
  };
  lines(minor, GRID_MINOR, 1);
  lines(major, GRID_MAJOR, 1);
}

// numbers along the top and left edges, like the border print on a cutting mat, always in the
// chosen unit. Feet read like a tape measure (1′6″), since 0.083 ft per inch line is unreadable.
const FRACTIONS = { 0.25: "¼", 0.5: "½", 0.75: "¾" };
function rulerText(mm) {
  if (unit !== "ft") return trim((mm / UNITS[unit].mm).toFixed(4));
  const sign = mm < 0 ? "-" : "";
  const inches = Math.round((Math.abs(mm) / MM_PER_IN) * 16) / 16;
  const ft = Math.floor(inches / 12 + 1e-9);
  const rest = inches - ft * 12, whole = Math.floor(rest + 1e-9), frac = rest - whole;
  const fracText = frac ? FRACTIONS[frac] || trim(frac.toFixed(4)).slice(1) : "";
  const inText = rest ? `${whole || ""}${fracText}″` : "";
  if (!ft) return inText ? sign + inText : "0";
  return sign + `${ft}′` + inText;
}
function drawRulers() {
  // number the faint lines too when they're far enough apart; metric majors are 10 apart, which
  // otherwise leaves long stretches with no numbers
  const steps = gridSteps();
  const major = steps.minor * view.z >= 24 ? steps.minor : steps.major;
  const [x0, y0] = toWorld(0, 0), [x1, y1] = toWorld(W, H);
  ctx.font = "500 10.5px 'IBM Plex Mono', monospace";
  ctx.fillStyle = ACCENT;
  ctx.globalAlpha = 0.75;
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  let lastX = -1e9;
  for (let k = Math.ceil(x0 / major); k * major <= x1; k++) {
    const sx = toScreen(k * major, 0)[0];
    const t = rulerText(k * major);
    if (sx - lastX < ctx.measureText(t).width + 10 || sx < 30) continue;
    ctx.fillText(t, sx + 3, 4); lastX = sx;
  }
  ctx.textBaseline = "bottom";
  let lastY = -1e9;
  for (let k = Math.ceil(y0 / major); k * major <= y1; k++) {
    const sy = toScreen(0, k * major)[1];
    if (sy - lastY < 22 || sy < 24) continue;
    ctx.fillText(rulerText(k * major), 4, sy - 2); lastY = sy;
  }
  ctx.textBaseline = "top";
  ctx.fillText(unit, 4, 4);
  ctx.globalAlpha = 1;
}

function strokeColor(s) { return s.color || CHALK; }

// A can's side view, measured off a photo of a 12 oz can: a rolled rim a bit narrower than the
// body, a neck that curves out to the full width about 1/7 of the way down, a straight body, and
// a bottom that curves in to a narrower base. Fractions of the width (from the center line) and
// of the height (from the top). Shared by the mat and the shelf thumbnail.
const CAN_RIGHT = [
  ["L", 0.449, 0], ["L", 0.449, 0.012], ["L", 0.442, 0.02],
  ["C", 0.45, 0.065, 0.5, 0.095, 0.5, 0.142],
  ["L", 0.5, 0.925],
  ["C", 0.5, 0.97, 0.45, 0.99, 0.378, 1],
];
const CAN_SHOULDER = 0.142, CAN_RIM = 0.02;
function canCommands(w, h) {
  const X = (u) => u * w, Y = (v) => (v - 0.5) * h;
  const out = [["M", X(-0.449), Y(0)]];
  for (const [c, ...a] of CAN_RIGHT) out.push([c, ...a.map((n, i) => (i % 2 ? Y(n) : X(n)))]);
  // the left side is the right side mirrored, walked backwards
  // (segment 0 is the top edge, which closePath draws)
  const pts = [[-0.449, 0], ...CAN_RIGHT.map((c) => c.slice(-2))];
  const [bx, by] = pts.at(-1);
  out.push(["L", X(-bx), Y(by)]);
  for (let i = CAN_RIGHT.length - 1; i >= 1; i--) {
    const [c, ...a] = CAN_RIGHT[i];
    const [ex, ey] = pts[i];
    if (c === "L") out.push(["L", X(-ex), Y(ey)]);
    else out.push(["C", X(-a[2]), Y(a[3]), X(-a[0]), Y(a[1]), X(-ex), Y(ey)]);
  }
  return out;
}
const canSvgPath = (w, h) => canCommands(w, h).map(([c, ...a]) => c + a.map((n) => +n.toFixed(2)).join(" ")).join("") + "Z";

const passportImg = new Image();
passportImg.src = "passport.webp";
passportImg.onload = () => draw();

function shapePath(s) {
  const { w, h } = s;
  ctx.beginPath();
  if (s.circle) { ctx.arc(0, 0, w / 2, 0, Math.PI * 2); return; }
  if (s.kind === "can") {
    for (const [c, ...a] of canCommands(w, h)) {
      if (c === "M") ctx.moveTo(...a); else if (c === "L") ctx.lineTo(...a); else ctx.bezierCurveTo(...a);
    }
    ctx.closePath();
    return;
  }
  const r = Math.min(s.r, w / 2, h / 2);
  // a passport's spine edge is square; only the outer corners are rounded
  ctx.roundRect(-w / 2, -h / 2, w, h, s.kind === "passport" ? [0, r, r, 0] : r);
}

// small details that make a reference recognizable at a glance; all in the shape's local mm
function shapeDetail(s) {
  const { w, h } = s;
  ctx.beginPath();
  switch (s.kind) {
    case "phone": case "tablet": {
      const inset = s.kind === "phone" ? 1.6 : 6;
      ctx.roundRect(-w / 2 + inset, -h / 2 + inset, w - 2 * inset, h - 2 * inset, Math.max(0, s.r - inset));
      break;
    }
    case "foldable": // inner screen, and the hinge down the middle
      ctx.roundRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4, Math.max(0, s.r - 2));
      ctx.moveTo(0, -h / 2 + 2); ctx.lineTo(0, h / 2 - 2);
      break;
    case "laptop":
      ctx.roundRect(-w / 2 + 25, -h / 2 + 12, w - 50, h * 0.45, 2);
      ctx.roundRect(-w * 0.2, h / 2 - h * 0.33, w * 0.4, h * 0.26, 3);
      break;
    case "card": ctx.roundRect(-w / 2 + 9, -6, 12, 9, 1.5); break;
    case "bill":
      ctx.rect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8);
      ctx.moveTo(15, 0); ctx.ellipse(0, 0, 15, 19, 0, 0, Math.PI * 2);
      break;
    case "can": {
      // where the rim is rolled, and where the straight wall starts
      const rim = (CAN_RIM - 0.5) * h, sh = (CAN_SHOULDER - 0.5) * h;
      ctx.moveTo(-w * 0.442, rim); ctx.lineTo(w * 0.442, rim);
      ctx.moveTo(-w / 2, sh); ctx.lineTo(w / 2, sh);
      break;
    }
    case "can-top":
      ctx.arc(0, 0, w * 0.41, 0, Math.PI * 2);
      ctx.moveTo(6, -w * 0.22); ctx.roundRect(-6, -w * 0.3, 12, w * 0.3, 5);
      break;
    case "coin": ctx.arc(0, 0, w * 0.42, 0, Math.PI * 2); break;
    case "disc": ctx.moveTo(w * 0.125, 0); ctx.arc(0, 0, w * 0.125, 0, Math.PI * 2); ctx.moveTo(7.5, 0); ctx.arc(0, 0, 7.5, 0, Math.PI * 2); break;
    case "battery":
      ctx.rect(-2.75, -h / 2 - 1.5, 5.5, 1.5);
      ctx.moveTo(-w / 2, -h * 0.2); ctx.lineTo(w / 2, -h * 0.2);
      break;
    default: return false;
  }
  return true;
}

function drawShape(s) {
  const [sx, sy] = toScreen(s.x, s.y);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(rad(s.a));
  ctx.scale(view.z, view.z);
  const col = strokeColor(s);
  const hot = s.id === hoverId && s.id !== selId;
  shapePath(s);
  if (s.kind === "passport" && passportImg.complete && passportImg.naturalWidth) {
    ctx.save(); ctx.clip();
    ctx.drawImage(passportImg, -s.w / 2, -s.h / 2, s.w, s.h);
    ctx.restore();
  } else {
    ctx.globalAlpha = s.color ? 0.2 : 0.07;
    ctx.fillStyle = col; ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.lineWidth = (hot ? 2.5 : 1.6) / view.z;
  ctx.strokeStyle = col; ctx.stroke();
  if (shapeDetail(s)) {
    ctx.globalAlpha = 0.45; ctx.lineWidth = 1.1 / view.z; ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawLabel(s) {
  if (!s.name) return;
  // the cover already says PASSPORT
  if (s.kind === "passport" && s.name === BY_ID.passport.name && passportImg.naturalWidth) return;
  const [sx, sy] = toScreen(s.x, s.y);
  const b = aabb(s);
  const boxW = (b.r - b.l) * view.z, boxH = (b.b - b.t) * view.z;
  ctx.font = "600 13px 'Barlow Semi Condensed', sans-serif";
  const tw = ctx.measureText(s.name).width;
  if (tw + 8 > Math.min(boxW, s.circle ? s.w * view.z * 0.8 : Infinity) || boxH < 18) return;
  // big things get their name near the top, so it doesn't land under whatever sits on them
  const upright = s.a % 90 === 0 && !s.circle && s.kind !== "can";
  const y = boxH > 140 && upright ? toScreen(0, b.t)[1] + 22 : sy;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.lineWidth = 4; ctx.strokeStyle = MAT; ctx.globalAlpha = 0.85; ctx.lineJoin = "round";
  ctx.strokeText(s.name, sx, y);
  ctx.globalAlpha = 1;
  ctx.fillStyle = strokeColor(s);
  ctx.fillText(s.name, sx, y);
}

// engineering-drawing dimension: extension lines from the edge, an arrowed line, the length in the gap
function dimLine(a, b, outward, text, color, strong) {
  const off = 18;
  const [ox, oy] = outward;
  const A = [a[0] + ox * off, a[1] + oy * off], B = [b[0] + ox * off, b[1] + oy * off];
  ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.globalAlpha = strong ? 1 : 0.7;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(a[0] + ox * 4, a[1] + oy * 4); ctx.lineTo(a[0] + ox * (off + 5), a[1] + oy * (off + 5));
  ctx.moveTo(b[0] + ox * 4, b[1] + oy * 4); ctx.lineTo(b[0] + ox * (off + 5), b[1] + oy * (off + 5));
  ctx.stroke();
  const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const ux = (B[0] - A[0]) / len, uy = (B[1] - A[1]) / len;
  ctx.font = `${strong ? 500 : 400} 11.5px 'IBM Plex Mono', monospace`;
  const tw = ctx.measureText(text).width;
  const fits = len > tw + 30;
  const mid = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
  ctx.beginPath();
  if (fits) {
    const g = tw / 2 + 6;
    ctx.moveTo(...A); ctx.lineTo(mid[0] - ux * g, mid[1] - uy * g);
    ctx.moveTo(mid[0] + ux * g, mid[1] + uy * g); ctx.lineTo(...B);
  } else { ctx.moveTo(...A); ctx.lineTo(...B); }
  ctx.stroke();
  const arrow = (P, dx, dy) => {
    ctx.beginPath();
    ctx.moveTo(P[0], P[1]);
    ctx.lineTo(P[0] + dx * 7 - dy * 2.6, P[1] + dy * 7 + dx * 2.6);
    ctx.lineTo(P[0] + dx * 7 + dy * 2.6, P[1] + dy * 7 - dx * 2.6);
    ctx.closePath(); ctx.fill();
  };
  if (len > 16) { arrow(A, ux, uy); arrow(B, -ux, -uy); }
  // text, rotated with the line but never upside down
  let ang = Math.atan2(uy, ux);
  if (ang > Math.PI / 2 + 1e-6 || ang < -Math.PI / 2 - 1e-6) ang += Math.PI;
  ctx.save();
  const at = fits ? mid : [mid[0] + ox * 14, mid[1] + oy * 14];
  ctx.translate(at[0], at[1]); ctx.rotate(ang);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  if (!fits) { ctx.lineWidth = 4; ctx.strokeStyle = MAT; ctx.strokeText(text, 0, 0); }
  ctx.fillText(text, 0, 0);
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawDims(s, strong) {
  const color = strong ? ACCENT : strokeColor(s);
  if (s.circle) {
    const [cx, cy] = toScreen(s.x, s.y), r = (s.w / 2) * view.z;
    dimLine([cx - r, cy + r], [cx + r, cy + r], [0, 1], "⌀ " + fmtLen(s.w), color, strong);
    return;
  }
  const c = Math.cos(rad(s.a)), n = Math.sin(rad(s.a));
  // pick the bottom-most edge for width and the right-most for height, whatever the rotation
  const down = [-n, c], right = [c, n];
  const wSide = down[1] >= 0 ? 1 : -1, hSide = right[0] >= 0 ? 1 : -1;
  const p = (lx, ly) => toScreen(...localToWorld(s, lx, ly));
  dimLine(p(-s.w / 2, (wSide * s.h) / 2), p(s.w / 2, (wSide * s.h) / 2), [down[0] * wSide, down[1] * wSide], fmtLen(s.w), color, strong);
  dimLine(p((hSide * s.w) / 2, -s.h / 2), p((hSide * s.w) / 2, s.h / 2), [right[0] * hSide, right[1] * hSide], fmtLen(s.h), color, strong);
}

function drawSelection(s) {
  ctx.save();
  const [sx, sy] = toScreen(s.x, s.y);
  ctx.translate(sx, sy); ctx.rotate(rad(s.a)); ctx.scale(view.z, view.z);
  shapePath(s);
  ctx.lineWidth = 2.5 / view.z; ctx.strokeStyle = ACCENT; ctx.stroke();
  ctx.restore();
  for (const h of handles(s)) {
    if (h.type === "rotate") {
      ctx.beginPath(); ctx.moveTo(...h.stem); ctx.lineTo(...h.p);
      ctx.strokeStyle = ACCENT; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.beginPath(); ctx.arc(h.p[0], h.p[1], 6.5, 0, Math.PI * 2);
      ctx.fillStyle = ACCENT; ctx.fill();
    } else {
      ctx.beginPath(); ctx.rect(h.p[0] - 4.5, h.p[1] - 4.5, 9, 9);
      ctx.fillStyle = MAT; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = ACCENT; ctx.stroke();
    }
  }
}

function drawGuides() {
  ctx.strokeStyle = ACCENT; ctx.lineWidth = 1; ctx.setLineDash([4, 4]); ctx.globalAlpha = 0.9;
  for (const g of guides) {
    ctx.beginPath();
    if (g.axis === "x") { const sx = toScreen(g.v, 0)[0]; ctx.moveTo(sx, toScreen(0, g.a)[1]); ctx.lineTo(sx, toScreen(0, g.b)[1]); }
    else { const sy = toScreen(0, g.v)[1]; ctx.moveTo(toScreen(g.a, 0)[0], sy); ctx.lineTo(toScreen(g.b, 0)[0], sy); }
    ctx.stroke();
  }
  ctx.setLineDash([]); ctx.globalAlpha = 1;
}

// while rotating: spokes every 45° around the center (the snap targets), and the angle
function drawRotateReadout() {
  const { cx, cy, angle, snapped } = rotating;
  const s = sel();
  const R = Math.max(s.w, s.h) / 2 * view.z + 48;
  ctx.save();
  ctx.translate(cx, cy);
  for (let k = 0; k < 8; k++) {
    const t = rad(k * 45 - 90);
    const on = snapped && ((((angle - k * 45) % 360) + 360) % 360) < 0.01;
    ctx.beginPath(); ctx.moveTo(Math.cos(t) * R * 0.25, Math.sin(t) * R * 0.25); ctx.lineTo(Math.cos(t) * R, Math.sin(t) * R);
    ctx.strokeStyle = ACCENT; ctx.globalAlpha = on ? 0.9 : 0.22; ctx.lineWidth = on ? 1.5 : 1; ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const t = rad(angle - 90);
  ctx.font = "500 13px 'IBM Plex Mono', monospace";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const tx = Math.cos(t) * (R + 18), ty = Math.sin(t) * (R + 18);
  const text = trim(angle.toFixed(1)) + "°";
  ctx.lineWidth = 4; ctx.strokeStyle = MAT; ctx.strokeText(text, tx, ty);
  ctx.fillStyle = ACCENT; ctx.fillText(text, tx, ty);
  ctx.restore();
}

// ---------------------------------------------------------------- placing and arranging

// a new thing goes to the right of everything already down, bottoms level
function place(s) {
  const u = union(shapes);
  if (!u) { s.x = view.x; s.y = view.y; }
  else {
    const b = aabb({ ...s, x: 0, y: 0 });
    s.x = u.r + GAP_MM - b.l;
    s.y = u.b - b.b;
  }
  shapes.push(s);
  selId = s.id;
  if (W && !inView(aabb(s))) fit(true);
}
function inView(b) {
  const [l, t] = toWorld(20, 60), [r, bt] = toWorld(W - 20, H - 110);
  return b.l >= l && b.r <= r && b.t >= t && b.b <= bt;
}

function lineUp() {
  if (!shapes.length) return;
  const prev = serialize();
  const order = [...shapes].sort((a, b) => aabb(a).l - aabb(b).l);
  let x = 0;
  for (const s of order) {
    const b = aabb({ ...s, x: 0, y: 0 });
    s.x = x - b.l; s.y = -b.b;
    x += b.r - b.l + GAP_MM;
  }
  commit(prev);
  fit(true);
}

// ---------------------------------------------------------------- view

let anim = 0;
function setView(target, animate) {
  cancelAnimationFrame(anim);
  if (!animate) { view = target; afterView(); return; }
  const from = { ...view }, t0 = performance.now(), dur = 260;
  const tick = (now) => {
    const k = Math.min(1, (now - t0) / dur), e = 1 - (1 - k) ** 3;
    // zoom eases in log space so it doesn't lurch at large ratios
    view = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e,
             z: from.z * (target.z / from.z) ** e };
    afterView();
    if (k < 1) anim = requestAnimationFrame(tick);
  };
  anim = requestAnimationFrame(tick);
}
function afterView() { draw(); syncZoom(); save(); }
const clampZ = (z) => Math.min(60, Math.max(0.02, z));

function fit(animate) {
  const u = union(shapes);
  if (!u) { setView({ x: 0, y: 0, z: calib }, animate); return; }
  const top = 70, bottom = W < 760 ? 150 : 130, side = 50;
  const z = clampZ(Math.min((W - 2 * side) / Math.max(u.r - u.l, 1), (H - top - bottom) / Math.max(u.b - u.t, 1)));
  const cx = (u.l + u.r) / 2, cy = (u.t + u.b) / 2 - (top - bottom) / 2 / z;
  setView({ x: cx, y: cy, z }, animate);
}
function zoomAt(px, py, factor, animate) {
  const [wx, wy] = toWorld(px, py);
  const z = clampZ(view.z * factor);
  const target = { z, x: wx - (px - W / 2) / z, y: wy - (py - H / 2) / z };
  setView(target, animate);
}
// back to 100% (true size once calibrated), centered on the selection, or on everything
function home() {
  const s = sel(), u = union(shapes);
  const c = s ? [s.x, s.y] : u ? [(u.l + u.r) / 2, (u.t + u.b) / 2] : [0, 0];
  setView({ x: c[0], y: c[1], z: calib }, true);
}

// ---------------------------------------------------------------- pointer input

let drag = null;
const pointers = new Map();
let pinch = null;

const evPos = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

canvas.addEventListener("pointerdown", (e) => {
  if (e.button !== 0 && e.pointerType === "mouse") {
    if (e.button === 1) { drag = { mode: "pan", start: evPos(e), view0: { ...view } }; canvas.setPointerCapture(e.pointerId); }
    return;
  }
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, evPos(e));
  if (pointers.size === 2) { startPinch(); return; }
  if (pointers.size > 2) return;

  const [px, py] = evPos(e);
  const [wx, wy] = toWorld(px, py);
  const prev = serialize();
  const h = hitHandle(px, py);
  const s = sel();
  if (h && h.type === "rotate") {
    drag = { mode: "rotate", prev };
  } else if (h && h.type === "resize") {
    drag = { mode: "resize", prev, h, s0: { ...s } };
  } else {
    const hit = hitShape(wx, wy);
    if (hit) {
      selId = hit.id;
      drag = { mode: "move", prev, start: [wx, wy], s0: { ...hit }, moved: false };
      syncUI();
    } else {
      drag = { mode: "pan", start: [px, py], view0: { ...view }, moved: false };
    }
  }
  draw();
});

function startPinch() {
  const [a, b] = [...pointers.values()];
  pinch = { d0: Math.hypot(a[0] - b[0], a[1] - b[1]), view0: { ...view }, mid0: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
  if (drag && drag.prev) { const p = drag.prev; drag = null; commit(p); }
  drag = null; guides = []; rotating = null;
}

canvas.addEventListener("pointermove", (e) => {
  const pos = evPos(e);
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, pos);
  if (pinch && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const v0 = pinch.view0;
    const z = clampZ(v0.z * d / pinch.d0);
    const wx = (pinch.mid0[0] - W / 2) / v0.z + v0.x, wy = (pinch.mid0[1] - H / 2) / v0.z + v0.y;
    view = { z, x: wx - (mid[0] - W / 2) / z, y: wy - (mid[1] - H / 2) / z };
    afterView();
    return;
  }
  if (!drag) { updateHover(pos[0], pos[1]); return; }
  dragMove(pos, e.shiftKey);
});

function updateHover(px, py) {
  const h = hitHandle(px, py);
  const s = h ? null : hitShape(...toWorld(px, py));
  const id = s ? s.id : null;
  canvas.style.cursor = h ? (h.type === "rotate" ? "alias" : resizeCursor(h)) : s ? "move" : "grab";
  if (id !== hoverId) { hoverId = id; draw(); }
}
function resizeCursor(h) {
  const s = sel();
  const ang = ((Math.atan2(h.sy, h.sx) * 180) / Math.PI + s.a + 360) % 180;
  return ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"][Math.round(ang / 45) % 4];
}

function dragMove(pos, free) {
  const [px, py] = pos;
  const [wx, wy] = toWorld(px, py);
  const s = sel();
  if (drag.mode === "pan") {
    const v0 = drag.view0;
    if (Math.hypot(px - drag.start[0], py - drag.start[1]) > 3) drag.moved = true;
    view = { ...v0, x: v0.x - (px - drag.start[0]) / v0.z, y: v0.y - (py - drag.start[1]) / v0.z };
    canvas.style.cursor = "grabbing";
    afterView();
  } else if (drag.mode === "move" && s) {
    s.x = drag.s0.x + wx - drag.start[0];
    s.y = drag.s0.y + wy - drag.start[1];
    drag.moved = true;
    guides = free ? [] : snapAlign(s);
    syncInspector();
    draw();
  } else if (drag.mode === "rotate" && s) {
    const [cx, cy] = toScreen(s.x, s.y);
    let a = (Math.atan2(py - cy, px - cx) * 180) / Math.PI + 90;
    a = ((a % 360) + 360) % 360;
    const near = Math.round(a / 45) * 45;
    const snapped = !free && Math.abs(a - near) <= SNAP_DEG;
    if (snapped) a = near % 360;
    else a = Math.round(a * 10) / 10;
    s.a = a;
    rotating = { cx, cy, angle: a, snapped };
    syncInspector();
    draw();
  } else if (drag.mode === "resize" && s) {
    const s0 = drag.s0, { sx, sy } = drag.h;
    const [lx, ly] = worldToLocal(s0, wx, wy);
    let w = s0.w, h = s0.h;
    if (sx) w = snapLen(sx * lx + s0.w / 2);
    if (sy) h = snapLen(sy * ly + s0.h / 2);
    if (sx && sy && free) { // Shift on a corner keeps the proportions
      const k = Math.max(w / s0.w, h / s0.h);
      w = s0.w * k; h = s0.h * k;
    }
    const clx = sx ? (sx * (w - s0.w)) / 2 : 0, cly = sy ? (sy * (h - s0.h)) / 2 : 0;
    const [nx, ny] = localToWorld(s0, clx, cly);
    Object.assign(s, { w, h, x: nx, y: ny });
    syncInspector();
    draw();
  }
}

// line up edges and centers with the other shapes' bounding boxes
function snapAlign(s) {
  const out = [];
  const b = aabb(s);
  const tol = SNAP_PX / view.z;
  for (const axis of ["x", "y"]) {
    const mine = axis === "x" ? [b.l, (b.l + b.r) / 2, b.r] : [b.t, (b.t + b.b) / 2, b.b];
    let best = null;
    for (const o of shapes) {
      if (o.id === s.id) continue;
      const ob = aabb(o);
      const theirs = axis === "x" ? [ob.l, (ob.l + ob.r) / 2, ob.r] : [ob.t, (ob.t + ob.b) / 2, ob.b];
      for (const m of mine) for (const t of theirs) {
        const d = t - m;
        if (Math.abs(d) <= tol && (!best || Math.abs(d) < Math.abs(best.d) - 1e-9)) best = { d, v: t, ob };
      }
    }
    if (best) {
      if (axis === "x") s.x += best.d; else s.y += best.d;
    }
  }
  // report every line that's now exactly shared, for drawing
  const nb = aabb(s);
  for (const o of shapes) {
    if (o.id === s.id) continue;
    const ob = aabb(o);
    for (const m of [nb.l, (nb.l + nb.r) / 2, nb.r]) for (const t of [ob.l, (ob.l + ob.r) / 2, ob.r])
      if (Math.abs(m - t) < 1e-6) out.push({ axis: "x", v: t, a: Math.min(nb.t, ob.t) - 6, b: Math.max(nb.b, ob.b) + 6 });
    for (const m of [nb.t, (nb.t + nb.b) / 2, nb.b]) for (const t of [ob.t, (ob.t + ob.b) / 2, ob.b])
      if (Math.abs(m - t) < 1e-6) out.push({ axis: "y", v: t, a: Math.min(nb.l, ob.l) - 6, b: Math.max(nb.r, ob.r) + 6 });
  }
  return out;
}

function endDrag(e) {
  pointers.delete(e.pointerId);
  if (pinch) { if (pointers.size < 2) pinch = null; return; }
  if (!drag) return;
  const d = drag; drag = null;
  guides = []; rotating = null;
  if (d.mode === "pan" && !d.moved) { selId = null; syncUI(); }
  if (d.prev) commit(d.prev);
  canvas.style.cursor = "grab";
  draw();
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("pointerleave", () => { if (!drag && hoverId != null) { hoverId = null; draw(); } });

// trackpads pan with two fingers and zoom with a pinch (which arrives as ctrl+wheel);
// a mouse wheel moves in whole notches, so treat those as zoom too
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const [px, py] = evPos(e);
  const notchy = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 40 && Number.isInteger(e.deltaY));
  if (e.ctrlKey || notchy) {
    const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    zoomAt(px, py, Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0022)), false);
  } else {
    view = { ...view, x: view.x + e.deltaX / view.z, y: view.y + e.deltaY / view.z };
    afterView();
  }
}, { passive: false });

// ---------------------------------------------------------------- shelf

const shelf = $("shelf");
const isPhone = () => window.matchMedia("(max-width: 760px)").matches;

function thumb(it, scale) {
  const w = it.w * scale, h = it.h * scale;
  const col = it.colored ? "#9fb6aa" : CHALK;
  let shape;
  if (it.circle) shape = `<circle cx="0" cy="0" r="${w / 2}" />`;
  else if (it.kind === "can") shape = `<path d="${canSvgPath(w, h)}" />`;
  else if (it.kind === "passport") {
    return `<svg width="60" height="46" viewBox="-30 -23 60 46"><image href="passport.webp" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" preserveAspectRatio="none" /></svg>`;
  } else shape = `<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${Math.min(it.r * scale, w / 2)}" />`;
  return `<svg width="60" height="46" viewBox="-30 -23 60 46"><g fill="${col}" fill-opacity=".14" stroke="${col}" stroke-width="1.1">${shape}</g></svg>`;
}

function buildShelf() {
  const lib = $("library");
  lib.innerHTML = "";
  let closed = [];
  try { closed = JSON.parse(localStorage.getItem(LS_CLOSED)) || []; } catch {}
  // your own rectangles come first, as their own section, once there are any
  const groups = customs.length
    ? [{ name: "Custom", custom: true, items: customs }, ...LIBRARY]
    : LIBRARY;
  for (const g of groups) {
    // one scale per group, so the thumbnails within a group compare honestly
    const scale = Math.min(...g.items.map((it) => Math.min(56 / it.w, 42 / it.h)));
    const group = document.createElement("details");
    group.className = "ts-group";
    group.open = !closed.includes(g.name);
    group.innerHTML = `<summary class="ts-group-name" title="Show or hide ${g.name.toLowerCase()}">${g.name}</summary>`;
    group.addEventListener("toggle", () => {
      const names = [...lib.querySelectorAll(".ts-group")].filter((d) => !d.open).map((d) => d.querySelector("summary").textContent);
      try { localStorage.setItem(LS_CLOSED, JSON.stringify(names)); } catch {}
    });
    lib.appendChild(group);
    for (const raw of g.items) {
      const it = g.custom ? { ...raw, r: 0, kind: "plain", colored: true } : BY_ID[raw.id];
      const label = it.name || "Rectangle";
      const b = document.createElement("button");
      b.className = "ts-item";
      b.dataset.id = it.id;
      b.dataset.w = it.w; b.dataset.h = it.h;
      if (it.circle) b.dataset.circle = "";
      b.title = `${label}: click to add it, or drag it onto the mat`;
      b.innerHTML = `${thumb(it, scale)}<span><span class="ts-item-name">${escapeHtml(label)}</span><span class="ts-item-dims"></span></span>`;
      if (g.custom) {
        const row = document.createElement("div");
        row.className = "ts-custom-entry";
        const del = document.createElement("button");
        del.className = "ts-icon ts-custom-del";
        del.title = `Remove ${label} from the shelf (anything already on the mat stays)`;
        del.setAttribute("aria-label", `Remove ${label}`);
        del.innerHTML = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l8 8M14 6l-8 8"/></svg>`;
        del.addEventListener("click", () => { customs = customs.filter((c) => c.id !== it.id); saveCustoms(); buildShelf(); });
        row.append(b, del);
        group.appendChild(row);
        wireShelfItem(b, { kind: "plain", w: it.w, h: it.h, name: it.name });
      } else {
        group.appendChild(b);
        wireShelfItem(b, { src: it.id });
      }
    }
  }
  syncShelfDims();
}
function syncShelfDims() {
  for (const b of document.querySelectorAll(".ts-item")) {
    const w = +b.dataset.w, h = +b.dataset.h;
    b.querySelector(".ts-item-dims").textContent = "circle" in b.dataset ? `⌀ ${fmtLen(w)}` : `${fmtNum(w)} × ${fmtLen(h)}`;
  }
}
const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// rectangles you've typed in, kept in this browser
let customs = [];
try { customs = JSON.parse(localStorage.getItem(LS_CUSTOM)) || []; } catch {}
function saveCustoms() { try { localStorage.setItem(LS_CUSTOM, JSON.stringify(customs)); } catch {} }
function rememberCustom(w, h, name) {
  const same = (c) => Math.abs(c.w - w) < 1e-6 && Math.abs(c.h - h) < 1e-6 && c.name === name;
  if (customs.some(same)) return;
  customs.unshift({ id: "custom-" + Date.now().toString(36), name, w, h });
  saveCustoms();
  buildShelf();
}

// click adds it beside what's there; dragging it out of the shelf drops it where you let go
// spec is what makeShape gets: { src } for a library object, or a plain size for a custom one
function wireShelfItem(btn, spec) {
  btn.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const start = [e.clientX, e.clientY];
    const prev = serialize();
    let s = null;
    btn.setPointerCapture(e.pointerId);
    const move = (ev) => {
      if (!s) {
        if (Math.hypot(ev.clientX - start[0], ev.clientY - start[1]) < 6) return;
        // on a phone the sheet is in the way; only start once the finger leaves it, upward
        if (isPhone() && ev.clientY > shelf.getBoundingClientRect().top - 10) return;
        if (!isPhone() && ev.clientX < shelf.getBoundingClientRect().right) return;
        s = makeShape(spec);
        shapes.push(s); selId = s.id;
        if (isPhone()) shelf.classList.remove("is-open");
      }
      const r = canvas.getBoundingClientRect();
      const [wx, wy] = toWorld(ev.clientX - r.left, ev.clientY - r.top);
      s.x = wx; s.y = wy;
      guides = ev.shiftKey ? [] : snapAlign(s);
      syncUI(); draw();
    };
    const up = (ev) => {
      btn.removeEventListener("pointermove", move);
      btn.removeEventListener("pointerup", up);
      btn.removeEventListener("pointercancel", up);
      guides = [];
      if (s) {
        const r = canvas.getBoundingClientRect();
        const outside = ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom ||
          (!isPhone() && ev.clientX < shelf.getBoundingClientRect().right);
        if (outside || ev.type === "pointercancel") { shapes = shapes.filter((x) => x !== s); selId = null; changed(); return; }
        commit(prev);
      } else if (ev.type === "pointerup") {
        place(makeShape(spec));
        if (isPhone()) shelf.classList.remove("is-open");
        commit(prev);
      }
    };
    btn.addEventListener("pointermove", move);
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointercancel", up);
  });
  btn.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    const prev = serialize(); place(makeShape(spec)); commit(prev);
  });
}

$("custom-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const u = okUnit($("custom-unit").value);
  const w = parseLen($("custom-w").value, u), h = parseLen($("custom-h").value, u);
  if (!w || !h) { (w ? $("custom-h") : $("custom-w")).focus(); toast("Type a width and a height"); return; }
  const name = $("custom-name").value.trim();
  const prev = serialize();
  place(makeShape({ kind: "plain", w, h, name }));
  commit(prev);
  rememberCustom(w, h, name);
  $("custom-name").value = "";
  if (isPhone()) shelf.classList.remove("is-open");
});

$("open-shelf").addEventListener("click", () => shelf.classList.add("is-open"));
$("close-shelf").addEventListener("click", () => shelf.classList.remove("is-open"));

// ---------------------------------------------------------------- inspector

function syncUI() { syncInspector(); syncBar(); }
function syncInspector() {
  const s = sel();
  const el = $("inspector");
  el.hidden = !s;
  if (!s) return;
  const sw = $("insp-color");
  sw.style.background = strokeColor(s);
  sw.disabled = !s.color;
  sw.style.cursor = s.color ? "pointer" : "default";
  setField($("insp-name"), s.name);
  setField($("insp-w"), fmtNum(s.w));
  setField($("insp-h"), fmtNum(s.h));
  $("insp-h").disabled = s.circle;
  $("insp-w").title = s.circle ? "Diameter" : "Width";
  setField($("insp-a"), trim(s.a.toFixed(1)));
  $("insp-angle-field").style.display = s.circle ? "none" : "";
  $("insp-rot").style.display = s.circle ? "none" : "";
  $("insp-unit").textContent = unit;
  $("insp-facts").innerHTML = s.circle
    ? `area ${fmtArea(area(s))}`
    : `diagonal ${fmtLen(Math.hypot(s.w, s.h))}<br>area ${fmtArea(area(s))}`;
}
// don't stomp on a field while someone is typing in it
function setField(input, v) { if (document.activeElement !== input) input.value = v; }

function editSel(fn) {
  const s = sel(); if (!s) return;
  const prev = serialize();
  fn(s);
  commit(prev);
  syncInspector();
}
$("insp-name").addEventListener("change", (e) => editSel((s) => (s.name = e.target.value.trim())));
$("insp-w").addEventListener("change", (e) => editSel((s) => {
  const v = parseLen(e.target.value); if (!v) return;
  s.w = v; if (s.circle) s.h = v;
}));
$("insp-h").addEventListener("change", (e) => editSel((s) => { const v = parseLen(e.target.value); if (v) s.h = v; }));
$("insp-a").addEventListener("change", (e) => editSel((s) => {
  const v = parseFloat(e.target.value); if (Number.isFinite(v)) s.a = ((v % 360) + 360) % 360;
}));
for (const id of ["insp-name", "insp-w", "insp-h", "insp-a"])
  $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") { e.target.blur(); syncInspector(); } });
$("insp-color").addEventListener("click", () => editSel((s) => {
  if (!s.color) return;
  s.color = COLORS[(COLORS.indexOf(s.color) + 1) % COLORS.length];
}));
$("insp-rot").addEventListener("click", () => rotate90());
$("insp-dup").addEventListener("click", () => duplicate());
$("insp-del").addEventListener("click", () => removeSel());

function rotate90() { editSel((s) => { s.a = (Math.round(s.a / 90) * 90 + 90) % 360; }); }
function duplicate() {
  const s = sel(); if (!s) return;
  const prev = serialize();
  const { id, ...rest } = s;
  const c = { ...rest, id: nextId++, color: s.color ? pickColor() : null };
  const b = aabb(s);
  c.x = s.x + (b.r - b.l) + GAP_MM;
  shapes.push(c); selId = c.id;
  commit(prev);
  if (!inView(aabb(c))) fit(true);
}
function removeSel() {
  const s = sel(); if (!s) return;
  const prev = serialize();
  shapes = shapes.filter((x) => x !== s); selId = null;
  commit(prev);
}

// ---------------------------------------------------------------- top bar

function syncBar() {
  $("undo").disabled = !undoStack.length;
  $("redo").disabled = !redoStack.length;
  $("lineup").disabled = shapes.length < 1;
  $("clear").disabled = !shapes.length;
  $("unit").value = unit;
  syncZoom();
}
function syncZoom() {
  const pct = (view.z / calib) * 100;
  const txt = pct >= 99.5 && pct <= 100.5 ? "100%" : pct >= 10 ? Math.round(pct) + "%" : trim(pct.toFixed(1)) + "%";
  $("zoom-readout").textContent = txt;
}

$("undo").addEventListener("click", undo);
$("redo").addEventListener("click", redo);
$("lineup").addEventListener("click", lineUp);
$("clear").addEventListener("click", () => { const prev = serialize(); shapes = []; selId = null; commit(prev); toast("Cleared. Undo brings it back."); });
$("zoom-in").addEventListener("click", () => zoomAt(W / 2, H / 2, 1.4, true));
$("zoom-out").addEventListener("click", () => zoomAt(W / 2, H / 2, 1 / 1.4, true));
$("zoom-readout").addEventListener("click", () => fit(true));
// 1:1 first measures this screen (remembered), so 100% is true physical size. After that it
// zooms to 100%, and pressing it again while already at 100% measures again.
$("real-size").addEventListener("click", () => {
  const at100 = Math.abs(view.z / calib - 1) < 0.005;
  if (!devicePxPerMm || at100) openCalibration(); else home();
});
$("unit").addEventListener("change", (e) => setUnit(okUnit(e.target.value)));
$("share").addEventListener("click", async () => {
  const url = location.href.split("#")[0] + "#m=" + encodeMat();
  try { await navigator.clipboard.writeText(url); toast("Link copied"); }
  catch { history.replaceState(null, "", url); toast("Link is in the address bar"); }
});
// the add form has its own unit (to type a size in cm while reading inches), but it follows
// the display unit whenever that changes
function setUnit(u) { unit = u; $("custom-unit").value = u; syncShelfDims(); changed(); }

let toastTimer = 0;
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 1600);
}

// ---------------------------------------------------------------- keyboard

window.addEventListener("keydown", (e) => {
  const typing = e.target.matches("input, textarea");
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === "z") { if (typing) return; e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === "y") { if (typing) return; e.preventDefault(); redo(); return; }
  if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); duplicate(); return; }
  if (typing || mod || document.querySelector(".cohesion-modal-backdrop")) return;
  const s = sel();
  if ((e.key === "Delete" || e.key === "Backspace") && s) { e.preventDefault(); removeSel(); }
  else if (e.key === "Escape") { selId = null; changed(); }
  else if ((e.key === "r" || e.key === "R") && s && !s.circle) rotate90();
  else if (e.key === "+" || e.key === "=") zoomAt(W / 2, H / 2, 1.4, true);
  else if (e.key === "-" || e.key === "_") zoomAt(W / 2, H / 2, 1 / 1.4, true);
  else if (e.key === "0") home();
  else if (e.key === "f" || e.key === "F") fit(true);
  else if (e.key.startsWith("Arrow") && s) {
    e.preventDefault();
    const d = step() * (e.shiftKey ? 10 : 1);
    const prev = serialize();
    if (e.key === "ArrowLeft") s.x -= d; if (e.key === "ArrowRight") s.x += d;
    if (e.key === "ArrowUp") s.y -= d; if (e.key === "ArrowDown") s.y += d;
    commit(prev);
  }
});

// ---------------------------------------------------------------- calibration

// CSS pixels aren't a physical size: 96 "px per inch" is a convention, and real screens
// differ. Matching a real object held against the glass measures this screen's px per mm.

// an object's outline at k px per mm, the same silhouette the mat draws
function outlineSvg(it, k) {
  const w = it.w * k, h = it.h * k, r = Math.min(it.r * k, w / 2, h / 2);
  const g = (inner) => `<svg width="${w}" height="${h}" viewBox="${-w / 2} ${-h / 2} ${w} ${h}" style="overflow:visible">${inner}</svg>`;
  const look = `fill="${CHALK}" fill-opacity=".08" stroke="${CHALK}" stroke-width="2"`;
  if (it.circle) return g(`<circle r="${w / 2}" ${look} />`);
  if (it.kind === "can") return g(`<path d="${canSvgPath(w, h)}" ${look} />`);
  if (it.kind === "passport") {
    // square spine on the left, rounded outer corners on the right
    const d = `M${-w / 2} ${-h / 2}H${w / 2 - r}A${r} ${r} 0 0 1 ${w / 2} ${-h / 2 + r}V${h / 2 - r}A${r} ${r} 0 0 1 ${w / 2 - r} ${h / 2}H${-w / 2}Z`;
    return g(`<clipPath id="cal-pp"><path d="${d}"/></clipPath><image href="passport.webp" x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" preserveAspectRatio="none" clip-path="url(#cal-pp)" opacity=".85"/><path d="${d}" fill="none" stroke="${CHALK}" stroke-width="2"/>`);
  }
  return g(`<rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${r}" ${look} />`);
}

function openCalibration() {
  const all = [{ name: "Custom", items: customs.map((c) => ({ ...c, r: 0, kind: "plain" })) }, ...LIBRARY].filter((g) => g.items.length);
  const byId = Object.fromEntries(all.flatMap((g) => g.items.map((it) => [it.id, it])));
  const options = all.map((g) => `<optgroup label="${escapeHtml(g.name)}">` +
    g.items.map((it) => `<option value="${it.id}"${it.id === "credit-card" ? " selected" : ""}>${escapeHtml(it.name || "Rectangle")}</option>`).join("") +
    `</optgroup>`).join("");
  let k = calib;
  let obj = byId["credit-card"];
  const { el, close } = openModal(`
    <div class="ts-calib">
      <h2>Match a real object</h2>
      <p>Hold the object against the screen and drag the yellow dot (or the slider) until the outline matches its edges. A credit card works well; anything in the list does.</p>
      <select id="cal-object" title="The object you're holding up to the screen" aria-label="Object to match">${options}</select>
      <div class="ts-calib-stage"><div class="ts-calib-obj" id="cal-obj"></div></div>
      <input type="range" id="cal-range" min="1.5" max="12" step="0.001" title="Size of the outline on screen" />
      <div class="ts-calib-row">
        <button class="ts-add-btn" id="cal-done">Use this size</button>
        <button class="ts-btn2" id="cal-reset" title="Forget this display's calibration and use the browser's nominal 96 pixels per inch">Reset</button>
      </div>
    </div>`, { className: "ts-calib-modal" });
  const box = el.querySelector("#cal-obj"), range = el.querySelector("#cal-range");
  const show = () => {
    box.innerHTML = outlineSvg(obj, k) + `<div class="grip" id="cal-grip" title="Drag to resize"></div>`;
    box.style.width = obj.w * k + "px"; box.style.height = obj.h * k + "px";
    range.value = k;
    box.querySelector("#cal-grip").addEventListener("pointerdown", dragGrip);
  };
  function dragGrip(e) {
    const grip = e.currentTarget;
    grip.setPointerCapture(e.pointerId);
    const r = box.getBoundingClientRect();
    const mv = (ev) => {
      const w = ev.clientX - r.left, h = ev.clientY - r.top;
      k = Math.min(12, Math.max(1.5, (w / obj.w + h / obj.h) / 2));
      // only the outline changes while dragging, so the grip keeps its pointer capture
      box.querySelector("svg").outerHTML = outlineSvg(obj, k);
      box.style.width = obj.w * k + "px"; box.style.height = obj.h * k + "px";
      range.value = k;
    };
    const up = () => { grip.removeEventListener("pointermove", mv); grip.removeEventListener("pointerup", up); };
    grip.addEventListener("pointermove", mv); grip.addEventListener("pointerup", up);
  }
  show();
  range.addEventListener("input", () => { k = parseFloat(range.value); show(); });
  el.querySelector("#cal-object").addEventListener("change", (e) => { obj = byId[e.target.value]; show(); });
  const apply = (v, isReal) => {
    calib = v;
    devicePxPerMm = isReal ? v * dpr : null;
    const saved = readCalibrations();
    if (isReal) saved[display] = devicePxPerMm; else delete saved[display];
    try { localStorage.setItem(LS_CALIBS, JSON.stringify(saved)); } catch {}
    close();
    home();
  };
  el.querySelector("#cal-done").addEventListener("click", () => apply(k, true));
  el.querySelector("#cal-reset").addEventListener("click", () => apply(DEFAULT_CALIB, false));
}

// ---------------------------------------------------------------- start

function loadInitial() {
  const m = location.hash.match(/m=([^&]+)/);
  if (m) {
    try { decodeMat(m[1]); history.replaceState(null, "", location.pathname + location.search); return "fit"; } catch {}
  }
  try {
    const saved = JSON.parse(localStorage.getItem(LS_MAT));
    if (saved) {
      unit = okUnit(saved.unit);
      restore(JSON.stringify(saved.shapes || []));
      // zoom is saved as a fraction of 100%, which survives a different screen or browser zoom
      const v = saved.view;
      if (v && v.pct > 0) { view = { x: v.x, y: v.y, z: v.pct * calib }; return "keep"; }
      return "fit";
    }
  } catch {}
  // first visit: a phone, a passport and a soda can, lined up
  if (!navigator.language || navigator.language === "en-US") unit = "in";
  for (const src of ["iphone-17-pro", "passport", "soda-can"]) place(makeShape({ src }));
  selId = null;
  return "fit";
}

buildShelf();
const how = loadInitial();
resize();
if (how === "fit") fit(false);
$("custom-unit").value = unit;
syncShelfDims();
syncUI();
new ResizeObserver(resize).observe(wrap);
window.addEventListener("resize", resize); // browser zoom can change devicePixelRatio alone
// moving the window between two monitors with the same pixel density fires no resize
setInterval(syncDisplay, 1000);
document.fonts?.ready.then(draw);

// test hook
window.toScale = {
  get shapes() { return shapes; }, get view() { return view; }, get selId() { return selId; },
  get unit() { return unit; }, get calib() { return calib; }, toScreen, toWorld, aabb, fit, lineUp, undo, redo,
};
