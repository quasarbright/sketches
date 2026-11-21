import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, fringe, claws, rect, eye, card } from "../brush.mjs";
// The pack leader: a big werewolf standing tall in a heavy fur mantle, holding the spare card up high.
const { card: bg, ink } = ROLE_COLORS.packleader;
const tailPath = [[232, 400], [192, 414], [162, 448], [150, 494], [160, 540]];
const tail = [brush(tailPath, [18, 42, 48, 30, 0]),
  ...fringe(tailPath, { n: 11, len: [16, 30], w: 13, side: 1, lean: .75, seed: 5, from: .15, to: .8 }),
  ...fringe(tailPath, { n: 11, len: [16, 30], w: 13, side: -1, lean: .75, seed: 6, from: .15, to: .8 })];
const leg = (dx, s = 1) => [brush([[272 + dx, 396], [312 + dx, 456], [262 + dx, 518], [284 + dx, 588]], [84 * s, 54 * s, 24, 20]),
  blob([[264 + dx, 580], [304 + dx, 580], [318 + dx, 596], [262 + dx, 602]]), ...[0, 9, 18].map((d) => brush([[300 + dx + d / 2, 592], [314 + dx + d / 2, 602]], [7, 0]))];
const farArm = [brush([[250, 270], [226, 340], [214, 394]], [40, 30, 24]), ...claws([210, 410], 100, { size: .95, spread: 70, curl: 14, len: 40 })];
const torso = blob([[236, 230], [300, 218], [340, 250], [348, 304], [336, 362], [308, 404], [264, 418], [232, 398], [222, 340], [222, 280]]);
// a heavy mantle of fur over the shoulders: the leader's mark
const mantle = [blob([[214, 236], [254, 206], [312, 206], [352, 236], [356, 280], [320, 296], [270, 300], [222, 292], [206, 268]]),
  ...fringe([[206, 278], [250, 300], [300, 300], [356, 282]], { n: 14, len: [18, 34], w: 16, side: 1, lean: .1, seed: 41 }),
  ...fringe([[210, 238], [252, 206], [312, 204], [354, 234]], { n: 12, len: [12, 22], w: 14, side: -1, lean: .2, seed: 42 })];
const head = blob([[244, 182], [250, 152], [272, 136], [300, 142], [320, 156], [350, 168], [386, 180, "c"], [376, 194], [350, 200], [326, 212], [302, 226], [268, 226], [250, 208]]);
const jaw = blob([[320, 206], [350, 200], [372, 198, "c"], [356, 214], [326, 222]]);
const ears = [blob([[256, 150, "c"], [252, 110], [262, 84, "c"], [282, 112], [288, 142]]), blob([[280, 142, "c"], [292, 108], [312, 88, "c"], [314, 122], [304, 150]])];
const arm = [brush([[324, 252], [372, 236], [396, 196], [404, 160]], [46, 36, 28, 24]), ...claws([406, 146], -84, { size: 1, spread: 80, curl: 16, len: 34 })];
const C = [408, 104, 8];
const cuts = [
  eye(316, 164, { len: 26, h: 12, angle: 14 }), brush([[294, 150], [318, 152], [340, 162]], [3, 6, 1]),     // eye and heavy brow
  brush([[340, 192], [364, 192], [380, 188]], [3, 4, 2]),                                                    // mouth
  ...[[344, 196], [358, 196]].map(([x, y]) => blob([[x, y - 1], [x + 5, y - 1], [x + 2.5, y + 9, "c"]])),   // fangs
  brush([[264, 134], [266, 104]], [6, 0]), brush([[292, 138], [304, 108]], [6, 0]),                          // inner ears
  brush([[282, 320], [288, 360], [280, 396]], [4, 5, 1]), brush([[306, 322], [314, 356], [306, 392]], [3, 4, 1]),   // chest fur
  brush([[246, 160], [262, 186], [270, 214]], [3, 4, 1]),                                                    // scar across the cheek
];
export default card({ bg, ink, transform: "translate(-4 54) scale(.93)", layers: [tail, { group: farArm }, leg(-42, .9), { d: torso }, ears, { d: head }, { d: jaw },
  { group: leg(0), halo: 4, roots: [[268, 394, 42]] }, cuts.map((d) => ({ d, fill: "bg" })), { group: mantle },
  { group: arm, halo: 4, roots: [[320, 252, 30]] },
  { d: rect(C[0], C[1], 56, 80, C[2], 8), halo: 5 }, { d: rect(C[0], C[1], 44, 68, C[2], 5), fill: "bg" }, { d: rect(C[0], C[1], 38, 62, C[2], 4) },
  { d: blob([[394, 112], [400, 96], [404, 82, "c"], [410, 94], [420, 86, "c"], [420, 102], [428, 116, "c"], [414, 120], [406, 128], [394, 124]]), fill: "bg" }] });
