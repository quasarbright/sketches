import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, boot, card } from "../brush.mjs";
// The hunter: a hooded archer standing at ease in a long cloak, bow held out in front by the grip, quiver over the shoulder.
const { card: bg, ink } = ROLE_COLORS.hunter;
const legs = [brush([[238, 450], [232, 520], [228, 580]], [34, 28, 24]), boot(232, 596, { s: 24 }), brush([[272, 450], [280, 520], [286, 580]], [34, 28, 24]), boot(290, 596, { s: 24 })];
// quiver on the back; each arrow's tail sticks up with outlined feather vanes
const shafts = [[214, 250, 190, 198], [226, 250, 220, 188], [236, 252, 248, 196]];
const fletch = ([a, b, c, d]) => {
  const L = Math.hypot(c - a, d - b), ux = (c - a) / L, uy = (d - b) / L, nx = -uy, ny = ux;
  const at = (t, k) => [c - ux * t + nx * k, d - uy * t + ny * k];
  // per Mike's sketch: two slim vanes drawn as outlines, one each side of the shaft, swept so their top
  // corners rise past the shaft's end and leave a notch between them
  const seg = (p, q) => brush([p, q], [2.5, 2.5]);
  const vane = (k) => { const p = [at(26, 0), at(20, k), at(-4, k), at(2, 0)]; return [seg(p[0], p[1]), seg(p[1], p[2]), seg(p[2], p[3])]; };
  return [...vane(-6), ...vane(6)];
};
const quiver = [brush([[206, 400], [228, 250]], [28, 26]), ...shafts.map(([a, b, c, d]) => brush([[a, b], [c, d]], [3.5, 3])), ...shafts.flatMap(fletch)];
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
export default card({ bg, ink, transform: "translate(-45 -6)", layers: [{ group: quiver }, legs, { d: cloak }, { d: hood }, { d: face }, cuts.map((d) => ({ d, fill: "bg" })),
  bow[1], { group: arm, halo: 4, roots: [[288, 276, 20]] }, { group: bow[0], halo: 3 }, { d: fist }] });
