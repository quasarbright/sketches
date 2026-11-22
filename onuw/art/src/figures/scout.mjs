import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, rect, boot, card } from "../brush.mjs";
// The ward (a squire): a young page standing at attention for his masters, carrying their tall lance
// and a big kite shield marked with a wolf's head.
const { card: bg, ink } = ROLE_COLORS.scout;
const lance = [brush([[332, 600], [332, 160]], [12, 10]), blob([[324, 164], [332, 108, "c"], [340, 164]]),
  blob([[332, 176], [400, 188], [380, 206, "c"], [404, 226], [332, 222]])]; // pennant
const legs = [brush([[236, 430], [232, 510], [228, 580]], [34, 28, 24]), boot(224, 596, { s: 24 }), brush([[272, 430], [278, 510], [282, 580]], [34, 28, 24]), boot(284, 596, { s: 24 })];
const tunic = blob([[222, 262], [254, 250], [290, 262], [300, 330], [306, 450, "c"], [254, 456], [208, 450, "c"], [210, 330]]);
const neck = brush([[254, 230], [254, 256]], [22, 26]);
const head = blob([[230, 196], [250, 180], [274, 186], [282, 206], [290, 216, "c"], [282, 220], [282, 232], [268, 244], [248, 242], [234, 228]]);
const cap = blob([[224, 204, "c"], [230, 182], [252, 170], [276, 176], [286, 196, "c"], [256, 192]]);
// near arm holds the lance; far arm hangs behind the shield
const arm = [brush([[284, 276], [306, 320], [326, 314]], [28, 22, 18]), blob([[318, 300], [342, 298], [344, 322], [320, 326]])];
const shield = blob([[168, 300, "c"], [254, 300, "c"], [254, 380], [236, 430], [211, 456, "c"], [186, 430], [168, 380]]);
// the wolf's head on the shield, facing right, cut out of it
const emblem = blob([[188, 414], [182, 384], [188, 358], [194, 330, "c"], [208, 350], [214, 334, "c"], [222, 354], [238, 362], [250, 370, "c"], [240, 380], [226, 384], [214, 400], [206, 416]]);
const cuts = [
  brush([[266, 206], [276, 208]], [3, 3]),                                    // eye
  brush([[224, 204], [286, 198]], [3, 3]),                                     // cap band
  brush([[212, 390], [298, 386]], [5, 5]),                                     // belt
  brush([[254, 262], [254, 384]], [3, 2]),
];
export default card({ bg, ink, transform: "translate(-40 0) translate(10 -6)", layers: [lance, legs, { d: tunic }, neck, { d: head }, { d: cap }, cuts.map((d) => ({ d, fill: "bg" })),
  { group: arm, halo: 4, roots: [[284, 276, 20]] }, { d: shield, halo: 5 }, { d: rect(211, 304, 74, 6, 0, 2), fill: "bg" }, { d: emblem, fill: "bg" }, { d: brush([[212, 364], [222, 368]], [4, 2]) }] });
