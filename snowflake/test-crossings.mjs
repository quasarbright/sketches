// Grows a batch of crystals across the parameter space and asserts no two branches ever cross.
//   node test-crossings.mjs [count]
//
// Two checks, because on a 60° lattice the interesting failure isn't the obvious one:
//
//  1. No segment is pierced in its interior. (The easy case, and the rare one.)
//  2. No vertex has two branches passing *through* it. Branches meet at lattice points, so when
//     one grows through another the crossing lands exactly on a shared endpoint — invisible to an
//     interior test, but a plain X on screen. A branch passing through a vertex leaves two
//     collinear-opposite rays there; a legal split leaves at most one (parent ray + the child
//     carrying straight on). So: two or more opposite pairs at one vertex means two branches
//     crossed, which is exactly the rule "tips may coincide, but they must terminate."
import { Grower, mulberry32 } from "./grower.js";

const E = 1e-6;

function piercesInterior(a, b) {
  const rx = a.x2 - a.x1, ry = a.y2 - a.y1;
  const sx = b.x2 - b.x1, sy = b.y2 - b.y1;
  const qx = b.x1 - a.x1, qy = b.y1 - a.y1;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-9) {
    if (Math.abs(qx * ry - qy * rx) > 1e-3) return false;
    const rr = rx * rx + ry * ry;
    let t0 = (qx * rx + qy * ry) / rr;
    let t1 = t0 + (sx * rx + sy * ry) / rr;
    if (t0 > t1) { const t = t0; t0 = t1; t1 = t; }
    return Math.min(t1, 1) - Math.max(t0, 0) > 1e-3; // collinear overlap
  }
  const t = (qx * sy - qy * sx) / denom;
  const u = (qx * ry - qy * rx) / denom;
  const interior = v => v > E && v < 1 - E;
  return interior(t) && interior(u);
}

// A branch "passes through" a vertex when a segment arrives there and another leaves in the same
// direction, later. Only the first branch to reach a vertex is free to grow onward — anything
// arriving afterwards has touched ice and has to stop — so two branches passing through the same
// vertex means one of them grew straight through the other.
//
// The birth steps are what make this decidable. Two unrelated branches can line up collinearly
// through a vertex perfectly legally: one grew out of it early, and another arrived from the far
// side much later and stopped dead. Inspect only the geometry and that is indistinguishable from a
// crossing, so a departure only counts as a continuation if it was born *after* an arrival.
function crossedVertices(g) {
  const key = (x, y) => `${Math.round(x * 100)},${Math.round(y * 100)}`;
  const at = new Map();
  const put = (k, side, cid) => {
    let v = at.get(k);
    if (!v) at.set(k, v = { in: new Set(), out: new Set() });
    v[side].add(cid);
  };
  for (const s of g.segs) {
    put(key(s.x1, s.y1), "out", s.cid);  // this branch grew out of that vertex
    put(key(s.x2, s.y2), "in", s.cid);   // this branch arrived at that one
  }

  const bad = [];
  for (const [k, v] of at) {
    // Which branches carried on past this vertex? A departure belongs to the branch that arrived if
    // it is that same branch continuing, or a child it spawned there by splitting. Attributing by
    // direction instead of identity does not work: a ±60° split child can leave along the very same
    // heading as some unrelated branch that arrived and correctly stopped, and that reads as a
    // crossing when nothing crossed.
    const through = new Set();
    for (const out of v.out) {
      if (v.in.has(out)) through.add(out);                            // same branch, carrying on
      const parent = g.parentOf.get(out);
      if (v.in.has(parent)) through.add(parent);                      // a child it split off here
    }
    if (through.size >= 2) bad.push(k);   // two branches both grew through: one went through the other
  }
  return bad;
}

const N = Number(process.argv[2] || 200);
let bad = 0, totalSegs = 0, pierced = 0, crossed = 0;

for (let seed = 1; seed <= N; seed++) {
  // sweep the parameter space, not just the defaults — the constraint has to hold everywhere
  const r = mulberry32(seed * 7919);
  const params = {
    stepLen: 3 + Math.floor(r() * 22),
    minSteps: Math.floor(r() * 20),
    branchChance: r(),
    stopChance: r(),
    threeWay: r(),
    stopShape: r(),
    depthFalloff: r() * 2,
    avoidCollision: r(),
  };

  for (const mirror of [true, false]) {
    const g = new Grower(seed, 330, params, mirror).run();
    totalSegs += g.segs.length;
    let hits = 0;

    for (let i = 0; i < g.segs.length; i++)
      for (let j = i + 1; j < g.segs.length; j++)
        if (piercesInterior(g.segs[i], g.segs[j])) { pierced++; hits++; }

    const xs = crossedVertices(g);
    // the origin legitimately has three collinear pairs: the six arms
    const real = xs.filter(k => k !== "0,0");
    crossed += real.length;
    hits += real.length;

    if (hits) {
      bad++;
      console.log(`seed ${seed} mirror=${mirror}: ${hits} violations / ${g.segs.length} segments` +
        (real.length ? `  first X at ${real[0]}` : ""));
    }
  }
}

console.log(`\n${bad} bad crystals / ${N * 2}   pierced=${pierced} crossed-at-vertex=${crossed}   (${totalSegs} segments)`);
process.exit(bad ? 1 : 0);
