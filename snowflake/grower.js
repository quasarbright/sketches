// The snowflake grower.
//
// A Class is one growth program plus every world pose that runs it. All the geometry lives in the
// poses; the program is stored once, so symmetry can't drift — there is only ever one decision per
// class per step.
//
//   Pose = {x, y, a, f, pa}   tip position, heading, chirality (+1 / -1), and the heading of the
//                             branch it split off from
//
// A turn `t` in a branch's local frame maps to the world as `a + f*t`, so a mirrored clone turns the
// other way. Splits emit a mirrored pair (one child gets `f` negated), and that single rule is what
// makes the whole crystal six-fold-mirror symmetric — a branch on an arm's centerline can only
// produce a symmetric subtree, and a branch off to one side always has a twin on the other.

export const DEG = Math.PI / 180;
const EPS = 1e-4;
export const SHAPES = ["circle", "hexagon", "rhombus"];  // what a branch may leave where it stopped

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smallest t in (EPS, 1] at which segment A→B touches segment C→D, else Infinity.
// The collinear case is handled explicitly: every heading is a multiple of 60°, so branches from
// neighbouring arms genuinely do run into each other head-on along the same line.
export function segHit(ax, ay, bx, by, cx, cy, dx, dy) {
  const rx = bx - ax, ry = by - ay;
  const sx = dx - cx, sy = dy - cy;
  const qx = cx - ax, qy = cy - ay;
  const denom = rx * sy - ry * sx;

  if (Math.abs(denom) < 1e-9) {
    if (Math.abs(qx * ry - qy * rx) > 1e-6) return Infinity; // parallel, not collinear
    const rr = rx * rx + ry * ry;
    let t0 = (qx * rx + qy * ry) / rr;
    let t1 = t0 + (sx * rx + sy * ry) / rr;
    if (t0 > t1) { const tmp = t0; t0 = t1; t1 = tmp; }
    const lo = Math.max(t0, 0), hi = Math.min(t1, 1);
    if (hi < lo - 1e-9) return Infinity;          // collinear but disjoint
    if (hi - lo > 1e-6) return lo;                // a real overlap, however it's positioned
    // Touching at a single point. Two cases, and they must not be conflated: at t≈0 it is this
    // branch's own parent segment, lying collinear behind the base — ignore it. Anywhere further
    // along it is another branch met head-on, tip to tip, on the same line. That is a genuine
    // contact and the branch has to stop, or the two grow straight through one another.
    return lo > EPS ? lo : Infinity;
  }

  const t = (qx * sy - qy * sx) / denom;
  const u = (qx * ry - qy * rx) / denom;
  if (t > EPS && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9) return Math.min(t, 1);
  return Infinity;
}

export class Grower {
  constructor(seed, R, params, mirror = true) {
    this.rand = mulberry32(seed >>> 0);
    this.R = R;
    this.P = params;
    this.mirror = mirror;
    this.segs = [];       // {x1,y1,x2,y2,depth,born}
    this.shapes = [];     // {x,y,a,r,kind,born} — left where a branch stopped
    this.pending = [];    // shapes awaiting the end of the step, see settleShapes()
    this.grown = new Set();   // points some branch has grown out of — never a tip
    this.shaped = new Set();  // points already carrying a shape
    this.steps = 0;
    this.contacts = 0;   // branches that ended by touching ice
    this.nextId = 0;     // class ids, so a segment can be traced back to the branch that grew it
    this.parentOf = new Map();
    this.cell = Math.max(12, params.stepLen * 2);
    this.grid = new Map();

    // six arms: rotations only, all the same chirality. Mirroring enters at the splits.
    const poses = [];
    for (let i = 0; i < 6; i++) poses.push({ x: 0, y: 0, a: i * 60 * DEG, f: 1, pa: i * 60 * DEG });
    this.frontier = [this.makeClass({ poses, order: 0, sinceSplit: 0, onAxis: true, sterile: false }, -1)];
  }

  makeClass(c, parentId) {
    c.id = this.nextId++;
    this.parentOf.set(c.id, parentId);
    return c;
  }

  get live() { return this.frontier.reduce((n, c) => n + c.poses.length, 0); }
  get done() { return this.frontier.length === 0; }

  /* --- spatial hash over committed segments --- */
  key(i, j) { return (i * 73856093) ^ (j * 19349663); }
  cellsOf(x1, y1, x2, y2) {
    const c = this.cell;
    const i0 = Math.floor(Math.min(x1, x2) / c), i1 = Math.floor(Math.max(x1, x2) / c);
    const j0 = Math.floor(Math.min(y1, y2) / c), j1 = Math.floor(Math.max(y1, y2) / c);
    const out = [];
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) out.push(this.key(i, j));
    return out;
  }
  insert(seg) {
    const idx = this.segs.length;
    this.segs.push(seg);
    this.grown.add(this.ptKey(seg.x1, seg.y1));
    for (const k of this.cellsOf(seg.x1, seg.y1, seg.x2, seg.y2)) {
      let a = this.grid.get(k);
      if (!a) this.grid.set(k, a = []);
      a.push(idx);
    }
  }
  nearby(x1, y1, x2, y2) {
    const seen = new Set();
    for (const k of this.cellsOf(x1, y1, x2, y2)) {
      const a = this.grid.get(k);
      if (a) for (const i of a) seen.add(i);
    }
    return seen;
  }

  /* --- constraints --- */
  // A branch may turn back a little toward the center — but a branch that does is sterile: it can
  // only grow or stop from then on, never split. That keeps inward growth to the odd stray spur
  // instead of letting whole structures march back into the middle.
  outward(p) {
    const r2 = p.x * p.x + p.y * p.y;
    if (r2 < 1e-6) return true; // the six arms leaving the origin
    return Math.cos(p.a) * p.x + Math.sin(p.a) * p.y > 1e-6;
  }
  // Sterile only when the class has nowhere outward to go at all — every instance heading inward.
  //
  // It can't be "any instance heading inward", tempting as that sounds: a mirrored pair off a side
  // branch *always* contains one child turning back toward the main arm. A branch at +60° splits
  // into one at +120° and one at 0°, and the two are mirror clones, so they're stuck in the same
  // class. Sterilising on "any" therefore sterilises every side branch's children, and nothing in
  // the crystal can branch past the second order however high the branch chance is. Ferns in real
  // snowflakes do throw sub-branches back toward the arm they came off; those branches are simply
  // short, because they run into that arm and stop. Which is what happens here.
  sterileFor(poses) { return poses.every(p => !this.outward(p)); }
  radius(c) { const p = c.poses[0]; return Math.hypot(p.x, p.y); }

  // How far this class can extend before something is in the way, as a fraction of `L`.
  // The class moves as one, so the tightest instance clips them all. `hit` says whether it was
  // stopped by ice at all — a branch that reaches ice exactly at full length has still reached it,
  // and must terminate, or it walks straight through on the following step.
  clip(poses, L) {
    const props = poses.map(p => ({
      x1: p.x, y1: p.y,
      x2: p.x + Math.cos(p.a) * L,
      y2: p.y + Math.sin(p.a) * L,
    }));
    let t = 1, hit = false;
    const take = v => { if (v <= 1 + 1e-9 && v < Infinity) { hit = true; t = Math.min(t, v); } };

    for (const s of props) {
      for (const i of this.nearby(s.x1, s.y1, s.x2, s.y2)) {
        const o = this.segs[i];
        take(segHit(s.x1, s.y1, s.x2, s.y2, o.x1, o.y1, o.x2, o.y2));
      }
      // and against the other instances of this same move, which are committed together
      for (const o of props) {
        if (o === s) continue;
        take(segHit(s.x1, s.y1, s.x2, s.y2, o.x1, o.y1, o.x2, o.y2));
      }
    }
    return { t, hit };
  }

  /* --- moves --- */
  // defs are [{turn, mflip}] in the parent's local frame → one pose list per def
  children(c, defs) {
    return defs.map(d => c.poses.map(p => ({
      x: p.x, y: p.y,
      a: p.a + p.f * d.turn,
      f: p.f * d.mflip,
      pa: p.a,          // the heading of the branch this one split off from
    })));
  }
  // A mirrored pair at ±60°. Without mirroring they're rotated copies instead, and pinwheel.
  pairDefs() {
    const m = this.mirror ? -1 : 1;
    return [{ turn: 60 * DEG, mflip: 1 }, { turn: -60 * DEG, mflip: m }];
  }

  // A branch that stops may leave a shape where it ended — but only where the crystal actually ends.
  // Whether that's true isn't known yet: a sibling from the same split may be about to carry on from
  // the very same point, and a shape there would sit in the middle of the crystal rather than at a
  // tip. So the shape is held until the end of the step, when the surviving frontier is known, and
  // then only kept at points nothing is still growing from. The dice are rolled here, though, so the
  // crystal stays a pure function of its seed.
  stop(c) {
    const P = this.P;
    if (this.rand() >= P.stopShape) return;
    // one shape per class, so every clone leaves the same one and the symmetry holds
    const kind = SHAPES[Math.floor(this.rand() * SHAPES.length)];
    const r = Math.max(2, P.stepLen * .35);
    // Orient the shape by the branch that actually ends at this point. Usually that's this branch —
    // but a branch that stops without ever growing is still parked on the junction it was born on,
    // and the ice ending there is its *parent*. Using its own heading would cock the shape 60° away
    // from the branch it is capping.
    const grew = c.sinceSplit > 0;
    this.pending.push({
      kind, r,
      poses: c.poses.map(p => ({ x: p.x, y: p.y, a: grew ? p.a : p.pa })),
    });
  }

  ptKey(x, y) { return `${Math.round(x * 100)},${Math.round(y * 100)}`; }

  // Keep a held shape only where the crystal really ends: nothing has grown out of that point, and
  // nothing is still poised to. Both halves are needed. Checking only the surviving frontier isn't
  // enough, because a sibling that grew out of the junction *this very step* has already advanced
  // off it — its pose has moved on, and the junction it left behind looks abandoned.
  settleShapes() {
    const poised = new Set();
    for (const c of this.frontier) for (const p of c.poses) poised.add(this.ptKey(p.x, p.y));
    for (const s of this.pending) {
      for (const p of s.poses) {
        const k = this.ptKey(p.x, p.y);
        if (this.grown.has(k) || poised.has(k) || this.shaped.has(k)) continue;
        this.shaped.add(k);
        this.shapes.push({ x: p.x, y: p.y, a: p.a, r: s.r, kind: s.kind, born: this.steps });
      }
    }
    this.pending.length = 0;
  }

  step() {
    if (this.done) return;
    const P = this.P;
    this.steps++;
    const next = [];

    for (const c of this.frontier) {
      const r = this.radius(c);
      // Nothing may stop of its own accord until the crystal has reached the minimum size, measured
      // in growth steps out from the middle. A branch that is boxed in still stops — that isn't a
      // choice it gets to make.
      const tooSmall = r < P.minSteps * P.stepLen;

      if (r >= this.R) { this.stop(c); continue; }

      const menu = [];

      // How likely a set of clones is to manage a first step at all: no room means never, and if
      // that first step would run into ice, collision shyness may well veto it.
      const canGrow = poses => {
        const k = this.clip(poses, P.stepLen);
        if (k.t * P.stepLen < Math.max(1, P.stepLen * .15)) return 0;
        return k.hit ? 1 - P.avoidCollision : 1;
      };
      const growAhead = canGrow(c.poses);

      // A branch has to have grown before it can split: a zero-length branch splitting would fan new
      // branches out of the very junction it was born on, repeating every step and choking the
      // crystal on itself.
      const canSplit = !c.sterile && c.sinceSplit > 0 && r < this.R * .96;
      if (canSplit) {
        const pair = this.children(c, this.pairDefs());
        // Only split into somewhere the children can actually go. Without this, a branch hemmed in
        // on all sides still splits, every child dies at birth without growing a single segment,
        // and the branch is left ending on a bare junction — no tip, and so no stopping shape.
        const growSides = canGrow(pair.flat());
        const w = P.branchChance;
        // A three-way split also sends a child straight on, so it is worth making if either the
        // sides or the way ahead is open. A two-way split only has the sides.
        if (P.threeWay > 0) {
          menu.push({ kind: "split3", w: w * P.threeWay * Math.max(growSides, growAhead), pair });
        }
        if (P.threeWay < 1) {
          menu.push({ kind: "split2", w: w * (1 - P.threeWay) * growSides, pair });
        }
      }

      if (!tooSmall) {
        // Readier to stop the closer it is to the edge, and — for side branches — the further it
        // is from a main arm. A main arm is the crystal's dominant growth direction and persists;
        // the twigs hanging off it are progressively shorter-lived, which is what gives the
        // crystal its fern-like falloff. Order is branchings-off-a-centerline, not raw tree depth,
        // so a first-order side branch is treated as one however far out along the arm it grew.
        const edge = r / this.R;
        const falloff = c.onAxis ? .3 : Math.pow(1 + P.depthFalloff, c.order);
        menu.push({ kind: "stop", w: P.stopChance * (.15 + .85 * edge * edge) * falloff });
      }

      // Collision shyness is the chance of vetoing a step that would run into ice. At 1 a colliding
      // step is never taken, so tips never touch at all; at 0 nothing is ever vetoed and branches
      // run straight in and stop on contact. A vetoed branch simply has to do something else that
      // step — split, or stop.
      const ext = this.clip(c.poses, P.stepLen);
      const room = ext.t * P.stepLen >= Math.max(1, P.stepLen * .15);
      const vetoed = ext.hit && this.rand() < P.avoidCollision;
      if (room && !vetoed) menu.push({ kind: "extend", t: ext.t, hit: ext.hit, w: 1 });

      let move = null;
      const pool = menu.filter(m => m.w > 0);
      if (pool.length) {
        const total = pool.reduce((s, m) => s + m.w, 0);
        let x = this.rand() * total, k = 0;
        while (k < pool.length - 1 && (x -= pool[k].w) > 0) k++;
        move = pool[k];
      }
      if (!move) move = { kind: "stop" }; // boxed in, or nothing else was on the menu

      switch (move.kind) {
        case "extend": {
          const L = P.stepLen * move.t;
          for (const p of c.poses) {
            const x2 = p.x + Math.cos(p.a) * L, y2 = p.y + Math.sin(p.a) * L;
            this.insert({ x1: p.x, y1: p.y, x2, y2, order: c.order, born: this.steps, cid: c.id });
            p.x = x2; p.y = y2;
          }
          c.sinceSplit += L;
          if (move.hit) { this.contacts++; this.stop(c); }  // reached ice: tips may touch, then they're done
          else next.push(c);
          break;
        }
        case "split2": {
          // one class holding the mirrored pair: 2 poses per parent pose. Both leave the
          // centerline, so both are one branching order further out.
          const poses = move.pair.flat();
          next.push(this.makeClass({
            poses, order: c.order + 1, sinceSplit: 0,
            onAxis: false, sterile: this.sterileFor(poses),
          }, c.id));
          break;
        }
        case "split3": {
          const poses = move.pair.flat();
          next.push(this.makeClass({
            poses, order: c.order + 1, sinceSplit: 0,
            onAxis: false, sterile: this.sterileFor(poses),
          }, c.id));
          // The middle branch carries straight on, on its own program. It is the same branch
          // continuing, so it keeps its parent's order and its place on the centerline. Its
          // heading is the parent's too, so a fertile parent always yields a fertile middle child.
          const mid = this.children(c, [{ turn: 0, mflip: 1 }])[0];
          next.push(this.makeClass({
            poses: mid, order: c.order, sinceSplit: 0,
            onAxis: c.onAxis, sterile: this.sterileFor(mid),
          }, c.id));
          break;
        }
        case "stop":
          this.stop(c);
          break;
      }
    }

    this.frontier = next;
    this.settleShapes();
  }

  run(maxSteps = 20000) {
    while (!this.done && this.steps < maxSteps) this.step();
    return this;
  }
}
