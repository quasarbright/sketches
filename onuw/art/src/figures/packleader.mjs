import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, fringe, claws, rect, card } from "../brush.mjs";
// The pack leader: a big upright wolf in a ragged fur-collared cloak, holding out the spare card.
const { card: bg, ink } = ROLE_COLORS.packleader;
const cloak = blob([[200, 236], [150, 300], [118, 400], [96, 500], [80, 600, "c"], [120, 584], [150, 602], [184, 586], [214, 604], [240, 590], [258, 420], [270, 300], [262, 240]]);
const tatters = [[90, 596], [122, 590], [156, 600], [190, 594]].map(([x, y], i) => brush([[x + 10, y - 20], [x + 2, y + 6], [x - 4, y + 18 + (i % 2) * 8]], [16, 10, 0]));
const farLeg = brush([[276, 420], [300, 500], [302, 588]], [56, 42, 32]);
const farFoot = blob([[278, 578], [320, 574], [340, 598], [282, 606]]);
const torso = blob([[214, 238], [276, 226], [318, 250], [330, 310], [318, 370], [300, 430], [232, 436], [220, 370], [208, 300]]);
const nearLeg = brush([[240, 420], [236, 500], [244, 588]], [62, 46, 34], { capStart: "butt" });
const nearFoot = blob([[222, 578], [266, 574], [286, 598], [226, 606]]);
const collar = [blob([[180, 236], [220, 210], [280, 212], [320, 238], [292, 266], [230, 268], [190, 262]]),
  ...fringe([[176, 248], [220, 222], [280, 220], [326, 244]], { n: 16, len: [26, 50], w: 20, side: -1, lean: .25, seed: 41 }),
  ...fringe([[186, 262], [240, 272], [300, 262]], { n: 9, len: [14, 26], w: 16, side: 1, lean: .1, seed: 42 })];
const head = blob([[232, 156], [266, 138], [302, 146], [330, 160], [366, 168, "c"], [370, 190], [344, 200], [326, 214], [292, 226], [254, 216], [232, 190]]);
const jaw = blob([[296, 204], [334, 202], [356, 196, "c"], [340, 214], [306, 222]]);
const ears = [blob([[242, 160, "c"], [242, 126], [256, 100, "c"], [270, 124], [276, 150]]), blob([[268, 150, "c"], [278, 120], [296, 104, "c"], [300, 132], [296, 156]])];
const ruff = fringe([[244, 196], [262, 220], [296, 228]], { n: 6, len: [14, 26], w: 14, side: 1, lean: .4, seed: 43 });
const arm = [brush([[296, 262], [340, 284], [384, 262], [404, 230]], [46, 36, 28, 24], { capStart: "butt" })];
const hand = claws([410, 218], -80, { size: 1.05, spread: 90, curl: 20, len: 36 });
const heldCard = rect(420, 168, 56, 80, 10, 8);
const cuts = [
  brush([[256, 300], [262, 350], [258, 420]], [4, 5, 3]), brush([[290, 300], [292, 340], [284, 400]], [4, 5, 3]),   // chest fur
  brush([[300, 200], [336, 200], [356, 194]], [3, 4, 2]),                                                       // mouth
  brush([[300, 166], [318, 168]], [6, 3]), brush([[292, 156], [324, 160]], [4, 0]),                             // eye and brow
  brush([[256, 140], [258, 116]], [6, 0]),                                                                     // inner ear
  brush([[214, 300], [190, 420], [160, 560]], [4, 6, 2]), brush([[240, 320], [230, 460], [214, 580]], [3, 5, 2]), // cloak folds
  brush([[266, 440], [270, 520], [272, 590]], [4, 4, 2]),
];
export default card({ bg, ink, transform: "translate(-34 10) scale(1.02)", layers: [cloak, tatters, farLeg, farFoot, { d: torso }, nearLeg, nearFoot,
  { group: collar }, { d: jaw }, { d: head }, ears, ruff, cuts.map((d) => ({ d, fill: "bg" })), { group: [arm, hand], halo: 4 }, blob([[276, 240], [322, 248], [330, 290], [300, 300], [276, 280]]),
  { d: heldCard, halo: 5 }, { d: rect(420, 168, 44, 68, 10, 5), fill: "bg" }, { d: rect(420, 168, 38, 62, 10, 4) },
  // a wolf's head on the card face, cut in the card color
  { d: blob([[404, 176], [412, 160], [418, 146, "c"], [424, 158], [434, 150, "c"], [434, 166], [444, 178, "c"], [430, 182], [420, 192], [408, 188]]), fill: "bg" }] });
