import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, fringe, rect, card } from "../brush.mjs";
// The mason: a stocky stonemason in a leather apron, a mallet over his shoulder and a block under his arm.
const { card: bg, ink } = ROLE_COLORS.mason;
const legs = [brush([[226, 440], [218, 520], [212, 586]], [58, 46, 40]), brush([[292, 440], [300, 520], [306, 586]], [58, 46, 40]),
  blob([[180, 576], [236, 574], [244, 606], [176, 608]]), blob([[284, 576], [338, 574], [346, 606], [280, 608]])];
const torso = blob([[200, 262], [258, 240], [318, 262], [336, 330], [326, 400], [314, 450], [204, 450], [190, 400], [182, 330]]);
const apron = blob([[214, 330], [302, 330], [312, 420], [318, 520], [200, 520], [206, 420]]);
const neck = brush([[258, 214], [258, 250]], [44, 50]);
const head = blob([[222, 170], [254, 152], [288, 160], [302, 190], [298, 222], [282, 244], [256, 254], [230, 244], [216, 216]]);
const beard = blob([[226, 216], [256, 232], [292, 216], [298, 244], [278, 276], [256, 284], [234, 276], [218, 246]]);
const cap = blob([[214, 178, "c"], [228, 146], [260, 134], [292, 146], [306, 178, "c"], [260, 170]]);
const mallet = [brush([[196, 336], [170, 250], [156, 196]], [13, 13, 13], { cap: "butt" }), rect(152, 178, 84, 46, -14, 8)];
const block = rect(352, 380, 86, 70, -8, 4);
const farArm = [brush([[316, 274], [356, 320], [372, 370]], [42, 36, 30], { capStart: "butt" })];
const nearArm = [brush([[208, 276], [190, 320], [196, 340]], [44, 36, 30], { capStart: "butt" }), blob([[180, 322], [212, 320], [214, 350], [184, 354]])];
const shoulder = blob([[190, 268], [240, 254], [246, 300], [200, 304]]);
const cuts = [
  brush([[214, 330], [258, 300], [302, 330]], [4, 4, 4]),               // apron strap
  brush([[238, 420], [282, 420]], [4, 4]), brush([[240, 420], [242, 470], [282, 470], [280, 420]], [3, 3, 3, 3]), // pocket
  brush([[252, 520], [252, 586]], [4, 2]),                              // between the legs
  brush([[242, 196], [256, 194]], [5, 3]), brush([[272, 196], [286, 196]], [5, 3]),   // eyes
  brush([[220, 160], [300, 160]], [3, 3]),                              // cap brim
  brush([[316, 366], [390, 356]], [3, 3]), brush([[330, 400], [384, 394]], [3, 3]),   // stone courses
  brush([[356, 360], [358, 380]], [3, 3]),
];
export default card({ bg, ink, transform: "translate(-4 0)", layers: [legs, { d: torso }, { d: apron }, neck, { d: head }, { d: beard }, { d: cap },
  { group: [block], halo: 4 }, farArm, cuts.map((d) => ({ d, fill: "bg" })), { group: [mallet], halo: 4 }, { group: nearArm, halo: 4 }, { d: shoulder }] });
