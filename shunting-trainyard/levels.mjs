// Layouts and levels. Coordinates are in car lengths, y grows downward.

const DIAG = 1.6; // rise and run of a diagonal between rows

// A headshunt of `head` slots on the left, then a ladder of switches fanning
// sidings off to the right. lens[i] = slots in siding i (top to bottom).
export function ladder(head, lens) {
  const nodes = { H: [0, 0] }, tracks = [], switches = {};
  let x = head + 0.45, y = 0, trunk = "head";
  nodes.P1 = [x, y];
  tracks.push({ id: "head", from: "H", to: "P1" });
  lens.forEach((len, i) => {
    const P = `P${i + 1}`, sid = `s${i + 1}`, E = `E${i + 1}`;
    const last = i === lens.length - 1;
    if (last && i > 0) {
      // the final siding is the last switch's diverging leg (already wired)
      return;
    }
    nodes[E] = [x + 0.4 + len + 0.05, y];
    tracks.push({ id: sid, from: P, to: E });
    if (i + 1 < lens.length) {
      const nextLast = i + 1 === lens.length - 1;
      if (nextLast) {
        // diverging leg runs down a row and becomes the last siding
        const len2 = lens[i + 1];
        const h = len2 + 0.45 - Math.hypot(DIAG, DIAG) + 0.01;
        const E2 = `E${i + 2}`;
        nodes[E2] = [x + DIAG + h, y + DIAG];
        tracks.push({ id: `s${i + 2}`, from: P, to: E2, via: [[x + DIAG, y + DIAG]] });
        switches[P] = { trunk, legs: [sid, `s${i + 2}`] };
      } else {
        const Q = `P${i + 2}`, lead = `l${i + 1}`;
        nodes[Q] = [x + DIAG, y + DIAG];
        tracks.push({ id: lead, from: P, to: Q });
        switches[P] = { trunk, legs: [sid, lead] };
        trunk = lead; x += DIAG; y += DIAG;
      }
    }
  });
  return { nodes, tracks, switches };
}

// A run-around loop: headshunt, then two parallel tracks between switches L
// and R, then a tail track past R ending in a buffer, with an optional siding
// off the tail.
export function runaround({ head, loop, tail, siding }) {
  const xL = head + 0.45, xR = xL + loop + 0.8;
  const nodes = { H: [0, 0], L: [xL, 0], R: [xR, 0] };
  const tracks = [
    { id: "head", from: "H", to: "L" },
    { id: "main", from: "L", to: "R" },
    { id: "loop", from: "L", to: "R", via: [[xL + DIAG, -DIAG], [xR - DIAG, -DIAG]] },
  ];
  const switches = { L: { trunk: "head", legs: ["main", "loop"] } };
  if (siding) {
    const xS = xR + 0.8 + 1.5;
    nodes.S = [xS, 0];
    nodes.T = [xS + 0.4 + tail + 0.05, 0];
    const h = siding + 0.45 - Math.hypot(DIAG, DIAG) + 0.01;
    nodes.U = [xS + DIAG + h, DIAG];
    tracks.push({ id: "tail0", from: "R", to: "S" });
    tracks.push({ id: "tail", from: "S", to: "T" });
    tracks.push({ id: "spur", from: "S", to: "U", via: [[xS + DIAG, DIAG]] });
    switches.R = { trunk: "tail0", legs: ["main", "loop"] };
    switches.S = { trunk: "tail0", legs: ["tail", "spur"] };
  } else {
    nodes.T = [xR + 0.4 + tail + 0.05, 0];
    tracks.push({ id: "tail", from: "R", to: "T" });
    switches.R = { trunk: "tail", legs: ["main", "loop"] };
  }
  return { nodes, tracks, switches };
}

// Levels. `start` lists each track's contents left to right (tracks run from
// their `from` node to their `to` node, which is left to right on screen):
// L/M = locomotives, A–H = lettered cars, x = an unlettered car, . = empty.
// `goals` list cars left to right too, packed against the `end` node.
export const LEVELS = [
  {
    name: "Delivery",
    blurb: "Push A to its marker.",
    layout: ladder(3, [3, 3]),
    start: { head: "L A" },
    goals: [{ track: "s2", end: "E2", cars: "A" }],
    par: 1,
  },
  {
    name: "Fetch",
    blurb: "Fetch A and take it to its marker.",
    layout: ladder(3, [3, 3]),
    start: { head: "L", s2: ". . A" },
    goals: [{ track: "s1", end: "E1", cars: "A" }],
    par: 3,
  },
  {
    name: "Run around",
    blurb: "Get the loco to the other end of its train.",
    layout: runaround({ head: 4, loop: 4, tail: 4 }),
    start: { head: "L A B C" },
    goals: [{ track: "head", end: "H", cars: "A B C" }],
    par: 4,
  },
  {
    name: "Swap two",
    blurb: "Swap A and B.",
    layout: ladder(3, [3, 3]),
    start: { head: "L", s1: ". A B" },
    goals: [{ track: "s1", end: "E1", cars: "B A" }],
    par: 8,
  },
  {
    name: "Pick out",
    blurb: "Leave only A B C on their siding, in marker order.",
    layout: ladder(4, [5, 3]),
    start: { head: "L", s1: "x B x A C" },
    goals: [{ track: "s1", end: "E1", cars: "A B C" }],
    par: 9,
  },
  {
    name: "Reverse three",
    blurb: "Turn the train around.",
    layout: ladder(4, [4, 3]),
    start: { head: "L", s1: ". A B C" },
    goals: [{ track: "s1", end: "E1", cars: "C B A" }],
    par: 12,
  },
  {
    name: "Three sidings",
    blurb: "Gather A B C D at their markers.",
    layout: ladder(3, [4, 3, 3]),
    start: { head: "L", s1: ". . D B", s2: ". . C", s3: ". . A" },
    goals: [{ track: "s1", end: "E1", cars: "A B C D" }],
    par: 13,
  },
  {
    name: "Pick four",
    blurb: "Pick out A B C D and put them in marker order.",
    layout: ladder(4, [5, 3, 3]),
    start: { head: "L", s1: "x C . A x", s2: "B . D" },
    goals: [{ track: "s1", end: "E1", cars: "A B C D" }],
    par: 17,
    slowPar: true, // ~4M positions, about a minute to check
  },
];
