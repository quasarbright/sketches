import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, boot, card } from "../brush.mjs";
// The hunter: a hooded archer standing at ease in a long cloak, bow held out in front by the grip, quiver over the shoulder.
const { card: bg, ink } = ROLE_COLORS.hunter;
const legs = [brush([[238, 450], [232, 520], [228, 580]], [34, 28, 24]), boot(232, 596, { s: 24 }), brush([[272, 450], [280, 520], [286, 580]], [34, 28, 24]), boot(290, 596, { s: 24 })];
// quiver on the back, fletching up: notched nocks at the top, vanes tapering into the shafts
const quiver = [brush([[206, 400], [228, 250]], [28, 26]), ...[[218, 248, 206, 204], [228, 250, 222, 200], [236, 252, 240, 204]].map(([a, b, c, d]) => brush([[a, b], [c, d]], [4, 4])),
  ...[[206, 196], [222, 192], [240, 196]].map(([x, y]) => blob([[x - 7, y - 8, "c"], [x, y - 2, "c"], [x + 7, y - 8, "c"], [x + 7, y + 18], [x, y + 28, "c"], [x - 7, y + 18]]))];
// barbs slanting back across each vane, so the fletching reads as feathers
const barbs = [[206, 196], [222, 192], [240, 196]].flatMap(([x, y]) => [brush([[x - 8, y + 2], [x + 8, y + 10]], [2, 2]), brush([[x - 8, y + 10], [x + 8, y + 18]], [2, 2])]);
const cloak = blob([[226, 252], [262, 236], [298, 254], [312, 320], [318, 420], [326, 486, "c"], [290, 476], [256, 486], [222, 478], [190, 488, "c"], [200, 420], [206, 320]]);
const hood = blob([[232, 210], [246, 184], [276, 176], [300, 190], [312, 218], [318, 232, "c"], [306, 236], [306, 254], [286, 268], [256, 266], [236, 248]]);
const face = blob([[290, 206], [306, 210], [312, 226], [318, 234, "c"], [308, 238], [308, 250], [292, 258]]);
// near arm reaches forward and a little down, fist on the grip, bow held upright at arm's length
const fist = blob([[370, 360], [394, 358], [398, 382], [374, 386]]);
const arm = [brush([[288, 276], [334, 328], [372, 368]], [28, 22, 18]), fist];
// the stave bows away from him with small recurved tips; the string runs on his side of it
const bow = [[brush([[356, 236], [372, 280], [382, 330], [385, 372], [382, 414], [372, 464], [356, 508]], [4, 8, 11, 12, 11, 8, 4]),
  brush([[357, 238], [358, 224], [368, 216]], [4, 3, 2]), brush([[357, 506], [358, 520], [368, 528]], [4, 3, 2])],
  brush([[356, 236], [356, 508]], [2, 2])];
const cuts = [
  brush([[296, 222], [306, 224]], [3, 3]),                                     // eye
  brush([[256, 182], [280, 212], [288, 262]], [4, 4, 2]),                       // hood edge
  brush([[244, 290], [236, 380], [232, 474]], [3, 5, 2]), brush([[286, 300], [294, 390], [300, 474]], [3, 5, 2]),   // folds
  brush([[206, 400], [312, 396]], [5, 5]),                                     // belt
];
export default card({ bg, ink, transform: "translate(-45 -6)", layers: [{ group: quiver }, barbs.map((d) => ({ d, fill: "bg" })), legs, { d: cloak }, { d: hood }, { d: face }, cuts.map((d) => ({ d, fill: "bg" })),
  bow[1], { group: arm, halo: 4, roots: [[288, 276, 20]] }, { group: bow[0], halo: 3 }, { d: fist }] });
