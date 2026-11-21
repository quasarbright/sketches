import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, fringe, rect, card } from "../brush.mjs";
// The thief: a hooded, masked cutpurse tiptoeing left with a sack over one shoulder and a stolen card held behind his back.
const { card: bg, ink } = ROLE_COLORS.thief;
const sack = blob([[290, 210], [340, 190], [392, 220], [410, 290], [390, 350], [340, 366], [300, 340], [286, 280]]);
const sackTie = brush([[296, 230], [278, 248], [268, 262]], [26, 20, 16]);
const backLeg = [brush([[268, 420], [312, 480], [324, 550], [346, 580]], [50, 38, 30, 26]), blob([[330, 566], [370, 576], [384, 596], [336, 596]])];
const torso = blob([[222, 248], [262, 236], [292, 262], [292, 330], [284, 420], [228, 428], [210, 360], [206, 290]]);
const frontLeg = [brush([[236, 410], [200, 470], [180, 530], [148, 570]], [54, 40, 32, 26], { capStart: "butt" }), blob([[118, 560], [156, 556], [168, 574], [116, 580]])];
const neck = brush([[236, 216], [240, 246]], [26, 30]);
const head = blob([[202, 176], [226, 162], [254, 166], [264, 192], [260, 220], [244, 236], [218, 238], [206, 228], [192, 214, "c"], [204, 206]]);
const cap = [blob([[196, 196, "c"], [204, 158], [236, 140], [268, 150], [280, 184], [278, 226], [262, 246], [246, 232], [256, 196], [226, 182]]), brush([[262, 156], [296, 160], [320, 186], [330, 222]], [28, 20, 12, 4])];
// mask: a band across the eyes, tails flying back
const maskTails = [brush([[258, 196], [290, 192], [318, 204]], [12, 10, 2]), brush([[258, 202], [286, 212], [306, 230]], [10, 8, 2])];
const farArm = [brush([[276, 262], [304, 250], [298, 226]], [30, 24, 20], { capStart: "butt" })];
const nearArm = [brush([[236, 272], [228, 330], [262, 380], [300, 384]], [34, 28, 22, 20], { capStart: "butt" }), blob([[292, 372], [316, 370], [320, 392], [298, 398]])];
const heldCard = rect(322, 400, 40, 58, 18, 6);
const frontHand = [brush([[214, 268], [176, 290], [152, 274]], [30, 24, 20]), blob([[136, 262], [158, 256], [166, 276], [150, 288], [134, 282]]),
  brush([[144, 262], [134, 244]], [8, 0])];
const cuts = [
  brush([[200, 200], [262, 198]], [14, 14]),                     // mask band
  blob([[214, 196], [226, 192], [228, 202], [216, 206]]),         // eye hole
  brush([[200, 190], [240, 182], [256, 200], [250, 236]], [4, 5, 5, 3]),  // hood edge
  brush([[248, 260], [246, 330], [240, 420]], [3, 4, 2]),          // tunic
  brush([[214, 400], [286, 400]], [5, 5]),                         // belt
  brush([[330, 230], [360, 290], [350, 340]], [3, 4, 1]),          // sack crease
];
export default card({ bg, ink, transform: "translate(6 4)", layers: [{ d: sack }, sackTie, backLeg, { d: torso }, { group: frontLeg, halo: 4 }, neck, maskTails, { d: head }, cap,
  farArm, cuts.slice(2).map((d) => ({ d, fill: "bg" })), { d: cuts[0], fill: ink }, { d: cuts[1], fill: "bg" },
  { group: frontHand, halo: 4 }, { group: nearArm, halo: 4 }, { d: heldCard, halo: 4 }, { d: rect(322, 400, 30, 48, 18, 4), fill: "bg" }, { d: rect(322, 400, 24, 42, 18, 3) }] });
