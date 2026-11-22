import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, boot, card } from "../brush.mjs";
// The apprentice skinner: a skinny boy in a cap and an apron too big for him, hauling a rolled-up hide over
// his shoulder for his master. Facing right.
const { card: bg, ink } = ROLE_COLORS.apprentice;
const legs = [brush([[236, 480], [228, 536], [222, 588]], [28, 24, 20]), boot(222, 600, { s: 20 }), brush([[266, 480], [280, 536], [288, 588]], [28, 24, 20]), boot(290, 600, { s: 20 })];
const tunic = blob([[222, 310], [262, 300], [288, 322], [294, 400], [298, 470], [304, 492, "c"], [274, 486], [248, 494], [222, 486], [200, 492, "c"], [206, 420], [210, 360]]);
const apron = blob([[236, 340], [292, 338], [300, 420], [306, 520], [244, 524], [232, 440]]);
const neck = brush([[260, 272], [262, 300]], [20, 24]);
const head = blob([[238, 246], [250, 226], [274, 220], [292, 232], [298, 252], [308, 264, "c"], [298, 268], [300, 278], [294, 284], [294, 292], [280, 298], [258, 296], [242, 280]]);
const cap = blob([[232, 256, "c"], [234, 226], [256, 208], [284, 208], [300, 224], [314, 236, "c"], [270, 236], [248, 250]]);
// the rolled hide over his far shoulder, steadied by the far hand reaching back up to it; the near arm hangs
const roll = [brush([[160, 266], [210, 258], [280, 264], [346, 276]], [36, 42, 42, 36]), blob([[340, 260], [356, 264], [358, 288], [342, 292]])];
const farArm = [brush([[230, 318], [200, 334], [214, 290]], [24, 20, 16]), blob([[204, 270], [226, 266], [230, 286], [210, 292]])];
const arm = [brush([[262, 330], [276, 396], [282, 446]], [24, 20, 16]), blob([[272, 440], [292, 438], [296, 460], [280, 468], [270, 456]])];
const cuts = [
  brush([[284, 250], [294, 250]], [4, 3]),                                   // eye
  brush([[286, 284], [294, 284]], [2, 1]),                                   // mouth
  brush([[168, 264], [176, 252], [188, 252], [194, 266], [188, 278], [178, 278]], [3, 3, 3, 3, 3, 2]),   // the roll's spiral end
  brush([[264, 380], [268, 510]], [3, 2]),                                  // apron fold
  brush([[214, 352], [300, 350]], [4, 4]),                                  // apron tie
];
export default card({ bg, ink, transform: "translate(0 -20)", layers: [{ group: farArm, halo: 3 }, legs, { d: tunic }, { d: apron }, { group: roll }, { group: farArm.slice(1), halo: 3 }, neck, { group: [head, cap], halo: 4 }, cuts.map((d) => ({ d, fill: "bg" })),
  { group: arm, halo: 3, roots: [[262, 330, 16]] }] });
