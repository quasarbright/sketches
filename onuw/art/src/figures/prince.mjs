import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, boot, card } from "../brush.mjs";
// The prince: a young noble in a crown and a long cape, standing tall with his hand resting on the pommel of
// a sword planted point-down beside him. Facing right.
const { card: bg, ink } = ROLE_COLORS.prince;
const legs = [brush([[238, 460], [232, 524], [228, 584]], [32, 28, 24]), boot(230, 598, { s: 24 }),
  brush([[272, 460], [284, 524], [292, 584]], [32, 28, 24]), boot(296, 598, { s: 24 })];
const cape = blob([[214, 262], [252, 246], [262, 290], [244, 400], [224, 520], [196, 600, "c"], [150, 596], [168, 520], [186, 420], [196, 320]]);
const tunic = blob([[222, 262], [268, 252], [298, 278], [306, 360], [310, 450], [318, 476, "c"], [282, 468], [250, 476], [216, 468], [204, 476, "c"], [210, 400], [212, 320]]);
const neck = brush([[262, 226], [264, 256]], [24, 28]);
const head = blob([[236, 198], [250, 178], [276, 172], [296, 186], [302, 208], [314, 222, "c"], [302, 226], [304, 238], [298, 244], [298, 252], [282, 260], [258, 256], [240, 238]]);
const hair = blob([[230, 214], [234, 184], [258, 168], [286, 170], [298, 186], [272, 190], [256, 206], [250, 232], [238, 236]]);
// crown: a band with three points
const crown = blob([[244, 180, "c"], [242, 140, "c"], [256, 158], [268, 130, "c"], [280, 158], [294, 140, "c"], [294, 180, "c"]]);
const arm = [brush([[284, 280], [314, 334], [336, 380]], [28, 22, 18]), blob([[326, 372], [350, 370], [354, 394], [330, 398]])];
const sword = [brush([[340, 400], [342, 596]], [16, 4]), brush([[312, 404], [370, 404]], [12, 12]), `M340 380m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0z`];
const cuts = [
  brush([[286, 204], [298, 204]], [4, 3]),                                          // eye
  brush([[290, 244], [300, 244]], [2, 1]),                                          // mouth
  brush([[244, 170], [294, 170]], [4, 4]),                                          // crown band
  brush([[262, 300], [260, 452]], [3, 2]), brush([[208, 392], [308, 388]], [6, 6]),  // tunic front, belt
  brush([[210, 300], [194, 440], [176, 580]], [3, 5, 2]),                           // cape fold
];
export default card({ bg, ink, transform: "translate(-18 0)", layers: [{ d: cape }, legs, { d: tunic }, neck, { d: head }, { d: hair }, { d: crown }, cuts.map((d) => ({ d, fill: "bg" })),
  { group: sword, halo: 4 }, { group: arm, halo: 4, roots: [[284, 280, 22]] }] });
