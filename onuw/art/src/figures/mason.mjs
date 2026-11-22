import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, rect, sparkle, boot, card } from "../brush.mjs";
// The mason: a lean stonemason in a coif and a long apron, mallet raised, chisel set to a block of stone.
const { card: bg, ink } = ROLE_COLORS.mason;
const block = [rect(404, 494, 112, 124, 0, 6)];
const legs = [brush([[236, 470], [226, 530], [216, 588]], [34, 30, 26]), boot(214, 600, { s: 27 }),
  brush([[268, 470], [282, 530], [290, 588]], [34, 30, 26]), boot(290, 600, { s: 27 })];
const tunic = blob([[218, 268], [262, 258], [292, 284], [300, 370], [310, 470], [318, 496, "c"], [288, 490], [256, 500], [226, 490], [196, 498, "c"], [204, 430], [206, 350]]);
const neck = brush([[258, 226], [258, 262]], [26, 30]);
const head = blob([[230, 196], [244, 170], [270, 162], [290, 172], [298, 196], [312, 210, "c"], [300, 214], [302, 226], [296, 232], [298, 242], [282, 252], [256, 250], [236, 232]]);
const coif = blob([[226, 214, "c"], [228, 180], [248, 160], [276, 156], [292, 170], [290, 188], [268, 182], [254, 196], [250, 226], [238, 244, "c"]]);
// near arm cocks the mallet back at shoulder height; the handle runs through the fist
const malletArm = [brush([[274, 284], [318, 326], [338, 292]], [32, 26, 22]), blob([[326, 276], [350, 272], [356, 296], [332, 302]])];
const mallet = [brush([[332, 314], [358, 232]], [10, 10]), rect(362, 220, 64, 36, 17, 6)];
// far arm sets the chisel's edge on the top of the stone, fist around its shank
const chiselArm = [brush([[268, 296], [300, 372], [342, 404]], [30, 24, 20]), blob([[338, 392], [362, 390], [366, 414], [342, 418]])];
const chisel = brush([[334, 386], [380, 438]], [9, 5]);
const chips = [sparkle(402, 414, 10), sparkle(424, 398, 7), blob([[388, 418], [396, 412], [398, 422]])];
const cuts = [
  brush([[226, 214], [252, 198], [256, 230], [244, 248]], [4, 4, 4, 3]),            // coif edge
  brush([[284, 196], [296, 196]], [4, 3]),                                          // eye
  brush([[236, 362], [268, 366], [302, 360]], [4, 4, 4]), brush([[238, 366], [234, 440], [236, 506]], [4, 4, 2]), // apron tie and edge
  brush([[250, 506], [250, 560]], [4, 1]),
  brush([[352, 470], [458, 470]], [4, 4]), brush([[352, 520], [458, 520]], [4, 4]), // stone courses
  brush([[400, 434], [400, 470]], [4, 4]), brush([[380, 470], [380, 520]], [4, 4]), brush([[424, 520], [424, 556]], [4, 4]),
];
export default card({ bg, ink, transform: "translate(-6 46) scale(.9)", layers: [sparkle(110, 150, 12), sparkle(120, 360, 9), { group: chiselArm }, legs, { d: tunic }, neck, { d: head }, { d: coif },
cuts.map((d) => ({ d, fill: "bg" })), { group: block, halo: 4 }, cuts.slice(4).map((d) => ({ d, fill: "bg" })), { group: [chisel], halo: 3 }, { group: chiselArm.slice(1), halo: 3 }, chips,
  { group: [mallet], halo: 4 }, { group: malletArm, halo: 4, roots: [[272, 284, 24]] }] });
