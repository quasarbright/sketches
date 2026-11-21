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
// near arm swings the mallet up over the shoulder
const malletArm = [brush([[274, 284], [324, 258], [326, 206]], [32, 26, 22]), blob([[314, 192], [338, 190], [342, 212], [318, 216]])];
const mallet = [brush([[328, 206], [350, 132]], [10, 10]), rect(355, 114, 62, 36, 16, 6)];
// far arm holds the chisel to the stone
const chiselArm = [brush([[268, 296], [310, 356], [346, 392]], [30, 24, 20]), blob([[338, 380], [360, 378], [364, 400], [342, 404]])];
const chisel = brush([[350, 388], [374, 432]], [8, 4]);
const chips = [sparkle(392, 416, 10), sparkle(414, 402, 7), blob([[378, 404], [386, 398], [388, 408]])];
const cuts = [
  brush([[226, 214], [252, 198], [256, 230], [244, 248]], [4, 4, 4, 3]),            // coif edge
  brush([[284, 196], [296, 196]], [4, 3]),                                          // eye
  brush([[236, 362], [268, 366], [302, 360]], [4, 4, 4]), brush([[238, 366], [234, 440], [236, 506]], [4, 4, 2]), // apron tie and edge
  brush([[250, 506], [250, 560]], [4, 1]),
  brush([[352, 470], [458, 470]], [4, 4]), brush([[352, 520], [458, 520]], [4, 4]), // stone courses
  brush([[400, 434], [400, 470]], [4, 4]), brush([[380, 470], [380, 520]], [4, 4]), brush([[424, 520], [424, 556]], [4, 4]),
];
export default card({ bg, ink, transform: "translate(-6 46) scale(.9)", layers: [sparkle(110, 150, 12), sparkle(120, 360, 9), { group: chiselArm }, legs, { d: tunic }, neck, { d: head }, { d: coif },
cuts.map((d) => ({ d, fill: "bg" })), { group: block, halo: 4 }, cuts.slice(4).map((d) => ({ d, fill: "bg" })), chisel, chips,
  { group: [mallet], halo: 4 }, { group: malletArm, halo: 4, roots: [[272, 284, 24]] }] });
