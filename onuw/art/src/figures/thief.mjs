import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, fringe, rect, card, minicard } from "../brush.mjs";
// The thief: a hooded, masked cutpurse tiptoeing left with a sack over his shoulder, holding a stolen card out in front.
const { card: bg, ink } = ROLE_COLORS.thief;
const sack = blob([[290, 210], [340, 190], [392, 220], [410, 290], [390, 350], [340, 366], [300, 340], [286, 280]]);
const sackTie = brush([[296, 230], [278, 248], [268, 262]], [26, 20, 16]);
const backLeg = [brush([[268, 420], [312, 480], [324, 550], [346, 580]], [50, 38, 30, 26]), blob([[330, 566], [370, 576], [384, 596], [336, 596]])];
const torso = blob([[222, 248], [262, 236], [292, 262], [292, 330], [284, 420], [228, 428], [210, 360], [206, 290]]);
const frontLeg = [brush([[236, 410], [200, 470], [180, 530], [148, 570]], [54, 40, 32, 26]), blob([[118, 560], [156, 556], [168, 574], [116, 580]])];
const neck = brush([[236, 216], [240, 246]], [26, 30]);
const head = blob([[202, 176], [226, 162], [254, 166], [264, 192], [260, 220], [244, 236], [218, 238], [206, 228], [192, 214, "c"], [204, 206]]);
const cap = [blob([[196, 196, "c"], [204, 158], [236, 140], [268, 150], [280, 184], [278, 226], [262, 246], [246, 232], [256, 196], [226, 182]]), brush([[262, 156], [296, 160], [320, 186], [330, 222]], [28, 20, 12, 4])];
// mask: a band across the eyes, tails flying back
const maskTails = [brush([[258, 196], [290, 192], [318, 204]], [12, 10, 2]), brush([[258, 202], [286, 212], [306, 230]], [10, 8, 2])];
// far hand holds the sack's neck over his shoulder; near hand holds the stolen card out in front
const farArm = [brush([[276, 262], [300, 248], [292, 234]], [30, 24, 20])];
const nearArm = [brush([[238, 276], [206, 334], [164, 312]], [34, 28, 22]), blob([[146, 292], [170, 290], [178, 312], [160, 322], [144, 312]])];
const C = [144, 262, -12];
const cuts = [
  brush([[200, 200], [262, 198]], [14, 14]),                     // mask band
  blob([[214, 196], [226, 192], [228, 202], [216, 206]]),         // eye hole
  brush([[200, 190], [240, 182], [256, 200], [250, 236]], [4, 5, 5, 3]),  // hood edge
  brush([[248, 260], [246, 330], [240, 420]], [3, 4, 2]),          // tunic
  brush([[214, 400], [286, 400]], [5, 5]),                         // belt
  brush([[330, 230], [360, 290], [350, 340]], [3, 4, 1]),          // sack crease
];
export default card({ bg, ink, transform: "translate(-17 0) translate(6 4)", layers: [{ d: sack }, sackTie, backLeg, { d: torso }, { group: frontLeg, halo: 4, roots: [[236, 410, 34]] }, neck, maskTails, { d: head }, cap,
  farArm, cuts.slice(2).map((d) => ({ d, fill: "bg" })), { d: cuts[0], fill: ink }, { d: cuts[1], fill: "bg" },
  { group: nearArm, halo: 4, roots: [[238, 276, 24]] },
  minicard(...C)] });
