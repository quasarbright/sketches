import { ROLE_COLORS } from "../../../skin.mjs";
import { blob, brush, boot, card } from "../brush.mjs";
// The investigator: a man in a long coat and a wide-brimmed hat, peering through a magnifying glass
// held up to his eye. Facing right.
const { card: bg, ink } = ROLE_COLORS.investigator;
const legs = [brush([[228, 470], [216, 530], [206, 588]], [32, 28, 24]), boot(206, 600, { s: 22 }), brush([[262, 470], [282, 530], [296, 588]], [32, 28, 24]), boot(298, 600, { s: 22 })];
const coat = blob([[214, 284], [262, 270], [300, 296], [314, 380], [322, 470], [334, 520, "c"], [296, 512], [262, 522], [222, 512], [186, 520, "c"], [196, 440], [200, 360]]);
const collar = blob([[224, 282], [262, 262], [300, 284], [292, 312], [262, 296], [232, 310]]);
const neck = brush([[266, 240], [270, 272]], [24, 28]);
const head = blob([[244, 216], [256, 198], [282, 194], [300, 206], [306, 224], [318, 238, "c"], [306, 242], [308, 254], [302, 260], [302, 268], [288, 276], [264, 274], [248, 258]]);
const hat = [blob([[236, 210, "c"], [240, 178], [262, 164], [290, 166], [302, 184], [304, 208, "c"]]), brush([[206, 210], [270, 206], [336, 214]], [5, 14, 5])];
// near arm bent up, the fist round the handle under his chin, lens raised in front of his eye
const arm = [brush([[284, 300], [306, 356], [338, 318]], [28, 22, 18]), blob([[330, 300], [350, 298], [354, 322], [334, 326]])];
const glass = [brush([[342, 312], [346, 268]], [9, 9]), `M348 242m-27 0a27 27 0 1 0 54 0a27 27 0 1 0 -54 0z`];
const lens = `M348 242m-19 0a19 19 0 1 0 38 0a19 19 0 1 0 -38 0z`;
const cuts = [
  brush([[290, 222], [300, 222]], [4, 3]),                                  // eye, squinting
  brush([[294, 262], [302, 262]], [2, 1]),                                  // mouth
  brush([[240, 200], [302, 200]], [5, 5]),                                  // hat band
  brush([[246, 330], [238, 420], [230, 510]], [3, 5, 2]), brush([[284, 330], [296, 420], [306, 510]], [3, 5, 2]),
  brush([[200, 400], [316, 396]], [5, 5]),                                  // belt
];
export default card({ bg, ink, transform: "translate(-31 -10)", layers: [legs, { d: coat }, neck, { d: head }, hat, { d: collar }, cuts.map((d) => ({ d, fill: "bg" })),
  { group: glass, halo: 4 }, { d: lens, fill: "bg" }, brush([[338, 232], [344, 226]], [3, 3]), { group: arm, halo: 4, roots: [[284, 300, 22]] }] });
