import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, rect, sparkle, boot, card } from "../brush.mjs";
// The alcoholic (role id "sleepwalker"): a peasant swaying on crossed legs, bottle raised, the other arm out for balance.
const { card: bg, ink } = ROLE_COLORS.sleepwalker;
const circle = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
const backLeg = [brush([[238, 466], [222, 530], [204, 584]], [38, 30, 24]), boot(206, 598, { s: 25, dir: -1 })];
const frontLeg = [brush([[270, 466], [244, 530], [262, 584]], [38, 30, 24]), boot(266, 598, { s: 25 })];
const tunic = blob([[226, 262], [276, 250], [304, 278], [306, 360], [312, 470], [292, 486], [250, 482], [210, 478], [214, 380], [210, 300]]);
const neck = brush([[256, 254], [258, 226]], [30, 26]);
// head lolled back and to the side, mouth open
const head = blob([[230, 206], [236, 176], [262, 162], [290, 170], [300, 190], [312, 198, "c"], [302, 206], [304, 218], [294, 226], [298, 236, "c"], [278, 242], [248, 238], [232, 224]]);
const hood = blob([[222, 230, "c"], [226, 186], [246, 162], [276, 156], [294, 168], [282, 176], [258, 180], [246, 204], [244, 240, "c"]]);
const farArm = [brush([[228, 286], [190, 304], [156, 292]], [32, 26, 22]), blob([[140, 280], [160, 278], [166, 296], [146, 302]])];
const bottleArm = [brush([[292, 284], [340, 258], [350, 200]], [32, 26, 22]), blob([[336, 186], [360, 182], [366, 204], [342, 210]])];
const bottle = [rect(358, 170, 30, 58, 50, 10), brush([[336, 190], [314, 208]], [12, 10])];
const drops = [blob([[306, 236, "c"], [312, 246], [306, 252], [300, 246]]), blob([[312, 262, "c"], [316, 270], [312, 274], [308, 270]])];
const cuts = [
  brush([[270, 190], [286, 194]], [4, 3]), brush([[268, 194], [278, 198], [288, 196]], [2, 3, 2]), // half-shut eye
  blob([[290, 220], [302, 220], [298, 228, "c"]]),                                               // open mouth
  brush([[214, 360], [308, 352]], [5, 5]),                                                       // belt
  brush([[254, 290], [248, 352]], [3, 3]), brush([[234, 380], [226, 470]], [4, 1]), brush([[292, 380], [298, 470]], [4, 1]),
];
export default card({ bg, ink, transform: "translate(0 4) rotate(-7 260 600)", layers: [
  [circle(236, 140, 7), circle(218, 116, 5), circle(232, 94, 4)].map((d) => ({ d })), sparkle(110, 150, 12), sparkle(420, 330, 10),
  backLeg, { d: tunic }, { group: frontLeg, halo: 4, roots: [[270, 466, 30]] }, neck, { d: head }, { d: hood }, { group: farArm },
  cuts.map((d) => ({ d, fill: "bg" })), { group: [...bottleArm], halo: 4, roots: [[292, 284, 24]] }, { group: bottle, halo: 4 }, { d: rect(364, 165, 12, 26, 50, 4), fill: "bg" }, drops] });
