import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, fringe, card } from "../brush.mjs";
// The hunter: a hooded archer down on one knee, bow drawn, aiming up and to the right.
const { card: bg, ink } = ROLE_COLORS.hunter;
const quiver = [brush([[196, 250], [176, 330]], [34, 30], { cap: "butt" }), ...[0, 1, 2].map((i) => brush([[198 + i * 8, 252], [210 + i * 10, 212]], [5, 5])),
  ...[0, 1, 2].map((i) => blob([[206 + i * 10, 220], [222 + i * 10, 196], [212 + i * 10, 200, "c"], [200 + i * 10, 214]]))];
const cloak = blob([[214, 246], [166, 300], [140, 380], [120, 450], [96, 500, "c"], [150, 486], [200, 470], [230, 420]]);
const backLeg = [brush([[226, 440], [190, 510], [228, 560], [300, 570]], [56, 44, 34, 28], { capStart: "butt" }), blob([[148, 548], [196, 548], [196, 576], [150, 576]])];
const torso = blob([[214, 254], [260, 236], [298, 260], [302, 330], [290, 420], [222, 440], [206, 360]]);
const frontLeg = [brush([[270, 420], [340, 440], [344, 510], [348, 572]], [58, 44, 36, 30], { capStart: "butt" }), blob([[330, 562], [376, 560], [390, 582], [326, 584]])];
const hood = blob([[220, 176], [250, 150], [284, 156], [302, 186], [310, 214], [300, 240], [264, 250], [226, 238], [196, 228, "c"], [212, 206]]);
const face = blob([[282, 178], [300, 186], [306, 202], [318, 214, "c"], [306, 218], [304, 232], [288, 240]]);
// bow held out at arm's length to the upper right, string drawn back to the cheek
const bowArm = [brush([[284, 266], [340, 230], [382, 200]], [32, 26, 22], { capStart: "butt" }), blob([[374, 186], [396, 184], [402, 206], [380, 214]])];
const bow = brush([[352, 100], [396, 140], [404, 200], [384, 262], [340, 296]], [6, 12, 14, 12, 6]);
const string = brush([[352, 100], [290, 206], [340, 296]], [3, 3, 3]);
const arrow = [brush([[290, 206], [440, 170]], [5, 5]), blob([[436, 160], [462, 165, "c"], [440, 182]]), blob([[290, 206], [276, 196, "c"], [296, 200]]), blob([[290, 206], [276, 218, "c"], [298, 212]])];
const drawArm = [brush([[262, 270], [244, 238], [284, 210]], [32, 26, 20], { capStart: "butt" }), blob([[278, 198], [298, 198], [300, 218], [282, 222]])];
const cuts = [
  brush([[280, 166], [278, 206], [290, 242]], [5, 6, 3]),                 // hood opening
  brush([[296, 200], [308, 198]], [4, 3]),                                // eye
  brush([[218, 380], [286, 372]], [5, 5]),                                 // belt
  brush([[172, 330], [146, 420]], [3, 1]),                                 // cloak crease
];
export default card({ bg, ink, transform: "translate(-12 6)", layers: [quiver, { d: cloak }, backLeg, { d: torso }, { group: frontLeg, halo: 4 }, { d: hood }, { d: face },
  cuts.map((d) => ({ d, fill: "bg" })), { d: string }, { group: bowArm, halo: 4 }, { d: bow }, arrow, { group: drawArm, halo: 4 }] });
