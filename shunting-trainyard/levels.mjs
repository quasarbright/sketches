// Layouts and levels. Coordinates are in car lengths, y grows downward.
//
// Tracks between switches must be whole numbers of cars long (see yard.mjs),
// so every diagonal is a 3-4-5 triangle: a run of 1.6 and a rise of 1.2 is
// exactly 2 cars, and a run of 2 with a rise of 1.5 is 2.5.

const RUN = 1.6, RISE = 1.2; // a ladder rung: 2 cars long
const SPARE = 0.15;          // room left over at each buffer stop

// A headshunt of `head` slots on the left, then a ladder of switches fanning
// sidings off to the right. lens[i] = slots in siding i (top to bottom).
export function ladder(head, lens) {
  const nodes = { H: [0, 0] }, tracks = [], switches = {};
  let x = head + SPARE, y = 0, trunk = "head";
  nodes.P1 = [x, y];
  tracks.push({ id: "head", from: "H", to: "P1" });
  for (let i = 0; i < lens.length; i++) {
    const P = `P${i + 1}`, sid = `s${i + 1}`, E = `E${i + 1}`;
    nodes[E] = [x + lens[i] + SPARE, y];
    tracks.push({ id: sid, from: P, to: E });
    if (i + 1 === lens.length) break;
    if (i + 2 === lens.length) {
      // the last switch's diverging leg drops a row and becomes the last siding
      const E2 = `E${i + 2}`;
      nodes[E2] = [x + RUN + lens[i + 1] + SPARE - 2, y + RISE];
      tracks.push({ id: `s${i + 2}`, from: P, to: E2, via: [[x + RUN, y + RISE]] });
      switches[P] = { trunk, legs: [sid, `s${i + 2}`] };
      break;
    }
    const Q = `P${i + 2}`, lead = `l${i + 1}`;
    nodes[Q] = [x + RUN, y + RISE];
    tracks.push({ id: lead, from: P, to: Q });
    switches[P] = { trunk, legs: [sid, lead] };
    trunk = lead; x += RUN; y += RISE;
  }
  return { nodes, tracks, switches };
}

// A run-around loop: headshunt, then two parallel tracks between switches L
// and R (the loop is one car longer than the main), then a tail past R
// ending in a buffer, with an optional siding off the tail.
export function runaround({ head, main, tail, siding }) {
  const xL = head + SPARE, xR = xL + main;
  const nodes = { H: [0, 0], L: [xL, 0], R: [xR, 0] };
  const tracks = [
    { id: "head", from: "H", to: "L" },
    { id: "main", from: "L", to: "R" },
    { id: "loop", from: "L", to: "R", via: [[xL + 2, -1.5], [xR - 2, -1.5]] },
  ];
  const switches = { L: { trunk: "head", legs: ["main", "loop"] } };
  if (siding) {
    const xS = xR + 1;
    nodes.S = [xS, 0];
    nodes.T = [xS + tail + SPARE, 0];
    nodes.U = [xS + RUN + siding + SPARE - 2, RISE];
    tracks.push({ id: "tail0", from: "R", to: "S" });
    tracks.push({ id: "tail", from: "S", to: "T" });
    tracks.push({ id: "spur", from: "S", to: "U", via: [[xS + RUN, RISE]] });
    switches.R = { trunk: "tail0", legs: ["main", "loop"] };
    switches.S = { trunk: "tail0", legs: ["tail", "spur"] };
  } else {
    nodes.T = [xR + tail + SPARE, 0];
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
    layout: runaround({ head: 4, main: 4, tail: 4 }),
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
    par: 9,
  },
  {
    name: "Pick out",
    blurb: "Leave only A B C on their siding, in marker order.",
    layout: ladder(4, [5, 3]),
    start: { head: "L", s1: "x B x A C" },
    goals: [{ track: "s1", end: "E1", cars: "A B C" }],
    par: 10,
  },
  {
    name: "Reverse three",
    blurb: "Turn the train around.",
    layout: ladder(4, [4, 3]),
    start: { head: "L", s1: ". A B C" },
    goals: [{ track: "s1", end: "E1", cars: "C B A" }],
    par: 13,
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
    par: 21,
    slowPar: true, // ~4M positions, about a minute to check
  },
];
