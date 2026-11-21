import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, boot, card } from "../brush.mjs";
// The hunter: a hooded archer standing at ease in a long cloak, bow held upright at his side, quiver over the shoulder.
const { card: bg, ink } = ROLE_COLORS.hunter;
const legs = [brush([[238, 450], [232, 520], [228, 580]], [34, 28, 24]), boot(232, 596, { s: 24 }), brush([[272, 450], [280, 520], [286, 580]], [34, 28, 24]), boot(290, 596, { s: 24 })];
// quiver on the back, arrows fletched above the shoulder
const quiver = [brush([[206, 400], [228, 250]], [28, 26]), ...[[218, 248, 206, 196], [228, 250, 222, 192], [236, 252, 240, 196]].map(([a, b, c, d]) => brush([[a, b], [c, d]], [4, 4])),
  ...[[206, 196], [222, 192], [240, 196]].map(([x, y]) => blob([[x - 6, y + 18], [x - 6, y + 2], [x, y - 6, "c"], [x + 6, y + 2], [x + 6, y + 18], [x, y + 12]]))];
const cloak = blob([[226, 252], [262, 236], [298, 254], [312, 320], [318, 420], [326, 486, "c"], [290, 476], [256, 486], [222, 478], [190, 488, "c"], [200, 420], [206, 320]]);
const hood = blob([[232, 210], [246, 184], [276, 176], [300, 190], [312, 218], [318, 232, "c"], [306, 236], [306, 254], [286, 268], [256, 266], [236, 248]]);
const face = blob([[290, 206], [306, 210], [312, 226], [318, 234, "c"], [308, 238], [308, 250], [292, 258]]);
// near arm hangs straight, hand at the hip gripping the bow
const arm = [brush([[288, 270], [300, 330], [306, 386]], [28, 24, 20]), blob([[296, 380], [318, 378], [322, 400], [300, 404]])];
const bow = [brush([[330, 196], [362, 248], [374, 320], [362, 394], [330, 450], [312, 472]], [4, 8, 11, 11, 8, 4]),
  brush([[330, 196], [312, 472]], [2, 2])];
const cuts = [
  brush([[296, 222], [306, 224]], [3, 3]),                                     // eye
  brush([[256, 182], [280, 212], [288, 262]], [4, 4, 2]),                       // hood edge
  brush([[244, 290], [236, 380], [232, 474]], [3, 5, 2]), brush([[286, 300], [294, 390], [300, 474]], [3, 5, 2]),   // folds
  brush([[206, 400], [312, 396]], [5, 5]),                                     // belt
];
export default card({ bg, ink, transform: "translate(-28 -6)", layers: [{ group: quiver }, legs, { d: cloak }, { d: hood }, { d: face }, cuts.map((d) => ({ d, fill: "bg" })),
  bow[1], { group: arm, halo: 4, roots: [[288, 270, 20]] }, { group: [bow[0]], halo: 3 }, { d: blob([[296, 380], [318, 378], [322, 400], [300, 404]]) }] });
