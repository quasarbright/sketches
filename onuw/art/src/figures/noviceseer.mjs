import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, rect, sparkle, card, minicard } from "../brush.mjs";
// The novice seer: a young girl in a short hooded cape, holding a face-down card low, about to sneak
// a look at it. Facing right.
const { card: bg, ink } = ROLE_COLORS.noviceseer;
const robe = blob([[226, 290], [272, 282], [296, 320], [306, 420], [322, 540], [334, 596, "c"], [292, 590], [256, 600], [218, 590], [178, 598, "c"], [192, 520], [204, 420], [210, 340]]);
const cape = blob([[214, 288], [250, 262], [292, 270], [316, 304], [326, 352, "c"], [296, 336], [266, 352], [236, 336], [206, 354], [190, 344, "c"]]);
const hood = blob([[226, 226], [244, 192], [274, 182], [298, 196], [306, 226], [310, 262], [290, 282], [250, 282], [228, 266]]);
const face = blob([[288, 204], [302, 210], [308, 224], [316, 234, "c"], [306, 238], [306, 248], [300, 254], [300, 262], [288, 270], [278, 250]]);
// both hands in front holding the card low, the near one holding its edge
const arm = [brush([[284, 318], [312, 360], [336, 366]], [24, 20, 16]), blob([[328, 354], [348, 352], [350, 372], [330, 374]])];
const stars = [sparkle(120, 170, 14), sparkle(420, 240, 18), sparkle(140, 420, 9), sparkle(440, 470, 10)];
const cuts = [
  brush([[290, 202], [282, 240], [292, 278]], [4, 5, 3]),               // hood opening
  brush([[296, 224], [306, 226]], [3, 2]),                              // eye, glancing down
  brush([[236, 380], [228, 480], [218, 580]], [3, 5, 2]), brush([[274, 380], [286, 480], [300, 580]], [3, 5, 2]),
];
export default card({ bg, ink, transform: "translate(-20 -10)", layers: [stars, { d: robe }, { d: hood }, { d: face }, { d: cape }, cuts.map((d) => ({ d, fill: "bg" })),
  minicard(366, 382, 76), { group: arm, halo: 3, roots: [[284, 318, 18]] }] });
