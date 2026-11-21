import { blob, brush, fringe, card } from "../brush.mjs";
// A villager leaning on a pitchfork with his ankles crossed, in a floppy hat and a vest.
const bg = "#3f84c8", ink = "#122f52";
const fork = [brush([[372, 606], [358, 300], [350, 196]], [13, 12, 12], { cap: "butt" }),
  brush([[322, 198], [350, 204], [378, 194]], [11, 13, 11]),
  ...[322, 350, 378].map((x, i) => brush([[x, 198], [x + (i - 1) * 3, 156], [x + (i - 1) * 7, 118]], [10, 8, 2]))];
const farLeg = brush([[272, 414], [270, 500], [262, 584]], [52, 40, 32]);
const farBoot = blob([[240, 572], [282, 570], [306, 594], [300, 608], [242, 608]]);
const torso = blob([[224, 258], [264, 240], [306, 248], [318, 300], [304, 360], [290, 430], [214, 432], [212, 370], [214, 310]]);
const nearLeg = brush([[236, 400], [242, 480], [296, 540], [324, 586]], [58, 44, 36, 32], { capStart: "butt" });
const hips = blob([[214, 400], [292, 396], [296, 440], [254, 450], [214, 440]]);
const nearBoot = blob([[306, 576], [336, 566], [366, 590], [362, 604], [310, 606]]);
const neck = brush([[276, 218], [272, 252]], [30, 32]);
const head = blob([[250, 186], [276, 172], [304, 178], [312, 202], [322, 218, "c"], [312, 222], [314, 234], [306, 248], [286, 256], [262, 246], [250, 220]]);
const beard = blob([[268, 236], [292, 248], [312, 238], [312, 262], [296, 276], [276, 268]]);
const hair = fringe([[256, 190], [250, 220], [258, 244]], { n: 5, len: [10, 20], w: 12, side: 1, lean: .6, seed: 2 });
const hat = [blob([[196, 192, "c"], [228, 170], [270, 160], [320, 164], [344, 182, "c"], [318, 184], [272, 184], [226, 196]]),
  blob([[234, 176], [236, 132], [266, 116], [300, 126], [308, 172]])];
// both hands rest on the handle, near arm across the body
const farArm = [brush([[304, 262], [330, 300], [348, 292]], [38, 30, 24]), blob([[340, 274], [366, 276], [368, 300], [344, 306]])];
const nearArm = [brush([[234, 270], [240, 336], [300, 330], [340, 316]], [42, 34, 28, 24], { capStart: "butt" }), blob([[330, 300], [364, 304], [366, 330], [334, 334]])];
const shoulder = blob([[214, 262], [254, 250], [262, 290], [226, 300]]);
const cuts = [
  brush([[270, 258], [266, 320], [258, 420]], [4, 4, 3]),                             // shirt front
  brush([[244, 266], [248, 330], [240, 420]], [5, 5, 4]), brush([[296, 262], [292, 320], [280, 420]], [5, 5, 4]), // vest edges
  ...[296, 386, 408].map((y, i) => blob([[264 - i * 2, y - 5], [272 - i * 2, y - 5], [272 - i * 2, y + 5], [264 - i * 2, y + 5]])), // buttons
  brush([[214, 424], [292, 424]], [5, 5]),                                             // belt
  brush([[240, 172], [306, 166]], [4, 4]),                                             // hat band
  brush([[294, 206], [306, 204]], [4, 3]),                                             // eye
  brush([[350, 312], [366, 310]], [3, 3]),                                             // knuckles
  brush([[234, 352], [256, 344], [298, 338]], [3, 3, 2]),                              // sleeve crease
];
export default card({ bg, ink, transform: "translate(-24 0)", layers: [fork, farLeg, farBoot, { group: farArm }, { d: torso }, neck, hair, { d: head }, { d: beard }, hat,
  { group: [nearLeg, nearBoot], halo: 4 }, { d: hips }, cuts.map((d) => ({ d, fill: "bg" })), { group: nearArm, halo: 4 }, { d: shoulder }] });
