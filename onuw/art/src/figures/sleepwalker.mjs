import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, fringe, sparkle, card } from "../brush.mjs";
// The sleepwalker: eyes shut, arms out in front, shuffling right in a long nightshirt and a drooping nightcap.
const { card: bg, ink } = ROLE_COLORS.sleepwalker;
const backLeg = [brush([[232, 470], [214, 540], [196, 590]], [34, 28, 24]), blob([[168, 580], [204, 580], [214, 600], [166, 602]])];
const shirt = blob([[214, 250], [262, 236], [294, 262], [304, 340], [318, 420], [334, 500, "c"], [296, 494], [264, 504], [226, 494], [192, 502, "c"], [196, 420], [200, 340]]);
const frontLeg = [brush([[278, 480], [296, 540], [300, 590]], [34, 28, 24]), blob([[286, 580], [328, 578], [338, 600], [284, 602]])];
const head = blob([[230, 170], [258, 158], [286, 166], [300, 192], [306, 204, "c"], [298, 210], [298, 224], [280, 238], [254, 238], [234, 222]]);
const cap = [blob([[222, 178, "c"], [234, 146], [268, 134], [296, 150], [304, 180, "c"], [262, 172]]),
  brush([[250, 140], [210, 130], [176, 150], [160, 190], [166, 220]], [40, 32, 24, 14, 8]), blob([[152, 214], [176, 214], [180, 238], [164, 248], [150, 236]])];
const neck = brush([[260, 226], [262, 250]], [24, 28]);
const arms = [brush([[282, 262], [340, 260], [396, 250]], [30, 24, 20], { capStart: "butt" }), blob([[388, 238], [420, 238], [428, 252], [416, 262], [388, 262]]),
  brush([[262, 270], [326, 290], [382, 284]], [30, 24, 20], { capStart: "butt" }), blob([[374, 272], [406, 274], [414, 288], [400, 296], [374, 296]])];
const zs = [[352, 150, 30], [392, 118, 22], [424, 94, 16]];
const zee = (x, y, s) => brush([[x - s / 2, y - s / 2], [x + s / 2, y - s / 2], [x - s / 2, y + s / 2], [x + s / 2, y + s / 2]], [s * .22, s * .22]);
const cuts = [
  brush([[270, 192], [288, 196]], [3, 3]), brush([[268, 196], [278, 202], [290, 200]], [2, 3, 2]),  // closed eye
  brush([[282, 220], [292, 222]], [3, 2]),                                                         // open mouth
  brush([[226, 178], [302, 182]], [4, 4]),                                                         // cap edge
  brush([[244, 300], [234, 400], [226, 490]], [3, 5, 2]), brush([[288, 330], [300, 420], [306, 490]], [3, 5, 2]), // folds
];
export default card({ bg, ink, transform: "translate(-12 30)", layers: [backLeg, { d: shirt }, frontLeg, neck, { d: head }, cap, cuts.map((d) => ({ d, fill: "bg" })),
  { group: arms, halo: 4 }, zs.map(([x, y, s]) => zee(x, y, s)), sparkle(130, 120, 12), sparkle(100, 300, 10), sparkle(420, 380, 10)] });
