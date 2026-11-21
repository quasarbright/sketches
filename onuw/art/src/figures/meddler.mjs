import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, fringe, rect, card } from "../brush.mjs";
// The meddler: a grinning trickster in a long-tailed cowl, mid-skip, swapping two cards between raised hands.
const { card: bg, ink } = ROLE_COLORS.meddler;
const backLeg = [brush([[262, 420], [306, 460], [336, 440]], [50, 40, 32]), blob([[326, 426], [352, 420], [372, 432], [340, 450]])];
const torso = blob([[218, 280], [256, 266], [292, 284], [298, 340], [290, 410], [226, 414], [212, 350]]);
const frontLeg = [brush([[240, 400], [228, 480], [214, 560]], [56, 44, 34], { capStart: "butt" }), blob([[178, 552], [222, 548], [234, 570], [176, 574]])];
const head = blob([[214, 186], [244, 164], [280, 168], [302, 196], [300, 236], [280, 260], [248, 264], [222, 248], [210, 220]]);
const hair = [blob([[204, 214, "c"], [208, 176], [236, 156], [272, 154], [300, 170], [312, 206, "c"], [258, 186]]), brush([[288, 164], [318, 140], [334, 108], [326, 84]], [30, 20, 12, 4]), blob([[314, 74], [336, 74], [338, 94], [318, 96]]),
  ...[0, 1, 2, 3, 4].map((i) => blob([[196 + i * 26, 262], [222 + i * 26, 262], [209 + i * 26, 292, "c"]]))];
const ears = [blob([[206, 210], [176, 194, "c"], [204, 226]]), blob([[302, 210], [334, 192, "c"], [300, 228]])];
const arms = [brush([[226, 292], [190, 260], [160, 206]], [34, 26, 22], { capStart: "butt" }), blob([[146, 196], [168, 190], [174, 210], [154, 216]]),
  brush([[288, 292], [324, 262], [348, 210]], [34, 26, 22], { capStart: "butt" }), blob([[336, 198], [360, 194], [362, 216], [342, 220]])];
const cardA = rect(150, 164, 46, 66, -20, 7), cardB = rect(360, 164, 46, 66, 20, 7);
// the swap: two arcs with arrowheads
const arc1 = brush([[184, 128], [256, 102], [326, 124]], [5, 7, 5]), arc2 = brush([[334, 226], [256, 250], [178, 228]], [0, 0, 0]);
const head1 = blob([[330, 110, "c"], [342, 138, "c"], [312, 132]]);
const cuts = [
  brush([[234, 210], [248, 206]], [6, 3]), brush([[266, 206], [280, 210]], [3, 6]),   // sly eyes
  brush([[236, 232], [258, 244], [284, 230]], [3, 5, 3]),                         // grin
  brush([[226, 340], [294, 340]], [4, 4]),                                        // waist
  brush([[256, 286], [252, 340]], [3, 3]),
];
export default card({ bg, ink, transform: "translate(0 30)", layers: [backLeg, { d: torso }, { group: frontLeg, halo: 4 }, hair, ears, { d: head }, cuts.map((d) => ({ d, fill: "bg" })),
  { group: arms }, { d: arc1 }, { d: head1 },
  [cardA, cardB].map((d) => ({ d, halo: 4 })), [[150, -20], [360, 20]].map(([x, a]) => ({ d: rect(x, 164, 36, 56, a, 5), fill: "bg" })), [[150, -20], [360, 20]].map(([x, a]) => ({ d: rect(x, 164, 30, 50, a, 4) })),
  [[150, -20], [360, 20]].map(([x, a]) => ({ d: rect(x, 164, 14, 14, a + 45, 2), fill: "bg" }))] });
