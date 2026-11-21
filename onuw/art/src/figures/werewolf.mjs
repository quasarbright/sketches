import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, fringe, claws, sparkle, card } from "../brush.mjs";
// A tall werewolf in a ragged cloak, upright on its toes, ears up, one clawed hand reaching out.
const { card: bg, ink } = ROLE_COLORS.werewolf;
const moon = `M150 112a46 46 0 1 0 32 78a37 37 0 1 1 -32 -78z`;
const tailPath = [[214, 456], [170, 484], [140, 530], [138, 586]];
const tail = [brush(tailPath, [24, 44, 38, 4]), ...fringe(tailPath, { n: 9, len: [12, 22], w: 12, side: 1, lean: .8, seed: 3, from: .25 }), ...fringe(tailPath, { n: 9, len: [12, 22], w: 12, side: -1, lean: .8, seed: 4, from: .25 })];
const leg = (dx) => [brush([[250 + dx, 470], [244 + dx, 528], [268 + dx, 560], [262 + dx, 596]], [36, 30, 20, 16]),
  blob([[254 + dx, 588], [290 + dx, 590], [300 + dx, 604], [252 + dx, 606]]), ...[0, 10, 20].map((d) => brush([[284 + dx + d / 2, 596], [296 + dx + d / 2, 604]], [6, 0]))];
const cloak = blob([[232, 226], [292, 222], [318, 262], [322, 330], [314, 420], [304, 500], [288, 522, "c"], [268, 500], [246, 526, "c"], [226, 500], [204, 524, "c"], [186, 496], [160, 516, "c"], [168, 440], [184, 360], [204, 288]]);
const collar = fringe([[226, 236], [262, 218], [304, 226], [324, 248]], { n: 11, len: [14, 28], w: 16, side: -1, lean: .25, seed: 11 });
const mane = fringe([[256, 160], [242, 196], [246, 232]], { n: 6, len: [16, 30], w: 16, side: 1, lean: .55, seed: 12 });
const head = blob([[244, 190], [250, 160], [272, 144], [300, 150], [320, 164], [350, 176], [384, 188, "c"], [374, 202], [348, 208], [324, 220], [300, 234], [268, 234], [250, 216]]);
const ears = [blob([[256, 158, "c"], [254, 118], [264, 92, "c"], [282, 120], [288, 150]]), blob([[280, 150, "c"], [292, 116], [310, 96, "c"], [312, 130], [304, 158]])];
const arm = [brush([[296, 276], [332, 318], [370, 300]], [34, 26, 22], { capStart: "butt" }), ...claws([384, 292], -20, { size: 1.05, spread: 80, curl: -16, len: 40 })];
const cuts = [
  brush([[312, 172], [330, 176]], [6, 3]), brush([[306, 162], [334, 168]], [3, 0]),        // eye, brow
  brush([[338, 196], [362, 196], [374, 194]], [3, 4, 2]),                                   // mouth
  brush([[266, 142], [268, 112]], [6, 0]), brush([[292, 146], [302, 116]], [6, 0]),         // inner ears
  brush([[300, 300], [298, 400], [290, 500]], [3, 5, 2]), brush([[250, 280], [232, 400], [208, 512]], [3, 6, 2]), brush([[206, 320], [184, 430], [168, 504]], [3, 4, 1]), // cloak folds
  brush([[296, 264], [306, 300]], [5, 2]),                                                 // where the arm comes out of the cloak
];
export default card({ bg, ink, transform: "translate(-14 10)", layers: [{ d: moon }, sparkle(96, 230, 12), sparkle(420, 120, 16), sparkle(432, 380, 10),
  tail, leg(-30), leg(14), { d: cloak }, collar, mane, ears, { d: head }, cuts.map((d) => ({ d, fill: "bg" })), { group: arm, halo: 4 }] });
