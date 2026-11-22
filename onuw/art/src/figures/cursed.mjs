import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, boot, claws, fringe, card } from "../brush.mjs";
// The cursed: a hooded villager staring in dread at his own raised hand, which has already turned into a
// clawed, furred paw. A wolf's ear pushes up through his hood. Facing right.
const { card: bg, ink } = ROLE_COLORS.cursed;
const legs = [brush([[236, 470], [228, 530], [222, 586]], [34, 30, 26]), boot(222, 598, { s: 24 }),
  brush([[272, 470], [286, 530], [292, 586]], [34, 30, 26]), boot(294, 598, { s: 24 })];
const tunic = blob([[214, 276], [264, 262], [296, 292], [304, 380], [314, 470], [324, 498, "c"], [290, 492], [258, 502], [224, 492], [190, 500, "c"], [198, 430], [202, 350]]);
const hood = blob([[222, 212], [240, 176], [272, 164], [298, 178], [308, 208], [314, 248], [292, 270], [248, 272], [222, 254]]);
const ear = blob([[248, 184], [252, 136, "c"], [276, 172]]);
const face = blob([[290, 186], [306, 192], [312, 208], [324, 220, "c"], [312, 224], [314, 236], [308, 242], [310, 252], [294, 262], [282, 244]]);
// near arm raised in front of him, ending in the paw he is staring at
const arm = [brush([[288, 300], [340, 300], [366, 252]], [30, 26, 24]), ...fringe([[300, 300], [340, 296], [362, 256]], { n: 6, len: [12, 22], w: 10, side: -1, seed: 4 })];
const paw = claws([372, 228], -80, { size: .8, spread: 80, curl: 22, len: 50 });
const cuts = [
  brush([[290, 184], [282, 222], [292, 262]], [5, 6, 3]),                           // hood opening
  `M306 206m-6 0a6 6 0 1 0 12 0a6 6 0 1 0 -12 0z`,                                   // eye wide open in fear
  brush([[306, 244], [314, 248]], [4, 3]),                                          // mouth agape
  brush([[240, 340], [232, 420], [222, 492]], [3, 5, 2]), brush([[278, 340], [288, 420], [294, 492]], [3, 5, 2]),  // tunic folds
  brush([[204, 400], [306, 396]], [5, 5]),                                          // belt
];
export default card({ bg, ink, transform: "translate(-54 0)", layers: [legs, { d: tunic }, { d: ear }, { d: hood }, { d: face }, cuts.map((d) => ({ d, fill: "bg" })),
  { group: [...arm, ...paw], halo: 4, roots: [[288, 300, 24]] }] });
