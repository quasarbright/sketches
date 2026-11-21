import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, sparkle, boot, card } from "../brush.mjs";
// The night owl (the insomniac): a villager up all night in nightshirt and nightcap, slumped and heavy-eyed,
// holding a guttering candle. Facing right.
const { card: bg, ink } = ROLE_COLORS.nightowl;
const moon = `M112 120a46 46 0 1 0 32 78a37 37 0 1 1 -32 -78z`;
const legs = [brush([[236, 520], [232, 584]], [30, 26]), boot(232, 598, { s: 23 }), brush([[276, 520], [282, 584]], [30, 26]), boot(284, 598, { s: 23 })];
const shirt = blob([[222, 262], [262, 248], [296, 268], [306, 340], [316, 430], [324, 540, "c"], [290, 534], [256, 544], [222, 534], [194, 540, "c"], [200, 430], [206, 340]]);
const neck = brush([[262, 242], [266, 262]], [24, 28]);
// head hung forward and low
const head = blob([[244, 196], [270, 184], [296, 194], [308, 218], [316, 232, "c"], [306, 236], [306, 250], [290, 262], [264, 260], [248, 244]]);
const cap = [blob([[236, 206, "c"], [248, 176], [280, 166], [306, 182], [312, 206, "c"], [272, 198]]),
  brush([[262, 172], [226, 170], [200, 196], [194, 236]], [36, 28, 18, 8]), `M194 244m-12 0a12 12 0 1 0 24 0a12 12 0 1 0 -24 0z`];
// the far arm hangs; the near arm holds the candle out in front at chest height
const farArm = [brush([[234, 280], [222, 350], [222, 410]], [28, 24, 20]), blob([[210, 404], [232, 402], [236, 424], [214, 428]])];
const nearArm = [brush([[290, 282], [312, 340], [350, 352]], [30, 24, 20]), blob([[344, 340], [366, 338], [370, 360], [348, 364]])];
const candle = [blob([[338, 362, "c"], [384, 362, "c"], [376, 374], [346, 374]]), brush([[361, 360], [361, 318]], [14, 14], { cap: "butt" }),
  blob([[361, 310], [367, 300], [362, 284, "c"], [356, 298]])];
const cuts = [
  brush([[282, 216], [298, 220]], [4, 4]), brush([[282, 224], [292, 228], [300, 226]], [2, 3, 1]),   // drooping lid and a bag under it
  brush([[296, 246], [304, 246]], [3, 2]),                                                          // slack mouth
  brush([[236, 206], [312, 206]], [4, 4]),                                                          // cap brim
  brush([[248, 300], [240, 420], [234, 530]], [3, 5, 2]), brush([[290, 320], [300, 430], [306, 530]], [3, 5, 2]),   // folds
];
export default card({ bg, ink, transform: "translate(0 -22)", layers: [{ d: moon }, sparkle(420, 150, 12), sparkle(150, 330, 9), sparkle(420, 420, 9),
  { group: farArm }, legs, { d: shirt }, neck, { d: head }, cap, cuts.map((d) => ({ d, fill: "bg" })),
  { group: nearArm, halo: 4, roots: [[290, 282, 22]] }, { group: candle, halo: 4 }] });
