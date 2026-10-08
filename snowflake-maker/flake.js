// The snowflake, as a set of moves.
//
// Every branch belongs to a clone group: one branch, stored once, plus the list of places it is
// drawn. A move made on any member of a group happens to every member, so clones can never come
// apart. Groups start with the six arms, which are copies of one another by the flake's own
// symmetry: six rotations, and with mirroring, six reflections too. Splitting a branch into a
// mirrored pair makes a new group with twice the members, one for each side of the branch it came
// off, and everything grown from either twin from then on happens to both.
//
// All directions are lattice directions: straight up, and every 60° turn from there.

import { segHit } from "../snowflake/grower.js";

export const DEG = Math.PI / 180;
export const UP = -90 * DEG;                       // canvas y points down, so this is up the screen
export const SHAPES = ["circle", "hexagon", "rhombus"];
const EPS = 1e-6;

/* ---- placements ----
 * A placement is a rotation or reflection plus a shift, {m: [a, b, c, d], t: [x, y]}:
 * p' = m·p + t. Every member of a group is one placement of the stored branch.
 */
export const IDENTITY = { m: [1, 0, 0, 1], t: [0, 0] };
export const place = (A, x, y) => [A.m[0] * x + A.m[1] * y + A.t[0], A.m[2] * x + A.m[3] * y + A.t[1]];
const turn = (A, x, y) => [A.m[0] * x + A.m[1] * y, A.m[2] * x + A.m[3] * y];
const compose = (A, B) => ({
  m: [A.m[0] * B.m[0] + A.m[1] * B.m[2], A.m[0] * B.m[1] + A.m[1] * B.m[3],
      A.m[2] * B.m[0] + A.m[3] * B.m[2], A.m[2] * B.m[1] + A.m[3] * B.m[3]],
  t: place(A, B.t[0], B.t[1]),
});
// rotations and reflections are undone by their transpose
const invert = A => {
  const m = [A.m[0], A.m[2], A.m[1], A.m[3]];
  return { m, t: [-(m[0] * A.t[0] + m[1] * A.t[1]), -(m[2] * A.t[0] + m[3] * A.t[1])] };
};
// reflection across the line through (px, py) heading h
const reflectAcross = (px, py, h) => {
  const c = Math.cos(2 * h), s = Math.sin(2 * h);
  return { m: [c, s, s, -c], t: [px - (c * px + s * py), py - (s * px - c * py)] };
};
const r3 = v => Math.round(v * 1e3) / 1e3 + 0;   // + 0 folds -0 into 0
const placeKey = A => [...A.m, ...A.t].map(r3).join(",");

// The flake's own symmetries, about the center. The mirror is the vertical line the first arm grows on.
export function symmetries(mirror) {
  const out = [];
  for (let k = 0; k < 6; k++) {
    const t = k * 60 * DEG, c = Math.cos(t), s = Math.sin(t);
    out.push({ m: [c, -s, s, c], t: [0, 0] });
    if (mirror) out.push({ m: [-c, -s, -s, c], t: [0, 0] });   // rotate after reflecting x → -x
  }
  return out;
}

export const ptKey = (x, y) => `${r3(x)},${r3(y)}`;
const segKey = s => {
  const a = ptKey(s.x1, s.y1), b = ptKey(s.x2, s.y2);
  return a < b ? a + "|" + b : b + "|" + a;
};

// Snap a heading onto the nearest lattice direction, so float error never accumulates in it.
export function latticeAngle(a) {
  const k = Math.round((a - UP) / (60 * DEG));
  return UP + k * 60 * DEG;
}
const sameAngle = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 1e-3;

export class Flake {
  constructor({ mirror = true, R = 300 } = {}) {
    this.R = R;
    this.mirror = mirror;
    // group id → placements. Group 0 holds the arms; the flake's symmetry supplies the rest.
    this.groups = { 0: [IDENTITY] };
    this.segs = [];    // {id, group, x1, y1, x2, y2, order, parent}, in the group's own frame
    this.caps = [];    // {id, group, x, y, a, r, kind, parent}, likewise
    this.nextId = 1;
    this.rebuild();
  }

  get G() { return symmetries(this.mirror); }
  get empty() { return this.segs.length === 0 && this.caps.length === 0; }

  // Every placement of a group in the finished picture: each member, times each flake symmetry.
  members(placements) {
    const seen = new Set(), out = [];
    for (const g of this.G) for (const T of placements) {
      const F = compose(g, T), k = placeKey(F);
      if (!seen.has(k)) { seen.add(k); out.push(F); }
    }
    return out;
  }

  // Members that the flake's symmetry would draw anyway add nothing, so a new group drops them.
  // That's what happens when a branch on a main arm splits: the arm sits on a mirror line, so the
  // pair's second half is already one of the flake's own reflections.
  newGroup(placements) {
    const seen = new Set(), keep = [];
    for (const T of placements) {
      const keys = this.G.map(g => placeKey(compose(g, T)));
      if (keys.some(k => seen.has(k))) continue;
      keys.forEach(k => seen.add(k));
      keep.push(T);
    }
    const id = this.nextId++;
    this.groups[id] = keep;
    return id;
  }

  // A branch drawn in every place its group puts it, duplicates removed: a branch lying on a mirror
  // line is its own reflection, and would otherwise be drawn (and collide with itself) twice.
  imagesOf(s, placements = this.groups[s.group]) {
    const seen = new Set(), out = [];
    for (const F of this.members(placements)) {
      const [x1, y1] = place(F, s.x1, s.y1), [x2, y2] = place(F, s.x2, s.y2);
      const img = { ...s, x1, y1, x2, y2, xf: F };
      const k = segKey(img);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(img);
    }
    return out;
  }

  capImagesOf(c) {
    const seen = new Set(), out = [];
    for (const F of this.members(this.groups[c.group])) {
      const [x, y] = place(F, c.x, c.y);
      const [dx, dy] = turn(F, Math.cos(c.a), Math.sin(c.a));
      const k = ptKey(x, y);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ ...c, x, y, a: Math.atan2(dy, dx) });
    }
    return out;
  }

  rebuild() {
    this.images = this.segs.flatMap(s => this.imagesOf(s));
    this.capImages = this.caps.flatMap(c => this.capImagesOf(c));
  }

  /* ---- where a move can start ---- */

  // The directions a branch may grow from point (x, y), each with the branch it grows off and the
  // placement that branch is drawn with here. From the end of a branch: straight on, or off at ±60°.
  // From partway along one: only ±60°. From the center: the arms, in any of the six directions.
  // `all` keeps directions with no room; otherwise only ones a branch could actually grow in.
  optionsAt(x, y, all = false) {
    const opts = [];
    // `ahead` marks the one that carries a branch straight on, which is what a plain click grows
    const add = (a, s, order, ahead = false) => {
      a = latticeAngle(a);
      const o = opts.find(o => sameAngle(o.a, a));
      if (o) o.ahead ||= ahead;
      else opts.push({ a, order, ahead, parent: s ? s.id : null, group: s ? s.group : 0, xf: s ? s.xf : IDENTITY });
    };
    if (Math.hypot(x, y) < 1e-6) {
      for (let k = 0; k < 6; k++) add(UP + k * 60 * DEG, null, 0, k === 0);
    }
    for (const s of this.images) {
      const h = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
      if (Math.hypot(s.x2 - x, s.y2 - y) < 1e-6) {
        add(h, s, s.order, true);
        add(h + 60 * DEG, s, s.order + 1);
        add(h - 60 * DEG, s, s.order + 1);
      } else {
        const t = projT(s, x, y);
        if (t > EPS && t < 1 - EPS && distToSeg(s, x, y) < 1e-6) {
          add(h + 60 * DEG, s, s.order + 1);
          add(h - 60 * DEG, s, s.order + 1);
        }
      }
    }
    return all ? opts : opts.filter(o => this.canGrow(x, y, o));
  }

  // Whether any clone at all could grow this way. Some being blocked doesn't stop the rest.
  canGrow(x, y, o) {
    if (this.room(x, y, o) > 0.5) return true;
    const p = this.plan(x, y, o);
    return p.placements.length > 1 && p.placements.some(T => this.roomFor(p.px, p.py, p.a, [T]) > 0.5);
  }

  // A move from world point (x, y) along option `o`, worked out in the frame of the group it grows
  // in. With `pairBase`, it's a split: the group doubles, every member gaining a twin reflected
  // across the branch being split (which runs along `pairBase` here).
  plan(x, y, o, pairBase) {
    const inv = invert(o.xf);
    const [px, py] = place(inv, x, y);
    const [dx, dy] = turn(inv, Math.cos(o.a), Math.sin(o.a));
    let placements = this.groups[o.group];
    if (pairBase !== undefined) {
      const [bx, by] = turn(inv, Math.cos(pairBase), Math.sin(pairBase));
      const R = reflectAcross(px, py, latticeAngle(Math.atan2(by, bx)));
      placements = placements.flatMap(T => [T, compose(T, R)]);
    }
    return { px, py, a: latticeAngle(Math.atan2(dy, dx)), placements };
  }

  // How far a move can reach before any copy of it would leave the plate or run into ice. All the
  // copies grow together and stop together. Branches may touch, never cross: a branch that meets
  // ice stops exactly there.
  room(x, y, o, want = Infinity, pairBase) {
    const p = this.plan(x, y, o, pairBase);
    return this.roomFor(p.px, p.py, p.a, p.placements, want);
  }

  // The same, for a branch from (px, py) heading `a` in a group's own frame, drawn at `placements`.
  roomFor(px, py, a, placements, want = Infinity) {
    const ux = Math.cos(a), uy = Math.sin(a);
    const unit = this.imagesOf({ x1: px, y1: py, x2: px + ux, y2: py + uy }, placements);

    // the plate's edge, for every copy: solve |start + u L| = R
    let L = want;
    for (const s of unit) {
      const vx = s.x2 - s.x1, vy = s.y2 - s.y1, pu = s.x1 * vx + s.y1 * vy;
      const disc = pu * pu - (s.x1 * s.x1 + s.y1 * s.y1) + this.R * this.R;
      L = Math.min(L, disc > 0 ? -pu + Math.sqrt(disc) : 0);
    }
    if (L <= 0) return 0;

    const cands = unit.map(s => ({ x1: s.x1, y1: s.y1, x2: s.x1 + (s.x2 - s.x1) * L, y2: s.y1 + (s.y2 - s.y1) * L }));
    let t = 1;
    for (const c of cands) {
      for (const o of this.images) {
        const v = segHit(c.x1, c.y1, c.x2, c.y2, o.x1, o.y1, o.x2, o.y2);
        if (v < t) t = v;
      }
      // and against the other copies, which grow at the same time
      const cx = (c.x2 - c.x1) / L, cy = (c.y2 - c.y1) / L;
      for (const o of cands) {
        if (o === c) continue;
        // A copy coming straight at it along the same line meets it halfway. Tested as finished
        // segments the two would overlap from the start and get no room at all.
        const ox = (o.x2 - o.x1) / L, oy = (o.y2 - o.y1) / L;
        const ahead = (o.x1 - c.x1) * cx + (o.y1 - c.y1) * cy;
        const off = Math.abs((o.x1 - c.x1) * cy - (o.y1 - c.y1) * cx);
        if (ox * cx + oy * cy < -1 + 1e-6 && off < 1e-6) {
          if (ahead > 0) t = Math.min(t, ahead / 2 / L);
          continue;
        }
        const v = segHit(c.x1, c.y1, c.x2, c.y2, o.x1, o.y1, o.x2, o.y2);
        if (v < t) t = v;
      }
    }
    return L * t;
  }

  /* ---- moves ---- */

  // One branch, grown in every member of the group of the branch it comes off. Returns the
  // branches it laid down: more than one when some clones got further than others (see place).
  grow(x, y, o, length) {
    return this.place(this.plan(x, y, o), length, o, o.group);
  }

  // Grow a planned move out to `want`. All the clones grow together until one of them runs into
  // something. The ones that can't go on stop there; the rest carry on as a smaller group, and so
  // on. So whatever the clones can all do stays one shared branch, and the stretch only some of
  // them can reach becomes a branch of their own, no longer copied onto the ones that stopped.
  place(p, want, o, group) {
    const made = [];
    let { px, py } = p, placements = p.placements, left = want, parent = o.parent;
    const ux = Math.cos(p.a), uy = Math.sin(p.a);
    while (placements.length && left >= 0.5) {
      const L = this.roomFor(px, py, p.a, placements, left);
      // A clone is free to go on if, on its own, it would have got further than the group did.
      // Asked before this stage's branch is laid down, from where the stage started, so a clone
      // that stopped by touching something counts as stopped even if the touch was only a graze.
      const free = placements.filter(T => this.roomFor(px, py, p.a, [T], left) > L + 0.5);
      if (L >= 0.5) {
        if (group === undefined) group = this.newGroup(placements);
        const s = {
          id: this.nextId++, group,
          x1: px, y1: py, x2: px + ux * L, y2: py + uy * L,
          order: o.order, parent,
        };
        this.segs.push(s);
        this.rebuild();
        made.push(s);
        parent = s.id; px = s.x2; py = s.y2; left -= L;
      }
      if (left < 0.5) break;
      // none could, or all could and it's only each other they ran into: either way, done
      if (!free.length || free.length === placements.length) break;
      placements = free;
      group = undefined;
    }
    return made;
  }

  // A split: a mirrored pair at ±60° to `base`, plus one straight on along `base` for a three-way
  // split. The pair is a new clone group, so from now on the two twins do everything together. If
  // one side is blocked, the other still grows, on its own.
  split(x, y, base, length, three = false) {
    const opts = this.optionsAt(x, y, true);
    const side = opts.find(o => sameAngle(o.a, latticeAngle(base + 60 * DEG))) ||
                 opts.find(o => sameAngle(o.a, latticeAngle(base - 60 * DEG)));
    const made = [];
    if (side) made.push(...this.place(this.plan(x, y, side, base), length, side));
    if (three) {
      const ahead = this.optionsAt(x, y, true).find(o => sameAngle(o.a, latticeAngle(base)));
      if (ahead) made.push(...this.grow(x, y, ahead, length));
    }
    return made;
  }

  // Run a move without keeping it, to see what it would add.
  trial(fn) {
    const before = this.snapshot();
    const result = fn();
    this.restore(before);
    return result;
  }

  // The branch a cap at (x, y) belongs to, which it faces along and is cloned with. Any point where
  // branches end, meet or start can take a cap, the center included. Preferred, in order: a branch
  // that ends there, one that runs through it, one that starts there.
  capBase(x, y) {
    const at = (px, py) => Math.hypot(px - x, py - y) < 1e-6;
    return this.images.find(s => at(s.x2, s.y2)) ||
      this.images.find(s => { const t = projT(s, x, y); return t > EPS && t < 1 - EPS && distToSeg(s, x, y) < 1e-6; }) ||
      this.images.find(s => at(s.x1, s.y1)) || null;
  }

  // A cap goes on a branch point, facing the way its branch goes, and on every clone of that
  // branch. One per point: placing a second replaces the first.
  capAt(x, y, kind, r) {
    const end = this.capBase(x, y);
    if (!end) return null;
    const inv = invert(end.xf);
    const [px, py] = place(inv, x, y);
    const [dx, dy] = turn(inv, end.x2 - end.x1, end.y2 - end.y1);
    const c = { id: this.nextId++, group: end.group, x: px, y: py, a: Math.atan2(dy, dx), r, kind, parent: end.id };
    const at = new Set(this.capImagesOf(c).map(i => ptKey(i.x, i.y)));
    this.caps = this.caps.filter(o => !this.capImagesOf(o).some(i => at.has(ptKey(i.x, i.y))));
    this.caps.push(c);
    this.rebuild();
    return c;
  }

  // Everything that would go if branch `id` went: it, everything grown off it, and their caps.
  descendants(id) {
    const gone = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const s of this.segs) {
        if (!gone.has(s.id) && gone.has(s.parent)) { gone.add(s.id); grew = true; }
      }
    }
    return gone;
  }

  // What erasing at (x, y) on branch image `img` would take. A branch that has others grown off it
  // partway along reads as several pieces, so it's cut at the last branch point before the pointer:
  // only the stretch past that goes, with whatever grew from that stretch. Pointing before the first
  // branch point, or at a branch with nothing off it partway, takes the whole branch.
  //   → {id, cut (fraction of the branch to keep, or null for all of it), segs, caps}
  erasePlan(img, x, y) {
    const t = projT(img, x, y);
    const mine = this.images.filter(s => s.id === img.id);
    // how far along this branch (as a fraction) a point lies, on any of its clones
    const along = (px, py) => {
      for (const m of mine) {
        const u = projT(m, px, py);
        if (u > -EPS && u < 1 + EPS && distToSeg(m, px, py) < 1e-6) return Math.min(1, Math.max(0, u));
      }
      return null;
    };
    const children = this.segs.filter(s => s.parent === img.id).map(c => {
      const us = this.images.filter(i => i.id === c.id).map(i => along(i.x1, i.y1)).filter(u => u !== null);
      return { c, u: us.length ? Math.min(...us) : 1 };
    });
    const caps = this.caps.filter(c => c.parent === img.id).map(c => {
      const us = this.capImages.filter(i => i.id === c.id).map(i => along(i.x, i.y)).filter(u => u !== null);
      return { c, u: us.length ? Math.min(...us) : 1 };
    });
    const points = [...children, ...caps].map(k => k.u).filter(u => u > EPS && u < 1 - EPS && u < t - EPS);
    if (!points.length) {
      const segs = this.descendants(img.id);
      return { id: img.id, cut: null, segs, caps: new Set(this.caps.filter(c => segs.has(c.parent)).map(c => c.id)) };
    }
    const cut = Math.max(...points);
    const segs = new Set();
    for (const { c, u } of children) if (u > cut + EPS) this.descendants(c.id).forEach(id => segs.add(id));
    const capIds = new Set(caps.filter(k => k.u > cut + EPS).map(k => k.c.id));
    for (const c of this.caps) if (segs.has(c.parent)) capIds.add(c.id);
    return { id: img.id, cut, segs, caps: capIds };
  }

  applyErase(plan) {
    if (plan.cut === null) return this.erase(plan.id);
    const s = this.segs.find(s => s.id === plan.id);
    s.x2 = s.x1 + (s.x2 - s.x1) * plan.cut;
    s.y2 = s.y1 + (s.y2 - s.y1) * plan.cut;
    this.segs = this.segs.filter(o => !plan.segs.has(o.id));
    this.caps = this.caps.filter(o => !plan.caps.has(o.id));
    this.rebuild();
  }

  erase(id) {
    if (this.caps.some(c => c.id === id)) {
      this.caps = this.caps.filter(c => c.id !== id);
    } else {
      const gone = this.descendants(id);
      this.segs = this.segs.filter(s => !gone.has(s.id));
      this.caps = this.caps.filter(c => !gone.has(c.parent));
    }
    this.rebuild();
  }

  /* ---- picking ---- */

  // Every point where a branch ends or starts, plus the center.
  nodes() {
    const m = new Map([["0,0", { x: 0, y: 0 }]]);
    for (const s of this.images) {
      m.set(ptKey(s.x1, s.y1), { x: s.x1, y: s.y1 });
      m.set(ptKey(s.x2, s.y2), { x: s.x2, y: s.y2 });
    }
    return [...m.values()];
  }

  // Ends of branches that nothing has grown from yet, and that carry no cap.
  tips() {
    const from = new Set(this.images.map(s => ptKey(s.x1, s.y1)));
    const capped = new Set(this.capImages.map(c => ptKey(c.x, c.y)));
    const out = new Map();
    for (const s of this.images) {
      const k = ptKey(s.x2, s.y2);
      if (!from.has(k) && !capped.has(k)) out.set(k, { x: s.x2, y: s.y2 });
    }
    return [...out.values()];
  }

  nearestNode(x, y, tol) {
    let best = null, bd = tol;
    for (const n of this.nodes()) {
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  // The branch under (x, y). Near a junction several branches are about equally close, and the one
  // the pointer is beside should win over one it's only near the end of. Otherwise pointing at a
  // short branch that carries on from another picks the branch it grew from.
  nearestSeg(x, y, tol) {
    let best = null, bd = Infinity;
    for (const s of this.images) {
      const d = distToSeg(s, x, y);
      if (d >= tol) continue;
      const t = projT(s, x, y);
      const score = d + (t <= 0 || t >= 1 ? tol : 0);
      if (score < bd) { bd = score; best = s; }
    }
    return best;
  }

  nearestCap(x, y) {
    for (let i = this.capImages.length - 1; i >= 0; i--) {
      const c = this.capImages[i];
      if (Math.hypot(c.x - x, c.y - y) <= c.r + 2) return c;
    }
    return null;
  }

  /* ---- history ---- */
  snapshot() {
    return JSON.stringify({ groups: this.groups, segs: this.segs, caps: this.caps, nextId: this.nextId, mirror: this.mirror });
  }
  restore(json) {
    Object.assign(this, JSON.parse(json));
    this.rebuild();
  }
}

export function projT(s, x, y) {
  const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
  const ll = dx * dx + dy * dy || 1;
  return ((x - s.x1) * dx + (y - s.y1) * dy) / ll;
}
export function distToSeg(s, x, y) {
  const t = Math.max(0, Math.min(1, projT(s, x, y)));
  return Math.hypot(s.x1 + (s.x2 - s.x1) * t - x, s.y1 + (s.y2 - s.y1) * t - y);
}
